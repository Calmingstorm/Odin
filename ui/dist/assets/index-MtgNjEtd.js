var ev=Object.defineProperty;var tv=(e,t,s)=>t in e?ev(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ut=(e,t,s)=>tv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class sv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new fl("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new pd(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new fl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new pd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new fl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof fl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class fl extends Error{constructor(t){super(t),this.name="AuthError"}}class pd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class nv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const r of this._subscriptions)a.send(JSON.stringify({subscribe:r}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let r;try{r=JSON.parse(l.data)}catch{return}const o=r.type;if(o==="pong"){r.ts&&(this._latency=Date.now()-r.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(o==="subscribed"){this._ackSubscription(a,r.channel);return}if(o==="log")for(const c of this._handlers.logs||[])c(r);else if(o==="event")for(const c of this._handlers.events||[])c(r);else if(o==="chat_response"||o==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(r)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const W=new sv,Qe=new nv(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ss(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const qe={},Ua=[],jt=()=>{},$a=()=>!1,ya=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),hr=e=>e.startsWith("onUpdate:"),Ve=Object.assign,tc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},av=Object.prototype.hasOwnProperty,st=(e,t)=>av.call(e,t),Ae=Array.isArray,Ha=e=>oi(e)==="[object Map]",xa=e=>oi(e)==="[object Set]",fd=e=>oi(e)==="[object Date]",iv=e=>oi(e)==="[object RegExp]",Fe=e=>typeof e=="function",Be=e=>typeof e=="string",Xt=e=>typeof e=="symbol",tt=e=>e!==null&&typeof e=="object",sc=e=>(tt(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),gp=Object.prototype.toString,oi=e=>gp.call(e),lv=e=>oi(e).slice(8,-1),mr=e=>oi(e)==="[object Object]",vr=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,_n=Ss(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),rv=Ss("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),gr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},ov=/-\w/g,rt=gr(e=>e.replace(ov,t=>t.slice(1).toUpperCase())),cv=/\B([A-Z])/g,ms=gr(e=>e.replace(cv,"-$1").toLowerCase()),_a=gr(e=>e.charAt(0).toUpperCase()+e.slice(1)),za=gr(e=>e?`on${_a(e)}`:""),Dt=(e,t)=>!Object.is(e,t),ja=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},bp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},br=e=>{const t=parseFloat(e);return isNaN(t)?e:t},$l=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let hd;const yr=()=>hd||(hd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function dv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const uv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",pv=Ss(uv);function sl(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Be(n)?yp(n):sl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Be(e)||tt(e))return e}const fv=/;(?![^(]*\))/g,hv=/:([^]+)/,mv=/\/\*[^]*?\*\//g;function yp(e){const t={};return e.replace(mv,"").split(fv).forEach(s=>{if(s){const n=s.split(hv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function nl(e){let t="";if(Be(e))t=e;else if(Ae(e))for(let s=0;s<e.length;s++){const n=nl(e[s]);n&&(t+=n+" ")}else if(tt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function vv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=nl(t)),s&&(e.style=sl(s)),e}const gv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",bv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",yv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",xv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",_v=Ss(gv),wv=Ss(bv),kv=Ss(yv),Sv=Ss(xv),Tv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Cv=Ss(Tv);function xp(e){return!!e||e===""}function Ev(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Tn(e[n],t[n]);return s}function Tn(e,t){if(e===t)return!0;let s=fd(e),n=fd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Xt(e),n=Xt(t),s||n)return e===t;if(s=Ae(e),n=Ae(t),s||n)return s&&n?Ev(e,t):!1;if(s=tt(e),n=tt(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!Tn(e[l],t[l]))return!1}}return String(e)===String(t)}function xr(e,t){return e.findIndex(s=>Tn(s,t))}const _p=e=>!!(e&&e.__v_isRef===!0),wp=e=>Be(e)?e:e==null?"":Ae(e)||tt(e)&&(e.toString===gp||!Fe(e.toString))?_p(e)?wp(e.value):JSON.stringify(e,kp,2):String(e),kp=(e,t)=>_p(t)?kp(e,t.value):Ha(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Vr(n,i)+" =>"]=a,s),{})}:xa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Vr(s))}:Xt(t)?Vr(t):tt(t)&&!Ae(t)&&!mr(t)?String(t):t,Vr=(e,t="")=>{var s;return Xt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Av(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Nt;class nc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Nt&&(Nt.active?(this.parent=Nt,this.index=(Nt.scopes||(Nt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Nt;try{return Nt=this,t()}finally{Nt=s}}}on(){++this._on===1&&(this.prevScope=Nt,Nt=this)}off(){if(this._on>0&&--this._on===0){if(Nt===this)Nt=this.prevScope;else{let t=Nt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Rv(e){return new nc(e)}function Sp(){return Nt}function Iv(e,t=!1){Nt&&Nt.cleanups.push(e)}let pt;const qr=new WeakSet;class $i{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Nt&&(Nt.active?Nt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,qr.has(this)&&(qr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Cp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,md(this),Ep(this);const t=pt,s=Us;pt=this,Us=!0;try{return this.fn()}finally{Ap(this),pt=t,Us=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)lc(t);this.deps=this.depsTail=void 0,md(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?qr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){xo(this)&&this.run()}get dirty(){return xo(this)}}let Tp=0,Ei,Ai;function Cp(e,t=!1){if(e.flags|=8,t){e.next=Ai,Ai=e;return}e.next=Ei,Ei=e}function ac(){Tp++}function ic(){if(--Tp>0)return;if(Ai){let t=Ai;for(Ai=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ei;){let t=Ei;for(Ei=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Ep(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Ap(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),lc(n),Ov(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function xo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Rp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Rp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Bi)||(e.globalVersion=Bi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!xo(e))))return;e.flags|=2;const t=e.dep,s=pt,n=Us;pt=e,Us=!0;try{Ep(e);const a=e.fn(e._value);(t.version===0||Dt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{pt=s,Us=n,Ap(e),e.flags&=-3}}function lc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)lc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Ov(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Lv(e,t){e.effect instanceof $i&&(e=e.effect.fn);const s=new $i(e);t&&Ve(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Nv(e){e.effect.stop()}let Us=!0;const Ip=[];function Cn(){Ip.push(Us),Us=!1}function En(){const e=Ip.pop();Us=e===void 0?!0:e}function md(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=pt;pt=void 0;try{t()}finally{pt=s}}}let Bi=0;class Pv{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class _r{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!pt||!Us||pt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==pt)s=this.activeLink=new Pv(pt,this),pt.deps?(s.prevDep=pt.depsTail,pt.depsTail.nextDep=s,pt.depsTail=s):pt.deps=pt.depsTail=s,Op(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=pt.depsTail,s.nextDep=void 0,pt.depsTail.nextDep=s,pt.depsTail=s,pt.deps===s&&(pt.deps=n)}return s}trigger(t){this.version++,Bi++,this.notify(t)}notify(t){ac();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{ic()}}}function Op(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Op(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Bl=new WeakMap,da=Symbol(""),_o=Symbol(""),Ui=Symbol("");function Zt(e,t,s){if(Us&&pt){let n=Bl.get(e);n||Bl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new _r),a.map=n,a.key=s),a.track()}}function vn(e,t,s,n,a,i){const l=Bl.get(e);if(!l){Bi++;return}const r=o=>{o&&o.trigger()};if(ac(),t==="clear")l.forEach(r);else{const o=Ae(e),c=o&&vr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Ui||!Xt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Ui)),t){case"add":o?c&&r(l.get("length")):(r(l.get(da)),Ha(e)&&r(l.get(_o)));break;case"delete":o||(r(l.get(da)),Ha(e)&&r(l.get(_o)));break;case"set":Ha(e)&&r(l.get(da));break}}ic()}function Mv(e,t){const s=Bl.get(e);return s&&s.get(t)}function Aa(e){const t=Je(e);return t===e?t:(Zt(t,"iterate",Ui),gs(e)?t:t.map(zs))}function wr(e){return Zt(e=Je(e),"iterate",Ui),e}function en(e,t){return sn(e)?Ja(wn(e)?zs(t):t):zs(t)}const Dv={__proto__:null,[Symbol.iterator](){return Gr(this,Symbol.iterator,e=>en(this,e))},concat(...e){return Aa(this).concat(...e.map(t=>Ae(t)?Aa(t):t))},entries(){return Gr(this,"entries",e=>(e[1]=en(this,e[1]),e))},every(e,t){return on(this,"every",e,t,void 0,arguments)},filter(e,t){return on(this,"filter",e,t,s=>s.map(n=>en(this,n)),arguments)},find(e,t){return on(this,"find",e,t,s=>en(this,s),arguments)},findIndex(e,t){return on(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return on(this,"findLast",e,t,s=>en(this,s),arguments)},findLastIndex(e,t){return on(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return on(this,"forEach",e,t,void 0,arguments)},includes(...e){return Kr(this,"includes",e)},indexOf(...e){return Kr(this,"indexOf",e)},join(e){return Aa(this).join(e)},lastIndexOf(...e){return Kr(this,"lastIndexOf",e)},map(e,t){return on(this,"map",e,t,void 0,arguments)},pop(){return fi(this,"pop")},push(...e){return fi(this,"push",e)},reduce(e,...t){return vd(this,"reduce",e,t)},reduceRight(e,...t){return vd(this,"reduceRight",e,t)},shift(){return fi(this,"shift")},some(e,t){return on(this,"some",e,t,void 0,arguments)},splice(...e){return fi(this,"splice",e)},toReversed(){return Aa(this).toReversed()},toSorted(e){return Aa(this).toSorted(e)},toSpliced(...e){return Aa(this).toSpliced(...e)},unshift(...e){return fi(this,"unshift",e)},values(){return Gr(this,"values",e=>en(this,e))}};function Gr(e,t,s){const n=wr(e),a=n[t]();return n!==e&&!gs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Fv=Array.prototype;function on(e,t,s,n,a,i){const l=wr(e),r=l!==e&&!gs(e),o=l[t];if(o!==Fv[t]){const u=o.apply(e,i);return r?zs(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,en(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function vd(e,t,s,n){const a=wr(e),i=a!==e&&!gs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=en(e,c)),s.call(this,c,en(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?en(e,o):o}function Kr(e,t,s){const n=Je(e);Zt(n,"iterate",Ui);const a=n[t](...s);return(a===-1||a===!1)&&al(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function fi(e,t,s=[]){Cn(),ac();const n=Je(e)[t].apply(e,s);return ic(),En(),n}const $v=Ss("__proto__,__v_isRef,__isVue"),Lp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Xt));function Bv(e){Xt(e)||(e=String(e));const t=Je(this);return Zt(t,"has",e),t.hasOwnProperty(e)}class Np{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Bp:$p:i?Fp:Dp).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ae(t);if(!a){let o;if(l&&(o=Dv[s]))return o;if(s==="hasOwnProperty")return Bv}const r=Reflect.get(t,s,Rt(t)?t:n);if((Xt(s)?Lp.has(s):$v(s))||(a||Zt(t,"get",s),i))return r;if(Rt(r)){const o=l&&vr(s)?r:r.value;return a&&tt(o)?Ul(o):o}return tt(r)?a?Ul(r):qn(r):r}}class Pp extends Np{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ae(t)&&vr(s);if(!this._isShallow){const c=sn(i);if(!gs(n)&&!sn(n)&&(i=Je(i),n=Je(n)),!l&&Rt(i)&&!Rt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:st(t,s),o=Reflect.set(t,s,n,Rt(t)?t:a);return t===Je(a)&&(r?Dt(n,i)&&vn(t,"set",s,n):vn(t,"add",s,n)),o}deleteProperty(t,s){const n=st(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&vn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Xt(s)||!Lp.has(s))&&Zt(t,"has",s),n}ownKeys(t){return Zt(t,"iterate",Ae(t)?"length":da),Reflect.ownKeys(t)}}class Mp extends Np{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Uv=new Pp,Hv=new Mp,zv=new Pp(!0),jv=new Mp(!0),wo=e=>e,hl=e=>Reflect.getPrototypeOf(e);function Vv(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=Ha(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?wo:t?Ja:zs;return!t&&Zt(i,"iterate",o?_o:da),Ve(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function ml(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function qv(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Dt(a,r)&&Zt(l,"get",a),Zt(l,"get",r));const{has:o}=hl(l),c=t?wo:e?Ja:zs;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Zt(Je(a),"iterate",da),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Dt(a,r)&&Zt(l,"has",a),Zt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?wo:e?Ja:zs;return!e&&Zt(o,"iterate",da),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ve(s,e?{add:ml("add"),set:ml("set"),delete:ml("delete"),clear:ml("clear")}:{add(a){const i=Je(this),l=hl(i),r=Je(a),o=!t&&!gs(a)&&!sn(a)?r:a;return l.has.call(i,o)||Dt(a,o)&&l.has.call(i,a)||Dt(r,o)&&l.has.call(i,r)||(i.add(o),vn(i,"add",o,o)),this},set(a,i){!t&&!gs(i)&&!sn(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=hl(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Dt(i,d)&&vn(l,"set",a,i):vn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=hl(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&vn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&vn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Vv(a,e,t)}),s}function kr(e,t){const s=qv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(st(s,a)&&a in n?s:n,a,i)}const Gv={get:kr(!1,!1)},Kv={get:kr(!1,!0)},Wv={get:kr(!0,!1)},Zv={get:kr(!0,!0)},Dp=new WeakMap,Fp=new WeakMap,$p=new WeakMap,Bp=new WeakMap;function Jv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function qn(e){return sn(e)?e:Sr(e,!1,Uv,Gv,Dp)}function rc(e){return Sr(e,!1,zv,Kv,Fp)}function Ul(e){return Sr(e,!0,Hv,Wv,$p)}function Yv(e){return Sr(e,!0,jv,Zv,Bp)}function Sr(e,t,s,n,a){if(!tt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Jv(lv(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function wn(e){return sn(e)?wn(e.__v_raw):!!(e&&e.__v_isReactive)}function sn(e){return!!(e&&e.__v_isReadonly)}function gs(e){return!!(e&&e.__v_isShallow)}function al(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Up(e){return!st(e,"__v_skip")&&Object.isExtensible(e)&&bp(e,"__v_skip",!0),e}const zs=e=>tt(e)?qn(e):e,Ja=e=>tt(e)?Ul(e):e;function Rt(e){return e?e.__v_isRef===!0:!1}function h(e){return Hp(e,!1)}function oc(e){return Hp(e,!0)}function Hp(e,t){return Rt(e)?e:new Qv(e,t)}class Qv{constructor(t,s){this.dep=new _r,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:zs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||gs(t)||sn(t);t=n?t:Je(t),Dt(t,s)&&(this._rawValue=t,this._value=n?t:zs(t),this.dep.trigger())}}function Xv(e){e.dep&&e.dep.trigger()}function tn(e){return Rt(e)?e.value:e}function eg(e){return Fe(e)?e():tn(e)}const tg={get:(e,t,s)=>t==="__v_raw"?e:tn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Rt(a)&&!Rt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function cc(e){return wn(e)?e:new Proxy(e,tg)}class sg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new _r,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function zp(e){return new sg(e)}function ng(e){const t=Ae(e)?new Array(e.length):{};for(const s in e)t[s]=jp(e,s);return t}class ag{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Xt(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!Ae(t)||Xt(this._key)||!vr(this._key))do a=!al(i)||gs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=tn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Rt(this._raw[this._key])){const s=this._object[this._key];if(Rt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Mv(this._raw,this._key)}}class ig{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function lg(e,t,s){return Rt(e)?e:Fe(e)?new ig(e):tt(e)&&arguments.length>1?jp(e,t,s):h(e)}function jp(e,t,s){return new ag(e,t,s)}class rg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new _r(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Bi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&pt!==this)return Cp(this,!0),!0}get value(){const t=this.dep.track();return Rp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function og(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new rg(n,a,s)}const cg={GET:"get",HAS:"has",ITERATE:"iterate"},dg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},vl={},Hl=new WeakMap;let $n;function ug(){return $n}function Vp(e,t=!1,s=$n){if(s){let n=Hl.get(s);n||Hl.set(s,n=[]),n.push(e)}}function pg(e,t,s=qe){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=b=>a?b:gs(b)||a===!1||a===0?gn(b,1):gn(b);let d,u,p,f,m=!1,v=!1;if(Rt(e)?(u=()=>e.value,m=gs(e)):wn(e)?(u=()=>c(e),m=!0):Ae(e)?(v=!0,m=e.some(b=>wn(b)||gs(b)),u=()=>e.map(b=>{if(Rt(b))return b.value;if(wn(b))return c(b);if(Fe(b))return o?o(b,2):b()})):Fe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){Cn();try{p()}finally{En()}}const b=$n;$n=d;try{return o?o(e,3,[f]):e(f)}finally{$n=b}}:u=jt,t&&a){const b=u,S=a===!0?1/0:a;u=()=>gn(b(),S)}const C=Sp(),O=()=>{d.stop(),C&&C.active&&tc(C.effects,d)};if(i&&t){const b=t;t=(...S)=>{const k=b(...S);return O(),k}}let x=v?new Array(e.length).fill(vl):vl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const S=d.run();if(b||a||m||(v?S.some((k,A)=>Dt(k,x[A])):Dt(S,x))){p&&p();const k=$n;$n=d;try{const A=[S,x===vl?void 0:v&&x[0]===vl?[]:x,f];x=S,o?o(t,3,A):t(...A)}finally{$n=k}}}else d.run()};return r&&r(g),d=new $i(u),d.scheduler=l?()=>l(g,!1):g,f=b=>Vp(b,!1,d),p=d.onStop=()=>{const b=Hl.get(d);if(b){if(o)o(b,4);else for(const S of b)S();Hl.delete(d)}},t?n?g(!0):x=d.run():l?l(g.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function gn(e,t=1/0,s){if(t<=0||!tt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Rt(e))gn(e.value,t,s);else if(Ae(e))for(let n=0;n<e.length;n++)gn(e[n],t,s);else if(xa(e)||Ha(e))e.forEach(n=>{gn(n,t,s)});else if(mr(e)){for(const n in e)gn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&gn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qp=[];function fg(e){qp.push(e)}function hg(){qp.pop()}function mg(e,t){}const vg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},gg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ci(e,t,s,n){try{return n?e(...n):e()}catch(a){wa(a,t,s)}}function ks(e,t,s,n){if(Fe(e)){const a=ci(e,t,s,n);return a&&sc(a)&&a.catch(i=>{wa(i,t,s)}),a}if(Ae(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ks(e[i],t,s,n));return a}}function wa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||qe;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){Cn(),ci(i,null,10,[e,o,c]),En();return}}bg(e,s,a,n,l)}function bg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const is=[];let Qs=-1;const Va=[];let Bn=null,Pa=0;const Gp=Promise.resolve();let zl=null;function Et(e){const t=zl||Gp;return e?t.then(this?e.bind(this):e):t}function yg(e){let t=Qs+1,s=is.length;for(;t<s;){const n=t+s>>>1,a=is[n],i=zi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function dc(e){if(!(e.flags&1)){const t=zi(e),s=is[is.length-1];!s||!(e.flags&2)&&t>=zi(s)?is.push(e):is.splice(yg(t),0,e),e.flags|=1,Kp()}}function Kp(){zl||(zl=Gp.then(Wp))}function Hi(e){Ae(e)?Va.push(...e):Bn&&e.id===-1?Bn.splice(Pa+1,0,e):e.flags&1||(Va.push(e),e.flags|=1),Kp()}function gd(e,t,s=Qs+1){for(;s<is.length;s++){const n=is[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;is.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function jl(e){if(Va.length){const t=[...new Set(Va)].sort((s,n)=>zi(s)-zi(n));if(Va.length=0,Bn){Bn.push(...t);return}for(Bn=t,Pa=0;Pa<Bn.length;Pa++){const s=Bn[Pa];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Bn=null,Pa=0}}const zi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Wp(e){try{for(Qs=0;Qs<is.length;Qs++){const t=is[Qs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ci(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Qs<is.length;Qs++){const t=is[Qs];t&&(t.flags&=-2)}Qs=-1,is.length=0,jl(),zl=null,(is.length||Va.length)&&Wp()}}let Ma,gl=[];function Zp(e,t){var s,n;Ma=e,Ma?(Ma.enabled=!0,gl.forEach(({event:a,args:i})=>Ma.emit(a,...i)),gl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Zp(i,t)}),setTimeout(()=>{Ma||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,gl=[])},3e3)):gl=[]}let zt=null,Tr=null;function ji(e){const t=zt;return zt=e,Tr=e&&e.type.__scopeId||null,t}function xg(e){Tr=e}function _g(){Tr=null}const wg=e=>uc;function uc(e,t=zt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ki(-1);const i=ji(t);let l;try{l=e(...a)}finally{ji(i),n._d&&Ki(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function kg(e,t){if(zt===null)return e;const s=ol(zt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=qe]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&gn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Xs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Cn(),ks(o,s,8,[e.el,r,e,t]),En())}}function Ri(e,t){if(Ht){let s=Ht.provides;const n=Ht.parent&&Ht.parent.provides;n===s&&(s=Ht.provides=Object.create(n)),s[e]=t}}function Ls(e,t,s=!1){const n=os();if(n||ua){let a=ua?ua._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function Sg(){return!!(os()||ua)}const Jp=Symbol.for("v-scx"),Yp=()=>Ls(Jp);function Tg(e,t){return il(e,null,t)}function Cg(e,t){return il(e,null,{flush:"post"})}function Qp(e,t){return il(e,null,{flush:"sync"})}function rs(e,t,s){return il(e,t,s)}function il(e,t,s=qe){const{immediate:n,deep:a,flush:i,once:l}=s,r=Ve({},s),o=t&&n||!t&&i!=="post";let c;if(va){if(i==="sync"){const f=Yp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!o){const f=()=>{};return f.stop=jt,f.resume=jt,f.pause=jt,f}}const d=Ht;r.call=(f,m,v)=>ks(f,d,m,v);let u=!1;i==="post"?r.scheduler=f=>{Ct(f,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(f,m)=>{m?f():dc(f)}),r.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=pg(e,t,r);return va&&(c?c.push(p):o&&p()),p}function Eg(e,t,s){const n=this.proxy,a=Be(e)?e.includes(".")?Xp(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=di(this),r=il(a,i.bind(n),s);return l(),r}function Xp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Dn=new WeakMap,ef=Symbol("_vte"),tf=e=>e.__isTeleport,la=e=>e&&(e.disabled||e.disabled===""),Ag=e=>e&&(e.defer||e.defer===""),bd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,yd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,ko=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Rg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:v,createComment:C,parentNode:O}}=c,x=la(t.props);let{dynamicChildren:g}=t;const b=(A,T,_)=>{A.shapeFlag&16&&d(A.children,T,_,a,i,l,r,o)},S=(A=t)=>{const T=la(A.props),_=A.target=ko(A.props,m),N=So(_,A,v,f);_&&(l!=="svg"&&bd(_)?l="svg":l!=="mathml"&&yd(_)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(_),T||(b(A,_,N),wi(A,!1)))},k=A=>{const T=()=>{if(Dn.get(A)===T){if(Dn.delete(A),la(A.props)){const _=O(A.el)||s;b(A,_,A.anchor),wi(A,!0)}S(A)}};Dn.set(A,T),Ct(T,i)};if(e==null){const A=t.el=v(""),T=t.anchor=v("");if(f(A,s,n),f(T,s,n),Ag(t.props)||i&&i.pendingBranch){k(t);return}x&&(b(t,s,T),wi(t,!0)),S()}else{t.el=e.el;const A=t.anchor=e.anchor,T=Dn.get(e);if(T){T.flags|=8,Dn.delete(e),k(t);return}t.targetStart=e.targetStart;const _=t.target=e.target,N=t.targetAnchor=e.targetAnchor,E=la(e.props),I=E?s:_,B=E?A:N;if(l==="svg"||bd(_)?l="svg":(l==="mathml"||yd(_))&&(l="mathml"),g?(p(e.dynamicChildren,g,I,a,i,l,r),wc(e,t,!0)):o||u(e,t,I,B,a,i,l,r,!1),x)E?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):bl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const q=t.target=ko(t.props,m);q&&bl(t,q,null,c,0)}else E&&bl(t,_,N,c,1);wi(t,x)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!la(p),m=Dn.get(e);if(m&&(m.flags|=8,Dn.delete(e)),u&&(a(c),a(d)),i&&a(o),!m&&l&16)for(let v=0;v<r.length;v++){const C=r[v];n(C,t,s,f,!!C.dynamicChildren)}},move:bl,hydrate:Ig};function bl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Dn.has(e)&&(!u||la(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Ig(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(C,O){let x=O;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,C._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function f(C,O){O.anchor=u(l(C),O,r(C),s,n,a,i)}const m=t.target=ko(t.props,o),v=la(t.props);if(m){const C=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(f(e,t),p(m,C),t.targetAnchor||So(m,t,d,c,r(e)===m?e:null)):(t.anchor=l(e),p(m,C),t.targetAnchor||So(m,t,d,c),u(C&&l(C),t,m,s,n,a,i))),wi(t,v)}else v&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Og=Rg;function wi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function So(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[ef]=l,e&&(n(i,e,a),n(l,e,a)),l}const As=Symbol("_leaveCb"),hi=Symbol("_enterCb");function pc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return We(()=>{e.isMounted=!0}),Rr(()=>{e.isUnmounting=!0}),e}const Es=[Function,Array],fc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Es,onEnter:Es,onAfterEnter:Es,onEnterCancelled:Es,onBeforeLeave:Es,onLeave:Es,onAfterLeave:Es,onLeaveCancelled:Es,onBeforeAppear:Es,onAppear:Es,onAfterAppear:Es,onAppearCancelled:Es},sf=e=>{const t=e.subTree;return t.component?sf(t.component):t},Lg={name:"BaseTransition",props:fc,setup(e,{slots:t}){const s=os(),n=pc();return()=>{const a=t.default&&Cr(t.default(),!0),i=a&&a.length?nf(a):s.subTree?Uf():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return Wr(i);const o=xd(i);if(!o)return Wr(i);let c=Ya(o,l,n,s,u=>c=u);o.type!==Tt&&An(o,c);let d=s.subTree&&xd(s.subTree);if(d&&d.type!==Tt&&!Bs(d,o)&&sf(s).type!==Tt){let u=Ya(d,l,n,s);if(An(d,u),r==="out-in"&&o.type!==Tt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Wr(i);r==="in-out"&&o.type!==Tt?u.delayLeave=(p,f,m)=>{const v=lf(n,d);v[String(d.key)]=d,p[As]=()=>{f(),p[As]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function nf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Tt){t=s;break}}return t}const af=Lg;function lf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Ya(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:C,onAppear:O,onAfterAppear:x,onAppearCancelled:g}=t,b=String(e.key),S=lf(s,e),k=(_,N)=>{_&&ks(_,n,9,N)},A=(_,N)=>{const E=N[1];k(_,N),Ae(_)?_.every(I=>I.length<=1)&&E():_.length<=1&&E()},T={mode:l,persisted:r,beforeEnter(_){let N=o;if(!s.isMounted)if(i)N=C||o;else return;_[As]&&_[As](!0);const E=S[b];E&&Bs(e,E)&&E.el[As]&&E.el[As](),k(N,[_])},enter(_){if(S[b]===e)return;let N=c,E=d,I=u;if(!s.isMounted)if(i)N=O||c,E=x||d,I=g||u;else return;let B=!1;_[hi]=oe=>{B||(B=!0,oe?k(I,[_]):k(E,[_]),T.delayedLeave&&T.delayedLeave(),_[hi]=void 0)};const q=_[hi].bind(null,!1);N?A(N,[_,q]):q()},leave(_,N){const E=String(e.key);if(_[hi]&&_[hi](!0),s.isUnmounting)return N();k(p,[_]);let I=!1;_[As]=q=>{I||(I=!0,N(),q?k(v,[_]):k(m,[_]),_[As]=void 0,S[E]===e&&delete S[E])};const B=_[As].bind(null,!1);S[E]=e,f?A(f,[_,B]):B()},clone(_){const N=Ya(_,t,s,n,a);return a&&a(N),N}};return T}function Wr(e){if(rl(e))return e=nn(e),e.children=null,e}function xd(e){if(!rl(e))return tf(e.type)&&e.children?nf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function An(e,t){e.shapeFlag&6&&e.component?(e.transition=t,An(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Cr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Ft?(l.patchFlag&128&&a++,n=n.concat(Cr(l.children,t,r))):(t||l.type!==Tt)&&n.push(r!=null?nn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function ll(e,t){return Fe(e)?Ve({name:e.name},t,{setup:e}):e}function Ng(){const e=os();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function hc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Pg(e){const t=os(),s=oc(null);if(t){const a=t.refs===qe?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function _d(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Vl=new WeakMap;function qa(e,t,s,n,a=!1){if(Ae(e)){e.forEach((v,C)=>qa(v,t&&(Ae(t)?t[C]:t),s,n,a));return}if(kn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&qa(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ol(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===qe?r.refs={}:r.refs,u=r.setupState,p=Je(u),f=u===qe?$a:v=>_d(d,v)?!1:st(p,v),m=(v,C)=>!(C&&_d(d,C));if(c!=null&&c!==o){if(wd(t),Be(c))d[c]=null,f(c)&&(u[c]=null);else if(Rt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(o))ci(o,r,12,[l,d]);else{const v=Be(o),C=Rt(o);if(v||C){const O=()=>{if(e.f){const x=v?f(o)?u[o]:d[o]:m()||!e.k?o.value:d[e.k];if(a)Ae(x)&&tc(x,i);else if(Ae(x))x.includes(i)||x.push(i);else if(v)d[o]=[i],f(o)&&(u[o]=d[o]);else{const g=[i];m(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else v?(d[o]=l,f(o)&&(u[o]=l)):C&&(m(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{O(),Vl.delete(e)};x.id=-1,Vl.set(e,x),Ct(x,s)}else wd(e),O()}}}function wd(e){const t=Vl.get(e);t&&(t.flags|=8,Vl.delete(e))}let kd=!1;const Ra=()=>{kd||(console.error("Hydration completed but contains mismatches."),kd=!0)},Mg=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Dg=e=>e.namespaceURI.includes("MathML"),yl=e=>{if(e.nodeType===1){if(Mg(e))return"svg";if(Dg(e))return"mathml"}},Ba=e=>e.nodeType===8;function Fg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),jl(),b._vnode=g;return}u(b.firstChild,g,null,null,null),jl(),b._vnode=g},u=(g,b,S,k,A,T=!1)=>{T=T||!!b.dynamicChildren;const _=Ba(g)&&g.data==="[",N=()=>v(g,b,S,k,A,_),{type:E,ref:I,shapeFlag:B,patchFlag:q}=b;let oe=g.nodeType;b.el=g,q===-2&&(T=!1,b.dynamicChildren=null);let D=null;switch(E){case zn:oe!==3?b.children===""?(o(b.el=a(""),l(g),g),D=g):D=N():(g.data!==b.children&&(Ra(),g.data=b.children),D=i(g));break;case Tt:x(g)?(D=i(g),O(b.el=g.content.firstChild,g,S)):oe!==8||_?D=N():D=i(g);break;case pa:if(_&&(g=i(g),oe=g.nodeType),oe===1||oe===3){D=g;const M=!b.children.length;for(let P=0;P<b.staticCount;P++)M&&(b.children+=D.nodeType===1?D.outerHTML:D.data),P===b.staticCount-1&&(b.anchor=D),D=i(D);return _?i(D):D}else N();break;case Ft:_?D=m(g,b,S,k,A,T):D=N();break;default:if(B&1)(oe!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!x(g)?D=N():D=p(g,b,S,k,A,T);else if(B&6){b.slotScopeIds=A;const M=l(g);if(_?D=C(g):Ba(g)&&g.data==="teleport start"?D=C(g,g.data,"teleport end"):D=i(g),t(b,M,null,S,k,yl(M),T),kn(b)&&!b.type.__asyncResolved){let P;_?(P=mt(Ft),P.anchor=D?D.previousSibling:M.lastChild):P=g.nodeType===3?Sc(""):mt("div"),P.el=g,b.component.subTree=P}}else B&64?oe!==8?D=N():D=b.type.hydrate(g,b,S,k,A,T,e,f):B&128&&(D=b.type.hydrate(g,b,S,k,yl(l(g)),A,T,e,u))}return I!=null&&qa(I,null,k,b),D},p=(g,b,S,k,A,T)=>{T=T||!!b.dynamicChildren;const{type:_,props:N,patchFlag:E,shapeFlag:I,dirs:B,transition:q}=b,oe=_==="input"||_==="option";if(oe||E!==-1){B&&Xs(b,null,S,"created");let D=!1;if(x(g)){D=Of(null,q)&&S&&S.vnode.props&&S.vnode.props.appear;const P=g.content.firstChild;if(D){const U=P.getAttribute("class");U&&(P.$cls=U),q.beforeEnter(P)}O(P,g,S),b.el=g=P}if(I&16&&!(N&&(N.innerHTML||N.textContent))){let P=f(g.firstChild,b,g,S,k,A,T);for(P&&!xl(g,1)&&Ra();P;){const U=P;P=P.nextSibling,r(U)}}else if(I&8){let P=b.children;P[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(P=P.slice(1));const{textContent:U}=g;U!==P&&U!==P.replace(/\r\n|\r/g,`
`)&&(xl(g,0)||Ra(),g.textContent=b.children)}if(N){if(oe||!T||E&48){const P=g.tagName.includes("-");for(const U in N)(oe&&(U.endsWith("value")||U==="indeterminate")||ya(U)&&!_n(U)||U[0]==="."||P&&!_n(U))&&n(g,U,null,N[U],void 0,S)}else if(N.onClick)n(g,"onClick",null,N.onClick,void 0,S);else if(E&4&&wn(N.style))for(const P in N.style)N.style[P]}let M;(M=N&&N.onVnodeBeforeMount)&&ps(M,S,b),B&&Xs(b,null,S,"beforeMount"),((M=N&&N.onVnodeMounted)||B||D)&&Mf(()=>{M&&ps(M,S,b),D&&q.enter(g),B&&Xs(b,null,S,"mounted")},k)}return g.nextSibling},f=(g,b,S,k,A,T,_)=>{_=_||!!b.dynamicChildren;const N=b.children,E=N.length;let I=!1;for(let B=0;B<E;B++){const q=_?N[B]:N[B]=hs(N[B]),oe=q.type===zn;g?(oe&&!_&&B+1<E&&hs(N[B+1]).type===zn&&(o(a(g.data.slice(q.children.length)),S,i(g)),g.data=q.children),g=u(g,q,k,A,T,_)):oe&&!q.children?o(q.el=a(""),S):(I||(I=!0,xl(S,1)||Ra()),s(null,q,S,null,k,A,yl(S),T))}return g},m=(g,b,S,k,A,T)=>{const{slotScopeIds:_}=b;_&&(A=A?A.concat(_):_);const N=l(g),E=f(i(g),b,N,S,k,A,T);return E&&Ba(E)&&E.data==="]"?i(b.anchor=E):(Ra(),o(b.anchor=c("]"),N,E),E)},v=(g,b,S,k,A,T)=>{if(xl(g.parentElement,1)||Ra(),b.el=null,T){const E=C(g);for(;;){const I=i(g);if(I&&I!==E)r(I);else break}}const _=i(g),N=l(g);return r(g),s(null,b,N,_,S,k,yl(N),A),S&&(S.vnode.el=b.el,Or(S,b.el)),_},C=(g,b="[",S="]")=>{let k=0;for(;g;)if(g=i(g),g&&Ba(g)&&(g.data===b&&k++,g.data===S)){if(k===0)return i(g);k--}return g},O=(g,b,S)=>{const k=b.parentNode;k&&k.replaceChild(g,b);let A=S;for(;A;)A.vnode.el===b&&(A.vnode.el=A.subTree.el=g),A=A.parent},x=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Sd="data-allow-mismatch",$g={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function xl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Sd);)e=e.parentElement;const s=e&&e.getAttribute(Sd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes($g[t])}}const Bg=yr().requestIdleCallback||(e=>setTimeout(e,1)),Ug=yr().cancelIdleCallback||(e=>clearTimeout(e)),Hg=(e=1e4)=>t=>{const s=Bg(t,{timeout:e});return()=>Ug(s)};function zg(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const jg=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(zg(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Vg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},qg=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Gg(e,t){if(Ba(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ba(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const kn=e=>!!e.type.__asyncLoader;function Kg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),o)return new Promise((C,O)=>{o(v,()=>C(p()),()=>O(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return ll({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,v,C){let O=!1;(v.bu||(v.bu=[])).push(()=>O=!0);const x=()=>{O||C()},g=i?()=>{const b=i(x,S=>Gg(m,S));b&&(v.bum||(v.bum=[])).push(b)}:x;d?g():f().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Ht;if(hc(m),d)return()=>_l(d,m);const v=S=>{c=null,wa(S,m,13,!n)};if(r&&m.suspense||va)return f().then(S=>()=>_l(S,m)).catch(S=>(v(S),()=>n?mt(n,{error:S}):null));const C=h(!1),O=h(),x=h(!!a);let g,b;return vt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(x.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!C.value&&!O.value){const S=new Error(`Async component timed out after ${l}ms.`);v(S),O.value=S}},l)),f().then(()=>{m.isUnmounted||(C.value=!0,m.parent&&rl(m.parent.vnode)&&m.parent.update())}).catch(S=>{if(m.isUnmounted){c=null;return}v(S),O.value=S}),()=>{if(C.value&&d)return _l(d,m);if(O.value&&n)return mt(n,{error:O.value});if(s&&!x.value)return _l(s,m)}}})}function _l(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=mt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const rl=e=>e.type.__isKeepAlive,Wg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=os(),n=s.ctx;if(!n.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(x,g,b,S,k)=>{const A=x.component;c(x,g,b,0,r),o(A.vnode,x,g,b,A,r,S,x.slotScopeIds,k),Ct(()=>{A.isDeactivated=!1,A.a&&ja(A.a);const T=x.props&&x.props.onVnodeMounted;T&&ps(T,A.parent,x)},r)},n.deactivate=x=>{const g=x.component;Gl(g.m),Gl(g.a),c(x,p,null,1,r),Ct(()=>{g.da&&ja(g.da);const b=x.props&&x.props.onVnodeUnmounted;b&&ps(b,g.parent,x),g.isDeactivated=!0},r)};function f(x){Zr(x),d(x,s,r,!0)}function m(x){a.forEach((g,b)=>{const S=No(kn(g)?g.type.__asyncResolved||{}:g.type);S&&!x(S)&&v(b)})}function v(x){const g=a.get(x);g&&(!l||!Bs(g,l))?f(g):l&&Zr(l),a.delete(x),i.delete(x)}rs(()=>[e.include,e.exclude],([x,g])=>{x&&m(b=>ki(x,b)),g&&m(b=>!ki(g,b))},{flush:"post",deep:!0});let C=null;const O=()=>{C!=null&&(Kl(s.subTree.type)?Ct(()=>{a.set(C,wl(s.subTree))},s.subTree.suspense):a.set(C,wl(s.subTree)))};return We(O),Ar(O),Rr(()=>{a.forEach(x=>{const{subTree:g,suspense:b}=s,S=wl(g);if(x.type===S.type&&x.key===S.key){Zr(S);const k=S.component.da;k&&Ct(k,b);return}f(x)})}),()=>{if(C=null,!t.default)return l=null;const x=t.default(),g=x[0];if(x.length>1)return l=null,x;if(!Rn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=wl(g);if(b.type===Tt)return l=null,b;const S=b.type,k=No(kn(b)?b.type.__asyncResolved||{}:S),{include:A,exclude:T,max:_}=e;if(A&&(!k||!ki(A,k))||T&&k&&ki(T,k))return b.shapeFlag&=-257,l=b,g;const N=b.key==null?S:b.key,E=a.get(N);return b.el&&(b=nn(b),g.shapeFlag&128&&(g.ssContent=b)),C=N,E?(b.el=E.el,b.component=E.component,b.transition&&An(b,b.transition),b.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),_&&i.size>parseInt(_,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,Kl(g.type)?g:b}}},Zg=Wg;function ki(e,t){return Ae(e)?e.some(s=>ki(s,t)):Be(e)?e.split(",").includes(t):iv(e)?(e.lastIndex=0,e.test(t)):!1}function bs(e,t){rf(e,"a",t)}function ds(e,t){rf(e,"da",t)}function rf(e,t,s=Ht){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Er(t,n,s),s){let a=s.parent;for(;a&&a.parent;)rl(a.parent.vnode)&&Jg(n,t,s,a),a=a.parent}}function Jg(e,t,s,n){const a=Er(t,e,n,!0);vt(()=>{tc(n[t],a)},s)}function Zr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function wl(e){return e.shapeFlag&128?e.ssContent:e}function Er(e,t,s=Ht,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Cn();const r=di(s),o=ks(t,s,e,l);return r(),En(),o});return n?a.unshift(i):a.push(i),i}}const In=e=>(t,s=Ht)=>{(!va||e==="sp")&&Er(e,(...n)=>t(...n),s)},of=In("bm"),We=In("m"),mc=In("bu"),Ar=In("u"),Rr=In("bum"),vt=In("um"),cf=In("sp"),df=In("rtg"),uf=In("rtc");function pf(e,t=Ht){Er("ec",e,t)}const vc="components",Yg="directives";function Qg(e,t){return gc(vc,e,!0,t)||e}const ff=Symbol.for("v-ndc");function Xg(e){return Be(e)?gc(vc,e,!1)||e:e||ff}function eb(e){return gc(Yg,e)}function gc(e,t,s=!0,n=!1){const a=zt||Ht;if(a){const i=a.type;if(e===vc){const r=No(i,!1);if(r&&(r===t||r===rt(t)||r===_a(rt(t))))return i}const l=Td(a[e]||i[e],t)||Td(a.appContext[e],t);return!l&&n?i:l}}function Td(e,t){return e&&(e[t]||e[rt(t)]||e[_a(rt(t))])}function tb(e,t,s,n){let a;const i=s&&s[n],l=Ae(e);if(l||Be(e)){const r=l&&wn(e);let o=!1,c=!1;r&&(o=!gs(e),c=sn(e),e=wr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Ja(zs(e[d])):zs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(tt(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function sb(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ae(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function nb(e,t,s={},n,a){if(zt.ce||zt.parent&&kn(zt.parent)&&zt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Gi(),Wl(Ft,null,[mt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Gi();const l=i&&bc(i(s)),r=s.key||l&&l.key,o=Wl(Ft,{key:(r&&!Xt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function bc(e){return e.some(t=>Rn(t)?!(t.type===Tt||t.type===Ft&&!bc(t.children)):!0)?e:null}function ab(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:za(n)]=e[n];return s}const To=e=>e?jf(e)?ol(e):To(e.parent):null,Ii=Ve(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>To(e.parent),$root:e=>To(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>yc(e),$forceUpdate:e=>e.f||(e.f=()=>{dc(e.update)}),$nextTick:e=>e.n||(e.n=Et.bind(e.proxy)),$watch:e=>Eg.bind(e)}),Jr=(e,t)=>e!==qe&&!e.__isScriptSetup&&st(e,t),Co={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Jr(n,t))return l[t]=1,n[t];if(a!==qe&&st(a,t))return l[t]=2,a[t];if(st(i,t))return l[t]=3,i[t];if(s!==qe&&st(s,t))return l[t]=4,s[t];Eo&&(l[t]=0)}}const c=Ii[t];let d,u;if(c)return t==="$attrs"&&Zt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==qe&&st(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,st(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Jr(a,t)?(a[t]=s,!0):n!==qe&&st(n,t)?(n[t]=s,!0):st(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==qe&&r[0]!=="$"&&st(e,r)||Jr(t,r)||st(i,r)||st(n,r)||st(Ii,r)||st(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:st(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},ib=Ve({},Co,{get(e,t){if(t!==Symbol.unscopables)return Co.get(e,t,e)},has(e,t){return t[0]!=="_"&&!pv(t)}});function lb(){return null}function rb(){return null}function ob(e){}function cb(e){}function db(){return null}function ub(){}function pb(e,t){return null}function fb(){return hf().slots}function hb(){return hf().attrs}function hf(e){const t=os();return t.setupContext||(t.setupContext=Kf(t))}function Vi(e){return Ae(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function mb(e,t){const s=Vi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ae(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function vb(e,t){return!e||!t?e||t:Ae(e)&&Ae(t)?e.concat(t):Ve({},Vi(e),Vi(t))}function gb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function bb(e){const t=os(),s=va;let n=e();Wi(),s&&Ka(!1);const a=()=>{di(t),s&&Ka(!0)},i=()=>{os()!==t&&t.scope.off(),Wi(),s&&Ka(!1)};return sc(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Eo=!0;function yb(e){const t=yc(e),s=e.proxy,n=e.ctx;Eo=!1,t.beforeCreate&&Cd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:v,deactivated:C,beforeDestroy:O,beforeUnmount:x,destroyed:g,unmounted:b,render:S,renderTracked:k,renderTriggered:A,errorCaptured:T,serverPrefetch:_,expose:N,inheritAttrs:E,components:I,directives:B,filters:q}=t;if(c&&xb(c,n,null),l)for(const M in l){const P=l[M];Fe(P)&&(n[M]=P.bind(s))}if(a){const M=a.call(s,s);tt(M)&&(e.data=qn(M))}if(Eo=!0,i)for(const M in i){const P=i[M],U=Fe(P)?P.bind(s,s):Fe(P.get)?P.get.bind(s,s):jt,K=!Fe(P)&&Fe(P.set)?P.set.bind(s):jt,G=X({get:U,set:K});Object.defineProperty(n,M,{enumerable:!0,configurable:!0,get:()=>G.value,set:Y=>G.value=Y})}if(r)for(const M in r)mf(r[M],n,s,M);if(o){const M=Fe(o)?o.call(s):o;Reflect.ownKeys(M).forEach(P=>{Ri(P,M[P])})}d&&Cd(d,e,"c");function D(M,P){Ae(P)?P.forEach(U=>M(U.bind(s))):P&&M(P.bind(s))}if(D(of,u),D(We,p),D(mc,f),D(Ar,m),D(bs,v),D(ds,C),D(pf,T),D(uf,k),D(df,A),D(Rr,x),D(vt,b),D(cf,_),Ae(N))if(N.length){const M=e.exposed||(e.exposed={});N.forEach(P=>{Object.defineProperty(M,P,{get:()=>s[P],set:U=>s[P]=U,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===jt&&(e.render=S),E!=null&&(e.inheritAttrs=E),I&&(e.components=I),B&&(e.directives=B),_&&hc(e)}function xb(e,t,s=jt){Ae(e)&&(e=Ao(e));for(const n in e){const a=e[n];let i;tt(a)?"default"in a?i=Ls(a.from||n,a.default,!0):i=Ls(a.from||n):i=Ls(a),Rt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Cd(e,t,s){ks(Ae(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function mf(e,t,s,n){let a=n.includes(".")?Xp(s,n):()=>s[n];if(Be(e)){const i=t[e];Fe(i)&&rs(a,i)}else if(Fe(e))rs(a,e.bind(s));else if(tt(e))if(Ae(e))e.forEach(i=>mf(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&rs(a,i,e)}}function yc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>ql(o,c,l,!0)),ql(o,t,l)),tt(t)&&i.set(t,o),o}function ql(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&ql(e,i,s,!0),a&&a.forEach(l=>ql(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=_b[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const _b={data:Ed,props:Ad,emits:Ad,methods:Si,computed:Si,beforeCreate:ss,created:ss,beforeMount:ss,mounted:ss,beforeUpdate:ss,updated:ss,beforeDestroy:ss,beforeUnmount:ss,destroyed:ss,unmounted:ss,activated:ss,deactivated:ss,errorCaptured:ss,serverPrefetch:ss,components:Si,directives:Si,watch:kb,provide:Ed,inject:wb};function Ed(e,t){return t?e?function(){return Ve(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function wb(e,t){return Si(Ao(e),Ao(t))}function Ao(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ss(e,t){return e?[...new Set([].concat(e,t))]:t}function Si(e,t){return e?Ve(Object.create(null),e,t):t}function Ad(e,t){return e?Ae(e)&&Ae(t)?[...new Set([...e,...t])]:Ve(Object.create(null),Vi(e),Vi(t??{})):t}function kb(e,t){if(!e)return t;if(!t)return e;const s=Ve(Object.create(null),e);for(const n in t)s[n]=ss(e[n],t[n]);return s}function vf(){return{app:null,config:{isNativeTag:$a,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Sb=0;function Tb(e,t){return function(n,a=null){Fe(n)||(n=Ve({},n)),a!=null&&!tt(a)&&(a=null);const i=vf(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:Sb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Zf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const f=c._ceVNode||mt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),o=!0,c._container=d,d.__vue_app__=c,ol(f.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ks(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ua;ua=c;try{return d()}finally{ua=u}}};return c}}let ua=null;function Cb(e,t,s=qe){const n=os(),a=rt(t),i=ms(t),l=gf(e,a),r=zp((o,c)=>{let d,u=qe,p;return Qp(()=>{const f=e[a];Dt(d,f)&&(d=f,c())}),{get(){return o(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!Dt(m,d)&&!(u!==qe&&Dt(f,u)))return;const v=n.vnode.props,C=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));C||(d=f,c()),n.emit(`update:${t}`,m),Dt(f,u)&&(Dt(f,m)&&!Dt(m,p)||C&&u!==qe&&!Dt(m,d))&&c(),u=f,p=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||qe:r,done:!1}:{done:!0}}}},r}const gf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${rt(t)}Modifiers`]||e[`${ms(t)}Modifiers`];function Eb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||qe;let a=s;const i=t.startsWith("update:"),l=i&&gf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Be(d)?d.trim():d)),l.number&&(a=s.map(br)));let r,o=n[r=za(t)]||n[r=za(rt(t))];!o&&i&&(o=n[r=za(ms(t))]),o&&ks(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ks(c,e,6,a)}}const Ab=new WeakMap;function bf(e,t,s=!1){const n=s?Ab:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Fe(e)){const o=c=>{const d=bf(c,t,!0);d&&(r=!0,Ve(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(tt(e)&&n.set(e,null),null):(Ae(i)?i.forEach(o=>l[o]=null):Ve(l,i),tt(e)&&n.set(e,l),l)}function Ir(e,t){return!e||!ya(t)?!1:(t=t.slice(2).replace(/Once$/,""),st(e,t[0].toLowerCase()+t.slice(1))||st(e,ms(t))||st(e,t))}function Ol(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:v}=e,C=ji(e);let O,x;try{if(s.shapeFlag&4){const b=a||n,S=b;O=hs(c.call(S,b,d,u,f,p,m)),x=r}else{const b=t;O=hs(b.length>1?b(u,{attrs:r,slots:l,emit:o}):b(u,null)),x=t.props?r:Ib(r)}}catch(b){Oi.length=0,wa(b,e,1),O=mt(Tt)}let g=O;if(x&&v!==!1){const b=Object.keys(x),{shapeFlag:S}=g;b.length&&S&7&&(i&&b.some(hr)&&(x=Ob(x,i)),g=nn(g,x,!1,!0))}return s.dirs&&(g=nn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&An(g,s.transition),O=g,ji(C),O}function Rb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Rn(a)){if(a.type!==Tt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Ib=e=>{let t;for(const s in e)(s==="class"||s==="style"||ya(s))&&((t||(t={}))[s]=e[s]);return t},Ob=(e,t)=>{const s={};for(const n in e)(!hr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Lb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?Rd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(yf(l,n,p)&&!Ir(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?Rd(n,l,c):!0:!!l;return!1}function Rd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(yf(t,e,i)&&!Ir(s,i))return!0}return!1}function yf(e,t,s){const n=e[s],a=t[s];return s==="style"&&tt(n)&&tt(a)?!Tn(n,a):n!==a}function Or({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const xf={},_f=()=>Object.create(xf),wf=e=>Object.getPrototypeOf(e)===xf;function Nb(e,t,s,n=!1){const a={},i=_f();e.propsDefaults=Object.create(null),kf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:rc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Pb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ir(e.emitsOptions,p))continue;const f=t[p];if(o)if(st(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=rt(p);a[m]=Ro(o,r,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{kf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!st(t,u)&&((d=ms(u))===u||!st(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Ro(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!st(t,u))&&(delete i[u],c=!0)}c&&vn(e.attrs,"set","")}function kf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(_n(o))continue;const c=t[o];let d;a&&st(a,d=rt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Ir(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||qe;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Ro(a,o,u,c[u],e,!st(c,u))}}return l}function Ro(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=st(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=di(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===ms(s))&&(n=!0))}return n}const Mb=new WeakMap;function Sf(e,t,s=!1){const n=s?Mb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Fe(e)){const d=u=>{o=!0;const[p,f]=Sf(u,t,!0);Ve(l,p),f&&r.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return tt(e)&&n.set(e,Ua),Ua;if(Ae(i))for(let d=0;d<i.length;d++){const u=rt(i[d]);Id(u)&&(l[u]=qe)}else if(i)for(const d in i){const u=rt(d);if(Id(u)){const p=i[d],f=l[u]=Ae(p)||Fe(p)?{type:p}:Ve({},p),m=f.type;let v=!1,C=!0;if(Ae(m))for(let O=0;O<m.length;++O){const x=m[O],g=Fe(x)&&x.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(C=!1)}else v=Fe(m)&&m.name==="Boolean";f[0]=v,f[1]=C,(v||st(f,"default"))&&r.push(u)}}const c=[l,r];return tt(e)&&n.set(e,c),c}function Id(e){return e[0]!=="$"&&!_n(e)}const xc=e=>e==="_"||e==="_ctx"||e==="$stable",_c=e=>Ae(e)?e.map(hs):[hs(e)],Db=(e,t,s)=>{if(t._n)return t;const n=uc((...a)=>_c(t(...a)),s);return n._c=!1,n},Tf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(xc(a))continue;const i=e[a];if(Fe(i))t[a]=Db(a,i,n);else if(i!=null){const l=_c(i);t[a]=()=>l}}},Cf=(e,t)=>{const s=_c(t);e.slots.default=()=>s},Ef=(e,t,s)=>{for(const n in t)(s||!xc(n))&&(e[n]=t[n])},Fb=(e,t,s)=>{const n=e.slots=_f();if(e.vnode.shapeFlag&32){const a=t._;a?(Ef(n,t,s),s&&bp(n,"_",a,!0)):Tf(t,n)}else t&&Cf(e,t)},$b=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=qe;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Ef(a,t,s):(i=!t.$stable,Tf(t,a)),l=t}else t&&(Cf(e,t),l={default:1});if(i)for(const r in a)!xc(r)&&l[r]==null&&delete a[r]},Ct=Mf;function Af(e){return If(e)}function Rf(e){return If(e,Fg)}function If(e,t){const s=yr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=jt,insertStaticContent:m}=e,v=(y,L,$,ae=null,te=null,ne=null,he=void 0,de=null,pe=!!L.dynamicChildren)=>{if(y===L)return;y&&!Bs(y,L)&&(ae=J(y),Y(y,te,ne,!0),y=null),L.patchFlag===-2&&(pe=!1,L.dynamicChildren=null);const{type:le,ref:ke,shapeFlag:ye}=L;switch(le){case zn:C(y,L,$,ae);break;case Tt:O(y,L,$,ae);break;case pa:y==null&&x(L,$,ae,he);break;case Ft:I(y,L,$,ae,te,ne,he,de,pe);break;default:ye&1?S(y,L,$,ae,te,ne,he,de,pe):ye&6?B(y,L,$,ae,te,ne,he,de,pe):(ye&64||ye&128)&&le.process(y,L,$,ae,te,ne,he,de,pe,re)}ke!=null&&te?qa(ke,y&&y.ref,ne,L||y,!L):ke==null&&y&&y.ref!=null&&qa(y.ref,null,ne,y,!0)},C=(y,L,$,ae)=>{if(y==null)n(L.el=r(L.children),$,ae);else{const te=L.el=y.el;L.children!==y.children&&c(te,L.children)}},O=(y,L,$,ae)=>{y==null?n(L.el=o(L.children||""),$,ae):L.el=y.el},x=(y,L,$,ae)=>{[y.el,y.anchor]=m(y.children,L,$,ae,y.el,y.anchor)},g=({el:y,anchor:L},$,ae)=>{let te;for(;y&&y!==L;)te=p(y),n(y,$,ae),y=te;n(L,$,ae)},b=({el:y,anchor:L})=>{let $;for(;y&&y!==L;)$=p(y),a(y),y=$;a(L)},S=(y,L,$,ae,te,ne,he,de,pe)=>{if(L.type==="svg"?he="svg":L.type==="math"&&(he="mathml"),y==null)k(L,$,ae,te,ne,he,de,pe);else{const le=y.el&&y.el._isVueCE?y.el:null;try{le&&le._beginPatch(),_(y,L,te,ne,he,de,pe)}finally{le&&le._endPatch()}}},k=(y,L,$,ae,te,ne,he,de)=>{let pe,le;const{props:ke,shapeFlag:ye,transition:_e,dirs:ce}=y;if(pe=y.el=l(y.type,ne,ke&&ke.is,ke),ye&8?d(pe,y.children):ye&16&&T(y.children,pe,null,ae,te,Yr(y,ne),he,de),ce&&Xs(y,null,ae,"created"),A(pe,y,y.scopeId,he,ae),ke){for(const ve in ke)ve!=="value"&&!_n(ve)&&i(pe,ve,null,ke[ve],ne,ae);"value"in ke&&i(pe,"value",null,ke.value,ne),(le=ke.onVnodeBeforeMount)&&ps(le,ae,y)}ce&&Xs(y,null,ae,"beforeMount");const z=Of(te,_e);z&&_e.beforeEnter(pe),n(pe,L,$),((le=ke&&ke.onVnodeMounted)||z||ce)&&Ct(()=>{try{le&&ps(le,ae,y),z&&_e.enter(pe),ce&&Xs(y,null,ae,"mounted")}finally{}},te)},A=(y,L,$,ae,te)=>{if($&&f(y,$),ae)for(let ne=0;ne<ae.length;ne++)f(y,ae[ne]);if(te){let ne=te.subTree;if(L===ne||Kl(ne.type)&&(ne.ssContent===L||ne.ssFallback===L)){const he=te.vnode;A(y,he,he.scopeId,he.slotScopeIds,te.parent)}}},T=(y,L,$,ae,te,ne,he,de,pe=0)=>{for(let le=pe;le<y.length;le++){const ke=y[le]=de?hn(y[le]):hs(y[le]);v(null,ke,L,$,ae,te,ne,he,de)}},_=(y,L,$,ae,te,ne,he)=>{const de=L.el=y.el;let{patchFlag:pe,dynamicChildren:le,dirs:ke}=L;pe|=y.patchFlag&16;const ye=y.props||qe,_e=L.props||qe;let ce;if($&&ta($,!1),(ce=_e.onVnodeBeforeUpdate)&&ps(ce,$,L,y),ke&&Xs(L,y,$,"beforeUpdate"),$&&ta($,!0),(ye.innerHTML&&_e.innerHTML==null||ye.textContent&&_e.textContent==null)&&d(de,""),le?N(y.dynamicChildren,le,de,$,ae,Yr(L,te),ne):he||P(y,L,de,null,$,ae,Yr(L,te),ne,!1),pe>0){if(pe&16)E(de,ye,_e,$,te);else if(pe&2&&ye.class!==_e.class&&i(de,"class",null,_e.class,te),pe&4&&i(de,"style",ye.style,_e.style,te),pe&8){const z=L.dynamicProps;for(let ve=0;ve<z.length;ve++){const Te=z[ve],Oe=ye[Te],Pe=_e[Te];(Pe!==Oe||Te==="value")&&i(de,Te,Oe,Pe,te,$)}}pe&1&&y.children!==L.children&&d(de,L.children)}else!he&&le==null&&E(de,ye,_e,$,te);((ce=_e.onVnodeUpdated)||ke)&&Ct(()=>{ce&&ps(ce,$,L,y),ke&&Xs(L,y,$,"updated")},ae)},N=(y,L,$,ae,te,ne,he)=>{for(let de=0;de<L.length;de++){const pe=y[de],le=L[de],ke=pe.el&&(pe.type===Ft||!Bs(pe,le)||pe.shapeFlag&198)?u(pe.el):$;v(pe,le,ke,null,ae,te,ne,he,!0)}},E=(y,L,$,ae,te)=>{if(L!==$){if(L!==qe)for(const ne in L)!_n(ne)&&!(ne in $)&&i(y,ne,L[ne],null,te,ae);for(const ne in $){if(_n(ne))continue;const he=$[ne],de=L[ne];he!==de&&ne!=="value"&&i(y,ne,de,he,te,ae)}"value"in $&&i(y,"value",L.value,$.value,te)}},I=(y,L,$,ae,te,ne,he,de,pe)=>{const le=L.el=y?y.el:r(""),ke=L.anchor=y?y.anchor:r("");let{patchFlag:ye,dynamicChildren:_e,slotScopeIds:ce}=L;ce&&(de=de?de.concat(ce):ce),y==null?(n(le,$,ae),n(ke,$,ae),T(L.children||[],$,ke,te,ne,he,de,pe)):ye>0&&ye&64&&_e&&y.dynamicChildren&&y.dynamicChildren.length===_e.length?(N(y.dynamicChildren,_e,$,te,ne,he,de),(L.key!=null||te&&L===te.subTree)&&wc(y,L,!0)):P(y,L,$,ke,te,ne,he,de,pe)},B=(y,L,$,ae,te,ne,he,de,pe)=>{L.slotScopeIds=de,y==null?L.shapeFlag&512?te.ctx.activate(L,$,ae,he,pe):q(L,$,ae,te,ne,he,pe):oe(y,L,pe)},q=(y,L,$,ae,te,ne,he)=>{const de=y.component=zf(y,ae,te);if(rl(y)&&(de.ctx.renderer=re),Vf(de,!1,he),de.asyncDep){if(te&&te.registerDep(de,D,he),!y.el){const pe=de.subTree=mt(Tt);O(null,pe,L,$),y.placeholder=pe.el}}else D(de,y,L,$,te,ne,he)},oe=(y,L,$)=>{const ae=L.component=y.component;if(Lb(y,L,$))if(ae.asyncDep&&!ae.asyncResolved){M(ae,L,$);return}else ae.next=L,ae.update();else L.el=y.el,ae.vnode=L},D=(y,L,$,ae,te,ne,he)=>{const de=()=>{if(y.isMounted){let{next:ye,bu:_e,u:ce,parent:z,vnode:ve}=y;{const lt=Lf(y);if(lt){ye&&(ye.el=ve.el,M(y,ye,he)),lt.asyncDep.then(()=>{Ct(()=>{y.isUnmounted||le()},te)});return}}let Te=ye,Oe;ta(y,!1),ye?(ye.el=ve.el,M(y,ye,he)):ye=ve,_e&&ja(_e),(Oe=ye.props&&ye.props.onVnodeBeforeUpdate)&&ps(Oe,z,ye,ve),ta(y,!0);const Pe=Ol(y),ot=y.subTree;y.subTree=Pe,v(ot,Pe,u(ot.el),J(ot),y,te,ne),ye.el=Pe.el,Te===null&&Or(y,Pe.el),ce&&Ct(ce,te),(Oe=ye.props&&ye.props.onVnodeUpdated)&&Ct(()=>ps(Oe,z,ye,ve),te)}else{let ye;const{el:_e,props:ce}=L,{bm:z,m:ve,parent:Te,root:Oe,type:Pe}=y,ot=kn(L);if(ta(y,!1),z&&ja(z),!ot&&(ye=ce&&ce.onVnodeBeforeMount)&&ps(ye,Te,L),ta(y,!0),_e&&Le){const lt=()=>{y.subTree=Ol(y),Le(_e,y.subTree,y,te,null)};ot&&Pe.__asyncHydrate?Pe.__asyncHydrate(_e,y,lt):lt()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(Pe,y.parent?y.parent.type:void 0);const lt=y.subTree=Ol(y);v(null,lt,$,ae,y,te,ne),L.el=lt.el}if(ve&&Ct(ve,te),!ot&&(ye=ce&&ce.onVnodeMounted)){const lt=L;Ct(()=>ps(ye,Te,lt),te)}(L.shapeFlag&256||Te&&kn(Te.vnode)&&Te.vnode.shapeFlag&256)&&y.a&&Ct(y.a,te),y.isMounted=!0,L=$=ae=null}};y.scope.on();const pe=y.effect=new $i(de);y.scope.off();const le=y.update=pe.run.bind(pe),ke=y.job=pe.runIfDirty.bind(pe);ke.i=y,ke.id=y.uid,pe.scheduler=()=>dc(ke),ta(y,!0),le()},M=(y,L,$)=>{L.component=y;const ae=y.vnode.props;y.vnode=L,y.next=null,Pb(y,L.props,ae,$),$b(y,L.children,$),Cn(),gd(y),En()},P=(y,L,$,ae,te,ne,he,de,pe=!1)=>{const le=y&&y.children,ke=y?y.shapeFlag:0,ye=L.children,{patchFlag:_e,shapeFlag:ce}=L;if(_e>0){if(_e&128){K(le,ye,$,ae,te,ne,he,de,pe);return}else if(_e&256){U(le,ye,$,ae,te,ne,he,de,pe);return}}ce&8?(ke&16&&De(le,te,ne),ye!==le&&d($,ye)):ke&16?ce&16?K(le,ye,$,ae,te,ne,he,de,pe):De(le,te,ne,!0):(ke&8&&d($,""),ce&16&&T(ye,$,ae,te,ne,he,de,pe))},U=(y,L,$,ae,te,ne,he,de,pe)=>{y=y||Ua,L=L||Ua;const le=y.length,ke=L.length,ye=Math.min(le,ke);let _e;for(_e=0;_e<ye;_e++){const ce=L[_e]=pe?hn(L[_e]):hs(L[_e]);v(y[_e],ce,$,null,te,ne,he,de,pe)}le>ke?De(y,te,ne,!0,!1,ye):T(L,$,ae,te,ne,he,de,pe,ye)},K=(y,L,$,ae,te,ne,he,de,pe)=>{let le=0;const ke=L.length;let ye=y.length-1,_e=ke-1;for(;le<=ye&&le<=_e;){const ce=y[le],z=L[le]=pe?hn(L[le]):hs(L[le]);if(Bs(ce,z))v(ce,z,$,null,te,ne,he,de,pe);else break;le++}for(;le<=ye&&le<=_e;){const ce=y[ye],z=L[_e]=pe?hn(L[_e]):hs(L[_e]);if(Bs(ce,z))v(ce,z,$,null,te,ne,he,de,pe);else break;ye--,_e--}if(le>ye){if(le<=_e){const ce=_e+1,z=ce<ke?L[ce].el:ae;for(;le<=_e;)v(null,L[le]=pe?hn(L[le]):hs(L[le]),$,z,te,ne,he,de,pe),le++}}else if(le>_e)for(;le<=ye;)Y(y[le],te,ne,!0),le++;else{const ce=le,z=le,ve=new Map;for(le=z;le<=_e;le++){const we=L[le]=pe?hn(L[le]):hs(L[le]);we.key!=null&&ve.set(we.key,le)}let Te,Oe=0;const Pe=_e-z+1;let ot=!1,lt=0;const Mt=new Array(Pe);for(le=0;le<Pe;le++)Mt[le]=0;for(le=ce;le<=ye;le++){const we=y[le];if(Oe>=Pe){Y(we,te,ne,!0);continue}let Ce;if(we.key!=null)Ce=ve.get(we.key);else for(Te=z;Te<=_e;Te++)if(Mt[Te-z]===0&&Bs(we,L[Te])){Ce=Te;break}Ce===void 0?Y(we,te,ne,!0):(Mt[Ce-z]=le+1,Ce>=lt?lt=Ce:ot=!0,v(we,L[Ce],$,null,te,ne,he,de,pe),Oe++)}const se=ot?Bb(Mt):Ua;for(Te=se.length-1,le=Pe-1;le>=0;le--){const we=z+le,Ce=L[we],Ue=L[we+1],gt=we+1<ke?Ue.el||Nf(Ue):ae;Mt[le]===0?v(null,Ce,$,gt,te,ne,he,de,pe):ot&&(Te<0||le!==se[Te]?G(Ce,$,gt,2):Te--)}}},G=(y,L,$,ae,te=null)=>{const{el:ne,type:he,transition:de,children:pe,shapeFlag:le}=y;if(le&6){G(y.component.subTree,L,$,ae);return}if(le&128){y.suspense.move(L,$,ae);return}if(le&64){he.move(y,L,$,re);return}if(he===Ft){n(ne,L,$);for(let ye=0;ye<pe.length;ye++)G(pe[ye],L,$,ae);n(y.anchor,L,$);return}if(he===pa){g(y,L,$);return}if(ae!==2&&le&1&&de)if(ae===0)de.persisted&&!ne[As]?n(ne,L,$):(de.beforeEnter(ne),n(ne,L,$),Ct(()=>de.enter(ne),te));else{const{leave:ye,delayLeave:_e,afterLeave:ce}=de,z=()=>{y.ctx.isUnmounted?a(ne):n(ne,L,$)},ve=()=>{const Te=ne._isLeaving||!!ne[As];ne._isLeaving&&ne[As](!0),de.persisted&&!Te?z():ye(ne,()=>{z(),ce&&ce()})};_e?_e(ne,z,ve):ve()}else n(ne,L,$)},Y=(y,L,$,ae=!1,te=!1)=>{const{type:ne,props:he,ref:de,children:pe,dynamicChildren:le,shapeFlag:ke,patchFlag:ye,dirs:_e,cacheIndex:ce,memo:z}=y;if(ye===-2&&(te=!1),de!=null&&(Cn(),qa(de,null,$,y,!0),En()),ce!=null&&(L.renderCache[ce]=void 0),ke&256){L.ctx.deactivate(y);return}const ve=ke&1&&_e,Te=!kn(y);let Oe;if(Te&&(Oe=he&&he.onVnodeBeforeUnmount)&&ps(Oe,L,y),ke&6)fe(y.component,$,ae);else{if(ke&128){y.suspense.unmount($,ae);return}ve&&Xs(y,null,L,"beforeUnmount"),ke&64?y.type.remove(y,L,$,re,ae):le&&!le.hasOnce&&(ne!==Ft||ye>0&&ye&64)?De(le,L,$,!1,!0):(ne===Ft&&ye&384||!te&&ke&16)&&De(pe,L,$),ae&&ie(y)}const Pe=z!=null&&ce==null;(Te&&(Oe=he&&he.onVnodeUnmounted)||ve||Pe)&&Ct(()=>{Oe&&ps(Oe,L,y),ve&&Xs(y,null,L,"unmounted"),Pe&&(y.el=null)},$)},ie=y=>{const{type:L,el:$,anchor:ae,transition:te}=y;if(L===Ft){Q($,ae);return}if(L===pa){b(y);return}const ne=()=>{a($),te&&!te.persisted&&te.afterLeave&&te.afterLeave()};if(y.shapeFlag&1&&te&&!te.persisted){const{leave:he,delayLeave:de}=te,pe=()=>he($,ne);de?de(y.el,ne,pe):pe()}else ne()},Q=(y,L)=>{let $;for(;y!==L;)$=p(y),a(y),y=$;a(L)},fe=(y,L,$)=>{const{bum:ae,scope:te,job:ne,subTree:he,um:de,m:pe,a:le}=y;Gl(pe),Gl(le),ae&&ja(ae),te.stop(),ne&&(ne.flags|=8,Y(he,y,L,$)),de&&Ct(de,L),Ct(()=>{y.isUnmounted=!0},L)},De=(y,L,$,ae=!1,te=!1,ne=0)=>{for(let he=ne;he<y.length;he++)Y(y[he],L,$,ae,te)},J=y=>{if(y.shapeFlag&6)return J(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const L=p(y.anchor||y.el),$=L&&L[ef];return $?p($):L};let be=!1;const H=(y,L,$)=>{let ae;y==null?L._vnode&&(Y(L._vnode,null,null,!0),ae=L._vnode.component):v(L._vnode||null,y,L,null,null,null,$),L._vnode=y,be||(be=!0,gd(ae),jl(),be=!1)},re={p:v,um:Y,m:G,r:ie,mt:q,mc:T,pc:P,pbc:N,n:J,o:e};let ue,Le;return t&&([ue,Le]=t(re)),{render:H,hydrate:ue,createApp:Tb(H,ue)}}function Yr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ta({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Of(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function wc(e,t,s=!1){const n=e.children,a=t.children;if(Ae(n)&&Ae(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=hn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&wc(l,r)),r.type===zn&&(r.patchFlag===-1&&(r=a[i]=hn(r)),r.el=l.el),r.type===Tt&&!r.el&&(r.el=l.el)}}function Bb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Lf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Lf(t)}function Gl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Nf(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Nf(t.subTree):null}const Kl=e=>e.__isSuspense;let Io=0;const Ub={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)zb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}jb(e,t,s,n,a,l,r,o,c)}},hydrate:Vb,normalize:qb},Hb=Ub;function qi(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function zb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=Pf(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(qi(e,"onPending"),qi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ga(p,e.ssFallback)):p.resolve(!1,!0)}function jb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:C,isHydrating:O}=u;if(v)u.pendingBranch=p,Bs(v,p)?(o(v,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():C&&(O||(o(m,f,s,n,a,null,i,l,r),Ga(u,f)))):(u.pendingId=Io++,O?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),C?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(m,f,s,n,a,null,i,l,r),Ga(u,f))):m&&Bs(m,p)?(o(m,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(m&&Bs(m,p))o(m,p,s,n,a,u,i,l,r),Ga(u,p);else if(qi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Io++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:g}=u;x>0?setTimeout(()=>{u.pendingId===g&&u.fallback(f)},x):x===0&&u.fallback(f)}}function Pf(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:v,remove:C}}=c;let O;const x=Gb(e);x&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const g=e.props?$l(e.props.timeout):void 0,b=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Io++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,A=!1){const{vnode:T,activeBranch:_,pendingBranch:N,pendingId:E,effects:I,parentComponent:B,container:q,isInFallback:oe}=S;let D=!1;if(S.isHydrating)S.isHydrating=!1;else if(!k){D=_&&N.transition&&N.transition.mode==="out-in";let U=!1;D&&(_.transition.afterLeave=()=>{E===S.pendingId&&(p(N,q,i===b&&!U?m(_):i,0),Hi(I),oe&&T.ssFallback&&(T.ssFallback.el=null))}),_&&!S.isFallbackMountPending&&(v(_.el)===q&&(i=m(_),U=!0),f(_,B,S,!0),!D&&oe&&T.ssFallback&&Ct(()=>T.ssFallback.el=null,S)),D||p(N,q,i,0)}S.isFallbackMountPending=!1,Ga(S,N),S.pendingBranch=null,S.isInFallback=!1;let M=S.parent,P=!1;for(;M;){if(M.pendingBranch){M.effects.push(...I),P=!0;break}M=M.parent}!P&&!D&&Hi(I),S.effects=[],x&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),qi(T,"onResolve")},fallback(k){if(!S.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:_,container:N,namespace:E}=S;qi(A,"onFallback");const I=m(T),B=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,k,N,I,_,null,E,r,o),Ga(S,k))},q=k.transition&&k.transition.mode==="out-in";q&&(S.isFallbackMountPending=!0,T.transition.afterLeave=B),S.isInFallback=!0,f(T,_,null,!0),q||B()},move(k,A,T){S.activeBranch&&p(S.activeBranch,k,A,T),S.container=k},next(){return S.activeBranch&&m(S.activeBranch)},registerDep(k,A,T){const _=!!S.pendingBranch;_&&S.deps++;const N=k.vnode.el;k.asyncDep.catch(E=>{wa(E,k,0)}).then(E=>{if(k.isUnmounted||S.isUnmounted||S.pendingId!==k.suspenseId)return;Wi(),k.asyncResolved=!0;const{vnode:I}=k;Oo(k,E,!1),N&&(I.el=N);const B=!N&&k.subTree.el;A(k,I,v(N||k.subTree.el),N?null:m(k.subTree),S,l,T),B&&(I.placeholder=null,C(B)),Or(k,I.el),_&&--S.deps===0&&S.resolve()})},unmount(k,A){S.isUnmounted=!0,S.activeBranch&&f(S.activeBranch,s,k,A),S.pendingBranch&&f(S.pendingBranch,s,k,A)}};return S}function Vb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Pf(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function qb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Od(n?s.default:s),e.ssFallback=n?Od(s.fallback):mt(Tt)}function Od(e){let t;if(Fe(e)){const s=ma&&e._c;s&&(e._d=!1,Gi()),e=e(),s&&(e._d=!0,t=Jt,Df())}return Ae(e)&&(e=Rb(e)),e=hs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Mf(e,t){t&&t.pendingBranch?Ae(e)?t.effects.push(...e):t.effects.push(e):Hi(e)}function Ga(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Or(n,a))}function Gb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Ft=Symbol.for("v-fgt"),zn=Symbol.for("v-txt"),Tt=Symbol.for("v-cmt"),pa=Symbol.for("v-stc"),Oi=[];let Jt=null;function Gi(e=!1){Oi.push(Jt=e?null:[])}function Df(){Oi.pop(),Jt=Oi[Oi.length-1]||null}let ma=1;function Ki(e,t=!1){ma+=e,e<0&&Jt&&t&&(Jt.hasOnce=!0)}function Ff(e){return e.dynamicChildren=ma>0?Jt||Ua:null,Df(),ma>0&&Jt&&Jt.push(e),e}function Kb(e,t,s,n,a,i){return Ff(kc(e,t,s,n,a,i,!0))}function Wl(e,t,s,n,a){return Ff(mt(e,t,s,n,a,!0))}function Rn(e){return e?e.__v_isVNode===!0:!1}function Bs(e,t){return e.type===t.type&&e.key===t.key}function Wb(e){}const $f=({key:e})=>e??null,Ll=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Rt(e)||Fe(e)?{i:zt,r:e,k:t,f:!!s}:e:null);function kc(e,t=null,s=null,n=0,a=null,i=e===Ft?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&$f(t),ref:t&&Ll(t),scopeId:Tr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:zt};return r?(Tc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Be(s)?8:16),ma>0&&!l&&Jt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Jt.push(o),o}const mt=Zb;function Zb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===ff)&&(e=Tt),Rn(e)){const r=nn(e,t,!0);return s&&Tc(r,s),ma>0&&!i&&Jt&&(r.shapeFlag&6?Jt[Jt.indexOf(e)]=r:Jt.push(r)),r.patchFlag=-2,r}if(sy(e)&&(e=e.__vccOpts),t){t=Bf(t);let{class:r,style:o}=t;r&&!Be(r)&&(t.class=nl(r)),tt(o)&&(al(o)&&!Ae(o)&&(o=Ve({},o)),t.style=sl(o))}const l=Be(e)?1:Kl(e)?128:tf(e)?64:tt(e)?4:Fe(e)?2:0;return kc(e,t,s,n,a,l,i,!0)}function Bf(e){return e?al(e)||wf(e)?Ve({},e):e:null}function nn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Hf(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&$f(c),ref:t&&t.ref?s&&i?Ae(i)?i.concat(Ll(t)):[i,Ll(t)]:Ll(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Ft?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&nn(e.ssContent),ssFallback:e.ssFallback&&nn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&An(d,o.clone(d)),d}function Sc(e=" ",t=0){return mt(zn,null,e,t)}function Jb(e,t){const s=mt(pa,null,e);return s.staticCount=t,s}function Uf(e="",t=!1){return t?(Gi(),Wl(Tt,null,e)):mt(Tt,null,e)}function hs(e){return e==null||typeof e=="boolean"?mt(Tt):Ae(e)?mt(Ft,null,e.slice()):Rn(e)?hn(e):mt(zn,null,String(e))}function hn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:nn(e)}function Tc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ae(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Tc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!wf(t)?t._ctx=zt:a===3&&zt&&(zt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:zt},s=32):(t=String(t),n&64?(s=16,t=[Sc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Hf(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=nl([t.class,n.class]));else if(a==="style")t.style=sl([t.style,n.style]);else if(ya(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ae(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!hr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ps(e,t,s,n=null){ks(e,t,7,[s,n])}const Yb=vf();let Qb=0;function zf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Yb,i={uid:Qb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new nc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Sf(n,a),emitsOptions:bf(n,a),emit:null,emitted:null,propsDefaults:qe,inheritAttrs:n.inheritAttrs,ctx:qe,data:qe,props:qe,attrs:qe,slots:qe,refs:qe,setupState:qe,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Eb.bind(null,i),e.ce&&e.ce(i),i}let Ht=null;const os=()=>Ht||zt;let Zl,Ka;{const e=yr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Zl=t("__VUE_INSTANCE_SETTERS__",s=>Ht=s),Ka=t("__VUE_SSR_SETTERS__",s=>va=s)}const di=e=>{const t=Ht;return Zl(e),e.scope.on(),()=>{e.scope.off(),Zl(t)}},Wi=()=>{Ht&&Ht.scope.off(),Zl(null)};function jf(e){return e.vnode.shapeFlag&4}let va=!1;function Vf(e,t=!1,s=!1){t&&Ka(t);const{props:n,children:a}=e.vnode,i=jf(e);Nb(e,n,i,t),Fb(e,a,s||t);const l=i?Xb(e,t):void 0;return t&&Ka(!1),l}function Xb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Co);const{setup:n}=s;if(n){Cn();const a=e.setupContext=n.length>1?Kf(e):null,i=di(e),l=ci(n,e,0,[e.props,a]),r=sc(l);if(En(),i(),(r||e.sp)&&!kn(e)&&hc(e),r){if(l.then(Wi,Wi),t)return l.then(o=>{Oo(e,o,t)}).catch(o=>{wa(o,e,0)});e.asyncDep=l}else Oo(e,l,t)}else Gf(e,t)}function Oo(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:tt(t)&&(e.setupState=cc(t)),Gf(e,s)}let Jl,Lo;function qf(e){Jl=e,Lo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,ib))}}const ey=()=>!Jl;function Gf(e,t,s){const n=e.type;if(!e.render){if(!t&&Jl&&!n.render){const a=n.template||yc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Ve(Ve({isCustomElement:i,delimiters:r},l),o);n.render=Jl(a,c)}}e.render=n.render||jt,Lo&&Lo(e)}{const a=di(e);Cn();try{yb(e)}finally{En(),a()}}}const ty={get(e,t){return Zt(e,"get",""),e[t]}};function Kf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,ty),slots:e.slots,emit:e.emit,expose:t}}function ol(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(cc(Up(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ii)return Ii[s](e)},has(t,s){return s in t||s in Ii}})):e.proxy}function No(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function sy(e){return Fe(e)&&"__vccOpts"in e}const X=(e,t)=>og(e,t,va);function Qa(e,t,s){try{Ki(-1);const n=arguments.length;return n===2?tt(t)&&!Ae(t)?Rn(t)?mt(e,null,[t]):mt(e,t):mt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Rn(s)&&(s=[s]),mt(e,t,s))}finally{Ki(1)}}function ny(){}function ay(e,t,s,n){const a=s[n];if(a&&Wf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Wf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Dt(s[n],t[n]))return!1;return ma>0&&Jt&&Jt.push(e),!0}const Zf="3.5.38",iy=jt,ly=gg,ry=Ma,oy=Zp,cy={createComponentInstance:zf,setupComponent:Vf,renderComponentRoot:Ol,setCurrentRenderingInstance:ji,isVNode:Rn,normalizeVNode:hs,getComponentPublicInstance:ol,ensureValidVNode:bc,pushWarningContext:fg,popWarningContext:hg},dy=cy,uy=null,py=null,fy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Po;const Ld=typeof window<"u"&&window.trustedTypes;if(Ld)try{Po=Ld.createPolicy("vue",{createHTML:e=>e})}catch{}const Jf=Po?e=>Po.createHTML(e):e=>e,hy="http://www.w3.org/2000/svg",my="http://www.w3.org/1998/Math/MathML",fn=typeof document<"u"?document:null,Nd=fn&&fn.createElement("template"),Yf={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?fn.createElementNS(hy,e):t==="mathml"?fn.createElementNS(my,e):s?fn.createElement(e,{is:s}):fn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>fn.createTextNode(e),createComment:e=>fn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>fn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Nd.innerHTML=Jf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Nd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Nn="transition",mi="animation",Xa=Symbol("_vtc"),Qf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Xf=Ve({},fc,Qf),vy=e=>(e.displayName="Transition",e.props=Xf,e),gy=vy((e,{slots:t})=>Qa(af,eh(e),t)),sa=(e,t=[])=>{Ae(e)?e.forEach(s=>s(...t)):e&&e(...t)},Pd=e=>e?Ae(e)?e.some(t=>t.length>1):e.length>1:!1;function eh(e){const t={};for(const I in e)I in Qf||(t[I]=e[I]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=by(a),v=m&&m[0],C=m&&m[1],{onBeforeEnter:O,onEnter:x,onEnterCancelled:g,onLeave:b,onLeaveCancelled:S,onBeforeAppear:k=O,onAppear:A=x,onAppearCancelled:T=g}=t,_=(I,B,q,oe)=>{I._enterCancelled=oe,Fn(I,B?d:r),Fn(I,B?c:l),q&&q()},N=(I,B)=>{I._isLeaving=!1,Fn(I,u),Fn(I,f),Fn(I,p),B&&B()},E=I=>(B,q)=>{const oe=I?A:x,D=()=>_(B,I,q);sa(oe,[B,D]),Md(()=>{Fn(B,I?o:i),Zs(B,I?d:r),Pd(oe)||Dd(B,n,v,D)})};return Ve(t,{onBeforeEnter(I){sa(O,[I]),Zs(I,i),Zs(I,l)},onBeforeAppear(I){sa(k,[I]),Zs(I,o),Zs(I,c)},onEnter:E(!1),onAppear:E(!0),onLeave(I,B){I._isLeaving=!0;const q=()=>N(I,B);Zs(I,u),I._enterCancelled?(Zs(I,p),Mo(I)):(Mo(I),Zs(I,p)),Md(()=>{I._isLeaving&&(Fn(I,u),Zs(I,f),Pd(b)||Dd(I,n,C,q))}),sa(b,[I,q])},onEnterCancelled(I){_(I,!1,void 0,!0),sa(g,[I])},onAppearCancelled(I){_(I,!0,void 0,!0),sa(T,[I])},onLeaveCancelled(I){N(I),sa(S,[I])}})}function by(e){if(e==null)return null;if(tt(e))return[Qr(e.enter),Qr(e.leave)];{const t=Qr(e);return[t,t]}}function Qr(e){return $l(e)}function Zs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Xa]||(e[Xa]=new Set)).add(t)}function Fn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Xa];s&&(s.delete(t),s.size||(e[Xa]=void 0))}function Md(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let yy=0;function Dd(e,t,s,n){const a=e._endId=++yy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=th(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function th(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Nn}Delay`),i=n(`${Nn}Duration`),l=Fd(a,i),r=n(`${mi}Delay`),o=n(`${mi}Duration`),c=Fd(r,o);let d=null,u=0,p=0;t===Nn?l>0&&(d=Nn,u=l,p=i.length):t===mi?c>0&&(d=mi,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Nn:mi:null,p=d?d===Nn?i.length:o.length:0);const f=d===Nn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Nn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function Fd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>$d(s)+$d(e[n])))}function $d(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Mo(e){return(e?e.ownerDocument:document).body.offsetHeight}function xy(e,t,s){const n=e[Xa];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Yl=Symbol("_vod"),Cc=Symbol("_vsh"),sh={name:"show",beforeMount(e,{value:t},{transition:s}){e[Yl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):vi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),vi(e,!0),n.enter(e)):n.leave(e,()=>{vi(e,!1)}):vi(e,t))},beforeUnmount(e,{value:t}){vi(e,t)}};function vi(e,t){e.style.display=t?e[Yl]:"none",e[Cc]=!t}function _y(){sh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const nh=Symbol("");function wy(e){const t=os();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Ql(i,a))},n=()=>{const a=e(t.proxy);t.ce?Ql(t.ce,a):Do(t.subTree,a),s(a)};mc(()=>{Hi(n)}),We(()=>{rs(n,jt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),vt(()=>a.disconnect())})}function Do(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Do(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Ql(e.el,t);else if(e.type===Ft)e.children.forEach(s=>Do(s,t));else if(e.type===pa){let{el:s,anchor:n}=e;for(;s&&(Ql(s,t),s!==n);)s=s.nextSibling}}function Ql(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Av(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[nh]=n}}const ky=/(?:^|;)\s*display\s*:/;function Sy(e,t,s){const n=e.style,a=Be(s);let i=!1;if(s&&!a){if(t)if(Be(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&Ti(n,r,"")}else for(const l in t)s[l]==null&&Ti(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?Cy(e,l,!Be(t)&&t?t[l]:void 0,r)||Ti(n,l,r):Ti(n,l,"")}}else if(a){if(t!==s){const l=n[nh];l&&(s+=";"+l),n.cssText=s,i=ky.test(s)}}else t&&e.removeAttribute("style");Yl in e&&(e[Yl]=i?n.display:"",e[Cc]&&(n.display="none"))}const Bd=/\s*!important$/;function Ti(e,t,s){if(Ae(s))s.forEach(n=>Ti(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Ty(e,t);Bd.test(s)?e.setProperty(ms(n),s.replace(Bd,""),"important"):e[n]=s}}const Ud=["Webkit","Moz","ms"],Xr={};function Ty(e,t){const s=Xr[t];if(s)return s;let n=rt(t);if(n!=="filter"&&n in e)return Xr[t]=n;n=_a(n);for(let a=0;a<Ud.length;a++){const i=Ud[a]+n;if(i in e)return Xr[t]=i}return t}function Cy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(n)&&s===n}const Hd="http://www.w3.org/1999/xlink";function zd(e,t,s,n,a,i=Cv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Hd,t.slice(6,t.length)):e.setAttributeNS(Hd,t,s):s==null||i&&!xp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Xt(s)?String(s):s)}function jd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Jf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=xp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function bn(e,t,s,n){e.addEventListener(t,s,n)}function Ey(e,t,s,n){e.removeEventListener(t,s,n)}const Vd=Symbol("_vei");function Ay(e,t,s,n,a=null){const i=e[Vd]||(e[Vd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Ry(t);if(n){const c=i[t]=Ly(n,a);bn(e,r,c,o)}else l&&(Ey(e,r,l,o),i[t]=void 0)}}const qd=/(?:Once|Passive|Capture)$/;function Ry(e){let t;if(qd.test(e)){t={};let n;for(;n=e.match(qd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ms(e.slice(2)),t]}let eo=0;const Iy=Promise.resolve(),Oy=()=>eo||(Iy.then(()=>eo=0),eo=Date.now());function Ly(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ae(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ks(c,t,5,r)}}else ks(a,t,5,[n])};return s.value=e,s.attached=Oy(),s}const Gd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,ah=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?xy(e,n,l):t==="style"?Sy(e,s,n):ya(t)?hr(t)||Ay(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Ny(e,t,n,l))?(jd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&zd(e,t,n,l,i,t!=="value")):e._isVueCE&&(Py(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(n)))?jd(e,rt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),zd(e,t,n,l))};function Ny(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Gd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Gd(t)&&Be(s)?!1:t in e}function Py(e,t){const s=e._def.props;if(!s)return!1;const n=rt(t);return Array.isArray(s)?s.some(a=>rt(a)===n):Object.keys(s).some(a=>rt(a)===n)}const Kd={};function ih(e,t,s){let n=ll(e,t);mr(n)&&(n=Ve({},n,t));class a extends Lr{constructor(l){super(n,l,s)}}return a.def=n,a}const My=((e,t)=>ih(e,t,bh)),Dy=typeof HTMLElement<"u"?HTMLElement:class{};class Lr extends Dy{constructor(t,s={},n=tr){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==tr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ve({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Lr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Et(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!Ae(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=$l(this._props[o])),(r||(r=Object.create(null)))[rt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)st(this,n)||Object.defineProperty(this,n,{get:()=>tn(s[n])})}_resolveProps(t){const{props:s}=t,n=Ae(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(rt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Kd;const a=rt(t);s&&this._numberProps&&this._numberProps[a]&&(n=$l(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Kd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ms(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ms(t),s+""):s||this.removeAttribute(ms(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),gh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=mt(this._def,Ve(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,mr(l[0])?Ve({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),ms(i)!==i&&a(ms(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function lh(e){const t=os(),s=t&&t.ce;return s||null}function Fy(){const e=lh();return e&&e.shadowRoot}function $y(e="$style"){{const t=os();if(!t)return qe;const s=t.type.__cssModules;if(!s)return qe;const n=s[e];return n||qe}}const rh=new WeakMap,oh=new WeakMap,Xl=Symbol("_moveCb"),Wd=Symbol("_enterCb"),By=e=>(delete e.props.mode,e),Uy=By({name:"TransitionGroup",props:Ve({},Xf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=os(),n=pc();let a,i;return Ar(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!qy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(zy),a.forEach(jy);const r=a.filter(Vy);Mo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Zs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Xl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Xl]=null,Fn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=eh(l);let o=l.tag||Ft;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Cc]&&(a.push(d),An(d,Ya(d,r,n,s)),rh.set(d,ch(d.el)))}i=t.default?Cr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&An(d,Ya(d,r,n,s))}return mt(o,null,i)}}}),Hy=Uy;function zy(e){const t=e.el;t[Xl]&&t[Xl](),t[Wd]&&t[Wd]()}function jy(e){oh.set(e,ch(e.el))}function Vy(e){const t=rh.get(e),s=oh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function ch(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function qy(e,t,s){const n=e.cloneNode(),a=e[Xa];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=th(n);return i.removeChild(n),l}const Vn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ae(t)?s=>ja(t,s):t};function Gy(e){e.target.composing=!0}function Zd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ns=Symbol("_assign");function Jd(e,t,s){return t&&(e=e.trim()),s&&(e=br(e)),e}const er={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ns]=Vn(a);const i=n||a.props&&a.props.type==="number";bn(e,t?"change":"input",l=>{l.target.composing||e[Ns](Jd(e.value,s,i))}),(s||i)&&bn(e,"change",()=>{e.value=Jd(e.value,s,i)}),t||(bn(e,"compositionstart",Gy),bn(e,"compositionend",Zd),bn(e,"change",Zd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ns]=Vn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?br(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Ec={deep:!0,created(e,t,s){e[Ns]=Vn(s),bn(e,"change",()=>{const n=e._modelValue,a=ei(e),i=e.checked,l=e[Ns];if(Ae(n)){const r=xr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(xa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(uh(e,i))})},mounted:Yd,beforeUpdate(e,t,s){e[Ns]=Vn(s),Yd(e,t,s)}};function Yd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ae(t))a=xr(t,n.props.value)>-1;else if(xa(t))a=t.has(n.props.value);else{if(t===s)return;a=Tn(t,uh(e,!0))}e.checked!==a&&(e.checked=a)}const Ac={created(e,{value:t},s){e.checked=Tn(t,s.props.value),e[Ns]=Vn(s),bn(e,"change",()=>{e[Ns](ei(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ns]=Vn(n),t!==s&&(e.checked=Tn(t,n.props.value))}},dh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=xa(t);bn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?br(ei(l)):ei(l));e[Ns](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Et(()=>{e._assigning=!1})}),e[Ns]=Vn(n)},mounted(e,{value:t}){Qd(e,t)},beforeUpdate(e,t,s){e[Ns]=Vn(s)},updated(e,{value:t}){e._assigning||Qd(e,t)}};function Qd(e,t){const s=e.multiple,n=Ae(t);if(!(s&&!n&&!xa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=ei(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=xr(t,r)>-1}else l.selected=t.has(r);else if(Tn(ei(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ei(e){return"_value"in e?e._value:e.value}function uh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ph={created(e,t,s){kl(e,t,s,null,"created")},mounted(e,t,s){kl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){kl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){kl(e,t,s,n,"updated")}};function fh(e,t){switch(e){case"SELECT":return dh;case"TEXTAREA":return er;default:switch(t){case"checkbox":return Ec;case"radio":return Ac;default:return er}}}function kl(e,t,s,n,a){const l=fh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Ky(){er.getSSRProps=({value:e})=>({value:e}),Ac.getSSRProps=({value:e},t)=>{if(t.props&&Tn(t.props.value,e))return{checked:!0}},Ec.getSSRProps=({value:e},t)=>{if(Ae(e)){if(t.props&&xr(e,t.props.value)>-1)return{checked:!0}}else if(xa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ph.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=fh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Wy=["ctrl","shift","alt","meta"],Zy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Wy.some(s=>e[`${s}Key`]&&!t.includes(s))},Jy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Zy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Yy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Qy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=ms(a.key);if(t.some(l=>l===i||Yy[l]===i))return e(a)}))},hh=Ve({patchProp:ah},Yf);let Li,Xd=!1;function mh(){return Li||(Li=Af(hh))}function vh(){return Li=Xd?Li:Rf(hh),Xd=!0,Li}const gh=((...e)=>{mh().render(...e)}),Xy=((...e)=>{vh().hydrate(...e)}),tr=((...e)=>{const t=mh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=xh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,yh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),bh=((...e)=>{const t=vh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=xh(n);if(a)return s(a,!0,yh(a))},t});function yh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function xh(e){return Be(e)?document.querySelector(e):e}let eu=!1;const ex=()=>{eu||(eu=!0,Ky(),_y())},tx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:af,BaseTransitionPropsValidators:fc,Comment:Tt,DeprecationTypes:fy,EffectScope:nc,ErrorCodes:vg,ErrorTypeStrings:ly,Fragment:Ft,KeepAlive:Zg,ReactiveEffect:$i,Static:pa,Suspense:Hb,Teleport:Og,Text:zn,TrackOpTypes:cg,Transition:gy,TransitionGroup:Hy,TriggerOpTypes:dg,VueElement:Lr,assertNumber:mg,callWithAsyncErrorHandling:ks,callWithErrorHandling:ci,camelize:rt,capitalize:_a,cloneVNode:nn,compatUtils:py,computed:X,createApp:tr,createBlock:Wl,createCommentVNode:Uf,createElementBlock:Kb,createElementVNode:kc,createHydrationRenderer:Rf,createPropsRestProxy:gb,createRenderer:Af,createSSRApp:bh,createSlots:sb,createStaticVNode:Jb,createTextVNode:Sc,createVNode:mt,customRef:zp,defineAsyncComponent:Kg,defineComponent:ll,defineCustomElement:ih,defineEmits:rb,defineExpose:ob,defineModel:ub,defineOptions:cb,defineProps:lb,defineSSRCustomElement:My,defineSlots:db,devtools:ry,effect:Lv,effectScope:Rv,getCurrentInstance:os,getCurrentScope:Sp,getCurrentWatcher:ug,getTransitionRawChildren:Cr,guardReactiveProps:Bf,h:Qa,handleError:wa,hasInjectionContext:Sg,hydrate:Xy,hydrateOnIdle:Hg,hydrateOnInteraction:qg,hydrateOnMediaQuery:Vg,hydrateOnVisible:jg,initCustomFormatter:ny,initDirectivesForSSR:ex,inject:Ls,isMemoSame:Wf,isProxy:al,isReactive:wn,isReadonly:sn,isRef:Rt,isRuntimeOnly:ey,isShallow:gs,isVNode:Rn,markRaw:Up,mergeDefaults:mb,mergeModels:vb,mergeProps:Hf,nextTick:Et,nodeOps:Yf,normalizeClass:nl,normalizeProps:vv,normalizeStyle:sl,onActivated:bs,onBeforeMount:of,onBeforeUnmount:Rr,onBeforeUpdate:mc,onDeactivated:ds,onErrorCaptured:pf,onMounted:We,onRenderTracked:uf,onRenderTriggered:df,onScopeDispose:Iv,onServerPrefetch:cf,onUnmounted:vt,onUpdated:Ar,onWatcherCleanup:Vp,openBlock:Gi,patchProp:ah,popScopeId:_g,provide:Ri,proxyRefs:cc,pushScopeId:xg,queuePostFlushCb:Hi,reactive:qn,readonly:Ul,ref:h,registerRuntimeCompiler:qf,render:gh,renderList:tb,renderSlot:nb,resolveComponent:Qg,resolveDirective:eb,resolveDynamicComponent:Xg,resolveFilter:uy,resolveTransitionHooks:Ya,setBlockTracking:Ki,setDevtoolsHook:oy,setTransitionHooks:An,shallowReactive:rc,shallowReadonly:Yv,shallowRef:oc,ssrContextKey:Jp,ssrUtils:dy,stop:Nv,toDisplayString:wp,toHandlerKey:za,toHandlers:ab,toRaw:Je,toRef:lg,toRefs:ng,toValue:eg,transformVNodeArgs:Wb,triggerRef:Xv,unref:tn,useAttrs:hb,useCssModule:$y,useCssVars:wy,useHost:lh,useId:Ng,useModel:Cb,useSSRContext:Yp,useShadowRoot:Fy,useSlots:fb,useTemplateRef:Pg,useTransitionState:pc,vModelCheckbox:Ec,vModelDynamic:ph,vModelRadio:Ac,vModelSelect:dh,vModelText:er,vShow:sh,version:Zf,warn:iy,watch:rs,watchEffect:Tg,watchPostEffect:Cg,watchSyncEffect:Qp,withAsyncContext:bb,withCtx:uc,withDefaults:pb,withDirectives:kg,withKeys:Qy,withMemo:ay,withModifiers:Jy,withScopeId:wg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Zi=Symbol(""),Ni=Symbol(""),Rc=Symbol(""),sr=Symbol(""),_h=Symbol(""),ga=Symbol(""),wh=Symbol(""),kh=Symbol(""),Ic=Symbol(""),Oc=Symbol(""),cl=Symbol(""),Lc=Symbol(""),Sh=Symbol(""),Nc=Symbol(""),Pc=Symbol(""),Mc=Symbol(""),Dc=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Th=Symbol(""),Ch=Symbol(""),Nr=Symbol(""),nr=Symbol(""),Bc=Symbol(""),Uc=Symbol(""),Ji=Symbol(""),dl=Symbol(""),Hc=Symbol(""),Fo=Symbol(""),sx=Symbol(""),$o=Symbol(""),ar=Symbol(""),nx=Symbol(""),ax=Symbol(""),zc=Symbol(""),ix=Symbol(""),lx=Symbol(""),jc=Symbol(""),Eh=Symbol(""),ti={[Zi]:"Fragment",[Ni]:"Teleport",[Rc]:"Suspense",[sr]:"KeepAlive",[_h]:"BaseTransition",[ga]:"openBlock",[wh]:"createBlock",[kh]:"createElementBlock",[Ic]:"createVNode",[Oc]:"createElementVNode",[cl]:"createCommentVNode",[Lc]:"createTextVNode",[Sh]:"createStaticVNode",[Nc]:"resolveComponent",[Pc]:"resolveDynamicComponent",[Mc]:"resolveDirective",[Dc]:"resolveFilter",[Fc]:"withDirectives",[$c]:"renderList",[Th]:"renderSlot",[Ch]:"createSlots",[Nr]:"toDisplayString",[nr]:"mergeProps",[Bc]:"normalizeClass",[Uc]:"normalizeStyle",[Ji]:"normalizeProps",[dl]:"guardReactiveProps",[Hc]:"toHandlers",[Fo]:"camelize",[sx]:"capitalize",[$o]:"toHandlerKey",[ar]:"setBlockTracking",[nx]:"pushScopeId",[ax]:"popScopeId",[zc]:"withCtx",[ix]:"unref",[lx]:"isRef",[jc]:"withMemo",[Eh]:"isMemoSame"};function rx(e){Object.getOwnPropertySymbols(e).forEach(t=>{ti[t]=e[t]})}const Ts={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ox(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ts}}function Yi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=Ts){return e&&(r?(e.helper(ga),e.helper(ai(e.inSSR,c))):e.helper(ni(e.inSSR,c)),l&&e.helper(Fc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function fa(e,t=Ts){return{type:17,loc:t,elements:e}}function Os(e,t=Ts){return{type:15,loc:t,properties:e}}function At(e,t){return{type:16,loc:Ts,key:Be(e)?ze(e,!0):e,value:t}}function ze(e,t=!1,s=Ts,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Hs(e,t=Ts){return{type:8,loc:t,children:e}}function Pt(e,t=[],s=Ts){return{type:14,loc:s,callee:e,arguments:t}}function si(e,t=void 0,s=!1,n=!1,a=Ts){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Bo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ts}}function cx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ts}}function dx(e){return{type:21,body:e,loc:Ts}}function ni(e,t){return e||t?Ic:Oc}function ai(e,t){return e||t?wh:kh}function Vc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ni(n,e.isComponent)),t(ga),t(ai(n,e.isComponent)))}const tu=new Uint8Array([123,123]),su=new Uint8Array([125,125]);function nu(e){return e>=97&&e<=122||e>=65&&e<=90}function _s(e){return e===32||e===10||e===9||e===12||e===13}function Pn(e){return e===47||e===62||_s(e)}function ir(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Gt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class ux{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=tu,this.delimiterClose=su,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=tu,this.delimiterClose=su}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Pn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||_s(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Gt.TitleEnd||this.currentSequence===Gt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Gt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Gt.Cdata.length&&(this.state=28,this.currentSequence=Gt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Gt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):nu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Pn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Pn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ir("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){_s(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=nu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||_s(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):_s(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):_s(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Pn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Pn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Pn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Pn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Pn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):_s(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):_s(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){_s(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Gt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Gt.ScriptEnd[3]?this.startSpecial(Gt.ScriptEnd,4):t===Gt.StyleEnd[3]?this.startSpecial(Gt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Gt.TitleEnd[3]?this.startSpecial(Gt.TitleEnd,4):t===Gt.TextareaEnd[3]?this.startSpecial(Gt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Gt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function au(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ha(e,t){const s=au("MODE",t),n=au(e,t);return s===3?n===!0:n!==!1}function Qi(e,t,s,...n){return ha(e,t)}function qc(e){throw e}function Ah(e){}function ht(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const vs=e=>e.type===4&&e.isStatic;function Rh(e){switch(e){case"Teleport":case"teleport":return Ni;case"Suspense":case"suspense":return Rc;case"KeepAlive":case"keep-alive":return sr;case"BaseTransition":case"base-transition":return _h}}const px=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Gc=e=>!px.test(e),Ih=/[A-Za-z_$\xA0-\uFFFF]/,fx=/[\.\?\w$\xA0-\uFFFF]/,hx=/\s+[.[]\s*|\s*[.[]\s+/g,Oh=e=>e.type===4?e.content:e.loc.source,mx=e=>{const t=Oh(e).trim().replace(hx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Ih:fx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Lh=mx,vx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,gx=e=>vx.test(Oh(e)),bx=gx;function Is(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Be(t)?a.name===t:t.test(a.name)))return a}}function Pr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ra(i.arg,t))return i}}function ra(e,t){return!!(e&&vs(e)&&e.content===t)}function yx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function to(e){return e.type===5||e.type===2}function iu(e){return e.type===7&&e.name==="pre"}function xx(e){return e.type===7&&e.name==="slot"}function lr(e){return e.type===1&&e.tagType===3}function rr(e){return e.type===1&&e.tagType===2}const _x=new Set([Ji,dl]);function Nh(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&_x.has(s))return Nh(e.arguments[0],t.concat(e))}return[e,t]}function or(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Be(a)&&a.type===14){const r=Nh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Be(a))n=Os([t]);else if(a.type===14){const r=a.arguments[0];!Be(r)&&r.type===15?lu(t,r)||r.properties.unshift(t):a.callee===Hc?n=Pt(s.helper(nr),[Os([t]),a]):a.arguments.unshift(Os([t])),!n&&(n=a)}else a.type===15?(lu(t,a)||a.properties.unshift(t),n=a):(n=Pt(s.helper(nr),[Os([t]),a]),l&&l.callee===dl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function lu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Xi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function wx(e){return e.type===14&&e.callee===jc?e.arguments[1].returns:e}const kx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Ph(e){for(let t=0;t<e.length;t++)if(!_s(e.charCodeAt(t)))return!1;return!0}function Kc(e){return e.type===2&&Ph(e.content)||e.type===12&&Kc(e.content)}function Mh(e){return e.type===3||Kc(e)}const Dh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:$a,isPreTag:$a,isIgnoreNewlineTag:$a,isCustomElement:$a,onError:qc,onWarn:Ah,comments:!1,prefixIdentifiers:!1};let et=Dh,el=null,Sn="",Wt=null,Ke=null,us="",pn=-1,aa=-1,Wc=0,Un=!1,Uo=null;const ft=[],wt=new ux(ft,{onerr:cn,ontext(e,t){Sl(Ut(e,t),e,t)},ontextentity(e,t,s){Sl(e,t,s)},oninterpolation(e,t){if(Un)return Sl(Ut(e,t),e,t);let s=e+wt.delimiterOpen.length,n=t-wt.delimiterClose.length;for(;_s(Sn.charCodeAt(s));)s++;for(;_s(Sn.charCodeAt(n-1));)n--;let a=Ut(s,n);a.includes("&")&&(a=et.decodeEntities(a,!1)),Ho({type:5,content:Pl(a,!1,St(s,n)),loc:St(e,t)})},onopentagname(e,t){const s=Ut(e,t);Wt={type:1,tag:s,ns:et.getNamespace(s,ft[0],et.ns),tagType:0,props:[],children:[],loc:St(e-1,t),codegenNode:void 0}},onopentagend(e){ou(e)},onclosetag(e,t){const s=Ut(e,t);if(!et.isVoidTag(s)){let n=!1;for(let a=0;a<ft.length;a++)if(ft[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&cn(24,ft[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ft.shift();Nl(r,t,l<a)}break}n||cn(23,Fh(e,60))}},onselfclosingtag(e){const t=Wt.tag;Wt.isSelfClosing=!0,ou(e),ft[0]&&ft[0].tag===t&&Nl(ft.shift(),e)},onattribname(e,t){Ke={type:6,name:Ut(e,t),nameLoc:St(e,t),value:void 0,loc:St(e)}},ondirname(e,t){const s=Ut(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Un&&n===""&&cn(26,e),Un||n==="")Ke={type:6,name:s,nameLoc:St(e,t),value:void 0,loc:St(e)};else if(Ke={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[ze("prop")]:[],loc:St(e)},n==="pre"){Un=wt.inVPre=!0,Uo=Wt;const a=Wt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Nx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ut(e,t);if(Un&&!iu(Ke))Ke.name+=s,oa(Ke.nameLoc,t);else{const n=s[0]!=="[";Ke.arg=Pl(n?s:s.slice(1,-1),n,St(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ut(e,t);if(Un&&!iu(Ke))Ke.name+="."+s,oa(Ke.nameLoc,t);else if(Ke.name==="slot"){const n=Ke.arg;n&&(n.content+="."+s,oa(n.loc,t))}else{const n=ze(s,!0,St(e,t));Ke.modifiers.push(n)}},onattribdata(e,t){us+=Ut(e,t),pn<0&&(pn=e),aa=t},onattribentity(e,t,s){us+=e,pn<0&&(pn=t),aa=s},onattribnameend(e){const t=Ke.loc.start.offset,s=Ut(t,e);Ke.type===7&&(Ke.rawName=s),Wt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&cn(2,t)},onattribend(e,t){if(Wt&&Ke){if(oa(Ke.loc,t),e!==0)if(us.includes("&")&&(us=et.decodeEntities(us,!0)),Ke.type===6)Ke.name==="class"&&(us=Bh(us).trim()),e===1&&!us&&cn(13,t),Ke.value={type:2,content:us,loc:e===1?St(pn,aa):St(pn-1,aa+1)},wt.inSFCRoot&&Wt.tag==="template"&&Ke.name==="lang"&&us&&us!=="html"&&wt.enterRCDATA(ir("</template"),0);else{let s=0;Ke.exp=Pl(us,!1,St(pn,aa),0,s),Ke.name==="for"&&(Ke.forParseResult=Tx(Ke.exp));let n=-1;Ke.name==="bind"&&(n=Ke.modifiers.findIndex(a=>a.content==="sync"))>-1&&Qi("COMPILER_V_BIND_SYNC",et,Ke.loc,Ke.arg.loc.source)&&(Ke.name="model",Ke.modifiers.splice(n,1))}(Ke.type!==7||Ke.name!=="pre")&&Wt.props.push(Ke)}us="",pn=aa=-1},oncomment(e,t){et.comments&&Ho({type:3,content:Ut(e,t),loc:St(e-4,t+3)})},onend(){const e=Sn.length;for(let t=0;t<ft.length;t++)Nl(ft[t],e-1),cn(24,ft[t].loc.start.offset)},oncdata(e,t){(ft[0]?ft[0].ns:et.ns)!==0?Sl(Ut(e,t),e,t):cn(1,e-9)},onprocessinginstruction(e){(ft[0]?ft[0].ns:et.ns)===0&&cn(21,e-1)}}),ru=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Sx=/^\(|\)$/g;function Tx(e){const t=e.loc,s=e.content,n=s.match(kx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,v=m+u.length;return Pl(u,!1,St(m,v),0,f?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(Sx,"").trim();const c=a.indexOf(o),d=o.match(ru);if(d){o=o.replace(ru,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(r.index=l(f,s.indexOf(f,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ut(e,t){return Sn.slice(e,t)}function ou(e){wt.inSFCRoot&&(Wt.innerLoc=St(e+1,e+1)),Ho(Wt);const{tag:t,ns:s}=Wt;s===0&&et.isPreTag(t)&&Wc++,et.isVoidTag(t)?Nl(Wt,e):(ft.unshift(Wt),(s===1||s===2)&&(wt.inXML=!0)),Wt=null}function Sl(e,t,s){{const i=ft[0]&&ft[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=et.decodeEntities(e,!1))}const n=ft[0]||el,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,oa(a.loc,s)):n.children.push({type:2,content:e,loc:St(t,s)})}function Nl(e,t,s=!1){s?oa(e.loc,Fh(t,60)):oa(e.loc,Cx(t,62)+1),wt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ve({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ve({},e.innerLoc.start),e.innerLoc.source=Ut(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Un||(n==="slot"?e.tagType=2:cu(e)?e.tagType=3:Ax(e)&&(e.tagType=1)),wt.inRCDATA||(e.children=$h(i)),a===0&&et.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&et.isPreTag(n)&&Wc--,Uo===e&&(Un=wt.inVPre=!1,Uo=null),wt.inXML&&(ft[0]?ft[0].ns:et.ns)===0&&(wt.inXML=!1);{const l=e.props;if(!wt.inSFCRoot&&ha("COMPILER_NATIVE_TEMPLATE",et)&&e.tag==="template"&&!cu(e)){const o=ft[0]||el,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Qi("COMPILER_INLINE_TEMPLATE",et,r.loc)&&e.children.length&&(r.value={type:2,content:Ut(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function Cx(e,t){let s=e;for(;Sn.charCodeAt(s)!==t&&s<Sn.length-1;)s++;return s}function Fh(e,t){let s=e;for(;Sn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Ex=new Set(["if","else","else-if","for","slot"]);function cu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Ex.has(t[s].name))return!0}return!1}function Ax({tag:e,props:t}){if(et.isCustomElement(e))return!1;if(e==="component"||Rx(e.charCodeAt(0))||Rh(e)||et.isBuiltInComponent&&et.isBuiltInComponent(e)||et.isNativeTag&&!et.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Qi("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}}else if(n.name==="bind"&&ra(n.arg,"is")&&Qi("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}return!1}function Rx(e){return e>64&&e<91}const Ix=/\r\n/g;function $h(e){const t=et.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Wc)a.content=a.content.replace(Ix,`
`);else if(Ph(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Ox(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Bh(a.content))}return s?e.filter(Boolean):e}function Ox(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Bh(e){let t="",s=!1;for(let n=0;n<e.length;n++)_s(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Ho(e){(ft[0]||el).children.push(e)}function St(e,t){return{start:wt.getPos(e),end:t==null?t:wt.getPos(t),source:t==null?t:Ut(e,t)}}function Lx(e){return St(e.start.offset,e.end.offset)}function oa(e,t){e.end=wt.getPos(t),e.source=Ut(e.start.offset,t)}function Nx(e){const t={type:6,name:e.rawName,nameLoc:St(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Pl(e,t=!1,s,n=0,a=0){return ze(e,t,s,n)}function cn(e,t,s){et.onError(ht(e,St(t,t)))}function Px(){wt.reset(),Wt=null,Ke=null,us="",pn=-1,aa=-1,ft.length=0}function Mx(e,t){if(Px(),Sn=e,et=Ve({},Dh),t){let a;for(a in t)t[a]!=null&&(et[a]=t[a])}wt.mode=et.parseMode==="html"?1:et.parseMode==="sfc"?2:0,wt.inXML=et.ns===1||et.ns===2;const s=t&&t.delimiters;s&&(wt.delimiterOpen=ir(s[0]),wt.delimiterClose=ir(s[1]));const n=el=ox([],e);return wt.parse(Sn),n.loc=St(0,e.length),n.children=$h(n.children),el=null,n}function Dx(e,t){Ml(e,void 0,t,!!Uh(e))}function Uh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!rr(t[0])?t[0]:null}function Ml(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:ws(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&zh(u,s)>=2){const v=jh(u);v&&(f.props=s.hoist(v))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:ws(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ml(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Ml(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ml(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ae(e.codegenNode.children))e.codegenNode.children=o(fa(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ae(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(fa(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ae(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Is(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(fa(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ae(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ws(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=zh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ws(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ws(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ga),t.removeHelper(ai(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ni(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ws(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Be(r)||Xt(r))continue;const o=ws(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Fx=new Set([Bc,Uc,Ji,dl]);function Hh(e,t){if(e.type===14&&!Be(e.callee)&&Fx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ws(s,t);if(s.type===14)return Hh(s,t)}return 0}function zh(e,t){let s=3;const n=jh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ws(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ws(r,t):r.type===14?c=Hh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function jh(e){const t=e.codegenNode;if(t.type===13)return t.props}function $x(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=jt,isCustomElement:d=jt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:C="",bindingMetadata:O=qe,inline:x=!1,isTS:g=!1,onError:b=qc,onWarn:S=Ah,compatConfig:k}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&_a(rt(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:v,ssrCssVars:C,bindingMetadata:O,inline:x,isTS:g,onError:b,onWarn:S,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(_){const N=T.helpers.get(_)||0;return T.helpers.set(_,N+1),_},removeHelper(_){const N=T.helpers.get(_);if(N){const E=N-1;E?T.helpers.set(_,E):T.helpers.delete(_)}},helperString(_){return`_${ti[T.helper(_)]}`},replaceNode(_){T.parent.children[T.childIndex]=T.currentNode=_},removeNode(_){const N=T.parent.children,E=_?N.indexOf(_):T.currentNode?T.childIndex:-1;!_||_===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>E&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(E,1)},onNodeRemoved:jt,addIdentifiers(_){},removeIdentifiers(_){},hoist(_){Be(_)&&(_=ze(_)),T.hoists.push(_);const N=ze(`_hoisted_${T.hoists.length}`,!1,_.loc,2);return N.hoisted=_,N},cache(_,N=!1,E=!1){const I=cx(T.cached.length,_,N,E);return T.cached.push(I),I}};return T.filters=new Set,T}function Bx(e,t){const s=$x(e,t);Mr(e,s),t.hoistStatic&&Dx(e,s),t.ssr||Ux(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Ux(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Uh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Vc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Yi(t,s(Zi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Hx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Be(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Mr(a,t))}}function Mr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ae(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(cl);break;case 5:t.ssr||t.helper(Nr);break;case 9:for(let i=0;i<e.branches.length;i++)Mr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Hx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Vh(e,t){const s=Be(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(xx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Dr="/*@__PURE__*/",qh=e=>`${ti[e]}: _${ti[e]}`;function zx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ti[v]}`},push(v,C=-2,O){f.code+=v},indent(){m(++f.indentLevel)},deindent(v=!1){v?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(v){f.push(`
`+"  ".repeat(v),0)}return f}function jx(e,t={}){const s=zx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Vx(e,s);const v=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${O}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(qh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(so(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(so(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),so(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let x=0;x<e.temps;x++)a(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Yt(e.codegenNode,s):a("null"),f&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Vx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Ic,Oc,cl,Lc,Sh].filter(p=>d.includes(p)).map(qh).join(", ");a(`const { ${u} } = _Vue
`,-1)}qx(e.hoists,t),i(),a("return ")}function so(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Dc:t==="component"?Nc:Mc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Xi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function qx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Yt(i,t),n())}t.pure=!1}function Zc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),ul(e,t,s),s&&t.deindent(),t.push("]")}function ul(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Be(r)?a(r,-3):Ae(r)?Zc(r,t):Yt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Yt(e,t){if(Be(e)){t.push(e,-3);return}if(Xt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Yt(e.codegenNode,t);break;case 2:Gx(e,t);break;case 4:Gh(e,t);break;case 5:Kx(e,t);break;case 12:Yt(e.codegenNode,t);break;case 8:Kh(e,t);break;case 3:Zx(e,t);break;case 13:Jx(e,t);break;case 14:Qx(e,t);break;case 15:Xx(e,t);break;case 17:e0(e,t);break;case 18:t0(e,t);break;case 19:s0(e,t);break;case 20:n0(e,t);break;case 21:ul(e.body,t,!0,!1);break}}function Gx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Gh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Kx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Dr),s(`${n(Nr)}(`),Yt(e.content,t),s(")")}function Kh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Be(n)?t.push(n,-3):Yt(n,t)}}function Wx(e,t){const{push:s}=t;if(e.type===8)s("["),Kh(e,t),s("]");else if(e.isStatic){const n=Gc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Zx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Dr),s(`${n(cl)}(${JSON.stringify(e.content)})`,-3,e)}function Jx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;o&&(m=String(o)),d&&s(n(Fc)+"("),u&&s(`(${n(ga)}(${p?"true":""}), `),a&&s(Dr);const v=u?ai(t.inSSR,f):ni(t.inSSR,f);s(n(v)+"(",-2,e),ul(Yx([i,l,r,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Yt(d,t),s(")"))}function Yx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Qx(e,t){const{push:s,helper:n,pure:a}=t,i=Be(e.callee)?e.callee:n(e.callee);a&&s(Dr),s(i+"(",-2,e),ul(e.arguments,t),s(")")}function Xx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Wx(c,t),s(": "),Yt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function e0(e,t){Zc(e.elements,t)}function t0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${ti[zc]}(`),s("(",-2,e),Ae(i)?ul(i,t):i&&Yt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),Ae(l)?Zc(l,t):Yt(l,t)):r&&Yt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function s0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Gc(s.content);u&&l("("),Gh(s,t),u&&l(")")}else l("("),Yt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Yt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Yt(a,t),d||t.indentLevel--,i&&o(!0)}function n0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(ar)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Yt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(ar)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const a0=Vh(/^(?:if|else|else-if)$/,(e,t,s)=>i0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=uu(a,o,s);else{const c=l0(n.codegenNode);c.alternate=uu(a,o+n.branches.length-1,s)}}}));function i0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ht(28,t.loc)),t.exp=ze("true",!1,a)}if(t.name==="if"){const a=du(e,t),i={type:9,loc:Lx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Mh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ht(30,e.loc)),s.removeNode();const r=du(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Mr(r,s),o&&o(),s.currentNode=null}else s.onError(ht(30,e.loc));break}}}function du(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Is(e,"for")?e.children:[e],userKey:Pr(e,"key"),isTemplateIf:s}}function uu(e,t,s){return e.condition?Bo(e.condition,pu(e,t,s),Pt(s.helper(cl),['""',"true"])):pu(e,t,s)}function pu(e,t,s){const{helper:n}=s,a=At("key",ze(`${t}`,!1,Ts,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return or(o,a,s),o}else return Yi(s,n(Zi),Os([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=wx(o);return c.type===13&&Vc(c,s),or(c,a,s),o}}function l0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const r0=Vh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return o0(e,t,s,i=>{const l=Pt(n($c),[i.source]),r=lr(e),o=Is(e,"memo"),c=Pr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?ze(c.value.content,!0):void 0:c.exp);const u=d?At("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Yi(s,n(Zi),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,C=v.length!==1||v[0].type!==1,O=rr(e)?e:r&&e.children.length===1&&rr(e.children[0])?e.children[0]:null;if(O?(m=O.codegenNode,r&&u&&or(m,u,s)):C?m=Yi(s,n(Zi),u?Os([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,r&&u&&or(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ga),a(ai(s.inSSR,m.isComponent))):a(ni(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ga),n(ai(s.inSSR,m.isComponent))):n(ni(s.inSSR,m.isComponent))),o){const x=si(zo(i.parseResult,[ze("_cached")]));x.body=dx([Hs(["const _memo = (",o.exp,")"]),Hs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Eh)}(_cached, _memo)) return _cached`]),Hs(["const _item = ",m]),ze("_item.memo = _memo"),ze("return _item")]),l.arguments.push(x,ze("_cache"),ze(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(si(zo(i.parseResult),m,!0))}})});function o0(e,t,s,n){if(!t.exp){s.onError(ht(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ht(32,t.loc));return}Wh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:lr(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const f=n&&n(p);return()=>{r.vFor--,f&&f()}}function Wh(e,t){e.finalized||(e.finalized=!0)}function zo({value:e,key:t,index:s},n=[]){return c0([e,t,s,...n])}function c0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||ze("_".repeat(n+1),!1))}const fu=ze("undefined",!1),d0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Is(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},u0=(e,t,s,n)=>si(e,s,!1,!0,s.length?s[0].loc:n);function p0(e,t,s=u0){t.helper(zc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=Is(e,"slot",!0);if(o){const{arg:C,exp:O}=o;C&&!vs(C)&&(r=!0),i.push(At(C||ze("default",!0),s(O,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let C=0;C<n.length;C++){const O=n[C];let x;if(!lr(O)||!(x=Is(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(o){t.onError(ht(37,x.loc));break}c=!0;const{children:g,loc:b}=O,{arg:S=ze("default",!0),exp:k,loc:A}=x;let T;vs(S)?T=S?S.content:"default":r=!0;const _=Is(O,"for"),N=s(k,_,g,b);let E,I;if(E=Is(O,"if"))r=!0,l.push(Bo(E.exp,Tl(S,N,f++),fu));else if(I=Is(O,/^else(?:-if)?$/,!0)){let B=C,q;for(;B--&&(q=n[B],!!Mh(q)););if(q&&lr(q)&&Is(q,/^(?:else-)?if$/)){let oe=l[l.length-1];for(;oe.alternate.type===19;)oe=oe.alternate;oe.alternate=I.exp?Bo(I.exp,Tl(S,N,f++),fu):Tl(S,N,f++)}else t.onError(ht(30,I.loc))}else if(_){r=!0;const B=_.forParseResult;B?(Wh(B),l.push(Pt(t.helper($c),[B.source,si(zo(B),Tl(S,N),!0)]))):t.onError(ht(32,_.loc))}else{if(T){if(p.has(T)){t.onError(ht(38,A));continue}p.add(T),T==="default"&&(d=!0)}i.push(At(S,N))}}if(!o){const C=(O,x)=>{const g=s(O,void 0,x,a);return t.compatConfig&&(g.isNonScopedSlot=!0),At("default",g)};c?u.length&&!u.every(Kc)&&(d?t.onError(ht(39,u[0].loc)):i.push(C(void 0,u))):i.push(C(void 0,n))}const m=r?2:Dl(e.children)?3:1;let v=Os(i.concat(At("_",ze(m+"",!1))),a);return l.length&&(v=Pt(t.helper(Ch),[v,fa(l)])),{slots:v,hasDynamicSlots:r}}function Tl(e,t,s){const n=[At("name",e),At("fn",t)];return s!=null&&n.push(At("key",ze(String(s),!0))),Os(n)}function Dl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Dl(s.children))return!0;break;case 9:if(Dl(s.branches))return!0;break;case 10:case 11:if(Dl(s.children))return!0;break}}return!1}const Zh=new WeakMap,f0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?h0(e,t):`"${n}"`;const r=tt(l)&&l.callee===Pc;let o,c,d=0,u,p,f,m=r||l===Ni||l===Rc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=Jh(e,t,void 0,i,r);o=v.props,d=v.patchFlag,p=v.dynamicPropNames;const C=v.directives;f=C&&C.length?fa(C.map(O=>v0(O,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===sr&&(m=!0,d|=1024),i&&l!==Ni&&l!==sr){const{slots:C,hasDynamicSlots:O}=p0(e,t);c=C,O&&(d|=1024)}else if(e.children.length===1&&l!==Ni){const C=e.children[0],O=C.type,x=O===5||O===8;x&&ws(C,t)===0&&(d|=1),x||O===2?c=C:c=e.children}else c=e.children;p&&p.length&&(u=g0(p)),e.codegenNode=Yi(t,l,o,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function h0(e,t,s=!1){let{tag:n}=e;const a=jo(n),i=Pr(e,"is",!1,!0);if(i)if(a||ha("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&ze(i.value.content,!0):(r=i.exp,r||(r=ze("is",!1,i.arg.loc))),r)return Pt(t.helper(Pc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Rh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Nc),t.components.add(n),Xi(n,"component"))}function Jh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let f=!1,m=0,v=!1,C=!1,O=!1,x=!1,g=!1,b=!1;const S=[],k=N=>{c.length&&(d.push(Os(hu(c),r)),c=[]),N&&d.push(N)},A=()=>{t.scopes.vFor>0&&c.push(At(ze("ref_for",!0),ze("true")))},T=({key:N,value:E})=>{if(vs(N)){const I=N.content,B=ya(I);if(B&&(!n||a)&&I.toLowerCase()!=="onclick"&&I!=="onUpdate:modelValue"&&!_n(I)&&(x=!0),B&&_n(I)&&(b=!0),B&&E.type===14&&(E=E.arguments[0]),E.type===20||(E.type===4||E.type===8)&&ws(E,t)>0)return;I==="ref"?v=!0:I==="class"?C=!0:I==="style"?O=!0:I!=="key"&&!S.includes(I)&&S.push(I),n&&(I==="class"||I==="style")&&!S.includes(I)&&S.push(I)}else g=!0};for(let N=0;N<s.length;N++){const E=s[N];if(E.type===6){const{loc:I,name:B,nameLoc:q,value:oe}=E;let D=!0;if(B==="ref"&&(v=!0,A()),B==="is"&&(jo(l)||oe&&oe.content.startsWith("vue:")||ha("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(At(ze(B,!0,q),ze(oe?oe.content:"",D,oe?oe.loc:I)))}else{const{name:I,arg:B,exp:q,loc:oe,modifiers:D}=E,M=I==="bind",P=I==="on";if(I==="slot"){n||t.onError(ht(40,oe));continue}if(I==="once"||I==="memo"||I==="is"||M&&ra(B,"is")&&(jo(l)||ha("COMPILER_IS_ON_ELEMENT",t))||P&&i)continue;if((M&&ra(B,"key")||P&&p&&ra(B,"vue:before-update"))&&(f=!0),M&&ra(B,"ref")&&A(),!B&&(M||P)){if(g=!0,q)if(M){if(k(),ha("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(q);continue}A(),k(),d.push(q)}else k({type:14,loc:oe,callee:t.helper(Hc),arguments:n?[q]:[q,"true"]});else t.onError(ht(M?34:35,oe));continue}M&&D.some(K=>K.content==="prop")&&(m|=32);const U=t.directiveTransforms[I];if(U){const{props:K,needRuntime:G}=U(E,e,t);!i&&K.forEach(T),P&&B&&!vs(B)?k(Os(K,r)):c.push(...K),G&&(u.push(E),Xt(G)&&Zh.set(E,G))}else rv(I)||(u.push(E),p&&(f=!0))}}let _;if(d.length?(k(),d.length>1?_=Pt(t.helper(nr),d,r):_=d[0]):c.length&&(_=Os(hu(c),r)),g?m|=16:(C&&!n&&(m|=2),O&&!n&&(m|=4),S.length&&(m|=8),x&&(m|=32)),!f&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&_)switch(_.type){case 15:let N=-1,E=-1,I=!1;for(let oe=0;oe<_.properties.length;oe++){const D=_.properties[oe].key;vs(D)?D.content==="class"?N=oe:D.content==="style"&&(E=oe):D.isHandlerKey||(I=!0)}const B=_.properties[N],q=_.properties[E];I?_=Pt(t.helper(Ji),[_]):(B&&!vs(B.value)&&(B.value=Pt(t.helper(Bc),[B.value])),q&&(O||q.value.type===4&&q.value.content.trim()[0]==="["||q.value.type===17)&&(q.value=Pt(t.helper(Uc),[q.value])));break;case 14:break;default:_=Pt(t.helper(Ji),[Pt(t.helper(dl),[_])]);break}return{props:_,directives:u,patchFlag:m,dynamicPropNames:S,shouldUseBlock:f}}function hu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ya(i))&&m0(l,a):(t.set(i,a),s.push(a))}return s}function m0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=fa([e.value,t.value],e.loc)}function v0(e,t){const s=[],n=Zh.get(e);n?s.push(t.helperString(n)):(t.helper(Mc),t.directives.add(e.name),s.push(Xi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=ze("true",!1,a);s.push(Os(e.modifiers.map(l=>At(l,i)),a))}return fa(s,e.loc)}function g0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function jo(e){return e==="component"||e==="Component"}const b0=(e,t)=>{if(rr(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=y0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=si([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Pt(t.helper(Th),l,n)}};function y0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=rt(l.name),a.push(l)));else if(l.name==="bind"&&ra(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=rt(l.arg.content);s=l.exp=ze(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&vs(l.arg)&&(l.arg.content=rt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Jh(e,t,a,!1,!1);n=i,l.length&&t.onError(ht(36,l[0].loc))}return{slotName:s,slotProps:n}}const Yh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ht(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?za(rt(u)):`on:${u}`;r=ze(p,!0,l.loc)}else r=Hs([`${s.helperString($o)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString($o)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Lh(o),p=!(u||bx(o)),f=o.content.includes(";");(p||c&&u)&&(o=Hs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,o,f?"}":")"]))}let d={props:[At(r,o||ze("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},x0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=rt(i.content):i.content=`${s.helperString(Fo)}(${i.content})`:(i.children.unshift(`${s.helperString(Fo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&mu(i,"."),n.some(r=>r.content==="attr")&&mu(i,"^")),{props:[At(i,l)]}},mu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},_0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(to(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(to(o))n||(n=s[i]=Hs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(to(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ws(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Pt(t.helper(Lc),r)}}}}},vu=new WeakSet,w0=(e,t)=>{if(e.type===1&&Is(e,"once",!0))return vu.has(e)||t.inVOnce||t.inSSR?void 0:(vu.add(e),t.inVOnce=!0,t.helper(ar),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Qh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ht(41,e.loc)),gi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ht(44,n.loc)),gi();if(r==="literal-const"||r==="setup-const")return s.onError(ht(45,n.loc)),gi();if(!l.trim()||!Lh(n))return s.onError(ht(42,n.loc)),gi();const o=a||ze("modelValue",!0),c=a?vs(a)?`onUpdate:${rt(a.content)}`:Hs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Hs([`${u} => ((`,n,") = $event)"]);const p=[At(o,e.exp),At(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(v=>v.content).map(v=>(Gc(v)?v:JSON.stringify(v))+": true").join(", "),m=a?vs(a)?`${a.content}Modifiers`:Hs([a,' + "Modifiers"']):"modelModifiers";p.push(At(m,ze(`{ ${f} }`,!1,e.loc,2)))}return gi(p)};function gi(e=[]){return{props:e}}const k0=/[\w).+\-_$\]]/,S0=(e,t)=>{ha("COMPILER_FILTERS",t)&&(e.type===5?cr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&cr(s.exp,t)}))};function cr(e,t){if(e.type===4)gu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?gu(n,t):n.type===8?cr(e,t):n.type===5&&cr(n.content,t))}}function gu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,f,m,v=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!r&&!o&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):C();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let O=f-1,x;for(;O>=0&&(x=s.charAt(O),x===" ");O--);(!x||!k0.test(x))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&C();function C(){v.push(s.slice(d,f).trim()),d=f+1}if(v.length){for(f=0;f<v.length;f++)m=T0(m,v[f],t);e.content=m,e.ast=void 0}}function T0(e,t,s){s.helper(Dc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Xi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Xi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const bu=new WeakSet,C0=(e,t)=>{if(e.type===1){const s=Is(e,"memo");return!s||bu.has(e)||t.inSSR?void 0:(bu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Vc(n,t),e.codegenNode=Pt(t.helper(jc),[s.exp,si(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},E0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ht(53,n.loc)),s.exp=ze("",!0,n.loc);else{const a=rt(n.content);(Ih.test(a[0])||a[0]==="-")&&(s.exp=ze(a,!1,n.loc))}}}};function A0(e){return[[E0,w0,a0,C0,r0,S0,b0,f0,d0,_0],{on:Yh,bind:x0,model:Qh}]}function R0(e,t={}){const s=t.onError||qc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ht(48)):n&&s(ht(49));const a=!1;t.cacheHandlers&&s(ht(50)),t.scopeId&&!n&&s(ht(51));const i=Ve({},t,{prefixIdentifiers:a}),l=Be(e)?Mx(e,i):e,[r,o]=A0();return Bx(l,Ve({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Ve({},o,t.directiveTransforms||{})})),jx(l,i)}const I0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Xh=Symbol(""),em=Symbol(""),tm=Symbol(""),sm=Symbol(""),Vo=Symbol(""),nm=Symbol(""),am=Symbol(""),im=Symbol(""),lm=Symbol(""),rm=Symbol("");rx({[Xh]:"vModelRadio",[em]:"vModelCheckbox",[tm]:"vModelText",[sm]:"vModelSelect",[Vo]:"vModelDynamic",[nm]:"withModifiers",[am]:"withKeys",[im]:"vShow",[lm]:"Transition",[rm]:"TransitionGroup"});let Ia;function O0(e,t=!1){return Ia||(Ia=document.createElement("div")),t?(Ia.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ia.children[0].getAttribute("foo")):(Ia.innerHTML=e,Ia.textContent)}const L0={parseMode:"html",isVoidTag:Sv,isNativeTag:e=>_v(e)||wv(e)||kv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:O0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return lm;if(e==="TransitionGroup"||e==="transition-group")return rm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},N0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:ze("style",!0,t.loc),exp:P0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},P0=(e,t)=>{const s=yp(e);return ze(JSON.stringify(s),!1,t,3)};function jn(e,t){return ht(e,t)}const M0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(54,a)),t.children.length&&(s.onError(jn(55,a)),t.children.length=0),{props:[At(ze("innerHTML",!0,a),n||ze("",!0))]}},D0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(56,a)),t.children.length&&(s.onError(jn(57,a)),t.children.length=0),{props:[At(ze("textContent",!0),n?ws(n,s)>0?n:Pt(s.helperString(Nr),[n],a):ze("",!0))]}},F0=(e,t,s)=>{const n=Qh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(jn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=tm,r=!1;if(a==="input"||i){const o=Pr(t,"type");if(o){if(o.type===7)l=Vo;else if(o.value)switch(o.value.content){case"radio":l=Xh;break;case"checkbox":l=em;break;case"file":r=!0,s.onError(jn(60,e.loc));break}}else yx(t)&&(l=Vo)}else a==="select"&&(l=sm);r||(n.needRuntime=s.helper(l))}else s.onError(jn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},$0=Ss("passive,once,capture"),B0=Ss("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),U0=Ss("left,right"),om=Ss("onkeyup,onkeydown,onkeypress"),H0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Qi("COMPILER_V_ON_NATIVE",s)||$0(o)?l.push(o):U0(o)?vs(e)?om(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):B0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},yu=(e,t)=>vs(e)&&e.content.toLowerCase()==="onclick"?ze(t,!0):e.type!==4?Hs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,z0=(e,t,s)=>Yh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=H0(i,a,s,e.loc);if(o.includes("right")&&(i=yu(i,"onContextmenu")),o.includes("middle")&&(i=yu(i,"onMouseup")),o.length&&(l=Pt(s.helper(nm),[l,JSON.stringify(o)])),r.length&&(!vs(i)||om(i.content.toLowerCase()))&&(l=Pt(s.helper(am),[l,JSON.stringify(r)])),c.length){const d=c.map(_a).join("");i=vs(i)?ze(`${i.content}${d}`,!0):Hs(["(",i,`) + "${d}"`])}return{props:[At(i,l)]}}),j0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(62,a)),{props:[],needRuntime:s.helper(im)}},V0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},q0=[N0],G0={cloak:I0,html:M0,text:D0,model:F0,on:z0,show:j0};function K0(e,t={}){return R0(e,Ve({},L0,t,{nodeTransforms:[V0,...q0,...t.nodeTransforms||[]],directiveTransforms:Ve({},G0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const xu=Object.create(null);function W0(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return jt;const s=dv(e,t),n=xu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Ve({hoistStatic:!0,onError:void 0,onWarn:jt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=K0(e,a),l=new Function("Vue",i)(tx);return l._rc=!0,xu[s]=l}qf(W0);const dr=qn({items:[]});let Z0=1;function Fr(e,t="info",s=3e3){const n=Z0++;return dr.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Jc(n),s),n}function Jc(e){const t=dr.items.findIndex(s=>s.id===e);t>=0&&dr.items.splice(t,1)}function Ie(e,t="info",s=3e3){return Fr(e,t,s)}Ie.success=(e,t=3e3)=>Fr(e,"success",t);Ie.error=(e,t=5e3)=>Fr(e,"error",t);Ie.info=(e,t=3e3)=>Fr(e,"info",t);Ie.dismiss=Jc;const J0={setup(){return{state:dr,dismiss:Jc}},template:`
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
  `},mn=qn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Wa=null;function Qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Wa&&Wa(!1),mn.title=e,mn.message=t,mn.confirmLabel=s,mn.cancelLabel=n,mn.danger=a,mn.open=!0,new Promise(i=>{Wa=i})}function _u(e){mn.open=!1,Wa&&(Wa(e),Wa=null)}const Y0={setup(){function e(t){mn.open&&t.key==="Escape"&&(t.stopPropagation(),_u(!1))}return We(()=>document.addEventListener("keydown",e,!0)),vt(()=>document.removeEventListener("keydown",e,!0)),{state:mn,settle:_u}},template:`
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
 */const Da=typeof document<"u";function cm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Q0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&cm(e.default)}const at=Object.assign;function no(e,t){const s={};for(const n in t){const a=t[n];s[n]=js(a)?a.map(e):e(a)}return s}const Pi=()=>{},js=Array.isArray;function wu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const dm=/#/g,X0=/&/g,e_=/\//g,t_=/=/g,s_=/\?/g,um=/\+/g,n_=/%5B/g,a_=/%5D/g,pm=/%5E/g,i_=/%60/g,fm=/%7B/g,l_=/%7C/g,hm=/%7D/g,r_=/%20/g;function Yc(e){return e==null?"":encodeURI(""+e).replace(l_,"|").replace(n_,"[").replace(a_,"]")}function o_(e){return Yc(e).replace(fm,"{").replace(hm,"}").replace(pm,"^")}function qo(e){return Yc(e).replace(um,"%2B").replace(r_,"+").replace(dm,"%23").replace(X0,"%26").replace(i_,"`").replace(fm,"{").replace(hm,"}").replace(pm,"^")}function c_(e){return qo(e).replace(t_,"%3D")}function d_(e){return Yc(e).replace(dm,"%23").replace(s_,"%3F")}function u_(e){return d_(e).replace(e_,"%2F")}function tl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const p_=/\/$/,f_=e=>e.replace(p_,"");function ao(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=g_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:tl(l)}}function h_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function ku(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function m_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ii(t.matched[n],s.matched[a])&&mm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ii(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function mm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!v_(e[s],t[s]))return!1;return!0}function v_(e,t){return js(e)?Su(e,t):js(t)?Su(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Su(e,t){return js(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function g_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Mn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Go=(function(e){return e.pop="pop",e.push="push",e})({}),io=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function b_(e){if(!e)if(Da){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),f_(e)}const y_=/^[^#]+#/;function x_(e,t){return e.replace(y_,"#")+t}function __(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const $r=()=>({left:window.scrollX,top:window.scrollY});function w_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=__(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Tu(e,t){return(history.state?history.state.position-t:-1)+e}const Ko=new Map;function k_(e,t){Ko.set(e,t)}function S_(e){const t=Ko.get(e);return Ko.delete(e),t}function T_(e){return typeof e=="string"||e&&typeof e=="object"}function vm(e){return typeof e=="string"||typeof e=="symbol"}let _t=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const gm=Symbol("");_t.MATCHER_NOT_FOUND+"",_t.NAVIGATION_GUARD_REDIRECT+"",_t.NAVIGATION_ABORTED+"",_t.NAVIGATION_CANCELLED+"",_t.NAVIGATION_DUPLICATED+"";function li(e,t){return at(new Error,{type:e,[gm]:!0},t)}function dn(e,t){return e instanceof Error&&gm in e&&(t==null||!!(e.type&t))}const C_=["params","query","hash"];function E_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of C_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function A_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(um," "),i=a.indexOf("="),l=tl(i<0?a:a.slice(0,i)),r=i<0?null:tl(a.slice(i+1));if(l in t){let o=t[l];js(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function Cu(e){let t="";for(let s in e){const n=e[s];if(s=c_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(js(n)?n.map(a=>a&&qo(a)):[n&&qo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function R_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=js(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const I_=Symbol(""),Eu=Symbol(""),Br=Symbol(""),Qc=Symbol(""),Wo=Symbol("");function bi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Hn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(li(_t.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):T_(p)?o(li(_t.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function lo(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(cm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Hn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=Q0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Hn(p,s,n,l,r,a)()}))}}return i}function O_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>ii(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>ii(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let L_=()=>location.protocol+"//"+location.host;function bm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),ku(r,"")}return ku(s,e)+n+a}function N_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const f=bm(e,location),m=s.value,v=t.value;let C=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}C=v?p.position-v.position:0}else n(f);a.forEach(O=>{O(s.value,m,{delta:C,type:Go.pop,direction:C?C>0?io.forward:io.back:io.unknown})})};function o(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(at({},p.state,{scroll:$r()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Au(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?$r():null}}function P_(e){const{history:t,location:s}=window,n={value:bm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:L_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(o,c){i(o,at({},t.state,Au(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=at({},a.value,t.state,{forward:o,scroll:$r()});i(d.current,d,!0),i(o,at({},Au(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function M_(e){e=b_(e);const t=P_(e),s=N_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=at({location:"",base:e,go:n,createHref:x_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function D_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),M_(e)}let ca=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Lt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Lt||{});const F_={type:ca.Static,value:""},$_=/[a-zA-Z0-9_]/;function B_(e){if(!e)return[[]];if(e==="/")return[[F_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=Lt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Lt.Static?i.push({type:ca.Static,value:c}):s===Lt.Param||s===Lt.ParamRegExp||s===Lt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ca.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Lt.ParamRegExp){n=s,s=Lt.EscapeNext;continue}switch(s){case Lt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Lt.Param):p();break;case Lt.EscapeNext:p(),s=n;break;case Lt.Param:o==="("?s=Lt.ParamRegExp:$_.test(o)?p():(u(),s=Lt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Lt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Lt.ParamRegExpEnd:d+=o;break;case Lt.ParamRegExpEnd:u(),s=Lt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Lt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ru="[^/]+?",U_={sensitive:!1,strict:!1,start:!0,end:!0};var as=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(as||{});const H_=/[.+*?^${}()[\]/\\]/g;function z_(e,t){const s=at({},U_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[as.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=as.Segment+(s.sensitive?as.BonusCaseSensitive:0);if(p.type===ca.Static)u||(a+="/"),a+=p.value.replace(H_,"\\$&"),f+=as.Static;else if(p.type===ca.Param){const{value:m,repeatable:v,optional:C,regexp:O}=p;i.push({name:m,repeatable:v,optional:C});const x=O||Ru;if(x!==Ru){f+=as.BonusCustomRegExp;try{`${x}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${x}): `+b.message)}}let g=v?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(g=C&&c.length<2?`(?:/${g})`:"/"+g),C&&(g+="?"),a+=g,f+=as.Dynamic,C&&(f+=as.BonusOptional),v&&(f+=as.BonusRepeatable),x===".*"&&(f+=as.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=as.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===ca.Static)d+=f.value;else if(f.type===ca.Param){const{value:m,repeatable:v,optional:C}=f,O=m in c?c[m]:"";if(js(O)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const x=js(O)?O.join("/"):O;if(!x)if(C)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=x}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function j_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===as.Static+as.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===as.Static+as.Segment?1:-1:0}function ym(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=j_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Iu(n))return 1;if(Iu(a))return-1}return a.length-n.length}function Iu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const V_={strict:!1,end:!0,sensitive:!1};function q_(e,t,s){const n=z_(B_(e.path),s),a=at(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function G_(e,t){const s=[],n=new Map;t=wu(V_,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,v=Lu(u);v.aliasOf=f&&f.record;const C=wu(t,u),O=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of b)O.push(Lu(at({},v,{components:f?f.record.components:v.components,path:S,aliasOf:f?f.record:v})))}let x,g;for(const b of O){const{path:S}=b;if(p&&S[0]!=="/"){const k=p.record.path,A=k[k.length-1]==="/"?"":"/";b.path=p.record.path+(S&&A+S)}if(x=q_(b,p,C),f?f.alias.push(x):(g=g||x,g!==x&&g.alias.push(x),m&&u.name&&!Nu(x)&&l(u.name)),xm(x)&&o(x),v.children){const k=v.children;for(let A=0;A<k.length;A++)i(k[A],x,f&&f.children[A])}f=f||x}return g?()=>{l(g)}:Pi}function l(u){if(vm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=Z_(u,s);s.splice(p,0,u),u.record.name&&!Nu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},v,C;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw li(_t.MATCHER_NOT_FOUND,{location:u});C=f.record.name,m=at(Ou(p.params,f.keys.filter(g=>!g.optional).concat(f.parent?f.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Ou(u.params,f.keys.map(g=>g.name))),v=f.stringify(m)}else if(u.path!=null)v=u.path,f=s.find(g=>g.re.test(v)),f&&(m=f.parse(v),C=f.record.name);else{if(f=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!f)throw li(_t.MATCHER_NOT_FOUND,{location:u,currentLocation:p});C=f.record.name,m=at({},p.params,u.params),v=f.stringify(m)}const O=[];let x=f;for(;x;)O.unshift(x.record),x=x.parent;return{name:C,path:v,params:m,matched:O,meta:W_(O)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Ou(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Lu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:K_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function K_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Nu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function W_(e){return e.reduce((t,s)=>at(t,s.meta),{})}function Z_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;ym(e,t[i])<0?n=i:s=i+1}const a=J_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function J_(e){let t=e;for(;t=t.parent;)if(xm(t)&&ym(e,t)===0)return t}function xm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Pu(e){const t=Ls(Br),s=Ls(Qc),n=X(()=>{const o=tn(e.to);return t.resolve(o)}),a=X(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ii.bind(null,d));if(p>-1)return p;const f=Mu(o[c-2]);return c>1&&Mu(d)===f&&u[u.length-1].path!==f?u.findIndex(ii.bind(null,o[c-2])):p}),i=X(()=>a.value>-1&&tw(s.params,n.value.params)),l=X(()=>a.value>-1&&a.value===s.matched.length-1&&mm(s.params,n.value.params));function r(o={}){if(ew(o)){const c=t[tn(e.replace)?"replace":"push"](tn(e.to)).catch(Pi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:X(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function Y_(e){return e.length===1?e[0]:e}const Q_=ll({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Pu,setup(e,{slots:t}){const s=qn(Pu(e)),{options:n}=Ls(Br),a=X(()=>({[Du(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Du(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Y_(t.default(s));return e.custom?i:Qa("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),X_=Q_;function ew(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function tw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!js(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Mu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Du=(e,t,s)=>e??t??s,sw=ll({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ls(Wo),a=X(()=>e.route||n.value),i=Ls(Eu,0),l=X(()=>{let c=tn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=X(()=>a.value.matched[l.value]);Ri(Eu,X(()=>l.value+1)),Ri(I_,r),Ri(Wo,a);const o=h();return rs(()=>[o.value,r.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!ii(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Fu(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,C=Qa(p,at({},m,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Fu(s.default,{Component:C,route:c})||C}}});function Fu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const nw=sw;function aw(e){const t=G_(e.routes,e),s=e.parseQuery||A_,n=e.stringifyQuery||Cu,a=e.history,i=bi(),l=bi(),r=bi(),o=oc(Mn);let c=Mn;Da&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=no.bind(null,J=>""+J),u=no.bind(null,u_),p=no.bind(null,tl);function f(J,be){let H,re;return vm(J)?(H=t.getRecordMatcher(J),re=be):re=J,t.addRoute(re,H)}function m(J){const be=t.getRecordMatcher(J);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(J=>J.record)}function C(J){return!!t.getRecordMatcher(J)}function O(J,be){if(be=at({},be||o.value),typeof J=="string"){const L=ao(s,J,be.path),$=t.resolve({path:L.path},be),ae=a.createHref(L.fullPath);return at(L,$,{params:p($.params),hash:tl(L.hash),redirectedFrom:void 0,href:ae})}let H;if(J.path!=null)H=at({},J,{path:ao(s,J.path,be.path).path});else{const L=at({},J.params);for(const $ in L)L[$]==null&&delete L[$];H=at({},J,{params:u(L)}),be.params=u(be.params)}const re=t.resolve(H,be),ue=J.hash||"";re.params=d(p(re.params));const Le=h_(n,at({},J,{hash:o_(ue),path:re.path})),y=a.createHref(Le);return at({fullPath:Le,hash:ue,query:n===Cu?R_(J.query):J.query||{}},re,{redirectedFrom:void 0,href:y})}function x(J){return typeof J=="string"?ao(s,J,o.value.path):at({},J)}function g(J,be){if(c!==J)return li(_t.NAVIGATION_CANCELLED,{from:be,to:J})}function b(J){return A(J)}function S(J){return b(at(x(J),{replace:!0}))}function k(J,be){const H=J.matched[J.matched.length-1];if(H&&H.redirect){const{redirect:re}=H;let ue=typeof re=="function"?re(J,be):re;return typeof ue=="string"&&(ue=ue.includes("?")||ue.includes("#")?ue=x(ue):{path:ue},ue.params={}),at({query:J.query,hash:J.hash,params:ue.path!=null?{}:J.params},ue)}}function A(J,be){const H=c=O(J),re=o.value,ue=J.state,Le=J.force,y=J.replace===!0,L=k(H,re);if(L)return A(at(x(L),{state:typeof L=="object"?at({},ue,L.state):ue,force:Le,replace:y}),be||H);const $=H;$.redirectedFrom=be;let ae;return!Le&&m_(n,re,H)&&(ae=li(_t.NAVIGATION_DUPLICATED,{to:$,from:re}),G(re,re,!0,!1)),(ae?Promise.resolve(ae):N($,re)).catch(te=>dn(te)?dn(te,_t.NAVIGATION_GUARD_REDIRECT)?te:K(te):P(te,$,re)).then(te=>{if(te){if(dn(te,_t.NAVIGATION_GUARD_REDIRECT))return A(at({replace:y},x(te.to),{state:typeof te.to=="object"?at({},ue,te.to.state):ue,force:Le}),be||$)}else te=I($,re,!0,y,ue);return E($,re,te),te})}function T(J,be){const H=g(J,be);return H?Promise.reject(H):Promise.resolve()}function _(J){const be=Q.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(J):J()}function N(J,be){let H;const[re,ue,Le]=O_(J,be);H=lo(re.reverse(),"beforeRouteLeave",J,be);for(const L of re)L.leaveGuards.forEach($=>{H.push(Hn($,J,be))});const y=T.bind(null,J,be);return H.push(y),De(H).then(()=>{H=[];for(const L of i.list())H.push(Hn(L,J,be));return H.push(y),De(H)}).then(()=>{H=lo(ue,"beforeRouteUpdate",J,be);for(const L of ue)L.updateGuards.forEach($=>{H.push(Hn($,J,be))});return H.push(y),De(H)}).then(()=>{H=[];for(const L of Le)if(L.beforeEnter)if(js(L.beforeEnter))for(const $ of L.beforeEnter)H.push(Hn($,J,be));else H.push(Hn(L.beforeEnter,J,be));return H.push(y),De(H)}).then(()=>(J.matched.forEach(L=>L.enterCallbacks={}),H=lo(Le,"beforeRouteEnter",J,be,_),H.push(y),De(H))).then(()=>{H=[];for(const L of l.list())H.push(Hn(L,J,be));return H.push(y),De(H)}).catch(L=>dn(L,_t.NAVIGATION_CANCELLED)?L:Promise.reject(L))}function E(J,be,H){r.list().forEach(re=>_(()=>re(J,be,H)))}function I(J,be,H,re,ue){const Le=g(J,be);if(Le)return Le;const y=be===Mn,L=Da?history.state:{};H&&(re||y?a.replace(J.fullPath,at({scroll:y&&L&&L.scroll},ue)):a.push(J.fullPath,ue)),o.value=J,G(J,be,H,y),K()}let B;function q(){B||(B=a.listen((J,be,H)=>{if(!fe.listening)return;const re=O(J),ue=k(re,fe.currentRoute.value);if(ue){A(at(ue,{replace:!0,force:!0}),re).catch(Pi);return}c=re;const Le=o.value;Da&&k_(Tu(Le.fullPath,H.delta),$r()),N(re,Le).catch(y=>dn(y,_t.NAVIGATION_ABORTED|_t.NAVIGATION_CANCELLED)?y:dn(y,_t.NAVIGATION_GUARD_REDIRECT)?(A(at(x(y.to),{force:!0}),re).then(L=>{dn(L,_t.NAVIGATION_ABORTED|_t.NAVIGATION_DUPLICATED)&&!H.delta&&H.type===Go.pop&&a.go(-1,!1)}).catch(Pi),Promise.reject()):(H.delta&&a.go(-H.delta,!1),P(y,re,Le))).then(y=>{y=y||I(re,Le,!1),y&&(H.delta&&!dn(y,_t.NAVIGATION_CANCELLED)?a.go(-H.delta,!1):H.type===Go.pop&&dn(y,_t.NAVIGATION_ABORTED|_t.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),E(re,Le,y)}).catch(Pi)}))}let oe=bi(),D=bi(),M;function P(J,be,H){K(J);const re=D.list();return re.length?re.forEach(ue=>ue(J,be,H)):console.error(J),Promise.reject(J)}function U(){return M&&o.value!==Mn?Promise.resolve():new Promise((J,be)=>{oe.add([J,be])})}function K(J){return M||(M=!J,q(),oe.list().forEach(([be,H])=>J?H(J):be()),oe.reset()),J}function G(J,be,H,re){const{scrollBehavior:ue}=e;if(!Da||!ue)return Promise.resolve();const Le=!H&&S_(Tu(J.fullPath,0))||(re||!H)&&history.state&&history.state.scroll||null;return Et().then(()=>ue(J,be,Le)).then(y=>y&&w_(y)).catch(y=>P(y,J,be))}const Y=J=>a.go(J);let ie;const Q=new Set,fe={currentRoute:o,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:C,getRoutes:v,resolve:O,options:e,push:b,replace:S,go:Y,back:()=>Y(-1),forward:()=>Y(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:D.add,isReady:U,install(J){J.component("RouterLink",X_),J.component("RouterView",nw),J.config.globalProperties.$router=fe,Object.defineProperty(J.config.globalProperties,"$route",{enumerable:!0,get:()=>tn(o)}),Da&&!ie&&o.value===Mn&&(ie=!0,b(a.location).catch(re=>{}));const be={};for(const re in Mn)Object.defineProperty(be,re,{get:()=>o.value[re],enumerable:!0});J.provide(Br,fe),J.provide(Qc,rc(be)),J.provide(Wo,o);const H=J.unmount;Q.add(J),J.unmount=function(){Q.delete(J),Q.size<1&&(c=Mn,B&&B(),B=null,o.value=Mn,ie=!1,M=!1),H()}}};function De(J){return J.reduce((be,H)=>be.then(()=>_(H)),Promise.resolve())}return fe}function _m(){return Ls(Br)}function iw(e){return Ls(Qc)}const Ur={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=iw(),s=_m(),n=X({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=X(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=X(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});rs(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},lw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var v,C,O,x,g;const f=p.payload||p,m=f.type||p.type;if(m==="tool_start"){const b=((v=f.metadata)==null?void 0:v.call_id)||null,S={callId:b,id:b||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((C=f.metadata)==null?void 0:C.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(m==="tool_end"){const b=((O=f.metadata)==null?void 0:O.call_id)||null;let S=-1;if(b&&(S=e.value.findIndex(k=>k.callId===b&&k.status==="running")),S<0&&!b)for(let k=e.value.length-1;k>=0;k--){const A=e.value[k];if(A.tool===f.action&&A.status==="running"){S=k;break}}if(S>=0){const k=e.value[S];k.status=(x=f.metadata)!=null&&x.error?"error":"success",k.elapsed=((g=f.metadata)==null?void 0:g.elapsed_ms)||Date.now()-k.startTime,k.result=f.detail||"",k.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(k);A>=0&&e.value.splice(A,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const b=f.call_id||f.tool_name||"unknown";if(f.finished){const S={...s.value};delete S[b],s.value=S}else{const k=((s.value[b]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[b]:k.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let r=!1;function o(){r||(r=!0,Qe.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Qe.off("events",a),i&&(clearInterval(i),i=null))}We(o),bs(o),ds(c),vt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Xc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ka(e){const t=Xc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function wm(e){const t=Xc(e);return t?t.toLocaleTimeString():"—"}function km(e){const t=Xc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function rw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ri(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function ed(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Sm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function $u(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Tm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Cm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Em=Symbol("agent-detail-cancelled"),ow=15e3;function cw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((f,m)=>{o=f,c=m});function u(f,m){r||(r=!0,l!==null&&a(l),l=null,(f?o:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return r||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Em),i==null||i.abort()}}}function Am({state:e,requestDetail:t,timeoutMs:s=ow,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const v={agentId:p,cancel:null,promise:null};l=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const C=cw(O=>t(p,{signal:O}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=C.cancel,v.promise=(async()=>{let O=null,x=null;try{O=await C.promise}catch(g){x=g}O!==Em&&(l!==v||e.detailId!==p||(l=null,!x&&(O===null||typeof O!="object")&&(x=new Error(`${n} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function dw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const uw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=X(()=>e.value.filter(P=>P.status==="running").length),o=X(()=>e.value.filter(P=>P.status==="completed").length),c=X(()=>e.value.filter(P=>["failed","timeout","killed"].includes(P.status)).length),d=X(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=X(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(P=>["failed","timeout","killed"].includes(P.status)):e.value.filter(P=>P.status===i.value));function p(P){const U=Number(P.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(P.iteration_count/U*100))}function f(P){return(Number(P.max_iterations)||0)>0}function m(P,U){return P?P==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${P})`:P:"unknown"}function v(P){return m(P.display_model,P.display_model_source||P.display_source)}function C(P){return m(P.display_reasoning_effort,P.display_reasoning_effort_source||P.display_source)}function O(P){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[P]||""}const x=h(null),g=h(null),b=h(!1),S=h(null),k=h(""),T=Am({state:{get detail(){return x.value},set detail(P){x.value=P},get detailId(){return g.value},set detailId(P){g.value=P},get detailLoading(){return b.value},set detailLoading(P){b.value=P},get detailError(){return S.value},set detailError(P){S.value=P}},requestDetail:(P,{signal:U})=>W.get(`/api/agents/${encodeURIComponent(P)}`,{signal:U})});async function _(P){k.value="",await T.open(P.id)}function N(){T.close(),k.value=""}async function E(){await T.refresh()}async function I(P,U){try{await navigator.clipboard.writeText(U||""),k.value=P,setTimeout(()=>{k.value===P&&(k.value="")},1500)}catch{Ie.error("Copy failed")}}async function B(P=!1){P=P===!0,P||(t.value=!0);try{const U=await W.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){P||(s.value=U.message)}P||(t.value=!1)}async function q(P){const U=e.value.find(G=>G.id===P);if(await Qt({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||P}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=P;try{await W.del(`/api/agents/${encodeURIComponent(P)}`),Ie.success("Agent killed"),await B()}catch(G){Ie.error(G.message||"Failed to kill agent")}n.value=null}}const oe=dw({isEnabled:()=>a.value&&l,refreshList:()=>B(!0),hasOpenDetail:()=>!!g.value,refreshDetail:E});function D(){oe.start()}function M(){oe.stop()}return rs(a,()=>oe.sync()),We(()=>{l=!0,B(),D()}),bs(()=>{l=!0,B(!0),D()}),ds(()=>{l=!1,M()}),vt(()=>{l=!1,M(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ka,formatDuration:ri,progressPercent:p,hasProgress:f,displayModelText:v,displayEffortText:C,displaySourceLabel:O,detail:x,detailId:g,detailLoading:b,detailError:S,copied:k,openDetail:_,closeDetail:N,copyText:I,fetchAgents:B,killAgent:q,startAutoRefresh:D,stopAutoRefresh:M}}},pw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const C=Am({state:{get detail(){return c.value},set detail(M){c.value=M},get detailId(){return d.value},set detailId(M){d.value=M},get detailLoading(){return u.value},set detailLoading(M){u.value=M},get detailError(){return p.value},set detailError(M){p.value=M}},detailLabel:"Loop detail",requestDetail:(M,{signal:P})=>W.get(`/api/loops/${encodeURIComponent(M)}?limit=100`,{signal:P})});async function O(M){f.value="",await C.open(M.id)}function x(){C.close(),f.value=""}async function g(M,P){try{await navigator.clipboard.writeText(P||""),f.value=M,setTimeout(()=>{f.value===M&&(f.value="")},1500)}catch{Ie.error("Copy failed")}}const b=X(()=>e.value.reduce((M,P)=>M+(P.iteration_count||0),0)),S=X(()=>e.value.filter(M=>M.status==="running").length);function k(M){return M==="running"?"loop-status-running":M==="error"?"loop-status-error":"loop-status-stopped"}function A(M){return M==="running"?"badge-success":M==="error"?"badge-danger":M==="completed"?"badge-info":"badge-warning"}function T(M){return M==="act"?"badge-warning":M==="silent"?"badge-info":"badge-success"}async function _(M=!1){M=M===!0,M||(t.value=!0);try{const P=await W.get("/api/loops");e.value=Array.isArray(P)?P:[],s.value=null}catch(P){M||(s.value=P.message)}M||(t.value=!1)}async function N(){l.value=null;const M=a.value;if(!M.goal.trim()){l.value="Goal is required";return}if(!M.channel_id.trim()){l.value="Channel ID is required";return}const P={goal:M.goal.trim(),channel_id:M.channel_id.trim(),interval_seconds:M.interval_seconds||60,mode:M.mode,max_iterations:M.max_iterations||50};M.stop_condition.trim()&&(P.stop_condition=M.stop_condition.trim()),i.value=!0;try{const U=await W.post("/api/loops",P);Ie.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await _()}catch(U){l.value=U.message}i.value=!1}async function E(M){if(await Qt({title:"Stop loop",message:`Stop loop ${M}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=M;try{await W.del(`/api/loops/${encodeURIComponent(M)}`),Ie.success("Loop stopped"),await _()}catch(U){Ie.error(U.message||"Failed to stop loop")}r.value=null}}async function I(M){o.value=M;try{await W.post(`/api/loops/${encodeURIComponent(M)}/restart`),Ie.success("Loop restarted"),await _()}catch(P){Ie.error(P.message||"Failed to restart loop")}o.value=null}function B(M){m&&M.payload&&(M.payload.loop_id||M.payload.type==="loop")&&(_(!0),d.value&&C.refresh())}let q=null;function oe(){q!==null&&clearInterval(q),q=null}function D(){oe(),m&&(q=setInterval(()=>{_(!0),d.value&&C.refresh()},5e3))}return We(()=>{m=!0,_(),Qe.subscribe("events",B),D()}),bs(()=>{m=!0,_(!0),D()}),ds(()=>{m=!1,oe()}),vt(()=>{m=!1,Qe.unsubscribe("events",B),oe(),C.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:b,runningCount:S,statusDotClass:k,statusBadge:A,modeBadge:T,formatAge:km,formatDuration:ri,formatTs:ka,formatTokens:Cm,openDetail:O,closeDetail:x,copyText:g,fetchLoops:_,doCreate:N,doStop:E,doRestart:I}}},fw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=X(()=>e.value.filter(x=>x.status==="running").length),r=X(()=>e.value.filter(x=>x.status!=="running").length);function o(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(g){x||(s.value=g.message)}x||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}rs(n,x=>{x?u():p()});async function f(x){if(await Qt({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await W.del(`/api/processes/${x}`),Ie.success(`Process ${x} killed`),await d()}catch(b){Ie.error(b.message||"Failed to kill process")}i.value=null}}function m(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let v=!1;function C(){v||(v=!0,d(),Qe.subscribe("events",m),u())}function O(){v&&(v=!1,Qe.unsubscribe("events",m),p())}return We(C),bs(C),ds(O),vt(O),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ri,fetchProcesses:d,doKill:f}}},hw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Bu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function mw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function vw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function gw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=hw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const C of new Set([p,f])){const O=new Date(u+C*6e4);mw(O,c)===d&&(m.some(x=>x.getTime()===O.getTime())||m.push(O))}if(m.sort((C,O)=>C.getTime()-O.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(C=>({instant:C,offset:vw(C),iso:C.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const bw={template:`
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

                  <!-- Schedule details -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                    <div><span class="text-gray-500">ID:</span> <span class="font-mono">{{ s.id }}</span></div>
                    <div><span class="text-gray-500">Action:</span> {{ s.action }}</div>
                    <div v-if="s.action === 'check'">
                      <label class="text-gray-500">Report:
                      <select :value="s.report_format || ''"
                              @change="doUpdateReportFormat(s, $event.target.value)"
                              class="hm-input text-xs mt-1"
                              :disabled="reportUpdatingId === s.id">
                        <option value="">Plain text</option>
                        <option value="paginated_embed_v1">Paginated embeds</option>
                      </select>
                      </label>
                    </div>
                    <div v-else><span class="text-gray-500">Report:</span> plain text</div>
                    <div><span class="text-gray-500">Next run:</span>
                      <span v-if="s.next_run">{{ formatFuture(s.next_run) }}</span>
                      <span v-else>on trigger</span>
                    </div>
                    <div><span class="text-gray-500">Created:</span> {{ formatTs(s.created_at) }}</div>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),r=h(null),o=X(()=>gw(a.value.run_at));rs(()=>a.value.run_at,()=>{r.value=null});const c=X(()=>{var re;const H=o.value;return H.state==="ok"?H.instant:H.state==="ambiguous"&&r.value!==null&&((re=H.options[r.value])==null?void 0:re.instant)||null}),d=X(()=>{const H=c.value;return H?`${H.toLocaleString()} local — ${H.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),v=h(null),C=h(null),O=h(null),x=h(null),g=h(null),b=h([]),S=h(!1),k=h("");let A=0;const T=X(()=>e.value.filter(H=>H.cron&&!H.one_time).length),_=X(()=>e.value.filter(H=>H.one_time).length),N=X(()=>e.value.filter(H=>H.trigger).length),E=X(()=>e.value.filter(H=>H.paused).length),I=X(()=>e.value.filter(H=>H.consecutive_failures>0).length);function B(H){if(!H)return"-";const re=Date.now(),Le=(new Date(H).getTime()-re)/1e3;if(Le<0)return"overdue";if(Le<60)return"in < 1 min";if(Le<3600)return`in ${Math.floor(Le/60)} min`;if(Le<86400){const L=Math.floor(Le/3600),$=Math.floor(Le%3600/60);return $>0?`in ${L}h ${$}m`:`in ${L}h`}const y=Math.floor(Le/86400);return`in ${y} day${y!==1?"s":""}`}function q(H){return H==null?"-":H<1e3?`${H}ms`:H<6e4?`${(H/1e3).toFixed(1)}s`:ri(H/1e3)}function oe(H=a.value.cron){a.value.cron=H,Bu(a.value,"cron"),u.value=null}function D(H=a.value.run_at){a.value.run_at=H,Bu(a.value,"run_at"),u.value=null}async function M(){const H=a.value.cron.trim();if(H){p.value=!0;try{u.value=await W.post("/api/schedules/validate-cron",{expression:H})}catch(re){u.value={valid:!1,error:re.message}}p.value=!1}}async function P(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(H){s.value=H.message}t.value=!1}async function U(H){if(g.value===H){g.value=null,b.value=[];return}g.value=H,S.value=!0,b.value=[];const re=++A;try{const ue=await W.get(`/api/schedules/${encodeURIComponent(H)}/history?limit=10`);if(re!==A||g.value!==H)return;b.value=ue,k.value=""}catch(ue){if(re!==A||g.value!==H)return;b.value=[],k.value=ue.message||"Failed to load execution history"}re===A&&(S.value=!1)}async function K(){l.value=null;const H=a.value;if(!H.description.trim()){l.value="Description is required";return}if(!H.channel_id.trim()){l.value="Channel ID is required";return}if(!H.cron.trim()&&!H.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(H.cron.trim()&&H.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const re={description:H.description.trim(),action:H.action,channel_id:H.channel_id.trim()};if(H.cron.trim()&&(re.cron=H.cron.trim()),H.run_at.trim()){const ue=o.value;if(ue.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){l.value="One-time run time is not a valid date";return}const Le=c.value;if(ue.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Le){l.value="One-time run time could not be resolved";return}re.run_at=Le.toISOString()}if(H.action==="reminder"&&H.message.trim()&&(re.message=H.message.trim()),H.action==="check"&&(H.tool_name.trim()&&(re.tool_name=H.tool_name.trim()),H.report_format&&(re.report_format=H.report_format),H.tool_input_str.trim()))try{re.tool_input=JSON.parse(H.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",re),Ie.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await P()}catch(ue){l.value=ue.message}i.value=!1}async function G(H){m.value=H;try{const re=await W.post(`/api/schedules/${encodeURIComponent(H)}/run`);if(re.status==="failure")Ie.error(`Execution failed: ${re.error||"unknown error"}`);else{const ue=re.warning?`Executed (${re.warning})`:"Executed successfully";Ie.success(ue)}await P()}catch(re){Ie.error(re.message||"Failed to trigger")}m.value=null}async function Y(H){C.value=H.id;const re=!H.paused;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{paused:re}),Ie.success(re?"Schedule paused":"Schedule resumed"),await P()}catch(ue){Ie.error(ue.message||"Failed to update schedule")}C.value=null}const ie=new Map;function Q(H,re){const ue=ie.get(H.id);ue&&clearTimeout(ue.timer);const Le={run:()=>fe(H,re),timer:null};Le.timer=setTimeout(()=>{ie.delete(H.id),Le.run()},500),ie.set(H.id,Le)}async function fe(H,re){x.value=H.id;try{await W.put(`/api/schedules/${encodeURIComponent(H.id)}`,{report_format:re}),Ie.success(re?"Structured report enabled":"Plain-text report enabled")}catch(ue){Ie.error(`Update failed: ${ue.message}`)}finally{await P(),x.value=null}}function De(){for(const[H,re]of[...ie])clearTimeout(re.timer),ie.delete(H),re.run()}async function J(H){O.value=H;try{await W.post(`/api/schedules/${encodeURIComponent(H)}/reset-failures`),Ie.success("Failure counters reset"),await P()}catch(re){Ie.error(re.message||"Failed to reset")}O.value=null}async function be(H){const re=e.value.find(Le=>Le.id===H);if(await Qt({title:"Delete schedule",message:`Delete "${(re==null?void 0:re.description)||H}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=H;try{await W.del(`/api/schedules/${encodeURIComponent(H)}`),Ie.success("Schedule deleted"),await P()}catch(Le){Ie.error(Le.message||"Failed to delete schedule")}v.value=null}}return We(()=>{P()}),vt(De),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:v,togglingId:C,resettingId:O,reportUpdatingId:x,flushReportFormatTimers:De,expandedId:g,history:b,historyLoading:S,historyError:k,cronCount:T,oneTimeCount:_,webhookCount:N,pausedCount:E,failingCount:I,formatTs:ka,formatAge:km,formatFuture:B,formatMs:q,formatDuration:ri,onCronInput:oe,onRunAtInput:D,validateCron:M,toggleExpand:U,fetchSchedules:P,doCreate:K,doRunNow:G,doTogglePause:Y,doUpdateReportFormat:Q,doResetFailures:J,doDelete:be}}},Rm=[{id:"live",label:"Live",component:lw},{id:"agents",label:"Agents",component:uw},{id:"loops",label:"Loops",component:pw},{id:"processes",label:"Processes",component:fw},{id:"schedules",label:"Schedules",component:bw}],yw={components:{TabbedPage:Ur},setup(){return{tabs:Rm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},xw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="text-xl font-semibold">Audit Log</h1>
        <button @click="fetchAudit" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(d){if(!d)return"";if(typeof d=="string")return d;try{return JSON.stringify(d,null,2)}catch{return String(d)}}function l(d){n.value=n.value===d?null:d}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},c()}let o=0;async function c(){const d=++o;t.value=!0,s.value=null,n.value=null;try{const u=new URLSearchParams;a.value.tool&&u.set("tool",a.value.tool),a.value.user&&u.set("user",a.value.user),a.value.keyword&&u.set("q",a.value.keyword),a.value.date&&u.set("date",a.value.date),u.set("limit",String(a.value.limit));const p=u.toString(),f=await W.get(`/api/audit${p?"?"+p:""}`);if(d!==o)return;e.value=Array.isArray(f)?f:[]}catch(u){if(d!==o)return;s.value=u.message}d===o&&(t.value=!1)}return We(()=>{c()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ka,formatDetail:i,truncateBlock:Sm,toggleExpand:l,clearFilters:r,fetchAudit:c}}},Uu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],_w=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ww={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),v=Uu,C=_w,O=h([]),x=h(!1),g=h(""),b=h("flat"),S=h(new Set),k=h(""),A=h(""),T=h(""),_=h(null),N=h(!1);function E(){try{const se=localStorage.getItem("odin-session-presets");se&&(O.value=JSON.parse(se))}catch{}}function I(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const B=X(()=>p.value.trim()!==""||u.value!=="all"),q=X(()=>{let se=[...e.value];const we=Uu.find(Ge=>Ge.id===u.value),Ce=we?we.filters:{};if(Ce.source&&(se=se.filter(Ge=>Ge.source===Ce.source)),Ce.minMessages&&(se=se.filter(Ge=>Ge.message_count>=Ce.minMessages)),Ce.hasCompaction&&(se=se.filter(Ge=>Ge.has_summary)),Ce.maxAge!=null){const Ge=Date.now()/1e3;se=se.filter(ct=>ct.last_active&&Ge-ct.last_active<=Ce.maxAge)}if(p.value.trim()){const Ge=p.value.toLowerCase().trim();se=se.filter(ct=>(ct.channel_id||"").toLowerCase().includes(Ge)||(ct.last_user_id||"").toLowerCase().includes(Ge)||(ct.source||"").toLowerCase().includes(Ge))}const Ue=f.value,gt=m.value?1:-1;return se.sort((Ge,ct)=>{const Vs=Ge[Ue]||0,Cs=ct[Ue]||0;return(Vs-Cs)*gt}),se}),oe=X(()=>{if(!a.value||!a.value.messages)return[];const se=a.value.messages;if(se.length===0)return[];const we=[];let Ce=[];for(const Ue of se)Ue.role==="user"&&Ce.length>0&&(we.push(Ce),Ce=[]),Ce.push(Ue);return Ce.length>0&&we.push(Ce),we}),D=X(()=>q.value.length>0&&c.value.size===q.value.length);function M(se){const we=se.find(Ce=>Ce.role==="user");if(we&&we.content){const Ce=we.content.slice(0,120);return Ce.length<we.content.length?Ce+"...":Ce}return"(no user message)"}function P(se){const we=new Set(S.value);we.has(se)?we.delete(se):we.add(se),S.value=we}function U(se){u.value=se}function K(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(f.value=se.filters.sortBy)}function G(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};O.value=[...O.value,se],I(),x.value=!1,g.value=""}function Y(se){O.value=O.value.filter(we=>we.id!==se),I(),u.value===se&&(u.value="all")}function ie(){u.value="all",p.value="",f.value="last_active",m.value=!1}function Q(se){if(!se)return"—";const we=Date.now()/1e3-se;if(we<60)return"just now";if(we<3600){const Ue=Math.floor(we/60);return`${Ue} minute${Ue!==1?"s":""} ago`}if(we<86400){const Ue=Math.floor(we/3600);return`${Ue} hour${Ue!==1?"s":""} ago`}const Ce=Math.floor(we/86400);return`${Ce} day${Ce!==1?"s":""} ago`}function fe(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function De(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function J(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function be(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function re(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ue(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function Le(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function y(){const se=k.value.trim();if(se){N.value=!0;try{let we=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;A.value.trim()&&(we+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(we+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ce=await W.get(we);_.value=Ce.results||[]}catch{_.value=[]}N.value=!1}}function L(){k.value="",A.value="",T.value="",_.value=null}function $(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ae(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function te(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ne=0;async function he(){const se=++ne;t.value=!0,s.value=null;try{const we=await W.get("/api/sessions");if(se!==ne)return;e.value=we}catch(we){if(se!==ne)return;s.value=we.message}se===ne&&(t.value=!1)}function de(){s.value=null,he()}async function pe(se){if(n.value===se){n.value=null,a.value=null,S.value=new Set;return}n.value=se,a.value=null,i.value=!0,S.value=new Set;const we=++l;try{const Ce=await W.get(`/api/sessions/${encodeURIComponent(se)}`);we===l&&n.value===se&&(a.value=Ce)}catch(Ce){we===l&&n.value===se&&(a.value={messages:[],summary:"",error:Ce.message||"Failed to load session"})}finally{we===l&&(i.value=!1)}}function le(se){const we=new Set(c.value);we.has(se)?we.delete(se):we.add(se),c.value=we}function ke(){D.value?c.value=new Set:c.value=new Set(q.value.map(se=>se.channel_id))}function ye(se){r.value=se}async function _e(){if(r.value){o.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await he()}catch(se){s.value=se.message||"Failed to clear session"}o.value=!1,r.value=null}}function ce(){d.value=!0}async function z(){if(c.value.size!==0){o.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await he()}catch(se){s.value=se.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function ve(se,we){const Ce=`/api/sessions/${encodeURIComponent(se)}/export?format=${we}`;try{const Ue=await W.getBlob(Ce),gt=URL.createObjectURL(Ue),Ge=document.createElement("a");Ge.href=gt,Ge.download=`session-${se}.${we==="text"?"txt":"json"}`,Ge.click(),URL.revokeObjectURL(gt)}catch(Ue){s.value=Ue.message||"Failed to export session"}}let Te=null;function Oe(se){se.payload&&se.payload.channel_id&&(clearTimeout(Te),Te=setTimeout(()=>{if(he(),n.value&&se.payload.channel_id===n.value){const we=n.value,Ce=l;W.get(`/api/sessions/${encodeURIComponent(we)}`).then(Ue=>{Ce!==l||n.value!==we||(a.value=Ue)}).catch(()=>{})}},2e3))}let Pe=!1,ot=null;function lt(){Pe||(Pe=!0,he(),Qe.subscribe("events",Oe),ot=Qe.onReconnected(()=>he()))}We(()=>{E(),lt()}),bs(()=>{lt()});function Mt(){Pe&&(Pe=!1,Qe.unsubscribe("events",Oe),ot&&(ot(),ot=null),clearTimeout(Te))}return ds(Mt),vt(Mt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:D,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:v,sortOptions:C,filteredSessions:q,hasActiveFilters:B,customPresets:O,showSavePreset:x,newPresetName:g,threadView:b,threads:oe,collapsedThreads:S,ftsQuery:k,ftsChannelId:A,ftsUserId:T,ftsResults:_,ftsSearching:N,formatAge:Q,formatTimestamp:fe,formatFullTimestamp:De,messageClass:J,threadMsgClass:be,roleBadge:H,roleDotClass:re,roleLabelClass:ue,truncateContent:Le,threadSummary:M,fetchSessions:he,retry:de,toggleSession:pe,toggleSelect:le,toggleSelectAll:ke,confirmClear:ye,clearSession:_e,confirmBulkClear:ce,doBulkClear:z,exportSession:ve,applyPreset:U,applyCustomPreset:K,saveCustomPreset:G,removeCustomPreset:Y,resetFilters:ie,toggleThread:P,runFtsSearch:y,clearFtsSearch:L,highlightSnippet:$,ftsResultClass:ae,ftsTypeBadge:te}}},kw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Cm}}},Sw={components:{ContextAssemblyPanel:kw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function p(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function f(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function v(A){a.value===A?a.value=null:(a.value=A,c.value={})}function C(A,T){const _=A+"-"+T;c.value={...c.value,[_]:!c.value[_]}}function O(A,T){return!!c.value[A+"-"+T]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function g(){try{const A=await W.get("/api/trajectories");e.value=A.files||[],o.value=A.count||0}catch{}}let b=0;async function S(){const A=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(A!==b)return;let _=T.entries||[];d.value.tool_name&&(_=_.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(_=_.filter(N=>N.is_error)),d.value.channel_id&&(_=_.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(_=_.filter(N=>N.user_id===d.value.user_id)),t.value=_}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const _=T.toString(),N=await W.get(`/api/trajectories/search/query?${_}`);if(A!==b)return;t.value=N.results||[]}}catch(T){if(A!==b)return;n.value=T.message}A===b&&(s.value=!1)}async function k(){if(!l.value.trim())return;const A=++b;s.value=!0,n.value=null,c.value={};try{const T=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==b)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(A!==b)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}A===b&&(s.value=!1)}return We(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:Sm,toggleExpand:v,toggleIteration:C,isIterationExpanded:O,clearFilters:x,fetchFiles:g,fetchTraces:S,lookupMessage:k}}},Tw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=X(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await W.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return We(p),bs(p),ds(f),vt(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:Tm,formatTime:wm,retry:d}}},Im=[{id:"audit",label:"Audit",component:xw},{id:"sessions",label:"Sessions",component:ww},{id:"traces",label:"Traces",component:Sw},{id:"usage",label:"Usage",component:Tw}],Cw={components:{TabbedPage:Ur},setup(){return{tabs:Im}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},ro=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Ew={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(_){return _.source!=="builtin"?"":u[_.state]||""}function f(_,N){const E=_&&Array.isArray(_.tools)?_.tools:null;if(c.value=!!E,o.value=E?!!_.global_enabled:null,!E){e.value=N.map(q=>({...q,source:"unknown",enabled:void 0,state:null}));return}const I=new Set(E.map(q=>q.name)),B=N.filter(q=>!I.has(q.name)).map(q=>({...q,source:q.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...E.map(q=>({...q,source:"builtin"})),...B]}async function m(_,N){if(d.value.has(_.name))return;const E=!!N.target.checked,I=new Set(d.value);I.add(_.name),d.value=I;try{const B=await W.post(`/api/tools/builtins/${encodeURIComponent(_.name)}/enabled`,{enabled:E});f(B,e.value),s.value=null;try{const q=await W.get("/api/tools");f(B,q)}catch(q){console.warn("Built-in toggle committed; visible catalog refresh failed",q)}}catch(B){N.target.checked=!!_.enabled,s.value=B.message||`Failed to toggle ${_.name}`}finally{const B=new Set(d.value);B.delete(_.name),d.value=B}}const v=X(()=>e.value.filter(_=>_.source==="builtin"&&_.is_core).length),C=X(()=>e.value.filter(_=>_.source==="skill").length),O=X(()=>Object.values(a.value).reduce((_,N)=>_+N,0));function x(_){for(const N of ro)if(N.id!=="other"&&N.match(_))return N.id;return"other"}const g=X(()=>{let _=e.value;if(n.value){const N=n.value.toLowerCase();_=_.filter(E=>E.name.toLowerCase().includes(N)||(E.description||"").toLowerCase().includes(N))}return r.value&&(_=_.filter(N=>x(N.name)===r.value)),_}),b=X(()=>{const _=new Set;for(const N of e.value)_.add(x(N.name));return ro.filter(N=>_.has(N.id))}),S=X(()=>{const _=g.value,N={};for(const I of _){const B=x(I.name);N[B]||(N[B]=[]),N[B].push(I)}const E=[];for(const I of ro)N[I.id]&&N[I.id].length>0&&E.push({label:I.label,icon:I.icon,tools:N[I.id].sort((B,q)=>B.name.localeCompare(q.name))});return E});function k(_){i.value={...i.value,[_]:!i.value[_]}}async function A(){t.value=!0,s.value=null;try{const[_,N,E]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({})),W.get("/api/tools/builtins").catch(()=>null)]);f(E,_),a.value=N||{}}catch(_){s.value=_.message}t.value=!1}function T(){A()}return We(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,globalEnabled:o,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:C,totalUsage:O,filteredTools:g,groupedTools:S,usedCategories:b,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:ed,toggleExpand:k,refresh:T}}};function Aw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Rw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Iw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),v=h(null),C=h(null),O=h(!1),x=X(()=>e.value.length),g=X(()=>e.value.reduce((Q,fe)=>Q+(fe.execution_count||0),0)),b=X(()=>e.value.reduce((Q,fe)=>Q+N(fe.code),0)),S=X(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(Q)||(fe.description||"").toLowerCase().includes(Q))}),k=X(()=>u.value?u.value.split(`
`).length:0),A=X(()=>{const Q=Math.max(k.value,1);return Array.from({length:Q},(fe,De)=>De+1).join(`
`)}),T=X(()=>{const Q=u.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function _(Q){return Aw(Q)}function N(Q){return Q?Q.split(`
`).length:0}function E(Q){return Rw(Q)}function I(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function B(Q){try{await navigator.clipboard.writeText(Q);const fe=e.value.find(De=>De.code===Q);fe&&(r.value=fe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function q(Q){if(Q.key==="Tab"){Q.preventDefault();const fe=Q.target,De=fe.selectionStart,J=fe.selectionEnd;u.value=u.value.substring(0,De)+"    "+u.value.substring(J),Et(()=>{fe.selectionStart=fe.selectionEnd=De+4})}}function oe(Q){const fe=Q.target.previousElementSibling;fe&&(fe.scrollTop=Q.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function M(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const fe=await W.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:fe}}catch(fe){a.value={...a.value,[Q]:{result:fe.message,is_error:!0}}}i.value=null}function P(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function U(Q){o.value=!0,c.value="edit",d.value=Q.name,u.value=Q.code||"",p.value=null,f.value=null}function K(){o.value=!1,p.value=null,f.value=null}async function G(){p.value=null,f.value=null;const Q=d.value.trim(),fe=u.value.trim();if(!Q){p.value="Name is required";return}if(!fe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:Q,code:fe}),f.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(Q)}`,{code:fe}),f.value="Skill updated successfully"),await D(),setTimeout(()=>{o.value=!1},800)}catch(De){p.value=De.message}m.value=!1}function Y(Q){C.value=Q}async function ie(){if(C.value){O.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(C.value)}`),await D()}catch(Q){Ie.error(`Failed to delete skill: ${Q.message||"unknown error"}`)}O.value=!1,C.value=null}}return We(()=>{D()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:v,deleteTarget:C,deleting:O,enabledCount:x,totalExecutions:g,totalLines:b,displayedSkills:S,editLineCount:k,editorLineNums:A,editValidation:T,highlight:_,truncate:ed,formatTs:ka,countLines:N,getLineNumbers:E,toggleCode:I,copyCode:B,handleEditorKey:q,syncScroll:oe,fetchSkills:D,testSkill:M,showCreate:P,editSkill:U,cancelEdit:K,saveSkill:G,confirmDelete:Y,doDelete:ie}}};class Rs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Ow=/^[A-Za-z_][A-Za-z0-9_]*$/;function Hu(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function zu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Rs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Rs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Rs(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Rs(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function Lw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Nw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Rs("Server name is required.","name");if(a.length>128||!Ow.test(a))throw new Rs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Rs("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=Hu(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Rs("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Rs("An HTTP endpoint is required for this connection.","url");if(d&&!Lw(d))throw new Rs("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Rs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=Hu(e.allowlistText));const o=zu(e.headerRows,e.headersRemove,"Header"),c=zu(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function Pw(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Mw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Dw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Fw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function $w(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Bw=1e4,Uw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function oo(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Hw(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const zw={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),r=h({}),o=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(oo()),v=h(""),C=h(!1);let O=null,x=0,g=!1,b=!1;const S=Fw,k=X(()=>{var z;return((z=e.value)==null?void 0:z.servers)||[]}),A=X(()=>{var z;return!!((z=e.value)!=null&&z.enabled)}),T=X(()=>{var z,ve,Te,Oe;return{serverCount:((z=e.value)==null?void 0:z.server_count)||0,enabledCount:((ve=e.value)==null?void 0:ve.enabled_server_count)||0,connectedCount:((Te=e.value)==null?void 0:Te.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),_=X(()=>{var z;return((z=f.value)==null?void 0:z.header_keys)||[]}),N=X(()=>{var z;return((z=f.value)==null?void 0:z.env_keys)||[]}),E=X(()=>{var z;return u.value==="edit"&&((z=f.value)==null?void 0:z.transport)==="http"}),I=X(()=>u.value==="add"||!E.value),B=X(()=>E.value?"Replace endpoint URL":"Endpoint URL"),q=X(()=>E.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function oe(){D(),O=window.setInterval(()=>M({quiet:!0}),Bw)}function D(){O&&window.clearInterval(O),O=null}async function M({quiet:z=!1}={}){const ve=++x;z||(t.value=!0);try{const Te=await W.get("/api/mcp/status");if(ve!==x||!g)return;e.value=Te,n.value="";const Oe=new Set((Te.servers||[]).map(Pe=>Pe.name));i.value=new Set([...i.value].filter(Pe=>Oe.has(Pe)))}catch(Te){ve===x&&g&&(n.value=Te.message||"Failed to load MCP status")}finally{ve===x&&(t.value=!1)}}function P(z){return s.value||a.value.has(z)}function U(z,ve){const Te=new Set(a.value);ve?Te.add(z):Te.delete(z),a.value=Te}function K(z){return Mw(z.state)}function G(z){if(K(z)==="disabled"){if(!z.enabled)return"Disabled — server switch off";if(!A.value)return"Disabled — global MCP is off"}return Uw[K(z)]}function Y(z){return z.transport==="http"?"Streamable HTTP":"stdio"}function ie(z){return z.negotiated_version?`${z.era?`${String(z.era).charAt(0).toUpperCase()}${String(z.era).slice(1)}`:"Protocol"} · ${z.negotiated_version}`:"Not negotiated"}function Q(z){return z.discovered_count?`${z.published_count||0} published · ${z.excluded_count||0} excluded`:"No tools discovered"}const fe=h(new Set);async function De(z,ve){if(fe.value.has(z.name))return;const Te=!!ve.target.checked,Oe=new Set(fe.value);Oe.add(z.name),fe.value=Oe;try{const Pe=await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/enabled`,{enabled:Te});Pe&&Array.isArray(Pe.servers)?e.value=Pe:await M({quiet:!0})}catch(Pe){ve.target.checked=!!z.enabled,Ie.error(Pe.message||`Failed to toggle ${z.name}`)}finally{const Pe=new Set(fe.value);Pe.delete(z.name),fe.value=Pe}}async function J(z){if(z!==A.value&&!(!z&&!await Qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await W.post("/api/mcp/enabled",{enabled:z}),Ie.success(z?"MCP enabled":"MCP disabled"),await M({quiet:!0})}catch(ve){Ie.error(ve.message||"Failed to update MCP state"),await M({quiet:!0})}finally{s.value=!1}}}async function be(z){U(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/reconnect`,{}),Ie.success(`Reconnected ${z.name}`)}catch(ve){Ie.error(ve.message||`Failed to reconnect ${z.name}`)}finally{U(z.name,!1),await M({quiet:!0})}}async function H(z){U(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/refresh-tools`,{}),Ie.success(`Refreshed tools from ${z.name}`),await Le(z.name,!0)}catch(ve){Ie.error(ve.message||`Failed to refresh ${z.name}`)}finally{U(z.name,!1),await M({quiet:!0})}}async function re(z){if(await Qt({title:`Remove ${z.name}`,message:`Remove this saved MCP server? Its ${z.published_count||0} published tool${z.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){U(z.name,!0);try{await W.del(`/api/mcp/servers/${encodeURIComponent(z.name)}`),Ie.success(`Removed ${z.name}`),delete r.value[z.name]}catch(Te){Ie.error(Te.message||`Failed to remove ${z.name}`)}finally{U(z.name,!1),await M({quiet:!0})}}}async function ue(z){const ve=new Set(i.value);if(ve.has(z.name)){ve.delete(z.name),i.value=ve;return}ve.add(z.name),i.value=ve,Object.hasOwn(r.value,z.name)||await Le(z.name)}async function Le(z,ve=!1){if(!ve&&Object.hasOwn(r.value,z))return;const Te=new Set(c.value);Te.add(z),c.value=Te,o.value={...o.value,[z]:""};try{const Oe=await W.get(`/api/mcp/servers/${encodeURIComponent(z)}/tools`);r.value={...r.value,[z]:Oe.tools||[]}}catch(Oe){o.value={...o.value,[z]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(z),c.value=Oe}}function y(z){return(r.value[z]||[]).filter(ve=>Dw(ve,l.value[z]))}function L(z,ve){l.value={...l.value,[z]:ve}}function $(){u.value="add",p.value="",f.value=null,m.value=oo(),v.value="",d.value=!0}function ae(z){u.value="edit",p.value=z.name,f.value=z,m.value={...oo(),name:z.name,enabled:!!z.enabled,transport:z.transport||"stdio"},v.value="",d.value=!0}function te(){C.value||(d.value=!1)}function ne(z){d.value&&$w(z)}function he(z){const ve=z==="headers"?"headerRows":"envRows";m.value[ve].push({key:"",value:""})}function de(z,ve){const Te=z==="headers"?"headerRows":"envRows";m.value[Te].splice(ve,1)}function pe(z,ve){const Te=z==="headers"?"headersRemove":"envRemove",Oe=m.value[Te];m.value[Te]=Oe.includes(ve)?Oe.filter(Pe=>Pe!==ve):[...Oe,ve]}async function le(){var ve,Te;v.value="";let z;try{z=Nw(m.value,{mode:u.value,originalTransport:((ve=f.value)==null?void 0:ve.transport)||""})}catch(Oe){v.value=Oe instanceof Rs?Oe.message:"Invalid MCP server configuration",await Et(),(Te=document.querySelector(".mcp-editor"))==null||Te.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Pw(z,f.value)&&!await Qt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){C.value=!0;try{u.value==="add"?await W.post("/api/mcp/servers",z):await W.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,z),Ie.success(u.value==="add"?`Saved ${z.name}`:`Updated ${p.value}`),d.value=!1,await M({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{C.value=!1}}}let ke=null;function ye(z){`${(z==null?void 0:z.event)||""} ${(z==null?void 0:z.type)||""} ${(z==null?void 0:z.tool)||""} ${(z==null?void 0:z.message)||""}`.toLowerCase().includes("mcp")&&(ke&&window.clearTimeout(ke),ke=window.setTimeout(()=>M({quiet:!0}),200))}function _e(){g||(g=!0,b||(Qe.subscribe("events",ye),b=!0),M(),oe())}function ce(){g=!1,D(),ke&&window.clearTimeout(ke),ke=null,b&&(Qe.unsubscribe("events",ye),b=!1)}return We(_e),bs(_e),ds(ce),vt(ce),{status:e,loading:t,mutating:s,pageError:n,servers:k,masterEnabled:A,aggregate:T,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:v,saving:C,editorGroups:S,configuredHeaderKeys:_,configuredEnvKeys:N,savedHttpEndpoint:E,endpointRequired:I,endpointFieldLabel:B,endpointPlaceholder:q,refreshAll:M,busy:P,serverState:K,stateLabel:G,transportLabel:Y,protocolLabel:ie,toolSummary:Q,formatAge:Hw,setMasterEnabled:J,togglePending:fe,toggleServerEnabled:De,reconnect:be,refreshTools:H,removeServer:re,toggleTools:ue,filteredTools:y,setToolQuery:L,openAdd:$,openEdit:ae,closeEditor:te,jumpToEditorGroup:ne,addSecretRow:he,removeSecretRow:de,toggleSecretRemoval:pe,saveServer:le}}};function jw(e,t){if(!e||!t)return $u(e);const s=$u(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Vw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),v=h(null);let C=null;const O=h(null),x=h(!1),g=h({}),b=h({}),S=h({}),k=h({}),A=new Map,T=h(null),_=X(()=>e.value.reduce((G,Y)=>G+(Y.chunks||0),0)),N=X(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function E(G,Y){const ie=b.value[Y];if(!ie||ie.length===0)return 0;const Q=Math.max(...ie.map(fe=>fe.char_count||0));return Q===0?0:Math.round(G.char_count/Q*100)}async function I(){t.value=!0,s.value=null;try{const G=await W.get("/api/knowledge");e.value=Array.isArray(G)?G:[]}catch(G){s.value=G.message}t.value=!1}async function B(G){if(g.value[G]){g.value[G]=!1,T.value=null;return}if(g.value[G]=!0,Object.prototype.hasOwnProperty.call(b.value,G))return;if(A.has(G))return A.get(G);const Y={...k.value,[G]:!0};k.value=Y;const ie={...S.value};delete ie[G],S.value=ie;const Q=W.get(`/api/knowledge/${encodeURIComponent(G)}/chunks`).then(fe=>{b.value={...b.value,[G]:Array.isArray(fe)?fe:[]}}).catch(fe=>{S.value={...S.value,[G]:fe.message||"load failed"}}).finally(()=>{if(A.get(G)!==Q)return;A.delete(G);const fe={...k.value};delete fe[G],k.value=fe});return A.set(G,Q),Q}let q=0;async function oe(){const G=n.value.trim();if(!G)return;const Y=++q;i.value=!0,r.value=null,l.value=G;try{const ie=await W.get(`/api/knowledge/search?q=${encodeURIComponent(G)}`);if(Y!==q)return;a.value=Array.isArray(ie)?ie:[]}catch(ie){if(Y!==q)return;a.value=[],r.value=ie.message||"Search failed"}Y===q&&(i.value=!1)}function D(){q+=1,i.value=!1,a.value=null,n.value="",r.value=null}async function M(){u.value=null,p.value=null;const G=c.value.trim(),Y=d.value.trim();if(!G){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}f.value=!0;try{const ie=await W.post("/api/knowledge",{source:G,content:Y});p.value=`Ingested ${ie.chunks||0} chunks from "${G}"`,c.value="",d.value="",b.value={},await I(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(ie){u.value=ie.message}f.value=!1}async function P(G){m.value=G,v.value=null,C&&(clearTimeout(C),C=null);try{const Y=await W.post(`/api/knowledge/${encodeURIComponent(G)}/reingest`);v.value={source:G,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete b.value[G],await I(),C=setTimeout(()=>{v.value=null,C=null},3e3)}catch(Y){v.value={source:G,error:!0,message:Y.message}}m.value=null}function U(G){O.value=G}async function K(){if(O.value){x.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete b.value[O.value],await I()}catch(G){Ie.error(`Failed to delete source: ${G.message||"unknown error"}`)}x.value=!1,O.value=null}}return We(()=>{I()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:v,deleteTarget:O,deleting:x,expanded:g,sourceChunks:b,chunkErrors:S,loadingChunks:k,selectedChunk:T,totalChunks:_,uploaderCount:N,truncate:ed,formatTs:ka,highlightTerms:jw,chunkBarWidth:E,fetchSources:I,toggleSource:B,doSearch:oe,clearSearch:D,doIngest:M,doReingest:P,confirmDelete:U,doDelete:K}}},qw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),v=h(null),C=h(null),O=h(new Set),x=h(null),g=h(!1),b=h(!1),S=X(()=>e.value.reduce((Y,ie)=>Y+ie.count,0)),k=X(()=>O.value.size);function A(Y){const ie=t.value[Y];if(!ie)return[];if(!l.value.trim())return ie;const Q=l.value.trim().toLowerCase();return ie.filter(fe=>fe.key.toLowerCase().includes(Q)||fe.value&&fe.value.toLowerCase().includes(Q))}function T(Y,ie){return O.value.has(Y+"/"+ie)}function _(Y,ie){const Q=Y+"/"+ie,fe=new Set(O.value);fe.has(Q)?fe.delete(Q):fe.add(Q),O.value=fe}function N(Y){const ie=t.value[Y];return!ie||ie.length===0?!1:ie.every(Q=>O.value.has(Y+"/"+Q.key))}function E(Y,ie){const Q=t.value[Y];if(!Q)return;const fe=new Set(O.value);for(const De of Q){const J=Y+"/"+De.key;ie?fe.add(J):fe.delete(J)}O.value=fe}async function I(){s.value=!0,n.value=null;try{const Y=await W.get("/api/memory");e.value=Object.entries(Y).map(([ie,Q])=>({name:ie,keys:Q.keys||[],count:Q.count||0}))}catch(Y){n.value=Y.message}s.value=!1}async function B(Y){if(a.value[Y]){a.value[Y]=!1;return}a.value[Y]=!0;const ie=e.value.find(fe=>fe.name===Y);if(!ie||t.value[Y]||i.value===Y)return;i.value=Y;let Q;try{const De=(await W.get(`/api/memory/${encodeURIComponent(Y)}`)).entries||{};Q=ie.keys.map(J=>Object.prototype.hasOwnProperty.call(De,J)?{key:J,value:De[J]||"",failed:!1}:{key:J,value:"",failed:!0,error:"Not found in scope"})}catch(fe){Q=ie.keys.map(De=>({key:De,value:"",failed:!0,error:fe.message||"Failed to load"}))}t.value[Y]=Q,i.value=null}function q(Y,ie,Q){p.value=Y+"/"+ie,f.value=Q}async function oe(Y,ie){m.value=!0,v.value=null;try{await W.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`,{value:f.value});const Q=t.value[Y];if(Q){const fe=Q.find(De=>De.key===ie);fe&&(fe.value=f.value)}p.value=null}catch(Q){v.value=`Failed to save: ${Q.message||"unknown error"}`}m.value=!1}async function D(Y,ie){try{await navigator.clipboard.writeText(ie.value),C.value=Y+"/"+ie.key,setTimeout(()=>{C.value=null},1500)}catch{}}async function M(){d.value=null,u.value=null;const Y=o.value.scope.trim(),ie=o.value.key.trim(),Q=o.value.value.trim();if(!Y){d.value="Scope is required";return}if(!ie){d.value="Key is required";return}if(!Q){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`,{value:Q}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await I(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function P(Y,ie){x.value={scope:Y,key:ie}}async function U(){if(!x.value)return;g.value=!0,v.value=null;const{scope:Y,key:ie}=x.value;try{await W.del(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ie)}`);const Q=t.value[Y];Q&&(t.value[Y]=Q.filter(J=>J.key!==ie));const fe=e.value.find(J=>J.name===Y);fe&&(fe.count--,fe.keys=fe.keys.filter(J=>J!==ie));const De=new Set(O.value);De.delete(Y+"/"+ie),O.value=De}catch(Q){v.value=`Failed to delete: ${Q.message||"unknown error"}`}g.value=!1,x.value=null}function K(){b.value=!0}async function G(){g.value=!0,v.value=null;const Y=[];for(const ie of O.value){const Q=ie.indexOf("/");Y.push({scope:ie.slice(0,Q),key:ie.slice(Q+1)})}try{await W.post("/api/memory/bulk-delete",{entries:Y}),O.value=new Set,t.value={},await I()}catch(ie){v.value=`Bulk delete failed: ${ie.message||"unknown error"}`}g.value=!1,b.value=!1}return We(()=>{I()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:v,copied:C,selected:O,selectedCount:k,totalEntries:S,deleteTarget:x,deleting:g,showBulkDelete:b,fetchMemory:I,toggleScope:B,startEdit:q,doEdit:oe,copyValue:D,doAdd:M,confirmDelete:P,doDelete:U,confirmBulkDelete:K,doBulkDelete:G,isSelected:T,toggleSelect:_,isScopeAllSelected:N,toggleSelectAll:E,filteredEntries:A}}},Gw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=X(()=>[...new Set(e.value.map(C=>C.category))].sort()),o=X(()=>{const v={};return e.value.forEach(C=>{v[C.category]=(v[C.category]||0)+1}),v}),c=X(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await W.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,Ie.success("Entry updated"),await m()}catch(C){Ie.error(C.message||"Failed to save entry")}}async function f(v){if(await Qt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(v)),Ie.success("Entry deleted"),await m()}catch(O){Ie.error(O.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await W.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return We(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ka,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},Om=[{id:"tools",label:"Tools",component:Ew},{id:"skills",label:"Skills",component:Iw},{id:"mcp-servers",label:"MCP Servers",component:zw},{id:"knowledge",label:"Knowledge",component:Vw},{id:"memory",label:"Memory",component:qw},{id:"learned",label:"Learned",component:Gw}],Kw={components:{TabbedPage:Ur},setup(){return{tabs:Om}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Ww={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Zw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Jw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Yw={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=X(()=>e.value.components||[]),l=X(()=>Jw[e.value.overall]||"text-gray-400"),r=X(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=X(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return Ww[k]||"text-gray-400"}function d(k){return Zw[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function f(k){return k.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function v(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function C(){a.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null,n.value=!0}catch(k){s.value=k.message}finally{t.value=!1,a.value=!1}}function O(){t.value=!0,s.value=null,C()}let x=null,g=!1;function b(){g||(g=!0,C(),x||(x=setInterval(C,3e4)))}function S(){g&&(g=!1,x&&(clearInterval(x),x=null))}return We(b),bs(b),ds(S),vt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:v,fetchHealth:C,retry:O}}},Qw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=X(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=X(()=>{if(!i.value)return[];const C=i.value,O=C.storage_total_bytes||1;return[{label:"Session Persistence",mb:C.sessions.persist_dir.total_mb,bytes:C.sessions.persist_dir.total_bytes,files:C.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(C.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:C.knowledge.db_file.total_mb,bytes:C.knowledge.db_file.total_bytes,files:C.knowledge.db_file.file_count,pct:Math.min(100,Math.round(C.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:C.trajectories.message_dir.total_mb,bytes:C.trajectories.message_dir.total_bytes,files:C.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(C.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:C.trajectories.agent_dir.total_mb,bytes:C.trajectories.agent_dir.total_bytes,files:C.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(C.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const C=await W.get("/api/resource-usage");i.value=C,t.value=null,s.value=!0}catch(C){t.value=C.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function v(){f&&(f=!1,l&&(clearInterval(l),l=null))}return We(m),bs(m),ds(v),vt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:Tm,refresh:u,retry:p}}},Xw=["INFO","WARNING","ERROR"],ek=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],co=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],tk=[50,100,200,500],sk={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Qe.state||"disconnected"),c=X(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,m=Xw,v=ek,C=co,O=h("all"),x=h(""),g=h([]),b=h(!1),S=h(""),k=h([]);function A(){try{const V=localStorage.getItem("odin-log-presets");V&&(g.value=JSON.parse(V))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const _=X(()=>a.value!==""||i.value.trim()!==""||x.value!==""),N=X(()=>{const V=co.find(me=>me.value===x.value);return V?V.label:""}),E=X(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),I=24,B=X(()=>{if(K.value.length===0)return[];const V=[],me=new Date,Ne=3600*1e3;for(let Ze=I-1;Ze>=0;Ze--){const dt=new Date(me.getTime()-(Ze+1)*Ne),Ot=new Date(me.getTime()-Ze*Ne);V.push({start:dt,end:Ot,label:M(dt,Ot),shortLabel:Ot.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ze of K.value){if(!Ze._time)continue;const dt=Ze._time.getTime();for(const Ot of V)if(dt>=Ot.start.getTime()&&dt<Ot.end.getTime()){Ot.total++,Ze.level==="ERROR"?Ot.errors++:Ze.level==="WARNING"?Ot.warnings++:Ot.info++;break}}return V}),q=X(()=>{let V=1;for(const me of B.value)me.total>V&&(V=me.total);return V}),oe=X(()=>{if(B.value.length===0)return"";const V=K.value.map(Ze=>Ze._time&&Ze._time.getTime()).filter(Boolean);if(V.length===0)return"";const me=new Date(Math.min(...V));return`${K.value.length} shown, oldest ${me.toLocaleTimeString()}`}),D=X(()=>Math.ceil(I/8));function M(V,me){const Ne={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Ne)+" - "+me.toLocaleTimeString([],Ne)}function P(V,me){return!me||!V?"0px":Math.max(2,V/me*100)+"%"}function U(V){const me=K.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=V.start.getTime()&&Ne._time.getTime()<V.end.getTime());if(me>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[me]&&(Ne[me].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const K=X(()=>{let V=t.value;if(a.value&&(V=V.filter(me=>(me.level||"INFO")===a.value)),x.value){const me=co.find(Ne=>Ne.value===x.value);if(me&&me.seconds){const Ne=new Date(Date.now()-me.seconds*1e3);V=V.filter(Ze=>Ze._time&&Ze._time>=Ne)}}if(i.value&&!E.value)if(l.value)try{const me=new RegExp(i.value,"i");V=V.filter(Ne=>{const Ze=Ne.text||Ne.raw||"",dt=Ne.tool||"";return me.test(Ze)||me.test(dt)})}catch{}else{const me=i.value.toLowerCase();V=V.filter(Ne=>{const Ze=(Ne.text||Ne.raw||"").toLowerCase(),dt=(Ne.tool||"").toLowerCase();return Ze.includes(me)||dt.includes(me)})}return V});function G(V){if(V.type==="log"&&V.line)try{const me=typeof V.line=="string"?JSON.parse(V.line):V.line,Ne=me.timestamp?new Date(me.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:me.error?"ERROR":"INFO",text:me.tool_name?`[${me.tool_name}] ${me.result_summary||""}`.trim():me.message||JSON.stringify(me),tool:me.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const me=V.payload,Ne=me.timestamp?new Date(me.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:me.error?"ERROR":"INFO",text:me.tool_name?`[${me.tool_name}] ${me.result_summary||""}`.trim():me.message||JSON.stringify(me),tool:me.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function Y(V){const me=G(V);if(s.value){k.value.push(me);return}ie(me)}function ie(V){t.value.push(V),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Et(()=>Q())}function Q(V=!1){const me=d.value;me&&me.scrollTo({top:me.scrollHeight,behavior:V?"smooth":"instant"})}function fe(){n.value=!0,u.value=!1,Et(()=>Q(!0))}const De=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function J(){const V=d.value;if(!V)return;const me=V.scrollHeight-V.scrollTop-V.clientHeight<40;u.value=!n.value&&!me&&t.value.length>0,ue.value&&be()}function be(){const V=d.value;!V||!n.value||V.scrollHeight-V.scrollTop-V.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function H(){n.value&&requestAnimationFrame(be)}function re(V){De.has(V.key)&&H()}const ue=h(!1);function Le(){n.value&&(ue.value=!0,requestAnimationFrame(be))}function y(){ue.value&&(ue.value=!1,be())}function L(){n.value&&(u.value=!1,Et(()=>Q()))}function $(){if(s.value=!s.value,!s.value&&k.value.length>0){for(const V of k.value)ie(V);k.value=[]}}function ae(){t.value=[],k.value=[],u.value=!1}function te(){let V;e.value==="search"?V=Ue.value.map(dt=>{const Ot=dt.error?"ERROR":"INFO",Wn=dt.tool_name?`[${dt.tool_name}] `:"";return`${dt.timestamp||""} ${Ot} ${Wn}${dt.result_summary||dt.message||""}`}).join(`
`):V=K.value.map(dt=>`${dt.ts} ${dt.level} ${dt.text}`).join(`
`);const me=new Blob([V],{type:"text/plain"}),Ne=URL.createObjectURL(me),Ze=document.createElement("a");Ze.href=Ne,Ze.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ze.click(),URL.revokeObjectURL(Ne)}function ne(V,me){const Ne=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=me,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function he(V){a.value=a.value===V?"":V,O.value="all"}function de(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function pe(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function le(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function ke(V){O.value=V.id;const me=V.filters;a.value=me.level||"",x.value=me.timeRange||"",i.value=me.text||"",me.levels&&(a.value=me.levels[0]||""),me.hasToolName&&(i.value="")}function ye(V){O.value=V.id,a.value=V.filters.level||"",x.value=V.filters.timeRange||"",i.value=V.filters.text||""}function _e(){if(!S.value.trim())return;const V={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:x.value,text:i.value}};g.value=[...g.value,V],T(),b.value=!1,S.value=""}function ce(V){g.value=g.value.filter(me=>me.id!==V),T(),O.value===V&&(O.value="all")}const z=h("all"),ve=h(""),Te=h(""),Oe=h(""),Pe=h(""),ot=h(""),lt=h(100),Mt=tk,se=h(!1),we=h(!1),Ce=h(""),Ue=h([]),gt=h(null),Ge=h(null);function ct(){e.value="search",gt.value||Vs()}async function Vs(){try{gt.value=await W.get("/api/logs/stats")}catch{}}function Cs(){const V=ot.value;if(!V){Oe.value="",Pe.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Ne){const Ze=new Date(Date.now()-Ne*1e3);Oe.value=Ms(Ze),Pe.value=""}}function Ms(V){const me=Ne=>String(Ne).padStart(2,"0");return`${V.getFullYear()}-${me(V.getMonth()+1)}-${me(V.getDate())}T${me(V.getHours())}:${me(V.getMinutes())}`}function $t(V){if(!V)return"";const me=new Date(V);return isNaN(me.getTime())?"":me.toISOString()}async function Vt(){se.value=!0,Ce.value="",we.value=!0,Ge.value=null;try{const V=new URLSearchParams;z.value&&z.value!=="all"&&V.set("level",z.value),ve.value&&V.set("tool",ve.value),Te.value&&V.set("q",Te.value);const me=$t(Oe.value),Ne=$t(Pe.value);me&&V.set("start",me),Ne&&V.set("end",Ne),V.set("limit",String(lt.value));const Ze=await W.get(`/api/logs/search?${V.toString()}`);Ue.value=Ze.entries||[]}catch(V){Ce.value=V.message||"Search failed",Ue.value=[]}finally{se.value=!1}}function an(){z.value="all",ve.value="",Te.value="",Oe.value="",Pe.value="",ot.value="",lt.value=100,Ue.value=[],we.value=!1,Ce.value="",Ge.value=null}function qs(V){Ge.value=Ge.value===V?null:V}function Gs(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function Ks(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Ds(V){return V.error?"log-line-error":"text-gray-300"}function On(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let yt=null,Fs=!1;function Kn(){Fs||(Fs=!0,Qe.subscribe("logs",Y),r.value=Qe.connected,o.value=Qe.state||"disconnected",yt=Qe.onState(V=>{o.value=V,r.value=V==="connected"}))}function Ye(){Fs&&(Fs=!1,Qe.unsubscribe("logs",Y),yt&&(yt(),yt=null))}return We(()=>{A(),window.addEventListener("pointerup",y),window.addEventListener("pointercancel",y)}),bs(Kn),ds(Ye),vt(()=>{Ye(),window.removeEventListener("pointerup",y),window.removeEventListener("pointercancel",y)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:K,pauseBuffer:k,showJumpBottom:u,copiedIndex:p,regexError:E,levels:m,logPresets:v,timeRanges:C,timeRange:x,activeLogPreset:O,customLogPresets:g,showSaveLogPreset:b,newLogPresetName:S,hasActiveLogFilters:_,timeRangeLabel:N,timelineBuckets:B,timelineMax:q,timelineSpanLabel:oe,timelineLabelSkip:D,togglePause:$,clearLogs:ae,exportLogs:te,logLineClass:de,levelClass:pe,levelChipClass:le,toggleLevel:he,copyLine:ne,jumpToBottom:fe,onScroll:J,onUserScrollIntent:H,onUserScrollKey:re,onAutoScrollToggle:L,onPointerDown:Le,applyLogPreset:ke,applyCustomLogPreset:ye,saveLogCustomPreset:_e,removeLogCustomPreset:ce,segmentHeight:P,jumpToTimelineBucket:U,searchLevel:z,searchTool:ve,searchKeyword:Te,searchStart:Oe,searchEnd:Pe,searchTimePreset:ot,searchLimit:lt,searchLimits:Mt,searching:se,searchRan:we,searchError:Ce,searchResults:Ue,searchStats:gt,expandedSearch:Ge,switchToSearch:ct,runSearch:Vt,clearSearchFilters:an,toggleSearchExpand:qs,formatSearchTs:Gs,searchEntryText:Ks,searchLogLineClass:Ds,formatJson:On,applySearchTimePreset:Cs}}};function Cl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const nk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function ak(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Za=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],ik={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},uo=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),lk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function ju(e){return lk.some(t=>e===t||e.startsWith(`${t}.`))}const Lm="odin_config_center_expanded_v1",Nm="odin_config_center_category_v1",rk=50,ok=650,po=()=>W.get("/api/config/meta");function ia(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Mi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Oa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function ck(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function dk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Pm(e,t){if(Mi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ia(t);const n={};for(const[a,i]of Object.entries(t)){const l=Pm(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function uk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Pm(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Mm(e,t,s,n){if(Mi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Mm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function pk(){try{const e=JSON.parse(localStorage.getItem(Lm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function fk(){try{const e=localStorage.getItem(Nm);return Za.some(t=>t.key===e)?e:Za[0].key}catch{return Za[0].key}}const hk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(fk()),m=h(pk()),v=h({}),C=h({}),O=h(""),x=h({}),g=h({}),b=h([]),S=h([]),k=h(!1),A=h(!1),T=h(!1);let _=null,N=null,E={path:null,at:0},I=0;const B=X(()=>{var w;return(((w=t.value)==null?void 0:w.fields)||[]).filter(F=>!uo.has(F.path.split(".")[0])&&!ju(F.path))}),q=X(()=>new Map(B.value.map(w=>[w.path,w]))),oe=X(()=>K.value.reduce((w,F)=>w+F.sections.length,0)),D=X(()=>B.value.length),M=X(()=>nk),P=X(()=>b.value.length>0),U=X(()=>S.value.length>0),K=X(()=>{if(!e.value)return[];const w=new Set(Za.flatMap(xe=>xe.sections)),F=Za.map(xe=>({...xe,sections:xe.sections.filter(Xe=>Object.hasOwn(e.value,Xe)&&!uo.has(Xe))})).filter(xe=>xe.sections.length),Z=Object.keys(e.value).filter(xe=>!w.has(xe)&&!uo.has(xe));return Z.length&&F.push({key:"other",label:"Other",icon:"folder",sections:Z}),F}),G=X(()=>e.value?{...e.value,...v.value}:null),Y=X(()=>{if(!e.value)return[];const w=[];for(const[F,Z]of Object.entries(v.value))Mm(e.value[F],Z,F,w);return w.filter(F=>!Mi(F.oldVal,F.newVal)).map(F=>{const Z=L(F.path);return{...F,label:(Z==null?void 0:Z.label)||Oa(F.path.split(".").at(-1)),apply_mode:(Z==null?void 0:Z.apply_mode)||he(F.path.split(".")[0])}})}),ie=X(()=>Y.value.length>0),Q=X(()=>Y.value.length),fe=X(()=>new Set(Y.value.map(w=>w.path.split(".")[0])).size),De=X(()=>!!u.value||p.value!=="all"),J=X(()=>{const w={...g.value};for(const F of Y.value){const Z=L(F.path),xe=Ta(Z,F.newVal);xe&&(w[F.path]=xe)}return w}),be=X(()=>Object.keys(J.value).length>0),H=X(()=>e.value?(De.value?K.value:K.value.filter(F=>F.key===f.value)).map(F=>({...F,sections:F.sections.filter(Z=>se(Z))})).filter(F=>F.sections.length):[]),re=X(()=>{const w=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],F=new Map(w.map(Z=>[Z,[]]));for(const Z of Y.value){const xe=F.has(Z.apply_mode)?Z.apply_mode:"restart";F.get(xe).push(Z)}return w.filter(Z=>F.get(Z).length).map(Z=>({key:Z,label:ys(Z),entries:F.get(Z)}))}),ue=X(()=>Y.value.filter(w=>w.apply_mode==="restart").length),Le=X(()=>B.value.filter(w=>w.pending_restart)),y=X(()=>Le.value.length);function L(w){const F=q.value.get(w);return F?{...F,apply_details:Cl([F])}:null}function $(w){const F=`${w}.`;return B.value.filter(Z=>Z.path===w||Z.path.startsWith(F))}function ae(w){return $(w).length}function te(w){return Oa(w)}function ne(w){const F=$(w);if(!F.length)return`${Oa(w)} configuration.`;const Z=F.find(qt=>qt.sensitivity==="public"&&qt.description)||F.find(qt=>qt.description),xe=(Z==null?void 0:Z.description)||"";return xe.match(/setting for (.+)\.$/i)?`${Oa(w)} settings and runtime behaviour.`:xe}function he(w){const F=[...new Set($(w).map(Z=>Z.apply_mode))];return F.length===1?F[0]:F.includes("restart")?"restart":F.includes("activation_required")?"activation_required":F[0]||"restart"}function de(w){const F=[...new Set($(w).map(Z=>ys(Z.apply_mode)))];return F.length?F.length===1?F[0]:`Mixed apply behaviour: ${F.join(" · ")}`:""}function pe(w){return Cl($(w))}function le(w){var F;return Object.hasOwn(v.value,w)?v.value[w]:(F=e.value)==null?void 0:F[w]}function ke(){const w=le("mcp")||{},F=Object.keys(w.servers||{}).length;return`${w.enabled?"Globally enabled":"Globally disabled"} · ${F} configured server${F===1?"":"s"}.`}function ye(w,F){return F.split(".").reduce((Z,xe)=>Z==null?void 0:Z[xe],w)}function _e(w){const F=G.value;return $(w).filter(Z=>ju(Z.path)?!1:Z.path.split(".").length<=2?!0:!Z.path.includes(".*")).map(Z=>({...Z,key:Z.path.split(".").at(-1),value:ye(F,Z.path),apply_details:Cl([Z]),editor:Z.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ce(w){const F=w.path.split(".");return F.length>2?F.slice(0,2).join("."):null}function z(w){const F=new Map;for(const Z of _e(w)){const xe=ce(Z),Xe=xe||`${w}.__root`;F.has(Xe)||F.set(Xe,{key:Xe,path:xe,entries:[]}),F.get(Xe).entries.push(Z)}return[...F.values()].map(Z=>{const xe=Z.entries.find(Xe=>Xe.group_description);return{...Z,label:Z.path?Oa(Z.path.split(".").at(-1)):null,description:(xe==null?void 0:xe.group_description)||null,apply_details:Cl(Z.entries),runtime_summaries:Te(Z.entries)}})}function ve(w){return{save:w.save_effect||(w.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:w.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[w.apply_mode]||"Effective runtime state is not currently observable."}}function Te(w){const F=new Map;for(const Z of w){const xe=ve(Z),Xe=`${Z.apply_mode}|${xe.save}|${xe.runtime}`;F.has(Xe)||F.set(Xe,{key:Xe,label:ys(Z.apply_mode),save:xe.save,runtime:xe.runtime})}return[...F.values()]}function Oe(w){if(Pe(w))return w.runtime_effect||w.activation_policy||"";if(w.apply_mode==="activation_required"){const F=w.activation_policy||w.runtime_effect;return F?`Not active after saving. No activation control exists in this release. ${F}`:"Not active after saving; no activation control exists in this release."}return""}function Pe(w){return w.action_available===!0&&!!(w.action_label&&w.action_endpoint)}async function ot(w){if(Pe(w))try{if(Ge(w.path))throw new Error("Save this setting before applying its action.");const F=String(w.action_method||"POST").toLowerCase(),Z={post:W.post.bind(W),put:W.put.bind(W),delete:W.del.bind(W)}[F];if(!Z)throw new Error("Unsupported configuration action");await Z(w.action_endpoint,w.action_body||void 0),await ee(),ts("success",`${w.action_label} completed.`)}catch(F){ts("error",F.message||`${w.action_label} failed`)}}function lt(w,F){return[w.label,w.path,w.description,...w.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(F)}function Mt(w){const F=u.value.trim().toLowerCase();return F?$(w).filter(Z=>lt(Z,F)):[]}function se(w){const F=$(w);if(p.value!=="all"&&!F.some(xe=>xe.apply_state===p.value))return!1;const Z=u.value.trim().toLowerCase();return!Z||`${te(w)} ${w}`.toLowerCase().includes(Z)?!0:F.some(xe=>lt(xe,Z))}function we(w,F){return $(w).filter(Z=>Z.apply_state===F).length}function Ce(w){return w==="all"?D.value:B.value.filter(F=>F.apply_state===w).length}function Ue(w){const F=w.sections.flatMap(Z=>$(Z));return{fields:F.length,modified:Y.value.filter(Z=>w.sections.includes(Z.path.split(".")[0])).length,pending_restart:F.filter(Z=>Z.apply_state==="pending_restart").length,invalid:F.filter(Z=>Z.apply_state==="invalid").length,dormant:F.filter(Z=>Z.apply_state==="dormant").length}}function gt(w){var F;return Object.hasOwn(v.value,w)&&!Mi((F=e.value)==null?void 0:F[w],v.value[w])}function Ge(w){return Y.value.some(F=>F.path===w||F.path.startsWith(`${w}.`))}function ct(w){f.value=w,u.value="",p.value="all";try{localStorage.setItem(Nm,w)}catch{}}function Vs(w){p.value=w}function Cs(){u.value="",p.value="all"}function Ms(w){var F;return((F=K.value.find(Z=>Z.sections.includes(w)))==null?void 0:F.sections)||[]}function $t(w){const F=Ms(w),Z=F.find(xe=>m.value[xe]===!0);return Z||F.find(xe=>m.value[xe]!==!1)||null}function Vt(w){return u.value&&!T.value&&se(w)?!0:T.value?$t(w)===w:Object.hasOwn(m.value,w)?m.value[w]===!0:!0}function an(w){const F=!Vt(w);if(T.value){const Z={...m.value};for(const xe of Ms(w))Z[xe]===!0&&(Z[xe]=!1);Z[w]=F,m.value=Z;return}m.value={...m.value,[w]:F}}function qs(){b.value.push(ia(v.value)),b.value.length>rk&&b.value.shift(),S.value=[]}function Gs(){ie.value&&(qs(),v.value={},g.value={},k.value=!1)}function Ks(w,F=!1){const Z=Date.now();if(F&&E.path===w&&Z-E.at<ok){E.at=Z;return}qs(),E={path:w,at:Z}}function Ds(w,F,Z){if(!F.length)return Z;const xe=ia(w??{});let Xe=xe;for(let qt=0;qt<F.length-1;qt+=1){const rn=F[qt];Xe[rn]=ia(Xe[rn]??{}),Xe=Xe[rn]}return Xe[F.at(-1)]=Z,xe}function On(w){var F;return Object.hasOwn(v.value,w)?v.value[w]:ia((F=e.value)==null?void 0:F[w])}function yt(w,F,Z={}){var dd;const[xe,...Xe]=w.path.split(".");Ks(w.path,!!Z.coalesce);const qt=On(xe),rn=Xe.length?Ds(qt,Xe,F):F,ea={...v.value};if(Mi(rn,(dd=e.value)==null?void 0:dd[xe])?delete ea[xe]:ea[xe]=rn,v.value=ea,g.value[w.path]){const ud={...g.value};delete ud[w.path],g.value=ud}}function Fs(w){E={path:null,at:0},C.value={...C.value,[w]:String(ye(G.value,w)??"")}}function Kn(w){if(E={path:null,at:0},!Object.hasOwn(C.value,w))return;const F={...C.value};delete F[w],C.value=F}function Ye(w){const F=C.value[w.path];if(E={path:null,at:0},F===""){g.value={...g.value,[w.path]:"Enter a number."};return}const Z=Number(F);if(Number.isNaN(Z)||w.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[w.path]:w.type==="integer"?"Enter a whole number.":"Enter a number."};return}const xe={...C.value};delete xe[w.path],C.value=xe,yt(w,Z,{coalesce:!0})}function V(w){return Object.hasOwn(C.value,w.path)?C.value[w.path]:w.value??""}function me(w,F){if(C.value={...C.value,[w.path]:F},F===""){g.value={...g.value,[w.path]:"Enter a number."};return}const Z=Number(F);if(!Number.isFinite(Z)||w.type==="integer"&&!Number.isInteger(Z)){g.value={...g.value,[w.path]:w.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[w.path]){const xe={...g.value};delete xe[w.path],g.value=xe}yt(w,Z,{coalesce:!0})}function Ne(w){const F=Number.parseInt(O.value,10);if(!Number.isInteger(F)||F<1){g.value={...g.value,[w.path]:"Warning thresholds must be positive whole numbers."};return}const Z=[...new Set([...w.value||[],F])].sort((xe,Xe)=>Xe-xe);O.value="",yt(w,Z)}function Ze(w,F){yt(w,(w.value||[]).filter(Z=>Z!==F))}function dt(w){return w.apply_mode==="live_read"?"Odin reads the saved file value on next use.":w.apply_mode==="live_for_new_work"?"New work uses the saved file value.":w.apply_mode==="live_apply"?w.apply_handler?`Apply the saved value through ${w.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":w.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":w.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":w.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function Ot(w){return w.type==="array"&&Array.isArray(w.value)&&!w.structured_container&&!w.structured_container_child&&w.sensitivity==="public"&&w.value.every(F=>["string","number","boolean"].includes(typeof F))}function Wn(w){const F=String(x.value[w.path]??"").trim();if(!F)return;const Z=[...new Set([...w.value||[],F])];x.value={...x.value,[w.path]:""},yt(w,Z)}function es(w,F){yt(w,(w.value||[]).filter(Z=>Z!==F))}function Ta(w,F){var xe;if(!w)return null;if((xe=w.enum)!=null&&xe.length&&!w.enum.includes(F))return`Choose one of: ${w.enum.join(", ")}`;if(w.path==="agents.final_warning_iterations"&&(!Array.isArray(F)||!F.length))return"Add at least one warning threshold.";const Z=w.constraints||{};if((w.type==="integer"||w.type==="number")&&typeof F=="number"){if(Z.minimum!==void 0&&F<Z.minimum)return`Must be at least ${Z.minimum}${w.unit?` ${w.unit}`:""}`;if(Z.maximum!==void 0&&F>Z.maximum)return`Must be at most ${Z.maximum}${w.unit?` ${w.unit}`:""}`}return null}function $s(w){return J.value[w.path]||null}function ui(w){const F=`${w}.`;return Object.keys(J.value).some(Z=>Z===w||Z.startsWith(F))}function Ca(){b.value.length&&(S.value.push(ia(v.value)),v.value=b.value.pop(),g.value={},C.value={},E={path:null,at:0})}function Zn(){S.value.length&&(b.value.push(ia(v.value)),v.value=S.value.pop(),g.value={},C.value={},E={path:null,at:0})}function Ea(){!ie.value||be.value||(k.value=!0,A.value=!1)}function Jn(){k.value=!1}function Ln(){Gs()}function ys(w){return ik[w]||Oa(w||"unknown")}function ln(w){return`apply-${String(w||"unknown").replaceAll("_","-")}`}function j(w){return`cfgc-field-${w.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Se(w){return`${j(w)}-input`}function Re(w){const F=document.getElementById(j(w))||document.getElementById(j(w.split(".").slice(0,2).join(".")));F==null||F.scrollIntoView({behavior:"smooth",block:"center"})}function ts(w,F){l.value={type:w,message:F},window.setTimeout(()=>{var Z;((Z=l.value)==null?void 0:Z.message)===F&&(l.value=null)},3500)}function Yn(){o.value=!1,p.value="pending_restart",u.value="";const w=ak(n.value);w&&(w.scrollTop=0)}function Qn(){o.value=!1}function Xn(w=1800){N&&window.clearTimeout(N),N=window.setTimeout(pi,w)}async function pi(){if(c.value){if(I+=1,I>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await po(),y.value===0){c.value=!1,d.value=null,ts("success","Odin restarted and the saved startup settings are active.");return}}catch{}Xn(2e3)}}async function Ee(){if(!c.value){d.value=null;try{await W.post("/api/restart",{}),c.value=!0,I=0,o.value=!1,Xn()}catch(w){d.value=w.message||"Odin could not schedule a restart."}}}async function R(){if(!(!ie.value||be.value||a.value)){a.value=!0;try{const w=uk(e.value,v.value),F=await W.put("/api/config",w);e.value=F,v.value={},b.value=[],S.value=[],g.value={},k.value=!1;try{t.value=await po(),r.value=null,o.value=y.value>0,ts("success",y.value?`Configuration saved. ${y.value} setting${y.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Z){r.value=Z.message||"Unknown metadata error.",ts("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(w){ts("error",w.message||"Configuration could not be saved")}finally{a.value=!1}}}async function ee(){var w,F;if(!ie.value){s.value=!0,i.value=null;try{const Z=await W.get("/api/config"),xe=await po();e.value=Z,t.value=xe,r.value=null;const Xe=K.value;if(Xe.some(qt=>qt.key===f.value)||(f.value=((w=Xe[0])==null?void 0:w.key)||Za[0].key),T.value){const rn=(((F=Xe.find(ea=>ea.key===f.value))==null?void 0:F.sections)||[]).find(ea=>m.value[ea]===!0);m.value=rn?{...m.value,[rn]:!0}:{}}}catch(Z){i.value=Z.message||"Unknown configuration error"}finally{s.value=!1}}}function ge(w){if(k.value||!(w.ctrlKey||w.metaKey))return;const F=w.target;F instanceof HTMLElement&&(F.matches("input, textarea, select")||F.isContentEditable)||(!w.shiftKey&&w.key.toLowerCase()==="z"?(w.preventDefault(),Ca()):(w.key.toLowerCase()==="y"||w.shiftKey&&w.key.toLowerCase()==="z")&&(w.preventDefault(),Zn()))}function Me(w){T.value=w.matches}rs(m,w=>{try{localStorage.setItem(Lm,JSON.stringify(w))}catch{}},{deep:!0});let $e=!1;function He(){$e||($e=!0,document.addEventListener("keydown",ge))}function bt(){$e&&($e=!1,document.removeEventListener("keydown",ge))}return We(()=>{var w;ee(),He(),_=window.matchMedia("(max-width: 760px)"),Me(_),(w=_.addEventListener)==null||w.call(_,"change",Me)}),bs(He),ds(bt),vt(()=>{var w;bt(),(w=_==null?void 0:_.removeEventListener)==null||w.call(_,"change",Me),N&&window.clearTimeout(N)}),{armKeydown:He,disarmKeydown:bt,handleKeydown:ge,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:k,mobileOverflowOpen:A,warningThresholdInput:O,arrayInputs:x,healthFilters:M,visibleCategories:K,displayGroups:H,reviewGroups:re,sectionCount:oe,fieldCount:D,hasChanges:ie,changeCount:Q,changedSectionCount:fe,hasDraftErrors:be,canUndo:P,canRedo:U,globalFilterActive:De,reviewRestartCount:ue,pendingRestartCount:y,pendingRestartFields:Le,healthCount:Ce,categoryStats:Ue,selectCategory:ct,selectHealthFilter:Vs,clearFilters:Cs,sectionLabel:te,sectionDescription:ne,sectionFieldCount:ae,sectionHealthCount:we,sectionApplySummary:de,sectionApplyDetails:pe,sectionEntries:_e,fieldGroups:z,sectionSearchHits:Mt,mcpConfigSummary:ke,fieldRuntimeCopy:ve,fieldSpecificRuntimeNote:Oe,hasHonestAction:Pe,runFieldAction:ot,sectionChanged:gt,fieldChanged:Ge,isSectionExpanded:Vt,toggleSection:an,discardAllDrafts:Gs,setFieldValue:yt,setNumberFieldValue:me,numberInputValue:V,beginInputEdit:Fs,endTextInputEdit:Kn,endInputEdit:Ye,addWarningThreshold:Ne,removeWarningThreshold:Ze,isScalarArray:Ot,addScalarArrayItem:Wn,removeScalarArrayItem:es,fieldError:$s,sectionHasErrors:ui,undo:Ca,redo:Zn,openReview:Ea,closeReview:Jn,mobileCancel:Ln,applyModeLabel:ys,applyClass:ln,compactValue:ck,formatValue:dk,structuredApplyCopy:dt,fieldId:j,fieldInputId:Se,focusField:Re,fetchConfig:ee,saveConfig:R,restartOdin:Ee,restartLater:Qn,reviewPendingRestart:Yn}}},mk=/^\d{15,25}$/;function Dm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Fm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=X(()=>new Set((e.excludedIds||[]).map(String))),r=X(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:S?u(k).toLowerCase().includes(S)||String(k.username||"").toLowerCase().includes(S)||String(k.id).includes(S):!0)}),o=X(()=>{const S=s.value.trim();return r.value.length===0&&mk.test(S)&&!l.value.has(S)?S:""}),c=X(()=>r.value.length+(o.value?1:0)),d=X(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Dm(S)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function v(){a.value=Math.max(a.value-1,0)}function C(){const S=r.value[a.value];S?O(S):o.value&&a.value===r.value.length&&x(o.value)}function O(S){x(String(S.id))}function x(S){t("select",S),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return We(()=>{e.autofocus&&Et(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:v,selectHighlighted:C,selectMember:O,selectId:x,closeOptions:g,onBlur:b}}};function Vu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const vk={components:{DiscordUserCombobox:Fm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=X(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=X(()=>new Map(c.value.map(D=>[String(D.id),D])));function m(D){return D.config&&D.config.enabled!==void 0?D.config.enabled:!0}function v(D){return Vu(D,"require_mention",a.value)}function C(D){return Vu(D,"respond_to_bots",a.value)}function O(D){return D.config&&Object.keys(D.config).length>0}function x(D){n.value[D]=!n.value[D]}function g(D){const M=D.discord||{};return{allowed_users:[...M.allowed_users||[]],channels:[...M.channels||[]],respond_to_bots:!!M.respond_to_bots,require_mention:!!M.require_mention,ignore_bot_ids:[...M.ignore_bot_ids||[]]}}async function b({showLoading:D=!0}={}){const M=++d;D&&(t.value=!0),s.value=null;try{const P=await W.get("/api/discord/guilds");M===d&&(e.value=P)}catch(P){M===d&&(s.value=P.message)}finally{D&&M===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[D,M,P]=await Promise.all([W.get("/api/discord/guilds"),W.get("/api/discord/members").catch(()=>[]),W.get("/api/config")]),U=g(P),K=p.value;a.value=U,K||(i.value=JSON.parse(JSON.stringify(U))),c.value=M,e.value=D,r.value=null}catch(D){s.value=D.message}finally{t.value=!1}}let k=Promise.resolve();const A=h(new Set);function T(D,M){const P=new Set(A.value);P.add(D),A.value=P;const U=k.then(M);return k=U.catch(()=>{}),U.finally(()=>{const K=new Set(A.value);K.delete(D),A.value=K})}function _(D,M,P,U){const K=(U==null?void 0:U.target)??null;return T(`guild:${D}:${M}`,async()=>{try{await W.put("/api/discord/guild/"+D+"/config",{[M]:P}),await b({showLoading:!1})}catch(G){s.value=G.message,K&&typeof P=="boolean"&&(K.checked=!P)}})}function N(D,M,P,U,K){const G=(K==null?void 0:K.target)??null;return T(`channel:${D}:${P}`,async()=>{try{await W.put("/api/discord/channel/"+D+"/config",{[P]:U}),await b({showLoading:!1})}catch(Y){s.value=Y.message,G&&typeof U=="boolean"&&(G.checked=!U)}})}function E(D,M){return T(`channel:${D}:clear`,async()=>{try{await W.put("/api/discord/channel/"+D+"/config",{clear:!0}),await b({showLoading:!1})}catch(P){s.value=P.message}})}function I(D,M){const P=String(M);if(!D.userAutocomplete)return P;const U=f.value.get(P);return U?Dm(U):P}function B(D,M=null){const P=String(M??o.value[D]??"").trim();!P||i.value[D].includes(P)||(i.value[D]=[...i.value[D],P],o.value={...o.value,[D]:""})}function q(D,M){i.value[D]=i.value[D].filter(P=>P!==M)}async function oe(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const M=(await W.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...M.allowed_users||[]],channels:[...M.channels||[]],respond_to_bots:!!M.respond_to_bots,require_mention:!!M.require_mention,ignore_bot_ids:[...M.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(D){r.value=D.message||"Global defaults could not be saved."}finally{l.value=!1}}}return We(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:C,hasOverride:O,toggleGuild:x,fetchAll:S,fetchGuilds:b,setGuildConfig:_,setChannelConfig:N,clearOverride:E,mutationPending:A,globalItemLabel:I,addGlobalItem:B,removeGlobalItem:q,saveGlobalDefaults:oe}}},xs=e=>e==null?e:JSON.parse(JSON.stringify(e));function gk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function v(k){d+=1;const A=c.then(k,k);return c=A.catch(()=>{}),A}function C(k,A){f=xs(k),m.clear();for(const[T,_]of Object.entries(A||{}))m.set(T,xs(_))}function O(k){const A=xs(k),T=++u;return v(async()=>{try{await e(xs(A)),f=xs(A),T===u&&n(xs(A))}catch(_){T===u&&(a(xs(f)),o(_,{kind:"default"}))}})}function x(k,A){const T=xs(A),_=(p.get(k)||0)+1;return p.set(k,_),v(async()=>{try{await t(k,xs(T)),m.set(k,xs(T)),_===p.get(k)&&i(k,xs(T))}catch(N){_===p.get(k)&&(l(k,xs(m.get(k)??null)),o(N,{kind:"user",uid:k}))}})}function g(k){const A=(p.get(k)||0)+1;return p.set(k,A),v(async()=>{try{await s(k),m.delete(k),A===p.get(k)&&r(k)}catch(T){A===p.get(k)&&(l(k,xs(m.get(k)??null)),o(T,{kind:"delete",uid:k}))}})}async function b(){for(;;){const k=c;if(await k,k===c)return d}}async function S(k){for(;;){const A=await b(),T=await k();if(A===d)return T}}return{seed:C,saveDefault:O,saveUser:x,deleteUser:g,whenIdle:b,readSnapshot:S,get revision(){return d}}}const bk={components:{DiscordUserCombobox:Fm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=X(()=>{const E={};for(const I of r.value)E[I.id]=I;return E});function c(E){return o.value[E]||null}function d(E,I){return E?E.allowed_hosts===null||E.allowed_hosts===void 0?{allowed_hosts:[...I],default_host:E.default_host||"",allow_all:!0}:{allowed_hosts:E.allowed_hosts,default_host:E.default_host||"",allow_all:!1}:{allowed_hosts:[...I],default_host:I[0]||"",allow_all:!0}}const u=gk({applyDefault:async E=>{const I=E.allow_all?null:E.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:I,default_host:E.default_host})},applyUser:async(E,I)=>{const B=I.allow_all?null:I.allowed_hosts;await W.put(`/api/host-access/user/${E}`,{allowed_hosts:B,default_host:I.default_host})},applyDelete:E=>W.del(`/api/host-access/user/${E}`),onDefaultConfirmed:()=>Ie.success("Default policy updated"),onDefaultRollback:E=>{E&&(a.value=E)},onUserConfirmed:E=>{const I=c(E);Ie.success(`Updated access for ${I?I.display_name:E}`)},onUserRollback:(E,I)=>{const B={...i.value};I?B[E]=I:delete B[E],i.value=B},onUserDeleted:E=>{const I={...i.value};delete I[E],i.value=I},onError:(E,I)=>{var q;const B=I.uid?` ${((q=c(I.uid))==null?void 0:q.display_name)||I.uid}`:"";Ie.error(`${E.message||"Failed to save"} — reverted${B}`)}});let p=0;async function f(){const E=++p;e.value=!0,t.value="";try{const I=await u.readSnapshot(()=>W.get("/api/host-access"));if(E!==p)return;s.value=I,n.value=I.available_hosts||[],a.value=d(I.default_policy,n.value);const B=I.users||{},q={};for(const[oe,D]of Object.entries(B))q[oe]=d(D,n.value);i.value=q,u.seed(a.value,q)}catch(I){E===p&&(t.value=I.message||"Failed to fetch host access data")}finally{E===p&&(e.value=!1)}try{const I=await W.get("/api/discord/members")||[];E===p&&(r.value=I)}catch{E===p&&(r.value=[])}}const m=500,v=new Map;function C(E,I){const B=v.get(E);B&&clearTimeout(B.timer);const q={run:I,timer:null};q.timer=setTimeout(()=>{v.delete(E),I()},m),v.set(E,q)}function O(E){const I=v.get(E);I&&(clearTimeout(I.timer),v.delete(E))}function x(){for(const[E,I]of[...v])clearTimeout(I.timer),v.delete(E),I.run()}function g(){C("default",()=>u.saveDefault(a.value))}function b(E,I){a.value.allow_all=!1,I?a.value.allowed_hosts.includes(E)||a.value.allowed_hosts.push(E):(a.value.allowed_hosts=a.value.allowed_hosts.filter(B=>B!==E),a.value.default_host===E&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function S(E){C(`user:${E}`,()=>{const I=i.value[E];I&&u.saveUser(E,I)})}function k(E,I,B){const q=i.value[E];q&&(q.allow_all=!1,B?q.allowed_hosts.includes(I)||q.allowed_hosts.push(I):(q.allowed_hosts=q.allowed_hosts.filter(oe=>oe!==I),q.default_host===I&&(q.default_host=q.allowed_hosts[0]||"")),S(E))}function A(E,I){const B=i.value[E];B&&(B.default_host=I,S(E))}function T(){l.value=!0}function _(E){!/^\d{15,25}$/.test(E)||i.value[E]||(i.value[E]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},u.saveUser(E,i.value[E]),l.value=!1)}async function N(E){const I=c(E);await Qt({title:"Remove user override",message:`Remove the host access override for ${I?I.display_name:E}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(O(`user:${E}`),await u.deleteUser(E),i.value[E]||Ie.success(`Removed override for ${I?I.display_name:E}`))}return We(f),ds(x),vt(x),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:f,saveDefaultPolicy:g,toggleDefaultHost:b,getMember:c,toggleUserHost:k,setUserDefault:A,openAddUser:T,addUserById:_,deleteUser:N,flushPendingSaves:x}}},yk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=X(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=X(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await W.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function v(T){return!T||!T.trim()?[]:T.split(",").map(_=>_.trim()).filter(Boolean)}function C(T,_){const N=c.value.allowed_hosts;if(_&&!N.includes(T)&&N.push(T),!_){const E=N.indexOf(T);E>=0&&N.splice(E,1)}}function O(T,_){const N=d.value.allowed_hosts;if(_&&!N.includes(T)&&N.push(T),!_){const E=N.indexOf(T);E>=0&&N.splice(E,1)}}async function x(){var T;i.value=!0;try{const _=v(c.value.allowed_tools_str),N=c.value.host_mode,E=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,I={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:_.length?_:[]};E!==null&&(I.allowed_hosts=E),I.default_host=c.value.default_host||"";const B=await W.post("/api/tokens",I);l.value=B.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Ie.success("Token created"),await m()}catch(_){Ie.error(((T=_.data)==null?void 0:T.error)||_.message||"Failed to create token")}finally{i.value=!1}}function g(T){r.value=T;const _=T.allowed_hosts;let N="default";_==null?N="default":Array.isArray(_)&&_.length===0?N="none":Array.isArray(_)&&(N="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:N,allowed_hosts:Array.isArray(_)?[..._]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function b(){var T;if(r.value){o.value=!0;try{const _=v(d.value.allowed_tools_str),N=d.value.host_mode,E={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:_};N==="none"?E.allowed_hosts=[]:N==="select"?E.allowed_hosts=d.value.allowed_hosts:E.allowed_hosts=null,E.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),E),r.value=null,Ie.success("Token updated"),await m()}catch(_){Ie.error(((T=_.data)==null?void 0:T.error)||_.message||"Failed to update")}finally{o.value=!1}}}async function S(T){var N;if(await Qt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const E=await W.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=E.token,Ie.success("Token regenerated")}catch(E){Ie.error(((N=E.data)==null?void 0:N.error)||E.message||"Failed to regenerate")}}async function k(T){var N;if(await Qt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(T.user_id)),Ie.success("Token deleted"),await m()}catch(E){Ie.error(((N=E.data)==null?void 0:N.error)||E.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ie.success("Copied to clipboard")}catch{Ie.error("Copy failed — select and copy manually")}}return We(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:C,toggleEditHost:O,createToken:x,startEdit:g,saveEdit:b,confirmRegenerate:S,confirmDelete:k,copyToken:A}}},xk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),_k=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),wk=Object.freeze(["enabled","base_url","model","max_tokens"]),kk=Object.freeze(["enabled","model","max_tokens"]);function Hr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function qu(e){return Hr(e,xk)}function Gu(e){return Hr(e,_k)}function Sk(e,{includeApiKey:t=!1}={}){const s=Hr(e,wk);return t&&(s.api_key=e.api_key),s}function Tk(e){return{timeout:e.timeout}}function Ck(e,{includeApiKey:t=!1}={}){const s=Hr(e,kk);return t&&(s.api_key=e.api_key),s}function Ek(e){return{timeout:e.timeout}}function El(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Ak={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=X(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),r=X(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),o=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],c=X(()=>!o.includes(a.value.model)&&!(o.includes(a.value.agent_model)&&a.value.agent_reasoning_effort==="")),d=X(()=>{const j=a.value.agent_model;return j==="auto"?!0:!o.includes(j||a.value.model)}),u=X(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?!1:(j||a.value.reasoning_effort)==="max"}),p=j=>o.includes(j)&&(a.value.reasoning_effort==="max"||a.value.agent_model===""&&u.value),f=j=>o.includes(j)&&u.value,m=h({enabled:!1,model:"gpt-5.6-luna"}),v=h({unavailable_reason:null}),C=X(()=>{const j=m.value.model;return j&&!i.includes(j)?[j,...i]:i});function O(j){const Se=j.target.value;m.value.enabled=Se!=="",Se!==""&&(m.value.model=Se),V()}const x=h(!1),g=h({codex:!1,ollama:!1,kimi:!1}),b=h(null),S=h(!1),k=h(""),A=h(null),T=h(!1);let _=0;const N=X(()=>{var j;return Object.entries(((j=b.value)==null?void 0:j.models)||{}).map(([Se,Re])=>{var ts,Yn,Qn;return{model:Se,floor:Re.floor,override:Re.override,effectiveBudget:(ts=Re.effective)==null?void 0:ts.effective_budget,configuredPrimaryChars:(Yn=Re.configured)==null?void 0:Yn.primary_chars,primaryChars:(Qn=Re.effective)==null?void 0:Qn.primary_chars,provenance:Re.provenance,clampExpiresAt:Re.clamp_expires_at}})}),E=X(()=>{var j;return((j=b.value)==null?void 0:j.clamps)||[]}),I=X(()=>{var j,Se;return((Se=(j=b.value)==null?void 0:j.models)==null?void 0:Se[a.value.model])||null}),B=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),q=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),oe=h(!1),D=h(!1),M=h(!1),P=h(!1),U=h(!1),K=h(!1),G=h(!1),Y=h({configured:null}),ie=h(!1),Q=h([]),fe=h(""),De=h(!1),J=h(!1),be=h({configured:null}),H=h(!1),re=h([]),ue=h(""),Le=h(!1),y=h(!1),L=h(!0),$=h(""),ae=h({configured:null,accounts:[]}),te=h(null),ne=h(null),he=h(""),de=h(null),pe=h(!1),le=h(null),ke=h(null),ye=h("");let _e=null;function ce(j,Se="success"){Ie(j,Se==="error"?"error":"success")}function z(j){if(!j)return"?";const Se=j/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function ve(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Te(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function Oe(j){const Se=new Date(j);return Number.isNaN(Se.getTime())?"unknown":Se.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Pe(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function ot(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function lt(j){const Se=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(Se))&&Number(Se)>j.floor}function Mt(j,Se){const Re={...a.value.context_budget_overrides};Se.target.value===""?delete Re[j]:Re[j]=Number(Se.target.value),a.value.context_budget_overrides=Re,T.value=!0}function se(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),T.value=!0}function we(j){const Se={...a.value.context_budget_overrides};delete Se[j],a.value.context_budget_overrides=Se,T.value=!0}async function Ce(){e.value=!0,await Promise.all([Ue(),Ge(),Vt(),ct(),gt()]),e.value=!1}async function Ue({preserveBasic:j=!1,preserveAdvanced:Se=!1}={}){try{const Re=await W.get("/api/llm/status");t.value=Re,s.value=!1,n.value=Re.active_provider||"codex",Re.codex&&!Ye.pending()&&(j||(a.value.enabled=Re.codex.enabled,a.value.model=Re.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Re.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Re.codex.agent_reasoning_effort||"",a.value.agent_model=Re.codex.agent_model||""),Se||(a.value.request_timeout_seconds=Re.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Re.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Re.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Re.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Re.codex.context_compression||{}},!T.value&&!M.value&&(a.value.context_budget_overrides={...Re.codex.context_budget_overrides||{}},a.value.context_utilization=Re.codex.context_utilization??a.value.context_utilization))),Re.ollama&&!me.pending()&&(j||(B.value.enabled=Re.ollama.enabled,B.value.base_url=Re.ollama.base_url||"",B.value.model=Re.ollama.model||"",B.value.max_tokens=Re.ollama.max_tokens||4096),Se||(B.value.timeout=Re.ollama.timeout??B.value.timeout)),Re.kimi&&!Ne.pending()&&(j||(q.value.enabled=Re.kimi.enabled,q.value.model=Re.kimi.model||"",q.value.max_tokens=Re.kimi.max_tokens||4096),Se||(q.value.timeout=Re.kimi.timeout??q.value.timeout)),Re.auxiliary&&(v.value=Re.auxiliary,V.pending()||(m.value.enabled=Re.auxiliary.enabled,m.value.model=Re.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function gt(){const j=++_;S.value=!0,k.value="";try{const Se=await W.get("/api/context/windows");if(j!==_)return;b.value=Se,!M.value&&!T.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(Se.models||{}).filter(([,Re])=>Re.override!=null).map(([Re,ts])=>[Re,ts.override])),a.value.context_utilization=Se.utilization??a.value.context_utilization)}catch(Se){j===_&&(k.value=Se.message||"Failed to load context budgets")}finally{j===_&&(S.value=!1)}}async function Ge(){try{if(Y.value=await W.get("/api/ollama/status"),ie.value=!1,Y.value.model&&(fe.value=Y.value.model),Y.value.configured)try{const j=await W.get("/api/ollama/models");Q.value=j.models||[]}catch{Q.value=[]}else if(B.value.base_url)try{const j=await W.post("/api/ollama/probe-models",{base_url:B.value.base_url});Q.value=j.models||[]}catch{Q.value=[]}}catch{ie.value=!0}}async function ct(){L.value=!0,$.value="";try{ae.value=await W.get("/api/codex/status")}catch(j){$.value=j.message||"Failed to fetch Codex status"}finally{L.value=!1}}async function Vs(){const j=t.value?t.value.active_provider:"codex";G.value=!0;try{const Se=await W.post("/api/llm/switch",{provider:n.value});Se.error?(n.value=j,ce(Se.error,"error")):(ce("Switched to "+n.value+" ("+Se.model+")"),await Ce())}catch(Se){n.value=j,ce(Se.message||"Switch failed","error")}finally{G.value=!1}}async function Cs(){De.value=!0;try{const j=await W.post("/api/ollama/reload");ce(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await Ce()}catch(j){ce(j.message||"Reload failed","error")}finally{De.value=!1}}async function Ms(){J.value=!0;try{await W.post("/api/ollama/model",{model:fe.value}),ce("Model set to "+fe.value),await Ce()}catch(j){ce(j.message||"Failed","error")}finally{J.value=!1}}async function $t(){const j=B.value.base_url;if(!j){ce("Enter a base URL first","error");return}K.value=!0;try{const Se=await W.post("/api/ollama/probe-models",{base_url:j});Q.value=Se.models||[],Q.value.length?(ce(Q.value.length+" model(s) found"),!B.value.model&&Q.value.length&&(B.value.model=Q.value[0].name)):ce("No models found at "+j,"error")}catch(Se){ce(Se.message||"Could not reach Ollama","error")}finally{K.value=!1}}async function Vt(){try{if(be.value=await W.get("/api/kimi/status"),H.value=!1,be.value.model&&(ue.value=be.value.model),be.value.configured)try{const j=await W.get("/api/kimi/models");re.value=j.models||[]}catch{re.value=[]}}catch{H.value=!0}}async function an(){Le.value=!0;try{const j=await W.post("/api/kimi/reload");ce(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await Ce()}catch(j){ce(j.message||"Reload failed","error")}finally{Le.value=!1}}async function qs(){y.value=!0;try{await W.post("/api/kimi/model",{model:ue.value}),ce("Model set to "+ue.value),await Ce()}catch(j){ce(j.message||"Failed","error")}finally{y.value=!1}}async function Gs(){if(M.value){Ye();return}M.value=!0;const j=qu(a.value);try{await W.put("/api/llm/codex/config",j),ce("Codex config saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ct()])}catch(Se){ce(Se.message||"Failed","error");const Re=JSON.stringify(qu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:Re,preserveAdvanced:!0}),ct()])}finally{M.value=!1}}async function Ks(){if(M.value)return;M.value=!0;const j=Gu(a.value);try{await W.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(T.value=!1),ce("Codex advanced settings saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ct(),gt()])}catch(Se){ce(Se.message||"Failed","error");const Re=JSON.stringify(Gu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:Re}),ct(),gt()])}finally{M.value=!1}}async function Ds(){if(P.value){me();return}P.value=!0;try{const j=oe.value?B.value.api_key:null,Se=Sk(B.value,{includeApiKey:j!==null});await W.put("/api/llm/ollama/config",Se),ce("Ollama config saved"),j!==null&&B.value.api_key===j&&(B.value.api_key="",oe.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Ge()])}catch(j){ce(j.message||"Failed","error")}finally{P.value=!1}}async function On(){if(!P.value){P.value=!0;try{await W.put("/api/llm/ollama/config",Tk(B.value)),ce("Ollama timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Ge()])}catch(j){ce(j.message||"Failed","error")}finally{P.value=!1}}}async function yt(){if(U.value){Ne();return}U.value=!0;try{const j=D.value?q.value.api_key:null,Se=Ck(q.value,{includeApiKey:j!==null});await W.put("/api/llm/kimi/config",Se),ce("Kimi config saved"),j!==null&&q.value.api_key===j&&(q.value.api_key="",D.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Vt()])}catch(j){ce(j.message||"Failed","error")}finally{U.value=!1}}async function Fs(){if(!U.value){U.value=!0;try{await W.put("/api/llm/kimi/config",Ek(q.value)),ce("Kimi timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Vt()])}catch(j){ce(j.message||"Failed","error")}finally{U.value=!1}}}async function Kn(){if(x.value){V();return}x.value=!0;try{await W.put("/api/llm/auxiliary/config",m.value),ce("Auxiliary config saved"),await Ue()}catch(j){ce(j.message||"Failed","error"),await Ue()}finally{x.value=!1}}const Ye=El(Gs),V=El(Kn),me=El(Ds),Ne=El(yt),Ze=()=>(Ye.cancel(),Gs()),dt=()=>(me.cancel(),Ds()),Ot=()=>(Ne.cancel(),yt()),Wn=()=>Ks(),es=()=>On(),Ta=()=>Fs();async function $s(j){const Se=j.account_key+":"+j.model;A.value=Se;try{const Re=await W.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});ce(Re.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await gt()}catch(Re){ce(Re.message||"Failed to clear clamp","error"),await gt()}finally{A.value=null}}async function ui(j){try{await W.post("/api/codex/account/"+j+"/activate"),ce("Active account switched"),await ct()}catch(Se){ce(Se.message||"Failed","error")}}async function Ca(j){te.value=j;try{await W.post("/api/codex/account/"+j+"/refresh"),ce("Token refreshed"),await ct()}catch(Se){ce(Se.message||"Refresh failed","error")}finally{te.value=null}}function Zn(j,Se){ne.value=j,he.value=Se||""}async function Ea(j){try{await W.put("/api/codex/account/"+j+"/label",{label:he.value}),ce("Label updated"),ne.value=null,await ct()}catch(Se){ce(Se.message||"Failed","error")}}async function Jn(j,Se){if(await Qt({title:"Delete Codex account",message:`Delete ${Se||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+j),ce("Deleted. Pool reloaded."),await ct()}catch(ts){ce(ts.message||"Failed","error")}}async function Ln(){pe.value=!0;try{const j=await W.post("/api/codex/device-code");le.value=j,de.value="pending",ys(j)}catch(j){ce(j.message||"Failed","error")}finally{pe.value=!1}}async function ys(j){_e={cancelled:!1};const Se=_e;try{const Re=await W.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(Se.cancelled)return;ke.value=Re,de.value="success",await Ce()}catch(Re){if(Se.cancelled)return;ye.value=Re.message||"Device login failed",de.value="error"}}function ln(){_e&&(_e.cancelled=!0),de.value=null,le.value=null}return We(Ce),vt(()=>{_e&&(_e.cancelled=!0),Ye.cancel(),V.cancel(),me.cancel(),Ne.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:G,advancedOpen:g,codexForm:a,codexModelOptions:l,codexAgentModelOptions:r,mainMaxAllowed:c,agentMaxAllowed:d,mainModelOptionDisabled:p,agentModelOptionDisabled:f,auxForm:m,auxData:v,auxModelOptions:C,onAuxModelChange:O,savingAux:x,saveAuxConfigDebounced:V,ollamaForm:B,kimiForm:q,savingCodex:M,savingOllama:P,savingKimi:U,probingOllama:K,ollamaKeyDirty:oe,kimiKeyDirty:D,fetchCodexStatus:ct,ollamaStatus:Y,ollamaStatusLoadFailed:ie,ollamaModels:Q,ollamaSelectedModel:fe,reloading:De,settingModel:J,kimiStatus:be,kimiStatusLoadFailed:H,kimiModels:re,kimiSelectedModel:ue,reloadingKimi:Le,settingKimiModel:y,codexLoading:L,codexError:$,codexData:ae,refreshing:te,editingLabel:ne,labelValue:he,contextWindows:b,contextWindowsLoading:S,contextWindowsError:k,contextBudgetRows:N,activeClampRows:E,activeContextBudget:I,clearingClamp:A,contextPolicyDirty:T,deviceState:de,deviceLoading:pe,deviceInfo:le,deviceResult:ke,deviceError:ye,fetchAll:Ce,fetchLLMStatus:Ue,fetchOllamaStatus:Ge,fetchKimiStatus:Vt,switchProvider:Vs,reloadOllama:Cs,setOllamaModel:Ms,reloadKimi:an,setKimiModel:qs,probeOllamaModels:$t,saveCodexConfig:Gs,saveOllamaConfig:Ds,saveKimiConfig:yt,saveCodexAdvancedConfig:Ks,saveOllamaAdvancedConfig:On,saveKimiAdvancedConfig:Fs,saveCodexConfigDebounced:Ye,saveOllamaConfigDebounced:me,saveKimiConfigDebounced:Ne,saveCodexConfigNow:Ze,saveOllamaConfigNow:dt,saveKimiConfigNow:Ot,saveCodexAdvancedConfigNow:Wn,saveOllamaAdvancedConfigNow:es,saveKimiAdvancedConfigNow:Ta,activateAccount:ui,refreshAccount:Ca,startEditLabel:Zn,saveLabel:Ea,deleteAccount:Jn,startDeviceLogin:Ln,cancelDeviceLogin:ln,formatSize:z,fetchContextWindows:gt,clearContextClamp:$s,setContextOverride:Mt,setContextUtilization:se,resetContextOverride:we,overrideAboveFloor:lt,formatCount:ve,formatContextCeiling:Te,formatExpiry:Oe,shortAccountKey:Pe,provenanceClass:ot}}},Ku={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Rk(e){return Ku[e]||Ku[(e||"").toLowerCase()]||"text-gray-400"}const Ik={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=X(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((A,T)=>A+Number(T||0),0)}),u=h(""),p=h(0),f=h([]),m=X(()=>f.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let C=null;async function O(){var N;const k=await Promise.allSettled(v.map(E=>W.get(E.path))),A=E=>k[E].status==="fulfilled"?k[E].value:null;t.value=A(0)||{};const T=A(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=A(2)||{},a.value=A(3)||{},i.value=A(4),l.value=A(5),r.value=A(6),o.value=A(7),c.value=A(8);const _=k.filter(E=>E.status==="rejected");if(f.value=k.flatMap((E,I)=>{var B;return E.status==="rejected"?[{...v[I],reason:((B=E.reason)==null?void 0:B.message)||"request failed"}]:[]}),p.value=f.value.length,_.length===k.length){const E=(N=_[0])==null?void 0:N.reason;u.value=(E==null?void 0:E.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",O()}let g=!1;function b(){g||(g=!0,O(),C||(C=setInterval(O,3e4)))}function S(){g&&(g=!1,C&&(clearInterval(C),C=null))}return We(b),bs(b),ds(S),vt(S),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:v,retry:x,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Rk,formatAgeSeconds:rw}}},Ok={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return We(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},$m=[{id:"health",label:"Health",component:Yw},{id:"resources",label:"Resources",component:Qw},{id:"logs",label:"Logs",component:sk},{id:"config",label:"Config",component:hk},{id:"discord",label:"Discord",component:vk},{id:"host-access",label:"Host Access",component:bk},{id:"api-tokens",label:"API Tokens",component:yk},{id:"llm",label:"LLM Config",component:Ak},{id:"internals",label:"Internals",component:Ik},{id:"update",label:"Update",component:Ok}],Lk={components:{TabbedPage:Ur},setup(){return{tabs:$m}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Al=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Nk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Al("Operations","operations","/operations",Rm),...Al("History","history","/history",Im),...Al("Capabilities","capabilities","/capabilities",Om),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Al("System","system","/system",$m)],fs=qn({open:!1,query:"",selected:0});function Wu(){fs.query="",fs.selected=0,fs.open=!0}function fo(){fs.open=!1}function Pk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Mk={setup(){const e=_m(),t=h(null),s=X(()=>{const i=fs.query.trim().toLowerCase();return Nk.map(l=>({...l,_score:Pk(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});rs(()=>fs.open,async i=>{var l;i&&(await Et(),(l=t.value)==null||l.focus())}),rs(()=>fs.query,()=>{fs.selected=0});function n(i){fo(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),fo();return}if(i.key==="ArrowDown")i.preventDefault(),fs.selected=Math.min(fs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),fs.selected=Math.max(fs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[fs.selected];l&&n(l)}}return{state:fs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:fo}},template:`
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
  `},Zo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Zo));const Dk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Qa("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Qa("path",{d:Zo[e.name]||Zo.info})])}},Fk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Zu(e){return[...e.querySelectorAll(Fk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const $k={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Zu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Zu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Bk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h(!1),o=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=X(()=>{const K=e.value.uptime_seconds||0,G=Math.floor(K/86400),Y=Math.floor(K%86400/3600),ie=Math.floor(K%3600/60),Q=[];return G>0&&Q.push(`${G}d`),Y>0&&Q.push(`${Y}h`),(Q.length===0||G===0&&Y===0)&&Q.push(`${ie}m`),Q.join(" ")}),m=X(()=>{const K=e.value.uptime_seconds||0;return 125.66*(1-Math.min(K/86400,1))}),v=X(()=>{const K=e.value;return[{label:"Guilds",value:K.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:K.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:K.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${K.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:K.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:K.loop_count>0?"text-green-400":"",highlight:K.loop_count>0},{label:"Agents",value:K.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:K.agent_count>0?`${K.agent_count} total`:"",subColor:"text-gray-500",highlight:(K.agent_running??0)>0},{label:"Processes",value:K.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:K.process_count>0?`${K.process_count} total`:"",subColor:"text-gray-500",highlight:(K.process_running??0)>0},{label:"Schedules",value:K.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(K.schedule_failing>0?`${K.schedule_failing} failing`:"")+(K.schedule_failing>0&&K.schedule_paused>0?", ":"")+(K.schedule_paused>0?`${K.schedule_paused} paused`:"")||void 0,subColor:K.schedule_failing>0?"text-red-400":"text-yellow-400",color:K.schedule_failing>0?"text-red-400":"",highlight:K.schedule_failing>0},{label:"Users",value:K.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),C=X(()=>{const K=e.value,G=[];return G.push({label:"Bot",status:K.status==="online"?"ok":"warn",detail:K.status==="online"?"Online":"Starting"}),(K.schedule_failing||0)>0?G.push({label:"Schedules",status:"error",detail:`${K.schedule_failing} failing`}):(K.schedule_count||0)>0&&G.push({label:"Schedules",status:"ok",detail:`${K.schedule_count} configured`}),(K.loop_count||0)>0&&G.push({label:"Loops",status:"ok",detail:`${K.loop_count} active`}),(K.agent_running||0)>0&&G.push({label:"Agents",status:"ok",detail:`${K.agent_running} running`}),(K.process_running||0)>0&&G.push({label:"Processes",status:"ok",detail:`${K.process_running} running`}),G});async function O(){try{e.value=await W.get("/api/status"),s.value=null}catch(K){s.value=K.message}finally{t.value=!1}}let x=0,g=0,b=0,S=0;function k(K,G){const Y=new Set;return[...G,...K].filter(ie=>{const Q=ie._hmac||JSON.stringify([ie.timestamp,ie.tool_name,ie.user_id,ie.result_summary,ie.error]);return Y.has(Q)?!1:(Y.add(Q),!0)})}async function A(){const K=++x,G=b;a.value=!0;try{const Y=await W.get("/api/audit?limit=10");if(K!==x)return;const ie=G===b?[]:n.value.filter(Q=>(Q._liveEpoch||0)>G);n.value=k(Y,ie).slice(0,10),c.value=ie.length}catch{}K===x&&(a.value=!1)}async function T(){const K=++g,G=S;l.value=!0;try{const Y=await W.get("/api/audit?error_only=1&limit=5");if(K!==g)return;const ie=G===S?[]:i.value.filter(Q=>(Q._liveErrorEpoch||0)>G);i.value=k(Y,ie).slice(0,5),r.value=!1}catch{if(K!==g)return;r.value=G===S||i.value.length===0}K===g&&(l.value=!1)}async function _(){try{const K=await W.get("/api/knowledge");d.value=(Array.isArray(K)?K:[]).reduce((G,Y)=>G+(Y.chunks||0),0)}catch{d.value=null}}async function N(){try{const K=await W.get("/api/agents");o.value=K.filter(G=>G.status==="running")}catch{}}async function E(){u.value={...u.value,reload:!0};try{await W.post("/api/reload"),Ie.success("Config reloaded")}catch(K){Ie.error(K.message)}u.value={...u.value,reload:!1}}async function I(){if(!await Qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const G=e.value.session_count;e.value={...e.value,session_count:0};try{const Y=await W.post("/api/sessions/clear-all");Ie.success(`Cleared ${Y.count} session${Y.count!==1?"s":""}`),await O()}catch(Y){e.value={...e.value,session_count:G},Ie.error(Y.message)}u.value={...u.value,clearSessions:!1}}async function B(){if(!await Qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const G=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Y=await W.post("/api/loops/stop-all");Ie.success(Y.result),await O()}catch(Y){e.value={...e.value,loop_count:G},Ie.error(Y.message)}u.value={...u.value,stopLoops:!1}}function q(){t.value=!0,s.value=null,O(),A(),T(),N()}let oe=null,D=null,M=null;function P(K){if(K.payload&&K.payload.tool_name){b+=1;const G={...K.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(G),n.value.length>10&&n.value.pop(),c.value++,G.error&&(S+=1,G._liveErrorEpoch=S,r.value=!1,i.value.unshift(G),i.value.length>5&&i.value.pop()),setTimeout(()=>{G._isNew=!1},1500),clearTimeout(M),M=setTimeout(()=>{c.value=0},1e4)}}let U=null;return We(async()=>{await Promise.all([O(),A(),T(),N(),_()]),oe=setInterval(O,15e3),D=setInterval(N,1e4),Qe.subscribe("events",P),U=Qe.onReconnected(()=>{A(),T()})}),vt(()=>{oe&&clearInterval(oe),D&&clearInterval(D),clearTimeout(M),Qe.unsubscribe("events",P),U&&(U(),U=null)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:v,healthIndicators:C,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:r,agents:o,actionLoading:u,fetchActivity:A,fetchErrors:T,fetchStatus:O,onEvent:P,formatTime:wm,formatDuration:ri,retry:q,reloadConfig:E,clearSessions:I,stopAllLoops:B}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ju(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Uk(e){if(Array.isArray(e))return e}function Hk(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function zk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function jk(e,t){return Uk(e)||Hk(e,t)||Vk(e,t)||zk()}function Vk(e,t){if(e){if(typeof e=="string")return Ju(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ju(e,t):void 0}}const Bm=Object.entries,Yu=Object.setPrototypeOf,qk=Object.isFrozen,Gk=Object.getPrototypeOf,Kk=Object.getOwnPropertyDescriptor;let cs=Object.freeze,Ps=Object.seal,Fa=Object.create,Um=typeof Reflect<"u"&&Reflect,Jo=Um.apply,Yo=Um.construct;cs||(cs=function(t){return t});Ps||(Ps=function(t){return t});Jo||(Jo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Yo||(Yo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const un=It(Array.prototype.forEach),Wk=It(Array.prototype.lastIndexOf),Qu=It(Array.prototype.pop),La=It(Array.prototype.push),Zk=It(Array.prototype.splice),ns=Array.isArray,Ci=It(String.prototype.toLowerCase),ho=It(String.prototype.toString),Xu=It(String.prototype.match),Na=It(String.prototype.replace),ep=It(String.prototype.indexOf),Jk=It(String.prototype.trim),Yk=It(Number.prototype.toString),Qk=It(Boolean.prototype.toString),tp=typeof BigInt>"u"?null:It(BigInt.prototype.toString),sp=typeof Symbol>"u"?null:It(Symbol.prototype.toString),xt=It(Object.prototype.hasOwnProperty),yi=It(Object.prototype.toString),Bt=It(RegExp.prototype.test),na=Xk(TypeError);function It(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Jo(e,t,n)}}function Xk(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Yo(e,s)}}function je(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ci;if(Yu&&Yu(e,null),!ns(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(qk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function eS(e){for(let t=0;t<e.length;t++)xt(e,t)||(e[t]=null);return e}function Kt(e){const t=Fa(null);for(const n of Bm(e)){var s=jk(n,2);const a=s[0],i=s[1];xt(e,a)&&(ns(i)?t[a]=eS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Kt(i):t[a]=i)}return t}function tS(e){switch(typeof e){case"string":return e;case"number":return Yk(e);case"boolean":return Qk(e);case"bigint":return tp?tp(e):"0";case"symbol":return sp?sp(e):"Symbol()";case"undefined":return yi(e);case"function":case"object":{if(e===null)return yi(e);const t=e,s=Js(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:yi(n)}return yi(e)}default:return yi(e)}}function Js(e,t){for(;e!==null;){const n=Kk(e,t);if(n){if(n.get)return It(n.get);if(typeof n.value=="function")return It(n.value)}e=Gk(e)}function s(){return null}return s}function sS(e){try{return Bt(e,""),!0}catch{return!1}}const np=cs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),mo=cs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),vo=cs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),nS=cs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),go=cs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),aS=cs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),ap=cs(["#text"]),ip=cs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),bo=cs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),lp=cs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Rl=cs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),iS=Ps(/{{[\w\W]*|^[\w\W]*}}/g),lS=Ps(/<%[\w\W]*|^[\w\W]*%>/g),rS=Ps(/\${[\w\W]*/g),oS=Ps(/^data-[\-\w.\u00B7-\uFFFF]+$/),cS=Ps(/^aria-[\-\w]+$/),rp=Ps(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),dS=Ps(/^(?:\w+script|data):/i),uS=Ps(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),pS=Ps(/^html$/i),fS=Ps(/^[a-z][.\w]*(-[.\w]+)+$/i),Ws={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},hS=function(){return typeof window>"u"?null:window},mS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},op=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Hm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:hS();const t=Ee=>Hm(Ee);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ws.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,f=Js(p,"cloneNode"),m=Js(p,"remove"),v=Js(p,"nextSibling"),C=Js(p,"childNodes"),O=Js(p,"parentNode"),x=Js(p,"shadowRoot"),g=Js(p,"attributes"),b=l&&l.prototype?Js(l.prototype,"nodeType"):null,S=l&&l.prototype?Js(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ee=s.createElement("template");Ee.content&&Ee.content.ownerDocument&&(s=Ee.content.ownerDocument)}let k,A="",T,_=!1,N=0;const E=function(){if(N>0)throw na('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},I=function(R){E(),N++;try{return k.createHTML(R)}finally{N--}},B=function(R){E(),N++;try{return k.createScriptURL(R)}finally{N--}},q=function(){return _||(T=mS(u,a),_=!0),T},oe=s,D=oe.implementation,M=oe.createNodeIterator,P=oe.createDocumentFragment,U=oe.getElementsByTagName,K=n.importNode;let G=op();t.isSupported=typeof Bm=="function"&&typeof O=="function"&&D&&D.createHTMLDocument!==void 0;const Y=iS,ie=lS,Q=rS,fe=oS,De=cS,J=dS,be=uS,H=fS;let re=rp,ue=null;const Le=je({},[...np,...mo,...vo,...go,...ap]);let y=null;const L=je({},[...ip,...bo,...lp,...Rl]);let $=Object.seal(Fa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ae=null,te=null;const ne=Object.seal(Fa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let he=!0,de=!0,pe=!1,le=!0,ke=!1,ye=!0,_e=!1,ce=!1,z=!1,ve=!1,Te=!1,Oe=!1,Pe=!0,ot=!1;const lt="user-content-";let Mt=!0,se=!1,we={},Ce=null;const Ue=je({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let gt=null;const Ge=je({},["audio","video","img","source","image","track"]);let ct=null;const Vs=je({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Cs="http://www.w3.org/1998/Math/MathML",Ms="http://www.w3.org/2000/svg",$t="http://www.w3.org/1999/xhtml";let Vt=$t,an=!1,qs=null;const Gs=je({},[Cs,Ms,$t],ho);let Ks=je({},["mi","mo","mn","ms","mtext"]),Ds=je({},["annotation-xml"]);const On=je({},["title","style","font","a","script"]);let yt=null;const Fs=["application/xhtml+xml","text/html"],Kn="text/html";let Ye=null,V=null;const me=s.createElement("form"),Ne=function(R){return R instanceof RegExp||R instanceof Function},Ze=function(){let R=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(V&&V===R)return;(!R||typeof R!="object")&&(R={}),R=Kt(R),yt=Fs.indexOf(R.PARSER_MEDIA_TYPE)===-1?Kn:R.PARSER_MEDIA_TYPE,Ye=yt==="application/xhtml+xml"?ho:Ci,ue=xt(R,"ALLOWED_TAGS")&&ns(R.ALLOWED_TAGS)?je({},R.ALLOWED_TAGS,Ye):Le,y=xt(R,"ALLOWED_ATTR")&&ns(R.ALLOWED_ATTR)?je({},R.ALLOWED_ATTR,Ye):L,qs=xt(R,"ALLOWED_NAMESPACES")&&ns(R.ALLOWED_NAMESPACES)?je({},R.ALLOWED_NAMESPACES,ho):Gs,ct=xt(R,"ADD_URI_SAFE_ATTR")&&ns(R.ADD_URI_SAFE_ATTR)?je(Kt(Vs),R.ADD_URI_SAFE_ATTR,Ye):Vs,gt=xt(R,"ADD_DATA_URI_TAGS")&&ns(R.ADD_DATA_URI_TAGS)?je(Kt(Ge),R.ADD_DATA_URI_TAGS,Ye):Ge,Ce=xt(R,"FORBID_CONTENTS")&&ns(R.FORBID_CONTENTS)?je({},R.FORBID_CONTENTS,Ye):Ue,ae=xt(R,"FORBID_TAGS")&&ns(R.FORBID_TAGS)?je({},R.FORBID_TAGS,Ye):Kt({}),te=xt(R,"FORBID_ATTR")&&ns(R.FORBID_ATTR)?je({},R.FORBID_ATTR,Ye):Kt({}),we=xt(R,"USE_PROFILES")?R.USE_PROFILES&&typeof R.USE_PROFILES=="object"?Kt(R.USE_PROFILES):R.USE_PROFILES:!1,he=R.ALLOW_ARIA_ATTR!==!1,de=R.ALLOW_DATA_ATTR!==!1,pe=R.ALLOW_UNKNOWN_PROTOCOLS||!1,le=R.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ke=R.SAFE_FOR_TEMPLATES||!1,ye=R.SAFE_FOR_XML!==!1,_e=R.WHOLE_DOCUMENT||!1,ve=R.RETURN_DOM||!1,Te=R.RETURN_DOM_FRAGMENT||!1,Oe=R.RETURN_TRUSTED_TYPE||!1,z=R.FORCE_BODY||!1,Pe=R.SANITIZE_DOM!==!1,ot=R.SANITIZE_NAMED_PROPS||!1,Mt=R.KEEP_CONTENT!==!1,se=R.IN_PLACE||!1,re=sS(R.ALLOWED_URI_REGEXP)?R.ALLOWED_URI_REGEXP:rp,Vt=typeof R.NAMESPACE=="string"?R.NAMESPACE:$t,Ks=xt(R,"MATHML_TEXT_INTEGRATION_POINTS")&&R.MATHML_TEXT_INTEGRATION_POINTS&&typeof R.MATHML_TEXT_INTEGRATION_POINTS=="object"?Kt(R.MATHML_TEXT_INTEGRATION_POINTS):je({},["mi","mo","mn","ms","mtext"]),Ds=xt(R,"HTML_INTEGRATION_POINTS")&&R.HTML_INTEGRATION_POINTS&&typeof R.HTML_INTEGRATION_POINTS=="object"?Kt(R.HTML_INTEGRATION_POINTS):je({},["annotation-xml"]);const ee=xt(R,"CUSTOM_ELEMENT_HANDLING")&&R.CUSTOM_ELEMENT_HANDLING&&typeof R.CUSTOM_ELEMENT_HANDLING=="object"?Kt(R.CUSTOM_ELEMENT_HANDLING):Fa(null);if($=Fa(null),xt(ee,"tagNameCheck")&&Ne(ee.tagNameCheck)&&($.tagNameCheck=ee.tagNameCheck),xt(ee,"attributeNameCheck")&&Ne(ee.attributeNameCheck)&&($.attributeNameCheck=ee.attributeNameCheck),xt(ee,"allowCustomizedBuiltInElements")&&typeof ee.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=ee.allowCustomizedBuiltInElements),ke&&(de=!1),Te&&(ve=!0),we&&(ue=je({},ap),y=Fa(null),we.html===!0&&(je(ue,np),je(y,ip)),we.svg===!0&&(je(ue,mo),je(y,bo),je(y,Rl)),we.svgFilters===!0&&(je(ue,vo),je(y,bo),je(y,Rl)),we.mathMl===!0&&(je(ue,go),je(y,lp),je(y,Rl))),ne.tagCheck=null,ne.attributeCheck=null,xt(R,"ADD_TAGS")&&(typeof R.ADD_TAGS=="function"?ne.tagCheck=R.ADD_TAGS:ns(R.ADD_TAGS)&&(ue===Le&&(ue=Kt(ue)),je(ue,R.ADD_TAGS,Ye))),xt(R,"ADD_ATTR")&&(typeof R.ADD_ATTR=="function"?ne.attributeCheck=R.ADD_ATTR:ns(R.ADD_ATTR)&&(y===L&&(y=Kt(y)),je(y,R.ADD_ATTR,Ye))),xt(R,"ADD_URI_SAFE_ATTR")&&ns(R.ADD_URI_SAFE_ATTR)&&je(ct,R.ADD_URI_SAFE_ATTR,Ye),xt(R,"FORBID_CONTENTS")&&ns(R.FORBID_CONTENTS)&&(Ce===Ue&&(Ce=Kt(Ce)),je(Ce,R.FORBID_CONTENTS,Ye)),xt(R,"ADD_FORBID_CONTENTS")&&ns(R.ADD_FORBID_CONTENTS)&&(Ce===Ue&&(Ce=Kt(Ce)),je(Ce,R.ADD_FORBID_CONTENTS,Ye)),Mt&&(ue["#text"]=!0),_e&&je(ue,["html","head","body"]),ue.table&&(je(ue,["tbody"]),delete ae.tbody),R.TRUSTED_TYPES_POLICY){if(typeof R.TRUSTED_TYPES_POLICY.createHTML!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof R.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw na('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ge=k;k=R.TRUSTED_TYPES_POLICY;try{A=I("")}catch(Me){throw k=ge,Me}}else R.TRUSTED_TYPES_POLICY===null?(k=void 0,A=""):(k===void 0&&(k=q()),k&&typeof A=="string"&&(A=I("")));(G.uponSanitizeElement.length>0||G.uponSanitizeAttribute.length>0)&&ue===Le&&(ue=Kt(ue)),G.uponSanitizeAttribute.length>0&&y===L&&(y=Kt(y)),cs&&cs(R),V=R},dt=je({},[...mo,...vo,...nS]),Ot=je({},[...go,...aS]),Wn=function(R){let ee=O(R);(!ee||!ee.tagName)&&(ee={namespaceURI:Vt,tagName:"template"});const ge=Ci(R.tagName),Me=Ci(ee.tagName);return qs[R.namespaceURI]?R.namespaceURI===Ms?ee.namespaceURI===$t?ge==="svg":ee.namespaceURI===Cs?ge==="svg"&&(Me==="annotation-xml"||Ks[Me]):!!dt[ge]:R.namespaceURI===Cs?ee.namespaceURI===$t?ge==="math":ee.namespaceURI===Ms?ge==="math"&&Ds[Me]:!!Ot[ge]:R.namespaceURI===$t?ee.namespaceURI===Ms&&!Ds[Me]||ee.namespaceURI===Cs&&!Ks[Me]?!1:!Ot[ge]&&(On[ge]||!dt[ge]):!!(yt==="application/xhtml+xml"&&qs[R.namespaceURI]):!1},es=function(R){La(t.removed,{element:R});try{O(R).removeChild(R)}catch{if(m(R),!O(R))throw na("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Ta=function(R){const ee=C?C(R):R.childNodes;if(ee){const Me=[];un(ee,$e=>{La(Me,$e)}),un(Me,$e=>{try{m($e)}catch{}})}const ge=g?g(R):null;if(ge)for(let Me=ge.length-1;Me>=0;--Me){const $e=ge[Me],He=$e&&$e.name;if(typeof He=="string")try{R.removeAttribute(He)}catch{}}},$s=function(R,ee){try{La(t.removed,{attribute:ee.getAttributeNode(R),from:ee})}catch{La(t.removed,{attribute:null,from:ee})}if(ee.removeAttribute(R),R==="is")if(ve||Te)try{es(ee)}catch{}else try{ee.setAttribute(R,"")}catch{}},ui=function(R){const ee=g?g(R):R.attributes;if(ee)for(let ge=ee.length-1;ge>=0;--ge){const Me=ee[ge],$e=Me&&Me.name;if(!(typeof $e!="string"||y[Ye($e)]))try{R.removeAttribute($e)}catch{}}},Ca=function(R){const ee=[R];for(;ee.length>0;){const ge=ee.pop();(b?b(ge):ge.nodeType)===Ws.element&&ui(ge);const $e=C?C(ge):ge.childNodes;if($e)for(let He=$e.length-1;He>=0;--He)ee.push($e[He])}},Zn=function(R){let ee=null,ge=null;if(z)R="<remove></remove>"+R;else{const He=Xu(R,/^[\r\n\t ]+/);ge=He&&He[0]}yt==="application/xhtml+xml"&&Vt===$t&&(R='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+R+"</body></html>");const Me=k?I(R):R;if(Vt===$t)try{ee=new d().parseFromString(Me,yt)}catch{}if(!ee||!ee.documentElement){ee=D.createDocument(Vt,"template",null);try{ee.documentElement.innerHTML=an?A:Me}catch{}}const $e=ee.body||ee.documentElement;return R&&ge&&$e.insertBefore(s.createTextNode(ge),$e.childNodes[0]||null),Vt===$t?U.call(ee,_e?"html":"body")[0]:_e?ee.documentElement:$e},Ea=function(R){return M.call(R.ownerDocument||R,R,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Jn=function(R){var ee,ge;R.normalize();const Me=M.call(R.ownerDocument||R,R,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let $e=Me.nextNode();for(;$e;){let bt=$e.data;un([Y,ie,Q],w=>{bt=Na(bt,w," ")}),$e.data=bt,$e=Me.nextNode()}const He=(ee=(ge=R.querySelectorAll)===null||ge===void 0?void 0:ge.call(R,"template"))!==null&&ee!==void 0?ee:[];un(Array.from(He),bt=>{ys(bt.content)&&Jn(bt.content)})},Ln=function(R){const ee=S?S(R):null;return typeof ee!="string"||Ye(ee)!=="form"?!1:typeof R.nodeName!="string"||typeof R.textContent!="string"||typeof R.removeChild!="function"||R.attributes!==g(R)||typeof R.removeAttribute!="function"||typeof R.setAttribute!="function"||typeof R.namespaceURI!="string"||typeof R.insertBefore!="function"||typeof R.hasChildNodes!="function"||R.nodeType!==b(R)||R.childNodes!==C(R)},ys=function(R){if(!b||typeof R!="object"||R===null)return!1;try{return b(R)===Ws.documentFragment}catch{return!1}},ln=function(R){if(!b||typeof R!="object"||R===null)return!1;try{return typeof b(R)=="number"}catch{return!1}};function j(Ee,R,ee){un(Ee,ge=>{ge.call(t,R,ee,V)})}const Se=function(R){let ee=null;if(j(G.beforeSanitizeElements,R,null),Ln(R))return es(R),!0;const ge=Ye(S?S(R):R.nodeName);if(j(G.uponSanitizeElement,R,{tagName:ge,allowedTags:ue}),ye&&R.hasChildNodes()&&!ln(R.firstElementChild)&&Bt(/<[/\w!]/g,R.innerHTML)&&Bt(/<[/\w!]/g,R.textContent)||ye&&R.namespaceURI===$t&&ge==="style"&&ln(R.firstElementChild)||R.nodeType===Ws.progressingInstruction||ye&&R.nodeType===Ws.comment&&Bt(/<[/\w]/g,R.data))return es(R),!0;if(ae[ge]||!(ne.tagCheck instanceof Function&&ne.tagCheck(ge))&&!ue[ge]){if(!ae[ge]&&Yn(ge)&&($.tagNameCheck instanceof RegExp&&Bt($.tagNameCheck,ge)||$.tagNameCheck instanceof Function&&$.tagNameCheck(ge)))return!1;if(Mt&&!Ce[ge]){const $e=O(R),He=C(R);if(He&&$e){const bt=He.length;for(let w=bt-1;w>=0;--w){const F=se?He[w]:f(He[w],!0);$e.insertBefore(F,v(R))}}}return es(R),!0}return(b?b(R):R.nodeType)===Ws.element&&!Wn(R)||(ge==="noscript"||ge==="noembed"||ge==="noframes")&&Bt(/<\/no(script|embed|frames)/i,R.innerHTML)?(es(R),!0):(ke&&R.nodeType===Ws.text&&(ee=R.textContent,un([Y,ie,Q],$e=>{ee=Na(ee,$e," ")}),R.textContent!==ee&&(La(t.removed,{element:R.cloneNode()}),R.textContent=ee)),j(G.afterSanitizeElements,R,null),!1)},Re=function(R,ee,ge){if(te[ee]||Pe&&(ee==="id"||ee==="name")&&(ge in s||ge in me))return!1;const Me=y[ee]||ne.attributeCheck instanceof Function&&ne.attributeCheck(ee,R);if(!(de&&!te[ee]&&Bt(fe,ee))){if(!(he&&Bt(De,ee))){if(!Me||te[ee]){if(!(Yn(R)&&($.tagNameCheck instanceof RegExp&&Bt($.tagNameCheck,R)||$.tagNameCheck instanceof Function&&$.tagNameCheck(R))&&($.attributeNameCheck instanceof RegExp&&Bt($.attributeNameCheck,ee)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(ee,R))||ee==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&Bt($.tagNameCheck,ge)||$.tagNameCheck instanceof Function&&$.tagNameCheck(ge))))return!1}else if(!ct[ee]){if(!Bt(re,Na(ge,be,""))){if(!((ee==="src"||ee==="xlink:href"||ee==="href")&&R!=="script"&&ep(ge,"data:")===0&&gt[R])){if(!(pe&&!Bt(J,Na(ge,be,"")))){if(ge)return!1}}}}}}return!0},ts=je({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Yn=function(R){return!ts[Ci(R)]&&Bt(H,R)},Qn=function(R){j(G.beforeSanitizeAttributes,R,null);const ee=R.attributes;if(!ee||Ln(R))return;const ge={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let Me=ee.length;for(;Me--;){const $e=ee[Me],He=$e.name,bt=$e.namespaceURI,w=$e.value,F=Ye(He),Z=w;let xe=He==="value"?Z:Jk(Z);if(ge.attrName=F,ge.attrValue=xe,ge.keepAttr=!0,ge.forceKeepAttr=void 0,j(G.uponSanitizeAttribute,R,ge),xe=ge.attrValue,ot&&(F==="id"||F==="name")&&ep(xe,lt)!==0&&($s(He,R),xe=lt+xe),ye&&Bt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,xe)){$s(He,R);continue}if(F==="attributename"&&Xu(xe,"href")){$s(He,R);continue}if(ge.forceKeepAttr)continue;if(!ge.keepAttr){$s(He,R);continue}if(!le&&Bt(/\/>/i,xe)){$s(He,R);continue}ke&&un([Y,ie,Q],qt=>{xe=Na(xe,qt," ")});const Xe=Ye(R.nodeName);if(!Re(Xe,F,xe)){$s(He,R);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!bt)switch(u.getAttributeType(Xe,F)){case"TrustedHTML":{xe=I(xe);break}case"TrustedScriptURL":{xe=B(xe);break}}if(xe!==Z)try{bt?R.setAttributeNS(bt,He,xe):R.setAttribute(He,xe),Ln(R)?es(R):Qu(t.removed)}catch{$s(He,R)}}j(G.afterSanitizeAttributes,R,null)},Xn=function(R){let ee=null;const ge=Ea(R);for(j(G.beforeSanitizeShadowDOM,R,null);ee=ge.nextNode();)if(j(G.uponSanitizeShadowNode,ee,null),Se(ee),Qn(ee),ys(ee.content)&&Xn(ee.content),(b?b(ee):ee.nodeType)===Ws.element){const $e=x?x(ee):ee.shadowRoot;ys($e)&&(pi($e),Xn($e))}j(G.afterSanitizeShadowDOM,R,null)},pi=function(R){const ee=[{node:R,shadow:null}];for(;ee.length>0;){const ge=ee.pop();if(ge.shadow){Xn(ge.shadow);continue}const Me=ge.node,He=(b?b(Me):Me.nodeType)===Ws.element,bt=C?C(Me):Me.childNodes;if(bt)for(let w=bt.length-1;w>=0;--w)ee.push({node:bt[w],shadow:null});if(He){const w=S?S(Me):null;if(typeof w=="string"&&Ye(w)==="template"){const F=Me.content;ys(F)&&ee.push({node:F,shadow:null})}}if(He){const w=x?x(Me):Me.shadowRoot;ys(w)&&ee.push({node:null,shadow:w},{node:w,shadow:null})}}};return t.sanitize=function(Ee){let R=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ee=null,ge=null,Me=null,$e=null;if(an=!Ee,an&&(Ee="<!-->"),typeof Ee!="string"&&!ln(Ee)&&(Ee=tS(Ee),typeof Ee!="string"))throw na("dirty is not a string, aborting");if(!t.isSupported)return Ee;ce||Ze(R),t.removed=[];const He=se&&typeof Ee!="string"&&ln(Ee);if(He){const F=S?S(Ee):Ee.nodeName;if(typeof F=="string"){const Z=Ye(F);if(!ue[Z]||ae[Z])throw na("root node is forbidden and cannot be sanitized in-place")}if(Ln(Ee))throw na("root node is clobbered and cannot be sanitized in-place");try{pi(Ee)}catch(Z){throw Ta(Ee),Z}}else if(ln(Ee))ee=Zn("<!---->"),ge=ee.ownerDocument.importNode(Ee,!0),ge.nodeType===Ws.element&&ge.nodeName==="BODY"||ge.nodeName==="HTML"?ee=ge:ee.appendChild(ge),pi(ge);else{if(!ve&&!ke&&!_e&&Ee.indexOf("<")===-1)return k&&Oe?I(Ee):Ee;if(ee=Zn(Ee),!ee)return ve?null:Oe?A:""}ee&&z&&es(ee.firstChild);const bt=Ea(He?Ee:ee);try{for(;Me=bt.nextNode();)Se(Me),Qn(Me),ys(Me.content)&&Xn(Me.content)}catch(F){throw He&&Ta(Ee),F}if(He)return un(t.removed,F=>{F.element&&Ca(F.element)}),ke&&Jn(Ee),Ee;if(ve){if(ke&&Jn(ee),Te)for($e=P.call(ee.ownerDocument);ee.firstChild;)$e.appendChild(ee.firstChild);else $e=ee;return(y.shadowroot||y.shadowrootmode)&&($e=K.call(n,$e,!0)),$e}let w=_e?ee.outerHTML:ee.innerHTML;return _e&&ue["!doctype"]&&ee.ownerDocument&&ee.ownerDocument.doctype&&ee.ownerDocument.doctype.name&&Bt(pS,ee.ownerDocument.doctype.name)&&(w="<!DOCTYPE "+ee.ownerDocument.doctype.name+`>
`+w),ke&&un([Y,ie,Q],F=>{w=Na(w,F," ")}),k&&Oe?I(w):w},t.setConfig=function(){let Ee=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ze(Ee),ce=!0},t.clearConfig=function(){V=null,ce=!1,k=T,A=""},t.isValidAttribute=function(Ee,R,ee){V||Ze({});const ge=Ye(Ee),Me=Ye(R);return Re(ge,Me,ee)},t.addHook=function(Ee,R){typeof R=="function"&&La(G[Ee],R)},t.removeHook=function(Ee,R){if(R!==void 0){const ee=Wk(G[Ee],R);return ee===-1?void 0:Zk(G[Ee],ee,1)[0]}return Qu(G[Ee])},t.removeHooks=function(Ee){G[Ee]=[]},t.removeAllHooks=function(){G=op()},t}var cp=Hm();function td(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Sa=td();function zm(e){Sa=e}var Di={exec:()=>null};function it(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ls.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ls={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},vS=/^(?:[ \t]*(?:\n|$))+/,gS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,bS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,pl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,yS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,sd=/(?:[*+-]|\d{1,9}[.)])/,jm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Vm=it(jm).replace(/bull/g,sd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),xS=it(jm).replace(/bull/g,sd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),nd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,_S=/^[^\n]+/,ad=/(?!\s*\])(?:\\.|[^\[\]\\])+/,wS=it(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",ad).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),kS=it(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,sd).getRegex(),zr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",id=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,SS=it("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",id).replace("tag",zr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),qm=it(nd).replace("hr",pl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",zr).getRegex(),TS=it(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",qm).getRegex(),ld={blockquote:TS,code:gS,def:wS,fences:bS,heading:yS,hr:pl,html:SS,lheading:Vm,list:kS,newline:vS,paragraph:qm,table:Di,text:_S},dp=it("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",pl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",zr).getRegex(),CS={...ld,lheading:xS,table:dp,paragraph:it(nd).replace("hr",pl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",dp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",zr).getRegex()},ES={...ld,html:it(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",id).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Di,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:it(nd).replace("hr",pl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Vm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},AS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,RS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Gm=/^( {2,}|\\)\n(?!\s*$)/,IS=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,jr=/[\p{P}\p{S}]/u,rd=/[\s\p{P}\p{S}]/u,Km=/[^\s\p{P}\p{S}]/u,OS=it(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,rd).getRegex(),Wm=/(?!~)[\p{P}\p{S}]/u,LS=/(?!~)[\s\p{P}\p{S}]/u,NS=/(?:[^\s\p{P}\p{S}]|~)/u,PS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Zm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,MS=it(Zm,"u").replace(/punct/g,jr).getRegex(),DS=it(Zm,"u").replace(/punct/g,Wm).getRegex(),Jm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",FS=it(Jm,"gu").replace(/notPunctSpace/g,Km).replace(/punctSpace/g,rd).replace(/punct/g,jr).getRegex(),$S=it(Jm,"gu").replace(/notPunctSpace/g,NS).replace(/punctSpace/g,LS).replace(/punct/g,Wm).getRegex(),BS=it("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Km).replace(/punctSpace/g,rd).replace(/punct/g,jr).getRegex(),US=it(/\\(punct)/,"gu").replace(/punct/g,jr).getRegex(),HS=it(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),zS=it(id).replace("(?:-->|$)","-->").getRegex(),jS=it("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",zS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),ur=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,VS=it(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",ur).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Ym=it(/^!?\[(label)\]\[(ref)\]/).replace("label",ur).replace("ref",ad).getRegex(),Qm=it(/^!?\[(ref)\](?:\[\])?/).replace("ref",ad).getRegex(),qS=it("reflink|nolink(?!\\()","g").replace("reflink",Ym).replace("nolink",Qm).getRegex(),od={_backpedal:Di,anyPunctuation:US,autolink:HS,blockSkip:PS,br:Gm,code:RS,del:Di,emStrongLDelim:MS,emStrongRDelimAst:FS,emStrongRDelimUnd:BS,escape:AS,link:VS,nolink:Qm,punctuation:OS,reflink:Ym,reflinkSearch:qS,tag:jS,text:IS,url:Di},GS={...od,link:it(/^!?\[(label)\]\((.*?)\)/).replace("label",ur).getRegex(),reflink:it(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ur).getRegex()},Qo={...od,emStrongRDelimAst:$S,emStrongLDelim:DS,url:it(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},KS={...Qo,br:it(Gm).replace("{2,}","*").getRegex(),text:it(Qo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Il={normal:ld,gfm:CS,pedantic:ES},xi={normal:od,gfm:Qo,breaks:KS,pedantic:GS},WS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},up=e=>WS[e];function Ys(e,t){if(t){if(ls.escapeTest.test(e))return e.replace(ls.escapeReplace,up)}else if(ls.escapeTestNoEncode.test(e))return e.replace(ls.escapeReplaceNoEncode,up);return e}function pp(e){try{e=encodeURI(e).replace(ls.percentDecode,"%")}catch{return null}return e}function fp(e,t){var i;const s=e.replace(ls.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ls.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ls.slashPipe,"|");return n}function _i(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function ZS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function hp(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function JS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var pr=class{constructor(e){ut(this,"options");ut(this,"rules");ut(this,"lexer");this.options=e||Sa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:_i(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=JS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=_i(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:_i(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=_i(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,n=n.substring(0,n.length-f.raw.length)+v.raw,a=a.substring(0,a.length-f.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,n=n.substring(0,n.length-p.raw.length)+v.raw,a=a.substring(0,a.length-f.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const O=this.rules.other.nextBulletRegex(m),x=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),S=this.rules.other.htmlBeginRegex(m);for(;e;){const k=e.split(`
`,1)[0];let A;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),A=p):A=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||S.test(p)||O.test(p)||x.test(p))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+A.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||x.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=k+`
`,e=e.substring(k.length+1),u=A.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,C;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(C=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:C,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=fp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(fp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=_i(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=ZS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),hp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return hp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},yn=class Xo{constructor(t){ut(this,"tokens");ut(this,"options");ut(this,"state");ut(this,"tokenizer");ut(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Sa,this.options.tokenizer=this.options.tokenizer||new pr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ls,block:Il.normal,inline:xi.normal};this.options.pedantic?(s.block=Il.pedantic,s.inline=xi.pedantic):this.options.gfm&&(s.block=Il.gfm,this.options.breaks?s.inline=xi.breaks:s.inline=xi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Il,inline:xi}}static lex(t,s){return new Xo(s).lex(t)}static lexInline(t,s){return new Xo(s).inlineTokens(t)}lex(t){t=t.replace(ls.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ls.tabCharGlobal,"    ").replace(ls.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},fr=class{constructor(e){ut(this,"options");ut(this,"parser");this.options=e||Sa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ls.notSpaceStart))==null?void 0:i[0],a=e.replace(ls.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Ys(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=pp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Ys(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=pp(e);if(a===null)return Ys(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Ys(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Ys(e.text)}},cd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},xn=class ec{constructor(t){ut(this,"options");ut(this,"renderer");ut(this,"textRenderer");this.options=t||Sa,this.options.renderer=this.options.renderer||new fr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new cd}static parse(t,s){return new ec(s).parse(t)}static parseInline(t,s){return new ec(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},yo,Fl=(yo=class{constructor(e){ut(this,"options");ut(this,"block");this.options=e||Sa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?yn.lex:yn.lexInline}provideParser(){return this.block?xn.parse:xn.parseInline}},ut(yo,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),yo),YS=class{constructor(...e){ut(this,"defaults",td());ut(this,"options",this.setOptions);ut(this,"parse",this.parseMarkdown(!0));ut(this,"parseInline",this.parseMarkdown(!1));ut(this,"Parser",xn);ut(this,"Renderer",fr);ut(this,"TextRenderer",cd);ut(this,"Lexer",yn);ut(this,"Tokenizer",pr);ut(this,"Hooks",Fl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new fr(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new pr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Fl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Fl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return yn.lex(e,t??this.defaults)}parser(e,t){return xn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?yn.lex:yn.lexInline,o=i.hooks?i.hooks.provideParser():e?xn.parse:xn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Ys(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ba=new YS;function nt(e,t){return ba.parse(e,t)}nt.options=nt.setOptions=function(e){return ba.setOptions(e),nt.defaults=ba.defaults,zm(nt.defaults),nt};nt.getDefaults=td;nt.defaults=Sa;nt.use=function(...e){return ba.use(...e),nt.defaults=ba.defaults,zm(nt.defaults),nt};nt.walkTokens=function(e,t){return ba.walkTokens(e,t)};nt.parseInline=ba.parseInline;nt.Parser=xn;nt.parser=xn.parse;nt.Renderer=fr;nt.TextRenderer=cd;nt.Lexer=yn;nt.lexer=yn.lex;nt.Tokenizer=pr;nt.Hooks=Fl;nt.parse=nt;nt.options;nt.setOptions;nt.use;nt.walkTokens;nt.parseInline;xn.parse;yn.lex;const QS={breaks:!0,gfm:!0};function mp(e){if(!e)return"";try{if(typeof nt<"u"&&nt.parse){const t=nt.parse(e,QS);return typeof cp<"u"?cp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function XS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const e1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function t1(e){return e1[e]||"wrench"}const s1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function vp(e){if(!e)return[];const t=e.match(s1);return t?[...new Set(t)]:[]}const n1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),r=h("");let o=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=X(()=>t.value.trim().length>0&&!s.value),p=h(Qe.state||"disconnected");let f=null;const m=X(()=>{const D=p.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],C=X(()=>{const D=Math.floor(l.value/4)%v.length,M=l.value;return M>3?`${v[D]} (${M}s)`:v[0]});function O(){Et(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function x(){if(!i.value)return;const D=i.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function g(D,M,P={}){const U={id:++c,role:D,content:M,timestamp:Date.now(),html:D==="bot"?mp(M):"",tools_used:P.tools_used||[],is_error:P.is_error||!1,images:D==="bot"?vp(M):[],files:P.files||[],_showTools:!1};return e.value.push(U),O(),D==="bot"&&Et(()=>b()),U}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(M=>{M.setAttribute("data-copy","true"),M.style.position="relative";const P=document.createElement("button");P.className="chat-code-copy",P.textContent="Copy",P.addEventListener("click",()=>{const U=M.querySelector("code"),K=U?U.textContent:M.textContent;navigator.clipboard.writeText(K).then(()=>{P.textContent="Copied!",setTimeout(()=>{P.textContent="Copy"},1500)}).catch(()=>{})}),M.appendChild(P)})}function S(D){if(D===0)return!0;const M=e.value[D-1],P=e.value[D],U=new Date(M.timestamp).toDateString(),K=new Date(P.timestamp).toDateString();return U!==K}function k(D){const M=new Date(D),P=new Date;if(M.toDateString()===P.toDateString())return"Today";const U=new Date(P);return U.setDate(U.getDate()-1),M.toDateString()===U.toDateString()?"Yesterday":M.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(D){t.value=D,Et(()=>q())}function T(D){window.open(D,"_blank","noopener")}function _(D){D.target.style.display="none"}function N(){l.value=0,o=setInterval(()=>{l.value++},1e3)}function E(){o&&(clearInterval(o),o=null),l.value=0}function I(D){s.value&&(s.value=!1,E(),D.type==="chat_response"?g("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&g("bot",D.error||"Unknown error",{is_error:!0}),Et(()=>{var M;return(M=i.value)==null?void 0:M.focus()}))}async function B(D){try{const M=await W.post("/api/chat",{content:D,channel_id:r.value});g("bot",M.response,{tools_used:M.tools_used||[],is_error:M.is_error||!1,files:M.files||[]})}catch(M){g("bot",M.message||"Failed to send message",{is_error:!0})}}async function q(){const D=t.value.trim();if(!D||s.value)return;g("user",D),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),Qe.connected&&Qe.sendChat(D,{channelId:r.value})||(await B(D),s.value=!1,E()),Et(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}async function oe(){n.value="";try{if(!r.value){const M=await W.get("/api/auth/session");r.value=M.channel_id||M.user_id||"web-user"}const D=await W.get("/api/sessions/"+encodeURIComponent(r.value));if(D&&D.messages&&D.messages.length>0){for(const M of D.messages){const P=M.role==="user"?"user":"bot";let U=M.content||"";if(P==="user"){const G=U.match(/^\[.*?\]:\s*/);G&&(U=U.slice(G[0].length))}if(!U.trim())continue;const K={id:++c,role:P,content:U,timestamp:M.timestamp?M.timestamp*1e3:Date.now(),html:P==="bot"?mp(U):"",tools_used:[],is_error:!1,images:P==="bot"?vp(U):[],files:[],_showTools:!1};e.value.push(K)}Et(()=>{O(),b()})}}catch(D){D&&D.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Ie.error(n.value))}}return We(()=>{Qe.subscribe("chat",I),p.value=Qe.state||"disconnected",f=Qe.onState(D=>{p.value=D}),oe(),Et(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}),vt(()=>{Qe.unsubscribe("chat",I),f&&(f(),f=null),E()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:C,suggestions:d,send:q,autoResize:x,formatTime:XS,formatDate:k,showDateSeparator:S,useSuggestion:A,openImage:T,onImageError:_,getToolIcon:t1,loadHistory:oe}}},a1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=X(()=>e.value==="custom"),v=X(()=>[...i.value,...l.value]),C=X(()=>l.value.includes(e.value)),O=X(()=>{var T;return m.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),x=X(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),g=X(()=>{var T;return m.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function b(){d.value=!0;try{const T=await W.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function k(){const T=u.value.trim();if(T){f.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:T,display_name:O.value,identity:x.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(_){c.value=_.message}finally{f.value=!1}}}async function A(){if(await Qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(_){c.value=_.message}}}return We(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:C,previewName:O,previewIdentity:x,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:k,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Xm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Bk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:n1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:yw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Cw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Kw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:a1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Lk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/internals",redirect:kt("/system","internals")}],Fi=aw({history:D_(),routes:Xm});Fi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const i1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},l1={template:`
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
        <transition name="ws-toast">
          <div v-if="wsToast" class="ws-toast" :class="'ws-toast-' + wsToast.level" role="status" aria-live="assertive">
            {{ wsToast.text }}
          </div>
        </transition>
      </aside>

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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),v=h(""),C=Xm.filter(U=>U.meta),O=X(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:C.filter(K=>K.meta.section===U)})).filter(U=>U.routes.length)),x=X(()=>{var U;return((U=Fi.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=X(()=>{var U;return((U=Fi.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=X(()=>{var U;return((U=Fi.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function S(){Qe.disconnect(),q&&(clearInterval(q),q=null)}W.onSessionExpired=()=>{t.value=!0,S(),W.setToken(""),e.value="login"};function k(U){var K;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Wu());return}if(n.value&&U.key==="Tab"){const G=[...((K=a.value)==null?void 0:K.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(G.length){const Y=G[0],ie=G[G.length-1];if(U.shiftKey&&(document.activeElement===Y||!a.value.contains(document.activeElement))){U.preventDefault(),ie.focus();return}if(!U.shiftKey&&(document.activeElement===ie||!a.value.contains(document.activeElement))){U.preventDefault(),Y.focus();return}}}if(U.key==="Escape"&&n.value){n.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const G=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');G&&G.focus()}}function A(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}We(async()=>{document.addEventListener("keydown",k),r=window.matchMedia("(max-width: 900px)"),A(),r.addEventListener("change",A);const U=await W.check();U.ok?(e.value="ready",M()):U.needsAuth?e.value="login":(e.value="ready",M())});function T(){t.value=!1,e.value="ready",M()}async function _(){S(),e.value="login",await W.logout()}function N(){s.value=!s.value}function E(){n.value=!n.value}rs(n,async U=>{var K,G;if(U)o=document.activeElement,await Et(),(G=(K=a.value)==null?void 0:K.querySelector(".nav-item"))==null||G.focus();else if(o!=null&&o.isConnected){const Y=o;o=null,requestAnimationFrame(()=>Y.focus())}});const I=X(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function B(U,K="info",G=3e3){p.value={text:U,level:K},clearTimeout(f),f=setTimeout(()=>{p.value=null},G)}let q=null,oe=!1,D=[];function M(){for(const U of D)U();D=[Qe.onStatus(U=>{c.value=U}),Qe.onLatencyChange(U=>{u.value=U}),Qe.onState((U,K)=>{d.value=U,U==="connected"?(oe&&B("Connection restored","success"),oe=!0):U==="reconnecting"&&K.attempt===1&&B("Connection lost — reconnecting…","warn")})],Qe.connect(),P(),q&&clearInterval(q),q=setInterval(P,15e3)}async function P(){try{const U=await W.get("/api/status");m.value=U.status==="online"?"online":"starting";const K=U.uptime_seconds||0,G=Math.floor(K/3600),Y=Math.floor(K%3600/60);v.value=`${G}h ${Y}m uptime`}catch{m.value="offline",v.value=""}}return vt(()=>{q&&clearInterval(q);for(const U of D)U();D=[],Qe.disconnect(),document.removeEventListener("keydown",k),r==null||r.removeEventListener("change",A)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:I,wsToast:p,botStatus:m,botUptime:v,navRoutes:C,navGroups:O,currentPage:x,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:_,toggleSidebar:N,toggleMobileNavigation:E,openPalette:Wu}}},Gn=tr(l1);Gn.component("odin-icon",Dk);Gn.component("login-screen",i1);Gn.component("toast-container",J0);Gn.component("confirm-host",Y0);Gn.component("command-palette",Mk);Gn.directive("modal-focus",$k);Gn.use(Fi);Gn.mount("#app");
