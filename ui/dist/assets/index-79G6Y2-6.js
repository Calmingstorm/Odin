var db=Object.defineProperty;var ub=(e,t,s)=>t in e?db(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var wt=(e,t,s)=>ub(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class pb{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new mo("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new sc(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new mo("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new sc((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async setListenerExposure(t,s){const a=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:s})}),n=await a.json().catch(()=>null);if(!a.ok)throw new sc((n==null?void 0:n.error)||"Listener reauthentication failed",a.status,n);return n}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new mo((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof mo?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class mo extends Error{constructor(t){super(t),this.name="AuthError"}}class sc extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class fb{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const j=new pb,dt=new fb(j);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ks(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const nt={},Ci=[],ds=()=>{},wi=()=>!1,Jn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),xr=e=>e.startsWith("onUpdate:"),at=Object.assign,bd=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},mb=Object.prototype.hasOwnProperty,vt=(e,t)=>mb.call(e,t),Oe=Array.isArray,Ti=e=>Wi(e)==="[object Map]",Zn=e=>Wi(e)==="[object Set]",Mu=e=>Wi(e)==="[object Date]",hb=e=>Wi(e)==="[object RegExp]",ze=e=>typeof e=="function",Ke=e=>typeof e=="string",ys=e=>typeof e=="symbol",ft=e=>e!==null&&typeof e=="object",yd=e=>(ft(e)||ze(e))&&ze(e.then)&&ze(e.catch),Gf=Object.prototype.toString,Wi=e=>Gf.call(e),vb=e=>Wi(e).slice(8,-1),_r=e=>Wi(e)==="[object Object]",wr=e=>Ke(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Qa=Ks(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),gb=Ks("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),kr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},bb=/-\w/g,_t=kr(e=>e.replace(bb,t=>t.slice(1).toUpperCase())),yb=/\B([A-Z])/g,$s=kr(e=>e.replace(yb,"-$1").toLowerCase()),Yn=kr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ei=kr(e=>e?`on${Yn(e)}`:""),Xt=(e,t)=>!Object.is(e,t),Ai=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Wf=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Sr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},jo=e=>{const t=Ke(e)?Number(e):NaN;return isNaN(t)?e:t};let Du;const Cr=()=>Du||(Du=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function xb(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const _b="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",wb=Ks(_b);function Yl(e){if(Oe(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Ke(a)?Kf(a):Yl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Ke(e)||ft(e))return e}const kb=/;(?![^(]*\))/g,Sb=/:([^]+)/,Cb=/\/\*[^]*?\*\//g;function Kf(e){const t={};return e.replace(Cb,"").split(kb).forEach(s=>{if(s){const a=s.split(Sb);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function Ql(e){let t="";if(Ke(e))t=e;else if(Oe(e))for(let s=0;s<e.length;s++){const a=Ql(e[s]);a&&(t+=a+" ")}else if(ft(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Tb(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ke(t)&&(e.class=Ql(t)),s&&(e.style=Yl(s)),e}const Eb="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Ab="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Rb="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Ib="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Ob=Ks(Eb),Lb=Ks(Ab),Nb=Ks(Rb),Mb=Ks(Ib),Db="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Pb=Ks(Db);function Jf(e){return!!e||e===""}function $b(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=sn(e[a],t[a]);return s}function sn(e,t){if(e===t)return!0;let s=Mu(e),a=Mu(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=ys(e),a=ys(t),s||a)return e===t;if(s=Oe(e),a=Oe(t),s||a)return s&&a?$b(e,t):!1;if(s=ft(e),a=ft(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!sn(e[l],t[l]))return!1}}return String(e)===String(t)}function Tr(e,t){return e.findIndex(s=>sn(s,t))}const Zf=e=>!!(e&&e.__v_isRef===!0),Yf=e=>Ke(e)?e:e==null?"":Oe(e)||ft(e)&&(e.toString===Gf||!ze(e.toString))?Zf(e)?Yf(e.value):JSON.stringify(e,Qf,2):String(e),Qf=(e,t)=>Zf(t)?Qf(e,t.value):Ti(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[ac(a,i)+" =>"]=n,s),{})}:Zn(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>ac(s))}:ys(t)?ac(t):ft(t)&&!Oe(t)&&!_r(t)?String(t):t,ac=(e,t="")=>{var s;return ys(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Fb(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Jt;class xd{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Jt&&(Jt.active?(this.parent=Jt,this.index=(Jt.scopes||(Jt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Jt;try{return Jt=this,t()}finally{Jt=s}}}on(){++this._on===1&&(this.prevScope=Jt,Jt=this)}off(){if(this._on>0&&--this._on===0){if(Jt===this)Jt=this.prevScope;else{let t=Jt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function Ub(e){return new xd(e)}function Xf(){return Jt}function Bb(e,t=!1){Jt&&Jt.cleanups.push(e)}let Ct;const nc=new WeakSet;class Il{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Jt&&(Jt.active?Jt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,nc.has(this)&&(nc.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||tm(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Pu(this),sm(this);const t=Ct,s=ra;Ct=this,ra=!0;try{return this.fn()}finally{am(this),Ct=t,ra=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)kd(t);this.deps=this.depsTail=void 0,Pu(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?nc.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Lc(this)&&this.run()}get dirty(){return Lc(this)}}let em=0,xl,_l;function tm(e,t=!1){if(e.flags|=8,t){e.next=_l,_l=e;return}e.next=xl,xl=e}function _d(){em++}function wd(){if(--em>0)return;if(_l){let t=_l;for(_l=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;xl;){let t=xl;for(xl=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function sm(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function am(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),kd(a),zb(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Lc(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(nm(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function nm(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ol)||(e.globalVersion=Ol,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Lc(e))))return;e.flags|=2;const t=e.dep,s=Ct,a=ra;Ct=e,ra=!0;try{sm(e);const n=e.fn(e._value);(t.version===0||Xt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{Ct=s,ra=a,am(e),e.flags&=-3}}function kd(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)kd(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function zb(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Hb(e,t){e.effect instanceof Il&&(e=e.effect.fn);const s=new Il(e);t&&at(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function jb(e){e.effect.stop()}let ra=!0;const im=[];function an(){im.push(ra),ra=!1}function nn(){const e=im.pop();ra=e===void 0?!0:e}function Pu(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=Ct;Ct=void 0;try{t()}finally{Ct=s}}}let Ol=0;class Vb{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Er{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!Ct||!ra||Ct===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==Ct)s=this.activeLink=new Vb(Ct,this),Ct.deps?(s.prevDep=Ct.depsTail,Ct.depsTail.nextDep=s,Ct.depsTail=s):Ct.deps=Ct.depsTail=s,lm(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=Ct.depsTail,s.nextDep=void 0,Ct.depsTail.nextDep=s,Ct.depsTail=s,Ct.deps===s&&(Ct.deps=a)}return s}trigger(t){this.version++,Ol++,this.notify(t)}notify(t){_d();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{wd()}}}function lm(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)lm(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Vo=new WeakMap,Bn=Symbol(""),Nc=Symbol(""),Ll=Symbol("");function vs(e,t,s){if(ra&&Ct){let a=Vo.get(e);a||Vo.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new Er),n.map=a,n.key=s),n.track()}}function Wa(e,t,s,a,n,i){const l=Vo.get(e);if(!l){Ol++;return}const o=r=>{r&&r.trigger()};if(_d(),t==="clear")l.forEach(o);else{const r=Oe(e),c=r&&wr(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Ll||!ys(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Ll)),t){case"add":r?c&&o(l.get("length")):(o(l.get(Bn)),Ti(e)&&o(l.get(Nc)));break;case"delete":r||(o(l.get(Bn)),Ti(e)&&o(l.get(Nc)));break;case"set":Ti(e)&&o(l.get(Bn));break}}wd()}function qb(e,t){const s=Vo.get(e);return s&&s.get(t)}function pi(e){const t=ct(e);return t===e?t:(vs(t,"iterate",Ll),Us(e)?t:t.map(da))}function Ar(e){return vs(e=ct(e),"iterate",Ll),e}function Sa(e,t){return Ta(e)?Di(Xa(e)?da(t):t):da(t)}const Gb={__proto__:null,[Symbol.iterator](){return ic(this,Symbol.iterator,e=>Sa(this,e))},concat(...e){return pi(this).concat(...e.map(t=>Oe(t)?pi(t):t))},entries(){return ic(this,"entries",e=>(e[1]=Sa(this,e[1]),e))},every(e,t){return Ua(this,"every",e,t,void 0,arguments)},filter(e,t){return Ua(this,"filter",e,t,s=>s.map(a=>Sa(this,a)),arguments)},find(e,t){return Ua(this,"find",e,t,s=>Sa(this,s),arguments)},findIndex(e,t){return Ua(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ua(this,"findLast",e,t,s=>Sa(this,s),arguments)},findLastIndex(e,t){return Ua(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ua(this,"forEach",e,t,void 0,arguments)},includes(...e){return lc(this,"includes",e)},indexOf(...e){return lc(this,"indexOf",e)},join(e){return pi(this).join(e)},lastIndexOf(...e){return lc(this,"lastIndexOf",e)},map(e,t){return Ua(this,"map",e,t,void 0,arguments)},pop(){return nl(this,"pop")},push(...e){return nl(this,"push",e)},reduce(e,...t){return $u(this,"reduce",e,t)},reduceRight(e,...t){return $u(this,"reduceRight",e,t)},shift(){return nl(this,"shift")},some(e,t){return Ua(this,"some",e,t,void 0,arguments)},splice(...e){return nl(this,"splice",e)},toReversed(){return pi(this).toReversed()},toSorted(e){return pi(this).toSorted(e)},toSpliced(...e){return pi(this).toSpliced(...e)},unshift(...e){return nl(this,"unshift",e)},values(){return ic(this,"values",e=>Sa(this,e))}};function ic(e,t,s){const a=Ar(e),n=a[t]();return a!==e&&!Us(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const Wb=Array.prototype;function Ua(e,t,s,a,n,i){const l=Ar(e),o=l!==e&&!Us(e),r=l[t];if(r!==Wb[t]){const u=r.apply(e,i);return o?da(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,Sa(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function $u(e,t,s,a){const n=Ar(e),i=n!==e&&!Us(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=Sa(e,c)),s.call(this,c,Sa(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?Sa(e,r):r}function lc(e,t,s){const a=ct(e);vs(a,"iterate",Ll);const n=a[t](...s);return(n===-1||n===!1)&&Xl(s[0])?(s[0]=ct(s[0]),a[t](...s)):n}function nl(e,t,s=[]){an(),_d();const a=ct(e)[t].apply(e,s);return wd(),nn(),a}const Kb=Ks("__proto__,__v_isRef,__isVue"),om=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ys));function Jb(e){ys(e)||(e=String(e));const t=ct(this);return vs(t,"has",e),t.hasOwnProperty(e)}class rm{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?mm:fm:i?pm:um).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Oe(t);if(!n){let r;if(l&&(r=Gb[s]))return r;if(s==="hasOwnProperty")return Jb}const o=Reflect.get(t,s,qt(t)?t:a);if((ys(s)?om.has(s):Kb(s))||(n||vs(t,"get",s),i))return o;if(qt(o)){const r=l&&wr(s)?o:o.value;return n&&ft(r)?qo(r):r}return ft(o)?n?qo(o):Tn(o):o}}class cm extends rm{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Oe(t)&&wr(s);if(!this._isShallow){const c=Ta(i);if(!Us(a)&&!Ta(a)&&(i=ct(i),a=ct(a)),!l&&qt(i)&&!qt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:vt(t,s),r=Reflect.set(t,s,a,qt(t)?t:n);return t===ct(n)&&(o?Xt(a,i)&&Wa(t,"set",s,a):Wa(t,"add",s,a)),r}deleteProperty(t,s){const a=vt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Wa(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!ys(s)||!om.has(s))&&vs(t,"has",s),a}ownKeys(t){return vs(t,"iterate",Oe(t)?"length":Bn),Reflect.ownKeys(t)}}class dm extends rm{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Zb=new cm,Yb=new dm,Qb=new cm(!0),Xb=new dm(!0),Mc=e=>e,ho=e=>Reflect.getPrototypeOf(e);function ey(e,t,s){return function(...a){const n=this.__v_raw,i=ct(n),l=Ti(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Mc:t?Di:da;return!t&&vs(i,"iterate",r?Nc:Bn),at(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function vo(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function ty(e,t){const s={get(n){const i=this.__v_raw,l=ct(i),o=ct(n);e||(Xt(n,o)&&vs(l,"get",n),vs(l,"get",o));const{has:r}=ho(l),c=t?Mc:e?Di:da;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&vs(ct(n),"iterate",Bn),n.size},has(n){const i=this.__v_raw,l=ct(i),o=ct(n);return e||(Xt(n,o)&&vs(l,"has",n),vs(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=ct(o),c=t?Mc:e?Di:da;return!e&&vs(r,"iterate",Bn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return at(s,e?{add:vo("add"),set:vo("set"),delete:vo("delete"),clear:vo("clear")}:{add(n){const i=ct(this),l=ho(i),o=ct(n),r=!t&&!Us(n)&&!Ta(n)?o:n;return l.has.call(i,r)||Xt(n,r)&&l.has.call(i,n)||Xt(o,r)&&l.has.call(i,o)||(i.add(r),Wa(i,"add",r,r)),this},set(n,i){!t&&!Us(i)&&!Ta(i)&&(i=ct(i));const l=ct(this),{has:o,get:r}=ho(l);let c=o.call(l,n);c||(n=ct(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?Xt(i,d)&&Wa(l,"set",n,i):Wa(l,"add",n,i),this},delete(n){const i=ct(this),{has:l,get:o}=ho(i);let r=l.call(i,n);r||(n=ct(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Wa(i,"delete",n,void 0),c},clear(){const n=ct(this),i=n.size!==0,l=n.clear();return i&&Wa(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=ey(n,e,t)}),s}function Rr(e,t){const s=ty(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(vt(s,n)&&n in a?s:a,n,i)}const sy={get:Rr(!1,!1)},ay={get:Rr(!1,!0)},ny={get:Rr(!0,!1)},iy={get:Rr(!0,!0)},um=new WeakMap,pm=new WeakMap,fm=new WeakMap,mm=new WeakMap;function ly(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Tn(e){return Ta(e)?e:Ir(e,!1,Zb,sy,um)}function Sd(e){return Ir(e,!1,Qb,ay,pm)}function qo(e){return Ir(e,!0,Yb,ny,fm)}function oy(e){return Ir(e,!0,Xb,iy,mm)}function Ir(e,t,s,a,n){if(!ft(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=ly(vb(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Xa(e){return Ta(e)?Xa(e.__v_raw):!!(e&&e.__v_isReactive)}function Ta(e){return!!(e&&e.__v_isReadonly)}function Us(e){return!!(e&&e.__v_isShallow)}function Xl(e){return e?!!e.__v_raw:!1}function ct(e){const t=e&&e.__v_raw;return t?ct(t):e}function hm(e){return!vt(e,"__v_skip")&&Object.isExtensible(e)&&Wf(e,"__v_skip",!0),e}const da=e=>ft(e)?Tn(e):e,Di=e=>ft(e)?qo(e):e;function qt(e){return e?e.__v_isRef===!0:!1}function f(e){return vm(e,!1)}function Cd(e){return vm(e,!0)}function vm(e,t){return qt(e)?e:new ry(e,t)}class ry{constructor(t,s){this.dep=new Er,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:ct(t),this._value=s?t:da(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Us(t)||Ta(t);t=a?t:ct(t),Xt(t,s)&&(this._rawValue=t,this._value=a?t:da(t),this.dep.trigger())}}function cy(e){e.dep&&e.dep.trigger()}function Ca(e){return qt(e)?e.value:e}function dy(e){return ze(e)?e():Ca(e)}const uy={get:(e,t,s)=>t==="__v_raw"?e:Ca(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return qt(n)&&!qt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Td(e){return Xa(e)?e:new Proxy(e,uy)}class py{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Er,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function gm(e){return new py(e)}function fy(e){const t=Oe(e)?new Array(e.length):{};for(const s in e)t[s]=bm(e,s);return t}class my{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=ys(s)?s:String(s),this._raw=ct(t);let n=!0,i=t;if(!Oe(t)||ys(this._key)||!wr(this._key))do n=!Xl(i)||Us(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=Ca(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&qt(this._raw[this._key])){const s=this._object[this._key];if(qt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return qb(this._raw,this._key)}}class hy{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function vy(e,t,s){return qt(e)?e:ze(e)?new hy(e):ft(e)&&arguments.length>1?bm(e,t,s):f(e)}function bm(e,t,s){return new my(e,t,s)}class gy{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Er(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ol-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&Ct!==this)return tm(this,!0),!0}get value(){const t=this.dep.track();return nm(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function by(e,t,s=!1){let a,n;return ze(e)?a=e:(a=e.get,n=e.set),new gy(a,n,s)}const yy={GET:"get",HAS:"has",ITERATE:"iterate"},xy={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},go={},Go=new WeakMap;let bn;function _y(){return bn}function ym(e,t=!1,s=bn){if(s){let a=Go.get(s);a||Go.set(s,a=[]),a.push(e)}}function wy(e,t,s=nt){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=y=>n?y:Us(y)||n===!1||n===0?Ka(y,1):Ka(y);let d,u,p,m,h=!1,g=!1;if(qt(e)?(u=()=>e.value,h=Us(e)):Xa(e)?(u=()=>c(e),h=!0):Oe(e)?(g=!0,h=e.some(y=>Xa(y)||Us(y)),u=()=>e.map(y=>{if(qt(y))return y.value;if(Xa(y))return c(y);if(ze(y))return r?r(y,2):y()})):ze(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){an();try{p()}finally{nn()}}const y=bn;bn=d;try{return r?r(e,3,[m]):e(m)}finally{bn=y}}:u=ds,t&&n){const y=u,_=n===!0?1/0:n;u=()=>Ka(y(),_)}const R=Xf(),O=()=>{d.stop(),R&&R.active&&bd(R.effects,d)};if(i&&t){const y=t;t=(..._)=>{const k=y(..._);return O(),k}}let x=g?new Array(e.length).fill(go):go;const b=y=>{if(!(!(d.flags&1)||!d.dirty&&!y))if(t){const _=d.run();if(y||n||h||(g?_.some((k,T)=>Xt(k,x[T])):Xt(_,x))){p&&p();const k=bn;bn=d;try{const T=[_,x===go?void 0:g&&x[0]===go?[]:x,m];x=_,r?r(t,3,T):t(...T)}finally{bn=k}}}else d.run()};return o&&o(b),d=new Il(u),d.scheduler=l?()=>l(b,!1):b,m=y=>ym(y,!1,d),p=d.onStop=()=>{const y=Go.get(d);if(y){if(r)r(y,4);else for(const _ of y)_();Go.delete(d)}},t?a?b(!0):x=d.run():l?l(b.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function Ka(e,t=1/0,s){if(t<=0||!ft(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,qt(e))Ka(e.value,t,s);else if(Oe(e))for(let a=0;a<e.length;a++)Ka(e[a],t,s);else if(Zn(e)||Ti(e))e.forEach(a=>{Ka(a,t,s)});else if(_r(e)){for(const a in e)Ka(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ka(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const xm=[];function ky(e){xm.push(e)}function Sy(){xm.pop()}function Cy(e,t){}const Ty={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Ey={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ki(e,t,s,a){try{return a?e(...a):e()}catch(n){Qn(n,t,s)}}function Ws(e,t,s,a){if(ze(e)){const n=Ki(e,t,s,a);return n&&yd(n)&&n.catch(i=>{Qn(i,t,s)}),n}if(Oe(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Ws(e[i],t,s,a));return n}}function Qn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||nt;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){an(),Ki(i,null,10,[e,r,c]),nn();return}}Ay(e,s,n,a,l)}function Ay(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const Cs=[];let wa=-1;const Ri=[];let yn=null,bi=0;const _m=Promise.resolve();let Wo=null;function zt(e){const t=Wo||_m;return e?t.then(this?e.bind(this):e):t}function Ry(e){let t=wa+1,s=Cs.length;for(;t<s;){const a=t+s>>>1,n=Cs[a],i=Ml(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Ed(e){if(!(e.flags&1)){const t=Ml(e),s=Cs[Cs.length-1];!s||!(e.flags&2)&&t>=Ml(s)?Cs.push(e):Cs.splice(Ry(t),0,e),e.flags|=1,wm()}}function wm(){Wo||(Wo=_m.then(km))}function Nl(e){Oe(e)?Ri.push(...e):yn&&e.id===-1?yn.splice(bi+1,0,e):e.flags&1||(Ri.push(e),e.flags|=1),wm()}function Fu(e,t,s=wa+1){for(;s<Cs.length;s++){const a=Cs[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;Cs.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function Ko(e){if(Ri.length){const t=[...new Set(Ri)].sort((s,a)=>Ml(s)-Ml(a));if(Ri.length=0,yn){yn.push(...t);return}for(yn=t,bi=0;bi<yn.length;bi++){const s=yn[bi];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}yn=null,bi=0}}const Ml=e=>e.id==null?e.flags&2?-1:1/0:e.id;function km(e){try{for(wa=0;wa<Cs.length;wa++){const t=Cs[wa];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ki(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;wa<Cs.length;wa++){const t=Cs[wa];t&&(t.flags&=-2)}wa=-1,Cs.length=0,Ko(),Wo=null,(Cs.length||Ri.length)&&km()}}let yi,bo=[];function Sm(e,t){var s,a;yi=e,yi?(yi.enabled=!0,bo.forEach(({event:n,args:i})=>yi.emit(n,...i)),bo=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Sm(i,t)}),setTimeout(()=>{yi||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,bo=[])},3e3)):bo=[]}let cs=null,Or=null;function Dl(e){const t=cs;return cs=e,Or=e&&e.type.__scopeId||null,t}function Iy(e){Or=e}function Oy(){Or=null}const Ly=e=>Ad;function Ad(e,t=cs,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&Ul(-1);const i=Dl(t);let l;try{l=e(...n)}finally{Dl(i),a._d&&Ul(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function Ny(e,t){if(cs===null)return e;const s=ao(cs),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=nt]=t[n];i&&(ze(i)&&(i={mounted:i,updated:i}),i.deep&&Ka(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function ka(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(an(),Ws(r,s,8,[e.el,o,e,t]),nn())}}function wl(e,t){if(rs){let s=rs.provides;const a=rs.parent&&rs.parent.provides;a===s&&(s=rs.provides=Object.create(a)),s[e]=t}}function aa(e,t,s=!1){const a=Es();if(a||zn){let n=zn?zn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&ze(t)?t.call(a&&a.proxy):t}}function My(){return!!(Es()||zn)}const Cm=Symbol.for("v-scx"),Tm=()=>aa(Cm);function Dy(e,t){return eo(e,null,t)}function Py(e,t){return eo(e,null,{flush:"post"})}function Em(e,t){return eo(e,null,{flush:"sync"})}function Gt(e,t,s){return eo(e,t,s)}function eo(e,t,s=nt){const{immediate:a,deep:n,flush:i,once:l}=s,o=at({},s),r=t&&a||!t&&i!=="post";let c;if(Gn){if(i==="sync"){const m=Tm();c=m.__watcherHandles||(m.__watcherHandles=[])}else if(!r){const m=()=>{};return m.stop=ds,m.resume=ds,m.pause=ds,m}}const d=rs;o.call=(m,h,g)=>Ws(m,d,h,g);let u=!1;i==="post"?o.scheduler=m=>{jt(m,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(m,h)=>{h?m():Ed(m)}),o.augmentJob=m=>{t&&(m.flags|=4),u&&(m.flags|=2,d&&(m.id=d.uid,m.i=d))};const p=wy(e,t,o);return Gn&&(c?c.push(p):r&&p()),p}function $y(e,t,s){const a=this.proxy,n=Ke(e)?e.includes(".")?Am(a,e):()=>a[e]:e.bind(a,a);let i;ze(t)?i=t:(i=t.handler,s=t);const l=Ji(this),o=eo(n,i.bind(a),s);return l(),o}function Am(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const vn=new WeakMap,Rm=Symbol("_vte"),Im=e=>e.__isTeleport,Pn=e=>e&&(e.disabled||e.disabled===""),Fy=e=>e&&(e.defer||e.defer===""),Uu=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Bu=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Dc=(e,t)=>{const s=e&&e.to;return Ke(s)?t?t(s):null:s},Uy={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:m,querySelector:h,createText:g,createComment:R,parentNode:O}}=c,x=Pn(t.props);let{dynamicChildren:b}=t;const y=(T,A,w)=>{T.shapeFlag&16&&d(T.children,A,w,n,i,l,o,r)},_=(T=t)=>{const A=Pn(T.props),w=T.target=Dc(T.props,h),I=Pc(w,T,g,m);w&&(l!=="svg"&&Uu(w)?l="svg":l!=="mathml"&&Bu(w)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(w),A||(y(T,w,I),hl(T,!1)))},k=T=>{const A=()=>{if(vn.get(T)===A){if(vn.delete(T),Pn(T.props)){const w=O(T.el)||s;y(T,w,T.anchor),hl(T,!0)}_(T)}};vn.set(T,A),jt(A,i)};if(e==null){const T=t.el=g(""),A=t.anchor=g("");if(m(T,s,a),m(A,s,a),Fy(t.props)||i&&i.pendingBranch){k(t);return}x&&(y(t,s,A),hl(t,!0)),_()}else{t.el=e.el;const T=t.anchor=e.anchor,A=vn.get(e);if(A){A.flags|=8,vn.delete(e),k(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,I=t.targetAnchor=e.targetAnchor,U=Pn(e.props),C=U?s:w,F=U?T:I;if(l==="svg"||Uu(w)?l="svg":(l==="mathml"||Bu(w))&&(l="mathml"),b?(p(e.dynamicChildren,b,C,n,i,l,o),Ud(e,t,!0)):r||u(e,t,C,F,n,i,l,o,!1),x)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):yo(t,s,T,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Z=t.target=Dc(t.props,h);Z&&yo(t,Z,null,c,0)}else U&&yo(t,w,I,c,1);hl(t,x)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,m=i||!Pn(p),h=vn.get(e);if(h&&(h.flags|=8,vn.delete(e)),u&&(n(c),n(d)),i&&n(r),!h&&l&16)for(let g=0;g<o.length;g++){const R=o[g];a(R,t,s,m,!!R.dynamicChildren)}},move:yo,hydrate:By};function yo(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!vn.has(e)&&(!u||Pn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function By(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(R,O){let x=O;for(;x;){if(x&&x.nodeType===8){if(x.data==="teleport start anchor")t.targetStart=x;else if(x.data==="teleport anchor"){t.targetAnchor=x,R._lpa=t.targetAnchor&&l(t.targetAnchor);break}}x=l(x)}}function m(R,O){O.anchor=u(l(R),O,o(R),s,a,n,i)}const h=t.target=Dc(t.props,r),g=Pn(t.props);if(h){const R=h._lpa||h.firstChild;t.shapeFlag&16&&(g?(m(e,t),p(h,R),t.targetAnchor||Pc(h,t,d,c,o(e)===h?e:null)):(t.anchor=l(e),p(h,R),t.targetAnchor||Pc(h,t,d,c),u(R&&l(R),t,h,s,a,n,i))),hl(t,g)}else g&&t.shapeFlag&16&&(m(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const zy=Uy;function hl(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Pc(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Rm]=l,e&&(a(i,e,n),a(l,e,n)),l}const Xs=Symbol("_leaveCb"),il=Symbol("_enterCb");function Rd(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return tt(()=>{e.isMounted=!0}),Dr(()=>{e.isUnmounting=!0}),e}const Qs=[Function,Array],Id={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Qs,onEnter:Qs,onAfterEnter:Qs,onEnterCancelled:Qs,onBeforeLeave:Qs,onLeave:Qs,onAfterLeave:Qs,onLeaveCancelled:Qs,onBeforeAppear:Qs,onAppear:Qs,onAfterAppear:Qs,onAppearCancelled:Qs},Om=e=>{const t=e.subTree;return t.component?Om(t.component):t},Hy={name:"BaseTransition",props:Id,setup(e,{slots:t}){const s=Es(),a=Rd();return()=>{const n=t.default&&Lr(t.default(),!0),i=n&&n.length?Lm(n):s.subTree?mh():void 0;if(!i)return;const l=ct(e),{mode:o}=l;if(a.isLeaving)return oc(i);const r=zu(i);if(!r)return oc(i);let c=Pi(r,l,a,s,u=>c=u);r.type!==Ht&&ln(r,c);let d=s.subTree&&zu(s.subTree);if(d&&d.type!==Ht&&!oa(d,r)&&Om(s).type!==Ht){let u=Pi(d,l,a,s);if(ln(d,u),o==="out-in"&&r.type!==Ht)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},oc(i);o==="in-out"&&r.type!==Ht?u.delayLeave=(p,m,h)=>{const g=Mm(a,d);g[String(d.key)]=d,p[Xs]=()=>{m(),p[Xs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{h(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Lm(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ht){t=s;break}}return t}const Nm=Hy;function Mm(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function Pi(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:m,onAfterLeave:h,onLeaveCancelled:g,onBeforeAppear:R,onAppear:O,onAfterAppear:x,onAppearCancelled:b}=t,y=String(e.key),_=Mm(s,e),k=(w,I)=>{w&&Ws(w,a,9,I)},T=(w,I)=>{const U=I[1];k(w,I),Oe(w)?w.every(C=>C.length<=1)&&U():w.length<=1&&U()},A={mode:l,persisted:o,beforeEnter(w){let I=r;if(!s.isMounted)if(i)I=R||r;else return;w[Xs]&&w[Xs](!0);const U=_[y];U&&oa(e,U)&&U.el[Xs]&&U.el[Xs](),k(I,[w])},enter(w){if(_[y]===e)return;let I=c,U=d,C=u;if(!s.isMounted)if(i)I=O||c,U=x||d,C=b||u;else return;let F=!1;w[il]=W=>{F||(F=!0,W?k(C,[w]):k(U,[w]),A.delayedLeave&&A.delayedLeave(),w[il]=void 0)};const Z=w[il].bind(null,!1);I?T(I,[w,Z]):Z()},leave(w,I){const U=String(e.key);if(w[il]&&w[il](!0),s.isUnmounting)return I();k(p,[w]);let C=!1;w[Xs]=Z=>{C||(C=!0,I(),Z?k(g,[w]):k(h,[w]),w[Xs]=void 0,_[U]===e&&delete _[U])};const F=w[Xs].bind(null,!1);_[U]=e,m?T(m,[w,F]):F()},clone(w){const I=Pi(w,t,s,a,n);return n&&n(I),I}};return A}function oc(e){if(so(e))return e=Ea(e),e.children=null,e}function zu(e){if(!so(e))return Im(e.type)&&e.children?Lm(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&ze(s.default))return s.default()}}function ln(e,t){e.shapeFlag&6&&e.component?(e.transition=t,ln(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Lr(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===es?(l.patchFlag&128&&n++,a=a.concat(Lr(l.children,t,o))):(t||l.type!==Ht)&&a.push(o!=null?Ea(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function to(e,t){return ze(e)?at({name:e.name},t,{setup:e}):e}function jy(){const e=Es();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Od(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Vy(e){const t=Es(),s=Cd(null);if(t){const n=t.refs===nt?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Hu(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Jo=new WeakMap;function Ii(e,t,s,a,n=!1){if(Oe(e)){e.forEach((g,R)=>Ii(g,t&&(Oe(t)?t[R]:t),s,a,n));return}if(en(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&Ii(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?ao(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===nt?o.refs={}:o.refs,u=o.setupState,p=ct(u),m=u===nt?wi:g=>Hu(d,g)?!1:vt(p,g),h=(g,R)=>!(R&&Hu(d,R));if(c!=null&&c!==r){if(ju(t),Ke(c))d[c]=null,m(c)&&(u[c]=null);else if(qt(c)){const g=t;h(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(ze(r))Ki(r,o,12,[l,d]);else{const g=Ke(r),R=qt(r);if(g||R){const O=()=>{if(e.f){const x=g?m(r)?u[r]:d[r]:h()||!e.k?r.value:d[e.k];if(n)Oe(x)&&bd(x,i);else if(Oe(x))x.includes(i)||x.push(i);else if(g)d[r]=[i],m(r)&&(u[r]=d[r]);else{const b=[i];h(r,e.k)&&(r.value=b),e.k&&(d[e.k]=b)}}else g?(d[r]=l,m(r)&&(u[r]=l)):R&&(h(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const x=()=>{O(),Jo.delete(e)};x.id=-1,Jo.set(e,x),jt(x,s)}else ju(e),O()}}}function ju(e){const t=Jo.get(e);t&&(t.flags|=8,Jo.delete(e))}let Vu=!1;const fi=()=>{Vu||(console.error("Hydration completed but contains mismatches."),Vu=!0)},qy=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Gy=e=>e.namespaceURI.includes("MathML"),xo=e=>{if(e.nodeType===1){if(qy(e))return"svg";if(Gy(e))return"mathml"}},ki=e=>e.nodeType===8;function Wy(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(b,y)=>{if(!y.hasChildNodes()){s(null,b,y),Ko(),y._vnode=b;return}u(y.firstChild,b,null,null,null),Ko(),y._vnode=b},u=(b,y,_,k,T,A=!1)=>{A=A||!!y.dynamicChildren;const w=ki(b)&&b.data==="[",I=()=>g(b,y,_,k,T,w),{type:U,ref:C,shapeFlag:F,patchFlag:Z}=y;let W=b.nodeType;y.el=b,Z===-2&&(A=!1,y.dynamicChildren=null);let P=null;switch(U){case kn:W!==3?y.children===""?(r(y.el=n(""),l(b),b),P=b):P=I():(b.data!==y.children&&(fi(),b.data=y.children),P=i(b));break;case Ht:x(b)?(P=i(b),O(y.el=b.content.firstChild,b,_)):W!==8||w?P=I():P=i(b);break;case Hn:if(w&&(b=i(b),W=b.nodeType),W===1||W===3){P=b;const N=!y.children.length;for(let D=0;D<y.staticCount;D++)N&&(y.children+=P.nodeType===1?P.outerHTML:P.data),D===y.staticCount-1&&(y.anchor=P),P=i(P);return w?i(P):P}else I();break;case es:w?P=h(b,y,_,k,T,A):P=I();break;default:if(F&1)(W!==1||y.type.toLowerCase()!==b.tagName.toLowerCase())&&!x(b)?P=I():P=p(b,y,_,k,T,A);else if(F&6){y.slotScopeIds=T;const N=l(b);if(w?P=R(b):ki(b)&&b.data==="teleport start"?P=R(b,b.data,"teleport end"):P=i(b),t(y,N,null,_,k,xo(N),A),en(y)&&!y.type.__asyncResolved){let D;w?(D=It(es),D.anchor=P?P.previousSibling:N.lastChild):D=b.nodeType===3?zd(""):It("div"),D.el=b,y.component.subTree=D}}else F&64?W!==8?P=I():P=y.type.hydrate(b,y,_,k,T,A,e,m):F&128&&(P=y.type.hydrate(b,y,_,k,xo(l(b)),T,A,e,u))}return C!=null&&Ii(C,null,k,y),P},p=(b,y,_,k,T,A)=>{A=A||!!y.dynamicChildren;const{type:w,props:I,patchFlag:U,shapeFlag:C,dirs:F,transition:Z}=y,W=w==="input"||w==="option";if(W||U!==-1){F&&ka(y,null,_,"created");let P=!1;if(x(b)){P=ih(null,Z)&&_&&_.vnode.props&&_.vnode.props.appear;const D=b.content.firstChild;if(P){const oe=D.getAttribute("class");oe&&(D.$cls=oe),Z.beforeEnter(D)}O(D,b,_),y.el=b=D}if(C&16&&!(I&&(I.innerHTML||I.textContent))){let D=m(b.firstChild,y,b,_,k,T,A);for(D&&!_o(b,1)&&fi();D;){const oe=D;D=D.nextSibling,o(oe)}}else if(C&8){let D=y.children;D[0]===`
`&&(b.tagName==="PRE"||b.tagName==="TEXTAREA")&&(D=D.slice(1));const{textContent:oe}=b;oe!==D&&oe!==D.replace(/\r\n|\r/g,`
`)&&(_o(b,0)||fi(),b.textContent=y.children)}if(I){if(W||!A||U&48){const D=b.tagName.includes("-");for(const oe in I)(W&&(oe.endsWith("value")||oe==="indeterminate")||Jn(oe)&&!Qa(oe)||oe[0]==="."||D&&!Qa(oe))&&a(b,oe,null,I[oe],void 0,_)}else if(I.onClick)a(b,"onClick",null,I.onClick,void 0,_);else if(U&4&&Xa(I.style))for(const D in I.style)I.style[D]}let N;(N=I&&I.onVnodeBeforeMount)&&Ms(N,_,y),F&&ka(y,null,_,"beforeMount"),((N=I&&I.onVnodeMounted)||F||P)&&ch(()=>{N&&Ms(N,_,y),P&&Z.enter(b),F&&ka(y,null,_,"mounted")},k)}return b.nextSibling},m=(b,y,_,k,T,A,w)=>{w=w||!!y.dynamicChildren;const I=y.children,U=I.length;let C=!1;for(let F=0;F<U;F++){const Z=w?I[F]:I[F]=Ps(I[F]),W=Z.type===kn;b?(W&&!w&&F+1<U&&Ps(I[F+1]).type===kn&&(r(n(b.data.slice(Z.children.length)),_,i(b)),b.data=Z.children),b=u(b,Z,k,T,A,w)):W&&!Z.children?r(Z.el=n(""),_):(C||(C=!0,_o(_,1)||fi()),s(null,Z,_,null,k,T,xo(_),A))}return b},h=(b,y,_,k,T,A)=>{const{slotScopeIds:w}=y;w&&(T=T?T.concat(w):w);const I=l(b),U=m(i(b),y,I,_,k,T,A);return U&&ki(U)&&U.data==="]"?i(y.anchor=U):(fi(),r(y.anchor=c("]"),I,U),U)},g=(b,y,_,k,T,A)=>{if(_o(b.parentElement,1)||fi(),y.el=null,A){const U=R(b);for(;;){const C=i(b);if(C&&C!==U)o(C);else break}}const w=i(b),I=l(b);return o(b),s(null,y,I,w,_,k,xo(I),T),_&&(_.vnode.el=y.el,$r(_,y.el)),w},R=(b,y="[",_="]")=>{let k=0;for(;b;)if(b=i(b),b&&ki(b)&&(b.data===y&&k++,b.data===_)){if(k===0)return i(b);k--}return b},O=(b,y,_)=>{const k=y.parentNode;k&&k.replaceChild(b,y);let T=_;for(;T;)T.vnode.el===y&&(T.vnode.el=T.subTree.el=b),T=T.parent},x=b=>b.nodeType===1&&b.tagName==="TEMPLATE";return[d,u]}const qu="data-allow-mismatch",Ky={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function _o(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(qu);)e=e.parentElement;const s=e&&e.getAttribute(qu);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(Ky[t])}}const Jy=Cr().requestIdleCallback||(e=>setTimeout(e,1)),Zy=Cr().cancelIdleCallback||(e=>clearTimeout(e)),Yy=(e=1e4)=>t=>{const s=Jy(t,{timeout:e});return()=>Zy(s)};function Qy(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const Xy=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(Qy(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},ex=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},tx=(e=[])=>(t,s)=>{Ke(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function sx(e,t){if(ki(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(ki(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const en=e=>!!e.type.__asyncLoader;function ax(e){ze(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,m()),m=()=>{let h;return c||(h=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),r)return new Promise((R,O)=>{r(g,()=>R(p()),()=>O(g),u+1)});throw g}).then(g=>h!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return to({name:"AsyncComponentWrapper",__asyncLoader:m,__asyncHydrate(h,g,R){let O=!1;(g.bu||(g.bu=[])).push(()=>O=!0);const x=()=>{O||R()},b=i?()=>{const y=i(x,_=>sx(h,_));y&&(g.bum||(g.bum=[])).push(y)}:x;d?b():m().then(()=>!g.isUnmounted&&b())},get __asyncResolved(){return d},setup(){const h=rs;if(Od(h),d)return()=>wo(d,h);const g=_=>{c=null,Qn(_,h,13,!a)};if(o&&h.suspense||Gn)return m().then(_=>()=>wo(_,h)).catch(_=>(g(_),()=>a?It(a,{error:_}):null));const R=f(!1),O=f(),x=f(!!n);let b,y;return xt(()=>{b!=null&&clearTimeout(b),y!=null&&clearTimeout(y)}),n&&(y=setTimeout(()=>{h.isUnmounted||(x.value=!1)},n)),l!=null&&(b=setTimeout(()=>{if(!h.isUnmounted&&!R.value&&!O.value){const _=new Error(`Async component timed out after ${l}ms.`);g(_),O.value=_}},l)),m().then(()=>{h.isUnmounted||(R.value=!0,h.parent&&so(h.parent.vnode)&&h.parent.update())}).catch(_=>{if(h.isUnmounted){c=null;return}g(_),O.value=_}),()=>{if(R.value&&d)return wo(d,h);if(O.value&&a)return It(a,{error:O.value});if(s&&!x.value)return wo(s,h)}}})}function wo(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=It(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const so=e=>e.type.__isKeepAlive,nx={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Es(),a=s.ctx;if(!a.renderer)return()=>{const x=t.default&&t.default();return x&&x.length===1?x[0]:x};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(x,b,y,_,k)=>{const T=x.component;c(x,b,y,0,o),r(T.vnode,x,b,y,T,o,_,x.slotScopeIds,k),jt(()=>{T.isDeactivated=!1,T.a&&Ai(T.a);const A=x.props&&x.props.onVnodeMounted;A&&Ms(A,T.parent,x)},o)},a.deactivate=x=>{const b=x.component;Yo(b.m),Yo(b.a),c(x,p,null,1,o),jt(()=>{b.da&&Ai(b.da);const y=x.props&&x.props.onVnodeUnmounted;y&&Ms(y,b.parent,x),b.isDeactivated=!0},o)};function m(x){rc(x),d(x,s,o,!0)}function h(x){n.forEach((b,y)=>{const _=qc(en(b)?b.type.__asyncResolved||{}:b.type);_&&!x(_)&&g(y)})}function g(x){const b=n.get(x);b&&(!l||!oa(b,l))?m(b):l&&rc(l),n.delete(x),i.delete(x)}Gt(()=>[e.include,e.exclude],([x,b])=>{x&&h(y=>vl(x,y)),b&&h(y=>!vl(b,y))},{flush:"post",deep:!0});let R=null;const O=()=>{R!=null&&(Qo(s.subTree.type)?jt(()=>{n.set(R,ko(s.subTree))},s.subTree.suspense):n.set(R,ko(s.subTree)))};return tt(O),Mr(O),Dr(()=>{n.forEach(x=>{const{subTree:b,suspense:y}=s,_=ko(b);if(x.type===_.type&&x.key===_.key){rc(_);const k=_.component.da;k&&jt(k,y);return}m(x)})}),()=>{if(R=null,!t.default)return l=null;const x=t.default(),b=x[0];if(x.length>1)return l=null,x;if(!on(b)||!(b.shapeFlag&4)&&!(b.shapeFlag&128))return l=null,b;let y=ko(b);if(y.type===Ht)return l=null,y;const _=y.type,k=qc(en(y)?y.type.__asyncResolved||{}:_),{include:T,exclude:A,max:w}=e;if(T&&(!k||!vl(T,k))||A&&k&&vl(A,k))return y.shapeFlag&=-257,l=y,b;const I=y.key==null?_:y.key,U=n.get(I);return y.el&&(y=Ea(y),b.shapeFlag&128&&(b.ssContent=y)),R=I,U?(y.el=U.el,y.component=U.component,y.transition&&ln(y,y.transition),y.shapeFlag|=512,i.delete(I),i.add(I)):(i.add(I),w&&i.size>parseInt(w,10)&&g(i.values().next().value)),y.shapeFlag|=256,l=y,Qo(b.type)?b:y}}},ix=nx;function vl(e,t){return Oe(e)?e.some(s=>vl(s,t)):Ke(e)?e.split(",").includes(t):hb(e)?(e.lastIndex=0,e.test(t)):!1}function us(e,t){Dm(e,"a",t)}function Yt(e,t){Dm(e,"da",t)}function Dm(e,t,s=rs){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Nr(t,a,s),s){let n=s.parent;for(;n&&n.parent;)so(n.parent.vnode)&&lx(a,t,s,n),n=n.parent}}function lx(e,t,s,a){const n=Nr(t,e,a,!0);xt(()=>{bd(a[t],n)},s)}function rc(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function ko(e){return e.shapeFlag&128?e.ssContent:e}function Nr(e,t,s=rs,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{an();const o=Ji(s),r=Ws(t,s,e,l);return o(),nn(),r});return a?n.unshift(i):n.push(i),i}}const rn=e=>(t,s=rs)=>{(!Gn||e==="sp")&&Nr(e,(...a)=>t(...a),s)},Pm=rn("bm"),tt=rn("m"),Ld=rn("bu"),Mr=rn("u"),Dr=rn("bum"),xt=rn("um"),$m=rn("sp"),Fm=rn("rtg"),Um=rn("rtc");function Bm(e,t=rs){Nr("ec",e,t)}const Nd="components",ox="directives";function rx(e,t){return Md(Nd,e,!0,t)||e}const zm=Symbol.for("v-ndc");function cx(e){return Ke(e)?Md(Nd,e,!1)||e:e||zm}function dx(e){return Md(ox,e)}function Md(e,t,s=!0,a=!1){const n=cs||rs;if(n){const i=n.type;if(e===Nd){const o=qc(i,!1);if(o&&(o===t||o===_t(t)||o===Yn(_t(t))))return i}const l=Gu(n[e]||i[e],t)||Gu(n.appContext[e],t);return!l&&a?i:l}}function Gu(e,t){return e&&(e[t]||e[_t(t)]||e[Yn(_t(t))])}function ux(e,t,s,a){let n;const i=s&&s[a],l=Oe(e);if(l||Ke(e)){const o=l&&Xa(e);let r=!1,c=!1;o&&(r=!Us(e),c=Ta(e),e=Ar(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?Di(da(e[d])):da(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(ft(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function px(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Oe(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function fx(e,t,s={},a,n){if(cs.ce||cs.parent&&en(cs.parent)&&cs.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Fl(),Xo(es,null,[It("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Fl();const l=i&&Dd(i(s)),o=s.key||l&&l.key,r=Xo(es,{key:(o&&!ys(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Dd(e){return e.some(t=>on(t)?!(t.type===Ht||t.type===es&&!Dd(t.children)):!0)?e:null}function mx(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Ei(a)]=e[a];return s}const $c=e=>e?gh(e)?ao(e):$c(e.parent):null,kl=at(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>$c(e.parent),$root:e=>$c(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Pd(e),$forceUpdate:e=>e.f||(e.f=()=>{Ed(e.update)}),$nextTick:e=>e.n||(e.n=zt.bind(e.proxy)),$watch:e=>$y.bind(e)}),cc=(e,t)=>e!==nt&&!e.__isScriptSetup&&vt(e,t),Fc={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(cc(a,t))return l[t]=1,a[t];if(n!==nt&&vt(n,t))return l[t]=2,n[t];if(vt(i,t))return l[t]=3,i[t];if(s!==nt&&vt(s,t))return l[t]=4,s[t];Uc&&(l[t]=0)}}const c=kl[t];let d,u;if(c)return t==="$attrs"&&vs(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==nt&&vt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,vt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return cc(n,t)?(n[t]=s,!0):a!==nt&&vt(a,t)?(a[t]=s,!0):vt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==nt&&o[0]!=="$"&&vt(e,o)||cc(t,o)||vt(i,o)||vt(a,o)||vt(kl,o)||vt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:vt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},hx=at({},Fc,{get(e,t){if(t!==Symbol.unscopables)return Fc.get(e,t,e)},has(e,t){return t[0]!=="_"&&!wb(t)}});function vx(){return null}function gx(){return null}function bx(e){}function yx(e){}function xx(){return null}function _x(){}function wx(e,t){return null}function kx(){return Hm().slots}function Sx(){return Hm().attrs}function Hm(e){const t=Es();return t.setupContext||(t.setupContext=_h(t))}function Pl(e){return Oe(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Cx(e,t){const s=Pl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Oe(n)||ze(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function Tx(e,t){return!e||!t?e||t:Oe(e)&&Oe(t)?e.concat(t):at({},Pl(e),Pl(t))}function Ex(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Ax(e){const t=Es(),s=Gn;let a=e();Bl(),s&&Li(!1);const n=()=>{Ji(t),s&&Li(!0)},i=()=>{Es()!==t&&t.scope.off(),Bl(),s&&Li(!1)};return yd(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Uc=!0;function Rx(e){const t=Pd(e),s=e.proxy,a=e.ctx;Uc=!1,t.beforeCreate&&Wu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:m,updated:h,activated:g,deactivated:R,beforeDestroy:O,beforeUnmount:x,destroyed:b,unmounted:y,render:_,renderTracked:k,renderTriggered:T,errorCaptured:A,serverPrefetch:w,expose:I,inheritAttrs:U,components:C,directives:F,filters:Z}=t;if(c&&Ix(c,a,null),l)for(const N in l){const D=l[N];ze(D)&&(a[N]=D.bind(s))}if(n){const N=n.call(s,s);ft(N)&&(e.data=Tn(N))}if(Uc=!0,i)for(const N in i){const D=i[N],oe=ze(D)?D.bind(s,s):ze(D.get)?D.get.bind(s,s):ds,de=!ze(D)&&ze(D.set)?D.set.bind(s):ds,B=V({get:oe,set:de});Object.defineProperty(a,N,{enumerable:!0,configurable:!0,get:()=>B.value,set:Y=>B.value=Y})}if(o)for(const N in o)jm(o[N],a,s,N);if(r){const N=ze(r)?r.call(s):r;Reflect.ownKeys(N).forEach(D=>{wl(D,N[D])})}d&&Wu(d,e,"c");function P(N,D){Oe(D)?D.forEach(oe=>N(oe.bind(s))):D&&N(D.bind(s))}if(P(Pm,u),P(tt,p),P(Ld,m),P(Mr,h),P(us,g),P(Yt,R),P(Bm,A),P(Um,k),P(Fm,T),P(Dr,x),P(xt,y),P($m,w),Oe(I))if(I.length){const N=e.exposed||(e.exposed={});I.forEach(D=>{Object.defineProperty(N,D,{get:()=>s[D],set:oe=>s[D]=oe,enumerable:!0})})}else e.exposed||(e.exposed={});_&&e.render===ds&&(e.render=_),U!=null&&(e.inheritAttrs=U),C&&(e.components=C),F&&(e.directives=F),w&&Od(e)}function Ix(e,t,s=ds){Oe(e)&&(e=Bc(e));for(const a in e){const n=e[a];let i;ft(n)?"default"in n?i=aa(n.from||a,n.default,!0):i=aa(n.from||a):i=aa(n),qt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function Wu(e,t,s){Ws(Oe(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function jm(e,t,s,a){let n=a.includes(".")?Am(s,a):()=>s[a];if(Ke(e)){const i=t[e];ze(i)&&Gt(n,i)}else if(ze(e))Gt(n,e.bind(s));else if(ft(e))if(Oe(e))e.forEach(i=>jm(i,t,s,a));else{const i=ze(e.handler)?e.handler.bind(s):t[e.handler];ze(i)&&Gt(n,i,e)}}function Pd(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>Zo(r,c,l,!0)),Zo(r,t,l)),ft(t)&&i.set(t,r),r}function Zo(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&Zo(e,i,s,!0),n&&n.forEach(l=>Zo(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Ox[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Ox={data:Ku,props:Ju,emits:Ju,methods:gl,computed:gl,beforeCreate:ws,created:ws,beforeMount:ws,mounted:ws,beforeUpdate:ws,updated:ws,beforeDestroy:ws,beforeUnmount:ws,destroyed:ws,unmounted:ws,activated:ws,deactivated:ws,errorCaptured:ws,serverPrefetch:ws,components:gl,directives:gl,watch:Nx,provide:Ku,inject:Lx};function Ku(e,t){return t?e?function(){return at(ze(e)?e.call(this,this):e,ze(t)?t.call(this,this):t)}:t:e}function Lx(e,t){return gl(Bc(e),Bc(t))}function Bc(e){if(Oe(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ws(e,t){return e?[...new Set([].concat(e,t))]:t}function gl(e,t){return e?at(Object.create(null),e,t):t}function Ju(e,t){return e?Oe(e)&&Oe(t)?[...new Set([...e,...t])]:at(Object.create(null),Pl(e),Pl(t??{})):t}function Nx(e,t){if(!e)return t;if(!t)return e;const s=at(Object.create(null),e);for(const a in t)s[a]=ws(e[a],t[a]);return s}function Vm(){return{app:null,config:{isNativeTag:wi,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Mx=0;function Dx(e,t){return function(a,n=null){ze(a)||(a=at({},a)),n!=null&&!ft(n)&&(n=null);const i=Vm(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Mx++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:kh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&ze(d.install)?(l.add(d),d.install(c,...u)):ze(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const m=c._ceVNode||It(a,n);return m.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(m,d):e(m,d,p),r=!0,c._container=d,d.__vue_app__=c,ao(m.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Ws(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=zn;zn=c;try{return d()}finally{zn=u}}};return c}}let zn=null;function Px(e,t,s=nt){const a=Es(),n=_t(t),i=$s(t),l=qm(e,n),o=gm((r,c)=>{let d,u=nt,p;return Em(()=>{const m=e[n];Xt(d,m)&&(d=m,c())}),{get(){return r(),s.get?s.get(d):d},set(m){const h=s.set?s.set(m):m;if(!Xt(h,d)&&!(u!==nt&&Xt(m,u)))return;const g=a.vnode.props,R=!!(g&&(t in g||n in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${n}`in g||`onUpdate:${i}`in g));R||(d=m,c()),a.emit(`update:${t}`,h),Xt(m,u)&&(Xt(m,h)&&!Xt(h,p)||R&&u!==nt&&!Xt(h,d))&&c(),u=m,p=h}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||nt:o,done:!1}:{done:!0}}}},o}const qm=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${_t(t)}Modifiers`]||e[`${$s(t)}Modifiers`];function $x(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||nt;let n=s;const i=t.startsWith("update:"),l=i&&qm(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Ke(d)?d.trim():d)),l.number&&(n=s.map(Sr)));let o,r=a[o=Ei(t)]||a[o=Ei(_t(t))];!r&&i&&(r=a[o=Ei($s(t))]),r&&Ws(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Ws(c,e,6,n)}}const Fx=new WeakMap;function Gm(e,t,s=!1){const a=s?Fx:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!ze(e)){const r=c=>{const d=Gm(c,t,!0);d&&(o=!0,at(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(ft(e)&&a.set(e,null),null):(Oe(i)?i.forEach(r=>l[r]=null):at(l,i),ft(e)&&a.set(e,l),l)}function Pr(e,t){return!e||!Jn(t)?!1:(t=t.slice(2).replace(/Once$/,""),vt(e,t[0].toLowerCase()+t.slice(1))||vt(e,$s(t))||vt(e,t))}function Do(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:m,ctx:h,inheritAttrs:g}=e,R=Dl(e);let O,x;try{if(s.shapeFlag&4){const y=n||a,_=y;O=Ps(c.call(_,y,d,u,m,p,h)),x=o}else{const y=t;O=Ps(y.length>1?y(u,{attrs:o,slots:l,emit:r}):y(u,null)),x=t.props?o:Bx(o)}}catch(y){Sl.length=0,Qn(y,e,1),O=It(Ht)}let b=O;if(x&&g!==!1){const y=Object.keys(x),{shapeFlag:_}=b;y.length&&_&7&&(i&&y.some(xr)&&(x=zx(x,i)),b=Ea(b,x,!1,!0))}return s.dirs&&(b=Ea(b,null,!1,!0),b.dirs=b.dirs?b.dirs.concat(s.dirs):s.dirs),s.transition&&ln(b,s.transition),O=b,Dl(R),O}function Ux(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(on(n)){if(n.type!==Ht||n.children==="v-if"){if(s)return;s=n}}else return}return s}const Bx=e=>{let t;for(const s in e)(s==="class"||s==="style"||Jn(s))&&((t||(t={}))[s]=e[s]);return t},zx=(e,t)=>{const s={};for(const a in e)(!xr(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function Hx(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?Zu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Wm(l,a,p)&&!Pr(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?Zu(a,l,c):!0:!!l;return!1}function Zu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(Wm(t,e,i)&&!Pr(s,i))return!0}return!1}function Wm(e,t,s){const a=e[s],n=t[s];return s==="style"&&ft(a)&&ft(n)?!sn(a,n):a!==n}function $r({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const Km={},Jm=()=>Object.create(Km),Zm=e=>Object.getPrototypeOf(e)===Km;function jx(e,t,s,a=!1){const n={},i=Jm();e.propsDefaults=Object.create(null),Ym(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Sd(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function Vx(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=ct(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Pr(e.emitsOptions,p))continue;const m=t[p];if(r)if(vt(i,p))m!==i[p]&&(i[p]=m,c=!0);else{const h=_t(p);n[h]=zc(r,o,h,m,e,!1)}else m!==i[p]&&(i[p]=m,c=!0)}}}else{Ym(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!vt(t,u)&&((d=$s(u))===u||!vt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=zc(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!vt(t,u))&&(delete i[u],c=!0)}c&&Wa(e.attrs,"set","")}function Ym(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Qa(r))continue;const c=t[r];let d;n&&vt(n,d=_t(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Pr(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=ct(s),c=o||nt;for(let d=0;d<i.length;d++){const u=i[d];s[u]=zc(n,r,u,c[u],e,!vt(c,u))}}return l}function zc(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=vt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&ze(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=Ji(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===$s(s))&&(a=!0))}return a}const qx=new WeakMap;function Qm(e,t,s=!1){const a=s?qx:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!ze(e)){const d=u=>{r=!0;const[p,m]=Qm(u,t,!0);at(l,p),m&&o.push(...m)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return ft(e)&&a.set(e,Ci),Ci;if(Oe(i))for(let d=0;d<i.length;d++){const u=_t(i[d]);Yu(u)&&(l[u]=nt)}else if(i)for(const d in i){const u=_t(d);if(Yu(u)){const p=i[d],m=l[u]=Oe(p)||ze(p)?{type:p}:at({},p),h=m.type;let g=!1,R=!0;if(Oe(h))for(let O=0;O<h.length;++O){const x=h[O],b=ze(x)&&x.name;if(b==="Boolean"){g=!0;break}else b==="String"&&(R=!1)}else g=ze(h)&&h.name==="Boolean";m[0]=g,m[1]=R,(g||vt(m,"default"))&&o.push(u)}}const c=[l,o];return ft(e)&&a.set(e,c),c}function Yu(e){return e[0]!=="$"&&!Qa(e)}const $d=e=>e==="_"||e==="_ctx"||e==="$stable",Fd=e=>Oe(e)?e.map(Ps):[Ps(e)],Gx=(e,t,s)=>{if(t._n)return t;const a=Ad((...n)=>Fd(t(...n)),s);return a._c=!1,a},Xm=(e,t,s)=>{const a=e._ctx;for(const n in e){if($d(n))continue;const i=e[n];if(ze(i))t[n]=Gx(n,i,a);else if(i!=null){const l=Fd(i);t[n]=()=>l}}},eh=(e,t)=>{const s=Fd(t);e.slots.default=()=>s},th=(e,t,s)=>{for(const a in t)(s||!$d(a))&&(e[a]=t[a])},Wx=(e,t,s)=>{const a=e.slots=Jm();if(e.vnode.shapeFlag&32){const n=t._;n?(th(a,t,s),s&&Wf(a,"_",n,!0)):Xm(t,a)}else t&&eh(e,t)},Kx=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=nt;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:th(n,t,s):(i=!t.$stable,Xm(t,n)),l=t}else t&&(eh(e,t),l={default:1});if(i)for(const o in n)!$d(o)&&l[o]==null&&delete n[o]},jt=ch;function sh(e){return nh(e)}function ah(e){return nh(e,Wy)}function nh(e,t){const s=Cr();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:m=ds,insertStaticContent:h}=e,g=(E,$,G,ie=null,L=null,Q=null,ue=void 0,H=null,te=!!$.dynamicChildren)=>{if(E===$)return;E&&!oa(E,$)&&(ie=K(E),Y(E,L,Q,!0),E=null),$.patchFlag===-2&&(te=!1,$.dynamicChildren=null);const{type:X,ref:ge,shapeFlag:me}=$;switch(X){case kn:R(E,$,G,ie);break;case Ht:O(E,$,G,ie);break;case Hn:E==null&&x($,G,ie,ue);break;case es:C(E,$,G,ie,L,Q,ue,H,te);break;default:me&1?_(E,$,G,ie,L,Q,ue,H,te):me&6?F(E,$,G,ie,L,Q,ue,H,te):(me&64||me&128)&&X.process(E,$,G,ie,L,Q,ue,H,te,ye)}ge!=null&&L?Ii(ge,E&&E.ref,Q,$||E,!$):ge==null&&E&&E.ref!=null&&Ii(E.ref,null,Q,E,!0)},R=(E,$,G,ie)=>{if(E==null)a($.el=o($.children),G,ie);else{const L=$.el=E.el;$.children!==E.children&&c(L,$.children)}},O=(E,$,G,ie)=>{E==null?a($.el=r($.children||""),G,ie):$.el=E.el},x=(E,$,G,ie)=>{[E.el,E.anchor]=h(E.children,$,G,ie,E.el,E.anchor)},b=({el:E,anchor:$},G,ie)=>{let L;for(;E&&E!==$;)L=p(E),a(E,G,ie),E=L;a($,G,ie)},y=({el:E,anchor:$})=>{let G;for(;E&&E!==$;)G=p(E),n(E),E=G;n($)},_=(E,$,G,ie,L,Q,ue,H,te)=>{if($.type==="svg"?ue="svg":$.type==="math"&&(ue="mathml"),E==null)k($,G,ie,L,Q,ue,H,te);else{const X=E.el&&E.el._isVueCE?E.el:null;try{X&&X._beginPatch(),w(E,$,L,Q,ue,H,te)}finally{X&&X._endPatch()}}},k=(E,$,G,ie,L,Q,ue,H)=>{let te,X;const{props:ge,shapeFlag:me,transition:we,dirs:Ee}=E;if(te=E.el=l(E.type,Q,ge&&ge.is,ge),me&8?d(te,E.children):me&16&&A(E.children,te,null,ie,L,dc(E,Q),ue,H),Ee&&ka(E,null,ie,"created"),T(te,E,E.scopeId,ue,ie),ge){for(const We in ge)We!=="value"&&!Qa(We)&&i(te,We,null,ge[We],Q,ie);"value"in ge&&i(te,"value",null,ge.value,Q),(X=ge.onVnodeBeforeMount)&&Ms(X,ie,E)}Ee&&ka(E,null,ie,"beforeMount");const $e=ih(L,we);$e&&we.beforeEnter(te),a(te,$,G),((X=ge&&ge.onVnodeMounted)||$e||Ee)&&jt(()=>{try{X&&Ms(X,ie,E),$e&&we.enter(te),Ee&&ka(E,null,ie,"mounted")}finally{}},L)},T=(E,$,G,ie,L)=>{if(G&&m(E,G),ie)for(let Q=0;Q<ie.length;Q++)m(E,ie[Q]);if(L){let Q=L.subTree;if($===Q||Qo(Q.type)&&(Q.ssContent===$||Q.ssFallback===$)){const ue=L.vnode;T(E,ue,ue.scopeId,ue.slotScopeIds,L.parent)}}},A=(E,$,G,ie,L,Q,ue,H,te=0)=>{for(let X=te;X<E.length;X++){const ge=E[X]=H?qa(E[X]):Ps(E[X]);g(null,ge,$,G,ie,L,Q,ue,H)}},w=(E,$,G,ie,L,Q,ue)=>{const H=$.el=E.el;let{patchFlag:te,dynamicChildren:X,dirs:ge}=$;te|=E.patchFlag&16;const me=E.props||nt,we=$.props||nt;let Ee;if(G&&On(G,!1),(Ee=we.onVnodeBeforeUpdate)&&Ms(Ee,G,$,E),ge&&ka($,E,G,"beforeUpdate"),G&&On(G,!0),(me.innerHTML&&we.innerHTML==null||me.textContent&&we.textContent==null)&&d(H,""),X?I(E.dynamicChildren,X,H,G,ie,dc($,L),Q):ue||D(E,$,H,null,G,ie,dc($,L),Q,!1),te>0){if(te&16)U(H,me,we,G,L);else if(te&2&&me.class!==we.class&&i(H,"class",null,we.class,L),te&4&&i(H,"style",me.style,we.style,L),te&8){const $e=$.dynamicProps;for(let We=0;We<$e.length;We++){const He=$e[We],Ve=me[He],Ze=we[He];(Ze!==Ve||He==="value")&&i(H,He,Ve,Ze,L,G)}}te&1&&E.children!==$.children&&d(H,$.children)}else!ue&&X==null&&U(H,me,we,G,L);((Ee=we.onVnodeUpdated)||ge)&&jt(()=>{Ee&&Ms(Ee,G,$,E),ge&&ka($,E,G,"updated")},ie)},I=(E,$,G,ie,L,Q,ue)=>{for(let H=0;H<$.length;H++){const te=E[H],X=$[H],ge=te.el&&(te.type===es||!oa(te,X)||te.shapeFlag&198)?u(te.el):G;g(te,X,ge,null,ie,L,Q,ue,!0)}},U=(E,$,G,ie,L)=>{if($!==G){if($!==nt)for(const Q in $)!Qa(Q)&&!(Q in G)&&i(E,Q,$[Q],null,L,ie);for(const Q in G){if(Qa(Q))continue;const ue=G[Q],H=$[Q];ue!==H&&Q!=="value"&&i(E,Q,H,ue,L,ie)}"value"in G&&i(E,"value",$.value,G.value,L)}},C=(E,$,G,ie,L,Q,ue,H,te)=>{const X=$.el=E?E.el:o(""),ge=$.anchor=E?E.anchor:o("");let{patchFlag:me,dynamicChildren:we,slotScopeIds:Ee}=$;Ee&&(H=H?H.concat(Ee):Ee),E==null?(a(X,G,ie),a(ge,G,ie),A($.children||[],G,ge,L,Q,ue,H,te)):me>0&&me&64&&we&&E.dynamicChildren&&E.dynamicChildren.length===we.length?(I(E.dynamicChildren,we,G,L,Q,ue,H),($.key!=null||L&&$===L.subTree)&&Ud(E,$,!0)):D(E,$,G,ge,L,Q,ue,H,te)},F=(E,$,G,ie,L,Q,ue,H,te)=>{$.slotScopeIds=H,E==null?$.shapeFlag&512?L.ctx.activate($,G,ie,ue,te):Z($,G,ie,L,Q,ue,te):W(E,$,te)},Z=(E,$,G,ie,L,Q,ue)=>{const H=E.component=vh(E,ie,L);if(so(E)&&(H.ctx.renderer=ye),bh(H,!1,ue),H.asyncDep){if(L&&L.registerDep(H,P,ue),!E.el){const te=H.subTree=It(Ht);O(null,te,$,G),E.placeholder=te.el}}else P(H,E,$,G,L,Q,ue)},W=(E,$,G)=>{const ie=$.component=E.component;if(Hx(E,$,G))if(ie.asyncDep&&!ie.asyncResolved){N(ie,$,G);return}else ie.next=$,ie.update();else $.el=E.el,ie.vnode=$},P=(E,$,G,ie,L,Q,ue)=>{const H=()=>{if(E.isMounted){let{next:me,bu:we,u:Ee,parent:$e,vnode:We}=E;{const Qe=lh(E);if(Qe){me&&(me.el=We.el,N(E,me,ue)),Qe.asyncDep.then(()=>{jt(()=>{E.isUnmounted||X()},L)});return}}let He=me,Ve;On(E,!1),me?(me.el=We.el,N(E,me,ue)):me=We,we&&Ai(we),(Ve=me.props&&me.props.onVnodeBeforeUpdate)&&Ms(Ve,$e,me,We),On(E,!0);const Ze=Do(E),st=E.subTree;E.subTree=Ze,g(st,Ze,u(st.el),K(st),E,L,Q),me.el=Ze.el,He===null&&$r(E,Ze.el),Ee&&jt(Ee,L),(Ve=me.props&&me.props.onVnodeUpdated)&&jt(()=>Ms(Ve,$e,me,We),L)}else{let me;const{el:we,props:Ee}=$,{bm:$e,m:We,parent:He,root:Ve,type:Ze}=E,st=en($);if(On(E,!1),$e&&Ai($e),!st&&(me=Ee&&Ee.onVnodeBeforeMount)&&Ms(me,He,$),On(E,!0),we&&Fe){const Qe=()=>{E.subTree=Do(E),Fe(we,E.subTree,E,L,null)};st&&Ze.__asyncHydrate?Ze.__asyncHydrate(we,E,Qe):Qe()}else{Ve.ce&&Ve.ce._hasShadowRoot()&&Ve.ce._injectChildStyle(Ze,E.parent?E.parent.type:void 0);const Qe=E.subTree=Do(E);g(null,Qe,G,ie,E,L,Q),$.el=Qe.el}if(We&&jt(We,L),!st&&(me=Ee&&Ee.onVnodeMounted)){const Qe=$;jt(()=>Ms(me,He,Qe),L)}($.shapeFlag&256||He&&en(He.vnode)&&He.vnode.shapeFlag&256)&&E.a&&jt(E.a,L),E.isMounted=!0,$=G=ie=null}};E.scope.on();const te=E.effect=new Il(H);E.scope.off();const X=E.update=te.run.bind(te),ge=E.job=te.runIfDirty.bind(te);ge.i=E,ge.id=E.uid,te.scheduler=()=>Ed(ge),On(E,!0),X()},N=(E,$,G)=>{$.component=E;const ie=E.vnode.props;E.vnode=$,E.next=null,Vx(E,$.props,ie,G),Kx(E,$.children,G),an(),Fu(E),nn()},D=(E,$,G,ie,L,Q,ue,H,te=!1)=>{const X=E&&E.children,ge=E?E.shapeFlag:0,me=$.children,{patchFlag:we,shapeFlag:Ee}=$;if(we>0){if(we&128){de(X,me,G,ie,L,Q,ue,H,te);return}else if(we&256){oe(X,me,G,ie,L,Q,ue,H,te);return}}Ee&8?(ge&16&&fe(X,L,Q),me!==X&&d(G,me)):ge&16?Ee&16?de(X,me,G,ie,L,Q,ue,H,te):fe(X,L,Q,!0):(ge&8&&d(G,""),Ee&16&&A(me,G,ie,L,Q,ue,H,te))},oe=(E,$,G,ie,L,Q,ue,H,te)=>{E=E||Ci,$=$||Ci;const X=E.length,ge=$.length,me=Math.min(X,ge);let we;for(we=0;we<me;we++){const Ee=$[we]=te?qa($[we]):Ps($[we]);g(E[we],Ee,G,null,L,Q,ue,H,te)}X>ge?fe(E,L,Q,!0,!1,me):A($,G,ie,L,Q,ue,H,te,me)},de=(E,$,G,ie,L,Q,ue,H,te)=>{let X=0;const ge=$.length;let me=E.length-1,we=ge-1;for(;X<=me&&X<=we;){const Ee=E[X],$e=$[X]=te?qa($[X]):Ps($[X]);if(oa(Ee,$e))g(Ee,$e,G,null,L,Q,ue,H,te);else break;X++}for(;X<=me&&X<=we;){const Ee=E[me],$e=$[we]=te?qa($[we]):Ps($[we]);if(oa(Ee,$e))g(Ee,$e,G,null,L,Q,ue,H,te);else break;me--,we--}if(X>me){if(X<=we){const Ee=we+1,$e=Ee<ge?$[Ee].el:ie;for(;X<=we;)g(null,$[X]=te?qa($[X]):Ps($[X]),G,$e,L,Q,ue,H,te),X++}}else if(X>we)for(;X<=me;)Y(E[X],L,Q,!0),X++;else{const Ee=X,$e=X,We=new Map;for(X=$e;X<=we;X++){const Re=$[X]=te?qa($[X]):Ps($[X]);Re.key!=null&&We.set(Re.key,X)}let He,Ve=0;const Ze=we-$e+1;let st=!1,Qe=0;const ee=new Array(Ze);for(X=0;X<Ze;X++)ee[X]=0;for(X=Ee;X<=me;X++){const Re=E[X];if(Ve>=Ze){Y(Re,L,Q,!0);continue}let be;if(Re.key!=null)be=We.get(Re.key);else for(He=$e;He<=we;He++)if(ee[He-$e]===0&&oa(Re,$[He])){be=He;break}be===void 0?Y(Re,L,Q,!0):(ee[be-$e]=X+1,be>=Qe?Qe=be:st=!0,g(Re,$[be],G,null,L,Q,ue,H,te),Ve++)}const Se=st?Jx(ee):Ci;for(He=Se.length-1,X=Ze-1;X>=0;X--){const Re=$e+X,be=$[Re],ne=$[Re+1],Le=Re+1<ge?ne.el||oh(ne):ie;ee[X]===0?g(null,be,G,Le,L,Q,ue,H,te):st&&(He<0||X!==Se[He]?B(be,G,Le,2):He--)}}},B=(E,$,G,ie,L=null)=>{const{el:Q,type:ue,transition:H,children:te,shapeFlag:X}=E;if(X&6){B(E.component.subTree,$,G,ie);return}if(X&128){E.suspense.move($,G,ie);return}if(X&64){ue.move(E,$,G,ye);return}if(ue===es){a(Q,$,G);for(let me=0;me<te.length;me++)B(te[me],$,G,ie);a(E.anchor,$,G);return}if(ue===Hn){b(E,$,G);return}if(ie!==2&&X&1&&H)if(ie===0)H.persisted&&!Q[Xs]?a(Q,$,G):(H.beforeEnter(Q),a(Q,$,G),jt(()=>H.enter(Q),L));else{const{leave:me,delayLeave:we,afterLeave:Ee}=H,$e=()=>{E.ctx.isUnmounted?n(Q):a(Q,$,G)},We=()=>{const He=Q._isLeaving||!!Q[Xs];Q._isLeaving&&Q[Xs](!0),H.persisted&&!He?$e():me(Q,()=>{$e(),Ee&&Ee()})};we?we(Q,$e,We):We()}else a(Q,$,G)},Y=(E,$,G,ie=!1,L=!1)=>{const{type:Q,props:ue,ref:H,children:te,dynamicChildren:X,shapeFlag:ge,patchFlag:me,dirs:we,cacheIndex:Ee,memo:$e}=E;if(me===-2&&(L=!1),H!=null&&(an(),Ii(H,null,G,E,!0),nn()),Ee!=null&&($.renderCache[Ee]=void 0),ge&256){$.ctx.deactivate(E);return}const We=ge&1&&we,He=!en(E);let Ve;if(He&&(Ve=ue&&ue.onVnodeBeforeUnmount)&&Ms(Ve,$,E),ge&6)he(E.component,G,ie);else{if(ge&128){E.suspense.unmount(G,ie);return}We&&ka(E,null,$,"beforeUnmount"),ge&64?E.type.remove(E,$,G,ye,ie):X&&!X.hasOnce&&(Q!==es||me>0&&me&64)?fe(X,$,G,!1,!0):(Q===es&&me&384||!L&&ge&16)&&fe(te,$,G),ie&&re(E)}const Ze=$e!=null&&Ee==null;(He&&(Ve=ue&&ue.onVnodeUnmounted)||We||Ze)&&jt(()=>{Ve&&Ms(Ve,$,E),We&&ka(E,null,$,"unmounted"),Ze&&(E.el=null)},G)},re=E=>{const{type:$,el:G,anchor:ie,transition:L}=E;if($===es){J(G,ie);return}if($===Hn){y(E);return}const Q=()=>{n(G),L&&!L.persisted&&L.afterLeave&&L.afterLeave()};if(E.shapeFlag&1&&L&&!L.persisted){const{leave:ue,delayLeave:H}=L,te=()=>ue(G,Q);H?H(E.el,Q,te):te()}else Q()},J=(E,$)=>{let G;for(;E!==$;)G=p(E),n(E),E=G;n($)},he=(E,$,G)=>{const{bum:ie,scope:L,job:Q,subTree:ue,um:H,m:te,a:X}=E;Yo(te),Yo(X),ie&&Ai(ie),L.stop(),Q&&(Q.flags|=8,Y(ue,E,$,G)),H&&jt(H,$),jt(()=>{E.isUnmounted=!0},$)},fe=(E,$,G,ie=!1,L=!1,Q=0)=>{for(let ue=Q;ue<E.length;ue++)Y(E[ue],$,G,ie,L)},K=E=>{if(E.shapeFlag&6)return K(E.component.subTree);if(E.shapeFlag&128)return E.suspense.next();const $=p(E.anchor||E.el),G=$&&$[Rm];return G?p(G):$};let pe=!1;const ve=(E,$,G)=>{let ie;E==null?$._vnode&&(Y($._vnode,null,null,!0),ie=$._vnode.component):g($._vnode||null,E,$,null,null,null,G),$._vnode=E,pe||(pe=!0,Fu(ie),Ko(),pe=!1)},ye={p:g,um:Y,m:B,r:re,mt:Z,mc:A,pc:D,pbc:I,n:K,o:e};let _e,Fe;return t&&([_e,Fe]=t(ye)),{render:ve,hydrate:_e,createApp:Dx(ve,_e)}}function dc({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function On({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function ih(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Ud(e,t,s=!1){const a=e.children,n=t.children;if(Oe(a)&&Oe(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=qa(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Ud(l,o)),o.type===kn&&(o.patchFlag===-1&&(o=n[i]=qa(o)),o.el=l.el),o.type===Ht&&!o.el&&(o.el=l.el)}}function Jx(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function lh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:lh(t)}function Yo(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function oh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?oh(t.subTree):null}const Qo=e=>e.__isSuspense;let Hc=0;const Zx={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)Qx(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Xx(e,t,s,a,n,l,o,r,c)}},hydrate:e0,normalize:t0},Yx=Zx;function $l(e,t){const s=e.props&&e.props[t];ze(s)&&s()}function Qx(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=rh(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?($l(e,"onPending"),$l(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),Oi(p,e.ssFallback)):p.resolve(!1,!0)}function Xx(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,m=t.ssFallback,{activeBranch:h,pendingBranch:g,isInFallback:R,isHydrating:O}=u;if(g)u.pendingBranch=p,oa(g,p)?(r(g,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():R&&(O||(r(h,m,s,a,n,null,i,l,o),Oi(u,m)))):(u.pendingId=Hc++,O?(u.isHydrating=!1,u.activeBranch=g):c(g,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),R?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(h,m,s,a,n,null,i,l,o),Oi(u,m))):h&&oa(h,p)?(r(h,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(h&&oa(h,p))r(h,p,s,a,n,u,i,l,o),Oi(u,p);else if($l(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Hc++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:x,pendingId:b}=u;x>0?setTimeout(()=>{u.pendingId===b&&u.fallback(m)},x):x===0&&u.fallback(m)}}function rh(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:m,n:h,o:{parentNode:g,remove:R}}=c;let O;const x=s0(e);x&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const b=e.props?jo(e.props.timeout):void 0,y=i,_={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:Hc++,timeout:typeof b=="number"?b:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,T=!1){const{vnode:A,activeBranch:w,pendingBranch:I,pendingId:U,effects:C,parentComponent:F,container:Z,isInFallback:W}=_;let P=!1;if(_.isHydrating)_.isHydrating=!1;else if(!k){P=w&&I.transition&&I.transition.mode==="out-in";let oe=!1;P&&(w.transition.afterLeave=()=>{U===_.pendingId&&(p(I,Z,i===y&&!oe?h(w):i,0),Nl(C),W&&A.ssFallback&&(A.ssFallback.el=null))}),w&&!_.isFallbackMountPending&&(g(w.el)===Z&&(i=h(w),oe=!0),m(w,F,_,!0),!P&&W&&A.ssFallback&&jt(()=>A.ssFallback.el=null,_)),P||p(I,Z,i,0)}_.isFallbackMountPending=!1,Oi(_,I),_.pendingBranch=null,_.isInFallback=!1;let N=_.parent,D=!1;for(;N;){if(N.pendingBranch){N.effects.push(...C),D=!0;break}N=N.parent}!D&&!P&&Nl(C),_.effects=[],x&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!T&&t.resolve()),$l(A,"onResolve")},fallback(k){if(!_.pendingBranch)return;const{vnode:T,activeBranch:A,parentComponent:w,container:I,namespace:U}=_;$l(T,"onFallback");const C=h(A),F=()=>{_.isFallbackMountPending=!1,_.isInFallback&&(u(null,k,I,C,w,null,U,o,r),Oi(_,k))},Z=k.transition&&k.transition.mode==="out-in";Z&&(_.isFallbackMountPending=!0,A.transition.afterLeave=F),_.isInFallback=!0,m(A,w,null,!0),Z||F()},move(k,T,A){_.activeBranch&&p(_.activeBranch,k,T,A),_.container=k},next(){return _.activeBranch&&h(_.activeBranch)},registerDep(k,T,A){const w=!!_.pendingBranch;w&&_.deps++;const I=k.vnode.el;k.asyncDep.catch(U=>{Qn(U,k,0)}).then(U=>{if(k.isUnmounted||_.isUnmounted||_.pendingId!==k.suspenseId)return;Bl(),k.asyncResolved=!0;const{vnode:C}=k;jc(k,U,!1),I&&(C.el=I);const F=!I&&k.subTree.el;T(k,C,g(I||k.subTree.el),I?null:h(k.subTree),_,l,A),F&&(C.placeholder=null,R(F)),$r(k,C.el),w&&--_.deps===0&&_.resolve()})},unmount(k,T){_.isUnmounted=!0,_.activeBranch&&m(_.activeBranch,s,k,T),_.pendingBranch&&m(_.pendingBranch,s,k,T)}};return _}function e0(e,t,s,a,n,i,l,o,r){const c=t.suspense=rh(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function t0(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=Qu(a?s.default:s),e.ssFallback=a?Qu(s.fallback):It(Ht)}function Qu(e){let t;if(ze(e)){const s=qn&&e._c;s&&(e._d=!1,Fl()),e=e(),s&&(e._d=!0,t=gs,dh())}return Oe(e)&&(e=Ux(e)),e=Ps(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function ch(e,t){t&&t.pendingBranch?Oe(e)?t.effects.push(...e):t.effects.push(e):Nl(e)}function Oi(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,$r(a,n))}function s0(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const es=Symbol.for("v-fgt"),kn=Symbol.for("v-txt"),Ht=Symbol.for("v-cmt"),Hn=Symbol.for("v-stc"),Sl=[];let gs=null;function Fl(e=!1){Sl.push(gs=e?null:[])}function dh(){Sl.pop(),gs=Sl[Sl.length-1]||null}let qn=1;function Ul(e,t=!1){qn+=e,e<0&&gs&&t&&(gs.hasOnce=!0)}function uh(e){return e.dynamicChildren=qn>0?gs||Ci:null,dh(),qn>0&&gs&&gs.push(e),e}function a0(e,t,s,a,n,i){return uh(Bd(e,t,s,a,n,i,!0))}function Xo(e,t,s,a,n){return uh(It(e,t,s,a,n,!0))}function on(e){return e?e.__v_isVNode===!0:!1}function oa(e,t){return e.type===t.type&&e.key===t.key}function n0(e){}const ph=({key:e})=>e??null,Po=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ke(e)||qt(e)||ze(e)?{i:cs,r:e,k:t,f:!!s}:e:null);function Bd(e,t=null,s=null,a=0,n=null,i=e===es?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&ph(t),ref:t&&Po(t),scopeId:Or,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:cs};return o?(Hd(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Ke(s)?8:16),qn>0&&!l&&gs&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&gs.push(r),r}const It=i0;function i0(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===zm)&&(e=Ht),on(e)){const o=Ea(e,t,!0);return s&&Hd(o,s),qn>0&&!i&&gs&&(o.shapeFlag&6?gs[gs.indexOf(e)]=o:gs.push(o)),o.patchFlag=-2,o}if(p0(e)&&(e=e.__vccOpts),t){t=fh(t);let{class:o,style:r}=t;o&&!Ke(o)&&(t.class=Ql(o)),ft(r)&&(Xl(r)&&!Oe(r)&&(r=at({},r)),t.style=Yl(r))}const l=Ke(e)?1:Qo(e)?128:Im(e)?64:ft(e)?4:ze(e)?2:0;return Bd(e,t,s,a,n,l,i,!0)}function fh(e){return e?Xl(e)||Zm(e)?at({},e):e:null}function Ea(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?hh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&ph(c),ref:t&&t.ref?s&&i?Oe(i)?i.concat(Po(t)):[i,Po(t)]:Po(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==es?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ea(e.ssContent),ssFallback:e.ssFallback&&Ea(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&ln(d,r.clone(d)),d}function zd(e=" ",t=0){return It(kn,null,e,t)}function l0(e,t){const s=It(Hn,null,e);return s.staticCount=t,s}function mh(e="",t=!1){return t?(Fl(),Xo(Ht,null,e)):It(Ht,null,e)}function Ps(e){return e==null||typeof e=="boolean"?It(Ht):Oe(e)?It(es,null,e.slice()):on(e)?qa(e):It(kn,null,String(e))}function qa(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ea(e)}function Hd(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Oe(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),Hd(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!Zm(t)?t._ctx=cs:n===3&&cs&&(cs.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else ze(t)?(t={default:t,_ctx:cs},s=32):(t=String(t),a&64?(s=16,t=[zd(t)]):s=8);e.children=t,e.shapeFlag|=s}function hh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=Ql([t.class,a.class]));else if(n==="style")t.style=Yl([t.style,a.style]);else if(Jn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Oe(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!xr(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function Ms(e,t,s,a=null){Ws(e,t,7,[s,a])}const o0=Vm();let r0=0;function vh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||o0,i={uid:r0++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new xd(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Qm(a,n),emitsOptions:Gm(a,n),emit:null,emitted:null,propsDefaults:nt,inheritAttrs:a.inheritAttrs,ctx:nt,data:nt,props:nt,attrs:nt,slots:nt,refs:nt,setupState:nt,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=$x.bind(null,i),e.ce&&e.ce(i),i}let rs=null;const Es=()=>rs||cs;let er,Li;{const e=Cr(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};er=t("__VUE_INSTANCE_SETTERS__",s=>rs=s),Li=t("__VUE_SSR_SETTERS__",s=>Gn=s)}const Ji=e=>{const t=rs;return er(e),e.scope.on(),()=>{e.scope.off(),er(t)}},Bl=()=>{rs&&rs.scope.off(),er(null)};function gh(e){return e.vnode.shapeFlag&4}let Gn=!1;function bh(e,t=!1,s=!1){t&&Li(t);const{props:a,children:n}=e.vnode,i=gh(e);jx(e,a,i,t),Wx(e,n,s||t);const l=i?c0(e,t):void 0;return t&&Li(!1),l}function c0(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Fc);const{setup:a}=s;if(a){an();const n=e.setupContext=a.length>1?_h(e):null,i=Ji(e),l=Ki(a,e,0,[e.props,n]),o=yd(l);if(nn(),i(),(o||e.sp)&&!en(e)&&Od(e),o){if(l.then(Bl,Bl),t)return l.then(r=>{jc(e,r,t)}).catch(r=>{Qn(r,e,0)});e.asyncDep=l}else jc(e,l,t)}else xh(e,t)}function jc(e,t,s){ze(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ft(t)&&(e.setupState=Td(t)),xh(e,s)}let tr,Vc;function yh(e){tr=e,Vc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,hx))}}const d0=()=>!tr;function xh(e,t,s){const a=e.type;if(!e.render){if(!t&&tr&&!a.render){const n=a.template||Pd(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=at(at({isCustomElement:i,delimiters:o},l),r);a.render=tr(n,c)}}e.render=a.render||ds,Vc&&Vc(e)}{const n=Ji(e);an();try{Rx(e)}finally{nn(),n()}}}const u0={get(e,t){return vs(e,"get",""),e[t]}};function _h(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,u0),slots:e.slots,emit:e.emit,expose:t}}function ao(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Td(hm(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in kl)return kl[s](e)},has(t,s){return s in t||s in kl}})):e.proxy}function qc(e,t=!0){return ze(e)?e.displayName||e.name:e.name||t&&e.__name}function p0(e){return ze(e)&&"__vccOpts"in e}const V=(e,t)=>by(e,t,Gn);function $i(e,t,s){try{Ul(-1);const a=arguments.length;return a===2?ft(t)&&!Oe(t)?on(t)?It(e,null,[t]):It(e,t):It(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&on(s)&&(s=[s]),It(e,t,s))}finally{Ul(1)}}function f0(){}function m0(e,t,s,a){const n=s[a];if(n&&wh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function wh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(Xt(s[a],t[a]))return!1;return qn>0&&gs&&gs.push(e),!0}const kh="3.5.38",h0=ds,v0=Ey,g0=yi,b0=Sm,y0={createComponentInstance:vh,setupComponent:bh,renderComponentRoot:Do,setCurrentRenderingInstance:Dl,isVNode:on,normalizeVNode:Ps,getComponentPublicInstance:ao,ensureValidVNode:Dd,pushWarningContext:ky,popWarningContext:Sy},x0=y0,_0=null,w0=null,k0=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Gc;const Xu=typeof window<"u"&&window.trustedTypes;if(Xu)try{Gc=Xu.createPolicy("vue",{createHTML:e=>e})}catch{}const Sh=Gc?e=>Gc.createHTML(e):e=>e,S0="http://www.w3.org/2000/svg",C0="http://www.w3.org/1998/Math/MathML",Va=typeof document<"u"?document:null,ep=Va&&Va.createElement("template"),Ch={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?Va.createElementNS(S0,e):t==="mathml"?Va.createElementNS(C0,e):s?Va.createElement(e,{is:s}):Va.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>Va.createTextNode(e),createComment:e=>Va.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>Va.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{ep.innerHTML=Sh(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=ep.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},fn="transition",ll="animation",Fi=Symbol("_vtc"),Th={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Eh=at({},Id,Th),T0=e=>(e.displayName="Transition",e.props=Eh,e),E0=T0((e,{slots:t})=>$i(Nm,Ah(e),t)),Ln=(e,t=[])=>{Oe(e)?e.forEach(s=>s(...t)):e&&e(...t)},tp=e=>e?Oe(e)?e.some(t=>t.length>1):e.length>1:!1;function Ah(e){const t={};for(const C in e)C in Th||(t[C]=e[C]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:m=`${s}-leave-to`}=e,h=A0(n),g=h&&h[0],R=h&&h[1],{onBeforeEnter:O,onEnter:x,onEnterCancelled:b,onLeave:y,onLeaveCancelled:_,onBeforeAppear:k=O,onAppear:T=x,onAppearCancelled:A=b}=t,w=(C,F,Z,W)=>{C._enterCancelled=W,gn(C,F?d:o),gn(C,F?c:l),Z&&Z()},I=(C,F)=>{C._isLeaving=!1,gn(C,u),gn(C,m),gn(C,p),F&&F()},U=C=>(F,Z)=>{const W=C?T:x,P=()=>w(F,C,Z);Ln(W,[F,P]),sp(()=>{gn(F,C?r:i),ya(F,C?d:o),tp(W)||ap(F,a,g,P)})};return at(t,{onBeforeEnter(C){Ln(O,[C]),ya(C,i),ya(C,l)},onBeforeAppear(C){Ln(k,[C]),ya(C,r),ya(C,c)},onEnter:U(!1),onAppear:U(!0),onLeave(C,F){C._isLeaving=!0;const Z=()=>I(C,F);ya(C,u),C._enterCancelled?(ya(C,p),Wc(C)):(Wc(C),ya(C,p)),sp(()=>{C._isLeaving&&(gn(C,u),ya(C,m),tp(y)||ap(C,a,R,Z))}),Ln(y,[C,Z])},onEnterCancelled(C){w(C,!1,void 0,!0),Ln(b,[C])},onAppearCancelled(C){w(C,!0,void 0,!0),Ln(A,[C])},onLeaveCancelled(C){I(C),Ln(_,[C])}})}function A0(e){if(e==null)return null;if(ft(e))return[uc(e.enter),uc(e.leave)];{const t=uc(e);return[t,t]}}function uc(e){return jo(e)}function ya(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Fi]||(e[Fi]=new Set)).add(t)}function gn(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[Fi];s&&(s.delete(t),s.size||(e[Fi]=void 0))}function sp(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let R0=0;function ap(e,t,s,a){const n=e._endId=++R0,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Rh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=m=>{m.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Rh(e,t){const s=window.getComputedStyle(e),a=h=>(s[h]||"").split(", "),n=a(`${fn}Delay`),i=a(`${fn}Duration`),l=np(n,i),o=a(`${ll}Delay`),r=a(`${ll}Duration`),c=np(o,r);let d=null,u=0,p=0;t===fn?l>0&&(d=fn,u=l,p=i.length):t===ll?c>0&&(d=ll,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?fn:ll:null,p=d?d===fn?i.length:r.length:0);const m=d===fn&&/\b(?:transform|all)(?:,|$)/.test(a(`${fn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:m}}function np(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>ip(s)+ip(e[a])))}function ip(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Wc(e){return(e?e.ownerDocument:document).body.offsetHeight}function I0(e,t,s){const a=e[Fi];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const sr=Symbol("_vod"),jd=Symbol("_vsh"),Ih={name:"show",beforeMount(e,{value:t},{transition:s}){e[sr]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):ol(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),ol(e,!0),a.enter(e)):a.leave(e,()=>{ol(e,!1)}):ol(e,t))},beforeUnmount(e,{value:t}){ol(e,t)}};function ol(e,t){e.style.display=t?e[sr]:"none",e[jd]=!t}function O0(){Ih.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Oh=Symbol("");function L0(e){const t=Es();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>ar(i,n))},a=()=>{const n=e(t.proxy);t.ce?ar(t.ce,n):Kc(t.subTree,n),s(n)};Ld(()=>{Nl(a)}),tt(()=>{Gt(a,ds,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>n.disconnect())})}function Kc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Kc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)ar(e.el,t);else if(e.type===es)e.children.forEach(s=>Kc(s,t));else if(e.type===Hn){let{el:s,anchor:a}=e;for(;s&&(ar(s,t),s!==a);)s=s.nextSibling}}function ar(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=Fb(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Oh]=a}}const N0=/(?:^|;)\s*display\s*:/;function M0(e,t,s){const a=e.style,n=Ke(s);let i=!1;if(s&&!n){if(t)if(Ke(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&bl(a,o,"")}else for(const l in t)s[l]==null&&bl(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?P0(e,l,!Ke(t)&&t?t[l]:void 0,o)||bl(a,l,o):bl(a,l,"")}}else if(n){if(t!==s){const l=a[Oh];l&&(s+=";"+l),a.cssText=s,i=N0.test(s)}}else t&&e.removeAttribute("style");sr in e&&(e[sr]=i?a.display:"",e[jd]&&(a.display="none"))}const lp=/\s*!important$/;function bl(e,t,s){if(Oe(s))s.forEach(a=>bl(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=D0(e,t);lp.test(s)?e.setProperty($s(a),s.replace(lp,""),"important"):e[a]=s}}const op=["Webkit","Moz","ms"],pc={};function D0(e,t){const s=pc[t];if(s)return s;let a=_t(t);if(a!=="filter"&&a in e)return pc[t]=a;a=Yn(a);for(let n=0;n<op.length;n++){const i=op[n]+a;if(i in e)return pc[t]=i}return t}function P0(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ke(a)&&s===a}const rp="http://www.w3.org/1999/xlink";function cp(e,t,s,a,n,i=Pb(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(rp,t.slice(6,t.length)):e.setAttributeNS(rp,t,s):s==null||i&&!Jf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ys(s)?String(s):s)}function dp(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Sh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Jf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ja(e,t,s,a){e.addEventListener(t,s,a)}function $0(e,t,s,a){e.removeEventListener(t,s,a)}const up=Symbol("_vei");function F0(e,t,s,a,n=null){const i=e[up]||(e[up]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=U0(t);if(a){const c=i[t]=H0(a,n);Ja(e,o,c,r)}else l&&($0(e,o,l,r),i[t]=void 0)}}const pp=/(?:Once|Passive|Capture)$/;function U0(e){let t;if(pp.test(e)){t={};let a;for(;a=e.match(pp);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):$s(e.slice(2)),t]}let fc=0;const B0=Promise.resolve(),z0=()=>fc||(B0.then(()=>fc=0),fc=Date.now());function H0(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Oe(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Ws(c,t,5,o)}}else Ws(n,t,5,[a])};return s.value=e,s.attached=z0(),s}const fp=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Lh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?I0(e,a,l):t==="style"?M0(e,s,a):Jn(t)?xr(t)||F0(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):j0(e,t,a,l))?(dp(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&cp(e,t,a,l,i,t!=="value")):e._isVueCE&&(V0(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ke(a)))?dp(e,_t(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),cp(e,t,a,l))};function j0(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&fp(t)&&ze(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return fp(t)&&Ke(s)?!1:t in e}function V0(e,t){const s=e._def.props;if(!s)return!1;const a=_t(t);return Array.isArray(s)?s.some(n=>_t(n)===a):Object.keys(s).some(n=>_t(n)===a)}const mp={};function Nh(e,t,s){let a=to(e,t);_r(a)&&(a=at({},a,t));class n extends Fr{constructor(l){super(a,l,s)}}return n.def=a,n}const q0=((e,t)=>Nh(e,t,Gh)),G0=typeof HTMLElement<"u"?HTMLElement:class{};class Fr extends G0{constructor(t,s={},a=lr){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==lr?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(at({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Fr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,zt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Oe(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=jo(this._props[r])),(o||(o=Object.create(null)))[_t(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)vt(this,a)||Object.defineProperty(this,a,{get:()=>Ca(s[a])})}_resolveProps(t){const{props:s}=t,a=Oe(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(_t))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):mp;const n=_t(t);s&&this._numberProps&&this._numberProps[n]&&(a=jo(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===mp?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute($s(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute($s(t),s+""):s||this.removeAttribute($s(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),qh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=It(this._def,at(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,_r(l[0])?at({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),$s(i)!==i&&n($s(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Mh(e){const t=Es(),s=t&&t.ce;return s||null}function W0(){const e=Mh();return e&&e.shadowRoot}function K0(e="$style"){{const t=Es();if(!t)return nt;const s=t.type.__cssModules;if(!s)return nt;const a=s[e];return a||nt}}const Dh=new WeakMap,Ph=new WeakMap,nr=Symbol("_moveCb"),hp=Symbol("_enterCb"),J0=e=>(delete e.props.mode,e),Z0=J0({name:"TransitionGroup",props:at({},Eh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Es(),a=Rd();let n,i;return Mr(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!t_(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(Q0),n.forEach(X0);const o=n.filter(e_);Wc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;ya(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[nr]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[nr]=null,gn(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=ct(e),o=Ah(l);let r=l.tag||es;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[jd]&&(n.push(d),ln(d,Pi(d,o,a,s)),Dh.set(d,$h(d.el)))}i=t.default?Lr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&ln(d,Pi(d,o,a,s))}return It(r,null,i)}}}),Y0=Z0;function Q0(e){const t=e.el;t[nr]&&t[nr](),t[hp]&&t[hp]()}function X0(e){Ph.set(e,$h(e.el))}function e_(e){const t=Dh.get(e),s=Ph.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function $h(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function t_(e,t,s){const a=e.cloneNode(),n=e[Fi];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Rh(a);return i.removeChild(a),l}const Cn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Oe(t)?s=>Ai(t,s):t};function s_(e){e.target.composing=!0}function vp(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const na=Symbol("_assign");function gp(e,t,s){return t&&(e=e.trim()),s&&(e=Sr(e)),e}const ir={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[na]=Cn(n);const i=a||n.props&&n.props.type==="number";Ja(e,t?"change":"input",l=>{l.target.composing||e[na](gp(e.value,s,i))}),(s||i)&&Ja(e,"change",()=>{e.value=gp(e.value,s,i)}),t||(Ja(e,"compositionstart",s_),Ja(e,"compositionend",vp),Ja(e,"change",vp))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[na]=Cn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Sr(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},Vd={deep:!0,created(e,t,s){e[na]=Cn(s),Ja(e,"change",()=>{const a=e._modelValue,n=Ui(e),i=e.checked,l=e[na];if(Oe(a)){const o=Tr(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(Zn(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Uh(e,i))})},mounted:bp,beforeUpdate(e,t,s){e[na]=Cn(s),bp(e,t,s)}};function bp(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Oe(t))n=Tr(t,a.props.value)>-1;else if(Zn(t))n=t.has(a.props.value);else{if(t===s)return;n=sn(t,Uh(e,!0))}e.checked!==n&&(e.checked=n)}const qd={created(e,{value:t},s){e.checked=sn(t,s.props.value),e[na]=Cn(s),Ja(e,"change",()=>{e[na](Ui(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[na]=Cn(a),t!==s&&(e.checked=sn(t,a.props.value))}},Fh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=Zn(t);Ja(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Sr(Ui(l)):Ui(l));e[na](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,zt(()=>{e._assigning=!1})}),e[na]=Cn(a)},mounted(e,{value:t}){yp(e,t)},beforeUpdate(e,t,s){e[na]=Cn(s)},updated(e,{value:t}){e._assigning||yp(e,t)}};function yp(e,t){const s=e.multiple,a=Oe(t);if(!(s&&!a&&!Zn(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=Ui(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Tr(t,o)>-1}else l.selected=t.has(o);else if(sn(Ui(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ui(e){return"_value"in e?e._value:e.value}function Uh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Bh={created(e,t,s){So(e,t,s,null,"created")},mounted(e,t,s){So(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){So(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){So(e,t,s,a,"updated")}};function zh(e,t){switch(e){case"SELECT":return Fh;case"TEXTAREA":return ir;default:switch(t){case"checkbox":return Vd;case"radio":return qd;default:return ir}}}function So(e,t,s,a,n){const l=zh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function a_(){ir.getSSRProps=({value:e})=>({value:e}),qd.getSSRProps=({value:e},t)=>{if(t.props&&sn(t.props.value,e))return{checked:!0}},Vd.getSSRProps=({value:e},t)=>{if(Oe(e)){if(t.props&&Tr(e,t.props.value)>-1)return{checked:!0}}else if(Zn(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Bh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=zh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const n_=["ctrl","shift","alt","meta"],i_={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>n_.some(s=>e[`${s}Key`]&&!t.includes(s))},l_=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=i_[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},o_={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},r_=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=$s(n.key);if(t.some(l=>l===i||o_[l]===i))return e(n)}))},Hh=at({patchProp:Lh},Ch);let Cl,xp=!1;function jh(){return Cl||(Cl=sh(Hh))}function Vh(){return Cl=xp?Cl:ah(Hh),xp=!0,Cl}const qh=((...e)=>{jh().render(...e)}),c_=((...e)=>{Vh().hydrate(...e)}),lr=((...e)=>{const t=jh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Kh(a);if(!n)return;const i=t._component;!ze(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,Wh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),Gh=((...e)=>{const t=Vh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Kh(a);if(n)return s(n,!0,Wh(n))},t});function Wh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Kh(e){return Ke(e)?document.querySelector(e):e}let _p=!1;const d_=()=>{_p||(_p=!0,a_(),O0())},u_=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Nm,BaseTransitionPropsValidators:Id,Comment:Ht,DeprecationTypes:k0,EffectScope:xd,ErrorCodes:Ty,ErrorTypeStrings:v0,Fragment:es,KeepAlive:ix,ReactiveEffect:Il,Static:Hn,Suspense:Yx,Teleport:zy,Text:kn,TrackOpTypes:yy,Transition:E0,TransitionGroup:Y0,TriggerOpTypes:xy,VueElement:Fr,assertNumber:Cy,callWithAsyncErrorHandling:Ws,callWithErrorHandling:Ki,camelize:_t,capitalize:Yn,cloneVNode:Ea,compatUtils:w0,computed:V,createApp:lr,createBlock:Xo,createCommentVNode:mh,createElementBlock:a0,createElementVNode:Bd,createHydrationRenderer:ah,createPropsRestProxy:Ex,createRenderer:sh,createSSRApp:Gh,createSlots:px,createStaticVNode:l0,createTextVNode:zd,createVNode:It,customRef:gm,defineAsyncComponent:ax,defineComponent:to,defineCustomElement:Nh,defineEmits:gx,defineExpose:bx,defineModel:_x,defineOptions:yx,defineProps:vx,defineSSRCustomElement:q0,defineSlots:xx,devtools:g0,effect:Hb,effectScope:Ub,getCurrentInstance:Es,getCurrentScope:Xf,getCurrentWatcher:_y,getTransitionRawChildren:Lr,guardReactiveProps:fh,h:$i,handleError:Qn,hasInjectionContext:My,hydrate:c_,hydrateOnIdle:Yy,hydrateOnInteraction:tx,hydrateOnMediaQuery:ex,hydrateOnVisible:Xy,initCustomFormatter:f0,initDirectivesForSSR:d_,inject:aa,isMemoSame:wh,isProxy:Xl,isReactive:Xa,isReadonly:Ta,isRef:qt,isRuntimeOnly:d0,isShallow:Us,isVNode:on,markRaw:hm,mergeDefaults:Cx,mergeModels:Tx,mergeProps:hh,nextTick:zt,nodeOps:Ch,normalizeClass:Ql,normalizeProps:Tb,normalizeStyle:Yl,onActivated:us,onBeforeMount:Pm,onBeforeUnmount:Dr,onBeforeUpdate:Ld,onDeactivated:Yt,onErrorCaptured:Bm,onMounted:tt,onRenderTracked:Um,onRenderTriggered:Fm,onScopeDispose:Bb,onServerPrefetch:$m,onUnmounted:xt,onUpdated:Mr,onWatcherCleanup:ym,openBlock:Fl,patchProp:Lh,popScopeId:Oy,provide:wl,proxyRefs:Td,pushScopeId:Iy,queuePostFlushCb:Nl,reactive:Tn,readonly:qo,ref:f,registerRuntimeCompiler:yh,render:qh,renderList:ux,renderSlot:fx,resolveComponent:rx,resolveDirective:dx,resolveDynamicComponent:cx,resolveFilter:_0,resolveTransitionHooks:Pi,setBlockTracking:Ul,setDevtoolsHook:b0,setTransitionHooks:ln,shallowReactive:Sd,shallowReadonly:oy,shallowRef:Cd,ssrContextKey:Cm,ssrUtils:x0,stop:jb,toDisplayString:Yf,toHandlerKey:Ei,toHandlers:mx,toRaw:ct,toRef:vy,toRefs:fy,toValue:dy,transformVNodeArgs:n0,triggerRef:cy,unref:Ca,useAttrs:Sx,useCssModule:K0,useCssVars:L0,useHost:Mh,useId:jy,useModel:Px,useSSRContext:Tm,useShadowRoot:W0,useSlots:kx,useTemplateRef:Vy,useTransitionState:Rd,vModelCheckbox:Vd,vModelDynamic:Bh,vModelRadio:qd,vModelSelect:Fh,vModelText:ir,vShow:Ih,version:kh,warn:h0,watch:Gt,watchEffect:Dy,watchPostEffect:Py,watchSyncEffect:Em,withAsyncContext:Ax,withCtx:Ad,withDefaults:wx,withDirectives:Ny,withKeys:r_,withMemo:m0,withModifiers:l_,withScopeId:Ly},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zl=Symbol(""),Tl=Symbol(""),Gd=Symbol(""),or=Symbol(""),Jh=Symbol(""),Wn=Symbol(""),Zh=Symbol(""),Yh=Symbol(""),Wd=Symbol(""),Kd=Symbol(""),no=Symbol(""),Jd=Symbol(""),Qh=Symbol(""),Zd=Symbol(""),Yd=Symbol(""),Qd=Symbol(""),Xd=Symbol(""),eu=Symbol(""),tu=Symbol(""),Xh=Symbol(""),ev=Symbol(""),Ur=Symbol(""),rr=Symbol(""),su=Symbol(""),au=Symbol(""),Hl=Symbol(""),io=Symbol(""),nu=Symbol(""),Jc=Symbol(""),p_=Symbol(""),Zc=Symbol(""),cr=Symbol(""),f_=Symbol(""),m_=Symbol(""),iu=Symbol(""),h_=Symbol(""),v_=Symbol(""),lu=Symbol(""),tv=Symbol(""),Bi={[zl]:"Fragment",[Tl]:"Teleport",[Gd]:"Suspense",[or]:"KeepAlive",[Jh]:"BaseTransition",[Wn]:"openBlock",[Zh]:"createBlock",[Yh]:"createElementBlock",[Wd]:"createVNode",[Kd]:"createElementVNode",[no]:"createCommentVNode",[Jd]:"createTextVNode",[Qh]:"createStaticVNode",[Zd]:"resolveComponent",[Yd]:"resolveDynamicComponent",[Qd]:"resolveDirective",[Xd]:"resolveFilter",[eu]:"withDirectives",[tu]:"renderList",[Xh]:"renderSlot",[ev]:"createSlots",[Ur]:"toDisplayString",[rr]:"mergeProps",[su]:"normalizeClass",[au]:"normalizeStyle",[Hl]:"normalizeProps",[io]:"guardReactiveProps",[nu]:"toHandlers",[Jc]:"camelize",[p_]:"capitalize",[Zc]:"toHandlerKey",[cr]:"setBlockTracking",[f_]:"pushScopeId",[m_]:"popScopeId",[iu]:"withCtx",[h_]:"unref",[v_]:"isRef",[lu]:"withMemo",[tv]:"isMemoSame"};function g_(e){Object.getOwnPropertySymbols(e).forEach(t=>{Bi[t]=e[t]})}const Js={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function b_(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Js}}function jl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Js){return e&&(o?(e.helper(Wn),e.helper(ji(e.inSSR,c))):e.helper(Hi(e.inSSR,c)),l&&e.helper(eu)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function jn(e,t=Js){return{type:17,loc:t,elements:e}}function sa(e,t=Js){return{type:15,loc:t,properties:e}}function Vt(e,t){return{type:16,loc:Js,key:Ke(e)?Ye(e,!0):e,value:t}}function Ye(e,t=!1,s=Js,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function ca(e,t=Js){return{type:8,loc:t,children:e}}function Zt(e,t=[],s=Js){return{type:14,loc:s,callee:e,arguments:t}}function zi(e,t=void 0,s=!1,a=!1,n=Js){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function Yc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Js}}function y_(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Js}}function x_(e){return{type:21,body:e,loc:Js}}function Hi(e,t){return e||t?Wd:Kd}function ji(e,t){return e||t?Zh:Yh}function ou(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(Hi(a,e.isComponent)),t(Wn),t(ji(a,e.isComponent)))}const wp=new Uint8Array([123,123]),kp=new Uint8Array([125,125]);function Sp(e){return e>=97&&e<=122||e>=65&&e<=90}function qs(e){return e===32||e===10||e===9||e===12||e===13}function mn(e){return e===47||e===62||qs(e)}function dr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const fs={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class __{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=wp,this.delimiterClose=kp,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=wp,this.delimiterClose=kp}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?mn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||qs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===fs.TitleEnd||this.currentSequence===fs.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===fs.Cdata[this.sequenceIndex]?++this.sequenceIndex===fs.Cdata.length&&(this.state=28,this.currentSequence=fs.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===fs.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Sp(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){mn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(mn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(dr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){qs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Sp(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||qs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):qs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):qs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||mn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||mn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||mn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||mn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||mn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):qs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):qs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){qs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=fs.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===fs.ScriptEnd[3]?this.startSpecial(fs.ScriptEnd,4):t===fs.StyleEnd[3]?this.startSpecial(fs.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===fs.TitleEnd[3]?this.startSpecial(fs.TitleEnd,4):t===fs.TextareaEnd[3]?this.startSpecial(fs.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===fs.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Cp(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Vn(e,t){const s=Cp("MODE",t),a=Cp(e,t);return s===3?a===!0:a!==!1}function Vl(e,t,s,...a){return Vn(e,t)}function ru(e){throw e}function sv(e){}function Rt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Fs=e=>e.type===4&&e.isStatic;function av(e){switch(e){case"Teleport":case"teleport":return Tl;case"Suspense":case"suspense":return Gd;case"KeepAlive":case"keep-alive":return or;case"BaseTransition":case"base-transition":return Jh}}const w_=/^$|^\d|[^\$\w\xA0-\uFFFF]/,cu=e=>!w_.test(e),nv=/[A-Za-z_$\xA0-\uFFFF]/,k_=/[\.\?\w$\xA0-\uFFFF]/,S_=/\s+[.[]\s*|\s*[.[]\s+/g,iv=e=>e.type===4?e.content:e.loc.source,C_=e=>{const t=iv(e).trim().replace(S_,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?nv:k_).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},lv=C_,T_=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,E_=e=>T_.test(iv(e)),A_=E_;function ta(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Ke(t)?n.name===t:t.test(n.name)))return n}}function Br(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&$n(i.arg,t))return i}}function $n(e,t){return!!(e&&Fs(e)&&e.content===t)}function R_(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function mc(e){return e.type===5||e.type===2}function Tp(e){return e.type===7&&e.name==="pre"}function I_(e){return e.type===7&&e.name==="slot"}function ur(e){return e.type===1&&e.tagType===3}function pr(e){return e.type===1&&e.tagType===2}const O_=new Set([Hl,io]);function ov(e,t=[]){if(e&&!Ke(e)&&e.type===14){const s=e.callee;if(!Ke(s)&&O_.has(s))return ov(e.arguments[0],t.concat(e))}return[e,t]}function fr(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Ke(n)&&n.type===14){const o=ov(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Ke(n))a=sa([t]);else if(n.type===14){const o=n.arguments[0];!Ke(o)&&o.type===15?Ep(t,o)||o.properties.unshift(t):n.callee===nu?a=Zt(s.helper(rr),[sa([t]),n]):n.arguments.unshift(sa([t])),!a&&(a=n)}else n.type===15?(Ep(t,n)||n.properties.unshift(t),a=n):(a=Zt(s.helper(rr),[sa([t]),n]),l&&l.callee===io&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Ep(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function ql(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function L_(e){return e.type===14&&e.callee===lu?e.arguments[1].returns:e}const N_=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function rv(e){for(let t=0;t<e.length;t++)if(!qs(e.charCodeAt(t)))return!1;return!0}function du(e){return e.type===2&&rv(e.content)||e.type===12&&du(e.content)}function cv(e){return e.type===3||du(e)}const dv={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:wi,isPreTag:wi,isIgnoreNewlineTag:wi,isCustomElement:wi,onError:ru,onWarn:sv,comments:!1,prefixIdentifiers:!1};let pt=dv,Gl=null,tn="",hs=null,lt=null,Ns="",ja=-1,Mn=-1,uu=0,xn=!1,Qc=null;const At=[],$t=new __(At,{onerr:Ba,ontext(e,t){Co(os(e,t),e,t)},ontextentity(e,t,s){Co(e,t,s)},oninterpolation(e,t){if(xn)return Co(os(e,t),e,t);let s=e+$t.delimiterOpen.length,a=t-$t.delimiterClose.length;for(;qs(tn.charCodeAt(s));)s++;for(;qs(tn.charCodeAt(a-1));)a--;let n=os(s,a);n.includes("&")&&(n=pt.decodeEntities(n,!1)),Xc({type:5,content:Fo(n,!1,Bt(s,a)),loc:Bt(e,t)})},onopentagname(e,t){const s=os(e,t);hs={type:1,tag:s,ns:pt.getNamespace(s,At[0],pt.ns),tagType:0,props:[],children:[],loc:Bt(e-1,t),codegenNode:void 0}},onopentagend(e){Rp(e)},onclosetag(e,t){const s=os(e,t);if(!pt.isVoidTag(s)){let a=!1;for(let n=0;n<At.length;n++)if(At[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&Ba(24,At[0].loc.start.offset);for(let l=0;l<=n;l++){const o=At.shift();$o(o,t,l<n)}break}a||Ba(23,uv(e,60))}},onselfclosingtag(e){const t=hs.tag;hs.isSelfClosing=!0,Rp(e),At[0]&&At[0].tag===t&&$o(At.shift(),e)},onattribname(e,t){lt={type:6,name:os(e,t),nameLoc:Bt(e,t),value:void 0,loc:Bt(e)}},ondirname(e,t){const s=os(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!xn&&a===""&&Ba(26,e),xn||a==="")lt={type:6,name:s,nameLoc:Bt(e,t),value:void 0,loc:Bt(e)};else if(lt={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ye("prop")]:[],loc:Bt(e)},a==="pre"){xn=$t.inVPre=!0,Qc=hs;const n=hs.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=j_(n[i]))}},ondirarg(e,t){if(e===t)return;const s=os(e,t);if(xn&&!Tp(lt))lt.name+=s,Fn(lt.nameLoc,t);else{const a=s[0]!=="[";lt.arg=Fo(a?s:s.slice(1,-1),a,Bt(e,t),a?3:0)}},ondirmodifier(e,t){const s=os(e,t);if(xn&&!Tp(lt))lt.name+="."+s,Fn(lt.nameLoc,t);else if(lt.name==="slot"){const a=lt.arg;a&&(a.content+="."+s,Fn(a.loc,t))}else{const a=Ye(s,!0,Bt(e,t));lt.modifiers.push(a)}},onattribdata(e,t){Ns+=os(e,t),ja<0&&(ja=e),Mn=t},onattribentity(e,t,s){Ns+=e,ja<0&&(ja=t),Mn=s},onattribnameend(e){const t=lt.loc.start.offset,s=os(t,e);lt.type===7&&(lt.rawName=s),hs.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&Ba(2,t)},onattribend(e,t){if(hs&&lt){if(Fn(lt.loc,t),e!==0)if(Ns.includes("&")&&(Ns=pt.decodeEntities(Ns,!0)),lt.type===6)lt.name==="class"&&(Ns=fv(Ns).trim()),e===1&&!Ns&&Ba(13,t),lt.value={type:2,content:Ns,loc:e===1?Bt(ja,Mn):Bt(ja-1,Mn+1)},$t.inSFCRoot&&hs.tag==="template"&&lt.name==="lang"&&Ns&&Ns!=="html"&&$t.enterRCDATA(dr("</template"),0);else{let s=0;lt.exp=Fo(Ns,!1,Bt(ja,Mn),0,s),lt.name==="for"&&(lt.forParseResult=D_(lt.exp));let a=-1;lt.name==="bind"&&(a=lt.modifiers.findIndex(n=>n.content==="sync"))>-1&&Vl("COMPILER_V_BIND_SYNC",pt,lt.loc,lt.arg.loc.source)&&(lt.name="model",lt.modifiers.splice(a,1))}(lt.type!==7||lt.name!=="pre")&&hs.props.push(lt)}Ns="",ja=Mn=-1},oncomment(e,t){pt.comments&&Xc({type:3,content:os(e,t),loc:Bt(e-4,t+3)})},onend(){const e=tn.length;for(let t=0;t<At.length;t++)$o(At[t],e-1),Ba(24,At[t].loc.start.offset)},oncdata(e,t){(At[0]?At[0].ns:pt.ns)!==0?Co(os(e,t),e,t):Ba(1,e-9)},onprocessinginstruction(e){(At[0]?At[0].ns:pt.ns)===0&&Ba(21,e-1)}}),Ap=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,M_=/^\(|\)$/g;function D_(e){const t=e.loc,s=e.content,a=s.match(N_);if(!a)return;const[,n,i]=a,l=(u,p,m=!1)=>{const h=t.start.offset+p,g=h+u.length;return Fo(u,!1,Bt(h,g),0,m?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(M_,"").trim();const c=n.indexOf(r),d=r.match(Ap);if(d){r=r.replace(Ap,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const m=d[2].trim();m&&(o.index=l(m,s.indexOf(m,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function os(e,t){return tn.slice(e,t)}function Rp(e){$t.inSFCRoot&&(hs.innerLoc=Bt(e+1,e+1)),Xc(hs);const{tag:t,ns:s}=hs;s===0&&pt.isPreTag(t)&&uu++,pt.isVoidTag(t)?$o(hs,e):(At.unshift(hs),(s===1||s===2)&&($t.inXML=!0)),hs=null}function Co(e,t,s){{const i=At[0]&&At[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=pt.decodeEntities(e,!1))}const a=At[0]||Gl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,Fn(n.loc,s)):a.children.push({type:2,content:e,loc:Bt(t,s)})}function $o(e,t,s=!1){s?Fn(e.loc,uv(t,60)):Fn(e.loc,P_(t,62)+1),$t.inSFCRoot&&(e.children.length?e.innerLoc.end=at({},e.children[e.children.length-1].loc.end):e.innerLoc.end=at({},e.innerLoc.start),e.innerLoc.source=os(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(xn||(a==="slot"?e.tagType=2:Ip(e)?e.tagType=3:F_(e)&&(e.tagType=1)),$t.inRCDATA||(e.children=pv(i)),n===0&&pt.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&pt.isPreTag(a)&&uu--,Qc===e&&(xn=$t.inVPre=!1,Qc=null),$t.inXML&&(At[0]?At[0].ns:pt.ns)===0&&($t.inXML=!1);{const l=e.props;if(!$t.inSFCRoot&&Vn("COMPILER_NATIVE_TEMPLATE",pt)&&e.tag==="template"&&!Ip(e)){const r=At[0]||Gl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&Vl("COMPILER_INLINE_TEMPLATE",pt,o.loc)&&e.children.length&&(o.value={type:2,content:os(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function P_(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s<tn.length-1;)s++;return s}function uv(e,t){let s=e;for(;tn.charCodeAt(s)!==t&&s>=0;)s--;return s}const $_=new Set(["if","else","else-if","for","slot"]);function Ip({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&$_.has(t[s].name))return!0}return!1}function F_({tag:e,props:t}){if(pt.isCustomElement(e))return!1;if(e==="component"||U_(e.charCodeAt(0))||av(e)||pt.isBuiltInComponent&&pt.isBuiltInComponent(e)||pt.isNativeTag&&!pt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(Vl("COMPILER_IS_ON_ELEMENT",pt,a.loc))return!0}}else if(a.name==="bind"&&$n(a.arg,"is")&&Vl("COMPILER_IS_ON_ELEMENT",pt,a.loc))return!0}return!1}function U_(e){return e>64&&e<91}const B_=/\r\n/g;function pv(e){const t=pt.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(uu)n.content=n.content.replace(B_,`
`);else if(rv(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&z_(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=fv(n.content))}return s?e.filter(Boolean):e}function z_(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function fv(e){let t="",s=!1;for(let a=0;a<e.length;a++)qs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function Xc(e){(At[0]||Gl).children.push(e)}function Bt(e,t){return{start:$t.getPos(e),end:t==null?t:$t.getPos(t),source:t==null?t:os(e,t)}}function H_(e){return Bt(e.start.offset,e.end.offset)}function Fn(e,t){e.end=$t.getPos(t),e.source=os(e.start.offset,t)}function j_(e){const t={type:6,name:e.rawName,nameLoc:Bt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Fo(e,t=!1,s,a=0,n=0){return Ye(e,t,s,a)}function Ba(e,t,s){pt.onError(Rt(e,Bt(t,t)))}function V_(){$t.reset(),hs=null,lt=null,Ns="",ja=-1,Mn=-1,At.length=0}function q_(e,t){if(V_(),tn=e,pt=at({},dv),t){let n;for(n in t)t[n]!=null&&(pt[n]=t[n])}$t.mode=pt.parseMode==="html"?1:pt.parseMode==="sfc"?2:0,$t.inXML=pt.ns===1||pt.ns===2;const s=t&&t.delimiters;s&&($t.delimiterOpen=dr(s[0]),$t.delimiterClose=dr(s[1]));const a=Gl=b_([],e);return $t.parse(tn),a.loc=Bt(0,e.length),a.children=pv(a.children),Gl=null,a}function G_(e,t){Uo(e,void 0,t,!!mv(e))}function mv(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!pr(t[0])?t[0]:null}function Uo(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Gs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const m=u.codegenNode;if(m.type===13){const h=m.patchFlag;if((h===void 0||h===512||h===1)&&vv(u,s)>=2){const g=gv(u);g&&(m.props=s.hoist(g))}m.dynamicProps&&(m.dynamicProps=s.hoist(m.dynamicProps))}}}else if(u.type===12&&(a?0:Gs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Uo(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Uo(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Uo(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Oe(e.codegenNode.children))e.codegenNode.children=r(jn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Oe(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(jn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Oe(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ta(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(jn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Oe(d.children)&&d.children.type===15){const p=d.children.properties.find(m=>m.key===u||m.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Gs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=vv(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Gs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Gs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Wn),t.removeHelper(ji(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(Hi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Gs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Ke(o)||ys(o))continue;const r=Gs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const W_=new Set([su,au,Hl,io]);function hv(e,t){if(e.type===14&&!Ke(e.callee)&&W_.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Gs(s,t);if(s.type===14)return hv(s,t)}return 0}function vv(e,t){let s=3;const a=gv(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Gs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Gs(o,t):o.type===14?c=hv(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function gv(e){const t=e.codegenNode;if(t.type===13)return t.props}function K_(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=ds,isCustomElement:d=ds,expressionPlugins:u=[],scopeId:p=null,slotted:m=!0,ssr:h=!1,inSSR:g=!1,ssrCssVars:R="",bindingMetadata:O=nt,inline:x=!1,isTS:b=!1,onError:y=ru,onWarn:_=sv,compatConfig:k}){const T=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),A={filename:t,selfName:T&&Yn(_t(T[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:m,ssr:h,inSSR:g,ssrCssVars:R,bindingMetadata:O,inline:x,isTS:b,onError:y,onWarn:_,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const I=A.helpers.get(w)||0;return A.helpers.set(w,I+1),w},removeHelper(w){const I=A.helpers.get(w);if(I){const U=I-1;U?A.helpers.set(w,U):A.helpers.delete(w)}},helperString(w){return`_${Bi[A.helper(w)]}`},replaceNode(w){A.parent.children[A.childIndex]=A.currentNode=w},removeNode(w){const I=A.parent.children,U=w?I.indexOf(w):A.currentNode?A.childIndex:-1;!w||w===A.currentNode?(A.currentNode=null,A.onNodeRemoved()):A.childIndex>U&&(A.childIndex--,A.onNodeRemoved()),A.parent.children.splice(U,1)},onNodeRemoved:ds,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){Ke(w)&&(w=Ye(w)),A.hoists.push(w);const I=Ye(`_hoisted_${A.hoists.length}`,!1,w.loc,2);return I.hoisted=w,I},cache(w,I=!1,U=!1){const C=y_(A.cached.length,w,I,U);return A.cached.push(C),C}};return A.filters=new Set,A}function J_(e,t){const s=K_(e,t);zr(e,s),t.hoistStatic&&G_(e,s),t.ssr||Z_(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Z_(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=mv(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&ou(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=jl(t,s(zl),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function Y_(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Ke(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,zr(n,t))}}function zr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Oe(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(no);break;case 5:t.ssr||t.helper(Ur);break;case 9:for(let i=0;i<e.branches.length;i++)zr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Y_(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function bv(e,t){const s=Ke(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(I_))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const Hr="/*@__PURE__*/",yv=e=>`${Bi[e]}: _${Bi[e]}`;function Q_(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const m={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Bi[g]}`},push(g,R=-2,O){m.code+=g},indent(){h(++m.indentLevel)},deindent(g=!1){g?--m.indentLevel:h(--m.indentLevel)},newline(){h(m.indentLevel)}};function h(g){m.push(`
`+"  ".repeat(g),0)}return m}function X_(e,t={}){const s=Q_(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,m=!i&&a!=="module";ew(e,s);const g=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${g}(${O}) {`),l(),m&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(yv).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(hc(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(hc(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),hc(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let x=0;x<e.temps;x++)n(`${x>0?", ":""}_temp${x}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?bs(e.codegenNode,s):n("null"),m&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function ew(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Wd,Kd,no,Jd,Qh].filter(p=>d.includes(p)).map(yv).join(", ");n(`const { ${u} } = _Vue
`,-1)}tw(e.hoists,t),i(),n("return ")}function hc(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?Xd:t==="component"?Zd:Qd);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${ql(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function tw(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),bs(i,t),a())}t.pure=!1}function pu(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),lo(e,t,s),s&&t.deindent(),t.push("]")}function lo(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Ke(o)?n(o,-3):Oe(o)?pu(o,t):bs(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function bs(e,t){if(Ke(e)){t.push(e,-3);return}if(ys(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:bs(e.codegenNode,t);break;case 2:sw(e,t);break;case 4:xv(e,t);break;case 5:aw(e,t);break;case 12:bs(e.codegenNode,t);break;case 8:_v(e,t);break;case 3:iw(e,t);break;case 13:lw(e,t);break;case 14:rw(e,t);break;case 15:cw(e,t);break;case 17:dw(e,t);break;case 18:uw(e,t);break;case 19:pw(e,t);break;case 20:fw(e,t);break;case 21:lo(e.body,t,!0,!1);break}}function sw(e,t){t.push(JSON.stringify(e.content),-3,e)}function xv(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function aw(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Hr),s(`${a(Ur)}(`),bs(e.content,t),s(")")}function _v(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Ke(a)?t.push(a,-3):bs(a,t)}}function nw(e,t){const{push:s}=t;if(e.type===8)s("["),_v(e,t),s("]");else if(e.isStatic){const a=cu(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function iw(e,t){const{push:s,helper:a,pure:n}=t;n&&s(Hr),s(`${a(no)}(${JSON.stringify(e.content)})`,-3,e)}function lw(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:m}=e;let h;r&&(h=String(r)),d&&s(a(eu)+"("),u&&s(`(${a(Wn)}(${p?"true":""}), `),n&&s(Hr);const g=u?ji(t.inSSR,m):Hi(t.inSSR,m);s(a(g)+"(",-2,e),lo(ow([i,l,o,h,c]),t),s(")"),u&&s(")"),d&&(s(", "),bs(d,t),s(")"))}function ow(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function rw(e,t){const{push:s,helper:a,pure:n}=t,i=Ke(e.callee)?e.callee:a(e.callee);n&&s(Hr),s(i+"(",-2,e),lo(e.arguments,t),s(")")}function cw(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];nw(c,t),s(": "),bs(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function dw(e,t){pu(e.elements,t)}function uw(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${Bi[iu]}(`),s("(",-2,e),Oe(i)?lo(i,t):i&&bs(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Oe(l)?pu(l,t):bs(l,t)):o&&bs(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function pw(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!cu(s.content);u&&l("("),xv(s,t),u&&l(")")}else l("("),bs(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),bs(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,bs(n,t),d||t.indentLevel--,i&&r(!0)}function fw(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(cr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),bs(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(cr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const mw=bv(/^(?:if|else|else-if)$/,(e,t,s)=>hw(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Lp(n,r,s);else{const c=vw(a.codegenNode);c.alternate=Lp(n,r+a.branches.length-1,s)}}}));function hw(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(Rt(28,t.loc)),t.exp=Ye("true",!1,n)}if(t.name==="if"){const n=Op(e,t),i={type:9,loc:H_(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&cv(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(Rt(30,e.loc)),s.removeNode();const o=Op(e,t);l.branches.push(o);const r=a&&a(l,o,!1);zr(o,s),r&&r(),s.currentNode=null}else s.onError(Rt(30,e.loc));break}}}function Op(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ta(e,"for")?e.children:[e],userKey:Br(e,"key"),isTemplateIf:s}}function Lp(e,t,s){return e.condition?Yc(e.condition,Np(e,t,s),Zt(s.helper(no),['""',"true"])):Np(e,t,s)}function Np(e,t,s){const{helper:a}=s,n=Vt("key",Ye(`${t}`,!1,Js,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return fr(r,n,s),r}else return jl(s,a(zl),sa([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=L_(r);return c.type===13&&ou(c,s),fr(c,n,s),r}}function vw(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const gw=bv("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return bw(e,t,s,i=>{const l=Zt(a(tu),[i.source]),o=ur(e),r=ta(e,"memo"),c=Br(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ye(c.value.content,!0):void 0:c.exp);const u=d?Vt("key",d):null,p=i.source.type===4&&i.source.constType>0,m=p?64:c?128:256;return i.codegenNode=jl(s,a(zl),void 0,l,m,void 0,void 0,!0,!p,!1,e.loc),()=>{let h;const{children:g}=i,R=g.length!==1||g[0].type!==1,O=pr(e)?e:o&&e.children.length===1&&pr(e.children[0])?e.children[0]:null;if(O?(h=O.codegenNode,o&&u&&fr(h,u,s)):R?h=jl(s,a(zl),u?sa([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(h=g[0].codegenNode,o&&u&&fr(h,u,s),h.isBlock!==!p&&(h.isBlock?(n(Wn),n(ji(s.inSSR,h.isComponent))):n(Hi(s.inSSR,h.isComponent))),h.isBlock=!p,h.isBlock?(a(Wn),a(ji(s.inSSR,h.isComponent))):a(Hi(s.inSSR,h.isComponent))),r){const x=zi(ed(i.parseResult,[Ye("_cached")]));x.body=x_([ca(["const _memo = (",r.exp,")"]),ca(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(tv)}(_cached, _memo)) return _cached`]),ca(["const _item = ",h]),Ye("_item.memo = _memo"),Ye("return _item")]),l.arguments.push(x,Ye("_cache"),Ye(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(zi(ed(i.parseResult),h,!0))}})});function bw(e,t,s,a){if(!t.exp){s.onError(Rt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(Rt(32,t.loc));return}wv(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:ur(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const m=a&&a(p);return()=>{o.vFor--,m&&m()}}function wv(e,t){e.finalized||(e.finalized=!0)}function ed({value:e,key:t,index:s},a=[]){return yw([e,t,s,...a])}function yw(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ye("_".repeat(a+1),!1))}const Mp=Ye("undefined",!1),xw=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ta(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},_w=(e,t,s,a)=>zi(e,s,!1,!0,s.length?s[0].loc:a);function ww(e,t,s=_w){t.helper(iu);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=ta(e,"slot",!0);if(r){const{arg:R,exp:O}=r;R&&!Fs(R)&&(o=!0),i.push(Vt(R||Ye("default",!0),s(O,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let m=0;for(let R=0;R<a.length;R++){const O=a[R];let x;if(!ur(O)||!(x=ta(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(r){t.onError(Rt(37,x.loc));break}c=!0;const{children:b,loc:y}=O,{arg:_=Ye("default",!0),exp:k,loc:T}=x;let A;Fs(_)?A=_?_.content:"default":o=!0;const w=ta(O,"for"),I=s(k,w,b,y);let U,C;if(U=ta(O,"if"))o=!0,l.push(Yc(U.exp,To(_,I,m++),Mp));else if(C=ta(O,/^else(?:-if)?$/,!0)){let F=R,Z;for(;F--&&(Z=a[F],!!cv(Z)););if(Z&&ur(Z)&&ta(Z,/^(?:else-)?if$/)){let W=l[l.length-1];for(;W.alternate.type===19;)W=W.alternate;W.alternate=C.exp?Yc(C.exp,To(_,I,m++),Mp):To(_,I,m++)}else t.onError(Rt(30,C.loc))}else if(w){o=!0;const F=w.forParseResult;F?(wv(F),l.push(Zt(t.helper(tu),[F.source,zi(ed(F),To(_,I),!0)]))):t.onError(Rt(32,w.loc))}else{if(A){if(p.has(A)){t.onError(Rt(38,T));continue}p.add(A),A==="default"&&(d=!0)}i.push(Vt(_,I))}}if(!r){const R=(O,x)=>{const b=s(O,void 0,x,n);return t.compatConfig&&(b.isNonScopedSlot=!0),Vt("default",b)};c?u.length&&!u.every(du)&&(d?t.onError(Rt(39,u[0].loc)):i.push(R(void 0,u))):i.push(R(void 0,a))}const h=o?2:Bo(e.children)?3:1;let g=sa(i.concat(Vt("_",Ye(h+"",!1))),n);return l.length&&(g=Zt(t.helper(ev),[g,jn(l)])),{slots:g,hasDynamicSlots:o}}function To(e,t,s){const a=[Vt("name",e),Vt("fn",t)];return s!=null&&a.push(Vt("key",Ye(String(s),!0))),sa(a)}function Bo(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Bo(s.children))return!0;break;case 9:if(Bo(s.branches))return!0;break;case 10:case 11:if(Bo(s.children))return!0;break}}return!1}const kv=new WeakMap,kw=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?Sw(e,t):`"${a}"`;const o=ft(l)&&l.callee===Yd;let r,c,d=0,u,p,m,h=o||l===Tl||l===Gd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const g=Sv(e,t,void 0,i,o);r=g.props,d=g.patchFlag,p=g.dynamicPropNames;const R=g.directives;m=R&&R.length?jn(R.map(O=>Tw(O,t))):void 0,g.shouldUseBlock&&(h=!0)}if(e.children.length>0)if(l===or&&(h=!0,d|=1024),i&&l!==Tl&&l!==or){const{slots:R,hasDynamicSlots:O}=ww(e,t);c=R,O&&(d|=1024)}else if(e.children.length===1&&l!==Tl){const R=e.children[0],O=R.type,x=O===5||O===8;x&&Gs(R,t)===0&&(d|=1),x||O===2?c=R:c=e.children}else c=e.children;p&&p.length&&(u=Ew(p)),e.codegenNode=jl(t,l,r,c,d===0?void 0:d,u,m,!!h,!1,i,e.loc)};function Sw(e,t,s=!1){let{tag:a}=e;const n=td(a),i=Br(e,"is",!1,!0);if(i)if(n||Vn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ye(i.value.content,!0):(o=i.exp,o||(o=Ye("is",!1,i.arg.loc))),o)return Zt(t.helper(Yd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=av(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(Zd),t.components.add(a),ql(a,"component"))}function Sv(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let m=!1,h=0,g=!1,R=!1,O=!1,x=!1,b=!1,y=!1;const _=[],k=I=>{c.length&&(d.push(sa(Dp(c),o)),c=[]),I&&d.push(I)},T=()=>{t.scopes.vFor>0&&c.push(Vt(Ye("ref_for",!0),Ye("true")))},A=({key:I,value:U})=>{if(Fs(I)){const C=I.content,F=Jn(C);if(F&&(!a||n)&&C.toLowerCase()!=="onclick"&&C!=="onUpdate:modelValue"&&!Qa(C)&&(x=!0),F&&Qa(C)&&(y=!0),F&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&Gs(U,t)>0)return;C==="ref"?g=!0:C==="class"?R=!0:C==="style"?O=!0:C!=="key"&&!_.includes(C)&&_.push(C),a&&(C==="class"||C==="style")&&!_.includes(C)&&_.push(C)}else b=!0};for(let I=0;I<s.length;I++){const U=s[I];if(U.type===6){const{loc:C,name:F,nameLoc:Z,value:W}=U;let P=!0;if(F==="ref"&&(g=!0,T()),F==="is"&&(td(l)||W&&W.content.startsWith("vue:")||Vn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Vt(Ye(F,!0,Z),Ye(W?W.content:"",P,W?W.loc:C)))}else{const{name:C,arg:F,exp:Z,loc:W,modifiers:P}=U,N=C==="bind",D=C==="on";if(C==="slot"){a||t.onError(Rt(40,W));continue}if(C==="once"||C==="memo"||C==="is"||N&&$n(F,"is")&&(td(l)||Vn("COMPILER_IS_ON_ELEMENT",t))||D&&i)continue;if((N&&$n(F,"key")||D&&p&&$n(F,"vue:before-update"))&&(m=!0),N&&$n(F,"ref")&&T(),!F&&(N||D)){if(b=!0,Z)if(N){if(k(),Vn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Z);continue}T(),k(),d.push(Z)}else k({type:14,loc:W,callee:t.helper(nu),arguments:a?[Z]:[Z,"true"]});else t.onError(Rt(N?34:35,W));continue}N&&P.some(de=>de.content==="prop")&&(h|=32);const oe=t.directiveTransforms[C];if(oe){const{props:de,needRuntime:B}=oe(U,e,t);!i&&de.forEach(A),D&&F&&!Fs(F)?k(sa(de,o)):c.push(...de),B&&(u.push(U),ys(B)&&kv.set(U,B))}else gb(C)||(u.push(U),p&&(m=!0))}}let w;if(d.length?(k(),d.length>1?w=Zt(t.helper(rr),d,o):w=d[0]):c.length&&(w=sa(Dp(c),o)),b?h|=16:(R&&!a&&(h|=2),O&&!a&&(h|=4),_.length&&(h|=8),x&&(h|=32)),!m&&(h===0||h===32)&&(g||y||u.length>0)&&(h|=512),!t.inSSR&&w)switch(w.type){case 15:let I=-1,U=-1,C=!1;for(let W=0;W<w.properties.length;W++){const P=w.properties[W].key;Fs(P)?P.content==="class"?I=W:P.content==="style"&&(U=W):P.isHandlerKey||(C=!0)}const F=w.properties[I],Z=w.properties[U];C?w=Zt(t.helper(Hl),[w]):(F&&!Fs(F.value)&&(F.value=Zt(t.helper(su),[F.value])),Z&&(O||Z.value.type===4&&Z.value.content.trim()[0]==="["||Z.value.type===17)&&(Z.value=Zt(t.helper(au),[Z.value])));break;case 14:break;default:w=Zt(t.helper(Hl),[Zt(t.helper(io),[w])]);break}return{props:w,directives:u,patchFlag:h,dynamicPropNames:_,shouldUseBlock:m}}function Dp(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Jn(i))&&Cw(l,n):(t.set(i,n),s.push(n))}return s}function Cw(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=jn([e.value,t.value],e.loc)}function Tw(e,t){const s=[],a=kv.get(e);a?s.push(t.helperString(a)):(t.helper(Qd),t.directives.add(e.name),s.push(ql(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ye("true",!1,n);s.push(sa(e.modifiers.map(l=>Vt(l,i)),n))}return jn(s,e.loc)}function Ew(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function td(e){return e==="component"||e==="Component"}const Aw=(e,t)=>{if(pr(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Rw(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=zi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Zt(t.helper(Xh),l,a)}};function Rw(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=_t(l.name),n.push(l)));else if(l.name==="bind"&&$n(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=_t(l.arg.content);s=l.exp=Ye(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Fs(l.arg)&&(l.arg.content=_t(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Sv(e,t,n,!1,!1);a=i,l.length&&t.onError(Rt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Cv=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(Rt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ei(_t(u)):`on:${u}`;o=Ye(p,!0,l.loc)}else o=ca([`${s.helperString(Zc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Zc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=lv(r),p=!(u||A_(r)),m=r.content.includes(";");(p||c&&u)&&(r=ca([`${p?"$event":"(...args)"} => ${m?"{":"("}`,r,m?"}":")"]))}let d={props:[Vt(o,r||Ye("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Iw=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=_t(i.content):i.content=`${s.helperString(Jc)}(${i.content})`:(i.children.unshift(`${s.helperString(Jc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Pp(i,"."),a.some(o=>o.content==="attr")&&Pp(i,"^")),{props:[Vt(i,l)]}},Pp=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Ow=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(mc(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(mc(r))a||(a=s[i]=ca([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(mc(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Gs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Zt(t.helper(Jd),o)}}}}},$p=new WeakSet,Lw=(e,t)=>{if(e.type===1&&ta(e,"once",!0))return $p.has(e)||t.inVOnce||t.inSSR?void 0:($p.add(e),t.inVOnce=!0,t.helper(cr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Tv=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(Rt(41,e.loc)),rl();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(Rt(44,a.loc)),rl();if(o==="literal-const"||o==="setup-const")return s.onError(Rt(45,a.loc)),rl();if(!l.trim()||!lv(a))return s.onError(Rt(42,a.loc)),rl();const r=n||Ye("modelValue",!0),c=n?Fs(n)?`onUpdate:${_t(n.content)}`:ca(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=ca([`${u} => ((`,a,") = $event)"]);const p=[Vt(r,e.exp),Vt(c,d)];if(e.modifiers.length&&t.tagType===1){const m=e.modifiers.map(g=>g.content).map(g=>(cu(g)?g:JSON.stringify(g))+": true").join(", "),h=n?Fs(n)?`${n.content}Modifiers`:ca([n,' + "Modifiers"']):"modelModifiers";p.push(Vt(h,Ye(`{ ${m} }`,!1,e.loc,2)))}return rl(p)};function rl(e=[]){return{props:e}}const Nw=/[\w).+\-_$\]]/,Mw=(e,t)=>{Vn("COMPILER_FILTERS",t)&&(e.type===5?mr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&mr(s.exp,t)}))};function mr(e,t){if(e.type===4)Fp(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Fp(a,t):a.type===8?mr(e,t):a.type===5&&mr(a.content,t))}}function Fp(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,m,h,g=[];for(m=0;m<s.length;m++)if(p=u,u=s.charCodeAt(m),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(m+1)!==124&&s.charCodeAt(m-1)!==124&&!o&&!r&&!c)h===void 0?(d=m+1,h=s.slice(0,m).trim()):R();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let O=m-1,x;for(;O>=0&&(x=s.charAt(O),x===" ");O--);(!x||!Nw.test(x))&&(l=!0)}}h===void 0?h=s.slice(0,m).trim():d!==0&&R();function R(){g.push(s.slice(d,m).trim()),d=m+1}if(g.length){for(m=0;m<g.length;m++)h=Dw(h,g[m],t);e.content=h,e.ast=void 0}}function Dw(e,t,s){s.helper(Xd);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${ql(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${ql(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Up=new WeakSet,Pw=(e,t)=>{if(e.type===1){const s=ta(e,"memo");return!s||Up.has(e)||t.inSSR?void 0:(Up.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&ou(a,t),e.codegenNode=Zt(t.helper(lu),[s.exp,zi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},$w=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(Rt(53,a.loc)),s.exp=Ye("",!0,a.loc);else{const n=_t(a.content);(nv.test(n[0])||n[0]==="-")&&(s.exp=Ye(n,!1,a.loc))}}}};function Fw(e){return[[$w,Lw,mw,Pw,gw,Mw,Aw,kw,xw,Ow],{on:Cv,bind:Iw,model:Tv}]}function Uw(e,t={}){const s=t.onError||ru,a=t.mode==="module";t.prefixIdentifiers===!0?s(Rt(48)):a&&s(Rt(49));const n=!1;t.cacheHandlers&&s(Rt(50)),t.scopeId&&!a&&s(Rt(51));const i=at({},t,{prefixIdentifiers:n}),l=Ke(e)?q_(e,i):e,[o,r]=Fw();return J_(l,at({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:at({},r,t.directiveTransforms||{})})),X_(l,i)}const Bw=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ev=Symbol(""),Av=Symbol(""),Rv=Symbol(""),Iv=Symbol(""),sd=Symbol(""),Ov=Symbol(""),Lv=Symbol(""),Nv=Symbol(""),Mv=Symbol(""),Dv=Symbol("");g_({[Ev]:"vModelRadio",[Av]:"vModelCheckbox",[Rv]:"vModelText",[Iv]:"vModelSelect",[sd]:"vModelDynamic",[Ov]:"withModifiers",[Lv]:"withKeys",[Nv]:"vShow",[Mv]:"Transition",[Dv]:"TransitionGroup"});let mi;function zw(e,t=!1){return mi||(mi=document.createElement("div")),t?(mi.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,mi.children[0].getAttribute("foo")):(mi.innerHTML=e,mi.textContent)}const Hw={parseMode:"html",isVoidTag:Mb,isNativeTag:e=>Ob(e)||Lb(e)||Nb(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:zw,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Mv;if(e==="TransitionGroup"||e==="transition-group")return Dv},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},jw=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ye("style",!0,t.loc),exp:Vw(t.value.content,t.loc),modifiers:[],loc:t.loc})})},Vw=(e,t)=>{const s=Kf(e);return Ye(JSON.stringify(s),!1,t,3)};function Sn(e,t){return Rt(e,t)}const qw=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(54,n)),t.children.length&&(s.onError(Sn(55,n)),t.children.length=0),{props:[Vt(Ye("innerHTML",!0,n),a||Ye("",!0))]}},Gw=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(56,n)),t.children.length&&(s.onError(Sn(57,n)),t.children.length=0),{props:[Vt(Ye("textContent",!0),a?Gs(a,s)>0?a:Zt(s.helperString(Ur),[a],n):Ye("",!0))]}},Ww=(e,t,s)=>{const a=Tv(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(Sn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Rv,o=!1;if(n==="input"||i){const r=Br(t,"type");if(r){if(r.type===7)l=sd;else if(r.value)switch(r.value.content){case"radio":l=Ev;break;case"checkbox":l=Av;break;case"file":o=!0,s.onError(Sn(60,e.loc));break}}else R_(t)&&(l=sd)}else n==="select"&&(l=Iv);o||(a.needRuntime=s.helper(l))}else s.onError(Sn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},Kw=Ks("passive,once,capture"),Jw=Ks("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),Zw=Ks("left,right"),Pv=Ks("onkeyup,onkeydown,onkeypress"),Yw=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&Vl("COMPILER_V_ON_NATIVE",s)||Kw(r)?l.push(r):Zw(r)?Fs(e)?Pv(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):Jw(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Bp=(e,t)=>Fs(e)&&e.content.toLowerCase()==="onclick"?Ye(t,!0):e.type!==4?ca(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,Qw=(e,t,s)=>Cv(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=Yw(i,n,s,e.loc);if(r.includes("right")&&(i=Bp(i,"onContextmenu")),r.includes("middle")&&(i=Bp(i,"onMouseup")),r.length&&(l=Zt(s.helper(Ov),[l,JSON.stringify(r)])),o.length&&(!Fs(i)||Pv(i.content.toLowerCase()))&&(l=Zt(s.helper(Lv),[l,JSON.stringify(o)])),c.length){const d=c.map(Yn).join("");i=Fs(i)?Ye(`${i.content}${d}`,!0):ca(["(",i,`) + "${d}"`])}return{props:[Vt(i,l)]}}),Xw=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(Sn(62,n)),{props:[],needRuntime:s.helper(Nv)}},ek=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},tk=[jw],sk={cloak:Bw,html:qw,text:Gw,model:Ww,on:Qw,show:Xw};function ak(e,t={}){return Uw(e,at({},Hw,t,{nodeTransforms:[ek,...tk,...t.nodeTransforms||[]],directiveTransforms:at({},sk,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zp=Object.create(null);function nk(e,t){if(!Ke(e))if(e.nodeType)e=e.innerHTML;else return ds;const s=xb(e,t),a=zp[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=at({hoistStatic:!0,onError:void 0,onWarn:ds},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=ak(e,n),l=new Function("Vue",i)(u_);return l._rc=!0,zp[s]=l}yh(nk);const hr=Tn({items:[]});let ik=1;function jr(e,t="info",s=3e3){const a=ik++;return hr.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>fu(a),s),a}function fu(e){const t=hr.items.findIndex(s=>s.id===e);t>=0&&hr.items.splice(t,1)}function Ce(e,t="info",s=3e3){return jr(e,t,s)}Ce.success=(e,t=3e3)=>jr(e,"success",t);Ce.error=(e,t=5e3)=>jr(e,"error",t);Ce.info=(e,t=3e3)=>jr(e,"info",t);Ce.dismiss=fu;const lk={setup(){return{state:hr,dismiss:fu}},template:`
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
  `},Ga=Tn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ni=null;function ts({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return Ni&&Ni(!1),Ga.title=e,Ga.message=t,Ga.confirmLabel=s,Ga.cancelLabel=a,Ga.danger=n,Ga.open=!0,new Promise(i=>{Ni=i})}function Hp(e){Ga.open=!1,Ni&&(Ni(e),Ni=null)}const ok={setup(){function e(t){Ga.open&&t.key==="Escape"&&(t.stopPropagation(),Hp(!1))}return tt(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:Ga,settle:Hp}},template:`
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
 */const xi=typeof document<"u";function $v(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function rk(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&$v(e.default)}const bt=Object.assign;function vc(e,t){const s={};for(const a in t){const n=t[a];s[a]=ua(n)?n.map(e):e(n)}return s}const El=()=>{},ua=Array.isArray;function jp(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Fv=/#/g,ck=/&/g,dk=/\//g,uk=/=/g,pk=/\?/g,Uv=/\+/g,fk=/%5B/g,mk=/%5D/g,Bv=/%5E/g,hk=/%60/g,zv=/%7B/g,vk=/%7C/g,Hv=/%7D/g,gk=/%20/g;function mu(e){return e==null?"":encodeURI(""+e).replace(vk,"|").replace(fk,"[").replace(mk,"]")}function bk(e){return mu(e).replace(zv,"{").replace(Hv,"}").replace(Bv,"^")}function ad(e){return mu(e).replace(Uv,"%2B").replace(gk,"+").replace(Fv,"%23").replace(ck,"%26").replace(hk,"`").replace(zv,"{").replace(Hv,"}").replace(Bv,"^")}function yk(e){return ad(e).replace(uk,"%3D")}function xk(e){return mu(e).replace(Fv,"%23").replace(pk,"%3F")}function _k(e){return xk(e).replace(dk,"%2F")}function Wl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const wk=/\/$/,kk=e=>e.replace(wk,"");function gc(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=Ek(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:Wl(l)}}function Sk(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Vp(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Ck(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&Vi(t.matched[a],s.matched[n])&&jv(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Vi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function jv(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!Tk(e[s],t[s]))return!1;return!0}function Tk(e,t){return ua(e)?qp(e,t):ua(t)?qp(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function qp(e,t){return ua(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function Ek(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let nd=(function(e){return e.pop="pop",e.push="push",e})({}),bc=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function Ak(e){if(!e)if(xi){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),kk(e)}const Rk=/^[^#]+#/;function Ik(e,t){return e.replace(Rk,"#")+t}function Ok(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const Vr=()=>({left:window.scrollX,top:window.scrollY});function Lk(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Ok(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Gp(e,t){return(history.state?history.state.position-t:-1)+e}const id=new Map;function Nk(e,t){id.set(e,t)}function Mk(e){const t=id.get(e);return id.delete(e),t}function Dk(e){return typeof e=="string"||e&&typeof e=="object"}function Vv(e){return typeof e=="string"||typeof e=="symbol"}let Pt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const qv=Symbol("");Pt.MATCHER_NOT_FOUND+"",Pt.NAVIGATION_GUARD_REDIRECT+"",Pt.NAVIGATION_ABORTED+"",Pt.NAVIGATION_CANCELLED+"",Pt.NAVIGATION_DUPLICATED+"";function qi(e,t){return bt(new Error,{type:e,[qv]:!0},t)}function za(e,t){return e instanceof Error&&qv in e&&(t==null||!!(e.type&t))}const Pk=["params","query","hash"];function $k(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of Pk)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Fk(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Uv," "),i=n.indexOf("="),l=Wl(i<0?n:n.slice(0,i)),o=i<0?null:Wl(n.slice(i+1));if(l in t){let r=t[l];ua(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Wp(e){let t="";for(let s in e){const a=e[s];if(s=yk(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(ua(a)?a.map(n=>n&&ad(n)):[a&&ad(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function Uk(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=ua(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const Bk=Symbol(""),Kp=Symbol(""),qr=Symbol(""),hu=Symbol(""),ld=Symbol("");function cl(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function _n(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(qi(Pt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):Dk(p)?r(qi(Pt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function yc(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if($v(r)){const c=(r.__vccOpts||r)[t];c&&i.push(_n(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=rk(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&_n(p,s,a,l,o,n)()}))}}return i}function zk(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>Vi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>Vi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let Hk=()=>location.protocol+"//"+location.host;function Gv(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),Vp(o,"")}return Vp(s,e)+a+n}function jk(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const m=Gv(e,location),h=s.value,g=t.value;let R=0;if(p){if(s.value=m,t.value=p,l&&l===h){l=null;return}R=g?p.position-g.position:0}else a(m);n.forEach(O=>{O(s.value,h,{delta:R,type:nd.pop,direction:R?R>0?bc.forward:bc.back:bc.unknown})})};function r(){l=s.value}function c(p){n.push(p);const m=()=>{const h=n.indexOf(p);h>-1&&n.splice(h,1)};return i.push(m),m}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(bt({},p.state,{scroll:Vr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Jp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?Vr():null}}function Vk(e){const{history:t,location:s}=window,a={value:Gv(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:Hk()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(m){console.error(m),s[d?"replace":"assign"](p)}}function l(r,c){i(r,bt({},t.state,Jp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=bt({},n.value,t.state,{forward:r,scroll:Vr()});i(d.current,d,!0),i(r,bt({},Jp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function qk(e){e=Ak(e);const t=Vk(e),s=jk(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=bt({location:"",base:e,go:a,createHref:Ik.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function Gk(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),qk(e)}let Un=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Kt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Kt||{});const Wk={type:Un.Static,value:""},Kk=/[a-zA-Z0-9_]/;function Jk(e){if(!e)return[[]];if(e==="/")return[[Wk]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(m){throw new Error(`ERR (${s})/"${c}": ${m}`)}let s=Kt.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Kt.Static?i.push({type:Un.Static,value:c}):s===Kt.Param||s===Kt.ParamRegExp||s===Kt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Un.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Kt.ParamRegExp){a=s,s=Kt.EscapeNext;continue}switch(s){case Kt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Kt.Param):p();break;case Kt.EscapeNext:p(),s=a;break;case Kt.Param:r==="("?s=Kt.ParamRegExp:Kk.test(r)?p():(u(),s=Kt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Kt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Kt.ParamRegExpEnd:d+=r;break;case Kt.ParamRegExpEnd:u(),s=Kt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Kt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const Zp="[^/]+?",Zk={sensitive:!1,strict:!1,start:!0,end:!0};var Ss=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Ss||{});const Yk=/[.+*?^${}()[\]/\\]/g;function Qk(e,t){const s=bt({},Zk,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Ss.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let m=Ss.Segment+(s.sensitive?Ss.BonusCaseSensitive:0);if(p.type===Un.Static)u||(n+="/"),n+=p.value.replace(Yk,"\\$&"),m+=Ss.Static;else if(p.type===Un.Param){const{value:h,repeatable:g,optional:R,regexp:O}=p;i.push({name:h,repeatable:g,optional:R});const x=O||Zp;if(x!==Zp){m+=Ss.BonusCustomRegExp;try{`${x}`}catch(y){throw new Error(`Invalid custom RegExp for param "${h}" (${x}): `+y.message)}}let b=g?`((?:${x})(?:/(?:${x}))*)`:`(${x})`;u||(b=R&&c.length<2?`(?:/${b})`:"/"+b),R&&(b+="?"),n+=b,m+=Ss.Dynamic,R&&(m+=Ss.BonusOptional),g&&(m+=Ss.BonusRepeatable),x===".*"&&(m+=Ss.BonusWildcard)}d.push(m)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=Ss.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const m=d[p]||"",h=i[p-1];u[h.name]=m&&h.repeatable?m.split("/"):m}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const m of p)if(m.type===Un.Static)d+=m.value;else if(m.type===Un.Param){const{value:h,repeatable:g,optional:R}=m,O=h in c?c[h]:"";if(ua(O)&&!g)throw new Error(`Provided param "${h}" is an array but it is not repeatable (* or + modifiers)`);const x=ua(O)?O.join("/"):O;if(!x)if(R)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${h}"`);d+=x}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function Xk(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===Ss.Static+Ss.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Ss.Static+Ss.Segment?1:-1:0}function Wv(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=Xk(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(Yp(a))return 1;if(Yp(n))return-1}return n.length-a.length}function Yp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const eS={strict:!1,end:!0,sensitive:!1};function tS(e,t,s){const a=Qk(Jk(e.path),s),n=bt(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function sS(e,t){const s=[],a=new Map;t=jp(eS,t);function n(u){return a.get(u)}function i(u,p,m){const h=!m,g=Xp(u);g.aliasOf=m&&m.record;const R=jp(t,u),O=[g];if("alias"in u){const y=typeof u.alias=="string"?[u.alias]:u.alias;for(const _ of y)O.push(Xp(bt({},g,{components:m?m.record.components:g.components,path:_,aliasOf:m?m.record:g})))}let x,b;for(const y of O){const{path:_}=y;if(p&&_[0]!=="/"){const k=p.record.path,T=k[k.length-1]==="/"?"":"/";y.path=p.record.path+(_&&T+_)}if(x=tS(y,p,R),m?m.alias.push(x):(b=b||x,b!==x&&b.alias.push(x),h&&u.name&&!ef(x)&&l(u.name)),Kv(x)&&r(x),g.children){const k=g.children;for(let T=0;T<k.length;T++)i(k[T],x,m&&m.children[T])}m=m||x}return b?()=>{l(b)}:El}function l(u){if(Vv(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=iS(u,s);s.splice(p,0,u),u.record.name&&!ef(u)&&a.set(u.record.name,u)}function c(u,p){let m,h={},g,R;if("name"in u&&u.name){if(m=a.get(u.name),!m)throw qi(Pt.MATCHER_NOT_FOUND,{location:u});R=m.record.name,h=bt(Qp(p.params,m.keys.filter(b=>!b.optional).concat(m.parent?m.parent.keys.filter(b=>b.optional):[]).map(b=>b.name)),u.params&&Qp(u.params,m.keys.map(b=>b.name))),g=m.stringify(h)}else if(u.path!=null)g=u.path,m=s.find(b=>b.re.test(g)),m&&(h=m.parse(g),R=m.record.name);else{if(m=p.name?a.get(p.name):s.find(b=>b.re.test(p.path)),!m)throw qi(Pt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});R=m.record.name,h=bt({},p.params,u.params),g=m.stringify(h)}const O=[];let x=m;for(;x;)O.unshift(x.record),x=x.parent;return{name:R,path:g,params:h,matched:O,meta:nS(O)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function Qp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function Xp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:aS(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function aS(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function ef(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function nS(e){return e.reduce((t,s)=>bt(t,s.meta),{})}function iS(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;Wv(e,t[i])<0?a=i:s=i+1}const n=lS(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function lS(e){let t=e;for(;t=t.parent;)if(Kv(t)&&Wv(e,t)===0)return t}function Kv({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function tf(e){const t=aa(qr),s=aa(hu),a=V(()=>{const r=Ca(e.to);return t.resolve(r)}),n=V(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Vi.bind(null,d));if(p>-1)return p;const m=sf(r[c-2]);return c>1&&sf(d)===m&&u[u.length-1].path!==m?u.findIndex(Vi.bind(null,r[c-2])):p}),i=V(()=>n.value>-1&&uS(s.params,a.value.params)),l=V(()=>n.value>-1&&n.value===s.matched.length-1&&jv(s.params,a.value.params));function o(r={}){if(dS(r)){const c=t[Ca(e.replace)?"replace":"push"](Ca(e.to)).catch(El);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:V(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function oS(e){return e.length===1?e[0]:e}const rS=to({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:tf,setup(e,{slots:t}){const s=Tn(tf(e)),{options:a}=aa(qr),n=V(()=>({[af(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[af(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&oS(t.default(s));return e.custom?i:$i("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),cS=rS;function dS(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function uS(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!ua(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function sf(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const af=(e,t,s)=>e??t??s,pS=to({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=aa(ld),n=V(()=>e.route||a.value),i=aa(Kp,0),l=V(()=>{let c=Ca(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=V(()=>n.value.matched[l.value]);wl(Kp,V(()=>l.value+1)),wl(Bk,o),wl(ld,n);const r=f();return Gt(()=>[r.value,o.value,e.name],([c,d,u],[p,m,h])=>{d&&(d.instances[u]=c,m&&m!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=m.leaveGuards),d.updateGuards.size||(d.updateGuards=m.updateGuards))),c&&d&&(!m||!Vi(d,m)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return nf(s.default,{Component:p,route:c});const m=u.props[d],h=m?m===!0?c.params:typeof m=="function"?m(c):m:null,R=$i(p,bt({},h,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return nf(s.default,{Component:R,route:c})||R}}});function nf(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const fS=pS;function mS(e){const t=sS(e.routes,e),s=e.parseQuery||Fk,a=e.stringifyQuery||Wp,n=e.history,i=cl(),l=cl(),o=cl(),r=Cd(hn);let c=hn;xi&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=vc.bind(null,K=>""+K),u=vc.bind(null,_k),p=vc.bind(null,Wl);function m(K,pe){let ve,ye;return Vv(K)?(ve=t.getRecordMatcher(K),ye=pe):ye=K,t.addRoute(ye,ve)}function h(K){const pe=t.getRecordMatcher(K);pe&&t.removeRoute(pe)}function g(){return t.getRoutes().map(K=>K.record)}function R(K){return!!t.getRecordMatcher(K)}function O(K,pe){if(pe=bt({},pe||r.value),typeof K=="string"){const $=gc(s,K,pe.path),G=t.resolve({path:$.path},pe),ie=n.createHref($.fullPath);return bt($,G,{params:p(G.params),hash:Wl($.hash),redirectedFrom:void 0,href:ie})}let ve;if(K.path!=null)ve=bt({},K,{path:gc(s,K.path,pe.path).path});else{const $=bt({},K.params);for(const G in $)$[G]==null&&delete $[G];ve=bt({},K,{params:u($)}),pe.params=u(pe.params)}const ye=t.resolve(ve,pe),_e=K.hash||"";ye.params=d(p(ye.params));const Fe=Sk(a,bt({},K,{hash:bk(_e),path:ye.path})),E=n.createHref(Fe);return bt({fullPath:Fe,hash:_e,query:a===Wp?Uk(K.query):K.query||{}},ye,{redirectedFrom:void 0,href:E})}function x(K){return typeof K=="string"?gc(s,K,r.value.path):bt({},K)}function b(K,pe){if(c!==K)return qi(Pt.NAVIGATION_CANCELLED,{from:pe,to:K})}function y(K){return T(K)}function _(K){return y(bt(x(K),{replace:!0}))}function k(K,pe){const ve=K.matched[K.matched.length-1];if(ve&&ve.redirect){const{redirect:ye}=ve;let _e=typeof ye=="function"?ye(K,pe):ye;return typeof _e=="string"&&(_e=_e.includes("?")||_e.includes("#")?_e=x(_e):{path:_e},_e.params={}),bt({query:K.query,hash:K.hash,params:_e.path!=null?{}:K.params},_e)}}function T(K,pe){const ve=c=O(K),ye=r.value,_e=K.state,Fe=K.force,E=K.replace===!0,$=k(ve,ye);if($)return T(bt(x($),{state:typeof $=="object"?bt({},_e,$.state):_e,force:Fe,replace:E}),pe||ve);const G=ve;G.redirectedFrom=pe;let ie;return!Fe&&Ck(a,ye,ve)&&(ie=qi(Pt.NAVIGATION_DUPLICATED,{to:G,from:ye}),B(ye,ye,!0,!1)),(ie?Promise.resolve(ie):I(G,ye)).catch(L=>za(L)?za(L,Pt.NAVIGATION_GUARD_REDIRECT)?L:de(L):D(L,G,ye)).then(L=>{if(L){if(za(L,Pt.NAVIGATION_GUARD_REDIRECT))return T(bt({replace:E},x(L.to),{state:typeof L.to=="object"?bt({},_e,L.to.state):_e,force:Fe}),pe||G)}else L=C(G,ye,!0,E,_e);return U(G,ye,L),L})}function A(K,pe){const ve=b(K,pe);return ve?Promise.reject(ve):Promise.resolve()}function w(K){const pe=J.values().next().value;return pe&&typeof pe.runWithContext=="function"?pe.runWithContext(K):K()}function I(K,pe){let ve;const[ye,_e,Fe]=zk(K,pe);ve=yc(ye.reverse(),"beforeRouteLeave",K,pe);for(const $ of ye)$.leaveGuards.forEach(G=>{ve.push(_n(G,K,pe))});const E=A.bind(null,K,pe);return ve.push(E),fe(ve).then(()=>{ve=[];for(const $ of i.list())ve.push(_n($,K,pe));return ve.push(E),fe(ve)}).then(()=>{ve=yc(_e,"beforeRouteUpdate",K,pe);for(const $ of _e)$.updateGuards.forEach(G=>{ve.push(_n(G,K,pe))});return ve.push(E),fe(ve)}).then(()=>{ve=[];for(const $ of Fe)if($.beforeEnter)if(ua($.beforeEnter))for(const G of $.beforeEnter)ve.push(_n(G,K,pe));else ve.push(_n($.beforeEnter,K,pe));return ve.push(E),fe(ve)}).then(()=>(K.matched.forEach($=>$.enterCallbacks={}),ve=yc(Fe,"beforeRouteEnter",K,pe,w),ve.push(E),fe(ve))).then(()=>{ve=[];for(const $ of l.list())ve.push(_n($,K,pe));return ve.push(E),fe(ve)}).catch($=>za($,Pt.NAVIGATION_CANCELLED)?$:Promise.reject($))}function U(K,pe,ve){o.list().forEach(ye=>w(()=>ye(K,pe,ve)))}function C(K,pe,ve,ye,_e){const Fe=b(K,pe);if(Fe)return Fe;const E=pe===hn,$=xi?history.state:{};ve&&(ye||E?n.replace(K.fullPath,bt({scroll:E&&$&&$.scroll},_e)):n.push(K.fullPath,_e)),r.value=K,B(K,pe,ve,E),de()}let F;function Z(){F||(F=n.listen((K,pe,ve)=>{if(!he.listening)return;const ye=O(K),_e=k(ye,he.currentRoute.value);if(_e){T(bt(_e,{replace:!0,force:!0}),ye).catch(El);return}c=ye;const Fe=r.value;xi&&Nk(Gp(Fe.fullPath,ve.delta),Vr()),I(ye,Fe).catch(E=>za(E,Pt.NAVIGATION_ABORTED|Pt.NAVIGATION_CANCELLED)?E:za(E,Pt.NAVIGATION_GUARD_REDIRECT)?(T(bt(x(E.to),{force:!0}),ye).then($=>{za($,Pt.NAVIGATION_ABORTED|Pt.NAVIGATION_DUPLICATED)&&!ve.delta&&ve.type===nd.pop&&n.go(-1,!1)}).catch(El),Promise.reject()):(ve.delta&&n.go(-ve.delta,!1),D(E,ye,Fe))).then(E=>{E=E||C(ye,Fe,!1),E&&(ve.delta&&!za(E,Pt.NAVIGATION_CANCELLED)?n.go(-ve.delta,!1):ve.type===nd.pop&&za(E,Pt.NAVIGATION_ABORTED|Pt.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),U(ye,Fe,E)}).catch(El)}))}let W=cl(),P=cl(),N;function D(K,pe,ve){de(K);const ye=P.list();return ye.length?ye.forEach(_e=>_e(K,pe,ve)):console.error(K),Promise.reject(K)}function oe(){return N&&r.value!==hn?Promise.resolve():new Promise((K,pe)=>{W.add([K,pe])})}function de(K){return N||(N=!K,Z(),W.list().forEach(([pe,ve])=>K?ve(K):pe()),W.reset()),K}function B(K,pe,ve,ye){const{scrollBehavior:_e}=e;if(!xi||!_e)return Promise.resolve();const Fe=!ve&&Mk(Gp(K.fullPath,0))||(ye||!ve)&&history.state&&history.state.scroll||null;return zt().then(()=>_e(K,pe,Fe)).then(E=>E&&Lk(E)).catch(E=>D(E,K,pe))}const Y=K=>n.go(K);let re;const J=new Set,he={currentRoute:r,listening:!0,addRoute:m,removeRoute:h,clearRoutes:t.clearRoutes,hasRoute:R,getRoutes:g,resolve:O,options:e,push:y,replace:_,go:Y,back:()=>Y(-1),forward:()=>Y(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:P.add,isReady:oe,install(K){K.component("RouterLink",cS),K.component("RouterView",fS),K.config.globalProperties.$router=he,Object.defineProperty(K.config.globalProperties,"$route",{enumerable:!0,get:()=>Ca(r)}),xi&&!re&&r.value===hn&&(re=!0,y(n.location).catch(ye=>{}));const pe={};for(const ye in hn)Object.defineProperty(pe,ye,{get:()=>r.value[ye],enumerable:!0});K.provide(qr,he),K.provide(hu,Sd(pe)),K.provide(ld,r);const ve=K.unmount;J.add(K),K.unmount=function(){J.delete(K),J.size<1&&(c=hn,F&&F(),F=null,r.value=hn,re=!1,N=!1),ve()}}};function fe(K){return K.reduce((pe,ve)=>pe.then(()=>w(ve)),Promise.resolve())}return he}function Jv(){return aa(qr)}function hS(e){return aa(hu)}const Gr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=hS(),s=Jv(),a=V({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Gt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Kl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Aa=e=>Number.isSafeInteger(e)&&e>=0,vS=e=>e===null||typeof e=="string",vr=(e,t)=>Aa(e)&&Aa(t)&&t>=e,vu=e=>Kl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&vS(e.cursor);function gS(e){return!vu(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&Kl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!Aa(e.total_chars)||!Aa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!vr(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&Kl(e.tail)&&typeof e.tail.text=="string"&&vr(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function lf(e){return vu(e)&&e.kind==="process_output"&&Aa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>Aa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&vr(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function bS(e){return vu(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>Aa(e[t]))&&vr(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&Aa(e.tools_omitted)}function od(e){try{return JSON.parse(e)}catch{return}}const rd=e=>JSON.stringify(e,null,2),yS=e=>{const t=od(e);return t===void 0?e:rd(t)},Eo=(e,t,s)=>`[${e}, ${t}) ${s}`;function Zv(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:rd(e)??"";let a=typeof e=="string"?od(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=od(e.slice(d+c.length)),m=e.slice(0,u);lf(p)&&!("text"in p)&&m.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?yS(d):d});if(Kl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||Aa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...Aa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],Kl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(gS(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Eo(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Eo(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(lf(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Eo(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(bS(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Eo(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?rd(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Yv(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const xc=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),xS=e=>e!==null&&typeof e=="object",_S=new Set(["_hmac","_prev_hmac"]),cd=e=>e.replace(/\r\n?/g,`
`);function Jl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(_S.has(n)){s=!0;return}return i});return cd(s?JSON.stringify(a):t)}catch{return cd(t)}}function wS(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&xS(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function kS(e){var m;const t=Zv(typeof e=="string"?cd(e):e,{prettyPrint:!1}),s=t.sections.map(h=>({...h,text:Jl(h.text)})),a=s.map(h=>h.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>xc.inlineChars||o&&n.length>0,c=s.filter(h=>h.text).map(h=>{let g=h.text;try{g=JSON.stringify(JSON.parse(g),null,2)}catch{}return h.label?`${h.label}
${g}`:g}).join(`

`).replace(/\n$/,""),d=Yv(c,xc.previewLines,xc.previewChars),u=t.kind==="audit_preview"?(m=t.metadata)==null?void 0:m.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:wS(t)}}const SS={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=V(()=>kS(e.value)),c=V(()=>{const y=e.rawValue===void 0?e.value:e.rawValue;return typeof y=="string"?y:JSON.stringify(y,null,2)??""}),d=V(()=>a.value?c.value:r.value.formatted),u=V(()=>r.value.promoted&&r.value.preview.folded||o.value),p=V(()=>t.value?!!d.value:r.value.promoted),m=V(()=>p.value?"":r.value.summary);let h;function g(){if(t.value)return;const y=r.value.promoted?i.value:l.value;o.value=!!(y&&(y.scrollHeight>y.clientHeight+1||y.scrollWidth>y.clientWidth+1))}function R(){h==null||h.disconnect();for(const y of[i.value,l.value])y&&(h==null||h.observe(y));g()}function O(){t.value=!t.value,t.value||(a.value=!1)}function x(){a.value=!a.value,t.value=!0,n.value=""}async function b(){const y=e.value;try{await navigator.clipboard.writeText(d.value),y===e.value&&(n.value="Copied")}catch{y===e.value&&(n.value="Copy unavailable — select text manually")}}return Gt([()=>e.value,()=>e.rawValue,()=>e.recordId],(y,_)=>{(e.recordId===null||y[2]!==_[2])&&(t.value=!1,a.value=!1),n.value=""}),Gt([i,l,t,s,r],()=>zt(R),{flush:"post"}),tt(()=>{h=new ResizeObserver(g),R()}),xt(()=>h==null?void 0:h.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:m,toggleExpanded:O,toggleRaw:x,copyOutput:b}},template:`
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
    </section>`},Wr={name:"ToolOutput",components:{CompactOutput:SS},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=V(()=>Zv(e.value)),l=V(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=V(()=>{let u=30,p=6e3;return l.value.map(m=>{const h=Yv(m.text,u,p);return u=Math.max(0,u-h.lines),p=Math.max(0,p-h.chars),{...m,display:t.value?m.text:h.text,folded:h.folded}})}),r=V(()=>o.value.some(u=>u.folded)),c=V(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Gt(()=>e.value,()=>{t.value=!1,n.value=""}),Gt(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},CS={components:{ToolOutput:Wr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var g,R,O,x,b,y,_,k,T,A,w;const m=p.payload||p,h=m.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(h)&&!(m.agent_id||(g=m.metadata)!=null&&g.agent_id))&&!(["loop_tool_start","loop_tool"].includes(h)&&!(m.call_id||(R=m.metadata)!=null&&R.call_id))){if(h==="tool_start"||h==="loop_tool_start"){const I=m.call_id||((O=m.metadata)==null?void 0:O.call_id)||null,U=m.agent_id||((x=m.metadata)==null?void 0:x.agent_id)||"",C={callId:I,agentId:U,agentLabel:m.agent_label||((b=m.metadata)==null?void 0:b.agent_label)||"",toolInput:m.tool_input,id:I?`${U}:${I}`:`${m.action}-${Date.now()}`,tool:m.action,actor:m.actor||"",channel:m.channel_id||"",iteration:m.iteration??((y=m.metadata)==null?void 0:y.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(C);return}if(h==="tool_end"||h==="loop_tool"){const I=m.call_id||((_=m.metadata)==null?void 0:_.call_id)||null,U=m.agent_id||((k=m.metadata)==null?void 0:k.agent_id)||"";let C=-1;if(I&&(C=e.value.findIndex(F=>F.callId===I&&F.agentId===U&&F.status==="running")),C<0&&!I)for(let F=e.value.length-1;F>=0;F--){const Z=e.value[F];if(Z.tool===m.action&&Z.agentId===U&&Z.status==="running"){C=F;break}}if(C>=0){const F=e.value[C];F.status=m.error||(T=m.metadata)!=null&&T.error||["error","failed","cancelled","denied","outcome_unknown"].includes(m.status||((A=m.metadata)==null?void 0:A.status))?"error":"success",F.elapsed=m.execution_time_ms??m.duration_ms??((w=m.metadata)==null?void 0:w.elapsed_ms)??Date.now()-F.startTime,F.result=m.result_summary??m.detail??"",F.fadingOut=!0,setTimeout(()=>{const Z=e.value.indexOf(F);Z>=0&&e.value.splice(Z,1),t.value.unshift(F),t.value.length>a&&t.value.pop()},5e3)}return}if(h==="tool_stream"){const I=m.call_id||m.tool_name||"unknown";if(m.finished){const U={...s.value};delete U[I],s.value=U}else{const C=((s.value[I]||"")+(m.chunk||"")).split(`
`);s.value={...s.value,[I]:C.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(m=>{m.status==="running"&&(m.elapsed=p-m.startTime)})}let o=!1;function r(){o||(o=!0,dt.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,dt.off("events",n),i&&(clearInterval(i),i=null))}tt(r),us(r),Yt(c),xt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function gu(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Xn(e){const t=gu(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function TS(e){const t=gu(e);return t?t.toLocaleTimeString():"—"}function Qv(e){const t=gu(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function ES(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function Gi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function bu(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Xv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function of(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function yu(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function eg(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const tg=Symbol("agent-detail-cancelled"),AS=15e3;function RS(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((m,h)=>{r=m,c=h});function u(m,h){o||(o=!0,l!==null&&n(l),l=null,(m?r:c)(h))}let p;try{p=e(i==null?void 0:i.signal)}catch(m){u(!1,m)}return o||Promise.resolve(p).then(m=>u(!0,m),m=>u(!1,m)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const m=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${m}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,tg),i==null||i.abort()}}}function sg({state:e,requestDetail:t,timeoutMs:s=AS,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:m,coalesce:h}){if(!p)return Promise.resolve();if(h&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const g={agentId:p,cancel:null,promise:null};l=g,m?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const R=RS(O=>t(p,{signal:O}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return g.cancel=R.cancel,g.promise=(async()=>{let O=null,x=null;try{O=await R.promise}catch(b){x=b}O!==tg&&(l!==g||e.detailId!==p||(l=null,!x&&(O===null||typeof O!="object")&&(x=new Error(`${a} response was empty or invalid`)),x?e.detail===null&&(e.detailError=(x==null?void 0:x.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function IS({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const OS={components:{ToolOutput:Wr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=V(()=>e.value.filter(D=>D.status==="running").length),r=V(()=>e.value.filter(D=>D.status==="completed").length),c=V(()=>e.value.filter(D=>["failed","timeout","killed"].includes(D.status)).length),d=V(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=V(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(D=>["failed","timeout","killed"].includes(D.status)):e.value.filter(D=>D.status===i.value));function p(D){const oe=Number(D.max_iterations)||0;return oe<=0?0:Math.min(100,Math.round(D.iteration_count/oe*100))}function m(D){return(Number(D.max_iterations)||0)>0}function h(D,oe){return D?D==="N/A"?"N/A":oe==="current_inheritance"?`inherit (currently ${D})`:D:"unknown"}function g(D){return h(D.display_model,D.display_model_source||D.display_source)}function R(D){return h(D.display_reasoning_effort,D.display_reasoning_effort_source||D.display_source)}function O(D){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[D]||""}const x=f(null),b=f(null),y=f(!1),_=f(null),k=f(""),A=sg({state:{get detail(){return x.value},set detail(D){x.value=D},get detailId(){return b.value},set detailId(D){b.value=D},get detailLoading(){return y.value},set detailLoading(D){y.value=D},get detailError(){return _.value},set detailError(D){_.value=D}},requestDetail:(D,{signal:oe})=>j.get(`/api/agents/${encodeURIComponent(D)}`,{signal:oe})});async function w(D){k.value="",await A.open(D.id)}function I(){A.close(),k.value=""}async function U(){await A.refresh()}async function C(D,oe){try{await navigator.clipboard.writeText(oe||""),k.value=D,setTimeout(()=>{k.value===D&&(k.value="")},1500)}catch{Ce.error("Copy failed")}}async function F(D=!1){D=D===!0,D||(t.value=!0);try{const oe=await j.get("/api/agents");e.value=Array.isArray(oe)?oe:[],s.value=null}catch(oe){D||(s.value=oe.message)}D||(t.value=!1)}async function Z(D){const oe=e.value.find(B=>B.id===D);if(await ts({title:"Kill agent",message:`Kill agent "${(oe==null?void 0:oe.label)||D}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=D;try{await j.del(`/api/agents/${encodeURIComponent(D)}`),Ce.success("Agent killed"),await F()}catch(B){Ce.error(B.message||"Failed to kill agent")}a.value=null}}const W=IS({isEnabled:()=>n.value&&l,refreshList:()=>F(!0),hasOpenDetail:()=>!!b.value,refreshDetail:U});function P(){W.start()}function N(){W.stop()}return Gt(n,()=>W.sync()),tt(()=>{l=!0,F(),P()}),us(()=>{l=!0,F(!0),P()}),Yt(()=>{l=!1,N()}),xt(()=>{l=!1,N(),A.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Xn,formatDuration:Gi,progressPercent:p,hasProgress:m,displayModelText:g,displayEffortText:R,displaySourceLabel:O,detail:x,detailId:b,detailLoading:y,detailError:_,copied:k,openDetail:w,closeDetail:I,copyText:C,fetchAgents:F,killAgent:Z,startAutoRefresh:P,stopAutoRefresh:N}}},LS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),m=f("");let h=!1;const R=sg({state:{get detail(){return c.value},set detail(N){c.value=N},get detailId(){return d.value},set detailId(N){d.value=N},get detailLoading(){return u.value},set detailLoading(N){u.value=N},get detailError(){return p.value},set detailError(N){p.value=N}},detailLabel:"Loop detail",requestDetail:(N,{signal:D})=>j.get(`/api/loops/${encodeURIComponent(N)}?limit=100`,{signal:D})});async function O(N){m.value="",await R.open(N.id)}function x(){R.close(),m.value=""}async function b(N,D){try{await navigator.clipboard.writeText(D||""),m.value=N,setTimeout(()=>{m.value===N&&(m.value="")},1500)}catch{Ce.error("Copy failed")}}const y=V(()=>e.value.reduce((N,D)=>N+(D.iteration_count||0),0)),_=V(()=>e.value.filter(N=>N.status==="running").length);function k(N){return N==="running"?"loop-status-running":N==="error"?"loop-status-error":"loop-status-stopped"}function T(N){return N==="running"?"badge-success":N==="error"?"badge-danger":N==="completed"?"badge-info":"badge-warning"}function A(N){return N==="act"?"badge-warning":N==="silent"?"badge-info":"badge-success"}async function w(N=!1){N=N===!0,N||(t.value=!0);try{const D=await j.get("/api/loops");e.value=Array.isArray(D)?D:[],s.value=null}catch(D){N||(s.value=D.message)}N||(t.value=!1)}async function I(){l.value=null;const N=n.value;if(!N.goal.trim()){l.value="Goal is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}const D={goal:N.goal.trim(),channel_id:N.channel_id.trim(),interval_seconds:N.interval_seconds||60,mode:N.mode,max_iterations:N.max_iterations||50};N.stop_condition.trim()&&(D.stop_condition=N.stop_condition.trim()),i.value=!0;try{const oe=await j.post("/api/loops",D);Ce.success(`Loop started: ${oe.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await w()}catch(oe){l.value=oe.message}i.value=!1}async function U(N){if(await ts({title:"Stop loop",message:`Stop loop ${N}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=N;try{await j.del(`/api/loops/${encodeURIComponent(N)}`),Ce.success("Loop stopped"),await w()}catch(oe){Ce.error(oe.message||"Failed to stop loop")}o.value=null}}async function C(N){r.value=N;try{await j.post(`/api/loops/${encodeURIComponent(N)}/restart`),Ce.success("Loop restarted"),await w()}catch(D){Ce.error(D.message||"Failed to restart loop")}r.value=null}function F(N){h&&N.payload&&(N.payload.loop_id||N.payload.type==="loop")&&(w(!0),d.value&&R.refresh())}let Z=null;function W(){Z!==null&&clearInterval(Z),Z=null}function P(){W(),h&&(Z=setInterval(()=>{w(!0),d.value&&R.refresh()},5e3))}return tt(()=>{h=!0,w(),dt.subscribe("events",F),P()}),us(()=>{h=!0,w(!0),P()}),Yt(()=>{h=!1,W()}),xt(()=>{h=!1,dt.unsubscribe("events",F),W(),R.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:m,totalIterations:y,runningCount:_,statusDotClass:k,statusBadge:T,modeBadge:A,formatAge:Qv,formatDuration:Gi,formatTs:Xn,formatTokens:eg,openDetail:O,closeDetail:x,copyText:b,fetchLoops:w,doCreate:I,doStop:U,doRestart:C}}},NS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=V(()=>e.value.filter(x=>x.status==="running").length),o=V(()=>e.value.filter(x=>x.status!=="running").length);function r(x){return x==="running"?"loop-status-running":x==="failed"||x==="error"?"loop-status-error":"loop-status-stopped"}function c(x){return x==="running"?"badge-success":x==="completed"||x==="exited"?"badge-info":x==="killed"||x==="error"||x==="failed"?"badge-danger":"badge-warning"}async function d(x=!1){x=x===!0,x||(t.value=!0);try{e.value=await j.get("/api/processes"),s.value=null}catch(b){x||(s.value=b.message)}x||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Gt(a,x=>{x?u():p()});async function m(x){if(await ts({title:"Kill process",message:`Kill process ${x}?`,confirmLabel:"Kill",danger:!0})){i.value=x;try{await j.del(`/api/processes/${x}`),Ce.success(`Process ${x} killed`),await d()}catch(y){Ce.error(y.message||"Failed to kill process")}i.value=null}}function h(x){x.payload&&(x.payload.pid||x.payload.type==="process")&&d(!0)}let g=!1;function R(){g||(g=!0,d(),dt.subscribe("events",h),u())}function O(){g&&(g=!1,dt.unsubscribe("events",h),p())}return tt(R),us(R),Yt(O),xt(O),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:Gi,fetchProcesses:d,doKill:m}}},MS=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function rf(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function DS(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function PS(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function $S(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=MS.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),m=new Date(u+864e5).getTimezoneOffset(),h=[];for(const R of new Set([p,m])){const O=new Date(u+R*6e4);DS(O,c)===d&&(h.some(x=>x.getTime()===O.getTime())||h.push(O))}if(h.sort((R,O)=>R.getTime()-O.getTime()),h.length===0)return{state:"nonexistent",typed:t};if(h.length>1)return{state:"ambiguous",typed:t,options:h.map(R=>({instant:R,offset:PS(R),iso:R.toISOString()}))};const g=h[0];return{state:"ok",typed:t,instant:g,iso:g.toISOString()}}const FS=5e3;function zo(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function Ao(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function cf(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:zo(e.data.connection)}function US(e){return e!=="webhook"}function df(e,t){return!US(t)||(e==null?void 0:e.available)===!0}const BS={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(zo(null)),n=V(()=>a.value.available),i=V(()=>Ao(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=V(()=>df(a.value,r.value.action));function p(L){return df(a.value,L)}const m=f(null),h=V(()=>$S(r.value.run_at));Gt(()=>r.value.run_at,()=>{m.value=null});const g=V(()=>{var Q;const L=h.value;return L.state==="ok"?L.instant:L.state==="ambiguous"&&m.value!==null&&((Q=L.options[m.value])==null?void 0:Q.instant)||null}),R=V(()=>{const L=g.value;return L?`${L.toLocaleString()} local — ${L.toISOString()} UTC`:""}),O=f(null),x=f(!1),b=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],y=f(null),_=f(null),k=f(null),T=f(null),A=f(null),w=f(null),I=f([]),U=f(!1),C=f("");let F=0;const Z=V(()=>e.value.filter(L=>L.cron&&!L.one_time).length),W=V(()=>e.value.filter(L=>L.one_time).length),P=V(()=>e.value.filter(L=>L.trigger).length),N=V(()=>e.value.filter(L=>L.paused).length),D=V(()=>e.value.filter(L=>L.consecutive_failures>0).length);function oe(L){if(!L)return"-";const Q=Date.now(),H=(new Date(L).getTime()-Q)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const X=Math.floor(H/3600),ge=Math.floor(H%3600/60);return ge>0?`in ${X}h ${ge}m`:`in ${X}h`}const te=Math.floor(H/86400);return`in ${te} day${te!==1?"s":""}`}function de(L){return L==null?"-":L<1e3?`${L}ms`:L<6e4?`${(L/1e3).toFixed(1)}s`:Gi(L/1e3)}function B(L=r.value.cron){r.value.cron=L,rf(r.value,"cron"),O.value=null}function Y(L=r.value.run_at){r.value.run_at=L,rf(r.value,"run_at"),O.value=null}async function re(){const L=r.value.cron.trim();if(L){x.value=!0;try{O.value=await j.post("/api/schedules/validate-cron",{expression:L})}catch(Q){O.value={valid:!1,error:Q.message}}x.value=!1}}async function J(){t.value=!0,s.value=null;try{e.value=await j.get("/api/schedules")}catch(L){s.value=L.message}t.value=!1}async function he(){try{a.value=zo(await j.get("/api/schedules/status"))}catch(L){a.value=cf(L)||zo(null)}}function fe(L){const Q=cf(L);Q&&(a.value=Q)}async function K(L){if(w.value===L){w.value=null,I.value=[];return}w.value=L,U.value=!0,I.value=[];const Q=++F;try{const ue=await j.get(`/api/schedules/${encodeURIComponent(L)}/history?limit=10`);if(Q!==F||w.value!==L)return;I.value=ue,C.value=""}catch(ue){if(Q!==F||w.value!==L)return;I.value=[],C.value=ue.message||"Failed to load execution history"}Q===F&&(U.value=!1)}async function pe(){if(d.value=null,!p(r.value.action)){d.value=Ao(a.value);return}const L=r.value;if(!L.description.trim()){d.value="Description is required";return}if(L.action!=="webhook"&&!L.channel_id.trim()){d.value="Channel ID is required";return}if(!L.cron.trim()&&!L.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(L.cron.trim()&&L.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Q={description:L.description.trim(),action:L.action,channel_id:L.channel_id.trim()};if(L.cron.trim()&&(Q.cron=L.cron.trim()),L.run_at.trim()){const ue=h.value;if(ue.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){d.value="One-time run time is not a valid date";return}const H=g.value;if(ue.state==="ambiguous"&&m.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!H){d.value="One-time run time could not be resolved";return}Q.run_at=H.toISOString()}if(L.action==="reminder"&&L.message.trim()&&(Q.message=L.message.trim()),L.action==="check"&&(L.tool_name.trim()&&(Q.tool_name=L.tool_name.trim()),L.report_format&&(Q.report_format=L.report_format),L.tool_input_str.trim()))try{Q.tool_input=JSON.parse(L.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if(L.action==="webhook"){if(!L.webhook_url.trim()){d.value="Webhook URL is required";return}const ue={url:L.webhook_url.trim(),method:L.webhook_method};if(L.webhook_headers_str.trim())try{const H=JSON.parse(L.webhook_headers_str.trim());if(!H||Array.isArray(H)||typeof H!="object")throw new Error("not an object");ue.headers=H}catch{d.value="Webhook headers must be a valid JSON object";return}if(L.webhook_body&&(ue.body=L.webhook_body),L.webhook_expected_status_str.trim()){const H=L.webhook_expected_status_str.split(",").map(te=>Number(te.trim()));if(H.some(te=>!Number.isInteger(te)||te<100||te>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}ue.expected_status_codes=H}Q.webhook_config=ue}c.value=!0;try{await j.post("/api/schedules",Q),Ce.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},O.value=null,o.value=!1,await J()}catch(ue){fe(ue),d.value=ue.message}c.value=!1}async function ve(L){if(!p(L.action)){Ce.error(Ao(a.value));return}const Q=L.id;y.value=Q;try{const ue=await j.post(`/api/schedules/${encodeURIComponent(Q)}/run`);if(ue.status==="failure")Ce.error(`Execution failed: ${ue.error||"unknown error"}`);else{const H=ue.warning?`Executed (${ue.warning})`:"Executed successfully";Ce.success(H)}await J()}catch(ue){fe(ue),Ce.error(ue.message||"Failed to trigger")}y.value=null}async function ye(L){if(L.paused&&!p(L.action)){Ce.error(Ao(a.value));return}k.value=L.id;const Q=!L.paused;try{await j.put(`/api/schedules/${encodeURIComponent(L.id)}`,{paused:Q}),Ce.success(Q?"Schedule paused":"Schedule resumed"),await J()}catch(ue){fe(ue),Ce.error(ue.message||"Failed to update schedule")}k.value=null}const _e=new Map;function Fe(L,Q){const ue=_e.get(L.id);ue&&clearTimeout(ue.timer);const H={run:()=>E(L,Q),timer:null};H.timer=setTimeout(()=>{_e.delete(L.id),H.run()},500),_e.set(L.id,H)}async function E(L,Q){A.value=L.id;try{await j.put(`/api/schedules/${encodeURIComponent(L.id)}`,{report_format:Q}),Ce.success(Q?"Structured report enabled":"Plain-text report enabled")}catch(ue){Ce.error(`Update failed: ${ue.message}`)}finally{await J(),A.value=null}}function $(){for(const[L,Q]of[..._e])clearTimeout(Q.timer),_e.delete(L),Q.run()}async function G(L){T.value=L;try{await j.post(`/api/schedules/${encodeURIComponent(L)}/reset-failures`),Ce.success("Failure counters reset"),await J()}catch(Q){Ce.error(Q.message||"Failed to reset")}T.value=null}async function ie(L){const Q=e.value.find(H=>H.id===L);if(await ts({title:"Delete schedule",message:`Delete "${(Q==null?void 0:Q.description)||L}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){_.value=L;try{await j.del(`/api/schedules/${encodeURIComponent(L)}`),Ce.success("Schedule deleted"),await J()}catch(H){Ce.error(H.message||"Failed to delete schedule")}_.value=null}}return tt(()=>{J(),he(),l=setInterval(he,FS)}),xt(()=>{$(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:R,runAtAnalysis:h,runAtOccurrence:m,cronResult:O,validatingCron:x,cronPresets:b,runningId:y,deletingId:_,togglingId:k,resettingId:T,reportUpdatingId:A,flushReportFormatTimers:$,expandedId:w,history:I,historyLoading:U,historyError:C,cronCount:Z,oneTimeCount:W,webhookCount:P,pausedCount:N,failingCount:D,formatTs:Xn,formatAge:Qv,formatFuture:oe,formatMs:de,formatDuration:Gi,onCronInput:B,onRunAtInput:Y,validateCron:re,toggleExpand:K,fetchSchedules:J,fetchSchedulingAvailability:he,doCreate:pe,doRunNow:ve,doTogglePause:ye,doUpdateReportFormat:Fe,doResetFailures:G,doDelete:ie}}},ag=[{id:"live",label:"Live",component:CS},{id:"agents",label:"Agents",component:OS},{id:"loops",label:"Loops",component:LS},{id:"processes",label:"Processes",component:NS},{id:"schedules",label:"Schedules",component:BS}],zS={components:{TabbedPage:Gr},setup(){return{tabs:ag}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},HS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(h){if(!h)return"";if(typeof h=="string")return h;try{return JSON.stringify(h,null,2)}catch{return String(h)}}function l(h){a.value=a.value===h?null:h}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},m()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await j.get("/api/audit/verify")}catch(h){h.status===409&&h.data&&typeof h.data=="object"?d.value=h.data.availability==="not_enabled"?{...h.data,not_enabled:!0}:h.data:(d.value=null,u.value=h.message||"verification request failed")}c.value=!1}async function m(){const h=++r;t.value=!0,s.value=null,a.value=null;try{const g=new URLSearchParams;n.value.tool&&g.set("tool",n.value.tool),n.value.user&&g.set("user",n.value.user),n.value.keyword&&g.set("q",n.value.keyword),n.value.date&&g.set("date",n.value.date),g.set("limit",String(n.value.limit));const R=g.toString(),O=await j.get(`/api/audit${R?"?"+R:""}`);if(h!==r)return;e.value=Array.isArray(O)?O:[]}catch(g){if(h!==r)return;s.value=g.message}h===r&&(t.value=!1)}return tt(()=>{m()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:Xn,formatDetail:i,truncateBlock:Xv,toggleExpand:l,clearFilters:o,fetchAudit:m,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},uf=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],jS=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],VS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),m=f("last_active"),h=f(!1),g=uf,R=jS,O=f([]),x=f(!1),b=f(""),y=f("flat"),_=f(new Set),k=f(""),T=f(""),A=f(""),w=f(null),I=f(!1),U=f(""),C=f(!1);let F=0;Gt([k,T,A],()=>{F++,I.value=!1,U.value="",C.value=w.value!==null},{flush:"sync"});function Z(){try{const ne=localStorage.getItem("odin-session-presets");ne&&(O.value=JSON.parse(ne))}catch{}}function W(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const P=V(()=>p.value.trim()!==""||u.value!=="all"),N=V(()=>{let ne=[...e.value];const Le=uf.find(Xe=>Xe.id===u.value),Me=Le?Le.filters:{};if(Me.source&&(ne=ne.filter(Xe=>Xe.source===Me.source)),Me.minMessages&&(ne=ne.filter(Xe=>Xe.message_count>=Me.minMessages)),Me.hasCompaction&&(ne=ne.filter(Xe=>Xe.has_summary)),Me.maxAge!=null){const Xe=Date.now()/1e3;ne=ne.filter(Ot=>Ot.last_active&&Xe-Ot.last_active<=Me.maxAge)}if(p.value.trim()){const Xe=p.value.toLowerCase().trim();ne=ne.filter(Ot=>(Ot.channel_id||"").toLowerCase().includes(Xe)||(Ot.last_user_id||"").toLowerCase().includes(Xe)||(Ot.source||"").toLowerCase().includes(Xe))}const ot=m.value,ss=h.value?1:-1;return ne.sort((Xe,Ot)=>{const Ft=Xe[ot]||0,Rs=Ot[ot]||0;return(Ft-Rs)*ss}),ne}),D=V(()=>{if(!n.value||!n.value.messages)return[];const ne=n.value.messages;if(ne.length===0)return[];const Le=[];let Me=[];for(const ot of ne)ot.role==="user"&&Me.length>0&&(Le.push(Me),Me=[]),Me.push(ot);return Me.length>0&&Le.push(Me),Le}),oe=V(()=>N.value.length>0&&c.value.size===N.value.length);function de(ne){const Le=ne.find(Me=>Me.role==="user");if(Le&&Le.content){const Me=Le.content.slice(0,120);return Me.length<Le.content.length?Me+"...":Me}return"(no user message)"}function B(ne){const Le=new Set(_.value);Le.has(ne)?Le.delete(ne):Le.add(ne),_.value=Le}function Y(ne){u.value=ne}function re(ne){u.value=ne.id,ne.filters.searchQuery!=null&&(p.value=ne.filters.searchQuery),ne.filters.sortBy&&(m.value=ne.filters.sortBy)}function J(){if(!b.value.trim())return;const ne={id:"custom-"+Date.now(),name:b.value.trim(),filters:{searchQuery:p.value,sortBy:m.value}};O.value=[...O.value,ne],W(),x.value=!1,b.value=""}function he(ne){O.value=O.value.filter(Le=>Le.id!==ne),W(),u.value===ne&&(u.value="all")}function fe(){u.value="all",p.value="",m.value="last_active",h.value=!1}function K(ne){if(!ne)return"—";const Le=Date.now()/1e3-ne;if(Le<60)return"just now";if(Le<3600){const ot=Math.floor(Le/60);return`${ot} minute${ot!==1?"s":""} ago`}if(Le<86400){const ot=Math.floor(Le/3600);return`${ot} hour${ot!==1?"s":""} ago`}const Me=Math.floor(Le/86400);return`${Me} day${Me!==1?"s":""} ago`}function pe(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function ve(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString()}catch{return""}}function ye(ne){return ne==="user"?"bg-gray-900/50 border border-gray-800":ne==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function _e(ne){return ne==="user"?"sess-msg-user":ne==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Fe(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":"badge-warning"}function E(ne){return ne==="user"?"sess-dot-user":ne==="assistant"?"sess-dot-assistant":"sess-dot-system"}function $(ne){return ne==="user"?"text-cyan-400":ne==="assistant"?"text-indigo-400":"text-gray-500"}function G(ne){return ne?ne.length>2e3?ne.slice(0,2e3)+`
... (truncated)`:ne:""}async function ie(){const ne=k.value.trim();if(!ne)return;const Le=++F;I.value=!0,U.value="",C.value=w.value!==null;try{let Me=`/api/sessions/search?q=${encodeURIComponent(ne)}&limit=50`;T.value.trim()&&(Me+=`&channel_id=${encodeURIComponent(T.value.trim())}`),A.value.trim()&&(Me+=`&user_id=${encodeURIComponent(A.value.trim())}`);const ot=await j.get(Me);if(Le!==F)return;w.value=ot.results||[],C.value=!1}catch(Me){if(Le!==F)return;U.value=Me.message||"Search failed. Please retry."}finally{Le===F&&(I.value=!1)}}function L(){F++,k.value="",T.value="",A.value="",w.value=null,U.value="",C.value=!1,I.value=!1}function Q(ne){return ne?ne.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ue(ne){return ne==="user"?"fts-result-user":ne==="assistant"?"fts-result-assistant":ne==="summary"?"fts-result-summary":ne==="fts"?"fts-result-fts":ne==="channel"?"fts-result-channel":"fts-result-default"}function H(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":ne==="summary"?"badge-warning":ne==="fts"?"badge-success":"badge-info"}let te=0;async function X(){const ne=++te;t.value=!0,s.value=null;try{const Le=await j.get("/api/sessions");if(ne!==te)return;e.value=Le}catch(Le){if(ne!==te)return;s.value=Le.message}ne===te&&(t.value=!1)}function ge(){s.value=null,X()}async function me(ne){if(a.value===ne){a.value=null,n.value=null,_.value=new Set;return}a.value=ne,n.value=null,i.value=!0,_.value=new Set;const Le=++l;try{const Me=await j.get(`/api/sessions/${encodeURIComponent(ne)}`);Le===l&&a.value===ne&&(n.value=Me)}catch(Me){Le===l&&a.value===ne&&(n.value={messages:[],summary:"",error:Me.message||"Failed to load session"})}finally{Le===l&&(i.value=!1)}}function we(ne){const Le=new Set(c.value);Le.has(ne)?Le.delete(ne):Le.add(ne),c.value=Le}function Ee(){oe.value?c.value=new Set:c.value=new Set(N.value.map(ne=>ne.channel_id))}function $e(ne){o.value=ne}async function We(){if(o.value){r.value=!0;try{await j.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(ne){s.value=ne.message||"Failed to clear session"}r.value=!1,o.value=null}}function He(){d.value=!0}async function Ve(){if(c.value.size!==0){r.value=!0;try{await j.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(ne){s.value=ne.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ze(ne,Le){const Me=`/api/sessions/${encodeURIComponent(ne)}/export?format=${Le}`;try{const ot=await j.getBlob(Me),ss=URL.createObjectURL(ot),Xe=document.createElement("a");Xe.href=ss,Xe.download=`session-${ne}.${Le==="text"?"txt":"json"}`,Xe.click(),URL.revokeObjectURL(ss)}catch(ot){s.value=ot.message||"Failed to export session"}}let st=null;function Qe(ne){ne.payload&&ne.payload.channel_id&&(clearTimeout(st),st=setTimeout(()=>{if(X(),a.value&&ne.payload.channel_id===a.value){const Le=a.value,Me=l;j.get(`/api/sessions/${encodeURIComponent(Le)}`).then(ot=>{Me!==l||a.value!==Le||(n.value=ot)}).catch(()=>{})}},2e3))}let ee=!1,Se=null;function Re(){ee||(ee=!0,X(),dt.subscribe("events",Qe),Se=dt.onReconnected(()=>X()))}tt(()=>{Z(),Re()}),us(()=>{Re()});function be(){ee&&(ee=!1,dt.unsubscribe("events",Qe),Se&&(Se(),Se=null),clearTimeout(st))}return Yt(be),xt(be),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:oe,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:m,sortAsc:h,filterPresets:g,sortOptions:R,filteredSessions:N,hasActiveFilters:P,customPresets:O,showSavePreset:x,newPresetName:b,threadView:y,threads:D,collapsedThreads:_,ftsQuery:k,ftsChannelId:T,ftsUserId:A,ftsResults:w,ftsSearching:I,ftsError:U,ftsStale:C,formatAge:K,formatTimestamp:pe,formatFullTimestamp:ve,messageClass:ye,threadMsgClass:_e,roleBadge:Fe,roleDotClass:E,roleLabelClass:$,truncateContent:G,threadSummary:de,fetchSessions:X,retry:ge,toggleSession:me,toggleSelect:we,toggleSelectAll:Ee,confirmClear:$e,clearSession:We,confirmBulkClear:He,doBulkClear:Ve,exportSession:Ze,applyPreset:Y,applyCustomPreset:re,saveCustomPreset:J,removeCustomPreset:he,resetFilters:fe,toggleThread:B,runFtsSearch:ie,clearFtsSearch:L,highlightSnippet:Q,ftsResultClass:ue,ftsTypeBadge:H}}},qS={props:["trace"],template:`
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
  `,setup(){return{formatTokens:eg}}},GS={components:{ContextAssemblyPanel:qS},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(T){if(!T)return"—";try{const A=new Date(T);return isNaN(A.getTime())?T:A.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return T}}function p(T){return!T&&T!==0?"—":T<1e3?T+"ms":(T/1e3).toFixed(1)+"s"}function m(T){return!T&&T!==0?"—":T>=1e3?(T/1e3).toFixed(1)+"k":String(T)}function h(T){if(!T)return"";if(typeof T=="string")return T;try{return JSON.stringify(T,null,2)}catch{return String(T)}}function g(T){n.value===T?n.value=null:(n.value=T,c.value={})}function R(T,A){const w=T+"-"+A;c.value={...c.value,[w]:!c.value[w]}}function O(T,A){return!!c.value[T+"-"+A]}function x(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,_()}async function b(){try{const T=await j.get("/api/trajectories");e.value=T.files||[],r.value=T.count||0}catch{}}let y=0;async function _(){const T=++y;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const A=await j.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(T!==y)return;let w=A.entries||[];d.value.tool_name&&(w=w.filter(I=>(I.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(I=>I.is_error)),d.value.channel_id&&(w=w.filter(I=>I.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(I=>I.user_id===d.value.user_id)),t.value=w}else{const A=new URLSearchParams;d.value.channel_id&&A.set("channel_id",d.value.channel_id),d.value.user_id&&A.set("user_id",d.value.user_id),d.value.tool_name&&A.set("tool_name",d.value.tool_name),d.value.errors_only&&A.set("errors_only","true"),A.set("limit",String(d.value.limit));const w=A.toString(),I=await j.get(`/api/trajectories/search/query?${w}`);if(T!==y)return;t.value=I.results||[]}}catch(A){if(T!==y)return;a.value=A.message}T===y&&(s.value=!1)}async function k(){if(!l.value.trim())return;const T=++y;s.value=!0,a.value=null,c.value={};try{const A=await j.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(T!==y)return;i.value=A.entry||null,i.value||(a.value="No trace found for this message ID")}catch(A){if(T!==y)return;A.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=A.message}T===y&&(s.value=!1)}return tt(async()=>{await b(),await _()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:m,formatJSON:h,truncateBlock:Xv,toggleExpand:g,toggleIteration:R,isIterationExpanded:O,clearFilters:x,fetchFiles:b,fetchTraces:_,lookupMessage:k}}};function WS(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function KS(e){return e?`${e.approximate?"~":""}${yu(e.total||0)}`:"0"}const JS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=V(()=>a.value.work||{}),m=T=>T==null?"Not reported":`$${Number(T).toFixed(6)}`,h=V(()=>Math.max(1,...(a.value.activity_over_time||[]).map(T=>Number(T.count||0)))),g=V(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),R=T=>({height:`${Math.max(4,Math.round(Number(T||0)/h.value*100))}%`}),O=V(()=>s.value&&l.value-i.value>3e4);async function x(){const T=++d,A=n.value;try{const w=await j.get(`/api/usage?range=${encodeURIComponent(A)}`);if(T!==d||A!==n.value)return;a.value=w,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(w){T===d&&(t.value=w.message)}finally{T===d&&(e.value=!1)}}function b(T){n.value=T,e.value=!s.value,x()}function y(){e.value=!0,x()}function _(){c||(c=!0,x(),o=setInterval(x,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function k(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return tt(_),us(_),Yt(k),xt(k),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:O,fmtNum:yu,fmtDuration:WS,tokenLabel:KS,formatActualCost:m,activityTrackStyle:g,activityBar:R,selectRange:b,retry:y}}},ng=[{id:"audit",label:"Audit",component:HS},{id:"sessions",label:"Sessions",component:VS},{id:"traces",label:"Traces",component:GS},{id:"usage",label:"Usage & Activity",component:JS}],ZS={components:{TabbedPage:Gr},setup(){return{tabs:ng}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},_c=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],YS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(w){return w.source!=="builtin"?"":u[w.state]||""}function m(w,I){const U=w&&Array.isArray(w.tools)?w.tools:null;if(c.value=!!U,r.value=U?!!w.global_enabled:null,!U){e.value=I.map(Z=>({...Z,source:"unknown",enabled:void 0,state:null}));return}const C=new Set(U.map(Z=>Z.name)),F=I.filter(Z=>!C.has(Z.name)).map(Z=>({...Z,source:Z.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...U.map(Z=>({...Z,source:"builtin"})),...F]}async function h(w,I){if(d.value.has(w.name))return;const U=!!I.target.checked,C=new Set(d.value);C.add(w.name),d.value=C;try{const F=await j.post(`/api/tools/builtins/${encodeURIComponent(w.name)}/enabled`,{enabled:U});m(F,e.value),s.value=null;try{const Z=await j.get("/api/tools");m(F,Z)}catch(Z){console.warn("Built-in toggle committed; visible catalog refresh failed",Z)}}catch(F){I.target.checked=!!w.enabled,s.value=F.message||`Failed to toggle ${w.name}`}finally{const F=new Set(d.value);F.delete(w.name),d.value=F}}const g=V(()=>e.value.filter(w=>w.source==="builtin"&&w.is_core).length),R=V(()=>e.value.filter(w=>w.source==="skill").length),O=V(()=>Object.values(n.value).reduce((w,I)=>w+I,0));function x(w){for(const I of _c)if(I.id!=="other"&&I.match(w))return I.id;return"other"}const b=V(()=>{let w=e.value;if(a.value){const I=a.value.toLowerCase();w=w.filter(U=>U.name.toLowerCase().includes(I)||(U.description||"").toLowerCase().includes(I))}return o.value&&(w=w.filter(I=>x(I.name)===o.value)),w}),y=V(()=>{const w=new Set;for(const I of e.value)w.add(x(I.name));return _c.filter(I=>w.has(I.id))}),_=V(()=>{const w=b.value,I={};for(const C of w){const F=x(C.name);I[F]||(I[F]=[]),I[F].push(C)}const U=[];for(const C of _c)I[C.id]&&I[C.id].length>0&&U.push({label:C.label,icon:C.icon,tools:I[C.id].sort((F,Z)=>F.name.localeCompare(Z.name))});return U});function k(w){i.value={...i.value,[w]:!i.value[w]}}async function T(){t.value=!0,s.value=null;try{const[w,I,U]=await Promise.all([j.get("/api/tools"),j.get("/api/tools/stats").catch(()=>({})),j.get("/api/tools/builtins").catch(()=>null)]);m(U,w),n.value=I||{}}catch(w){s.value=w.message}t.value=!1}function A(){T()}return tt(()=>{T()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:g,skillCount:R,totalUsage:O,filteredTools:b,groupedTools:_,usedCategories:y,stateBadge:p,applyInventory:m,toggleBuiltinTool:h,truncate:bu,toggleExpand:k,refresh:A}}};function QS(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function XS(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const e1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),m=f(null),h=f(!1),g=f(null),R=f(null),O=f(!1),x=V(()=>e.value.length),b=V(()=>e.value.reduce((J,he)=>J+(he.execution_count||0),0)),y=V(()=>e.value.reduce((J,he)=>J+I(he.code),0)),_=V(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(he=>he.name.toLowerCase().includes(J)||(he.description||"").toLowerCase().includes(J))}),k=V(()=>u.value?u.value.split(`
`).length:0),T=V(()=>{const J=Math.max(k.value,1);return Array.from({length:J},(he,fe)=>fe+1).join(`
`)}),A=V(()=>{const J=u.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(J){return QS(J)}function I(J){return J?J.split(`
`).length:0}function U(J){return XS(J)}function C(J){a.value={...a.value,[J]:!a.value[J]}}async function F(J){try{await navigator.clipboard.writeText(J);const he=e.value.find(fe=>fe.code===J);he&&(o.value=he.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function Z(J){if(J.key==="Tab"){J.preventDefault();const he=J.target,fe=he.selectionStart,K=he.selectionEnd;u.value=u.value.substring(0,fe)+"    "+u.value.substring(K),zt(()=>{he.selectionStart=he.selectionEnd=fe+4})}}function W(J){const he=J.target.previousElementSibling;he&&(he.scrollTop=J.target.scrollTop)}async function P(){t.value=!0,s.value=null;try{e.value=await j.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function N(J){i.value=J,delete n.value[J],n.value={...n.value};try{const he=await j.post(`/api/skills/${encodeURIComponent(J)}/test`);n.value={...n.value,[J]:he}}catch(he){n.value={...n.value,[J]:{result:he.message,is_error:!0}}}i.value=null}function D(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,m.value=null}function oe(J){r.value=!0,c.value="edit",d.value=J.name,u.value=J.code||"",p.value=null,m.value=null}function de(){r.value=!1,p.value=null,m.value=null}async function B(){p.value=null,m.value=null;const J=d.value.trim(),he=u.value.trim();if(!J){p.value="Name is required";return}if(!he){p.value="Code is required";return}h.value=!0;try{c.value==="create"?(await j.post("/api/skills",{name:J,code:he}),m.value="Skill created successfully"):(await j.put(`/api/skills/${encodeURIComponent(J)}`,{code:he}),m.value="Skill updated successfully"),await P(),setTimeout(()=>{r.value=!1},800)}catch(fe){p.value=fe.message}h.value=!1}function Y(J){R.value=J}async function re(){if(R.value){O.value=!0;try{await j.del(`/api/skills/${encodeURIComponent(R.value)}`),await P()}catch(J){Ce.error(`Failed to delete skill: ${J.message||"unknown error"}`)}O.value=!1,R.value=null}}return tt(()=>{P()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:m,saving:h,editorRef:g,deleteTarget:R,deleting:O,enabledCount:x,totalExecutions:b,totalLines:y,displayedSkills:_,editLineCount:k,editorLineNums:T,editValidation:A,highlight:w,truncate:bu,formatTs:Xn,countLines:I,getLineNumbers:U,toggleCode:C,copyCode:F,handleEditorKey:Z,syncScroll:W,fetchSkills:P,testSkill:N,showCreate:D,editSkill:oe,cancelEdit:de,saveSkill:B,confirmDelete:Y,doDelete:re}}};class ea extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const t1=/^[A-Za-z_][A-Za-z0-9_]*$/;function pf(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function ff(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new ea(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new ea(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new ea(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new ea(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function s1(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function a1(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new ea("Server name is required.","name");if(n.length>128||!t1.test(n))throw new ea("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new ea("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=pf(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new ea("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new ea("An HTTP endpoint is required for this connection.","url");if(d&&!s1(d))throw new ea("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new ea("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=pf(e.allowlistText));const r=ff(e.headerRows,e.headersRemove,"Header"),c=ff(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function n1(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function i1(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function l1(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const o1=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function r1(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const c1=1e4,d1=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function wc(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function u1(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const p1={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=V(()=>Object.keys(i.value).every(ee=>{var Se;return Number.isInteger((Se=e.value)==null?void 0:Se[ee])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),m=f({}),h=f(new Set),g=f(!1),R=f("add"),O=f(""),x=f(null),b=f(wc()),y=f(""),_=f(!1);let k=null,T=0,A=!1,w=!1;const I=o1,U=V(()=>{var ee;return((ee=e.value)==null?void 0:ee.servers)||[]}),C=V(()=>{var ee;return!!((ee=e.value)!=null&&ee.enabled)}),F=V(()=>{var ee,Se,Re,be;return{serverCount:((ee=e.value)==null?void 0:ee.server_count)||0,enabledCount:((Se=e.value)==null?void 0:Se.enabled_server_count)||0,connectedCount:((Re=e.value)==null?void 0:Re.connected_count)||0,toolCount:((be=e.value)==null?void 0:be.published_tool_count)||0}}),Z=V(()=>{var ee;return((ee=x.value)==null?void 0:ee.header_keys)||[]}),W=V(()=>{var ee;return((ee=x.value)==null?void 0:ee.env_keys)||[]}),P=V(()=>{var ee;return R.value==="edit"&&((ee=x.value)==null?void 0:ee.transport)==="http"}),N=V(()=>R.value==="add"||!P.value),D=V(()=>P.value?"Replace endpoint URL":"Endpoint URL"),oe=V(()=>P.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function de(){B(),k=window.setInterval(()=>Y({quiet:!0}),c1)}function B(){k&&window.clearInterval(k),k=null}async function Y({quiet:ee=!1}={}){if(a.value)return;const Se=++T;ee||(t.value=!0);try{const Re=await j.get("/api/mcp/status");if(Se!==T||!A)return;e.value=Re;for(const ne of Object.keys(i.value))!l.value.has(ne)&&Number.isInteger(Re[ne])&&(i.value[ne]=String(Re[ne]));r.value="";const be=new Set((Re.servers||[]).map(ne=>ne.name));d.value=new Set([...d.value].filter(ne=>be.has(ne)))}catch(Re){Se===T&&A&&(r.value=Re.message||"Failed to load MCP status")}finally{Se===T&&(t.value=!1)}}function re(ee){return s.value||c.value.has(ee)}function J(ee,Se){const Re=new Set(c.value);Se?Re.add(ee):Re.delete(ee),c.value=Re}function he(ee){return i1(ee.state)}function fe(ee){if(he(ee)==="disabled"){if(!ee.enabled)return"Disabled — server switch off";if(!C.value)return"Disabled — global MCP is off"}return d1[he(ee)]}function K(ee){return ee.transport==="http"?"Streamable HTTP":"stdio"}function pe(ee){return ee.negotiated_version?`${ee.era?`${String(ee.era).charAt(0).toUpperCase()}${String(ee.era).slice(1)}`:"Protocol"} · ${ee.negotiated_version}`:"Not negotiated"}function ve(ee){return ee.discovered_count?`${ee.published_count||0} published · ${ee.excluded_count||0} excluded`:"No tools discovered"}const ye=f(new Set);async function _e(ee,Se){if(ye.value.has(ee.name))return;const Re=!!Se.target.checked,be=new Set(ye.value);be.add(ee.name),ye.value=be;try{const ne=await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/enabled`,{enabled:Re});ne&&Array.isArray(ne.servers)?e.value=ne:await Y({quiet:!0})}catch(ne){Se.target.checked=!!ee.enabled,Ce.error(ne.message||`Failed to toggle ${ee.name}`)}finally{const ne=new Set(ye.value);ne.delete(ee.name),ye.value=ne}}function Fe(ee,Se){var be;i.value[ee]=Se;const Re=new Set(l.value);Se===String((be=e.value)==null?void 0:be[ee])?Re.delete(ee):Re.add(ee),l.value=Re,n.value=""}async function E(){if(s.value||!o.value||!l.value.size)return;const ee={};for(const Se of l.value){const Re=Number(i.value[Se]),be=Se==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Re)||Re<1||Re>be){n.value=`Enter a whole number between 1 and ${be}.`;return}ee[Se]=Re}a.value=!0,s.value=!0,n.value="",++T,t.value=!1;try{const Se=await j.post("/api/mcp/limits",ee);e.value=Se;for(const Re of Object.keys(i.value))Number.isInteger(Se[Re])&&(i.value[Re]=String(Se[Re]));l.value=new Set,Ce.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(Se){n.value=Se.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Y({quiet:!0})}}async function $(ee){if(ee!==C.value&&!(!ee&&!await ts({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await j.post("/api/mcp/enabled",{enabled:ee}),Ce.success(ee?"MCP enabled":"MCP disabled"),await Y({quiet:!0})}catch(Se){Ce.error(Se.message||"Failed to update MCP state"),await Y({quiet:!0})}finally{s.value=!1}}}async function G(ee){J(ee.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/reconnect`,{}),Ce.success(`Reconnected ${ee.name}`)}catch(Se){Ce.error(Se.message||`Failed to reconnect ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}async function ie(ee){J(ee.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(ee.name)}/refresh-tools`,{}),Ce.success(`Refreshed tools from ${ee.name}`),await ue(ee.name,!0)}catch(Se){Ce.error(Se.message||`Failed to refresh ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}async function L(ee){if(await ts({title:`Remove ${ee.name}`,message:`Remove this saved MCP server? Its ${ee.published_count||0} published tool${ee.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){J(ee.name,!0);try{await j.del(`/api/mcp/servers/${encodeURIComponent(ee.name)}`),Ce.success(`Removed ${ee.name}`),delete p.value[ee.name]}catch(Re){Ce.error(Re.message||`Failed to remove ${ee.name}`)}finally{J(ee.name,!1),await Y({quiet:!0})}}}async function Q(ee){const Se=new Set(d.value);if(Se.has(ee.name)){Se.delete(ee.name),d.value=Se;return}Se.add(ee.name),d.value=Se,Object.hasOwn(p.value,ee.name)||await ue(ee.name)}async function ue(ee,Se=!1){if(!Se&&Object.hasOwn(p.value,ee))return;const Re=new Set(h.value);Re.add(ee),h.value=Re,m.value={...m.value,[ee]:""};try{const be=await j.get(`/api/mcp/servers/${encodeURIComponent(ee)}/tools`);p.value={...p.value,[ee]:be.tools||[]}}catch(be){m.value={...m.value,[ee]:be.message||"Failed to load tools"}}finally{const be=new Set(h.value);be.delete(ee),h.value=be}}function H(ee){return(p.value[ee]||[]).filter(Se=>l1(Se,u.value[ee]))}function te(ee,Se){u.value={...u.value,[ee]:Se}}function X(){R.value="add",O.value="",x.value=null,b.value=wc(),y.value="",g.value=!0}function ge(ee){R.value="edit",O.value=ee.name,x.value=ee,b.value={...wc(),name:ee.name,enabled:!!ee.enabled,transport:ee.transport||"stdio"},y.value="",g.value=!0}function me(){_.value||(g.value=!1)}function we(ee){g.value&&r1(ee)}function Ee(ee){const Se=ee==="headers"?"headerRows":"envRows";b.value[Se].push({key:"",value:""})}function $e(ee,Se){const Re=ee==="headers"?"headerRows":"envRows";b.value[Re].splice(Se,1)}function We(ee,Se){const Re=ee==="headers"?"headersRemove":"envRemove",be=b.value[Re];b.value[Re]=be.includes(Se)?be.filter(ne=>ne!==Se):[...be,Se]}async function He(){var Se,Re;y.value="";let ee;try{ee=a1(b.value,{mode:R.value,originalTransport:((Se=x.value)==null?void 0:Se.transport)||""})}catch(be){y.value=be instanceof ea?be.message:"Invalid MCP server configuration",await zt(),(Re=document.querySelector(".mcp-editor"))==null||Re.scrollTo({top:0,behavior:"smooth"});return}if(!(R.value==="edit"&&n1(ee,x.value)&&!await ts({title:`Change ${O.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){_.value=!0;try{R.value==="add"?await j.post("/api/mcp/servers",ee):await j.put(`/api/mcp/servers/${encodeURIComponent(O.value)}`,ee),Ce.success(R.value==="add"?`Saved ${ee.name}`:`Updated ${O.value}`),g.value=!1,await Y({quiet:!0})}catch(be){y.value=be.message||"Failed to save MCP server"}finally{_.value=!1}}}let Ve=null;function Ze(ee){`${(ee==null?void 0:ee.event)||""} ${(ee==null?void 0:ee.type)||""} ${(ee==null?void 0:ee.tool)||""} ${(ee==null?void 0:ee.message)||""}`.toLowerCase().includes("mcp")&&(Ve&&window.clearTimeout(Ve),Ve=window.setTimeout(()=>Y({quiet:!0}),200))}function st(){A||(A=!0,w||(dt.subscribe("events",Ze),w=!0),Y(),de())}function Qe(){A=!1,B(),Ve&&window.clearTimeout(Ve),Ve=null,w&&(dt.unsubscribe("events",Ze),w=!1)}return tt(st),us(st),Yt(Qe),xt(Qe),{status:e,loading:t,mutating:s,pageError:r,servers:U,masterEnabled:C,aggregate:F,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Fe,saveLimits:E,expandedServers:d,toolQueries:u,toolErrors:m,toolsLoading:h,editorOpen:g,editorMode:R,editingName:O,editingServer:x,form:b,formError:y,saving:_,editorGroups:I,configuredHeaderKeys:Z,configuredEnvKeys:W,savedHttpEndpoint:P,endpointRequired:N,endpointFieldLabel:D,endpointPlaceholder:oe,refreshAll:Y,busy:re,serverState:he,stateLabel:fe,transportLabel:K,protocolLabel:pe,toolSummary:ve,formatAge:u1,setMasterEnabled:$,togglePending:ye,toggleServerEnabled:_e,reconnect:G,refreshTools:ie,removeServer:L,toggleTools:Q,filteredTools:H,setToolQuery:te,openAdd:X,openEdit:ge,closeEditor:me,jumpToEditorGroup:we,addSecretRow:Ee,removeSecretRow:$e,toggleSecretRemoval:We,saveServer:He}}};function f1(e,t){if(!e||!t)return of(e);const s=of(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const m1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),m=f(!1),h=f(null),g=f(null);let R=null;const O=f(null),x=f(!1),b=f({}),y=f({}),_=f({}),k=f({}),T=new Map,A=f(null),w=V(()=>e.value.reduce((B,Y)=>B+(Y.chunks||0),0)),I=V(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function U(B,Y){const re=y.value[Y];if(!re||re.length===0)return 0;const J=Math.max(...re.map(he=>he.char_count||0));return J===0?0:Math.round(B.char_count/J*100)}async function C(){t.value=!0,s.value=null;try{const B=await j.get("/api/knowledge");e.value=Array.isArray(B)?B:[]}catch(B){s.value=B.message}t.value=!1}async function F(B){if(b.value[B]){b.value[B]=!1,A.value=null;return}if(b.value[B]=!0,Object.prototype.hasOwnProperty.call(y.value,B))return;if(T.has(B))return T.get(B);const Y={...k.value,[B]:!0};k.value=Y;const re={..._.value};delete re[B],_.value=re;const J=j.get(`/api/knowledge/${encodeURIComponent(B)}/chunks`).then(he=>{y.value={...y.value,[B]:Array.isArray(he)?he:[]}}).catch(he=>{_.value={..._.value,[B]:he.message||"load failed"}}).finally(()=>{if(T.get(B)!==J)return;T.delete(B);const he={...k.value};delete he[B],k.value=he});return T.set(B,J),J}let Z=0;async function W(){const B=a.value.trim();if(!B)return;const Y=++Z;i.value=!0,o.value=null,l.value=B;try{const re=await j.get(`/api/knowledge/search?q=${encodeURIComponent(B)}`);if(Y!==Z)return;n.value=Array.isArray(re)?re:[]}catch(re){if(Y!==Z)return;n.value=[],o.value=re.message||"Search failed"}Y===Z&&(i.value=!1)}function P(){Z+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function N(){u.value=null,p.value=null;const B=c.value.trim(),Y=d.value.trim();if(!B){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}m.value=!0;try{const re=await j.post("/api/knowledge",{source:B,content:Y});p.value=`Ingested ${re.chunks||0} chunks from "${B}"`,c.value="",d.value="",y.value={},await C(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}m.value=!1}async function D(B){h.value=B,g.value=null,R&&(clearTimeout(R),R=null);try{const Y=await j.post(`/api/knowledge/${encodeURIComponent(B)}/reingest`);g.value={source:B,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete y.value[B],await C(),R=setTimeout(()=>{g.value=null,R=null},3e3)}catch(Y){g.value={source:B,error:!0,message:Y.message}}h.value=null}function oe(B){O.value=B}async function de(){if(O.value){x.value=!0;try{await j.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete y.value[O.value],await C()}catch(B){Ce.error(`Failed to delete source: ${B.message||"unknown error"}`)}x.value=!1,O.value=null}}return tt(()=>{C()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:m,reingesting:h,reingestResult:g,deleteTarget:O,deleting:x,expanded:b,sourceChunks:y,chunkErrors:_,loadingChunks:k,selectedChunk:A,totalChunks:w,uploaderCount:I,truncate:bu,formatTs:Xn,highlightTerms:f1,chunkBarWidth:U,fetchSources:C,toggleSource:F,doSearch:W,clearSearch:P,doIngest:N,doReingest:D,confirmDelete:oe,doDelete:de}}},h1={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),m=f(""),h=f(!1),g=f(null),R=f(null),O=f(new Set),x=f(null),b=f(!1),y=f(!1),_=V(()=>e.value.reduce((Y,re)=>Y+re.count,0)),k=V(()=>O.value.size);function T(Y){const re=t.value[Y];if(!re)return[];if(!l.value.trim())return re;const J=l.value.trim().toLowerCase();return re.filter(he=>he.key.toLowerCase().includes(J)||he.value&&he.value.toLowerCase().includes(J))}function A(Y,re){return O.value.has(Y+"/"+re)}function w(Y,re){const J=Y+"/"+re,he=new Set(O.value);he.has(J)?he.delete(J):he.add(J),O.value=he}function I(Y){const re=t.value[Y];return!re||re.length===0?!1:re.every(J=>O.value.has(Y+"/"+J.key))}function U(Y,re){const J=t.value[Y];if(!J)return;const he=new Set(O.value);for(const fe of J){const K=Y+"/"+fe.key;re?he.add(K):he.delete(K)}O.value=he}async function C(){s.value=!0,a.value=null;try{const Y=await j.get("/api/memory");e.value=Object.entries(Y).map(([re,J])=>({name:re,keys:J.keys||[],count:J.count||0}))}catch(Y){a.value=Y.message}s.value=!1}async function F(Y){if(n.value[Y]){n.value[Y]=!1;return}n.value[Y]=!0;const re=e.value.find(he=>he.name===Y);if(!re||t.value[Y]||i.value===Y)return;i.value=Y;let J;try{const fe=(await j.get(`/api/memory/${encodeURIComponent(Y)}`)).entries||{};J=re.keys.map(K=>Object.prototype.hasOwnProperty.call(fe,K)?{key:K,value:fe[K]||"",failed:!1}:{key:K,value:"",failed:!0,error:"Not found in scope"})}catch(he){J=re.keys.map(fe=>({key:fe,value:"",failed:!0,error:he.message||"Failed to load"}))}t.value[Y]=J,i.value=null}function Z(Y,re,J){p.value=Y+"/"+re,m.value=J}async function W(Y,re){h.value=!0,g.value=null;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(re)}`,{value:m.value});const J=t.value[Y];if(J){const he=J.find(fe=>fe.key===re);he&&(he.value=m.value)}p.value=null}catch(J){g.value=`Failed to save: ${J.message||"unknown error"}`}h.value=!1}async function P(Y,re){try{await navigator.clipboard.writeText(re.value),R.value=Y+"/"+re.key,setTimeout(()=>{R.value=null},1500)}catch{}}async function N(){d.value=null,u.value=null;const Y=r.value.scope.trim(),re=r.value.key.trim(),J=r.value.value.trim();if(!Y){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!J){d.value="Value is required";return}c.value=!0;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(re)}`,{value:J}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await C(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(he){d.value=he.message}c.value=!1}function D(Y,re){x.value={scope:Y,key:re}}async function oe(){if(!x.value)return;b.value=!0,g.value=null;const{scope:Y,key:re}=x.value;try{await j.del(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(re)}`);const J=t.value[Y];J&&(t.value[Y]=J.filter(K=>K.key!==re));const he=e.value.find(K=>K.name===Y);he&&(he.count--,he.keys=he.keys.filter(K=>K!==re));const fe=new Set(O.value);fe.delete(Y+"/"+re),O.value=fe}catch(J){g.value=`Failed to delete: ${J.message||"unknown error"}`}b.value=!1,x.value=null}function de(){y.value=!0}async function B(){b.value=!0,g.value=null;const Y=[];for(const re of O.value){const J=re.indexOf("/");Y.push({scope:re.slice(0,J),key:re.slice(J+1)})}try{await j.post("/api/memory/bulk-delete",{entries:Y}),O.value=new Set,t.value={},await C()}catch(re){g.value=`Bulk delete failed: ${re.message||"unknown error"}`}b.value=!1,y.value=!1}return tt(()=>{C()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:m,saving:h,actionError:g,copied:R,selected:O,selectedCount:k,totalEntries:_,deleteTarget:x,deleting:b,showBulkDelete:y,fetchMemory:C,toggleScope:F,startEdit:Z,doEdit:W,copyValue:P,doAdd:N,confirmDelete:D,doDelete:oe,confirmBulkDelete:de,doBulkDelete:B,isSelected:A,toggleSelect:w,isScopeAllSelected:I,toggleSelectAll:U,filteredEntries:T}}},v1={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=V(()=>[...new Set(e.value.map(k=>k.category))].sort()),p=V(()=>{const _={};return e.value.forEach(k=>{_[k.category]=(_[k.category]||0)+1}),_}),m=V(()=>n.value?e.value.filter(_=>_.category===n.value):e.value);function h(_){return _==="correction"?"badge-warning":_==="operational"?"badge-info":_==="preference"?"badge-success":"badge-info"}function g(_){i.value=_.key,l.value=_.content}async function R(_){try{await j.put("/api/learned/"+encodeURIComponent(_),{content:l.value}),i.value=null,Ce.success("Entry updated"),await x()}catch(k){Ce.error(k.message||"Failed to save entry")}}async function O(_){if(await ts({title:"Delete learned entry",message:`Delete "${_}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/learned/"+encodeURIComponent(_)),Ce.success("Entry deleted"),await x()}catch(T){Ce.error(T.message||"Failed to delete entry")}}async function x(){s.value=!0,a.value=null;try{const _=await j.get("/api/learned");e.value=_.entries||[],t.value={last_reflection:_.last_reflection,count:_.count}}catch(_){a.value=_.message}s.value=!1}async function b(){var _;r.value=!1,c.value=null;try{const k=await j.get("/api/config");o.value=((_=k.learning)==null?void 0:_.enabled)===!0,r.value=!0}catch(k){c.value=k.status===403?"Administrator access is required to change automatic learning.":k.message||"Automatic learning state is unavailable."}}async function y(_){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await j.put("/api/config",{learning:{enabled:_}}),await b(),!r.value)return;Ce.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(k){r.value=!1,c.value=k.status===403?"Administrator access is required to change automatic learning.":k.message||"Failed to change automatic learning."}finally{d.value=!1}}}return tt(()=>{x(),b()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:m,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:h,formatTs:Xn,startEdit:g,saveEdit:R,deleteEntry:O,fetchEntries:x,fetchLearningConfig:b,setLearningEnabled:y}}},ig=[{id:"tools",label:"Tools",component:YS},{id:"skills",label:"Skills",component:e1},{id:"mcp-servers",label:"MCP Servers",component:p1},{id:"knowledge",label:"Knowledge",component:m1},{id:"memory",label:"Memory",component:h1},{id:"learned",label:"Learned",component:v1}],g1={components:{TabbedPage:Gr},setup(){return{tabs:ig}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},b1={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},y1={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},x1={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},_1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=V(()=>e.value.components||[]),l=V(()=>x1[e.value.overall]||"text-gray-400"),o=V(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=V(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return b1[k]||"text-gray-400"}function d(k){return y1[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function m(k){return k.replace(/_/g," ").replace(/\b\w/g,T=>T.toUpperCase())}function h(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function g(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function R(){n.value=!0;try{e.value=await j.get("/api/health/components"),s.value=null,a.value=!0}catch(k){s.value=k.message}finally{t.value=!1,n.value=!1}}function O(){t.value=!0,s.value=null,R()}let x=null,b=!1;function y(){b||(b=!0,R(),x||(x=setInterval(R,3e4)))}function _(){b&&(b=!1,x&&(clearInterval(x),x=null))}return tt(y),us(y),Yt(_),xt(_),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:m,formatTime:h,formatNumber:g,fetchHealth:R,retry:O}}},w1={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=V(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=V(()=>{if(!i.value)return[];const R=i.value,O=R.storage_total_bytes||1;return[{label:"Session Persistence",mb:R.sessions.persist_dir.total_mb,bytes:R.sessions.persist_dir.total_bytes,files:R.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(R.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:R.knowledge.db_file.total_mb,bytes:R.knowledge.db_file.total_bytes,files:R.knowledge.db_file.file_count,pct:Math.min(100,Math.round(R.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:R.trajectories.message_dir.total_mb,bytes:R.trajectories.message_dir.total_bytes,files:R.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:R.trajectories.agent_dir.total_mb,bytes:R.trajectories.agent_dir.total_bytes,files:R.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const R=await j.get("/api/resource-usage");i.value=R,t.value=null,s.value=!0}catch(R){t.value=R.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let m=!1;function h(){m||(m=!0,d(),l||(l=setInterval(d,3e4)))}function g(){m&&(m=!1,l&&(clearInterval(l),l=null))}return tt(h),us(h),Yt(g),xt(g),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:yu,refresh:u,retry:p}}},k1=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),S1=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function C1(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!S1.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?Jl(t):""}function T1(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!k1.has(c)));s=Object.keys(r).length?Jl(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const wn=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),Zl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function E1(e){const t=wn(e)?e:{},s=wn(t.metadata)?t.metadata:{},a=wn(t.audit_metadata)?t.audit_metadata:{},n=wn(t.turn)?t.turn:{},i=l=>Zl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function mf(e){return e.record?JSON.stringify(lg(e),null,2):e.text}function lg(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function dd(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function hf(e){if(!dd(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,Zl(s.channel_id),Zl(s.user_id??s.actor)])}function A1(e,t,s=2e3){var i,l,o;const a=hf(t),n=a?e.findIndex(r=>hf(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(x=>JSON.stringify(x)===d))return;c.push(t.record);const u=x=>"result_summary"in x?2:dd(x)==="end"?1:0,p=[...c].sort((x,b)=>u(x)-u(b)),m=Object.assign({},...p);m.type=p[p.length-1].type||"execution";for(const x of["metadata","audit_metadata","turn"]){const b=p.filter(y=>wn(y[x])).map(y=>y[x]);b.length&&(m[x]=Object.assign({},...b))}const h=c.some(x=>dd(x)!=="start"),g=c.find(x=>ud(x,0).level==="ERROR"),R=(g==null?void 0:g.status)||((i=g==null?void 0:g.metadata)==null?void 0:i.status);m.status=g?["failed","error","cancelled","denied","outcome_unknown"].includes(R)?R:"failed":h?m.status||((l=m.metadata)==null?void 0:l.status)||"succeeded":"started",h&&m.status==="started"&&(m.status="succeeded"),g&&(m.error=g.error||((o=g.metadata)==null?void 0:o.error)||m.error);const O=ud(m,r.id,r._time);Object.assign(O,{events:c,ts:r.ts,_time:r._time,searchText:c.map(x=>JSON.stringify(x)).join(`
`)}),e.splice(n,1,O)}e.length>s&&e.splice(0,e.length-s)}function ud(e,t,s=new Date){var u,p;let a=e;if(wn(e)&&e.type==="log"&&"line"in e?a=e.line:wn(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=wn(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(m=>["failed","error","cancelled","denied","outcome_unknown"].includes(m))?"ERROR":Zl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:Zl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:E1(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function R1(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const I1={components:{ToolOutput:Wr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=V(()=>T1(e.entry)),s=V(()=>{var o;return Jl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=V(()=>{var o,r,c;return Jl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=V(()=>C1(e.entry.record)),i=V(()=>lg(e.entry)),l=V(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},O1=["INFO","WARNING","ERROR"],L1=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],kc=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],N1=[50,100,200,500],M1={components:{ToolOutput:Wr,LogRecord:I1},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(dt.state||"disconnected"),u=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),m=f(!1),h=f(null),g=2e3,R=O1,O=L1,x=kc,b=f("all"),y=f(""),_=f([]),k=f(!1),T=f(""),A=f([]);function w(){try{const le=localStorage.getItem("odin-log-presets");le&&(_.value=JSON.parse(le))}catch{}}function I(){try{localStorage.setItem("odin-log-presets",JSON.stringify(_.value))}catch{}}const U=V(()=>l.value!==""||o.value.trim()!==""||y.value!==""),C=V(()=>{const le=kc.find(Ae=>Ae.value===y.value);return le?le.label:""}),F=V(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(le){return le.message}}),Z=24,W=V(()=>{if(Y.value.length===0)return[];const le=[],Ae=new Date,Je=3600*1e3;for(let it=Z-1;it>=0;it--){const kt=new Date(Ae.getTime()-(it+1)*Je),mt=new Date(Ae.getTime()-it*Je);le.push({start:kt,end:mt,label:oe(kt,mt),shortLabel:mt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const it of Y.value){if(!it._time)continue;const kt=it._time.getTime();for(const mt of le)if(kt>=mt.start.getTime()&&kt<mt.end.getTime()){mt.total++,it.level==="ERROR"?mt.errors++:it.level==="WARNING"?mt.warnings++:mt.info++;break}}return le}),P=V(()=>{let le=1;for(const Ae of W.value)Ae.total>le&&(le=Ae.total);return le}),N=V(()=>{if(W.value.length===0)return"";const le=Y.value.map(it=>it._time&&it._time.getTime()).filter(Boolean);if(le.length===0)return"";const Ae=new Date(Math.min(...le));return`${Y.value.length} shown, oldest ${Ae.toLocaleTimeString()}`}),D=V(()=>Math.ceil(Z/8));function oe(le,Ae){const Je={hour:"2-digit",minute:"2-digit"};return le.toLocaleTimeString([],Je)+" - "+Ae.toLocaleTimeString([],Je)}function de(le,Ae){return!Ae||!le?"0px":Math.max(2,le/Ae*100)+"%"}function B(le){const Ae=Y.value.findIndex(Je=>Je._time&&Je._time.getTime()>=le.start.getTime()&&Je._time.getTime()<le.end.getTime());if(Ae>=0&&p.value){const Je=p.value.querySelector('[data-log-id="'+Y.value[Ae].id+'"]');Je&&(Je.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Y=V(()=>{let le=t.value;if(l.value&&(le=le.filter(Ae=>(Ae.level||"INFO")===l.value)),y.value){const Ae=kc.find(Je=>Je.value===y.value);if(Ae&&Ae.seconds){const Je=new Date(Date.now()-Ae.seconds*1e3);le=le.filter(it=>it._time&&it._time>=Je)}}if(o.value&&!F.value)if(r.value)try{const Ae=new RegExp(o.value,"i");le=le.filter(Je=>{const it=Je.searchText,kt=Je.tool||"";return Ae.test(it)||Ae.test(kt)})}catch{}else{const Ae=o.value.toLowerCase();le=le.filter(Je=>{const it=Je.searchText.toLowerCase(),kt=(Je.tool||"").toLowerCase();return it.includes(Ae)||kt.includes(Ae)})}return le}),re=V(()=>R1(Y.value));function J(le){const Ae=ud(le,++s);if(n.value){A.value.push(Ae);return}he(Ae)}function he(le){A1(t.value,le,g),i.value&&zt(()=>fe())}function fe(le=!1){const Ae=p.value;Ae&&Ae.scrollTo({top:Ae.scrollHeight,behavior:le?"smooth":"instant"})}function K(){i.value=!0,m.value=!1,zt(()=>fe(!0))}const pe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function ve(){const le=p.value;if(!le)return;const Ae=le.scrollHeight-le.scrollTop-le.clientHeight<40;m.value=!i.value&&!Ae&&t.value.length>0,E.value&&ye()}function ye(){const le=p.value;!le||!i.value||le.scrollHeight-le.scrollTop-le.clientHeight>=40&&(i.value=!1,m.value=t.value.length>0)}function _e(){i.value&&requestAnimationFrame(ye)}function Fe(le){pe.has(le.key)&&_e()}const E=f(!1);function $(){i.value&&(E.value=!0,requestAnimationFrame(ye))}function G(){E.value&&(E.value=!1,ye())}function ie(){i.value&&(m.value=!1,zt(()=>fe()))}function L(){if(n.value=!n.value,!n.value&&A.value.length>0){for(const le of A.value)he(le);A.value=[]}}function Q(){t.value=[],A.value=[],m.value=!1}function ue(){let le;e.value==="search"?le=Me.value.map(kt=>{const mt=kt.error?"ERROR":"INFO",Oa=kt.tool_name?`[${kt.tool_name}] `:"";return`${kt.timestamp||""} ${mt} ${Oa}${kt.result_summary||kt.message||""}`}).join(`
`):le=Y.value.map(mf).join(`

`);const Ae=new Blob([le],{type:"text/plain"}),Je=URL.createObjectURL(Ae),it=document.createElement("a");it.href=Je,it.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,it.click(),URL.revokeObjectURL(Je)}function H(le){const Ae=mf(le);navigator.clipboard.writeText(Ae).then(()=>{h.value=le.id,setTimeout(()=>{h.value=null},1500)}).catch(()=>{})}function te(le){l.value=l.value===le?"":le,b.value="all"}function X(le){return le.level==="ERROR"?"log-line-error":le.level==="WARNING"?"log-line-warning":"text-gray-300"}function ge(le){return le==="ERROR"?"text-red-500 font-semibold":le==="WARNING"?"text-yellow-500":"text-blue-500"}function me(le){return le==="ERROR"?"log-chip-error":le==="WARNING"?"log-chip-warning":"log-chip-info"}function we(le){b.value=le.id;const Ae=le.filters;l.value=Ae.level||"",y.value=Ae.timeRange||"",o.value=Ae.text||"",Ae.levels&&(l.value=Ae.levels[0]||""),Ae.hasToolName&&(o.value="")}function Ee(le){b.value=le.id,l.value=le.filters.level||"",y.value=le.filters.timeRange||"",o.value=le.filters.text||""}function $e(){if(!T.value.trim())return;const le={id:"custom-"+Date.now(),name:T.value.trim(),filters:{level:l.value,timeRange:y.value,text:o.value}};_.value=[..._.value,le],I(),k.value=!1,T.value=""}function We(le){_.value=_.value.filter(Ae=>Ae.id!==le),I(),b.value===le&&(b.value="all")}const He=f("all"),Ve=f(""),Ze=f(""),st=f(""),Qe=f(""),ee=f(""),Se=f(100),Re=N1,be=f(!1),ne=f(!1),Le=f(""),Me=f([]),ot=f(null),ss=f(null);function Xe(){e.value="search",ot.value||Ot()}async function Ot(){try{ot.value=await j.get("/api/logs/stats")}catch{}}function Ft(){const le=ee.value;if(!le){st.value="",Qe.value="";return}const Je={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[le];if(Je){const it=new Date(Date.now()-Je*1e3);st.value=Rs(it),Qe.value=""}}function Rs(le){const Ae=Je=>String(Je).padStart(2,"0");return`${le.getFullYear()}-${Ae(le.getMonth()+1)}-${Ae(le.getDate())}T${Ae(le.getHours())}:${Ae(le.getMinutes())}`}function pa(le){if(!le)return"";const Ae=new Date(le);return isNaN(Ae.getTime())?"":Ae.toISOString()}async function fa(){be.value=!0,Le.value="",ne.value=!0,ss.value=null;try{const le=new URLSearchParams;He.value&&He.value!=="all"&&le.set("level",He.value),Ve.value&&le.set("tool",Ve.value),Ze.value&&le.set("q",Ze.value);const Ae=pa(st.value),Je=pa(Qe.value);Ae&&le.set("start",Ae),Je&&le.set("end",Je),le.set("limit",String(Se.value));const it=await j.get(`/api/logs/search?${le.toString()}`);Me.value=it.entries||[]}catch(le){Le.value=le.message||"Search failed",Me.value=[]}finally{be.value=!1}}function as(){He.value="all",Ve.value="",Ze.value="",st.value="",Qe.value="",ee.value="",Se.value=100,Me.value=[],ne.value=!1,Le.value="",ss.value=null}function Zs(le){ss.value=ss.value===le?null:le}function ns(le){if(!le.timestamp)return"";try{return new Date(le.timestamp).toLocaleString()}catch{return le.timestamp}}function la(le){return le.type==="web_action"?`${le.status||""} (${le.execution_time_ms||0}ms)`:(le.result_summary||"").slice(0,200)}function Is(le){return le.error?"log-line-error":"text-gray-300"}function Ra(le){try{return JSON.stringify(le,null,2)}catch{return String(le)}}let Ys=null,ut=!1;function Bs(){ut||(ut=!0,dt.subscribe("logs",J),c.value=dt.connected,d.value=dt.state||"disconnected",Ys=dt.onState(le=>{d.value=le,c.value=le==="connected"}))}function Ia(){ut&&(ut=!1,dt.unsubscribe("logs",J),Ys&&(Ys(),Ys=null))}return tt(()=>{w(),window.addEventListener("pointerup",G),window.addEventListener("pointercancel",G)}),us(Bs),Yt(Ia),xt(()=>{Ia(),window.removeEventListener("pointerup",G),window.removeEventListener("pointercancel",G)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Y,pauseBuffer:A,showJumpBottom:m,copiedIndex:h,regexError:F,levels:R,logPresets:O,timeRanges:x,timeRange:y,activeLogPreset:b,customLogPresets:_,showSaveLogPreset:k,newLogPresetName:T,hasActiveLogFilters:U,timeRangeLabel:C,timelineBuckets:W,timelineMax:P,timelineSpanLabel:N,timelineLabelSkip:D,togglePause:L,clearLogs:Q,exportLogs:ue,logLineClass:X,levelClass:ge,levelChipClass:me,toggleLevel:te,copyLine:H,jumpToBottom:K,onScroll:ve,onUserScrollIntent:_e,onUserScrollKey:Fe,onAutoScrollToggle:ie,onPointerDown:$,applyLogPreset:we,applyCustomLogPreset:Ee,saveLogCustomPreset:$e,removeLogCustomPreset:We,segmentHeight:de,jumpToTimelineBucket:B,searchLevel:He,searchTool:Ve,searchKeyword:Ze,searchStart:st,searchEnd:Qe,searchTimePreset:ee,searchLimit:Se,searchLimits:Re,searching:be,searchRan:ne,searchError:Le,searchResults:Me,searchStats:ot,expandedSearch:ss,switchToSearch:Xe,runSearch:fa,clearSearchFilters:as,toggleSearchExpand:Zs,formatSearchTs:ns,searchEntryText:la,searchLogLineClass:Is,formatJson:Ra,applySearchTimePreset:Ft}}};function Ro(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const D1=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function P1(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const Mi=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],$1={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Io=new Set(["llm_provider","openai_codex","ollama","openai_compatible","kimi","personality","discord","computer"]),F1=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function vf(e){return F1.some(t=>e===t||e.startsWith(`${t}.`))}const og="odin_config_center_expanded_v1",rg="odin_config_center_category_v1",U1=50,B1=650,dl=()=>j.get("/api/config/meta");function Dn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Si(e,t){return JSON.stringify(e)===JSON.stringify(t)}function hi(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function z1(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function H1(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function cg(e,t){if(Si(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Dn(t);const a={};for(const[n,i]of Object.entries(t)){const l=cg(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function j1(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=cg(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function dg(e,t,s,a){if(Si(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)dg(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function V1(){try{const e=JSON.parse(localStorage.getItem(og)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function q1(){try{const e=localStorage.getItem(rg);return Mi.some(t=>t.key===e)?e:Mi[0].key}catch{return Mi[0].key}}const G1={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=f(!1),o=f(""),r=f(!1),c=f(""),d=f(""),u=f("");function p(S){i.value=S||null,S&&typeof S.authorized=="boolean"&&(l.value=S.authorized)}async function m(){try{const S=await j.get("/api/setup/status");p(S.listener),u.value=""}catch(S){p(null),u.value=`Listener status could not be loaded: ${S.message||"Unknown error"}`}}async function h(){if(!(!ie.value||!o.value.trim()||r.value||G.value)){r.value=!0,c.value="",d.value="";try{const S=j.setListenerExposure(o.value.trim(),l.value);o.value="";const q=await S;c.value=q.message,p(q.listener)}catch(S){d.value=S.message||"Listener consent could not be saved."}finally{o.value="",r.value=!1}}}const g=f(null),R=["image_model","outer_model"],O=f(null),x=f(null),b=f(null),y=f(!1),_=f(!1),k=f(null),T=f(""),A=f("all"),w=f(q1()),I=f(V1()),U=f({}),C=f({}),F=f(""),Z=f({}),W=f({}),P=f([]),N=f([]),D=f(!1),oe=f(!1),de=f(!1);let B=null,Y=null,re={path:null,at:0},J=0;const he=V(()=>{var S;return(((S=t.value)==null?void 0:S.fields)||[]).filter(q=>!Io.has(q.path.split(".")[0])&&!vf(q.path))}),fe=V(()=>new Map(he.value.map(S=>[S.path,S]))),K=V(()=>Fe.value.reduce((S,q)=>S+q.sections.length,0)),pe=V(()=>he.value.length),ve=V(()=>D1),ye=V(()=>P.value.length>0),_e=V(()=>N.value.length>0),Fe=V(()=>{if(!e.value)return[];const S=new Set(Mi.flatMap(ke=>ke.sections)),q=Mi.map(ke=>({...ke,sections:ke.sections.filter(Ge=>Object.hasOwn(e.value,Ge)&&!Io.has(Ge))})).filter(ke=>ke.sections.length),ae=Object.keys(e.value).filter(ke=>!S.has(ke)&&!Io.has(ke));return ae.length&&q.push({key:"other",label:"Other",icon:"folder",sections:ae}),q}),E=V(()=>e.value?{...e.value,...U.value}:null),$=V(()=>{if(!e.value)return[];const S=[];for(const[q,ae]of Object.entries(U.value))dg(e.value[q],ae,q,S);return S.filter(q=>!Si(q.oldVal,q.newVal)).map(q=>{const ae=st(q.path);return{...q,label:(ae==null?void 0:ae.label)||hi(q.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||Le(q.path.split(".")[0])}})}),G=V(()=>$.value.length>0),ie=V(()=>!!i.value&&l.value!==i.value.authorized),L=V(()=>{var q;const S=(q=i.value)==null?void 0:q.state;return S==="active"||S==="authorized_loopback"?"active":["pending_widening","pending_narrowing","active_rebind_pending"].includes(S)?"pending":S==="restricted"?"restricted":"unknown"}),Q=V(()=>{var S;return{active:"Exposure active",authorized_loopback:"Authorized · loopback host",pending_widening:"Authorized · restart pending",pending_narrowing:"Restriction saved · restart pending",active_rebind_pending:"Exposed · restart pending",restricted:"Loopback only",unknown:"Runtime state unavailable"}[(S=i.value)==null?void 0:S.state]||"Loading listener state"}),ue=V(()=>i.value?i.value.authorized?i.value.authorization_source==="explicit"?"Beyond-loopback access is explicitly authorized":"Beyond-loopback access is retained from this installation":"Beyond-loopback access is not authorized":"Unavailable"),H=V(()=>{var S;return{explicit:"saved explicitly in config.yml",default:"schema default; no web.host key is saved",unknown:"source could not be verified"}[(S=i.value)==null?void 0:S.configured_host_source]||"source unavailable"}),te=V(()=>{const S=i.value;return!S||S.running_scope==="unavailable"?"Actual bound address unavailable":`${(S.listening_hosts||[]).map((ae,ke)=>{var ht;const Ge=(ht=S.listening_ports)==null?void 0:ht[ke];return Ge?`${ae}:${Ge}`:ae}).join(", ")} · ${S.running_scope==="loopback"?"loopback only":"accepting beyond loopback"}`}),X=V(()=>$.value.length),ge=V(()=>new Set($.value.map(S=>S.path.split(".")[0])).size),me=V(()=>!!T.value||A.value!=="all"),we=V(()=>{const S={...W.value};for(const q of $.value){const ae=st(q.path),ke=ce(ae,q.newVal);ke&&(S[q.path]=ke)}return S}),Ee=V(()=>Object.keys(we.value).length>0),$e=V(()=>e.value?(me.value?Fe.value:Fe.value.filter(q=>q.key===w.value)).map(q=>({...q,sections:q.sections.filter(ae=>Ys(ae))})).filter(q=>q.sections.length):[]),We=V(()=>{const S=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],q=new Map(S.map(ae=>[ae,[]]));for(const ae of $.value){const ke=q.has(ae.apply_mode)?ae.apply_mode:"restart";q.get(ke).push(ae)}return S.filter(ae=>q.get(ae).length).map(ae=>({key:ae,label:Ut(ae),entries:q.get(ae)}))}),He=V(()=>$.value.filter(S=>S.apply_mode==="restart").length),Ve=V(()=>he.value.filter(S=>S.pending_restart)),Ze=V(()=>Ve.value.length);function st(S){const q=fe.value.get(S);return q?{...q,apply_details:Ro([q])}:null}function Qe(S){const q=`${S}.`;return he.value.filter(ae=>ae.path===S||ae.path.startsWith(q))}function ee(){return he.value.some(S=>S.path==="tools.hosts"||S.path.startsWith("tools.hosts."))}function Se(){var ae,ke;const S=((ke=(ae=e.value)==null?void 0:ae.tools)==null?void 0:ke.hosts)||{},q=Object.keys(S).length;return`${q} host${q===1?"":"s"} configured.`}function Re(S){return Qe(S).length}function be(S){return hi(S)}function ne(S){const q=Qe(S);if(!q.length)return`${hi(S)} configuration.`;const ae=q.find(ht=>ht.sensitivity==="public"&&ht.description)||q.find(ht=>ht.description),ke=(ae==null?void 0:ae.description)||"";return ke.match(/setting for (.+)\.$/i)?`${hi(S)} settings and runtime behaviour.`:ke}function Le(S){const q=[...new Set(Qe(S).map(ae=>ae.apply_mode))];return q.length===1?q[0]:q.includes("restart")?"restart":q.includes("activation_required")?"activation_required":q[0]||"restart"}function Me(S){const q=[...new Set(Qe(S).map(ae=>Ut(ae.apply_mode)))];return q.length?q.length===1?q[0]:`Mixed apply behaviour: ${q.join(" · ")}`:""}function ot(S){return Ro(Qe(S))}function ss(S){var q;return Object.hasOwn(U.value,S)?U.value[S]:(q=e.value)==null?void 0:q[S]}function Xe(){const S=ss("mcp")||{},q=Object.keys(S.servers||{}).length;return`${S.enabled?"Globally enabled":"Globally disabled"} · ${q} configured server${q===1?"":"s"}.`}function Ot(S,q){return q.split(".").reduce((ae,ke)=>ae==null?void 0:ae[ke],S)}function Ft(S){const q=E.value;return Qe(S).filter(ae=>vf(ae.path)?!1:ae.path.split(".").length<=2?!0:!ae.path.includes(".*")).map(ae=>({...ae,key:ae.path.split(".").at(-1),value:Ot(q,ae.path),apply_details:Ro([ae]),editor:ae.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Rs(S){const q=S.path.split(".");return q.length>2?q.slice(0,2).join("."):null}function pa(S){const q=new Map;for(const ae of Ft(S)){const ke=Rs(ae),Ge=ke||`${S}.__root`;q.has(Ge)||q.set(Ge,{key:Ge,path:ke,entries:[]}),q.get(Ge).entries.push(ae)}return[...q.values()].map(ae=>{const ke=ae.entries.find(Ge=>Ge.group_description);return{...ae,label:ae.path?hi(ae.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:Ro(ae.entries),runtime_summaries:as(ae.entries)}})}function fa(S){return{save:S.save_effect||(S.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:S.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[S.apply_mode]||"Effective runtime state is not currently observable."}}function as(S){const q=new Map;for(const ae of S){const ke=fa(ae),Ge=`${ae.apply_mode}|${ke.save}|${ke.runtime}`;q.has(Ge)||q.set(Ge,{key:Ge,label:Ut(ae.apply_mode),save:ke.save,runtime:ke.runtime})}return[...q.values()]}function Zs(S){if(ns(S))return S.runtime_effect||S.activation_policy||"";if(S.apply_mode==="activation_required"){const q=S.activation_policy||S.runtime_effect;return q?`Not active after saving. No activation control exists in this release. ${q}`:"Not active after saving; no activation control exists in this release."}return""}function ns(S){return S.action_available===!0&&!!(S.action_label&&S.action_endpoint)}async function la(S){if(ns(S))try{if(Ae(S.path))throw new Error("Save this setting before applying its action.");const q=String(S.action_method||"POST").toLowerCase(),ae={post:j.post.bind(j),put:j.put.bind(j),delete:j.del.bind(j)}[q];if(!ae)throw new Error("Unsupported configuration action");await ae(S.action_endpoint,S.action_body||void 0),await Qi(),$a("success",`${S.action_label} completed.`)}catch(q){$a("error",q.message||`${S.action_label} failed`)}}function Is(S,q){return[S.label,S.path,S.description,...S.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(q)}function Ra(S){const q=T.value.trim().toLowerCase();return q?Qe(S).filter(ae=>Is(ae,q)):[]}function Ys(S){const q=Qe(S);if(A.value!=="all"&&!q.some(ke=>ke.apply_state===A.value))return!1;const ae=T.value.trim().toLowerCase();return!ae||`${be(S)} ${S}`.toLowerCase().includes(ae)?!0:q.some(ke=>Is(ke,ae))}function ut(S,q){return Qe(S).filter(ae=>ae.apply_state===q).length}function Bs(S){return S==="all"?pe.value:he.value.filter(q=>q.apply_state===S).length}function Ia(S){const q=S.sections.flatMap(ae=>Qe(ae));return{fields:q.length,modified:$.value.filter(ae=>S.sections.includes(ae.path.split(".")[0])).length,pending_restart:q.filter(ae=>ae.apply_state==="pending_restart").length,invalid:q.filter(ae=>ae.apply_state==="invalid").length,dormant:q.filter(ae=>ae.apply_state==="dormant").length}}function le(S){var q;return Object.hasOwn(U.value,S)&&!Si((q=e.value)==null?void 0:q[S],U.value[S])}function Ae(S){return $.value.some(q=>q.path===S||q.path.startsWith(`${S}.`))}function Je(S){w.value=S,T.value="",A.value="all";try{localStorage.setItem(rg,S)}catch{}}function it(S){A.value=S}function kt(){T.value="",A.value="all"}function mt(S){var q;return((q=Fe.value.find(ae=>ae.sections.includes(S)))==null?void 0:q.sections)||[]}function Oa(S){const q=mt(S),ae=q.find(ke=>I.value[ke]===!0);return ae||q.find(ke=>I.value[ke]!==!1)||null}function zs(S){return T.value&&!de.value&&Ys(S)?!0:de.value?Oa(S)===S:Object.hasOwn(I.value,S)?I.value[S]===!0:!0}function Zi(S){const q=!zs(S);if(de.value){const ae={...I.value};for(const ke of mt(S))ae[ke]===!0&&(ae[ke]=!1);ae[S]=q,I.value=ae;return}I.value={...I.value,[S]:q}}function ti(){P.value.push(Dn(U.value)),P.value.length>U1&&P.value.shift(),N.value=[]}function is(){n.value||G.value&&(ti(),U.value={},W.value={},D.value=!1)}function si(S,q=!1){const ae=Date.now();if(q&&re.path===S&&ae-re.at<B1){re.at=ae;return}ti(),re={path:S,at:ae}}function La(S,q,ae){if(!q.length)return ae;const ke=Dn(S??{});let Ge=ke;for(let ht=0;ht<q.length-1;ht+=1){const _s=q[ht];Ge[_s]=Dn(Ge[_s]??{}),Ge=Ge[_s]}return Ge[q.at(-1)]=ae,ke}function dn(S){var q;return Object.hasOwn(U.value,S)?U.value[S]:Dn((q=e.value)==null?void 0:q[S])}function Qt(S,q,ae={}){var Fa;if(n.value||Io.has(S.path.split(".")[0]))return;const[ke,...Ge]=S.path.split(".");si(S.path,!!ae.coalesce);const ht=dn(ke),_s=Ge.length?La(ht,Ge,q):q,Os={...U.value};if(Si(_s,(Fa=e.value)==null?void 0:Fa[ke])?delete Os[ke]:Os[ke]=_s,U.value=Os,W.value[S.path]){const ha={...W.value};delete ha[S.path],W.value=ha}}function Na(S){re={path:null,at:0},C.value={...C.value,[S]:String(Ot(E.value,S)??"")}}function xs(S){if(re={path:null,at:0},!Object.hasOwn(C.value,S))return;const q={...C.value};delete q[S],C.value=q}function ai(S){const q=C.value[S.path];if(re={path:null,at:0},q===""){if(S.nullable){xs(S.path),Qt(S,null,{coalesce:!0});return}W.value={...W.value,[S.path]:"Enter a number."};return}const ae=Number(q);if(Number.isNaN(ae)||S.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[S.path]:S.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...C.value};delete ke[S.path],C.value=ke,Qt(S,ae,{coalesce:!0})}function ni(S){return Object.hasOwn(C.value,S.path)?C.value[S.path]:S.value??""}function un(S,q){if(C.value={...C.value,[S.path]:q},q===""){if(S.nullable){Qt(S,null,{coalesce:!0});return}W.value={...W.value,[S.path]:"Enter a number."};return}const ae=Number(q);if(!Number.isFinite(ae)||S.type==="integer"&&!Number.isInteger(ae)){W.value={...W.value,[S.path]:S.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(W.value[S.path]){const ke={...W.value};delete ke[S.path],W.value=ke}Qt(S,ae,{coalesce:!0})}function Ma(S){const q=Number.parseInt(F.value,10);if(!Number.isInteger(q)||q<1){W.value={...W.value,[S.path]:"Warning thresholds must be positive whole numbers."};return}const ae=[...new Set([...S.value||[],q])].sort((ke,Ge)=>Ge-ke);F.value="",Qt(S,ae)}function En(S,q){Qt(S,(S.value||[]).filter(ae=>ae!==q))}function Da(S){return S.apply_mode==="live_read"?"Odin reads the saved file value on next use.":S.apply_mode==="live_for_new_work"?"New work uses the saved file value.":S.apply_mode==="live_apply"?S.apply_handler?`Apply the saved value through ${S.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":S.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":S.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":S.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function pn(S){return S.type==="array"&&Array.isArray(S.value)&&!S.structured_container&&!S.structured_container_child&&S.sensitivity==="public"&&S.value.every(q=>["string","number","boolean"].includes(typeof q))}function Ie(S){const q=String(Z.value[S.path]??"").trim();if(!q)return;const ae=[...new Set([...S.value||[],q])];Z.value={...Z.value,[S.path]:""},Qt(S,ae)}function M(S,q){Qt(S,(S.value||[]).filter(ae=>ae!==q))}function ce(S,q){var ke;if(!S)return null;if((ke=S.enum)!=null&&ke.length&&!S.enum.includes(q))return`Choose one of: ${S.enum.join(", ")}`;if(S.path==="agents.final_warning_iterations"&&(!Array.isArray(q)||!q.length))return"Add at least one warning threshold.";const ae=S.constraints||{};if((S.type==="integer"||S.type==="number")&&typeof q=="number"){if(ae.minimum!==void 0&&q<ae.minimum)return`Must be at least ${ae.minimum}${S.unit?` ${S.unit}`:""}`;if(ae.maximum!==void 0&&q>ae.maximum)return`Must be at most ${ae.maximum}${S.unit?` ${S.unit}`:""}`}return null}function xe(S){return we.value[S.path]||null}function Ue(S){const q=`${S}.`;return Object.keys(we.value).some(ae=>ae===S||ae.startsWith(q))}function je(){n.value||P.value.length&&(N.value.push(Dn(U.value)),U.value=P.value.pop(),W.value={},C.value={},re={path:null,at:0})}function qe(){n.value||N.value.length&&(P.value.push(Dn(U.value)),U.value=N.value.pop(),W.value={},C.value={},re={path:null,at:0})}function Lt(){!G.value||Ee.value||(D.value=!0,oe.value=!1)}function rt(){D.value=!1}function Tt(){is()}function Ut(S){return $1[S]||hi(S||"unknown")}function Nt(S){return`apply-${String(S||"unknown").replaceAll("_","-")}`}function Pa(S){return`cfgc-field-${S.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ma(S){return`${Pa(S)}-input`}function Zr(S){const q=document.getElementById(Pa(S))||document.getElementById(Pa(S.split(".").slice(0,2).join(".")));q==null||q.scrollIntoView({behavior:"smooth",block:"center"})}function $a(S,q){x.value={type:S,message:q},window.setTimeout(()=>{var ae;((ae=x.value)==null?void 0:ae.message)===q&&(x.value=null)},3500)}function Yr(){y.value=!1,A.value="pending_restart",T.value="";const S=P1(a.value);S&&(S.scrollTop=0)}function Qr(){y.value=!1}function co(S=1800){Y&&window.clearTimeout(Y),Y=window.setTimeout(Yi,S)}async function Yi(){if(_.value){if(J+=1,J>45){_.value=!1,k.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await dl(),Ze.value===0){_.value=!1,k.value=null,$a("success","Odin restarted and the saved startup settings are active.");return}}catch{}co(2e3)}}async function Xr(){if(!_.value){k.value=null;try{await j.post("/api/restart",{}),_.value=!0,J=0,y.value=!1,co()}catch(S){k.value=S.message||"Odin could not schedule a restart."}}}async function An(){if(!(!G.value||Ee.value||n.value)){n.value=!0;try{const S=j1(e.value,U.value),q=await j.put("/api/config",S);e.value=q,U.value={},P.value=[],N.value=[],W.value={},D.value=!1;try{t.value=await dl(),b.value=null,y.value=Ze.value>0,$a("success",Ze.value?`Configuration saved. ${Ze.value} setting${Ze.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ae){b.value=ae.message||"Unknown metadata error.",$a("error",`Configuration saved, but apply status could not be refreshed: ${b.value}`)}}catch(S){$a("error",S.message||"Configuration could not be saved")}finally{n.value=!1}}}async function ii(){if(!n.value){n.value=!0,g.value=null;try{t.value=await dl(),b.value=null}catch(S){g.value=`Image model status could not be refreshed: ${S.message||"Unknown error"}`}finally{n.value=!1}}}async function ec(S,q){if(n.value||!["follow","pin"].includes(q)||!S.length||S.some(ke=>{var Ge,ht;return!R.includes(ke)||!((ht=(Ge=t.value)==null?void 0:Ge.image_model_defaults)!=null&&ht[ke])}))return;n.value=!0,g.value=null;let ae=!1;try{const ke=await j.post("/api/config/image-models",{operations:Object.fromEntries(S.map(Ge=>[Ge,q])),expected_revision:t.value.image_model_revision});ae=!0;for(const Ge of S){const ht=`image.openai.${Ge}`,_s=Ot(e.value,ht),Os=Ot(ke.config,ht),Fa=ha=>!Object.hasOwn(ha,"image")||!Si(Ot(ha,ht),_s)?ha:La(ha,ht.split("."),Os);U.value=Fa(U.value),P.value=P.value.map(Fa),N.value=N.value.map(Fa),e.value=La(e.value,ht.split("."),Os)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},$a("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){g.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await dl(),b.value=null}catch(ke){const Ge=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;b.value=Ge,g.value=ae?`Image model defaults were saved, but ${Ge}`:`${g.value} ${Ge}`}finally{n.value=!1}}async function Qi(){var S,q;if(!(G.value||n.value)){s.value=!0,O.value=null;try{const ae=await j.get("/api/config"),ke=await dl();await m(),e.value=ae,t.value=ke,b.value=null;const Ge=Fe.value;if(Ge.some(ht=>ht.key===w.value)||(w.value=((S=Ge[0])==null?void 0:S.key)||Mi[0].key),de.value){const _s=(((q=Ge.find(Os=>Os.key===w.value))==null?void 0:q.sections)||[]).find(Os=>I.value[Os]===!0);I.value=_s?{...I.value,[_s]:!0}:{}}}catch(ae){O.value=ae.message||"Unknown configuration error"}finally{s.value=!1}}}function li(S){if(D.value||!(S.ctrlKey||S.metaKey))return;const q=S.target;q instanceof HTMLElement&&(q.matches("input, textarea, select")||q.isContentEditable)||(!S.shiftKey&&S.key.toLowerCase()==="z"?(S.preventDefault(),je()):(S.key.toLowerCase()==="y"||S.shiftKey&&S.key.toLowerCase()==="z")&&(S.preventDefault(),qe()))}function Xi(S){de.value=S.matches}Gt(I,S=>{try{localStorage.setItem(og,JSON.stringify(S))}catch{}},{deep:!0});let Rn=!1;function el(){Rn||(Rn=!0,document.addEventListener("keydown",li))}function In(){Rn&&(Rn=!1,document.removeEventListener("keydown",li))}return tt(()=>{var S;Qi(),el(),B=window.matchMedia("(max-width: 760px)"),Xi(B),(S=B.addEventListener)==null||S.call(B,"change",Xi)}),us(el),Yt(In),Yt(()=>{o.value=""}),xt(()=>{var S;o.value="",In(),(S=B==null?void 0:B.removeEventListener)==null||S.call(B,"change",Xi),Y&&window.clearTimeout(Y)}),{listenerState:i,listenerConsent:l,listenerCredential:o,listenerSaving:r,listenerMessage:c,listenerError:d,listenerStatusError:u,listenerChoiceChanged:ie,listenerStatusTone:L,listenerStatusLabel:Q,listenerAuthorizationCopy:ue,listenerConfiguredSourceCopy:H,listenerRunningCopy:te,saveListenerConsent:h,armKeydown:el,disarmKeydown:In,handleKeydown:li,config:e,meta:t,loading:s,saving:n,error:O,toast:x,metaRefreshError:b,restartPromptOpen:y,restartScheduled:_,restartError:k,configMain:a,imageModelError:g,imageModelLeaves:R,setImageModelDefaults:ec,refreshImageModelMetadata:ii,searchQuery:T,healthFilter:A,activeCategory:w,reviewOpen:D,mobileOverflowOpen:oe,warningThresholdInput:F,arrayInputs:Z,healthFilters:ve,visibleCategories:Fe,displayGroups:$e,reviewGroups:We,sectionCount:K,fieldCount:pe,hasChanges:G,changeCount:X,changedSectionCount:ge,hasDraftErrors:Ee,canUndo:ye,canRedo:_e,globalFilterActive:me,reviewRestartCount:He,pendingRestartCount:Ze,pendingRestartFields:Ve,healthCount:Bs,categoryStats:Ia,selectCategory:Je,selectHealthFilter:it,clearFilters:kt,sectionLabel:be,sectionDescription:ne,sectionFieldCount:Re,sectionHealthCount:ut,sectionApplySummary:Me,sectionApplyDetails:ot,sectionEntries:Ft,fieldGroups:pa,sectionSearchHits:Ra,mcpConfigSummary:Xe,fieldRuntimeCopy:fa,fieldSpecificRuntimeNote:Zs,hasHonestAction:ns,runFieldAction:la,hasHostsCollection:ee,hostsConfigSummary:Se,sectionChanged:le,fieldChanged:Ae,isSectionExpanded:zs,toggleSection:Zi,discardAllDrafts:is,setFieldValue:Qt,setNumberFieldValue:un,numberInputValue:ni,beginInputEdit:Na,endTextInputEdit:xs,endInputEdit:ai,addWarningThreshold:Ma,removeWarningThreshold:En,isScalarArray:pn,addScalarArrayItem:Ie,removeScalarArrayItem:M,fieldError:xe,sectionHasErrors:Ue,undo:je,redo:qe,openReview:Lt,closeReview:rt,mobileCancel:Tt,applyModeLabel:Ut,applyClass:Nt,compactValue:z1,formatValue:H1,structuredApplyCopy:Da,fieldId:Pa,fieldInputId:ma,focusField:Zr,fetchConfig:Qi,saveConfig:An,restartOdin:Xr,restartLater:Qr,reviewPendingRestart:Yr}}},W1=/^\d{15,25}$/;function ug(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const pg={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=V(()=>new Set((e.excludedIds||[]).map(String))),o=V(()=>{const _=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:_?u(k).toLowerCase().includes(_)||String(k.username||"").toLowerCase().includes(_)||String(k.id).includes(_):!0)}),r=V(()=>{const _=s.value.trim();return o.value.length===0&&W1.test(_)&&!l.value.has(_)?_:""}),c=V(()=>o.value.length+(r.value?1:0)),d=V(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(_){return ug(_)}function p(){a.value=!0,n.value=0}function m(){p()}function h(){const _=Math.max(c.value-1,0);n.value=Math.min(n.value+1,_)}function g(){n.value=Math.max(n.value-1,0)}function R(){const _=o.value[n.value];_?O(_):r.value&&n.value===o.value.length&&x(r.value)}function O(_){x(String(_.id))}function x(_){t("select",_),s.value="",a.value=!1,n.value=0}function b(){a.value=!1}function y(){setTimeout(b,150)}return tt(()=>{e.autofocus&&zt(()=>{var _;return(_=i.value)==null?void 0:_.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:m,highlightNext:h,highlightPrevious:g,selectHighlighted:R,selectMember:O,selectId:x,closeOptions:b,onBlur:y}}};function gf(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const K1={components:{DiscordUserCombobox:pg},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),m=f({}),h=f([]);let g=0;const R=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),O=V(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),x=V(()=>new Map(h.value.map(fe=>[String(fe.id),fe])));function b(fe){return fe.config&&fe.config.enabled!==void 0?fe.config.enabled:!0}function y(fe){return gf(fe,"require_mention",c.value)}function _(fe){return gf(fe,"respond_to_bots",c.value)}function k(fe){return fe.config&&Object.keys(fe.config).length>0}function T(fe){r.value[fe]=!r.value[fe]}function A(fe){const K=fe.discord||{};return{allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]}}async function w({showLoading:fe=!0}={}){const K=++g;fe&&(l.value=!0),o.value=null;try{const pe=await j.get("/api/discord/guilds");K===g&&(e.value=pe)}catch(pe){K===g&&(o.value=pe.message)}finally{fe&&K===g&&(l.value=!1)}}async function I(){try{t.value=await j.get("/api/discord/connection"),n.value=null}catch(fe){n.value=fe.message}}async function U(fe,K=null){if(!a.value){a.value=!0,n.value=null;try{const pe={operation:fe};K!==null&&(pe.token=K),t.value=await j.post("/api/discord/connection",pe),fe==="credentials"&&(s.value="")}catch(pe){n.value=pe.message||"Connection update failed."}finally{a.value=!1}}}function C(){return U("credentials",s.value)}function F(){return U("connect")}function Z(){return U("detach")}async function W(){l.value=!0,o.value=null;try{const[fe,K,pe]=await Promise.all([j.get("/api/discord/guilds"),j.get("/api/discord/members").catch(()=>[]),j.get("/api/config")]),ve=A(pe),ye=O.value;c.value=ve,ye||(d.value=JSON.parse(JSON.stringify(ve))),h.value=K,e.value=fe,p.value=null}catch(fe){o.value=fe.message}finally{l.value=!1}}let P=Promise.resolve();const N=f(new Set);function D(fe,K){const pe=new Set(N.value);pe.add(fe),N.value=pe;const ve=P.then(K);return P=ve.catch(()=>{}),ve.finally(()=>{const ye=new Set(N.value);ye.delete(fe),N.value=ye})}function oe(fe,K,pe,ve){const ye=(ve==null?void 0:ve.target)??null;return D(`guild:${fe}:${K}`,async()=>{try{await j.put("/api/discord/guild/"+fe+"/config",{[K]:pe}),await w({showLoading:!1})}catch(_e){o.value=_e.message,ye&&typeof pe=="boolean"&&(ye.checked=!pe)}})}function de(fe,K,pe,ve,ye){const _e=(ye==null?void 0:ye.target)??null;return D(`channel:${fe}:${pe}`,async()=>{try{await j.put("/api/discord/channel/"+fe+"/config",{[pe]:ve}),await w({showLoading:!1})}catch(Fe){o.value=Fe.message,_e&&typeof ve=="boolean"&&(_e.checked=!ve)}})}function B(fe,K){return D(`channel:${fe}:clear`,async()=>{try{await j.put("/api/discord/channel/"+fe+"/config",{clear:!0}),await w({showLoading:!1})}catch(pe){o.value=pe.message}})}function Y(fe,K){const pe=String(K);if(!fe.userAutocomplete)return pe;const ve=x.value.get(pe);return ve?ug(ve):pe}function re(fe,K=null){const pe=String(K??m.value[fe]??"").trim();!pe||d.value[fe].includes(pe)||(d.value[fe]=[...d.value[fe],pe],m.value={...m.value,[fe]:""})}function J(fe,K){d.value[fe]=d.value[fe].filter(pe=>pe!==K)}async function he(){if(!(!O.value||u.value)){u.value=!0,p.value=null;try{const K=(await j.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...K.allowed_users||[]],channels:[...K.channels||[]],respond_to_bots:!!K.respond_to_bots,require_mention:!!K.require_mention,ignore_bot_ids:[...K.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(fe){p.value=fe.message||"Global defaults could not be saved."}finally{u.value=!1}}}return tt(()=>{W(),I(),i=window.setInterval(I,5e3)}),xt(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:m,globalMembers:h,globalListEditors:R,globalChanged:O,guildEnabled:b,guildMention:y,guildBots:_,hasOverride:k,toggleGuild:T,fetchAll:W,fetchGuilds:w,setGuildConfig:oe,setChannelConfig:de,clearOverride:B,mutationPending:N,globalItemLabel:Y,addGlobalItem:re,removeGlobalItem:J,saveGlobalDefaults:he,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:C,connectDiscord:F,detachDiscord:Z}}},Vs=e=>e==null?e:JSON.parse(JSON.stringify(e));function J1({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let m=null;const h=new Map;function g(k){d+=1;const T=c.then(k,k);return c=T.catch(()=>{}),T}function R(k,T){m=Vs(k),h.clear();for(const[A,w]of Object.entries(T||{}))h.set(A,Vs(w))}function O(k){const T=Vs(k),A=++u;return g(async()=>{try{await e(Vs(T)),m=Vs(T),A===u&&a(Vs(T))}catch(w){A===u&&(n(Vs(m)),r(w,{kind:"default"}))}})}function x(k,T){const A=Vs(T),w=(p.get(k)||0)+1;return p.set(k,w),g(async()=>{try{await t(k,Vs(A)),h.set(k,Vs(A)),w===p.get(k)&&i(k,Vs(A))}catch(I){w===p.get(k)&&(l(k,Vs(h.get(k)??null)),r(I,{kind:"user",uid:k}))}})}function b(k){const T=(p.get(k)||0)+1;return p.set(k,T),g(async()=>{try{await s(k),h.delete(k),T===p.get(k)&&o(k)}catch(A){T===p.get(k)&&(l(k,Vs(h.get(k)??null)),r(A,{kind:"delete",uid:k}))}})}async function y(){for(;;){const k=c;if(await k,k===c)return d}}async function _(k){for(;;){const T=await y(),A=await k();if(T===d)return A}}return{seed:R,saveDefault:O,saveUser:x,deleteUser:b,whenIdle:y,readSnapshot:_,get revision(){return d}}}const Z1={components:{DiscordUserCombobox:pg},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=V(()=>{const C={};for(const F of r.value)C[F.id]=F;return C});function d(C){return c.value[C]||null}function u(C,F){return C?C.allowed_hosts===null||C.allowed_hosts===void 0?{allowed_hosts:[...F],default_host:C.default_host||"",allow_all:!0}:{allowed_hosts:C.allowed_hosts,default_host:C.default_host||"",allow_all:!1}:{allowed_hosts:[...F],default_host:F[0]||"",allow_all:!0}}const p=J1({applyDefault:async C=>{const F=C.allow_all?null:C.allowed_hosts;await j.put("/api/host-access/default-policy",{allowed_hosts:F,default_host:C.default_host})},applyUser:async(C,F)=>{const Z=F.allow_all?null:F.allowed_hosts;await j.put(`/api/host-access/user/${C}`,{allowed_hosts:Z,default_host:F.default_host})},applyDelete:C=>j.del(`/api/host-access/user/${C}`),onDefaultConfirmed:()=>Ce.success("Default policy updated"),onDefaultRollback:C=>{C&&(i.value=C)},onUserConfirmed:C=>{const F=d(C);Ce.success(`Updated access for ${F?F.display_name:C}`)},onUserRollback:(C,F)=>{const Z={...l.value};F?Z[C]=F:delete Z[C],l.value=Z},onUserDeleted:C=>{const F={...l.value};delete F[C],l.value=F},onError:(C,F)=>{var W;const Z=F.uid?` ${((W=d(F.uid))==null?void 0:W.display_name)||F.uid}`:"";Ce.error(`${C.message||"Failed to save"} — reverted${Z}`)}});let m=0;async function h(){const C=++m;e.value=!0,t.value="";try{const F=await p.readSnapshot(()=>j.get("/api/host-access"));if(C!==m)return;s.value=F,a.value=F.available_hosts||[],n.value=F.host_descriptions||{},i.value=u(F.default_policy,a.value);const Z=F.users||{},W={};for(const[P,N]of Object.entries(Z))W[P]=u(N,a.value);l.value=W,p.seed(i.value,W)}catch(F){C===m&&(t.value=F.message||"Failed to fetch host access data")}finally{C===m&&(e.value=!1)}try{const F=await j.get("/api/discord/members")||[];C===m&&(r.value=F)}catch{C===m&&(r.value=[])}}const g=500,R=new Map;function O(C,F){const Z=R.get(C);Z&&clearTimeout(Z.timer);const W={run:F,timer:null};W.timer=setTimeout(()=>{R.delete(C),F()},g),R.set(C,W)}function x(C){const F=R.get(C);F&&(clearTimeout(F.timer),R.delete(C))}function b(){for(const[C,F]of[...R])clearTimeout(F.timer),R.delete(C),F.run()}function y(){O("default",()=>p.saveDefault(i.value))}function _(C,F){i.value.allow_all=!1,F?i.value.allowed_hosts.includes(C)||i.value.allowed_hosts.push(C):(i.value.allowed_hosts=i.value.allowed_hosts.filter(Z=>Z!==C),i.value.default_host===C&&(i.value.default_host=i.value.allowed_hosts[0]||"")),y()}function k(C){O(`user:${C}`,()=>{const F=l.value[C];F&&p.saveUser(C,F)})}function T(C,F,Z){const W=l.value[C];W&&(W.allow_all=!1,Z?W.allowed_hosts.includes(F)||W.allowed_hosts.push(F):(W.allowed_hosts=W.allowed_hosts.filter(P=>P!==F),W.default_host===F&&(W.default_host=W.allowed_hosts[0]||"")),k(C))}function A(C,F){const Z=l.value[C];Z&&(Z.default_host=F,k(C))}function w(){o.value=!0}function I(C){!/^\d{15,25}$/.test(C)||l.value[C]||(l.value[C]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(C,l.value[C]),o.value=!1)}async function U(C){const F=d(C);await ts({title:"Remove user override",message:`Remove the host access override for ${F?F.display_name:C}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(x(`user:${C}`),await p.deleteUser(C),l.value[C]||Ce.success(`Removed override for ${F?F.display_name:C}`))}return tt(h),Yt(b),xt(b),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:h,saveDefaultPolicy:y,toggleDefaultHost:_,getMember:d,toggleUserHost:T,setUserDefault:A,openAddUser:w,addUserById:I,deleteUser:U,flushPendingSaves:b}}},Y1={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),m=f(null),h=f(""),g=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),R=f(g()),O=V(()=>["127.0.0.1","localhost","::1"].includes(R.value.address));async function x(){t.value=!0,s.value="";try{const W=await j.get("/api/hosts");e.value=W.hosts||[],o.value=W.default_host||"",r.value=!!W.tofu_enabled}catch(W){s.value=W.message}finally{t.value=!1}}async function b(){try{await j.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),Ce.success("Host settings saved and published live"),await x()}catch(W){Ce.error(W.message)}}function y(){d.value="",u.value=[],p.value=!1,m.value=null,c.value=null,h.value="",l.value=1,n.value=!0}function _(){i.value=!1,R.value=g(),y()}function k(W){i.value=!0,R.value={...g(),...W},y()}async function T(){try{c.value=await j.get("/api/hosts/public-key")}catch(W){Ce.error(W.message)}}async function A(W){try{const P=await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/import-legacy",{});i.value=!0,R.value={...g(),...W,trust_mode:"pinned"},y(),d.value=P.candidate_token,u.value=P.fingerprints||[],h.value=u.value.join(`
`),l.value=4,Ce.info("Imported existing known_hosts trust. Test before activation.")}catch(P){Ce.error(P.message)}}async function w(){try{const W=h.value.split(/\s+/).filter(Boolean),P={...R.value,expected_fingerprints:W,candidate_fingerprints:u.value},N=await j.post("/api/hosts/candidates",P);if(d.value=N.candidate_token,u.value=N.fingerprints||[],R.value.trust_mode==="tofu"&&P.candidate_fingerprints.length===0){R.value.confirm_tofu=!1,Ce.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(W){Ce.error(W.message)}}async function I(){var W,P;p.value=!1,m.value=null;try{const N=await j.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!N.tested,m.value=N.last_test,p.value&&(l.value=5)}catch(N){const D=(W=N.data)==null?void 0:W.last_test;D&&typeof D=="object"&&!Array.isArray(D)&&(m.value=D);const oe=(P=m.value)==null?void 0:P.detail;Ce.error(typeof oe=="string"&&oe.trim()?oe:N.message)}}async function U(){try{await j.post("/api/hosts/candidates/"+d.value+"/commit",{}),Ce.success("Host saved and published live"),n.value=!1,await x()}catch(W){Ce.error(W.message)}}async function C(W){try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/enabled",{enabled:!W.enabled}),await x()}catch(P){Ce.error(P.message)}}async function F(W){var P;if(await ts("Delete host "+W.alias+"? Dependencies will block deletion.")){a.value=[];try{await j.del("/api/hosts/"+encodeURIComponent(W.alias)),await x()}catch(N){a.value=Array.isArray((P=N.data)==null?void 0:P.pending_references)?N.data.pending_references:[],Ce.error(N.message)}}}async function Z(W){if(await ts("Force revoke "+W.alias+"? Remote outcomes may be unknown."))try{await j.post("/api/hosts/"+encodeURIComponent(W.alias)+"/force-revoke",{}),await x()}catch(P){Ce.error(P.message)}}return tt(x),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:R,isLocal:O,keyInfo:c,candidate:d,observed:u,tested:p,testResult:m,fingerprintsText:h,load:x,saveSettings:b,beginAdd:_,beginEdit:k,loadKey:T,importLegacy:A,prepare:w,testConnection:I,commit:U,toggle:C,remove:F,forceRevoke:Z}}},Q1={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=V(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=V(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function m(A){return A==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":A==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function h(){e.value=!0,t.value="";try{const A=await j.get("/api/tokens");s.value=A.tokens||[],a.value=A.available_hosts||[]}catch(A){t.value=A.message||"Failed to load tokens"}finally{e.value=!1}}function g(A){return!A||!A.trim()?[]:A.split(",").map(w=>w.trim()).filter(Boolean)}function R(A,w){const I=c.value.allowed_hosts;if(w&&!I.includes(A)&&I.push(A),!w){const U=I.indexOf(A);U>=0&&I.splice(U,1)}}function O(A,w){const I=d.value.allowed_hosts;if(w&&!I.includes(A)&&I.push(A),!w){const U=I.indexOf(A);U>=0&&I.splice(U,1)}}async function x(){var A;i.value=!0;try{const w=g(c.value.allowed_tools_str),I=c.value.host_mode,U=I==="none"?[]:I==="select"?c.value.allowed_hosts:null,C={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};U!==null&&(C.allowed_hosts=U),C.default_host=c.value.default_host||"";const F=await j.post("/api/tokens",C);l.value=F.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,Ce.success("Token created"),await h()}catch(w){Ce.error(((A=w.data)==null?void 0:A.error)||w.message||"Failed to create token")}finally{i.value=!1}}function b(A){o.value=A;const w=A.allowed_hosts;let I="default";w==null?I="default":Array.isArray(w)&&w.length===0?I="none":Array.isArray(w)&&(I="select"),d.value={username:A.username||"",tier:A.tier||"admin",label:A.label||"",host_mode:I,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:A.default_host||"",allowed_tools_str:(A.allowed_tools||[]).join(", ")}}async function y(){var A;if(o.value){r.value=!0;try{const w=g(d.value.allowed_tools_str),I=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};I==="none"?U.allowed_hosts=[]:I==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await j.put("/api/tokens/"+encodeURIComponent(o.value.user_id),U),o.value=null,Ce.success("Token updated"),await h()}catch(w){Ce.error(((A=w.data)==null?void 0:A.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function _(A){var I;if(await ts({title:"Regenerate token",message:`Regenerate token for ${A.username||A.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await j.post("/api/tokens/"+encodeURIComponent(A.user_id)+"/regenerate");l.value=U.token,Ce.success("Token regenerated")}catch(U){Ce.error(((I=U.data)==null?void 0:I.error)||U.message||"Failed to regenerate")}}async function k(A){var I;if(await ts({title:"Delete token",message:`Delete token for ${A.username||A.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/tokens/"+encodeURIComponent(A.user_id)),Ce.success("Token deleted"),await h()}catch(U){Ce.error(((I=U.data)==null?void 0:I.error)||U.message||"Failed to delete")}}async function T(){if(l.value)try{await navigator.clipboard.writeText(l.value),Ce.success("Copied to clipboard")}catch{Ce.error("Copy failed — select and copy manually")}}return tt(h),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:h,tierBadge:m,toggleCreateHost:R,toggleEditHost:O,createToken:x,startEdit:b,saveEdit:y,confirmRegenerate:_,confirmDelete:k,copyToken:T}}},X1=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort"]),eC=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),tC=Object.freeze(["enabled","base_url","model","max_tokens"]),sC=Object.freeze(["enabled","base_url","model","max_tokens"]);function oo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function aC(e,t={}){const s=oo(e,sC);return t.includeApiKey&&(s.api_key=e.api_key),s}function nC(e){return oo(e,["timeout","preset","model_profiles","context_utilization","openrouter"])}function bf(e){return oo(e,X1)}function yf(e){return oo(e,eC)}function iC(e,{includeApiKey:t=!1}={}){const s=oo(e,tC);return t&&(s.api_key=e.api_key),s}function lC(e){return{timeout:e.timeout}}function Oo(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const oC={template:`
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
                  Per-spawn reasoning: low / medium / high / max. Each choice maps to the selected model's native capability; omission uses its allowlist default.
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
              <label class="text-xs text-gray-400 block">Model catalogue
              <select v-model="compatibleForm.model" @change="saveCompatibleConfigDebounced"
                      class="hm-input">
                <option v-if="!visibleCompatibleModels.length" value="" disabled>No models available</option>
                <option v-for="m in visibleCompatibleModels" :key="m" :value="m">{{ m }}</option>
              </select>
              </label>
              <p class="text-xs mt-1" :class="compatibleCatalogueStatusClass">{{ compatibleCatalogueStatus }}</p>
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({main:"",main_capability:"medium",agent_capability:"adaptive"}),n=f(""),i=["none","low","medium","high","xhigh","max"],l=["low","medium","high","max"],o=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),r=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],c=V(()=>{const v=t.value||{},z=v.model_catalogue||v.model_catalog||{},se=Pe=>{var ps,Et,Ls;return((ps=L.value.model_profiles)==null?void 0:ps[Pe])||((Ls=(Et=L.value.openrouter)==null?void 0:Et.catalogue_profiles)==null?void 0:Ls[Pe])||null},Te=(Pe,ps,Et)=>ps.map(Ls=>{var Lu,Nu;const ui=typeof Ls=="string"?Ls:Ls.name,js=Pe==="compat"?se(ui):null;return{ref:Pe==="codex"?Ls:`${Pe}:${ui}`,name:ui,provider:Pe,available:!!(Et!=null&&Et.enabled&&(Pe==="codex"?Et.configured:(Lu=Et.health)!=null&&Lu.healthy)),unavailable_reason:Et!=null&&Et.enabled?Et!=null&&Et.configured?!((Nu=Et==null?void 0:Et.health)!=null&&Nu.healthy)&&Pe!=="codex"?"unreachable":"":"not configured":"disabled",capability:Pe==="codex"||js!=null&&js.supports_reasoning?"reasoning":js!=null&&js.supports_thinking_mode?"thinking":"none",efforts:js==null?void 0:js.supported_efforts,profile:js}}),De=[...z.codex||Te("codex",r,v.codex),...z.compat||z.openai_compatible||[],...z.ollama||Te("ollama",Ee.value,v.ollama)].map(Pe=>typeof Pe=="string"?{ref:Pe,name:Pe,provider:"codex",available:!0,capability:"reasoning"}:Pe),Ne=Pe=>{const ps=De.findIndex(Et=>Et.ref===Pe.ref);ps===-1?De.push(Pe):De[ps]={...De[ps],...Pe}};for(const Pe of Te("compat",st.value,v.openai_compatible))Ne(Pe);if(is.value&&la.value.length)for(const Pe of la.value){const ps=`compat:${Pe.id}`;Ne({ref:ps,name:Pe.name||Pe.id,provider:"compat",available:!0,unavailable_reason:"",capability:Pe.supports_reasoning?"reasoning":"none",efforts:i.filter(Et=>{var Ls;return(Ls=Pe.supported_efforts)==null?void 0:Ls.includes(Et)}),agent_available:Pe.agent_eligible&&!!Pe.profile,agent_unavailable_reason:Pe.agent_unavailable_reason||""})}const St=new Set(De.map(Pe=>Pe.ref));for(const Pe of[a.value.main,be.value.model,...Xe.value])Pe&&Pe!=="auto"&&!St.has(Pe)&&De.unshift({ref:Pe,name:Pe.replace(/^(compat|ollama):/,""),provider:Pe.split(":")[0]||"codex",available:!1,unavailable_reason:"unavailable",capability:Pe.startsWith("ollama:")||Pe.includes(":")?"none":"reasoning"});return De.filter(Pe=>!is.value||Pe.provider!=="compat"||Pe.ref.slice(7).includes("/")).map(Pe=>Pe.efforts?{...Pe,efforts:i.filter(ps=>Pe.efforts.includes(ps)&&!Z(Pe.ref,ps))}:Pe)}),d=V(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,z])=>({id:v,label:z,models:c.value.filter(se=>{if(se.provider!==v)return!1;const Te=n.value.trim().toLowerCase();return!Te||`${se.name} ${se.ref}`.toLowerCase().includes(Te)})})).filter(v=>v.models.length)),u=v=>v.available&&v.agent_available!==!1,p=v=>v.available?`${v.name}${v.agent_available===!1?` (${v.agent_unavailable_reason||"not agent-eligible"})`:""}`:I(v),m=V(()=>[["codex","Codex"],["compat","OpenAI-compatible"],["ollama","Ollama"]].map(([v,z])=>({id:v,label:z,models:c.value.filter(se=>se.provider===v&&!(v==="compat"&&is.value)&&`${se.ref} ${se.name}`.toLowerCase().includes(Is.value.trim().toLowerCase()))})).filter(v=>v.models.length)),h=V(()=>c.value.find(v=>v.ref===a.value.main)),g=V(()=>c.value.find(v=>v.ref===be.value.model)),R=v=>c.value.find(z=>z.ref===v),O=v=>{const z=R(v);return(z==null?void 0:z.provider)==="codex"?i.filter(se=>!Z(v,se)):(z==null?void 0:z.efforts)||[]},x=v=>ot.value.find(z=>Me(z)===v),b=(v,z)=>{const se=x(v);return typeof se=="string"?"":(se==null?void 0:se[z])||""},y=V(()=>Xe.value.map(v=>R(v)).filter(v=>v&&u(v))),_=V(()=>[...new Set(y.value.map(v=>v.capability!=="reasoning"?v.capability||"none":v.provider==="codex"?"codex_reasoning":"compatible_reasoning"))]),k=V(()=>_.value.length>1),T=V(()=>{var z;if(be.value.model!=="auto")return((z=g.value)==null?void 0:z.capability)||"none";if(k.value)return"mixed";const v=_.value[0]||"none";return v.endsWith("_reasoning")?"reasoning":v}),A=V(()=>{var v;return be.value.model==="auto"?i:((v=g.value)==null?void 0:v.efforts)||i}),w=V(()=>T.value==="thinking"?be.value.thinking_mode??o.value.agent_reasoning_effort??"":o.value.agent_reasoning_effort??""),I=v=>`${v.name}${v.available?"":` (${v.unavailable_reason||"unavailable"})`}`,U=V(()=>{const v=o.value.model;return v&&!r.includes(v)?[v,...r]:r}),C=V(()=>{const v=be.value.model;return v&&v!=="auto"&&!r.includes(v)?[v,...r]:r}),F={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},Z=(v,z)=>!!v&&!!z&&(F[v]||[]).includes(z),W=V(()=>{const v=be.value.model;return v&&!v.includes(":")?v:null}),P=v=>!Z(o.value.model,v)&&!(o.value.agent_reasoning_effort===""&&Z(W.value,v)),N=v=>{const z=be.value.model;return z==="auto"?!0:!Z(z||o.value.model,v)},D=V(()=>{const v=o.value.agent_reasoning_effort;return v==="auto"?null:v||o.value.reasoning_effort}),oe=v=>Z(v,o.value.reasoning_effort)||be.value.model===""&&Z(v,D.value),de=v=>Z(v,D.value),B=f({enabled:!1,model:"gpt-5.6-luna"}),Y=f({unavailable_reason:null}),re=V(()=>{const v=B.value.model;return v&&!r.includes(v)?[v,...r]:r});function J(v){const z=v.target.value;B.value.enabled=z!=="",z!==""&&(B.value.model=z),z.startsWith("compat:")&&is.value?ma(An(z),ii(z)).then(()=>ci()).catch(se=>Be(se.message||"Failed to prepare OpenRouter model","error")):ci()}const he=f(!1),fe=f({codex:!1,ollama:!1,compatible:!1}),K=f(null),pe=f(!1),ve=f(""),ye=f(null),_e=f(!1);let Fe=0;const E=V(()=>{var v;return Object.entries(((v=K.value)==null?void 0:v.models)||{}).map(([z,se])=>{var Te,De,Ne;return{model:z,floor:se.floor,override:se.override,effectiveBudget:(Te=se.effective)==null?void 0:Te.effective_budget,configuredPrimaryChars:(De=se.configured)==null?void 0:De.primary_chars,primaryChars:(Ne=se.effective)==null?void 0:Ne.primary_chars,provenance:se.provenance,clampExpiresAt:se.clamp_expires_at,densityPriorMilli:se.density_prior_milli,densityScope:se.density_scope,workloadCalibration:se.workload_calibration}})}),$=V(()=>{var v;return((v=K.value)==null?void 0:v.clamps)||[]}),G=V(()=>{var v,z;return((z=(v=K.value)==null?void 0:v.models)==null?void 0:z[o.value.model])||null}),ie=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),L=f({enabled:!1,base_url:"https://api.deepseek.com/v1",api_key:"",model:"deepseek-v4-flash",max_tokens:4096,timeout:300,preset:"deepseek",model_profiles:{},context_utilization:75,openrouter:{order:[],allow_fallbacks:!0,quantizations:[],sort:null,data_collection:null,reasoning_effort:"medium",model_pins:{},catalogue_profiles:{}}}),Q=f(!1),ue=f(!1),H=f(!1),te=f(!1),X=f(!1),ge=f(!1),me=f({configured:null}),we=f(!1),Ee=f([]),$e=f(""),We=f(!1),He=f(!1),Ve=f({configured:null}),Ze=f(!1),st=f([]),Qe=V(()=>is.value?la.value.map(v=>v.id):st.value),ee=f(""),Se=f(!1),Re=f(!1),be=f({model:"auto",thinking_mode:null,auto_model_allowlist:[]}),ne=f(!1),Le=f(!1),Me=v=>typeof v=="string"?v:v==null?void 0:v.model,ot=V(()=>(be.value.auto_model_allowlist||[]).map(v=>typeof v=="string"?v:{...v}).filter(v=>Me(v))),ss=V(()=>!o.value.enabled&&L.value.enabled?L.value.model?[`compat:${L.value.model}`]:[]:!o.value.enabled&&!L.value.enabled&&ie.value.enabled?ie.value.model?[`ollama:${ie.value.model}`]:[]:r),Xe=V(()=>ot.value.length?ot.value.map(Me):ss.value),Ot=V(()=>{var v;return(v=be.value.auto_model_allowlist)!=null&&v.length?`Allowlist: ${Xe.value.length} models`:`Default: ${Xe.value.join(", ")||"no available agent models"}`}),Ft=new Map;function Rs(){ne.value=!1,Yi()}const pa=v=>{if(is.value&&v.startsWith("compat:")&&!v.slice(7).includes("/"))return"OpenRouter requires a namespaced vendor/model ID; this is a direct-endpoint profile.";const z=c.value.find(se=>se.ref===v);return z?u(z)?"":z.agent_unavailable_reason||z.unavailable_reason||"Not agent-eligible":"Model is absent from the current endpoint catalogue."},fa=v=>{if(un.value.has(v))return Da(v);const z=c.value.find(Te=>Te.ref===v),se=(z==null?void 0:z.hint_metadata)||{};return[se.hint||se.hint_derived,se.as_of&&`as of ${se.as_of}`,se.scope_note,se.evidence&&`Evidence: ${se.evidence}`,z&&li(z)].filter(Boolean).join(" · ")||"No catalogue hint. Add an operator hint below."},as=f(null),Zs=f(!1),ns=f(""),la=V(()=>{var v;return(((v=as.value)==null?void 0:v.models)||[]).map(z=>{var Ne,St,Pe;const se=((Ne=L.value.model_profiles)==null?void 0:Ne[z.id])||z.profile||((Pe=(St=L.value.openrouter)==null?void 0:St.catalogue_profiles)==null?void 0:Pe[z.id])||(z.context_length>0&&z.max_completion_tokens>0?{total_window_tokens:z.context_length,max_output_tokens:z.max_completion_tokens}:null),Te=se?Math.floor((se.total_window_tokens-se.max_output_tokens)*L.value.context_utilization/100):0,De=z.variant!=="standard"?`${z.variant} variant is not offered for ordinary agents`:z.supports_tools?se?Te<63e3?`Post-utilization working budget is ${Te.toLocaleString()} tokens; at least 63,000 are required`:"":"Catalogue has no complete context profile":"Model catalogue does not declare tool support";return{...z,profile:se,agent_eligible:!De,agent_unavailable_reason:De}})}),Is=f(""),Ra=f(""),Ys=f(!0),ut=f(!0),Bs=f(!0),Ia=f(!1),le=f(null),Ae=f(""),Je=f(null),it=f(""),kt=f([]),mt=f(!1),Oa=f("throughput"),zs=(v,z,se=null)=>{const Te=v[z],De=se&&Te&&typeof Te=="object"?Te[se]:Te,Ne=Number(De);return Number.isFinite(Ne)?Ne:null},Zi=V(()=>{const v=[...kt.value],z=Oa.value;return v.sort((se,Te)=>{var ui,js;if(z==="quantization")return String(se.quantization).localeCompare(String(Te.quantization));const[De,Ne,St]=z==="throughput"?["throughput_last_30m","p50",!0]:z==="latency_p99"?["latency_last_30m","p99",!1]:z==="cache_price"?["cache_read_per_token",null,!1]:["prompt_per_token",null,!1],Pe=(ui=se.pricing)==null?void 0:ui[De],ps=(js=Te.pricing)==null?void 0:js[De],Et=Ne?zs(se,De,Ne):Pe==null?null:Number(Pe),Ls=Ne?zs(Te,De,Ne):ps==null?null:Number(ps);return Number.isFinite(Et)?Number.isFinite(Ls)?St?Ls-Et:Et-Ls:-1:1})}),ti=V(()=>{try{return new URL(L.value.base_url).hostname}catch{return""}}),is=V(()=>/(^|\.)openrouter\.ai$/i.test(ti.value)),si=V(()=>{var v,z;return is.value?Zs.value?"OpenRouter recognized · fetching catalogue…":ns.value?`OpenRouter recognized · catalogue failed: ${ns.value}`:`OpenRouter recognized · ${((z=(v=as.value)==null?void 0:v.models)==null?void 0:z.length)||0} catalogue models loaded`:st.value.length?`${st.value.length} endpoint models loaded`:"Catalogue not loaded"}),La=V(()=>ns.value?"text-red-400":"text-gray-500"),dn=V(()=>{var v;return[...new Set((((v=as.value)==null?void 0:v.models)||[]).map(z=>z.vendor))].sort()}),Qt=V(()=>{var v;return[...new Set((((v=as.value)==null?void 0:v.models)||[]).flatMap(z=>(z.endpoints||[]).map(se=>se.quantization)).filter(Boolean))].sort()}),Na=v=>{var z;return(((z=as.value)==null?void 0:z.measured_cache)||[]).some(se=>se.model===v.id&&se.samples>0&&se.cached_percent>0)},xs=V(()=>{const v=Is.value.trim().toLowerCase();return la.value.filter(z=>{var se;return!(v&&!`${z.id} ${z.name} ${z.vendor}`.toLowerCase().includes(v)||Ra.value&&z.vendor!==Ra.value||Ys.value&&!z.supports_tools||ut.value&&!z.agent_eligible||Bs.value&&z.variant!=="standard"||Ia.value&&!Na(z)||le.value!=null&&Number((se=z.pricing)==null?void 0:se.prompt_per_token)*1e6>Number(le.value)||Ae.value&&!(z.endpoints||[]).some(Te=>Te.quantization===Ae.value))})}),ai=V(()=>xs.value.slice(0,100)),ni=V(()=>xs.value.length),un=V(()=>new Map(la.value.map(v=>[`compat:${v.id}`,v]))),Ma=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(3)}/M`,En=v=>{var z,se,Te,De;return[v.vendor,v.context_length?`${Number(v.context_length).toLocaleString()} ctx`:"context unknown",`${Ma((z=v.pricing)==null?void 0:z.prompt_per_token)} in`,`${Ma((se=v.pricing)==null?void 0:se.completion_per_token)} out`,`${Ma((Te=v.pricing)==null?void 0:Te.cache_read_per_token)} cache read`,`${Ma((De=v.pricing)==null?void 0:De.cache_write_per_token)} cache write`,v.supports_tools?"tools":"no tools",v.supports_reasoning?"reasoning":"no reasoning",v.variant!=="standard"?v.variant:null].filter(Boolean).join(" · ")},Da=v=>{var De;const z=un.value.get(v);if(!z)return"Catalogue facts unavailable";const se=(((De=as.value)==null?void 0:De.measured_cache)||[]).filter(Ne=>Ne.model===z.id),Te=se.length?se.map(Ne=>`${Ne.upstream_provider}: ${Ne.cached_percent}% cached`).join(" · "):"No measured cache evidence yet";return`${En(z)} · ${Te}${z.profile_conflict?" · operator profile conflicts with catalogue":""}`},pn=V(()=>st.value.map(v=>typeof v=="string"?v:v.name).filter(Boolean)),Ie=async()=>{var z,se,Te;const v=(Te=(se=(z=t.value)==null?void 0:z.openai_compatible)==null?void 0:se.preset_catalogue)==null?void 0:Te[L.value.preset];v&&(L.value.base_url=v.base_url),di.cancel(),await fo()},M=(v,z)=>{L.value.openrouter[v]=z.split(",").map(se=>se.trim()).filter(Boolean)},ce=V(()=>Ee.value||[]),xe=V(()=>{const v=[...r,...pn.value.map(z=>`compat:${z}`),...ce.value.map(z=>`ollama:${z.name}`)];for(const z of[be.value.model,...Xe.value])z&&z!=="auto"&&!v.includes(z)&&v.unshift(z);return v}),Ue=v=>v==="codex-auto-review"?"codex-auto-review (Codex alias → gpt-5.6-luna)":v;async function je(){try{be.value={...be.value,...await j.get("/api/agents/model")}}catch{}}async function qe(){if(!is.value){as.value=null,ns.value="";return}Zs.value=!0;try{as.value=await j.get("/api/openrouter/catalogue"),ns.value=""}catch(v){ns.value=v.message||"Failed to load OpenRouter catalogue"}finally{Zs.value=!1}}async function Lt(){var v;try{(v=be.value.model)!=null&&v.startsWith("compat:")&&is.value&&await ma(An(be.value.model),ii(be.value.model));const z=await j.put("/api/agents/model",{model:be.value.model||null});be.value={...be.value,...z},Be("Agent model policy saved")}catch(z){Be(z.message||"Failed to save agent model policy","error")}}const rt=()=>[...ot.value.length?ot.value:Xe.value];async function Tt(v,z){const se=rt(),Te=se.findIndex(St=>Me(St)===v);let De=null;if(z.target.checked&&Te<0&&se.push(Ft.get(v)||v),!z.target.checked&&Te>=0&&([De]=se.splice(Te,1)),!se.length){z.target.checked=!0,Be("Keep one model selected. An empty list restores the provider default.","error");return}const Ne=await Ut(se,"Agent Auto allowlist saved");Ne&&z.target.checked&&Ft.delete(v),Ne&&!z.target.checked&&typeof De=="object"&&Ft.set(v,De),Ne||(z.target.checked=Xe.value.includes(v))}async function Ut(v,z){if(Le.value)return!1;Le.value=!0;try{const se=await j.put("/api/agents/model",{auto_model_allowlist:v});return be.value={...be.value,...se},Be(z),!0}catch(se){return Be(se.message||"Failed to save agent allowlist","error"),!1}finally{Le.value=!1}}const Nt=()=>Ut([],"Provider default restored");async function Pa(v,z,se){const Te=Xe.value.map(De=>{const Ne=x(De);if(De!==v)return Ne||De;const St=typeof Ne=="string"?{model:De}:{...Ne||{model:De}};return delete St.reasoning_effort,delete St.thinking_mode,se&&(St[z]=se),Object.keys(St).length===1?St.model:St});await Ut(Te,"Model default saved")}async function ma(v,z=""){const[se,...Te]=v.split("/");if(!se||!Te.length)throw new Error("OpenRouter model id is not namespaced");return j.post(`/api/openrouter/models/${encodeURIComponent(se)}/${encodeURIComponent(Te.join("/"))}/select`,{provider_tag:z})}const Zr=(v,z)=>{var Te;const se=(((Te=as.value)==null?void 0:Te.measured_cache)||[]).find(De=>De.model===v&&De.upstream_provider===z);return se?`${se.cached_percent}% cached over ${se.samples} calls`:"no measured cache evidence"},$a=v=>v==null?"n/a":`$${(Number(v)*1e6).toFixed(4)}/M`,Yr=(v,z)=>{if(v==null)return"n/a";if(typeof v=="number")return Number(v).toLocaleString();const se=v[z];return se==null?"n/a":Number(se).toLocaleString()},Qr=v=>{var De;const z=[];v.quantization==="fp4"&&z.push("fp4 quantization may change quality");const se=typeof v.latency_last_30m=="object"?Number((De=v.latency_last_30m)==null?void 0:De.p99):null,Te=Number(be.value.iteration_timeout_seconds||0)*1e3;return se&&Te&&se>Te&&z.push("p99 exceeds the agent iteration budget"),z.join("; ")};async function co(v){var z;Je.value=v,it.value=((z=L.value.openrouter.model_pins)==null?void 0:z[v.id])||"",mt.value=!0;try{const[se,...Te]=v.id.split("/"),De=await j.get(`/api/openrouter/models/${encodeURIComponent(se)}/${encodeURIComponent(Te.join("/"))}/endpoints`);kt.value=De.endpoints||[]}catch(se){kt.value=[],Be(se.message||"Failed to load OpenRouter provider routes","error")}finally{mt.value=!1}}function Yi(){Je.value=null,it.value="",kt.value=[]}async function Xr(v,z=""){try{await ma(v.id,z);const se=rt(),Te=`compat:${v.id}`;if(se.some(Ne=>Me(Ne)===Te)||se.push(Te),!await Ut(se,z?"OpenRouter model added and provider pinned.":"OpenRouter model added unpinned."))return;Yi(),await va()}catch(se){Be(se.message||"Failed to add OpenRouter model","error")}}const An=v=>v.startsWith("compat:")?v.slice(7):v,ii=v=>{var z;return((z=L.value.openrouter.model_pins)==null?void 0:z[An(v)])||""},ec=v=>Xe.value.length>1&&Ut(rt().filter(z=>Me(z)!==v),"Model removed from allowlist");async function Qi(){var v,z;try{const se=rt();for(const Te of((v=as.value)==null?void 0:v.quick_add)||[])(z=un.value.get(Te))!=null&&z.agent_eligible&&(await ma(An(Te),""),se.some(De=>Me(De)===Te)||se.push(Te));await Ut(se,"Curated OpenRouter models added"),await va()}catch(se){Be(se.message||"Failed to add curated OpenRouter models","error")}}function li(v){const z=v.hint_metadata||{},se=[];return z.context_tokens&&se.push(`context ${Number(z.context_tokens).toLocaleString()}`),z.max_output_tokens&&se.push(`max output ${Number(z.max_output_tokens).toLocaleString()}`),z.structural_source&&se.push(`source ${z.structural_source}`),se.join("; ")}async function Xi(v,z){const se={...be.value.model_selection_hints||{}},Te=z.trim();Te?se[v]=Te:delete se[v];try{const De=await j.put("/api/agents/model",{model_selection_hints:se});be.value={...be.value,...De},Be("Model hint saved")}catch(De){Be(De.message||"Failed to save model hint","error")}}function Rn(v,z){const se=Xe.value.indexOf(v);return!Le.value&&se>=0&&se+z>=0&&se+z<Xe.value.length}async function el(v,z){const se=rt(),Te=se.findIndex(De=>Me(De)===v);Te<0||!Rn(v,z)||([se[Te],se[Te+z]]=[se[Te+z],se[Te]],await Ut(se,"Agent Auto allowlist order saved"))}const In=f(!0),S=f(""),q=f({configured:null,accounts:[]}),ae=f(null),ke=f(null),Ge=f(""),ht=f(null),_s=f(!1),Os=f(null),Fa=f(null),ha=f("");let oi=null;function Be(v,z="success"){Ce(v,z==="error"?"error":"success")}function Rg(v){if(!v)return"?";const z=v/(1024*1024*1024);return z>=1?z.toFixed(1)+" GB":(v/(1024*1024)).toFixed(0)+" MB"}function Ig(v){return Number.isFinite(Number(v))?Number(v).toLocaleString():"—"}function Og(v){return v==null?"automatic (model-derived)":Number(v).toLocaleString()+" characters"}function Lg(v){const z=new Date(v);return Number.isNaN(z.getTime())?"unknown":z.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Ng(v){return typeof v=="string"&&v.length>12?v.slice(0,8)+"…"+v.slice(-4):v}function Mg(v){return typeof v!="number"||!Number.isFinite(v)?"—":(v/1e3).toFixed(2)}function Dg(v){return v==="temporary learned clamp"?"is-clamp":v==="override"?"is-override":"is-built-in"}function Pg(v){const z=o.value.context_budget_overrides[v.model];return v.floor!=null&&Number.isFinite(Number(z))&&Number(z)>v.floor}function $g(v,z){const se={...o.value.context_budget_overrides};z.target.value===""?delete se[v]:se[v]=Number(z.target.value),o.value.context_budget_overrides=se,_e.value=!0}function Fg(v){o.value.context_utilization=v.target.value===""?"":Number(v.target.value),_e.value=!0}function Ug(v){const z={...o.value.context_budget_overrides};delete z[v],o.value.context_budget_overrides=z,_e.value=!0}async function va(){e.value=!0,await Promise.all([Hs(),uo(),po(),je(),ga(),ri()]),await qe(),e.value=!1}async function Hs({preserveBasic:v=!1,preserveAdvanced:z=!1}={}){var se,Te,De;try{const Ne=await j.get("/api/llm/status");t.value=Ne,s.value=!1,a.value.main=Ne.main_model||Ne.active_model||(Ne.active_provider==="compat"?`compat:${((se=Ne.openai_compatible)==null?void 0:se.model)||""}`:Ne.active_provider==="ollama"?`ollama:${((Te=Ne.ollama)==null?void 0:Te.model)||""}`:((De=Ne.codex)==null?void 0:De.model)||"gpt-5.6-sol"),Ne.codex&&!sl.pending()&&(v||(o.value.enabled=Ne.codex.enabled,o.value.model=Ne.codex.model||"gpt-5.6-sol",o.value.reasoning_effort=Ne.codex.reasoning_effort||"medium",o.value.agent_reasoning_effort=Ne.codex.agent_reasoning_effort||""),z||(o.value.request_timeout_seconds=Ne.codex.request_timeout_seconds??o.value.request_timeout_seconds,o.value.stream_stall_timeout_seconds=Ne.codex.stream_stall_timeout_seconds??o.value.stream_stall_timeout_seconds,o.value.retry={...o.value.retry,...Ne.codex.retry||{}},o.value.connection_pool={...o.value.connection_pool,...Ne.codex.connection_pool||{}},o.value.context_compression={...o.value.context_compression,...Ne.codex.context_compression||{}},!_e.value&&!H.value&&(o.value.context_budget_overrides={...Ne.codex.context_budget_overrides||{}},o.value.context_utilization=Ne.codex.context_utilization??o.value.context_utilization))),Ne.ollama&&!al.pending()&&(v||(ie.value.enabled=Ne.ollama.enabled,ie.value.base_url=Ne.ollama.base_url||"",ie.value.model=Ne.ollama.model||"",ie.value.max_tokens=Ne.ollama.max_tokens||4096),z||(ie.value.timeout=Ne.ollama.timeout??ie.value.timeout));const St=Ne.openai_compatible;St&&!di.pending()&&(v||(L.value.enabled=St.enabled,L.value.base_url=St.base_url||L.value.base_url,L.value.model=St.model||L.value.model,L.value.max_tokens=St.max_tokens||4096,L.value.preset=St.preset||L.value.preset),z||(L.value.timeout=St.timeout??L.value.timeout,L.value.model_profiles=St.model_profiles||L.value.model_profiles,L.value.context_utilization=St.context_utilization??L.value.context_utilization,L.value.openrouter={...L.value.openrouter,...St.openrouter||{}})),Ne.auxiliary&&(Y.value=Ne.auxiliary,ci.pending()||(B.value.enabled=Ne.auxiliary.enabled,B.value.model=Ne.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},openai_compatible:{configured:null}}),s.value=!0}}async function ri(){const v=++Fe;pe.value=!0,ve.value="";try{const z=await j.get("/api/context/windows");if(v!==Fe)return;K.value=z,!H.value&&!_e.value&&(o.value.context_budget_overrides=Object.fromEntries(Object.entries(z.models||{}).filter(([,se])=>se.override!=null).map(([se,Te])=>[se,Te.override])),o.value.context_utilization=z.utilization??o.value.context_utilization)}catch(z){v===Fe&&(ve.value=z.message||"Failed to load context budgets")}finally{v===Fe&&(pe.value=!1)}}async function uo(){try{if(me.value=await j.get("/api/ollama/status"),we.value=!1,me.value.model&&($e.value=me.value.model),me.value.configured)try{const v=await j.get("/api/ollama/models");Ee.value=v.models||[]}catch{Ee.value=[]}else if(ie.value.base_url)try{const v=await j.post("/api/ollama/probe-models",{base_url:ie.value.base_url});Ee.value=v.models||[]}catch{Ee.value=[]}}catch{we.value=!0}}async function ga(){In.value=!0,S.value="";try{q.value=await j.get("/api/codex/status")}catch(v){S.value=v.message||"Failed to fetch Codex status"}finally{In.value=!1}}async function Bg(){try{a.value.main.startsWith("compat:")&&is.value&&await ma(An(a.value.main),ii(a.value.main));try{await j.put("/api/llm/main-model",{model:a.value.main})}catch(v){if(!/404|not found/i.test(v.message||""))throw v;await j.post("/api/llm/switch",{model:a.value.main})}Be("Main model saved"),await va()}catch(v){Be(v.message||"Failed to save main model","error"),await Hs()}}async function zg(v){a.value.main_capability=v;const z=h.value;z&&(z.capability==="reasoning"?(o.value.reasoning_effort=v,await tl()):z.capability==="thinking"&&(await j.put("/api/openai-compatible/config",{thinking_mode:v}),Be("Thinking mode saved")))}async function Hg(v){a.value.agent_capability=v;const z=g.value,se=(z==null?void 0:z.capability)||T.value;if(se!=="none"){if(v===""||v==="auto"||se==="reasoning"||se==="mixed"){if(o.value.agent_reasoning_effort=v,se==="thinking"){const Te=await j.put("/api/agents/model",{thinking_mode:null});be.value={...be.value,...Te}}await tl()}else if(se==="thinking"){const Te=await j.put("/api/agents/model",{thinking_mode:v});be.value={...be.value,...Te},Be("Agent thinking mode saved")}}}async function jg(){We.value=!0;try{const v=await j.post("/api/ollama/reload");Be(v.configured?"Ollama reloaded":v.reason||"Ollama not configured",v.configured?"success":"error"),await va()}catch(v){Be(v.message||"Reload failed","error")}finally{We.value=!1}}async function Vg(){He.value=!0;try{await j.post("/api/ollama/model",{model:$e.value}),Be("Model set to "+$e.value),await va()}catch(v){Be(v.message||"Failed","error")}finally{He.value=!1}}async function qg(){const v=ie.value.base_url;if(!v){Be("Enter a base URL first","error");return}ge.value=!0;try{const z=await j.post("/api/ollama/probe-models",{base_url:v});Ee.value=z.models||[],Ee.value.length?(Be(Ee.value.length+" model(s) found"),!ie.value.model&&Ee.value.length&&(ie.value.model=Ee.value[0].name)):Be("No models found at "+v,"error")}catch(z){Be(z.message||"Could not reach Ollama","error")}finally{ge.value=!1}}async function po(){try{if(Ve.value=await j.get("/api/openai-compatible/status"),Ze.value=!1,Ve.value.model&&(ee.value=Ve.value.model),Ve.value.configured)try{const v=await j.get("/api/openai-compatible/models");st.value=v.models||[]}catch{st.value=[]}}catch{Ze.value=!0}}async function Gg(){Se.value=!0;try{const v=await j.post("/api/openai-compatible/reload");Be(v.configured?"OpenAI-compatible reloaded":v.reason||"OpenAI-compatible not configured",v.configured?"success":"error"),await va()}catch(v){Be(v.message||"Reload failed","error")}finally{Se.value=!1}}async function Wg(){Re.value=!0;try{await j.post("/api/openai-compatible/model",{model:ee.value}),Be("Model set to "+ee.value),await va()}catch(v){Be(v.message||"Failed","error")}finally{Re.value=!1}}async function tl(){if(H.value){sl();return}H.value=!0;const v=bf(o.value);try{await j.put("/api/llm/codex/config",v),Be("Codex config saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),ga()])}catch(z){Be(z.message||"Failed","error");const se=JSON.stringify(bf(o.value))!==JSON.stringify(v);await Promise.all([Hs({preserveBasic:se,preserveAdvanced:!0}),ga()])}finally{H.value=!1}}async function Ru(){if(H.value)return;H.value=!0;const v=yf(o.value);try{await j.put("/api/llm/codex/config",v),JSON.stringify({context_budget_overrides:o.value.context_budget_overrides,context_utilization:o.value.context_utilization})===JSON.stringify({context_budget_overrides:v.context_budget_overrides,context_utilization:v.context_utilization})&&(_e.value=!1),Be("Codex advanced settings saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),ga(),ri()])}catch(z){Be(z.message||"Failed","error");const se=JSON.stringify(yf(o.value))!==JSON.stringify(v);await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:se}),ga(),ri()])}finally{H.value=!1}}async function tc(){if(te.value){al();return}te.value=!0;try{const v=Q.value?ie.value.api_key:null,z=iC(ie.value,{includeApiKey:v!==null});await j.put("/api/llm/ollama/config",z),Be("Ollama config saved"),v!==null&&ie.value.api_key===v&&(ie.value.api_key="",Q.value=!1),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),uo()])}catch(v){Be(v.message||"Failed","error")}finally{te.value=!1}}async function Iu(){if(!te.value){te.value=!0;try{await j.put("/api/llm/ollama/config",lC(ie.value)),Be("Ollama timeout saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),uo()])}catch(v){Be(v.message||"Failed","error")}finally{te.value=!1}}}async function fo(){if(X.value){di();return}X.value=!0;try{const v=ue.value?L.value.api_key:null,z=aC(L.value,{includeApiKey:v!==null});await j.put("/api/openai-compatible/config",z),Be("OpenAI-compatible config saved"),v!==null&&L.value.api_key===v&&(L.value.api_key="",ue.value=!1),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),po()]),await qe()}catch(v){Be(v.message||"Failed","error")}finally{X.value=!1}}async function Ou(){if(!X.value){X.value=!0;try{await j.put("/api/openai-compatible/config",nC(L.value)),Be("OpenAI-compatible endpoint settings saved"),await Promise.all([Hs({preserveBasic:!0,preserveAdvanced:!0}),po()]),await qe()}catch(v){Be(v.message||"Failed","error")}finally{X.value=!1}}}async function Kg(){if(he.value){ci();return}he.value=!0;try{await j.put("/api/llm/auxiliary/config",B.value),Be("Auxiliary config saved"),await Hs()}catch(v){Be(v.message||"Failed","error"),await Hs()}finally{he.value=!1}}const sl=Oo(tl),ci=Oo(Kg),al=Oo(tc),di=Oo(fo),Jg=()=>(sl.cancel(),tl()),Zg=()=>(al.cancel(),tc()),Yg=()=>(di.cancel(),fo()),Qg=()=>Ru(),Xg=()=>Iu(),eb=()=>Ou();async function tb(v){const z=v.account_key+":"+v.model;ye.value=z;try{const se=await j.post("/api/context/windows/clear",{account_key:v.account_key,model:v.model});Be(se.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await ri()}catch(se){Be(se.message||"Failed to clear clamp","error"),await ri()}finally{ye.value=null}}async function sb(v){try{await j.post("/api/codex/account/"+v+"/activate"),Be("Active account switched"),await ga()}catch(z){Be(z.message||"Failed","error")}}async function ab(v){ae.value=v;try{await j.post("/api/codex/account/"+v+"/refresh"),Be("Token refreshed"),await ga()}catch(z){Be(z.message||"Refresh failed","error")}finally{ae.value=null}}function nb(v,z){ke.value=v,Ge.value=z||""}async function ib(v){try{await j.put("/api/codex/account/"+v+"/label",{label:Ge.value}),Be("Label updated"),ke.value=null,await ga()}catch(z){Be(z.message||"Failed","error")}}async function lb(v,z){if(await ts({title:"Delete Codex account",message:`Delete ${z||"account #"+(v+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/codex/account/"+v),Be("Deleted. Pool reloaded."),await ga()}catch(Te){Be(Te.message||"Failed","error")}}async function ob(){_s.value=!0;try{const v=await j.post("/api/codex/device-code");Os.value=v,ht.value="pending",rb(v)}catch(v){Be(v.message||"Failed","error")}finally{_s.value=!1}}async function rb(v){oi={cancelled:!1};const z=oi;try{const se=await j.post("/api/codex/device-poll",{device_auth_id:v.device_auth_id,user_code:v.user_code,interval:v.interval});if(z.cancelled)return;Fa.value=se,ht.value="success",await va()}catch(se){if(z.cancelled)return;ha.value=se.message||"Device login failed",ht.value="error"}}function cb(){oi&&(oi.cancelled=!0),ht.value=null,Os.value=null}return tt(va),xt(()=>{oi&&(oi.cancelled=!0),sl.cancel(),ci.cancel(),al.cancel(),di.cancel()}),{allowlistModalOpen:ne,closeAllowlistModal:Rs,allowlistSaving:Le,effectiveAllowlist:Xe,allowlistSummary:Ot,resetAgentAllowlist:Nt,selectedUnavailableReason:pa,selectedModelFacts:fa,loading:e,llmStatus:t,llmStatusLoadFailed:s,modelSelection:a,modelSelectorSearch:n,reasoningEfforts:i,neutralReasoningLevels:l,modelCatalog:c,modelGroups:d,selectedMainModel:h,selectedAgentModel:g,selectedAgentCapabilityValue:w,agentCapabilityKind:T,agentCapabilityEfforts:A,autoAllowlistModels:y,allowlistModel:R,allowlistModelEfforts:O,allowlistEntryCapabilityValue:b,modelOptionLabel:I,agentModelAvailable:u,agentModelOptionLabel:p,advancedOpen:fe,codexForm:o,codexModelOptions:U,codexAgentModelOptions:C,mainEffortAllowed:P,agentEffortAllowed:N,mainModelOptionDisabled:oe,agentModelOptionDisabled:de,auxForm:B,auxData:Y,auxModelOptions:re,onAuxModelChange:J,savingAux:he,saveAuxConfigDebounced:ci,ollamaForm:ie,compatibleForm:L,savingCodex:H,savingOllama:te,savingCompatible:X,probingOllama:ge,ollamaKeyDirty:Q,compatibleKeyDirty:ue,fetchCodexStatus:ga,ollamaStatus:me,ollamaStatusLoadFailed:we,ollamaModels:Ee,ollamaSelectedModel:$e,reloading:We,settingModel:He,compatibleStatus:Ve,compatibleStatusLoadFailed:Ze,compatibleModels:st,visibleCompatibleModels:Qe,compatibleSelectedModel:ee,reloadingCompatible:Se,settingCompatibleModel:Re,applyCompatiblePreset:Ie,setOpenRouterList:M,agentsConfig:be,compatibleAgentModels:pn,ollamaAgentModels:ce,knownAgentModelRefs:xe,agentModelLabel:Ue,saveAgentsModel:Lt,toggleAgentAutoAllowlist:Tt,saveAllowlistEntryCapability:Pa,autoAllowlistGroups:m,structuralFacts:li,saveModelHint:Xi,canMoveAllowlist:Rn,moveAgentAutoAllowlist:el,openRouterCatalogue:as,openRouterCatalogueLoading:Zs,openRouterCatalogueError:ns,openRouterRecognized:is,compatibleCatalogueStatus:si,compatibleCatalogueStatusClass:La,openRouterSearch:Is,openRouterVendor:Ra,openRouterVendors:dn,openRouterToolsOnly:Ys,openRouterEligibleOnly:ut,openRouterStandardOnly:Bs,openRouterMeasuredCacheOnly:Ia,openRouterMaxPromptPrice:le,openRouterQuantization:Ae,openRouterQuantizations:Qt,openRouterResults:ai,openRouterMatchCount:ni,openRouterInlineFacts:En,openRouterSelectedFacts:Da,prepareOpenRouterModel:co,addOpenRouterModel:Xr,removeOpenRouterModel:ec,quickAddOpenRouter:Qi,openRouterModelMap:un,openRouterPin:ii,openRouterPendingModel:Je,openRouterPendingTag:it,openRouterPendingEndpoints:kt,openRouterPendingLoading:mt,openRouterEndpointSort:Oa,openRouterSortedPendingEndpoints:Zi,openRouterEndpointCacheFact:Zr,openRouterRate:$a,openRouterMetric:Yr,openRouterRouteWarning:Qr,cancelOpenRouterPending:Yi,codexLoading:In,codexError:S,codexData:q,refreshing:ae,editingLabel:ke,labelValue:Ge,contextWindows:K,contextWindowsLoading:pe,contextWindowsError:ve,contextBudgetRows:E,activeClampRows:$,activeContextBudget:G,clearingClamp:ye,contextPolicyDirty:_e,deviceState:ht,deviceLoading:_s,deviceInfo:Os,deviceResult:Fa,deviceError:ha,fetchAll:va,fetchLLMStatus:Hs,fetchOllamaStatus:uo,fetchCompatibleStatus:po,saveMainModel:Bg,saveMainCapability:zg,saveAgentCapability:Hg,reloadOllama:jg,setOllamaModel:Vg,reloadCompatible:Gg,setCompatibleModel:Wg,probeOllamaModels:qg,saveCodexConfig:tl,saveOllamaConfig:tc,saveCompatibleConfig:fo,saveCodexAdvancedConfig:Ru,saveOllamaAdvancedConfig:Iu,saveCompatibleAdvancedConfig:Ou,saveCodexConfigDebounced:sl,saveOllamaConfigDebounced:al,saveCompatibleConfigDebounced:di,saveCodexConfigNow:Jg,saveOllamaConfigNow:Zg,saveCompatibleConfigNow:Yg,saveCodexAdvancedConfigNow:Qg,saveOllamaAdvancedConfigNow:Xg,saveCompatibleAdvancedConfigNow:eb,activateAccount:sb,refreshAccount:ab,startEditLabel:nb,saveLabel:ib,deleteAccount:lb,startDeviceLogin:ob,cancelDeviceLogin:cb,formatSize:Rg,fetchContextWindows:ri,clearContextClamp:tb,setContextOverride:$g,setContextUtilization:Fg,resetContextOverride:Ug,overrideAboveFloor:Pg,formatCount:Ig,formatContextCeiling:Og,formatExpiry:Lg,shortAccountKey:Ng,provenanceClass:Dg,formatDensity:Mg}}},xf={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function rC(e){return xf[e]||xf[(e||"").toLowerCase()]||"text-gray-400"}const cC={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=V(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((T,A)=>T+Number(A||0),0)}),u=f(""),p=f(0),m=f([]),h=V(()=>m.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let R=null;async function O(){var I;const k=await Promise.allSettled(g.map(U=>j.get(U.path))),T=U=>k[U].status==="fulfilled"?k[U].value:null;t.value=T(0)||{};const A=T(1);s.value=Array.isArray(A)?A:A&&A.subsystems||[],a.value=T(2)||{},n.value=T(3)||{},i.value=T(4),l.value=T(5),o.value=T(6),r.value=T(7),c.value=T(8);const w=k.filter(U=>U.status==="rejected");if(m.value=k.flatMap((U,C)=>{var F;return U.status==="rejected"?[{...g[C],reason:((F=U.reason)==null?void 0:F.message)||"request failed"}]:[]}),p.value=m.value.length,w.length===k.length){const U=(I=w[0])==null?void 0:I.reason;u.value=(U==null?void 0:U.message)||"Failed to load internals"}else u.value="";e.value=!1}function x(){e.value=!0,u.value="",O()}let b=!1;function y(){b||(b=!0,O(),R||(R=setInterval(O,3e4)))}function _(){b&&(b=!1,R&&(clearInterval(R),R=null))}return tt(y),us(y),Yt(_),xt(_),{loading:e,error:u,failedCount:p,failedEndpoints:m,failedEndpointSummary:h,endpoints:g,retry:x,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:rC,formatAgeSeconds:ES}}},dC=1e4,_f=3e4;function ul(e,t){return Math.max(0,e-t)}function Sc(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const uC=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],pC={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,m=0;async function h(){const N=++p;a.value=!0;try{const D=await j.get("/api/turn-state/turns?limit=100");if(N!==p)return;t.value=D.availability,e.value=D.availability==="available"?D.data:null,s.value=null,n.value=Date.now()}catch(D){if(N!==p)return;s.value=D.message||"Turn-state read failed",D.status===503&&(t.value="unavailable")}N===p&&(a.value=!1)}async function g(){const N=++m;r.value=!0;try{const D=await j.get("/api/turn-state/capacity-breakers");if(N!==m)return;l.value=D.availability,i.value=D.availability==="available"?D.data:null,o.value=null,c.value=Date.now()}catch(D){if(N!==m)return;o.value=D.message||"Breaker read failed",D.status===503&&(l.value="unavailable")}N===m&&(r.value=!1)}function R(){h(),g()}const O=V(()=>e.value!==null&&ul(d.value,n.value)>_f),x=V(()=>i.value!==null&&ul(d.value,c.value)>_f),b=V(()=>O.value||x.value),y=V(()=>Math.round(ul(d.value,n.value)/1e3)),_=V(()=>Math.round(ul(d.value,c.value)/1e3));function k(N){return Sc(N,d.value/1e3)}function T(N){return uC[k(N)]}const A=V(()=>{var oe;const N=[...((oe=e.value)==null?void 0:oe.turns)||[]],D=d.value/1e3;return N.sort((de,B)=>Sc(de,D)-Sc(B,D)||(B.last_progress_at||0)-(de.last_progress_at||0))});function w(N){return N.state==="closed"?"badge-success":N.state==="probing"?"badge-warning":"badge-danger"}function I(N){if(N.state==="closed")return"—";const D=ul(d.value,c.value)/1e3,oe=Math.max(0,(N.cooldown_remaining_seconds||0)-D);return oe>0?`${Math.ceil(oe)}s`:N.state==="probing"?"probe in flight":"probe eligible"}function U(N){if(!N)return"";const D=Math.max(0,Math.round(d.value/1e3-N));if(D<90)return`${D}s ago`;const oe=Math.round(D/60);return oe<90?`${oe}m ago`:`${Math.round(oe/60)}h ago`}let C=null,F=null,Z=!1;function W(){Z||(Z=!0,R(),C=setInterval(R,dC),u=setInterval(()=>{d.value=Date.now()},1e3),F=dt.onReconnected(R))}function P(){Z&&(Z=!1,C&&(clearInterval(C),C=null),u&&(clearInterval(u),u=null),F&&(F(),F=null))}return tt(W),us(W),Yt(P),xt(P),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:O,breakersStale:x,anyStale:b,turnsAgeSeconds:y,breakersAgeSeconds:_,sortedTurns:A,priorityOf:k,priorityBadge:T,breakerBadge:w,cooldownLabel:I,ageLabel:U,fetchTurns:h,fetchBreakers:g,refreshAll:R,arm:W,disarm:P}}},fC={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await j.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await ts({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await j.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return tt(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},wf=e=>JSON.parse(JSON.stringify(e)),mC=(e,t)=>JSON.stringify(e)===JSON.stringify(t),hC={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,m=0,h=null;const g=(P,N)=>p&&m===P&&j.token===N,R=P=>"computer-provisioning-"+P.key,O=P=>P===null?"Unset":P===""?"Empty":JSON.stringify(P),x=P=>{const N=n.value[P.key];return P.type==="array"?String(N||"").split(/\r?\n/).map(D=>D.trim()).filter(Boolean):["integer","number"].includes(P.type)?N===""||N==null?null:Number(N):N},b=V(()=>s.value.map(P=>({...P,value:x(P)})).filter(P=>!mC(P.value,a.value[P.key]))),y=V(()=>s.value.filter(P=>P.pending_restart).map(P=>P.label)),_=V(()=>s.value.some(P=>P.apply_state==="unknown")),k=V(()=>{const P={};for(const N of s.value){const D=x(N),oe=N.constraints||{};["integer","number"].includes(N.type)&&(D===null&&!N.nullable?P[N.key]="A number is required.":D!==null&&(!Number.isFinite(D)||N.type==="integer"&&!Number.isInteger(D)||oe.minimum!=null&&D<oe.minimum||oe.maximum!=null&&D>oe.maximum)&&(P[N.key]="Enter a number within the allowed range.")),N.key==="monitor_names"&&(D.length>16||new Set(D).size!==D.length||D.some(de=>!/^[A-Za-z0-9_.-]{1,64}$/.test(de)))&&(P[N.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return P}),T=V(()=>Object.keys(k.value).length>0);function A(P,N){n.value[P.key]=N,u.value=""}function w(){n.value=Object.fromEntries(s.value.map(P=>[P.key,P.type==="array"?a.value[P.key].join(`
`):a.value[P.key]])),r.value=!1}async function I(P,N){const[D,oe]=await Promise.all([j.get("/api/config"),j.get("/api/config/meta")]);if(!g(P,N))return!1;const de=(oe.fields||[]).filter(B=>/^computer\.[^.]+$/.test(B.path)&&B.path!=="computer.enabled"&&B.sensitivity==="public"&&B.apply_mode==="restart");if(!D.computer||!de.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=de.map(B=>({...B,key:B.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(B=>[B.key,wf(D.computer[B.key])])),w(),h=N,i.value=!0,c.value=!1,!0}async function U(){if(!p||l.value||o.value)return;const P=++m,N=j.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await I(P,N)}catch(D){g(P,N)&&(c.value=!0,d.value=D.message||"Could not load provisioning. No changes were sent.")}finally{g(P,N)&&(l.value=!1)}}function C(){i.value&&!l.value&&!o.value&&!c.value&&b.value.length&&!T.value&&(r.value=!0)}async function F(){if(!p||!i.value||!r.value||o.value||l.value||c.value||T.value||!b.value.length)return;if(h!==j.token){W(),Z();return}const P={computer:Object.fromEntries(b.value.map(de=>[de.key,wf(de.value)]))},N=m,D=j.token;o.value=!0,d.value="",u.value="";let oe=!1;try{if(await j.put("/api/config",P),oe=!0,!g(N,D))return;await I(N,D)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(de){g(N,D)&&(c.value=!0,r.value=!1,d.value=oe?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${de.status===400?": "+de.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{g(N,D)&&(o.value=!1)}}function Z(){p||(p=!0,U())}function W(){p=!1,m++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,h=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return tt(Z),us(Z),Yt(W),xt(W),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:y,effectiveUnknown:_,changes:b,validation:k,invalid:T,fieldId:R,format:O,edit:A,discard:w,load:U,openReview:C,save:F}}},vC={components:{ComputerProvisioning:hC},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),m=f(""),h=f(null),g=f(""),R=f(!1),O=f(Date.now()),x=f(""),b=f(null);let y=0,_=null,k=!1,T=j.token,A=0,w=null,I=null,U=!1;const C=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",F=V(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),Z=V(()=>{var te;const H=Date.parse(((te=e.value.accessibility)==null?void 0:te.checked_at)||"");return c.value&&Number.isFinite(H)&&O.value-H<15e3&&O.value>=H-5e3}),W=V(()=>{var H;return Z.value?C((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),P=V(()=>{var H;return Z.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),N=V(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,te])=>`${H}: ${te}`).join(", ")),D=V(()=>{var te;const H=(te=e.value.application_provenance)==null?void 0:te.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),oe=V(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),de=V(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),B=V(()=>{var te,X;const H=Date.parse(((te=h.value)==null?void 0:te.captured_at)||"");return Number.isFinite(H)&&O.value<H+Math.min(1e4,((X=h.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Y(){g.value&&URL.revokeObjectURL(g.value),g.value="",h.value=null}function re(){y++,Y(),b.value=null,c.value=!1,w==null||w.abort(),w=null,t.value=!1,m.value="",s.value=!1,i.value=!1,l.value=!1}function J(H,te){return k&&H===y&&te===j.token}function he(){return k&&c.value&&I===j.token&&Date.now()-u.value<15e3}function fe(H,te="mutation"){var ge,me;re(),U=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,I=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":te==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":te==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",te==="mutation"&&![401,403,404].includes(X)&&typeof((ge=H.data)==null?void 0:ge.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((me=H.data)==null?void 0:me.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function K(){if(t.value||r.value||a.value||n.value||d.value||!k)return;const H=y,te=j.token;t.value=!0,A=Date.now();const X=new AbortController;w=X;try{const ge=await j.get("/api/computer",{signal:X.signal});if(!J(H,te))return;pe(ge)}catch(ge){J(H,te)&&fe(ge,"read")}finally{w===X&&(w=null,t.value=!1)}}function pe(H,te=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&re(),e.value=H,u.value=Date.now(),I=j.token,c.value=!(r.value&&te!=="toggle")&&!(a.value&&te!=="stop")&&!(n.value&&te!=="pause")&&!(d.value&&te!=="recovery"),o.value="",p.value="",U=!c.value}async function ve(H){if(!he()||r.value||a.value||n.value||d.value)return;re();const te=y,X=j.token;r.value=!0;let ge=!1;try{if(await j.post("/api/computer/enabled",{enabled:H}),ge=!0,!J(te,X))return;const me=await j.get("/api/computer");J(te,X)&&pe(me,"toggle")}catch(me){J(te,X)&&fe(me,ge?"acknowledged":"mutation")}finally{r.value=!1}}async function ye(H){if(!k||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;re();const te=y,X=j.token,ge=H==="stop"?a:n;ge.value=!0;let me=!1;try{if(await j.post("/api/computer/"+H,{}),me=!0,J(te,X)){const we=await j.get("/api/computer");J(te,X)&&pe(we,H)}}catch(we){J(te,X)&&fe(we,me?"acknowledged":"mutation")}finally{ge.value=!1}}async function _e(){var ge;if(!he()||d.value||((ge=e.value.backend)==null?void 0:ge.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;re();const te=y,X=j.token;d.value=!0;try{const me=await j.post("/api/computer/release_owned_input",H);J(te,X)&&pe(me,"recovery")}catch(me){J(te,X)&&fe(me,"mutation")}finally{d.value=!1}}async function Fe(){return $(!1)}async function E(){return $(!0)}async function $(H){var Ee;if(!he()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const te={session_id:e.value.session_id,generation:e.value.session_generation};if(!te.session_id||!Number.isInteger(te.generation))return;if(H){if(m.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+te.session_id)return;te.acknowledgment=m.value}const X=H?((Ee=e.value.recovery)==null?void 0:Ee.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const ge=y,me=j.token;d.value=!0;let we=!1;try{const $e=await j.post("/api/computer/"+X,te);we=!0,J(ge,me)&&pe($e,"recovery")}catch($e){J(ge,me)&&fe($e,we?"acknowledged":"mutation")}finally{d.value=!1}}async function G(){var X;if(!he()||s.value||!e.value.available)return;Y(),R.value=!1;const H=y,te=j.token;s.value=!0;try{const ge=await j.post("/api/computer/observe",{});if(!J(H,te))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=ge.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const me=await j.getBlob("/api/computer/evidence/"+ge.frame.evidence_id);if(!J(H,te))return;if(!["image/png","image/jpeg"].includes(me.type)||me.size>2097152||!Number.isFinite(Date.parse(ge.frame.expires_at))||Date.parse(ge.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");h.value=ge.frame,g.value=URL.createObjectURL(me),o.value=""}catch(ge){J(H,te)&&fe(ge)}finally{H===y&&(s.value=!1)}}async function ie(){if(!he()||i.value||!e.value.available)return;b.value=null;const H=y,te=j.token;i.value=!0;try{const X=await j.post("/api/computer/export",{name:x.value});J(H,te)&&(b.value=X,o.value="")}catch(X){J(H,te)&&fe(X)}finally{H===y&&(i.value=!1)}}async function L(){if(!he()||l.value||!b.value)return;const H=y,te=j.token,X=b.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const ge=await j.getBlob("/api/computer/download/"+X.artifact_id);if(!J(H,te))return;const me=URL.createObjectURL(ge),we=document.createElement("a");we.href=me,we.download=X.name,we.click(),setTimeout(()=>URL.revokeObjectURL(me),1e3)}catch(ge){J(H,te)&&fe(ge)}finally{H===y&&(l.value=!1)}}function Q(){k||(T!==j.token&&(T=j.token,re(),u.value=0,I=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),k=!0,K(),_=setInterval(()=>{O.value=Date.now(),T!==j.token&&(T=j.token,re(),u.value=0,I=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&O.value-u.value>=15e3&&re(),h.value&&Date.parse(h.value.expires_at)<=O.value&&(Y(),R.value=!0),b.value&&Date.parse(b.value.expires_at)<=O.value&&(b.value=null),!U&&O.value-A>=5e3&&K()},500))}function ue(){k=!1,clearInterval(_),_=null,re(),c.value=!1}return tt(Q),us(Q),Yt(ue),xt(ue),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:h,frameUrl:g,frameExpired:R,freshness:B,name:x,artifact:b,refresh:K,control:ye,observe:G,clearFrame:Y,exportFile:ie,download:L,toggling:r,adminReady:c,enabledLabel:C,restartSettings:de,setEnabled:ve,recovering:d,recover:Fe,reconcile:E,releaseOwnedInput:_e,reconciliationAck:m,applicationProfiles:oe,attached:F,scriptIdentity:D,inputLimits:N,accessibilityLabel:W,accessibilityDetail:P}}},fg=[{id:"health",label:"Health",component:_1},{id:"resources",label:"Resources",component:w1},{id:"logs",label:"Logs",component:M1},{id:"config",label:"Config",component:G1},{id:"discord",label:"Discord",component:K1},{id:"hosts",label:"Hosts",component:Y1},{id:"host-access",label:"Host Access",component:Z1},{id:"api-tokens",label:"API Tokens",component:Q1},{id:"llm",label:"LLM Config",component:oC},{id:"internals",label:"Internals",component:cC},{id:"turn-state",label:"Turn State",component:pC},{id:"computer",label:"Computer",component:vC},{id:"update",label:"Update",component:fC}],gC={components:{TabbedPage:Gr},setup(){return{tabs:fg}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Lo=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),bC=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Lo("Operations","operations","/operations",ag),...Lo("History","history","/history",ng),...Lo("Capabilities","capabilities","/capabilities",ig),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Lo("System","system","/system",fg)],Ds=Tn({open:!1,query:"",selected:0});function kf(){Ds.query="",Ds.selected=0,Ds.open=!0}function Cc(){Ds.open=!1}function yC(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const xC={setup(){const e=Jv(),t=f(null),s=V(()=>{const i=Ds.query.trim().toLowerCase();return bC.map(l=>({...l,_score:yC(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Gt(()=>Ds.open,async i=>{var l;i&&(await zt(),(l=t.value)==null||l.focus())}),Gt(()=>Ds.query,()=>{Ds.selected=0});function a(i){Cc(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Cc();return}if(i.key==="ArrowDown")i.preventDefault(),Ds.selected=Math.min(Ds.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),Ds.selected=Math.max(Ds.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[Ds.selected];l&&a(l)}}return{state:Ds,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Cc}},template:`
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
  `},pd={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(pd));const _C={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>$i("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[$i("path",{d:pd[e.name]||pd.info})])}},wC=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Sf(e){return[...e.querySelectorAll(wC)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const kC={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Sf(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Sf(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},SC={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const m=V(()=>{const de=e.value.uptime_seconds||0,B=Math.floor(de/86400),Y=Math.floor(de%86400/3600),re=Math.floor(de%3600/60),J=[];return B>0&&J.push(`${B}d`),Y>0&&J.push(`${Y}h`),(J.length===0||B===0&&Y===0)&&J.push(`${re}m`),J.join(" ")}),h=V(()=>{const de=e.value.uptime_seconds||0;return 125.66*(1-Math.min(de/86400,1))}),g=V(()=>{const de=e.value;return[{label:"Guilds",value:de.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:de.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:de.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${de.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:de.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:de.loop_count>0?"text-green-400":"",highlight:de.loop_count>0},{label:"Agents",value:de.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:de.agent_count>0?`${de.agent_count} total`:"",subColor:"text-gray-500",highlight:(de.agent_running??0)>0},{label:"Processes",value:de.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:de.process_count>0?`${de.process_count} total`:"",subColor:"text-gray-500",highlight:(de.process_running??0)>0},{label:"Schedules",value:de.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(de.schedule_failing>0?`${de.schedule_failing} failing`:"")+(de.schedule_failing>0&&de.schedule_paused>0?", ":"")+(de.schedule_paused>0?`${de.schedule_paused} paused`:"")||void 0,subColor:de.schedule_failing>0?"text-red-400":"text-yellow-400",color:de.schedule_failing>0?"text-red-400":"",highlight:de.schedule_failing>0},{label:"Users",value:de.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),R=V(()=>{const de=e.value,B=[];return B.push({label:"Bot",status:de.status==="online"?"ok":"warn",detail:de.status==="online"?"Online":"Starting"}),(de.schedule_failing||0)>0?B.push({label:"Schedules",status:"error",detail:`${de.schedule_failing} failing`}):(de.schedule_count||0)>0&&B.push({label:"Schedules",status:"ok",detail:`${de.schedule_count} configured`}),(de.loop_count||0)>0&&B.push({label:"Loops",status:"ok",detail:`${de.loop_count} active`}),(de.agent_running||0)>0&&B.push({label:"Agents",status:"ok",detail:`${de.agent_running} running`}),(de.process_running||0)>0&&B.push({label:"Processes",status:"ok",detail:`${de.process_running} running`}),B});async function O(){try{e.value=await j.get("/api/status"),s.value=null}catch(de){s.value=de.message}finally{t.value=!1}}let x=0,b=0,y=0,_=0;function k(de,B){const Y=new Set;return[...B,...de].filter(re=>{const J=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return Y.has(J)?!1:(Y.add(J),!0)})}async function T(){const de=++x,B=y;n.value=!0;try{const Y=await j.get("/api/audit?limit=10");if(de!==x)return;const re=B===y?[]:a.value.filter(J=>(J._liveEpoch||0)>B);a.value=k(Y,re).slice(0,10),c.value=re.length}catch{}de===x&&(n.value=!1)}async function A(){const de=++b,B=_;l.value=!0;try{const Y=await j.get("/api/audit?error_only=1&limit=5");if(de!==b)return;const re=B===_?[]:i.value.filter(J=>(J._liveErrorEpoch||0)>B);i.value=k(Y,re).slice(0,5),o.value=!1}catch{if(de!==b)return;o.value=B===_||i.value.length===0}de===b&&(l.value=!1)}async function w(){try{const de=await j.get("/api/knowledge");d.value=(Array.isArray(de)?de:[]).reduce((B,Y)=>B+(Y.chunks||0),0)}catch{d.value=null}}async function I(){try{const de=await j.get("/api/agents");r.value=de.filter(B=>B.status==="running")}catch{}}async function U(){u.value={...u.value,reload:!0};try{await j.post("/api/reload"),Ce.success("Config reloaded")}catch(de){Ce.error(de.message)}u.value={...u.value,reload:!1}}async function C(){if(!await ts({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const B=e.value.session_count;e.value={...e.value,session_count:0};try{const Y=await j.post("/api/sessions/clear-all");Ce.success(`Cleared ${Y.count} session${Y.count!==1?"s":""}`),await O()}catch(Y){e.value={...e.value,session_count:B},Ce.error(Y.message)}u.value={...u.value,clearSessions:!1}}async function F(){if(!await ts({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const B=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Y=await j.post("/api/loops/stop-all");Ce.success(Y.result),await O()}catch(Y){e.value={...e.value,loop_count:B},Ce.error(Y.message)}u.value={...u.value,stopLoops:!1}}function Z(){t.value=!0,s.value=null,O(),T(),A(),I()}let W=null,P=null,N=null;function D(de){if(de.payload&&de.payload.tool_name){y+=1;const B={...de.payload,_isNew:!0,_key:++p,_liveEpoch:y};a.value.unshift(B),a.value.length>10&&a.value.pop(),c.value++,B.error&&(_+=1,B._liveErrorEpoch=_,o.value=!1,i.value.unshift(B),i.value.length>5&&i.value.pop()),setTimeout(()=>{B._isNew=!1},1500),clearTimeout(N),N=setTimeout(()=>{c.value=0},1e4)}}let oe=null;return tt(async()=>{await Promise.all([O(),T(),A(),I(),w()]),W=setInterval(O,15e3),P=setInterval(I,1e4),dt.subscribe("events",D),oe=dt.onReconnected(()=>{T(),A()})}),xt(()=>{W&&clearInterval(W),P&&clearInterval(P),clearTimeout(N),dt.unsubscribe("events",D),oe&&(oe(),oe=null)}),{status:e,loading:t,error:s,uptime:m,uptimeRingOffset:h,stats:g,healthIndicators:R,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:T,fetchErrors:A,fetchStatus:O,onEvent:D,formatTime:TS,formatDuration:Gi,retry:Z,reloadConfig:U,clearSessions:C,stopAllLoops:F}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Cf(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function CC(e){if(Array.isArray(e))return e}function TC(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function EC(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function AC(e,t){return CC(e)||TC(e,t)||RC(e,t)||EC()}function RC(e,t){if(e){if(typeof e=="string")return Cf(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Cf(e,t):void 0}}const mg=Object.entries,Tf=Object.setPrototypeOf,IC=Object.isFrozen,OC=Object.getPrototypeOf,LC=Object.getOwnPropertyDescriptor;let As=Object.freeze,ia=Object.seal,_i=Object.create,hg=typeof Reflect<"u"&&Reflect,fd=hg.apply,md=hg.construct;As||(As=function(t){return t});ia||(ia=function(t){return t});fd||(fd=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});md||(md=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const Ha=Wt(Array.prototype.forEach),NC=Wt(Array.prototype.lastIndexOf),Ef=Wt(Array.prototype.pop),vi=Wt(Array.prototype.push),MC=Wt(Array.prototype.splice),ks=Array.isArray,yl=Wt(String.prototype.toLowerCase),Tc=Wt(String.prototype.toString),Af=Wt(String.prototype.match),gi=Wt(String.prototype.replace),Rf=Wt(String.prototype.indexOf),DC=Wt(String.prototype.trim),PC=Wt(Number.prototype.toString),$C=Wt(Boolean.prototype.toString),If=typeof BigInt>"u"?null:Wt(BigInt.prototype.toString),Of=typeof Symbol>"u"?null:Wt(Symbol.prototype.toString),Dt=Wt(Object.prototype.hasOwnProperty),pl=Wt(Object.prototype.toString),ls=Wt(RegExp.prototype.test),Nn=FC(TypeError);function Wt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return fd(e,t,a)}}function FC(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return md(e,s)}}function et(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:yl;if(Tf&&Tf(e,null),!ks(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(IC(t)||(t[a]=i),n=i)}e[n]=!0}return e}function UC(e){for(let t=0;t<e.length;t++)Dt(e,t)||(e[t]=null);return e}function ms(e){const t=_i(null);for(const a of mg(e)){var s=AC(a,2);const n=s[0],i=s[1];Dt(e,n)&&(ks(i)?t[n]=UC(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ms(i):t[n]=i)}return t}function BC(e){switch(typeof e){case"string":return e;case"number":return PC(e);case"boolean":return $C(e);case"bigint":return If?If(e):"0";case"symbol":return Of?Of(e):"Symbol()";case"undefined":return pl(e);case"function":case"object":{if(e===null)return pl(e);const t=e,s=xa(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:pl(a)}return pl(e)}default:return pl(e)}}function xa(e,t){for(;e!==null;){const a=LC(e,t);if(a){if(a.get)return Wt(a.get);if(typeof a.value=="function")return Wt(a.value)}e=OC(e)}function s(){return null}return s}function zC(e){try{return ls(e,""),!0}catch{return!1}}const Lf=As(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Ec=As(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Ac=As(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),HC=As(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Rc=As(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),jC=As(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Nf=As(["#text"]),Mf=As(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Ic=As(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Df=As(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),No=As(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),VC=ia(/{{[\w\W]*|^[\w\W]*}}/g),qC=ia(/<%[\w\W]*|^[\w\W]*%>/g),GC=ia(/\${[\w\W]*/g),WC=ia(/^data-[\-\w.\u00B7-\uFFFF]+$/),KC=ia(/^aria-[\-\w]+$/),Pf=ia(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),JC=ia(/^(?:\w+script|data):/i),ZC=ia(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),YC=ia(/^html$/i),QC=ia(/^[a-z][.\w]*(-[.\w]+)+$/i),ba={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},XC=function(){return typeof window>"u"?null:window},eT=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},$f=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function vg(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:XC();const t=Ie=>vg(Ie);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==ba.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,m=xa(p,"cloneNode"),h=xa(p,"remove"),g=xa(p,"nextSibling"),R=xa(p,"childNodes"),O=xa(p,"parentNode"),x=xa(p,"shadowRoot"),b=xa(p,"attributes"),y=l&&l.prototype?xa(l.prototype,"nodeType"):null,_=l&&l.prototype?xa(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ie=s.createElement("template");Ie.content&&Ie.content.ownerDocument&&(s=Ie.content.ownerDocument)}let k,T="",A,w=!1,I=0;const U=function(){if(I>0)throw Nn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},C=function(M){U(),I++;try{return k.createHTML(M)}finally{I--}},F=function(M){U(),I++;try{return k.createScriptURL(M)}finally{I--}},Z=function(){return w||(A=eT(u,n),w=!0),A},W=s,P=W.implementation,N=W.createNodeIterator,D=W.createDocumentFragment,oe=W.getElementsByTagName,de=a.importNode;let B=$f();t.isSupported=typeof mg=="function"&&typeof O=="function"&&P&&P.createHTMLDocument!==void 0;const Y=VC,re=qC,J=GC,he=WC,fe=KC,K=JC,pe=ZC,ve=QC;let ye=Pf,_e=null;const Fe=et({},[...Lf,...Ec,...Ac,...Rc,...Nf]);let E=null;const $=et({},[...Mf,...Ic,...Df,...No]);let G=Object.seal(_i(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ie=null,L=null;const Q=Object.seal(_i(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,H=!0,te=!1,X=!0,ge=!1,me=!0,we=!1,Ee=!1,$e=!1,We=!1,He=!1,Ve=!1,Ze=!0,st=!1;const Qe="user-content-";let ee=!0,Se=!1,Re={},be=null;const ne=et({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Le=null;const Me=et({},["audio","video","img","source","image","track"]);let ot=null;const ss=et({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Xe="http://www.w3.org/1998/Math/MathML",Ot="http://www.w3.org/2000/svg",Ft="http://www.w3.org/1999/xhtml";let Rs=Ft,pa=!1,fa=null;const as=et({},[Xe,Ot,Ft],Tc);let Zs=et({},["mi","mo","mn","ms","mtext"]),ns=et({},["annotation-xml"]);const la=et({},["title","style","font","a","script"]);let Is=null;const Ra=["application/xhtml+xml","text/html"],Ys="text/html";let ut=null,Bs=null;const Ia=s.createElement("form"),le=function(M){return M instanceof RegExp||M instanceof Function},Ae=function(){let M=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Bs&&Bs===M)return;(!M||typeof M!="object")&&(M={}),M=ms(M),Is=Ra.indexOf(M.PARSER_MEDIA_TYPE)===-1?Ys:M.PARSER_MEDIA_TYPE,ut=Is==="application/xhtml+xml"?Tc:yl,_e=Dt(M,"ALLOWED_TAGS")&&ks(M.ALLOWED_TAGS)?et({},M.ALLOWED_TAGS,ut):Fe,E=Dt(M,"ALLOWED_ATTR")&&ks(M.ALLOWED_ATTR)?et({},M.ALLOWED_ATTR,ut):$,fa=Dt(M,"ALLOWED_NAMESPACES")&&ks(M.ALLOWED_NAMESPACES)?et({},M.ALLOWED_NAMESPACES,Tc):as,ot=Dt(M,"ADD_URI_SAFE_ATTR")&&ks(M.ADD_URI_SAFE_ATTR)?et(ms(ss),M.ADD_URI_SAFE_ATTR,ut):ss,Le=Dt(M,"ADD_DATA_URI_TAGS")&&ks(M.ADD_DATA_URI_TAGS)?et(ms(Me),M.ADD_DATA_URI_TAGS,ut):Me,be=Dt(M,"FORBID_CONTENTS")&&ks(M.FORBID_CONTENTS)?et({},M.FORBID_CONTENTS,ut):ne,ie=Dt(M,"FORBID_TAGS")&&ks(M.FORBID_TAGS)?et({},M.FORBID_TAGS,ut):ms({}),L=Dt(M,"FORBID_ATTR")&&ks(M.FORBID_ATTR)?et({},M.FORBID_ATTR,ut):ms({}),Re=Dt(M,"USE_PROFILES")?M.USE_PROFILES&&typeof M.USE_PROFILES=="object"?ms(M.USE_PROFILES):M.USE_PROFILES:!1,ue=M.ALLOW_ARIA_ATTR!==!1,H=M.ALLOW_DATA_ATTR!==!1,te=M.ALLOW_UNKNOWN_PROTOCOLS||!1,X=M.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ge=M.SAFE_FOR_TEMPLATES||!1,me=M.SAFE_FOR_XML!==!1,we=M.WHOLE_DOCUMENT||!1,We=M.RETURN_DOM||!1,He=M.RETURN_DOM_FRAGMENT||!1,Ve=M.RETURN_TRUSTED_TYPE||!1,$e=M.FORCE_BODY||!1,Ze=M.SANITIZE_DOM!==!1,st=M.SANITIZE_NAMED_PROPS||!1,ee=M.KEEP_CONTENT!==!1,Se=M.IN_PLACE||!1,ye=zC(M.ALLOWED_URI_REGEXP)?M.ALLOWED_URI_REGEXP:Pf,Rs=typeof M.NAMESPACE=="string"?M.NAMESPACE:Ft,Zs=Dt(M,"MATHML_TEXT_INTEGRATION_POINTS")&&M.MATHML_TEXT_INTEGRATION_POINTS&&typeof M.MATHML_TEXT_INTEGRATION_POINTS=="object"?ms(M.MATHML_TEXT_INTEGRATION_POINTS):et({},["mi","mo","mn","ms","mtext"]),ns=Dt(M,"HTML_INTEGRATION_POINTS")&&M.HTML_INTEGRATION_POINTS&&typeof M.HTML_INTEGRATION_POINTS=="object"?ms(M.HTML_INTEGRATION_POINTS):et({},["annotation-xml"]);const ce=Dt(M,"CUSTOM_ELEMENT_HANDLING")&&M.CUSTOM_ELEMENT_HANDLING&&typeof M.CUSTOM_ELEMENT_HANDLING=="object"?ms(M.CUSTOM_ELEMENT_HANDLING):_i(null);if(G=_i(null),Dt(ce,"tagNameCheck")&&le(ce.tagNameCheck)&&(G.tagNameCheck=ce.tagNameCheck),Dt(ce,"attributeNameCheck")&&le(ce.attributeNameCheck)&&(G.attributeNameCheck=ce.attributeNameCheck),Dt(ce,"allowCustomizedBuiltInElements")&&typeof ce.allowCustomizedBuiltInElements=="boolean"&&(G.allowCustomizedBuiltInElements=ce.allowCustomizedBuiltInElements),ge&&(H=!1),He&&(We=!0),Re&&(_e=et({},Nf),E=_i(null),Re.html===!0&&(et(_e,Lf),et(E,Mf)),Re.svg===!0&&(et(_e,Ec),et(E,Ic),et(E,No)),Re.svgFilters===!0&&(et(_e,Ac),et(E,Ic),et(E,No)),Re.mathMl===!0&&(et(_e,Rc),et(E,Df),et(E,No))),Q.tagCheck=null,Q.attributeCheck=null,Dt(M,"ADD_TAGS")&&(typeof M.ADD_TAGS=="function"?Q.tagCheck=M.ADD_TAGS:ks(M.ADD_TAGS)&&(_e===Fe&&(_e=ms(_e)),et(_e,M.ADD_TAGS,ut))),Dt(M,"ADD_ATTR")&&(typeof M.ADD_ATTR=="function"?Q.attributeCheck=M.ADD_ATTR:ks(M.ADD_ATTR)&&(E===$&&(E=ms(E)),et(E,M.ADD_ATTR,ut))),Dt(M,"ADD_URI_SAFE_ATTR")&&ks(M.ADD_URI_SAFE_ATTR)&&et(ot,M.ADD_URI_SAFE_ATTR,ut),Dt(M,"FORBID_CONTENTS")&&ks(M.FORBID_CONTENTS)&&(be===ne&&(be=ms(be)),et(be,M.FORBID_CONTENTS,ut)),Dt(M,"ADD_FORBID_CONTENTS")&&ks(M.ADD_FORBID_CONTENTS)&&(be===ne&&(be=ms(be)),et(be,M.ADD_FORBID_CONTENTS,ut)),ee&&(_e["#text"]=!0),we&&et(_e,["html","head","body"]),_e.table&&(et(_e,["tbody"]),delete ie.tbody),M.TRUSTED_TYPES_POLICY){if(typeof M.TRUSTED_TYPES_POLICY.createHTML!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof M.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Nn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const xe=k;k=M.TRUSTED_TYPES_POLICY;try{T=C("")}catch(Ue){throw k=xe,Ue}}else M.TRUSTED_TYPES_POLICY===null?(k=void 0,T=""):(k===void 0&&(k=Z()),k&&typeof T=="string"&&(T=C("")));(B.uponSanitizeElement.length>0||B.uponSanitizeAttribute.length>0)&&_e===Fe&&(_e=ms(_e)),B.uponSanitizeAttribute.length>0&&E===$&&(E=ms(E)),As&&As(M),Bs=M},Je=et({},[...Ec,...Ac,...HC]),it=et({},[...Rc,...jC]),kt=function(M){let ce=O(M);(!ce||!ce.tagName)&&(ce={namespaceURI:Rs,tagName:"template"});const xe=yl(M.tagName),Ue=yl(ce.tagName);return fa[M.namespaceURI]?M.namespaceURI===Ot?ce.namespaceURI===Ft?xe==="svg":ce.namespaceURI===Xe?xe==="svg"&&(Ue==="annotation-xml"||Zs[Ue]):!!Je[xe]:M.namespaceURI===Xe?ce.namespaceURI===Ft?xe==="math":ce.namespaceURI===Ot?xe==="math"&&ns[Ue]:!!it[xe]:M.namespaceURI===Ft?ce.namespaceURI===Ot&&!ns[Ue]||ce.namespaceURI===Xe&&!Zs[Ue]?!1:!it[xe]&&(la[xe]||!Je[xe]):!!(Is==="application/xhtml+xml"&&fa[M.namespaceURI]):!1},mt=function(M){vi(t.removed,{element:M});try{O(M).removeChild(M)}catch{if(h(M),!O(M))throw Nn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Oa=function(M){const ce=R?R(M):M.childNodes;if(ce){const Ue=[];Ha(ce,je=>{vi(Ue,je)}),Ha(Ue,je=>{try{h(je)}catch{}})}const xe=b?b(M):null;if(xe)for(let Ue=xe.length-1;Ue>=0;--Ue){const je=xe[Ue],qe=je&&je.name;if(typeof qe=="string")try{M.removeAttribute(qe)}catch{}}},zs=function(M,ce){try{vi(t.removed,{attribute:ce.getAttributeNode(M),from:ce})}catch{vi(t.removed,{attribute:null,from:ce})}if(ce.removeAttribute(M),M==="is")if(We||He)try{mt(ce)}catch{}else try{ce.setAttribute(M,"")}catch{}},Zi=function(M){const ce=b?b(M):M.attributes;if(ce)for(let xe=ce.length-1;xe>=0;--xe){const Ue=ce[xe],je=Ue&&Ue.name;if(!(typeof je!="string"||E[ut(je)]))try{M.removeAttribute(je)}catch{}}},ti=function(M){const ce=[M];for(;ce.length>0;){const xe=ce.pop();(y?y(xe):xe.nodeType)===ba.element&&Zi(xe);const je=R?R(xe):xe.childNodes;if(je)for(let qe=je.length-1;qe>=0;--qe)ce.push(je[qe])}},is=function(M){let ce=null,xe=null;if($e)M="<remove></remove>"+M;else{const qe=Af(M,/^[\r\n\t ]+/);xe=qe&&qe[0]}Is==="application/xhtml+xml"&&Rs===Ft&&(M='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+M+"</body></html>");const Ue=k?C(M):M;if(Rs===Ft)try{ce=new d().parseFromString(Ue,Is)}catch{}if(!ce||!ce.documentElement){ce=P.createDocument(Rs,"template",null);try{ce.documentElement.innerHTML=pa?T:Ue}catch{}}const je=ce.body||ce.documentElement;return M&&xe&&je.insertBefore(s.createTextNode(xe),je.childNodes[0]||null),Rs===Ft?oe.call(ce,we?"html":"body")[0]:we?ce.documentElement:je},si=function(M){return N.call(M.ownerDocument||M,M,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},La=function(M){var ce,xe;M.normalize();const Ue=N.call(M.ownerDocument||M,M,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let je=Ue.nextNode();for(;je;){let Lt=je.data;Ha([Y,re,J],rt=>{Lt=gi(Lt,rt," ")}),je.data=Lt,je=Ue.nextNode()}const qe=(ce=(xe=M.querySelectorAll)===null||xe===void 0?void 0:xe.call(M,"template"))!==null&&ce!==void 0?ce:[];Ha(Array.from(qe),Lt=>{Qt(Lt.content)&&La(Lt.content)})},dn=function(M){const ce=_?_(M):null;return typeof ce!="string"||ut(ce)!=="form"?!1:typeof M.nodeName!="string"||typeof M.textContent!="string"||typeof M.removeChild!="function"||M.attributes!==b(M)||typeof M.removeAttribute!="function"||typeof M.setAttribute!="function"||typeof M.namespaceURI!="string"||typeof M.insertBefore!="function"||typeof M.hasChildNodes!="function"||M.nodeType!==y(M)||M.childNodes!==R(M)},Qt=function(M){if(!y||typeof M!="object"||M===null)return!1;try{return y(M)===ba.documentFragment}catch{return!1}},Na=function(M){if(!y||typeof M!="object"||M===null)return!1;try{return typeof y(M)=="number"}catch{return!1}};function xs(Ie,M,ce){Ha(Ie,xe=>{xe.call(t,M,ce,Bs)})}const ai=function(M){let ce=null;if(xs(B.beforeSanitizeElements,M,null),dn(M))return mt(M),!0;const xe=ut(_?_(M):M.nodeName);if(xs(B.uponSanitizeElement,M,{tagName:xe,allowedTags:_e}),me&&M.hasChildNodes()&&!Na(M.firstElementChild)&&ls(/<[/\w!]/g,M.innerHTML)&&ls(/<[/\w!]/g,M.textContent)||me&&M.namespaceURI===Ft&&xe==="style"&&Na(M.firstElementChild)||M.nodeType===ba.progressingInstruction||me&&M.nodeType===ba.comment&&ls(/<[/\w]/g,M.data))return mt(M),!0;if(ie[xe]||!(Q.tagCheck instanceof Function&&Q.tagCheck(xe))&&!_e[xe]){if(!ie[xe]&&Ma(xe)&&(G.tagNameCheck instanceof RegExp&&ls(G.tagNameCheck,xe)||G.tagNameCheck instanceof Function&&G.tagNameCheck(xe)))return!1;if(ee&&!be[xe]){const je=O(M),qe=R(M);if(qe&&je){const Lt=qe.length;for(let rt=Lt-1;rt>=0;--rt){const Tt=Se?qe[rt]:m(qe[rt],!0);je.insertBefore(Tt,g(M))}}}return mt(M),!0}return(y?y(M):M.nodeType)===ba.element&&!kt(M)||(xe==="noscript"||xe==="noembed"||xe==="noframes")&&ls(/<\/no(script|embed|frames)/i,M.innerHTML)?(mt(M),!0):(ge&&M.nodeType===ba.text&&(ce=M.textContent,Ha([Y,re,J],je=>{ce=gi(ce,je," ")}),M.textContent!==ce&&(vi(t.removed,{element:M.cloneNode()}),M.textContent=ce)),xs(B.afterSanitizeElements,M,null),!1)},ni=function(M,ce,xe){if(L[ce]||Ze&&(ce==="id"||ce==="name")&&(xe in s||xe in Ia))return!1;const Ue=E[ce]||Q.attributeCheck instanceof Function&&Q.attributeCheck(ce,M);if(!(H&&!L[ce]&&ls(he,ce))){if(!(ue&&ls(fe,ce))){if(!Ue||L[ce]){if(!(Ma(M)&&(G.tagNameCheck instanceof RegExp&&ls(G.tagNameCheck,M)||G.tagNameCheck instanceof Function&&G.tagNameCheck(M))&&(G.attributeNameCheck instanceof RegExp&&ls(G.attributeNameCheck,ce)||G.attributeNameCheck instanceof Function&&G.attributeNameCheck(ce,M))||ce==="is"&&G.allowCustomizedBuiltInElements&&(G.tagNameCheck instanceof RegExp&&ls(G.tagNameCheck,xe)||G.tagNameCheck instanceof Function&&G.tagNameCheck(xe))))return!1}else if(!ot[ce]){if(!ls(ye,gi(xe,pe,""))){if(!((ce==="src"||ce==="xlink:href"||ce==="href")&&M!=="script"&&Rf(xe,"data:")===0&&Le[M])){if(!(te&&!ls(K,gi(xe,pe,"")))){if(xe)return!1}}}}}}return!0},un=et({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ma=function(M){return!un[yl(M)]&&ls(ve,M)},En=function(M){xs(B.beforeSanitizeAttributes,M,null);const ce=M.attributes;if(!ce||dn(M))return;const xe={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:E,forceKeepAttr:void 0};let Ue=ce.length;for(;Ue--;){const je=ce[Ue],qe=je.name,Lt=je.namespaceURI,rt=je.value,Tt=ut(qe),Ut=rt;let Nt=qe==="value"?Ut:DC(Ut);if(xe.attrName=Tt,xe.attrValue=Nt,xe.keepAttr=!0,xe.forceKeepAttr=void 0,xs(B.uponSanitizeAttribute,M,xe),Nt=xe.attrValue,st&&(Tt==="id"||Tt==="name")&&Rf(Nt,Qe)!==0&&(zs(qe,M),Nt=Qe+Nt),me&&ls(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){zs(qe,M);continue}if(Tt==="attributename"&&Af(Nt,"href")){zs(qe,M);continue}if(xe.forceKeepAttr)continue;if(!xe.keepAttr){zs(qe,M);continue}if(!X&&ls(/\/>/i,Nt)){zs(qe,M);continue}ge&&Ha([Y,re,J],ma=>{Nt=gi(Nt,ma," ")});const Pa=ut(M.nodeName);if(!ni(Pa,Tt,Nt)){zs(qe,M);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Lt)switch(u.getAttributeType(Pa,Tt)){case"TrustedHTML":{Nt=C(Nt);break}case"TrustedScriptURL":{Nt=F(Nt);break}}if(Nt!==Ut)try{Lt?M.setAttributeNS(Lt,qe,Nt):M.setAttribute(qe,Nt),dn(M)?mt(M):Ef(t.removed)}catch{zs(qe,M)}}xs(B.afterSanitizeAttributes,M,null)},Da=function(M){let ce=null;const xe=si(M);for(xs(B.beforeSanitizeShadowDOM,M,null);ce=xe.nextNode();)if(xs(B.uponSanitizeShadowNode,ce,null),ai(ce),En(ce),Qt(ce.content)&&Da(ce.content),(y?y(ce):ce.nodeType)===ba.element){const je=x?x(ce):ce.shadowRoot;Qt(je)&&(pn(je),Da(je))}xs(B.afterSanitizeShadowDOM,M,null)},pn=function(M){const ce=[{node:M,shadow:null}];for(;ce.length>0;){const xe=ce.pop();if(xe.shadow){Da(xe.shadow);continue}const Ue=xe.node,qe=(y?y(Ue):Ue.nodeType)===ba.element,Lt=R?R(Ue):Ue.childNodes;if(Lt)for(let rt=Lt.length-1;rt>=0;--rt)ce.push({node:Lt[rt],shadow:null});if(qe){const rt=_?_(Ue):null;if(typeof rt=="string"&&ut(rt)==="template"){const Tt=Ue.content;Qt(Tt)&&ce.push({node:Tt,shadow:null})}}if(qe){const rt=x?x(Ue):Ue.shadowRoot;Qt(rt)&&ce.push({node:null,shadow:rt},{node:rt,shadow:null})}}};return t.sanitize=function(Ie){let M=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ce=null,xe=null,Ue=null,je=null;if(pa=!Ie,pa&&(Ie="<!-->"),typeof Ie!="string"&&!Na(Ie)&&(Ie=BC(Ie),typeof Ie!="string"))throw Nn("dirty is not a string, aborting");if(!t.isSupported)return Ie;Ee||Ae(M),t.removed=[];const qe=Se&&typeof Ie!="string"&&Na(Ie);if(qe){const Tt=_?_(Ie):Ie.nodeName;if(typeof Tt=="string"){const Ut=ut(Tt);if(!_e[Ut]||ie[Ut])throw Nn("root node is forbidden and cannot be sanitized in-place")}if(dn(Ie))throw Nn("root node is clobbered and cannot be sanitized in-place");try{pn(Ie)}catch(Ut){throw Oa(Ie),Ut}}else if(Na(Ie))ce=is("<!---->"),xe=ce.ownerDocument.importNode(Ie,!0),xe.nodeType===ba.element&&xe.nodeName==="BODY"||xe.nodeName==="HTML"?ce=xe:ce.appendChild(xe),pn(xe);else{if(!We&&!ge&&!we&&Ie.indexOf("<")===-1)return k&&Ve?C(Ie):Ie;if(ce=is(Ie),!ce)return We?null:Ve?T:""}ce&&$e&&mt(ce.firstChild);const Lt=si(qe?Ie:ce);try{for(;Ue=Lt.nextNode();)ai(Ue),En(Ue),Qt(Ue.content)&&Da(Ue.content)}catch(Tt){throw qe&&Oa(Ie),Tt}if(qe)return Ha(t.removed,Tt=>{Tt.element&&ti(Tt.element)}),ge&&La(Ie),Ie;if(We){if(ge&&La(ce),He)for(je=D.call(ce.ownerDocument);ce.firstChild;)je.appendChild(ce.firstChild);else je=ce;return(E.shadowroot||E.shadowrootmode)&&(je=de.call(a,je,!0)),je}let rt=we?ce.outerHTML:ce.innerHTML;return we&&_e["!doctype"]&&ce.ownerDocument&&ce.ownerDocument.doctype&&ce.ownerDocument.doctype.name&&ls(YC,ce.ownerDocument.doctype.name)&&(rt="<!DOCTYPE "+ce.ownerDocument.doctype.name+`>
`+rt),ge&&Ha([Y,re,J],Tt=>{rt=gi(rt,Tt," ")}),k&&Ve?C(rt):rt},t.setConfig=function(){let Ie=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ae(Ie),Ee=!0},t.clearConfig=function(){Bs=null,Ee=!1,k=A,T=""},t.isValidAttribute=function(Ie,M,ce){Bs||Ae({});const xe=ut(Ie),Ue=ut(M);return ni(xe,Ue,ce)},t.addHook=function(Ie,M){typeof M=="function"&&vi(B[Ie],M)},t.removeHook=function(Ie,M){if(M!==void 0){const ce=NC(B[Ie],M);return ce===-1?void 0:MC(B[Ie],ce,1)[0]}return Ef(B[Ie])},t.removeHooks=function(Ie){B[Ie]=[]},t.removeAllHooks=function(){B=$f()},t}var Ff=vg();function xu(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ei=xu();function gg(e){ei=e}var Al={exec:()=>null};function yt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Ts.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var Ts={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},tT=/^(?:[ \t]*(?:\n|$))+/,sT=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,aT=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,ro=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,nT=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,_u=/(?:[*+-]|\d{1,9}[.)])/,bg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,yg=yt(bg).replace(/bull/g,_u).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),iT=yt(bg).replace(/bull/g,_u).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),wu=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,lT=/^[^\n]+/,ku=/(?!\s*\])(?:\\.|[^\[\]\\])+/,oT=yt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",ku).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),rT=yt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,_u).getRegex(),Kr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Su=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,cT=yt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Su).replace("tag",Kr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),xg=yt(wu).replace("hr",ro).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Kr).getRegex(),dT=yt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",xg).getRegex(),Cu={blockquote:dT,code:sT,def:oT,fences:aT,heading:nT,hr:ro,html:cT,lheading:yg,list:rT,newline:tT,paragraph:xg,table:Al,text:lT},Uf=yt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",ro).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Kr).getRegex(),uT={...Cu,lheading:iT,table:Uf,paragraph:yt(wu).replace("hr",ro).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Uf).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Kr).getRegex()},pT={...Cu,html:yt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Su).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Al,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:yt(wu).replace("hr",ro).replace("heading",` *#{1,6} *[^
]`).replace("lheading",yg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},fT=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,mT=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,_g=/^( {2,}|\\)\n(?!\s*$)/,hT=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Jr=/[\p{P}\p{S}]/u,Tu=/[\s\p{P}\p{S}]/u,wg=/[^\s\p{P}\p{S}]/u,vT=yt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Tu).getRegex(),kg=/(?!~)[\p{P}\p{S}]/u,gT=/(?!~)[\s\p{P}\p{S}]/u,bT=/(?:[^\s\p{P}\p{S}]|~)/u,yT=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Sg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,xT=yt(Sg,"u").replace(/punct/g,Jr).getRegex(),_T=yt(Sg,"u").replace(/punct/g,kg).getRegex(),Cg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",wT=yt(Cg,"gu").replace(/notPunctSpace/g,wg).replace(/punctSpace/g,Tu).replace(/punct/g,Jr).getRegex(),kT=yt(Cg,"gu").replace(/notPunctSpace/g,bT).replace(/punctSpace/g,gT).replace(/punct/g,kg).getRegex(),ST=yt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,wg).replace(/punctSpace/g,Tu).replace(/punct/g,Jr).getRegex(),CT=yt(/\\(punct)/,"gu").replace(/punct/g,Jr).getRegex(),TT=yt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),ET=yt(Su).replace("(?:-->|$)","-->").getRegex(),AT=yt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",ET).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),gr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,RT=yt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",gr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Tg=yt(/^!?\[(label)\]\[(ref)\]/).replace("label",gr).replace("ref",ku).getRegex(),Eg=yt(/^!?\[(ref)\](?:\[\])?/).replace("ref",ku).getRegex(),IT=yt("reflink|nolink(?!\\()","g").replace("reflink",Tg).replace("nolink",Eg).getRegex(),Eu={_backpedal:Al,anyPunctuation:CT,autolink:TT,blockSkip:yT,br:_g,code:mT,del:Al,emStrongLDelim:xT,emStrongRDelimAst:wT,emStrongRDelimUnd:ST,escape:fT,link:RT,nolink:Eg,punctuation:vT,reflink:Tg,reflinkSearch:IT,tag:AT,text:hT,url:Al},OT={...Eu,link:yt(/^!?\[(label)\]\((.*?)\)/).replace("label",gr).getRegex(),reflink:yt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",gr).getRegex()},hd={...Eu,emStrongRDelimAst:kT,emStrongLDelim:_T,url:yt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},LT={...hd,br:yt(_g).replace("{2,}","*").getRegex(),text:yt(hd.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Mo={normal:Cu,gfm:uT,pedantic:pT},fl={normal:Eu,gfm:hd,breaks:LT,pedantic:OT},NT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Bf=e=>NT[e];function _a(e,t){if(t){if(Ts.escapeTest.test(e))return e.replace(Ts.escapeReplace,Bf)}else if(Ts.escapeTestNoEncode.test(e))return e.replace(Ts.escapeReplaceNoEncode,Bf);return e}function zf(e){try{e=encodeURI(e).replace(Ts.percentDecode,"%")}catch{return null}return e}function Hf(e,t){var i;const s=e.replace(Ts.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(Ts.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(Ts.slashPipe,"|");return a}function ml(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function MT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function jf(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function DT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var br=class{constructor(e){wt(this,"options");wt(this,"rules");wt(this,"lexer");this.options=e||ei}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ml(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=DT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=ml(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ml(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ml(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),p=e.split(`
`,1)[0],m=!u.trim(),h=0;if(this.options.pedantic?(h=2,d=u.trimStart()):m?h=t[1].length+1:(h=t[2].search(this.rules.other.nonSpaceChar),h=h>4?1:h,d=u.slice(h),h+=t[1].length),m&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const O=this.rules.other.nextBulletRegex(h),x=this.rules.other.hrRegex(h),b=this.rules.other.fencesBeginRegex(h),y=this.rules.other.headingBeginRegex(h),_=this.rules.other.htmlBeginRegex(h);for(;e;){const k=e.split(`
`,1)[0];let T;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),T=p):T=p.replace(this.rules.other.tabCharGlobal,"    "),b.test(p)||y.test(p)||_.test(p)||O.test(p)||x.test(p))break;if(T.search(this.rules.other.nonSpaceChar)>=h||!p.trim())d+=`
`+T.slice(h);else{if(m||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||b.test(u)||y.test(u)||x.test(u))break;d+=`
`+p}!m&&!p.trim()&&(m=!0),c+=k+`
`,e=e.substring(k.length+1),u=T.slice(h)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,R;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(R=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!g,checked:R,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Hf(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(Hf(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ml(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=MT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),jf(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return jf(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}const m=p.slice(2,-2);return{type:"strong",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Za=class vd{constructor(t){wt(this,"tokens");wt(this,"options");wt(this,"state");wt(this,"tokenizer");wt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ei,this.options.tokenizer=this.options.tokenizer||new br,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Ts,block:Mo.normal,inline:fl.normal};this.options.pedantic?(s.block=Mo.pedantic,s.inline=fl.pedantic):this.options.gfm&&(s.block=Mo.gfm,this.options.breaks?s.inline=fl.breaks:s.inline=fl.gfm),this.tokenizer.rules=s}static get rules(){return{block:Mo,inline:fl}}static lex(t,s){return new vd(s).lex(t)}static lexInline(t,s){return new vd(s).inlineTokens(t)}lex(t){t=t.replace(Ts.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(Ts.tabCharGlobal,"    ").replace(Ts.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const m=t.slice(1);let h;this.options.extensions.startInline.forEach(g=>{h=g.call({lexer:this},m),typeof h=="number"&&h>=0&&(p=Math.min(p,h))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},yr=class{constructor(e){wt(this,"options");wt(this,"parser");this.options=e||ei}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(Ts.notSpaceStart))==null?void 0:i[0],n=e.replace(Ts.endingNewline,"")+`
`;return a?'<pre><code class="language-'+_a(a)+'">'+(s?n:_a(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:_a(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+_a(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${_a(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=zf(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+_a(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=zf(e);if(n===null)return _a(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${_a(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:_a(e.text)}},Au=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ya=class gd{constructor(t){wt(this,"options");wt(this,"renderer");wt(this,"textRenderer");this.options=t||ei,this.options.renderer=this.options.renderer||new yr,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Au}static parse(t,s){return new gd(s).parse(t)}static parseInline(t,s){return new gd(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Oc,Ho=(Oc=class{constructor(e){wt(this,"options");wt(this,"block");this.options=e||ei}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Za.lex:Za.lexInline}provideParser(){return this.block?Ya.parse:Ya.parseInline}},wt(Oc,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Oc),PT=class{constructor(...e){wt(this,"defaults",xu());wt(this,"options",this.setOptions);wt(this,"parse",this.parseMarkdown(!0));wt(this,"parseInline",this.parseMarkdown(!1));wt(this,"Parser",Ya);wt(this,"Renderer",yr);wt(this,"TextRenderer",Au);wt(this,"Lexer",Za);wt(this,"Tokenizer",br);wt(this,"Hooks",Ho);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new yr(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new br(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new Ho;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];Ho.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Za.lex(e,t??this.defaults)}parser(e,t){return Ya.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Za.lex:Za.lexInline,r=i.hooks?i.hooks.provideParser():e?Ya.parse:Ya.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+_a(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Kn=new PT;function gt(e,t){return Kn.parse(e,t)}gt.options=gt.setOptions=function(e){return Kn.setOptions(e),gt.defaults=Kn.defaults,gg(gt.defaults),gt};gt.getDefaults=xu;gt.defaults=ei;gt.use=function(...e){return Kn.use(...e),gt.defaults=Kn.defaults,gg(gt.defaults),gt};gt.walkTokens=function(e,t){return Kn.walkTokens(e,t)};gt.parseInline=Kn.parseInline;gt.Parser=Ya;gt.parser=Ya.parse;gt.Renderer=yr;gt.TextRenderer=Au;gt.Lexer=Za;gt.lexer=Za.lex;gt.Tokenizer=br;gt.Hooks=Ho;gt.parse=gt;gt.options;gt.setOptions;gt.use;gt.walkTokens;gt.parseInline;Ya.parse;Za.lex;const $T={breaks:!0,gfm:!0};function Vf(e){if(!e)return"";try{if(typeof gt<"u"&&gt.parse){const t=gt.parse(e,$T);return typeof Ff<"u"?Ff.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function FT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const UT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function BT(e){return UT[e]||"wrench"}const zT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function qf(e){if(!e)return[];const t=e.match(zT);return t?[...new Set(t)]:[]}const HT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=V(()=>t.value.trim().length>0&&!s.value),p=f(dt.state||"disconnected");let m=null;const h=V(()=>{const P=p.value;return P==="connected"?"Connected":P==="reconnecting"?"Reconnecting…":P==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],R=V(()=>{const P=Math.floor(l.value/4)%g.length,N=l.value;return N>3?`${g[P]} (${N}s)`:g[0]});function O(){zt(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function x(){if(!i.value)return;const P=i.value;P.style.height="auto",P.style.height=Math.min(P.scrollHeight,120)+"px"}function b(P,N,D={}){const oe={id:++c,role:P,content:N,timestamp:Date.now(),html:P==="bot"?Vf(N):"",tools_used:D.tools_used||[],is_error:D.is_error||!1,images:P==="bot"?qf(N):[],files:D.files||[],_showTools:!1};return e.value.push(oe),O(),P==="bot"&&zt(()=>y()),oe}function y(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(N=>{N.setAttribute("data-copy","true"),N.style.position="relative";const D=document.createElement("button");D.className="chat-code-copy",D.textContent="Copy",D.addEventListener("click",()=>{const oe=N.querySelector("code"),de=oe?oe.textContent:N.textContent;navigator.clipboard.writeText(de).then(()=>{D.textContent="Copied!",setTimeout(()=>{D.textContent="Copy"},1500)}).catch(()=>{})}),N.appendChild(D)})}function _(P){if(P===0)return!0;const N=e.value[P-1],D=e.value[P],oe=new Date(N.timestamp).toDateString(),de=new Date(D.timestamp).toDateString();return oe!==de}function k(P){const N=new Date(P),D=new Date;if(N.toDateString()===D.toDateString())return"Today";const oe=new Date(D);return oe.setDate(oe.getDate()-1),N.toDateString()===oe.toDateString()?"Yesterday":N.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function T(P){t.value=P,zt(()=>Z())}function A(P){window.open(P,"_blank","noopener")}function w(P){P.target.style.display="none"}function I(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function U(){r&&(clearInterval(r),r=null),l.value=0}function C(P){s.value&&(s.value=!1,U(),P.type==="chat_response"?b("bot",P.content,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]}):P.type==="chat_error"&&b("bot",P.error||"Unknown error",{is_error:!0}),zt(()=>{var N;return(N=i.value)==null?void 0:N.focus()}))}async function F(P){try{const N=await j.post("/api/chat",{content:P,channel_id:o.value});b("bot",N.response,{tools_used:N.tools_used||[],is_error:N.is_error||!1,files:N.files||[]})}catch(N){b("bot",N.message||"Failed to send message",{is_error:!0})}}async function Z(){const P=t.value.trim();if(!P||s.value)return;b("user",P),t.value="",s.value=!0,I(),i.value&&(i.value.style.height="auto"),dt.connected&&dt.sendChat(P,{channelId:o.value})||(await F(P),s.value=!1,U()),zt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}async function W(){a.value="";try{if(!o.value){const N=await j.get("/api/auth/session");o.value=N.channel_id||N.user_id||"web-user"}const P=await j.get("/api/sessions/"+encodeURIComponent(o.value));if(P&&P.messages&&P.messages.length>0){for(const N of P.messages){const D=N.role==="user"?"user":"bot";let oe=N.content||"";if(D==="user"){const B=oe.match(/^\[.*?\]:\s*/);B&&(oe=oe.slice(B[0].length))}if(!oe.trim())continue;const de={id:++c,role:D,content:oe,timestamp:N.timestamp?N.timestamp*1e3:Date.now(),html:D==="bot"?Vf(oe):"",tools_used:[],is_error:!1,images:D==="bot"?qf(oe):[],files:[],_showTools:!1};e.value.push(de)}zt(()=>{O(),y()})}}catch(P){P&&P.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Ce.error(a.value))}}return tt(()=>{dt.subscribe("chat",C),p.value=dt.state||"disconnected",m=dt.onState(P=>{p.value=P}),W(),zt(()=>{var P;return(P=i.value)==null?void 0:P.focus()})}),xt(()=>{dt.unsubscribe("chat",C),m&&(m(),m=null),U()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:h,typingText:R,suggestions:d,send:Z,autoResize:x,formatTime:FT,formatDate:k,showDateSeparator:_,useSuggestion:T,openImage:A,onImageError:w,getToolIcon:BT,loadHistory:W}}},jT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),m=f(!1),h=V(()=>e.value==="custom"),g=V(()=>[...i.value,...l.value]),R=V(()=>l.value.includes(e.value)),O=V(()=>{var A;return h.value?t.value||"Odin":((A=n.value[e.value])==null?void 0:A.name)||e.value}),x=V(()=>{var A;return h.value?s.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.identity)||""}),b=V(()=>{var A;return h.value?a.value||"(empty — will use Odin default)":((A=n.value[e.value])==null?void 0:A.voice)||""});async function y(){d.value=!0;try{const A=await j.get("/api/personality");e.value=A.preset||"odin",t.value=A.custom_name||"",s.value=A.custom_identity||"",a.value=A.custom_voice||"",n.value=A.presets||{},i.value=A.builtin_presets||[],l.value=A.user_presets||[]}catch(A){c.value=A.message}finally{d.value=!1}}async function _(){o.value=!0,c.value=null,r.value=!1;try{await j.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(A){c.value=A.message}finally{o.value=!1}}async function k(){const A=u.value.trim();if(A){m.value=!0,c.value=null;try{await j.post("/api/personality/presets",{name:A,display_name:O.value,identity:x.value,voice:b.value}),p.value=!1,u.value="",await y(),e.value=A.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{m.value=!1}}}async function T(){if(await ts({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await j.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await y(),e.value="odin"}catch(w){c.value=w.message}}}return tt(y),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:g,isCustom:h,isUserPreset:R,previewName:O,previewIdentity:x,previewVoice:b,saving:o,saved:r,error:c,loading:d,save:_,showSavePreset:p,newPresetName:u,savingPreset:m,saveAsPreset:k,deletePreset:T,builtinPresets:i,userPresets:l}},template:`
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
  `},VT={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,m=null;function h(){return p+=1,m==null||m.abort(),m=null,p}function g(_,k,T){return typeof j.postWithOptions=="function"?j.postWithOptions(_,k,{signal:T}):j.post(_,k)}async function R(){var T,A,w;a.value=!0,i.value="",l.value="Saving setup…";const _={},k=!!s.value.trim();t.value.trim()&&(_.web_api_token=t.value.trim()),s.value.trim()&&(_.discord_token=s.value.trim());try{const I=j.post("/api/setup/complete",_);t.value="",s.value="";const U=await I,C=((T=U.discord)==null?void 0:T.state)||U.discord_status;if(C==="failed"?(i.value=((A=U.discord)==null?void 0:A.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):C==="connecting"?l.value="Saved. Connecting Discord…":C==="ready"?l.value="Saved. Discord ready.":k?l.value="Saved. Discord token stored; attachment status is pending.":l.value=U.message||"Setup saved. Ready to sign in.",(w=U.restart_required)!=null&&w.length){const F=U.message||`Restart Odin to apply: ${U.restart_required.join(", ")}`;l.value.includes(F)||(l.value+=` ${F}`)}n.value=!0}catch(I){i.value=I.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function O(){const _=h(),k=typeof AbortController=="function"?new AbortController:null;m=k,o.value=!0,u.value="";try{const T=await g("/api/codex/device-code",void 0,k==null?void 0:k.signal);if(_!==p)return;c.value=T,r.value="pending";const A=await g("/api/codex/device-poll",{device_auth_id:T.device_auth_id,user_code:T.user_code,interval:T.interval},k==null?void 0:k.signal);if(_!==p)return;d.value=A||{},r.value="ready"}catch(T){_===p&&(T==null?void 0:T.name)!=="AbortError"&&(u.value=T.message||"Device sign-in failed.",r.value="failed")}finally{_===p&&(o.value=!1,m=null)}}function x(){h(),o.value=!1,y()}function b(){var _;(_=e.onComplete)==null||_.call(e)}function y(){r.value="",c.value=null,d.value={},u.value=""}return xt(()=>{h()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:R,onComplete:b,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:O,cancelDeviceLogin:x,clearDeviceState:y}}},Mt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Ag=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:SC,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:HT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:zS,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:ZS,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:g1,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:jT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:gC,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Mt("/operations","live")},{path:"/agents",redirect:Mt("/operations","agents")},{path:"/loops",redirect:Mt("/operations","loops")},{path:"/processes",redirect:Mt("/operations","processes")},{path:"/schedules",redirect:Mt("/operations","schedules")},{path:"/audit",redirect:Mt("/history","audit")},{path:"/sessions",redirect:Mt("/history","sessions")},{path:"/traces",redirect:Mt("/history","traces")},{path:"/usage",redirect:Mt("/history","usage")},{path:"/tools",redirect:Mt("/capabilities","tools")},{path:"/skills",redirect:Mt("/capabilities","skills")},{path:"/mcp",redirect:Mt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Mt("/capabilities","knowledge")},{path:"/memory",redirect:Mt("/capabilities","memory")},{path:"/learned",redirect:Mt("/capabilities","learned")},{path:"/health",redirect:Mt("/system","health")},{path:"/resources",redirect:Mt("/system","resources")},{path:"/logs",redirect:Mt("/system","logs")},{path:"/config",redirect:Mt("/system","config")},{path:"/host-access",redirect:Mt("/system","host-access")},{path:"/hosts",redirect:Mt("/system","hosts")},{path:"/internals",redirect:Mt("/system","internals")}],Rl=mS({history:Gk(),routes:Ag});Rl.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const qT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{j.setPersist(n.value),await j.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},GT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let m=null;const h=f("starting"),g=f(""),R=Ag.filter(B=>B.meta),O=V(()=>["Workspace","Operate","Observe","Manage"].map(B=>({name:B,routes:R.filter(Y=>Y.meta.section===B)})).filter(B=>B.routes.length)),x=V(()=>{var B;return((B=Rl.currentRoute.value.meta)==null?void 0:B.label)||"Odin"}),b=V(()=>{var B;return((B=Rl.currentRoute.value.meta)==null?void 0:B.section)||"Management"}),y=V(()=>{var B;return((B=Rl.currentRoute.value.meta)==null?void 0:B.description)||"Management console"});function _(){dt.disconnect(),P&&(clearInterval(P),P=null)}j.onSessionExpired=()=>{t.value=!0,_(),j.setToken(""),e.value="login"};function k(B){var Y;if((B.ctrlKey||B.metaKey)&&B.key.toLowerCase()==="k"){e.value==="ready"&&(B.preventDefault(),kf());return}if(a.value&&B.key==="Tab"){const re=[...((Y=n.value)==null?void 0:Y.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(re.length){const J=re[0],he=re[re.length-1];if(B.shiftKey&&(document.activeElement===J||!n.value.contains(document.activeElement))){B.preventDefault(),he.focus();return}if(!B.shiftKey&&(document.activeElement===he||!n.value.contains(document.activeElement))){B.preventDefault(),J.focus();return}}}if(B.key==="Escape"&&a.value){a.value=!1,B.preventDefault();return}if(B.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(B.target.tagName)){B.preventDefault();const re=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');re&&re.focus()}}function T(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function A(){try{const B=await j.get("/api/setup/status");if(B.mode==="pending"||B.needed===!0)return _(),e.value="setup",!0}catch(B){B==null||B.name}return!1}tt(async()=>{if(document.addEventListener("keydown",k),o=window.matchMedia("(max-width: 900px)"),T(),o.addEventListener("change",T),await A())return;const B=await j.check();B.ok?(e.value="ready",oe()):B.needsAuth?e.value="login":(e.value="ready",oe())});function w(){t.value=!1,e.value="ready",oe()}async function I(){if(await A())return;const B=await j.check();B.ok?(e.value="ready",oe()):B.needsAuth?e.value="login":(e.value="ready",oe())}async function U(){_(),e.value="login",await j.logout()}function C(){s.value=!s.value}function F(){a.value=!a.value}Gt(a,async B=>{var Y,re;if(B)r=document.activeElement,await zt(),(re=(Y=n.value)==null?void 0:Y.querySelector(".nav-item"))==null||re.focus();else if(r!=null&&r.isConnected){const J=r;r=null,requestAnimationFrame(()=>J.focus())}});const Z=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function W(B,Y="info",re=3e3){p.value={text:B,level:Y},clearTimeout(m),m=setTimeout(()=>{p.value=null},re)}let P=null,N=!1,D=[];function oe(){for(const B of D)B();D=[dt.onStatus(B=>{c.value=B}),dt.onLatencyChange(B=>{u.value=B}),dt.onState((B,Y)=>{d.value=B,B==="connected"?(N&&W("Connection restored","success"),N=!0):B==="reconnecting"&&Y.attempt===1&&W("Connection lost — reconnecting…","warn")})],dt.connect(),de(),P&&clearInterval(P),P=setInterval(de,15e3)}async function de(){try{const B=await j.get("/api/status");h.value=B.status==="online"?"online":"starting";const Y=B.uptime_seconds||0,re=Math.floor(Y/3600),J=Math.floor(Y%3600/60);g.value=`${re}h ${J}m uptime`}catch{h.value="offline",g.value=""}}return xt(()=>{P&&clearInterval(P);for(const B of D)B();D=[],dt.disconnect(),document.removeEventListener("keydown",k),o==null||o.removeEventListener("change",T)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:Z,wsToast:p,botStatus:h,botUptime:g,navRoutes:R,navGroups:O,currentPage:x,currentSection:b,currentDescription:y,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:w,onSetupComplete:I,logout:U,toggleSidebar:C,toggleMobileNavigation:F,openPalette:kf}}},cn=lr(GT);cn.component("odin-icon",_C);cn.component("login-screen",qT);cn.component("setup-page",VT);cn.component("toast-container",lk);cn.component("confirm-host",ok);cn.component("command-palette",xC);cn.directive("modal-focus",kC);cn.use(Rl);cn.mount("#app");
