var Eb=Object.defineProperty;var Ab=(e,t,s)=>t in e?Eb(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var St=(e,t,s)=>Ab(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Rb{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new vo("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new mc(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new vo("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new mc((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new mc((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new vo((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof vo?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class vo extends Error{constructor(t){super(t),this.name="AuthError"}}class mc extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Ib{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const j=new Rb,ut=new Ib(j);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ks(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const it={},Ti=[],us=()=>{},ki=()=>!1,Xn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Tr=e=>e.startsWith("onUpdate:"),at=Object.assign,Ld=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Ob=Object.prototype.hasOwnProperty,gt=(e,t)=>Ob.call(e,t),Oe=Array.isArray,Ei=e=>Ki(e)==="[object Map]",ei=e=>Ki(e)==="[object Set]",Xu=e=>Ki(e)==="[object Date]",Lb=e=>Ki(e)==="[object RegExp]",ze=e=>typeof e=="function",Ke=e=>typeof e=="string",ws=e=>typeof e=="symbol",mt=e=>e!==null&&typeof e=="object",Nd=e=>(mt(e)||ze(e))&&ze(e.then)&&ze(e.catch),cm=Object.prototype.toString,Ki=e=>cm.call(e),Nb=e=>Ki(e).slice(8,-1),Er=e=>Ki(e)==="[object Object]",Ar=e=>Ke(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ya=Ks(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Mb=Ks("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Rr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Db=/-\w/g,wt=Rr(e=>e.replace(Db,t=>t.slice(1).toUpperCase())),Pb=/\B([A-Z])/g,$s=Rr(e=>e.replace(Pb,"-$1").toLowerCase()),ti=Rr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ai=Rr(e=>e?`on${ti(e)}`:""),as=(e,t)=>!Object.is(e,t),Ri=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},dm=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Ir=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Jo=e=>{const t=Ke(e)?Number(e):NaN;return isNaN(t)?e:t};let ep;const Or=()=>ep||(ep=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function $b(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Fb="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Ub=Ks(Fb);function Ql(e){if(Oe(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Ke(a)?um(a):Ql(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Ke(e)||mt(e))return e}const Bb=/;(?![^(]*\))/g,zb=/:([^]+)/,Hb=/\/\*[^]*?\*\//g;function um(e){const t={};return e.replace(Hb,"").split(Bb).forEach(s=>{if(s){const a=s.split(zb);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function Xl(e){let t="";if(Ke(e))t=e;else if(Oe(e))for(let s=0;s<e.length;s++){const a=Xl(e[s]);a&&(t+=a+" ")}else if(mt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function jb(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ke(t)&&(e.class=Xl(t)),s&&(e.style=Ql(s)),e}const Vb="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",qb="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Gb="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Wb="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Kb=Ks(Vb),Jb=Ks(qb),Zb=Ks(Gb),Yb=Ks(Wb),Qb="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Xb=Ks(Qb);function pm(e){return!!e||e===""}function ey(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=tn(e[a],t[a]);return s}function tn(e,t){if(e===t)return!0;let s=Xu(e),a=Xu(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=ws(e),a=ws(t),s||a)return e===t;if(s=Oe(e),a=Oe(t),s||a)return s&&a?ey(e,t):!1;if(s=mt(e),a=mt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!tn(e[l],t[l]))return!1}}return String(e)===String(t)}function Lr(e,t){return e.findIndex(s=>tn(s,t))}const fm=e=>!!(e&&e.__v_isRef===!0),mm=e=>Ke(e)?e:e==null?"":Oe(e)||mt(e)&&(e.toString===cm||!ze(e.toString))?fm(e)?mm(e.value):JSON.stringify(e,hm,2):String(e),hm=(e,t)=>fm(t)?hm(e,t.value):Ei(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[hc(a,i)+" =>"]=n,s),{})}:ei(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>hc(s))}:ws(t)?hc(t):mt(t)&&!Oe(t)&&!Er(t)?String(t):t,hc=(e,t="")=>{var s;return ws(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function ty(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Xt;class Md{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Xt&&(Xt.active?(this.parent=Xt,this.index=(Xt.scopes||(Xt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Xt;try{return Xt=this,t()}finally{Xt=s}}}on(){++this._on===1&&(this.prevScope=Xt,Xt=this)}off(){if(this._on>0&&--this._on===0){if(Xt===this)Xt=this.prevScope;else{let t=Xt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function sy(e){return new Md(e)}function vm(){return Xt}function ay(e,t=!1){Xt&&Xt.cleanups.push(e)}let Rt;const vc=new WeakSet;class Ol{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Xt&&(Xt.active?Xt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,vc.has(this)&&(vc.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||bm(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,tp(this),ym(this);const t=Rt,s=fa;Rt=this,fa=!0;try{return this.fn()}finally{xm(this),Rt=t,fa=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)$d(t);this.deps=this.depsTail=void 0,tp(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?vc.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Gc(this)&&this.run()}get dirty(){return Gc(this)}}let gm=0,_l,wl;function bm(e,t=!1){if(e.flags|=8,t){e.next=wl,wl=e;return}e.next=_l,_l=e}function Dd(){gm++}function Pd(){if(--gm>0)return;if(wl){let t=wl;for(wl=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;_l;){let t=_l;for(_l=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function ym(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function xm(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),$d(a),ny(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Gc(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(_m(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function _m(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ll)||(e.globalVersion=Ll,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Gc(e))))return;e.flags|=2;const t=e.dep,s=Rt,a=fa;Rt=e,fa=!0;try{ym(e);const n=e.fn(e._value);(t.version===0||as(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{Rt=s,fa=a,xm(e),e.flags&=-3}}function $d(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)$d(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function ny(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function iy(e,t){e.effect instanceof Ol&&(e=e.effect.fn);const s=new Ol(e);t&&at(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function ly(e){e.effect.stop()}let fa=!0;const wm=[];function sn(){wm.push(fa),fa=!1}function an(){const e=wm.pop();fa=e===void 0?!0:e}function tp(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Rt;Rt=void 0;try{t()}finally{Rt=s}}}let Ll=0;class oy{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Nr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Rt||!fa||Rt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Rt)s=this.activeLink=new oy(Rt,this),Rt.deps?(s.prevDep=Rt.depsTail,Rt.depsTail.nextDep=s,Rt.depsTail=s):Rt.deps=Rt.depsTail=s,km(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=Rt.depsTail,s.nextDep=void 0,Rt.depsTail.nextDep=s,Rt.depsTail=s,Rt.deps===s&&(Rt.deps=a)}return s}trigger(t){this.version++,Ll++,this.notify(t)}notify(t){Dd();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Pd()}}}function km(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)km(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Zo=new WeakMap,Vn=Symbol(""),Wc=Symbol(""),Nl=Symbol("");function ys(e,t,s){if(fa&&Rt){let a=Zo.get(e);a||Zo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new Nr),n.map=a,n.key=s),n.track()}}function Ga(e,t,s,a,n,i){const l=Zo.get(e);if(!l){Ll++;return}const o=r=>{r&&r.trigger()};if(Dd(),t==="clear")l.forEach(o);else{const r=Oe(e),c=r&&Ar(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Nl||!ws(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Nl)),t){case"add":r?c&&o(l.get("length")):(o(l.get(Vn)),Ei(e)&&o(l.get(Wc)));break;case"delete":r||(o(l.get(Vn)),Ei(e)&&o(l.get(Wc)));break;case"set":Ei(e)&&o(l.get(Vn));break}}Pd()}function ry(e,t){const s=Zo.get(e);return s&&s.get(t)}function fi(e){const t=dt(e);return t===e?t:(ys(t,"iterate",Nl),Us(e)?t:t.map(ha))}function Mr(e){return ys(e=dt(e),"iterate",Nl),e}function Ta(e,t){return Aa(e)?Pi(Qa(e)?ha(t):t):ha(t)}const cy={__proto__:null,[Symbol.iterator](){return gc(this,Symbol.iterator,e=>Ta(this,e))},concat(...e){return fi(this).concat(...e.map(t=>Oe(t)?fi(t):t))},entries(){return gc(this,"entries",e=>(e[1]=Ta(this,e[1]),e))},every(e,t){return Fa(this,"every",e,t,void 0,arguments)},filter(e,t){return Fa(this,"filter",e,t,s=>s.map(a=>Ta(this,a)),arguments)},find(e,t){return Fa(this,"find",e,t,s=>Ta(this,s),arguments)},findIndex(e,t){return Fa(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Fa(this,"findLast",e,t,s=>Ta(this,s),arguments)},findLastIndex(e,t){return Fa(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Fa(this,"forEach",e,t,void 0,arguments)},includes(...e){return bc(this,"includes",e)},indexOf(...e){return bc(this,"indexOf",e)},join(e){return fi(this).join(e)},lastIndexOf(...e){return bc(this,"lastIndexOf",e)},map(e,t){return Fa(this,"map",e,t,void 0,arguments)},pop(){return il(this,"pop")},push(...e){return il(this,"push",e)},reduce(e,...t){return sp(this,"reduce",e,t)},reduceRight(e,...t){return sp(this,"reduceRight",e,t)},shift(){return il(this,"shift")},some(e,t){return Fa(this,"some",e,t,void 0,arguments)},splice(...e){return il(this,"splice",e)},toReversed(){return fi(this).toReversed()},toSorted(e){return fi(this).toSorted(e)},toSpliced(...e){return fi(this).toSpliced(...e)},unshift(...e){return il(this,"unshift",e)},values(){return gc(this,"values",e=>Ta(this,e))}};function gc(e,t,s){const a=Mr(e),n=a[t]();return a!==e&&!Us(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const dy=Array.prototype;function Fa(e,t,s,a,n,i){const l=Mr(e),o=l!==e&&!Us(e),r=l[t];if(r!==dy[t]){const u=r.apply(e,i);return o?ha(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,Ta(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function sp(e,t,s,a){const n=Mr(e),i=n!==e&&!Us(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=Ta(e,c)),s.call(this,c,Ta(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?Ta(e,r):r}function bc(e,t,s){const a=dt(e);ys(a,"iterate",Nl);const n=a[t](...s);return(n===-1||n===!1)&&eo(s[0])?(s[0]=dt(s[0]),a[t](...s)):n}function il(e,t,s=[]){sn(),Dd();const a=dt(e)[t].apply(e,s);return Pd(),an(),a}const uy=Ks("__proto__,__v_isRef,__isVue"),Sm=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ws));function py(e){ws(e)||(e=String(e));const t=dt(this);return ys(t,"has",e),t.hasOwnProperty(e)}class Cm{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Om:Im:i?Rm:Am).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Oe(t);if(!n){let r;if(l&&(r=cy[s]))return r;if(s==="hasOwnProperty")return py}const o=Reflect.get(t,s,Wt(t)?t:a);if((ws(s)?Sm.has(s):uy(s))||(n||ys(t,"get",s),i))return o;if(Wt(o)){const r=l&&Ar(s)?o:o.value;return n&&mt(r)?Yo(r):r}return mt(o)?n?Yo(o):Tn(o):o}}class Tm extends Cm{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Oe(t)&&Ar(s);if(!this._isShallow){const c=Aa(i);if(!Us(a)&&!Aa(a)&&(i=dt(i),a=dt(a)),!l&&Wt(i)&&!Wt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:gt(t,s),r=Reflect.set(t,s,a,Wt(t)?t:n);return t===dt(n)&&(o?as(a,i)&&Ga(t,"set",s,a):Ga(t,"add",s,a)),r}deleteProperty(t,s){const a=gt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ga(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!ws(s)||!Sm.has(s))&&ys(t,"has",s),a}ownKeys(t){return ys(t,"iterate",Oe(t)?"length":Vn),Reflect.ownKeys(t)}}class Em extends Cm{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const fy=new Tm,my=new Em,hy=new Tm(!0),vy=new Em(!0),Kc=e=>e,go=e=>Reflect.getPrototypeOf(e);function gy(e,t,s){return function(...a){const n=this.__v_raw,i=dt(n),l=Ei(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Kc:t?Pi:ha;return!t&&ys(i,"iterate",r?Wc:Vn),at(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function bo(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function by(e,t){const s={get(n){const i=this.__v_raw,l=dt(i),o=dt(n);e||(as(n,o)&&ys(l,"get",n),ys(l,"get",o));const{has:r}=go(l),c=t?Kc:e?Pi:ha;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ys(dt(n),"iterate",Vn),n.size},has(n){const i=this.__v_raw,l=dt(i),o=dt(n);return e||(as(n,o)&&ys(l,"has",n),ys(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=dt(o),c=t?Kc:e?Pi:ha;return!e&&ys(r,"iterate",Vn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return at(s,e?{add:bo("add"),set:bo("set"),delete:bo("delete"),clear:bo("clear")}:{add(n){const i=dt(this),l=go(i),o=dt(n),r=!t&&!Us(n)&&!Aa(n)?o:n;return l.has.call(i,r)||as(n,r)&&l.has.call(i,n)||as(o,r)&&l.has.call(i,o)||(i.add(r),Ga(i,"add",r,r)),this},set(n,i){!t&&!Us(i)&&!Aa(i)&&(i=dt(i));const l=dt(this),{has:o,get:r}=go(l);let c=o.call(l,n);c||(n=dt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?as(i,d)&&Ga(l,"set",n,i):Ga(l,"add",n,i),this},delete(n){const i=dt(this),{has:l,get:o}=go(i);let r=l.call(i,n);r||(n=dt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ga(i,"delete",n,void 0),c},clear(){const n=dt(this),i=n.size!==0,l=n.clear();return i&&Ga(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=gy(n,e,t)}),s}function Dr(e,t){const s=by(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(gt(s,n)&&n in a?s:a,n,i)}const yy={get:Dr(!1,!1)},xy={get:Dr(!1,!0)},_y={get:Dr(!0,!1)},wy={get:Dr(!0,!0)},Am=new WeakMap,Rm=new WeakMap,Im=new WeakMap,Om=new WeakMap;function ky(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Tn(e){return Aa(e)?e:Pr(e,!1,fy,yy,Am)}function Fd(e){return Pr(e,!1,hy,xy,Rm)}function Yo(e){return Pr(e,!0,my,_y,Im)}function Sy(e){return Pr(e,!0,vy,wy,Om)}function Pr(e,t,s,a,n){if(!mt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=ky(Nb(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Qa(e){return Aa(e)?Qa(e.__v_raw):!!(e&&e.__v_isReactive)}function Aa(e){return!!(e&&e.__v_isReadonly)}function Us(e){return!!(e&&e.__v_isShallow)}function eo(e){return e?!!e.__v_raw:!1}function dt(e){const t=e&&e.__v_raw;return t?dt(t):e}function Lm(e){return!gt(e,"__v_skip")&&Object.isExtensible(e)&&dm(e,"__v_skip",!0),e}const ha=e=>mt(e)?Tn(e):e,Pi=e=>mt(e)?Yo(e):e;function Wt(e){return e?e.__v_isRef===!0:!1}function f(e){return Nm(e,!1)}function Ud(e){return Nm(e,!0)}function Nm(e,t){return Wt(e)?e:new Cy(e,t)}class Cy{constructor(t,s){this.dep=new Nr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:dt(t),this._value=s?t:ha(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Us(t)||Aa(t);t=a?t:dt(t),as(t,s)&&(this._rawValue=t,this._value=a?t:ha(t),this.dep.trigger())}}function Ty(e){e.dep&&e.dep.trigger()}function Ea(e){return Wt(e)?e.value:e}function Ey(e){return ze(e)?e():Ea(e)}const Ay={get:(e,t,s)=>t==="__v_raw"?e:Ea(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Wt(n)&&!Wt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Bd(e){return Qa(e)?e:new Proxy(e,Ay)}class Ry{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Nr,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Mm(e){return new Ry(e)}function Iy(e){const t=Oe(e)?new Array(e.length):{};for(const s in e)t[s]=Dm(e,s);return t}class Oy{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=ws(s)?s:String(s),this._raw=dt(t);let n=!0,i=t;if(!Oe(t)||ws(this._key)||!Ar(this._key))do n=!eo(i)||Us(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=Ea(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Wt(this._raw[this._key])){const s=this._object[this._key];if(Wt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return ry(this._raw,this._key)}}class Ly{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Ny(e,t,s){return Wt(e)?e:ze(e)?new Ly(e):mt(e)&&arguments.length>1?Dm(e,t,s):f(e)}function Dm(e,t,s){return new Oy(e,t,s)}class My{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Nr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ll-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&Rt!==this)return bm(this,!0),!0}get value(){const t=this.dep.track();return _m(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Dy(e,t,s=!1){let a,n;return ze(e)?a=e:(a=e.get,n=e.set),new My(a,n,s)}const Py={GET:"get",HAS:"has",ITERATE:"iterate"},$y={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},yo={},Qo=new WeakMap;let bn;function Fy(){return bn}function Pm(e,t=!1,s=bn){if(s){let a=Qo.get(s);a||Qo.set(s,a=[]),a.push(e)}}function Uy(e,t,s=it){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=y=>n?y:Us(y)||n===!1||n===0?Wa(y,1):Wa(y);let d,u,p,m,h=!1,b=!1;if(Wt(e)?(u=()=>e.value,h=Us(e)):Qa(e)?(u=()=>c(e),h=!0):Oe(e)?(b=!0,h=e.some(y=>Qa(y)||Us(y)),u=()=>e.map(y=>{if(Wt(y))return y.value;if(Qa(y))return c(y);if(ze(y))return r?r(y,2):y()})):ze(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){sn();try{p()}finally{an()}}const y=bn;bn=d;try{return r?r(e,3,[m]):e(m)}finally{bn=y}}:u=us,t&&n){const y=u,w=n===!0?1/0:n;u=()=>Wa(y(),w)}const _=vm(),I=()=>{d.stop(),_&&_.active&&Ld(_.effects,d)};if(i&&t){const y=t;t=(...w)=>{const S=y(...w);return I(),S}}let x=b?new Array(e.length).fill(yo):yo;const g=y=>{if(!(!(d.flags&1)||!d.dirty&&!y))if(t){const w=d.run();if(y||n||h||(b?w.some((S,E)=>as(S,x[E])):as(w,x))){p&&p();const S=bn;bn=d;try{const E=[w,x===yo?void 0:b&&x[0]===yo?[]:x,m];x=w,r?r(t,3,E):t(...E)}finally{bn=S}}}else d.run()};return o&&o(g),d=new Ol(u),d.scheduler=l?()=>l(g,!1):g,m=y=>Pm(y,!1,d),p=d.onStop=()=>{const y=Qo.get(d);if(y){if(r)r(y,4);else for(const w of y)w();Qo.delete(d)}},t?a?g(!0):x=d.run():l?l(g.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function Wa(e,t=1/0,s){if(t<=0||!mt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Wt(e))Wa(e.value,t,s);else if(Oe(e))for(let a=0;a<e.length;a++)Wa(e[a],t,s);else if(ei(e)||Ei(e))e.forEach(a=>{Wa(a,t,s)});else if(Er(e)){for(const a in e)Wa(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Wa(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $m=[];function By(e){$m.push(e)}function zy(){$m.pop()}function Hy(e,t){}const jy={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Vy={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ji(e,t,s,a){try{return a?e(...a):e()}catch(n){si(n,t,s)}}function Ws(e,t,s,a){if(ze(e)){const n=Ji(e,t,s,a);return n&&Nd(n)&&n.catch(i=>{si(i,t,s)}),n}if(Oe(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Ws(e[i],t,s,a));return n}}function si(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||it;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){sn(),Ji(i,null,10,[e,r,c]),an();return}}qy(e,s,n,a,l)}function qy(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const Ts=[];let Sa=-1;const Ii=[];let yn=null,yi=0;const Fm=Promise.resolve();let Xo=null;function Ht(e){const t=Xo||Fm;return e?t.then(this?e.bind(this):e):t}function Gy(e){let t=Sa+1,s=Ts.length;for(;t<s;){const a=t+s>>>1,n=Ts[a],i=Dl(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function zd(e){if(!(e.flags&1)){const t=Dl(e),s=Ts[Ts.length-1];!s||!(e.flags&2)&&t>=Dl(s)?Ts.push(e):Ts.splice(Gy(t),0,e),e.flags|=1,Um()}}function Um(){Xo||(Xo=Fm.then(Bm))}function Ml(e){Oe(e)?Ii.push(...e):yn&&e.id===-1?yn.splice(yi+1,0,e):e.flags&1||(Ii.push(e),e.flags|=1),Um()}function ap(e,t,s=Sa+1){for(;s<Ts.length;s++){const a=Ts[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;Ts.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function er(e){if(Ii.length){const t=[...new Set(Ii)].sort((s,a)=>Dl(s)-Dl(a));if(Ii.length=0,yn){yn.push(...t);return}for(yn=t,yi=0;yi<yn.length;yi++){const s=yn[yi];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}yn=null,yi=0}}const Dl=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Bm(e){try{for(Sa=0;Sa<Ts.length;Sa++){const t=Ts[Sa];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ji(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Sa<Ts.length;Sa++){const t=Ts[Sa];t&&(t.flags&=-2)}Sa=-1,Ts.length=0,er(),Xo=null,(Ts.length||Ii.length)&&Bm()}}let xi,xo=[];function zm(e,t){var s,a;xi=e,xi?(xi.enabled=!0,xo.forEach(({event:n,args:i})=>xi.emit(n,...i)),xo=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{zm(i,t)}),setTimeout(()=>{xi||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,xo=[])},3e3)):xo=[]}let ds=null,$r=null;function Pl(e){const t=ds;return ds=e,$r=e&&e.type.__scopeId||null,t}function Wy(e){$r=e}function Ky(){$r=null}const Jy=e=>Hd;function Hd(e,t=ds,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&Bl(-1);const i=Pl(t);let l;try{l=e(...n)}finally{Pl(i),a._d&&Bl(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function Zy(e,t){if(ds===null)return e;const s=no(ds),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=it]=t[n];i&&(ze(i)&&(i={mounted:i,updated:i}),i.deep&&Wa(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function Ca(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(sn(),Ws(r,s,8,[e.el,o,e,t]),an())}}function kl(e,t){if(cs){let s=cs.provides;const a=cs.parent&&cs.parent.provides;a===s&&(s=cs.provides=Object.create(a)),s[e]=t}}function ia(e,t,s=!1){const a=As();if(a||qn){let n=qn?qn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&ze(t)?t.call(a&&a.proxy):t}}function Yy(){return!!(As()||qn)}const Hm=Symbol.for("v-scx"),jm=()=>ia(Hm);function Qy(e,t){return to(e,null,t)}function Xy(e,t){return to(e,null,{flush:"post"})}function Vm(e,t){return to(e,null,{flush:"sync"})}function Kt(e,t,s){return to(e,t,s)}function to(e,t,s=it){const{immediate:a,deep:n,flush:i,once:l}=s,o=at({},s),r=t&&a||!t&&i!=="post";let c;if(Zn){if(i==="sync"){const m=jm();c=m.__watcherHandles||(m.__watcherHandles=[])}else if(!r){const m=()=>{};return m.stop=us,m.resume=us,m.pause=us,m}}const d=cs;o.call=(m,h,b)=>Ws(m,d,h,b);let u=!1;i==="post"?o.scheduler=m=>{qt(m,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(m,h)=>{h?m():zd(m)}),o.augmentJob=m=>{t&&(m.flags|=4),u&&(m.flags|=2,d&&(m.id=d.uid,m.i=d))};const p=Uy(e,t,o);return Zn&&(c?c.push(p):r&&p()),p}function ex(e,t,s){const a=this.proxy,n=Ke(e)?e.includes(".")?qm(a,e):()=>a[e]:e.bind(a,a);let i;ze(t)?i=t:(i=t.handler,s=t);const l=Zi(this),o=to(n,i.bind(a),s);return l(),o}function qm(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const vn=new WeakMap,Gm=Symbol("_vte"),Wm=e=>e.__isTeleport,Bn=e=>e&&(e.disabled||e.disabled===""),tx=e=>e&&(e.defer||e.defer===""),np=e=>typeof SVGElement<"u"&&e instanceof SVGElement,ip=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Jc=(e,t)=>{const s=e&&e.to;return Ke(s)?t?t(s):null:s},sx={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:m,querySelector:h,createText:b,createComment:_,parentNode:I}}=c,x=Bn(t.props);let{dynamicChildren:g}=t;const y=(E,A,k)=>{E.shapeFlag&16&&d(E.children,A,k,n,i,l,o,r)},w=(E=t)=>{const A=Bn(E.props),k=E.target=Jc(E.props,h),O=Zc(k,E,b,m);k&&(l!=="svg"&&np(k)?l="svg":l!=="mathml"&&ip(k)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(k),A||(y(E,k,O),vl(E,!1)))},S=E=>{const A=()=>{if(vn.get(E)===A){if(vn.delete(E),Bn(E.props)){const k=I(E.el)||s;y(E,k,E.anchor),vl(E,!0)}w(E)}};vn.set(E,A),qt(A,i)};if(e==null){const E=t.el=b(""),A=t.anchor=b("");if(m(E,s,a),m(A,s,a),tx(t.props)||i&&i.pendingBranch){S(t);return}x&&(y(t,s,A),vl(t,!0)),w()}else{t.el=e.el;const E=t.anchor=e.anchor,A=vn.get(e);if(A){A.flags|=8,vn.delete(e),S(t);return}t.targetStart=e.targetStart;const k=t.target=e.target,O=t.targetAnchor=e.targetAnchor,B=Bn(e.props),T=B?s:k,$=B?E:O;if(l==="svg"||np(k)?l="svg":(l==="mathml"||ip(k))&&(l="mathml"),g?(p(e.dynamicChildren,g,T,n,i,l,o),Xd(e,t,!0)):r||u(e,t,T,$,n,i,l,o,!1),x)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):_o(t,s,E,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Q=t.target=Jc(t.props,h);Q&&_o(t,Q,null,c,0)}else B&&_o(t,k,O,c,1);vl(t,x)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,m=i||!Bn(p),h=vn.get(e);if(h&&(h.flags|=8,vn.delete(e)),u&&(n(c),n(d)),i&&n(r),!h&&l&16)for(let b=0;b<o.length;b++){const _=o[b];a(_,t,s,m,!!_.dynamicChildren)}},move:_o,hydrate:ax};function _o(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!vn.has(e)&&(!u||Bn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function ax(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(_,I){let x=I;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,_._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function m(_,I){I.anchor=u(l(_),I,o(_),s,a,n,i)}const h=t.target=Jc(t.props,r),b=Bn(t.props);if(h){const _=h._lpa||h.firstChild;t.shapeFlag&16&&(b?(m(e,t),p(h,_),t.targetAnchor||Zc(h,t,d,c,o(e)===h?e:null)):(t.anchor=l(e),p(h,_),t.targetAnchor||Zc(h,t,d,c),u(_&&l(_),t,h,s,a,n,i))),vl(t,b)}else b&&t.shapeFlag&16&&(m(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const nx=sx;function vl(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Zc(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Gm]=l,e&&(a(i,e,n),a(l,e,n)),l}const ta=Symbol("_leaveCb"),ll=Symbol("_enterCb");function jd(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return tt(()=>{e.isMounted=!0}),zr(()=>{e.isUnmounting=!0}),e}const ea=[Function,Array],Vd={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:ea,onEnter:ea,onAfterEnter:ea,onEnterCancelled:ea,onBeforeLeave:ea,onLeave:ea,onAfterLeave:ea,onLeaveCancelled:ea,onBeforeAppear:ea,onAppear:ea,onAfterAppear:ea,onAppearCancelled:ea},Km=e=>{const t=e.subTree;return t.component?Km(t.component):t},ix={name:"BaseTransition",props:Vd,setup(e,{slots:t}){const s=As(),a=jd();return()=>{const n=t.default&&Fr(t.default(),!0),i=n&&n.length?Jm(n):s.subTree?Oh():void 0;if(!i)return;const l=dt(e),{mode:o}=l;if(a.isLeaving)return yc(i);const r=lp(i);if(!r)return yc(i);let c=$i(r,l,a,s,u=>c=u);r.type!==jt&&nn(r,c);let d=s.subTree&&lp(s.subTree);if(d&&d.type!==jt&&!pa(d,r)&&Km(s).type!==jt){let u=$i(d,l,a,s);if(nn(d,u),o==="out-in"&&r.type!==jt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},yc(i);o==="in-out"&&r.type!==jt?u.delayLeave=(p,m,h)=>{const b=Ym(a,d);b[String(d.key)]=d,p[ta]=()=>{m(),p[ta]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{h(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Jm(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==jt){t=s;break}}return t}const Zm=ix;function Ym(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function $i(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:m,onAfterLeave:h,onLeaveCancelled:b,onBeforeAppear:_,onAppear:I,onAfterAppear:x,onAppearCancelled:g}=t,y=String(e.key),w=Ym(s,e),S=(k,O)=>{k&&Ws(k,a,9,O)},E=(k,O)=>{const B=O[1];S(k,O),Oe(k)?k.every(T=>T.length<=1)&&B():k.length<=1&&B()},A={mode:l,persisted:o,beforeEnter(k){let O=r;if(!s.isMounted)if(i)O=_||r;else return;k[ta]&&k[ta](!0);const B=w[y];B&&pa(e,B)&&B.el[ta]&&B.el[ta](),S(O,[k])},enter(k){if(w[y]===e)return;let O=c,B=d,T=u;if(!s.isMounted)if(i)O=I||c,B=x||d,T=g||u;else return;let $=!1;k[ll]=W=>{$||($=!0,W?S(T,[k]):S(B,[k]),A.delayedLeave&&A.delayedLeave(),k[ll]=void 0)};const Q=k[ll].bind(null,!1);O?E(O,[k,Q]):Q()},leave(k,O){const B=String(e.key);if(k[ll]&&k[ll](!0),s.isUnmounting)return O();S(p,[k]);let T=!1;k[ta]=Q=>{T||(T=!0,O(),Q?S(b,[k]):S(h,[k]),k[ta]=void 0,w[B]===e&&delete w[B])};const $=k[ta].bind(null,!1);w[B]=e,m?E(m,[k,$]):$()},clone(k){const O=$i(k,t,s,a,n);return n&&n(O),O}};return A}function yc(e){if(ao(e))return e=Ra(e),e.children=null,e}function lp(e){if(!ao(e))return Wm(e.type)&&e.children?Jm(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&ze(s.default))return s.default()}}function nn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,nn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Fr(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===ns?(l.patchFlag&128&&n++,a=a.concat(Fr(l.children,t,o))):(t||l.type!==jt)&&a.push(o!=null?Ra(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function so(e,t){return ze(e)?at({name:e.name},t,{setup:e}):e}function lx(){const e=As();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function qd(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function ox(e){const t=As(),s=Ud(null);if(t){const n=t.refs===it?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function op(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const tr=new WeakMap;function Oi(e,t,s,a,n=!1){if(Oe(e)){e.forEach((b,_)=>Oi(b,t&&(Oe(t)?t[_]:t),s,a,n));return}if(Xa(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&Oi(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?no(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===it?o.refs={}:o.refs,u=o.setupState,p=dt(u),m=u===it?ki:b=>op(d,b)?!1:gt(p,b),h=(b,_)=>!(_&&op(d,_));if(c!=null&&c!==r){if(rp(t),Ke(c))d[c]=null,m(c)&&(u[c]=null);else if(Wt(c)){const b=t;h(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if(ze(r))Ji(r,o,12,[l,d]);else{const b=Ke(r),_=Wt(r);if(b||_){const I=()=>{if(e.f){const x=b?m(r)?u[r]:d[r]:h()||!e.k?r.value:d[e.k];if(n)Oe(x)&&Ld(x,i);else if(Oe(x))x.includes(i)||x.push(i);else if(b)d[r]=[i],m(r)&&(u[r]=d[r]);else{const g=[i];h(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else b?(d[r]=l,m(r)&&(u[r]=l)):_&&(h(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{I(),tr.delete(e)};x.id=-1,tr.set(e,x),qt(x,s)}else rp(e),I()}}}function rp(e){const t=tr.get(e);t&&(t.flags|=8,tr.delete(e))}let cp=!1;const mi=()=>{cp||(console.error("Hydration completed but contains mismatches."),cp=!0)},rx=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",cx=e=>e.namespaceURI.includes("MathML"),wo=e=>{if(e.nodeType===1){if(rx(e))return"svg";if(cx(e))return"mathml"}},Si=e=>e.nodeType===8;function dx(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,y)=>{if(!y.hasChildNodes()){s(null,g,y),er(),y._vnode=g;return}u(y.firstChild,g,null,null,null),er(),y._vnode=g},u=(g,y,w,S,E,A=!1)=>{A=A||!!y.dynamicChildren;const k=Si(g)&&g.data==="[",O=()=>b(g,y,w,S,E,k),{type:B,ref:T,shapeFlag:$,patchFlag:Q}=y;let W=g.nodeType;y.el=g,Q===-2&&(A=!1,y.dynamicChildren=null);let M=null;switch(B){case kn:W!==3?y.children===""?(r(y.el=n(""),l(g),g),M=g):M=O():(g.data!==y.children&&(mi(),g.data=y.children),M=i(g));break;case jt:x(g)?(M=i(g),I(y.el=g.content.firstChild,g,w)):W!==8||k?M=O():M=i(g);break;case Gn:if(k&&(g=i(g),W=g.nodeType),W===1||W===3){M=g;const L=!y.children.length;for(let D=0;D<y.staticCount;D++)L&&(y.children+=M.nodeType===1?M.outerHTML:M.data),D===y.staticCount-1&&(y.anchor=M),M=i(M);return k?i(M):M}else O();break;case ns:k?M=h(g,y,w,S,E,A):M=O();break;default:if($&1)(W!==1||y.type.toLowerCase()!==g.tagName.toLowerCase())&&!x(g)?M=O():M=p(g,y,w,S,E,A);else if($&6){y.slotScopeIds=E;const L=l(g);if(k?M=_(g):Si(g)&&g.data==="teleport start"?M=_(g,g.data,"teleport end"):M=i(g),t(y,L,null,w,S,wo(L),A),Xa(y)&&!y.type.__asyncResolved){let D;k?(D=Nt(ns),D.anchor=M?M.previousSibling:L.lastChild):D=g.nodeType===3?tu(""):Nt("div"),D.el=g,y.component.subTree=D}}else $&64?W!==8?M=O():M=y.type.hydrate(g,y,w,S,E,A,e,m):$&128&&(M=y.type.hydrate(g,y,w,S,wo(l(g)),E,A,e,u))}return T!=null&&Oi(T,null,S,y),M},p=(g,y,w,S,E,A)=>{A=A||!!y.dynamicChildren;const{type:k,props:O,patchFlag:B,shapeFlag:T,dirs:$,transition:Q}=y,W=k==="input"||k==="option";if(W||B!==-1){$&&Ca(y,null,w,"created");let M=!1;if(x(g)){M=wh(null,Q)&&w&&w.vnode.props&&w.vnode.props.appear;const D=g.content.firstChild;if(M){const le=D.getAttribute("class");le&&(D.$cls=le),Q.beforeEnter(D)}I(D,g,w),y.el=g=D}if(T&16&&!(O&&(O.innerHTML||O.textContent))){let D=m(g.firstChild,y,g,w,S,E,A);for(D&&!ko(g,1)&&mi();D;){const le=D;D=D.nextSibling,o(le)}}else if(T&8){let D=y.children;D[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:le}=g;le!==D&&le!==D.replace(/\r\n|\r/g,`
`)&&(ko(g,0)||mi(),g.textContent=y.children)}if(O){if(W||!A||B&48){const D=g.tagName.includes("-");for(const le in O)(W&&(le.endsWith("value")||le==="indeterminate")||Xn(le)&&!Ya(le)||le[0]==="."||D&&!Ya(le))&&a(g,le,null,O[le],void 0,w)}else if(O.onClick)a(g,"onClick",null,O.onClick,void 0,w);else if(B&4&&Qa(O.style))for(const D in O.style)O.style[D]}let L;(L=O&&O.onVnodeBeforeMount)&&Ms(L,w,y),$&&Ca(y,null,w,"beforeMount"),((L=O&&O.onVnodeMounted)||$||M)&&Th(()=>{L&&Ms(L,w,y),M&&Q.enter(g),$&&Ca(y,null,w,"mounted")},S)}return g.nextSibling},m=(g,y,w,S,E,A,k)=>{k=k||!!y.dynamicChildren;const O=y.children,B=O.length;let T=!1;for(let $=0;$<B;$++){const Q=k?O[$]:O[$]=Ps(O[$]),W=Q.type===kn;g?(W&&!k&&$+1<B&&Ps(O[$+1]).type===kn&&(r(n(g.data.slice(Q.children.length)),w,i(g)),g.data=Q.children),g=u(g,Q,S,E,A,k)):W&&!Q.children?r(Q.el=n(""),w):(T||(T=!0,ko(w,1)||mi()),s(null,Q,w,null,S,E,wo(w),A))}return g},h=(g,y,w,S,E,A)=>{const{slotScopeIds:k}=y;k&&(E=E?E.concat(k):k);const O=l(g),B=m(i(g),y,O,w,S,E,A);return B&&Si(B)&&B.data==="]"?i(y.anchor=B):(mi(),r(y.anchor=c("]"),O,B),B)},b=(g,y,w,S,E,A)=>{if(ko(g.parentElement,1)||mi(),y.el=null,A){const B=_(g);for(;;){const T=i(g);if(T&&T!==B)o(T);else break}}const k=i(g),O=l(g);return o(g),s(null,y,O,k,w,S,wo(O),E),w&&(w.vnode.el=y.el,jr(w,y.el)),k},_=(g,y="[",w="]")=>{let S=0;for(;g;)if(g=i(g),g&&Si(g)&&(g.data===y&&S++,g.data===w)){if(S===0)return i(g);S--}return g},I=(g,y,w)=>{const S=y.parentNode;S&&S.replaceChild(g,y);let E=w;for(;E;)E.vnode.el===y&&(E.vnode.el=E.subTree.el=g),E=E.parent},x=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const dp="data-allow-mismatch",ux={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function ko(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(dp);)e=e.parentElement;const s=e&&e.getAttribute(dp);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(ux[t])}}const px=Or().requestIdleCallback||(e=>setTimeout(e,1)),fx=Or().cancelIdleCallback||(e=>clearTimeout(e)),mx=(e=1e4)=>t=>{const s=px(t,{timeout:e});return()=>fx(s)};function hx(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const vx=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(hx(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},gx=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},bx=(e=[])=>(t,s)=>{Ke(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function yx(e,t){if(Si(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Si(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Xa=e=>!!e.type.__asyncLoader;function xx(e){ze(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,m()),m=()=>{let h;return c||(h=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),r)return new Promise((_,I)=>{r(b,()=>_(p()),()=>I(b),u+1)});throw b}).then(b=>h!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return so({name:"AsyncComponentWrapper",__asyncLoader:m,__asyncHydrate(h,b,_){let I=!1;(b.bu||(b.bu=[])).push(()=>I=!0);const x=()=>{I||_()},g=i?()=>{const y=i(x,w=>yx(h,w));y&&(b.bum||(b.bum=[])).push(y)}:x;d?g():m().then(()=>!b.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const h=cs;if(qd(h),d)return()=>So(d,h);const b=w=>{c=null,si(w,h,13,!a)};if(o&&h.suspense||Zn)return m().then(w=>()=>So(w,h)).catch(w=>(b(w),()=>a?Nt(a,{error:w}):null));const _=f(!1),I=f(),x=f(!!n);let g,y;return _t(()=>{g!=null&&clearTimeout(g),y!=null&&clearTimeout(y)}),n&&(y=setTimeout(()=>{h.isUnmounted||(x.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!h.isUnmounted&&!_.value&&!I.value){const w=new Error(`Async component timed out after ${l}ms.`);b(w),I.value=w}},l)),m().then(()=>{h.isUnmounted||(_.value=!0,h.parent&&ao(h.parent.vnode)&&h.parent.update())}).catch(w=>{if(h.isUnmounted){c=null;return}b(w),I.value=w}),()=>{if(_.value&&d)return So(d,h);if(I.value&&a)return Nt(a,{error:I.value});if(s&&!x.value)return So(s,h)}}})}function So(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=Nt(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ao=e=>e.type.__isKeepAlive,_x={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=As(),a=s.ctx;if(!a.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(x,g,y,w,S)=>{const E=x.component;c(x,g,y,0,o),r(E.vnode,x,g,y,E,o,w,x.slotScopeIds,S),qt(()=>{E.isDeactivated=!1,E.a&&Ri(E.a);const A=x.props&&x.props.onVnodeMounted;A&&Ms(A,E.parent,x)},o)},a.deactivate=x=>{const g=x.component;ar(g.m),ar(g.a),c(x,p,null,1,o),qt(()=>{g.da&&Ri(g.da);const y=x.props&&x.props.onVnodeUnmounted;y&&Ms(y,g.parent,x),g.isDeactivated=!0},o)};function m(x){xc(x),d(x,s,o,!0)}function h(x){n.forEach((g,y)=>{const w=id(Xa(g)?g.type.__asyncResolved||{}:g.type);w&&!x(w)&&b(y)})}function b(x){const g=n.get(x);g&&(!l||!pa(g,l))?m(g):l&&xc(l),n.delete(x),i.delete(x)}Kt(()=>[e.include,e.exclude],([x,g])=>{x&&h(y=>gl(x,y)),g&&h(y=>!gl(g,y))},{flush:"post",deep:!0});let _=null;const I=()=>{_!=null&&(nr(s.subTree.type)?qt(()=>{n.set(_,Co(s.subTree))},s.subTree.suspense):n.set(_,Co(s.subTree)))};return tt(I),Br(I),zr(()=>{n.forEach(x=>{const{subTree:g,suspense:y}=s,w=Co(g);if(x.type===w.type&&x.key===w.key){xc(w);const S=w.component.da;S&&qt(S,y);return}m(x)})}),()=>{if(_=null,!t.default)return l=null;const x=t.default(),g=x[0];if(x.length>1)return l=null,x;if(!ln(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let y=Co(g);if(y.type===jt)return l=null,y;const w=y.type,S=id(Xa(y)?y.type.__asyncResolved||{}:w),{include:E,exclude:A,max:k}=e;if(E&&(!S||!gl(E,S))||A&&S&&gl(A,S))return y.shapeFlag&=-257,l=y,g;const O=y.key==null?w:y.key,B=n.get(O);return y.el&&(y=Ra(y),g.shapeFlag&128&&(g.ssContent=y)),_=O,B?(y.el=B.el,y.component=B.component,y.transition&&nn(y,y.transition),y.shapeFlag|=512,i.delete(O),i.add(O)):(i.add(O),k&&i.size>parseInt(k,10)&&b(i.values().next().value)),y.shapeFlag|=256,l=y,nr(g.type)?g:y}}},wx=_x;function gl(e,t){return Oe(e)?e.some(s=>gl(s,t)):Ke(e)?e.split(",").includes(t):Lb(e)?(e.lastIndex=0,e.test(t)):!1}function ls(e,t){Qm(e,"a",t)}function Jt(e,t){Qm(e,"da",t)}function Qm(e,t,s=cs){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Ur(t,a,s),s){let n=s.parent;for(;n&&n.parent;)ao(n.parent.vnode)&&kx(a,t,s,n),n=n.parent}}function kx(e,t,s,a){const n=Ur(t,e,a,!0);_t(()=>{Ld(a[t],n)},s)}function xc(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Co(e){return e.shapeFlag&128?e.ssContent:e}function Ur(e,t,s=cs,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{sn();const o=Zi(s),r=Ws(t,s,e,l);return o(),an(),r});return a?n.unshift(i):n.push(i),i}}const on=e=>(t,s=cs)=>{(!Zn||e==="sp")&&Ur(e,(...a)=>t(...a),s)},Xm=on("bm"),tt=on("m"),Gd=on("bu"),Br=on("u"),zr=on("bum"),_t=on("um"),eh=on("sp"),th=on("rtg"),sh=on("rtc");function ah(e,t=cs){Ur("ec",e,t)}const Wd="components",Sx="directives";function Cx(e,t){return Kd(Wd,e,!0,t)||e}const nh=Symbol.for("v-ndc");function Tx(e){return Ke(e)?Kd(Wd,e,!1)||e:e||nh}function Ex(e){return Kd(Sx,e)}function Kd(e,t,s=!0,a=!1){const n=ds||cs;if(n){const i=n.type;if(e===Wd){const o=id(i,!1);if(o&&(o===t||o===wt(t)||o===ti(wt(t))))return i}const l=up(n[e]||i[e],t)||up(n.appContext[e],t);return!l&&a?i:l}}function up(e,t){return e&&(e[t]||e[wt(t)]||e[ti(wt(t))])}function Ax(e,t,s,a){let n;const i=s&&s[a],l=Oe(e);if(l||Ke(e)){const o=l&&Qa(e);let r=!1,c=!1;o&&(r=!Us(e),c=Aa(e),e=Mr(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?Pi(ha(e[d])):ha(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(mt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Rx(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Oe(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Ix(e,t,s={},a,n){if(ds.ce||ds.parent&&Xa(ds.parent)&&ds.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ul(),ir(ns,null,[Nt("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ul();const l=i&&Jd(i(s)),o=s.key||l&&l.key,r=ir(ns,{key:(o&&!ws(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Jd(e){return e.some(t=>ln(t)?!(t.type===jt||t.type===ns&&!Jd(t.children)):!0)?e:null}function Ox(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Ai(a)]=e[a];return s}const Yc=e=>e?Mh(e)?no(e):Yc(e.parent):null,Sl=at(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Yc(e.parent),$root:e=>Yc(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Zd(e),$forceUpdate:e=>e.f||(e.f=()=>{zd(e.update)}),$nextTick:e=>e.n||(e.n=Ht.bind(e.proxy)),$watch:e=>ex.bind(e)}),_c=(e,t)=>e!==it&&!e.__isScriptSetup&&gt(e,t),Qc={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(_c(a,t))return l[t]=1,a[t];if(n!==it&&gt(n,t))return l[t]=2,n[t];if(gt(i,t))return l[t]=3,i[t];if(s!==it&&gt(s,t))return l[t]=4,s[t];Xc&&(l[t]=0)}}const c=Sl[t];let d,u;if(c)return t==="$attrs"&&ys(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==it&&gt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,gt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return _c(n,t)?(n[t]=s,!0):a!==it&&gt(a,t)?(a[t]=s,!0):gt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==it&&o[0]!=="$"&&gt(e,o)||_c(t,o)||gt(i,o)||gt(a,o)||gt(Sl,o)||gt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:gt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Lx=at({},Qc,{get(e,t){if(t!==Symbol.unscopables)return Qc.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Ub(t)}});function Nx(){return null}function Mx(){return null}function Dx(e){}function Px(e){}function $x(){return null}function Fx(){}function Ux(e,t){return null}function Bx(){return ih().slots}function zx(){return ih().attrs}function ih(e){const t=As();return t.setupContext||(t.setupContext=Fh(t))}function $l(e){return Oe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Hx(e,t){const s=$l(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Oe(n)||ze(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function jx(e,t){return!e||!t?e||t:Oe(e)&&Oe(t)?e.concat(t):at({},$l(e),$l(t))}function Vx(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function qx(e){const t=As(),s=Zn;let a=e();zl(),s&&Ni(!1);const n=()=>{Zi(t),s&&Ni(!0)},i=()=>{As()!==t&&t.scope.off(),zl(),s&&Ni(!1)};return Nd(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Xc=!0;function Gx(e){const t=Zd(e),s=e.proxy,a=e.ctx;Xc=!1,t.beforeCreate&&pp(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:m,updated:h,activated:b,deactivated:_,beforeDestroy:I,beforeUnmount:x,destroyed:g,unmounted:y,render:w,renderTracked:S,renderTriggered:E,errorCaptured:A,serverPrefetch:k,expose:O,inheritAttrs:B,components:T,directives:$,filters:Q}=t;if(c&&Wx(c,a,null),l)for(const L in l){const D=l[L];ze(D)&&(a[L]=D.bind(s))}if(n){const L=n.call(s,s);mt(L)&&(e.data=Tn(L))}if(Xc=!0,i)for(const L in i){const D=i[L],le=ze(D)?D.bind(s,s):ze(D.get)?D.get.bind(s,s):us,re=!ze(D)&&ze(D.set)?D.set.bind(s):us,z=V({get:le,set:re});Object.defineProperty(a,L,{enumerable:!0,configurable:!0,get:()=>z.value,set:Y=>z.value=Y})}if(o)for(const L in o)lh(o[L],a,s,L);if(r){const L=ze(r)?r.call(s):r;Reflect.ownKeys(L).forEach(D=>{kl(D,L[D])})}d&&pp(d,e,"c");function M(L,D){Oe(D)?D.forEach(le=>L(le.bind(s))):D&&L(D.bind(s))}if(M(Xm,u),M(tt,p),M(Gd,m),M(Br,h),M(ls,b),M(Jt,_),M(ah,A),M(sh,S),M(th,E),M(zr,x),M(_t,y),M(eh,k),Oe(O))if(O.length){const L=e.exposed||(e.exposed={});O.forEach(D=>{Object.defineProperty(L,D,{get:()=>s[D],set:le=>s[D]=le,enumerable:!0})})}else e.exposed||(e.exposed={});w&&e.render===us&&(e.render=w),B!=null&&(e.inheritAttrs=B),T&&(e.components=T),$&&(e.directives=$),k&&qd(e)}function Wx(e,t,s=us){Oe(e)&&(e=ed(e));for(const a in e){const n=e[a];let i;mt(n)?"default"in n?i=ia(n.from||a,n.default,!0):i=ia(n.from||a):i=ia(n),Wt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function pp(e,t,s){Ws(Oe(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function lh(e,t,s,a){let n=a.includes(".")?qm(s,a):()=>s[a];if(Ke(e)){const i=t[e];ze(i)&&Kt(n,i)}else if(ze(e))Kt(n,e.bind(s));else if(mt(e))if(Oe(e))e.forEach(i=>lh(i,t,s,a));else{const i=ze(e.handler)?e.handler.bind(s):t[e.handler];ze(i)&&Kt(n,i,e)}}function Zd(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>sr(r,c,l,!0)),sr(r,t,l)),mt(t)&&i.set(t,r),r}function sr(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&sr(e,i,s,!0),n&&n.forEach(l=>sr(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Kx[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Kx={data:fp,props:mp,emits:mp,methods:bl,computed:bl,beforeCreate:ks,created:ks,beforeMount:ks,mounted:ks,beforeUpdate:ks,updated:ks,beforeDestroy:ks,beforeUnmount:ks,destroyed:ks,unmounted:ks,activated:ks,deactivated:ks,errorCaptured:ks,serverPrefetch:ks,components:bl,directives:bl,watch:Zx,provide:fp,inject:Jx};function fp(e,t){return t?e?function(){return at(ze(e)?e.call(this,this):e,ze(t)?t.call(this,this):t)}:t:e}function Jx(e,t){return bl(ed(e),ed(t))}function ed(e){if(Oe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ks(e,t){return e?[...new Set([].concat(e,t))]:t}function bl(e,t){return e?at(Object.create(null),e,t):t}function mp(e,t){return e?Oe(e)&&Oe(t)?[...new Set([...e,...t])]:at(Object.create(null),$l(e),$l(t??{})):t}function Zx(e,t){if(!e)return t;if(!t)return e;const s=at(Object.create(null),e);for(const a in t)s[a]=ks(e[a],t[a]);return s}function oh(){return{app:null,config:{isNativeTag:ki,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Yx=0;function Qx(e,t){return function(a,n=null){ze(a)||(a=at({},a)),n!=null&&!mt(n)&&(n=null);const i=oh(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Yx++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Bh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&ze(d.install)?(l.add(d),d.install(c,...u)):ze(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const m=c._ceVNode||Nt(a,n);return m.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(m,d):e(m,d,p),r=!0,c._container=d,d.__vue_app__=c,no(m.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Ws(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=qn;qn=c;try{return d()}finally{qn=u}}};return c}}let qn=null;function Xx(e,t,s=it){const a=As(),n=wt(t),i=$s(t),l=rh(e,n),o=Mm((r,c)=>{let d,u=it,p;return Vm(()=>{const m=e[n];as(d,m)&&(d=m,c())}),{get(){return r(),s.get?s.get(d):d},set(m){const h=s.set?s.set(m):m;if(!as(h,d)&&!(u!==it&&as(m,u)))return;const b=a.vnode.props,_=!!(b&&(t in b||n in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${n}`in b||`onUpdate:${i}`in b));_||(d=m,c()),a.emit(`update:${t}`,h),as(m,u)&&(as(m,h)&&!as(h,p)||_&&u!==it&&!as(h,d))&&c(),u=m,p=h}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||it:o,done:!1}:{done:!0}}}},o}const rh=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${wt(t)}Modifiers`]||e[`${$s(t)}Modifiers`];function e0(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||it;let n=s;const i=t.startsWith("update:"),l=i&&rh(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Ke(d)?d.trim():d)),l.number&&(n=s.map(Ir)));let o,r=a[o=Ai(t)]||a[o=Ai(wt(t))];!r&&i&&(r=a[o=Ai($s(t))]),r&&Ws(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Ws(c,e,6,n)}}const t0=new WeakMap;function ch(e,t,s=!1){const a=s?t0:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!ze(e)){const r=c=>{const d=ch(c,t,!0);d&&(o=!0,at(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(mt(e)&&a.set(e,null),null):(Oe(i)?i.forEach(r=>l[r]=null):at(l,i),mt(e)&&a.set(e,l),l)}function Hr(e,t){return!e||!Xn(t)?!1:(t=t.slice(2).replace(/Once$/,""),gt(e,t[0].toLowerCase()+t.slice(1))||gt(e,$s(t))||gt(e,t))}function zo(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:m,ctx:h,inheritAttrs:b}=e,_=Pl(e);let I,x;try{if(s.shapeFlag&4){const y=n||a,w=y;I=Ps(c.call(w,y,d,u,m,p,h)),x=o}else{const y=t;I=Ps(y.length>1?y(u,{attrs:o,slots:l,emit:r}):y(u,null)),x=t.props?o:a0(o)}}catch(y){Cl.length=0,si(y,e,1),I=Nt(jt)}let g=I;if(x&&b!==!1){const y=Object.keys(x),{shapeFlag:w}=g;y.length&&w&7&&(i&&y.some(Tr)&&(x=n0(x,i)),g=Ra(g,x,!1,!0))}return s.dirs&&(g=Ra(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&nn(g,s.transition),I=g,Pl(_),I}function s0(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(ln(n)){if(n.type!==jt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const a0=e=>{let t;for(const s in e)(s==="class"||s==="style"||Xn(s))&&((t||(t={}))[s]=e[s]);return t},n0=(e,t)=>{const s={};for(const a in e)(!Tr(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function i0(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?hp(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(dh(l,a,p)&&!Hr(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?hp(a,l,c):!0:!!l;return!1}function hp(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(dh(t,e,i)&&!Hr(s,i))return!0}return!1}function dh(e,t,s){const a=e[s],n=t[s];return s==="style"&&mt(a)&&mt(n)?!tn(a,n):a!==n}function jr({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const uh={},ph=()=>Object.create(uh),fh=e=>Object.getPrototypeOf(e)===uh;function l0(e,t,s,a=!1){const n={},i=ph();e.propsDefaults=Object.create(null),mh(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Fd(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function o0(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=dt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Hr(e.emitsOptions,p))continue;const m=t[p];if(r)if(gt(i,p))m!==i[p]&&(i[p]=m,c=!0);else{const h=wt(p);n[h]=td(r,o,h,m,e,!1)}else m!==i[p]&&(i[p]=m,c=!0)}}}else{mh(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!gt(t,u)&&((d=$s(u))===u||!gt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=td(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!gt(t,u))&&(delete i[u],c=!0)}c&&Ga(e.attrs,"set","")}function mh(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ya(r))continue;const c=t[r];let d;n&&gt(n,d=wt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Hr(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=dt(s),c=o||it;for(let d=0;d<i.length;d++){const u=i[d];s[u]=td(n,r,u,c[u],e,!gt(c,u))}}return l}function td(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=gt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&ze(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=Zi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===$s(s))&&(a=!0))}return a}const r0=new WeakMap;function hh(e,t,s=!1){const a=s?r0:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!ze(e)){const d=u=>{r=!0;const[p,m]=hh(u,t,!0);at(l,p),m&&o.push(...m)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return mt(e)&&a.set(e,Ti),Ti;if(Oe(i))for(let d=0;d<i.length;d++){const u=wt(i[d]);vp(u)&&(l[u]=it)}else if(i)for(const d in i){const u=wt(d);if(vp(u)){const p=i[d],m=l[u]=Oe(p)||ze(p)?{type:p}:at({},p),h=m.type;let b=!1,_=!0;if(Oe(h))for(let I=0;I<h.length;++I){const x=h[I],g=ze(x)&&x.name;if(g==="Boolean"){b=!0;break}else g==="String"&&(_=!1)}else b=ze(h)&&h.name==="Boolean";m[0]=b,m[1]=_,(b||gt(m,"default"))&&o.push(u)}}const c=[l,o];return mt(e)&&a.set(e,c),c}function vp(e){return e[0]!=="$"&&!Ya(e)}const Yd=e=>e==="_"||e==="_ctx"||e==="$stable",Qd=e=>Oe(e)?e.map(Ps):[Ps(e)],c0=(e,t,s)=>{if(t._n)return t;const a=Hd((...n)=>Qd(t(...n)),s);return a._c=!1,a},vh=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Yd(n))continue;const i=e[n];if(ze(i))t[n]=c0(n,i,a);else if(i!=null){const l=Qd(i);t[n]=()=>l}}},gh=(e,t)=>{const s=Qd(t);e.slots.default=()=>s},bh=(e,t,s)=>{for(const a in t)(s||!Yd(a))&&(e[a]=t[a])},d0=(e,t,s)=>{const a=e.slots=ph();if(e.vnode.shapeFlag&32){const n=t._;n?(bh(a,t,s),s&&dm(a,"_",n,!0)):vh(t,a)}else t&&gh(e,t)},u0=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=it;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:bh(n,t,s):(i=!t.$stable,vh(t,n)),l=t}else t&&(gh(e,t),l={default:1});if(i)for(const o in n)!Yd(o)&&l[o]==null&&delete n[o]},qt=Th;function yh(e){return _h(e)}function xh(e){return _h(e,dx)}function _h(e,t){const s=Or();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:m=us,insertStaticContent:h}=e,b=(R,P,G,de=null,F=null,Z=null,ue=void 0,H=null,te=!!P.dynamicChildren)=>{if(R===P)return;R&&!pa(R,P)&&(de=K(R),Y(R,F,Z,!0),R=null),P.patchFlag===-2&&(te=!1,P.dynamicChildren=null);const{type:se,ref:ye,shapeFlag:he}=P;switch(se){case kn:_(R,P,G,de);break;case jt:I(R,P,G,de);break;case Gn:R==null&&x(P,G,de,ue);break;case ns:T(R,P,G,de,F,Z,ue,H,te);break;default:he&1?w(R,P,G,de,F,Z,ue,H,te):he&6?$(R,P,G,de,F,Z,ue,H,te):(he&64||he&128)&&se.process(R,P,G,de,F,Z,ue,H,te,xe)}ye!=null&&F?Oi(ye,R&&R.ref,Z,P||R,!P):ye==null&&R&&R.ref!=null&&Oi(R.ref,null,Z,R,!0)},_=(R,P,G,de)=>{if(R==null)a(P.el=o(P.children),G,de);else{const F=P.el=R.el;P.children!==R.children&&c(F,P.children)}},I=(R,P,G,de)=>{R==null?a(P.el=r(P.children||""),G,de):P.el=R.el},x=(R,P,G,de)=>{[R.el,R.anchor]=h(R.children,P,G,de,R.el,R.anchor)},g=({el:R,anchor:P},G,de)=>{let F;for(;R&&R!==P;)F=p(R),a(R,G,de),R=F;a(P,G,de)},y=({el:R,anchor:P})=>{let G;for(;R&&R!==P;)G=p(R),n(R),R=G;n(P)},w=(R,P,G,de,F,Z,ue,H,te)=>{if(P.type==="svg"?ue="svg":P.type==="math"&&(ue="mathml"),R==null)S(P,G,de,F,Z,ue,H,te);else{const se=R.el&&R.el._isVueCE?R.el:null;try{se&&se._beginPatch(),k(R,P,F,Z,ue,H,te)}finally{se&&se._endPatch()}}},S=(R,P,G,de,F,Z,ue,H)=>{let te,se;const{props:ye,shapeFlag:he,transition:me,dirs:be}=R;if(te=R.el=l(R.type,Z,ye&&ye.is,ye),he&8?d(te,R.children):he&16&&A(R.children,te,null,de,F,wc(R,Z),ue,H),be&&Ca(R,null,de,"created"),E(te,R,R.scopeId,ue,de),ye){for(const Ge in ye)Ge!=="value"&&!Ya(Ge)&&i(te,Ge,null,ye[Ge],Z,de);"value"in ye&&i(te,"value",null,ye.value,Z),(se=ye.onVnodeBeforeMount)&&Ms(se,de,R)}be&&Ca(R,null,de,"beforeMount");const Pe=wh(F,me);Pe&&me.beforeEnter(te),a(te,P,G),((se=ye&&ye.onVnodeMounted)||Pe||be)&&qt(()=>{try{se&&Ms(se,de,R),Pe&&me.enter(te),be&&Ca(R,null,de,"mounted")}finally{}},F)},E=(R,P,G,de,F)=>{if(G&&m(R,G),de)for(let Z=0;Z<de.length;Z++)m(R,de[Z]);if(F){let Z=F.subTree;if(P===Z||nr(Z.type)&&(Z.ssContent===P||Z.ssFallback===P)){const ue=F.vnode;E(R,ue,ue.scopeId,ue.slotScopeIds,F.parent)}}},A=(R,P,G,de,F,Z,ue,H,te=0)=>{for(let se=te;se<R.length;se++){const ye=R[se]=H?Va(R[se]):Ps(R[se]);b(null,ye,P,G,de,F,Z,ue,H)}},k=(R,P,G,de,F,Z,ue)=>{const H=P.el=R.el;let{patchFlag:te,dynamicChildren:se,dirs:ye}=P;te|=R.patchFlag&16;const he=R.props||it,me=P.props||it;let be;if(G&&Dn(G,!1),(be=me.onVnodeBeforeUpdate)&&Ms(be,G,P,R),ye&&Ca(P,R,G,"beforeUpdate"),G&&Dn(G,!0),(he.innerHTML&&me.innerHTML==null||he.textContent&&me.textContent==null)&&d(H,""),se?O(R.dynamicChildren,se,H,G,de,wc(P,F),Z):ue||D(R,P,H,null,G,de,wc(P,F),Z,!1),te>0){if(te&16)B(H,he,me,G,F);else if(te&2&&he.class!==me.class&&i(H,"class",null,me.class,F),te&4&&i(H,"style",he.style,me.style,F),te&8){const Pe=P.dynamicProps;for(let Ge=0;Ge<Pe.length;Ge++){const De=Pe[Ge],Be=he[De],Ve=me[De];(Ve!==Be||De==="value")&&i(H,De,Be,Ve,F,G)}}te&1&&R.children!==P.children&&d(H,P.children)}else!ue&&se==null&&B(H,he,me,G,F);((be=me.onVnodeUpdated)||ye)&&qt(()=>{be&&Ms(be,G,P,R),ye&&Ca(P,R,G,"updated")},de)},O=(R,P,G,de,F,Z,ue)=>{for(let H=0;H<P.length;H++){const te=R[H],se=P[H],ye=te.el&&(te.type===ns||!pa(te,se)||te.shapeFlag&198)?u(te.el):G;b(te,se,ye,null,de,F,Z,ue,!0)}},B=(R,P,G,de,F)=>{if(P!==G){if(P!==it)for(const Z in P)!Ya(Z)&&!(Z in G)&&i(R,Z,P[Z],null,F,de);for(const Z in G){if(Ya(Z))continue;const ue=G[Z],H=P[Z];ue!==H&&Z!=="value"&&i(R,Z,H,ue,F,de)}"value"in G&&i(R,"value",P.value,G.value,F)}},T=(R,P,G,de,F,Z,ue,H,te)=>{const se=P.el=R?R.el:o(""),ye=P.anchor=R?R.anchor:o("");let{patchFlag:he,dynamicChildren:me,slotScopeIds:be}=P;be&&(H=H?H.concat(be):be),R==null?(a(se,G,de),a(ye,G,de),A(P.children||[],G,ye,F,Z,ue,H,te)):he>0&&he&64&&me&&R.dynamicChildren&&R.dynamicChildren.length===me.length?(O(R.dynamicChildren,me,G,F,Z,ue,H),(P.key!=null||F&&P===F.subTree)&&Xd(R,P,!0)):D(R,P,G,ye,F,Z,ue,H,te)},$=(R,P,G,de,F,Z,ue,H,te)=>{P.slotScopeIds=H,R==null?P.shapeFlag&512?F.ctx.activate(P,G,de,ue,te):Q(P,G,de,F,Z,ue,te):W(R,P,te)},Q=(R,P,G,de,F,Z,ue)=>{const H=R.component=Nh(R,de,F);if(ao(R)&&(H.ctx.renderer=xe),Dh(H,!1,ue),H.asyncDep){if(F&&F.registerDep(H,M,ue),!R.el){const te=H.subTree=Nt(jt);I(null,te,P,G),R.placeholder=te.el}}else M(H,R,P,G,F,Z,ue)},W=(R,P,G)=>{const de=P.component=R.component;if(i0(R,P,G))if(de.asyncDep&&!de.asyncResolved){L(de,P,G);return}else de.next=P,de.update();else P.el=R.el,de.vnode=P},M=(R,P,G,de,F,Z,ue)=>{const H=()=>{if(R.isMounted){let{next:he,bu:me,u:be,parent:Pe,vnode:Ge}=R;{const Je=kh(R);if(Je){he&&(he.el=Ge.el,L(R,he,ue)),Je.asyncDep.then(()=>{qt(()=>{R.isUnmounted||se()},F)});return}}let De=he,Be;Dn(R,!1),he?(he.el=Ge.el,L(R,he,ue)):he=Ge,me&&Ri(me),(Be=he.props&&he.props.onVnodeBeforeUpdate)&&Ms(Be,Pe,he,Ge),Dn(R,!0);const Ve=zo(R),rt=R.subTree;R.subTree=Ve,b(rt,Ve,u(rt.el),K(rt),R,F,Z),he.el=Ve.el,De===null&&jr(R,Ve.el),be&&qt(be,F),(Be=he.props&&he.props.onVnodeUpdated)&&qt(()=>Ms(Be,Pe,he,Ge),F)}else{let he;const{el:me,props:be}=P,{bm:Pe,m:Ge,parent:De,root:Be,type:Ve}=R,rt=Xa(P);if(Dn(R,!1),Pe&&Ri(Pe),!rt&&(he=be&&be.onVnodeBeforeMount)&&Ms(he,De,P),Dn(R,!0),me&&He){const Je=()=>{R.subTree=zo(R),He(me,R.subTree,R,F,null)};rt&&Ve.__asyncHydrate?Ve.__asyncHydrate(me,R,Je):Je()}else{Be.ce&&Be.ce._hasShadowRoot()&&Be.ce._injectChildStyle(Ve,R.parent?R.parent.type:void 0);const Je=R.subTree=zo(R);b(null,Je,G,de,R,F,Z),P.el=Je.el}if(Ge&&qt(Ge,F),!rt&&(he=be&&be.onVnodeMounted)){const Je=P;qt(()=>Ms(he,De,Je),F)}(P.shapeFlag&256||De&&Xa(De.vnode)&&De.vnode.shapeFlag&256)&&R.a&&qt(R.a,F),R.isMounted=!0,P=G=de=null}};R.scope.on();const te=R.effect=new Ol(H);R.scope.off();const se=R.update=te.run.bind(te),ye=R.job=te.runIfDirty.bind(te);ye.i=R,ye.id=R.uid,te.scheduler=()=>zd(ye),Dn(R,!0),se()},L=(R,P,G)=>{P.component=R;const de=R.vnode.props;R.vnode=P,R.next=null,o0(R,P.props,de,G),u0(R,P.children,G),sn(),ap(R),an()},D=(R,P,G,de,F,Z,ue,H,te=!1)=>{const se=R&&R.children,ye=R?R.shapeFlag:0,he=P.children,{patchFlag:me,shapeFlag:be}=P;if(me>0){if(me&128){re(se,he,G,de,F,Z,ue,H,te);return}else if(me&256){le(se,he,G,de,F,Z,ue,H,te);return}}be&8?(ye&16&&fe(se,F,Z),he!==se&&d(G,he)):ye&16?be&16?re(se,he,G,de,F,Z,ue,H,te):fe(se,F,Z,!0):(ye&8&&d(G,""),be&16&&A(he,G,de,F,Z,ue,H,te))},le=(R,P,G,de,F,Z,ue,H,te)=>{R=R||Ti,P=P||Ti;const se=R.length,ye=P.length,he=Math.min(se,ye);let me;for(me=0;me<he;me++){const be=P[me]=te?Va(P[me]):Ps(P[me]);b(R[me],be,G,null,F,Z,ue,H,te)}se>ye?fe(R,F,Z,!0,!1,he):A(P,G,de,F,Z,ue,H,te,he)},re=(R,P,G,de,F,Z,ue,H,te)=>{let se=0;const ye=P.length;let he=R.length-1,me=ye-1;for(;se<=he&&se<=me;){const be=R[se],Pe=P[se]=te?Va(P[se]):Ps(P[se]);if(pa(be,Pe))b(be,Pe,G,null,F,Z,ue,H,te);else break;se++}for(;se<=he&&se<=me;){const be=R[he],Pe=P[me]=te?Va(P[me]):Ps(P[me]);if(pa(be,Pe))b(be,Pe,G,null,F,Z,ue,H,te);else break;he--,me--}if(se>he){if(se<=me){const be=me+1,Pe=be<ye?P[be].el:de;for(;se<=me;)b(null,P[se]=te?Va(P[se]):Ps(P[se]),G,Pe,F,Z,ue,H,te),se++}}else if(se>me)for(;se<=he;)Y(R[se],F,Z,!0),se++;else{const be=se,Pe=se,Ge=new Map;for(se=Pe;se<=me;se++){const Re=P[se]=te?Va(P[se]):Ps(P[se]);Re.key!=null&&Ge.set(Re.key,se)}let De,Be=0;const Ve=me-Pe+1;let rt=!1,Je=0;const ee=new Array(Ve);for(se=0;se<Ve;se++)ee[se]=0;for(se=be;se<=he;se++){const Re=R[se];if(Be>=Ve){Y(Re,F,Z,!0);continue}let Ae;if(Re.key!=null)Ae=Ge.get(Re.key);else for(De=Pe;De<=me;De++)if(ee[De-Pe]===0&&pa(Re,P[De])){Ae=De;break}Ae===void 0?Y(Re,F,Z,!0):(ee[Ae-Pe]=se+1,Ae>=Je?Je=Ae:rt=!0,b(Re,P[Ae],G,null,F,Z,ue,H,te),Be++)}const Se=rt?p0(ee):Ti;for(De=Se.length-1,se=Ve-1;se>=0;se--){const Re=Pe+se,Ae=P[Re],ne=P[Re+1],Le=Re+1<ye?ne.el||Sh(ne):de;ee[se]===0?b(null,Ae,G,Le,F,Z,ue,H,te):rt&&(De<0||se!==Se[De]?z(Ae,G,Le,2):De--)}}},z=(R,P,G,de,F=null)=>{const{el:Z,type:ue,transition:H,children:te,shapeFlag:se}=R;if(se&6){z(R.component.subTree,P,G,de);return}if(se&128){R.suspense.move(P,G,de);return}if(se&64){ue.move(R,P,G,xe);return}if(ue===ns){a(Z,P,G);for(let he=0;he<te.length;he++)z(te[he],P,G,de);a(R.anchor,P,G);return}if(ue===Gn){g(R,P,G);return}if(de!==2&&se&1&&H)if(de===0)H.persisted&&!Z[ta]?a(Z,P,G):(H.beforeEnter(Z),a(Z,P,G),qt(()=>H.enter(Z),F));else{const{leave:he,delayLeave:me,afterLeave:be}=H,Pe=()=>{R.ctx.isUnmounted?n(Z):a(Z,P,G)},Ge=()=>{const De=Z._isLeaving||!!Z[ta];Z._isLeaving&&Z[ta](!0),H.persisted&&!De?Pe():he(Z,()=>{Pe(),be&&be()})};me?me(Z,Pe,Ge):Ge()}else a(Z,P,G)},Y=(R,P,G,de=!1,F=!1)=>{const{type:Z,props:ue,ref:H,children:te,dynamicChildren:se,shapeFlag:ye,patchFlag:he,dirs:me,cacheIndex:be,memo:Pe}=R;if(he===-2&&(F=!1),H!=null&&(sn(),Oi(H,null,G,R,!0),an()),be!=null&&(P.renderCache[be]=void 0),ye&256){P.ctx.deactivate(R);return}const Ge=ye&1&&me,De=!Xa(R);let Be;if(De&&(Be=ue&&ue.onVnodeBeforeUnmount)&&Ms(Be,P,R),ye&6)ve(R.component,G,de);else{if(ye&128){R.suspense.unmount(G,de);return}Ge&&Ca(R,null,P,"beforeUnmount"),ye&64?R.type.remove(R,P,G,xe,de):se&&!se.hasOnce&&(Z!==ns||he>0&&he&64)?fe(se,P,G,!1,!0):(Z===ns&&he&384||!F&&ye&16)&&fe(te,P,G),de&&ie(R)}const Ve=Pe!=null&&be==null;(De&&(Be=ue&&ue.onVnodeUnmounted)||Ge||Ve)&&qt(()=>{Be&&Ms(Be,P,R),Ge&&Ca(R,null,P,"unmounted"),Ve&&(R.el=null)},G)},ie=R=>{const{type:P,el:G,anchor:de,transition:F}=R;if(P===ns){J(G,de);return}if(P===Gn){y(R);return}const Z=()=>{n(G),F&&!F.persisted&&F.afterLeave&&F.afterLeave()};if(R.shapeFlag&1&&F&&!F.persisted){const{leave:ue,delayLeave:H}=F,te=()=>ue(G,Z);H?H(R.el,Z,te):te()}else Z()},J=(R,P)=>{let G;for(;R!==P;)G=p(R),n(R),R=G;n(P)},ve=(R,P,G)=>{const{bum:de,scope:F,job:Z,subTree:ue,um:H,m:te,a:se}=R;ar(te),ar(se),de&&Ri(de),F.stop(),Z&&(Z.flags|=8,Y(ue,R,P,G)),H&&qt(H,P),qt(()=>{R.isUnmounted=!0},P)},fe=(R,P,G,de=!1,F=!1,Z=0)=>{for(let ue=Z;ue<R.length;ue++)Y(R[ue],P,G,de,F)},K=R=>{if(R.shapeFlag&6)return K(R.component.subTree);if(R.shapeFlag&128)return R.suspense.next();const P=p(R.anchor||R.el),G=P&&P[Gm];return G?p(G):P};let pe=!1;const ge=(R,P,G)=>{let de;R==null?P._vnode&&(Y(P._vnode,null,null,!0),de=P._vnode.component):b(P._vnode||null,R,P,null,null,null,G),P._vnode=R,pe||(pe=!0,ap(de),er(),pe=!1)},xe={p:b,um:Y,m:z,r:ie,mt:Q,mc:A,pc:D,pbc:O,n:K,o:e};let ke,He;return t&&([ke,He]=t(xe)),{render:ge,hydrate:ke,createApp:Qx(ge,ke)}}function wc({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Dn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function wh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Xd(e,t,s=!1){const a=e.children,n=t.children;if(Oe(a)&&Oe(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=Va(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Xd(l,o)),o.type===kn&&(o.patchFlag===-1&&(o=n[i]=Va(o)),o.el=l.el),o.type===jt&&!o.el&&(o.el=l.el)}}function p0(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function kh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:kh(t)}function ar(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Sh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Sh(t.subTree):null}const nr=e=>e.__isSuspense;let sd=0;const f0={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)h0(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}v0(e,t,s,a,n,l,o,r,c)}},hydrate:g0,normalize:b0},m0=f0;function Fl(e,t){const s=e.props&&e.props[t];ze(s)&&s()}function h0(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Ch(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(Fl(e,"onPending"),Fl(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),Li(p,e.ssFallback)):p.resolve(!1,!0)}function v0(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,m=t.ssFallback,{activeBranch:h,pendingBranch:b,isInFallback:_,isHydrating:I}=u;if(b)u.pendingBranch=p,pa(b,p)?(r(b,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():_&&(I||(r(h,m,s,a,n,null,i,l,o),Li(u,m)))):(u.pendingId=sd++,I?(u.isHydrating=!1,u.activeBranch=b):c(b,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),_?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(h,m,s,a,n,null,i,l,o),Li(u,m))):h&&pa(h,p)?(r(h,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(h&&pa(h,p))r(h,p,s,a,n,u,i,l,o),Li(u,p);else if(Fl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=sd++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:g}=u;x>0?setTimeout(()=>{u.pendingId===g&&u.fallback(m)},x):x===0&&u.fallback(m)}}function Ch(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:m,n:h,o:{parentNode:b,remove:_}}=c;let I;const x=y0(e);x&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const g=e.props?Jo(e.props.timeout):void 0,y=i,w={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:sd++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(S=!1,E=!1){const{vnode:A,activeBranch:k,pendingBranch:O,pendingId:B,effects:T,parentComponent:$,container:Q,isInFallback:W}=w;let M=!1;if(w.isHydrating)w.isHydrating=!1;else if(!S){M=k&&O.transition&&O.transition.mode==="out-in";let le=!1;M&&(k.transition.afterLeave=()=>{B===w.pendingId&&(p(O,Q,i===y&&!le?h(k):i,0),Ml(T),W&&A.ssFallback&&(A.ssFallback.el=null))}),k&&!w.isFallbackMountPending&&(b(k.el)===Q&&(i=h(k),le=!0),m(k,$,w,!0),!M&&W&&A.ssFallback&&qt(()=>A.ssFallback.el=null,w)),M||p(O,Q,i,0)}w.isFallbackMountPending=!1,Li(w,O),w.pendingBranch=null,w.isInFallback=!1;let L=w.parent,D=!1;for(;L;){if(L.pendingBranch){L.effects.push(...T),D=!0;break}L=L.parent}!D&&!M&&Ml(T),w.effects=[],x&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!E&&t.resolve()),Fl(A,"onResolve")},fallback(S){if(!w.pendingBranch)return;const{vnode:E,activeBranch:A,parentComponent:k,container:O,namespace:B}=w;Fl(E,"onFallback");const T=h(A),$=()=>{w.isFallbackMountPending=!1,w.isInFallback&&(u(null,S,O,T,k,null,B,o,r),Li(w,S))},Q=S.transition&&S.transition.mode==="out-in";Q&&(w.isFallbackMountPending=!0,A.transition.afterLeave=$),w.isInFallback=!0,m(A,k,null,!0),Q||$()},move(S,E,A){w.activeBranch&&p(w.activeBranch,S,E,A),w.container=S},next(){return w.activeBranch&&h(w.activeBranch)},registerDep(S,E,A){const k=!!w.pendingBranch;k&&w.deps++;const O=S.vnode.el;S.asyncDep.catch(B=>{si(B,S,0)}).then(B=>{if(S.isUnmounted||w.isUnmounted||w.pendingId!==S.suspenseId)return;zl(),S.asyncResolved=!0;const{vnode:T}=S;ad(S,B,!1),O&&(T.el=O);const $=!O&&S.subTree.el;E(S,T,b(O||S.subTree.el),O?null:h(S.subTree),w,l,A),$&&(T.placeholder=null,_($)),jr(S,T.el),k&&--w.deps===0&&w.resolve()})},unmount(S,E){w.isUnmounted=!0,w.activeBranch&&m(w.activeBranch,s,S,E),w.pendingBranch&&m(w.pendingBranch,s,S,E)}};return w}function g0(e,t,s,a,n,i,l,o,r){const c=t.suspense=Ch(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function b0(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=gp(a?s.default:s),e.ssFallback=a?gp(s.fallback):Nt(jt)}function gp(e){let t;if(ze(e)){const s=Jn&&e._c;s&&(e._d=!1,Ul()),e=e(),s&&(e._d=!0,t=xs,Eh())}return Oe(e)&&(e=s0(e)),e=Ps(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Th(e,t){t&&t.pendingBranch?Oe(e)?t.effects.push(...e):t.effects.push(e):Ml(e)}function Li(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,jr(a,n))}function y0(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const ns=Symbol.for("v-fgt"),kn=Symbol.for("v-txt"),jt=Symbol.for("v-cmt"),Gn=Symbol.for("v-stc"),Cl=[];let xs=null;function Ul(e=!1){Cl.push(xs=e?null:[])}function Eh(){Cl.pop(),xs=Cl[Cl.length-1]||null}let Jn=1;function Bl(e,t=!1){Jn+=e,e<0&&xs&&t&&(xs.hasOnce=!0)}function Ah(e){return e.dynamicChildren=Jn>0?xs||Ti:null,Eh(),Jn>0&&xs&&xs.push(e),e}function x0(e,t,s,a,n,i){return Ah(eu(e,t,s,a,n,i,!0))}function ir(e,t,s,a,n){return Ah(Nt(e,t,s,a,n,!0))}function ln(e){return e?e.__v_isVNode===!0:!1}function pa(e,t){return e.type===t.type&&e.key===t.key}function _0(e){}const Rh=({key:e})=>e??null,Ho=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ke(e)||Wt(e)||ze(e)?{i:ds,r:e,k:t,f:!!s}:e:null);function eu(e,t=null,s=null,a=0,n=null,i=e===ns?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Rh(t),ref:t&&Ho(t),scopeId:$r,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:ds};return o?(su(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ke(s)?8:16),Jn>0&&!l&&xs&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&xs.push(r),r}const Nt=w0;function w0(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===nh)&&(e=jt),ln(e)){const o=Ra(e,t,!0);return s&&su(o,s),Jn>0&&!i&&xs&&(o.shapeFlag&6?xs[xs.indexOf(e)]=o:xs.push(o)),o.patchFlag=-2,o}if(R0(e)&&(e=e.__vccOpts),t){t=Ih(t);let{class:o,style:r}=t;o&&!Ke(o)&&(t.class=Xl(o)),mt(r)&&(eo(r)&&!Oe(r)&&(r=at({},r)),t.style=Ql(r))}const l=Ke(e)?1:nr(e)?128:Wm(e)?64:mt(e)?4:ze(e)?2:0;return eu(e,t,s,a,n,l,i,!0)}function Ih(e){return e?eo(e)||fh(e)?at({},e):e:null}function Ra(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Lh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Rh(c),ref:t&&t.ref?s&&i?Oe(i)?i.concat(Ho(t)):[i,Ho(t)]:Ho(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==ns?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ra(e.ssContent),ssFallback:e.ssFallback&&Ra(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&nn(d,r.clone(d)),d}function tu(e=" ",t=0){return Nt(kn,null,e,t)}function k0(e,t){const s=Nt(Gn,null,e);return s.staticCount=t,s}function Oh(e="",t=!1){return t?(Ul(),ir(jt,null,e)):Nt(jt,null,e)}function Ps(e){return e==null||typeof e=="boolean"?Nt(jt):Oe(e)?Nt(ns,null,e.slice()):ln(e)?Va(e):Nt(kn,null,String(e))}function Va(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ra(e)}function su(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Oe(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),su(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!fh(t)?t._ctx=ds:n===3&&ds&&(ds.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else ze(t)?(t={default:t,_ctx:ds},s=32):(t=String(t),a&64?(s=16,t=[tu(t)]):s=8);e.children=t,e.shapeFlag|=s}function Lh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=Xl([t.class,a.class]));else if(n==="style")t.style=Ql([t.style,a.style]);else if(Xn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Oe(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Tr(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function Ms(e,t,s,a=null){Ws(e,t,7,[s,a])}const S0=oh();let C0=0;function Nh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||S0,i={uid:C0++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Md(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:hh(a,n),emitsOptions:ch(a,n),emit:null,emitted:null,propsDefaults:it,inheritAttrs:a.inheritAttrs,ctx:it,data:it,props:it,attrs:it,slots:it,refs:it,setupState:it,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=e0.bind(null,i),e.ce&&e.ce(i),i}let cs=null;const As=()=>cs||ds;let lr,Ni;{const e=Or(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};lr=t("__VUE_INSTANCE_SETTERS__",s=>cs=s),Ni=t("__VUE_SSR_SETTERS__",s=>Zn=s)}const Zi=e=>{const t=cs;return lr(e),e.scope.on(),()=>{e.scope.off(),lr(t)}},zl=()=>{cs&&cs.scope.off(),lr(null)};function Mh(e){return e.vnode.shapeFlag&4}let Zn=!1;function Dh(e,t=!1,s=!1){t&&Ni(t);const{props:a,children:n}=e.vnode,i=Mh(e);l0(e,a,i,t),d0(e,n,s||t);const l=i?T0(e,t):void 0;return t&&Ni(!1),l}function T0(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Qc);const{setup:a}=s;if(a){sn();const n=e.setupContext=a.length>1?Fh(e):null,i=Zi(e),l=Ji(a,e,0,[e.props,n]),o=Nd(l);if(an(),i(),(o||e.sp)&&!Xa(e)&&qd(e),o){if(l.then(zl,zl),t)return l.then(r=>{ad(e,r,t)}).catch(r=>{si(r,e,0)});e.asyncDep=l}else ad(e,l,t)}else $h(e,t)}function ad(e,t,s){ze(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:mt(t)&&(e.setupState=Bd(t)),$h(e,s)}let or,nd;function Ph(e){or=e,nd=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Lx))}}const E0=()=>!or;function $h(e,t,s){const a=e.type;if(!e.render){if(!t&&or&&!a.render){const n=a.template||Zd(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=at(at({isCustomElement:i,delimiters:o},l),r);a.render=or(n,c)}}e.render=a.render||us,nd&&nd(e)}{const n=Zi(e);sn();try{Gx(e)}finally{an(),n()}}}const A0={get(e,t){return ys(e,"get",""),e[t]}};function Fh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,A0),slots:e.slots,emit:e.emit,expose:t}}function no(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Bd(Lm(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Sl)return Sl[s](e)},has(t,s){return s in t||s in Sl}})):e.proxy}function id(e,t=!0){return ze(e)?e.displayName||e.name:e.name||t&&e.__name}function R0(e){return ze(e)&&"__vccOpts"in e}const V=(e,t)=>Dy(e,t,Zn);function Fi(e,t,s){try{Bl(-1);const a=arguments.length;return a===2?mt(t)&&!Oe(t)?ln(t)?Nt(e,null,[t]):Nt(e,t):Nt(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&ln(s)&&(s=[s]),Nt(e,t,s))}finally{Bl(1)}}function I0(){}function O0(e,t,s,a){const n=s[a];if(n&&Uh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Uh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(as(s[a],t[a]))return!1;return Jn>0&&xs&&xs.push(e),!0}const Bh="3.5.38",L0=us,N0=Vy,M0=xi,D0=zm,P0={createComponentInstance:Nh,setupComponent:Dh,renderComponentRoot:zo,setCurrentRenderingInstance:Pl,isVNode:ln,normalizeVNode:Ps,getComponentPublicInstance:no,ensureValidVNode:Jd,pushWarningContext:By,popWarningContext:zy},$0=P0,F0=null,U0=null,B0=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ld;const bp=typeof window<"u"&&window.trustedTypes;if(bp)try{ld=bp.createPolicy("vue",{createHTML:e=>e})}catch{}const zh=ld?e=>ld.createHTML(e):e=>e,z0="http://www.w3.org/2000/svg",H0="http://www.w3.org/1998/Math/MathML",ja=typeof document<"u"?document:null,yp=ja&&ja.createElement("template"),Hh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?ja.createElementNS(z0,e):t==="mathml"?ja.createElementNS(H0,e):s?ja.createElement(e,{is:s}):ja.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>ja.createTextNode(e),createComment:e=>ja.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>ja.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{yp.innerHTML=zh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=yp.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},fn="transition",ol="animation",Ui=Symbol("_vtc"),jh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Vh=at({},Vd,jh),j0=e=>(e.displayName="Transition",e.props=Vh,e),V0=j0((e,{slots:t})=>Fi(Zm,qh(e),t)),Pn=(e,t=[])=>{Oe(e)?e.forEach(s=>s(...t)):e&&e(...t)},xp=e=>e?Oe(e)?e.some(t=>t.length>1):e.length>1:!1;function qh(e){const t={};for(const T in e)T in jh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:m=`${s}-leave-to`}=e,h=q0(n),b=h&&h[0],_=h&&h[1],{onBeforeEnter:I,onEnter:x,onEnterCancelled:g,onLeave:y,onLeaveCancelled:w,onBeforeAppear:S=I,onAppear:E=x,onAppearCancelled:A=g}=t,k=(T,$,Q,W)=>{T._enterCancelled=W,gn(T,$?d:o),gn(T,$?c:l),Q&&Q()},O=(T,$)=>{T._isLeaving=!1,gn(T,u),gn(T,m),gn(T,p),$&&$()},B=T=>($,Q)=>{const W=T?E:x,M=()=>k($,T,Q);Pn(W,[$,M]),_p(()=>{gn($,T?r:i),_a($,T?d:o),xp(W)||wp($,a,b,M)})};return at(t,{onBeforeEnter(T){Pn(I,[T]),_a(T,i),_a(T,l)},onBeforeAppear(T){Pn(S,[T]),_a(T,r),_a(T,c)},onEnter:B(!1),onAppear:B(!0),onLeave(T,$){T._isLeaving=!0;const Q=()=>O(T,$);_a(T,u),T._enterCancelled?(_a(T,p),od(T)):(od(T),_a(T,p)),_p(()=>{T._isLeaving&&(gn(T,u),_a(T,m),xp(y)||wp(T,a,_,Q))}),Pn(y,[T,Q])},onEnterCancelled(T){k(T,!1,void 0,!0),Pn(g,[T])},onAppearCancelled(T){k(T,!0,void 0,!0),Pn(A,[T])},onLeaveCancelled(T){O(T),Pn(w,[T])}})}function q0(e){if(e==null)return null;if(mt(e))return[kc(e.enter),kc(e.leave)];{const t=kc(e);return[t,t]}}function kc(e){return Jo(e)}function _a(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ui]||(e[Ui]=new Set)).add(t)}function gn(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[Ui];s&&(s.delete(t),s.size||(e[Ui]=void 0))}function _p(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let G0=0;function wp(e,t,s,a){const n=e._endId=++G0,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Gh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=m=>{m.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Gh(e,t){const s=window.getComputedStyle(e),a=h=>(s[h]||"").split(", "),n=a(`${fn}Delay`),i=a(`${fn}Duration`),l=kp(n,i),o=a(`${ol}Delay`),r=a(`${ol}Duration`),c=kp(o,r);let d=null,u=0,p=0;t===fn?l>0&&(d=fn,u=l,p=i.length):t===ol?c>0&&(d=ol,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?fn:ol:null,p=d?d===fn?i.length:r.length:0);const m=d===fn&&/\b(?:transform|all)(?:,|$)/.test(a(`${fn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:m}}function kp(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>Sp(s)+Sp(e[a])))}function Sp(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function od(e){return(e?e.ownerDocument:document).body.offsetHeight}function W0(e,t,s){const a=e[Ui];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const rr=Symbol("_vod"),au=Symbol("_vsh"),Wh={name:"show",beforeMount(e,{value:t},{transition:s}){e[rr]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):rl(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),rl(e,!0),a.enter(e)):a.leave(e,()=>{rl(e,!1)}):rl(e,t))},beforeUnmount(e,{value:t}){rl(e,t)}};function rl(e,t){e.style.display=t?e[rr]:"none",e[au]=!t}function K0(){Wh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Kh=Symbol("");function J0(e){const t=As();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>cr(i,n))},a=()=>{const n=e(t.proxy);t.ce?cr(t.ce,n):rd(t.subTree,n),s(n)};Gd(()=>{Ml(a)}),tt(()=>{Kt(a,us,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>n.disconnect())})}function rd(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{rd(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)cr(e.el,t);else if(e.type===ns)e.children.forEach(s=>rd(s,t));else if(e.type===Gn){let{el:s,anchor:a}=e;for(;s&&(cr(s,t),s!==a);)s=s.nextSibling}}function cr(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=ty(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Kh]=a}}const Z0=/(?:^|;)\s*display\s*:/;function Y0(e,t,s){const a=e.style,n=Ke(s);let i=!1;if(s&&!n){if(t)if(Ke(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&yl(a,o,"")}else for(const l in t)s[l]==null&&yl(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?X0(e,l,!Ke(t)&&t?t[l]:void 0,o)||yl(a,l,o):yl(a,l,"")}}else if(n){if(t!==s){const l=a[Kh];l&&(s+=";"+l),a.cssText=s,i=Z0.test(s)}}else t&&e.removeAttribute("style");rr in e&&(e[rr]=i?a.display:"",e[au]&&(a.display="none"))}const Cp=/\s*!important$/;function yl(e,t,s){if(Oe(s))s.forEach(a=>yl(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=Q0(e,t);Cp.test(s)?e.setProperty($s(a),s.replace(Cp,""),"important"):e[a]=s}}const Tp=["Webkit","Moz","ms"],Sc={};function Q0(e,t){const s=Sc[t];if(s)return s;let a=wt(t);if(a!=="filter"&&a in e)return Sc[t]=a;a=ti(a);for(let n=0;n<Tp.length;n++){const i=Tp[n]+a;if(i in e)return Sc[t]=i}return t}function X0(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ke(a)&&s===a}const Ep="http://www.w3.org/1999/xlink";function Ap(e,t,s,a,n,i=Xb(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ep,t.slice(6,t.length)):e.setAttributeNS(Ep,t,s):s==null||i&&!pm(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ws(s)?String(s):s)}function Rp(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?zh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=pm(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ka(e,t,s,a){e.addEventListener(t,s,a)}function e_(e,t,s,a){e.removeEventListener(t,s,a)}const Ip=Symbol("_vei");function t_(e,t,s,a,n=null){const i=e[Ip]||(e[Ip]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=s_(t);if(a){const c=i[t]=i_(a,n);Ka(e,o,c,r)}else l&&(e_(e,o,l,r),i[t]=void 0)}}const Op=/(?:Once|Passive|Capture)$/;function s_(e){let t;if(Op.test(e)){t={};let a;for(;a=e.match(Op);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):$s(e.slice(2)),t]}let Cc=0;const a_=Promise.resolve(),n_=()=>Cc||(a_.then(()=>Cc=0),Cc=Date.now());function i_(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Oe(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Ws(c,t,5,o)}}else Ws(n,t,5,[a])};return s.value=e,s.attached=n_(),s}const Lp=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Jh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?W0(e,a,l):t==="style"?Y0(e,s,a):Xn(t)?Tr(t)||t_(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):l_(e,t,a,l))?(Rp(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ap(e,t,a,l,i,t!=="value")):e._isVueCE&&(o_(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ke(a)))?Rp(e,wt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),Ap(e,t,a,l))};function l_(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Lp(t)&&ze(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Lp(t)&&Ke(s)?!1:t in e}function o_(e,t){const s=e._def.props;if(!s)return!1;const a=wt(t);return Array.isArray(s)?s.some(n=>wt(n)===a):Object.keys(s).some(n=>wt(n)===a)}const Np={};function Zh(e,t,s){let a=so(e,t);Er(a)&&(a=at({},a,t));class n extends Vr{constructor(l){super(a,l,s)}}return n.def=a,n}const r_=((e,t)=>Zh(e,t,cv)),c_=typeof HTMLElement<"u"?HTMLElement:class{};class Vr extends c_{constructor(t,s={},a=pr){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==pr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(at({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Vr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ht(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Oe(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Jo(this._props[r])),(o||(o=Object.create(null)))[wt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)gt(this,a)||Object.defineProperty(this,a,{get:()=>Ea(s[a])})}_resolveProps(t){const{props:s}=t,a=Oe(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(wt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Np;const n=wt(t);s&&this._numberProps&&this._numberProps[n]&&(a=Jo(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Np?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute($s(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute($s(t),s+""):s||this.removeAttribute($s(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),rv(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=Nt(this._def,at(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Er(l[0])?at({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),$s(i)!==i&&n($s(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Yh(e){const t=As(),s=t&&t.ce;return s||null}function d_(){const e=Yh();return e&&e.shadowRoot}function u_(e="$style"){{const t=As();if(!t)return it;const s=t.type.__cssModules;if(!s)return it;const a=s[e];return a||it}}const Qh=new WeakMap,Xh=new WeakMap,dr=Symbol("_moveCb"),Mp=Symbol("_enterCb"),p_=e=>(delete e.props.mode,e),f_=p_({name:"TransitionGroup",props:at({},Vh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=As(),a=jd();let n,i;return Br(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!b_(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(h_),n.forEach(v_);const o=n.filter(g_);od(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;_a(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[dr]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[dr]=null,gn(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=dt(e),o=qh(l);let r=l.tag||ns;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[au]&&(n.push(d),nn(d,$i(d,o,a,s)),Qh.set(d,ev(d.el)))}i=t.default?Fr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&nn(d,$i(d,o,a,s))}return Nt(r,null,i)}}}),m_=f_;function h_(e){const t=e.el;t[dr]&&t[dr](),t[Mp]&&t[Mp]()}function v_(e){Xh.set(e,ev(e.el))}function g_(e){const t=Qh.get(e),s=Xh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function ev(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function b_(e,t,s){const a=e.cloneNode(),n=e[Ui];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Gh(a);return i.removeChild(a),l}const Cn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Oe(t)?s=>Ri(t,s):t};function y_(e){e.target.composing=!0}function Dp(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const la=Symbol("_assign");function Pp(e,t,s){return t&&(e=e.trim()),s&&(e=Ir(e)),e}const ur={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[la]=Cn(n);const i=a||n.props&&n.props.type==="number";Ka(e,t?"change":"input",l=>{l.target.composing||e[la](Pp(e.value,s,i))}),(s||i)&&Ka(e,"change",()=>{e.value=Pp(e.value,s,i)}),t||(Ka(e,"compositionstart",y_),Ka(e,"compositionend",Dp),Ka(e,"change",Dp))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[la]=Cn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ir(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},nu={deep:!0,created(e,t,s){e[la]=Cn(s),Ka(e,"change",()=>{const a=e._modelValue,n=Bi(e),i=e.checked,l=e[la];if(Oe(a)){const o=Lr(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(ei(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(sv(e,i))})},mounted:$p,beforeUpdate(e,t,s){e[la]=Cn(s),$p(e,t,s)}};function $p(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Oe(t))n=Lr(t,a.props.value)>-1;else if(ei(t))n=t.has(a.props.value);else{if(t===s)return;n=tn(t,sv(e,!0))}e.checked!==n&&(e.checked=n)}const iu={created(e,{value:t},s){e.checked=tn(t,s.props.value),e[la]=Cn(s),Ka(e,"change",()=>{e[la](Bi(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[la]=Cn(a),t!==s&&(e.checked=tn(t,a.props.value))}},tv={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=ei(t);Ka(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ir(Bi(l)):Bi(l));e[la](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Ht(()=>{e._assigning=!1})}),e[la]=Cn(a)},mounted(e,{value:t}){Fp(e,t)},beforeUpdate(e,t,s){e[la]=Cn(s)},updated(e,{value:t}){e._assigning||Fp(e,t)}};function Fp(e,t){const s=e.multiple,a=Oe(t);if(!(s&&!a&&!ei(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=Bi(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Lr(t,o)>-1}else l.selected=t.has(o);else if(tn(Bi(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Bi(e){return"_value"in e?e._value:e.value}function sv(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const av={created(e,t,s){To(e,t,s,null,"created")},mounted(e,t,s){To(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){To(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){To(e,t,s,a,"updated")}};function nv(e,t){switch(e){case"SELECT":return tv;case"TEXTAREA":return ur;default:switch(t){case"checkbox":return nu;case"radio":return iu;default:return ur}}}function To(e,t,s,a,n){const l=nv(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function x_(){ur.getSSRProps=({value:e})=>({value:e}),iu.getSSRProps=({value:e},t)=>{if(t.props&&tn(t.props.value,e))return{checked:!0}},nu.getSSRProps=({value:e},t)=>{if(Oe(e)){if(t.props&&Lr(e,t.props.value)>-1)return{checked:!0}}else if(ei(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},av.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=nv(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const __=["ctrl","shift","alt","meta"],w_={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>__.some(s=>e[`${s}Key`]&&!t.includes(s))},k_=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=w_[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},S_={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},C_=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=$s(n.key);if(t.some(l=>l===i||S_[l]===i))return e(n)}))},iv=at({patchProp:Jh},Hh);let Tl,Up=!1;function lv(){return Tl||(Tl=yh(iv))}function ov(){return Tl=Up?Tl:xh(iv),Up=!0,Tl}const rv=((...e)=>{lv().render(...e)}),T_=((...e)=>{ov().hydrate(...e)}),pr=((...e)=>{const t=lv().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=uv(a);if(!n)return;const i=t._component;!ze(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,dv(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),cv=((...e)=>{const t=ov().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=uv(a);if(n)return s(n,!0,dv(n))},t});function dv(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function uv(e){return Ke(e)?document.querySelector(e):e}let Bp=!1;const E_=()=>{Bp||(Bp=!0,x_(),K0())},A_=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Zm,BaseTransitionPropsValidators:Vd,Comment:jt,DeprecationTypes:B0,EffectScope:Md,ErrorCodes:jy,ErrorTypeStrings:N0,Fragment:ns,KeepAlive:wx,ReactiveEffect:Ol,Static:Gn,Suspense:m0,Teleport:nx,Text:kn,TrackOpTypes:Py,Transition:V0,TransitionGroup:m_,TriggerOpTypes:$y,VueElement:Vr,assertNumber:Hy,callWithAsyncErrorHandling:Ws,callWithErrorHandling:Ji,camelize:wt,capitalize:ti,cloneVNode:Ra,compatUtils:U0,computed:V,createApp:pr,createBlock:ir,createCommentVNode:Oh,createElementBlock:x0,createElementVNode:eu,createHydrationRenderer:xh,createPropsRestProxy:Vx,createRenderer:yh,createSSRApp:cv,createSlots:Rx,createStaticVNode:k0,createTextVNode:tu,createVNode:Nt,customRef:Mm,defineAsyncComponent:xx,defineComponent:so,defineCustomElement:Zh,defineEmits:Mx,defineExpose:Dx,defineModel:Fx,defineOptions:Px,defineProps:Nx,defineSSRCustomElement:r_,defineSlots:$x,devtools:M0,effect:iy,effectScope:sy,getCurrentInstance:As,getCurrentScope:vm,getCurrentWatcher:Fy,getTransitionRawChildren:Fr,guardReactiveProps:Ih,h:Fi,handleError:si,hasInjectionContext:Yy,hydrate:T_,hydrateOnIdle:mx,hydrateOnInteraction:bx,hydrateOnMediaQuery:gx,hydrateOnVisible:vx,initCustomFormatter:I0,initDirectivesForSSR:E_,inject:ia,isMemoSame:Uh,isProxy:eo,isReactive:Qa,isReadonly:Aa,isRef:Wt,isRuntimeOnly:E0,isShallow:Us,isVNode:ln,markRaw:Lm,mergeDefaults:Hx,mergeModels:jx,mergeProps:Lh,nextTick:Ht,nodeOps:Hh,normalizeClass:Xl,normalizeProps:jb,normalizeStyle:Ql,onActivated:ls,onBeforeMount:Xm,onBeforeUnmount:zr,onBeforeUpdate:Gd,onDeactivated:Jt,onErrorCaptured:ah,onMounted:tt,onRenderTracked:sh,onRenderTriggered:th,onScopeDispose:ay,onServerPrefetch:eh,onUnmounted:_t,onUpdated:Br,onWatcherCleanup:Pm,openBlock:Ul,patchProp:Jh,popScopeId:Ky,provide:kl,proxyRefs:Bd,pushScopeId:Wy,queuePostFlushCb:Ml,reactive:Tn,readonly:Yo,ref:f,registerRuntimeCompiler:Ph,render:rv,renderList:Ax,renderSlot:Ix,resolveComponent:Cx,resolveDirective:Ex,resolveDynamicComponent:Tx,resolveFilter:F0,resolveTransitionHooks:$i,setBlockTracking:Bl,setDevtoolsHook:D0,setTransitionHooks:nn,shallowReactive:Fd,shallowReadonly:Sy,shallowRef:Ud,ssrContextKey:Hm,ssrUtils:$0,stop:ly,toDisplayString:mm,toHandlerKey:Ai,toHandlers:Ox,toRaw:dt,toRef:Ny,toRefs:Iy,toValue:Ey,transformVNodeArgs:_0,triggerRef:Ty,unref:Ea,useAttrs:zx,useCssModule:u_,useCssVars:J0,useHost:Yh,useId:lx,useModel:Xx,useSSRContext:jm,useShadowRoot:d_,useSlots:Bx,useTemplateRef:ox,useTransitionState:jd,vModelCheckbox:nu,vModelDynamic:av,vModelRadio:iu,vModelSelect:tv,vModelText:ur,vShow:Wh,version:Bh,warn:L0,watch:Kt,watchEffect:Qy,watchPostEffect:Xy,watchSyncEffect:Vm,withAsyncContext:qx,withCtx:Hd,withDefaults:Ux,withDirectives:Zy,withKeys:C_,withMemo:O0,withModifiers:k_,withScopeId:Jy},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Hl=Symbol(""),El=Symbol(""),lu=Symbol(""),fr=Symbol(""),pv=Symbol(""),Yn=Symbol(""),fv=Symbol(""),mv=Symbol(""),ou=Symbol(""),ru=Symbol(""),io=Symbol(""),cu=Symbol(""),hv=Symbol(""),du=Symbol(""),uu=Symbol(""),pu=Symbol(""),fu=Symbol(""),mu=Symbol(""),hu=Symbol(""),vv=Symbol(""),gv=Symbol(""),qr=Symbol(""),mr=Symbol(""),vu=Symbol(""),gu=Symbol(""),jl=Symbol(""),lo=Symbol(""),bu=Symbol(""),cd=Symbol(""),R_=Symbol(""),dd=Symbol(""),hr=Symbol(""),I_=Symbol(""),O_=Symbol(""),yu=Symbol(""),L_=Symbol(""),N_=Symbol(""),xu=Symbol(""),bv=Symbol(""),zi={[Hl]:"Fragment",[El]:"Teleport",[lu]:"Suspense",[fr]:"KeepAlive",[pv]:"BaseTransition",[Yn]:"openBlock",[fv]:"createBlock",[mv]:"createElementBlock",[ou]:"createVNode",[ru]:"createElementVNode",[io]:"createCommentVNode",[cu]:"createTextVNode",[hv]:"createStaticVNode",[du]:"resolveComponent",[uu]:"resolveDynamicComponent",[pu]:"resolveDirective",[fu]:"resolveFilter",[mu]:"withDirectives",[hu]:"renderList",[vv]:"renderSlot",[gv]:"createSlots",[qr]:"toDisplayString",[mr]:"mergeProps",[vu]:"normalizeClass",[gu]:"normalizeStyle",[jl]:"normalizeProps",[lo]:"guardReactiveProps",[bu]:"toHandlers",[cd]:"camelize",[R_]:"capitalize",[dd]:"toHandlerKey",[hr]:"setBlockTracking",[I_]:"pushScopeId",[O_]:"popScopeId",[yu]:"withCtx",[L_]:"unref",[N_]:"isRef",[xu]:"withMemo",[bv]:"isMemoSame"};function M_(e){Object.getOwnPropertySymbols(e).forEach(t=>{zi[t]=e[t]})}const Js={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function D_(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Js}}function Vl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Js){return e&&(o?(e.helper(Yn),e.helper(Vi(e.inSSR,c))):e.helper(ji(e.inSSR,c)),l&&e.helper(mu)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function Wn(e,t=Js){return{type:17,loc:t,elements:e}}function na(e,t=Js){return{type:15,loc:t,properties:e}}function Gt(e,t){return{type:16,loc:Js,key:Ke(e)?Xe(e,!0):e,value:t}}function Xe(e,t=!1,s=Js,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function ma(e,t=Js){return{type:8,loc:t,children:e}}function es(e,t=[],s=Js){return{type:14,loc:s,callee:e,arguments:t}}function Hi(e,t=void 0,s=!1,a=!1,n=Js){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function ud(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Js}}function P_(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Js}}function $_(e){return{type:21,body:e,loc:Js}}function ji(e,t){return e||t?ou:ru}function Vi(e,t){return e||t?fv:mv}function _u(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(ji(a,e.isComponent)),t(Yn),t(Vi(a,e.isComponent)))}const zp=new Uint8Array([123,123]),Hp=new Uint8Array([125,125]);function jp(e){return e>=97&&e<=122||e>=65&&e<=90}function qs(e){return e===32||e===10||e===9||e===12||e===13}function mn(e){return e===47||e===62||qs(e)}function vr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const vs={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class F_{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=zp,this.delimiterClose=Hp,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=zp,this.delimiterClose=Hp}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?mn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||qs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===vs.TitleEnd||this.currentSequence===vs.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===vs.Cdata[this.sequenceIndex]?++this.sequenceIndex===vs.Cdata.length&&(this.state=28,this.currentSequence=vs.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===vs.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):jp(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){mn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(mn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(vr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){qs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=jp(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||qs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):qs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):qs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||mn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||mn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||mn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||mn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||mn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):qs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):qs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){qs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=vs.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===vs.ScriptEnd[3]?this.startSpecial(vs.ScriptEnd,4):t===vs.StyleEnd[3]?this.startSpecial(vs.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===vs.TitleEnd[3]?this.startSpecial(vs.TitleEnd,4):t===vs.TextareaEnd[3]?this.startSpecial(vs.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===vs.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Vp(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Kn(e,t){const s=Vp("MODE",t),a=Vp(e,t);return s===3?a===!0:a!==!1}function ql(e,t,s,...a){return Kn(e,t)}function wu(e){throw e}function yv(e){}function Lt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Fs=e=>e.type===4&&e.isStatic;function xv(e){switch(e){case"Teleport":case"teleport":return El;case"Suspense":case"suspense":return lu;case"KeepAlive":case"keep-alive":return fr;case"BaseTransition":case"base-transition":return pv}}const U_=/^$|^\d|[^\$\w\xA0-\uFFFF]/,ku=e=>!U_.test(e),_v=/[A-Za-z_$\xA0-\uFFFF]/,B_=/[\.\?\w$\xA0-\uFFFF]/,z_=/\s+[.[]\s*|\s*[.[]\s+/g,wv=e=>e.type===4?e.content:e.loc.source,H_=e=>{const t=wv(e).trim().replace(z_,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?_v:B_).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},kv=H_,j_=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,V_=e=>j_.test(wv(e)),q_=V_;function aa(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Ke(t)?n.name===t:t.test(n.name)))return n}}function Gr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&zn(i.arg,t))return i}}function zn(e,t){return!!(e&&Fs(e)&&e.content===t)}function G_(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Tc(e){return e.type===5||e.type===2}function qp(e){return e.type===7&&e.name==="pre"}function W_(e){return e.type===7&&e.name==="slot"}function gr(e){return e.type===1&&e.tagType===3}function br(e){return e.type===1&&e.tagType===2}const K_=new Set([jl,lo]);function Sv(e,t=[]){if(e&&!Ke(e)&&e.type===14){const s=e.callee;if(!Ke(s)&&K_.has(s))return Sv(e.arguments[0],t.concat(e))}return[e,t]}function yr(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Ke(n)&&n.type===14){const o=Sv(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Ke(n))a=na([t]);else if(n.type===14){const o=n.arguments[0];!Ke(o)&&o.type===15?Gp(t,o)||o.properties.unshift(t):n.callee===bu?a=es(s.helper(mr),[na([t]),n]):n.arguments.unshift(na([t])),!a&&(a=n)}else n.type===15?(Gp(t,n)||n.properties.unshift(t),a=n):(a=es(s.helper(mr),[na([t]),n]),l&&l.callee===lo&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Gp(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function Gl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function J_(e){return e.type===14&&e.callee===xu?e.arguments[1].returns:e}const Z_=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Cv(e){for(let t=0;t<e.length;t++)if(!qs(e.charCodeAt(t)))return!1;return!0}function Su(e){return e.type===2&&Cv(e.content)||e.type===12&&Su(e.content)}function Tv(e){return e.type===3||Su(e)}const Ev={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ki,isPreTag:ki,isIgnoreNewlineTag:ki,isCustomElement:ki,onError:wu,onWarn:yv,comments:!1,prefixIdentifiers:!1};let ft=Ev,Wl=null,en="",bs=null,lt=null,Ns="",Ha=-1,Fn=-1,Cu=0,xn=!1,pd=null;const Ot=[],Bt=new F_(Ot,{onerr:Ua,ontext(e,t){Eo(rs(e,t),e,t)},ontextentity(e,t,s){Eo(e,t,s)},oninterpolation(e,t){if(xn)return Eo(rs(e,t),e,t);let s=e+Bt.delimiterOpen.length,a=t-Bt.delimiterClose.length;for(;qs(en.charCodeAt(s));)s++;for(;qs(en.charCodeAt(a-1));)a--;let n=rs(s,a);n.includes("&")&&(n=ft.decodeEntities(n,!1)),fd({type:5,content:Vo(n,!1,zt(s,a)),loc:zt(e,t)})},onopentagname(e,t){const s=rs(e,t);bs={type:1,tag:s,ns:ft.getNamespace(s,Ot[0],ft.ns),tagType:0,props:[],children:[],loc:zt(e-1,t),codegenNode:void 0}},onopentagend(e){Kp(e)},onclosetag(e,t){const s=rs(e,t);if(!ft.isVoidTag(s)){let a=!1;for(let n=0;n<Ot.length;n++)if(Ot[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&Ua(24,Ot[0].loc.start.offset);for(let l=0;l<=n;l++){const o=Ot.shift();jo(o,t,l<n)}break}a||Ua(23,Av(e,60))}},onselfclosingtag(e){const t=bs.tag;bs.isSelfClosing=!0,Kp(e),Ot[0]&&Ot[0].tag===t&&jo(Ot.shift(),e)},onattribname(e,t){lt={type:6,name:rs(e,t),nameLoc:zt(e,t),value:void 0,loc:zt(e)}},ondirname(e,t){const s=rs(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!xn&&a===""&&Ua(26,e),xn||a==="")lt={type:6,name:s,nameLoc:zt(e,t),value:void 0,loc:zt(e)};else if(lt={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Xe("prop")]:[],loc:zt(e)},a==="pre"){xn=Bt.inVPre=!0,pd=bs;const n=bs.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=lw(n[i]))}},ondirarg(e,t){if(e===t)return;const s=rs(e,t);if(xn&&!qp(lt))lt.name+=s,Hn(lt.nameLoc,t);else{const a=s[0]!=="[";lt.arg=Vo(a?s:s.slice(1,-1),a,zt(e,t),a?3:0)}},ondirmodifier(e,t){const s=rs(e,t);if(xn&&!qp(lt))lt.name+="."+s,Hn(lt.nameLoc,t);else if(lt.name==="slot"){const a=lt.arg;a&&(a.content+="."+s,Hn(a.loc,t))}else{const a=Xe(s,!0,zt(e,t));lt.modifiers.push(a)}},onattribdata(e,t){Ns+=rs(e,t),Ha<0&&(Ha=e),Fn=t},onattribentity(e,t,s){Ns+=e,Ha<0&&(Ha=t),Fn=s},onattribnameend(e){const t=lt.loc.start.offset,s=rs(t,e);lt.type===7&&(lt.rawName=s),bs.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&Ua(2,t)},onattribend(e,t){if(bs&&lt){if(Hn(lt.loc,t),e!==0)if(Ns.includes("&")&&(Ns=ft.decodeEntities(Ns,!0)),lt.type===6)lt.name==="class"&&(Ns=Iv(Ns).trim()),e===1&&!Ns&&Ua(13,t),lt.value={type:2,content:Ns,loc:e===1?zt(Ha,Fn):zt(Ha-1,Fn+1)},Bt.inSFCRoot&&bs.tag==="template"&&lt.name==="lang"&&Ns&&Ns!=="html"&&Bt.enterRCDATA(vr("</template"),0);else{let s=0;lt.exp=Vo(Ns,!1,zt(Ha,Fn),0,s),lt.name==="for"&&(lt.forParseResult=Q_(lt.exp));let a=-1;lt.name==="bind"&&(a=lt.modifiers.findIndex(n=>n.content==="sync"))>-1&&ql("COMPILER_V_BIND_SYNC",ft,lt.loc,lt.arg.loc.source)&&(lt.name="model",lt.modifiers.splice(a,1))}(lt.type!==7||lt.name!=="pre")&&bs.props.push(lt)}Ns="",Ha=Fn=-1},oncomment(e,t){ft.comments&&fd({type:3,content:rs(e,t),loc:zt(e-4,t+3)})},onend(){const e=en.length;for(let t=0;t<Ot.length;t++)jo(Ot[t],e-1),Ua(24,Ot[t].loc.start.offset)},oncdata(e,t){(Ot[0]?Ot[0].ns:ft.ns)!==0?Eo(rs(e,t),e,t):Ua(1,e-9)},onprocessinginstruction(e){(Ot[0]?Ot[0].ns:ft.ns)===0&&Ua(21,e-1)}}),Wp=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Y_=/^\(|\)$/g;function Q_(e){const t=e.loc,s=e.content,a=s.match(Z_);if(!a)return;const[,n,i]=a,l=(u,p,m=!1)=>{const h=t.start.offset+p,b=h+u.length;return Vo(u,!1,zt(h,b),0,m?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(Y_,"").trim();const c=n.indexOf(r),d=r.match(Wp);if(d){r=r.replace(Wp,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const m=d[2].trim();m&&(o.index=l(m,s.indexOf(m,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function rs(e,t){return en.slice(e,t)}function Kp(e){Bt.inSFCRoot&&(bs.innerLoc=zt(e+1,e+1)),fd(bs);const{tag:t,ns:s}=bs;s===0&&ft.isPreTag(t)&&Cu++,ft.isVoidTag(t)?jo(bs,e):(Ot.unshift(bs),(s===1||s===2)&&(Bt.inXML=!0)),bs=null}function Eo(e,t,s){{const i=Ot[0]&&Ot[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=ft.decodeEntities(e,!1))}const a=Ot[0]||Wl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,Hn(n.loc,s)):a.children.push({type:2,content:e,loc:zt(t,s)})}function jo(e,t,s=!1){s?Hn(e.loc,Av(t,60)):Hn(e.loc,X_(t,62)+1),Bt.inSFCRoot&&(e.children.length?e.innerLoc.end=at({},e.children[e.children.length-1].loc.end):e.innerLoc.end=at({},e.innerLoc.start),e.innerLoc.source=rs(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(xn||(a==="slot"?e.tagType=2:Jp(e)?e.tagType=3:tw(e)&&(e.tagType=1)),Bt.inRCDATA||(e.children=Rv(i)),n===0&&ft.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&ft.isPreTag(a)&&Cu--,pd===e&&(xn=Bt.inVPre=!1,pd=null),Bt.inXML&&(Ot[0]?Ot[0].ns:ft.ns)===0&&(Bt.inXML=!1);{const l=e.props;if(!Bt.inSFCRoot&&Kn("COMPILER_NATIVE_TEMPLATE",ft)&&e.tag==="template"&&!Jp(e)){const r=Ot[0]||Wl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&ql("COMPILER_INLINE_TEMPLATE",ft,o.loc)&&e.children.length&&(o.value={type:2,content:rs(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function X_(e,t){let s=e;for(;en.charCodeAt(s)!==t&&s<en.length-1;)s++;return s}function Av(e,t){let s=e;for(;en.charCodeAt(s)!==t&&s>=0;)s--;return s}const ew=new Set(["if","else","else-if","for","slot"]);function Jp({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&ew.has(t[s].name))return!0}return!1}function tw({tag:e,props:t}){if(ft.isCustomElement(e))return!1;if(e==="component"||sw(e.charCodeAt(0))||xv(e)||ft.isBuiltInComponent&&ft.isBuiltInComponent(e)||ft.isNativeTag&&!ft.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(ql("COMPILER_IS_ON_ELEMENT",ft,a.loc))return!0}}else if(a.name==="bind"&&zn(a.arg,"is")&&ql("COMPILER_IS_ON_ELEMENT",ft,a.loc))return!0}return!1}function sw(e){return e>64&&e<91}const aw=/\r\n/g;function Rv(e){const t=ft.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Cu)n.content=n.content.replace(aw,`
`);else if(Cv(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&nw(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=Iv(n.content))}return s?e.filter(Boolean):e}function nw(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Iv(e){let t="",s=!1;for(let a=0;a<e.length;a++)qs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function fd(e){(Ot[0]||Wl).children.push(e)}function zt(e,t){return{start:Bt.getPos(e),end:t==null?t:Bt.getPos(t),source:t==null?t:rs(e,t)}}function iw(e){return zt(e.start.offset,e.end.offset)}function Hn(e,t){e.end=Bt.getPos(t),e.source=rs(e.start.offset,t)}function lw(e){const t={type:6,name:e.rawName,nameLoc:zt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Vo(e,t=!1,s,a=0,n=0){return Xe(e,t,s,a)}function Ua(e,t,s){ft.onError(Lt(e,zt(t,t)))}function ow(){Bt.reset(),bs=null,lt=null,Ns="",Ha=-1,Fn=-1,Ot.length=0}function rw(e,t){if(ow(),en=e,ft=at({},Ev),t){let n;for(n in t)t[n]!=null&&(ft[n]=t[n])}Bt.mode=ft.parseMode==="html"?1:ft.parseMode==="sfc"?2:0,Bt.inXML=ft.ns===1||ft.ns===2;const s=t&&t.delimiters;s&&(Bt.delimiterOpen=vr(s[0]),Bt.delimiterClose=vr(s[1]));const a=Wl=D_([],e);return Bt.parse(en),a.loc=zt(0,e.length),a.children=Rv(a.children),Wl=null,a}function cw(e,t){qo(e,void 0,t,!!Ov(e))}function Ov(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!br(t[0])?t[0]:null}function qo(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Gs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const m=u.codegenNode;if(m.type===13){const h=m.patchFlag;if((h===void 0||h===512||h===1)&&Nv(u,s)>=2){const b=Mv(u);b&&(m.props=s.hoist(b))}m.dynamicProps&&(m.dynamicProps=s.hoist(m.dynamicProps))}}}else if(u.type===12&&(a?0:Gs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,qo(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)qo(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)qo(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Oe(e.codegenNode.children))e.codegenNode.children=r(Wn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Oe(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(Wn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Oe(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=aa(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(Wn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Oe(d.children)&&d.children.type===15){const p=d.children.properties.find(m=>m.key===u||m.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Gs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Nv(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Gs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Gs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Yn),t.removeHelper(Vi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(ji(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Gs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ke(o)||ws(o))continue;const r=Gs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const dw=new Set([vu,gu,jl,lo]);function Lv(e,t){if(e.type===14&&!Ke(e.callee)&&dw.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Gs(s,t);if(s.type===14)return Lv(s,t)}return 0}function Nv(e,t){let s=3;const a=Mv(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Gs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Gs(o,t):o.type===14?c=Lv(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Mv(e){const t=e.codegenNode;if(t.type===13)return t.props}function uw(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=us,isCustomElement:d=us,expressionPlugins:u=[],scopeId:p=null,slotted:m=!0,ssr:h=!1,inSSR:b=!1,ssrCssVars:_="",bindingMetadata:I=it,inline:x=!1,isTS:g=!1,onError:y=wu,onWarn:w=yv,compatConfig:S}){const E=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),A={filename:t,selfName:E&&ti(wt(E[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:m,ssr:h,inSSR:b,ssrCssVars:_,bindingMetadata:I,inline:x,isTS:g,onError:y,onWarn:w,compatConfig:S,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(k){const O=A.helpers.get(k)||0;return A.helpers.set(k,O+1),k},removeHelper(k){const O=A.helpers.get(k);if(O){const B=O-1;B?A.helpers.set(k,B):A.helpers.delete(k)}},helperString(k){return`_${zi[A.helper(k)]}`},replaceNode(k){A.parent.children[A.childIndex]=A.currentNode=k},removeNode(k){const O=A.parent.children,B=k?O.indexOf(k):A.currentNode?A.childIndex:-1;!k||k===A.currentNode?(A.currentNode=null,A.onNodeRemoved()):A.childIndex>B&&(A.childIndex--,A.onNodeRemoved()),A.parent.children.splice(B,1)},onNodeRemoved:us,addIdentifiers(k){},removeIdentifiers(k){},hoist(k){Ke(k)&&(k=Xe(k)),A.hoists.push(k);const O=Xe(`_hoisted_${A.hoists.length}`,!1,k.loc,2);return O.hoisted=k,O},cache(k,O=!1,B=!1){const T=P_(A.cached.length,k,O,B);return A.cached.push(T),T}};return A.filters=new Set,A}function pw(e,t){const s=uw(e,t);Wr(e,s),t.hoistStatic&&cw(e,s),t.ssr||fw(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function fw(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Ov(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&_u(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=Vl(t,s(Hl),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function mw(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Ke(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,Wr(n,t))}}function Wr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Oe(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(io);break;case 5:t.ssr||t.helper(qr);break;case 9:for(let i=0;i<e.branches.length;i++)Wr(e.branches[i],t);break;case 10:case 11:case 1:case 0:mw(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Dv(e,t){const s=Ke(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(W_))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const Kr="/*@__PURE__*/",Pv=e=>`${zi[e]}: _${zi[e]}`;function hw(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const m={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${zi[b]}`},push(b,_=-2,I){m.code+=b},indent(){h(++m.indentLevel)},deindent(b=!1){b?--m.indentLevel:h(--m.indentLevel)},newline(){h(m.indentLevel)}};function h(b){m.push(`
`+"  ".repeat(b),0)}return m}function vw(e,t={}){const s=hw(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,m=!i&&a!=="module";gw(e,s);const b=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${b}(${I}) {`),l(),m&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Pv).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Ec(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Ec(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Ec(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let x=0;x<e.temps;x++)n(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?_s(e.codegenNode,s):n("null"),m&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function gw(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[ou,ru,io,cu,hv].filter(p=>d.includes(p)).map(Pv).join(", ");n(`const { ${u} } = _Vue
`,-1)}bw(e.hoists,t),i(),n("return ")}function Ec(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?fu:t==="component"?du:pu);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${Gl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function bw(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),_s(i,t),a())}t.pure=!1}function Tu(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),oo(e,t,s),s&&t.deindent(),t.push("]")}function oo(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ke(o)?n(o,-3):Oe(o)?Tu(o,t):_s(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function _s(e,t){if(Ke(e)){t.push(e,-3);return}if(ws(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:_s(e.codegenNode,t);break;case 2:yw(e,t);break;case 4:$v(e,t);break;case 5:xw(e,t);break;case 12:_s(e.codegenNode,t);break;case 8:Fv(e,t);break;case 3:ww(e,t);break;case 13:kw(e,t);break;case 14:Cw(e,t);break;case 15:Tw(e,t);break;case 17:Ew(e,t);break;case 18:Aw(e,t);break;case 19:Rw(e,t);break;case 20:Iw(e,t);break;case 21:oo(e.body,t,!0,!1);break}}function yw(e,t){t.push(JSON.stringify(e.content),-3,e)}function $v(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function xw(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Kr),s(`${a(qr)}(`),_s(e.content,t),s(")")}function Fv(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Ke(a)?t.push(a,-3):_s(a,t)}}function _w(e,t){const{push:s}=t;if(e.type===8)s("["),Fv(e,t),s("]");else if(e.isStatic){const a=ku(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function ww(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Kr),s(`${a(io)}(${JSON.stringify(e.content)})`,-3,e)}function kw(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:m}=e;let h;r&&(h=String(r)),d&&s(a(mu)+"("),u&&s(`(${a(Yn)}(${p?"true":""}), `),n&&s(Kr);const b=u?Vi(t.inSSR,m):ji(t.inSSR,m);s(a(b)+"(",-2,e),oo(Sw([i,l,o,h,c]),t),s(")"),u&&s(")"),d&&(s(", "),_s(d,t),s(")"))}function Sw(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Cw(e,t){const{push:s,helper:a,pure:n}=t,i=Ke(e.callee)?e.callee:a(e.callee);n&&s(Kr),s(i+"(",-2,e),oo(e.arguments,t),s(")")}function Tw(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];_w(c,t),s(": "),_s(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function Ew(e,t){Tu(e.elements,t)}function Aw(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${zi[yu]}(`),s("(",-2,e),Oe(i)?oo(i,t):i&&_s(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Oe(l)?Tu(l,t):_s(l,t)):o&&_s(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Rw(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!ku(s.content);u&&l("("),$v(s,t),u&&l(")")}else l("("),_s(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),_s(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,_s(n,t),d||t.indentLevel--,i&&r(!0)}function Iw(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(hr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),_s(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(hr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Ow=Dv(/^(?:if|else|else-if)$/,(e,t,s)=>Lw(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Yp(n,r,s);else{const c=Nw(a.codegenNode);c.alternate=Yp(n,r+a.branches.length-1,s)}}}));function Lw(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(Lt(28,t.loc)),t.exp=Xe("true",!1,n)}if(t.name==="if"){const n=Zp(e,t),i={type:9,loc:iw(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&Tv(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(Lt(30,e.loc)),s.removeNode();const o=Zp(e,t);l.branches.push(o);const r=a&&a(l,o,!1);Wr(o,s),r&&r(),s.currentNode=null}else s.onError(Lt(30,e.loc));break}}}function Zp(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!aa(e,"for")?e.children:[e],userKey:Gr(e,"key"),isTemplateIf:s}}function Yp(e,t,s){return e.condition?ud(e.condition,Qp(e,t,s),es(s.helper(io),['""',"true"])):Qp(e,t,s)}function Qp(e,t,s){const{helper:a}=s,n=Gt("key",Xe(`${t}`,!1,Js,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return yr(r,n,s),r}else return Vl(s,a(Hl),na([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=J_(r);return c.type===13&&_u(c,s),yr(c,n,s),r}}function Nw(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Mw=Dv("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return Dw(e,t,s,i=>{const l=es(a(hu),[i.source]),o=gr(e),r=aa(e,"memo"),c=Gr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Xe(c.value.content,!0):void 0:c.exp);const u=d?Gt("key",d):null,p=i.source.type===4&&i.source.constType>0,m=p?64:c?128:256;return i.codegenNode=Vl(s,a(Hl),void 0,l,m,void 0,void 0,!0,!p,!1,e.loc),()=>{let h;const{children:b}=i,_=b.length!==1||b[0].type!==1,I=br(e)?e:o&&e.children.length===1&&br(e.children[0])?e.children[0]:null;if(I?(h=I.codegenNode,o&&u&&yr(h,u,s)):_?h=Vl(s,a(Hl),u?na([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(h=b[0].codegenNode,o&&u&&yr(h,u,s),h.isBlock!==!p&&(h.isBlock?(n(Yn),n(Vi(s.inSSR,h.isComponent))):n(ji(s.inSSR,h.isComponent))),h.isBlock=!p,h.isBlock?(a(Yn),a(Vi(s.inSSR,h.isComponent))):a(ji(s.inSSR,h.isComponent))),r){const x=Hi(md(i.parseResult,[Xe("_cached")]));x.body=$_([ma(["const _memo = (",r.exp,")"]),ma(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(bv)}(_cached, _memo)) return _cached`]),ma(["const _item = ",h]),Xe("_item.memo = _memo"),Xe("return _item")]),l.arguments.push(x,Xe("_cache"),Xe(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Hi(md(i.parseResult),h,!0))}})});function Dw(e,t,s,a){if(!t.exp){s.onError(Lt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(Lt(32,t.loc));return}Uv(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:gr(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const m=a&&a(p);return()=>{o.vFor--,m&&m()}}function Uv(e,t){e.finalized||(e.finalized=!0)}function md({value:e,key:t,index:s},a=[]){return Pw([e,t,s,...a])}function Pw(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Xe("_".repeat(a+1),!1))}const Xp=Xe("undefined",!1),$w=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=aa(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Fw=(e,t,s,a)=>Hi(e,s,!1,!0,s.length?s[0].loc:a);function Uw(e,t,s=Fw){t.helper(yu);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=aa(e,"slot",!0);if(r){const{arg:_,exp:I}=r;_&&!Fs(_)&&(o=!0),i.push(Gt(_||Xe("default",!0),s(I,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let m=0;for(let _=0;_<a.length;_++){const I=a[_];let x;if(!gr(I)||!(x=aa(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(r){t.onError(Lt(37,x.loc));break}c=!0;const{children:g,loc:y}=I,{arg:w=Xe("default",!0),exp:S,loc:E}=x;let A;Fs(w)?A=w?w.content:"default":o=!0;const k=aa(I,"for"),O=s(S,k,g,y);let B,T;if(B=aa(I,"if"))o=!0,l.push(ud(B.exp,Ao(w,O,m++),Xp));else if(T=aa(I,/^else(?:-if)?$/,!0)){let $=_,Q;for(;$--&&(Q=a[$],!!Tv(Q)););if(Q&&gr(Q)&&aa(Q,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=T.exp?ud(T.exp,Ao(w,O,m++),Xp):Ao(w,O,m++)}else t.onError(Lt(30,T.loc))}else if(k){o=!0;const $=k.forParseResult;$?(Uv($),l.push(es(t.helper(hu),[$.source,Hi(md($),Ao(w,O),!0)]))):t.onError(Lt(32,k.loc))}else{if(A){if(p.has(A)){t.onError(Lt(38,E));continue}p.add(A),A==="default"&&(d=!0)}i.push(Gt(w,O))}}if(!r){const _=(I,x)=>{const g=s(I,void 0,x,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Gt("default",g)};c?u.length&&!u.every(Su)&&(d?t.onError(Lt(39,u[0].loc)):i.push(_(void 0,u))):i.push(_(void 0,a))}const h=o?2:Go(e.children)?3:1;let b=na(i.concat(Gt("_",Xe(h+"",!1))),n);return l.length&&(b=es(t.helper(gv),[b,Wn(l)])),{slots:b,hasDynamicSlots:o}}function Ao(e,t,s){const a=[Gt("name",e),Gt("fn",t)];return s!=null&&a.push(Gt("key",Xe(String(s),!0))),na(a)}function Go(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Go(s.children))return!0;break;case 9:if(Go(s.branches))return!0;break;case 10:case 11:if(Go(s.children))return!0;break}}return!1}const Bv=new WeakMap,Bw=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?zw(e,t):`"${a}"`;const o=mt(l)&&l.callee===uu;let r,c,d=0,u,p,m,h=o||l===El||l===lu||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const b=zv(e,t,void 0,i,o);r=b.props,d=b.patchFlag,p=b.dynamicPropNames;const _=b.directives;m=_&&_.length?Wn(_.map(I=>jw(I,t))):void 0,b.shouldUseBlock&&(h=!0)}if(e.children.length>0)if(l===fr&&(h=!0,d|=1024),i&&l!==El&&l!==fr){const{slots:_,hasDynamicSlots:I}=Uw(e,t);c=_,I&&(d|=1024)}else if(e.children.length===1&&l!==El){const _=e.children[0],I=_.type,x=I===5||I===8;x&&Gs(_,t)===0&&(d|=1),x||I===2?c=_:c=e.children}else c=e.children;p&&p.length&&(u=Vw(p)),e.codegenNode=Vl(t,l,r,c,d===0?void 0:d,u,m,!!h,!1,i,e.loc)};function zw(e,t,s=!1){let{tag:a}=e;const n=hd(a),i=Gr(e,"is",!1,!0);if(i)if(n||Kn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Xe(i.value.content,!0):(o=i.exp,o||(o=Xe("is",!1,i.arg.loc))),o)return es(t.helper(uu),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=xv(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(du),t.components.add(a),Gl(a,"component"))}function zv(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let m=!1,h=0,b=!1,_=!1,I=!1,x=!1,g=!1,y=!1;const w=[],S=O=>{c.length&&(d.push(na(ef(c),o)),c=[]),O&&d.push(O)},E=()=>{t.scopes.vFor>0&&c.push(Gt(Xe("ref_for",!0),Xe("true")))},A=({key:O,value:B})=>{if(Fs(O)){const T=O.content,$=Xn(T);if($&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Ya(T)&&(x=!0),$&&Ya(T)&&(y=!0),$&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&Gs(B,t)>0)return;T==="ref"?b=!0:T==="class"?_=!0:T==="style"?I=!0:T!=="key"&&!w.includes(T)&&w.push(T),a&&(T==="class"||T==="style")&&!w.includes(T)&&w.push(T)}else g=!0};for(let O=0;O<s.length;O++){const B=s[O];if(B.type===6){const{loc:T,name:$,nameLoc:Q,value:W}=B;let M=!0;if($==="ref"&&(b=!0,E()),$==="is"&&(hd(l)||W&&W.content.startsWith("vue:")||Kn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Gt(Xe($,!0,Q),Xe(W?W.content:"",M,W?W.loc:T)))}else{const{name:T,arg:$,exp:Q,loc:W,modifiers:M}=B,L=T==="bind",D=T==="on";if(T==="slot"){a||t.onError(Lt(40,W));continue}if(T==="once"||T==="memo"||T==="is"||L&&zn($,"is")&&(hd(l)||Kn("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((L&&zn($,"key")||D&&p&&zn($,"vue:before-update"))&&(m=!0),L&&zn($,"ref")&&E(),!$&&(L||D)){if(g=!0,Q)if(L){if(S(),Kn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Q);continue}E(),S(),d.push(Q)}else S({type:14,loc:W,callee:t.helper(bu),arguments:a?[Q]:[Q,"true"]});else t.onError(Lt(L?34:35,W));continue}L&&M.some(re=>re.content==="prop")&&(h|=32);const le=t.directiveTransforms[T];if(le){const{props:re,needRuntime:z}=le(B,e,t);!i&&re.forEach(A),D&&$&&!Fs($)?S(na(re,o)):c.push(...re),z&&(u.push(B),ws(z)&&Bv.set(B,z))}else Mb(T)||(u.push(B),p&&(m=!0))}}let k;if(d.length?(S(),d.length>1?k=es(t.helper(mr),d,o):k=d[0]):c.length&&(k=na(ef(c),o)),g?h|=16:(_&&!a&&(h|=2),I&&!a&&(h|=4),w.length&&(h|=8),x&&(h|=32)),!m&&(h===0||h===32)&&(b||y||u.length>0)&&(h|=512),!t.inSSR&&k)switch(k.type){case 15:let O=-1,B=-1,T=!1;for(let W=0;W<k.properties.length;W++){const M=k.properties[W].key;Fs(M)?M.content==="class"?O=W:M.content==="style"&&(B=W):M.isHandlerKey||(T=!0)}const $=k.properties[O],Q=k.properties[B];T?k=es(t.helper(jl),[k]):($&&!Fs($.value)&&($.value=es(t.helper(vu),[$.value])),Q&&(I||Q.value.type===4&&Q.value.content.trim()[0]==="["||Q.value.type===17)&&(Q.value=es(t.helper(gu),[Q.value])));break;case 14:break;default:k=es(t.helper(jl),[es(t.helper(lo),[k])]);break}return{props:k,directives:u,patchFlag:h,dynamicPropNames:w,shouldUseBlock:m}}function ef(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Xn(i))&&Hw(l,n):(t.set(i,n),s.push(n))}return s}function Hw(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Wn([e.value,t.value],e.loc)}function jw(e,t){const s=[],a=Bv.get(e);a?s.push(t.helperString(a)):(t.helper(pu),t.directives.add(e.name),s.push(Gl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Xe("true",!1,n);s.push(na(e.modifiers.map(l=>Gt(l,i)),n))}return Wn(s,e.loc)}function Vw(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function hd(e){return e==="component"||e==="Component"}const qw=(e,t)=>{if(br(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Gw(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Hi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=es(t.helper(vv),l,a)}};function Gw(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=wt(l.name),n.push(l)));else if(l.name==="bind"&&zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=wt(l.arg.content);s=l.exp=Xe(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Fs(l.arg)&&(l.arg.content=wt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=zv(e,t,n,!1,!1);a=i,l.length&&t.onError(Lt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Hv=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(Lt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ai(wt(u)):`on:${u}`;o=Xe(p,!0,l.loc)}else o=ma([`${s.helperString(dd)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(dd)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=kv(r),p=!(u||q_(r)),m=r.content.includes(";");(p||c&&u)&&(r=ma([`${p?"$event":"(...args)"} => ${m?"{":"("}`,r,m?"}":")"]))}let d={props:[Gt(o,r||Xe("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Ww=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=wt(i.content):i.content=`${s.helperString(cd)}(${i.content})`:(i.children.unshift(`${s.helperString(cd)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&tf(i,"."),a.some(o=>o.content==="attr")&&tf(i,"^")),{props:[Gt(i,l)]}},tf=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Kw=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Tc(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Tc(r))a||(a=s[i]=ma([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Tc(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Gs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:es(t.helper(cu),o)}}}}},sf=new WeakSet,Jw=(e,t)=>{if(e.type===1&&aa(e,"once",!0))return sf.has(e)||t.inVOnce||t.inSSR?void 0:(sf.add(e),t.inVOnce=!0,t.helper(hr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},jv=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(Lt(41,e.loc)),cl();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(Lt(44,a.loc)),cl();if(o==="literal-const"||o==="setup-const")return s.onError(Lt(45,a.loc)),cl();if(!l.trim()||!kv(a))return s.onError(Lt(42,a.loc)),cl();const r=n||Xe("modelValue",!0),c=n?Fs(n)?`onUpdate:${wt(n.content)}`:ma(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=ma([`${u} => ((`,a,") = $event)"]);const p=[Gt(r,e.exp),Gt(c,d)];if(e.modifiers.length&&t.tagType===1){const m=e.modifiers.map(b=>b.content).map(b=>(ku(b)?b:JSON.stringify(b))+": true").join(", "),h=n?Fs(n)?`${n.content}Modifiers`:ma([n,' + "Modifiers"']):"modelModifiers";p.push(Gt(h,Xe(`{ ${m} }`,!1,e.loc,2)))}return cl(p)};function cl(e=[]){return{props:e}}const Zw=/[\w).+\-_$\]]/,Yw=(e,t)=>{Kn("COMPILER_FILTERS",t)&&(e.type===5?xr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&xr(s.exp,t)}))};function xr(e,t){if(e.type===4)af(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?af(a,t):a.type===8?xr(e,t):a.type===5&&xr(a.content,t))}}function af(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,m,h,b=[];for(m=0;m<s.length;m++)if(p=u,u=s.charCodeAt(m),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(m+1)!==124&&s.charCodeAt(m-1)!==124&&!o&&!r&&!c)h===void 0?(d=m+1,h=s.slice(0,m).trim()):_();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let I=m-1,x;for(;I>=0&&(x=s.charAt(I),x===" ");I--);(!x||!Zw.test(x))&&(l=!0)}}h===void 0?h=s.slice(0,m).trim():d!==0&&_();function _(){b.push(s.slice(d,m).trim()),d=m+1}if(b.length){for(m=0;m<b.length;m++)h=Qw(h,b[m],t);e.content=h,e.ast=void 0}}function Qw(e,t,s){s.helper(fu);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${Gl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${Gl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const nf=new WeakSet,Xw=(e,t)=>{if(e.type===1){const s=aa(e,"memo");return!s||nf.has(e)||t.inSSR?void 0:(nf.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&_u(a,t),e.codegenNode=es(t.helper(xu),[s.exp,Hi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},ek=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(Lt(53,a.loc)),s.exp=Xe("",!0,a.loc);else{const n=wt(a.content);(_v.test(n[0])||n[0]==="-")&&(s.exp=Xe(n,!1,a.loc))}}}};function tk(e){return[[ek,Jw,Ow,Xw,Mw,Yw,qw,Bw,$w,Kw],{on:Hv,bind:Ww,model:jv}]}function sk(e,t={}){const s=t.onError||wu,a=t.mode==="module";t.prefixIdentifiers===!0?s(Lt(48)):a&&s(Lt(49));const n=!1;t.cacheHandlers&&s(Lt(50)),t.scopeId&&!a&&s(Lt(51));const i=at({},t,{prefixIdentifiers:n}),l=Ke(e)?rw(e,i):e,[o,r]=tk();return pw(l,at({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:at({},r,t.directiveTransforms||{})})),vw(l,i)}const ak=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vv=Symbol(""),qv=Symbol(""),Gv=Symbol(""),Wv=Symbol(""),vd=Symbol(""),Kv=Symbol(""),Jv=Symbol(""),Zv=Symbol(""),Yv=Symbol(""),Qv=Symbol("");M_({[Vv]:"vModelRadio",[qv]:"vModelCheckbox",[Gv]:"vModelText",[Wv]:"vModelSelect",[vd]:"vModelDynamic",[Kv]:"withModifiers",[Jv]:"withKeys",[Zv]:"vShow",[Yv]:"Transition",[Qv]:"TransitionGroup"});let hi;function nk(e,t=!1){return hi||(hi=document.createElement("div")),t?(hi.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,hi.children[0].getAttribute("foo")):(hi.innerHTML=e,hi.textContent)}const ik={parseMode:"html",isVoidTag:Yb,isNativeTag:e=>Kb(e)||Jb(e)||Zb(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:nk,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Yv;if(e==="TransitionGroup"||e==="transition-group")return Qv},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},lk=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Xe("style",!0,t.loc),exp:ok(t.value.content,t.loc),modifiers:[],loc:t.loc})})},ok=(e,t)=>{const s=um(e);return Xe(JSON.stringify(s),!1,t,3)};function Sn(e,t){return Lt(e,t)}const rk=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(54,n)),t.children.length&&(s.onError(Sn(55,n)),t.children.length=0),{props:[Gt(Xe("innerHTML",!0,n),a||Xe("",!0))]}},ck=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(56,n)),t.children.length&&(s.onError(Sn(57,n)),t.children.length=0),{props:[Gt(Xe("textContent",!0),a?Gs(a,s)>0?a:es(s.helperString(qr),[a],n):Xe("",!0))]}},dk=(e,t,s)=>{const a=jv(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(Sn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Gv,o=!1;if(n==="input"||i){const r=Gr(t,"type");if(r){if(r.type===7)l=vd;else if(r.value)switch(r.value.content){case"radio":l=Vv;break;case"checkbox":l=qv;break;case"file":o=!0,s.onError(Sn(60,e.loc));break}}else G_(t)&&(l=vd)}else n==="select"&&(l=Wv);o||(a.needRuntime=s.helper(l))}else s.onError(Sn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},uk=Ks("passive,once,capture"),pk=Ks("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),fk=Ks("left,right"),Xv=Ks("onkeyup,onkeydown,onkeypress"),mk=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&ql("COMPILER_V_ON_NATIVE",s)||uk(r)?l.push(r):fk(r)?Fs(e)?Xv(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):pk(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},lf=(e,t)=>Fs(e)&&e.content.toLowerCase()==="onclick"?Xe(t,!0):e.type!==4?ma(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,hk=(e,t,s)=>Hv(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=mk(i,n,s,e.loc);if(r.includes("right")&&(i=lf(i,"onContextmenu")),r.includes("middle")&&(i=lf(i,"onMouseup")),r.length&&(l=es(s.helper(Kv),[l,JSON.stringify(r)])),o.length&&(!Fs(i)||Xv(i.content.toLowerCase()))&&(l=es(s.helper(Jv),[l,JSON.stringify(o)])),c.length){const d=c.map(ti).join("");i=Fs(i)?Xe(`${i.content}${d}`,!0):ma(["(",i,`) + "${d}"`])}return{props:[Gt(i,l)]}}),vk=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(62,n)),{props:[],needRuntime:s.helper(Zv)}},gk=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},bk=[lk],yk={cloak:ak,html:rk,text:ck,model:dk,on:hk,show:vk};function xk(e,t={}){return sk(e,at({},ik,t,{nodeTransforms:[gk,...bk,...t.nodeTransforms||[]],directiveTransforms:at({},yk,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const of=Object.create(null);function _k(e,t){if(!Ke(e))if(e.nodeType)e=e.innerHTML;else return us;const s=$b(e,t),a=of[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=at({hoistStatic:!0,onError:void 0,onWarn:us},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=xk(e,n),l=new Function("Vue",i)(A_);return l._rc=!0,of[s]=l}Ph(_k);const _r=Tn({items:[]});let wk=1;function Jr(e,t="info",s=3e3){const a=wk++;return _r.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Eu(a),s),a}function Eu(e){const t=_r.items.findIndex(s=>s.id===e);t>=0&&_r.items.splice(t,1)}function Ee(e,t="info",s=3e3){return Jr(e,t,s)}Ee.success=(e,t=3e3)=>Jr(e,"success",t);Ee.error=(e,t=5e3)=>Jr(e,"error",t);Ee.info=(e,t=3e3)=>Jr(e,"info",t);Ee.dismiss=Eu;const kk={setup(){return{state:_r,dismiss:Eu}},template:`
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
  `},qa=Tn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Mi=null;function is({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return Mi&&Mi(!1),qa.title=e,qa.message=t,qa.confirmLabel=s,qa.cancelLabel=a,qa.danger=n,qa.open=!0,new Promise(i=>{Mi=i})}function rf(e){qa.open=!1,Mi&&(Mi(e),Mi=null)}const Sk={setup(){function e(t){qa.open&&t.key==="Escape"&&(t.stopPropagation(),rf(!1))}return tt(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:qa,settle:rf}},template:`
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
 */const _i=typeof document<"u";function eg(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Ck(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&eg(e.default)}const yt=Object.assign;function Ac(e,t){const s={};for(const a in t){const n=t[a];s[a]=va(n)?n.map(e):e(n)}return s}const Al=()=>{},va=Array.isArray;function cf(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const tg=/#/g,Tk=/&/g,Ek=/\//g,Ak=/=/g,Rk=/\?/g,sg=/\+/g,Ik=/%5B/g,Ok=/%5D/g,ag=/%5E/g,Lk=/%60/g,ng=/%7B/g,Nk=/%7C/g,ig=/%7D/g,Mk=/%20/g;function Au(e){return e==null?"":encodeURI(""+e).replace(Nk,"|").replace(Ik,"[").replace(Ok,"]")}function Dk(e){return Au(e).replace(ng,"{").replace(ig,"}").replace(ag,"^")}function gd(e){return Au(e).replace(sg,"%2B").replace(Mk,"+").replace(tg,"%23").replace(Tk,"%26").replace(Lk,"`").replace(ng,"{").replace(ig,"}").replace(ag,"^")}function Pk(e){return gd(e).replace(Ak,"%3D")}function $k(e){return Au(e).replace(tg,"%23").replace(Rk,"%3F")}function Fk(e){return $k(e).replace(Ek,"%2F")}function Kl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Uk=/\/$/,Bk=e=>e.replace(Uk,"");function Rc(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=Vk(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:Kl(l)}}function zk(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function df(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Hk(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&qi(t.matched[a],s.matched[n])&&lg(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function qi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function lg(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!jk(e[s],t[s]))return!1;return!0}function jk(e,t){return va(e)?uf(e,t):va(t)?uf(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function uf(e,t){return va(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function Vk(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let bd=(function(e){return e.pop="pop",e.push="push",e})({}),Ic=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function qk(e){if(!e)if(_i){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Bk(e)}const Gk=/^[^#]+#/;function Wk(e,t){return e.replace(Gk,"#")+t}function Kk(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const Zr=()=>({left:window.scrollX,top:window.scrollY});function Jk(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Kk(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function pf(e,t){return(history.state?history.state.position-t:-1)+e}const yd=new Map;function Zk(e,t){yd.set(e,t)}function Yk(e){const t=yd.get(e);return yd.delete(e),t}function Qk(e){return typeof e=="string"||e&&typeof e=="object"}function og(e){return typeof e=="string"||typeof e=="symbol"}let Ut=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const rg=Symbol("");Ut.MATCHER_NOT_FOUND+"",Ut.NAVIGATION_GUARD_REDIRECT+"",Ut.NAVIGATION_ABORTED+"",Ut.NAVIGATION_CANCELLED+"",Ut.NAVIGATION_DUPLICATED+"";function Gi(e,t){return yt(new Error,{type:e,[rg]:!0},t)}function Ba(e,t){return e instanceof Error&&rg in e&&(t==null||!!(e.type&t))}const Xk=["params","query","hash"];function eS(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Xk)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function tS(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(sg," "),i=n.indexOf("="),l=Kl(i<0?n:n.slice(0,i)),o=i<0?null:Kl(n.slice(i+1));if(l in t){let r=t[l];va(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function ff(e){let t="";for(let s in e){const a=e[s];if(s=Pk(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(va(a)?a.map(n=>n&&gd(n)):[a&&gd(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function sS(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=va(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const aS=Symbol(""),mf=Symbol(""),Yr=Symbol(""),Ru=Symbol(""),xd=Symbol("");function dl(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function _n(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(Gi(Ut.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):Qk(p)?r(Gi(Ut.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Oc(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(eg(r)){const c=(r.__vccOpts||r)[t];c&&i.push(_n(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=Ck(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&_n(p,s,a,l,o,n)()}))}}return i}function nS(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>qi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>qi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let iS=()=>location.protocol+"//"+location.host;function cg(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),df(o,"")}return df(s,e)+a+n}function lS(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const m=cg(e,location),h=s.value,b=t.value;let _=0;if(p){if(s.value=m,t.value=p,l&&l===h){l=null;return}_=b?p.position-b.position:0}else a(m);n.forEach(I=>{I(s.value,h,{delta:_,type:bd.pop,direction:_?_>0?Ic.forward:Ic.back:Ic.unknown})})};function r(){l=s.value}function c(p){n.push(p);const m=()=>{const h=n.indexOf(p);h>-1&&n.splice(h,1)};return i.push(m),m}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(yt({},p.state,{scroll:Zr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function hf(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?Zr():null}}function oS(e){const{history:t,location:s}=window,a={value:cg(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:iS()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(m){console.error(m),s[d?"replace":"assign"](p)}}function l(r,c){i(r,yt({},t.state,hf(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=yt({},n.value,t.state,{forward:r,scroll:Zr()});i(d.current,d,!0),i(r,yt({},hf(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function rS(e){e=qk(e);const t=oS(e),s=lS(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=yt({location:"",base:e,go:a,createHref:Wk.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function cS(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),rS(e)}let jn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Qt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Qt||{});const dS={type:jn.Static,value:""},uS=/[a-zA-Z0-9_]/;function pS(e){if(!e)return[[]];if(e==="/")return[[dS]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(m){throw new Error(`ERR (${s})/"${c}": ${m}`)}let s=Qt.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Qt.Static?i.push({type:jn.Static,value:c}):s===Qt.Param||s===Qt.ParamRegExp||s===Qt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:jn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Qt.ParamRegExp){a=s,s=Qt.EscapeNext;continue}switch(s){case Qt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Qt.Param):p();break;case Qt.EscapeNext:p(),s=a;break;case Qt.Param:r==="("?s=Qt.ParamRegExp:uS.test(r)?p():(u(),s=Qt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Qt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Qt.ParamRegExpEnd:d+=r;break;case Qt.ParamRegExpEnd:u(),s=Qt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Qt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const vf="[^/]+?",fS={sensitive:!1,strict:!1,start:!0,end:!0};var Cs=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Cs||{});const mS=/[.+*?^${}()[\]/\\]/g;function hS(e,t){const s=yt({},fS,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Cs.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let m=Cs.Segment+(s.sensitive?Cs.BonusCaseSensitive:0);if(p.type===jn.Static)u||(n+="/"),n+=p.value.replace(mS,"\\$&"),m+=Cs.Static;else if(p.type===jn.Param){const{value:h,repeatable:b,optional:_,regexp:I}=p;i.push({name:h,repeatable:b,optional:_});const x=I||vf;if(x!==vf){m+=Cs.BonusCustomRegExp;try{`${x}`}catch(y){throw new Error(`Invalid custom RegExp for param "${h}" (${x}): `+y.message)}}let g=b?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(g=_&&c.length<2?`(?:/${g})`:"/"+g),_&&(g+="?"),n+=g,m+=Cs.Dynamic,_&&(m+=Cs.BonusOptional),b&&(m+=Cs.BonusRepeatable),x===".*"&&(m+=Cs.BonusWildcard)}d.push(m)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=Cs.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const m=d[p]||"",h=i[p-1];u[h.name]=m&&h.repeatable?m.split("/"):m}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const m of p)if(m.type===jn.Static)d+=m.value;else if(m.type===jn.Param){const{value:h,repeatable:b,optional:_}=m,I=h in c?c[h]:"";if(va(I)&&!b)throw new Error(`Provided param "${h}" is an array but it is not repeatable (* or + modifiers)`);const x=va(I)?I.join("/"):I;if(!x)if(_)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${h}"`);d+=x}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function vS(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===Cs.Static+Cs.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Cs.Static+Cs.Segment?1:-1:0}function dg(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=vS(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(gf(a))return 1;if(gf(n))return-1}return n.length-a.length}function gf(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const gS={strict:!1,end:!0,sensitive:!1};function bS(e,t,s){const a=hS(pS(e.path),s),n=yt(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function yS(e,t){const s=[],a=new Map;t=cf(gS,t);function n(u){return a.get(u)}function i(u,p,m){const h=!m,b=yf(u);b.aliasOf=m&&m.record;const _=cf(t,u),I=[b];if("alias"in u){const y=typeof u.alias=="string"?[u.alias]:u.alias;for(const w of y)I.push(yf(yt({},b,{components:m?m.record.components:b.components,path:w,aliasOf:m?m.record:b})))}let x,g;for(const y of I){const{path:w}=y;if(p&&w[0]!=="/"){const S=p.record.path,E=S[S.length-1]==="/"?"":"/";y.path=p.record.path+(w&&E+w)}if(x=bS(y,p,_),m?m.alias.push(x):(g=g||x,g!==x&&g.alias.push(x),h&&u.name&&!xf(x)&&l(u.name)),ug(x)&&r(x),b.children){const S=b.children;for(let E=0;E<S.length;E++)i(S[E],x,m&&m.children[E])}m=m||x}return g?()=>{l(g)}:Al}function l(u){if(og(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=wS(u,s);s.splice(p,0,u),u.record.name&&!xf(u)&&a.set(u.record.name,u)}function c(u,p){let m,h={},b,_;if("name"in u&&u.name){if(m=a.get(u.name),!m)throw Gi(Ut.MATCHER_NOT_FOUND,{location:u});_=m.record.name,h=yt(bf(p.params,m.keys.filter(g=>!g.optional).concat(m.parent?m.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&bf(u.params,m.keys.map(g=>g.name))),b=m.stringify(h)}else if(u.path!=null)b=u.path,m=s.find(g=>g.re.test(b)),m&&(h=m.parse(b),_=m.record.name);else{if(m=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!m)throw Gi(Ut.MATCHER_NOT_FOUND,{location:u,currentLocation:p});_=m.record.name,h=yt({},p.params,u.params),b=m.stringify(h)}const I=[];let x=m;for(;x;)I.unshift(x.record),x=x.parent;return{name:_,path:b,params:h,matched:I,meta:_S(I)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function bf(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function yf(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:xS(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function xS(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function xf(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function _S(e){return e.reduce((t,s)=>yt(t,s.meta),{})}function wS(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;dg(e,t[i])<0?a=i:s=i+1}const n=kS(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function kS(e){let t=e;for(;t=t.parent;)if(ug(t)&&dg(e,t)===0)return t}function ug({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function _f(e){const t=ia(Yr),s=ia(Ru),a=V(()=>{const r=Ea(e.to);return t.resolve(r)}),n=V(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(qi.bind(null,d));if(p>-1)return p;const m=wf(r[c-2]);return c>1&&wf(d)===m&&u[u.length-1].path!==m?u.findIndex(qi.bind(null,r[c-2])):p}),i=V(()=>n.value>-1&&AS(s.params,a.value.params)),l=V(()=>n.value>-1&&n.value===s.matched.length-1&&lg(s.params,a.value.params));function o(r={}){if(ES(r)){const c=t[Ea(e.replace)?"replace":"push"](Ea(e.to)).catch(Al);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:V(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function SS(e){return e.length===1?e[0]:e}const CS=so({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:_f,setup(e,{slots:t}){const s=Tn(_f(e)),{options:a}=ia(Yr),n=V(()=>({[kf(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[kf(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&SS(t.default(s));return e.custom?i:Fi("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),TS=CS;function ES(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function AS(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!va(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function wf(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const kf=(e,t,s)=>e??t??s,RS=so({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=ia(xd),n=V(()=>e.route||a.value),i=ia(mf,0),l=V(()=>{let c=Ea(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=V(()=>n.value.matched[l.value]);kl(mf,V(()=>l.value+1)),kl(aS,o),kl(xd,n);const r=f();return Kt(()=>[r.value,o.value,e.name],([c,d,u],[p,m,h])=>{d&&(d.instances[u]=c,m&&m!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=m.leaveGuards),d.updateGuards.size||(d.updateGuards=m.updateGuards))),c&&d&&(!m||!qi(d,m)||!p)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return Sf(s.default,{Component:p,route:c});const m=u.props[d],h=m?m===!0?c.params:typeof m=="function"?m(c):m:null,_=Fi(p,yt({},h,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return Sf(s.default,{Component:_,route:c})||_}}});function Sf(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const IS=RS;function OS(e){const t=yS(e.routes,e),s=e.parseQuery||tS,a=e.stringifyQuery||ff,n=e.history,i=dl(),l=dl(),o=dl(),r=Ud(hn);let c=hn;_i&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Ac.bind(null,K=>""+K),u=Ac.bind(null,Fk),p=Ac.bind(null,Kl);function m(K,pe){let ge,xe;return og(K)?(ge=t.getRecordMatcher(K),xe=pe):xe=K,t.addRoute(xe,ge)}function h(K){const pe=t.getRecordMatcher(K);pe&&t.removeRoute(pe)}function b(){return t.getRoutes().map(K=>K.record)}function _(K){return!!t.getRecordMatcher(K)}function I(K,pe){if(pe=yt({},pe||r.value),typeof K=="string"){const P=Rc(s,K,pe.path),G=t.resolve({path:P.path},pe),de=n.createHref(P.fullPath);return yt(P,G,{params:p(G.params),hash:Kl(P.hash),redirectedFrom:void 0,href:de})}let ge;if(K.path!=null)ge=yt({},K,{path:Rc(s,K.path,pe.path).path});else{const P=yt({},K.params);for(const G in P)P[G]==null&&delete P[G];ge=yt({},K,{params:u(P)}),pe.params=u(pe.params)}const xe=t.resolve(ge,pe),ke=K.hash||"";xe.params=d(p(xe.params));const He=zk(a,yt({},K,{hash:Dk(ke),path:xe.path})),R=n.createHref(He);return yt({fullPath:He,hash:ke,query:a===ff?sS(K.query):K.query||{}},xe,{redirectedFrom:void 0,href:R})}function x(K){return typeof K=="string"?Rc(s,K,r.value.path):yt({},K)}function g(K,pe){if(c!==K)return Gi(Ut.NAVIGATION_CANCELLED,{from:pe,to:K})}function y(K){return E(K)}function w(K){return y(yt(x(K),{replace:!0}))}function S(K,pe){const ge=K.matched[K.matched.length-1];if(ge&&ge.redirect){const{redirect:xe}=ge;let ke=typeof xe=="function"?xe(K,pe):xe;return typeof ke=="string"&&(ke=ke.includes("?")||ke.includes("#")?ke=x(ke):{path:ke},ke.params={}),yt({query:K.query,hash:K.hash,params:ke.path!=null?{}:K.params},ke)}}function E(K,pe){const ge=c=I(K),xe=r.value,ke=K.state,He=K.force,R=K.replace===!0,P=S(ge,xe);if(P)return E(yt(x(P),{state:typeof P=="object"?yt({},ke,P.state):ke,force:He,replace:R}),pe||ge);const G=ge;G.redirectedFrom=pe;let de;return!He&&Hk(a,xe,ge)&&(de=Gi(Ut.NAVIGATION_DUPLICATED,{to:G,from:xe}),z(xe,xe,!0,!1)),(de?Promise.resolve(de):O(G,xe)).catch(F=>Ba(F)?Ba(F,Ut.NAVIGATION_GUARD_REDIRECT)?F:re(F):D(F,G,xe)).then(F=>{if(F){if(Ba(F,Ut.NAVIGATION_GUARD_REDIRECT))return E(yt({replace:R},x(F.to),{state:typeof F.to=="object"?yt({},ke,F.to.state):ke,force:He}),pe||G)}else F=T(G,xe,!0,R,ke);return B(G,xe,F),F})}function A(K,pe){const ge=g(K,pe);return ge?Promise.reject(ge):Promise.resolve()}function k(K){const pe=J.values().next().value;return pe&&typeof pe.runWithContext=="function"?pe.runWithContext(K):K()}function O(K,pe){let ge;const[xe,ke,He]=nS(K,pe);ge=Oc(xe.reverse(),"beforeRouteLeave",K,pe);for(const P of xe)P.leaveGuards.forEach(G=>{ge.push(_n(G,K,pe))});const R=A.bind(null,K,pe);return ge.push(R),fe(ge).then(()=>{ge=[];for(const P of i.list())ge.push(_n(P,K,pe));return ge.push(R),fe(ge)}).then(()=>{ge=Oc(ke,"beforeRouteUpdate",K,pe);for(const P of ke)P.updateGuards.forEach(G=>{ge.push(_n(G,K,pe))});return ge.push(R),fe(ge)}).then(()=>{ge=[];for(const P of He)if(P.beforeEnter)if(va(P.beforeEnter))for(const G of P.beforeEnter)ge.push(_n(G,K,pe));else ge.push(_n(P.beforeEnter,K,pe));return ge.push(R),fe(ge)}).then(()=>(K.matched.forEach(P=>P.enterCallbacks={}),ge=Oc(He,"beforeRouteEnter",K,pe,k),ge.push(R),fe(ge))).then(()=>{ge=[];for(const P of l.list())ge.push(_n(P,K,pe));return ge.push(R),fe(ge)}).catch(P=>Ba(P,Ut.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function B(K,pe,ge){o.list().forEach(xe=>k(()=>xe(K,pe,ge)))}function T(K,pe,ge,xe,ke){const He=g(K,pe);if(He)return He;const R=pe===hn,P=_i?history.state:{};ge&&(xe||R?n.replace(K.fullPath,yt({scroll:R&&P&&P.scroll},ke)):n.push(K.fullPath,ke)),r.value=K,z(K,pe,ge,R),re()}let $;function Q(){$||($=n.listen((K,pe,ge)=>{if(!ve.listening)return;const xe=I(K),ke=S(xe,ve.currentRoute.value);if(ke){E(yt(ke,{replace:!0,force:!0}),xe).catch(Al);return}c=xe;const He=r.value;_i&&Zk(pf(He.fullPath,ge.delta),Zr()),O(xe,He).catch(R=>Ba(R,Ut.NAVIGATION_ABORTED|Ut.NAVIGATION_CANCELLED)?R:Ba(R,Ut.NAVIGATION_GUARD_REDIRECT)?(E(yt(x(R.to),{force:!0}),xe).then(P=>{Ba(P,Ut.NAVIGATION_ABORTED|Ut.NAVIGATION_DUPLICATED)&&!ge.delta&&ge.type===bd.pop&&n.go(-1,!1)}).catch(Al),Promise.reject()):(ge.delta&&n.go(-ge.delta,!1),D(R,xe,He))).then(R=>{R=R||T(xe,He,!1),R&&(ge.delta&&!Ba(R,Ut.NAVIGATION_CANCELLED)?n.go(-ge.delta,!1):ge.type===bd.pop&&Ba(R,Ut.NAVIGATION_ABORTED|Ut.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),B(xe,He,R)}).catch(Al)}))}let W=dl(),M=dl(),L;function D(K,pe,ge){re(K);const xe=M.list();return xe.length?xe.forEach(ke=>ke(K,pe,ge)):console.error(K),Promise.reject(K)}function le(){return L&&r.value!==hn?Promise.resolve():new Promise((K,pe)=>{W.add([K,pe])})}function re(K){return L||(L=!K,Q(),W.list().forEach(([pe,ge])=>K?ge(K):pe()),W.reset()),K}function z(K,pe,ge,xe){const{scrollBehavior:ke}=e;if(!_i||!ke)return Promise.resolve();const He=!ge&&Yk(pf(K.fullPath,0))||(xe||!ge)&&history.state&&history.state.scroll||null;return Ht().then(()=>ke(K,pe,He)).then(R=>R&&Jk(R)).catch(R=>D(R,K,pe))}const Y=K=>n.go(K);let ie;const J=new Set,ve={currentRoute:r,listening:!0,addRoute:m,removeRoute:h,clearRoutes:t.clearRoutes,hasRoute:_,getRoutes:b,resolve:I,options:e,push:y,replace:w,go:Y,back:()=>Y(-1),forward:()=>Y(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:M.add,isReady:le,install(K){K.component("RouterLink",TS),K.component("RouterView",IS),K.config.globalProperties.$router=ve,Object.defineProperty(K.config.globalProperties,"$route",{enumerable:!0,get:()=>Ea(r)}),_i&&!ie&&r.value===hn&&(ie=!0,y(n.location).catch(xe=>{}));const pe={};for(const xe in hn)Object.defineProperty(pe,xe,{get:()=>r.value[xe],enumerable:!0});K.provide(Yr,ve),K.provide(Ru,Fd(pe)),K.provide(xd,r);const ge=K.unmount;J.add(K),K.unmount=function(){J.delete(K),J.size<1&&(c=hn,$&&$(),$=null,r.value=hn,ie=!1,L=!1),ge()}}};function fe(K){return K.reduce((pe,ge)=>pe.then(()=>k(ge)),Promise.resolve())}return ve}function pg(){return ia(Yr)}function LS(e){return ia(Ru)}const Qr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=LS(),s=pg(),a=V({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Kt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Jl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Ia=e=>Number.isSafeInteger(e)&&e>=0,NS=e=>e===null||typeof e=="string",wr=(e,t)=>Ia(e)&&Ia(t)&&t>=e,Iu=e=>Jl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&NS(e.cursor);function MS(e){return!Iu(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&Jl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!Ia(e.total_chars)||!Ia(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!wr(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&Jl(e.tail)&&typeof e.tail.text=="string"&&wr(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function Cf(e){return Iu(e)&&e.kind==="process_output"&&Ia(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>Ia(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&wr(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function DS(e){return Iu(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>Ia(e[t]))&&wr(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&Ia(e.tools_omitted)}function _d(e){try{return JSON.parse(e)}catch{return}}const wd=e=>JSON.stringify(e,null,2),PS=e=>{const t=_d(e);return t===void 0?e:wd(t)},Ro=(e,t,s)=>`[${e}, ${t}) ${s}`;function fg(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:wd(e)??"";let a=typeof e=="string"?_d(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=_d(e.slice(d+c.length)),m=e.slice(0,u);Cf(p)&&!("text"in p)&&m.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?PS(d):d});if(Jl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||Ia(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...Ia(a.original_chars)?[`original ${a.original_chars} code points`]:[]],Jl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(MS(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Ro(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Ro(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(Cf(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Ro(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(DS(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Ro(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?wd(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function mg(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Lc=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),$S=e=>e!==null&&typeof e=="object",FS=new Set(["_hmac","_prev_hmac"]),kd=e=>e.replace(/\r\n?/g,`
`);function Zl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(FS.has(n)){s=!0;return}return i});return kd(s?JSON.stringify(a):t)}catch{return kd(t)}}function US(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&$S(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function BS(e){var m;const t=fg(typeof e=="string"?kd(e):e,{prettyPrint:!1}),s=t.sections.map(h=>({...h,text:Zl(h.text)})),a=s.map(h=>h.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Lc.inlineChars||o&&n.length>0,c=s.filter(h=>h.text).map(h=>{let b=h.text;try{b=JSON.stringify(JSON.parse(b),null,2)}catch{}return h.label?`${h.label}
${b}`:b}).join(`

`).replace(/\n$/,""),d=mg(c,Lc.previewLines,Lc.previewChars),u=t.kind==="audit_preview"?(m=t.metadata)==null?void 0:m.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:US(t)}}const zS={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=V(()=>BS(e.value)),c=V(()=>{const y=e.rawValue===void 0?e.value:e.rawValue;return typeof y=="string"?y:JSON.stringify(y,null,2)??""}),d=V(()=>a.value?c.value:r.value.formatted),u=V(()=>r.value.promoted&&r.value.preview.folded||o.value),p=V(()=>t.value?!!d.value:r.value.promoted),m=V(()=>p.value?"":r.value.summary);let h;function b(){if(t.value)return;const y=r.value.promoted?i.value:l.value;o.value=!!(y&&(y.scrollHeight>y.clientHeight+1||y.scrollWidth>y.clientWidth+1))}function _(){h==null||h.disconnect();for(const y of[i.value,l.value])y&&(h==null||h.observe(y));b()}function I(){t.value=!t.value,t.value||(a.value=!1)}function x(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const y=e.value;try{await navigator.clipboard.writeText(d.value),y===e.value&&(n.value="Copied")}catch{y===e.value&&(n.value="Copy unavailable — select text manually")}}return Kt([()=>e.value,()=>e.rawValue,()=>e.recordId],(y,w)=>{(e.recordId===null||y[2]!==w[2])&&(t.value=!1,a.value=!1),n.value=""}),Kt([i,l,t,s,r],()=>Ht(_),{flush:"post"}),tt(()=>{h=new ResizeObserver(b),_()}),_t(()=>h==null?void 0:h.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:m,toggleExpanded:I,toggleRaw:x,copyOutput:g}},template:`
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
    </section>`},Xr={name:"ToolOutput",components:{CompactOutput:zS},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=V(()=>fg(e.value)),l=V(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=V(()=>{let u=30,p=6e3;return l.value.map(m=>{const h=mg(m.text,u,p);return u=Math.max(0,u-h.lines),p=Math.max(0,p-h.chars),{...m,display:t.value?m.text:h.text,folded:h.folded}})}),r=V(()=>o.value.some(u=>u.folded)),c=V(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Kt(()=>e.value,()=>{t.value=!1,n.value=""}),Kt(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},HS={components:{ToolOutput:Xr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var b,_,I,x,g,y,w,S,E,A,k;const m=p.payload||p,h=m.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(h)&&!(m.agent_id||(b=m.metadata)!=null&&b.agent_id))&&!(["loop_tool_start","loop_tool"].includes(h)&&!(m.call_id||(_=m.metadata)!=null&&_.call_id))){if(h==="tool_start"||h==="loop_tool_start"){const O=m.call_id||((I=m.metadata)==null?void 0:I.call_id)||null,B=m.agent_id||((x=m.metadata)==null?void 0:x.agent_id)||"",T={callId:O,agentId:B,agentLabel:m.agent_label||((g=m.metadata)==null?void 0:g.agent_label)||"",toolInput:m.tool_input,id:O?`${B}:${O}`:`${m.action}-${Date.now()}`,tool:m.action,actor:m.actor||"",channel:m.channel_id||"",iteration:m.iteration??((y=m.metadata)==null?void 0:y.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(h==="tool_end"||h==="loop_tool"){const O=m.call_id||((w=m.metadata)==null?void 0:w.call_id)||null,B=m.agent_id||((S=m.metadata)==null?void 0:S.agent_id)||"";let T=-1;if(O&&(T=e.value.findIndex($=>$.callId===O&&$.agentId===B&&$.status==="running")),T<0&&!O)for(let $=e.value.length-1;$>=0;$--){const Q=e.value[$];if(Q.tool===m.action&&Q.agentId===B&&Q.status==="running"){T=$;break}}if(T>=0){const $=e.value[T];$.status=m.error||(E=m.metadata)!=null&&E.error||["error","failed","cancelled","denied","outcome_unknown"].includes(m.status||((A=m.metadata)==null?void 0:A.status))?"error":"success",$.elapsed=m.execution_time_ms??m.duration_ms??((k=m.metadata)==null?void 0:k.elapsed_ms)??Date.now()-$.startTime,$.result=m.result_summary??m.detail??"",$.fadingOut=!0,setTimeout(()=>{const Q=e.value.indexOf($);Q>=0&&e.value.splice(Q,1),t.value.unshift($),t.value.length>a&&t.value.pop()},5e3)}return}if(h==="tool_stream"){const O=m.call_id||m.tool_name||"unknown";if(m.finished){const B={...s.value};delete B[O],s.value=B}else{const T=((s.value[O]||"")+(m.chunk||"")).split(`
`);s.value={...s.value,[O]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(m=>{m.status==="running"&&(m.elapsed=p-m.startTime)})}let o=!1;function r(){o||(o=!0,ut.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,ut.off("events",n),i&&(clearInterval(i),i=null))}tt(r),ls(r),Jt(c),_t(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Ou(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ai(e){const t=Ou(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function jS(e){const t=Ou(e);return t?t.toLocaleTimeString():"—"}function hg(e){const t=Ou(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function VS(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Wi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Lu(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function vg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Tf(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Nu(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function gg(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const bg=Symbol("agent-detail-cancelled"),qS=15e3;function GS(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((m,h)=>{r=m,c=h});function u(m,h){o||(o=!0,l!==null&&n(l),l=null,(m?r:c)(h))}let p;try{p=e(i==null?void 0:i.signal)}catch(m){u(!1,m)}return o||Promise.resolve(p).then(m=>u(!0,m),m=>u(!1,m)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const m=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${m}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,bg),i==null||i.abort()}}}function yg({state:e,requestDetail:t,timeoutMs:s=qS,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:m,coalesce:h}){if(!p)return Promise.resolve();if(h&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const b={agentId:p,cancel:null,promise:null};l=b,m?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const _=GS(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return b.cancel=_.cancel,b.promise=(async()=>{let I=null,x=null;try{I=await _.promise}catch(g){x=g}I!==bg&&(l!==b||e.detailId!==p||(l=null,!x&&(I===null||typeof I!="object")&&(x=new Error(`${a} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function WS({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const KS={components:{ToolOutput:Xr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=V(()=>e.value.filter(D=>D.status==="running").length),r=V(()=>e.value.filter(D=>D.status==="completed").length),c=V(()=>e.value.filter(D=>["failed","timeout","killed"].includes(D.status)).length),d=V(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=V(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(D=>["failed","timeout","killed"].includes(D.status)):e.value.filter(D=>D.status===i.value));function p(D){const le=Number(D.max_iterations)||0;return le<=0?0:Math.min(100,Math.round(D.iteration_count/le*100))}function m(D){return(Number(D.max_iterations)||0)>0}function h(D,le){return D?D==="N/A"?"N/A":le==="current_inheritance"?`inherit (currently ${D})`:D:"unknown"}function b(D){return h(D.display_model,D.display_model_source||D.display_source)}function _(D){return h(D.display_reasoning_effort,D.display_reasoning_effort_source||D.display_source)}function I(D){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[D]||""}const x=f(null),g=f(null),y=f(!1),w=f(null),S=f(""),A=yg({state:{get detail(){return x.value},set detail(D){x.value=D},get detailId(){return g.value},set detailId(D){g.value=D},get detailLoading(){return y.value},set detailLoading(D){y.value=D},get detailError(){return w.value},set detailError(D){w.value=D}},requestDetail:(D,{signal:le})=>j.get(`/api/agents/${encodeURIComponent(D)}`,{signal:le})});async function k(D){S.value="",await A.open(D.id)}function O(){A.close(),S.value=""}async function B(){await A.refresh()}async function T(D,le){try{await navigator.clipboard.writeText(le||""),S.value=D,setTimeout(()=>{S.value===D&&(S.value="")},1500)}catch{Ee.error("Copy failed")}}async function $(D=!1){D=D===!0,D||(t.value=!0);try{const le=await j.get("/api/agents");e.value=Array.isArray(le)?le:[],s.value=null}catch(le){D||(s.value=le.message)}D||(t.value=!1)}async function Q(D){const le=e.value.find(z=>z.id===D);if(await is({title:"Kill agent",message:`Kill agent "${(le==null?void 0:le.label)||D}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=D;try{await j.del(`/api/agents/${encodeURIComponent(D)}`),Ee.success("Agent killed"),await $()}catch(z){Ee.error(z.message||"Failed to kill agent")}a.value=null}}const W=WS({isEnabled:()=>n.value&&l,refreshList:()=>$(!0),hasOpenDetail:()=>!!g.value,refreshDetail:B});function M(){W.start()}function L(){W.stop()}return Kt(n,()=>W.sync()),tt(()=>{l=!0,$(),M()}),ls(()=>{l=!0,$(!0),M()}),Jt(()=>{l=!1,L()}),_t(()=>{l=!1,L(),A.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ai,formatDuration:Wi,progressPercent:p,hasProgress:m,displayModelText:b,displayEffortText:_,displaySourceLabel:I,detail:x,detailId:g,detailLoading:y,detailError:w,copied:S,openDetail:k,closeDetail:O,copyText:T,fetchAgents:$,killAgent:Q,startAutoRefresh:M,stopAutoRefresh:L}}},JS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),m=f("");let h=!1;const _=yg({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:D})=>j.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:D})});async function I(L){m.value="",await _.open(L.id)}function x(){_.close(),m.value=""}async function g(L,D){try{await navigator.clipboard.writeText(D||""),m.value=L,setTimeout(()=>{m.value===L&&(m.value="")},1500)}catch{Ee.error("Copy failed")}}const y=V(()=>e.value.reduce((L,D)=>L+(D.iteration_count||0),0)),w=V(()=>e.value.filter(L=>L.status==="running").length);function S(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function E(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function A(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function k(L=!1){L=L===!0,L||(t.value=!0);try{const D=await j.get("/api/loops");e.value=Array.isArray(D)?D:[],s.value=null}catch(D){L||(s.value=D.message)}L||(t.value=!1)}async function O(){l.value=null;const L=n.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const D={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(D.stop_condition=L.stop_condition.trim()),i.value=!0;try{const le=await j.post("/api/loops",D);Ee.success(`Loop started: ${le.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await k()}catch(le){l.value=le.message}i.value=!1}async function B(L){if(await is({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await j.del(`/api/loops/${encodeURIComponent(L)}`),Ee.success("Loop stopped"),await k()}catch(le){Ee.error(le.message||"Failed to stop loop")}o.value=null}}async function T(L){r.value=L;try{await j.post(`/api/loops/${encodeURIComponent(L)}/restart`),Ee.success("Loop restarted"),await k()}catch(D){Ee.error(D.message||"Failed to restart loop")}r.value=null}function $(L){h&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(k(!0),d.value&&_.refresh())}let Q=null;function W(){Q!==null&&clearInterval(Q),Q=null}function M(){W(),h&&(Q=setInterval(()=>{k(!0),d.value&&_.refresh()},5e3))}return tt(()=>{h=!0,k(),ut.subscribe("events",$),M()}),ls(()=>{h=!0,k(!0),M()}),Jt(()=>{h=!1,W()}),_t(()=>{h=!1,ut.unsubscribe("events",$),W(),_.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:m,totalIterations:y,runningCount:w,statusDotClass:S,statusBadge:E,modeBadge:A,formatAge:hg,formatDuration:Wi,formatTs:ai,formatTokens:gg,openDetail:I,closeDetail:x,copyText:g,fetchLoops:k,doCreate:O,doStop:B,doRestart:T}}},ZS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=V(()=>e.value.filter(x=>x.status==="running").length),o=V(()=>e.value.filter(x=>x.status!=="running").length);function r(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await j.get("/api/processes"),s.value=null}catch(g){x||(s.value=g.message)}x||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Kt(a,x=>{x?u():p()});async function m(x){if(await is({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await j.del(`/api/processes/${x}`),Ee.success(`Process ${x} killed`),await d()}catch(y){Ee.error(y.message||"Failed to kill process")}i.value=null}}function h(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let b=!1;function _(){b||(b=!0,d(),ut.subscribe("events",h),u())}function I(){b&&(b=!1,ut.unsubscribe("events",h),p())}return tt(_),ls(_),Jt(I),_t(I),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:Wi,fetchProcesses:d,doKill:m}}},YS=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Ef(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function QS(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function XS(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function e1(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=YS.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),m=new Date(u+864e5).getTimezoneOffset(),h=[];for(const _ of new Set([p,m])){const I=new Date(u+_*6e4);QS(I,c)===d&&(h.some(x=>x.getTime()===I.getTime())||h.push(I))}if(h.sort((_,I)=>_.getTime()-I.getTime()),h.length===0)return{state:"nonexistent",typed:t};if(h.length>1)return{state:"ambiguous",typed:t,options:h.map(_=>({instant:_,offset:XS(_),iso:_.toISOString()}))};const b=h[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const t1=5e3;function Wo(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function Io(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function Af(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:Wo(e.data.connection)}function s1(e){return e!=="webhook"}function Rf(e,t){return!s1(t)||(e==null?void 0:e.available)===!0}const a1={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(Wo(null)),n=V(()=>a.value.available),i=V(()=>Io(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=V(()=>Rf(a.value,r.value.action));function p(F){return Rf(a.value,F)}const m=f(null),h=V(()=>e1(r.value.run_at));Kt(()=>r.value.run_at,()=>{m.value=null});const b=V(()=>{var Z;const F=h.value;return F.state==="ok"?F.instant:F.state==="ambiguous"&&m.value!==null&&((Z=F.options[m.value])==null?void 0:Z.instant)||null}),_=V(()=>{const F=b.value;return F?`${F.toLocaleString()} local — ${F.toISOString()} UTC`:""}),I=f(null),x=f(!1),g=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],y=f(null),w=f(null),S=f(null),E=f(null),A=f(null),k=f(null),O=f([]),B=f(!1),T=f("");let $=0;const Q=V(()=>e.value.filter(F=>F.cron&&!F.one_time).length),W=V(()=>e.value.filter(F=>F.one_time).length),M=V(()=>e.value.filter(F=>F.trigger).length),L=V(()=>e.value.filter(F=>F.paused).length),D=V(()=>e.value.filter(F=>F.consecutive_failures>0).length);function le(F){if(!F)return"-";const Z=Date.now(),H=(new Date(F).getTime()-Z)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const se=Math.floor(H/3600),ye=Math.floor(H%3600/60);return ye>0?`in ${se}h ${ye}m`:`in ${se}h`}const te=Math.floor(H/86400);return`in ${te} day${te!==1?"s":""}`}function re(F){return F==null?"-":F<1e3?`${F}ms`:F<6e4?`${(F/1e3).toFixed(1)}s`:Wi(F/1e3)}function z(F=r.value.cron){r.value.cron=F,Ef(r.value,"cron"),I.value=null}function Y(F=r.value.run_at){r.value.run_at=F,Ef(r.value,"run_at"),I.value=null}async function ie(){const F=r.value.cron.trim();if(F){x.value=!0;try{I.value=await j.post("/api/schedules/validate-cron",{expression:F})}catch(Z){I.value={valid:!1,error:Z.message}}x.value=!1}}async function J(){t.value=!0,s.value=null;try{e.value=await j.get("/api/schedules")}catch(F){s.value=F.message}t.value=!1}async function ve(){try{a.value=Wo(await j.get("/api/schedules/status"))}catch(F){a.value=Af(F)||Wo(null)}}function fe(F){const Z=Af(F);Z&&(a.value=Z)}async function K(F){if(k.value===F){k.value=null,O.value=[];return}k.value=F,B.value=!0,O.value=[];const Z=++$;try{const ue=await j.get(`/api/schedules/${encodeURIComponent(F)}/history?limit=10`);if(Z!==$||k.value!==F)return;O.value=ue,T.value=""}catch(ue){if(Z!==$||k.value!==F)return;O.value=[],T.value=ue.message||"Failed to load execution history"}Z===$&&(B.value=!1)}async function pe(){if(d.value=null,!p(r.value.action)){d.value=Io(a.value);return}const F=r.value;if(!F.description.trim()){d.value="Description is required";return}if(F.action!=="webhook"&&!F.channel_id.trim()){d.value="Channel ID is required";return}if(!F.cron.trim()&&!F.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(F.cron.trim()&&F.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Z={description:F.description.trim(),action:F.action,channel_id:F.channel_id.trim()};if(F.cron.trim()&&(Z.cron=F.cron.trim()),F.run_at.trim()){const ue=h.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const H=b.value;if(ue.state==="ambiguous"&&m.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!H){d.value="One-time run time could not be resolved";return}Z.run_at=H.toISOString()}if(F.action==="reminder"&&F.message.trim()&&(Z.message=F.message.trim()),F.action==="check"&&(F.tool_name.trim()&&(Z.tool_name=F.tool_name.trim()),F.report_format&&(Z.report_format=F.report_format),F.tool_input_str.trim()))try{Z.tool_input=JSON.parse(F.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if(F.action==="webhook"){if(!F.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:F.webhook_url.trim(),method:F.webhook_method};if(F.webhook_headers_str.trim())try{const H=JSON.parse(F.webhook_headers_str.trim());if(!H||Array.isArray(H)||typeof H!="object")throw new Error("not an object");ue.headers=H}catch{d.value="Webhook headers must be a valid JSON object";return}if(F.webhook_body&&(ue.body=F.webhook_body),F.webhook_expected_status_str.trim()){const H=F.webhook_expected_status_str.split(",").map(te=>Number(te.trim()));if(H.some(te=>!Number.isInteger(te)||te<100||te>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=H}Z.webhook_config=ue}c.value=!0;try{await j.post("/api/schedules",Z),Ee.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},I.value=null,o.value=!1,await J()}catch(ue){fe(ue),d.value=ue.message}c.value=!1}async function ge(F){if(!p(F.action)){Ee.error(Io(a.value));return}const Z=F.id;y.value=Z;try{const ue=await j.post(`/api/schedules/${encodeURIComponent(Z)}/run`);if(ue.status==="failure")Ee.error(`Execution failed: ${ue.error||"unknown error"}`);else{const H=ue.warning?`Executed (${ue.warning})`:"Executed successfully";Ee.success(H)}await J()}catch(ue){fe(ue),Ee.error(ue.message||"Failed to trigger")}y.value=null}async function xe(F){if(F.paused&&!p(F.action)){Ee.error(Io(a.value));return}S.value=F.id;const Z=!F.paused;try{await j.put(`/api/schedules/${encodeURIComponent(F.id)}`,{paused:Z}),Ee.success(Z?"Schedule paused":"Schedule resumed"),await J()}catch(ue){fe(ue),Ee.error(ue.message||"Failed to update schedule")}S.value=null}const ke=new Map;function He(F,Z){const ue=ke.get(F.id);ue&&clearTimeout(ue.timer);const H={run:()=>R(F,Z),timer:null};H.timer=setTimeout(()=>{ke.delete(F.id),H.run()},500),ke.set(F.id,H)}async function R(F,Z){A.value=F.id;try{await j.put(`/api/schedules/${encodeURIComponent(F.id)}`,{report_format:Z}),Ee.success(Z?"Structured report enabled":"Plain-text report enabled")}catch(ue){Ee.error(`Update failed: ${ue.message}`)}finally{await J(),A.value=null}}function P(){for(const[F,Z]of[...ke])clearTimeout(Z.timer),ke.delete(F),Z.run()}async function G(F){E.value=F;try{await j.post(`/api/schedules/${encodeURIComponent(F)}/reset-failures`),Ee.success("Failure counters reset"),await J()}catch(Z){Ee.error(Z.message||"Failed to reset")}E.value=null}async function de(F){const Z=e.value.find(H=>H.id===F);if(await is({title:"Delete schedule",message:`Delete "${(Z==null?void 0:Z.description)||F}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){w.value=F;try{await j.del(`/api/schedules/${encodeURIComponent(F)}`),Ee.success("Schedule deleted"),await J()}catch(H){Ee.error(H.message||"Failed to delete schedule")}w.value=null}}return tt(()=>{J(),ve(),l=setInterval(ve,t1)}),_t(()=>{P(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:_,runAtAnalysis:h,runAtOccurrence:m,cronResult:I,validatingCron:x,cronPresets:g,runningId:y,deletingId:w,togglingId:S,resettingId:E,reportUpdatingId:A,flushReportFormatTimers:P,expandedId:k,history:O,historyLoading:B,historyError:T,cronCount:Q,oneTimeCount:W,webhookCount:M,pausedCount:L,failingCount:D,formatTs:ai,formatAge:hg,formatFuture:le,formatMs:re,formatDuration:Wi,onCronInput:z,onRunAtInput:Y,validateCron:ie,toggleExpand:K,fetchSchedules:J,fetchSchedulingAvailability:ve,doCreate:pe,doRunNow:ge,doTogglePause:xe,doUpdateReportFormat:He,doResetFailures:G,doDelete:de}}},xg=[{id:"live",label:"Live",component:HS},{id:"agents",label:"Agents",component:KS},{id:"loops",label:"Loops",component:JS},{id:"processes",label:"Processes",component:ZS},{id:"schedules",label:"Schedules",component:a1}],n1={components:{TabbedPage:Qr},setup(){return{tabs:xg}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},i1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(h){if(!h)return"";if(typeof h=="string")return h;try{return JSON.stringify(h,null,2)}catch{return String(h)}}function l(h){a.value=a.value===h?null:h}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},m()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await j.get("/api/audit/verify")}catch(h){h.status===409&&h.data&&typeof h.data=="object"?d.value=h.data.availability==="not_enabled"?{...h.data,not_enabled:!0}:h.data:(d.value=null,u.value=h.message||"verification request failed")}c.value=!1}async function m(){const h=++r;t.value=!0,s.value=null,a.value=null;try{const b=new URLSearchParams;n.value.tool&&b.set("tool",n.value.tool),n.value.user&&b.set("user",n.value.user),n.value.keyword&&b.set("q",n.value.keyword),n.value.date&&b.set("date",n.value.date),b.set("limit",String(n.value.limit));const _=b.toString(),I=await j.get(`/api/audit${_?"?"+_:""}`);if(h!==r)return;e.value=Array.isArray(I)?I:[]}catch(b){if(h!==r)return;s.value=b.message}h===r&&(t.value=!1)}return tt(()=>{m()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:ai,formatDetail:i,truncateBlock:vg,toggleExpand:l,clearFilters:o,fetchAudit:m,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},If=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],l1=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],o1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),m=f("last_active"),h=f(!1),b=If,_=l1,I=f([]),x=f(!1),g=f(""),y=f("flat"),w=f(new Set),S=f(""),E=f(""),A=f(""),k=f(null),O=f(!1),B=f(""),T=f(!1);let $=0;Kt([S,E,A],()=>{$++,O.value=!1,B.value="",T.value=k.value!==null},{flush:"sync"});function Q(){try{const ne=localStorage.getItem("odin-session-presets");ne&&(I.value=JSON.parse(ne))}catch{}}function W(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const M=V(()=>p.value.trim()!==""||u.value!=="all"),L=V(()=>{let ne=[...e.value];const Le=If.find(nt=>nt.id===u.value),$e=Le?Le.filters:{};if($e.source&&(ne=ne.filter(nt=>nt.source===$e.source)),$e.minMessages&&(ne=ne.filter(nt=>nt.message_count>=$e.minMessages)),$e.hasCompaction&&(ne=ne.filter(nt=>nt.has_summary)),$e.maxAge!=null){const nt=Date.now()/1e3;ne=ne.filter(Mt=>Mt.last_active&&nt-Mt.last_active<=$e.maxAge)}if(p.value.trim()){const nt=p.value.toLowerCase().trim();ne=ne.filter(Mt=>(Mt.channel_id||"").toLowerCase().includes(nt)||(Mt.last_user_id||"").toLowerCase().includes(nt)||(Mt.source||"").toLowerCase().includes(nt))}const ot=m.value,Yt=h.value?1:-1;return ne.sort((nt,Mt)=>{const Dt=nt[ot]||0,ps=Mt[ot]||0;return(Dt-ps)*Yt}),ne}),D=V(()=>{if(!n.value||!n.value.messages)return[];const ne=n.value.messages;if(ne.length===0)return[];const Le=[];let $e=[];for(const ot of ne)ot.role==="user"&&$e.length>0&&(Le.push($e),$e=[]),$e.push(ot);return $e.length>0&&Le.push($e),Le}),le=V(()=>L.value.length>0&&c.value.size===L.value.length);function re(ne){const Le=ne.find($e=>$e.role==="user");if(Le&&Le.content){const $e=Le.content.slice(0,120);return $e.length<Le.content.length?$e+"...":$e}return"(no user message)"}function z(ne){const Le=new Set(w.value);Le.has(ne)?Le.delete(ne):Le.add(ne),w.value=Le}function Y(ne){u.value=ne}function ie(ne){u.value=ne.id,ne.filters.searchQuery!=null&&(p.value=ne.filters.searchQuery),ne.filters.sortBy&&(m.value=ne.filters.sortBy)}function J(){if(!g.value.trim())return;const ne={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:m.value}};I.value=[...I.value,ne],W(),x.value=!1,g.value=""}function ve(ne){I.value=I.value.filter(Le=>Le.id!==ne),W(),u.value===ne&&(u.value="all")}function fe(){u.value="all",p.value="",m.value="last_active",h.value=!1}function K(ne){if(!ne)return"—";const Le=Date.now()/1e3-ne;if(Le<60)return"just now";if(Le<3600){const ot=Math.floor(Le/60);return`${ot} minute${ot!==1?"s":""} ago`}if(Le<86400){const ot=Math.floor(Le/3600);return`${ot} hour${ot!==1?"s":""} ago`}const $e=Math.floor(Le/86400);return`${$e} day${$e!==1?"s":""} ago`}function pe(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ge(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString()}catch{return""}}function xe(ne){return ne==="user"?"bg-gray-900/50 border border-gray-800":ne==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ke(ne){return ne==="user"?"sess-msg-user":ne==="assistant"?"sess-msg-assistant":"sess-msg-system"}function He(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":"badge-warning"}function R(ne){return ne==="user"?"sess-dot-user":ne==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(ne){return ne==="user"?"text-cyan-400":ne==="assistant"?"text-indigo-400":"text-gray-500"}function G(ne){return ne?ne.length>2e3?ne.slice(0,2e3)+`
... (truncated)`:ne:""}async function de(){const ne=S.value.trim();if(!ne)return;const Le=++$;O.value=!0,B.value="",T.value=k.value!==null;try{let $e=`/api/sessions/search?q=${encodeURIComponent(ne)}&limit=50`;E.value.trim()&&($e+=`&channel_id=${encodeURIComponent(E.value.trim())}`),A.value.trim()&&($e+=`&user_id=${encodeURIComponent(A.value.trim())}`);const ot=await j.get($e);if(Le!==$)return;k.value=ot.results||[],T.value=!1}catch($e){if(Le!==$)return;B.value=$e.message||"Search failed. Please retry."}finally{Le===$&&(O.value=!1)}}function F(){$++,S.value="",E.value="",A.value="",k.value=null,B.value="",T.value=!1,O.value=!1}function Z(ne){return ne?ne.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(ne){return ne==="user"?"fts-result-user":ne==="assistant"?"fts-result-assistant":ne==="summary"?"fts-result-summary":ne==="fts"?"fts-result-fts":ne==="channel"?"fts-result-channel":"fts-result-default"}function H(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":ne==="summary"?"badge-warning":ne==="fts"?"badge-success":"badge-info"}let te=0;async function se(){const ne=++te;t.value=!0,s.value=null;try{const Le=await j.get("/api/sessions");if(ne!==te)return;e.value=Le}catch(Le){if(ne!==te)return;s.value=Le.message}ne===te&&(t.value=!1)}function ye(){s.value=null,se()}async function he(ne){if(a.value===ne){a.value=null,n.value=null,w.value=new Set;return}a.value=ne,n.value=null,i.value=!0,w.value=new Set;const Le=++l;try{const $e=await j.get(`/api/sessions/${encodeURIComponent(ne)}`);Le===l&&a.value===ne&&(n.value=$e)}catch($e){Le===l&&a.value===ne&&(n.value={messages:[],summary:"",error:$e.message||"Failed to load session"})}finally{Le===l&&(i.value=!1)}}function me(ne){const Le=new Set(c.value);Le.has(ne)?Le.delete(ne):Le.add(ne),c.value=Le}function be(){le.value?c.value=new Set:c.value=new Set(L.value.map(ne=>ne.channel_id))}function Pe(ne){o.value=ne}async function Ge(){if(o.value){r.value=!0;try{await j.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await se()}catch(ne){s.value=ne.message||"Failed to clear session"}r.value=!1,o.value=null}}function De(){d.value=!0}async function Be(){if(c.value.size!==0){r.value=!0;try{await j.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await se()}catch(ne){s.value=ne.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ve(ne,Le){const $e=`/api/sessions/${encodeURIComponent(ne)}/export?format=${Le}`;try{const ot=await j.getBlob($e),Yt=URL.createObjectURL(ot),nt=document.createElement("a");nt.href=Yt,nt.download=`session-${ne}.${Le==="text"?"txt":"json"}`,nt.click(),URL.revokeObjectURL(Yt)}catch(ot){s.value=ot.message||"Failed to export session"}}let rt=null;function Je(ne){ne.payload&&ne.payload.channel_id&&(clearTimeout(rt),rt=setTimeout(()=>{if(se(),a.value&&ne.payload.channel_id===a.value){const Le=a.value,$e=l;j.get(`/api/sessions/${encodeURIComponent(Le)}`).then(ot=>{$e!==l||a.value!==Le||(n.value=ot)}).catch(()=>{})}},2e3))}let ee=!1,Se=null;function Re(){ee||(ee=!0,se(),ut.subscribe("events",Je),Se=ut.onReconnected(()=>se()))}tt(()=>{Q(),Re()}),ls(()=>{Re()});function Ae(){ee&&(ee=!1,ut.unsubscribe("events",Je),Se&&(Se(),Se=null),clearTimeout(rt))}return Jt(Ae),_t(Ae),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:le,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:m,sortAsc:h,filterPresets:b,sortOptions:_,filteredSessions:L,hasActiveFilters:M,customPresets:I,showSavePreset:x,newPresetName:g,threadView:y,threads:D,collapsedThreads:w,ftsQuery:S,ftsChannelId:E,ftsUserId:A,ftsResults:k,ftsSearching:O,ftsError:B,ftsStale:T,formatAge:K,formatTimestamp:pe,formatFullTimestamp:ge,messageClass:xe,threadMsgClass:ke,roleBadge:He,roleDotClass:R,roleLabelClass:P,truncateContent:G,threadSummary:re,fetchSessions:se,retry:ye,toggleSession:he,toggleSelect:me,toggleSelectAll:be,confirmClear:Pe,clearSession:Ge,confirmBulkClear:De,doBulkClear:Be,exportSession:Ve,applyPreset:Y,applyCustomPreset:ie,saveCustomPreset:J,removeCustomPreset:ve,resetFilters:fe,toggleThread:z,runFtsSearch:de,clearFtsSearch:F,highlightSnippet:Z,ftsResultClass:ue,ftsTypeBadge:H}}},r1={props:["trace"],template:`
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
  `,setup(){return{formatTokens:gg}}},c1={components:{ContextAssemblyPanel:r1},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(E){if(!E)return"—";try{const A=new Date(E);return isNaN(A.getTime())?E:A.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return E}}function p(E){return!E&&E!==0?"—":E<1e3?E+"ms":(E/1e3).toFixed(1)+"s"}function m(E){return!E&&E!==0?"—":E>=1e3?(E/1e3).toFixed(1)+"k":String(E)}function h(E){if(!E)return"";if(typeof E=="string")return E;try{return JSON.stringify(E,null,2)}catch{return String(E)}}function b(E){n.value===E?n.value=null:(n.value=E,c.value={})}function _(E,A){const k=E+"-"+A;c.value={...c.value,[k]:!c.value[k]}}function I(E,A){return!!c.value[E+"-"+A]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,w()}async function g(){try{const E=await j.get("/api/trajectories");e.value=E.files||[],r.value=E.count||0}catch{}}let y=0;async function w(){const E=++y;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const A=await j.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(E!==y)return;let k=A.entries||[];d.value.tool_name&&(k=k.filter(O=>(O.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(k=k.filter(O=>O.is_error)),d.value.channel_id&&(k=k.filter(O=>O.channel_id===d.value.channel_id)),d.value.user_id&&(k=k.filter(O=>O.user_id===d.value.user_id)),t.value=k}else{const A=new URLSearchParams;d.value.channel_id&&A.set("channel_id",d.value.channel_id),d.value.user_id&&A.set("user_id",d.value.user_id),d.value.tool_name&&A.set("tool_name",d.value.tool_name),d.value.errors_only&&A.set("errors_only","true"),A.set("limit",String(d.value.limit));const k=A.toString(),O=await j.get(`/api/trajectories/search/query?${k}`);if(E!==y)return;t.value=O.results||[]}}catch(A){if(E!==y)return;a.value=A.message}E===y&&(s.value=!1)}async function S(){if(!l.value.trim())return;const E=++y;s.value=!0,a.value=null,c.value={};try{const A=await j.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(E!==y)return;i.value=A.entry||null,i.value||(a.value="No trace found for this message ID")}catch(A){if(E!==y)return;A.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=A.message}E===y&&(s.value=!1)}return tt(async()=>{await g(),await w()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:m,formatJSON:h,truncateBlock:vg,toggleExpand:b,toggleIteration:_,isIterationExpanded:I,clearFilters:x,fetchFiles:g,fetchTraces:w,lookupMessage:S}}};function d1(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function u1(e){return e?`${e.approximate?"~":""}${Nu(e.total||0)}`:"0"}const p1={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=V(()=>a.value.work||{}),m=E=>E==null?"Not reported":`$${Number(E).toFixed(6)}`,h=V(()=>Math.max(1,...(a.value.activity_over_time||[]).map(E=>Number(E.count||0)))),b=V(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),_=E=>({height:`${Math.max(4,Math.round(Number(E||0)/h.value*100))}%`}),I=V(()=>s.value&&l.value-i.value>3e4);async function x(){const E=++d,A=n.value;try{const k=await j.get(`/api/usage?range=${encodeURIComponent(A)}`);if(E!==d||A!==n.value)return;a.value=k,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(k){E===d&&(t.value=k.message)}finally{E===d&&(e.value=!1)}}function g(E){n.value=E,e.value=!s.value,x()}function y(){e.value=!0,x()}function w(){c||(c=!0,x(),o=setInterval(x,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function S(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return tt(w),ls(w),Jt(S),_t(S),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:I,fmtNum:Nu,fmtDuration:d1,tokenLabel:u1,formatActualCost:m,activityTrackStyle:b,activityBar:_,selectRange:g,retry:y}}},_g=[{id:"audit",label:"Audit",component:i1},{id:"sessions",label:"Sessions",component:o1},{id:"traces",label:"Traces",component:c1},{id:"usage",label:"Usage & Activity",component:p1}],f1={components:{TabbedPage:Qr},setup(){return{tabs:_g}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Nc=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],m1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(k){return k.source!=="builtin"?"":u[k.state]||""}function m(k,O){const B=k&&Array.isArray(k.tools)?k.tools:null;if(c.value=!!B,r.value=B?!!k.global_enabled:null,!B){e.value=O.map(Q=>({...Q,source:"unknown",enabled:void 0,state:null}));return}const T=new Set(B.map(Q=>Q.name)),$=O.filter(Q=>!T.has(Q.name)).map(Q=>({...Q,source:Q.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...B.map(Q=>({...Q,source:"builtin"})),...$]}async function h(k,O){if(d.value.has(k.name))return;const B=!!O.target.checked,T=new Set(d.value);T.add(k.name),d.value=T;try{const $=await j.post(`/api/tools/builtins/${encodeURIComponent(k.name)}/enabled`,{enabled:B});m($,e.value),s.value=null;try{const Q=await j.get("/api/tools");m($,Q)}catch(Q){console.warn("Built-in toggle committed; visible catalog refresh failed",Q)}}catch($){O.target.checked=!!k.enabled,s.value=$.message||`Failed to toggle ${k.name}`}finally{const $=new Set(d.value);$.delete(k.name),d.value=$}}const b=V(()=>e.value.filter(k=>k.source==="builtin"&&k.is_core).length),_=V(()=>e.value.filter(k=>k.source==="skill").length),I=V(()=>Object.values(n.value).reduce((k,O)=>k+O,0));function x(k){for(const O of Nc)if(O.id!=="other"&&O.match(k))return O.id;return"other"}const g=V(()=>{let k=e.value;if(a.value){const O=a.value.toLowerCase();k=k.filter(B=>B.name.toLowerCase().includes(O)||(B.description||"").toLowerCase().includes(O))}return o.value&&(k=k.filter(O=>x(O.name)===o.value)),k}),y=V(()=>{const k=new Set;for(const O of e.value)k.add(x(O.name));return Nc.filter(O=>k.has(O.id))}),w=V(()=>{const k=g.value,O={};for(const T of k){const $=x(T.name);O[$]||(O[$]=[]),O[$].push(T)}const B=[];for(const T of Nc)O[T.id]&&O[T.id].length>0&&B.push({label:T.label,icon:T.icon,tools:O[T.id].sort(($,Q)=>$.name.localeCompare(Q.name))});return B});function S(k){i.value={...i.value,[k]:!i.value[k]}}async function E(){t.value=!0,s.value=null;try{const[k,O,B]=await Promise.all([j.get("/api/tools"),j.get("/api/tools/stats").catch(()=>({})),j.get("/api/tools/builtins").catch(()=>null)]);m(B,k),n.value=O||{}}catch(k){s.value=k.message}t.value=!1}function A(){E()}return tt(()=>{E()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:b,skillCount:_,totalUsage:I,filteredTools:g,groupedTools:w,usedCategories:y,stateBadge:p,applyInventory:m,toggleBuiltinTool:h,truncate:Lu,toggleExpand:S,refresh:A}}};function h1(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function v1(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const g1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),m=f(null),h=f(!1),b=f(null),_=f(null),I=f(!1),x=V(()=>e.value.length),g=V(()=>e.value.reduce((J,ve)=>J+(ve.execution_count||0),0)),y=V(()=>e.value.reduce((J,ve)=>J+O(ve.code),0)),w=V(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(ve=>ve.name.toLowerCase().includes(J)||(ve.description||"").toLowerCase().includes(J))}),S=V(()=>u.value?u.value.split(`
`).length:0),E=V(()=>{const J=Math.max(S.value,1);return Array.from({length:J},(ve,fe)=>fe+1).join(`
`)}),A=V(()=>{const J=u.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function k(J){return h1(J)}function O(J){return J?J.split(`
`).length:0}function B(J){return v1(J)}function T(J){a.value={...a.value,[J]:!a.value[J]}}async function $(J){try{await navigator.clipboard.writeText(J);const ve=e.value.find(fe=>fe.code===J);ve&&(o.value=ve.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Q(J){if(J.key==="Tab"){J.preventDefault();const ve=J.target,fe=ve.selectionStart,K=ve.selectionEnd;u.value=u.value.substring(0,fe)+"    "+u.value.substring(K),Ht(()=>{ve.selectionStart=ve.selectionEnd=fe+4})}}function W(J){const ve=J.target.previousElementSibling;ve&&(ve.scrollTop=J.target.scrollTop)}async function M(){t.value=!0,s.value=null;try{e.value=await j.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function L(J){i.value=J,delete n.value[J],n.value={...n.value};try{const ve=await j.post(`/api/skills/${encodeURIComponent(J)}/test`);n.value={...n.value,[J]:ve}}catch(ve){n.value={...n.value,[J]:{result:ve.message,is_error:!0}}}i.value=null}function D(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,m.value=null}function le(J){r.value=!0,c.value="edit",d.value=J.name,u.value=J.code||"",p.value=null,m.value=null}function re(){r.value=!1,p.value=null,m.value=null}async function z(){p.value=null,m.value=null;const J=d.value.trim(),ve=u.value.trim();if(!J){p.value="Name is required";return}if(!ve){p.value="Code is required";return}h.value=!0;try{c.value==="create"?(await j.post("/api/skills",{name:J,code:ve}),m.value="Skill created successfully"):(await j.put(`/api/skills/${encodeURIComponent(J)}`,{code:ve}),m.value="Skill updated successfully"),await M(),setTimeout(()=>{r.value=!1},800)}catch(fe){p.value=fe.message}h.value=!1}function Y(J){_.value=J}async function ie(){if(_.value){I.value=!0;try{await j.del(`/api/skills/${encodeURIComponent(_.value)}`),await M()}catch(J){Ee.error(`Failed to delete skill: ${J.message||"unknown error"}`)}I.value=!1,_.value=null}}return tt(()=>{M()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:m,saving:h,editorRef:b,deleteTarget:_,deleting:I,enabledCount:x,totalExecutions:g,totalLines:y,displayedSkills:w,editLineCount:S,editorLineNums:E,editValidation:A,highlight:k,truncate:Lu,formatTs:ai,countLines:O,getLineNumbers:B,toggleCode:T,copyCode:$,handleEditorKey:Q,syncScroll:W,fetchSkills:M,testSkill:L,showCreate:D,editSkill:le,cancelEdit:re,saveSkill:z,confirmDelete:Y,doDelete:ie}}};class sa extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const b1=/^[A-Za-z_][A-Za-z0-9_]*$/;function Of(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Lf(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new sa(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new sa(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new sa(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new sa(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function y1(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function x1(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new sa("Server name is required.","name");if(n.length>128||!b1.test(n))throw new sa("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new sa("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=Of(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new sa("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new sa("An HTTP endpoint is required for this connection.","url");if(d&&!y1(d))throw new sa("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new sa("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=Of(e.allowlistText));const r=Lf(e.headerRows,e.headersRemove,"Header"),c=Lf(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function _1(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function w1(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function k1(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const S1=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function C1(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const T1=1e4,E1=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Mc(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function A1(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const R1={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=V(()=>Object.keys(i.value).every(ee=>{var Se;return Number.isInteger((Se=e.value)==null?void 0:Se[ee])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),m=f({}),h=f(new Set),b=f(!1),_=f("add"),I=f(""),x=f(null),g=f(Mc()),y=f(""),w=f(!1);let S=null,E=0,A=!1,k=!1;const O=S1,B=V(()=>{var ee;return((ee=e.value)==null?void 0:ee.servers)||[]}),T=V(()=>{var ee;return!!((ee=e.value)!=null&&ee.enabled)}),$=V(()=>{var ee,Se,Re,Ae;return{serverCount:((ee=e.value)==null?void 0:ee.server_count)||0,enabledCount:((Se=e.value)==null?void 0:Se.enabled_server_count)||0,connectedCount:((Re=e.value)==null?void 0:Re.connected_count)||0,toolCount:((Ae=e.value)==null?void 0:Ae.published_tool_count)||0}}),Q=V(()=>{var ee;return((ee=x.value)==null?void 0:ee.header_keys)||[]}),W=V(()=>{var ee;return((ee=x.value)==null?void 0:ee.env_keys)||[]}),M=V(()=>{var ee;return _.value==="edit"&&((ee=x.value)==null?void 0:ee.transport)==="http"}),L=V(()=>_.value==="add"||!M.value),D=V(()=>M.value?"Replace endpoint URL":"Endpoint URL"),le=V(()=>M.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function re(){z(),S=window.setInterval(()=>Y({quiet:!0}),T1)}function z(){S&&window.clearInterval(S),S=null}async function Y({quiet:ee=!1}={}){if(a.value)return;const Se=++E;ee||(t.value=!0);try{const Re=await j.get("/api/mcp/status");if(Se!==E||!A)return;e.value=Re;for(const ne of Object.keys(i.value))!l.value.has(ne)&&Number.isInteger(Re[ne])&&(i.value[ne]=String(Re[ne]));r.value="";const Ae=new Set((Re.servers||[]).map(ne=>ne.name));d.value=new Set([...d.value].filter(ne=>Ae.has(ne)))}catch(Re){Se===E&&A&&(r.value=Re.message||"Failed to load MCP status")}finally{Se===E&&(t.value=!1)}}function ie(ee){return s.value||c.value.has(ee)}function J(ee,Se){const Re=new Set(c.value);Se?Re.add(ee):Re.delete(ee),c.value=Re}function ve(ee){return w1(ee.state)}function fe(ee){if(ve(ee)==="disabled"){if(!ee.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return E1[ve(ee)]}function K(ee){return ee.transport==="http"?"Streamable HTTP":"stdio"}function pe(ee){return ee.negotiated_version?`${ee.era?`${String(ee.era).charAt(0).toUpperCase()}${String(ee.era).slice(1)}`:"Protocol"} · ${ee.negotiated_version}`:"Not negotiated"}function ge(ee){return ee.discovered_count?`${ee.published_count||0} published · ${ee.excluded_count||0} excluded`:"No tools discovered"}const xe=f(new Set);async function ke(ee,Se){if(xe.value.has(ee.name))return;const Re=!!Se.target.checked,Ae=new Set(xe.value);Ae.add(ee.name),xe.value=Ae;try{const ne=await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/enabled`,{enabled:Re});ne&&Array.isArray(ne.servers)?e.value=ne:await Y({quiet:!0})}catch(ne){Se.target.checked=!!ee.enabled,Ee.error(ne.message||`Failed to toggle ${ee.name}`)}finally{const ne=new Set(xe.value);ne.delete(ee.name),xe.value=ne}}function He(ee,Se){var Ae;i.value[ee]=Se;const Re=new Set(l.value);Se===String((Ae=e.value)==null?void 0:Ae[ee])?Re.delete(ee):Re.add(ee),l.value=Re,n.value=""}async function R(){if(s.value||!o.value||!l.value.size)return;const ee={};for(const Se of l.value){const Re=Number(i.value[Se]),Ae=Se==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Re)||Re<1||Re>Ae){n.value=`Enter a whole number between 1 and ${Ae}.`;return}ee[Se]=Re}a.value=!0,s.value=!0,n.value="",++E,t.value=!1;try{const Se=await j.post("/api/mcp/limits",ee);e.value=Se;for(const Re of Object.keys(i.value))Number.isInteger(Se[Re])&&(i.value[Re]=String(Se[Re]));l.value=new Set,Ee.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(Se){n.value=Se.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Y({quiet:!0})}}async function P(ee){if(ee!==T.value&&!(!ee&&!await is({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await j.post("/api/mcp/enabled",{enabled:ee}),Ee.success(ee?"MCP enabled":"MCP disabled"),await Y({quiet:!0})}catch(Se){Ee.error(Se.message||"Failed to update MCP state"),await Y({quiet:!0})}finally{s.value=!1}}}async function G(ee){J(ee.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/reconnect`,{}),Ee.success(`Reconnected ${ee.name}`)}catch(Se){Ee.error(Se.message||`Failed to reconnect ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}async function de(ee){J(ee.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/refresh-tools`,{}),Ee.success(`Refreshed tools from ${ee.name}`),await ue(ee.name,!0)}catch(Se){Ee.error(Se.message||`Failed to refresh ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}async function F(ee){if(await is({title:`Remove ${ee.name}`,message:`Remove this saved MCP server? Its ${ee.published_count||0} published tool${ee.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){J(ee.name,!0);try{await j.del(`/api/mcp/servers/${encodeURIComponent(ee.name)}`),Ee.success(`Removed ${ee.name}`),delete p.value[ee.name]}catch(Re){Ee.error(Re.message||`Failed to remove ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}}async function Z(ee){const Se=new Set(d.value);if(Se.has(ee.name)){Se.delete(ee.name),d.value=Se;return}Se.add(ee.name),d.value=Se,Object.hasOwn(p.value,ee.name)||await ue(ee.name)}async function ue(ee,Se=!1){if(!Se&&Object.hasOwn(p.value,ee))return;const Re=new Set(h.value);Re.add(ee),h.value=Re,m.value={...m.value,[ee]:""};try{const Ae=await j.get(`/api/mcp/servers/${encodeURIComponent(ee)}/tools`);p.value={...p.value,[ee]:Ae.tools||[]}}catch(Ae){m.value={...m.value,[ee]:Ae.message||"Failed to load tools"}}finally{const Ae=new Set(h.value);Ae.delete(ee),h.value=Ae}}function H(ee){return(p.value[ee]||[]).filter(Se=>k1(Se,u.value[ee]))}function te(ee,Se){u.value={...u.value,[ee]:Se}}function se(){_.value="add",I.value="",x.value=null,g.value=Mc(),y.value="",b.value=!0}function ye(ee){_.value="edit",I.value=ee.name,x.value=ee,g.value={...Mc(),name:ee.name,enabled:!!ee.enabled,transport:ee.transport||"stdio"},y.value="",b.value=!0}function he(){w.value||(b.value=!1)}function me(ee){b.value&&C1(ee)}function be(ee){const Se=ee==="headers"?"headerRows":"envRows";g.value[Se].push({key:"",value:""})}function Pe(ee,Se){const Re=ee==="headers"?"headerRows":"envRows";g.value[Re].splice(Se,1)}function Ge(ee,Se){const Re=ee==="headers"?"headersRemove":"envRemove",Ae=g.value[Re];g.value[Re]=Ae.includes(Se)?Ae.filter(ne=>ne!==Se):[...Ae,Se]}async function De(){var Se,Re;y.value="";let ee;try{ee=x1(g.value,{mode:_.value,originalTransport:((Se=x.value)==null?void 0:Se.transport)||""})}catch(Ae){y.value=Ae instanceof sa?Ae.message:"Invalid MCP server configuration",await Ht(),(Re=document.querySelector(".mcp-editor"))==null||Re.scrollTo({top:0,behavior:"smooth"});return}if(!(_.value==="edit"&&_1(ee,x.value)&&!await is({title:`Change ${I.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){w.value=!0;try{_.value==="add"?await j.post("/api/mcp/servers",ee):await j.put(`/api/mcp/servers/${encodeURIComponent(I.value)}`,ee),Ee.success(_.value==="add"?`Saved ${ee.name}`:`Updated ${I.value}`),b.value=!1,await Y({quiet:!0})}catch(Ae){y.value=Ae.message||"Failed to save MCP server"}finally{w.value=!1}}}let Be=null;function Ve(ee){`${(ee==null?void 0:ee.event)||""} ${(ee==null?void 0:ee.type)||""} ${(ee==null?void 0:ee.tool)||""} ${(ee==null?void 0:ee.message)||""}`.toLowerCase().includes("mcp")&&(Be&&window.clearTimeout(Be),Be=window.setTimeout(()=>Y({quiet:!0}),200))}function rt(){A||(A=!0,k||(ut.subscribe("events",Ve),k=!0),Y(),re())}function Je(){A=!1,z(),Be&&window.clearTimeout(Be),Be=null,k&&(ut.unsubscribe("events",Ve),k=!1)}return tt(rt),ls(rt),Jt(Je),_t(Je),{status:e,loading:t,mutating:s,pageError:r,servers:B,masterEnabled:T,aggregate:$,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:He,saveLimits:R,expandedServers:d,toolQueries:u,toolErrors:m,toolsLoading:h,editorOpen:b,editorMode:_,editingName:I,editingServer:x,form:g,formError:y,saving:w,editorGroups:O,configuredHeaderKeys:Q,configuredEnvKeys:W,savedHttpEndpoint:M,endpointRequired:L,endpointFieldLabel:D,endpointPlaceholder:le,refreshAll:Y,busy:ie,serverState:ve,stateLabel:fe,transportLabel:K,protocolLabel:pe,toolSummary:ge,formatAge:A1,setMasterEnabled:P,togglePending:xe,toggleServerEnabled:ke,reconnect:G,refreshTools:de,removeServer:F,toggleTools:Z,filteredTools:H,setToolQuery:te,openAdd:se,openEdit:ye,closeEditor:he,jumpToEditorGroup:me,addSecretRow:be,removeSecretRow:Pe,toggleSecretRemoval:Ge,saveServer:De}}};function I1(e,t){if(!e||!t)return Tf(e);const s=Tf(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const O1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),m=f(!1),h=f(null),b=f(null);let _=null;const I=f(null),x=f(!1),g=f({}),y=f({}),w=f({}),S=f({}),E=new Map,A=f(null),k=V(()=>e.value.reduce((z,Y)=>z+(Y.chunks||0),0)),O=V(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function B(z,Y){const ie=y.value[Y];if(!ie||ie.length===0)return 0;const J=Math.max(...ie.map(ve=>ve.char_count||0));return J===0?0:Math.round(z.char_count/J*100)}async function T(){t.value=!0,s.value=null;try{const z=await j.get("/api/knowledge");e.value=Array.isArray(z)?z:[]}catch(z){s.value=z.message}t.value=!1}async function $(z){if(g.value[z]){g.value[z]=!1,A.value=null;return}if(g.value[z]=!0,Object.prototype.hasOwnProperty.call(y.value,z))return;if(E.has(z))return E.get(z);const Y={...S.value,[z]:!0};S.value=Y;const ie={...w.value};delete ie[z],w.value=ie;const J=j.get(`/api/knowledge/${encodeURIComponent(z)}/chunks`).then(ve=>{y.value={...y.value,[z]:Array.isArray(ve)?ve:[]}}).catch(ve=>{w.value={...w.value,[z]:ve.message||"load failed"}}).finally(()=>{if(E.get(z)!==J)return;E.delete(z);const ve={...S.value};delete ve[z],S.value=ve});return E.set(z,J),J}let Q=0;async function W(){const z=a.value.trim();if(!z)return;const Y=++Q;i.value=!0,o.value=null,l.value=z;try{const ie=await j.get(`/api/knowledge/search?q=${encodeURIComponent(z)}`);if(Y!==Q)return;n.value=Array.isArray(ie)?ie:[]}catch(ie){if(Y!==Q)return;n.value=[],o.value=ie.message||"Search failed"}Y===Q&&(i.value=!1)}function M(){Q+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function L(){u.value=null,p.value=null;const z=c.value.trim(),Y=d.value.trim();if(!z){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}m.value=!0;try{const ie=await j.post("/api/knowledge",{source:z,content:Y});p.value=`Ingested ${ie.chunks||0} chunks from "${z}"`,c.value="",d.value="",y.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(ie){u.value=ie.message}m.value=!1}async function D(z){h.value=z,b.value=null,_&&(clearTimeout(_),_=null);try{const Y=await j.post(`/api/knowledge/${encodeURIComponent(z)}/reingest`);b.value={source:z,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete y.value[z],await T(),_=setTimeout(()=>{b.value=null,_=null},3e3)}catch(Y){b.value={source:z,error:!0,message:Y.message}}h.value=null}function le(z){I.value=z}async function re(){if(I.value){x.value=!0;try{await j.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete y.value[I.value],await T()}catch(z){Ee.error(`Failed to delete source: ${z.message||"unknown error"}`)}x.value=!1,I.value=null}}return tt(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:m,reingesting:h,reingestResult:b,deleteTarget:I,deleting:x,expanded:g,sourceChunks:y,chunkErrors:w,loadingChunks:S,selectedChunk:A,totalChunks:k,uploaderCount:O,truncate:Lu,formatTs:ai,highlightTerms:I1,chunkBarWidth:B,fetchSources:T,toggleSource:$,doSearch:W,clearSearch:M,doIngest:L,doReingest:D,confirmDelete:le,doDelete:re}}},L1={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),m=f(""),h=f(!1),b=f(null),_=f(null),I=f(new Set),x=f(null),g=f(!1),y=f(!1),w=V(()=>e.value.reduce((Y,ie)=>Y+ie.count,0)),S=V(()=>I.value.size);function E(Y){const ie=t.value[Y];if(!ie)return[];if(!l.value.trim())return ie;const J=l.value.trim().toLowerCase();return ie.filter(ve=>ve.key.toLowerCase().includes(J)||ve.value&&ve.value.toLowerCase().includes(J))}function A(Y,ie){return I.value.has(Y+"/"+ie)}function k(Y,ie){const J=Y+"/"+ie,ve=new Set(I.value);ve.has(J)?ve.delete(J):ve.add(J),I.value=ve}function O(Y){const ie=t.value[Y];return!ie||ie.length===0?!1:ie.every(J=>I.value.has(Y+"/"+J.key))}function B(Y,ie){const J=t.value[Y];if(!J)return;const ve=new Set(I.value);for(const fe of J){const K=Y+"/"+fe.key;ie?ve.add(K):ve.delete(K)}I.value=ve}async function T(){s.value=!0,a.value=null;try{const Y=await j.get("/api/memory");e.value=Object.entries(Y).map(([ie,J])=>({name:ie,keys:J.keys||[],count:J.count||0}))}catch(Y){a.value=Y.message}s.value=!1}async function $(Y){if(n.value[Y]){n.value[Y]=!1;return}n.value[Y]=!0;const ie=e.value.find(ve=>ve.name===Y);if(!ie||t.value[Y]||i.value===Y)return;i.value=Y;let J;try{const fe=(await j.get(`/api/memory/${encodeURIComponent(Y)}`)).entries||{};J=ie.keys.map(K=>Object.prototype.hasOwnProperty.call(fe,K)?{key:K,value:fe[K]||"",failed:!1}:{key:K,value:"",failed:!0,error:"Not found in scope"})}catch(ve){J=ie.keys.map(fe=>({key:fe,value:"",failed:!0,error:ve.message||"Failed to load"}))}t.value[Y]=J,i.value=null}function Q(Y,ie,J){p.value=Y+"/"+ie,m.value=J}async function W(Y,ie){h.value=!0,b.value=null;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`,{value:m.value});const J=t.value[Y];if(J){const ve=J.find(fe=>fe.key===ie);ve&&(ve.value=m.value)}p.value=null}catch(J){b.value=`Failed to save: ${J.message||"unknown error"}`}h.value=!1}async function M(Y,ie){try{await navigator.clipboard.writeText(ie.value),_.value=Y+"/"+ie.key,setTimeout(()=>{_.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const Y=r.value.scope.trim(),ie=r.value.key.trim(),J=r.value.value.trim();if(!Y){d.value="Scope is required";return}if(!ie){d.value="Key is required";return}if(!J){d.value="Value is required";return}c.value=!0;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`,{value:J}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ve){d.value=ve.message}c.value=!1}function D(Y,ie){x.value={scope:Y,key:ie}}async function le(){if(!x.value)return;g.value=!0,b.value=null;const{scope:Y,key:ie}=x.value;try{await j.del(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`);const J=t.value[Y];J&&(t.value[Y]=J.filter(K=>K.key!==ie));const ve=e.value.find(K=>K.name===Y);ve&&(ve.count--,ve.keys=ve.keys.filter(K=>K!==ie));const fe=new Set(I.value);fe.delete(Y+"/"+ie),I.value=fe}catch(J){b.value=`Failed to delete: ${J.message||"unknown error"}`}g.value=!1,x.value=null}function re(){y.value=!0}async function z(){g.value=!0,b.value=null;const Y=[];for(const ie of I.value){const J=ie.indexOf("/");Y.push({scope:ie.slice(0,J),key:ie.slice(J+1)})}try{await j.post("/api/memory/bulk-delete",{entries:Y}),I.value=new Set,t.value={},await T()}catch(ie){b.value=`Bulk delete failed: ${ie.message||"unknown error"}`}g.value=!1,y.value=!1}return tt(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:m,saving:h,actionError:b,copied:_,selected:I,selectedCount:S,totalEntries:w,deleteTarget:x,deleting:g,showBulkDelete:y,fetchMemory:T,toggleScope:$,startEdit:Q,doEdit:W,copyValue:M,doAdd:L,confirmDelete:D,doDelete:le,confirmBulkDelete:re,doBulkDelete:z,isSelected:A,toggleSelect:k,isScopeAllSelected:O,toggleSelectAll:B,filteredEntries:E}}},N1={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=V(()=>[...new Set(e.value.map(S=>S.category))].sort()),p=V(()=>{const w={};return e.value.forEach(S=>{w[S.category]=(w[S.category]||0)+1}),w}),m=V(()=>n.value?e.value.filter(w=>w.category===n.value):e.value);function h(w){return w==="correction"?"badge-warning":w==="operational"?"badge-info":w==="preference"?"badge-success":"badge-info"}function b(w){i.value=w.key,l.value=w.content}async function _(w){try{await j.put("/api/learned/"+encodeURIComponent(w),{content:l.value}),i.value=null,Ee.success("Entry updated"),await x()}catch(S){Ee.error(S.message||"Failed to save entry")}}async function I(w){if(await is({title:"Delete learned entry",message:`Delete "${w}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/learned/"+encodeURIComponent(w)),Ee.success("Entry deleted"),await x()}catch(E){Ee.error(E.message||"Failed to delete entry")}}async function x(){s.value=!0,a.value=null;try{const w=await j.get("/api/learned");e.value=w.entries||[],t.value={last_reflection:w.last_reflection,count:w.count}}catch(w){a.value=w.message}s.value=!1}async function g(){var w;r.value=!1,c.value=null;try{const S=await j.get("/api/config");o.value=((w=S.learning)==null?void 0:w.enabled)===!0,r.value=!0}catch(S){c.value=S.status===403?"Administrator access is required to change automatic learning.":S.message||"Automatic learning state is unavailable."}}async function y(w){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await j.put("/api/config",{learning:{enabled:w}}),await g(),!r.value)return;Ee.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(S){r.value=!1,c.value=S.status===403?"Administrator access is required to change automatic learning.":S.message||"Failed to change automatic learning."}finally{d.value=!1}}}return tt(()=>{x(),g()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:m,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:h,formatTs:ai,startEdit:b,saveEdit:_,deleteEntry:I,fetchEntries:x,fetchLearningConfig:g,setLearningEnabled:y}}},wg=[{id:"tools",label:"Tools",component:m1},{id:"skills",label:"Skills",component:g1},{id:"mcp-servers",label:"MCP Servers",component:R1},{id:"knowledge",label:"Knowledge",component:O1},{id:"memory",label:"Memory",component:L1},{id:"learned",label:"Learned",component:N1}],M1={components:{TabbedPage:Qr},setup(){return{tabs:wg}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},D1={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},P1={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},$1={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},F1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=V(()=>e.value.components||[]),l=V(()=>$1[e.value.overall]||"text-gray-400"),o=V(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=V(()=>{const S=e.value.overall;return S==="healthy"?"All Systems Healthy":S==="degraded"?"Some Systems Degraded":S==="unhealthy"?"System Issues Detected":"Unknown"});function c(S){return D1[S]||"text-gray-400"}function d(S){return P1[S]||"info"}function u(S){return S==="ok"?"badge-success":S==="degraded"?"badge-warning":S==="down"?"badge-danger":"badge-info"}function p(S){return S==="closed"?"text-green-400":S==="half_open"?"text-yellow-400":S==="open"?"text-red-400":"text-gray-400"}function m(S){return S.replace(/_/g," ").replace(/\b\w/g,E=>E.toUpperCase())}function h(S){if(!S)return"—";try{return new Date(S).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return S}}function b(S){return S>=1e6?(S/1e6).toFixed(1)+"M":S>=1e3?(S/1e3).toFixed(1)+"K":String(S)}async function _(){n.value=!0;try{e.value=await j.get("/api/health/components"),s.value=null,a.value=!0}catch(S){s.value=S.message}finally{t.value=!1,n.value=!1}}function I(){t.value=!0,s.value=null,_()}let x=null,g=!1;function y(){g||(g=!0,_(),x||(x=setInterval(_,3e4)))}function w(){g&&(g=!1,x&&(clearInterval(x),x=null))}return tt(y),ls(y),Jt(w),_t(w),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:m,formatTime:h,formatNumber:b,fetchHealth:_,retry:I}}},U1={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=V(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=V(()=>{if(!i.value)return[];const _=i.value,I=_.storage_total_bytes||1;return[{label:"Session Persistence",mb:_.sessions.persist_dir.total_mb,bytes:_.sessions.persist_dir.total_bytes,files:_.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(_.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:_.knowledge.db_file.total_mb,bytes:_.knowledge.db_file.total_bytes,files:_.knowledge.db_file.file_count,pct:Math.min(100,Math.round(_.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:_.trajectories.message_dir.total_mb,bytes:_.trajectories.message_dir.total_bytes,files:_.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(_.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:_.trajectories.agent_dir.total_mb,bytes:_.trajectories.agent_dir.total_bytes,files:_.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(_.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const _=await j.get("/api/resource-usage");i.value=_,t.value=null,s.value=!0}catch(_){t.value=_.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let m=!1;function h(){m||(m=!0,d(),l||(l=setInterval(d,3e4)))}function b(){m&&(m=!1,l&&(clearInterval(l),l=null))}return tt(h),ls(h),Jt(b),_t(b),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Nu,refresh:u,retry:p}}},B1=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),z1=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function H1(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!z1.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?Zl(t):""}function j1(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!B1.has(c)));s=Object.keys(r).length?Zl(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const wn=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Yl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function V1(e){const t=wn(e)?e:{},s=wn(t.metadata)?t.metadata:{},a=wn(t.audit_metadata)?t.audit_metadata:{},n=wn(t.turn)?t.turn:{},i=l=>Yl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function Nf(e){return e.record?JSON.stringify(kg(e),null,2):e.text}function kg(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Sd(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Mf(e){if(!Sd(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,Yl(s.channel_id),Yl(s.user_id??s.actor)])}function q1(e,t,s=2e3){var i,l,o;const a=Mf(t),n=a?e.findIndex(r=>Mf(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(x=>JSON.stringify(x)===d))return;c.push(t.record);const u=x=>"result_summary"in x?2:Sd(x)==="end"?1:0,p=[...c].sort((x,g)=>u(x)-u(g)),m=Object.assign({},...p);m.type=p[p.length-1].type||"execution";for(const x of["metadata","audit_metadata","turn"]){const g=p.filter(y=>wn(y[x])).map(y=>y[x]);g.length&&(m[x]=Object.assign({},...g))}const h=c.some(x=>Sd(x)!=="start"),b=c.find(x=>Cd(x,0).level==="ERROR"),_=(b==null?void 0:b.status)||((i=b==null?void 0:b.metadata)==null?void 0:i.status);m.status=b?["failed","error","cancelled","denied","outcome_unknown"].includes(_)?_:"failed":h?m.status||((l=m.metadata)==null?void 0:l.status)||"succeeded":"started",h&&m.status==="started"&&(m.status="succeeded"),b&&(m.error=b.error||((o=b.metadata)==null?void 0:o.error)||m.error);const I=Cd(m,r.id,r._time);Object.assign(I,{events:c,ts:r.ts,_time:r._time,searchText:c.map(x=>JSON.stringify(x)).join(`
`)}),e.splice(n,1,I)}e.length>s&&e.splice(0,e.length-s)}function Cd(e,t,s=new Date){var u,p;let a=e;if(wn(e)&&e.type==="log"&&"line"in e?a=e.line:wn(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=wn(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(m=>["failed","error","cancelled","denied","outcome_unknown"].includes(m))?"ERROR":Yl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:Yl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:V1(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function G1(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const W1={components:{ToolOutput:Xr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=V(()=>j1(e.entry)),s=V(()=>{var o;return Zl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=V(()=>{var o,r,c;return Zl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=V(()=>H1(e.entry.record)),i=V(()=>kg(e.entry)),l=V(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},K1=["INFO","WARNING","ERROR"],J1=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Dc=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Z1=[50,100,200,500],Y1={components:{ToolOutput:Xr,LogRecord:W1},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(ut.state||"disconnected"),u=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),m=f(!1),h=f(null),b=2e3,_=K1,I=J1,x=Dc,g=f("all"),y=f(""),w=f([]),S=f(!1),E=f(""),A=f([]);function k(){try{const oe=localStorage.getItem("odin-log-presets");oe&&(w.value=JSON.parse(oe))}catch{}}function O(){try{localStorage.setItem("odin-log-presets",JSON.stringify(w.value))}catch{}}const B=V(()=>l.value!==""||o.value.trim()!==""||y.value!==""),T=V(()=>{const oe=Dc.find(Te=>Te.value===y.value);return oe?oe.label:""}),$=V(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(oe){return oe.message}}),Q=24,W=V(()=>{if(Y.value.length===0)return[];const oe=[],Te=new Date,Ye=3600*1e3;for(let st=Q-1;st>=0;st--){const Ct=new Date(Te.getTime()-(st+1)*Ye),ht=new Date(Te.getTime()-st*Ye);oe.push({start:Ct,end:ht,label:le(Ct,ht),shortLabel:ht.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const st of Y.value){if(!st._time)continue;const Ct=st._time.getTime();for(const ht of oe)if(Ct>=ht.start.getTime()&&Ct<ht.end.getTime()){ht.total++,st.level==="ERROR"?ht.errors++:st.level==="WARNING"?ht.warnings++:ht.info++;break}}return oe}),M=V(()=>{let oe=1;for(const Te of W.value)Te.total>oe&&(oe=Te.total);return oe}),L=V(()=>{if(W.value.length===0)return"";const oe=Y.value.map(st=>st._time&&st._time.getTime()).filter(Boolean);if(oe.length===0)return"";const Te=new Date(Math.min(...oe));return`${Y.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),D=V(()=>Math.ceil(Q/8));function le(oe,Te){const Ye={hour:"2-digit",minute:"2-digit"};return oe.toLocaleTimeString([],Ye)+" - "+Te.toLocaleTimeString([],Ye)}function re(oe,Te){return!Te||!oe?"0px":Math.max(2,oe/Te*100)+"%"}function z(oe){const Te=Y.value.findIndex(Ye=>Ye._time&&Ye._time.getTime()>=oe.start.getTime()&&Ye._time.getTime()<oe.end.getTime());if(Te>=0&&p.value){const Ye=p.value.querySelector('[data-log-id="'+Y.value[Te].id+'"]');Ye&&(Ye.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Y=V(()=>{let oe=t.value;if(l.value&&(oe=oe.filter(Te=>(Te.level||"INFO")===l.value)),y.value){const Te=Dc.find(Ye=>Ye.value===y.value);if(Te&&Te.seconds){const Ye=new Date(Date.now()-Te.seconds*1e3);oe=oe.filter(st=>st._time&&st._time>=Ye)}}if(o.value&&!$.value)if(r.value)try{const Te=new RegExp(o.value,"i");oe=oe.filter(Ye=>{const st=Ye.searchText,Ct=Ye.tool||"";return Te.test(st)||Te.test(Ct)})}catch{}else{const Te=o.value.toLowerCase();oe=oe.filter(Ye=>{const st=Ye.searchText.toLowerCase(),Ct=(Ye.tool||"").toLowerCase();return st.includes(Te)||Ct.includes(Te)})}return oe}),ie=V(()=>G1(Y.value));function J(oe){const Te=Cd(oe,++s);if(n.value){A.value.push(Te);return}ve(Te)}function ve(oe){q1(t.value,oe,b),i.value&&Ht(()=>fe())}function fe(oe=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:oe?"smooth":"instant"})}function K(){i.value=!0,m.value=!1,Ht(()=>fe(!0))}const pe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function ge(){const oe=p.value;if(!oe)return;const Te=oe.scrollHeight-oe.scrollTop-oe.clientHeight<40;m.value=!i.value&&!Te&&t.value.length>0,R.value&&xe()}function xe(){const oe=p.value;!oe||!i.value||oe.scrollHeight-oe.scrollTop-oe.clientHeight>=40&&(i.value=!1,m.value=t.value.length>0)}function ke(){i.value&&requestAnimationFrame(xe)}function He(oe){pe.has(oe.key)&&ke()}const R=f(!1);function P(){i.value&&(R.value=!0,requestAnimationFrame(xe))}function G(){R.value&&(R.value=!1,xe())}function de(){i.value&&(m.value=!1,Ht(()=>fe()))}function F(){if(n.value=!n.value,!n.value&&A.value.length>0){for(const oe of A.value)ve(oe);A.value=[]}}function Z(){t.value=[],A.value=[],m.value=!1}function ue(){let oe;e.value==="search"?oe=$e.value.map(Ct=>{const ht=Ct.error?"ERROR":"INFO",ga=Ct.tool_name?`[${Ct.tool_name}] `:"";return`${Ct.timestamp||""} ${ht} ${ga}${Ct.result_summary||Ct.message||""}`}).join(`
`):oe=Y.value.map(Nf).join(`

`);const Te=new Blob([oe],{type:"text/plain"}),Ye=URL.createObjectURL(Te),st=document.createElement("a");st.href=Ye,st.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,st.click(),URL.revokeObjectURL(Ye)}function H(oe){const Te=Nf(oe);navigator.clipboard.writeText(Te).then(()=>{h.value=oe.id,setTimeout(()=>{h.value=null},1500)}).catch(()=>{})}function te(oe){l.value=l.value===oe?"":oe,g.value="all"}function se(oe){return oe.level==="ERROR"?"log-line-error":oe.level==="WARNING"?"log-line-warning":"text-gray-300"}function ye(oe){return oe==="ERROR"?"text-red-500 font-semibold":oe==="WARNING"?"text-yellow-500":"text-blue-500"}function he(oe){return oe==="ERROR"?"log-chip-error":oe==="WARNING"?"log-chip-warning":"log-chip-info"}function me(oe){g.value=oe.id;const Te=oe.filters;l.value=Te.level||"",y.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function be(oe){g.value=oe.id,l.value=oe.filters.level||"",y.value=oe.filters.timeRange||"",o.value=oe.filters.text||""}function Pe(){if(!E.value.trim())return;const oe={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:l.value,timeRange:y.value,text:o.value}};w.value=[...w.value,oe],O(),S.value=!1,E.value=""}function Ge(oe){w.value=w.value.filter(Te=>Te.id!==oe),O(),g.value===oe&&(g.value="all")}const De=f("all"),Be=f(""),Ve=f(""),rt=f(""),Je=f(""),ee=f(""),Se=f(100),Re=Z1,Ae=f(!1),ne=f(!1),Le=f(""),$e=f([]),ot=f(null),Yt=f(null);function nt(){e.value="search",ot.value||Mt()}async function Mt(){try{ot.value=await j.get("/api/logs/stats")}catch{}}function Dt(){const oe=ee.value;if(!oe){rt.value="",Je.value="";return}const Ye={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[oe];if(Ye){const st=new Date(Date.now()-Ye*1e3);rt.value=ps(st),Je.value=""}}function ps(oe){const Te=Ye=>String(Ye).padStart(2,"0");return`${oe.getFullYear()}-${Te(oe.getMonth()+1)}-${Te(oe.getDate())}T${Te(oe.getHours())}:${Te(oe.getMinutes())}`}function Zs(oe){if(!oe)return"";const Te=new Date(oe);return isNaN(Te.getTime())?"":Te.toISOString()}async function Ze(){Ae.value=!0,Le.value="",ne.value=!0,Yt.value=null;try{const oe=new URLSearchParams;De.value&&De.value!=="all"&&oe.set("level",De.value),Be.value&&oe.set("tool",Be.value),Ve.value&&oe.set("q",Ve.value);const Te=Zs(rt.value),Ye=Zs(Je.value);Te&&oe.set("start",Te),Ye&&oe.set("end",Ye),oe.set("limit",String(Se.value));const st=await j.get(`/api/logs/search?${oe.toString()}`);$e.value=st.entries||[]}catch(oe){Le.value=oe.message||"Search failed",$e.value=[]}finally{Ae.value=!1}}function Oa(){De.value="all",Be.value="",Ve.value="",rt.value="",Je.value="",ee.value="",Se.value=100,$e.value=[],ne.value=!1,Le.value="",Yt.value=null}function Is(oe){Yt.value=Yt.value===oe?null:oe}function ts(oe){if(!oe.timestamp)return"";try{return new Date(oe.timestamp).toLocaleString()}catch{return oe.timestamp}}function ra(oe){return oe.type==="web_action"?`${oe.status||""} (${oe.execution_time_ms||0}ms)`:(oe.result_summary||"").slice(0,200)}function Ys(oe){return oe.error?"log-line-error":"text-gray-300"}function ss(oe){try{return JSON.stringify(oe,null,2)}catch{return String(oe)}}let ca=null,pt=!1;function Qs(){pt||(pt=!0,ut.subscribe("logs",J),c.value=ut.connected,d.value=ut.state||"disconnected",ca=ut.onState(oe=>{d.value=oe,c.value=oe==="connected"}))}function cn(){pt&&(pt=!1,ut.unsubscribe("logs",J),ca&&(ca(),ca=null))}return tt(()=>{k(),window.addEventListener("pointerup",G),window.addEventListener("pointercancel",G)}),ls(Qs),Jt(cn),_t(()=>{cn(),window.removeEventListener("pointerup",G),window.removeEventListener("pointercancel",G)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:ie,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Y,pauseBuffer:A,showJumpBottom:m,copiedIndex:h,regexError:$,levels:_,logPresets:I,timeRanges:x,timeRange:y,activeLogPreset:g,customLogPresets:w,showSaveLogPreset:S,newLogPresetName:E,hasActiveLogFilters:B,timeRangeLabel:T,timelineBuckets:W,timelineMax:M,timelineSpanLabel:L,timelineLabelSkip:D,togglePause:F,clearLogs:Z,exportLogs:ue,logLineClass:se,levelClass:ye,levelChipClass:he,toggleLevel:te,copyLine:H,jumpToBottom:K,onScroll:ge,onUserScrollIntent:ke,onUserScrollKey:He,onAutoScrollToggle:de,onPointerDown:P,applyLogPreset:me,applyCustomLogPreset:be,saveLogCustomPreset:Pe,removeLogCustomPreset:Ge,segmentHeight:re,jumpToTimelineBucket:z,searchLevel:De,searchTool:Be,searchKeyword:Ve,searchStart:rt,searchEnd:Je,searchTimePreset:ee,searchLimit:Se,searchLimits:Re,searching:Ae,searchRan:ne,searchError:Le,searchResults:$e,searchStats:ot,expandedSearch:Yt,switchToSearch:nt,runSearch:Ze,clearSearchFilters:Oa,toggleSearchExpand:Is,formatSearchTs:ts,searchEntryText:ra,searchLogLineClass:Ys,formatJson:ss,applySearchTimePreset:Dt}}};function Oo(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const Q1=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function X1(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const Di=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],eC={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Lo=new Set(["llm_provider","openai_codex","ollama","openai_compatible","kimi","personality","discord","computer"]),tC=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Df(e){return tC.some(t=>e===t||e.startsWith(`${t}.`))}const Sg="odin_config_center_expanded_v1",Cg="odin_config_center_category_v1",sC=50,aC=650,ul=()=>j.get("/api/config/meta");function Un(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ci(e,t){return JSON.stringify(e)===JSON.stringify(t)}function vi(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function nC(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function iC(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Tg(e,t){if(Ci(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Un(t);const a={};for(const[n,i]of Object.entries(t)){const l=Tg(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function lC(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=Tg(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function Eg(e,t,s,a){if(Ci(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Eg(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function oC(){try{const e=JSON.parse(localStorage.getItem(Sg)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function rC(){try{const e=localStorage.getItem(Cg);return Di.some(t=>t.key===e)?e:Di[0].key}catch{return Di[0].key}}const cC={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(C){i.value=C||null,C&&typeof C.authorized=="boolean"&&(l.value=C.authorized)}async function m(){try{const C=await j.get("/api/setup/status");p(C.listener),u.value=""}catch(C){p(null),u.value=`Listener status could not be loaded: ${C.message||"Unknown error"}`}}async function h(){if(!(!de.value||!o.value.trim()||r.value||G.value)){r.value=!0,c.value="",d.value="";try{const C=j.setListenerExposure(o.value.trim(),l.value);o.value="";const q=await C;c.value=q.message,p(q.listener)}catch(C){d.value=C.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const b=f(null),_=["image_model","outer_model"],I=f(null),x=f(null),g=f(null),y=f(!1),w=f(!1),S=f(null),E=f(""),A=f("all"),k=f(rC()),O=f(oC()),B=f({}),T=f({}),$=f(""),Q=f({}),W=f({}),M=f([]),L=f([]),D=f(!1),le=f(!1),re=f(!1);let z=null,Y=null,ie={path:null,at:0},J=0;const ve=V(()=>{var C;return(((C=t.value)==null?void 0:C.fields)||[]).filter(q=>!Lo.has(q.path.split(".")[0])&&!Df(q.path))}),fe=V(()=>new Map(ve.value.map(C=>[C.path,C]))),K=V(()=>He.value.reduce((C,q)=>C+q.sections.length,0)),pe=V(()=>ve.value.length),ge=V(()=>Q1),xe=V(()=>M.value.length>0),ke=V(()=>L.value.length>0),He=V(()=>{if(!e.value)return[];const C=new Set(Di.flatMap(we=>we.sections)),q=Di.map(we=>({...we,sections:we.sections.filter(Qe=>Object.hasOwn(e.value,Qe)&&!Lo.has(Qe))})).filter(we=>we.sections.length),ae=Object.keys(e.value).filter(we=>!C.has(we)&&!Lo.has(we));return ae.length&&q.push({key:"other",label:"Other",icon:"folder",sections:ae}),q}),R=V(()=>e.value?{...e.value,...B.value}:null),P=V(()=>{if(!e.value)return[];const C=[];for(const[q,ae]of Object.entries(B.value))Eg(e.value[q],ae,q,C);return C.filter(q=>!Ci(q.oldVal,q.newVal)).map(q=>{const ae=rt(q.path);return{...q,label:(ae==null?void 0:ae.label)||vi(q.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||Le(q.path.split(".")[0])}})}),G=V(()=>P.value.length>0),de=V(()=>!!i.value&&l.value!==i.value.authorized),F=V(()=>{var q;const C=(q=i.value)==null?void 0:q.state;return C==="active"||C==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(C)?"pending":C==="restricted"?"restricted":"unknown"}),Z=V(()=>{var C;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(C=i.value)==null?void 0:C.state]||"Loading listener state"}),ue=V(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),H=V(()=>{var C;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(C=i.value)==null?void 0:C.configured_host_source]||"source unavailable"}),te=V(()=>{const C=i.value;return!C||C.running_scope==="unavailable"?"Actual bound address unavailable":`${(C.listening_hosts||[]).map((ae,we)=>{var kt;const Qe=(kt=C.listening_ports)==null?void 0:kt[we];return Qe?`${ae}:${Qe}`:ae}).join(", ")} · ${C.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),se=V(()=>P.value.length),ye=V(()=>new Set(P.value.map(C=>C.path.split(".")[0])).size),he=V(()=>!!E.value||A.value!=="all"),me=V(()=>{const C={...W.value};for(const q of P.value){const ae=rt(q.path),we=ce(ae,q.newVal);we&&(C[q.path]=we)}return C}),be=V(()=>Object.keys(me.value).length>0),Pe=V(()=>e.value?(he.value?He.value:He.value.filter(q=>q.key===k.value)).map(q=>({...q,sections:q.sections.filter(ae=>ca(ae))})).filter(q=>q.sections.length):[]),Ge=V(()=>{const C=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],q=new Map(C.map(ae=>[ae,[]]));for(const ae of P.value){const we=q.has(ae.apply_mode)?ae.apply_mode:"restart";q.get(we).push(ae)}return C.filter(ae=>q.get(ae).length).map(ae=>({key:ae,label:hs(ae),entries:q.get(ae)}))}),De=V(()=>P.value.filter(C=>C.apply_mode==="restart").length),Be=V(()=>ve.value.filter(C=>C.pending_restart)),Ve=V(()=>Be.value.length);function rt(C){const q=fe.value.get(C);return q?{...q,apply_details:Oo([q])}:null}function Je(C){const q=`${C}.`;return ve.value.filter(ae=>ae.path===C||ae.path.startsWith(q))}function ee(){return ve.value.some(C=>C.path==="tools.hosts"||C.path.startsWith("tools.hosts."))}function Se(){var ae,we;const C=((we=(ae=e.value)==null?void 0:ae.tools)==null?void 0:we.hosts)||{},q=Object.keys(C).length;return`${q} host${q===1?"":"s"} configured.`}function Re(C){return Je(C).length}function Ae(C){return vi(C)}function ne(C){const q=Je(C);if(!q.length)return`${vi(C)} configuration.`;const ae=q.find(kt=>kt.sensitivity==="public"&&kt.description)||q.find(kt=>kt.description),we=(ae==null?void 0:ae.description)||"";return we.match(/setting for (.+)\.$/i)?`${vi(C)} settings and runtime behaviour.`:we}function Le(C){const q=[...new Set(Je(C).map(ae=>ae.apply_mode))];return q.length===1?q[0]:q.includes("restart")?"restart":q.includes("activation_required")?"activation_required":q[0]||"restart"}function $e(C){const q=[...new Set(Je(C).map(ae=>hs(ae.apply_mode)))];return q.length?q.length===1?q[0]:`Mixed apply behaviour: ${q.join(" · ")}`:""}function ot(C){return Oo(Je(C))}function Yt(C){var q;return Object.hasOwn(B.value,C)?B.value[C]:(q=e.value)==null?void 0:q[C]}function nt(){const C=Yt("mcp")||{},q=Object.keys(C.servers||{}).length;return`${C.enabled?"Globally enabled":"Globally disabled"} · ${q} configured server${q===1?"":"s"}.`}function Mt(C,q){return q.split(".").reduce((ae,we)=>ae==null?void 0:ae[we],C)}function Dt(C){const q=R.value;return Je(C).filter(ae=>Df(ae.path)?!1:ae.path.split(".").length<=2?!0:!ae.path.includes(".*")).map(ae=>({...ae,key:ae.path.split(".").at(-1),value:Mt(q,ae.path),apply_details:Oo([ae]),editor:ae.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ps(C){const q=C.path.split(".");return q.length>2?q.slice(0,2).join("."):null}function Zs(C){const q=new Map;for(const ae of Dt(C)){const we=ps(ae),Qe=we||`${C}.__root`;q.has(Qe)||q.set(Qe,{key:Qe,path:we,entries:[]}),q.get(Qe).entries.push(ae)}return[...q.values()].map(ae=>{const we=ae.entries.find(Qe=>Qe.group_description);return{...ae,label:ae.path?vi(ae.path.split(".").at(-1)):null,description:(we==null?void 0:we.group_description)||null,apply_details:Oo(ae.entries),runtime_summaries:Oa(ae.entries)}})}function Ze(C){return{save:C.save_effect||(C.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:C.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[C.apply_mode]||"Effective runtime state is not currently observable."}}function Oa(C){const q=new Map;for(const ae of C){const we=Ze(ae),Qe=`${ae.apply_mode}|${we.save}|${we.runtime}`;q.has(Qe)||q.set(Qe,{key:Qe,label:hs(ae.apply_mode),save:we.save,runtime:we.runtime})}return[...q.values()]}function Is(C){if(ts(C))return C.runtime_effect||C.activation_policy||"";if(C.apply_mode==="activation_required"){const q=C.activation_policy||C.runtime_effect;return q?`Not active after saving. No activation control exists in this release. ${q}`:"Not active after saving; no activation control exists in this release."}return""}function ts(C){return C.action_available===!0&&!!(C.action_label&&C.action_endpoint)}async function ra(C){if(ts(C))try{if(Te(C.path))throw new Error("Save this setting before applying its action.");const q=String(C.action_method||"POST").toLowerCase(),ae={post:j.post.bind(j),put:j.put.bind(j),delete:j.del.bind(j)}[q];if(!ae)throw new Error("Unsupported configuration action");await ae(C.action_endpoint,C.action_body||void 0),await Da(),Na("success",`${C.action_label} completed.`)}catch(q){Na("error",q.message||`${C.action_label} failed`)}}function Ys(C,q){return[C.label,C.path,C.description,...C.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(q)}function ss(C){const q=E.value.trim().toLowerCase();return q?Je(C).filter(ae=>Ys(ae,q)):[]}function ca(C){const q=Je(C);if(A.value!=="all"&&!q.some(we=>we.apply_state===A.value))return!1;const ae=E.value.trim().toLowerCase();return!ae||`${Ae(C)} ${C}`.toLowerCase().includes(ae)?!0:q.some(we=>Ys(we,ae))}function pt(C,q){return Je(C).filter(ae=>ae.apply_state===q).length}function Qs(C){return C==="all"?pe.value:ve.value.filter(q=>q.apply_state===C).length}function cn(C){const q=C.sections.flatMap(ae=>Je(ae));return{fields:q.length,modified:P.value.filter(ae=>C.sections.includes(ae.path.split(".")[0])).length,pending_restart:q.filter(ae=>ae.apply_state==="pending_restart").length,invalid:q.filter(ae=>ae.apply_state==="invalid").length,dormant:q.filter(ae=>ae.apply_state==="dormant").length}}function oe(C){var q;return Object.hasOwn(B.value,C)&&!Ci((q=e.value)==null?void 0:q[C],B.value[C])}function Te(C){return P.value.some(q=>q.path===C||q.path.startsWith(`${C}.`))}function Ye(C){k.value=C,E.value="",A.value="all";try{localStorage.setItem(Cg,C)}catch{}}function st(C){A.value=C}function Ct(){E.value="",A.value="all"}function ht(C){var q;return((q=He.value.find(ae=>ae.sections.includes(C)))==null?void 0:q.sections)||[]}function ga(C){const q=ht(C),ae=q.find(we=>O.value[we]===!0);return ae||q.find(we=>O.value[we]!==!1)||null}function Bs(C){return E.value&&!re.value&&ca(C)?!0:re.value?ga(C)===C:Object.hasOwn(O.value,C)?O.value[C]===!0:!0}function ii(C){const q=!Bs(C);if(re.value){const ae={...O.value};for(const we of ht(C))ae[we]===!0&&(ae[we]=!1);ae[C]=q,O.value=ae;return}O.value={...O.value,[C]:q}}function En(){M.value.push(Un(B.value)),M.value.length>sC&&M.value.shift(),L.value=[]}function dn(){n.value||G.value&&(En(),B.value={},W.value={},D.value=!1)}function un(C,q=!1){const ae=Date.now();if(q&&ie.path===C&&ae-ie.at<aC){ie.at=ae;return}En(),ie={path:C,at:ae}}function da(C,q,ae){if(!q.length)return ae;const we=Un(C??{});let Qe=we;for(let kt=0;kt<q.length-1;kt+=1){const Os=q[kt];Qe[Os]=Un(Qe[Os]??{}),Qe=Qe[Os]}return Qe[q.at(-1)]=ae,we}function ba(C){var q;return Object.hasOwn(B.value,C)?B.value[C]:Un((q=e.value)==null?void 0:q[C])}function Vt(C,q,ae={}){var Pa;if(n.value||Lo.has(C.path.split(".")[0]))return;const[we,...Qe]=C.path.split(".");un(C.path,!!ae.coalesce);const kt=ba(we),Os=Qe.length?da(kt,Qe,q):q,Xs={...B.value};if(Ci(Os,(Pa=e.value)==null?void 0:Pa[we])?delete Xs[we]:Xs[we]=Os,B.value=Xs,W.value[C.path]){const $a={...W.value};delete $a[C.path],W.value=$a}}function zs(C){ie={path:null,at:0},T.value={...T.value,[C]:String(Mt(R.value,C)??"")}}function fs(C){if(ie={path:null,at:0},!Object.hasOwn(T.value,C))return;const q={...T.value};delete q[C],T.value=q}function An(C){const q=T.value[C.path];if(ie={path:null,at:0},q===""){if(C.nullable){fs(C.path),Vt(C,null,{coalesce:!0});return}W.value={...W.value,[C.path]:"Enter a number."};return}const ae=Number(q);if(Number.isNaN(ae)||C.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[C.path]:C.type==="integer"?"Enter a whole number.":"Enter a number."};return}const we={...T.value};delete we[C.path],T.value=we,Vt(C,ae,{coalesce:!0})}function Rn(C){return Object.hasOwn(T.value,C.path)?T.value[C.path]:C.value??""}function Yi(C,q){if(T.value={...T.value,[C.path]:q},q===""){if(C.nullable){Vt(C,null,{coalesce:!0});return}W.value={...W.value,[C.path]:"Enter a number."};return}const ae=Number(q);if(!Number.isFinite(ae)||C.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[C.path]:C.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(W.value[C.path]){const we={...W.value};delete we[C.path],W.value=we}Vt(C,ae,{coalesce:!0})}function li(C){const q=Number.parseInt($.value,10);if(!Number.isInteger(q)||q<1){W.value={...W.value,[C.path]:"Warning thresholds must be positive whole numbers."};return}const ae=[...new Set([...C.value||[],q])].sort((we,Qe)=>Qe-we);$.value="",Vt(C,ae)}function ms(C,q){Vt(C,(C.value||[]).filter(ae=>ae!==q))}function pn(C){return C.apply_mode==="live_read"?"Odin reads the saved file value on next use.":C.apply_mode==="live_for_new_work"?"New work uses the saved file value.":C.apply_mode==="live_apply"?C.apply_handler?`Apply the saved value through ${C.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":C.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":C.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":C.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function In(C){return C.type==="array"&&Array.isArray(C.value)&&!C.structured_container&&!C.structured_container_child&&C.sensitivity==="public"&&C.value.every(q=>["string","number","boolean"].includes(typeof q))}function Ie(C){const q=String(Q.value[C.path]??"").trim();if(!q)return;const ae=[...new Set([...C.value||[],q])];Q.value={...Q.value,[C.path]:""},Vt(C,ae)}function N(C,q){Vt(C,(C.value||[]).filter(ae=>ae!==q))}function ce(C,q){var we;if(!C)return null;if((we=C.enum)!=null&&we.length&&!C.enum.includes(q))return`Choose one of: ${C.enum.join(", ")}`;if(C.path==="agents.final_warning_iterations"&&(!Array.isArray(q)||!q.length))return"Add at least one warning threshold.";const ae=C.constraints||{};if((C.type==="integer"||C.type==="number")&&typeof q=="number"){if(ae.minimum!==void 0&&q<ae.minimum)return`Must be at least ${ae.minimum}${C.unit?` ${C.unit}`:""}`;if(ae.maximum!==void 0&&q>ae.maximum)return`Must be at most ${ae.maximum}${C.unit?` ${C.unit}`:""}`}return null}function _e(C){return me.value[C.path]||null}function Fe(C){const q=`${C}.`;return Object.keys(me.value).some(ae=>ae===C||ae.startsWith(q))}function je(){n.value||M.value.length&&(L.value.push(Un(B.value)),B.value=M.value.pop(),W.value={},T.value={},ie={path:null,at:0})}function qe(){n.value||L.value.length&&(M.value.push(Un(B.value)),B.value=L.value.pop(),W.value={},T.value={},ie={path:null,at:0})}function Tt(){!G.value||be.value||(D.value=!0,le.value=!1)}function vt(){D.value=!1}function Et(){dn()}function hs(C){return eC[C]||vi(C||"unknown")}function Pt(C){return`apply-${String(C||"unknown").replaceAll("_","-")}`}function La(C){return`cfgc-field-${C.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function On(C){return`${La(C)}-input`}function sc(C){const q=document.getElementById(La(C))||document.getElementById(La(C.split(".").slice(0,2).join(".")));q==null||q.scrollIntoView({behavior:"smooth",block:"center"})}function Na(C,q){x.value={type:C,message:q},window.setTimeout(()=>{var ae;((ae=x.value)==null?void 0:ae.message)===q&&(x.value=null)},3500)}function ac(){y.value=!1,A.value="pending_restart",E.value="";const C=X1(a.value);C&&(C.scrollTop=0)}function Qi(){y.value=!1}function uo(C=1800){Y&&window.clearTimeout(Y),Y=window.setTimeout(Ln,C)}async function Ln(){if(w.value){if(J+=1,J>45){w.value=!1,S.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await ul(),Ve.value===0){w.value=!1,S.value=null,Na("success","Odin restarted and the saved startup settings are active.");return}}catch{}uo(2e3)}}async function nc(){if(!w.value){S.value=null;try{await j.post("/api/restart",{}),w.value=!0,J=0,y.value=!1,uo()}catch(C){S.value=C.message||"Odin could not schedule a restart."}}}async function Ma(){if(!(!G.value||be.value||n.value)){n.value=!0;try{const C=lC(e.value,B.value),q=await j.put("/api/config",C);e.value=q,B.value={},M.value=[],L.value=[],W.value={},D.value=!1;try{t.value=await ul(),g.value=null,y.value=Ve.value>0,Na("success",Ve.value?`Configuration saved. ${Ve.value} setting${Ve.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ae){g.value=ae.message||"Unknown metadata error.",Na("error",`Configuration saved, but apply status could not be refreshed: ${g.value}`)}}catch(C){Na("error",C.message||"Configuration could not be saved")}finally{n.value=!1}}}async function ic(){if(!n.value){n.value=!0,b.value=null;try{t.value=await ul(),g.value=null}catch(C){b.value=`Image model status could not be refreshed: ${C.message||"Unknown error"}`}finally{n.value=!1}}}async function lc(C,q){if(n.value||!["follow","pin"].includes(q)||!C.length||C.some(we=>{var Qe,kt;return!_.includes(we)||!((kt=(Qe=t.value)==null?void 0:Qe.image_model_defaults)!=null&&kt[we])}))return;n.value=!0,b.value=null;let ae=!1;try{const we=await j.post("/api/config/image-models",{operations:Object.fromEntries(C.map(Qe=>[Qe,q])),expected_revision:t.value.image_model_revision});ae=!0;for(const Qe of C){const kt=`image.openai.${Qe}`,Os=Mt(e.value,kt),Xs=Mt(we.config,kt),Pa=$a=>!Object.hasOwn($a,"image")||!Ci(Mt($a,kt),Os)?$a:da($a,kt.split("."),Xs);B.value=Pa(B.value),M.value=M.value.map(Pa),L.value=L.value.map(Pa),e.value=da(e.value,kt.split("."),Xs)}t.value={...t.value,image_model_defaults:we.image_model_defaults,image_model_revision:we.image_model_revision},Na("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(we){b.value=`Image model operation failed: ${we.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await ul(),g.value=null}catch(we){const Qe=`Image model status could not be refreshed: ${we.message||"Unknown error"}`;g.value=Qe,b.value=ae?`Image model defaults were saved, but ${Qe}`:`${b.value} ${Qe}`}finally{n.value=!1}}async function Da(){var C,q;if(!(G.value||n.value)){s.value=!0,I.value=null;try{const ae=await j.get("/api/config"),we=await ul();await m(),e.value=ae,t.value=we,g.value=null;const Qe=He.value;if(Qe.some(kt=>kt.key===k.value)||(k.value=((C=Qe[0])==null?void 0:C.key)||Di[0].key),re.value){const Os=(((q=Qe.find(Xs=>Xs.key===k.value))==null?void 0:q.sections)||[]).find(Xs=>O.value[Xs]===!0);O.value=Os?{...O.value,[Os]:!0}:{}}}catch(ae){I.value=ae.message||"Unknown configuration error"}finally{s.value=!1}}}function Xi(C){if(D.value||!(C.ctrlKey||C.metaKey))return;const q=C.target;q instanceof HTMLElement&&(q.matches("input, textarea, select")||q.isContentEditable)||(!C.shiftKey&&C.key.toLowerCase()==="z"?(C.preventDefault(),je()):(C.key.toLowerCase()==="y"||C.shiftKey&&C.key.toLowerCase()==="z")&&(C.preventDefault(),qe()))}function el(C){re.value=C.matches}Kt(O,C=>{try{localStorage.setItem(Sg,JSON.stringify(C))}catch{}},{deep:!0});let oi=!1;function tl(){oi||(oi=!0,document.addEventListener("keydown",Xi))}function sl(){oi&&(oi=!1,document.removeEventListener("keydown",Xi))}return tt(()=>{var C;Da(),tl(),z=window.matchMedia("(max-width: 760px)"),el(z),(C=z.addEventListener)==null||C.call(z,"change",el)}),ls(tl),Jt(sl),Jt(()=>{o.value=""}),_t(()=>{var C;o.value="",sl(),(C=z==null?void 0:z.removeEventListener)==null||C.call(z,"change",el),Y&&window.clearTimeout(Y)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:de,listenerStatusTone:F,listenerStatusLabel:Z,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:H,listenerRunningCopy:te,saveListenerConsent:h,armKeydown:tl,disarmKeydown:sl,handleKeydown:Xi,config:e,meta:t,loading:s,saving:n,error:I,toast:x,metaRefreshError:g,restartPromptOpen:y,restartScheduled:w,restartError:S,configMain:a,imageModelError:b,imageModelLeaves:_,setImageModelDefaults:lc,refreshImageModelMetadata:ic,searchQuery:E,healthFilter:A,activeCategory:k,reviewOpen:D,mobileOverflowOpen:le,warningThresholdInput:$,arrayInputs:Q,healthFilters:ge,visibleCategories:He,displayGroups:Pe,reviewGroups:Ge,sectionCount:K,fieldCount:pe,hasChanges:G,changeCount:se,changedSectionCount:ye,hasDraftErrors:be,canUndo:xe,canRedo:ke,globalFilterActive:he,reviewRestartCount:De,pendingRestartCount:Ve,pendingRestartFields:Be,healthCount:Qs,categoryStats:cn,selectCategory:Ye,selectHealthFilter:st,clearFilters:Ct,sectionLabel:Ae,sectionDescription:ne,sectionFieldCount:Re,sectionHealthCount:pt,sectionApplySummary:$e,sectionApplyDetails:ot,sectionEntries:Dt,fieldGroups:Zs,sectionSearchHits:ss,mcpConfigSummary:nt,fieldRuntimeCopy:Ze,fieldSpecificRuntimeNote:Is,hasHonestAction:ts,runFieldAction:ra,hasHostsCollection:ee,hostsConfigSummary:Se,sectionChanged:oe,fieldChanged:Te,isSectionExpanded:Bs,toggleSection:ii,discardAllDrafts:dn,setFieldValue:Vt,setNumberFieldValue:Yi,numberInputValue:Rn,beginInputEdit:zs,endTextInputEdit:fs,endInputEdit:An,addWarningThreshold:li,removeWarningThreshold:ms,isScalarArray:In,addScalarArrayItem:Ie,removeScalarArrayItem:N,fieldError:_e,sectionHasErrors:Fe,undo:je,redo:qe,openReview:Tt,closeReview:vt,mobileCancel:Et,applyModeLabel:hs,applyClass:Pt,compactValue:nC,formatValue:iC,structuredApplyCopy:pn,fieldId:La,fieldInputId:On,focusField:sc,fetchConfig:Da,saveConfig:Ma,restartOdin:nc,restartLater:Qi,reviewPendingRestart:ac}}},dC=/^\d{15,25}$/;function Ag(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Rg={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=V(()=>new Set((e.excludedIds||[]).map(String))),o=V(()=>{const w=s.value.toLowerCase().trim();return(e.members||[]).filter(S=>l.value.has(String(S.id))?!1:w?u(S).toLowerCase().includes(w)||String(S.username||"").toLowerCase().includes(w)||String(S.id).includes(w):!0)}),r=V(()=>{const w=s.value.trim();return o.value.length===0&&dC.test(w)&&!l.value.has(w)?w:""}),c=V(()=>o.value.length+(r.value?1:0)),d=V(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(w){return Ag(w)}function p(){a.value=!0,n.value=0}function m(){p()}function h(){const w=Math.max(c.value-1,0);n.value=Math.min(n.value+1,w)}function b(){n.value=Math.max(n.value-1,0)}function _(){const w=o.value[n.value];w?I(w):r.value&&n.value===o.value.length&&x(r.value)}function I(w){x(String(w.id))}function x(w){t("select",w),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function y(){setTimeout(g,150)}return tt(()=>{e.autofocus&&Ht(()=>{var w;return(w=i.value)==null?void 0:w.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:m,highlightNext:h,highlightPrevious:b,selectHighlighted:_,selectMember:I,selectId:x,closeOptions:g,onBlur:y}}};function Pf(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const uC={components:{DiscordUserCombobox:Rg},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),m=f({}),h=f([]);let b=0;const _=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),I=V(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),x=V(()=>new Map(h.value.map(fe=>[String(fe.id),fe])));function g(fe){return fe.config&&fe.config.enabled!==void 0?fe.config.enabled:!0}function y(fe){return Pf(fe,"require_mention",c.value)}function w(fe){return Pf(fe,"respond_to_bots",c.value)}function S(fe){return fe.config&&Object.keys(fe.config).length>0}function E(fe){r.value[fe]=!r.value[fe]}function A(fe){const K=fe.discord||{};return{allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]}}async function k({showLoading:fe=!0}={}){const K=++b;fe&&(l.value=!0),o.value=null;try{const pe=await j.get("/api/discord/guilds");K===b&&(e.value=pe)}catch(pe){K===b&&(o.value=pe.message)}finally{fe&&K===b&&(l.value=!1)}}async function O(){try{t.value=await j.get("/api/discord/connection"),n.value=null}catch(fe){n.value=fe.message}}async function B(fe,K=null){if(!a.value){a.value=!0,n.value=null;try{const pe={operation:fe};K!==null&&(pe.token=K),t.value=await j.post("/api/discord/connection",pe),fe==="credentials"&&(s.value="")}catch(pe){n.value=pe.message||"Connection update failed."}finally{a.value=!1}}}function T(){return B("credentials",s.value)}function $(){return B("connect")}function Q(){return B("detach")}async function W(){l.value=!0,o.value=null;try{const[fe,K,pe]=await Promise.all([j.get("/api/discord/guilds"),j.get("/api/discord/members").catch(()=>[]),j.get("/api/config")]),ge=A(pe),xe=I.value;c.value=ge,xe||(d.value=JSON.parse(JSON.stringify(ge))),h.value=K,e.value=fe,p.value=null}catch(fe){o.value=fe.message}finally{l.value=!1}}let M=Promise.resolve();const L=f(new Set);function D(fe,K){const pe=new Set(L.value);pe.add(fe),L.value=pe;const ge=M.then(K);return M=ge.catch(()=>{}),ge.finally(()=>{const xe=new Set(L.value);xe.delete(fe),L.value=xe})}function le(fe,K,pe,ge){const xe=(ge==null?void 0:ge.target)??null;return D(`guild:${fe}:${K}`,async()=>{try{await j.put("/api/discord/guild/"+fe+"/config",{[K]:pe}),await k({showLoading:!1})}catch(ke){o.value=ke.message,xe&&typeof pe=="boolean"&&(xe.checked=!pe)}})}function re(fe,K,pe,ge,xe){const ke=(xe==null?void 0:xe.target)??null;return D(`channel:${fe}:${pe}`,async()=>{try{await j.put("/api/discord/channel/"+fe+"/config",{[pe]:ge}),await k({showLoading:!1})}catch(He){o.value=He.message,ke&&typeof ge=="boolean"&&(ke.checked=!ge)}})}function z(fe,K){return D(`channel:${fe}:clear`,async()=>{try{await j.put("/api/discord/channel/"+fe+"/config",{clear:!0}),await k({showLoading:!1})}catch(pe){o.value=pe.message}})}function Y(fe,K){const pe=String(K);if(!fe.userAutocomplete)return pe;const ge=x.value.get(pe);return ge?Ag(ge):pe}function ie(fe,K=null){const pe=String(K??m.value[fe]??"").trim();!pe||d.value[fe].includes(pe)||(d.value[fe]=[...d.value[fe],pe],m.value={...m.value,[fe]:""})}function J(fe,K){d.value[fe]=d.value[fe].filter(pe=>pe!==K)}async function ve(){if(!(!I.value||u.value)){u.value=!0,p.value=null;try{const K=(await j.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(fe){p.value=fe.message||"Global defaults could not be saved."}finally{u.value=!1}}}return tt(()=>{W(),O(),i=window.setInterval(O,5e3)}),_t(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:m,globalMembers:h,globalListEditors:_,globalChanged:I,guildEnabled:g,guildMention:y,guildBots:w,hasOverride:S,toggleGuild:E,fetchAll:W,fetchGuilds:k,setGuildConfig:le,setChannelConfig:re,clearOverride:z,mutationPending:L,globalItemLabel:Y,addGlobalItem:ie,removeGlobalItem:J,saveGlobalDefaults:ve,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:T,connectDiscord:$,detachDiscord:Q}}},Vs=e=>e==null?e:JSON.parse(JSON.stringify(e));function pC({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let m=null;const h=new Map;function b(S){d+=1;const E=c.then(S,S);return c=E.catch(()=>{}),E}function _(S,E){m=Vs(S),h.clear();for(const[A,k]of Object.entries(E||{}))h.set(A,Vs(k))}function I(S){const E=Vs(S),A=++u;return b(async()=>{try{await e(Vs(E)),m=Vs(E),A===u&&a(Vs(E))}catch(k){A===u&&(n(Vs(m)),r(k,{kind:"default"}))}})}function x(S,E){const A=Vs(E),k=(p.get(S)||0)+1;return p.set(S,k),b(async()=>{try{await t(S,Vs(A)),h.set(S,Vs(A)),k===p.get(S)&&i(S,Vs(A))}catch(O){k===p.get(S)&&(l(S,Vs(h.get(S)??null)),r(O,{kind:"user",uid:S}))}})}function g(S){const E=(p.get(S)||0)+1;return p.set(S,E),b(async()=>{try{await s(S),h.delete(S),E===p.get(S)&&o(S)}catch(A){E===p.get(S)&&(l(S,Vs(h.get(S)??null)),r(A,{kind:"delete",uid:S}))}})}async function y(){for(;;){const S=c;if(await S,S===c)return d}}async function w(S){for(;;){const E=await y(),A=await S();if(E===d)return A}}return{seed:_,saveDefault:I,saveUser:x,deleteUser:g,whenIdle:y,readSnapshot:w,get revision(){return d}}}const fC={components:{DiscordUserCombobox:Rg},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=V(()=>{const T={};for(const $ of r.value)T[$.id]=$;return T});function d(T){return c.value[T]||null}function u(T,$){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...$],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...$],default_host:$[0]||"",allow_all:!0}}const p=pC({applyDefault:async T=>{const $=T.allow_all?null:T.allowed_hosts;await j.put("/api/host-access/default-policy",{allowed_hosts:$,default_host:T.default_host})},applyUser:async(T,$)=>{const Q=$.allow_all?null:$.allowed_hosts;await j.put(`/api/host-access/user/${T}`,{allowed_hosts:Q,default_host:$.default_host})},applyDelete:T=>j.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>Ee.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const $=d(T);Ee.success(`Updated access for ${$?$.display_name:T}`)},onUserRollback:(T,$)=>{const Q={...l.value};$?Q[T]=$:delete Q[T],l.value=Q},onUserDeleted:T=>{const $={...l.value};delete $[T],l.value=$},onError:(T,$)=>{var W;const Q=$.uid?` ${((W=d($.uid))==null?void 0:W.display_name)||$.uid}`:"";Ee.error(`${T.message||"Failed to save"} — reverted${Q}`)}});let m=0;async function h(){const T=++m;e.value=!0,t.value="";try{const $=await p.readSnapshot(()=>j.get("/api/host-access"));if(T!==m)return;s.value=$,a.value=$.available_hosts||[],n.value=$.host_descriptions||{},i.value=u($.default_policy,a.value);const Q=$.users||{},W={};for(const[M,L]of Object.entries(Q))W[M]=u(L,a.value);l.value=W,p.seed(i.value,W)}catch($){T===m&&(t.value=$.message||"Failed to fetch host access data")}finally{T===m&&(e.value=!1)}try{const $=await j.get("/api/discord/members")||[];T===m&&(r.value=$)}catch{T===m&&(r.value=[])}}const b=500,_=new Map;function I(T,$){const Q=_.get(T);Q&&clearTimeout(Q.timer);const W={run:$,timer:null};W.timer=setTimeout(()=>{_.delete(T),$()},b),_.set(T,W)}function x(T){const $=_.get(T);$&&(clearTimeout($.timer),_.delete(T))}function g(){for(const[T,$]of[..._])clearTimeout($.timer),_.delete(T),$.run()}function y(){I("default",()=>p.saveDefault(i.value))}function w(T,$){i.value.allow_all=!1,$?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Q=>Q!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),y()}function S(T){I(`user:${T}`,()=>{const $=l.value[T];$&&p.saveUser(T,$)})}function E(T,$,Q){const W=l.value[T];W&&(W.allow_all=!1,Q?W.allowed_hosts.includes($)||W.allowed_hosts.push($):(W.allowed_hosts=W.allowed_hosts.filter(M=>M!==$),W.default_host===$&&(W.default_host=W.allowed_hosts[0]||"")),S(T))}function A(T,$){const Q=l.value[T];Q&&(Q.default_host=$,S(T))}function k(){o.value=!0}function O(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function B(T){const $=d(T);await is({title:"Remove user override",message:`Remove the host access override for ${$?$.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(x(`user:${T}`),await p.deleteUser(T),l.value[T]||Ee.success(`Removed override for ${$?$.display_name:T}`))}return tt(h),Jt(g),_t(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:h,saveDefaultPolicy:y,toggleDefaultHost:w,getMember:d,toggleUserHost:E,setUserDefault:A,openAddUser:k,addUserById:O,deleteUser:B,flushPendingSaves:g}}},mC={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),m=f(null),h=f(""),b=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),_=f(b()),I=V(()=>["127.0.0.1","localhost","::1"].includes(_.value.address));async function x(){t.value=!0,s.value="";try{const W=await j.get("/api/hosts");e.value=W.hosts||[],o.value=W.default_host||"",r.value=!!W.tofu_enabled}catch(W){s.value=W.message}finally{t.value=!1}}async function g(){try{await j.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),Ee.success("Host settings saved and published live"),await x()}catch(W){Ee.error(W.message)}}function y(){d.value="",u.value=[],p.value=!1,m.value=null,c.value=null,h.value="",l.value=1,n.value=!0}function w(){i.value=!1,_.value=b(),y()}function S(W){i.value=!0,_.value={...b(),...W},y()}async function E(){try{c.value=await j.get("/api/hosts/public-key")}catch(W){Ee.error(W.message)}}async function A(W){try{const M=await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/import-legacy",{});i.value=!0,_.value={...b(),...W,trust_mode:"pinned"},y(),d.value=M.candidate_token,u.value=M.fingerprints||[],h.value=u.value.join(`
`),l.value=4,Ee.info("Imported existing known_hosts trust. Test before activation.")}catch(M){Ee.error(M.message)}}async function k(){try{const W=h.value.split(/\s+/).filter(Boolean),M={..._.value,expected_fingerprints:W,candidate_fingerprints:u.value},L=await j.post("/api/hosts/candidates",M);if(d.value=L.candidate_token,u.value=L.fingerprints||[],_.value.trust_mode==="tofu"&&M.candidate_fingerprints.length===0){_.value.confirm_tofu=!1,Ee.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(W){Ee.error(W.message)}}async function O(){var W,M;p.value=!1,m.value=null;try{const L=await j.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!L.tested,m.value=L.last_test,p.value&&(l.value=5)}catch(L){const D=(W=L.data)==null?void 0:W.last_test;D&&typeof D=="object"&&!Array.isArray(D)&&(m.value=D);const le=(M=m.value)==null?void 0:M.detail;Ee.error(typeof le=="string"&&le.trim()?le:L.message)}}async function B(){try{await j.post("/api/hosts/candidates/"+d.value+"/commit",{}),Ee.success("Host saved and published live"),n.value=!1,await x()}catch(W){Ee.error(W.message)}}async function T(W){try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/enabled",{enabled:!W.enabled}),await x()}catch(M){Ee.error(M.message)}}async function $(W){var M;if(await is("Delete host "+W.alias+"? Dependencies will block deletion.")){a.value=[];try{await j.del("/api/hosts/"+encodeURIComponent(W.alias)),await x()}catch(L){a.value=Array.isArray((M=L.data)==null?void 0:M.pending_references)?L.data.pending_references:[],Ee.error(L.message)}}}async function Q(W){if(await is("Force revoke "+W.alias+"? Remote outcomes may be unknown."))try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/force-revoke",{}),await x()}catch(M){Ee.error(M.message)}}return tt(x),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:_,isLocal:I,keyInfo:c,candidate:d,observed:u,tested:p,testResult:m,fingerprintsText:h,load:x,saveSettings:g,beginAdd:w,beginEdit:S,loadKey:E,importLegacy:A,prepare:k,testConnection:O,commit:B,toggle:T,remove:$,forceRevoke:Q}}},hC={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=V(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=V(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function m(A){return A==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":A==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function h(){e.value=!0,t.value="";try{const A=await j.get("/api/tokens");s.value=A.tokens||[],a.value=A.available_hosts||[]}catch(A){t.value=A.message||"Failed to load tokens"}finally{e.value=!1}}function b(A){return!A||!A.trim()?[]:A.split(",").map(k=>k.trim()).filter(Boolean)}function _(A,k){const O=c.value.allowed_hosts;if(k&&!O.includes(A)&&O.push(A),!k){const B=O.indexOf(A);B>=0&&O.splice(B,1)}}function I(A,k){const O=d.value.allowed_hosts;if(k&&!O.includes(A)&&O.push(A),!k){const B=O.indexOf(A);B>=0&&O.splice(B,1)}}async function x(){var A;i.value=!0;try{const k=b(c.value.allowed_tools_str),O=c.value.host_mode,B=O==="none"?[]:O==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:k.length?k:[]};B!==null&&(T.allowed_hosts=B),T.default_host=c.value.default_host||"";const $=await j.post("/api/tokens",T);l.value=$.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,Ee.success("Token created"),await h()}catch(k){Ee.error(((A=k.data)==null?void 0:A.error)||k.message||"Failed to create token")}finally{i.value=!1}}function g(A){o.value=A;const k=A.allowed_hosts;let O="default";k==null?O="default":Array.isArray(k)&&k.length===0?O="none":Array.isArray(k)&&(O="select"),d.value={username:A.username||"",tier:A.tier||"admin",label:A.label||"",host_mode:O,allowed_hosts:Array.isArray(k)?[...k]:[],default_host:A.default_host||"",allowed_tools_str:(A.allowed_tools||[]).join(", ")}}async function y(){var A;if(o.value){r.value=!0;try{const k=b(d.value.allowed_tools_str),O=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:k};O==="none"?B.allowed_hosts=[]:O==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await j.put("/api/tokens/"+encodeURIComponent(o.value.user_id),B),o.value=null,Ee.success("Token updated"),await h()}catch(k){Ee.error(((A=k.data)==null?void 0:A.error)||k.message||"Failed to update")}finally{r.value=!1}}}async function w(A){var O;if(await is({title:"Regenerate token",message:`Regenerate token for ${A.username||A.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await j.post("/api/tokens/"+encodeURIComponent(A.user_id)+"/regenerate");l.value=B.token,Ee.success("Token regenerated")}catch(B){Ee.error(((O=B.data)==null?void 0:O.error)||B.message||"Failed to regenerate")}}async function S(A){var O;if(await is({title:"Delete token",message:`Delete token for ${A.username||A.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/tokens/"+encodeURIComponent(A.user_id)),Ee.success("Token deleted"),await h()}catch(B){Ee.error(((O=B.data)==null?void 0:O.error)||B.message||"Failed to delete")}}async function E(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ee.success("Copied to clipboard")}catch{Ee.error("Copy failed — select and copy manually")}}return tt(h),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:h,tierBadge:m,toggleCreateHost:_,toggleEditHost:I,createToken:x,startEdit:g,saveEdit:y,confirmRegenerate:w,confirmDelete:S,copyToken:E}}},vC=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),gC=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),bC=Object.freeze(["enabled","base_url","model","max_tokens","num_ctx"]),yC=Object.freeze(["enabled","base_url","model"]);function ro(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function No(e,t={}){const s=ro(e,yC);return t.includeApiKey&&(s.api_key=e.api_key),s}function Pc(e){return ro(e,["timeout","preset","model_profiles","context_utilization","openrouter"])}function Mo(e){return ro(e,vC)}function Do(e){return ro(e,gC)}function Po(e,{includeApiKey:t=!1}={}){const s=ro(e,bC);return t&&(s.api_key=e.api_key),s}function $c(e){return{timeout:e.timeout}}function $o(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const xC={template:`
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
              <section v-if="openRouterRecognized" class="llm-advanced-group">
                <header><strong>OpenRouter provider pinning</strong><span>Order uses lowercase endpoint tags, never display names. Fallbacks default off so a pin cannot silently drift.</span></header>
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
                <label class="flex items-center gap-2"><input v-model="compatibleForm.openrouter.allow_fallbacks" type="checkbox" class="provider-control" /><span class="text-xs text-amber-400">Allow fallback away from the pin</span></label>
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
  `,setup(){const e=f(!0),t=f(null),s=5e3;let a=null,n=!1,i=null;const l={codexBasic:null,codexAdvanced:null,ollamaBasic:null,ollamaAdvanced:null,compatibleBasic:null,compatibleAdvanced:null,auxiliary:null,mainModel:null,agents:null},o=v=>JSON.stringify(v),r=(v,U)=>{l[v]=o(U)},c=(v,U)=>l[v]!==null&&l[v]!==o(U),d=f(null),u=f(!1),p=f({main:"",main_capability:"medium",agent_capability:"adaptive"}),m=f(""),h=["none","low","medium","high","xhigh","max"],b=["none","low","medium","high","xhigh","max"],_=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),I=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],x=V(()=>{const v=d.value||{},U=v.model_catalogue||v.model_catalog||{},X=Ne=>{var At,It,Ls;return((At=be.value.model_profiles)==null?void 0:At[Ne])||((Ls=(It=be.value.openrouter)==null?void 0:It.catalogue_profiles)==null?void 0:Ls[Ne])||null},Ce=(Ne,At,It)=>At.map(Ls=>{var Yu,Qu;const pi=typeof Ls=="string"?Ls:Ls.name,js=Ne==="compat"?X(pi):null;return{ref:Ne==="codex"?Ls:`${Ne}:${pi}`,name:pi,provider:Ne,available:!!(It!=null&&It.enabled&&(Ne==="codex"?It.configured:(Yu=It.health)!=null&&Yu.healthy)),unavailable_reason:It!=null&&It.enabled?It!=null&&It.configured?!((Qu=It==null?void 0:It.health)!=null&&Qu.healthy)&&Ne!=="codex"?"unreachable":"":"not configured":"disabled",capability:Ne==="codex"||js!=null&&js.supports_reasoning?"reasoning":js!=null&&js.supports_thinking_mode?"thinking":"none",efforts:js==null?void 0:js.supported_efforts,profile:js}}),Me=[...U.codex||Ce("codex",I,v.codex),...U.compat||U.openai_compatible||[],...U.ollama||Ce("ollama",Ae.value,v.ollama)].map(Ne=>typeof Ne=="string"?{ref:Ne,name:Ne,provider:"codex",available:!0,capability:"reasoning"}:Ne),ct=Ne=>{const At=Me.findIndex(It=>It.ref===Ne.ref);At===-1?Me.push(Ne):Me[At]={...Me[At],...Ne}};for(const Ne of Ce("compat",nt.value,v.openai_compatible))ct(Ne);if(ms.value&&Ct.value.length)for(const Ne of Ct.value){const At=`compat:${Ne.id}`;ct({ref:At,name:Ne.name||Ne.id,provider:"compat",available:!0,unavailable_reason:"",capability:Ne.supports_reasoning?"reasoning":"none",efforts:h.filter(It=>{var Ls;return(Ls=Ne.supported_efforts)==null?void 0:Ls.includes(It)}),agent_available:Ne.agent_eligible&&!!Ne.profile,agent_unavailable_reason:Ne.agent_unavailable_reason||""})}const We=new Set(Me.map(Ne=>Ne.ref));for(const Ne of[p.value.main,Ze.value.model,...ss.value])Ne&&Ne!=="auto"&&!We.has(Ne)&&Me.unshift({ref:Ne,name:Ne.replace(/^(compat|ollama):/,""),provider:Ne.split(":")[0]||"codex",available:!1,unavailable_reason:"unavailable",capability:Ne.startsWith("ollama:")||Ne.includes(":")?"none":"reasoning"});return Me.filter(Ne=>!ms.value||Ne.provider!=="compat"||Ne.ref.slice(7).includes("/")).map(Ne=>Ne.efforts?{...Ne,efforts:h.filter(At=>Ne.efforts.includes(At)&&!ie(Ne.ref,At))}:Ne)}),g=V(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,U])=>({id:v,label:U,models:x.value.filter(X=>{if(X.provider!==v)return!1;const Ce=m.value.trim().toLowerCase();return!Ce||`${X.name} ${X.ref}`.toLowerCase().includes(Ce)})})).filter(v=>v.models.length)),y=v=>v.available&&v.agent_available!==!1,w=v=>v.available?`${v.name}${v.agent_available===!1?` (${v.agent_unavailable_reason||"not agent-eligible"})`:""}`:le(v),S=V(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,U])=>({id:v,label:U,models:x.value.filter(X=>X.provider===v&&!(v==="compat"&&ms.value)&&`${X.ref} ${X.name}`.toLowerCase().includes(ht.value.trim().toLowerCase()))})).filter(v=>v.models.length)),E=V(()=>x.value.find(v=>v.ref===p.value.main)),A=V(()=>x.value.find(v=>v.ref===Ze.value.model)),k=v=>x.value.find(U=>U.ref===v),O=v=>{const U=k(v);return(U==null?void 0:U.provider)==="codex"?h.filter(X=>!ie(v,X)):(U==null?void 0:U.efforts)||[]},B=v=>ra.value.find(U=>ts(U)===v),T=(v,U)=>{const X=B(v);return typeof X=="string"?"":(X==null?void 0:X[U])||""},$=V(()=>ss.value.map(v=>k(v)).filter(v=>v&&y(v))),Q=V(()=>[...new Set($.value.map(v=>v.capability!=="reasoning"?v.capability||"none":v.provider==="codex"?"codex_reasoning":"compatible_reasoning"))]),W=V(()=>Q.value.length>1),M=V(()=>{var U;if(Ze.value.model!=="auto")return((U=A.value)==null?void 0:U.capability)||"none";if(W.value)return"mixed";const v=Q.value[0]||"none";return v.endsWith("_reasoning")?"reasoning":v}),L=V(()=>{var v;return Ze.value.model==="auto"?h:((v=A.value)==null?void 0:v.efforts)||h}),D=V(()=>M.value==="thinking"?Ze.value.thinking_mode??_.value.agent_reasoning_effort??"":_.value.agent_reasoning_effort??""),le=v=>`${v.name}${v.available?"":` (${v.unavailable_reason||"unavailable"})`}`,re=V(()=>{const v=_.value.model;return v&&!I.includes(v)?[v,...I]:I}),z=V(()=>{const v=Ze.value.model;return v&&v!=="auto"&&!I.includes(v)?[v,...I]:I}),Y={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},ie=(v,U)=>!!v&&!!U&&(Y[v]||[]).includes(U),J=V(()=>{const v=Ze.value.model;return v&&!v.includes(":")?v:null}),ve=v=>!ie(_.value.model,v)&&!(_.value.agent_reasoning_effort===""&&ie(J.value,v)),fe=v=>{const U=Ze.value.model;return U==="auto"?!0:!ie(U||_.value.model,v)},K=V(()=>{const v=_.value.agent_reasoning_effort;return v==="auto"?null:v||_.value.reasoning_effort}),pe=v=>ie(v,_.value.reasoning_effort)||Ze.value.model===""&&ie(v,K.value),ge=v=>ie(v,K.value),xe=f({enabled:!1,model:"gpt-5.6-luna"}),ke=f({unavailable_reason:null}),He=V(()=>{const v=xe.value.model;return v&&!I.includes(v)?[v,...I]:I});function R(v){const U=v.target.value;xe.value.enabled=U!=="",U!==""&&(xe.value.model=U),U.startsWith("compat:")&&ms.value?Da(ae(U),we(U)).then(()=>Nn()).catch(X=>Ue(X.message||"Failed to prepare OpenRouter model","error")):Nn()}const P=f(!1),G=f({codex:!1,ollama:!1,compatible:!1}),de=f(null),F=f(!1),Z=f(""),ue=f(null),H=f(!1);let te=0;const se=V(()=>{var v;return Object.entries(((v=de.value)==null?void 0:v.models)||{}).map(([U,X])=>{var Ce,Me,ct;return{model:U,floor:X.floor,override:X.override,effectiveBudget:(Ce=X.effective)==null?void 0:Ce.effective_budget,configuredPrimaryChars:(Me=X.configured)==null?void 0:Me.primary_chars,primaryChars:(ct=X.effective)==null?void 0:ct.primary_chars,provenance:X.provenance,clampExpiresAt:X.clamp_expires_at,densityPriorMilli:X.density_prior_milli,densityScope:X.density_scope,workloadCalibration:X.workload_calibration}})}),ye=V(()=>{var v;return((v=de.value)==null?void 0:v.clamps)||[]}),he=V(()=>{var v,U;return((U=(v=de.value)==null?void 0:v.models)==null?void 0:U[_.value.model])||null}),me=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,num_ctx:32768,timeout:300}),be=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",timeout:300,preset:"deepseek",model_profiles:{},context_utilization:75,openrouter:{order:[],allow_fallbacks:!0,quantizations:[],sort:null,data_collection:null,reasoning_effort:"medium",model_pins:{},catalogue_profiles:{}}}),Pe=f(!1),Ge=f(!1),De=f(!1),Be=f(!1),Ve=f(!1),rt=f(!1);function Je(){var U,X,Ce;return!!(((U=t.value)==null?void 0:U.contains(document.activeElement))&&((Ce=(X=document.activeElement)==null?void 0:X.matches)==null?void 0:Ce.call(X,'input, textarea, select, [contenteditable="true"]'))||Oa.value||po.value!==null||H.value||Pe.value||Ge.value||Is.value||De.value||Be.value||Ve.value||P.value||di.pending()||ui.pending()||Mn.pending()||Nn.pending()||c("codexBasic",Mo(_.value))||c("codexAdvanced",Do(_.value))||c("ollamaBasic",Po(me.value))||c("ollamaAdvanced",$c(me.value))||c("compatibleBasic",No(be.value))||c("compatibleAdvanced",Pc(be.value))||c("auxiliary",xe.value)||c("mainModel",p.value.main)||c("agents",Ze.value))}function ee(){l.codexBasic=o(Mo(_.value)),l.codexAdvanced=o(Do(_.value)),l.ollamaBasic=o(Po(me.value)),l.ollamaAdvanced=o($c(me.value)),l.compatibleBasic=o(No(be.value)),l.compatibleAdvanced=o(Pc(be.value)),l.auxiliary=o(xe.value),l.mainModel=o(p.value.main)}const Se=f({configured:null}),Re=f(!1),Ae=f([]),ne=f(""),Le=f(!1),$e=f(!1),ot=f({configured:null}),Yt=f(!1),nt=f([]),Mt=V(()=>ms.value?Ct.value.map(v=>v.id):nt.value),Dt=f(""),ps=f(!1),Zs=f(!1),Ze=f({model:"auto",thinking_mode:null,auto_model_allowlist:[]}),Oa=f(!1),Is=f(!1),ts=v=>typeof v=="string"?v:v==null?void 0:v.model,ra=V(()=>(Ze.value.auto_model_allowlist||[]).map(v=>typeof v=="string"?v:{...v}).filter(v=>ts(v))),Ys=V(()=>!_.value.enabled&&be.value.enabled?be.value.model?[`compat:${be.value.model}`]:[]:!_.value.enabled&&!be.value.enabled&&me.value.enabled?me.value.model?[`ollama:${me.value.model}`]:[]:I),ss=V(()=>ra.value.length?ra.value.map(ts):Ys.value),ca=V(()=>{var v;return(v=Ze.value.auto_model_allowlist)!=null&&v.length?`Allowlist: ${ss.value.length} models`:`Default: ${ss.value.join(", ")||"no available agent models"}`}),pt=new Map;function Qs(){Oa.value=!1,C()}const cn=v=>{if(ms.value&&v.startsWith("compat:")&&!v.slice(7).includes("/"))return"OpenRouter requires a namespaced vendor/model ID; this is a direct-endpoint profile.";const U=x.value.find(X=>X.ref===v);return U?y(U)?"":U.agent_unavailable_reason||U.unavailable_reason||"Not agent-eligible":"Model is absent from the current endpoint catalogue."},oe=v=>{if(qe.value.has(v))return Et(v);const U=x.value.find(Ce=>Ce.ref===v),X=(U==null?void 0:U.hint_metadata)||{};return[X.hint||X.hint_derived,X.as_of&&`as of ${X.as_of}`,X.scope_note,X.evidence&&`Evidence: ${X.evidence}`,U&&Os(U)].filter(Boolean).join(" · ")||"No catalogue hint. Add an operator hint below."},Te=f(null),Ye=f(!1),st=f(""),Ct=V(()=>{var v;return(((v=Te.value)==null?void 0:v.models)||[]).map(U=>{var Ce,Me,ct;const X=((Ce=be.value.model_profiles)==null?void 0:Ce[U.id])||U.profile||((ct=(Me=be.value.openrouter)==null?void 0:Me.catalogue_profiles)==null?void 0:ct[U.id])||(U.context_length>0&&U.max_completion_tokens>0?{total_window_tokens:U.context_length,max_output_tokens:U.max_completion_tokens}:null);return{...U,profile:X}})}),ht=f(""),ga=f(""),Bs=f(!0),ii=f(!0),En=f(!0),dn=f(!1),un=f(null),da=f(""),ba=f(null),Vt=f(""),zs=f([]),fs=f(!1),An=f("throughput"),Rn=(v,U,X=null)=>{const Ce=v[U],Me=X&&Ce&&typeof Ce=="object"?Ce[X]:Ce,ct=Number(Me);return Number.isFinite(ct)?ct:null},Yi=V(()=>{const v=[...zs.value],U=An.value;return v.sort((X,Ce)=>{var pi,js;if(U==="quantization")return String(X.quantization).localeCompare(String(Ce.quantization));const[Me,ct,We]=U==="throughput"?["throughput_last_30m","p50",!0]:U==="latency_p99"?["latency_last_30m","p99",!1]:U==="cache_price"?["cache_read_per_token",null,!1]:["prompt_per_token",null,!1],Ne=(pi=X.pricing)==null?void 0:pi[Me],At=(js=Ce.pricing)==null?void 0:js[Me],It=ct?Rn(X,Me,ct):Ne==null?null:Number(Ne),Ls=ct?Rn(Ce,Me,ct):At==null?null:Number(At);return Number.isFinite(It)?Number.isFinite(Ls)?We?Ls-It:It-Ls:-1:1})}),li=V(()=>{try{return new URL(be.value.base_url).hostname}catch{return""}}),ms=V(()=>/(^|\.)openrouter\.ai$/i.test(li.value)),pn=V(()=>{var v,U;return ms.value?Ye.value?"OpenRouter recognized · fetching catalogue…":st.value?`OpenRouter recognized · catalogue failed: ${st.value}`:`OpenRouter recognized · ${((U=(v=Te.value)==null?void 0:v.models)==null?void 0:U.length)||0} catalogue models loaded`:nt.value.length?`${nt.value.length} endpoint models loaded`:"Catalogue not loaded"}),In=V(()=>st.value?"text-red-400":"text-gray-500"),Ie=V(()=>{var v;return[...new Set((((v=Te.value)==null?void 0:v.models)||[]).map(U=>U.vendor))].sort()}),N=V(()=>{var v;return[...new Set((((v=Te.value)==null?void 0:v.models)||[]).flatMap(U=>(U.endpoints||[]).map(X=>X.quantization)).filter(Boolean))].sort()}),ce=v=>{var U;return(((U=Te.value)==null?void 0:U.measured_cache)||[]).some(X=>X.model===v.id&&X.samples>0&&X.cached_percent>0)},_e=V(()=>{const v=ht.value.trim().toLowerCase();return Ct.value.filter(U=>{var X;return!(v&&!`${U.id} ${U.name} ${U.vendor}`.toLowerCase().includes(v)||ga.value&&U.vendor!==ga.value||Bs.value&&!U.supports_tools||ii.value&&!U.agent_eligible||En.value&&U.variant!=="standard"||dn.value&&!ce(U)||un.value!=null&&Number((X=U.pricing)==null?void 0:X.prompt_per_token)*1e6>Number(un.value)||da.value&&!(U.endpoints||[]).some(Ce=>Ce.quantization===da.value))})}),Fe=V(()=>_e.value.slice(0,100)),je=V(()=>_e.value.length),qe=V(()=>new Map(Ct.value.map(v=>[`compat:${v.id}`,v]))),Tt=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(3)}/M`,vt=v=>{var U,X,Ce,Me;return[v.vendor,v.context_length?`${Number(v.context_length).toLocaleString()} ctx`:"context unknown",`${Tt((U=v.pricing)==null?void 0:U.prompt_per_token)} in`,`${Tt((X=v.pricing)==null?void 0:X.completion_per_token)} out`,`${Tt((Ce=v.pricing)==null?void 0:Ce.cache_read_per_token)} cache read`,`${Tt((Me=v.pricing)==null?void 0:Me.cache_write_per_token)} cache write`,v.supports_tools?"tools":"no tools",v.supports_reasoning?"reasoning":"no reasoning",v.variant!=="standard"?v.variant:null].filter(Boolean).join(" · ")},Et=v=>{var Me;const U=qe.value.get(v);if(!U)return"Catalogue facts unavailable";const X=(((Me=Te.value)==null?void 0:Me.measured_cache)||[]).filter(ct=>ct.model===U.id),Ce=X.length?X.map(ct=>`${ct.upstream_provider}: ${ct.cached_percent}% cached`).join(" · "):"No measured cache evidence yet";return`${vt(U)} · ${Ce}${U.profile_conflict?" · operator profile conflicts with catalogue":""}`},hs=V(()=>nt.value.map(v=>typeof v=="string"?v:v.name).filter(Boolean)),Pt=async()=>{var U,X,Ce;const v=(Ce=(X=(U=d.value)==null?void 0:U.openai_compatible)==null?void 0:X.preset_catalogue)==null?void 0:Ce[be.value.preset];v&&(be.value.base_url=v.base_url),Mn.cancel(),await ho()},La=(v,U)=>{be.value.openrouter[v]=U.split(",").map(X=>X.trim()).filter(Boolean)},On=V(()=>Ae.value||[]),sc=V(()=>{const v=[...I,...hs.value.map(U=>`compat:${U}`),...On.value.map(U=>`ollama:${U.name}`)];for(const U of[Ze.value.model,...ss.value])U&&U!=="auto"&&!v.includes(U)&&v.unshift(U);return v}),Na=v=>v==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":v;async function ac({poll:v=!1}={}){try{const U=await j.get("/api/agents/model");if(v&&Je())return;Ze.value={...Ze.value,...U},l.agents=o(Ze.value)}catch{}}async function Qi(){if(!ms.value){Te.value=null,st.value="";return}Ye.value=!0;try{Te.value=await j.get("/api/openrouter/catalogue"),st.value=""}catch(v){st.value=v.message||"Failed to load OpenRouter catalogue"}finally{Ye.value=!1}}async function uo(){var v;try{(v=Ze.value.model)!=null&&v.startsWith("compat:")&&ms.value&&await Da(ae(Ze.value.model),we(Ze.value.model));const U=await j.put("/api/agents/model",{model:Ze.value.model||null});Ze.value={...Ze.value,...U},l.agents=o(Ze.value),Ue("Agent model policy saved")}catch(U){Ue(U.message||"Failed to save agent model policy","error")}}const Ln=()=>[...ra.value.length?ra.value:ss.value];async function nc(v,U){const X=Ln(),Ce=X.findIndex(We=>ts(We)===v);let Me=null;if(U.target.checked&&Ce<0&&X.push(pt.get(v)||v),!U.target.checked&&Ce>=0&&([Me]=X.splice(Ce,1)),!X.length){U.target.checked=!0,Ue("Keep one model selected. An empty list restores the provider default.","error");return}const ct=await Ma(X,"Agent Auto allowlist saved");ct&&U.target.checked&&pt.delete(v),ct&&!U.target.checked&&typeof Me=="object"&&pt.set(v,Me),ct||(U.target.checked=ss.value.includes(v))}async function Ma(v,U){if(Is.value)return!1;Is.value=!0;try{const X=await j.put("/api/agents/model",{auto_model_allowlist:v});return Ze.value={...Ze.value,...X},l.agents=o(Ze.value),Ue(U),!0}catch(X){return Ue(X.message||"Failed to save agent allowlist","error"),!1}finally{Is.value=!1}}const ic=()=>Ma([],"Provider default restored");async function lc(v,U,X){const Ce=ss.value.map(Me=>{const ct=B(Me);if(Me!==v)return ct||Me;const We=typeof ct=="string"?{model:Me}:{...ct||{model:Me}};return delete We.reasoning_effort,delete We.thinking_mode,X&&(We[U]=X),Object.keys(We).length===1?We.model:We});await Ma(Ce,"Model default saved")}async function Da(v,U=""){const[X,...Ce]=v.split("/");if(!X||!Ce.length)throw new Error("OpenRouter model id is not namespaced");return j.post(`/api/openrouter/models/${encodeURIComponent(X)}/${encodeURIComponent(Ce.join("/"))}/select`,{provider_tag:U})}const Xi=(v,U)=>{var Ce;const X=(((Ce=Te.value)==null?void 0:Ce.measured_cache)||[]).find(Me=>Me.model===v&&Me.upstream_provider===U);return X?`${X.cached_percent}% cached over ${X.samples} calls`:"no measured cache evidence"},el=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(4)}/M`,oi=(v,U)=>{if(v==null)return"n/a";if(typeof v=="number")return Number(v).toLocaleString();const X=v[U];return X==null?"n/a":Number(X).toLocaleString()},tl=v=>{var Me;const U=[];v.quantization==="fp4"&&U.push("fp4 quantization may change quality");const X=typeof v.latency_last_30m=="object"?Number((Me=v.latency_last_30m)==null?void 0:Me.p99):null,Ce=Number(Ze.value.iteration_timeout_seconds||0)*1e3;return X&&Ce&&X>Ce&&U.push("p99 exceeds the agent iteration budget"),U.join("; ")};async function sl(v){var U;ba.value=v,Vt.value=((U=be.value.openrouter.model_pins)==null?void 0:U[v.id])||"",fs.value=!0;try{const[X,...Ce]=v.id.split("/"),Me=await j.get(`/api/openrouter/models/${encodeURIComponent(X)}/${encodeURIComponent(Ce.join("/"))}/endpoints`);zs.value=Me.endpoints||[]}catch(X){zs.value=[],Ue(X.message||"Failed to load OpenRouter provider routes","error")}finally{fs.value=!1}}function C(){ba.value=null,Vt.value="",zs.value=[]}async function q(v,U=""){try{await Da(v.id,U);const X=Ln(),Ce=`compat:${v.id}`;if(X.some(ct=>ts(ct)===Ce)||X.push(Ce),!await Ma(X,U?"OpenRouter model added and provider pinned.":"OpenRouter model added unpinned."))return;C(),await ua()}catch(X){Ue(X.message||"Failed to add OpenRouter model","error")}}const ae=v=>v.startsWith("compat:")?v.slice(7):v,we=v=>{var U;return((U=be.value.openrouter.model_pins)==null?void 0:U[ae(v)])||""},Qe=v=>ss.value.length>1&&Ma(Ln().filter(U=>ts(U)!==v),"Model removed from allowlist");async function kt(){var v,U;try{const X=Ln();for(const Ce of((v=Te.value)==null?void 0:v.quick_add)||[])(U=qe.value.get(Ce))!=null&&U.agent_eligible&&(await Da(ae(Ce),""),X.some(Me=>ts(Me)===Ce)||X.push(Ce));await Ma(X,"Curated OpenRouter models added"),await ua()}catch(X){Ue(X.message||"Failed to add curated OpenRouter models","error")}}function Os(v){const U=v.hint_metadata||{},X=[];return U.context_tokens&&X.push(`context ${Number(U.context_tokens).toLocaleString()}`),U.max_output_tokens&&X.push(`max output ${Number(U.max_output_tokens).toLocaleString()}`),U.structural_source&&X.push(`source ${U.structural_source}`),X.join("; ")}async function Xs(v,U){const X={...Ze.value.model_selection_hints||{}},Ce=U.trim();Ce?X[v]=Ce:delete X[v];try{const Me=await j.put("/api/agents/model",{model_selection_hints:X});Ze.value={...Ze.value,...Me},l.agents=o(Ze.value),Ue("Model hint saved")}catch(Me){Ue(Me.message||"Failed to save model hint","error")}}function Pa(v,U){const X=ss.value.indexOf(v);return!Is.value&&X>=0&&X+U>=0&&X+U<ss.value.length}async function $a(v,U){const X=Ln(),Ce=X.findIndex(Me=>ts(Me)===v);Ce<0||!Pa(v,U)||([X[Ce],X[Ce+U]]=[X[Ce+U],X[Ce]],await Ma(X,"Agent Auto allowlist order saved"))}const oc=f(!0),rc=f(""),ju=f({configured:null,accounts:[]}),cc=f(null),po=f(null),dc=f(""),al=f(null),uc=f(!1),pc=f(null),Vu=f(null),qu=f("");let ri=null;function Ue(v,U="success"){Ee(v,U==="error"?"error":"success")}function Gg(v){if(!v)return"?";const U=v/(1024*1024*1024);return U>=1?U.toFixed(1)+" GB":(v/(1024*1024)).toFixed(0)+" MB"}function Wg(v){return Number.isFinite(Number(v))?Number(v).toLocaleString():"—"}function Kg(v){return v==null?"automatic (model-derived)":Number(v).toLocaleString()+" characters"}function Jg(v){const U=new Date(v);return Number.isNaN(U.getTime())?"unknown":U.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Zg(v){return typeof v=="string"&&v.length>12?v.slice(0,8)+"…"+v.slice(-4):v}function Yg(v){return typeof v!="number"||!Number.isFinite(v)?"—":(v/1e3).toFixed(2)}function Qg(v){return v==="temporary learned clamp"?"is-clamp":v==="override"?"is-override":"is-built-in"}function Xg(v){const U=_.value.context_budget_overrides[v.model];return v.floor!=null&&Number.isFinite(Number(U))&&Number(U)>v.floor}function eb(v,U){const X={..._.value.context_budget_overrides};U.target.value===""?delete X[v]:X[v]=Number(U.target.value),_.value.context_budget_overrides=X,H.value=!0}function tb(v){_.value.context_utilization=v.target.value===""?"":Number(v.target.value),H.value=!0}function sb(v){const U={..._.value.context_budget_overrides};delete U[v],_.value.context_budget_overrides=U,H.value=!0}async function ua({quiet:v=!1,poll:U=!1}={}){if(!(U&&Je())){if(i)return i;v||(e.value=!0),i=(async()=>{await Promise.all([Hs({poll:U}),fo(),mo(),ac({poll:U}),ya(),ci({poll:U})]),await Qi(),Je()||ee()})();try{await i}finally{i=null,v||(e.value=!1)}}}async function Hs({preserveBasic:v=!1,preserveAdvanced:U=!1,poll:X=!1}={}){var Ce,Me,ct;try{const We=await j.get("/api/llm/status"),Ne=X&&Je();d.value=We,u.value=!1,Ne||(p.value.main=We.main_model||We.active_model||(We.active_provider==="compat"?`compat:${((Ce=We.openai_compatible)==null?void 0:Ce.model)||""}`:We.active_provider==="ollama"?`ollama:${((Me=We.ollama)==null?void 0:Me.model)||""}`:((ct=We.codex)==null?void 0:ct.model)||"gpt-5.6-sol")),!Ne&&We.codex&&!di.pending()&&(v||(_.value.enabled=We.codex.enabled,_.value.model=We.codex.model||"gpt-5.6-sol",_.value.reasoning_effort=We.codex.reasoning_effort||"medium",_.value.agent_reasoning_effort=We.codex.agent_reasoning_effort||""),U||(_.value.request_timeout_seconds=We.codex.request_timeout_seconds??_.value.request_timeout_seconds,_.value.stream_stall_timeout_seconds=We.codex.stream_stall_timeout_seconds??_.value.stream_stall_timeout_seconds,_.value.retry={..._.value.retry,...We.codex.retry||{}},_.value.connection_pool={..._.value.connection_pool,...We.codex.connection_pool||{}},_.value.context_compression={..._.value.context_compression,...We.codex.context_compression||{}},!H.value&&!De.value&&(_.value.context_budget_overrides={...We.codex.context_budget_overrides||{}},_.value.context_utilization=We.codex.context_utilization??_.value.context_utilization))),!Ne&&We.ollama&&!ui.pending()&&(v||(me.value.enabled=We.ollama.enabled,me.value.base_url=We.ollama.base_url||"",me.value.model=We.ollama.model||"",me.value.max_tokens=We.ollama.max_tokens||4096,me.value.num_ctx=We.ollama.num_ctx||32768),U||(me.value.timeout=We.ollama.timeout??me.value.timeout));const At=We.openai_compatible;!Ne&&At&&!Mn.pending()&&(v||(be.value.enabled=At.enabled,be.value.base_url=At.base_url||be.value.base_url,be.value.model=At.model||be.value.model,be.value.preset=At.preset||be.value.preset),U||(be.value.timeout=At.timeout??be.value.timeout,be.value.model_profiles=At.model_profiles||be.value.model_profiles,be.value.context_utilization=At.context_utilization??be.value.context_utilization,be.value.openrouter={...be.value.openrouter,...At.openrouter||{}})),!Ne&&We.auxiliary&&(ke.value=We.auxiliary,Nn.pending()||(xe.value.enabled=We.auxiliary.enabled,xe.value.model=We.auxiliary.model||"gpt-5.6-luna"))}catch{d.value||(d.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),u.value=!0}}async function ci({poll:v=!1}={}){const U=++te;F.value=!0,Z.value="";try{const X=await j.get("/api/context/windows");if(U!==te)return;de.value=X,!(v&&Je())&&!De.value&&!H.value&&(_.value.context_budget_overrides=Object.fromEntries(Object.entries(X.models||{}).filter(([,Ce])=>Ce.override!=null).map(([Ce,Me])=>[Ce,Me.override])),_.value.context_utilization=X.utilization??_.value.context_utilization)}catch(X){U===te&&(Z.value=X.message||"Failed to load context budgets")}finally{U===te&&(F.value=!1)}}async function fo(){try{if(Se.value=await j.get("/api/ollama/status"),Re.value=!1,Se.value.model&&(ne.value=Se.value.model),Se.value.configured)try{const v=await j.get("/api/ollama/models");Ae.value=v.models||[]}catch{Ae.value=[]}else if(me.value.base_url)try{const v=await j.post("/api/ollama/probe-models",{base_url:me.value.base_url});Ae.value=v.models||[]}catch{Ae.value=[]}}catch{Re.value=!0}}async function ya(){oc.value=!0,rc.value="";try{ju.value=await j.get("/api/codex/status")}catch(v){rc.value=v.message||"Failed to fetch Codex status"}finally{oc.value=!1}}async function ab(){try{p.value.main.startsWith("compat:")&&ms.value&&await Da(ae(p.value.main),we(p.value.main));try{await j.put("/api/llm/main-model",{model:p.value.main})}catch(v){if(!/404|not found/i.test(v.message||""))throw v;await j.post("/api/llm/switch",{model:p.value.main})}r("mainModel",p.value.main),Ue("Main model saved"),await ua()}catch(v){Ue(v.message||"Failed to save main model","error"),await Hs()}}async function nb(v){p.value.main_capability=v;const U=E.value;U&&(U.capability==="reasoning"?(_.value.reasoning_effort=v,await nl()):U.capability==="thinking"&&(await j.put("/api/openai-compatible/config",{thinking_mode:v}),Ue("Thinking mode saved")))}async function ib(v){p.value.agent_capability=v;const U=A.value,X=(U==null?void 0:U.capability)||M.value;if(X!=="none"){if(v===""||v==="auto"||X==="reasoning"||X==="mixed"){if(_.value.agent_reasoning_effort=v,X==="thinking"){const Ce=await j.put("/api/agents/model",{thinking_mode:null});Ze.value={...Ze.value,...Ce}}await nl()}else if(X==="thinking"){const Ce=await j.put("/api/agents/model",{thinking_mode:v});Ze.value={...Ze.value,...Ce},Ue("Agent thinking mode saved")}}}async function lb(){Le.value=!0;try{const v=await j.post("/api/ollama/reload");Ue(v.configured?"Ollama reloaded":v.reason||"Ollama not configured",v.configured?"success":"error"),await ua()}catch(v){Ue(v.message||"Reload failed","error")}finally{Le.value=!1}}async function ob(){$e.value=!0;try{await j.post("/api/ollama/model",{model:ne.value}),Ue("Model set to "+ne.value),await ua()}catch(v){Ue(v.message||"Failed","error")}finally{$e.value=!1}}async function rb(){const v=me.value.base_url;if(!v){Ue("Enter a base URL first","error");return}rt.value=!0;try{const U=await j.post("/api/ollama/probe-models",{base_url:v});Ae.value=U.models||[],Ae.value.length?(Ue(Ae.value.length+" model(s) found"),!me.value.model&&Ae.value.length&&(me.value.model=Ae.value[0].name)):Ue("No models found at "+v,"error")}catch(U){Ue(U.message||"Could not reach Ollama","error")}finally{rt.value=!1}}async function mo(){try{if(ot.value=await j.get("/api/openai-compatible/status"),Yt.value=!1,ot.value.model&&(Dt.value=ot.value.model),ot.value.configured)try{const v=await j.get("/api/openai-compatible/models");nt.value=v.models||[]}catch{nt.value=[]}}catch{Yt.value=!0}}async function cb(){ps.value=!0;try{const v=await j.post("/api/openai-compatible/reload");Ue(v.configured?"OpenAI-compatible reloaded":v.reason||"OpenAI-compatible not configured",v.configured?"success":"error"),await ua()}catch(v){Ue(v.message||"Reload failed","error")}finally{ps.value=!1}}async function db(){Zs.value=!0;try{await j.post("/api/openai-compatible/model",{model:Dt.value}),Ue("Model set to "+Dt.value),await ua()}catch(v){Ue(v.message||"Failed","error")}finally{Zs.value=!1}}async function nl(){if(De.value){di();return}De.value=!0;const v=Mo(_.value);try{await j.put("/api/llm/codex/config",v),r("codexBasic",v),Ue("Codex config saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),ya()])}catch(U){Ue(U.message||"Failed","error");const X=JSON.stringify(Mo(_.value))!==JSON.stringify(v);await Promise.all([Hs({preserveBasic:X,preserveAdvanced:!0}),ya()])}finally{De.value=!1}}async function Gu(){if(De.value)return;De.value=!0;const v=Do(_.value);try{await j.put("/api/llm/codex/config",v),r("codexAdvanced",v),JSON.stringify({context_budget_overrides:_.value.context_budget_overrides,context_utilization:_.value.context_utilization})===JSON.stringify({context_budget_overrides:v.context_budget_overrides,context_utilization:v.context_utilization})&&(H.value=!1),Ue("Codex advanced settings saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),ya(),ci()])}catch(U){Ue(U.message||"Failed","error");const X=JSON.stringify(Do(_.value))!==JSON.stringify(v);await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:X}),ya(),ci()])}finally{De.value=!1}}async function fc(){if(Be.value){ui();return}Be.value=!0;try{const v=Pe.value?me.value.api_key:null,U=Po(me.value,{includeApiKey:v!==null});await j.put("/api/llm/ollama/config",U),Ue("Ollama config saved"),v!==null&&me.value.api_key===v&&(me.value.api_key="",Pe.value=!1),r("ollamaBasic",Po(me.value)),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),fo()])}catch(v){Ue(v.message||"Failed","error")}finally{Be.value=!1}}async function Wu(){if(!Be.value){Be.value=!0;try{const v=$c(me.value);await j.put("/api/llm/ollama/config",v),r("ollamaAdvanced",v),Ue("Ollama timeout saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),fo()])}catch(v){Ue(v.message||"Failed","error")}finally{Be.value=!1}}}async function ho(){if(Ve.value){Mn();return}Ve.value=!0;try{const v=Ge.value?be.value.api_key:null,U=No(be.value,{includeApiKey:v!==null});await j.put("/api/openai-compatible/config",U),Ue("OpenAI-compatible config saved"),v!==null&&be.value.api_key===v&&(be.value.api_key="",Ge.value=!1),r("compatibleBasic",No(be.value)),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),mo()]),await Qi()}catch(v){Ue(v.message||"Failed","error")}finally{Ve.value=!1}}async function Ku(){if(!Ve.value){Ve.value=!0;try{const v=Pc(be.value);await j.put("/api/openai-compatible/config",v),r("compatibleAdvanced",v),Ue("OpenAI-compatible endpoint settings saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),mo()]),await Qi()}catch(v){Ue(v.message||"Failed","error")}finally{Ve.value=!1}}}async function ub(){if(P.value){Nn();return}P.value=!0;try{const v={...xe.value};await j.put("/api/llm/auxiliary/config",v),r("auxiliary",v),Ue("Auxiliary config saved"),await Hs()}catch(v){Ue(v.message||"Failed","error"),await Hs()}finally{P.value=!1}}const di=$o(nl),Nn=$o(ub),ui=$o(fc),Mn=$o(ho),pb=()=>(di.cancel(),nl()),fb=()=>(ui.cancel(),fc()),mb=()=>(Mn.cancel(),ho()),hb=()=>Gu(),vb=()=>Wu(),gb=()=>Ku();async function bb(v){const U=v.account_key+":"+v.model;ue.value=U;try{const X=await j.post("/api/context/windows/clear",{account_key:v.account_key,model:v.model});Ue(X.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await ci()}catch(X){Ue(X.message||"Failed to clear clamp","error"),await ci()}finally{ue.value=null}}async function yb(v){try{await j.post("/api/codex/account/"+v+"/activate"),Ue("Active account switched"),await ya()}catch(U){Ue(U.message||"Failed","error")}}async function xb(v){cc.value=v;try{await j.post("/api/codex/account/"+v+"/refresh"),Ue("Token refreshed"),await ya()}catch(U){Ue(U.message||"Refresh failed","error")}finally{cc.value=null}}function _b(v,U){po.value=v,dc.value=U||""}async function wb(v){try{await j.put("/api/codex/account/"+v+"/label",{label:dc.value}),Ue("Label updated"),po.value=null,await ya()}catch(U){Ue(U.message||"Failed","error")}}async function kb(v,U){if(await is({title:"Delete Codex account",message:`Delete ${U||"account #"+(v+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/codex/account/"+v),Ue("Deleted. Pool reloaded."),await ya()}catch(Ce){Ue(Ce.message||"Failed","error")}}async function Sb(){uc.value=!0;try{const v=await j.post("/api/codex/device-code");pc.value=v,al.value="pending",Cb(v)}catch(v){Ue(v.message||"Failed","error")}finally{uc.value=!1}}async function Cb(v){ri={cancelled:!1};const U=ri;try{const X=await j.post("/api/codex/device-poll",{device_auth_id:v.device_auth_id,user_code:v.user_code,interval:v.interval});if(U.cancelled)return;Vu.value=X,al.value="success",await ua()}catch(X){if(U.cancelled)return;qu.value=X.message||"Device login failed",al.value="error"}}function Tb(){ri&&(ri.cancelled=!0),al.value=null,pc.value=null}function Ju(){n||(n=!0,ua(),a=window.setInterval(()=>ua({quiet:!0,poll:!0}),s))}function Zu(){n&&(n=!1,a!==null&&window.clearInterval(a),a=null)}return tt(Ju),ls(Ju),Jt(Zu),_t(()=>{Zu(),ri&&(ri.cancelled=!0),di.cancel(),Nn.cancel(),ui.cancel(),Mn.cancel()}),{pageRoot:t,allowlistModalOpen:Oa,closeAllowlistModal:Qs,allowlistSaving:Is,effectiveAllowlist:ss,allowlistSummary:ca,resetAgentAllowlist:ic,selectedUnavailableReason:cn,selectedModelFacts:oe,loading:e,llmStatus:d,llmStatusLoadFailed:u,modelSelection:p,modelSelectorSearch:m,reasoningEfforts:h,neutralReasoningLevels:b,modelCatalog:x,modelGroups:g,selectedMainModel:E,selectedAgentModel:A,selectedAgentCapabilityValue:D,agentCapabilityKind:M,agentCapabilityEfforts:L,autoAllowlistModels:$,allowlistModel:k,allowlistModelEfforts:O,allowlistEntryCapabilityValue:T,modelOptionLabel:le,agentModelAvailable:y,agentModelOptionLabel:w,advancedOpen:G,codexForm:_,codexModelOptions:re,codexAgentModelOptions:z,mainEffortAllowed:ve,agentEffortAllowed:fe,mainModelOptionDisabled:pe,agentModelOptionDisabled:ge,auxForm:xe,auxData:ke,auxModelOptions:He,onAuxModelChange:R,savingAux:P,saveAuxConfigDebounced:Nn,ollamaForm:me,compatibleForm:be,savingCodex:De,savingOllama:Be,savingCompatible:Ve,probingOllama:rt,ollamaKeyDirty:Pe,compatibleKeyDirty:Ge,fetchCodexStatus:ya,ollamaStatus:Se,ollamaStatusLoadFailed:Re,ollamaModels:Ae,ollamaSelectedModel:ne,reloading:Le,settingModel:$e,compatibleStatus:ot,compatibleStatusLoadFailed:Yt,compatibleModels:nt,visibleCompatibleModels:Mt,compatibleSelectedModel:Dt,reloadingCompatible:ps,settingCompatibleModel:Zs,applyCompatiblePreset:Pt,setOpenRouterList:La,agentsConfig:Ze,compatibleAgentModels:hs,ollamaAgentModels:On,knownAgentModelRefs:sc,agentModelLabel:Na,saveAgentsModel:uo,toggleAgentAutoAllowlist:nc,saveAllowlistEntryCapability:lc,autoAllowlistGroups:S,structuralFacts:Os,saveModelHint:Xs,canMoveAllowlist:Pa,moveAgentAutoAllowlist:$a,openRouterCatalogue:Te,openRouterCatalogueLoading:Ye,openRouterCatalogueError:st,openRouterRecognized:ms,compatibleCatalogueStatus:pn,compatibleCatalogueStatusClass:In,openRouterSearch:ht,openRouterVendor:ga,openRouterVendors:Ie,openRouterToolsOnly:Bs,openRouterEligibleOnly:ii,openRouterStandardOnly:En,openRouterMeasuredCacheOnly:dn,openRouterMaxPromptPrice:un,openRouterQuantization:da,openRouterQuantizations:N,openRouterResults:Fe,openRouterMatchCount:je,openRouterInlineFacts:vt,openRouterSelectedFacts:Et,prepareOpenRouterModel:sl,addOpenRouterModel:q,removeOpenRouterModel:Qe,quickAddOpenRouter:kt,openRouterModelMap:qe,openRouterPin:we,openRouterPendingModel:ba,openRouterPendingTag:Vt,openRouterPendingEndpoints:zs,openRouterPendingLoading:fs,openRouterEndpointSort:An,openRouterSortedPendingEndpoints:Yi,openRouterEndpointCacheFact:Xi,openRouterRate:el,openRouterMetric:oi,openRouterRouteWarning:tl,cancelOpenRouterPending:C,codexLoading:oc,codexError:rc,codexData:ju,refreshing:cc,editingLabel:po,labelValue:dc,contextWindows:de,contextWindowsLoading:F,contextWindowsError:Z,contextBudgetRows:se,activeClampRows:ye,activeContextBudget:he,clearingClamp:ue,contextPolicyDirty:H,deviceState:al,deviceLoading:uc,deviceInfo:pc,deviceResult:Vu,deviceError:qu,fetchAll:ua,fetchLLMStatus:Hs,fetchOllamaStatus:fo,fetchCompatibleStatus:mo,saveMainModel:ab,saveMainCapability:nb,saveAgentCapability:ib,reloadOllama:lb,setOllamaModel:ob,reloadCompatible:cb,setCompatibleModel:db,probeOllamaModels:rb,saveCodexConfig:nl,saveOllamaConfig:fc,saveCompatibleConfig:ho,saveCodexAdvancedConfig:Gu,saveOllamaAdvancedConfig:Wu,saveCompatibleAdvancedConfig:Ku,saveCodexConfigDebounced:di,saveOllamaConfigDebounced:ui,saveCompatibleConfigDebounced:Mn,saveCodexConfigNow:pb,saveOllamaConfigNow:fb,saveCompatibleConfigNow:mb,saveCodexAdvancedConfigNow:hb,saveOllamaAdvancedConfigNow:vb,saveCompatibleAdvancedConfigNow:gb,activateAccount:yb,refreshAccount:xb,startEditLabel:_b,saveLabel:wb,deleteAccount:kb,startDeviceLogin:Sb,cancelDeviceLogin:Tb,formatSize:Gg,fetchContextWindows:ci,clearContextClamp:bb,setContextOverride:eb,setContextUtilization:tb,resetContextOverride:sb,overrideAboveFloor:Xg,formatCount:Wg,formatContextCeiling:Kg,formatExpiry:Jg,shortAccountKey:Zg,provenanceClass:Qg,formatDensity:Yg}}},$f={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function _C(e){return $f[e]||$f[(e||"").toLowerCase()]||"text-gray-400"}const wC={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=V(()=>{var S;return Object.values(((S=i.value)==null?void 0:S.totals)||{}).reduce((E,A)=>E+Number(A||0),0)}),u=f(""),p=f(0),m=f([]),h=V(()=>m.value.map(S=>`${S.label} (${S.path}${S.reason?`: ${S.reason}`:""})`).join("; ")),b=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let _=null;async function I(){var O;const S=await Promise.allSettled(b.map(B=>j.get(B.path))),E=B=>S[B].status==="fulfilled"?S[B].value:null;t.value=E(0)||{};const A=E(1);s.value=Array.isArray(A)?A:A&&A.subsystems||[],a.value=E(2)||{},n.value=E(3)||{},i.value=E(4),l.value=E(5),o.value=E(6),r.value=E(7),c.value=E(8);const k=S.filter(B=>B.status==="rejected");if(m.value=S.flatMap((B,T)=>{var $;return B.status==="rejected"?[{...b[T],reason:(($=B.reason)==null?void 0:$.message)||"request failed"}]:[]}),p.value=m.value.length,k.length===S.length){const B=(O=k[0])==null?void 0:O.reason;u.value=(B==null?void 0:B.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",I()}let g=!1;function y(){g||(g=!0,I(),_||(_=setInterval(I,3e4)))}function w(){g&&(g=!1,_&&(clearInterval(_),_=null))}return tt(y),ls(y),Jt(w),_t(w),{loading:e,error:u,failedCount:p,failedEndpoints:m,failedEndpointSummary:h,endpoints:b,retry:x,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:_C,formatAgeSeconds:VS}}},kC=1e4,Ff=3e4;function pl(e,t){return Math.max(0,e-t)}function Fc(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const SC=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],CC={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,m=0;async function h(){const L=++p;a.value=!0;try{const D=await j.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=D.availability,e.value=D.availability==="available"?D.data:null,s.value=null,n.value=Date.now()}catch(D){if(L!==p)return;s.value=D.message||"Turn-state read failed",D.status===503&&(t.value="unavailable")}L===p&&(a.value=!1)}async function b(){const L=++m;r.value=!0;try{const D=await j.get("/api/turn-state/capacity-breakers");if(L!==m)return;l.value=D.availability,i.value=D.availability==="available"?D.data:null,o.value=null,c.value=Date.now()}catch(D){if(L!==m)return;o.value=D.message||"Breaker read failed",D.status===503&&(l.value="unavailable")}L===m&&(r.value=!1)}function _(){h(),b()}const I=V(()=>e.value!==null&&pl(d.value,n.value)>Ff),x=V(()=>i.value!==null&&pl(d.value,c.value)>Ff),g=V(()=>I.value||x.value),y=V(()=>Math.round(pl(d.value,n.value)/1e3)),w=V(()=>Math.round(pl(d.value,c.value)/1e3));function S(L){return Fc(L,d.value/1e3)}function E(L){return SC[S(L)]}const A=V(()=>{var le;const L=[...((le=e.value)==null?void 0:le.turns)||[]],D=d.value/1e3;return L.sort((re,z)=>Fc(re,D)-Fc(z,D)||(z.last_progress_at||0)-(re.last_progress_at||0))});function k(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function O(L){if(L.state==="closed")return"—";const D=pl(d.value,c.value)/1e3,le=Math.max(0,(L.cooldown_remaining_seconds||0)-D);return le>0?`${Math.ceil(le)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function B(L){if(!L)return"";const D=Math.max(0,Math.round(d.value/1e3-L));if(D<90)return`${D}s ago`;const le=Math.round(D/60);return le<90?`${le}m ago`:`${Math.round(le/60)}h ago`}let T=null,$=null,Q=!1;function W(){Q||(Q=!0,_(),T=setInterval(_,kC),u=setInterval(()=>{d.value=Date.now()},1e3),$=ut.onReconnected(_))}function M(){Q&&(Q=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),$&&($(),$=null))}return tt(W),ls(W),Jt(M),_t(M),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:I,breakersStale:x,anyStale:g,turnsAgeSeconds:y,breakersAgeSeconds:w,sortedTurns:A,priorityOf:S,priorityBadge:E,breakerBadge:k,cooldownLabel:O,ageLabel:B,fetchTurns:h,fetchBreakers:b,refreshAll:_,arm:W,disarm:M}}},TC={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await j.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await is({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await j.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return tt(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Uf=e=>JSON.parse(JSON.stringify(e)),EC=(e,t)=>JSON.stringify(e)===JSON.stringify(t),AC={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,m=0,h=null;const b=(M,L)=>p&&m===M&&j.token===L,_=M=>"computer-provisioning-"+M.key,I=M=>M===null?"Unset":M===""?"Empty":JSON.stringify(M),x=M=>{const L=n.value[M.key];return M.type==="array"?String(L||"").split(/\r?\n/).map(D=>D.trim()).filter(Boolean):["integer","number"].includes(M.type)?L===""||L==null?null:Number(L):L},g=V(()=>s.value.map(M=>({...M,value:x(M)})).filter(M=>!EC(M.value,a.value[M.key]))),y=V(()=>s.value.filter(M=>M.pending_restart).map(M=>M.label)),w=V(()=>s.value.some(M=>M.apply_state==="unknown")),S=V(()=>{const M={};for(const L of s.value){const D=x(L),le=L.constraints||{};["integer","number"].includes(L.type)&&(D===null&&!L.nullable?M[L.key]="A number is required.":D!==null&&(!Number.isFinite(D)||L.type==="integer"&&!Number.isInteger(D)||le.minimum!=null&&D<le.minimum||le.maximum!=null&&D>le.maximum)&&(M[L.key]="Enter a number within the allowed range.")),L.key==="monitor_names"&&(D.length>16||new Set(D).size!==D.length||D.some(re=>!/^[A-Za-z0-9_.-]{1,64}$/.test(re)))&&(M[L.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return M}),E=V(()=>Object.keys(S.value).length>0);function A(M,L){n.value[M.key]=L,u.value=""}function k(){n.value=Object.fromEntries(s.value.map(M=>[M.key,M.type==="array"?a.value[M.key].join(`
`):a.value[M.key]])),r.value=!1}async function O(M,L){const[D,le]=await Promise.all([j.get("/api/config"),j.get("/api/config/meta")]);if(!b(M,L))return!1;const re=(le.fields||[]).filter(z=>/^computer\.[^.]+$/.test(z.path)&&z.path!=="computer.enabled"&&z.sensitivity==="public"&&z.apply_mode==="restart");if(!D.computer||!re.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=re.map(z=>({...z,key:z.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(z=>[z.key,Uf(D.computer[z.key])])),k(),h=L,i.value=!0,c.value=!1,!0}async function B(){if(!p||l.value||o.value)return;const M=++m,L=j.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await O(M,L)}catch(D){b(M,L)&&(c.value=!0,d.value=D.message||"Could not load provisioning. No changes were sent.")}finally{b(M,L)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!E.value&&(r.value=!0)}async function $(){if(!p||!i.value||!r.value||o.value||l.value||c.value||E.value||!g.value.length)return;if(h!==j.token){W(),Q();return}const M={computer:Object.fromEntries(g.value.map(re=>[re.key,Uf(re.value)]))},L=m,D=j.token;o.value=!0,d.value="",u.value="";let le=!1;try{if(await j.put("/api/config",M),le=!0,!b(L,D))return;await O(L,D)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(re){b(L,D)&&(c.value=!0,r.value=!1,d.value=le?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${re.status===400?": "+re.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{b(L,D)&&(o.value=!1)}}function Q(){p||(p=!0,B())}function W(){p=!1,m++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,h=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return tt(Q),ls(Q),Jt(W),_t(W),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:y,effectiveUnknown:w,changes:g,validation:S,invalid:E,fieldId:_,format:I,edit:A,discard:k,load:B,openReview:T,save:$}}},RC={components:{ComputerProvisioning:AC},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),m=f(""),h=f(null),b=f(""),_=f(!1),I=f(Date.now()),x=f(""),g=f(null);let y=0,w=null,S=!1,E=j.token,A=0,k=null,O=null,B=!1;const T=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",$=V(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),Q=V(()=>{var te;const H=Date.parse(((te=e.value.accessibility)==null?void 0:te.checked_at)||"");return c.value&&Number.isFinite(H)&&I.value-H<15e3&&I.value>=H-5e3}),W=V(()=>{var H;return Q.value?T((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),M=V(()=>{var H;return Q.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),L=V(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,te])=>`${H}: ${te}`).join(", ")),D=V(()=>{var te;const H=(te=e.value.application_provenance)==null?void 0:te.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),le=V(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),re=V(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),z=V(()=>{var te,se;const H=Date.parse(((te=h.value)==null?void 0:te.captured_at)||"");return Number.isFinite(H)&&I.value<H+Math.min(1e4,((se=h.value)==null?void 0:se.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Y(){b.value&&URL.revokeObjectURL(b.value),b.value="",h.value=null}function ie(){y++,Y(),g.value=null,c.value=!1,k==null||k.abort(),k=null,t.value=!1,m.value="",s.value=!1,i.value=!1,l.value=!1}function J(H,te){return S&&H===y&&te===j.token}function ve(){return S&&c.value&&O===j.token&&Date.now()-u.value<15e3}function fe(H,te="mutation"){var ye,he;ie(),B=!0,p.value="";const se=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(se)?(u.value=0,O=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:se===503?"unavailable":"unknown"}),o.value=se===401||se===403||se===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":se===410?"Evidence or artifact expired. Observe or prepare the export again.":te==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":te==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",te==="mutation"&&![401,403,404].includes(se)&&typeof((ye=H.data)==null?void 0:ye.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((he=H.data)==null?void 0:he.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function K(){if(t.value||r.value||a.value||n.value||d.value||!S)return;const H=y,te=j.token;t.value=!0,A=Date.now();const se=new AbortController;k=se;try{const ye=await j.get("/api/computer",{signal:se.signal});if(!J(H,te))return;pe(ye)}catch(ye){J(H,te)&&fe(ye,"read")}finally{k===se&&(k=null,t.value=!1)}}function pe(H,te=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&ie(),e.value=H,u.value=Date.now(),O=j.token,c.value=!(r.value&&te!=="toggle")&&!(a.value&&te!=="stop")&&!(n.value&&te!=="pause")&&!(d.value&&te!=="recovery"),o.value="",p.value="",B=!c.value}async function ge(H){if(!ve()||r.value||a.value||n.value||d.value)return;ie();const te=y,se=j.token;r.value=!0;let ye=!1;try{if(await j.post("/api/computer/enabled",{enabled:H}),ye=!0,!J(te,se))return;const he=await j.get("/api/computer");J(te,se)&&pe(he,"toggle")}catch(he){J(te,se)&&fe(he,ye?"acknowledged":"mutation")}finally{r.value=!1}}async function xe(H){if(!S||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;ie();const te=y,se=j.token,ye=H==="stop"?a:n;ye.value=!0;let he=!1;try{if(await j.post("/api/computer/"+H,{}),he=!0,J(te,se)){const me=await j.get("/api/computer");J(te,se)&&pe(me,H)}}catch(me){J(te,se)&&fe(me,he?"acknowledged":"mutation")}finally{ye.value=!1}}async function ke(){var ye;if(!ve()||d.value||((ye=e.value.backend)==null?void 0:ye.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;ie();const te=y,se=j.token;d.value=!0;try{const he=await j.post("/api/computer/release_owned_input",H);J(te,se)&&pe(he,"recovery")}catch(he){J(te,se)&&fe(he,"mutation")}finally{d.value=!1}}async function He(){return P(!1)}async function R(){return P(!0)}async function P(H){var be;if(!ve()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const te={session_id:e.value.session_id,generation:e.value.session_generation};if(!te.session_id||!Number.isInteger(te.generation))return;if(H){if(m.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+te.session_id)return;te.acknowledgment=m.value}const se=H?((be=e.value.recovery)==null?void 0:be.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";ie();const ye=y,he=j.token;d.value=!0;let me=!1;try{const Pe=await j.post("/api/computer/"+se,te);me=!0,J(ye,he)&&pe(Pe,"recovery")}catch(Pe){J(ye,he)&&fe(Pe,me?"acknowledged":"mutation")}finally{d.value=!1}}async function G(){var se;if(!ve()||s.value||!e.value.available)return;Y(),_.value=!1;const H=y,te=j.token;s.value=!0;try{const ye=await j.post("/api/computer/observe",{});if(!J(H,te))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((se=ye.frame)==null?void 0:se.evidence_id)||""))throw new Error("Invalid evidence");const he=await j.getBlob("/api/computer/evidence/"+ye.frame.evidence_id);if(!J(H,te))return;if(!["image/png","image/jpeg"].includes(he.type)||he.size>2097152||!Number.isFinite(Date.parse(ye.frame.expires_at))||Date.parse(ye.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");h.value=ye.frame,b.value=URL.createObjectURL(he),o.value=""}catch(ye){J(H,te)&&fe(ye)}finally{H===y&&(s.value=!1)}}async function de(){if(!ve()||i.value||!e.value.available)return;g.value=null;const H=y,te=j.token;i.value=!0;try{const se=await j.post("/api/computer/export",{name:x.value});J(H,te)&&(g.value=se,o.value="")}catch(se){J(H,te)&&fe(se)}finally{H===y&&(i.value=!1)}}async function F(){if(!ve()||l.value||!g.value)return;const H=y,te=j.token,se=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((se==null?void 0:se.artifact_id)||""))throw new Error("Invalid export");const ye=await j.getBlob("/api/computer/download/"+se.artifact_id);if(!J(H,te))return;const he=URL.createObjectURL(ye),me=document.createElement("a");me.href=he,me.download=se.name,me.click(),setTimeout(()=>URL.revokeObjectURL(he),1e3)}catch(ye){J(H,te)&&fe(ye)}finally{H===y&&(l.value=!1)}}function Z(){S||(E!==j.token&&(E=j.token,ie(),u.value=0,O=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),S=!0,K(),w=setInterval(()=>{I.value=Date.now(),E!==j.token&&(E=j.token,ie(),u.value=0,O=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&I.value-u.value>=15e3&&ie(),h.value&&Date.parse(h.value.expires_at)<=I.value&&(Y(),_.value=!0),g.value&&Date.parse(g.value.expires_at)<=I.value&&(g.value=null),!B&&I.value-A>=5e3&&K()},500))}function ue(){S=!1,clearInterval(w),w=null,ie(),c.value=!1}return tt(Z),ls(Z),Jt(ue),_t(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:h,frameUrl:b,frameExpired:_,freshness:z,name:x,artifact:g,refresh:K,control:xe,observe:G,clearFrame:Y,exportFile:de,download:F,toggling:r,adminReady:c,enabledLabel:T,restartSettings:re,setEnabled:ge,recovering:d,recover:He,reconcile:R,releaseOwnedInput:ke,reconciliationAck:m,applicationProfiles:le,attached:$,scriptIdentity:D,inputLimits:L,accessibilityLabel:W,accessibilityDetail:M}}},Ig=[{id:"health",label:"Health",component:F1},{id:"resources",label:"Resources",component:U1},{id:"logs",label:"Logs",component:Y1},{id:"config",label:"Config",component:cC},{id:"discord",label:"Discord",component:uC},{id:"hosts",label:"Hosts",component:mC},{id:"host-access",label:"Host Access",component:fC},{id:"api-tokens",label:"API Tokens",component:hC},{id:"llm",label:"LLM Config",component:xC},{id:"internals",label:"Internals",component:wC},{id:"turn-state",label:"Turn State",component:CC},{id:"computer",label:"Computer",component:RC},{id:"update",label:"Update",component:TC}],IC={components:{TabbedPage:Qr},setup(){return{tabs:Ig}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Fo=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),OC=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Fo("Operations","operations","/operations",xg),...Fo("History","history","/history",_g),...Fo("Capabilities","capabilities","/capabilities",wg),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Fo("System","system","/system",Ig)],Ds=Tn({open:!1,query:"",selected:0});function Bf(){Ds.query="",Ds.selected=0,Ds.open=!0}function Uc(){Ds.open=!1}function LC(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const NC={setup(){const e=pg(),t=f(null),s=V(()=>{const i=Ds.query.trim().toLowerCase();return OC.map(l=>({...l,_score:LC(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Kt(()=>Ds.open,async i=>{var l;i&&(await Ht(),(l=t.value)==null||l.focus())}),Kt(()=>Ds.query,()=>{Ds.selected=0});function a(i){Uc(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Uc();return}if(i.key==="ArrowDown")i.preventDefault(),Ds.selected=Math.min(Ds.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Ds.selected=Math.max(Ds.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Ds.selected];l&&a(l)}}return{state:Ds,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Uc}},template:`
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
  `},Td={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Td));const MC={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Fi("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Fi("path",{d:Td[e.name]||Td.info})])}},DC=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function zf(e){return[...e.querySelectorAll(DC)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const PC={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=zf(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||zf(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},$C={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const m=V(()=>{const re=e.value.uptime_seconds||0,z=Math.floor(re/86400),Y=Math.floor(re%86400/3600),ie=Math.floor(re%3600/60),J=[];return z>0&&J.push(`${z}d`),Y>0&&J.push(`${Y}h`),(J.length===0||z===0&&Y===0)&&J.push(`${ie}m`),J.join(" ")}),h=V(()=>{const re=e.value.uptime_seconds||0;return 125.66*(1-Math.min(re/86400,1))}),b=V(()=>{const re=e.value;return[{label:"Guilds",value:re.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:re.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:re.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${re.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:re.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:re.loop_count>0?"text-green-400":"",highlight:re.loop_count>0},{label:"Agents",value:re.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:re.agent_count>0?`${re.agent_count} total`:"",subColor:"text-gray-500",highlight:(re.agent_running??0)>0},{label:"Processes",value:re.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:re.process_count>0?`${re.process_count} total`:"",subColor:"text-gray-500",highlight:(re.process_running??0)>0},{label:"Schedules",value:re.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(re.schedule_failing>0?`${re.schedule_failing} failing`:"")+(re.schedule_failing>0&&re.schedule_paused>0?", ":"")+(re.schedule_paused>0?`${re.schedule_paused} paused`:"")||void 0,subColor:re.schedule_failing>0?"text-red-400":"text-yellow-400",color:re.schedule_failing>0?"text-red-400":"",highlight:re.schedule_failing>0},{label:"Users",value:re.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),_=V(()=>{const re=e.value,z=[];return z.push({label:"Bot",status:re.status==="online"?"ok":"warn",detail:re.status==="online"?"Online":"Starting"}),(re.schedule_failing||0)>0?z.push({label:"Schedules",status:"error",detail:`${re.schedule_failing} failing`}):(re.schedule_count||0)>0&&z.push({label:"Schedules",status:"ok",detail:`${re.schedule_count} configured`}),(re.loop_count||0)>0&&z.push({label:"Loops",status:"ok",detail:`${re.loop_count} active`}),(re.agent_running||0)>0&&z.push({label:"Agents",status:"ok",detail:`${re.agent_running} running`}),(re.process_running||0)>0&&z.push({label:"Processes",status:"ok",detail:`${re.process_running} running`}),z});async function I(){try{e.value=await j.get("/api/status"),s.value=null}catch(re){s.value=re.message}finally{t.value=!1}}let x=0,g=0,y=0,w=0;function S(re,z){const Y=new Set;return[...z,...re].filter(ie=>{const J=ie._hmac||JSON.stringify([ie.timestamp,ie.tool_name,ie.user_id,ie.result_summary,ie.error]);return Y.has(J)?!1:(Y.add(J),!0)})}async function E(){const re=++x,z=y;n.value=!0;try{const Y=await j.get("/api/audit?limit=10");if(re!==x)return;const ie=z===y?[]:a.value.filter(J=>(J._liveEpoch||0)>z);a.value=S(Y,ie).slice(0,10),c.value=ie.length}catch{}re===x&&(n.value=!1)}async function A(){const re=++g,z=w;l.value=!0;try{const Y=await j.get("/api/audit?error_only=1&limit=5");if(re!==g)return;const ie=z===w?[]:i.value.filter(J=>(J._liveErrorEpoch||0)>z);i.value=S(Y,ie).slice(0,5),o.value=!1}catch{if(re!==g)return;o.value=z===w||i.value.length===0}re===g&&(l.value=!1)}async function k(){try{const re=await j.get("/api/knowledge");d.value=(Array.isArray(re)?re:[]).reduce((z,Y)=>z+(Y.chunks||0),0)}catch{d.value=null}}async function O(){try{const re=await j.get("/api/agents");r.value=re.filter(z=>z.status==="running")}catch{}}async function B(){u.value={...u.value,reload:!0};try{await j.post("/api/reload"),Ee.success("Config reloaded")}catch(re){Ee.error(re.message)}u.value={...u.value,reload:!1}}async function T(){if(!await is({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const z=e.value.session_count;e.value={...e.value,session_count:0};try{const Y=await j.post("/api/sessions/clear-all");Ee.success(`Cleared ${Y.count} session${Y.count!==1?"s":""}`),await I()}catch(Y){e.value={...e.value,session_count:z},Ee.error(Y.message)}u.value={...u.value,clearSessions:!1}}async function $(){if(!await is({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const z=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Y=await j.post("/api/loops/stop-all");Ee.success(Y.result),await I()}catch(Y){e.value={...e.value,loop_count:z},Ee.error(Y.message)}u.value={...u.value,stopLoops:!1}}function Q(){t.value=!0,s.value=null,I(),E(),A(),O()}let W=null,M=null,L=null;function D(re){if(re.payload&&re.payload.tool_name){y+=1;const z={...re.payload,_isNew:!0,_key:++p,_liveEpoch:y};a.value.unshift(z),a.value.length>10&&a.value.pop(),c.value++,z.error&&(w+=1,z._liveErrorEpoch=w,o.value=!1,i.value.unshift(z),i.value.length>5&&i.value.pop()),setTimeout(()=>{z._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let le=null;return tt(async()=>{await Promise.all([I(),E(),A(),O(),k()]),W=setInterval(I,15e3),M=setInterval(O,1e4),ut.subscribe("events",D),le=ut.onReconnected(()=>{E(),A()})}),_t(()=>{W&&clearInterval(W),M&&clearInterval(M),clearTimeout(L),ut.unsubscribe("events",D),le&&(le(),le=null)}),{status:e,loading:t,error:s,uptime:m,uptimeRingOffset:h,stats:b,healthIndicators:_,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:E,fetchErrors:A,fetchStatus:I,onEvent:D,formatTime:jS,formatDuration:Wi,retry:Q,reloadConfig:B,clearSessions:T,stopAllLoops:$}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Hf(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function FC(e){if(Array.isArray(e))return e}function UC(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function BC(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function zC(e,t){return FC(e)||UC(e,t)||HC(e,t)||BC()}function HC(e,t){if(e){if(typeof e=="string")return Hf(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Hf(e,t):void 0}}const Og=Object.entries,jf=Object.setPrototypeOf,jC=Object.isFrozen,VC=Object.getPrototypeOf,qC=Object.getOwnPropertyDescriptor;let Rs=Object.freeze,oa=Object.seal,wi=Object.create,Lg=typeof Reflect<"u"&&Reflect,Ed=Lg.apply,Ad=Lg.construct;Rs||(Rs=function(t){return t});oa||(oa=function(t){return t});Ed||(Ed=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Ad||(Ad=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const za=Zt(Array.prototype.forEach),GC=Zt(Array.prototype.lastIndexOf),Vf=Zt(Array.prototype.pop),gi=Zt(Array.prototype.push),WC=Zt(Array.prototype.splice),Ss=Array.isArray,xl=Zt(String.prototype.toLowerCase),Bc=Zt(String.prototype.toString),qf=Zt(String.prototype.match),bi=Zt(String.prototype.replace),Gf=Zt(String.prototype.indexOf),KC=Zt(String.prototype.trim),JC=Zt(Number.prototype.toString),ZC=Zt(Boolean.prototype.toString),Wf=typeof BigInt>"u"?null:Zt(BigInt.prototype.toString),Kf=typeof Symbol>"u"?null:Zt(Symbol.prototype.toString),Ft=Zt(Object.prototype.hasOwnProperty),fl=Zt(Object.prototype.toString),os=Zt(RegExp.prototype.test),$n=YC(TypeError);function Zt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Ed(e,t,a)}}function YC(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Ad(e,s)}}function et(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:xl;if(jf&&jf(e,null),!Ss(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(jC(t)||(t[a]=i),n=i)}e[n]=!0}return e}function QC(e){for(let t=0;t<e.length;t++)Ft(e,t)||(e[t]=null);return e}function gs(e){const t=wi(null);for(const a of Og(e)){var s=zC(a,2);const n=s[0],i=s[1];Ft(e,n)&&(Ss(i)?t[n]=QC(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=gs(i):t[n]=i)}return t}function XC(e){switch(typeof e){case"string":return e;case"number":return JC(e);case"boolean":return ZC(e);case"bigint":return Wf?Wf(e):"0";case"symbol":return Kf?Kf(e):"Symbol()";case"undefined":return fl(e);case"function":case"object":{if(e===null)return fl(e);const t=e,s=wa(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:fl(a)}return fl(e)}default:return fl(e)}}function wa(e,t){for(;e!==null;){const a=qC(e,t);if(a){if(a.get)return Zt(a.get);if(typeof a.value=="function")return Zt(a.value)}e=VC(e)}function s(){return null}return s}function eT(e){try{return os(e,""),!0}catch{return!1}}const Jf=Rs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),zc=Rs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Hc=Rs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),tT=Rs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),jc=Rs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),sT=Rs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Zf=Rs(["#text"]),Yf=Rs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Vc=Rs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Qf=Rs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Uo=Rs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),aT=oa(/{{[\w\W]*|^[\w\W]*}}/g),nT=oa(/<%[\w\W]*|^[\w\W]*%>/g),iT=oa(/\${[\w\W]*/g),lT=oa(/^data-[\-\w.\u00B7-\uFFFF]+$/),oT=oa(/^aria-[\-\w]+$/),Xf=oa(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rT=oa(/^(?:\w+script|data):/i),cT=oa(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),dT=oa(/^html$/i),uT=oa(/^[a-z][.\w]*(-[.\w]+)+$/i),xa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},pT=function(){return typeof window>"u"?null:window},fT=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},em=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Ng(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:pT();const t=Ie=>Ng(Ie);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==xa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,m=wa(p,"cloneNode"),h=wa(p,"remove"),b=wa(p,"nextSibling"),_=wa(p,"childNodes"),I=wa(p,"parentNode"),x=wa(p,"shadowRoot"),g=wa(p,"attributes"),y=l&&l.prototype?wa(l.prototype,"nodeType"):null,w=l&&l.prototype?wa(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ie=s.createElement("template");Ie.content&&Ie.content.ownerDocument&&(s=Ie.content.ownerDocument)}let S,E="",A,k=!1,O=0;const B=function(){if(O>0)throw $n('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(N){B(),O++;try{return S.createHTML(N)}finally{O--}},$=function(N){B(),O++;try{return S.createScriptURL(N)}finally{O--}},Q=function(){return k||(A=fT(u,n),k=!0),A},W=s,M=W.implementation,L=W.createNodeIterator,D=W.createDocumentFragment,le=W.getElementsByTagName,re=a.importNode;let z=em();t.isSupported=typeof Og=="function"&&typeof I=="function"&&M&&M.createHTMLDocument!==void 0;const Y=aT,ie=nT,J=iT,ve=lT,fe=oT,K=rT,pe=cT,ge=uT;let xe=Xf,ke=null;const He=et({},[...Jf,...zc,...Hc,...jc,...Zf]);let R=null;const P=et({},[...Yf,...Vc,...Qf,...Uo]);let G=Object.seal(wi(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),de=null,F=null;const Z=Object.seal(wi(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,H=!0,te=!1,se=!0,ye=!1,he=!0,me=!1,be=!1,Pe=!1,Ge=!1,De=!1,Be=!1,Ve=!0,rt=!1;const Je="user-content-";let ee=!0,Se=!1,Re={},Ae=null;const ne=et({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Le=null;const $e=et({},["audio","video","img","source","image","track"]);let ot=null;const Yt=et({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),nt="http://www.w3.org/1998/Math/MathML",Mt="http://www.w3.org/2000/svg",Dt="http://www.w3.org/1999/xhtml";let ps=Dt,Zs=!1,Ze=null;const Oa=et({},[nt,Mt,Dt],Bc);let Is=et({},["mi","mo","mn","ms","mtext"]),ts=et({},["annotation-xml"]);const ra=et({},["title","style","font","a","script"]);let Ys=null;const ss=["application/xhtml+xml","text/html"],ca="text/html";let pt=null,Qs=null;const cn=s.createElement("form"),oe=function(N){return N instanceof RegExp||N instanceof Function},Te=function(){let N=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Qs&&Qs===N)return;(!N||typeof N!="object")&&(N={}),N=gs(N),Ys=ss.indexOf(N.PARSER_MEDIA_TYPE)===-1?ca:N.PARSER_MEDIA_TYPE,pt=Ys==="application/xhtml+xml"?Bc:xl,ke=Ft(N,"ALLOWED_TAGS")&&Ss(N.ALLOWED_TAGS)?et({},N.ALLOWED_TAGS,pt):He,R=Ft(N,"ALLOWED_ATTR")&&Ss(N.ALLOWED_ATTR)?et({},N.ALLOWED_ATTR,pt):P,Ze=Ft(N,"ALLOWED_NAMESPACES")&&Ss(N.ALLOWED_NAMESPACES)?et({},N.ALLOWED_NAMESPACES,Bc):Oa,ot=Ft(N,"ADD_URI_SAFE_ATTR")&&Ss(N.ADD_URI_SAFE_ATTR)?et(gs(Yt),N.ADD_URI_SAFE_ATTR,pt):Yt,Le=Ft(N,"ADD_DATA_URI_TAGS")&&Ss(N.ADD_DATA_URI_TAGS)?et(gs($e),N.ADD_DATA_URI_TAGS,pt):$e,Ae=Ft(N,"FORBID_CONTENTS")&&Ss(N.FORBID_CONTENTS)?et({},N.FORBID_CONTENTS,pt):ne,de=Ft(N,"FORBID_TAGS")&&Ss(N.FORBID_TAGS)?et({},N.FORBID_TAGS,pt):gs({}),F=Ft(N,"FORBID_ATTR")&&Ss(N.FORBID_ATTR)?et({},N.FORBID_ATTR,pt):gs({}),Re=Ft(N,"USE_PROFILES")?N.USE_PROFILES&&typeof N.USE_PROFILES=="object"?gs(N.USE_PROFILES):N.USE_PROFILES:!1,ue=N.ALLOW_ARIA_ATTR!==!1,H=N.ALLOW_DATA_ATTR!==!1,te=N.ALLOW_UNKNOWN_PROTOCOLS||!1,se=N.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ye=N.SAFE_FOR_TEMPLATES||!1,he=N.SAFE_FOR_XML!==!1,me=N.WHOLE_DOCUMENT||!1,Ge=N.RETURN_DOM||!1,De=N.RETURN_DOM_FRAGMENT||!1,Be=N.RETURN_TRUSTED_TYPE||!1,Pe=N.FORCE_BODY||!1,Ve=N.SANITIZE_DOM!==!1,rt=N.SANITIZE_NAMED_PROPS||!1,ee=N.KEEP_CONTENT!==!1,Se=N.IN_PLACE||!1,xe=eT(N.ALLOWED_URI_REGEXP)?N.ALLOWED_URI_REGEXP:Xf,ps=typeof N.NAMESPACE=="string"?N.NAMESPACE:Dt,Is=Ft(N,"MATHML_TEXT_INTEGRATION_POINTS")&&N.MATHML_TEXT_INTEGRATION_POINTS&&typeof N.MATHML_TEXT_INTEGRATION_POINTS=="object"?gs(N.MATHML_TEXT_INTEGRATION_POINTS):et({},["mi","mo","mn","ms","mtext"]),ts=Ft(N,"HTML_INTEGRATION_POINTS")&&N.HTML_INTEGRATION_POINTS&&typeof N.HTML_INTEGRATION_POINTS=="object"?gs(N.HTML_INTEGRATION_POINTS):et({},["annotation-xml"]);const ce=Ft(N,"CUSTOM_ELEMENT_HANDLING")&&N.CUSTOM_ELEMENT_HANDLING&&typeof N.CUSTOM_ELEMENT_HANDLING=="object"?gs(N.CUSTOM_ELEMENT_HANDLING):wi(null);if(G=wi(null),Ft(ce,"tagNameCheck")&&oe(ce.tagNameCheck)&&(G.tagNameCheck=ce.tagNameCheck),Ft(ce,"attributeNameCheck")&&oe(ce.attributeNameCheck)&&(G.attributeNameCheck=ce.attributeNameCheck),Ft(ce,"allowCustomizedBuiltInElements")&&typeof ce.allowCustomizedBuiltInElements=="boolean"&&(G.allowCustomizedBuiltInElements=ce.allowCustomizedBuiltInElements),ye&&(H=!1),De&&(Ge=!0),Re&&(ke=et({},Zf),R=wi(null),Re.html===!0&&(et(ke,Jf),et(R,Yf)),Re.svg===!0&&(et(ke,zc),et(R,Vc),et(R,Uo)),Re.svgFilters===!0&&(et(ke,Hc),et(R,Vc),et(R,Uo)),Re.mathMl===!0&&(et(ke,jc),et(R,Qf),et(R,Uo))),Z.tagCheck=null,Z.attributeCheck=null,Ft(N,"ADD_TAGS")&&(typeof N.ADD_TAGS=="function"?Z.tagCheck=N.ADD_TAGS:Ss(N.ADD_TAGS)&&(ke===He&&(ke=gs(ke)),et(ke,N.ADD_TAGS,pt))),Ft(N,"ADD_ATTR")&&(typeof N.ADD_ATTR=="function"?Z.attributeCheck=N.ADD_ATTR:Ss(N.ADD_ATTR)&&(R===P&&(R=gs(R)),et(R,N.ADD_ATTR,pt))),Ft(N,"ADD_URI_SAFE_ATTR")&&Ss(N.ADD_URI_SAFE_ATTR)&&et(ot,N.ADD_URI_SAFE_ATTR,pt),Ft(N,"FORBID_CONTENTS")&&Ss(N.FORBID_CONTENTS)&&(Ae===ne&&(Ae=gs(Ae)),et(Ae,N.FORBID_CONTENTS,pt)),Ft(N,"ADD_FORBID_CONTENTS")&&Ss(N.ADD_FORBID_CONTENTS)&&(Ae===ne&&(Ae=gs(Ae)),et(Ae,N.ADD_FORBID_CONTENTS,pt)),ee&&(ke["#text"]=!0),me&&et(ke,["html","head","body"]),ke.table&&(et(ke,["tbody"]),delete de.tbody),N.TRUSTED_TYPES_POLICY){if(typeof N.TRUSTED_TYPES_POLICY.createHTML!="function")throw $n('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof N.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw $n('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const _e=S;S=N.TRUSTED_TYPES_POLICY;try{E=T("")}catch(Fe){throw S=_e,Fe}}else N.TRUSTED_TYPES_POLICY===null?(S=void 0,E=""):(S===void 0&&(S=Q()),S&&typeof E=="string"&&(E=T("")));(z.uponSanitizeElement.length>0||z.uponSanitizeAttribute.length>0)&&ke===He&&(ke=gs(ke)),z.uponSanitizeAttribute.length>0&&R===P&&(R=gs(R)),Rs&&Rs(N),Qs=N},Ye=et({},[...zc,...Hc,...tT]),st=et({},[...jc,...sT]),Ct=function(N){let ce=I(N);(!ce||!ce.tagName)&&(ce={namespaceURI:ps,tagName:"template"});const _e=xl(N.tagName),Fe=xl(ce.tagName);return Ze[N.namespaceURI]?N.namespaceURI===Mt?ce.namespaceURI===Dt?_e==="svg":ce.namespaceURI===nt?_e==="svg"&&(Fe==="annotation-xml"||Is[Fe]):!!Ye[_e]:N.namespaceURI===nt?ce.namespaceURI===Dt?_e==="math":ce.namespaceURI===Mt?_e==="math"&&ts[Fe]:!!st[_e]:N.namespaceURI===Dt?ce.namespaceURI===Mt&&!ts[Fe]||ce.namespaceURI===nt&&!Is[Fe]?!1:!st[_e]&&(ra[_e]||!Ye[_e]):!!(Ys==="application/xhtml+xml"&&Ze[N.namespaceURI]):!1},ht=function(N){gi(t.removed,{element:N});try{I(N).removeChild(N)}catch{if(h(N),!I(N))throw $n("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ga=function(N){const ce=_?_(N):N.childNodes;if(ce){const Fe=[];za(ce,je=>{gi(Fe,je)}),za(Fe,je=>{try{h(je)}catch{}})}const _e=g?g(N):null;if(_e)for(let Fe=_e.length-1;Fe>=0;--Fe){const je=_e[Fe],qe=je&&je.name;if(typeof qe=="string")try{N.removeAttribute(qe)}catch{}}},Bs=function(N,ce){try{gi(t.removed,{attribute:ce.getAttributeNode(N),from:ce})}catch{gi(t.removed,{attribute:null,from:ce})}if(ce.removeAttribute(N),N==="is")if(Ge||De)try{ht(ce)}catch{}else try{ce.setAttribute(N,"")}catch{}},ii=function(N){const ce=g?g(N):N.attributes;if(ce)for(let _e=ce.length-1;_e>=0;--_e){const Fe=ce[_e],je=Fe&&Fe.name;if(!(typeof je!="string"||R[pt(je)]))try{N.removeAttribute(je)}catch{}}},En=function(N){const ce=[N];for(;ce.length>0;){const _e=ce.pop();(y?y(_e):_e.nodeType)===xa.element&&ii(_e);const je=_?_(_e):_e.childNodes;if(je)for(let qe=je.length-1;qe>=0;--qe)ce.push(je[qe])}},dn=function(N){let ce=null,_e=null;if(Pe)N="<remove></remove>"+N;else{const qe=qf(N,/^[\r\n\t ]+/);_e=qe&&qe[0]}Ys==="application/xhtml+xml"&&ps===Dt&&(N='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+N+"</body></html>");const Fe=S?T(N):N;if(ps===Dt)try{ce=new d().parseFromString(Fe,Ys)}catch{}if(!ce||!ce.documentElement){ce=M.createDocument(ps,"template",null);try{ce.documentElement.innerHTML=Zs?E:Fe}catch{}}const je=ce.body||ce.documentElement;return N&&_e&&je.insertBefore(s.createTextNode(_e),je.childNodes[0]||null),ps===Dt?le.call(ce,me?"html":"body")[0]:me?ce.documentElement:je},un=function(N){return L.call(N.ownerDocument||N,N,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},da=function(N){var ce,_e;N.normalize();const Fe=L.call(N.ownerDocument||N,N,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let je=Fe.nextNode();for(;je;){let Tt=je.data;za([Y,ie,J],vt=>{Tt=bi(Tt,vt," ")}),je.data=Tt,je=Fe.nextNode()}const qe=(ce=(_e=N.querySelectorAll)===null||_e===void 0?void 0:_e.call(N,"template"))!==null&&ce!==void 0?ce:[];za(Array.from(qe),Tt=>{Vt(Tt.content)&&da(Tt.content)})},ba=function(N){const ce=w?w(N):null;return typeof ce!="string"||pt(ce)!=="form"?!1:typeof N.nodeName!="string"||typeof N.textContent!="string"||typeof N.removeChild!="function"||N.attributes!==g(N)||typeof N.removeAttribute!="function"||typeof N.setAttribute!="function"||typeof N.namespaceURI!="string"||typeof N.insertBefore!="function"||typeof N.hasChildNodes!="function"||N.nodeType!==y(N)||N.childNodes!==_(N)},Vt=function(N){if(!y||typeof N!="object"||N===null)return!1;try{return y(N)===xa.documentFragment}catch{return!1}},zs=function(N){if(!y||typeof N!="object"||N===null)return!1;try{return typeof y(N)=="number"}catch{return!1}};function fs(Ie,N,ce){za(Ie,_e=>{_e.call(t,N,ce,Qs)})}const An=function(N){let ce=null;if(fs(z.beforeSanitizeElements,N,null),ba(N))return ht(N),!0;const _e=pt(w?w(N):N.nodeName);if(fs(z.uponSanitizeElement,N,{tagName:_e,allowedTags:ke}),he&&N.hasChildNodes()&&!zs(N.firstElementChild)&&os(/<[/\w!]/g,N.innerHTML)&&os(/<[/\w!]/g,N.textContent)||he&&N.namespaceURI===Dt&&_e==="style"&&zs(N.firstElementChild)||N.nodeType===xa.progressingInstruction||he&&N.nodeType===xa.comment&&os(/<[/\w]/g,N.data))return ht(N),!0;if(de[_e]||!(Z.tagCheck instanceof Function&&Z.tagCheck(_e))&&!ke[_e]){if(!de[_e]&&li(_e)&&(G.tagNameCheck instanceof RegExp&&os(G.tagNameCheck,_e)||G.tagNameCheck instanceof Function&&G.tagNameCheck(_e)))return!1;if(ee&&!Ae[_e]){const je=I(N),qe=_(N);if(qe&&je){const Tt=qe.length;for(let vt=Tt-1;vt>=0;--vt){const Et=Se?qe[vt]:m(qe[vt],!0);je.insertBefore(Et,b(N))}}}return ht(N),!0}return(y?y(N):N.nodeType)===xa.element&&!Ct(N)||(_e==="noscript"||_e==="noembed"||_e==="noframes")&&os(/<\/no(script|embed|frames)/i,N.innerHTML)?(ht(N),!0):(ye&&N.nodeType===xa.text&&(ce=N.textContent,za([Y,ie,J],je=>{ce=bi(ce,je," ")}),N.textContent!==ce&&(gi(t.removed,{element:N.cloneNode()}),N.textContent=ce)),fs(z.afterSanitizeElements,N,null),!1)},Rn=function(N,ce,_e){if(F[ce]||Ve&&(ce==="id"||ce==="name")&&(_e in s||_e in cn))return!1;const Fe=R[ce]||Z.attributeCheck instanceof Function&&Z.attributeCheck(ce,N);if(!(H&&!F[ce]&&os(ve,ce))){if(!(ue&&os(fe,ce))){if(!Fe||F[ce]){if(!(li(N)&&(G.tagNameCheck instanceof RegExp&&os(G.tagNameCheck,N)||G.tagNameCheck instanceof Function&&G.tagNameCheck(N))&&(G.attributeNameCheck instanceof RegExp&&os(G.attributeNameCheck,ce)||G.attributeNameCheck instanceof Function&&G.attributeNameCheck(ce,N))||ce==="is"&&G.allowCustomizedBuiltInElements&&(G.tagNameCheck instanceof RegExp&&os(G.tagNameCheck,_e)||G.tagNameCheck instanceof Function&&G.tagNameCheck(_e))))return!1}else if(!ot[ce]){if(!os(xe,bi(_e,pe,""))){if(!((ce==="src"||ce==="xlink:href"||ce==="href")&&N!=="script"&&Gf(_e,"data:")===0&&Le[N])){if(!(te&&!os(K,bi(_e,pe,"")))){if(_e)return!1}}}}}}return!0},Yi=et({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),li=function(N){return!Yi[xl(N)]&&os(ge,N)},ms=function(N){fs(z.beforeSanitizeAttributes,N,null);const ce=N.attributes;if(!ce||ba(N))return;const _e={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:R,forceKeepAttr:void 0};let Fe=ce.length;for(;Fe--;){const je=ce[Fe],qe=je.name,Tt=je.namespaceURI,vt=je.value,Et=pt(qe),hs=vt;let Pt=qe==="value"?hs:KC(hs);if(_e.attrName=Et,_e.attrValue=Pt,_e.keepAttr=!0,_e.forceKeepAttr=void 0,fs(z.uponSanitizeAttribute,N,_e),Pt=_e.attrValue,rt&&(Et==="id"||Et==="name")&&Gf(Pt,Je)!==0&&(Bs(qe,N),Pt=Je+Pt),he&&os(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Pt)){Bs(qe,N);continue}if(Et==="attributename"&&qf(Pt,"href")){Bs(qe,N);continue}if(_e.forceKeepAttr)continue;if(!_e.keepAttr){Bs(qe,N);continue}if(!se&&os(/\/>/i,Pt)){Bs(qe,N);continue}ye&&za([Y,ie,J],On=>{Pt=bi(Pt,On," ")});const La=pt(N.nodeName);if(!Rn(La,Et,Pt)){Bs(qe,N);continue}if(S&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Tt)switch(u.getAttributeType(La,Et)){case"TrustedHTML":{Pt=T(Pt);break}case"TrustedScriptURL":{Pt=$(Pt);break}}if(Pt!==hs)try{Tt?N.setAttributeNS(Tt,qe,Pt):N.setAttribute(qe,Pt),ba(N)?ht(N):Vf(t.removed)}catch{Bs(qe,N)}}fs(z.afterSanitizeAttributes,N,null)},pn=function(N){let ce=null;const _e=un(N);for(fs(z.beforeSanitizeShadowDOM,N,null);ce=_e.nextNode();)if(fs(z.uponSanitizeShadowNode,ce,null),An(ce),ms(ce),Vt(ce.content)&&pn(ce.content),(y?y(ce):ce.nodeType)===xa.element){const je=x?x(ce):ce.shadowRoot;Vt(je)&&(In(je),pn(je))}fs(z.afterSanitizeShadowDOM,N,null)},In=function(N){const ce=[{node:N,shadow:null}];for(;ce.length>0;){const _e=ce.pop();if(_e.shadow){pn(_e.shadow);continue}const Fe=_e.node,qe=(y?y(Fe):Fe.nodeType)===xa.element,Tt=_?_(Fe):Fe.childNodes;if(Tt)for(let vt=Tt.length-1;vt>=0;--vt)ce.push({node:Tt[vt],shadow:null});if(qe){const vt=w?w(Fe):null;if(typeof vt=="string"&&pt(vt)==="template"){const Et=Fe.content;Vt(Et)&&ce.push({node:Et,shadow:null})}}if(qe){const vt=x?x(Fe):Fe.shadowRoot;Vt(vt)&&ce.push({node:null,shadow:vt},{node:vt,shadow:null})}}};return t.sanitize=function(Ie){let N=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ce=null,_e=null,Fe=null,je=null;if(Zs=!Ie,Zs&&(Ie="<!-->"),typeof Ie!="string"&&!zs(Ie)&&(Ie=XC(Ie),typeof Ie!="string"))throw $n("dirty is not a string, aborting");if(!t.isSupported)return Ie;be||Te(N),t.removed=[];const qe=Se&&typeof Ie!="string"&&zs(Ie);if(qe){const Et=w?w(Ie):Ie.nodeName;if(typeof Et=="string"){const hs=pt(Et);if(!ke[hs]||de[hs])throw $n("root node is forbidden and cannot be sanitized in-place")}if(ba(Ie))throw $n("root node is clobbered and cannot be sanitized in-place");try{In(Ie)}catch(hs){throw ga(Ie),hs}}else if(zs(Ie))ce=dn("<!---->"),_e=ce.ownerDocument.importNode(Ie,!0),_e.nodeType===xa.element&&_e.nodeName==="BODY"||_e.nodeName==="HTML"?ce=_e:ce.appendChild(_e),In(_e);else{if(!Ge&&!ye&&!me&&Ie.indexOf("<")===-1)return S&&Be?T(Ie):Ie;if(ce=dn(Ie),!ce)return Ge?null:Be?E:""}ce&&Pe&&ht(ce.firstChild);const Tt=un(qe?Ie:ce);try{for(;Fe=Tt.nextNode();)An(Fe),ms(Fe),Vt(Fe.content)&&pn(Fe.content)}catch(Et){throw qe&&ga(Ie),Et}if(qe)return za(t.removed,Et=>{Et.element&&En(Et.element)}),ye&&da(Ie),Ie;if(Ge){if(ye&&da(ce),De)for(je=D.call(ce.ownerDocument);ce.firstChild;)je.appendChild(ce.firstChild);else je=ce;return(R.shadowroot||R.shadowrootmode)&&(je=re.call(a,je,!0)),je}let vt=me?ce.outerHTML:ce.innerHTML;return me&&ke["!doctype"]&&ce.ownerDocument&&ce.ownerDocument.doctype&&ce.ownerDocument.doctype.name&&os(dT,ce.ownerDocument.doctype.name)&&(vt="<!DOCTYPE "+ce.ownerDocument.doctype.name+`>
`+vt),ye&&za([Y,ie,J],Et=>{vt=bi(vt,Et," ")}),S&&Be?T(vt):vt},t.setConfig=function(){let Ie=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Ie),be=!0},t.clearConfig=function(){Qs=null,be=!1,S=A,E=""},t.isValidAttribute=function(Ie,N,ce){Qs||Te({});const _e=pt(Ie),Fe=pt(N);return Rn(_e,Fe,ce)},t.addHook=function(Ie,N){typeof N=="function"&&gi(z[Ie],N)},t.removeHook=function(Ie,N){if(N!==void 0){const ce=GC(z[Ie],N);return ce===-1?void 0:WC(z[Ie],ce,1)[0]}return Vf(z[Ie])},t.removeHooks=function(Ie){z[Ie]=[]},t.removeAllHooks=function(){z=em()},t}var tm=Ng();function Mu(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ni=Mu();function Mg(e){ni=e}var Rl={exec:()=>null};function xt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Es.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var Es={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},mT=/^(?:[ \t]*(?:\n|$))+/,hT=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,vT=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,co=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,gT=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Du=/(?:[*+-]|\d{1,9}[.)])/,Dg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Pg=xt(Dg).replace(/bull/g,Du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),bT=xt(Dg).replace(/bull/g,Du).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Pu=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,yT=/^[^\n]+/,$u=/(?!\s*\])(?:\\.|[^\[\]\\])+/,xT=xt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",$u).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),_T=xt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Du).getRegex(),ec="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Fu=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,wT=xt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Fu).replace("tag",ec).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),$g=xt(Pu).replace("hr",co).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ec).getRegex(),kT=xt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",$g).getRegex(),Uu={blockquote:kT,code:hT,def:xT,fences:vT,heading:gT,hr:co,html:wT,lheading:Pg,list:_T,newline:mT,paragraph:$g,table:Rl,text:yT},sm=xt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",co).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ec).getRegex(),ST={...Uu,lheading:bT,table:sm,paragraph:xt(Pu).replace("hr",co).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",sm).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ec).getRegex()},CT={...Uu,html:xt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Fu).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Rl,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:xt(Pu).replace("hr",co).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Pg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},TT=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,ET=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Fg=/^( {2,}|\\)\n(?!\s*$)/,AT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,tc=/[\p{P}\p{S}]/u,Bu=/[\s\p{P}\p{S}]/u,Ug=/[^\s\p{P}\p{S}]/u,RT=xt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Bu).getRegex(),Bg=/(?!~)[\p{P}\p{S}]/u,IT=/(?!~)[\s\p{P}\p{S}]/u,OT=/(?:[^\s\p{P}\p{S}]|~)/u,LT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,zg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,NT=xt(zg,"u").replace(/punct/g,tc).getRegex(),MT=xt(zg,"u").replace(/punct/g,Bg).getRegex(),Hg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",DT=xt(Hg,"gu").replace(/notPunctSpace/g,Ug).replace(/punctSpace/g,Bu).replace(/punct/g,tc).getRegex(),PT=xt(Hg,"gu").replace(/notPunctSpace/g,OT).replace(/punctSpace/g,IT).replace(/punct/g,Bg).getRegex(),$T=xt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Ug).replace(/punctSpace/g,Bu).replace(/punct/g,tc).getRegex(),FT=xt(/\\(punct)/,"gu").replace(/punct/g,tc).getRegex(),UT=xt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),BT=xt(Fu).replace("(?:-->|$)","-->").getRegex(),zT=xt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",BT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),kr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,HT=xt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",kr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),jg=xt(/^!?\[(label)\]\[(ref)\]/).replace("label",kr).replace("ref",$u).getRegex(),Vg=xt(/^!?\[(ref)\](?:\[\])?/).replace("ref",$u).getRegex(),jT=xt("reflink|nolink(?!\\()","g").replace("reflink",jg).replace("nolink",Vg).getRegex(),zu={_backpedal:Rl,anyPunctuation:FT,autolink:UT,blockSkip:LT,br:Fg,code:ET,del:Rl,emStrongLDelim:NT,emStrongRDelimAst:DT,emStrongRDelimUnd:$T,escape:TT,link:HT,nolink:Vg,punctuation:RT,reflink:jg,reflinkSearch:jT,tag:zT,text:AT,url:Rl},VT={...zu,link:xt(/^!?\[(label)\]\((.*?)\)/).replace("label",kr).getRegex(),reflink:xt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",kr).getRegex()},Rd={...zu,emStrongRDelimAst:PT,emStrongLDelim:MT,url:xt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},qT={...Rd,br:xt(Fg).replace("{2,}","*").getRegex(),text:xt(Rd.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Bo={normal:Uu,gfm:ST,pedantic:CT},ml={normal:zu,gfm:Rd,breaks:qT,pedantic:VT},GT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},am=e=>GT[e];function ka(e,t){if(t){if(Es.escapeTest.test(e))return e.replace(Es.escapeReplace,am)}else if(Es.escapeTestNoEncode.test(e))return e.replace(Es.escapeReplaceNoEncode,am);return e}function nm(e){try{e=encodeURI(e).replace(Es.percentDecode,"%")}catch{return null}return e}function im(e,t){var i;const s=e.replace(Es.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(Es.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(Es.slashPipe,"|");return a}function hl(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function WT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function lm(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function KT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Sr=class{constructor(e){St(this,"options");St(this,"rules");St(this,"lexer");this.options=e||ni}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:hl(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=KT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=hl(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:hl(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=hl(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],m=!u.trim(),h=0;if(this.options.pedantic?(h=2,d=u.trimStart()):m?h=t[1].length+1:(h=t[2].search(this.rules.other.nonSpaceChar),h=h>4?1:h,d=u.slice(h),h+=t[1].length),m&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const I=this.rules.other.nextBulletRegex(h),x=this.rules.other.hrRegex(h),g=this.rules.other.fencesBeginRegex(h),y=this.rules.other.headingBeginRegex(h),w=this.rules.other.htmlBeginRegex(h);for(;e;){const S=e.split(`
`,1)[0];let E;if(p=S,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),E=p):E=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||y.test(p)||w.test(p)||I.test(p)||x.test(p))break;if(E.search(this.rules.other.nonSpaceChar)>=h||!p.trim())d+=`
`+E.slice(h);else{if(m||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||y.test(u)||x.test(u))break;d+=`
`+p}!m&&!p.trim()&&(m=!0),c+=S+`
`,e=e.substring(S.length+1),u=E.slice(h)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,_;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(_=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!b,checked:_,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=im(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(im(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=hl(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=WT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),lm(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return lm(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}const m=p.slice(2,-2);return{type:"strong",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ja=class Id{constructor(t){St(this,"tokens");St(this,"options");St(this,"state");St(this,"tokenizer");St(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ni,this.options.tokenizer=this.options.tokenizer||new Sr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Es,block:Bo.normal,inline:ml.normal};this.options.pedantic?(s.block=Bo.pedantic,s.inline=ml.pedantic):this.options.gfm&&(s.block=Bo.gfm,this.options.breaks?s.inline=ml.breaks:s.inline=ml.gfm),this.tokenizer.rules=s}static get rules(){return{block:Bo,inline:ml}}static lex(t,s){return new Id(s).lex(t)}static lexInline(t,s){return new Id(s).inlineTokens(t)}lex(t){t=t.replace(Es.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(Es.tabCharGlobal,"    ").replace(Es.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const m=t.slice(1);let h;this.options.extensions.startInline.forEach(b=>{h=b.call({lexer:this},m),typeof h=="number"&&h>=0&&(p=Math.min(p,h))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Cr=class{constructor(e){St(this,"options");St(this,"parser");this.options=e||ni}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(Es.notSpaceStart))==null?void 0:i[0],n=e.replace(Es.endingNewline,"")+`
`;return a?'<pre><code class="language-'+ka(a)+'">'+(s?n:ka(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:ka(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+ka(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ka(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=nm(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ka(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=nm(e);if(n===null)return ka(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ka(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ka(e.text)}},Hu=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Za=class Od{constructor(t){St(this,"options");St(this,"renderer");St(this,"textRenderer");this.options=t||ni,this.options.renderer=this.options.renderer||new Cr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Hu}static parse(t,s){return new Od(s).parse(t)}static parseInline(t,s){return new Od(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},qc,Ko=(qc=class{constructor(e){St(this,"options");St(this,"block");this.options=e||ni}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ja.lex:Ja.lexInline}provideParser(){return this.block?Za.parse:Za.parseInline}},St(qc,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),qc),JT=class{constructor(...e){St(this,"defaults",Mu());St(this,"options",this.setOptions);St(this,"parse",this.parseMarkdown(!0));St(this,"parseInline",this.parseMarkdown(!1));St(this,"Parser",Za);St(this,"Renderer",Cr);St(this,"TextRenderer",Hu);St(this,"Lexer",Ja);St(this,"Tokenizer",Sr);St(this,"Hooks",Ko);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Cr(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Sr(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new Ko;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];Ko.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ja.lex(e,t??this.defaults)}parser(e,t){return Za.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Ja.lex:Ja.lexInline,r=i.hooks?i.hooks.provideParser():e?Za.parse:Za.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ka(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Qn=new JT;function bt(e,t){return Qn.parse(e,t)}bt.options=bt.setOptions=function(e){return Qn.setOptions(e),bt.defaults=Qn.defaults,Mg(bt.defaults),bt};bt.getDefaults=Mu;bt.defaults=ni;bt.use=function(...e){return Qn.use(...e),bt.defaults=Qn.defaults,Mg(bt.defaults),bt};bt.walkTokens=function(e,t){return Qn.walkTokens(e,t)};bt.parseInline=Qn.parseInline;bt.Parser=Za;bt.parser=Za.parse;bt.Renderer=Cr;bt.TextRenderer=Hu;bt.Lexer=Ja;bt.lexer=Ja.lex;bt.Tokenizer=Sr;bt.Hooks=Ko;bt.parse=bt;bt.options;bt.setOptions;bt.use;bt.walkTokens;bt.parseInline;Za.parse;Ja.lex;const ZT={breaks:!0,gfm:!0};function om(e){if(!e)return"";try{if(typeof bt<"u"&&bt.parse){const t=bt.parse(e,ZT);return typeof tm<"u"?tm.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function YT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const QT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function XT(e){return QT[e]||"wrench"}const eE=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function rm(e){if(!e)return[];const t=e.match(eE);return t?[...new Set(t)]:[]}const tE={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=V(()=>t.value.trim().length>0&&!s.value),p=f(ut.state||"disconnected");let m=null;const h=V(()=>{const M=p.value;return M==="connected"?"Connected":M==="reconnecting"?"Reconnecting…":M==="connecting"?"Connecting…":"REST fallback"}),b=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],_=V(()=>{const M=Math.floor(l.value/4)%b.length,L=l.value;return L>3?`${b[M]} (${L}s)`:b[0]});function I(){Ht(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function x(){if(!i.value)return;const M=i.value;M.style.height="auto",M.style.height=Math.min(M.scrollHeight,120)+"px"}function g(M,L,D={}){const le={id:++c,role:M,content:L,timestamp:Date.now(),html:M==="bot"?om(L):"",tools_used:D.tools_used||[],is_error:D.is_error||!1,images:M==="bot"?rm(L):[],files:D.files||[],_showTools:!1};return e.value.push(le),I(),M==="bot"&&Ht(()=>y()),le}function y(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const D=document.createElement("button");D.className="chat-code-copy",D.textContent="Copy",D.addEventListener("click",()=>{const le=L.querySelector("code"),re=le?le.textContent:L.textContent;navigator.clipboard.writeText(re).then(()=>{D.textContent="Copied!",setTimeout(()=>{D.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(D)})}function w(M){if(M===0)return!0;const L=e.value[M-1],D=e.value[M],le=new Date(L.timestamp).toDateString(),re=new Date(D.timestamp).toDateString();return le!==re}function S(M){const L=new Date(M),D=new Date;if(L.toDateString()===D.toDateString())return"Today";const le=new Date(D);return le.setDate(le.getDate()-1),L.toDateString()===le.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function E(M){t.value=M,Ht(()=>Q())}function A(M){window.open(M,"_blank","noopener")}function k(M){M.target.style.display="none"}function O(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function B(){r&&(clearInterval(r),r=null),l.value=0}function T(M){s.value&&(s.value=!1,B(),M.type==="chat_response"?g("bot",M.content,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]}):M.type==="chat_error"&&g("bot",M.error||"Unknown error",{is_error:!0}),Ht(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function $(M){try{const L=await j.post("/api/chat",{content:M,channel_id:o.value});g("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){g("bot",L.message||"Failed to send message",{is_error:!0})}}async function Q(){const M=t.value.trim();if(!M||s.value)return;g("user",M),t.value="",s.value=!0,O(),i.value&&(i.value.style.height="auto"),ut.connected&&ut.sendChat(M,{channelId:o.value})||(await $(M),s.value=!1,B()),Ht(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}async function W(){a.value="";try{if(!o.value){const L=await j.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const M=await j.get("/api/sessions/"+encodeURIComponent(o.value));if(M&&M.messages&&M.messages.length>0){for(const L of M.messages){const D=L.role==="user"?"user":"bot";let le=L.content||"";if(D==="user"){const z=le.match(/^\[.*?\]:\s*/);z&&(le=le.slice(z[0].length))}if(!le.trim())continue;const re={id:++c,role:D,content:le,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:D==="bot"?om(le):"",tools_used:[],is_error:!1,images:D==="bot"?rm(le):[],files:[],_showTools:!1};e.value.push(re)}Ht(()=>{I(),y()})}}catch(M){M&&M.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Ee.error(a.value))}}return tt(()=>{ut.subscribe("chat",T),p.value=ut.state||"disconnected",m=ut.onState(M=>{p.value=M}),W(),Ht(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}),_t(()=>{ut.unsubscribe("chat",T),m&&(m(),m=null),B()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:h,typingText:_,suggestions:d,send:Q,autoResize:x,formatTime:YT,formatDate:S,showDateSeparator:w,useSuggestion:E,openImage:A,onImageError:k,getToolIcon:XT,loadHistory:W}}},sE={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),m=f(!1),h=V(()=>e.value==="custom"),b=V(()=>[...i.value,...l.value]),_=V(()=>l.value.includes(e.value)),I=V(()=>{var A;return h.value?t.value||"Odin":((A=n.value[e.value])==null?void 0:A.name)||e.value}),x=V(()=>{var A;return h.value?s.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.identity)||""}),g=V(()=>{var A;return h.value?a.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.voice)||""});async function y(){d.value=!0;try{const A=await j.get("/api/personality");e.value=A.preset||"odin",t.value=A.custom_name||"",s.value=A.custom_identity||"",a.value=A.custom_voice||"",n.value=A.presets||{},i.value=A.builtin_presets||[],l.value=A.user_presets||[]}catch(A){c.value=A.message}finally{d.value=!1}}async function w(){o.value=!0,c.value=null,r.value=!1;try{await j.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(A){c.value=A.message}finally{o.value=!1}}async function S(){const A=u.value.trim();if(A){m.value=!0,c.value=null;try{await j.post("/api/personality/presets",{name:A,display_name:I.value,identity:x.value,voice:g.value}),p.value=!1,u.value="",await y(),e.value=A.toLowerCase().replace(/ /g,"_")}catch(k){c.value=k.message}finally{m.value=!1}}}async function E(){if(await is({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await j.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await y(),e.value="odin"}catch(k){c.value=k.message}}}return tt(y),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:b,isCustom:h,isUserPreset:_,previewName:I,previewIdentity:x,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:w,showSavePreset:p,newPresetName:u,savingPreset:m,saveAsPreset:S,deletePreset:E,builtinPresets:i,userPresets:l}},template:`
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
  `},aE={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,m=null;function h(){return p+=1,m==null||m.abort(),m=null,p}function b(w,S,E){return typeof j.postWithOptions=="function"?j.postWithOptions(w,S,{signal:E}):j.post(w,S)}async function _(){var E,A,k;a.value=!0,i.value="",l.value="Saving setup…";const w={},S=!!s.value.trim();t.value.trim()&&(w.web_api_token=t.value.trim()),s.value.trim()&&(w.discord_token=s.value.trim());try{const O=j.post("/api/setup/complete",w);t.value="",s.value="";const B=await O,T=((E=B.discord)==null?void 0:E.state)||B.discord_status;if(T==="failed"?(i.value=((A=B.discord)==null?void 0:A.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):T==="connecting"?l.value="Saved. Connecting Discord…":T==="ready"?l.value="Saved. Discord ready.":S?l.value="Saved. Discord token stored; attachment status is pending.":l.value=B.message||"Setup saved. Ready to sign in.",(k=B.restart_required)!=null&&k.length){const $=B.message||`Restart Odin to apply: ${B.restart_required.join(", ")}`;l.value.includes($)||(l.value+=` ${$}`)}n.value=!0}catch(O){i.value=O.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function I(){const w=h(),S=typeof AbortController=="function"?new AbortController:null;m=S,o.value=!0,u.value="";try{const E=await b("/api/codex/device-code",void 0,S==null?void 0:S.signal);if(w!==p)return;c.value=E,r.value="pending";const A=await b("/api/codex/device-poll",{device_auth_id:E.device_auth_id,user_code:E.user_code,interval:E.interval},S==null?void 0:S.signal);if(w!==p)return;d.value=A||{},r.value="ready"}catch(E){w===p&&(E==null?void 0:E.name)!=="AbortError"&&(u.value=E.message||"Device sign-in failed.",r.value="failed")}finally{w===p&&(o.value=!1,m=null)}}function x(){h(),o.value=!1,y()}function g(){var w;(w=e.onComplete)==null||w.call(e)}function y(){r.value="",c.value=null,d.value={},u.value=""}return _t(()=>{h()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:_,onComplete:g,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:I,cancelDeviceLogin:x,clearDeviceState:y}}},$t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),qg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:$C,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:tE,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:n1,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:f1,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:M1,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:sE,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:IC,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:$t("/operations","live")},{path:"/agents",redirect:$t("/operations","agents")},{path:"/loops",redirect:$t("/operations","loops")},{path:"/processes",redirect:$t("/operations","processes")},{path:"/schedules",redirect:$t("/operations","schedules")},{path:"/audit",redirect:$t("/history","audit")},{path:"/sessions",redirect:$t("/history","sessions")},{path:"/traces",redirect:$t("/history","traces")},{path:"/usage",redirect:$t("/history","usage")},{path:"/tools",redirect:$t("/capabilities","tools")},{path:"/skills",redirect:$t("/capabilities","skills")},{path:"/mcp",redirect:$t("/capabilities","mcp-servers")},{path:"/knowledge",redirect:$t("/capabilities","knowledge")},{path:"/memory",redirect:$t("/capabilities","memory")},{path:"/learned",redirect:$t("/capabilities","learned")},{path:"/health",redirect:$t("/system","health")},{path:"/resources",redirect:$t("/system","resources")},{path:"/logs",redirect:$t("/system","logs")},{path:"/config",redirect:$t("/system","config")},{path:"/host-access",redirect:$t("/system","host-access")},{path:"/hosts",redirect:$t("/system","hosts")},{path:"/internals",redirect:$t("/system","internals")}],Il=OS({history:cS(),routes:qg});Il.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const nE={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{j.setPersist(n.value),await j.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},iE={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let m=null;const h=f("starting"),b=f(""),_=qg.filter(z=>z.meta),I=V(()=>["Workspace","Operate","Observe","Manage"].map(z=>({name:z,routes:_.filter(Y=>Y.meta.section===z)})).filter(z=>z.routes.length)),x=V(()=>{var z;return((z=Il.currentRoute.value.meta)==null?void 0:z.label)||"Odin"}),g=V(()=>{var z;return((z=Il.currentRoute.value.meta)==null?void 0:z.section)||"Management"}),y=V(()=>{var z;return((z=Il.currentRoute.value.meta)==null?void 0:z.description)||"Management console"});function w(){ut.disconnect(),M&&(clearInterval(M),M=null)}j.onSessionExpired=()=>{t.value=!0,w(),j.setToken(""),e.value="login"};function S(z){var Y;if((z.ctrlKey||z.metaKey)&&z.key.toLowerCase()==="k"){e.value==="ready"&&(z.preventDefault(),Bf());return}if(a.value&&z.key==="Tab"){const ie=[...((Y=n.value)==null?void 0:Y.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(ie.length){const J=ie[0],ve=ie[ie.length-1];if(z.shiftKey&&(document.activeElement===J||!n.value.contains(document.activeElement))){z.preventDefault(),ve.focus();return}if(!z.shiftKey&&(document.activeElement===ve||!n.value.contains(document.activeElement))){z.preventDefault(),J.focus();return}}}if(z.key==="Escape"&&a.value){a.value=!1,z.preventDefault();return}if(z.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(z.target.tagName)){z.preventDefault();const ie=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');ie&&ie.focus()}}function E(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function A(){try{const z=await j.get("/api/setup/status");if(z.mode==="pending"||z.needed===!0)return w(),e.value="setup",!0}catch(z){z==null||z.name}return!1}tt(async()=>{if(document.addEventListener("keydown",S),o=window.matchMedia("(max-width: 900px)"),E(),o.addEventListener("change",E),await A())return;const z=await j.check();z.ok?(e.value="ready",le()):z.needsAuth?e.value="login":(e.value="ready",le())});function k(){t.value=!1,e.value="ready",le()}async function O(){if(await A())return;const z=await j.check();z.ok?(e.value="ready",le()):z.needsAuth?e.value="login":(e.value="ready",le())}async function B(){w(),e.value="login",await j.logout()}function T(){s.value=!s.value}function $(){a.value=!a.value}Kt(a,async z=>{var Y,ie;if(z)r=document.activeElement,await Ht(),(ie=(Y=n.value)==null?void 0:Y.querySelector(".nav-item"))==null||ie.focus();else if(r!=null&&r.isConnected){const J=r;r=null,requestAnimationFrame(()=>J.focus())}});const Q=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function W(z,Y="info",ie=3e3){p.value={text:z,level:Y},clearTimeout(m),m=setTimeout(()=>{p.value=null},ie)}let M=null,L=!1,D=[];function le(){for(const z of D)z();D=[ut.onStatus(z=>{c.value=z}),ut.onLatencyChange(z=>{u.value=z}),ut.onState((z,Y)=>{d.value=z,z==="connected"?(L&&W("Connection restored","success"),L=!0):z==="reconnecting"&&Y.attempt===1&&W("Connection lost — reconnecting…","warn")})],ut.connect(),re(),M&&clearInterval(M),M=setInterval(re,15e3)}async function re(){try{const z=await j.get("/api/status");h.value=z.status==="online"?"online":"starting";const Y=z.uptime_seconds||0,ie=Math.floor(Y/3600),J=Math.floor(Y%3600/60);b.value=`${ie}h ${J}m uptime`}catch{h.value="offline",b.value=""}}return _t(()=>{M&&clearInterval(M);for(const z of D)z();D=[],ut.disconnect(),document.removeEventListener("keydown",S),o==null||o.removeEventListener("change",E)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Q,wsToast:p,botStatus:h,botUptime:b,navRoutes:_,navGroups:I,currentPage:x,currentSection:g,currentDescription:y,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:k,onSetupComplete:O,logout:B,toggleSidebar:T,toggleMobileNavigation:$,openPalette:Bf}}},rn=pr(iE);rn.component("odin-icon",MC);rn.component("login-screen",nE);rn.component("setup-page",aE);rn.component("toast-container",kk);rn.component("confirm-host",Sk);rn.component("command-palette",NC);rn.directive("modal-focus",PC);rn.use(Il);rn.mount("#app");
