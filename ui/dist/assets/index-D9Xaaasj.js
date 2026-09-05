var av=Object.defineProperty;var iv=(e,t,s)=>t in e?av(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ut=(e,t,s)=>iv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class lv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new vl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new gd(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new vl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new gd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new vl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof vl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class vl extends Error{constructor(t){super(t),this.name="AuthError"}}class gd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class ov{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(a,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const G=new lv,Ye=new ov(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Is(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},za=[],Gt=()=>{},Ua=()=>!1,_a=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),bo=e=>e.startsWith("onUpdate:"),qe=Object.assign,ic=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},rv=Object.prototype.hasOwnProperty,tt=(e,t)=>rv.call(e,t),Ce=Array.isArray,ja=e=>di(e)==="[object Map]",wa=e=>di(e)==="[object Set]",bd=e=>di(e)==="[object Date]",cv=e=>di(e)==="[object RegExp]",Fe=e=>typeof e=="function",Be=e=>typeof e=="string",ss=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",lc=e=>(Xe(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),kp=Object.prototype.toString,di=e=>kp.call(e),dv=e=>di(e).slice(8,-1),yo=e=>di(e)==="[object Object]",xo=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Tn=Is(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),uv=Is("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),_o=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},pv=/-\w/g,ct=_o(e=>e.replace(pv,t=>t.slice(1).toUpperCase())),fv=/\B([A-Z])/g,xs=_o(e=>e.replace(fv,"-$1").toLowerCase()),ka=_o(e=>e.charAt(0).toUpperCase()+e.slice(1)),Va=_o(e=>e?`on${ka(e)}`:""),$t=(e,t)=>!Object.is(e,t),qa=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Sp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},wo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Hl=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let yd;const ko=()=>yd||(yd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function hv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const mv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",vv=Is(mv);function il(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Be(n)?Tp(n):il(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Be(e)||Xe(e))return e}const gv=/;(?![^(]*\))/g,bv=/:([^]+)/,yv=/\/\*[^]*?\*\//g;function Tp(e){const t={};return e.replace(yv,"").split(gv).forEach(s=>{if(s){const n=s.split(bv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function ll(e){let t="";if(Be(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=ll(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function xv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=ll(t)),s&&(e.style=il(s)),e}const _v="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",wv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",kv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Sv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Tv=Is(_v),Cv=Is(wv),Ev=Is(kv),Av=Is(Sv),Rv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Iv=Is(Rv);function Cp(e){return!!e||e===""}function Ov(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Rn(e[n],t[n]);return s}function Rn(e,t){if(e===t)return!0;let s=bd(e),n=bd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=ss(e),n=ss(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Ov(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Rn(e[l],t[l]))return!1}}return String(e)===String(t)}function So(e,t){return e.findIndex(s=>Rn(s,t))}const Ep=e=>!!(e&&e.__v_isRef===!0),Ap=e=>Be(e)?e:e==null?"":Ce(e)||Xe(e)&&(e.toString===kp||!Fe(e.toString))?Ep(e)?Ap(e.value):JSON.stringify(e,Rp,2):String(e),Rp=(e,t)=>Ep(t)?Rp(e,t.value):ja(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Wo(n,i)+" =>"]=a,s),{})}:wa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Wo(s))}:ss(t)?Wo(t):Xe(t)&&!Ce(t)&&!yo(t)?String(t):t,Wo=(e,t="")=>{var s;return ss(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Lv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Pt;class oc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Pt&&(Pt.active?(this.parent=Pt,this.index=(Pt.scopes||(Pt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Pt;try{return Pt=this,t()}finally{Pt=s}}}on(){++this._on===1&&(this.prevScope=Pt,Pt=this)}off(){if(this._on>0&&--this._on===0){if(Pt===this)Pt=this.prevScope;else{let t=Pt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Nv(e){return new oc(e)}function Ip(){return Pt}function Dv(e,t=!1){Pt&&Pt.cleanups.push(e)}let pt;const Zo=new WeakSet;class Hi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Pt&&(Pt.active?Pt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Zo.has(this)&&(Zo.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Lp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,xd(this),Np(this);const t=pt,s=Vs;pt=this,Vs=!0;try{return this.fn()}finally{Dp(this),pt=t,Vs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)dc(t);this.deps=this.depsTail=void 0,xd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Zo.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Sr(this)&&this.run()}get dirty(){return Sr(this)}}let Op=0,Ii,Oi;function Lp(e,t=!1){if(e.flags|=8,t){e.next=Oi,Oi=e;return}e.next=Ii,Ii=e}function rc(){Op++}function cc(){if(--Op>0)return;if(Oi){let t=Oi;for(Oi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ii;){let t=Ii;for(Ii=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Np(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Dp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),dc(n),Pv(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Sr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Pp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Pp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===zi)||(e.globalVersion=zi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Sr(e))))return;e.flags|=2;const t=e.dep,s=pt,n=Vs;pt=e,Vs=!0;try{Np(e);const a=e.fn(e._value);(t.version===0||$t(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{pt=s,Vs=n,Dp(e),e.flags&=-3}}function dc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)dc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Pv(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Mv(e,t){e.effect instanceof Hi&&(e=e.effect.fn);const s=new Hi(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Fv(e){e.effect.stop()}let Vs=!0;const Mp=[];function In(){Mp.push(Vs),Vs=!1}function On(){const e=Mp.pop();Vs=e===void 0?!0:e}function xd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=pt;pt=void 0;try{t()}finally{pt=s}}}let zi=0;class $v{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class To{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!pt||!Vs||pt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==pt)s=this.activeLink=new $v(pt,this),pt.deps?(s.prevDep=pt.depsTail,pt.depsTail.nextDep=s,pt.depsTail=s):pt.deps=pt.depsTail=s,Fp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=pt.depsTail,s.nextDep=void 0,pt.depsTail.nextDep=s,pt.depsTail=s,pt.deps===s&&(pt.deps=n)}return s}trigger(t){this.version++,zi++,this.notify(t)}notify(t){rc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{cc()}}}function Fp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Fp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const zl=new WeakMap,pa=Symbol(""),Tr=Symbol(""),ji=Symbol("");function Xt(e,t,s){if(Vs&&pt){let n=zl.get(e);n||zl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new To),a.map=n,a.key=s),a.track()}}function xn(e,t,s,n,a,i){const l=zl.get(e);if(!l){zi++;return}const o=r=>{r&&r.trigger()};if(rc(),t==="clear")l.forEach(o);else{const r=Ce(e),c=r&&xo(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===ji||!ss(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(ji)),t){case"add":r?c&&o(l.get("length")):(o(l.get(pa)),ja(e)&&o(l.get(Tr)));break;case"delete":r||(o(l.get(pa)),ja(e)&&o(l.get(Tr)));break;case"set":ja(e)&&o(l.get(pa));break}}cc()}function Bv(e,t){const s=zl.get(e);return s&&s.get(t)}function Ia(e){const t=Je(e);return t===e?t:(Xt(t,"iterate",ji),ws(e)?t:t.map(Gs))}function Co(e){return Xt(e=Je(e),"iterate",ji),e}function nn(e,t){return ln(e)?Qa(Cn(e)?Gs(t):t):Gs(t)}const Uv={__proto__:null,[Symbol.iterator](){return Jo(this,Symbol.iterator,e=>nn(this,e))},concat(...e){return Ia(this).concat(...e.map(t=>Ce(t)?Ia(t):t))},entries(){return Jo(this,"entries",e=>(e[1]=nn(this,e[1]),e))},every(e,t){return pn(this,"every",e,t,void 0,arguments)},filter(e,t){return pn(this,"filter",e,t,s=>s.map(n=>nn(this,n)),arguments)},find(e,t){return pn(this,"find",e,t,s=>nn(this,s),arguments)},findIndex(e,t){return pn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return pn(this,"findLast",e,t,s=>nn(this,s),arguments)},findLastIndex(e,t){return pn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return pn(this,"forEach",e,t,void 0,arguments)},includes(...e){return Yo(this,"includes",e)},indexOf(...e){return Yo(this,"indexOf",e)},join(e){return Ia(this).join(e)},lastIndexOf(...e){return Yo(this,"lastIndexOf",e)},map(e,t){return pn(this,"map",e,t,void 0,arguments)},pop(){return mi(this,"pop")},push(...e){return mi(this,"push",e)},reduce(e,...t){return _d(this,"reduce",e,t)},reduceRight(e,...t){return _d(this,"reduceRight",e,t)},shift(){return mi(this,"shift")},some(e,t){return pn(this,"some",e,t,void 0,arguments)},splice(...e){return mi(this,"splice",e)},toReversed(){return Ia(this).toReversed()},toSorted(e){return Ia(this).toSorted(e)},toSpliced(...e){return Ia(this).toSpliced(...e)},unshift(...e){return mi(this,"unshift",e)},values(){return Jo(this,"values",e=>nn(this,e))}};function Jo(e,t,s){const n=Co(e),a=n[t]();return n!==e&&!ws(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Hv=Array.prototype;function pn(e,t,s,n,a,i){const l=Co(e),o=l!==e&&!ws(e),r=l[t];if(r!==Hv[t]){const u=r.apply(e,i);return o?Gs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,nn(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function _d(e,t,s,n){const a=Co(e),i=a!==e&&!ws(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=nn(e,c)),s.call(this,c,nn(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?nn(e,r):r}function Yo(e,t,s){const n=Je(e);Xt(n,"iterate",ji);const a=n[t](...s);return(a===-1||a===!1)&&ol(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function mi(e,t,s=[]){In(),rc();const n=Je(e)[t].apply(e,s);return cc(),On(),n}const zv=Is("__proto__,__v_isRef,__isVue"),$p=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(ss));function jv(e){ss(e)||(e=String(e));const t=Je(this);return Xt(t,"has",e),t.hasOwnProperty(e)}class Bp{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?qp:Vp:i?jp:zp).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let r;if(l&&(r=Uv[s]))return r;if(s==="hasOwnProperty")return jv}const o=Reflect.get(t,s,Ot(t)?t:n);if((ss(s)?$p.has(s):zv(s))||(a||Xt(t,"get",s),i))return o;if(Ot(o)){const r=l&&xo(s)?o:o.value;return a&&Xe(r)?jl(r):r}return Xe(o)?a?jl(o):Yn(o):o}}class Up extends Bp{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&xo(s);if(!this._isShallow){const c=ln(i);if(!ws(n)&&!ln(n)&&(i=Je(i),n=Je(n)),!l&&Ot(i)&&!Ot(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:tt(t,s),r=Reflect.set(t,s,n,Ot(t)?t:a);return t===Je(a)&&(o?$t(n,i)&&xn(t,"set",s,n):xn(t,"add",s,n)),r}deleteProperty(t,s){const n=tt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&xn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!ss(s)||!$p.has(s))&&Xt(t,"has",s),n}ownKeys(t){return Xt(t,"iterate",Ce(t)?"length":pa),Reflect.ownKeys(t)}}class Hp extends Bp{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Vv=new Up,qv=new Hp,Gv=new Up(!0),Kv=new Hp(!0),Cr=e=>e,gl=e=>Reflect.getPrototypeOf(e);function Wv(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=ja(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?Cr:t?Qa:Gs;return!t&&Xt(i,"iterate",r?Tr:pa),qe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function bl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Zv(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),o=Je(a);e||($t(a,o)&&Xt(l,"get",a),Xt(l,"get",o));const{has:r}=gl(l),c=t?Cr:e?Qa:Gs;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Xt(Je(a),"iterate",pa),a.size},has(a){const i=this.__v_raw,l=Je(i),o=Je(a);return e||($t(a,o)&&Xt(l,"has",a),Xt(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Je(o),c=t?Cr:e?Qa:Gs;return!e&&Xt(r,"iterate",pa),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:bl("add"),set:bl("set"),delete:bl("delete"),clear:bl("clear")}:{add(a){const i=Je(this),l=gl(i),o=Je(a),r=!t&&!ws(a)&&!ln(a)?o:a;return l.has.call(i,r)||$t(a,r)&&l.has.call(i,a)||$t(o,r)&&l.has.call(i,o)||(i.add(r),xn(i,"add",r,r)),this},set(a,i){!t&&!ws(i)&&!ln(i)&&(i=Je(i));const l=Je(this),{has:o,get:r}=gl(l);let c=o.call(l,a);c||(a=Je(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?$t(i,d)&&xn(l,"set",a,i):xn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:o}=gl(i);let r=l.call(i,a);r||(a=Je(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&xn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&xn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Wv(a,e,t)}),s}function Eo(e,t){const s=Zv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(tt(s,a)&&a in n?s:n,a,i)}const Jv={get:Eo(!1,!1)},Yv={get:Eo(!1,!0)},Qv={get:Eo(!0,!1)},Xv={get:Eo(!0,!0)},zp=new WeakMap,jp=new WeakMap,Vp=new WeakMap,qp=new WeakMap;function eg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Yn(e){return ln(e)?e:Ao(e,!1,Vv,Jv,zp)}function uc(e){return Ao(e,!1,Gv,Yv,jp)}function jl(e){return Ao(e,!0,qv,Qv,Vp)}function tg(e){return Ao(e,!0,Kv,Xv,qp)}function Ao(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=eg(dv(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function Cn(e){return ln(e)?Cn(e.__v_raw):!!(e&&e.__v_isReactive)}function ln(e){return!!(e&&e.__v_isReadonly)}function ws(e){return!!(e&&e.__v_isShallow)}function ol(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Gp(e){return!tt(e,"__v_skip")&&Object.isExtensible(e)&&Sp(e,"__v_skip",!0),e}const Gs=e=>Xe(e)?Yn(e):e,Qa=e=>Xe(e)?jl(e):e;function Ot(e){return e?e.__v_isRef===!0:!1}function f(e){return Kp(e,!1)}function pc(e){return Kp(e,!0)}function Kp(e,t){return Ot(e)?e:new sg(e,t)}class sg{constructor(t,s){this.dep=new To,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:Gs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ws(t)||ln(t);t=n?t:Je(t),$t(t,s)&&(this._rawValue=t,this._value=n?t:Gs(t),this.dep.trigger())}}function ng(e){e.dep&&e.dep.trigger()}function an(e){return Ot(e)?e.value:e}function ag(e){return Fe(e)?e():an(e)}const ig={get:(e,t,s)=>t==="__v_raw"?e:an(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Ot(a)&&!Ot(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function fc(e){return Cn(e)?e:new Proxy(e,ig)}class lg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new To,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Wp(e){return new lg(e)}function og(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=Zp(e,s);return t}class rg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=ss(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!Ce(t)||ss(this._key)||!xo(this._key))do a=!ol(i)||ws(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=an(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Ot(this._raw[this._key])){const s=this._object[this._key];if(Ot(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Bv(this._raw,this._key)}}class cg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function dg(e,t,s){return Ot(e)?e:Fe(e)?new cg(e):Xe(e)&&arguments.length>1?Zp(e,t,s):f(e)}function Zp(e,t,s){return new rg(e,t,s)}class ug{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new To(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=zi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&pt!==this)return Lp(this,!0),!0}get value(){const t=this.dep.track();return Pp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function pg(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new ug(n,a,s)}const fg={GET:"get",HAS:"has",ITERATE:"iterate"},hg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},yl={},Vl=new WeakMap;let Vn;function mg(){return Vn}function Jp(e,t=!1,s=Vn){if(s){let n=Vl.get(s);n||Vl.set(s,n=[]),n.push(e)}}function vg(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>a?b:ws(b)||a===!1||a===0?_n(b,1):_n(b);let d,u,p,h,m=!1,v=!1;if(Ot(e)?(u=()=>e.value,m=ws(e)):Cn(e)?(u=()=>c(e),m=!0):Ce(e)?(v=!0,m=e.some(b=>Cn(b)||ws(b)),u=()=>e.map(b=>{if(Ot(b))return b.value;if(Cn(b))return c(b);if(Fe(b))return r?r(b,2):b()})):Fe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){In();try{p()}finally{On()}}const b=Vn;Vn=d;try{return r?r(e,3,[h]):e(h)}finally{Vn=b}}:u=Gt,t&&a){const b=u,S=a===!0?1/0:a;u=()=>_n(b(),S)}const k=Ip(),R=()=>{d.stop(),k&&k.active&&ic(k.effects,d)};if(i&&t){const b=t;t=(...S)=>{const w=b(...S);return R(),w}}let y=v?new Array(e.length).fill(yl):yl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const S=d.run();if(b||a||m||(v?S.some((w,A)=>$t(w,y[A])):$t(S,y))){p&&p();const w=Vn;Vn=d;try{const A=[S,y===yl?void 0:v&&y[0]===yl?[]:y,h];y=S,r?r(t,3,A):t(...A)}finally{Vn=w}}}else d.run()};return o&&o(g),d=new Hi(u),d.scheduler=l?()=>l(g,!1):g,h=b=>Jp(b,!1,d),p=d.onStop=()=>{const b=Vl.get(d);if(b){if(r)r(b,4);else for(const S of b)S();Vl.delete(d)}},t?n?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),R.pause=d.pause.bind(d),R.resume=d.resume.bind(d),R.stop=R,R}function _n(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Ot(e))_n(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)_n(e[n],t,s);else if(wa(e)||ja(e))e.forEach(n=>{_n(n,t,s)});else if(yo(e)){for(const n in e)_n(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&_n(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Yp=[];function gg(e){Yp.push(e)}function bg(){Yp.pop()}function yg(e,t){}const xg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},_g={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function ui(e,t,s,n){try{return n?e(...n):e()}catch(a){Sa(a,t,s)}}function Rs(e,t,s,n){if(Fe(e)){const a=ui(e,t,s,n);return a&&lc(a)&&a.catch(i=>{Sa(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Rs(e[i],t,s,n));return a}}function Sa(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){In(),ui(i,null,10,[e,r,c]),On();return}}wg(e,s,a,n,l)}function wg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const cs=[];let tn=-1;const Ga=[];let qn=null,Ma=0;const Qp=Promise.resolve();let ql=null;function Rt(e){const t=ql||Qp;return e?t.then(this?e.bind(this):e):t}function kg(e){let t=tn+1,s=cs.length;for(;t<s;){const n=t+s>>>1,a=cs[n],i=qi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function hc(e){if(!(e.flags&1)){const t=qi(e),s=cs[cs.length-1];!s||!(e.flags&2)&&t>=qi(s)?cs.push(e):cs.splice(kg(t),0,e),e.flags|=1,Xp()}}function Xp(){ql||(ql=Qp.then(ef))}function Vi(e){Ce(e)?Ga.push(...e):qn&&e.id===-1?qn.splice(Ma+1,0,e):e.flags&1||(Ga.push(e),e.flags|=1),Xp()}function wd(e,t,s=tn+1){for(;s<cs.length;s++){const n=cs[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;cs.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Gl(e){if(Ga.length){const t=[...new Set(Ga)].sort((s,n)=>qi(s)-qi(n));if(Ga.length=0,qn){qn.push(...t);return}for(qn=t,Ma=0;Ma<qn.length;Ma++){const s=qn[Ma];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}qn=null,Ma=0}}const qi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function ef(e){try{for(tn=0;tn<cs.length;tn++){const t=cs[tn];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),ui(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;tn<cs.length;tn++){const t=cs[tn];t&&(t.flags&=-2)}tn=-1,cs.length=0,Gl(),ql=null,(cs.length||Ga.length)&&ef()}}let Fa,xl=[];function tf(e,t){var s,n;Fa=e,Fa?(Fa.enabled=!0,xl.forEach(({event:a,args:i})=>Fa.emit(a,...i)),xl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{tf(i,t)}),setTimeout(()=>{Fa||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,xl=[])},3e3)):xl=[]}let qt=null,Ro=null;function Gi(e){const t=qt;return qt=e,Ro=e&&e.type.__scopeId||null,t}function Sg(e){Ro=e}function Tg(){Ro=null}const Cg=e=>mc;function mc(e,t=qt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ji(-1);const i=Gi(t);let l;try{l=e(...a)}finally{Gi(i),n._d&&Ji(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function Eg(e,t){if(qt===null)return e;const s=ul(qt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ke]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&_n(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function sn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(In(),Rs(r,s,8,[e.el,o,e,t]),On())}}function Li(e,t){if(Vt){let s=Vt.provides;const n=Vt.parent&&Vt.parent.provides;n===s&&(s=Vt.provides=Object.create(n)),s[e]=t}}function $s(e,t,s=!1){const n=ps();if(n||fa){let a=fa?fa._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function Ag(){return!!(ps()||fa)}const sf=Symbol.for("v-scx"),nf=()=>$s(sf);function Rg(e,t){return rl(e,null,t)}function Ig(e,t){return rl(e,null,{flush:"post"})}function af(e,t){return rl(e,null,{flush:"sync"})}function us(e,t,s){return rl(e,t,s)}function rl(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,o=qe({},s),r=t&&n||!t&&i!=="post";let c;if(ba){if(i==="sync"){const h=nf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Gt,h.resume=Gt,h.pause=Gt,h}}const d=Vt;o.call=(h,m,v)=>Rs(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{At(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():hc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=vg(e,t,o);return ba&&(c?c.push(p):r&&p()),p}function Og(e,t,s){const n=this.proxy,a=Be(e)?e.includes(".")?lf(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=pi(this),o=rl(a,i.bind(n),s);return l(),o}function lf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const zn=new WeakMap,of=Symbol("_vte"),rf=e=>e.__isTeleport,ra=e=>e&&(e.disabled||e.disabled===""),Lg=e=>e&&(e.defer||e.defer===""),kd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Sd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Er=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Ng={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:k,parentNode:R}}=c,y=ra(t.props);let{dynamicChildren:g}=t;const b=(A,C,x)=>{A.shapeFlag&16&&d(A.children,C,x,a,i,l,o,r)},S=(A=t)=>{const C=ra(A.props),x=A.target=Er(A.props,m),N=Ar(x,A,v,h);x&&(l!=="svg"&&kd(x)?l="svg":l!=="mathml"&&Sd(x)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(x),C||(b(A,x,N),Ti(A,!1)))},w=A=>{const C=()=>{if(zn.get(A)===C){if(zn.delete(A),ra(A.props)){const x=R(A.el)||s;b(A,x,A.anchor),Ti(A,!0)}S(A)}};zn.set(A,C),At(C,i)};if(e==null){const A=t.el=v(""),C=t.anchor=v("");if(h(A,s,n),h(C,s,n),Lg(t.props)||i&&i.pendingBranch){w(t);return}y&&(b(t,s,C),Ti(t,!0)),S()}else{t.el=e.el;const A=t.anchor=e.anchor,C=zn.get(e);if(C){C.flags|=8,zn.delete(e),w(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,N=t.targetAnchor=e.targetAnchor,B=ra(e.props),E=B?s:x,M=B?A:N;if(l==="svg"||kd(x)?l="svg":(l==="mathml"||Sd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,E,a,i,l,o),Cc(e,t,!0)):r||u(e,t,E,M,a,i,l,o,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):_l(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=Er(t.props,m);V&&_l(t,V,null,c,0)}else B&&_l(t,x,N,c,1);Ti(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!ra(p),m=zn.get(e);if(m&&(m.flags|=8,zn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const k=o[v];n(k,t,s,h,!!k.dynamicChildren)}},move:_l,hydrate:Dg};function _l(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!zn.has(e)&&(!u||ra(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function Dg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(k,R){let y=R;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(k,R){R.anchor=u(l(k),R,o(k),s,n,a,i)}const m=t.target=Er(t.props,r),v=ra(t.props);if(m){const k=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,k),t.targetAnchor||Ar(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,k),t.targetAnchor||Ar(m,t,d,c),u(k&&l(k),t,m,s,n,a,i))),Ti(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Pg=Ng;function Ti(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Ar(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[of]=l,e&&(n(i,e,a),n(l,e,a)),l}const Ds=Symbol("_leaveCb"),vi=Symbol("_enterCb");function vc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),No(()=>{e.isUnmounting=!0}),e}const Ns=[Function,Array],gc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ns,onEnter:Ns,onAfterEnter:Ns,onEnterCancelled:Ns,onBeforeLeave:Ns,onLeave:Ns,onAfterLeave:Ns,onLeaveCancelled:Ns,onBeforeAppear:Ns,onAppear:Ns,onAfterAppear:Ns,onAppearCancelled:Ns},cf=e=>{const t=e.subTree;return t.component?cf(t.component):t},Mg={name:"BaseTransition",props:gc,setup(e,{slots:t}){const s=ps(),n=vc();return()=>{const a=t.default&&Io(t.default(),!0),i=a&&a.length?df(a):s.subTree?Gf():void 0;if(!i)return;const l=Je(e),{mode:o}=l;if(n.isLeaving)return Qo(i);const r=Td(i);if(!r)return Qo(i);let c=Xa(r,l,n,s,u=>c=u);r.type!==Et&&Ln(r,c);let d=s.subTree&&Td(s.subTree);if(d&&d.type!==Et&&!js(d,r)&&cf(s).type!==Et){let u=Xa(d,l,n,s);if(Ln(d,u),o==="out-in"&&r.type!==Et)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Qo(i);o==="in-out"&&r.type!==Et?u.delayLeave=(p,h,m)=>{const v=pf(n,d);v[String(d.key)]=d,p[Ds]=()=>{h(),p[Ds]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function df(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Et){t=s;break}}return t}const uf=Mg;function pf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Xa(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:k,onAppear:R,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),S=pf(s,e),w=(x,N)=>{x&&Rs(x,n,9,N)},A=(x,N)=>{const B=N[1];w(x,N),Ce(x)?x.every(E=>E.length<=1)&&B():x.length<=1&&B()},C={mode:l,persisted:o,beforeEnter(x){let N=r;if(!s.isMounted)if(i)N=k||r;else return;x[Ds]&&x[Ds](!0);const B=S[b];B&&js(e,B)&&B.el[Ds]&&B.el[Ds](),w(N,[x])},enter(x){if(S[b]===e)return;let N=c,B=d,E=u;if(!s.isMounted)if(i)N=R||c,B=y||d,E=g||u;else return;let M=!1;x[vi]=q=>{M||(M=!0,q?w(E,[x]):w(B,[x]),C.delayedLeave&&C.delayedLeave(),x[vi]=void 0)};const V=x[vi].bind(null,!1);N?A(N,[x,V]):V()},leave(x,N){const B=String(e.key);if(x[vi]&&x[vi](!0),s.isUnmounting)return N();w(p,[x]);let E=!1;x[Ds]=V=>{E||(E=!0,N(),V?w(v,[x]):w(m,[x]),x[Ds]=void 0,S[B]===e&&delete S[B])};const M=x[Ds].bind(null,!1);S[B]=e,h?A(h,[x,M]):M()},clone(x){const N=Xa(x,t,s,n,a);return a&&a(N),N}};return C}function Qo(e){if(dl(e))return e=on(e),e.children=null,e}function Td(e){if(!dl(e))return rf(e.type)&&e.children?df(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function Ln(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Ln(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Io(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Bt?(l.patchFlag&128&&a++,n=n.concat(Io(l.children,t,o))):(t||l.type!==Et)&&n.push(o!=null?on(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function cl(e,t){return Fe(e)?qe({name:e.name},t,{setup:e}):e}function Fg(){const e=ps();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function bc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function $g(e){const t=ps(),s=pc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Cd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Kl=new WeakMap;function Ka(e,t,s,n,a=!1){if(Ce(e)){e.forEach((v,k)=>Ka(v,t&&(Ce(t)?t[k]:t),s,n,a));return}if(En(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ka(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ul(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ke?o.refs={}:o.refs,u=o.setupState,p=Je(u),h=u===Ke?Ua:v=>Cd(d,v)?!1:tt(p,v),m=(v,k)=>!(k&&Cd(d,k));if(c!=null&&c!==r){if(Ed(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(Ot(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(r))ui(r,o,12,[l,d]);else{const v=Be(r),k=Ot(r);if(v||k){const R=()=>{if(e.f){const y=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ce(y)&&ic(y,i);else if(Ce(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):k&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{R(),Kl.delete(e)};y.id=-1,Kl.set(e,y),At(y,s)}else Ed(e),R()}}}function Ed(e){const t=Kl.get(e);t&&(t.flags|=8,Kl.delete(e))}let Ad=!1;const Oa=()=>{Ad||(console.error("Hydration completed but contains mismatches."),Ad=!0)},Bg=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Ug=e=>e.namespaceURI.includes("MathML"),wl=e=>{if(e.nodeType===1){if(Bg(e))return"svg";if(Ug(e))return"mathml"}},Ha=e=>e.nodeType===8;function Hg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),Gl(),b._vnode=g;return}u(b.firstChild,g,null,null,null),Gl(),b._vnode=g},u=(g,b,S,w,A,C=!1)=>{C=C||!!b.dynamicChildren;const x=Ha(g)&&g.data==="[",N=()=>v(g,b,S,w,A,x),{type:B,ref:E,shapeFlag:M,patchFlag:V}=b;let q=g.nodeType;b.el=g,V===-2&&(C=!1,b.dynamicChildren=null);let D=null;switch(B){case Wn:q!==3?b.children===""?(r(b.el=a(""),l(g),g),D=g):D=N():(g.data!==b.children&&(Oa(),g.data=b.children),D=i(g));break;case Et:y(g)?(D=i(g),R(b.el=g.content.firstChild,g,S)):q!==8||x?D=N():D=i(g);break;case ha:if(x&&(g=i(g),q=g.nodeType),q===1||q===3){D=g;const L=!b.children.length;for(let I=0;I<b.staticCount;I++)L&&(b.children+=D.nodeType===1?D.outerHTML:D.data),I===b.staticCount-1&&(b.anchor=D),D=i(D);return x?i(D):D}else N();break;case Bt:x?D=m(g,b,S,w,A,C):D=N();break;default:if(M&1)(q!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?D=N():D=p(g,b,S,w,A,C);else if(M&6){b.slotScopeIds=A;const L=l(g);if(x?D=k(g):Ha(g)&&g.data==="teleport start"?D=k(g,g.data,"teleport end"):D=i(g),t(b,L,null,S,w,wl(L),C),En(b)&&!b.type.__asyncResolved){let I;x?(I=yt(Bt),I.anchor=D?D.previousSibling:L.lastChild):I=g.nodeType===3?Ac(""):yt("div"),I.el=g,b.component.subTree=I}}else M&64?q!==8?D=N():D=b.type.hydrate(g,b,S,w,A,C,e,h):M&128&&(D=b.type.hydrate(g,b,S,w,wl(l(g)),A,C,e,u))}return E!=null&&Ka(E,null,w,b),D},p=(g,b,S,w,A,C)=>{C=C||!!b.dynamicChildren;const{type:x,props:N,patchFlag:B,shapeFlag:E,dirs:M,transition:V}=b,q=x==="input"||x==="option";if(q||B!==-1){M&&sn(b,null,S,"created");let D=!1;if(y(g)){D=Ff(null,V)&&S&&S.vnode.props&&S.vnode.props.appear;const I=g.content.firstChild;if(D){const U=I.getAttribute("class");U&&(I.$cls=U),V.beforeEnter(I)}R(I,g,S),b.el=g=I}if(E&16&&!(N&&(N.innerHTML||N.textContent))){let I=h(g.firstChild,b,g,S,w,A,C);for(I&&!kl(g,1)&&Oa();I;){const U=I;I=I.nextSibling,o(U)}}else if(E&8){let I=b.children;I[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(I=I.slice(1));const{textContent:U}=g;U!==I&&U!==I.replace(/\r\n|\r/g,`
`)&&(kl(g,0)||Oa(),g.textContent=b.children)}if(N){if(q||!C||B&48){const I=g.tagName.includes("-");for(const U in N)(q&&(U.endsWith("value")||U==="indeterminate")||_a(U)&&!Tn(U)||U[0]==="."||I&&!Tn(U))&&n(g,U,null,N[U],void 0,S)}else if(N.onClick)n(g,"onClick",null,N.onClick,void 0,S);else if(B&4&&Cn(N.style))for(const I in N.style)N.style[I]}let L;(L=N&&N.onVnodeBeforeMount)&&gs(L,S,b),M&&sn(b,null,S,"beforeMount"),((L=N&&N.onVnodeMounted)||M||D)&&Hf(()=>{L&&gs(L,S,b),D&&V.enter(g),M&&sn(b,null,S,"mounted")},w)}return g.nextSibling},h=(g,b,S,w,A,C,x)=>{x=x||!!b.dynamicChildren;const N=b.children,B=N.length;let E=!1;for(let M=0;M<B;M++){const V=x?N[M]:N[M]=ys(N[M]),q=V.type===Wn;g?(q&&!x&&M+1<B&&ys(N[M+1]).type===Wn&&(r(a(g.data.slice(V.children.length)),S,i(g)),g.data=V.children),g=u(g,V,w,A,C,x)):q&&!V.children?r(V.el=a(""),S):(E||(E=!0,kl(S,1)||Oa()),s(null,V,S,null,w,A,wl(S),C))}return g},m=(g,b,S,w,A,C)=>{const{slotScopeIds:x}=b;x&&(A=A?A.concat(x):x);const N=l(g),B=h(i(g),b,N,S,w,A,C);return B&&Ha(B)&&B.data==="]"?i(b.anchor=B):(Oa(),r(b.anchor=c("]"),N,B),B)},v=(g,b,S,w,A,C)=>{if(kl(g.parentElement,1)||Oa(),b.el=null,C){const B=k(g);for(;;){const E=i(g);if(E&&E!==B)o(E);else break}}const x=i(g),N=l(g);return o(g),s(null,b,N,x,S,w,wl(N),A),S&&(S.vnode.el=b.el,Po(S,b.el)),x},k=(g,b="[",S="]")=>{let w=0;for(;g;)if(g=i(g),g&&Ha(g)&&(g.data===b&&w++,g.data===S)){if(w===0)return i(g);w--}return g},R=(g,b,S)=>{const w=b.parentNode;w&&w.replaceChild(g,b);let A=S;for(;A;)A.vnode.el===b&&(A.vnode.el=A.subTree.el=g),A=A.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Rd="data-allow-mismatch",zg={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function kl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Rd);)e=e.parentElement;const s=e&&e.getAttribute(Rd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(zg[t])}}const jg=ko().requestIdleCallback||(e=>setTimeout(e,1)),Vg=ko().cancelIdleCallback||(e=>clearTimeout(e)),qg=(e=1e4)=>t=>{const s=jg(t,{timeout:e});return()=>Vg(s)};function Gg(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Kg=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Gg(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Wg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Zg=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function Jg(e,t){if(Ha(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ha(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const En=e=>!!e.type.__asyncLoader;function Yg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((k,R)=>{r(v,()=>k(p()),()=>R(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return cl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,k){let R=!1;(v.bu||(v.bu=[])).push(()=>R=!0);const y=()=>{R||k()},g=i?()=>{const b=i(y,S=>Jg(m,S));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Vt;if(bc(m),d)return()=>Sl(d,m);const v=S=>{c=null,Sa(S,m,13,!n)};if(o&&m.suspense||ba)return h().then(S=>()=>Sl(S,m)).catch(S=>(v(S),()=>n?yt(n,{error:S}):null));const k=f(!1),R=f(),y=f(!!a);let g,b;return gt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!k.value&&!R.value){const S=new Error(`Async component timed out after ${l}ms.`);v(S),R.value=S}},l)),h().then(()=>{m.isUnmounted||(k.value=!0,m.parent&&dl(m.parent.vnode)&&m.parent.update())}).catch(S=>{if(m.isUnmounted){c=null;return}v(S),R.value=S}),()=>{if(k.value&&d)return Sl(d,m);if(R.value&&n)return yt(n,{error:R.value});if(s&&!y.value)return Sl(s,m)}}})}function Sl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=yt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const dl=e=>e.type.__isKeepAlive,Qg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ps(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,g,b,S,w)=>{const A=y.component;c(y,g,b,0,o),r(A.vnode,y,g,b,A,o,S,y.slotScopeIds,w),At(()=>{A.isDeactivated=!1,A.a&&qa(A.a);const C=y.props&&y.props.onVnodeMounted;C&&gs(C,A.parent,y)},o)},n.deactivate=y=>{const g=y.component;Zl(g.m),Zl(g.a),c(y,p,null,1,o),At(()=>{g.da&&qa(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&gs(b,g.parent,y),g.isDeactivated=!0},o)};function h(y){Xo(y),d(y,s,o,!0)}function m(y){a.forEach((g,b)=>{const S=Fr(En(g)?g.type.__asyncResolved||{}:g.type);S&&!y(S)&&v(b)})}function v(y){const g=a.get(y);g&&(!l||!js(g,l))?h(g):l&&Xo(l),a.delete(y),i.delete(y)}us(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Ci(y,b)),g&&m(b=>!Ci(g,b))},{flush:"post",deep:!0});let k=null;const R=()=>{k!=null&&(Jl(s.subTree.type)?At(()=>{a.set(k,Tl(s.subTree))},s.subTree.suspense):a.set(k,Tl(s.subTree)))};return Ge(R),Lo(R),No(()=>{a.forEach(y=>{const{subTree:g,suspense:b}=s,S=Tl(g);if(y.type===S.type&&y.key===S.key){Xo(S);const w=S.component.da;w&&At(w,b);return}h(y)})}),()=>{if(k=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!Nn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Tl(g);if(b.type===Et)return l=null,b;const S=b.type,w=Fr(En(b)?b.type.__asyncResolved||{}:S),{include:A,exclude:C,max:x}=e;if(A&&(!w||!Ci(A,w))||C&&w&&Ci(C,w))return b.shapeFlag&=-257,l=b,g;const N=b.key==null?S:b.key,B=a.get(N);return b.el&&(b=on(b),g.shapeFlag&128&&(g.ssContent=b)),k=N,B?(b.el=B.el,b.component=B.component,b.transition&&Ln(b,b.transition),b.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,Jl(g.type)?g:b}}},Xg=Qg;function Ci(e,t){return Ce(e)?e.some(s=>Ci(s,t)):Be(e)?e.split(",").includes(t):cv(e)?(e.lastIndex=0,e.test(t)):!1}function hs(e,t){ff(e,"a",t)}function ns(e,t){ff(e,"da",t)}function ff(e,t,s=Vt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Oo(t,n,s),s){let a=s.parent;for(;a&&a.parent;)dl(a.parent.vnode)&&eb(n,t,s,a),a=a.parent}}function eb(e,t,s,n){const a=Oo(t,e,n,!0);gt(()=>{ic(n[t],a)},s)}function Xo(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Tl(e){return e.shapeFlag&128?e.ssContent:e}function Oo(e,t,s=Vt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{In();const o=pi(s),r=Rs(t,s,e,l);return o(),On(),r});return n?a.unshift(i):a.push(i),i}}const Dn=e=>(t,s=Vt)=>{(!ba||e==="sp")&&Oo(e,(...n)=>t(...n),s)},hf=Dn("bm"),Ge=Dn("m"),yc=Dn("bu"),Lo=Dn("u"),No=Dn("bum"),gt=Dn("um"),mf=Dn("sp"),vf=Dn("rtg"),gf=Dn("rtc");function bf(e,t=Vt){Oo("ec",e,t)}const xc="components",tb="directives";function sb(e,t){return _c(xc,e,!0,t)||e}const yf=Symbol.for("v-ndc");function nb(e){return Be(e)?_c(xc,e,!1)||e:e||yf}function ab(e){return _c(tb,e)}function _c(e,t,s=!0,n=!1){const a=qt||Vt;if(a){const i=a.type;if(e===xc){const o=Fr(i,!1);if(o&&(o===t||o===ct(t)||o===ka(ct(t))))return i}const l=Id(a[e]||i[e],t)||Id(a.appContext[e],t);return!l&&n?i:l}}function Id(e,t){return e&&(e[t]||e[ct(t)]||e[ka(ct(t))])}function ib(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||Be(e)){const o=l&&Cn(e);let r=!1,c=!1;o&&(r=!ws(e),c=ln(e),e=Co(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?Qa(Gs(e[d])):Gs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function lb(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function ob(e,t,s={},n,a){if(qt.ce||qt.parent&&En(qt.parent)&&qt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Zi(),Yl(Bt,null,[yt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Zi();const l=i&&wc(i(s)),o=s.key||l&&l.key,r=Yl(Bt,{key:(o&&!ss(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function wc(e){return e.some(t=>Nn(t)?!(t.type===Et||t.type===Bt&&!wc(t.children)):!0)?e:null}function rb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Va(n)]=e[n];return s}const Rr=e=>e?Zf(e)?ul(e):Rr(e.parent):null,Ni=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Rr(e.parent),$root:e=>Rr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>kc(e),$forceUpdate:e=>e.f||(e.f=()=>{hc(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>Og.bind(e)}),er=(e,t)=>e!==Ke&&!e.__isScriptSetup&&tt(e,t),Ir={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(er(n,t))return l[t]=1,n[t];if(a!==Ke&&tt(a,t))return l[t]=2,a[t];if(tt(i,t))return l[t]=3,i[t];if(s!==Ke&&tt(s,t))return l[t]=4,s[t];Or&&(l[t]=0)}}const c=Ni[t];let d,u;if(c)return t==="$attrs"&&Xt(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&tt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,tt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return er(a,t)?(a[t]=s,!0):n!==Ke&&tt(n,t)?(n[t]=s,!0):tt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ke&&o[0]!=="$"&&tt(e,o)||er(t,o)||tt(i,o)||tt(n,o)||tt(Ni,o)||tt(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:tt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},cb=qe({},Ir,{get(e,t){if(t!==Symbol.unscopables)return Ir.get(e,t,e)},has(e,t){return t[0]!=="_"&&!vv(t)}});function db(){return null}function ub(){return null}function pb(e){}function fb(e){}function hb(){return null}function mb(){}function vb(e,t){return null}function gb(){return xf().slots}function bb(){return xf().attrs}function xf(e){const t=ps();return t.setupContext||(t.setupContext=Xf(t))}function Ki(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function yb(e,t){const s=Ki(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function xb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):qe({},Ki(e),Ki(t))}function _b(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function wb(e){const t=ps(),s=ba;let n=e();Yi(),s&&Za(!1);const a=()=>{pi(t),s&&Za(!0)},i=()=>{ps()!==t&&t.scope.off(),Yi(),s&&Za(!1)};return lc(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Or=!0;function kb(e){const t=kc(e),s=e.proxy,n=e.ctx;Or=!1,t.beforeCreate&&Od(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:k,beforeDestroy:R,beforeUnmount:y,destroyed:g,unmounted:b,render:S,renderTracked:w,renderTriggered:A,errorCaptured:C,serverPrefetch:x,expose:N,inheritAttrs:B,components:E,directives:M,filters:V}=t;if(c&&Sb(c,n,null),l)for(const L in l){const I=l[L];Fe(I)&&(n[L]=I.bind(s))}if(a){const L=a.call(s,s);Xe(L)&&(e.data=Yn(L))}if(Or=!0,i)for(const L in i){const I=i[L],U=Fe(I)?I.bind(s,s):Fe(I.get)?I.get.bind(s,s):Gt,W=!Fe(I)&&Fe(I.set)?I.set.bind(s):Gt,K=J({get:U,set:W});Object.defineProperty(n,L,{enumerable:!0,configurable:!0,get:()=>K.value,set:X=>K.value=X})}if(o)for(const L in o)_f(o[L],n,s,L);if(r){const L=Fe(r)?r.call(s):r;Reflect.ownKeys(L).forEach(I=>{Li(I,L[I])})}d&&Od(d,e,"c");function D(L,I){Ce(I)?I.forEach(U=>L(U.bind(s))):I&&L(I.bind(s))}if(D(hf,u),D(Ge,p),D(yc,h),D(Lo,m),D(hs,v),D(ns,k),D(bf,C),D(gf,w),D(vf,A),D(No,y),D(gt,b),D(mf,x),Ce(N))if(N.length){const L=e.exposed||(e.exposed={});N.forEach(I=>{Object.defineProperty(L,I,{get:()=>s[I],set:U=>s[I]=U,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Gt&&(e.render=S),B!=null&&(e.inheritAttrs=B),E&&(e.components=E),M&&(e.directives=M),x&&bc(e)}function Sb(e,t,s=Gt){Ce(e)&&(e=Lr(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=$s(a.from||n,a.default,!0):i=$s(a.from||n):i=$s(a),Ot(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Od(e,t,s){Rs(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function _f(e,t,s,n){let a=n.includes(".")?lf(s,n):()=>s[n];if(Be(e)){const i=t[e];Fe(i)&&us(a,i)}else if(Fe(e))us(a,e.bind(s));else if(Xe(e))if(Ce(e))e.forEach(i=>_f(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&us(a,i,e)}}function kc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>Wl(r,c,l,!0)),Wl(r,t,l)),Xe(t)&&i.set(t,r),r}function Wl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Wl(e,i,s,!0),a&&a.forEach(l=>Wl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=Tb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Tb={data:Ld,props:Nd,emits:Nd,methods:Ei,computed:Ei,beforeCreate:ls,created:ls,beforeMount:ls,mounted:ls,beforeUpdate:ls,updated:ls,beforeDestroy:ls,beforeUnmount:ls,destroyed:ls,unmounted:ls,activated:ls,deactivated:ls,errorCaptured:ls,serverPrefetch:ls,components:Ei,directives:Ei,watch:Eb,provide:Ld,inject:Cb};function Ld(e,t){return t?e?function(){return qe(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function Cb(e,t){return Ei(Lr(e),Lr(t))}function Lr(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ls(e,t){return e?[...new Set([].concat(e,t))]:t}function Ei(e,t){return e?qe(Object.create(null),e,t):t}function Nd(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:qe(Object.create(null),Ki(e),Ki(t??{})):t}function Eb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=ls(e[n],t[n]);return s}function wf(){return{app:null,config:{isNativeTag:Ua,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Ab=0;function Rb(e,t){return function(n,a=null){Fe(n)||(n=qe({},n)),a!=null&&!Xe(a)&&(a=null);const i=wf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Ab++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:th,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||yt(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,ul(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Rs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=fa;fa=c;try{return d()}finally{fa=u}}};return c}}let fa=null;function Ib(e,t,s=Ke){const n=ps(),a=ct(t),i=xs(t),l=kf(e,a),o=Wp((r,c)=>{let d,u=Ke,p;return af(()=>{const h=e[a];$t(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!$t(m,d)&&!(u!==Ke&&$t(h,u)))return;const v=n.vnode.props,k=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));k||(d=h,c()),n.emit(`update:${t}`,m),$t(h,u)&&($t(h,m)&&!$t(m,p)||k&&u!==Ke&&!$t(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ke:o,done:!1}:{done:!0}}}},o}const kf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ct(t)}Modifiers`]||e[`${xs(t)}Modifiers`];function Ob(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&kf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Be(d)?d.trim():d)),l.number&&(a=s.map(wo)));let o,r=n[o=Va(t)]||n[o=Va(ct(t))];!r&&i&&(r=n[o=Va(xs(t))]),r&&Rs(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Rs(c,e,6,a)}}const Lb=new WeakMap;function Sf(e,t,s=!1){const n=s?Lb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Fe(e)){const r=c=>{const d=Sf(c,t,!0);d&&(o=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(Xe(e)&&n.set(e,null),null):(Ce(i)?i.forEach(r=>l[r]=null):qe(l,i),Xe(e)&&n.set(e,l),l)}function Do(e,t){return!e||!_a(t)?!1:(t=t.slice(2).replace(/Once$/,""),tt(e,t[0].toLowerCase()+t.slice(1))||tt(e,xs(t))||tt(e,t))}function Dl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,k=Gi(e);let R,y;try{if(s.shapeFlag&4){const b=a||n,S=b;R=ys(c.call(S,b,d,u,h,p,m)),y=o}else{const b=t;R=ys(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:Db(o)}}catch(b){Di.length=0,Sa(b,e,1),R=yt(Et)}let g=R;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:S}=g;b.length&&S&7&&(i&&b.some(bo)&&(y=Pb(y,i)),g=on(g,y,!1,!0))}return s.dirs&&(g=on(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Ln(g,s.transition),R=g,Gi(k),R}function Nb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Nn(a)){if(a.type!==Et||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Db=e=>{let t;for(const s in e)(s==="class"||s==="style"||_a(s))&&((t||(t={}))[s]=e[s]);return t},Pb=(e,t)=>{const s={};for(const n in e)(!bo(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Mb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Dd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Tf(l,n,p)&&!Do(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Dd(n,l,c):!0:!!l;return!1}function Dd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Tf(t,e,i)&&!Do(s,i))return!0}return!1}function Tf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!Rn(n,a):n!==a}function Po({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const Cf={},Ef=()=>Object.create(Cf),Af=e=>Object.getPrototypeOf(e)===Cf;function Fb(e,t,s,n=!1){const a={},i=Ef();e.propsDefaults=Object.create(null),Rf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:uc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function $b(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Je(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Do(e.emitsOptions,p))continue;const h=t[p];if(r)if(tt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=ct(p);a[m]=Nr(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{Rf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!tt(t,u)&&((d=xs(u))===u||!tt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Nr(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!tt(t,u))&&(delete i[u],c=!0)}c&&xn(e.attrs,"set","")}function Rf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Tn(r))continue;const c=t[r];let d;a&&tt(a,d=ct(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Do(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Je(s),c=o||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Nr(a,r,u,c[u],e,!tt(c,u))}}return l}function Nr(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=tt(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=pi(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===xs(s))&&(n=!0))}return n}const Bb=new WeakMap;function If(e,t,s=!1){const n=s?Bb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Fe(e)){const d=u=>{r=!0;const[p,h]=If(u,t,!0);qe(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return Xe(e)&&n.set(e,za),za;if(Ce(i))for(let d=0;d<i.length;d++){const u=ct(i[d]);Pd(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=ct(d);if(Pd(u)){const p=i[d],h=l[u]=Ce(p)||Fe(p)?{type:p}:qe({},p),m=h.type;let v=!1,k=!0;if(Ce(m))for(let R=0;R<m.length;++R){const y=m[R],g=Fe(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(k=!1)}else v=Fe(m)&&m.name==="Boolean";h[0]=v,h[1]=k,(v||tt(h,"default"))&&o.push(u)}}const c=[l,o];return Xe(e)&&n.set(e,c),c}function Pd(e){return e[0]!=="$"&&!Tn(e)}const Sc=e=>e==="_"||e==="_ctx"||e==="$stable",Tc=e=>Ce(e)?e.map(ys):[ys(e)],Ub=(e,t,s)=>{if(t._n)return t;const n=mc((...a)=>Tc(t(...a)),s);return n._c=!1,n},Of=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Sc(a))continue;const i=e[a];if(Fe(i))t[a]=Ub(a,i,n);else if(i!=null){const l=Tc(i);t[a]=()=>l}}},Lf=(e,t)=>{const s=Tc(t);e.slots.default=()=>s},Nf=(e,t,s)=>{for(const n in t)(s||!Sc(n))&&(e[n]=t[n])},Hb=(e,t,s)=>{const n=e.slots=Ef();if(e.vnode.shapeFlag&32){const a=t._;a?(Nf(n,t,s),s&&Sp(n,"_",a,!0)):Of(t,n)}else t&&Lf(e,t)},zb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Nf(a,t,s):(i=!t.$stable,Of(t,a)),l=t}else t&&(Lf(e,t),l={default:1});if(i)for(const o in a)!Sc(o)&&l[o]==null&&delete a[o]},At=Hf;function Df(e){return Mf(e)}function Pf(e){return Mf(e,Hg)}function Mf(e,t){const s=ko();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Gt,insertStaticContent:m}=e,v=(_,P,H,ie=null,se=null,ae=null,pe=void 0,fe=null,de=!!P.dynamicChildren)=>{if(_===P)return;_&&!js(_,P)&&(ie=Q(_),X(_,se,ae,!0),_=null),P.patchFlag===-2&&(de=!1,P.dynamicChildren=null);const{type:oe,ref:we,shapeFlag:ge}=P;switch(oe){case Wn:k(_,P,H,ie);break;case Et:R(_,P,H,ie);break;case ha:_==null&&y(P,H,ie,pe);break;case Bt:E(_,P,H,ie,se,ae,pe,fe,de);break;default:ge&1?S(_,P,H,ie,se,ae,pe,fe,de):ge&6?M(_,P,H,ie,se,ae,pe,fe,de):(ge&64||ge&128)&&oe.process(_,P,H,ie,se,ae,pe,fe,de,re)}we!=null&&se?Ka(we,_&&_.ref,ae,P||_,!P):we==null&&_&&_.ref!=null&&Ka(_.ref,null,ae,_,!0)},k=(_,P,H,ie)=>{if(_==null)n(P.el=o(P.children),H,ie);else{const se=P.el=_.el;P.children!==_.children&&c(se,P.children)}},R=(_,P,H,ie)=>{_==null?n(P.el=r(P.children||""),H,ie):P.el=_.el},y=(_,P,H,ie)=>{[_.el,_.anchor]=m(_.children,P,H,ie,_.el,_.anchor)},g=({el:_,anchor:P},H,ie)=>{let se;for(;_&&_!==P;)se=p(_),n(_,H,ie),_=se;n(P,H,ie)},b=({el:_,anchor:P})=>{let H;for(;_&&_!==P;)H=p(_),a(_),_=H;a(P)},S=(_,P,H,ie,se,ae,pe,fe,de)=>{if(P.type==="svg"?pe="svg":P.type==="math"&&(pe="mathml"),_==null)w(P,H,ie,se,ae,pe,fe,de);else{const oe=_.el&&_.el._isVueCE?_.el:null;try{oe&&oe._beginPatch(),x(_,P,se,ae,pe,fe,de)}finally{oe&&oe._endPatch()}}},w=(_,P,H,ie,se,ae,pe,fe)=>{let de,oe;const{props:we,shapeFlag:ge,transition:ke,dirs:Re}=_;if(de=_.el=l(_.type,ae,we&&we.is,we),ge&8?d(de,_.children):ge&16&&C(_.children,de,null,ie,se,tr(_,ae),pe,fe),Re&&sn(_,null,ie,"created"),A(de,_,_.scopeId,pe,ie),we){for(const me in we)me!=="value"&&!Tn(me)&&i(de,me,null,we[me],ae,ie);"value"in we&&i(de,"value",null,we.value,ae),(oe=we.onVnodeBeforeMount)&&gs(oe,ie,_)}Re&&sn(_,null,ie,"beforeMount");const F=Ff(se,ke);F&&ke.beforeEnter(de),n(de,P,H),((oe=we&&we.onVnodeMounted)||F||Re)&&At(()=>{try{oe&&gs(oe,ie,_),F&&ke.enter(de),Re&&sn(_,null,ie,"mounted")}finally{}},se)},A=(_,P,H,ie,se)=>{if(H&&h(_,H),ie)for(let ae=0;ae<ie.length;ae++)h(_,ie[ae]);if(se){let ae=se.subTree;if(P===ae||Jl(ae.type)&&(ae.ssContent===P||ae.ssFallback===P)){const pe=se.vnode;A(_,pe,pe.scopeId,pe.slotScopeIds,se.parent)}}},C=(_,P,H,ie,se,ae,pe,fe,de=0)=>{for(let oe=de;oe<_.length;oe++){const we=_[oe]=fe?bn(_[oe]):ys(_[oe]);v(null,we,P,H,ie,se,ae,pe,fe)}},x=(_,P,H,ie,se,ae,pe)=>{const fe=P.el=_.el;let{patchFlag:de,dynamicChildren:oe,dirs:we}=P;de|=_.patchFlag&16;const ge=_.props||Ke,ke=P.props||Ke;let Re;if(H&&na(H,!1),(Re=ke.onVnodeBeforeUpdate)&&gs(Re,H,P,_),we&&sn(P,_,H,"beforeUpdate"),H&&na(H,!0),(ge.innerHTML&&ke.innerHTML==null||ge.textContent&&ke.textContent==null)&&d(fe,""),oe?N(_.dynamicChildren,oe,fe,H,ie,tr(P,se),ae):pe||I(_,P,fe,null,H,ie,tr(P,se),ae,!1),de>0){if(de&16)B(fe,ge,ke,H,se);else if(de&2&&ge.class!==ke.class&&i(fe,"class",null,ke.class,se),de&4&&i(fe,"style",ge.style,ke.style,se),de&8){const F=P.dynamicProps;for(let me=0;me<F.length;me++){const Se=F[me],Oe=ge[Se],Pe=ke[Se];(Pe!==Oe||Se==="value")&&i(fe,Se,Oe,Pe,se,H)}}de&1&&_.children!==P.children&&d(fe,P.children)}else!pe&&oe==null&&B(fe,ge,ke,H,se);((Re=ke.onVnodeUpdated)||we)&&At(()=>{Re&&gs(Re,H,P,_),we&&sn(P,_,H,"updated")},ie)},N=(_,P,H,ie,se,ae,pe)=>{for(let fe=0;fe<P.length;fe++){const de=_[fe],oe=P[fe],we=de.el&&(de.type===Bt||!js(de,oe)||de.shapeFlag&198)?u(de.el):H;v(de,oe,we,null,ie,se,ae,pe,!0)}},B=(_,P,H,ie,se)=>{if(P!==H){if(P!==Ke)for(const ae in P)!Tn(ae)&&!(ae in H)&&i(_,ae,P[ae],null,se,ie);for(const ae in H){if(Tn(ae))continue;const pe=H[ae],fe=P[ae];pe!==fe&&ae!=="value"&&i(_,ae,fe,pe,se,ie)}"value"in H&&i(_,"value",P.value,H.value,se)}},E=(_,P,H,ie,se,ae,pe,fe,de)=>{const oe=P.el=_?_.el:o(""),we=P.anchor=_?_.anchor:o("");let{patchFlag:ge,dynamicChildren:ke,slotScopeIds:Re}=P;Re&&(fe=fe?fe.concat(Re):Re),_==null?(n(oe,H,ie),n(we,H,ie),C(P.children||[],H,we,se,ae,pe,fe,de)):ge>0&&ge&64&&ke&&_.dynamicChildren&&_.dynamicChildren.length===ke.length?(N(_.dynamicChildren,ke,H,se,ae,pe,fe),(P.key!=null||se&&P===se.subTree)&&Cc(_,P,!0)):I(_,P,H,we,se,ae,pe,fe,de)},M=(_,P,H,ie,se,ae,pe,fe,de)=>{P.slotScopeIds=fe,_==null?P.shapeFlag&512?se.ctx.activate(P,H,ie,pe,de):V(P,H,ie,se,ae,pe,de):q(_,P,de)},V=(_,P,H,ie,se,ae,pe)=>{const fe=_.component=Wf(_,ie,se);if(dl(_)&&(fe.ctx.renderer=re),Jf(fe,!1,pe),fe.asyncDep){if(se&&se.registerDep(fe,D,pe),!_.el){const de=fe.subTree=yt(Et);R(null,de,P,H),_.placeholder=de.el}}else D(fe,_,P,H,se,ae,pe)},q=(_,P,H)=>{const ie=P.component=_.component;if(Mb(_,P,H))if(ie.asyncDep&&!ie.asyncResolved){L(ie,P,H);return}else ie.next=P,ie.update();else P.el=_.el,ie.vnode=P},D=(_,P,H,ie,se,ae,pe)=>{const fe=()=>{if(_.isMounted){let{next:ge,bu:ke,u:Re,parent:F,vnode:me}=_;{const ot=$f(_);if(ot){ge&&(ge.el=me.el,L(_,ge,pe)),ot.asyncDep.then(()=>{At(()=>{_.isUnmounted||oe()},se)});return}}let Se=ge,Oe;na(_,!1),ge?(ge.el=me.el,L(_,ge,pe)):ge=me,ke&&qa(ke),(Oe=ge.props&&ge.props.onVnodeBeforeUpdate)&&gs(Oe,F,ge,me),na(_,!0);const Pe=Dl(_),dt=_.subTree;_.subTree=Pe,v(dt,Pe,u(dt.el),Q(dt),_,se,ae),ge.el=Pe.el,Se===null&&Po(_,Pe.el),Re&&At(Re,se),(Oe=ge.props&&ge.props.onVnodeUpdated)&&At(()=>gs(Oe,F,ge,me),se)}else{let ge;const{el:ke,props:Re}=P,{bm:F,m:me,parent:Se,root:Oe,type:Pe}=_,dt=En(P);if(na(_,!1),F&&qa(F),!dt&&(ge=Re&&Re.onVnodeBeforeMount)&&gs(ge,Se,P),na(_,!0),ke&&Le){const ot=()=>{_.subTree=Dl(_),Le(ke,_.subTree,_,se,null)};dt&&Pe.__asyncHydrate?Pe.__asyncHydrate(ke,_,ot):ot()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(Pe,_.parent?_.parent.type:void 0);const ot=_.subTree=Dl(_);v(null,ot,H,ie,_,se,ae),P.el=ot.el}if(me&&At(me,se),!dt&&(ge=Re&&Re.onVnodeMounted)){const ot=P;At(()=>gs(ge,Se,ot),se)}(P.shapeFlag&256||Se&&En(Se.vnode)&&Se.vnode.shapeFlag&256)&&_.a&&At(_.a,se),_.isMounted=!0,P=H=ie=null}};_.scope.on();const de=_.effect=new Hi(fe);_.scope.off();const oe=_.update=de.run.bind(de),we=_.job=de.runIfDirty.bind(de);we.i=_,we.id=_.uid,de.scheduler=()=>hc(we),na(_,!0),oe()},L=(_,P,H)=>{P.component=_;const ie=_.vnode.props;_.vnode=P,_.next=null,$b(_,P.props,ie,H),zb(_,P.children,H),In(),wd(_),On()},I=(_,P,H,ie,se,ae,pe,fe,de=!1)=>{const oe=_&&_.children,we=_?_.shapeFlag:0,ge=P.children,{patchFlag:ke,shapeFlag:Re}=P;if(ke>0){if(ke&128){W(oe,ge,H,ie,se,ae,pe,fe,de);return}else if(ke&256){U(oe,ge,H,ie,se,ae,pe,fe,de);return}}Re&8?(we&16&&De(oe,se,ae),ge!==oe&&d(H,ge)):we&16?Re&16?W(oe,ge,H,ie,se,ae,pe,fe,de):De(oe,se,ae,!0):(we&8&&d(H,""),Re&16&&C(ge,H,ie,se,ae,pe,fe,de))},U=(_,P,H,ie,se,ae,pe,fe,de)=>{_=_||za,P=P||za;const oe=_.length,we=P.length,ge=Math.min(oe,we);let ke;for(ke=0;ke<ge;ke++){const Re=P[ke]=de?bn(P[ke]):ys(P[ke]);v(_[ke],Re,H,null,se,ae,pe,fe,de)}oe>we?De(_,se,ae,!0,!1,ge):C(P,H,ie,se,ae,pe,fe,de,ge)},W=(_,P,H,ie,se,ae,pe,fe,de)=>{let oe=0;const we=P.length;let ge=_.length-1,ke=we-1;for(;oe<=ge&&oe<=ke;){const Re=_[oe],F=P[oe]=de?bn(P[oe]):ys(P[oe]);if(js(Re,F))v(Re,F,H,null,se,ae,pe,fe,de);else break;oe++}for(;oe<=ge&&oe<=ke;){const Re=_[ge],F=P[ke]=de?bn(P[ke]):ys(P[ke]);if(js(Re,F))v(Re,F,H,null,se,ae,pe,fe,de);else break;ge--,ke--}if(oe>ge){if(oe<=ke){const Re=ke+1,F=Re<we?P[Re].el:ie;for(;oe<=ke;)v(null,P[oe]=de?bn(P[oe]):ys(P[oe]),H,F,se,ae,pe,fe,de),oe++}}else if(oe>ke)for(;oe<=ge;)X(_[oe],se,ae,!0),oe++;else{const Re=oe,F=oe,me=new Map;for(oe=F;oe<=ke;oe++){const ye=P[oe]=de?bn(P[oe]):ys(P[oe]);ye.key!=null&&me.set(ye.key,oe)}let Se,Oe=0;const Pe=ke-F+1;let dt=!1,ot=0;const Ft=new Array(Pe);for(oe=0;oe<Pe;oe++)Ft[oe]=0;for(oe=Re;oe<=ge;oe++){const ye=_[oe];if(Oe>=Pe){X(ye,se,ae,!0);continue}let Ie;if(ye.key!=null)Ie=me.get(ye.key);else for(Se=F;Se<=ke;Se++)if(Ft[Se-F]===0&&js(ye,P[Se])){Ie=Se;break}Ie===void 0?X(ye,se,ae,!0):(Ft[Ie-F]=oe+1,Ie>=ot?ot=Ie:dt=!0,v(ye,P[Ie],H,null,se,ae,pe,fe,de),Oe++)}const ne=dt?jb(Ft):za;for(Se=ne.length-1,oe=Pe-1;oe>=0;oe--){const ye=F+oe,Ie=P[ye],Ze=P[ye+1],ft=ye+1<we?Ze.el||Bf(Ze):ie;Ft[oe]===0?v(null,Ie,H,ft,se,ae,pe,fe,de):dt&&(Se<0||oe!==ne[Se]?K(Ie,H,ft,2):Se--)}}},K=(_,P,H,ie,se=null)=>{const{el:ae,type:pe,transition:fe,children:de,shapeFlag:oe}=_;if(oe&6){K(_.component.subTree,P,H,ie);return}if(oe&128){_.suspense.move(P,H,ie);return}if(oe&64){pe.move(_,P,H,re);return}if(pe===Bt){n(ae,P,H);for(let ge=0;ge<de.length;ge++)K(de[ge],P,H,ie);n(_.anchor,P,H);return}if(pe===ha){g(_,P,H);return}if(ie!==2&&oe&1&&fe)if(ie===0)fe.persisted&&!ae[Ds]?n(ae,P,H):(fe.beforeEnter(ae),n(ae,P,H),At(()=>fe.enter(ae),se));else{const{leave:ge,delayLeave:ke,afterLeave:Re}=fe,F=()=>{_.ctx.isUnmounted?a(ae):n(ae,P,H)},me=()=>{const Se=ae._isLeaving||!!ae[Ds];ae._isLeaving&&ae[Ds](!0),fe.persisted&&!Se?F():ge(ae,()=>{F(),Re&&Re()})};ke?ke(ae,F,me):me()}else n(ae,P,H)},X=(_,P,H,ie=!1,se=!1)=>{const{type:ae,props:pe,ref:fe,children:de,dynamicChildren:oe,shapeFlag:we,patchFlag:ge,dirs:ke,cacheIndex:Re,memo:F}=_;if(ge===-2&&(se=!1),fe!=null&&(In(),Ka(fe,null,H,_,!0),On()),Re!=null&&(P.renderCache[Re]=void 0),we&256){P.ctx.deactivate(_);return}const me=we&1&&ke,Se=!En(_);let Oe;if(Se&&(Oe=pe&&pe.onVnodeBeforeUnmount)&&gs(Oe,P,_),we&6)ce(_.component,H,ie);else{if(we&128){_.suspense.unmount(H,ie);return}me&&sn(_,null,P,"beforeUnmount"),we&64?_.type.remove(_,P,H,re,ie):oe&&!oe.hasOnce&&(ae!==Bt||ge>0&&ge&64)?De(oe,P,H,!1,!0):(ae===Bt&&ge&384||!se&&we&16)&&De(de,P,H),ie&&le(_)}const Pe=F!=null&&Re==null;(Se&&(Oe=pe&&pe.onVnodeUnmounted)||me||Pe)&&At(()=>{Oe&&gs(Oe,P,_),me&&sn(_,null,P,"unmounted"),Pe&&(_.el=null)},H)},le=_=>{const{type:P,el:H,anchor:ie,transition:se}=_;if(P===Bt){ee(H,ie);return}if(P===ha){b(_);return}const ae=()=>{a(H),se&&!se.persisted&&se.afterLeave&&se.afterLeave()};if(_.shapeFlag&1&&se&&!se.persisted){const{leave:pe,delayLeave:fe}=se,de=()=>pe(H,ae);fe?fe(_.el,ae,de):de()}else ae()},ee=(_,P)=>{let H;for(;_!==P;)H=p(_),a(_),_=H;a(P)},ce=(_,P,H)=>{const{bum:ie,scope:se,job:ae,subTree:pe,um:fe,m:de,a:oe}=_;Zl(de),Zl(oe),ie&&qa(ie),se.stop(),ae&&(ae.flags|=8,X(pe,_,P,H)),fe&&At(fe,P),At(()=>{_.isUnmounted=!0},P)},De=(_,P,H,ie=!1,se=!1,ae=0)=>{for(let pe=ae;pe<_.length;pe++)X(_[pe],P,H,ie,se)},Q=_=>{if(_.shapeFlag&6)return Q(_.component.subTree);if(_.shapeFlag&128)return _.suspense.next();const P=p(_.anchor||_.el),H=P&&P[of];return H?p(H):P};let be=!1;const z=(_,P,H)=>{let ie;_==null?P._vnode&&(X(P._vnode,null,null,!0),ie=P._vnode.component):v(P._vnode||null,_,P,null,null,null,H),P._vnode=_,be||(be=!0,wd(ie),Gl(),be=!1)},re={p:v,um:X,m:K,r:le,mt:V,mc:C,pc:I,pbc:N,n:Q,o:e};let ue,Le;return t&&([ue,Le]=t(re)),{render:z,hydrate:ue,createApp:Rb(z,ue)}}function tr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function na({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Ff(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Cc(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=bn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Cc(l,o)),o.type===Wn&&(o.patchFlag===-1&&(o=a[i]=bn(o)),o.el=l.el),o.type===Et&&!o.el&&(o.el=l.el)}}function jb(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function $f(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:$f(t)}function Zl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function Bf(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?Bf(t.subTree):null}const Jl=e=>e.__isSuspense;let Dr=0;const Vb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)Gb(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Kb(e,t,s,n,a,l,o,r,c)}},hydrate:Wb,normalize:Zb},qb=Vb;function Wi(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function Gb(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Uf(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Wi(e,"onPending"),Wi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Wa(p,e.ssFallback)):p.resolve(!1,!0)}function Kb(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:k,isHydrating:R}=u;if(v)u.pendingBranch=p,js(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():k&&(R||(r(m,h,s,n,a,null,i,l,o),Wa(u,h)))):(u.pendingId=Dr++,R?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),k?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,n,a,null,i,l,o),Wa(u,h))):m&&js(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&js(m,p))r(m,p,s,n,a,u,i,l,o),Wa(u,p);else if(Wi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Dr++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function Uf(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:k}}=c;let R;const y=Jb(e);y&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const g=e.props?Hl(e.props.timeout):void 0,b=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Dr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(w=!1,A=!1){const{vnode:C,activeBranch:x,pendingBranch:N,pendingId:B,effects:E,parentComponent:M,container:V,isInFallback:q}=S;let D=!1;if(S.isHydrating)S.isHydrating=!1;else if(!w){D=x&&N.transition&&N.transition.mode==="out-in";let U=!1;D&&(x.transition.afterLeave=()=>{B===S.pendingId&&(p(N,V,i===b&&!U?m(x):i,0),Vi(E),q&&C.ssFallback&&(C.ssFallback.el=null))}),x&&!S.isFallbackMountPending&&(v(x.el)===V&&(i=m(x),U=!0),h(x,M,S,!0),!D&&q&&C.ssFallback&&At(()=>C.ssFallback.el=null,S)),D||p(N,V,i,0)}S.isFallbackMountPending=!1,Wa(S,N),S.pendingBranch=null,S.isInFallback=!1;let L=S.parent,I=!1;for(;L;){if(L.pendingBranch){L.effects.push(...E),I=!0;break}L=L.parent}!I&&!D&&Vi(E),S.effects=[],y&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),Wi(C,"onResolve")},fallback(w){if(!S.pendingBranch)return;const{vnode:A,activeBranch:C,parentComponent:x,container:N,namespace:B}=S;Wi(A,"onFallback");const E=m(C),M=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,w,N,E,x,null,B,o,r),Wa(S,w))},V=w.transition&&w.transition.mode==="out-in";V&&(S.isFallbackMountPending=!0,C.transition.afterLeave=M),S.isInFallback=!0,h(C,x,null,!0),V||M()},move(w,A,C){S.activeBranch&&p(S.activeBranch,w,A,C),S.container=w},next(){return S.activeBranch&&m(S.activeBranch)},registerDep(w,A,C){const x=!!S.pendingBranch;x&&S.deps++;const N=w.vnode.el;w.asyncDep.catch(B=>{Sa(B,w,0)}).then(B=>{if(w.isUnmounted||S.isUnmounted||S.pendingId!==w.suspenseId)return;Yi(),w.asyncResolved=!0;const{vnode:E}=w;Pr(w,B,!1),N&&(E.el=N);const M=!N&&w.subTree.el;A(w,E,v(N||w.subTree.el),N?null:m(w.subTree),S,l,C),M&&(E.placeholder=null,k(M)),Po(w,E.el),x&&--S.deps===0&&S.resolve()})},unmount(w,A){S.isUnmounted=!0,S.activeBranch&&h(S.activeBranch,s,w,A),S.pendingBranch&&h(S.pendingBranch,s,w,A)}};return S}function Wb(e,t,s,n,a,i,l,o,r){const c=t.suspense=Uf(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Zb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Md(n?s.default:s),e.ssFallback=n?Md(s.fallback):yt(Et)}function Md(e){let t;if(Fe(e)){const s=ga&&e._c;s&&(e._d=!1,Zi()),e=e(),s&&(e._d=!0,t=es,zf())}return Ce(e)&&(e=Nb(e)),e=ys(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Hf(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):Vi(e)}function Wa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Po(n,a))}function Jb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Bt=Symbol.for("v-fgt"),Wn=Symbol.for("v-txt"),Et=Symbol.for("v-cmt"),ha=Symbol.for("v-stc"),Di=[];let es=null;function Zi(e=!1){Di.push(es=e?null:[])}function zf(){Di.pop(),es=Di[Di.length-1]||null}let ga=1;function Ji(e,t=!1){ga+=e,e<0&&es&&t&&(es.hasOnce=!0)}function jf(e){return e.dynamicChildren=ga>0?es||za:null,zf(),ga>0&&es&&es.push(e),e}function Yb(e,t,s,n,a,i){return jf(Ec(e,t,s,n,a,i,!0))}function Yl(e,t,s,n,a){return jf(yt(e,t,s,n,a,!0))}function Nn(e){return e?e.__v_isVNode===!0:!1}function js(e,t){return e.type===t.type&&e.key===t.key}function Qb(e){}const Vf=({key:e})=>e??null,Pl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Ot(e)||Fe(e)?{i:qt,r:e,k:t,f:!!s}:e:null);function Ec(e,t=null,s=null,n=0,a=null,i=e===Bt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Vf(t),ref:t&&Pl(t),scopeId:Ro,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:qt};return o?(Rc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),ga>0&&!l&&es&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&es.push(r),r}const yt=Xb;function Xb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===yf)&&(e=Et),Nn(e)){const o=on(e,t,!0);return s&&Rc(o,s),ga>0&&!i&&es&&(o.shapeFlag&6?es[es.indexOf(e)]=o:es.push(o)),o.patchFlag=-2,o}if(ly(e)&&(e=e.__vccOpts),t){t=qf(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=ll(o)),Xe(r)&&(ol(r)&&!Ce(r)&&(r=qe({},r)),t.style=il(r))}const l=Be(e)?1:Jl(e)?128:rf(e)?64:Xe(e)?4:Fe(e)?2:0;return Ec(e,t,s,n,a,l,i,!0)}function qf(e){return e?ol(e)||Af(e)?qe({},e):e:null}function on(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?Kf(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Vf(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(Pl(t)):[i,Pl(t)]:Pl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Bt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&on(e.ssContent),ssFallback:e.ssFallback&&on(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Ln(d,r.clone(d)),d}function Ac(e=" ",t=0){return yt(Wn,null,e,t)}function ey(e,t){const s=yt(ha,null,e);return s.staticCount=t,s}function Gf(e="",t=!1){return t?(Zi(),Yl(Et,null,e)):yt(Et,null,e)}function ys(e){return e==null||typeof e=="boolean"?yt(Et):Ce(e)?yt(Bt,null,e.slice()):Nn(e)?bn(e):yt(Wn,null,String(e))}function bn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:on(e)}function Rc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Rc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Af(t)?t._ctx=qt:a===3&&qt&&(qt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:qt},s=32):(t=String(t),n&64?(s=16,t=[Ac(t)]):s=8);e.children=t,e.shapeFlag|=s}function Kf(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=ll([t.class,n.class]));else if(a==="style")t.style=il([t.style,n.style]);else if(_a(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!bo(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function gs(e,t,s,n=null){Rs(e,t,7,[s,n])}const ty=wf();let sy=0;function Wf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||ty,i={uid:sy++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new oc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:If(n,a),emitsOptions:Sf(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Ob.bind(null,i),e.ce&&e.ce(i),i}let Vt=null;const ps=()=>Vt||qt;let Ql,Za;{const e=ko(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Ql=t("__VUE_INSTANCE_SETTERS__",s=>Vt=s),Za=t("__VUE_SSR_SETTERS__",s=>ba=s)}const pi=e=>{const t=Vt;return Ql(e),e.scope.on(),()=>{e.scope.off(),Ql(t)}},Yi=()=>{Vt&&Vt.scope.off(),Ql(null)};function Zf(e){return e.vnode.shapeFlag&4}let ba=!1;function Jf(e,t=!1,s=!1){t&&Za(t);const{props:n,children:a}=e.vnode,i=Zf(e);Fb(e,n,i,t),Hb(e,a,s||t);const l=i?ny(e,t):void 0;return t&&Za(!1),l}function ny(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Ir);const{setup:n}=s;if(n){In();const a=e.setupContext=n.length>1?Xf(e):null,i=pi(e),l=ui(n,e,0,[e.props,a]),o=lc(l);if(On(),i(),(o||e.sp)&&!En(e)&&bc(e),o){if(l.then(Yi,Yi),t)return l.then(r=>{Pr(e,r,t)}).catch(r=>{Sa(r,e,0)});e.asyncDep=l}else Pr(e,l,t)}else Qf(e,t)}function Pr(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=fc(t)),Qf(e,s)}let Xl,Mr;function Yf(e){Xl=e,Mr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,cb))}}const ay=()=>!Xl;function Qf(e,t,s){const n=e.type;if(!e.render){if(!t&&Xl&&!n.render){const a=n.template||kc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=qe(qe({isCustomElement:i,delimiters:o},l),r);n.render=Xl(a,c)}}e.render=n.render||Gt,Mr&&Mr(e)}{const a=pi(e);In();try{kb(e)}finally{On(),a()}}}const iy={get(e,t){return Xt(e,"get",""),e[t]}};function Xf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,iy),slots:e.slots,emit:e.emit,expose:t}}function ul(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(fc(Gp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ni)return Ni[s](e)},has(t,s){return s in t||s in Ni}})):e.proxy}function Fr(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function ly(e){return Fe(e)&&"__vccOpts"in e}const J=(e,t)=>pg(e,t,ba);function ei(e,t,s){try{Ji(-1);const n=arguments.length;return n===2?Xe(t)&&!Ce(t)?Nn(t)?yt(e,null,[t]):yt(e,t):yt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Nn(s)&&(s=[s]),yt(e,t,s))}finally{Ji(1)}}function oy(){}function ry(e,t,s,n){const a=s[n];if(a&&eh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function eh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if($t(s[n],t[n]))return!1;return ga>0&&es&&es.push(e),!0}const th="3.5.38",cy=Gt,dy=_g,uy=Fa,py=tf,fy={createComponentInstance:Wf,setupComponent:Jf,renderComponentRoot:Dl,setCurrentRenderingInstance:Gi,isVNode:Nn,normalizeVNode:ys,getComponentPublicInstance:ul,ensureValidVNode:wc,pushWarningContext:gg,popWarningContext:bg},hy=fy,my=null,vy=null,gy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let $r;const Fd=typeof window<"u"&&window.trustedTypes;if(Fd)try{$r=Fd.createPolicy("vue",{createHTML:e=>e})}catch{}const sh=$r?e=>$r.createHTML(e):e=>e,by="http://www.w3.org/2000/svg",yy="http://www.w3.org/1998/Math/MathML",gn=typeof document<"u"?document:null,$d=gn&&gn.createElement("template"),nh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?gn.createElementNS(by,e):t==="mathml"?gn.createElementNS(yy,e):s?gn.createElement(e,{is:s}):gn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>gn.createTextNode(e),createComment:e=>gn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>gn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{$d.innerHTML=sh(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=$d.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Bn="transition",gi="animation",ti=Symbol("_vtc"),ah={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},ih=qe({},gc,ah),xy=e=>(e.displayName="Transition",e.props=ih,e),_y=xy((e,{slots:t})=>ei(uf,lh(e),t)),aa=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},Bd=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function lh(e){const t={};for(const E in e)E in ah||(t[E]=e[E]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=wy(a),v=m&&m[0],k=m&&m[1],{onBeforeEnter:R,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:S,onBeforeAppear:w=R,onAppear:A=y,onAppearCancelled:C=g}=t,x=(E,M,V,q)=>{E._enterCancelled=q,jn(E,M?d:o),jn(E,M?c:l),V&&V()},N=(E,M)=>{E._isLeaving=!1,jn(E,u),jn(E,h),jn(E,p),M&&M()},B=E=>(M,V)=>{const q=E?A:y,D=()=>x(M,E,V);aa(q,[M,D]),Ud(()=>{jn(M,E?r:i),Qs(M,E?d:o),Bd(q)||Hd(M,n,v,D)})};return qe(t,{onBeforeEnter(E){aa(R,[E]),Qs(E,i),Qs(E,l)},onBeforeAppear(E){aa(w,[E]),Qs(E,r),Qs(E,c)},onEnter:B(!1),onAppear:B(!0),onLeave(E,M){E._isLeaving=!0;const V=()=>N(E,M);Qs(E,u),E._enterCancelled?(Qs(E,p),Br(E)):(Br(E),Qs(E,p)),Ud(()=>{E._isLeaving&&(jn(E,u),Qs(E,h),Bd(b)||Hd(E,n,k,V))}),aa(b,[E,V])},onEnterCancelled(E){x(E,!1,void 0,!0),aa(g,[E])},onAppearCancelled(E){x(E,!0,void 0,!0),aa(C,[E])},onLeaveCancelled(E){N(E),aa(S,[E])}})}function wy(e){if(e==null)return null;if(Xe(e))return[sr(e.enter),sr(e.leave)];{const t=sr(e);return[t,t]}}function sr(e){return Hl(e)}function Qs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ti]||(e[ti]=new Set)).add(t)}function jn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ti];s&&(s.delete(t),s.size||(e[ti]=void 0))}function Ud(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let ky=0;function Hd(e,t,s,n){const a=e._endId=++ky,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=oh(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function oh(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Bn}Delay`),i=n(`${Bn}Duration`),l=zd(a,i),o=n(`${gi}Delay`),r=n(`${gi}Duration`),c=zd(o,r);let d=null,u=0,p=0;t===Bn?l>0&&(d=Bn,u=l,p=i.length):t===gi?c>0&&(d=gi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Bn:gi:null,p=d?d===Bn?i.length:r.length:0);const h=d===Bn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Bn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function zd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>jd(s)+jd(e[n])))}function jd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Br(e){return(e?e.ownerDocument:document).body.offsetHeight}function Sy(e,t,s){const n=e[ti];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const eo=Symbol("_vod"),Ic=Symbol("_vsh"),rh={name:"show",beforeMount(e,{value:t},{transition:s}){e[eo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):bi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),bi(e,!0),n.enter(e)):n.leave(e,()=>{bi(e,!1)}):bi(e,t))},beforeUnmount(e,{value:t}){bi(e,t)}};function bi(e,t){e.style.display=t?e[eo]:"none",e[Ic]=!t}function Ty(){rh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const ch=Symbol("");function Cy(e){const t=ps();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>to(i,a))},n=()=>{const a=e(t.proxy);t.ce?to(t.ce,a):Ur(t.subTree,a),s(a)};yc(()=>{Vi(n)}),Ge(()=>{us(n,Gt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),gt(()=>a.disconnect())})}function Ur(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Ur(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)to(e.el,t);else if(e.type===Bt)e.children.forEach(s=>Ur(s,t));else if(e.type===ha){let{el:s,anchor:n}=e;for(;s&&(to(s,t),s!==n);)s=s.nextSibling}}function to(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Lv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[ch]=n}}const Ey=/(?:^|;)\s*display\s*:/;function Ay(e,t,s){const n=e.style,a=Be(s);let i=!1;if(s&&!a){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Ai(n,o,"")}else for(const l in t)s[l]==null&&Ai(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?Iy(e,l,!Be(t)&&t?t[l]:void 0,o)||Ai(n,l,o):Ai(n,l,"")}}else if(a){if(t!==s){const l=n[ch];l&&(s+=";"+l),n.cssText=s,i=Ey.test(s)}}else t&&e.removeAttribute("style");eo in e&&(e[eo]=i?n.display:"",e[Ic]&&(n.display="none"))}const Vd=/\s*!important$/;function Ai(e,t,s){if(Ce(s))s.forEach(n=>Ai(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Ry(e,t);Vd.test(s)?e.setProperty(xs(n),s.replace(Vd,""),"important"):e[n]=s}}const qd=["Webkit","Moz","ms"],nr={};function Ry(e,t){const s=nr[t];if(s)return s;let n=ct(t);if(n!=="filter"&&n in e)return nr[t]=n;n=ka(n);for(let a=0;a<qd.length;a++){const i=qd[a]+n;if(i in e)return nr[t]=i}return t}function Iy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(n)&&s===n}const Gd="http://www.w3.org/1999/xlink";function Kd(e,t,s,n,a,i=Iv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Gd,t.slice(6,t.length)):e.setAttributeNS(Gd,t,s):s==null||i&&!Cp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":ss(s)?String(s):s)}function Wd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?sh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Cp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function wn(e,t,s,n){e.addEventListener(t,s,n)}function Oy(e,t,s,n){e.removeEventListener(t,s,n)}const Zd=Symbol("_vei");function Ly(e,t,s,n,a=null){const i=e[Zd]||(e[Zd]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=Ny(t);if(n){const c=i[t]=My(n,a);wn(e,o,c,r)}else l&&(Oy(e,o,l,r),i[t]=void 0)}}const Jd=/(?:Once|Passive|Capture)$/;function Ny(e){let t;if(Jd.test(e)){t={};let n;for(;n=e.match(Jd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):xs(e.slice(2)),t]}let ar=0;const Dy=Promise.resolve(),Py=()=>ar||(Dy.then(()=>ar=0),ar=Date.now());function My(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&Rs(c,t,5,o)}}else Rs(a,t,5,[n])};return s.value=e,s.attached=Py(),s}const Yd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,dh=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?Sy(e,n,l):t==="style"?Ay(e,s,n):_a(t)?bo(t)||Ly(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Fy(e,t,n,l))?(Wd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Kd(e,t,n,l,i,t!=="value")):e._isVueCE&&($y(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(n)))?Wd(e,ct(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Kd(e,t,n,l))};function Fy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Yd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Yd(t)&&Be(s)?!1:t in e}function $y(e,t){const s=e._def.props;if(!s)return!1;const n=ct(t);return Array.isArray(s)?s.some(a=>ct(a)===n):Object.keys(s).some(a=>ct(a)===n)}const Qd={};function uh(e,t,s){let n=cl(e,t);yo(n)&&(n=qe({},n,t));class a extends Mo{constructor(l){super(n,l,s)}}return a.def=n,a}const By=((e,t)=>uh(e,t,Sh)),Uy=typeof HTMLElement<"u"?HTMLElement:class{};class Mo extends Uy{constructor(t,s={},n=ao){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==ao?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Mo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ce(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Hl(this._props[r])),(o||(o=Object.create(null)))[ct(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)tt(this,n)||Object.defineProperty(this,n,{get:()=>an(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(ct))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Qd;const a=ct(t);s&&this._numberProps&&this._numberProps[a]&&(n=Hl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Qd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(xs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(xs(t),s+""):s||this.removeAttribute(xs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),kh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=yt(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,yo(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),xs(i)!==i&&a(xs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function ph(e){const t=ps(),s=t&&t.ce;return s||null}function Hy(){const e=ph();return e&&e.shadowRoot}function zy(e="$style"){{const t=ps();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const fh=new WeakMap,hh=new WeakMap,so=Symbol("_moveCb"),Xd=Symbol("_enterCb"),jy=e=>(delete e.props.mode,e),Vy=jy({name:"TransitionGroup",props:qe({},ih,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ps(),n=vc();let a,i;return Lo(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Zy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Gy),a.forEach(Ky);const o=a.filter(Wy);Br(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Qs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[so]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[so]=null,jn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),o=lh(l);let r=l.tag||Bt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Ic]&&(a.push(d),Ln(d,Xa(d,o,n,s)),fh.set(d,mh(d.el)))}i=t.default?Io(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Ln(d,Xa(d,o,n,s))}return yt(r,null,i)}}}),qy=Vy;function Gy(e){const t=e.el;t[so]&&t[so](),t[Xd]&&t[Xd]()}function Ky(e){hh.set(e,mh(e.el))}function Wy(e){const t=fh.get(e),s=hh.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function mh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Zy(e,t,s){const n=e.cloneNode(),a=e[ti];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=oh(n);return i.removeChild(n),l}const Jn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>qa(t,s):t};function Jy(e){e.target.composing=!0}function eu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Bs=Symbol("_assign");function tu(e,t,s){return t&&(e=e.trim()),s&&(e=wo(e)),e}const no={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Bs]=Jn(a);const i=n||a.props&&a.props.type==="number";wn(e,t?"change":"input",l=>{l.target.composing||e[Bs](tu(e.value,s,i))}),(s||i)&&wn(e,"change",()=>{e.value=tu(e.value,s,i)}),t||(wn(e,"compositionstart",Jy),wn(e,"compositionend",eu),wn(e,"change",eu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Bs]=Jn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?wo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},Oc={deep:!0,created(e,t,s){e[Bs]=Jn(s),wn(e,"change",()=>{const n=e._modelValue,a=si(e),i=e.checked,l=e[Bs];if(Ce(n)){const o=So(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(wa(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(gh(e,i))})},mounted:su,beforeUpdate(e,t,s){e[Bs]=Jn(s),su(e,t,s)}};function su(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=So(t,n.props.value)>-1;else if(wa(t))a=t.has(n.props.value);else{if(t===s)return;a=Rn(t,gh(e,!0))}e.checked!==a&&(e.checked=a)}const Lc={created(e,{value:t},s){e.checked=Rn(t,s.props.value),e[Bs]=Jn(s),wn(e,"change",()=>{e[Bs](si(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Bs]=Jn(n),t!==s&&(e.checked=Rn(t,n.props.value))}},vh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=wa(t);wn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?wo(si(l)):si(l));e[Bs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Bs]=Jn(n)},mounted(e,{value:t}){nu(e,t)},beforeUpdate(e,t,s){e[Bs]=Jn(s)},updated(e,{value:t}){e._assigning||nu(e,t)}};function nu(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!wa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=si(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=So(t,o)>-1}else l.selected=t.has(o);else if(Rn(si(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function si(e){return"_value"in e?e._value:e.value}function gh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const bh={created(e,t,s){Cl(e,t,s,null,"created")},mounted(e,t,s){Cl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Cl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Cl(e,t,s,n,"updated")}};function yh(e,t){switch(e){case"SELECT":return vh;case"TEXTAREA":return no;default:switch(t){case"checkbox":return Oc;case"radio":return Lc;default:return no}}}function Cl(e,t,s,n,a){const l=yh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Yy(){no.getSSRProps=({value:e})=>({value:e}),Lc.getSSRProps=({value:e},t)=>{if(t.props&&Rn(t.props.value,e))return{checked:!0}},Oc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&So(e,t.props.value)>-1)return{checked:!0}}else if(wa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},bh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=yh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Qy=["ctrl","shift","alt","meta"],Xy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Qy.some(s=>e[`${s}Key`]&&!t.includes(s))},ex=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=Xy[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},tx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},sx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=xs(a.key);if(t.some(l=>l===i||tx[l]===i))return e(a)}))},xh=qe({patchProp:dh},nh);let Pi,au=!1;function _h(){return Pi||(Pi=Df(xh))}function wh(){return Pi=au?Pi:Pf(xh),au=!0,Pi}const kh=((...e)=>{_h().render(...e)}),nx=((...e)=>{wh().hydrate(...e)}),ao=((...e)=>{const t=_h().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Ch(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Th(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Sh=((...e)=>{const t=wh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=Ch(n);if(a)return s(a,!0,Th(a))},t});function Th(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Ch(e){return Be(e)?document.querySelector(e):e}let iu=!1;const ax=()=>{iu||(iu=!0,Yy(),Ty())},ix=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:uf,BaseTransitionPropsValidators:gc,Comment:Et,DeprecationTypes:gy,EffectScope:oc,ErrorCodes:xg,ErrorTypeStrings:dy,Fragment:Bt,KeepAlive:Xg,ReactiveEffect:Hi,Static:ha,Suspense:qb,Teleport:Pg,Text:Wn,TrackOpTypes:fg,Transition:_y,TransitionGroup:qy,TriggerOpTypes:hg,VueElement:Mo,assertNumber:yg,callWithAsyncErrorHandling:Rs,callWithErrorHandling:ui,camelize:ct,capitalize:ka,cloneVNode:on,compatUtils:vy,computed:J,createApp:ao,createBlock:Yl,createCommentVNode:Gf,createElementBlock:Yb,createElementVNode:Ec,createHydrationRenderer:Pf,createPropsRestProxy:_b,createRenderer:Df,createSSRApp:Sh,createSlots:lb,createStaticVNode:ey,createTextVNode:Ac,createVNode:yt,customRef:Wp,defineAsyncComponent:Yg,defineComponent:cl,defineCustomElement:uh,defineEmits:ub,defineExpose:pb,defineModel:mb,defineOptions:fb,defineProps:db,defineSSRCustomElement:By,defineSlots:hb,devtools:uy,effect:Mv,effectScope:Nv,getCurrentInstance:ps,getCurrentScope:Ip,getCurrentWatcher:mg,getTransitionRawChildren:Io,guardReactiveProps:qf,h:ei,handleError:Sa,hasInjectionContext:Ag,hydrate:nx,hydrateOnIdle:qg,hydrateOnInteraction:Zg,hydrateOnMediaQuery:Wg,hydrateOnVisible:Kg,initCustomFormatter:oy,initDirectivesForSSR:ax,inject:$s,isMemoSame:eh,isProxy:ol,isReactive:Cn,isReadonly:ln,isRef:Ot,isRuntimeOnly:ay,isShallow:ws,isVNode:Nn,markRaw:Gp,mergeDefaults:yb,mergeModels:xb,mergeProps:Kf,nextTick:Rt,nodeOps:nh,normalizeClass:ll,normalizeProps:xv,normalizeStyle:il,onActivated:hs,onBeforeMount:hf,onBeforeUnmount:No,onBeforeUpdate:yc,onDeactivated:ns,onErrorCaptured:bf,onMounted:Ge,onRenderTracked:gf,onRenderTriggered:vf,onScopeDispose:Dv,onServerPrefetch:mf,onUnmounted:gt,onUpdated:Lo,onWatcherCleanup:Jp,openBlock:Zi,patchProp:dh,popScopeId:Tg,provide:Li,proxyRefs:fc,pushScopeId:Sg,queuePostFlushCb:Vi,reactive:Yn,readonly:jl,ref:f,registerRuntimeCompiler:Yf,render:kh,renderList:ib,renderSlot:ob,resolveComponent:sb,resolveDirective:ab,resolveDynamicComponent:nb,resolveFilter:my,resolveTransitionHooks:Xa,setBlockTracking:Ji,setDevtoolsHook:py,setTransitionHooks:Ln,shallowReactive:uc,shallowReadonly:tg,shallowRef:pc,ssrContextKey:sf,ssrUtils:hy,stop:Fv,toDisplayString:Ap,toHandlerKey:Va,toHandlers:rb,toRaw:Je,toRef:dg,toRefs:og,toValue:ag,transformVNodeArgs:Qb,triggerRef:ng,unref:an,useAttrs:bb,useCssModule:zy,useCssVars:Cy,useHost:ph,useId:Fg,useModel:Ib,useSSRContext:nf,useShadowRoot:Hy,useSlots:gb,useTemplateRef:$g,useTransitionState:vc,vModelCheckbox:Oc,vModelDynamic:bh,vModelRadio:Lc,vModelSelect:vh,vModelText:no,vShow:rh,version:th,warn:cy,watch:us,watchEffect:Rg,watchPostEffect:Ig,watchSyncEffect:af,withAsyncContext:wb,withCtx:mc,withDefaults:vb,withDirectives:Eg,withKeys:sx,withMemo:ry,withModifiers:ex,withScopeId:Cg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Qi=Symbol(""),Mi=Symbol(""),Nc=Symbol(""),io=Symbol(""),Eh=Symbol(""),ya=Symbol(""),Ah=Symbol(""),Rh=Symbol(""),Dc=Symbol(""),Pc=Symbol(""),pl=Symbol(""),Mc=Symbol(""),Ih=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Bc=Symbol(""),Uc=Symbol(""),Hc=Symbol(""),zc=Symbol(""),Oh=Symbol(""),Lh=Symbol(""),Fo=Symbol(""),lo=Symbol(""),jc=Symbol(""),Vc=Symbol(""),Xi=Symbol(""),fl=Symbol(""),qc=Symbol(""),Hr=Symbol(""),lx=Symbol(""),zr=Symbol(""),oo=Symbol(""),ox=Symbol(""),rx=Symbol(""),Gc=Symbol(""),cx=Symbol(""),dx=Symbol(""),Kc=Symbol(""),Nh=Symbol(""),ni={[Qi]:"Fragment",[Mi]:"Teleport",[Nc]:"Suspense",[io]:"KeepAlive",[Eh]:"BaseTransition",[ya]:"openBlock",[Ah]:"createBlock",[Rh]:"createElementBlock",[Dc]:"createVNode",[Pc]:"createElementVNode",[pl]:"createCommentVNode",[Mc]:"createTextVNode",[Ih]:"createStaticVNode",[Fc]:"resolveComponent",[$c]:"resolveDynamicComponent",[Bc]:"resolveDirective",[Uc]:"resolveFilter",[Hc]:"withDirectives",[zc]:"renderList",[Oh]:"renderSlot",[Lh]:"createSlots",[Fo]:"toDisplayString",[lo]:"mergeProps",[jc]:"normalizeClass",[Vc]:"normalizeStyle",[Xi]:"normalizeProps",[fl]:"guardReactiveProps",[qc]:"toHandlers",[Hr]:"camelize",[lx]:"capitalize",[zr]:"toHandlerKey",[oo]:"setBlockTracking",[ox]:"pushScopeId",[rx]:"popScopeId",[Gc]:"withCtx",[cx]:"unref",[dx]:"isRef",[Kc]:"withMemo",[Nh]:"isMemoSame"};function ux(e){Object.getOwnPropertySymbols(e).forEach(t=>{ni[t]=e[t]})}const Os={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function px(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Os}}function el(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Os){return e&&(o?(e.helper(ya),e.helper(li(e.inSSR,c))):e.helper(ii(e.inSSR,c)),l&&e.helper(Hc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function ma(e,t=Os){return{type:17,loc:t,elements:e}}function Fs(e,t=Os){return{type:15,loc:t,properties:e}}function It(e,t){return{type:16,loc:Os,key:Be(e)?ze(e,!0):e,value:t}}function ze(e,t=!1,s=Os,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function qs(e,t=Os){return{type:8,loc:t,children:e}}function Mt(e,t=[],s=Os){return{type:14,loc:s,callee:e,arguments:t}}function ai(e,t=void 0,s=!1,n=!1,a=Os){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function jr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Os}}function fx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Os}}function hx(e){return{type:21,body:e,loc:Os}}function ii(e,t){return e||t?Dc:Pc}function li(e,t){return e||t?Ah:Rh}function Wc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ii(n,e.isComponent)),t(ya),t(li(n,e.isComponent)))}const lu=new Uint8Array([123,123]),ou=new Uint8Array([125,125]);function ru(e){return e>=97&&e<=122||e>=65&&e<=90}function Es(e){return e===32||e===10||e===9||e===12||e===13}function Un(e){return e===47||e===62||Es(e)}function ro(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Jt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class mx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=lu,this.delimiterClose=ou,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=lu,this.delimiterClose=ou}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Un(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Jt.TitleEnd||this.currentSequence===Jt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Jt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Jt.Cdata.length&&(this.state=28,this.currentSequence=Jt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Jt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):ru(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Un(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Un(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ro("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=ru(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Un(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Un(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Un(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Un(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Un(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Jt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Jt.ScriptEnd[3]?this.startSpecial(Jt.ScriptEnd,4):t===Jt.StyleEnd[3]?this.startSpecial(Jt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Jt.TitleEnd[3]?this.startSpecial(Jt.TitleEnd,4):t===Jt.TextareaEnd[3]?this.startSpecial(Jt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Jt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function cu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function va(e,t){const s=cu("MODE",t),n=cu(e,t);return s===3?n===!0:n!==!1}function tl(e,t,s,...n){return va(e,t)}function Zc(e){throw e}function Dh(e){}function vt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const _s=e=>e.type===4&&e.isStatic;function Ph(e){switch(e){case"Teleport":case"teleport":return Mi;case"Suspense":case"suspense":return Nc;case"KeepAlive":case"keep-alive":return io;case"BaseTransition":case"base-transition":return Eh}}const vx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Jc=e=>!vx.test(e),Mh=/[A-Za-z_$\xA0-\uFFFF]/,gx=/[\.\?\w$\xA0-\uFFFF]/,bx=/\s+[.[]\s*|\s*[.[]\s+/g,Fh=e=>e.type===4?e.content:e.loc.source,yx=e=>{const t=Fh(e).trim().replace(bx,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?Mh:gx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},$h=yx,xx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,_x=e=>xx.test(Fh(e)),wx=_x;function Ms(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Be(t)?a.name===t:t.test(a.name)))return a}}function $o(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ca(i.arg,t))return i}}function ca(e,t){return!!(e&&_s(e)&&e.content===t)}function kx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function ir(e){return e.type===5||e.type===2}function du(e){return e.type===7&&e.name==="pre"}function Sx(e){return e.type===7&&e.name==="slot"}function co(e){return e.type===1&&e.tagType===3}function uo(e){return e.type===1&&e.tagType===2}const Tx=new Set([Xi,fl]);function Bh(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&Tx.has(s))return Bh(e.arguments[0],t.concat(e))}return[e,t]}function po(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Be(a)&&a.type===14){const o=Bh(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Be(a))n=Fs([t]);else if(a.type===14){const o=a.arguments[0];!Be(o)&&o.type===15?uu(t,o)||o.properties.unshift(t):a.callee===qc?n=Mt(s.helper(lo),[Fs([t]),a]):a.arguments.unshift(Fs([t])),!n&&(n=a)}else a.type===15?(uu(t,a)||a.properties.unshift(t),n=a):(n=Mt(s.helper(lo),[Fs([t]),a]),l&&l.callee===fl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function uu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function sl(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Cx(e){return e.type===14&&e.callee===Kc?e.arguments[1].returns:e}const Ex=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Uh(e){for(let t=0;t<e.length;t++)if(!Es(e.charCodeAt(t)))return!1;return!0}function Yc(e){return e.type===2&&Uh(e.content)||e.type===12&&Yc(e.content)}function Hh(e){return e.type===3||Yc(e)}const zh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ua,isPreTag:Ua,isIgnoreNewlineTag:Ua,isCustomElement:Ua,onError:Zc,onWarn:Dh,comments:!1,prefixIdentifiers:!1};let Qe=zh,nl=null,An="",Qt=null,We=null,vs="",vn=-1,la=-1,Qc=0,Gn=!1,Vr=null;const mt=[],St=new mx(mt,{onerr:fn,ontext(e,t){El(jt(e,t),e,t)},ontextentity(e,t,s){El(e,t,s)},oninterpolation(e,t){if(Gn)return El(jt(e,t),e,t);let s=e+St.delimiterOpen.length,n=t-St.delimiterClose.length;for(;Es(An.charCodeAt(s));)s++;for(;Es(An.charCodeAt(n-1));)n--;let a=jt(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),qr({type:5,content:Fl(a,!1,Ct(s,n)),loc:Ct(e,t)})},onopentagname(e,t){const s=jt(e,t);Qt={type:1,tag:s,ns:Qe.getNamespace(s,mt[0],Qe.ns),tagType:0,props:[],children:[],loc:Ct(e-1,t),codegenNode:void 0}},onopentagend(e){fu(e)},onclosetag(e,t){const s=jt(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<mt.length;a++)if(mt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&fn(24,mt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=mt.shift();Ml(o,t,l<a)}break}n||fn(23,jh(e,60))}},onselfclosingtag(e){const t=Qt.tag;Qt.isSelfClosing=!0,fu(e),mt[0]&&mt[0].tag===t&&Ml(mt.shift(),e)},onattribname(e,t){We={type:6,name:jt(e,t),nameLoc:Ct(e,t),value:void 0,loc:Ct(e)}},ondirname(e,t){const s=jt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Gn&&n===""&&fn(26,e),Gn||n==="")We={type:6,name:s,nameLoc:Ct(e,t),value:void 0,loc:Ct(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[ze("prop")]:[],loc:Ct(e)},n==="pre"){Gn=St.inVPre=!0,Vr=Qt;const a=Qt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Fx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=jt(e,t);if(Gn&&!du(We))We.name+=s,da(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Fl(n?s:s.slice(1,-1),n,Ct(e,t),n?3:0)}},ondirmodifier(e,t){const s=jt(e,t);if(Gn&&!du(We))We.name+="."+s,da(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,da(n.loc,t))}else{const n=ze(s,!0,Ct(e,t));We.modifiers.push(n)}},onattribdata(e,t){vs+=jt(e,t),vn<0&&(vn=e),la=t},onattribentity(e,t,s){vs+=e,vn<0&&(vn=t),la=s},onattribnameend(e){const t=We.loc.start.offset,s=jt(t,e);We.type===7&&(We.rawName=s),Qt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&fn(2,t)},onattribend(e,t){if(Qt&&We){if(da(We.loc,t),e!==0)if(vs.includes("&")&&(vs=Qe.decodeEntities(vs,!0)),We.type===6)We.name==="class"&&(vs=qh(vs).trim()),e===1&&!vs&&fn(13,t),We.value={type:2,content:vs,loc:e===1?Ct(vn,la):Ct(vn-1,la+1)},St.inSFCRoot&&Qt.tag==="template"&&We.name==="lang"&&vs&&vs!=="html"&&St.enterRCDATA(ro("</template"),0);else{let s=0;We.exp=Fl(vs,!1,Ct(vn,la),0,s),We.name==="for"&&(We.forParseResult=Rx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&tl("COMPILER_V_BIND_SYNC",Qe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&Qt.props.push(We)}vs="",vn=la=-1},oncomment(e,t){Qe.comments&&qr({type:3,content:jt(e,t),loc:Ct(e-4,t+3)})},onend(){const e=An.length;for(let t=0;t<mt.length;t++)Ml(mt[t],e-1),fn(24,mt[t].loc.start.offset)},oncdata(e,t){(mt[0]?mt[0].ns:Qe.ns)!==0?El(jt(e,t),e,t):fn(1,e-9)},onprocessinginstruction(e){(mt[0]?mt[0].ns:Qe.ns)===0&&fn(21,e-1)}}),pu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Ax=/^\(|\)$/g;function Rx(e){const t=e.loc,s=e.content,n=s.match(Ex);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Fl(u,!1,Ct(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(Ax,"").trim();const c=a.indexOf(r),d=r.match(pu);if(d){r=r.replace(pu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function jt(e,t){return An.slice(e,t)}function fu(e){St.inSFCRoot&&(Qt.innerLoc=Ct(e+1,e+1)),qr(Qt);const{tag:t,ns:s}=Qt;s===0&&Qe.isPreTag(t)&&Qc++,Qe.isVoidTag(t)?Ml(Qt,e):(mt.unshift(Qt),(s===1||s===2)&&(St.inXML=!0)),Qt=null}function El(e,t,s){{const i=mt[0]&&mt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=mt[0]||nl,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,da(a.loc,s)):n.children.push({type:2,content:e,loc:Ct(t,s)})}function Ml(e,t,s=!1){s?da(e.loc,jh(t,60)):da(e.loc,Ix(t,62)+1),St.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=jt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Gn||(n==="slot"?e.tagType=2:hu(e)?e.tagType=3:Lx(e)&&(e.tagType=1)),St.inRCDATA||(e.children=Vh(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Qc--,Vr===e&&(Gn=St.inVPre=!1,Vr=null),St.inXML&&(mt[0]?mt[0].ns:Qe.ns)===0&&(St.inXML=!1);{const l=e.props;if(!St.inSFCRoot&&va("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!hu(e)){const r=mt[0]||nl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&tl("COMPILER_INLINE_TEMPLATE",Qe,o.loc)&&e.children.length&&(o.value={type:2,content:jt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function Ix(e,t){let s=e;for(;An.charCodeAt(s)!==t&&s<An.length-1;)s++;return s}function jh(e,t){let s=e;for(;An.charCodeAt(s)!==t&&s>=0;)s--;return s}const Ox=new Set(["if","else","else-if","for","slot"]);function hu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Ox.has(t[s].name))return!0}return!1}function Lx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||Nx(e.charCodeAt(0))||Ph(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(tl("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&ca(n.arg,"is")&&tl("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function Nx(e){return e>64&&e<91}const Dx=/\r\n/g;function Vh(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Qc)a.content=a.content.replace(Dx,`
`);else if(Uh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Px(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=qh(a.content))}return s?e.filter(Boolean):e}function Px(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function qh(e){let t="",s=!1;for(let n=0;n<e.length;n++)Es(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function qr(e){(mt[0]||nl).children.push(e)}function Ct(e,t){return{start:St.getPos(e),end:t==null?t:St.getPos(t),source:t==null?t:jt(e,t)}}function Mx(e){return Ct(e.start.offset,e.end.offset)}function da(e,t){e.end=St.getPos(t),e.source=jt(e.start.offset,t)}function Fx(e){const t={type:6,name:e.rawName,nameLoc:Ct(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Fl(e,t=!1,s,n=0,a=0){return ze(e,t,s,n)}function fn(e,t,s){Qe.onError(vt(e,Ct(t,t)))}function $x(){St.reset(),Qt=null,We=null,vs="",vn=-1,la=-1,mt.length=0}function Bx(e,t){if($x(),An=e,Qe=qe({},zh),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}St.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,St.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(St.delimiterOpen=ro(s[0]),St.delimiterClose=ro(s[1]));const n=nl=px([],e);return St.parse(An),n.loc=Ct(0,e.length),n.children=Vh(n.children),nl=null,n}function Ux(e,t){$l(e,void 0,t,!!Gh(e))}function Gh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!uo(t[0])?t[0]:null}function $l(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:As(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&Wh(u,s)>=2){const v=Zh(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:As(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,$l(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)$l(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)$l(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=r(ma(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(ma(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Ms(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(ma(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function As(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=Wh(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=As(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=As(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(ya),t.removeHelper(li(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ii(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return As(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||ss(o))continue;const r=As(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const Hx=new Set([jc,Vc,Xi,fl]);function Kh(e,t){if(e.type===14&&!Be(e.callee)&&Hx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return As(s,t);if(s.type===14)return Kh(s,t)}return 0}function Wh(e,t){let s=3;const n=Zh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=As(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=As(o,t):o.type===14?c=Kh(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Zh(e){const t=e.codegenNode;if(t.type===13)return t.props}function zx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Gt,isCustomElement:d=Gt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:k="",bindingMetadata:R=Ke,inline:y=!1,isTS:g=!1,onError:b=Zc,onWarn:S=Dh,compatConfig:w}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:A&&ka(ct(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:k,bindingMetadata:R,inline:y,isTS:g,onError:b,onWarn:S,compatConfig:w,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const N=C.helpers.get(x)||0;return C.helpers.set(x,N+1),x},removeHelper(x){const N=C.helpers.get(x);if(N){const B=N-1;B?C.helpers.set(x,B):C.helpers.delete(x)}},helperString(x){return`_${ni[C.helper(x)]}`},replaceNode(x){C.parent.children[C.childIndex]=C.currentNode=x},removeNode(x){const N=C.parent.children,B=x?N.indexOf(x):C.currentNode?C.childIndex:-1;!x||x===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>B&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(B,1)},onNodeRemoved:Gt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Be(x)&&(x=ze(x)),C.hoists.push(x);const N=ze(`_hoisted_${C.hoists.length}`,!1,x.loc,2);return N.hoisted=x,N},cache(x,N=!1,B=!1){const E=fx(C.cached.length,x,N,B);return C.cached.push(E),E}};return C.filters=new Set,C}function jx(e,t){const s=zx(e,t);Bo(e,s),t.hoistStatic&&Ux(e,s),t.ssr||Vx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Vx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Gh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Wc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=el(t,s(Qi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function qx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Be(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Bo(a,t))}}function Bo(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(pl);break;case 5:t.ssr||t.helper(Fo);break;case 9:for(let i=0;i<e.branches.length;i++)Bo(e.branches[i],t);break;case 10:case 11:case 1:case 0:qx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Jh(e,t){const s=Be(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(Sx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Uo="/*@__PURE__*/",Yh=e=>`${ni[e]}: _${ni[e]}`;function Gx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ni[v]}`},push(v,k=-2,R){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function Kx(e,t={}){const s=Gx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";Wx(e,s);const v=d?"ssrRender":"render",R=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${R}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Yh).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(lr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(lr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),lr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?ts(e.codegenNode,s):a("null"),h&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Wx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Dc,Pc,pl,Mc,Ih].filter(p=>d.includes(p)).map(Yh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Zx(e.hoists,t),i(),a("return ")}function lr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Uc:t==="component"?Fc:Bc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${sl(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function Zx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),ts(i,t),n())}t.pure=!1}function Xc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),hl(e,t,s),s&&t.deindent(),t.push("]")}function hl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?a(o,-3):Ce(o)?Xc(o,t):ts(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function ts(e,t){if(Be(e)){t.push(e,-3);return}if(ss(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ts(e.codegenNode,t);break;case 2:Jx(e,t);break;case 4:Qh(e,t);break;case 5:Yx(e,t);break;case 12:ts(e.codegenNode,t);break;case 8:Xh(e,t);break;case 3:Xx(e,t);break;case 13:e0(e,t);break;case 14:s0(e,t);break;case 15:n0(e,t);break;case 17:a0(e,t);break;case 18:i0(e,t);break;case 19:l0(e,t);break;case 20:o0(e,t);break;case 21:hl(e.body,t,!0,!1);break}}function Jx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Qh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Yx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Uo),s(`${n(Fo)}(`),ts(e.content,t),s(")")}function Xh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Be(n)?t.push(n,-3):ts(n,t)}}function Qx(e,t){const{push:s}=t;if(e.type===8)s("["),Xh(e,t),s("]");else if(e.isStatic){const n=Jc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Xx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Uo),s(`${n(pl)}(${JSON.stringify(e.content)})`,-3,e)}function e0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(n(Hc)+"("),u&&s(`(${n(ya)}(${p?"true":""}), `),a&&s(Uo);const v=u?li(t.inSSR,h):ii(t.inSSR,h);s(n(v)+"(",-2,e),hl(t0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ts(d,t),s(")"))}function t0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function s0(e,t){const{push:s,helper:n,pure:a}=t,i=Be(e.callee)?e.callee:n(e.callee);a&&s(Uo),s(i+"(",-2,e),hl(e.arguments,t),s(")")}function n0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];Qx(c,t),s(": "),ts(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function a0(e,t){Xc(e.elements,t)}function i0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${ni[Gc]}(`),s("(",-2,e),Ce(i)?hl(i,t):i&&ts(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ce(l)?Xc(l,t):ts(l,t)):o&&ts(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function l0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Jc(s.content);u&&l("("),Qh(s,t),u&&l(")")}else l("("),ts(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ts(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,ts(a,t),d||t.indentLevel--,i&&r(!0)}function o0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(oo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ts(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(oo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const r0=Jh(/^(?:if|else|else-if)$/,(e,t,s)=>c0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=vu(a,r,s);else{const c=d0(n.codegenNode);c.alternate=vu(a,r+n.branches.length-1,s)}}}));function c0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(vt(28,t.loc)),t.exp=ze("true",!1,a)}if(t.name==="if"){const a=mu(e,t),i={type:9,loc:Mx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Hh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(vt(30,e.loc)),s.removeNode();const o=mu(e,t);l.branches.push(o);const r=n&&n(l,o,!1);Bo(o,s),r&&r(),s.currentNode=null}else s.onError(vt(30,e.loc));break}}}function mu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Ms(e,"for")?e.children:[e],userKey:$o(e,"key"),isTemplateIf:s}}function vu(e,t,s){return e.condition?jr(e.condition,gu(e,t,s),Mt(s.helper(pl),['""',"true"])):gu(e,t,s)}function gu(e,t,s){const{helper:n}=s,a=It("key",ze(`${t}`,!1,Os,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return po(r,a,s),r}else return el(s,n(Qi),Fs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Cx(r);return c.type===13&&Wc(c,s),po(c,a,s),r}}function d0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const u0=Jh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return p0(e,t,s,i=>{const l=Mt(n(zc),[i.source]),o=co(e),r=Ms(e,"memo"),c=$o(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?ze(c.value.content,!0):void 0:c.exp);const u=d?It("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=el(s,n(Qi),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,k=v.length!==1||v[0].type!==1,R=uo(e)?e:o&&e.children.length===1&&uo(e.children[0])?e.children[0]:null;if(R?(m=R.codegenNode,o&&u&&po(m,u,s)):k?m=el(s,n(Qi),u?Fs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&po(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ya),a(li(s.inSSR,m.isComponent))):a(ii(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ya),n(li(s.inSSR,m.isComponent))):n(ii(s.inSSR,m.isComponent))),r){const y=ai(Gr(i.parseResult,[ze("_cached")]));y.body=hx([qs(["const _memo = (",r.exp,")"]),qs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Nh)}(_cached, _memo)) return _cached`]),qs(["const _item = ",m]),ze("_item.memo = _memo"),ze("return _item")]),l.arguments.push(y,ze("_cache"),ze(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ai(Gr(i.parseResult),m,!0))}})});function p0(e,t,s,n){if(!t.exp){s.onError(vt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(vt(32,t.loc));return}em(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:co(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=n&&n(p);return()=>{o.vFor--,h&&h()}}function em(e,t){e.finalized||(e.finalized=!0)}function Gr({value:e,key:t,index:s},n=[]){return f0([e,t,s,...n])}function f0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||ze("_".repeat(n+1),!1))}const bu=ze("undefined",!1),h0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Ms(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},m0=(e,t,s,n)=>ai(e,s,!1,!0,s.length?s[0].loc:n);function v0(e,t,s=m0){t.helper(Gc);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Ms(e,"slot",!0);if(r){const{arg:k,exp:R}=r;k&&!_s(k)&&(o=!0),i.push(It(k||ze("default",!0),s(R,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let k=0;k<n.length;k++){const R=n[k];let y;if(!co(R)||!(y=Ms(R,"slot",!0))){R.type!==3&&u.push(R);continue}if(r){t.onError(vt(37,y.loc));break}c=!0;const{children:g,loc:b}=R,{arg:S=ze("default",!0),exp:w,loc:A}=y;let C;_s(S)?C=S?S.content:"default":o=!0;const x=Ms(R,"for"),N=s(w,x,g,b);let B,E;if(B=Ms(R,"if"))o=!0,l.push(jr(B.exp,Al(S,N,h++),bu));else if(E=Ms(R,/^else(?:-if)?$/,!0)){let M=k,V;for(;M--&&(V=n[M],!!Hh(V)););if(V&&co(V)&&Ms(V,/^(?:else-)?if$/)){let q=l[l.length-1];for(;q.alternate.type===19;)q=q.alternate;q.alternate=E.exp?jr(E.exp,Al(S,N,h++),bu):Al(S,N,h++)}else t.onError(vt(30,E.loc))}else if(x){o=!0;const M=x.forParseResult;M?(em(M),l.push(Mt(t.helper(zc),[M.source,ai(Gr(M),Al(S,N),!0)]))):t.onError(vt(32,x.loc))}else{if(C){if(p.has(C)){t.onError(vt(38,A));continue}p.add(C),C==="default"&&(d=!0)}i.push(It(S,N))}}if(!r){const k=(R,y)=>{const g=s(R,void 0,y,a);return t.compatConfig&&(g.isNonScopedSlot=!0),It("default",g)};c?u.length&&!u.every(Yc)&&(d?t.onError(vt(39,u[0].loc)):i.push(k(void 0,u))):i.push(k(void 0,n))}const m=o?2:Bl(e.children)?3:1;let v=Fs(i.concat(It("_",ze(m+"",!1))),a);return l.length&&(v=Mt(t.helper(Lh),[v,ma(l)])),{slots:v,hasDynamicSlots:o}}function Al(e,t,s){const n=[It("name",e),It("fn",t)];return s!=null&&n.push(It("key",ze(String(s),!0))),Fs(n)}function Bl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Bl(s.children))return!0;break;case 9:if(Bl(s.branches))return!0;break;case 10:case 11:if(Bl(s.children))return!0;break}}return!1}const tm=new WeakMap,g0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?b0(e,t):`"${n}"`;const o=Xe(l)&&l.callee===$c;let r,c,d=0,u,p,h,m=o||l===Mi||l===Nc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=sm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const k=v.directives;h=k&&k.length?ma(k.map(R=>x0(R,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===io&&(m=!0,d|=1024),i&&l!==Mi&&l!==io){const{slots:k,hasDynamicSlots:R}=v0(e,t);c=k,R&&(d|=1024)}else if(e.children.length===1&&l!==Mi){const k=e.children[0],R=k.type,y=R===5||R===8;y&&As(k,t)===0&&(d|=1),y||R===2?c=k:c=e.children}else c=e.children;p&&p.length&&(u=_0(p)),e.codegenNode=el(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function b0(e,t,s=!1){let{tag:n}=e;const a=Kr(n),i=$o(e,"is",!1,!0);if(i)if(a||va("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&ze(i.value.content,!0):(o=i.exp,o||(o=ze("is",!1,i.arg.loc))),o)return Mt(t.helper($c),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Ph(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Fc),t.components.add(n),sl(n,"component"))}function sm(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,k=!1,R=!1,y=!1,g=!1,b=!1;const S=[],w=N=>{c.length&&(d.push(Fs(yu(c),o)),c=[]),N&&d.push(N)},A=()=>{t.scopes.vFor>0&&c.push(It(ze("ref_for",!0),ze("true")))},C=({key:N,value:B})=>{if(_s(N)){const E=N.content,M=_a(E);if(M&&(!n||a)&&E.toLowerCase()!=="onclick"&&E!=="onUpdate:modelValue"&&!Tn(E)&&(y=!0),M&&Tn(E)&&(b=!0),M&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&As(B,t)>0)return;E==="ref"?v=!0:E==="class"?k=!0:E==="style"?R=!0:E!=="key"&&!S.includes(E)&&S.push(E),n&&(E==="class"||E==="style")&&!S.includes(E)&&S.push(E)}else g=!0};for(let N=0;N<s.length;N++){const B=s[N];if(B.type===6){const{loc:E,name:M,nameLoc:V,value:q}=B;let D=!0;if(M==="ref"&&(v=!0,A()),M==="is"&&(Kr(l)||q&&q.content.startsWith("vue:")||va("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(It(ze(M,!0,V),ze(q?q.content:"",D,q?q.loc:E)))}else{const{name:E,arg:M,exp:V,loc:q,modifiers:D}=B,L=E==="bind",I=E==="on";if(E==="slot"){n||t.onError(vt(40,q));continue}if(E==="once"||E==="memo"||E==="is"||L&&ca(M,"is")&&(Kr(l)||va("COMPILER_IS_ON_ELEMENT",t))||I&&i)continue;if((L&&ca(M,"key")||I&&p&&ca(M,"vue:before-update"))&&(h=!0),L&&ca(M,"ref")&&A(),!M&&(L||I)){if(g=!0,V)if(L){if(w(),va("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}A(),w(),d.push(V)}else w({type:14,loc:q,callee:t.helper(qc),arguments:n?[V]:[V,"true"]});else t.onError(vt(L?34:35,q));continue}L&&D.some(W=>W.content==="prop")&&(m|=32);const U=t.directiveTransforms[E];if(U){const{props:W,needRuntime:K}=U(B,e,t);!i&&W.forEach(C),I&&M&&!_s(M)?w(Fs(W,o)):c.push(...W),K&&(u.push(B),ss(K)&&tm.set(B,K))}else uv(E)||(u.push(B),p&&(h=!0))}}let x;if(d.length?(w(),d.length>1?x=Mt(t.helper(lo),d,o):x=d[0]):c.length&&(x=Fs(yu(c),o)),g?m|=16:(k&&!n&&(m|=2),R&&!n&&(m|=4),S.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let N=-1,B=-1,E=!1;for(let q=0;q<x.properties.length;q++){const D=x.properties[q].key;_s(D)?D.content==="class"?N=q:D.content==="style"&&(B=q):D.isHandlerKey||(E=!0)}const M=x.properties[N],V=x.properties[B];E?x=Mt(t.helper(Xi),[x]):(M&&!_s(M.value)&&(M.value=Mt(t.helper(jc),[M.value])),V&&(R||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=Mt(t.helper(Vc),[V.value])));break;case 14:break;default:x=Mt(t.helper(Xi),[Mt(t.helper(fl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:S,shouldUseBlock:h}}function yu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||_a(i))&&y0(l,a):(t.set(i,a),s.push(a))}return s}function y0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ma([e.value,t.value],e.loc)}function x0(e,t){const s=[],n=tm.get(e);n?s.push(t.helperString(n)):(t.helper(Bc),t.directives.add(e.name),s.push(sl(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=ze("true",!1,a);s.push(Fs(e.modifiers.map(l=>It(l,i)),a))}return ma(s,e.loc)}function _0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Kr(e){return e==="component"||e==="Component"}const w0=(e,t)=>{if(uo(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=k0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=ai([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Mt(t.helper(Oh),l,n)}};function k0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ct(l.name),a.push(l)));else if(l.name==="bind"&&ca(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=ct(l.arg.content);s=l.exp=ze(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&_s(l.arg)&&(l.arg.content=ct(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=sm(e,t,a,!1,!1);n=i,l.length&&t.onError(vt(36,l[0].loc))}return{slotName:s,slotProps:n}}const nm=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(vt(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Va(ct(u)):`on:${u}`;o=ze(p,!0,l.loc)}else o=qs([`${s.helperString(zr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(zr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=$h(r),p=!(u||wx(r)),h=r.content.includes(";");(p||c&&u)&&(r=qs([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[It(o,r||ze("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},S0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=ct(i.content):i.content=`${s.helperString(Hr)}(${i.content})`:(i.children.unshift(`${s.helperString(Hr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&xu(i,"."),n.some(o=>o.content==="attr")&&xu(i,"^")),{props:[It(i,l)]}},xu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},T0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(ir(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(ir(r))n||(n=s[i]=qs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(ir(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&As(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Mt(t.helper(Mc),o)}}}}},_u=new WeakSet,C0=(e,t)=>{if(e.type===1&&Ms(e,"once",!0))return _u.has(e)||t.inVOnce||t.inSSR?void 0:(_u.add(e),t.inVOnce=!0,t.helper(oo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},am=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(vt(41,e.loc)),yi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(vt(44,n.loc)),yi();if(o==="literal-const"||o==="setup-const")return s.onError(vt(45,n.loc)),yi();if(!l.trim()||!$h(n))return s.onError(vt(42,n.loc)),yi();const r=a||ze("modelValue",!0),c=a?_s(a)?`onUpdate:${ct(a.content)}`:qs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=qs([`${u} => ((`,n,") = $event)"]);const p=[It(r,e.exp),It(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(Jc(v)?v:JSON.stringify(v))+": true").join(", "),m=a?_s(a)?`${a.content}Modifiers`:qs([a,' + "Modifiers"']):"modelModifiers";p.push(It(m,ze(`{ ${h} }`,!1,e.loc,2)))}return yi(p)};function yi(e=[]){return{props:e}}const E0=/[\w).+\-_$\]]/,A0=(e,t)=>{va("COMPILER_FILTERS",t)&&(e.type===5?fo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&fo(s.exp,t)}))};function fo(e,t){if(e.type===4)wu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?wu(n,t):n.type===8?fo(e,t):n.type===5&&fo(n.content,t))}}function wu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):k();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let R=h-1,y;for(;R>=0&&(y=s.charAt(R),y===" ");R--);(!y||!E0.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&k();function k(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=R0(m,v[h],t);e.content=m,e.ast=void 0}}function R0(e,t,s){s.helper(Uc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${sl(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${sl(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ku=new WeakSet,I0=(e,t)=>{if(e.type===1){const s=Ms(e,"memo");return!s||ku.has(e)||t.inSSR?void 0:(ku.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Wc(n,t),e.codegenNode=Mt(t.helper(Kc),[s.exp,ai(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},O0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(vt(53,n.loc)),s.exp=ze("",!0,n.loc);else{const a=ct(n.content);(Mh.test(a[0])||a[0]==="-")&&(s.exp=ze(a,!1,n.loc))}}}};function L0(e){return[[O0,C0,r0,I0,u0,A0,w0,g0,h0,T0],{on:nm,bind:S0,model:am}]}function N0(e,t={}){const s=t.onError||Zc,n=t.mode==="module";t.prefixIdentifiers===!0?s(vt(48)):n&&s(vt(49));const a=!1;t.cacheHandlers&&s(vt(50)),t.scopeId&&!n&&s(vt(51));const i=qe({},t,{prefixIdentifiers:a}),l=Be(e)?Bx(e,i):e,[o,r]=L0();return jx(l,qe({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:qe({},r,t.directiveTransforms||{})})),Kx(l,i)}const D0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const im=Symbol(""),lm=Symbol(""),om=Symbol(""),rm=Symbol(""),Wr=Symbol(""),cm=Symbol(""),dm=Symbol(""),um=Symbol(""),pm=Symbol(""),fm=Symbol("");ux({[im]:"vModelRadio",[lm]:"vModelCheckbox",[om]:"vModelText",[rm]:"vModelSelect",[Wr]:"vModelDynamic",[cm]:"withModifiers",[dm]:"withKeys",[um]:"vShow",[pm]:"Transition",[fm]:"TransitionGroup"});let La;function P0(e,t=!1){return La||(La=document.createElement("div")),t?(La.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,La.children[0].getAttribute("foo")):(La.innerHTML=e,La.textContent)}const M0={parseMode:"html",isVoidTag:Av,isNativeTag:e=>Tv(e)||Cv(e)||Ev(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:P0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return pm;if(e==="TransitionGroup"||e==="transition-group")return fm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},F0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:ze("style",!0,t.loc),exp:$0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},$0=(e,t)=>{const s=Tp(e);return ze(JSON.stringify(s),!1,t,3)};function Zn(e,t){return vt(e,t)}const B0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Zn(54,a)),t.children.length&&(s.onError(Zn(55,a)),t.children.length=0),{props:[It(ze("innerHTML",!0,a),n||ze("",!0))]}},U0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Zn(56,a)),t.children.length&&(s.onError(Zn(57,a)),t.children.length=0),{props:[It(ze("textContent",!0),n?As(n,s)>0?n:Mt(s.helperString(Fo),[n],a):ze("",!0))]}},H0=(e,t,s)=>{const n=am(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Zn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=om,o=!1;if(a==="input"||i){const r=$o(t,"type");if(r){if(r.type===7)l=Wr;else if(r.value)switch(r.value.content){case"radio":l=im;break;case"checkbox":l=lm;break;case"file":o=!0,s.onError(Zn(60,e.loc));break}}else kx(t)&&(l=Wr)}else a==="select"&&(l=rm);o||(n.needRuntime=s.helper(l))}else s.onError(Zn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},z0=Is("passive,once,capture"),j0=Is("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),V0=Is("left,right"),hm=Is("onkeyup,onkeydown,onkeypress"),q0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&tl("COMPILER_V_ON_NATIVE",s)||z0(r)?l.push(r):V0(r)?_s(e)?hm(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):j0(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Su=(e,t)=>_s(e)&&e.content.toLowerCase()==="onclick"?ze(t,!0):e.type!==4?qs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,G0=(e,t,s)=>nm(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=q0(i,a,s,e.loc);if(r.includes("right")&&(i=Su(i,"onContextmenu")),r.includes("middle")&&(i=Su(i,"onMouseup")),r.length&&(l=Mt(s.helper(cm),[l,JSON.stringify(r)])),o.length&&(!_s(i)||hm(i.content.toLowerCase()))&&(l=Mt(s.helper(dm),[l,JSON.stringify(o)])),c.length){const d=c.map(ka).join("");i=_s(i)?ze(`${i.content}${d}`,!0):qs(["(",i,`) + "${d}"`])}return{props:[It(i,l)]}}),K0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Zn(62,a)),{props:[],needRuntime:s.helper(um)}},W0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},Z0=[F0],J0={cloak:D0,html:B0,text:U0,model:H0,on:G0,show:K0};function Y0(e,t={}){return N0(e,qe({},M0,t,{nodeTransforms:[W0,...Z0,...t.nodeTransforms||[]],directiveTransforms:qe({},J0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Tu=Object.create(null);function Q0(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Gt;const s=hv(e,t),n=Tu[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Gt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=Y0(e,a),l=new Function("Vue",i)(ix);return l._rc=!0,Tu[s]=l}Yf(Q0);const ho=Yn({items:[]});let X0=1;function Ho(e,t="info",s=3e3){const n=X0++;return ho.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>ed(n),s),n}function ed(e){const t=ho.items.findIndex(s=>s.id===e);t>=0&&ho.items.splice(t,1)}function _e(e,t="info",s=3e3){return Ho(e,t,s)}_e.success=(e,t=3e3)=>Ho(e,"success",t);_e.error=(e,t=5e3)=>Ho(e,"error",t);_e.info=(e,t=3e3)=>Ho(e,"info",t);_e.dismiss=ed;const e_={setup(){return{state:ho,dismiss:ed}},template:`
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
  `},yn=Yn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ja=null;function Ut({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ja&&Ja(!1),yn.title=e,yn.message=t,yn.confirmLabel=s,yn.cancelLabel=n,yn.danger=a,yn.open=!0,new Promise(i=>{Ja=i})}function Cu(e){yn.open=!1,Ja&&(Ja(e),Ja=null)}const t_={setup(){function e(t){yn.open&&t.key==="Escape"&&(t.stopPropagation(),Cu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),gt(()=>document.removeEventListener("keydown",e,!0)),{state:yn,settle:Cu}},template:`
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
 */const $a=typeof document<"u";function mm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function s_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&mm(e.default)}const it=Object.assign;function or(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ks(a)?a.map(e):e(a)}return s}const Fi=()=>{},Ks=Array.isArray;function Eu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const vm=/#/g,n_=/&/g,a_=/\//g,i_=/=/g,l_=/\?/g,gm=/\+/g,o_=/%5B/g,r_=/%5D/g,bm=/%5E/g,c_=/%60/g,ym=/%7B/g,d_=/%7C/g,xm=/%7D/g,u_=/%20/g;function td(e){return e==null?"":encodeURI(""+e).replace(d_,"|").replace(o_,"[").replace(r_,"]")}function p_(e){return td(e).replace(ym,"{").replace(xm,"}").replace(bm,"^")}function Zr(e){return td(e).replace(gm,"%2B").replace(u_,"+").replace(vm,"%23").replace(n_,"%26").replace(c_,"`").replace(ym,"{").replace(xm,"}").replace(bm,"^")}function f_(e){return Zr(e).replace(i_,"%3D")}function h_(e){return td(e).replace(vm,"%23").replace(l_,"%3F")}function m_(e){return h_(e).replace(a_,"%2F")}function al(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const v_=/\/$/,g_=e=>e.replace(v_,"");function rr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=__(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:al(l)}}function b_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Au(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function y_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&oi(t.matched[n],s.matched[a])&&_m(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function oi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function _m(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!x_(e[s],t[s]))return!1;return!0}function x_(e,t){return Ks(e)?Ru(e,t):Ks(t)?Ru(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Ru(e,t){return Ks(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function __(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Hn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Jr=(function(e){return e.pop="pop",e.push="push",e})({}),cr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function w_(e){if(!e)if($a){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),g_(e)}const k_=/^[^#]+#/;function S_(e,t){return e.replace(k_,"#")+t}function T_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const zo=()=>({left:window.scrollX,top:window.scrollY});function C_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=T_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Iu(e,t){return(history.state?history.state.position-t:-1)+e}const Yr=new Map;function E_(e,t){Yr.set(e,t)}function A_(e){const t=Yr.get(e);return Yr.delete(e),t}function R_(e){return typeof e=="string"||e&&typeof e=="object"}function wm(e){return typeof e=="string"||typeof e=="symbol"}let kt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const km=Symbol("");kt.MATCHER_NOT_FOUND+"",kt.NAVIGATION_GUARD_REDIRECT+"",kt.NAVIGATION_ABORTED+"",kt.NAVIGATION_CANCELLED+"",kt.NAVIGATION_DUPLICATED+"";function ri(e,t){return it(new Error,{type:e,[km]:!0},t)}function hn(e,t){return e instanceof Error&&km in e&&(t==null||!!(e.type&t))}const I_=["params","query","hash"];function O_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of I_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function L_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(gm," "),i=a.indexOf("="),l=al(i<0?a:a.slice(0,i)),o=i<0?null:al(a.slice(i+1));if(l in t){let r=t[l];Ks(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Ou(e){let t="";for(let s in e){const n=e[s];if(s=f_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ks(n)?n.map(a=>a&&Zr(a)):[n&&Zr(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function N_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ks(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const D_=Symbol(""),Lu=Symbol(""),jo=Symbol(""),sd=Symbol(""),Qr=Symbol("");function xi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Kn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(ri(kt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):R_(p)?r(ri(kt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function dr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(mm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Kn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=s_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Kn(p,s,n,l,o,a)()}))}}return i}function P_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>oi(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>oi(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let M_=()=>location.protocol+"//"+location.host;function Sm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),Au(o,"")}return Au(s,e)+n+a}function F_(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const h=Sm(e,location),m=s.value,v=t.value;let k=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}k=v?p.position-v.position:0}else n(h);a.forEach(R=>{R(s.value,m,{delta:k,type:Jr.pop,direction:k?k>0?cr.forward:cr.back:cr.unknown})})};function r(){l=s.value}function c(p){a.push(p);const h=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(it({},p.state,{scroll:zo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Nu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?zo():null}}function $_(e){const{history:t,location:s}=window,n={value:Sm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:M_()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,it({},t.state,Nu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=it({},a.value,t.state,{forward:r,scroll:zo()});i(d.current,d,!0),i(r,it({},Nu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function B_(e){e=w_(e);const t=$_(e),s=F_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=it({location:"",base:e,go:n,createHref:S_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function U_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),B_(e)}let ua=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Dt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Dt||{});const H_={type:ua.Static,value:""},z_=/[a-zA-Z0-9_]/;function j_(e){if(!e)return[[]];if(e==="/")return[[H_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Dt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Dt.Static?i.push({type:ua.Static,value:c}):s===Dt.Param||s===Dt.ParamRegExp||s===Dt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:ua.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Dt.ParamRegExp){n=s,s=Dt.EscapeNext;continue}switch(s){case Dt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Dt.Param):p();break;case Dt.EscapeNext:p(),s=n;break;case Dt.Param:r==="("?s=Dt.ParamRegExp:z_.test(r)?p():(u(),s=Dt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Dt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Dt.ParamRegExpEnd:d+=r;break;case Dt.ParamRegExpEnd:u(),s=Dt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Dt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Du="[^/]+?",V_={sensitive:!1,strict:!1,start:!0,end:!0};var rs=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(rs||{});const q_=/[.+*?^${}()[\]/\\]/g;function G_(e,t){const s=it({},V_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[rs.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=rs.Segment+(s.sensitive?rs.BonusCaseSensitive:0);if(p.type===ua.Static)u||(a+="/"),a+=p.value.replace(q_,"\\$&"),h+=rs.Static;else if(p.type===ua.Param){const{value:m,repeatable:v,optional:k,regexp:R}=p;i.push({name:m,repeatable:v,optional:k});const y=R||Du;if(y!==Du){h+=rs.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=k&&c.length<2?`(?:/${g})`:"/"+g),k&&(g+="?"),a+=g,h+=rs.Dynamic,k&&(h+=rs.BonusOptional),v&&(h+=rs.BonusRepeatable),y===".*"&&(h+=rs.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=rs.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===ua.Static)d+=h.value;else if(h.type===ua.Param){const{value:m,repeatable:v,optional:k}=h,R=m in c?c[m]:"";if(Ks(R)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Ks(R)?R.join("/"):R;if(!y)if(k)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function K_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===rs.Static+rs.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===rs.Static+rs.Segment?1:-1:0}function Tm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=K_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Pu(n))return 1;if(Pu(a))return-1}return a.length-n.length}function Pu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const W_={strict:!1,end:!0,sensitive:!1};function Z_(e,t,s){const n=G_(j_(e.path),s),a=it(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function J_(e,t){const s=[],n=new Map;t=Eu(W_,t);function a(u){return n.get(u)}function i(u,p,h){const m=!h,v=Fu(u);v.aliasOf=h&&h.record;const k=Eu(t,u),R=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of b)R.push(Fu(it({},v,{components:h?h.record.components:v.components,path:S,aliasOf:h?h.record:v})))}let y,g;for(const b of R){const{path:S}=b;if(p&&S[0]!=="/"){const w=p.record.path,A=w[w.length-1]==="/"?"":"/";b.path=p.record.path+(S&&A+S)}if(y=Z_(b,p,k),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!$u(y)&&l(u.name)),Cm(y)&&r(y),v.children){const w=v.children;for(let A=0;A<w.length;A++)i(w[A],y,h&&h.children[A])}h=h||y}return g?()=>{l(g)}:Fi}function l(u){if(wm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=X_(u,s);s.splice(p,0,u),u.record.name&&!$u(u)&&n.set(u.record.name,u)}function c(u,p){let h,m={},v,k;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw ri(kt.MATCHER_NOT_FOUND,{location:u});k=h.record.name,m=it(Mu(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Mu(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),k=h.record.name);else{if(h=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw ri(kt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});k=h.record.name,m=it({},p.params,u.params),v=h.stringify(m)}const R=[];let y=h;for(;y;)R.unshift(y.record),y=y.parent;return{name:k,path:v,params:m,matched:R,meta:Q_(R)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Mu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Fu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Y_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Y_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function $u(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Q_(e){return e.reduce((t,s)=>it(t,s.meta),{})}function X_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Tm(e,t[i])<0?n=i:s=i+1}const a=ew(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function ew(e){let t=e;for(;t=t.parent;)if(Cm(t)&&Tm(e,t)===0)return t}function Cm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Bu(e){const t=$s(jo),s=$s(sd),n=J(()=>{const r=an(e.to);return t.resolve(r)}),a=J(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(oi.bind(null,d));if(p>-1)return p;const h=Uu(r[c-2]);return c>1&&Uu(d)===h&&u[u.length-1].path!==h?u.findIndex(oi.bind(null,r[c-2])):p}),i=J(()=>a.value>-1&&iw(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&_m(s.params,n.value.params));function o(r={}){if(aw(r)){const c=t[an(e.replace)?"replace":"push"](an(e.to)).catch(Fi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function tw(e){return e.length===1?e[0]:e}const sw=cl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Bu,setup(e,{slots:t}){const s=Yn(Bu(e)),{options:n}=$s(jo),a=J(()=>({[Hu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Hu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&tw(t.default(s));return e.custom?i:ei("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),nw=sw;function aw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function iw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ks(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Uu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Hu=(e,t,s)=>e??t??s,lw=cl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=$s(Qr),a=J(()=>e.route||n.value),i=$s(Lu,0),l=J(()=>{let c=an(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=J(()=>a.value.matched[l.value]);Li(Lu,J(()=>l.value+1)),Li(D_,o),Li(Qr,a);const r=f();return us(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!oi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return zu(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,k=ei(p,it({},m,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return zu(s.default,{Component:k,route:c})||k}}});function zu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const ow=lw;function rw(e){const t=J_(e.routes,e),s=e.parseQuery||L_,n=e.stringifyQuery||Ou,a=e.history,i=xi(),l=xi(),o=xi(),r=pc(Hn);let c=Hn;$a&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=or.bind(null,Q=>""+Q),u=or.bind(null,m_),p=or.bind(null,al);function h(Q,be){let z,re;return wm(Q)?(z=t.getRecordMatcher(Q),re=be):re=Q,t.addRoute(re,z)}function m(Q){const be=t.getRecordMatcher(Q);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(Q=>Q.record)}function k(Q){return!!t.getRecordMatcher(Q)}function R(Q,be){if(be=it({},be||r.value),typeof Q=="string"){const P=rr(s,Q,be.path),H=t.resolve({path:P.path},be),ie=a.createHref(P.fullPath);return it(P,H,{params:p(H.params),hash:al(P.hash),redirectedFrom:void 0,href:ie})}let z;if(Q.path!=null)z=it({},Q,{path:rr(s,Q.path,be.path).path});else{const P=it({},Q.params);for(const H in P)P[H]==null&&delete P[H];z=it({},Q,{params:u(P)}),be.params=u(be.params)}const re=t.resolve(z,be),ue=Q.hash||"";re.params=d(p(re.params));const Le=b_(n,it({},Q,{hash:p_(ue),path:re.path})),_=a.createHref(Le);return it({fullPath:Le,hash:ue,query:n===Ou?N_(Q.query):Q.query||{}},re,{redirectedFrom:void 0,href:_})}function y(Q){return typeof Q=="string"?rr(s,Q,r.value.path):it({},Q)}function g(Q,be){if(c!==Q)return ri(kt.NAVIGATION_CANCELLED,{from:be,to:Q})}function b(Q){return A(Q)}function S(Q){return b(it(y(Q),{replace:!0}))}function w(Q,be){const z=Q.matched[Q.matched.length-1];if(z&&z.redirect){const{redirect:re}=z;let ue=typeof re=="function"?re(Q,be):re;return typeof ue=="string"&&(ue=ue.includes("?")||ue.includes("#")?ue=y(ue):{path:ue},ue.params={}),it({query:Q.query,hash:Q.hash,params:ue.path!=null?{}:Q.params},ue)}}function A(Q,be){const z=c=R(Q),re=r.value,ue=Q.state,Le=Q.force,_=Q.replace===!0,P=w(z,re);if(P)return A(it(y(P),{state:typeof P=="object"?it({},ue,P.state):ue,force:Le,replace:_}),be||z);const H=z;H.redirectedFrom=be;let ie;return!Le&&y_(n,re,z)&&(ie=ri(kt.NAVIGATION_DUPLICATED,{to:H,from:re}),K(re,re,!0,!1)),(ie?Promise.resolve(ie):N(H,re)).catch(se=>hn(se)?hn(se,kt.NAVIGATION_GUARD_REDIRECT)?se:W(se):I(se,H,re)).then(se=>{if(se){if(hn(se,kt.NAVIGATION_GUARD_REDIRECT))return A(it({replace:_},y(se.to),{state:typeof se.to=="object"?it({},ue,se.to.state):ue,force:Le}),be||H)}else se=E(H,re,!0,_,ue);return B(H,re,se),se})}function C(Q,be){const z=g(Q,be);return z?Promise.reject(z):Promise.resolve()}function x(Q){const be=ee.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(Q):Q()}function N(Q,be){let z;const[re,ue,Le]=P_(Q,be);z=dr(re.reverse(),"beforeRouteLeave",Q,be);for(const P of re)P.leaveGuards.forEach(H=>{z.push(Kn(H,Q,be))});const _=C.bind(null,Q,be);return z.push(_),De(z).then(()=>{z=[];for(const P of i.list())z.push(Kn(P,Q,be));return z.push(_),De(z)}).then(()=>{z=dr(ue,"beforeRouteUpdate",Q,be);for(const P of ue)P.updateGuards.forEach(H=>{z.push(Kn(H,Q,be))});return z.push(_),De(z)}).then(()=>{z=[];for(const P of Le)if(P.beforeEnter)if(Ks(P.beforeEnter))for(const H of P.beforeEnter)z.push(Kn(H,Q,be));else z.push(Kn(P.beforeEnter,Q,be));return z.push(_),De(z)}).then(()=>(Q.matched.forEach(P=>P.enterCallbacks={}),z=dr(Le,"beforeRouteEnter",Q,be,x),z.push(_),De(z))).then(()=>{z=[];for(const P of l.list())z.push(Kn(P,Q,be));return z.push(_),De(z)}).catch(P=>hn(P,kt.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function B(Q,be,z){o.list().forEach(re=>x(()=>re(Q,be,z)))}function E(Q,be,z,re,ue){const Le=g(Q,be);if(Le)return Le;const _=be===Hn,P=$a?history.state:{};z&&(re||_?a.replace(Q.fullPath,it({scroll:_&&P&&P.scroll},ue)):a.push(Q.fullPath,ue)),r.value=Q,K(Q,be,z,_),W()}let M;function V(){M||(M=a.listen((Q,be,z)=>{if(!ce.listening)return;const re=R(Q),ue=w(re,ce.currentRoute.value);if(ue){A(it(ue,{replace:!0,force:!0}),re).catch(Fi);return}c=re;const Le=r.value;$a&&E_(Iu(Le.fullPath,z.delta),zo()),N(re,Le).catch(_=>hn(_,kt.NAVIGATION_ABORTED|kt.NAVIGATION_CANCELLED)?_:hn(_,kt.NAVIGATION_GUARD_REDIRECT)?(A(it(y(_.to),{force:!0}),re).then(P=>{hn(P,kt.NAVIGATION_ABORTED|kt.NAVIGATION_DUPLICATED)&&!z.delta&&z.type===Jr.pop&&a.go(-1,!1)}).catch(Fi),Promise.reject()):(z.delta&&a.go(-z.delta,!1),I(_,re,Le))).then(_=>{_=_||E(re,Le,!1),_&&(z.delta&&!hn(_,kt.NAVIGATION_CANCELLED)?a.go(-z.delta,!1):z.type===Jr.pop&&hn(_,kt.NAVIGATION_ABORTED|kt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(re,Le,_)}).catch(Fi)}))}let q=xi(),D=xi(),L;function I(Q,be,z){W(Q);const re=D.list();return re.length?re.forEach(ue=>ue(Q,be,z)):console.error(Q),Promise.reject(Q)}function U(){return L&&r.value!==Hn?Promise.resolve():new Promise((Q,be)=>{q.add([Q,be])})}function W(Q){return L||(L=!Q,V(),q.list().forEach(([be,z])=>Q?z(Q):be()),q.reset()),Q}function K(Q,be,z,re){const{scrollBehavior:ue}=e;if(!$a||!ue)return Promise.resolve();const Le=!z&&A_(Iu(Q.fullPath,0))||(re||!z)&&history.state&&history.state.scroll||null;return Rt().then(()=>ue(Q,be,Le)).then(_=>_&&C_(_)).catch(_=>I(_,Q,be))}const X=Q=>a.go(Q);let le;const ee=new Set,ce={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:v,resolve:R,options:e,push:b,replace:S,go:X,back:()=>X(-1),forward:()=>X(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:D.add,isReady:U,install(Q){Q.component("RouterLink",nw),Q.component("RouterView",ow),Q.config.globalProperties.$router=ce,Object.defineProperty(Q.config.globalProperties,"$route",{enumerable:!0,get:()=>an(r)}),$a&&!le&&r.value===Hn&&(le=!0,b(a.location).catch(re=>{}));const be={};for(const re in Hn)Object.defineProperty(be,re,{get:()=>r.value[re],enumerable:!0});Q.provide(jo,ce),Q.provide(sd,uc(be)),Q.provide(Qr,r);const z=Q.unmount;ee.add(Q),Q.unmount=function(){ee.delete(Q),ee.size<1&&(c=Hn,M&&M(),M=null,r.value=Hn,le=!1,L=!1),z()}}};function De(Q){return Q.reduce((be,z)=>be.then(()=>x(z)),Promise.resolve())}return ce}function Em(){return $s(jo)}function cw(e){return $s(sd)}const Vo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=cw(),s=Em(),n=J({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=J(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=J(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});us(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},dw={setup(){const e=f([]),t=f([]),s=f({}),n=50;function a(p){var v,k,R,y,g;const h=p.payload||p,m=h.type||p.type;if(m==="tool_start"){const b=((v=h.metadata)==null?void 0:v.call_id)||null,S={callId:b,id:b||`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:((k=h.metadata)==null?void 0:k.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(m==="tool_end"){const b=((R=h.metadata)==null?void 0:R.call_id)||null;let S=-1;if(b&&(S=e.value.findIndex(w=>w.callId===b&&w.status==="running")),S<0&&!b)for(let w=e.value.length-1;w>=0;w--){const A=e.value[w];if(A.tool===h.action&&A.status==="running"){S=w;break}}if(S>=0){const w=e.value[S];w.status=(y=h.metadata)!=null&&y.error?"error":"success",w.elapsed=((g=h.metadata)==null?void 0:g.elapsed_ms)||Date.now()-w.startTime,w.result=h.detail||"",w.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(w);A>=0&&e.value.splice(A,1),t.value.unshift(w),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const b=h.call_id||h.tool_name||"unknown";if(h.finished){const S={...s.value};delete S[b],s.value=S}else{const w=((s.value[b]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[b]:w.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}Ge(r),hs(r),ns(c),gt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function nd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Ta(e){const t=nd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function uw(e){const t=nd(e);return t?t.toLocaleTimeString():"—"}function Am(e){const t=nd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function pw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ci(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function ad(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Rm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function ju(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function id(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Im(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Om=Symbol("agent-detail-cancelled"),fw=15e3;function hw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&a(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Om),i==null||i.abort()}}}function Lm({state:e,requestDetail:t,timeoutMs:s=fw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const k=hw(R=>t(p,{signal:R}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=k.cancel,v.promise=(async()=>{let R=null,y=null;try{R=await k.promise}catch(g){y=g}R!==Om&&(l!==v||e.detailId!==p||(l=null,!y&&(R===null||typeof R!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=R,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function mw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const vw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(!0),i=f("all");let l=!1;const o=J(()=>e.value.filter(I=>I.status==="running").length),r=J(()=>e.value.filter(I=>I.status==="completed").length),c=J(()=>e.value.filter(I=>["failed","timeout","killed"].includes(I.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(I=>["failed","timeout","killed"].includes(I.status)):e.value.filter(I=>I.status===i.value));function p(I){const U=Number(I.max_iterations)||0;return U<=0?0:Math.min(100,Math.round(I.iteration_count/U*100))}function h(I){return(Number(I.max_iterations)||0)>0}function m(I,U){return I?I==="N/A"?"N/A":U==="current_inheritance"?`inherit (currently ${I})`:I:"unknown"}function v(I){return m(I.display_model,I.display_model_source||I.display_source)}function k(I){return m(I.display_reasoning_effort,I.display_reasoning_effort_source||I.display_source)}function R(I){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[I]||""}const y=f(null),g=f(null),b=f(!1),S=f(null),w=f(""),C=Lm({state:{get detail(){return y.value},set detail(I){y.value=I},get detailId(){return g.value},set detailId(I){g.value=I},get detailLoading(){return b.value},set detailLoading(I){b.value=I},get detailError(){return S.value},set detailError(I){S.value=I}},requestDetail:(I,{signal:U})=>G.get(`/api/agents/${encodeURIComponent(I)}`,{signal:U})});async function x(I){w.value="",await C.open(I.id)}function N(){C.close(),w.value=""}async function B(){await C.refresh()}async function E(I,U){try{await navigator.clipboard.writeText(U||""),w.value=I,setTimeout(()=>{w.value===I&&(w.value="")},1500)}catch{_e.error("Copy failed")}}async function M(I=!1){I=I===!0,I||(t.value=!0);try{const U=await G.get("/api/agents");e.value=Array.isArray(U)?U:[],s.value=null}catch(U){I||(s.value=U.message)}I||(t.value=!1)}async function V(I){const U=e.value.find(K=>K.id===I);if(await Ut({title:"Kill agent",message:`Kill agent "${(U==null?void 0:U.label)||I}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=I;try{await G.del(`/api/agents/${encodeURIComponent(I)}`),_e.success("Agent killed"),await M()}catch(K){_e.error(K.message||"Failed to kill agent")}n.value=null}}const q=mw({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:B});function D(){q.start()}function L(){q.stop()}return us(a,()=>q.sync()),Ge(()=>{l=!0,M(),D()}),hs(()=>{l=!0,M(!0),D()}),ns(()=>{l=!1,L()}),gt(()=>{l=!1,L(),C.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Ta,formatDuration:ci,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:k,displaySourceLabel:R,detail:y,detailId:g,detailLoading:b,detailError:S,copied:w,openDetail:x,closeDetail:N,copyText:E,fetchAgents:M,killAgent:V,startAutoRefresh:D,stopAutoRefresh:L}}},gw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const k=Lm({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:I})=>G.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:I})});async function R(L){h.value="",await k.open(L.id)}function y(){k.close(),h.value=""}async function g(L,I){try{await navigator.clipboard.writeText(I||""),h.value=L,setTimeout(()=>{h.value===L&&(h.value="")},1500)}catch{_e.error("Copy failed")}}const b=J(()=>e.value.reduce((L,I)=>L+(I.iteration_count||0),0)),S=J(()=>e.value.filter(L=>L.status==="running").length);function w(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function A(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function C(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function x(L=!1){L=L===!0,L||(t.value=!0);try{const I=await G.get("/api/loops");e.value=Array.isArray(I)?I:[],s.value=null}catch(I){L||(s.value=I.message)}L||(t.value=!1)}async function N(){l.value=null;const L=a.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const I={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(I.stop_condition=L.stop_condition.trim()),i.value=!0;try{const U=await G.post("/api/loops",I);_e.success(`Loop started: ${U.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await x()}catch(U){l.value=U.message}i.value=!1}async function B(L){if(await Ut({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=L;try{await G.del(`/api/loops/${encodeURIComponent(L)}`),_e.success("Loop stopped"),await x()}catch(U){_e.error(U.message||"Failed to stop loop")}o.value=null}}async function E(L){r.value=L;try{await G.post(`/api/loops/${encodeURIComponent(L)}/restart`),_e.success("Loop restarted"),await x()}catch(I){_e.error(I.message||"Failed to restart loop")}r.value=null}function M(L){m&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(x(!0),d.value&&k.refresh())}let V=null;function q(){V!==null&&clearInterval(V),V=null}function D(){q(),m&&(V=setInterval(()=>{x(!0),d.value&&k.refresh()},5e3))}return Ge(()=>{m=!0,x(),Ye.subscribe("events",M),D()}),hs(()=>{m=!0,x(!0),D()}),ns(()=>{m=!1,q()}),gt(()=>{m=!1,Ye.unsubscribe("events",M),q(),k.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:S,statusDotClass:w,statusBadge:A,modeBadge:C,formatAge:Am,formatDuration:ci,formatTs:Ta,formatTokens:Im,openDetail:R,closeDetail:y,copyText:g,fetchLoops:x,doCreate:N,doStop:B,doRestart:E}}},bw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!0);let a=null;const i=f(null),l=J(()=>e.value.filter(y=>y.status==="running").length),o=J(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}us(n,y=>{y?u():p()});async function h(y){if(await Ut({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await G.del(`/api/processes/${y}`),_e.success(`Process ${y} killed`),await d()}catch(b){_e.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function k(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function R(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return Ge(k),hs(k),ns(R),gt(R),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:ci,fetchProcesses:d,doKill:h}}},yw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Vu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function xw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function _w(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function ww(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=yw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const k of new Set([p,h])){const R=new Date(u+k*6e4);xw(R,c)===d&&(m.some(y=>y.getTime()===R.getTime())||m.push(R))}if(m.sort((k,R)=>k.getTime()-R.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(k=>({instant:k,offset:_w(k),iso:k.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const kw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),o=f(null),r=J(()=>ww(a.value.run_at));us(()=>a.value.run_at,()=>{o.value=null});const c=J(()=>{var re;const z=r.value;return z.state==="ok"?z.instant:z.state==="ambiguous"&&o.value!==null&&((re=z.options[o.value])==null?void 0:re.instant)||null}),d=J(()=>{const z=c.value;return z?`${z.toLocaleString()} local — ${z.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),k=f(null),R=f(null),y=f(null),g=f(null),b=f([]),S=f(!1),w=f("");let A=0;const C=J(()=>e.value.filter(z=>z.cron&&!z.one_time).length),x=J(()=>e.value.filter(z=>z.one_time).length),N=J(()=>e.value.filter(z=>z.trigger).length),B=J(()=>e.value.filter(z=>z.paused).length),E=J(()=>e.value.filter(z=>z.consecutive_failures>0).length);function M(z){if(!z)return"-";const re=Date.now(),Le=(new Date(z).getTime()-re)/1e3;if(Le<0)return"overdue";if(Le<60)return"in < 1 min";if(Le<3600)return`in ${Math.floor(Le/60)} min`;if(Le<86400){const P=Math.floor(Le/3600),H=Math.floor(Le%3600/60);return H>0?`in ${P}h ${H}m`:`in ${P}h`}const _=Math.floor(Le/86400);return`in ${_} day${_!==1?"s":""}`}function V(z){return z==null?"-":z<1e3?`${z}ms`:z<6e4?`${(z/1e3).toFixed(1)}s`:ci(z/1e3)}function q(z=a.value.cron){a.value.cron=z,Vu(a.value,"cron"),u.value=null}function D(z=a.value.run_at){a.value.run_at=z,Vu(a.value,"run_at"),u.value=null}async function L(){const z=a.value.cron.trim();if(z){p.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:z})}catch(re){u.value={valid:!1,error:re.message}}p.value=!1}}async function I(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(z){s.value=z.message}t.value=!1}async function U(z){if(g.value===z){g.value=null,b.value=[];return}g.value=z,S.value=!0,b.value=[];const re=++A;try{const ue=await G.get(`/api/schedules/${encodeURIComponent(z)}/history?limit=10`);if(re!==A||g.value!==z)return;b.value=ue,w.value=""}catch(ue){if(re!==A||g.value!==z)return;b.value=[],w.value=ue.message||"Failed to load execution history"}re===A&&(S.value=!1)}async function W(){l.value=null;const z=a.value;if(!z.description.trim()){l.value="Description is required";return}if(!z.channel_id.trim()){l.value="Channel ID is required";return}if(!z.cron.trim()&&!z.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(z.cron.trim()&&z.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const re={description:z.description.trim(),action:z.action,channel_id:z.channel_id.trim()};if(z.cron.trim()&&(re.cron=z.cron.trim()),z.run_at.trim()){const ue=r.value;if(ue.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(ue.state==="invalid"){l.value="One-time run time is not a valid date";return}const Le=c.value;if(ue.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Le){l.value="One-time run time could not be resolved";return}re.run_at=Le.toISOString()}if(z.action==="reminder"&&z.message.trim()&&(re.message=z.message.trim()),z.action==="check"&&(z.tool_name.trim()&&(re.tool_name=z.tool_name.trim()),z.report_format&&(re.report_format=z.report_format),z.tool_input_str.trim()))try{re.tool_input=JSON.parse(z.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",re),_e.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await I()}catch(ue){l.value=ue.message}i.value=!1}async function K(z){m.value=z;try{const re=await G.post(`/api/schedules/${encodeURIComponent(z)}/run`);if(re.status==="failure")_e.error(`Execution failed: ${re.error||"unknown error"}`);else{const ue=re.warning?`Executed (${re.warning})`:"Executed successfully";_e.success(ue)}await I()}catch(re){_e.error(re.message||"Failed to trigger")}m.value=null}async function X(z){k.value=z.id;const re=!z.paused;try{await G.put(`/api/schedules/${encodeURIComponent(z.id)}`,{paused:re}),_e.success(re?"Schedule paused":"Schedule resumed"),await I()}catch(ue){_e.error(ue.message||"Failed to update schedule")}k.value=null}const le=new Map;function ee(z,re){const ue=le.get(z.id);ue&&clearTimeout(ue.timer);const Le={run:()=>ce(z,re),timer:null};Le.timer=setTimeout(()=>{le.delete(z.id),Le.run()},500),le.set(z.id,Le)}async function ce(z,re){y.value=z.id;try{await G.put(`/api/schedules/${encodeURIComponent(z.id)}`,{report_format:re}),_e.success(re?"Structured report enabled":"Plain-text report enabled")}catch(ue){_e.error(`Update failed: ${ue.message}`)}finally{await I(),y.value=null}}function De(){for(const[z,re]of[...le])clearTimeout(re.timer),le.delete(z),re.run()}async function Q(z){R.value=z;try{await G.post(`/api/schedules/${encodeURIComponent(z)}/reset-failures`),_e.success("Failure counters reset"),await I()}catch(re){_e.error(re.message||"Failed to reset")}R.value=null}async function be(z){const re=e.value.find(Le=>Le.id===z);if(await Ut({title:"Delete schedule",message:`Delete "${(re==null?void 0:re.description)||z}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=z;try{await G.del(`/api/schedules/${encodeURIComponent(z)}`),_e.success("Schedule deleted"),await I()}catch(Le){_e.error(Le.message||"Failed to delete schedule")}v.value=null}}return Ge(()=>{I()}),gt(De),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:k,resettingId:R,reportUpdatingId:y,flushReportFormatTimers:De,expandedId:g,history:b,historyLoading:S,historyError:w,cronCount:C,oneTimeCount:x,webhookCount:N,pausedCount:B,failingCount:E,formatTs:Ta,formatAge:Am,formatFuture:M,formatMs:V,formatDuration:ci,onCronInput:q,onRunAtInput:D,validateCron:L,toggleExpand:U,fetchSchedules:I,doCreate:W,doRunNow:K,doTogglePause:X,doUpdateReportFormat:ee,doResetFailures:Q,doDelete:be}}},Nm=[{id:"live",label:"Live",component:dw},{id:"agents",label:"Agents",component:vw},{id:"loops",label:"Loops",component:gw},{id:"processes",label:"Processes",component:bw},{id:"schedules",label:"Schedules",component:kw}],Sw={components:{TabbedPage:Vo},setup(){return{tabs:Nm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Tw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await G.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const k=v.toString(),R=await G.get(`/api/audit${k?"?"+k:""}`);if(m!==r)return;e.value=Array.isArray(R)?R:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Ta,formatDetail:i,truncateBlock:Rm,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},qu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Cw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Ew={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=qu,k=Cw,R=f([]),y=f(!1),g=f(""),b=f("flat"),S=f(new Set),w=f(""),A=f(""),C=f(""),x=f(null),N=f(!1);function B(){try{const ne=localStorage.getItem("odin-session-presets");ne&&(R.value=JSON.parse(ne))}catch{}}function E(){try{localStorage.setItem("odin-session-presets",JSON.stringify(R.value))}catch{}}const M=J(()=>p.value.trim()!==""||u.value!=="all"),V=J(()=>{let ne=[...e.value];const ye=qu.find(He=>He.id===u.value),Ie=ye?ye.filters:{};if(Ie.source&&(ne=ne.filter(He=>He.source===Ie.source)),Ie.minMessages&&(ne=ne.filter(He=>He.message_count>=Ie.minMessages)),Ie.hasCompaction&&(ne=ne.filter(He=>He.has_summary)),Ie.maxAge!=null){const He=Date.now()/1e3;ne=ne.filter(xt=>xt.last_active&&He-xt.last_active<=Ie.maxAge)}if(p.value.trim()){const He=p.value.toLowerCase().trim();ne=ne.filter(xt=>(xt.channel_id||"").toLowerCase().includes(He)||(xt.last_user_id||"").toLowerCase().includes(He)||(xt.source||"").toLowerCase().includes(He))}const Ze=h.value,ft=m.value?1:-1;return ne.sort((He,xt)=>{const ms=He[Ze]||0,Tt=xt[Ze]||0;return(ms-Tt)*ft}),ne}),q=J(()=>{if(!a.value||!a.value.messages)return[];const ne=a.value.messages;if(ne.length===0)return[];const ye=[];let Ie=[];for(const Ze of ne)Ze.role==="user"&&Ie.length>0&&(ye.push(Ie),Ie=[]),Ie.push(Ze);return Ie.length>0&&ye.push(Ie),ye}),D=J(()=>V.value.length>0&&c.value.size===V.value.length);function L(ne){const ye=ne.find(Ie=>Ie.role==="user");if(ye&&ye.content){const Ie=ye.content.slice(0,120);return Ie.length<ye.content.length?Ie+"...":Ie}return"(no user message)"}function I(ne){const ye=new Set(S.value);ye.has(ne)?ye.delete(ne):ye.add(ne),S.value=ye}function U(ne){u.value=ne}function W(ne){u.value=ne.id,ne.filters.searchQuery!=null&&(p.value=ne.filters.searchQuery),ne.filters.sortBy&&(h.value=ne.filters.sortBy)}function K(){if(!g.value.trim())return;const ne={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};R.value=[...R.value,ne],E(),y.value=!1,g.value=""}function X(ne){R.value=R.value.filter(ye=>ye.id!==ne),E(),u.value===ne&&(u.value="all")}function le(){u.value="all",p.value="",h.value="last_active",m.value=!1}function ee(ne){if(!ne)return"—";const ye=Date.now()/1e3-ne;if(ye<60)return"just now";if(ye<3600){const Ze=Math.floor(ye/60);return`${Ze} minute${Ze!==1?"s":""} ago`}if(ye<86400){const Ze=Math.floor(ye/3600);return`${Ze} hour${Ze!==1?"s":""} ago`}const Ie=Math.floor(ye/86400);return`${Ie} day${Ie!==1?"s":""} ago`}function ce(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function De(ne){if(!ne)return"";try{return new Date(ne*1e3).toLocaleString()}catch{return""}}function Q(ne){return ne==="user"?"bg-gray-900/50 border border-gray-800":ne==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function be(ne){return ne==="user"?"sess-msg-user":ne==="assistant"?"sess-msg-assistant":"sess-msg-system"}function z(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":"badge-warning"}function re(ne){return ne==="user"?"sess-dot-user":ne==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ue(ne){return ne==="user"?"text-cyan-400":ne==="assistant"?"text-indigo-400":"text-gray-500"}function Le(ne){return ne?ne.length>2e3?ne.slice(0,2e3)+`
... (truncated)`:ne:""}async function _(){const ne=w.value.trim();if(ne){N.value=!0;try{let ye=`/api/sessions/search?q=${encodeURIComponent(ne)}&limit=50`;A.value.trim()&&(ye+=`&channel_id=${encodeURIComponent(A.value.trim())}`),C.value.trim()&&(ye+=`&user_id=${encodeURIComponent(C.value.trim())}`);const Ie=await G.get(ye);x.value=Ie.results||[]}catch{x.value=[]}N.value=!1}}function P(){w.value="",A.value="",C.value="",x.value=null}function H(ne){return ne?ne.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ie(ne){return ne==="user"?"fts-result-user":ne==="assistant"?"fts-result-assistant":ne==="summary"?"fts-result-summary":ne==="fts"?"fts-result-fts":ne==="channel"?"fts-result-channel":"fts-result-default"}function se(ne){return ne==="user"?"badge-info":ne==="assistant"?"badge-success":ne==="summary"?"badge-warning":ne==="fts"?"badge-success":"badge-info"}let ae=0;async function pe(){const ne=++ae;t.value=!0,s.value=null;try{const ye=await G.get("/api/sessions");if(ne!==ae)return;e.value=ye}catch(ye){if(ne!==ae)return;s.value=ye.message}ne===ae&&(t.value=!1)}function fe(){s.value=null,pe()}async function de(ne){if(n.value===ne){n.value=null,a.value=null,S.value=new Set;return}n.value=ne,a.value=null,i.value=!0,S.value=new Set;const ye=++l;try{const Ie=await G.get(`/api/sessions/${encodeURIComponent(ne)}`);ye===l&&n.value===ne&&(a.value=Ie)}catch(Ie){ye===l&&n.value===ne&&(a.value={messages:[],summary:"",error:Ie.message||"Failed to load session"})}finally{ye===l&&(i.value=!1)}}function oe(ne){const ye=new Set(c.value);ye.has(ne)?ye.delete(ne):ye.add(ne),c.value=ye}function we(){D.value?c.value=new Set:c.value=new Set(V.value.map(ne=>ne.channel_id))}function ge(ne){o.value=ne}async function ke(){if(o.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await pe()}catch(ne){s.value=ne.message||"Failed to clear session"}r.value=!1,o.value=null}}function Re(){d.value=!0}async function F(){if(c.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await pe()}catch(ne){s.value=ne.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function me(ne,ye){const Ie=`/api/sessions/${encodeURIComponent(ne)}/export?format=${ye}`;try{const Ze=await G.getBlob(Ie),ft=URL.createObjectURL(Ze),He=document.createElement("a");He.href=ft,He.download=`session-${ne}.${ye==="text"?"txt":"json"}`,He.click(),URL.revokeObjectURL(ft)}catch(Ze){s.value=Ze.message||"Failed to export session"}}let Se=null;function Oe(ne){ne.payload&&ne.payload.channel_id&&(clearTimeout(Se),Se=setTimeout(()=>{if(pe(),n.value&&ne.payload.channel_id===n.value){const ye=n.value,Ie=l;G.get(`/api/sessions/${encodeURIComponent(ye)}`).then(Ze=>{Ie!==l||n.value!==ye||(a.value=Ze)}).catch(()=>{})}},2e3))}let Pe=!1,dt=null;function ot(){Pe||(Pe=!0,pe(),Ye.subscribe("events",Oe),dt=Ye.onReconnected(()=>pe()))}Ge(()=>{B(),ot()}),hs(()=>{ot()});function Ft(){Pe&&(Pe=!1,Ye.unsubscribe("events",Oe),dt&&(dt(),dt=null),clearTimeout(Se))}return ns(Ft),gt(Ft),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:D,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:k,filteredSessions:V,hasActiveFilters:M,customPresets:R,showSavePreset:y,newPresetName:g,threadView:b,threads:q,collapsedThreads:S,ftsQuery:w,ftsChannelId:A,ftsUserId:C,ftsResults:x,ftsSearching:N,formatAge:ee,formatTimestamp:ce,formatFullTimestamp:De,messageClass:Q,threadMsgClass:be,roleBadge:z,roleDotClass:re,roleLabelClass:ue,truncateContent:Le,threadSummary:L,fetchSessions:pe,retry:fe,toggleSession:de,toggleSelect:oe,toggleSelectAll:we,confirmClear:ge,clearSession:ke,confirmBulkClear:Re,doBulkClear:F,exportSession:me,applyPreset:U,applyCustomPreset:W,saveCustomPreset:K,removeCustomPreset:X,resetFilters:le,toggleThread:I,runFtsSearch:_,clearFtsSearch:P,highlightSnippet:H,ftsResultClass:ie,ftsTypeBadge:se}}},Aw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Im}}},Rw={components:{ContextAssemblyPanel:Aw},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const C=new Date(A);return isNaN(C.getTime())?A:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function p(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function h(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function v(A){a.value===A?a.value=null:(a.value=A,c.value={})}function k(A,C){const x=A+"-"+C;c.value={...c.value,[x]:!c.value[x]}}function R(A,C){return!!c.value[A+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,S()}async function g(){try{const A=await G.get("/api/trajectories");e.value=A.files||[],r.value=A.count||0}catch{}}let b=0;async function S(){const A=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const C=await G.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(A!==b)return;let x=C.entries||[];d.value.tool_name&&(x=x.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(N=>N.is_error)),d.value.channel_id&&(x=x.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(N=>N.user_id===d.value.user_id)),t.value=x}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const x=C.toString(),N=await G.get(`/api/trajectories/search/query?${x}`);if(A!==b)return;t.value=N.results||[]}}catch(C){if(A!==b)return;n.value=C.message}A===b&&(s.value=!1)}async function w(){if(!l.value.trim())return;const A=++b;s.value=!0,n.value=null,c.value={};try{const C=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==b)return;i.value=C.entry||null,i.value||(n.value="No trace found for this message ID")}catch(C){if(A!==b)return;C.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=C.message}A===b&&(s.value=!1)}return Ge(async()=>{await g(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:Rm,toggleExpand:v,toggleIteration:k,isIterationExpanded:R,clearFilters:y,fetchFiles:g,fetchTraces:S,lookupMessage:w}}};function Iw(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function Ow(e){return e?`${e.approximate?"~":""}${id(e.total||0)}`:"0"}const Lw={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=J(()=>n.value.work||{}),h=J(()=>Math.max(1,...(n.value.activity_over_time||[]).map(w=>Number(w.count||0)))),m=J(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=w=>({height:`${Math.max(4,Math.round(Number(w||0)/h.value*100))}%`}),k=J(()=>s.value&&l.value-i.value>3e4);async function R(){const w=++d,A=a.value;try{const C=await G.get(`/api/usage?range=${encodeURIComponent(A)}`);if(w!==d||A!==a.value)return;n.value=C,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(C){w===d&&(t.value=C.message)}finally{w===d&&(e.value=!1)}}function y(w){a.value=w,e.value=!s.value,R()}function g(){e.value=!0,R()}function b(){c||(c=!0,R(),o=setInterval(R,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function S(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),hs(b),ns(S),gt(S),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:k,fmtNum:id,fmtDuration:Iw,tokenLabel:Ow,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},Dm=[{id:"audit",label:"Audit",component:Tw},{id:"sessions",label:"Sessions",component:Ew},{id:"traces",label:"Traces",component:Rw},{id:"usage",label:"Usage & Activity",component:Lw}],Nw={components:{TabbedPage:Vo},setup(){return{tabs:Dm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},ur=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Dw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,N){const B=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!B,r.value=B?!!x.global_enabled:null,!B){e.value=N.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const E=new Set(B.map(V=>V.name)),M=N.filter(V=>!E.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...B.map(V=>({...V,source:"builtin"})),...M]}async function m(x,N){if(d.value.has(x.name))return;const B=!!N.target.checked,E=new Set(d.value);E.add(x.name),d.value=E;try{const M=await G.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:B});h(M,e.value),s.value=null;try{const V=await G.get("/api/tools");h(M,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch(M){N.target.checked=!!x.enabled,s.value=M.message||`Failed to toggle ${x.name}`}finally{const M=new Set(d.value);M.delete(x.name),d.value=M}}const v=J(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),k=J(()=>e.value.filter(x=>x.source==="skill").length),R=J(()=>Object.values(a.value).reduce((x,N)=>x+N,0));function y(x){for(const N of ur)if(N.id!=="other"&&N.match(x))return N.id;return"other"}const g=J(()=>{let x=e.value;if(n.value){const N=n.value.toLowerCase();x=x.filter(B=>B.name.toLowerCase().includes(N)||(B.description||"").toLowerCase().includes(N))}return o.value&&(x=x.filter(N=>y(N.name)===o.value)),x}),b=J(()=>{const x=new Set;for(const N of e.value)x.add(y(N.name));return ur.filter(N=>x.has(N.id))}),S=J(()=>{const x=g.value,N={};for(const E of x){const M=y(E.name);N[M]||(N[M]=[]),N[M].push(E)}const B=[];for(const E of ur)N[E.id]&&N[E.id].length>0&&B.push({label:E.label,icon:E.icon,tools:N[E.id].sort((M,V)=>M.name.localeCompare(V.name))});return B});function w(x){i.value={...i.value,[x]:!i.value[x]}}async function A(){t.value=!0,s.value=null;try{const[x,N,B]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({})),G.get("/api/tools/builtins").catch(()=>null)]);h(B,x),a.value=N||{}}catch(x){s.value=x.message}t.value=!1}function C(){A()}return Ge(()=>{A()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:k,totalUsage:R,filteredTools:g,groupedTools:S,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:ad,toggleExpand:w,refresh:C}}};function Pw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Mw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Fw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),k=f(null),R=f(!1),y=J(()=>e.value.length),g=J(()=>e.value.reduce((ee,ce)=>ee+(ce.execution_count||0),0)),b=J(()=>e.value.reduce((ee,ce)=>ee+N(ce.code),0)),S=J(()=>{if(!l.value)return e.value;const ee=l.value.toLowerCase();return e.value.filter(ce=>ce.name.toLowerCase().includes(ee)||(ce.description||"").toLowerCase().includes(ee))}),w=J(()=>u.value?u.value.split(`
`).length:0),A=J(()=>{const ee=Math.max(w.value,1);return Array.from({length:ee},(ce,De)=>De+1).join(`
`)}),C=J(()=>{const ee=u.value.trim();return ee?ee.includes("SKILL_DEFINITION")?ee.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(ee){return Pw(ee)}function N(ee){return ee?ee.split(`
`).length:0}function B(ee){return Mw(ee)}function E(ee){n.value={...n.value,[ee]:!n.value[ee]}}async function M(ee){try{await navigator.clipboard.writeText(ee);const ce=e.value.find(De=>De.code===ee);ce&&(o.value=ce.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function V(ee){if(ee.key==="Tab"){ee.preventDefault();const ce=ee.target,De=ce.selectionStart,Q=ce.selectionEnd;u.value=u.value.substring(0,De)+"    "+u.value.substring(Q),Rt(()=>{ce.selectionStart=ce.selectionEnd=De+4})}}function q(ee){const ce=ee.target.previousElementSibling;ce&&(ce.scrollTop=ee.target.scrollTop)}async function D(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(ee){s.value=ee.message}t.value=!1}async function L(ee){i.value=ee,delete a.value[ee],a.value={...a.value};try{const ce=await G.post(`/api/skills/${encodeURIComponent(ee)}/test`);a.value={...a.value,[ee]:ce}}catch(ce){a.value={...a.value,[ee]:{result:ce.message,is_error:!0}}}i.value=null}function I(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function U(ee){r.value=!0,c.value="edit",d.value=ee.name,u.value=ee.code||"",p.value=null,h.value=null}function W(){r.value=!1,p.value=null,h.value=null}async function K(){p.value=null,h.value=null;const ee=d.value.trim(),ce=u.value.trim();if(!ee){p.value="Name is required";return}if(!ce){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:ee,code:ce}),h.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(ee)}`,{code:ce}),h.value="Skill updated successfully"),await D(),setTimeout(()=>{r.value=!1},800)}catch(De){p.value=De.message}m.value=!1}function X(ee){k.value=ee}async function le(){if(k.value){R.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(k.value)}`),await D()}catch(ee){_e.error(`Failed to delete skill: ${ee.message||"unknown error"}`)}R.value=!1,k.value=null}}return Ge(()=>{D()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:k,deleting:R,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:S,editLineCount:w,editorLineNums:A,editValidation:C,highlight:x,truncate:ad,formatTs:Ta,countLines:N,getLineNumbers:B,toggleCode:E,copyCode:M,handleEditorKey:V,syncScroll:q,fetchSkills:D,testSkill:L,showCreate:I,editSkill:U,cancelEdit:W,saveSkill:K,confirmDelete:X,doDelete:le}}};class Ps extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const $w=/^[A-Za-z_][A-Za-z0-9_]*$/;function Gu(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Ku(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Ps(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Ps(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Ps(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Ps(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function Bw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Uw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Ps("Server name is required.","name");if(a.length>128||!$w.test(a))throw new Ps("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Ps("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=Gu(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Ps("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Ps("An HTTP endpoint is required for this connection.","url");if(d&&!Bw(d))throw new Ps("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Ps("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=Gu(e.allowlistText));const r=Ku(e.headerRows,e.headersRemove,"Header"),c=Ku(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Hw(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function zw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function jw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Vw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function qw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Gw=1e4,Kw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function pr(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Ww(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Zw={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),n=f(""),a=f(new Set),i=f(new Set),l=f({}),o=f({}),r=f({}),c=f(new Set),d=f(!1),u=f("add"),p=f(""),h=f(null),m=f(pr()),v=f(""),k=f(!1);let R=null,y=0,g=!1,b=!1;const S=Vw,w=J(()=>{var F;return((F=e.value)==null?void 0:F.servers)||[]}),A=J(()=>{var F;return!!((F=e.value)!=null&&F.enabled)}),C=J(()=>{var F,me,Se,Oe;return{serverCount:((F=e.value)==null?void 0:F.server_count)||0,enabledCount:((me=e.value)==null?void 0:me.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),x=J(()=>{var F;return((F=h.value)==null?void 0:F.header_keys)||[]}),N=J(()=>{var F;return((F=h.value)==null?void 0:F.env_keys)||[]}),B=J(()=>{var F;return u.value==="edit"&&((F=h.value)==null?void 0:F.transport)==="http"}),E=J(()=>u.value==="add"||!B.value),M=J(()=>B.value?"Replace endpoint URL":"Endpoint URL"),V=J(()=>B.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function q(){D(),R=window.setInterval(()=>L({quiet:!0}),Gw)}function D(){R&&window.clearInterval(R),R=null}async function L({quiet:F=!1}={}){const me=++y;F||(t.value=!0);try{const Se=await G.get("/api/mcp/status");if(me!==y||!g)return;e.value=Se,n.value="";const Oe=new Set((Se.servers||[]).map(Pe=>Pe.name));i.value=new Set([...i.value].filter(Pe=>Oe.has(Pe)))}catch(Se){me===y&&g&&(n.value=Se.message||"Failed to load MCP status")}finally{me===y&&(t.value=!1)}}function I(F){return s.value||a.value.has(F)}function U(F,me){const Se=new Set(a.value);me?Se.add(F):Se.delete(F),a.value=Se}function W(F){return zw(F.state)}function K(F){if(W(F)==="disabled"){if(!F.enabled)return"Disabled — server switch off";if(!A.value)return"Disabled — global MCP is off"}return Kw[W(F)]}function X(F){return F.transport==="http"?"Streamable HTTP":"stdio"}function le(F){return F.negotiated_version?`${F.era?`${String(F.era).charAt(0).toUpperCase()}${String(F.era).slice(1)}`:"Protocol"} · ${F.negotiated_version}`:"Not negotiated"}function ee(F){return F.discovered_count?`${F.published_count||0} published · ${F.excluded_count||0} excluded`:"No tools discovered"}const ce=f(new Set);async function De(F,me){if(ce.value.has(F.name))return;const Se=!!me.target.checked,Oe=new Set(ce.value);Oe.add(F.name),ce.value=Oe;try{const Pe=await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/enabled`,{enabled:Se});Pe&&Array.isArray(Pe.servers)?e.value=Pe:await L({quiet:!0})}catch(Pe){me.target.checked=!!F.enabled,_e.error(Pe.message||`Failed to toggle ${F.name}`)}finally{const Pe=new Set(ce.value);Pe.delete(F.name),ce.value=Pe}}async function Q(F){if(F!==A.value&&!(!F&&!await Ut({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await G.post("/api/mcp/enabled",{enabled:F}),_e.success(F?"MCP enabled":"MCP disabled"),await L({quiet:!0})}catch(me){_e.error(me.message||"Failed to update MCP state"),await L({quiet:!0})}finally{s.value=!1}}}async function be(F){U(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/reconnect`,{}),_e.success(`Reconnected ${F.name}`)}catch(me){_e.error(me.message||`Failed to reconnect ${F.name}`)}finally{U(F.name,!1),await L({quiet:!0})}}async function z(F){U(F.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(F.name)}/refresh-tools`,{}),_e.success(`Refreshed tools from ${F.name}`),await Le(F.name,!0)}catch(me){_e.error(me.message||`Failed to refresh ${F.name}`)}finally{U(F.name,!1),await L({quiet:!0})}}async function re(F){if(await Ut({title:`Remove ${F.name}`,message:`Remove this saved MCP server? Its ${F.published_count||0} published tool${F.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){U(F.name,!0);try{await G.del(`/api/mcp/servers/${encodeURIComponent(F.name)}`),_e.success(`Removed ${F.name}`),delete o.value[F.name]}catch(Se){_e.error(Se.message||`Failed to remove ${F.name}`)}finally{U(F.name,!1),await L({quiet:!0})}}}async function ue(F){const me=new Set(i.value);if(me.has(F.name)){me.delete(F.name),i.value=me;return}me.add(F.name),i.value=me,Object.hasOwn(o.value,F.name)||await Le(F.name)}async function Le(F,me=!1){if(!me&&Object.hasOwn(o.value,F))return;const Se=new Set(c.value);Se.add(F),c.value=Se,r.value={...r.value,[F]:""};try{const Oe=await G.get(`/api/mcp/servers/${encodeURIComponent(F)}/tools`);o.value={...o.value,[F]:Oe.tools||[]}}catch(Oe){r.value={...r.value,[F]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(F),c.value=Oe}}function _(F){return(o.value[F]||[]).filter(me=>jw(me,l.value[F]))}function P(F,me){l.value={...l.value,[F]:me}}function H(){u.value="add",p.value="",h.value=null,m.value=pr(),v.value="",d.value=!0}function ie(F){u.value="edit",p.value=F.name,h.value=F,m.value={...pr(),name:F.name,enabled:!!F.enabled,transport:F.transport||"stdio"},v.value="",d.value=!0}function se(){k.value||(d.value=!1)}function ae(F){d.value&&qw(F)}function pe(F){const me=F==="headers"?"headerRows":"envRows";m.value[me].push({key:"",value:""})}function fe(F,me){const Se=F==="headers"?"headerRows":"envRows";m.value[Se].splice(me,1)}function de(F,me){const Se=F==="headers"?"headersRemove":"envRemove",Oe=m.value[Se];m.value[Se]=Oe.includes(me)?Oe.filter(Pe=>Pe!==me):[...Oe,me]}async function oe(){var me,Se;v.value="";let F;try{F=Uw(m.value,{mode:u.value,originalTransport:((me=h.value)==null?void 0:me.transport)||""})}catch(Oe){v.value=Oe instanceof Ps?Oe.message:"Invalid MCP server configuration",await Rt(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Hw(F,h.value)&&!await Ut({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){k.value=!0;try{u.value==="add"?await G.post("/api/mcp/servers",F):await G.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,F),_e.success(u.value==="add"?`Saved ${F.name}`:`Updated ${p.value}`),d.value=!1,await L({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{k.value=!1}}}let we=null;function ge(F){`${(F==null?void 0:F.event)||""} ${(F==null?void 0:F.type)||""} ${(F==null?void 0:F.tool)||""} ${(F==null?void 0:F.message)||""}`.toLowerCase().includes("mcp")&&(we&&window.clearTimeout(we),we=window.setTimeout(()=>L({quiet:!0}),200))}function ke(){g||(g=!0,b||(Ye.subscribe("events",ge),b=!0),L(),q())}function Re(){g=!1,D(),we&&window.clearTimeout(we),we=null,b&&(Ye.unsubscribe("events",ge),b=!1)}return Ge(ke),hs(ke),ns(Re),gt(Re),{status:e,loading:t,mutating:s,pageError:n,servers:w,masterEnabled:A,aggregate:C,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:h,form:m,formError:v,saving:k,editorGroups:S,configuredHeaderKeys:x,configuredEnvKeys:N,savedHttpEndpoint:B,endpointRequired:E,endpointFieldLabel:M,endpointPlaceholder:V,refreshAll:L,busy:I,serverState:W,stateLabel:K,transportLabel:X,protocolLabel:le,toolSummary:ee,formatAge:Ww,setMasterEnabled:Q,togglePending:ce,toggleServerEnabled:De,reconnect:be,refreshTools:z,removeServer:re,toggleTools:ue,filteredTools:_,setToolQuery:P,openAdd:H,openEdit:ie,closeEditor:se,jumpToEditorGroup:ae,addSecretRow:pe,removeSecretRow:fe,toggleSecretRemoval:de,saveServer:oe}}};function Jw(e,t){if(!e||!t)return ju(e);const s=ju(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Yw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let k=null;const R=f(null),y=f(!1),g=f({}),b=f({}),S=f({}),w=f({}),A=new Map,C=f(null),x=J(()=>e.value.reduce((K,X)=>K+(X.chunks||0),0)),N=J(()=>new Set(e.value.map(X=>X.uploader).filter(Boolean)).size);function B(K,X){const le=b.value[X];if(!le||le.length===0)return 0;const ee=Math.max(...le.map(ce=>ce.char_count||0));return ee===0?0:Math.round(K.char_count/ee*100)}async function E(){t.value=!0,s.value=null;try{const K=await G.get("/api/knowledge");e.value=Array.isArray(K)?K:[]}catch(K){s.value=K.message}t.value=!1}async function M(K){if(g.value[K]){g.value[K]=!1,C.value=null;return}if(g.value[K]=!0,Object.prototype.hasOwnProperty.call(b.value,K))return;if(A.has(K))return A.get(K);const X={...w.value,[K]:!0};w.value=X;const le={...S.value};delete le[K],S.value=le;const ee=G.get(`/api/knowledge/${encodeURIComponent(K)}/chunks`).then(ce=>{b.value={...b.value,[K]:Array.isArray(ce)?ce:[]}}).catch(ce=>{S.value={...S.value,[K]:ce.message||"load failed"}}).finally(()=>{if(A.get(K)!==ee)return;A.delete(K);const ce={...w.value};delete ce[K],w.value=ce});return A.set(K,ee),ee}let V=0;async function q(){const K=n.value.trim();if(!K)return;const X=++V;i.value=!0,o.value=null,l.value=K;try{const le=await G.get(`/api/knowledge/search?q=${encodeURIComponent(K)}`);if(X!==V)return;a.value=Array.isArray(le)?le:[]}catch(le){if(X!==V)return;a.value=[],o.value=le.message||"Search failed"}X===V&&(i.value=!1)}function D(){V+=1,i.value=!1,a.value=null,n.value="",o.value=null}async function L(){u.value=null,p.value=null;const K=c.value.trim(),X=d.value.trim();if(!K){u.value="Source name is required";return}if(!X){u.value="Content is required";return}h.value=!0;try{const le=await G.post("/api/knowledge",{source:K,content:X});p.value=`Ingested ${le.chunks||0} chunks from "${K}"`,c.value="",d.value="",b.value={},await E(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(le){u.value=le.message}h.value=!1}async function I(K){m.value=K,v.value=null,k&&(clearTimeout(k),k=null);try{const X=await G.post(`/api/knowledge/${encodeURIComponent(K)}/reingest`);v.value={source:K,error:!1,message:`Re-ingested ${X.chunks||0} chunks`},delete b.value[K],await E(),k=setTimeout(()=>{v.value=null,k=null},3e3)}catch(X){v.value={source:K,error:!0,message:X.message}}m.value=null}function U(K){R.value=K}async function W(){if(R.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete b.value[R.value],await E()}catch(K){_e.error(`Failed to delete source: ${K.message||"unknown error"}`)}y.value=!1,R.value=null}}return Ge(()=>{E()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:R,deleting:y,expanded:g,sourceChunks:b,chunkErrors:S,loadingChunks:w,selectedChunk:C,totalChunks:x,uploaderCount:N,truncate:ad,formatTs:Ta,highlightTerms:Jw,chunkBarWidth:B,fetchSources:E,toggleSource:M,doSearch:q,clearSearch:D,doIngest:L,doReingest:I,confirmDelete:U,doDelete:W}}},Qw={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),n=f(null),a=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),k=f(null),R=f(new Set),y=f(null),g=f(!1),b=f(!1),S=J(()=>e.value.reduce((X,le)=>X+le.count,0)),w=J(()=>R.value.size);function A(X){const le=t.value[X];if(!le)return[];if(!l.value.trim())return le;const ee=l.value.trim().toLowerCase();return le.filter(ce=>ce.key.toLowerCase().includes(ee)||ce.value&&ce.value.toLowerCase().includes(ee))}function C(X,le){return R.value.has(X+"/"+le)}function x(X,le){const ee=X+"/"+le,ce=new Set(R.value);ce.has(ee)?ce.delete(ee):ce.add(ee),R.value=ce}function N(X){const le=t.value[X];return!le||le.length===0?!1:le.every(ee=>R.value.has(X+"/"+ee.key))}function B(X,le){const ee=t.value[X];if(!ee)return;const ce=new Set(R.value);for(const De of ee){const Q=X+"/"+De.key;le?ce.add(Q):ce.delete(Q)}R.value=ce}async function E(){s.value=!0,n.value=null;try{const X=await G.get("/api/memory");e.value=Object.entries(X).map(([le,ee])=>({name:le,keys:ee.keys||[],count:ee.count||0}))}catch(X){n.value=X.message}s.value=!1}async function M(X){if(a.value[X]){a.value[X]=!1;return}a.value[X]=!0;const le=e.value.find(ce=>ce.name===X);if(!le||t.value[X]||i.value===X)return;i.value=X;let ee;try{const De=(await G.get(`/api/memory/${encodeURIComponent(X)}`)).entries||{};ee=le.keys.map(Q=>Object.prototype.hasOwnProperty.call(De,Q)?{key:Q,value:De[Q]||"",failed:!1}:{key:Q,value:"",failed:!0,error:"Not found in scope"})}catch(ce){ee=le.keys.map(De=>({key:De,value:"",failed:!0,error:ce.message||"Failed to load"}))}t.value[X]=ee,i.value=null}function V(X,le,ee){p.value=X+"/"+le,h.value=ee}async function q(X,le){m.value=!0,v.value=null;try{await G.put(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(le)}`,{value:h.value});const ee=t.value[X];if(ee){const ce=ee.find(De=>De.key===le);ce&&(ce.value=h.value)}p.value=null}catch(ee){v.value=`Failed to save: ${ee.message||"unknown error"}`}m.value=!1}async function D(X,le){try{await navigator.clipboard.writeText(le.value),k.value=X+"/"+le.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const X=r.value.scope.trim(),le=r.value.key.trim(),ee=r.value.value.trim();if(!X){d.value="Scope is required";return}if(!le){d.value="Key is required";return}if(!ee){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(le)}`,{value:ee}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await E(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ce){d.value=ce.message}c.value=!1}function I(X,le){y.value={scope:X,key:le}}async function U(){if(!y.value)return;g.value=!0,v.value=null;const{scope:X,key:le}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(le)}`);const ee=t.value[X];ee&&(t.value[X]=ee.filter(Q=>Q.key!==le));const ce=e.value.find(Q=>Q.name===X);ce&&(ce.count--,ce.keys=ce.keys.filter(Q=>Q!==le));const De=new Set(R.value);De.delete(X+"/"+le),R.value=De}catch(ee){v.value=`Failed to delete: ${ee.message||"unknown error"}`}g.value=!1,y.value=null}function W(){b.value=!0}async function K(){g.value=!0,v.value=null;const X=[];for(const le of R.value){const ee=le.indexOf("/");X.push({scope:le.slice(0,ee),key:le.slice(ee+1)})}try{await G.post("/api/memory/bulk-delete",{entries:X}),R.value=new Set,t.value={},await E()}catch(le){v.value=`Bulk delete failed: ${le.message||"unknown error"}`}g.value=!1,b.value=!1}return Ge(()=>{E()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:k,selected:R,selectedCount:w,totalEntries:S,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:E,toggleScope:M,startEdit:V,doEdit:q,copyValue:D,doAdd:L,confirmDelete:I,doDelete:U,confirmBulkDelete:W,doBulkDelete:K,isSelected:C,toggleSelect:x,isScopeAllSelected:N,toggleSelectAll:B,filteredEntries:A}}},Xw={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),o=J(()=>[...new Set(e.value.map(k=>k.category))].sort()),r=J(()=>{const v={};return e.value.forEach(k=>{v[k.category]=(v[k.category]||0)+1}),v}),c=J(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await G.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,_e.success("Entry updated"),await m()}catch(k){_e.error(k.message||"Failed to save entry")}}async function h(v){if(await Ut({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(v)),_e.success("Entry deleted"),await m()}catch(R){_e.error(R.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await G.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:Ta,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},Pm=[{id:"tools",label:"Tools",component:Dw},{id:"skills",label:"Skills",component:Fw},{id:"mcp-servers",label:"MCP Servers",component:Zw},{id:"knowledge",label:"Knowledge",component:Yw},{id:"memory",label:"Memory",component:Qw},{id:"learned",label:"Learned",component:Xw}],ek={components:{TabbedPage:Vo},setup(){return{tabs:Pm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},tk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},sk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},nk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},ak={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f(!1),a=f(!1),i=J(()=>e.value.components||[]),l=J(()=>nk[e.value.overall]||"text-gray-400"),o=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=J(()=>{const w=e.value.overall;return w==="healthy"?"All Systems Healthy":w==="degraded"?"Some Systems Degraded":w==="unhealthy"?"System Issues Detected":"Unknown"});function c(w){return tk[w]||"text-gray-400"}function d(w){return sk[w]||"info"}function u(w){return w==="ok"?"badge-success":w==="degraded"?"badge-warning":w==="down"?"badge-danger":"badge-info"}function p(w){return w==="closed"?"text-green-400":w==="half_open"?"text-yellow-400":w==="open"?"text-red-400":"text-gray-400"}function h(w){return w.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(w){if(!w)return"—";try{return new Date(w).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function v(w){return w>=1e6?(w/1e6).toFixed(1)+"M":w>=1e3?(w/1e3).toFixed(1)+"K":String(w)}async function k(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(w){s.value=w.message}finally{t.value=!1,a.value=!1}}function R(){t.value=!0,s.value=null,k()}let y=null,g=!1;function b(){g||(g=!0,k(),y||(y=setInterval(k,3e4)))}function S(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ge(b),hs(b),ns(S),gt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:k,retry:R}}},ik={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f(!1),a=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const k=i.value,R=k.storage_total_bytes||1;return[{label:"Session Persistence",mb:k.sessions.persist_dir.total_mb,bytes:k.sessions.persist_dir.total_bytes,files:k.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(k.sessions.persist_dir.total_bytes/R*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:k.knowledge.db_file.total_mb,bytes:k.knowledge.db_file.total_bytes,files:k.knowledge.db_file.file_count,pct:Math.min(100,Math.round(k.knowledge.db_file.total_bytes/R*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:k.trajectories.message_dir.total_mb,bytes:k.trajectories.message_dir.total_bytes,files:k.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.message_dir.total_bytes/R*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:k.trajectories.agent_dir.total_mb,bytes:k.trajectories.agent_dir.total_bytes,files:k.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.agent_dir.total_bytes/R*100)),color:"res-bar-amber"}]});async function d(){try{const k=await G.get("/api/resource-usage");i.value=k,t.value=null,s.value=!0}catch(k){t.value=k.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),hs(m),ns(v),gt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:id,refresh:u,retry:p}}},lk=["INFO","WARNING","ERROR"],ok=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],fr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],rk=[50,100,200,500],ck={template:`
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
    </div>`,setup(){const e=f("live"),t=f([]),s=f(!1),n=f(!0),a=f(""),i=f(""),l=f(!1),o=f(!1),r=f(Ye.state||"disconnected"),c=J(()=>{switch(r.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=f(null),u=f(!1),p=f(null),h=2e3,m=lk,v=ok,k=fr,R=f("all"),y=f(""),g=f([]),b=f(!1),S=f(""),w=f([]);function A(){try{const Z=localStorage.getItem("odin-log-presets");Z&&(g.value=JSON.parse(Z))}catch{}}function C(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const x=J(()=>a.value!==""||i.value.trim()!==""||y.value!==""),N=J(()=>{const Z=fr.find(he=>he.value===y.value);return Z?Z.label:""}),B=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(Z){return Z.message}}),E=24,M=J(()=>{if(W.value.length===0)return[];const Z=[],he=new Date,Ne=3600*1e3;for(let Ve=E-1;Ve>=0;Ve--){const et=new Date(he.getTime()-(Ve+1)*Ne),Nt=new Date(he.getTime()-Ve*Ne);Z.push({start:et,end:Nt,label:L(et,Nt),shortLabel:Nt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Ve of W.value){if(!Ve._time)continue;const et=Ve._time.getTime();for(const Nt of Z)if(et>=Nt.start.getTime()&&et<Nt.end.getTime()){Nt.total++,Ve.level==="ERROR"?Nt.errors++:Ve.level==="WARNING"?Nt.warnings++:Nt.info++;break}}return Z}),V=J(()=>{let Z=1;for(const he of M.value)he.total>Z&&(Z=he.total);return Z}),q=J(()=>{if(M.value.length===0)return"";const Z=W.value.map(Ve=>Ve._time&&Ve._time.getTime()).filter(Boolean);if(Z.length===0)return"";const he=new Date(Math.min(...Z));return`${W.value.length} shown, oldest ${he.toLocaleTimeString()}`}),D=J(()=>Math.ceil(E/8));function L(Z,he){const Ne={hour:"2-digit",minute:"2-digit"};return Z.toLocaleTimeString([],Ne)+" - "+he.toLocaleTimeString([],Ne)}function I(Z,he){return!he||!Z?"0px":Math.max(2,Z/he*100)+"%"}function U(Z){const he=W.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=Z.start.getTime()&&Ne._time.getTime()<Z.end.getTime());if(he>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[he]&&(Ne[he].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const W=J(()=>{let Z=t.value;if(a.value&&(Z=Z.filter(he=>(he.level||"INFO")===a.value)),y.value){const he=fr.find(Ne=>Ne.value===y.value);if(he&&he.seconds){const Ne=new Date(Date.now()-he.seconds*1e3);Z=Z.filter(Ve=>Ve._time&&Ve._time>=Ne)}}if(i.value&&!B.value)if(l.value)try{const he=new RegExp(i.value,"i");Z=Z.filter(Ne=>{const Ve=Ne.text||Ne.raw||"",et=Ne.tool||"";return he.test(Ve)||he.test(et)})}catch{}else{const he=i.value.toLowerCase();Z=Z.filter(Ne=>{const Ve=(Ne.text||Ne.raw||"").toLowerCase(),et=(Ne.tool||"").toLowerCase();return Ve.includes(he)||et.includes(he)})}return Z});function K(Z){if(Z.type==="log"&&Z.line)try{const he=typeof Z.line=="string"?JSON.parse(Z.line):Z.line,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(Z.line),tool:"",raw:String(Z.line)}}if(Z.payload){const he=Z.payload,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}return typeof Z=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:Z,tool:"",raw:Z}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(Z),tool:"",raw:null}}function X(Z){const he=K(Z);if(s.value){w.value.push(he);return}le(he)}function le(Z){t.value.push(Z),t.value.length>h&&(t.value=t.value.slice(-h)),n.value&&Rt(()=>ee())}function ee(Z=!1){const he=d.value;he&&he.scrollTo({top:he.scrollHeight,behavior:Z?"smooth":"instant"})}function ce(){n.value=!0,u.value=!1,Rt(()=>ee(!0))}const De=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function Q(){const Z=d.value;if(!Z)return;const he=Z.scrollHeight-Z.scrollTop-Z.clientHeight<40;u.value=!n.value&&!he&&t.value.length>0,ue.value&&be()}function be(){const Z=d.value;!Z||!n.value||Z.scrollHeight-Z.scrollTop-Z.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function z(){n.value&&requestAnimationFrame(be)}function re(Z){De.has(Z.key)&&z()}const ue=f(!1);function Le(){n.value&&(ue.value=!0,requestAnimationFrame(be))}function _(){ue.value&&(ue.value=!1,be())}function P(){n.value&&(u.value=!1,Rt(()=>ee()))}function H(){if(s.value=!s.value,!s.value&&w.value.length>0){for(const Z of w.value)le(Z);w.value=[]}}function ie(){t.value=[],w.value=[],u.value=!1}function se(){let Z;e.value==="search"?Z=Ze.value.map(et=>{const Nt=et.error?"ERROR":"INFO",ea=et.tool_name?`[${et.tool_name}] `:"";return`${et.timestamp||""} ${Nt} ${ea}${et.result_summary||et.message||""}`}).join(`
`):Z=W.value.map(et=>`${et.ts} ${et.level} ${et.text}`).join(`
`);const he=new Blob([Z],{type:"text/plain"}),Ne=URL.createObjectURL(he),Ve=document.createElement("a");Ve.href=Ne,Ve.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Ve.click(),URL.revokeObjectURL(Ne)}function ae(Z,he){const Ne=`${Z.ts} ${Z.level} ${Z.text||Z.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=he,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function pe(Z){a.value=a.value===Z?"":Z,R.value="all"}function fe(Z){return Z.level==="ERROR"?"log-line-error":Z.level==="WARNING"?"log-line-warning":"text-gray-300"}function de(Z){return Z==="ERROR"?"text-red-500 font-semibold":Z==="WARNING"?"text-yellow-500":"text-blue-500"}function oe(Z){return Z==="ERROR"?"log-chip-error":Z==="WARNING"?"log-chip-warning":"log-chip-info"}function we(Z){R.value=Z.id;const he=Z.filters;a.value=he.level||"",y.value=he.timeRange||"",i.value=he.text||"",he.levels&&(a.value=he.levels[0]||""),he.hasToolName&&(i.value="")}function ge(Z){R.value=Z.id,a.value=Z.filters.level||"",y.value=Z.filters.timeRange||"",i.value=Z.filters.text||""}function ke(){if(!S.value.trim())return;const Z={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};g.value=[...g.value,Z],C(),b.value=!1,S.value=""}function Re(Z){g.value=g.value.filter(he=>he.id!==Z),C(),R.value===Z&&(R.value="all")}const F=f("all"),me=f(""),Se=f(""),Oe=f(""),Pe=f(""),dt=f(""),ot=f(100),Ft=rk,ne=f(!1),ye=f(!1),Ie=f(""),Ze=f([]),ft=f(null),He=f(null);function xt(){e.value="search",ft.value||ms()}async function ms(){try{ft.value=await G.get("/api/logs/stats")}catch{}}function Tt(){const Z=dt.value;if(!Z){Oe.value="",Pe.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[Z];if(Ne){const Ve=new Date(Date.now()-Ne*1e3);Oe.value=Ws(Ve),Pe.value=""}}function Ws(Z){const he=Ne=>String(Ne).padStart(2,"0");return`${Z.getFullYear()}-${he(Z.getMonth()+1)}-${he(Z.getDate())}T${he(Z.getHours())}:${he(Z.getMinutes())}`}function Ht(Z){if(!Z)return"";const he=new Date(Z);return isNaN(he.getTime())?"":he.toISOString()}async function ks(){ne.value=!0,Ie.value="",ye.value=!0,He.value=null;try{const Z=new URLSearchParams;F.value&&F.value!=="all"&&Z.set("level",F.value),me.value&&Z.set("tool",me.value),Se.value&&Z.set("q",Se.value);const he=Ht(Oe.value),Ne=Ht(Pe.value);he&&Z.set("start",he),Ne&&Z.set("end",Ne),Z.set("limit",String(ot.value));const Ve=await G.get(`/api/logs/search?${Z.toString()}`);Ze.value=Ve.entries||[]}catch(Z){Ie.value=Z.message||"Search failed",Ze.value=[]}finally{ne.value=!1}}function rn(){F.value="all",me.value="",Se.value="",Oe.value="",Pe.value="",dt.value="",ot.value=100,Ze.value=[],ye.value=!1,Ie.value="",He.value=null}function Ss(Z){He.value=He.value===Z?null:Z}function Xn(Z){if(!Z.timestamp)return"";try{return new Date(Z.timestamp).toLocaleString()}catch{return Z.timestamp}}function Zs(Z){return Z.type==="web_action"?`${Z.status||""} (${Z.execution_time_ms||0}ms)`:(Z.result_summary||"").slice(0,200)}function Ls(Z){return Z.error?"log-line-error":"text-gray-300"}function Pn(Z){try{return JSON.stringify(Z,null,2)}catch{return String(Z)}}let Kt=null,Hs=!1;function as(){Hs||(Hs=!0,Ye.subscribe("logs",X),o.value=Ye.connected,r.value=Ye.state||"disconnected",Kt=Ye.onState(Z=>{r.value=Z,o.value=Z==="connected"}))}function nt(){Hs&&(Hs=!1,Ye.unsubscribe("logs",X),Kt&&(Kt(),Kt=null))}return Ge(()=>{A(),window.addEventListener("pointerup",_),window.addEventListener("pointercancel",_)}),hs(as),ns(nt),gt(()=>{nt(),window.removeEventListener("pointerup",_),window.removeEventListener("pointercancel",_)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:o,wsState:r,wsStateLabel:c,logContainer:d,filteredLogs:W,pauseBuffer:w,showJumpBottom:u,copiedIndex:p,regexError:B,levels:m,logPresets:v,timeRanges:k,timeRange:y,activeLogPreset:R,customLogPresets:g,showSaveLogPreset:b,newLogPresetName:S,hasActiveLogFilters:x,timeRangeLabel:N,timelineBuckets:M,timelineMax:V,timelineSpanLabel:q,timelineLabelSkip:D,togglePause:H,clearLogs:ie,exportLogs:se,logLineClass:fe,levelClass:de,levelChipClass:oe,toggleLevel:pe,copyLine:ae,jumpToBottom:ce,onScroll:Q,onUserScrollIntent:z,onUserScrollKey:re,onAutoScrollToggle:P,onPointerDown:Le,applyLogPreset:we,applyCustomLogPreset:ge,saveLogCustomPreset:ke,removeLogCustomPreset:Re,segmentHeight:I,jumpToTimelineBucket:U,searchLevel:F,searchTool:me,searchKeyword:Se,searchStart:Oe,searchEnd:Pe,searchTimePreset:dt,searchLimit:ot,searchLimits:Ft,searching:ne,searchRan:ye,searchError:Ie,searchResults:Ze,searchStats:ft,expandedSearch:He,switchToSearch:xt,runSearch:ks,clearSearchFilters:rn,toggleSearchExpand:Ss,formatSearchTs:Xn,searchEntryText:Zs,searchLogLineClass:Ls,formatJson:Pn,applySearchTimePreset:Tt}}};function Rl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const dk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function uk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Ya=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],pk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},hr=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),fk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Wu(e){return fk.some(t=>e===t||e.startsWith(`${t}.`))}const Mm="odin_config_center_expanded_v1",Fm="odin_config_center_category_v1",hk=50,mk=650,mr=()=>G.get("/api/config/meta");function oa(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function $i(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Na(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function vk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function gk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function $m(e,t){if($i(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return oa(t);const n={};for(const[a,i]of Object.entries(t)){const l=$m(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function bk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=$m(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Bm(e,t,s,n){if($i(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Bm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function yk(){try{const e=JSON.parse(localStorage.getItem(Mm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function xk(){try{const e=localStorage.getItem(Fm);return Ya.some(t=>t.key===e)?e:Ya[0].key}catch{return Ya[0].key}}const _k={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),n=f(null),a=f(!1),i=f(null),l=f(null),o=f(null),r=f(!1),c=f(!1),d=f(null),u=f(""),p=f("all"),h=f(xk()),m=f(yk()),v=f({}),k=f({}),R=f(""),y=f({}),g=f({}),b=f([]),S=f([]),w=f(!1),A=f(!1),C=f(!1);let x=null,N=null,B={path:null,at:0},E=0;const M=J(()=>{var T;return(((T=t.value)==null?void 0:T.fields)||[]).filter($=>!hr.has($.path.split(".")[0])&&!Wu($.path))}),V=J(()=>new Map(M.value.map(T=>[T.path,T]))),q=J(()=>W.value.reduce((T,$)=>T+$.sections.length,0)),D=J(()=>M.value.length),L=J(()=>dk),I=J(()=>b.value.length>0),U=J(()=>S.value.length>0),W=J(()=>{if(!e.value)return[];const T=new Set(Ya.flatMap(Ee=>Ee.sections)),$=Ya.map(Ee=>({...Ee,sections:Ee.sections.filter(rt=>Object.hasOwn(e.value,rt)&&!hr.has(rt))})).filter(Ee=>Ee.sections.length),Y=Object.keys(e.value).filter(Ee=>!T.has(Ee)&&!hr.has(Ee));return Y.length&&$.push({key:"other",label:"Other",icon:"folder",sections:Y}),$}),K=J(()=>e.value?{...e.value,...v.value}:null),X=J(()=>{if(!e.value)return[];const T=[];for(const[$,Y]of Object.entries(v.value))Bm(e.value[$],Y,$,T);return T.filter($=>!$i($.oldVal,$.newVal)).map($=>{const Y=P($.path);return{...$,label:(Y==null?void 0:Y.label)||Na($.path.split(".").at(-1)),apply_mode:(Y==null?void 0:Y.apply_mode)||de($.path.split(".")[0])}})}),le=J(()=>X.value.length>0),ee=J(()=>X.value.length),ce=J(()=>new Set(X.value.map(T=>T.path.split(".")[0])).size),De=J(()=>!!u.value||p.value!=="all"),Q=J(()=>{const T={...g.value};for(const $ of X.value){const Y=P($.path),Ee=fi(Y,$.newVal);Ee&&(T[$.path]=Ee)}return T}),be=J(()=>Object.keys(Q.value).length>0),z=J(()=>e.value?(De.value?W.value:W.value.filter($=>$.key===h.value)).map($=>({...$,sections:$.sections.filter(Y=>Ie(Y))})).filter($=>$.sections.length):[]),re=J(()=>{const T=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],$=new Map(T.map(Y=>[Y,[]]));for(const Y of X.value){const Ee=$.has(Y.apply_mode)?Y.apply_mode:"restart";$.get(Ee).push(Y)}return T.filter(Y=>$.get(Y).length).map(Y=>({key:Y,label:Wt(Y),entries:$.get(Y)}))}),ue=J(()=>X.value.filter(T=>T.apply_mode==="restart").length),Le=J(()=>M.value.filter(T=>T.pending_restart)),_=J(()=>Le.value.length);function P(T){const $=V.value.get(T);return $?{...$,apply_details:Rl([$])}:null}function H(T){const $=`${T}.`;return M.value.filter(Y=>Y.path===T||Y.path.startsWith($))}function ie(){return M.value.some(T=>T.path==="tools.hosts"||T.path.startsWith("tools.hosts."))}function se(){var Y,Ee;const T=((Ee=(Y=e.value)==null?void 0:Y.tools)==null?void 0:Ee.hosts)||{},$=Object.keys(T).length;return`${$} host${$===1?"":"s"} configured.`}function ae(T){return H(T).length}function pe(T){return Na(T)}function fe(T){const $=H(T);if(!$.length)return`${Na(T)} configuration.`;const Y=$.find(Ts=>Ts.sensitivity==="public"&&Ts.description)||$.find(Ts=>Ts.description),Ee=(Y==null?void 0:Y.description)||"";return Ee.match(/setting for (.+)\.$/i)?`${Na(T)} settings and runtime behaviour.`:Ee}function de(T){const $=[...new Set(H(T).map(Y=>Y.apply_mode))];return $.length===1?$[0]:$.includes("restart")?"restart":$.includes("activation_required")?"activation_required":$[0]||"restart"}function oe(T){const $=[...new Set(H(T).map(Y=>Wt(Y.apply_mode)))];return $.length?$.length===1?$[0]:`Mixed apply behaviour: ${$.join(" · ")}`:""}function we(T){return Rl(H(T))}function ge(T){var $;return Object.hasOwn(v.value,T)?v.value[T]:($=e.value)==null?void 0:$[T]}function ke(){const T=ge("mcp")||{},$=Object.keys(T.servers||{}).length;return`${T.enabled?"Globally enabled":"Globally disabled"} · ${$} configured server${$===1?"":"s"}.`}function Re(T,$){return $.split(".").reduce((Y,Ee)=>Y==null?void 0:Y[Ee],T)}function F(T){const $=K.value;return H(T).filter(Y=>Wu(Y.path)?!1:Y.path.split(".").length<=2?!0:!Y.path.includes(".*")).map(Y=>({...Y,key:Y.path.split(".").at(-1),value:Re($,Y.path),apply_details:Rl([Y]),editor:Y.path==="agents.final_warning_iterations"?"warning-chips":null}))}function me(T){const $=T.path.split(".");return $.length>2?$.slice(0,2).join("."):null}function Se(T){const $=new Map;for(const Y of F(T)){const Ee=me(Y),rt=Ee||`${T}.__root`;$.has(rt)||$.set(rt,{key:rt,path:Ee,entries:[]}),$.get(rt).entries.push(Y)}return[...$.values()].map(Y=>{const Ee=Y.entries.find(rt=>rt.group_description);return{...Y,label:Y.path?Na(Y.path.split(".").at(-1)):null,description:(Ee==null?void 0:Ee.group_description)||null,apply_details:Rl(Y.entries),runtime_summaries:Pe(Y.entries)}})}function Oe(T){return{save:T.save_effect||(T.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:T.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[T.apply_mode]||"Effective runtime state is not currently observable."}}function Pe(T){const $=new Map;for(const Y of T){const Ee=Oe(Y),rt=`${Y.apply_mode}|${Ee.save}|${Ee.runtime}`;$.has(rt)||$.set(rt,{key:rt,label:Wt(Y.apply_mode),save:Ee.save,runtime:Ee.runtime})}return[...$.values()]}function dt(T){if(ot(T))return T.runtime_effect||T.activation_policy||"";if(T.apply_mode==="activation_required"){const $=T.activation_policy||T.runtime_effect;return $?`Not active after saving. No activation control exists in this release. ${$}`:"Not active after saving; no activation control exists in this release."}return""}function ot(T){return T.action_available===!0&&!!(T.action_label&&T.action_endpoint)}async function Ft(T){if(ot(T))try{if(ms(T.path))throw new Error("Save this setting before applying its action.");const $=String(T.action_method||"POST").toLowerCase(),Y={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[$];if(!Y)throw new Error("Unsupported configuration action");await Y(T.action_endpoint,T.action_body||void 0),await Me(),Zt("success",`${T.action_label} completed.`)}catch($){Zt("error",$.message||`${T.action_label} failed`)}}function ne(T,$){return[T.label,T.path,T.description,...T.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes($)}function ye(T){const $=u.value.trim().toLowerCase();return $?H(T).filter(Y=>ne(Y,$)):[]}function Ie(T){const $=H(T);if(p.value!=="all"&&!$.some(Ee=>Ee.apply_state===p.value))return!1;const Y=u.value.trim().toLowerCase();return!Y||`${pe(T)} ${T}`.toLowerCase().includes(Y)?!0:$.some(Ee=>ne(Ee,Y))}function Ze(T,$){return H(T).filter(Y=>Y.apply_state===$).length}function ft(T){return T==="all"?D.value:M.value.filter($=>$.apply_state===T).length}function He(T){const $=T.sections.flatMap(Y=>H(Y));return{fields:$.length,modified:X.value.filter(Y=>T.sections.includes(Y.path.split(".")[0])).length,pending_restart:$.filter(Y=>Y.apply_state==="pending_restart").length,invalid:$.filter(Y=>Y.apply_state==="invalid").length,dormant:$.filter(Y=>Y.apply_state==="dormant").length}}function xt(T){var $;return Object.hasOwn(v.value,T)&&!$i(($=e.value)==null?void 0:$[T],v.value[T])}function ms(T){return X.value.some($=>$.path===T||$.path.startsWith(`${T}.`))}function Tt(T){h.value=T,u.value="",p.value="all";try{localStorage.setItem(Fm,T)}catch{}}function Ws(T){p.value=T}function Ht(){u.value="",p.value="all"}function ks(T){var $;return(($=W.value.find(Y=>Y.sections.includes(T)))==null?void 0:$.sections)||[]}function rn(T){const $=ks(T),Y=$.find(Ee=>m.value[Ee]===!0);return Y||$.find(Ee=>m.value[Ee]!==!1)||null}function Ss(T){return u.value&&!C.value&&Ie(T)?!0:C.value?rn(T)===T:Object.hasOwn(m.value,T)?m.value[T]===!0:!0}function Xn(T){const $=!Ss(T);if(C.value){const Y={...m.value};for(const Ee of ks(T))Y[Ee]===!0&&(Y[Ee]=!1);Y[T]=$,m.value=Y;return}m.value={...m.value,[T]:$}}function Zs(){b.value.push(oa(v.value)),b.value.length>hk&&b.value.shift(),S.value=[]}function Ls(){le.value&&(Zs(),v.value={},g.value={},w.value=!1)}function Pn(T,$=!1){const Y=Date.now();if($&&B.path===T&&Y-B.at<mk){B.at=Y;return}Zs(),B={path:T,at:Y}}function Kt(T,$,Y){if(!$.length)return Y;const Ee=oa(T??{});let rt=Ee;for(let Ts=0;Ts<$.length-1;Ts+=1){const un=$[Ts];rt[un]=oa(rt[un]??{}),rt=rt[un]}return rt[$.at(-1)]=Y,Ee}function Hs(T){var $;return Object.hasOwn(v.value,T)?v.value[T]:oa(($=e.value)==null?void 0:$[T])}function as(T,$,Y={}){var md;const[Ee,...rt]=T.path.split(".");Pn(T.path,!!Y.coalesce);const Ts=Hs(Ee),un=rt.length?Kt(Ts,rt,$):$,sa={...v.value};if($i(un,(md=e.value)==null?void 0:md[Ee])?delete sa[Ee]:sa[Ee]=un,v.value=sa,g.value[T.path]){const vd={...g.value};delete vd[T.path],g.value=vd}}function nt(T){B={path:null,at:0},k.value={...k.value,[T]:String(Re(K.value,T)??"")}}function Z(T){if(B={path:null,at:0},!Object.hasOwn(k.value,T))return;const $={...k.value};delete $[T],k.value=$}function he(T){const $=k.value[T.path];if(B={path:null,at:0},$===""){g.value={...g.value,[T.path]:"Enter a number."};return}const Y=Number($);if(Number.isNaN(Y)||T.type==="integer"&&!Number.isInteger(Y)){g.value={...g.value,[T.path]:T.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Ee={...k.value};delete Ee[T.path],k.value=Ee,as(T,Y,{coalesce:!0})}function Ne(T){return Object.hasOwn(k.value,T.path)?k.value[T.path]:T.value??""}function Ve(T,$){if(k.value={...k.value,[T.path]:$},$===""){g.value={...g.value,[T.path]:"Enter a number."};return}const Y=Number($);if(!Number.isFinite(Y)||T.type==="integer"&&!Number.isInteger(Y)){g.value={...g.value,[T.path]:T.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[T.path]){const Ee={...g.value};delete Ee[T.path],g.value=Ee}as(T,Y,{coalesce:!0})}function et(T){const $=Number.parseInt(R.value,10);if(!Number.isInteger($)||$<1){g.value={...g.value,[T.path]:"Warning thresholds must be positive whole numbers."};return}const Y=[...new Set([...T.value||[],$])].sort((Ee,rt)=>rt-Ee);R.value="",as(T,Y)}function Nt(T,$){as(T,(T.value||[]).filter(Y=>Y!==$))}function ea(T){return T.apply_mode==="live_read"?"Odin reads the saved file value on next use.":T.apply_mode==="live_for_new_work"?"New work uses the saved file value.":T.apply_mode==="live_apply"?T.apply_handler?`Apply the saved value through ${T.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":T.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":T.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":T.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function is(T){return T.type==="array"&&Array.isArray(T.value)&&!T.structured_container&&!T.structured_container_child&&T.sensitivity==="public"&&T.value.every($=>["string","number","boolean"].includes(typeof $))}function Ea(T){const $=String(y.value[T.path]??"").trim();if(!$)return;const Y=[...new Set([...T.value||[],$])];y.value={...y.value,[T.path]:""},as(T,Y)}function zs(T,$){as(T,(T.value||[]).filter(Y=>Y!==$))}function fi(T,$){var Ee;if(!T)return null;if((Ee=T.enum)!=null&&Ee.length&&!T.enum.includes($))return`Choose one of: ${T.enum.join(", ")}`;if(T.path==="agents.final_warning_iterations"&&(!Array.isArray($)||!$.length))return"Add at least one warning threshold.";const Y=T.constraints||{};if((T.type==="integer"||T.type==="number")&&typeof $=="number"){if(Y.minimum!==void 0&&$<Y.minimum)return`Must be at least ${Y.minimum}${T.unit?` ${T.unit}`:""}`;if(Y.maximum!==void 0&&$>Y.maximum)return`Must be at most ${Y.maximum}${T.unit?` ${T.unit}`:""}`}return null}function hi(T){return Q.value[T.path]||null}function Aa(T){const $=`${T}.`;return Object.keys(Q.value).some(Y=>Y===T||Y.startsWith($))}function ta(){b.value.length&&(S.value.push(oa(v.value)),v.value=b.value.pop(),g.value={},k.value={},B={path:null,at:0})}function Mn(){S.value.length&&(b.value.push(oa(v.value)),v.value=S.value.pop(),g.value={},k.value={},B={path:null,at:0})}function Fn(){!le.value||be.value||(w.value=!0,A.value=!1)}function Js(){w.value=!1}function cn(){Ls()}function Wt(T){return pk[T]||Na(T||"unknown")}function Ra(T){return`apply-${String(T||"unknown").replaceAll("_","-")}`}function j(T){return`cfgc-field-${T.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function xe(T){return`${j(T)}-input`}function Ae(T){const $=document.getElementById(j(T))||document.getElementById(j(T.split(".").slice(0,2).join(".")));$==null||$.scrollIntoView({behavior:"smooth",block:"center"})}function Zt(T,$){l.value={type:T,message:$},window.setTimeout(()=>{var Y;((Y=l.value)==null?void 0:Y.message)===$&&(l.value=null)},3500)}function dn(){r.value=!1,p.value="pending_restart",u.value="";const T=uk(n.value);T&&(T.scrollTop=0)}function $n(){r.value=!1}function Te(T=1800){N&&window.clearTimeout(N),N=window.setTimeout(O,T)}async function O(){if(c.value){if(E+=1,E>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await mr(),_.value===0){c.value=!1,d.value=null,Zt("success","Odin restarted and the saved startup settings are active.");return}}catch{}Te(2e3)}}async function te(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,E=0,r.value=!1,Te()}catch(T){d.value=T.message||"Odin could not schedule a restart."}}}async function ve(){if(!(!le.value||be.value||a.value)){a.value=!0;try{const T=bk(e.value,v.value),$=await G.put("/api/config",T);e.value=$,v.value={},b.value=[],S.value=[],g.value={},w.value=!1;try{t.value=await mr(),o.value=null,r.value=_.value>0,Zt("success",_.value?`Configuration saved. ${_.value} setting${_.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Y){o.value=Y.message||"Unknown metadata error.",Zt("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(T){Zt("error",T.message||"Configuration could not be saved")}finally{a.value=!1}}}async function Me(){var T,$;if(!le.value){s.value=!0,i.value=null;try{const Y=await G.get("/api/config"),Ee=await mr();e.value=Y,t.value=Ee,o.value=null;const rt=W.value;if(rt.some(Ts=>Ts.key===h.value)||(h.value=((T=rt[0])==null?void 0:T.key)||Ya[0].key),C.value){const un=((($=rt.find(sa=>sa.key===h.value))==null?void 0:$.sections)||[]).find(sa=>m.value[sa]===!0);m.value=un?{...m.value,[un]:!0}:{}}}catch(Y){i.value=Y.message||"Unknown configuration error"}finally{s.value=!1}}}function $e(T){if(w.value||!(T.ctrlKey||T.metaKey))return;const $=T.target;$ instanceof HTMLElement&&($.matches("input, textarea, select")||$.isContentEditable)||(!T.shiftKey&&T.key.toLowerCase()==="z"?(T.preventDefault(),ta()):(T.key.toLowerCase()==="y"||T.shiftKey&&T.key.toLowerCase()==="z")&&(T.preventDefault(),Mn()))}function Ue(T){C.value=T.matches}us(m,T=>{try{localStorage.setItem(Mm,JSON.stringify(T))}catch{}},{deep:!0});let bt=!1;function at(){bt||(bt=!0,document.addEventListener("keydown",$e))}function ht(){bt&&(bt=!1,document.removeEventListener("keydown",$e))}return Ge(()=>{var T;Me(),at(),x=window.matchMedia("(max-width: 760px)"),Ue(x),(T=x.addEventListener)==null||T.call(x,"change",Ue)}),hs(at),ns(ht),gt(()=>{var T;ht(),(T=x==null?void 0:x.removeEventListener)==null||T.call(x,"change",Ue),N&&window.clearTimeout(N)}),{armKeydown:at,disarmKeydown:ht,handleKeydown:$e,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:h,reviewOpen:w,mobileOverflowOpen:A,warningThresholdInput:R,arrayInputs:y,healthFilters:L,visibleCategories:W,displayGroups:z,reviewGroups:re,sectionCount:q,fieldCount:D,hasChanges:le,changeCount:ee,changedSectionCount:ce,hasDraftErrors:be,canUndo:I,canRedo:U,globalFilterActive:De,reviewRestartCount:ue,pendingRestartCount:_,pendingRestartFields:Le,healthCount:ft,categoryStats:He,selectCategory:Tt,selectHealthFilter:Ws,clearFilters:Ht,sectionLabel:pe,sectionDescription:fe,sectionFieldCount:ae,sectionHealthCount:Ze,sectionApplySummary:oe,sectionApplyDetails:we,sectionEntries:F,fieldGroups:Se,sectionSearchHits:ye,mcpConfigSummary:ke,fieldRuntimeCopy:Oe,fieldSpecificRuntimeNote:dt,hasHonestAction:ot,runFieldAction:Ft,hasHostsCollection:ie,hostsConfigSummary:se,sectionChanged:xt,fieldChanged:ms,isSectionExpanded:Ss,toggleSection:Xn,discardAllDrafts:Ls,setFieldValue:as,setNumberFieldValue:Ve,numberInputValue:Ne,beginInputEdit:nt,endTextInputEdit:Z,endInputEdit:he,addWarningThreshold:et,removeWarningThreshold:Nt,isScalarArray:is,addScalarArrayItem:Ea,removeScalarArrayItem:zs,fieldError:hi,sectionHasErrors:Aa,undo:ta,redo:Mn,openReview:Fn,closeReview:Js,mobileCancel:cn,applyModeLabel:Wt,applyClass:Ra,compactValue:vk,formatValue:gk,structuredApplyCopy:ea,fieldId:j,fieldInputId:xe,focusField:Ae,fetchConfig:Me,saveConfig:ve,restartOdin:te,restartLater:$n,reviewPendingRestart:dn}}},wk=/^\d{15,25}$/;function Um(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Hm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),n=f(!1),a=f(0),i=f(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),o=J(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(w=>l.value.has(String(w.id))?!1:S?u(w).toLowerCase().includes(S)||String(w.username||"").toLowerCase().includes(S)||String(w.id).includes(S):!0)}),r=J(()=>{const S=s.value.trim();return o.value.length===0&&wk.test(S)&&!l.value.has(S)?S:""}),c=J(()=>o.value.length+(r.value?1:0)),d=J(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(S){return Um(S)}function p(){n.value=!0,a.value=0}function h(){p()}function m(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function v(){a.value=Math.max(a.value-1,0)}function k(){const S=o.value[a.value];S?R(S):r.value&&a.value===o.value.length&&y(r.value)}function R(S){y(String(S.id))}function y(S){t("select",S),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&Rt(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:k,selectMember:R,selectId:y,closeOptions:g,onBlur:b}}};function Zu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const kk={components:{DiscordUserCombobox:Hm},template:`
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
  `,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f(null),i=f(null),l=f(!1),o=f(null),r=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),h=J(()=>new Map(c.value.map(D=>[String(D.id),D])));function m(D){return D.config&&D.config.enabled!==void 0?D.config.enabled:!0}function v(D){return Zu(D,"require_mention",a.value)}function k(D){return Zu(D,"respond_to_bots",a.value)}function R(D){return D.config&&Object.keys(D.config).length>0}function y(D){n.value[D]=!n.value[D]}function g(D){const L=D.discord||{};return{allowed_users:[...L.allowed_users||[]],channels:[...L.channels||[]],respond_to_bots:!!L.respond_to_bots,require_mention:!!L.require_mention,ignore_bot_ids:[...L.ignore_bot_ids||[]]}}async function b({showLoading:D=!0}={}){const L=++d;D&&(t.value=!0),s.value=null;try{const I=await G.get("/api/discord/guilds");L===d&&(e.value=I)}catch(I){L===d&&(s.value=I.message)}finally{D&&L===d&&(t.value=!1)}}async function S(){t.value=!0,s.value=null;try{const[D,L,I]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),U=g(I),W=p.value;a.value=U,W||(i.value=JSON.parse(JSON.stringify(U))),c.value=L,e.value=D,o.value=null}catch(D){s.value=D.message}finally{t.value=!1}}let w=Promise.resolve();const A=f(new Set);function C(D,L){const I=new Set(A.value);I.add(D),A.value=I;const U=w.then(L);return w=U.catch(()=>{}),U.finally(()=>{const W=new Set(A.value);W.delete(D),A.value=W})}function x(D,L,I,U){const W=(U==null?void 0:U.target)??null;return C(`guild:${D}:${L}`,async()=>{try{await G.put("/api/discord/guild/"+D+"/config",{[L]:I}),await b({showLoading:!1})}catch(K){s.value=K.message,W&&typeof I=="boolean"&&(W.checked=!I)}})}function N(D,L,I,U,W){const K=(W==null?void 0:W.target)??null;return C(`channel:${D}:${I}`,async()=>{try{await G.put("/api/discord/channel/"+D+"/config",{[I]:U}),await b({showLoading:!1})}catch(X){s.value=X.message,K&&typeof U=="boolean"&&(K.checked=!U)}})}function B(D,L){return C(`channel:${D}:clear`,async()=>{try{await G.put("/api/discord/channel/"+D+"/config",{clear:!0}),await b({showLoading:!1})}catch(I){s.value=I.message}})}function E(D,L){const I=String(L);if(!D.userAutocomplete)return I;const U=h.value.get(I);return U?Um(U):I}function M(D,L=null){const I=String(L??r.value[D]??"").trim();!I||i.value[D].includes(I)||(i.value[D]=[...i.value[D],I],r.value={...r.value,[D]:""})}function V(D,L){i.value[D]=i.value[D].filter(I=>I!==L)}async function q(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const L=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...L.allowed_users||[]],channels:[...L.channels||[]],respond_to_bots:!!L.respond_to_bots,require_mention:!!L.require_mention,ignore_bot_ids:[...L.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(D){o.value=D.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ge(S),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:k,hasOverride:R,toggleGuild:y,fetchAll:S,fetchGuilds:b,setGuildConfig:x,setChannelConfig:N,clearOverride:B,mutationPending:A,globalItemLabel:E,addGlobalItem:M,removeGlobalItem:V,saveGlobalDefaults:q}}},Cs=e=>e==null?e:JSON.parse(JSON.stringify(e));function Sk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(w){d+=1;const A=c.then(w,w);return c=A.catch(()=>{}),A}function k(w,A){h=Cs(w),m.clear();for(const[C,x]of Object.entries(A||{}))m.set(C,Cs(x))}function R(w){const A=Cs(w),C=++u;return v(async()=>{try{await e(Cs(A)),h=Cs(A),C===u&&n(Cs(A))}catch(x){C===u&&(a(Cs(h)),r(x,{kind:"default"}))}})}function y(w,A){const C=Cs(A),x=(p.get(w)||0)+1;return p.set(w,x),v(async()=>{try{await t(w,Cs(C)),m.set(w,Cs(C)),x===p.get(w)&&i(w,Cs(C))}catch(N){x===p.get(w)&&(l(w,Cs(m.get(w)??null)),r(N,{kind:"user",uid:w}))}})}function g(w){const A=(p.get(w)||0)+1;return p.set(w,A),v(async()=>{try{await s(w),m.delete(w),A===p.get(w)&&o(w)}catch(C){A===p.get(w)&&(l(w,Cs(m.get(w)??null)),r(C,{kind:"delete",uid:w}))}})}async function b(){for(;;){const w=c;if(await w,w===c)return d}}async function S(w){for(;;){const A=await b(),C=await w();if(A===d)return C}}return{seed:k,saveDefault:R,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:S,get revision(){return d}}}const Tk={components:{DiscordUserCombobox:Hm},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=J(()=>{const E={};for(const M of r.value)E[M.id]=M;return E});function d(E){return c.value[E]||null}function u(E,M){return E?E.allowed_hosts===null||E.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:E.default_host||"",allow_all:!0}:{allowed_hosts:E.allowed_hosts,default_host:E.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=Sk({applyDefault:async E=>{const M=E.allow_all?null:E.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:E.default_host})},applyUser:async(E,M)=>{const V=M.allow_all?null:M.allowed_hosts;await G.put(`/api/host-access/user/${E}`,{allowed_hosts:V,default_host:M.default_host})},applyDelete:E=>G.del(`/api/host-access/user/${E}`),onDefaultConfirmed:()=>_e.success("Default policy updated"),onDefaultRollback:E=>{E&&(i.value=E)},onUserConfirmed:E=>{const M=d(E);_e.success(`Updated access for ${M?M.display_name:E}`)},onUserRollback:(E,M)=>{const V={...l.value};M?V[E]=M:delete V[E],l.value=V},onUserDeleted:E=>{const M={...l.value};delete M[E],l.value=M},onError:(E,M)=>{var q;const V=M.uid?` ${((q=d(M.uid))==null?void 0:q.display_name)||M.uid}`:"";_e.error(`${E.message||"Failed to save"} — reverted${V}`)}});let h=0;async function m(){const E=++h;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>G.get("/api/host-access"));if(E!==h)return;s.value=M,n.value=M.available_hosts||[],a.value=M.host_descriptions||{},i.value=u(M.default_policy,n.value);const V=M.users||{},q={};for(const[D,L]of Object.entries(V))q[D]=u(L,n.value);l.value=q,p.seed(i.value,q)}catch(M){E===h&&(t.value=M.message||"Failed to fetch host access data")}finally{E===h&&(e.value=!1)}try{const M=await G.get("/api/discord/members")||[];E===h&&(r.value=M)}catch{E===h&&(r.value=[])}}const v=500,k=new Map;function R(E,M){const V=k.get(E);V&&clearTimeout(V.timer);const q={run:M,timer:null};q.timer=setTimeout(()=>{k.delete(E),M()},v),k.set(E,q)}function y(E){const M=k.get(E);M&&(clearTimeout(M.timer),k.delete(E))}function g(){for(const[E,M]of[...k])clearTimeout(M.timer),k.delete(E),M.run()}function b(){R("default",()=>p.saveDefault(i.value))}function S(E,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(E)||i.value.allowed_hosts.push(E):(i.value.allowed_hosts=i.value.allowed_hosts.filter(V=>V!==E),i.value.default_host===E&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function w(E){R(`user:${E}`,()=>{const M=l.value[E];M&&p.saveUser(E,M)})}function A(E,M,V){const q=l.value[E];q&&(q.allow_all=!1,V?q.allowed_hosts.includes(M)||q.allowed_hosts.push(M):(q.allowed_hosts=q.allowed_hosts.filter(D=>D!==M),q.default_host===M&&(q.default_host=q.allowed_hosts[0]||"")),w(E))}function C(E,M){const V=l.value[E];V&&(V.default_host=M,w(E))}function x(){o.value=!0}function N(E){!/^\d{15,25}$/.test(E)||l.value[E]||(l.value[E]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},p.saveUser(E,l.value[E]),o.value=!1)}async function B(E){const M=d(E);await Ut({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:E}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${E}`),await p.deleteUser(E),l.value[E]||_e.success(`Removed override for ${M?M.display_name:E}`))}return Ge(m),ns(g),gt(g),{loading:e,error:t,data:s,availableHosts:n,hostDescriptions:a,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:S,getMember:d,toggleUserHost:A,setUserDefault:C,openAddUser:x,addUserById:N,deleteUser:B,flushPendingSaves:g}}},Ck={template:`
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
        <div v-if="step===4" class="space-y-3"><p class="text-sm">Test non-interactive authentication and platform identity before activation.</p><button class="btn btn-primary text-xs" @click="testConnection">Test connection</button><pre v-if="testResult" class="code-block">{{ JSON.stringify(testResult,null,2) }}</pre></div>
        <div v-if="step===5" class="space-y-3"><p class="text-sm">Activation is live. Users with <code>allowed_hosts: null</code> gain this host automatically. Review grants on Host Access after saving.</p><button class="btn btn-primary" :disabled="!tested" @click="commit">Save and activate</button><a class="btn btn-ghost text-xs" href="#/system?tab=host-access">Open Host Access</a></div>
        <div class="flex justify-between"><button class="btn btn-ghost text-xs" :disabled="step===1" @click="step--">Back</button><button v-if="step<5 && step!==3 && step!==4" class="btn btn-ghost text-xs" @click="step++">Next</button></div>
      </div>
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),n=f([]),a=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),k=f(v()),R=J(()=>["127.0.0.1","localhost","::1"].includes(k.value.address));async function y(){t.value=!0,s.value="";try{const q=await G.get("/api/hosts");e.value=q.hosts||[],o.value=q.default_host||"",r.value=!!q.tofu_enabled}catch(q){s.value=q.message}finally{t.value=!1}}async function g(){try{await G.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),_e.success("Host settings saved and published live"),await y()}catch(q){_e.error(q.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,a.value=!0}function S(){i.value=!1,k.value=v(),b()}function w(q){i.value=!0,k.value={...v(),...q},b()}async function A(){try{c.value=await G.get("/api/hosts/public-key")}catch(q){_e.error(q.message)}}async function C(q){try{const D=await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/import-legacy",{});i.value=!0,k.value={...v(),...q,trust_mode:"pinned"},b(),d.value=D.candidate_token,u.value=D.fingerprints||[],m.value=u.value.join(`
`),l.value=4,_e.info("Imported existing known_hosts trust. Test before activation.")}catch(D){_e.error(D.message)}}async function x(){try{const q=m.value.split(/\s+/).filter(Boolean),D={...k.value,expected_fingerprints:q,candidate_fingerprints:u.value},L=await G.post("/api/hosts/candidates",D);if(d.value=L.candidate_token,u.value=L.fingerprints||[],k.value.trust_mode==="tofu"&&D.candidate_fingerprints.length===0){k.value.confirm_tofu=!1,_e.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(q){_e.error(q.message)}}async function N(){try{const q=await G.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!q.tested,h.value=q.last_test,p.value&&(l.value=5)}catch(q){_e.error(q.message)}}async function B(){try{await G.post("/api/hosts/candidates/"+d.value+"/commit",{}),_e.success("Host saved and published live"),a.value=!1,await y()}catch(q){_e.error(q.message)}}async function E(q){try{await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/enabled",{enabled:!q.enabled}),await y()}catch(D){_e.error(D.message)}}async function M(q){var D;if(await Ut("Delete host "+q.alias+"? Dependencies will block deletion.")){n.value=[];try{await G.del("/api/hosts/"+encodeURIComponent(q.alias)),await y()}catch(L){n.value=Array.isArray((D=L.data)==null?void 0:D.pending_references)?L.data.pending_references:[],_e.error(L.message)}}}async function V(q){if(await Ut("Force revoke "+q.alias+"? Remote outcomes may be unknown."))try{await G.post("/api/hosts/"+encodeURIComponent(q.alias)+"/force-revoke",{}),await y()}catch(D){_e.error(D.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:n,wizard:a,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:k,isLocal:R,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:g,beginAdd:S,beginEdit:w,loadKey:A,importLegacy:C,prepare:x,testConnection:N,commit:B,toggle:E,remove:M,forceRevoke:V}}},Ek={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const C=await G.get("/api/tokens");s.value=C.tokens||[],n.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function v(C){return!C||!C.trim()?[]:C.split(",").map(x=>x.trim()).filter(Boolean)}function k(C,x){const N=c.value.allowed_hosts;if(x&&!N.includes(C)&&N.push(C),!x){const B=N.indexOf(C);B>=0&&N.splice(B,1)}}function R(C,x){const N=d.value.allowed_hosts;if(x&&!N.includes(C)&&N.push(C),!x){const B=N.indexOf(C);B>=0&&N.splice(B,1)}}async function y(){var C;i.value=!0;try{const x=v(c.value.allowed_tools_str),N=c.value.host_mode,B=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,E={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};B!==null&&(E.allowed_hosts=B),E.default_host=c.value.default_host||"";const M=await G.post("/api/tokens",E);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,_e.success("Token created"),await m()}catch(x){_e.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(C){o.value=C;const x=C.allowed_hosts;let N="default";x==null?N="default":Array.isArray(x)&&x.length===0?N="none":Array.isArray(x)&&(N="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:N,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function b(){var C;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),N=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};N==="none"?B.allowed_hosts=[]:N==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(o.value.user_id),B),o.value=null,_e.success("Token updated"),await m()}catch(x){_e.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function S(C){var N;if(await Ut({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await G.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=B.token,_e.success("Token regenerated")}catch(B){_e.error(((N=B.data)==null?void 0:N.error)||B.message||"Failed to regenerate")}}async function w(C){var N;if(await Ut({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(C.user_id)),_e.success("Token deleted"),await m()}catch(B){_e.error(((N=B.data)==null?void 0:N.error)||B.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),_e.success("Copied to clipboard")}catch{_e.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:k,toggleEditHost:R,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:S,confirmDelete:w,copyToken:A}}},Ak=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),Rk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),Ik=Object.freeze(["enabled","base_url","model","max_tokens"]),Ok=Object.freeze(["enabled","model","max_tokens"]);function qo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function Ju(e){return qo(e,Ak)}function Yu(e){return qo(e,Rk)}function Lk(e,{includeApiKey:t=!1}={}){const s=qo(e,Ik);return t&&(s.api_key=e.api_key),s}function Nk(e){return{timeout:e.timeout}}function Dk(e,{includeApiKey:t=!1}={}){const s=qo(e,Ok);return t&&(s.api_key=e.api_key),s}function Pk(e){return{timeout:e.timeout}}function Il(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Mk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f("codex"),a=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=J(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),o=J(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(j,xe)=>!!j&&!!xe&&(r[j]||[]).includes(xe),d=j=>!c(a.value.model,j)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,j)),u=j=>{const xe=a.value.agent_model;return xe==="auto"?!0:!c(xe||a.value.model,j)},p=J(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?null:j||a.value.reasoning_effort}),h=j=>c(j,a.value.reasoning_effort)||a.value.agent_model===""&&c(j,p.value),m=j=>c(j,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),k=f({unavailable_reason:null}),R=J(()=>{const j=v.value.model;return j&&!i.includes(j)?[j,...i]:i});function y(j){const xe=j.target.value;v.value.enabled=xe!=="",xe!==""&&(v.value.model=xe),Ne()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),S=f(null),w=f(!1),A=f(""),C=f(null),x=f(!1);let N=0;const B=J(()=>{var j;return Object.entries(((j=S.value)==null?void 0:j.models)||{}).map(([xe,Ae])=>{var Zt,dn,$n;return{model:xe,floor:Ae.floor,override:Ae.override,effectiveBudget:(Zt=Ae.effective)==null?void 0:Zt.effective_budget,configuredPrimaryChars:(dn=Ae.configured)==null?void 0:dn.primary_chars,primaryChars:($n=Ae.effective)==null?void 0:$n.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at,densityPriorMilli:Ae.density_prior_milli,densityScope:Ae.density_scope,workloadCalibration:Ae.workload_calibration}})}),E=J(()=>{var j;return((j=S.value)==null?void 0:j.clamps)||[]}),M=J(()=>{var j,xe;return((xe=(j=S.value)==null?void 0:j.models)==null?void 0:xe[a.value.model])||null}),V=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),q=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),D=f(!1),L=f(!1),I=f(!1),U=f(!1),W=f(!1),K=f(!1),X=f(!1),le=f({configured:null}),ee=f(!1),ce=f([]),De=f(""),Q=f(!1),be=f(!1),z=f({configured:null}),re=f(!1),ue=f([]),Le=f(""),_=f(!1),P=f(!1),H=f(!0),ie=f(""),se=f({configured:null,accounts:[]}),ae=f(null),pe=f(null),fe=f(""),de=f(null),oe=f(!1),we=f(null),ge=f(null),ke=f("");let Re=null;function F(j,xe="success"){_e(j,xe==="error"?"error":"success")}function me(j){if(!j)return"?";const xe=j/(1024*1024*1024);return xe>=1?xe.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function Se(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Oe(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function Pe(j){const xe=new Date(j);return Number.isNaN(xe.getTime())?"unknown":xe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function dt(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function ot(j){return typeof j!="number"||!Number.isFinite(j)?"—":(j/1e3).toFixed(2)}function Ft(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function ne(j){const xe=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(xe))&&Number(xe)>j.floor}function ye(j,xe){const Ae={...a.value.context_budget_overrides};xe.target.value===""?delete Ae[j]:Ae[j]=Number(xe.target.value),a.value.context_budget_overrides=Ae,x.value=!0}function Ie(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),x.value=!0}function Ze(j){const xe={...a.value.context_budget_overrides};delete xe[j],a.value.context_budget_overrides=xe,x.value=!0}async function ft(){e.value=!0,await Promise.all([He(),ms(),Ss(),Tt(),xt()]),e.value=!1}async function He({preserveBasic:j=!1,preserveAdvanced:xe=!1}={}){try{const Ae=await G.get("/api/llm/status");t.value=Ae,s.value=!1,n.value=Ae.active_provider||"codex",Ae.codex&&!he.pending()&&(j||(a.value.enabled=Ae.codex.enabled,a.value.model=Ae.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",a.value.agent_model=Ae.codex.agent_model||""),xe||(a.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ae.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ae.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ae.codex.context_compression||{}},!x.value&&!I.value&&(a.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},a.value.context_utilization=Ae.codex.context_utilization??a.value.context_utilization))),Ae.ollama&&!Ve.pending()&&(j||(V.value.enabled=Ae.ollama.enabled,V.value.base_url=Ae.ollama.base_url||"",V.value.model=Ae.ollama.model||"",V.value.max_tokens=Ae.ollama.max_tokens||4096),xe||(V.value.timeout=Ae.ollama.timeout??V.value.timeout)),Ae.kimi&&!et.pending()&&(j||(q.value.enabled=Ae.kimi.enabled,q.value.model=Ae.kimi.model||"",q.value.max_tokens=Ae.kimi.max_tokens||4096),xe||(q.value.timeout=Ae.kimi.timeout??q.value.timeout)),Ae.auxiliary&&(k.value=Ae.auxiliary,Ne.pending()||(v.value.enabled=Ae.auxiliary.enabled,v.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function xt(){const j=++N;w.value=!0,A.value="";try{const xe=await G.get("/api/context/windows");if(j!==N)return;S.value=xe,!I.value&&!x.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(xe.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,Zt])=>[Ae,Zt.override])),a.value.context_utilization=xe.utilization??a.value.context_utilization)}catch(xe){j===N&&(A.value=xe.message||"Failed to load context budgets")}finally{j===N&&(w.value=!1)}}async function ms(){try{if(le.value=await G.get("/api/ollama/status"),ee.value=!1,le.value.model&&(De.value=le.value.model),le.value.configured)try{const j=await G.get("/api/ollama/models");ce.value=j.models||[]}catch{ce.value=[]}else if(V.value.base_url)try{const j=await G.post("/api/ollama/probe-models",{base_url:V.value.base_url});ce.value=j.models||[]}catch{ce.value=[]}}catch{ee.value=!0}}async function Tt(){H.value=!0,ie.value="";try{se.value=await G.get("/api/codex/status")}catch(j){ie.value=j.message||"Failed to fetch Codex status"}finally{H.value=!1}}async function Ws(){const j=t.value?t.value.active_provider:"codex";X.value=!0;try{const xe=await G.post("/api/llm/switch",{provider:n.value});xe.error?(n.value=j,F(xe.error,"error")):(F("Switched to "+n.value+" ("+xe.model+")"),await ft())}catch(xe){n.value=j,F(xe.message||"Switch failed","error")}finally{X.value=!1}}async function Ht(){Q.value=!0;try{const j=await G.post("/api/ollama/reload");F(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await ft()}catch(j){F(j.message||"Reload failed","error")}finally{Q.value=!1}}async function ks(){be.value=!0;try{await G.post("/api/ollama/model",{model:De.value}),F("Model set to "+De.value),await ft()}catch(j){F(j.message||"Failed","error")}finally{be.value=!1}}async function rn(){const j=V.value.base_url;if(!j){F("Enter a base URL first","error");return}K.value=!0;try{const xe=await G.post("/api/ollama/probe-models",{base_url:j});ce.value=xe.models||[],ce.value.length?(F(ce.value.length+" model(s) found"),!V.value.model&&ce.value.length&&(V.value.model=ce.value[0].name)):F("No models found at "+j,"error")}catch(xe){F(xe.message||"Could not reach Ollama","error")}finally{K.value=!1}}async function Ss(){try{if(z.value=await G.get("/api/kimi/status"),re.value=!1,z.value.model&&(Le.value=z.value.model),z.value.configured)try{const j=await G.get("/api/kimi/models");ue.value=j.models||[]}catch{ue.value=[]}}catch{re.value=!0}}async function Xn(){_.value=!0;try{const j=await G.post("/api/kimi/reload");F(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await ft()}catch(j){F(j.message||"Reload failed","error")}finally{_.value=!1}}async function Zs(){P.value=!0;try{await G.post("/api/kimi/model",{model:Le.value}),F("Model set to "+Le.value),await ft()}catch(j){F(j.message||"Failed","error")}finally{P.value=!1}}async function Ls(){if(I.value){he();return}I.value=!0;const j=Ju(a.value);try{await G.put("/api/llm/codex/config",j),F("Codex config saved"),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),Tt()])}catch(xe){F(xe.message||"Failed","error");const Ae=JSON.stringify(Ju(a.value))!==JSON.stringify(j);await Promise.all([He({preserveBasic:Ae,preserveAdvanced:!0}),Tt()])}finally{I.value=!1}}async function Pn(){if(I.value)return;I.value=!0;const j=Yu(a.value);try{await G.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(x.value=!1),F("Codex advanced settings saved"),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),Tt(),xt()])}catch(xe){F(xe.message||"Failed","error");const Ae=JSON.stringify(Yu(a.value))!==JSON.stringify(j);await Promise.all([He({preserveBasic:!0,preserveAdvanced:Ae}),Tt(),xt()])}finally{I.value=!1}}async function Kt(){if(U.value){Ve();return}U.value=!0;try{const j=D.value?V.value.api_key:null,xe=Lk(V.value,{includeApiKey:j!==null});await G.put("/api/llm/ollama/config",xe),F("Ollama config saved"),j!==null&&V.value.api_key===j&&(V.value.api_key="",D.value=!1),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),ms()])}catch(j){F(j.message||"Failed","error")}finally{U.value=!1}}async function Hs(){if(!U.value){U.value=!0;try{await G.put("/api/llm/ollama/config",Nk(V.value)),F("Ollama timeout saved"),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),ms()])}catch(j){F(j.message||"Failed","error")}finally{U.value=!1}}}async function as(){if(W.value){et();return}W.value=!0;try{const j=L.value?q.value.api_key:null,xe=Dk(q.value,{includeApiKey:j!==null});await G.put("/api/llm/kimi/config",xe),F("Kimi config saved"),j!==null&&q.value.api_key===j&&(q.value.api_key="",L.value=!1),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),Ss()])}catch(j){F(j.message||"Failed","error")}finally{W.value=!1}}async function nt(){if(!W.value){W.value=!0;try{await G.put("/api/llm/kimi/config",Pk(q.value)),F("Kimi timeout saved"),await Promise.all([He({preserveBasic:!0,preserveAdvanced:!0}),Ss()])}catch(j){F(j.message||"Failed","error")}finally{W.value=!1}}}async function Z(){if(g.value){Ne();return}g.value=!0;try{await G.put("/api/llm/auxiliary/config",v.value),F("Auxiliary config saved"),await He()}catch(j){F(j.message||"Failed","error"),await He()}finally{g.value=!1}}const he=Il(Ls),Ne=Il(Z),Ve=Il(Kt),et=Il(as),Nt=()=>(he.cancel(),Ls()),ea=()=>(Ve.cancel(),Kt()),is=()=>(et.cancel(),as()),Ea=()=>Pn(),zs=()=>Hs(),fi=()=>nt();async function hi(j){const xe=j.account_key+":"+j.model;C.value=xe;try{const Ae=await G.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});F(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await xt()}catch(Ae){F(Ae.message||"Failed to clear clamp","error"),await xt()}finally{C.value=null}}async function Aa(j){try{await G.post("/api/codex/account/"+j+"/activate"),F("Active account switched"),await Tt()}catch(xe){F(xe.message||"Failed","error")}}async function ta(j){ae.value=j;try{await G.post("/api/codex/account/"+j+"/refresh"),F("Token refreshed"),await Tt()}catch(xe){F(xe.message||"Refresh failed","error")}finally{ae.value=null}}function Mn(j,xe){pe.value=j,fe.value=xe||""}async function Fn(j){try{await G.put("/api/codex/account/"+j+"/label",{label:fe.value}),F("Label updated"),pe.value=null,await Tt()}catch(xe){F(xe.message||"Failed","error")}}async function Js(j,xe){if(await Ut({title:"Delete Codex account",message:`Delete ${xe||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+j),F("Deleted. Pool reloaded."),await Tt()}catch(Zt){F(Zt.message||"Failed","error")}}async function cn(){oe.value=!0;try{const j=await G.post("/api/codex/device-code");we.value=j,de.value="pending",Wt(j)}catch(j){F(j.message||"Failed","error")}finally{oe.value=!1}}async function Wt(j){Re={cancelled:!1};const xe=Re;try{const Ae=await G.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(xe.cancelled)return;ge.value=Ae,de.value="success",await ft()}catch(Ae){if(xe.cancelled)return;ke.value=Ae.message||"Device login failed",de.value="error"}}function Ra(){Re&&(Re.cancelled=!0),de.value=null,we.value=null}return Ge(ft),gt(()=>{Re&&(Re.cancelled=!0),he.cancel(),Ne.cancel(),Ve.cancel(),et.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:X,advancedOpen:b,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:k,auxModelOptions:R,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:Ne,ollamaForm:V,kimiForm:q,savingCodex:I,savingOllama:U,savingKimi:W,probingOllama:K,ollamaKeyDirty:D,kimiKeyDirty:L,fetchCodexStatus:Tt,ollamaStatus:le,ollamaStatusLoadFailed:ee,ollamaModels:ce,ollamaSelectedModel:De,reloading:Q,settingModel:be,kimiStatus:z,kimiStatusLoadFailed:re,kimiModels:ue,kimiSelectedModel:Le,reloadingKimi:_,settingKimiModel:P,codexLoading:H,codexError:ie,codexData:se,refreshing:ae,editingLabel:pe,labelValue:fe,contextWindows:S,contextWindowsLoading:w,contextWindowsError:A,contextBudgetRows:B,activeClampRows:E,activeContextBudget:M,clearingClamp:C,contextPolicyDirty:x,deviceState:de,deviceLoading:oe,deviceInfo:we,deviceResult:ge,deviceError:ke,fetchAll:ft,fetchLLMStatus:He,fetchOllamaStatus:ms,fetchKimiStatus:Ss,switchProvider:Ws,reloadOllama:Ht,setOllamaModel:ks,reloadKimi:Xn,setKimiModel:Zs,probeOllamaModels:rn,saveCodexConfig:Ls,saveOllamaConfig:Kt,saveKimiConfig:as,saveCodexAdvancedConfig:Pn,saveOllamaAdvancedConfig:Hs,saveKimiAdvancedConfig:nt,saveCodexConfigDebounced:he,saveOllamaConfigDebounced:Ve,saveKimiConfigDebounced:et,saveCodexConfigNow:Nt,saveOllamaConfigNow:ea,saveKimiConfigNow:is,saveCodexAdvancedConfigNow:Ea,saveOllamaAdvancedConfigNow:zs,saveKimiAdvancedConfigNow:fi,activateAccount:Aa,refreshAccount:ta,startEditLabel:Mn,saveLabel:Fn,deleteAccount:Js,startDeviceLogin:cn,cancelDeviceLogin:Ra,formatSize:me,fetchContextWindows:xt,clearContextClamp:hi,setContextOverride:ye,setContextUtilization:Ie,resetContextOverride:Ze,overrideAboveFloor:ne,formatCount:Se,formatContextCeiling:Oe,formatExpiry:Pe,shortAccountKey:dt,provenanceClass:Ft,formatDensity:ot}}},Qu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Fk(e){return Qu[e]||Qu[(e||"").toLowerCase()]||"text-gray-400"}const $k={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),n=f({}),a=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=J(()=>{var w;return Object.values(((w=i.value)==null?void 0:w.totals)||{}).reduce((A,C)=>A+Number(C||0),0)}),u=f(""),p=f(0),h=f([]),m=J(()=>h.value.map(w=>`${w.label} (${w.path}${w.reason?`: ${w.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let k=null;async function R(){var N;const w=await Promise.allSettled(v.map(B=>G.get(B.path))),A=B=>w[B].status==="fulfilled"?w[B].value:null;t.value=A(0)||{};const C=A(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],n.value=A(2)||{},a.value=A(3)||{},i.value=A(4),l.value=A(5),o.value=A(6),r.value=A(7),c.value=A(8);const x=w.filter(B=>B.status==="rejected");if(h.value=w.flatMap((B,E)=>{var M;return B.status==="rejected"?[{...v[E],reason:((M=B.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===w.length){const B=(N=x[0])==null?void 0:N.reason;u.value=(B==null?void 0:B.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",R()}let g=!1;function b(){g||(g=!0,R(),k||(k=setInterval(R,3e4)))}function S(){g&&(g=!1,k&&(clearInterval(k),k=null))}return Ge(b),hs(b),ns(S),gt(S),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:Fk,formatAgeSeconds:pw}}},Bk=1e4,Xu=3e4;function _i(e,t){return Math.max(0,e-t)}function vr(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const Uk=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],Hk={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),n=f(!1),a=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const L=++p;n.value=!0;try{const I=await G.get("/api/turn-state/turns?limit=100");if(L!==p)return;t.value=I.availability,e.value=I.availability==="available"?I.data:null,s.value=null,a.value=Date.now()}catch(I){if(L!==p)return;s.value=I.message||"Turn-state read failed",I.status===503&&(t.value="unavailable")}L===p&&(n.value=!1)}async function v(){const L=++h;r.value=!0;try{const I=await G.get("/api/turn-state/capacity-breakers");if(L!==h)return;l.value=I.availability,i.value=I.availability==="available"?I.data:null,o.value=null,c.value=Date.now()}catch(I){if(L!==h)return;o.value=I.message||"Breaker read failed",I.status===503&&(l.value="unavailable")}L===h&&(r.value=!1)}function k(){m(),v()}const R=J(()=>e.value!==null&&_i(d.value,a.value)>Xu),y=J(()=>i.value!==null&&_i(d.value,c.value)>Xu),g=J(()=>R.value||y.value),b=J(()=>Math.round(_i(d.value,a.value)/1e3)),S=J(()=>Math.round(_i(d.value,c.value)/1e3));function w(L){return vr(L,d.value/1e3)}function A(L){return Uk[w(L)]}const C=J(()=>{var U;const L=[...((U=e.value)==null?void 0:U.turns)||[]],I=d.value/1e3;return L.sort((W,K)=>vr(W,I)-vr(K,I)||(K.last_progress_at||0)-(W.last_progress_at||0))});function x(L){return L.state==="closed"?"badge-success":L.state==="probing"?"badge-warning":"badge-danger"}function N(L){if(L.state==="closed")return"—";const I=_i(d.value,c.value)/1e3,U=Math.max(0,(L.cooldown_remaining_seconds||0)-I);return U>0?`${Math.ceil(U)}s`:L.state==="probing"?"probe in flight":"probe eligible"}function B(L){if(!L)return"";const I=Math.max(0,Math.round(d.value/1e3-L));if(I<90)return`${I}s ago`;const U=Math.round(I/60);return U<90?`${U}m ago`:`${Math.round(U/60)}h ago`}let E=null,M=null,V=!1;function q(){V||(V=!0,k(),E=setInterval(k,Bk),u=setInterval(()=>{d.value=Date.now()},1e3),M=Ye.onReconnected(k))}function D(){V&&(V=!1,E&&(clearInterval(E),E=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return Ge(q),hs(q),ns(D),gt(D),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:R,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:S,sortedTurns:C,priorityOf:w,priorityBadge:A,breakerBadge:x,cooldownLabel:N,ageLabel:B,fetchTurns:m,fetchBreakers:v,refreshAll:k,arm:q,disarm:D}}},zk={setup(){const e=f(""),t=f(""),s=f(!1),n=f(""),a=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await Ut({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},zm=[{id:"health",label:"Health",component:ak},{id:"resources",label:"Resources",component:ik},{id:"logs",label:"Logs",component:ck},{id:"config",label:"Config",component:_k},{id:"discord",label:"Discord",component:kk},{id:"hosts",label:"Hosts",component:Ck},{id:"host-access",label:"Host Access",component:Tk},{id:"api-tokens",label:"API Tokens",component:Ek},{id:"llm",label:"LLM Config",component:Mk},{id:"internals",label:"Internals",component:$k},{id:"turn-state",label:"Turn State",component:Hk},{id:"update",label:"Update",component:zk}],jk={components:{TabbedPage:Vo},setup(){return{tabs:zm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Ol=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Vk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Ol("Operations","operations","/operations",Nm),...Ol("History","history","/history",Dm),...Ol("Capabilities","capabilities","/capabilities",Pm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Ol("System","system","/system",zm)],bs=Yn({open:!1,query:"",selected:0});function ep(){bs.query="",bs.selected=0,bs.open=!0}function gr(){bs.open=!1}function qk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Gk={setup(){const e=Em(),t=f(null),s=J(()=>{const i=bs.query.trim().toLowerCase();return Vk.map(l=>({...l,_score:qk(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});us(()=>bs.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),us(()=>bs.query,()=>{bs.selected=0});function n(i){gr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),gr();return}if(i.key==="ArrowDown")i.preventDefault(),bs.selected=Math.min(bs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),bs.selected=Math.max(bs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[bs.selected];l&&n(l)}}return{state:bs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:gr}},template:`
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
  `},Xr={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Xr));const Kk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ei("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ei("path",{d:Xr[e.name]||Xr.info})])}},Wk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function tp(e){return[...e.querySelectorAll(Wk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Zk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=tp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||tp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Jk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f([]),a=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=J(()=>{const W=e.value.uptime_seconds||0,K=Math.floor(W/86400),X=Math.floor(W%86400/3600),le=Math.floor(W%3600/60),ee=[];return K>0&&ee.push(`${K}d`),X>0&&ee.push(`${X}h`),(ee.length===0||K===0&&X===0)&&ee.push(`${le}m`),ee.join(" ")}),m=J(()=>{const W=e.value.uptime_seconds||0;return 125.66*(1-Math.min(W/86400,1))}),v=J(()=>{const W=e.value;return[{label:"Guilds",value:W.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:W.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:W.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${W.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:W.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:W.loop_count>0?"text-green-400":"",highlight:W.loop_count>0},{label:"Agents",value:W.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:W.agent_count>0?`${W.agent_count} total`:"",subColor:"text-gray-500",highlight:(W.agent_running??0)>0},{label:"Processes",value:W.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:W.process_count>0?`${W.process_count} total`:"",subColor:"text-gray-500",highlight:(W.process_running??0)>0},{label:"Schedules",value:W.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(W.schedule_failing>0?`${W.schedule_failing} failing`:"")+(W.schedule_failing>0&&W.schedule_paused>0?", ":"")+(W.schedule_paused>0?`${W.schedule_paused} paused`:"")||void 0,subColor:W.schedule_failing>0?"text-red-400":"text-yellow-400",color:W.schedule_failing>0?"text-red-400":"",highlight:W.schedule_failing>0},{label:"Users",value:W.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),k=J(()=>{const W=e.value,K=[];return K.push({label:"Bot",status:W.status==="online"?"ok":"warn",detail:W.status==="online"?"Online":"Starting"}),(W.schedule_failing||0)>0?K.push({label:"Schedules",status:"error",detail:`${W.schedule_failing} failing`}):(W.schedule_count||0)>0&&K.push({label:"Schedules",status:"ok",detail:`${W.schedule_count} configured`}),(W.loop_count||0)>0&&K.push({label:"Loops",status:"ok",detail:`${W.loop_count} active`}),(W.agent_running||0)>0&&K.push({label:"Agents",status:"ok",detail:`${W.agent_running} running`}),(W.process_running||0)>0&&K.push({label:"Processes",status:"ok",detail:`${W.process_running} running`}),K});async function R(){try{e.value=await G.get("/api/status"),s.value=null}catch(W){s.value=W.message}finally{t.value=!1}}let y=0,g=0,b=0,S=0;function w(W,K){const X=new Set;return[...K,...W].filter(le=>{const ee=le._hmac||JSON.stringify([le.timestamp,le.tool_name,le.user_id,le.result_summary,le.error]);return X.has(ee)?!1:(X.add(ee),!0)})}async function A(){const W=++y,K=b;a.value=!0;try{const X=await G.get("/api/audit?limit=10");if(W!==y)return;const le=K===b?[]:n.value.filter(ee=>(ee._liveEpoch||0)>K);n.value=w(X,le).slice(0,10),c.value=le.length}catch{}W===y&&(a.value=!1)}async function C(){const W=++g,K=S;l.value=!0;try{const X=await G.get("/api/audit?error_only=1&limit=5");if(W!==g)return;const le=K===S?[]:i.value.filter(ee=>(ee._liveErrorEpoch||0)>K);i.value=w(X,le).slice(0,5),o.value=!1}catch{if(W!==g)return;o.value=K===S||i.value.length===0}W===g&&(l.value=!1)}async function x(){try{const W=await G.get("/api/knowledge");d.value=(Array.isArray(W)?W:[]).reduce((K,X)=>K+(X.chunks||0),0)}catch{d.value=null}}async function N(){try{const W=await G.get("/api/agents");r.value=W.filter(K=>K.status==="running")}catch{}}async function B(){u.value={...u.value,reload:!0};try{await G.post("/api/reload"),_e.success("Config reloaded")}catch(W){_e.error(W.message)}u.value={...u.value,reload:!1}}async function E(){if(!await Ut({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const K=e.value.session_count;e.value={...e.value,session_count:0};try{const X=await G.post("/api/sessions/clear-all");_e.success(`Cleared ${X.count} session${X.count!==1?"s":""}`),await R()}catch(X){e.value={...e.value,session_count:K},_e.error(X.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await Ut({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const K=e.value.loop_count;e.value={...e.value,loop_count:0};try{const X=await G.post("/api/loops/stop-all");_e.success(X.result),await R()}catch(X){e.value={...e.value,loop_count:K},_e.error(X.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,R(),A(),C(),N()}let q=null,D=null,L=null;function I(W){if(W.payload&&W.payload.tool_name){b+=1;const K={...W.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(K),n.value.length>10&&n.value.pop(),c.value++,K.error&&(S+=1,K._liveErrorEpoch=S,o.value=!1,i.value.unshift(K),i.value.length>5&&i.value.pop()),setTimeout(()=>{K._isNew=!1},1500),clearTimeout(L),L=setTimeout(()=>{c.value=0},1e4)}}let U=null;return Ge(async()=>{await Promise.all([R(),A(),C(),N(),x()]),q=setInterval(R,15e3),D=setInterval(N,1e4),Ye.subscribe("events",I),U=Ye.onReconnected(()=>{A(),C()})}),gt(()=>{q&&clearInterval(q),D&&clearInterval(D),clearTimeout(L),Ye.unsubscribe("events",I),U&&(U(),U=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:k,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:A,fetchErrors:C,fetchStatus:R,onEvent:I,formatTime:uw,formatDuration:ci,retry:V,reloadConfig:B,clearSessions:E,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function sp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Yk(e){if(Array.isArray(e))return e}function Qk(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function Xk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function eS(e,t){return Yk(e)||Qk(e,t)||tS(e,t)||Xk()}function tS(e,t){if(e){if(typeof e=="string")return sp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?sp(e,t):void 0}}const jm=Object.entries,np=Object.setPrototypeOf,sS=Object.isFrozen,nS=Object.getPrototypeOf,aS=Object.getOwnPropertyDescriptor;let fs=Object.freeze,Us=Object.seal,Ba=Object.create,Vm=typeof Reflect<"u"&&Reflect,ec=Vm.apply,tc=Vm.construct;fs||(fs=function(t){return t});Us||(Us=function(t){return t});ec||(ec=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});tc||(tc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const mn=Lt(Array.prototype.forEach),iS=Lt(Array.prototype.lastIndexOf),ap=Lt(Array.prototype.pop),Da=Lt(Array.prototype.push),lS=Lt(Array.prototype.splice),os=Array.isArray,Ri=Lt(String.prototype.toLowerCase),br=Lt(String.prototype.toString),ip=Lt(String.prototype.match),Pa=Lt(String.prototype.replace),lp=Lt(String.prototype.indexOf),oS=Lt(String.prototype.trim),rS=Lt(Number.prototype.toString),cS=Lt(Boolean.prototype.toString),op=typeof BigInt>"u"?null:Lt(BigInt.prototype.toString),rp=typeof Symbol>"u"?null:Lt(Symbol.prototype.toString),wt=Lt(Object.prototype.hasOwnProperty),wi=Lt(Object.prototype.toString),zt=Lt(RegExp.prototype.test),ia=dS(TypeError);function Lt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return ec(e,t,n)}}function dS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return tc(e,s)}}function je(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ri;if(np&&np(e,null),!os(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(sS(t)||(t[n]=i),a=i)}e[a]=!0}return e}function uS(e){for(let t=0;t<e.length;t++)wt(e,t)||(e[t]=null);return e}function Yt(e){const t=Ba(null);for(const n of jm(e)){var s=eS(n,2);const a=s[0],i=s[1];wt(e,a)&&(os(i)?t[a]=uS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Yt(i):t[a]=i)}return t}function pS(e){switch(typeof e){case"string":return e;case"number":return rS(e);case"boolean":return cS(e);case"bigint":return op?op(e):"0";case"symbol":return rp?rp(e):"Symbol()";case"undefined":return wi(e);case"function":case"object":{if(e===null)return wi(e);const t=e,s=Xs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:wi(n)}return wi(e)}default:return wi(e)}}function Xs(e,t){for(;e!==null;){const n=aS(e,t);if(n){if(n.get)return Lt(n.get);if(typeof n.value=="function")return Lt(n.value)}e=nS(e)}function s(){return null}return s}function fS(e){try{return zt(e,""),!0}catch{return!1}}const cp=fs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),yr=fs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),xr=fs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),hS=fs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),_r=fs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),mS=fs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),dp=fs(["#text"]),up=fs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),wr=fs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),pp=fs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Ll=fs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),vS=Us(/{{[\w\W]*|^[\w\W]*}}/g),gS=Us(/<%[\w\W]*|^[\w\W]*%>/g),bS=Us(/\${[\w\W]*/g),yS=Us(/^data-[\-\w.\u00B7-\uFFFF]+$/),xS=Us(/^aria-[\-\w]+$/),fp=Us(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),_S=Us(/^(?:\w+script|data):/i),wS=Us(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),kS=Us(/^html$/i),SS=Us(/^[a-z][.\w]*(-[.\w]+)+$/i),Ys={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},TS=function(){return typeof window>"u"?null:window},CS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},hp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function qm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:TS();const t=Te=>qm(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ys.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=Xs(p,"cloneNode"),m=Xs(p,"remove"),v=Xs(p,"nextSibling"),k=Xs(p,"childNodes"),R=Xs(p,"parentNode"),y=Xs(p,"shadowRoot"),g=Xs(p,"attributes"),b=l&&l.prototype?Xs(l.prototype,"nodeType"):null,S=l&&l.prototype?Xs(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let w,A="",C,x=!1,N=0;const B=function(){if(N>0)throw ia('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},E=function(O){B(),N++;try{return w.createHTML(O)}finally{N--}},M=function(O){B(),N++;try{return w.createScriptURL(O)}finally{N--}},V=function(){return x||(C=CS(u,a),x=!0),C},q=s,D=q.implementation,L=q.createNodeIterator,I=q.createDocumentFragment,U=q.getElementsByTagName,W=n.importNode;let K=hp();t.isSupported=typeof jm=="function"&&typeof R=="function"&&D&&D.createHTMLDocument!==void 0;const X=vS,le=gS,ee=bS,ce=yS,De=xS,Q=_S,be=wS,z=SS;let re=fp,ue=null;const Le=je({},[...cp,...yr,...xr,..._r,...dp]);let _=null;const P=je({},[...up,...wr,...pp,...Ll]);let H=Object.seal(Ba(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ie=null,se=null;const ae=Object.seal(Ba(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let pe=!0,fe=!0,de=!1,oe=!0,we=!1,ge=!0,ke=!1,Re=!1,F=!1,me=!1,Se=!1,Oe=!1,Pe=!0,dt=!1;const ot="user-content-";let Ft=!0,ne=!1,ye={},Ie=null;const Ze=je({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ft=null;const He=je({},["audio","video","img","source","image","track"]);let xt=null;const ms=je({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Tt="http://www.w3.org/1998/Math/MathML",Ws="http://www.w3.org/2000/svg",Ht="http://www.w3.org/1999/xhtml";let ks=Ht,rn=!1,Ss=null;const Xn=je({},[Tt,Ws,Ht],br);let Zs=je({},["mi","mo","mn","ms","mtext"]),Ls=je({},["annotation-xml"]);const Pn=je({},["title","style","font","a","script"]);let Kt=null;const Hs=["application/xhtml+xml","text/html"],as="text/html";let nt=null,Z=null;const he=s.createElement("form"),Ne=function(O){return O instanceof RegExp||O instanceof Function},Ve=function(){let O=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Z&&Z===O)return;(!O||typeof O!="object")&&(O={}),O=Yt(O),Kt=Hs.indexOf(O.PARSER_MEDIA_TYPE)===-1?as:O.PARSER_MEDIA_TYPE,nt=Kt==="application/xhtml+xml"?br:Ri,ue=wt(O,"ALLOWED_TAGS")&&os(O.ALLOWED_TAGS)?je({},O.ALLOWED_TAGS,nt):Le,_=wt(O,"ALLOWED_ATTR")&&os(O.ALLOWED_ATTR)?je({},O.ALLOWED_ATTR,nt):P,Ss=wt(O,"ALLOWED_NAMESPACES")&&os(O.ALLOWED_NAMESPACES)?je({},O.ALLOWED_NAMESPACES,br):Xn,xt=wt(O,"ADD_URI_SAFE_ATTR")&&os(O.ADD_URI_SAFE_ATTR)?je(Yt(ms),O.ADD_URI_SAFE_ATTR,nt):ms,ft=wt(O,"ADD_DATA_URI_TAGS")&&os(O.ADD_DATA_URI_TAGS)?je(Yt(He),O.ADD_DATA_URI_TAGS,nt):He,Ie=wt(O,"FORBID_CONTENTS")&&os(O.FORBID_CONTENTS)?je({},O.FORBID_CONTENTS,nt):Ze,ie=wt(O,"FORBID_TAGS")&&os(O.FORBID_TAGS)?je({},O.FORBID_TAGS,nt):Yt({}),se=wt(O,"FORBID_ATTR")&&os(O.FORBID_ATTR)?je({},O.FORBID_ATTR,nt):Yt({}),ye=wt(O,"USE_PROFILES")?O.USE_PROFILES&&typeof O.USE_PROFILES=="object"?Yt(O.USE_PROFILES):O.USE_PROFILES:!1,pe=O.ALLOW_ARIA_ATTR!==!1,fe=O.ALLOW_DATA_ATTR!==!1,de=O.ALLOW_UNKNOWN_PROTOCOLS||!1,oe=O.ALLOW_SELF_CLOSE_IN_ATTR!==!1,we=O.SAFE_FOR_TEMPLATES||!1,ge=O.SAFE_FOR_XML!==!1,ke=O.WHOLE_DOCUMENT||!1,me=O.RETURN_DOM||!1,Se=O.RETURN_DOM_FRAGMENT||!1,Oe=O.RETURN_TRUSTED_TYPE||!1,F=O.FORCE_BODY||!1,Pe=O.SANITIZE_DOM!==!1,dt=O.SANITIZE_NAMED_PROPS||!1,Ft=O.KEEP_CONTENT!==!1,ne=O.IN_PLACE||!1,re=fS(O.ALLOWED_URI_REGEXP)?O.ALLOWED_URI_REGEXP:fp,ks=typeof O.NAMESPACE=="string"?O.NAMESPACE:Ht,Zs=wt(O,"MATHML_TEXT_INTEGRATION_POINTS")&&O.MATHML_TEXT_INTEGRATION_POINTS&&typeof O.MATHML_TEXT_INTEGRATION_POINTS=="object"?Yt(O.MATHML_TEXT_INTEGRATION_POINTS):je({},["mi","mo","mn","ms","mtext"]),Ls=wt(O,"HTML_INTEGRATION_POINTS")&&O.HTML_INTEGRATION_POINTS&&typeof O.HTML_INTEGRATION_POINTS=="object"?Yt(O.HTML_INTEGRATION_POINTS):je({},["annotation-xml"]);const te=wt(O,"CUSTOM_ELEMENT_HANDLING")&&O.CUSTOM_ELEMENT_HANDLING&&typeof O.CUSTOM_ELEMENT_HANDLING=="object"?Yt(O.CUSTOM_ELEMENT_HANDLING):Ba(null);if(H=Ba(null),wt(te,"tagNameCheck")&&Ne(te.tagNameCheck)&&(H.tagNameCheck=te.tagNameCheck),wt(te,"attributeNameCheck")&&Ne(te.attributeNameCheck)&&(H.attributeNameCheck=te.attributeNameCheck),wt(te,"allowCustomizedBuiltInElements")&&typeof te.allowCustomizedBuiltInElements=="boolean"&&(H.allowCustomizedBuiltInElements=te.allowCustomizedBuiltInElements),we&&(fe=!1),Se&&(me=!0),ye&&(ue=je({},dp),_=Ba(null),ye.html===!0&&(je(ue,cp),je(_,up)),ye.svg===!0&&(je(ue,yr),je(_,wr),je(_,Ll)),ye.svgFilters===!0&&(je(ue,xr),je(_,wr),je(_,Ll)),ye.mathMl===!0&&(je(ue,_r),je(_,pp),je(_,Ll))),ae.tagCheck=null,ae.attributeCheck=null,wt(O,"ADD_TAGS")&&(typeof O.ADD_TAGS=="function"?ae.tagCheck=O.ADD_TAGS:os(O.ADD_TAGS)&&(ue===Le&&(ue=Yt(ue)),je(ue,O.ADD_TAGS,nt))),wt(O,"ADD_ATTR")&&(typeof O.ADD_ATTR=="function"?ae.attributeCheck=O.ADD_ATTR:os(O.ADD_ATTR)&&(_===P&&(_=Yt(_)),je(_,O.ADD_ATTR,nt))),wt(O,"ADD_URI_SAFE_ATTR")&&os(O.ADD_URI_SAFE_ATTR)&&je(xt,O.ADD_URI_SAFE_ATTR,nt),wt(O,"FORBID_CONTENTS")&&os(O.FORBID_CONTENTS)&&(Ie===Ze&&(Ie=Yt(Ie)),je(Ie,O.FORBID_CONTENTS,nt)),wt(O,"ADD_FORBID_CONTENTS")&&os(O.ADD_FORBID_CONTENTS)&&(Ie===Ze&&(Ie=Yt(Ie)),je(Ie,O.ADD_FORBID_CONTENTS,nt)),Ft&&(ue["#text"]=!0),ke&&je(ue,["html","head","body"]),ue.table&&(je(ue,["tbody"]),delete ie.tbody),O.TRUSTED_TYPES_POLICY){if(typeof O.TRUSTED_TYPES_POLICY.createHTML!="function")throw ia('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof O.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ia('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ve=w;w=O.TRUSTED_TYPES_POLICY;try{A=E("")}catch(Me){throw w=ve,Me}}else O.TRUSTED_TYPES_POLICY===null?(w=void 0,A=""):(w===void 0&&(w=V()),w&&typeof A=="string"&&(A=E("")));(K.uponSanitizeElement.length>0||K.uponSanitizeAttribute.length>0)&&ue===Le&&(ue=Yt(ue)),K.uponSanitizeAttribute.length>0&&_===P&&(_=Yt(_)),fs&&fs(O),Z=O},et=je({},[...yr,...xr,...hS]),Nt=je({},[..._r,...mS]),ea=function(O){let te=R(O);(!te||!te.tagName)&&(te={namespaceURI:ks,tagName:"template"});const ve=Ri(O.tagName),Me=Ri(te.tagName);return Ss[O.namespaceURI]?O.namespaceURI===Ws?te.namespaceURI===Ht?ve==="svg":te.namespaceURI===Tt?ve==="svg"&&(Me==="annotation-xml"||Zs[Me]):!!et[ve]:O.namespaceURI===Tt?te.namespaceURI===Ht?ve==="math":te.namespaceURI===Ws?ve==="math"&&Ls[Me]:!!Nt[ve]:O.namespaceURI===Ht?te.namespaceURI===Ws&&!Ls[Me]||te.namespaceURI===Tt&&!Zs[Me]?!1:!Nt[ve]&&(Pn[ve]||!et[ve]):!!(Kt==="application/xhtml+xml"&&Ss[O.namespaceURI]):!1},is=function(O){Da(t.removed,{element:O});try{R(O).removeChild(O)}catch{if(m(O),!R(O))throw ia("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Ea=function(O){const te=k?k(O):O.childNodes;if(te){const Me=[];mn(te,$e=>{Da(Me,$e)}),mn(Me,$e=>{try{m($e)}catch{}})}const ve=g?g(O):null;if(ve)for(let Me=ve.length-1;Me>=0;--Me){const $e=ve[Me],Ue=$e&&$e.name;if(typeof Ue=="string")try{O.removeAttribute(Ue)}catch{}}},zs=function(O,te){try{Da(t.removed,{attribute:te.getAttributeNode(O),from:te})}catch{Da(t.removed,{attribute:null,from:te})}if(te.removeAttribute(O),O==="is")if(me||Se)try{is(te)}catch{}else try{te.setAttribute(O,"")}catch{}},fi=function(O){const te=g?g(O):O.attributes;if(te)for(let ve=te.length-1;ve>=0;--ve){const Me=te[ve],$e=Me&&Me.name;if(!(typeof $e!="string"||_[nt($e)]))try{O.removeAttribute($e)}catch{}}},hi=function(O){const te=[O];for(;te.length>0;){const ve=te.pop();(b?b(ve):ve.nodeType)===Ys.element&&fi(ve);const $e=k?k(ve):ve.childNodes;if($e)for(let Ue=$e.length-1;Ue>=0;--Ue)te.push($e[Ue])}},Aa=function(O){let te=null,ve=null;if(F)O="<remove></remove>"+O;else{const Ue=ip(O,/^[\r\n\t ]+/);ve=Ue&&Ue[0]}Kt==="application/xhtml+xml"&&ks===Ht&&(O='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+O+"</body></html>");const Me=w?E(O):O;if(ks===Ht)try{te=new d().parseFromString(Me,Kt)}catch{}if(!te||!te.documentElement){te=D.createDocument(ks,"template",null);try{te.documentElement.innerHTML=rn?A:Me}catch{}}const $e=te.body||te.documentElement;return O&&ve&&$e.insertBefore(s.createTextNode(ve),$e.childNodes[0]||null),ks===Ht?U.call(te,ke?"html":"body")[0]:ke?te.documentElement:$e},ta=function(O){return L.call(O.ownerDocument||O,O,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Mn=function(O){var te,ve;O.normalize();const Me=L.call(O.ownerDocument||O,O,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let $e=Me.nextNode();for(;$e;){let bt=$e.data;mn([X,le,ee],at=>{bt=Pa(bt,at," ")}),$e.data=bt,$e=Me.nextNode()}const Ue=(te=(ve=O.querySelectorAll)===null||ve===void 0?void 0:ve.call(O,"template"))!==null&&te!==void 0?te:[];mn(Array.from(Ue),bt=>{Js(bt.content)&&Mn(bt.content)})},Fn=function(O){const te=S?S(O):null;return typeof te!="string"||nt(te)!=="form"?!1:typeof O.nodeName!="string"||typeof O.textContent!="string"||typeof O.removeChild!="function"||O.attributes!==g(O)||typeof O.removeAttribute!="function"||typeof O.setAttribute!="function"||typeof O.namespaceURI!="string"||typeof O.insertBefore!="function"||typeof O.hasChildNodes!="function"||O.nodeType!==b(O)||O.childNodes!==k(O)},Js=function(O){if(!b||typeof O!="object"||O===null)return!1;try{return b(O)===Ys.documentFragment}catch{return!1}},cn=function(O){if(!b||typeof O!="object"||O===null)return!1;try{return typeof b(O)=="number"}catch{return!1}};function Wt(Te,O,te){mn(Te,ve=>{ve.call(t,O,te,Z)})}const Ra=function(O){let te=null;if(Wt(K.beforeSanitizeElements,O,null),Fn(O))return is(O),!0;const ve=nt(S?S(O):O.nodeName);if(Wt(K.uponSanitizeElement,O,{tagName:ve,allowedTags:ue}),ge&&O.hasChildNodes()&&!cn(O.firstElementChild)&&zt(/<[/\w!]/g,O.innerHTML)&&zt(/<[/\w!]/g,O.textContent)||ge&&O.namespaceURI===Ht&&ve==="style"&&cn(O.firstElementChild)||O.nodeType===Ys.progressingInstruction||ge&&O.nodeType===Ys.comment&&zt(/<[/\w]/g,O.data))return is(O),!0;if(ie[ve]||!(ae.tagCheck instanceof Function&&ae.tagCheck(ve))&&!ue[ve]){if(!ie[ve]&&Ae(ve)&&(H.tagNameCheck instanceof RegExp&&zt(H.tagNameCheck,ve)||H.tagNameCheck instanceof Function&&H.tagNameCheck(ve)))return!1;if(Ft&&!Ie[ve]){const $e=R(O),Ue=k(O);if(Ue&&$e){const bt=Ue.length;for(let at=bt-1;at>=0;--at){const ht=ne?Ue[at]:h(Ue[at],!0);$e.insertBefore(ht,v(O))}}}return is(O),!0}return(b?b(O):O.nodeType)===Ys.element&&!ea(O)||(ve==="noscript"||ve==="noembed"||ve==="noframes")&&zt(/<\/no(script|embed|frames)/i,O.innerHTML)?(is(O),!0):(we&&O.nodeType===Ys.text&&(te=O.textContent,mn([X,le,ee],$e=>{te=Pa(te,$e," ")}),O.textContent!==te&&(Da(t.removed,{element:O.cloneNode()}),O.textContent=te)),Wt(K.afterSanitizeElements,O,null),!1)},j=function(O,te,ve){if(se[te]||Pe&&(te==="id"||te==="name")&&(ve in s||ve in he))return!1;const Me=_[te]||ae.attributeCheck instanceof Function&&ae.attributeCheck(te,O);if(!(fe&&!se[te]&&zt(ce,te))){if(!(pe&&zt(De,te))){if(!Me||se[te]){if(!(Ae(O)&&(H.tagNameCheck instanceof RegExp&&zt(H.tagNameCheck,O)||H.tagNameCheck instanceof Function&&H.tagNameCheck(O))&&(H.attributeNameCheck instanceof RegExp&&zt(H.attributeNameCheck,te)||H.attributeNameCheck instanceof Function&&H.attributeNameCheck(te,O))||te==="is"&&H.allowCustomizedBuiltInElements&&(H.tagNameCheck instanceof RegExp&&zt(H.tagNameCheck,ve)||H.tagNameCheck instanceof Function&&H.tagNameCheck(ve))))return!1}else if(!xt[te]){if(!zt(re,Pa(ve,be,""))){if(!((te==="src"||te==="xlink:href"||te==="href")&&O!=="script"&&lp(ve,"data:")===0&&ft[O])){if(!(de&&!zt(Q,Pa(ve,be,"")))){if(ve)return!1}}}}}}return!0},xe=je({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ae=function(O){return!xe[Ri(O)]&&zt(z,O)},Zt=function(O){Wt(K.beforeSanitizeAttributes,O,null);const te=O.attributes;if(!te||Fn(O))return;const ve={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:_,forceKeepAttr:void 0};let Me=te.length;for(;Me--;){const $e=te[Me],Ue=$e.name,bt=$e.namespaceURI,at=$e.value,ht=nt(Ue),T=at;let $=Ue==="value"?T:oS(T);if(ve.attrName=ht,ve.attrValue=$,ve.keepAttr=!0,ve.forceKeepAttr=void 0,Wt(K.uponSanitizeAttribute,O,ve),$=ve.attrValue,dt&&(ht==="id"||ht==="name")&&lp($,ot)!==0&&(zs(Ue,O),$=ot+$),ge&&zt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,$)){zs(Ue,O);continue}if(ht==="attributename"&&ip($,"href")){zs(Ue,O);continue}if(ve.forceKeepAttr)continue;if(!ve.keepAttr){zs(Ue,O);continue}if(!oe&&zt(/\/>/i,$)){zs(Ue,O);continue}we&&mn([X,le,ee],Ee=>{$=Pa($,Ee," ")});const Y=nt(O.nodeName);if(!j(Y,ht,$)){zs(Ue,O);continue}if(w&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!bt)switch(u.getAttributeType(Y,ht)){case"TrustedHTML":{$=E($);break}case"TrustedScriptURL":{$=M($);break}}if($!==T)try{bt?O.setAttributeNS(bt,Ue,$):O.setAttribute(Ue,$),Fn(O)?is(O):ap(t.removed)}catch{zs(Ue,O)}}Wt(K.afterSanitizeAttributes,O,null)},dn=function(O){let te=null;const ve=ta(O);for(Wt(K.beforeSanitizeShadowDOM,O,null);te=ve.nextNode();)if(Wt(K.uponSanitizeShadowNode,te,null),Ra(te),Zt(te),Js(te.content)&&dn(te.content),(b?b(te):te.nodeType)===Ys.element){const $e=y?y(te):te.shadowRoot;Js($e)&&($n($e),dn($e))}Wt(K.afterSanitizeShadowDOM,O,null)},$n=function(O){const te=[{node:O,shadow:null}];for(;te.length>0;){const ve=te.pop();if(ve.shadow){dn(ve.shadow);continue}const Me=ve.node,Ue=(b?b(Me):Me.nodeType)===Ys.element,bt=k?k(Me):Me.childNodes;if(bt)for(let at=bt.length-1;at>=0;--at)te.push({node:bt[at],shadow:null});if(Ue){const at=S?S(Me):null;if(typeof at=="string"&&nt(at)==="template"){const ht=Me.content;Js(ht)&&te.push({node:ht,shadow:null})}}if(Ue){const at=y?y(Me):Me.shadowRoot;Js(at)&&te.push({node:null,shadow:at},{node:at,shadow:null})}}};return t.sanitize=function(Te){let O=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},te=null,ve=null,Me=null,$e=null;if(rn=!Te,rn&&(Te="<!-->"),typeof Te!="string"&&!cn(Te)&&(Te=pS(Te),typeof Te!="string"))throw ia("dirty is not a string, aborting");if(!t.isSupported)return Te;Re||Ve(O),t.removed=[];const Ue=ne&&typeof Te!="string"&&cn(Te);if(Ue){const ht=S?S(Te):Te.nodeName;if(typeof ht=="string"){const T=nt(ht);if(!ue[T]||ie[T])throw ia("root node is forbidden and cannot be sanitized in-place")}if(Fn(Te))throw ia("root node is clobbered and cannot be sanitized in-place");try{$n(Te)}catch(T){throw Ea(Te),T}}else if(cn(Te))te=Aa("<!---->"),ve=te.ownerDocument.importNode(Te,!0),ve.nodeType===Ys.element&&ve.nodeName==="BODY"||ve.nodeName==="HTML"?te=ve:te.appendChild(ve),$n(ve);else{if(!me&&!we&&!ke&&Te.indexOf("<")===-1)return w&&Oe?E(Te):Te;if(te=Aa(Te),!te)return me?null:Oe?A:""}te&&F&&is(te.firstChild);const bt=ta(Ue?Te:te);try{for(;Me=bt.nextNode();)Ra(Me),Zt(Me),Js(Me.content)&&dn(Me.content)}catch(ht){throw Ue&&Ea(Te),ht}if(Ue)return mn(t.removed,ht=>{ht.element&&hi(ht.element)}),we&&Mn(Te),Te;if(me){if(we&&Mn(te),Se)for($e=I.call(te.ownerDocument);te.firstChild;)$e.appendChild(te.firstChild);else $e=te;return(_.shadowroot||_.shadowrootmode)&&($e=W.call(n,$e,!0)),$e}let at=ke?te.outerHTML:te.innerHTML;return ke&&ue["!doctype"]&&te.ownerDocument&&te.ownerDocument.doctype&&te.ownerDocument.doctype.name&&zt(kS,te.ownerDocument.doctype.name)&&(at="<!DOCTYPE "+te.ownerDocument.doctype.name+`>
`+at),we&&mn([X,le,ee],ht=>{at=Pa(at,ht," ")}),w&&Oe?E(at):at},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ve(Te),Re=!0},t.clearConfig=function(){Z=null,Re=!1,w=C,A=""},t.isValidAttribute=function(Te,O,te){Z||Ve({});const ve=nt(Te),Me=nt(O);return j(ve,Me,te)},t.addHook=function(Te,O){typeof O=="function"&&Da(K[Te],O)},t.removeHook=function(Te,O){if(O!==void 0){const te=iS(K[Te],O);return te===-1?void 0:lS(K[Te],te,1)[0]}return ap(K[Te])},t.removeHooks=function(Te){K[Te]=[]},t.removeAllHooks=function(){K=hp()},t}var mp=qm();function ld(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ca=ld();function Gm(e){Ca=e}var Bi={exec:()=>null};function lt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ds.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var ds={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},ES=/^(?:[ \t]*(?:\n|$))+/,AS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,RS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,ml=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,IS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,od=/(?:[*+-]|\d{1,9}[.)])/,Km=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Wm=lt(Km).replace(/bull/g,od).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),OS=lt(Km).replace(/bull/g,od).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),rd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,LS=/^[^\n]+/,cd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,NS=lt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",cd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),DS=lt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,od).getRegex(),Go="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",dd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,PS=lt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",dd).replace("tag",Go).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Zm=lt(rd).replace("hr",ml).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Go).getRegex(),MS=lt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Zm).getRegex(),ud={blockquote:MS,code:AS,def:NS,fences:RS,heading:IS,hr:ml,html:PS,lheading:Wm,list:DS,newline:ES,paragraph:Zm,table:Bi,text:LS},vp=lt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",ml).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Go).getRegex(),FS={...ud,lheading:OS,table:vp,paragraph:lt(rd).replace("hr",ml).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",vp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Go).getRegex()},$S={...ud,html:lt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",dd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Bi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:lt(rd).replace("hr",ml).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Wm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},BS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,US=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Jm=/^( {2,}|\\)\n(?!\s*$)/,HS=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Ko=/[\p{P}\p{S}]/u,pd=/[\s\p{P}\p{S}]/u,Ym=/[^\s\p{P}\p{S}]/u,zS=lt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,pd).getRegex(),Qm=/(?!~)[\p{P}\p{S}]/u,jS=/(?!~)[\s\p{P}\p{S}]/u,VS=/(?:[^\s\p{P}\p{S}]|~)/u,qS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Xm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,GS=lt(Xm,"u").replace(/punct/g,Ko).getRegex(),KS=lt(Xm,"u").replace(/punct/g,Qm).getRegex(),ev="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",WS=lt(ev,"gu").replace(/notPunctSpace/g,Ym).replace(/punctSpace/g,pd).replace(/punct/g,Ko).getRegex(),ZS=lt(ev,"gu").replace(/notPunctSpace/g,VS).replace(/punctSpace/g,jS).replace(/punct/g,Qm).getRegex(),JS=lt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Ym).replace(/punctSpace/g,pd).replace(/punct/g,Ko).getRegex(),YS=lt(/\\(punct)/,"gu").replace(/punct/g,Ko).getRegex(),QS=lt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),XS=lt(dd).replace("(?:-->|$)","-->").getRegex(),e1=lt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",XS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),mo=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,t1=lt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",mo).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),tv=lt(/^!?\[(label)\]\[(ref)\]/).replace("label",mo).replace("ref",cd).getRegex(),sv=lt(/^!?\[(ref)\](?:\[\])?/).replace("ref",cd).getRegex(),s1=lt("reflink|nolink(?!\\()","g").replace("reflink",tv).replace("nolink",sv).getRegex(),fd={_backpedal:Bi,anyPunctuation:YS,autolink:QS,blockSkip:qS,br:Jm,code:US,del:Bi,emStrongLDelim:GS,emStrongRDelimAst:WS,emStrongRDelimUnd:JS,escape:BS,link:t1,nolink:sv,punctuation:zS,reflink:tv,reflinkSearch:s1,tag:e1,text:HS,url:Bi},n1={...fd,link:lt(/^!?\[(label)\]\((.*?)\)/).replace("label",mo).getRegex(),reflink:lt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",mo).getRegex()},sc={...fd,emStrongRDelimAst:ZS,emStrongLDelim:KS,url:lt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},a1={...sc,br:lt(Jm).replace("{2,}","*").getRegex(),text:lt(sc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Nl={normal:ud,gfm:FS,pedantic:$S},ki={normal:fd,gfm:sc,breaks:a1,pedantic:n1},i1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},gp=e=>i1[e];function en(e,t){if(t){if(ds.escapeTest.test(e))return e.replace(ds.escapeReplace,gp)}else if(ds.escapeTestNoEncode.test(e))return e.replace(ds.escapeReplaceNoEncode,gp);return e}function bp(e){try{e=encodeURI(e).replace(ds.percentDecode,"%")}catch{return null}return e}function yp(e,t){var i;const s=e.replace(ds.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(ds.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(ds.slashPipe,"|");return n}function Si(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function l1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function xp(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function o1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var vo=class{constructor(e){ut(this,"options");ut(this,"rules");ut(this,"lexer");this.options=e||Ca}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Si(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=o1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Si(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Si(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Si(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,n=n.substring(0,n.length-h.raw.length)+v.raw,a=a.substring(0,a.length-h.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,m=h.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,n=n.substring(0,n.length-p.raw.length)+v.raw,a=a.substring(0,a.length-h.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const R=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),S=this.rules.other.htmlBeginRegex(m);for(;e;){const w=e.split(`
`,1)[0];let A;if(p=w,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),A=p):A=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||S.test(p)||R.test(p)||y.test(p))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+A.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=w+`
`,e=e.substring(w.length+1),u=A.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,k;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(k=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:k,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=yp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(yp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Si(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=l1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),xp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return xp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},kn=class nc{constructor(t){ut(this,"tokens");ut(this,"options");ut(this,"state");ut(this,"tokenizer");ut(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ca,this.options.tokenizer=this.options.tokenizer||new vo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ds,block:Nl.normal,inline:ki.normal};this.options.pedantic?(s.block=Nl.pedantic,s.inline=ki.pedantic):this.options.gfm&&(s.block=Nl.gfm,this.options.breaks?s.inline=ki.breaks:s.inline=ki.gfm),this.tokenizer.rules=s}static get rules(){return{block:Nl,inline:ki}}static lex(t,s){return new nc(s).lex(t)}static lexInline(t,s){return new nc(s).inlineTokens(t)}lex(t){t=t.replace(ds.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(ds.tabCharGlobal,"    ").replace(ds.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},go=class{constructor(e){ut(this,"options");ut(this,"parser");this.options=e||Ca}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(ds.notSpaceStart))==null?void 0:i[0],a=e.replace(ds.endingNewline,"")+`
`;return n?'<pre><code class="language-'+en(n)+'">'+(s?a:en(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:en(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+en(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${en(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=bp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+en(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=bp(e);if(a===null)return en(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${en(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:en(e.text)}},hd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Sn=class ac{constructor(t){ut(this,"options");ut(this,"renderer");ut(this,"textRenderer");this.options=t||Ca,this.options.renderer=this.options.renderer||new go,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new hd}static parse(t,s){return new ac(s).parse(t)}static parseInline(t,s){return new ac(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},kr,Ul=(kr=class{constructor(e){ut(this,"options");ut(this,"block");this.options=e||Ca}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?kn.lex:kn.lexInline}provideParser(){return this.block?Sn.parse:Sn.parseInline}},ut(kr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),kr),r1=class{constructor(...e){ut(this,"defaults",ld());ut(this,"options",this.setOptions);ut(this,"parse",this.parseMarkdown(!0));ut(this,"parseInline",this.parseMarkdown(!1));ut(this,"Parser",Sn);ut(this,"Renderer",go);ut(this,"TextRenderer",hd);ut(this,"Lexer",kn);ut(this,"Tokenizer",vo);ut(this,"Hooks",Ul);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new go(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new vo(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Ul;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];Ul.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return kn.lex(e,t??this.defaults)}parser(e,t){return Sn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?kn.lex:kn.lexInline,r=i.hooks?i.hooks.provideParser():e?Sn.parse:Sn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+en(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},xa=new r1;function st(e,t){return xa.parse(e,t)}st.options=st.setOptions=function(e){return xa.setOptions(e),st.defaults=xa.defaults,Gm(st.defaults),st};st.getDefaults=ld;st.defaults=Ca;st.use=function(...e){return xa.use(...e),st.defaults=xa.defaults,Gm(st.defaults),st};st.walkTokens=function(e,t){return xa.walkTokens(e,t)};st.parseInline=xa.parseInline;st.Parser=Sn;st.parser=Sn.parse;st.Renderer=go;st.TextRenderer=hd;st.Lexer=kn;st.lexer=kn.lex;st.Tokenizer=vo;st.Hooks=Ul;st.parse=st;st.options;st.setOptions;st.use;st.walkTokens;st.parseInline;Sn.parse;kn.lex;const c1={breaks:!0,gfm:!0};function _p(e){if(!e)return"";try{if(typeof st<"u"&&st.parse){const t=st.parse(e,c1);return typeof mp<"u"?mp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function d1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const u1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function p1(e){return u1[e]||"wrench"}const f1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function wp(e){if(!e)return[];const t=e.match(f1);return t?[...new Set(t)]:[]}const h1={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),n=f(""),a=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),p=f(Ye.state||"disconnected");let h=null;const m=J(()=>{const D=p.value;return D==="connected"?"Connected":D==="reconnecting"?"Reconnecting…":D==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],k=J(()=>{const D=Math.floor(l.value/4)%v.length,L=l.value;return L>3?`${v[D]} (${L}s)`:v[0]});function R(){Rt(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function y(){if(!i.value)return;const D=i.value;D.style.height="auto",D.style.height=Math.min(D.scrollHeight,120)+"px"}function g(D,L,I={}){const U={id:++c,role:D,content:L,timestamp:Date.now(),html:D==="bot"?_p(L):"",tools_used:I.tools_used||[],is_error:I.is_error||!1,images:D==="bot"?wp(L):[],files:I.files||[],_showTools:!1};return e.value.push(U),R(),D==="bot"&&Rt(()=>b()),U}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const I=document.createElement("button");I.className="chat-code-copy",I.textContent="Copy",I.addEventListener("click",()=>{const U=L.querySelector("code"),W=U?U.textContent:L.textContent;navigator.clipboard.writeText(W).then(()=>{I.textContent="Copied!",setTimeout(()=>{I.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(I)})}function S(D){if(D===0)return!0;const L=e.value[D-1],I=e.value[D],U=new Date(L.timestamp).toDateString(),W=new Date(I.timestamp).toDateString();return U!==W}function w(D){const L=new Date(D),I=new Date;if(L.toDateString()===I.toDateString())return"Today";const U=new Date(I);return U.setDate(U.getDate()-1),L.toDateString()===U.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(D){t.value=D,Rt(()=>V())}function C(D){window.open(D,"_blank","noopener")}function x(D){D.target.style.display="none"}function N(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function B(){r&&(clearInterval(r),r=null),l.value=0}function E(D){s.value&&(s.value=!1,B(),D.type==="chat_response"?g("bot",D.content,{tools_used:D.tools_used||[],is_error:D.is_error||!1,files:D.files||[]}):D.type==="chat_error"&&g("bot",D.error||"Unknown error",{is_error:!0}),Rt(()=>{var L;return(L=i.value)==null?void 0:L.focus()}))}async function M(D){try{const L=await G.post("/api/chat",{content:D,channel_id:o.value});g("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){g("bot",L.message||"Failed to send message",{is_error:!0})}}async function V(){const D=t.value.trim();if(!D||s.value)return;g("user",D),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(D,{channelId:o.value})||(await M(D),s.value=!1,B()),Rt(()=>{var I;return(I=i.value)==null?void 0:I.focus()})}async function q(){n.value="";try{if(!o.value){const L=await G.get("/api/auth/session");o.value=L.channel_id||L.user_id||"web-user"}const D=await G.get("/api/sessions/"+encodeURIComponent(o.value));if(D&&D.messages&&D.messages.length>0){for(const L of D.messages){const I=L.role==="user"?"user":"bot";let U=L.content||"";if(I==="user"){const K=U.match(/^\[.*?\]:\s*/);K&&(U=U.slice(K[0].length))}if(!U.trim())continue;const W={id:++c,role:I,content:U,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:I==="bot"?_p(U):"",tools_used:[],is_error:!1,images:I==="bot"?wp(U):[],files:[],_showTools:!1};e.value.push(W)}Rt(()=>{R(),b()})}}catch(D){D&&D.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",_e.error(n.value))}}return Ge(()=>{Ye.subscribe("chat",E),p.value=Ye.state||"disconnected",h=Ye.onState(D=>{p.value=D}),q(),Rt(()=>{var D;return(D=i.value)==null?void 0:D.focus()})}),gt(()=>{Ye.unsubscribe("chat",E),h&&(h(),h=null),B()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:k,suggestions:d,send:V,autoResize:y,formatTime:d1,formatDate:w,showDateSeparator:S,useSuggestion:A,openImage:C,onImageError:x,getToolIcon:p1,loadHistory:q}}},m1={setup(){const e=f("odin"),t=f(""),s=f(""),n=f(""),a=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=J(()=>e.value==="custom"),v=J(()=>[...i.value,...l.value]),k=J(()=>l.value.includes(e.value)),R=J(()=>{var C;return m.value?t.value||"Odin":((C=a.value[e.value])==null?void 0:C.name)||e.value}),y=J(()=>{var C;return m.value?s.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.identity)||""}),g=J(()=>{var C;return m.value?n.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.voice)||""});async function b(){d.value=!0;try{const C=await G.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",n.value=C.custom_voice||"",a.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function S(){o.value=!0,c.value=null,r.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(C){c.value=C.message}finally{o.value=!1}}async function w(){const C=u.value.trim();if(C){h.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:C,display_name:R.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function A(){if(await Ut({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:k,previewName:R,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:w,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),nv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Jk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:h1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Sw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Nw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:ek,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:m1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:jk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/mcp",redirect:_t("/capabilities","mcp-servers")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/hosts",redirect:_t("/system","hosts")},{path:"/internals",redirect:_t("/system","internals")}],Ui=rw({history:U_(),routes:nv});Ui.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const v1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),n=f(!1),a=f(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},g1={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),n=f(!1),a=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),k=nv.filter(U=>U.meta),R=J(()=>["Workspace","Operate","Observe","Manage"].map(U=>({name:U,routes:k.filter(W=>W.meta.section===U)})).filter(U=>U.routes.length)),y=J(()=>{var U;return((U=Ui.currentRoute.value.meta)==null?void 0:U.label)||"Odin"}),g=J(()=>{var U;return((U=Ui.currentRoute.value.meta)==null?void 0:U.section)||"Management"}),b=J(()=>{var U;return((U=Ui.currentRoute.value.meta)==null?void 0:U.description)||"Management console"});function S(){Ye.disconnect(),V&&(clearInterval(V),V=null)}G.onSessionExpired=()=>{t.value=!0,S(),G.setToken(""),e.value="login"};function w(U){var W;if((U.ctrlKey||U.metaKey)&&U.key.toLowerCase()==="k"){e.value==="ready"&&(U.preventDefault(),ep());return}if(n.value&&U.key==="Tab"){const K=[...((W=a.value)==null?void 0:W.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(K.length){const X=K[0],le=K[K.length-1];if(U.shiftKey&&(document.activeElement===X||!a.value.contains(document.activeElement))){U.preventDefault(),le.focus();return}if(!U.shiftKey&&(document.activeElement===le||!a.value.contains(document.activeElement))){U.preventDefault(),X.focus();return}}}if(U.key==="Escape"&&n.value){n.value=!1,U.preventDefault();return}if(U.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(U.target.tagName)){U.preventDefault();const K=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');K&&K.focus()}}function A(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}Ge(async()=>{document.addEventListener("keydown",w),o=window.matchMedia("(max-width: 900px)"),A(),o.addEventListener("change",A);const U=await G.check();U.ok?(e.value="ready",L()):U.needsAuth?e.value="login":(e.value="ready",L())});function C(){t.value=!1,e.value="ready",L()}async function x(){S(),e.value="login",await G.logout()}function N(){s.value=!s.value}function B(){n.value=!n.value}us(n,async U=>{var W,K;if(U)r=document.activeElement,await Rt(),(K=(W=a.value)==null?void 0:W.querySelector(".nav-item"))==null||K.focus();else if(r!=null&&r.isConnected){const X=r;r=null,requestAnimationFrame(()=>X.focus())}});const E=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(U,W="info",K=3e3){p.value={text:U,level:W},clearTimeout(h),h=setTimeout(()=>{p.value=null},K)}let V=null,q=!1,D=[];function L(){for(const U of D)U();D=[Ye.onStatus(U=>{c.value=U}),Ye.onLatencyChange(U=>{u.value=U}),Ye.onState((U,W)=>{d.value=U,U==="connected"?(q&&M("Connection restored","success"),q=!0):U==="reconnecting"&&W.attempt===1&&M("Connection lost — reconnecting…","warn")})],Ye.connect(),I(),V&&clearInterval(V),V=setInterval(I,15e3)}async function I(){try{const U=await G.get("/api/status");m.value=U.status==="online"?"online":"starting";const W=U.uptime_seconds||0,K=Math.floor(W/3600),X=Math.floor(W%3600/60);v.value=`${K}h ${X}m uptime`}catch{m.value="offline",v.value=""}}return gt(()=>{V&&clearInterval(V);for(const U of D)U();D=[],Ye.disconnect(),document.removeEventListener("keydown",w),o==null||o.removeEventListener("change",A)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:E,wsToast:p,botStatus:m,botUptime:v,navRoutes:k,navGroups:R,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:C,logout:x,toggleSidebar:N,toggleMobileNavigation:B,openPalette:ep}}},Qn=ao(g1);Qn.component("odin-icon",Kk);Qn.component("login-screen",v1);Qn.component("toast-container",e_);Qn.component("confirm-host",t_);Qn.component("command-palette",Gk);Qn.directive("modal-focus",Zk);Qn.use(Ui);Qn.mount("#app");
