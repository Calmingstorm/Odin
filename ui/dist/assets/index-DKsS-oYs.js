var Ym=Object.defineProperty;var Qm=(e,t,s)=>t in e?Ym(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var dt=(e,t,s)=>Qm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Xm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new ul("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new cd(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new ul("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new cd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ul((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ul?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ul extends Error{constructor(t){super(t),this.name="AuthError"}}class cd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class ev{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const n of[...this._lifecycle[t]])try{n(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,n=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const a={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(a)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!n):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const n=new Set(this._subscriptions);if(n.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:n},this._subscriptionAckTimer=setTimeout(()=>{var a;((a=this._pendingReconnect)==null?void 0:a.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const n=this._pendingReconnect;!n||n.socket!==t||!n.channels.has(s)||(n.channels.delete(s),!(n.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var n;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const a=this._ws;((n=this._pendingReconnect)==null?void 0:n.socket)===a&&this._pendingReconnect.channels.add(t),a.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);if(a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,n=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,a=n?new WebSocket(s,n):new WebSocket(s);this._ws=a;const i=()=>this._ws===a;a.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const r of this._subscriptions)a.send(JSON.stringify({subscribe:r}));this._startPing(a),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(a,l)},a.onmessage=l=>{if(!i())return;let r;try{r=JSON.parse(l.data)}catch{return}const o=r.type;if(o==="pong"){r.ts&&(this._latency=Date.now()-r.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(o==="subscribed"){this._ackSubscription(a,r.channel);return}if(o==="log")for(const c of this._handlers.logs||[])c(r);else if(o==="event")for(const c of this._handlers.events||[])c(r);else if(o==="chat_response"||o==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(r)}},a.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(a,l,l)},a.onerror=()=>{}}}const W=new Xm,Ye=new ev(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function xs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ve={},Fa=[],zt=()=>{},Pa=()=>!1,va=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),pr=e=>e.startsWith("onUpdate:"),je=Object.assign,Xo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},tv=Object.prototype.hasOwnProperty,et=(e,t)=>tv.call(e,t),Re=Array.isArray,$a=e=>ii(e)==="[object Map]",ga=e=>ii(e)==="[object Set]",dd=e=>ii(e)==="[object Date]",sv=e=>ii(e)==="[object RegExp]",Fe=e=>typeof e=="function",$e=e=>typeof e=="string",Yt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",ec=e=>(Xe(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),hp=Object.prototype.toString,ii=e=>hp.call(e),nv=e=>ii(e).slice(8,-1),fr=e=>ii(e)==="[object Object]",hr=e=>$e(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,yn=xs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),av=xs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),mr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},iv=/-\w/g,lt=mr(e=>e.replace(iv,t=>t.slice(1).toUpperCase())),lv=/\B([A-Z])/g,ps=mr(e=>e.replace(lv,"-$1").toLowerCase()),ba=mr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ba=mr(e=>e?`on${ba(e)}`:""),Pt=(e,t)=>!Object.is(e,t),Ua=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},mp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},vr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Dl=e=>{const t=$e(e)?Number(e):NaN;return isNaN(t)?e:t};let ud;const gr=()=>ud||(ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function rv(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const ov="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",cv=xs(ov);function el(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=$e(n)?vp(n):el(n);if(a)for(const i in a)t[i]=a[i]}return t}else if($e(e)||Xe(e))return e}const dv=/;(?![^(]*\))/g,uv=/:([^]+)/,pv=/\/\*[^]*?\*\//g;function vp(e){const t={};return e.replace(pv,"").split(dv).forEach(s=>{if(s){const n=s.split(uv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function tl(e){let t="";if($e(e))t=e;else if(Re(e))for(let s=0;s<e.length;s++){const n=tl(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function fv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!$e(t)&&(e.class=tl(t)),s&&(e.style=el(s)),e}const hv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",mv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",vv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",gv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",bv=xs(hv),yv=xs(mv),xv=xs(vv),_v=xs(gv),wv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",kv=xs(wv);function gp(e){return!!e||e===""}function Sv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=kn(e[n],t[n]);return s}function kn(e,t){if(e===t)return!0;let s=dd(e),n=dd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Yt(e),n=Yt(t),s||n)return e===t;if(s=Re(e),n=Re(t),s||n)return s&&n?Sv(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!kn(e[l],t[l]))return!1}}return String(e)===String(t)}function br(e,t){return e.findIndex(s=>kn(s,t))}const bp=e=>!!(e&&e.__v_isRef===!0),yp=e=>$e(e)?e:e==null?"":Re(e)||Xe(e)&&(e.toString===hp||!Fe(e.toString))?bp(e)?yp(e.value):JSON.stringify(e,xp,2):String(e),xp=(e,t)=>bp(t)?xp(e,t.value):$a(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[zr(n,i)+" =>"]=a,s),{})}:ga(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>zr(s))}:Yt(t)?zr(t):Xe(t)&&!Re(t)&&!fr(t)?String(t):t,zr=(e,t="")=>{var s;return Yt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Tv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Lt;class tc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Lt&&(Lt.active?(this.parent=Lt,this.index=(Lt.scopes||(Lt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Lt;try{return Lt=this,t()}finally{Lt=s}}}on(){++this._on===1&&(this.prevScope=Lt,Lt=this)}off(){if(this._on>0&&--this._on===0){if(Lt===this)Lt=this.prevScope;else{let t=Lt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Cv(e){return new tc(e)}function _p(){return Lt}function Ev(e,t=!1){Lt&&Lt.cleanups.push(e)}let ut;const jr=new WeakSet;class Di{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Lt&&(Lt.active?Lt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,jr.has(this)&&(jr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||kp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,pd(this),Sp(this);const t=ut,s=$s;ut=this,$s=!0;try{return this.fn()}finally{Tp(this),ut=t,$s=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)ac(t);this.deps=this.depsTail=void 0,pd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?jr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){bo(this)&&this.run()}get dirty(){return bo(this)}}let wp=0,Ti,Ci;function kp(e,t=!1){if(e.flags|=8,t){e.next=Ci,Ci=e;return}e.next=Ti,Ti=e}function sc(){wp++}function nc(){if(--wp>0)return;if(Ci){let t=Ci;for(Ci=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ti;){let t=Ti;for(Ti=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Sp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Tp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),ac(n),Av(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function bo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Cp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Cp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Fi)||(e.globalVersion=Fi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!bo(e))))return;e.flags|=2;const t=e.dep,s=ut,n=$s;ut=e,$s=!0;try{Sp(e);const a=e.fn(e._value);(t.version===0||Pt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ut=s,$s=n,Tp(e),e.flags&=-3}}function ac(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)ac(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Av(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Rv(e,t){e.effect instanceof Di&&(e=e.effect.fn);const s=new Di(e);t&&je(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Iv(e){e.effect.stop()}let $s=!0;const Ep=[];function Sn(){Ep.push($s),$s=!1}function Tn(){const e=Ep.pop();$s=e===void 0?!0:e}function pd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ut;ut=void 0;try{t()}finally{ut=s}}}let Fi=0;class Ov{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class yr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ut||!$s||ut===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ut)s=this.activeLink=new Ov(ut,this),ut.deps?(s.prevDep=ut.depsTail,ut.depsTail.nextDep=s,ut.depsTail=s):ut.deps=ut.depsTail=s,Ap(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ut.depsTail,s.nextDep=void 0,ut.depsTail.nextDep=s,ut.depsTail=s,ut.deps===s&&(ut.deps=n)}return s}trigger(t){this.version++,Fi++,this.notify(t)}notify(t){sc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{nc()}}}function Ap(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Ap(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Fl=new WeakMap,ra=Symbol(""),yo=Symbol(""),$i=Symbol("");function Kt(e,t,s){if($s&&ut){let n=Fl.get(e);n||Fl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new yr),a.map=n,a.key=s),a.track()}}function hn(e,t,s,n,a,i){const l=Fl.get(e);if(!l){Fi++;return}const r=o=>{o&&o.trigger()};if(sc(),t==="clear")l.forEach(r);else{const o=Re(e),c=o&&hr(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===$i||!Yt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get($i)),t){case"add":o?c&&r(l.get("length")):(r(l.get(ra)),$a(e)&&r(l.get(yo)));break;case"delete":o||(r(l.get(ra)),$a(e)&&r(l.get(yo)));break;case"set":$a(e)&&r(l.get(ra));break}}nc()}function Lv(e,t){const s=Fl.get(e);return s&&s.get(t)}function Ta(e){const t=Ze(e);return t===e?t:(Kt(t,"iterate",$i),hs(e)?t:t.map(Us))}function xr(e){return Kt(e=Ze(e),"iterate",$i),e}function Xs(e,t){return tn(e)?Ka(xn(e)?Us(t):t):Us(t)}const Nv={__proto__:null,[Symbol.iterator](){return Vr(this,Symbol.iterator,e=>Xs(this,e))},concat(...e){return Ta(this).concat(...e.map(t=>Re(t)?Ta(t):t))},entries(){return Vr(this,"entries",e=>(e[1]=Xs(this,e[1]),e))},every(e,t){return ln(this,"every",e,t,void 0,arguments)},filter(e,t){return ln(this,"filter",e,t,s=>s.map(n=>Xs(this,n)),arguments)},find(e,t){return ln(this,"find",e,t,s=>Xs(this,s),arguments)},findIndex(e,t){return ln(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ln(this,"findLast",e,t,s=>Xs(this,s),arguments)},findLastIndex(e,t){return ln(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ln(this,"forEach",e,t,void 0,arguments)},includes(...e){return qr(this,"includes",e)},indexOf(...e){return qr(this,"indexOf",e)},join(e){return Ta(this).join(e)},lastIndexOf(...e){return qr(this,"lastIndexOf",e)},map(e,t){return ln(this,"map",e,t,void 0,arguments)},pop(){return ui(this,"pop")},push(...e){return ui(this,"push",e)},reduce(e,...t){return fd(this,"reduce",e,t)},reduceRight(e,...t){return fd(this,"reduceRight",e,t)},shift(){return ui(this,"shift")},some(e,t){return ln(this,"some",e,t,void 0,arguments)},splice(...e){return ui(this,"splice",e)},toReversed(){return Ta(this).toReversed()},toSorted(e){return Ta(this).toSorted(e)},toSpliced(...e){return Ta(this).toSpliced(...e)},unshift(...e){return ui(this,"unshift",e)},values(){return Vr(this,"values",e=>Xs(this,e))}};function Vr(e,t,s){const n=xr(e),a=n[t]();return n!==e&&!hs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Mv=Array.prototype;function ln(e,t,s,n,a,i){const l=xr(e),r=l!==e&&!hs(e),o=l[t];if(o!==Mv[t]){const u=o.apply(e,i);return r?Us(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,Xs(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function fd(e,t,s,n){const a=xr(e),i=a!==e&&!hs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=Xs(e,c)),s.call(this,c,Xs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?Xs(e,o):o}function qr(e,t,s){const n=Ze(e);Kt(n,"iterate",$i);const a=n[t](...s);return(a===-1||a===!1)&&sl(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function ui(e,t,s=[]){Sn(),sc();const n=Ze(e)[t].apply(e,s);return nc(),Tn(),n}const Pv=xs("__proto__,__v_isRef,__isVue"),Rp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Yt));function Dv(e){Yt(e)||(e=String(e));const t=Ze(this);return Kt(t,"has",e),t.hasOwnProperty(e)}class Ip{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Dp:Pp:i?Mp:Np).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Re(t);if(!a){let o;if(l&&(o=Nv[s]))return o;if(s==="hasOwnProperty")return Dv}const r=Reflect.get(t,s,At(t)?t:n);if((Yt(s)?Rp.has(s):Pv(s))||(a||Kt(t,"get",s),i))return r;if(At(r)){const o=l&&hr(s)?r:r.value;return a&&Xe(o)?$l(o):o}return Xe(r)?a?$l(r):jn(r):r}}class Op extends Ip{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Re(t)&&hr(s);if(!this._isShallow){const c=tn(i);if(!hs(n)&&!tn(n)&&(i=Ze(i),n=Ze(n)),!l&&At(i)&&!At(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:et(t,s),o=Reflect.set(t,s,n,At(t)?t:a);return t===Ze(a)&&(r?Pt(n,i)&&hn(t,"set",s,n):hn(t,"add",s,n)),o}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&hn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Yt(s)||!Rp.has(s))&&Kt(t,"has",s),n}ownKeys(t){return Kt(t,"iterate",Re(t)?"length":ra),Reflect.ownKeys(t)}}class Lp extends Ip{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Fv=new Op,$v=new Lp,Bv=new Op(!0),Uv=new Lp(!0),xo=e=>e,pl=e=>Reflect.getPrototypeOf(e);function Hv(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=$a(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?xo:t?Ka:Us;return!t&&Kt(i,"iterate",o?yo:ra),je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function fl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function zv(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);e||(Pt(a,r)&&Kt(l,"get",a),Kt(l,"get",r));const{has:o}=pl(l),c=t?xo:e?Ka:Us;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Kt(Ze(a),"iterate",ra),a.size},has(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);return e||(Pt(a,r)&&Kt(l,"has",a),Kt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ze(r),c=t?xo:e?Ka:Us;return!e&&Kt(o,"iterate",ra),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return je(s,e?{add:fl("add"),set:fl("set"),delete:fl("delete"),clear:fl("clear")}:{add(a){const i=Ze(this),l=pl(i),r=Ze(a),o=!t&&!hs(a)&&!tn(a)?r:a;return l.has.call(i,o)||Pt(a,o)&&l.has.call(i,a)||Pt(r,o)&&l.has.call(i,r)||(i.add(o),hn(i,"add",o,o)),this},set(a,i){!t&&!hs(i)&&!tn(i)&&(i=Ze(i));const l=Ze(this),{has:r,get:o}=pl(l);let c=r.call(l,a);c||(a=Ze(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Pt(i,d)&&hn(l,"set",a,i):hn(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:r}=pl(i);let o=l.call(i,a);o||(a=Ze(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&hn(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&hn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Hv(a,e,t)}),s}function _r(e,t){const s=zv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const jv={get:_r(!1,!1)},Vv={get:_r(!1,!0)},qv={get:_r(!0,!1)},Gv={get:_r(!0,!0)},Np=new WeakMap,Mp=new WeakMap,Pp=new WeakMap,Dp=new WeakMap;function Kv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function jn(e){return tn(e)?e:wr(e,!1,Fv,jv,Np)}function ic(e){return wr(e,!1,Bv,Vv,Mp)}function $l(e){return wr(e,!0,$v,qv,Pp)}function Wv(e){return wr(e,!0,Uv,Gv,Dp)}function wr(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Kv(nv(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function xn(e){return tn(e)?xn(e.__v_raw):!!(e&&e.__v_isReactive)}function tn(e){return!!(e&&e.__v_isReadonly)}function hs(e){return!!(e&&e.__v_isShallow)}function sl(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function Fp(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&mp(e,"__v_skip",!0),e}const Us=e=>Xe(e)?jn(e):e,Ka=e=>Xe(e)?$l(e):e;function At(e){return e?e.__v_isRef===!0:!1}function h(e){return $p(e,!1)}function lc(e){return $p(e,!0)}function $p(e,t){return At(e)?e:new Zv(e,t)}class Zv{constructor(t,s){this.dep=new yr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Us(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||hs(t)||tn(t);t=n?t:Ze(t),Pt(t,s)&&(this._rawValue=t,this._value=n?t:Us(t),this.dep.trigger())}}function Jv(e){e.dep&&e.dep.trigger()}function en(e){return At(e)?e.value:e}function Yv(e){return Fe(e)?e():en(e)}const Qv={get:(e,t,s)=>t==="__v_raw"?e:en(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return At(a)&&!At(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function rc(e){return xn(e)?e:new Proxy(e,Qv)}class Xv{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new yr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Bp(e){return new Xv(e)}function eg(e){const t=Re(e)?new Array(e.length):{};for(const s in e)t[s]=Up(e,s);return t}class tg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Yt(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!Re(t)||Yt(this._key)||!hr(this._key))do a=!sl(i)||hs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=en(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&At(this._raw[this._key])){const s=this._object[this._key];if(At(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Lv(this._raw,this._key)}}class sg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function ng(e,t,s){return At(e)?e:Fe(e)?new sg(e):Xe(e)&&arguments.length>1?Up(e,t,s):h(e)}function Up(e,t,s){return new tg(e,t,s)}class ag{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new yr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Fi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ut!==this)return kp(this,!0),!0}get value(){const t=this.dep.track();return Cp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function ig(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new ag(n,a,s)}const lg={GET:"get",HAS:"has",ITERATE:"iterate"},rg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},hl={},Bl=new WeakMap;let Dn;function og(){return Dn}function Hp(e,t=!1,s=Dn){if(s){let n=Bl.get(s);n||Bl.set(s,n=[]),n.push(e)}}function cg(e,t,s=Ve){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:hs(_)||a===!1||a===0?mn(_,1):mn(_);let d,u,p,f,m=!1,b=!1;if(At(e)?(u=()=>e.value,m=hs(e)):xn(e)?(u=()=>c(e),m=!0):Re(e)?(b=!0,m=e.some(_=>xn(_)||hs(_)),u=()=>e.map(_=>{if(At(_))return _.value;if(xn(_))return c(_);if(Fe(_))return o?o(_,2):_()})):Fe(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){Sn();try{p()}finally{Tn()}}const _=Dn;Dn=d;try{return o?o(e,3,[f]):e(f)}finally{Dn=_}}:u=zt,t&&a){const _=u,C=a===!0?1/0:a;u=()=>mn(_(),C)}const E=_p(),R=()=>{d.stop(),E&&E.active&&Xo(E.effects,d)};if(i&&t){const _=t;t=(...C)=>{const v=_(...C);return R(),v}}let S=b?new Array(e.length).fill(hl):hl;const g=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const C=d.run();if(_||a||m||(b?C.some((v,w)=>Pt(v,S[w])):Pt(C,S))){p&&p();const v=Dn;Dn=d;try{const w=[C,S===hl?void 0:b&&S[0]===hl?[]:S,f];S=C,o?o(t,3,w):t(...w)}finally{Dn=v}}}else d.run()};return r&&r(g),d=new Di(u),d.scheduler=l?()=>l(g,!1):g,f=_=>Hp(_,!1,d),p=d.onStop=()=>{const _=Bl.get(d);if(_){if(o)o(_,4);else for(const C of _)C();Bl.delete(d)}},t?n?g(!0):S=d.run():l?l(g.bind(null,!0),!0):d.run(),R.pause=d.pause.bind(d),R.resume=d.resume.bind(d),R.stop=R,R}function mn(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,At(e))mn(e.value,t,s);else if(Re(e))for(let n=0;n<e.length;n++)mn(e[n],t,s);else if(ga(e)||$a(e))e.forEach(n=>{mn(n,t,s)});else if(fr(e)){for(const n in e)mn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&mn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zp=[];function dg(e){zp.push(e)}function ug(){zp.pop()}function pg(e,t){}const fg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},hg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function li(e,t,s,n){try{return n?e(...n):e()}catch(a){ya(a,t,s)}}function ys(e,t,s,n){if(Fe(e)){const a=li(e,t,s,n);return a&&ec(a)&&a.catch(i=>{ya(i,t,s)}),a}if(Re(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ys(e[i],t,s,n));return a}}function ya(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ve;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){Sn(),li(i,null,10,[e,o,c]),Tn();return}}mg(e,s,a,n,l)}function mg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const ns=[];let Ys=-1;const Ha=[];let Fn=null,Oa=0;const jp=Promise.resolve();let Ul=null;function Ct(e){const t=Ul||jp;return e?t.then(this?e.bind(this):e):t}function vg(e){let t=Ys+1,s=ns.length;for(;t<s;){const n=t+s>>>1,a=ns[n],i=Ui(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function oc(e){if(!(e.flags&1)){const t=Ui(e),s=ns[ns.length-1];!s||!(e.flags&2)&&t>=Ui(s)?ns.push(e):ns.splice(vg(t),0,e),e.flags|=1,Vp()}}function Vp(){Ul||(Ul=jp.then(qp))}function Bi(e){Re(e)?Ha.push(...e):Fn&&e.id===-1?Fn.splice(Oa+1,0,e):e.flags&1||(Ha.push(e),e.flags|=1),Vp()}function hd(e,t,s=Ys+1){for(;s<ns.length;s++){const n=ns[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;ns.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Hl(e){if(Ha.length){const t=[...new Set(Ha)].sort((s,n)=>Ui(s)-Ui(n));if(Ha.length=0,Fn){Fn.push(...t);return}for(Fn=t,Oa=0;Oa<Fn.length;Oa++){const s=Fn[Oa];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Fn=null,Oa=0}}const Ui=e=>e.id==null?e.flags&2?-1:1/0:e.id;function qp(e){try{for(Ys=0;Ys<ns.length;Ys++){const t=ns[Ys];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),li(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Ys<ns.length;Ys++){const t=ns[Ys];t&&(t.flags&=-2)}Ys=-1,ns.length=0,Hl(),Ul=null,(ns.length||Ha.length)&&qp()}}let La,ml=[];function Gp(e,t){var s,n;La=e,La?(La.enabled=!0,ml.forEach(({event:a,args:i})=>La.emit(a,...i)),ml=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Gp(i,t)}),setTimeout(()=>{La||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ml=[])},3e3)):ml=[]}let Ht=null,kr=null;function Hi(e){const t=Ht;return Ht=e,kr=e&&e.type.__scopeId||null,t}function gg(e){kr=e}function bg(){kr=null}const yg=e=>cc;function cc(e,t=Ht,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&qi(-1);const i=Hi(t);let l;try{l=e(...a)}finally{Hi(i),n._d&&qi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function xg(e,t){if(Ht===null)return e;const s=ll(Ht),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ve]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&mn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Qs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(Sn(),ys(o,s,8,[e.el,r,e,t]),Tn())}}function Ei(e,t){if(Ut){let s=Ut.provides;const n=Ut.parent&&Ut.parent.provides;n===s&&(s=Ut.provides=Object.create(n)),s[e]=t}}function Is(e,t,s=!1){const n=ls();if(n||oa){let a=oa?oa._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function _g(){return!!(ls()||oa)}const Kp=Symbol.for("v-scx"),Wp=()=>Is(Kp);function wg(e,t){return nl(e,null,t)}function kg(e,t){return nl(e,null,{flush:"post"})}function Zp(e,t){return nl(e,null,{flush:"sync"})}function is(e,t,s){return nl(e,t,s)}function nl(e,t,s=Ve){const{immediate:n,deep:a,flush:i,once:l}=s,r=je({},s),o=t&&n||!t&&i!=="post";let c;if(fa){if(i==="sync"){const f=Wp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!o){const f=()=>{};return f.stop=zt,f.resume=zt,f.pause=zt,f}}const d=Ut;r.call=(f,m,b)=>ys(f,d,m,b);let u=!1;i==="post"?r.scheduler=f=>{Tt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(f,m)=>{m?f():oc(f)}),r.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=cg(e,t,r);return fa&&(c?c.push(p):o&&p()),p}function Sg(e,t,s){const n=this.proxy,a=$e(e)?e.includes(".")?Jp(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=ri(this),r=nl(a,i.bind(n),s);return l(),r}function Jp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Mn=new WeakMap,Yp=Symbol("_vte"),Qp=e=>e.__isTeleport,na=e=>e&&(e.disabled||e.disabled===""),Tg=e=>e&&(e.defer||e.defer===""),md=e=>typeof SVGElement<"u"&&e instanceof SVGElement,vd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,_o=(e,t)=>{const s=e&&e.to;return $e(s)?t?t(s):null:s},Cg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:b,createComment:E,parentNode:R}}=c,S=na(t.props);let{dynamicChildren:g}=t;const _=(w,T,y)=>{w.shapeFlag&16&&d(w.children,T,y,a,i,l,r,o)},C=(w=t)=>{const T=na(w.props),y=w.target=_o(w.props,m),I=wo(y,w,b,f);y&&(l!=="svg"&&md(y)?l="svg":l!=="mathml"&&vd(y)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(y),T||(_(w,y,I),xi(w,!1)))},v=w=>{const T=()=>{if(Mn.get(w)===T){if(Mn.delete(w),na(w.props)){const y=R(w.el)||s;_(w,y,w.anchor),xi(w,!0)}C(w)}};Mn.set(w,T),Tt(T,i)};if(e==null){const w=t.el=b(""),T=t.anchor=b("");if(f(w,s,n),f(T,s,n),Tg(t.props)||i&&i.pendingBranch){v(t);return}S&&(_(t,s,T),xi(t,!0)),C()}else{t.el=e.el;const w=t.anchor=e.anchor,T=Mn.get(e);if(T){T.flags|=8,Mn.delete(e),v(t);return}t.targetStart=e.targetStart;const y=t.target=e.target,I=t.targetAnchor=e.targetAnchor,F=na(e.props),D=F?s:y,N=F?w:I;if(l==="svg"||md(y)?l="svg":(l==="mathml"||vd(y))&&(l="mathml"),g?(p(e.dynamicChildren,g,D,a,i,l,r),xc(e,t,!0)):o||u(e,t,D,N,a,i,l,r,!1),S)F?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):vl(t,s,w,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const q=t.target=_o(t.props,m);q&&vl(t,q,null,c,0)}else F&&vl(t,y,I,c,1);xi(t,S)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!na(p),m=Mn.get(e);if(m&&(m.flags|=8,Mn.delete(e)),u&&(a(c),a(d)),i&&a(o),!m&&l&16)for(let b=0;b<r.length;b++){const E=r[b];n(E,t,s,f,!!E.dynamicChildren)}},move:vl,hydrate:Eg};function vl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Mn.has(e)&&(!u||na(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function Eg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(E,R){let S=R;for(;S;){if(S&&S.nodeType===8){if(S.data==="teleport start anchor")t.targetStart=S;else if(S.data==="teleport anchor"){t.targetAnchor=S,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}S=l(S)}}function f(E,R){R.anchor=u(l(E),R,r(E),s,n,a,i)}const m=t.target=_o(t.props,o),b=na(t.props);if(m){const E=m._lpa||m.firstChild;t.shapeFlag&16&&(b?(f(e,t),p(m,E),t.targetAnchor||wo(m,t,d,c,r(e)===m?e:null)):(t.anchor=l(e),p(m,E),t.targetAnchor||wo(m,t,d,c),u(E&&l(E),t,m,s,n,a,i))),xi(t,b)}else b&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Ag=Cg;function xi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function wo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Yp]=l,e&&(n(i,e,a),n(l,e,a)),l}const Cs=Symbol("_leaveCb"),pi=Symbol("_enterCb");function dc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ke(()=>{e.isMounted=!0}),Er(()=>{e.isUnmounting=!0}),e}const Ts=[Function,Array],uc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ts,onEnter:Ts,onAfterEnter:Ts,onEnterCancelled:Ts,onBeforeLeave:Ts,onLeave:Ts,onAfterLeave:Ts,onLeaveCancelled:Ts,onBeforeAppear:Ts,onAppear:Ts,onAfterAppear:Ts,onAppearCancelled:Ts},Xp=e=>{const t=e.subTree;return t.component?Xp(t.component):t},Rg={name:"BaseTransition",props:uc,setup(e,{slots:t}){const s=ls(),n=dc();return()=>{const a=t.default&&Sr(t.default(),!0),i=a&&a.length?ef(a):s.subTree?Ff():void 0;if(!i)return;const l=Ze(e),{mode:r}=l;if(n.isLeaving)return Gr(i);const o=gd(i);if(!o)return Gr(i);let c=Wa(o,l,n,s,u=>c=u);o.type!==St&&Cn(o,c);let d=s.subTree&&gd(s.subTree);if(d&&d.type!==St&&!Fs(d,o)&&Xp(s).type!==St){let u=Wa(d,l,n,s);if(Cn(d,u),r==="out-in"&&o.type!==St)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Gr(i);r==="in-out"&&o.type!==St?u.delayLeave=(p,f,m)=>{const b=sf(n,d);b[String(d.key)]=d,p[Cs]=()=>{f(),p[Cs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function ef(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==St){t=s;break}}return t}const tf=Rg;function sf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Wa(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:b,onBeforeAppear:E,onAppear:R,onAfterAppear:S,onAppearCancelled:g}=t,_=String(e.key),C=sf(s,e),v=(y,I)=>{y&&ys(y,n,9,I)},w=(y,I)=>{const F=I[1];v(y,I),Re(y)?y.every(D=>D.length<=1)&&F():y.length<=1&&F()},T={mode:l,persisted:r,beforeEnter(y){let I=o;if(!s.isMounted)if(i)I=E||o;else return;y[Cs]&&y[Cs](!0);const F=C[_];F&&Fs(e,F)&&F.el[Cs]&&F.el[Cs](),v(I,[y])},enter(y){if(C[_]===e)return;let I=c,F=d,D=u;if(!s.isMounted)if(i)I=R||c,F=S||d,D=g||u;else return;let N=!1;y[pi]=ae=>{N||(N=!0,ae?v(D,[y]):v(F,[y]),T.delayedLeave&&T.delayedLeave(),y[pi]=void 0)};const q=y[pi].bind(null,!1);I?w(I,[y,q]):q()},leave(y,I){const F=String(e.key);if(y[pi]&&y[pi](!0),s.isUnmounting)return I();v(p,[y]);let D=!1;y[Cs]=q=>{D||(D=!0,I(),q?v(b,[y]):v(m,[y]),y[Cs]=void 0,C[F]===e&&delete C[F])};const N=y[Cs].bind(null,!1);C[F]=e,f?w(f,[y,N]):N()},clone(y){const I=Wa(y,t,s,n,a);return a&&a(I),I}};return T}function Gr(e){if(il(e))return e=sn(e),e.children=null,e}function gd(e){if(!il(e))return Qp(e.type)&&e.children?ef(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function Cn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Cn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function Sr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Dt?(l.patchFlag&128&&a++,n=n.concat(Sr(l.children,t,r))):(t||l.type!==St)&&n.push(r!=null?sn(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function al(e,t){return Fe(e)?je({name:e.name},t,{setup:e}):e}function Ig(){const e=ls();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function pc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Og(e){const t=ls(),s=lc(null);if(t){const a=t.refs===Ve?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const zl=new WeakMap;function za(e,t,s,n,a=!1){if(Re(e)){e.forEach((b,E)=>za(b,t&&(Re(t)?t[E]:t),s,n,a));return}if(_n(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&za(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ll(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ve?r.refs={}:r.refs,u=r.setupState,p=Ze(u),f=u===Ve?Pa:b=>bd(d,b)?!1:et(p,b),m=(b,E)=>!(E&&bd(d,E));if(c!=null&&c!==o){if(yd(t),$e(c))d[c]=null,f(c)&&(u[c]=null);else if(At(c)){const b=t;m(c,b.k)&&(c.value=null),b.k&&(d[b.k]=null)}}if(Fe(o))li(o,r,12,[l,d]);else{const b=$e(o),E=At(o);if(b||E){const R=()=>{if(e.f){const S=b?f(o)?u[o]:d[o]:m()||!e.k?o.value:d[e.k];if(a)Re(S)&&Xo(S,i);else if(Re(S))S.includes(i)||S.push(i);else if(b)d[o]=[i],f(o)&&(u[o]=d[o]);else{const g=[i];m(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else b?(d[o]=l,f(o)&&(u[o]=l)):E&&(m(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const S=()=>{R(),zl.delete(e)};S.id=-1,zl.set(e,S),Tt(S,s)}else yd(e),R()}}}function yd(e){const t=zl.get(e);t&&(t.flags|=8,zl.delete(e))}let xd=!1;const Ca=()=>{xd||(console.error("Hydration completed but contains mismatches."),xd=!0)},Lg=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Ng=e=>e.namespaceURI.includes("MathML"),gl=e=>{if(e.nodeType===1){if(Lg(e))return"svg";if(Ng(e))return"mathml"}},Da=e=>e.nodeType===8;function Mg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,_)=>{if(!_.hasChildNodes()){s(null,g,_),Hl(),_._vnode=g;return}u(_.firstChild,g,null,null,null),Hl(),_._vnode=g},u=(g,_,C,v,w,T=!1)=>{T=T||!!_.dynamicChildren;const y=Da(g)&&g.data==="[",I=()=>b(g,_,C,v,w,y),{type:F,ref:D,shapeFlag:N,patchFlag:q}=_;let ae=g.nodeType;_.el=g,q===-2&&(T=!1,_.dynamicChildren=null);let U=null;switch(F){case Un:ae!==3?_.children===""?(o(_.el=a(""),l(g),g),U=g):U=I():(g.data!==_.children&&(Ca(),g.data=_.children),U=i(g));break;case St:S(g)?(U=i(g),R(_.el=g.content.firstChild,g,C)):ae!==8||y?U=I():U=i(g);break;case ca:if(y&&(g=i(g),ae=g.nodeType),ae===1||ae===3){U=g;const P=!_.children.length;for(let M=0;M<_.staticCount;M++)P&&(_.children+=U.nodeType===1?U.outerHTML:U.data),M===_.staticCount-1&&(_.anchor=U),U=i(U);return y?i(U):U}else I();break;case Dt:y?U=m(g,_,C,v,w,T):U=I();break;default:if(N&1)(ae!==1||_.type.toLowerCase()!==g.tagName.toLowerCase())&&!S(g)?U=I():U=p(g,_,C,v,w,T);else if(N&6){_.slotScopeIds=w;const P=l(g);if(y?U=E(g):Da(g)&&g.data==="teleport start"?U=E(g,g.data,"teleport end"):U=i(g),t(_,P,null,C,v,gl(P),T),_n(_)&&!_.type.__asyncResolved){let M;y?(M=ht(Dt),M.anchor=U?U.previousSibling:P.lastChild):M=g.nodeType===3?wc(""):ht("div"),M.el=g,_.component.subTree=M}}else N&64?ae!==8?U=I():U=_.type.hydrate(g,_,C,v,w,T,e,f):N&128&&(U=_.type.hydrate(g,_,C,v,gl(l(g)),w,T,e,u))}return D!=null&&za(D,null,v,_),U},p=(g,_,C,v,w,T)=>{T=T||!!_.dynamicChildren;const{type:y,props:I,patchFlag:F,shapeFlag:D,dirs:N,transition:q}=_,ae=y==="input"||y==="option";if(ae||F!==-1){N&&Qs(_,null,C,"created");let U=!1;if(S(g)){U=Af(null,q)&&C&&C.vnode.props&&C.vnode.props.appear;const M=g.content.firstChild;if(U){const V=M.getAttribute("class");V&&(M.$cls=V),q.beforeEnter(M)}R(M,g,C),_.el=g=M}if(D&16&&!(I&&(I.innerHTML||I.textContent))){let M=f(g.firstChild,_,g,C,v,w,T);for(M&&!bl(g,1)&&Ca();M;){const V=M;M=M.nextSibling,r(V)}}else if(D&8){let M=_.children;M[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(M=M.slice(1));const{textContent:V}=g;V!==M&&V!==M.replace(/\r\n|\r/g,`
`)&&(bl(g,0)||Ca(),g.textContent=_.children)}if(I){if(ae||!T||F&48){const M=g.tagName.includes("-");for(const V in I)(ae&&(V.endsWith("value")||V==="indeterminate")||va(V)&&!yn(V)||V[0]==="."||M&&!yn(V))&&n(g,V,null,I[V],void 0,C)}else if(I.onClick)n(g,"onClick",null,I.onClick,void 0,C);else if(F&4&&xn(I.style))for(const M in I.style)I.style[M]}let P;(P=I&&I.onVnodeBeforeMount)&&cs(P,C,_),N&&Qs(_,null,C,"beforeMount"),((P=I&&I.onVnodeMounted)||N||U)&&Lf(()=>{P&&cs(P,C,_),U&&q.enter(g),N&&Qs(_,null,C,"mounted")},v)}return g.nextSibling},f=(g,_,C,v,w,T,y)=>{y=y||!!_.dynamicChildren;const I=_.children,F=I.length;let D=!1;for(let N=0;N<F;N++){const q=y?I[N]:I[N]=us(I[N]),ae=q.type===Un;g?(ae&&!y&&N+1<F&&us(I[N+1]).type===Un&&(o(a(g.data.slice(q.children.length)),C,i(g)),g.data=q.children),g=u(g,q,v,w,T,y)):ae&&!q.children?o(q.el=a(""),C):(D||(D=!0,bl(C,1)||Ca()),s(null,q,C,null,v,w,gl(C),T))}return g},m=(g,_,C,v,w,T)=>{const{slotScopeIds:y}=_;y&&(w=w?w.concat(y):y);const I=l(g),F=f(i(g),_,I,C,v,w,T);return F&&Da(F)&&F.data==="]"?i(_.anchor=F):(Ca(),o(_.anchor=c("]"),I,F),F)},b=(g,_,C,v,w,T)=>{if(bl(g.parentElement,1)||Ca(),_.el=null,T){const F=E(g);for(;;){const D=i(g);if(D&&D!==F)r(D);else break}}const y=i(g),I=l(g);return r(g),s(null,_,I,y,C,v,gl(I),w),C&&(C.vnode.el=_.el,Rr(C,_.el)),y},E=(g,_="[",C="]")=>{let v=0;for(;g;)if(g=i(g),g&&Da(g)&&(g.data===_&&v++,g.data===C)){if(v===0)return i(g);v--}return g},R=(g,_,C)=>{const v=_.parentNode;v&&v.replaceChild(g,_);let w=C;for(;w;)w.vnode.el===_&&(w.vnode.el=w.subTree.el=g),w=w.parent},S=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const _d="data-allow-mismatch",Pg={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function bl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(_d);)e=e.parentElement;const s=e&&e.getAttribute(_d);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Pg[t])}}const Dg=gr().requestIdleCallback||(e=>setTimeout(e,1)),Fg=gr().cancelIdleCallback||(e=>clearTimeout(e)),$g=(e=1e4)=>t=>{const s=Dg(t,{timeout:e});return()=>Fg(s)};function Bg(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Ug=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Bg(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Hg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},zg=(e=[])=>(t,s)=>{$e(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function jg(e,t){if(Da(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Da(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const _n=e=>!!e.type.__asyncLoader;function Vg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(b=>{if(b=b instanceof Error?b:new Error(String(b)),o)return new Promise((E,R)=>{o(b,()=>E(p()),()=>R(b),u+1)});throw b}).then(b=>m!==c&&c?c:(b&&(b.__esModule||b[Symbol.toStringTag]==="Module")&&(b=b.default),d=b,b)))};return al({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,b,E){let R=!1;(b.bu||(b.bu=[])).push(()=>R=!0);const S=()=>{R||E()},g=i?()=>{const _=i(S,C=>jg(m,C));_&&(b.bum||(b.bum=[])).push(_)}:S;d?g():f().then(()=>!b.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Ut;if(pc(m),d)return()=>yl(d,m);const b=C=>{c=null,ya(C,m,13,!n)};if(r&&m.suspense||fa)return f().then(C=>()=>yl(C,m)).catch(C=>(b(C),()=>n?ht(n,{error:C}):null));const E=h(!1),R=h(),S=h(!!a);let g,_;return _t(()=>{g!=null&&clearTimeout(g),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{m.isUnmounted||(S.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!E.value&&!R.value){const C=new Error(`Async component timed out after ${l}ms.`);b(C),R.value=C}},l)),f().then(()=>{m.isUnmounted||(E.value=!0,m.parent&&il(m.parent.vnode)&&m.parent.update())}).catch(C=>{if(m.isUnmounted){c=null;return}b(C),R.value=C}),()=>{if(E.value&&d)return yl(d,m);if(R.value&&n)return ht(n,{error:R.value});if(s&&!S.value)return yl(s,m)}}})}function yl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ht(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const il=e=>e.type.__isKeepAlive,qg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=ls(),n=s.ctx;if(!n.renderer)return()=>{const S=t.default&&t.default();return S&&S.length===1?S[0]:S};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(S,g,_,C,v)=>{const w=S.component;c(S,g,_,0,r),o(w.vnode,S,g,_,w,r,C,S.slotScopeIds,v),Tt(()=>{w.isDeactivated=!1,w.a&&Ua(w.a);const T=S.props&&S.props.onVnodeMounted;T&&cs(T,w.parent,S)},r)},n.deactivate=S=>{const g=S.component;Vl(g.m),Vl(g.a),c(S,p,null,1,r),Tt(()=>{g.da&&Ua(g.da);const _=S.props&&S.props.onVnodeUnmounted;_&&cs(_,g.parent,S),g.isDeactivated=!0},r)};function f(S){Kr(S),d(S,s,r,!0)}function m(S){a.forEach((g,_)=>{const C=Oo(_n(g)?g.type.__asyncResolved||{}:g.type);C&&!S(C)&&b(_)})}function b(S){const g=a.get(S);g&&(!l||!Fs(g,l))?f(g):l&&Kr(l),a.delete(S),i.delete(S)}is(()=>[e.include,e.exclude],([S,g])=>{S&&m(_=>_i(S,_)),g&&m(_=>!_i(g,_))},{flush:"post",deep:!0});let E=null;const R=()=>{E!=null&&(ql(s.subTree.type)?Tt(()=>{a.set(E,xl(s.subTree))},s.subTree.suspense):a.set(E,xl(s.subTree)))};return Ke(R),Cr(R),Er(()=>{a.forEach(S=>{const{subTree:g,suspense:_}=s,C=xl(g);if(S.type===C.type&&S.key===C.key){Kr(C);const v=C.component.da;v&&Tt(v,_);return}f(S)})}),()=>{if(E=null,!t.default)return l=null;const S=t.default(),g=S[0];if(S.length>1)return l=null,S;if(!En(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let _=xl(g);if(_.type===St)return l=null,_;const C=_.type,v=Oo(_n(_)?_.type.__asyncResolved||{}:C),{include:w,exclude:T,max:y}=e;if(w&&(!v||!_i(w,v))||T&&v&&_i(T,v))return _.shapeFlag&=-257,l=_,g;const I=_.key==null?C:_.key,F=a.get(I);return _.el&&(_=sn(_),g.shapeFlag&128&&(g.ssContent=_)),E=I,F?(_.el=F.el,_.component=F.component,_.transition&&Cn(_,_.transition),_.shapeFlag|=512,i.delete(I),i.add(I)):(i.add(I),y&&i.size>parseInt(y,10)&&b(i.values().next().value)),_.shapeFlag|=256,l=_,ql(g.type)?g:_}}},Gg=qg;function _i(e,t){return Re(e)?e.some(s=>_i(s,t)):$e(e)?e.split(",").includes(t):sv(e)?(e.lastIndex=0,e.test(t)):!1}function _s(e,t){nf(e,"a",t)}function ws(e,t){nf(e,"da",t)}function nf(e,t,s=Ut){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Tr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)il(a.parent.vnode)&&Kg(n,t,s,a),a=a.parent}}function Kg(e,t,s,n){const a=Tr(t,e,n,!0);_t(()=>{Xo(n[t],a)},s)}function Kr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function xl(e){return e.shapeFlag&128?e.ssContent:e}function Tr(e,t,s=Ut,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Sn();const r=ri(s),o=ys(t,s,e,l);return r(),Tn(),o});return n?a.unshift(i):a.push(i),i}}const An=e=>(t,s=Ut)=>{(!fa||e==="sp")&&Tr(e,(...n)=>t(...n),s)},af=An("bm"),Ke=An("m"),fc=An("bu"),Cr=An("u"),Er=An("bum"),_t=An("um"),lf=An("sp"),rf=An("rtg"),of=An("rtc");function cf(e,t=Ut){Tr("ec",e,t)}const hc="components",Wg="directives";function Zg(e,t){return mc(hc,e,!0,t)||e}const df=Symbol.for("v-ndc");function Jg(e){return $e(e)?mc(hc,e,!1)||e:e||df}function Yg(e){return mc(Wg,e)}function mc(e,t,s=!0,n=!1){const a=Ht||Ut;if(a){const i=a.type;if(e===hc){const r=Oo(i,!1);if(r&&(r===t||r===lt(t)||r===ba(lt(t))))return i}const l=wd(a[e]||i[e],t)||wd(a.appContext[e],t);return!l&&n?i:l}}function wd(e,t){return e&&(e[t]||e[lt(t)]||e[ba(lt(t))])}function Qg(e,t,s,n){let a;const i=s&&s[n],l=Re(e);if(l||$e(e)){const r=l&&xn(e);let o=!1,c=!1;r&&(o=!hs(e),c=tn(e),e=xr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Ka(Us(e[d])):Us(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Xg(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Re(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function eb(e,t,s={},n,a){if(Ht.ce||Ht.parent&&_n(Ht.parent)&&Ht.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Vi(),Gl(Dt,null,[ht("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Vi();const l=i&&vc(i(s)),r=s.key||l&&l.key,o=Gl(Dt,{key:(r&&!Yt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function vc(e){return e.some(t=>En(t)?!(t.type===St||t.type===Dt&&!vc(t.children)):!0)?e:null}function tb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ba(n)]=e[n];return s}const ko=e=>e?Uf(e)?ll(e):ko(e.parent):null,Ai=je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>ko(e.parent),$root:e=>ko(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>gc(e),$forceUpdate:e=>e.f||(e.f=()=>{oc(e.update)}),$nextTick:e=>e.n||(e.n=Ct.bind(e.proxy)),$watch:e=>Sg.bind(e)}),Wr=(e,t)=>e!==Ve&&!e.__isScriptSetup&&et(e,t),So={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Wr(n,t))return l[t]=1,n[t];if(a!==Ve&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==Ve&&et(s,t))return l[t]=4,s[t];To&&(l[t]=0)}}const c=Ai[t];let d,u;if(c)return t==="$attrs"&&Kt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ve&&et(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Wr(a,t)?(a[t]=s,!0):n!==Ve&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ve&&r[0]!=="$"&&et(e,r)||Wr(t,r)||et(i,r)||et(n,r)||et(Ai,r)||et(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},sb=je({},So,{get(e,t){if(t!==Symbol.unscopables)return So.get(e,t,e)},has(e,t){return t[0]!=="_"&&!cv(t)}});function nb(){return null}function ab(){return null}function ib(e){}function lb(e){}function rb(){return null}function ob(){}function cb(e,t){return null}function db(){return uf().slots}function ub(){return uf().attrs}function uf(e){const t=ls();return t.setupContext||(t.setupContext=Vf(t))}function zi(e){return Re(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function pb(e,t){const s=zi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Re(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function fb(e,t){return!e||!t?e||t:Re(e)&&Re(t)?e.concat(t):je({},zi(e),zi(t))}function hb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function mb(e){const t=ls(),s=fa;let n=e();Gi(),s&&Va(!1);const a=()=>{ri(t),s&&Va(!0)},i=()=>{ls()!==t&&t.scope.off(),Gi(),s&&Va(!1)};return ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let To=!0;function vb(e){const t=gc(e),s=e.proxy,n=e.ctx;To=!1,t.beforeCreate&&kd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:b,deactivated:E,beforeDestroy:R,beforeUnmount:S,destroyed:g,unmounted:_,render:C,renderTracked:v,renderTriggered:w,errorCaptured:T,serverPrefetch:y,expose:I,inheritAttrs:F,components:D,directives:N,filters:q}=t;if(c&&gb(c,n,null),l)for(const P in l){const M=l[P];Fe(M)&&(n[P]=M.bind(s))}if(a){const P=a.call(s,s);Xe(P)&&(e.data=jn(P))}if(To=!0,i)for(const P in i){const M=i[P],V=Fe(M)?M.bind(s,s):Fe(M.get)?M.get.bind(s,s):zt,B=!Fe(M)&&Fe(M.set)?M.set.bind(s):zt,te=J({get:V,set:B});Object.defineProperty(n,P,{enumerable:!0,configurable:!0,get:()=>te.value,set:Q=>te.value=Q})}if(r)for(const P in r)pf(r[P],n,s,P);if(o){const P=Fe(o)?o.call(s):o;Reflect.ownKeys(P).forEach(M=>{Ei(M,P[M])})}d&&kd(d,e,"c");function U(P,M){Re(M)?M.forEach(V=>P(V.bind(s))):M&&P(M.bind(s))}if(U(af,u),U(Ke,p),U(fc,f),U(Cr,m),U(_s,b),U(ws,E),U(cf,T),U(of,v),U(rf,w),U(Er,S),U(_t,_),U(lf,y),Re(I))if(I.length){const P=e.exposed||(e.exposed={});I.forEach(M=>{Object.defineProperty(P,M,{get:()=>s[M],set:V=>s[M]=V,enumerable:!0})})}else e.exposed||(e.exposed={});C&&e.render===zt&&(e.render=C),F!=null&&(e.inheritAttrs=F),D&&(e.components=D),N&&(e.directives=N),y&&pc(e)}function gb(e,t,s=zt){Re(e)&&(e=Co(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Is(a.from||n,a.default,!0):i=Is(a.from||n):i=Is(a),At(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function kd(e,t,s){ys(Re(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function pf(e,t,s,n){let a=n.includes(".")?Jp(s,n):()=>s[n];if($e(e)){const i=t[e];Fe(i)&&is(a,i)}else if(Fe(e))is(a,e.bind(s));else if(Xe(e))if(Re(e))e.forEach(i=>pf(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&is(a,i,e)}}function gc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>jl(o,c,l,!0)),jl(o,t,l)),Xe(t)&&i.set(t,o),o}function jl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&jl(e,i,s,!0),a&&a.forEach(l=>jl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=bb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const bb={data:Sd,props:Td,emits:Td,methods:wi,computed:wi,beforeCreate:es,created:es,beforeMount:es,mounted:es,beforeUpdate:es,updated:es,beforeDestroy:es,beforeUnmount:es,destroyed:es,unmounted:es,activated:es,deactivated:es,errorCaptured:es,serverPrefetch:es,components:wi,directives:wi,watch:xb,provide:Sd,inject:yb};function Sd(e,t){return t?e?function(){return je(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function yb(e,t){return wi(Co(e),Co(t))}function Co(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function es(e,t){return e?[...new Set([].concat(e,t))]:t}function wi(e,t){return e?je(Object.create(null),e,t):t}function Td(e,t){return e?Re(e)&&Re(t)?[...new Set([...e,...t])]:je(Object.create(null),zi(e),zi(t??{})):t}function xb(e,t){if(!e)return t;if(!t)return e;const s=je(Object.create(null),e);for(const n in t)s[n]=es(e[n],t[n]);return s}function ff(){return{app:null,config:{isNativeTag:Pa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let _b=0;function wb(e,t){return function(n,a=null){Fe(n)||(n=je({},n)),a!=null&&!Xe(a)&&(a=null);const i=ff(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:_b++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Gf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const f=c._ceVNode||ht(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),o=!0,c._container=d,d.__vue_app__=c,ll(f.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ys(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=oa;oa=c;try{return d()}finally{oa=u}}};return c}}let oa=null;function kb(e,t,s=Ve){const n=ls(),a=lt(t),i=ps(t),l=hf(e,a),r=Bp((o,c)=>{let d,u=Ve,p;return Zp(()=>{const f=e[a];Pt(d,f)&&(d=f,c())}),{get(){return o(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!Pt(m,d)&&!(u!==Ve&&Pt(f,u)))return;const b=n.vnode.props,E=!!(b&&(t in b||a in b||i in b)&&(`onUpdate:${t}`in b||`onUpdate:${a}`in b||`onUpdate:${i}`in b));E||(d=f,c()),n.emit(`update:${t}`,m),Pt(f,u)&&(Pt(f,m)&&!Pt(m,p)||E&&u!==Ve&&!Pt(m,d))&&c(),u=f,p=m}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ve:r,done:!1}:{done:!0}}}},r}const hf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${lt(t)}Modifiers`]||e[`${ps(t)}Modifiers`];function Sb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ve;let a=s;const i=t.startsWith("update:"),l=i&&hf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>$e(d)?d.trim():d)),l.number&&(a=s.map(vr)));let r,o=n[r=Ba(t)]||n[r=Ba(lt(t))];!o&&i&&(o=n[r=Ba(ps(t))]),o&&ys(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ys(c,e,6,a)}}const Tb=new WeakMap;function mf(e,t,s=!1){const n=s?Tb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Fe(e)){const o=c=>{const d=mf(c,t,!0);d&&(r=!0,je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Xe(e)&&n.set(e,null),null):(Re(i)?i.forEach(o=>l[o]=null):je(l,i),Xe(e)&&n.set(e,l),l)}function Ar(e,t){return!e||!va(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,ps(t))||et(e,t))}function Rl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:b}=e,E=Hi(e);let R,S;try{if(s.shapeFlag&4){const _=a||n,C=_;R=us(c.call(C,_,d,u,f,p,m)),S=r}else{const _=t;R=us(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),S=t.props?r:Eb(r)}}catch(_){Ri.length=0,ya(_,e,1),R=ht(St)}let g=R;if(S&&b!==!1){const _=Object.keys(S),{shapeFlag:C}=g;_.length&&C&7&&(i&&_.some(pr)&&(S=Ab(S,i)),g=sn(g,S,!1,!0))}return s.dirs&&(g=sn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Cn(g,s.transition),R=g,Hi(E),R}function Cb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(En(a)){if(a.type!==St||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Eb=e=>{let t;for(const s in e)(s==="class"||s==="style"||va(s))&&((t||(t={}))[s]=e[s]);return t},Ab=(e,t)=>{const s={};for(const n in e)(!pr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Rb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?Cd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(vf(l,n,p)&&!Ar(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?Cd(n,l,c):!0:!!l;return!1}function Cd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(vf(t,e,i)&&!Ar(s,i))return!0}return!1}function vf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!kn(n,a):n!==a}function Rr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const gf={},bf=()=>Object.create(gf),yf=e=>Object.getPrototypeOf(e)===gf;function Ib(e,t,s,n=!1){const a={},i=bf();e.propsDefaults=Object.create(null),xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ic(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Ob(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ze(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ar(e.emitsOptions,p))continue;const f=t[p];if(o)if(et(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=lt(p);a[m]=Eo(o,r,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{xf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!et(t,u)&&((d=ps(u))===u||!et(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Eo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&hn(e.attrs,"set","")}function xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(yn(o))continue;const c=t[o];let d;a&&et(a,d=lt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:Ar(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ze(s),c=r||Ve;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Eo(a,o,u,c[u],e,!et(c,u))}}return l}function Eo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=et(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=ri(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===ps(s))&&(n=!0))}return n}const Lb=new WeakMap;function _f(e,t,s=!1){const n=s?Lb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Fe(e)){const d=u=>{o=!0;const[p,f]=_f(u,t,!0);je(l,p),f&&r.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Xe(e)&&n.set(e,Fa),Fa;if(Re(i))for(let d=0;d<i.length;d++){const u=lt(i[d]);Ed(u)&&(l[u]=Ve)}else if(i)for(const d in i){const u=lt(d);if(Ed(u)){const p=i[d],f=l[u]=Re(p)||Fe(p)?{type:p}:je({},p),m=f.type;let b=!1,E=!0;if(Re(m))for(let R=0;R<m.length;++R){const S=m[R],g=Fe(S)&&S.name;if(g==="Boolean"){b=!0;break}else g==="String"&&(E=!1)}else b=Fe(m)&&m.name==="Boolean";f[0]=b,f[1]=E,(b||et(f,"default"))&&r.push(u)}}const c=[l,r];return Xe(e)&&n.set(e,c),c}function Ed(e){return e[0]!=="$"&&!yn(e)}const bc=e=>e==="_"||e==="_ctx"||e==="$stable",yc=e=>Re(e)?e.map(us):[us(e)],Nb=(e,t,s)=>{if(t._n)return t;const n=cc((...a)=>yc(t(...a)),s);return n._c=!1,n},wf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(bc(a))continue;const i=e[a];if(Fe(i))t[a]=Nb(a,i,n);else if(i!=null){const l=yc(i);t[a]=()=>l}}},kf=(e,t)=>{const s=yc(t);e.slots.default=()=>s},Sf=(e,t,s)=>{for(const n in t)(s||!bc(n))&&(e[n]=t[n])},Mb=(e,t,s)=>{const n=e.slots=bf();if(e.vnode.shapeFlag&32){const a=t._;a?(Sf(n,t,s),s&&mp(n,"_",a,!0)):wf(t,n)}else t&&kf(e,t)},Pb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ve;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:Sf(a,t,s):(i=!t.$stable,wf(t,a)),l=t}else t&&(kf(e,t),l={default:1});if(i)for(const r in a)!bc(r)&&l[r]==null&&delete a[r]},Tt=Lf;function Tf(e){return Ef(e)}function Cf(e){return Ef(e,Mg)}function Ef(e,t){const s=gr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=zt,insertStaticContent:m}=e,b=(k,O,$,ie=null,ee=null,ne=null,fe=void 0,ue=null,pe=!!O.dynamicChildren)=>{if(k===O)return;k&&!Fs(k,O)&&(ie=H(k),Q(k,ee,ne,!0),k=null),O.patchFlag===-2&&(pe=!1,O.dynamicChildren=null);const{type:le,ref:ke,shapeFlag:be}=O;switch(le){case Un:E(k,O,$,ie);break;case St:R(k,O,$,ie);break;case ca:k==null&&S(O,$,ie,fe);break;case Dt:D(k,O,$,ie,ee,ne,fe,ue,pe);break;default:be&1?C(k,O,$,ie,ee,ne,fe,ue,pe):be&6?N(k,O,$,ie,ee,ne,fe,ue,pe):(be&64||be&128)&&le.process(k,O,$,ie,ee,ne,fe,ue,pe,Ce)}ke!=null&&ee?za(ke,k&&k.ref,ne,O||k,!O):ke==null&&k&&k.ref!=null&&za(k.ref,null,ne,k,!0)},E=(k,O,$,ie)=>{if(k==null)n(O.el=r(O.children),$,ie);else{const ee=O.el=k.el;O.children!==k.children&&c(ee,O.children)}},R=(k,O,$,ie)=>{k==null?n(O.el=o(O.children||""),$,ie):O.el=k.el},S=(k,O,$,ie)=>{[k.el,k.anchor]=m(k.children,O,$,ie,k.el,k.anchor)},g=({el:k,anchor:O},$,ie)=>{let ee;for(;k&&k!==O;)ee=p(k),n(k,$,ie),k=ee;n(O,$,ie)},_=({el:k,anchor:O})=>{let $;for(;k&&k!==O;)$=p(k),a(k),k=$;a(O)},C=(k,O,$,ie,ee,ne,fe,ue,pe)=>{if(O.type==="svg"?fe="svg":O.type==="math"&&(fe="mathml"),k==null)v(O,$,ie,ee,ne,fe,ue,pe);else{const le=k.el&&k.el._isVueCE?k.el:null;try{le&&le._beginPatch(),y(k,O,ee,ne,fe,ue,pe)}finally{le&&le._endPatch()}}},v=(k,O,$,ie,ee,ne,fe,ue)=>{let pe,le;const{props:ke,shapeFlag:be,transition:xe,dirs:de}=k;if(pe=k.el=l(k.type,ne,ke&&ke.is,ke),be&8?d(pe,k.children):be&16&&T(k.children,pe,null,ie,ee,Zr(k,ne),fe,ue),de&&Qs(k,null,ie,"created"),w(pe,k,k.scopeId,fe,ie),ke){for(const me in ke)me!=="value"&&!yn(me)&&i(pe,me,null,ke[me],ne,ie);"value"in ke&&i(pe,"value",null,ke.value,ne),(le=ke.onVnodeBeforeMount)&&cs(le,ie,k)}de&&Qs(k,null,ie,"beforeMount");const z=Af(ee,xe);z&&xe.beforeEnter(pe),n(pe,O,$),((le=ke&&ke.onVnodeMounted)||z||de)&&Tt(()=>{try{le&&cs(le,ie,k),z&&xe.enter(pe),de&&Qs(k,null,ie,"mounted")}finally{}},ee)},w=(k,O,$,ie,ee)=>{if($&&f(k,$),ie)for(let ne=0;ne<ie.length;ne++)f(k,ie[ne]);if(ee){let ne=ee.subTree;if(O===ne||ql(ne.type)&&(ne.ssContent===O||ne.ssFallback===O)){const fe=ee.vnode;w(k,fe,fe.scopeId,fe.slotScopeIds,ee.parent)}}},T=(k,O,$,ie,ee,ne,fe,ue,pe=0)=>{for(let le=pe;le<k.length;le++){const ke=k[le]=ue?pn(k[le]):us(k[le]);b(null,ke,O,$,ie,ee,ne,fe,ue)}},y=(k,O,$,ie,ee,ne,fe)=>{const ue=O.el=k.el;let{patchFlag:pe,dynamicChildren:le,dirs:ke}=O;pe|=k.patchFlag&16;const be=k.props||Ve,xe=O.props||Ve;let de;if($&&Qn($,!1),(de=xe.onVnodeBeforeUpdate)&&cs(de,$,O,k),ke&&Qs(O,k,$,"beforeUpdate"),$&&Qn($,!0),(be.innerHTML&&xe.innerHTML==null||be.textContent&&xe.textContent==null)&&d(ue,""),le?I(k.dynamicChildren,le,ue,$,ie,Zr(O,ee),ne):fe||M(k,O,ue,null,$,ie,Zr(O,ee),ne,!1),pe>0){if(pe&16)F(ue,be,xe,$,ee);else if(pe&2&&be.class!==xe.class&&i(ue,"class",null,xe.class,ee),pe&4&&i(ue,"style",be.style,xe.style,ee),pe&8){const z=O.dynamicProps;for(let me=0;me<z.length;me++){const Te=z[me],Le=be[Te],Me=xe[Te];(Me!==Le||Te==="value")&&i(ue,Te,Le,Me,ee,$)}}pe&1&&k.children!==O.children&&d(ue,O.children)}else!fe&&le==null&&F(ue,be,xe,$,ee);((de=xe.onVnodeUpdated)||ke)&&Tt(()=>{de&&cs(de,$,O,k),ke&&Qs(O,k,$,"updated")},ie)},I=(k,O,$,ie,ee,ne,fe)=>{for(let ue=0;ue<O.length;ue++){const pe=k[ue],le=O[ue],ke=pe.el&&(pe.type===Dt||!Fs(pe,le)||pe.shapeFlag&198)?u(pe.el):$;b(pe,le,ke,null,ie,ee,ne,fe,!0)}},F=(k,O,$,ie,ee)=>{if(O!==$){if(O!==Ve)for(const ne in O)!yn(ne)&&!(ne in $)&&i(k,ne,O[ne],null,ee,ie);for(const ne in $){if(yn(ne))continue;const fe=$[ne],ue=O[ne];fe!==ue&&ne!=="value"&&i(k,ne,ue,fe,ee,ie)}"value"in $&&i(k,"value",O.value,$.value,ee)}},D=(k,O,$,ie,ee,ne,fe,ue,pe)=>{const le=O.el=k?k.el:r(""),ke=O.anchor=k?k.anchor:r("");let{patchFlag:be,dynamicChildren:xe,slotScopeIds:de}=O;de&&(ue=ue?ue.concat(de):de),k==null?(n(le,$,ie),n(ke,$,ie),T(O.children||[],$,ke,ee,ne,fe,ue,pe)):be>0&&be&64&&xe&&k.dynamicChildren&&k.dynamicChildren.length===xe.length?(I(k.dynamicChildren,xe,$,ee,ne,fe,ue),(O.key!=null||ee&&O===ee.subTree)&&xc(k,O,!0)):M(k,O,$,ke,ee,ne,fe,ue,pe)},N=(k,O,$,ie,ee,ne,fe,ue,pe)=>{O.slotScopeIds=ue,k==null?O.shapeFlag&512?ee.ctx.activate(O,$,ie,fe,pe):q(O,$,ie,ee,ne,fe,pe):ae(k,O,pe)},q=(k,O,$,ie,ee,ne,fe)=>{const ue=k.component=Bf(k,ie,ee);if(il(k)&&(ue.ctx.renderer=Ce),Hf(ue,!1,fe),ue.asyncDep){if(ee&&ee.registerDep(ue,U,fe),!k.el){const pe=ue.subTree=ht(St);R(null,pe,O,$),k.placeholder=pe.el}}else U(ue,k,O,$,ee,ne,fe)},ae=(k,O,$)=>{const ie=O.component=k.component;if(Rb(k,O,$))if(ie.asyncDep&&!ie.asyncResolved){P(ie,O,$);return}else ie.next=O,ie.update();else O.el=k.el,ie.vnode=O},U=(k,O,$,ie,ee,ne,fe)=>{const ue=()=>{if(k.isMounted){let{next:be,bu:xe,u:de,parent:z,vnode:me}=k;{const at=Rf(k);if(at){be&&(be.el=me.el,P(k,be,fe)),at.asyncDep.then(()=>{Tt(()=>{k.isUnmounted||le()},ee)});return}}let Te=be,Le;Qn(k,!1),be?(be.el=me.el,P(k,be,fe)):be=me,xe&&Ua(xe),(Le=be.props&&be.props.onVnodeBeforeUpdate)&&cs(Le,z,be,me),Qn(k,!0);const Me=Rl(k),rt=k.subTree;k.subTree=Me,b(rt,Me,u(rt.el),H(rt),k,ee,ne),be.el=Me.el,Te===null&&Rr(k,Me.el),de&&Tt(de,ee),(Le=be.props&&be.props.onVnodeUpdated)&&Tt(()=>cs(Le,z,be,me),ee)}else{let be;const{el:xe,props:de}=O,{bm:z,m:me,parent:Te,root:Le,type:Me}=k,rt=_n(O);if(Qn(k,!1),z&&Ua(z),!rt&&(be=de&&de.onVnodeBeforeMount)&&cs(be,Te,O),Qn(k,!0),xe&&Be){const at=()=>{k.subTree=Rl(k),Be(xe,k.subTree,k,ee,null)};rt&&Me.__asyncHydrate?Me.__asyncHydrate(xe,k,at):at()}else{Le.ce&&Le.ce._hasShadowRoot()&&Le.ce._injectChildStyle(Me,k.parent?k.parent.type:void 0);const at=k.subTree=Rl(k);b(null,at,$,ie,k,ee,ne),O.el=at.el}if(me&&Tt(me,ee),!rt&&(be=de&&de.onVnodeMounted)){const at=O;Tt(()=>cs(be,Te,at),ee)}(O.shapeFlag&256||Te&&_n(Te.vnode)&&Te.vnode.shapeFlag&256)&&k.a&&Tt(k.a,ee),k.isMounted=!0,O=$=ie=null}};k.scope.on();const pe=k.effect=new Di(ue);k.scope.off();const le=k.update=pe.run.bind(pe),ke=k.job=pe.runIfDirty.bind(pe);ke.i=k,ke.id=k.uid,pe.scheduler=()=>oc(ke),Qn(k,!0),le()},P=(k,O,$)=>{O.component=k;const ie=k.vnode.props;k.vnode=O,k.next=null,Ob(k,O.props,ie,$),Pb(k,O.children,$),Sn(),hd(k),Tn()},M=(k,O,$,ie,ee,ne,fe,ue,pe=!1)=>{const le=k&&k.children,ke=k?k.shapeFlag:0,be=O.children,{patchFlag:xe,shapeFlag:de}=O;if(xe>0){if(xe&128){B(le,be,$,ie,ee,ne,fe,ue,pe);return}else if(xe&256){V(le,be,$,ie,ee,ne,fe,ue,pe);return}}de&8?(ke&16&&X(le,ee,ne),be!==le&&d($,be)):ke&16?de&16?B(le,be,$,ie,ee,ne,fe,ue,pe):X(le,ee,ne,!0):(ke&8&&d($,""),de&16&&T(be,$,ie,ee,ne,fe,ue,pe))},V=(k,O,$,ie,ee,ne,fe,ue,pe)=>{k=k||Fa,O=O||Fa;const le=k.length,ke=O.length,be=Math.min(le,ke);let xe;for(xe=0;xe<be;xe++){const de=O[xe]=pe?pn(O[xe]):us(O[xe]);b(k[xe],de,$,null,ee,ne,fe,ue,pe)}le>ke?X(k,ee,ne,!0,!1,be):T(O,$,ie,ee,ne,fe,ue,pe,be)},B=(k,O,$,ie,ee,ne,fe,ue,pe)=>{let le=0;const ke=O.length;let be=k.length-1,xe=ke-1;for(;le<=be&&le<=xe;){const de=k[le],z=O[le]=pe?pn(O[le]):us(O[le]);if(Fs(de,z))b(de,z,$,null,ee,ne,fe,ue,pe);else break;le++}for(;le<=be&&le<=xe;){const de=k[be],z=O[xe]=pe?pn(O[xe]):us(O[xe]);if(Fs(de,z))b(de,z,$,null,ee,ne,fe,ue,pe);else break;be--,xe--}if(le>be){if(le<=xe){const de=xe+1,z=de<ke?O[de].el:ie;for(;le<=xe;)b(null,O[le]=pe?pn(O[le]):us(O[le]),$,z,ee,ne,fe,ue,pe),le++}}else if(le>xe)for(;le<=be;)Q(k[le],ee,ne,!0),le++;else{const de=le,z=le,me=new Map;for(le=z;le<=xe;le++){const _e=O[le]=pe?pn(O[le]):us(O[le]);_e.key!=null&&me.set(_e.key,le)}let Te,Le=0;const Me=xe-z+1;let rt=!1,at=0;const Mt=new Array(Me);for(le=0;le<Me;le++)Mt[le]=0;for(le=de;le<=be;le++){const _e=k[le];if(Le>=Me){Q(_e,ee,ne,!0);continue}let Ee;if(_e.key!=null)Ee=me.get(_e.key);else for(Te=z;Te<=xe;Te++)if(Mt[Te-z]===0&&Fs(_e,O[Te])){Ee=Te;break}Ee===void 0?Q(_e,ee,ne,!0):(Mt[Ee-z]=le+1,Ee>=at?at=Ee:rt=!0,b(_e,O[Ee],$,null,ee,ne,fe,ue,pe),Le++)}const se=rt?Db(Mt):Fa;for(Te=se.length-1,le=Me-1;le>=0;le--){const _e=z+le,Ee=O[_e],Ue=O[_e+1],mt=_e+1<ke?Ue.el||If(Ue):ie;Mt[le]===0?b(null,Ee,$,mt,ee,ne,fe,ue,pe):rt&&(Te<0||le!==se[Te]?te(Ee,$,mt,2):Te--)}}},te=(k,O,$,ie,ee=null)=>{const{el:ne,type:fe,transition:ue,children:pe,shapeFlag:le}=k;if(le&6){te(k.component.subTree,O,$,ie);return}if(le&128){k.suspense.move(O,$,ie);return}if(le&64){fe.move(k,O,$,Ce);return}if(fe===Dt){n(ne,O,$);for(let be=0;be<pe.length;be++)te(pe[be],O,$,ie);n(k.anchor,O,$);return}if(fe===ca){g(k,O,$);return}if(ie!==2&&le&1&&ue)if(ie===0)ue.persisted&&!ne[Cs]?n(ne,O,$):(ue.beforeEnter(ne),n(ne,O,$),Tt(()=>ue.enter(ne),ee));else{const{leave:be,delayLeave:xe,afterLeave:de}=ue,z=()=>{k.ctx.isUnmounted?a(ne):n(ne,O,$)},me=()=>{const Te=ne._isLeaving||!!ne[Cs];ne._isLeaving&&ne[Cs](!0),ue.persisted&&!Te?z():be(ne,()=>{z(),de&&de()})};xe?xe(ne,z,me):me()}else n(ne,O,$)},Q=(k,O,$,ie=!1,ee=!1)=>{const{type:ne,props:fe,ref:ue,children:pe,dynamicChildren:le,shapeFlag:ke,patchFlag:be,dirs:xe,cacheIndex:de,memo:z}=k;if(be===-2&&(ee=!1),ue!=null&&(Sn(),za(ue,null,$,k,!0),Tn()),de!=null&&(O.renderCache[de]=void 0),ke&256){O.ctx.deactivate(k);return}const me=ke&1&&xe,Te=!_n(k);let Le;if(Te&&(Le=fe&&fe.onVnodeBeforeUnmount)&&cs(Le,O,k),ke&6)ye(k.component,$,ie);else{if(ke&128){k.suspense.unmount($,ie);return}me&&Qs(k,null,O,"beforeUnmount"),ke&64?k.type.remove(k,O,$,Ce,ie):le&&!le.hasOnce&&(ne!==Dt||be>0&&be&64)?X(le,O,$,!1,!0):(ne===Dt&&be&384||!ee&&ke&16)&&X(pe,O,$),ie&&oe(k)}const Me=z!=null&&de==null;(Te&&(Le=fe&&fe.onVnodeUnmounted)||me||Me)&&Tt(()=>{Le&&cs(Le,O,k),me&&Qs(k,null,O,"unmounted"),Me&&(k.el=null)},$)},oe=k=>{const{type:O,el:$,anchor:ie,transition:ee}=k;if(O===Dt){Z($,ie);return}if(O===ca){_(k);return}const ne=()=>{a($),ee&&!ee.persisted&&ee.afterLeave&&ee.afterLeave()};if(k.shapeFlag&1&&ee&&!ee.persisted){const{leave:fe,delayLeave:ue}=ee,pe=()=>fe($,ne);ue?ue(k.el,ne,pe):pe()}else ne()},Z=(k,O)=>{let $;for(;k!==O;)$=p(k),a(k),k=$;a(O)},ye=(k,O,$)=>{const{bum:ie,scope:ee,job:ne,subTree:fe,um:ue,m:pe,a:le}=k;Vl(pe),Vl(le),ie&&Ua(ie),ee.stop(),ne&&(ne.flags|=8,Q(fe,k,O,$)),ue&&Tt(ue,O),Tt(()=>{k.isUnmounted=!0},O)},X=(k,O,$,ie=!1,ee=!1,ne=0)=>{for(let fe=ne;fe<k.length;fe++)Q(k[fe],O,$,ie,ee)},H=k=>{if(k.shapeFlag&6)return H(k.component.subTree);if(k.shapeFlag&128)return k.suspense.next();const O=p(k.anchor||k.el),$=O&&O[Yp];return $?p($):O};let re=!1;const ce=(k,O,$)=>{let ie;k==null?O._vnode&&(Q(O._vnode,null,null,!0),ie=O._vnode.component):b(O._vnode||null,k,O,null,null,null,$),O._vnode=k,re||(re=!0,hd(ie),Hl(),re=!1)},Ce={p:b,um:Q,m:te,r:oe,mt:q,mc:T,pc:M,pbc:I,n:H,o:e};let we,Be;return t&&([we,Be]=t(Ce)),{render:ce,hydrate:we,createApp:wb(ce,we)}}function Zr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Qn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Af(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function xc(e,t,s=!1){const n=e.children,a=t.children;if(Re(n)&&Re(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=pn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&xc(l,r)),r.type===Un&&(r.patchFlag===-1&&(r=a[i]=pn(r)),r.el=l.el),r.type===St&&!r.el&&(r.el=l.el)}}function Db(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Rf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Rf(t)}function Vl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function If(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?If(t.subTree):null}const ql=e=>e.__isSuspense;let Ao=0;const Fb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Bb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Ub(e,t,s,n,a,l,r,o,c)}},hydrate:Hb,normalize:zb},$b=Fb;function ji(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function Bb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=Of(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(ji(e,"onPending"),ji(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ja(p,e.ssFallback)):p.resolve(!1,!0)}function Ub(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:b,isInFallback:E,isHydrating:R}=u;if(b)u.pendingBranch=p,Fs(b,p)?(o(b,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():E&&(R||(o(m,f,s,n,a,null,i,l,r),ja(u,f)))):(u.pendingId=Ao++,R?(u.isHydrating=!1,u.activeBranch=b):c(b,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(m,f,s,n,a,null,i,l,r),ja(u,f))):m&&Fs(m,p)?(o(m,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(m&&Fs(m,p))o(m,p,s,n,a,u,i,l,r),ja(u,p);else if(ji(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Ao++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:S,pendingId:g}=u;S>0?setTimeout(()=>{u.pendingId===g&&u.fallback(f)},S):S===0&&u.fallback(f)}}function Of(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:b,remove:E}}=c;let R;const S=jb(e);S&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const g=e.props?Dl(e.props.timeout):void 0,_=i,C={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Ao++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(v=!1,w=!1){const{vnode:T,activeBranch:y,pendingBranch:I,pendingId:F,effects:D,parentComponent:N,container:q,isInFallback:ae}=C;let U=!1;if(C.isHydrating)C.isHydrating=!1;else if(!v){U=y&&I.transition&&I.transition.mode==="out-in";let V=!1;U&&(y.transition.afterLeave=()=>{F===C.pendingId&&(p(I,q,i===_&&!V?m(y):i,0),Bi(D),ae&&T.ssFallback&&(T.ssFallback.el=null))}),y&&!C.isFallbackMountPending&&(b(y.el)===q&&(i=m(y),V=!0),f(y,N,C,!0),!U&&ae&&T.ssFallback&&Tt(()=>T.ssFallback.el=null,C)),U||p(I,q,i,0)}C.isFallbackMountPending=!1,ja(C,I),C.pendingBranch=null,C.isInFallback=!1;let P=C.parent,M=!1;for(;P;){if(P.pendingBranch){P.effects.push(...D),M=!0;break}P=P.parent}!M&&!U&&Bi(D),C.effects=[],S&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!w&&t.resolve()),ji(T,"onResolve")},fallback(v){if(!C.pendingBranch)return;const{vnode:w,activeBranch:T,parentComponent:y,container:I,namespace:F}=C;ji(w,"onFallback");const D=m(T),N=()=>{C.isFallbackMountPending=!1,C.isInFallback&&(u(null,v,I,D,y,null,F,r,o),ja(C,v))},q=v.transition&&v.transition.mode==="out-in";q&&(C.isFallbackMountPending=!0,T.transition.afterLeave=N),C.isInFallback=!0,f(T,y,null,!0),q||N()},move(v,w,T){C.activeBranch&&p(C.activeBranch,v,w,T),C.container=v},next(){return C.activeBranch&&m(C.activeBranch)},registerDep(v,w,T){const y=!!C.pendingBranch;y&&C.deps++;const I=v.vnode.el;v.asyncDep.catch(F=>{ya(F,v,0)}).then(F=>{if(v.isUnmounted||C.isUnmounted||C.pendingId!==v.suspenseId)return;Gi(),v.asyncResolved=!0;const{vnode:D}=v;Ro(v,F,!1),I&&(D.el=I);const N=!I&&v.subTree.el;w(v,D,b(I||v.subTree.el),I?null:m(v.subTree),C,l,T),N&&(D.placeholder=null,E(N)),Rr(v,D.el),y&&--C.deps===0&&C.resolve()})},unmount(v,w){C.isUnmounted=!0,C.activeBranch&&f(C.activeBranch,s,v,w),C.pendingBranch&&f(C.pendingBranch,s,v,w)}};return C}function Hb(e,t,s,n,a,i,l,r,o){const c=t.suspense=Of(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function zb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Ad(n?s.default:s),e.ssFallback=n?Ad(s.fallback):ht(St)}function Ad(e){let t;if(Fe(e)){const s=pa&&e._c;s&&(e._d=!1,Vi()),e=e(),s&&(e._d=!0,t=Wt,Nf())}return Re(e)&&(e=Cb(e)),e=us(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Lf(e,t){t&&t.pendingBranch?Re(e)?t.effects.push(...e):t.effects.push(e):Bi(e)}function ja(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Rr(n,a))}function jb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Dt=Symbol.for("v-fgt"),Un=Symbol.for("v-txt"),St=Symbol.for("v-cmt"),ca=Symbol.for("v-stc"),Ri=[];let Wt=null;function Vi(e=!1){Ri.push(Wt=e?null:[])}function Nf(){Ri.pop(),Wt=Ri[Ri.length-1]||null}let pa=1;function qi(e,t=!1){pa+=e,e<0&&Wt&&t&&(Wt.hasOnce=!0)}function Mf(e){return e.dynamicChildren=pa>0?Wt||Fa:null,Nf(),pa>0&&Wt&&Wt.push(e),e}function Vb(e,t,s,n,a,i){return Mf(_c(e,t,s,n,a,i,!0))}function Gl(e,t,s,n,a){return Mf(ht(e,t,s,n,a,!0))}function En(e){return e?e.__v_isVNode===!0:!1}function Fs(e,t){return e.type===t.type&&e.key===t.key}function qb(e){}const Pf=({key:e})=>e??null,Il=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?$e(e)||At(e)||Fe(e)?{i:Ht,r:e,k:t,f:!!s}:e:null);function _c(e,t=null,s=null,n=0,a=null,i=e===Dt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Pf(t),ref:t&&Il(t),scopeId:kr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ht};return r?(kc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=$e(s)?8:16),pa>0&&!l&&Wt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&Wt.push(o),o}const ht=Gb;function Gb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===df)&&(e=St),En(e)){const r=sn(e,t,!0);return s&&kc(r,s),pa>0&&!i&&Wt&&(r.shapeFlag&6?Wt[Wt.indexOf(e)]=r:Wt.push(r)),r.patchFlag=-2,r}if(Xb(e)&&(e=e.__vccOpts),t){t=Df(t);let{class:r,style:o}=t;r&&!$e(r)&&(t.class=tl(r)),Xe(o)&&(sl(o)&&!Re(o)&&(o=je({},o)),t.style=el(o))}const l=$e(e)?1:ql(e)?128:Qp(e)?64:Xe(e)?4:Fe(e)?2:0;return _c(e,t,s,n,a,l,i,!0)}function Df(e){return e?sl(e)||yf(e)?je({},e):e:null}function sn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?$f(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Pf(c),ref:t&&t.ref?s&&i?Re(i)?i.concat(Il(t)):[i,Il(t)]:Il(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Dt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&sn(e.ssContent),ssFallback:e.ssFallback&&sn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&Cn(d,o.clone(d)),d}function wc(e=" ",t=0){return ht(Un,null,e,t)}function Kb(e,t){const s=ht(ca,null,e);return s.staticCount=t,s}function Ff(e="",t=!1){return t?(Vi(),Gl(St,null,e)):ht(St,null,e)}function us(e){return e==null||typeof e=="boolean"?ht(St):Re(e)?ht(Dt,null,e.slice()):En(e)?pn(e):ht(Un,null,String(e))}function pn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:sn(e)}function kc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Re(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),kc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!yf(t)?t._ctx=Ht:a===3&&Ht&&(Ht.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:Ht},s=32):(t=String(t),n&64?(s=16,t=[wc(t)]):s=8);e.children=t,e.shapeFlag|=s}function $f(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=tl([t.class,n.class]));else if(a==="style")t.style=el([t.style,n.style]);else if(va(a)){const i=t[a],l=n[a];l&&i!==l&&!(Re(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!pr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function cs(e,t,s,n=null){ys(e,t,7,[s,n])}const Wb=ff();let Zb=0;function Bf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Wb,i={uid:Zb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new tc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:_f(n,a),emitsOptions:mf(n,a),emit:null,emitted:null,propsDefaults:Ve,inheritAttrs:n.inheritAttrs,ctx:Ve,data:Ve,props:Ve,attrs:Ve,slots:Ve,refs:Ve,setupState:Ve,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Sb.bind(null,i),e.ce&&e.ce(i),i}let Ut=null;const ls=()=>Ut||Ht;let Kl,Va;{const e=gr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Kl=t("__VUE_INSTANCE_SETTERS__",s=>Ut=s),Va=t("__VUE_SSR_SETTERS__",s=>fa=s)}const ri=e=>{const t=Ut;return Kl(e),e.scope.on(),()=>{e.scope.off(),Kl(t)}},Gi=()=>{Ut&&Ut.scope.off(),Kl(null)};function Uf(e){return e.vnode.shapeFlag&4}let fa=!1;function Hf(e,t=!1,s=!1){t&&Va(t);const{props:n,children:a}=e.vnode,i=Uf(e);Ib(e,n,i,t),Mb(e,a,s||t);const l=i?Jb(e,t):void 0;return t&&Va(!1),l}function Jb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,So);const{setup:n}=s;if(n){Sn();const a=e.setupContext=n.length>1?Vf(e):null,i=ri(e),l=li(n,e,0,[e.props,a]),r=ec(l);if(Tn(),i(),(r||e.sp)&&!_n(e)&&pc(e),r){if(l.then(Gi,Gi),t)return l.then(o=>{Ro(e,o,t)}).catch(o=>{ya(o,e,0)});e.asyncDep=l}else Ro(e,l,t)}else jf(e,t)}function Ro(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=rc(t)),jf(e,s)}let Wl,Io;function zf(e){Wl=e,Io=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,sb))}}const Yb=()=>!Wl;function jf(e,t,s){const n=e.type;if(!e.render){if(!t&&Wl&&!n.render){const a=n.template||gc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=je(je({isCustomElement:i,delimiters:r},l),o);n.render=Wl(a,c)}}e.render=n.render||zt,Io&&Io(e)}{const a=ri(e);Sn();try{vb(e)}finally{Tn(),a()}}}const Qb={get(e,t){return Kt(e,"get",""),e[t]}};function Vf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Qb),slots:e.slots,emit:e.emit,expose:t}}function ll(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(rc(Fp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ai)return Ai[s](e)},has(t,s){return s in t||s in Ai}})):e.proxy}function Oo(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function Xb(e){return Fe(e)&&"__vccOpts"in e}const J=(e,t)=>ig(e,t,fa);function Za(e,t,s){try{qi(-1);const n=arguments.length;return n===2?Xe(t)&&!Re(t)?En(t)?ht(e,null,[t]):ht(e,t):ht(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&En(s)&&(s=[s]),ht(e,t,s))}finally{qi(1)}}function ey(){}function ty(e,t,s,n){const a=s[n];if(a&&qf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function qf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Pt(s[n],t[n]))return!1;return pa>0&&Wt&&Wt.push(e),!0}const Gf="3.5.38",sy=zt,ny=hg,ay=La,iy=Gp,ly={createComponentInstance:Bf,setupComponent:Hf,renderComponentRoot:Rl,setCurrentRenderingInstance:Hi,isVNode:En,normalizeVNode:us,getComponentPublicInstance:ll,ensureValidVNode:vc,pushWarningContext:dg,popWarningContext:ug},ry=ly,oy=null,cy=null,dy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Lo;const Rd=typeof window<"u"&&window.trustedTypes;if(Rd)try{Lo=Rd.createPolicy("vue",{createHTML:e=>e})}catch{}const Kf=Lo?e=>Lo.createHTML(e):e=>e,uy="http://www.w3.org/2000/svg",py="http://www.w3.org/1998/Math/MathML",un=typeof document<"u"?document:null,Id=un&&un.createElement("template"),Wf={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?un.createElementNS(uy,e):t==="mathml"?un.createElementNS(py,e):s?un.createElement(e,{is:s}):un.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>un.createTextNode(e),createComment:e=>un.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>un.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Id.innerHTML=Kf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Id.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},On="transition",fi="animation",Ja=Symbol("_vtc"),Zf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Jf=je({},uc,Zf),fy=e=>(e.displayName="Transition",e.props=Jf,e),hy=fy((e,{slots:t})=>Za(tf,Yf(e),t)),Xn=(e,t=[])=>{Re(e)?e.forEach(s=>s(...t)):e&&e(...t)},Od=e=>e?Re(e)?e.some(t=>t.length>1):e.length>1:!1;function Yf(e){const t={};for(const D in e)D in Zf||(t[D]=e[D]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=my(a),b=m&&m[0],E=m&&m[1],{onBeforeEnter:R,onEnter:S,onEnterCancelled:g,onLeave:_,onLeaveCancelled:C,onBeforeAppear:v=R,onAppear:w=S,onAppearCancelled:T=g}=t,y=(D,N,q,ae)=>{D._enterCancelled=ae,Pn(D,N?d:r),Pn(D,N?c:l),q&&q()},I=(D,N)=>{D._isLeaving=!1,Pn(D,u),Pn(D,f),Pn(D,p),N&&N()},F=D=>(N,q)=>{const ae=D?w:S,U=()=>y(N,D,q);Xn(ae,[N,U]),Ld(()=>{Pn(N,D?o:i),Ws(N,D?d:r),Od(ae)||Nd(N,n,b,U)})};return je(t,{onBeforeEnter(D){Xn(R,[D]),Ws(D,i),Ws(D,l)},onBeforeAppear(D){Xn(v,[D]),Ws(D,o),Ws(D,c)},onEnter:F(!1),onAppear:F(!0),onLeave(D,N){D._isLeaving=!0;const q=()=>I(D,N);Ws(D,u),D._enterCancelled?(Ws(D,p),No(D)):(No(D),Ws(D,p)),Ld(()=>{D._isLeaving&&(Pn(D,u),Ws(D,f),Od(_)||Nd(D,n,E,q))}),Xn(_,[D,q])},onEnterCancelled(D){y(D,!1,void 0,!0),Xn(g,[D])},onAppearCancelled(D){y(D,!0,void 0,!0),Xn(T,[D])},onLeaveCancelled(D){I(D),Xn(C,[D])}})}function my(e){if(e==null)return null;if(Xe(e))return[Jr(e.enter),Jr(e.leave)];{const t=Jr(e);return[t,t]}}function Jr(e){return Dl(e)}function Ws(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ja]||(e[Ja]=new Set)).add(t)}function Pn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ja];s&&(s.delete(t),s.size||(e[Ja]=void 0))}function Ld(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let vy=0;function Nd(e,t,s,n){const a=e._endId=++vy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Qf(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function Qf(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${On}Delay`),i=n(`${On}Duration`),l=Md(a,i),r=n(`${fi}Delay`),o=n(`${fi}Duration`),c=Md(r,o);let d=null,u=0,p=0;t===On?l>0&&(d=On,u=l,p=i.length):t===fi?c>0&&(d=fi,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?On:fi:null,p=d?d===On?i.length:o.length:0);const f=d===On&&/\b(?:transform|all)(?:,|$)/.test(n(`${On}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function Md(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Pd(s)+Pd(e[n])))}function Pd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function No(e){return(e?e.ownerDocument:document).body.offsetHeight}function gy(e,t,s){const n=e[Ja];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Zl=Symbol("_vod"),Sc=Symbol("_vsh"),Xf={name:"show",beforeMount(e,{value:t},{transition:s}){e[Zl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):hi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),hi(e,!0),n.enter(e)):n.leave(e,()=>{hi(e,!1)}):hi(e,t))},beforeUnmount(e,{value:t}){hi(e,t)}};function hi(e,t){e.style.display=t?e[Zl]:"none",e[Sc]=!t}function by(){Xf.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const eh=Symbol("");function yy(e){const t=ls();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Jl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Jl(t.ce,a):Mo(t.subTree,a),s(a)};fc(()=>{Bi(n)}),Ke(()=>{is(n,zt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>a.disconnect())})}function Mo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Mo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Jl(e.el,t);else if(e.type===Dt)e.children.forEach(s=>Mo(s,t));else if(e.type===ca){let{el:s,anchor:n}=e;for(;s&&(Jl(s,t),s!==n);)s=s.nextSibling}}function Jl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Tv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[eh]=n}}const xy=/(?:^|;)\s*display\s*:/;function _y(e,t,s){const n=e.style,a=$e(s);let i=!1;if(s&&!a){if(t)if($e(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ki(n,r,"")}else for(const l in t)s[l]==null&&ki(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?ky(e,l,!$e(t)&&t?t[l]:void 0,r)||ki(n,l,r):ki(n,l,"")}}else if(a){if(t!==s){const l=n[eh];l&&(s+=";"+l),n.cssText=s,i=xy.test(s)}}else t&&e.removeAttribute("style");Zl in e&&(e[Zl]=i?n.display:"",e[Sc]&&(n.display="none"))}const Dd=/\s*!important$/;function ki(e,t,s){if(Re(s))s.forEach(n=>ki(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=wy(e,t);Dd.test(s)?e.setProperty(ps(n),s.replace(Dd,""),"important"):e[n]=s}}const Fd=["Webkit","Moz","ms"],Yr={};function wy(e,t){const s=Yr[t];if(s)return s;let n=lt(t);if(n!=="filter"&&n in e)return Yr[t]=n;n=ba(n);for(let a=0;a<Fd.length;a++){const i=Fd[a]+n;if(i in e)return Yr[t]=i}return t}function ky(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&$e(n)&&s===n}const $d="http://www.w3.org/1999/xlink";function Bd(e,t,s,n,a,i=kv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS($d,t.slice(6,t.length)):e.setAttributeNS($d,t,s):s==null||i&&!gp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Yt(s)?String(s):s)}function Ud(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Kf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=gp(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function vn(e,t,s,n){e.addEventListener(t,s,n)}function Sy(e,t,s,n){e.removeEventListener(t,s,n)}const Hd=Symbol("_vei");function Ty(e,t,s,n,a=null){const i=e[Hd]||(e[Hd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=Cy(t);if(n){const c=i[t]=Ry(n,a);vn(e,r,c,o)}else l&&(Sy(e,r,l,o),i[t]=void 0)}}const zd=/(?:Once|Passive|Capture)$/;function Cy(e){let t;if(zd.test(e)){t={};let n;for(;n=e.match(zd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ps(e.slice(2)),t]}let Qr=0;const Ey=Promise.resolve(),Ay=()=>Qr||(Ey.then(()=>Qr=0),Qr=Date.now());function Ry(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Re(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ys(c,t,5,r)}}else ys(a,t,5,[n])};return s.value=e,s.attached=Ay(),s}const jd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,th=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?gy(e,n,l):t==="style"?_y(e,s,n):va(t)?pr(t)||Ty(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Iy(e,t,n,l))?(Ud(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Bd(e,t,n,l,i,t!=="value")):e._isVueCE&&(Oy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!$e(n)))?Ud(e,lt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Bd(e,t,n,l))};function Iy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&jd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return jd(t)&&$e(s)?!1:t in e}function Oy(e,t){const s=e._def.props;if(!s)return!1;const n=lt(t);return Array.isArray(s)?s.some(a=>lt(a)===n):Object.keys(s).some(a=>lt(a)===n)}const Vd={};function sh(e,t,s){let n=al(e,t);fr(n)&&(n=je({},n,t));class a extends Ir{constructor(l){super(n,l,s)}}return a.def=n,a}const Ly=((e,t)=>sh(e,t,mh)),Ny=typeof HTMLElement<"u"?HTMLElement:class{};class Ir extends Ny{constructor(t,s={},n=Xl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Xl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Ir){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ct(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!Re(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Dl(this._props[o])),(r||(r=Object.create(null)))[lt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>en(s[n])})}_resolveProps(t){const{props:s}=t,n=Re(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(lt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Vd;const a=lt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Dl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Vd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ps(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ps(t),s+""):s||this.removeAttribute(ps(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),hh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ht(this._def,je(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,fr(l[0])?je({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),ps(i)!==i&&a(ps(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function nh(e){const t=ls(),s=t&&t.ce;return s||null}function My(){const e=nh();return e&&e.shadowRoot}function Py(e="$style"){{const t=ls();if(!t)return Ve;const s=t.type.__cssModules;if(!s)return Ve;const n=s[e];return n||Ve}}const ah=new WeakMap,ih=new WeakMap,Yl=Symbol("_moveCb"),qd=Symbol("_enterCb"),Dy=e=>(delete e.props.mode,e),Fy=Dy({name:"TransitionGroup",props:je({},Jf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=ls(),n=dc();let a,i;return Cr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!zy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(By),a.forEach(Uy);const r=a.filter(Hy);No(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Ws(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Yl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Yl]=null,Pn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),r=Yf(l);let o=l.tag||Dt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Sc]&&(a.push(d),Cn(d,Wa(d,r,n,s)),ah.set(d,lh(d.el)))}i=t.default?Sr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Cn(d,Wa(d,r,n,s))}return ht(o,null,i)}}}),$y=Fy;function By(e){const t=e.el;t[Yl]&&t[Yl](),t[qd]&&t[qd]()}function Uy(e){ih.set(e,lh(e.el))}function Hy(e){const t=ah.get(e),s=ih.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function lh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function zy(e,t,s){const n=e.cloneNode(),a=e[Ja];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Qf(n);return i.removeChild(n),l}const zn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Re(t)?s=>Ua(t,s):t};function jy(e){e.target.composing=!0}function Gd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Os=Symbol("_assign");function Kd(e,t,s){return t&&(e=e.trim()),s&&(e=vr(e)),e}const Ql={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Os]=zn(a);const i=n||a.props&&a.props.type==="number";vn(e,t?"change":"input",l=>{l.target.composing||e[Os](Kd(e.value,s,i))}),(s||i)&&vn(e,"change",()=>{e.value=Kd(e.value,s,i)}),t||(vn(e,"compositionstart",jy),vn(e,"compositionend",Gd),vn(e,"change",Gd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Os]=zn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?vr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},Tc={deep:!0,created(e,t,s){e[Os]=zn(s),vn(e,"change",()=>{const n=e._modelValue,a=Ya(e),i=e.checked,l=e[Os];if(Re(n)){const r=br(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(ga(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(oh(e,i))})},mounted:Wd,beforeUpdate(e,t,s){e[Os]=zn(s),Wd(e,t,s)}};function Wd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Re(t))a=br(t,n.props.value)>-1;else if(ga(t))a=t.has(n.props.value);else{if(t===s)return;a=kn(t,oh(e,!0))}e.checked!==a&&(e.checked=a)}const Cc={created(e,{value:t},s){e.checked=kn(t,s.props.value),e[Os]=zn(s),vn(e,"change",()=>{e[Os](Ya(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Os]=zn(n),t!==s&&(e.checked=kn(t,n.props.value))}},rh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=ga(t);vn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?vr(Ya(l)):Ya(l));e[Os](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ct(()=>{e._assigning=!1})}),e[Os]=zn(n)},mounted(e,{value:t}){Zd(e,t)},beforeUpdate(e,t,s){e[Os]=zn(s)},updated(e,{value:t}){e._assigning||Zd(e,t)}};function Zd(e,t){const s=e.multiple,n=Re(t);if(!(s&&!n&&!ga(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ya(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=br(t,r)>-1}else l.selected=t.has(r);else if(kn(Ya(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ya(e){return"_value"in e?e._value:e.value}function oh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ch={created(e,t,s){_l(e,t,s,null,"created")},mounted(e,t,s){_l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){_l(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){_l(e,t,s,n,"updated")}};function dh(e,t){switch(e){case"SELECT":return rh;case"TEXTAREA":return Ql;default:switch(t){case"checkbox":return Tc;case"radio":return Cc;default:return Ql}}}function _l(e,t,s,n,a){const l=dh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Vy(){Ql.getSSRProps=({value:e})=>({value:e}),Cc.getSSRProps=({value:e},t)=>{if(t.props&&kn(t.props.value,e))return{checked:!0}},Tc.getSSRProps=({value:e},t)=>{if(Re(e)){if(t.props&&br(e,t.props.value)>-1)return{checked:!0}}else if(ga(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ch.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=dh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const qy=["ctrl","shift","alt","meta"],Gy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>qy.some(s=>e[`${s}Key`]&&!t.includes(s))},Ky=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Gy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Wy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Zy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=ps(a.key);if(t.some(l=>l===i||Wy[l]===i))return e(a)}))},uh=je({patchProp:th},Wf);let Ii,Jd=!1;function ph(){return Ii||(Ii=Tf(uh))}function fh(){return Ii=Jd?Ii:Cf(uh),Jd=!0,Ii}const hh=((...e)=>{ph().render(...e)}),Jy=((...e)=>{fh().hydrate(...e)}),Xl=((...e)=>{const t=ph().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=gh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,vh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),mh=((...e)=>{const t=fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=gh(n);if(a)return s(a,!0,vh(a))},t});function vh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function gh(e){return $e(e)?document.querySelector(e):e}let Yd=!1;const Yy=()=>{Yd||(Yd=!0,Vy(),by())},Qy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:tf,BaseTransitionPropsValidators:uc,Comment:St,DeprecationTypes:dy,EffectScope:tc,ErrorCodes:fg,ErrorTypeStrings:ny,Fragment:Dt,KeepAlive:Gg,ReactiveEffect:Di,Static:ca,Suspense:$b,Teleport:Ag,Text:Un,TrackOpTypes:lg,Transition:hy,TransitionGroup:$y,TriggerOpTypes:rg,VueElement:Ir,assertNumber:pg,callWithAsyncErrorHandling:ys,callWithErrorHandling:li,camelize:lt,capitalize:ba,cloneVNode:sn,compatUtils:cy,computed:J,createApp:Xl,createBlock:Gl,createCommentVNode:Ff,createElementBlock:Vb,createElementVNode:_c,createHydrationRenderer:Cf,createPropsRestProxy:hb,createRenderer:Tf,createSSRApp:mh,createSlots:Xg,createStaticVNode:Kb,createTextVNode:wc,createVNode:ht,customRef:Bp,defineAsyncComponent:Vg,defineComponent:al,defineCustomElement:sh,defineEmits:ab,defineExpose:ib,defineModel:ob,defineOptions:lb,defineProps:nb,defineSSRCustomElement:Ly,defineSlots:rb,devtools:ay,effect:Rv,effectScope:Cv,getCurrentInstance:ls,getCurrentScope:_p,getCurrentWatcher:og,getTransitionRawChildren:Sr,guardReactiveProps:Df,h:Za,handleError:ya,hasInjectionContext:_g,hydrate:Jy,hydrateOnIdle:$g,hydrateOnInteraction:zg,hydrateOnMediaQuery:Hg,hydrateOnVisible:Ug,initCustomFormatter:ey,initDirectivesForSSR:Yy,inject:Is,isMemoSame:qf,isProxy:sl,isReactive:xn,isReadonly:tn,isRef:At,isRuntimeOnly:Yb,isShallow:hs,isVNode:En,markRaw:Fp,mergeDefaults:pb,mergeModels:fb,mergeProps:$f,nextTick:Ct,nodeOps:Wf,normalizeClass:tl,normalizeProps:fv,normalizeStyle:el,onActivated:_s,onBeforeMount:af,onBeforeUnmount:Er,onBeforeUpdate:fc,onDeactivated:ws,onErrorCaptured:cf,onMounted:Ke,onRenderTracked:of,onRenderTriggered:rf,onScopeDispose:Ev,onServerPrefetch:lf,onUnmounted:_t,onUpdated:Cr,onWatcherCleanup:Hp,openBlock:Vi,patchProp:th,popScopeId:bg,provide:Ei,proxyRefs:rc,pushScopeId:gg,queuePostFlushCb:Bi,reactive:jn,readonly:$l,ref:h,registerRuntimeCompiler:zf,render:hh,renderList:Qg,renderSlot:eb,resolveComponent:Zg,resolveDirective:Yg,resolveDynamicComponent:Jg,resolveFilter:oy,resolveTransitionHooks:Wa,setBlockTracking:qi,setDevtoolsHook:iy,setTransitionHooks:Cn,shallowReactive:ic,shallowReadonly:Wv,shallowRef:lc,ssrContextKey:Kp,ssrUtils:ry,stop:Iv,toDisplayString:yp,toHandlerKey:Ba,toHandlers:tb,toRaw:Ze,toRef:ng,toRefs:eg,toValue:Yv,transformVNodeArgs:qb,triggerRef:Jv,unref:en,useAttrs:ub,useCssModule:Py,useCssVars:yy,useHost:nh,useId:Ig,useModel:kb,useSSRContext:Wp,useShadowRoot:My,useSlots:db,useTemplateRef:Og,useTransitionState:dc,vModelCheckbox:Tc,vModelDynamic:ch,vModelRadio:Cc,vModelSelect:rh,vModelText:Ql,vShow:Xf,version:Gf,warn:sy,watch:is,watchEffect:wg,watchPostEffect:kg,watchSyncEffect:Zp,withAsyncContext:mb,withCtx:cc,withDefaults:cb,withDirectives:xg,withKeys:Zy,withMemo:ty,withModifiers:Ky,withScopeId:yg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ki=Symbol(""),Oi=Symbol(""),Ec=Symbol(""),er=Symbol(""),bh=Symbol(""),ha=Symbol(""),yh=Symbol(""),xh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),rl=Symbol(""),Ic=Symbol(""),_h=Symbol(""),Oc=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),Mc=Symbol(""),Pc=Symbol(""),Dc=Symbol(""),wh=Symbol(""),kh=Symbol(""),Or=Symbol(""),tr=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Wi=Symbol(""),ol=Symbol(""),Bc=Symbol(""),Po=Symbol(""),Xy=Symbol(""),Do=Symbol(""),sr=Symbol(""),ex=Symbol(""),tx=Symbol(""),Uc=Symbol(""),sx=Symbol(""),nx=Symbol(""),Hc=Symbol(""),Sh=Symbol(""),Qa={[Ki]:"Fragment",[Oi]:"Teleport",[Ec]:"Suspense",[er]:"KeepAlive",[bh]:"BaseTransition",[ha]:"openBlock",[yh]:"createBlock",[xh]:"createElementBlock",[Ac]:"createVNode",[Rc]:"createElementVNode",[rl]:"createCommentVNode",[Ic]:"createTextVNode",[_h]:"createStaticVNode",[Oc]:"resolveComponent",[Lc]:"resolveDynamicComponent",[Nc]:"resolveDirective",[Mc]:"resolveFilter",[Pc]:"withDirectives",[Dc]:"renderList",[wh]:"renderSlot",[kh]:"createSlots",[Or]:"toDisplayString",[tr]:"mergeProps",[Fc]:"normalizeClass",[$c]:"normalizeStyle",[Wi]:"normalizeProps",[ol]:"guardReactiveProps",[Bc]:"toHandlers",[Po]:"camelize",[Xy]:"capitalize",[Do]:"toHandlerKey",[sr]:"setBlockTracking",[ex]:"pushScopeId",[tx]:"popScopeId",[Uc]:"withCtx",[sx]:"unref",[nx]:"isRef",[Hc]:"withMemo",[Sh]:"isMemoSame"};function ax(e){Object.getOwnPropertySymbols(e).forEach(t=>{Qa[t]=e[t]})}const ks={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ix(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ks}}function Zi(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=ks){return e&&(r?(e.helper(ha),e.helper(ti(e.inSSR,c))):e.helper(ei(e.inSSR,c)),l&&e.helper(Pc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function da(e,t=ks){return{type:17,loc:t,elements:e}}function Rs(e,t=ks){return{type:15,loc:t,properties:e}}function Et(e,t){return{type:16,loc:ks,key:$e(e)?He(e,!0):e,value:t}}function He(e,t=!1,s=ks,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Bs(e,t=ks){return{type:8,loc:t,children:e}}function Nt(e,t=[],s=ks){return{type:14,loc:s,callee:e,arguments:t}}function Xa(e,t=void 0,s=!1,n=!1,a=ks){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Fo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ks}}function lx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ks}}function rx(e){return{type:21,body:e,loc:ks}}function ei(e,t){return e||t?Ac:Rc}function ti(e,t){return e||t?yh:xh}function zc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ei(n,e.isComponent)),t(ha),t(ti(n,e.isComponent)))}const Qd=new Uint8Array([123,123]),Xd=new Uint8Array([125,125]);function eu(e){return e>=97&&e<=122||e>=65&&e<=90}function gs(e){return e===32||e===10||e===9||e===12||e===13}function Ln(e){return e===47||e===62||gs(e)}function nr(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Vt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class ox{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Qd,this.delimiterClose=Xd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Qd,this.delimiterClose=Xd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Ln(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||gs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Vt.TitleEnd||this.currentSequence===Vt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Vt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Vt.Cdata.length&&(this.state=28,this.currentSequence=Vt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Vt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):eu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Ln(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Ln(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(nr("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){gs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=eu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||gs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):gs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):gs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Ln(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Ln(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Ln(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Ln(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Ln(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):gs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):gs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){gs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Vt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Vt.ScriptEnd[3]?this.startSpecial(Vt.ScriptEnd,4):t===Vt.StyleEnd[3]?this.startSpecial(Vt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Vt.TitleEnd[3]?this.startSpecial(Vt.TitleEnd,4):t===Vt.TextareaEnd[3]?this.startSpecial(Vt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Vt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function tu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ua(e,t){const s=tu("MODE",t),n=tu(e,t);return s===3?n===!0:n!==!1}function Ji(e,t,s,...n){return ua(e,t)}function jc(e){throw e}function Th(e){}function ft(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const fs=e=>e.type===4&&e.isStatic;function Ch(e){switch(e){case"Teleport":case"teleport":return Oi;case"Suspense":case"suspense":return Ec;case"KeepAlive":case"keep-alive":return er;case"BaseTransition":case"base-transition":return bh}}const cx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Vc=e=>!cx.test(e),Eh=/[A-Za-z_$\xA0-\uFFFF]/,dx=/[\.\?\w$\xA0-\uFFFF]/,ux=/\s+[.[]\s*|\s*[.[]\s+/g,Ah=e=>e.type===4?e.content:e.loc.source,px=e=>{const t=Ah(e).trim().replace(ux,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?Eh:dx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},Rh=px,fx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,hx=e=>fx.test(Ah(e)),mx=hx;function As(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&($e(t)?a.name===t:t.test(a.name)))return a}}function Lr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&aa(i.arg,t))return i}}function aa(e,t){return!!(e&&fs(e)&&e.content===t)}function vx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Xr(e){return e.type===5||e.type===2}function su(e){return e.type===7&&e.name==="pre"}function gx(e){return e.type===7&&e.name==="slot"}function ar(e){return e.type===1&&e.tagType===3}function ir(e){return e.type===1&&e.tagType===2}const bx=new Set([Wi,ol]);function Ih(e,t=[]){if(e&&!$e(e)&&e.type===14){const s=e.callee;if(!$e(s)&&bx.has(s))return Ih(e.arguments[0],t.concat(e))}return[e,t]}function lr(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!$e(a)&&a.type===14){const r=Ih(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||$e(a))n=Rs([t]);else if(a.type===14){const r=a.arguments[0];!$e(r)&&r.type===15?nu(t,r)||r.properties.unshift(t):a.callee===Bc?n=Nt(s.helper(tr),[Rs([t]),a]):a.arguments.unshift(Rs([t])),!n&&(n=a)}else a.type===15?(nu(t,a)||a.properties.unshift(t),n=a):(n=Nt(s.helper(tr),[Rs([t]),a]),l&&l.callee===ol&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function nu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Yi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function yx(e){return e.type===14&&e.callee===Hc?e.arguments[1].returns:e}const xx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Oh(e){for(let t=0;t<e.length;t++)if(!gs(e.charCodeAt(t)))return!1;return!0}function qc(e){return e.type===2&&Oh(e.content)||e.type===12&&qc(e.content)}function Lh(e){return e.type===3||qc(e)}const Nh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Pa,isPreTag:Pa,isIgnoreNewlineTag:Pa,isCustomElement:Pa,onError:jc,onWarn:Th,comments:!1,prefixIdentifiers:!1};let Qe=Nh,Qi=null,wn="",Gt=null,Ge=null,os="",dn=-1,ta=-1,Gc=0,$n=!1,$o=null;const pt=[],xt=new ox(pt,{onerr:rn,ontext(e,t){wl(Bt(e,t),e,t)},ontextentity(e,t,s){wl(e,t,s)},oninterpolation(e,t){if($n)return wl(Bt(e,t),e,t);let s=e+xt.delimiterOpen.length,n=t-xt.delimiterClose.length;for(;gs(wn.charCodeAt(s));)s++;for(;gs(wn.charCodeAt(n-1));)n--;let a=Bt(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),Bo({type:5,content:Ll(a,!1,kt(s,n)),loc:kt(e,t)})},onopentagname(e,t){const s=Bt(e,t);Gt={type:1,tag:s,ns:Qe.getNamespace(s,pt[0],Qe.ns),tagType:0,props:[],children:[],loc:kt(e-1,t),codegenNode:void 0}},onopentagend(e){iu(e)},onclosetag(e,t){const s=Bt(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<pt.length;a++)if(pt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&rn(24,pt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=pt.shift();Ol(r,t,l<a)}break}n||rn(23,Mh(e,60))}},onselfclosingtag(e){const t=Gt.tag;Gt.isSelfClosing=!0,iu(e),pt[0]&&pt[0].tag===t&&Ol(pt.shift(),e)},onattribname(e,t){Ge={type:6,name:Bt(e,t),nameLoc:kt(e,t),value:void 0,loc:kt(e)}},ondirname(e,t){const s=Bt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!$n&&n===""&&rn(26,e),$n||n==="")Ge={type:6,name:s,nameLoc:kt(e,t),value:void 0,loc:kt(e)};else if(Ge={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[He("prop")]:[],loc:kt(e)},n==="pre"){$n=xt.inVPre=!0,$o=Gt;const a=Gt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Ix(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Bt(e,t);if($n&&!su(Ge))Ge.name+=s,ia(Ge.nameLoc,t);else{const n=s[0]!=="[";Ge.arg=Ll(n?s:s.slice(1,-1),n,kt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Bt(e,t);if($n&&!su(Ge))Ge.name+="."+s,ia(Ge.nameLoc,t);else if(Ge.name==="slot"){const n=Ge.arg;n&&(n.content+="."+s,ia(n.loc,t))}else{const n=He(s,!0,kt(e,t));Ge.modifiers.push(n)}},onattribdata(e,t){os+=Bt(e,t),dn<0&&(dn=e),ta=t},onattribentity(e,t,s){os+=e,dn<0&&(dn=t),ta=s},onattribnameend(e){const t=Ge.loc.start.offset,s=Bt(t,e);Ge.type===7&&(Ge.rawName=s),Gt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&rn(2,t)},onattribend(e,t){if(Gt&&Ge){if(ia(Ge.loc,t),e!==0)if(os.includes("&")&&(os=Qe.decodeEntities(os,!0)),Ge.type===6)Ge.name==="class"&&(os=Dh(os).trim()),e===1&&!os&&rn(13,t),Ge.value={type:2,content:os,loc:e===1?kt(dn,ta):kt(dn-1,ta+1)},xt.inSFCRoot&&Gt.tag==="template"&&Ge.name==="lang"&&os&&os!=="html"&&xt.enterRCDATA(nr("</template"),0);else{let s=0;Ge.exp=Ll(os,!1,kt(dn,ta),0,s),Ge.name==="for"&&(Ge.forParseResult=wx(Ge.exp));let n=-1;Ge.name==="bind"&&(n=Ge.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ji("COMPILER_V_BIND_SYNC",Qe,Ge.loc,Ge.arg.loc.source)&&(Ge.name="model",Ge.modifiers.splice(n,1))}(Ge.type!==7||Ge.name!=="pre")&&Gt.props.push(Ge)}os="",dn=ta=-1},oncomment(e,t){Qe.comments&&Bo({type:3,content:Bt(e,t),loc:kt(e-4,t+3)})},onend(){const e=wn.length;for(let t=0;t<pt.length;t++)Ol(pt[t],e-1),rn(24,pt[t].loc.start.offset)},oncdata(e,t){(pt[0]?pt[0].ns:Qe.ns)!==0?wl(Bt(e,t),e,t):rn(1,e-9)},onprocessinginstruction(e){(pt[0]?pt[0].ns:Qe.ns)===0&&rn(21,e-1)}}),au=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,_x=/^\(|\)$/g;function wx(e){const t=e.loc,s=e.content,n=s.match(xx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,b=m+u.length;return Ll(u,!1,kt(m,b),0,f?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(_x,"").trim();const c=a.indexOf(o),d=o.match(au);if(d){o=o.replace(au,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(r.index=l(f,s.indexOf(f,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Bt(e,t){return wn.slice(e,t)}function iu(e){xt.inSFCRoot&&(Gt.innerLoc=kt(e+1,e+1)),Bo(Gt);const{tag:t,ns:s}=Gt;s===0&&Qe.isPreTag(t)&&Gc++,Qe.isVoidTag(t)?Ol(Gt,e):(pt.unshift(Gt),(s===1||s===2)&&(xt.inXML=!0)),Gt=null}function wl(e,t,s){{const i=pt[0]&&pt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=pt[0]||Qi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,ia(a.loc,s)):n.children.push({type:2,content:e,loc:kt(t,s)})}function Ol(e,t,s=!1){s?ia(e.loc,Mh(t,60)):ia(e.loc,kx(t,62)+1),xt.inSFCRoot&&(e.children.length?e.innerLoc.end=je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=je({},e.innerLoc.start),e.innerLoc.source=Bt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if($n||(n==="slot"?e.tagType=2:lu(e)?e.tagType=3:Tx(e)&&(e.tagType=1)),xt.inRCDATA||(e.children=Ph(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Gc--,$o===e&&($n=xt.inVPre=!1,$o=null),xt.inXML&&(pt[0]?pt[0].ns:Qe.ns)===0&&(xt.inXML=!1);{const l=e.props;if(!xt.inSFCRoot&&ua("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!lu(e)){const o=pt[0]||Qi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Ji("COMPILER_INLINE_TEMPLATE",Qe,r.loc)&&e.children.length&&(r.value={type:2,content:Bt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function kx(e,t){let s=e;for(;wn.charCodeAt(s)!==t&&s<wn.length-1;)s++;return s}function Mh(e,t){let s=e;for(;wn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Sx=new Set(["if","else","else-if","for","slot"]);function lu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Sx.has(t[s].name))return!0}return!1}function Tx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||Cx(e.charCodeAt(0))||Ch(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ji("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&aa(n.arg,"is")&&Ji("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function Cx(e){return e>64&&e<91}const Ex=/\r\n/g;function Ph(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Gc)a.content=a.content.replace(Ex,`
`);else if(Oh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Ax(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Dh(a.content))}return s?e.filter(Boolean):e}function Ax(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Dh(e){let t="",s=!1;for(let n=0;n<e.length;n++)gs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Bo(e){(pt[0]||Qi).children.push(e)}function kt(e,t){return{start:xt.getPos(e),end:t==null?t:xt.getPos(t),source:t==null?t:Bt(e,t)}}function Rx(e){return kt(e.start.offset,e.end.offset)}function ia(e,t){e.end=xt.getPos(t),e.source=Bt(e.start.offset,t)}function Ix(e){const t={type:6,name:e.rawName,nameLoc:kt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Ll(e,t=!1,s,n=0,a=0){return He(e,t,s,n)}function rn(e,t,s){Qe.onError(ft(e,kt(t,t)))}function Ox(){xt.reset(),Gt=null,Ge=null,os="",dn=-1,ta=-1,pt.length=0}function Lx(e,t){if(Ox(),wn=e,Qe=je({},Nh),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}xt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,xt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(xt.delimiterOpen=nr(s[0]),xt.delimiterClose=nr(s[1]));const n=Qi=ix([],e);return xt.parse(wn),n.loc=kt(0,e.length),n.children=Ph(n.children),Qi=null,n}function Nx(e,t){Nl(e,void 0,t,!!Fh(e))}function Fh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!ir(t[0])?t[0]:null}function Nl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:bs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&Bh(u,s)>=2){const b=Uh(u);b&&(f.props=s.hoist(b))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:bs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Nl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Nl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Nl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Re(e.codegenNode.children))e.codegenNode.children=o(da(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Re(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(da(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Re(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=As(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(da(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Re(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function bs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Bh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=bs(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=bs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ha),t.removeHelper(ti(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ei(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return bs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if($e(r)||Yt(r))continue;const o=bs(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Mx=new Set([Fc,$c,Wi,ol]);function $h(e,t){if(e.type===14&&!$e(e.callee)&&Mx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return bs(s,t);if(s.type===14)return $h(s,t)}return 0}function Bh(e,t){let s=3;const n=Uh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=bs(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=bs(r,t):r.type===14?c=$h(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Uh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Px(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=zt,isCustomElement:d=zt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:b=!1,ssrCssVars:E="",bindingMetadata:R=Ve,inline:S=!1,isTS:g=!1,onError:_=jc,onWarn:C=Th,compatConfig:v}){const w=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:w&&ba(lt(w[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:b,ssrCssVars:E,bindingMetadata:R,inline:S,isTS:g,onError:_,onWarn:C,compatConfig:v,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(y){const I=T.helpers.get(y)||0;return T.helpers.set(y,I+1),y},removeHelper(y){const I=T.helpers.get(y);if(I){const F=I-1;F?T.helpers.set(y,F):T.helpers.delete(y)}},helperString(y){return`_${Qa[T.helper(y)]}`},replaceNode(y){T.parent.children[T.childIndex]=T.currentNode=y},removeNode(y){const I=T.parent.children,F=y?I.indexOf(y):T.currentNode?T.childIndex:-1;!y||y===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>F&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(F,1)},onNodeRemoved:zt,addIdentifiers(y){},removeIdentifiers(y){},hoist(y){$e(y)&&(y=He(y)),T.hoists.push(y);const I=He(`_hoisted_${T.hoists.length}`,!1,y.loc,2);return I.hoisted=y,I},cache(y,I=!1,F=!1){const D=lx(T.cached.length,y,I,F);return T.cached.push(D),D}};return T.filters=new Set,T}function Dx(e,t){const s=Px(e,t);Nr(e,s),t.hoistStatic&&Nx(e,s),t.ssr||Fx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Fx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Fh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&zc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Zi(t,s(Ki),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function $x(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];$e(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Nr(a,t))}}function Nr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Re(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(rl);break;case 5:t.ssr||t.helper(Or);break;case 9:for(let i=0;i<e.branches.length;i++)Nr(e.branches[i],t);break;case 10:case 11:case 1:case 0:$x(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Hh(e,t){const s=$e(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(gx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Mr="/*@__PURE__*/",zh=e=>`${Qa[e]}: _${Qa[e]}`;function Bx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(b){return`_${Qa[b]}`},push(b,E=-2,R){f.code+=b},indent(){m(++f.indentLevel)},deindent(b=!1){b?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(b){f.push(`
`+"  ".repeat(b),0)}return f}function Ux(e,t={}){const s=Bx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Hx(e,s);const b=d?"ssrRender":"render",R=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${b}(${R}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(zh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(eo(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(eo(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),eo(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let S=0;S<e.temps;S++)a(`${S>0?", ":""}_temp${S}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Zt(e.codegenNode,s):a("null"),f&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Hx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Ac,Rc,rl,Ic,_h].filter(p=>d.includes(p)).map(zh).join(", ");a(`const { ${u} } = _Vue
`,-1)}zx(e.hoists,t),i(),a("return ")}function eo(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Mc:t==="component"?Oc:Nc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Yi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function zx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Zt(i,t),n())}t.pure=!1}function Kc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),cl(e,t,s),s&&t.deindent(),t.push("]")}function cl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];$e(r)?a(r,-3):Re(r)?Kc(r,t):Zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Zt(e,t){if($e(e)){t.push(e,-3);return}if(Yt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Zt(e.codegenNode,t);break;case 2:jx(e,t);break;case 4:jh(e,t);break;case 5:Vx(e,t);break;case 12:Zt(e.codegenNode,t);break;case 8:Vh(e,t);break;case 3:Gx(e,t);break;case 13:Kx(e,t);break;case 14:Zx(e,t);break;case 15:Jx(e,t);break;case 17:Yx(e,t);break;case 18:Qx(e,t);break;case 19:Xx(e,t);break;case 20:e0(e,t);break;case 21:cl(e.body,t,!0,!1);break}}function jx(e,t){t.push(JSON.stringify(e.content),-3,e)}function jh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Vx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mr),s(`${n(Or)}(`),Zt(e.content,t),s(")")}function Vh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];$e(n)?t.push(n,-3):Zt(n,t)}}function qx(e,t){const{push:s}=t;if(e.type===8)s("["),Vh(e,t),s("]");else if(e.isStatic){const n=Vc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Gx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mr),s(`${n(rl)}(${JSON.stringify(e.content)})`,-3,e)}function Kx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;o&&(m=String(o)),d&&s(n(Pc)+"("),u&&s(`(${n(ha)}(${p?"true":""}), `),a&&s(Mr);const b=u?ti(t.inSSR,f):ei(t.inSSR,f);s(n(b)+"(",-2,e),cl(Wx([i,l,r,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Zt(d,t),s(")"))}function Wx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Zx(e,t){const{push:s,helper:n,pure:a}=t,i=$e(e.callee)?e.callee:n(e.callee);a&&s(Mr),s(i+"(",-2,e),cl(e.arguments,t),s(")")}function Jx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];qx(c,t),s(": "),Zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Yx(e,t){Kc(e.elements,t)}function Qx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Qa[Uc]}(`),s("(",-2,e),Re(i)?cl(i,t):i&&Zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),Re(l)?Kc(l,t):Zt(l,t)):r&&Zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Xx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Vc(s.content);u&&l("("),jh(s,t),u&&l(")")}else l("("),Zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Zt(a,t),d||t.indentLevel--,i&&o(!0)}function e0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(sr)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(sr)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const t0=Hh(/^(?:if|else|else-if)$/,(e,t,s)=>s0(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=ou(a,o,s);else{const c=n0(n.codegenNode);c.alternate=ou(a,o+n.branches.length-1,s)}}}));function s0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ft(28,t.loc)),t.exp=He("true",!1,a)}if(t.name==="if"){const a=ru(e,t),i={type:9,loc:Rx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Lh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ft(30,e.loc)),s.removeNode();const r=ru(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Nr(r,s),o&&o(),s.currentNode=null}else s.onError(ft(30,e.loc));break}}}function ru(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!As(e,"for")?e.children:[e],userKey:Lr(e,"key"),isTemplateIf:s}}function ou(e,t,s){return e.condition?Fo(e.condition,cu(e,t,s),Nt(s.helper(rl),['""',"true"])):cu(e,t,s)}function cu(e,t,s){const{helper:n}=s,a=Et("key",He(`${t}`,!1,ks,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return lr(o,a,s),o}else return Zi(s,n(Ki),Rs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=yx(o);return c.type===13&&zc(c,s),lr(c,a,s),o}}function n0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a0=Hh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return i0(e,t,s,i=>{const l=Nt(n(Dc),[i.source]),r=ar(e),o=As(e,"memo"),c=Lr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?He(c.value.content,!0):void 0:c.exp);const u=d?Et("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Zi(s,n(Ki),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:b}=i,E=b.length!==1||b[0].type!==1,R=ir(e)?e:r&&e.children.length===1&&ir(e.children[0])?e.children[0]:null;if(R?(m=R.codegenNode,r&&u&&lr(m,u,s)):E?m=Zi(s,n(Ki),u?Rs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=b[0].codegenNode,r&&u&&lr(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ha),a(ti(s.inSSR,m.isComponent))):a(ei(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ha),n(ti(s.inSSR,m.isComponent))):n(ei(s.inSSR,m.isComponent))),o){const S=Xa(Uo(i.parseResult,[He("_cached")]));S.body=rx([Bs(["const _memo = (",o.exp,")"]),Bs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Sh)}(_cached, _memo)) return _cached`]),Bs(["const _item = ",m]),He("_item.memo = _memo"),He("return _item")]),l.arguments.push(S,He("_cache"),He(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Xa(Uo(i.parseResult),m,!0))}})});function i0(e,t,s,n){if(!t.exp){s.onError(ft(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ft(32,t.loc));return}qh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:ar(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const f=n&&n(p);return()=>{r.vFor--,f&&f()}}function qh(e,t){e.finalized||(e.finalized=!0)}function Uo({value:e,key:t,index:s},n=[]){return l0([e,t,s,...n])}function l0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||He("_".repeat(n+1),!1))}const du=He("undefined",!1),r0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=As(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},o0=(e,t,s,n)=>Xa(e,s,!1,!0,s.length?s[0].loc:n);function c0(e,t,s=o0){t.helper(Uc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=As(e,"slot",!0);if(o){const{arg:E,exp:R}=o;E&&!fs(E)&&(r=!0),i.push(Et(E||He("default",!0),s(R,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let E=0;E<n.length;E++){const R=n[E];let S;if(!ar(R)||!(S=As(R,"slot",!0))){R.type!==3&&u.push(R);continue}if(o){t.onError(ft(37,S.loc));break}c=!0;const{children:g,loc:_}=R,{arg:C=He("default",!0),exp:v,loc:w}=S;let T;fs(C)?T=C?C.content:"default":r=!0;const y=As(R,"for"),I=s(v,y,g,_);let F,D;if(F=As(R,"if"))r=!0,l.push(Fo(F.exp,kl(C,I,f++),du));else if(D=As(R,/^else(?:-if)?$/,!0)){let N=E,q;for(;N--&&(q=n[N],!!Lh(q)););if(q&&ar(q)&&As(q,/^(?:else-)?if$/)){let ae=l[l.length-1];for(;ae.alternate.type===19;)ae=ae.alternate;ae.alternate=D.exp?Fo(D.exp,kl(C,I,f++),du):kl(C,I,f++)}else t.onError(ft(30,D.loc))}else if(y){r=!0;const N=y.forParseResult;N?(qh(N),l.push(Nt(t.helper(Dc),[N.source,Xa(Uo(N),kl(C,I),!0)]))):t.onError(ft(32,y.loc))}else{if(T){if(p.has(T)){t.onError(ft(38,w));continue}p.add(T),T==="default"&&(d=!0)}i.push(Et(C,I))}}if(!o){const E=(R,S)=>{const g=s(R,void 0,S,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Et("default",g)};c?u.length&&!u.every(qc)&&(d?t.onError(ft(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,n))}const m=r?2:Ml(e.children)?3:1;let b=Rs(i.concat(Et("_",He(m+"",!1))),a);return l.length&&(b=Nt(t.helper(kh),[b,da(l)])),{slots:b,hasDynamicSlots:r}}function kl(e,t,s){const n=[Et("name",e),Et("fn",t)];return s!=null&&n.push(Et("key",He(String(s),!0))),Rs(n)}function Ml(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Ml(s.children))return!0;break;case 9:if(Ml(s.branches))return!0;break;case 10:case 11:if(Ml(s.children))return!0;break}}return!1}const Gh=new WeakMap,d0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?u0(e,t):`"${n}"`;const r=Xe(l)&&l.callee===Lc;let o,c,d=0,u,p,f,m=r||l===Oi||l===Ec||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const b=Kh(e,t,void 0,i,r);o=b.props,d=b.patchFlag,p=b.dynamicPropNames;const E=b.directives;f=E&&E.length?da(E.map(R=>f0(R,t))):void 0,b.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===er&&(m=!0,d|=1024),i&&l!==Oi&&l!==er){const{slots:E,hasDynamicSlots:R}=c0(e,t);c=E,R&&(d|=1024)}else if(e.children.length===1&&l!==Oi){const E=e.children[0],R=E.type,S=R===5||R===8;S&&bs(E,t)===0&&(d|=1),S||R===2?c=E:c=e.children}else c=e.children;p&&p.length&&(u=h0(p)),e.codegenNode=Zi(t,l,o,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function u0(e,t,s=!1){let{tag:n}=e;const a=Ho(n),i=Lr(e,"is",!1,!0);if(i)if(a||ua("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&He(i.value.content,!0):(r=i.exp,r||(r=He("is",!1,i.arg.loc))),r)return Nt(t.helper(Lc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Ch(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Oc),t.components.add(n),Yi(n,"component"))}function Kh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let f=!1,m=0,b=!1,E=!1,R=!1,S=!1,g=!1,_=!1;const C=[],v=I=>{c.length&&(d.push(Rs(uu(c),r)),c=[]),I&&d.push(I)},w=()=>{t.scopes.vFor>0&&c.push(Et(He("ref_for",!0),He("true")))},T=({key:I,value:F})=>{if(fs(I)){const D=I.content,N=va(D);if(N&&(!n||a)&&D.toLowerCase()!=="onclick"&&D!=="onUpdate:modelValue"&&!yn(D)&&(S=!0),N&&yn(D)&&(_=!0),N&&F.type===14&&(F=F.arguments[0]),F.type===20||(F.type===4||F.type===8)&&bs(F,t)>0)return;D==="ref"?b=!0:D==="class"?E=!0:D==="style"?R=!0:D!=="key"&&!C.includes(D)&&C.push(D),n&&(D==="class"||D==="style")&&!C.includes(D)&&C.push(D)}else g=!0};for(let I=0;I<s.length;I++){const F=s[I];if(F.type===6){const{loc:D,name:N,nameLoc:q,value:ae}=F;let U=!0;if(N==="ref"&&(b=!0,w()),N==="is"&&(Ho(l)||ae&&ae.content.startsWith("vue:")||ua("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Et(He(N,!0,q),He(ae?ae.content:"",U,ae?ae.loc:D)))}else{const{name:D,arg:N,exp:q,loc:ae,modifiers:U}=F,P=D==="bind",M=D==="on";if(D==="slot"){n||t.onError(ft(40,ae));continue}if(D==="once"||D==="memo"||D==="is"||P&&aa(N,"is")&&(Ho(l)||ua("COMPILER_IS_ON_ELEMENT",t))||M&&i)continue;if((P&&aa(N,"key")||M&&p&&aa(N,"vue:before-update"))&&(f=!0),P&&aa(N,"ref")&&w(),!N&&(P||M)){if(g=!0,q)if(P){if(v(),ua("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(q);continue}w(),v(),d.push(q)}else v({type:14,loc:ae,callee:t.helper(Bc),arguments:n?[q]:[q,"true"]});else t.onError(ft(P?34:35,ae));continue}P&&U.some(B=>B.content==="prop")&&(m|=32);const V=t.directiveTransforms[D];if(V){const{props:B,needRuntime:te}=V(F,e,t);!i&&B.forEach(T),M&&N&&!fs(N)?v(Rs(B,r)):c.push(...B),te&&(u.push(F),Yt(te)&&Gh.set(F,te))}else av(D)||(u.push(F),p&&(f=!0))}}let y;if(d.length?(v(),d.length>1?y=Nt(t.helper(tr),d,r):y=d[0]):c.length&&(y=Rs(uu(c),r)),g?m|=16:(E&&!n&&(m|=2),R&&!n&&(m|=4),C.length&&(m|=8),S&&(m|=32)),!f&&(m===0||m===32)&&(b||_||u.length>0)&&(m|=512),!t.inSSR&&y)switch(y.type){case 15:let I=-1,F=-1,D=!1;for(let ae=0;ae<y.properties.length;ae++){const U=y.properties[ae].key;fs(U)?U.content==="class"?I=ae:U.content==="style"&&(F=ae):U.isHandlerKey||(D=!0)}const N=y.properties[I],q=y.properties[F];D?y=Nt(t.helper(Wi),[y]):(N&&!fs(N.value)&&(N.value=Nt(t.helper(Fc),[N.value])),q&&(R||q.value.type===4&&q.value.content.trim()[0]==="["||q.value.type===17)&&(q.value=Nt(t.helper($c),[q.value])));break;case 14:break;default:y=Nt(t.helper(Wi),[Nt(t.helper(ol),[y])]);break}return{props:y,directives:u,patchFlag:m,dynamicPropNames:C,shouldUseBlock:f}}function uu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||va(i))&&p0(l,a):(t.set(i,a),s.push(a))}return s}function p0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=da([e.value,t.value],e.loc)}function f0(e,t){const s=[],n=Gh.get(e);n?s.push(t.helperString(n)):(t.helper(Nc),t.directives.add(e.name),s.push(Yi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=He("true",!1,a);s.push(Rs(e.modifiers.map(l=>Et(l,i)),a))}return da(s,e.loc)}function h0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Ho(e){return e==="component"||e==="Component"}const m0=(e,t)=>{if(ir(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=v0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Xa([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Nt(t.helper(wh),l,n)}};function v0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=lt(l.name),a.push(l)));else if(l.name==="bind"&&aa(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=lt(l.arg.content);s=l.exp=He(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&fs(l.arg)&&(l.arg.content=lt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Kh(e,t,a,!1,!1);n=i,l.length&&t.onError(ft(36,l[0].loc))}return{slotName:s,slotProps:n}}const Wh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ft(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ba(lt(u)):`on:${u}`;r=He(p,!0,l.loc)}else r=Bs([`${s.helperString(Do)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Do)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=Rh(o),p=!(u||mx(o)),f=o.content.includes(";");(p||c&&u)&&(o=Bs([`${p?"$event":"(...args)"} => ${f?"{":"("}`,o,f?"}":")"]))}let d={props:[Et(r,o||He("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},g0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=lt(i.content):i.content=`${s.helperString(Po)}(${i.content})`:(i.children.unshift(`${s.helperString(Po)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&pu(i,"."),n.some(r=>r.content==="attr")&&pu(i,"^")),{props:[Et(i,l)]}},pu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},b0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Xr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Xr(o))n||(n=s[i]=Bs([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Xr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&bs(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Nt(t.helper(Ic),r)}}}}},fu=new WeakSet,y0=(e,t)=>{if(e.type===1&&As(e,"once",!0))return fu.has(e)||t.inVOnce||t.inSSR?void 0:(fu.add(e),t.inVOnce=!0,t.helper(sr),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Zh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ft(41,e.loc)),mi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ft(44,n.loc)),mi();if(r==="literal-const"||r==="setup-const")return s.onError(ft(45,n.loc)),mi();if(!l.trim()||!Rh(n))return s.onError(ft(42,n.loc)),mi();const o=a||He("modelValue",!0),c=a?fs(a)?`onUpdate:${lt(a.content)}`:Bs(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Bs([`${u} => ((`,n,") = $event)"]);const p=[Et(o,e.exp),Et(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(b=>b.content).map(b=>(Vc(b)?b:JSON.stringify(b))+": true").join(", "),m=a?fs(a)?`${a.content}Modifiers`:Bs([a,' + "Modifiers"']):"modelModifiers";p.push(Et(m,He(`{ ${f} }`,!1,e.loc,2)))}return mi(p)};function mi(e=[]){return{props:e}}const x0=/[\w).+\-_$\]]/,_0=(e,t)=>{ua("COMPILER_FILTERS",t)&&(e.type===5?rr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&rr(s.exp,t)}))};function rr(e,t){if(e.type===4)hu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?hu(n,t):n.type===8?rr(e,t):n.type===5&&rr(n.content,t))}}function hu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,f,m,b=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!r&&!o&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):E();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let R=f-1,S;for(;R>=0&&(S=s.charAt(R),S===" ");R--);(!S||!x0.test(S))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&E();function E(){b.push(s.slice(d,f).trim()),d=f+1}if(b.length){for(f=0;f<b.length;f++)m=w0(m,b[f],t);e.content=m,e.ast=void 0}}function w0(e,t,s){s.helper(Mc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Yi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Yi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const mu=new WeakSet,k0=(e,t)=>{if(e.type===1){const s=As(e,"memo");return!s||mu.has(e)||t.inSSR?void 0:(mu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&zc(n,t),e.codegenNode=Nt(t.helper(Hc),[s.exp,Xa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},S0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ft(53,n.loc)),s.exp=He("",!0,n.loc);else{const a=lt(n.content);(Eh.test(a[0])||a[0]==="-")&&(s.exp=He(a,!1,n.loc))}}}};function T0(e){return[[S0,y0,t0,k0,a0,_0,m0,d0,r0,b0],{on:Wh,bind:g0,model:Zh}]}function C0(e,t={}){const s=t.onError||jc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ft(48)):n&&s(ft(49));const a=!1;t.cacheHandlers&&s(ft(50)),t.scopeId&&!n&&s(ft(51));const i=je({},t,{prefixIdentifiers:a}),l=$e(e)?Lx(e,i):e,[r,o]=T0();return Dx(l,je({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:je({},o,t.directiveTransforms||{})})),Ux(l,i)}const E0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),zo=Symbol(""),em=Symbol(""),tm=Symbol(""),sm=Symbol(""),nm=Symbol(""),am=Symbol("");ax({[Jh]:"vModelRadio",[Yh]:"vModelCheckbox",[Qh]:"vModelText",[Xh]:"vModelSelect",[zo]:"vModelDynamic",[em]:"withModifiers",[tm]:"withKeys",[sm]:"vShow",[nm]:"Transition",[am]:"TransitionGroup"});let Ea;function A0(e,t=!1){return Ea||(Ea=document.createElement("div")),t?(Ea.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ea.children[0].getAttribute("foo")):(Ea.innerHTML=e,Ea.textContent)}const R0={parseMode:"html",isVoidTag:_v,isNativeTag:e=>bv(e)||yv(e)||xv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:A0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return nm;if(e==="TransitionGroup"||e==="transition-group")return am},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},I0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:He("style",!0,t.loc),exp:O0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},O0=(e,t)=>{const s=vp(e);return He(JSON.stringify(s),!1,t,3)};function Hn(e,t){return ft(e,t)}const L0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Hn(54,a)),t.children.length&&(s.onError(Hn(55,a)),t.children.length=0),{props:[Et(He("innerHTML",!0,a),n||He("",!0))]}},N0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Hn(56,a)),t.children.length&&(s.onError(Hn(57,a)),t.children.length=0),{props:[Et(He("textContent",!0),n?bs(n,s)>0?n:Nt(s.helperString(Or),[n],a):He("",!0))]}},M0=(e,t,s)=>{const n=Zh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Hn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Qh,r=!1;if(a==="input"||i){const o=Lr(t,"type");if(o){if(o.type===7)l=zo;else if(o.value)switch(o.value.content){case"radio":l=Jh;break;case"checkbox":l=Yh;break;case"file":r=!0,s.onError(Hn(60,e.loc));break}}else vx(t)&&(l=zo)}else a==="select"&&(l=Xh);r||(n.needRuntime=s.helper(l))}else s.onError(Hn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},P0=xs("passive,once,capture"),D0=xs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),F0=xs("left,right"),im=xs("onkeyup,onkeydown,onkeypress"),$0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Ji("COMPILER_V_ON_NATIVE",s)||P0(o)?l.push(o):F0(o)?fs(e)?im(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):D0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},vu=(e,t)=>fs(e)&&e.content.toLowerCase()==="onclick"?He(t,!0):e.type!==4?Bs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,B0=(e,t,s)=>Wh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=$0(i,a,s,e.loc);if(o.includes("right")&&(i=vu(i,"onContextmenu")),o.includes("middle")&&(i=vu(i,"onMouseup")),o.length&&(l=Nt(s.helper(em),[l,JSON.stringify(o)])),r.length&&(!fs(i)||im(i.content.toLowerCase()))&&(l=Nt(s.helper(tm),[l,JSON.stringify(r)])),c.length){const d=c.map(ba).join("");i=fs(i)?He(`${i.content}${d}`,!0):Bs(["(",i,`) + "${d}"`])}return{props:[Et(i,l)]}}),U0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Hn(62,a)),{props:[],needRuntime:s.helper(sm)}},H0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},z0=[I0],j0={cloak:E0,html:L0,text:N0,model:M0,on:B0,show:U0};function V0(e,t={}){return C0(e,je({},R0,t,{nodeTransforms:[H0,...z0,...t.nodeTransforms||[]],directiveTransforms:je({},j0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const gu=Object.create(null);function q0(e,t){if(!$e(e))if(e.nodeType)e=e.innerHTML;else return zt;const s=rv(e,t),n=gu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=je({hoistStatic:!0,onError:void 0,onWarn:zt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=V0(e,a),l=new Function("Vue",i)(Qy);return l._rc=!0,gu[s]=l}zf(q0);const or=jn({items:[]});let G0=1;function Pr(e,t="info",s=3e3){const n=G0++;return or.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Wc(n),s),n}function Wc(e){const t=or.items.findIndex(s=>s.id===e);t>=0&&or.items.splice(t,1)}function Oe(e,t="info",s=3e3){return Pr(e,t,s)}Oe.success=(e,t=3e3)=>Pr(e,"success",t);Oe.error=(e,t=5e3)=>Pr(e,"error",t);Oe.info=(e,t=3e3)=>Pr(e,"info",t);Oe.dismiss=Wc;const K0={setup(){return{state:or,dismiss:Wc}},template:`
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
  `},fn=jn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let qa=null;function Jt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return qa&&qa(!1),fn.title=e,fn.message=t,fn.confirmLabel=s,fn.cancelLabel=n,fn.danger=a,fn.open=!0,new Promise(i=>{qa=i})}function bu(e){fn.open=!1,qa&&(qa(e),qa=null)}const W0={setup(){function e(t){fn.open&&t.key==="Escape"&&(t.stopPropagation(),bu(!1))}return Ke(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:fn,settle:bu}},template:`
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
 */const Na=typeof document<"u";function lm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Z0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&lm(e.default)}const st=Object.assign;function to(e,t){const s={};for(const n in t){const a=t[n];s[n]=Hs(a)?a.map(e):e(a)}return s}const Li=()=>{},Hs=Array.isArray;function yu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const rm=/#/g,J0=/&/g,Y0=/\//g,Q0=/=/g,X0=/\?/g,om=/\+/g,e_=/%5B/g,t_=/%5D/g,cm=/%5E/g,s_=/%60/g,dm=/%7B/g,n_=/%7C/g,um=/%7D/g,a_=/%20/g;function Zc(e){return e==null?"":encodeURI(""+e).replace(n_,"|").replace(e_,"[").replace(t_,"]")}function i_(e){return Zc(e).replace(dm,"{").replace(um,"}").replace(cm,"^")}function jo(e){return Zc(e).replace(om,"%2B").replace(a_,"+").replace(rm,"%23").replace(J0,"%26").replace(s_,"`").replace(dm,"{").replace(um,"}").replace(cm,"^")}function l_(e){return jo(e).replace(Q0,"%3D")}function r_(e){return Zc(e).replace(rm,"%23").replace(X0,"%3F")}function o_(e){return r_(e).replace(Y0,"%2F")}function Xi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const c_=/\/$/,d_=e=>e.replace(c_,"");function so(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=h_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Xi(l)}}function u_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function xu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function p_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&si(t.matched[n],s.matched[a])&&pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function si(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!f_(e[s],t[s]))return!1;return!0}function f_(e,t){return Hs(e)?_u(e,t):Hs(t)?_u(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function _u(e,t){return Hs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function h_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Nn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Vo=(function(e){return e.pop="pop",e.push="push",e})({}),no=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function m_(e){if(!e)if(Na){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),d_(e)}const v_=/^[^#]+#/;function g_(e,t){return e.replace(v_,"#")+t}function b_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Dr=()=>({left:window.scrollX,top:window.scrollY});function y_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=b_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function wu(e,t){return(history.state?history.state.position-t:-1)+e}const qo=new Map;function x_(e,t){qo.set(e,t)}function __(e){const t=qo.get(e);return qo.delete(e),t}function w_(e){return typeof e=="string"||e&&typeof e=="object"}function fm(e){return typeof e=="string"||typeof e=="symbol"}let yt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const hm=Symbol("");yt.MATCHER_NOT_FOUND+"",yt.NAVIGATION_GUARD_REDIRECT+"",yt.NAVIGATION_ABORTED+"",yt.NAVIGATION_CANCELLED+"",yt.NAVIGATION_DUPLICATED+"";function ni(e,t){return st(new Error,{type:e,[hm]:!0},t)}function on(e,t){return e instanceof Error&&hm in e&&(t==null||!!(e.type&t))}const k_=["params","query","hash"];function S_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of k_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function T_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(om," "),i=a.indexOf("="),l=Xi(i<0?a:a.slice(0,i)),r=i<0?null:Xi(a.slice(i+1));if(l in t){let o=t[l];Hs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function ku(e){let t="";for(let s in e){const n=e[s];if(s=l_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Hs(n)?n.map(a=>a&&jo(a)):[n&&jo(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function C_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Hs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const E_=Symbol(""),Su=Symbol(""),Fr=Symbol(""),Jc=Symbol(""),Go=Symbol("");function vi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Bn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(ni(yt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):w_(p)?o(ni(yt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function ao(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(lm(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Bn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=Z0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Bn(p,s,n,l,r,a)()}))}}return i}function A_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>si(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>si(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let R_=()=>location.protocol+"//"+location.host;function mm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),xu(r,"")}return xu(s,e)+n+a}function I_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const f=mm(e,location),m=s.value,b=t.value;let E=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}E=b?p.position-b.position:0}else n(f);a.forEach(R=>{R(s.value,m,{delta:E,type:Vo.pop,direction:E?E>0?no.forward:no.back:no.unknown})})};function o(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(st({},p.state,{scroll:Dr()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function Tu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Dr():null}}function O_(e){const{history:t,location:s}=window,n={value:mm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:R_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(o,c){i(o,st({},t.state,Tu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=st({},a.value,t.state,{forward:o,scroll:Dr()});i(d.current,d,!0),i(o,st({},Tu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function L_(e){e=m_(e);const t=O_(e),s=I_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=st({location:"",base:e,go:n,createHref:g_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function N_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),L_(e)}let la=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ot=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ot||{});const M_={type:la.Static,value:""},P_=/[a-zA-Z0-9_]/;function D_(e){if(!e)return[[]];if(e==="/")return[[M_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=Ot.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Ot.Static?i.push({type:la.Static,value:c}):s===Ot.Param||s===Ot.ParamRegExp||s===Ot.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:la.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Ot.ParamRegExp){n=s,s=Ot.EscapeNext;continue}switch(s){case Ot.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Ot.Param):p();break;case Ot.EscapeNext:p(),s=n;break;case Ot.Param:o==="("?s=Ot.ParamRegExp:P_.test(o)?p():(u(),s=Ot.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Ot.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Ot.ParamRegExpEnd:d+=o;break;case Ot.ParamRegExpEnd:u(),s=Ot.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Ot.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Cu="[^/]+?",F_={sensitive:!1,strict:!1,start:!0,end:!0};var ss=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ss||{});const $_=/[.+*?^${}()[\]/\\]/g;function B_(e,t){const s=st({},F_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ss.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ss.Segment+(s.sensitive?ss.BonusCaseSensitive:0);if(p.type===la.Static)u||(a+="/"),a+=p.value.replace($_,"\\$&"),f+=ss.Static;else if(p.type===la.Param){const{value:m,repeatable:b,optional:E,regexp:R}=p;i.push({name:m,repeatable:b,optional:E});const S=R||Cu;if(S!==Cu){f+=ss.BonusCustomRegExp;try{`${S}`}catch(_){throw new Error(`Invalid custom RegExp for param "${m}" (${S}): `+_.message)}}let g=b?`((?:${S})(?:/(?:${S}))*)`:`(${S})`;u||(g=E&&c.length<2?`(?:/${g})`:"/"+g),E&&(g+="?"),a+=g,f+=ss.Dynamic,E&&(f+=ss.BonusOptional),b&&(f+=ss.BonusRepeatable),S===".*"&&(f+=ss.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ss.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===la.Static)d+=f.value;else if(f.type===la.Param){const{value:m,repeatable:b,optional:E}=f,R=m in c?c[m]:"";if(Hs(R)&&!b)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const S=Hs(R)?R.join("/"):R;if(!S)if(E)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=S}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function U_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ss.Static+ss.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ss.Static+ss.Segment?1:-1:0}function vm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=U_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Eu(n))return 1;if(Eu(a))return-1}return a.length-n.length}function Eu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const H_={strict:!1,end:!0,sensitive:!1};function z_(e,t,s){const n=B_(D_(e.path),s),a=st(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function j_(e,t){const s=[],n=new Map;t=yu(H_,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,b=Ru(u);b.aliasOf=f&&f.record;const E=yu(t,u),R=[b];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const C of _)R.push(Ru(st({},b,{components:f?f.record.components:b.components,path:C,aliasOf:f?f.record:b})))}let S,g;for(const _ of R){const{path:C}=_;if(p&&C[0]!=="/"){const v=p.record.path,w=v[v.length-1]==="/"?"":"/";_.path=p.record.path+(C&&w+C)}if(S=z_(_,p,E),f?f.alias.push(S):(g=g||S,g!==S&&g.alias.push(S),m&&u.name&&!Iu(S)&&l(u.name)),gm(S)&&o(S),b.children){const v=b.children;for(let w=0;w<v.length;w++)i(v[w],S,f&&f.children[w])}f=f||S}return g?()=>{l(g)}:Li}function l(u){if(fm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=G_(u,s);s.splice(p,0,u),u.record.name&&!Iu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},b,E;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw ni(yt.MATCHER_NOT_FOUND,{location:u});E=f.record.name,m=st(Au(p.params,f.keys.filter(g=>!g.optional).concat(f.parent?f.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Au(u.params,f.keys.map(g=>g.name))),b=f.stringify(m)}else if(u.path!=null)b=u.path,f=s.find(g=>g.re.test(b)),f&&(m=f.parse(b),E=f.record.name);else{if(f=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!f)throw ni(yt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});E=f.record.name,m=st({},p.params,u.params),b=f.stringify(m)}const R=[];let S=f;for(;S;)R.unshift(S.record),S=S.parent;return{name:E,path:b,params:m,matched:R,meta:q_(R)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Au(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Ru(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:V_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function V_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Iu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function q_(e){return e.reduce((t,s)=>st(t,s.meta),{})}function G_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;vm(e,t[i])<0?n=i:s=i+1}const a=K_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function K_(e){let t=e;for(;t=t.parent;)if(gm(t)&&vm(e,t)===0)return t}function gm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Ou(e){const t=Is(Fr),s=Is(Jc),n=J(()=>{const o=en(e.to);return t.resolve(o)}),a=J(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(si.bind(null,d));if(p>-1)return p;const f=Lu(o[c-2]);return c>1&&Lu(d)===f&&u[u.length-1].path!==f?u.findIndex(si.bind(null,o[c-2])):p}),i=J(()=>a.value>-1&&Q_(s.params,n.value.params)),l=J(()=>a.value>-1&&a.value===s.matched.length-1&&pm(s.params,n.value.params));function r(o={}){if(Y_(o)){const c=t[en(e.replace)?"replace":"push"](en(e.to)).catch(Li);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:J(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function W_(e){return e.length===1?e[0]:e}const Z_=al({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Ou,setup(e,{slots:t}){const s=jn(Ou(e)),{options:n}=Is(Fr),a=J(()=>({[Nu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Nu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&W_(t.default(s));return e.custom?i:Za("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),J_=Z_;function Y_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Q_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Hs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Lu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Nu=(e,t,s)=>e??t??s,X_=al({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Is(Go),a=J(()=>e.route||n.value),i=Is(Su,0),l=J(()=>{let c=en(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=J(()=>a.value.matched[l.value]);Ei(Su,J(()=>l.value+1)),Ei(E_,r),Ei(Go,a);const o=h();return is(()=>[o.value,r.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!si(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(b=>b(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Mu(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,E=Za(p,st({},m,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Mu(s.default,{Component:E,route:c})||E}}});function Mu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const ew=X_;function tw(e){const t=j_(e.routes,e),s=e.parseQuery||T_,n=e.stringifyQuery||ku,a=e.history,i=vi(),l=vi(),r=vi(),o=lc(Nn);let c=Nn;Na&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=to.bind(null,H=>""+H),u=to.bind(null,o_),p=to.bind(null,Xi);function f(H,re){let ce,Ce;return fm(H)?(ce=t.getRecordMatcher(H),Ce=re):Ce=H,t.addRoute(Ce,ce)}function m(H){const re=t.getRecordMatcher(H);re&&t.removeRoute(re)}function b(){return t.getRoutes().map(H=>H.record)}function E(H){return!!t.getRecordMatcher(H)}function R(H,re){if(re=st({},re||o.value),typeof H=="string"){const O=so(s,H,re.path),$=t.resolve({path:O.path},re),ie=a.createHref(O.fullPath);return st(O,$,{params:p($.params),hash:Xi(O.hash),redirectedFrom:void 0,href:ie})}let ce;if(H.path!=null)ce=st({},H,{path:so(s,H.path,re.path).path});else{const O=st({},H.params);for(const $ in O)O[$]==null&&delete O[$];ce=st({},H,{params:u(O)}),re.params=u(re.params)}const Ce=t.resolve(ce,re),we=H.hash||"";Ce.params=d(p(Ce.params));const Be=u_(n,st({},H,{hash:i_(we),path:Ce.path})),k=a.createHref(Be);return st({fullPath:Be,hash:we,query:n===ku?C_(H.query):H.query||{}},Ce,{redirectedFrom:void 0,href:k})}function S(H){return typeof H=="string"?so(s,H,o.value.path):st({},H)}function g(H,re){if(c!==H)return ni(yt.NAVIGATION_CANCELLED,{from:re,to:H})}function _(H){return w(H)}function C(H){return _(st(S(H),{replace:!0}))}function v(H,re){const ce=H.matched[H.matched.length-1];if(ce&&ce.redirect){const{redirect:Ce}=ce;let we=typeof Ce=="function"?Ce(H,re):Ce;return typeof we=="string"&&(we=we.includes("?")||we.includes("#")?we=S(we):{path:we},we.params={}),st({query:H.query,hash:H.hash,params:we.path!=null?{}:H.params},we)}}function w(H,re){const ce=c=R(H),Ce=o.value,we=H.state,Be=H.force,k=H.replace===!0,O=v(ce,Ce);if(O)return w(st(S(O),{state:typeof O=="object"?st({},we,O.state):we,force:Be,replace:k}),re||ce);const $=ce;$.redirectedFrom=re;let ie;return!Be&&p_(n,Ce,ce)&&(ie=ni(yt.NAVIGATION_DUPLICATED,{to:$,from:Ce}),te(Ce,Ce,!0,!1)),(ie?Promise.resolve(ie):I($,Ce)).catch(ee=>on(ee)?on(ee,yt.NAVIGATION_GUARD_REDIRECT)?ee:B(ee):M(ee,$,Ce)).then(ee=>{if(ee){if(on(ee,yt.NAVIGATION_GUARD_REDIRECT))return w(st({replace:k},S(ee.to),{state:typeof ee.to=="object"?st({},we,ee.to.state):we,force:Be}),re||$)}else ee=D($,Ce,!0,k,we);return F($,Ce,ee),ee})}function T(H,re){const ce=g(H,re);return ce?Promise.reject(ce):Promise.resolve()}function y(H){const re=Z.values().next().value;return re&&typeof re.runWithContext=="function"?re.runWithContext(H):H()}function I(H,re){let ce;const[Ce,we,Be]=A_(H,re);ce=ao(Ce.reverse(),"beforeRouteLeave",H,re);for(const O of Ce)O.leaveGuards.forEach($=>{ce.push(Bn($,H,re))});const k=T.bind(null,H,re);return ce.push(k),X(ce).then(()=>{ce=[];for(const O of i.list())ce.push(Bn(O,H,re));return ce.push(k),X(ce)}).then(()=>{ce=ao(we,"beforeRouteUpdate",H,re);for(const O of we)O.updateGuards.forEach($=>{ce.push(Bn($,H,re))});return ce.push(k),X(ce)}).then(()=>{ce=[];for(const O of Be)if(O.beforeEnter)if(Hs(O.beforeEnter))for(const $ of O.beforeEnter)ce.push(Bn($,H,re));else ce.push(Bn(O.beforeEnter,H,re));return ce.push(k),X(ce)}).then(()=>(H.matched.forEach(O=>O.enterCallbacks={}),ce=ao(Be,"beforeRouteEnter",H,re,y),ce.push(k),X(ce))).then(()=>{ce=[];for(const O of l.list())ce.push(Bn(O,H,re));return ce.push(k),X(ce)}).catch(O=>on(O,yt.NAVIGATION_CANCELLED)?O:Promise.reject(O))}function F(H,re,ce){r.list().forEach(Ce=>y(()=>Ce(H,re,ce)))}function D(H,re,ce,Ce,we){const Be=g(H,re);if(Be)return Be;const k=re===Nn,O=Na?history.state:{};ce&&(Ce||k?a.replace(H.fullPath,st({scroll:k&&O&&O.scroll},we)):a.push(H.fullPath,we)),o.value=H,te(H,re,ce,k),B()}let N;function q(){N||(N=a.listen((H,re,ce)=>{if(!ye.listening)return;const Ce=R(H),we=v(Ce,ye.currentRoute.value);if(we){w(st(we,{replace:!0,force:!0}),Ce).catch(Li);return}c=Ce;const Be=o.value;Na&&x_(wu(Be.fullPath,ce.delta),Dr()),I(Ce,Be).catch(k=>on(k,yt.NAVIGATION_ABORTED|yt.NAVIGATION_CANCELLED)?k:on(k,yt.NAVIGATION_GUARD_REDIRECT)?(w(st(S(k.to),{force:!0}),Ce).then(O=>{on(O,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&!ce.delta&&ce.type===Vo.pop&&a.go(-1,!1)}).catch(Li),Promise.reject()):(ce.delta&&a.go(-ce.delta,!1),M(k,Ce,Be))).then(k=>{k=k||D(Ce,Be,!1),k&&(ce.delta&&!on(k,yt.NAVIGATION_CANCELLED)?a.go(-ce.delta,!1):ce.type===Vo.pop&&on(k,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),F(Ce,Be,k)}).catch(Li)}))}let ae=vi(),U=vi(),P;function M(H,re,ce){B(H);const Ce=U.list();return Ce.length?Ce.forEach(we=>we(H,re,ce)):console.error(H),Promise.reject(H)}function V(){return P&&o.value!==Nn?Promise.resolve():new Promise((H,re)=>{ae.add([H,re])})}function B(H){return P||(P=!H,q(),ae.list().forEach(([re,ce])=>H?ce(H):re()),ae.reset()),H}function te(H,re,ce,Ce){const{scrollBehavior:we}=e;if(!Na||!we)return Promise.resolve();const Be=!ce&&__(wu(H.fullPath,0))||(Ce||!ce)&&history.state&&history.state.scroll||null;return Ct().then(()=>we(H,re,Be)).then(k=>k&&y_(k)).catch(k=>M(k,H,re))}const Q=H=>a.go(H);let oe;const Z=new Set,ye={currentRoute:o,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:b,resolve:R,options:e,push:_,replace:C,go:Q,back:()=>Q(-1),forward:()=>Q(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:U.add,isReady:V,install(H){H.component("RouterLink",J_),H.component("RouterView",ew),H.config.globalProperties.$router=ye,Object.defineProperty(H.config.globalProperties,"$route",{enumerable:!0,get:()=>en(o)}),Na&&!oe&&o.value===Nn&&(oe=!0,_(a.location).catch(Ce=>{}));const re={};for(const Ce in Nn)Object.defineProperty(re,Ce,{get:()=>o.value[Ce],enumerable:!0});H.provide(Fr,ye),H.provide(Jc,ic(re)),H.provide(Go,o);const ce=H.unmount;Z.add(H),H.unmount=function(){Z.delete(H),Z.size<1&&(c=Nn,N&&N(),N=null,o.value=Nn,oe=!1,P=!1),ce()}}};function X(H){return H.reduce((re,ce)=>re.then(()=>y(ce)),Promise.resolve())}return ye}function bm(){return Is(Fr)}function sw(e){return Is(Jc)}const $r={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=sw(),s=bm(),n=J({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=J(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});is(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},nw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var b,E,R,S,g;const f=p.payload||p,m=f.type||p.type;if(m==="tool_start"){const _=((b=f.metadata)==null?void 0:b.call_id)||null,C={callId:_,id:_||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((E=f.metadata)==null?void 0:E.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(C);return}if(m==="tool_end"){const _=((R=f.metadata)==null?void 0:R.call_id)||null;let C=-1;if(_&&(C=e.value.findIndex(v=>v.callId===_&&v.status==="running")),C<0&&!_)for(let v=e.value.length-1;v>=0;v--){const w=e.value[v];if(w.tool===f.action&&w.status==="running"){C=v;break}}if(C>=0){const v=e.value[C];v.status=(S=f.metadata)!=null&&S.error?"error":"success",v.elapsed=((g=f.metadata)==null?void 0:g.elapsed_ms)||Date.now()-v.startTime,v.result=f.detail||"",v.fadingOut=!0,setTimeout(()=>{const w=e.value.indexOf(v);w>=0&&e.value.splice(w,1),t.value.unshift(v),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const _=f.call_id||f.tool_name||"unknown";if(f.finished){const C={...s.value};delete C[_],s.value=C}else{const v=((s.value[_]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[_]:v.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let r=!1;function o(){r||(r=!0,Ye.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ye.off("events",a),i&&(clearInterval(i),i=null))}Ke(o),_s(o),ws(c),_t(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Yc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function xa(e){const t=Yc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function ym(e){const t=Yc(e);return t?t.toLocaleTimeString():"—"}function xm(e){const t=Yc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function aw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function ai(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Qc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function _m(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Pu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function wm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function km(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Sm=Symbol("agent-detail-cancelled"),iw=15e3;function lw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((f,m)=>{o=f,c=m});function u(f,m){r||(r=!0,l!==null&&a(l),l=null,(f?o:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return r||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Sm),i==null||i.abort()}}}function Tm({state:e,requestDetail:t,timeoutMs:s=iw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const b={agentId:p,cancel:null,promise:null};l=b,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=lw(R=>t(p,{signal:R}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return b.cancel=E.cancel,b.promise=(async()=>{let R=null,S=null;try{R=await E.promise}catch(g){S=g}R!==Sm&&(l!==b||e.detailId!==p||(l=null,!S&&(R===null||typeof R!="object")&&(S=new Error(`${n} response was empty or invalid`)),S?e.detail===null&&(e.detailError=(S==null?void 0:S.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=R,e.detailError=null),e.detailLoading=!1))})(),b.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function rw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const ow={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=J(()=>e.value.filter(M=>M.status==="running").length),o=J(()=>e.value.filter(M=>M.status==="completed").length),c=J(()=>e.value.filter(M=>["failed","timeout","killed"].includes(M.status)).length),d=J(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=J(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(M=>["failed","timeout","killed"].includes(M.status)):e.value.filter(M=>M.status===i.value));function p(M){const V=Number(M.max_iterations)||0;return V<=0?0:Math.min(100,Math.round(M.iteration_count/V*100))}function f(M){return(Number(M.max_iterations)||0)>0}function m(M,V){return M?M==="N/A"?"N/A":V==="current_inheritance"?`inherit (currently ${M})`:M:"unknown"}function b(M){return m(M.display_model,M.display_model_source||M.display_source)}function E(M){return m(M.display_reasoning_effort,M.display_reasoning_effort_source||M.display_source)}function R(M){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[M]||""}const S=h(null),g=h(null),_=h(!1),C=h(null),v=h(""),T=Tm({state:{get detail(){return S.value},set detail(M){S.value=M},get detailId(){return g.value},set detailId(M){g.value=M},get detailLoading(){return _.value},set detailLoading(M){_.value=M},get detailError(){return C.value},set detailError(M){C.value=M}},requestDetail:(M,{signal:V})=>W.get(`/api/agents/${encodeURIComponent(M)}`,{signal:V})});async function y(M){v.value="",await T.open(M.id)}function I(){T.close(),v.value=""}async function F(){await T.refresh()}async function D(M,V){try{await navigator.clipboard.writeText(V||""),v.value=M,setTimeout(()=>{v.value===M&&(v.value="")},1500)}catch{Oe.error("Copy failed")}}async function N(M=!1){M=M===!0,M||(t.value=!0);try{const V=await W.get("/api/agents");e.value=Array.isArray(V)?V:[],s.value=null}catch(V){M||(s.value=V.message)}M||(t.value=!1)}async function q(M){const V=e.value.find(te=>te.id===M);if(await Jt({title:"Kill agent",message:`Kill agent "${(V==null?void 0:V.label)||M}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=M;try{await W.del(`/api/agents/${encodeURIComponent(M)}`),Oe.success("Agent killed"),await N()}catch(te){Oe.error(te.message||"Failed to kill agent")}n.value=null}}const ae=rw({isEnabled:()=>a.value&&l,refreshList:()=>N(!0),hasOpenDetail:()=>!!g.value,refreshDetail:F});function U(){ae.start()}function P(){ae.stop()}return is(a,()=>ae.sync()),Ke(()=>{l=!0,N(),U()}),_s(()=>{l=!0,N(!0),U()}),ws(()=>{l=!1,P()}),_t(()=>{l=!1,P(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:xa,formatDuration:ai,progressPercent:p,hasProgress:f,displayModelText:b,displayEffortText:E,displaySourceLabel:R,detail:S,detailId:g,detailLoading:_,detailError:C,copied:v,openDetail:y,closeDetail:I,copyText:D,fetchAgents:N,killAgent:q,startAutoRefresh:U,stopAutoRefresh:P}}},cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const E=Tm({state:{get detail(){return c.value},set detail(P){c.value=P},get detailId(){return d.value},set detailId(P){d.value=P},get detailLoading(){return u.value},set detailLoading(P){u.value=P},get detailError(){return p.value},set detailError(P){p.value=P}},detailLabel:"Loop detail",requestDetail:(P,{signal:M})=>W.get(`/api/loops/${encodeURIComponent(P)}?limit=100`,{signal:M})});async function R(P){f.value="",await E.open(P.id)}function S(){E.close(),f.value=""}async function g(P,M){try{await navigator.clipboard.writeText(M||""),f.value=P,setTimeout(()=>{f.value===P&&(f.value="")},1500)}catch{Oe.error("Copy failed")}}const _=J(()=>e.value.reduce((P,M)=>P+(M.iteration_count||0),0)),C=J(()=>e.value.filter(P=>P.status==="running").length);function v(P){return P==="running"?"loop-status-running":P==="error"?"loop-status-error":"loop-status-stopped"}function w(P){return P==="running"?"badge-success":P==="error"?"badge-danger":P==="completed"?"badge-info":"badge-warning"}function T(P){return P==="act"?"badge-warning":P==="silent"?"badge-info":"badge-success"}async function y(P=!1){P=P===!0,P||(t.value=!0);try{const M=await W.get("/api/loops");e.value=Array.isArray(M)?M:[],s.value=null}catch(M){P||(s.value=M.message)}P||(t.value=!1)}async function I(){l.value=null;const P=a.value;if(!P.goal.trim()){l.value="Goal is required";return}if(!P.channel_id.trim()){l.value="Channel ID is required";return}const M={goal:P.goal.trim(),channel_id:P.channel_id.trim(),interval_seconds:P.interval_seconds||60,mode:P.mode,max_iterations:P.max_iterations||50};P.stop_condition.trim()&&(M.stop_condition=P.stop_condition.trim()),i.value=!0;try{const V=await W.post("/api/loops",M);Oe.success(`Loop started: ${V.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await y()}catch(V){l.value=V.message}i.value=!1}async function F(P){if(await Jt({title:"Stop loop",message:`Stop loop ${P}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=P;try{await W.del(`/api/loops/${encodeURIComponent(P)}`),Oe.success("Loop stopped"),await y()}catch(V){Oe.error(V.message||"Failed to stop loop")}r.value=null}}async function D(P){o.value=P;try{await W.post(`/api/loops/${encodeURIComponent(P)}/restart`),Oe.success("Loop restarted"),await y()}catch(M){Oe.error(M.message||"Failed to restart loop")}o.value=null}function N(P){m&&P.payload&&(P.payload.loop_id||P.payload.type==="loop")&&(y(!0),d.value&&E.refresh())}let q=null;function ae(){q!==null&&clearInterval(q),q=null}function U(){ae(),m&&(q=setInterval(()=>{y(!0),d.value&&E.refresh()},5e3))}return Ke(()=>{m=!0,y(),Ye.subscribe("events",N),U()}),_s(()=>{m=!0,y(!0),U()}),ws(()=>{m=!1,ae()}),_t(()=>{m=!1,Ye.unsubscribe("events",N),ae(),E.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:_,runningCount:C,statusDotClass:v,statusBadge:w,modeBadge:T,formatAge:xm,formatDuration:ai,formatTs:xa,formatTokens:km,openDetail:R,closeDetail:S,copyText:g,fetchLoops:y,doCreate:I,doStop:F,doRestart:D}}},dw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=J(()=>e.value.filter(S=>S.status==="running").length),r=J(()=>e.value.filter(S=>S.status!=="running").length);function o(S){return S==="running"?"loop-status-running":S==="failed"||S==="error"?"loop-status-error":"loop-status-stopped"}function c(S){return S==="running"?"badge-success":S==="completed"||S==="exited"?"badge-info":S==="killed"||S==="error"||S==="failed"?"badge-danger":"badge-warning"}async function d(S=!1){S=S===!0,S||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(g){S||(s.value=g.message)}S||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}is(n,S=>{S?u():p()});async function f(S){if(await Jt({title:"Kill process",message:`Kill process ${S}?`,confirmLabel:"Kill",danger:!0})){i.value=S;try{await W.del(`/api/processes/${S}`),Oe.success(`Process ${S} killed`),await d()}catch(_){Oe.error(_.message||"Failed to kill process")}i.value=null}}function m(S){S.payload&&(S.payload.pid||S.payload.type==="process")&&d(!0)}let b=!1;function E(){b||(b=!0,d(),Ye.subscribe("events",m),u())}function R(){b&&(b=!1,Ye.unsubscribe("events",m),p())}return Ke(E),_s(E),ws(R),_t(R),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ai,fetchProcesses:d,doKill:f}}},uw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Du(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function pw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function fw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function hw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=uw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const E of new Set([p,f])){const R=new Date(u+E*6e4);pw(R,c)===d&&(m.some(S=>S.getTime()===R.getTime())||m.push(R))}if(m.sort((E,R)=>E.getTime()-R.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(E=>({instant:E,offset:fw(E),iso:E.toISOString()}))};const b=m[0];return{state:"ok",typed:t,instant:b,iso:b.toISOString()}}const mw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),r=h(null),o=J(()=>hw(a.value.run_at));is(()=>a.value.run_at,()=>{r.value=null});const c=J(()=>{var H;const X=o.value;return X.state==="ok"?X.instant:X.state==="ambiguous"&&r.value!==null&&((H=X.options[r.value])==null?void 0:H.instant)||null}),d=J(()=>{const X=c.value;return X?`${X.toLocaleString()} local — ${X.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),b=h(null),E=h(null),R=h(null),S=h(null),g=h(null),_=h([]),C=h(!1),v=h("");let w=0;const T=J(()=>e.value.filter(X=>X.cron&&!X.one_time).length),y=J(()=>e.value.filter(X=>X.one_time).length),I=J(()=>e.value.filter(X=>X.trigger).length),F=J(()=>e.value.filter(X=>X.paused).length),D=J(()=>e.value.filter(X=>X.consecutive_failures>0).length);function N(X){if(!X)return"-";const H=Date.now(),ce=(new Date(X).getTime()-H)/1e3;if(ce<0)return"overdue";if(ce<60)return"in < 1 min";if(ce<3600)return`in ${Math.floor(ce/60)} min`;if(ce<86400){const we=Math.floor(ce/3600),Be=Math.floor(ce%3600/60);return Be>0?`in ${we}h ${Be}m`:`in ${we}h`}const Ce=Math.floor(ce/86400);return`in ${Ce} day${Ce!==1?"s":""}`}function q(X){return X==null?"-":X<1e3?`${X}ms`:X<6e4?`${(X/1e3).toFixed(1)}s`:ai(X/1e3)}function ae(X=a.value.cron){a.value.cron=X,Du(a.value,"cron"),u.value=null}function U(X=a.value.run_at){a.value.run_at=X,Du(a.value,"run_at"),u.value=null}async function P(){const X=a.value.cron.trim();if(X){p.value=!0;try{u.value=await W.post("/api/schedules/validate-cron",{expression:X})}catch(H){u.value={valid:!1,error:H.message}}p.value=!1}}async function M(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(X){s.value=X.message}t.value=!1}async function V(X){if(g.value===X){g.value=null,_.value=[];return}g.value=X,C.value=!0,_.value=[];const H=++w;try{const re=await W.get(`/api/schedules/${encodeURIComponent(X)}/history?limit=10`);if(H!==w||g.value!==X)return;_.value=re,v.value=""}catch(re){if(H!==w||g.value!==X)return;_.value=[],v.value=re.message||"Failed to load execution history"}H===w&&(C.value=!1)}async function B(){l.value=null;const X=a.value;if(!X.description.trim()){l.value="Description is required";return}if(!X.channel_id.trim()){l.value="Channel ID is required";return}if(!X.cron.trim()&&!X.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(X.cron.trim()&&X.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const H={description:X.description.trim(),action:X.action,channel_id:X.channel_id.trim()};if(X.cron.trim()&&(H.cron=X.cron.trim()),X.run_at.trim()){const re=o.value;if(re.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(re.state==="invalid"){l.value="One-time run time is not a valid date";return}const ce=c.value;if(re.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!ce){l.value="One-time run time could not be resolved";return}H.run_at=ce.toISOString()}if(X.action==="reminder"&&X.message.trim()&&(H.message=X.message.trim()),X.action==="check"&&(X.tool_name.trim()&&(H.tool_name=X.tool_name.trim()),X.report_format&&(H.report_format=X.report_format),X.tool_input_str.trim()))try{H.tool_input=JSON.parse(X.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",H),Oe.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await M()}catch(re){l.value=re.message}i.value=!1}async function te(X){m.value=X;try{const H=await W.post(`/api/schedules/${encodeURIComponent(X)}/run`);if(H.status==="failure")Oe.error(`Execution failed: ${H.error||"unknown error"}`);else{const re=H.warning?`Executed (${H.warning})`:"Executed successfully";Oe.success(re)}await M()}catch(H){Oe.error(H.message||"Failed to trigger")}m.value=null}async function Q(X){E.value=X.id;const H=!X.paused;try{await W.put(`/api/schedules/${encodeURIComponent(X.id)}`,{paused:H}),Oe.success(H?"Schedule paused":"Schedule resumed"),await M()}catch(re){Oe.error(re.message||"Failed to update schedule")}E.value=null}async function oe(X,H){S.value=X.id;try{await W.put(`/api/schedules/${encodeURIComponent(X.id)}`,{report_format:H}),Oe.success(H?"Structured report enabled":"Plain-text report enabled")}catch(re){Oe.error(`Update failed: ${re.message}`)}finally{await M(),S.value=null}}async function Z(X){R.value=X;try{await W.post(`/api/schedules/${encodeURIComponent(X)}/reset-failures`),Oe.success("Failure counters reset"),await M()}catch(H){Oe.error(H.message||"Failed to reset")}R.value=null}async function ye(X){const H=e.value.find(ce=>ce.id===X);if(await Jt({title:"Delete schedule",message:`Delete "${(H==null?void 0:H.description)||X}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){b.value=X;try{await W.del(`/api/schedules/${encodeURIComponent(X)}`),Oe.success("Schedule deleted"),await M()}catch(ce){Oe.error(ce.message||"Failed to delete schedule")}b.value=null}}return Ke(()=>{M()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:b,togglingId:E,resettingId:R,reportUpdatingId:S,expandedId:g,history:_,historyLoading:C,historyError:v,cronCount:T,oneTimeCount:y,webhookCount:I,pausedCount:F,failingCount:D,formatTs:xa,formatAge:xm,formatFuture:N,formatMs:q,formatDuration:ai,onCronInput:ae,onRunAtInput:U,validateCron:P,toggleExpand:V,fetchSchedules:M,doCreate:B,doRunNow:te,doTogglePause:Q,doUpdateReportFormat:oe,doResetFailures:Z,doDelete:ye}}},Cm=[{id:"live",label:"Live",component:nw},{id:"agents",label:"Agents",component:ow},{id:"loops",label:"Loops",component:cw},{id:"processes",label:"Processes",component:dw},{id:"schedules",label:"Schedules",component:mw}],vw={components:{TabbedPage:$r},setup(){return{tabs:Cm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},gw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await W.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ke(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:xa,formatDetail:i,truncateBlock:_m,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Fu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],bw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),b=Fu,E=bw,R=h([]),S=h(!1),g=h(""),_=h("flat"),C=h(new Set),v=h(""),w=h(""),T=h(""),y=h(null),I=h(!1);function F(){try{const se=localStorage.getItem("odin-session-presets");se&&(R.value=JSON.parse(se))}catch{}}function D(){try{localStorage.setItem("odin-session-presets",JSON.stringify(R.value))}catch{}}const N=J(()=>p.value.trim()!==""||u.value!=="all"),q=J(()=>{let se=[...e.value];const _e=Fu.find(qe=>qe.id===u.value),Ee=_e?_e.filters:{};if(Ee.source&&(se=se.filter(qe=>qe.source===Ee.source)),Ee.minMessages&&(se=se.filter(qe=>qe.message_count>=Ee.minMessages)),Ee.hasCompaction&&(se=se.filter(qe=>qe.has_summary)),Ee.maxAge!=null){const qe=Date.now()/1e3;se=se.filter(ot=>ot.last_active&&qe-ot.last_active<=Ee.maxAge)}if(p.value.trim()){const qe=p.value.toLowerCase().trim();se=se.filter(ot=>(ot.channel_id||"").toLowerCase().includes(qe)||(ot.last_user_id||"").toLowerCase().includes(qe)||(ot.source||"").toLowerCase().includes(qe))}const Ue=f.value,mt=m.value?1:-1;return se.sort((qe,ot)=>{const zs=qe[Ue]||0,Ss=ot[Ue]||0;return(zs-Ss)*mt}),se}),ae=J(()=>{if(!a.value||!a.value.messages)return[];const se=a.value.messages;if(se.length===0)return[];const _e=[];let Ee=[];for(const Ue of se)Ue.role==="user"&&Ee.length>0&&(_e.push(Ee),Ee=[]),Ee.push(Ue);return Ee.length>0&&_e.push(Ee),_e}),U=J(()=>q.value.length>0&&c.value.size===q.value.length);function P(se){const _e=se.find(Ee=>Ee.role==="user");if(_e&&_e.content){const Ee=_e.content.slice(0,120);return Ee.length<_e.content.length?Ee+"...":Ee}return"(no user message)"}function M(se){const _e=new Set(C.value);_e.has(se)?_e.delete(se):_e.add(se),C.value=_e}function V(se){u.value=se}function B(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(f.value=se.filters.sortBy)}function te(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};R.value=[...R.value,se],D(),S.value=!1,g.value=""}function Q(se){R.value=R.value.filter(_e=>_e.id!==se),D(),u.value===se&&(u.value="all")}function oe(){u.value="all",p.value="",f.value="last_active",m.value=!1}function Z(se){if(!se)return"—";const _e=Date.now()/1e3-se;if(_e<60)return"just now";if(_e<3600){const Ue=Math.floor(_e/60);return`${Ue} minute${Ue!==1?"s":""} ago`}if(_e<86400){const Ue=Math.floor(_e/3600);return`${Ue} hour${Ue!==1?"s":""} ago`}const Ee=Math.floor(_e/86400);return`${Ee} day${Ee!==1?"s":""} ago`}function ye(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function X(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function H(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function re(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function ce(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function Ce(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function we(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function Be(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function k(){const se=v.value.trim();if(se){I.value=!0;try{let _e=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;w.value.trim()&&(_e+=`&channel_id=${encodeURIComponent(w.value.trim())}`),T.value.trim()&&(_e+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ee=await W.get(_e);y.value=Ee.results||[]}catch{y.value=[]}I.value=!1}}function O(){v.value="",w.value="",T.value="",y.value=null}function $(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ie(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function ee(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ne=0;async function fe(){const se=++ne;t.value=!0,s.value=null;try{const _e=await W.get("/api/sessions");if(se!==ne)return;e.value=_e}catch(_e){if(se!==ne)return;s.value=_e.message}se===ne&&(t.value=!1)}function ue(){s.value=null,fe()}async function pe(se){if(n.value===se){n.value=null,a.value=null,C.value=new Set;return}n.value=se,a.value=null,i.value=!0,C.value=new Set;const _e=++l;try{const Ee=await W.get(`/api/sessions/${encodeURIComponent(se)}`);_e===l&&n.value===se&&(a.value=Ee)}catch(Ee){_e===l&&n.value===se&&(a.value={messages:[],summary:"",error:Ee.message||"Failed to load session"})}finally{_e===l&&(i.value=!1)}}function le(se){const _e=new Set(c.value);_e.has(se)?_e.delete(se):_e.add(se),c.value=_e}function ke(){U.value?c.value=new Set:c.value=new Set(q.value.map(se=>se.channel_id))}function be(se){r.value=se}async function xe(){if(r.value){o.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await fe()}catch(se){s.value=se.message||"Failed to clear session"}o.value=!1,r.value=null}}function de(){d.value=!0}async function z(){if(c.value.size!==0){o.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await fe()}catch(se){s.value=se.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function me(se,_e){const Ee=`/api/sessions/${encodeURIComponent(se)}/export?format=${_e}`;try{const Ue=await W.getBlob(Ee),mt=URL.createObjectURL(Ue),qe=document.createElement("a");qe.href=mt,qe.download=`session-${se}.${_e==="text"?"txt":"json"}`,qe.click(),URL.revokeObjectURL(mt)}catch(Ue){s.value=Ue.message||"Failed to export session"}}let Te=null;function Le(se){se.payload&&se.payload.channel_id&&(clearTimeout(Te),Te=setTimeout(()=>{if(fe(),n.value&&se.payload.channel_id===n.value){const _e=n.value,Ee=l;W.get(`/api/sessions/${encodeURIComponent(_e)}`).then(Ue=>{Ee!==l||n.value!==_e||(a.value=Ue)}).catch(()=>{})}},2e3))}let Me=!1,rt=null;function at(){Me||(Me=!0,fe(),Ye.subscribe("events",Le),rt=Ye.onReconnected(()=>fe()))}Ke(()=>{F(),at()}),_s(()=>{at()});function Mt(){Me&&(Me=!1,Ye.unsubscribe("events",Le),rt&&(rt(),rt=null),clearTimeout(Te))}return ws(Mt),_t(Mt),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:b,sortOptions:E,filteredSessions:q,hasActiveFilters:N,customPresets:R,showSavePreset:S,newPresetName:g,threadView:_,threads:ae,collapsedThreads:C,ftsQuery:v,ftsChannelId:w,ftsUserId:T,ftsResults:y,ftsSearching:I,formatAge:Z,formatTimestamp:ye,formatFullTimestamp:X,messageClass:H,threadMsgClass:re,roleBadge:ce,roleDotClass:Ce,roleLabelClass:we,truncateContent:Be,threadSummary:P,fetchSessions:fe,retry:ue,toggleSession:pe,toggleSelect:le,toggleSelectAll:ke,confirmClear:be,clearSession:xe,confirmBulkClear:de,doBulkClear:z,exportSession:me,applyPreset:V,applyCustomPreset:B,saveCustomPreset:te,removeCustomPreset:Q,resetFilters:oe,toggleThread:M,runFtsSearch:k,clearFtsSearch:O,highlightSnippet:$,ftsResultClass:ie,ftsTypeBadge:ee}}},xw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:km}}},_w={components:{ContextAssemblyPanel:xw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(w){if(!w)return"—";try{const T=new Date(w);return isNaN(T.getTime())?w:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function p(w){return!w&&w!==0?"—":w<1e3?w+"ms":(w/1e3).toFixed(1)+"s"}function f(w){return!w&&w!==0?"—":w>=1e3?(w/1e3).toFixed(1)+"k":String(w)}function m(w){if(!w)return"";if(typeof w=="string")return w;try{return JSON.stringify(w,null,2)}catch{return String(w)}}function b(w){a.value===w?a.value=null:(a.value=w,c.value={})}function E(w,T){const y=w+"-"+T;c.value={...c.value,[y]:!c.value[y]}}function R(w,T){return!!c.value[w+"-"+T]}function S(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,C()}async function g(){try{const w=await W.get("/api/trajectories");e.value=w.files||[],o.value=w.count||0}catch{}}let _=0;async function C(){const w=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(w!==_)return;let y=T.entries||[];d.value.tool_name&&(y=y.filter(I=>(I.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(y=y.filter(I=>I.is_error)),d.value.channel_id&&(y=y.filter(I=>I.channel_id===d.value.channel_id)),d.value.user_id&&(y=y.filter(I=>I.user_id===d.value.user_id)),t.value=y}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const y=T.toString(),I=await W.get(`/api/trajectories/search/query?${y}`);if(w!==_)return;t.value=I.results||[]}}catch(T){if(w!==_)return;n.value=T.message}w===_&&(s.value=!1)}async function v(){if(!l.value.trim())return;const w=++_;s.value=!0,n.value=null,c.value={};try{const T=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(w!==_)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(w!==_)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}w===_&&(s.value=!1)}return Ke(async()=>{await g(),await C()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:_m,toggleExpand:b,toggleIteration:E,isIterationExpanded:R,clearFilters:S,fetchFiles:g,fetchTraces:C,lookupMessage:v}}},ww={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=J(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await W.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ke(p),_s(p),ws(f),_t(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:wm,formatTime:ym,retry:d}}},Em=[{id:"audit",label:"Audit",component:gw},{id:"sessions",label:"Sessions",component:yw},{id:"traces",label:"Traces",component:_w},{id:"usage",label:"Usage",component:ww}],kw={components:{TabbedPage:$r},setup(){return{tabs:Em}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},io=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(y){return y.source!=="builtin"?"":u[y.state]||""}function f(y,I){const F=y&&Array.isArray(y.tools)?y.tools:null;if(c.value=!!F,o.value=F?!!y.global_enabled:null,!F){e.value=I.map(q=>({...q,source:"unknown",enabled:void 0,state:null}));return}const D=new Set(F.map(q=>q.name)),N=I.filter(q=>!D.has(q.name)).map(q=>({...q,source:q.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...F.map(q=>({...q,source:"builtin"})),...N]}async function m(y,I){if(d.value.has(y.name))return;const F=!!I.target.checked,D=new Set(d.value);D.add(y.name),d.value=D;try{const N=await W.post(`/api/tools/builtins/${encodeURIComponent(y.name)}/enabled`,{enabled:F});f(N,e.value),s.value=null;try{const q=await W.get("/api/tools");f(N,q)}catch(q){console.warn("Built-in toggle committed; visible catalog refresh failed",q)}}catch(N){I.target.checked=!!y.enabled,s.value=N.message||`Failed to toggle ${y.name}`}finally{const N=new Set(d.value);N.delete(y.name),d.value=N}}const b=J(()=>e.value.filter(y=>y.source==="builtin"&&y.is_core).length),E=J(()=>e.value.filter(y=>y.source==="skill").length),R=J(()=>Object.values(a.value).reduce((y,I)=>y+I,0));function S(y){for(const I of io)if(I.id!=="other"&&I.match(y))return I.id;return"other"}const g=J(()=>{let y=e.value;if(n.value){const I=n.value.toLowerCase();y=y.filter(F=>F.name.toLowerCase().includes(I)||(F.description||"").toLowerCase().includes(I))}return r.value&&(y=y.filter(I=>S(I.name)===r.value)),y}),_=J(()=>{const y=new Set;for(const I of e.value)y.add(S(I.name));return io.filter(I=>y.has(I.id))}),C=J(()=>{const y=g.value,I={};for(const D of y){const N=S(D.name);I[N]||(I[N]=[]),I[N].push(D)}const F=[];for(const D of io)I[D.id]&&I[D.id].length>0&&F.push({label:D.label,icon:D.icon,tools:I[D.id].sort((N,q)=>N.name.localeCompare(q.name))});return F});function v(y){i.value={...i.value,[y]:!i.value[y]}}async function w(){t.value=!0,s.value=null;try{const[y,I,F]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({})),W.get("/api/tools/builtins").catch(()=>null)]);f(F,y),a.value=I||{}}catch(y){s.value=y.message}t.value=!1}function T(){w()}return Ke(()=>{w()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,globalEnabled:o,inventoryAvailable:c,togglePending:d,coreCount:b,skillCount:E,totalUsage:R,filteredTools:g,groupedTools:C,usedCategories:_,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:Qc,toggleExpand:v,refresh:T}}};function Tw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Cw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Ew={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),b=h(null),E=h(null),R=h(!1),S=J(()=>e.value.length),g=J(()=>e.value.reduce((Z,ye)=>Z+(ye.execution_count||0),0)),_=J(()=>e.value.reduce((Z,ye)=>Z+I(ye.code),0)),C=J(()=>{if(!l.value)return e.value;const Z=l.value.toLowerCase();return e.value.filter(ye=>ye.name.toLowerCase().includes(Z)||(ye.description||"").toLowerCase().includes(Z))}),v=J(()=>u.value?u.value.split(`
`).length:0),w=J(()=>{const Z=Math.max(v.value,1);return Array.from({length:Z},(ye,X)=>X+1).join(`
`)}),T=J(()=>{const Z=u.value.trim();return Z?Z.includes("SKILL_DEFINITION")?Z.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function y(Z){return Tw(Z)}function I(Z){return Z?Z.split(`
`).length:0}function F(Z){return Cw(Z)}function D(Z){n.value={...n.value,[Z]:!n.value[Z]}}async function N(Z){try{await navigator.clipboard.writeText(Z);const ye=e.value.find(X=>X.code===Z);ye&&(r.value=ye.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function q(Z){if(Z.key==="Tab"){Z.preventDefault();const ye=Z.target,X=ye.selectionStart,H=ye.selectionEnd;u.value=u.value.substring(0,X)+"    "+u.value.substring(H),Ct(()=>{ye.selectionStart=ye.selectionEnd=X+4})}}function ae(Z){const ye=Z.target.previousElementSibling;ye&&(ye.scrollTop=Z.target.scrollTop)}async function U(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(Z){s.value=Z.message}t.value=!1}async function P(Z){i.value=Z,delete a.value[Z],a.value={...a.value};try{const ye=await W.post(`/api/skills/${encodeURIComponent(Z)}/test`);a.value={...a.value,[Z]:ye}}catch(ye){a.value={...a.value,[Z]:{result:ye.message,is_error:!0}}}i.value=null}function M(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function V(Z){o.value=!0,c.value="edit",d.value=Z.name,u.value=Z.code||"",p.value=null,f.value=null}function B(){o.value=!1,p.value=null,f.value=null}async function te(){p.value=null,f.value=null;const Z=d.value.trim(),ye=u.value.trim();if(!Z){p.value="Name is required";return}if(!ye){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:Z,code:ye}),f.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(Z)}`,{code:ye}),f.value="Skill updated successfully"),await U(),setTimeout(()=>{o.value=!1},800)}catch(X){p.value=X.message}m.value=!1}function Q(Z){E.value=Z}async function oe(){if(E.value){R.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(E.value)}`),await U()}catch(Z){Oe.error(`Failed to delete skill: ${Z.message||"unknown error"}`)}R.value=!1,E.value=null}}return Ke(()=>{U()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:b,deleteTarget:E,deleting:R,enabledCount:S,totalExecutions:g,totalLines:_,displayedSkills:C,editLineCount:v,editorLineNums:w,editValidation:T,highlight:y,truncate:Qc,formatTs:xa,countLines:I,getLineNumbers:F,toggleCode:D,copyCode:N,handleEditorKey:q,syncScroll:ae,fetchSkills:U,testSkill:P,showCreate:M,editSkill:V,cancelEdit:B,saveSkill:te,confirmDelete:Q,doDelete:oe}}};class Es extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Aw=/^[A-Za-z_][A-Za-z0-9_]*$/;function $u(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Bu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const r=String((l==null?void 0:l.key)||"").trim(),o=String((l==null?void 0:l.value)??"");if(!(!r&&!o)){if(!r)throw new Es(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(r))throw new Es(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,r))throw new Es(`${s} key “${r}” appears more than once.`,"authentication");if(i.has(r))throw new Es(`${s} key “${r}” cannot be replaced and removed in the same save.`,"authentication");n[r]=o}}return{set:n,remove:a}}function Rw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Iw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Es("Server name is required.","name");if(a.length>128||!Aw.test(a))throw new Es("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,r={enabled:!!e.enabled,transport:i};if(n&&(r.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Es("An executable path is required for a new stdio connection.","command");if(d&&(r.command=d),(n||e.replaceArgs)&&(r.args=$u(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Es("Working directory must be an absolute path.","cwd");r.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Es("An HTTP endpoint is required for this connection.","url");if(d&&!Rw(d))throw new Es("Endpoint must be a valid http:// or https:// URL.","url");d&&(r.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Es("Timeout must be a whole number from 1 to 3600 seconds.","timeout");r.timeout_seconds=d}(n||e.replaceAllowlist)&&(r.tool_allowlist=$u(e.allowlistText));const o=Bu(e.headerRows,e.headersRemove,"Header"),c=Bu(e.envRows,e.envRemove,"Environment variable");return Object.keys(o.set).length&&(r.headers_set=o.set),o.remove.length&&(r.headers_remove=o.remove),Object.keys(c.set).length&&(r.env_set=c.set),c.remove.length&&(r.env_remove=c.remove),r}function Ow(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Lw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Nw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Mw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Pw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Dw=1e4,Fw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function lo(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function $w(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Bw={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),r=h({}),o=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(lo()),b=h(""),E=h(!1);let R=null,S=0,g=!1,_=!1;const C=Mw,v=J(()=>{var z;return((z=e.value)==null?void 0:z.servers)||[]}),w=J(()=>{var z;return!!((z=e.value)!=null&&z.enabled)}),T=J(()=>{var z,me,Te,Le;return{serverCount:((z=e.value)==null?void 0:z.server_count)||0,enabledCount:((me=e.value)==null?void 0:me.enabled_server_count)||0,connectedCount:((Te=e.value)==null?void 0:Te.connected_count)||0,toolCount:((Le=e.value)==null?void 0:Le.published_tool_count)||0}}),y=J(()=>{var z;return((z=f.value)==null?void 0:z.header_keys)||[]}),I=J(()=>{var z;return((z=f.value)==null?void 0:z.env_keys)||[]}),F=J(()=>{var z;return u.value==="edit"&&((z=f.value)==null?void 0:z.transport)==="http"}),D=J(()=>u.value==="add"||!F.value),N=J(()=>F.value?"Replace endpoint URL":"Endpoint URL"),q=J(()=>F.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function ae(){U(),R=window.setInterval(()=>P({quiet:!0}),Dw)}function U(){R&&window.clearInterval(R),R=null}async function P({quiet:z=!1}={}){const me=++S;z||(t.value=!0);try{const Te=await W.get("/api/mcp/status");if(me!==S||!g)return;e.value=Te,n.value="";const Le=new Set((Te.servers||[]).map(Me=>Me.name));i.value=new Set([...i.value].filter(Me=>Le.has(Me)))}catch(Te){me===S&&g&&(n.value=Te.message||"Failed to load MCP status")}finally{me===S&&(t.value=!1)}}function M(z){return s.value||a.value.has(z)}function V(z,me){const Te=new Set(a.value);me?Te.add(z):Te.delete(z),a.value=Te}function B(z){return Lw(z.state)}function te(z){if(B(z)==="disabled"){if(!z.enabled)return"Disabled — server switch off";if(!w.value)return"Disabled — global MCP is off"}return Fw[B(z)]}function Q(z){return z.transport==="http"?"Streamable HTTP":"stdio"}function oe(z){return z.negotiated_version?`${z.era?`${String(z.era).charAt(0).toUpperCase()}${String(z.era).slice(1)}`:"Protocol"} · ${z.negotiated_version}`:"Not negotiated"}function Z(z){return z.discovered_count?`${z.published_count||0} published · ${z.excluded_count||0} excluded`:"No tools discovered"}const ye=h(new Set);async function X(z,me){if(ye.value.has(z.name))return;const Te=!!me.target.checked,Le=new Set(ye.value);Le.add(z.name),ye.value=Le;try{const Me=await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/enabled`,{enabled:Te});Me&&Array.isArray(Me.servers)?e.value=Me:await P({quiet:!0})}catch(Me){me.target.checked=!!z.enabled,Oe.error(Me.message||`Failed to toggle ${z.name}`)}finally{const Me=new Set(ye.value);Me.delete(z.name),ye.value=Me}}async function H(z){if(z!==w.value&&!(!z&&!await Jt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await W.post("/api/mcp/enabled",{enabled:z}),Oe.success(z?"MCP enabled":"MCP disabled"),await P({quiet:!0})}catch(me){Oe.error(me.message||"Failed to update MCP state"),await P({quiet:!0})}finally{s.value=!1}}}async function re(z){V(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/reconnect`,{}),Oe.success(`Reconnected ${z.name}`)}catch(me){Oe.error(me.message||`Failed to reconnect ${z.name}`)}finally{V(z.name,!1),await P({quiet:!0})}}async function ce(z){V(z.name,!0);try{await W.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/refresh-tools`,{}),Oe.success(`Refreshed tools from ${z.name}`),await Be(z.name,!0)}catch(me){Oe.error(me.message||`Failed to refresh ${z.name}`)}finally{V(z.name,!1),await P({quiet:!0})}}async function Ce(z){if(await Jt({title:`Remove ${z.name}`,message:`Remove this saved MCP server? Its ${z.published_count||0} published tool${z.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){V(z.name,!0);try{await W.del(`/api/mcp/servers/${encodeURIComponent(z.name)}`),Oe.success(`Removed ${z.name}`),delete r.value[z.name]}catch(Te){Oe.error(Te.message||`Failed to remove ${z.name}`)}finally{V(z.name,!1),await P({quiet:!0})}}}async function we(z){const me=new Set(i.value);if(me.has(z.name)){me.delete(z.name),i.value=me;return}me.add(z.name),i.value=me,Object.hasOwn(r.value,z.name)||await Be(z.name)}async function Be(z,me=!1){if(!me&&Object.hasOwn(r.value,z))return;const Te=new Set(c.value);Te.add(z),c.value=Te,o.value={...o.value,[z]:""};try{const Le=await W.get(`/api/mcp/servers/${encodeURIComponent(z)}/tools`);r.value={...r.value,[z]:Le.tools||[]}}catch(Le){o.value={...o.value,[z]:Le.message||"Failed to load tools"}}finally{const Le=new Set(c.value);Le.delete(z),c.value=Le}}function k(z){return(r.value[z]||[]).filter(me=>Nw(me,l.value[z]))}function O(z,me){l.value={...l.value,[z]:me}}function $(){u.value="add",p.value="",f.value=null,m.value=lo(),b.value="",d.value=!0}function ie(z){u.value="edit",p.value=z.name,f.value=z,m.value={...lo(),name:z.name,enabled:!!z.enabled,transport:z.transport||"stdio"},b.value="",d.value=!0}function ee(){E.value||(d.value=!1)}function ne(z){d.value&&Pw(z)}function fe(z){const me=z==="headers"?"headerRows":"envRows";m.value[me].push({key:"",value:""})}function ue(z,me){const Te=z==="headers"?"headerRows":"envRows";m.value[Te].splice(me,1)}function pe(z,me){const Te=z==="headers"?"headersRemove":"envRemove",Le=m.value[Te];m.value[Te]=Le.includes(me)?Le.filter(Me=>Me!==me):[...Le,me]}async function le(){var me,Te;b.value="";let z;try{z=Iw(m.value,{mode:u.value,originalTransport:((me=f.value)==null?void 0:me.transport)||""})}catch(Le){b.value=Le instanceof Es?Le.message:"Invalid MCP server configuration",await Ct(),(Te=document.querySelector(".mcp-editor"))==null||Te.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Ow(z,f.value)&&!await Jt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){E.value=!0;try{u.value==="add"?await W.post("/api/mcp/servers",z):await W.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,z),Oe.success(u.value==="add"?`Saved ${z.name}`:`Updated ${p.value}`),d.value=!1,await P({quiet:!0})}catch(Le){b.value=Le.message||"Failed to save MCP server"}finally{E.value=!1}}}let ke=null;function be(z){`${(z==null?void 0:z.event)||""} ${(z==null?void 0:z.type)||""} ${(z==null?void 0:z.tool)||""} ${(z==null?void 0:z.message)||""}`.toLowerCase().includes("mcp")&&(ke&&window.clearTimeout(ke),ke=window.setTimeout(()=>P({quiet:!0}),200))}function xe(){g||(g=!0,_||(Ye.subscribe("events",be),_=!0),P(),ae())}function de(){g=!1,U(),ke&&window.clearTimeout(ke),ke=null,_&&(Ye.unsubscribe("events",be),_=!1)}return Ke(xe),_s(xe),ws(de),_t(de),{status:e,loading:t,mutating:s,pageError:n,servers:v,masterEnabled:w,aggregate:T,expandedServers:i,toolQueries:l,toolErrors:o,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:b,saving:E,editorGroups:C,configuredHeaderKeys:y,configuredEnvKeys:I,savedHttpEndpoint:F,endpointRequired:D,endpointFieldLabel:N,endpointPlaceholder:q,refreshAll:P,busy:M,serverState:B,stateLabel:te,transportLabel:Q,protocolLabel:oe,toolSummary:Z,formatAge:$w,setMasterEnabled:H,togglePending:ye,toggleServerEnabled:X,reconnect:re,refreshTools:ce,removeServer:Ce,toggleTools:we,filteredTools:k,setToolQuery:O,openAdd:$,openEdit:ie,closeEditor:ee,jumpToEditorGroup:ne,addSecretRow:fe,removeSecretRow:ue,toggleSecretRemoval:pe,saveServer:le}}};function Uw(e,t){if(!e||!t)return Pu(e);const s=Pu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),b=h(null);let E=null;const R=h(null),S=h(!1),g=h({}),_=h({}),C=h({}),v=h({}),w=new Map,T=h(null),y=J(()=>e.value.reduce((B,te)=>B+(te.chunks||0),0)),I=J(()=>new Set(e.value.map(te=>te.uploader).filter(Boolean)).size);function F(B,te){const Q=_.value[te];if(!Q||Q.length===0)return 0;const oe=Math.max(...Q.map(Z=>Z.char_count||0));return oe===0?0:Math.round(B.char_count/oe*100)}async function D(){t.value=!0,s.value=null;try{const B=await W.get("/api/knowledge");e.value=Array.isArray(B)?B:[]}catch(B){s.value=B.message}t.value=!1}async function N(B){if(g.value[B]){g.value[B]=!1,T.value=null;return}if(g.value[B]=!0,Object.prototype.hasOwnProperty.call(_.value,B))return;if(w.has(B))return w.get(B);const te={...v.value,[B]:!0};v.value=te;const Q={...C.value};delete Q[B],C.value=Q;const oe=W.get(`/api/knowledge/${encodeURIComponent(B)}/chunks`).then(Z=>{_.value={..._.value,[B]:Array.isArray(Z)?Z:[]}}).catch(Z=>{C.value={...C.value,[B]:Z.message||"load failed"}}).finally(()=>{if(w.get(B)!==oe)return;w.delete(B);const Z={...v.value};delete Z[B],v.value=Z});return w.set(B,oe),oe}async function q(){const B=n.value.trim();if(B){i.value=!0,r.value=null,l.value=B;try{const te=await W.get(`/api/knowledge/search?q=${encodeURIComponent(B)}`);a.value=Array.isArray(te)?te:[]}catch(te){a.value=[],r.value=te.message||"Search failed"}i.value=!1}}function ae(){a.value=null,n.value="",r.value=null}async function U(){u.value=null,p.value=null;const B=c.value.trim(),te=d.value.trim();if(!B){u.value="Source name is required";return}if(!te){u.value="Content is required";return}f.value=!0;try{const Q=await W.post("/api/knowledge",{source:B,content:te});p.value=`Ingested ${Q.chunks||0} chunks from "${B}"`,c.value="",d.value="",_.value={},await D(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(Q){u.value=Q.message}f.value=!1}async function P(B){m.value=B,b.value=null,E&&(clearTimeout(E),E=null);try{const te=await W.post(`/api/knowledge/${encodeURIComponent(B)}/reingest`);b.value={source:B,error:!1,message:`Re-ingested ${te.chunks||0} chunks`},delete _.value[B],await D(),E=setTimeout(()=>{b.value=null,E=null},3e3)}catch(te){b.value={source:B,error:!0,message:te.message}}m.value=null}function M(B){R.value=B}async function V(){if(R.value){S.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete _.value[R.value],await D()}catch(B){Oe.error(`Failed to delete source: ${B.message||"unknown error"}`)}S.value=!1,R.value=null}}return Ke(()=>{D()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:b,deleteTarget:R,deleting:S,expanded:g,sourceChunks:_,chunkErrors:C,loadingChunks:v,selectedChunk:T,totalChunks:y,uploaderCount:I,truncate:Qc,formatTs:xa,highlightTerms:Uw,chunkBarWidth:F,fetchSources:D,toggleSource:N,doSearch:q,clearSearch:ae,doIngest:U,doReingest:P,confirmDelete:M,doDelete:V}}},zw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),b=h(null),E=h(null),R=h(new Set),S=h(null),g=h(!1),_=h(!1),C=J(()=>e.value.reduce((Q,oe)=>Q+oe.count,0)),v=J(()=>R.value.size);function w(Q){const oe=t.value[Q];if(!oe)return[];if(!l.value.trim())return oe;const Z=l.value.trim().toLowerCase();return oe.filter(ye=>ye.key.toLowerCase().includes(Z)||ye.value&&ye.value.toLowerCase().includes(Z))}function T(Q,oe){return R.value.has(Q+"/"+oe)}function y(Q,oe){const Z=Q+"/"+oe,ye=new Set(R.value);ye.has(Z)?ye.delete(Z):ye.add(Z),R.value=ye}function I(Q){const oe=t.value[Q];return!oe||oe.length===0?!1:oe.every(Z=>R.value.has(Q+"/"+Z.key))}function F(Q,oe){const Z=t.value[Q];if(!Z)return;const ye=new Set(R.value);for(const X of Z){const H=Q+"/"+X.key;oe?ye.add(H):ye.delete(H)}R.value=ye}async function D(){s.value=!0,n.value=null;try{const Q=await W.get("/api/memory");e.value=Object.entries(Q).map(([oe,Z])=>({name:oe,keys:Z.keys||[],count:Z.count||0}))}catch(Q){n.value=Q.message}s.value=!1}async function N(Q){if(a.value[Q]){a.value[Q]=!1;return}a.value[Q]=!0;const oe=e.value.find(ye=>ye.name===Q);if(!oe||t.value[Q]||i.value===Q)return;i.value=Q;let Z;try{const X=(await W.get(`/api/memory/${encodeURIComponent(Q)}`)).entries||{};Z=oe.keys.map(H=>Object.prototype.hasOwnProperty.call(X,H)?{key:H,value:X[H]||"",failed:!1}:{key:H,value:"",failed:!0,error:"Not found in scope"})}catch(ye){Z=oe.keys.map(X=>({key:X,value:"",failed:!0,error:ye.message||"Failed to load"}))}t.value[Q]=Z,i.value=null}function q(Q,oe,Z){p.value=Q+"/"+oe,f.value=Z}async function ae(Q,oe){m.value=!0,b.value=null;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`,{value:f.value});const Z=t.value[Q];if(Z){const ye=Z.find(X=>X.key===oe);ye&&(ye.value=f.value)}p.value=null}catch(Z){b.value=`Failed to save: ${Z.message||"unknown error"}`}m.value=!1}async function U(Q,oe){try{await navigator.clipboard.writeText(oe.value),E.value=Q+"/"+oe.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function P(){d.value=null,u.value=null;const Q=o.value.scope.trim(),oe=o.value.key.trim(),Z=o.value.value.trim();if(!Q){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!Z){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`,{value:Z}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await D(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(ye){d.value=ye.message}c.value=!1}function M(Q,oe){S.value={scope:Q,key:oe}}async function V(){if(!S.value)return;g.value=!0,b.value=null;const{scope:Q,key:oe}=S.value;try{await W.del(`/api/memory/${encodeURIComponent(Q)}/${encodeURIComponent(oe)}`);const Z=t.value[Q];Z&&(t.value[Q]=Z.filter(H=>H.key!==oe));const ye=e.value.find(H=>H.name===Q);ye&&(ye.count--,ye.keys=ye.keys.filter(H=>H!==oe));const X=new Set(R.value);X.delete(Q+"/"+oe),R.value=X}catch(Z){b.value=`Failed to delete: ${Z.message||"unknown error"}`}g.value=!1,S.value=null}function B(){_.value=!0}async function te(){g.value=!0,b.value=null;const Q=[];for(const oe of R.value){const Z=oe.indexOf("/");Q.push({scope:oe.slice(0,Z),key:oe.slice(Z+1)})}try{await W.post("/api/memory/bulk-delete",{entries:Q}),R.value=new Set,t.value={},await D()}catch(oe){b.value=`Bulk delete failed: ${oe.message||"unknown error"}`}g.value=!1,_.value=!1}return Ke(()=>{D()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:b,copied:E,selected:R,selectedCount:v,totalEntries:C,deleteTarget:S,deleting:g,showBulkDelete:_,fetchMemory:D,toggleScope:N,startEdit:q,doEdit:ae,copyValue:U,doAdd:P,confirmDelete:M,doDelete:V,confirmBulkDelete:B,doBulkDelete:te,isSelected:T,toggleSelect:y,isScopeAllSelected:I,toggleSelectAll:F,filteredEntries:w}}},jw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=J(()=>[...new Set(e.value.map(E=>E.category))].sort()),o=J(()=>{const b={};return e.value.forEach(E=>{b[E.category]=(b[E.category]||0)+1}),b}),c=J(()=>a.value?e.value.filter(b=>b.category===a.value):e.value);function d(b){return b==="correction"?"badge-warning":b==="operational"?"badge-info":b==="preference"?"badge-success":"badge-info"}function u(b){i.value=b.key,l.value=b.content}async function p(b){try{await W.put("/api/learned/"+encodeURIComponent(b),{content:l.value}),i.value=null,Oe.success("Entry updated"),await m()}catch(E){Oe.error(E.message||"Failed to save entry")}}async function f(b){if(await Jt({title:"Delete learned entry",message:`Delete "${b}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(b)),Oe.success("Entry deleted"),await m()}catch(R){Oe.error(R.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const b=await W.get("/api/learned");e.value=b.entries||[],t.value={last_reflection:b.last_reflection,count:b.count}}catch(b){n.value=b.message}s.value=!1}return Ke(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:xa,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},Am=[{id:"tools",label:"Tools",component:Sw},{id:"skills",label:"Skills",component:Ew},{id:"mcp-servers",label:"MCP Servers",component:Bw},{id:"knowledge",label:"Knowledge",component:Hw},{id:"memory",label:"Memory",component:zw},{id:"learned",label:"Learned",component:jw}],Vw={components:{TabbedPage:$r},setup(){return{tabs:Am}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},qw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Gw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Kw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ww={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=J(()=>e.value.components||[]),l=J(()=>Kw[e.value.overall]||"text-gray-400"),r=J(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=J(()=>{const v=e.value.overall;return v==="healthy"?"All Systems Healthy":v==="degraded"?"Some Systems Degraded":v==="unhealthy"?"System Issues Detected":"Unknown"});function c(v){return qw[v]||"text-gray-400"}function d(v){return Gw[v]||"info"}function u(v){return v==="ok"?"badge-success":v==="degraded"?"badge-warning":v==="down"?"badge-danger":"badge-info"}function p(v){return v==="closed"?"text-green-400":v==="half_open"?"text-yellow-400":v==="open"?"text-red-400":"text-gray-400"}function f(v){return v.replace(/_/g," ").replace(/\b\w/g,w=>w.toUpperCase())}function m(v){if(!v)return"—";try{return new Date(v).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return v}}function b(v){return v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?(v/1e3).toFixed(1)+"K":String(v)}async function E(){a.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null,n.value=!0}catch(v){s.value=v.message}finally{t.value=!1,a.value=!1}}function R(){t.value=!0,s.value=null,E()}let S=null,g=!1;function _(){g||(g=!0,E(),S||(S=setInterval(E,3e4)))}function C(){g&&(g=!1,S&&(clearInterval(S),S=null))}return Ke(_),_s(_),ws(C),_t(C),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:b,fetchHealth:E,retry:R}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=J(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=J(()=>{if(!i.value)return[];const E=i.value,R=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/R*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/R*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/R*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/R*100)),color:"res-bar-amber"}]});async function d(){try{const E=await W.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function b(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ke(m),_s(m),ws(b),_t(b),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:wm,refresh:u,retry:p}}},Jw=["INFO","WARNING","ERROR"],Yw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],ro=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Qw=[50,100,200,500],Xw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ye.state||"disconnected"),c=J(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,m=Jw,b=Yw,E=ro,R=h("all"),S=h(""),g=h([]),_=h(!1),C=h(""),v=h([]);function w(){try{const K=localStorage.getItem("odin-log-presets");K&&(g.value=JSON.parse(K))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const y=J(()=>a.value!==""||i.value.trim()!==""||S.value!==""),I=J(()=>{const K=ro.find(he=>he.value===S.value);return K?K.label:""}),F=J(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(K){return K.message}}),D=24,N=J(()=>{if(B.value.length===0)return[];const K=[],he=new Date,Ne=3600*1e3;for(let We=D-1;We>=0;We--){const ct=new Date(he.getTime()-(We+1)*Ne),It=new Date(he.getTime()-We*Ne);K.push({start:ct,end:It,label:P(ct,It),shortLabel:It.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const We of B.value){if(!We._time)continue;const ct=We._time.getTime();for(const It of K)if(ct>=It.start.getTime()&&ct<It.end.getTime()){It.total++,We.level==="ERROR"?It.errors++:We.level==="WARNING"?It.warnings++:It.info++;break}}return K}),q=J(()=>{let K=1;for(const he of N.value)he.total>K&&(K=he.total);return K}),ae=J(()=>{if(N.value.length===0)return"";const K=B.value.map(We=>We._time&&We._time.getTime()).filter(Boolean);if(K.length===0)return"";const he=new Date(Math.min(...K));return`${B.value.length} shown, oldest ${he.toLocaleTimeString()}`}),U=J(()=>Math.ceil(D/8));function P(K,he){const Ne={hour:"2-digit",minute:"2-digit"};return K.toLocaleTimeString([],Ne)+" - "+he.toLocaleTimeString([],Ne)}function M(K,he){return!he||!K?"0px":Math.max(2,K/he*100)+"%"}function V(K){const he=B.value.findIndex(Ne=>Ne._time&&Ne._time.getTime()>=K.start.getTime()&&Ne._time.getTime()<K.end.getTime());if(he>=0&&d.value){const Ne=d.value.querySelectorAll(".log-line");Ne[he]&&(Ne[he].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const B=J(()=>{let K=t.value;if(a.value&&(K=K.filter(he=>(he.level||"INFO")===a.value)),S.value){const he=ro.find(Ne=>Ne.value===S.value);if(he&&he.seconds){const Ne=new Date(Date.now()-he.seconds*1e3);K=K.filter(We=>We._time&&We._time>=Ne)}}if(i.value&&!F.value)if(l.value)try{const he=new RegExp(i.value,"i");K=K.filter(Ne=>{const We=Ne.text||Ne.raw||"",ct=Ne.tool||"";return he.test(We)||he.test(ct)})}catch{}else{const he=i.value.toLowerCase();K=K.filter(Ne=>{const We=(Ne.text||Ne.raw||"").toLowerCase(),ct=(Ne.tool||"").toLowerCase();return We.includes(he)||ct.includes(he)})}return K});function te(K){if(K.type==="log"&&K.line)try{const he=typeof K.line=="string"?JSON.parse(K.line):K.line,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(K.line),tool:"",raw:String(K.line)}}if(K.payload){const he=K.payload,Ne=he.timestamp?new Date(he.timestamp):new Date;return{ts:Ne.toLocaleTimeString(),_time:Ne,level:he.error?"ERROR":"INFO",text:he.tool_name?`[${he.tool_name}] ${he.result_summary||""}`.trim():he.message||JSON.stringify(he),tool:he.tool_name||"",raw:null}}return typeof K=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:K,tool:"",raw:K}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(K),tool:"",raw:null}}function Q(K){const he=te(K);if(s.value){v.value.push(he);return}oe(he)}function oe(K){t.value.push(K),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Ct(()=>Z())}function Z(K=!1){const he=d.value;he&&he.scrollTo({top:he.scrollHeight,behavior:K?"smooth":"instant"})}function ye(){n.value=!0,u.value=!1,Ct(()=>Z(!0))}const X=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function H(){const K=d.value;if(!K)return;const he=K.scrollHeight-K.scrollTop-K.clientHeight<40;u.value=!n.value&&!he&&t.value.length>0,we.value&&re()}function re(){const K=d.value;!K||!n.value||K.scrollHeight-K.scrollTop-K.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function ce(){n.value&&requestAnimationFrame(re)}function Ce(K){X.has(K.key)&&ce()}const we=h(!1);function Be(){n.value&&(we.value=!0,requestAnimationFrame(re))}function k(){we.value&&(we.value=!1,re())}function O(){n.value&&(u.value=!1,Ct(()=>Z()))}function $(){if(s.value=!s.value,!s.value&&v.value.length>0){for(const K of v.value)oe(K);v.value=[]}}function ie(){t.value=[],v.value=[],u.value=!1}function ee(){let K;e.value==="search"?K=Ue.value.map(ct=>{const It=ct.error?"ERROR":"INFO",Gn=ct.tool_name?`[${ct.tool_name}] `:"";return`${ct.timestamp||""} ${It} ${Gn}${ct.result_summary||ct.message||""}`}).join(`
`):K=B.value.map(ct=>`${ct.ts} ${ct.level} ${ct.text}`).join(`
`);const he=new Blob([K],{type:"text/plain"}),Ne=URL.createObjectURL(he),We=document.createElement("a");We.href=Ne,We.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,We.click(),URL.revokeObjectURL(Ne)}function ne(K,he){const Ne=`${K.ts} ${K.level} ${K.text||K.raw||""}`;navigator.clipboard.writeText(Ne).then(()=>{p.value=he,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function fe(K){a.value=a.value===K?"":K,R.value="all"}function ue(K){return K.level==="ERROR"?"log-line-error":K.level==="WARNING"?"log-line-warning":"text-gray-300"}function pe(K){return K==="ERROR"?"text-red-500 font-semibold":K==="WARNING"?"text-yellow-500":"text-blue-500"}function le(K){return K==="ERROR"?"log-chip-error":K==="WARNING"?"log-chip-warning":"log-chip-info"}function ke(K){R.value=K.id;const he=K.filters;a.value=he.level||"",S.value=he.timeRange||"",i.value=he.text||"",he.levels&&(a.value=he.levels[0]||""),he.hasToolName&&(i.value="")}function be(K){R.value=K.id,a.value=K.filters.level||"",S.value=K.filters.timeRange||"",i.value=K.filters.text||""}function xe(){if(!C.value.trim())return;const K={id:"custom-"+Date.now(),name:C.value.trim(),filters:{level:a.value,timeRange:S.value,text:i.value}};g.value=[...g.value,K],T(),_.value=!1,C.value=""}function de(K){g.value=g.value.filter(he=>he.id!==K),T(),R.value===K&&(R.value="all")}const z=h("all"),me=h(""),Te=h(""),Le=h(""),Me=h(""),rt=h(""),at=h(100),Mt=Qw,se=h(!1),_e=h(!1),Ee=h(""),Ue=h([]),mt=h(null),qe=h(null);function ot(){e.value="search",mt.value||zs()}async function zs(){try{mt.value=await W.get("/api/logs/stats")}catch{}}function Ss(){const K=rt.value;if(!K){Le.value="",Me.value="";return}const Ne={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[K];if(Ne){const We=new Date(Date.now()-Ne*1e3);Le.value=Ns(We),Me.value=""}}function Ns(K){const he=Ne=>String(Ne).padStart(2,"0");return`${K.getFullYear()}-${he(K.getMonth()+1)}-${he(K.getDate())}T${he(K.getHours())}:${he(K.getMinutes())}`}function Ft(K){if(!K)return"";const he=new Date(K);return isNaN(he.getTime())?"":he.toISOString()}async function jt(){se.value=!0,Ee.value="",_e.value=!0,qe.value=null;try{const K=new URLSearchParams;z.value&&z.value!=="all"&&K.set("level",z.value),me.value&&K.set("tool",me.value),Te.value&&K.set("q",Te.value);const he=Ft(Le.value),Ne=Ft(Me.value);he&&K.set("start",he),Ne&&K.set("end",Ne),K.set("limit",String(at.value));const We=await W.get(`/api/logs/search?${K.toString()}`);Ue.value=We.entries||[]}catch(K){Ee.value=K.message||"Search failed",Ue.value=[]}finally{se.value=!1}}function nn(){z.value="all",me.value="",Te.value="",Le.value="",Me.value="",rt.value="",at.value=100,Ue.value=[],_e.value=!1,Ee.value="",qe.value=null}function js(K){qe.value=qe.value===K?null:K}function Vs(K){if(!K.timestamp)return"";try{return new Date(K.timestamp).toLocaleString()}catch{return K.timestamp}}function qs(K){return K.type==="web_action"?`${K.status||""} (${K.execution_time_ms||0}ms)`:(K.result_summary||"").slice(0,200)}function Ms(K){return K.error?"log-line-error":"text-gray-300"}function Rn(K){try{return JSON.stringify(K,null,2)}catch{return String(K)}}let vt=null,Ps=!1;function qn(){Ps||(Ps=!0,Ye.subscribe("logs",Q),r.value=Ye.connected,o.value=Ye.state||"disconnected",vt=Ye.onState(K=>{o.value=K,r.value=K==="connected"}))}function Je(){Ps&&(Ps=!1,Ye.unsubscribe("logs",Q),vt&&(vt(),vt=null))}return Ke(()=>{w(),window.addEventListener("pointerup",k),window.addEventListener("pointercancel",k)}),_s(qn),ws(Je),_t(()=>{Je(),window.removeEventListener("pointerup",k),window.removeEventListener("pointercancel",k)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:B,pauseBuffer:v,showJumpBottom:u,copiedIndex:p,regexError:F,levels:m,logPresets:b,timeRanges:E,timeRange:S,activeLogPreset:R,customLogPresets:g,showSaveLogPreset:_,newLogPresetName:C,hasActiveLogFilters:y,timeRangeLabel:I,timelineBuckets:N,timelineMax:q,timelineSpanLabel:ae,timelineLabelSkip:U,togglePause:$,clearLogs:ie,exportLogs:ee,logLineClass:ue,levelClass:pe,levelChipClass:le,toggleLevel:fe,copyLine:ne,jumpToBottom:ye,onScroll:H,onUserScrollIntent:ce,onUserScrollKey:Ce,onAutoScrollToggle:O,onPointerDown:Be,applyLogPreset:ke,applyCustomLogPreset:be,saveLogCustomPreset:xe,removeLogCustomPreset:de,segmentHeight:M,jumpToTimelineBucket:V,searchLevel:z,searchTool:me,searchKeyword:Te,searchStart:Le,searchEnd:Me,searchTimePreset:rt,searchLimit:at,searchLimits:Mt,searching:se,searchRan:_e,searchError:Ee,searchResults:Ue,searchStats:mt,expandedSearch:qe,switchToSearch:ot,runSearch:jt,clearSearchFilters:nn,toggleSearchExpand:js,formatSearchTs:Vs,searchEntryText:qs,searchLogLineClass:Ms,formatJson:Rn,applySearchTimePreset:Ss}}};function Sl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const ek=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const r=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(r)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Ga=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},oo=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),nk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Uu(e){return nk.some(t=>e===t||e.startsWith(`${t}.`))}const Rm="odin_config_center_expanded_v1",Im="odin_config_center_category_v1",ak=50,ik=650,co=()=>W.get("/api/config/meta");function sa(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ni(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Aa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function rk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Om(e,t){if(Ni(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return sa(t);const n={};for(const[a,i]of Object.entries(t)){const l=Om(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function ok(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Om(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Lm(e,t,s,n){if(Ni(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Lm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function ck(){try{const e=JSON.parse(localStorage.getItem(Rm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dk(){try{const e=localStorage.getItem(Im);return Ga.some(t=>t.key===e)?e:Ga[0].key}catch{return Ga[0].key}}const uk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),r=h(null),o=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(dk()),m=h(ck()),b=h({}),E=h({}),R=h(""),S=h({}),g=h({}),_=h([]),C=h([]),v=h(!1),w=h(!1),T=h(!1);let y=null,I=null,F={path:null,at:0},D=0;const N=J(()=>{var x;return(((x=t.value)==null?void 0:x.fields)||[]).filter(L=>!oo.has(L.path.split(".")[0])&&!Uu(L.path))}),q=J(()=>new Map(N.value.map(x=>[x.path,x]))),ae=J(()=>B.value.reduce((x,L)=>x+L.sections.length,0)),U=J(()=>N.value.length),P=J(()=>ek),M=J(()=>_.value.length>0),V=J(()=>C.value.length>0),B=J(()=>{if(!e.value)return[];const x=new Set(Ga.flatMap(ve=>ve.sections)),L=Ga.map(ve=>({...ve,sections:ve.sections.filter(De=>Object.hasOwn(e.value,De)&&!oo.has(De))})).filter(ve=>ve.sections.length),G=Object.keys(e.value).filter(ve=>!x.has(ve)&&!oo.has(ve));return G.length&&L.push({key:"other",label:"Other",icon:"folder",sections:G}),L}),te=J(()=>e.value?{...e.value,...b.value}:null),Q=J(()=>{if(!e.value)return[];const x=[];for(const[L,G]of Object.entries(b.value))Lm(e.value[L],G,L,x);return x.filter(L=>!Ni(L.oldVal,L.newVal)).map(L=>{const G=O(L.path);return{...L,label:(G==null?void 0:G.label)||Aa(L.path.split(".").at(-1)),apply_mode:(G==null?void 0:G.apply_mode)||fe(L.path.split(".")[0])}})}),oe=J(()=>Q.value.length>0),Z=J(()=>Q.value.length),ye=J(()=>new Set(Q.value.map(x=>x.path.split(".")[0])).size),X=J(()=>!!u.value||p.value!=="all"),H=J(()=>{const x={...g.value};for(const L of Q.value){const G=O(L.path),ve=wa(G,L.newVal);ve&&(x[L.path]=ve)}return x}),re=J(()=>Object.keys(H.value).length>0),ce=J(()=>e.value?(X.value?B.value:B.value.filter(L=>L.key===f.value)).map(L=>({...L,sections:L.sections.filter(G=>se(G))})).filter(L=>L.sections.length):[]),Ce=J(()=>{const x=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],L=new Map(x.map(G=>[G,[]]));for(const G of Q.value){const ve=L.has(G.apply_mode)?G.apply_mode:"restart";L.get(ve).push(G)}return x.filter(G=>L.get(G).length).map(G=>({key:G,label:ms(G),entries:L.get(G)}))}),we=J(()=>Q.value.filter(x=>x.apply_mode==="restart").length),Be=J(()=>N.value.filter(x=>x.pending_restart)),k=J(()=>Be.value.length);function O(x){const L=q.value.get(x);return L?{...L,apply_details:Sl([L])}:null}function $(x){const L=`${x}.`;return N.value.filter(G=>G.path===x||G.path.startsWith(L))}function ie(x){return $(x).length}function ee(x){return Aa(x)}function ne(x){const L=$(x);if(!L.length)return`${Aa(x)} configuration.`;const G=L.find(gt=>gt.sensitivity==="public"&&gt.description)||L.find(gt=>gt.description),ve=(G==null?void 0:G.description)||"";return ve.match(/setting for (.+)\.$/i)?`${Aa(x)} settings and runtime behaviour.`:ve}function fe(x){const L=[...new Set($(x).map(G=>G.apply_mode))];return L.length===1?L[0]:L.includes("restart")?"restart":L.includes("activation_required")?"activation_required":L[0]||"restart"}function ue(x){const L=[...new Set($(x).map(G=>ms(G.apply_mode)))];return L.length?L.length===1?L[0]:`Mixed apply behaviour: ${L.join(" · ")}`:""}function pe(x){return Sl($(x))}function le(x){var L;return Object.hasOwn(b.value,x)?b.value[x]:(L=e.value)==null?void 0:L[x]}function ke(){const x=le("mcp")||{},L=Object.keys(x.servers||{}).length;return`${x.enabled?"Globally enabled":"Globally disabled"} · ${L} configured server${L===1?"":"s"}.`}function be(x,L){return L.split(".").reduce((G,ve)=>G==null?void 0:G[ve],x)}function xe(x){const L=te.value;return $(x).filter(G=>Uu(G.path)?!1:G.path.split(".").length<=2?!0:!G.path.includes(".*")).map(G=>({...G,key:G.path.split(".").at(-1),value:be(L,G.path),apply_details:Sl([G]),editor:G.path==="agents.final_warning_iterations"?"warning-chips":null}))}function de(x){const L=x.path.split(".");return L.length>2?L.slice(0,2).join("."):null}function z(x){const L=new Map;for(const G of xe(x)){const ve=de(G),De=ve||`${x}.__root`;L.has(De)||L.set(De,{key:De,path:ve,entries:[]}),L.get(De).entries.push(G)}return[...L.values()].map(G=>{const ve=G.entries.find(De=>De.group_description);return{...G,label:G.path?Aa(G.path.split(".").at(-1)):null,description:(ve==null?void 0:ve.group_description)||null,apply_details:Sl(G.entries),runtime_summaries:Te(G.entries)}})}function me(x){return{save:x.save_effect||(x.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:x.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[x.apply_mode]||"Effective runtime state is not currently observable."}}function Te(x){const L=new Map;for(const G of x){const ve=me(G),De=`${G.apply_mode}|${ve.save}|${ve.runtime}`;L.has(De)||L.set(De,{key:De,label:ms(G.apply_mode),save:ve.save,runtime:ve.runtime})}return[...L.values()]}function Le(x){if(Me(x))return x.runtime_effect||x.activation_policy||"";if(x.apply_mode==="activation_required"){const L=x.activation_policy||x.runtime_effect;return L?`Not active after saving. No activation control exists in this release. ${L}`:"Not active after saving; no activation control exists in this release."}return""}function Me(x){return x.action_available===!0&&!!(x.action_label&&x.action_endpoint)}async function rt(x){if(Me(x))try{if(qe(x.path))throw new Error("Save this setting before applying its action.");const L=String(x.action_method||"POST").toLowerCase(),G={post:W.post.bind(W),put:W.put.bind(W),delete:W.del.bind(W)}[L];if(!G)throw new Error("Unsupported configuration action");await G(x.action_endpoint,x.action_body||void 0),await Y(),Xt("success",`${x.action_label} completed.`)}catch(L){Xt("error",L.message||`${x.action_label} failed`)}}function at(x,L){return[x.label,x.path,x.description,...x.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(L)}function Mt(x){const L=u.value.trim().toLowerCase();return L?$(x).filter(G=>at(G,L)):[]}function se(x){const L=$(x);if(p.value!=="all"&&!L.some(ve=>ve.apply_state===p.value))return!1;const G=u.value.trim().toLowerCase();return!G||`${ee(x)} ${x}`.toLowerCase().includes(G)?!0:L.some(ve=>at(ve,G))}function _e(x,L){return $(x).filter(G=>G.apply_state===L).length}function Ee(x){return x==="all"?U.value:N.value.filter(L=>L.apply_state===x).length}function Ue(x){const L=x.sections.flatMap(G=>$(G));return{fields:L.length,modified:Q.value.filter(G=>x.sections.includes(G.path.split(".")[0])).length,pending_restart:L.filter(G=>G.apply_state==="pending_restart").length,invalid:L.filter(G=>G.apply_state==="invalid").length,dormant:L.filter(G=>G.apply_state==="dormant").length}}function mt(x){var L;return Object.hasOwn(b.value,x)&&!Ni((L=e.value)==null?void 0:L[x],b.value[x])}function qe(x){return Q.value.some(L=>L.path===x||L.path.startsWith(`${x}.`))}function ot(x){f.value=x,u.value="",p.value="all";try{localStorage.setItem(Im,x)}catch{}}function zs(x){p.value=x}function Ss(){u.value="",p.value="all"}function Ns(x){var L;return((L=B.value.find(G=>G.sections.includes(x)))==null?void 0:L.sections)||[]}function Ft(x){const L=Ns(x),G=L.find(ve=>m.value[ve]===!0);return G||L.find(ve=>m.value[ve]!==!1)||null}function jt(x){return u.value&&!T.value&&se(x)?!0:T.value?Ft(x)===x:Object.hasOwn(m.value,x)?m.value[x]===!0:!0}function nn(x){const L=!jt(x);if(T.value){const G={...m.value};for(const ve of Ns(x))G[ve]===!0&&(G[ve]=!1);G[x]=L,m.value=G;return}m.value={...m.value,[x]:L}}function js(){_.value.push(sa(b.value)),_.value.length>ak&&_.value.shift(),C.value=[]}function Vs(){oe.value&&(js(),b.value={},g.value={},v.value=!1)}function qs(x,L=!1){const G=Date.now();if(L&&F.path===x&&G-F.at<ik){F.at=G;return}js(),F={path:x,at:G}}function Ms(x,L,G){if(!L.length)return G;const ve=sa(x??{});let De=ve;for(let gt=0;gt<L.length-1;gt+=1){const it=L[gt];De[it]=sa(De[it]??{}),De=De[it]}return De[L.at(-1)]=G,ve}function Rn(x){var L;return Object.hasOwn(b.value,x)?b.value[x]:sa((L=e.value)==null?void 0:L[x])}function vt(x,L,G={}){var di;const[ve,...De]=x.path.split(".");qs(x.path,!!G.coalesce);const gt=Rn(ve),it=De.length?Ms(gt,De,L):L,Gs={...b.value};if(Ni(it,(di=e.value)==null?void 0:di[ve])?delete Gs[ve]:Gs[ve]=it,b.value=Gs,g.value[x.path]){const od={...g.value};delete od[x.path],g.value=od}}function Ps(x){F={path:null,at:0},E.value={...E.value,[x]:String(be(te.value,x)??"")}}function qn(x){if(F={path:null,at:0},!Object.hasOwn(E.value,x))return;const L={...E.value};delete L[x],E.value=L}function Je(x){const L=E.value[x.path];if(F={path:null,at:0},L===""){g.value={...g.value,[x.path]:"Enter a number."};return}const G=Number(L);if(Number.isNaN(G)||x.type==="integer"&&!Number.isInteger(G)){g.value={...g.value,[x.path]:x.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ve={...E.value};delete ve[x.path],E.value=ve,vt(x,G,{coalesce:!0})}function K(x){return Object.hasOwn(E.value,x.path)?E.value[x.path]:x.value??""}function he(x,L){if(E.value={...E.value,[x.path]:L},L===""){g.value={...g.value,[x.path]:"Enter a number."};return}const G=Number(L);if(!Number.isFinite(G)||x.type==="integer"&&!Number.isInteger(G)){g.value={...g.value,[x.path]:x.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[x.path]){const ve={...g.value};delete ve[x.path],g.value=ve}vt(x,G,{coalesce:!0})}function Ne(x){const L=Number.parseInt(R.value,10);if(!Number.isInteger(L)||L<1){g.value={...g.value,[x.path]:"Warning thresholds must be positive whole numbers."};return}const G=[...new Set([...x.value||[],L])].sort((ve,De)=>De-ve);R.value="",vt(x,G)}function We(x,L){vt(x,(x.value||[]).filter(G=>G!==L))}function ct(x){return x.apply_mode==="live_read"?"Odin reads the saved file value on next use.":x.apply_mode==="live_for_new_work"?"New work uses the saved file value.":x.apply_mode==="live_apply"?x.apply_handler?`Apply the saved value through ${x.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":x.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":x.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":x.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function It(x){return x.type==="array"&&Array.isArray(x.value)&&!x.structured_container&&!x.structured_container_child&&x.sensitivity==="public"&&x.value.every(L=>["string","number","boolean"].includes(typeof L))}function Gn(x){const L=String(S.value[x.path]??"").trim();if(!L)return;const G=[...new Set([...x.value||[],L])];S.value={...S.value,[x.path]:""},vt(x,G)}function Qt(x,L){vt(x,(x.value||[]).filter(G=>G!==L))}function wa(x,L){var ve;if(!x)return null;if((ve=x.enum)!=null&&ve.length&&!x.enum.includes(L))return`Choose one of: ${x.enum.join(", ")}`;if(x.path==="agents.final_warning_iterations"&&(!Array.isArray(L)||!L.length))return"Add at least one warning threshold.";const G=x.constraints||{};if((x.type==="integer"||x.type==="number")&&typeof L=="number"){if(G.minimum!==void 0&&L<G.minimum)return`Must be at least ${G.minimum}${x.unit?` ${x.unit}`:""}`;if(G.maximum!==void 0&&L>G.maximum)return`Must be at most ${G.maximum}${x.unit?` ${x.unit}`:""}`}return null}function Ds(x){return H.value[x.path]||null}function oi(x){const L=`${x}.`;return Object.keys(H.value).some(G=>G===x||G.startsWith(L))}function ka(){_.value.length&&(C.value.push(sa(b.value)),b.value=_.value.pop(),g.value={},E.value={},F={path:null,at:0})}function Kn(){C.value.length&&(_.value.push(sa(b.value)),b.value=C.value.pop(),g.value={},E.value={},F={path:null,at:0})}function Sa(){!oe.value||re.value||(v.value=!0,w.value=!1)}function Wn(){v.value=!1}function In(){Vs()}function ms(x){return sk[x]||Aa(x||"unknown")}function an(x){return`apply-${String(x||"unknown").replaceAll("_","-")}`}function j(x){return`cfgc-field-${x.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Se(x){return`${j(x)}-input`}function Ie(x){const L=document.getElementById(j(x))||document.getElementById(j(x.split(".").slice(0,2).join(".")));L==null||L.scrollIntoView({behavior:"smooth",block:"center"})}function Xt(x,L){l.value={type:x,message:L},window.setTimeout(()=>{var G;((G=l.value)==null?void 0:G.message)===L&&(l.value=null)},3500)}function Zn(){o.value=!1,p.value="pending_restart",u.value="";const x=tk(n.value);x&&(x.scrollTop=0)}function Jn(){o.value=!1}function Yn(x=1800){I&&window.clearTimeout(I),I=window.setTimeout(ci,x)}async function ci(){if(c.value){if(D+=1,D>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await co(),k.value===0){c.value=!1,d.value=null,Xt("success","Odin restarted and the saved startup settings are active.");return}}catch{}Yn(2e3)}}async function Ae(){if(!c.value){d.value=null;try{await W.post("/api/restart",{}),c.value=!0,D=0,o.value=!1,Yn()}catch(x){d.value=x.message||"Odin could not schedule a restart."}}}async function A(){if(!(!oe.value||re.value||a.value)){a.value=!0;try{const x=ok(e.value,b.value),L=await W.put("/api/config",x);e.value=L,b.value={},_.value=[],C.value=[],g.value={},v.value=!1;try{t.value=await co(),r.value=null,o.value=k.value>0,Xt("success",k.value?`Configuration saved. ${k.value} setting${k.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(G){r.value=G.message||"Unknown metadata error.",Xt("error",`Configuration saved, but apply status could not be refreshed: ${r.value}`)}}catch(x){Xt("error",x.message||"Configuration could not be saved")}finally{a.value=!1}}}async function Y(){var x,L;if(!oe.value){s.value=!0,i.value=null;try{const G=await W.get("/api/config"),ve=await co();e.value=G,t.value=ve,r.value=null;const De=B.value;if(De.some(gt=>gt.key===f.value)||(f.value=((x=De[0])==null?void 0:x.key)||Ga[0].key),T.value){const it=(((L=De.find(Gs=>Gs.key===f.value))==null?void 0:L.sections)||[]).find(Gs=>m.value[Gs]===!0);m.value=it?{...m.value,[it]:!0}:{}}}catch(G){i.value=G.message||"Unknown configuration error"}finally{s.value=!1}}}function ge(x){if(v.value||!(x.ctrlKey||x.metaKey))return;const L=x.target;L instanceof HTMLElement&&(L.matches("input, textarea, select")||L.isContentEditable)||(!x.shiftKey&&x.key.toLowerCase()==="z"?(x.preventDefault(),ka()):(x.key.toLowerCase()==="y"||x.shiftKey&&x.key.toLowerCase()==="z")&&(x.preventDefault(),Kn()))}function Pe(x){T.value=x.matches}return is(m,x=>{try{localStorage.setItem(Rm,JSON.stringify(x))}catch{}},{deep:!0}),Ke(()=>{var x;Y(),document.addEventListener("keydown",ge),y=window.matchMedia("(max-width: 760px)"),Pe(y),(x=y.addEventListener)==null||x.call(y,"change",Pe)}),_t(()=>{var x;document.removeEventListener("keydown",ge),(x=y==null?void 0:y.removeEventListener)==null||x.call(y,"change",Pe),I&&window.clearTimeout(I)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:r,restartPromptOpen:o,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:v,mobileOverflowOpen:w,warningThresholdInput:R,arrayInputs:S,healthFilters:P,visibleCategories:B,displayGroups:ce,reviewGroups:Ce,sectionCount:ae,fieldCount:U,hasChanges:oe,changeCount:Z,changedSectionCount:ye,hasDraftErrors:re,canUndo:M,canRedo:V,globalFilterActive:X,reviewRestartCount:we,pendingRestartCount:k,pendingRestartFields:Be,healthCount:Ee,categoryStats:Ue,selectCategory:ot,selectHealthFilter:zs,clearFilters:Ss,sectionLabel:ee,sectionDescription:ne,sectionFieldCount:ie,sectionHealthCount:_e,sectionApplySummary:ue,sectionApplyDetails:pe,sectionEntries:xe,fieldGroups:z,sectionSearchHits:Mt,mcpConfigSummary:ke,fieldRuntimeCopy:me,fieldSpecificRuntimeNote:Le,hasHonestAction:Me,runFieldAction:rt,sectionChanged:mt,fieldChanged:qe,isSectionExpanded:jt,toggleSection:nn,discardAllDrafts:Vs,setFieldValue:vt,setNumberFieldValue:he,numberInputValue:K,beginInputEdit:Ps,endTextInputEdit:qn,endInputEdit:Je,addWarningThreshold:Ne,removeWarningThreshold:We,isScalarArray:It,addScalarArrayItem:Gn,removeScalarArrayItem:Qt,fieldError:Ds,sectionHasErrors:oi,undo:ka,redo:Kn,openReview:Sa,closeReview:Wn,mobileCancel:In,applyModeLabel:ms,applyClass:an,compactValue:lk,formatValue:rk,structuredApplyCopy:ct,fieldId:j,fieldInputId:Se,focusField:Ie,fetchConfig:Y,saveConfig:A,restartOdin:Ae,restartLater:Jn,reviewPendingRestart:Zn}}},pk=/^\d{15,25}$/;function Nm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Mm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=J(()=>new Set((e.excludedIds||[]).map(String))),r=J(()=>{const C=s.value.toLowerCase().trim();return(e.members||[]).filter(v=>l.value.has(String(v.id))?!1:C?u(v).toLowerCase().includes(C)||String(v.username||"").toLowerCase().includes(C)||String(v.id).includes(C):!0)}),o=J(()=>{const C=s.value.trim();return r.value.length===0&&pk.test(C)&&!l.value.has(C)?C:""}),c=J(()=>r.value.length+(o.value?1:0)),d=J(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(C){return Nm(C)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const C=Math.max(c.value-1,0);a.value=Math.min(a.value+1,C)}function b(){a.value=Math.max(a.value-1,0)}function E(){const C=r.value[a.value];C?R(C):o.value&&a.value===r.value.length&&S(o.value)}function R(C){S(String(C.id))}function S(C){t("select",C),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function _(){setTimeout(g,150)}return Ke(()=>{e.autofocus&&Ct(()=>{var C;return(C=i.value)==null?void 0:C.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:b,selectHighlighted:E,selectMember:R,selectId:S,closeOptions:g,onBlur:_}}};function Hu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const fk={components:{DiscordUserCombobox:Mm},template:`
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
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </span>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <span class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked)" />
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
                        @change="setChannelConfig(ch.id, guild.id, 'enabled', $event.target.checked)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.require_mention"
                        @change="setChannelConfig(ch.id, guild.id, 'require_mention', $event.target.checked)" />
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td class="text-center">
                    <label class="toggle-switch">
                      <input type="checkbox"
                        :checked="ch.effective.respond_to_bots"
                        @change="setChannelConfig(ch.id, guild.id, 'respond_to_bots', $event.target.checked)" />
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),r=h(null),o=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=J(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=J(()=>new Map(c.value.map(N=>[String(N.id),N])));function m(N){return N.config&&N.config.enabled!==void 0?N.config.enabled:!0}function b(N){return Hu(N,"require_mention",a.value)}function E(N){return Hu(N,"respond_to_bots",a.value)}function R(N){return N.config&&Object.keys(N.config).length>0}function S(N){n.value[N]=!n.value[N]}function g(N){const q=N.discord||{};return{allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]}}async function _({showLoading:N=!0}={}){const q=++d;N&&(t.value=!0),s.value=null;try{const ae=await W.get("/api/discord/guilds");q===d&&(e.value=ae)}catch(ae){q===d&&(s.value=ae.message)}finally{N&&q===d&&(t.value=!1)}}async function C(){t.value=!0,s.value=null;try{const[N,q,ae]=await Promise.all([W.get("/api/discord/guilds"),W.get("/api/discord/members").catch(()=>[]),W.get("/api/config")]),U=g(ae),P=p.value;a.value=U,P||(i.value=JSON.parse(JSON.stringify(U))),c.value=q,e.value=N,r.value=null}catch(N){s.value=N.message}finally{t.value=!1}}async function v(N,q,ae){try{await W.put("/api/discord/guild/"+N+"/config",{[q]:ae}),await _({showLoading:!1})}catch(U){s.value=U.message}}async function w(N,q,ae,U){try{await W.put("/api/discord/channel/"+N+"/config",{[ae]:U}),await _({showLoading:!1})}catch(P){s.value=P.message}}async function T(N,q){try{await W.put("/api/discord/channel/"+N+"/config",{clear:!0}),await _({showLoading:!1})}catch(ae){s.value=ae.message}}function y(N,q){const ae=String(q);if(!N.userAutocomplete)return ae;const U=f.value.get(ae);return U?Nm(U):ae}function I(N,q=null){const ae=String(q??o.value[N]??"").trim();!ae||i.value[N].includes(ae)||(i.value[N]=[...i.value[N],ae],o.value={...o.value,[N]:""})}function F(N,q){i.value[N]=i.value[N].filter(ae=>ae!==q)}async function D(){if(!(!p.value||l.value)){l.value=!0,r.value=null;try{const q=(await W.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...q.allowed_users||[]],channels:[...q.channels||[]],respond_to_bots:!!q.respond_to_bots,require_mention:!!q.require_mention,ignore_bot_ids:[...q.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(N){r.value=N.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ke(C),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:b,guildBots:E,hasOverride:R,toggleGuild:S,fetchAll:C,fetchGuilds:_,setGuildConfig:v,setChannelConfig:w,clearOverride:T,globalItemLabel:y,addGlobalItem:I,removeGlobalItem:F,saveGlobalDefaults:D}}},vs=e=>e==null?e:JSON.parse(JSON.stringify(e));function hk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function b(v){d+=1;const w=c.then(v,v);return c=w.catch(()=>{}),w}function E(v,w){f=vs(v),m.clear();for(const[T,y]of Object.entries(w||{}))m.set(T,vs(y))}function R(v){const w=vs(v),T=++u;return b(async()=>{try{await e(vs(w)),f=vs(w),T===u&&n(vs(w))}catch(y){T===u&&(a(vs(f)),o(y,{kind:"default"}))}})}function S(v,w){const T=vs(w),y=(p.get(v)||0)+1;return p.set(v,y),b(async()=>{try{await t(v,vs(T)),m.set(v,vs(T)),y===p.get(v)&&i(v,vs(T))}catch(I){y===p.get(v)&&(l(v,vs(m.get(v)??null)),o(I,{kind:"user",uid:v}))}})}function g(v){const w=(p.get(v)||0)+1;return p.set(v,w),b(async()=>{try{await s(v),m.delete(v),w===p.get(v)&&r(v)}catch(T){w===p.get(v)&&(l(v,vs(m.get(v)??null)),o(T,{kind:"delete",uid:v}))}})}async function _(){for(;;){const v=c;if(await v,v===c)return d}}async function C(v){for(;;){const w=await _(),T=await v();if(w===d)return T}}return{seed:E,saveDefault:R,saveUser:S,deleteUser:g,whenIdle:_,readSnapshot:C,get revision(){return d}}}const mk={components:{DiscordUserCombobox:Mm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h([]),o=J(()=>{const v={};for(const w of r.value)v[w.id]=w;return v});function c(v){return o.value[v]||null}function d(v,w){return v?v.allowed_hosts===null||v.allowed_hosts===void 0?{allowed_hosts:[...w],default_host:v.default_host||"",allow_all:!0}:{allowed_hosts:v.allowed_hosts,default_host:v.default_host||"",allow_all:!1}:{allowed_hosts:[...w],default_host:w[0]||"",allow_all:!0}}const u=hk({applyDefault:async v=>{const w=v.allow_all?null:v.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:w,default_host:v.default_host})},applyUser:async(v,w)=>{const T=w.allow_all?null:w.allowed_hosts;await W.put(`/api/host-access/user/${v}`,{allowed_hosts:T,default_host:w.default_host})},applyDelete:v=>W.del(`/api/host-access/user/${v}`),onDefaultConfirmed:()=>Oe.success("Default policy updated"),onDefaultRollback:v=>{v&&(a.value=v)},onUserConfirmed:v=>{const w=c(v);Oe.success(`Updated access for ${w?w.display_name:v}`)},onUserRollback:(v,w)=>{const T={...i.value};w?T[v]=w:delete T[v],i.value=T},onUserDeleted:v=>{const w={...i.value};delete w[v],i.value=w},onError:(v,w)=>{var y;const T=w.uid?` ${((y=c(w.uid))==null?void 0:y.display_name)||w.uid}`:"";Oe.error(`${v.message||"Failed to save"} — reverted${T}`)}});let p=0;async function f(){const v=++p;e.value=!0,t.value="";try{const w=await u.readSnapshot(()=>W.get("/api/host-access"));if(v!==p)return;s.value=w,n.value=w.available_hosts||[],a.value=d(w.default_policy,n.value);const T=w.users||{},y={};for(const[I,F]of Object.entries(T))y[I]=d(F,n.value);i.value=y,u.seed(a.value,y)}catch(w){v===p&&(t.value=w.message||"Failed to fetch host access data")}finally{v===p&&(e.value=!1)}try{const w=await W.get("/api/discord/members")||[];v===p&&(r.value=w)}catch{v===p&&(r.value=[])}}function m(){u.saveDefault(a.value)}function b(v,w){a.value.allow_all=!1,w?a.value.allowed_hosts.includes(v)||a.value.allowed_hosts.push(v):(a.value.allowed_hosts=a.value.allowed_hosts.filter(T=>T!==v),a.value.default_host===v&&(a.value.default_host=a.value.allowed_hosts[0]||"")),m()}function E(v){const w=i.value[v];w&&u.saveUser(v,w)}function R(v,w,T){const y=i.value[v];y&&(y.allow_all=!1,T?y.allowed_hosts.includes(w)||y.allowed_hosts.push(w):(y.allowed_hosts=y.allowed_hosts.filter(I=>I!==w),y.default_host===w&&(y.default_host=y.allowed_hosts[0]||"")),E(v))}function S(v,w){const T=i.value[v];T&&(T.default_host=w,E(v))}function g(){l.value=!0}function _(v){!/^\d{15,25}$/.test(v)||i.value[v]||(i.value[v]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},E(v),l.value=!1)}async function C(v){const w=c(v);await Jt({title:"Remove user override",message:`Remove the host access override for ${w?w.display_name:v}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(v),i.value[v]||Oe.success(`Removed override for ${w?w.display_name:v}`))}return Ke(f),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:f,saveDefaultPolicy:m,toggleDefaultHost:b,getMember:c,toggleUserHost:R,setUserDefault:S,openAddUser:g,addUserById:_,deleteUser:C}}},vk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=J(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=J(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await W.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function b(T){return!T||!T.trim()?[]:T.split(",").map(y=>y.trim()).filter(Boolean)}function E(T,y){const I=c.value.allowed_hosts;if(y&&!I.includes(T)&&I.push(T),!y){const F=I.indexOf(T);F>=0&&I.splice(F,1)}}function R(T,y){const I=d.value.allowed_hosts;if(y&&!I.includes(T)&&I.push(T),!y){const F=I.indexOf(T);F>=0&&I.splice(F,1)}}async function S(){var T;i.value=!0;try{const y=b(c.value.allowed_tools_str),I=c.value.host_mode,F=I==="none"?[]:I==="select"?c.value.allowed_hosts:null,D={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:y.length?y:[]};F!==null&&(D.allowed_hosts=F),D.default_host=c.value.default_host||"";const N=await W.post("/api/tokens",D);l.value=N.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Oe.success("Token created"),await m()}catch(y){Oe.error(((T=y.data)==null?void 0:T.error)||y.message||"Failed to create token")}finally{i.value=!1}}function g(T){r.value=T;const y=T.allowed_hosts;let I="default";y==null?I="default":Array.isArray(y)&&y.length===0?I="none":Array.isArray(y)&&(I="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:I,allowed_hosts:Array.isArray(y)?[...y]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function _(){var T;if(r.value){o.value=!0;try{const y=b(d.value.allowed_tools_str),I=d.value.host_mode,F={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:y};I==="none"?F.allowed_hosts=[]:I==="select"?F.allowed_hosts=d.value.allowed_hosts:F.allowed_hosts=null,F.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),F),r.value=null,Oe.success("Token updated"),await m()}catch(y){Oe.error(((T=y.data)==null?void 0:T.error)||y.message||"Failed to update")}finally{o.value=!1}}}async function C(T){var I;if(await Jt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const F=await W.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=F.token,Oe.success("Token regenerated")}catch(F){Oe.error(((I=F.data)==null?void 0:I.error)||F.message||"Failed to regenerate")}}async function v(T){var I;if(await Jt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(T.user_id)),Oe.success("Token deleted"),await m()}catch(F){Oe.error(((I=F.data)==null?void 0:I.error)||F.message||"Failed to delete")}}async function w(){if(l.value)try{await navigator.clipboard.writeText(l.value),Oe.success("Copied to clipboard")}catch{Oe.error("Copy failed — select and copy manually")}}return Ke(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:E,toggleEditHost:R,createToken:S,startEdit:g,saveEdit:_,confirmRegenerate:C,confirmDelete:v,copyToken:w}}},gk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),bk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),yk=Object.freeze(["enabled","base_url","model","max_tokens"]),xk=Object.freeze(["enabled","model","max_tokens"]);function Br(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function zu(e){return Br(e,gk)}function ju(e){return Br(e,bk)}function _k(e,{includeApiKey:t=!1}={}){const s=Br(e,yk);return t&&(s.api_key=e.api_key),s}function wk(e){return{timeout:e.timeout}}function kk(e,{includeApiKey:t=!1}={}){const s=Br(e,xk);return t&&(s.api_key=e.api_key),s}function Sk(e){return{timeout:e.timeout}}function Tl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Tk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=J(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),r=J(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),o=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],c=J(()=>!o.includes(a.value.model)&&!(o.includes(a.value.agent_model)&&a.value.agent_reasoning_effort==="")),d=J(()=>{const j=a.value.agent_model;return j==="auto"?!0:!o.includes(j||a.value.model)}),u=J(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?!1:(j||a.value.reasoning_effort)==="max"}),p=j=>o.includes(j)&&(a.value.reasoning_effort==="max"||a.value.agent_model===""&&u.value),f=j=>o.includes(j)&&u.value,m=h({enabled:!1,model:"gpt-5.6-luna"}),b=h({unavailable_reason:null}),E=J(()=>{const j=m.value.model;return j&&!i.includes(j)?[j,...i]:i});function R(j){const Se=j.target.value;m.value.enabled=Se!=="",Se!==""&&(m.value.model=Se),K()}const S=h(!1),g=h({codex:!1,ollama:!1,kimi:!1}),_=h(null),C=h(!1),v=h(""),w=h(null),T=h(!1);let y=0;const I=J(()=>{var j;return Object.entries(((j=_.value)==null?void 0:j.models)||{}).map(([Se,Ie])=>{var Xt,Zn,Jn;return{model:Se,floor:Ie.floor,override:Ie.override,effectiveBudget:(Xt=Ie.effective)==null?void 0:Xt.effective_budget,configuredPrimaryChars:(Zn=Ie.configured)==null?void 0:Zn.primary_chars,primaryChars:(Jn=Ie.effective)==null?void 0:Jn.primary_chars,provenance:Ie.provenance,clampExpiresAt:Ie.clamp_expires_at}})}),F=J(()=>{var j;return((j=_.value)==null?void 0:j.clamps)||[]}),D=J(()=>{var j,Se;return((Se=(j=_.value)==null?void 0:j.models)==null?void 0:Se[a.value.model])||null}),N=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),q=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),ae=h(!1),U=h(!1),P=h(!1),M=h(!1),V=h(!1),B=h(!1),te=h(!1),Q=h({configured:null}),oe=h(!1),Z=h([]),ye=h(""),X=h(!1),H=h(!1),re=h({configured:null}),ce=h(!1),Ce=h([]),we=h(""),Be=h(!1),k=h(!1),O=h(!0),$=h(""),ie=h({configured:null,accounts:[]}),ee=h(null),ne=h(null),fe=h(""),ue=h(null),pe=h(!1),le=h(null),ke=h(null),be=h("");let xe=null;function de(j,Se="success"){Oe(j,Se==="error"?"error":"success")}function z(j){if(!j)return"?";const Se=j/(1024*1024*1024);return Se>=1?Se.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function me(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Te(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function Le(j){const Se=new Date(j);return Number.isNaN(Se.getTime())?"unknown":Se.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Me(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function rt(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function at(j){const Se=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(Se))&&Number(Se)>j.floor}function Mt(j,Se){const Ie={...a.value.context_budget_overrides};Se.target.value===""?delete Ie[j]:Ie[j]=Number(Se.target.value),a.value.context_budget_overrides=Ie,T.value=!0}function se(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),T.value=!0}function _e(j){const Se={...a.value.context_budget_overrides};delete Se[j],a.value.context_budget_overrides=Se,T.value=!0}async function Ee(){e.value=!0,await Promise.all([Ue(),qe(),jt(),ot(),mt()]),e.value=!1}async function Ue({preserveBasic:j=!1,preserveAdvanced:Se=!1}={}){try{const Ie=await W.get("/api/llm/status");t.value=Ie,s.value=!1,n.value=Ie.active_provider||"codex",Ie.codex&&!Je.pending()&&(j||(a.value.enabled=Ie.codex.enabled,a.value.model=Ie.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ie.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ie.codex.agent_reasoning_effort||"",a.value.agent_model=Ie.codex.agent_model||""),Se||(a.value.request_timeout_seconds=Ie.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ie.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ie.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ie.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ie.codex.context_compression||{}},!T.value&&!P.value&&(a.value.context_budget_overrides={...Ie.codex.context_budget_overrides||{}},a.value.context_utilization=Ie.codex.context_utilization??a.value.context_utilization))),Ie.ollama&&!he.pending()&&(j||(N.value.enabled=Ie.ollama.enabled,N.value.base_url=Ie.ollama.base_url||"",N.value.model=Ie.ollama.model||"",N.value.max_tokens=Ie.ollama.max_tokens||4096),Se||(N.value.timeout=Ie.ollama.timeout??N.value.timeout)),Ie.kimi&&!Ne.pending()&&(j||(q.value.enabled=Ie.kimi.enabled,q.value.model=Ie.kimi.model||"",q.value.max_tokens=Ie.kimi.max_tokens||4096),Se||(q.value.timeout=Ie.kimi.timeout??q.value.timeout)),Ie.auxiliary&&(b.value=Ie.auxiliary,K.pending()||(m.value.enabled=Ie.auxiliary.enabled,m.value.model=Ie.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function mt(){const j=++y;C.value=!0,v.value="";try{const Se=await W.get("/api/context/windows");if(j!==y)return;_.value=Se,!P.value&&!T.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(Se.models||{}).filter(([,Ie])=>Ie.override!=null).map(([Ie,Xt])=>[Ie,Xt.override])),a.value.context_utilization=Se.utilization??a.value.context_utilization)}catch(Se){j===y&&(v.value=Se.message||"Failed to load context budgets")}finally{j===y&&(C.value=!1)}}async function qe(){try{if(Q.value=await W.get("/api/ollama/status"),oe.value=!1,Q.value.model&&(ye.value=Q.value.model),Q.value.configured)try{const j=await W.get("/api/ollama/models");Z.value=j.models||[]}catch{Z.value=[]}else if(N.value.base_url)try{const j=await W.post("/api/ollama/probe-models",{base_url:N.value.base_url});Z.value=j.models||[]}catch{Z.value=[]}}catch{oe.value=!0}}async function ot(){O.value=!0,$.value="";try{ie.value=await W.get("/api/codex/status")}catch(j){$.value=j.message||"Failed to fetch Codex status"}finally{O.value=!1}}async function zs(){const j=t.value?t.value.active_provider:"codex";te.value=!0;try{const Se=await W.post("/api/llm/switch",{provider:n.value});Se.error?(n.value=j,de(Se.error,"error")):(de("Switched to "+n.value+" ("+Se.model+")"),await Ee())}catch(Se){n.value=j,de(Se.message||"Switch failed","error")}finally{te.value=!1}}async function Ss(){X.value=!0;try{const j=await W.post("/api/ollama/reload");de(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await Ee()}catch(j){de(j.message||"Reload failed","error")}finally{X.value=!1}}async function Ns(){H.value=!0;try{await W.post("/api/ollama/model",{model:ye.value}),de("Model set to "+ye.value),await Ee()}catch(j){de(j.message||"Failed","error")}finally{H.value=!1}}async function Ft(){const j=N.value.base_url;if(!j){de("Enter a base URL first","error");return}B.value=!0;try{const Se=await W.post("/api/ollama/probe-models",{base_url:j});Z.value=Se.models||[],Z.value.length?(de(Z.value.length+" model(s) found"),!N.value.model&&Z.value.length&&(N.value.model=Z.value[0].name)):de("No models found at "+j,"error")}catch(Se){de(Se.message||"Could not reach Ollama","error")}finally{B.value=!1}}async function jt(){try{if(re.value=await W.get("/api/kimi/status"),ce.value=!1,re.value.model&&(we.value=re.value.model),re.value.configured)try{const j=await W.get("/api/kimi/models");Ce.value=j.models||[]}catch{Ce.value=[]}}catch{ce.value=!0}}async function nn(){Be.value=!0;try{const j=await W.post("/api/kimi/reload");de(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await Ee()}catch(j){de(j.message||"Reload failed","error")}finally{Be.value=!1}}async function js(){k.value=!0;try{await W.post("/api/kimi/model",{model:we.value}),de("Model set to "+we.value),await Ee()}catch(j){de(j.message||"Failed","error")}finally{k.value=!1}}async function Vs(){if(P.value){Je();return}P.value=!0;const j=zu(a.value);try{await W.put("/api/llm/codex/config",j),de("Codex config saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ot()])}catch(Se){de(Se.message||"Failed","error");const Ie=JSON.stringify(zu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:Ie,preserveAdvanced:!0}),ot()])}finally{P.value=!1}}async function qs(){if(P.value)return;P.value=!0;const j=ju(a.value);try{await W.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(T.value=!1),de("Codex advanced settings saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),ot(),mt()])}catch(Se){de(Se.message||"Failed","error");const Ie=JSON.stringify(ju(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:Ie}),ot(),mt()])}finally{P.value=!1}}async function Ms(){if(M.value){he();return}M.value=!0;try{const j=ae.value?N.value.api_key:null,Se=_k(N.value,{includeApiKey:j!==null});await W.put("/api/llm/ollama/config",Se),de("Ollama config saved"),j!==null&&N.value.api_key===j&&(N.value.api_key="",ae.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),qe()])}catch(j){de(j.message||"Failed","error")}finally{M.value=!1}}async function Rn(){if(!M.value){M.value=!0;try{await W.put("/api/llm/ollama/config",wk(N.value)),de("Ollama timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),qe()])}catch(j){de(j.message||"Failed","error")}finally{M.value=!1}}}async function vt(){if(V.value){Ne();return}V.value=!0;try{const j=U.value?q.value.api_key:null,Se=kk(q.value,{includeApiKey:j!==null});await W.put("/api/llm/kimi/config",Se),de("Kimi config saved"),j!==null&&q.value.api_key===j&&(q.value.api_key="",U.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),jt()])}catch(j){de(j.message||"Failed","error")}finally{V.value=!1}}async function Ps(){if(!V.value){V.value=!0;try{await W.put("/api/llm/kimi/config",Sk(q.value)),de("Kimi timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),jt()])}catch(j){de(j.message||"Failed","error")}finally{V.value=!1}}}async function qn(){if(S.value){K();return}S.value=!0;try{await W.put("/api/llm/auxiliary/config",m.value),de("Auxiliary config saved"),await Ue()}catch(j){de(j.message||"Failed","error"),await Ue()}finally{S.value=!1}}const Je=Tl(Vs),K=Tl(qn),he=Tl(Ms),Ne=Tl(vt),We=()=>(Je.cancel(),Vs()),ct=()=>(he.cancel(),Ms()),It=()=>(Ne.cancel(),vt()),Gn=()=>qs(),Qt=()=>Rn(),wa=()=>Ps();async function Ds(j){const Se=j.account_key+":"+j.model;w.value=Se;try{const Ie=await W.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});de(Ie.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await mt()}catch(Ie){de(Ie.message||"Failed to clear clamp","error"),await mt()}finally{w.value=null}}async function oi(j){try{await W.post("/api/codex/account/"+j+"/activate"),de("Active account switched"),await ot()}catch(Se){de(Se.message||"Failed","error")}}async function ka(j){ee.value=j;try{await W.post("/api/codex/account/"+j+"/refresh"),de("Token refreshed"),await ot()}catch(Se){de(Se.message||"Refresh failed","error")}finally{ee.value=null}}function Kn(j,Se){ne.value=j,fe.value=Se||""}async function Sa(j){try{await W.put("/api/codex/account/"+j+"/label",{label:fe.value}),de("Label updated"),ne.value=null,await ot()}catch(Se){de(Se.message||"Failed","error")}}async function Wn(j,Se){if(await Jt({title:"Delete Codex account",message:`Delete ${Se||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+j),de("Deleted. Pool reloaded."),await ot()}catch(Xt){de(Xt.message||"Failed","error")}}async function In(){pe.value=!0;try{const j=await W.post("/api/codex/device-code");le.value=j,ue.value="pending",ms(j)}catch(j){de(j.message||"Failed","error")}finally{pe.value=!1}}async function ms(j){xe={cancelled:!1};const Se=xe;try{const Ie=await W.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(Se.cancelled)return;ke.value=Ie,ue.value="success",await Ee()}catch(Ie){if(Se.cancelled)return;be.value=Ie.message||"Device login failed",ue.value="error"}}function an(){xe&&(xe.cancelled=!0),ue.value=null,le.value=null}return Ke(Ee),_t(()=>{xe&&(xe.cancelled=!0),Je.cancel(),K.cancel(),he.cancel(),Ne.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:te,advancedOpen:g,codexForm:a,codexModelOptions:l,codexAgentModelOptions:r,mainMaxAllowed:c,agentMaxAllowed:d,mainModelOptionDisabled:p,agentModelOptionDisabled:f,auxForm:m,auxData:b,auxModelOptions:E,onAuxModelChange:R,savingAux:S,saveAuxConfigDebounced:K,ollamaForm:N,kimiForm:q,savingCodex:P,savingOllama:M,savingKimi:V,probingOllama:B,ollamaKeyDirty:ae,kimiKeyDirty:U,fetchCodexStatus:ot,ollamaStatus:Q,ollamaStatusLoadFailed:oe,ollamaModels:Z,ollamaSelectedModel:ye,reloading:X,settingModel:H,kimiStatus:re,kimiStatusLoadFailed:ce,kimiModels:Ce,kimiSelectedModel:we,reloadingKimi:Be,settingKimiModel:k,codexLoading:O,codexError:$,codexData:ie,refreshing:ee,editingLabel:ne,labelValue:fe,contextWindows:_,contextWindowsLoading:C,contextWindowsError:v,contextBudgetRows:I,activeClampRows:F,activeContextBudget:D,clearingClamp:w,contextPolicyDirty:T,deviceState:ue,deviceLoading:pe,deviceInfo:le,deviceResult:ke,deviceError:be,fetchAll:Ee,fetchLLMStatus:Ue,fetchOllamaStatus:qe,fetchKimiStatus:jt,switchProvider:zs,reloadOllama:Ss,setOllamaModel:Ns,reloadKimi:nn,setKimiModel:js,probeOllamaModels:Ft,saveCodexConfig:Vs,saveOllamaConfig:Ms,saveKimiConfig:vt,saveCodexAdvancedConfig:qs,saveOllamaAdvancedConfig:Rn,saveKimiAdvancedConfig:Ps,saveCodexConfigDebounced:Je,saveOllamaConfigDebounced:he,saveKimiConfigDebounced:Ne,saveCodexConfigNow:We,saveOllamaConfigNow:ct,saveKimiConfigNow:It,saveCodexAdvancedConfigNow:Gn,saveOllamaAdvancedConfigNow:Qt,saveKimiAdvancedConfigNow:wa,activateAccount:oi,refreshAccount:ka,startEditLabel:Kn,saveLabel:Sa,deleteAccount:Wn,startDeviceLogin:In,cancelDeviceLogin:an,formatSize:z,fetchContextWindows:mt,clearContextClamp:Ds,setContextOverride:Mt,setContextUtilization:se,resetContextOverride:_e,overrideAboveFloor:at,formatCount:me,formatContextCeiling:Te,formatExpiry:Le,shortAccountKey:Me,provenanceClass:rt}}},Vu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Ck(e){return Vu[e]||Vu[(e||"").toLowerCase()]||"text-gray-400"}const Ek={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=J(()=>{var v;return Object.values(((v=i.value)==null?void 0:v.totals)||{}).reduce((w,T)=>w+Number(T||0),0)}),u=h(""),p=h(0),f=h([]),m=J(()=>f.value.map(v=>`${v.label} (${v.path}${v.reason?`: ${v.reason}`:""})`).join("; ")),b=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function R(){var I;const v=await Promise.allSettled(b.map(F=>W.get(F.path))),w=F=>v[F].status==="fulfilled"?v[F].value:null;t.value=w(0)||{};const T=w(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=w(2)||{},a.value=w(3)||{},i.value=w(4),l.value=w(5),r.value=w(6),o.value=w(7),c.value=w(8);const y=v.filter(F=>F.status==="rejected");if(f.value=v.flatMap((F,D)=>{var N;return F.status==="rejected"?[{...b[D],reason:((N=F.reason)==null?void 0:N.message)||"request failed"}]:[]}),p.value=f.value.length,y.length===v.length){const F=(I=y[0])==null?void 0:I.reason;u.value=(F==null?void 0:F.message)||"Failed to load internals"}else u.value="";e.value=!1}function S(){e.value=!0,u.value="",R()}let g=!1;function _(){g||(g=!0,R(),E||(E=setInterval(R,3e4)))}function C(){g&&(g=!1,E&&(clearInterval(E),E=null))}return Ke(_),_s(_),ws(C),_t(C),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:b,retry:S,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Ck,formatAgeSeconds:aw}}},Ak={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await Jt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Ke(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Pm=[{id:"health",label:"Health",component:Ww},{id:"resources",label:"Resources",component:Zw},{id:"logs",label:"Logs",component:Xw},{id:"config",label:"Config",component:uk},{id:"discord",label:"Discord",component:fk},{id:"host-access",label:"Host Access",component:mk},{id:"api-tokens",label:"API Tokens",component:vk},{id:"llm",label:"LLM Config",component:Tk},{id:"internals",label:"Internals",component:Ek},{id:"update",label:"Update",component:Ak}],Rk={components:{TabbedPage:$r},setup(){return{tabs:Pm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Cl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Ik=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Cl("Operations","operations","/operations",Cm),...Cl("History","history","/history",Em),...Cl("Capabilities","capabilities","/capabilities",Am),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Cl("System","system","/system",Pm)],ds=jn({open:!1,query:"",selected:0});function qu(){ds.query="",ds.selected=0,ds.open=!0}function uo(){ds.open=!1}function Ok(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Lk={setup(){const e=bm(),t=h(null),s=J(()=>{const i=ds.query.trim().toLowerCase();return Ik.map(l=>({...l,_score:Ok(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});is(()=>ds.open,async i=>{var l;i&&(await Ct(),(l=t.value)==null||l.focus())}),is(()=>ds.query,()=>{ds.selected=0});function n(i){uo(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),uo();return}if(i.key==="ArrowDown")i.preventDefault(),ds.selected=Math.min(ds.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ds.selected=Math.max(ds.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ds.selected];l&&n(l)}}return{state:ds,results:s,inputEl:t,go:n,onKeydown:a,closePalette:uo}},template:`
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
  `},Ko={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ko));const Nk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Za("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Za("path",{d:Ko[e.name]||Ko.info})])}},Mk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Gu(e){return[...e.querySelectorAll(Mk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Pk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Gu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Gu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Dk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h(!1),o=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=J(()=>{const B=e.value.uptime_seconds||0,te=Math.floor(B/86400),Q=Math.floor(B%86400/3600),oe=Math.floor(B%3600/60),Z=[];return te>0&&Z.push(`${te}d`),Q>0&&Z.push(`${Q}h`),(Z.length===0||te===0&&Q===0)&&Z.push(`${oe}m`),Z.join(" ")}),m=J(()=>{const B=e.value.uptime_seconds||0;return 125.66*(1-Math.min(B/86400,1))}),b=J(()=>{const B=e.value;return[{label:"Guilds",value:B.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:B.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:B.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${B.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:B.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:B.loop_count>0?"text-green-400":"",highlight:B.loop_count>0},{label:"Agents",value:B.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:B.agent_count>0?`${B.agent_count} total`:"",subColor:"text-gray-500",highlight:(B.agent_running??0)>0},{label:"Processes",value:B.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:B.process_count>0?`${B.process_count} total`:"",subColor:"text-gray-500",highlight:(B.process_running??0)>0},{label:"Schedules",value:B.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(B.schedule_failing>0?`${B.schedule_failing} failing`:"")+(B.schedule_failing>0&&B.schedule_paused>0?", ":"")+(B.schedule_paused>0?`${B.schedule_paused} paused`:"")||void 0,subColor:B.schedule_failing>0?"text-red-400":"text-yellow-400",color:B.schedule_failing>0?"text-red-400":"",highlight:B.schedule_failing>0},{label:"Users",value:B.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),E=J(()=>{const B=e.value,te=[];return te.push({label:"Bot",status:B.status==="online"?"ok":"warn",detail:B.status==="online"?"Online":"Starting"}),(B.schedule_failing||0)>0?te.push({label:"Schedules",status:"error",detail:`${B.schedule_failing} failing`}):(B.schedule_count||0)>0&&te.push({label:"Schedules",status:"ok",detail:`${B.schedule_count} configured`}),(B.loop_count||0)>0&&te.push({label:"Loops",status:"ok",detail:`${B.loop_count} active`}),(B.agent_running||0)>0&&te.push({label:"Agents",status:"ok",detail:`${B.agent_running} running`}),(B.process_running||0)>0&&te.push({label:"Processes",status:"ok",detail:`${B.process_running} running`}),te});async function R(){try{e.value=await W.get("/api/status"),s.value=null}catch(B){s.value=B.message}finally{t.value=!1}}let S=0,g=0,_=0,C=0;function v(B,te){const Q=new Set;return[...te,...B].filter(oe=>{const Z=oe._hmac||JSON.stringify([oe.timestamp,oe.tool_name,oe.user_id,oe.result_summary,oe.error]);return Q.has(Z)?!1:(Q.add(Z),!0)})}async function w(){const B=++S,te=_;a.value=!0;try{const Q=await W.get("/api/audit?limit=10");if(B!==S)return;const oe=te===_?[]:n.value.filter(Z=>(Z._liveEpoch||0)>te);n.value=v(Q,oe).slice(0,10),c.value=oe.length}catch{}B===S&&(a.value=!1)}async function T(){const B=++g,te=C;l.value=!0;try{const Q=await W.get("/api/audit?error_only=1&limit=5");if(B!==g)return;const oe=te===C?[]:i.value.filter(Z=>(Z._liveErrorEpoch||0)>te);i.value=v(Q,oe).slice(0,5),r.value=!1}catch{if(B!==g)return;r.value=te===C||i.value.length===0}B===g&&(l.value=!1)}async function y(){try{const B=await W.get("/api/knowledge");d.value=(Array.isArray(B)?B:[]).reduce((te,Q)=>te+(Q.chunks||0),0)}catch{d.value=null}}async function I(){try{const B=await W.get("/api/agents");o.value=B.filter(te=>te.status==="running")}catch{}}async function F(){u.value={...u.value,reload:!0};try{await W.post("/api/reload"),Oe.success("Config reloaded")}catch(B){Oe.error(B.message)}u.value={...u.value,reload:!1}}async function D(){if(!await Jt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const te=e.value.session_count;e.value={...e.value,session_count:0};try{const Q=await W.post("/api/sessions/clear-all");Oe.success(`Cleared ${Q.count} session${Q.count!==1?"s":""}`),await R()}catch(Q){e.value={...e.value,session_count:te},Oe.error(Q.message)}u.value={...u.value,clearSessions:!1}}async function N(){if(!await Jt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const te=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Q=await W.post("/api/loops/stop-all");Oe.success(Q.result),await R()}catch(Q){e.value={...e.value,loop_count:te},Oe.error(Q.message)}u.value={...u.value,stopLoops:!1}}function q(){t.value=!0,s.value=null,R(),w(),T(),I()}let ae=null,U=null,P=null;function M(B){if(B.payload&&B.payload.tool_name){_+=1;const te={...B.payload,_isNew:!0,_key:++p,_liveEpoch:_};n.value.unshift(te),n.value.length>10&&n.value.pop(),c.value++,te.error&&(C+=1,te._liveErrorEpoch=C,r.value=!1,i.value.unshift(te),i.value.length>5&&i.value.pop()),setTimeout(()=>{te._isNew=!1},1500),clearTimeout(P),P=setTimeout(()=>{c.value=0},1e4)}}let V=null;return Ke(async()=>{await Promise.all([R(),w(),T(),I(),y()]),ae=setInterval(R,15e3),U=setInterval(I,1e4),Ye.subscribe("events",M),V=Ye.onReconnected(()=>{w(),T()})}),_t(()=>{ae&&clearInterval(ae),U&&clearInterval(U),clearTimeout(P),Ye.unsubscribe("events",M),V&&(V(),V=null)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:b,healthIndicators:E,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:r,agents:o,actionLoading:u,fetchActivity:w,fetchErrors:T,fetchStatus:R,onEvent:M,formatTime:ym,formatDuration:ai,retry:q,reloadConfig:F,clearSessions:D,stopAllLoops:N}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ku(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Fk(e){if(Array.isArray(e))return e}function $k(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function Bk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Uk(e,t){return Fk(e)||$k(e,t)||Hk(e,t)||Bk()}function Hk(e,t){if(e){if(typeof e=="string")return Ku(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ku(e,t):void 0}}const Dm=Object.entries,Wu=Object.setPrototypeOf,zk=Object.isFrozen,jk=Object.getPrototypeOf,Vk=Object.getOwnPropertyDescriptor;let rs=Object.freeze,Ls=Object.seal,Ma=Object.create,Fm=typeof Reflect<"u"&&Reflect,Wo=Fm.apply,Zo=Fm.construct;rs||(rs=function(t){return t});Ls||(Ls=function(t){return t});Wo||(Wo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Zo||(Zo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const cn=Rt(Array.prototype.forEach),qk=Rt(Array.prototype.lastIndexOf),Zu=Rt(Array.prototype.pop),Ra=Rt(Array.prototype.push),Gk=Rt(Array.prototype.splice),ts=Array.isArray,Si=Rt(String.prototype.toLowerCase),po=Rt(String.prototype.toString),Ju=Rt(String.prototype.match),Ia=Rt(String.prototype.replace),Yu=Rt(String.prototype.indexOf),Kk=Rt(String.prototype.trim),Wk=Rt(Number.prototype.toString),Zk=Rt(Boolean.prototype.toString),Qu=typeof BigInt>"u"?null:Rt(BigInt.prototype.toString),Xu=typeof Symbol>"u"?null:Rt(Symbol.prototype.toString),bt=Rt(Object.prototype.hasOwnProperty),gi=Rt(Object.prototype.toString),$t=Rt(RegExp.prototype.test),ea=Jk(TypeError);function Rt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Wo(e,t,n)}}function Jk(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Zo(e,s)}}function ze(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Si;if(Wu&&Wu(e,null),!ts(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(zk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Yk(e){for(let t=0;t<e.length;t++)bt(e,t)||(e[t]=null);return e}function qt(e){const t=Ma(null);for(const n of Dm(e)){var s=Uk(n,2);const a=s[0],i=s[1];bt(e,a)&&(ts(i)?t[a]=Yk(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=qt(i):t[a]=i)}return t}function Qk(e){switch(typeof e){case"string":return e;case"number":return Wk(e);case"boolean":return Zk(e);case"bigint":return Qu?Qu(e):"0";case"symbol":return Xu?Xu(e):"Symbol()";case"undefined":return gi(e);case"function":case"object":{if(e===null)return gi(e);const t=e,s=Zs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:gi(n)}return gi(e)}default:return gi(e)}}function Zs(e,t){for(;e!==null;){const n=Vk(e,t);if(n){if(n.get)return Rt(n.get);if(typeof n.value=="function")return Rt(n.value)}e=jk(e)}function s(){return null}return s}function Xk(e){try{return $t(e,""),!0}catch{return!1}}const ep=rs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),fo=rs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),ho=rs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),eS=rs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),mo=rs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tS=rs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),tp=rs(["#text"]),sp=rs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),vo=rs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),np=rs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),El=rs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sS=Ls(/{{[\w\W]*|^[\w\W]*}}/g),nS=Ls(/<%[\w\W]*|^[\w\W]*%>/g),aS=Ls(/\${[\w\W]*/g),iS=Ls(/^data-[\-\w.\u00B7-\uFFFF]+$/),lS=Ls(/^aria-[\-\w]+$/),ap=Ls(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),rS=Ls(/^(?:\w+script|data):/i),oS=Ls(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),cS=Ls(/^html$/i),dS=Ls(/^[a-z][.\w]*(-[.\w]+)+$/i),Ks={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},uS=function(){return typeof window>"u"?null:window},pS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ip=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function $m(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:uS();const t=Ae=>$m(Ae);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ks.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,f=Zs(p,"cloneNode"),m=Zs(p,"remove"),b=Zs(p,"nextSibling"),E=Zs(p,"childNodes"),R=Zs(p,"parentNode"),S=Zs(p,"shadowRoot"),g=Zs(p,"attributes"),_=l&&l.prototype?Zs(l.prototype,"nodeType"):null,C=l&&l.prototype?Zs(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ae=s.createElement("template");Ae.content&&Ae.content.ownerDocument&&(s=Ae.content.ownerDocument)}let v,w="",T,y=!1,I=0;const F=function(){if(I>0)throw ea('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},D=function(A){F(),I++;try{return v.createHTML(A)}finally{I--}},N=function(A){F(),I++;try{return v.createScriptURL(A)}finally{I--}},q=function(){return y||(T=pS(u,a),y=!0),T},ae=s,U=ae.implementation,P=ae.createNodeIterator,M=ae.createDocumentFragment,V=ae.getElementsByTagName,B=n.importNode;let te=ip();t.isSupported=typeof Dm=="function"&&typeof R=="function"&&U&&U.createHTMLDocument!==void 0;const Q=sS,oe=nS,Z=aS,ye=iS,X=lS,H=rS,re=oS,ce=dS;let Ce=ap,we=null;const Be=ze({},[...ep,...fo,...ho,...mo,...tp]);let k=null;const O=ze({},[...sp,...vo,...np,...El]);let $=Object.seal(Ma(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ie=null,ee=null;const ne=Object.seal(Ma(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let fe=!0,ue=!0,pe=!1,le=!0,ke=!1,be=!0,xe=!1,de=!1,z=!1,me=!1,Te=!1,Le=!1,Me=!0,rt=!1;const at="user-content-";let Mt=!0,se=!1,_e={},Ee=null;const Ue=ze({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let mt=null;const qe=ze({},["audio","video","img","source","image","track"]);let ot=null;const zs=ze({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ss="http://www.w3.org/1998/Math/MathML",Ns="http://www.w3.org/2000/svg",Ft="http://www.w3.org/1999/xhtml";let jt=Ft,nn=!1,js=null;const Vs=ze({},[Ss,Ns,Ft],po);let qs=ze({},["mi","mo","mn","ms","mtext"]),Ms=ze({},["annotation-xml"]);const Rn=ze({},["title","style","font","a","script"]);let vt=null;const Ps=["application/xhtml+xml","text/html"],qn="text/html";let Je=null,K=null;const he=s.createElement("form"),Ne=function(A){return A instanceof RegExp||A instanceof Function},We=function(){let A=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(K&&K===A)return;(!A||typeof A!="object")&&(A={}),A=qt(A),vt=Ps.indexOf(A.PARSER_MEDIA_TYPE)===-1?qn:A.PARSER_MEDIA_TYPE,Je=vt==="application/xhtml+xml"?po:Si,we=bt(A,"ALLOWED_TAGS")&&ts(A.ALLOWED_TAGS)?ze({},A.ALLOWED_TAGS,Je):Be,k=bt(A,"ALLOWED_ATTR")&&ts(A.ALLOWED_ATTR)?ze({},A.ALLOWED_ATTR,Je):O,js=bt(A,"ALLOWED_NAMESPACES")&&ts(A.ALLOWED_NAMESPACES)?ze({},A.ALLOWED_NAMESPACES,po):Vs,ot=bt(A,"ADD_URI_SAFE_ATTR")&&ts(A.ADD_URI_SAFE_ATTR)?ze(qt(zs),A.ADD_URI_SAFE_ATTR,Je):zs,mt=bt(A,"ADD_DATA_URI_TAGS")&&ts(A.ADD_DATA_URI_TAGS)?ze(qt(qe),A.ADD_DATA_URI_TAGS,Je):qe,Ee=bt(A,"FORBID_CONTENTS")&&ts(A.FORBID_CONTENTS)?ze({},A.FORBID_CONTENTS,Je):Ue,ie=bt(A,"FORBID_TAGS")&&ts(A.FORBID_TAGS)?ze({},A.FORBID_TAGS,Je):qt({}),ee=bt(A,"FORBID_ATTR")&&ts(A.FORBID_ATTR)?ze({},A.FORBID_ATTR,Je):qt({}),_e=bt(A,"USE_PROFILES")?A.USE_PROFILES&&typeof A.USE_PROFILES=="object"?qt(A.USE_PROFILES):A.USE_PROFILES:!1,fe=A.ALLOW_ARIA_ATTR!==!1,ue=A.ALLOW_DATA_ATTR!==!1,pe=A.ALLOW_UNKNOWN_PROTOCOLS||!1,le=A.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ke=A.SAFE_FOR_TEMPLATES||!1,be=A.SAFE_FOR_XML!==!1,xe=A.WHOLE_DOCUMENT||!1,me=A.RETURN_DOM||!1,Te=A.RETURN_DOM_FRAGMENT||!1,Le=A.RETURN_TRUSTED_TYPE||!1,z=A.FORCE_BODY||!1,Me=A.SANITIZE_DOM!==!1,rt=A.SANITIZE_NAMED_PROPS||!1,Mt=A.KEEP_CONTENT!==!1,se=A.IN_PLACE||!1,Ce=Xk(A.ALLOWED_URI_REGEXP)?A.ALLOWED_URI_REGEXP:ap,jt=typeof A.NAMESPACE=="string"?A.NAMESPACE:Ft,qs=bt(A,"MATHML_TEXT_INTEGRATION_POINTS")&&A.MATHML_TEXT_INTEGRATION_POINTS&&typeof A.MATHML_TEXT_INTEGRATION_POINTS=="object"?qt(A.MATHML_TEXT_INTEGRATION_POINTS):ze({},["mi","mo","mn","ms","mtext"]),Ms=bt(A,"HTML_INTEGRATION_POINTS")&&A.HTML_INTEGRATION_POINTS&&typeof A.HTML_INTEGRATION_POINTS=="object"?qt(A.HTML_INTEGRATION_POINTS):ze({},["annotation-xml"]);const Y=bt(A,"CUSTOM_ELEMENT_HANDLING")&&A.CUSTOM_ELEMENT_HANDLING&&typeof A.CUSTOM_ELEMENT_HANDLING=="object"?qt(A.CUSTOM_ELEMENT_HANDLING):Ma(null);if($=Ma(null),bt(Y,"tagNameCheck")&&Ne(Y.tagNameCheck)&&($.tagNameCheck=Y.tagNameCheck),bt(Y,"attributeNameCheck")&&Ne(Y.attributeNameCheck)&&($.attributeNameCheck=Y.attributeNameCheck),bt(Y,"allowCustomizedBuiltInElements")&&typeof Y.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=Y.allowCustomizedBuiltInElements),ke&&(ue=!1),Te&&(me=!0),_e&&(we=ze({},tp),k=Ma(null),_e.html===!0&&(ze(we,ep),ze(k,sp)),_e.svg===!0&&(ze(we,fo),ze(k,vo),ze(k,El)),_e.svgFilters===!0&&(ze(we,ho),ze(k,vo),ze(k,El)),_e.mathMl===!0&&(ze(we,mo),ze(k,np),ze(k,El))),ne.tagCheck=null,ne.attributeCheck=null,bt(A,"ADD_TAGS")&&(typeof A.ADD_TAGS=="function"?ne.tagCheck=A.ADD_TAGS:ts(A.ADD_TAGS)&&(we===Be&&(we=qt(we)),ze(we,A.ADD_TAGS,Je))),bt(A,"ADD_ATTR")&&(typeof A.ADD_ATTR=="function"?ne.attributeCheck=A.ADD_ATTR:ts(A.ADD_ATTR)&&(k===O&&(k=qt(k)),ze(k,A.ADD_ATTR,Je))),bt(A,"ADD_URI_SAFE_ATTR")&&ts(A.ADD_URI_SAFE_ATTR)&&ze(ot,A.ADD_URI_SAFE_ATTR,Je),bt(A,"FORBID_CONTENTS")&&ts(A.FORBID_CONTENTS)&&(Ee===Ue&&(Ee=qt(Ee)),ze(Ee,A.FORBID_CONTENTS,Je)),bt(A,"ADD_FORBID_CONTENTS")&&ts(A.ADD_FORBID_CONTENTS)&&(Ee===Ue&&(Ee=qt(Ee)),ze(Ee,A.ADD_FORBID_CONTENTS,Je)),Mt&&(we["#text"]=!0),xe&&ze(we,["html","head","body"]),we.table&&(ze(we,["tbody"]),delete ie.tbody),A.TRUSTED_TYPES_POLICY){if(typeof A.TRUSTED_TYPES_POLICY.createHTML!="function")throw ea('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof A.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ea('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ge=v;v=A.TRUSTED_TYPES_POLICY;try{w=D("")}catch(Pe){throw v=ge,Pe}}else A.TRUSTED_TYPES_POLICY===null?(v=void 0,w=""):(v===void 0&&(v=q()),v&&typeof w=="string"&&(w=D("")));(te.uponSanitizeElement.length>0||te.uponSanitizeAttribute.length>0)&&we===Be&&(we=qt(we)),te.uponSanitizeAttribute.length>0&&k===O&&(k=qt(k)),rs&&rs(A),K=A},ct=ze({},[...fo,...ho,...eS]),It=ze({},[...mo,...tS]),Gn=function(A){let Y=R(A);(!Y||!Y.tagName)&&(Y={namespaceURI:jt,tagName:"template"});const ge=Si(A.tagName),Pe=Si(Y.tagName);return js[A.namespaceURI]?A.namespaceURI===Ns?Y.namespaceURI===Ft?ge==="svg":Y.namespaceURI===Ss?ge==="svg"&&(Pe==="annotation-xml"||qs[Pe]):!!ct[ge]:A.namespaceURI===Ss?Y.namespaceURI===Ft?ge==="math":Y.namespaceURI===Ns?ge==="math"&&Ms[Pe]:!!It[ge]:A.namespaceURI===Ft?Y.namespaceURI===Ns&&!Ms[Pe]||Y.namespaceURI===Ss&&!qs[Pe]?!1:!It[ge]&&(Rn[ge]||!ct[ge]):!!(vt==="application/xhtml+xml"&&js[A.namespaceURI]):!1},Qt=function(A){Ra(t.removed,{element:A});try{R(A).removeChild(A)}catch{if(m(A),!R(A))throw ea("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},wa=function(A){const Y=E?E(A):A.childNodes;if(Y){const Pe=[];cn(Y,x=>{Ra(Pe,x)}),cn(Pe,x=>{try{m(x)}catch{}})}const ge=g?g(A):null;if(ge)for(let Pe=ge.length-1;Pe>=0;--Pe){const x=ge[Pe],L=x&&x.name;if(typeof L=="string")try{A.removeAttribute(L)}catch{}}},Ds=function(A,Y){try{Ra(t.removed,{attribute:Y.getAttributeNode(A),from:Y})}catch{Ra(t.removed,{attribute:null,from:Y})}if(Y.removeAttribute(A),A==="is")if(me||Te)try{Qt(Y)}catch{}else try{Y.setAttribute(A,"")}catch{}},oi=function(A){const Y=g?g(A):A.attributes;if(Y)for(let ge=Y.length-1;ge>=0;--ge){const Pe=Y[ge],x=Pe&&Pe.name;if(!(typeof x!="string"||k[Je(x)]))try{A.removeAttribute(x)}catch{}}},ka=function(A){const Y=[A];for(;Y.length>0;){const ge=Y.pop();(_?_(ge):ge.nodeType)===Ks.element&&oi(ge);const x=E?E(ge):ge.childNodes;if(x)for(let L=x.length-1;L>=0;--L)Y.push(x[L])}},Kn=function(A){let Y=null,ge=null;if(z)A="<remove></remove>"+A;else{const L=Ju(A,/^[\r\n\t ]+/);ge=L&&L[0]}vt==="application/xhtml+xml"&&jt===Ft&&(A='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+A+"</body></html>");const Pe=v?D(A):A;if(jt===Ft)try{Y=new d().parseFromString(Pe,vt)}catch{}if(!Y||!Y.documentElement){Y=U.createDocument(jt,"template",null);try{Y.documentElement.innerHTML=nn?w:Pe}catch{}}const x=Y.body||Y.documentElement;return A&&ge&&x.insertBefore(s.createTextNode(ge),x.childNodes[0]||null),jt===Ft?V.call(Y,xe?"html":"body")[0]:xe?Y.documentElement:x},Sa=function(A){return P.call(A.ownerDocument||A,A,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Wn=function(A){var Y,ge;A.normalize();const Pe=P.call(A.ownerDocument||A,A,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let x=Pe.nextNode();for(;x;){let G=x.data;cn([Q,oe,Z],ve=>{G=Ia(G,ve," ")}),x.data=G,x=Pe.nextNode()}const L=(Y=(ge=A.querySelectorAll)===null||ge===void 0?void 0:ge.call(A,"template"))!==null&&Y!==void 0?Y:[];cn(Array.from(L),G=>{ms(G.content)&&Wn(G.content)})},In=function(A){const Y=C?C(A):null;return typeof Y!="string"||Je(Y)!=="form"?!1:typeof A.nodeName!="string"||typeof A.textContent!="string"||typeof A.removeChild!="function"||A.attributes!==g(A)||typeof A.removeAttribute!="function"||typeof A.setAttribute!="function"||typeof A.namespaceURI!="string"||typeof A.insertBefore!="function"||typeof A.hasChildNodes!="function"||A.nodeType!==_(A)||A.childNodes!==E(A)},ms=function(A){if(!_||typeof A!="object"||A===null)return!1;try{return _(A)===Ks.documentFragment}catch{return!1}},an=function(A){if(!_||typeof A!="object"||A===null)return!1;try{return typeof _(A)=="number"}catch{return!1}};function j(Ae,A,Y){cn(Ae,ge=>{ge.call(t,A,Y,K)})}const Se=function(A){let Y=null;if(j(te.beforeSanitizeElements,A,null),In(A))return Qt(A),!0;const ge=Je(C?C(A):A.nodeName);if(j(te.uponSanitizeElement,A,{tagName:ge,allowedTags:we}),be&&A.hasChildNodes()&&!an(A.firstElementChild)&&$t(/<[/\w!]/g,A.innerHTML)&&$t(/<[/\w!]/g,A.textContent)||be&&A.namespaceURI===Ft&&ge==="style"&&an(A.firstElementChild)||A.nodeType===Ks.progressingInstruction||be&&A.nodeType===Ks.comment&&$t(/<[/\w]/g,A.data))return Qt(A),!0;if(ie[ge]||!(ne.tagCheck instanceof Function&&ne.tagCheck(ge))&&!we[ge]){if(!ie[ge]&&Zn(ge)&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,ge)||$.tagNameCheck instanceof Function&&$.tagNameCheck(ge)))return!1;if(Mt&&!Ee[ge]){const x=R(A),L=E(A);if(L&&x){const G=L.length;for(let ve=G-1;ve>=0;--ve){const De=se?L[ve]:f(L[ve],!0);x.insertBefore(De,b(A))}}}return Qt(A),!0}return(_?_(A):A.nodeType)===Ks.element&&!Gn(A)||(ge==="noscript"||ge==="noembed"||ge==="noframes")&&$t(/<\/no(script|embed|frames)/i,A.innerHTML)?(Qt(A),!0):(ke&&A.nodeType===Ks.text&&(Y=A.textContent,cn([Q,oe,Z],x=>{Y=Ia(Y,x," ")}),A.textContent!==Y&&(Ra(t.removed,{element:A.cloneNode()}),A.textContent=Y)),j(te.afterSanitizeElements,A,null),!1)},Ie=function(A,Y,ge){if(ee[Y]||Me&&(Y==="id"||Y==="name")&&(ge in s||ge in he))return!1;const Pe=k[Y]||ne.attributeCheck instanceof Function&&ne.attributeCheck(Y,A);if(!(ue&&!ee[Y]&&$t(ye,Y))){if(!(fe&&$t(X,Y))){if(!Pe||ee[Y]){if(!(Zn(A)&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,A)||$.tagNameCheck instanceof Function&&$.tagNameCheck(A))&&($.attributeNameCheck instanceof RegExp&&$t($.attributeNameCheck,Y)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(Y,A))||Y==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&$t($.tagNameCheck,ge)||$.tagNameCheck instanceof Function&&$.tagNameCheck(ge))))return!1}else if(!ot[Y]){if(!$t(Ce,Ia(ge,re,""))){if(!((Y==="src"||Y==="xlink:href"||Y==="href")&&A!=="script"&&Yu(ge,"data:")===0&&mt[A])){if(!(pe&&!$t(H,Ia(ge,re,"")))){if(ge)return!1}}}}}}return!0},Xt=ze({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Zn=function(A){return!Xt[Si(A)]&&$t(ce,A)},Jn=function(A){j(te.beforeSanitizeAttributes,A,null);const Y=A.attributes;if(!Y||In(A))return;const ge={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:k,forceKeepAttr:void 0};let Pe=Y.length;for(;Pe--;){const x=Y[Pe],L=x.name,G=x.namespaceURI,ve=x.value,De=Je(L),gt=ve;let it=L==="value"?gt:Kk(gt);if(ge.attrName=De,ge.attrValue=it,ge.keepAttr=!0,ge.forceKeepAttr=void 0,j(te.uponSanitizeAttribute,A,ge),it=ge.attrValue,rt&&(De==="id"||De==="name")&&Yu(it,at)!==0&&(Ds(L,A),it=at+it),be&&$t(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,it)){Ds(L,A);continue}if(De==="attributename"&&Ju(it,"href")){Ds(L,A);continue}if(ge.forceKeepAttr)continue;if(!ge.keepAttr){Ds(L,A);continue}if(!le&&$t(/\/>/i,it)){Ds(L,A);continue}ke&&cn([Q,oe,Z],di=>{it=Ia(it,di," ")});const Gs=Je(A.nodeName);if(!Ie(Gs,De,it)){Ds(L,A);continue}if(v&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!G)switch(u.getAttributeType(Gs,De)){case"TrustedHTML":{it=D(it);break}case"TrustedScriptURL":{it=N(it);break}}if(it!==gt)try{G?A.setAttributeNS(G,L,it):A.setAttribute(L,it),In(A)?Qt(A):Zu(t.removed)}catch{Ds(L,A)}}j(te.afterSanitizeAttributes,A,null)},Yn=function(A){let Y=null;const ge=Sa(A);for(j(te.beforeSanitizeShadowDOM,A,null);Y=ge.nextNode();)if(j(te.uponSanitizeShadowNode,Y,null),Se(Y),Jn(Y),ms(Y.content)&&Yn(Y.content),(_?_(Y):Y.nodeType)===Ks.element){const x=S?S(Y):Y.shadowRoot;ms(x)&&(ci(x),Yn(x))}j(te.afterSanitizeShadowDOM,A,null)},ci=function(A){const Y=[{node:A,shadow:null}];for(;Y.length>0;){const ge=Y.pop();if(ge.shadow){Yn(ge.shadow);continue}const Pe=ge.node,L=(_?_(Pe):Pe.nodeType)===Ks.element,G=E?E(Pe):Pe.childNodes;if(G)for(let ve=G.length-1;ve>=0;--ve)Y.push({node:G[ve],shadow:null});if(L){const ve=C?C(Pe):null;if(typeof ve=="string"&&Je(ve)==="template"){const De=Pe.content;ms(De)&&Y.push({node:De,shadow:null})}}if(L){const ve=S?S(Pe):Pe.shadowRoot;ms(ve)&&Y.push({node:null,shadow:ve},{node:ve,shadow:null})}}};return t.sanitize=function(Ae){let A=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},Y=null,ge=null,Pe=null,x=null;if(nn=!Ae,nn&&(Ae="<!-->"),typeof Ae!="string"&&!an(Ae)&&(Ae=Qk(Ae),typeof Ae!="string"))throw ea("dirty is not a string, aborting");if(!t.isSupported)return Ae;de||We(A),t.removed=[];const L=se&&typeof Ae!="string"&&an(Ae);if(L){const De=C?C(Ae):Ae.nodeName;if(typeof De=="string"){const gt=Je(De);if(!we[gt]||ie[gt])throw ea("root node is forbidden and cannot be sanitized in-place")}if(In(Ae))throw ea("root node is clobbered and cannot be sanitized in-place");try{ci(Ae)}catch(gt){throw wa(Ae),gt}}else if(an(Ae))Y=Kn("<!---->"),ge=Y.ownerDocument.importNode(Ae,!0),ge.nodeType===Ks.element&&ge.nodeName==="BODY"||ge.nodeName==="HTML"?Y=ge:Y.appendChild(ge),ci(ge);else{if(!me&&!ke&&!xe&&Ae.indexOf("<")===-1)return v&&Le?D(Ae):Ae;if(Y=Kn(Ae),!Y)return me?null:Le?w:""}Y&&z&&Qt(Y.firstChild);const G=Sa(L?Ae:Y);try{for(;Pe=G.nextNode();)Se(Pe),Jn(Pe),ms(Pe.content)&&Yn(Pe.content)}catch(De){throw L&&wa(Ae),De}if(L)return cn(t.removed,De=>{De.element&&ka(De.element)}),ke&&Wn(Ae),Ae;if(me){if(ke&&Wn(Y),Te)for(x=M.call(Y.ownerDocument);Y.firstChild;)x.appendChild(Y.firstChild);else x=Y;return(k.shadowroot||k.shadowrootmode)&&(x=B.call(n,x,!0)),x}let ve=xe?Y.outerHTML:Y.innerHTML;return xe&&we["!doctype"]&&Y.ownerDocument&&Y.ownerDocument.doctype&&Y.ownerDocument.doctype.name&&$t(cS,Y.ownerDocument.doctype.name)&&(ve="<!DOCTYPE "+Y.ownerDocument.doctype.name+`>
`+ve),ke&&cn([Q,oe,Z],De=>{ve=Ia(ve,De," ")}),v&&Le?D(ve):ve},t.setConfig=function(){let Ae=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};We(Ae),de=!0},t.clearConfig=function(){K=null,de=!1,v=T,w=""},t.isValidAttribute=function(Ae,A,Y){K||We({});const ge=Je(Ae),Pe=Je(A);return Ie(ge,Pe,Y)},t.addHook=function(Ae,A){typeof A=="function"&&Ra(te[Ae],A)},t.removeHook=function(Ae,A){if(A!==void 0){const Y=qk(te[Ae],A);return Y===-1?void 0:Gk(te[Ae],Y,1)[0]}return Zu(te[Ae])},t.removeHooks=function(Ae){te[Ae]=[]},t.removeAllHooks=function(){te=ip()},t}var lp=$m();function Xc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var _a=Xc();function Bm(e){_a=e}var Mi={exec:()=>null};function nt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(as.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var as={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},fS=/^(?:[ \t]*(?:\n|$))+/,hS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,dl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,vS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ed=/(?:[*+-]|\d{1,9}[.)])/,Um=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Hm=nt(Um).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),gS=nt(Um).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),td=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bS=/^[^\n]+/,sd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yS=nt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",sd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xS=nt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ed).getRegex(),Ur="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",nd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_S=nt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",nd).replace("tag",Ur).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),zm=nt(td).replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ur).getRegex(),wS=nt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",zm).getRegex(),ad={blockquote:wS,code:hS,def:yS,fences:mS,heading:vS,hr:dl,html:_S,lheading:Hm,list:xS,newline:fS,paragraph:zm,table:Mi,text:bS},rp=nt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ur).getRegex(),kS={...ad,lheading:gS,table:rp,paragraph:nt(td).replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",rp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ur).getRegex()},SS={...ad,html:nt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",nd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Mi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:nt(td).replace("hr",dl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Hm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},TS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,CS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,jm=/^( {2,}|\\)\n(?!\s*$)/,ES=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Hr=/[\p{P}\p{S}]/u,id=/[\s\p{P}\p{S}]/u,Vm=/[^\s\p{P}\p{S}]/u,AS=nt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,id).getRegex(),qm=/(?!~)[\p{P}\p{S}]/u,RS=/(?!~)[\s\p{P}\p{S}]/u,IS=/(?:[^\s\p{P}\p{S}]|~)/u,OS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Gm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,LS=nt(Gm,"u").replace(/punct/g,Hr).getRegex(),NS=nt(Gm,"u").replace(/punct/g,qm).getRegex(),Km="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",MS=nt(Km,"gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,Hr).getRegex(),PS=nt(Km,"gu").replace(/notPunctSpace/g,IS).replace(/punctSpace/g,RS).replace(/punct/g,qm).getRegex(),DS=nt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,Hr).getRegex(),FS=nt(/\\(punct)/,"gu").replace(/punct/g,Hr).getRegex(),$S=nt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),BS=nt(nd).replace("(?:-->|$)","-->").getRegex(),US=nt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",BS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),cr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,HS=nt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",cr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Wm=nt(/^!?\[(label)\]\[(ref)\]/).replace("label",cr).replace("ref",sd).getRegex(),Zm=nt(/^!?\[(ref)\](?:\[\])?/).replace("ref",sd).getRegex(),zS=nt("reflink|nolink(?!\\()","g").replace("reflink",Wm).replace("nolink",Zm).getRegex(),ld={_backpedal:Mi,anyPunctuation:FS,autolink:$S,blockSkip:OS,br:jm,code:CS,del:Mi,emStrongLDelim:LS,emStrongRDelimAst:MS,emStrongRDelimUnd:DS,escape:TS,link:HS,nolink:Zm,punctuation:AS,reflink:Wm,reflinkSearch:zS,tag:US,text:ES,url:Mi},jS={...ld,link:nt(/^!?\[(label)\]\((.*?)\)/).replace("label",cr).getRegex(),reflink:nt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",cr).getRegex()},Jo={...ld,emStrongRDelimAst:PS,emStrongLDelim:NS,url:nt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},VS={...Jo,br:nt(jm).replace("{2,}","*").getRegex(),text:nt(Jo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Al={normal:ad,gfm:kS,pedantic:SS},bi={normal:ld,gfm:Jo,breaks:VS,pedantic:jS},qS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},op=e=>qS[e];function Js(e,t){if(t){if(as.escapeTest.test(e))return e.replace(as.escapeReplace,op)}else if(as.escapeTestNoEncode.test(e))return e.replace(as.escapeReplaceNoEncode,op);return e}function cp(e){try{e=encodeURI(e).replace(as.percentDecode,"%")}catch{return null}return e}function dp(e,t){var i;const s=e.replace(as.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(as.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(as.slashPipe,"|");return n}function yi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function GS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function up(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function KS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var dr=class{constructor(e){dt(this,"options");dt(this,"rules");dt(this,"lexer");this.options=e||_a}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:yi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=KS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=yi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:yi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=yi(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,m=f.raw+`
`+s.join(`
`),b=this.blockquote(m);i[i.length-1]=b,n=n.substring(0,n.length-f.raw.length)+b.raw,a=a.substring(0,a.length-f.text.length)+b.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,m=f.raw+`
`+s.join(`
`),b=this.list(m);i[i.length-1]=b,n=n.substring(0,n.length-p.raw.length)+b.raw,a=a.substring(0,a.length-f.raw.length)+b.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const R=this.rules.other.nextBulletRegex(m),S=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),_=this.rules.other.headingBeginRegex(m),C=this.rules.other.htmlBeginRegex(m);for(;e;){const v=e.split(`
`,1)[0];let w;if(p=v,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),w=p):w=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||_.test(p)||C.test(p)||R.test(p)||S.test(p))break;if(w.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+w.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||_.test(u)||S.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=v+`
`,e=e.substring(v.length+1),u=w.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let b=null,E;this.options.gfm&&(b=this.rules.other.listIsTask.exec(d),b&&(E=b[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!b,checked:E,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(dp(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=yi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=GS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),up(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return up(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},gn=class Yo{constructor(t){dt(this,"tokens");dt(this,"options");dt(this,"state");dt(this,"tokenizer");dt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||_a,this.options.tokenizer=this.options.tokenizer||new dr,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:as,block:Al.normal,inline:bi.normal};this.options.pedantic?(s.block=Al.pedantic,s.inline=bi.pedantic):this.options.gfm&&(s.block=Al.gfm,this.options.breaks?s.inline=bi.breaks:s.inline=bi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Al,inline:bi}}static lex(t,s){return new Yo(s).lex(t)}static lexInline(t,s){return new Yo(s).inlineTokens(t)}lex(t){t=t.replace(as.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(as.tabCharGlobal,"    ").replace(as.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(b=>{m=b.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},ur=class{constructor(e){dt(this,"options");dt(this,"parser");this.options=e||_a}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(as.notSpaceStart))==null?void 0:i[0],a=e.replace(as.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Js(n)+'">'+(s?a:Js(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Js(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Js(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Js(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=cp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Js(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=cp(e);if(a===null)return Js(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Js(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Js(e.text)}},rd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},bn=class Qo{constructor(t){dt(this,"options");dt(this,"renderer");dt(this,"textRenderer");this.options=t||_a,this.options.renderer=this.options.renderer||new ur,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new rd}static parse(t,s){return new Qo(s).parse(t)}static parseInline(t,s){return new Qo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},go,Pl=(go=class{constructor(e){dt(this,"options");dt(this,"block");this.options=e||_a}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?gn.lex:gn.lexInline}provideParser(){return this.block?bn.parse:bn.parseInline}},dt(go,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),go),WS=class{constructor(...e){dt(this,"defaults",Xc());dt(this,"options",this.setOptions);dt(this,"parse",this.parseMarkdown(!0));dt(this,"parseInline",this.parseMarkdown(!1));dt(this,"Parser",bn);dt(this,"Renderer",ur);dt(this,"TextRenderer",rd);dt(this,"Lexer",gn);dt(this,"Tokenizer",dr);dt(this,"Hooks",Pl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new ur(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new dr(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Pl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Pl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return gn.lex(e,t??this.defaults)}parser(e,t){return bn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?gn.lex:gn.lexInline,o=i.hooks?i.hooks.provideParser():e?bn.parse:bn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Js(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ma=new WS;function tt(e,t){return ma.parse(e,t)}tt.options=tt.setOptions=function(e){return ma.setOptions(e),tt.defaults=ma.defaults,Bm(tt.defaults),tt};tt.getDefaults=Xc;tt.defaults=_a;tt.use=function(...e){return ma.use(...e),tt.defaults=ma.defaults,Bm(tt.defaults),tt};tt.walkTokens=function(e,t){return ma.walkTokens(e,t)};tt.parseInline=ma.parseInline;tt.Parser=bn;tt.parser=bn.parse;tt.Renderer=ur;tt.TextRenderer=rd;tt.Lexer=gn;tt.lexer=gn.lex;tt.Tokenizer=dr;tt.Hooks=Pl;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;bn.parse;gn.lex;const ZS={breaks:!0,gfm:!0};function pp(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,ZS);return typeof lp<"u"?lp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function JS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const YS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function QS(e){return YS[e]||"wrench"}const XS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function fp(e){if(!e)return[];const t=e.match(XS);return t?[...new Set(t)]:[]}const e1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),r=h("");let o=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=J(()=>t.value.trim().length>0&&!s.value),p=h(Ye.state||"disconnected");let f=null;const m=J(()=>{const U=p.value;return U==="connected"?"Connected":U==="reconnecting"?"Reconnecting…":U==="connecting"?"Connecting…":"REST fallback"}),b=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],E=J(()=>{const U=Math.floor(l.value/4)%b.length,P=l.value;return P>3?`${b[U]} (${P}s)`:b[0]});function R(){Ct(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function S(){if(!i.value)return;const U=i.value;U.style.height="auto",U.style.height=Math.min(U.scrollHeight,120)+"px"}function g(U,P,M={}){const V={id:++c,role:U,content:P,timestamp:Date.now(),html:U==="bot"?pp(P):"",tools_used:M.tools_used||[],is_error:M.is_error||!1,images:U==="bot"?fp(P):[],files:M.files||[],_showTools:!1};return e.value.push(V),R(),U==="bot"&&Ct(()=>_()),V}function _(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(P=>{P.setAttribute("data-copy","true"),P.style.position="relative";const M=document.createElement("button");M.className="chat-code-copy",M.textContent="Copy",M.addEventListener("click",()=>{const V=P.querySelector("code"),B=V?V.textContent:P.textContent;navigator.clipboard.writeText(B).then(()=>{M.textContent="Copied!",setTimeout(()=>{M.textContent="Copy"},1500)}).catch(()=>{})}),P.appendChild(M)})}function C(U){if(U===0)return!0;const P=e.value[U-1],M=e.value[U],V=new Date(P.timestamp).toDateString(),B=new Date(M.timestamp).toDateString();return V!==B}function v(U){const P=new Date(U),M=new Date;if(P.toDateString()===M.toDateString())return"Today";const V=new Date(M);return V.setDate(V.getDate()-1),P.toDateString()===V.toDateString()?"Yesterday":P.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function w(U){t.value=U,Ct(()=>q())}function T(U){window.open(U,"_blank","noopener")}function y(U){U.target.style.display="none"}function I(){l.value=0,o=setInterval(()=>{l.value++},1e3)}function F(){o&&(clearInterval(o),o=null),l.value=0}function D(U){s.value&&(s.value=!1,F(),U.type==="chat_response"?g("bot",U.content,{tools_used:U.tools_used||[],is_error:U.is_error||!1,files:U.files||[]}):U.type==="chat_error"&&g("bot",U.error||"Unknown error",{is_error:!0}),Ct(()=>{var P;return(P=i.value)==null?void 0:P.focus()}))}async function N(U){try{const P=await W.post("/api/chat",{content:U,channel_id:r.value});g("bot",P.response,{tools_used:P.tools_used||[],is_error:P.is_error||!1,files:P.files||[]})}catch(P){g("bot",P.message||"Failed to send message",{is_error:!0})}}async function q(){const U=t.value.trim();if(!U||s.value)return;g("user",U),t.value="",s.value=!0,I(),i.value&&(i.value.style.height="auto"),Ye.connected&&Ye.sendChat(U,{channelId:r.value})||(await N(U),s.value=!1,F()),Ct(()=>{var M;return(M=i.value)==null?void 0:M.focus()})}async function ae(){n.value="";try{if(!r.value){const P=await W.get("/api/auth/session");r.value=P.channel_id||P.user_id||"web-user"}const U=await W.get("/api/sessions/"+encodeURIComponent(r.value));if(U&&U.messages&&U.messages.length>0){for(const P of U.messages){const M=P.role==="user"?"user":"bot";let V=P.content||"";if(M==="user"){const te=V.match(/^\[.*?\]:\s*/);te&&(V=V.slice(te[0].length))}if(!V.trim())continue;const B={id:++c,role:M,content:V,timestamp:P.timestamp?P.timestamp*1e3:Date.now(),html:M==="bot"?pp(V):"",tools_used:[],is_error:!1,images:M==="bot"?fp(V):[],files:[],_showTools:!1};e.value.push(B)}Ct(()=>{R(),_()})}}catch(U){U&&U.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Oe.error(n.value))}}return Ke(()=>{Ye.subscribe("chat",D),p.value=Ye.state||"disconnected",f=Ye.onState(U=>{p.value=U}),ae(),Ct(()=>{var U;return(U=i.value)==null?void 0:U.focus()})}),_t(()=>{Ye.unsubscribe("chat",D),f&&(f(),f=null),F()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:m,typingText:E,suggestions:d,send:q,autoResize:S,formatTime:JS,formatDate:v,showDateSeparator:C,useSuggestion:w,openImage:T,onImageError:y,getToolIcon:QS,loadHistory:ae}}},t1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=J(()=>e.value==="custom"),b=J(()=>[...i.value,...l.value]),E=J(()=>l.value.includes(e.value)),R=J(()=>{var T;return m.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),S=J(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),g=J(()=>{var T;return m.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function _(){d.value=!0;try{const T=await W.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function C(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function v(){const T=u.value.trim();if(T){f.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:T,display_name:R.value,identity:S.value,voice:g.value}),p.value=!1,u.value="",await _(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(y){c.value=y.message}finally{f.value=!1}}}async function w(){if(await Jt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(y){c.value=y.message}}}return Ke(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:b,isCustom:m,isUserPreset:E,previewName:R,previewIdentity:S,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:C,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:v,deletePreset:w,builtinPresets:i,userPresets:l}},template:`
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
  `},wt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Jm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Dk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:e1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:vw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:kw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Vw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:t1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Rk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:wt("/operations","live")},{path:"/agents",redirect:wt("/operations","agents")},{path:"/loops",redirect:wt("/operations","loops")},{path:"/processes",redirect:wt("/operations","processes")},{path:"/schedules",redirect:wt("/operations","schedules")},{path:"/audit",redirect:wt("/history","audit")},{path:"/sessions",redirect:wt("/history","sessions")},{path:"/traces",redirect:wt("/history","traces")},{path:"/usage",redirect:wt("/history","usage")},{path:"/tools",redirect:wt("/capabilities","tools")},{path:"/skills",redirect:wt("/capabilities","skills")},{path:"/mcp",redirect:wt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:wt("/capabilities","knowledge")},{path:"/memory",redirect:wt("/capabilities","memory")},{path:"/learned",redirect:wt("/capabilities","learned")},{path:"/health",redirect:wt("/system","health")},{path:"/resources",redirect:wt("/system","resources")},{path:"/logs",redirect:wt("/system","logs")},{path:"/config",redirect:wt("/system","config")},{path:"/host-access",redirect:wt("/system","host-access")},{path:"/internals",redirect:wt("/system","internals")}],Pi=tw({history:N_(),routes:Jm});Pi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const s1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},n1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),b=h(""),E=Jm.filter(V=>V.meta),R=J(()=>["Workspace","Operate","Observe","Manage"].map(V=>({name:V,routes:E.filter(B=>B.meta.section===V)})).filter(V=>V.routes.length)),S=J(()=>{var V;return((V=Pi.currentRoute.value.meta)==null?void 0:V.label)||"Odin"}),g=J(()=>{var V;return((V=Pi.currentRoute.value.meta)==null?void 0:V.section)||"Management"}),_=J(()=>{var V;return((V=Pi.currentRoute.value.meta)==null?void 0:V.description)||"Management console"});function C(){Ye.disconnect(),q&&(clearInterval(q),q=null)}W.onSessionExpired=()=>{t.value=!0,C(),W.setToken(""),e.value="login"};function v(V){var B;if((V.ctrlKey||V.metaKey)&&V.key.toLowerCase()==="k"){e.value==="ready"&&(V.preventDefault(),qu());return}if(n.value&&V.key==="Tab"){const te=[...((B=a.value)==null?void 0:B.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(te.length){const Q=te[0],oe=te[te.length-1];if(V.shiftKey&&(document.activeElement===Q||!a.value.contains(document.activeElement))){V.preventDefault(),oe.focus();return}if(!V.shiftKey&&(document.activeElement===oe||!a.value.contains(document.activeElement))){V.preventDefault(),Q.focus();return}}}if(V.key==="Escape"&&n.value){n.value=!1,V.preventDefault();return}if(V.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(V.target.tagName)){V.preventDefault();const te=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');te&&te.focus()}}function w(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ke(async()=>{document.addEventListener("keydown",v),r=window.matchMedia("(max-width: 900px)"),w(),r.addEventListener("change",w);const V=await W.check();V.ok?(e.value="ready",P()):V.needsAuth?e.value="login":(e.value="ready",P())});function T(){t.value=!1,e.value="ready",P()}async function y(){C(),e.value="login",await W.logout()}function I(){s.value=!s.value}function F(){n.value=!n.value}is(n,async V=>{var B,te;if(V)o=document.activeElement,await Ct(),(te=(B=a.value)==null?void 0:B.querySelector(".nav-item"))==null||te.focus();else if(o!=null&&o.isConnected){const Q=o;o=null,requestAnimationFrame(()=>Q.focus())}});const D=J(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function N(V,B="info",te=3e3){p.value={text:V,level:B},clearTimeout(f),f=setTimeout(()=>{p.value=null},te)}let q=null,ae=!1,U=[];function P(){for(const V of U)V();U=[Ye.onStatus(V=>{c.value=V}),Ye.onLatencyChange(V=>{u.value=V}),Ye.onState((V,B)=>{d.value=V,V==="connected"?(ae&&N("Connection restored","success"),ae=!0):V==="reconnecting"&&B.attempt===1&&N("Connection lost — reconnecting…","warn")})],Ye.connect(),M(),q&&clearInterval(q),q=setInterval(M,15e3)}async function M(){try{const V=await W.get("/api/status");m.value=V.status==="online"?"online":"starting";const B=V.uptime_seconds||0,te=Math.floor(B/3600),Q=Math.floor(B%3600/60);b.value=`${te}h ${Q}m uptime`}catch{m.value="offline",b.value=""}}return _t(()=>{q&&clearInterval(q);for(const V of U)V();U=[],Ye.disconnect(),document.removeEventListener("keydown",v),r==null||r.removeEventListener("change",w)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:D,wsToast:p,botStatus:m,botUptime:b,navRoutes:E,navGroups:R,currentPage:S,currentSection:g,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:y,toggleSidebar:I,toggleMobileNavigation:F,openPalette:qu}}},Vn=Xl(n1);Vn.component("odin-icon",Nk);Vn.component("login-screen",s1);Vn.component("toast-container",K0);Vn.component("confirm-host",W0);Vn.component("command-palette",Lk);Vn.directive("modal-focus",Pk);Vn.use(Pi);Vn.mount("#app");
