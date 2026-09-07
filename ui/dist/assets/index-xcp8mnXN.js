var wv=Object.defineProperty;var kv=(e,t,s)=>t in e?wv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ht=(e,t,s)=>kv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Sv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new xl("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Id(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new xl("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new Id((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new xl((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof xl?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class xl extends Error{constructor(t){super(t),this.name="AuthError"}}class Id extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Tv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)a.send(JSON.stringify({subscribe:o}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(a,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const j=new Sv,Ye=new Tv(j);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Os(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},Va=[],Yt=()=>{},za=()=>!1,Sa=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),To=e=>e.startsWith("onUpdate:"),qe=Object.assign,gc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Cv=Object.prototype.hasOwnProperty,nt=(e,t)=>Cv.call(e,t),Ee=Array.isArray,qa=e=>pi(e)==="[object Map]",Ta=e=>pi(e)==="[object Set]",Od=e=>pi(e)==="[object Date]",Ev=e=>pi(e)==="[object RegExp]",Pe=e=>typeof e=="function",Be=e=>typeof e=="string",os=e=>typeof e=="symbol",tt=e=>e!==null&&typeof e=="object",bc=e=>(tt(e)||Pe(e))&&Pe(e.then)&&Pe(e.catch),Bp=Object.prototype.toString,pi=e=>Bp.call(e),Av=e=>pi(e).slice(8,-1),Co=e=>pi(e)==="[object Object]",Eo=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Cn=Os(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Rv=Os("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ao=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Iv=/-\w/g,pt=Ao(e=>e.replace(Iv,t=>t.slice(1).toUpperCase())),Ov=/\B([A-Z])/g,xs=Ao(e=>e.replace(Ov,"-$1").toLowerCase()),Ca=Ao(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ga=Ao(e=>e?`on${Ca(e)}`:""),jt=(e,t)=>!Object.is(e,t),Ka=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Up=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Ro=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Kl=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let Ld;const Io=()=>Ld||(Ld=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Lv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Nv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Dv=Os(Nv);function cl(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Be(n)?Hp(n):cl(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Be(e)||tt(e))return e}const Pv=/;(?![^(]*\))/g,Mv=/:([^]+)/,Fv=/\/\*[^]*?\*\//g;function Hp(e){const t={};return e.replace(Fv,"").split(Pv).forEach(s=>{if(s){const n=s.split(Mv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function dl(e){let t="";if(Be(e))t=e;else if(Ee(e))for(let s=0;s<e.length;s++){const n=dl(e[s]);n&&(t+=n+" ")}else if(tt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function $v(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=dl(t)),s&&(e.style=cl(s)),e}const Bv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Uv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Hv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",zv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",jv=Os(Bv),Vv=Os(Uv),qv=Os(Hv),Gv=Os(zv),Kv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",Wv=Os(Kv);function zp(e){return!!e||e===""}function Jv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=In(e[n],t[n]);return s}function In(e,t){if(e===t)return!0;let s=Od(e),n=Od(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=os(e),n=os(t),s||n)return e===t;if(s=Ee(e),n=Ee(t),s||n)return s&&n?Jv(e,t):!1;if(s=tt(e),n=tt(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!In(e[l],t[l]))return!1}}return String(e)===String(t)}function Oo(e,t){return e.findIndex(s=>In(s,t))}const jp=e=>!!(e&&e.__v_isRef===!0),Vp=e=>Be(e)?e:e==null?"":Ee(e)||tt(e)&&(e.toString===Bp||!Pe(e.toString))?jp(e)?Vp(e.value):JSON.stringify(e,qp,2):String(e),qp=(e,t)=>jp(t)?qp(e,t.value):qa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[sr(n,i)+" =>"]=a,s),{})}:Ta(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>sr(s))}:os(t)?sr(t):tt(t)&&!Ee(t)&&!Co(t)?String(t):t,sr=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Zv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ut;class yc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Ut&&(Ut.active?(this.parent=Ut,this.index=(Ut.scopes||(Ut.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Ut;try{return Ut=this,t()}finally{Ut=s}}}on(){++this._on===1&&(this.prevScope=Ut,Ut=this)}off(){if(this._on>0&&--this._on===0){if(Ut===this)Ut=this.prevScope;else{let t=Ut;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Yv(e){return new yc(e)}function Gp(){return Ut}function Qv(e,t=!1){Ut&&Ut.cleanups.push(e)}let mt;const nr=new WeakSet;class ji{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Ut&&(Ut.active?Ut.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,nr.has(this)&&(nr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||Wp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Nd(this),Jp(this);const t=mt,s=qs;mt=this,qs=!0;try{return this.fn()}finally{Zp(this),mt=t,qs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)wc(t);this.deps=this.depsTail=void 0,Nd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?nr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Lr(this)&&this.run()}get dirty(){return Lr(this)}}let Kp=0,Li,Ni;function Wp(e,t=!1){if(e.flags|=8,t){e.next=Ni,Ni=e;return}e.next=Li,Li=e}function xc(){Kp++}function _c(){if(--Kp>0)return;if(Ni){let t=Ni;for(Ni=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Li;){let t=Li;for(Li=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Jp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Zp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),wc(n),Xv(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Lr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Yp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Yp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Vi)||(e.globalVersion=Vi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Lr(e))))return;e.flags|=2;const t=e.dep,s=mt,n=qs;mt=e,qs=!0;try{Jp(e);const a=e.fn(e._value);(t.version===0||jt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{mt=s,qs=n,Zp(e),e.flags&=-3}}function wc(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)wc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Xv(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function eg(e,t){e.effect instanceof ji&&(e=e.effect.fn);const s=new ji(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function tg(e){e.effect.stop()}let qs=!0;const Qp=[];function On(){Qp.push(qs),qs=!1}function Ln(){const e=Qp.pop();qs=e===void 0?!0:e}function Nd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=mt;mt=void 0;try{t()}finally{mt=s}}}let Vi=0;class sg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Lo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!mt||!qs||mt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==mt)s=this.activeLink=new sg(mt,this),mt.deps?(s.prevDep=mt.depsTail,mt.depsTail.nextDep=s,mt.depsTail=s):mt.deps=mt.depsTail=s,Xp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=mt.depsTail,s.nextDep=void 0,mt.depsTail.nextDep=s,mt.depsTail=s,mt.deps===s&&(mt.deps=n)}return s}trigger(t){this.version++,Vi++,this.notify(t)}notify(t){xc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{_c()}}}function Xp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Xp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Wl=new WeakMap,ma=Symbol(""),Nr=Symbol(""),qi=Symbol("");function as(e,t,s){if(qs&&mt){let n=Wl.get(e);n||Wl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new Lo),a.map=n,a.key=s),a.track()}}function _n(e,t,s,n,a,i){const l=Wl.get(e);if(!l){Vi++;return}const o=r=>{r&&r.trigger()};if(xc(),t==="clear")l.forEach(o);else{const r=Ee(e),c=r&&Eo(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(ma)),qa(e)&&o(l.get(Nr)));break;case"delete":r||(o(l.get(ma)),qa(e)&&o(l.get(Nr)));break;case"set":qa(e)&&o(l.get(ma));break}}_c()}function ng(e,t){const s=Wl.get(e);return s&&s.get(t)}function La(e){const t=Ze(e);return t===e?t:(as(t,"iterate",qi),ws(e)?t:t.map(Ks))}function No(e){return as(e=Ze(e),"iterate",qi),e}function an(e,t){return on(e)?ei(En(e)?Ks(t):t):Ks(t)}const ag={__proto__:null,[Symbol.iterator](){return ar(this,Symbol.iterator,e=>an(this,e))},concat(...e){return La(this).concat(...e.map(t=>Ee(t)?La(t):t))},entries(){return ar(this,"entries",e=>(e[1]=an(this,e[1]),e))},every(e,t){return fn(this,"every",e,t,void 0,arguments)},filter(e,t){return fn(this,"filter",e,t,s=>s.map(n=>an(this,n)),arguments)},find(e,t){return fn(this,"find",e,t,s=>an(this,s),arguments)},findIndex(e,t){return fn(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return fn(this,"findLast",e,t,s=>an(this,s),arguments)},findLastIndex(e,t){return fn(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return fn(this,"forEach",e,t,void 0,arguments)},includes(...e){return ir(this,"includes",e)},indexOf(...e){return ir(this,"indexOf",e)},join(e){return La(this).join(e)},lastIndexOf(...e){return ir(this,"lastIndexOf",e)},map(e,t){return fn(this,"map",e,t,void 0,arguments)},pop(){return gi(this,"pop")},push(...e){return gi(this,"push",e)},reduce(e,...t){return Dd(this,"reduce",e,t)},reduceRight(e,...t){return Dd(this,"reduceRight",e,t)},shift(){return gi(this,"shift")},some(e,t){return fn(this,"some",e,t,void 0,arguments)},splice(...e){return gi(this,"splice",e)},toReversed(){return La(this).toReversed()},toSorted(e){return La(this).toSorted(e)},toSpliced(...e){return La(this).toSpliced(...e)},unshift(...e){return gi(this,"unshift",e)},values(){return ar(this,"values",e=>an(this,e))}};function ar(e,t,s){const n=No(e),a=n[t]();return n!==e&&!ws(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const ig=Array.prototype;function fn(e,t,s,n,a,i){const l=No(e),o=l!==e&&!ws(e),r=l[t];if(r!==ig[t]){const u=r.apply(e,i);return o?Ks(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,an(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function Dd(e,t,s,n){const a=No(e),i=a!==e&&!ws(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=an(e,c)),s.call(this,c,an(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?an(e,r):r}function ir(e,t,s){const n=Ze(e);as(n,"iterate",qi);const a=n[t](...s);return(a===-1||a===!1)&&ul(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function gi(e,t,s=[]){On(),xc();const n=Ze(e)[t].apply(e,s);return _c(),Ln(),n}const lg=Os("__proto__,__v_isRef,__isVue"),ef=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function og(e){os(e)||(e=String(e));const t=Ze(this);return as(t,"has",e),t.hasOwnProperty(e)}class tf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?rf:of:i?lf:af).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ee(t);if(!a){let r;if(l&&(r=ag[s]))return r;if(s==="hasOwnProperty")return og}const o=Reflect.get(t,s,Pt(t)?t:n);if((os(s)?ef.has(s):lg(s))||(a||as(t,"get",s),i))return o;if(Pt(o)){const r=l&&Eo(s)?o:o.value;return a&&tt(r)?Jl(r):r}return tt(o)?a?Jl(o):ea(o):o}}class sf extends tf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ee(t)&&Eo(s);if(!this._isShallow){const c=on(i);if(!ws(n)&&!on(n)&&(i=Ze(i),n=Ze(n)),!l&&Pt(i)&&!Pt(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:nt(t,s),r=Reflect.set(t,s,n,Pt(t)?t:a);return t===Ze(a)&&(o?jt(n,i)&&_n(t,"set",s,n):_n(t,"add",s,n)),r}deleteProperty(t,s){const n=nt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&_n(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!os(s)||!ef.has(s))&&as(t,"has",s),n}ownKeys(t){return as(t,"iterate",Ee(t)?"length":ma),Reflect.ownKeys(t)}}class nf extends tf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const rg=new sf,cg=new nf,dg=new sf(!0),ug=new nf(!0),Dr=e=>e,_l=e=>Reflect.getPrototypeOf(e);function pg(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=qa(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?Dr:t?ei:Ks;return!t&&as(i,"iterate",r?Nr:ma),qe(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function wl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function fg(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),o=Ze(a);e||(jt(a,o)&&as(l,"get",a),as(l,"get",o));const{has:r}=_l(l),c=t?Dr:e?ei:Ks;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&as(Ze(a),"iterate",ma),a.size},has(a){const i=this.__v_raw,l=Ze(i),o=Ze(a);return e||(jt(a,o)&&as(l,"has",a),as(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Ze(o),c=t?Dr:e?ei:Ks;return!e&&as(r,"iterate",ma),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:wl("add"),set:wl("set"),delete:wl("delete"),clear:wl("clear")}:{add(a){const i=Ze(this),l=_l(i),o=Ze(a),r=!t&&!ws(a)&&!on(a)?o:a;return l.has.call(i,r)||jt(a,r)&&l.has.call(i,a)||jt(o,r)&&l.has.call(i,o)||(i.add(r),_n(i,"add",r,r)),this},set(a,i){!t&&!ws(i)&&!on(i)&&(i=Ze(i));const l=Ze(this),{has:o,get:r}=_l(l);let c=o.call(l,a);c||(a=Ze(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?jt(i,d)&&_n(l,"set",a,i):_n(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:o}=_l(i);let r=l.call(i,a);r||(a=Ze(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&_n(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&_n(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=pg(a,e,t)}),s}function Do(e,t){const s=fg(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(nt(s,a)&&a in n?s:n,a,i)}const hg={get:Do(!1,!1)},mg={get:Do(!1,!0)},vg={get:Do(!0,!1)},gg={get:Do(!0,!0)},af=new WeakMap,lf=new WeakMap,of=new WeakMap,rf=new WeakMap;function bg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function ea(e){return on(e)?e:Po(e,!1,rg,hg,af)}function kc(e){return Po(e,!1,dg,mg,lf)}function Jl(e){return Po(e,!0,cg,vg,of)}function yg(e){return Po(e,!0,ug,gg,rf)}function Po(e,t,s,n,a){if(!tt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=bg(Av(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function En(e){return on(e)?En(e.__v_raw):!!(e&&e.__v_isReactive)}function on(e){return!!(e&&e.__v_isReadonly)}function ws(e){return!!(e&&e.__v_isShallow)}function ul(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function cf(e){return!nt(e,"__v_skip")&&Object.isExtensible(e)&&Up(e,"__v_skip",!0),e}const Ks=e=>tt(e)?ea(e):e,ei=e=>tt(e)?Jl(e):e;function Pt(e){return e?e.__v_isRef===!0:!1}function f(e){return df(e,!1)}function Sc(e){return df(e,!0)}function df(e,t){return Pt(e)?e:new xg(e,t)}class xg{constructor(t,s){this.dep=new Lo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Ks(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ws(t)||on(t);t=n?t:Ze(t),jt(t,s)&&(this._rawValue=t,this._value=n?t:Ks(t),this.dep.trigger())}}function _g(e){e.dep&&e.dep.trigger()}function ln(e){return Pt(e)?e.value:e}function wg(e){return Pe(e)?e():ln(e)}const kg={get:(e,t,s)=>t==="__v_raw"?e:ln(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Pt(a)&&!Pt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Tc(e){return En(e)?e:new Proxy(e,kg)}class Sg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Lo,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function uf(e){return new Sg(e)}function Tg(e){const t=Ee(e)?new Array(e.length):{};for(const s in e)t[s]=pf(e,s);return t}class Cg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!Ee(t)||os(this._key)||!Eo(this._key))do a=!ul(i)||ws(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=ln(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Pt(this._raw[this._key])){const s=this._object[this._key];if(Pt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return ng(this._raw,this._key)}}class Eg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Ag(e,t,s){return Pt(e)?e:Pe(e)?new Eg(e):tt(e)&&arguments.length>1?pf(e,t,s):f(e)}function pf(e,t,s){return new Cg(e,t,s)}class Rg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Lo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Vi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&mt!==this)return Wp(this,!0),!0}get value(){const t=this.dep.track();return Yp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ig(e,t,s=!1){let n,a;return Pe(e)?n=e:(n=e.get,a=e.set),new Rg(n,a,s)}const Og={GET:"get",HAS:"has",ITERATE:"iterate"},Lg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},kl={},Zl=new WeakMap;let Kn;function Ng(){return Kn}function ff(e,t=!1,s=Kn){if(s){let n=Zl.get(s);n||Zl.set(s,n=[]),n.push(e)}}function Dg(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>a?b:ws(b)||a===!1||a===0?wn(b,1):wn(b);let d,u,p,h,m=!1,v=!1;if(Pt(e)?(u=()=>e.value,m=ws(e)):En(e)?(u=()=>c(e),m=!0):Ee(e)?(v=!0,m=e.some(b=>En(b)||ws(b)),u=()=>e.map(b=>{if(Pt(b))return b.value;if(En(b))return c(b);if(Pe(b))return r?r(b,2):b()})):Pe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){On();try{p()}finally{Ln()}}const b=Kn;Kn=d;try{return r?r(e,3,[h]):e(h)}finally{Kn=b}}:u=Yt,t&&a){const b=u,R=a===!0?1/0:a;u=()=>wn(b(),R)}const w=Gp(),L=()=>{d.stop(),w&&w.active&&gc(w.effects,d)};if(i&&t){const b=t;t=(...R)=>{const C=b(...R);return L(),C}}let _=v?new Array(e.length).fill(kl):kl;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const R=d.run();if(b||a||m||(v?R.some((C,O)=>jt(C,_[O])):jt(R,_))){p&&p();const C=Kn;Kn=d;try{const O=[R,_===kl?void 0:v&&_[0]===kl?[]:_,h];_=R,r?r(t,3,O):t(...O)}finally{Kn=C}}}else d.run()};return o&&o(g),d=new ji(u),d.scheduler=l?()=>l(g,!1):g,h=b=>ff(b,!1,d),p=d.onStop=()=>{const b=Zl.get(d);if(b){if(r)r(b,4);else for(const R of b)R();Zl.delete(d)}},t?n?g(!0):_=d.run():l?l(g.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function wn(e,t=1/0,s){if(t<=0||!tt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Pt(e))wn(e.value,t,s);else if(Ee(e))for(let n=0;n<e.length;n++)wn(e[n],t,s);else if(Ta(e)||qa(e))e.forEach(n=>{wn(n,t,s)});else if(Co(e)){for(const n in e)wn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&wn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hf=[];function Pg(e){hf.push(e)}function Mg(){hf.pop()}function Fg(e,t){}const $g={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Bg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function fi(e,t,s,n){try{return n?e(...n):e()}catch(a){Ea(a,t,s)}}function Is(e,t,s,n){if(Pe(e)){const a=fi(e,t,s,n);return a&&bc(a)&&a.catch(i=>{Ea(i,t,s)}),a}if(Ee(e)){const a=[];for(let i=0;i<e.length;i++)a.push(Is(e[i],t,s,n));return a}}function Ea(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){On(),fi(i,null,10,[e,r,c]),Ln();return}}Ug(e,s,a,n,l)}function Ug(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ps=[];let sn=-1;const Wa=[];let Wn=null,$a=0;const mf=Promise.resolve();let Yl=null;function Rt(e){const t=Yl||mf;return e?t.then(this?e.bind(this):e):t}function Hg(e){let t=sn+1,s=ps.length;for(;t<s;){const n=t+s>>>1,a=ps[n],i=Ki(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function Cc(e){if(!(e.flags&1)){const t=Ki(e),s=ps[ps.length-1];!s||!(e.flags&2)&&t>=Ki(s)?ps.push(e):ps.splice(Hg(t),0,e),e.flags|=1,vf()}}function vf(){Yl||(Yl=mf.then(gf))}function Gi(e){Ee(e)?Wa.push(...e):Wn&&e.id===-1?Wn.splice($a+1,0,e):e.flags&1||(Wa.push(e),e.flags|=1),vf()}function Pd(e,t,s=sn+1){for(;s<ps.length;s++){const n=ps[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ps.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Ql(e){if(Wa.length){const t=[...new Set(Wa)].sort((s,n)=>Ki(s)-Ki(n));if(Wa.length=0,Wn){Wn.push(...t);return}for(Wn=t,$a=0;$a<Wn.length;$a++){const s=Wn[$a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Wn=null,$a=0}}const Ki=e=>e.id==null?e.flags&2?-1:1/0:e.id;function gf(e){try{for(sn=0;sn<ps.length;sn++){const t=ps[sn];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),fi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;sn<ps.length;sn++){const t=ps[sn];t&&(t.flags&=-2)}sn=-1,ps.length=0,Ql(),Yl=null,(ps.length||Wa.length)&&gf()}}let Ba,Sl=[];function bf(e,t){var s,n;Ba=e,Ba?(Ba.enabled=!0,Sl.forEach(({event:a,args:i})=>Ba.emit(a,...i)),Sl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{bf(i,t)}),setTimeout(()=>{Ba||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Sl=[])},3e3)):Sl=[]}let Zt=null,Mo=null;function Wi(e){const t=Zt;return Zt=e,Mo=e&&e.type.__scopeId||null,t}function zg(e){Mo=e}function jg(){Mo=null}const Vg=e=>Ec;function Ec(e,t=Zt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Qi(-1);const i=Wi(t);let l;try{l=e(...a)}finally{Wi(i),n._d&&Qi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function qg(e,t){if(Zt===null)return e;const s=ml(Zt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ge]=t[a];i&&(Pe(i)&&(i={mounted:i,updated:i}),i.deep&&wn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function nn(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(On(),Is(r,s,8,[e.el,o,e,t]),Ln())}}function Di(e,t){if(Jt){let s=Jt.provides;const n=Jt.parent&&Jt.parent.provides;n===s&&(s=Jt.provides=Object.create(n)),s[e]=t}}function Us(e,t,s=!1){const n=hs();if(n||va){let a=va?va._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Pe(t)?t.call(n&&n.proxy):t}}function Gg(){return!!(hs()||va)}const yf=Symbol.for("v-scx"),xf=()=>Us(yf);function Kg(e,t){return pl(e,null,t)}function Wg(e,t){return pl(e,null,{flush:"post"})}function _f(e,t){return pl(e,null,{flush:"sync"})}function Mt(e,t,s){return pl(e,t,s)}function pl(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,o=qe({},s),r=t&&n||!t&&i!=="post";let c;if(_a){if(i==="sync"){const h=xf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Yt,h.resume=Yt,h.pause=Yt,h}}const d=Jt;o.call=(h,m,v)=>Is(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Nt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():Cc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=Dg(e,t,o);return _a&&(c?c.push(p):r&&p()),p}function Jg(e,t,s){const n=this.proxy,a=Be(e)?e.includes(".")?wf(n,e):()=>n[e]:e.bind(n,n);let i;Pe(t)?i=t:(i=t.handler,s=t);const l=hi(this),o=pl(a,i.bind(n),s);return l(),o}function wf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const qn=new WeakMap,kf=Symbol("_vte"),Sf=e=>e.__isTeleport,da=e=>e&&(e.disabled||e.disabled===""),Zg=e=>e&&(e.defer||e.defer===""),Md=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Fd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,Pr=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},Yg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:w,parentNode:L}}=c,_=da(t.props);let{dynamicChildren:g}=t;const b=(O,A,x)=>{O.shapeFlag&16&&d(O.children,A,x,a,i,l,o,r)},R=(O=t)=>{const A=da(O.props),x=O.target=Pr(O.props,m),N=Mr(x,O,v,h);x&&(l!=="svg"&&Md(x)?l="svg":l!=="mathml"&&Fd(x)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(x),A||(b(O,x,N),Ei(O,!1)))},C=O=>{const A=()=>{if(qn.get(O)===A){if(qn.delete(O),da(O.props)){const x=L(O.el)||s;b(O,x,O.anchor),Ei(O,!0)}R(O)}};qn.set(O,A),Nt(A,i)};if(e==null){const O=t.el=v(""),A=t.anchor=v("");if(h(O,s,n),h(A,s,n),Zg(t.props)||i&&i.pendingBranch){C(t);return}_&&(b(t,s,A),Ei(t,!0)),R()}else{t.el=e.el;const O=t.anchor=e.anchor,A=qn.get(e);if(A){A.flags|=8,qn.delete(e),C(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,N=t.targetAnchor=e.targetAnchor,F=da(e.props),E=F?s:x,M=F?O:N;if(l==="svg"||Md(x)?l="svg":(l==="mathml"||Fd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,E,a,i,l,o),$c(e,t,!0)):r||u(e,t,E,M,a,i,l,o,!1),_)F?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Tl(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const V=t.target=Pr(t.props,m);V&&Tl(t,V,null,c,0)}else F&&Tl(t,x,N,c,1);Ei(t,_)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!da(p),m=qn.get(e);if(m&&(m.flags|=8,qn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const w=o[v];n(w,t,s,h,!!w.dynamicChildren)}},move:Tl,hydrate:Qg};function Tl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!qn.has(e)&&(!u||da(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function Qg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(w,L){let _=L;for(;_;){if(_&&_.nodeType===8){if(_.data==="teleport start anchor")t.targetStart=_;else if(_.data==="teleport anchor"){t.targetAnchor=_,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}_=l(_)}}function h(w,L){L.anchor=u(l(w),L,o(w),s,n,a,i)}const m=t.target=Pr(t.props,r),v=da(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,w),t.targetAnchor||Mr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,w),t.targetAnchor||Mr(m,t,d,c),u(w&&l(w),t,m,s,n,a,i))),Ei(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Xg=Yg;function Ei(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function Mr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[kf]=l,e&&(n(i,e,a),n(l,e,a)),l}const Ms=Symbol("_leaveCb"),bi=Symbol("_enterCb");function Ac(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return je(()=>{e.isMounted=!0}),Uo(()=>{e.isUnmounting=!0}),e}const Ps=[Function,Array],Rc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ps,onEnter:Ps,onAfterEnter:Ps,onEnterCancelled:Ps,onBeforeLeave:Ps,onLeave:Ps,onAfterLeave:Ps,onLeaveCancelled:Ps,onBeforeAppear:Ps,onAppear:Ps,onAfterAppear:Ps,onAppearCancelled:Ps},Tf=e=>{const t=e.subTree;return t.component?Tf(t.component):t},eb={name:"BaseTransition",props:Rc,setup(e,{slots:t}){const s=hs(),n=Ac();return()=>{const a=t.default&&Fo(t.default(),!0),i=a&&a.length?Cf(a):s.subTree?rh():void 0;if(!i)return;const l=Ze(e),{mode:o}=l;if(n.isLeaving)return lr(i);const r=$d(i);if(!r)return lr(i);let c=ti(r,l,n,s,u=>c=u);r.type!==It&&Nn(r,c);let d=s.subTree&&$d(s.subTree);if(d&&d.type!==It&&!Vs(d,r)&&Tf(s).type!==It){let u=ti(d,l,n,s);if(Nn(d,u),o==="out-in"&&r.type!==It)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},lr(i);o==="in-out"&&r.type!==It?u.delayLeave=(p,h,m)=>{const v=Af(n,d);v[String(d.key)]=d,p[Ms]=()=>{h(),p[Ms]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Cf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==It){t=s;break}}return t}const Ef=eb;function Af(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function ti(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:w,onAppear:L,onAfterAppear:_,onAppearCancelled:g}=t,b=String(e.key),R=Af(s,e),C=(x,N)=>{x&&Is(x,n,9,N)},O=(x,N)=>{const F=N[1];C(x,N),Ee(x)?x.every(E=>E.length<=1)&&F():x.length<=1&&F()},A={mode:l,persisted:o,beforeEnter(x){let N=r;if(!s.isMounted)if(i)N=w||r;else return;x[Ms]&&x[Ms](!0);const F=R[b];F&&Vs(e,F)&&F.el[Ms]&&F.el[Ms](),C(N,[x])},enter(x){if(R[b]===e)return;let N=c,F=d,E=u;if(!s.isMounted)if(i)N=L||c,F=_||d,E=g||u;else return;let M=!1;x[bi]=J=>{M||(M=!0,J?C(E,[x]):C(F,[x]),A.delayedLeave&&A.delayedLeave(),x[bi]=void 0)};const V=x[bi].bind(null,!1);N?O(N,[x,V]):V()},leave(x,N){const F=String(e.key);if(x[bi]&&x[bi](!0),s.isUnmounting)return N();C(p,[x]);let E=!1;x[Ms]=V=>{E||(E=!0,N(),V?C(v,[x]):C(m,[x]),x[Ms]=void 0,R[F]===e&&delete R[F])};const M=x[Ms].bind(null,!1);R[F]=e,h?O(h,[x,M]):M()},clone(x){const N=ti(x,t,s,n,a);return a&&a(N),N}};return A}function lr(e){if(hl(e))return e=rn(e),e.children=null,e}function $d(e){if(!hl(e))return Sf(e.type)&&e.children?Cf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Pe(s.default))return s.default()}}function Nn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Nn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Fo(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Vt?(l.patchFlag&128&&a++,n=n.concat(Fo(l.children,t,o))):(t||l.type!==It)&&n.push(o!=null?rn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function fl(e,t){return Pe(e)?qe({name:e.name},t,{setup:e}):e}function tb(){const e=hs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Ic(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function sb(e){const t=hs(),s=Sc(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Xl=new WeakMap;function Ja(e,t,s,n,a=!1){if(Ee(e)){e.forEach((v,w)=>Ja(v,t&&(Ee(t)?t[w]:t),s,n,a));return}if(An(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ja(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ml(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ge?o.refs={}:o.refs,u=o.setupState,p=Ze(u),h=u===Ge?za:v=>Bd(d,v)?!1:nt(p,v),m=(v,w)=>!(w&&Bd(d,w));if(c!=null&&c!==r){if(Ud(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(Pt(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Pe(r))fi(r,o,12,[l,d]);else{const v=Be(r),w=Pt(r);if(v||w){const L=()=>{if(e.f){const _=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ee(_)&&gc(_,i);else if(Ee(_))_.includes(i)||_.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):w&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const _=()=>{L(),Xl.delete(e)};_.id=-1,Xl.set(e,_),Nt(_,s)}else Ud(e),L()}}}function Ud(e){const t=Xl.get(e);t&&(t.flags|=8,Xl.delete(e))}let Hd=!1;const Na=()=>{Hd||(console.error("Hydration completed but contains mismatches."),Hd=!0)},nb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",ab=e=>e.namespaceURI.includes("MathML"),Cl=e=>{if(e.nodeType===1){if(nb(e))return"svg";if(ab(e))return"mathml"}},ja=e=>e.nodeType===8;function ib(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),Ql(),b._vnode=g;return}u(b.firstChild,g,null,null,null),Ql(),b._vnode=g},u=(g,b,R,C,O,A=!1)=>{A=A||!!b.dynamicChildren;const x=ja(g)&&g.data==="[",N=()=>v(g,b,R,C,O,x),{type:F,ref:E,shapeFlag:M,patchFlag:V}=b;let J=g.nodeType;b.el=g,V===-2&&(A=!1,b.dynamicChildren=null);let T=null;switch(F){case Yn:J!==3?b.children===""?(r(b.el=a(""),l(g),g),T=g):T=N():(g.data!==b.children&&(Na(),g.data=b.children),T=i(g));break;case It:_(g)?(T=i(g),L(b.el=g.content.firstChild,g,R)):J!==8||x?T=N():T=i(g);break;case ga:if(x&&(g=i(g),J=g.nodeType),J===1||J===3){T=g;const k=!b.children.length;for(let S=0;S<b.staticCount;S++)k&&(b.children+=T.nodeType===1?T.outerHTML:T.data),S===b.staticCount-1&&(b.anchor=T),T=i(T);return x?i(T):T}else N();break;case Vt:x?T=m(g,b,R,C,O,A):T=N();break;default:if(M&1)(J!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!_(g)?T=N():T=p(g,b,R,C,O,A);else if(M&6){b.slotScopeIds=O;const k=l(g);if(x?T=w(g):ja(g)&&g.data==="teleport start"?T=w(g,g.data,"teleport end"):T=i(g),t(b,k,null,R,C,Cl(k),A),An(b)&&!b.type.__asyncResolved){let S;x?(S=xt(Vt),S.anchor=T?T.previousSibling:k.lastChild):S=g.nodeType===3?Uc(""):xt("div"),S.el=g,b.component.subTree=S}}else M&64?J!==8?T=N():T=b.type.hydrate(g,b,R,C,O,A,e,h):M&128&&(T=b.type.hydrate(g,b,R,C,Cl(l(g)),O,A,e,u))}return E!=null&&Ja(E,null,C,b),T},p=(g,b,R,C,O,A)=>{A=A||!!b.dynamicChildren;const{type:x,props:N,patchFlag:F,shapeFlag:E,dirs:M,transition:V}=b,J=x==="input"||x==="option";if(J||F!==-1){M&&nn(b,null,R,"created");let T=!1;if(_(g)){T=Xf(null,V)&&R&&R.vnode.props&&R.vnode.props.appear;const S=g.content.firstChild;if(T){const $=S.getAttribute("class");$&&(S.$cls=$),V.beforeEnter(S)}L(S,g,R),b.el=g=S}if(E&16&&!(N&&(N.innerHTML||N.textContent))){let S=h(g.firstChild,b,g,R,C,O,A);for(S&&!El(g,1)&&Na();S;){const $=S;S=S.nextSibling,o($)}}else if(E&8){let S=b.children;S[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(S=S.slice(1));const{textContent:$}=g;$!==S&&$!==S.replace(/\r\n|\r/g,`
`)&&(El(g,0)||Na(),g.textContent=b.children)}if(N){if(J||!A||F&48){const S=g.tagName.includes("-");for(const $ in N)(J&&($.endsWith("value")||$==="indeterminate")||Sa($)&&!Cn($)||$[0]==="."||S&&!Cn($))&&n(g,$,null,N[$],void 0,R)}else if(N.onClick)n(g,"onClick",null,N.onClick,void 0,R);else if(F&4&&En(N.style))for(const S in N.style)N.style[S]}let k;(k=N&&N.onVnodeBeforeMount)&&gs(k,R,b),M&&nn(b,null,R,"beforeMount"),((k=N&&N.onVnodeMounted)||M||T)&&nh(()=>{k&&gs(k,R,b),T&&V.enter(g),M&&nn(b,null,R,"mounted")},C)}return g.nextSibling},h=(g,b,R,C,O,A,x)=>{x=x||!!b.dynamicChildren;const N=b.children,F=N.length;let E=!1;for(let M=0;M<F;M++){const V=x?N[M]:N[M]=ys(N[M]),J=V.type===Yn;g?(J&&!x&&M+1<F&&ys(N[M+1]).type===Yn&&(r(a(g.data.slice(V.children.length)),R,i(g)),g.data=V.children),g=u(g,V,C,O,A,x)):J&&!V.children?r(V.el=a(""),R):(E||(E=!0,El(R,1)||Na()),s(null,V,R,null,C,O,Cl(R),A))}return g},m=(g,b,R,C,O,A)=>{const{slotScopeIds:x}=b;x&&(O=O?O.concat(x):x);const N=l(g),F=h(i(g),b,N,R,C,O,A);return F&&ja(F)&&F.data==="]"?i(b.anchor=F):(Na(),r(b.anchor=c("]"),N,F),F)},v=(g,b,R,C,O,A)=>{if(El(g.parentElement,1)||Na(),b.el=null,A){const F=w(g);for(;;){const E=i(g);if(E&&E!==F)o(E);else break}}const x=i(g),N=l(g);return o(g),s(null,b,N,x,R,C,Cl(N),O),R&&(R.vnode.el=b.el,zo(R,b.el)),x},w=(g,b="[",R="]")=>{let C=0;for(;g;)if(g=i(g),g&&ja(g)&&(g.data===b&&C++,g.data===R)){if(C===0)return i(g);C--}return g},L=(g,b,R)=>{const C=b.parentNode;C&&C.replaceChild(g,b);let O=R;for(;O;)O.vnode.el===b&&(O.vnode.el=O.subTree.el=g),O=O.parent},_=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const zd="data-allow-mismatch",lb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function El(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(zd);)e=e.parentElement;const s=e&&e.getAttribute(zd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(lb[t])}}const ob=Io().requestIdleCallback||(e=>setTimeout(e,1)),rb=Io().cancelIdleCallback||(e=>clearTimeout(e)),cb=(e=1e4)=>t=>{const s=ob(t,{timeout:e});return()=>rb(s)};function db(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const ub=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(db(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},pb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},fb=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function hb(e,t){if(ja(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(ja(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const An=e=>!!e.type.__asyncLoader;function mb(e){Pe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((w,L)=>{r(v,()=>w(p()),()=>L(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return fl({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,w){let L=!1;(v.bu||(v.bu=[])).push(()=>L=!0);const _=()=>{L||w()},g=i?()=>{const b=i(_,R=>hb(m,R));b&&(v.bum||(v.bum=[])).push(b)}:_;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Jt;if(Ic(m),d)return()=>Al(d,m);const v=R=>{c=null,Ea(R,m,13,!n)};if(o&&m.suspense||_a)return h().then(R=>()=>Al(R,m)).catch(R=>(v(R),()=>n?xt(n,{error:R}):null));const w=f(!1),L=f(),_=f(!!a);let g,b;return ft(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),a&&(b=setTimeout(()=>{m.isUnmounted||(_.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!L.value){const R=new Error(`Async component timed out after ${l}ms.`);v(R),L.value=R}},l)),h().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&hl(m.parent.vnode)&&m.parent.update())}).catch(R=>{if(m.isUnmounted){c=null;return}v(R),L.value=R}),()=>{if(w.value&&d)return Al(d,m);if(L.value&&n)return xt(n,{error:L.value});if(s&&!_.value)return Al(s,m)}}})}function Al(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=xt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const hl=e=>e.type.__isKeepAlive,vb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=hs(),n=s.ctx;if(!n.renderer)return()=>{const _=t.default&&t.default();return _&&_.length===1?_[0]:_};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(_,g,b,R,C)=>{const O=_.component;c(_,g,b,0,o),r(O.vnode,_,g,b,O,o,R,_.slotScopeIds,C),Nt(()=>{O.isDeactivated=!1,O.a&&Ka(O.a);const A=_.props&&_.props.onVnodeMounted;A&&gs(A,O.parent,_)},o)},n.deactivate=_=>{const g=_.component;to(g.m),to(g.a),c(_,p,null,1,o),Nt(()=>{g.da&&Ka(g.da);const b=_.props&&_.props.onVnodeUnmounted;b&&gs(b,g.parent,_),g.isDeactivated=!0},o)};function h(_){or(_),d(_,s,o,!0)}function m(_){a.forEach((g,b)=>{const R=qr(An(g)?g.type.__asyncResolved||{}:g.type);R&&!_(R)&&v(b)})}function v(_){const g=a.get(_);g&&(!l||!Vs(g,l))?h(g):l&&or(l),a.delete(_),i.delete(_)}Mt(()=>[e.include,e.exclude],([_,g])=>{_&&m(b=>Ai(_,b)),g&&m(b=>!Ai(g,b))},{flush:"post",deep:!0});let w=null;const L=()=>{w!=null&&(so(s.subTree.type)?Nt(()=>{a.set(w,Rl(s.subTree))},s.subTree.suspense):a.set(w,Rl(s.subTree)))};return je(L),Bo(L),Uo(()=>{a.forEach(_=>{const{subTree:g,suspense:b}=s,R=Rl(g);if(_.type===R.type&&_.key===R.key){or(R);const C=R.component.da;C&&Nt(C,b);return}h(_)})}),()=>{if(w=null,!t.default)return l=null;const _=t.default(),g=_[0];if(_.length>1)return l=null,_;if(!Dn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Rl(g);if(b.type===It)return l=null,b;const R=b.type,C=qr(An(b)?b.type.__asyncResolved||{}:R),{include:O,exclude:A,max:x}=e;if(O&&(!C||!Ai(O,C))||A&&C&&Ai(A,C))return b.shapeFlag&=-257,l=b,g;const N=b.key==null?R:b.key,F=a.get(N);return b.el&&(b=rn(b),g.shapeFlag&128&&(g.ssContent=b)),w=N,F?(b.el=F.el,b.component=F.component,b.transition&&Nn(b,b.transition),b.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,so(g.type)?g:b}}},gb=vb;function Ai(e,t){return Ee(e)?e.some(s=>Ai(s,t)):Be(e)?e.split(",").includes(t):Ev(e)?(e.lastIndex=0,e.test(t)):!1}function Qt(e,t){Rf(e,"a",t)}function Gt(e,t){Rf(e,"da",t)}function Rf(e,t,s=Jt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if($o(t,n,s),s){let a=s.parent;for(;a&&a.parent;)hl(a.parent.vnode)&&bb(n,t,s,a),a=a.parent}}function bb(e,t,s,n){const a=$o(t,e,n,!0);ft(()=>{gc(n[t],a)},s)}function or(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Rl(e){return e.shapeFlag&128?e.ssContent:e}function $o(e,t,s=Jt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{On();const o=hi(s),r=Is(t,s,e,l);return o(),Ln(),r});return n?a.unshift(i):a.push(i),i}}const Pn=e=>(t,s=Jt)=>{(!_a||e==="sp")&&$o(e,(...n)=>t(...n),s)},If=Pn("bm"),je=Pn("m"),Oc=Pn("bu"),Bo=Pn("u"),Uo=Pn("bum"),ft=Pn("um"),Of=Pn("sp"),Lf=Pn("rtg"),Nf=Pn("rtc");function Df(e,t=Jt){$o("ec",e,t)}const Lc="components",yb="directives";function xb(e,t){return Nc(Lc,e,!0,t)||e}const Pf=Symbol.for("v-ndc");function _b(e){return Be(e)?Nc(Lc,e,!1)||e:e||Pf}function wb(e){return Nc(yb,e)}function Nc(e,t,s=!0,n=!1){const a=Zt||Jt;if(a){const i=a.type;if(e===Lc){const o=qr(i,!1);if(o&&(o===t||o===pt(t)||o===Ca(pt(t))))return i}const l=jd(a[e]||i[e],t)||jd(a.appContext[e],t);return!l&&n?i:l}}function jd(e,t){return e&&(e[t]||e[pt(t)]||e[Ca(pt(t))])}function kb(e,t,s,n){let a;const i=s&&s[n],l=Ee(e);if(l||Be(e)){const o=l&&En(e);let r=!1,c=!1;o&&(r=!ws(e),c=on(e),e=No(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?ei(Ks(e[d])):Ks(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(tt(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function Sb(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ee(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Tb(e,t,s={},n,a){if(Zt.ce||Zt.parent&&An(Zt.parent)&&Zt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Yi(),no(Vt,null,[xt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Yi();const l=i&&Dc(i(s)),o=s.key||l&&l.key,r=no(Vt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function Dc(e){return e.some(t=>Dn(t)?!(t.type===It||t.type===Vt&&!Dc(t.children)):!0)?e:null}function Cb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ga(n)]=e[n];return s}const Fr=e=>e?uh(e)?ml(e):Fr(e.parent):null,Pi=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Fr(e.parent),$root:e=>Fr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Pc(e),$forceUpdate:e=>e.f||(e.f=()=>{Cc(e.update)}),$nextTick:e=>e.n||(e.n=Rt.bind(e.proxy)),$watch:e=>Jg.bind(e)}),rr=(e,t)=>e!==Ge&&!e.__isScriptSetup&&nt(e,t),$r={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(rr(n,t))return l[t]=1,n[t];if(a!==Ge&&nt(a,t))return l[t]=2,a[t];if(nt(i,t))return l[t]=3,i[t];if(s!==Ge&&nt(s,t))return l[t]=4,s[t];Br&&(l[t]=0)}}const c=Pi[t];let d,u;if(c)return t==="$attrs"&&as(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&nt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,nt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return rr(a,t)?(a[t]=s,!0):n!==Ge&&nt(n,t)?(n[t]=s,!0):nt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ge&&o[0]!=="$"&&nt(e,o)||rr(t,o)||nt(i,o)||nt(n,o)||nt(Pi,o)||nt(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:nt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Eb=qe({},$r,{get(e,t){if(t!==Symbol.unscopables)return $r.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Dv(t)}});function Ab(){return null}function Rb(){return null}function Ib(e){}function Ob(e){}function Lb(){return null}function Nb(){}function Db(e,t){return null}function Pb(){return Mf().slots}function Mb(){return Mf().attrs}function Mf(e){const t=hs();return t.setupContext||(t.setupContext=mh(t))}function Ji(e){return Ee(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Fb(e,t){const s=Ji(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ee(a)||Pe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function $b(e,t){return!e||!t?e||t:Ee(e)&&Ee(t)?e.concat(t):qe({},Ji(e),Ji(t))}function Bb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function Ub(e){const t=hs(),s=_a;let n=e();Xi(),s&&Ya(!1);const a=()=>{hi(t),s&&Ya(!0)},i=()=>{hs()!==t&&t.scope.off(),Xi(),s&&Ya(!1)};return bc(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Br=!0;function Hb(e){const t=Pc(e),s=e.proxy,n=e.ctx;Br=!1,t.beforeCreate&&Vd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:w,beforeDestroy:L,beforeUnmount:_,destroyed:g,unmounted:b,render:R,renderTracked:C,renderTriggered:O,errorCaptured:A,serverPrefetch:x,expose:N,inheritAttrs:F,components:E,directives:M,filters:V}=t;if(c&&zb(c,n,null),l)for(const k in l){const S=l[k];Pe(S)&&(n[k]=S.bind(s))}if(a){const k=a.call(s,s);tt(k)&&(e.data=ea(k))}if(Br=!0,i)for(const k in i){const S=i[k],$=Pe(S)?S.bind(s,s):Pe(S.get)?S.get.bind(s,s):Yt,Z=!Pe(S)&&Pe(S.set)?S.set.bind(s):Yt,K=G({get:$,set:Z});Object.defineProperty(n,k,{enumerable:!0,configurable:!0,get:()=>K.value,set:Y=>K.value=Y})}if(o)for(const k in o)Ff(o[k],n,s,k);if(r){const k=Pe(r)?r.call(s):r;Reflect.ownKeys(k).forEach(S=>{Di(S,k[S])})}d&&Vd(d,e,"c");function T(k,S){Ee(S)?S.forEach($=>k($.bind(s))):S&&k(S.bind(s))}if(T(If,u),T(je,p),T(Oc,h),T(Bo,m),T(Qt,v),T(Gt,w),T(Df,A),T(Nf,C),T(Lf,O),T(Uo,_),T(ft,b),T(Of,x),Ee(N))if(N.length){const k=e.exposed||(e.exposed={});N.forEach(S=>{Object.defineProperty(k,S,{get:()=>s[S],set:$=>s[S]=$,enumerable:!0})})}else e.exposed||(e.exposed={});R&&e.render===Yt&&(e.render=R),F!=null&&(e.inheritAttrs=F),E&&(e.components=E),M&&(e.directives=M),x&&Ic(e)}function zb(e,t,s=Yt){Ee(e)&&(e=Ur(e));for(const n in e){const a=e[n];let i;tt(a)?"default"in a?i=Us(a.from||n,a.default,!0):i=Us(a.from||n):i=Us(a),Pt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function Vd(e,t,s){Is(Ee(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Ff(e,t,s,n){let a=n.includes(".")?wf(s,n):()=>s[n];if(Be(e)){const i=t[e];Pe(i)&&Mt(a,i)}else if(Pe(e))Mt(a,e.bind(s));else if(tt(e))if(Ee(e))e.forEach(i=>Ff(i,t,s,n));else{const i=Pe(e.handler)?e.handler.bind(s):t[e.handler];Pe(i)&&Mt(a,i,e)}}function Pc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>eo(r,c,l,!0)),eo(r,t,l)),tt(t)&&i.set(t,r),r}function eo(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&eo(e,i,s,!0),a&&a.forEach(l=>eo(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=jb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const jb={data:qd,props:Gd,emits:Gd,methods:Ri,computed:Ri,beforeCreate:cs,created:cs,beforeMount:cs,mounted:cs,beforeUpdate:cs,updated:cs,beforeDestroy:cs,beforeUnmount:cs,destroyed:cs,unmounted:cs,activated:cs,deactivated:cs,errorCaptured:cs,serverPrefetch:cs,components:Ri,directives:Ri,watch:qb,provide:qd,inject:Vb};function qd(e,t){return t?e?function(){return qe(Pe(e)?e.call(this,this):e,Pe(t)?t.call(this,this):t)}:t:e}function Vb(e,t){return Ri(Ur(e),Ur(t))}function Ur(e){if(Ee(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function cs(e,t){return e?[...new Set([].concat(e,t))]:t}function Ri(e,t){return e?qe(Object.create(null),e,t):t}function Gd(e,t){return e?Ee(e)&&Ee(t)?[...new Set([...e,...t])]:qe(Object.create(null),Ji(e),Ji(t??{})):t}function qb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=cs(e[n],t[n]);return s}function $f(){return{app:null,config:{isNativeTag:za,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let Gb=0;function Kb(e,t){return function(n,a=null){Pe(n)||(n=qe({},n)),a!=null&&!tt(a)&&(a=null);const i=$f(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:Gb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:gh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Pe(d.install)?(l.add(d),d.install(c,...u)):Pe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||xt(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,ml(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Is(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=va;va=c;try{return d()}finally{va=u}}};return c}}let va=null;function Wb(e,t,s=Ge){const n=hs(),a=pt(t),i=xs(t),l=Bf(e,a),o=uf((r,c)=>{let d,u=Ge,p;return _f(()=>{const h=e[a];jt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!jt(m,d)&&!(u!==Ge&&jt(h,u)))return;const v=n.vnode.props,w=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));w||(d=h,c()),n.emit(`update:${t}`,m),jt(h,u)&&(jt(h,m)&&!jt(m,p)||w&&u!==Ge&&!jt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ge:o,done:!1}:{done:!0}}}},o}const Bf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${pt(t)}Modifiers`]||e[`${xs(t)}Modifiers`];function Jb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&Bf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Be(d)?d.trim():d)),l.number&&(a=s.map(Ro)));let o,r=n[o=Ga(t)]||n[o=Ga(pt(t))];!r&&i&&(r=n[o=Ga(xs(t))]),r&&Is(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Is(c,e,6,a)}}const Zb=new WeakMap;function Uf(e,t,s=!1){const n=s?Zb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Pe(e)){const r=c=>{const d=Uf(c,t,!0);d&&(o=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(tt(e)&&n.set(e,null),null):(Ee(i)?i.forEach(r=>l[r]=null):qe(l,i),tt(e)&&n.set(e,l),l)}function Ho(e,t){return!e||!Sa(t)?!1:(t=t.slice(2).replace(/Once$/,""),nt(e,t[0].toLowerCase()+t.slice(1))||nt(e,xs(t))||nt(e,t))}function Ul(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,w=Wi(e);let L,_;try{if(s.shapeFlag&4){const b=a||n,R=b;L=ys(c.call(R,b,d,u,h,p,m)),_=o}else{const b=t;L=ys(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),_=t.props?o:Qb(o)}}catch(b){Mi.length=0,Ea(b,e,1),L=xt(It)}let g=L;if(_&&v!==!1){const b=Object.keys(_),{shapeFlag:R}=g;b.length&&R&7&&(i&&b.some(To)&&(_=Xb(_,i)),g=rn(g,_,!1,!0))}return s.dirs&&(g=rn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Nn(g,s.transition),L=g,Wi(w),L}function Yb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(Dn(a)){if(a.type!==It||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Qb=e=>{let t;for(const s in e)(s==="class"||s==="style"||Sa(s))&&((t||(t={}))[s]=e[s]);return t},Xb=(e,t)=>{const s={};for(const n in e)(!To(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function ey(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Kd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Hf(l,n,p)&&!Ho(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Kd(n,l,c):!0:!!l;return!1}function Kd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(Hf(t,e,i)&&!Ho(s,i))return!0}return!1}function Hf(e,t,s){const n=e[s],a=t[s];return s==="style"&&tt(n)&&tt(a)?!In(n,a):n!==a}function zo({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const zf={},jf=()=>Object.create(zf),Vf=e=>Object.getPrototypeOf(e)===zf;function ty(e,t,s,n=!1){const a={},i=jf();e.propsDefaults=Object.create(null),qf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:kc(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function sy(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Ze(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ho(e.emitsOptions,p))continue;const h=t[p];if(r)if(nt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=pt(p);a[m]=Hr(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{qf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!nt(t,u)&&((d=xs(u))===u||!nt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Hr(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!nt(t,u))&&(delete i[u],c=!0)}c&&_n(e.attrs,"set","")}function qf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Cn(r))continue;const c=t[r];let d;a&&nt(a,d=pt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Ho(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Ze(s),c=o||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Hr(a,r,u,c[u],e,!nt(c,u))}}return l}function Hr(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=nt(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Pe(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=hi(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===xs(s))&&(n=!0))}return n}const ny=new WeakMap;function Gf(e,t,s=!1){const n=s?ny:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Pe(e)){const d=u=>{r=!0;const[p,h]=Gf(u,t,!0);qe(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return tt(e)&&n.set(e,Va),Va;if(Ee(i))for(let d=0;d<i.length;d++){const u=pt(i[d]);Wd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=pt(d);if(Wd(u)){const p=i[d],h=l[u]=Ee(p)||Pe(p)?{type:p}:qe({},p),m=h.type;let v=!1,w=!0;if(Ee(m))for(let L=0;L<m.length;++L){const _=m[L],g=Pe(_)&&_.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(w=!1)}else v=Pe(m)&&m.name==="Boolean";h[0]=v,h[1]=w,(v||nt(h,"default"))&&o.push(u)}}const c=[l,o];return tt(e)&&n.set(e,c),c}function Wd(e){return e[0]!=="$"&&!Cn(e)}const Mc=e=>e==="_"||e==="_ctx"||e==="$stable",Fc=e=>Ee(e)?e.map(ys):[ys(e)],ay=(e,t,s)=>{if(t._n)return t;const n=Ec((...a)=>Fc(t(...a)),s);return n._c=!1,n},Kf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Mc(a))continue;const i=e[a];if(Pe(i))t[a]=ay(a,i,n);else if(i!=null){const l=Fc(i);t[a]=()=>l}}},Wf=(e,t)=>{const s=Fc(t);e.slots.default=()=>s},Jf=(e,t,s)=>{for(const n in t)(s||!Mc(n))&&(e[n]=t[n])},iy=(e,t,s)=>{const n=e.slots=jf();if(e.vnode.shapeFlag&32){const a=t._;a?(Jf(n,t,s),s&&Up(n,"_",a,!0)):Kf(t,n)}else t&&Wf(e,t)},ly=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Jf(a,t,s):(i=!t.$stable,Kf(t,a)),l=t}else t&&(Wf(e,t),l={default:1});if(i)for(const o in a)!Mc(o)&&l[o]==null&&delete a[o]},Nt=nh;function Zf(e){return Qf(e)}function Yf(e){return Qf(e,ib)}function Qf(e,t){const s=Io();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Yt,insertStaticContent:m}=e,v=(y,P,U,oe=null,ae=null,le=null,he=void 0,pe=null,ue=!!P.dynamicChildren)=>{if(y===P)return;y&&!Vs(y,P)&&(oe=X(y),Y(y,ae,le,!0),y=null),P.patchFlag===-2&&(ue=!1,P.dynamicChildren=null);const{type:re,ref:_e,shapeFlag:ve}=P;switch(re){case Yn:w(y,P,U,oe);break;case It:L(y,P,U,oe);break;case ga:y==null&&_(P,U,oe,he);break;case Vt:E(y,P,U,oe,ae,le,he,pe,ue);break;default:ve&1?R(y,P,U,oe,ae,le,he,pe,ue):ve&6?M(y,P,U,oe,ae,le,he,pe,ue):(ve&64||ve&128)&&re.process(y,P,U,oe,ae,le,he,pe,ue,z)}_e!=null&&ae?Ja(_e,y&&y.ref,le,P||y,!P):_e==null&&y&&y.ref!=null&&Ja(y.ref,null,le,y,!0)},w=(y,P,U,oe)=>{if(y==null)n(P.el=o(P.children),U,oe);else{const ae=P.el=y.el;P.children!==y.children&&c(ae,P.children)}},L=(y,P,U,oe)=>{y==null?n(P.el=r(P.children||""),U,oe):P.el=y.el},_=(y,P,U,oe)=>{[y.el,y.anchor]=m(y.children,P,U,oe,y.el,y.anchor)},g=({el:y,anchor:P},U,oe)=>{let ae;for(;y&&y!==P;)ae=p(y),n(y,U,oe),y=ae;n(P,U,oe)},b=({el:y,anchor:P})=>{let U;for(;y&&y!==P;)U=p(y),a(y),y=U;a(P)},R=(y,P,U,oe,ae,le,he,pe,ue)=>{if(P.type==="svg"?he="svg":P.type==="math"&&(he="mathml"),y==null)C(P,U,oe,ae,le,he,pe,ue);else{const re=y.el&&y.el._isVueCE?y.el:null;try{re&&re._beginPatch(),x(y,P,ae,le,he,pe,ue)}finally{re&&re._endPatch()}}},C=(y,P,U,oe,ae,le,he,pe)=>{let ue,re;const{props:_e,shapeFlag:ve,transition:we,dirs:Ie}=y;if(ue=y.el=l(y.type,le,_e&&_e.is,_e),ve&8?d(ue,y.children):ve&16&&A(y.children,ue,null,oe,ae,cr(y,le),he,pe),Ie&&nn(y,null,oe,"created"),O(ue,y,y.scopeId,he,oe),_e){for(const ge in _e)ge!=="value"&&!Cn(ge)&&i(ue,ge,null,_e[ge],le,oe);"value"in _e&&i(ue,"value",null,_e.value,le),(re=_e.onVnodeBeforeMount)&&gs(re,oe,y)}Ie&&nn(y,null,oe,"beforeMount");const B=Xf(ae,we);B&&we.beforeEnter(ue),n(ue,P,U),((re=_e&&_e.onVnodeMounted)||B||Ie)&&Nt(()=>{try{re&&gs(re,oe,y),B&&we.enter(ue),Ie&&nn(y,null,oe,"mounted")}finally{}},ae)},O=(y,P,U,oe,ae)=>{if(U&&h(y,U),oe)for(let le=0;le<oe.length;le++)h(y,oe[le]);if(ae){let le=ae.subTree;if(P===le||so(le.type)&&(le.ssContent===P||le.ssFallback===P)){const he=ae.vnode;O(y,he,he.scopeId,he.slotScopeIds,ae.parent)}}},A=(y,P,U,oe,ae,le,he,pe,ue=0)=>{for(let re=ue;re<y.length;re++){const _e=y[re]=pe?yn(y[re]):ys(y[re]);v(null,_e,P,U,oe,ae,le,he,pe)}},x=(y,P,U,oe,ae,le,he)=>{const pe=P.el=y.el;let{patchFlag:ue,dynamicChildren:re,dirs:_e}=P;ue|=y.patchFlag&16;const ve=y.props||Ge,we=P.props||Ge;let Ie;if(U&&ia(U,!1),(Ie=we.onVnodeBeforeUpdate)&&gs(Ie,U,P,y),_e&&nn(P,y,U,"beforeUpdate"),U&&ia(U,!0),(ve.innerHTML&&we.innerHTML==null||ve.textContent&&we.textContent==null)&&d(pe,""),re?N(y.dynamicChildren,re,pe,U,oe,cr(P,ae),le):he||S(y,P,pe,null,U,oe,cr(P,ae),le,!1),ue>0){if(ue&16)F(pe,ve,we,U,ae);else if(ue&2&&ve.class!==we.class&&i(pe,"class",null,we.class,ae),ue&4&&i(pe,"style",ve.style,we.style,ae),ue&8){const B=P.dynamicProps;for(let ge=0;ge<B.length;ge++){const Se=B[ge],Oe=ve[Se],Me=we[Se];(Me!==Oe||Se==="value")&&i(pe,Se,Oe,Me,ae,U)}}ue&1&&y.children!==P.children&&d(pe,P.children)}else!he&&re==null&&F(pe,ve,we,U,ae);((Ie=we.onVnodeUpdated)||_e)&&Nt(()=>{Ie&&gs(Ie,U,P,y),_e&&nn(P,y,U,"updated")},oe)},N=(y,P,U,oe,ae,le,he)=>{for(let pe=0;pe<P.length;pe++){const ue=y[pe],re=P[pe],_e=ue.el&&(ue.type===Vt||!Vs(ue,re)||ue.shapeFlag&198)?u(ue.el):U;v(ue,re,_e,null,oe,ae,le,he,!0)}},F=(y,P,U,oe,ae)=>{if(P!==U){if(P!==Ge)for(const le in P)!Cn(le)&&!(le in U)&&i(y,le,P[le],null,ae,oe);for(const le in U){if(Cn(le))continue;const he=U[le],pe=P[le];he!==pe&&le!=="value"&&i(y,le,pe,he,ae,oe)}"value"in U&&i(y,"value",P.value,U.value,ae)}},E=(y,P,U,oe,ae,le,he,pe,ue)=>{const re=P.el=y?y.el:o(""),_e=P.anchor=y?y.anchor:o("");let{patchFlag:ve,dynamicChildren:we,slotScopeIds:Ie}=P;Ie&&(pe=pe?pe.concat(Ie):Ie),y==null?(n(re,U,oe),n(_e,U,oe),A(P.children||[],U,_e,ae,le,he,pe,ue)):ve>0&&ve&64&&we&&y.dynamicChildren&&y.dynamicChildren.length===we.length?(N(y.dynamicChildren,we,U,ae,le,he,pe),(P.key!=null||ae&&P===ae.subTree)&&$c(y,P,!0)):S(y,P,U,_e,ae,le,he,pe,ue)},M=(y,P,U,oe,ae,le,he,pe,ue)=>{P.slotScopeIds=pe,y==null?P.shapeFlag&512?ae.ctx.activate(P,U,oe,he,ue):V(P,U,oe,ae,le,he,ue):J(y,P,ue)},V=(y,P,U,oe,ae,le,he)=>{const pe=y.component=dh(y,oe,ae);if(hl(y)&&(pe.ctx.renderer=z),ph(pe,!1,he),pe.asyncDep){if(ae&&ae.registerDep(pe,T,he),!y.el){const ue=pe.subTree=xt(It);L(null,ue,P,U),y.placeholder=ue.el}}else T(pe,y,P,U,ae,le,he)},J=(y,P,U)=>{const oe=P.component=y.component;if(ey(y,P,U))if(oe.asyncDep&&!oe.asyncResolved){k(oe,P,U);return}else oe.next=P,oe.update();else P.el=y.el,oe.vnode=P},T=(y,P,U,oe,ae,le,he)=>{const pe=()=>{if(y.isMounted){let{next:ve,bu:we,u:Ie,parent:B,vnode:ge}=y;{const st=eh(y);if(st){ve&&(ve.el=ge.el,k(y,ve,he)),st.asyncDep.then(()=>{Nt(()=>{y.isUnmounted||re()},ae)});return}}let Se=ve,Oe;ia(y,!1),ve?(ve.el=ge.el,k(y,ve,he)):ve=ge,we&&Ka(we),(Oe=ve.props&&ve.props.onVnodeBeforeUpdate)&&gs(Oe,B,ve,ge),ia(y,!0);const Me=Ul(y),dt=y.subTree;y.subTree=Me,v(dt,Me,u(dt.el),X(dt),y,ae,le),ve.el=Me.el,Se===null&&zo(y,Me.el),Ie&&Nt(Ie,ae),(Oe=ve.props&&ve.props.onVnodeUpdated)&&Nt(()=>gs(Oe,B,ve,ge),ae)}else{let ve;const{el:we,props:Ie}=P,{bm:B,m:ge,parent:Se,root:Oe,type:Me}=y,dt=An(P);if(ia(y,!1),B&&Ka(B),!dt&&(ve=Ie&&Ie.onVnodeBeforeMount)&&gs(ve,Se,P),ia(y,!0),we&&fe){const st=()=>{y.subTree=Ul(y),fe(we,y.subTree,y,ae,null)};dt&&Me.__asyncHydrate?Me.__asyncHydrate(we,y,st):st()}else{Oe.ce&&Oe.ce._hasShadowRoot()&&Oe.ce._injectChildStyle(Me,y.parent?y.parent.type:void 0);const st=y.subTree=Ul(y);v(null,st,U,oe,y,ae,le),P.el=st.el}if(ge&&Nt(ge,ae),!dt&&(ve=Ie&&Ie.onVnodeMounted)){const st=P;Nt(()=>gs(ve,Se,st),ae)}(P.shapeFlag&256||Se&&An(Se.vnode)&&Se.vnode.shapeFlag&256)&&y.a&&Nt(y.a,ae),y.isMounted=!0,P=U=oe=null}};y.scope.on();const ue=y.effect=new ji(pe);y.scope.off();const re=y.update=ue.run.bind(ue),_e=y.job=ue.runIfDirty.bind(ue);_e.i=y,_e.id=y.uid,ue.scheduler=()=>Cc(_e),ia(y,!0),re()},k=(y,P,U)=>{P.component=y;const oe=y.vnode.props;y.vnode=P,y.next=null,sy(y,P.props,oe,U),ly(y,P.children,U),On(),Pd(y),Ln()},S=(y,P,U,oe,ae,le,he,pe,ue=!1)=>{const re=y&&y.children,_e=y?y.shapeFlag:0,ve=P.children,{patchFlag:we,shapeFlag:Ie}=P;if(we>0){if(we&128){Z(re,ve,U,oe,ae,le,he,pe,ue);return}else if(we&256){$(re,ve,U,oe,ae,le,he,pe,ue);return}}Ie&8?(_e&16&&Ne(re,ae,le),ve!==re&&d(U,ve)):_e&16?Ie&16?Z(re,ve,U,oe,ae,le,he,pe,ue):Ne(re,ae,le,!0):(_e&8&&d(U,""),Ie&16&&A(ve,U,oe,ae,le,he,pe,ue))},$=(y,P,U,oe,ae,le,he,pe,ue)=>{y=y||Va,P=P||Va;const re=y.length,_e=P.length,ve=Math.min(re,_e);let we;for(we=0;we<ve;we++){const Ie=P[we]=ue?yn(P[we]):ys(P[we]);v(y[we],Ie,U,null,ae,le,he,pe,ue)}re>_e?Ne(y,ae,le,!0,!1,ve):A(P,U,oe,ae,le,he,pe,ue,ve)},Z=(y,P,U,oe,ae,le,he,pe,ue)=>{let re=0;const _e=P.length;let ve=y.length-1,we=_e-1;for(;re<=ve&&re<=we;){const Ie=y[re],B=P[re]=ue?yn(P[re]):ys(P[re]);if(Vs(Ie,B))v(Ie,B,U,null,ae,le,he,pe,ue);else break;re++}for(;re<=ve&&re<=we;){const Ie=y[ve],B=P[we]=ue?yn(P[we]):ys(P[we]);if(Vs(Ie,B))v(Ie,B,U,null,ae,le,he,pe,ue);else break;ve--,we--}if(re>ve){if(re<=we){const Ie=we+1,B=Ie<_e?P[Ie].el:oe;for(;re<=we;)v(null,P[re]=ue?yn(P[re]):ys(P[re]),U,B,ae,le,he,pe,ue),re++}}else if(re>we)for(;re<=ve;)Y(y[re],ae,le,!0),re++;else{const Ie=re,B=re,ge=new Map;for(re=B;re<=we;re++){const rt=P[re]=ue?yn(P[re]):ys(P[re]);rt.key!=null&&ge.set(rt.key,re)}let Se,Oe=0;const Me=we-B+1;let dt=!1,st=0;const _t=new Array(Me);for(re=0;re<Me;re++)_t[re]=0;for(re=Ie;re<=ve;re++){const rt=y[re];if(Oe>=Me){Y(rt,ae,le,!0);continue}let Qe;if(rt.key!=null)Qe=ge.get(rt.key);else for(Se=B;Se<=we;Se++)if(_t[Se-B]===0&&Vs(rt,P[Se])){Qe=Se;break}Qe===void 0?Y(rt,ae,le,!0):(_t[Qe-B]=re+1,Qe>=st?st=Qe:dt=!0,v(rt,P[Qe],U,null,ae,le,he,pe,ue),Oe++)}const Ot=dt?oy(_t):Va;for(Se=Ot.length-1,re=Me-1;re>=0;re--){const rt=B+re,Qe=P[rt],ie=P[rt+1],Te=rt+1<_e?ie.el||th(ie):oe;_t[re]===0?v(null,Qe,U,Te,ae,le,he,pe,ue):dt&&(Se<0||re!==Ot[Se]?K(Qe,U,Te,2):Se--)}}},K=(y,P,U,oe,ae=null)=>{const{el:le,type:he,transition:pe,children:ue,shapeFlag:re}=y;if(re&6){K(y.component.subTree,P,U,oe);return}if(re&128){y.suspense.move(P,U,oe);return}if(re&64){he.move(y,P,U,z);return}if(he===Vt){n(le,P,U);for(let ve=0;ve<ue.length;ve++)K(ue[ve],P,U,oe);n(y.anchor,P,U);return}if(he===ga){g(y,P,U);return}if(oe!==2&&re&1&&pe)if(oe===0)pe.persisted&&!le[Ms]?n(le,P,U):(pe.beforeEnter(le),n(le,P,U),Nt(()=>pe.enter(le),ae));else{const{leave:ve,delayLeave:we,afterLeave:Ie}=pe,B=()=>{y.ctx.isUnmounted?a(le):n(le,P,U)},ge=()=>{const Se=le._isLeaving||!!le[Ms];le._isLeaving&&le[Ms](!0),pe.persisted&&!Se?B():ve(le,()=>{B(),Ie&&Ie()})};we?we(le,B,ge):ge()}else n(le,P,U)},Y=(y,P,U,oe=!1,ae=!1)=>{const{type:le,props:he,ref:pe,children:ue,dynamicChildren:re,shapeFlag:_e,patchFlag:ve,dirs:we,cacheIndex:Ie,memo:B}=y;if(ve===-2&&(ae=!1),pe!=null&&(On(),Ja(pe,null,U,y,!0),Ln()),Ie!=null&&(P.renderCache[Ie]=void 0),_e&256){P.ctx.deactivate(y);return}const ge=_e&1&&we,Se=!An(y);let Oe;if(Se&&(Oe=he&&he.onVnodeBeforeUnmount)&&gs(Oe,P,y),_e&6)de(y.component,U,oe);else{if(_e&128){y.suspense.unmount(U,oe);return}ge&&nn(y,null,P,"beforeUnmount"),_e&64?y.type.remove(y,P,U,z,oe):re&&!re.hasOnce&&(le!==Vt||ve>0&&ve&64)?Ne(re,P,U,!1,!0):(le===Vt&&ve&384||!ae&&_e&16)&&Ne(ue,P,U),oe&&ce(y)}const Me=B!=null&&Ie==null;(Se&&(Oe=he&&he.onVnodeUnmounted)||ge||Me)&&Nt(()=>{Oe&&gs(Oe,P,y),ge&&nn(y,null,P,"unmounted"),Me&&(y.el=null)},U)},ce=y=>{const{type:P,el:U,anchor:oe,transition:ae}=y;if(P===Vt){te(U,oe);return}if(P===ga){b(y);return}const le=()=>{a(U),ae&&!ae.persisted&&ae.afterLeave&&ae.afterLeave()};if(y.shapeFlag&1&&ae&&!ae.persisted){const{leave:he,delayLeave:pe}=ae,ue=()=>he(U,le);pe?pe(y.el,le,ue):ue()}else le()},te=(y,P)=>{let U;for(;y!==P;)U=p(y),a(y),y=U;a(P)},de=(y,P,U)=>{const{bum:oe,scope:ae,job:le,subTree:he,um:pe,m:ue,a:re}=y;to(ue),to(re),oe&&Ka(oe),ae.stop(),le&&(le.flags|=8,Y(he,y,P,U)),pe&&Nt(pe,P),Nt(()=>{y.isUnmounted=!0},P)},Ne=(y,P,U,oe=!1,ae=!1,le=0)=>{for(let he=le;he<y.length;he++)Y(y[he],P,U,oe,ae)},X=y=>{if(y.shapeFlag&6)return X(y.component.subTree);if(y.shapeFlag&128)return y.suspense.next();const P=p(y.anchor||y.el),U=P&&P[kf];return U?p(U):P};let be=!1;const q=(y,P,U)=>{let oe;y==null?P._vnode&&(Y(P._vnode,null,null,!0),oe=P._vnode.component):v(P._vnode||null,y,P,null,null,null,U),P._vnode=y,be||(be=!0,Pd(oe),Ql(),be=!1)},z={p:v,um:Y,m:K,r:ce,mt:V,mc:A,pc:S,pbc:N,n:X,o:e};let se,fe;return t&&([se,fe]=t(z)),{render:q,hydrate:se,createApp:Kb(q,se)}}function cr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function ia({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Xf(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function $c(e,t,s=!1){const n=e.children,a=t.children;if(Ee(n)&&Ee(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=yn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&$c(l,o)),o.type===Yn&&(o.patchFlag===-1&&(o=a[i]=yn(o)),o.el=l.el),o.type===It&&!o.el&&(o.el=l.el)}}function oy(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function eh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:eh(t)}function to(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function th(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?th(t.subTree):null}const so=e=>e.__isSuspense;let zr=0;const ry={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)dy(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}uy(e,t,s,n,a,l,o,r,c)}},hydrate:py,normalize:fy},cy=ry;function Zi(e,t){const s=e.props&&e.props[t];Pe(s)&&s()}function dy(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=sh(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Zi(e,"onPending"),Zi(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Za(p,e.ssFallback)):p.resolve(!1,!0)}function uy(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:w,isHydrating:L}=u;if(v)u.pendingBranch=p,Vs(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():w&&(L||(r(m,h,s,n,a,null,i,l,o),Za(u,h)))):(u.pendingId=zr++,L?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),w?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,n,a,null,i,l,o),Za(u,h))):m&&Vs(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Vs(m,p))r(m,p,s,n,a,u,i,l,o),Za(u,p);else if(Zi(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=zr++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:_,pendingId:g}=u;_>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},_):_===0&&u.fallback(h)}}function sh(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:w}}=c;let L;const _=hy(e);_&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const g=e.props?Kl(e.props.timeout):void 0,b=i,R={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:zr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(C=!1,O=!1){const{vnode:A,activeBranch:x,pendingBranch:N,pendingId:F,effects:E,parentComponent:M,container:V,isInFallback:J}=R;let T=!1;if(R.isHydrating)R.isHydrating=!1;else if(!C){T=x&&N.transition&&N.transition.mode==="out-in";let $=!1;T&&(x.transition.afterLeave=()=>{F===R.pendingId&&(p(N,V,i===b&&!$?m(x):i,0),Gi(E),J&&A.ssFallback&&(A.ssFallback.el=null))}),x&&!R.isFallbackMountPending&&(v(x.el)===V&&(i=m(x),$=!0),h(x,M,R,!0),!T&&J&&A.ssFallback&&Nt(()=>A.ssFallback.el=null,R)),T||p(N,V,i,0)}R.isFallbackMountPending=!1,Za(R,N),R.pendingBranch=null,R.isInFallback=!1;let k=R.parent,S=!1;for(;k;){if(k.pendingBranch){k.effects.push(...E),S=!0;break}k=k.parent}!S&&!T&&Gi(E),R.effects=[],_&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),Zi(A,"onResolve")},fallback(C){if(!R.pendingBranch)return;const{vnode:O,activeBranch:A,parentComponent:x,container:N,namespace:F}=R;Zi(O,"onFallback");const E=m(A),M=()=>{R.isFallbackMountPending=!1,R.isInFallback&&(u(null,C,N,E,x,null,F,o,r),Za(R,C))},V=C.transition&&C.transition.mode==="out-in";V&&(R.isFallbackMountPending=!0,A.transition.afterLeave=M),R.isInFallback=!0,h(A,x,null,!0),V||M()},move(C,O,A){R.activeBranch&&p(R.activeBranch,C,O,A),R.container=C},next(){return R.activeBranch&&m(R.activeBranch)},registerDep(C,O,A){const x=!!R.pendingBranch;x&&R.deps++;const N=C.vnode.el;C.asyncDep.catch(F=>{Ea(F,C,0)}).then(F=>{if(C.isUnmounted||R.isUnmounted||R.pendingId!==C.suspenseId)return;Xi(),C.asyncResolved=!0;const{vnode:E}=C;jr(C,F,!1),N&&(E.el=N);const M=!N&&C.subTree.el;O(C,E,v(N||C.subTree.el),N?null:m(C.subTree),R,l,A),M&&(E.placeholder=null,w(M)),zo(C,E.el),x&&--R.deps===0&&R.resolve()})},unmount(C,O){R.isUnmounted=!0,R.activeBranch&&h(R.activeBranch,s,C,O),R.pendingBranch&&h(R.pendingBranch,s,C,O)}};return R}function py(e,t,s,n,a,i,l,o,r){const c=t.suspense=sh(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function fy(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Jd(n?s.default:s),e.ssFallback=n?Jd(s.fallback):xt(It)}function Jd(e){let t;if(Pe(e)){const s=xa&&e._c;s&&(e._d=!1,Yi()),e=e(),s&&(e._d=!0,t=is,ah())}return Ee(e)&&(e=Yb(e)),e=ys(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function nh(e,t){t&&t.pendingBranch?Ee(e)?t.effects.push(...e):t.effects.push(e):Gi(e)}function Za(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,zo(n,a))}function hy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Vt=Symbol.for("v-fgt"),Yn=Symbol.for("v-txt"),It=Symbol.for("v-cmt"),ga=Symbol.for("v-stc"),Mi=[];let is=null;function Yi(e=!1){Mi.push(is=e?null:[])}function ah(){Mi.pop(),is=Mi[Mi.length-1]||null}let xa=1;function Qi(e,t=!1){xa+=e,e<0&&is&&t&&(is.hasOnce=!0)}function ih(e){return e.dynamicChildren=xa>0?is||Va:null,ah(),xa>0&&is&&is.push(e),e}function my(e,t,s,n,a,i){return ih(Bc(e,t,s,n,a,i,!0))}function no(e,t,s,n,a){return ih(xt(e,t,s,n,a,!0))}function Dn(e){return e?e.__v_isVNode===!0:!1}function Vs(e,t){return e.type===t.type&&e.key===t.key}function vy(e){}const lh=({key:e})=>e??null,Hl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Pt(e)||Pe(e)?{i:Zt,r:e,k:t,f:!!s}:e:null);function Bc(e,t=null,s=null,n=0,a=null,i=e===Vt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&lh(t),ref:t&&Hl(t),scopeId:Mo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Zt};return o?(Hc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),xa>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const xt=gy;function gy(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Pf)&&(e=It),Dn(e)){const o=rn(e,t,!0);return s&&Hc(o,s),xa>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Sy(e)&&(e=e.__vccOpts),t){t=oh(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=dl(o)),tt(r)&&(ul(r)&&!Ee(r)&&(r=qe({},r)),t.style=cl(r))}const l=Be(e)?1:so(e)?128:Sf(e)?64:tt(e)?4:Pe(e)?2:0;return Bc(e,t,s,n,a,l,i,!0)}function oh(e){return e?ul(e)||Vf(e)?qe({},e):e:null}function rn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?ch(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&lh(c),ref:t&&t.ref?s&&i?Ee(i)?i.concat(Hl(t)):[i,Hl(t)]:Hl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Vt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&rn(e.ssContent),ssFallback:e.ssFallback&&rn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&Nn(d,r.clone(d)),d}function Uc(e=" ",t=0){return xt(Yn,null,e,t)}function by(e,t){const s=xt(ga,null,e);return s.staticCount=t,s}function rh(e="",t=!1){return t?(Yi(),no(It,null,e)):xt(It,null,e)}function ys(e){return e==null||typeof e=="boolean"?xt(It):Ee(e)?xt(Vt,null,e.slice()):Dn(e)?yn(e):xt(Yn,null,String(e))}function yn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:rn(e)}function Hc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ee(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),Hc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!Vf(t)?t._ctx=Zt:a===3&&Zt&&(Zt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Pe(t)?(t={default:t,_ctx:Zt},s=32):(t=String(t),n&64?(s=16,t=[Uc(t)]):s=8);e.children=t,e.shapeFlag|=s}function ch(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=dl([t.class,n.class]));else if(a==="style")t.style=cl([t.style,n.style]);else if(Sa(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ee(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!To(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function gs(e,t,s,n=null){Is(e,t,7,[s,n])}const yy=$f();let xy=0;function dh(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||yy,i={uid:xy++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new yc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Gf(n,a),emitsOptions:Uf(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Jb.bind(null,i),e.ce&&e.ce(i),i}let Jt=null;const hs=()=>Jt||Zt;let ao,Ya;{const e=Io(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};ao=t("__VUE_INSTANCE_SETTERS__",s=>Jt=s),Ya=t("__VUE_SSR_SETTERS__",s=>_a=s)}const hi=e=>{const t=Jt;return ao(e),e.scope.on(),()=>{e.scope.off(),ao(t)}},Xi=()=>{Jt&&Jt.scope.off(),ao(null)};function uh(e){return e.vnode.shapeFlag&4}let _a=!1;function ph(e,t=!1,s=!1){t&&Ya(t);const{props:n,children:a}=e.vnode,i=uh(e);ty(e,n,i,t),iy(e,a,s||t);const l=i?_y(e,t):void 0;return t&&Ya(!1),l}function _y(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,$r);const{setup:n}=s;if(n){On();const a=e.setupContext=n.length>1?mh(e):null,i=hi(e),l=fi(n,e,0,[e.props,a]),o=bc(l);if(Ln(),i(),(o||e.sp)&&!An(e)&&Ic(e),o){if(l.then(Xi,Xi),t)return l.then(r=>{jr(e,r,t)}).catch(r=>{Ea(r,e,0)});e.asyncDep=l}else jr(e,l,t)}else hh(e,t)}function jr(e,t,s){Pe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:tt(t)&&(e.setupState=Tc(t)),hh(e,s)}let io,Vr;function fh(e){io=e,Vr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Eb))}}const wy=()=>!io;function hh(e,t,s){const n=e.type;if(!e.render){if(!t&&io&&!n.render){const a=n.template||Pc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=qe(qe({isCustomElement:i,delimiters:o},l),r);n.render=io(a,c)}}e.render=n.render||Yt,Vr&&Vr(e)}{const a=hi(e);On();try{Hb(e)}finally{Ln(),a()}}}const ky={get(e,t){return as(e,"get",""),e[t]}};function mh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,ky),slots:e.slots,emit:e.emit,expose:t}}function ml(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Tc(cf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Pi)return Pi[s](e)},has(t,s){return s in t||s in Pi}})):e.proxy}function qr(e,t=!0){return Pe(e)?e.displayName||e.name:e.name||t&&e.__name}function Sy(e){return Pe(e)&&"__vccOpts"in e}const G=(e,t)=>Ig(e,t,_a);function si(e,t,s){try{Qi(-1);const n=arguments.length;return n===2?tt(t)&&!Ee(t)?Dn(t)?xt(e,null,[t]):xt(e,t):xt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&Dn(s)&&(s=[s]),xt(e,t,s))}finally{Qi(1)}}function Ty(){}function Cy(e,t,s,n){const a=s[n];if(a&&vh(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function vh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(jt(s[n],t[n]))return!1;return xa>0&&is&&is.push(e),!0}const gh="3.5.38",Ey=Yt,Ay=Bg,Ry=Ba,Iy=bf,Oy={createComponentInstance:dh,setupComponent:ph,renderComponentRoot:Ul,setCurrentRenderingInstance:Wi,isVNode:Dn,normalizeVNode:ys,getComponentPublicInstance:ml,ensureValidVNode:Dc,pushWarningContext:Pg,popWarningContext:Mg},Ly=Oy,Ny=null,Dy=null,Py=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Gr;const Zd=typeof window<"u"&&window.trustedTypes;if(Zd)try{Gr=Zd.createPolicy("vue",{createHTML:e=>e})}catch{}const bh=Gr?e=>Gr.createHTML(e):e=>e,My="http://www.w3.org/2000/svg",Fy="http://www.w3.org/1998/Math/MathML",bn=typeof document<"u"?document:null,Yd=bn&&bn.createElement("template"),yh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?bn.createElementNS(My,e):t==="mathml"?bn.createElementNS(Fy,e):s?bn.createElement(e,{is:s}):bn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>bn.createTextNode(e),createComment:e=>bn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>bn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Yd.innerHTML=bh(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=Yd.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},zn="transition",yi="animation",ni=Symbol("_vtc"),xh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},_h=qe({},Rc,xh),$y=e=>(e.displayName="Transition",e.props=_h,e),By=$y((e,{slots:t})=>si(Ef,wh(e),t)),la=(e,t=[])=>{Ee(e)?e.forEach(s=>s(...t)):e&&e(...t)},Qd=e=>e?Ee(e)?e.some(t=>t.length>1):e.length>1:!1;function wh(e){const t={};for(const E in e)E in xh||(t[E]=e[E]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=Uy(a),v=m&&m[0],w=m&&m[1],{onBeforeEnter:L,onEnter:_,onEnterCancelled:g,onLeave:b,onLeaveCancelled:R,onBeforeAppear:C=L,onAppear:O=_,onAppearCancelled:A=g}=t,x=(E,M,V,J)=>{E._enterCancelled=J,Gn(E,M?d:o),Gn(E,M?c:l),V&&V()},N=(E,M)=>{E._isLeaving=!1,Gn(E,u),Gn(E,h),Gn(E,p),M&&M()},F=E=>(M,V)=>{const J=E?O:_,T=()=>x(M,E,V);la(J,[M,T]),Xd(()=>{Gn(M,E?r:i),Xs(M,E?d:o),Qd(J)||eu(M,n,v,T)})};return qe(t,{onBeforeEnter(E){la(L,[E]),Xs(E,i),Xs(E,l)},onBeforeAppear(E){la(C,[E]),Xs(E,r),Xs(E,c)},onEnter:F(!1),onAppear:F(!0),onLeave(E,M){E._isLeaving=!0;const V=()=>N(E,M);Xs(E,u),E._enterCancelled?(Xs(E,p),Kr(E)):(Kr(E),Xs(E,p)),Xd(()=>{E._isLeaving&&(Gn(E,u),Xs(E,h),Qd(b)||eu(E,n,w,V))}),la(b,[E,V])},onEnterCancelled(E){x(E,!1,void 0,!0),la(g,[E])},onAppearCancelled(E){x(E,!0,void 0,!0),la(A,[E])},onLeaveCancelled(E){N(E),la(R,[E])}})}function Uy(e){if(e==null)return null;if(tt(e))return[dr(e.enter),dr(e.leave)];{const t=dr(e);return[t,t]}}function dr(e){return Kl(e)}function Xs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[ni]||(e[ni]=new Set)).add(t)}function Gn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[ni];s&&(s.delete(t),s.size||(e[ni]=void 0))}function Xd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Hy=0;function eu(e,t,s,n){const a=e._endId=++Hy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=kh(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function kh(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${zn}Delay`),i=n(`${zn}Duration`),l=tu(a,i),o=n(`${yi}Delay`),r=n(`${yi}Duration`),c=tu(o,r);let d=null,u=0,p=0;t===zn?l>0&&(d=zn,u=l,p=i.length):t===yi?c>0&&(d=yi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?zn:yi:null,p=d?d===zn?i.length:r.length:0);const h=d===zn&&/\b(?:transform|all)(?:,|$)/.test(n(`${zn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function tu(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>su(s)+su(e[n])))}function su(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Kr(e){return(e?e.ownerDocument:document).body.offsetHeight}function zy(e,t,s){const n=e[ni];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const lo=Symbol("_vod"),zc=Symbol("_vsh"),Sh={name:"show",beforeMount(e,{value:t},{transition:s}){e[lo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):xi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),xi(e,!0),n.enter(e)):n.leave(e,()=>{xi(e,!1)}):xi(e,t))},beforeUnmount(e,{value:t}){xi(e,t)}};function xi(e,t){e.style.display=t?e[lo]:"none",e[zc]=!t}function jy(){Sh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Th=Symbol("");function Vy(e){const t=hs();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>oo(i,a))},n=()=>{const a=e(t.proxy);t.ce?oo(t.ce,a):Wr(t.subTree,a),s(a)};Oc(()=>{Gi(n)}),je(()=>{Mt(n,Yt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),ft(()=>a.disconnect())})}function Wr(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Wr(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)oo(e.el,t);else if(e.type===Vt)e.children.forEach(s=>Wr(s,t));else if(e.type===ga){let{el:s,anchor:n}=e;for(;s&&(oo(s,t),s!==n);)s=s.nextSibling}}function oo(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Zv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Th]=n}}const qy=/(?:^|;)\s*display\s*:/;function Gy(e,t,s){const n=e.style,a=Be(s);let i=!1;if(s&&!a){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&Ii(n,o,"")}else for(const l in t)s[l]==null&&Ii(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?Wy(e,l,!Be(t)&&t?t[l]:void 0,o)||Ii(n,l,o):Ii(n,l,"")}}else if(a){if(t!==s){const l=n[Th];l&&(s+=";"+l),n.cssText=s,i=qy.test(s)}}else t&&e.removeAttribute("style");lo in e&&(e[lo]=i?n.display:"",e[zc]&&(n.display="none"))}const nu=/\s*!important$/;function Ii(e,t,s){if(Ee(s))s.forEach(n=>Ii(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=Ky(e,t);nu.test(s)?e.setProperty(xs(n),s.replace(nu,""),"important"):e[n]=s}}const au=["Webkit","Moz","ms"],ur={};function Ky(e,t){const s=ur[t];if(s)return s;let n=pt(t);if(n!=="filter"&&n in e)return ur[t]=n;n=Ca(n);for(let a=0;a<au.length;a++){const i=au[a]+n;if(i in e)return ur[t]=i}return t}function Wy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(n)&&s===n}const iu="http://www.w3.org/1999/xlink";function lu(e,t,s,n,a,i=Wv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(iu,t.slice(6,t.length)):e.setAttributeNS(iu,t,s):s==null||i&&!zp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function ou(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?bh(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=zp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function kn(e,t,s,n){e.addEventListener(t,s,n)}function Jy(e,t,s,n){e.removeEventListener(t,s,n)}const ru=Symbol("_vei");function Zy(e,t,s,n,a=null){const i=e[ru]||(e[ru]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=Yy(t);if(n){const c=i[t]=ex(n,a);kn(e,o,c,r)}else l&&(Jy(e,o,l,r),i[t]=void 0)}}const cu=/(?:Once|Passive|Capture)$/;function Yy(e){let t;if(cu.test(e)){t={};let n;for(;n=e.match(cu);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):xs(e.slice(2)),t]}let pr=0;const Qy=Promise.resolve(),Xy=()=>pr||(Qy.then(()=>pr=0),pr=Date.now());function ex(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ee(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&Is(c,t,5,o)}}else Is(a,t,5,[n])};return s.value=e,s.attached=Xy(),s}const du=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Ch=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?zy(e,n,l):t==="style"?Gy(e,s,n):Sa(t)?To(t)||Zy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):tx(e,t,n,l))?(ou(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&lu(e,t,n,l,i,t!=="value")):e._isVueCE&&(sx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(n)))?ou(e,pt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),lu(e,t,n,l))};function tx(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&du(t)&&Pe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return du(t)&&Be(s)?!1:t in e}function sx(e,t){const s=e._def.props;if(!s)return!1;const n=pt(t);return Array.isArray(s)?s.some(a=>pt(a)===n):Object.keys(s).some(a=>pt(a)===n)}const uu={};function Eh(e,t,s){let n=fl(e,t);Co(n)&&(n=qe({},n,t));class a extends jo{constructor(l){super(n,l,s)}}return a.def=n,a}const nx=((e,t)=>Eh(e,t,Uh)),ax=typeof HTMLElement<"u"?HTMLElement:class{};class jo extends ax{constructor(t,s={},n=uo){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==uo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof jo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Rt(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ee(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Kl(this._props[r])),(o||(o=Object.create(null)))[pt(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)nt(this,n)||Object.defineProperty(this,n,{get:()=>ln(s[n])})}_resolveProps(t){const{props:s}=t,n=Ee(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(pt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):uu;const a=pt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Kl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===uu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(xs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(xs(t),s+""):s||this.removeAttribute(xs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Bh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=xt(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Co(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),xs(i)!==i&&a(xs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Ah(e){const t=hs(),s=t&&t.ce;return s||null}function ix(){const e=Ah();return e&&e.shadowRoot}function lx(e="$style"){{const t=hs();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const Rh=new WeakMap,Ih=new WeakMap,ro=Symbol("_moveCb"),pu=Symbol("_enterCb"),ox=e=>(delete e.props.mode,e),rx=ox({name:"TransitionGroup",props:qe({},_h,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=hs(),n=Ac();let a,i;return Bo(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!fx(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(dx),a.forEach(ux);const o=a.filter(px);Kr(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Xs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[ro]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[ro]=null,Gn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),o=wh(l);let r=l.tag||Vt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[zc]&&(a.push(d),Nn(d,ti(d,o,n,s)),Rh.set(d,Oh(d.el)))}i=t.default?Fo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Nn(d,ti(d,o,n,s))}return xt(r,null,i)}}}),cx=rx;function dx(e){const t=e.el;t[ro]&&t[ro](),t[pu]&&t[pu]()}function ux(e){Ih.set(e,Oh(e.el))}function px(e){const t=Rh.get(e),s=Ih.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function Oh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function fx(e,t,s){const n=e.cloneNode(),a=e[ni];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=kh(n);return i.removeChild(n),l}const Xn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ee(t)?s=>Ka(t,s):t};function hx(e){e.target.composing=!0}function fu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Hs=Symbol("_assign");function hu(e,t,s){return t&&(e=e.trim()),s&&(e=Ro(e)),e}const co={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Hs]=Xn(a);const i=n||a.props&&a.props.type==="number";kn(e,t?"change":"input",l=>{l.target.composing||e[Hs](hu(e.value,s,i))}),(s||i)&&kn(e,"change",()=>{e.value=hu(e.value,s,i)}),t||(kn(e,"compositionstart",hx),kn(e,"compositionend",fu),kn(e,"change",fu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Hs]=Xn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ro(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},jc={deep:!0,created(e,t,s){e[Hs]=Xn(s),kn(e,"change",()=>{const n=e._modelValue,a=ai(e),i=e.checked,l=e[Hs];if(Ee(n)){const o=Oo(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(Ta(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(Nh(e,i))})},mounted:mu,beforeUpdate(e,t,s){e[Hs]=Xn(s),mu(e,t,s)}};function mu(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ee(t))a=Oo(t,n.props.value)>-1;else if(Ta(t))a=t.has(n.props.value);else{if(t===s)return;a=In(t,Nh(e,!0))}e.checked!==a&&(e.checked=a)}const Vc={created(e,{value:t},s){e.checked=In(t,s.props.value),e[Hs]=Xn(s),kn(e,"change",()=>{e[Hs](ai(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Hs]=Xn(n),t!==s&&(e.checked=In(t,n.props.value))}},Lh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=Ta(t);kn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ro(ai(l)):ai(l));e[Hs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Rt(()=>{e._assigning=!1})}),e[Hs]=Xn(n)},mounted(e,{value:t}){vu(e,t)},beforeUpdate(e,t,s){e[Hs]=Xn(s)},updated(e,{value:t}){e._assigning||vu(e,t)}};function vu(e,t){const s=e.multiple,n=Ee(t);if(!(s&&!n&&!Ta(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=ai(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Oo(t,o)>-1}else l.selected=t.has(o);else if(In(ai(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ai(e){return"_value"in e?e._value:e.value}function Nh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Dh={created(e,t,s){Il(e,t,s,null,"created")},mounted(e,t,s){Il(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){Il(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){Il(e,t,s,n,"updated")}};function Ph(e,t){switch(e){case"SELECT":return Lh;case"TEXTAREA":return co;default:switch(t){case"checkbox":return jc;case"radio":return Vc;default:return co}}}function Il(e,t,s,n,a){const l=Ph(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function mx(){co.getSSRProps=({value:e})=>({value:e}),Vc.getSSRProps=({value:e},t)=>{if(t.props&&In(t.props.value,e))return{checked:!0}},jc.getSSRProps=({value:e},t)=>{if(Ee(e)){if(t.props&&Oo(e,t.props.value)>-1)return{checked:!0}}else if(Ta(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Dh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Ph(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const vx=["ctrl","shift","alt","meta"],gx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>vx.some(s=>e[`${s}Key`]&&!t.includes(s))},bx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=gx[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},yx={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},xx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=xs(a.key);if(t.some(l=>l===i||yx[l]===i))return e(a)}))},Mh=qe({patchProp:Ch},yh);let Fi,gu=!1;function Fh(){return Fi||(Fi=Zf(Mh))}function $h(){return Fi=gu?Fi:Yf(Mh),gu=!0,Fi}const Bh=((...e)=>{Fh().render(...e)}),_x=((...e)=>{$h().hydrate(...e)}),uo=((...e)=>{const t=Fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=zh(n);if(!a)return;const i=t._component;!Pe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,Hh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),Uh=((...e)=>{const t=$h().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=zh(n);if(a)return s(a,!0,Hh(a))},t});function Hh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function zh(e){return Be(e)?document.querySelector(e):e}let bu=!1;const wx=()=>{bu||(bu=!0,mx(),jy())},kx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Ef,BaseTransitionPropsValidators:Rc,Comment:It,DeprecationTypes:Py,EffectScope:yc,ErrorCodes:$g,ErrorTypeStrings:Ay,Fragment:Vt,KeepAlive:gb,ReactiveEffect:ji,Static:ga,Suspense:cy,Teleport:Xg,Text:Yn,TrackOpTypes:Og,Transition:By,TransitionGroup:cx,TriggerOpTypes:Lg,VueElement:jo,assertNumber:Fg,callWithAsyncErrorHandling:Is,callWithErrorHandling:fi,camelize:pt,capitalize:Ca,cloneVNode:rn,compatUtils:Dy,computed:G,createApp:uo,createBlock:no,createCommentVNode:rh,createElementBlock:my,createElementVNode:Bc,createHydrationRenderer:Yf,createPropsRestProxy:Bb,createRenderer:Zf,createSSRApp:Uh,createSlots:Sb,createStaticVNode:by,createTextVNode:Uc,createVNode:xt,customRef:uf,defineAsyncComponent:mb,defineComponent:fl,defineCustomElement:Eh,defineEmits:Rb,defineExpose:Ib,defineModel:Nb,defineOptions:Ob,defineProps:Ab,defineSSRCustomElement:nx,defineSlots:Lb,devtools:Ry,effect:eg,effectScope:Yv,getCurrentInstance:hs,getCurrentScope:Gp,getCurrentWatcher:Ng,getTransitionRawChildren:Fo,guardReactiveProps:oh,h:si,handleError:Ea,hasInjectionContext:Gg,hydrate:_x,hydrateOnIdle:cb,hydrateOnInteraction:fb,hydrateOnMediaQuery:pb,hydrateOnVisible:ub,initCustomFormatter:Ty,initDirectivesForSSR:wx,inject:Us,isMemoSame:vh,isProxy:ul,isReactive:En,isReadonly:on,isRef:Pt,isRuntimeOnly:wy,isShallow:ws,isVNode:Dn,markRaw:cf,mergeDefaults:Fb,mergeModels:$b,mergeProps:ch,nextTick:Rt,nodeOps:yh,normalizeClass:dl,normalizeProps:$v,normalizeStyle:cl,onActivated:Qt,onBeforeMount:If,onBeforeUnmount:Uo,onBeforeUpdate:Oc,onDeactivated:Gt,onErrorCaptured:Df,onMounted:je,onRenderTracked:Nf,onRenderTriggered:Lf,onScopeDispose:Qv,onServerPrefetch:Of,onUnmounted:ft,onUpdated:Bo,onWatcherCleanup:ff,openBlock:Yi,patchProp:Ch,popScopeId:jg,provide:Di,proxyRefs:Tc,pushScopeId:zg,queuePostFlushCb:Gi,reactive:ea,readonly:Jl,ref:f,registerRuntimeCompiler:fh,render:Bh,renderList:kb,renderSlot:Tb,resolveComponent:xb,resolveDirective:wb,resolveDynamicComponent:_b,resolveFilter:Ny,resolveTransitionHooks:ti,setBlockTracking:Qi,setDevtoolsHook:Iy,setTransitionHooks:Nn,shallowReactive:kc,shallowReadonly:yg,shallowRef:Sc,ssrContextKey:yf,ssrUtils:Ly,stop:tg,toDisplayString:Vp,toHandlerKey:Ga,toHandlers:Cb,toRaw:Ze,toRef:Ag,toRefs:Tg,toValue:wg,transformVNodeArgs:vy,triggerRef:_g,unref:ln,useAttrs:Mb,useCssModule:lx,useCssVars:Vy,useHost:Ah,useId:tb,useModel:Wb,useSSRContext:xf,useShadowRoot:ix,useSlots:Pb,useTemplateRef:sb,useTransitionState:Ac,vModelCheckbox:jc,vModelDynamic:Dh,vModelRadio:Vc,vModelSelect:Lh,vModelText:co,vShow:Sh,version:gh,warn:Ey,watch:Mt,watchEffect:Kg,watchPostEffect:Wg,watchSyncEffect:_f,withAsyncContext:Ub,withCtx:Ec,withDefaults:Db,withDirectives:qg,withKeys:xx,withMemo:Cy,withModifiers:bx,withScopeId:Vg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const el=Symbol(""),$i=Symbol(""),qc=Symbol(""),po=Symbol(""),jh=Symbol(""),wa=Symbol(""),Vh=Symbol(""),qh=Symbol(""),Gc=Symbol(""),Kc=Symbol(""),vl=Symbol(""),Wc=Symbol(""),Gh=Symbol(""),Jc=Symbol(""),Zc=Symbol(""),Yc=Symbol(""),Qc=Symbol(""),Xc=Symbol(""),ed=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Vo=Symbol(""),fo=Symbol(""),td=Symbol(""),sd=Symbol(""),tl=Symbol(""),gl=Symbol(""),nd=Symbol(""),Jr=Symbol(""),Sx=Symbol(""),Zr=Symbol(""),ho=Symbol(""),Tx=Symbol(""),Cx=Symbol(""),ad=Symbol(""),Ex=Symbol(""),Ax=Symbol(""),id=Symbol(""),Jh=Symbol(""),ii={[el]:"Fragment",[$i]:"Teleport",[qc]:"Suspense",[po]:"KeepAlive",[jh]:"BaseTransition",[wa]:"openBlock",[Vh]:"createBlock",[qh]:"createElementBlock",[Gc]:"createVNode",[Kc]:"createElementVNode",[vl]:"createCommentVNode",[Wc]:"createTextVNode",[Gh]:"createStaticVNode",[Jc]:"resolveComponent",[Zc]:"resolveDynamicComponent",[Yc]:"resolveDirective",[Qc]:"resolveFilter",[Xc]:"withDirectives",[ed]:"renderList",[Kh]:"renderSlot",[Wh]:"createSlots",[Vo]:"toDisplayString",[fo]:"mergeProps",[td]:"normalizeClass",[sd]:"normalizeStyle",[tl]:"normalizeProps",[gl]:"guardReactiveProps",[nd]:"toHandlers",[Jr]:"camelize",[Sx]:"capitalize",[Zr]:"toHandlerKey",[ho]:"setBlockTracking",[Tx]:"pushScopeId",[Cx]:"popScopeId",[ad]:"withCtx",[Ex]:"unref",[Ax]:"isRef",[id]:"withMemo",[Jh]:"isMemoSame"};function Rx(e){Object.getOwnPropertySymbols(e).forEach(t=>{ii[t]=e[t]})}const Ls={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ix(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ls}}function sl(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Ls){return e&&(o?(e.helper(wa),e.helper(ri(e.inSSR,c))):e.helper(oi(e.inSSR,c)),l&&e.helper(Xc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function ba(e,t=Ls){return{type:17,loc:t,elements:e}}function Bs(e,t=Ls){return{type:15,loc:t,properties:e}}function Dt(e,t){return{type:16,loc:Ls,key:Be(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=Ls,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Gs(e,t=Ls){return{type:8,loc:t,children:e}}function Ht(e,t=[],s=Ls){return{type:14,loc:s,callee:e,arguments:t}}function li(e,t=void 0,s=!1,n=!1,a=Ls){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Yr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ls}}function Ox(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ls}}function Lx(e){return{type:21,body:e,loc:Ls}}function oi(e,t){return e||t?Gc:Kc}function ri(e,t){return e||t?Vh:qh}function ld(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(oi(n,e.isComponent)),t(wa),t(ri(n,e.isComponent)))}const yu=new Uint8Array([123,123]),xu=new Uint8Array([125,125]);function _u(e){return e>=97&&e<=122||e>=65&&e<=90}function As(e){return e===32||e===10||e===9||e===12||e===13}function jn(e){return e===47||e===62||As(e)}function mo(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Nx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=yu,this.delimiterClose=xu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=yu,this.delimiterClose=xu}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?jn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||As(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):_u(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){jn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(jn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(mo("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){As(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=_u(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||As(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):As(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):As(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||jn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||jn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||jn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||jn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||jn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):As(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):As(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){As(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function wu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ya(e,t){const s=wu("MODE",t),n=wu(e,t);return s===3?n===!0:n!==!1}function nl(e,t,s,...n){return ya(e,t)}function od(e){throw e}function Zh(e){}function bt(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const _s=e=>e.type===4&&e.isStatic;function Yh(e){switch(e){case"Teleport":case"teleport":return $i;case"Suspense":case"suspense":return qc;case"KeepAlive":case"keep-alive":return po;case"BaseTransition":case"base-transition":return jh}}const Dx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,rd=e=>!Dx.test(e),Qh=/[A-Za-z_$\xA0-\uFFFF]/,Px=/[\.\?\w$\xA0-\uFFFF]/,Mx=/\s+[.[]\s*|\s*[.[]\s+/g,Xh=e=>e.type===4?e.content:e.loc.source,Fx=e=>{const t=Xh(e).trim().replace(Mx,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?Qh:Px).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},em=Fx,$x=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Bx=e=>$x.test(Xh(e)),Ux=Bx;function $s(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Be(t)?a.name===t:t.test(a.name)))return a}}function qo(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&ua(i.arg,t))return i}}function ua(e,t){return!!(e&&_s(e)&&e.content===t)}function Hx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function fr(e){return e.type===5||e.type===2}function ku(e){return e.type===7&&e.name==="pre"}function zx(e){return e.type===7&&e.name==="slot"}function vo(e){return e.type===1&&e.tagType===3}function go(e){return e.type===1&&e.tagType===2}const jx=new Set([tl,gl]);function tm(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&jx.has(s))return tm(e.arguments[0],t.concat(e))}return[e,t]}function bo(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Be(a)&&a.type===14){const o=tm(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||Be(a))n=Bs([t]);else if(a.type===14){const o=a.arguments[0];!Be(o)&&o.type===15?Su(t,o)||o.properties.unshift(t):a.callee===nd?n=Ht(s.helper(fo),[Bs([t]),a]):a.arguments.unshift(Bs([t])),!n&&(n=a)}else a.type===15?(Su(t,a)||a.properties.unshift(t),n=a):(n=Ht(s.helper(fo),[Bs([t]),a]),l&&l.callee===gl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Su(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function al(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function Vx(e){return e.type===14&&e.callee===id?e.arguments[1].returns:e}const qx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function sm(e){for(let t=0;t<e.length;t++)if(!As(e.charCodeAt(t)))return!1;return!0}function cd(e){return e.type===2&&sm(e.content)||e.type===12&&cd(e.content)}function nm(e){return e.type===3||cd(e)}const am={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:za,isPreTag:za,isIgnoreNewlineTag:za,isCustomElement:za,onError:od,onWarn:Zh,comments:!1,prefixIdentifiers:!1};let et=am,il=null,Rn="",ns=null,We=null,vs="",gn=-1,ra=-1,dd=0,Jn=!1,Qr=null;const gt=[],Ct=new Nx(gt,{onerr:hn,ontext(e,t){Ol(Wt(e,t),e,t)},ontextentity(e,t,s){Ol(e,t,s)},oninterpolation(e,t){if(Jn)return Ol(Wt(e,t),e,t);let s=e+Ct.delimiterOpen.length,n=t-Ct.delimiterClose.length;for(;As(Rn.charCodeAt(s));)s++;for(;As(Rn.charCodeAt(n-1));)n--;let a=Wt(s,n);a.includes("&")&&(a=et.decodeEntities(a,!1)),Xr({type:5,content:jl(a,!1,At(s,n)),loc:At(e,t)})},onopentagname(e,t){const s=Wt(e,t);ns={type:1,tag:s,ns:et.getNamespace(s,gt[0],et.ns),tagType:0,props:[],children:[],loc:At(e-1,t),codegenNode:void 0}},onopentagend(e){Cu(e)},onclosetag(e,t){const s=Wt(e,t);if(!et.isVoidTag(s)){let n=!1;for(let a=0;a<gt.length;a++)if(gt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&hn(24,gt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=gt.shift();zl(o,t,l<a)}break}n||hn(23,im(e,60))}},onselfclosingtag(e){const t=ns.tag;ns.isSelfClosing=!0,Cu(e),gt[0]&&gt[0].tag===t&&zl(gt.shift(),e)},onattribname(e,t){We={type:6,name:Wt(e,t),nameLoc:At(e,t),value:void 0,loc:At(e)}},ondirname(e,t){const s=Wt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Jn&&n===""&&hn(26,e),Jn||n==="")We={type:6,name:s,nameLoc:At(e,t),value:void 0,loc:At(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:At(e)},n==="pre"){Jn=Ct.inVPre=!0,Qr=ns;const a=ns.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=t0(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Wt(e,t);if(Jn&&!ku(We))We.name+=s,pa(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=jl(n?s:s.slice(1,-1),n,At(e,t),n?3:0)}},ondirmodifier(e,t){const s=Wt(e,t);if(Jn&&!ku(We))We.name+="."+s,pa(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,pa(n.loc,t))}else{const n=He(s,!0,At(e,t));We.modifiers.push(n)}},onattribdata(e,t){vs+=Wt(e,t),gn<0&&(gn=e),ra=t},onattribentity(e,t,s){vs+=e,gn<0&&(gn=t),ra=s},onattribnameend(e){const t=We.loc.start.offset,s=Wt(t,e);We.type===7&&(We.rawName=s),ns.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&hn(2,t)},onattribend(e,t){if(ns&&We){if(pa(We.loc,t),e!==0)if(vs.includes("&")&&(vs=et.decodeEntities(vs,!0)),We.type===6)We.name==="class"&&(vs=om(vs).trim()),e===1&&!vs&&hn(13,t),We.value={type:2,content:vs,loc:e===1?At(gn,ra):At(gn-1,ra+1)},Ct.inSFCRoot&&ns.tag==="template"&&We.name==="lang"&&vs&&vs!=="html"&&Ct.enterRCDATA(mo("</template"),0);else{let s=0;We.exp=jl(vs,!1,At(gn,ra),0,s),We.name==="for"&&(We.forParseResult=Kx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&nl("COMPILER_V_BIND_SYNC",et,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&ns.props.push(We)}vs="",gn=ra=-1},oncomment(e,t){et.comments&&Xr({type:3,content:Wt(e,t),loc:At(e-4,t+3)})},onend(){const e=Rn.length;for(let t=0;t<gt.length;t++)zl(gt[t],e-1),hn(24,gt[t].loc.start.offset)},oncdata(e,t){(gt[0]?gt[0].ns:et.ns)!==0?Ol(Wt(e,t),e,t):hn(1,e-9)},onprocessinginstruction(e){(gt[0]?gt[0].ns:et.ns)===0&&hn(21,e-1)}}),Tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,Gx=/^\(|\)$/g;function Kx(e){const t=e.loc,s=e.content,n=s.match(qx);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return jl(u,!1,At(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(Gx,"").trim();const c=a.indexOf(r),d=r.match(Tu);if(d){r=r.replace(Tu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Wt(e,t){return Rn.slice(e,t)}function Cu(e){Ct.inSFCRoot&&(ns.innerLoc=At(e+1,e+1)),Xr(ns);const{tag:t,ns:s}=ns;s===0&&et.isPreTag(t)&&dd++,et.isVoidTag(t)?zl(ns,e):(gt.unshift(ns),(s===1||s===2)&&(Ct.inXML=!0)),ns=null}function Ol(e,t,s){{const i=gt[0]&&gt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=et.decodeEntities(e,!1))}const n=gt[0]||il,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,pa(a.loc,s)):n.children.push({type:2,content:e,loc:At(t,s)})}function zl(e,t,s=!1){s?pa(e.loc,im(t,60)):pa(e.loc,Wx(t,62)+1),Ct.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=Wt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Jn||(n==="slot"?e.tagType=2:Eu(e)?e.tagType=3:Zx(e)&&(e.tagType=1)),Ct.inRCDATA||(e.children=lm(i)),a===0&&et.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&et.isPreTag(n)&&dd--,Qr===e&&(Jn=Ct.inVPre=!1,Qr=null),Ct.inXML&&(gt[0]?gt[0].ns:et.ns)===0&&(Ct.inXML=!1);{const l=e.props;if(!Ct.inSFCRoot&&ya("COMPILER_NATIVE_TEMPLATE",et)&&e.tag==="template"&&!Eu(e)){const r=gt[0]||il,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&nl("COMPILER_INLINE_TEMPLATE",et,o.loc)&&e.children.length&&(o.value={type:2,content:Wt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function Wx(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s<Rn.length-1;)s++;return s}function im(e,t){let s=e;for(;Rn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Jx=new Set(["if","else","else-if","for","slot"]);function Eu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Jx.has(t[s].name))return!0}return!1}function Zx({tag:e,props:t}){if(et.isCustomElement(e))return!1;if(e==="component"||Yx(e.charCodeAt(0))||Yh(e)||et.isBuiltInComponent&&et.isBuiltInComponent(e)||et.isNativeTag&&!et.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}}else if(n.name==="bind"&&ua(n.arg,"is")&&nl("COMPILER_IS_ON_ELEMENT",et,n.loc))return!0}return!1}function Yx(e){return e>64&&e<91}const Qx=/\r\n/g;function lm(e){const t=et.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(dd)a.content=a.content.replace(Qx,`
`);else if(sm(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Xx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=om(a.content))}return s?e.filter(Boolean):e}function Xx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function om(e){let t="",s=!1;for(let n=0;n<e.length;n++)As(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Xr(e){(gt[0]||il).children.push(e)}function At(e,t){return{start:Ct.getPos(e),end:t==null?t:Ct.getPos(t),source:t==null?t:Wt(e,t)}}function e0(e){return At(e.start.offset,e.end.offset)}function pa(e,t){e.end=Ct.getPos(t),e.source=Wt(e.start.offset,t)}function t0(e){const t={type:6,name:e.rawName,nameLoc:At(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function jl(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function hn(e,t,s){et.onError(bt(e,At(t,t)))}function s0(){Ct.reset(),ns=null,We=null,vs="",gn=-1,ra=-1,gt.length=0}function n0(e,t){if(s0(),Rn=e,et=qe({},am),t){let a;for(a in t)t[a]!=null&&(et[a]=t[a])}Ct.mode=et.parseMode==="html"?1:et.parseMode==="sfc"?2:0,Ct.inXML=et.ns===1||et.ns===2;const s=t&&t.delimiters;s&&(Ct.delimiterOpen=mo(s[0]),Ct.delimiterClose=mo(s[1]));const n=il=Ix([],e);return Ct.parse(Rn),n.loc=At(0,e.length),n.children=lm(n.children),il=null,n}function a0(e,t){Vl(e,void 0,t,!!rm(e))}function rm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!go(t[0])?t[0]:null}function Vl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:Rs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&dm(u,s)>=2){const v=um(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:Rs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Vl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Vl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Vl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ee(e.codegenNode.children))e.codegenNode.children=r(ba(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ee(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(ba(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ee(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=$s(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(ba(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ee(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Rs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=dm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Rs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Rs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(wa),t.removeHelper(ri(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(oi(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Rs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||os(o))continue;const r=Rs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const i0=new Set([td,sd,tl,gl]);function cm(e,t){if(e.type===14&&!Be(e.callee)&&i0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Rs(s,t);if(s.type===14)return cm(s,t)}return 0}function dm(e,t){let s=3;const n=um(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=Rs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Rs(o,t):o.type===14?c=cm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function um(e){const t=e.codegenNode;if(t.type===13)return t.props}function l0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Yt,isCustomElement:d=Yt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:w="",bindingMetadata:L=Ge,inline:_=!1,isTS:g=!1,onError:b=od,onWarn:R=Zh,compatConfig:C}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),A={filename:t,selfName:O&&Ca(pt(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:w,bindingMetadata:L,inline:_,isTS:g,onError:b,onWarn:R,compatConfig:C,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const N=A.helpers.get(x)||0;return A.helpers.set(x,N+1),x},removeHelper(x){const N=A.helpers.get(x);if(N){const F=N-1;F?A.helpers.set(x,F):A.helpers.delete(x)}},helperString(x){return`_${ii[A.helper(x)]}`},replaceNode(x){A.parent.children[A.childIndex]=A.currentNode=x},removeNode(x){const N=A.parent.children,F=x?N.indexOf(x):A.currentNode?A.childIndex:-1;!x||x===A.currentNode?(A.currentNode=null,A.onNodeRemoved()):A.childIndex>F&&(A.childIndex--,A.onNodeRemoved()),A.parent.children.splice(F,1)},onNodeRemoved:Yt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Be(x)&&(x=He(x)),A.hoists.push(x);const N=He(`_hoisted_${A.hoists.length}`,!1,x.loc,2);return N.hoisted=x,N},cache(x,N=!1,F=!1){const E=Ox(A.cached.length,x,N,F);return A.cached.push(E),E}};return A.filters=new Set,A}function o0(e,t){const s=l0(e,t);Go(e,s),t.hoistStatic&&a0(e,s),t.ssr||r0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function r0(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=rm(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&ld(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=sl(t,s(el),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function c0(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Be(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Go(a,t))}}function Go(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ee(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(vl);break;case 5:t.ssr||t.helper(Vo);break;case 9:for(let i=0;i<e.branches.length;i++)Go(e.branches[i],t);break;case 10:case 11:case 1:case 0:c0(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function pm(e,t){const s=Be(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(zx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Ko="/*@__PURE__*/",fm=e=>`${ii[e]}: _${ii[e]}`;function d0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${ii[v]}`},push(v,w=-2,L){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function u0(e,t={}){const s=d0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";p0(e,s);const v=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${L}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(fm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(hr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(hr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),hr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let _=0;_<e.temps;_++)a(`${_>0?", ":""}_temp${_}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?ls(e.codegenNode,s):a("null"),h&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function p0(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Gc,Kc,vl,Wc,Gh].filter(p=>d.includes(p)).map(fm).join(", ");a(`const { ${u} } = _Vue
`,-1)}f0(e.hoists,t),i(),a("return ")}function hr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Qc:t==="component"?Jc:Yc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${al(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function f0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),ls(i,t),n())}t.pure=!1}function ud(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),bl(e,t,s),s&&t.deindent(),t.push("]")}function bl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?a(o,-3):Ee(o)?ud(o,t):ls(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function ls(e,t){if(Be(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:h0(e,t);break;case 4:hm(e,t);break;case 5:m0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:mm(e,t);break;case 3:g0(e,t);break;case 13:b0(e,t);break;case 14:x0(e,t);break;case 15:_0(e,t);break;case 17:w0(e,t);break;case 18:k0(e,t);break;case 19:S0(e,t);break;case 20:T0(e,t);break;case 21:bl(e.body,t,!0,!1);break}}function h0(e,t){t.push(JSON.stringify(e.content),-3,e)}function hm(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function m0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ko),s(`${n(Vo)}(`),ls(e.content,t),s(")")}function mm(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Be(n)?t.push(n,-3):ls(n,t)}}function v0(e,t){const{push:s}=t;if(e.type===8)s("["),mm(e,t),s("]");else if(e.isStatic){const n=rd(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function g0(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ko),s(`${n(vl)}(${JSON.stringify(e.content)})`,-3,e)}function b0(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(n(Xc)+"("),u&&s(`(${n(wa)}(${p?"true":""}), `),a&&s(Ko);const v=u?ri(t.inSSR,h):oi(t.inSSR,h);s(n(v)+"(",-2,e),bl(y0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function y0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function x0(e,t){const{push:s,helper:n,pure:a}=t,i=Be(e.callee)?e.callee:n(e.callee);a&&s(Ko),s(i+"(",-2,e),bl(e.arguments,t),s(")")}function _0(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];v0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function w0(e,t){ud(e.elements,t)}function k0(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${ii[ad]}(`),s("(",-2,e),Ee(i)?bl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ee(l)?ud(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function S0(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!rd(s.content);u&&l("("),hm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,ls(a,t),d||t.indentLevel--,i&&r(!0)}function T0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(ho)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(ho)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const C0=pm(/^(?:if|else|else-if)$/,(e,t,s)=>E0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=Ru(a,r,s);else{const c=A0(n.codegenNode);c.alternate=Ru(a,r+n.branches.length-1,s)}}}));function E0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(bt(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=Au(e,t),i={type:9,loc:e0(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&nm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(bt(30,e.loc)),s.removeNode();const o=Au(e,t);l.branches.push(o);const r=n&&n(l,o,!1);Go(o,s),r&&r(),s.currentNode=null}else s.onError(bt(30,e.loc));break}}}function Au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!$s(e,"for")?e.children:[e],userKey:qo(e,"key"),isTemplateIf:s}}function Ru(e,t,s){return e.condition?Yr(e.condition,Iu(e,t,s),Ht(s.helper(vl),['""',"true"])):Iu(e,t,s)}function Iu(e,t,s){const{helper:n}=s,a=Dt("key",He(`${t}`,!1,Ls,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return bo(r,a,s),r}else return sl(s,n(el),Bs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Vx(r);return c.type===13&&ld(c,s),bo(c,a,s),r}}function A0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const R0=pm("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return I0(e,t,s,i=>{const l=Ht(n(ed),[i.source]),o=vo(e),r=$s(e,"memo"),c=qo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?Dt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=sl(s,n(el),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,w=v.length!==1||v[0].type!==1,L=go(e)?e:o&&e.children.length===1&&go(e.children[0])?e.children[0]:null;if(L?(m=L.codegenNode,o&&u&&bo(m,u,s)):w?m=sl(s,n(el),u?Bs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&bo(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(wa),a(ri(s.inSSR,m.isComponent))):a(oi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(wa),n(ri(s.inSSR,m.isComponent))):n(oi(s.inSSR,m.isComponent))),r){const _=li(ec(i.parseResult,[He("_cached")]));_.body=Lx([Gs(["const _memo = (",r.exp,")"]),Gs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Jh)}(_cached, _memo)) return _cached`]),Gs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(_,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(li(ec(i.parseResult),m,!0))}})});function I0(e,t,s,n){if(!t.exp){s.onError(bt(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(bt(32,t.loc));return}vm(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:vo(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=n&&n(p);return()=>{o.vFor--,h&&h()}}function vm(e,t){e.finalized||(e.finalized=!0)}function ec({value:e,key:t,index:s},n=[]){return O0([e,t,s,...n])}function O0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const Ou=He("undefined",!1),L0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=$s(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},N0=(e,t,s,n)=>li(e,s,!1,!0,s.length?s[0].loc:n);function D0(e,t,s=N0){t.helper(ad);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=$s(e,"slot",!0);if(r){const{arg:w,exp:L}=r;w&&!_s(w)&&(o=!0),i.push(Dt(w||He("default",!0),s(L,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let w=0;w<n.length;w++){const L=n[w];let _;if(!vo(L)||!(_=$s(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(r){t.onError(bt(37,_.loc));break}c=!0;const{children:g,loc:b}=L,{arg:R=He("default",!0),exp:C,loc:O}=_;let A;_s(R)?A=R?R.content:"default":o=!0;const x=$s(L,"for"),N=s(C,x,g,b);let F,E;if(F=$s(L,"if"))o=!0,l.push(Yr(F.exp,Ll(R,N,h++),Ou));else if(E=$s(L,/^else(?:-if)?$/,!0)){let M=w,V;for(;M--&&(V=n[M],!!nm(V)););if(V&&vo(V)&&$s(V,/^(?:else-)?if$/)){let J=l[l.length-1];for(;J.alternate.type===19;)J=J.alternate;J.alternate=E.exp?Yr(E.exp,Ll(R,N,h++),Ou):Ll(R,N,h++)}else t.onError(bt(30,E.loc))}else if(x){o=!0;const M=x.forParseResult;M?(vm(M),l.push(Ht(t.helper(ed),[M.source,li(ec(M),Ll(R,N),!0)]))):t.onError(bt(32,x.loc))}else{if(A){if(p.has(A)){t.onError(bt(38,O));continue}p.add(A),A==="default"&&(d=!0)}i.push(Dt(R,N))}}if(!r){const w=(L,_)=>{const g=s(L,void 0,_,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Dt("default",g)};c?u.length&&!u.every(cd)&&(d?t.onError(bt(39,u[0].loc)):i.push(w(void 0,u))):i.push(w(void 0,n))}const m=o?2:ql(e.children)?3:1;let v=Bs(i.concat(Dt("_",He(m+"",!1))),a);return l.length&&(v=Ht(t.helper(Wh),[v,ba(l)])),{slots:v,hasDynamicSlots:o}}function Ll(e,t,s){const n=[Dt("name",e),Dt("fn",t)];return s!=null&&n.push(Dt("key",He(String(s),!0))),Bs(n)}function ql(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||ql(s.children))return!0;break;case 9:if(ql(s.branches))return!0;break;case 10:case 11:if(ql(s.children))return!0;break}}return!1}const gm=new WeakMap,P0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?M0(e,t):`"${n}"`;const o=tt(l)&&l.callee===Zc;let r,c,d=0,u,p,h,m=o||l===$i||l===qc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=bm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const w=v.directives;h=w&&w.length?ba(w.map(L=>$0(L,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===po&&(m=!0,d|=1024),i&&l!==$i&&l!==po){const{slots:w,hasDynamicSlots:L}=D0(e,t);c=w,L&&(d|=1024)}else if(e.children.length===1&&l!==$i){const w=e.children[0],L=w.type,_=L===5||L===8;_&&Rs(w,t)===0&&(d|=1),_||L===2?c=w:c=e.children}else c=e.children;p&&p.length&&(u=B0(p)),e.codegenNode=sl(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function M0(e,t,s=!1){let{tag:n}=e;const a=tc(n),i=qo(e,"is",!1,!0);if(i)if(a||ya("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&He(i.value.content,!0):(o=i.exp,o||(o=He("is",!1,i.arg.loc))),o)return Ht(t.helper(Zc),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Yh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Jc),t.components.add(n),al(n,"component"))}function bm(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,w=!1,L=!1,_=!1,g=!1,b=!1;const R=[],C=N=>{c.length&&(d.push(Bs(Lu(c),o)),c=[]),N&&d.push(N)},O=()=>{t.scopes.vFor>0&&c.push(Dt(He("ref_for",!0),He("true")))},A=({key:N,value:F})=>{if(_s(N)){const E=N.content,M=Sa(E);if(M&&(!n||a)&&E.toLowerCase()!=="onclick"&&E!=="onUpdate:modelValue"&&!Cn(E)&&(_=!0),M&&Cn(E)&&(b=!0),M&&F.type===14&&(F=F.arguments[0]),F.type===20||(F.type===4||F.type===8)&&Rs(F,t)>0)return;E==="ref"?v=!0:E==="class"?w=!0:E==="style"?L=!0:E!=="key"&&!R.includes(E)&&R.push(E),n&&(E==="class"||E==="style")&&!R.includes(E)&&R.push(E)}else g=!0};for(let N=0;N<s.length;N++){const F=s[N];if(F.type===6){const{loc:E,name:M,nameLoc:V,value:J}=F;let T=!0;if(M==="ref"&&(v=!0,O()),M==="is"&&(tc(l)||J&&J.content.startsWith("vue:")||ya("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Dt(He(M,!0,V),He(J?J.content:"",T,J?J.loc:E)))}else{const{name:E,arg:M,exp:V,loc:J,modifiers:T}=F,k=E==="bind",S=E==="on";if(E==="slot"){n||t.onError(bt(40,J));continue}if(E==="once"||E==="memo"||E==="is"||k&&ua(M,"is")&&(tc(l)||ya("COMPILER_IS_ON_ELEMENT",t))||S&&i)continue;if((k&&ua(M,"key")||S&&p&&ua(M,"vue:before-update"))&&(h=!0),k&&ua(M,"ref")&&O(),!M&&(k||S)){if(g=!0,V)if(k){if(C(),ya("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(V);continue}O(),C(),d.push(V)}else C({type:14,loc:J,callee:t.helper(nd),arguments:n?[V]:[V,"true"]});else t.onError(bt(k?34:35,J));continue}k&&T.some(Z=>Z.content==="prop")&&(m|=32);const $=t.directiveTransforms[E];if($){const{props:Z,needRuntime:K}=$(F,e,t);!i&&Z.forEach(A),S&&M&&!_s(M)?C(Bs(Z,o)):c.push(...Z),K&&(u.push(F),os(K)&&gm.set(F,K))}else Rv(E)||(u.push(F),p&&(h=!0))}}let x;if(d.length?(C(),d.length>1?x=Ht(t.helper(fo),d,o):x=d[0]):c.length&&(x=Bs(Lu(c),o)),g?m|=16:(w&&!n&&(m|=2),L&&!n&&(m|=4),R.length&&(m|=8),_&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let N=-1,F=-1,E=!1;for(let J=0;J<x.properties.length;J++){const T=x.properties[J].key;_s(T)?T.content==="class"?N=J:T.content==="style"&&(F=J):T.isHandlerKey||(E=!0)}const M=x.properties[N],V=x.properties[F];E?x=Ht(t.helper(tl),[x]):(M&&!_s(M.value)&&(M.value=Ht(t.helper(td),[M.value])),V&&(L||V.value.type===4&&V.value.content.trim()[0]==="["||V.value.type===17)&&(V.value=Ht(t.helper(sd),[V.value])));break;case 14:break;default:x=Ht(t.helper(tl),[Ht(t.helper(gl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:R,shouldUseBlock:h}}function Lu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||Sa(i))&&F0(l,a):(t.set(i,a),s.push(a))}return s}function F0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ba([e.value,t.value],e.loc)}function $0(e,t){const s=[],n=gm.get(e);n?s.push(t.helperString(n)):(t.helper(Yc),t.directives.add(e.name),s.push(al(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Bs(e.modifiers.map(l=>Dt(l,i)),a))}return ba(s,e.loc)}function B0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function tc(e){return e==="component"||e==="Component"}const U0=(e,t)=>{if(go(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=H0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=li([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Ht(t.helper(Kh),l,n)}};function H0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=pt(l.name),a.push(l)));else if(l.name==="bind"&&ua(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=pt(l.arg.content);s=l.exp=He(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&_s(l.arg)&&(l.arg.content=pt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=bm(e,t,a,!1,!1);n=i,l.length&&t.onError(bt(36,l[0].loc))}return{slotName:s,slotProps:n}}const ym=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(bt(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ga(pt(u)):`on:${u}`;o=He(p,!0,l.loc)}else o=Gs([`${s.helperString(Zr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Zr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=em(r),p=!(u||Ux(r)),h=r.content.includes(";");(p||c&&u)&&(r=Gs([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Dt(o,r||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},z0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=pt(i.content):i.content=`${s.helperString(Jr)}(${i.content})`:(i.children.unshift(`${s.helperString(Jr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&Nu(i,"."),n.some(o=>o.content==="attr")&&Nu(i,"^")),{props:[Dt(i,l)]}},Nu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},j0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(fr(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(fr(r))n||(n=s[i]=Gs([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(fr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Rs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Ht(t.helper(Wc),o)}}}}},Du=new WeakSet,V0=(e,t)=>{if(e.type===1&&$s(e,"once",!0))return Du.has(e)||t.inVOnce||t.inSSR?void 0:(Du.add(e),t.inVOnce=!0,t.helper(ho),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},xm=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(bt(41,e.loc)),_i();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(bt(44,n.loc)),_i();if(o==="literal-const"||o==="setup-const")return s.onError(bt(45,n.loc)),_i();if(!l.trim()||!em(n))return s.onError(bt(42,n.loc)),_i();const r=a||He("modelValue",!0),c=a?_s(a)?`onUpdate:${pt(a.content)}`:Gs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Gs([`${u} => ((`,n,") = $event)"]);const p=[Dt(r,e.exp),Dt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(rd(v)?v:JSON.stringify(v))+": true").join(", "),m=a?_s(a)?`${a.content}Modifiers`:Gs([a,' + "Modifiers"']):"modelModifiers";p.push(Dt(m,He(`{ ${h} }`,!1,e.loc,2)))}return _i(p)};function _i(e=[]){return{props:e}}const q0=/[\w).+\-_$\]]/,G0=(e,t)=>{ya("COMPILER_FILTERS",t)&&(e.type===5?yo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&yo(s.exp,t)}))};function yo(e,t){if(e.type===4)Pu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?Pu(n,t):n.type===8?yo(e,t):n.type===5&&yo(n.content,t))}}function Pu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):w();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let L=h-1,_;for(;L>=0&&(_=s.charAt(L),_===" ");L--);(!_||!q0.test(_))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&w();function w(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=K0(m,v[h],t);e.content=m,e.ast=void 0}}function K0(e,t,s){s.helper(Qc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${al(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${al(a,"filter")}(${e}${i!==")"?","+i:i}`}}const Mu=new WeakSet,W0=(e,t)=>{if(e.type===1){const s=$s(e,"memo");return!s||Mu.has(e)||t.inSSR?void 0:(Mu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&ld(n,t),e.codegenNode=Ht(t.helper(id),[s.exp,li(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},J0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(bt(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=pt(n.content);(Qh.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function Z0(e){return[[J0,V0,C0,W0,R0,G0,U0,P0,L0,j0],{on:ym,bind:z0,model:xm}]}function Y0(e,t={}){const s=t.onError||od,n=t.mode==="module";t.prefixIdentifiers===!0?s(bt(48)):n&&s(bt(49));const a=!1;t.cacheHandlers&&s(bt(50)),t.scopeId&&!n&&s(bt(51));const i=qe({},t,{prefixIdentifiers:a}),l=Be(e)?n0(e,i):e,[o,r]=Z0();return o0(l,qe({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:qe({},r,t.directiveTransforms||{})})),u0(l,i)}const Q0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const _m=Symbol(""),wm=Symbol(""),km=Symbol(""),Sm=Symbol(""),sc=Symbol(""),Tm=Symbol(""),Cm=Symbol(""),Em=Symbol(""),Am=Symbol(""),Rm=Symbol("");Rx({[_m]:"vModelRadio",[wm]:"vModelCheckbox",[km]:"vModelText",[Sm]:"vModelSelect",[sc]:"vModelDynamic",[Tm]:"withModifiers",[Cm]:"withKeys",[Em]:"vShow",[Am]:"Transition",[Rm]:"TransitionGroup"});let Da;function X0(e,t=!1){return Da||(Da=document.createElement("div")),t?(Da.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Da.children[0].getAttribute("foo")):(Da.innerHTML=e,Da.textContent)}const e_={parseMode:"html",isVoidTag:Gv,isNativeTag:e=>jv(e)||Vv(e)||qv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:X0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Am;if(e==="TransitionGroup"||e==="transition-group")return Rm},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},t_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:s_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},s_=(e,t)=>{const s=Hp(e);return He(JSON.stringify(s),!1,t,3)};function Qn(e,t){return bt(e,t)}const n_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(54,a)),t.children.length&&(s.onError(Qn(55,a)),t.children.length=0),{props:[Dt(He("innerHTML",!0,a),n||He("",!0))]}},a_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(56,a)),t.children.length&&(s.onError(Qn(57,a)),t.children.length=0),{props:[Dt(He("textContent",!0),n?Rs(n,s)>0?n:Ht(s.helperString(Vo),[n],a):He("",!0))]}},i_=(e,t,s)=>{const n=xm(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Qn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=km,o=!1;if(a==="input"||i){const r=qo(t,"type");if(r){if(r.type===7)l=sc;else if(r.value)switch(r.value.content){case"radio":l=_m;break;case"checkbox":l=wm;break;case"file":o=!0,s.onError(Qn(60,e.loc));break}}else Hx(t)&&(l=sc)}else a==="select"&&(l=Sm);o||(n.needRuntime=s.helper(l))}else s.onError(Qn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},l_=Os("passive,once,capture"),o_=Os("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),r_=Os("left,right"),Im=Os("onkeyup,onkeydown,onkeypress"),c_=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&nl("COMPILER_V_ON_NATIVE",s)||l_(r)?l.push(r):r_(r)?_s(e)?Im(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):o_(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},Fu=(e,t)=>_s(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Gs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,d_=(e,t,s)=>ym(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=c_(i,a,s,e.loc);if(r.includes("right")&&(i=Fu(i,"onContextmenu")),r.includes("middle")&&(i=Fu(i,"onMouseup")),r.length&&(l=Ht(s.helper(Tm),[l,JSON.stringify(r)])),o.length&&(!_s(i)||Im(i.content.toLowerCase()))&&(l=Ht(s.helper(Cm),[l,JSON.stringify(o)])),c.length){const d=c.map(Ca).join("");i=_s(i)?He(`${i.content}${d}`,!0):Gs(["(",i,`) + "${d}"`])}return{props:[Dt(i,l)]}}),u_=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Qn(62,a)),{props:[],needRuntime:s.helper(Em)}},p_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},f_=[t_],h_={cloak:Q0,html:n_,text:a_,model:i_,on:d_,show:u_};function m_(e,t={}){return Y0(e,qe({},e_,t,{nodeTransforms:[p_,...f_,...t.nodeTransforms||[]],directiveTransforms:qe({},h_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const $u=Object.create(null);function v_(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Yt;const s=Lv(e,t),n=$u[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Yt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=m_(e,a),l=new Function("Vue",i)(kx);return l._rc=!0,$u[s]=l}fh(v_);const xo=ea({items:[]});let g_=1;function Wo(e,t="info",s=3e3){const n=g_++;return xo.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>pd(n),s),n}function pd(e){const t=xo.items.findIndex(s=>s.id===e);t>=0&&xo.items.splice(t,1)}function xe(e,t="info",s=3e3){return Wo(e,t,s)}xe.success=(e,t=3e3)=>Wo(e,"success",t);xe.error=(e,t=5e3)=>Wo(e,"error",t);xe.info=(e,t=3e3)=>Wo(e,"info",t);xe.dismiss=pd;const b_={setup(){return{state:xo,dismiss:pd}},template:`
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
  `},xn=ea({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Qa=null;function qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Qa&&Qa(!1),xn.title=e,xn.message=t,xn.confirmLabel=s,xn.cancelLabel=n,xn.danger=a,xn.open=!0,new Promise(i=>{Qa=i})}function Bu(e){xn.open=!1,Qa&&(Qa(e),Qa=null)}const y_={setup(){function e(t){xn.open&&t.key==="Escape"&&(t.stopPropagation(),Bu(!1))}return je(()=>document.addEventListener("keydown",e,!0)),ft(()=>document.removeEventListener("keydown",e,!0)),{state:xn,settle:Bu}},template:`
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
 */const Ua=typeof document<"u";function Om(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function x_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Om(e.default)}const lt=Object.assign;function mr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ws(a)?a.map(e):e(a)}return s}const Bi=()=>{},Ws=Array.isArray;function Uu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Lm=/#/g,__=/&/g,w_=/\//g,k_=/=/g,S_=/\?/g,Nm=/\+/g,T_=/%5B/g,C_=/%5D/g,Dm=/%5E/g,E_=/%60/g,Pm=/%7B/g,A_=/%7C/g,Mm=/%7D/g,R_=/%20/g;function fd(e){return e==null?"":encodeURI(""+e).replace(A_,"|").replace(T_,"[").replace(C_,"]")}function I_(e){return fd(e).replace(Pm,"{").replace(Mm,"}").replace(Dm,"^")}function nc(e){return fd(e).replace(Nm,"%2B").replace(R_,"+").replace(Lm,"%23").replace(__,"%26").replace(E_,"`").replace(Pm,"{").replace(Mm,"}").replace(Dm,"^")}function O_(e){return nc(e).replace(k_,"%3D")}function L_(e){return fd(e).replace(Lm,"%23").replace(S_,"%3F")}function N_(e){return L_(e).replace(w_,"%2F")}function ll(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const D_=/\/$/,P_=e=>e.replace(D_,"");function vr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=B_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ll(l)}}function M_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Hu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function F_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&ci(t.matched[n],s.matched[a])&&Fm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function ci(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Fm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!$_(e[s],t[s]))return!1;return!0}function $_(e,t){return Ws(e)?zu(e,t):Ws(t)?zu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function zu(e,t){return Ws(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function B_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Vn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let ac=(function(e){return e.pop="pop",e.push="push",e})({}),gr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function U_(e){if(!e)if(Ua){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),P_(e)}const H_=/^[^#]+#/;function z_(e,t){return e.replace(H_,"#")+t}function j_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Jo=()=>({left:window.scrollX,top:window.scrollY});function V_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=j_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function ju(e,t){return(history.state?history.state.position-t:-1)+e}const ic=new Map;function q_(e,t){ic.set(e,t)}function G_(e){const t=ic.get(e);return ic.delete(e),t}function K_(e){return typeof e=="string"||e&&typeof e=="object"}function $m(e){return typeof e=="string"||typeof e=="symbol"}let Tt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Bm=Symbol("");Tt.MATCHER_NOT_FOUND+"",Tt.NAVIGATION_GUARD_REDIRECT+"",Tt.NAVIGATION_ABORTED+"",Tt.NAVIGATION_CANCELLED+"",Tt.NAVIGATION_DUPLICATED+"";function di(e,t){return lt(new Error,{type:e,[Bm]:!0},t)}function mn(e,t){return e instanceof Error&&Bm in e&&(t==null||!!(e.type&t))}const W_=["params","query","hash"];function J_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of W_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function Z_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Nm," "),i=a.indexOf("="),l=ll(i<0?a:a.slice(0,i)),o=i<0?null:ll(a.slice(i+1));if(l in t){let r=t[l];Ws(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Vu(e){let t="";for(let s in e){const n=e[s];if(s=O_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ws(n)?n.map(a=>a&&nc(a)):[n&&nc(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function Y_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ws(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const Q_=Symbol(""),qu=Symbol(""),Zo=Symbol(""),hd=Symbol(""),lc=Symbol("");function wi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Zn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(di(Tt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):K_(p)?r(di(Tt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function br(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Om(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Zn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=x_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Zn(p,s,n,l,o,a)()}))}}return i}function X_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>ci(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>ci(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let ew=()=>location.protocol+"//"+location.host;function Um(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),Hu(o,"")}return Hu(s,e)+n+a}function tw(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const h=Um(e,location),m=s.value,v=t.value;let w=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}w=v?p.position-v.position:0}else n(h);a.forEach(L=>{L(s.value,m,{delta:w,type:ac.pop,direction:w?w>0?gr.forward:gr.back:gr.unknown})})};function r(){l=s.value}function c(p){a.push(p);const h=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(lt({},p.state,{scroll:Jo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Gu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Jo():null}}function sw(e){const{history:t,location:s}=window,n={value:Um(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:ew()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,lt({},t.state,Gu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=lt({},a.value,t.state,{forward:r,scroll:Jo()});i(d.current,d,!0),i(r,lt({},Gu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function nw(e){e=U_(e);const t=sw(e),s=tw(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=lt({location:"",base:e,go:n,createHref:z_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function aw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),nw(e)}let fa=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Bt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Bt||{});const iw={type:fa.Static,value:""},lw=/[a-zA-Z0-9_]/;function ow(e){if(!e)return[[]];if(e==="/")return[[iw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Bt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Bt.Static?i.push({type:fa.Static,value:c}):s===Bt.Param||s===Bt.ParamRegExp||s===Bt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:fa.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Bt.ParamRegExp){n=s,s=Bt.EscapeNext;continue}switch(s){case Bt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Bt.Param):p();break;case Bt.EscapeNext:p(),s=n;break;case Bt.Param:r==="("?s=Bt.ParamRegExp:lw.test(r)?p():(u(),s=Bt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Bt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Bt.ParamRegExpEnd:d+=r;break;case Bt.ParamRegExpEnd:u(),s=Bt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Bt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Ku="[^/]+?",rw={sensitive:!1,strict:!1,start:!0,end:!0};var us=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(us||{});const cw=/[.+*?^${}()[\]/\\]/g;function dw(e,t){const s=lt({},rw,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[us.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=us.Segment+(s.sensitive?us.BonusCaseSensitive:0);if(p.type===fa.Static)u||(a+="/"),a+=p.value.replace(cw,"\\$&"),h+=us.Static;else if(p.type===fa.Param){const{value:m,repeatable:v,optional:w,regexp:L}=p;i.push({name:m,repeatable:v,optional:w});const _=L||Ku;if(_!==Ku){h+=us.BonusCustomRegExp;try{`${_}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${_}): `+b.message)}}let g=v?`((?:${_})(?:/(?:${_}))*)`:`(${_})`;u||(g=w&&c.length<2?`(?:/${g})`:"/"+g),w&&(g+="?"),a+=g,h+=us.Dynamic,w&&(h+=us.BonusOptional),v&&(h+=us.BonusRepeatable),_===".*"&&(h+=us.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=us.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===fa.Static)d+=h.value;else if(h.type===fa.Param){const{value:m,repeatable:v,optional:w}=h,L=m in c?c[m]:"";if(Ws(L)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const _=Ws(L)?L.join("/"):L;if(!_)if(w)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=_}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function uw(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===us.Static+us.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===us.Static+us.Segment?1:-1:0}function Hm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=uw(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Wu(n))return 1;if(Wu(a))return-1}return a.length-n.length}function Wu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const pw={strict:!1,end:!0,sensitive:!1};function fw(e,t,s){const n=dw(ow(e.path),s),a=lt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function hw(e,t){const s=[],n=new Map;t=Uu(pw,t);function a(u){return n.get(u)}function i(u,p,h){const m=!h,v=Zu(u);v.aliasOf=h&&h.record;const w=Uu(t,u),L=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const R of b)L.push(Zu(lt({},v,{components:h?h.record.components:v.components,path:R,aliasOf:h?h.record:v})))}let _,g;for(const b of L){const{path:R}=b;if(p&&R[0]!=="/"){const C=p.record.path,O=C[C.length-1]==="/"?"":"/";b.path=p.record.path+(R&&O+R)}if(_=fw(b,p,w),h?h.alias.push(_):(g=g||_,g!==_&&g.alias.push(_),m&&u.name&&!Yu(_)&&l(u.name)),zm(_)&&r(_),v.children){const C=v.children;for(let O=0;O<C.length;O++)i(C[O],_,h&&h.children[O])}h=h||_}return g?()=>{l(g)}:Bi}function l(u){if($m(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=gw(u,s);s.splice(p,0,u),u.record.name&&!Yu(u)&&n.set(u.record.name,u)}function c(u,p){let h,m={},v,w;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw di(Tt.MATCHER_NOT_FOUND,{location:u});w=h.record.name,m=lt(Ju(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Ju(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),w=h.record.name);else{if(h=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw di(Tt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});w=h.record.name,m=lt({},p.params,u.params),v=h.stringify(m)}const L=[];let _=h;for(;_;)L.unshift(_.record),_=_.parent;return{name:w,path:v,params:m,matched:L,meta:vw(L)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Ju(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Zu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:mw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function mw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Yu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function vw(e){return e.reduce((t,s)=>lt(t,s.meta),{})}function gw(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;Hm(e,t[i])<0?n=i:s=i+1}const a=bw(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function bw(e){let t=e;for(;t=t.parent;)if(zm(t)&&Hm(e,t)===0)return t}function zm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Qu(e){const t=Us(Zo),s=Us(hd),n=G(()=>{const r=ln(e.to);return t.resolve(r)}),a=G(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(ci.bind(null,d));if(p>-1)return p;const h=Xu(r[c-2]);return c>1&&Xu(d)===h&&u[u.length-1].path!==h?u.findIndex(ci.bind(null,r[c-2])):p}),i=G(()=>a.value>-1&&kw(s.params,n.value.params)),l=G(()=>a.value>-1&&a.value===s.matched.length-1&&Fm(s.params,n.value.params));function o(r={}){if(ww(r)){const c=t[ln(e.replace)?"replace":"push"](ln(e.to)).catch(Bi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:G(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function yw(e){return e.length===1?e[0]:e}const xw=fl({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Qu,setup(e,{slots:t}){const s=ea(Qu(e)),{options:n}=Us(Zo),a=G(()=>({[ep(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[ep(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&yw(t.default(s));return e.custom?i:si("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),_w=xw;function ww(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function kw(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ws(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Xu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ep=(e,t,s)=>e??t??s,Sw=fl({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Us(lc),a=G(()=>e.route||n.value),i=Us(qu,0),l=G(()=>{let c=ln(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=G(()=>a.value.matched[l.value]);Di(qu,G(()=>l.value+1)),Di(Q_,o),Di(lc,a);const r=f();return Mt(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!ci(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return tp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,w=si(p,lt({},m,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return tp(s.default,{Component:w,route:c})||w}}});function tp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Tw=Sw;function Cw(e){const t=hw(e.routes,e),s=e.parseQuery||Z_,n=e.stringifyQuery||Vu,a=e.history,i=wi(),l=wi(),o=wi(),r=Sc(Vn);let c=Vn;Ua&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=mr.bind(null,X=>""+X),u=mr.bind(null,N_),p=mr.bind(null,ll);function h(X,be){let q,z;return $m(X)?(q=t.getRecordMatcher(X),z=be):z=X,t.addRoute(z,q)}function m(X){const be=t.getRecordMatcher(X);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(X=>X.record)}function w(X){return!!t.getRecordMatcher(X)}function L(X,be){if(be=lt({},be||r.value),typeof X=="string"){const P=vr(s,X,be.path),U=t.resolve({path:P.path},be),oe=a.createHref(P.fullPath);return lt(P,U,{params:p(U.params),hash:ll(P.hash),redirectedFrom:void 0,href:oe})}let q;if(X.path!=null)q=lt({},X,{path:vr(s,X.path,be.path).path});else{const P=lt({},X.params);for(const U in P)P[U]==null&&delete P[U];q=lt({},X,{params:u(P)}),be.params=u(be.params)}const z=t.resolve(q,be),se=X.hash||"";z.params=d(p(z.params));const fe=M_(n,lt({},X,{hash:I_(se),path:z.path})),y=a.createHref(fe);return lt({fullPath:fe,hash:se,query:n===Vu?Y_(X.query):X.query||{}},z,{redirectedFrom:void 0,href:y})}function _(X){return typeof X=="string"?vr(s,X,r.value.path):lt({},X)}function g(X,be){if(c!==X)return di(Tt.NAVIGATION_CANCELLED,{from:be,to:X})}function b(X){return O(X)}function R(X){return b(lt(_(X),{replace:!0}))}function C(X,be){const q=X.matched[X.matched.length-1];if(q&&q.redirect){const{redirect:z}=q;let se=typeof z=="function"?z(X,be):z;return typeof se=="string"&&(se=se.includes("?")||se.includes("#")?se=_(se):{path:se},se.params={}),lt({query:X.query,hash:X.hash,params:se.path!=null?{}:X.params},se)}}function O(X,be){const q=c=L(X),z=r.value,se=X.state,fe=X.force,y=X.replace===!0,P=C(q,z);if(P)return O(lt(_(P),{state:typeof P=="object"?lt({},se,P.state):se,force:fe,replace:y}),be||q);const U=q;U.redirectedFrom=be;let oe;return!fe&&F_(n,z,q)&&(oe=di(Tt.NAVIGATION_DUPLICATED,{to:U,from:z}),K(z,z,!0,!1)),(oe?Promise.resolve(oe):N(U,z)).catch(ae=>mn(ae)?mn(ae,Tt.NAVIGATION_GUARD_REDIRECT)?ae:Z(ae):S(ae,U,z)).then(ae=>{if(ae){if(mn(ae,Tt.NAVIGATION_GUARD_REDIRECT))return O(lt({replace:y},_(ae.to),{state:typeof ae.to=="object"?lt({},se,ae.to.state):se,force:fe}),be||U)}else ae=E(U,z,!0,y,se);return F(U,z,ae),ae})}function A(X,be){const q=g(X,be);return q?Promise.reject(q):Promise.resolve()}function x(X){const be=te.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(X):X()}function N(X,be){let q;const[z,se,fe]=X_(X,be);q=br(z.reverse(),"beforeRouteLeave",X,be);for(const P of z)P.leaveGuards.forEach(U=>{q.push(Zn(U,X,be))});const y=A.bind(null,X,be);return q.push(y),Ne(q).then(()=>{q=[];for(const P of i.list())q.push(Zn(P,X,be));return q.push(y),Ne(q)}).then(()=>{q=br(se,"beforeRouteUpdate",X,be);for(const P of se)P.updateGuards.forEach(U=>{q.push(Zn(U,X,be))});return q.push(y),Ne(q)}).then(()=>{q=[];for(const P of fe)if(P.beforeEnter)if(Ws(P.beforeEnter))for(const U of P.beforeEnter)q.push(Zn(U,X,be));else q.push(Zn(P.beforeEnter,X,be));return q.push(y),Ne(q)}).then(()=>(X.matched.forEach(P=>P.enterCallbacks={}),q=br(fe,"beforeRouteEnter",X,be,x),q.push(y),Ne(q))).then(()=>{q=[];for(const P of l.list())q.push(Zn(P,X,be));return q.push(y),Ne(q)}).catch(P=>mn(P,Tt.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function F(X,be,q){o.list().forEach(z=>x(()=>z(X,be,q)))}function E(X,be,q,z,se){const fe=g(X,be);if(fe)return fe;const y=be===Vn,P=Ua?history.state:{};q&&(z||y?a.replace(X.fullPath,lt({scroll:y&&P&&P.scroll},se)):a.push(X.fullPath,se)),r.value=X,K(X,be,q,y),Z()}let M;function V(){M||(M=a.listen((X,be,q)=>{if(!de.listening)return;const z=L(X),se=C(z,de.currentRoute.value);if(se){O(lt(se,{replace:!0,force:!0}),z).catch(Bi);return}c=z;const fe=r.value;Ua&&q_(ju(fe.fullPath,q.delta),Jo()),N(z,fe).catch(y=>mn(y,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_CANCELLED)?y:mn(y,Tt.NAVIGATION_GUARD_REDIRECT)?(O(lt(_(y.to),{force:!0}),z).then(P=>{mn(P,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&!q.delta&&q.type===ac.pop&&a.go(-1,!1)}).catch(Bi),Promise.reject()):(q.delta&&a.go(-q.delta,!1),S(y,z,fe))).then(y=>{y=y||E(z,fe,!1),y&&(q.delta&&!mn(y,Tt.NAVIGATION_CANCELLED)?a.go(-q.delta,!1):q.type===ac.pop&&mn(y,Tt.NAVIGATION_ABORTED|Tt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),F(z,fe,y)}).catch(Bi)}))}let J=wi(),T=wi(),k;function S(X,be,q){Z(X);const z=T.list();return z.length?z.forEach(se=>se(X,be,q)):console.error(X),Promise.reject(X)}function $(){return k&&r.value!==Vn?Promise.resolve():new Promise((X,be)=>{J.add([X,be])})}function Z(X){return k||(k=!X,V(),J.list().forEach(([be,q])=>X?q(X):be()),J.reset()),X}function K(X,be,q,z){const{scrollBehavior:se}=e;if(!Ua||!se)return Promise.resolve();const fe=!q&&G_(ju(X.fullPath,0))||(z||!q)&&history.state&&history.state.scroll||null;return Rt().then(()=>se(X,be,fe)).then(y=>y&&V_(y)).catch(y=>S(y,X,be))}const Y=X=>a.go(X);let ce;const te=new Set,de={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:v,resolve:L,options:e,push:b,replace:R,go:Y,back:()=>Y(-1),forward:()=>Y(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:T.add,isReady:$,install(X){X.component("RouterLink",_w),X.component("RouterView",Tw),X.config.globalProperties.$router=de,Object.defineProperty(X.config.globalProperties,"$route",{enumerable:!0,get:()=>ln(r)}),Ua&&!ce&&r.value===Vn&&(ce=!0,b(a.location).catch(z=>{}));const be={};for(const z in Vn)Object.defineProperty(be,z,{get:()=>r.value[z],enumerable:!0});X.provide(Zo,de),X.provide(hd,kc(be)),X.provide(lc,r);const q=X.unmount;te.add(X),X.unmount=function(){te.delete(X),te.size<1&&(c=Vn,M&&M(),M=null,r.value=Vn,ce=!1,k=!1),q()}}};function Ne(X){return X.reduce((be,q)=>be.then(()=>x(q)),Promise.resolve())}return de}function jm(){return Us(Zo)}function Ew(e){return Us(hd)}const Yo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Ew(),s=jm(),n=G({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=G(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=G(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});Mt(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},ol=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),cn=e=>Number.isSafeInteger(e)&&e>=0,Aw=e=>e===null||typeof e=="string",_o=(e,t)=>cn(e)&&cn(t)&&t>=e,md=e=>ol(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Aw(e.cursor);function Rw(e){return!md(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!cn(e.total_chars)||!cn(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!_o(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&ol(e.tail)&&typeof e.tail.text=="string"&&_o(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function sp(e){return md(e)&&e.kind==="process_output"&&cn(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>cn(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&_o(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Iw(e){return md(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>cn(e[t]))&&_o(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&cn(e.tools_omitted)}function oc(e){try{return JSON.parse(e)}catch{return}}const rc=e=>JSON.stringify(e,null,2),Ow=e=>{const t=oc(e);return t===void 0?e:rc(t)},Nl=(e,t,s)=>`[${e}, ${t}) ${s}`;function Vm(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:rc(e)??"";let n=typeof e=="string"?oc(e):e,a=null;if(typeof e=="string"&&n===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=oc(e.slice(d+c.length)),h=e.slice(0,u);sp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(n=p,a=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Ow(d):d});if(ol(n)&&n.kind==="audit_preview"&&n.audit_clipped===!0&&(!("original_chars"in n)||cn(n.original_chars))&&(!("preview"in n)||typeof n.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...cn(n.original_chars)?[`original ${n.original_chars} code points`]:[]],ol(n.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof n.source[c])&&i.header.push(`source ${c}: ${n.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:n.preview??(t?"(no preview retained in audit)":"")}),i.metadata=n,i}if(Rw(n))i.kind="tool_output",i.header=[n.status,`retention: ${n.retention}`],n.retention==="retained"?(i.header.push(`${n.total_bytes} UTF-8 bytes`,`${n.total_chars} code points`),i.sections.push(l(`${"head"in n?"Head":"Page"} ${Nl(n.start,n.end,"code points")}`,n.head??n.text)),(o=n.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Nl(n.tail.start,n.tail.end,"code points")} — not a continuation`,n.tail.text))):(i.header.push(n.error),i.sections.push(l("Head — retention failed",n.head),l("Tail context only — may overlap head",n.tail.text))),typeof((r=n.matches)==null?void 0:r.summary)=="string"&&i.header.push(n.matches.summary);else if(sp(n)&&(typeof n.text=="string"||a!==null)){i.kind="process_output",i.header=[n.status,`PID ${n.pid}`,...n.exit_code!==null?[`exit ${n.exit_code}`]:[],`emitted ${n.emitted_bytes} B`,`retained ${n.retained_bytes} B`,`shown ${n.shown_bytes} B`,`capture-limit loss ${n.capture_limit_loss_bytes} B`,`not retained ${n.not_retained_bytes} B`],n.capture_error&&i.header.push(`capture error: ${n.capture_error}`),n.tail_status&&i.header.push(`recent output: ${n.tail_status}`);const c=n.shown_intervals.map(d=>Nl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${a!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,a??n.text))}else if(Iw(n))i.kind="agent_result",i.header=[n.status,`agent ${n.id}`,n.label,`original ${n.original_bytes} B`,`result ${n.result_bytes} B`,`error ${n.error_bytes} B`,`source ${n.source_original_bytes} B`,`tools ${n.tools_used.length} shown / ${n.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Nl(n.offset,n.end,"UTF-8 bytes")}`,n.preview));else return i.kind=n===void 0?"text":"json",i.sections.push({label:"",text:n===void 0||!t&&typeof e=="string"?s:t?rc(n):JSON.stringify(n)}),i;if(i.metadata=n,i.header.push(`source truncated: ${n.truncated?"yes":"no"}`,`cursor: ${n.cursor?"present":"none"}`),typeof n.expires_at=="string"&&i.header.push(`expires: ${n.expires_at}`),typeof n.expires_at=="number"){const c=new Date(n.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function qm(e,t=30,s=6e3){let n=1,a=0,i=0;if(t>0&&s>0)for(const l of e){if(a>=s||l===`
`&&n>=t)break;l===`
`&&n++,a++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:a,lines:n}}const yr=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Lw=e=>e!==null&&typeof e=="object",Nw=new Set(["_hmac","_prev_hmac"]),cc=e=>e.replace(/\r\n?/g,`
`);function rl(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const n=JSON.parse(t,(a,i)=>{if(Nw.has(a)){s=!0;return}return i});return cc(s?JSON.stringify(n):t)}catch{return cc(t)}}function Dw(e){const t=e.metadata;if(!t)return[];const s=[],n=e.kind==="audit_preview"&&Lw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),n.truncated===!0&&s.push("source truncated"),n.retention==="failed"&&s.push("retention unavailable"),n.capture_error&&s.push(`capture unavailable: ${n.capture_error}`),n.capture_limit_loss_bytes>0&&s.push(`capture loss ${n.capture_limit_loss_bytes} B`),n.not_retained_bytes>0&&s.push(`not retained ${n.not_retained_bytes} B`),n.capture_lost_bytes>0&&s.push(`capture lost ${n.capture_lost_bytes} B`),n.dropped_bytes>0&&s.push(`dropped ${n.dropped_bytes} B`),(n.capture_loss===!0||n.output_lost===!0||n.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(n.exit_code)&&n.exit_code!==0&&s.push(`process exit ${n.exit_code}`),["failed","error","cancelled","timed_out"].includes(n.status)&&s.push(`source ${n.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Pw(e){var h;const t=Vm(typeof e=="string"?cc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:rl(m.text)})),n=s.map(m=>m.text).filter(Boolean).join(`
`),a=n.replace(/\n$/,""),i=[...n].length,l=a?a.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>yr.inlineChars||o&&a.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=qm(c,yr.previewLines,yr.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:a.replace(/\n/g," "),warnings:Dw(t)}}const Mw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1}},setup(e){const t=f(!1),s=f(!0),n=f(!1),a=f(""),i=f(null),l=f(null),o=f(!1),r=G(()=>Pw(e.value)),c=G(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=G(()=>n.value?c.value:r.value.formatted),u=G(()=>r.value.promoted&&r.value.preview.folded||o.value),p=G(()=>t.value?!!d.value:r.value.promoted),h=G(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function w(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function L(){t.value=!t.value,t.value||(n.value=!1)}function _(){n.value=!n.value,t.value=!0,a.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(a.value="Copied")}catch{b===e.value&&(a.value="Copy unavailable — select text manually")}}return Mt(()=>e.value,()=>{t.value=!1,n.value=!1,a.value=""}),Mt([i,l,t,s,r],()=>Rt(w),{flush:"post"}),je(()=>{m=new ResizeObserver(v),w()}),ft(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:L,toggleRaw:_,copyOutput:g}},template:`
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
    </section>`},Qo={name:"ToolOutput",components:{CompactOutput:Mw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1}},setup(e){const t=f(!1),s=f(!0),n=f(!1),a=f(""),i=G(()=>Vm(e.value)),l=G(()=>n.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=G(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=qm(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=G(()=>o.value.some(u=>u.folded)),c=G(()=>n.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(a.value="Copied")}catch{e.value===u&&(a.value="Copy unavailable — select text manually")}}return Mt(()=>e.value,()=>{t.value=!1,a.value=""}),Mt(n,()=>{t.value=!1,a.value=""}),{expanded:t,wrapped:s,rawMode:n,copyStatus:a,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
    <compact-output v-if="presentation === 'compact'" :value="value" :raw-value="rawValue" :label="label" :has-context="hasContext">
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
  `},Fw={components:{ToolOutput:Qo},setup(){const e=f([]),t=f([]),s=f({}),n=50;function a(p){var v,w,L,_,g,b,R,C,O,A,x;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(w=h.metadata)!=null&&w.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const N=h.call_id||((L=h.metadata)==null?void 0:L.call_id)||null,F=h.agent_id||((_=h.metadata)==null?void 0:_.agent_id)||"",E={callId:N,agentId:F,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:N?`${F}:${N}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(E);return}if(m==="tool_end"||m==="loop_tool"){const N=h.call_id||((R=h.metadata)==null?void 0:R.call_id)||null,F=h.agent_id||((C=h.metadata)==null?void 0:C.agent_id)||"";let E=-1;if(N&&(E=e.value.findIndex(M=>M.callId===N&&M.agentId===F&&M.status==="running")),E<0&&!N)for(let M=e.value.length-1;M>=0;M--){const V=e.value[M];if(V.tool===h.action&&V.agentId===F&&V.status==="running"){E=M;break}}if(E>=0){const M=e.value[E];M.status=h.error||(O=h.metadata)!=null&&O.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((A=h.metadata)==null?void 0:A.status))?"error":"success",M.elapsed=h.execution_time_ms??h.duration_ms??((x=h.metadata)==null?void 0:x.elapsed_ms)??Date.now()-M.startTime,M.result=h.result_summary??h.detail??"",M.fadingOut=!0,setTimeout(()=>{const V=e.value.indexOf(M);V>=0&&e.value.splice(V,1),t.value.unshift(M),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const N=h.call_id||h.tool_name||"unknown";if(h.finished){const F={...s.value};delete F[N],s.value=F}else{const E=((s.value[N]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[N]:E.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}je(r),Qt(r),Gt(c),ft(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function vd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function Aa(e){const t=vd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function $w(e){const t=vd(e);return t?t.toLocaleTimeString():"—"}function Gm(e){const t=vd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Bw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ui(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function gd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function Km(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function np(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function bd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function Wm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Jm=Symbol("agent-detail-cancelled"),Uw=15e3;function Hw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&a(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Jm),i==null||i.abort()}}}function Zm({state:e,requestDetail:t,timeoutMs:s=Uw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const w=Hw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=w.cancel,v.promise=(async()=>{let L=null,_=null;try{L=await w.promise}catch(g){_=g}L!==Jm&&(l!==v||e.detailId!==p||(l=null,!_&&(L===null||typeof L!="object")&&(_=new Error(`${n} response was empty or invalid`)),_?e.detail===null&&(e.detailError=(_==null?void 0:_.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function zw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const jw={components:{ToolOutput:Qo},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(!0),i=f("all");let l=!1;const o=G(()=>e.value.filter(S=>S.status==="running").length),r=G(()=>e.value.filter(S=>S.status==="completed").length),c=G(()=>e.value.filter(S=>["failed","timeout","killed"].includes(S.status)).length),d=G(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=G(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(S=>["failed","timeout","killed"].includes(S.status)):e.value.filter(S=>S.status===i.value));function p(S){const $=Number(S.max_iterations)||0;return $<=0?0:Math.min(100,Math.round(S.iteration_count/$*100))}function h(S){return(Number(S.max_iterations)||0)>0}function m(S,$){return S?S==="N/A"?"N/A":$==="current_inheritance"?`inherit (currently ${S})`:S:"unknown"}function v(S){return m(S.display_model,S.display_model_source||S.display_source)}function w(S){return m(S.display_reasoning_effort,S.display_reasoning_effort_source||S.display_source)}function L(S){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[S]||""}const _=f(null),g=f(null),b=f(!1),R=f(null),C=f(""),A=Zm({state:{get detail(){return _.value},set detail(S){_.value=S},get detailId(){return g.value},set detailId(S){g.value=S},get detailLoading(){return b.value},set detailLoading(S){b.value=S},get detailError(){return R.value},set detailError(S){R.value=S}},requestDetail:(S,{signal:$})=>j.get(`/api/agents/${encodeURIComponent(S)}`,{signal:$})});async function x(S){C.value="",await A.open(S.id)}function N(){A.close(),C.value=""}async function F(){await A.refresh()}async function E(S,$){try{await navigator.clipboard.writeText($||""),C.value=S,setTimeout(()=>{C.value===S&&(C.value="")},1500)}catch{xe.error("Copy failed")}}async function M(S=!1){S=S===!0,S||(t.value=!0);try{const $=await j.get("/api/agents");e.value=Array.isArray($)?$:[],s.value=null}catch($){S||(s.value=$.message)}S||(t.value=!1)}async function V(S){const $=e.value.find(K=>K.id===S);if(await qt({title:"Kill agent",message:`Kill agent "${($==null?void 0:$.label)||S}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=S;try{await j.del(`/api/agents/${encodeURIComponent(S)}`),xe.success("Agent killed"),await M()}catch(K){xe.error(K.message||"Failed to kill agent")}n.value=null}}const J=zw({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:F});function T(){J.start()}function k(){J.stop()}return Mt(a,()=>J.sync()),je(()=>{l=!0,M(),T()}),Qt(()=>{l=!0,M(!0),T()}),Gt(()=>{l=!1,k()}),ft(()=>{l=!1,k(),A.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:Aa,formatDuration:ui,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:w,displaySourceLabel:L,detail:_,detailId:g,detailLoading:b,detailError:R,copied:C,openDetail:x,closeDetail:N,copyText:E,fetchAgents:M,killAgent:V,startAutoRefresh:T,stopAutoRefresh:k}}},Vw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const w=Zm({state:{get detail(){return c.value},set detail(k){c.value=k},get detailId(){return d.value},set detailId(k){d.value=k},get detailLoading(){return u.value},set detailLoading(k){u.value=k},get detailError(){return p.value},set detailError(k){p.value=k}},detailLabel:"Loop detail",requestDetail:(k,{signal:S})=>j.get(`/api/loops/${encodeURIComponent(k)}?limit=100`,{signal:S})});async function L(k){h.value="",await w.open(k.id)}function _(){w.close(),h.value=""}async function g(k,S){try{await navigator.clipboard.writeText(S||""),h.value=k,setTimeout(()=>{h.value===k&&(h.value="")},1500)}catch{xe.error("Copy failed")}}const b=G(()=>e.value.reduce((k,S)=>k+(S.iteration_count||0),0)),R=G(()=>e.value.filter(k=>k.status==="running").length);function C(k){return k==="running"?"loop-status-running":k==="error"?"loop-status-error":"loop-status-stopped"}function O(k){return k==="running"?"badge-success":k==="error"?"badge-danger":k==="completed"?"badge-info":"badge-warning"}function A(k){return k==="act"?"badge-warning":k==="silent"?"badge-info":"badge-success"}async function x(k=!1){k=k===!0,k||(t.value=!0);try{const S=await j.get("/api/loops");e.value=Array.isArray(S)?S:[],s.value=null}catch(S){k||(s.value=S.message)}k||(t.value=!1)}async function N(){l.value=null;const k=a.value;if(!k.goal.trim()){l.value="Goal is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}const S={goal:k.goal.trim(),channel_id:k.channel_id.trim(),interval_seconds:k.interval_seconds||60,mode:k.mode,max_iterations:k.max_iterations||50};k.stop_condition.trim()&&(S.stop_condition=k.stop_condition.trim()),i.value=!0;try{const $=await j.post("/api/loops",S);xe.success(`Loop started: ${$.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await x()}catch($){l.value=$.message}i.value=!1}async function F(k){if(await qt({title:"Stop loop",message:`Stop loop ${k}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=k;try{await j.del(`/api/loops/${encodeURIComponent(k)}`),xe.success("Loop stopped"),await x()}catch($){xe.error($.message||"Failed to stop loop")}o.value=null}}async function E(k){r.value=k;try{await j.post(`/api/loops/${encodeURIComponent(k)}/restart`),xe.success("Loop restarted"),await x()}catch(S){xe.error(S.message||"Failed to restart loop")}r.value=null}function M(k){m&&k.payload&&(k.payload.loop_id||k.payload.type==="loop")&&(x(!0),d.value&&w.refresh())}let V=null;function J(){V!==null&&clearInterval(V),V=null}function T(){J(),m&&(V=setInterval(()=>{x(!0),d.value&&w.refresh()},5e3))}return je(()=>{m=!0,x(),Ye.subscribe("events",M),T()}),Qt(()=>{m=!0,x(!0),T()}),Gt(()=>{m=!1,J()}),ft(()=>{m=!1,Ye.unsubscribe("events",M),J(),w.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:R,statusDotClass:C,statusBadge:O,modeBadge:A,formatAge:Gm,formatDuration:ui,formatTs:Aa,formatTokens:Wm,openDetail:L,closeDetail:_,copyText:g,fetchLoops:x,doCreate:N,doStop:F,doRestart:E}}},qw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!0);let a=null;const i=f(null),l=G(()=>e.value.filter(_=>_.status==="running").length),o=G(()=>e.value.filter(_=>_.status!=="running").length);function r(_){return _==="running"?"loop-status-running":_==="failed"||_==="error"?"loop-status-error":"loop-status-stopped"}function c(_){return _==="running"?"badge-success":_==="completed"||_==="exited"?"badge-info":_==="killed"||_==="error"||_==="failed"?"badge-danger":"badge-warning"}async function d(_=!1){_=_===!0,_||(t.value=!0);try{e.value=await j.get("/api/processes"),s.value=null}catch(g){_||(s.value=g.message)}_||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Mt(n,_=>{_?u():p()});async function h(_){if(await qt({title:"Kill process",message:`Kill process ${_}?`,confirmLabel:"Kill",danger:!0})){i.value=_;try{await j.del(`/api/processes/${_}`),xe.success(`Process ${_} killed`),await d()}catch(b){xe.error(b.message||"Failed to kill process")}i.value=null}}function m(_){_.payload&&(_.payload.pid||_.payload.type==="process")&&d(!0)}let v=!1;function w(){v||(v=!0,d(),Ye.subscribe("events",m),u())}function L(){v&&(v=!1,Ye.unsubscribe("events",m),p())}return je(w),Qt(w),Gt(L),ft(L),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:ui,fetchProcesses:d,doKill:h}}},Gw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function ap(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function Kw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function Ww(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function Jw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=Gw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const w of new Set([p,h])){const L=new Date(u+w*6e4);Kw(L,c)===d&&(m.some(_=>_.getTime()===L.getTime())||m.push(L))}if(m.sort((w,L)=>w.getTime()-L.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(w=>({instant:w,offset:Ww(w),iso:w.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const Zw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(!1),a=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),o=f(null),r=G(()=>Jw(a.value.run_at));Mt(()=>a.value.run_at,()=>{o.value=null});const c=G(()=>{var z;const q=r.value;return q.state==="ok"?q.instant:q.state==="ambiguous"&&o.value!==null&&((z=q.options[o.value])==null?void 0:z.instant)||null}),d=G(()=>{const q=c.value;return q?`${q.toLocaleString()} local — ${q.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),w=f(null),L=f(null),_=f(null),g=f(null),b=f([]),R=f(!1),C=f("");let O=0;const A=G(()=>e.value.filter(q=>q.cron&&!q.one_time).length),x=G(()=>e.value.filter(q=>q.one_time).length),N=G(()=>e.value.filter(q=>q.trigger).length),F=G(()=>e.value.filter(q=>q.paused).length),E=G(()=>e.value.filter(q=>q.consecutive_failures>0).length);function M(q){if(!q)return"-";const z=Date.now(),fe=(new Date(q).getTime()-z)/1e3;if(fe<0)return"overdue";if(fe<60)return"in < 1 min";if(fe<3600)return`in ${Math.floor(fe/60)} min`;if(fe<86400){const P=Math.floor(fe/3600),U=Math.floor(fe%3600/60);return U>0?`in ${P}h ${U}m`:`in ${P}h`}const y=Math.floor(fe/86400);return`in ${y} day${y!==1?"s":""}`}function V(q){return q==null?"-":q<1e3?`${q}ms`:q<6e4?`${(q/1e3).toFixed(1)}s`:ui(q/1e3)}function J(q=a.value.cron){a.value.cron=q,ap(a.value,"cron"),u.value=null}function T(q=a.value.run_at){a.value.run_at=q,ap(a.value,"run_at"),u.value=null}async function k(){const q=a.value.cron.trim();if(q){p.value=!0;try{u.value=await j.post("/api/schedules/validate-cron",{expression:q})}catch(z){u.value={valid:!1,error:z.message}}p.value=!1}}async function S(){t.value=!0,s.value=null;try{e.value=await j.get("/api/schedules")}catch(q){s.value=q.message}t.value=!1}async function $(q){if(g.value===q){g.value=null,b.value=[];return}g.value=q,R.value=!0,b.value=[];const z=++O;try{const se=await j.get(`/api/schedules/${encodeURIComponent(q)}/history?limit=10`);if(z!==O||g.value!==q)return;b.value=se,C.value=""}catch(se){if(z!==O||g.value!==q)return;b.value=[],C.value=se.message||"Failed to load execution history"}z===O&&(R.value=!1)}async function Z(){l.value=null;const q=a.value;if(!q.description.trim()){l.value="Description is required";return}if(!q.channel_id.trim()){l.value="Channel ID is required";return}if(!q.cron.trim()&&!q.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(q.cron.trim()&&q.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const z={description:q.description.trim(),action:q.action,channel_id:q.channel_id.trim()};if(q.cron.trim()&&(z.cron=q.cron.trim()),q.run_at.trim()){const se=r.value;if(se.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(se.state==="invalid"){l.value="One-time run time is not a valid date";return}const fe=c.value;if(se.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!fe){l.value="One-time run time could not be resolved";return}z.run_at=fe.toISOString()}if(q.action==="reminder"&&q.message.trim()&&(z.message=q.message.trim()),q.action==="check"&&(q.tool_name.trim()&&(z.tool_name=q.tool_name.trim()),q.report_format&&(z.report_format=q.report_format),q.tool_input_str.trim()))try{z.tool_input=JSON.parse(q.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await j.post("/api/schedules",z),xe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await S()}catch(se){l.value=se.message}i.value=!1}async function K(q){m.value=q;try{const z=await j.post(`/api/schedules/${encodeURIComponent(q)}/run`);if(z.status==="failure")xe.error(`Execution failed: ${z.error||"unknown error"}`);else{const se=z.warning?`Executed (${z.warning})`:"Executed successfully";xe.success(se)}await S()}catch(z){xe.error(z.message||"Failed to trigger")}m.value=null}async function Y(q){w.value=q.id;const z=!q.paused;try{await j.put(`/api/schedules/${encodeURIComponent(q.id)}`,{paused:z}),xe.success(z?"Schedule paused":"Schedule resumed"),await S()}catch(se){xe.error(se.message||"Failed to update schedule")}w.value=null}const ce=new Map;function te(q,z){const se=ce.get(q.id);se&&clearTimeout(se.timer);const fe={run:()=>de(q,z),timer:null};fe.timer=setTimeout(()=>{ce.delete(q.id),fe.run()},500),ce.set(q.id,fe)}async function de(q,z){_.value=q.id;try{await j.put(`/api/schedules/${encodeURIComponent(q.id)}`,{report_format:z}),xe.success(z?"Structured report enabled":"Plain-text report enabled")}catch(se){xe.error(`Update failed: ${se.message}`)}finally{await S(),_.value=null}}function Ne(){for(const[q,z]of[...ce])clearTimeout(z.timer),ce.delete(q),z.run()}async function X(q){L.value=q;try{await j.post(`/api/schedules/${encodeURIComponent(q)}/reset-failures`),xe.success("Failure counters reset"),await S()}catch(z){xe.error(z.message||"Failed to reset")}L.value=null}async function be(q){const z=e.value.find(fe=>fe.id===q);if(await qt({title:"Delete schedule",message:`Delete "${(z==null?void 0:z.description)||q}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=q;try{await j.del(`/api/schedules/${encodeURIComponent(q)}`),xe.success("Schedule deleted"),await S()}catch(fe){xe.error(fe.message||"Failed to delete schedule")}v.value=null}}return je(()=>{S()}),ft(Ne),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:w,resettingId:L,reportUpdatingId:_,flushReportFormatTimers:Ne,expandedId:g,history:b,historyLoading:R,historyError:C,cronCount:A,oneTimeCount:x,webhookCount:N,pausedCount:F,failingCount:E,formatTs:Aa,formatAge:Gm,formatFuture:M,formatMs:V,formatDuration:ui,onCronInput:J,onRunAtInput:T,validateCron:k,toggleExpand:$,fetchSchedules:S,doCreate:Z,doRunNow:K,doTogglePause:Y,doUpdateReportFormat:te,doResetFailures:X,doDelete:be}}},Ym=[{id:"live",label:"Live",component:Fw},{id:"agents",label:"Agents",component:jw},{id:"loops",label:"Loops",component:Vw},{id:"processes",label:"Processes",component:qw},{id:"schedules",label:"Schedules",component:Zw}],Yw={components:{TabbedPage:Yo},setup(){return{tabs:Ym}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Qw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){n.value=n.value===m?null:m}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await j.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,n.value=null;try{const v=new URLSearchParams;a.value.tool&&v.set("tool",a.value.tool),a.value.user&&v.set("user",a.value.user),a.value.keyword&&v.set("q",a.value.keyword),a.value.date&&v.set("date",a.value.date),v.set("limit",String(a.value.limit));const w=v.toString(),L=await j.get(`/api/audit${w?"?"+w:""}`);if(m!==r)return;e.value=Array.isArray(L)?L:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return je(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:Aa,formatDetail:i,truncateBlock:Km,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},ip=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Xw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ek={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(null),a=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=ip,w=Xw,L=f([]),_=f(!1),g=f(""),b=f("flat"),R=f(new Set),C=f(""),O=f(""),A=f(""),x=f(null),N=f(!1),F=f(""),E=f(!1);let M=0;Mt([C,O,A],()=>{M++,N.value=!1,F.value="",E.value=x.value!==null},{flush:"sync"});function V(){try{const ie=localStorage.getItem("odin-session-presets");ie&&(L.value=JSON.parse(ie))}catch{}}function J(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const T=G(()=>p.value.trim()!==""||u.value!=="all"),k=G(()=>{let ie=[...e.value];const Te=ip.find(Ve=>Ve.id===u.value),Le=Te?Te.filters:{};if(Le.source&&(ie=ie.filter(Ve=>Ve.source===Le.source)),Le.minMessages&&(ie=ie.filter(Ve=>Ve.message_count>=Le.minMessages)),Le.hasCompaction&&(ie=ie.filter(Ve=>Ve.has_summary)),Le.maxAge!=null){const Ve=Date.now()/1e3;ie=ie.filter($t=>$t.last_active&&Ve-$t.last_active<=Le.maxAge)}if(p.value.trim()){const Ve=p.value.toLowerCase().trim();ie=ie.filter($t=>($t.channel_id||"").toLowerCase().includes(Ve)||($t.last_user_id||"").toLowerCase().includes(Ve)||($t.source||"").toLowerCase().includes(Ve))}const Ke=h.value,Et=m.value?1:-1;return ie.sort((Ve,$t)=>{const zt=Ve[Ke]||0,rs=$t[Ke]||0;return(zt-rs)*Et}),ie}),S=G(()=>{if(!a.value||!a.value.messages)return[];const ie=a.value.messages;if(ie.length===0)return[];const Te=[];let Le=[];for(const Ke of ie)Ke.role==="user"&&Le.length>0&&(Te.push(Le),Le=[]),Le.push(Ke);return Le.length>0&&Te.push(Le),Te}),$=G(()=>k.value.length>0&&c.value.size===k.value.length);function Z(ie){const Te=ie.find(Le=>Le.role==="user");if(Te&&Te.content){const Le=Te.content.slice(0,120);return Le.length<Te.content.length?Le+"...":Le}return"(no user message)"}function K(ie){const Te=new Set(R.value);Te.has(ie)?Te.delete(ie):Te.add(ie),R.value=Te}function Y(ie){u.value=ie}function ce(ie){u.value=ie.id,ie.filters.searchQuery!=null&&(p.value=ie.filters.searchQuery),ie.filters.sortBy&&(h.value=ie.filters.sortBy)}function te(){if(!g.value.trim())return;const ie={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};L.value=[...L.value,ie],J(),_.value=!1,g.value=""}function de(ie){L.value=L.value.filter(Te=>Te.id!==ie),J(),u.value===ie&&(u.value="all")}function Ne(){u.value="all",p.value="",h.value="last_active",m.value=!1}function X(ie){if(!ie)return"—";const Te=Date.now()/1e3-ie;if(Te<60)return"just now";if(Te<3600){const Ke=Math.floor(Te/60);return`${Ke} minute${Ke!==1?"s":""} ago`}if(Te<86400){const Ke=Math.floor(Te/3600);return`${Ke} hour${Ke!==1?"s":""} ago`}const Le=Math.floor(Te/86400);return`${Le} day${Le!==1?"s":""} ago`}function be(ie){if(!ie)return"";try{return new Date(ie*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function q(ie){if(!ie)return"";try{return new Date(ie*1e3).toLocaleString()}catch{return""}}function z(ie){return ie==="user"?"bg-gray-900/50 border border-gray-800":ie==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function se(ie){return ie==="user"?"sess-msg-user":ie==="assistant"?"sess-msg-assistant":"sess-msg-system"}function fe(ie){return ie==="user"?"badge-info":ie==="assistant"?"badge-success":"badge-warning"}function y(ie){return ie==="user"?"sess-dot-user":ie==="assistant"?"sess-dot-assistant":"sess-dot-system"}function P(ie){return ie==="user"?"text-cyan-400":ie==="assistant"?"text-indigo-400":"text-gray-500"}function U(ie){return ie?ie.length>2e3?ie.slice(0,2e3)+`
... (truncated)`:ie:""}async function oe(){const ie=C.value.trim();if(!ie)return;const Te=++M;N.value=!0,F.value="",E.value=x.value!==null;try{let Le=`/api/sessions/search?q=${encodeURIComponent(ie)}&limit=50`;O.value.trim()&&(Le+=`&channel_id=${encodeURIComponent(O.value.trim())}`),A.value.trim()&&(Le+=`&user_id=${encodeURIComponent(A.value.trim())}`);const Ke=await j.get(Le);if(Te!==M)return;x.value=Ke.results||[],E.value=!1}catch(Le){if(Te!==M)return;F.value=Le.message||"Search failed. Please retry."}finally{Te===M&&(N.value=!1)}}function ae(){M++,C.value="",O.value="",A.value="",x.value=null,F.value="",E.value=!1,N.value=!1}function le(ie){return ie?ie.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function he(ie){return ie==="user"?"fts-result-user":ie==="assistant"?"fts-result-assistant":ie==="summary"?"fts-result-summary":ie==="fts"?"fts-result-fts":ie==="channel"?"fts-result-channel":"fts-result-default"}function pe(ie){return ie==="user"?"badge-info":ie==="assistant"?"badge-success":ie==="summary"?"badge-warning":ie==="fts"?"badge-success":"badge-info"}let ue=0;async function re(){const ie=++ue;t.value=!0,s.value=null;try{const Te=await j.get("/api/sessions");if(ie!==ue)return;e.value=Te}catch(Te){if(ie!==ue)return;s.value=Te.message}ie===ue&&(t.value=!1)}function _e(){s.value=null,re()}async function ve(ie){if(n.value===ie){n.value=null,a.value=null,R.value=new Set;return}n.value=ie,a.value=null,i.value=!0,R.value=new Set;const Te=++l;try{const Le=await j.get(`/api/sessions/${encodeURIComponent(ie)}`);Te===l&&n.value===ie&&(a.value=Le)}catch(Le){Te===l&&n.value===ie&&(a.value={messages:[],summary:"",error:Le.message||"Failed to load session"})}finally{Te===l&&(i.value=!1)}}function we(ie){const Te=new Set(c.value);Te.has(ie)?Te.delete(ie):Te.add(ie),c.value=Te}function Ie(){$.value?c.value=new Set:c.value=new Set(k.value.map(ie=>ie.channel_id))}function B(ie){o.value=ie}async function ge(){if(o.value){r.value=!0;try{await j.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await re()}catch(ie){s.value=ie.message||"Failed to clear session"}r.value=!1,o.value=null}}function Se(){d.value=!0}async function Oe(){if(c.value.size!==0){r.value=!0;try{await j.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await re()}catch(ie){s.value=ie.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Me(ie,Te){const Le=`/api/sessions/${encodeURIComponent(ie)}/export?format=${Te}`;try{const Ke=await j.getBlob(Le),Et=URL.createObjectURL(Ke),Ve=document.createElement("a");Ve.href=Et,Ve.download=`session-${ie}.${Te==="text"?"txt":"json"}`,Ve.click(),URL.revokeObjectURL(Et)}catch(Ke){s.value=Ke.message||"Failed to export session"}}let dt=null;function st(ie){ie.payload&&ie.payload.channel_id&&(clearTimeout(dt),dt=setTimeout(()=>{if(re(),n.value&&ie.payload.channel_id===n.value){const Te=n.value,Le=l;j.get(`/api/sessions/${encodeURIComponent(Te)}`).then(Ke=>{Le!==l||n.value!==Te||(a.value=Ke)}).catch(()=>{})}},2e3))}let _t=!1,Ot=null;function rt(){_t||(_t=!0,re(),Ye.subscribe("events",st),Ot=Ye.onReconnected(()=>re()))}je(()=>{V(),rt()}),Qt(()=>{rt()});function Qe(){_t&&(_t=!1,Ye.unsubscribe("events",st),Ot&&(Ot(),Ot=null),clearTimeout(dt))}return Gt(Qe),ft(Qe),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:$,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:w,filteredSessions:k,hasActiveFilters:T,customPresets:L,showSavePreset:_,newPresetName:g,threadView:b,threads:S,collapsedThreads:R,ftsQuery:C,ftsChannelId:O,ftsUserId:A,ftsResults:x,ftsSearching:N,ftsError:F,ftsStale:E,formatAge:X,formatTimestamp:be,formatFullTimestamp:q,messageClass:z,threadMsgClass:se,roleBadge:fe,roleDotClass:y,roleLabelClass:P,truncateContent:U,threadSummary:Z,fetchSessions:re,retry:_e,toggleSession:ve,toggleSelect:we,toggleSelectAll:Ie,confirmClear:B,clearSession:ge,confirmBulkClear:Se,doBulkClear:Oe,exportSession:Me,applyPreset:Y,applyCustomPreset:ce,saveCustomPreset:te,removeCustomPreset:de,resetFilters:Ne,toggleThread:K,runFtsSearch:oe,clearFtsSearch:ae,highlightSnippet:le,ftsResultClass:he,ftsTypeBadge:pe}}},tk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:Wm}}},sk={components:{ContextAssemblyPanel:tk},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(O){if(!O)return"—";try{const A=new Date(O);return isNaN(A.getTime())?O:A.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function p(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function h(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function m(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function v(O){a.value===O?a.value=null:(a.value=O,c.value={})}function w(O,A){const x=O+"-"+A;c.value={...c.value,[x]:!c.value[x]}}function L(O,A){return!!c.value[O+"-"+A]}function _(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,R()}async function g(){try{const O=await j.get("/api/trajectories");e.value=O.files||[],r.value=O.count||0}catch{}}let b=0;async function R(){const O=++b;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const A=await j.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(O!==b)return;let x=A.entries||[];d.value.tool_name&&(x=x.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(N=>N.is_error)),d.value.channel_id&&(x=x.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(N=>N.user_id===d.value.user_id)),t.value=x}else{const A=new URLSearchParams;d.value.channel_id&&A.set("channel_id",d.value.channel_id),d.value.user_id&&A.set("user_id",d.value.user_id),d.value.tool_name&&A.set("tool_name",d.value.tool_name),d.value.errors_only&&A.set("errors_only","true"),A.set("limit",String(d.value.limit));const x=A.toString(),N=await j.get(`/api/trajectories/search/query?${x}`);if(O!==b)return;t.value=N.results||[]}}catch(A){if(O!==b)return;n.value=A.message}O===b&&(s.value=!1)}async function C(){if(!l.value.trim())return;const O=++b;s.value=!0,n.value=null,c.value={};try{const A=await j.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==b)return;i.value=A.entry||null,i.value||(n.value="No trace found for this message ID")}catch(A){if(O!==b)return;A.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=A.message}O===b&&(s.value=!1)}return je(async()=>{await g(),await R()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:Km,toggleExpand:v,toggleIteration:w,isIterationExpanded:L,clearFilters:_,fetchFiles:g,fetchTraces:R,lookupMessage:C}}};function nk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function ak(e){return e?`${e.approximate?"~":""}${bd(e.total||0)}`:"0"}const ik={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),a=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=G(()=>n.value.work||{}),h=G(()=>Math.max(1,...(n.value.activity_over_time||[]).map(C=>Number(C.count||0)))),m=G(()=>({minWidth:`max(100%, ${(n.value.activity_over_time||[]).length*5}px)`})),v=C=>({height:`${Math.max(4,Math.round(Number(C||0)/h.value*100))}%`}),w=G(()=>s.value&&l.value-i.value>3e4);async function L(){const C=++d,O=a.value;try{const A=await j.get(`/api/usage?range=${encodeURIComponent(O)}`);if(C!==d||O!==a.value)return;n.value=A,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(A){C===d&&(t.value=A.message)}finally{C===d&&(e.value=!1)}}function _(C){a.value=C,e.value=!s.value,L()}function g(){e.value=!0,L()}function b(){c||(c=!0,L(),o=setInterval(L,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function R(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return je(b),Qt(b),Gt(R),ft(R),{data:n,work:p,loading:e,error:t,hasData:s,range:a,ranges:u,isStale:w,fmtNum:bd,fmtDuration:nk,tokenLabel:ak,activityTrackStyle:m,activityBar:v,selectRange:_,retry:g}}},Qm=[{id:"audit",label:"Audit",component:Qw},{id:"sessions",label:"Sessions",component:ek},{id:"traces",label:"Traces",component:sk},{id:"usage",label:"Usage & Activity",component:ik}],lk={components:{TabbedPage:Yo},setup(){return{tabs:Qm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},xr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],ok={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,N){const F=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!F,r.value=F?!!x.global_enabled:null,!F){e.value=N.map(V=>({...V,source:"unknown",enabled:void 0,state:null}));return}const E=new Set(F.map(V=>V.name)),M=N.filter(V=>!E.has(V.name)).map(V=>({...V,source:V.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...F.map(V=>({...V,source:"builtin"})),...M]}async function m(x,N){if(d.value.has(x.name))return;const F=!!N.target.checked,E=new Set(d.value);E.add(x.name),d.value=E;try{const M=await j.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:F});h(M,e.value),s.value=null;try{const V=await j.get("/api/tools");h(M,V)}catch(V){console.warn("Built-in toggle committed; visible catalog refresh failed",V)}}catch(M){N.target.checked=!!x.enabled,s.value=M.message||`Failed to toggle ${x.name}`}finally{const M=new Set(d.value);M.delete(x.name),d.value=M}}const v=G(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),w=G(()=>e.value.filter(x=>x.source==="skill").length),L=G(()=>Object.values(a.value).reduce((x,N)=>x+N,0));function _(x){for(const N of xr)if(N.id!=="other"&&N.match(x))return N.id;return"other"}const g=G(()=>{let x=e.value;if(n.value){const N=n.value.toLowerCase();x=x.filter(F=>F.name.toLowerCase().includes(N)||(F.description||"").toLowerCase().includes(N))}return o.value&&(x=x.filter(N=>_(N.name)===o.value)),x}),b=G(()=>{const x=new Set;for(const N of e.value)x.add(_(N.name));return xr.filter(N=>x.has(N.id))}),R=G(()=>{const x=g.value,N={};for(const E of x){const M=_(E.name);N[M]||(N[M]=[]),N[M].push(E)}const F=[];for(const E of xr)N[E.id]&&N[E.id].length>0&&F.push({label:E.label,icon:E.icon,tools:N[E.id].sort((M,V)=>M.name.localeCompare(V.name))});return F});function C(x){i.value={...i.value,[x]:!i.value[x]}}async function O(){t.value=!0,s.value=null;try{const[x,N,F]=await Promise.all([j.get("/api/tools"),j.get("/api/tools/stats").catch(()=>({})),j.get("/api/tools/builtins").catch(()=>null)]);h(F,x),a.value=N||{}}catch(x){s.value=x.message}t.value=!1}function A(){O()}return je(()=>{O()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:w,totalUsage:L,filteredTools:g,groupedTools:R,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:gd,toggleExpand:C,refresh:A}}};function rk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function ck(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const dk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),w=f(null),L=f(!1),_=G(()=>e.value.length),g=G(()=>e.value.reduce((te,de)=>te+(de.execution_count||0),0)),b=G(()=>e.value.reduce((te,de)=>te+N(de.code),0)),R=G(()=>{if(!l.value)return e.value;const te=l.value.toLowerCase();return e.value.filter(de=>de.name.toLowerCase().includes(te)||(de.description||"").toLowerCase().includes(te))}),C=G(()=>u.value?u.value.split(`
`).length:0),O=G(()=>{const te=Math.max(C.value,1);return Array.from({length:te},(de,Ne)=>Ne+1).join(`
`)}),A=G(()=>{const te=u.value.trim();return te?te.includes("SKILL_DEFINITION")?te.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(te){return rk(te)}function N(te){return te?te.split(`
`).length:0}function F(te){return ck(te)}function E(te){n.value={...n.value,[te]:!n.value[te]}}async function M(te){try{await navigator.clipboard.writeText(te);const de=e.value.find(Ne=>Ne.code===te);de&&(o.value=de.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function V(te){if(te.key==="Tab"){te.preventDefault();const de=te.target,Ne=de.selectionStart,X=de.selectionEnd;u.value=u.value.substring(0,Ne)+"    "+u.value.substring(X),Rt(()=>{de.selectionStart=de.selectionEnd=Ne+4})}}function J(te){const de=te.target.previousElementSibling;de&&(de.scrollTop=te.target.scrollTop)}async function T(){t.value=!0,s.value=null;try{e.value=await j.get("/api/skills")}catch(te){s.value=te.message}t.value=!1}async function k(te){i.value=te,delete a.value[te],a.value={...a.value};try{const de=await j.post(`/api/skills/${encodeURIComponent(te)}/test`);a.value={...a.value,[te]:de}}catch(de){a.value={...a.value,[te]:{result:de.message,is_error:!0}}}i.value=null}function S(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function $(te){r.value=!0,c.value="edit",d.value=te.name,u.value=te.code||"",p.value=null,h.value=null}function Z(){r.value=!1,p.value=null,h.value=null}async function K(){p.value=null,h.value=null;const te=d.value.trim(),de=u.value.trim();if(!te){p.value="Name is required";return}if(!de){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await j.post("/api/skills",{name:te,code:de}),h.value="Skill created successfully"):(await j.put(`/api/skills/${encodeURIComponent(te)}`,{code:de}),h.value="Skill updated successfully"),await T(),setTimeout(()=>{r.value=!1},800)}catch(Ne){p.value=Ne.message}m.value=!1}function Y(te){w.value=te}async function ce(){if(w.value){L.value=!0;try{await j.del(`/api/skills/${encodeURIComponent(w.value)}`),await T()}catch(te){xe.error(`Failed to delete skill: ${te.message||"unknown error"}`)}L.value=!1,w.value=null}}return je(()=>{T()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:w,deleting:L,enabledCount:_,totalExecutions:g,totalLines:b,displayedSkills:R,editLineCount:C,editorLineNums:O,editValidation:A,highlight:x,truncate:gd,formatTs:Aa,countLines:N,getLineNumbers:F,toggleCode:E,copyCode:M,handleEditorKey:V,syncScroll:J,fetchSkills:T,testSkill:k,showCreate:S,editSkill:$,cancelEdit:Z,saveSkill:K,confirmDelete:Y,doDelete:ce}}};class Fs extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const uk=/^[A-Za-z_][A-Za-z0-9_]*$/;function lp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function op(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Fs(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Fs(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Fs(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Fs(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function pk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function fk(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Fs("Server name is required.","name");if(a.length>128||!uk.test(a))throw new Fs("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Fs("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=lp(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Fs("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Fs("An HTTP endpoint is required for this connection.","url");if(d&&!pk(d))throw new Fs("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Fs("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=lp(e.allowlistText));const r=op(e.headerRows,e.headersRemove,"Header"),c=op(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function hk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function mk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function vk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const gk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function bk(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const yk=1e4,xk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function _r(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function _k(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const wk={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),n=f(""),a=f(new Set),i=f(new Set),l=f({}),o=f({}),r=f({}),c=f(new Set),d=f(!1),u=f("add"),p=f(""),h=f(null),m=f(_r()),v=f(""),w=f(!1);let L=null,_=0,g=!1,b=!1;const R=gk,C=G(()=>{var B;return((B=e.value)==null?void 0:B.servers)||[]}),O=G(()=>{var B;return!!((B=e.value)!=null&&B.enabled)}),A=G(()=>{var B,ge,Se,Oe;return{serverCount:((B=e.value)==null?void 0:B.server_count)||0,enabledCount:((ge=e.value)==null?void 0:ge.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),x=G(()=>{var B;return((B=h.value)==null?void 0:B.header_keys)||[]}),N=G(()=>{var B;return((B=h.value)==null?void 0:B.env_keys)||[]}),F=G(()=>{var B;return u.value==="edit"&&((B=h.value)==null?void 0:B.transport)==="http"}),E=G(()=>u.value==="add"||!F.value),M=G(()=>F.value?"Replace endpoint URL":"Endpoint URL"),V=G(()=>F.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function J(){T(),L=window.setInterval(()=>k({quiet:!0}),yk)}function T(){L&&window.clearInterval(L),L=null}async function k({quiet:B=!1}={}){const ge=++_;B||(t.value=!0);try{const Se=await j.get("/api/mcp/status");if(ge!==_||!g)return;e.value=Se,n.value="";const Oe=new Set((Se.servers||[]).map(Me=>Me.name));i.value=new Set([...i.value].filter(Me=>Oe.has(Me)))}catch(Se){ge===_&&g&&(n.value=Se.message||"Failed to load MCP status")}finally{ge===_&&(t.value=!1)}}function S(B){return s.value||a.value.has(B)}function $(B,ge){const Se=new Set(a.value);ge?Se.add(B):Se.delete(B),a.value=Se}function Z(B){return mk(B.state)}function K(B){if(Z(B)==="disabled"){if(!B.enabled)return"Disabled — server switch off";if(!O.value)return"Disabled — global MCP is off"}return xk[Z(B)]}function Y(B){return B.transport==="http"?"Streamable HTTP":"stdio"}function ce(B){return B.negotiated_version?`${B.era?`${String(B.era).charAt(0).toUpperCase()}${String(B.era).slice(1)}`:"Protocol"} · ${B.negotiated_version}`:"Not negotiated"}function te(B){return B.discovered_count?`${B.published_count||0} published · ${B.excluded_count||0} excluded`:"No tools discovered"}const de=f(new Set);async function Ne(B,ge){if(de.value.has(B.name))return;const Se=!!ge.target.checked,Oe=new Set(de.value);Oe.add(B.name),de.value=Oe;try{const Me=await j.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/enabled`,{enabled:Se});Me&&Array.isArray(Me.servers)?e.value=Me:await k({quiet:!0})}catch(Me){ge.target.checked=!!B.enabled,xe.error(Me.message||`Failed to toggle ${B.name}`)}finally{const Me=new Set(de.value);Me.delete(B.name),de.value=Me}}async function X(B){if(B!==O.value&&!(!B&&!await qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await j.post("/api/mcp/enabled",{enabled:B}),xe.success(B?"MCP enabled":"MCP disabled"),await k({quiet:!0})}catch(ge){xe.error(ge.message||"Failed to update MCP state"),await k({quiet:!0})}finally{s.value=!1}}}async function be(B){$(B.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/reconnect`,{}),xe.success(`Reconnected ${B.name}`)}catch(ge){xe.error(ge.message||`Failed to reconnect ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}async function q(B){$(B.name,!0);try{await j.post(`/api/mcp/servers/${encodeURIComponent(B.name)}/refresh-tools`,{}),xe.success(`Refreshed tools from ${B.name}`),await fe(B.name,!0)}catch(ge){xe.error(ge.message||`Failed to refresh ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}async function z(B){if(await qt({title:`Remove ${B.name}`,message:`Remove this saved MCP server? Its ${B.published_count||0} published tool${B.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){$(B.name,!0);try{await j.del(`/api/mcp/servers/${encodeURIComponent(B.name)}`),xe.success(`Removed ${B.name}`),delete o.value[B.name]}catch(Se){xe.error(Se.message||`Failed to remove ${B.name}`)}finally{$(B.name,!1),await k({quiet:!0})}}}async function se(B){const ge=new Set(i.value);if(ge.has(B.name)){ge.delete(B.name),i.value=ge;return}ge.add(B.name),i.value=ge,Object.hasOwn(o.value,B.name)||await fe(B.name)}async function fe(B,ge=!1){if(!ge&&Object.hasOwn(o.value,B))return;const Se=new Set(c.value);Se.add(B),c.value=Se,r.value={...r.value,[B]:""};try{const Oe=await j.get(`/api/mcp/servers/${encodeURIComponent(B)}/tools`);o.value={...o.value,[B]:Oe.tools||[]}}catch(Oe){r.value={...r.value,[B]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(c.value);Oe.delete(B),c.value=Oe}}function y(B){return(o.value[B]||[]).filter(ge=>vk(ge,l.value[B]))}function P(B,ge){l.value={...l.value,[B]:ge}}function U(){u.value="add",p.value="",h.value=null,m.value=_r(),v.value="",d.value=!0}function oe(B){u.value="edit",p.value=B.name,h.value=B,m.value={..._r(),name:B.name,enabled:!!B.enabled,transport:B.transport||"stdio"},v.value="",d.value=!0}function ae(){w.value||(d.value=!1)}function le(B){d.value&&bk(B)}function he(B){const ge=B==="headers"?"headerRows":"envRows";m.value[ge].push({key:"",value:""})}function pe(B,ge){const Se=B==="headers"?"headerRows":"envRows";m.value[Se].splice(ge,1)}function ue(B,ge){const Se=B==="headers"?"headersRemove":"envRemove",Oe=m.value[Se];m.value[Se]=Oe.includes(ge)?Oe.filter(Me=>Me!==ge):[...Oe,ge]}async function re(){var ge,Se;v.value="";let B;try{B=fk(m.value,{mode:u.value,originalTransport:((ge=h.value)==null?void 0:ge.transport)||""})}catch(Oe){v.value=Oe instanceof Fs?Oe.message:"Invalid MCP server configuration",await Rt(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&hk(B,h.value)&&!await qt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){w.value=!0;try{u.value==="add"?await j.post("/api/mcp/servers",B):await j.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,B),xe.success(u.value==="add"?`Saved ${B.name}`:`Updated ${p.value}`),d.value=!1,await k({quiet:!0})}catch(Oe){v.value=Oe.message||"Failed to save MCP server"}finally{w.value=!1}}}let _e=null;function ve(B){`${(B==null?void 0:B.event)||""} ${(B==null?void 0:B.type)||""} ${(B==null?void 0:B.tool)||""} ${(B==null?void 0:B.message)||""}`.toLowerCase().includes("mcp")&&(_e&&window.clearTimeout(_e),_e=window.setTimeout(()=>k({quiet:!0}),200))}function we(){g||(g=!0,b||(Ye.subscribe("events",ve),b=!0),k(),J())}function Ie(){g=!1,T(),_e&&window.clearTimeout(_e),_e=null,b&&(Ye.unsubscribe("events",ve),b=!1)}return je(we),Qt(we),Gt(Ie),ft(Ie),{status:e,loading:t,mutating:s,pageError:n,servers:C,masterEnabled:O,aggregate:A,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:h,form:m,formError:v,saving:w,editorGroups:R,configuredHeaderKeys:x,configuredEnvKeys:N,savedHttpEndpoint:F,endpointRequired:E,endpointFieldLabel:M,endpointPlaceholder:V,refreshAll:k,busy:S,serverState:Z,stateLabel:K,transportLabel:Y,protocolLabel:ce,toolSummary:te,formatAge:_k,setMasterEnabled:X,togglePending:de,toggleServerEnabled:Ne,reconnect:be,refreshTools:q,removeServer:z,toggleTools:se,filteredTools:y,setToolQuery:P,openAdd:U,openEdit:oe,closeEditor:ae,jumpToEditorGroup:le,addSecretRow:he,removeSecretRow:pe,toggleSecretRemoval:ue,saveServer:re}}};function kk(e,t){if(!e||!t)return np(e);const s=np(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Sk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),n=f(""),a=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let w=null;const L=f(null),_=f(!1),g=f({}),b=f({}),R=f({}),C=f({}),O=new Map,A=f(null),x=G(()=>e.value.reduce((K,Y)=>K+(Y.chunks||0),0)),N=G(()=>new Set(e.value.map(Y=>Y.uploader).filter(Boolean)).size);function F(K,Y){const ce=b.value[Y];if(!ce||ce.length===0)return 0;const te=Math.max(...ce.map(de=>de.char_count||0));return te===0?0:Math.round(K.char_count/te*100)}async function E(){t.value=!0,s.value=null;try{const K=await j.get("/api/knowledge");e.value=Array.isArray(K)?K:[]}catch(K){s.value=K.message}t.value=!1}async function M(K){if(g.value[K]){g.value[K]=!1,A.value=null;return}if(g.value[K]=!0,Object.prototype.hasOwnProperty.call(b.value,K))return;if(O.has(K))return O.get(K);const Y={...C.value,[K]:!0};C.value=Y;const ce={...R.value};delete ce[K],R.value=ce;const te=j.get(`/api/knowledge/${encodeURIComponent(K)}/chunks`).then(de=>{b.value={...b.value,[K]:Array.isArray(de)?de:[]}}).catch(de=>{R.value={...R.value,[K]:de.message||"load failed"}}).finally(()=>{if(O.get(K)!==te)return;O.delete(K);const de={...C.value};delete de[K],C.value=de});return O.set(K,te),te}let V=0;async function J(){const K=n.value.trim();if(!K)return;const Y=++V;i.value=!0,o.value=null,l.value=K;try{const ce=await j.get(`/api/knowledge/search?q=${encodeURIComponent(K)}`);if(Y!==V)return;a.value=Array.isArray(ce)?ce:[]}catch(ce){if(Y!==V)return;a.value=[],o.value=ce.message||"Search failed"}Y===V&&(i.value=!1)}function T(){V+=1,i.value=!1,a.value=null,n.value="",o.value=null}async function k(){u.value=null,p.value=null;const K=c.value.trim(),Y=d.value.trim();if(!K){u.value="Source name is required";return}if(!Y){u.value="Content is required";return}h.value=!0;try{const ce=await j.post("/api/knowledge",{source:K,content:Y});p.value=`Ingested ${ce.chunks||0} chunks from "${K}"`,c.value="",d.value="",b.value={},await E(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(ce){u.value=ce.message}h.value=!1}async function S(K){m.value=K,v.value=null,w&&(clearTimeout(w),w=null);try{const Y=await j.post(`/api/knowledge/${encodeURIComponent(K)}/reingest`);v.value={source:K,error:!1,message:`Re-ingested ${Y.chunks||0} chunks`},delete b.value[K],await E(),w=setTimeout(()=>{v.value=null,w=null},3e3)}catch(Y){v.value={source:K,error:!0,message:Y.message}}m.value=null}function $(K){L.value=K}async function Z(){if(L.value){_.value=!0;try{await j.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete b.value[L.value],await E()}catch(K){xe.error(`Failed to delete source: ${K.message||"unknown error"}`)}_.value=!1,L.value=null}}return je(()=>{E()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:L,deleting:_,expanded:g,sourceChunks:b,chunkErrors:R,loadingChunks:C,selectedChunk:A,totalChunks:x,uploaderCount:N,truncate:gd,formatTs:Aa,highlightTerms:kk,chunkBarWidth:F,fetchSources:E,toggleSource:M,doSearch:J,clearSearch:T,doIngest:k,doReingest:S,confirmDelete:$,doDelete:Z}}},Tk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),n=f(null),a=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),w=f(null),L=f(new Set),_=f(null),g=f(!1),b=f(!1),R=G(()=>e.value.reduce((Y,ce)=>Y+ce.count,0)),C=G(()=>L.value.size);function O(Y){const ce=t.value[Y];if(!ce)return[];if(!l.value.trim())return ce;const te=l.value.trim().toLowerCase();return ce.filter(de=>de.key.toLowerCase().includes(te)||de.value&&de.value.toLowerCase().includes(te))}function A(Y,ce){return L.value.has(Y+"/"+ce)}function x(Y,ce){const te=Y+"/"+ce,de=new Set(L.value);de.has(te)?de.delete(te):de.add(te),L.value=de}function N(Y){const ce=t.value[Y];return!ce||ce.length===0?!1:ce.every(te=>L.value.has(Y+"/"+te.key))}function F(Y,ce){const te=t.value[Y];if(!te)return;const de=new Set(L.value);for(const Ne of te){const X=Y+"/"+Ne.key;ce?de.add(X):de.delete(X)}L.value=de}async function E(){s.value=!0,n.value=null;try{const Y=await j.get("/api/memory");e.value=Object.entries(Y).map(([ce,te])=>({name:ce,keys:te.keys||[],count:te.count||0}))}catch(Y){n.value=Y.message}s.value=!1}async function M(Y){if(a.value[Y]){a.value[Y]=!1;return}a.value[Y]=!0;const ce=e.value.find(de=>de.name===Y);if(!ce||t.value[Y]||i.value===Y)return;i.value=Y;let te;try{const Ne=(await j.get(`/api/memory/${encodeURIComponent(Y)}`)).entries||{};te=ce.keys.map(X=>Object.prototype.hasOwnProperty.call(Ne,X)?{key:X,value:Ne[X]||"",failed:!1}:{key:X,value:"",failed:!0,error:"Not found in scope"})}catch(de){te=ce.keys.map(Ne=>({key:Ne,value:"",failed:!0,error:de.message||"Failed to load"}))}t.value[Y]=te,i.value=null}function V(Y,ce,te){p.value=Y+"/"+ce,h.value=te}async function J(Y,ce){m.value=!0,v.value=null;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ce)}`,{value:h.value});const te=t.value[Y];if(te){const de=te.find(Ne=>Ne.key===ce);de&&(de.value=h.value)}p.value=null}catch(te){v.value=`Failed to save: ${te.message||"unknown error"}`}m.value=!1}async function T(Y,ce){try{await navigator.clipboard.writeText(ce.value),w.value=Y+"/"+ce.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function k(){d.value=null,u.value=null;const Y=r.value.scope.trim(),ce=r.value.key.trim(),te=r.value.value.trim();if(!Y){d.value="Scope is required";return}if(!ce){d.value="Key is required";return}if(!te){d.value="Value is required";return}c.value=!0;try{await j.put(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ce)}`,{value:te}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await E(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(de){d.value=de.message}c.value=!1}function S(Y,ce){_.value={scope:Y,key:ce}}async function $(){if(!_.value)return;g.value=!0,v.value=null;const{scope:Y,key:ce}=_.value;try{await j.del(`/api/memory/${encodeURIComponent(Y)}/${encodeURIComponent(ce)}`);const te=t.value[Y];te&&(t.value[Y]=te.filter(X=>X.key!==ce));const de=e.value.find(X=>X.name===Y);de&&(de.count--,de.keys=de.keys.filter(X=>X!==ce));const Ne=new Set(L.value);Ne.delete(Y+"/"+ce),L.value=Ne}catch(te){v.value=`Failed to delete: ${te.message||"unknown error"}`}g.value=!1,_.value=null}function Z(){b.value=!0}async function K(){g.value=!0,v.value=null;const Y=[];for(const ce of L.value){const te=ce.indexOf("/");Y.push({scope:ce.slice(0,te),key:ce.slice(te+1)})}try{await j.post("/api/memory/bulk-delete",{entries:Y}),L.value=new Set,t.value={},await E()}catch(ce){v.value=`Bulk delete failed: ${ce.message||"unknown error"}`}g.value=!1,b.value=!1}return je(()=>{E()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:w,selected:L,selectedCount:C,totalEntries:R,deleteTarget:_,deleting:g,showBulkDelete:b,fetchMemory:E,toggleScope:M,startEdit:V,doEdit:J,copyValue:T,doAdd:k,confirmDelete:S,doDelete:$,confirmBulkDelete:Z,doBulkDelete:K,isSelected:A,toggleSelect:x,isScopeAllSelected:N,toggleSelectAll:F,filteredEntries:O}}},Ck={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),n=f(null),a=f(null),i=f(null),l=f(""),o=G(()=>[...new Set(e.value.map(w=>w.category))].sort()),r=G(()=>{const v={};return e.value.forEach(w=>{v[w.category]=(v[w.category]||0)+1}),v}),c=G(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await j.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,xe.success("Entry updated"),await m()}catch(w){xe.error(w.message||"Failed to save entry")}}async function h(v){if(await qt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/learned/"+encodeURIComponent(v)),xe.success("Entry deleted"),await m()}catch(L){xe.error(L.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await j.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return je(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:Aa,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},Xm=[{id:"tools",label:"Tools",component:ok},{id:"skills",label:"Skills",component:dk},{id:"mcp-servers",label:"MCP Servers",component:wk},{id:"knowledge",label:"Knowledge",component:Sk},{id:"memory",label:"Memory",component:Tk},{id:"learned",label:"Learned",component:Ck}],Ek={components:{TabbedPage:Yo},setup(){return{tabs:Xm}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Ak={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Rk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Ik={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ok={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f(!1),a=f(!1),i=G(()=>e.value.components||[]),l=G(()=>Ik[e.value.overall]||"text-gray-400"),o=G(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=G(()=>{const C=e.value.overall;return C==="healthy"?"All Systems Healthy":C==="degraded"?"Some Systems Degraded":C==="unhealthy"?"System Issues Detected":"Unknown"});function c(C){return Ak[C]||"text-gray-400"}function d(C){return Rk[C]||"info"}function u(C){return C==="ok"?"badge-success":C==="degraded"?"badge-warning":C==="down"?"badge-danger":"badge-info"}function p(C){return C==="closed"?"text-green-400":C==="half_open"?"text-yellow-400":C==="open"?"text-red-400":"text-gray-400"}function h(C){return C.replace(/_/g," ").replace(/\b\w/g,O=>O.toUpperCase())}function m(C){if(!C)return"—";try{return new Date(C).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return C}}function v(C){return C>=1e6?(C/1e6).toFixed(1)+"M":C>=1e3?(C/1e3).toFixed(1)+"K":String(C)}async function w(){a.value=!0;try{e.value=await j.get("/api/health/components"),s.value=null,n.value=!0}catch(C){s.value=C.message}finally{t.value=!1,a.value=!1}}function L(){t.value=!0,s.value=null,w()}let _=null,g=!1;function b(){g||(g=!0,w(),_||(_=setInterval(w,3e4)))}function R(){g&&(g=!1,_&&(clearInterval(_),_=null))}return je(b),Qt(b),Gt(R),ft(R),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:w,retry:L}}},Lk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f(!1),a=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=G(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=G(()=>{if(!i.value)return[];const w=i.value,L=w.storage_total_bytes||1;return[{label:"Session Persistence",mb:w.sessions.persist_dir.total_mb,bytes:w.sessions.persist_dir.total_bytes,files:w.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(w.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:w.knowledge.db_file.total_mb,bytes:w.knowledge.db_file.total_bytes,files:w.knowledge.db_file.file_count,pct:Math.min(100,Math.round(w.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:w.trajectories.message_dir.total_mb,bytes:w.trajectories.message_dir.total_bytes,files:w.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:w.trajectories.agent_dir.total_mb,bytes:w.trajectories.agent_dir.total_bytes,files:w.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const w=await j.get("/api/resource-usage");i.value=w,t.value=null,s.value=!0}catch(w){t.value=w.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return je(m),Qt(m),Gt(v),ft(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:bd,refresh:u,retry:p}}},Nk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),Dk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Pk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const n=Object.fromEntries(Object.entries(e[s]).filter(([a])=>!Dk.has(a)));Object.keys(n).length&&(t[s]=n)}return Object.keys(t).length?rl(t):""}function Mk(e){var a,i,l;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const o of["result_summary","detail","message","diff","error"])if(t[o]!==void 0&&t[o]!==null&&t[o]!==""){s=t[o];break}if(s===void 0&&((a=t.metadata)!=null&&a.error)&&(s=t.metadata.error),s===void 0){const o=Object.fromEntries(Object.entries(t).filter(([r])=>!Nk.has(r)));s=Object.keys(o).length?rl(o):""}const n=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:n,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??null}}const Fk={components:{ToolOutput:Qo},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=G(()=>Mk(e.entry)),s=G(()=>{var i;return rl(((i=e.entry.record)==null?void 0:i.tool_input)??"")}),n=G(()=>{var i,l,o;return rl(((i=e.entry.record)==null?void 0:i.error)||((o=(l=e.entry.record)==null?void 0:l.metadata)==null?void 0:o.error)||"")}),a=G(()=>Pk(e.entry.record));return{display:t,argumentsText:s,errorText:n,metadataText:a}},template:`
    <article class="log-line log-compact-line min-w-0"
             :class="{ 'log-line-error': entry.level === 'ERROR', 'log-line-warning': entry.level === 'WARNING' }"
             :data-log-id="entry.id">
      <tool-output presentation="compact" :value="display.body" :raw-value="entry.record || undefined" label="Live log record"
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
        </template>
      </tool-output>
    </article>`},ha=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),dc=e=>typeof e=="string"||typeof e=="number"?String(e):"";function $k(e){const t=ha(e)?e:{},s=ha(t.metadata)?t.metadata:{},n=ha(t.audit_metadata)?t.audit_metadata:{},a=ha(t.turn)?t.turn:{},i=l=>dc(t[l]??s[l]??n[l]??a[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function rp(e){return e.record?JSON.stringify(e.record,null,2):e.text}function Bk(e,t,s=new Date){var p,h;let n=e;if(ha(e)&&e.type==="log"&&"line"in e?n=e.line:ha(e)&&"payload"in e&&(n=e.payload),typeof n=="string")try{n=JSON.parse(n)}catch{}const a=ha(n)?n:null,i=a!=null&&a.timestamp?new Date(a.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=a?a.result_summary??a.detail??a.message??JSON.stringify(a):typeof n=="string"?n:JSON.stringify(n)??"",r=((p=a==null?void 0:a.metadata)==null?void 0:p.status)??(a==null?void 0:a.status),d=(a==null?void 0:a.error)||((h=a==null?void 0:a.metadata)==null?void 0:h.error)||["failed","error","cancelled","denied","outcome_unknown"].includes(r)?"ERROR":dc(a==null?void 0:a.level).toUpperCase()||"INFO",u={id:t,record:a,ts:l.toLocaleTimeString(),_time:l,level:d,text:typeof o=="string"?o:JSON.stringify(o),tool:dc(a==null?void 0:a.tool_name),raw:a?null:o,attribution:$k(a)};return u.searchText=a?JSON.stringify(a):u.text,u}function Uk(e){const t=new Map;for(const s of e){const{turnId:n,agentId:a,rootId:i,label:l,parentId:o}=s.attribution,r=n?`turn:${n}`:a?`root:${i||a}`:"unattributed";t.has(r)||t.set(r,{key:r,title:n?`Turn ${n}`:a?`Agent root ${i||a} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=a?`agent:${a}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:a,label:l,parentId:o,rootId:i,title:a?`${l||"Agent"} (${a})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...n})=>n)}const Hk=["INFO","WARNING","ERROR"],zk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],wr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],jk=[50,100,200,500],Vk={components:{ToolOutput:Qo,LogRecord:Fk},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const n=f(!1),a=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(Ye.state||"disconnected"),u=G(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,w=Hk,L=zk,_=wr,g=f("all"),b=f(""),R=f([]),C=f(!1),O=f(""),A=f([]);function x(){try{const ee=localStorage.getItem("odin-log-presets");ee&&(R.value=JSON.parse(ee))}catch{}}function N(){try{localStorage.setItem("odin-log-presets",JSON.stringify(R.value))}catch{}}const F=G(()=>l.value!==""||o.value.trim()!==""||b.value!==""),E=G(()=>{const ee=wr.find(ke=>ke.value===b.value);return ee?ee.label:""}),M=G(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ee){return ee.message}}),V=24,J=G(()=>{if(Y.value.length===0)return[];const ee=[],ke=new Date,$e=3600*1e3;for(let Je=V-1;Je>=0;Je--){const wt=new Date(ke.getTime()-(Je+1)*$e),ut=new Date(ke.getTime()-Je*$e);ee.push({start:wt,end:ut,label:$(wt,ut),shortLabel:ut.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of Y.value){if(!Je._time)continue;const wt=Je._time.getTime();for(const ut of ee)if(wt>=ut.start.getTime()&&wt<ut.end.getTime()){ut.total++,Je.level==="ERROR"?ut.errors++:Je.level==="WARNING"?ut.warnings++:ut.info++;break}}return ee}),T=G(()=>{let ee=1;for(const ke of J.value)ke.total>ee&&(ee=ke.total);return ee}),k=G(()=>{if(J.value.length===0)return"";const ee=Y.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(ee.length===0)return"";const ke=new Date(Math.min(...ee));return`${Y.value.length} shown, oldest ${ke.toLocaleTimeString()}`}),S=G(()=>Math.ceil(V/8));function $(ee,ke){const $e={hour:"2-digit",minute:"2-digit"};return ee.toLocaleTimeString([],$e)+" - "+ke.toLocaleTimeString([],$e)}function Z(ee,ke){return!ke||!ee?"0px":Math.max(2,ee/ke*100)+"%"}function K(ee){const ke=Y.value.findIndex($e=>$e._time&&$e._time.getTime()>=ee.start.getTime()&&$e._time.getTime()<ee.end.getTime());if(ke>=0&&p.value){const $e=p.value.querySelector('[data-log-id="'+Y.value[ke].id+'"]');$e&&($e.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Y=G(()=>{let ee=t.value;if(l.value&&(ee=ee.filter(ke=>(ke.level||"INFO")===l.value)),b.value){const ke=wr.find($e=>$e.value===b.value);if(ke&&ke.seconds){const $e=new Date(Date.now()-ke.seconds*1e3);ee=ee.filter(Je=>Je._time&&Je._time>=$e)}}if(o.value&&!M.value)if(r.value)try{const ke=new RegExp(o.value,"i");ee=ee.filter($e=>{const Je=$e.searchText,wt=$e.tool||"";return ke.test(Je)||ke.test(wt)})}catch{}else{const ke=o.value.toLowerCase();ee=ee.filter($e=>{const Je=$e.searchText.toLowerCase(),wt=($e.tool||"").toLowerCase();return Je.includes(ke)||wt.includes(ke)})}return ee}),ce=G(()=>Uk(Y.value));function te(ee){const ke=Bk(ee,++s);if(a.value){A.value.push(ke);return}de(ke)}function de(ee){t.value.push(ee),t.value.length>v&&(t.value=t.value.slice(-v)),i.value&&Rt(()=>Ne())}function Ne(ee=!1){const ke=p.value;ke&&ke.scrollTo({top:ke.scrollHeight,behavior:ee?"smooth":"instant"})}function X(){i.value=!0,h.value=!1,Rt(()=>Ne(!0))}const be=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function q(){const ee=p.value;if(!ee)return;const ke=ee.scrollHeight-ee.scrollTop-ee.clientHeight<40;h.value=!i.value&&!ke&&t.value.length>0,y.value&&z()}function z(){const ee=p.value;!ee||!i.value||ee.scrollHeight-ee.scrollTop-ee.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function se(){i.value&&requestAnimationFrame(z)}function fe(ee){be.has(ee.key)&&se()}const y=f(!1);function P(){i.value&&(y.value=!0,requestAnimationFrame(z))}function U(){y.value&&(y.value=!1,z())}function oe(){i.value&&(h.value=!1,Rt(()=>Ne()))}function ae(){if(a.value=!a.value,!a.value&&A.value.length>0){for(const ee of A.value)de(ee);A.value=[]}}function le(){t.value=[],A.value=[],h.value=!1}function he(){let ee;e.value==="search"?ee=Le.value.map(wt=>{const ut=wt.error?"ERROR":"INFO",$n=wt.tool_name?`[${wt.tool_name}] `:"";return`${wt.timestamp||""} ${ut} ${$n}${wt.result_summary||wt.message||""}`}).join(`
`):ee=Y.value.map(rp).join(`

`);const ke=new Blob([ee],{type:"text/plain"}),$e=URL.createObjectURL(ke),Je=document.createElement("a");Je.href=$e,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL($e)}function pe(ee){const ke=rp(ee);navigator.clipboard.writeText(ke).then(()=>{m.value=ee.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function ue(ee){l.value=l.value===ee?"":ee,g.value="all"}function re(ee){return ee.level==="ERROR"?"log-line-error":ee.level==="WARNING"?"log-line-warning":"text-gray-300"}function _e(ee){return ee==="ERROR"?"text-red-500 font-semibold":ee==="WARNING"?"text-yellow-500":"text-blue-500"}function ve(ee){return ee==="ERROR"?"log-chip-error":ee==="WARNING"?"log-chip-warning":"log-chip-info"}function we(ee){g.value=ee.id;const ke=ee.filters;l.value=ke.level||"",b.value=ke.timeRange||"",o.value=ke.text||"",ke.levels&&(l.value=ke.levels[0]||""),ke.hasToolName&&(o.value="")}function Ie(ee){g.value=ee.id,l.value=ee.filters.level||"",b.value=ee.filters.timeRange||"",o.value=ee.filters.text||""}function B(){if(!O.value.trim())return;const ee={id:"custom-"+Date.now(),name:O.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};R.value=[...R.value,ee],N(),C.value=!1,O.value=""}function ge(ee){R.value=R.value.filter(ke=>ke.id!==ee),N(),g.value===ee&&(g.value="all")}const Se=f("all"),Oe=f(""),Me=f(""),dt=f(""),st=f(""),_t=f(""),Ot=f(100),rt=jk,Qe=f(!1),ie=f(!1),Te=f(""),Le=f([]),Ke=f(null),Et=f(null);function Ve(){e.value="search",Ke.value||$t()}async function $t(){try{Ke.value=await j.get("/api/logs/stats")}catch{}}function zt(){const ee=_t.value;if(!ee){dt.value="",st.value="";return}const $e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ee];if($e){const Je=new Date(Date.now()-$e*1e3);dt.value=rs(Je),st.value=""}}function rs(ee){const ke=$e=>String($e).padStart(2,"0");return`${ee.getFullYear()}-${ke(ee.getMonth()+1)}-${ke(ee.getDate())}T${ke(ee.getHours())}:${ke(ee.getMinutes())}`}function Js(ee){if(!ee)return"";const ke=new Date(ee);return isNaN(ke.getTime())?"":ke.toISOString()}async function ks(){Qe.value=!0,Te.value="",ie.value=!0,Et.value=null;try{const ee=new URLSearchParams;Se.value&&Se.value!=="all"&&ee.set("level",Se.value),Oe.value&&ee.set("tool",Oe.value),Me.value&&ee.set("q",Me.value);const ke=Js(dt.value),$e=Js(st.value);ke&&ee.set("start",ke),$e&&ee.set("end",$e),ee.set("limit",String(Ot.value));const Je=await j.get(`/api/logs/search?${ee.toString()}`);Le.value=Je.entries||[]}catch(ee){Te.value=ee.message||"Search failed",Le.value=[]}finally{Qe.value=!1}}function sa(){Se.value="all",Oe.value="",Me.value="",dt.value="",st.value="",_t.value="",Ot.value=100,Le.value=[],ie.value=!1,Te.value="",Et.value=null}function Zs(ee){Et.value=Et.value===ee?null:ee}function Ns(ee){if(!ee.timestamp)return"";try{return new Date(ee.timestamp).toLocaleString()}catch{return ee.timestamp}}function Mn(ee){return ee.type==="web_action"?`${ee.status||""} (${ee.execution_time_ms||0}ms)`:(ee.result_summary||"").slice(0,200)}function Ss(ee){return ee.error?"log-line-error":"text-gray-300"}function Fn(ee){try{return JSON.stringify(ee,null,2)}catch{return String(ee)}}let Lt=null,Xe=!1;function Ts(){Xe||(Xe=!0,Ye.subscribe("logs",te),c.value=Ye.connected,d.value=Ye.state||"disconnected",Lt=Ye.onState(ee=>{d.value=ee,c.value=ee==="connected"}))}function Ds(){Xe&&(Xe=!1,Ye.unsubscribe("logs",te),Lt&&(Lt(),Lt=null))}return je(()=>{x(),window.addEventListener("pointerup",U),window.addEventListener("pointercancel",U)}),Qt(Ts),Gt(Ds),ft(()=>{Ds(),window.removeEventListener("pointerup",U),window.removeEventListener("pointercancel",U)}),{mode:e,logs:t,paused:a,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:n,groupedLogs:ce,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Y,pauseBuffer:A,showJumpBottom:h,copiedIndex:m,regexError:M,levels:w,logPresets:L,timeRanges:_,timeRange:b,activeLogPreset:g,customLogPresets:R,showSaveLogPreset:C,newLogPresetName:O,hasActiveLogFilters:F,timeRangeLabel:E,timelineBuckets:J,timelineMax:T,timelineSpanLabel:k,timelineLabelSkip:S,togglePause:ae,clearLogs:le,exportLogs:he,logLineClass:re,levelClass:_e,levelChipClass:ve,toggleLevel:ue,copyLine:pe,jumpToBottom:X,onScroll:q,onUserScrollIntent:se,onUserScrollKey:fe,onAutoScrollToggle:oe,onPointerDown:P,applyLogPreset:we,applyCustomLogPreset:Ie,saveLogCustomPreset:B,removeLogCustomPreset:ge,segmentHeight:Z,jumpToTimelineBucket:K,searchLevel:Se,searchTool:Oe,searchKeyword:Me,searchStart:dt,searchEnd:st,searchTimePreset:_t,searchLimit:Ot,searchLimits:rt,searching:Qe,searchRan:ie,searchError:Te,searchResults:Le,searchStats:Ke,expandedSearch:Et,switchToSearch:Ve,runSearch:ks,clearSearchFilters:sa,toggleSearchExpand:Zs,formatSearchTs:Ns,searchEntryText:Mn,searchLogLineClass:Ss,formatJson:Fn,applySearchTimePreset:zt}}};function Dl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const qk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function Gk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Xa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Kk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},Pl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),Wk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function cp(e){return Wk.some(t=>e===t||e.startsWith(`${t}.`))}const ev="odin_config_center_expanded_v1",tv="odin_config_center_category_v1",Jk=50,Zk=650,kr=()=>j.get("/api/config/meta");function ca(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ui(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Pa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Yk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Qk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function sv(e,t){if(Ui(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return ca(t);const n={};for(const[a,i]of Object.entries(t)){const l=sv(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Xk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=sv(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function nv(e,t,s,n){if(Ui(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)nv(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function eS(){try{const e=JSON.parse(localStorage.getItem(ev)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function tS(){try{const e=localStorage.getItem(tv);return Xa.some(t=>t.key===e)?e:Xa[0].key}catch{return Xa[0].key}}const sS={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),n=f(null),a=f(!1),i=f(null),l=f(null),o=f(null),r=f(!1),c=f(!1),d=f(null),u=f(""),p=f("all"),h=f(tS()),m=f(eS()),v=f({}),w=f({}),L=f(""),_=f({}),g=f({}),b=f([]),R=f([]),C=f(!1),O=f(!1),A=f(!1);let x=null,N=null,F={path:null,at:0},E=0;const M=G(()=>{var I;return(((I=t.value)==null?void 0:I.fields)||[]).filter(H=>!Pl.has(H.path.split(".")[0])&&!cp(H.path))}),V=G(()=>new Map(M.value.map(I=>[I.path,I]))),J=G(()=>Z.value.reduce((I,H)=>I+H.sections.length,0)),T=G(()=>M.value.length),k=G(()=>qk),S=G(()=>b.value.length>0),$=G(()=>R.value.length>0),Z=G(()=>{if(!e.value)return[];const I=new Set(Xa.flatMap(Ae=>Ae.sections)),H=Xa.map(Ae=>({...Ae,sections:Ae.sections.filter(ct=>Object.hasOwn(e.value,ct)&&!Pl.has(ct))})).filter(Ae=>Ae.sections.length),Q=Object.keys(e.value).filter(Ae=>!I.has(Ae)&&!Pl.has(Ae));return Q.length&&H.push({key:"other",label:"Other",icon:"folder",sections:Q}),H}),K=G(()=>e.value?{...e.value,...v.value}:null),Y=G(()=>{if(!e.value)return[];const I=[];for(const[H,Q]of Object.entries(v.value))nv(e.value[H],Q,H,I);return I.filter(H=>!Ui(H.oldVal,H.newVal)).map(H=>{const Q=P(H.path);return{...H,label:(Q==null?void 0:Q.label)||Pa(H.path.split(".").at(-1)),apply_mode:(Q==null?void 0:Q.apply_mode)||ue(H.path.split(".")[0])}})}),ce=G(()=>Y.value.length>0),te=G(()=>Y.value.length),de=G(()=>new Set(Y.value.map(I=>I.path.split(".")[0])).size),Ne=G(()=>!!u.value||p.value!=="all"),X=G(()=>{const I={...g.value};for(const H of Y.value){const Q=P(H.path),Ae=mi(Q,H.newVal);Ae&&(I[H.path]=Ae)}return I}),be=G(()=>Object.keys(X.value).length>0),q=G(()=>e.value?(Ne.value?Z.value:Z.value.filter(H=>H.key===h.value)).map(H=>({...H,sections:H.sections.filter(Q=>Qe(Q))})).filter(H=>H.sections.length):[]),z=G(()=>{const I=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],H=new Map(I.map(Q=>[Q,[]]));for(const Q of Y.value){const Ae=H.has(Q.apply_mode)?Q.apply_mode:"restart";H.get(Ae).push(Q)}return I.filter(Q=>H.get(Q).length).map(Q=>({key:Q,label:Xt(Q),entries:H.get(Q)}))}),se=G(()=>Y.value.filter(I=>I.apply_mode==="restart").length),fe=G(()=>M.value.filter(I=>I.pending_restart)),y=G(()=>fe.value.length);function P(I){const H=V.value.get(I);return H?{...H,apply_details:Dl([H])}:null}function U(I){const H=`${I}.`;return M.value.filter(Q=>Q.path===I||Q.path.startsWith(H))}function oe(){return M.value.some(I=>I.path==="tools.hosts"||I.path.startsWith("tools.hosts."))}function ae(){var Q,Ae;const I=((Ae=(Q=e.value)==null?void 0:Q.tools)==null?void 0:Ae.hosts)||{},H=Object.keys(I).length;return`${H} host${H===1?"":"s"} configured.`}function le(I){return U(I).length}function he(I){return Pa(I)}function pe(I){const H=U(I);if(!H.length)return`${Pa(I)} configuration.`;const Q=H.find(Cs=>Cs.sensitivity==="public"&&Cs.description)||H.find(Cs=>Cs.description),Ae=(Q==null?void 0:Q.description)||"";return Ae.match(/setting for (.+)\.$/i)?`${Pa(I)} settings and runtime behaviour.`:Ae}function ue(I){const H=[...new Set(U(I).map(Q=>Q.apply_mode))];return H.length===1?H[0]:H.includes("restart")?"restart":H.includes("activation_required")?"activation_required":H[0]||"restart"}function re(I){const H=[...new Set(U(I).map(Q=>Xt(Q.apply_mode)))];return H.length?H.length===1?H[0]:`Mixed apply behaviour: ${H.join(" · ")}`:""}function _e(I){return Dl(U(I))}function ve(I){var H;return Object.hasOwn(v.value,I)?v.value[I]:(H=e.value)==null?void 0:H[I]}function we(){const I=ve("mcp")||{},H=Object.keys(I.servers||{}).length;return`${I.enabled?"Globally enabled":"Globally disabled"} · ${H} configured server${H===1?"":"s"}.`}function Ie(I,H){return H.split(".").reduce((Q,Ae)=>Q==null?void 0:Q[Ae],I)}function B(I){const H=K.value;return U(I).filter(Q=>cp(Q.path)?!1:Q.path.split(".").length<=2?!0:!Q.path.includes(".*")).map(Q=>({...Q,key:Q.path.split(".").at(-1),value:Ie(H,Q.path),apply_details:Dl([Q]),editor:Q.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ge(I){const H=I.path.split(".");return H.length>2?H.slice(0,2).join("."):null}function Se(I){const H=new Map;for(const Q of B(I)){const Ae=ge(Q),ct=Ae||`${I}.__root`;H.has(ct)||H.set(ct,{key:ct,path:Ae,entries:[]}),H.get(ct).entries.push(Q)}return[...H.values()].map(Q=>{const Ae=Q.entries.find(ct=>ct.group_description);return{...Q,label:Q.path?Pa(Q.path.split(".").at(-1)):null,description:(Ae==null?void 0:Ae.group_description)||null,apply_details:Dl(Q.entries),runtime_summaries:Me(Q.entries)}})}function Oe(I){return{save:I.save_effect||(I.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:I.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[I.apply_mode]||"Effective runtime state is not currently observable."}}function Me(I){const H=new Map;for(const Q of I){const Ae=Oe(Q),ct=`${Q.apply_mode}|${Ae.save}|${Ae.runtime}`;H.has(ct)||H.set(ct,{key:ct,label:Xt(Q.apply_mode),save:Ae.save,runtime:Ae.runtime})}return[...H.values()]}function dt(I){if(st(I))return I.runtime_effect||I.activation_policy||"";if(I.apply_mode==="activation_required"){const H=I.activation_policy||I.runtime_effect;return H?`Not active after saving. No activation control exists in this release. ${H}`:"Not active after saving; no activation control exists in this release."}return""}function st(I){return I.action_available===!0&&!!(I.action_label&&I.action_endpoint)}async function _t(I){if(st(I))try{if(Et(I.path))throw new Error("Save this setting before applying its action.");const H=String(I.action_method||"POST").toLowerCase(),Q={post:j.post.bind(j),put:j.put.bind(j),delete:j.del.bind(j)}[H];if(!Q)throw new Error("Unsupported configuration action");await Q(I.action_endpoint,I.action_body||void 0),await De(),es("success",`${I.action_label} completed.`)}catch(H){es("error",H.message||`${I.action_label} failed`)}}function Ot(I,H){return[I.label,I.path,I.description,...I.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(H)}function rt(I){const H=u.value.trim().toLowerCase();return H?U(I).filter(Q=>Ot(Q,H)):[]}function Qe(I){const H=U(I);if(p.value!=="all"&&!H.some(Ae=>Ae.apply_state===p.value))return!1;const Q=u.value.trim().toLowerCase();return!Q||`${he(I)} ${I}`.toLowerCase().includes(Q)?!0:H.some(Ae=>Ot(Ae,Q))}function ie(I,H){return U(I).filter(Q=>Q.apply_state===H).length}function Te(I){return I==="all"?T.value:M.value.filter(H=>H.apply_state===I).length}function Le(I){const H=I.sections.flatMap(Q=>U(Q));return{fields:H.length,modified:Y.value.filter(Q=>I.sections.includes(Q.path.split(".")[0])).length,pending_restart:H.filter(Q=>Q.apply_state==="pending_restart").length,invalid:H.filter(Q=>Q.apply_state==="invalid").length,dormant:H.filter(Q=>Q.apply_state==="dormant").length}}function Ke(I){var H;return Object.hasOwn(v.value,I)&&!Ui((H=e.value)==null?void 0:H[I],v.value[I])}function Et(I){return Y.value.some(H=>H.path===I||H.path.startsWith(`${I}.`))}function Ve(I){h.value=I,u.value="",p.value="all";try{localStorage.setItem(tv,I)}catch{}}function $t(I){p.value=I}function zt(){u.value="",p.value="all"}function rs(I){var H;return((H=Z.value.find(Q=>Q.sections.includes(I)))==null?void 0:H.sections)||[]}function Js(I){const H=rs(I),Q=H.find(Ae=>m.value[Ae]===!0);return Q||H.find(Ae=>m.value[Ae]!==!1)||null}function ks(I){return u.value&&!A.value&&Qe(I)?!0:A.value?Js(I)===I:Object.hasOwn(m.value,I)?m.value[I]===!0:!0}function sa(I){const H=!ks(I);if(A.value){const Q={...m.value};for(const Ae of rs(I))Q[Ae]===!0&&(Q[Ae]=!1);Q[I]=H,m.value=Q;return}m.value={...m.value,[I]:H}}function Zs(){b.value.push(ca(v.value)),b.value.length>Jk&&b.value.shift(),R.value=[]}function Ns(){ce.value&&(Zs(),v.value={},g.value={},C.value=!1)}function Mn(I,H=!1){const Q=Date.now();if(H&&F.path===I&&Q-F.at<Zk){F.at=Q;return}Zs(),F={path:I,at:Q}}function Ss(I,H,Q){if(!H.length)return Q;const Ae=ca(I??{});let ct=Ae;for(let Cs=0;Cs<H.length-1;Cs+=1){const pn=H[Cs];ct[pn]=ca(ct[pn]??{}),ct=ct[pn]}return ct[H.at(-1)]=Q,Ae}function Fn(I){var H;return Object.hasOwn(v.value,I)?v.value[I]:ca((H=e.value)==null?void 0:H[I])}function Lt(I,H,Q={}){var Ad;if(Pl.has(I.path.split(".")[0]))return;const[Ae,...ct]=I.path.split(".");Mn(I.path,!!Q.coalesce);const Cs=Fn(Ae),pn=ct.length?Ss(Cs,ct,H):H,aa={...v.value};if(Ui(pn,(Ad=e.value)==null?void 0:Ad[Ae])?delete aa[Ae]:aa[Ae]=pn,v.value=aa,g.value[I.path]){const Rd={...g.value};delete Rd[I.path],g.value=Rd}}function Xe(I){F={path:null,at:0},w.value={...w.value,[I]:String(Ie(K.value,I)??"")}}function Ts(I){if(F={path:null,at:0},!Object.hasOwn(w.value,I))return;const H={...w.value};delete H[I],w.value=H}function Ds(I){const H=w.value[I.path];if(F={path:null,at:0},H===""){if(I.nullable){Ts(I.path),Lt(I,null,{coalesce:!0});return}g.value={...g.value,[I.path]:"Enter a number."};return}const Q=Number(H);if(Number.isNaN(Q)||I.type==="integer"&&!Number.isInteger(Q)){g.value={...g.value,[I.path]:I.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Ae={...w.value};delete Ae[I.path],w.value=Ae,Lt(I,Q,{coalesce:!0})}function ee(I){return Object.hasOwn(w.value,I.path)?w.value[I.path]:I.value??""}function ke(I,H){if(w.value={...w.value,[I.path]:H},H===""){if(I.nullable){Lt(I,null,{coalesce:!0});return}g.value={...g.value,[I.path]:"Enter a number."};return}const Q=Number(H);if(!Number.isFinite(Q)||I.type==="integer"&&!Number.isInteger(Q)){g.value={...g.value,[I.path]:I.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[I.path]){const Ae={...g.value};delete Ae[I.path],g.value=Ae}Lt(I,Q,{coalesce:!0})}function $e(I){const H=Number.parseInt(L.value,10);if(!Number.isInteger(H)||H<1){g.value={...g.value,[I.path]:"Warning thresholds must be positive whole numbers."};return}const Q=[...new Set([...I.value||[],H])].sort((Ae,ct)=>ct-Ae);L.value="",Lt(I,Q)}function Je(I,H){Lt(I,(I.value||[]).filter(Q=>Q!==H))}function wt(I){return I.apply_mode==="live_read"?"Odin reads the saved file value on next use.":I.apply_mode==="live_for_new_work"?"New work uses the saved file value.":I.apply_mode==="live_apply"?I.apply_handler?`Apply the saved value through ${I.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":I.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":I.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":I.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function ut(I){return I.type==="array"&&Array.isArray(I.value)&&!I.structured_container&&!I.structured_container_child&&I.sensitivity==="public"&&I.value.every(H=>["string","number","boolean"].includes(typeof H))}function $n(I){const H=String(_.value[I.path]??"").trim();if(!H)return;const Q=[...new Set([...I.value||[],H])];_.value={..._.value,[I.path]:""},Lt(I,Q)}function js(I,H){Lt(I,(I.value||[]).filter(Q=>Q!==H))}function mi(I,H){var Ae;if(!I)return null;if((Ae=I.enum)!=null&&Ae.length&&!I.enum.includes(H))return`Choose one of: ${I.enum.join(", ")}`;if(I.path==="agents.final_warning_iterations"&&(!Array.isArray(H)||!H.length))return"Add at least one warning threshold.";const Q=I.constraints||{};if((I.type==="integer"||I.type==="number")&&typeof H=="number"){if(Q.minimum!==void 0&&H<Q.minimum)return`Must be at least ${Q.minimum}${I.unit?` ${I.unit}`:""}`;if(Q.maximum!==void 0&&H>Q.maximum)return`Must be at most ${Q.maximum}${I.unit?` ${I.unit}`:""}`}return null}function vi(I){return X.value[I.path]||null}function Ia(I){const H=`${I}.`;return Object.keys(X.value).some(Q=>Q===I||Q.startsWith(H))}function na(){b.value.length&&(R.value.push(ca(v.value)),v.value=b.value.pop(),g.value={},w.value={},F={path:null,at:0})}function Bn(){R.value.length&&(b.value.push(ca(v.value)),v.value=R.value.pop(),g.value={},w.value={},F={path:null,at:0})}function Un(){!ce.value||be.value||(C.value=!0,O.value=!1)}function Ys(){C.value=!1}function dn(){Ns()}function Xt(I){return Kk[I]||Pa(I||"unknown")}function Oa(I){return`apply-${String(I||"unknown").replaceAll("_","-")}`}function W(I){return`cfgc-field-${I.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ye(I){return`${W(I)}-input`}function Re(I){const H=document.getElementById(W(I))||document.getElementById(W(I.split(".").slice(0,2).join(".")));H==null||H.scrollIntoView({behavior:"smooth",block:"center"})}function es(I,H){l.value={type:I,message:H},window.setTimeout(()=>{var Q;((Q=l.value)==null?void 0:Q.message)===H&&(l.value=null)},3500)}function un(){r.value=!1,p.value="pending_restart",u.value="";const I=Gk(n.value);I&&(I.scrollTop=0)}function Hn(){r.value=!1}function Ce(I=1800){N&&window.clearTimeout(N),N=window.setTimeout(D,I)}async function D(){if(c.value){if(E+=1,E>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await kr(),y.value===0){c.value=!1,d.value=null,es("success","Odin restarted and the saved startup settings are active.");return}}catch{}Ce(2e3)}}async function ne(){if(!c.value){d.value=null;try{await j.post("/api/restart",{}),c.value=!0,E=0,r.value=!1,Ce()}catch(I){d.value=I.message||"Odin could not schedule a restart."}}}async function me(){if(!(!ce.value||be.value||a.value)){a.value=!0;try{const I=Xk(e.value,v.value),H=await j.put("/api/config",I);e.value=H,v.value={},b.value=[],R.value=[],g.value={},C.value=!1;try{t.value=await kr(),o.value=null,r.value=y.value>0,es("success",y.value?`Configuration saved. ${y.value} setting${y.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(Q){o.value=Q.message||"Unknown metadata error.",es("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(I){es("error",I.message||"Configuration could not be saved")}finally{a.value=!1}}}async function De(){var I,H;if(!ce.value){s.value=!0,i.value=null;try{const Q=await j.get("/api/config"),Ae=await kr();e.value=Q,t.value=Ae,o.value=null;const ct=Z.value;if(ct.some(Cs=>Cs.key===h.value)||(h.value=((I=ct[0])==null?void 0:I.key)||Xa[0].key),A.value){const pn=(((H=ct.find(aa=>aa.key===h.value))==null?void 0:H.sections)||[]).find(aa=>m.value[aa]===!0);m.value=pn?{...m.value,[pn]:!0}:{}}}catch(Q){i.value=Q.message||"Unknown configuration error"}finally{s.value=!1}}}function Fe(I){if(C.value||!(I.ctrlKey||I.metaKey))return;const H=I.target;H instanceof HTMLElement&&(H.matches("input, textarea, select")||H.isContentEditable)||(!I.shiftKey&&I.key.toLowerCase()==="z"?(I.preventDefault(),na()):(I.key.toLowerCase()==="y"||I.shiftKey&&I.key.toLowerCase()==="z")&&(I.preventDefault(),Bn()))}function Ue(I){A.value=I.matches}Mt(m,I=>{try{localStorage.setItem(ev,JSON.stringify(I))}catch{}},{deep:!0});let yt=!1;function it(){yt||(yt=!0,document.addEventListener("keydown",Fe))}function vt(){yt&&(yt=!1,document.removeEventListener("keydown",Fe))}return je(()=>{var I;De(),it(),x=window.matchMedia("(max-width: 760px)"),Ue(x),(I=x.addEventListener)==null||I.call(x,"change",Ue)}),Qt(it),Gt(vt),ft(()=>{var I;vt(),(I=x==null?void 0:x.removeEventListener)==null||I.call(x,"change",Ue),N&&window.clearTimeout(N)}),{armKeydown:it,disarmKeydown:vt,handleKeydown:Fe,config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:h,reviewOpen:C,mobileOverflowOpen:O,warningThresholdInput:L,arrayInputs:_,healthFilters:k,visibleCategories:Z,displayGroups:q,reviewGroups:z,sectionCount:J,fieldCount:T,hasChanges:ce,changeCount:te,changedSectionCount:de,hasDraftErrors:be,canUndo:S,canRedo:$,globalFilterActive:Ne,reviewRestartCount:se,pendingRestartCount:y,pendingRestartFields:fe,healthCount:Te,categoryStats:Le,selectCategory:Ve,selectHealthFilter:$t,clearFilters:zt,sectionLabel:he,sectionDescription:pe,sectionFieldCount:le,sectionHealthCount:ie,sectionApplySummary:re,sectionApplyDetails:_e,sectionEntries:B,fieldGroups:Se,sectionSearchHits:rt,mcpConfigSummary:we,fieldRuntimeCopy:Oe,fieldSpecificRuntimeNote:dt,hasHonestAction:st,runFieldAction:_t,hasHostsCollection:oe,hostsConfigSummary:ae,sectionChanged:Ke,fieldChanged:Et,isSectionExpanded:ks,toggleSection:sa,discardAllDrafts:Ns,setFieldValue:Lt,setNumberFieldValue:ke,numberInputValue:ee,beginInputEdit:Xe,endTextInputEdit:Ts,endInputEdit:Ds,addWarningThreshold:$e,removeWarningThreshold:Je,isScalarArray:ut,addScalarArrayItem:$n,removeScalarArrayItem:js,fieldError:vi,sectionHasErrors:Ia,undo:na,redo:Bn,openReview:Un,closeReview:Ys,mobileCancel:dn,applyModeLabel:Xt,applyClass:Oa,compactValue:Yk,formatValue:Qk,structuredApplyCopy:wt,fieldId:W,fieldInputId:ye,focusField:Re,fetchConfig:De,saveConfig:me,restartOdin:ne,restartLater:Hn,reviewPendingRestart:un}}},nS=/^\d{15,25}$/;function av(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const iv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),n=f(!1),a=f(0),i=f(null),l=G(()=>new Set((e.excludedIds||[]).map(String))),o=G(()=>{const R=s.value.toLowerCase().trim();return(e.members||[]).filter(C=>l.value.has(String(C.id))?!1:R?u(C).toLowerCase().includes(R)||String(C.username||"").toLowerCase().includes(R)||String(C.id).includes(R):!0)}),r=G(()=>{const R=s.value.trim();return o.value.length===0&&nS.test(R)&&!l.value.has(R)?R:""}),c=G(()=>o.value.length+(r.value?1:0)),d=G(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(R){return av(R)}function p(){n.value=!0,a.value=0}function h(){p()}function m(){const R=Math.max(c.value-1,0);a.value=Math.min(a.value+1,R)}function v(){a.value=Math.max(a.value-1,0)}function w(){const R=o.value[a.value];R?L(R):r.value&&a.value===o.value.length&&_(r.value)}function L(R){_(String(R.id))}function _(R){t("select",R),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function b(){setTimeout(g,150)}return je(()=>{e.autofocus&&Rt(()=>{var R;return(R=i.value)==null?void 0:R.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:w,selectMember:L,selectId:_,closeOptions:g,onBlur:b}}};function dp(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const aS={components:{DiscordUserCombobox:iv},template:`
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
  `,setup(){const e=f([]),t=f(!0),s=f(null),n=f({}),a=f(null),i=f(null),l=f(!1),o=f(null),r=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=G(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),h=G(()=>new Map(c.value.map(T=>[String(T.id),T])));function m(T){return T.config&&T.config.enabled!==void 0?T.config.enabled:!0}function v(T){return dp(T,"require_mention",a.value)}function w(T){return dp(T,"respond_to_bots",a.value)}function L(T){return T.config&&Object.keys(T.config).length>0}function _(T){n.value[T]=!n.value[T]}function g(T){const k=T.discord||{};return{allowed_users:[...k.allowed_users||[]],channels:[...k.channels||[]],respond_to_bots:!!k.respond_to_bots,require_mention:!!k.require_mention,ignore_bot_ids:[...k.ignore_bot_ids||[]]}}async function b({showLoading:T=!0}={}){const k=++d;T&&(t.value=!0),s.value=null;try{const S=await j.get("/api/discord/guilds");k===d&&(e.value=S)}catch(S){k===d&&(s.value=S.message)}finally{T&&k===d&&(t.value=!1)}}async function R(){t.value=!0,s.value=null;try{const[T,k,S]=await Promise.all([j.get("/api/discord/guilds"),j.get("/api/discord/members").catch(()=>[]),j.get("/api/config")]),$=g(S),Z=p.value;a.value=$,Z||(i.value=JSON.parse(JSON.stringify($))),c.value=k,e.value=T,o.value=null}catch(T){s.value=T.message}finally{t.value=!1}}let C=Promise.resolve();const O=f(new Set);function A(T,k){const S=new Set(O.value);S.add(T),O.value=S;const $=C.then(k);return C=$.catch(()=>{}),$.finally(()=>{const Z=new Set(O.value);Z.delete(T),O.value=Z})}function x(T,k,S,$){const Z=($==null?void 0:$.target)??null;return A(`guild:${T}:${k}`,async()=>{try{await j.put("/api/discord/guild/"+T+"/config",{[k]:S}),await b({showLoading:!1})}catch(K){s.value=K.message,Z&&typeof S=="boolean"&&(Z.checked=!S)}})}function N(T,k,S,$,Z){const K=(Z==null?void 0:Z.target)??null;return A(`channel:${T}:${S}`,async()=>{try{await j.put("/api/discord/channel/"+T+"/config",{[S]:$}),await b({showLoading:!1})}catch(Y){s.value=Y.message,K&&typeof $=="boolean"&&(K.checked=!$)}})}function F(T,k){return A(`channel:${T}:clear`,async()=>{try{await j.put("/api/discord/channel/"+T+"/config",{clear:!0}),await b({showLoading:!1})}catch(S){s.value=S.message}})}function E(T,k){const S=String(k);if(!T.userAutocomplete)return S;const $=h.value.get(S);return $?av($):S}function M(T,k=null){const S=String(k??r.value[T]??"").trim();!S||i.value[T].includes(S)||(i.value[T]=[...i.value[T],S],r.value={...r.value,[T]:""})}function V(T,k){i.value[T]=i.value[T].filter(S=>S!==k)}async function J(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const k=(await j.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...k.allowed_users||[]],channels:[...k.channels||[]],respond_to_bots:!!k.respond_to_bots,require_mention:!!k.require_mention,ignore_bot_ids:[...k.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(T){o.value=T.message||"Global defaults could not be saved."}finally{l.value=!1}}}return je(R),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:w,hasOverride:L,toggleGuild:_,fetchAll:R,fetchGuilds:b,setGuildConfig:x,setChannelConfig:N,clearOverride:F,mutationPending:O,globalItemLabel:E,addGlobalItem:M,removeGlobalItem:V,saveGlobalDefaults:J}}},Es=e=>e==null?e:JSON.parse(JSON.stringify(e));function iS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(C){d+=1;const O=c.then(C,C);return c=O.catch(()=>{}),O}function w(C,O){h=Es(C),m.clear();for(const[A,x]of Object.entries(O||{}))m.set(A,Es(x))}function L(C){const O=Es(C),A=++u;return v(async()=>{try{await e(Es(O)),h=Es(O),A===u&&n(Es(O))}catch(x){A===u&&(a(Es(h)),r(x,{kind:"default"}))}})}function _(C,O){const A=Es(O),x=(p.get(C)||0)+1;return p.set(C,x),v(async()=>{try{await t(C,Es(A)),m.set(C,Es(A)),x===p.get(C)&&i(C,Es(A))}catch(N){x===p.get(C)&&(l(C,Es(m.get(C)??null)),r(N,{kind:"user",uid:C}))}})}function g(C){const O=(p.get(C)||0)+1;return p.set(C,O),v(async()=>{try{await s(C),m.delete(C),O===p.get(C)&&o(C)}catch(A){O===p.get(C)&&(l(C,Es(m.get(C)??null)),r(A,{kind:"delete",uid:C}))}})}async function b(){for(;;){const C=c;if(await C,C===c)return d}}async function R(C){for(;;){const O=await b(),A=await C();if(O===d)return A}}return{seed:w,saveDefault:L,saveUser:_,deleteUser:g,whenIdle:b,readSnapshot:R,get revision(){return d}}}const lS={components:{DiscordUserCombobox:iv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=G(()=>{const E={};for(const M of r.value)E[M.id]=M;return E});function d(E){return c.value[E]||null}function u(E,M){return E?E.allowed_hosts===null||E.allowed_hosts===void 0?{allowed_hosts:[...M],default_host:E.default_host||"",allow_all:!0}:{allowed_hosts:E.allowed_hosts,default_host:E.default_host||"",allow_all:!1}:{allowed_hosts:[...M],default_host:M[0]||"",allow_all:!0}}const p=iS({applyDefault:async E=>{const M=E.allow_all?null:E.allowed_hosts;await j.put("/api/host-access/default-policy",{allowed_hosts:M,default_host:E.default_host})},applyUser:async(E,M)=>{const V=M.allow_all?null:M.allowed_hosts;await j.put(`/api/host-access/user/${E}`,{allowed_hosts:V,default_host:M.default_host})},applyDelete:E=>j.del(`/api/host-access/user/${E}`),onDefaultConfirmed:()=>xe.success("Default policy updated"),onDefaultRollback:E=>{E&&(i.value=E)},onUserConfirmed:E=>{const M=d(E);xe.success(`Updated access for ${M?M.display_name:E}`)},onUserRollback:(E,M)=>{const V={...l.value};M?V[E]=M:delete V[E],l.value=V},onUserDeleted:E=>{const M={...l.value};delete M[E],l.value=M},onError:(E,M)=>{var J;const V=M.uid?` ${((J=d(M.uid))==null?void 0:J.display_name)||M.uid}`:"";xe.error(`${E.message||"Failed to save"} — reverted${V}`)}});let h=0;async function m(){const E=++h;e.value=!0,t.value="";try{const M=await p.readSnapshot(()=>j.get("/api/host-access"));if(E!==h)return;s.value=M,n.value=M.available_hosts||[],a.value=M.host_descriptions||{},i.value=u(M.default_policy,n.value);const V=M.users||{},J={};for(const[T,k]of Object.entries(V))J[T]=u(k,n.value);l.value=J,p.seed(i.value,J)}catch(M){E===h&&(t.value=M.message||"Failed to fetch host access data")}finally{E===h&&(e.value=!1)}try{const M=await j.get("/api/discord/members")||[];E===h&&(r.value=M)}catch{E===h&&(r.value=[])}}const v=500,w=new Map;function L(E,M){const V=w.get(E);V&&clearTimeout(V.timer);const J={run:M,timer:null};J.timer=setTimeout(()=>{w.delete(E),M()},v),w.set(E,J)}function _(E){const M=w.get(E);M&&(clearTimeout(M.timer),w.delete(E))}function g(){for(const[E,M]of[...w])clearTimeout(M.timer),w.delete(E),M.run()}function b(){L("default",()=>p.saveDefault(i.value))}function R(E,M){i.value.allow_all=!1,M?i.value.allowed_hosts.includes(E)||i.value.allowed_hosts.push(E):(i.value.allowed_hosts=i.value.allowed_hosts.filter(V=>V!==E),i.value.default_host===E&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function C(E){L(`user:${E}`,()=>{const M=l.value[E];M&&p.saveUser(E,M)})}function O(E,M,V){const J=l.value[E];J&&(J.allow_all=!1,V?J.allowed_hosts.includes(M)||J.allowed_hosts.push(M):(J.allowed_hosts=J.allowed_hosts.filter(T=>T!==M),J.default_host===M&&(J.default_host=J.allowed_hosts[0]||"")),C(E))}function A(E,M){const V=l.value[E];V&&(V.default_host=M,C(E))}function x(){o.value=!0}function N(E){!/^\d{15,25}$/.test(E)||l.value[E]||(l.value[E]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},p.saveUser(E,l.value[E]),o.value=!1)}async function F(E){const M=d(E);await qt({title:"Remove user override",message:`Remove the host access override for ${M?M.display_name:E}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(_(`user:${E}`),await p.deleteUser(E),l.value[E]||xe.success(`Removed override for ${M?M.display_name:E}`))}return je(m),Gt(g),ft(g),{loading:e,error:t,data:s,availableHosts:n,hostDescriptions:a,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:R,getMember:d,toggleUserHost:O,setUserDefault:A,openAddUser:x,addUserById:N,deleteUser:F,flushPendingSaves:g}}},oS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),n=f([]),a=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),w=f(v()),L=G(()=>["127.0.0.1","localhost","::1"].includes(w.value.address));async function _(){t.value=!0,s.value="";try{const J=await j.get("/api/hosts");e.value=J.hosts||[],o.value=J.default_host||"",r.value=!!J.tofu_enabled}catch(J){s.value=J.message}finally{t.value=!1}}async function g(){try{await j.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),xe.success("Host settings saved and published live"),await _()}catch(J){xe.error(J.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,a.value=!0}function R(){i.value=!1,w.value=v(),b()}function C(J){i.value=!0,w.value={...v(),...J},b()}async function O(){try{c.value=await j.get("/api/hosts/public-key")}catch(J){xe.error(J.message)}}async function A(J){try{const T=await j.post("/api/hosts/"+encodeURIComponent(J.alias)+"/import-legacy",{});i.value=!0,w.value={...v(),...J,trust_mode:"pinned"},b(),d.value=T.candidate_token,u.value=T.fingerprints||[],m.value=u.value.join(`
`),l.value=4,xe.info("Imported existing known_hosts trust. Test before activation.")}catch(T){xe.error(T.message)}}async function x(){try{const J=m.value.split(/\s+/).filter(Boolean),T={...w.value,expected_fingerprints:J,candidate_fingerprints:u.value},k=await j.post("/api/hosts/candidates",T);if(d.value=k.candidate_token,u.value=k.fingerprints||[],w.value.trust_mode==="tofu"&&T.candidate_fingerprints.length===0){w.value.confirm_tofu=!1,xe.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(J){xe.error(J.message)}}async function N(){var J,T;p.value=!1,h.value=null;try{const k=await j.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!k.tested,h.value=k.last_test,p.value&&(l.value=5)}catch(k){const S=(J=k.data)==null?void 0:J.last_test;S&&typeof S=="object"&&!Array.isArray(S)&&(h.value=S);const $=(T=h.value)==null?void 0:T.detail;xe.error(typeof $=="string"&&$.trim()?$:k.message)}}async function F(){try{await j.post("/api/hosts/candidates/"+d.value+"/commit",{}),xe.success("Host saved and published live"),a.value=!1,await _()}catch(J){xe.error(J.message)}}async function E(J){try{await j.post("/api/hosts/"+encodeURIComponent(J.alias)+"/enabled",{enabled:!J.enabled}),await _()}catch(T){xe.error(T.message)}}async function M(J){var T;if(await qt("Delete host "+J.alias+"? Dependencies will block deletion.")){n.value=[];try{await j.del("/api/hosts/"+encodeURIComponent(J.alias)),await _()}catch(k){n.value=Array.isArray((T=k.data)==null?void 0:T.pending_references)?k.data.pending_references:[],xe.error(k.message)}}}async function V(J){if(await qt("Force revoke "+J.alias+"? Remote outcomes may be unknown."))try{await j.post("/api/hosts/"+encodeURIComponent(J.alias)+"/force-revoke",{}),await _()}catch(T){xe.error(T.message)}}return je(_),{hosts:e,loading:t,error:s,pendingReferences:n,wizard:a,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:w,isLocal:L,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:_,saveSettings:g,beginAdd:R,beginEdit:C,loadKey:O,importLegacy:A,prepare:x,testConnection:N,commit:F,toggle:E,remove:M,forceRevoke:V}}},rS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),n=f([]),a=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=G(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=G(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(A){return A==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":A==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const A=await j.get("/api/tokens");s.value=A.tokens||[],n.value=A.available_hosts||[]}catch(A){t.value=A.message||"Failed to load tokens"}finally{e.value=!1}}function v(A){return!A||!A.trim()?[]:A.split(",").map(x=>x.trim()).filter(Boolean)}function w(A,x){const N=c.value.allowed_hosts;if(x&&!N.includes(A)&&N.push(A),!x){const F=N.indexOf(A);F>=0&&N.splice(F,1)}}function L(A,x){const N=d.value.allowed_hosts;if(x&&!N.includes(A)&&N.push(A),!x){const F=N.indexOf(A);F>=0&&N.splice(F,1)}}async function _(){var A;i.value=!0;try{const x=v(c.value.allowed_tools_str),N=c.value.host_mode,F=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,E={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};F!==null&&(E.allowed_hosts=F),E.default_host=c.value.default_host||"";const M=await j.post("/api/tokens",E);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,xe.success("Token created"),await m()}catch(x){xe.error(((A=x.data)==null?void 0:A.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(A){o.value=A;const x=A.allowed_hosts;let N="default";x==null?N="default":Array.isArray(x)&&x.length===0?N="none":Array.isArray(x)&&(N="select"),d.value={username:A.username||"",tier:A.tier||"admin",label:A.label||"",host_mode:N,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:A.default_host||"",allowed_tools_str:(A.allowed_tools||[]).join(", ")}}async function b(){var A;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),N=d.value.host_mode,F={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};N==="none"?F.allowed_hosts=[]:N==="select"?F.allowed_hosts=d.value.allowed_hosts:F.allowed_hosts=null,F.default_host=d.value.default_host||"",await j.put("/api/tokens/"+encodeURIComponent(o.value.user_id),F),o.value=null,xe.success("Token updated"),await m()}catch(x){xe.error(((A=x.data)==null?void 0:A.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function R(A){var N;if(await qt({title:"Regenerate token",message:`Regenerate token for ${A.username||A.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const F=await j.post("/api/tokens/"+encodeURIComponent(A.user_id)+"/regenerate");l.value=F.token,xe.success("Token regenerated")}catch(F){xe.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to regenerate")}}async function C(A){var N;if(await qt({title:"Delete token",message:`Delete token for ${A.username||A.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/tokens/"+encodeURIComponent(A.user_id)),xe.success("Token deleted"),await m()}catch(F){xe.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),xe.success("Copied to clipboard")}catch{xe.error("Copy failed — select and copy manually")}}return je(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:w,toggleEditHost:L,createToken:_,startEdit:g,saveEdit:b,confirmRegenerate:R,confirmDelete:C,copyToken:O}}},cS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),dS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),uS=Object.freeze(["enabled","base_url","model","max_tokens"]),pS=Object.freeze(["enabled","model","max_tokens"]);function Xo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function up(e){return Xo(e,cS)}function pp(e){return Xo(e,dS)}function fS(e,{includeApiKey:t=!1}={}){const s=Xo(e,uS);return t&&(s.api_key=e.api_key),s}function hS(e){return{timeout:e.timeout}}function mS(e,{includeApiKey:t=!1}={}){const s=Xo(e,pS);return t&&(s.api_key=e.api_key),s}function vS(e){return{timeout:e.timeout}}function Ml(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const gS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),n=f("codex"),a=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=G(()=>{const W=a.value.model;return W&&!i.includes(W)?[W,...i]:i}),o=G(()=>{const W=a.value.agent_model;return W&&W!=="auto"&&!i.includes(W)?[W,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(W,ye)=>!!W&&!!ye&&(r[W]||[]).includes(ye),d=W=>!c(a.value.model,W)&&!(a.value.agent_reasoning_effort===""&&c(a.value.agent_model,W)),u=W=>{const ye=a.value.agent_model;return ye==="auto"?!0:!c(ye||a.value.model,W)},p=G(()=>{const W=a.value.agent_reasoning_effort;return W==="auto"?null:W||a.value.reasoning_effort}),h=W=>c(W,a.value.reasoning_effort)||a.value.agent_model===""&&c(W,p.value),m=W=>c(W,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),w=f({unavailable_reason:null}),L=G(()=>{const W=v.value.model;return W&&!i.includes(W)?[W,...i]:i});function _(W){const ye=W.target.value;v.value.enabled=ye!=="",ye!==""&&(v.value.model=ye),ee()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),R=f(null),C=f(!1),O=f(""),A=f(null),x=f(!1);let N=0;const F=G(()=>{var W;return Object.entries(((W=R.value)==null?void 0:W.models)||{}).map(([ye,Re])=>{var es,un,Hn;return{model:ye,floor:Re.floor,override:Re.override,effectiveBudget:(es=Re.effective)==null?void 0:es.effective_budget,configuredPrimaryChars:(un=Re.configured)==null?void 0:un.primary_chars,primaryChars:(Hn=Re.effective)==null?void 0:Hn.primary_chars,provenance:Re.provenance,clampExpiresAt:Re.clamp_expires_at,densityPriorMilli:Re.density_prior_milli,densityScope:Re.density_scope,workloadCalibration:Re.workload_calibration}})}),E=G(()=>{var W;return((W=R.value)==null?void 0:W.clamps)||[]}),M=G(()=>{var W,ye;return((ye=(W=R.value)==null?void 0:W.models)==null?void 0:ye[a.value.model])||null}),V=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),J=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),T=f(!1),k=f(!1),S=f(!1),$=f(!1),Z=f(!1),K=f(!1),Y=f(!1),ce=f({configured:null}),te=f(!1),de=f([]),Ne=f(""),X=f(!1),be=f(!1),q=f({configured:null}),z=f(!1),se=f([]),fe=f(""),y=f(!1),P=f(!1),U=f(!0),oe=f(""),ae=f({configured:null,accounts:[]}),le=f(null),he=f(null),pe=f(""),ue=f(null),re=f(!1),_e=f(null),ve=f(null),we=f("");let Ie=null;function B(W,ye="success"){xe(W,ye==="error"?"error":"success")}function ge(W){if(!W)return"?";const ye=W/(1024*1024*1024);return ye>=1?ye.toFixed(1)+" GB":(W/(1024*1024)).toFixed(0)+" MB"}function Se(W){return Number.isFinite(Number(W))?Number(W).toLocaleString():"—"}function Oe(W){return W==null?"automatic (model-derived)":Number(W).toLocaleString()+" characters"}function Me(W){const ye=new Date(W);return Number.isNaN(ye.getTime())?"unknown":ye.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function dt(W){return typeof W=="string"&&W.length>12?W.slice(0,8)+"…"+W.slice(-4):W}function st(W){return typeof W!="number"||!Number.isFinite(W)?"—":(W/1e3).toFixed(2)}function _t(W){return W==="temporary learned clamp"?"is-clamp":W==="override"?"is-override":"is-built-in"}function Ot(W){const ye=a.value.context_budget_overrides[W.model];return W.floor!=null&&Number.isFinite(Number(ye))&&Number(ye)>W.floor}function rt(W,ye){const Re={...a.value.context_budget_overrides};ye.target.value===""?delete Re[W]:Re[W]=Number(ye.target.value),a.value.context_budget_overrides=Re,x.value=!0}function Qe(W){a.value.context_utilization=W.target.value===""?"":Number(W.target.value),x.value=!0}function ie(W){const ye={...a.value.context_budget_overrides};delete ye[W],a.value.context_budget_overrides=ye,x.value=!0}async function Te(){e.value=!0,await Promise.all([Le(),Et(),ks(),Ve(),Ke()]),e.value=!1}async function Le({preserveBasic:W=!1,preserveAdvanced:ye=!1}={}){try{const Re=await j.get("/api/llm/status");t.value=Re,s.value=!1,n.value=Re.active_provider||"codex",Re.codex&&!Ds.pending()&&(W||(a.value.enabled=Re.codex.enabled,a.value.model=Re.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Re.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Re.codex.agent_reasoning_effort||"",a.value.agent_model=Re.codex.agent_model||""),ye||(a.value.request_timeout_seconds=Re.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Re.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Re.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Re.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Re.codex.context_compression||{}},!x.value&&!S.value&&(a.value.context_budget_overrides={...Re.codex.context_budget_overrides||{}},a.value.context_utilization=Re.codex.context_utilization??a.value.context_utilization))),Re.ollama&&!ke.pending()&&(W||(V.value.enabled=Re.ollama.enabled,V.value.base_url=Re.ollama.base_url||"",V.value.model=Re.ollama.model||"",V.value.max_tokens=Re.ollama.max_tokens||4096),ye||(V.value.timeout=Re.ollama.timeout??V.value.timeout)),Re.kimi&&!$e.pending()&&(W||(J.value.enabled=Re.kimi.enabled,J.value.model=Re.kimi.model||"",J.value.max_tokens=Re.kimi.max_tokens||4096),ye||(J.value.timeout=Re.kimi.timeout??J.value.timeout)),Re.auxiliary&&(w.value=Re.auxiliary,ee.pending()||(v.value.enabled=Re.auxiliary.enabled,v.value.model=Re.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Ke(){const W=++N;C.value=!0,O.value="";try{const ye=await j.get("/api/context/windows");if(W!==N)return;R.value=ye,!S.value&&!x.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(ye.models||{}).filter(([,Re])=>Re.override!=null).map(([Re,es])=>[Re,es.override])),a.value.context_utilization=ye.utilization??a.value.context_utilization)}catch(ye){W===N&&(O.value=ye.message||"Failed to load context budgets")}finally{W===N&&(C.value=!1)}}async function Et(){try{if(ce.value=await j.get("/api/ollama/status"),te.value=!1,ce.value.model&&(Ne.value=ce.value.model),ce.value.configured)try{const W=await j.get("/api/ollama/models");de.value=W.models||[]}catch{de.value=[]}else if(V.value.base_url)try{const W=await j.post("/api/ollama/probe-models",{base_url:V.value.base_url});de.value=W.models||[]}catch{de.value=[]}}catch{te.value=!0}}async function Ve(){U.value=!0,oe.value="";try{ae.value=await j.get("/api/codex/status")}catch(W){oe.value=W.message||"Failed to fetch Codex status"}finally{U.value=!1}}async function $t(){const W=t.value?t.value.active_provider:"codex";Y.value=!0;try{const ye=await j.post("/api/llm/switch",{provider:n.value});ye.error?(n.value=W,B(ye.error,"error")):(B("Switched to "+n.value+" ("+ye.model+")"),await Te())}catch(ye){n.value=W,B(ye.message||"Switch failed","error")}finally{Y.value=!1}}async function zt(){X.value=!0;try{const W=await j.post("/api/ollama/reload");B(W.configured?"Ollama reloaded":W.reason||"Ollama not configured",W.configured?"success":"error"),await Te()}catch(W){B(W.message||"Reload failed","error")}finally{X.value=!1}}async function rs(){be.value=!0;try{await j.post("/api/ollama/model",{model:Ne.value}),B("Model set to "+Ne.value),await Te()}catch(W){B(W.message||"Failed","error")}finally{be.value=!1}}async function Js(){const W=V.value.base_url;if(!W){B("Enter a base URL first","error");return}K.value=!0;try{const ye=await j.post("/api/ollama/probe-models",{base_url:W});de.value=ye.models||[],de.value.length?(B(de.value.length+" model(s) found"),!V.value.model&&de.value.length&&(V.value.model=de.value[0].name)):B("No models found at "+W,"error")}catch(ye){B(ye.message||"Could not reach Ollama","error")}finally{K.value=!1}}async function ks(){try{if(q.value=await j.get("/api/kimi/status"),z.value=!1,q.value.model&&(fe.value=q.value.model),q.value.configured)try{const W=await j.get("/api/kimi/models");se.value=W.models||[]}catch{se.value=[]}}catch{z.value=!0}}async function sa(){y.value=!0;try{const W=await j.post("/api/kimi/reload");B(W.configured?"Kimi reloaded":W.reason||"Kimi not configured",W.configured?"success":"error"),await Te()}catch(W){B(W.message||"Reload failed","error")}finally{y.value=!1}}async function Zs(){P.value=!0;try{await j.post("/api/kimi/model",{model:fe.value}),B("Model set to "+fe.value),await Te()}catch(W){B(W.message||"Failed","error")}finally{P.value=!1}}async function Ns(){if(S.value){Ds();return}S.value=!0;const W=up(a.value);try{await j.put("/api/llm/codex/config",W),B("Codex config saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Ve()])}catch(ye){B(ye.message||"Failed","error");const Re=JSON.stringify(up(a.value))!==JSON.stringify(W);await Promise.all([Le({preserveBasic:Re,preserveAdvanced:!0}),Ve()])}finally{S.value=!1}}async function Mn(){if(S.value)return;S.value=!0;const W=pp(a.value);try{await j.put("/api/llm/codex/config",W),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:W.context_budget_overrides,context_utilization:W.context_utilization})&&(x.value=!1),B("Codex advanced settings saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Ve(),Ke()])}catch(ye){B(ye.message||"Failed","error");const Re=JSON.stringify(pp(a.value))!==JSON.stringify(W);await Promise.all([Le({preserveBasic:!0,preserveAdvanced:Re}),Ve(),Ke()])}finally{S.value=!1}}async function Ss(){if($.value){ke();return}$.value=!0;try{const W=T.value?V.value.api_key:null,ye=fS(V.value,{includeApiKey:W!==null});await j.put("/api/llm/ollama/config",ye),B("Ollama config saved"),W!==null&&V.value.api_key===W&&(V.value.api_key="",T.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(W){B(W.message||"Failed","error")}finally{$.value=!1}}async function Fn(){if(!$.value){$.value=!0;try{await j.put("/api/llm/ollama/config",hS(V.value)),B("Ollama timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),Et()])}catch(W){B(W.message||"Failed","error")}finally{$.value=!1}}}async function Lt(){if(Z.value){$e();return}Z.value=!0;try{const W=k.value?J.value.api_key:null,ye=mS(J.value,{includeApiKey:W!==null});await j.put("/api/llm/kimi/config",ye),B("Kimi config saved"),W!==null&&J.value.api_key===W&&(J.value.api_key="",k.value=!1),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(W){B(W.message||"Failed","error")}finally{Z.value=!1}}async function Xe(){if(!Z.value){Z.value=!0;try{await j.put("/api/llm/kimi/config",vS(J.value)),B("Kimi timeout saved"),await Promise.all([Le({preserveBasic:!0,preserveAdvanced:!0}),ks()])}catch(W){B(W.message||"Failed","error")}finally{Z.value=!1}}}async function Ts(){if(g.value){ee();return}g.value=!0;try{await j.put("/api/llm/auxiliary/config",v.value),B("Auxiliary config saved"),await Le()}catch(W){B(W.message||"Failed","error"),await Le()}finally{g.value=!1}}const Ds=Ml(Ns),ee=Ml(Ts),ke=Ml(Ss),$e=Ml(Lt),Je=()=>(Ds.cancel(),Ns()),wt=()=>(ke.cancel(),Ss()),ut=()=>($e.cancel(),Lt()),$n=()=>Mn(),js=()=>Fn(),mi=()=>Xe();async function vi(W){const ye=W.account_key+":"+W.model;A.value=ye;try{const Re=await j.post("/api/context/windows/clear",{account_key:W.account_key,model:W.model});B(Re.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Ke()}catch(Re){B(Re.message||"Failed to clear clamp","error"),await Ke()}finally{A.value=null}}async function Ia(W){try{await j.post("/api/codex/account/"+W+"/activate"),B("Active account switched"),await Ve()}catch(ye){B(ye.message||"Failed","error")}}async function na(W){le.value=W;try{await j.post("/api/codex/account/"+W+"/refresh"),B("Token refreshed"),await Ve()}catch(ye){B(ye.message||"Refresh failed","error")}finally{le.value=null}}function Bn(W,ye){he.value=W,pe.value=ye||""}async function Un(W){try{await j.put("/api/codex/account/"+W+"/label",{label:pe.value}),B("Label updated"),he.value=null,await Ve()}catch(ye){B(ye.message||"Failed","error")}}async function Ys(W,ye){if(await qt({title:"Delete Codex account",message:`Delete ${ye||"account #"+(W+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await j.del("/api/codex/account/"+W),B("Deleted. Pool reloaded."),await Ve()}catch(es){B(es.message||"Failed","error")}}async function dn(){re.value=!0;try{const W=await j.post("/api/codex/device-code");_e.value=W,ue.value="pending",Xt(W)}catch(W){B(W.message||"Failed","error")}finally{re.value=!1}}async function Xt(W){Ie={cancelled:!1};const ye=Ie;try{const Re=await j.post("/api/codex/device-poll",{device_auth_id:W.device_auth_id,user_code:W.user_code,interval:W.interval});if(ye.cancelled)return;ve.value=Re,ue.value="success",await Te()}catch(Re){if(ye.cancelled)return;we.value=Re.message||"Device login failed",ue.value="error"}}function Oa(){Ie&&(Ie.cancelled=!0),ue.value=null,_e.value=null}return je(Te),ft(()=>{Ie&&(Ie.cancelled=!0),Ds.cancel(),ee.cancel(),ke.cancel(),$e.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:Y,advancedOpen:b,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:w,auxModelOptions:L,onAuxModelChange:_,savingAux:g,saveAuxConfigDebounced:ee,ollamaForm:V,kimiForm:J,savingCodex:S,savingOllama:$,savingKimi:Z,probingOllama:K,ollamaKeyDirty:T,kimiKeyDirty:k,fetchCodexStatus:Ve,ollamaStatus:ce,ollamaStatusLoadFailed:te,ollamaModels:de,ollamaSelectedModel:Ne,reloading:X,settingModel:be,kimiStatus:q,kimiStatusLoadFailed:z,kimiModels:se,kimiSelectedModel:fe,reloadingKimi:y,settingKimiModel:P,codexLoading:U,codexError:oe,codexData:ae,refreshing:le,editingLabel:he,labelValue:pe,contextWindows:R,contextWindowsLoading:C,contextWindowsError:O,contextBudgetRows:F,activeClampRows:E,activeContextBudget:M,clearingClamp:A,contextPolicyDirty:x,deviceState:ue,deviceLoading:re,deviceInfo:_e,deviceResult:ve,deviceError:we,fetchAll:Te,fetchLLMStatus:Le,fetchOllamaStatus:Et,fetchKimiStatus:ks,switchProvider:$t,reloadOllama:zt,setOllamaModel:rs,reloadKimi:sa,setKimiModel:Zs,probeOllamaModels:Js,saveCodexConfig:Ns,saveOllamaConfig:Ss,saveKimiConfig:Lt,saveCodexAdvancedConfig:Mn,saveOllamaAdvancedConfig:Fn,saveKimiAdvancedConfig:Xe,saveCodexConfigDebounced:Ds,saveOllamaConfigDebounced:ke,saveKimiConfigDebounced:$e,saveCodexConfigNow:Je,saveOllamaConfigNow:wt,saveKimiConfigNow:ut,saveCodexAdvancedConfigNow:$n,saveOllamaAdvancedConfigNow:js,saveKimiAdvancedConfigNow:mi,activateAccount:Ia,refreshAccount:na,startEditLabel:Bn,saveLabel:Un,deleteAccount:Ys,startDeviceLogin:dn,cancelDeviceLogin:Oa,formatSize:ge,fetchContextWindows:Ke,clearContextClamp:vi,setContextOverride:rt,setContextUtilization:Qe,resetContextOverride:ie,overrideAboveFloor:Ot,formatCount:Se,formatContextCeiling:Oe,formatExpiry:Me,shortAccountKey:dt,provenanceClass:_t,formatDensity:st}}},fp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function bS(e){return fp[e]||fp[(e||"").toLowerCase()]||"text-gray-400"}const yS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),n=f({}),a=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=G(()=>{var C;return Object.values(((C=i.value)==null?void 0:C.totals)||{}).reduce((O,A)=>O+Number(A||0),0)}),u=f(""),p=f(0),h=f([]),m=G(()=>h.value.map(C=>`${C.label} (${C.path}${C.reason?`: ${C.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let w=null;async function L(){var N;const C=await Promise.allSettled(v.map(F=>j.get(F.path))),O=F=>C[F].status==="fulfilled"?C[F].value:null;t.value=O(0)||{};const A=O(1);s.value=Array.isArray(A)?A:A&&A.subsystems||[],n.value=O(2)||{},a.value=O(3)||{},i.value=O(4),l.value=O(5),o.value=O(6),r.value=O(7),c.value=O(8);const x=C.filter(F=>F.status==="rejected");if(h.value=C.flatMap((F,E)=>{var M;return F.status==="rejected"?[{...v[E],reason:((M=F.reason)==null?void 0:M.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===C.length){const F=(N=x[0])==null?void 0:N.reason;u.value=(F==null?void 0:F.message)||"Failed to load internals"}else u.value="";e.value=!1}function _(){e.value=!0,u.value="",L()}let g=!1;function b(){g||(g=!0,L(),w||(w=setInterval(L,3e4)))}function R(){g&&(g=!1,w&&(clearInterval(w),w=null))}return je(b),Qt(b),Gt(R),ft(R),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:_,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:bS,formatAgeSeconds:Bw}}},xS=1e4,hp=3e4;function ki(e,t){return Math.max(0,e-t)}function Sr(e,t){return new Set((e.operations||[]).map(n=>n.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const _S=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],wS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),n=f(!1),a=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const k=++p;n.value=!0;try{const S=await j.get("/api/turn-state/turns?limit=100");if(k!==p)return;t.value=S.availability,e.value=S.availability==="available"?S.data:null,s.value=null,a.value=Date.now()}catch(S){if(k!==p)return;s.value=S.message||"Turn-state read failed",S.status===503&&(t.value="unavailable")}k===p&&(n.value=!1)}async function v(){const k=++h;r.value=!0;try{const S=await j.get("/api/turn-state/capacity-breakers");if(k!==h)return;l.value=S.availability,i.value=S.availability==="available"?S.data:null,o.value=null,c.value=Date.now()}catch(S){if(k!==h)return;o.value=S.message||"Breaker read failed",S.status===503&&(l.value="unavailable")}k===h&&(r.value=!1)}function w(){m(),v()}const L=G(()=>e.value!==null&&ki(d.value,a.value)>hp),_=G(()=>i.value!==null&&ki(d.value,c.value)>hp),g=G(()=>L.value||_.value),b=G(()=>Math.round(ki(d.value,a.value)/1e3)),R=G(()=>Math.round(ki(d.value,c.value)/1e3));function C(k){return Sr(k,d.value/1e3)}function O(k){return _S[C(k)]}const A=G(()=>{var $;const k=[...(($=e.value)==null?void 0:$.turns)||[]],S=d.value/1e3;return k.sort((Z,K)=>Sr(Z,S)-Sr(K,S)||(K.last_progress_at||0)-(Z.last_progress_at||0))});function x(k){return k.state==="closed"?"badge-success":k.state==="probing"?"badge-warning":"badge-danger"}function N(k){if(k.state==="closed")return"—";const S=ki(d.value,c.value)/1e3,$=Math.max(0,(k.cooldown_remaining_seconds||0)-S);return $>0?`${Math.ceil($)}s`:k.state==="probing"?"probe in flight":"probe eligible"}function F(k){if(!k)return"";const S=Math.max(0,Math.round(d.value/1e3-k));if(S<90)return`${S}s ago`;const $=Math.round(S/60);return $<90?`${$}m ago`:`${Math.round($/60)}h ago`}let E=null,M=null,V=!1;function J(){V||(V=!0,w(),E=setInterval(w,xS),u=setInterval(()=>{d.value=Date.now()},1e3),M=Ye.onReconnected(w))}function T(){V&&(V=!1,E&&(clearInterval(E),E=null),u&&(clearInterval(u),u=null),M&&(M(),M=null))}return je(J),Qt(J),Gt(T),ft(T),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:n,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:L,breakersStale:_,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:R,sortedTurns:A,priorityOf:C,priorityBadge:O,breakerBadge:x,cooldownLabel:N,ageLabel:F,fetchTurns:m,fetchBreakers:v,refreshAll:w,arm:J,disarm:T}}},kS={setup(){const e=f(""),t=f(""),s=f(!1),n=f(""),a=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await j.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await j.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return je(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},mp=e=>JSON.parse(JSON.stringify(e)),SS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),TS={emits:["saved"],template:`
    <section class="hm-card computer-provisioning" aria-labelledby="computer-provisioning-title">
      <div class="section-card-header">
        <div>
          <h2 id="computer-provisioning-title" class="text-sm font-semibold text-gray-300">Computer provisioning</h2>
          <p class="page-lede">Edit desired target, storage and launcher policy. All settings below require an Odin restart. Startup values remain pinned, even across disable/enable cycles.</p>
        </div>
        <span class="badge badge-warning">Restart required</span>
      </div>
      <p class="page-lede mb-3">Saving does not install dependencies, create storage, grant OS permissions, attach to a desktop or restart Odin. Enable/disable and Stop session are separate lifecycle controls above.</p>
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
    </section>`,setup(e,{emit:t}){const s=f([]),n=f({}),a=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(T,k)=>p&&h===T&&j.token===k,w=T=>"computer-provisioning-"+T.key,L=T=>T===null?"Unset":T===""?"Empty":JSON.stringify(T),_=T=>{const k=a.value[T.key];return T.type==="array"?String(k||"").split(/\r?\n/).map(S=>S.trim()).filter(Boolean):["integer","number"].includes(T.type)?k===""||k==null?null:Number(k):k},g=G(()=>s.value.map(T=>({...T,value:_(T)})).filter(T=>!SS(T.value,n.value[T.key]))),b=G(()=>s.value.filter(T=>T.pending_restart).map(T=>T.label)),R=G(()=>s.value.some(T=>T.apply_state==="unknown")),C=G(()=>{const T={};for(const k of s.value){const S=_(k),$=k.constraints||{};["integer","number"].includes(k.type)&&(S===null&&!k.nullable?T[k.key]="A number is required.":S!==null&&(!Number.isFinite(S)||k.type==="integer"&&!Number.isInteger(S)||$.minimum!=null&&S<$.minimum||$.maximum!=null&&S>$.maximum)&&(T[k.key]="Enter a number within the allowed range.")),k.key==="monitor_names"&&(S.length>16||new Set(S).size!==S.length||S.some(Z=>!/^[A-Za-z0-9_.-]{1,64}$/.test(Z)))&&(T[k.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return T}),O=G(()=>Object.keys(C.value).length>0);function A(T,k){a.value[T.key]=k,u.value=""}function x(){a.value=Object.fromEntries(s.value.map(T=>[T.key,T.type==="array"?n.value[T.key].join(`
`):n.value[T.key]])),r.value=!1}async function N(T,k){const[S,$]=await Promise.all([j.get("/api/config"),j.get("/api/config/meta")]);if(!v(T,k))return!1;const Z=($.fields||[]).filter(K=>/^computer\.[^.]+$/.test(K.path)&&K.path!=="computer.enabled"&&K.sensitivity==="public"&&K.apply_mode==="restart");if(!S.computer||!Z.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=Z.map(K=>({...K,key:K.path.split(".")[1]})),n.value=Object.fromEntries(s.value.map(K=>[K.key,mp(S.computer[K.key])])),x(),m=k,i.value=!0,c.value=!1,!0}async function F(){if(!p||l.value||o.value)return;const T=++h,k=j.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await N(T,k)}catch(S){v(T,k)&&(c.value=!0,d.value=S.message||"Could not load provisioning. No changes were sent.")}finally{v(T,k)&&(l.value=!1)}}function E(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!O.value&&(r.value=!0)}async function M(){if(!p||!i.value||!r.value||o.value||l.value||c.value||O.value||!g.value.length)return;if(m!==j.token){J(),V();return}const T={computer:Object.fromEntries(g.value.map(Z=>[Z.key,mp(Z.value)]))},k=h,S=j.token;o.value=!0,d.value="",u.value="";let $=!1;try{if(await j.put("/api/config",T),$=!0,!v(k,S))return;await N(k,S)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(Z){v(k,S)&&(c.value=!0,r.value=!1,d.value=$?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${Z.status===400?": "+Z.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(k,S)&&(o.value=!1)}}function V(){p||(p=!0,F())}function J(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],n.value={},a.value={},d.value="",u.value=""}return je(V),Qt(V),Gt(J),ft(J),{fields:s,original:n,draft:a,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:R,changes:g,validation:C,invalid:O,fieldId:w,format:L,edit:A,discard:x,load:F,openReview:E,save:M}}},CS={components:{ComputerProvisioning:TS},template:`
    <div class="p-6 page-fade-in computer-page" role="region" aria-labelledby="computer-title">
      <header class="page-header mb-4">
        <div class="page-header-copy">
          <h1 id="computer-title" class="text-xl font-semibold">Computer operator</h1>
          <p class="page-lede">Private session inspection. This page does not send mouse or keyboard input.</p>
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
      </div>
      <div class="hm-card computer-status-card mb-4" role="status" aria-live="polite">
        <div>
          <div class="section-eyebrow">Current session</div>
          <div class="computer-state">{{ status.state || 'unknown' }}</div>
        </div>
        <span class="badge badge-info">{{ loading ? 'Checking status' : 'Session status' }}</span>
      </div>
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
        <p class="page-lede">Eligibility evidence does not replace current portal consent, source mapping or application checks. Opening this page runs no input probe.</p>
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
      <div v-if="status.state === 'paused'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Agent input is revoked. This inspector does not provide remote mouse or keyboard control. Resume requires a renewed generation and fresh evidence.</div>
      <div v-if="status.state === 'unknown'" class="hm-card border-amber-900 text-sm text-amber-300" role="status">Outcome is unknown. Refresh status; do not replay the last action.</div>
      <section v-if="status.recovery" class="hm-card" aria-labelledby="computer-recovery-title">
        <div class="section-card-header">
          <h2 id="computer-recovery-title" class="text-sm font-semibold text-gray-300">Recovery evidence</h2>
          <span class="badge" :class="status.recovery.complete ? 'badge-success' : 'badge-warning'">{{ status.recovery.complete ? 'Verified' : 'Review required' }}</span>
        </div>
        <p>{{ status.recovery.status }}: {{ status.recovery.reason }}. Cleanup {{ status.recovery.complete ? 'verified' : 'not verified' }}.</p>
        <p class="page-lede">Reconciliation only inspects the recorded workload. It never sends input, terminates applications or replays actions.</p>
        <button v-if="status.state === 'quarantined'" class="btn btn-ghost btn-touch mt-3" @click="recover" :disabled="recovering || !adminReady">{{ recovering ? 'Checking recorded workload…' : 'Reconcile recorded workload' }}</button>
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
            <button class="btn btn-primary btn-touch" @click="observe" :disabled="observing || !status.available"><odin-icon name="eye" :size="15" /> {{ observing ? 'Observing…' : 'Observe / view frame' }}</button>
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
            <button class="btn btn-primary btn-touch" type="submit" :disabled="exporting || !status.available">{{ exporting ? 'Preparing…' : 'Prepare export' }}</button>
          </div>
        </form>
        <div v-if="artifact" class="artifact-row mt-4">
          <button class="btn btn-ghost btn-touch" @click="download" :disabled="downloading"><odin-icon name="download" :size="15" /> Download {{ artifact.name }}</button>
          <span class="text-xs text-gray-500">Expires {{ artifact.expires_at }}</span>
        </div>
      </section>
      </div>
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),n=f(!1),a=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(null),p=f(""),h=f(!1),m=f(Date.now()),v=f(""),w=f(null);let L=0,_=null,g=!1,b=j.token,R=0;const C=z=>z===!0?"Enabled":z===!1?"Disabled":"Unknown",O=G(()=>{var z;return((z=e.value.backend)==null?void 0:z.environment)==="existing_session"}),A=G(()=>{var se;const z=Date.parse(((se=e.value.accessibility)==null?void 0:se.checked_at)||"");return Number.isFinite(z)&&m.value-z<15e3&&m.value>=z-5e3}),x=G(()=>{var z;return A.value?C((z=e.value.accessibility)==null?void 0:z.enabled):"Unknown / not current"}),N=G(()=>{var z;return A.value?((z=e.value.accessibility)==null?void 0:z.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),F=G(()=>Object.entries(e.value.input_limits||{}).filter(([,z])=>typeof z=="number"&&Number.isFinite(z)).map(([z,se])=>`${z}: ${se}`).join(", ")),E=G(()=>{var se;const z=(se=e.value.application_provenance)==null?void 0:se.script_identity;return typeof z=="string"?z:!z||typeof z!="object"?"Not observed":`${z.interpreter_basename||"Unknown interpreter"}; argv digest ${z.argv_digest||"not recorded"}; ${z.verified===!0?"verified":"not verified"}`}),M=G(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(z=>z&&typeof z.id=="string"&&typeof z.label=="string"&&["supported","capture_only"].includes(z.input)).slice(0,16):[]),V=G(()=>{const z=e.value.restart_required;return Array.isArray(z)?z.length?z.join(", "):"None reported":z===!0?"Pending; restart required":z===!1?"None reported":"Unknown"}),J=G(()=>{var se,fe;const z=Date.parse(((se=u.value)==null?void 0:se.captured_at)||"");return Number.isFinite(z)&&m.value<z+Math.min(1e4,((fe=u.value)==null?void 0:fe.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function T(){p.value&&URL.revokeObjectURL(p.value),p.value="",u.value=null}function k(){L++,T(),w.value=null,s.value=!1,i.value=!1,l.value=!1}function S(z,se){return g&&z===L&&se===j.token}function $(z){k(),c.value=!1;const se=z.status||(z.name==="AuthError"?401:0);e.value={available:!1,state:se===503?"unavailable":"unknown"},o.value=se===401||se===403||se===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":se===410?"Evidence or artifact expired. Observe or prepare the export again.":se===503?"Computer use is disabled or unavailable.":"Request failed; outcome unknown. Refresh status. No action was replayed."}async function Z(){if(t.value||r.value||n.value||a.value||d.value||!g)return;const z=L,se=j.token;t.value=!0,R=Date.now();try{const fe=await j.get("/api/computer");if(!S(z,se))return;K(fe)}catch(fe){S(z,se)&&$(fe)}finally{t.value=!1}}function K(z){(e.value.session_id&&e.value.session_id!==z.session_id||e.value.generation!=null&&e.value.generation!==z.generation||e.value.session_generation!=null&&e.value.session_generation!==z.session_generation)&&k(),e.value=z,c.value=!0,o.value=""}async function Y(z){if(!g||!c.value||r.value||n.value||a.value)return;k();const se=L,fe=j.token;r.value=!0;try{if(await j.post("/api/computer/enabled",{enabled:z}),!S(se,fe))return;const y=await j.get("/api/computer");S(se,fe)&&K(y)}catch(y){S(se,fe)&&$(y)}finally{r.value=!1}}async function ce(z){k();const se=L,fe=j.token,y=z==="stop"?n:a;y.value=!0;try{const P=await j.post("/api/computer/"+z,{});if(S(se,fe)){e.value={...e.value,...P};const U=await j.get("/api/computer");S(se,fe)&&K(U)}}catch(P){S(se,fe)&&$(P)}finally{y.value=!1}}async function te(){if(!g||!c.value||d.value||e.value.state!=="quarantined")return;const z={session_id:e.value.session_id,generation:e.value.session_generation};if(!z.session_id||!Number.isInteger(z.generation))return;k();const se=L,fe=j.token;d.value=!0;try{const y=await j.post("/api/computer/recover",z);S(se,fe)&&K(y)}catch(y){S(se,fe)&&$(y)}finally{d.value=!1}}async function de(){var fe;T(),h.value=!1;const z=L,se=j.token;s.value=!0;try{const y=await j.post("/api/computer/observe",{});if(!S(z,se))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((fe=y.frame)==null?void 0:fe.evidence_id)||""))throw new Error("Invalid evidence");const P=await j.getBlob("/api/computer/evidence/"+y.frame.evidence_id);if(!S(z,se))return;if(!["image/png","image/jpeg"].includes(P.type)||P.size>2097152||!Number.isFinite(Date.parse(y.frame.expires_at))||Date.parse(y.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");u.value=y.frame,p.value=URL.createObjectURL(P),o.value=""}catch(y){S(z,se)&&$(y)}finally{z===L&&(s.value=!1)}}async function Ne(){w.value=null;const z=L,se=j.token;i.value=!0;try{const fe=await j.post("/api/computer/export",{name:v.value});S(z,se)&&(w.value=fe,o.value="")}catch(fe){S(z,se)&&$(fe)}finally{z===L&&(i.value=!1)}}async function X(){const z=L,se=j.token,fe=w.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((fe==null?void 0:fe.artifact_id)||""))throw new Error("Invalid export");const y=await j.getBlob("/api/computer/download/"+fe.artifact_id);if(!S(z,se))return;const P=URL.createObjectURL(y),U=document.createElement("a");U.href=P,U.download=fe.name,U.click(),setTimeout(()=>URL.revokeObjectURL(P),1e3)}catch(y){S(z,se)&&$(y)}finally{z===L&&(l.value=!1)}}function be(){g||(g=!0,Z(),_=setInterval(()=>{m.value=Date.now(),b!==j.token&&(b=j.token,k(),c.value=!1,e.value={state:"unknown",available:!1}),u.value&&Date.parse(u.value.expires_at)<=m.value&&(T(),h.value=!0),w.value&&Date.parse(w.value.expires_at)<=m.value&&(w.value=null),m.value-R>=5e3&&Z()},500))}function q(){g=!1,clearInterval(_),_=null,k(),c.value=!1}return je(be),Qt(be),Gt(q),ft(q),{status:e,loading:t,observing:s,stopping:n,pausing:a,exporting:i,downloading:l,error:o,frame:u,frameUrl:p,frameExpired:h,freshness:J,name:v,artifact:w,refresh:Z,control:ce,observe:de,clearFrame:T,exportFile:Ne,download:X,toggling:r,adminReady:c,enabledLabel:C,restartSettings:V,setEnabled:Y,recovering:d,recover:te,applicationProfiles:M,attached:O,scriptIdentity:E,inputLimits:F,accessibilityLabel:x,accessibilityDetail:N}}},lv=[{id:"health",label:"Health",component:Ok},{id:"resources",label:"Resources",component:Lk},{id:"logs",label:"Logs",component:Vk},{id:"config",label:"Config",component:sS},{id:"discord",label:"Discord",component:aS},{id:"hosts",label:"Hosts",component:oS},{id:"host-access",label:"Host Access",component:lS},{id:"api-tokens",label:"API Tokens",component:rS},{id:"llm",label:"LLM Config",component:gS},{id:"internals",label:"Internals",component:yS},{id:"turn-state",label:"Turn State",component:wS},{id:"computer",label:"Computer",component:CS},{id:"update",label:"Update",component:kS}],ES={components:{TabbedPage:Yo},setup(){return{tabs:lv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Fl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),AS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Fl("Operations","operations","/operations",Ym),...Fl("History","history","/history",Qm),...Fl("Capabilities","capabilities","/capabilities",Xm),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Fl("System","system","/system",lv)],bs=ea({open:!1,query:"",selected:0});function vp(){bs.query="",bs.selected=0,bs.open=!0}function Tr(){bs.open=!1}function RS(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const IS={setup(){const e=jm(),t=f(null),s=G(()=>{const i=bs.query.trim().toLowerCase();return AS.map(l=>({...l,_score:RS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Mt(()=>bs.open,async i=>{var l;i&&(await Rt(),(l=t.value)==null||l.focus())}),Mt(()=>bs.query,()=>{bs.selected=0});function n(i){Tr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Tr();return}if(i.key==="ArrowDown")i.preventDefault(),bs.selected=Math.min(bs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),bs.selected=Math.max(bs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[bs.selected];l&&n(l)}}return{state:bs,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Tr}},template:`
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
  `},uc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(uc));const OS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>si("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[si("path",{d:uc[e.name]||uc.info})])}},LS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function gp(e){return[...e.querySelectorAll(LS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const NS={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=gp(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||gp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},DS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),n=f([]),a=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=G(()=>{const Z=e.value.uptime_seconds||0,K=Math.floor(Z/86400),Y=Math.floor(Z%86400/3600),ce=Math.floor(Z%3600/60),te=[];return K>0&&te.push(`${K}d`),Y>0&&te.push(`${Y}h`),(te.length===0||K===0&&Y===0)&&te.push(`${ce}m`),te.join(" ")}),m=G(()=>{const Z=e.value.uptime_seconds||0;return 125.66*(1-Math.min(Z/86400,1))}),v=G(()=>{const Z=e.value;return[{label:"Guilds",value:Z.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:Z.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:Z.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${Z.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:Z.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:Z.loop_count>0?"text-green-400":"",highlight:Z.loop_count>0},{label:"Agents",value:Z.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:Z.agent_count>0?`${Z.agent_count} total`:"",subColor:"text-gray-500",highlight:(Z.agent_running??0)>0},{label:"Processes",value:Z.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:Z.process_count>0?`${Z.process_count} total`:"",subColor:"text-gray-500",highlight:(Z.process_running??0)>0},{label:"Schedules",value:Z.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(Z.schedule_failing>0?`${Z.schedule_failing} failing`:"")+(Z.schedule_failing>0&&Z.schedule_paused>0?", ":"")+(Z.schedule_paused>0?`${Z.schedule_paused} paused`:"")||void 0,subColor:Z.schedule_failing>0?"text-red-400":"text-yellow-400",color:Z.schedule_failing>0?"text-red-400":"",highlight:Z.schedule_failing>0},{label:"Users",value:Z.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),w=G(()=>{const Z=e.value,K=[];return K.push({label:"Bot",status:Z.status==="online"?"ok":"warn",detail:Z.status==="online"?"Online":"Starting"}),(Z.schedule_failing||0)>0?K.push({label:"Schedules",status:"error",detail:`${Z.schedule_failing} failing`}):(Z.schedule_count||0)>0&&K.push({label:"Schedules",status:"ok",detail:`${Z.schedule_count} configured`}),(Z.loop_count||0)>0&&K.push({label:"Loops",status:"ok",detail:`${Z.loop_count} active`}),(Z.agent_running||0)>0&&K.push({label:"Agents",status:"ok",detail:`${Z.agent_running} running`}),(Z.process_running||0)>0&&K.push({label:"Processes",status:"ok",detail:`${Z.process_running} running`}),K});async function L(){try{e.value=await j.get("/api/status"),s.value=null}catch(Z){s.value=Z.message}finally{t.value=!1}}let _=0,g=0,b=0,R=0;function C(Z,K){const Y=new Set;return[...K,...Z].filter(ce=>{const te=ce._hmac||JSON.stringify([ce.timestamp,ce.tool_name,ce.user_id,ce.result_summary,ce.error]);return Y.has(te)?!1:(Y.add(te),!0)})}async function O(){const Z=++_,K=b;a.value=!0;try{const Y=await j.get("/api/audit?limit=10");if(Z!==_)return;const ce=K===b?[]:n.value.filter(te=>(te._liveEpoch||0)>K);n.value=C(Y,ce).slice(0,10),c.value=ce.length}catch{}Z===_&&(a.value=!1)}async function A(){const Z=++g,K=R;l.value=!0;try{const Y=await j.get("/api/audit?error_only=1&limit=5");if(Z!==g)return;const ce=K===R?[]:i.value.filter(te=>(te._liveErrorEpoch||0)>K);i.value=C(Y,ce).slice(0,5),o.value=!1}catch{if(Z!==g)return;o.value=K===R||i.value.length===0}Z===g&&(l.value=!1)}async function x(){try{const Z=await j.get("/api/knowledge");d.value=(Array.isArray(Z)?Z:[]).reduce((K,Y)=>K+(Y.chunks||0),0)}catch{d.value=null}}async function N(){try{const Z=await j.get("/api/agents");r.value=Z.filter(K=>K.status==="running")}catch{}}async function F(){u.value={...u.value,reload:!0};try{await j.post("/api/reload"),xe.success("Config reloaded")}catch(Z){xe.error(Z.message)}u.value={...u.value,reload:!1}}async function E(){if(!await qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const K=e.value.session_count;e.value={...e.value,session_count:0};try{const Y=await j.post("/api/sessions/clear-all");xe.success(`Cleared ${Y.count} session${Y.count!==1?"s":""}`),await L()}catch(Y){e.value={...e.value,session_count:K},xe.error(Y.message)}u.value={...u.value,clearSessions:!1}}async function M(){if(!await qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const K=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Y=await j.post("/api/loops/stop-all");xe.success(Y.result),await L()}catch(Y){e.value={...e.value,loop_count:K},xe.error(Y.message)}u.value={...u.value,stopLoops:!1}}function V(){t.value=!0,s.value=null,L(),O(),A(),N()}let J=null,T=null,k=null;function S(Z){if(Z.payload&&Z.payload.tool_name){b+=1;const K={...Z.payload,_isNew:!0,_key:++p,_liveEpoch:b};n.value.unshift(K),n.value.length>10&&n.value.pop(),c.value++,K.error&&(R+=1,K._liveErrorEpoch=R,o.value=!1,i.value.unshift(K),i.value.length>5&&i.value.pop()),setTimeout(()=>{K._isNew=!1},1500),clearTimeout(k),k=setTimeout(()=>{c.value=0},1e4)}}let $=null;return je(async()=>{await Promise.all([L(),O(),A(),N(),x()]),J=setInterval(L,15e3),T=setInterval(N,1e4),Ye.subscribe("events",S),$=Ye.onReconnected(()=>{O(),A()})}),ft(()=>{J&&clearInterval(J),T&&clearInterval(T),clearTimeout(k),Ye.unsubscribe("events",S),$&&($(),$=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:w,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:O,fetchErrors:A,fetchStatus:L,onEvent:S,formatTime:$w,formatDuration:ui,retry:V,reloadConfig:F,clearSessions:E,stopAllLoops:M}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function bp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function PS(e){if(Array.isArray(e))return e}function MS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function FS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function $S(e,t){return PS(e)||MS(e,t)||BS(e,t)||FS()}function BS(e,t){if(e){if(typeof e=="string")return bp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?bp(e,t):void 0}}const ov=Object.entries,yp=Object.setPrototypeOf,US=Object.isFrozen,HS=Object.getPrototypeOf,zS=Object.getOwnPropertyDescriptor;let ms=Object.freeze,zs=Object.seal,Ha=Object.create,rv=typeof Reflect<"u"&&Reflect,pc=rv.apply,fc=rv.construct;ms||(ms=function(t){return t});zs||(zs=function(t){return t});pc||(pc=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});fc||(fc=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const vn=Ft(Array.prototype.forEach),jS=Ft(Array.prototype.lastIndexOf),xp=Ft(Array.prototype.pop),Ma=Ft(Array.prototype.push),VS=Ft(Array.prototype.splice),ds=Array.isArray,Oi=Ft(String.prototype.toLowerCase),Cr=Ft(String.prototype.toString),_p=Ft(String.prototype.match),Fa=Ft(String.prototype.replace),wp=Ft(String.prototype.indexOf),qS=Ft(String.prototype.trim),GS=Ft(Number.prototype.toString),KS=Ft(Boolean.prototype.toString),kp=typeof BigInt>"u"?null:Ft(BigInt.prototype.toString),Sp=typeof Symbol>"u"?null:Ft(Symbol.prototype.toString),St=Ft(Object.prototype.hasOwnProperty),Si=Ft(Object.prototype.toString),Kt=Ft(RegExp.prototype.test),oa=WS(TypeError);function Ft(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return pc(e,t,n)}}function WS(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return fc(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Oi;if(yp&&yp(e,null),!ds(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(US(t)||(t[n]=i),a=i)}e[a]=!0}return e}function JS(e){for(let t=0;t<e.length;t++)St(e,t)||(e[t]=null);return e}function ss(e){const t=Ha(null);for(const n of ov(e)){var s=$S(n,2);const a=s[0],i=s[1];St(e,a)&&(ds(i)?t[a]=JS(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=ss(i):t[a]=i)}return t}function ZS(e){switch(typeof e){case"string":return e;case"number":return GS(e);case"boolean":return KS(e);case"bigint":return kp?kp(e):"0";case"symbol":return Sp?Sp(e):"Symbol()";case"undefined":return Si(e);case"function":case"object":{if(e===null)return Si(e);const t=e,s=en(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Si(n)}return Si(e)}default:return Si(e)}}function en(e,t){for(;e!==null;){const n=zS(e,t);if(n){if(n.get)return Ft(n.get);if(typeof n.value=="function")return Ft(n.value)}e=HS(e)}function s(){return null}return s}function YS(e){try{return Kt(e,""),!0}catch{return!1}}const Tp=ms(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Er=ms(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Ar=ms(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),QS=ms(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Rr=ms(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),XS=ms(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Cp=ms(["#text"]),Ep=ms(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Ir=ms(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Ap=ms(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),$l=ms(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),e1=zs(/{{[\w\W]*|^[\w\W]*}}/g),t1=zs(/<%[\w\W]*|^[\w\W]*%>/g),s1=zs(/\${[\w\W]*/g),n1=zs(/^data-[\-\w.\u00B7-\uFFFF]+$/),a1=zs(/^aria-[\-\w]+$/),Rp=zs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),i1=zs(/^(?:\w+script|data):/i),l1=zs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),o1=zs(/^html$/i),r1=zs(/^[a-z][.\w]*(-[.\w]+)+$/i),Qs={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},c1=function(){return typeof window>"u"?null:window},d1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Ip=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function cv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:c1();const t=Ce=>cv(Ce);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Qs.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=en(p,"cloneNode"),m=en(p,"remove"),v=en(p,"nextSibling"),w=en(p,"childNodes"),L=en(p,"parentNode"),_=en(p,"shadowRoot"),g=en(p,"attributes"),b=l&&l.prototype?en(l.prototype,"nodeType"):null,R=l&&l.prototype?en(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ce=s.createElement("template");Ce.content&&Ce.content.ownerDocument&&(s=Ce.content.ownerDocument)}let C,O="",A,x=!1,N=0;const F=function(){if(N>0)throw oa('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},E=function(D){F(),N++;try{return C.createHTML(D)}finally{N--}},M=function(D){F(),N++;try{return C.createScriptURL(D)}finally{N--}},V=function(){return x||(A=d1(u,a),x=!0),A},J=s,T=J.implementation,k=J.createNodeIterator,S=J.createDocumentFragment,$=J.getElementsByTagName,Z=n.importNode;let K=Ip();t.isSupported=typeof ov=="function"&&typeof L=="function"&&T&&T.createHTMLDocument!==void 0;const Y=e1,ce=t1,te=s1,de=n1,Ne=a1,X=i1,be=l1,q=r1;let z=Rp,se=null;const fe=ze({},[...Tp,...Er,...Ar,...Rr,...Cp]);let y=null;const P=ze({},[...Ep,...Ir,...Ap,...$l]);let U=Object.seal(Ha(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),oe=null,ae=null;const le=Object.seal(Ha(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let he=!0,pe=!0,ue=!1,re=!0,_e=!1,ve=!0,we=!1,Ie=!1,B=!1,ge=!1,Se=!1,Oe=!1,Me=!0,dt=!1;const st="user-content-";let _t=!0,Ot=!1,rt={},Qe=null;const ie=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Te=null;const Le=ze({},["audio","video","img","source","image","track"]);let Ke=null;const Et=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ve="http://www.w3.org/1998/Math/MathML",$t="http://www.w3.org/2000/svg",zt="http://www.w3.org/1999/xhtml";let rs=zt,Js=!1,ks=null;const sa=ze({},[Ve,$t,zt],Cr);let Zs=ze({},["mi","mo","mn","ms","mtext"]),Ns=ze({},["annotation-xml"]);const Mn=ze({},["title","style","font","a","script"]);let Ss=null;const Fn=["application/xhtml+xml","text/html"],Lt="text/html";let Xe=null,Ts=null;const Ds=s.createElement("form"),ee=function(D){return D instanceof RegExp||D instanceof Function},ke=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ts&&Ts===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),Ss=Fn.indexOf(D.PARSER_MEDIA_TYPE)===-1?Lt:D.PARSER_MEDIA_TYPE,Xe=Ss==="application/xhtml+xml"?Cr:Oi,se=St(D,"ALLOWED_TAGS")&&ds(D.ALLOWED_TAGS)?ze({},D.ALLOWED_TAGS,Xe):fe,y=St(D,"ALLOWED_ATTR")&&ds(D.ALLOWED_ATTR)?ze({},D.ALLOWED_ATTR,Xe):P,ks=St(D,"ALLOWED_NAMESPACES")&&ds(D.ALLOWED_NAMESPACES)?ze({},D.ALLOWED_NAMESPACES,Cr):sa,Ke=St(D,"ADD_URI_SAFE_ATTR")&&ds(D.ADD_URI_SAFE_ATTR)?ze(ss(Et),D.ADD_URI_SAFE_ATTR,Xe):Et,Te=St(D,"ADD_DATA_URI_TAGS")&&ds(D.ADD_DATA_URI_TAGS)?ze(ss(Le),D.ADD_DATA_URI_TAGS,Xe):Le,Qe=St(D,"FORBID_CONTENTS")&&ds(D.FORBID_CONTENTS)?ze({},D.FORBID_CONTENTS,Xe):ie,oe=St(D,"FORBID_TAGS")&&ds(D.FORBID_TAGS)?ze({},D.FORBID_TAGS,Xe):ss({}),ae=St(D,"FORBID_ATTR")&&ds(D.FORBID_ATTR)?ze({},D.FORBID_ATTR,Xe):ss({}),rt=St(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,he=D.ALLOW_ARIA_ATTR!==!1,pe=D.ALLOW_DATA_ATTR!==!1,ue=D.ALLOW_UNKNOWN_PROTOCOLS||!1,re=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,_e=D.SAFE_FOR_TEMPLATES||!1,ve=D.SAFE_FOR_XML!==!1,we=D.WHOLE_DOCUMENT||!1,ge=D.RETURN_DOM||!1,Se=D.RETURN_DOM_FRAGMENT||!1,Oe=D.RETURN_TRUSTED_TYPE||!1,B=D.FORCE_BODY||!1,Me=D.SANITIZE_DOM!==!1,dt=D.SANITIZE_NAMED_PROPS||!1,_t=D.KEEP_CONTENT!==!1,Ot=D.IN_PLACE||!1,z=YS(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Rp,rs=typeof D.NAMESPACE=="string"?D.NAMESPACE:zt,Zs=St(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),Ns=St(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const ne=St(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Ha(null);if(U=Ha(null),St(ne,"tagNameCheck")&&ee(ne.tagNameCheck)&&(U.tagNameCheck=ne.tagNameCheck),St(ne,"attributeNameCheck")&&ee(ne.attributeNameCheck)&&(U.attributeNameCheck=ne.attributeNameCheck),St(ne,"allowCustomizedBuiltInElements")&&typeof ne.allowCustomizedBuiltInElements=="boolean"&&(U.allowCustomizedBuiltInElements=ne.allowCustomizedBuiltInElements),_e&&(pe=!1),Se&&(ge=!0),rt&&(se=ze({},Cp),y=Ha(null),rt.html===!0&&(ze(se,Tp),ze(y,Ep)),rt.svg===!0&&(ze(se,Er),ze(y,Ir),ze(y,$l)),rt.svgFilters===!0&&(ze(se,Ar),ze(y,Ir),ze(y,$l)),rt.mathMl===!0&&(ze(se,Rr),ze(y,Ap),ze(y,$l))),le.tagCheck=null,le.attributeCheck=null,St(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?le.tagCheck=D.ADD_TAGS:ds(D.ADD_TAGS)&&(se===fe&&(se=ss(se)),ze(se,D.ADD_TAGS,Xe))),St(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?le.attributeCheck=D.ADD_ATTR:ds(D.ADD_ATTR)&&(y===P&&(y=ss(y)),ze(y,D.ADD_ATTR,Xe))),St(D,"ADD_URI_SAFE_ATTR")&&ds(D.ADD_URI_SAFE_ATTR)&&ze(Ke,D.ADD_URI_SAFE_ATTR,Xe),St(D,"FORBID_CONTENTS")&&ds(D.FORBID_CONTENTS)&&(Qe===ie&&(Qe=ss(Qe)),ze(Qe,D.FORBID_CONTENTS,Xe)),St(D,"ADD_FORBID_CONTENTS")&&ds(D.ADD_FORBID_CONTENTS)&&(Qe===ie&&(Qe=ss(Qe)),ze(Qe,D.ADD_FORBID_CONTENTS,Xe)),_t&&(se["#text"]=!0),we&&ze(se,["html","head","body"]),se.table&&(ze(se,["tbody"]),delete oe.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw oa('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw oa('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const me=C;C=D.TRUSTED_TYPES_POLICY;try{O=E("")}catch(De){throw C=me,De}}else D.TRUSTED_TYPES_POLICY===null?(C=void 0,O=""):(C===void 0&&(C=V()),C&&typeof O=="string"&&(O=E("")));(K.uponSanitizeElement.length>0||K.uponSanitizeAttribute.length>0)&&se===fe&&(se=ss(se)),K.uponSanitizeAttribute.length>0&&y===P&&(y=ss(y)),ms&&ms(D),Ts=D},$e=ze({},[...Er,...Ar,...QS]),Je=ze({},[...Rr,...XS]),wt=function(D){let ne=L(D);(!ne||!ne.tagName)&&(ne={namespaceURI:rs,tagName:"template"});const me=Oi(D.tagName),De=Oi(ne.tagName);return ks[D.namespaceURI]?D.namespaceURI===$t?ne.namespaceURI===zt?me==="svg":ne.namespaceURI===Ve?me==="svg"&&(De==="annotation-xml"||Zs[De]):!!$e[me]:D.namespaceURI===Ve?ne.namespaceURI===zt?me==="math":ne.namespaceURI===$t?me==="math"&&Ns[De]:!!Je[me]:D.namespaceURI===zt?ne.namespaceURI===$t&&!Ns[De]||ne.namespaceURI===Ve&&!Zs[De]?!1:!Je[me]&&(Mn[me]||!$e[me]):!!(Ss==="application/xhtml+xml"&&ks[D.namespaceURI]):!1},ut=function(D){Ma(t.removed,{element:D});try{L(D).removeChild(D)}catch{if(m(D),!L(D))throw oa("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},$n=function(D){const ne=w?w(D):D.childNodes;if(ne){const De=[];vn(ne,Fe=>{Ma(De,Fe)}),vn(De,Fe=>{try{m(Fe)}catch{}})}const me=g?g(D):null;if(me)for(let De=me.length-1;De>=0;--De){const Fe=me[De],Ue=Fe&&Fe.name;if(typeof Ue=="string")try{D.removeAttribute(Ue)}catch{}}},js=function(D,ne){try{Ma(t.removed,{attribute:ne.getAttributeNode(D),from:ne})}catch{Ma(t.removed,{attribute:null,from:ne})}if(ne.removeAttribute(D),D==="is")if(ge||Se)try{ut(ne)}catch{}else try{ne.setAttribute(D,"")}catch{}},mi=function(D){const ne=g?g(D):D.attributes;if(ne)for(let me=ne.length-1;me>=0;--me){const De=ne[me],Fe=De&&De.name;if(!(typeof Fe!="string"||y[Xe(Fe)]))try{D.removeAttribute(Fe)}catch{}}},vi=function(D){const ne=[D];for(;ne.length>0;){const me=ne.pop();(b?b(me):me.nodeType)===Qs.element&&mi(me);const Fe=w?w(me):me.childNodes;if(Fe)for(let Ue=Fe.length-1;Ue>=0;--Ue)ne.push(Fe[Ue])}},Ia=function(D){let ne=null,me=null;if(B)D="<remove></remove>"+D;else{const Ue=_p(D,/^[\r\n\t ]+/);me=Ue&&Ue[0]}Ss==="application/xhtml+xml"&&rs===zt&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const De=C?E(D):D;if(rs===zt)try{ne=new d().parseFromString(De,Ss)}catch{}if(!ne||!ne.documentElement){ne=T.createDocument(rs,"template",null);try{ne.documentElement.innerHTML=Js?O:De}catch{}}const Fe=ne.body||ne.documentElement;return D&&me&&Fe.insertBefore(s.createTextNode(me),Fe.childNodes[0]||null),rs===zt?$.call(ne,we?"html":"body")[0]:we?ne.documentElement:Fe},na=function(D){return k.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Bn=function(D){var ne,me;D.normalize();const De=k.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Fe=De.nextNode();for(;Fe;){let yt=Fe.data;vn([Y,ce,te],it=>{yt=Fa(yt,it," ")}),Fe.data=yt,Fe=De.nextNode()}const Ue=(ne=(me=D.querySelectorAll)===null||me===void 0?void 0:me.call(D,"template"))!==null&&ne!==void 0?ne:[];vn(Array.from(Ue),yt=>{Ys(yt.content)&&Bn(yt.content)})},Un=function(D){const ne=R?R(D):null;return typeof ne!="string"||Xe(ne)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==w(D)},Ys=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===Qs.documentFragment}catch{return!1}},dn=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function Xt(Ce,D,ne){vn(Ce,me=>{me.call(t,D,ne,Ts)})}const Oa=function(D){let ne=null;if(Xt(K.beforeSanitizeElements,D,null),Un(D))return ut(D),!0;const me=Xe(R?R(D):D.nodeName);if(Xt(K.uponSanitizeElement,D,{tagName:me,allowedTags:se}),ve&&D.hasChildNodes()&&!dn(D.firstElementChild)&&Kt(/<[/\w!]/g,D.innerHTML)&&Kt(/<[/\w!]/g,D.textContent)||ve&&D.namespaceURI===zt&&me==="style"&&dn(D.firstElementChild)||D.nodeType===Qs.progressingInstruction||ve&&D.nodeType===Qs.comment&&Kt(/<[/\w]/g,D.data))return ut(D),!0;if(oe[me]||!(le.tagCheck instanceof Function&&le.tagCheck(me))&&!se[me]){if(!oe[me]&&Re(me)&&(U.tagNameCheck instanceof RegExp&&Kt(U.tagNameCheck,me)||U.tagNameCheck instanceof Function&&U.tagNameCheck(me)))return!1;if(_t&&!Qe[me]){const Fe=L(D),Ue=w(D);if(Ue&&Fe){const yt=Ue.length;for(let it=yt-1;it>=0;--it){const vt=Ot?Ue[it]:h(Ue[it],!0);Fe.insertBefore(vt,v(D))}}}return ut(D),!0}return(b?b(D):D.nodeType)===Qs.element&&!wt(D)||(me==="noscript"||me==="noembed"||me==="noframes")&&Kt(/<\/no(script|embed|frames)/i,D.innerHTML)?(ut(D),!0):(_e&&D.nodeType===Qs.text&&(ne=D.textContent,vn([Y,ce,te],Fe=>{ne=Fa(ne,Fe," ")}),D.textContent!==ne&&(Ma(t.removed,{element:D.cloneNode()}),D.textContent=ne)),Xt(K.afterSanitizeElements,D,null),!1)},W=function(D,ne,me){if(ae[ne]||Me&&(ne==="id"||ne==="name")&&(me in s||me in Ds))return!1;const De=y[ne]||le.attributeCheck instanceof Function&&le.attributeCheck(ne,D);if(!(pe&&!ae[ne]&&Kt(de,ne))){if(!(he&&Kt(Ne,ne))){if(!De||ae[ne]){if(!(Re(D)&&(U.tagNameCheck instanceof RegExp&&Kt(U.tagNameCheck,D)||U.tagNameCheck instanceof Function&&U.tagNameCheck(D))&&(U.attributeNameCheck instanceof RegExp&&Kt(U.attributeNameCheck,ne)||U.attributeNameCheck instanceof Function&&U.attributeNameCheck(ne,D))||ne==="is"&&U.allowCustomizedBuiltInElements&&(U.tagNameCheck instanceof RegExp&&Kt(U.tagNameCheck,me)||U.tagNameCheck instanceof Function&&U.tagNameCheck(me))))return!1}else if(!Ke[ne]){if(!Kt(z,Fa(me,be,""))){if(!((ne==="src"||ne==="xlink:href"||ne==="href")&&D!=="script"&&wp(me,"data:")===0&&Te[D])){if(!(ue&&!Kt(X,Fa(me,be,"")))){if(me)return!1}}}}}}return!0},ye=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Re=function(D){return!ye[Oi(D)]&&Kt(q,D)},es=function(D){Xt(K.beforeSanitizeAttributes,D,null);const ne=D.attributes;if(!ne||Un(D))return;const me={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:y,forceKeepAttr:void 0};let De=ne.length;for(;De--;){const Fe=ne[De],Ue=Fe.name,yt=Fe.namespaceURI,it=Fe.value,vt=Xe(Ue),I=it;let H=Ue==="value"?I:qS(I);if(me.attrName=vt,me.attrValue=H,me.keepAttr=!0,me.forceKeepAttr=void 0,Xt(K.uponSanitizeAttribute,D,me),H=me.attrValue,dt&&(vt==="id"||vt==="name")&&wp(H,st)!==0&&(js(Ue,D),H=st+H),ve&&Kt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,H)){js(Ue,D);continue}if(vt==="attributename"&&_p(H,"href")){js(Ue,D);continue}if(me.forceKeepAttr)continue;if(!me.keepAttr){js(Ue,D);continue}if(!re&&Kt(/\/>/i,H)){js(Ue,D);continue}_e&&vn([Y,ce,te],Ae=>{H=Fa(H,Ae," ")});const Q=Xe(D.nodeName);if(!W(Q,vt,H)){js(Ue,D);continue}if(C&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!yt)switch(u.getAttributeType(Q,vt)){case"TrustedHTML":{H=E(H);break}case"TrustedScriptURL":{H=M(H);break}}if(H!==I)try{yt?D.setAttributeNS(yt,Ue,H):D.setAttribute(Ue,H),Un(D)?ut(D):xp(t.removed)}catch{js(Ue,D)}}Xt(K.afterSanitizeAttributes,D,null)},un=function(D){let ne=null;const me=na(D);for(Xt(K.beforeSanitizeShadowDOM,D,null);ne=me.nextNode();)if(Xt(K.uponSanitizeShadowNode,ne,null),Oa(ne),es(ne),Ys(ne.content)&&un(ne.content),(b?b(ne):ne.nodeType)===Qs.element){const Fe=_?_(ne):ne.shadowRoot;Ys(Fe)&&(Hn(Fe),un(Fe))}Xt(K.afterSanitizeShadowDOM,D,null)},Hn=function(D){const ne=[{node:D,shadow:null}];for(;ne.length>0;){const me=ne.pop();if(me.shadow){un(me.shadow);continue}const De=me.node,Ue=(b?b(De):De.nodeType)===Qs.element,yt=w?w(De):De.childNodes;if(yt)for(let it=yt.length-1;it>=0;--it)ne.push({node:yt[it],shadow:null});if(Ue){const it=R?R(De):null;if(typeof it=="string"&&Xe(it)==="template"){const vt=De.content;Ys(vt)&&ne.push({node:vt,shadow:null})}}if(Ue){const it=_?_(De):De.shadowRoot;Ys(it)&&ne.push({node:null,shadow:it},{node:it,shadow:null})}}};return t.sanitize=function(Ce){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},ne=null,me=null,De=null,Fe=null;if(Js=!Ce,Js&&(Ce="<!-->"),typeof Ce!="string"&&!dn(Ce)&&(Ce=ZS(Ce),typeof Ce!="string"))throw oa("dirty is not a string, aborting");if(!t.isSupported)return Ce;Ie||ke(D),t.removed=[];const Ue=Ot&&typeof Ce!="string"&&dn(Ce);if(Ue){const vt=R?R(Ce):Ce.nodeName;if(typeof vt=="string"){const I=Xe(vt);if(!se[I]||oe[I])throw oa("root node is forbidden and cannot be sanitized in-place")}if(Un(Ce))throw oa("root node is clobbered and cannot be sanitized in-place");try{Hn(Ce)}catch(I){throw $n(Ce),I}}else if(dn(Ce))ne=Ia("<!---->"),me=ne.ownerDocument.importNode(Ce,!0),me.nodeType===Qs.element&&me.nodeName==="BODY"||me.nodeName==="HTML"?ne=me:ne.appendChild(me),Hn(me);else{if(!ge&&!_e&&!we&&Ce.indexOf("<")===-1)return C&&Oe?E(Ce):Ce;if(ne=Ia(Ce),!ne)return ge?null:Oe?O:""}ne&&B&&ut(ne.firstChild);const yt=na(Ue?Ce:ne);try{for(;De=yt.nextNode();)Oa(De),es(De),Ys(De.content)&&un(De.content)}catch(vt){throw Ue&&$n(Ce),vt}if(Ue)return vn(t.removed,vt=>{vt.element&&vi(vt.element)}),_e&&Bn(Ce),Ce;if(ge){if(_e&&Bn(ne),Se)for(Fe=S.call(ne.ownerDocument);ne.firstChild;)Fe.appendChild(ne.firstChild);else Fe=ne;return(y.shadowroot||y.shadowrootmode)&&(Fe=Z.call(n,Fe,!0)),Fe}let it=we?ne.outerHTML:ne.innerHTML;return we&&se["!doctype"]&&ne.ownerDocument&&ne.ownerDocument.doctype&&ne.ownerDocument.doctype.name&&Kt(o1,ne.ownerDocument.doctype.name)&&(it="<!DOCTYPE "+ne.ownerDocument.doctype.name+`>
`+it),_e&&vn([Y,ce,te],vt=>{it=Fa(it,vt," ")}),C&&Oe?E(it):it},t.setConfig=function(){let Ce=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};ke(Ce),Ie=!0},t.clearConfig=function(){Ts=null,Ie=!1,C=A,O=""},t.isValidAttribute=function(Ce,D,ne){Ts||ke({});const me=Xe(Ce),De=Xe(D);return W(me,De,ne)},t.addHook=function(Ce,D){typeof D=="function"&&Ma(K[Ce],D)},t.removeHook=function(Ce,D){if(D!==void 0){const ne=jS(K[Ce],D);return ne===-1?void 0:VS(K[Ce],ne,1)[0]}return xp(K[Ce])},t.removeHooks=function(Ce){K[Ce]=[]},t.removeAllHooks=function(){K=Ip()},t}var Op=cv();function yd(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ra=yd();function dv(e){Ra=e}var Hi={exec:()=>null};function ot(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(fs.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var fs={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},u1=/^(?:[ \t]*(?:\n|$))+/,p1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,f1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,yl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,h1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,xd=/(?:[*+-]|\d{1,9}[.)])/,uv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,pv=ot(uv).replace(/bull/g,xd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),m1=ot(uv).replace(/bull/g,xd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),_d=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,v1=/^[^\n]+/,wd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,g1=ot(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",wd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),b1=ot(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,xd).getRegex(),er="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",kd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,y1=ot("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",kd).replace("tag",er).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),fv=ot(_d).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",er).getRegex(),x1=ot(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",fv).getRegex(),Sd={blockquote:x1,code:p1,def:g1,fences:f1,heading:h1,hr:yl,html:y1,lheading:pv,list:b1,newline:u1,paragraph:fv,table:Hi,text:v1},Lp=ot("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",er).getRegex(),_1={...Sd,lheading:m1,table:Lp,paragraph:ot(_d).replace("hr",yl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Lp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",er).getRegex()},w1={...Sd,html:ot(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",kd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Hi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ot(_d).replace("hr",yl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",pv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},k1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,S1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,hv=/^( {2,}|\\)\n(?!\s*$)/,T1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,tr=/[\p{P}\p{S}]/u,Td=/[\s\p{P}\p{S}]/u,mv=/[^\s\p{P}\p{S}]/u,C1=ot(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Td).getRegex(),vv=/(?!~)[\p{P}\p{S}]/u,E1=/(?!~)[\s\p{P}\p{S}]/u,A1=/(?:[^\s\p{P}\p{S}]|~)/u,R1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,gv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,I1=ot(gv,"u").replace(/punct/g,tr).getRegex(),O1=ot(gv,"u").replace(/punct/g,vv).getRegex(),bv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",L1=ot(bv,"gu").replace(/notPunctSpace/g,mv).replace(/punctSpace/g,Td).replace(/punct/g,tr).getRegex(),N1=ot(bv,"gu").replace(/notPunctSpace/g,A1).replace(/punctSpace/g,E1).replace(/punct/g,vv).getRegex(),D1=ot("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,mv).replace(/punctSpace/g,Td).replace(/punct/g,tr).getRegex(),P1=ot(/\\(punct)/,"gu").replace(/punct/g,tr).getRegex(),M1=ot(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),F1=ot(kd).replace("(?:-->|$)","-->").getRegex(),$1=ot("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",F1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),wo=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,B1=ot(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",wo).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),yv=ot(/^!?\[(label)\]\[(ref)\]/).replace("label",wo).replace("ref",wd).getRegex(),xv=ot(/^!?\[(ref)\](?:\[\])?/).replace("ref",wd).getRegex(),U1=ot("reflink|nolink(?!\\()","g").replace("reflink",yv).replace("nolink",xv).getRegex(),Cd={_backpedal:Hi,anyPunctuation:P1,autolink:M1,blockSkip:R1,br:hv,code:S1,del:Hi,emStrongLDelim:I1,emStrongRDelimAst:L1,emStrongRDelimUnd:D1,escape:k1,link:B1,nolink:xv,punctuation:C1,reflink:yv,reflinkSearch:U1,tag:$1,text:T1,url:Hi},H1={...Cd,link:ot(/^!?\[(label)\]\((.*?)\)/).replace("label",wo).getRegex(),reflink:ot(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",wo).getRegex()},hc={...Cd,emStrongRDelimAst:N1,emStrongLDelim:O1,url:ot(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},z1={...hc,br:ot(hv).replace("{2,}","*").getRegex(),text:ot(hc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Bl={normal:Sd,gfm:_1,pedantic:w1},Ti={normal:Cd,gfm:hc,breaks:z1,pedantic:H1},j1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Np=e=>j1[e];function tn(e,t){if(t){if(fs.escapeTest.test(e))return e.replace(fs.escapeReplace,Np)}else if(fs.escapeTestNoEncode.test(e))return e.replace(fs.escapeReplaceNoEncode,Np);return e}function Dp(e){try{e=encodeURI(e).replace(fs.percentDecode,"%")}catch{return null}return e}function Pp(e,t){var i;const s=e.replace(fs.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(fs.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(fs.slashPipe,"|");return n}function Ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function V1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Mp(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function q1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var ko=class{constructor(e){ht(this,"options");ht(this,"rules");ht(this,"lexer");this.options=e||Ra}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=q1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=Ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Ci(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Ci(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,L=>" ".repeat(3*L.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const L=this.rules.other.nextBulletRegex(m),_=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),R=this.rules.other.htmlBeginRegex(m);for(;e;){const C=e.split(`
`,1)[0];let O;if(p=C,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),O=p):O=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||R.test(p)||L.test(p)||_.test(p))break;if(O.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+O.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||_.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=C+`
`,e=e.substring(C.length+1),u=O.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,w;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(w=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:w,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Pp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(Pp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=V1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Mp(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Mp(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Sn=class mc{constructor(t){ht(this,"tokens");ht(this,"options");ht(this,"state");ht(this,"tokenizer");ht(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ra,this.options.tokenizer=this.options.tokenizer||new ko,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:fs,block:Bl.normal,inline:Ti.normal};this.options.pedantic?(s.block=Bl.pedantic,s.inline=Ti.pedantic):this.options.gfm&&(s.block=Bl.gfm,this.options.breaks?s.inline=Ti.breaks:s.inline=Ti.gfm),this.tokenizer.rules=s}static get rules(){return{block:Bl,inline:Ti}}static lex(t,s){return new mc(s).lex(t)}static lexInline(t,s){return new mc(s).inlineTokens(t)}lex(t){t=t.replace(fs.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(fs.tabCharGlobal,"    ").replace(fs.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},So=class{constructor(e){ht(this,"options");ht(this,"parser");this.options=e||Ra}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(fs.notSpaceStart))==null?void 0:i[0],a=e.replace(fs.endingNewline,"")+`
`;return n?'<pre><code class="language-'+tn(n)+'">'+(s?a:tn(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:tn(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+tn(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${tn(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Dp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+tn(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Dp(e);if(a===null)return tn(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${tn(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:tn(e.text)}},Ed=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Tn=class vc{constructor(t){ht(this,"options");ht(this,"renderer");ht(this,"textRenderer");this.options=t||Ra,this.options.renderer=this.options.renderer||new So,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Ed}static parse(t,s){return new vc(s).parse(t)}static parseInline(t,s){return new vc(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Or,Gl=(Or=class{constructor(e){ht(this,"options");ht(this,"block");this.options=e||Ra}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Sn.lex:Sn.lexInline}provideParser(){return this.block?Tn.parse:Tn.parseInline}},ht(Or,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Or),G1=class{constructor(...e){ht(this,"defaults",yd());ht(this,"options",this.setOptions);ht(this,"parse",this.parseMarkdown(!0));ht(this,"parseInline",this.parseMarkdown(!1));ht(this,"Parser",Tn);ht(this,"Renderer",So);ht(this,"TextRenderer",Ed);ht(this,"Lexer",Sn);ht(this,"Tokenizer",ko);ht(this,"Hooks",Gl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new So(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new ko(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Gl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];Gl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Sn.lex(e,t??this.defaults)}parser(e,t){return Tn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Sn.lex:Sn.lexInline,r=i.hooks?i.hooks.provideParser():e?Tn.parse:Tn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+tn(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ka=new G1;function at(e,t){return ka.parse(e,t)}at.options=at.setOptions=function(e){return ka.setOptions(e),at.defaults=ka.defaults,dv(at.defaults),at};at.getDefaults=yd;at.defaults=Ra;at.use=function(...e){return ka.use(...e),at.defaults=ka.defaults,dv(at.defaults),at};at.walkTokens=function(e,t){return ka.walkTokens(e,t)};at.parseInline=ka.parseInline;at.Parser=Tn;at.parser=Tn.parse;at.Renderer=So;at.TextRenderer=Ed;at.Lexer=Sn;at.lexer=Sn.lex;at.Tokenizer=ko;at.Hooks=Gl;at.parse=at;at.options;at.setOptions;at.use;at.walkTokens;at.parseInline;Tn.parse;Sn.lex;const K1={breaks:!0,gfm:!0};function Fp(e){if(!e)return"";try{if(typeof at<"u"&&at.parse){const t=at.parse(e,K1);return typeof Op<"u"?Op.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function W1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const J1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function Z1(e){return J1[e]||"wrench"}const Y1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function $p(e){if(!e)return[];const t=e.match(Y1);return t?[...new Set(t)]:[]}const Q1={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),n=f(""),a=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=G(()=>t.value.trim().length>0&&!s.value),p=f(Ye.state||"disconnected");let h=null;const m=G(()=>{const T=p.value;return T==="connected"?"Connected":T==="reconnecting"?"Reconnecting…":T==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],w=G(()=>{const T=Math.floor(l.value/4)%v.length,k=l.value;return k>3?`${v[T]} (${k}s)`:v[0]});function L(){Rt(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function _(){if(!i.value)return;const T=i.value;T.style.height="auto",T.style.height=Math.min(T.scrollHeight,120)+"px"}function g(T,k,S={}){const $={id:++c,role:T,content:k,timestamp:Date.now(),html:T==="bot"?Fp(k):"",tools_used:S.tools_used||[],is_error:S.is_error||!1,images:T==="bot"?$p(k):[],files:S.files||[],_showTools:!1};return e.value.push($),L(),T==="bot"&&Rt(()=>b()),$}function b(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(k=>{k.setAttribute("data-copy","true"),k.style.position="relative";const S=document.createElement("button");S.className="chat-code-copy",S.textContent="Copy",S.addEventListener("click",()=>{const $=k.querySelector("code"),Z=$?$.textContent:k.textContent;navigator.clipboard.writeText(Z).then(()=>{S.textContent="Copied!",setTimeout(()=>{S.textContent="Copy"},1500)}).catch(()=>{})}),k.appendChild(S)})}function R(T){if(T===0)return!0;const k=e.value[T-1],S=e.value[T],$=new Date(k.timestamp).toDateString(),Z=new Date(S.timestamp).toDateString();return $!==Z}function C(T){const k=new Date(T),S=new Date;if(k.toDateString()===S.toDateString())return"Today";const $=new Date(S);return $.setDate($.getDate()-1),k.toDateString()===$.toDateString()?"Yesterday":k.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function O(T){t.value=T,Rt(()=>V())}function A(T){window.open(T,"_blank","noopener")}function x(T){T.target.style.display="none"}function N(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function F(){r&&(clearInterval(r),r=null),l.value=0}function E(T){s.value&&(s.value=!1,F(),T.type==="chat_response"?g("bot",T.content,{tools_used:T.tools_used||[],is_error:T.is_error||!1,files:T.files||[]}):T.type==="chat_error"&&g("bot",T.error||"Unknown error",{is_error:!0}),Rt(()=>{var k;return(k=i.value)==null?void 0:k.focus()}))}async function M(T){try{const k=await j.post("/api/chat",{content:T,channel_id:o.value});g("bot",k.response,{tools_used:k.tools_used||[],is_error:k.is_error||!1,files:k.files||[]})}catch(k){g("bot",k.message||"Failed to send message",{is_error:!0})}}async function V(){const T=t.value.trim();if(!T||s.value)return;g("user",T),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(T,{channelId:o.value})||(await M(T),s.value=!1,F()),Rt(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}async function J(){n.value="";try{if(!o.value){const k=await j.get("/api/auth/session");o.value=k.channel_id||k.user_id||"web-user"}const T=await j.get("/api/sessions/"+encodeURIComponent(o.value));if(T&&T.messages&&T.messages.length>0){for(const k of T.messages){const S=k.role==="user"?"user":"bot";let $=k.content||"";if(S==="user"){const K=$.match(/^\[.*?\]:\s*/);K&&($=$.slice(K[0].length))}if(!$.trim())continue;const Z={id:++c,role:S,content:$,timestamp:k.timestamp?k.timestamp*1e3:Date.now(),html:S==="bot"?Fp($):"",tools_used:[],is_error:!1,images:S==="bot"?$p($):[],files:[],_showTools:!1};e.value.push(Z)}Rt(()=>{L(),b()})}}catch(T){T&&T.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",xe.error(n.value))}}return je(()=>{Ye.subscribe("chat",E),p.value=Ye.state||"disconnected",h=Ye.onState(T=>{p.value=T}),J(),Rt(()=>{var T;return(T=i.value)==null?void 0:T.focus()})}),ft(()=>{Ye.unsubscribe("chat",E),h&&(h(),h=null),F()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:w,suggestions:d,send:V,autoResize:_,formatTime:W1,formatDate:C,showDateSeparator:R,useSuggestion:O,openImage:A,onImageError:x,getToolIcon:Z1,loadHistory:J}}},X1={setup(){const e=f("odin"),t=f(""),s=f(""),n=f(""),a=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=G(()=>e.value==="custom"),v=G(()=>[...i.value,...l.value]),w=G(()=>l.value.includes(e.value)),L=G(()=>{var A;return m.value?t.value||"Odin":((A=a.value[e.value])==null?void 0:A.name)||e.value}),_=G(()=>{var A;return m.value?s.value||"(empty — will use Odin default)":((A=a.value[e.value])==null?void 0:A.identity)||""}),g=G(()=>{var A;return m.value?n.value||"(empty — will use Odin default)":((A=a.value[e.value])==null?void 0:A.voice)||""});async function b(){d.value=!0;try{const A=await j.get("/api/personality");e.value=A.preset||"odin",t.value=A.custom_name||"",s.value=A.custom_identity||"",n.value=A.custom_voice||"",a.value=A.presets||{},i.value=A.builtin_presets||[],l.value=A.user_presets||[]}catch(A){c.value=A.message}finally{d.value=!1}}async function R(){o.value=!0,c.value=null,r.value=!1;try{await j.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(A){c.value=A.message}finally{o.value=!1}}async function C(){const A=u.value.trim();if(A){h.value=!0,c.value=null;try{await j.post("/api/personality/presets",{name:A,display_name:L.value,identity:_.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=A.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function O(){if(await qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await j.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return je(b),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:w,previewName:L,previewIdentity:_,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:R,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:C,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
  `},kt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),_v=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:DS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:Q1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:Yw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:lk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Ek,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:X1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:ES,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:kt("/operations","live")},{path:"/agents",redirect:kt("/operations","agents")},{path:"/loops",redirect:kt("/operations","loops")},{path:"/processes",redirect:kt("/operations","processes")},{path:"/schedules",redirect:kt("/operations","schedules")},{path:"/audit",redirect:kt("/history","audit")},{path:"/sessions",redirect:kt("/history","sessions")},{path:"/traces",redirect:kt("/history","traces")},{path:"/usage",redirect:kt("/history","usage")},{path:"/tools",redirect:kt("/capabilities","tools")},{path:"/skills",redirect:kt("/capabilities","skills")},{path:"/mcp",redirect:kt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:kt("/capabilities","knowledge")},{path:"/memory",redirect:kt("/capabilities","memory")},{path:"/learned",redirect:kt("/capabilities","learned")},{path:"/health",redirect:kt("/system","health")},{path:"/resources",redirect:kt("/system","resources")},{path:"/logs",redirect:kt("/system","logs")},{path:"/config",redirect:kt("/system","config")},{path:"/host-access",redirect:kt("/system","host-access")},{path:"/hosts",redirect:kt("/system","hosts")},{path:"/internals",redirect:kt("/system","internals")}],zi=Cw({history:aw(),routes:_v});zi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const eT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),n=f(!1),a=f(!1);async function i(){n.value=!0,s.value=null;try{j.setPersist(a.value),await j.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},tT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),n=f(!1),a=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),w=_v.filter($=>$.meta),L=G(()=>["Workspace","Operate","Observe","Manage"].map($=>({name:$,routes:w.filter(Z=>Z.meta.section===$)})).filter($=>$.routes.length)),_=G(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.label)||"Odin"}),g=G(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.section)||"Management"}),b=G(()=>{var $;return(($=zi.currentRoute.value.meta)==null?void 0:$.description)||"Management console"});function R(){Ye.disconnect(),V&&(clearInterval(V),V=null)}j.onSessionExpired=()=>{t.value=!0,R(),j.setToken(""),e.value="login"};function C($){var Z;if(($.ctrlKey||$.metaKey)&&$.key.toLowerCase()==="k"){e.value==="ready"&&($.preventDefault(),vp());return}if(n.value&&$.key==="Tab"){const K=[...((Z=a.value)==null?void 0:Z.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(K.length){const Y=K[0],ce=K[K.length-1];if($.shiftKey&&(document.activeElement===Y||!a.value.contains(document.activeElement))){$.preventDefault(),ce.focus();return}if(!$.shiftKey&&(document.activeElement===ce||!a.value.contains(document.activeElement))){$.preventDefault(),Y.focus();return}}}if($.key==="Escape"&&n.value){n.value=!1,$.preventDefault();return}if($.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes($.target.tagName)){$.preventDefault();const K=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');K&&K.focus()}}function O(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}je(async()=>{document.addEventListener("keydown",C),o=window.matchMedia("(max-width: 900px)"),O(),o.addEventListener("change",O);const $=await j.check();$.ok?(e.value="ready",k()):$.needsAuth?e.value="login":(e.value="ready",k())});function A(){t.value=!1,e.value="ready",k()}async function x(){R(),e.value="login",await j.logout()}function N(){s.value=!s.value}function F(){n.value=!n.value}Mt(n,async $=>{var Z,K;if($)r=document.activeElement,await Rt(),(K=(Z=a.value)==null?void 0:Z.querySelector(".nav-item"))==null||K.focus();else if(r!=null&&r.isConnected){const Y=r;r=null,requestAnimationFrame(()=>Y.focus())}});const E=G(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M($,Z="info",K=3e3){p.value={text:$,level:Z},clearTimeout(h),h=setTimeout(()=>{p.value=null},K)}let V=null,J=!1,T=[];function k(){for(const $ of T)$();T=[Ye.onStatus($=>{c.value=$}),Ye.onLatencyChange($=>{u.value=$}),Ye.onState(($,Z)=>{d.value=$,$==="connected"?(J&&M("Connection restored","success"),J=!0):$==="reconnecting"&&Z.attempt===1&&M("Connection lost — reconnecting…","warn")})],Ye.connect(),S(),V&&clearInterval(V),V=setInterval(S,15e3)}async function S(){try{const $=await j.get("/api/status");m.value=$.status==="online"?"online":"starting";const Z=$.uptime_seconds||0,K=Math.floor(Z/3600),Y=Math.floor(Z%3600/60);v.value=`${K}h ${Y}m uptime`}catch{m.value="offline",v.value=""}}return ft(()=>{V&&clearInterval(V);for(const $ of T)$();T=[],Ye.disconnect(),document.removeEventListener("keydown",C),o==null||o.removeEventListener("change",O)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:E,wsToast:p,botStatus:m,botUptime:v,navRoutes:w,navGroups:L,currentPage:_,currentSection:g,currentDescription:b,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:A,logout:x,toggleSidebar:N,toggleMobileNavigation:F,openPalette:vp}}},ta=uo(tT);ta.component("odin-icon",OS);ta.component("login-screen",eT);ta.component("toast-container",b_);ta.component("confirm-host",y_);ta.component("command-palette",IS);ta.directive("modal-focus",NS);ta.use(zi);ta.mount("#app");
