var Bv=Object.defineProperty;var Hv=(e,t,s)=>t in e?Bv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var gt=(e,t,s)=>Hv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class jv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Rl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new br(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Rl("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new br((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}async consentListener(t){const s=await fetch("/api/setup/listener",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({expose_beyond_loopback:!0})}),a=await s.json().catch(()=>null);if(!s.ok)throw new br((a==null?void 0:a.error)||"Listener reauthentication failed",s.status,a);return a}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Rl((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Rl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Rl extends Error{constructor(t){super(t),this.name="AuthError"}}class br extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class zv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const H=new jv,st=new zv(H);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Rs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ye={},Jn=[],Qt=()=>{},Gn=()=>!1,Cn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Mo=e=>e.startsWith("onUpdate:"),Ze=Object.assign,Dc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Vv=Object.prototype.hasOwnProperty,rt=(e,t)=>Vv.call(e,t),Re=Array.isArray,Zn=e=>gi(e)==="[object Map]",En=e=>gi(e)==="[object Set]",qd=e=>gi(e)==="[object Date]",qv=e=>gi(e)==="[object RegExp]",Me=e=>typeof e=="function",Be=e=>typeof e=="string",ls=e=>typeof e=="symbol",lt=e=>e!==null&&typeof e=="object",Pc=e=>(lt(e)||Me(e))&&Me(e.then)&&Me(e.catch),sf=Object.prototype.toString,gi=e=>sf.call(e),Gv=e=>gi(e).slice(8,-1),Fo=e=>gi(e)==="[object Object]",$o=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ia=Rs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Wv=Rs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Uo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Kv=/-\w/g,vt=Uo(e=>e.replace(Kv,t=>t.slice(1).toUpperCase())),Jv=/\B([A-Z])/g,ys=Uo(e=>e.replace(Jv,"-$1").toLowerCase()),An=Uo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Yn=Uo(e=>e?`on${An(e)}`:""),qt=(e,t)=>!Object.is(e,t),Qn=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},af=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Bo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},no=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let Gd;const Ho=()=>Gd||(Gd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Zv(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Yv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Qv=Rs(Yv);function ml(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Be(a)?nf(a):ml(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Be(e)||lt(e))return e}const Xv=/;(?![^(]*\))/g,eg=/:([^]+)/,tg=/\/\*[^]*?\*\//g;function nf(e){const t={};return e.replace(tg,"").split(Xv).forEach(s=>{if(s){const a=s.split(eg);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function vl(e){let t="";if(Be(e))t=e;else if(Re(e))for(let s=0;s<e.length;s++){const a=vl(e[s]);a&&(t+=a+" ")}else if(lt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function sg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=vl(t)),s&&(e.style=ml(s)),e}const ag="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",ng="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",ig="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",lg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",og=Rs(ag),rg=Rs(ng),cg=Rs(ig),dg=Rs(lg),ug="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",pg=Rs(ug);function lf(e){return!!e||e===""}function fg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Da(e[a],t[a]);return s}function Da(e,t){if(e===t)return!0;let s=qd(e),a=qd(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=ls(e),a=ls(t),s||a)return e===t;if(s=Re(e),a=Re(t),s||a)return s&&a?fg(e,t):!1;if(s=lt(e),a=lt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Da(e[l],t[l]))return!1}}return String(e)===String(t)}function jo(e,t){return e.findIndex(s=>Da(s,t))}const of=e=>!!(e&&e.__v_isRef===!0),rf=e=>Be(e)?e:e==null?"":Re(e)||lt(e)&&(e.toString===sf||!Me(e.toString))?of(e)?rf(e.value):JSON.stringify(e,cf,2):String(e),cf=(e,t)=>of(t)?cf(e,t.value):Zn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[yr(a,i)+" =>"]=n,s),{})}:En(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>yr(s))}:ls(t)?yr(t):lt(t)&&!Re(t)&&!Fo(t)?String(t):t,yr=(e,t="")=>{var s;return ls(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function hg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let jt;class Mc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&jt&&(jt.active?(this.parent=jt,this.index=(jt.scopes||(jt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=jt;try{return jt=this,t()}finally{jt=s}}}on(){++this._on===1&&(this.prevScope=jt,jt=this)}off(){if(this._on>0&&--this._on===0){if(jt===this)jt=this.prevScope;else{let t=jt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function mg(e){return new Mc(e)}function df(){return jt}function vg(e,t=!1){jt&&jt.cleanups.push(e)}let bt;const xr=new WeakSet;class Ki{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,jt&&(jt.active?jt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,xr.has(this)&&(xr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||pf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Wd(this),ff(this);const t=bt,s=Ws;bt=this,Ws=!0;try{return this.fn()}finally{hf(this),bt=t,Ws=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Uc(t);this.deps=this.depsTail=void 0,Wd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?xr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Kr(this)&&this.run()}get dirty(){return Kr(this)}}let uf=0,$i,Ui;function pf(e,t=!1){if(e.flags|=8,t){e.next=Ui,Ui=e;return}e.next=$i,$i=e}function Fc(){uf++}function $c(){if(--uf>0)return;if(Ui){let t=Ui;for(Ui=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;$i;){let t=$i;for($i=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function ff(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function hf(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Uc(a),gg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Kr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(mf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function mf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ji)||(e.globalVersion=Ji,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Kr(e))))return;e.flags|=2;const t=e.dep,s=bt,a=Ws;bt=e,Ws=!0;try{ff(e);const n=e.fn(e._value);(t.version===0||qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{bt=s,Ws=a,hf(e),e.flags&=-3}}function Uc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Uc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function gg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function bg(e,t){e.effect instanceof Ki&&(e=e.effect.fn);const s=new Ki(e);t&&Ze(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function yg(e){e.effect.stop()}let Ws=!0;const vf=[];function Pa(){vf.push(Ws),Ws=!1}function Ma(){const e=vf.pop();Ws=e===void 0?!0:e}function Wd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=bt;bt=void 0;try{t()}finally{bt=s}}}let Ji=0;class xg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class zo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!bt||!Ws||bt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==bt)s=this.activeLink=new xg(bt,this),bt.deps?(s.prevDep=bt.depsTail,bt.depsTail.nextDep=s,bt.depsTail=s):bt.deps=bt.depsTail=s,gf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=bt.depsTail,s.nextDep=void 0,bt.depsTail.nextDep=s,bt.depsTail=s,bt.deps===s&&(bt.deps=a)}return s}trigger(t){this.version++,Ji++,this.notify(t)}notify(t){Fc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{$c()}}}function gf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)gf(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const io=new WeakMap,gn=Symbol(""),Jr=Symbol(""),Zi=Symbol("");function as(e,t,s){if(Ws&&bt){let a=io.get(e);a||io.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new zo),n.map=a,n.key=s),n.track()}}function Ta(e,t,s,a,n,i){const l=io.get(e);if(!l){Ji++;return}const o=r=>{r&&r.trigger()};if(Fc(),t==="clear")l.forEach(o);else{const r=Re(e),c=r&&$o(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Zi||!ls(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Zi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(gn)),Zn(e)&&o(l.get(Jr)));break;case"delete":r||(o(l.get(gn)),Zn(e)&&o(l.get(Jr)));break;case"set":Zn(e)&&o(l.get(gn));break}}$c()}function _g(e,t){const s=io.get(e);return s&&s.get(t)}function Mn(e){const t=tt(e);return t===e?t:(as(t,"iterate",Zi),_s(e)?t:t.map(Js))}function Vo(e){return as(e=tt(e),"iterate",Zi),e}function ra(e,t){return da(e)?ii(Oa(e)?Js(t):t):Js(t)}const wg={__proto__:null,[Symbol.iterator](){return _r(this,Symbol.iterator,e=>ra(this,e))},concat(...e){return Mn(this).concat(...e.map(t=>Re(t)?Mn(t):t))},entries(){return _r(this,"entries",e=>(e[1]=ra(this,e[1]),e))},every(e,t){return ga(this,"every",e,t,void 0,arguments)},filter(e,t){return ga(this,"filter",e,t,s=>s.map(a=>ra(this,a)),arguments)},find(e,t){return ga(this,"find",e,t,s=>ra(this,s),arguments)},findIndex(e,t){return ga(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ga(this,"findLast",e,t,s=>ra(this,s),arguments)},findLastIndex(e,t){return ga(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ga(this,"forEach",e,t,void 0,arguments)},includes(...e){return wr(this,"includes",e)},indexOf(...e){return wr(this,"indexOf",e)},join(e){return Mn(this).join(e)},lastIndexOf(...e){return wr(this,"lastIndexOf",e)},map(e,t){return ga(this,"map",e,t,void 0,arguments)},pop(){return wi(this,"pop")},push(...e){return wi(this,"push",e)},reduce(e,...t){return Kd(this,"reduce",e,t)},reduceRight(e,...t){return Kd(this,"reduceRight",e,t)},shift(){return wi(this,"shift")},some(e,t){return ga(this,"some",e,t,void 0,arguments)},splice(...e){return wi(this,"splice",e)},toReversed(){return Mn(this).toReversed()},toSorted(e){return Mn(this).toSorted(e)},toSpliced(...e){return Mn(this).toSpliced(...e)},unshift(...e){return wi(this,"unshift",e)},values(){return _r(this,"values",e=>ra(this,e))}};function _r(e,t,s){const a=Vo(e),n=a[t]();return a!==e&&!_s(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const kg=Array.prototype;function ga(e,t,s,a,n,i){const l=Vo(e),o=l!==e&&!_s(e),r=l[t];if(r!==kg[t]){const u=r.apply(e,i);return o?Js(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ra(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Kd(e,t,s,a){const n=Vo(e),i=n!==e&&!_s(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ra(e,c)),s.call(this,c,ra(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ra(e,r):r}function wr(e,t,s){const a=tt(e);as(a,"iterate",Zi);const n=a[t](...s);return(n===-1||n===!1)&&gl(s[0])?(s[0]=tt(s[0]),a[t](...s)):n}function wi(e,t,s=[]){Pa(),Fc();const a=tt(e)[t].apply(e,s);return $c(),Ma(),a}const Sg=Rs("__proto__,__v_isRef,__isVue"),bf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ls));function Tg(e){ls(e)||(e=String(e));const t=tt(this);return as(t,"has",e),t.hasOwnProperty(e)}class yf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?Tf:Sf:i?kf:wf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Re(t);if(!n){let r;if(l&&(r=wg[s]))return r;if(s==="hasOwnProperty")return Tg}const o=Reflect.get(t,s,Mt(t)?t:a);if((ls(s)?bf.has(s):Sg(s))||(n||as(t,"get",s),i))return o;if(Mt(o)){const r=l&&$o(s)?o:o.value;return n&&lt(r)?lo(r):r}return lt(o)?n?lo(o):an(o):o}}class xf extends yf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Re(t)&&$o(s);if(!this._isShallow){const c=da(i);if(!_s(a)&&!da(a)&&(i=tt(i),a=tt(a)),!l&&Mt(i)&&!Mt(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:rt(t,s),r=Reflect.set(t,s,a,Mt(t)?t:n);return t===tt(n)&&(o?qt(a,i)&&Ta(t,"set",s,a):Ta(t,"add",s,a)),r}deleteProperty(t,s){const a=rt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ta(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!ls(s)||!bf.has(s))&&as(t,"has",s),a}ownKeys(t){return as(t,"iterate",Re(t)?"length":gn),Reflect.ownKeys(t)}}class _f extends yf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Cg=new xf,Eg=new _f,Ag=new xf(!0),Rg=new _f(!0),Zr=e=>e,Il=e=>Reflect.getPrototypeOf(e);function Ig(e,t,s){return function(...a){const n=this.__v_raw,i=tt(n),l=Zn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Zr:t?ii:Js;return!t&&as(i,"iterate",r?Jr:gn),Ze(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Ol(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Og(e,t){const s={get(n){const i=this.__v_raw,l=tt(i),o=tt(n);e||(qt(n,o)&&as(l,"get",n),as(l,"get",o));const{has:r}=Il(l),c=t?Zr:e?ii:Js;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&as(tt(n),"iterate",gn),n.size},has(n){const i=this.__v_raw,l=tt(i),o=tt(n);return e||(qt(n,o)&&as(l,"has",n),as(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=tt(o),c=t?Zr:e?ii:Js;return!e&&as(r,"iterate",gn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Ze(s,e?{add:Ol("add"),set:Ol("set"),delete:Ol("delete"),clear:Ol("clear")}:{add(n){const i=tt(this),l=Il(i),o=tt(n),r=!t&&!_s(n)&&!da(n)?o:n;return l.has.call(i,r)||qt(n,r)&&l.has.call(i,n)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Ta(i,"add",r,r)),this},set(n,i){!t&&!_s(i)&&!da(i)&&(i=tt(i));const l=tt(this),{has:o,get:r}=Il(l);let c=o.call(l,n);c||(n=tt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?qt(i,d)&&Ta(l,"set",n,i):Ta(l,"add",n,i),this},delete(n){const i=tt(this),{has:l,get:o}=Il(i);let r=l.call(i,n);r||(n=tt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ta(i,"delete",n,void 0),c},clear(){const n=tt(this),i=n.size!==0,l=n.clear();return i&&Ta(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=Ig(n,e,t)}),s}function qo(e,t){const s=Og(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(rt(s,n)&&n in a?s:a,n,i)}const Lg={get:qo(!1,!1)},Ng={get:qo(!1,!0)},Dg={get:qo(!0,!1)},Pg={get:qo(!0,!0)},wf=new WeakMap,kf=new WeakMap,Sf=new WeakMap,Tf=new WeakMap;function Mg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function an(e){return da(e)?e:Go(e,!1,Cg,Lg,wf)}function Bc(e){return Go(e,!1,Ag,Ng,kf)}function lo(e){return Go(e,!0,Eg,Dg,Sf)}function Fg(e){return Go(e,!0,Rg,Pg,Tf)}function Go(e,t,s,a,n){if(!lt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Mg(Gv(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Oa(e){return da(e)?Oa(e.__v_raw):!!(e&&e.__v_isReactive)}function da(e){return!!(e&&e.__v_isReadonly)}function _s(e){return!!(e&&e.__v_isShallow)}function gl(e){return e?!!e.__v_raw:!1}function tt(e){const t=e&&e.__v_raw;return t?tt(t):e}function Cf(e){return!rt(e,"__v_skip")&&Object.isExtensible(e)&&af(e,"__v_skip",!0),e}const Js=e=>lt(e)?an(e):e,ii=e=>lt(e)?lo(e):e;function Mt(e){return e?e.__v_isRef===!0:!1}function f(e){return Ef(e,!1)}function Hc(e){return Ef(e,!0)}function Ef(e,t){return Mt(e)?e:new $g(e,t)}class $g{constructor(t,s){this.dep=new zo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:tt(t),this._value=s?t:Js(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||_s(t)||da(t);t=a?t:tt(t),qt(t,s)&&(this._rawValue=t,this._value=a?t:Js(t),this.dep.trigger())}}function Ug(e){e.dep&&e.dep.trigger()}function ca(e){return Mt(e)?e.value:e}function Bg(e){return Me(e)?e():ca(e)}const Hg={get:(e,t,s)=>t==="__v_raw"?e:ca(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Mt(n)&&!Mt(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function jc(e){return Oa(e)?e:new Proxy(e,Hg)}class jg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new zo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Af(e){return new jg(e)}function zg(e){const t=Re(e)?new Array(e.length):{};for(const s in e)t[s]=Rf(e,s);return t}class Vg{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=ls(s)?s:String(s),this._raw=tt(t);let n=!0,i=t;if(!Re(t)||ls(this._key)||!$o(this._key))do n=!gl(i)||_s(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=ca(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Mt(this._raw[this._key])){const s=this._object[this._key];if(Mt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return _g(this._raw,this._key)}}class qg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Gg(e,t,s){return Mt(e)?e:Me(e)?new qg(e):lt(e)&&arguments.length>1?Rf(e,t,s):f(e)}function Rf(e,t,s){return new Vg(e,t,s)}class Wg{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new zo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ji-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&bt!==this)return pf(this,!0),!0}get value(){const t=this.dep.track();return mf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Kg(e,t,s=!1){let a,n;return Me(e)?a=e:(a=e.get,n=e.set),new Wg(a,n,s)}const Jg={GET:"get",HAS:"has",ITERATE:"iterate"},Zg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ll={},oo=new WeakMap;let Ja;function Yg(){return Ja}function If(e,t=!1,s=Ja){if(s){let a=oo.get(s);a||oo.set(s,a=[]),a.push(e)}}function Qg(e,t,s=Ye){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:_s(b)||n===!1||n===0?Ca(b,1):Ca(b);let d,u,p,h,m=!1,v=!1;if(Mt(e)?(u=()=>e.value,m=_s(e)):Oa(e)?(u=()=>c(e),m=!0):Re(e)?(v=!0,m=e.some(b=>Oa(b)||_s(b)),u=()=>e.map(b=>{if(Mt(b))return b.value;if(Oa(b))return c(b);if(Me(b))return r?r(b,2):b()})):Me(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Pa();try{p()}finally{Ma()}}const b=Ja;Ja=d;try{return r?r(e,3,[h]):e(h)}finally{Ja=b}}:u=Qt,t&&n){const b=u,x=n===!0?1/0:n;u=()=>Ca(b(),x)}const E=df(),R=()=>{d.stop(),E&&E.active&&Dc(E.effects,d)};if(i&&t){const b=t;t=(...x)=>{const _=b(...x);return R(),_}}let y=v?new Array(e.length).fill(Ll):Ll;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const x=d.run();if(b||n||m||(v?x.some((_,k)=>qt(_,y[k])):qt(x,y))){p&&p();const _=Ja;Ja=d;try{const k=[x,y===Ll?void 0:v&&y[0]===Ll?[]:y,h];y=x,r?r(t,3,k):t(...k)}finally{Ja=_}}}else d.run()};return o&&o(g),d=new Ki(u),d.scheduler=l?()=>l(g,!1):g,h=b=>If(b,!1,d),p=d.onStop=()=>{const b=oo.get(d);if(b){if(r)r(b,4);else for(const x of b)x();oo.delete(d)}},t?a?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),R.pause=d.pause.bind(d),R.resume=d.resume.bind(d),R.stop=R,R}function Ca(e,t=1/0,s){if(t<=0||!lt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Mt(e))Ca(e.value,t,s);else if(Re(e))for(let a=0;a<e.length;a++)Ca(e[a],t,s);else if(En(e)||Zn(e))e.forEach(a=>{Ca(a,t,s)});else if(Fo(e)){for(const a in e)Ca(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ca(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Of=[];function Xg(e){Of.push(e)}function eb(){Of.pop()}function tb(e,t){}const sb={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},ab={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function bi(e,t,s,a){try{return a?e(...a):e()}catch(n){Rn(n,t,s)}}function As(e,t,s,a){if(Me(e)){const n=bi(e,t,s,a);return n&&Pc(n)&&n.catch(i=>{Rn(i,t,s)}),n}if(Re(e)){const n=[];for(let i=0;i<e.length;i++)n.push(As(e[i],t,s,a));return n}}function Rn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ye;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Pa(),bi(i,null,10,[e,r,c]),Ma();return}}nb(e,s,n,a,l)}function nb(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const ds=[];let la=-1;const Xn=[];let Za=null,jn=0;const Lf=Promise.resolve();let ro=null;function It(e){const t=ro||Lf;return e?t.then(this?e.bind(this):e):t}function ib(e){let t=la+1,s=ds.length;for(;t<s;){const a=t+s>>>1,n=ds[a],i=Qi(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function zc(e){if(!(e.flags&1)){const t=Qi(e),s=ds[ds.length-1];!s||!(e.flags&2)&&t>=Qi(s)?ds.push(e):ds.splice(ib(t),0,e),e.flags|=1,Nf()}}function Nf(){ro||(ro=Lf.then(Df))}function Yi(e){Re(e)?Xn.push(...e):Za&&e.id===-1?Za.splice(jn+1,0,e):e.flags&1||(Xn.push(e),e.flags|=1),Nf()}function Jd(e,t,s=la+1){for(;s<ds.length;s++){const a=ds[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;ds.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function co(e){if(Xn.length){const t=[...new Set(Xn)].sort((s,a)=>Qi(s)-Qi(a));if(Xn.length=0,Za){Za.push(...t);return}for(Za=t,jn=0;jn<Za.length;jn++){const s=Za[jn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Za=null,jn=0}}const Qi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Df(e){try{for(la=0;la<ds.length;la++){const t=ds[la];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),bi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;la<ds.length;la++){const t=ds[la];t&&(t.flags&=-2)}la=-1,ds.length=0,co(),ro=null,(ds.length||Xn.length)&&Df()}}let zn,Nl=[];function Pf(e,t){var s,a;zn=e,zn?(zn.enabled=!0,Nl.forEach(({event:n,args:i})=>zn.emit(n,...i)),Nl=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Pf(i,t)}),setTimeout(()=>{zn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Nl=[])},3e3)):Nl=[]}let Yt=null,Wo=null;function Xi(e){const t=Yt;return Yt=e,Wo=e&&e.type.__scopeId||null,t}function lb(e){Wo=e}function ob(){Wo=null}const rb=e=>Vc;function Vc(e,t=Yt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&al(-1);const i=Xi(t);let l;try{l=e(...n)}finally{Xi(i),a._d&&al(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function cb(e,t){if(Yt===null)return e;const s=_l(Yt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ye]=t[n];i&&(Me(i)&&(i={mounted:i,updated:i}),i.deep&&Ca(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function oa(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Pa(),As(r,s,8,[e.el,o,e,t]),Ma())}}function Bi(e,t){if(Zt){let s=Zt.provides;const a=Zt.parent&&Zt.parent.provides;a===s&&(s=Zt.provides=Object.create(a)),s[e]=t}}function Us(e,t,s=!1){const a=ps();if(a||bn){let n=bn?bn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Me(t)?t.call(a&&a.proxy):t}}function db(){return!!(ps()||bn)}const Mf=Symbol.for("v-scx"),Ff=()=>Us(Mf);function ub(e,t){return bl(e,null,t)}function pb(e,t){return bl(e,null,{flush:"post"})}function $f(e,t){return bl(e,null,{flush:"sync"})}function Ft(e,t,s){return bl(e,t,s)}function bl(e,t,s=Ye){const{immediate:a,deep:n,flush:i,once:l}=s,o=Ze({},s),r=t&&a||!t&&i!=="post";let c;if(kn){if(i==="sync"){const h=Ff();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Qt,h.resume=Qt,h.pause=Qt,h}}const d=Zt;o.call=(h,m,v)=>As(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Dt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():zc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=Qg(e,t,o);return kn&&(c?c.push(p):r&&p()),p}function fb(e,t,s){const a=this.proxy,n=Be(e)?e.includes(".")?Uf(a,e):()=>a[e]:e.bind(a,a);let i;Me(t)?i=t:(i=t.handler,s=t);const l=yi(this),o=bl(n,i.bind(a),s);return l(),o}function Uf(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Wa=new WeakMap,Bf=Symbol("_vte"),Hf=e=>e.__isTeleport,fn=e=>e&&(e.disabled||e.disabled===""),hb=e=>e&&(e.defer||e.defer===""),Zd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Yd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Yr=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},mb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:E,parentNode:R}}=c,y=fn(t.props);let{dynamicChildren:g}=t;const b=(k,S,w)=>{k.shapeFlag&16&&d(k.children,S,w,n,i,l,o,r)},x=(k=t)=>{const S=fn(k.props),w=k.target=Yr(k.props,m),I=Qr(w,k,v,h);w&&(l!=="svg"&&Zd(w)?l="svg":l!=="mathml"&&Yd(w)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(w),S||(b(k,w,I),Ni(k,!1)))},_=k=>{const S=()=>{if(Wa.get(k)===S){if(Wa.delete(k),fn(k.props)){const w=R(k.el)||s;b(k,w,k.anchor),Ni(k,!0)}x(k)}};Wa.set(k,S),Dt(S,i)};if(e==null){const k=t.el=v(""),S=t.anchor=v("");if(h(k,s,a),h(S,s,a),hb(t.props)||i&&i.pendingBranch){_(t);return}y&&(b(t,s,S),Ni(t,!0)),x()}else{t.el=e.el;const k=t.anchor=e.anchor,S=Wa.get(e);if(S){S.flags|=8,Wa.delete(e),_(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,I=t.targetAnchor=e.targetAnchor,$=fn(e.props),T=$?s:w,P=$?k:I;if(l==="svg"||Zd(w)?l="svg":(l==="mathml"||Yd(w))&&(l="mathml"),g?(p(e.dynamicChildren,g,T,n,i,l,o),td(e,t,!0)):r||u(e,t,T,P,n,i,l,o,!1),y)$?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Dl(t,s,k,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const q=t.target=Yr(t.props,m);q&&Dl(t,q,null,c,0)}else $&&Dl(t,w,I,c,1);Ni(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!fn(p),m=Wa.get(e);if(m&&(m.flags|=8,Wa.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let v=0;v<o.length;v++){const E=o[v];a(E,t,s,h,!!E.dynamicChildren)}},move:Dl,hydrate:vb};function Dl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Wa.has(e)&&(!u||fn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function vb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(E,R){let y=R;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(E,R){R.anchor=u(l(E),R,o(E),s,a,n,i)}const m=t.target=Yr(t.props,r),v=fn(t.props);if(m){const E=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,E),t.targetAnchor||Qr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,E),t.targetAnchor||Qr(m,t,d,c),u(E&&l(E),t,m,s,a,n,i))),Ni(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const gb=mb;function Ni(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Qr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Bf]=l,e&&(a(i,e,n),a(l,e,n)),l}const Ps=Symbol("_leaveCb"),ki=Symbol("_enterCb");function qc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Yo(()=>{e.isUnmounting=!0}),e}const Ds=[Function,Array],Gc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ds,onEnter:Ds,onAfterEnter:Ds,onEnterCancelled:Ds,onBeforeLeave:Ds,onLeave:Ds,onAfterLeave:Ds,onLeaveCancelled:Ds,onBeforeAppear:Ds,onAppear:Ds,onAfterAppear:Ds,onAppearCancelled:Ds},jf=e=>{const t=e.subTree;return t.component?jf(t.component):t},bb={name:"BaseTransition",props:Gc,setup(e,{slots:t}){const s=ps(),a=qc();return()=>{const n=t.default&&Ko(t.default(),!0),i=n&&n.length?zf(n):s.subTree?Th():void 0;if(!i)return;const l=tt(e),{mode:o}=l;if(a.isLeaving)return kr(i);const r=Qd(i);if(!r)return kr(i);let c=li(r,l,a,s,u=>c=u);r.type!==Ot&&Fa(r,c);let d=s.subTree&&Qd(s.subTree);if(d&&d.type!==Ot&&!Gs(d,r)&&jf(s).type!==Ot){let u=li(d,l,a,s);if(Fa(d,u),o==="out-in"&&r.type!==Ot)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},kr(i);o==="in-out"&&r.type!==Ot?u.delayLeave=(p,h,m)=>{const v=qf(a,d);v[String(d.key)]=d,p[Ps]=()=>{h(),p[Ps]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function zf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Ot){t=s;break}}return t}const Vf=bb;function qf(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function li(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:E,onAppear:R,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),x=qf(s,e),_=(w,I)=>{w&&As(w,a,9,I)},k=(w,I)=>{const $=I[1];_(w,I),Re(w)?w.every(T=>T.length<=1)&&$():w.length<=1&&$()},S={mode:l,persisted:o,beforeEnter(w){let I=r;if(!s.isMounted)if(i)I=E||r;else return;w[Ps]&&w[Ps](!0);const $=x[b];$&&Gs(e,$)&&$.el[Ps]&&$.el[Ps](),_(I,[w])},enter(w){if(x[b]===e)return;let I=c,$=d,T=u;if(!s.isMounted)if(i)I=R||c,$=y||d,T=g||u;else return;let P=!1;w[ki]=K=>{P||(P=!0,K?_(T,[w]):_($,[w]),S.delayedLeave&&S.delayedLeave(),w[ki]=void 0)};const q=w[ki].bind(null,!1);I?k(I,[w,q]):q()},leave(w,I){const $=String(e.key);if(w[ki]&&w[ki](!0),s.isUnmounting)return I();_(p,[w]);let T=!1;w[Ps]=q=>{T||(T=!0,I(),q?_(v,[w]):_(m,[w]),w[Ps]=void 0,x[$]===e&&delete x[$])};const P=w[Ps].bind(null,!1);x[$]=e,h?k(h,[w,P]):P()},clone(w){const I=li(w,t,s,a,n);return n&&n(I),I}};return S}function kr(e){if(xl(e))return e=ua(e),e.children=null,e}function Qd(e){if(!xl(e))return Hf(e.type)&&e.children?zf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Me(s.default))return s.default()}}function Fa(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Fa(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Ko(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&n++,a=a.concat(Ko(l.children,t,o))):(t||l.type!==Ot)&&a.push(o!=null?ua(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function yl(e,t){return Me(e)?Ze({name:e.name},t,{setup:e}):e}function yb(){const e=ps();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Wc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function xb(e){const t=ps(),s=Hc(null);if(t){const n=t.refs===Ye?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Xd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const uo=new WeakMap;function ei(e,t,s,a,n=!1){if(Re(e)){e.forEach((v,E)=>ei(v,t&&(Re(t)?t[E]:t),s,a,n));return}if(La(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&ei(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?_l(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ye?o.refs={}:o.refs,u=o.setupState,p=tt(u),h=u===Ye?Gn:v=>Xd(d,v)?!1:rt(p,v),m=(v,E)=>!(E&&Xd(d,E));if(c!=null&&c!==r){if(eu(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(Mt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Me(r))bi(r,o,12,[l,d]);else{const v=Be(r),E=Mt(r);if(v||E){const R=()=>{if(e.f){const y=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Re(y)&&Dc(y,i);else if(Re(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):E&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{R(),uo.delete(e)};y.id=-1,uo.set(e,y),Dt(y,s)}else eu(e),R()}}}function eu(e){const t=uo.get(e);t&&(t.flags|=8,uo.delete(e))}let tu=!1;const Fn=()=>{tu||(console.error("Hydration completed but contains mismatches."),tu=!0)},_b=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",wb=e=>e.namespaceURI.includes("MathML"),Pl=e=>{if(e.nodeType===1){if(_b(e))return"svg";if(wb(e))return"mathml"}},Wn=e=>e.nodeType===8;function kb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),co(),b._vnode=g;return}u(b.firstChild,g,null,null,null),co(),b._vnode=g},u=(g,b,x,_,k,S=!1)=>{S=S||!!b.dynamicChildren;const w=Wn(g)&&g.data==="[",I=()=>v(g,b,x,_,k,w),{type:$,ref:T,shapeFlag:P,patchFlag:q}=b;let K=g.nodeType;b.el=g,q===-2&&(S=!1,b.dynamicChildren=null);let D=null;switch($){case en:K!==3?b.children===""?(r(b.el=n(""),l(g),g),D=g):D=I():(g.data!==b.children&&(Fn(),g.data=b.children),D=i(g));break;case Ot:y(g)?(D=i(g),R(b.el=g.content.firstChild,g,x)):K!==8||w?D=I():D=i(g);break;case yn:if(w&&(g=i(g),K=g.nodeType),K===1||K===3){D=g;const O=!b.children.length;for(let L=0;L<b.staticCount;L++)O&&(b.children+=D.nodeType===1?D.outerHTML:D.data),L===b.staticCount-1&&(b.anchor=D),D=i(D);return w?i(D):D}else I();break;case Gt:w?D=m(g,b,x,_,k,S):D=I();break;default:if(P&1)(K!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?D=I():D=p(g,b,x,_,k,S);else if(P&6){b.slotScopeIds=k;const O=l(g);if(w?D=E(g):Wn(g)&&g.data==="teleport start"?D=E(g,g.data,"teleport end"):D=i(g),t(b,O,null,x,_,Pl(O),S),La(b)&&!b.type.__asyncResolved){let L;w?(L=_t(Gt),L.anchor=D?D.previousSibling:O.lastChild):L=g.nodeType===3?ad(""):_t("div"),L.el=g,b.component.subTree=L}}else P&64?K!==8?D=I():D=b.type.hydrate(g,b,x,_,k,S,e,h):P&128&&(D=b.type.hydrate(g,b,x,_,Pl(l(g)),k,S,e,u))}return T!=null&&ei(T,null,_,b),D},p=(g,b,x,_,k,S)=>{S=S||!!b.dynamicChildren;const{type:w,props:I,patchFlag:$,shapeFlag:T,dirs:P,transition:q}=b,K=w==="input"||w==="option";if(K||$!==-1){P&&oa(b,null,x,"created");let D=!1;if(y(g)){D=vh(null,q)&&x&&x.vnode.props&&x.vnode.props.appear;const L=g.content.firstChild;if(D){const te=L.getAttribute("class");te&&(L.$cls=te),q.beforeEnter(L)}R(L,g,x),b.el=g=L}if(T&16&&!(I&&(I.innerHTML||I.textContent))){let L=h(g.firstChild,b,g,x,_,k,S);for(L&&!Ml(g,1)&&Fn();L;){const te=L;L=L.nextSibling,o(te)}}else if(T&8){let L=b.children;L[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(L=L.slice(1));const{textContent:te}=g;te!==L&&te!==L.replace(/\r\n|\r/g,`
`)&&(Ml(g,0)||Fn(),g.textContent=b.children)}if(I){if(K||!S||$&48){const L=g.tagName.includes("-");for(const te in I)(K&&(te.endsWith("value")||te==="indeterminate")||Cn(te)&&!Ia(te)||te[0]==="."||L&&!Ia(te))&&a(g,te,null,I[te],void 0,x)}else if(I.onClick)a(g,"onClick",null,I.onClick,void 0,x);else if($&4&&Oa(I.style))for(const L in I.style)I.style[L]}let O;(O=I&&I.onVnodeBeforeMount)&&vs(O,x,b),P&&oa(b,null,x,"beforeMount"),((O=I&&I.onVnodeMounted)||P||D)&&xh(()=>{O&&vs(O,x,b),D&&q.enter(g),P&&oa(b,null,x,"mounted")},_)}return g.nextSibling},h=(g,b,x,_,k,S,w)=>{w=w||!!b.dynamicChildren;const I=b.children,$=I.length;let T=!1;for(let P=0;P<$;P++){const q=w?I[P]:I[P]=bs(I[P]),K=q.type===en;g?(K&&!w&&P+1<$&&bs(I[P+1]).type===en&&(r(n(g.data.slice(q.children.length)),x,i(g)),g.data=q.children),g=u(g,q,_,k,S,w)):K&&!q.children?r(q.el=n(""),x):(T||(T=!0,Ml(x,1)||Fn()),s(null,q,x,null,_,k,Pl(x),S))}return g},m=(g,b,x,_,k,S)=>{const{slotScopeIds:w}=b;w&&(k=k?k.concat(w):w);const I=l(g),$=h(i(g),b,I,x,_,k,S);return $&&Wn($)&&$.data==="]"?i(b.anchor=$):(Fn(),r(b.anchor=c("]"),I,$),$)},v=(g,b,x,_,k,S)=>{if(Ml(g.parentElement,1)||Fn(),b.el=null,S){const $=E(g);for(;;){const T=i(g);if(T&&T!==$)o(T);else break}}const w=i(g),I=l(g);return o(g),s(null,b,I,w,x,_,Pl(I),k),x&&(x.vnode.el=b.el,Xo(x,b.el)),w},E=(g,b="[",x="]")=>{let _=0;for(;g;)if(g=i(g),g&&Wn(g)&&(g.data===b&&_++,g.data===x)){if(_===0)return i(g);_--}return g},R=(g,b,x)=>{const _=b.parentNode;_&&_.replaceChild(g,b);let k=x;for(;k;)k.vnode.el===b&&(k.vnode.el=k.subTree.el=g),k=k.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const su="data-allow-mismatch",Sb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Ml(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(su);)e=e.parentElement;const s=e&&e.getAttribute(su);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(Sb[t])}}const Tb=Ho().requestIdleCallback||(e=>setTimeout(e,1)),Cb=Ho().cancelIdleCallback||(e=>clearTimeout(e)),Eb=(e=1e4)=>t=>{const s=Tb(t,{timeout:e});return()=>Cb(s)};function Ab(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const Rb=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(Ab(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},Ib=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Ob=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function Lb(e,t){if(Wn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Wn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const La=e=>!!e.type.__asyncLoader;function Nb(e){Me(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((E,R)=>{r(v,()=>E(p()),()=>R(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return yl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,E){let R=!1;(v.bu||(v.bu=[])).push(()=>R=!0);const y=()=>{R||E()},g=i?()=>{const b=i(y,x=>Lb(m,x));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Zt;if(Wc(m),d)return()=>Fl(d,m);const v=x=>{c=null,Rn(x,m,13,!a)};if(o&&m.suspense||kn)return h().then(x=>()=>Fl(x,m)).catch(x=>(v(x),()=>a?_t(a,{error:x}):null));const E=f(!1),R=f(),y=f(!!n);let g,b;return ft(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!E.value&&!R.value){const x=new Error(`Async component timed out after ${l}ms.`);v(x),R.value=x}},l)),h().then(()=>{m.isUnmounted||(E.value=!0,m.parent&&xl(m.parent.vnode)&&m.parent.update())}).catch(x=>{if(m.isUnmounted){c=null;return}v(x),R.value=x}),()=>{if(E.value&&d)return Fl(d,m);if(R.value&&a)return _t(a,{error:R.value});if(s&&!y.value)return Fl(s,m)}}})}function Fl(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=_t(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const xl=e=>e.type.__isKeepAlive,Db={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ps(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,g,b,x,_)=>{const k=y.component;c(y,g,b,0,o),r(k.vnode,y,g,b,k,o,x,y.slotScopeIds,_),Dt(()=>{k.isDeactivated=!1,k.a&&Qn(k.a);const S=y.props&&y.props.onVnodeMounted;S&&vs(S,k.parent,y)},o)},a.deactivate=y=>{const g=y.component;fo(g.m),fo(g.a),c(y,p,null,1,o),Dt(()=>{g.da&&Qn(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&vs(b,g.parent,y),g.isDeactivated=!0},o)};function h(y){Sr(y),d(y,s,o,!0)}function m(y){n.forEach((g,b)=>{const x=oc(La(g)?g.type.__asyncResolved||{}:g.type);x&&!y(x)&&v(b)})}function v(y){const g=n.get(y);g&&(!l||!Gs(g,l))?h(g):l&&Sr(l),n.delete(y),i.delete(y)}Ft(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Di(y,b)),g&&m(b=>!Di(g,b))},{flush:"post",deep:!0});let E=null;const R=()=>{E!=null&&(ho(s.subTree.type)?Dt(()=>{n.set(E,$l(s.subTree))},s.subTree.suspense):n.set(E,$l(s.subTree)))};return Ge(R),Zo(R),Yo(()=>{n.forEach(y=>{const{subTree:g,suspense:b}=s,x=$l(g);if(y.type===x.type&&y.key===x.key){Sr(x);const _=x.component.da;_&&Dt(_,b);return}h(y)})}),()=>{if(E=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!$a(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=$l(g);if(b.type===Ot)return l=null,b;const x=b.type,_=oc(La(b)?b.type.__asyncResolved||{}:x),{include:k,exclude:S,max:w}=e;if(k&&(!_||!Di(k,_))||S&&_&&Di(S,_))return b.shapeFlag&=-257,l=b,g;const I=b.key==null?x:b.key,$=n.get(I);return b.el&&(b=ua(b),g.shapeFlag&128&&(g.ssContent=b)),E=I,$?(b.el=$.el,b.component=$.component,b.transition&&Fa(b,b.transition),b.shapeFlag|=512,i.delete(I),i.add(I)):(i.add(I),w&&i.size>parseInt(w,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,ho(g.type)?g:b}}},Pb=Db;function Di(e,t){return Re(e)?e.some(s=>Di(s,t)):Be(e)?e.split(",").includes(t):qv(e)?(e.lastIndex=0,e.test(t)):!1}function Xt(e,t){Gf(e,"a",t)}function Vt(e,t){Gf(e,"da",t)}function Gf(e,t,s=Zt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Jo(t,a,s),s){let n=s.parent;for(;n&&n.parent;)xl(n.parent.vnode)&&Mb(a,t,s,n),n=n.parent}}function Mb(e,t,s,a){const n=Jo(t,e,a,!0);ft(()=>{Dc(a[t],n)},s)}function Sr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function $l(e){return e.shapeFlag&128?e.ssContent:e}function Jo(e,t,s=Zt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Pa();const o=yi(s),r=As(t,s,e,l);return o(),Ma(),r});return a?n.unshift(i):n.push(i),i}}const Ua=e=>(t,s=Zt)=>{(!kn||e==="sp")&&Jo(e,(...a)=>t(...a),s)},Wf=Ua("bm"),Ge=Ua("m"),Kc=Ua("bu"),Zo=Ua("u"),Yo=Ua("bum"),ft=Ua("um"),Kf=Ua("sp"),Jf=Ua("rtg"),Zf=Ua("rtc");function Yf(e,t=Zt){Jo("ec",e,t)}const Jc="components",Fb="directives";function $b(e,t){return Zc(Jc,e,!0,t)||e}const Qf=Symbol.for("v-ndc");function Ub(e){return Be(e)?Zc(Jc,e,!1)||e:e||Qf}function Bb(e){return Zc(Fb,e)}function Zc(e,t,s=!0,a=!1){const n=Yt||Zt;if(n){const i=n.type;if(e===Jc){const o=oc(i,!1);if(o&&(o===t||o===vt(t)||o===An(vt(t))))return i}const l=au(n[e]||i[e],t)||au(n.appContext[e],t);return!l&&a?i:l}}function au(e,t){return e&&(e[t]||e[vt(t)]||e[An(vt(t))])}function Hb(e,t,s,a){let n;const i=s&&s[a],l=Re(e);if(l||Be(e)){const o=l&&Oa(e);let r=!1,c=!1;o&&(r=!_s(e),c=da(e),e=Vo(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?ii(Js(e[d])):Js(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(lt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function jb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Re(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function zb(e,t,s={},a,n){if(Yt.ce||Yt.parent&&La(Yt.parent)&&Yt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),sl(),mo(Gt,null,[_t("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),sl();const l=i&&Yc(i(s)),o=s.key||l&&l.key,r=mo(Gt,{key:(o&&!ls(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Yc(e){return e.some(t=>$a(t)?!(t.type===Ot||t.type===Gt&&!Yc(t.children)):!0)?e:null}function Vb(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Yn(a)]=e[a];return s}const Xr=e=>e?Ah(e)?_l(e):Xr(e.parent):null,Hi=Ze(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Xr(e.parent),$root:e=>Xr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Qc(e),$forceUpdate:e=>e.f||(e.f=()=>{zc(e.update)}),$nextTick:e=>e.n||(e.n=It.bind(e.proxy)),$watch:e=>fb.bind(e)}),Tr=(e,t)=>e!==Ye&&!e.__isScriptSetup&&rt(e,t),ec={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(Tr(a,t))return l[t]=1,a[t];if(n!==Ye&&rt(n,t))return l[t]=2,n[t];if(rt(i,t))return l[t]=3,i[t];if(s!==Ye&&rt(s,t))return l[t]=4,s[t];tc&&(l[t]=0)}}const c=Hi[t];let d,u;if(c)return t==="$attrs"&&as(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ye&&rt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,rt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return Tr(n,t)?(n[t]=s,!0):a!==Ye&&rt(a,t)?(a[t]=s,!0):rt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ye&&o[0]!=="$"&&rt(e,o)||Tr(t,o)||rt(i,o)||rt(a,o)||rt(Hi,o)||rt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:rt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},qb=Ze({},ec,{get(e,t){if(t!==Symbol.unscopables)return ec.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Qv(t)}});function Gb(){return null}function Wb(){return null}function Kb(e){}function Jb(e){}function Zb(){return null}function Yb(){}function Qb(e,t){return null}function Xb(){return Xf().slots}function ey(){return Xf().attrs}function Xf(e){const t=ps();return t.setupContext||(t.setupContext=Lh(t))}function el(e){return Re(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function ty(e,t){const s=el(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Re(n)||Me(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function sy(e,t){return!e||!t?e||t:Re(e)&&Re(t)?e.concat(t):Ze({},el(e),el(t))}function ay(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function ny(e){const t=ps(),s=kn;let a=e();nl(),s&&si(!1);const n=()=>{yi(t),s&&si(!0)},i=()=>{ps()!==t&&t.scope.off(),nl(),s&&si(!1)};return Pc(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let tc=!0;function iy(e){const t=Qc(e),s=e.proxy,a=e.ctx;tc=!1,t.beforeCreate&&nu(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:E,beforeDestroy:R,beforeUnmount:y,destroyed:g,unmounted:b,render:x,renderTracked:_,renderTriggered:k,errorCaptured:S,serverPrefetch:w,expose:I,inheritAttrs:$,components:T,directives:P,filters:q}=t;if(c&&ly(c,a,null),l)for(const O in l){const L=l[O];Me(L)&&(a[O]=L.bind(s))}if(n){const O=n.call(s,s);lt(O)&&(e.data=an(O))}if(tc=!0,i)for(const O in i){const L=i[O],te=Me(L)?L.bind(s,s):Me(L.get)?L.get.bind(s,s):Qt,ie=!Me(L)&&Me(L.set)?L.set.bind(s):Qt,U=z({get:te,set:ie});Object.defineProperty(a,O,{enumerable:!0,configurable:!0,get:()=>U.value,set:Q=>U.value=Q})}if(o)for(const O in o)eh(o[O],a,s,O);if(r){const O=Me(r)?r.call(s):r;Reflect.ownKeys(O).forEach(L=>{Bi(L,O[L])})}d&&nu(d,e,"c");function D(O,L){Re(L)?L.forEach(te=>O(te.bind(s))):L&&O(L.bind(s))}if(D(Wf,u),D(Ge,p),D(Kc,h),D(Zo,m),D(Xt,v),D(Vt,E),D(Yf,S),D(Zf,_),D(Jf,k),D(Yo,y),D(ft,b),D(Kf,w),Re(I))if(I.length){const O=e.exposed||(e.exposed={});I.forEach(L=>{Object.defineProperty(O,L,{get:()=>s[L],set:te=>s[L]=te,enumerable:!0})})}else e.exposed||(e.exposed={});x&&e.render===Qt&&(e.render=x),$!=null&&(e.inheritAttrs=$),T&&(e.components=T),P&&(e.directives=P),w&&Wc(e)}function ly(e,t,s=Qt){Re(e)&&(e=sc(e));for(const a in e){const n=e[a];let i;lt(n)?"default"in n?i=Us(n.from||a,n.default,!0):i=Us(n.from||a):i=Us(n),Mt(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function nu(e,t,s){As(Re(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function eh(e,t,s,a){let n=a.includes(".")?Uf(s,a):()=>s[a];if(Be(e)){const i=t[e];Me(i)&&Ft(n,i)}else if(Me(e))Ft(n,e.bind(s));else if(lt(e))if(Re(e))e.forEach(i=>eh(i,t,s,a));else{const i=Me(e.handler)?e.handler.bind(s):t[e.handler];Me(i)&&Ft(n,i,e)}}function Qc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>po(r,c,l,!0)),po(r,t,l)),lt(t)&&i.set(t,r),r}function po(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&po(e,i,s,!0),n&&n.forEach(l=>po(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=oy[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const oy={data:iu,props:lu,emits:lu,methods:Pi,computed:Pi,beforeCreate:os,created:os,beforeMount:os,mounted:os,beforeUpdate:os,updated:os,beforeDestroy:os,beforeUnmount:os,destroyed:os,unmounted:os,activated:os,deactivated:os,errorCaptured:os,serverPrefetch:os,components:Pi,directives:Pi,watch:cy,provide:iu,inject:ry};function iu(e,t){return t?e?function(){return Ze(Me(e)?e.call(this,this):e,Me(t)?t.call(this,this):t)}:t:e}function ry(e,t){return Pi(sc(e),sc(t))}function sc(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function os(e,t){return e?[...new Set([].concat(e,t))]:t}function Pi(e,t){return e?Ze(Object.create(null),e,t):t}function lu(e,t){return e?Re(e)&&Re(t)?[...new Set([...e,...t])]:Ze(Object.create(null),el(e),el(t??{})):t}function cy(e,t){if(!e)return t;if(!t)return e;const s=Ze(Object.create(null),e);for(const a in t)s[a]=os(e[a],t[a]);return s}function th(){return{app:null,config:{isNativeTag:Gn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let dy=0;function uy(e,t){return function(a,n=null){Me(a)||(a=Ze({},a)),n!=null&&!lt(n)&&(n=null);const i=th(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:dy++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Dh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Me(d.install)?(l.add(d),d.install(c,...u)):Me(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||_t(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,_l(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(As(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=bn;bn=c;try{return d()}finally{bn=u}}};return c}}let bn=null;function py(e,t,s=Ye){const a=ps(),n=vt(t),i=ys(t),l=sh(e,n),o=Af((r,c)=>{let d,u=Ye,p;return $f(()=>{const h=e[n];qt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!qt(m,d)&&!(u!==Ye&&qt(h,u)))return;const v=a.vnode.props,E=!!(v&&(t in v||n in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${n}`in v||`onUpdate:${i}`in v));E||(d=h,c()),a.emit(`update:${t}`,m),qt(h,u)&&(qt(h,m)&&!qt(m,p)||E&&u!==Ye&&!qt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ye:o,done:!1}:{done:!0}}}},o}const sh=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${vt(t)}Modifiers`]||e[`${ys(t)}Modifiers`];function fy(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ye;let n=s;const i=t.startsWith("update:"),l=i&&sh(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Be(d)?d.trim():d)),l.number&&(n=s.map(Bo)));let o,r=a[o=Yn(t)]||a[o=Yn(vt(t))];!r&&i&&(r=a[o=Yn(ys(t))]),r&&As(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,As(c,e,6,n)}}const hy=new WeakMap;function ah(e,t,s=!1){const a=s?hy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Me(e)){const r=c=>{const d=ah(c,t,!0);d&&(o=!0,Ze(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(lt(e)&&a.set(e,null),null):(Re(i)?i.forEach(r=>l[r]=null):Ze(l,i),lt(e)&&a.set(e,l),l)}function Qo(e,t){return!e||!Cn(t)?!1:(t=t.slice(2).replace(/Once$/,""),rt(e,t[0].toLowerCase()+t.slice(1))||rt(e,ys(t))||rt(e,t))}function Zl(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,E=Xi(e);let R,y;try{if(s.shapeFlag&4){const b=n||a,x=b;R=bs(c.call(x,b,d,u,h,p,m)),y=o}else{const b=t;R=bs(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:vy(o)}}catch(b){ji.length=0,Rn(b,e,1),R=_t(Ot)}let g=R;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:x}=g;b.length&&x&7&&(i&&b.some(Mo)&&(y=gy(y,i)),g=ua(g,y,!1,!0))}return s.dirs&&(g=ua(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Fa(g,s.transition),R=g,Xi(E),R}function my(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if($a(n)){if(n.type!==Ot||n.children==="v-if"){if(s)return;s=n}}else return}return s}const vy=e=>{let t;for(const s in e)(s==="class"||s==="style"||Cn(s))&&((t||(t={}))[s]=e[s]);return t},gy=(e,t)=>{const s={};for(const a in e)(!Mo(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function by(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?ou(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(nh(l,a,p)&&!Qo(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?ou(a,l,c):!0:!!l;return!1}function ou(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(nh(t,e,i)&&!Qo(s,i))return!0}return!1}function nh(e,t,s){const a=e[s],n=t[s];return s==="style"&&lt(a)&&lt(n)?!Da(a,n):a!==n}function Xo({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const ih={},lh=()=>Object.create(ih),oh=e=>Object.getPrototypeOf(e)===ih;function yy(e,t,s,a=!1){const n={},i=lh();e.propsDefaults=Object.create(null),rh(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Bc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function xy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=tt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Qo(e.emitsOptions,p))continue;const h=t[p];if(r)if(rt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=vt(p);n[m]=ac(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{rh(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!rt(t,u)&&((d=ys(u))===u||!rt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=ac(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!rt(t,u))&&(delete i[u],c=!0)}c&&Ta(e.attrs,"set","")}function rh(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ia(r))continue;const c=t[r];let d;n&&rt(n,d=vt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Qo(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=tt(s),c=o||Ye;for(let d=0;d<i.length;d++){const u=i[d];s[u]=ac(n,r,u,c[u],e,!rt(c,u))}}return l}function ac(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=rt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Me(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=yi(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===ys(s))&&(a=!0))}return a}const _y=new WeakMap;function ch(e,t,s=!1){const a=s?_y:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Me(e)){const d=u=>{r=!0;const[p,h]=ch(u,t,!0);Ze(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return lt(e)&&a.set(e,Jn),Jn;if(Re(i))for(let d=0;d<i.length;d++){const u=vt(i[d]);ru(u)&&(l[u]=Ye)}else if(i)for(const d in i){const u=vt(d);if(ru(u)){const p=i[d],h=l[u]=Re(p)||Me(p)?{type:p}:Ze({},p),m=h.type;let v=!1,E=!0;if(Re(m))for(let R=0;R<m.length;++R){const y=m[R],g=Me(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(E=!1)}else v=Me(m)&&m.name==="Boolean";h[0]=v,h[1]=E,(v||rt(h,"default"))&&o.push(u)}}const c=[l,o];return lt(e)&&a.set(e,c),c}function ru(e){return e[0]!=="$"&&!Ia(e)}const Xc=e=>e==="_"||e==="_ctx"||e==="$stable",ed=e=>Re(e)?e.map(bs):[bs(e)],wy=(e,t,s)=>{if(t._n)return t;const a=Vc((...n)=>ed(t(...n)),s);return a._c=!1,a},dh=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Xc(n))continue;const i=e[n];if(Me(i))t[n]=wy(n,i,a);else if(i!=null){const l=ed(i);t[n]=()=>l}}},uh=(e,t)=>{const s=ed(t);e.slots.default=()=>s},ph=(e,t,s)=>{for(const a in t)(s||!Xc(a))&&(e[a]=t[a])},ky=(e,t,s)=>{const a=e.slots=lh();if(e.vnode.shapeFlag&32){const n=t._;n?(ph(a,t,s),s&&af(a,"_",n,!0)):dh(t,a)}else t&&uh(e,t)},Sy=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ye;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:ph(n,t,s):(i=!t.$stable,dh(t,n)),l=t}else t&&(uh(e,t),l={default:1});if(i)for(const o in n)!Xc(o)&&l[o]==null&&delete n[o]},Dt=xh;function fh(e){return mh(e)}function hh(e){return mh(e,kb)}function mh(e,t){const s=Ho();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Qt,insertStaticContent:m}=e,v=(C,M,j,de=null,F=null,Z=null,re=void 0,B=null,Y=!!M.dynamicChildren)=>{if(C===M)return;C&&!Gs(C,M)&&(de=G(C),Q(C,F,Z,!0),C=null),M.patchFlag===-2&&(Y=!1,M.dynamicChildren=null);const{type:ee,ref:pe,shapeFlag:he}=M;switch(ee){case en:E(C,M,j,de);break;case Ot:R(C,M,j,de);break;case yn:C==null&&y(M,j,de,re);break;case Gt:T(C,M,j,de,F,Z,re,B,Y);break;default:he&1?x(C,M,j,de,F,Z,re,B,Y):he&6?P(C,M,j,de,F,Z,re,B,Y):(he&64||he&128)&&ee.process(C,M,j,de,F,Z,re,B,Y,ve)}pe!=null&&F?ei(pe,C&&C.ref,Z,M||C,!M):pe==null&&C&&C.ref!=null&&ei(C.ref,null,Z,C,!0)},E=(C,M,j,de)=>{if(C==null)a(M.el=o(M.children),j,de);else{const F=M.el=C.el;M.children!==C.children&&c(F,M.children)}},R=(C,M,j,de)=>{C==null?a(M.el=r(M.children||""),j,de):M.el=C.el},y=(C,M,j,de)=>{[C.el,C.anchor]=m(C.children,M,j,de,C.el,C.anchor)},g=({el:C,anchor:M},j,de)=>{let F;for(;C&&C!==M;)F=p(C),a(C,j,de),C=F;a(M,j,de)},b=({el:C,anchor:M})=>{let j;for(;C&&C!==M;)j=p(C),n(C),C=j;n(M)},x=(C,M,j,de,F,Z,re,B,Y)=>{if(M.type==="svg"?re="svg":M.type==="math"&&(re="mathml"),C==null)_(M,j,de,F,Z,re,B,Y);else{const ee=C.el&&C.el._isVueCE?C.el:null;try{ee&&ee._beginPatch(),w(C,M,F,Z,re,B,Y)}finally{ee&&ee._endPatch()}}},_=(C,M,j,de,F,Z,re,B)=>{let Y,ee;const{props:pe,shapeFlag:he,transition:xe,dirs:Oe}=C;if(Y=C.el=l(C.type,Z,pe&&pe.is,pe),he&8?d(Y,C.children):he&16&&S(C.children,Y,null,de,F,Cr(C,Z),re,B),Oe&&oa(C,null,de,"created"),k(Y,C,C.scopeId,re,de),pe){for(const He in pe)He!=="value"&&!Ia(He)&&i(Y,He,null,pe[He],Z,de);"value"in pe&&i(Y,"value",null,pe.value,Z),(ee=pe.onVnodeBeforeMount)&&vs(ee,de,C)}Oe&&oa(C,null,de,"beforeMount");const ge=vh(F,xe);ge&&xe.beforeEnter(Y),a(Y,M,j),((ee=pe&&pe.onVnodeMounted)||ge||Oe)&&Dt(()=>{try{ee&&vs(ee,de,C),ge&&xe.enter(Y),Oe&&oa(C,null,de,"mounted")}finally{}},F)},k=(C,M,j,de,F)=>{if(j&&h(C,j),de)for(let Z=0;Z<de.length;Z++)h(C,de[Z]);if(F){let Z=F.subTree;if(M===Z||ho(Z.type)&&(Z.ssContent===M||Z.ssFallback===M)){const re=F.vnode;k(C,re,re.scopeId,re.slotScopeIds,F.parent)}}},S=(C,M,j,de,F,Z,re,B,Y=0)=>{for(let ee=Y;ee<C.length;ee++){const pe=C[ee]=B?ka(C[ee]):bs(C[ee]);v(null,pe,M,j,de,F,Z,re,B)}},w=(C,M,j,de,F,Z,re)=>{const B=M.el=C.el;let{patchFlag:Y,dynamicChildren:ee,dirs:pe}=M;Y|=C.patchFlag&16;const he=C.props||Ye,xe=M.props||Ye;let Oe;if(j&&rn(j,!1),(Oe=xe.onVnodeBeforeUpdate)&&vs(Oe,j,M,C),pe&&oa(M,C,j,"beforeUpdate"),j&&rn(j,!0),(he.innerHTML&&xe.innerHTML==null||he.textContent&&xe.textContent==null)&&d(B,""),ee?I(C.dynamicChildren,ee,B,j,de,Cr(M,F),Z):re||L(C,M,B,null,j,de,Cr(M,F),Z,!1),Y>0){if(Y&16)$(B,he,xe,j,F);else if(Y&2&&he.class!==xe.class&&i(B,"class",null,xe.class,F),Y&4&&i(B,"style",he.style,xe.style,F),Y&8){const ge=M.dynamicProps;for(let He=0;He<ge.length;He++){const Ue=ge[He],je=he[Ue],Qe=xe[Ue];(Qe!==je||Ue==="value")&&i(B,Ue,je,Qe,F,j)}}Y&1&&C.children!==M.children&&d(B,M.children)}else!re&&ee==null&&$(B,he,xe,j,F);((Oe=xe.onVnodeUpdated)||pe)&&Dt(()=>{Oe&&vs(Oe,j,M,C),pe&&oa(M,C,j,"updated")},de)},I=(C,M,j,de,F,Z,re)=>{for(let B=0;B<M.length;B++){const Y=C[B],ee=M[B],pe=Y.el&&(Y.type===Gt||!Gs(Y,ee)||Y.shapeFlag&198)?u(Y.el):j;v(Y,ee,pe,null,de,F,Z,re,!0)}},$=(C,M,j,de,F)=>{if(M!==j){if(M!==Ye)for(const Z in M)!Ia(Z)&&!(Z in j)&&i(C,Z,M[Z],null,F,de);for(const Z in j){if(Ia(Z))continue;const re=j[Z],B=M[Z];re!==B&&Z!=="value"&&i(C,Z,B,re,F,de)}"value"in j&&i(C,"value",M.value,j.value,F)}},T=(C,M,j,de,F,Z,re,B,Y)=>{const ee=M.el=C?C.el:o(""),pe=M.anchor=C?C.anchor:o("");let{patchFlag:he,dynamicChildren:xe,slotScopeIds:Oe}=M;Oe&&(B=B?B.concat(Oe):Oe),C==null?(a(ee,j,de),a(pe,j,de),S(M.children||[],j,pe,F,Z,re,B,Y)):he>0&&he&64&&xe&&C.dynamicChildren&&C.dynamicChildren.length===xe.length?(I(C.dynamicChildren,xe,j,F,Z,re,B),(M.key!=null||F&&M===F.subTree)&&td(C,M,!0)):L(C,M,j,pe,F,Z,re,B,Y)},P=(C,M,j,de,F,Z,re,B,Y)=>{M.slotScopeIds=B,C==null?M.shapeFlag&512?F.ctx.activate(M,j,de,re,Y):q(M,j,de,F,Z,re,Y):K(C,M,Y)},q=(C,M,j,de,F,Z,re)=>{const B=C.component=Eh(C,de,F);if(xl(C)&&(B.ctx.renderer=ve),Rh(B,!1,re),B.asyncDep){if(F&&F.registerDep(B,D,re),!C.el){const Y=B.subTree=_t(Ot);R(null,Y,M,j),C.placeholder=Y.el}}else D(B,C,M,j,F,Z,re)},K=(C,M,j)=>{const de=M.component=C.component;if(by(C,M,j))if(de.asyncDep&&!de.asyncResolved){O(de,M,j);return}else de.next=M,de.update();else M.el=C.el,de.vnode=M},D=(C,M,j,de,F,Z,re)=>{const B=()=>{if(C.isMounted){let{next:he,bu:xe,u:Oe,parent:ge,vnode:He}=C;{const nt=gh(C);if(nt){he&&(he.el=He.el,O(C,he,re)),nt.asyncDep.then(()=>{Dt(()=>{C.isUnmounted||ee()},F)});return}}let Ue=he,je;rn(C,!1),he?(he.el=He.el,O(C,he,re)):he=He,xe&&Qn(xe),(je=he.props&&he.props.onVnodeBeforeUpdate)&&vs(je,ge,he,He),rn(C,!0);const Qe=Zl(C),ot=C.subTree;C.subTree=Qe,v(ot,Qe,u(ot.el),G(ot),C,F,Z),he.el=Qe.el,Ue===null&&Xo(C,Qe.el),Oe&&Dt(Oe,F),(je=he.props&&he.props.onVnodeUpdated)&&Dt(()=>vs(je,ge,he,He),F)}else{let he;const{el:xe,props:Oe}=M,{bm:ge,m:He,parent:Ue,root:je,type:Qe}=C,ot=La(M);if(rn(C,!1),ge&&Qn(ge),!ot&&(he=Oe&&Oe.onVnodeBeforeMount)&&vs(he,Ue,M),rn(C,!0),xe&&$e){const nt=()=>{C.subTree=Zl(C),$e(xe,C.subTree,C,F,null)};ot&&Qe.__asyncHydrate?Qe.__asyncHydrate(xe,C,nt):nt()}else{je.ce&&je.ce._hasShadowRoot()&&je.ce._injectChildStyle(Qe,C.parent?C.parent.type:void 0);const nt=C.subTree=Zl(C);v(null,nt,j,de,C,F,Z),M.el=nt.el}if(He&&Dt(He,F),!ot&&(he=Oe&&Oe.onVnodeMounted)){const nt=M;Dt(()=>vs(he,Ue,nt),F)}(M.shapeFlag&256||Ue&&La(Ue.vnode)&&Ue.vnode.shapeFlag&256)&&C.a&&Dt(C.a,F),C.isMounted=!0,M=j=de=null}};C.scope.on();const Y=C.effect=new Ki(B);C.scope.off();const ee=C.update=Y.run.bind(Y),pe=C.job=Y.runIfDirty.bind(Y);pe.i=C,pe.id=C.uid,Y.scheduler=()=>zc(pe),rn(C,!0),ee()},O=(C,M,j)=>{M.component=C;const de=C.vnode.props;C.vnode=M,C.next=null,xy(C,M.props,de,j),Sy(C,M.children,j),Pa(),Jd(C),Ma()},L=(C,M,j,de,F,Z,re,B,Y=!1)=>{const ee=C&&C.children,pe=C?C.shapeFlag:0,he=M.children,{patchFlag:xe,shapeFlag:Oe}=M;if(xe>0){if(xe&128){ie(ee,he,j,de,F,Z,re,B,Y);return}else if(xe&256){te(ee,he,j,de,F,Z,re,B,Y);return}}Oe&8?(pe&16&&ue(ee,F,Z),he!==ee&&d(j,he)):pe&16?Oe&16?ie(ee,he,j,de,F,Z,re,B,Y):ue(ee,F,Z,!0):(pe&8&&d(j,""),Oe&16&&S(he,j,de,F,Z,re,B,Y))},te=(C,M,j,de,F,Z,re,B,Y)=>{C=C||Jn,M=M||Jn;const ee=C.length,pe=M.length,he=Math.min(ee,pe);let xe;for(xe=0;xe<he;xe++){const Oe=M[xe]=Y?ka(M[xe]):bs(M[xe]);v(C[xe],Oe,j,null,F,Z,re,B,Y)}ee>pe?ue(C,F,Z,!0,!1,he):S(M,j,de,F,Z,re,B,Y,he)},ie=(C,M,j,de,F,Z,re,B,Y)=>{let ee=0;const pe=M.length;let he=C.length-1,xe=pe-1;for(;ee<=he&&ee<=xe;){const Oe=C[ee],ge=M[ee]=Y?ka(M[ee]):bs(M[ee]);if(Gs(Oe,ge))v(Oe,ge,j,null,F,Z,re,B,Y);else break;ee++}for(;ee<=he&&ee<=xe;){const Oe=C[he],ge=M[xe]=Y?ka(M[xe]):bs(M[xe]);if(Gs(Oe,ge))v(Oe,ge,j,null,F,Z,re,B,Y);else break;he--,xe--}if(ee>he){if(ee<=xe){const Oe=xe+1,ge=Oe<pe?M[Oe].el:de;for(;ee<=xe;)v(null,M[ee]=Y?ka(M[ee]):bs(M[ee]),j,ge,F,Z,re,B,Y),ee++}}else if(ee>xe)for(;ee<=he;)Q(C[ee],F,Z,!0),ee++;else{const Oe=ee,ge=ee,He=new Map;for(ee=ge;ee<=xe;ee++){const Ae=M[ee]=Y?ka(M[ee]):bs(M[ee]);Ae.key!=null&&He.set(Ae.key,ee)}let Ue,je=0;const Qe=xe-ge+1;let ot=!1,nt=0;const X=new Array(Qe);for(ee=0;ee<Qe;ee++)X[ee]=0;for(ee=Oe;ee<=he;ee++){const Ae=C[ee];if(je>=Qe){Q(Ae,F,Z,!0);continue}let Le;if(Ae.key!=null)Le=He.get(Ae.key);else for(Ue=ge;Ue<=xe;Ue++)if(X[Ue-ge]===0&&Gs(Ae,M[Ue])){Le=Ue;break}Le===void 0?Q(Ae,F,Z,!0):(X[Le-ge]=ee+1,Le>=nt?nt=Le:ot=!0,v(Ae,M[Le],j,null,F,Z,re,B,Y),je++)}const we=ot?Ty(X):Jn;for(Ue=we.length-1,ee=Qe-1;ee>=0;ee--){const Ae=ge+ee,Le=M[Ae],se=M[Ae+1],Ee=Ae+1<pe?se.el||bh(se):de;X[ee]===0?v(null,Le,j,Ee,F,Z,re,B,Y):ot&&(Ue<0||ee!==we[Ue]?U(Le,j,Ee,2):Ue--)}}},U=(C,M,j,de,F=null)=>{const{el:Z,type:re,transition:B,children:Y,shapeFlag:ee}=C;if(ee&6){U(C.component.subTree,M,j,de);return}if(ee&128){C.suspense.move(M,j,de);return}if(ee&64){re.move(C,M,j,ve);return}if(re===Gt){a(Z,M,j);for(let he=0;he<Y.length;he++)U(Y[he],M,j,de);a(C.anchor,M,j);return}if(re===yn){g(C,M,j);return}if(de!==2&&ee&1&&B)if(de===0)B.persisted&&!Z[Ps]?a(Z,M,j):(B.beforeEnter(Z),a(Z,M,j),Dt(()=>B.enter(Z),F));else{const{leave:he,delayLeave:xe,afterLeave:Oe}=B,ge=()=>{C.ctx.isUnmounted?n(Z):a(Z,M,j)},He=()=>{const Ue=Z._isLeaving||!!Z[Ps];Z._isLeaving&&Z[Ps](!0),B.persisted&&!Ue?ge():he(Z,()=>{ge(),Oe&&Oe()})};xe?xe(Z,ge,He):He()}else a(Z,M,j)},Q=(C,M,j,de=!1,F=!1)=>{const{type:Z,props:re,ref:B,children:Y,dynamicChildren:ee,shapeFlag:pe,patchFlag:he,dirs:xe,cacheIndex:Oe,memo:ge}=C;if(he===-2&&(F=!1),B!=null&&(Pa(),ei(B,null,j,C,!0),Ma()),Oe!=null&&(M.renderCache[Oe]=void 0),pe&256){M.ctx.deactivate(C);return}const He=pe&1&&xe,Ue=!La(C);let je;if(Ue&&(je=re&&re.onVnodeBeforeUnmount)&&vs(je,M,C),pe&6)fe(C.component,j,de);else{if(pe&128){C.suspense.unmount(j,de);return}He&&oa(C,null,M,"beforeUnmount"),pe&64?C.type.remove(C,M,j,ve,de):ee&&!ee.hasOnce&&(Z!==Gt||he>0&&he&64)?ue(ee,M,j,!1,!0):(Z===Gt&&he&384||!F&&pe&16)&&ue(Y,M,j),de&&oe(C)}const Qe=ge!=null&&Oe==null;(Ue&&(je=re&&re.onVnodeUnmounted)||He||Qe)&&Dt(()=>{je&&vs(je,M,C),He&&oa(C,null,M,"unmounted"),Qe&&(C.el=null)},j)},oe=C=>{const{type:M,el:j,anchor:de,transition:F}=C;if(M===Gt){W(j,de);return}if(M===yn){b(C);return}const Z=()=>{n(j),F&&!F.persisted&&F.afterLeave&&F.afterLeave()};if(C.shapeFlag&1&&F&&!F.persisted){const{leave:re,delayLeave:B}=F,Y=()=>re(j,Z);B?B(C.el,Z,Y):Y()}else Z()},W=(C,M)=>{let j;for(;C!==M;)j=p(C),n(C),C=j;n(M)},fe=(C,M,j)=>{const{bum:de,scope:F,job:Z,subTree:re,um:B,m:Y,a:ee}=C;fo(Y),fo(ee),de&&Qn(de),F.stop(),Z&&(Z.flags|=8,Q(re,C,M,j)),B&&Dt(B,M),Dt(()=>{C.isUnmounted=!0},M)},ue=(C,M,j,de=!1,F=!1,Z=0)=>{for(let re=Z;re<C.length;re++)Q(C[re],M,j,de,F)},G=C=>{if(C.shapeFlag&6)return G(C.component.subTree);if(C.shapeFlag&128)return C.suspense.next();const M=p(C.anchor||C.el),j=M&&M[Bf];return j?p(j):M};let ce=!1;const me=(C,M,j)=>{let de;C==null?M._vnode&&(Q(M._vnode,null,null,!0),de=M._vnode.component):v(M._vnode||null,C,M,null,null,null,j),M._vnode=C,ce||(ce=!0,Jd(de),co(),ce=!1)},ve={p:v,um:Q,m:U,r:oe,mt:q,mc:S,pc:L,pbc:I,n:G,o:e};let be,$e;return t&&([be,$e]=t(ve)),{render:me,hydrate:be,createApp:uy(me,be)}}function Cr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function vh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function td(e,t,s=!1){const a=e.children,n=t.children;if(Re(a)&&Re(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=ka(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&td(l,o)),o.type===en&&(o.patchFlag===-1&&(o=n[i]=ka(o)),o.el=l.el),o.type===Ot&&!o.el&&(o.el=l.el)}}function Ty(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function gh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:gh(t)}function fo(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function bh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?bh(t.subTree):null}const ho=e=>e.__isSuspense;let nc=0;const Cy={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)Ay(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Ry(e,t,s,a,n,l,o,r,c)}},hydrate:Iy,normalize:Oy},Ey=Cy;function tl(e,t){const s=e.props&&e.props[t];Me(s)&&s()}function Ay(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=yh(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(tl(e,"onPending"),tl(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ti(p,e.ssFallback)):p.resolve(!1,!0)}function Ry(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:E,isHydrating:R}=u;if(v)u.pendingBranch=p,Gs(v,p)?(r(v,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():E&&(R||(r(m,h,s,a,n,null,i,l,o),ti(u,h)))):(u.pendingId=nc++,R?(u.isHydrating=!1,u.activeBranch=v):c(v,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ti(u,h))):m&&Gs(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Gs(m,p))r(m,p,s,a,n,u,i,l,o),ti(u,p);else if(tl(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=nc++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function yh(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:E}}=c;let R;const y=Ly(e);y&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const g=e.props?no(e.props.timeout):void 0,b=i,x={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:nc++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,k=!1){const{vnode:S,activeBranch:w,pendingBranch:I,pendingId:$,effects:T,parentComponent:P,container:q,isInFallback:K}=x;let D=!1;if(x.isHydrating)x.isHydrating=!1;else if(!_){D=w&&I.transition&&I.transition.mode==="out-in";let te=!1;D&&(w.transition.afterLeave=()=>{$===x.pendingId&&(p(I,q,i===b&&!te?m(w):i,0),Yi(T),K&&S.ssFallback&&(S.ssFallback.el=null))}),w&&!x.isFallbackMountPending&&(v(w.el)===q&&(i=m(w),te=!0),h(w,P,x,!0),!D&&K&&S.ssFallback&&Dt(()=>S.ssFallback.el=null,x)),D||p(I,q,i,0)}x.isFallbackMountPending=!1,ti(x,I),x.pendingBranch=null,x.isInFallback=!1;let O=x.parent,L=!1;for(;O;){if(O.pendingBranch){O.effects.push(...T),L=!0;break}O=O.parent}!L&&!D&&Yi(T),x.effects=[],y&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!k&&t.resolve()),tl(S,"onResolve")},fallback(_){if(!x.pendingBranch)return;const{vnode:k,activeBranch:S,parentComponent:w,container:I,namespace:$}=x;tl(k,"onFallback");const T=m(S),P=()=>{x.isFallbackMountPending=!1,x.isInFallback&&(u(null,_,I,T,w,null,$,o,r),ti(x,_))},q=_.transition&&_.transition.mode==="out-in";q&&(x.isFallbackMountPending=!0,S.transition.afterLeave=P),x.isInFallback=!0,h(S,w,null,!0),q||P()},move(_,k,S){x.activeBranch&&p(x.activeBranch,_,k,S),x.container=_},next(){return x.activeBranch&&m(x.activeBranch)},registerDep(_,k,S){const w=!!x.pendingBranch;w&&x.deps++;const I=_.vnode.el;_.asyncDep.catch($=>{Rn($,_,0)}).then($=>{if(_.isUnmounted||x.isUnmounted||x.pendingId!==_.suspenseId)return;nl(),_.asyncResolved=!0;const{vnode:T}=_;ic(_,$,!1),I&&(T.el=I);const P=!I&&_.subTree.el;k(_,T,v(I||_.subTree.el),I?null:m(_.subTree),x,l,S),P&&(T.placeholder=null,E(P)),Xo(_,T.el),w&&--x.deps===0&&x.resolve()})},unmount(_,k){x.isUnmounted=!0,x.activeBranch&&h(x.activeBranch,s,_,k),x.pendingBranch&&h(x.pendingBranch,s,_,k)}};return x}function Iy(e,t,s,a,n,i,l,o,r){const c=t.suspense=yh(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Oy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=cu(a?s.default:s),e.ssFallback=a?cu(s.fallback):_t(Ot)}function cu(e){let t;if(Me(e)){const s=wn&&e._c;s&&(e._d=!1,sl()),e=e(),s&&(e._d=!0,t=ns,_h())}return Re(e)&&(e=my(e)),e=bs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function xh(e,t){t&&t.pendingBranch?Re(e)?t.effects.push(...e):t.effects.push(e):Yi(e)}function ti(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Xo(a,n))}function Ly(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),en=Symbol.for("v-txt"),Ot=Symbol.for("v-cmt"),yn=Symbol.for("v-stc"),ji=[];let ns=null;function sl(e=!1){ji.push(ns=e?null:[])}function _h(){ji.pop(),ns=ji[ji.length-1]||null}let wn=1;function al(e,t=!1){wn+=e,e<0&&ns&&t&&(ns.hasOnce=!0)}function wh(e){return e.dynamicChildren=wn>0?ns||Jn:null,_h(),wn>0&&ns&&ns.push(e),e}function Ny(e,t,s,a,n,i){return wh(sd(e,t,s,a,n,i,!0))}function mo(e,t,s,a,n){return wh(_t(e,t,s,a,n,!0))}function $a(e){return e?e.__v_isVNode===!0:!1}function Gs(e,t){return e.type===t.type&&e.key===t.key}function Dy(e){}const kh=({key:e})=>e??null,Yl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Mt(e)||Me(e)?{i:Yt,r:e,k:t,f:!!s}:e:null);function sd(e,t=null,s=null,a=0,n=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&kh(t),ref:t&&Yl(t),scopeId:Wo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Yt};return o?(nd(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),wn>0&&!l&&ns&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&ns.push(r),r}const _t=Py;function Py(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===Qf)&&(e=Ot),$a(e)){const o=ua(e,t,!0);return s&&nd(o,s),wn>0&&!i&&ns&&(o.shapeFlag&6?ns[ns.indexOf(e)]=o:ns.push(o)),o.patchFlag=-2,o}if(jy(e)&&(e=e.__vccOpts),t){t=Sh(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=vl(o)),lt(r)&&(gl(r)&&!Re(r)&&(r=Ze({},r)),t.style=ml(r))}const l=Be(e)?1:ho(e)?128:Hf(e)?64:lt(e)?4:Me(e)?2:0;return sd(e,t,s,a,n,l,i,!0)}function Sh(e){return e?gl(e)||oh(e)?Ze({},e):e:null}function ua(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Ch(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&kh(c),ref:t&&t.ref?s&&i?Re(i)?i.concat(Yl(t)):[i,Yl(t)]:Yl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ua(e.ssContent),ssFallback:e.ssFallback&&ua(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&Fa(d,r.clone(d)),d}function ad(e=" ",t=0){return _t(en,null,e,t)}function My(e,t){const s=_t(yn,null,e);return s.staticCount=t,s}function Th(e="",t=!1){return t?(sl(),mo(Ot,null,e)):_t(Ot,null,e)}function bs(e){return e==null||typeof e=="boolean"?_t(Ot):Re(e)?_t(Gt,null,e.slice()):$a(e)?ka(e):_t(en,null,String(e))}function ka(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ua(e)}function nd(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Re(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),nd(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!oh(t)?t._ctx=Yt:n===3&&Yt&&(Yt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Me(t)?(t={default:t,_ctx:Yt},s=32):(t=String(t),a&64?(s=16,t=[ad(t)]):s=8);e.children=t,e.shapeFlag|=s}function Ch(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=vl([t.class,a.class]));else if(n==="style")t.style=ml([t.style,a.style]);else if(Cn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Re(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!Mo(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function vs(e,t,s,a=null){As(e,t,7,[s,a])}const Fy=th();let $y=0;function Eh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Fy,i={uid:$y++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Mc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:ch(a,n),emitsOptions:ah(a,n),emit:null,emitted:null,propsDefaults:Ye,inheritAttrs:a.inheritAttrs,ctx:Ye,data:Ye,props:Ye,attrs:Ye,slots:Ye,refs:Ye,setupState:Ye,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=fy.bind(null,i),e.ce&&e.ce(i),i}let Zt=null;const ps=()=>Zt||Yt;let vo,si;{const e=Ho(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};vo=t("__VUE_INSTANCE_SETTERS__",s=>Zt=s),si=t("__VUE_SSR_SETTERS__",s=>kn=s)}const yi=e=>{const t=Zt;return vo(e),e.scope.on(),()=>{e.scope.off(),vo(t)}},nl=()=>{Zt&&Zt.scope.off(),vo(null)};function Ah(e){return e.vnode.shapeFlag&4}let kn=!1;function Rh(e,t=!1,s=!1){t&&si(t);const{props:a,children:n}=e.vnode,i=Ah(e);yy(e,a,i,t),ky(e,n,s||t);const l=i?Uy(e,t):void 0;return t&&si(!1),l}function Uy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,ec);const{setup:a}=s;if(a){Pa();const n=e.setupContext=a.length>1?Lh(e):null,i=yi(e),l=bi(a,e,0,[e.props,n]),o=Pc(l);if(Ma(),i(),(o||e.sp)&&!La(e)&&Wc(e),o){if(l.then(nl,nl),t)return l.then(r=>{ic(e,r,t)}).catch(r=>{Rn(r,e,0)});e.asyncDep=l}else ic(e,l,t)}else Oh(e,t)}function ic(e,t,s){Me(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:lt(t)&&(e.setupState=jc(t)),Oh(e,s)}let go,lc;function Ih(e){go=e,lc=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,qb))}}const By=()=>!go;function Oh(e,t,s){const a=e.type;if(!e.render){if(!t&&go&&!a.render){const n=a.template||Qc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Ze(Ze({isCustomElement:i,delimiters:o},l),r);a.render=go(n,c)}}e.render=a.render||Qt,lc&&lc(e)}{const n=yi(e);Pa();try{iy(e)}finally{Ma(),n()}}}const Hy={get(e,t){return as(e,"get",""),e[t]}};function Lh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Hy),slots:e.slots,emit:e.emit,expose:t}}function _l(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(jc(Cf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Hi)return Hi[s](e)},has(t,s){return s in t||s in Hi}})):e.proxy}function oc(e,t=!0){return Me(e)?e.displayName||e.name:e.name||t&&e.__name}function jy(e){return Me(e)&&"__vccOpts"in e}const z=(e,t)=>Kg(e,t,kn);function oi(e,t,s){try{al(-1);const a=arguments.length;return a===2?lt(t)&&!Re(t)?$a(t)?_t(e,null,[t]):_t(e,t):_t(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&$a(s)&&(s=[s]),_t(e,t,s))}finally{al(1)}}function zy(){}function Vy(e,t,s,a){const n=s[a];if(n&&Nh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Nh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(qt(s[a],t[a]))return!1;return wn>0&&ns&&ns.push(e),!0}const Dh="3.5.38",qy=Qt,Gy=ab,Wy=zn,Ky=Pf,Jy={createComponentInstance:Eh,setupComponent:Rh,renderComponentRoot:Zl,setCurrentRenderingInstance:Xi,isVNode:$a,normalizeVNode:bs,getComponentPublicInstance:_l,ensureValidVNode:Yc,pushWarningContext:Xg,popWarningContext:eb},Zy=Jy,Yy=null,Qy=null,Xy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let rc;const du=typeof window<"u"&&window.trustedTypes;if(du)try{rc=du.createPolicy("vue",{createHTML:e=>e})}catch{}const Ph=rc?e=>rc.createHTML(e):e=>e,ex="http://www.w3.org/2000/svg",tx="http://www.w3.org/1998/Math/MathML",wa=typeof document<"u"?document:null,uu=wa&&wa.createElement("template"),Mh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?wa.createElementNS(ex,e):t==="mathml"?wa.createElementNS(tx,e):s?wa.createElement(e,{is:s}):wa.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>wa.createTextNode(e),createComment:e=>wa.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>wa.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{uu.innerHTML=Ph(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=uu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Va="transition",Si="animation",ri=Symbol("_vtc"),Fh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},$h=Ze({},Gc,Fh),sx=e=>(e.displayName="Transition",e.props=$h,e),ax=sx((e,{slots:t})=>oi(Vf,Uh(e),t)),cn=(e,t=[])=>{Re(e)?e.forEach(s=>s(...t)):e&&e(...t)},pu=e=>e?Re(e)?e.some(t=>t.length>1):e.length>1:!1;function Uh(e){const t={};for(const T in e)T in Fh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=nx(n),v=m&&m[0],E=m&&m[1],{onBeforeEnter:R,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:x,onBeforeAppear:_=R,onAppear:k=y,onAppearCancelled:S=g}=t,w=(T,P,q,K)=>{T._enterCancelled=K,Ka(T,P?d:o),Ka(T,P?c:l),q&&q()},I=(T,P)=>{T._isLeaving=!1,Ka(T,u),Ka(T,h),Ka(T,p),P&&P()},$=T=>(P,q)=>{const K=T?k:y,D=()=>w(P,T,q);cn(K,[P,D]),fu(()=>{Ka(P,T?r:i),aa(P,T?d:o),pu(K)||hu(P,a,v,D)})};return Ze(t,{onBeforeEnter(T){cn(R,[T]),aa(T,i),aa(T,l)},onBeforeAppear(T){cn(_,[T]),aa(T,r),aa(T,c)},onEnter:$(!1),onAppear:$(!0),onLeave(T,P){T._isLeaving=!0;const q=()=>I(T,P);aa(T,u),T._enterCancelled?(aa(T,p),cc(T)):(cc(T),aa(T,p)),fu(()=>{T._isLeaving&&(Ka(T,u),aa(T,h),pu(b)||hu(T,a,E,q))}),cn(b,[T,q])},onEnterCancelled(T){w(T,!1,void 0,!0),cn(g,[T])},onAppearCancelled(T){w(T,!0,void 0,!0),cn(S,[T])},onLeaveCancelled(T){I(T),cn(x,[T])}})}function nx(e){if(e==null)return null;if(lt(e))return[Er(e.enter),Er(e.leave)];{const t=Er(e);return[t,t]}}function Er(e){return no(e)}function aa(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ri]||(e[ri]=new Set)).add(t)}function Ka(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[ri];s&&(s.delete(t),s.size||(e[ri]=void 0))}function fu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let ix=0;function hu(e,t,s,a){const n=e._endId=++ix,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Bh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Bh(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${Va}Delay`),i=a(`${Va}Duration`),l=mu(n,i),o=a(`${Si}Delay`),r=a(`${Si}Duration`),c=mu(o,r);let d=null,u=0,p=0;t===Va?l>0&&(d=Va,u=l,p=i.length):t===Si?c>0&&(d=Si,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Va:Si:null,p=d?d===Va?i.length:r.length:0);const h=d===Va&&/\b(?:transform|all)(?:,|$)/.test(a(`${Va}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function mu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>vu(s)+vu(e[a])))}function vu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function cc(e){return(e?e.ownerDocument:document).body.offsetHeight}function lx(e,t,s){const a=e[ri];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const bo=Symbol("_vod"),id=Symbol("_vsh"),Hh={name:"show",beforeMount(e,{value:t},{transition:s}){e[bo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ti(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ti(e,!0),a.enter(e)):a.leave(e,()=>{Ti(e,!1)}):Ti(e,t))},beforeUnmount(e,{value:t}){Ti(e,t)}};function Ti(e,t){e.style.display=t?e[bo]:"none",e[id]=!t}function ox(){Hh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const jh=Symbol("");function rx(e){const t=ps();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>yo(i,n))},a=()=>{const n=e(t.proxy);t.ce?yo(t.ce,n):dc(t.subTree,n),s(n)};Kc(()=>{Yi(a)}),Ge(()=>{Ft(a,Qt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>n.disconnect())})}function dc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{dc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)yo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>dc(s,t));else if(e.type===yn){let{el:s,anchor:a}=e;for(;s&&(yo(s,t),s!==a);)s=s.nextSibling}}function yo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=hg(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[jh]=a}}const cx=/(?:^|;)\s*display\s*:/;function dx(e,t,s){const a=e.style,n=Be(s);let i=!1;if(s&&!n){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Mi(a,o,"")}else for(const l in t)s[l]==null&&Mi(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?px(e,l,!Be(t)&&t?t[l]:void 0,o)||Mi(a,l,o):Mi(a,l,"")}}else if(n){if(t!==s){const l=a[jh];l&&(s+=";"+l),a.cssText=s,i=cx.test(s)}}else t&&e.removeAttribute("style");bo in e&&(e[bo]=i?a.display:"",e[id]&&(a.display="none"))}const gu=/\s*!important$/;function Mi(e,t,s){if(Re(s))s.forEach(a=>Mi(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=ux(e,t);gu.test(s)?e.setProperty(ys(a),s.replace(gu,""),"important"):e[a]=s}}const bu=["Webkit","Moz","ms"],Ar={};function ux(e,t){const s=Ar[t];if(s)return s;let a=vt(t);if(a!=="filter"&&a in e)return Ar[t]=a;a=An(a);for(let n=0;n<bu.length;n++){const i=bu[n]+a;if(i in e)return Ar[t]=i}return t}function px(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(a)&&s===a}const yu="http://www.w3.org/1999/xlink";function xu(e,t,s,a,n,i=pg(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(yu,t.slice(6,t.length)):e.setAttributeNS(yu,t,s):s==null||i&&!lf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ls(s)?String(s):s)}function _u(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ph(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=lf(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ea(e,t,s,a){e.addEventListener(t,s,a)}function fx(e,t,s,a){e.removeEventListener(t,s,a)}const wu=Symbol("_vei");function hx(e,t,s,a,n=null){const i=e[wu]||(e[wu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=mx(t);if(a){const c=i[t]=bx(a,n);Ea(e,o,c,r)}else l&&(fx(e,o,l,r),i[t]=void 0)}}const ku=/(?:Once|Passive|Capture)$/;function mx(e){let t;if(ku.test(e)){t={};let a;for(;a=e.match(ku);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ys(e.slice(2)),t]}let Rr=0;const vx=Promise.resolve(),gx=()=>Rr||(vx.then(()=>Rr=0),Rr=Date.now());function bx(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Re(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&As(c,t,5,o)}}else As(n,t,5,[a])};return s.value=e,s.attached=gx(),s}const Su=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,zh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?lx(e,a,l):t==="style"?dx(e,s,a):Cn(t)?Mo(t)||hx(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):yx(e,t,a,l))?(_u(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&xu(e,t,a,l,i,t!=="value")):e._isVueCE&&(xx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(a)))?_u(e,vt(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),xu(e,t,a,l))};function yx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&Su(t)&&Me(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return Su(t)&&Be(s)?!1:t in e}function xx(e,t){const s=e._def.props;if(!s)return!1;const a=vt(t);return Array.isArray(s)?s.some(n=>vt(n)===a):Object.keys(s).some(n=>vt(n)===a)}const Tu={};function Vh(e,t,s){let a=yl(e,t);Fo(a)&&(a=Ze({},a,t));class n extends er{constructor(l){super(a,l,s)}}return n.def=a,n}const _x=((e,t)=>Vh(e,t,am)),wx=typeof HTMLElement<"u"?HTMLElement:class{};class er extends wx{constructor(t,s={},a=wo){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==wo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ze({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof er){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,It(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Re(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=no(this._props[r])),(o||(o=Object.create(null)))[vt(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)rt(this,a)||Object.defineProperty(this,a,{get:()=>ca(s[a])})}_resolveProps(t){const{props:s}=t,a=Re(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(vt))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):Tu;const n=vt(t);s&&this._numberProps&&this._numberProps[n]&&(a=no(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Tu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ys(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ys(t),s+""):s||this.removeAttribute(ys(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),sm(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=_t(this._def,Ze(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Fo(l[0])?Ze({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),ys(i)!==i&&n(ys(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function qh(e){const t=ps(),s=t&&t.ce;return s||null}function kx(){const e=qh();return e&&e.shadowRoot}function Sx(e="$style"){{const t=ps();if(!t)return Ye;const s=t.type.__cssModules;if(!s)return Ye;const a=s[e];return a||Ye}}const Gh=new WeakMap,Wh=new WeakMap,xo=Symbol("_moveCb"),Cu=Symbol("_enterCb"),Tx=e=>(delete e.props.mode,e),Cx=Tx({name:"TransitionGroup",props:Ze({},$h,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ps(),a=qc();let n,i;return Zo(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ox(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(Ax),n.forEach(Rx);const o=n.filter(Ix);cc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;aa(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[xo]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[xo]=null,Ka(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=tt(e),o=Uh(l);let r=l.tag||Gt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[id]&&(n.push(d),Fa(d,li(d,o,a,s)),Gh.set(d,Kh(d.el)))}i=t.default?Ko(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Fa(d,li(d,o,a,s))}return _t(r,null,i)}}}),Ex=Cx;function Ax(e){const t=e.el;t[xo]&&t[xo](),t[Cu]&&t[Cu]()}function Rx(e){Wh.set(e,Kh(e.el))}function Ix(e){const t=Gh.get(e),s=Wh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Kh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ox(e,t,s){const a=e.cloneNode(),n=e[ri];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Bh(a);return i.removeChild(a),l}const sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Re(t)?s=>Qn(t,s):t};function Lx(e){e.target.composing=!0}function Eu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Bs=Symbol("_assign");function Au(e,t,s){return t&&(e=e.trim()),s&&(e=Bo(e)),e}const _o={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[Bs]=sn(n);const i=a||n.props&&n.props.type==="number";Ea(e,t?"change":"input",l=>{l.target.composing||e[Bs](Au(e.value,s,i))}),(s||i)&&Ea(e,"change",()=>{e.value=Au(e.value,s,i)}),t||(Ea(e,"compositionstart",Lx),Ea(e,"compositionend",Eu),Ea(e,"change",Eu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[Bs]=sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Bo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},ld={deep:!0,created(e,t,s){e[Bs]=sn(s),Ea(e,"change",()=>{const a=e._modelValue,n=ci(e),i=e.checked,l=e[Bs];if(Re(a)){const o=jo(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(En(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Zh(e,i))})},mounted:Ru,beforeUpdate(e,t,s){e[Bs]=sn(s),Ru(e,t,s)}};function Ru(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Re(t))n=jo(t,a.props.value)>-1;else if(En(t))n=t.has(a.props.value);else{if(t===s)return;n=Da(t,Zh(e,!0))}e.checked!==n&&(e.checked=n)}const od={created(e,{value:t},s){e.checked=Da(t,s.props.value),e[Bs]=sn(s),Ea(e,"change",()=>{e[Bs](ci(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[Bs]=sn(a),t!==s&&(e.checked=Da(t,a.props.value))}},Jh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=En(t);Ea(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Bo(ci(l)):ci(l));e[Bs](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,It(()=>{e._assigning=!1})}),e[Bs]=sn(a)},mounted(e,{value:t}){Iu(e,t)},beforeUpdate(e,t,s){e[Bs]=sn(s)},updated(e,{value:t}){e._assigning||Iu(e,t)}};function Iu(e,t){const s=e.multiple,a=Re(t);if(!(s&&!a&&!En(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=ci(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=jo(t,o)>-1}else l.selected=t.has(o);else if(Da(ci(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ci(e){return"_value"in e?e._value:e.value}function Zh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Yh={created(e,t,s){Ul(e,t,s,null,"created")},mounted(e,t,s){Ul(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){Ul(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){Ul(e,t,s,a,"updated")}};function Qh(e,t){switch(e){case"SELECT":return Jh;case"TEXTAREA":return _o;default:switch(t){case"checkbox":return ld;case"radio":return od;default:return _o}}}function Ul(e,t,s,a,n){const l=Qh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function Nx(){_o.getSSRProps=({value:e})=>({value:e}),od.getSSRProps=({value:e},t)=>{if(t.props&&Da(t.props.value,e))return{checked:!0}},ld.getSSRProps=({value:e},t)=>{if(Re(e)){if(t.props&&jo(e,t.props.value)>-1)return{checked:!0}}else if(En(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Yh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Qh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Dx=["ctrl","shift","alt","meta"],Px={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Dx.some(s=>e[`${s}Key`]&&!t.includes(s))},Mx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=Px[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Fx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},$x=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=ys(n.key);if(t.some(l=>l===i||Fx[l]===i))return e(n)}))},Xh=Ze({patchProp:zh},Mh);let zi,Ou=!1;function em(){return zi||(zi=fh(Xh))}function tm(){return zi=Ou?zi:hh(Xh),Ou=!0,zi}const sm=((...e)=>{em().render(...e)}),Ux=((...e)=>{tm().hydrate(...e)}),wo=((...e)=>{const t=em().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=im(a);if(!n)return;const i=t._component;!Me(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,nm(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),am=((...e)=>{const t=tm().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=im(a);if(n)return s(n,!0,nm(n))},t});function nm(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function im(e){return Be(e)?document.querySelector(e):e}let Lu=!1;const Bx=()=>{Lu||(Lu=!0,Nx(),ox())},Hx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Vf,BaseTransitionPropsValidators:Gc,Comment:Ot,DeprecationTypes:Xy,EffectScope:Mc,ErrorCodes:sb,ErrorTypeStrings:Gy,Fragment:Gt,KeepAlive:Pb,ReactiveEffect:Ki,Static:yn,Suspense:Ey,Teleport:gb,Text:en,TrackOpTypes:Jg,Transition:ax,TransitionGroup:Ex,TriggerOpTypes:Zg,VueElement:er,assertNumber:tb,callWithAsyncErrorHandling:As,callWithErrorHandling:bi,camelize:vt,capitalize:An,cloneVNode:ua,compatUtils:Qy,computed:z,createApp:wo,createBlock:mo,createCommentVNode:Th,createElementBlock:Ny,createElementVNode:sd,createHydrationRenderer:hh,createPropsRestProxy:ay,createRenderer:fh,createSSRApp:am,createSlots:jb,createStaticVNode:My,createTextVNode:ad,createVNode:_t,customRef:Af,defineAsyncComponent:Nb,defineComponent:yl,defineCustomElement:Vh,defineEmits:Wb,defineExpose:Kb,defineModel:Yb,defineOptions:Jb,defineProps:Gb,defineSSRCustomElement:_x,defineSlots:Zb,devtools:Wy,effect:bg,effectScope:mg,getCurrentInstance:ps,getCurrentScope:df,getCurrentWatcher:Yg,getTransitionRawChildren:Ko,guardReactiveProps:Sh,h:oi,handleError:Rn,hasInjectionContext:db,hydrate:Ux,hydrateOnIdle:Eb,hydrateOnInteraction:Ob,hydrateOnMediaQuery:Ib,hydrateOnVisible:Rb,initCustomFormatter:zy,initDirectivesForSSR:Bx,inject:Us,isMemoSame:Nh,isProxy:gl,isReactive:Oa,isReadonly:da,isRef:Mt,isRuntimeOnly:By,isShallow:_s,isVNode:$a,markRaw:Cf,mergeDefaults:ty,mergeModels:sy,mergeProps:Ch,nextTick:It,nodeOps:Mh,normalizeClass:vl,normalizeProps:sg,normalizeStyle:ml,onActivated:Xt,onBeforeMount:Wf,onBeforeUnmount:Yo,onBeforeUpdate:Kc,onDeactivated:Vt,onErrorCaptured:Yf,onMounted:Ge,onRenderTracked:Zf,onRenderTriggered:Jf,onScopeDispose:vg,onServerPrefetch:Kf,onUnmounted:ft,onUpdated:Zo,onWatcherCleanup:If,openBlock:sl,patchProp:zh,popScopeId:ob,provide:Bi,proxyRefs:jc,pushScopeId:lb,queuePostFlushCb:Yi,reactive:an,readonly:lo,ref:f,registerRuntimeCompiler:Ih,render:sm,renderList:Hb,renderSlot:zb,resolveComponent:$b,resolveDirective:Bb,resolveDynamicComponent:Ub,resolveFilter:Yy,resolveTransitionHooks:li,setBlockTracking:al,setDevtoolsHook:Ky,setTransitionHooks:Fa,shallowReactive:Bc,shallowReadonly:Fg,shallowRef:Hc,ssrContextKey:Mf,ssrUtils:Zy,stop:yg,toDisplayString:rf,toHandlerKey:Yn,toHandlers:Vb,toRaw:tt,toRef:Gg,toRefs:zg,toValue:Bg,transformVNodeArgs:Dy,triggerRef:Ug,unref:ca,useAttrs:ey,useCssModule:Sx,useCssVars:rx,useHost:qh,useId:yb,useModel:py,useSSRContext:Ff,useShadowRoot:kx,useSlots:Xb,useTemplateRef:xb,useTransitionState:qc,vModelCheckbox:ld,vModelDynamic:Yh,vModelRadio:od,vModelSelect:Jh,vModelText:_o,vShow:Hh,version:Dh,warn:qy,watch:Ft,watchEffect:ub,watchPostEffect:pb,watchSyncEffect:$f,withAsyncContext:ny,withCtx:Vc,withDefaults:Qb,withDirectives:cb,withKeys:$x,withMemo:Vy,withModifiers:Mx,withScopeId:rb},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const il=Symbol(""),Vi=Symbol(""),rd=Symbol(""),ko=Symbol(""),lm=Symbol(""),Sn=Symbol(""),om=Symbol(""),rm=Symbol(""),cd=Symbol(""),dd=Symbol(""),wl=Symbol(""),ud=Symbol(""),cm=Symbol(""),pd=Symbol(""),fd=Symbol(""),hd=Symbol(""),md=Symbol(""),vd=Symbol(""),gd=Symbol(""),dm=Symbol(""),um=Symbol(""),tr=Symbol(""),So=Symbol(""),bd=Symbol(""),yd=Symbol(""),ll=Symbol(""),kl=Symbol(""),xd=Symbol(""),uc=Symbol(""),jx=Symbol(""),pc=Symbol(""),To=Symbol(""),zx=Symbol(""),Vx=Symbol(""),_d=Symbol(""),qx=Symbol(""),Gx=Symbol(""),wd=Symbol(""),pm=Symbol(""),di={[il]:"Fragment",[Vi]:"Teleport",[rd]:"Suspense",[ko]:"KeepAlive",[lm]:"BaseTransition",[Sn]:"openBlock",[om]:"createBlock",[rm]:"createElementBlock",[cd]:"createVNode",[dd]:"createElementVNode",[wl]:"createCommentVNode",[ud]:"createTextVNode",[cm]:"createStaticVNode",[pd]:"resolveComponent",[fd]:"resolveDynamicComponent",[hd]:"resolveDirective",[md]:"resolveFilter",[vd]:"withDirectives",[gd]:"renderList",[dm]:"renderSlot",[um]:"createSlots",[tr]:"toDisplayString",[So]:"mergeProps",[bd]:"normalizeClass",[yd]:"normalizeStyle",[ll]:"normalizeProps",[kl]:"guardReactiveProps",[xd]:"toHandlers",[uc]:"camelize",[jx]:"capitalize",[pc]:"toHandlerKey",[To]:"setBlockTracking",[zx]:"pushScopeId",[Vx]:"popScopeId",[_d]:"withCtx",[qx]:"unref",[Gx]:"isRef",[wd]:"withMemo",[pm]:"isMemoSame"};function Wx(e){Object.getOwnPropertySymbols(e).forEach(t=>{di[t]=e[t]})}const Is={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Kx(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Is}}function ol(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Is){return e&&(o?(e.helper(Sn),e.helper(fi(e.inSSR,c))):e.helper(pi(e.inSSR,c)),l&&e.helper(vd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function xn(e,t=Is){return{type:17,loc:t,elements:e}}function $s(e,t=Is){return{type:15,loc:t,properties:e}}function Pt(e,t){return{type:16,loc:Is,key:Be(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Is,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Ks(e,t=Is){return{type:8,loc:t,children:e}}function zt(e,t=[],s=Is){return{type:14,loc:s,callee:e,arguments:t}}function ui(e,t=void 0,s=!1,a=!1,n=Is){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function fc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Is}}function Jx(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Is}}function Zx(e){return{type:21,body:e,loc:Is}}function pi(e,t){return e||t?cd:dd}function fi(e,t){return e||t?om:rm}function kd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(pi(a,e.isComponent)),t(Sn),t(fi(a,e.isComponent)))}const Nu=new Uint8Array([123,123]),Du=new Uint8Array([125,125]);function Pu(e){return e>=97&&e<=122||e>=65&&e<=90}function Cs(e){return e===32||e===10||e===9||e===12||e===13}function qa(e){return e===47||e===62||Cs(e)}function Co(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const es={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Yx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Nu,this.delimiterClose=Du,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Nu,this.delimiterClose=Du}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?qa(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Cs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===es.TitleEnd||this.currentSequence===es.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===es.Cdata[this.sequenceIndex]?++this.sequenceIndex===es.Cdata.length&&(this.state=28,this.currentSequence=es.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===es.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Pu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){qa(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(qa(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Co("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Cs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Pu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Cs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Cs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Cs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||qa(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||qa(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||qa(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||qa(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||qa(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Cs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Cs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Cs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=es.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===es.ScriptEnd[3]?this.startSpecial(es.ScriptEnd,4):t===es.StyleEnd[3]?this.startSpecial(es.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===es.TitleEnd[3]?this.startSpecial(es.TitleEnd,4):t===es.TextareaEnd[3]?this.startSpecial(es.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===es.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Mu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function _n(e,t){const s=Mu("MODE",t),a=Mu(e,t);return s===3?a===!0:a!==!1}function rl(e,t,s,...a){return _n(e,t)}function Sd(e){throw e}function fm(e){}function xt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const xs=e=>e.type===4&&e.isStatic;function hm(e){switch(e){case"Teleport":case"teleport":return Vi;case"Suspense":case"suspense":return rd;case"KeepAlive":case"keep-alive":return ko;case"BaseTransition":case"base-transition":return lm}}const Qx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Td=e=>!Qx.test(e),mm=/[A-Za-z_$\xA0-\uFFFF]/,Xx=/[\.\?\w$\xA0-\uFFFF]/,e0=/\s+[.[]\s*|\s*[.[]\s+/g,vm=e=>e.type===4?e.content:e.loc.source,t0=e=>{const t=vm(e).trim().replace(e0,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?mm:Xx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},gm=t0,s0=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,a0=e=>s0.test(vm(e)),n0=a0;function Fs(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Be(t)?n.name===t:t.test(n.name)))return n}}function sr(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&hn(i.arg,t))return i}}function hn(e,t){return!!(e&&xs(e)&&e.content===t)}function i0(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Ir(e){return e.type===5||e.type===2}function Fu(e){return e.type===7&&e.name==="pre"}function l0(e){return e.type===7&&e.name==="slot"}function Eo(e){return e.type===1&&e.tagType===3}function Ao(e){return e.type===1&&e.tagType===2}const o0=new Set([ll,kl]);function bm(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&o0.has(s))return bm(e.arguments[0],t.concat(e))}return[e,t]}function Ro(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Be(n)&&n.type===14){const o=bm(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Be(n))a=$s([t]);else if(n.type===14){const o=n.arguments[0];!Be(o)&&o.type===15?$u(t,o)||o.properties.unshift(t):n.callee===xd?a=zt(s.helper(So),[$s([t]),n]):n.arguments.unshift($s([t])),!a&&(a=n)}else n.type===15?($u(t,n)||n.properties.unshift(t),a=n):(a=zt(s.helper(So),[$s([t]),n]),l&&l.callee===kl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function $u(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function cl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function r0(e){return e.type===14&&e.callee===wd?e.arguments[1].returns:e}const c0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function ym(e){for(let t=0;t<e.length;t++)if(!Cs(e.charCodeAt(t)))return!1;return!0}function Cd(e){return e.type===2&&ym(e.content)||e.type===12&&Cd(e.content)}function xm(e){return e.type===3||Cd(e)}const _m={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Gn,isPreTag:Gn,isIgnoreNewlineTag:Gn,isCustomElement:Gn,onError:Sd,onWarn:fm,comments:!1,prefixIdentifiers:!1};let it=_m,dl=null,Na="",ss=null,Xe=null,ms="",_a=-1,un=-1,Ed=0,Ya=!1,hc=null;const yt=[],Et=new Yx(yt,{onerr:ba,ontext(e,t){Bl(Jt(e,t),e,t)},ontextentity(e,t,s){Bl(e,t,s)},oninterpolation(e,t){if(Ya)return Bl(Jt(e,t),e,t);let s=e+Et.delimiterOpen.length,a=t-Et.delimiterClose.length;for(;Cs(Na.charCodeAt(s));)s++;for(;Cs(Na.charCodeAt(a-1));)a--;let n=Jt(s,a);n.includes("&")&&(n=it.decodeEntities(n,!1)),mc({type:5,content:Xl(n,!1,Rt(s,a)),loc:Rt(e,t)})},onopentagname(e,t){const s=Jt(e,t);ss={type:1,tag:s,ns:it.getNamespace(s,yt[0],it.ns),tagType:0,props:[],children:[],loc:Rt(e-1,t),codegenNode:void 0}},onopentagend(e){Bu(e)},onclosetag(e,t){const s=Jt(e,t);if(!it.isVoidTag(s)){let a=!1;for(let n=0;n<yt.length;n++)if(yt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ba(24,yt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=yt.shift();Ql(o,t,l<n)}break}a||ba(23,wm(e,60))}},onselfclosingtag(e){const t=ss.tag;ss.isSelfClosing=!0,Bu(e),yt[0]&&yt[0].tag===t&&Ql(yt.shift(),e)},onattribname(e,t){Xe={type:6,name:Jt(e,t),nameLoc:Rt(e,t),value:void 0,loc:Rt(e)}},ondirname(e,t){const s=Jt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ya&&a===""&&ba(26,e),Ya||a==="")Xe={type:6,name:s,nameLoc:Rt(e,t),value:void 0,loc:Rt(e)};else if(Xe={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:Rt(e)},a==="pre"){Ya=Et.inVPre=!0,hc=ss;const n=ss.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=y0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Jt(e,t);if(Ya&&!Fu(Xe))Xe.name+=s,mn(Xe.nameLoc,t);else{const a=s[0]!=="[";Xe.arg=Xl(a?s:s.slice(1,-1),a,Rt(e,t),a?3:0)}},ondirmodifier(e,t){const s=Jt(e,t);if(Ya&&!Fu(Xe))Xe.name+="."+s,mn(Xe.nameLoc,t);else if(Xe.name==="slot"){const a=Xe.arg;a&&(a.content+="."+s,mn(a.loc,t))}else{const a=Ve(s,!0,Rt(e,t));Xe.modifiers.push(a)}},onattribdata(e,t){ms+=Jt(e,t),_a<0&&(_a=e),un=t},onattribentity(e,t,s){ms+=e,_a<0&&(_a=t),un=s},onattribnameend(e){const t=Xe.loc.start.offset,s=Jt(t,e);Xe.type===7&&(Xe.rawName=s),ss.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ba(2,t)},onattribend(e,t){if(ss&&Xe){if(mn(Xe.loc,t),e!==0)if(ms.includes("&")&&(ms=it.decodeEntities(ms,!0)),Xe.type===6)Xe.name==="class"&&(ms=Sm(ms).trim()),e===1&&!ms&&ba(13,t),Xe.value={type:2,content:ms,loc:e===1?Rt(_a,un):Rt(_a-1,un+1)},Et.inSFCRoot&&ss.tag==="template"&&Xe.name==="lang"&&ms&&ms!=="html"&&Et.enterRCDATA(Co("</template"),0);else{let s=0;Xe.exp=Xl(ms,!1,Rt(_a,un),0,s),Xe.name==="for"&&(Xe.forParseResult=u0(Xe.exp));let a=-1;Xe.name==="bind"&&(a=Xe.modifiers.findIndex(n=>n.content==="sync"))>-1&&rl("COMPILER_V_BIND_SYNC",it,Xe.loc,Xe.arg.loc.source)&&(Xe.name="model",Xe.modifiers.splice(a,1))}(Xe.type!==7||Xe.name!=="pre")&&ss.props.push(Xe)}ms="",_a=un=-1},oncomment(e,t){it.comments&&mc({type:3,content:Jt(e,t),loc:Rt(e-4,t+3)})},onend(){const e=Na.length;for(let t=0;t<yt.length;t++)Ql(yt[t],e-1),ba(24,yt[t].loc.start.offset)},oncdata(e,t){(yt[0]?yt[0].ns:it.ns)!==0?Bl(Jt(e,t),e,t):ba(1,e-9)},onprocessinginstruction(e){(yt[0]?yt[0].ns:it.ns)===0&&ba(21,e-1)}}),Uu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,d0=/^\(|\)$/g;function u0(e){const t=e.loc,s=e.content,a=s.match(c0);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Xl(u,!1,Rt(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(d0,"").trim();const c=n.indexOf(r),d=r.match(Uu);if(d){r=r.replace(Uu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Jt(e,t){return Na.slice(e,t)}function Bu(e){Et.inSFCRoot&&(ss.innerLoc=Rt(e+1,e+1)),mc(ss);const{tag:t,ns:s}=ss;s===0&&it.isPreTag(t)&&Ed++,it.isVoidTag(t)?Ql(ss,e):(yt.unshift(ss),(s===1||s===2)&&(Et.inXML=!0)),ss=null}function Bl(e,t,s){{const i=yt[0]&&yt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=it.decodeEntities(e,!1))}const a=yt[0]||dl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,mn(n.loc,s)):a.children.push({type:2,content:e,loc:Rt(t,s)})}function Ql(e,t,s=!1){s?mn(e.loc,wm(t,60)):mn(e.loc,p0(t,62)+1),Et.inSFCRoot&&(e.children.length?e.innerLoc.end=Ze({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ze({},e.innerLoc.start),e.innerLoc.source=Jt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Ya||(a==="slot"?e.tagType=2:Hu(e)?e.tagType=3:h0(e)&&(e.tagType=1)),Et.inRCDATA||(e.children=km(i)),n===0&&it.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&it.isPreTag(a)&&Ed--,hc===e&&(Ya=Et.inVPre=!1,hc=null),Et.inXML&&(yt[0]?yt[0].ns:it.ns)===0&&(Et.inXML=!1);{const l=e.props;if(!Et.inSFCRoot&&_n("COMPILER_NATIVE_TEMPLATE",it)&&e.tag==="template"&&!Hu(e)){const r=yt[0]||dl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&rl("COMPILER_INLINE_TEMPLATE",it,o.loc)&&e.children.length&&(o.value={type:2,content:Jt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function p0(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s<Na.length-1;)s++;return s}function wm(e,t){let s=e;for(;Na.charCodeAt(s)!==t&&s>=0;)s--;return s}const f0=new Set(["if","else","else-if","for","slot"]);function Hu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&f0.has(t[s].name))return!0}return!1}function h0({tag:e,props:t}){if(it.isCustomElement(e))return!1;if(e==="component"||m0(e.charCodeAt(0))||hm(e)||it.isBuiltInComponent&&it.isBuiltInComponent(e)||it.isNativeTag&&!it.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(rl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}}else if(a.name==="bind"&&hn(a.arg,"is")&&rl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}return!1}function m0(e){return e>64&&e<91}const v0=/\r\n/g;function km(e){const t=it.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(Ed)n.content=n.content.replace(v0,`
`);else if(ym(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&g0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=Sm(n.content))}return s?e.filter(Boolean):e}function g0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Sm(e){let t="",s=!1;for(let a=0;a<e.length;a++)Cs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function mc(e){(yt[0]||dl).children.push(e)}function Rt(e,t){return{start:Et.getPos(e),end:t==null?t:Et.getPos(t),source:t==null?t:Jt(e,t)}}function b0(e){return Rt(e.start.offset,e.end.offset)}function mn(e,t){e.end=Et.getPos(t),e.source=Jt(e.start.offset,t)}function y0(e){const t={type:6,name:e.rawName,nameLoc:Rt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Xl(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ba(e,t,s){it.onError(xt(e,Rt(t,t)))}function x0(){Et.reset(),ss=null,Xe=null,ms="",_a=-1,un=-1,yt.length=0}function _0(e,t){if(x0(),Na=e,it=Ze({},_m),t){let n;for(n in t)t[n]!=null&&(it[n]=t[n])}Et.mode=it.parseMode==="html"?1:it.parseMode==="sfc"?2:0,Et.inXML=it.ns===1||it.ns===2;const s=t&&t.delimiters;s&&(Et.delimiterOpen=Co(s[0]),Et.delimiterClose=Co(s[1]));const a=dl=Kx([],e);return Et.parse(Na),a.loc=Rt(0,e.length),a.children=km(a.children),dl=null,a}function w0(e,t){eo(e,void 0,t,!!Tm(e))}function Tm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Ao(t[0])?t[0]:null}function eo(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Es(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&Em(u,s)>=2){const v=Am(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:Es(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,eo(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)eo(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)eo(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Re(e.codegenNode.children))e.codegenNode.children=r(xn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Re(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(xn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Re(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Fs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(xn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Re(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Es(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=Em(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Es(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Es(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Sn),t.removeHelper(fi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(pi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Es(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||ls(o))continue;const r=Es(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const k0=new Set([bd,yd,ll,kl]);function Cm(e,t){if(e.type===14&&!Be(e.callee)&&k0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Es(s,t);if(s.type===14)return Cm(s,t)}return 0}function Em(e,t){let s=3;const a=Am(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Es(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Es(o,t):o.type===14?c=Cm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Am(e){const t=e.codegenNode;if(t.type===13)return t.props}function S0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Qt,isCustomElement:d=Qt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:E="",bindingMetadata:R=Ye,inline:y=!1,isTS:g=!1,onError:b=Sd,onWarn:x=fm,compatConfig:_}){const k=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),S={filename:t,selfName:k&&An(vt(k[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:E,bindingMetadata:R,inline:y,isTS:g,onError:b,onWarn:x,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const I=S.helpers.get(w)||0;return S.helpers.set(w,I+1),w},removeHelper(w){const I=S.helpers.get(w);if(I){const $=I-1;$?S.helpers.set(w,$):S.helpers.delete(w)}},helperString(w){return`_${di[S.helper(w)]}`},replaceNode(w){S.parent.children[S.childIndex]=S.currentNode=w},removeNode(w){const I=S.parent.children,$=w?I.indexOf(w):S.currentNode?S.childIndex:-1;!w||w===S.currentNode?(S.currentNode=null,S.onNodeRemoved()):S.childIndex>$&&(S.childIndex--,S.onNodeRemoved()),S.parent.children.splice($,1)},onNodeRemoved:Qt,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){Be(w)&&(w=Ve(w)),S.hoists.push(w);const I=Ve(`_hoisted_${S.hoists.length}`,!1,w.loc,2);return I.hoisted=w,I},cache(w,I=!1,$=!1){const T=Jx(S.cached.length,w,I,$);return S.cached.push(T),T}};return S.filters=new Set,S}function T0(e,t){const s=S0(e,t);ar(e,s),t.hoistStatic&&w0(e,s),t.ssr||C0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function C0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=Tm(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&kd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=ol(t,s(il),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function E0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Be(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,ar(n,t))}}function ar(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Re(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(wl);break;case 5:t.ssr||t.helper(tr);break;case 9:for(let i=0;i<e.branches.length;i++)ar(e.branches[i],t);break;case 10:case 11:case 1:case 0:E0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function Rm(e,t){const s=Be(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(l0))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const nr="/*@__PURE__*/",Im=e=>`${di[e]}: _${di[e]}`;function A0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${di[v]}`},push(v,E=-2,R){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function R0(e,t={}){const s=A0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";I0(e,s);const v=d?"ssrRender":"render",R=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${v}(${R}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(Im).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(Or(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(Or(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),Or(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?is(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function I0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[cd,dd,wl,ud,cm].filter(p=>d.includes(p)).map(Im).join(", ");n(`const { ${u} } = _Vue
`,-1)}O0(e.hoists,t),i(),n("return ")}function Or(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?md:t==="component"?pd:hd);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${cl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function O0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),is(i,t),a())}t.pure=!1}function Ad(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Sl(e,t,s),s&&t.deindent(),t.push("]")}function Sl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?n(o,-3):Re(o)?Ad(o,t):is(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function is(e,t){if(Be(e)){t.push(e,-3);return}if(ls(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:is(e.codegenNode,t);break;case 2:L0(e,t);break;case 4:Om(e,t);break;case 5:N0(e,t);break;case 12:is(e.codegenNode,t);break;case 8:Lm(e,t);break;case 3:P0(e,t);break;case 13:M0(e,t);break;case 14:$0(e,t);break;case 15:U0(e,t);break;case 17:B0(e,t);break;case 18:H0(e,t);break;case 19:j0(e,t);break;case 20:z0(e,t);break;case 21:Sl(e.body,t,!0,!1);break}}function L0(e,t){t.push(JSON.stringify(e.content),-3,e)}function Om(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function N0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(nr),s(`${a(tr)}(`),is(e.content,t),s(")")}function Lm(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Be(a)?t.push(a,-3):is(a,t)}}function D0(e,t){const{push:s}=t;if(e.type===8)s("["),Lm(e,t),s("]");else if(e.isStatic){const a=Td(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function P0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(nr),s(`${a(wl)}(${JSON.stringify(e.content)})`,-3,e)}function M0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(vd)+"("),u&&s(`(${a(Sn)}(${p?"true":""}), `),n&&s(nr);const v=u?fi(t.inSSR,h):pi(t.inSSR,h);s(a(v)+"(",-2,e),Sl(F0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),is(d,t),s(")"))}function F0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function $0(e,t){const{push:s,helper:a,pure:n}=t,i=Be(e.callee)?e.callee:a(e.callee);n&&s(nr),s(i+"(",-2,e),Sl(e.arguments,t),s(")")}function U0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];D0(c,t),s(": "),is(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function B0(e,t){Ad(e.elements,t)}function H0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${di[_d]}(`),s("(",-2,e),Re(i)?Sl(i,t):i&&is(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Re(l)?Ad(l,t):is(l,t)):o&&is(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function j0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Td(s.content);u&&l("("),Om(s,t),u&&l(")")}else l("("),is(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),is(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,is(n,t),d||t.indentLevel--,i&&r(!0)}function z0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(To)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),is(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(To)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const V0=Rm(/^(?:if|else|else-if)$/,(e,t,s)=>q0(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=zu(n,r,s);else{const c=G0(a.codegenNode);c.alternate=zu(n,r+a.branches.length-1,s)}}}));function q0(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(xt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=ju(e,t),i={type:9,loc:b0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&xm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(xt(30,e.loc)),s.removeNode();const o=ju(e,t);l.branches.push(o);const r=a&&a(l,o,!1);ar(o,s),r&&r(),s.currentNode=null}else s.onError(xt(30,e.loc));break}}}function ju(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Fs(e,"for")?e.children:[e],userKey:sr(e,"key"),isTemplateIf:s}}function zu(e,t,s){return e.condition?fc(e.condition,Vu(e,t,s),zt(s.helper(wl),['""',"true"])):Vu(e,t,s)}function Vu(e,t,s){const{helper:a}=s,n=Pt("key",Ve(`${t}`,!1,Is,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Ro(r,n,s),r}else return ol(s,a(il),$s([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=r0(r);return c.type===13&&kd(c,s),Ro(c,n,s),r}}function G0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const W0=Rm("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return K0(e,t,s,i=>{const l=zt(a(gd),[i.source]),o=Eo(e),r=Fs(e,"memo"),c=sr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Pt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=ol(s,a(il),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,E=v.length!==1||v[0].type!==1,R=Ao(e)?e:o&&e.children.length===1&&Ao(e.children[0])?e.children[0]:null;if(R?(m=R.codegenNode,o&&u&&Ro(m,u,s)):E?m=ol(s,a(il),u?$s([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Ro(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Sn),n(fi(s.inSSR,m.isComponent))):n(pi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Sn),a(fi(s.inSSR,m.isComponent))):a(pi(s.inSSR,m.isComponent))),r){const y=ui(vc(i.parseResult,[Ve("_cached")]));y.body=Zx([Ks(["const _memo = (",r.exp,")"]),Ks(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(pm)}(_cached, _memo)) return _cached`]),Ks(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(y,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ui(vc(i.parseResult),m,!0))}})});function K0(e,t,s,a){if(!t.exp){s.onError(xt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(xt(32,t.loc));return}Nm(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:Eo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function Nm(e,t){e.finalized||(e.finalized=!0)}function vc({value:e,key:t,index:s},a=[]){return J0([e,t,s,...a])}function J0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const qu=Ve("undefined",!1),Z0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Fs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Y0=(e,t,s,a)=>ui(e,s,!1,!0,s.length?s[0].loc:a);function Q0(e,t,s=Y0){t.helper(_d);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Fs(e,"slot",!0);if(r){const{arg:E,exp:R}=r;E&&!xs(E)&&(o=!0),i.push(Pt(E||Ve("default",!0),s(R,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let E=0;E<a.length;E++){const R=a[E];let y;if(!Eo(R)||!(y=Fs(R,"slot",!0))){R.type!==3&&u.push(R);continue}if(r){t.onError(xt(37,y.loc));break}c=!0;const{children:g,loc:b}=R,{arg:x=Ve("default",!0),exp:_,loc:k}=y;let S;xs(x)?S=x?x.content:"default":o=!0;const w=Fs(R,"for"),I=s(_,w,g,b);let $,T;if($=Fs(R,"if"))o=!0,l.push(fc($.exp,Hl(x,I,h++),qu));else if(T=Fs(R,/^else(?:-if)?$/,!0)){let P=E,q;for(;P--&&(q=a[P],!!xm(q)););if(q&&Eo(q)&&Fs(q,/^(?:else-)?if$/)){let K=l[l.length-1];for(;K.alternate.type===19;)K=K.alternate;K.alternate=T.exp?fc(T.exp,Hl(x,I,h++),qu):Hl(x,I,h++)}else t.onError(xt(30,T.loc))}else if(w){o=!0;const P=w.forParseResult;P?(Nm(P),l.push(zt(t.helper(gd),[P.source,ui(vc(P),Hl(x,I),!0)]))):t.onError(xt(32,w.loc))}else{if(S){if(p.has(S)){t.onError(xt(38,k));continue}p.add(S),S==="default"&&(d=!0)}i.push(Pt(x,I))}}if(!r){const E=(R,y)=>{const g=s(R,void 0,y,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Pt("default",g)};c?u.length&&!u.every(Cd)&&(d?t.onError(xt(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,a))}const m=o?2:to(e.children)?3:1;let v=$s(i.concat(Pt("_",Ve(m+"",!1))),n);return l.length&&(v=zt(t.helper(um),[v,xn(l)])),{slots:v,hasDynamicSlots:o}}function Hl(e,t,s){const a=[Pt("name",e),Pt("fn",t)];return s!=null&&a.push(Pt("key",Ve(String(s),!0))),$s(a)}function to(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||to(s.children))return!0;break;case 9:if(to(s.branches))return!0;break;case 10:case 11:if(to(s.children))return!0;break}}return!1}const Dm=new WeakMap,X0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?e_(e,t):`"${a}"`;const o=lt(l)&&l.callee===fd;let r,c,d=0,u,p,h,m=o||l===Vi||l===rd||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const v=Pm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const E=v.directives;h=E&&E.length?xn(E.map(R=>s_(R,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===ko&&(m=!0,d|=1024),i&&l!==Vi&&l!==ko){const{slots:E,hasDynamicSlots:R}=Q0(e,t);c=E,R&&(d|=1024)}else if(e.children.length===1&&l!==Vi){const E=e.children[0],R=E.type,y=R===5||R===8;y&&Es(E,t)===0&&(d|=1),y||R===2?c=E:c=e.children}else c=e.children;p&&p.length&&(u=a_(p)),e.codegenNode=ol(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function e_(e,t,s=!1){let{tag:a}=e;const n=gc(a),i=sr(e,"is",!1,!0);if(i)if(n||_n("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return zt(t.helper(fd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=hm(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(pd),t.components.add(a),cl(a,"component"))}function Pm(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,E=!1,R=!1,y=!1,g=!1,b=!1;const x=[],_=I=>{c.length&&(d.push($s(Gu(c),o)),c=[]),I&&d.push(I)},k=()=>{t.scopes.vFor>0&&c.push(Pt(Ve("ref_for",!0),Ve("true")))},S=({key:I,value:$})=>{if(xs(I)){const T=I.content,P=Cn(T);if(P&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Ia(T)&&(y=!0),P&&Ia(T)&&(b=!0),P&&$.type===14&&($=$.arguments[0]),$.type===20||($.type===4||$.type===8)&&Es($,t)>0)return;T==="ref"?v=!0:T==="class"?E=!0:T==="style"?R=!0:T!=="key"&&!x.includes(T)&&x.push(T),a&&(T==="class"||T==="style")&&!x.includes(T)&&x.push(T)}else g=!0};for(let I=0;I<s.length;I++){const $=s[I];if($.type===6){const{loc:T,name:P,nameLoc:q,value:K}=$;let D=!0;if(P==="ref"&&(v=!0,k()),P==="is"&&(gc(l)||K&&K.content.startsWith("vue:")||_n("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Pt(Ve(P,!0,q),Ve(K?K.content:"",D,K?K.loc:T)))}else{const{name:T,arg:P,exp:q,loc:K,modifiers:D}=$,O=T==="bind",L=T==="on";if(T==="slot"){a||t.onError(xt(40,K));continue}if(T==="once"||T==="memo"||T==="is"||O&&hn(P,"is")&&(gc(l)||_n("COMPILER_IS_ON_ELEMENT",t))||L&&i)continue;if((O&&hn(P,"key")||L&&p&&hn(P,"vue:before-update"))&&(h=!0),O&&hn(P,"ref")&&k(),!P&&(O||L)){if(g=!0,q)if(O){if(_(),_n("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(q);continue}k(),_(),d.push(q)}else _({type:14,loc:K,callee:t.helper(xd),arguments:a?[q]:[q,"true"]});else t.onError(xt(O?34:35,K));continue}O&&D.some(ie=>ie.content==="prop")&&(m|=32);const te=t.directiveTransforms[T];if(te){const{props:ie,needRuntime:U}=te($,e,t);!i&&ie.forEach(S),L&&P&&!xs(P)?_($s(ie,o)):c.push(...ie),U&&(u.push($),ls(U)&&Dm.set($,U))}else Wv(T)||(u.push($),p&&(h=!0))}}let w;if(d.length?(_(),d.length>1?w=zt(t.helper(So),d,o):w=d[0]):c.length&&(w=$s(Gu(c),o)),g?m|=16:(E&&!a&&(m|=2),R&&!a&&(m|=4),x.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&w)switch(w.type){case 15:let I=-1,$=-1,T=!1;for(let K=0;K<w.properties.length;K++){const D=w.properties[K].key;xs(D)?D.content==="class"?I=K:D.content==="style"&&($=K):D.isHandlerKey||(T=!0)}const P=w.properties[I],q=w.properties[$];T?w=zt(t.helper(ll),[w]):(P&&!xs(P.value)&&(P.value=zt(t.helper(bd),[P.value])),q&&(R||q.value.type===4&&q.value.content.trim()[0]==="["||q.value.type===17)&&(q.value=zt(t.helper(yd),[q.value])));break;case 14:break;default:w=zt(t.helper(ll),[zt(t.helper(kl),[w])]);break}return{props:w,directives:u,patchFlag:m,dynamicPropNames:x,shouldUseBlock:h}}function Gu(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Cn(i))&&t_(l,n):(t.set(i,n),s.push(n))}return s}function t_(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=xn([e.value,t.value],e.loc)}function s_(e,t){const s=[],a=Dm.get(e);a?s.push(t.helperString(a)):(t.helper(hd),t.directives.add(e.name),s.push(cl(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push($s(e.modifiers.map(l=>Pt(l,i)),n))}return xn(s,e.loc)}function a_(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function gc(e){return e==="component"||e==="Component"}const n_=(e,t)=>{if(Ao(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=i_(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=ui([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=zt(t.helper(dm),l,a)}};function i_(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=vt(l.name),n.push(l)));else if(l.name==="bind"&&hn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=vt(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&xs(l.arg)&&(l.arg.content=vt(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Pm(e,t,n,!1,!1);a=i,l.length&&t.onError(xt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Mm=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(xt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Yn(vt(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Ks([`${s.helperString(pc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(pc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=gm(r),p=!(u||n0(r)),h=r.content.includes(";");(p||c&&u)&&(r=Ks([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Pt(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},l_=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=vt(i.content):i.content=`${s.helperString(uc)}(${i.content})`:(i.children.unshift(`${s.helperString(uc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Wu(i,"."),a.some(o=>o.content==="attr")&&Wu(i,"^")),{props:[Pt(i,l)]}},Wu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},o_=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Ir(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(Ir(r))a||(a=s[i]=Ks([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Ir(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Es(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:zt(t.helper(ud),o)}}}}},Ku=new WeakSet,r_=(e,t)=>{if(e.type===1&&Fs(e,"once",!0))return Ku.has(e)||t.inVOnce||t.inSSR?void 0:(Ku.add(e),t.inVOnce=!0,t.helper(To),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Fm=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(xt(41,e.loc)),Ci();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(xt(44,a.loc)),Ci();if(o==="literal-const"||o==="setup-const")return s.onError(xt(45,a.loc)),Ci();if(!l.trim()||!gm(a))return s.onError(xt(42,a.loc)),Ci();const r=n||Ve("modelValue",!0),c=n?xs(n)?`onUpdate:${vt(n.content)}`:Ks(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ks([`${u} => ((`,a,") = $event)"]);const p=[Pt(r,e.exp),Pt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(Td(v)?v:JSON.stringify(v))+": true").join(", "),m=n?xs(n)?`${n.content}Modifiers`:Ks([n,' + "Modifiers"']):"modelModifiers";p.push(Pt(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ci(p)};function Ci(e=[]){return{props:e}}const c_=/[\w).+\-_$\]]/,d_=(e,t)=>{_n("COMPILER_FILTERS",t)&&(e.type===5?Io(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Io(s.exp,t)}))};function Io(e,t){if(e.type===4)Ju(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Ju(a,t):a.type===8?Io(e,t):a.type===5&&Io(a.content,t))}}function Ju(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):E();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let R=h-1,y;for(;R>=0&&(y=s.charAt(R),y===" ");R--);(!y||!c_.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&E();function E(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=u_(m,v[h],t);e.content=m,e.ast=void 0}}function u_(e,t,s){s.helper(md);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${cl(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${cl(n,"filter")}(${e}${i!==")"?","+i:i}`}}const Zu=new WeakSet,p_=(e,t)=>{if(e.type===1){const s=Fs(e,"memo");return!s||Zu.has(e)||t.inSSR?void 0:(Zu.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&kd(a,t),e.codegenNode=zt(t.helper(wd),[s.exp,ui(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},f_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(xt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=vt(a.content);(mm.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function h_(e){return[[f_,r_,V0,p_,W0,d_,n_,X0,Z0,o_],{on:Mm,bind:l_,model:Fm}]}function m_(e,t={}){const s=t.onError||Sd,a=t.mode==="module";t.prefixIdentifiers===!0?s(xt(48)):a&&s(xt(49));const n=!1;t.cacheHandlers&&s(xt(50)),t.scopeId&&!a&&s(xt(51));const i=Ze({},t,{prefixIdentifiers:n}),l=Be(e)?_0(e,i):e,[o,r]=h_();return T0(l,Ze({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Ze({},r,t.directiveTransforms||{})})),R0(l,i)}const v_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $m=Symbol(""),Um=Symbol(""),Bm=Symbol(""),Hm=Symbol(""),bc=Symbol(""),jm=Symbol(""),zm=Symbol(""),Vm=Symbol(""),qm=Symbol(""),Gm=Symbol("");Wx({[$m]:"vModelRadio",[Um]:"vModelCheckbox",[Bm]:"vModelText",[Hm]:"vModelSelect",[bc]:"vModelDynamic",[jm]:"withModifiers",[zm]:"withKeys",[Vm]:"vShow",[qm]:"Transition",[Gm]:"TransitionGroup"});let $n;function g_(e,t=!1){return $n||($n=document.createElement("div")),t?($n.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,$n.children[0].getAttribute("foo")):($n.innerHTML=e,$n.textContent)}const b_={parseMode:"html",isVoidTag:dg,isNativeTag:e=>og(e)||rg(e)||cg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:g_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return qm;if(e==="TransitionGroup"||e==="transition-group")return Gm},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},y_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:x_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},x_=(e,t)=>{const s=nf(e);return Ve(JSON.stringify(s),!1,t,3)};function tn(e,t){return xt(e,t)}const __=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(54,n)),t.children.length&&(s.onError(tn(55,n)),t.children.length=0),{props:[Pt(Ve("innerHTML",!0,n),a||Ve("",!0))]}},w_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(56,n)),t.children.length&&(s.onError(tn(57,n)),t.children.length=0),{props:[Pt(Ve("textContent",!0),a?Es(a,s)>0?a:zt(s.helperString(tr),[a],n):Ve("",!0))]}},k_=(e,t,s)=>{const a=Fm(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(tn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Bm,o=!1;if(n==="input"||i){const r=sr(t,"type");if(r){if(r.type===7)l=bc;else if(r.value)switch(r.value.content){case"radio":l=$m;break;case"checkbox":l=Um;break;case"file":o=!0,s.onError(tn(60,e.loc));break}}else i0(t)&&(l=bc)}else n==="select"&&(l=Hm);o||(a.needRuntime=s.helper(l))}else s.onError(tn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},S_=Rs("passive,once,capture"),T_=Rs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),C_=Rs("left,right"),Wm=Rs("onkeyup,onkeydown,onkeypress"),E_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&rl("COMPILER_V_ON_NATIVE",s)||S_(r)?l.push(r):C_(r)?xs(e)?Wm(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):T_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Yu=(e,t)=>xs(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Ks(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,A_=(e,t,s)=>Mm(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=E_(i,n,s,e.loc);if(r.includes("right")&&(i=Yu(i,"onContextmenu")),r.includes("middle")&&(i=Yu(i,"onMouseup")),r.length&&(l=zt(s.helper(jm),[l,JSON.stringify(r)])),o.length&&(!xs(i)||Wm(i.content.toLowerCase()))&&(l=zt(s.helper(zm),[l,JSON.stringify(o)])),c.length){const d=c.map(An).join("");i=xs(i)?Ve(`${i.content}${d}`,!0):Ks(["(",i,`) + "${d}"`])}return{props:[Pt(i,l)]}}),R_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(62,n)),{props:[],needRuntime:s.helper(Vm)}},I_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},O_=[y_],L_={cloak:v_,html:__,text:w_,model:k_,on:A_,show:R_};function N_(e,t={}){return m_(e,Ze({},b_,t,{nodeTransforms:[I_,...O_,...t.nodeTransforms||[]],directiveTransforms:Ze({},L_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Qu=Object.create(null);function D_(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Qt;const s=Zv(e,t),a=Qu[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Ze({hoistStatic:!0,onError:void 0,onWarn:Qt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=N_(e,n),l=new Function("Vue",i)(Hx);return l._rc=!0,Qu[s]=l}Ih(D_);const Oo=an({items:[]});let P_=1;function ir(e,t="info",s=3e3){const a=P_++;return Oo.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>Rd(a),s),a}function Rd(e){const t=Oo.items.findIndex(s=>s.id===e);t>=0&&Oo.items.splice(t,1)}function _e(e,t="info",s=3e3){return ir(e,t,s)}_e.success=(e,t=3e3)=>ir(e,"success",t);_e.error=(e,t=5e3)=>ir(e,"error",t);_e.info=(e,t=3e3)=>ir(e,"info",t);_e.dismiss=Rd;const M_={setup(){return{state:Oo,dismiss:Rd}},template:`
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
  `},Sa=an({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ai=null;function Wt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return ai&&ai(!1),Sa.title=e,Sa.message=t,Sa.confirmLabel=s,Sa.cancelLabel=a,Sa.danger=n,Sa.open=!0,new Promise(i=>{ai=i})}function Xu(e){Sa.open=!1,ai&&(ai(e),ai=null)}const F_={setup(){function e(t){Sa.open&&t.key==="Escape"&&(t.stopPropagation(),Xu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:Sa,settle:Xu}},template:`
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
 */const Vn=typeof document<"u";function Km(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function $_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Km(e.default)}const ut=Object.assign;function Lr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Zs(n)?n.map(e):e(n)}return s}const qi=()=>{},Zs=Array.isArray;function ep(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Jm=/#/g,U_=/&/g,B_=/\//g,H_=/=/g,j_=/\?/g,Zm=/\+/g,z_=/%5B/g,V_=/%5D/g,Ym=/%5E/g,q_=/%60/g,Qm=/%7B/g,G_=/%7C/g,Xm=/%7D/g,W_=/%20/g;function Id(e){return e==null?"":encodeURI(""+e).replace(G_,"|").replace(z_,"[").replace(V_,"]")}function K_(e){return Id(e).replace(Qm,"{").replace(Xm,"}").replace(Ym,"^")}function yc(e){return Id(e).replace(Zm,"%2B").replace(W_,"+").replace(Jm,"%23").replace(U_,"%26").replace(q_,"`").replace(Qm,"{").replace(Xm,"}").replace(Ym,"^")}function J_(e){return yc(e).replace(H_,"%3D")}function Z_(e){return Id(e).replace(Jm,"%23").replace(j_,"%3F")}function Y_(e){return Z_(e).replace(B_,"%2F")}function ul(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Q_=/\/$/,X_=e=>e.replace(Q_,"");function Nr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=aw(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:ul(l)}}function ew(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function tp(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function tw(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&hi(t.matched[a],s.matched[n])&&ev(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function hi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function ev(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!sw(e[s],t[s]))return!1;return!0}function sw(e,t){return Zs(e)?sp(e,t):Zs(t)?sp(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function sp(e,t){return Zs(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function aw(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const Ga={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let xc=(function(e){return e.pop="pop",e.push="push",e})({}),Dr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function nw(e){if(!e)if(Vn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),X_(e)}const iw=/^[^#]+#/;function lw(e,t){return e.replace(iw,"#")+t}function ow(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const lr=()=>({left:window.scrollX,top:window.scrollY});function rw(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=ow(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ap(e,t){return(history.state?history.state.position-t:-1)+e}const _c=new Map;function cw(e,t){_c.set(e,t)}function dw(e){const t=_c.get(e);return _c.delete(e),t}function uw(e){return typeof e=="string"||e&&typeof e=="object"}function tv(e){return typeof e=="string"||typeof e=="symbol"}let Ct=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const sv=Symbol("");Ct.MATCHER_NOT_FOUND+"",Ct.NAVIGATION_GUARD_REDIRECT+"",Ct.NAVIGATION_ABORTED+"",Ct.NAVIGATION_CANCELLED+"",Ct.NAVIGATION_DUPLICATED+"";function mi(e,t){return ut(new Error,{type:e,[sv]:!0},t)}function ya(e,t){return e instanceof Error&&sv in e&&(t==null||!!(e.type&t))}const pw=["params","query","hash"];function fw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of pw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function hw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Zm," "),i=n.indexOf("="),l=ul(i<0?n:n.slice(0,i)),o=i<0?null:ul(n.slice(i+1));if(l in t){let r=t[l];Zs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function np(e){let t="";for(let s in e){const a=e[s];if(s=J_(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Zs(a)?a.map(n=>n&&yc(n)):[a&&yc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function mw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Zs(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const vw=Symbol(""),ip=Symbol(""),or=Symbol(""),Od=Symbol(""),wc=Symbol("");function Ei(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Qa(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(mi(Ct.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):uw(p)?r(mi(Ct.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Pr(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Km(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Qa(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=$_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Qa(p,s,a,l,o,n)()}))}}return i}function gw(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>hi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>hi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let bw=()=>location.protocol+"//"+location.host;function av(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),tp(o,"")}return tp(s,e)+a+n}function yw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=av(e,location),m=s.value,v=t.value;let E=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}E=v?p.position-v.position:0}else a(h);n.forEach(R=>{R(s.value,m,{delta:E,type:xc.pop,direction:E?E>0?Dr.forward:Dr.back:Dr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ut({},p.state,{scroll:lr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function lp(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?lr():null}}function xw(e){const{history:t,location:s}=window,a={value:av(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:bw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ut({},t.state,lp(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ut({},n.value,t.state,{forward:r,scroll:lr()});i(d.current,d,!0),i(r,ut({},lp(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function _w(e){e=nw(e);const t=xw(e),s=yw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ut({location:"",base:e,go:a,createHref:lw.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function ww(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),_w(e)}let vn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ht=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ht||{});const kw={type:vn.Static,value:""},Sw=/[a-zA-Z0-9_]/;function Tw(e){if(!e)return[[]];if(e==="/")return[[kw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Ht.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ht.Static?i.push({type:vn.Static,value:c}):s===Ht.Param||s===Ht.ParamRegExp||s===Ht.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:vn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ht.ParamRegExp){a=s,s=Ht.EscapeNext;continue}switch(s){case Ht.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ht.Param):p();break;case Ht.EscapeNext:p(),s=a;break;case Ht.Param:r==="("?s=Ht.ParamRegExp:Sw.test(r)?p():(u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ht.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ht.ParamRegExpEnd:d+=r;break;case Ht.ParamRegExpEnd:u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ht.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const op="[^/]+?",Cw={sensitive:!1,strict:!1,start:!0,end:!0};var cs=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(cs||{});const Ew=/[.+*?^${}()[\]/\\]/g;function Aw(e,t){const s=ut({},Cw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[cs.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=cs.Segment+(s.sensitive?cs.BonusCaseSensitive:0);if(p.type===vn.Static)u||(n+="/"),n+=p.value.replace(Ew,"\\$&"),h+=cs.Static;else if(p.type===vn.Param){const{value:m,repeatable:v,optional:E,regexp:R}=p;i.push({name:m,repeatable:v,optional:E});const y=R||op;if(y!==op){h+=cs.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=E&&c.length<2?`(?:/${g})`:"/"+g),E&&(g+="?"),n+=g,h+=cs.Dynamic,E&&(h+=cs.BonusOptional),v&&(h+=cs.BonusRepeatable),y===".*"&&(h+=cs.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=cs.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===vn.Static)d+=h.value;else if(h.type===vn.Param){const{value:m,repeatable:v,optional:E}=h,R=m in c?c[m]:"";if(Zs(R)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Zs(R)?R.join("/"):R;if(!y)if(E)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function Rw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===cs.Static+cs.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===cs.Static+cs.Segment?1:-1:0}function nv(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=Rw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(rp(a))return 1;if(rp(n))return-1}return n.length-a.length}function rp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const Iw={strict:!1,end:!0,sensitive:!1};function Ow(e,t,s){const a=Aw(Tw(e.path),s),n=ut(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function Lw(e,t){const s=[],a=new Map;t=ep(Iw,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,v=dp(u);v.aliasOf=h&&h.record;const E=ep(t,u),R=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const x of b)R.push(dp(ut({},v,{components:h?h.record.components:v.components,path:x,aliasOf:h?h.record:v})))}let y,g;for(const b of R){const{path:x}=b;if(p&&x[0]!=="/"){const _=p.record.path,k=_[_.length-1]==="/"?"":"/";b.path=p.record.path+(x&&k+x)}if(y=Ow(b,p,E),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!up(y)&&l(u.name)),iv(y)&&r(y),v.children){const _=v.children;for(let k=0;k<_.length;k++)i(_[k],y,h&&h.children[k])}h=h||y}return g?()=>{l(g)}:qi}function l(u){if(tv(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Pw(u,s);s.splice(p,0,u),u.record.name&&!up(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},v,E;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw mi(Ct.MATCHER_NOT_FOUND,{location:u});E=h.record.name,m=ut(cp(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&cp(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),E=h.record.name);else{if(h=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw mi(Ct.MATCHER_NOT_FOUND,{location:u,currentLocation:p});E=h.record.name,m=ut({},p.params,u.params),v=h.stringify(m)}const R=[];let y=h;for(;y;)R.unshift(y.record),y=y.parent;return{name:E,path:v,params:m,matched:R,meta:Dw(R)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function cp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function dp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Nw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Nw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function up(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Dw(e){return e.reduce((t,s)=>ut(t,s.meta),{})}function Pw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;nv(e,t[i])<0?a=i:s=i+1}const n=Mw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Mw(e){let t=e;for(;t=t.parent;)if(iv(t)&&nv(e,t)===0)return t}function iv({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function pp(e){const t=Us(or),s=Us(Od),a=z(()=>{const r=ca(e.to);return t.resolve(r)}),n=z(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(hi.bind(null,d));if(p>-1)return p;const h=fp(r[c-2]);return c>1&&fp(d)===h&&u[u.length-1].path!==h?u.findIndex(hi.bind(null,r[c-2])):p}),i=z(()=>n.value>-1&&Hw(s.params,a.value.params)),l=z(()=>n.value>-1&&n.value===s.matched.length-1&&ev(s.params,a.value.params));function o(r={}){if(Bw(r)){const c=t[ca(e.replace)?"replace":"push"](ca(e.to)).catch(qi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:z(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Fw(e){return e.length===1?e[0]:e}const $w=yl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:pp,setup(e,{slots:t}){const s=an(pp(e)),{options:a}=Us(or),n=z(()=>({[hp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[hp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Fw(t.default(s));return e.custom?i:oi("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Uw=$w;function Bw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Hw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Zs(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function fp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const hp=(e,t,s)=>e??t??s,jw=yl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Us(wc),n=z(()=>e.route||a.value),i=Us(ip,0),l=z(()=>{let c=ca(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=z(()=>n.value.matched[l.value]);Bi(ip,z(()=>l.value+1)),Bi(vw,o),Bi(wc,n);const r=f();return Ft(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!hi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return mp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,E=oi(p,ut({},m,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return mp(s.default,{Component:E,route:c})||E}}});function mp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const zw=jw;function Vw(e){const t=Lw(e.routes,e),s=e.parseQuery||hw,a=e.stringifyQuery||np,n=e.history,i=Ei(),l=Ei(),o=Ei(),r=Hc(Ga);let c=Ga;Vn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Lr.bind(null,G=>""+G),u=Lr.bind(null,Y_),p=Lr.bind(null,ul);function h(G,ce){let me,ve;return tv(G)?(me=t.getRecordMatcher(G),ve=ce):ve=G,t.addRoute(ve,me)}function m(G){const ce=t.getRecordMatcher(G);ce&&t.removeRoute(ce)}function v(){return t.getRoutes().map(G=>G.record)}function E(G){return!!t.getRecordMatcher(G)}function R(G,ce){if(ce=ut({},ce||r.value),typeof G=="string"){const M=Nr(s,G,ce.path),j=t.resolve({path:M.path},ce),de=n.createHref(M.fullPath);return ut(M,j,{params:p(j.params),hash:ul(M.hash),redirectedFrom:void 0,href:de})}let me;if(G.path!=null)me=ut({},G,{path:Nr(s,G.path,ce.path).path});else{const M=ut({},G.params);for(const j in M)M[j]==null&&delete M[j];me=ut({},G,{params:u(M)}),ce.params=u(ce.params)}const ve=t.resolve(me,ce),be=G.hash||"";ve.params=d(p(ve.params));const $e=ew(a,ut({},G,{hash:K_(be),path:ve.path})),C=n.createHref($e);return ut({fullPath:$e,hash:be,query:a===np?mw(G.query):G.query||{}},ve,{redirectedFrom:void 0,href:C})}function y(G){return typeof G=="string"?Nr(s,G,r.value.path):ut({},G)}function g(G,ce){if(c!==G)return mi(Ct.NAVIGATION_CANCELLED,{from:ce,to:G})}function b(G){return k(G)}function x(G){return b(ut(y(G),{replace:!0}))}function _(G,ce){const me=G.matched[G.matched.length-1];if(me&&me.redirect){const{redirect:ve}=me;let be=typeof ve=="function"?ve(G,ce):ve;return typeof be=="string"&&(be=be.includes("?")||be.includes("#")?be=y(be):{path:be},be.params={}),ut({query:G.query,hash:G.hash,params:be.path!=null?{}:G.params},be)}}function k(G,ce){const me=c=R(G),ve=r.value,be=G.state,$e=G.force,C=G.replace===!0,M=_(me,ve);if(M)return k(ut(y(M),{state:typeof M=="object"?ut({},be,M.state):be,force:$e,replace:C}),ce||me);const j=me;j.redirectedFrom=ce;let de;return!$e&&tw(a,ve,me)&&(de=mi(Ct.NAVIGATION_DUPLICATED,{to:j,from:ve}),U(ve,ve,!0,!1)),(de?Promise.resolve(de):I(j,ve)).catch(F=>ya(F)?ya(F,Ct.NAVIGATION_GUARD_REDIRECT)?F:ie(F):L(F,j,ve)).then(F=>{if(F){if(ya(F,Ct.NAVIGATION_GUARD_REDIRECT))return k(ut({replace:C},y(F.to),{state:typeof F.to=="object"?ut({},be,F.to.state):be,force:$e}),ce||j)}else F=T(j,ve,!0,C,be);return $(j,ve,F),F})}function S(G,ce){const me=g(G,ce);return me?Promise.reject(me):Promise.resolve()}function w(G){const ce=W.values().next().value;return ce&&typeof ce.runWithContext=="function"?ce.runWithContext(G):G()}function I(G,ce){let me;const[ve,be,$e]=gw(G,ce);me=Pr(ve.reverse(),"beforeRouteLeave",G,ce);for(const M of ve)M.leaveGuards.forEach(j=>{me.push(Qa(j,G,ce))});const C=S.bind(null,G,ce);return me.push(C),ue(me).then(()=>{me=[];for(const M of i.list())me.push(Qa(M,G,ce));return me.push(C),ue(me)}).then(()=>{me=Pr(be,"beforeRouteUpdate",G,ce);for(const M of be)M.updateGuards.forEach(j=>{me.push(Qa(j,G,ce))});return me.push(C),ue(me)}).then(()=>{me=[];for(const M of $e)if(M.beforeEnter)if(Zs(M.beforeEnter))for(const j of M.beforeEnter)me.push(Qa(j,G,ce));else me.push(Qa(M.beforeEnter,G,ce));return me.push(C),ue(me)}).then(()=>(G.matched.forEach(M=>M.enterCallbacks={}),me=Pr($e,"beforeRouteEnter",G,ce,w),me.push(C),ue(me))).then(()=>{me=[];for(const M of l.list())me.push(Qa(M,G,ce));return me.push(C),ue(me)}).catch(M=>ya(M,Ct.NAVIGATION_CANCELLED)?M:Promise.reject(M))}function $(G,ce,me){o.list().forEach(ve=>w(()=>ve(G,ce,me)))}function T(G,ce,me,ve,be){const $e=g(G,ce);if($e)return $e;const C=ce===Ga,M=Vn?history.state:{};me&&(ve||C?n.replace(G.fullPath,ut({scroll:C&&M&&M.scroll},be)):n.push(G.fullPath,be)),r.value=G,U(G,ce,me,C),ie()}let P;function q(){P||(P=n.listen((G,ce,me)=>{if(!fe.listening)return;const ve=R(G),be=_(ve,fe.currentRoute.value);if(be){k(ut(be,{replace:!0,force:!0}),ve).catch(qi);return}c=ve;const $e=r.value;Vn&&cw(ap($e.fullPath,me.delta),lr()),I(ve,$e).catch(C=>ya(C,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_CANCELLED)?C:ya(C,Ct.NAVIGATION_GUARD_REDIRECT)?(k(ut(y(C.to),{force:!0}),ve).then(M=>{ya(M,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&!me.delta&&me.type===xc.pop&&n.go(-1,!1)}).catch(qi),Promise.reject()):(me.delta&&n.go(-me.delta,!1),L(C,ve,$e))).then(C=>{C=C||T(ve,$e,!1),C&&(me.delta&&!ya(C,Ct.NAVIGATION_CANCELLED)?n.go(-me.delta,!1):me.type===xc.pop&&ya(C,Ct.NAVIGATION_ABORTED|Ct.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),$(ve,$e,C)}).catch(qi)}))}let K=Ei(),D=Ei(),O;function L(G,ce,me){ie(G);const ve=D.list();return ve.length?ve.forEach(be=>be(G,ce,me)):console.error(G),Promise.reject(G)}function te(){return O&&r.value!==Ga?Promise.resolve():new Promise((G,ce)=>{K.add([G,ce])})}function ie(G){return O||(O=!G,q(),K.list().forEach(([ce,me])=>G?me(G):ce()),K.reset()),G}function U(G,ce,me,ve){const{scrollBehavior:be}=e;if(!Vn||!be)return Promise.resolve();const $e=!me&&dw(ap(G.fullPath,0))||(ve||!me)&&history.state&&history.state.scroll||null;return It().then(()=>be(G,ce,$e)).then(C=>C&&rw(C)).catch(C=>L(C,G,ce))}const Q=G=>n.go(G);let oe;const W=new Set,fe={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:v,resolve:R,options:e,push:b,replace:x,go:Q,back:()=>Q(-1),forward:()=>Q(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:D.add,isReady:te,install(G){G.component("RouterLink",Uw),G.component("RouterView",zw),G.config.globalProperties.$router=fe,Object.defineProperty(G.config.globalProperties,"$route",{enumerable:!0,get:()=>ca(r)}),Vn&&!oe&&r.value===Ga&&(oe=!0,b(n.location).catch(ve=>{}));const ce={};for(const ve in Ga)Object.defineProperty(ce,ve,{get:()=>r.value[ve],enumerable:!0});G.provide(or,fe),G.provide(Od,Bc(ce)),G.provide(wc,r);const me=G.unmount;W.add(G),G.unmount=function(){W.delete(G),W.size<1&&(c=Ga,P&&P(),P=null,r.value=Ga,oe=!1,O=!1),me()}}};function ue(G){return G.reduce((ce,me)=>ce.then(()=>w(me)),Promise.resolve())}return fe}function lv(){return Us(or)}function qw(e){return Us(Od)}const rr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=qw(),s=lv(),a=z({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=z(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=z(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Ft(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},pl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),pa=e=>Number.isSafeInteger(e)&&e>=0,Gw=e=>e===null||typeof e=="string",Lo=(e,t)=>pa(e)&&pa(t)&&t>=e,Ld=e=>pl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Gw(e.cursor);function Ww(e){return!Ld(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&pl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!pa(e.total_chars)||!pa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Lo(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&pl(e.tail)&&typeof e.tail.text=="string"&&Lo(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function vp(e){return Ld(e)&&e.kind==="process_output"&&pa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>pa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Lo(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Kw(e){return Ld(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>pa(e[t]))&&Lo(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&pa(e.tools_omitted)}function kc(e){try{return JSON.parse(e)}catch{return}}const Sc=e=>JSON.stringify(e,null,2),Jw=e=>{const t=kc(e);return t===void 0?e:Sc(t)},jl=(e,t,s)=>`[${e}, ${t}) ${s}`;function ov(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:Sc(e)??"";let a=typeof e=="string"?kc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=kc(e.slice(d+c.length)),h=e.slice(0,u);vp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Jw(d):d});if(pl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||pa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...pa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],pl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(Ww(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${jl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${jl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(vp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>jl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(Kw(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${jl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?Sc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function rv(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Mr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Zw=e=>e!==null&&typeof e=="object",Yw=new Set(["_hmac","_prev_hmac"]),Tc=e=>e.replace(/\r\n?/g,`
`);function fl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(Yw.has(n)){s=!0;return}return i});return Tc(s?JSON.stringify(a):t)}catch{return Tc(t)}}function Qw(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&Zw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Xw(e){var h;const t=ov(typeof e=="string"?Tc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:fl(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Mr.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=rv(c,Mr.previewLines,Mr.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:Qw(t)}}const ek={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=z(()=>Xw(e.value)),c=z(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=z(()=>a.value?c.value:r.value.formatted),u=z(()=>r.value.promoted&&r.value.preview.folded||o.value),p=z(()=>t.value?!!d.value:r.value.promoted),h=z(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function E(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function R(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Ft([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,x)=>{(e.recordId===null||b[2]!==x[2])&&(t.value=!1,a.value=!1),n.value=""}),Ft([i,l,t,s,r],()=>It(E),{flush:"post"}),Ge(()=>{m=new ResizeObserver(v),E()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:R,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},cr={name:"ToolOutput",components:{CompactOutput:ek},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=z(()=>ov(e.value)),l=z(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=z(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=rv(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=z(()=>o.value.some(u=>u.folded)),c=z(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
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
  `},tk={components:{ToolOutput:cr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var v,E,R,y,g,b,x,_,k,S,w;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(E=h.metadata)!=null&&E.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const I=h.call_id||((R=h.metadata)==null?void 0:R.call_id)||null,$=h.agent_id||((y=h.metadata)==null?void 0:y.agent_id)||"",T={callId:I,agentId:$,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:I?`${$}:${I}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(m==="tool_end"||m==="loop_tool"){const I=h.call_id||((x=h.metadata)==null?void 0:x.call_id)||null,$=h.agent_id||((_=h.metadata)==null?void 0:_.agent_id)||"";let T=-1;if(I&&(T=e.value.findIndex(P=>P.callId===I&&P.agentId===$&&P.status==="running")),T<0&&!I)for(let P=e.value.length-1;P>=0;P--){const q=e.value[P];if(q.tool===h.action&&q.agentId===$&&q.status==="running"){T=P;break}}if(T>=0){const P=e.value[T];P.status=h.error||(k=h.metadata)!=null&&k.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((S=h.metadata)==null?void 0:S.status))?"error":"success",P.elapsed=h.execution_time_ms??h.duration_ms??((w=h.metadata)==null?void 0:w.elapsed_ms)??Date.now()-P.startTime,P.result=h.result_summary??h.detail??"",P.fadingOut=!0,setTimeout(()=>{const q=e.value.indexOf(P);q>=0&&e.value.splice(q,1),t.value.unshift(P),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const I=h.call_id||h.tool_name||"unknown";if(h.finished){const $={...s.value};delete $[I],s.value=$}else{const T=((s.value[I]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[I]:T.slice(-30).join(`
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
  `};function Nd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function In(e){const t=Nd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function sk(e){const t=Nd(e);return t?t.toLocaleTimeString():"—"}function cv(e){const t=Nd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function ak(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function vi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Dd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function dv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function gp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Pd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function uv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const pv=Symbol("agent-detail-cancelled"),nk=15e3;function ik(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,pv),i==null||i.abort()}}}function fv({state:e,requestDetail:t,timeoutMs:s=nk,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=ik(R=>t(p,{signal:R}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return v.cancel=E.cancel,v.promise=(async()=>{let R=null,y=null;try{R=await E.promise}catch(g){y=g}R!==pv&&(l!==v||e.detailId!==p||(l=null,!y&&(R===null||typeof R!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=R,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function lk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const ok={components:{ToolOutput:cr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=z(()=>e.value.filter(L=>L.status==="running").length),r=z(()=>e.value.filter(L=>L.status==="completed").length),c=z(()=>e.value.filter(L=>["failed","timeout","killed"].includes(L.status)).length),d=z(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=z(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(L=>["failed","timeout","killed"].includes(L.status)):e.value.filter(L=>L.status===i.value));function p(L){const te=Number(L.max_iterations)||0;return te<=0?0:Math.min(100,Math.round(L.iteration_count/te*100))}function h(L){return(Number(L.max_iterations)||0)>0}function m(L,te){return L?L==="N/A"?"N/A":te==="current_inheritance"?`inherit (currently ${L})`:L:"unknown"}function v(L){return m(L.display_model,L.display_model_source||L.display_source)}function E(L){return m(L.display_reasoning_effort,L.display_reasoning_effort_source||L.display_source)}function R(L){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[L]||""}const y=f(null),g=f(null),b=f(!1),x=f(null),_=f(""),S=fv({state:{get detail(){return y.value},set detail(L){y.value=L},get detailId(){return g.value},set detailId(L){g.value=L},get detailLoading(){return b.value},set detailLoading(L){b.value=L},get detailError(){return x.value},set detailError(L){x.value=L}},requestDetail:(L,{signal:te})=>H.get(`/api/agents/${encodeURIComponent(L)}`,{signal:te})});async function w(L){_.value="",await S.open(L.id)}function I(){S.close(),_.value=""}async function $(){await S.refresh()}async function T(L,te){try{await navigator.clipboard.writeText(te||""),_.value=L,setTimeout(()=>{_.value===L&&(_.value="")},1500)}catch{_e.error("Copy failed")}}async function P(L=!1){L=L===!0,L||(t.value=!0);try{const te=await H.get("/api/agents");e.value=Array.isArray(te)?te:[],s.value=null}catch(te){L||(s.value=te.message)}L||(t.value=!1)}async function q(L){const te=e.value.find(U=>U.id===L);if(await Wt({title:"Kill agent",message:`Kill agent "${(te==null?void 0:te.label)||L}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=L;try{await H.del(`/api/agents/${encodeURIComponent(L)}`),_e.success("Agent killed"),await P()}catch(U){_e.error(U.message||"Failed to kill agent")}a.value=null}}const K=lk({isEnabled:()=>n.value&&l,refreshList:()=>P(!0),hasOpenDetail:()=>!!g.value,refreshDetail:$});function D(){K.start()}function O(){K.stop()}return Ft(n,()=>K.sync()),Ge(()=>{l=!0,P(),D()}),Xt(()=>{l=!0,P(!0),D()}),Vt(()=>{l=!1,O()}),ft(()=>{l=!1,O(),S.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:In,formatDuration:vi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:E,displaySourceLabel:R,detail:y,detailId:g,detailLoading:b,detailError:x,copied:_,openDetail:w,closeDetail:I,copyText:T,fetchAgents:P,killAgent:q,startAutoRefresh:D,stopAutoRefresh:O}}},rk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const E=fv({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return p.value},set detailError(O){p.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:L})=>H.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:L})});async function R(O){h.value="",await E.open(O.id)}function y(){E.close(),h.value=""}async function g(O,L){try{await navigator.clipboard.writeText(L||""),h.value=O,setTimeout(()=>{h.value===O&&(h.value="")},1500)}catch{_e.error("Copy failed")}}const b=z(()=>e.value.reduce((O,L)=>O+(L.iteration_count||0),0)),x=z(()=>e.value.filter(O=>O.status==="running").length);function _(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function k(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function S(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function w(O=!1){O=O===!0,O||(t.value=!0);try{const L=await H.get("/api/loops");e.value=Array.isArray(L)?L:[],s.value=null}catch(L){O||(s.value=L.message)}O||(t.value=!1)}async function I(){l.value=null;const O=n.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const L={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(L.stop_condition=O.stop_condition.trim()),i.value=!0;try{const te=await H.post("/api/loops",L);_e.success(`Loop started: ${te.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await w()}catch(te){l.value=te.message}i.value=!1}async function $(O){if(await Wt({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=O;try{await H.del(`/api/loops/${encodeURIComponent(O)}`),_e.success("Loop stopped"),await w()}catch(te){_e.error(te.message||"Failed to stop loop")}o.value=null}}async function T(O){r.value=O;try{await H.post(`/api/loops/${encodeURIComponent(O)}/restart`),_e.success("Loop restarted"),await w()}catch(L){_e.error(L.message||"Failed to restart loop")}r.value=null}function P(O){m&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(w(!0),d.value&&E.refresh())}let q=null;function K(){q!==null&&clearInterval(q),q=null}function D(){K(),m&&(q=setInterval(()=>{w(!0),d.value&&E.refresh()},5e3))}return Ge(()=>{m=!0,w(),st.subscribe("events",P),D()}),Xt(()=>{m=!0,w(!0),D()}),Vt(()=>{m=!1,K()}),ft(()=>{m=!1,st.unsubscribe("events",P),K(),E.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:x,statusDotClass:_,statusBadge:k,modeBadge:S,formatAge:cv,formatDuration:vi,formatTs:In,formatTokens:uv,openDetail:R,closeDetail:y,copyText:g,fetchLoops:w,doCreate:I,doStop:$,doRestart:T}}},ck={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=z(()=>e.value.filter(y=>y.status==="running").length),o=z(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await H.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Ft(a,y=>{y?u():p()});async function h(y){if(await Wt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await H.del(`/api/processes/${y}`),_e.success(`Process ${y} killed`),await d()}catch(b){_e.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function E(){v||(v=!0,d(),st.subscribe("events",m),u())}function R(){v&&(v=!1,st.unsubscribe("events",m),p())}return Ge(E),Xt(E),Vt(R),ft(R),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:vi,fetchProcesses:d,doKill:h}}},dk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function bp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function uk(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function pk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function fk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=dk.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const E of new Set([p,h])){const R=new Date(u+E*6e4);uk(R,c)===d&&(m.some(y=>y.getTime()===R.getTime())||m.push(R))}if(m.sort((E,R)=>E.getTime()-R.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(E=>({instant:E,offset:pk(E),iso:E.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const hk=5e3;function so(e){const t=(e==null?void 0:e.available)===!0,s=typeof(e==null?void 0:e.reason)=="string"?e.reason:"provider_error";return{available:t,reason:s,epoch:Number.isInteger(e==null?void 0:e.epoch)?e.epoch:null}}function zl(e){if(e.available)return"";switch(e.reason){case"unavailable":return"Scheduling is not configured.";case"connecting":return"Scheduling is connecting.";case"disconnected":return"Scheduling is disconnected.";case"provider_error":return"Scheduling status provider failed.";default:return"Scheduling is unavailable."}}function yp(e){var t;return(e==null?void 0:e.status)!==503||!((t=e==null?void 0:e.data)!=null&&t.connection)?null:so(e.data.connection)}function mk(e){return e!=="webhook"}function xp(e,t){return!mk(t)||(e==null?void 0:e.available)===!0}const vk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(so(null)),n=z(()=>a.value.available),i=z(()=>zl(a.value));let l=null;const o=f(!1),r=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""}),c=f(!1),d=f(null),u=z(()=>xp(a.value,r.value.action));function p(F){return xp(a.value,F)}const h=f(null),m=z(()=>fk(r.value.run_at));Ft(()=>r.value.run_at,()=>{h.value=null});const v=z(()=>{var Z;const F=m.value;return F.state==="ok"?F.instant:F.state==="ambiguous"&&h.value!==null&&((Z=F.options[h.value])==null?void 0:Z.instant)||null}),E=z(()=>{const F=v.value;return F?`${F.toLocaleString()} local — ${F.toISOString()} UTC`:""}),R=f(null),y=f(!1),g=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],b=f(null),x=f(null),_=f(null),k=f(null),S=f(null),w=f(null),I=f([]),$=f(!1),T=f("");let P=0;const q=z(()=>e.value.filter(F=>F.cron&&!F.one_time).length),K=z(()=>e.value.filter(F=>F.one_time).length),D=z(()=>e.value.filter(F=>F.trigger).length),O=z(()=>e.value.filter(F=>F.paused).length),L=z(()=>e.value.filter(F=>F.consecutive_failures>0).length);function te(F){if(!F)return"-";const Z=Date.now(),B=(new Date(F).getTime()-Z)/1e3;if(B<0)return"overdue";if(B<60)return"in < 1 min";if(B<3600)return`in ${Math.floor(B/60)} min`;if(B<86400){const ee=Math.floor(B/3600),pe=Math.floor(B%3600/60);return pe>0?`in ${ee}h ${pe}m`:`in ${ee}h`}const Y=Math.floor(B/86400);return`in ${Y} day${Y!==1?"s":""}`}function ie(F){return F==null?"-":F<1e3?`${F}ms`:F<6e4?`${(F/1e3).toFixed(1)}s`:vi(F/1e3)}function U(F=r.value.cron){r.value.cron=F,bp(r.value,"cron"),R.value=null}function Q(F=r.value.run_at){r.value.run_at=F,bp(r.value,"run_at"),R.value=null}async function oe(){const F=r.value.cron.trim();if(F){y.value=!0;try{R.value=await H.post("/api/schedules/validate-cron",{expression:F})}catch(Z){R.value={valid:!1,error:Z.message}}y.value=!1}}async function W(){t.value=!0,s.value=null;try{e.value=await H.get("/api/schedules")}catch(F){s.value=F.message}t.value=!1}async function fe(){try{a.value=so(await H.get("/api/schedules/status"))}catch(F){a.value=yp(F)||so(null)}}function ue(F){const Z=yp(F);Z&&(a.value=Z)}async function G(F){if(w.value===F){w.value=null,I.value=[];return}w.value=F,$.value=!0,I.value=[];const Z=++P;try{const re=await H.get(`/api/schedules/${encodeURIComponent(F)}/history?limit=10`);if(Z!==P||w.value!==F)return;I.value=re,T.value=""}catch(re){if(Z!==P||w.value!==F)return;I.value=[],T.value=re.message||"Failed to load execution history"}Z===P&&($.value=!1)}async function ce(){if(d.value=null,!p(r.value.action)){d.value=zl(a.value);return}const F=r.value;if(!F.description.trim()){d.value="Description is required";return}if(F.action!=="webhook"&&!F.channel_id.trim()){d.value="Channel ID is required";return}if(!F.cron.trim()&&!F.run_at.trim()){d.value="Cron expression or run_at time is required";return}if(F.cron.trim()&&F.run_at.trim()){d.value="Choose either Cron or One-Time, not both";return}const Z={description:F.description.trim(),action:F.action,channel_id:F.channel_id.trim()};if(F.cron.trim()&&(Z.cron=F.cron.trim()),F.run_at.trim()){const re=m.value;if(re.state==="nonexistent"){d.value="That local time does not exist (daylight saving gap)";return}if(re.state==="invalid"){d.value="One-time run time is not a valid date";return}const B=v.value;if(re.state==="ambiguous"&&h.value===null){d.value="That local time happens twice — choose which occurrence to use";return}if(!B){d.value="One-time run time could not be resolved";return}Z.run_at=B.toISOString()}if(F.action==="reminder"&&F.message.trim()&&(Z.message=F.message.trim()),F.action==="check"&&(F.tool_name.trim()&&(Z.tool_name=F.tool_name.trim()),F.report_format&&(Z.report_format=F.report_format),F.tool_input_str.trim()))try{Z.tool_input=JSON.parse(F.tool_input_str.trim())}catch{d.value="Tool input must be valid JSON";return}if(F.action==="webhook"){if(!F.webhook_url.trim()){d.value="Webhook URL is required";return}const re={url:F.webhook_url.trim(),method:F.webhook_method};if(F.webhook_headers_str.trim())try{const B=JSON.parse(F.webhook_headers_str.trim());if(!B||Array.isArray(B)||typeof B!="object")throw new Error("not an object");re.headers=B}catch{d.value="Webhook headers must be a valid JSON object";return}if(F.webhook_body&&(re.body=F.webhook_body),F.webhook_expected_status_str.trim()){const B=F.webhook_expected_status_str.split(",").map(Y=>Number(Y.trim()));if(B.some(Y=>!Number.isInteger(Y)||Y<100||Y>599)){d.value="Expected status codes must be comma-separated HTTP codes";return}re.expected_status_codes=B}Z.webhook_config=re}c.value=!0;try{await H.post("/api/schedules",Z),_e.success("Schedule created"),r.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:"",webhook_url:"",webhook_method:"POST",webhook_headers_str:"",webhook_body:"",webhook_expected_status_str:""},R.value=null,o.value=!1,await W()}catch(re){ue(re),d.value=re.message}c.value=!1}async function me(F){if(!p(F.action)){_e.error(zl(a.value));return}const Z=F.id;b.value=Z;try{const re=await H.post(`/api/schedules/${encodeURIComponent(Z)}/run`);if(re.status==="failure")_e.error(`Execution failed: ${re.error||"unknown error"}`);else{const B=re.warning?`Executed (${re.warning})`:"Executed successfully";_e.success(B)}await W()}catch(re){ue(re),_e.error(re.message||"Failed to trigger")}b.value=null}async function ve(F){if(F.paused&&!p(F.action)){_e.error(zl(a.value));return}_.value=F.id;const Z=!F.paused;try{await H.put(`/api/schedules/${encodeURIComponent(F.id)}`,{paused:Z}),_e.success(Z?"Schedule paused":"Schedule resumed"),await W()}catch(re){ue(re),_e.error(re.message||"Failed to update schedule")}_.value=null}const be=new Map;function $e(F,Z){const re=be.get(F.id);re&&clearTimeout(re.timer);const B={run:()=>C(F,Z),timer:null};B.timer=setTimeout(()=>{be.delete(F.id),B.run()},500),be.set(F.id,B)}async function C(F,Z){S.value=F.id;try{await H.put(`/api/schedules/${encodeURIComponent(F.id)}`,{report_format:Z}),_e.success(Z?"Structured report enabled":"Plain-text report enabled")}catch(re){_e.error(`Update failed: ${re.message}`)}finally{await W(),S.value=null}}function M(){for(const[F,Z]of[...be])clearTimeout(Z.timer),be.delete(F),Z.run()}async function j(F){k.value=F;try{await H.post(`/api/schedules/${encodeURIComponent(F)}/reset-failures`),_e.success("Failure counters reset"),await W()}catch(Z){_e.error(Z.message||"Failed to reset")}k.value=null}async function de(F){const Z=e.value.find(B=>B.id===F);if(await Wt({title:"Delete schedule",message:`Delete "${(Z==null?void 0:Z.description)||F}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){x.value=F;try{await H.del(`/api/schedules/${encodeURIComponent(F)}`),_e.success("Schedule deleted"),await W()}catch(B){_e.error(B.message||"Failed to delete schedule")}x.value=null}}return Ge(()=>{W(),fe(),l=setInterval(fe,hk)}),ft(()=>{M(),l&&clearInterval(l)}),{schedules:e,loading:t,error:s,schedulingAvailable:n,schedulingAvailabilityMessage:i,selectedActionAvailable:u,actionAvailable:p,showCreate:o,form:r,creating:c,createError:d,runAtUtcPreview:E,runAtAnalysis:m,runAtOccurrence:h,cronResult:R,validatingCron:y,cronPresets:g,runningId:b,deletingId:x,togglingId:_,resettingId:k,reportUpdatingId:S,flushReportFormatTimers:M,expandedId:w,history:I,historyLoading:$,historyError:T,cronCount:q,oneTimeCount:K,webhookCount:D,pausedCount:O,failingCount:L,formatTs:In,formatAge:cv,formatFuture:te,formatMs:ie,formatDuration:vi,onCronInput:U,onRunAtInput:Q,validateCron:oe,toggleExpand:G,fetchSchedules:W,fetchSchedulingAvailability:fe,doCreate:ce,doRunNow:me,doTogglePause:ve,doUpdateReportFormat:$e,doResetFailures:j,doDelete:de}}},hv=[{id:"live",label:"Live",component:tk},{id:"agents",label:"Agents",component:ok},{id:"loops",label:"Loops",component:rk},{id:"processes",label:"Processes",component:ck},{id:"schedules",label:"Schedules",component:vk}],gk={components:{TabbedPage:rr},setup(){return{tabs:hv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await H.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const v=new URLSearchParams;n.value.tool&&v.set("tool",n.value.tool),n.value.user&&v.set("user",n.value.user),n.value.keyword&&v.set("q",n.value.keyword),n.value.date&&v.set("date",n.value.date),v.set("limit",String(n.value.limit));const E=v.toString(),R=await H.get(`/api/audit${E?"?"+E:""}`);if(m!==r)return;e.value=Array.isArray(R)?R:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:In,formatDetail:i,truncateBlock:dv,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},_p=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],yk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],xk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=_p,E=yk,R=f([]),y=f(!1),g=f(""),b=f("flat"),x=f(new Set),_=f(""),k=f(""),S=f(""),w=f(null),I=f(!1),$=f(""),T=f(!1);let P=0;Ft([_,k,S],()=>{P++,I.value=!1,$.value="",T.value=w.value!==null},{flush:"sync"});function q(){try{const se=localStorage.getItem("odin-session-presets");se&&(R.value=JSON.parse(se))}catch{}}function K(){try{localStorage.setItem("odin-session-presets",JSON.stringify(R.value))}catch{}}const D=z(()=>p.value.trim()!==""||u.value!=="all"),O=z(()=>{let se=[...e.value];const Ee=_p.find(We=>We.id===u.value),Ne=Ee?Ee.filters:{};if(Ne.source&&(se=se.filter(We=>We.source===Ne.source)),Ne.minMessages&&(se=se.filter(We=>We.message_count>=Ne.minMessages)),Ne.hasCompaction&&(se=se.filter(We=>We.has_summary)),Ne.maxAge!=null){const We=Date.now()/1e3;se=se.filter(Ut=>Ut.last_active&&We-Ut.last_active<=Ne.maxAge)}if(p.value.trim()){const We=p.value.toLowerCase().trim();se=se.filter(Ut=>(Ut.channel_id||"").toLowerCase().includes(We)||(Ut.last_user_id||"").toLowerCase().includes(We)||(Ut.source||"").toLowerCase().includes(We))}const Je=h.value,Lt=m.value?1:-1;return se.sort((We,Ut)=>{const Bt=We[Je]||0,hs=Ut[Je]||0;return(Bt-hs)*Lt}),se}),L=z(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Ee=[];let Ne=[];for(const Je of se)Je.role==="user"&&Ne.length>0&&(Ee.push(Ne),Ne=[]),Ne.push(Je);return Ne.length>0&&Ee.push(Ne),Ee}),te=z(()=>O.value.length>0&&c.value.size===O.value.length);function ie(se){const Ee=se.find(Ne=>Ne.role==="user");if(Ee&&Ee.content){const Ne=Ee.content.slice(0,120);return Ne.length<Ee.content.length?Ne+"...":Ne}return"(no user message)"}function U(se){const Ee=new Set(x.value);Ee.has(se)?Ee.delete(se):Ee.add(se),x.value=Ee}function Q(se){u.value=se}function oe(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function W(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};R.value=[...R.value,se],K(),y.value=!1,g.value=""}function fe(se){R.value=R.value.filter(Ee=>Ee.id!==se),K(),u.value===se&&(u.value="all")}function ue(){u.value="all",p.value="",h.value="last_active",m.value=!1}function G(se){if(!se)return"—";const Ee=Date.now()/1e3-se;if(Ee<60)return"just now";if(Ee<3600){const Je=Math.floor(Ee/60);return`${Je} minute${Je!==1?"s":""} ago`}if(Ee<86400){const Je=Math.floor(Ee/3600);return`${Je} hour${Je!==1?"s":""} ago`}const Ne=Math.floor(Ee/86400);return`${Ne} day${Ne!==1?"s":""} ago`}function ce(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function me(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function ve(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function be(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function $e(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function C(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function M(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function j(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function de(){const se=_.value.trim();if(!se)return;const Ee=++P;I.value=!0,$.value="",T.value=w.value!==null;try{let Ne=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;k.value.trim()&&(Ne+=`&channel_id=${encodeURIComponent(k.value.trim())}`),S.value.trim()&&(Ne+=`&user_id=${encodeURIComponent(S.value.trim())}`);const Je=await H.get(Ne);if(Ee!==P)return;w.value=Je.results||[],T.value=!1}catch(Ne){if(Ee!==P)return;$.value=Ne.message||"Search failed. Please retry."}finally{Ee===P&&(I.value=!1)}}function F(){P++,_.value="",k.value="",S.value="",w.value=null,$.value="",T.value=!1,I.value=!1}function Z(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function re(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function B(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let Y=0;async function ee(){const se=++Y;t.value=!0,s.value=null;try{const Ee=await H.get("/api/sessions");if(se!==Y)return;e.value=Ee}catch(Ee){if(se!==Y)return;s.value=Ee.message}se===Y&&(t.value=!1)}function pe(){s.value=null,ee()}async function he(se){if(a.value===se){a.value=null,n.value=null,x.value=new Set;return}a.value=se,n.value=null,i.value=!0,x.value=new Set;const Ee=++l;try{const Ne=await H.get(`/api/sessions/${encodeURIComponent(se)}`);Ee===l&&a.value===se&&(n.value=Ne)}catch(Ne){Ee===l&&a.value===se&&(n.value={messages:[],summary:"",error:Ne.message||"Failed to load session"})}finally{Ee===l&&(i.value=!1)}}function xe(se){const Ee=new Set(c.value);Ee.has(se)?Ee.delete(se):Ee.add(se),c.value=Ee}function Oe(){te.value?c.value=new Set:c.value=new Set(O.value.map(se=>se.channel_id))}function ge(se){o.value=se}async function He(){if(o.value){r.value=!0;try{await H.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await ee()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function Ue(){d.value=!0}async function je(){if(c.value.size!==0){r.value=!0;try{await H.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await ee()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Qe(se,Ee){const Ne=`/api/sessions/${encodeURIComponent(se)}/export?format=${Ee}`;try{const Je=await H.getBlob(Ne),Lt=URL.createObjectURL(Je),We=document.createElement("a");We.href=Lt,We.download=`session-${se}.${Ee==="text"?"txt":"json"}`,We.click(),URL.revokeObjectURL(Lt)}catch(Je){s.value=Je.message||"Failed to export session"}}let ot=null;function nt(se){se.payload&&se.payload.channel_id&&(clearTimeout(ot),ot=setTimeout(()=>{if(ee(),a.value&&se.payload.channel_id===a.value){const Ee=a.value,Ne=l;H.get(`/api/sessions/${encodeURIComponent(Ee)}`).then(Je=>{Ne!==l||a.value!==Ee||(n.value=Je)}).catch(()=>{})}},2e3))}let X=!1,we=null;function Ae(){X||(X=!0,ee(),st.subscribe("events",nt),we=st.onReconnected(()=>ee()))}Ge(()=>{q(),Ae()}),Xt(()=>{Ae()});function Le(){X&&(X=!1,st.unsubscribe("events",nt),we&&(we(),we=null),clearTimeout(ot))}return Vt(Le),ft(Le),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:te,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:E,filteredSessions:O,hasActiveFilters:D,customPresets:R,showSavePreset:y,newPresetName:g,threadView:b,threads:L,collapsedThreads:x,ftsQuery:_,ftsChannelId:k,ftsUserId:S,ftsResults:w,ftsSearching:I,ftsError:$,ftsStale:T,formatAge:G,formatTimestamp:ce,formatFullTimestamp:me,messageClass:ve,threadMsgClass:be,roleBadge:$e,roleDotClass:C,roleLabelClass:M,truncateContent:j,threadSummary:ie,fetchSessions:ee,retry:pe,toggleSession:he,toggleSelect:xe,toggleSelectAll:Oe,confirmClear:ge,clearSession:He,confirmBulkClear:Ue,doBulkClear:je,exportSession:Qe,applyPreset:Q,applyCustomPreset:oe,saveCustomPreset:W,removeCustomPreset:fe,resetFilters:ue,toggleThread:U,runFtsSearch:de,clearFtsSearch:F,highlightSnippet:Z,ftsResultClass:re,ftsTypeBadge:B}}},_k={props:["trace"],template:`
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
  `,setup(){return{formatTokens:uv}}},wk={components:{ContextAssemblyPanel:_k},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(k){if(!k)return"—";try{const S=new Date(k);return isNaN(S.getTime())?k:S.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function p(k){return!k&&k!==0?"—":k<1e3?k+"ms":(k/1e3).toFixed(1)+"s"}function h(k){return!k&&k!==0?"—":k>=1e3?(k/1e3).toFixed(1)+"k":String(k)}function m(k){if(!k)return"";if(typeof k=="string")return k;try{return JSON.stringify(k,null,2)}catch{return String(k)}}function v(k){n.value===k?n.value=null:(n.value=k,c.value={})}function E(k,S){const w=k+"-"+S;c.value={...c.value,[w]:!c.value[w]}}function R(k,S){return!!c.value[k+"-"+S]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,x()}async function g(){try{const k=await H.get("/api/trajectories");e.value=k.files||[],r.value=k.count||0}catch{}}let b=0;async function x(){const k=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const S=await H.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(k!==b)return;let w=S.entries||[];d.value.tool_name&&(w=w.filter(I=>(I.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(I=>I.is_error)),d.value.channel_id&&(w=w.filter(I=>I.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(I=>I.user_id===d.value.user_id)),t.value=w}else{const S=new URLSearchParams;d.value.channel_id&&S.set("channel_id",d.value.channel_id),d.value.user_id&&S.set("user_id",d.value.user_id),d.value.tool_name&&S.set("tool_name",d.value.tool_name),d.value.errors_only&&S.set("errors_only","true"),S.set("limit",String(d.value.limit));const w=S.toString(),I=await H.get(`/api/trajectories/search/query?${w}`);if(k!==b)return;t.value=I.results||[]}}catch(S){if(k!==b)return;a.value=S.message}k===b&&(s.value=!1)}async function _(){if(!l.value.trim())return;const k=++b;s.value=!0,a.value=null,c.value={};try{const S=await H.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(k!==b)return;i.value=S.entry||null,i.value||(a.value="No trace found for this message ID")}catch(S){if(k!==b)return;S.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=S.message}k===b&&(s.value=!1)}return Ge(async()=>{await g(),await x()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:dv,toggleExpand:v,toggleIteration:E,isIterationExpanded:R,clearFilters:y,fetchFiles:g,fetchTraces:x,lookupMessage:_}}};function kk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function Sk(e){return e?`${e.approximate?"~":""}${Pd(e.total||0)}`:"0"}const Tk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=z(()=>a.value.work||{}),h=z(()=>Math.max(1,...(a.value.activity_over_time||[]).map(_=>Number(_.count||0)))),m=z(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),v=_=>({height:`${Math.max(4,Math.round(Number(_||0)/h.value*100))}%`}),E=z(()=>s.value&&l.value-i.value>3e4);async function R(){const _=++d,k=n.value;try{const S=await H.get(`/api/usage?range=${encodeURIComponent(k)}`);if(_!==d||k!==n.value)return;a.value=S,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(S){_===d&&(t.value=S.message)}finally{_===d&&(e.value=!1)}}function y(_){n.value=_,e.value=!s.value,R()}function g(){e.value=!0,R()}function b(){c||(c=!0,R(),o=setInterval(R,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function x(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),Xt(b),Vt(x),ft(x),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:E,fmtNum:Pd,fmtDuration:kk,tokenLabel:Sk,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},mv=[{id:"audit",label:"Audit",component:bk},{id:"sessions",label:"Sessions",component:xk},{id:"traces",label:"Traces",component:wk},{id:"usage",label:"Usage & Activity",component:Tk}],Ck={components:{TabbedPage:rr},setup(){return{tabs:mv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Fr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Ek={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(w){return w.source!=="builtin"?"":u[w.state]||""}function h(w,I){const $=w&&Array.isArray(w.tools)?w.tools:null;if(c.value=!!$,r.value=$?!!w.global_enabled:null,!$){e.value=I.map(q=>({...q,source:"unknown",enabled:void 0,state:null}));return}const T=new Set($.map(q=>q.name)),P=I.filter(q=>!T.has(q.name)).map(q=>({...q,source:q.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...$.map(q=>({...q,source:"builtin"})),...P]}async function m(w,I){if(d.value.has(w.name))return;const $=!!I.target.checked,T=new Set(d.value);T.add(w.name),d.value=T;try{const P=await H.post(`/api/tools/builtins/${encodeURIComponent(w.name)}/enabled`,{enabled:$});h(P,e.value),s.value=null;try{const q=await H.get("/api/tools");h(P,q)}catch(q){console.warn("Built-in toggle committed; visible catalog refresh failed",q)}}catch(P){I.target.checked=!!w.enabled,s.value=P.message||`Failed to toggle ${w.name}`}finally{const P=new Set(d.value);P.delete(w.name),d.value=P}}const v=z(()=>e.value.filter(w=>w.source==="builtin"&&w.is_core).length),E=z(()=>e.value.filter(w=>w.source==="skill").length),R=z(()=>Object.values(n.value).reduce((w,I)=>w+I,0));function y(w){for(const I of Fr)if(I.id!=="other"&&I.match(w))return I.id;return"other"}const g=z(()=>{let w=e.value;if(a.value){const I=a.value.toLowerCase();w=w.filter($=>$.name.toLowerCase().includes(I)||($.description||"").toLowerCase().includes(I))}return o.value&&(w=w.filter(I=>y(I.name)===o.value)),w}),b=z(()=>{const w=new Set;for(const I of e.value)w.add(y(I.name));return Fr.filter(I=>w.has(I.id))}),x=z(()=>{const w=g.value,I={};for(const T of w){const P=y(T.name);I[P]||(I[P]=[]),I[P].push(T)}const $=[];for(const T of Fr)I[T.id]&&I[T.id].length>0&&$.push({label:T.label,icon:T.icon,tools:I[T.id].sort((P,q)=>P.name.localeCompare(q.name))});return $});function _(w){i.value={...i.value,[w]:!i.value[w]}}async function k(){t.value=!0,s.value=null;try{const[w,I,$]=await Promise.all([H.get("/api/tools"),H.get("/api/tools/stats").catch(()=>({})),H.get("/api/tools/builtins").catch(()=>null)]);h($,w),n.value=I||{}}catch(w){s.value=w.message}t.value=!1}function S(){k()}return Ge(()=>{k()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:E,totalUsage:R,filteredTools:g,groupedTools:x,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Dd,toggleExpand:_,refresh:S}}};function Ak(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Rk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const Ik={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),E=f(null),R=f(!1),y=z(()=>e.value.length),g=z(()=>e.value.reduce((W,fe)=>W+(fe.execution_count||0),0)),b=z(()=>e.value.reduce((W,fe)=>W+I(fe.code),0)),x=z(()=>{if(!l.value)return e.value;const W=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(W)||(fe.description||"").toLowerCase().includes(W))}),_=z(()=>u.value?u.value.split(`
`).length:0),k=z(()=>{const W=Math.max(_.value,1);return Array.from({length:W},(fe,ue)=>ue+1).join(`
`)}),S=z(()=>{const W=u.value.trim();return W?W.includes("SKILL_DEFINITION")?W.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(W){return Ak(W)}function I(W){return W?W.split(`
`).length:0}function $(W){return Rk(W)}function T(W){a.value={...a.value,[W]:!a.value[W]}}async function P(W){try{await navigator.clipboard.writeText(W);const fe=e.value.find(ue=>ue.code===W);fe&&(o.value=fe.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function q(W){if(W.key==="Tab"){W.preventDefault();const fe=W.target,ue=fe.selectionStart,G=fe.selectionEnd;u.value=u.value.substring(0,ue)+"    "+u.value.substring(G),It(()=>{fe.selectionStart=fe.selectionEnd=ue+4})}}function K(W){const fe=W.target.previousElementSibling;fe&&(fe.scrollTop=W.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await H.get("/api/skills")}catch(W){s.value=W.message}t.value=!1}async function O(W){i.value=W,delete n.value[W],n.value={...n.value};try{const fe=await H.post(`/api/skills/${encodeURIComponent(W)}/test`);n.value={...n.value,[W]:fe}}catch(fe){n.value={...n.value,[W]:{result:fe.message,is_error:!0}}}i.value=null}function L(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function te(W){r.value=!0,c.value="edit",d.value=W.name,u.value=W.code||"",p.value=null,h.value=null}function ie(){r.value=!1,p.value=null,h.value=null}async function U(){p.value=null,h.value=null;const W=d.value.trim(),fe=u.value.trim();if(!W){p.value="Name is required";return}if(!fe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await H.post("/api/skills",{name:W,code:fe}),h.value="Skill created successfully"):(await H.put(`/api/skills/${encodeURIComponent(W)}`,{code:fe}),h.value="Skill updated successfully"),await D(),setTimeout(()=>{r.value=!1},800)}catch(ue){p.value=ue.message}m.value=!1}function Q(W){E.value=W}async function oe(){if(E.value){R.value=!0;try{await H.del(`/api/skills/${encodeURIComponent(E.value)}`),await D()}catch(W){_e.error(`Failed to delete skill: ${W.message||"unknown error"}`)}R.value=!1,E.value=null}}return Ge(()=>{D()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:E,deleting:R,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:x,editLineCount:_,editorLineNums:k,editValidation:S,highlight:w,truncate:Dd,formatTs:In,countLines:I,getLineNumbers:$,toggleCode:T,copyCode:P,handleEditorKey:q,syncScroll:K,fetchSkills:D,testSkill:O,showCreate:L,editSkill:te,cancelEdit:ie,saveSkill:U,confirmDelete:Q,doDelete:oe}}};class Ms extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Ok=/^[A-Za-z_][A-Za-z0-9_]*$/;function wp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function kp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Ms(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Ms(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new Ms(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Ms(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function Lk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Nk(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new Ms("Server name is required.","name");if(n.length>128||!Ok.test(n))throw new Ms("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new Ms("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=wp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Ms("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new Ms("An HTTP endpoint is required for this connection.","url");if(d&&!Lk(d))throw new Ms("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Ms("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=wp(e.allowlistText));const r=kp(e.headerRows,e.headersRemove,"Header"),c=kp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Dk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Pk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Mk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Fk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function $k(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Uk=1e4,Bk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function $r(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Hk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const jk={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=z(()=>Object.keys(i.value).every(X=>{var we;return Number.isInteger((we=e.value)==null?void 0:we[X])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),v=f(!1),E=f("add"),R=f(""),y=f(null),g=f($r()),b=f(""),x=f(!1);let _=null,k=0,S=!1,w=!1;const I=Fk,$=z(()=>{var X;return((X=e.value)==null?void 0:X.servers)||[]}),T=z(()=>{var X;return!!((X=e.value)!=null&&X.enabled)}),P=z(()=>{var X,we,Ae,Le;return{serverCount:((X=e.value)==null?void 0:X.server_count)||0,enabledCount:((we=e.value)==null?void 0:we.enabled_server_count)||0,connectedCount:((Ae=e.value)==null?void 0:Ae.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),q=z(()=>{var X;return((X=y.value)==null?void 0:X.header_keys)||[]}),K=z(()=>{var X;return((X=y.value)==null?void 0:X.env_keys)||[]}),D=z(()=>{var X;return E.value==="edit"&&((X=y.value)==null?void 0:X.transport)==="http"}),O=z(()=>E.value==="add"||!D.value),L=z(()=>D.value?"Replace endpoint URL":"Endpoint URL"),te=z(()=>D.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function ie(){U(),_=window.setInterval(()=>Q({quiet:!0}),Uk)}function U(){_&&window.clearInterval(_),_=null}async function Q({quiet:X=!1}={}){if(a.value)return;const we=++k;X||(t.value=!0);try{const Ae=await H.get("/api/mcp/status");if(we!==k||!S)return;e.value=Ae;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(Ae[se])&&(i.value[se]=String(Ae[se]));r.value="";const Le=new Set((Ae.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Le.has(se)))}catch(Ae){we===k&&S&&(r.value=Ae.message||"Failed to load MCP status")}finally{we===k&&(t.value=!1)}}function oe(X){return s.value||c.value.has(X)}function W(X,we){const Ae=new Set(c.value);we?Ae.add(X):Ae.delete(X),c.value=Ae}function fe(X){return Pk(X.state)}function ue(X){if(fe(X)==="disabled"){if(!X.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return Bk[fe(X)]}function G(X){return X.transport==="http"?"Streamable HTTP":"stdio"}function ce(X){return X.negotiated_version?`${X.era?`${String(X.era).charAt(0).toUpperCase()}${String(X.era).slice(1)}`:"Protocol"} · ${X.negotiated_version}`:"Not negotiated"}function me(X){return X.discovered_count?`${X.published_count||0} published · ${X.excluded_count||0} excluded`:"No tools discovered"}const ve=f(new Set);async function be(X,we){if(ve.value.has(X.name))return;const Ae=!!we.target.checked,Le=new Set(ve.value);Le.add(X.name),ve.value=Le;try{const se=await H.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/enabled`,{enabled:Ae});se&&Array.isArray(se.servers)?e.value=se:await Q({quiet:!0})}catch(se){we.target.checked=!!X.enabled,_e.error(se.message||`Failed to toggle ${X.name}`)}finally{const se=new Set(ve.value);se.delete(X.name),ve.value=se}}function $e(X,we){var Le;i.value[X]=we;const Ae=new Set(l.value);we===String((Le=e.value)==null?void 0:Le[X])?Ae.delete(X):Ae.add(X),l.value=Ae,n.value=""}async function C(){if(s.value||!o.value||!l.value.size)return;const X={};for(const we of l.value){const Ae=Number(i.value[we]),Le=we==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ae)||Ae<1||Ae>Le){n.value=`Enter a whole number between 1 and ${Le}.`;return}X[we]=Ae}a.value=!0,s.value=!0,n.value="",++k,t.value=!1;try{const we=await H.post("/api/mcp/limits",X);e.value=we;for(const Ae of Object.keys(i.value))Number.isInteger(we[Ae])&&(i.value[Ae]=String(we[Ae]));l.value=new Set,_e.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(we){n.value=we.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Q({quiet:!0})}}async function M(X){if(X!==T.value&&!(!X&&!await Wt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await H.post("/api/mcp/enabled",{enabled:X}),_e.success(X?"MCP enabled":"MCP disabled"),await Q({quiet:!0})}catch(we){_e.error(we.message||"Failed to update MCP state"),await Q({quiet:!0})}finally{s.value=!1}}}async function j(X){W(X.name,!0);try{await H.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/reconnect`,{}),_e.success(`Reconnected ${X.name}`)}catch(we){_e.error(we.message||`Failed to reconnect ${X.name}`)}finally{W(X.name,!1),await Q({quiet:!0})}}async function de(X){W(X.name,!0);try{await H.post(`/api/mcp/servers/${encodeURIComponent(X.name)}/refresh-tools`,{}),_e.success(`Refreshed tools from ${X.name}`),await re(X.name,!0)}catch(we){_e.error(we.message||`Failed to refresh ${X.name}`)}finally{W(X.name,!1),await Q({quiet:!0})}}async function F(X){if(await Wt({title:`Remove ${X.name}`,message:`Remove this saved MCP server? Its ${X.published_count||0} published tool${X.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){W(X.name,!0);try{await H.del(`/api/mcp/servers/${encodeURIComponent(X.name)}`),_e.success(`Removed ${X.name}`),delete p.value[X.name]}catch(Ae){_e.error(Ae.message||`Failed to remove ${X.name}`)}finally{W(X.name,!1),await Q({quiet:!0})}}}async function Z(X){const we=new Set(d.value);if(we.has(X.name)){we.delete(X.name),d.value=we;return}we.add(X.name),d.value=we,Object.hasOwn(p.value,X.name)||await re(X.name)}async function re(X,we=!1){if(!we&&Object.hasOwn(p.value,X))return;const Ae=new Set(m.value);Ae.add(X),m.value=Ae,h.value={...h.value,[X]:""};try{const Le=await H.get(`/api/mcp/servers/${encodeURIComponent(X)}/tools`);p.value={...p.value,[X]:Le.tools||[]}}catch(Le){h.value={...h.value,[X]:Le.message||"Failed to load tools"}}finally{const Le=new Set(m.value);Le.delete(X),m.value=Le}}function B(X){return(p.value[X]||[]).filter(we=>Mk(we,u.value[X]))}function Y(X,we){u.value={...u.value,[X]:we}}function ee(){E.value="add",R.value="",y.value=null,g.value=$r(),b.value="",v.value=!0}function pe(X){E.value="edit",R.value=X.name,y.value=X,g.value={...$r(),name:X.name,enabled:!!X.enabled,transport:X.transport||"stdio"},b.value="",v.value=!0}function he(){x.value||(v.value=!1)}function xe(X){v.value&&$k(X)}function Oe(X){const we=X==="headers"?"headerRows":"envRows";g.value[we].push({key:"",value:""})}function ge(X,we){const Ae=X==="headers"?"headerRows":"envRows";g.value[Ae].splice(we,1)}function He(X,we){const Ae=X==="headers"?"headersRemove":"envRemove",Le=g.value[Ae];g.value[Ae]=Le.includes(we)?Le.filter(se=>se!==we):[...Le,we]}async function Ue(){var we,Ae;b.value="";let X;try{X=Nk(g.value,{mode:E.value,originalTransport:((we=y.value)==null?void 0:we.transport)||""})}catch(Le){b.value=Le instanceof Ms?Le.message:"Invalid MCP server configuration",await It(),(Ae=document.querySelector(".mcp-editor"))==null||Ae.scrollTo({top:0,behavior:"smooth"});return}if(!(E.value==="edit"&&Dk(X,y.value)&&!await Wt({title:`Change ${R.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){x.value=!0;try{E.value==="add"?await H.post("/api/mcp/servers",X):await H.put(`/api/mcp/servers/${encodeURIComponent(R.value)}`,X),_e.success(E.value==="add"?`Saved ${X.name}`:`Updated ${R.value}`),v.value=!1,await Q({quiet:!0})}catch(Le){b.value=Le.message||"Failed to save MCP server"}finally{x.value=!1}}}let je=null;function Qe(X){`${(X==null?void 0:X.event)||""} ${(X==null?void 0:X.type)||""} ${(X==null?void 0:X.tool)||""} ${(X==null?void 0:X.message)||""}`.toLowerCase().includes("mcp")&&(je&&window.clearTimeout(je),je=window.setTimeout(()=>Q({quiet:!0}),200))}function ot(){S||(S=!0,w||(st.subscribe("events",Qe),w=!0),Q(),ie())}function nt(){S=!1,U(),je&&window.clearTimeout(je),je=null,w&&(st.unsubscribe("events",Qe),w=!1)}return Ge(ot),Xt(ot),Vt(nt),ft(nt),{status:e,loading:t,mutating:s,pageError:r,servers:$,masterEnabled:T,aggregate:P,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:$e,saveLimits:C,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:v,editorMode:E,editingName:R,editingServer:y,form:g,formError:b,saving:x,editorGroups:I,configuredHeaderKeys:q,configuredEnvKeys:K,savedHttpEndpoint:D,endpointRequired:O,endpointFieldLabel:L,endpointPlaceholder:te,refreshAll:Q,busy:oe,serverState:fe,stateLabel:ue,transportLabel:G,protocolLabel:ce,toolSummary:me,formatAge:Hk,setMasterEnabled:M,togglePending:ve,toggleServerEnabled:be,reconnect:j,refreshTools:de,removeServer:F,toggleTools:Z,filteredTools:B,setToolQuery:Y,openAdd:ee,openEdit:pe,closeEditor:he,jumpToEditorGroup:xe,addSecretRow:Oe,removeSecretRow:ge,toggleSecretRemoval:He,saveServer:Ue}}};function zk(e,t){if(!e||!t)return gp(e);const s=gp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Vk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let E=null;const R=f(null),y=f(!1),g=f({}),b=f({}),x=f({}),_=f({}),k=new Map,S=f(null),w=z(()=>e.value.reduce((U,Q)=>U+(Q.chunks||0),0)),I=z(()=>new Set(e.value.map(Q=>Q.uploader).filter(Boolean)).size);function $(U,Q){const oe=b.value[Q];if(!oe||oe.length===0)return 0;const W=Math.max(...oe.map(fe=>fe.char_count||0));return W===0?0:Math.round(U.char_count/W*100)}async function T(){t.value=!0,s.value=null;try{const U=await H.get("/api/knowledge");e.value=Array.isArray(U)?U:[]}catch(U){s.value=U.message}t.value=!1}async function P(U){if(g.value[U]){g.value[U]=!1,S.value=null;return}if(g.value[U]=!0,Object.prototype.hasOwnProperty.call(b.value,U))return;if(k.has(U))return k.get(U);const Q={..._.value,[U]:!0};_.value=Q;const oe={...x.value};delete oe[U],x.value=oe;const W=H.get(`/api/knowledge/${encodeURIComponent(U)}/chunks`).then(fe=>{b.value={...b.value,[U]:Array.isArray(fe)?fe:[]}}).catch(fe=>{x.value={...x.value,[U]:fe.message||"load failed"}}).finally(()=>{if(k.get(U)!==W)return;k.delete(U);const fe={..._.value};delete fe[U],_.value=fe});return k.set(U,W),W}let q=0;async function K(){const U=a.value.trim();if(!U)return;const Q=++q;i.value=!0,o.value=null,l.value=U;try{const oe=await H.get(`/api/knowledge/search?q=${encodeURIComponent(U)}`);if(Q!==q)return;n.value=Array.isArray(oe)?oe:[]}catch(oe){if(Q!==q)return;n.value=[],o.value=oe.message||"Search failed"}Q===q&&(i.value=!1)}function D(){q+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function O(){u.value=null,p.value=null;const U=c.value.trim(),Q=d.value.trim();if(!U){u.value="Source name is required";return}if(!Q){u.value="Content is required";return}h.value=!0;try{const oe=await H.post("/api/knowledge",{source:U,content:Q});p.value=`Ingested ${oe.chunks||0} chunks from "${U}"`,c.value="",d.value="",b.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(oe){u.value=oe.message}h.value=!1}async function L(U){m.value=U,v.value=null,E&&(clearTimeout(E),E=null);try{const Q=await H.post(`/api/knowledge/${encodeURIComponent(U)}/reingest`);v.value={source:U,error:!1,message:`Re-ingested ${Q.chunks||0} chunks`},delete b.value[U],await T(),E=setTimeout(()=>{v.value=null,E=null},3e3)}catch(Q){v.value={source:U,error:!0,message:Q.message}}m.value=null}function te(U){R.value=U}async function ie(){if(R.value){y.value=!0;try{await H.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete b.value[R.value],await T()}catch(U){_e.error(`Failed to delete source: ${U.message||"unknown error"}`)}y.value=!1,R.value=null}}return Ge(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:R,deleting:y,expanded:g,sourceChunks:b,chunkErrors:x,loadingChunks:_,selectedChunk:S,totalChunks:w,uploaderCount:I,truncate:Dd,formatTs:In,highlightTerms:zk,chunkBarWidth:$,fetchSources:T,toggleSource:P,doSearch:K,clearSearch:D,doIngest:O,doReingest:L,confirmDelete:te,doDelete:ie}}},qk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),E=f(null),R=f(new Set),y=f(null),g=f(!1),b=f(!1),x=z(()=>e.value.reduce((Q,oe)=>Q+oe.count,0)),_=z(()=>R.value.size);function k(Q){const oe=t.value[Q];if(!oe)return[];if(!l.value.trim())return oe;const W=l.value.trim().toLowerCase();return oe.filter(fe=>fe.key.toLowerCase().includes(W)||fe.value&&fe.value.toLowerCase().includes(W))}function S(Q,oe){return R.value.has(Q+"/"+oe)}function w(Q,oe){const W=Q+"/"+oe,fe=new Set(R.value);fe.has(W)?fe.delete(W):fe.add(W),R.value=fe}function I(Q){const oe=t.value[Q];return!oe||oe.length===0?!1:oe.every(W=>R.value.has(Q+"/"+W.key))}function $(Q,oe){const W=t.value[Q];if(!W)return;const fe=new Set(R.value);for(const ue of W){const G=Q+"/"+ue.key;oe?fe.add(G):fe.delete(G)}R.value=fe}async function T(){s.value=!0,a.value=null;try{const Q=await H.get("/api/memory");e.value=Object.entries(Q).map(([oe,W])=>({name:oe,keys:W.keys||[],count:W.count||0}))}catch(Q){a.value=Q.message}s.value=!1}async function P(Q){if(n.value[Q]){n.value[Q]=!1;return}n.value[Q]=!0;const oe=e.value.find(fe=>fe.name===Q);if(!oe||t.value[Q]||i.value===Q)return;i.value=Q;let W;try{const ue=(await H.get(`/api/memory/${encodeURIComponent(Q)}`)).entries||{};W=oe.keys.map(G=>Object.prototype.hasOwnProperty.call(ue,G)?{key:G,value:ue[G]||"",failed:!1}:{key:G,value:"",failed:!0,error:"Not found in scope"})}catch(fe){W=oe.keys.map(ue=>({key:ue,value:"",failed:!0,error:fe.message||"Failed to load"}))}t.value[Q]=W,i.value=null}function q(Q,oe,W){p.value=Q+"/"+oe,h.value=W}async function K(Q,oe){m.value=!0,v.value=null;try{await H.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`,{value:h.value});const W=t.value[Q];if(W){const fe=W.find(ue=>ue.key===oe);fe&&(fe.value=h.value)}p.value=null}catch(W){v.value=`Failed to save: ${W.message||"unknown error"}`}m.value=!1}async function D(Q,oe){try{await navigator.clipboard.writeText(oe.value),E.value=Q+"/"+oe.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const Q=r.value.scope.trim(),oe=r.value.key.trim(),W=r.value.value.trim();if(!Q){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!W){d.value="Value is required";return}c.value=!0;try{await H.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`,{value:W}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function L(Q,oe){y.value={scope:Q,key:oe}}async function te(){if(!y.value)return;g.value=!0,v.value=null;const{scope:Q,key:oe}=y.value;try{await H.del(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`);const W=t.value[Q];W&&(t.value[Q]=W.filter(G=>G.key!==oe));const fe=e.value.find(G=>G.name===Q);fe&&(fe.count--,fe.keys=fe.keys.filter(G=>G!==oe));const ue=new Set(R.value);ue.delete(Q+"/"+oe),R.value=ue}catch(W){v.value=`Failed to delete: ${W.message||"unknown error"}`}g.value=!1,y.value=null}function ie(){b.value=!0}async function U(){g.value=!0,v.value=null;const Q=[];for(const oe of R.value){const W=oe.indexOf("/");Q.push({scope:oe.slice(0,W),key:oe.slice(W+1)})}try{await H.post("/api/memory/bulk-delete",{entries:Q}),R.value=new Set,t.value={},await T()}catch(oe){v.value=`Bulk delete failed: ${oe.message||"unknown error"}`}g.value=!1,b.value=!1}return Ge(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:E,selected:R,selectedCount:_,totalEntries:x,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:T,toggleScope:P,startEdit:q,doEdit:K,copyValue:D,doAdd:O,confirmDelete:L,doDelete:te,confirmBulkDelete:ie,doBulkDelete:U,isSelected:S,toggleSelect:w,isScopeAllSelected:I,toggleSelectAll:$,filteredEntries:k}}},Gk={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(!1),r=f(!1),c=f(null),d=f(!1),u=z(()=>[...new Set(e.value.map(_=>_.category))].sort()),p=z(()=>{const x={};return e.value.forEach(_=>{x[_.category]=(x[_.category]||0)+1}),x}),h=z(()=>n.value?e.value.filter(x=>x.category===n.value):e.value);function m(x){return x==="correction"?"badge-warning":x==="operational"?"badge-info":x==="preference"?"badge-success":"badge-info"}function v(x){i.value=x.key,l.value=x.content}async function E(x){try{await H.put("/api/learned/"+encodeURIComponent(x),{content:l.value}),i.value=null,_e.success("Entry updated"),await y()}catch(_){_e.error(_.message||"Failed to save entry")}}async function R(x){if(await Wt({title:"Delete learned entry",message:`Delete "${x}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await H.del("/api/learned/"+encodeURIComponent(x)),_e.success("Entry deleted"),await y()}catch(k){_e.error(k.message||"Failed to delete entry")}}async function y(){s.value=!0,a.value=null;try{const x=await H.get("/api/learned");e.value=x.entries||[],t.value={last_reflection:x.last_reflection,count:x.count}}catch(x){a.value=x.message}s.value=!1}async function g(){var x;r.value=!1,c.value=null;try{const _=await H.get("/api/config");o.value=((x=_.learning)==null?void 0:x.enabled)===!0,r.value=!0}catch(_){c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Automatic learning state is unavailable."}}async function b(x){if(!(!r.value||d.value)){d.value=!0,c.value=null;try{if(await H.put("/api/config",{learning:{enabled:x}}),await g(),!r.value)return;_e.success(`Automatic learning ${o.value?"enabled":"disabled"}`)}catch(_){r.value=!1,c.value=_.status===403?"Administrator access is required to change automatic learning.":_.message||"Failed to change automatic learning."}finally{d.value=!1}}}return Ge(()=>{y(),g()}),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:u,catCounts:p,filtered:h,learningEnabled:o,configReady:r,configError:c,savingConfig:d,catBadge:m,formatTs:In,startEdit:v,saveEdit:E,deleteEntry:R,fetchEntries:y,fetchLearningConfig:g,setLearningEnabled:b}}},vv=[{id:"tools",label:"Tools",component:Ek},{id:"skills",label:"Skills",component:Ik},{id:"mcp-servers",label:"MCP Servers",component:jk},{id:"knowledge",label:"Knowledge",component:Vk},{id:"memory",label:"Memory",component:qk},{id:"learned",label:"Learned",component:Gk}],Wk={components:{TabbedPage:rr},setup(){return{tabs:vv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Kk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Jk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Zk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Yk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=z(()=>e.value.components||[]),l=z(()=>Zk[e.value.overall]||"text-gray-400"),o=z(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=z(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Kk[_]||"text-gray-400"}function d(_){return Jk[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function h(_){return _.replace(/_/g," ").replace(/\b\w/g,k=>k.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function v(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function E(){n.value=!0;try{e.value=await H.get("/api/health/components"),s.value=null,a.value=!0}catch(_){s.value=_.message}finally{t.value=!1,n.value=!1}}function R(){t.value=!0,s.value=null,E()}let y=null,g=!1;function b(){g||(g=!0,E(),y||(y=setInterval(E,3e4)))}function x(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ge(b),Xt(b),Vt(x),ft(x),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:E,retry:R}}},Qk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=z(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=z(()=>{if(!i.value)return[];const E=i.value,R=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/R*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/R*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/R*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/R*100)),color:"res-bar-amber"}]});async function d(){try{const E=await H.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),Xt(m),Vt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Pd,refresh:u,retry:p}}},Xk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),eS=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function tS(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!eS.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?fl(t):""}function sS(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!Xk.has(c)));s=Object.keys(r).length?fl(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Xa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),hl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function aS(e){const t=Xa(e)?e:{},s=Xa(t.metadata)?t.metadata:{},a=Xa(t.audit_metadata)?t.audit_metadata:{},n=Xa(t.turn)?t.turn:{},i=l=>hl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function Sp(e){return e.record?JSON.stringify(gv(e),null,2):e.text}function gv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function Cc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function Tp(e){if(!Cc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,hl(s.channel_id),hl(s.user_id??s.actor)])}function nS(e,t,s=2e3){var i,l,o;const a=Tp(t),n=a?e.findIndex(r=>Tp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:Cc(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(b=>Xa(b[y])).map(b=>b[y]);g.length&&(h[y]=Object.assign({},...g))}const m=c.some(y=>Cc(y)!=="start"),v=c.find(y=>Ec(y,0).level==="ERROR"),E=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);h.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(E)?E:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),v&&(h.error=v.error||((o=v.metadata)==null?void 0:o.error)||h.error);const R=Ec(h,r.id,r._time);Object.assign(R,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,R)}e.length>s&&e.splice(0,e.length-s)}function Ec(e,t,s=new Date){var u,p;let a=e;if(Xa(e)&&e.type==="log"&&"line"in e?a=e.line:Xa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Xa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":hl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:hl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:aS(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function iS(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const lS={components:{ToolOutput:cr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=z(()=>sS(e.entry)),s=z(()=>{var o;return fl(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=z(()=>{var o,r,c;return fl(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=z(()=>tS(e.entry.record)),i=z(()=>gv(e.entry)),l=z(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},oS=["INFO","WARNING","ERROR"],rS=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Ur=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],cS=[50,100,200,500],dS={components:{ToolOutput:cr,LogRecord:lS},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(st.state||"disconnected"),u=z(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,E=oS,R=rS,y=Ur,g=f("all"),b=f(""),x=f([]),_=f(!1),k=f(""),S=f([]);function w(){try{const ne=localStorage.getItem("odin-log-presets");ne&&(x.value=JSON.parse(ne))}catch{}}function I(){try{localStorage.setItem("odin-log-presets",JSON.stringify(x.value))}catch{}}const $=z(()=>l.value!==""||o.value.trim()!==""||b.value!==""),T=z(()=>{const ne=Ur.find(Te=>Te.value===b.value);return ne?ne.label:""}),P=z(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ne){return ne.message}}),q=24,K=z(()=>{if(Q.value.length===0)return[];const ne=[],Te=new Date,Fe=3600*1e3;for(let et=q-1;et>=0;et--){const dt=new Date(Te.getTime()-(et+1)*Fe),mt=new Date(Te.getTime()-et*Fe);ne.push({start:dt,end:mt,label:te(dt,mt),shortLabel:mt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const et of Q.value){if(!et._time)continue;const dt=et._time.getTime();for(const mt of ne)if(dt>=mt.start.getTime()&&dt<mt.end.getTime()){mt.total++,et.level==="ERROR"?mt.errors++:et.level==="WARNING"?mt.warnings++:mt.info++;break}}return ne}),D=z(()=>{let ne=1;for(const Te of K.value)Te.total>ne&&(ne=Te.total);return ne}),O=z(()=>{if(K.value.length===0)return"";const ne=Q.value.map(et=>et._time&&et._time.getTime()).filter(Boolean);if(ne.length===0)return"";const Te=new Date(Math.min(...ne));return`${Q.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),L=z(()=>Math.ceil(q/8));function te(ne,Te){const Fe={hour:"2-digit",minute:"2-digit"};return ne.toLocaleTimeString([],Fe)+" - "+Te.toLocaleTimeString([],Fe)}function ie(ne,Te){return!Te||!ne?"0px":Math.max(2,ne/Te*100)+"%"}function U(ne){const Te=Q.value.findIndex(Fe=>Fe._time&&Fe._time.getTime()>=ne.start.getTime()&&Fe._time.getTime()<ne.end.getTime());if(Te>=0&&p.value){const Fe=p.value.querySelector('[data-log-id="'+Q.value[Te].id+'"]');Fe&&(Fe.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Q=z(()=>{let ne=t.value;if(l.value&&(ne=ne.filter(Te=>(Te.level||"INFO")===l.value)),b.value){const Te=Ur.find(Fe=>Fe.value===b.value);if(Te&&Te.seconds){const Fe=new Date(Date.now()-Te.seconds*1e3);ne=ne.filter(et=>et._time&&et._time>=Fe)}}if(o.value&&!P.value)if(r.value)try{const Te=new RegExp(o.value,"i");ne=ne.filter(Fe=>{const et=Fe.searchText,dt=Fe.tool||"";return Te.test(et)||Te.test(dt)})}catch{}else{const Te=o.value.toLowerCase();ne=ne.filter(Fe=>{const et=Fe.searchText.toLowerCase(),dt=(Fe.tool||"").toLowerCase();return et.includes(Te)||dt.includes(Te)})}return ne}),oe=z(()=>iS(Q.value));function W(ne){const Te=Ec(ne,++s);if(n.value){S.value.push(Te);return}fe(Te)}function fe(ne){nS(t.value,ne,v),i.value&&It(()=>ue())}function ue(ne=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:ne?"smooth":"instant"})}function G(){i.value=!0,h.value=!1,It(()=>ue(!0))}const ce=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function me(){const ne=p.value;if(!ne)return;const Te=ne.scrollHeight-ne.scrollTop-ne.clientHeight<40;h.value=!i.value&&!Te&&t.value.length>0,C.value&&ve()}function ve(){const ne=p.value;!ne||!i.value||ne.scrollHeight-ne.scrollTop-ne.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function be(){i.value&&requestAnimationFrame(ve)}function $e(ne){ce.has(ne.key)&&be()}const C=f(!1);function M(){i.value&&(C.value=!0,requestAnimationFrame(ve))}function j(){C.value&&(C.value=!1,ve())}function de(){i.value&&(h.value=!1,It(()=>ue()))}function F(){if(n.value=!n.value,!n.value&&S.value.length>0){for(const ne of S.value)fe(ne);S.value=[]}}function Z(){t.value=[],S.value=[],h.value=!1}function re(){let ne;e.value==="search"?ne=Ne.value.map(dt=>{const mt=dt.error?"ERROR":"INFO",ha=dt.tool_name?`[${dt.tool_name}] `:"";return`${dt.timestamp||""} ${mt} ${ha}${dt.result_summary||dt.message||""}`}).join(`
`):ne=Q.value.map(Sp).join(`

`);const Te=new Blob([ne],{type:"text/plain"}),Fe=URL.createObjectURL(Te),et=document.createElement("a");et.href=Fe,et.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,et.click(),URL.revokeObjectURL(Fe)}function B(ne){const Te=Sp(ne);navigator.clipboard.writeText(Te).then(()=>{m.value=ne.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function Y(ne){l.value=l.value===ne?"":ne,g.value="all"}function ee(ne){return ne.level==="ERROR"?"log-line-error":ne.level==="WARNING"?"log-line-warning":"text-gray-300"}function pe(ne){return ne==="ERROR"?"text-red-500 font-semibold":ne==="WARNING"?"text-yellow-500":"text-blue-500"}function he(ne){return ne==="ERROR"?"log-chip-error":ne==="WARNING"?"log-chip-warning":"log-chip-info"}function xe(ne){g.value=ne.id;const Te=ne.filters;l.value=Te.level||"",b.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Oe(ne){g.value=ne.id,l.value=ne.filters.level||"",b.value=ne.filters.timeRange||"",o.value=ne.filters.text||""}function ge(){if(!k.value.trim())return;const ne={id:"custom-"+Date.now(),name:k.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};x.value=[...x.value,ne],I(),_.value=!1,k.value=""}function He(ne){x.value=x.value.filter(Te=>Te.id!==ne),I(),g.value===ne&&(g.value="all")}const Ue=f("all"),je=f(""),Qe=f(""),ot=f(""),nt=f(""),X=f(""),we=f(100),Ae=cS,Le=f(!1),se=f(!1),Ee=f(""),Ne=f([]),Je=f(null),Lt=f(null);function We(){e.value="search",Je.value||Ut()}async function Ut(){try{Je.value=await H.get("/api/logs/stats")}catch{}}function Bt(){const ne=X.value;if(!ne){ot.value="",nt.value="";return}const Fe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ne];if(Fe){const et=new Date(Date.now()-Fe*1e3);ot.value=hs(et),nt.value=""}}function hs(ne){const Te=Fe=>String(Fe).padStart(2,"0");return`${ne.getFullYear()}-${Te(ne.getMonth()+1)}-${Te(ne.getDate())}T${Te(ne.getHours())}:${Te(ne.getMinutes())}`}function Ys(ne){if(!ne)return"";const Te=new Date(ne);return isNaN(Te.getTime())?"":Te.toISOString()}async function Os(){Le.value=!0,Ee.value="",se.value=!0,Lt.value=null;try{const ne=new URLSearchParams;Ue.value&&Ue.value!=="all"&&ne.set("level",Ue.value),je.value&&ne.set("tool",je.value),Qe.value&&ne.set("q",Qe.value);const Te=Ys(ot.value),Fe=Ys(nt.value);Te&&ne.set("start",Te),Fe&&ne.set("end",Fe),ne.set("limit",String(we.value));const et=await H.get(`/api/logs/search?${ne.toString()}`);Ne.value=et.entries||[]}catch(ne){Ee.value=ne.message||"Search failed",Ne.value=[]}finally{Le.value=!1}}function nn(){Ue.value="all",je.value="",Qe.value="",ot.value="",nt.value="",X.value="",we.value=100,Ne.value=[],se.value=!1,Ee.value="",Lt.value=null}function Qs(ne){Lt.value=Lt.value===ne?null:ne}function js(ne){if(!ne.timestamp)return"";try{return new Date(ne.timestamp).toLocaleString()}catch{return ne.timestamp}}function Ha(ne){return ne.type==="web_action"?`${ne.status||""} (${ne.execution_time_ms||0}ms)`:(ne.result_summary||"").slice(0,200)}function ws(ne){return ne.error?"log-line-error":"text-gray-300"}function fa(ne){try{return JSON.stringify(ne,null,2)}catch{return String(ne)}}let Ls=null,at=!1;function Ns(){at||(at=!0,st.subscribe("logs",W),c.value=st.connected,d.value=st.state||"disconnected",Ls=st.onState(ne=>{d.value=ne,c.value=ne==="connected"}))}function ks(){at&&(at=!1,st.unsubscribe("logs",W),Ls&&(Ls(),Ls=null))}return Ge(()=>{w(),window.addEventListener("pointerup",j),window.addEventListener("pointercancel",j)}),Xt(Ns),Vt(ks),ft(()=>{ks(),window.removeEventListener("pointerup",j),window.removeEventListener("pointercancel",j)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:oe,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Q,pauseBuffer:S,showJumpBottom:h,copiedIndex:m,regexError:P,levels:E,logPresets:R,timeRanges:y,timeRange:b,activeLogPreset:g,customLogPresets:x,showSaveLogPreset:_,newLogPresetName:k,hasActiveLogFilters:$,timeRangeLabel:T,timelineBuckets:K,timelineMax:D,timelineSpanLabel:O,timelineLabelSkip:L,togglePause:F,clearLogs:Z,exportLogs:re,logLineClass:ee,levelClass:pe,levelChipClass:he,toggleLevel:Y,copyLine:B,jumpToBottom:G,onScroll:me,onUserScrollIntent:be,onUserScrollKey:$e,onAutoScrollToggle:de,onPointerDown:M,applyLogPreset:xe,applyCustomLogPreset:Oe,saveLogCustomPreset:ge,removeLogCustomPreset:He,segmentHeight:ie,jumpToTimelineBucket:U,searchLevel:Ue,searchTool:je,searchKeyword:Qe,searchStart:ot,searchEnd:nt,searchTimePreset:X,searchLimit:we,searchLimits:Ae,searching:Le,searchRan:se,searchError:Ee,searchResults:Ne,searchStats:Je,expandedSearch:Lt,switchToSearch:We,runSearch:Os,clearSearchFilters:nn,toggleSearchExpand:Qs,formatSearchTs:js,searchEntryText:Ha,searchLogLineClass:ws,formatJson:fa,applySearchTimePreset:Bt}}};function Vl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const uS=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function pS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const ni=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],fS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},ql=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),hS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Cp(e){return hS.some(t=>e===t||e.startsWith(`${t}.`))}const bv="odin_config_center_expanded_v1",yv="odin_config_center_category_v1",mS=50,vS=650,Ai=()=>H.get("/api/config/meta");function pn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Kn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Un(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function gS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function bS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function xv(e,t){if(Kn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return pn(t);const a={};for(const[n,i]of Object.entries(t)){const l=xv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function yS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=xv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function _v(e,t,s,a){if(Kn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)_v(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function xS(){try{const e=JSON.parse(localStorage.getItem(bv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function _S(){try{const e=localStorage.getItem(yv);return ni.some(t=>t.key===e)?e:ni[0].key}catch{return ni[0].key}}const wS={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(!1),l=f(""),o=f(!1),r=f(""),c=f("");async function d(){if(!(!i.value||!l.value.trim()||o.value||be.value)){o.value=!0,r.value="",c.value="";try{const A=H.consentListener(l.value.trim());l.value="";const V=await A;r.value=V.message,i.value=!1}catch(A){c.value=A.message||"Listener consent could not be saved."}finally{l.value="",o.value=!1}}}const u=f(null),p=["image_model","outer_model"],h=f(null),m=f(null),v=f(null),E=f(!1),R=f(!1),y=f(null),g=f(""),b=f("all"),x=f(_S()),_=f(xS()),k=f({}),S=f({}),w=f(""),I=f({}),$=f({}),T=f([]),P=f([]),q=f(!1),K=f(!1),D=f(!1);let O=null,L=null,te={path:null,at:0},ie=0;const U=z(()=>{var A;return(((A=t.value)==null?void 0:A.fields)||[]).filter(V=>!ql.has(V.path.split(".")[0])&&!Cp(V.path))}),Q=z(()=>new Map(U.value.map(A=>[A.path,A]))),oe=z(()=>ce.value.reduce((A,V)=>A+V.sections.length,0)),W=z(()=>U.value.length),fe=z(()=>uS),ue=z(()=>T.value.length>0),G=z(()=>P.value.length>0),ce=z(()=>{if(!e.value)return[];const A=new Set(ni.flatMap(Se=>Se.sections)),V=ni.map(Se=>({...Se,sections:Se.sections.filter(Ke=>Object.hasOwn(e.value,Ke)&&!ql.has(Ke))})).filter(Se=>Se.sections.length),ae=Object.keys(e.value).filter(Se=>!A.has(Se)&&!ql.has(Se));return ae.length&&V.push({key:"other",label:"Other",icon:"folder",sections:ae}),V}),me=z(()=>e.value?{...e.value,...k.value}:null),ve=z(()=>{if(!e.value)return[];const A=[];for(const[V,ae]of Object.entries(k.value))_v(e.value[V],ae,V,A);return A.filter(V=>!Kn(V.oldVal,V.newVal)).map(V=>{const ae=ee(V.path);return{...V,label:(ae==null?void 0:ae.label)||Un(V.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||Ue(V.path.split(".")[0])}})}),be=z(()=>ve.value.length>0),$e=z(()=>ve.value.length),C=z(()=>new Set(ve.value.map(A=>A.path.split(".")[0])).size),M=z(()=>!!g.value||b.value!=="all"),j=z(()=>{const A={...$.value};for(const V of ve.value){const ae=ee(V.path),Se=Ss(ae,V.newVal);Se&&(A[V.path]=Se)}return A}),de=z(()=>Object.keys(j.value).length>0),F=z(()=>e.value?(M.value?ce.value:ce.value.filter(V=>V.key===x.value)).map(V=>({...V,sections:V.sections.filter(ae=>Bt(ae))})).filter(V=>V.sections.length):[]),Z=z(()=>{const A=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],V=new Map(A.map(ae=>[ae,[]]));for(const ae of ve.value){const Se=V.has(ae.apply_mode)?ae.apply_mode:"restart";V.get(Se).push(ae)}return A.filter(ae=>V.get(ae).length).map(ae=>({key:ae,label:Ce(ae),entries:V.get(ae)}))}),re=z(()=>ve.value.filter(A=>A.apply_mode==="restart").length),B=z(()=>U.value.filter(A=>A.pending_restart)),Y=z(()=>B.value.length);function ee(A){const V=Q.value.get(A);return V?{...V,apply_details:Vl([V])}:null}function pe(A){const V=`${A}.`;return U.value.filter(ae=>ae.path===A||ae.path.startsWith(V))}function he(){return U.value.some(A=>A.path==="tools.hosts"||A.path.startsWith("tools.hosts."))}function xe(){var ae,Se;const A=((Se=(ae=e.value)==null?void 0:ae.tools)==null?void 0:Se.hosts)||{},V=Object.keys(A).length;return`${V} host${V===1?"":"s"} configured.`}function Oe(A){return pe(A).length}function ge(A){return Un(A)}function He(A){const V=pe(A);if(!V.length)return`${Un(A)} configuration.`;const ae=V.find(kt=>kt.sensitivity==="public"&&kt.description)||V.find(kt=>kt.description),Se=(ae==null?void 0:ae.description)||"";return Se.match(/setting for (.+)\.$/i)?`${Un(A)} settings and runtime behaviour.`:Se}function Ue(A){const V=[...new Set(pe(A).map(ae=>ae.apply_mode))];return V.length===1?V[0]:V.includes("restart")?"restart":V.includes("activation_required")?"activation_required":V[0]||"restart"}function je(A){const V=[...new Set(pe(A).map(ae=>Ce(ae.apply_mode)))];return V.length?V.length===1?V[0]:`Mixed apply behaviour: ${V.join(" · ")}`:""}function Qe(A){return Vl(pe(A))}function ot(A){var V;return Object.hasOwn(k.value,A)?k.value[A]:(V=e.value)==null?void 0:V[A]}function nt(){const A=ot("mcp")||{},V=Object.keys(A.servers||{}).length;return`${A.enabled?"Globally enabled":"Globally disabled"} · ${V} configured server${V===1?"":"s"}.`}function X(A,V){return V.split(".").reduce((ae,Se)=>ae==null?void 0:ae[Se],A)}function we(A){const V=me.value;return pe(A).filter(ae=>Cp(ae.path)?!1:ae.path.split(".").length<=2?!0:!ae.path.includes(".*")).map(ae=>({...ae,key:ae.path.split(".").at(-1),value:X(V,ae.path),apply_details:Vl([ae]),editor:ae.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Ae(A){const V=A.path.split(".");return V.length>2?V.slice(0,2).join("."):null}function Le(A){const V=new Map;for(const ae of we(A)){const Se=Ae(ae),Ke=Se||`${A}.__root`;V.has(Ke)||V.set(Ke,{key:Ke,path:Se,entries:[]}),V.get(Ke).entries.push(ae)}return[...V.values()].map(ae=>{const Se=ae.entries.find(Ke=>Ke.group_description);return{...ae,label:ae.path?Un(ae.path.split(".").at(-1)):null,description:(Se==null?void 0:Se.group_description)||null,apply_details:Vl(ae.entries),runtime_summaries:Ee(ae.entries)}})}function se(A){return{save:A.save_effect||(A.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:A.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[A.apply_mode]||"Effective runtime state is not currently observable."}}function Ee(A){const V=new Map;for(const ae of A){const Se=se(ae),Ke=`${ae.apply_mode}|${Se.save}|${Se.runtime}`;V.has(Ke)||V.set(Ke,{key:Ke,label:Ce(ae.apply_mode),save:Se.save,runtime:Se.runtime})}return[...V.values()]}function Ne(A){if(Je(A))return A.runtime_effect||A.activation_policy||"";if(A.apply_mode==="activation_required"){const V=A.activation_policy||A.runtime_effect;return V?`Not active after saving. No activation control exists in this release. ${V}`:"Not active after saving; no activation control exists in this release."}return""}function Je(A){return A.action_available===!0&&!!(A.action_label&&A.action_endpoint)}async function Lt(A){if(Je(A))try{if(Qs(A.path))throw new Error("Save this setting before applying its action.");const V=String(A.action_method||"POST").toLowerCase(),ae={post:H.post.bind(H),put:H.put.bind(H),delete:H.del.bind(H)}[V];if(!ae)throw new Error("Unsupported configuration action");await ae(A.action_endpoint,A.action_body||void 0),await fr(),De("success",`${A.action_label} completed.`)}catch(V){De("error",V.message||`${A.action_label} failed`)}}function We(A,V){return[A.label,A.path,A.description,...A.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(V)}function Ut(A){const V=g.value.trim().toLowerCase();return V?pe(A).filter(ae=>We(ae,V)):[]}function Bt(A){const V=pe(A);if(b.value!=="all"&&!V.some(Se=>Se.apply_state===b.value))return!1;const ae=g.value.trim().toLowerCase();return!ae||`${ge(A)} ${A}`.toLowerCase().includes(ae)?!0:V.some(Se=>We(Se,ae))}function hs(A,V){return pe(A).filter(ae=>ae.apply_state===V).length}function Ys(A){return A==="all"?W.value:U.value.filter(V=>V.apply_state===A).length}function Os(A){const V=A.sections.flatMap(ae=>pe(ae));return{fields:V.length,modified:ve.value.filter(ae=>A.sections.includes(ae.path.split(".")[0])).length,pending_restart:V.filter(ae=>ae.apply_state==="pending_restart").length,invalid:V.filter(ae=>ae.apply_state==="invalid").length,dormant:V.filter(ae=>ae.apply_state==="dormant").length}}function nn(A){var V;return Object.hasOwn(k.value,A)&&!Kn((V=e.value)==null?void 0:V[A],k.value[A])}function Qs(A){return ve.value.some(V=>V.path===A||V.path.startsWith(`${A}.`))}function js(A){x.value=A,g.value="",b.value="all";try{localStorage.setItem(yv,A)}catch{}}function Ha(A){b.value=A}function ws(){g.value="",b.value="all"}function fa(A){var V;return((V=ce.value.find(ae=>ae.sections.includes(A)))==null?void 0:V.sections)||[]}function Ls(A){const V=fa(A),ae=V.find(Se=>_.value[Se]===!0);return ae||V.find(Se=>_.value[Se]!==!1)||null}function at(A){return g.value&&!D.value&&Bt(A)?!0:D.value?Ls(A)===A:Object.hasOwn(_.value,A)?_.value[A]===!0:!0}function Ns(A){const V=!at(A);if(D.value){const ae={..._.value};for(const Se of fa(A))ae[Se]===!0&&(ae[Se]=!1);ae[A]=V,_.value=ae;return}_.value={..._.value,[A]:V}}function ks(){T.value.push(pn(k.value)),T.value.length>mS&&T.value.shift(),P.value=[]}function ne(){n.value||be.value&&(ks(),k.value={},$.value={},q.value=!1)}function Te(A,V=!1){const ae=Date.now();if(V&&te.path===A&&ae-te.at<vS){te.at=ae;return}ks(),te={path:A,at:ae}}function Fe(A,V,ae){if(!V.length)return ae;const Se=pn(A??{});let Ke=Se;for(let kt=0;kt<V.length-1;kt+=1){const qs=V[kt];Ke[qs]=pn(Ke[qs]??{}),Ke=Ke[qs]}return Ke[V.at(-1)]=ae,Se}function et(A){var V;return Object.hasOwn(k.value,A)?k.value[A]:pn((V=e.value)==null?void 0:V[A])}function dt(A,V,ae={}){var Pn;if(n.value||ql.has(A.path.split(".")[0]))return;const[Se,...Ke]=A.path.split(".");Te(A.path,!!ae.coalesce);const kt=et(Se),qs=Ke.length?Fe(kt,Ke,V):V,ta={...k.value};if(Kn(qs,(Pn=e.value)==null?void 0:Pn[Se])?delete ta[Se]:ta[Se]=qs,k.value=ta,$.value[A.path]){const on={...$.value};delete on[A.path],$.value=on}}function mt(A){te={path:null,at:0},S.value={...S.value,[A]:String(X(me.value,A)??"")}}function ha(A){if(te={path:null,at:0},!Object.hasOwn(S.value,A))return;const V={...S.value};delete V[A],S.value=V}function zs(A){const V=S.value[A.path];if(te={path:null,at:0},V===""){if(A.nullable){ha(A.path),dt(A,null,{coalesce:!0});return}$.value={...$.value,[A.path]:"Enter a number."};return}const ae=Number(V);if(Number.isNaN(ae)||A.type==="integer"&&!Number.isInteger(ae)){$.value={...$.value,[A.path]:A.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Se={...S.value};delete Se[A.path],S.value=Se,dt(A,ae,{coalesce:!0})}function xi(A){return Object.hasOwn(S.value,A.path)?S.value[A.path]:A.value??""}function _i(A,V){if(S.value={...S.value,[A.path]:V},V===""){if(A.nullable){dt(A,null,{coalesce:!0});return}$.value={...$.value,[A.path]:"Enter a number."};return}const ae=Number(V);if(!Number.isFinite(ae)||A.type==="integer"&&!Number.isInteger(ae)){$.value={...$.value,[A.path]:A.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if($.value[A.path]){const Se={...$.value};delete Se[A.path],$.value=Se}dt(A,ae,{coalesce:!0})}function Ln(A){const V=Number.parseInt(w.value,10);if(!Number.isInteger(V)||V<1){$.value={...$.value,[A.path]:"Warning thresholds must be positive whole numbers."};return}const ae=[...new Set([...A.value||[],V])].sort((Se,Ke)=>Ke-Se);w.value="",dt(A,ae)}function Nn(A,V){dt(A,(A.value||[]).filter(ae=>ae!==V))}function ln(A){return A.apply_mode==="live_read"?"Odin reads the saved file value on next use.":A.apply_mode==="live_for_new_work"?"New work uses the saved file value.":A.apply_mode==="live_apply"?A.apply_handler?`Apply the saved value through ${A.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":A.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":A.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":A.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ja(A){return A.type==="array"&&Array.isArray(A.value)&&!A.structured_container&&!A.structured_container_child&&A.sensitivity==="public"&&A.value.every(V=>["string","number","boolean"].includes(typeof V))}function Xs(A){const V=String(I.value[A.path]??"").trim();if(!V)return;const ae=[...new Set([...A.value||[],V])];I.value={...I.value,[A.path]:""},dt(A,ae)}function ma(A,V){dt(A,(A.value||[]).filter(ae=>ae!==V))}function Ss(A,V){var Se;if(!A)return null;if((Se=A.enum)!=null&&Se.length&&!A.enum.includes(V))return`Choose one of: ${A.enum.join(", ")}`;if(A.path==="agents.final_warning_iterations"&&(!Array.isArray(V)||!V.length))return"Add at least one warning threshold.";const ae=A.constraints||{};if((A.type==="integer"||A.type==="number")&&typeof V=="number"){if(ae.minimum!==void 0&&V<ae.minimum)return`Must be at least ${ae.minimum}${A.unit?` ${A.unit}`:""}`;if(ae.maximum!==void 0&&V>ae.maximum)return`Must be at most ${ae.maximum}${A.unit?` ${A.unit}`:""}`}return null}function Dn(A){return j.value[A.path]||null}function J(A){const V=`${A}.`;return Object.keys(j.value).some(ae=>ae===A||ae.startsWith(V))}function ke(){n.value||T.value.length&&(P.value.push(pn(k.value)),k.value=T.value.pop(),$.value={},S.value={},te={path:null,at:0})}function Ie(){n.value||P.value.length&&(T.value.push(pn(k.value)),k.value=P.value.pop(),$.value={},S.value={},te={path:null,at:0})}function Vs(){!be.value||de.value||(q.value=!0,K.value=!1)}function va(){q.value=!1}function za(){ne()}function Ce(A){return fS[A]||Un(A||"unknown")}function N(A){return`apply-${String(A||"unknown").replaceAll("_","-")}`}function le(A){return`cfgc-field-${A.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ye(A){return`${le(A)}-input`}function Pe(A){const V=document.getElementById(le(A))||document.getElementById(le(A.split(".").slice(0,2).join(".")));V==null||V.scrollIntoView({behavior:"smooth",block:"center"})}function De(A,V){m.value={type:A,message:V},window.setTimeout(()=>{var ae;((ae=m.value)==null?void 0:ae.message)===V&&(m.value=null)},3500)}function ze(){E.value=!1,b.value="pending_restart",g.value="";const A=pS(a.value);A&&(A.scrollTop=0)}function At(){E.value=!1}function ht(A=1800){L&&window.clearTimeout(L),L=window.setTimeout(wt,A)}async function wt(){if(R.value){if(ie+=1,ie>45){R.value=!1,y.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ai(),Y.value===0){R.value=!1,y.value=null,De("success","Odin restarted and the saved startup settings are active.");return}}catch{}ht(2e3)}}async function ea(){if(!R.value){y.value=null;try{await H.post("/api/restart",{}),R.value=!0,ie=0,E.value=!1,ht()}catch(A){y.value=A.message||"Odin could not schedule a restart."}}}async function Nt(){if(!(!be.value||de.value||n.value)){n.value=!0;try{const A=yS(e.value,k.value),V=await H.put("/api/config",A);e.value=V,k.value={},T.value=[],P.value=[],$.value={},q.value=!1;try{t.value=await Ai(),v.value=null,E.value=Y.value>0,De("success",Y.value?`Configuration saved. ${Y.value} setting${Y.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(ae){v.value=ae.message||"Unknown metadata error.",De("error",`Configuration saved, but apply status could not be refreshed: ${v.value}`)}}catch(A){De("error",A.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Cl(){if(!n.value){n.value=!0,u.value=null;try{t.value=await Ai(),v.value=null}catch(A){u.value=`Image model status could not be refreshed: ${A.message||"Unknown error"}`}finally{n.value=!1}}}async function El(A,V){if(n.value||!["follow","pin"].includes(V)||!A.length||A.some(Se=>{var Ke,kt;return!p.includes(Se)||!((kt=(Ke=t.value)==null?void 0:Ke.image_model_defaults)!=null&&kt[Se])}))return;n.value=!0,u.value=null;let ae=!1;try{const Se=await H.post("/api/config/image-models",{operations:Object.fromEntries(A.map(Ke=>[Ke,V])),expected_revision:t.value.image_model_revision});ae=!0;for(const Ke of A){const kt=`image.openai.${Ke}`,qs=X(e.value,kt),ta=X(Se.config,kt),Pn=on=>!Object.hasOwn(on,"image")||!Kn(X(on,kt),qs)?on:Fe(on,kt.split("."),ta);k.value=Pn(k.value),T.value=T.value.map(Pn),P.value=P.value.map(Pn),e.value=Fe(e.value,kt.split("."),ta)}t.value={...t.value,image_model_defaults:Se.image_model_defaults,image_model_revision:Se.image_model_revision},De("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(Se){u.value=`Image model operation failed: ${Se.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ai(),v.value=null}catch(Se){const Ke=`Image model status could not be refreshed: ${Se.message||"Unknown error"}`;v.value=Ke,u.value=ae?`Image model defaults were saved, but ${Ke}`:`${u.value} ${Ke}`}finally{n.value=!1}}async function fr(){var A,V;if(!(be.value||n.value)){s.value=!0,h.value=null;try{const ae=await H.get("/api/config"),Se=await Ai();e.value=ae,t.value=Se,v.value=null;const Ke=ce.value;if(Ke.some(kt=>kt.key===x.value)||(x.value=((A=Ke[0])==null?void 0:A.key)||ni[0].key),D.value){const qs=(((V=Ke.find(ta=>ta.key===x.value))==null?void 0:V.sections)||[]).find(ta=>_.value[ta]===!0);_.value=qs?{..._.value,[qs]:!0}:{}}}catch(ae){h.value=ae.message||"Unknown configuration error"}finally{s.value=!1}}}function hr(A){if(q.value||!(A.ctrlKey||A.metaKey))return;const V=A.target;V instanceof HTMLElement&&(V.matches("input, textarea, select")||V.isContentEditable)||(!A.shiftKey&&A.key.toLowerCase()==="z"?(A.preventDefault(),ke()):(A.key.toLowerCase()==="y"||A.shiftKey&&A.key.toLowerCase()==="z")&&(A.preventDefault(),Ie()))}function mr(A){D.value=A.matches}Ft(_,A=>{try{localStorage.setItem(bv,JSON.stringify(A))}catch{}},{deep:!0});let Al=!1;function vr(){Al||(Al=!0,document.addEventListener("keydown",hr))}function gr(){Al&&(Al=!1,document.removeEventListener("keydown",hr))}return Ge(()=>{var A;fr(),vr(),O=window.matchMedia("(max-width: 760px)"),mr(O),(A=O.addEventListener)==null||A.call(O,"change",mr)}),Xt(vr),Vt(gr),Vt(()=>{l.value=""}),ft(()=>{var A;l.value="",gr(),(A=O==null?void 0:O.removeEventListener)==null||A.call(O,"change",mr),L&&window.clearTimeout(L)}),{listenerConsent:i,listenerCredential:l,listenerSaving:o,listenerMessage:r,listenerError:c,saveListenerConsent:d,armKeydown:vr,disarmKeydown:gr,handleKeydown:hr,config:e,meta:t,loading:s,saving:n,error:h,toast:m,metaRefreshError:v,restartPromptOpen:E,restartScheduled:R,restartError:y,configMain:a,imageModelError:u,imageModelLeaves:p,setImageModelDefaults:El,refreshImageModelMetadata:Cl,searchQuery:g,healthFilter:b,activeCategory:x,reviewOpen:q,mobileOverflowOpen:K,warningThresholdInput:w,arrayInputs:I,healthFilters:fe,visibleCategories:ce,displayGroups:F,reviewGroups:Z,sectionCount:oe,fieldCount:W,hasChanges:be,changeCount:$e,changedSectionCount:C,hasDraftErrors:de,canUndo:ue,canRedo:G,globalFilterActive:M,reviewRestartCount:re,pendingRestartCount:Y,pendingRestartFields:B,healthCount:Ys,categoryStats:Os,selectCategory:js,selectHealthFilter:Ha,clearFilters:ws,sectionLabel:ge,sectionDescription:He,sectionFieldCount:Oe,sectionHealthCount:hs,sectionApplySummary:je,sectionApplyDetails:Qe,sectionEntries:we,fieldGroups:Le,sectionSearchHits:Ut,mcpConfigSummary:nt,fieldRuntimeCopy:se,fieldSpecificRuntimeNote:Ne,hasHonestAction:Je,runFieldAction:Lt,hasHostsCollection:he,hostsConfigSummary:xe,sectionChanged:nn,fieldChanged:Qs,isSectionExpanded:at,toggleSection:Ns,discardAllDrafts:ne,setFieldValue:dt,setNumberFieldValue:_i,numberInputValue:xi,beginInputEdit:mt,endTextInputEdit:ha,endInputEdit:zs,addWarningThreshold:Ln,removeWarningThreshold:Nn,isScalarArray:ja,addScalarArrayItem:Xs,removeScalarArrayItem:ma,fieldError:Dn,sectionHasErrors:J,undo:ke,redo:Ie,openReview:Vs,closeReview:va,mobileCancel:za,applyModeLabel:Ce,applyClass:N,compactValue:gS,formatValue:bS,structuredApplyCopy:ln,fieldId:le,fieldInputId:ye,focusField:Pe,fetchConfig:fr,saveConfig:Nt,restartOdin:ea,restartLater:At,reviewPendingRestart:ze}}},kS=/^\d{15,25}$/;function wv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const kv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=z(()=>new Set((e.excludedIds||[]).map(String))),o=z(()=>{const x=s.value.toLowerCase().trim();return(e.members||[]).filter(_=>l.value.has(String(_.id))?!1:x?u(_).toLowerCase().includes(x)||String(_.username||"").toLowerCase().includes(x)||String(_.id).includes(x):!0)}),r=z(()=>{const x=s.value.trim();return o.value.length===0&&kS.test(x)&&!l.value.has(x)?x:""}),c=z(()=>o.value.length+(r.value?1:0)),d=z(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(x){return wv(x)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const x=Math.max(c.value-1,0);n.value=Math.min(n.value+1,x)}function v(){n.value=Math.max(n.value-1,0)}function E(){const x=o.value[n.value];x?R(x):r.value&&n.value===o.value.length&&y(r.value)}function R(x){y(String(x.id))}function y(x){t("select",x),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function b(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&It(()=>{var x;return(x=i.value)==null?void 0:x.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:E,selectMember:R,selectId:y,closeOptions:g,onBlur:b}}};function Ep(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const SS={components:{DiscordUserCombobox:kv},template:`
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
  `,setup(){const e=f([]),t=f({persisted:!1,active:{state:"unknown"}}),s=f(""),a=f(!1),n=f(null);let i=null;const l=f(!0),o=f(null),r=f({}),c=f(null),d=f(null),u=f(!1),p=f(null),h=f({}),m=f([]);let v=0;const E=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),R=z(()=>JSON.stringify(c.value)!==JSON.stringify(d.value)),y=z(()=>new Map(m.value.map(ue=>[String(ue.id),ue])));function g(ue){return ue.config&&ue.config.enabled!==void 0?ue.config.enabled:!0}function b(ue){return Ep(ue,"require_mention",c.value)}function x(ue){return Ep(ue,"respond_to_bots",c.value)}function _(ue){return ue.config&&Object.keys(ue.config).length>0}function k(ue){r.value[ue]=!r.value[ue]}function S(ue){const G=ue.discord||{};return{allowed_users:[...G.allowed_users||[]],channels:[...G.channels||[]],respond_to_bots:!!G.respond_to_bots,require_mention:!!G.require_mention,ignore_bot_ids:[...G.ignore_bot_ids||[]]}}async function w({showLoading:ue=!0}={}){const G=++v;ue&&(l.value=!0),o.value=null;try{const ce=await H.get("/api/discord/guilds");G===v&&(e.value=ce)}catch(ce){G===v&&(o.value=ce.message)}finally{ue&&G===v&&(l.value=!1)}}async function I(){try{t.value=await H.get("/api/discord/connection"),n.value=null}catch(ue){n.value=ue.message}}async function $(ue,G=null){if(!a.value){a.value=!0,n.value=null;try{const ce={operation:ue};G!==null&&(ce.token=G),t.value=await H.post("/api/discord/connection",ce),ue==="credentials"&&(s.value="")}catch(ce){n.value=ce.message||"Connection update failed."}finally{a.value=!1}}}function T(){return $("credentials",s.value)}function P(){return $("connect")}function q(){return $("detach")}async function K(){l.value=!0,o.value=null;try{const[ue,G,ce]=await Promise.all([H.get("/api/discord/guilds"),H.get("/api/discord/members").catch(()=>[]),H.get("/api/config")]),me=S(ce),ve=R.value;c.value=me,ve||(d.value=JSON.parse(JSON.stringify(me))),m.value=G,e.value=ue,p.value=null}catch(ue){o.value=ue.message}finally{l.value=!1}}let D=Promise.resolve();const O=f(new Set);function L(ue,G){const ce=new Set(O.value);ce.add(ue),O.value=ce;const me=D.then(G);return D=me.catch(()=>{}),me.finally(()=>{const ve=new Set(O.value);ve.delete(ue),O.value=ve})}function te(ue,G,ce,me){const ve=(me==null?void 0:me.target)??null;return L(`guild:${ue}:${G}`,async()=>{try{await H.put("/api/discord/guild/"+ue+"/config",{[G]:ce}),await w({showLoading:!1})}catch(be){o.value=be.message,ve&&typeof ce=="boolean"&&(ve.checked=!ce)}})}function ie(ue,G,ce,me,ve){const be=(ve==null?void 0:ve.target)??null;return L(`channel:${ue}:${ce}`,async()=>{try{await H.put("/api/discord/channel/"+ue+"/config",{[ce]:me}),await w({showLoading:!1})}catch($e){o.value=$e.message,be&&typeof me=="boolean"&&(be.checked=!me)}})}function U(ue,G){return L(`channel:${ue}:clear`,async()=>{try{await H.put("/api/discord/channel/"+ue+"/config",{clear:!0}),await w({showLoading:!1})}catch(ce){o.value=ce.message}})}function Q(ue,G){const ce=String(G);if(!ue.userAutocomplete)return ce;const me=y.value.get(ce);return me?wv(me):ce}function oe(ue,G=null){const ce=String(G??h.value[ue]??"").trim();!ce||d.value[ue].includes(ce)||(d.value[ue]=[...d.value[ue],ce],h.value={...h.value,[ue]:""})}function W(ue,G){d.value[ue]=d.value[ue].filter(ce=>ce!==G)}async function fe(){if(!(!R.value||u.value)){u.value=!0,p.value=null;try{const G=(await H.put("/api/config",{discord:d.value})).discord||d.value;c.value={allowed_users:[...G.allowed_users||[]],channels:[...G.channels||[]],respond_to_bots:!!G.respond_to_bots,require_mention:!!G.require_mention,ignore_bot_ids:[...G.ignore_bot_ids||[]]},d.value=JSON.parse(JSON.stringify(c.value))}catch(ue){p.value=ue.message||"Global defaults could not be saved."}finally{u.value=!1}}}return Ge(()=>{K(),I(),i=window.setInterval(I,5e3)}),ft(()=>{i!==null&&window.clearInterval(i),i=null}),{guilds:e,loading:l,error:o,expanded:r,globalDraft:d,globalSaving:u,globalError:p,globalArrayInputs:h,globalMembers:m,globalListEditors:E,globalChanged:R,guildEnabled:g,guildMention:b,guildBots:x,hasOverride:_,toggleGuild:k,fetchAll:K,fetchGuilds:w,setGuildConfig:te,setChannelConfig:ie,clearOverride:U,mutationPending:O,globalItemLabel:Q,addGlobalItem:oe,removeGlobalItem:W,saveGlobalDefaults:fe,connection:t,connectionToken:s,connectionBusy:a,connectionError:n,saveDiscordCredentials:T,connectDiscord:P,detachDiscord:q}}},Ts=e=>e==null?e:JSON.parse(JSON.stringify(e));function TS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(_){d+=1;const k=c.then(_,_);return c=k.catch(()=>{}),k}function E(_,k){h=Ts(_),m.clear();for(const[S,w]of Object.entries(k||{}))m.set(S,Ts(w))}function R(_){const k=Ts(_),S=++u;return v(async()=>{try{await e(Ts(k)),h=Ts(k),S===u&&a(Ts(k))}catch(w){S===u&&(n(Ts(h)),r(w,{kind:"default"}))}})}function y(_,k){const S=Ts(k),w=(p.get(_)||0)+1;return p.set(_,w),v(async()=>{try{await t(_,Ts(S)),m.set(_,Ts(S)),w===p.get(_)&&i(_,Ts(S))}catch(I){w===p.get(_)&&(l(_,Ts(m.get(_)??null)),r(I,{kind:"user",uid:_}))}})}function g(_){const k=(p.get(_)||0)+1;return p.set(_,k),v(async()=>{try{await s(_),m.delete(_),k===p.get(_)&&o(_)}catch(S){k===p.get(_)&&(l(_,Ts(m.get(_)??null)),r(S,{kind:"delete",uid:_}))}})}async function b(){for(;;){const _=c;if(await _,_===c)return d}}async function x(_){for(;;){const k=await b(),S=await _();if(k===d)return S}}return{seed:E,saveDefault:R,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:x,get revision(){return d}}}const CS={components:{DiscordUserCombobox:kv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=z(()=>{const T={};for(const P of r.value)T[P.id]=P;return T});function d(T){return c.value[T]||null}function u(T,P){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...P],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...P],default_host:P[0]||"",allow_all:!0}}const p=TS({applyDefault:async T=>{const P=T.allow_all?null:T.allowed_hosts;await H.put("/api/host-access/default-policy",{allowed_hosts:P,default_host:T.default_host})},applyUser:async(T,P)=>{const q=P.allow_all?null:P.allowed_hosts;await H.put(`/api/host-access/user/${T}`,{allowed_hosts:q,default_host:P.default_host})},applyDelete:T=>H.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>_e.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const P=d(T);_e.success(`Updated access for ${P?P.display_name:T}`)},onUserRollback:(T,P)=>{const q={...l.value};P?q[T]=P:delete q[T],l.value=q},onUserDeleted:T=>{const P={...l.value};delete P[T],l.value=P},onError:(T,P)=>{var K;const q=P.uid?` ${((K=d(P.uid))==null?void 0:K.display_name)||P.uid}`:"";_e.error(`${T.message||"Failed to save"} — reverted${q}`)}});let h=0;async function m(){const T=++h;e.value=!0,t.value="";try{const P=await p.readSnapshot(()=>H.get("/api/host-access"));if(T!==h)return;s.value=P,a.value=P.available_hosts||[],n.value=P.host_descriptions||{},i.value=u(P.default_policy,a.value);const q=P.users||{},K={};for(const[D,O]of Object.entries(q))K[D]=u(O,a.value);l.value=K,p.seed(i.value,K)}catch(P){T===h&&(t.value=P.message||"Failed to fetch host access data")}finally{T===h&&(e.value=!1)}try{const P=await H.get("/api/discord/members")||[];T===h&&(r.value=P)}catch{T===h&&(r.value=[])}}const v=500,E=new Map;function R(T,P){const q=E.get(T);q&&clearTimeout(q.timer);const K={run:P,timer:null};K.timer=setTimeout(()=>{E.delete(T),P()},v),E.set(T,K)}function y(T){const P=E.get(T);P&&(clearTimeout(P.timer),E.delete(T))}function g(){for(const[T,P]of[...E])clearTimeout(P.timer),E.delete(T),P.run()}function b(){R("default",()=>p.saveDefault(i.value))}function x(T,P){i.value.allow_all=!1,P?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(q=>q!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function _(T){R(`user:${T}`,()=>{const P=l.value[T];P&&p.saveUser(T,P)})}function k(T,P,q){const K=l.value[T];K&&(K.allow_all=!1,q?K.allowed_hosts.includes(P)||K.allowed_hosts.push(P):(K.allowed_hosts=K.allowed_hosts.filter(D=>D!==P),K.default_host===P&&(K.default_host=K.allowed_hosts[0]||"")),_(T))}function S(T,P){const q=l.value[T];q&&(q.default_host=P,_(T))}function w(){o.value=!0}function I(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function $(T){const P=d(T);await Wt({title:"Remove user override",message:`Remove the host access override for ${P?P.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${T}`),await p.deleteUser(T),l.value[T]||_e.success(`Removed override for ${P?P.display_name:T}`))}return Ge(m),Vt(g),ft(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:x,getMember:d,toggleUserHost:k,setUserDefault:S,openAddUser:w,addUserById:I,deleteUser:$,flushPendingSaves:g}}},ES={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),E=f(v()),R=z(()=>["127.0.0.1","localhost","::1"].includes(E.value.address));async function y(){t.value=!0,s.value="";try{const K=await H.get("/api/hosts");e.value=K.hosts||[],o.value=K.default_host||"",r.value=!!K.tofu_enabled}catch(K){s.value=K.message}finally{t.value=!1}}async function g(){try{await H.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),_e.success("Host settings saved and published live"),await y()}catch(K){_e.error(K.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function x(){i.value=!1,E.value=v(),b()}function _(K){i.value=!0,E.value={...v(),...K},b()}async function k(){try{c.value=await H.get("/api/hosts/public-key")}catch(K){_e.error(K.message)}}async function S(K){try{const D=await H.post("/api/hosts/"+encodeURIComponent(K.alias)+"/import-legacy",{});i.value=!0,E.value={...v(),...K,trust_mode:"pinned"},b(),d.value=D.candidate_token,u.value=D.fingerprints||[],m.value=u.value.join(`
`),l.value=4,_e.info("Imported existing known_hosts trust. Test before activation.")}catch(D){_e.error(D.message)}}async function w(){try{const K=m.value.split(/\s+/).filter(Boolean),D={...E.value,expected_fingerprints:K,candidate_fingerprints:u.value},O=await H.post("/api/hosts/candidates",D);if(d.value=O.candidate_token,u.value=O.fingerprints||[],E.value.trust_mode==="tofu"&&D.candidate_fingerprints.length===0){E.value.confirm_tofu=!1,_e.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(K){_e.error(K.message)}}async function I(){var K,D;p.value=!1,h.value=null;try{const O=await H.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!O.tested,h.value=O.last_test,p.value&&(l.value=5)}catch(O){const L=(K=O.data)==null?void 0:K.last_test;L&&typeof L=="object"&&!Array.isArray(L)&&(h.value=L);const te=(D=h.value)==null?void 0:D.detail;_e.error(typeof te=="string"&&te.trim()?te:O.message)}}async function $(){try{await H.post("/api/hosts/candidates/"+d.value+"/commit",{}),_e.success("Host saved and published live"),n.value=!1,await y()}catch(K){_e.error(K.message)}}async function T(K){try{await H.post("/api/hosts/"+encodeURIComponent(K.alias)+"/enabled",{enabled:!K.enabled}),await y()}catch(D){_e.error(D.message)}}async function P(K){var D;if(await Wt("Delete host "+K.alias+"? Dependencies will block deletion.")){a.value=[];try{await H.del("/api/hosts/"+encodeURIComponent(K.alias)),await y()}catch(O){a.value=Array.isArray((D=O.data)==null?void 0:D.pending_references)?O.data.pending_references:[],_e.error(O.message)}}}async function q(K){if(await Wt("Force revoke "+K.alias+"? Remote outcomes may be unknown."))try{await H.post("/api/hosts/"+encodeURIComponent(K.alias)+"/force-revoke",{}),await y()}catch(D){_e.error(D.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:E,isLocal:R,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:g,beginAdd:x,beginEdit:_,loadKey:k,importLegacy:S,prepare:w,testConnection:I,commit:$,toggle:T,remove:P,forceRevoke:q}}},AS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=z(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=z(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(S){return S==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":S==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const S=await H.get("/api/tokens");s.value=S.tokens||[],a.value=S.available_hosts||[]}catch(S){t.value=S.message||"Failed to load tokens"}finally{e.value=!1}}function v(S){return!S||!S.trim()?[]:S.split(",").map(w=>w.trim()).filter(Boolean)}function E(S,w){const I=c.value.allowed_hosts;if(w&&!I.includes(S)&&I.push(S),!w){const $=I.indexOf(S);$>=0&&I.splice($,1)}}function R(S,w){const I=d.value.allowed_hosts;if(w&&!I.includes(S)&&I.push(S),!w){const $=I.indexOf(S);$>=0&&I.splice($,1)}}async function y(){var S;i.value=!0;try{const w=v(c.value.allowed_tools_str),I=c.value.host_mode,$=I==="none"?[]:I==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};$!==null&&(T.allowed_hosts=$),T.default_host=c.value.default_host||"";const P=await H.post("/api/tokens",T);l.value=P.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,_e.success("Token created"),await m()}catch(w){_e.error(((S=w.data)==null?void 0:S.error)||w.message||"Failed to create token")}finally{i.value=!1}}function g(S){o.value=S;const w=S.allowed_hosts;let I="default";w==null?I="default":Array.isArray(w)&&w.length===0?I="none":Array.isArray(w)&&(I="select"),d.value={username:S.username||"",tier:S.tier||"admin",label:S.label||"",host_mode:I,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:S.default_host||"",allowed_tools_str:(S.allowed_tools||[]).join(", ")}}async function b(){var S;if(o.value){r.value=!0;try{const w=v(d.value.allowed_tools_str),I=d.value.host_mode,$={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};I==="none"?$.allowed_hosts=[]:I==="select"?$.allowed_hosts=d.value.allowed_hosts:$.allowed_hosts=null,$.default_host=d.value.default_host||"",await H.put("/api/tokens/"+encodeURIComponent(o.value.user_id),$),o.value=null,_e.success("Token updated"),await m()}catch(w){_e.error(((S=w.data)==null?void 0:S.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function x(S){var I;if(await Wt({title:"Regenerate token",message:`Regenerate token for ${S.username||S.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const $=await H.post("/api/tokens/"+encodeURIComponent(S.user_id)+"/regenerate");l.value=$.token,_e.success("Token regenerated")}catch($){_e.error(((I=$.data)==null?void 0:I.error)||$.message||"Failed to regenerate")}}async function _(S){var I;if(await Wt({title:"Delete token",message:`Delete token for ${S.username||S.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await H.del("/api/tokens/"+encodeURIComponent(S.user_id)),_e.success("Token deleted"),await m()}catch($){_e.error(((I=$.data)==null?void 0:I.error)||$.message||"Failed to delete")}}async function k(){if(l.value)try{await navigator.clipboard.writeText(l.value),_e.success("Copied to clipboard")}catch{_e.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:E,toggleEditHost:R,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:x,confirmDelete:_,copyToken:k}}},RS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),IS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),OS=Object.freeze(["enabled","base_url","model","max_tokens"]),LS=Object.freeze(["enabled","model","max_tokens"]);function dr(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Ap(e){return dr(e,RS)}function Rp(e){return dr(e,IS)}function NS(e,{includeApiKey:t=!1}={}){const s=dr(e,OS);return t&&(s.api_key=e.api_key),s}function DS(e){return{timeout:e.timeout}}function PS(e,{includeApiKey:t=!1}={}){const s=dr(e,LS);return t&&(s.api_key=e.api_key),s}function MS(e){return{timeout:e.timeout}}function Gl(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const FS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna"],l=z(()=>{const J=n.value.model;return J&&!i.includes(J)?[J,...i]:i}),o=z(()=>{const J=n.value.agent_model;return J&&J!=="auto"&&!i.includes(J)?[J,...i]:i}),r={"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(J,ke)=>!!J&&!!ke&&(r[J]||[]).includes(ke),d=J=>!c(n.value.model,J)&&!(n.value.agent_reasoning_effort===""&&c(n.value.agent_model,J)),u=J=>{const ke=n.value.agent_model;return ke==="auto"?!0:!c(ke||n.value.model,J)},p=z(()=>{const J=n.value.agent_reasoning_effort;return J==="auto"?null:J||n.value.reasoning_effort}),h=J=>c(J,n.value.reasoning_effort)||n.value.agent_model===""&&c(J,p.value),m=J=>c(J,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),E=f({unavailable_reason:null}),R=z(()=>{const J=v.value.model;return J&&!i.includes(J)?[J,...i]:i});function y(J){const ke=J.target.value;v.value.enabled=ke!=="",ke!==""&&(v.value.model=ke),ne()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),x=f(null),_=f(!1),k=f(""),S=f(null),w=f(!1);let I=0;const $=z(()=>{var J;return Object.entries(((J=x.value)==null?void 0:J.models)||{}).map(([ke,Ie])=>{var Vs,va,za;return{model:ke,floor:Ie.floor,override:Ie.override,effectiveBudget:(Vs=Ie.effective)==null?void 0:Vs.effective_budget,configuredPrimaryChars:(va=Ie.configured)==null?void 0:va.primary_chars,primaryChars:(za=Ie.effective)==null?void 0:za.primary_chars,provenance:Ie.provenance,clampExpiresAt:Ie.clamp_expires_at,densityPriorMilli:Ie.density_prior_milli,densityScope:Ie.density_scope,workloadCalibration:Ie.workload_calibration}})}),T=z(()=>{var J;return((J=x.value)==null?void 0:J.clamps)||[]}),P=z(()=>{var J,ke;return((ke=(J=x.value)==null?void 0:J.models)==null?void 0:ke[n.value.model])||null}),q=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),K=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),D=f(!1),O=f(!1),L=f(!1),te=f(!1),ie=f(!1),U=f(!1),Q=f(!1),oe=f({configured:null}),W=f(!1),fe=f([]),ue=f(""),G=f(!1),ce=f(!1),me=f({configured:null}),ve=f(!1),be=f([]),$e=f(""),C=f(!1),M=f(!1),j=f(!0),de=f(""),F=f({configured:null,accounts:[]}),Z=f(null),re=f(null),B=f(""),Y=f(null),ee=f(!1),pe=f(null),he=f(null),xe=f("");let Oe=null;function ge(J,ke="success"){_e(J,ke==="error"?"error":"success")}function He(J){if(!J)return"?";const ke=J/(1024*1024*1024);return ke>=1?ke.toFixed(1)+" GB":(J/(1024*1024)).toFixed(0)+" MB"}function Ue(J){return Number.isFinite(Number(J))?Number(J).toLocaleString():"—"}function je(J){return J==null?"automatic (model-derived)":Number(J).toLocaleString()+" characters"}function Qe(J){const ke=new Date(J);return Number.isNaN(ke.getTime())?"unknown":ke.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function ot(J){return typeof J=="string"&&J.length>12?J.slice(0,8)+"…"+J.slice(-4):J}function nt(J){return typeof J!="number"||!Number.isFinite(J)?"—":(J/1e3).toFixed(2)}function X(J){return J==="temporary learned clamp"?"is-clamp":J==="override"?"is-override":"is-built-in"}function we(J){const ke=n.value.context_budget_overrides[J.model];return J.floor!=null&&Number.isFinite(Number(ke))&&Number(ke)>J.floor}function Ae(J,ke){const Ie={...n.value.context_budget_overrides};ke.target.value===""?delete Ie[J]:Ie[J]=Number(ke.target.value),n.value.context_budget_overrides=Ie,w.value=!0}function Le(J){n.value.context_utilization=J.target.value===""?"":Number(J.target.value),w.value=!0}function se(J){const ke={...n.value.context_budget_overrides};delete ke[J],n.value.context_budget_overrides=ke,w.value=!0}async function Ee(){e.value=!0,await Promise.all([Ne(),Lt(),Os(),We(),Je()]),e.value=!1}async function Ne({preserveBasic:J=!1,preserveAdvanced:ke=!1}={}){try{const Ie=await H.get("/api/llm/status");t.value=Ie,s.value=!1,a.value=Ie.active_provider||"codex",Ie.codex&&!ks.pending()&&(J||(n.value.enabled=Ie.codex.enabled,n.value.model=Ie.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ie.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ie.codex.agent_reasoning_effort||"",n.value.agent_model=Ie.codex.agent_model||""),ke||(n.value.request_timeout_seconds=Ie.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ie.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ie.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ie.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ie.codex.context_compression||{}},!w.value&&!L.value&&(n.value.context_budget_overrides={...Ie.codex.context_budget_overrides||{}},n.value.context_utilization=Ie.codex.context_utilization??n.value.context_utilization))),Ie.ollama&&!Te.pending()&&(J||(q.value.enabled=Ie.ollama.enabled,q.value.base_url=Ie.ollama.base_url||"",q.value.model=Ie.ollama.model||"",q.value.max_tokens=Ie.ollama.max_tokens||4096),ke||(q.value.timeout=Ie.ollama.timeout??q.value.timeout)),Ie.kimi&&!Fe.pending()&&(J||(K.value.enabled=Ie.kimi.enabled,K.value.model=Ie.kimi.model||"",K.value.max_tokens=Ie.kimi.max_tokens||4096),ke||(K.value.timeout=Ie.kimi.timeout??K.value.timeout)),Ie.auxiliary&&(E.value=Ie.auxiliary,ne.pending()||(v.value.enabled=Ie.auxiliary.enabled,v.value.model=Ie.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Je(){const J=++I;_.value=!0,k.value="";try{const ke=await H.get("/api/context/windows");if(J!==I)return;x.value=ke,!L.value&&!w.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(ke.models||{}).filter(([,Ie])=>Ie.override!=null).map(([Ie,Vs])=>[Ie,Vs.override])),n.value.context_utilization=ke.utilization??n.value.context_utilization)}catch(ke){J===I&&(k.value=ke.message||"Failed to load context budgets")}finally{J===I&&(_.value=!1)}}async function Lt(){try{if(oe.value=await H.get("/api/ollama/status"),W.value=!1,oe.value.model&&(ue.value=oe.value.model),oe.value.configured)try{const J=await H.get("/api/ollama/models");fe.value=J.models||[]}catch{fe.value=[]}else if(q.value.base_url)try{const J=await H.post("/api/ollama/probe-models",{base_url:q.value.base_url});fe.value=J.models||[]}catch{fe.value=[]}}catch{W.value=!0}}async function We(){j.value=!0,de.value="";try{F.value=await H.get("/api/codex/status")}catch(J){de.value=J.message||"Failed to fetch Codex status"}finally{j.value=!1}}async function Ut(){const J=t.value?t.value.active_provider:"codex";Q.value=!0;try{const ke=await H.post("/api/llm/switch",{provider:a.value});ke.error?(a.value=J,ge(ke.error,"error")):(ge("Switched to "+a.value+" ("+ke.model+")"),await Ee())}catch(ke){a.value=J,ge(ke.message||"Switch failed","error")}finally{Q.value=!1}}async function Bt(){G.value=!0;try{const J=await H.post("/api/ollama/reload");ge(J.configured?"Ollama reloaded":J.reason||"Ollama not configured",J.configured?"success":"error"),await Ee()}catch(J){ge(J.message||"Reload failed","error")}finally{G.value=!1}}async function hs(){ce.value=!0;try{await H.post("/api/ollama/model",{model:ue.value}),ge("Model set to "+ue.value),await Ee()}catch(J){ge(J.message||"Failed","error")}finally{ce.value=!1}}async function Ys(){const J=q.value.base_url;if(!J){ge("Enter a base URL first","error");return}U.value=!0;try{const ke=await H.post("/api/ollama/probe-models",{base_url:J});fe.value=ke.models||[],fe.value.length?(ge(fe.value.length+" model(s) found"),!q.value.model&&fe.value.length&&(q.value.model=fe.value[0].name)):ge("No models found at "+J,"error")}catch(ke){ge(ke.message||"Could not reach Ollama","error")}finally{U.value=!1}}async function Os(){try{if(me.value=await H.get("/api/kimi/status"),ve.value=!1,me.value.model&&($e.value=me.value.model),me.value.configured)try{const J=await H.get("/api/kimi/models");be.value=J.models||[]}catch{be.value=[]}}catch{ve.value=!0}}async function nn(){C.value=!0;try{const J=await H.post("/api/kimi/reload");ge(J.configured?"Kimi reloaded":J.reason||"Kimi not configured",J.configured?"success":"error"),await Ee()}catch(J){ge(J.message||"Reload failed","error")}finally{C.value=!1}}async function Qs(){M.value=!0;try{await H.post("/api/kimi/model",{model:$e.value}),ge("Model set to "+$e.value),await Ee()}catch(J){ge(J.message||"Failed","error")}finally{M.value=!1}}async function js(){if(L.value){ks();return}L.value=!0;const J=Ap(n.value);try{await H.put("/api/llm/codex/config",J),ge("Codex config saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),We()])}catch(ke){ge(ke.message||"Failed","error");const Ie=JSON.stringify(Ap(n.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:Ie,preserveAdvanced:!0}),We()])}finally{L.value=!1}}async function Ha(){if(L.value)return;L.value=!0;const J=Rp(n.value);try{await H.put("/api/llm/codex/config",J),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:J.context_budget_overrides,context_utilization:J.context_utilization})&&(w.value=!1),ge("Codex advanced settings saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),We(),Je()])}catch(ke){ge(ke.message||"Failed","error");const Ie=JSON.stringify(Rp(n.value))!==JSON.stringify(J);await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:Ie}),We(),Je()])}finally{L.value=!1}}async function ws(){if(te.value){Te();return}te.value=!0;try{const J=D.value?q.value.api_key:null,ke=NS(q.value,{includeApiKey:J!==null});await H.put("/api/llm/ollama/config",ke),ge("Ollama config saved"),J!==null&&q.value.api_key===J&&(q.value.api_key="",D.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(J){ge(J.message||"Failed","error")}finally{te.value=!1}}async function fa(){if(!te.value){te.value=!0;try{await H.put("/api/llm/ollama/config",DS(q.value)),ge("Ollama timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Lt()])}catch(J){ge(J.message||"Failed","error")}finally{te.value=!1}}}async function Ls(){if(ie.value){Fe();return}ie.value=!0;try{const J=O.value?K.value.api_key:null,ke=PS(K.value,{includeApiKey:J!==null});await H.put("/api/llm/kimi/config",ke),ge("Kimi config saved"),J!==null&&K.value.api_key===J&&(K.value.api_key="",O.value=!1),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Os()])}catch(J){ge(J.message||"Failed","error")}finally{ie.value=!1}}async function at(){if(!ie.value){ie.value=!0;try{await H.put("/api/llm/kimi/config",MS(K.value)),ge("Kimi timeout saved"),await Promise.all([Ne({preserveBasic:!0,preserveAdvanced:!0}),Os()])}catch(J){ge(J.message||"Failed","error")}finally{ie.value=!1}}}async function Ns(){if(g.value){ne();return}g.value=!0;try{await H.put("/api/llm/auxiliary/config",v.value),ge("Auxiliary config saved"),await Ne()}catch(J){ge(J.message||"Failed","error"),await Ne()}finally{g.value=!1}}const ks=Gl(js),ne=Gl(Ns),Te=Gl(ws),Fe=Gl(Ls),et=()=>(ks.cancel(),js()),dt=()=>(Te.cancel(),ws()),mt=()=>(Fe.cancel(),Ls()),ha=()=>Ha(),zs=()=>fa(),xi=()=>at();async function _i(J){const ke=J.account_key+":"+J.model;S.value=ke;try{const Ie=await H.post("/api/context/windows/clear",{account_key:J.account_key,model:J.model});ge(Ie.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Je()}catch(Ie){ge(Ie.message||"Failed to clear clamp","error"),await Je()}finally{S.value=null}}async function Ln(J){try{await H.post("/api/codex/account/"+J+"/activate"),ge("Active account switched"),await We()}catch(ke){ge(ke.message||"Failed","error")}}async function Nn(J){Z.value=J;try{await H.post("/api/codex/account/"+J+"/refresh"),ge("Token refreshed"),await We()}catch(ke){ge(ke.message||"Refresh failed","error")}finally{Z.value=null}}function ln(J,ke){re.value=J,B.value=ke||""}async function ja(J){try{await H.put("/api/codex/account/"+J+"/label",{label:B.value}),ge("Label updated"),re.value=null,await We()}catch(ke){ge(ke.message||"Failed","error")}}async function Xs(J,ke){if(await Wt({title:"Delete Codex account",message:`Delete ${ke||"account #"+(J+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await H.del("/api/codex/account/"+J),ge("Deleted. Pool reloaded."),await We()}catch(Vs){ge(Vs.message||"Failed","error")}}async function ma(){ee.value=!0;try{const J=await H.post("/api/codex/device-code");pe.value=J,Y.value="pending",Ss(J)}catch(J){ge(J.message||"Failed","error")}finally{ee.value=!1}}async function Ss(J){Oe={cancelled:!1};const ke=Oe;try{const Ie=await H.post("/api/codex/device-poll",{device_auth_id:J.device_auth_id,user_code:J.user_code,interval:J.interval});if(ke.cancelled)return;he.value=Ie,Y.value="success",await Ee()}catch(Ie){if(ke.cancelled)return;xe.value=Ie.message||"Device login failed",Y.value="error"}}function Dn(){Oe&&(Oe.cancelled=!0),Y.value=null,pe.value=null}return Ge(Ee),ft(()=>{Oe&&(Oe.cancelled=!0),ks.cancel(),ne.cancel(),Te.cancel(),Fe.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:Q,advancedOpen:b,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:E,auxModelOptions:R,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:ne,ollamaForm:q,kimiForm:K,savingCodex:L,savingOllama:te,savingKimi:ie,probingOllama:U,ollamaKeyDirty:D,kimiKeyDirty:O,fetchCodexStatus:We,ollamaStatus:oe,ollamaStatusLoadFailed:W,ollamaModels:fe,ollamaSelectedModel:ue,reloading:G,settingModel:ce,kimiStatus:me,kimiStatusLoadFailed:ve,kimiModels:be,kimiSelectedModel:$e,reloadingKimi:C,settingKimiModel:M,codexLoading:j,codexError:de,codexData:F,refreshing:Z,editingLabel:re,labelValue:B,contextWindows:x,contextWindowsLoading:_,contextWindowsError:k,contextBudgetRows:$,activeClampRows:T,activeContextBudget:P,clearingClamp:S,contextPolicyDirty:w,deviceState:Y,deviceLoading:ee,deviceInfo:pe,deviceResult:he,deviceError:xe,fetchAll:Ee,fetchLLMStatus:Ne,fetchOllamaStatus:Lt,fetchKimiStatus:Os,switchProvider:Ut,reloadOllama:Bt,setOllamaModel:hs,reloadKimi:nn,setKimiModel:Qs,probeOllamaModels:Ys,saveCodexConfig:js,saveOllamaConfig:ws,saveKimiConfig:Ls,saveCodexAdvancedConfig:Ha,saveOllamaAdvancedConfig:fa,saveKimiAdvancedConfig:at,saveCodexConfigDebounced:ks,saveOllamaConfigDebounced:Te,saveKimiConfigDebounced:Fe,saveCodexConfigNow:et,saveOllamaConfigNow:dt,saveKimiConfigNow:mt,saveCodexAdvancedConfigNow:ha,saveOllamaAdvancedConfigNow:zs,saveKimiAdvancedConfigNow:xi,activateAccount:Ln,refreshAccount:Nn,startEditLabel:ln,saveLabel:ja,deleteAccount:Xs,startDeviceLogin:ma,cancelDeviceLogin:Dn,formatSize:He,fetchContextWindows:Je,clearContextClamp:_i,setContextOverride:Ae,setContextUtilization:Le,resetContextOverride:se,overrideAboveFloor:we,formatCount:Ue,formatContextCeiling:je,formatExpiry:Qe,shortAccountKey:ot,provenanceClass:X,formatDensity:nt}}},Ip={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function $S(e){return Ip[e]||Ip[(e||"").toLowerCase()]||"text-gray-400"}const US={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=z(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((k,S)=>k+Number(S||0),0)}),u=f(""),p=f(0),h=f([]),m=z(()=>h.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function R(){var I;const _=await Promise.allSettled(v.map($=>H.get($.path))),k=$=>_[$].status==="fulfilled"?_[$].value:null;t.value=k(0)||{};const S=k(1);s.value=Array.isArray(S)?S:S&&S.subsystems||[],a.value=k(2)||{},n.value=k(3)||{},i.value=k(4),l.value=k(5),o.value=k(6),r.value=k(7),c.value=k(8);const w=_.filter($=>$.status==="rejected");if(h.value=_.flatMap(($,T)=>{var P;return $.status==="rejected"?[{...v[T],reason:((P=$.reason)==null?void 0:P.message)||"request failed"}]:[]}),p.value=h.value.length,w.length===_.length){const $=(I=w[0])==null?void 0:I.reason;u.value=($==null?void 0:$.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",R()}let g=!1;function b(){g||(g=!0,R(),E||(E=setInterval(R,3e4)))}function x(){g&&(g=!1,E&&(clearInterval(E),E=null))}return Ge(b),Xt(b),Vt(x),ft(x),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:$S,formatAgeSeconds:ak}}},BS=1e4,Op=3e4;function Ri(e,t){return Math.max(0,e-t)}function Br(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const HS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],jS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const O=++p;a.value=!0;try{const L=await H.get("/api/turn-state/turns?limit=100");if(O!==p)return;t.value=L.availability,e.value=L.availability==="available"?L.data:null,s.value=null,n.value=Date.now()}catch(L){if(O!==p)return;s.value=L.message||"Turn-state read failed",L.status===503&&(t.value="unavailable")}O===p&&(a.value=!1)}async function v(){const O=++h;r.value=!0;try{const L=await H.get("/api/turn-state/capacity-breakers");if(O!==h)return;l.value=L.availability,i.value=L.availability==="available"?L.data:null,o.value=null,c.value=Date.now()}catch(L){if(O!==h)return;o.value=L.message||"Breaker read failed",L.status===503&&(l.value="unavailable")}O===h&&(r.value=!1)}function E(){m(),v()}const R=z(()=>e.value!==null&&Ri(d.value,n.value)>Op),y=z(()=>i.value!==null&&Ri(d.value,c.value)>Op),g=z(()=>R.value||y.value),b=z(()=>Math.round(Ri(d.value,n.value)/1e3)),x=z(()=>Math.round(Ri(d.value,c.value)/1e3));function _(O){return Br(O,d.value/1e3)}function k(O){return HS[_(O)]}const S=z(()=>{var te;const O=[...((te=e.value)==null?void 0:te.turns)||[]],L=d.value/1e3;return O.sort((ie,U)=>Br(ie,L)-Br(U,L)||(U.last_progress_at||0)-(ie.last_progress_at||0))});function w(O){return O.state==="closed"?"badge-success":O.state==="probing"?"badge-warning":"badge-danger"}function I(O){if(O.state==="closed")return"—";const L=Ri(d.value,c.value)/1e3,te=Math.max(0,(O.cooldown_remaining_seconds||0)-L);return te>0?`${Math.ceil(te)}s`:O.state==="probing"?"probe in flight":"probe eligible"}function $(O){if(!O)return"";const L=Math.max(0,Math.round(d.value/1e3-O));if(L<90)return`${L}s ago`;const te=Math.round(L/60);return te<90?`${te}m ago`:`${Math.round(te/60)}h ago`}let T=null,P=null,q=!1;function K(){q||(q=!0,E(),T=setInterval(E,BS),u=setInterval(()=>{d.value=Date.now()},1e3),P=st.onReconnected(E))}function D(){q&&(q=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),P&&(P(),P=null))}return Ge(K),Xt(K),Vt(D),ft(D),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:R,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:x,sortedTurns:S,priorityOf:_,priorityBadge:k,breakerBadge:w,cooldownLabel:I,ageLabel:$,fetchTurns:m,fetchBreakers:v,refreshAll:E,arm:K,disarm:D}}},zS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await H.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Wt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await H.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Lp=e=>JSON.parse(JSON.stringify(e)),VS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),qS={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(D,O)=>p&&h===D&&H.token===O,E=D=>"computer-provisioning-"+D.key,R=D=>D===null?"Unset":D===""?"Empty":JSON.stringify(D),y=D=>{const O=n.value[D.key];return D.type==="array"?String(O||"").split(/\r?\n/).map(L=>L.trim()).filter(Boolean):["integer","number"].includes(D.type)?O===""||O==null?null:Number(O):O},g=z(()=>s.value.map(D=>({...D,value:y(D)})).filter(D=>!VS(D.value,a.value[D.key]))),b=z(()=>s.value.filter(D=>D.pending_restart).map(D=>D.label)),x=z(()=>s.value.some(D=>D.apply_state==="unknown")),_=z(()=>{const D={};for(const O of s.value){const L=y(O),te=O.constraints||{};["integer","number"].includes(O.type)&&(L===null&&!O.nullable?D[O.key]="A number is required.":L!==null&&(!Number.isFinite(L)||O.type==="integer"&&!Number.isInteger(L)||te.minimum!=null&&L<te.minimum||te.maximum!=null&&L>te.maximum)&&(D[O.key]="Enter a number within the allowed range.")),O.key==="monitor_names"&&(L.length>16||new Set(L).size!==L.length||L.some(ie=>!/^[A-Za-z0-9_.-]{1,64}$/.test(ie)))&&(D[O.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return D}),k=z(()=>Object.keys(_.value).length>0);function S(D,O){n.value[D.key]=O,u.value=""}function w(){n.value=Object.fromEntries(s.value.map(D=>[D.key,D.type==="array"?a.value[D.key].join(`
`):a.value[D.key]])),r.value=!1}async function I(D,O){const[L,te]=await Promise.all([H.get("/api/config"),H.get("/api/config/meta")]);if(!v(D,O))return!1;const ie=(te.fields||[]).filter(U=>/^computer\.[^.]+$/.test(U.path)&&U.path!=="computer.enabled"&&U.sensitivity==="public"&&U.apply_mode==="restart");if(!L.computer||!ie.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=ie.map(U=>({...U,key:U.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(U=>[U.key,Lp(L.computer[U.key])])),w(),m=O,i.value=!0,c.value=!1,!0}async function $(){if(!p||l.value||o.value)return;const D=++h,O=H.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await I(D,O)}catch(L){v(D,O)&&(c.value=!0,d.value=L.message||"Could not load provisioning. No changes were sent.")}finally{v(D,O)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!k.value&&(r.value=!0)}async function P(){if(!p||!i.value||!r.value||o.value||l.value||c.value||k.value||!g.value.length)return;if(m!==H.token){K(),q();return}const D={computer:Object.fromEntries(g.value.map(ie=>[ie.key,Lp(ie.value)]))},O=h,L=H.token;o.value=!0,d.value="",u.value="";let te=!1;try{if(await H.put("/api/config",D),te=!0,!v(O,L))return;await I(O,L)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(ie){v(O,L)&&(c.value=!0,r.value=!1,d.value=te?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${ie.status===400?": "+ie.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(O,L)&&(o.value=!1)}}function q(){p||(p=!0,$())}function K(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(q),Xt(q),Vt(K),ft(K),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:x,changes:g,validation:_,invalid:k,fieldId:E,format:R,edit:S,discard:w,load:$,openReview:T,save:P}}},GS={components:{ComputerProvisioning:qS},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),v=f(""),E=f(!1),R=f(Date.now()),y=f(""),g=f(null);let b=0,x=null,_=!1,k=H.token,S=0,w=null,I=null,$=!1;const T=B=>B===!0?"Enabled":B===!1?"Disabled":"Unknown",P=z(()=>{var B;return((B=e.value.backend)==null?void 0:B.environment)==="existing_session"}),q=z(()=>{var Y;const B=Date.parse(((Y=e.value.accessibility)==null?void 0:Y.checked_at)||"");return c.value&&Number.isFinite(B)&&R.value-B<15e3&&R.value>=B-5e3}),K=z(()=>{var B;return q.value?T((B=e.value.accessibility)==null?void 0:B.enabled):"Unknown / not current"}),D=z(()=>{var B;return q.value?((B=e.value.accessibility)==null?void 0:B.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),O=z(()=>Object.entries(e.value.input_limits||{}).filter(([,B])=>typeof B=="number"&&Number.isFinite(B)).map(([B,Y])=>`${B}: ${Y}`).join(", ")),L=z(()=>{var Y;const B=(Y=e.value.application_provenance)==null?void 0:Y.script_identity;return typeof B=="string"?B:!B||typeof B!="object"?"Not observed":`${B.interpreter_basename||"Unknown interpreter"}; argv digest ${B.argv_digest||"not recorded"}; ${B.verified===!0?"verified":"not verified"}`}),te=z(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(B=>B&&typeof B.id=="string"&&typeof B.label=="string"&&["supported","capture_only"].includes(B.input)).slice(0,16):[]),ie=z(()=>{const B=e.value.restart_required;return Array.isArray(B)?B.length?B.join(", "):"None reported":B===!0?"Pending; restart required":B===!1?"None reported":"Unknown"}),U=z(()=>{var Y,ee;const B=Date.parse(((Y=m.value)==null?void 0:Y.captured_at)||"");return Number.isFinite(B)&&R.value<B+Math.min(1e4,((ee=m.value)==null?void 0:ee.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Q(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function oe(){b++,Q(),g.value=null,c.value=!1,w==null||w.abort(),w=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function W(B,Y){return _&&B===b&&Y===H.token}function fe(){return _&&c.value&&I===H.token&&Date.now()-u.value<15e3}function ue(B,Y="mutation"){var pe,he;oe(),$=!0,p.value="";const ee=B.status||(B.name==="AuthError"?401:0);[401,403,404].includes(ee)?(u.value=0,I=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:ee===503?"unavailable":"unknown"}),o.value=ee===401||ee===403||ee===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":ee===410?"Evidence or artifact expired. Observe or prepare the export again.":Y==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":Y==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",Y==="mutation"&&![401,403,404].includes(ee)&&typeof((pe=B.data)==null?void 0:pe.code)=="string"&&/^[a-z_]{1,64}$/.test(B.data.code)&&typeof((he=B.data)==null?void 0:he.error)=="string"&&(o.value=B.data.error.slice(0,512),B.data.outcome==="not_applied"&&B.data.next_action==="repair_provisioning"&&typeof B.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=B.data.remedy.slice(0,1024)))}async function G(){if(t.value||r.value||a.value||n.value||d.value||!_)return;const B=b,Y=H.token;t.value=!0,S=Date.now();const ee=new AbortController;w=ee;try{const pe=await H.get("/api/computer",{signal:ee.signal});if(!W(B,Y))return;ce(pe)}catch(pe){W(B,Y)&&ue(pe,"read")}finally{w===ee&&(w=null,t.value=!1)}}function ce(B,Y=""){if(!B||typeof B!="object"||typeof B.state!="string"||typeof B.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==B.session_id||e.value.generation!=null&&e.value.generation!==B.generation||e.value.session_generation!=null&&e.value.session_generation!==B.session_generation)&&oe(),e.value=B,u.value=Date.now(),I=H.token,c.value=!(r.value&&Y!=="toggle")&&!(a.value&&Y!=="stop")&&!(n.value&&Y!=="pause")&&!(d.value&&Y!=="recovery"),o.value="",p.value="",$=!c.value}async function me(B){if(!fe()||r.value||a.value||n.value||d.value)return;oe();const Y=b,ee=H.token;r.value=!0;let pe=!1;try{if(await H.post("/api/computer/enabled",{enabled:B}),pe=!0,!W(Y,ee))return;const he=await H.get("/api/computer");W(Y,ee)&&ce(he,"toggle")}catch(he){W(Y,ee)&&ue(he,pe?"acknowledged":"mutation")}finally{r.value=!1}}async function ve(B){if(!_||!["pause","stop"].includes(B)||(B==="stop"?a.value:n.value))return;oe();const Y=b,ee=H.token,pe=B==="stop"?a:n;pe.value=!0;let he=!1;try{if(await H.post("/api/computer/"+B,{}),he=!0,W(Y,ee)){const xe=await H.get("/api/computer");W(Y,ee)&&ce(xe,B)}}catch(xe){W(Y,ee)&&ue(xe,he?"acknowledged":"mutation")}finally{pe.value=!1}}async function be(){var pe;if(!fe()||d.value||((pe=e.value.backend)==null?void 0:pe.native_backend)!=="hyprland")return;const B={session_id:e.value.session_id,generation:e.value.session_generation};if(!B.session_id||!Number.isInteger(B.generation))return;oe();const Y=b,ee=H.token;d.value=!0;try{const he=await H.post("/api/computer/release_owned_input",B);W(Y,ee)&&ce(he,"recovery")}catch(he){W(Y,ee)&&ue(he,"mutation")}finally{d.value=!1}}async function $e(){return M(!1)}async function C(){return M(!0)}async function M(B){var Oe;if(!fe()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const Y={session_id:e.value.session_id,generation:e.value.session_generation};if(!Y.session_id||!Number.isInteger(Y.generation))return;if(B){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+Y.session_id)return;Y.acknowledgment=h.value}const ee=B?((Oe=e.value.recovery)==null?void 0:Oe.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";oe();const pe=b,he=H.token;d.value=!0;let xe=!1;try{const ge=await H.post("/api/computer/"+ee,Y);xe=!0,W(pe,he)&&ce(ge,"recovery")}catch(ge){W(pe,he)&&ue(ge,xe?"acknowledged":"mutation")}finally{d.value=!1}}async function j(){var ee;if(!fe()||s.value||!e.value.available)return;Q(),E.value=!1;const B=b,Y=H.token;s.value=!0;try{const pe=await H.post("/api/computer/observe",{});if(!W(B,Y))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((ee=pe.frame)==null?void 0:ee.evidence_id)||""))throw new Error("Invalid evidence");const he=await H.getBlob("/api/computer/evidence/"+pe.frame.evidence_id);if(!W(B,Y))return;if(!["image/png","image/jpeg"].includes(he.type)||he.size>2097152||!Number.isFinite(Date.parse(pe.frame.expires_at))||Date.parse(pe.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=pe.frame,v.value=URL.createObjectURL(he),o.value=""}catch(pe){W(B,Y)&&ue(pe)}finally{B===b&&(s.value=!1)}}async function de(){if(!fe()||i.value||!e.value.available)return;g.value=null;const B=b,Y=H.token;i.value=!0;try{const ee=await H.post("/api/computer/export",{name:y.value});W(B,Y)&&(g.value=ee,o.value="")}catch(ee){W(B,Y)&&ue(ee)}finally{B===b&&(i.value=!1)}}async function F(){if(!fe()||l.value||!g.value)return;const B=b,Y=H.token,ee=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((ee==null?void 0:ee.artifact_id)||""))throw new Error("Invalid export");const pe=await H.getBlob("/api/computer/download/"+ee.artifact_id);if(!W(B,Y))return;const he=URL.createObjectURL(pe),xe=document.createElement("a");xe.href=he,xe.download=ee.name,xe.click(),setTimeout(()=>URL.revokeObjectURL(he),1e3)}catch(pe){W(B,Y)&&ue(pe)}finally{B===b&&(l.value=!1)}}function Z(){_||(k!==H.token&&(k=H.token,oe(),u.value=0,I=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,G(),x=setInterval(()=>{R.value=Date.now(),k!==H.token&&(k=H.token,oe(),u.value=0,I=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&R.value-u.value>=15e3&&oe(),m.value&&Date.parse(m.value.expires_at)<=R.value&&(Q(),E.value=!0),g.value&&Date.parse(g.value.expires_at)<=R.value&&(g.value=null),!$&&R.value-S>=5e3&&G()},500))}function re(){_=!1,clearInterval(x),x=null,oe(),c.value=!1}return Ge(Z),Xt(Z),Vt(re),ft(re),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:E,freshness:U,name:y,artifact:g,refresh:G,control:ve,observe:j,clearFrame:Q,exportFile:de,download:F,toggling:r,adminReady:c,enabledLabel:T,restartSettings:ie,setEnabled:me,recovering:d,recover:$e,reconcile:C,releaseOwnedInput:be,reconciliationAck:h,applicationProfiles:te,attached:P,scriptIdentity:L,inputLimits:O,accessibilityLabel:K,accessibilityDetail:D}}},Sv=[{id:"health",label:"Health",component:Yk},{id:"resources",label:"Resources",component:Qk},{id:"logs",label:"Logs",component:dS},{id:"config",label:"Config",component:wS},{id:"discord",label:"Discord",component:SS},{id:"hosts",label:"Hosts",component:ES},{id:"host-access",label:"Host Access",component:CS},{id:"api-tokens",label:"API Tokens",component:AS},{id:"llm",label:"LLM Config",component:FS},{id:"internals",label:"Internals",component:US},{id:"turn-state",label:"Turn State",component:jS},{id:"computer",label:"Computer",component:GS},{id:"update",label:"Update",component:zS}],WS={components:{TabbedPage:rr},setup(){return{tabs:Sv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Wl=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),KS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Wl("Operations","operations","/operations",hv),...Wl("History","history","/history",mv),...Wl("Capabilities","capabilities","/capabilities",vv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Wl("System","system","/system",Sv)],gs=an({open:!1,query:"",selected:0});function Np(){gs.query="",gs.selected=0,gs.open=!0}function Hr(){gs.open=!1}function JS(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const ZS={setup(){const e=lv(),t=f(null),s=z(()=>{const i=gs.query.trim().toLowerCase();return KS.map(l=>({...l,_score:JS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ft(()=>gs.open,async i=>{var l;i&&(await It(),(l=t.value)==null||l.focus())}),Ft(()=>gs.query,()=>{gs.selected=0});function a(i){Hr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Hr();return}if(i.key==="ArrowDown")i.preventDefault(),gs.selected=Math.min(gs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),gs.selected=Math.max(gs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[gs.selected];l&&a(l)}}return{state:gs,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Hr}},template:`
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
  `},Ac={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ac));const YS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>oi("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[oi("path",{d:Ac[e.name]||Ac.info})])}},QS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Dp(e){return[...e.querySelectorAll(QS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const XS={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Dp(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Dp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},e1={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=z(()=>{const ie=e.value.uptime_seconds||0,U=Math.floor(ie/86400),Q=Math.floor(ie%86400/3600),oe=Math.floor(ie%3600/60),W=[];return U>0&&W.push(`${U}d`),Q>0&&W.push(`${Q}h`),(W.length===0||U===0&&Q===0)&&W.push(`${oe}m`),W.join(" ")}),m=z(()=>{const ie=e.value.uptime_seconds||0;return 125.66*(1-Math.min(ie/86400,1))}),v=z(()=>{const ie=e.value;return[{label:"Guilds",value:ie.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:ie.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:ie.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${ie.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:ie.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:ie.loop_count>0?"text-green-400":"",highlight:ie.loop_count>0},{label:"Agents",value:ie.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:ie.agent_count>0?`${ie.agent_count} total`:"",subColor:"text-gray-500",highlight:(ie.agent_running??0)>0},{label:"Processes",value:ie.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:ie.process_count>0?`${ie.process_count} total`:"",subColor:"text-gray-500",highlight:(ie.process_running??0)>0},{label:"Schedules",value:ie.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(ie.schedule_failing>0?`${ie.schedule_failing} failing`:"")+(ie.schedule_failing>0&&ie.schedule_paused>0?", ":"")+(ie.schedule_paused>0?`${ie.schedule_paused} paused`:"")||void 0,subColor:ie.schedule_failing>0?"text-red-400":"text-yellow-400",color:ie.schedule_failing>0?"text-red-400":"",highlight:ie.schedule_failing>0},{label:"Users",value:ie.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),E=z(()=>{const ie=e.value,U=[];return U.push({label:"Bot",status:ie.status==="online"?"ok":"warn",detail:ie.status==="online"?"Online":"Starting"}),(ie.schedule_failing||0)>0?U.push({label:"Schedules",status:"error",detail:`${ie.schedule_failing} failing`}):(ie.schedule_count||0)>0&&U.push({label:"Schedules",status:"ok",detail:`${ie.schedule_count} configured`}),(ie.loop_count||0)>0&&U.push({label:"Loops",status:"ok",detail:`${ie.loop_count} active`}),(ie.agent_running||0)>0&&U.push({label:"Agents",status:"ok",detail:`${ie.agent_running} running`}),(ie.process_running||0)>0&&U.push({label:"Processes",status:"ok",detail:`${ie.process_running} running`}),U});async function R(){try{e.value=await H.get("/api/status"),s.value=null}catch(ie){s.value=ie.message}finally{t.value=!1}}let y=0,g=0,b=0,x=0;function _(ie,U){const Q=new Set;return[...U,...ie].filter(oe=>{const W=oe._hmac||JSON.stringify([oe.timestamp,oe.tool_name,oe.user_id,oe.result_summary,oe.error]);return Q.has(W)?!1:(Q.add(W),!0)})}async function k(){const ie=++y,U=b;n.value=!0;try{const Q=await H.get("/api/audit?limit=10");if(ie!==y)return;const oe=U===b?[]:a.value.filter(W=>(W._liveEpoch||0)>U);a.value=_(Q,oe).slice(0,10),c.value=oe.length}catch{}ie===y&&(n.value=!1)}async function S(){const ie=++g,U=x;l.value=!0;try{const Q=await H.get("/api/audit?error_only=1&limit=5");if(ie!==g)return;const oe=U===x?[]:i.value.filter(W=>(W._liveErrorEpoch||0)>U);i.value=_(Q,oe).slice(0,5),o.value=!1}catch{if(ie!==g)return;o.value=U===x||i.value.length===0}ie===g&&(l.value=!1)}async function w(){try{const ie=await H.get("/api/knowledge");d.value=(Array.isArray(ie)?ie:[]).reduce((U,Q)=>U+(Q.chunks||0),0)}catch{d.value=null}}async function I(){try{const ie=await H.get("/api/agents");r.value=ie.filter(U=>U.status==="running")}catch{}}async function $(){u.value={...u.value,reload:!0};try{await H.post("/api/reload"),_e.success("Config reloaded")}catch(ie){_e.error(ie.message)}u.value={...u.value,reload:!1}}async function T(){if(!await Wt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const U=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await H.post("/api/sessions/clear-all");_e.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await R()}catch(Q){e.value={...e.value,session_count:U},_e.error(Q.message)}u.value={...u.value,clearSessions:!1}}async function P(){if(!await Wt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const U=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await H.post("/api/loops/stop-all");_e.success(Q.result),await R()}catch(Q){e.value={...e.value,loop_count:U},_e.error(Q.message)}u.value={...u.value,stopLoops:!1}}function q(){t.value=!0,s.value=null,R(),k(),S(),I()}let K=null,D=null,O=null;function L(ie){if(ie.payload&&ie.payload.tool_name){b+=1;const U={...ie.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(U),a.value.length>10&&a.value.pop(),c.value++,U.error&&(x+=1,U._liveErrorEpoch=x,o.value=!1,i.value.unshift(U),i.value.length>5&&i.value.pop()),setTimeout(()=>{U._isNew=!1},1500),clearTimeout(O),O=setTimeout(()=>{c.value=0},1e4)}}let te=null;return Ge(async()=>{await Promise.all([R(),k(),S(),I(),w()]),K=setInterval(R,15e3),D=setInterval(I,1e4),st.subscribe("events",L),te=st.onReconnected(()=>{k(),S()})}),ft(()=>{K&&clearInterval(K),D&&clearInterval(D),clearTimeout(O),st.unsubscribe("events",L),te&&(te(),te=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:E,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:k,fetchErrors:S,fetchStatus:R,onEvent:L,formatTime:sk,formatDuration:vi,retry:q,reloadConfig:$,clearSessions:T,stopAllLoops:P}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Pp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function t1(e){if(Array.isArray(e))return e}function s1(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function a1(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function n1(e,t){return t1(e)||s1(e,t)||i1(e,t)||a1()}function i1(e,t){if(e){if(typeof e=="string")return Pp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Pp(e,t):void 0}}const Tv=Object.entries,Mp=Object.setPrototypeOf,l1=Object.isFrozen,o1=Object.getPrototypeOf,r1=Object.getOwnPropertyDescriptor;let fs=Object.freeze,Hs=Object.seal,qn=Object.create,Cv=typeof Reflect<"u"&&Reflect,Rc=Cv.apply,Ic=Cv.construct;fs||(fs=function(t){return t});Hs||(Hs=function(t){return t});Rc||(Rc=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});Ic||(Ic=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const xa=$t(Array.prototype.forEach),c1=$t(Array.prototype.lastIndexOf),Fp=$t(Array.prototype.pop),Bn=$t(Array.prototype.push),d1=$t(Array.prototype.splice),rs=Array.isArray,Fi=$t(String.prototype.toLowerCase),jr=$t(String.prototype.toString),$p=$t(String.prototype.match),Hn=$t(String.prototype.replace),Up=$t(String.prototype.indexOf),u1=$t(String.prototype.trim),p1=$t(Number.prototype.toString),f1=$t(Boolean.prototype.toString),Bp=typeof BigInt>"u"?null:$t(BigInt.prototype.toString),Hp=typeof Symbol>"u"?null:$t(Symbol.prototype.toString),Tt=$t(Object.prototype.hasOwnProperty),Ii=$t(Object.prototype.toString),Kt=$t(RegExp.prototype.test),dn=h1(TypeError);function $t(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return Rc(e,t,a)}}function h1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return Ic(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Fi;if(Mp&&Mp(e,null),!rs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(l1(t)||(t[a]=i),n=i)}e[n]=!0}return e}function m1(e){for(let t=0;t<e.length;t++)Tt(e,t)||(e[t]=null);return e}function ts(e){const t=qn(null);for(const a of Tv(e)){var s=n1(a,2);const n=s[0],i=s[1];Tt(e,n)&&(rs(i)?t[n]=m1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ts(i):t[n]=i)}return t}function v1(e){switch(typeof e){case"string":return e;case"number":return p1(e);case"boolean":return f1(e);case"bigint":return Bp?Bp(e):"0";case"symbol":return Hp?Hp(e):"Symbol()";case"undefined":return Ii(e);case"function":case"object":{if(e===null)return Ii(e);const t=e,s=na(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Ii(a)}return Ii(e)}default:return Ii(e)}}function na(e,t){for(;e!==null;){const a=r1(e,t);if(a){if(a.get)return $t(a.get);if(typeof a.value=="function")return $t(a.value)}e=o1(e)}function s(){return null}return s}function g1(e){try{return Kt(e,""),!0}catch{return!1}}const jp=fs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),zr=fs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Vr=fs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),b1=fs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),qr=fs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),y1=fs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),zp=fs(["#text"]),Vp=fs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Gr=fs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),qp=fs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Kl=fs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),x1=Hs(/{{[\w\W]*|^[\w\W]*}}/g),_1=Hs(/<%[\w\W]*|^[\w\W]*%>/g),w1=Hs(/\${[\w\W]*/g),k1=Hs(/^data-[\-\w.\u00B7-\uFFFF]+$/),S1=Hs(/^aria-[\-\w]+$/),Gp=Hs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),T1=Hs(/^(?:\w+script|data):/i),C1=Hs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),E1=Hs(/^html$/i),A1=Hs(/^[a-z][.\w]*(-[.\w]+)+$/i),sa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},R1=function(){return typeof window>"u"?null:window},I1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Wp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Ev(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:R1();const t=Ce=>Ev(Ce);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==sa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=na(p,"cloneNode"),m=na(p,"remove"),v=na(p,"nextSibling"),E=na(p,"childNodes"),R=na(p,"parentNode"),y=na(p,"shadowRoot"),g=na(p,"attributes"),b=l&&l.prototype?na(l.prototype,"nodeType"):null,x=l&&l.prototype?na(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ce=s.createElement("template");Ce.content&&Ce.content.ownerDocument&&(s=Ce.content.ownerDocument)}let _,k="",S,w=!1,I=0;const $=function(){if(I>0)throw dn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(N){$(),I++;try{return _.createHTML(N)}finally{I--}},P=function(N){$(),I++;try{return _.createScriptURL(N)}finally{I--}},q=function(){return w||(S=I1(u,n),w=!0),S},K=s,D=K.implementation,O=K.createNodeIterator,L=K.createDocumentFragment,te=K.getElementsByTagName,ie=a.importNode;let U=Wp();t.isSupported=typeof Tv=="function"&&typeof R=="function"&&D&&D.createHTMLDocument!==void 0;const Q=x1,oe=_1,W=w1,fe=k1,ue=S1,G=T1,ce=C1,me=A1;let ve=Gp,be=null;const $e=qe({},[...jp,...zr,...Vr,...qr,...zp]);let C=null;const M=qe({},[...Vp,...Gr,...qp,...Kl]);let j=Object.seal(qn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),de=null,F=null;const Z=Object.seal(qn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let re=!0,B=!0,Y=!1,ee=!0,pe=!1,he=!0,xe=!1,Oe=!1,ge=!1,He=!1,Ue=!1,je=!1,Qe=!0,ot=!1;const nt="user-content-";let X=!0,we=!1,Ae={},Le=null;const se=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ee=null;const Ne=qe({},["audio","video","img","source","image","track"]);let Je=null;const Lt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),We="http://www.w3.org/1998/Math/MathML",Ut="http://www.w3.org/2000/svg",Bt="http://www.w3.org/1999/xhtml";let hs=Bt,Ys=!1,Os=null;const nn=qe({},[We,Ut,Bt],jr);let Qs=qe({},["mi","mo","mn","ms","mtext"]),js=qe({},["annotation-xml"]);const Ha=qe({},["title","style","font","a","script"]);let ws=null;const fa=["application/xhtml+xml","text/html"],Ls="text/html";let at=null,Ns=null;const ks=s.createElement("form"),ne=function(N){return N instanceof RegExp||N instanceof Function},Te=function(){let N=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ns&&Ns===N)return;(!N||typeof N!="object")&&(N={}),N=ts(N),ws=fa.indexOf(N.PARSER_MEDIA_TYPE)===-1?Ls:N.PARSER_MEDIA_TYPE,at=ws==="application/xhtml+xml"?jr:Fi,be=Tt(N,"ALLOWED_TAGS")&&rs(N.ALLOWED_TAGS)?qe({},N.ALLOWED_TAGS,at):$e,C=Tt(N,"ALLOWED_ATTR")&&rs(N.ALLOWED_ATTR)?qe({},N.ALLOWED_ATTR,at):M,Os=Tt(N,"ALLOWED_NAMESPACES")&&rs(N.ALLOWED_NAMESPACES)?qe({},N.ALLOWED_NAMESPACES,jr):nn,Je=Tt(N,"ADD_URI_SAFE_ATTR")&&rs(N.ADD_URI_SAFE_ATTR)?qe(ts(Lt),N.ADD_URI_SAFE_ATTR,at):Lt,Ee=Tt(N,"ADD_DATA_URI_TAGS")&&rs(N.ADD_DATA_URI_TAGS)?qe(ts(Ne),N.ADD_DATA_URI_TAGS,at):Ne,Le=Tt(N,"FORBID_CONTENTS")&&rs(N.FORBID_CONTENTS)?qe({},N.FORBID_CONTENTS,at):se,de=Tt(N,"FORBID_TAGS")&&rs(N.FORBID_TAGS)?qe({},N.FORBID_TAGS,at):ts({}),F=Tt(N,"FORBID_ATTR")&&rs(N.FORBID_ATTR)?qe({},N.FORBID_ATTR,at):ts({}),Ae=Tt(N,"USE_PROFILES")?N.USE_PROFILES&&typeof N.USE_PROFILES=="object"?ts(N.USE_PROFILES):N.USE_PROFILES:!1,re=N.ALLOW_ARIA_ATTR!==!1,B=N.ALLOW_DATA_ATTR!==!1,Y=N.ALLOW_UNKNOWN_PROTOCOLS||!1,ee=N.ALLOW_SELF_CLOSE_IN_ATTR!==!1,pe=N.SAFE_FOR_TEMPLATES||!1,he=N.SAFE_FOR_XML!==!1,xe=N.WHOLE_DOCUMENT||!1,He=N.RETURN_DOM||!1,Ue=N.RETURN_DOM_FRAGMENT||!1,je=N.RETURN_TRUSTED_TYPE||!1,ge=N.FORCE_BODY||!1,Qe=N.SANITIZE_DOM!==!1,ot=N.SANITIZE_NAMED_PROPS||!1,X=N.KEEP_CONTENT!==!1,we=N.IN_PLACE||!1,ve=g1(N.ALLOWED_URI_REGEXP)?N.ALLOWED_URI_REGEXP:Gp,hs=typeof N.NAMESPACE=="string"?N.NAMESPACE:Bt,Qs=Tt(N,"MATHML_TEXT_INTEGRATION_POINTS")&&N.MATHML_TEXT_INTEGRATION_POINTS&&typeof N.MATHML_TEXT_INTEGRATION_POINTS=="object"?ts(N.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),js=Tt(N,"HTML_INTEGRATION_POINTS")&&N.HTML_INTEGRATION_POINTS&&typeof N.HTML_INTEGRATION_POINTS=="object"?ts(N.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const le=Tt(N,"CUSTOM_ELEMENT_HANDLING")&&N.CUSTOM_ELEMENT_HANDLING&&typeof N.CUSTOM_ELEMENT_HANDLING=="object"?ts(N.CUSTOM_ELEMENT_HANDLING):qn(null);if(j=qn(null),Tt(le,"tagNameCheck")&&ne(le.tagNameCheck)&&(j.tagNameCheck=le.tagNameCheck),Tt(le,"attributeNameCheck")&&ne(le.attributeNameCheck)&&(j.attributeNameCheck=le.attributeNameCheck),Tt(le,"allowCustomizedBuiltInElements")&&typeof le.allowCustomizedBuiltInElements=="boolean"&&(j.allowCustomizedBuiltInElements=le.allowCustomizedBuiltInElements),pe&&(B=!1),Ue&&(He=!0),Ae&&(be=qe({},zp),C=qn(null),Ae.html===!0&&(qe(be,jp),qe(C,Vp)),Ae.svg===!0&&(qe(be,zr),qe(C,Gr),qe(C,Kl)),Ae.svgFilters===!0&&(qe(be,Vr),qe(C,Gr),qe(C,Kl)),Ae.mathMl===!0&&(qe(be,qr),qe(C,qp),qe(C,Kl))),Z.tagCheck=null,Z.attributeCheck=null,Tt(N,"ADD_TAGS")&&(typeof N.ADD_TAGS=="function"?Z.tagCheck=N.ADD_TAGS:rs(N.ADD_TAGS)&&(be===$e&&(be=ts(be)),qe(be,N.ADD_TAGS,at))),Tt(N,"ADD_ATTR")&&(typeof N.ADD_ATTR=="function"?Z.attributeCheck=N.ADD_ATTR:rs(N.ADD_ATTR)&&(C===M&&(C=ts(C)),qe(C,N.ADD_ATTR,at))),Tt(N,"ADD_URI_SAFE_ATTR")&&rs(N.ADD_URI_SAFE_ATTR)&&qe(Je,N.ADD_URI_SAFE_ATTR,at),Tt(N,"FORBID_CONTENTS")&&rs(N.FORBID_CONTENTS)&&(Le===se&&(Le=ts(Le)),qe(Le,N.FORBID_CONTENTS,at)),Tt(N,"ADD_FORBID_CONTENTS")&&rs(N.ADD_FORBID_CONTENTS)&&(Le===se&&(Le=ts(Le)),qe(Le,N.ADD_FORBID_CONTENTS,at)),X&&(be["#text"]=!0),xe&&qe(be,["html","head","body"]),be.table&&(qe(be,["tbody"]),delete de.tbody),N.TRUSTED_TYPES_POLICY){if(typeof N.TRUSTED_TYPES_POLICY.createHTML!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof N.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ye=_;_=N.TRUSTED_TYPES_POLICY;try{k=T("")}catch(Pe){throw _=ye,Pe}}else N.TRUSTED_TYPES_POLICY===null?(_=void 0,k=""):(_===void 0&&(_=q()),_&&typeof k=="string"&&(k=T("")));(U.uponSanitizeElement.length>0||U.uponSanitizeAttribute.length>0)&&be===$e&&(be=ts(be)),U.uponSanitizeAttribute.length>0&&C===M&&(C=ts(C)),fs&&fs(N),Ns=N},Fe=qe({},[...zr,...Vr,...b1]),et=qe({},[...qr,...y1]),dt=function(N){let le=R(N);(!le||!le.tagName)&&(le={namespaceURI:hs,tagName:"template"});const ye=Fi(N.tagName),Pe=Fi(le.tagName);return Os[N.namespaceURI]?N.namespaceURI===Ut?le.namespaceURI===Bt?ye==="svg":le.namespaceURI===We?ye==="svg"&&(Pe==="annotation-xml"||Qs[Pe]):!!Fe[ye]:N.namespaceURI===We?le.namespaceURI===Bt?ye==="math":le.namespaceURI===Ut?ye==="math"&&js[Pe]:!!et[ye]:N.namespaceURI===Bt?le.namespaceURI===Ut&&!js[Pe]||le.namespaceURI===We&&!Qs[Pe]?!1:!et[ye]&&(Ha[ye]||!Fe[ye]):!!(ws==="application/xhtml+xml"&&Os[N.namespaceURI]):!1},mt=function(N){Bn(t.removed,{element:N});try{R(N).removeChild(N)}catch{if(m(N),!R(N))throw dn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},ha=function(N){const le=E?E(N):N.childNodes;if(le){const Pe=[];xa(le,De=>{Bn(Pe,De)}),xa(Pe,De=>{try{m(De)}catch{}})}const ye=g?g(N):null;if(ye)for(let Pe=ye.length-1;Pe>=0;--Pe){const De=ye[Pe],ze=De&&De.name;if(typeof ze=="string")try{N.removeAttribute(ze)}catch{}}},zs=function(N,le){try{Bn(t.removed,{attribute:le.getAttributeNode(N),from:le})}catch{Bn(t.removed,{attribute:null,from:le})}if(le.removeAttribute(N),N==="is")if(He||Ue)try{mt(le)}catch{}else try{le.setAttribute(N,"")}catch{}},xi=function(N){const le=g?g(N):N.attributes;if(le)for(let ye=le.length-1;ye>=0;--ye){const Pe=le[ye],De=Pe&&Pe.name;if(!(typeof De!="string"||C[at(De)]))try{N.removeAttribute(De)}catch{}}},_i=function(N){const le=[N];for(;le.length>0;){const ye=le.pop();(b?b(ye):ye.nodeType)===sa.element&&xi(ye);const De=E?E(ye):ye.childNodes;if(De)for(let ze=De.length-1;ze>=0;--ze)le.push(De[ze])}},Ln=function(N){let le=null,ye=null;if(ge)N="<remove></remove>"+N;else{const ze=$p(N,/^[\r\n\t ]+/);ye=ze&&ze[0]}ws==="application/xhtml+xml"&&hs===Bt&&(N='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+N+"</body></html>");const Pe=_?T(N):N;if(hs===Bt)try{le=new d().parseFromString(Pe,ws)}catch{}if(!le||!le.documentElement){le=D.createDocument(hs,"template",null);try{le.documentElement.innerHTML=Ys?k:Pe}catch{}}const De=le.body||le.documentElement;return N&&ye&&De.insertBefore(s.createTextNode(ye),De.childNodes[0]||null),hs===Bt?te.call(le,xe?"html":"body")[0]:xe?le.documentElement:De},Nn=function(N){return O.call(N.ownerDocument||N,N,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ln=function(N){var le,ye;N.normalize();const Pe=O.call(N.ownerDocument||N,N,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let De=Pe.nextNode();for(;De;){let At=De.data;xa([Q,oe,W],ht=>{At=Hn(At,ht," ")}),De.data=At,De=Pe.nextNode()}const ze=(le=(ye=N.querySelectorAll)===null||ye===void 0?void 0:ye.call(N,"template"))!==null&&le!==void 0?le:[];xa(Array.from(ze),At=>{Xs(At.content)&&ln(At.content)})},ja=function(N){const le=x?x(N):null;return typeof le!="string"||at(le)!=="form"?!1:typeof N.nodeName!="string"||typeof N.textContent!="string"||typeof N.removeChild!="function"||N.attributes!==g(N)||typeof N.removeAttribute!="function"||typeof N.setAttribute!="function"||typeof N.namespaceURI!="string"||typeof N.insertBefore!="function"||typeof N.hasChildNodes!="function"||N.nodeType!==b(N)||N.childNodes!==E(N)},Xs=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return b(N)===sa.documentFragment}catch{return!1}},ma=function(N){if(!b||typeof N!="object"||N===null)return!1;try{return typeof b(N)=="number"}catch{return!1}};function Ss(Ce,N,le){xa(Ce,ye=>{ye.call(t,N,le,Ns)})}const Dn=function(N){let le=null;if(Ss(U.beforeSanitizeElements,N,null),ja(N))return mt(N),!0;const ye=at(x?x(N):N.nodeName);if(Ss(U.uponSanitizeElement,N,{tagName:ye,allowedTags:be}),he&&N.hasChildNodes()&&!ma(N.firstElementChild)&&Kt(/<[/\w!]/g,N.innerHTML)&&Kt(/<[/\w!]/g,N.textContent)||he&&N.namespaceURI===Bt&&ye==="style"&&ma(N.firstElementChild)||N.nodeType===sa.progressingInstruction||he&&N.nodeType===sa.comment&&Kt(/<[/\w]/g,N.data))return mt(N),!0;if(de[ye]||!(Z.tagCheck instanceof Function&&Z.tagCheck(ye))&&!be[ye]){if(!de[ye]&&Ie(ye)&&(j.tagNameCheck instanceof RegExp&&Kt(j.tagNameCheck,ye)||j.tagNameCheck instanceof Function&&j.tagNameCheck(ye)))return!1;if(X&&!Le[ye]){const De=R(N),ze=E(N);if(ze&&De){const At=ze.length;for(let ht=At-1;ht>=0;--ht){const wt=we?ze[ht]:h(ze[ht],!0);De.insertBefore(wt,v(N))}}}return mt(N),!0}return(b?b(N):N.nodeType)===sa.element&&!dt(N)||(ye==="noscript"||ye==="noembed"||ye==="noframes")&&Kt(/<\/no(script|embed|frames)/i,N.innerHTML)?(mt(N),!0):(pe&&N.nodeType===sa.text&&(le=N.textContent,xa([Q,oe,W],De=>{le=Hn(le,De," ")}),N.textContent!==le&&(Bn(t.removed,{element:N.cloneNode()}),N.textContent=le)),Ss(U.afterSanitizeElements,N,null),!1)},J=function(N,le,ye){if(F[le]||Qe&&(le==="id"||le==="name")&&(ye in s||ye in ks))return!1;const Pe=C[le]||Z.attributeCheck instanceof Function&&Z.attributeCheck(le,N);if(!(B&&!F[le]&&Kt(fe,le))){if(!(re&&Kt(ue,le))){if(!Pe||F[le]){if(!(Ie(N)&&(j.tagNameCheck instanceof RegExp&&Kt(j.tagNameCheck,N)||j.tagNameCheck instanceof Function&&j.tagNameCheck(N))&&(j.attributeNameCheck instanceof RegExp&&Kt(j.attributeNameCheck,le)||j.attributeNameCheck instanceof Function&&j.attributeNameCheck(le,N))||le==="is"&&j.allowCustomizedBuiltInElements&&(j.tagNameCheck instanceof RegExp&&Kt(j.tagNameCheck,ye)||j.tagNameCheck instanceof Function&&j.tagNameCheck(ye))))return!1}else if(!Je[le]){if(!Kt(ve,Hn(ye,ce,""))){if(!((le==="src"||le==="xlink:href"||le==="href")&&N!=="script"&&Up(ye,"data:")===0&&Ee[N])){if(!(Y&&!Kt(G,Hn(ye,ce,"")))){if(ye)return!1}}}}}}return!0},ke=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ie=function(N){return!ke[Fi(N)]&&Kt(me,N)},Vs=function(N){Ss(U.beforeSanitizeAttributes,N,null);const le=N.attributes;if(!le||ja(N))return;const ye={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:C,forceKeepAttr:void 0};let Pe=le.length;for(;Pe--;){const De=le[Pe],ze=De.name,At=De.namespaceURI,ht=De.value,wt=at(ze),ea=ht;let Nt=ze==="value"?ea:u1(ea);if(ye.attrName=wt,ye.attrValue=Nt,ye.keepAttr=!0,ye.forceKeepAttr=void 0,Ss(U.uponSanitizeAttribute,N,ye),Nt=ye.attrValue,ot&&(wt==="id"||wt==="name")&&Up(Nt,nt)!==0&&(zs(ze,N),Nt=nt+Nt),he&&Kt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){zs(ze,N);continue}if(wt==="attributename"&&$p(Nt,"href")){zs(ze,N);continue}if(ye.forceKeepAttr)continue;if(!ye.keepAttr){zs(ze,N);continue}if(!ee&&Kt(/\/>/i,Nt)){zs(ze,N);continue}pe&&xa([Q,oe,W],El=>{Nt=Hn(Nt,El," ")});const Cl=at(N.nodeName);if(!J(Cl,wt,Nt)){zs(ze,N);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(Cl,wt)){case"TrustedHTML":{Nt=T(Nt);break}case"TrustedScriptURL":{Nt=P(Nt);break}}if(Nt!==ea)try{At?N.setAttributeNS(At,ze,Nt):N.setAttribute(ze,Nt),ja(N)?mt(N):Fp(t.removed)}catch{zs(ze,N)}}Ss(U.afterSanitizeAttributes,N,null)},va=function(N){let le=null;const ye=Nn(N);for(Ss(U.beforeSanitizeShadowDOM,N,null);le=ye.nextNode();)if(Ss(U.uponSanitizeShadowNode,le,null),Dn(le),Vs(le),Xs(le.content)&&va(le.content),(b?b(le):le.nodeType)===sa.element){const De=y?y(le):le.shadowRoot;Xs(De)&&(za(De),va(De))}Ss(U.afterSanitizeShadowDOM,N,null)},za=function(N){const le=[{node:N,shadow:null}];for(;le.length>0;){const ye=le.pop();if(ye.shadow){va(ye.shadow);continue}const Pe=ye.node,ze=(b?b(Pe):Pe.nodeType)===sa.element,At=E?E(Pe):Pe.childNodes;if(At)for(let ht=At.length-1;ht>=0;--ht)le.push({node:At[ht],shadow:null});if(ze){const ht=x?x(Pe):null;if(typeof ht=="string"&&at(ht)==="template"){const wt=Pe.content;Xs(wt)&&le.push({node:wt,shadow:null})}}if(ze){const ht=y?y(Pe):Pe.shadowRoot;Xs(ht)&&le.push({node:null,shadow:ht},{node:ht,shadow:null})}}};return t.sanitize=function(Ce){let N=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},le=null,ye=null,Pe=null,De=null;if(Ys=!Ce,Ys&&(Ce="<!-->"),typeof Ce!="string"&&!ma(Ce)&&(Ce=v1(Ce),typeof Ce!="string"))throw dn("dirty is not a string, aborting");if(!t.isSupported)return Ce;Oe||Te(N),t.removed=[];const ze=we&&typeof Ce!="string"&&ma(Ce);if(ze){const wt=x?x(Ce):Ce.nodeName;if(typeof wt=="string"){const ea=at(wt);if(!be[ea]||de[ea])throw dn("root node is forbidden and cannot be sanitized in-place")}if(ja(Ce))throw dn("root node is clobbered and cannot be sanitized in-place");try{za(Ce)}catch(ea){throw ha(Ce),ea}}else if(ma(Ce))le=Ln("<!---->"),ye=le.ownerDocument.importNode(Ce,!0),ye.nodeType===sa.element&&ye.nodeName==="BODY"||ye.nodeName==="HTML"?le=ye:le.appendChild(ye),za(ye);else{if(!He&&!pe&&!xe&&Ce.indexOf("<")===-1)return _&&je?T(Ce):Ce;if(le=Ln(Ce),!le)return He?null:je?k:""}le&&ge&&mt(le.firstChild);const At=Nn(ze?Ce:le);try{for(;Pe=At.nextNode();)Dn(Pe),Vs(Pe),Xs(Pe.content)&&va(Pe.content)}catch(wt){throw ze&&ha(Ce),wt}if(ze)return xa(t.removed,wt=>{wt.element&&_i(wt.element)}),pe&&ln(Ce),Ce;if(He){if(pe&&ln(le),Ue)for(De=L.call(le.ownerDocument);le.firstChild;)De.appendChild(le.firstChild);else De=le;return(C.shadowroot||C.shadowrootmode)&&(De=ie.call(a,De,!0)),De}let ht=xe?le.outerHTML:le.innerHTML;return xe&&be["!doctype"]&&le.ownerDocument&&le.ownerDocument.doctype&&le.ownerDocument.doctype.name&&Kt(E1,le.ownerDocument.doctype.name)&&(ht="<!DOCTYPE "+le.ownerDocument.doctype.name+`>
`+ht),pe&&xa([Q,oe,W],wt=>{ht=Hn(ht,wt," ")}),_&&je?T(ht):ht},t.setConfig=function(){let Ce=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Ce),Oe=!0},t.clearConfig=function(){Ns=null,Oe=!1,_=S,k=""},t.isValidAttribute=function(Ce,N,le){Ns||Te({});const ye=at(Ce),Pe=at(N);return J(ye,Pe,le)},t.addHook=function(Ce,N){typeof N=="function"&&Bn(U[Ce],N)},t.removeHook=function(Ce,N){if(N!==void 0){const le=c1(U[Ce],N);return le===-1?void 0:d1(U[Ce],le,1)[0]}return Fp(U[Ce])},t.removeHooks=function(Ce){U[Ce]=[]},t.removeAllHooks=function(){U=Wp()},t}var Kp=Ev();function Md(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var On=Md();function Av(e){On=e}var Gi={exec:()=>null};function pt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(us.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var us={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},O1=/^(?:[ \t]*(?:\n|$))+/,L1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,N1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Tl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,D1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Fd=/(?:[*+-]|\d{1,9}[.)])/,Rv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Iv=pt(Rv).replace(/bull/g,Fd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),P1=pt(Rv).replace(/bull/g,Fd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),$d=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,M1=/^[^\n]+/,Ud=/(?!\s*\])(?:\\.|[^\[\]\\])+/,F1=pt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Ud).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),$1=pt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Fd).getRegex(),ur="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Bd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,U1=pt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Bd).replace("tag",ur).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Ov=pt($d).replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex(),B1=pt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Ov).getRegex(),Hd={blockquote:B1,code:L1,def:F1,fences:N1,heading:D1,hr:Tl,html:U1,lheading:Iv,list:$1,newline:O1,paragraph:Ov,table:Gi,text:M1},Jp=pt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex(),H1={...Hd,lheading:P1,table:Jp,paragraph:pt($d).replace("hr",Tl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Jp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ur).getRegex()},j1={...Hd,html:pt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Bd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Gi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:pt($d).replace("hr",Tl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Iv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},z1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,V1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Lv=/^( {2,}|\\)\n(?!\s*$)/,q1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,pr=/[\p{P}\p{S}]/u,jd=/[\s\p{P}\p{S}]/u,Nv=/[^\s\p{P}\p{S}]/u,G1=pt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,jd).getRegex(),Dv=/(?!~)[\p{P}\p{S}]/u,W1=/(?!~)[\s\p{P}\p{S}]/u,K1=/(?:[^\s\p{P}\p{S}]|~)/u,J1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Pv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Z1=pt(Pv,"u").replace(/punct/g,pr).getRegex(),Y1=pt(Pv,"u").replace(/punct/g,Dv).getRegex(),Mv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Q1=pt(Mv,"gu").replace(/notPunctSpace/g,Nv).replace(/punctSpace/g,jd).replace(/punct/g,pr).getRegex(),X1=pt(Mv,"gu").replace(/notPunctSpace/g,K1).replace(/punctSpace/g,W1).replace(/punct/g,Dv).getRegex(),eT=pt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Nv).replace(/punctSpace/g,jd).replace(/punct/g,pr).getRegex(),tT=pt(/\\(punct)/,"gu").replace(/punct/g,pr).getRegex(),sT=pt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),aT=pt(Bd).replace("(?:-->|$)","-->").getRegex(),nT=pt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",aT).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),No=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,iT=pt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",No).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Fv=pt(/^!?\[(label)\]\[(ref)\]/).replace("label",No).replace("ref",Ud).getRegex(),$v=pt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Ud).getRegex(),lT=pt("reflink|nolink(?!\\()","g").replace("reflink",Fv).replace("nolink",$v).getRegex(),zd={_backpedal:Gi,anyPunctuation:tT,autolink:sT,blockSkip:J1,br:Lv,code:V1,del:Gi,emStrongLDelim:Z1,emStrongRDelimAst:Q1,emStrongRDelimUnd:eT,escape:z1,link:iT,nolink:$v,punctuation:G1,reflink:Fv,reflinkSearch:lT,tag:nT,text:q1,url:Gi},oT={...zd,link:pt(/^!?\[(label)\]\((.*?)\)/).replace("label",No).getRegex(),reflink:pt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",No).getRegex()},Oc={...zd,emStrongRDelimAst:X1,emStrongLDelim:Y1,url:pt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},rT={...Oc,br:pt(Lv).replace("{2,}","*").getRegex(),text:pt(Oc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Jl={normal:Hd,gfm:H1,pedantic:j1},Oi={normal:zd,gfm:Oc,breaks:rT,pedantic:oT},cT={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Zp=e=>cT[e];function ia(e,t){if(t){if(us.escapeTest.test(e))return e.replace(us.escapeReplace,Zp)}else if(us.escapeTestNoEncode.test(e))return e.replace(us.escapeReplaceNoEncode,Zp);return e}function Yp(e){try{e=encodeURI(e).replace(us.percentDecode,"%")}catch{return null}return e}function Qp(e,t){var i;const s=e.replace(us.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(us.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(us.slashPipe,"|");return a}function Li(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function dT(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function Xp(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function uT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Do=class{constructor(e){gt(this,"options");gt(this,"rules");gt(this,"lexer");this.options=e||On}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Li(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=uT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Li(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Li(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const R=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),x=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let k;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),k=p):k=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||x.test(p)||R.test(p)||y.test(p))break;if(k.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+k.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=_+`
`,e=e.substring(_.length+1),u=k.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,E;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(E=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!v,checked:E,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Qp(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(Qp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Li(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=dT(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),Xp(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Xp(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Aa=class Lc{constructor(t){gt(this,"tokens");gt(this,"options");gt(this,"state");gt(this,"tokenizer");gt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||On,this.options.tokenizer=this.options.tokenizer||new Do,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:us,block:Jl.normal,inline:Oi.normal};this.options.pedantic?(s.block=Jl.pedantic,s.inline=Oi.pedantic):this.options.gfm&&(s.block=Jl.gfm,this.options.breaks?s.inline=Oi.breaks:s.inline=Oi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Jl,inline:Oi}}static lex(t,s){return new Lc(s).lex(t)}static lexInline(t,s){return new Lc(s).inlineTokens(t)}lex(t){t=t.replace(us.carriageReturn,`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ia(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Yp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ia(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Yp(e);if(n===null)return ia(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ia(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ia(e.text)}},Vd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ra=class Nc{constructor(t){gt(this,"options");gt(this,"renderer");gt(this,"textRenderer");this.options=t||On,this.options.renderer=this.options.renderer||new Po,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Vd}static parse(t,s){return new Nc(s).parse(t)}static parseInline(t,s){return new Nc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Wr,ao=(Wr=class{constructor(e){gt(this,"options");gt(this,"block");this.options=e||On}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Aa.lex:Aa.lexInline}provideParser(){return this.block?Ra.parse:Ra.parseInline}},gt(Wr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Wr),pT=class{constructor(...e){gt(this,"defaults",Md());gt(this,"options",this.setOptions);gt(this,"parse",this.parseMarkdown(!0));gt(this,"parseInline",this.parseMarkdown(!1));gt(this,"Parser",Ra);gt(this,"Renderer",Po);gt(this,"TextRenderer",Vd);gt(this,"Lexer",Aa);gt(this,"Tokenizer",Do);gt(this,"Hooks",ao);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Po(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Do(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new ao;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];ao.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Aa.lex(e,t??this.defaults)}parser(e,t){return Ra.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Aa.lex:Aa.lexInline,r=i.hooks?i.hooks.provideParser():e?Ra.parse:Ra.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ia(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Tn=new pT;function ct(e,t){return Tn.parse(e,t)}ct.options=ct.setOptions=function(e){return Tn.setOptions(e),ct.defaults=Tn.defaults,Av(ct.defaults),ct};ct.getDefaults=Md;ct.defaults=On;ct.use=function(...e){return Tn.use(...e),ct.defaults=Tn.defaults,Av(ct.defaults),ct};ct.walkTokens=function(e,t){return Tn.walkTokens(e,t)};ct.parseInline=Tn.parseInline;ct.Parser=Ra;ct.parser=Ra.parse;ct.Renderer=Po;ct.TextRenderer=Vd;ct.Lexer=Aa;ct.lexer=Aa.lex;ct.Tokenizer=Do;ct.Hooks=ao;ct.parse=ct;ct.options;ct.setOptions;ct.use;ct.walkTokens;ct.parseInline;Ra.parse;Aa.lex;const fT={breaks:!0,gfm:!0};function ef(e){if(!e)return"";try{if(typeof ct<"u"&&ct.parse){const t=ct.parse(e,fT);return typeof Kp<"u"?Kp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function hT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const mT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function vT(e){return mT[e]||"wrench"}const gT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function tf(e){if(!e)return[];const t=e.match(gT);return t?[...new Set(t)]:[]}const bT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=z(()=>t.value.trim().length>0&&!s.value),p=f(st.state||"disconnected");let h=null;const m=z(()=>{const D=p.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],E=z(()=>{const D=Math.floor(l.value/4)%v.length,O=l.value;return O>3?`${v[D]} (${O}s)`:v[0]});function R(){It(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const D=i.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function g(D,O,L={}){const te={id:++c,role:D,content:O,timestamp:Date.now(),html:D==="bot"?ef(O):"",tools_used:L.tools_used||[],is_error:L.is_error||!1,images:D==="bot"?tf(O):[],files:L.files||[],_showTools:!1};return e.value.push(te),R(),D==="bot"&&It(()=>b()),te}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const L=document.createElement("button");L.className="chat-code-copy",L.textContent="Copy",L.addEventListener("click",()=>{const te=O.querySelector("code"),ie=te?te.textContent:O.textContent;navigator.clipboard.writeText(ie).then(()=>{L.textContent="Copied!",setTimeout(()=>{L.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(L)})}function x(D){if(D===0)return!0;const O=e.value[D-1],L=e.value[D],te=new Date(O.timestamp).toDateString(),ie=new Date(L.timestamp).toDateString();return te!==ie}function _(D){const O=new Date(D),L=new Date;if(O.toDateString()===L.toDateString())return"Today";const te=new Date(L);return te.setDate(te.getDate()-1),O.toDateString()===te.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function k(D){t.value=D,It(()=>q())}function S(D){window.open(D,"_blank","noopener")}function w(D){D.target.style.display="none"}function I(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function $(){r&&(clearInterval(r),r=null),l.value=0}function T(D){s.value&&(s.value=!1,$(),D.type==="chat_response"?g("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&g("bot",D.error||"Unknown error",{is_error:!0}),It(()=>{var O;return(O=i.value)==null?void 0:O.focus()}))}async function P(D){try{const O=await H.post("/api/chat",{content:D,channel_id:o.value});g("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){g("bot",O.message||"Failed to send message",{is_error:!0})}}async function q(){const D=t.value.trim();if(!D||s.value)return;g("user",D),t.value="",s.value=!0,I(),i.value&&(i.value.style.height="auto"),st.connected&&st.sendChat(D,{channelId:o.value})||(await P(D),s.value=!1,$()),It(()=>{var L;return(L=i.value)==null?void 0:L.focus()})}async function K(){a.value="";try{if(!o.value){const O=await H.get("/api/auth/session");o.value=O.channel_id||O.user_id||"web-user"}const D=await H.get("/api/sessions/"+encodeURIComponent(o.value));if(D&&D.messages&&D.messages.length>0){for(const O of D.messages){const L=O.role==="user"?"user":"bot";let te=O.content||"";if(L==="user"){const U=te.match(/^\[.*?\]:\s*/);U&&(te=te.slice(U[0].length))}if(!te.trim())continue;const ie={id:++c,role:L,content:te,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:L==="bot"?ef(te):"",tools_used:[],is_error:!1,images:L==="bot"?tf(te):[],files:[],_showTools:!1};e.value.push(ie)}It(()=>{R(),b()})}}catch(D){D&&D.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",_e.error(a.value))}}return Ge(()=>{st.subscribe("chat",T),p.value=st.state||"disconnected",h=st.onState(D=>{p.value=D}),K(),It(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}),ft(()=>{st.unsubscribe("chat",T),h&&(h(),h=null),$()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:E,suggestions:d,send:q,autoResize:y,formatTime:hT,formatDate:_,showDateSeparator:x,useSuggestion:k,openImage:S,onImageError:w,getToolIcon:vT,loadHistory:K}}},yT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=z(()=>e.value==="custom"),v=z(()=>[...i.value,...l.value]),E=z(()=>l.value.includes(e.value)),R=z(()=>{var S;return m.value?t.value||"Odin":((S=n.value[e.value])==null?void 0:S.name)||e.value}),y=z(()=>{var S;return m.value?s.value||"(empty — will use Odin default)":((S=n.value[e.value])==null?void 0:S.identity)||""}),g=z(()=>{var S;return m.value?a.value||"(empty — will use Odin default)":((S=n.value[e.value])==null?void 0:S.voice)||""});async function b(){d.value=!0;try{const S=await H.get("/api/personality");e.value=S.preset||"odin",t.value=S.custom_name||"",s.value=S.custom_identity||"",a.value=S.custom_voice||"",n.value=S.presets||{},i.value=S.builtin_presets||[],l.value=S.user_presets||[]}catch(S){c.value=S.message}finally{d.value=!1}}async function x(){o.value=!0,c.value=null,r.value=!1;try{await H.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(S){c.value=S.message}finally{o.value=!1}}async function _(){const S=u.value.trim();if(S){h.value=!0,c.value=null;try{await H.post("/api/personality/presets",{name:S,display_name:R.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=S.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{h.value=!1}}}async function k(){if(await Wt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await H.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(w){c.value=w.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:v,isCustom:m,isUserPreset:E,previewName:R,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:x,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:_,deletePreset:k,builtinPresets:i,userPresets:l}},template:`
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
  `},xT={props:["onComplete"],template:`
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
    </main>`,setup(e){const t=f(""),s=f(""),a=f(!1),n=f(!1),i=f(""),l=f("Initialization pending."),o=f(!1),r=f(""),c=f(null),d=f({}),u=f("");let p=0,h=null;function m(){return p+=1,h==null||h.abort(),h=null,p}function v(x,_,k){return typeof H.postWithOptions=="function"?H.postWithOptions(x,_,{signal:k}):H.post(x,_)}async function E(){var k,S,w;a.value=!0,i.value="",l.value="Saving setup…";const x={},_=!!s.value.trim();t.value.trim()&&(x.web_api_token=t.value.trim()),s.value.trim()&&(x.discord_token=s.value.trim());try{const I=H.post("/api/setup/complete",x);t.value="",s.value="";const $=await I,T=((k=$.discord)==null?void 0:k.state)||$.discord_status;if(T==="failed"?(i.value=((S=$.discord)==null?void 0:S.error)||"Discord attachment failed. Setup was saved.",l.value="Saved. Discord attachment failed."):T==="connecting"?l.value="Saved. Connecting Discord…":T==="ready"?l.value="Saved. Discord ready.":_?l.value="Saved. Discord token stored; attachment status is pending.":l.value=$.message||"Setup saved. Ready to sign in.",(w=$.restart_required)!=null&&w.length){const P=$.message||`Restart Odin to apply: ${$.restart_required.join(", ")}`;l.value.includes(P)||(l.value+=` ${P}`)}n.value=!0}catch(I){i.value=I.message||"Setup could not be saved.",l.value="Initialization pending."}finally{a.value=!1}}async function R(){const x=m(),_=typeof AbortController=="function"?new AbortController:null;h=_,o.value=!0,u.value="";try{const k=await v("/api/codex/device-code",void 0,_==null?void 0:_.signal);if(x!==p)return;c.value=k,r.value="pending";const S=await v("/api/codex/device-poll",{device_auth_id:k.device_auth_id,user_code:k.user_code,interval:k.interval},_==null?void 0:_.signal);if(x!==p)return;d.value=S||{},r.value="ready"}catch(k){x===p&&(k==null?void 0:k.name)!=="AbortError"&&(u.value=k.message||"Device sign-in failed.",r.value="failed")}finally{x===p&&(o.value=!1,h=null)}}function y(){m(),o.value=!1,b()}function g(){var x;(x=e.onComplete)==null||x.call(e)}function b(){r.value="",c.value=null,d.value={},u.value=""}return ft(()=>{m()}),{webApiToken:t,discordToken:s,saving:a,completed:n,error:i,statusMessage:l,save:E,onComplete:g,deviceLoading:o,deviceState:r,deviceInfo:c,deviceResult:d,deviceError:u,startDeviceLogin:R,cancelDeviceLogin:y,clearDeviceState:b}}},St=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Uv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:e1,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:bT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:gk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Ck,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Wk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:yT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:WS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:St("/operations","live")},{path:"/agents",redirect:St("/operations","agents")},{path:"/loops",redirect:St("/operations","loops")},{path:"/processes",redirect:St("/operations","processes")},{path:"/schedules",redirect:St("/operations","schedules")},{path:"/audit",redirect:St("/history","audit")},{path:"/sessions",redirect:St("/history","sessions")},{path:"/traces",redirect:St("/history","traces")},{path:"/usage",redirect:St("/history","usage")},{path:"/tools",redirect:St("/capabilities","tools")},{path:"/skills",redirect:St("/capabilities","skills")},{path:"/mcp",redirect:St("/capabilities","mcp-servers")},{path:"/knowledge",redirect:St("/capabilities","knowledge")},{path:"/memory",redirect:St("/capabilities","memory")},{path:"/learned",redirect:St("/capabilities","learned")},{path:"/health",redirect:St("/system","health")},{path:"/resources",redirect:St("/system","resources")},{path:"/logs",redirect:St("/system","logs")},{path:"/config",redirect:St("/system","config")},{path:"/host-access",redirect:St("/system","host-access")},{path:"/hosts",redirect:St("/system","hosts")},{path:"/internals",redirect:St("/system","internals")}],Wi=Vw({history:ww(),routes:Uv});Wi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const _T={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{H.setPersist(n.value),await H.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},wT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),E=Uv.filter(U=>U.meta),R=z(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:E.filter(Q=>Q.meta.section===U)})).filter(U=>U.routes.length)),y=z(()=>{var U;return((U=Wi.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=z(()=>{var U;return((U=Wi.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=z(()=>{var U;return((U=Wi.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function x(){st.disconnect(),D&&(clearInterval(D),D=null)}H.onSessionExpired=()=>{t.value=!0,x(),H.setToken(""),e.value="login"};function _(U){var Q;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),Np());return}if(a.value&&U.key==="Tab"){const oe=[...((Q=n.value)==null?void 0:Q.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(oe.length){const W=oe[0],fe=oe[oe.length-1];if(U.shiftKey&&(document.activeElement===W||!n.value.contains(document.activeElement))){U.preventDefault(),fe.focus();return}if(!U.shiftKey&&(document.activeElement===fe||!n.value.contains(document.activeElement))){U.preventDefault(),W.focus();return}}}if(U.key==="Escape"&&a.value){a.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const oe=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');oe&&oe.focus()}}function k(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}async function S(){try{const U=await H.get("/api/setup/status");if(U.mode==="pending"||U.needed===!0)return x(),e.value="setup",!0}catch(U){U==null||U.name}return!1}Ge(async()=>{if(document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),k(),o.addEventListener("change",k),await S())return;const U=await H.check();U.ok?(e.value="ready",te()):U.needsAuth?e.value="login":(e.value="ready",te())});function w(){t.value=!1,e.value="ready",te()}async function I(){if(await S())return;const U=await H.check();U.ok?(e.value="ready",te()):U.needsAuth?e.value="login":(e.value="ready",te())}async function $(){x(),e.value="login",await H.logout()}function T(){s.value=!s.value}function P(){a.value=!a.value}Ft(a,async U=>{var Q,oe;if(U)r=document.activeElement,await It(),(oe=(Q=n.value)==null?void 0:Q.querySelector(".nav-item"))==null||oe.focus();else if(r!=null&&r.isConnected){const W=r;r=null,requestAnimationFrame(()=>W.focus())}});const q=z(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function K(U,Q="info",oe=3e3){p.value={text:U,level:Q},clearTimeout(h),h=setTimeout(()=>{p.value=null},oe)}let D=null,O=!1,L=[];function te(){for(const U of L)U();L=[st.onStatus(U=>{c.value=U}),st.onLatencyChange(U=>{u.value=U}),st.onState((U,Q)=>{d.value=U,U==="connected"?(O&&K("Connection restored","success"),O=!0):U==="reconnecting"&&Q.attempt===1&&K("Connection lost — reconnecting…","warn")})],st.connect(),ie(),D&&clearInterval(D),D=setInterval(ie,15e3)}async function ie(){try{const U=await H.get("/api/status");m.value=U.status==="online"?"online":"starting";const Q=U.uptime_seconds||0,oe=Math.floor(Q/3600),W=Math.floor(Q%3600/60);v.value=`${oe}h ${W}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{D&&clearInterval(D);for(const U of L)U();L=[],st.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",k)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:q,wsToast:p,botStatus:m,botUptime:v,navRoutes:E,navGroups:R,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:w,onSetupComplete:I,logout:$,toggleSidebar:T,toggleMobileNavigation:P,openPalette:Np}}},Ba=wo(wT);Ba.component("odin-icon",YS);Ba.component("login-screen",_T);Ba.component("setup-page",xT);Ba.component("toast-container",M_);Ba.component("confirm-host",F_);Ba.component("command-palette",ZS);Ba.directive("modal-focus",XS);Ba.use(Wi);Ba.mount("#app");
