var Ov=Object.defineProperty;var Lv=(e,t,s)=>t in e?Ov(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var vt=(e,t,s)=>Lv(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Nv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Al("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Fd(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Al("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new Fd((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Al((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Al?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Al extends Error{constructor(t){super(t),this.name="AuthError"}}class Fd extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Dv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const U=new Nv,at=new Dv(U);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Is(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ze={},Yn=[],Xt=()=>{},Wn=()=>!1,En=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),No=e=>e.startsWith("onUpdate:"),Je=Object.assign,Cc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Pv=Object.prototype.hasOwnProperty,rt=(e,t)=>Pv.call(e,t),Ae=Array.isArray,Qn=e=>yi(e)==="[object Map]",An=e=>yi(e)==="[object Set]",$d=e=>yi(e)==="[object Date]",Mv=e=>yi(e)==="[object RegExp]",Fe=e=>typeof e=="function",Be=e=>typeof e=="string",os=e=>typeof e=="symbol",lt=e=>e!==null&&typeof e=="object",Ec=e=>(lt(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),Kp=Object.prototype.toString,yi=e=>Kp.call(e),Fv=e=>yi(e).slice(8,-1),Do=e=>yi(e)==="[object Object]",Po=e=>Be(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Ra=Is(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),$v=Is("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Mo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Uv=/-\w/g,ht=Mo(e=>e.replace(Uv,t=>t.slice(1).toUpperCase())),Bv=/\B([A-Z])/g,ws=Mo(e=>e.replace(Bv,"-$1").toLowerCase()),Rn=Mo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Xn=Mo(e=>e?`on${Rn(e)}`:""),qt=(e,t)=>!Object.is(e,t),ei=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Wp=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Fo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},to=e=>{const t=Be(e)?Number(e):NaN;return isNaN(t)?e:t};let Ud;const $o=()=>Ud||(Ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Hv(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const zv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",jv=Is(zv);function gl(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=Be(a)?Jp(a):gl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(Be(e)||lt(e))return e}const Vv=/;(?![^(]*\))/g,qv=/:([^]+)/,Gv=/\/\*[^]*?\*\//g;function Jp(e){const t={};return e.replace(Gv,"").split(Vv).forEach(s=>{if(s){const a=s.split(qv);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function bl(e){let t="";if(Be(e))t=e;else if(Ae(e))for(let s=0;s<e.length;s++){const a=bl(e[s]);a&&(t+=a+" ")}else if(lt(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Kv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Be(t)&&(e.class=bl(t)),s&&(e.style=gl(s)),e}const Wv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Jv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Zv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Yv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Qv=Is(Wv),Xv=Is(Jv),eg=Is(Zv),tg=Is(Yv),sg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",ag=Is(sg);function Zp(e){return!!e||e===""}function ng(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Na(e[a],t[a]);return s}function Na(e,t){if(e===t)return!0;let s=$d(e),a=$d(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=os(e),a=os(t),s||a)return e===t;if(s=Ae(e),a=Ae(t),s||a)return s&&a?ng(e,t):!1;if(s=lt(e),a=lt(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Na(e[l],t[l]))return!1}}return String(e)===String(t)}function Uo(e,t){return e.findIndex(s=>Na(s,t))}const Yp=e=>!!(e&&e.__v_isRef===!0),Qp=e=>Be(e)?e:e==null?"":Ae(e)||lt(e)&&(e.toString===Kp||!Fe(e.toString))?Yp(e)?Qp(e.value):JSON.stringify(e,Xp,2):String(e),Xp=(e,t)=>Yp(t)?Xp(e,t.value):Qn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[ur(a,i)+" =>"]=n,s),{})}:An(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>ur(s))}:os(t)?ur(t):lt(t)&&!Ae(t)&&!Do(t)?String(t):t,ur=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function ig(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let jt;class Ac{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&jt&&(jt.active?(this.parent=jt,this.index=(jt.scopes||(jt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=jt;try{return jt=this,t()}finally{jt=s}}}on(){++this._on===1&&(this.prevScope=jt,jt=this)}off(){if(this._on>0&&--this._on===0){if(jt===this)jt=this.prevScope;else{let t=jt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function lg(e){return new Ac(e)}function ef(){return jt}function og(e,t=!1){jt&&jt.cleanups.push(e)}let gt;const pr=new WeakSet;class Zi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,jt&&(jt.active?jt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,pr.has(this)&&(pr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||sf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Bd(this),af(this);const t=gt,s=Js;gt=this,Js=!0;try{return this.fn()}finally{nf(this),gt=t,Js=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Oc(t);this.deps=this.depsTail=void 0,Bd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?pr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Br(this)&&this.run()}get dirty(){return Br(this)}}let tf=0,Bi,Hi;function sf(e,t=!1){if(e.flags|=8,t){e.next=Hi,Hi=e;return}e.next=Bi,Bi=e}function Rc(){tf++}function Ic(){if(--tf>0)return;if(Hi){let t=Hi;for(Hi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Bi;){let t=Bi;for(Bi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function af(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function nf(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Oc(a),rg(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Br(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(lf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function lf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Yi)||(e.globalVersion=Yi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Br(e))))return;e.flags|=2;const t=e.dep,s=gt,a=Js;gt=e,Js=!0;try{af(e);const n=e.fn(e._value);(t.version===0||qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{gt=s,Js=a,nf(e),e.flags&=-3}}function Oc(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Oc(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function rg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function cg(e,t){e.effect instanceof Zi&&(e=e.effect.fn);const s=new Zi(e);t&&Je(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function dg(e){e.effect.stop()}let Js=!0;const of=[];function Da(){of.push(Js),Js=!1}function Pa(){const e=of.pop();Js=e===void 0?!0:e}function Bd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=gt;gt=void 0;try{t()}finally{gt=s}}}let Yi=0;class ug{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Bo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!gt||!Js||gt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==gt)s=this.activeLink=new ug(gt,this),gt.deps?(s.prevDep=gt.depsTail,gt.depsTail.nextDep=s,gt.depsTail=s):gt.deps=gt.depsTail=s,rf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=gt.depsTail,s.nextDep=void 0,gt.depsTail.nextDep=s,gt.depsTail=s,gt.deps===s&&(gt.deps=a)}return s}trigger(t){this.version++,Yi++,this.notify(t)}notify(t){Rc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Ic()}}}function rf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)rf(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const so=new WeakMap,bn=Symbol(""),Hr=Symbol(""),Qi=Symbol("");function ns(e,t,s){if(Js&&gt){let a=so.get(e);a||so.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new Bo),n.map=a,n.key=s),n.track()}}function Sa(e,t,s,a,n,i){const l=so.get(e);if(!l){Yi++;return}const o=r=>{r&&r.trigger()};if(Rc(),t==="clear")l.forEach(o);else{const r=Ae(e),c=r&&Po(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(bn)),Qn(e)&&o(l.get(Hr)));break;case"delete":r||(o(l.get(bn)),Qn(e)&&o(l.get(Hr)));break;case"set":Qn(e)&&o(l.get(bn));break}}Ic()}function pg(e,t){const s=so.get(e);return s&&s.get(t)}function $n(e){const t=st(e);return t===e?t:(ns(t,"iterate",Qi),Ss(e)?t:t.map(Ys))}function Ho(e){return ns(e=st(e),"iterate",Qi),e}function ra(e,t){return da(e)?oi(Ia(e)?Ys(t):t):Ys(t)}const fg={__proto__:null,[Symbol.iterator](){return fr(this,Symbol.iterator,e=>ra(this,e))},concat(...e){return $n(this).concat(...e.map(t=>Ae(t)?$n(t):t))},entries(){return fr(this,"entries",e=>(e[1]=ra(this,e[1]),e))},every(e,t){return va(this,"every",e,t,void 0,arguments)},filter(e,t){return va(this,"filter",e,t,s=>s.map(a=>ra(this,a)),arguments)},find(e,t){return va(this,"find",e,t,s=>ra(this,s),arguments)},findIndex(e,t){return va(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return va(this,"findLast",e,t,s=>ra(this,s),arguments)},findLastIndex(e,t){return va(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return va(this,"forEach",e,t,void 0,arguments)},includes(...e){return hr(this,"includes",e)},indexOf(...e){return hr(this,"indexOf",e)},join(e){return $n(this).join(e)},lastIndexOf(...e){return hr(this,"lastIndexOf",e)},map(e,t){return va(this,"map",e,t,void 0,arguments)},pop(){return Si(this,"pop")},push(...e){return Si(this,"push",e)},reduce(e,...t){return Hd(this,"reduce",e,t)},reduceRight(e,...t){return Hd(this,"reduceRight",e,t)},shift(){return Si(this,"shift")},some(e,t){return va(this,"some",e,t,void 0,arguments)},splice(...e){return Si(this,"splice",e)},toReversed(){return $n(this).toReversed()},toSorted(e){return $n(this).toSorted(e)},toSpliced(...e){return $n(this).toSpliced(...e)},unshift(...e){return Si(this,"unshift",e)},values(){return fr(this,"values",e=>ra(this,e))}};function fr(e,t,s){const a=Ho(e),n=a[t]();return a!==e&&!Ss(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const hg=Array.prototype;function va(e,t,s,a,n,i){const l=Ho(e),o=l!==e&&!Ss(e),r=l[t];if(r!==hg[t]){const u=r.apply(e,i);return o?Ys(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ra(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Hd(e,t,s,a){const n=Ho(e),i=n!==e&&!Ss(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ra(e,c)),s.call(this,c,ra(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ra(e,r):r}function hr(e,t,s){const a=st(e);ns(a,"iterate",Qi);const n=a[t](...s);return(n===-1||n===!1)&&yl(s[0])?(s[0]=st(s[0]),a[t](...s)):n}function Si(e,t,s=[]){Da(),Rc();const a=st(e)[t].apply(e,s);return Ic(),Pa(),a}const mg=Is("__proto__,__v_isRef,__isVue"),cf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function vg(e){os(e)||(e=String(e));const t=st(this);return ns(t,"has",e),t.hasOwnProperty(e)}class df{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?vf:mf:i?hf:ff).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Ae(t);if(!n){let r;if(l&&(r=fg[s]))return r;if(s==="hasOwnProperty")return vg}const o=Reflect.get(t,s,Ft(t)?t:a);if((os(s)?cf.has(s):mg(s))||(n||ns(t,"get",s),i))return o;if(Ft(o)){const r=l&&Po(s)?o:o.value;return n&&lt(r)?ao(r):r}return lt(o)?n?ao(o):an(o):o}}class uf extends df{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Ae(t)&&Po(s);if(!this._isShallow){const c=da(i);if(!Ss(a)&&!da(a)&&(i=st(i),a=st(a)),!l&&Ft(i)&&!Ft(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:rt(t,s),r=Reflect.set(t,s,a,Ft(t)?t:n);return t===st(n)&&(o?qt(a,i)&&Sa(t,"set",s,a):Sa(t,"add",s,a)),r}deleteProperty(t,s){const a=rt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Sa(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!os(s)||!cf.has(s))&&ns(t,"has",s),a}ownKeys(t){return ns(t,"iterate",Ae(t)?"length":bn),Reflect.ownKeys(t)}}class pf extends df{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const gg=new uf,bg=new pf,yg=new uf(!0),xg=new pf(!0),zr=e=>e,Rl=e=>Reflect.getPrototypeOf(e);function _g(e,t,s){return function(...a){const n=this.__v_raw,i=st(n),l=Qn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?zr:t?oi:Ys;return!t&&ns(i,"iterate",r?Hr:bn),Je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Il(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function wg(e,t){const s={get(n){const i=this.__v_raw,l=st(i),o=st(n);e||(qt(n,o)&&ns(l,"get",n),ns(l,"get",o));const{has:r}=Rl(l),c=t?zr:e?oi:Ys;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ns(st(n),"iterate",bn),n.size},has(n){const i=this.__v_raw,l=st(i),o=st(n);return e||(qt(n,o)&&ns(l,"has",n),ns(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=st(o),c=t?zr:e?oi:Ys;return!e&&ns(r,"iterate",bn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Je(s,e?{add:Il("add"),set:Il("set"),delete:Il("delete"),clear:Il("clear")}:{add(n){const i=st(this),l=Rl(i),o=st(n),r=!t&&!Ss(n)&&!da(n)?o:n;return l.has.call(i,r)||qt(n,r)&&l.has.call(i,n)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Sa(i,"add",r,r)),this},set(n,i){!t&&!Ss(i)&&!da(i)&&(i=st(i));const l=st(this),{has:o,get:r}=Rl(l);let c=o.call(l,n);c||(n=st(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?qt(i,d)&&Sa(l,"set",n,i):Sa(l,"add",n,i),this},delete(n){const i=st(this),{has:l,get:o}=Rl(i);let r=l.call(i,n);r||(n=st(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Sa(i,"delete",n,void 0),c},clear(){const n=st(this),i=n.size!==0,l=n.clear();return i&&Sa(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=_g(n,e,t)}),s}function zo(e,t){const s=wg(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(rt(s,n)&&n in a?s:a,n,i)}const kg={get:zo(!1,!1)},Sg={get:zo(!1,!0)},Tg={get:zo(!0,!1)},Cg={get:zo(!0,!0)},ff=new WeakMap,hf=new WeakMap,mf=new WeakMap,vf=new WeakMap;function Eg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function an(e){return da(e)?e:jo(e,!1,gg,kg,ff)}function Lc(e){return jo(e,!1,yg,Sg,hf)}function ao(e){return jo(e,!0,bg,Tg,mf)}function Ag(e){return jo(e,!0,xg,Cg,vf)}function jo(e,t,s,a,n){if(!lt(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Eg(Fv(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function Ia(e){return da(e)?Ia(e.__v_raw):!!(e&&e.__v_isReactive)}function da(e){return!!(e&&e.__v_isReadonly)}function Ss(e){return!!(e&&e.__v_isShallow)}function yl(e){return e?!!e.__v_raw:!1}function st(e){const t=e&&e.__v_raw;return t?st(t):e}function gf(e){return!rt(e,"__v_skip")&&Object.isExtensible(e)&&Wp(e,"__v_skip",!0),e}const Ys=e=>lt(e)?an(e):e,oi=e=>lt(e)?ao(e):e;function Ft(e){return e?e.__v_isRef===!0:!1}function f(e){return bf(e,!1)}function Nc(e){return bf(e,!0)}function bf(e,t){return Ft(e)?e:new Rg(e,t)}class Rg{constructor(t,s){this.dep=new Bo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:st(t),this._value=s?t:Ys(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Ss(t)||da(t);t=a?t:st(t),qt(t,s)&&(this._rawValue=t,this._value=a?t:Ys(t),this.dep.trigger())}}function Ig(e){e.dep&&e.dep.trigger()}function ca(e){return Ft(e)?e.value:e}function Og(e){return Fe(e)?e():ca(e)}const Lg={get:(e,t,s)=>t==="__v_raw"?e:ca(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return Ft(n)&&!Ft(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Dc(e){return Ia(e)?e:new Proxy(e,Lg)}class Ng{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Bo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function yf(e){return new Ng(e)}function Dg(e){const t=Ae(e)?new Array(e.length):{};for(const s in e)t[s]=xf(e,s);return t}class Pg{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=st(t);let n=!0,i=t;if(!Ae(t)||os(this._key)||!Po(this._key))do n=!yl(i)||Ss(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=ca(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Ft(this._raw[this._key])){const s=this._object[this._key];if(Ft(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return pg(this._raw,this._key)}}class Mg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Fg(e,t,s){return Ft(e)?e:Fe(e)?new Mg(e):lt(e)&&arguments.length>1?xf(e,t,s):f(e)}function xf(e,t,s){return new Pg(e,t,s)}class $g{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Bo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Yi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&gt!==this)return sf(this,!0),!0}get value(){const t=this.dep.track();return lf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ug(e,t,s=!1){let a,n;return Fe(e)?a=e:(a=e.get,n=e.set),new $g(a,n,s)}const Bg={GET:"get",HAS:"has",ITERATE:"iterate"},Hg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ol={},no=new WeakMap;let Ja;function zg(){return Ja}function _f(e,t=!1,s=Ja){if(s){let a=no.get(s);a||no.set(s,a=[]),a.push(e)}}function jg(e,t,s=Ze){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=y=>n?y:Ss(y)||n===!1||n===0?Ta(y,1):Ta(y);let d,u,p,h,m=!1,v=!1;if(Ft(e)?(u=()=>e.value,m=Ss(e)):Ia(e)?(u=()=>c(e),m=!0):Ae(e)?(v=!0,m=e.some(y=>Ia(y)||Ss(y)),u=()=>e.map(y=>{if(Ft(y))return y.value;if(Ia(y))return c(y);if(Fe(y))return r?r(y,2):y()})):Fe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Da();try{p()}finally{Pa()}}const y=Ja;Ja=d;try{return r?r(e,3,[h]):e(h)}finally{Ja=y}}:u=Xt,t&&n){const y=u,E=n===!0?1/0:n;u=()=>Ta(y(),E)}const S=ef(),L=()=>{d.stop(),S&&S.active&&Cc(S.effects,d)};if(i&&t){const y=t;t=(...E)=>{const _=y(...E);return L(),_}}let b=v?new Array(e.length).fill(Ol):Ol;const g=y=>{if(!(!(d.flags&1)||!d.dirty&&!y))if(t){const E=d.run();if(y||n||m||(v?E.some((_,A)=>qt(_,b[A])):qt(E,b))){p&&p();const _=Ja;Ja=d;try{const A=[E,b===Ol?void 0:v&&b[0]===Ol?[]:b,h];b=E,r?r(t,3,A):t(...A)}finally{Ja=_}}}else d.run()};return o&&o(g),d=new Zi(u),d.scheduler=l?()=>l(g,!1):g,h=y=>_f(y,!1,d),p=d.onStop=()=>{const y=no.get(d);if(y){if(r)r(y,4);else for(const E of y)E();no.delete(d)}},t?a?g(!0):b=d.run():l?l(g.bind(null,!0),!0):d.run(),L.pause=d.pause.bind(d),L.resume=d.resume.bind(d),L.stop=L,L}function Ta(e,t=1/0,s){if(t<=0||!lt(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Ft(e))Ta(e.value,t,s);else if(Ae(e))for(let a=0;a<e.length;a++)Ta(e[a],t,s);else if(An(e)||Qn(e))e.forEach(a=>{Ta(a,t,s)});else if(Do(e)){for(const a in e)Ta(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ta(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const wf=[];function Vg(e){wf.push(e)}function qg(){wf.pop()}function Gg(e,t){}const Kg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Wg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function xi(e,t,s,a){try{return a?e(...a):e()}catch(n){In(n,t,s)}}function Rs(e,t,s,a){if(Fe(e)){const n=xi(e,t,s,a);return n&&Ec(n)&&n.catch(i=>{In(i,t,s)}),n}if(Ae(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Rs(e[i],t,s,a));return n}}function In(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ze;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Da(),xi(i,null,10,[e,r,c]),Pa();return}}Jg(e,s,n,a,l)}function Jg(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const us=[];let la=-1;const ti=[];let Za=null,Vn=0;const kf=Promise.resolve();let io=null;function Ot(e){const t=io||kf;return e?t.then(this?e.bind(this):e):t}function Zg(e){let t=la+1,s=us.length;for(;t<s;){const a=t+s>>>1,n=us[a],i=el(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Pc(e){if(!(e.flags&1)){const t=el(e),s=us[us.length-1];!s||!(e.flags&2)&&t>=el(s)?us.push(e):us.splice(Zg(t),0,e),e.flags|=1,Sf()}}function Sf(){io||(io=kf.then(Tf))}function Xi(e){Ae(e)?ti.push(...e):Za&&e.id===-1?Za.splice(Vn+1,0,e):e.flags&1||(ti.push(e),e.flags|=1),Sf()}function zd(e,t,s=la+1){for(;s<us.length;s++){const a=us[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;us.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function lo(e){if(ti.length){const t=[...new Set(ti)].sort((s,a)=>el(s)-el(a));if(ti.length=0,Za){Za.push(...t);return}for(Za=t,Vn=0;Vn<Za.length;Vn++){const s=Za[Vn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Za=null,Vn=0}}const el=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Tf(e){try{for(la=0;la<us.length;la++){const t=us[la];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),xi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;la<us.length;la++){const t=us[la];t&&(t.flags&=-2)}la=-1,us.length=0,lo(),io=null,(us.length||ti.length)&&Tf()}}let qn,Ll=[];function Cf(e,t){var s,a;qn=e,qn?(qn.enabled=!0,Ll.forEach(({event:n,args:i})=>qn.emit(n,...i)),Ll=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Cf(i,t)}),setTimeout(()=>{qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Ll=[])},3e3)):Ll=[]}let Qt=null,Vo=null;function tl(e){const t=Qt;return Qt=e,Vo=e&&e.type.__scopeId||null,t}function Yg(e){Vo=e}function Qg(){Vo=null}const Xg=e=>Mc;function Mc(e,t=Qt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&il(-1);const i=tl(t);let l;try{l=e(...n)}finally{tl(i),a._d&&il(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function eb(e,t){if(Qt===null)return e;const s=kl(Qt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ze]=t[n];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&Ta(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function oa(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Da(),Rs(r,s,8,[e.el,o,e,t]),Pa())}}function zi(e,t){if(Yt){let s=Yt.provides;const a=Yt.parent&&Yt.parent.provides;a===s&&(s=Yt.provides=Object.create(a)),s[e]=t}}function zs(e,t,s=!1){const a=fs();if(a||yn){let n=yn?yn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Fe(t)?t.call(a&&a.proxy):t}}function tb(){return!!(fs()||yn)}const Ef=Symbol.for("v-scx"),Af=()=>zs(Ef);function sb(e,t){return xl(e,null,t)}function ab(e,t){return xl(e,null,{flush:"post"})}function Rf(e,t){return xl(e,null,{flush:"sync"})}function $t(e,t,s){return xl(e,t,s)}function xl(e,t,s=Ze){const{immediate:a,deep:n,flush:i,once:l}=s,o=Je({},s),r=t&&a||!t&&i!=="post";let c;if(Sn){if(i==="sync"){const h=Af();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Xt,h.resume=Xt,h.pause=Xt,h}}const d=Yt;o.call=(h,m,v)=>Rs(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Pt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():Pc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=jg(e,t,o);return Sn&&(c?c.push(p):r&&p()),p}function nb(e,t,s){const a=this.proxy,n=Be(e)?e.includes(".")?If(a,e):()=>a[e]:e.bind(a,a);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=_i(this),o=xl(n,i.bind(a),s);return l(),o}function If(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Ka=new WeakMap,Of=Symbol("_vte"),Lf=e=>e.__isTeleport,hn=e=>e&&(e.disabled||e.disabled===""),ib=e=>e&&(e.defer||e.defer===""),jd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,Vd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,jr=(e,t)=>{const s=e&&e.to;return Be(s)?t?t(s):null:s},lb={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:S,parentNode:L}}=c,b=hn(t.props);let{dynamicChildren:g}=t;const y=(A,T,x)=>{A.shapeFlag&16&&d(A.children,T,x,n,i,l,o,r)},E=(A=t)=>{const T=hn(A.props),x=A.target=jr(A.props,m),N=Vr(x,A,v,h);x&&(l!=="svg"&&jd(x)?l="svg":l!=="mathml"&&Vd(x)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(x),T||(y(A,x,N),Pi(A,!1)))},_=A=>{const T=()=>{if(Ka.get(A)===T){if(Ka.delete(A),hn(A.props)){const x=L(A.el)||s;y(A,x,A.anchor),Pi(A,!0)}E(A)}};Ka.set(A,T),Pt(T,i)};if(e==null){const A=t.el=v(""),T=t.anchor=v("");if(h(A,s,a),h(T,s,a),ib(t.props)||i&&i.pendingBranch){_(t);return}b&&(y(t,s,T),Pi(t,!0)),E()}else{t.el=e.el;const A=t.anchor=e.anchor,T=Ka.get(e);if(T){T.flags|=8,Ka.delete(e),_(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,N=t.targetAnchor=e.targetAnchor,F=hn(e.props),k=F?s:x,P=F?A:N;if(l==="svg"||jd(x)?l="svg":(l==="mathml"||Vd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,k,n,i,l,o),Kc(e,t,!0)):r||u(e,t,k,P,n,i,l,o,!1),b)F?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Nl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const B=t.target=jr(t.props,m);B&&Nl(t,B,null,c,0)}else F&&Nl(t,x,N,c,1);Pi(t,b)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!hn(p),m=Ka.get(e);if(m&&(m.flags|=8,Ka.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let v=0;v<o.length;v++){const S=o[v];a(S,t,s,h,!!S.dynamicChildren)}},move:Nl,hydrate:ob};function Nl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Ka.has(e)&&(!u||hn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function ob(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(S,L){let b=L;for(;b;){if(b&&b.nodeType===8){if(b.data==="teleport start anchor")t.targetStart=b;else if(b.data==="teleport anchor"){t.targetAnchor=b,S._lpa=t.targetAnchor&&l(t.targetAnchor);break}}b=l(b)}}function h(S,L){L.anchor=u(l(S),L,o(S),s,a,n,i)}const m=t.target=jr(t.props,r),v=hn(t.props);if(m){const S=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,S),t.targetAnchor||Vr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,S),t.targetAnchor||Vr(m,t,d,c),u(S&&l(S),t,m,s,a,n,i))),Pi(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const rb=lb;function Pi(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function Vr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Of]=l,e&&(a(i,e,n),a(l,e,n)),l}const $s=Symbol("_leaveCb"),Ti=Symbol("_enterCb");function Fc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Wo(()=>{e.isUnmounting=!0}),e}const Fs=[Function,Array],$c={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Fs,onEnter:Fs,onAfterEnter:Fs,onEnterCancelled:Fs,onBeforeLeave:Fs,onLeave:Fs,onAfterLeave:Fs,onLeaveCancelled:Fs,onBeforeAppear:Fs,onAppear:Fs,onAfterAppear:Fs,onAppearCancelled:Fs},Nf=e=>{const t=e.subTree;return t.component?Nf(t.component):t},cb={name:"BaseTransition",props:$c,setup(e,{slots:t}){const s=fs(),a=Fc();return()=>{const n=t.default&&qo(t.default(),!0),i=n&&n.length?Df(n):s.subTree?vh():void 0;if(!i)return;const l=st(e),{mode:o}=l;if(a.isLeaving)return mr(i);const r=qd(i);if(!r)return mr(i);let c=ri(r,l,a,s,u=>c=u);r.type!==Lt&&Ma(r,c);let d=s.subTree&&qd(s.subTree);if(d&&d.type!==Lt&&!Ws(d,r)&&Nf(s).type!==Lt){let u=ri(d,l,a,s);if(Ma(d,u),o==="out-in"&&r.type!==Lt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},mr(i);o==="in-out"&&r.type!==Lt?u.delayLeave=(p,h,m)=>{const v=Mf(a,d);v[String(d.key)]=d,p[$s]=()=>{h(),p[$s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Df(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Lt){t=s;break}}return t}const Pf=cb;function Mf(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function ri(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:S,onAppear:L,onAfterAppear:b,onAppearCancelled:g}=t,y=String(e.key),E=Mf(s,e),_=(x,N)=>{x&&Rs(x,a,9,N)},A=(x,N)=>{const F=N[1];_(x,N),Ae(x)?x.every(k=>k.length<=1)&&F():x.length<=1&&F()},T={mode:l,persisted:o,beforeEnter(x){let N=r;if(!s.isMounted)if(i)N=S||r;else return;x[$s]&&x[$s](!0);const F=E[y];F&&Ws(e,F)&&F.el[$s]&&F.el[$s](),_(N,[x])},enter(x){if(E[y]===e)return;let N=c,F=d,k=u;if(!s.isMounted)if(i)N=L||c,F=b||d,k=g||u;else return;let P=!1;x[Ti]=K=>{P||(P=!0,K?_(k,[x]):_(F,[x]),T.delayedLeave&&T.delayedLeave(),x[Ti]=void 0)};const B=x[Ti].bind(null,!1);N?A(N,[x,B]):B()},leave(x,N){const F=String(e.key);if(x[Ti]&&x[Ti](!0),s.isUnmounting)return N();_(p,[x]);let k=!1;x[$s]=B=>{k||(k=!0,N(),B?_(v,[x]):_(m,[x]),x[$s]=void 0,E[F]===e&&delete E[F])};const P=x[$s].bind(null,!1);E[F]=e,h?A(h,[x,P]):P()},clone(x){const N=ri(x,t,s,a,n);return n&&n(N),N}};return T}function mr(e){if(wl(e))return e=ua(e),e.children=null,e}function qd(e){if(!wl(e))return Lf(e.type)&&e.children?Df(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function Ma(e,t){e.shapeFlag&6&&e.component?(e.transition=t,Ma(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function qo(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&n++,a=a.concat(qo(l.children,t,o))):(t||l.type!==Lt)&&a.push(o!=null?ua(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function _l(e,t){return Fe(e)?Je({name:e.name},t,{setup:e}):e}function db(){const e=fs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Uc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function ub(e){const t=fs(),s=Nc(null);if(t){const n=t.refs===Ze?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function Gd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const oo=new WeakMap;function si(e,t,s,a,n=!1){if(Ae(e)){e.forEach((v,S)=>si(v,t&&(Ae(t)?t[S]:t),s,a,n));return}if(Oa(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&si(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?kl(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ze?o.refs={}:o.refs,u=o.setupState,p=st(u),h=u===Ze?Wn:v=>Gd(d,v)?!1:rt(p,v),m=(v,S)=>!(S&&Gd(d,S));if(c!=null&&c!==r){if(Kd(t),Be(c))d[c]=null,h(c)&&(u[c]=null);else if(Ft(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(r))xi(r,o,12,[l,d]);else{const v=Be(r),S=Ft(r);if(v||S){const L=()=>{if(e.f){const b=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Ae(b)&&Cc(b,i);else if(Ae(b))b.includes(i)||b.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):S&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const b=()=>{L(),oo.delete(e)};b.id=-1,oo.set(e,b),Pt(b,s)}else Kd(e),L()}}}function Kd(e){const t=oo.get(e);t&&(t.flags|=8,oo.delete(e))}let Wd=!1;const Un=()=>{Wd||(console.error("Hydration completed but contains mismatches."),Wd=!0)},pb=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",fb=e=>e.namespaceURI.includes("MathML"),Dl=e=>{if(e.nodeType===1){if(pb(e))return"svg";if(fb(e))return"mathml"}},Jn=e=>e.nodeType===8;function hb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,y)=>{if(!y.hasChildNodes()){s(null,g,y),lo(),y._vnode=g;return}u(y.firstChild,g,null,null,null),lo(),y._vnode=g},u=(g,y,E,_,A,T=!1)=>{T=T||!!y.dynamicChildren;const x=Jn(g)&&g.data==="[",N=()=>v(g,y,E,_,A,x),{type:F,ref:k,shapeFlag:P,patchFlag:B}=y;let K=g.nodeType;y.el=g,B===-2&&(T=!1,y.dynamicChildren=null);let C=null;switch(F){case en:K!==3?y.children===""?(r(y.el=n(""),l(g),g),C=g):C=N():(g.data!==y.children&&(Un(),g.data=y.children),C=i(g));break;case Lt:b(g)?(C=i(g),L(y.el=g.content.firstChild,g,E)):K!==8||x?C=N():C=i(g);break;case xn:if(x&&(g=i(g),K=g.nodeType),K===1||K===3){C=g;const I=!y.children.length;for(let O=0;O<y.staticCount;O++)I&&(y.children+=C.nodeType===1?C.outerHTML:C.data),O===y.staticCount-1&&(y.anchor=C),C=i(C);return x?i(C):C}else N();break;case Gt:x?C=m(g,y,E,_,A,T):C=N();break;default:if(P&1)(K!==1||y.type.toLowerCase()!==g.tagName.toLowerCase())&&!b(g)?C=N():C=p(g,y,E,_,A,T);else if(P&6){y.slotScopeIds=A;const I=l(g);if(x?C=S(g):Jn(g)&&g.data==="teleport start"?C=S(g,g.data,"teleport end"):C=i(g),t(y,I,null,E,_,Dl(I),T),Oa(y)&&!y.type.__asyncResolved){let O;x?(O=_t(Gt),O.anchor=C?C.previousSibling:I.lastChild):O=g.nodeType===3?Jc(""):_t("div"),O.el=g,y.component.subTree=O}}else P&64?K!==8?C=N():C=y.type.hydrate(g,y,E,_,A,T,e,h):P&128&&(C=y.type.hydrate(g,y,E,_,Dl(l(g)),A,T,e,u))}return k!=null&&si(k,null,_,y),C},p=(g,y,E,_,A,T)=>{T=T||!!y.dynamicChildren;const{type:x,props:N,patchFlag:F,shapeFlag:k,dirs:P,transition:B}=y,K=x==="input"||x==="option";if(K||F!==-1){P&&oa(y,null,E,"created");let C=!1;if(b(g)){C=oh(null,B)&&E&&E.vnode.props&&E.vnode.props.appear;const O=g.content.firstChild;if(C){const $=O.getAttribute("class");$&&(O.$cls=$),B.beforeEnter(O)}L(O,g,E),y.el=g=O}if(k&16&&!(N&&(N.innerHTML||N.textContent))){let O=h(g.firstChild,y,g,E,_,A,T);for(O&&!Pl(g,1)&&Un();O;){const $=O;O=O.nextSibling,o($)}}else if(k&8){let O=y.children;O[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(O=O.slice(1));const{textContent:$}=g;$!==O&&$!==O.replace(/\r\n|\r/g,`
`)&&(Pl(g,0)||Un(),g.textContent=y.children)}if(N){if(K||!T||F&48){const O=g.tagName.includes("-");for(const $ in N)(K&&($.endsWith("value")||$==="indeterminate")||En($)&&!Ra($)||$[0]==="."||O&&!Ra($))&&a(g,$,null,N[$],void 0,E)}else if(N.onClick)a(g,"onClick",null,N.onClick,void 0,E);else if(F&4&&Ia(N.style))for(const O in N.style)N.style[O]}let I;(I=N&&N.onVnodeBeforeMount)&&ys(I,E,y),P&&oa(y,null,E,"beforeMount"),((I=N&&N.onVnodeMounted)||P||C)&&uh(()=>{I&&ys(I,E,y),C&&B.enter(g),P&&oa(y,null,E,"mounted")},_)}return g.nextSibling},h=(g,y,E,_,A,T,x)=>{x=x||!!y.dynamicChildren;const N=y.children,F=N.length;let k=!1;for(let P=0;P<F;P++){const B=x?N[P]:N[P]=_s(N[P]),K=B.type===en;g?(K&&!x&&P+1<F&&_s(N[P+1]).type===en&&(r(n(g.data.slice(B.children.length)),E,i(g)),g.data=B.children),g=u(g,B,_,A,T,x)):K&&!B.children?r(B.el=n(""),E):(k||(k=!0,Pl(E,1)||Un()),s(null,B,E,null,_,A,Dl(E),T))}return g},m=(g,y,E,_,A,T)=>{const{slotScopeIds:x}=y;x&&(A=A?A.concat(x):x);const N=l(g),F=h(i(g),y,N,E,_,A,T);return F&&Jn(F)&&F.data==="]"?i(y.anchor=F):(Un(),r(y.anchor=c("]"),N,F),F)},v=(g,y,E,_,A,T)=>{if(Pl(g.parentElement,1)||Un(),y.el=null,T){const F=S(g);for(;;){const k=i(g);if(k&&k!==F)o(k);else break}}const x=i(g),N=l(g);return o(g),s(null,y,N,x,E,_,Dl(N),A),E&&(E.vnode.el=y.el,Zo(E,y.el)),x},S=(g,y="[",E="]")=>{let _=0;for(;g;)if(g=i(g),g&&Jn(g)&&(g.data===y&&_++,g.data===E)){if(_===0)return i(g);_--}return g},L=(g,y,E)=>{const _=y.parentNode;_&&_.replaceChild(g,y);let A=E;for(;A;)A.vnode.el===y&&(A.vnode.el=A.subTree.el=g),A=A.parent},b=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Jd="data-allow-mismatch",mb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Pl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Jd);)e=e.parentElement;const s=e&&e.getAttribute(Jd);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(mb[t])}}const vb=$o().requestIdleCallback||(e=>setTimeout(e,1)),gb=$o().cancelIdleCallback||(e=>clearTimeout(e)),bb=(e=1e4)=>t=>{const s=vb(t,{timeout:e});return()=>gb(s)};function yb(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const xb=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(yb(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},_b=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},wb=(e=[])=>(t,s)=>{Be(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function kb(e,t){if(Jn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Jn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Oa=e=>!!e.type.__asyncLoader;function Sb(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((S,L)=>{r(v,()=>S(p()),()=>L(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return _l({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,S){let L=!1;(v.bu||(v.bu=[])).push(()=>L=!0);const b=()=>{L||S()},g=i?()=>{const y=i(b,E=>kb(m,E));y&&(v.bum||(v.bum=[])).push(y)}:b;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Yt;if(Uc(m),d)return()=>Ml(d,m);const v=E=>{c=null,In(E,m,13,!a)};if(o&&m.suspense||Sn)return h().then(E=>()=>Ml(E,m)).catch(E=>(v(E),()=>a?_t(a,{error:E}):null));const S=f(!1),L=f(),b=f(!!n);let g,y;return mt(()=>{g!=null&&clearTimeout(g),y!=null&&clearTimeout(y)}),n&&(y=setTimeout(()=>{m.isUnmounted||(b.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!S.value&&!L.value){const E=new Error(`Async component timed out after ${l}ms.`);v(E),L.value=E}},l)),h().then(()=>{m.isUnmounted||(S.value=!0,m.parent&&wl(m.parent.vnode)&&m.parent.update())}).catch(E=>{if(m.isUnmounted){c=null;return}v(E),L.value=E}),()=>{if(S.value&&d)return Ml(d,m);if(L.value&&a)return _t(a,{error:L.value});if(s&&!b.value)return Ml(s,m)}}})}function Ml(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=_t(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const wl=e=>e.type.__isKeepAlive,Tb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=fs(),a=s.ctx;if(!a.renderer)return()=>{const b=t.default&&t.default();return b&&b.length===1?b[0]:b};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(b,g,y,E,_)=>{const A=b.component;c(b,g,y,0,o),r(A.vnode,b,g,y,A,o,E,b.slotScopeIds,_),Pt(()=>{A.isDeactivated=!1,A.a&&ei(A.a);const T=b.props&&b.props.onVnodeMounted;T&&ys(T,A.parent,b)},o)},a.deactivate=b=>{const g=b.component;co(g.m),co(g.a),c(b,p,null,1,o),Pt(()=>{g.da&&ei(g.da);const y=b.props&&b.props.onVnodeUnmounted;y&&ys(y,g.parent,b),g.isDeactivated=!0},o)};function h(b){vr(b),d(b,s,o,!0)}function m(b){n.forEach((g,y)=>{const E=Xr(Oa(g)?g.type.__asyncResolved||{}:g.type);E&&!b(E)&&v(y)})}function v(b){const g=n.get(b);g&&(!l||!Ws(g,l))?h(g):l&&vr(l),n.delete(b),i.delete(b)}$t(()=>[e.include,e.exclude],([b,g])=>{b&&m(y=>Mi(b,y)),g&&m(y=>!Mi(g,y))},{flush:"post",deep:!0});let S=null;const L=()=>{S!=null&&(uo(s.subTree.type)?Pt(()=>{n.set(S,Fl(s.subTree))},s.subTree.suspense):n.set(S,Fl(s.subTree)))};return Ge(L),Ko(L),Wo(()=>{n.forEach(b=>{const{subTree:g,suspense:y}=s,E=Fl(g);if(b.type===E.type&&b.key===E.key){vr(E);const _=E.component.da;_&&Pt(_,y);return}h(b)})}),()=>{if(S=null,!t.default)return l=null;const b=t.default(),g=b[0];if(b.length>1)return l=null,b;if(!Fa(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let y=Fl(g);if(y.type===Lt)return l=null,y;const E=y.type,_=Xr(Oa(y)?y.type.__asyncResolved||{}:E),{include:A,exclude:T,max:x}=e;if(A&&(!_||!Mi(A,_))||T&&_&&Mi(T,_))return y.shapeFlag&=-257,l=y,g;const N=y.key==null?E:y.key,F=n.get(N);return y.el&&(y=ua(y),g.shapeFlag&128&&(g.ssContent=y)),S=N,F?(y.el=F.el,y.component=F.component,y.transition&&Ma(y,y.transition),y.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),y.shapeFlag|=256,l=y,uo(g.type)?g:y}}},Cb=Tb;function Mi(e,t){return Ae(e)?e.some(s=>Mi(s,t)):Be(e)?e.split(",").includes(t):Mv(e)?(e.lastIndex=0,e.test(t)):!1}function es(e,t){Ff(e,"a",t)}function Wt(e,t){Ff(e,"da",t)}function Ff(e,t,s=Yt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Go(t,a,s),s){let n=s.parent;for(;n&&n.parent;)wl(n.parent.vnode)&&Eb(a,t,s,n),n=n.parent}}function Eb(e,t,s,a){const n=Go(t,e,a,!0);mt(()=>{Cc(a[t],n)},s)}function vr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Fl(e){return e.shapeFlag&128?e.ssContent:e}function Go(e,t,s=Yt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Da();const o=_i(s),r=Rs(t,s,e,l);return o(),Pa(),r});return a?n.unshift(i):n.push(i),i}}const $a=e=>(t,s=Yt)=>{(!Sn||e==="sp")&&Go(e,(...a)=>t(...a),s)},$f=$a("bm"),Ge=$a("m"),Bc=$a("bu"),Ko=$a("u"),Wo=$a("bum"),mt=$a("um"),Uf=$a("sp"),Bf=$a("rtg"),Hf=$a("rtc");function zf(e,t=Yt){Go("ec",e,t)}const Hc="components",Ab="directives";function Rb(e,t){return zc(Hc,e,!0,t)||e}const jf=Symbol.for("v-ndc");function Ib(e){return Be(e)?zc(Hc,e,!1)||e:e||jf}function Ob(e){return zc(Ab,e)}function zc(e,t,s=!0,a=!1){const n=Qt||Yt;if(n){const i=n.type;if(e===Hc){const o=Xr(i,!1);if(o&&(o===t||o===ht(t)||o===Rn(ht(t))))return i}const l=Zd(n[e]||i[e],t)||Zd(n.appContext[e],t);return!l&&a?i:l}}function Zd(e,t){return e&&(e[t]||e[ht(t)]||e[Rn(ht(t))])}function Lb(e,t,s,a){let n;const i=s&&s[a],l=Ae(e);if(l||Be(e)){const o=l&&Ia(e);let r=!1,c=!1;o&&(r=!Ss(e),c=da(e),e=Ho(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?oi(Ys(e[d])):Ys(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(lt(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Nb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Ae(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Db(e,t,s={},a,n){if(Qt.ce||Qt.parent&&Oa(Qt.parent)&&Qt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),nl(),po(Gt,null,[_t("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),nl();const l=i&&jc(i(s)),o=s.key||l&&l.key,r=po(Gt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function jc(e){return e.some(t=>Fa(t)?!(t.type===Lt||t.type===Gt&&!jc(t.children)):!0)?e:null}function Pb(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Xn(a)]=e[a];return s}const qr=e=>e?yh(e)?kl(e):qr(e.parent):null,ji=Je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>qr(e.parent),$root:e=>qr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Vc(e),$forceUpdate:e=>e.f||(e.f=()=>{Pc(e.update)}),$nextTick:e=>e.n||(e.n=Ot.bind(e.proxy)),$watch:e=>nb.bind(e)}),gr=(e,t)=>e!==Ze&&!e.__isScriptSetup&&rt(e,t),Gr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(gr(a,t))return l[t]=1,a[t];if(n!==Ze&&rt(n,t))return l[t]=2,n[t];if(rt(i,t))return l[t]=3,i[t];if(s!==Ze&&rt(s,t))return l[t]=4,s[t];Kr&&(l[t]=0)}}const c=ji[t];let d,u;if(c)return t==="$attrs"&&ns(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ze&&rt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,rt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return gr(n,t)?(n[t]=s,!0):a!==Ze&&rt(a,t)?(a[t]=s,!0):rt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ze&&o[0]!=="$"&&rt(e,o)||gr(t,o)||rt(i,o)||rt(a,o)||rt(ji,o)||rt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:rt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Mb=Je({},Gr,{get(e,t){if(t!==Symbol.unscopables)return Gr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!jv(t)}});function Fb(){return null}function $b(){return null}function Ub(e){}function Bb(e){}function Hb(){return null}function zb(){}function jb(e,t){return null}function Vb(){return Vf().slots}function qb(){return Vf().attrs}function Vf(e){const t=fs();return t.setupContext||(t.setupContext=kh(t))}function sl(e){return Ae(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Gb(e,t){const s=sl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Ae(n)||Fe(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function Kb(e,t){return!e||!t?e||t:Ae(e)&&Ae(t)?e.concat(t):Je({},sl(e),sl(t))}function Wb(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Jb(e){const t=fs(),s=Sn;let a=e();ll(),s&&ni(!1);const n=()=>{_i(t),s&&ni(!0)},i=()=>{fs()!==t&&t.scope.off(),ll(),s&&ni(!1)};return Ec(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Kr=!0;function Zb(e){const t=Vc(e),s=e.proxy,a=e.ctx;Kr=!1,t.beforeCreate&&Yd(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:S,beforeDestroy:L,beforeUnmount:b,destroyed:g,unmounted:y,render:E,renderTracked:_,renderTriggered:A,errorCaptured:T,serverPrefetch:x,expose:N,inheritAttrs:F,components:k,directives:P,filters:B}=t;if(c&&Yb(c,a,null),l)for(const I in l){const O=l[I];Fe(O)&&(a[I]=O.bind(s))}if(n){const I=n.call(s,s);lt(I)&&(e.data=an(I))}if(Kr=!0,i)for(const I in i){const O=i[I],$=Fe(O)?O.bind(s,s):Fe(O.get)?O.get.bind(s,s):Xt,Q=!Fe(O)&&Fe(O.set)?O.set.bind(s):Xt,G=V({get:$,set:Q});Object.defineProperty(a,I,{enumerable:!0,configurable:!0,get:()=>G.value,set:X=>G.value=X})}if(o)for(const I in o)qf(o[I],a,s,I);if(r){const I=Fe(r)?r.call(s):r;Reflect.ownKeys(I).forEach(O=>{zi(O,I[O])})}d&&Yd(d,e,"c");function C(I,O){Ae(O)?O.forEach($=>I($.bind(s))):O&&I(O.bind(s))}if(C($f,u),C(Ge,p),C(Bc,h),C(Ko,m),C(es,v),C(Wt,S),C(zf,T),C(Hf,_),C(Bf,A),C(Wo,b),C(mt,y),C(Uf,x),Ae(N))if(N.length){const I=e.exposed||(e.exposed={});N.forEach(O=>{Object.defineProperty(I,O,{get:()=>s[O],set:$=>s[O]=$,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===Xt&&(e.render=E),F!=null&&(e.inheritAttrs=F),k&&(e.components=k),P&&(e.directives=P),x&&Uc(e)}function Yb(e,t,s=Xt){Ae(e)&&(e=Wr(e));for(const a in e){const n=e[a];let i;lt(n)?"default"in n?i=zs(n.from||a,n.default,!0):i=zs(n.from||a):i=zs(n),Ft(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function Yd(e,t,s){Rs(Ae(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function qf(e,t,s,a){let n=a.includes(".")?If(s,a):()=>s[a];if(Be(e)){const i=t[e];Fe(i)&&$t(n,i)}else if(Fe(e))$t(n,e.bind(s));else if(lt(e))if(Ae(e))e.forEach(i=>qf(i,t,s,a));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&$t(n,i,e)}}function Vc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>ro(r,c,l,!0)),ro(r,t,l)),lt(t)&&i.set(t,r),r}function ro(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&ro(e,i,s,!0),n&&n.forEach(l=>ro(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Qb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Qb={data:Qd,props:Xd,emits:Xd,methods:Fi,computed:Fi,beforeCreate:rs,created:rs,beforeMount:rs,mounted:rs,beforeUpdate:rs,updated:rs,beforeDestroy:rs,beforeUnmount:rs,destroyed:rs,unmounted:rs,activated:rs,deactivated:rs,errorCaptured:rs,serverPrefetch:rs,components:Fi,directives:Fi,watch:ey,provide:Qd,inject:Xb};function Qd(e,t){return t?e?function(){return Je(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function Xb(e,t){return Fi(Wr(e),Wr(t))}function Wr(e){if(Ae(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function rs(e,t){return e?[...new Set([].concat(e,t))]:t}function Fi(e,t){return e?Je(Object.create(null),e,t):t}function Xd(e,t){return e?Ae(e)&&Ae(t)?[...new Set([...e,...t])]:Je(Object.create(null),sl(e),sl(t??{})):t}function ey(e,t){if(!e)return t;if(!t)return e;const s=Je(Object.create(null),e);for(const a in t)s[a]=rs(e[a],t[a]);return s}function Gf(){return{app:null,config:{isNativeTag:Wn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let ty=0;function sy(e,t){return function(a,n=null){Fe(a)||(a=Je({},a)),n!=null&&!lt(n)&&(n=null);const i=Gf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:ty++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Th,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||_t(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,kl(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Rs(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=yn;yn=c;try{return d()}finally{yn=u}}};return c}}let yn=null;function ay(e,t,s=Ze){const a=fs(),n=ht(t),i=ws(t),l=Kf(e,n),o=yf((r,c)=>{let d,u=Ze,p;return Rf(()=>{const h=e[n];qt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!qt(m,d)&&!(u!==Ze&&qt(h,u)))return;const v=a.vnode.props,S=!!(v&&(t in v||n in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${n}`in v||`onUpdate:${i}`in v));S||(d=h,c()),a.emit(`update:${t}`,m),qt(h,u)&&(qt(h,m)&&!qt(m,p)||S&&u!==Ze&&!qt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ze:o,done:!1}:{done:!0}}}},o}const Kf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ht(t)}Modifiers`]||e[`${ws(t)}Modifiers`];function ny(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ze;let n=s;const i=t.startsWith("update:"),l=i&&Kf(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>Be(d)?d.trim():d)),l.number&&(n=s.map(Fo)));let o,r=a[o=Xn(t)]||a[o=Xn(ht(t))];!r&&i&&(r=a[o=Xn(ws(t))]),r&&Rs(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Rs(c,e,6,n)}}const iy=new WeakMap;function Wf(e,t,s=!1){const a=s?iy:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Fe(e)){const r=c=>{const d=Wf(c,t,!0);d&&(o=!0,Je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(lt(e)&&a.set(e,null),null):(Ae(i)?i.forEach(r=>l[r]=null):Je(l,i),lt(e)&&a.set(e,l),l)}function Jo(e,t){return!e||!En(t)?!1:(t=t.slice(2).replace(/Once$/,""),rt(e,t[0].toLowerCase()+t.slice(1))||rt(e,ws(t))||rt(e,t))}function Wl(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,S=tl(e);let L,b;try{if(s.shapeFlag&4){const y=n||a,E=y;L=_s(c.call(E,y,d,u,h,p,m)),b=o}else{const y=t;L=_s(y.length>1?y(u,{attrs:o,slots:l,emit:r}):y(u,null)),b=t.props?o:oy(o)}}catch(y){Vi.length=0,In(y,e,1),L=_t(Lt)}let g=L;if(b&&v!==!1){const y=Object.keys(b),{shapeFlag:E}=g;y.length&&E&7&&(i&&y.some(No)&&(b=ry(b,i)),g=ua(g,b,!1,!0))}return s.dirs&&(g=ua(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&Ma(g,s.transition),L=g,tl(S),L}function ly(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(Fa(n)){if(n.type!==Lt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const oy=e=>{let t;for(const s in e)(s==="class"||s==="style"||En(s))&&((t||(t={}))[s]=e[s]);return t},ry=(e,t)=>{const s={};for(const a in e)(!No(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function cy(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?eu(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Jf(l,a,p)&&!Jo(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?eu(a,l,c):!0:!!l;return!1}function eu(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(Jf(t,e,i)&&!Jo(s,i))return!0}return!1}function Jf(e,t,s){const a=e[s],n=t[s];return s==="style"&&lt(a)&&lt(n)?!Na(a,n):a!==n}function Zo({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const Zf={},Yf=()=>Object.create(Zf),Qf=e=>Object.getPrototypeOf(e)===Zf;function dy(e,t,s,a=!1){const n={},i=Yf();e.propsDefaults=Object.create(null),Xf(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Lc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function uy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=st(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Jo(e.emitsOptions,p))continue;const h=t[p];if(r)if(rt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=ht(p);n[m]=Jr(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{Xf(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!rt(t,u)&&((d=ws(u))===u||!rt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=Jr(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!rt(t,u))&&(delete i[u],c=!0)}c&&Sa(e.attrs,"set","")}function Xf(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Ra(r))continue;const c=t[r];let d;n&&rt(n,d=ht(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Jo(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=st(s),c=o||Ze;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Jr(n,r,u,c[u],e,!rt(c,u))}}return l}function Jr(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=rt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=_i(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===ws(s))&&(a=!0))}return a}const py=new WeakMap;function eh(e,t,s=!1){const a=s?py:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Fe(e)){const d=u=>{r=!0;const[p,h]=eh(u,t,!0);Je(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return lt(e)&&a.set(e,Yn),Yn;if(Ae(i))for(let d=0;d<i.length;d++){const u=ht(i[d]);tu(u)&&(l[u]=Ze)}else if(i)for(const d in i){const u=ht(d);if(tu(u)){const p=i[d],h=l[u]=Ae(p)||Fe(p)?{type:p}:Je({},p),m=h.type;let v=!1,S=!0;if(Ae(m))for(let L=0;L<m.length;++L){const b=m[L],g=Fe(b)&&b.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(S=!1)}else v=Fe(m)&&m.name==="Boolean";h[0]=v,h[1]=S,(v||rt(h,"default"))&&o.push(u)}}const c=[l,o];return lt(e)&&a.set(e,c),c}function tu(e){return e[0]!=="$"&&!Ra(e)}const qc=e=>e==="_"||e==="_ctx"||e==="$stable",Gc=e=>Ae(e)?e.map(_s):[_s(e)],fy=(e,t,s)=>{if(t._n)return t;const a=Mc((...n)=>Gc(t(...n)),s);return a._c=!1,a},th=(e,t,s)=>{const a=e._ctx;for(const n in e){if(qc(n))continue;const i=e[n];if(Fe(i))t[n]=fy(n,i,a);else if(i!=null){const l=Gc(i);t[n]=()=>l}}},sh=(e,t)=>{const s=Gc(t);e.slots.default=()=>s},ah=(e,t,s)=>{for(const a in t)(s||!qc(a))&&(e[a]=t[a])},hy=(e,t,s)=>{const a=e.slots=Yf();if(e.vnode.shapeFlag&32){const n=t._;n?(ah(a,t,s),s&&Wp(a,"_",n,!0)):th(t,a)}else t&&sh(e,t)},my=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ze;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:ah(n,t,s):(i=!t.$stable,th(t,n)),l=t}else t&&(sh(e,t),l={default:1});if(i)for(const o in n)!qc(o)&&l[o]==null&&delete n[o]},Pt=uh;function nh(e){return lh(e)}function ih(e){return lh(e,hb)}function lh(e,t){const s=$o();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Xt,insertStaticContent:m}=e,v=(w,M,z,ce=null,ie=null,le=null,me=void 0,H=null,ee=!!M.dynamicChildren)=>{if(w===M)return;w&&!Ws(w,M)&&(ce=ae(w),X(w,ie,le,!0),w=null),M.patchFlag===-2&&(ee=!1,M.dynamicChildren=null);const{type:Y,ref:fe,shapeFlag:pe}=M;switch(Y){case en:S(w,M,z,ce);break;case Lt:L(w,M,z,ce);break;case xn:w==null&&b(M,z,ce,me);break;case Gt:k(w,M,z,ce,ie,le,me,H,ee);break;default:pe&1?E(w,M,z,ce,ie,le,me,H,ee):pe&6?P(w,M,z,ce,ie,le,me,H,ee):(pe&64||pe&128)&&Y.process(w,M,z,ce,ie,le,me,H,ee,de)}fe!=null&&ie?si(fe,w&&w.ref,le,M||w,!M):fe==null&&w&&w.ref!=null&&si(w.ref,null,le,w,!0)},S=(w,M,z,ce)=>{if(w==null)a(M.el=o(M.children),z,ce);else{const ie=M.el=w.el;M.children!==w.children&&c(ie,M.children)}},L=(w,M,z,ce)=>{w==null?a(M.el=r(M.children||""),z,ce):M.el=w.el},b=(w,M,z,ce)=>{[w.el,w.anchor]=m(w.children,M,z,ce,w.el,w.anchor)},g=({el:w,anchor:M},z,ce)=>{let ie;for(;w&&w!==M;)ie=p(w),a(w,z,ce),w=ie;a(M,z,ce)},y=({el:w,anchor:M})=>{let z;for(;w&&w!==M;)z=p(w),n(w),w=z;n(M)},E=(w,M,z,ce,ie,le,me,H,ee)=>{if(M.type==="svg"?me="svg":M.type==="math"&&(me="mathml"),w==null)_(M,z,ce,ie,le,me,H,ee);else{const Y=w.el&&w.el._isVueCE?w.el:null;try{Y&&Y._beginPatch(),x(w,M,ie,le,me,H,ee)}finally{Y&&Y._endPatch()}}},_=(w,M,z,ce,ie,le,me,H)=>{let ee,Y;const{props:fe,shapeFlag:pe,transition:ye,dirs:Re}=w;if(ee=w.el=l(w.type,le,fe&&fe.is,fe),pe&8?d(ee,w.children):pe&16&&T(w.children,ee,null,ce,ie,br(w,le),me,H),Re&&oa(w,null,ce,"created"),A(ee,w,w.scopeId,me,ce),fe){for(const He in fe)He!=="value"&&!Ra(He)&&i(ee,He,null,fe[He],le,ce);"value"in fe&&i(ee,"value",null,fe.value,le),(Y=fe.onVnodeBeforeMount)&&ys(Y,ce,w)}Re&&oa(w,null,ce,"beforeMount");const ve=oh(ie,ye);ve&&ye.beforeEnter(ee),a(ee,M,z),((Y=fe&&fe.onVnodeMounted)||ve||Re)&&Pt(()=>{try{Y&&ys(Y,ce,w),ve&&ye.enter(ee),Re&&oa(w,null,ce,"mounted")}finally{}},ie)},A=(w,M,z,ce,ie)=>{if(z&&h(w,z),ce)for(let le=0;le<ce.length;le++)h(w,ce[le]);if(ie){let le=ie.subTree;if(M===le||uo(le.type)&&(le.ssContent===M||le.ssFallback===M)){const me=ie.vnode;A(w,me,me.scopeId,me.slotScopeIds,ie.parent)}}},T=(w,M,z,ce,ie,le,me,H,ee=0)=>{for(let Y=ee;Y<w.length;Y++){const fe=w[Y]=H?wa(w[Y]):_s(w[Y]);v(null,fe,M,z,ce,ie,le,me,H)}},x=(w,M,z,ce,ie,le,me)=>{const H=M.el=w.el;let{patchFlag:ee,dynamicChildren:Y,dirs:fe}=M;ee|=w.patchFlag&16;const pe=w.props||Ze,ye=M.props||Ze;let Re;if(z&&cn(z,!1),(Re=ye.onVnodeBeforeUpdate)&&ys(Re,z,M,w),fe&&oa(M,w,z,"beforeUpdate"),z&&cn(z,!0),(pe.innerHTML&&ye.innerHTML==null||pe.textContent&&ye.textContent==null)&&d(H,""),Y?N(w.dynamicChildren,Y,H,z,ce,br(M,ie),le):me||O(w,M,H,null,z,ce,br(M,ie),le,!1),ee>0){if(ee&16)F(H,pe,ye,z,ie);else if(ee&2&&pe.class!==ye.class&&i(H,"class",null,ye.class,ie),ee&4&&i(H,"style",pe.style,ye.style,ie),ee&8){const ve=M.dynamicProps;for(let He=0;He<ve.length;He++){const Pe=ve[He],ze=pe[Pe],Ye=ye[Pe];(Ye!==ze||Pe==="value")&&i(H,Pe,ze,Ye,ie,z)}}ee&1&&w.children!==M.children&&d(H,M.children)}else!me&&Y==null&&F(H,pe,ye,z,ie);((Re=ye.onVnodeUpdated)||fe)&&Pt(()=>{Re&&ys(Re,z,M,w),fe&&oa(M,w,z,"updated")},ce)},N=(w,M,z,ce,ie,le,me)=>{for(let H=0;H<M.length;H++){const ee=w[H],Y=M[H],fe=ee.el&&(ee.type===Gt||!Ws(ee,Y)||ee.shapeFlag&198)?u(ee.el):z;v(ee,Y,fe,null,ce,ie,le,me,!0)}},F=(w,M,z,ce,ie)=>{if(M!==z){if(M!==Ze)for(const le in M)!Ra(le)&&!(le in z)&&i(w,le,M[le],null,ie,ce);for(const le in z){if(Ra(le))continue;const me=z[le],H=M[le];me!==H&&le!=="value"&&i(w,le,H,me,ie,ce)}"value"in z&&i(w,"value",M.value,z.value,ie)}},k=(w,M,z,ce,ie,le,me,H,ee)=>{const Y=M.el=w?w.el:o(""),fe=M.anchor=w?w.anchor:o("");let{patchFlag:pe,dynamicChildren:ye,slotScopeIds:Re}=M;Re&&(H=H?H.concat(Re):Re),w==null?(a(Y,z,ce),a(fe,z,ce),T(M.children||[],z,fe,ie,le,me,H,ee)):pe>0&&pe&64&&ye&&w.dynamicChildren&&w.dynamicChildren.length===ye.length?(N(w.dynamicChildren,ye,z,ie,le,me,H),(M.key!=null||ie&&M===ie.subTree)&&Kc(w,M,!0)):O(w,M,z,fe,ie,le,me,H,ee)},P=(w,M,z,ce,ie,le,me,H,ee)=>{M.slotScopeIds=H,w==null?M.shapeFlag&512?ie.ctx.activate(M,z,ce,me,ee):B(M,z,ce,ie,le,me,ee):K(w,M,ee)},B=(w,M,z,ce,ie,le,me)=>{const H=w.component=bh(w,ce,ie);if(wl(w)&&(H.ctx.renderer=de),xh(H,!1,me),H.asyncDep){if(ie&&ie.registerDep(H,C,me),!w.el){const ee=H.subTree=_t(Lt);L(null,ee,M,z),w.placeholder=ee.el}}else C(H,w,M,z,ie,le,me)},K=(w,M,z)=>{const ce=M.component=w.component;if(cy(w,M,z))if(ce.asyncDep&&!ce.asyncResolved){I(ce,M,z);return}else ce.next=M,ce.update();else M.el=w.el,ce.vnode=M},C=(w,M,z,ce,ie,le,me)=>{const H=()=>{if(w.isMounted){let{next:pe,bu:ye,u:Re,parent:ve,vnode:He}=w;{const nt=rh(w);if(nt){pe&&(pe.el=He.el,I(w,pe,me)),nt.asyncDep.then(()=>{Pt(()=>{w.isUnmounted||Y()},ie)});return}}let Pe=pe,ze;cn(w,!1),pe?(pe.el=He.el,I(w,pe,me)):pe=He,ye&&ei(ye),(ze=pe.props&&pe.props.onVnodeBeforeUpdate)&&ys(ze,ve,pe,He),cn(w,!0);const Ye=Wl(w),ot=w.subTree;w.subTree=Ye,v(ot,Ye,u(ot.el),ae(ot),w,ie,le),pe.el=Ye.el,Pe===null&&Zo(w,Ye.el),Re&&Pt(Re,ie),(ze=pe.props&&pe.props.onVnodeUpdated)&&Pt(()=>ys(ze,ve,pe,He),ie)}else{let pe;const{el:ye,props:Re}=M,{bm:ve,m:He,parent:Pe,root:ze,type:Ye}=w,ot=Oa(M);if(cn(w,!1),ve&&ei(ve),!ot&&(pe=Re&&Re.onVnodeBeforeMount)&&ys(pe,Pe,M),cn(w,!0),ye&&Le){const nt=()=>{w.subTree=Wl(w),Le(ye,w.subTree,w,ie,null)};ot&&Ye.__asyncHydrate?Ye.__asyncHydrate(ye,w,nt):nt()}else{ze.ce&&ze.ce._hasShadowRoot()&&ze.ce._injectChildStyle(Ye,w.parent?w.parent.type:void 0);const nt=w.subTree=Wl(w);v(null,nt,z,ce,w,ie,le),M.el=nt.el}if(He&&Pt(He,ie),!ot&&(pe=Re&&Re.onVnodeMounted)){const nt=M;Pt(()=>ys(pe,Pe,nt),ie)}(M.shapeFlag&256||Pe&&Oa(Pe.vnode)&&Pe.vnode.shapeFlag&256)&&w.a&&Pt(w.a,ie),w.isMounted=!0,M=z=ce=null}};w.scope.on();const ee=w.effect=new Zi(H);w.scope.off();const Y=w.update=ee.run.bind(ee),fe=w.job=ee.runIfDirty.bind(ee);fe.i=w,fe.id=w.uid,ee.scheduler=()=>Pc(fe),cn(w,!0),Y()},I=(w,M,z)=>{M.component=w;const ce=w.vnode.props;w.vnode=M,w.next=null,uy(w,M.props,ce,z),my(w,M.children,z),Da(),zd(w),Pa()},O=(w,M,z,ce,ie,le,me,H,ee=!1)=>{const Y=w&&w.children,fe=w?w.shapeFlag:0,pe=M.children,{patchFlag:ye,shapeFlag:Re}=M;if(ye>0){if(ye&128){Q(Y,pe,z,ce,ie,le,me,H,ee);return}else if(ye&256){$(Y,pe,z,ce,ie,le,me,H,ee);return}}Re&8?(fe&16&&Oe(Y,ie,le),pe!==Y&&d(z,pe)):fe&16?Re&16?Q(Y,pe,z,ce,ie,le,me,H,ee):Oe(Y,ie,le,!0):(fe&8&&d(z,""),Re&16&&T(pe,z,ce,ie,le,me,H,ee))},$=(w,M,z,ce,ie,le,me,H,ee)=>{w=w||Yn,M=M||Yn;const Y=w.length,fe=M.length,pe=Math.min(Y,fe);let ye;for(ye=0;ye<pe;ye++){const Re=M[ye]=ee?wa(M[ye]):_s(M[ye]);v(w[ye],Re,z,null,ie,le,me,H,ee)}Y>fe?Oe(w,ie,le,!0,!1,pe):T(M,z,ce,ie,le,me,H,ee,pe)},Q=(w,M,z,ce,ie,le,me,H,ee)=>{let Y=0;const fe=M.length;let pe=w.length-1,ye=fe-1;for(;Y<=pe&&Y<=ye;){const Re=w[Y],ve=M[Y]=ee?wa(M[Y]):_s(M[Y]);if(Ws(Re,ve))v(Re,ve,z,null,ie,le,me,H,ee);else break;Y++}for(;Y<=pe&&Y<=ye;){const Re=w[pe],ve=M[ye]=ee?wa(M[ye]):_s(M[ye]);if(Ws(Re,ve))v(Re,ve,z,null,ie,le,me,H,ee);else break;pe--,ye--}if(Y>pe){if(Y<=ye){const Re=ye+1,ve=Re<fe?M[Re].el:ce;for(;Y<=ye;)v(null,M[Y]=ee?wa(M[Y]):_s(M[Y]),z,ve,ie,le,me,H,ee),Y++}}else if(Y>ye)for(;Y<=pe;)X(w[Y],ie,le,!0),Y++;else{const Re=Y,ve=Y,He=new Map;for(Y=ve;Y<=ye;Y++){const Ce=M[Y]=ee?wa(M[Y]):_s(M[Y]);Ce.key!=null&&He.set(Ce.key,Y)}let Pe,ze=0;const Ye=ye-ve+1;let ot=!1,nt=0;const J=new Array(Ye);for(Y=0;Y<Ye;Y++)J[Y]=0;for(Y=Re;Y<=pe;Y++){const Ce=w[Y];if(ze>=Ye){X(Ce,ie,le,!0);continue}let Ne;if(Ce.key!=null)Ne=He.get(Ce.key);else for(Pe=ve;Pe<=ye;Pe++)if(J[Pe-ve]===0&&Ws(Ce,M[Pe])){Ne=Pe;break}Ne===void 0?X(Ce,ie,le,!0):(J[Ne-ve]=Y+1,Ne>=nt?nt=Ne:ot=!0,v(Ce,M[Ne],z,null,ie,le,me,H,ee),ze++)}const _e=ot?vy(J):Yn;for(Pe=_e.length-1,Y=Ye-1;Y>=0;Y--){const Ce=ve+Y,Ne=M[Ce],se=M[Ce+1],Ee=Ce+1<fe?se.el||ch(se):ce;J[Y]===0?v(null,Ne,z,Ee,ie,le,me,H,ee):ot&&(Pe<0||Y!==_e[Pe]?G(Ne,z,Ee,2):Pe--)}}},G=(w,M,z,ce,ie=null)=>{const{el:le,type:me,transition:H,children:ee,shapeFlag:Y}=w;if(Y&6){G(w.component.subTree,M,z,ce);return}if(Y&128){w.suspense.move(M,z,ce);return}if(Y&64){me.move(w,M,z,de);return}if(me===Gt){a(le,M,z);for(let pe=0;pe<ee.length;pe++)G(ee[pe],M,z,ce);a(w.anchor,M,z);return}if(me===xn){g(w,M,z);return}if(ce!==2&&Y&1&&H)if(ce===0)H.persisted&&!le[$s]?a(le,M,z):(H.beforeEnter(le),a(le,M,z),Pt(()=>H.enter(le),ie));else{const{leave:pe,delayLeave:ye,afterLeave:Re}=H,ve=()=>{w.ctx.isUnmounted?n(le):a(le,M,z)},He=()=>{const Pe=le._isLeaving||!!le[$s];le._isLeaving&&le[$s](!0),H.persisted&&!Pe?ve():pe(le,()=>{ve(),Re&&Re()})};ye?ye(le,ve,He):He()}else a(le,M,z)},X=(w,M,z,ce=!1,ie=!1)=>{const{type:le,props:me,ref:H,children:ee,dynamicChildren:Y,shapeFlag:fe,patchFlag:pe,dirs:ye,cacheIndex:Re,memo:ve}=w;if(pe===-2&&(ie=!1),H!=null&&(Da(),si(H,null,z,w,!0),Pa()),Re!=null&&(M.renderCache[Re]=void 0),fe&256){M.ctx.deactivate(w);return}const He=fe&1&&ye,Pe=!Oa(w);let ze;if(Pe&&(ze=me&&me.onVnodeBeforeUnmount)&&ys(ze,M,w),fe&6)ue(w.component,z,ce);else{if(fe&128){w.suspense.unmount(z,ce);return}He&&oa(w,null,M,"beforeUnmount"),fe&64?w.type.remove(w,M,z,de,ce):Y&&!Y.hasOnce&&(le!==Gt||pe>0&&pe&64)?Oe(Y,M,z,!1,!0):(le===Gt&&pe&384||!ie&&fe&16)&&Oe(ee,M,z),ce&&re(w)}const Ye=ve!=null&&Re==null;(Pe&&(ze=me&&me.onVnodeUnmounted)||He||Ye)&&Pt(()=>{ze&&ys(ze,M,w),He&&oa(w,null,M,"unmounted"),Ye&&(w.el=null)},z)},re=w=>{const{type:M,el:z,anchor:ce,transition:ie}=w;if(M===Gt){Z(z,ce);return}if(M===xn){y(w);return}const le=()=>{n(z),ie&&!ie.persisted&&ie.afterLeave&&ie.afterLeave()};if(w.shapeFlag&1&&ie&&!ie.persisted){const{leave:me,delayLeave:H}=ie,ee=()=>me(z,le);H?H(w.el,le,ee):ee()}else le()},Z=(w,M)=>{let z;for(;w!==M;)z=p(w),n(w),w=z;n(M)},ue=(w,M,z)=>{const{bum:ce,scope:ie,job:le,subTree:me,um:H,m:ee,a:Y}=w;co(ee),co(Y),ce&&ei(ce),ie.stop(),le&&(le.flags|=8,X(me,w,M,z)),H&&Pt(H,M),Pt(()=>{w.isUnmounted=!0},M)},Oe=(w,M,z,ce=!1,ie=!1,le=0)=>{for(let me=le;me<w.length;me++)X(w[me],M,z,ce,ie)},ae=w=>{if(w.shapeFlag&6)return ae(w.component.subTree);if(w.shapeFlag&128)return w.suspense.next();const M=p(w.anchor||w.el),z=M&&M[Of];return z?p(z):M};let be=!1;const q=(w,M,z)=>{let ce;w==null?M._vnode&&(X(M._vnode,null,null,!0),ce=M._vnode.component):v(M._vnode||null,w,M,null,null,null,z),M._vnode=w,be||(be=!0,zd(ce),lo(),be=!1)},de={p:v,um:X,m:G,r:re,mt:B,mc:T,pc:O,pbc:N,n:ae,o:e};let he,Le;return t&&([he,Le]=t(de)),{render:q,hydrate:he,createApp:sy(q,he)}}function br({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function cn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function oh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Kc(e,t,s=!1){const a=e.children,n=t.children;if(Ae(a)&&Ae(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=wa(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Kc(l,o)),o.type===en&&(o.patchFlag===-1&&(o=n[i]=wa(o)),o.el=l.el),o.type===Lt&&!o.el&&(o.el=l.el)}}function vy(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function rh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:rh(t)}function co(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function ch(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?ch(t.subTree):null}const uo=e=>e.__isSuspense;let Zr=0;const gy={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)yy(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}xy(e,t,s,a,n,l,o,r,c)}},hydrate:_y,normalize:wy},by=gy;function al(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function yy(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=dh(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(al(e,"onPending"),al(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ai(p,e.ssFallback)):p.resolve(!1,!0)}function xy(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:S,isHydrating:L}=u;if(v)u.pendingBranch=p,Ws(v,p)?(r(v,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():S&&(L||(r(m,h,s,a,n,null,i,l,o),ai(u,h)))):(u.pendingId=Zr++,L?(u.isHydrating=!1,u.activeBranch=v):c(v,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),S?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ai(u,h))):m&&Ws(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Ws(m,p))r(m,p,s,a,n,u,i,l,o),ai(u,p);else if(al(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Zr++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:b,pendingId:g}=u;b>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},b):b===0&&u.fallback(h)}}function dh(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:S}}=c;let L;const b=ky(e);b&&t&&t.pendingBranch&&(L=t.pendingId,t.deps++);const g=e.props?to(e.props.timeout):void 0,y=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:Zr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,A=!1){const{vnode:T,activeBranch:x,pendingBranch:N,pendingId:F,effects:k,parentComponent:P,container:B,isInFallback:K}=E;let C=!1;if(E.isHydrating)E.isHydrating=!1;else if(!_){C=x&&N.transition&&N.transition.mode==="out-in";let $=!1;C&&(x.transition.afterLeave=()=>{F===E.pendingId&&(p(N,B,i===y&&!$?m(x):i,0),Xi(k),K&&T.ssFallback&&(T.ssFallback.el=null))}),x&&!E.isFallbackMountPending&&(v(x.el)===B&&(i=m(x),$=!0),h(x,P,E,!0),!C&&K&&T.ssFallback&&Pt(()=>T.ssFallback.el=null,E)),C||p(N,B,i,0)}E.isFallbackMountPending=!1,ai(E,N),E.pendingBranch=null,E.isInFallback=!1;let I=E.parent,O=!1;for(;I;){if(I.pendingBranch){I.effects.push(...k),O=!0;break}I=I.parent}!O&&!C&&Xi(k),E.effects=[],b&&t&&t.pendingBranch&&L===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),al(T,"onResolve")},fallback(_){if(!E.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:x,container:N,namespace:F}=E;al(A,"onFallback");const k=m(T),P=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(u(null,_,N,k,x,null,F,o,r),ai(E,_))},B=_.transition&&_.transition.mode==="out-in";B&&(E.isFallbackMountPending=!0,T.transition.afterLeave=P),E.isInFallback=!0,h(T,x,null,!0),B||P()},move(_,A,T){E.activeBranch&&p(E.activeBranch,_,A,T),E.container=_},next(){return E.activeBranch&&m(E.activeBranch)},registerDep(_,A,T){const x=!!E.pendingBranch;x&&E.deps++;const N=_.vnode.el;_.asyncDep.catch(F=>{In(F,_,0)}).then(F=>{if(_.isUnmounted||E.isUnmounted||E.pendingId!==_.suspenseId)return;ll(),_.asyncResolved=!0;const{vnode:k}=_;Yr(_,F,!1),N&&(k.el=N);const P=!N&&_.subTree.el;A(_,k,v(N||_.subTree.el),N?null:m(_.subTree),E,l,T),P&&(k.placeholder=null,S(P)),Zo(_,k.el),x&&--E.deps===0&&E.resolve()})},unmount(_,A){E.isUnmounted=!0,E.activeBranch&&h(E.activeBranch,s,_,A),E.pendingBranch&&h(E.pendingBranch,s,_,A)}};return E}function _y(e,t,s,a,n,i,l,o,r){const c=t.suspense=dh(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function wy(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=su(a?s.default:s),e.ssFallback=a?su(s.fallback):_t(Lt)}function su(e){let t;if(Fe(e)){const s=kn&&e._c;s&&(e._d=!1,nl()),e=e(),s&&(e._d=!0,t=is,ph())}return Ae(e)&&(e=ly(e)),e=_s(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function uh(e,t){t&&t.pendingBranch?Ae(e)?t.effects.push(...e):t.effects.push(e):Xi(e)}function ai(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Zo(a,n))}function ky(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),en=Symbol.for("v-txt"),Lt=Symbol.for("v-cmt"),xn=Symbol.for("v-stc"),Vi=[];let is=null;function nl(e=!1){Vi.push(is=e?null:[])}function ph(){Vi.pop(),is=Vi[Vi.length-1]||null}let kn=1;function il(e,t=!1){kn+=e,e<0&&is&&t&&(is.hasOnce=!0)}function fh(e){return e.dynamicChildren=kn>0?is||Yn:null,ph(),kn>0&&is&&is.push(e),e}function Sy(e,t,s,a,n,i){return fh(Wc(e,t,s,a,n,i,!0))}function po(e,t,s,a,n){return fh(_t(e,t,s,a,n,!0))}function Fa(e){return e?e.__v_isVNode===!0:!1}function Ws(e,t){return e.type===t.type&&e.key===t.key}function Ty(e){}const hh=({key:e})=>e??null,Jl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Be(e)||Ft(e)||Fe(e)?{i:Qt,r:e,k:t,f:!!s}:e:null);function Wc(e,t=null,s=null,a=0,n=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&hh(t),ref:t&&Jl(t),scopeId:Vo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Qt};return o?(Zc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=Be(s)?8:16),kn>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const _t=Cy;function Cy(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===jf)&&(e=Lt),Fa(e)){const o=ua(e,t,!0);return s&&Zc(o,s),kn>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Ny(e)&&(e=e.__vccOpts),t){t=mh(t);let{class:o,style:r}=t;o&&!Be(o)&&(t.class=bl(o)),lt(r)&&(yl(r)&&!Ae(r)&&(r=Je({},r)),t.style=gl(r))}const l=Be(e)?1:uo(e)?128:Lf(e)?64:lt(e)?4:Fe(e)?2:0;return Wc(e,t,s,a,n,l,i,!0)}function mh(e){return e?yl(e)||Qf(e)?Je({},e):e:null}function ua(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?gh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&hh(c),ref:t&&t.ref?s&&i?Ae(i)?i.concat(Jl(t)):[i,Jl(t)]:Jl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&ua(e.ssContent),ssFallback:e.ssFallback&&ua(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&Ma(d,r.clone(d)),d}function Jc(e=" ",t=0){return _t(en,null,e,t)}function Ey(e,t){const s=_t(xn,null,e);return s.staticCount=t,s}function vh(e="",t=!1){return t?(nl(),po(Lt,null,e)):_t(Lt,null,e)}function _s(e){return e==null||typeof e=="boolean"?_t(Lt):Ae(e)?_t(Gt,null,e.slice()):Fa(e)?wa(e):_t(en,null,String(e))}function wa(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:ua(e)}function Zc(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Ae(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),Zc(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!Qf(t)?t._ctx=Qt:n===3&&Qt&&(Qt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:Qt},s=32):(t=String(t),a&64?(s=16,t=[Jc(t)]):s=8);e.children=t,e.shapeFlag|=s}function gh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=bl([t.class,a.class]));else if(n==="style")t.style=gl([t.style,a.style]);else if(En(n)){const i=t[n],l=a[n];l&&i!==l&&!(Ae(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!No(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function ys(e,t,s,a=null){Rs(e,t,7,[s,a])}const Ay=Gf();let Ry=0;function bh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Ay,i={uid:Ry++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Ac(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:eh(a,n),emitsOptions:Wf(a,n),emit:null,emitted:null,propsDefaults:Ze,inheritAttrs:a.inheritAttrs,ctx:Ze,data:Ze,props:Ze,attrs:Ze,slots:Ze,refs:Ze,setupState:Ze,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ny.bind(null,i),e.ce&&e.ce(i),i}let Yt=null;const fs=()=>Yt||Qt;let fo,ni;{const e=$o(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};fo=t("__VUE_INSTANCE_SETTERS__",s=>Yt=s),ni=t("__VUE_SSR_SETTERS__",s=>Sn=s)}const _i=e=>{const t=Yt;return fo(e),e.scope.on(),()=>{e.scope.off(),fo(t)}},ll=()=>{Yt&&Yt.scope.off(),fo(null)};function yh(e){return e.vnode.shapeFlag&4}let Sn=!1;function xh(e,t=!1,s=!1){t&&ni(t);const{props:a,children:n}=e.vnode,i=yh(e);dy(e,a,i,t),hy(e,n,s||t);const l=i?Iy(e,t):void 0;return t&&ni(!1),l}function Iy(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Gr);const{setup:a}=s;if(a){Da();const n=e.setupContext=a.length>1?kh(e):null,i=_i(e),l=xi(a,e,0,[e.props,n]),o=Ec(l);if(Pa(),i(),(o||e.sp)&&!Oa(e)&&Uc(e),o){if(l.then(ll,ll),t)return l.then(r=>{Yr(e,r,t)}).catch(r=>{In(r,e,0)});e.asyncDep=l}else Yr(e,l,t)}else wh(e,t)}function Yr(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:lt(t)&&(e.setupState=Dc(t)),wh(e,s)}let ho,Qr;function _h(e){ho=e,Qr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Mb))}}const Oy=()=>!ho;function wh(e,t,s){const a=e.type;if(!e.render){if(!t&&ho&&!a.render){const n=a.template||Vc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Je(Je({isCustomElement:i,delimiters:o},l),r);a.render=ho(n,c)}}e.render=a.render||Xt,Qr&&Qr(e)}{const n=_i(e);Da();try{Zb(e)}finally{Pa(),n()}}}const Ly={get(e,t){return ns(e,"get",""),e[t]}};function kh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Ly),slots:e.slots,emit:e.emit,expose:t}}function kl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Dc(gf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ji)return ji[s](e)},has(t,s){return s in t||s in ji}})):e.proxy}function Xr(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function Ny(e){return Fe(e)&&"__vccOpts"in e}const V=(e,t)=>Ug(e,t,Sn);function ci(e,t,s){try{il(-1);const a=arguments.length;return a===2?lt(t)&&!Ae(t)?Fa(t)?_t(e,null,[t]):_t(e,t):_t(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&Fa(s)&&(s=[s]),_t(e,t,s))}finally{il(1)}}function Dy(){}function Py(e,t,s,a){const n=s[a];if(n&&Sh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function Sh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(qt(s[a],t[a]))return!1;return kn>0&&is&&is.push(e),!0}const Th="3.5.38",My=Xt,Fy=Wg,$y=qn,Uy=Cf,By={createComponentInstance:bh,setupComponent:xh,renderComponentRoot:Wl,setCurrentRenderingInstance:tl,isVNode:Fa,normalizeVNode:_s,getComponentPublicInstance:kl,ensureValidVNode:jc,pushWarningContext:Vg,popWarningContext:qg},Hy=By,zy=null,jy=null,Vy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ec;const au=typeof window<"u"&&window.trustedTypes;if(au)try{ec=au.createPolicy("vue",{createHTML:e=>e})}catch{}const Ch=ec?e=>ec.createHTML(e):e=>e,qy="http://www.w3.org/2000/svg",Gy="http://www.w3.org/1998/Math/MathML",_a=typeof document<"u"?document:null,nu=_a&&_a.createElement("template"),Eh={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?_a.createElementNS(qy,e):t==="mathml"?_a.createElementNS(Gy,e):s?_a.createElement(e,{is:s}):_a.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>_a.createTextNode(e),createComment:e=>_a.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>_a.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{nu.innerHTML=Ch(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=nu.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Va="transition",Ci="animation",di=Symbol("_vtc"),Ah={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Rh=Je({},$c,Ah),Ky=e=>(e.displayName="Transition",e.props=Rh,e),Wy=Ky((e,{slots:t})=>ci(Pf,Ih(e),t)),dn=(e,t=[])=>{Ae(e)?e.forEach(s=>s(...t)):e&&e(...t)},iu=e=>e?Ae(e)?e.some(t=>t.length>1):e.length>1:!1;function Ih(e){const t={};for(const k in e)k in Ah||(t[k]=e[k]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=Jy(n),v=m&&m[0],S=m&&m[1],{onBeforeEnter:L,onEnter:b,onEnterCancelled:g,onLeave:y,onLeaveCancelled:E,onBeforeAppear:_=L,onAppear:A=b,onAppearCancelled:T=g}=t,x=(k,P,B,K)=>{k._enterCancelled=K,Wa(k,P?d:o),Wa(k,P?c:l),B&&B()},N=(k,P)=>{k._isLeaving=!1,Wa(k,u),Wa(k,h),Wa(k,p),P&&P()},F=k=>(P,B)=>{const K=k?A:b,C=()=>x(P,k,B);dn(K,[P,C]),lu(()=>{Wa(P,k?r:i),aa(P,k?d:o),iu(K)||ou(P,a,v,C)})};return Je(t,{onBeforeEnter(k){dn(L,[k]),aa(k,i),aa(k,l)},onBeforeAppear(k){dn(_,[k]),aa(k,r),aa(k,c)},onEnter:F(!1),onAppear:F(!0),onLeave(k,P){k._isLeaving=!0;const B=()=>N(k,P);aa(k,u),k._enterCancelled?(aa(k,p),tc(k)):(tc(k),aa(k,p)),lu(()=>{k._isLeaving&&(Wa(k,u),aa(k,h),iu(y)||ou(k,a,S,B))}),dn(y,[k,B])},onEnterCancelled(k){x(k,!1,void 0,!0),dn(g,[k])},onAppearCancelled(k){x(k,!0,void 0,!0),dn(T,[k])},onLeaveCancelled(k){N(k),dn(E,[k])}})}function Jy(e){if(e==null)return null;if(lt(e))return[yr(e.enter),yr(e.leave)];{const t=yr(e);return[t,t]}}function yr(e){return to(e)}function aa(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[di]||(e[di]=new Set)).add(t)}function Wa(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[di];s&&(s.delete(t),s.size||(e[di]=void 0))}function lu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Zy=0;function ou(e,t,s,a){const n=e._endId=++Zy,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Oh(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Oh(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${Va}Delay`),i=a(`${Va}Duration`),l=ru(n,i),o=a(`${Ci}Delay`),r=a(`${Ci}Duration`),c=ru(o,r);let d=null,u=0,p=0;t===Va?l>0&&(d=Va,u=l,p=i.length):t===Ci?c>0&&(d=Ci,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Va:Ci:null,p=d?d===Va?i.length:r.length:0);const h=d===Va&&/\b(?:transform|all)(?:,|$)/.test(a(`${Va}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function ru(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>cu(s)+cu(e[a])))}function cu(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function tc(e){return(e?e.ownerDocument:document).body.offsetHeight}function Yy(e,t,s){const a=e[di];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const mo=Symbol("_vod"),Yc=Symbol("_vsh"),Lh={name:"show",beforeMount(e,{value:t},{transition:s}){e[mo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ei(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ei(e,!0),a.enter(e)):a.leave(e,()=>{Ei(e,!1)}):Ei(e,t))},beforeUnmount(e,{value:t}){Ei(e,t)}};function Ei(e,t){e.style.display=t?e[mo]:"none",e[Yc]=!t}function Qy(){Lh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Nh=Symbol("");function Xy(e){const t=fs();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>vo(i,n))},a=()=>{const n=e(t.proxy);t.ce?vo(t.ce,n):sc(t.subTree,n),s(n)};Bc(()=>{Xi(a)}),Ge(()=>{$t(a,Xt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>n.disconnect())})}function sc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{sc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)vo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>sc(s,t));else if(e.type===xn){let{el:s,anchor:a}=e;for(;s&&(vo(s,t),s!==a);)s=s.nextSibling}}function vo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=ig(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Nh]=a}}const ex=/(?:^|;)\s*display\s*:/;function tx(e,t,s){const a=e.style,n=Be(s);let i=!1;if(s&&!n){if(t)if(Be(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&$i(a,o,"")}else for(const l in t)s[l]==null&&$i(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?ax(e,l,!Be(t)&&t?t[l]:void 0,o)||$i(a,l,o):$i(a,l,"")}}else if(n){if(t!==s){const l=a[Nh];l&&(s+=";"+l),a.cssText=s,i=ex.test(s)}}else t&&e.removeAttribute("style");mo in e&&(e[mo]=i?a.display:"",e[Yc]&&(a.display="none"))}const du=/\s*!important$/;function $i(e,t,s){if(Ae(s))s.forEach(a=>$i(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=sx(e,t);du.test(s)?e.setProperty(ws(a),s.replace(du,""),"important"):e[a]=s}}const uu=["Webkit","Moz","ms"],xr={};function sx(e,t){const s=xr[t];if(s)return s;let a=ht(t);if(a!=="filter"&&a in e)return xr[t]=a;a=Rn(a);for(let n=0;n<uu.length;n++){const i=uu[n]+a;if(i in e)return xr[t]=i}return t}function ax(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Be(a)&&s===a}const pu="http://www.w3.org/1999/xlink";function fu(e,t,s,a,n,i=ag(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(pu,t.slice(6,t.length)):e.setAttributeNS(pu,t,s):s==null||i&&!Zp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function hu(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Ch(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Zp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Ca(e,t,s,a){e.addEventListener(t,s,a)}function nx(e,t,s,a){e.removeEventListener(t,s,a)}const mu=Symbol("_vei");function ix(e,t,s,a,n=null){const i=e[mu]||(e[mu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=lx(t);if(a){const c=i[t]=cx(a,n);Ca(e,o,c,r)}else l&&(nx(e,o,l,r),i[t]=void 0)}}const vu=/(?:Once|Passive|Capture)$/;function lx(e){let t;if(vu.test(e)){t={};let a;for(;a=e.match(vu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ws(e.slice(2)),t]}let _r=0;const ox=Promise.resolve(),rx=()=>_r||(ox.then(()=>_r=0),_r=Date.now());function cx(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Ae(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Rs(c,t,5,o)}}else Rs(n,t,5,[a])};return s.value=e,s.attached=rx(),s}const gu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Dh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?Yy(e,a,l):t==="style"?tx(e,s,a):En(t)?No(t)||ix(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):dx(e,t,a,l))?(hu(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&fu(e,t,a,l,i,t!=="value")):e._isVueCE&&(ux(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Be(a)))?hu(e,ht(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),fu(e,t,a,l))};function dx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&gu(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return gu(t)&&Be(s)?!1:t in e}function ux(e,t){const s=e._def.props;if(!s)return!1;const a=ht(t);return Array.isArray(s)?s.some(n=>ht(n)===a):Object.keys(s).some(n=>ht(n)===a)}const bu={};function Ph(e,t,s){let a=_l(e,t);Do(a)&&(a=Je({},a,t));class n extends Yo{constructor(l){super(a,l,s)}}return n.def=a,n}const px=((e,t)=>Ph(e,t,Wh)),fx=typeof HTMLElement<"u"?HTMLElement:class{};class Yo extends fx{constructor(t,s={},a=yo){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==yo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Yo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ot(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Ae(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=to(this._props[r])),(o||(o=Object.create(null)))[ht(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)rt(this,a)||Object.defineProperty(this,a,{get:()=>ca(s[a])})}_resolveProps(t){const{props:s}=t,a=Ae(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(ht))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):bu;const n=ht(t);s&&this._numberProps&&this._numberProps[n]&&(a=to(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===bu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ws(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ws(t),s+""):s||this.removeAttribute(ws(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Kh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=_t(this._def,Je(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Do(l[0])?Je({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),ws(i)!==i&&n(ws(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Mh(e){const t=fs(),s=t&&t.ce;return s||null}function hx(){const e=Mh();return e&&e.shadowRoot}function mx(e="$style"){{const t=fs();if(!t)return Ze;const s=t.type.__cssModules;if(!s)return Ze;const a=s[e];return a||Ze}}const Fh=new WeakMap,$h=new WeakMap,go=Symbol("_moveCb"),yu=Symbol("_enterCb"),vx=e=>(delete e.props.mode,e),gx=vx({name:"TransitionGroup",props:Je({},Rh,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=fs(),a=Fc();let n,i;return Ko(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!wx(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(yx),n.forEach(xx);const o=n.filter(_x);tc(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;aa(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[go]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[go]=null,Wa(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=st(e),o=Ih(l);let r=l.tag||Gt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Yc]&&(n.push(d),Ma(d,ri(d,o,a,s)),Fh.set(d,Uh(d.el)))}i=t.default?qo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&Ma(d,ri(d,o,a,s))}return _t(r,null,i)}}}),bx=gx;function yx(e){const t=e.el;t[go]&&t[go](),t[yu]&&t[yu]()}function xx(e){$h.set(e,Uh(e.el))}function _x(e){const t=Fh.get(e),s=$h.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function Uh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function wx(e,t,s){const a=e.cloneNode(),n=e[di];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Oh(a);return i.removeChild(a),l}const sn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ae(t)?s=>ei(t,s):t};function kx(e){e.target.composing=!0}function xu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const js=Symbol("_assign");function _u(e,t,s){return t&&(e=e.trim()),s&&(e=Fo(e)),e}const bo={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[js]=sn(n);const i=a||n.props&&n.props.type==="number";Ca(e,t?"change":"input",l=>{l.target.composing||e[js](_u(e.value,s,i))}),(s||i)&&Ca(e,"change",()=>{e.value=_u(e.value,s,i)}),t||(Ca(e,"compositionstart",kx),Ca(e,"compositionend",xu),Ca(e,"change",xu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[js]=sn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Fo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},Qc={deep:!0,created(e,t,s){e[js]=sn(s),Ca(e,"change",()=>{const a=e._modelValue,n=ui(e),i=e.checked,l=e[js];if(Ae(a)){const o=Uo(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(An(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Hh(e,i))})},mounted:wu,beforeUpdate(e,t,s){e[js]=sn(s),wu(e,t,s)}};function wu(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Ae(t))n=Uo(t,a.props.value)>-1;else if(An(t))n=t.has(a.props.value);else{if(t===s)return;n=Na(t,Hh(e,!0))}e.checked!==n&&(e.checked=n)}const Xc={created(e,{value:t},s){e.checked=Na(t,s.props.value),e[js]=sn(s),Ca(e,"change",()=>{e[js](ui(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[js]=sn(a),t!==s&&(e.checked=Na(t,a.props.value))}},Bh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=An(t);Ca(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Fo(ui(l)):ui(l));e[js](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Ot(()=>{e._assigning=!1})}),e[js]=sn(a)},mounted(e,{value:t}){ku(e,t)},beforeUpdate(e,t,s){e[js]=sn(s)},updated(e,{value:t}){e._assigning||ku(e,t)}};function ku(e,t){const s=e.multiple,a=Ae(t);if(!(s&&!a&&!An(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=ui(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Uo(t,o)>-1}else l.selected=t.has(o);else if(Na(ui(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ui(e){return"_value"in e?e._value:e.value}function Hh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const zh={created(e,t,s){$l(e,t,s,null,"created")},mounted(e,t,s){$l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){$l(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){$l(e,t,s,a,"updated")}};function jh(e,t){switch(e){case"SELECT":return Bh;case"TEXTAREA":return bo;default:switch(t){case"checkbox":return Qc;case"radio":return Xc;default:return bo}}}function $l(e,t,s,a,n){const l=jh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function Sx(){bo.getSSRProps=({value:e})=>({value:e}),Xc.getSSRProps=({value:e},t)=>{if(t.props&&Na(t.props.value,e))return{checked:!0}},Qc.getSSRProps=({value:e},t)=>{if(Ae(e)){if(t.props&&Uo(e,t.props.value)>-1)return{checked:!0}}else if(An(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},zh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=jh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Tx=["ctrl","shift","alt","meta"],Cx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Tx.some(s=>e[`${s}Key`]&&!t.includes(s))},Ex=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=Cx[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Ax={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Rx=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=ws(n.key);if(t.some(l=>l===i||Ax[l]===i))return e(n)}))},Vh=Je({patchProp:Dh},Eh);let qi,Su=!1;function qh(){return qi||(qi=nh(Vh))}function Gh(){return qi=Su?qi:ih(Vh),Su=!0,qi}const Kh=((...e)=>{qh().render(...e)}),Ix=((...e)=>{Gh().hydrate(...e)}),yo=((...e)=>{const t=qh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Zh(a);if(!n)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,Jh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),Wh=((...e)=>{const t=Gh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Zh(a);if(n)return s(n,!0,Jh(n))},t});function Jh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Zh(e){return Be(e)?document.querySelector(e):e}let Tu=!1;const Ox=()=>{Tu||(Tu=!0,Sx(),Qy())},Lx=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Pf,BaseTransitionPropsValidators:$c,Comment:Lt,DeprecationTypes:Vy,EffectScope:Ac,ErrorCodes:Kg,ErrorTypeStrings:Fy,Fragment:Gt,KeepAlive:Cb,ReactiveEffect:Zi,Static:xn,Suspense:by,Teleport:rb,Text:en,TrackOpTypes:Bg,Transition:Wy,TransitionGroup:bx,TriggerOpTypes:Hg,VueElement:Yo,assertNumber:Gg,callWithAsyncErrorHandling:Rs,callWithErrorHandling:xi,camelize:ht,capitalize:Rn,cloneVNode:ua,compatUtils:jy,computed:V,createApp:yo,createBlock:po,createCommentVNode:vh,createElementBlock:Sy,createElementVNode:Wc,createHydrationRenderer:ih,createPropsRestProxy:Wb,createRenderer:nh,createSSRApp:Wh,createSlots:Nb,createStaticVNode:Ey,createTextVNode:Jc,createVNode:_t,customRef:yf,defineAsyncComponent:Sb,defineComponent:_l,defineCustomElement:Ph,defineEmits:$b,defineExpose:Ub,defineModel:zb,defineOptions:Bb,defineProps:Fb,defineSSRCustomElement:px,defineSlots:Hb,devtools:$y,effect:cg,effectScope:lg,getCurrentInstance:fs,getCurrentScope:ef,getCurrentWatcher:zg,getTransitionRawChildren:qo,guardReactiveProps:mh,h:ci,handleError:In,hasInjectionContext:tb,hydrate:Ix,hydrateOnIdle:bb,hydrateOnInteraction:wb,hydrateOnMediaQuery:_b,hydrateOnVisible:xb,initCustomFormatter:Dy,initDirectivesForSSR:Ox,inject:zs,isMemoSame:Sh,isProxy:yl,isReactive:Ia,isReadonly:da,isRef:Ft,isRuntimeOnly:Oy,isShallow:Ss,isVNode:Fa,markRaw:gf,mergeDefaults:Gb,mergeModels:Kb,mergeProps:gh,nextTick:Ot,nodeOps:Eh,normalizeClass:bl,normalizeProps:Kv,normalizeStyle:gl,onActivated:es,onBeforeMount:$f,onBeforeUnmount:Wo,onBeforeUpdate:Bc,onDeactivated:Wt,onErrorCaptured:zf,onMounted:Ge,onRenderTracked:Hf,onRenderTriggered:Bf,onScopeDispose:og,onServerPrefetch:Uf,onUnmounted:mt,onUpdated:Ko,onWatcherCleanup:_f,openBlock:nl,patchProp:Dh,popScopeId:Qg,provide:zi,proxyRefs:Dc,pushScopeId:Yg,queuePostFlushCb:Xi,reactive:an,readonly:ao,ref:f,registerRuntimeCompiler:_h,render:Kh,renderList:Lb,renderSlot:Db,resolveComponent:Rb,resolveDirective:Ob,resolveDynamicComponent:Ib,resolveFilter:zy,resolveTransitionHooks:ri,setBlockTracking:il,setDevtoolsHook:Uy,setTransitionHooks:Ma,shallowReactive:Lc,shallowReadonly:Ag,shallowRef:Nc,ssrContextKey:Ef,ssrUtils:Hy,stop:dg,toDisplayString:Qp,toHandlerKey:Xn,toHandlers:Pb,toRaw:st,toRef:Fg,toRefs:Dg,toValue:Og,transformVNodeArgs:Ty,triggerRef:Ig,unref:ca,useAttrs:qb,useCssModule:mx,useCssVars:Xy,useHost:Mh,useId:db,useModel:ay,useSSRContext:Af,useShadowRoot:hx,useSlots:Vb,useTemplateRef:ub,useTransitionState:Fc,vModelCheckbox:Qc,vModelDynamic:zh,vModelRadio:Xc,vModelSelect:Bh,vModelText:bo,vShow:Lh,version:Th,warn:My,watch:$t,watchEffect:sb,watchPostEffect:ab,watchSyncEffect:Rf,withAsyncContext:Jb,withCtx:Mc,withDefaults:jb,withDirectives:eb,withKeys:Rx,withMemo:Py,withModifiers:Ex,withScopeId:Xg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ol=Symbol(""),Gi=Symbol(""),ed=Symbol(""),xo=Symbol(""),Yh=Symbol(""),Tn=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),td=Symbol(""),sd=Symbol(""),Sl=Symbol(""),ad=Symbol(""),em=Symbol(""),nd=Symbol(""),id=Symbol(""),ld=Symbol(""),od=Symbol(""),rd=Symbol(""),cd=Symbol(""),tm=Symbol(""),sm=Symbol(""),Qo=Symbol(""),_o=Symbol(""),dd=Symbol(""),ud=Symbol(""),rl=Symbol(""),Tl=Symbol(""),pd=Symbol(""),ac=Symbol(""),Nx=Symbol(""),nc=Symbol(""),wo=Symbol(""),Dx=Symbol(""),Px=Symbol(""),fd=Symbol(""),Mx=Symbol(""),Fx=Symbol(""),hd=Symbol(""),am=Symbol(""),pi={[ol]:"Fragment",[Gi]:"Teleport",[ed]:"Suspense",[xo]:"KeepAlive",[Yh]:"BaseTransition",[Tn]:"openBlock",[Qh]:"createBlock",[Xh]:"createElementBlock",[td]:"createVNode",[sd]:"createElementVNode",[Sl]:"createCommentVNode",[ad]:"createTextVNode",[em]:"createStaticVNode",[nd]:"resolveComponent",[id]:"resolveDynamicComponent",[ld]:"resolveDirective",[od]:"resolveFilter",[rd]:"withDirectives",[cd]:"renderList",[tm]:"renderSlot",[sm]:"createSlots",[Qo]:"toDisplayString",[_o]:"mergeProps",[dd]:"normalizeClass",[ud]:"normalizeStyle",[rl]:"normalizeProps",[Tl]:"guardReactiveProps",[pd]:"toHandlers",[ac]:"camelize",[Nx]:"capitalize",[nc]:"toHandlerKey",[wo]:"setBlockTracking",[Dx]:"pushScopeId",[Px]:"popScopeId",[fd]:"withCtx",[Mx]:"unref",[Fx]:"isRef",[hd]:"withMemo",[am]:"isMemoSame"};function $x(e){Object.getOwnPropertySymbols(e).forEach(t=>{pi[t]=e[t]})}const Os={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Ux(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Os}}function cl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Os){return e&&(o?(e.helper(Tn),e.helper(mi(e.inSSR,c))):e.helper(hi(e.inSSR,c)),l&&e.helper(rd)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function _n(e,t=Os){return{type:17,loc:t,elements:e}}function Hs(e,t=Os){return{type:15,loc:t,properties:e}}function Mt(e,t){return{type:16,loc:Os,key:Be(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Os,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Zs(e,t=Os){return{type:8,loc:t,children:e}}function Vt(e,t=[],s=Os){return{type:14,loc:s,callee:e,arguments:t}}function fi(e,t=void 0,s=!1,a=!1,n=Os){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function ic(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Os}}function Bx(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Os}}function Hx(e){return{type:21,body:e,loc:Os}}function hi(e,t){return e||t?td:sd}function mi(e,t){return e||t?Qh:Xh}function md(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(hi(a,e.isComponent)),t(Tn),t(mi(a,e.isComponent)))}const Cu=new Uint8Array([123,123]),Eu=new Uint8Array([125,125]);function Au(e){return e>=97&&e<=122||e>=65&&e<=90}function Es(e){return e===32||e===10||e===9||e===12||e===13}function qa(e){return e===47||e===62||Es(e)}function ko(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class zx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Cu,this.delimiterClose=Eu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Cu,this.delimiterClose=Eu}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?qa(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Es(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Au(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){qa(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(qa(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ko("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Es(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Au(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Es(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Es(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Es(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||qa(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||qa(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||qa(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||qa(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||qa(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Es(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Es(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Es(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Ru(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function wn(e,t){const s=Ru("MODE",t),a=Ru(e,t);return s===3?a===!0:a!==!1}function dl(e,t,s,...a){return wn(e,t)}function vd(e){throw e}function nm(e){}function xt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const ks=e=>e.type===4&&e.isStatic;function im(e){switch(e){case"Teleport":case"teleport":return Gi;case"Suspense":case"suspense":return ed;case"KeepAlive":case"keep-alive":return xo;case"BaseTransition":case"base-transition":return Yh}}const jx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,gd=e=>!jx.test(e),lm=/[A-Za-z_$\xA0-\uFFFF]/,Vx=/[\.\?\w$\xA0-\uFFFF]/,qx=/\s+[.[]\s*|\s*[.[]\s+/g,om=e=>e.type===4?e.content:e.loc.source,Gx=e=>{const t=om(e).trim().replace(qx,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?lm:Vx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},rm=Gx,Kx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Wx=e=>Kx.test(om(e)),Jx=Wx;function Bs(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(Be(t)?n.name===t:t.test(n.name)))return n}}function Xo(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&mn(i.arg,t))return i}}function mn(e,t){return!!(e&&ks(e)&&e.content===t)}function Zx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function wr(e){return e.type===5||e.type===2}function Iu(e){return e.type===7&&e.name==="pre"}function Yx(e){return e.type===7&&e.name==="slot"}function So(e){return e.type===1&&e.tagType===3}function To(e){return e.type===1&&e.tagType===2}const Qx=new Set([rl,Tl]);function cm(e,t=[]){if(e&&!Be(e)&&e.type===14){const s=e.callee;if(!Be(s)&&Qx.has(s))return cm(e.arguments[0],t.concat(e))}return[e,t]}function Co(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!Be(n)&&n.type===14){const o=cm(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||Be(n))a=Hs([t]);else if(n.type===14){const o=n.arguments[0];!Be(o)&&o.type===15?Ou(t,o)||o.properties.unshift(t):n.callee===pd?a=Vt(s.helper(_o),[Hs([t]),n]):n.arguments.unshift(Hs([t])),!a&&(a=n)}else n.type===15?(Ou(t,n)||n.properties.unshift(t),a=n):(a=Vt(s.helper(_o),[Hs([t]),n]),l&&l.callee===Tl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Ou(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function ul(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function Xx(e){return e.type===14&&e.callee===hd?e.arguments[1].returns:e}const e0=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function dm(e){for(let t=0;t<e.length;t++)if(!Es(e.charCodeAt(t)))return!1;return!0}function bd(e){return e.type===2&&dm(e.content)||e.type===12&&bd(e.content)}function um(e){return e.type===3||bd(e)}const pm={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Wn,isPreTag:Wn,isIgnoreNewlineTag:Wn,isCustomElement:Wn,onError:vd,onWarn:nm,comments:!1,prefixIdentifiers:!1};let it=pm,pl=null,La="",as=null,Xe=null,bs="",xa=-1,pn=-1,yd=0,Ya=!1,lc=null;const yt=[],At=new zx(yt,{onerr:ga,ontext(e,t){Ul(Zt(e,t),e,t)},ontextentity(e,t,s){Ul(e,t,s)},oninterpolation(e,t){if(Ya)return Ul(Zt(e,t),e,t);let s=e+At.delimiterOpen.length,a=t-At.delimiterClose.length;for(;Es(La.charCodeAt(s));)s++;for(;Es(La.charCodeAt(a-1));)a--;let n=Zt(s,a);n.includes("&")&&(n=it.decodeEntities(n,!1)),oc({type:5,content:Yl(n,!1,It(s,a)),loc:It(e,t)})},onopentagname(e,t){const s=Zt(e,t);as={type:1,tag:s,ns:it.getNamespace(s,yt[0],it.ns),tagType:0,props:[],children:[],loc:It(e-1,t),codegenNode:void 0}},onopentagend(e){Nu(e)},onclosetag(e,t){const s=Zt(e,t);if(!it.isVoidTag(s)){let a=!1;for(let n=0;n<yt.length;n++)if(yt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ga(24,yt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=yt.shift();Zl(o,t,l<n)}break}a||ga(23,fm(e,60))}},onselfclosingtag(e){const t=as.tag;as.isSelfClosing=!0,Nu(e),yt[0]&&yt[0].tag===t&&Zl(yt.shift(),e)},onattribname(e,t){Xe={type:6,name:Zt(e,t),nameLoc:It(e,t),value:void 0,loc:It(e)}},ondirname(e,t){const s=Zt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ya&&a===""&&ga(26,e),Ya||a==="")Xe={type:6,name:s,nameLoc:It(e,t),value:void 0,loc:It(e)};else if(Xe={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:It(e)},a==="pre"){Ya=At.inVPre=!0,lc=as;const n=as.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=d0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Zt(e,t);if(Ya&&!Iu(Xe))Xe.name+=s,vn(Xe.nameLoc,t);else{const a=s[0]!=="[";Xe.arg=Yl(a?s:s.slice(1,-1),a,It(e,t),a?3:0)}},ondirmodifier(e,t){const s=Zt(e,t);if(Ya&&!Iu(Xe))Xe.name+="."+s,vn(Xe.nameLoc,t);else if(Xe.name==="slot"){const a=Xe.arg;a&&(a.content+="."+s,vn(a.loc,t))}else{const a=Ve(s,!0,It(e,t));Xe.modifiers.push(a)}},onattribdata(e,t){bs+=Zt(e,t),xa<0&&(xa=e),pn=t},onattribentity(e,t,s){bs+=e,xa<0&&(xa=t),pn=s},onattribnameend(e){const t=Xe.loc.start.offset,s=Zt(t,e);Xe.type===7&&(Xe.rawName=s),as.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ga(2,t)},onattribend(e,t){if(as&&Xe){if(vn(Xe.loc,t),e!==0)if(bs.includes("&")&&(bs=it.decodeEntities(bs,!0)),Xe.type===6)Xe.name==="class"&&(bs=mm(bs).trim()),e===1&&!bs&&ga(13,t),Xe.value={type:2,content:bs,loc:e===1?It(xa,pn):It(xa-1,pn+1)},At.inSFCRoot&&as.tag==="template"&&Xe.name==="lang"&&bs&&bs!=="html"&&At.enterRCDATA(ko("</template"),0);else{let s=0;Xe.exp=Yl(bs,!1,It(xa,pn),0,s),Xe.name==="for"&&(Xe.forParseResult=s0(Xe.exp));let a=-1;Xe.name==="bind"&&(a=Xe.modifiers.findIndex(n=>n.content==="sync"))>-1&&dl("COMPILER_V_BIND_SYNC",it,Xe.loc,Xe.arg.loc.source)&&(Xe.name="model",Xe.modifiers.splice(a,1))}(Xe.type!==7||Xe.name!=="pre")&&as.props.push(Xe)}bs="",xa=pn=-1},oncomment(e,t){it.comments&&oc({type:3,content:Zt(e,t),loc:It(e-4,t+3)})},onend(){const e=La.length;for(let t=0;t<yt.length;t++)Zl(yt[t],e-1),ga(24,yt[t].loc.start.offset)},oncdata(e,t){(yt[0]?yt[0].ns:it.ns)!==0?Ul(Zt(e,t),e,t):ga(1,e-9)},onprocessinginstruction(e){(yt[0]?yt[0].ns:it.ns)===0&&ga(21,e-1)}}),Lu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,t0=/^\(|\)$/g;function s0(e){const t=e.loc,s=e.content,a=s.match(e0);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Yl(u,!1,It(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(t0,"").trim();const c=n.indexOf(r),d=r.match(Lu);if(d){r=r.replace(Lu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Zt(e,t){return La.slice(e,t)}function Nu(e){At.inSFCRoot&&(as.innerLoc=It(e+1,e+1)),oc(as);const{tag:t,ns:s}=as;s===0&&it.isPreTag(t)&&yd++,it.isVoidTag(t)?Zl(as,e):(yt.unshift(as),(s===1||s===2)&&(At.inXML=!0)),as=null}function Ul(e,t,s){{const i=yt[0]&&yt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=it.decodeEntities(e,!1))}const a=yt[0]||pl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,vn(n.loc,s)):a.children.push({type:2,content:e,loc:It(t,s)})}function Zl(e,t,s=!1){s?vn(e.loc,fm(t,60)):vn(e.loc,a0(t,62)+1),At.inSFCRoot&&(e.children.length?e.innerLoc.end=Je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Je({},e.innerLoc.start),e.innerLoc.source=Zt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Ya||(a==="slot"?e.tagType=2:Du(e)?e.tagType=3:i0(e)&&(e.tagType=1)),At.inRCDATA||(e.children=hm(i)),n===0&&it.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&it.isPreTag(a)&&yd--,lc===e&&(Ya=At.inVPre=!1,lc=null),At.inXML&&(yt[0]?yt[0].ns:it.ns)===0&&(At.inXML=!1);{const l=e.props;if(!At.inSFCRoot&&wn("COMPILER_NATIVE_TEMPLATE",it)&&e.tag==="template"&&!Du(e)){const r=yt[0]||pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&dl("COMPILER_INLINE_TEMPLATE",it,o.loc)&&e.children.length&&(o.value={type:2,content:Zt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function a0(e,t){let s=e;for(;La.charCodeAt(s)!==t&&s<La.length-1;)s++;return s}function fm(e,t){let s=e;for(;La.charCodeAt(s)!==t&&s>=0;)s--;return s}const n0=new Set(["if","else","else-if","for","slot"]);function Du({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&n0.has(t[s].name))return!0}return!1}function i0({tag:e,props:t}){if(it.isCustomElement(e))return!1;if(e==="component"||l0(e.charCodeAt(0))||im(e)||it.isBuiltInComponent&&it.isBuiltInComponent(e)||it.isNativeTag&&!it.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(dl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}}else if(a.name==="bind"&&mn(a.arg,"is")&&dl("COMPILER_IS_ON_ELEMENT",it,a.loc))return!0}return!1}function l0(e){return e>64&&e<91}const o0=/\r\n/g;function hm(e){const t=it.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(yd)n.content=n.content.replace(o0,`
`);else if(dm(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&r0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=mm(n.content))}return s?e.filter(Boolean):e}function r0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function mm(e){let t="",s=!1;for(let a=0;a<e.length;a++)Es(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function oc(e){(yt[0]||pl).children.push(e)}function It(e,t){return{start:At.getPos(e),end:t==null?t:At.getPos(t),source:t==null?t:Zt(e,t)}}function c0(e){return It(e.start.offset,e.end.offset)}function vn(e,t){e.end=At.getPos(t),e.source=Zt(e.start.offset,t)}function d0(e){const t={type:6,name:e.rawName,nameLoc:It(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Yl(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ga(e,t,s){it.onError(xt(e,It(t,t)))}function u0(){At.reset(),as=null,Xe=null,bs="",xa=-1,pn=-1,yt.length=0}function p0(e,t){if(u0(),La=e,it=Je({},pm),t){let n;for(n in t)t[n]!=null&&(it[n]=t[n])}At.mode=it.parseMode==="html"?1:it.parseMode==="sfc"?2:0,At.inXML=it.ns===1||it.ns===2;const s=t&&t.delimiters;s&&(At.delimiterOpen=ko(s[0]),At.delimiterClose=ko(s[1]));const a=pl=Ux([],e);return At.parse(La),a.loc=It(0,e.length),a.children=hm(a.children),pl=null,a}function f0(e,t){Ql(e,void 0,t,!!vm(e))}function vm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!To(t[0])?t[0]:null}function Ql(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:As(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&bm(u,s)>=2){const v=ym(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:As(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ql(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Ql(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ql(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ae(e.codegenNode.children))e.codegenNode.children=r(_n(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ae(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(_n(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ae(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Bs(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(_n(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ae(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function As(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=bm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=As(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=As(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Tn),t.removeHelper(mi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(hi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return As(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(Be(o)||os(o))continue;const r=As(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const h0=new Set([dd,ud,rl,Tl]);function gm(e,t){if(e.type===14&&!Be(e.callee)&&h0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return As(s,t);if(s.type===14)return gm(s,t)}return 0}function bm(e,t){let s=3;const a=ym(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=As(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=As(o,t):o.type===14?c=gm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function ym(e){const t=e.codegenNode;if(t.type===13)return t.props}function m0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Xt,isCustomElement:d=Xt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:S="",bindingMetadata:L=Ze,inline:b=!1,isTS:g=!1,onError:y=vd,onWarn:E=nm,compatConfig:_}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&Rn(ht(A[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:S,bindingMetadata:L,inline:b,isTS:g,onError:y,onWarn:E,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const N=T.helpers.get(x)||0;return T.helpers.set(x,N+1),x},removeHelper(x){const N=T.helpers.get(x);if(N){const F=N-1;F?T.helpers.set(x,F):T.helpers.delete(x)}},helperString(x){return`_${pi[T.helper(x)]}`},replaceNode(x){T.parent.children[T.childIndex]=T.currentNode=x},removeNode(x){const N=T.parent.children,F=x?N.indexOf(x):T.currentNode?T.childIndex:-1;!x||x===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>F&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(F,1)},onNodeRemoved:Xt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){Be(x)&&(x=Ve(x)),T.hoists.push(x);const N=Ve(`_hoisted_${T.hoists.length}`,!1,x.loc,2);return N.hoisted=x,N},cache(x,N=!1,F=!1){const k=Bx(T.cached.length,x,N,F);return T.cached.push(k),k}};return T.filters=new Set,T}function v0(e,t){const s=m0(e,t);er(e,s),t.hoistStatic&&f0(e,s),t.ssr||g0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function g0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=vm(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&md(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=cl(t,s(ol),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function b0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];Be(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,er(n,t))}}function er(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ae(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Sl);break;case 5:t.ssr||t.helper(Qo);break;case 9:for(let i=0;i<e.branches.length;i++)er(e.branches[i],t);break;case 10:case 11:case 1:case 0:b0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function xm(e,t){const s=Be(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(Yx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const tr="/*@__PURE__*/",_m=e=>`${pi[e]}: _${pi[e]}`;function y0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${pi[v]}`},push(v,S=-2,L){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function x0(e,t={}){const s=y0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";_0(e,s);const v=d?"ssrRender":"render",L=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${v}(${L}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(_m).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(kr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(kr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),kr(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let b=0;b<e.temps;b++)n(`${b>0?", ":""}_temp${b}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?ls(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function _0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[td,sd,Sl,ad,em].filter(p=>d.includes(p)).map(_m).join(", ");n(`const { ${u} } = _Vue
`,-1)}w0(e.hoists,t),i(),n("return ")}function kr(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?od:t==="component"?nd:ld);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${ul(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function w0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),ls(i,t),a())}t.pure=!1}function xd(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Cl(e,t,s),s&&t.deindent(),t.push("]")}function Cl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];Be(o)?n(o,-3):Ae(o)?xd(o,t):ls(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function ls(e,t){if(Be(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:k0(e,t);break;case 4:wm(e,t);break;case 5:S0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:km(e,t);break;case 3:C0(e,t);break;case 13:E0(e,t);break;case 14:R0(e,t);break;case 15:I0(e,t);break;case 17:O0(e,t);break;case 18:L0(e,t);break;case 19:N0(e,t);break;case 20:D0(e,t);break;case 21:Cl(e.body,t,!0,!1);break}}function k0(e,t){t.push(JSON.stringify(e.content),-3,e)}function wm(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function S0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(tr),s(`${a(Qo)}(`),ls(e.content,t),s(")")}function km(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];Be(a)?t.push(a,-3):ls(a,t)}}function T0(e,t){const{push:s}=t;if(e.type===8)s("["),km(e,t),s("]");else if(e.isStatic){const a=gd(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function C0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(tr),s(`${a(Sl)}(${JSON.stringify(e.content)})`,-3,e)}function E0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(rd)+"("),u&&s(`(${a(Tn)}(${p?"true":""}), `),n&&s(tr);const v=u?mi(t.inSSR,h):hi(t.inSSR,h);s(a(v)+"(",-2,e),Cl(A0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function A0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function R0(e,t){const{push:s,helper:a,pure:n}=t,i=Be(e.callee)?e.callee:a(e.callee);n&&s(tr),s(i+"(",-2,e),Cl(e.arguments,t),s(")")}function I0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];T0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function O0(e,t){xd(e.elements,t)}function L0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${pi[fd]}(`),s("(",-2,e),Ae(i)?Cl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Ae(l)?xd(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function N0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!gd(s.content);u&&l("("),wm(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,ls(n,t),d||t.indentLevel--,i&&r(!0)}function D0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(wo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(wo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const P0=xm(/^(?:if|else|else-if)$/,(e,t,s)=>M0(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Mu(n,r,s);else{const c=F0(a.codegenNode);c.alternate=Mu(n,r+a.branches.length-1,s)}}}));function M0(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(xt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=Pu(e,t),i={type:9,loc:c0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&um(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(xt(30,e.loc)),s.removeNode();const o=Pu(e,t);l.branches.push(o);const r=a&&a(l,o,!1);er(o,s),r&&r(),s.currentNode=null}else s.onError(xt(30,e.loc));break}}}function Pu(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Bs(e,"for")?e.children:[e],userKey:Xo(e,"key"),isTemplateIf:s}}function Mu(e,t,s){return e.condition?ic(e.condition,Fu(e,t,s),Vt(s.helper(Sl),['""',"true"])):Fu(e,t,s)}function Fu(e,t,s){const{helper:a}=s,n=Mt("key",Ve(`${t}`,!1,Os,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Co(r,n,s),r}else return cl(s,a(ol),Hs([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Xx(r);return c.type===13&&md(c,s),Co(c,n,s),r}}function F0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const $0=xm("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return U0(e,t,s,i=>{const l=Vt(a(cd),[i.source]),o=So(e),r=Bs(e,"memo"),c=Xo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Mt("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=cl(s,a(ol),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,S=v.length!==1||v[0].type!==1,L=To(e)?e:o&&e.children.length===1&&To(e.children[0])?e.children[0]:null;if(L?(m=L.codegenNode,o&&u&&Co(m,u,s)):S?m=cl(s,a(ol),u?Hs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Co(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Tn),n(mi(s.inSSR,m.isComponent))):n(hi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Tn),a(mi(s.inSSR,m.isComponent))):a(hi(s.inSSR,m.isComponent))),r){const b=fi(rc(i.parseResult,[Ve("_cached")]));b.body=Hx([Zs(["const _memo = (",r.exp,")"]),Zs(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(am)}(_cached, _memo)) return _cached`]),Zs(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(b,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(fi(rc(i.parseResult),m,!0))}})});function U0(e,t,s,a){if(!t.exp){s.onError(xt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(xt(32,t.loc));return}Sm(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:So(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function Sm(e,t){e.finalized||(e.finalized=!0)}function rc({value:e,key:t,index:s},a=[]){return B0([e,t,s,...a])}function B0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const $u=Ve("undefined",!1),H0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Bs(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},z0=(e,t,s,a)=>fi(e,s,!1,!0,s.length?s[0].loc:a);function j0(e,t,s=z0){t.helper(fd);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Bs(e,"slot",!0);if(r){const{arg:S,exp:L}=r;S&&!ks(S)&&(o=!0),i.push(Mt(S||Ve("default",!0),s(L,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let S=0;S<a.length;S++){const L=a[S];let b;if(!So(L)||!(b=Bs(L,"slot",!0))){L.type!==3&&u.push(L);continue}if(r){t.onError(xt(37,b.loc));break}c=!0;const{children:g,loc:y}=L,{arg:E=Ve("default",!0),exp:_,loc:A}=b;let T;ks(E)?T=E?E.content:"default":o=!0;const x=Bs(L,"for"),N=s(_,x,g,y);let F,k;if(F=Bs(L,"if"))o=!0,l.push(ic(F.exp,Bl(E,N,h++),$u));else if(k=Bs(L,/^else(?:-if)?$/,!0)){let P=S,B;for(;P--&&(B=a[P],!!um(B)););if(B&&So(B)&&Bs(B,/^(?:else-)?if$/)){let K=l[l.length-1];for(;K.alternate.type===19;)K=K.alternate;K.alternate=k.exp?ic(k.exp,Bl(E,N,h++),$u):Bl(E,N,h++)}else t.onError(xt(30,k.loc))}else if(x){o=!0;const P=x.forParseResult;P?(Sm(P),l.push(Vt(t.helper(cd),[P.source,fi(rc(P),Bl(E,N),!0)]))):t.onError(xt(32,x.loc))}else{if(T){if(p.has(T)){t.onError(xt(38,A));continue}p.add(T),T==="default"&&(d=!0)}i.push(Mt(E,N))}}if(!r){const S=(L,b)=>{const g=s(L,void 0,b,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Mt("default",g)};c?u.length&&!u.every(bd)&&(d?t.onError(xt(39,u[0].loc)):i.push(S(void 0,u))):i.push(S(void 0,a))}const m=o?2:Xl(e.children)?3:1;let v=Hs(i.concat(Mt("_",Ve(m+"",!1))),n);return l.length&&(v=Vt(t.helper(sm),[v,_n(l)])),{slots:v,hasDynamicSlots:o}}function Bl(e,t,s){const a=[Mt("name",e),Mt("fn",t)];return s!=null&&a.push(Mt("key",Ve(String(s),!0))),Hs(a)}function Xl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Xl(s.children))return!0;break;case 9:if(Xl(s.branches))return!0;break;case 10:case 11:if(Xl(s.children))return!0;break}}return!1}const Tm=new WeakMap,V0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?q0(e,t):`"${a}"`;const o=lt(l)&&l.callee===id;let r,c,d=0,u,p,h,m=o||l===Gi||l===ed||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const v=Cm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const S=v.directives;h=S&&S.length?_n(S.map(L=>K0(L,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===xo&&(m=!0,d|=1024),i&&l!==Gi&&l!==xo){const{slots:S,hasDynamicSlots:L}=j0(e,t);c=S,L&&(d|=1024)}else if(e.children.length===1&&l!==Gi){const S=e.children[0],L=S.type,b=L===5||L===8;b&&As(S,t)===0&&(d|=1),b||L===2?c=S:c=e.children}else c=e.children;p&&p.length&&(u=W0(p)),e.codegenNode=cl(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function q0(e,t,s=!1){let{tag:a}=e;const n=cc(a),i=Xo(e,"is",!1,!0);if(i)if(n||wn("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return Vt(t.helper(id),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=im(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(nd),t.components.add(a),ul(a,"component"))}function Cm(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,S=!1,L=!1,b=!1,g=!1,y=!1;const E=[],_=N=>{c.length&&(d.push(Hs(Uu(c),o)),c=[]),N&&d.push(N)},A=()=>{t.scopes.vFor>0&&c.push(Mt(Ve("ref_for",!0),Ve("true")))},T=({key:N,value:F})=>{if(ks(N)){const k=N.content,P=En(k);if(P&&(!a||n)&&k.toLowerCase()!=="onclick"&&k!=="onUpdate:modelValue"&&!Ra(k)&&(b=!0),P&&Ra(k)&&(y=!0),P&&F.type===14&&(F=F.arguments[0]),F.type===20||(F.type===4||F.type===8)&&As(F,t)>0)return;k==="ref"?v=!0:k==="class"?S=!0:k==="style"?L=!0:k!=="key"&&!E.includes(k)&&E.push(k),a&&(k==="class"||k==="style")&&!E.includes(k)&&E.push(k)}else g=!0};for(let N=0;N<s.length;N++){const F=s[N];if(F.type===6){const{loc:k,name:P,nameLoc:B,value:K}=F;let C=!0;if(P==="ref"&&(v=!0,A()),P==="is"&&(cc(l)||K&&K.content.startsWith("vue:")||wn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Mt(Ve(P,!0,B),Ve(K?K.content:"",C,K?K.loc:k)))}else{const{name:k,arg:P,exp:B,loc:K,modifiers:C}=F,I=k==="bind",O=k==="on";if(k==="slot"){a||t.onError(xt(40,K));continue}if(k==="once"||k==="memo"||k==="is"||I&&mn(P,"is")&&(cc(l)||wn("COMPILER_IS_ON_ELEMENT",t))||O&&i)continue;if((I&&mn(P,"key")||O&&p&&mn(P,"vue:before-update"))&&(h=!0),I&&mn(P,"ref")&&A(),!P&&(I||O)){if(g=!0,B)if(I){if(_(),wn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(B);continue}A(),_(),d.push(B)}else _({type:14,loc:K,callee:t.helper(pd),arguments:a?[B]:[B,"true"]});else t.onError(xt(I?34:35,K));continue}I&&C.some(Q=>Q.content==="prop")&&(m|=32);const $=t.directiveTransforms[k];if($){const{props:Q,needRuntime:G}=$(F,e,t);!i&&Q.forEach(T),O&&P&&!ks(P)?_(Hs(Q,o)):c.push(...Q),G&&(u.push(F),os(G)&&Tm.set(F,G))}else $v(k)||(u.push(F),p&&(h=!0))}}let x;if(d.length?(_(),d.length>1?x=Vt(t.helper(_o),d,o):x=d[0]):c.length&&(x=Hs(Uu(c),o)),g?m|=16:(S&&!a&&(m|=2),L&&!a&&(m|=4),E.length&&(m|=8),b&&(m|=32)),!h&&(m===0||m===32)&&(v||y||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let N=-1,F=-1,k=!1;for(let K=0;K<x.properties.length;K++){const C=x.properties[K].key;ks(C)?C.content==="class"?N=K:C.content==="style"&&(F=K):C.isHandlerKey||(k=!0)}const P=x.properties[N],B=x.properties[F];k?x=Vt(t.helper(rl),[x]):(P&&!ks(P.value)&&(P.value=Vt(t.helper(dd),[P.value])),B&&(L||B.value.type===4&&B.value.content.trim()[0]==="["||B.value.type===17)&&(B.value=Vt(t.helper(ud),[B.value])));break;case 14:break;default:x=Vt(t.helper(rl),[Vt(t.helper(Tl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:E,shouldUseBlock:h}}function Uu(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||En(i))&&G0(l,n):(t.set(i,n),s.push(n))}return s}function G0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=_n([e.value,t.value],e.loc)}function K0(e,t){const s=[],a=Tm.get(e);a?s.push(t.helperString(a)):(t.helper(ld),t.directives.add(e.name),s.push(ul(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push(Hs(e.modifiers.map(l=>Mt(l,i)),n))}return _n(s,e.loc)}function W0(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function cc(e){return e==="component"||e==="Component"}const J0=(e,t)=>{if(To(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=Z0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=fi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Vt(t.helper(tm),l,a)}};function Z0(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ht(l.name),n.push(l)));else if(l.name==="bind"&&mn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=ht(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ks(l.arg)&&(l.arg.content=ht(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Cm(e,t,n,!1,!1);a=i,l.length&&t.onError(xt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Em=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(xt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Xn(ht(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Zs([`${s.helperString(nc)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(nc)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=rm(r),p=!(u||Jx(r)),h=r.content.includes(";");(p||c&&u)&&(r=Zs([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Mt(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Y0=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=ht(i.content):i.content=`${s.helperString(ac)}(${i.content})`:(i.children.unshift(`${s.helperString(ac)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Bu(i,"."),a.some(o=>o.content==="attr")&&Bu(i,"^")),{props:[Mt(i,l)]}},Bu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Q0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(wr(r))a||(a=s[i]=Zs([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(wr(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&As(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Vt(t.helper(ad),o)}}}}},Hu=new WeakSet,X0=(e,t)=>{if(e.type===1&&Bs(e,"once",!0))return Hu.has(e)||t.inVOnce||t.inSSR?void 0:(Hu.add(e),t.inVOnce=!0,t.helper(wo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Am=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(xt(41,e.loc)),Ai();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(xt(44,a.loc)),Ai();if(o==="literal-const"||o==="setup-const")return s.onError(xt(45,a.loc)),Ai();if(!l.trim()||!rm(a))return s.onError(xt(42,a.loc)),Ai();const r=n||Ve("modelValue",!0),c=n?ks(n)?`onUpdate:${ht(n.content)}`:Zs(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Zs([`${u} => ((`,a,") = $event)"]);const p=[Mt(r,e.exp),Mt(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(gd(v)?v:JSON.stringify(v))+": true").join(", "),m=n?ks(n)?`${n.content}Modifiers`:Zs([n,' + "Modifiers"']):"modelModifiers";p.push(Mt(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ai(p)};function Ai(e=[]){return{props:e}}const e_=/[\w).+\-_$\]]/,t_=(e,t)=>{wn("COMPILER_FILTERS",t)&&(e.type===5?Eo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Eo(s.exp,t)}))};function Eo(e,t){if(e.type===4)zu(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?zu(a,t):a.type===8?Eo(e,t):a.type===5&&Eo(a.content,t))}}function zu(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):S();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let L=h-1,b;for(;L>=0&&(b=s.charAt(L),b===" ");L--);(!b||!e_.test(b))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&S();function S(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=s_(m,v[h],t);e.content=m,e.ast=void 0}}function s_(e,t,s){s.helper(od);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${ul(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${ul(n,"filter")}(${e}${i!==")"?","+i:i}`}}const ju=new WeakSet,a_=(e,t)=>{if(e.type===1){const s=Bs(e,"memo");return!s||ju.has(e)||t.inSSR?void 0:(ju.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&md(a,t),e.codegenNode=Vt(t.helper(hd),[s.exp,fi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},n_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(xt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=ht(a.content);(lm.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function i_(e){return[[n_,X0,P0,a_,$0,t_,J0,V0,H0,Q0],{on:Em,bind:Y0,model:Am}]}function l_(e,t={}){const s=t.onError||vd,a=t.mode==="module";t.prefixIdentifiers===!0?s(xt(48)):a&&s(xt(49));const n=!1;t.cacheHandlers&&s(xt(50)),t.scopeId&&!a&&s(xt(51));const i=Je({},t,{prefixIdentifiers:n}),l=Be(e)?p0(e,i):e,[o,r]=i_();return v0(l,Je({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Je({},r,t.directiveTransforms||{})})),x0(l,i)}const o_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Rm=Symbol(""),Im=Symbol(""),Om=Symbol(""),Lm=Symbol(""),dc=Symbol(""),Nm=Symbol(""),Dm=Symbol(""),Pm=Symbol(""),Mm=Symbol(""),Fm=Symbol("");$x({[Rm]:"vModelRadio",[Im]:"vModelCheckbox",[Om]:"vModelText",[Lm]:"vModelSelect",[dc]:"vModelDynamic",[Nm]:"withModifiers",[Dm]:"withKeys",[Pm]:"vShow",[Mm]:"Transition",[Fm]:"TransitionGroup"});let Bn;function r_(e,t=!1){return Bn||(Bn=document.createElement("div")),t?(Bn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Bn.children[0].getAttribute("foo")):(Bn.innerHTML=e,Bn.textContent)}const c_={parseMode:"html",isVoidTag:tg,isNativeTag:e=>Qv(e)||Xv(e)||eg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:r_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Mm;if(e==="TransitionGroup"||e==="transition-group")return Fm},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},d_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:u_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},u_=(e,t)=>{const s=Jp(e);return Ve(JSON.stringify(s),!1,t,3)};function tn(e,t){return xt(e,t)}const p_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(54,n)),t.children.length&&(s.onError(tn(55,n)),t.children.length=0),{props:[Mt(Ve("innerHTML",!0,n),a||Ve("",!0))]}},f_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(56,n)),t.children.length&&(s.onError(tn(57,n)),t.children.length=0),{props:[Mt(Ve("textContent",!0),a?As(a,s)>0?a:Vt(s.helperString(Qo),[a],n):Ve("",!0))]}},h_=(e,t,s)=>{const a=Am(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(tn(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Om,o=!1;if(n==="input"||i){const r=Xo(t,"type");if(r){if(r.type===7)l=dc;else if(r.value)switch(r.value.content){case"radio":l=Rm;break;case"checkbox":l=Im;break;case"file":o=!0,s.onError(tn(60,e.loc));break}}else Zx(t)&&(l=dc)}else n==="select"&&(l=Lm);o||(a.needRuntime=s.helper(l))}else s.onError(tn(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},m_=Is("passive,once,capture"),v_=Is("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),g_=Is("left,right"),$m=Is("onkeyup,onkeydown,onkeypress"),b_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&dl("COMPILER_V_ON_NATIVE",s)||m_(r)?l.push(r):g_(r)?ks(e)?$m(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):v_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},Vu=(e,t)=>ks(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Zs(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,y_=(e,t,s)=>Em(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=b_(i,n,s,e.loc);if(r.includes("right")&&(i=Vu(i,"onContextmenu")),r.includes("middle")&&(i=Vu(i,"onMouseup")),r.length&&(l=Vt(s.helper(Nm),[l,JSON.stringify(r)])),o.length&&(!ks(i)||$m(i.content.toLowerCase()))&&(l=Vt(s.helper(Dm),[l,JSON.stringify(o)])),c.length){const d=c.map(Rn).join("");i=ks(i)?Ve(`${i.content}${d}`,!0):Zs(["(",i,`) + "${d}"`])}return{props:[Mt(i,l)]}}),x_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(tn(62,n)),{props:[],needRuntime:s.helper(Pm)}},__=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},w_=[d_],k_={cloak:o_,html:p_,text:f_,model:h_,on:y_,show:x_};function S_(e,t={}){return l_(e,Je({},c_,t,{nodeTransforms:[__,...w_,...t.nodeTransforms||[]],directiveTransforms:Je({},k_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const qu=Object.create(null);function T_(e,t){if(!Be(e))if(e.nodeType)e=e.innerHTML;else return Xt;const s=Hv(e,t),a=qu[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Je({hoistStatic:!0,onError:void 0,onWarn:Xt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=S_(e,n),l=new Function("Vue",i)(Lx);return l._rc=!0,qu[s]=l}_h(T_);const Ao=an({items:[]});let C_=1;function sr(e,t="info",s=3e3){const a=C_++;return Ao.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>_d(a),s),a}function _d(e){const t=Ao.items.findIndex(s=>s.id===e);t>=0&&Ao.items.splice(t,1)}function we(e,t="info",s=3e3){return sr(e,t,s)}we.success=(e,t=3e3)=>sr(e,"success",t);we.error=(e,t=5e3)=>sr(e,"error",t);we.info=(e,t=3e3)=>sr(e,"info",t);we.dismiss=_d;const E_={setup(){return{state:Ao,dismiss:_d}},template:`
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
  `},ka=an({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ii=null;function Kt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return ii&&ii(!1),ka.title=e,ka.message=t,ka.confirmLabel=s,ka.cancelLabel=a,ka.danger=n,ka.open=!0,new Promise(i=>{ii=i})}function Gu(e){ka.open=!1,ii&&(ii(e),ii=null)}const A_={setup(){function e(t){ka.open&&t.key==="Escape"&&(t.stopPropagation(),Gu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:ka,settle:Gu}},template:`
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
 */const Gn=typeof document<"u";function Um(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function R_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Um(e.default)}const dt=Object.assign;function Sr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Qs(n)?n.map(e):e(n)}return s}const Ki=()=>{},Qs=Array.isArray;function Ku(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Bm=/#/g,I_=/&/g,O_=/\//g,L_=/=/g,N_=/\?/g,Hm=/\+/g,D_=/%5B/g,P_=/%5D/g,zm=/%5E/g,M_=/%60/g,jm=/%7B/g,F_=/%7C/g,Vm=/%7D/g,$_=/%20/g;function wd(e){return e==null?"":encodeURI(""+e).replace(F_,"|").replace(D_,"[").replace(P_,"]")}function U_(e){return wd(e).replace(jm,"{").replace(Vm,"}").replace(zm,"^")}function uc(e){return wd(e).replace(Hm,"%2B").replace($_,"+").replace(Bm,"%23").replace(I_,"%26").replace(M_,"`").replace(jm,"{").replace(Vm,"}").replace(zm,"^")}function B_(e){return uc(e).replace(L_,"%3D")}function H_(e){return wd(e).replace(Bm,"%23").replace(N_,"%3F")}function z_(e){return H_(e).replace(O_,"%2F")}function fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const j_=/\/$/,V_=e=>e.replace(j_,"");function Tr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=W_(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:fl(l)}}function q_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Wu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function G_(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&vi(t.matched[a],s.matched[n])&&qm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function vi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function qm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!K_(e[s],t[s]))return!1;return!0}function K_(e,t){return Qs(e)?Ju(e,t):Qs(t)?Ju(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Ju(e,t){return Qs(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function W_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const Ga={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let pc=(function(e){return e.pop="pop",e.push="push",e})({}),Cr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function J_(e){if(!e)if(Gn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),V_(e)}const Z_=/^[^#]+#/;function Y_(e,t){return e.replace(Z_,"#")+t}function Q_(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const ar=()=>({left:window.scrollX,top:window.scrollY});function X_(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Q_(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Zu(e,t){return(history.state?history.state.position-t:-1)+e}const fc=new Map;function ew(e,t){fc.set(e,t)}function tw(e){const t=fc.get(e);return fc.delete(e),t}function sw(e){return typeof e=="string"||e&&typeof e=="object"}function Gm(e){return typeof e=="string"||typeof e=="symbol"}let Et=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Km=Symbol("");Et.MATCHER_NOT_FOUND+"",Et.NAVIGATION_GUARD_REDIRECT+"",Et.NAVIGATION_ABORTED+"",Et.NAVIGATION_CANCELLED+"",Et.NAVIGATION_DUPLICATED+"";function gi(e,t){return dt(new Error,{type:e,[Km]:!0},t)}function ba(e,t){return e instanceof Error&&Km in e&&(t==null||!!(e.type&t))}const aw=["params","query","hash"];function nw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of aw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function iw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Hm," "),i=n.indexOf("="),l=fl(i<0?n:n.slice(0,i)),o=i<0?null:fl(n.slice(i+1));if(l in t){let r=t[l];Qs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Yu(e){let t="";for(let s in e){const a=e[s];if(s=B_(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Qs(a)?a.map(n=>n&&uc(n)):[a&&uc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function lw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Qs(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const ow=Symbol(""),Qu=Symbol(""),nr=Symbol(""),kd=Symbol(""),hc=Symbol("");function Ri(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Qa(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(gi(Et.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):sw(p)?r(gi(Et.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Er(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(Um(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Qa(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=R_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Qa(p,s,a,l,o,n)()}))}}return i}function rw(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>vi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>vi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let cw=()=>location.protocol+"//"+location.host;function Wm(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),Wu(o,"")}return Wu(s,e)+a+n}function dw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=Wm(e,location),m=s.value,v=t.value;let S=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}S=v?p.position-v.position:0}else a(h);n.forEach(L=>{L(s.value,m,{delta:S,type:pc.pop,direction:S?S>0?Cr.forward:Cr.back:Cr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(dt({},p.state,{scroll:ar()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Xu(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?ar():null}}function uw(e){const{history:t,location:s}=window,a={value:Wm(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:cw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,dt({},t.state,Xu(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=dt({},n.value,t.state,{forward:r,scroll:ar()});i(d.current,d,!0),i(r,dt({},Xu(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function pw(e){e=J_(e);const t=uw(e),s=dw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=dt({location:"",base:e,go:a,createHref:Y_.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function fw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),pw(e)}let gn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var zt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(zt||{});const hw={type:gn.Static,value:""},mw=/[a-zA-Z0-9_]/;function vw(e){if(!e)return[[]];if(e==="/")return[[hw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=zt.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===zt.Static?i.push({type:gn.Static,value:c}):s===zt.Param||s===zt.ParamRegExp||s===zt.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:gn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==zt.ParamRegExp){a=s,s=zt.EscapeNext;continue}switch(s){case zt.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=zt.Param):p();break;case zt.EscapeNext:p(),s=a;break;case zt.Param:r==="("?s=zt.ParamRegExp:mw.test(r)?p():(u(),s=zt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case zt.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=zt.ParamRegExpEnd:d+=r;break;case zt.ParamRegExpEnd:u(),s=zt.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===zt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const ep="[^/]+?",gw={sensitive:!1,strict:!1,start:!0,end:!0};var ds=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ds||{});const bw=/[.+*?^${}()[\]/\\]/g;function yw(e,t){const s=dt({},gw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ds.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=ds.Segment+(s.sensitive?ds.BonusCaseSensitive:0);if(p.type===gn.Static)u||(n+="/"),n+=p.value.replace(bw,"\\$&"),h+=ds.Static;else if(p.type===gn.Param){const{value:m,repeatable:v,optional:S,regexp:L}=p;i.push({name:m,repeatable:v,optional:S});const b=L||ep;if(b!==ep){h+=ds.BonusCustomRegExp;try{`${b}`}catch(y){throw new Error(`Invalid custom RegExp for param "${m}" (${b}): `+y.message)}}let g=v?`((?:${b})(?:/(?:${b}))*)`:`(${b})`;u||(g=S&&c.length<2?`(?:/${g})`:"/"+g),S&&(g+="?"),n+=g,h+=ds.Dynamic,S&&(h+=ds.BonusOptional),v&&(h+=ds.BonusRepeatable),b===".*"&&(h+=ds.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=ds.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===gn.Static)d+=h.value;else if(h.type===gn.Param){const{value:m,repeatable:v,optional:S}=h,L=m in c?c[m]:"";if(Qs(L)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const b=Qs(L)?L.join("/"):L;if(!b)if(S)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=b}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function xw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===ds.Static+ds.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ds.Static+ds.Segment?1:-1:0}function Jm(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=xw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(tp(a))return 1;if(tp(n))return-1}return n.length-a.length}function tp(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const _w={strict:!1,end:!0,sensitive:!1};function ww(e,t,s){const a=yw(vw(e.path),s),n=dt(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function kw(e,t){const s=[],a=new Map;t=Ku(_w,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,v=ap(u);v.aliasOf=h&&h.record;const S=Ku(t,u),L=[v];if("alias"in u){const y=typeof u.alias=="string"?[u.alias]:u.alias;for(const E of y)L.push(ap(dt({},v,{components:h?h.record.components:v.components,path:E,aliasOf:h?h.record:v})))}let b,g;for(const y of L){const{path:E}=y;if(p&&E[0]!=="/"){const _=p.record.path,A=_[_.length-1]==="/"?"":"/";y.path=p.record.path+(E&&A+E)}if(b=ww(y,p,S),h?h.alias.push(b):(g=g||b,g!==b&&g.alias.push(b),m&&u.name&&!np(b)&&l(u.name)),Zm(b)&&r(b),v.children){const _=v.children;for(let A=0;A<_.length;A++)i(_[A],b,h&&h.children[A])}h=h||b}return g?()=>{l(g)}:Ki}function l(u){if(Gm(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Cw(u,s);s.splice(p,0,u),u.record.name&&!np(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},v,S;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u});S=h.record.name,m=dt(sp(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&sp(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),S=h.record.name);else{if(h=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u,currentLocation:p});S=h.record.name,m=dt({},p.params,u.params),v=h.stringify(m)}const L=[];let b=h;for(;b;)L.unshift(b.record),b=b.parent;return{name:S,path:v,params:m,matched:L,meta:Tw(L)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function sp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function ap(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:Sw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function Sw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function np(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Tw(e){return e.reduce((t,s)=>dt(t,s.meta),{})}function Cw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;Jm(e,t[i])<0?a=i:s=i+1}const n=Ew(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Ew(e){let t=e;for(;t=t.parent;)if(Zm(t)&&Jm(e,t)===0)return t}function Zm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function ip(e){const t=zs(nr),s=zs(kd),a=V(()=>{const r=ca(e.to);return t.resolve(r)}),n=V(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(vi.bind(null,d));if(p>-1)return p;const h=lp(r[c-2]);return c>1&&lp(d)===h&&u[u.length-1].path!==h?u.findIndex(vi.bind(null,r[c-2])):p}),i=V(()=>n.value>-1&&Lw(s.params,a.value.params)),l=V(()=>n.value>-1&&n.value===s.matched.length-1&&qm(s.params,a.value.params));function o(r={}){if(Ow(r)){const c=t[ca(e.replace)?"replace":"push"](ca(e.to)).catch(Ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:V(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Aw(e){return e.length===1?e[0]:e}const Rw=_l({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:ip,setup(e,{slots:t}){const s=an(ip(e)),{options:a}=zs(nr),n=V(()=>({[op(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[op(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Aw(t.default(s));return e.custom?i:ci("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Iw=Rw;function Ow(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Lw(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Qs(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function lp(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const op=(e,t,s)=>e??t??s,Nw=_l({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=zs(hc),n=V(()=>e.route||a.value),i=zs(Qu,0),l=V(()=>{let c=ca(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=V(()=>n.value.matched[l.value]);zi(Qu,V(()=>l.value+1)),zi(ow,o),zi(hc,n);const r=f();return $t(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!vi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return rp(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,S=ci(p,dt({},m,t,{onVnodeUnmounted:L=>{L.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return rp(s.default,{Component:S,route:c})||S}}});function rp(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Dw=Nw;function Pw(e){const t=kw(e.routes,e),s=e.parseQuery||iw,a=e.stringifyQuery||Yu,n=e.history,i=Ri(),l=Ri(),o=Ri(),r=Nc(Ga);let c=Ga;Gn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Sr.bind(null,ae=>""+ae),u=Sr.bind(null,z_),p=Sr.bind(null,fl);function h(ae,be){let q,de;return Gm(ae)?(q=t.getRecordMatcher(ae),de=be):de=ae,t.addRoute(de,q)}function m(ae){const be=t.getRecordMatcher(ae);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(ae=>ae.record)}function S(ae){return!!t.getRecordMatcher(ae)}function L(ae,be){if(be=dt({},be||r.value),typeof ae=="string"){const M=Tr(s,ae,be.path),z=t.resolve({path:M.path},be),ce=n.createHref(M.fullPath);return dt(M,z,{params:p(z.params),hash:fl(M.hash),redirectedFrom:void 0,href:ce})}let q;if(ae.path!=null)q=dt({},ae,{path:Tr(s,ae.path,be.path).path});else{const M=dt({},ae.params);for(const z in M)M[z]==null&&delete M[z];q=dt({},ae,{params:u(M)}),be.params=u(be.params)}const de=t.resolve(q,be),he=ae.hash||"";de.params=d(p(de.params));const Le=q_(a,dt({},ae,{hash:U_(he),path:de.path})),w=n.createHref(Le);return dt({fullPath:Le,hash:he,query:a===Yu?lw(ae.query):ae.query||{}},de,{redirectedFrom:void 0,href:w})}function b(ae){return typeof ae=="string"?Tr(s,ae,r.value.path):dt({},ae)}function g(ae,be){if(c!==ae)return gi(Et.NAVIGATION_CANCELLED,{from:be,to:ae})}function y(ae){return A(ae)}function E(ae){return y(dt(b(ae),{replace:!0}))}function _(ae,be){const q=ae.matched[ae.matched.length-1];if(q&&q.redirect){const{redirect:de}=q;let he=typeof de=="function"?de(ae,be):de;return typeof he=="string"&&(he=he.includes("?")||he.includes("#")?he=b(he):{path:he},he.params={}),dt({query:ae.query,hash:ae.hash,params:he.path!=null?{}:ae.params},he)}}function A(ae,be){const q=c=L(ae),de=r.value,he=ae.state,Le=ae.force,w=ae.replace===!0,M=_(q,de);if(M)return A(dt(b(M),{state:typeof M=="object"?dt({},he,M.state):he,force:Le,replace:w}),be||q);const z=q;z.redirectedFrom=be;let ce;return!Le&&G_(a,de,q)&&(ce=gi(Et.NAVIGATION_DUPLICATED,{to:z,from:de}),G(de,de,!0,!1)),(ce?Promise.resolve(ce):N(z,de)).catch(ie=>ba(ie)?ba(ie,Et.NAVIGATION_GUARD_REDIRECT)?ie:Q(ie):O(ie,z,de)).then(ie=>{if(ie){if(ba(ie,Et.NAVIGATION_GUARD_REDIRECT))return A(dt({replace:w},b(ie.to),{state:typeof ie.to=="object"?dt({},he,ie.to.state):he,force:Le}),be||z)}else ie=k(z,de,!0,w,he);return F(z,de,ie),ie})}function T(ae,be){const q=g(ae,be);return q?Promise.reject(q):Promise.resolve()}function x(ae){const be=Z.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(ae):ae()}function N(ae,be){let q;const[de,he,Le]=rw(ae,be);q=Er(de.reverse(),"beforeRouteLeave",ae,be);for(const M of de)M.leaveGuards.forEach(z=>{q.push(Qa(z,ae,be))});const w=T.bind(null,ae,be);return q.push(w),Oe(q).then(()=>{q=[];for(const M of i.list())q.push(Qa(M,ae,be));return q.push(w),Oe(q)}).then(()=>{q=Er(he,"beforeRouteUpdate",ae,be);for(const M of he)M.updateGuards.forEach(z=>{q.push(Qa(z,ae,be))});return q.push(w),Oe(q)}).then(()=>{q=[];for(const M of Le)if(M.beforeEnter)if(Qs(M.beforeEnter))for(const z of M.beforeEnter)q.push(Qa(z,ae,be));else q.push(Qa(M.beforeEnter,ae,be));return q.push(w),Oe(q)}).then(()=>(ae.matched.forEach(M=>M.enterCallbacks={}),q=Er(Le,"beforeRouteEnter",ae,be,x),q.push(w),Oe(q))).then(()=>{q=[];for(const M of l.list())q.push(Qa(M,ae,be));return q.push(w),Oe(q)}).catch(M=>ba(M,Et.NAVIGATION_CANCELLED)?M:Promise.reject(M))}function F(ae,be,q){o.list().forEach(de=>x(()=>de(ae,be,q)))}function k(ae,be,q,de,he){const Le=g(ae,be);if(Le)return Le;const w=be===Ga,M=Gn?history.state:{};q&&(de||w?n.replace(ae.fullPath,dt({scroll:w&&M&&M.scroll},he)):n.push(ae.fullPath,he)),r.value=ae,G(ae,be,q,w),Q()}let P;function B(){P||(P=n.listen((ae,be,q)=>{if(!ue.listening)return;const de=L(ae),he=_(de,ue.currentRoute.value);if(he){A(dt(he,{replace:!0,force:!0}),de).catch(Ki);return}c=de;const Le=r.value;Gn&&ew(Zu(Le.fullPath,q.delta),ar()),N(de,Le).catch(w=>ba(w,Et.NAVIGATION_ABORTED|Et.NAVIGATION_CANCELLED)?w:ba(w,Et.NAVIGATION_GUARD_REDIRECT)?(A(dt(b(w.to),{force:!0}),de).then(M=>{ba(M,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&!q.delta&&q.type===pc.pop&&n.go(-1,!1)}).catch(Ki),Promise.reject()):(q.delta&&n.go(-q.delta,!1),O(w,de,Le))).then(w=>{w=w||k(de,Le,!1),w&&(q.delta&&!ba(w,Et.NAVIGATION_CANCELLED)?n.go(-q.delta,!1):q.type===pc.pop&&ba(w,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),F(de,Le,w)}).catch(Ki)}))}let K=Ri(),C=Ri(),I;function O(ae,be,q){Q(ae);const de=C.list();return de.length?de.forEach(he=>he(ae,be,q)):console.error(ae),Promise.reject(ae)}function $(){return I&&r.value!==Ga?Promise.resolve():new Promise((ae,be)=>{K.add([ae,be])})}function Q(ae){return I||(I=!ae,B(),K.list().forEach(([be,q])=>ae?q(ae):be()),K.reset()),ae}function G(ae,be,q,de){const{scrollBehavior:he}=e;if(!Gn||!he)return Promise.resolve();const Le=!q&&tw(Zu(ae.fullPath,0))||(de||!q)&&history.state&&history.state.scroll||null;return Ot().then(()=>he(ae,be,Le)).then(w=>w&&X_(w)).catch(w=>O(w,ae,be))}const X=ae=>n.go(ae);let re;const Z=new Set,ue={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:S,getRoutes:v,resolve:L,options:e,push:y,replace:E,go:X,back:()=>X(-1),forward:()=>X(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:C.add,isReady:$,install(ae){ae.component("RouterLink",Iw),ae.component("RouterView",Dw),ae.config.globalProperties.$router=ue,Object.defineProperty(ae.config.globalProperties,"$route",{enumerable:!0,get:()=>ca(r)}),Gn&&!re&&r.value===Ga&&(re=!0,y(n.location).catch(de=>{}));const be={};for(const de in Ga)Object.defineProperty(be,de,{get:()=>r.value[de],enumerable:!0});ae.provide(nr,ue),ae.provide(kd,Lc(be)),ae.provide(hc,r);const q=ae.unmount;Z.add(ae),ae.unmount=function(){Z.delete(ae),Z.size<1&&(c=Ga,P&&P(),P=null,r.value=Ga,re=!1,I=!1),q()}}};function Oe(ae){return ae.reduce((be,q)=>be.then(()=>x(q)),Promise.resolve())}return ue}function Ym(){return zs(nr)}function Mw(e){return zs(kd)}const ir={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Mw(),s=Ym(),a=V({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=V(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});$t(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),pa=e=>Number.isSafeInteger(e)&&e>=0,Fw=e=>e===null||typeof e=="string",Ro=(e,t)=>pa(e)&&pa(t)&&t>=e,Sd=e=>hl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Fw(e.cursor);function $w(e){return!Sd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!pa(e.total_chars)||!pa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Ro(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&Ro(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function cp(e){return Sd(e)&&e.kind==="process_output"&&pa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>pa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Ro(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function Uw(e){return Sd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>pa(e[t]))&&Ro(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&pa(e.tools_omitted)}function mc(e){try{return JSON.parse(e)}catch{return}}const vc=e=>JSON.stringify(e,null,2),Bw=e=>{const t=mc(e);return t===void 0?e:vc(t)},Hl=(e,t,s)=>`[${e}, ${t}) ${s}`;function Qm(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:vc(e)??"";let a=typeof e=="string"?mc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=mc(e.slice(d+c.length)),h=e.slice(0,u);cp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Bw(d):d});if(hl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||pa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...pa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],hl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if($w(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Hl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Hl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(cp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Hl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if(Uw(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Hl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?vc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Xm(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Ar=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Hw=e=>e!==null&&typeof e=="object",zw=new Set(["_hmac","_prev_hmac"]),gc=e=>e.replace(/\r\n?/g,`
`);function ml(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(zw.has(n)){s=!0;return}return i});return gc(s?JSON.stringify(a):t)}catch{return gc(t)}}function jw(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&Hw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function Vw(e){var h;const t=Qm(typeof e=="string"?gc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:ml(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Ar.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=Xm(c,Ar.previewLines,Ar.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:jw(t)}}const qw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=V(()=>Vw(e.value)),c=V(()=>{const y=e.rawValue===void 0?e.value:e.rawValue;return typeof y=="string"?y:JSON.stringify(y,null,2)??""}),d=V(()=>a.value?c.value:r.value.formatted),u=V(()=>r.value.promoted&&r.value.preview.folded||o.value),p=V(()=>t.value?!!d.value:r.value.promoted),h=V(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const y=r.value.promoted?i.value:l.value;o.value=!!(y&&(y.scrollHeight>y.clientHeight+1||y.scrollWidth>y.clientWidth+1))}function S(){m==null||m.disconnect();for(const y of[i.value,l.value])y&&(m==null||m.observe(y));v()}function L(){t.value=!t.value,t.value||(a.value=!1)}function b(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const y=e.value;try{await navigator.clipboard.writeText(d.value),y===e.value&&(n.value="Copied")}catch{y===e.value&&(n.value="Copy unavailable — select text manually")}}return $t([()=>e.value,()=>e.rawValue,()=>e.recordId],(y,E)=>{(e.recordId===null||y[2]!==E[2])&&(t.value=!1,a.value=!1),n.value=""}),$t([i,l,t,s,r],()=>Ot(S),{flush:"post"}),Ge(()=>{m=new ResizeObserver(v),S()}),mt(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:L,toggleRaw:b,copyOutput:g}},template:`
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
    </section>`},lr={name:"ToolOutput",components:{CompactOutput:qw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=V(()=>Qm(e.value)),l=V(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=V(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=Xm(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=V(()=>o.value.some(u=>u.folded)),c=V(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return $t(()=>e.value,()=>{t.value=!1,n.value=""}),$t(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},Gw={components:{ToolOutput:lr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var v,S,L,b,g,y,E,_,A,T,x;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(S=h.metadata)!=null&&S.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const N=h.call_id||((L=h.metadata)==null?void 0:L.call_id)||null,F=h.agent_id||((b=h.metadata)==null?void 0:b.agent_id)||"",k={callId:N,agentId:F,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:N?`${F}:${N}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((y=h.metadata)==null?void 0:y.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(k);return}if(m==="tool_end"||m==="loop_tool"){const N=h.call_id||((E=h.metadata)==null?void 0:E.call_id)||null,F=h.agent_id||((_=h.metadata)==null?void 0:_.agent_id)||"";let k=-1;if(N&&(k=e.value.findIndex(P=>P.callId===N&&P.agentId===F&&P.status==="running")),k<0&&!N)for(let P=e.value.length-1;P>=0;P--){const B=e.value[P];if(B.tool===h.action&&B.agentId===F&&B.status==="running"){k=P;break}}if(k>=0){const P=e.value[k];P.status=h.error||(A=h.metadata)!=null&&A.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((T=h.metadata)==null?void 0:T.status))?"error":"success",P.elapsed=h.execution_time_ms??h.duration_ms??((x=h.metadata)==null?void 0:x.elapsed_ms)??Date.now()-P.startTime,P.result=h.result_summary??h.detail??"",P.fadingOut=!0,setTimeout(()=>{const B=e.value.indexOf(P);B>=0&&e.value.splice(B,1),t.value.unshift(P),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const N=h.call_id||h.tool_name||"unknown";if(h.finished){const F={...s.value};delete F[N],s.value=F}else{const k=((s.value[N]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[N]:k.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,at.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,at.off("events",n),i&&(clearInterval(i),i=null))}Ge(r),es(r),Wt(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Td(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function On(e){const t=Td(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Kw(e){const t=Td(e);return t?t.toLocaleTimeString():"—"}function ev(e){const t=Td(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Ww(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function bi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Cd(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function tv(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function dp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ed(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function sv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const av=Symbol("agent-detail-cancelled"),Jw=15e3;function Zw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,av),i==null||i.abort()}}}function nv({state:e,requestDetail:t,timeoutMs:s=Jw,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const S=Zw(L=>t(p,{signal:L}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return v.cancel=S.cancel,v.promise=(async()=>{let L=null,b=null;try{L=await S.promise}catch(g){b=g}L!==av&&(l!==v||e.detailId!==p||(l=null,!b&&(L===null||typeof L!="object")&&(b=new Error(`${a} response was empty or invalid`)),b?e.detail===null&&(e.detailError=(b==null?void 0:b.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=L,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Yw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const Qw={components:{ToolOutput:lr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=V(()=>e.value.filter(O=>O.status==="running").length),r=V(()=>e.value.filter(O=>O.status==="completed").length),c=V(()=>e.value.filter(O=>["failed","timeout","killed"].includes(O.status)).length),d=V(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=V(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(O=>["failed","timeout","killed"].includes(O.status)):e.value.filter(O=>O.status===i.value));function p(O){const $=Number(O.max_iterations)||0;return $<=0?0:Math.min(100,Math.round(O.iteration_count/$*100))}function h(O){return(Number(O.max_iterations)||0)>0}function m(O,$){return O?O==="N/A"?"N/A":$==="current_inheritance"?`inherit (currently ${O})`:O:"unknown"}function v(O){return m(O.display_model,O.display_model_source||O.display_source)}function S(O){return m(O.display_reasoning_effort,O.display_reasoning_effort_source||O.display_source)}function L(O){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[O]||""}const b=f(null),g=f(null),y=f(!1),E=f(null),_=f(""),T=nv({state:{get detail(){return b.value},set detail(O){b.value=O},get detailId(){return g.value},set detailId(O){g.value=O},get detailLoading(){return y.value},set detailLoading(O){y.value=O},get detailError(){return E.value},set detailError(O){E.value=O}},requestDetail:(O,{signal:$})=>U.get(`/api/agents/${encodeURIComponent(O)}`,{signal:$})});async function x(O){_.value="",await T.open(O.id)}function N(){T.close(),_.value=""}async function F(){await T.refresh()}async function k(O,$){try{await navigator.clipboard.writeText($||""),_.value=O,setTimeout(()=>{_.value===O&&(_.value="")},1500)}catch{we.error("Copy failed")}}async function P(O=!1){O=O===!0,O||(t.value=!0);try{const $=await U.get("/api/agents");e.value=Array.isArray($)?$:[],s.value=null}catch($){O||(s.value=$.message)}O||(t.value=!1)}async function B(O){const $=e.value.find(G=>G.id===O);if(await Kt({title:"Kill agent",message:`Kill agent "${($==null?void 0:$.label)||O}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=O;try{await U.del(`/api/agents/${encodeURIComponent(O)}`),we.success("Agent killed"),await P()}catch(G){we.error(G.message||"Failed to kill agent")}a.value=null}}const K=Yw({isEnabled:()=>n.value&&l,refreshList:()=>P(!0),hasOpenDetail:()=>!!g.value,refreshDetail:F});function C(){K.start()}function I(){K.stop()}return $t(n,()=>K.sync()),Ge(()=>{l=!0,P(),C()}),es(()=>{l=!0,P(!0),C()}),Wt(()=>{l=!1,I()}),mt(()=>{l=!1,I(),T.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:On,formatDuration:bi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:S,displaySourceLabel:L,detail:b,detailId:g,detailLoading:y,detailError:E,copied:_,openDetail:x,closeDetail:N,copyText:k,fetchAgents:P,killAgent:B,startAutoRefresh:C,stopAutoRefresh:I}}},Xw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const S=nv({state:{get detail(){return c.value},set detail(I){c.value=I},get detailId(){return d.value},set detailId(I){d.value=I},get detailLoading(){return u.value},set detailLoading(I){u.value=I},get detailError(){return p.value},set detailError(I){p.value=I}},detailLabel:"Loop detail",requestDetail:(I,{signal:O})=>U.get(`/api/loops/${encodeURIComponent(I)}?limit=100`,{signal:O})});async function L(I){h.value="",await S.open(I.id)}function b(){S.close(),h.value=""}async function g(I,O){try{await navigator.clipboard.writeText(O||""),h.value=I,setTimeout(()=>{h.value===I&&(h.value="")},1500)}catch{we.error("Copy failed")}}const y=V(()=>e.value.reduce((I,O)=>I+(O.iteration_count||0),0)),E=V(()=>e.value.filter(I=>I.status==="running").length);function _(I){return I==="running"?"loop-status-running":I==="error"?"loop-status-error":"loop-status-stopped"}function A(I){return I==="running"?"badge-success":I==="error"?"badge-danger":I==="completed"?"badge-info":"badge-warning"}function T(I){return I==="act"?"badge-warning":I==="silent"?"badge-info":"badge-success"}async function x(I=!1){I=I===!0,I||(t.value=!0);try{const O=await U.get("/api/loops");e.value=Array.isArray(O)?O:[],s.value=null}catch(O){I||(s.value=O.message)}I||(t.value=!1)}async function N(){l.value=null;const I=n.value;if(!I.goal.trim()){l.value="Goal is required";return}if(!I.channel_id.trim()){l.value="Channel ID is required";return}const O={goal:I.goal.trim(),channel_id:I.channel_id.trim(),interval_seconds:I.interval_seconds||60,mode:I.mode,max_iterations:I.max_iterations||50};I.stop_condition.trim()&&(O.stop_condition=I.stop_condition.trim()),i.value=!0;try{const $=await U.post("/api/loops",O);we.success(`Loop started: ${$.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await x()}catch($){l.value=$.message}i.value=!1}async function F(I){if(await Kt({title:"Stop loop",message:`Stop loop ${I}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=I;try{await U.del(`/api/loops/${encodeURIComponent(I)}`),we.success("Loop stopped"),await x()}catch($){we.error($.message||"Failed to stop loop")}o.value=null}}async function k(I){r.value=I;try{await U.post(`/api/loops/${encodeURIComponent(I)}/restart`),we.success("Loop restarted"),await x()}catch(O){we.error(O.message||"Failed to restart loop")}r.value=null}function P(I){m&&I.payload&&(I.payload.loop_id||I.payload.type==="loop")&&(x(!0),d.value&&S.refresh())}let B=null;function K(){B!==null&&clearInterval(B),B=null}function C(){K(),m&&(B=setInterval(()=>{x(!0),d.value&&S.refresh()},5e3))}return Ge(()=>{m=!0,x(),at.subscribe("events",P),C()}),es(()=>{m=!0,x(!0),C()}),Wt(()=>{m=!1,K()}),mt(()=>{m=!1,at.unsubscribe("events",P),K(),S.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:y,runningCount:E,statusDotClass:_,statusBadge:A,modeBadge:T,formatAge:ev,formatDuration:bi,formatTs:On,formatTokens:sv,openDetail:L,closeDetail:b,copyText:g,fetchLoops:x,doCreate:N,doStop:F,doRestart:k}}},ek={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=V(()=>e.value.filter(b=>b.status==="running").length),o=V(()=>e.value.filter(b=>b.status!=="running").length);function r(b){return b==="running"?"loop-status-running":b==="failed"||b==="error"?"loop-status-error":"loop-status-stopped"}function c(b){return b==="running"?"badge-success":b==="completed"||b==="exited"?"badge-info":b==="killed"||b==="error"||b==="failed"?"badge-danger":"badge-warning"}async function d(b=!1){b=b===!0,b||(t.value=!0);try{e.value=await U.get("/api/processes"),s.value=null}catch(g){b||(s.value=g.message)}b||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}$t(a,b=>{b?u():p()});async function h(b){if(await Kt({title:"Kill process",message:`Kill process ${b}?`,confirmLabel:"Kill",danger:!0})){i.value=b;try{await U.del(`/api/processes/${b}`),we.success(`Process ${b} killed`),await d()}catch(y){we.error(y.message||"Failed to kill process")}i.value=null}}function m(b){b.payload&&(b.payload.pid||b.payload.type==="process")&&d(!0)}let v=!1;function S(){v||(v=!0,d(),at.subscribe("events",m),u())}function L(){v&&(v=!1,at.unsubscribe("events",m),p())}return Ge(S),es(S),Wt(L),mt(L),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:bi,fetchProcesses:d,doKill:h}}},tk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function up(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function sk(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function ak(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function nk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=tk.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const S of new Set([p,h])){const L=new Date(u+S*6e4);sk(L,c)===d&&(m.some(b=>b.getTime()===L.getTime())||m.push(L))}if(m.sort((S,L)=>S.getTime()-L.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(S=>({instant:S,offset:ak(S),iso:S.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const ik={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),o=f(null),r=V(()=>nk(n.value.run_at));$t(()=>n.value.run_at,()=>{o.value=null});const c=V(()=>{var de;const q=r.value;return q.state==="ok"?q.instant:q.state==="ambiguous"&&o.value!==null&&((de=q.options[o.value])==null?void 0:de.instant)||null}),d=V(()=>{const q=c.value;return q?`${q.toLocaleString()} local — ${q.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),S=f(null),L=f(null),b=f(null),g=f(null),y=f([]),E=f(!1),_=f("");let A=0;const T=V(()=>e.value.filter(q=>q.cron&&!q.one_time).length),x=V(()=>e.value.filter(q=>q.one_time).length),N=V(()=>e.value.filter(q=>q.trigger).length),F=V(()=>e.value.filter(q=>q.paused).length),k=V(()=>e.value.filter(q=>q.consecutive_failures>0).length);function P(q){if(!q)return"-";const de=Date.now(),Le=(new Date(q).getTime()-de)/1e3;if(Le<0)return"overdue";if(Le<60)return"in < 1 min";if(Le<3600)return`in ${Math.floor(Le/60)} min`;if(Le<86400){const M=Math.floor(Le/3600),z=Math.floor(Le%3600/60);return z>0?`in ${M}h ${z}m`:`in ${M}h`}const w=Math.floor(Le/86400);return`in ${w} day${w!==1?"s":""}`}function B(q){return q==null?"-":q<1e3?`${q}ms`:q<6e4?`${(q/1e3).toFixed(1)}s`:bi(q/1e3)}function K(q=n.value.cron){n.value.cron=q,up(n.value,"cron"),u.value=null}function C(q=n.value.run_at){n.value.run_at=q,up(n.value,"run_at"),u.value=null}async function I(){const q=n.value.cron.trim();if(q){p.value=!0;try{u.value=await U.post("/api/schedules/validate-cron",{expression:q})}catch(de){u.value={valid:!1,error:de.message}}p.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await U.get("/api/schedules")}catch(q){s.value=q.message}t.value=!1}async function $(q){if(g.value===q){g.value=null,y.value=[];return}g.value=q,E.value=!0,y.value=[];const de=++A;try{const he=await U.get(`/api/schedules/${encodeURIComponent(q)}/history?limit=10`);if(de!==A||g.value!==q)return;y.value=he,_.value=""}catch(he){if(de!==A||g.value!==q)return;y.value=[],_.value=he.message||"Failed to load execution history"}de===A&&(E.value=!1)}async function Q(){l.value=null;const q=n.value;if(!q.description.trim()){l.value="Description is required";return}if(!q.channel_id.trim()){l.value="Channel ID is required";return}if(!q.cron.trim()&&!q.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(q.cron.trim()&&q.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const de={description:q.description.trim(),action:q.action,channel_id:q.channel_id.trim()};if(q.cron.trim()&&(de.cron=q.cron.trim()),q.run_at.trim()){const he=r.value;if(he.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(he.state==="invalid"){l.value="One-time run time is not a valid date";return}const Le=c.value;if(he.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Le){l.value="One-time run time could not be resolved";return}de.run_at=Le.toISOString()}if(q.action==="reminder"&&q.message.trim()&&(de.message=q.message.trim()),q.action==="check"&&(q.tool_name.trim()&&(de.tool_name=q.tool_name.trim()),q.report_format&&(de.report_format=q.report_format),q.tool_input_str.trim()))try{de.tool_input=JSON.parse(q.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await U.post("/api/schedules",de),we.success("Schedule created"),n.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,a.value=!1,await O()}catch(he){l.value=he.message}i.value=!1}async function G(q){m.value=q;try{const de=await U.post(`/api/schedules/${encodeURIComponent(q)}/run`);if(de.status==="failure")we.error(`Execution failed: ${de.error||"unknown error"}`);else{const he=de.warning?`Executed (${de.warning})`:"Executed successfully";we.success(he)}await O()}catch(de){we.error(de.message||"Failed to trigger")}m.value=null}async function X(q){S.value=q.id;const de=!q.paused;try{await U.put(`/api/schedules/${encodeURIComponent(q.id)}`,{paused:de}),we.success(de?"Schedule paused":"Schedule resumed"),await O()}catch(he){we.error(he.message||"Failed to update schedule")}S.value=null}const re=new Map;function Z(q,de){const he=re.get(q.id);he&&clearTimeout(he.timer);const Le={run:()=>ue(q,de),timer:null};Le.timer=setTimeout(()=>{re.delete(q.id),Le.run()},500),re.set(q.id,Le)}async function ue(q,de){b.value=q.id;try{await U.put(`/api/schedules/${encodeURIComponent(q.id)}`,{report_format:de}),we.success(de?"Structured report enabled":"Plain-text report enabled")}catch(he){we.error(`Update failed: ${he.message}`)}finally{await O(),b.value=null}}function Oe(){for(const[q,de]of[...re])clearTimeout(de.timer),re.delete(q),de.run()}async function ae(q){L.value=q;try{await U.post(`/api/schedules/${encodeURIComponent(q)}/reset-failures`),we.success("Failure counters reset"),await O()}catch(de){we.error(de.message||"Failed to reset")}L.value=null}async function be(q){const de=e.value.find(Le=>Le.id===q);if(await Kt({title:"Delete schedule",message:`Delete "${(de==null?void 0:de.description)||q}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=q;try{await U.del(`/api/schedules/${encodeURIComponent(q)}`),we.success("Schedule deleted"),await O()}catch(Le){we.error(Le.message||"Failed to delete schedule")}v.value=null}}return Ge(()=>{O()}),mt(Oe),{schedules:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:S,resettingId:L,reportUpdatingId:b,flushReportFormatTimers:Oe,expandedId:g,history:y,historyLoading:E,historyError:_,cronCount:T,oneTimeCount:x,webhookCount:N,pausedCount:F,failingCount:k,formatTs:On,formatAge:ev,formatFuture:P,formatMs:B,formatDuration:bi,onCronInput:K,onRunAtInput:C,validateCron:I,toggleExpand:$,fetchSchedules:O,doCreate:Q,doRunNow:G,doTogglePause:X,doUpdateReportFormat:Z,doResetFailures:ae,doDelete:be}}},iv=[{id:"live",label:"Live",component:Gw},{id:"agents",label:"Agents",component:Qw},{id:"loops",label:"Loops",component:Xw},{id:"processes",label:"Processes",component:ek},{id:"schedules",label:"Schedules",component:ik}],lk={components:{TabbedPage:ir},setup(){return{tabs:iv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ok={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await U.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const v=new URLSearchParams;n.value.tool&&v.set("tool",n.value.tool),n.value.user&&v.set("user",n.value.user),n.value.keyword&&v.set("q",n.value.keyword),n.value.date&&v.set("date",n.value.date),v.set("limit",String(n.value.limit));const S=v.toString(),L=await U.get(`/api/audit${S?"?"+S:""}`);if(m!==r)return;e.value=Array.isArray(L)?L:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:On,formatDetail:i,truncateBlock:tv,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},pp=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],rk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ck={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=pp,S=rk,L=f([]),b=f(!1),g=f(""),y=f("flat"),E=f(new Set),_=f(""),A=f(""),T=f(""),x=f(null),N=f(!1),F=f(""),k=f(!1);let P=0;$t([_,A,T],()=>{P++,N.value=!1,F.value="",k.value=x.value!==null},{flush:"sync"});function B(){try{const se=localStorage.getItem("odin-session-presets");se&&(L.value=JSON.parse(se))}catch{}}function K(){try{localStorage.setItem("odin-session-presets",JSON.stringify(L.value))}catch{}}const C=V(()=>p.value.trim()!==""||u.value!=="all"),I=V(()=>{let se=[...e.value];const Ee=pp.find(We=>We.id===u.value),De=Ee?Ee.filters:{};if(De.source&&(se=se.filter(We=>We.source===De.source)),De.minMessages&&(se=se.filter(We=>We.message_count>=De.minMessages)),De.hasCompaction&&(se=se.filter(We=>We.has_summary)),De.maxAge!=null){const We=Date.now()/1e3;se=se.filter(Bt=>Bt.last_active&&We-Bt.last_active<=De.maxAge)}if(p.value.trim()){const We=p.value.toLowerCase().trim();se=se.filter(Bt=>(Bt.channel_id||"").toLowerCase().includes(We)||(Bt.last_user_id||"").toLowerCase().includes(We)||(Bt.source||"").toLowerCase().includes(We))}const Qe=h.value,Nt=m.value?1:-1;return se.sort((We,Bt)=>{const Ht=We[Qe]||0,ms=Bt[Qe]||0;return(Ht-ms)*Nt}),se}),O=V(()=>{if(!n.value||!n.value.messages)return[];const se=n.value.messages;if(se.length===0)return[];const Ee=[];let De=[];for(const Qe of se)Qe.role==="user"&&De.length>0&&(Ee.push(De),De=[]),De.push(Qe);return De.length>0&&Ee.push(De),Ee}),$=V(()=>I.value.length>0&&c.value.size===I.value.length);function Q(se){const Ee=se.find(De=>De.role==="user");if(Ee&&Ee.content){const De=Ee.content.slice(0,120);return De.length<Ee.content.length?De+"...":De}return"(no user message)"}function G(se){const Ee=new Set(E.value);Ee.has(se)?Ee.delete(se):Ee.add(se),E.value=Ee}function X(se){u.value=se}function re(se){u.value=se.id,se.filters.searchQuery!=null&&(p.value=se.filters.searchQuery),se.filters.sortBy&&(h.value=se.filters.sortBy)}function Z(){if(!g.value.trim())return;const se={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};L.value=[...L.value,se],K(),b.value=!1,g.value=""}function ue(se){L.value=L.value.filter(Ee=>Ee.id!==se),K(),u.value===se&&(u.value="all")}function Oe(){u.value="all",p.value="",h.value="last_active",m.value=!1}function ae(se){if(!se)return"—";const Ee=Date.now()/1e3-se;if(Ee<60)return"just now";if(Ee<3600){const Qe=Math.floor(Ee/60);return`${Qe} minute${Qe!==1?"s":""} ago`}if(Ee<86400){const Qe=Math.floor(Ee/3600);return`${Qe} hour${Qe!==1?"s":""} ago`}const De=Math.floor(Ee/86400);return`${De} day${De!==1?"s":""} ago`}function be(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function q(se){if(!se)return"";try{return new Date(se*1e3).toLocaleString()}catch{return""}}function de(se){return se==="user"?"bg-gray-900/50 border border-gray-800":se==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function he(se){return se==="user"?"sess-msg-user":se==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Le(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":"badge-warning"}function w(se){return se==="user"?"sess-dot-user":se==="assistant"?"sess-dot-assistant":"sess-dot-system"}function M(se){return se==="user"?"text-cyan-400":se==="assistant"?"text-indigo-400":"text-gray-500"}function z(se){return se?se.length>2e3?se.slice(0,2e3)+`
... (truncated)`:se:""}async function ce(){const se=_.value.trim();if(!se)return;const Ee=++P;N.value=!0,F.value="",k.value=x.value!==null;try{let De=`/api/sessions/search?q=${encodeURIComponent(se)}&limit=50`;A.value.trim()&&(De+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(De+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Qe=await U.get(De);if(Ee!==P)return;x.value=Qe.results||[],k.value=!1}catch(De){if(Ee!==P)return;F.value=De.message||"Search failed. Please retry."}finally{Ee===P&&(N.value=!1)}}function ie(){P++,_.value="",A.value="",T.value="",x.value=null,F.value="",k.value=!1,N.value=!1}function le(se){return se?se.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function me(se){return se==="user"?"fts-result-user":se==="assistant"?"fts-result-assistant":se==="summary"?"fts-result-summary":se==="fts"?"fts-result-fts":se==="channel"?"fts-result-channel":"fts-result-default"}function H(se){return se==="user"?"badge-info":se==="assistant"?"badge-success":se==="summary"?"badge-warning":se==="fts"?"badge-success":"badge-info"}let ee=0;async function Y(){const se=++ee;t.value=!0,s.value=null;try{const Ee=await U.get("/api/sessions");if(se!==ee)return;e.value=Ee}catch(Ee){if(se!==ee)return;s.value=Ee.message}se===ee&&(t.value=!1)}function fe(){s.value=null,Y()}async function pe(se){if(a.value===se){a.value=null,n.value=null,E.value=new Set;return}a.value=se,n.value=null,i.value=!0,E.value=new Set;const Ee=++l;try{const De=await U.get(`/api/sessions/${encodeURIComponent(se)}`);Ee===l&&a.value===se&&(n.value=De)}catch(De){Ee===l&&a.value===se&&(n.value={messages:[],summary:"",error:De.message||"Failed to load session"})}finally{Ee===l&&(i.value=!1)}}function ye(se){const Ee=new Set(c.value);Ee.has(se)?Ee.delete(se):Ee.add(se),c.value=Ee}function Re(){$.value?c.value=new Set:c.value=new Set(I.value.map(se=>se.channel_id))}function ve(se){o.value=se}async function He(){if(o.value){r.value=!0;try{await U.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await Y()}catch(se){s.value=se.message||"Failed to clear session"}r.value=!1,o.value=null}}function Pe(){d.value=!0}async function ze(){if(c.value.size!==0){r.value=!0;try{await U.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await Y()}catch(se){s.value=se.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ye(se,Ee){const De=`/api/sessions/${encodeURIComponent(se)}/export?format=${Ee}`;try{const Qe=await U.getBlob(De),Nt=URL.createObjectURL(Qe),We=document.createElement("a");We.href=Nt,We.download=`session-${se}.${Ee==="text"?"txt":"json"}`,We.click(),URL.revokeObjectURL(Nt)}catch(Qe){s.value=Qe.message||"Failed to export session"}}let ot=null;function nt(se){se.payload&&se.payload.channel_id&&(clearTimeout(ot),ot=setTimeout(()=>{if(Y(),a.value&&se.payload.channel_id===a.value){const Ee=a.value,De=l;U.get(`/api/sessions/${encodeURIComponent(Ee)}`).then(Qe=>{De!==l||a.value!==Ee||(n.value=Qe)}).catch(()=>{})}},2e3))}let J=!1,_e=null;function Ce(){J||(J=!0,Y(),at.subscribe("events",nt),_e=at.onReconnected(()=>Y()))}Ge(()=>{B(),Ce()}),es(()=>{Ce()});function Ne(){J&&(J=!1,at.unsubscribe("events",nt),_e&&(_e(),_e=null),clearTimeout(ot))}return Wt(Ne),mt(Ne),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:$,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:S,filteredSessions:I,hasActiveFilters:C,customPresets:L,showSavePreset:b,newPresetName:g,threadView:y,threads:O,collapsedThreads:E,ftsQuery:_,ftsChannelId:A,ftsUserId:T,ftsResults:x,ftsSearching:N,ftsError:F,ftsStale:k,formatAge:ae,formatTimestamp:be,formatFullTimestamp:q,messageClass:de,threadMsgClass:he,roleBadge:Le,roleDotClass:w,roleLabelClass:M,truncateContent:z,threadSummary:Q,fetchSessions:Y,retry:fe,toggleSession:pe,toggleSelect:ye,toggleSelectAll:Re,confirmClear:ve,clearSession:He,confirmBulkClear:Pe,doBulkClear:ze,exportSession:Ye,applyPreset:X,applyCustomPreset:re,saveCustomPreset:Z,removeCustomPreset:ue,resetFilters:Oe,toggleThread:G,runFtsSearch:ce,clearFtsSearch:ie,highlightSnippet:le,ftsResultClass:me,ftsTypeBadge:H}}},dk={props:["trace"],template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function p(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function h(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function m(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function v(A){n.value===A?n.value=null:(n.value=A,c.value={})}function S(A,T){const x=A+"-"+T;c.value={...c.value,[x]:!c.value[x]}}function L(A,T){return!!c.value[A+"-"+T]}function b(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,E()}async function g(){try{const A=await U.get("/api/trajectories");e.value=A.files||[],r.value=A.count||0}catch{}}let y=0;async function E(){const A=++y;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const T=await U.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(A!==y)return;let x=T.entries||[];d.value.tool_name&&(x=x.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(N=>N.is_error)),d.value.channel_id&&(x=x.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(N=>N.user_id===d.value.user_id)),t.value=x}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const x=T.toString(),N=await U.get(`/api/trajectories/search/query?${x}`);if(A!==y)return;t.value=N.results||[]}}catch(T){if(A!==y)return;a.value=T.message}A===y&&(s.value=!1)}async function _(){if(!l.value.trim())return;const A=++y;s.value=!0,a.value=null,c.value={};try{const T=await U.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==y)return;i.value=T.entry||null,i.value||(a.value="No trace found for this message ID")}catch(T){if(A!==y)return;T.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=T.message}A===y&&(s.value=!1)}return Ge(async()=>{await g(),await E()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:tv,toggleExpand:v,toggleIteration:S,isIterationExpanded:L,clearFilters:b,fetchFiles:g,fetchTraces:E,lookupMessage:_}}};function pk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function fk(e){return e?`${e.approximate?"~":""}${Ed(e.total||0)}`:"0"}const hk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=V(()=>a.value.work||{}),h=V(()=>Math.max(1,...(a.value.activity_over_time||[]).map(_=>Number(_.count||0)))),m=V(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),v=_=>({height:`${Math.max(4,Math.round(Number(_||0)/h.value*100))}%`}),S=V(()=>s.value&&l.value-i.value>3e4);async function L(){const _=++d,A=n.value;try{const T=await U.get(`/api/usage?range=${encodeURIComponent(A)}`);if(_!==d||A!==n.value)return;a.value=T,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(T){_===d&&(t.value=T.message)}finally{_===d&&(e.value=!1)}}function b(_){n.value=_,e.value=!s.value,L()}function g(){e.value=!0,L()}function y(){c||(c=!0,L(),o=setInterval(L,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function E(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(y),es(y),Wt(E),mt(E),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:S,fmtNum:Ed,fmtDuration:pk,tokenLabel:fk,activityTrackStyle:m,activityBar:v,selectRange:b,retry:g}}},lv=[{id:"audit",label:"Audit",component:ok},{id:"sessions",label:"Sessions",component:ck},{id:"traces",label:"Traces",component:uk},{id:"usage",label:"Usage & Activity",component:hk}],mk={components:{TabbedPage:ir},setup(){return{tabs:lv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Rr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],vk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,N){const F=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!F,r.value=F?!!x.global_enabled:null,!F){e.value=N.map(B=>({...B,source:"unknown",enabled:void 0,state:null}));return}const k=new Set(F.map(B=>B.name)),P=N.filter(B=>!k.has(B.name)).map(B=>({...B,source:B.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...F.map(B=>({...B,source:"builtin"})),...P]}async function m(x,N){if(d.value.has(x.name))return;const F=!!N.target.checked,k=new Set(d.value);k.add(x.name),d.value=k;try{const P=await U.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:F});h(P,e.value),s.value=null;try{const B=await U.get("/api/tools");h(P,B)}catch(B){console.warn("Built-in toggle committed; visible catalog refresh failed",B)}}catch(P){N.target.checked=!!x.enabled,s.value=P.message||`Failed to toggle ${x.name}`}finally{const P=new Set(d.value);P.delete(x.name),d.value=P}}const v=V(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),S=V(()=>e.value.filter(x=>x.source==="skill").length),L=V(()=>Object.values(n.value).reduce((x,N)=>x+N,0));function b(x){for(const N of Rr)if(N.id!=="other"&&N.match(x))return N.id;return"other"}const g=V(()=>{let x=e.value;if(a.value){const N=a.value.toLowerCase();x=x.filter(F=>F.name.toLowerCase().includes(N)||(F.description||"").toLowerCase().includes(N))}return o.value&&(x=x.filter(N=>b(N.name)===o.value)),x}),y=V(()=>{const x=new Set;for(const N of e.value)x.add(b(N.name));return Rr.filter(N=>x.has(N.id))}),E=V(()=>{const x=g.value,N={};for(const k of x){const P=b(k.name);N[P]||(N[P]=[]),N[P].push(k)}const F=[];for(const k of Rr)N[k.id]&&N[k.id].length>0&&F.push({label:k.label,icon:k.icon,tools:N[k.id].sort((P,B)=>P.name.localeCompare(B.name))});return F});function _(x){i.value={...i.value,[x]:!i.value[x]}}async function A(){t.value=!0,s.value=null;try{const[x,N,F]=await Promise.all([U.get("/api/tools"),U.get("/api/tools/stats").catch(()=>({})),U.get("/api/tools/builtins").catch(()=>null)]);h(F,x),n.value=N||{}}catch(x){s.value=x.message}t.value=!1}function T(){A()}return Ge(()=>{A()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:S,totalUsage:L,filteredTools:g,groupedTools:E,usedCategories:y,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Cd,toggleExpand:_,refresh:T}}};function gk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function bk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),S=f(null),L=f(!1),b=V(()=>e.value.length),g=V(()=>e.value.reduce((Z,ue)=>Z+(ue.execution_count||0),0)),y=V(()=>e.value.reduce((Z,ue)=>Z+N(ue.code),0)),E=V(()=>{if(!l.value)return e.value;const Z=l.value.toLowerCase();return e.value.filter(ue=>ue.name.toLowerCase().includes(Z)||(ue.description||"").toLowerCase().includes(Z))}),_=V(()=>u.value?u.value.split(`
`).length:0),A=V(()=>{const Z=Math.max(_.value,1);return Array.from({length:Z},(ue,Oe)=>Oe+1).join(`
`)}),T=V(()=>{const Z=u.value.trim();return Z?Z.includes("SKILL_DEFINITION")?Z.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(Z){return gk(Z)}function N(Z){return Z?Z.split(`
`).length:0}function F(Z){return bk(Z)}function k(Z){a.value={...a.value,[Z]:!a.value[Z]}}async function P(Z){try{await navigator.clipboard.writeText(Z);const ue=e.value.find(Oe=>Oe.code===Z);ue&&(o.value=ue.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function B(Z){if(Z.key==="Tab"){Z.preventDefault();const ue=Z.target,Oe=ue.selectionStart,ae=ue.selectionEnd;u.value=u.value.substring(0,Oe)+"    "+u.value.substring(ae),Ot(()=>{ue.selectionStart=ue.selectionEnd=Oe+4})}}function K(Z){const ue=Z.target.previousElementSibling;ue&&(ue.scrollTop=Z.target.scrollTop)}async function C(){t.value=!0,s.value=null;try{e.value=await U.get("/api/skills")}catch(Z){s.value=Z.message}t.value=!1}async function I(Z){i.value=Z,delete n.value[Z],n.value={...n.value};try{const ue=await U.post(`/api/skills/${encodeURIComponent(Z)}/test`);n.value={...n.value,[Z]:ue}}catch(ue){n.value={...n.value,[Z]:{result:ue.message,is_error:!0}}}i.value=null}function O(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function $(Z){r.value=!0,c.value="edit",d.value=Z.name,u.value=Z.code||"",p.value=null,h.value=null}function Q(){r.value=!1,p.value=null,h.value=null}async function G(){p.value=null,h.value=null;const Z=d.value.trim(),ue=u.value.trim();if(!Z){p.value="Name is required";return}if(!ue){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await U.post("/api/skills",{name:Z,code:ue}),h.value="Skill created successfully"):(await U.put(`/api/skills/${encodeURIComponent(Z)}`,{code:ue}),h.value="Skill updated successfully"),await C(),setTimeout(()=>{r.value=!1},800)}catch(Oe){p.value=Oe.message}m.value=!1}function X(Z){S.value=Z}async function re(){if(S.value){L.value=!0;try{await U.del(`/api/skills/${encodeURIComponent(S.value)}`),await C()}catch(Z){we.error(`Failed to delete skill: ${Z.message||"unknown error"}`)}L.value=!1,S.value=null}}return Ge(()=>{C()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:S,deleting:L,enabledCount:b,totalExecutions:g,totalLines:y,displayedSkills:E,editLineCount:_,editorLineNums:A,editValidation:T,highlight:x,truncate:Cd,formatTs:On,countLines:N,getLineNumbers:F,toggleCode:k,copyCode:P,handleEditorKey:B,syncScroll:K,fetchSkills:C,testSkill:I,showCreate:O,editSkill:$,cancelEdit:Q,saveSkill:G,confirmDelete:X,doDelete:re}}};class Us extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const xk=/^[A-Za-z_][A-Za-z0-9_]*$/;function fp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function hp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Us(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Us(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new Us(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Us(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function _k(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function wk(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new Us("Server name is required.","name");if(n.length>128||!xk.test(n))throw new Us("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new Us("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=fp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Us("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new Us("An HTTP endpoint is required for this connection.","url");if(d&&!_k(d))throw new Us("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Us("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=fp(e.allowlistText));const r=hp(e.headerRows,e.headersRemove,"Header"),c=hp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function kk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Sk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Tk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Ck=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Ek(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Ak=1e4,Rk=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Ir(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Ik(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Ok={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=V(()=>Object.keys(i.value).every(J=>{var _e;return Number.isInteger((_e=e.value)==null?void 0:_e[J])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),v=f(!1),S=f("add"),L=f(""),b=f(null),g=f(Ir()),y=f(""),E=f(!1);let _=null,A=0,T=!1,x=!1;const N=Ck,F=V(()=>{var J;return((J=e.value)==null?void 0:J.servers)||[]}),k=V(()=>{var J;return!!((J=e.value)!=null&&J.enabled)}),P=V(()=>{var J,_e,Ce,Ne;return{serverCount:((J=e.value)==null?void 0:J.server_count)||0,enabledCount:((_e=e.value)==null?void 0:_e.enabled_server_count)||0,connectedCount:((Ce=e.value)==null?void 0:Ce.connected_count)||0,toolCount:((Ne=e.value)==null?void 0:Ne.published_tool_count)||0}}),B=V(()=>{var J;return((J=b.value)==null?void 0:J.header_keys)||[]}),K=V(()=>{var J;return((J=b.value)==null?void 0:J.env_keys)||[]}),C=V(()=>{var J;return S.value==="edit"&&((J=b.value)==null?void 0:J.transport)==="http"}),I=V(()=>S.value==="add"||!C.value),O=V(()=>C.value?"Replace endpoint URL":"Endpoint URL"),$=V(()=>C.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function Q(){G(),_=window.setInterval(()=>X({quiet:!0}),Ak)}function G(){_&&window.clearInterval(_),_=null}async function X({quiet:J=!1}={}){if(a.value)return;const _e=++A;J||(t.value=!0);try{const Ce=await U.get("/api/mcp/status");if(_e!==A||!T)return;e.value=Ce;for(const se of Object.keys(i.value))!l.value.has(se)&&Number.isInteger(Ce[se])&&(i.value[se]=String(Ce[se]));r.value="";const Ne=new Set((Ce.servers||[]).map(se=>se.name));d.value=new Set([...d.value].filter(se=>Ne.has(se)))}catch(Ce){_e===A&&T&&(r.value=Ce.message||"Failed to load MCP status")}finally{_e===A&&(t.value=!1)}}function re(J){return s.value||c.value.has(J)}function Z(J,_e){const Ce=new Set(c.value);_e?Ce.add(J):Ce.delete(J),c.value=Ce}function ue(J){return Sk(J.state)}function Oe(J){if(ue(J)==="disabled"){if(!J.enabled)return"Disabled — server switch off";if(!k.value)return"Disabled — global MCP is off"}return Rk[ue(J)]}function ae(J){return J.transport==="http"?"Streamable HTTP":"stdio"}function be(J){return J.negotiated_version?`${J.era?`${String(J.era).charAt(0).toUpperCase()}${String(J.era).slice(1)}`:"Protocol"} · ${J.negotiated_version}`:"Not negotiated"}function q(J){return J.discovered_count?`${J.published_count||0} published · ${J.excluded_count||0} excluded`:"No tools discovered"}const de=f(new Set);async function he(J,_e){if(de.value.has(J.name))return;const Ce=!!_e.target.checked,Ne=new Set(de.value);Ne.add(J.name),de.value=Ne;try{const se=await U.post(`/api/mcp/servers/${encodeURIComponent(J.name)}/enabled`,{enabled:Ce});se&&Array.isArray(se.servers)?e.value=se:await X({quiet:!0})}catch(se){_e.target.checked=!!J.enabled,we.error(se.message||`Failed to toggle ${J.name}`)}finally{const se=new Set(de.value);se.delete(J.name),de.value=se}}function Le(J,_e){var Ne;i.value[J]=_e;const Ce=new Set(l.value);_e===String((Ne=e.value)==null?void 0:Ne[J])?Ce.delete(J):Ce.add(J),l.value=Ce,n.value=""}async function w(){if(s.value||!o.value||!l.value.size)return;const J={};for(const _e of l.value){const Ce=Number(i.value[_e]),Ne=_e==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ce)||Ce<1||Ce>Ne){n.value=`Enter a whole number between 1 and ${Ne}.`;return}J[_e]=Ce}a.value=!0,s.value=!0,n.value="",++A,t.value=!1;try{const _e=await U.post("/api/mcp/limits",J);e.value=_e;for(const Ce of Object.keys(i.value))Number.isInteger(_e[Ce])&&(i.value[Ce]=String(_e[Ce]));l.value=new Set,we.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(_e){n.value=_e.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await X({quiet:!0})}}async function M(J){if(J!==k.value&&!(!J&&!await Kt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await U.post("/api/mcp/enabled",{enabled:J}),we.success(J?"MCP enabled":"MCP disabled"),await X({quiet:!0})}catch(_e){we.error(_e.message||"Failed to update MCP state"),await X({quiet:!0})}finally{s.value=!1}}}async function z(J){Z(J.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(J.name)}/reconnect`,{}),we.success(`Reconnected ${J.name}`)}catch(_e){we.error(_e.message||`Failed to reconnect ${J.name}`)}finally{Z(J.name,!1),await X({quiet:!0})}}async function ce(J){Z(J.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(J.name)}/refresh-tools`,{}),we.success(`Refreshed tools from ${J.name}`),await me(J.name,!0)}catch(_e){we.error(_e.message||`Failed to refresh ${J.name}`)}finally{Z(J.name,!1),await X({quiet:!0})}}async function ie(J){if(await Kt({title:`Remove ${J.name}`,message:`Remove this saved MCP server? Its ${J.published_count||0} published tool${J.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){Z(J.name,!0);try{await U.del(`/api/mcp/servers/${encodeURIComponent(J.name)}`),we.success(`Removed ${J.name}`),delete p.value[J.name]}catch(Ce){we.error(Ce.message||`Failed to remove ${J.name}`)}finally{Z(J.name,!1),await X({quiet:!0})}}}async function le(J){const _e=new Set(d.value);if(_e.has(J.name)){_e.delete(J.name),d.value=_e;return}_e.add(J.name),d.value=_e,Object.hasOwn(p.value,J.name)||await me(J.name)}async function me(J,_e=!1){if(!_e&&Object.hasOwn(p.value,J))return;const Ce=new Set(m.value);Ce.add(J),m.value=Ce,h.value={...h.value,[J]:""};try{const Ne=await U.get(`/api/mcp/servers/${encodeURIComponent(J)}/tools`);p.value={...p.value,[J]:Ne.tools||[]}}catch(Ne){h.value={...h.value,[J]:Ne.message||"Failed to load tools"}}finally{const Ne=new Set(m.value);Ne.delete(J),m.value=Ne}}function H(J){return(p.value[J]||[]).filter(_e=>Tk(_e,u.value[J]))}function ee(J,_e){u.value={...u.value,[J]:_e}}function Y(){S.value="add",L.value="",b.value=null,g.value=Ir(),y.value="",v.value=!0}function fe(J){S.value="edit",L.value=J.name,b.value=J,g.value={...Ir(),name:J.name,enabled:!!J.enabled,transport:J.transport||"stdio"},y.value="",v.value=!0}function pe(){E.value||(v.value=!1)}function ye(J){v.value&&Ek(J)}function Re(J){const _e=J==="headers"?"headerRows":"envRows";g.value[_e].push({key:"",value:""})}function ve(J,_e){const Ce=J==="headers"?"headerRows":"envRows";g.value[Ce].splice(_e,1)}function He(J,_e){const Ce=J==="headers"?"headersRemove":"envRemove",Ne=g.value[Ce];g.value[Ce]=Ne.includes(_e)?Ne.filter(se=>se!==_e):[...Ne,_e]}async function Pe(){var _e,Ce;y.value="";let J;try{J=wk(g.value,{mode:S.value,originalTransport:((_e=b.value)==null?void 0:_e.transport)||""})}catch(Ne){y.value=Ne instanceof Us?Ne.message:"Invalid MCP server configuration",await Ot(),(Ce=document.querySelector(".mcp-editor"))==null||Ce.scrollTo({top:0,behavior:"smooth"});return}if(!(S.value==="edit"&&kk(J,b.value)&&!await Kt({title:`Change ${L.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){E.value=!0;try{S.value==="add"?await U.post("/api/mcp/servers",J):await U.put(`/api/mcp/servers/${encodeURIComponent(L.value)}`,J),we.success(S.value==="add"?`Saved ${J.name}`:`Updated ${L.value}`),v.value=!1,await X({quiet:!0})}catch(Ne){y.value=Ne.message||"Failed to save MCP server"}finally{E.value=!1}}}let ze=null;function Ye(J){`${(J==null?void 0:J.event)||""} ${(J==null?void 0:J.type)||""} ${(J==null?void 0:J.tool)||""} ${(J==null?void 0:J.message)||""}`.toLowerCase().includes("mcp")&&(ze&&window.clearTimeout(ze),ze=window.setTimeout(()=>X({quiet:!0}),200))}function ot(){T||(T=!0,x||(at.subscribe("events",Ye),x=!0),X(),Q())}function nt(){T=!1,G(),ze&&window.clearTimeout(ze),ze=null,x&&(at.unsubscribe("events",Ye),x=!1)}return Ge(ot),es(ot),Wt(nt),mt(nt),{status:e,loading:t,mutating:s,pageError:r,servers:F,masterEnabled:k,aggregate:P,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Le,saveLimits:w,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:v,editorMode:S,editingName:L,editingServer:b,form:g,formError:y,saving:E,editorGroups:N,configuredHeaderKeys:B,configuredEnvKeys:K,savedHttpEndpoint:C,endpointRequired:I,endpointFieldLabel:O,endpointPlaceholder:$,refreshAll:X,busy:re,serverState:ue,stateLabel:Oe,transportLabel:ae,protocolLabel:be,toolSummary:q,formatAge:Ik,setMasterEnabled:M,togglePending:de,toggleServerEnabled:he,reconnect:z,refreshTools:ce,removeServer:ie,toggleTools:le,filteredTools:H,setToolQuery:ee,openAdd:Y,openEdit:fe,closeEditor:pe,jumpToEditorGroup:ye,addSecretRow:Re,removeSecretRow:ve,toggleSecretRemoval:He,saveServer:Pe}}};function Lk(e,t){if(!e||!t)return dp(e);const s=dp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Nk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let S=null;const L=f(null),b=f(!1),g=f({}),y=f({}),E=f({}),_=f({}),A=new Map,T=f(null),x=V(()=>e.value.reduce((G,X)=>G+(X.chunks||0),0)),N=V(()=>new Set(e.value.map(X=>X.uploader).filter(Boolean)).size);function F(G,X){const re=y.value[X];if(!re||re.length===0)return 0;const Z=Math.max(...re.map(ue=>ue.char_count||0));return Z===0?0:Math.round(G.char_count/Z*100)}async function k(){t.value=!0,s.value=null;try{const G=await U.get("/api/knowledge");e.value=Array.isArray(G)?G:[]}catch(G){s.value=G.message}t.value=!1}async function P(G){if(g.value[G]){g.value[G]=!1,T.value=null;return}if(g.value[G]=!0,Object.prototype.hasOwnProperty.call(y.value,G))return;if(A.has(G))return A.get(G);const X={..._.value,[G]:!0};_.value=X;const re={...E.value};delete re[G],E.value=re;const Z=U.get(`/api/knowledge/${encodeURIComponent(G)}/chunks`).then(ue=>{y.value={...y.value,[G]:Array.isArray(ue)?ue:[]}}).catch(ue=>{E.value={...E.value,[G]:ue.message||"load failed"}}).finally(()=>{if(A.get(G)!==Z)return;A.delete(G);const ue={..._.value};delete ue[G],_.value=ue});return A.set(G,Z),Z}let B=0;async function K(){const G=a.value.trim();if(!G)return;const X=++B;i.value=!0,o.value=null,l.value=G;try{const re=await U.get(`/api/knowledge/search?q=${encodeURIComponent(G)}`);if(X!==B)return;n.value=Array.isArray(re)?re:[]}catch(re){if(X!==B)return;n.value=[],o.value=re.message||"Search failed"}X===B&&(i.value=!1)}function C(){B+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function I(){u.value=null,p.value=null;const G=c.value.trim(),X=d.value.trim();if(!G){u.value="Source name is required";return}if(!X){u.value="Content is required";return}h.value=!0;try{const re=await U.post("/api/knowledge",{source:G,content:X});p.value=`Ingested ${re.chunks||0} chunks from "${G}"`,c.value="",d.value="",y.value={},await k(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}h.value=!1}async function O(G){m.value=G,v.value=null,S&&(clearTimeout(S),S=null);try{const X=await U.post(`/api/knowledge/${encodeURIComponent(G)}/reingest`);v.value={source:G,error:!1,message:`Re-ingested ${X.chunks||0} chunks`},delete y.value[G],await k(),S=setTimeout(()=>{v.value=null,S=null},3e3)}catch(X){v.value={source:G,error:!0,message:X.message}}m.value=null}function $(G){L.value=G}async function Q(){if(L.value){b.value=!0;try{await U.del(`/api/knowledge/${encodeURIComponent(L.value)}`),delete y.value[L.value],await k()}catch(G){we.error(`Failed to delete source: ${G.message||"unknown error"}`)}b.value=!1,L.value=null}}return Ge(()=>{k()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:L,deleting:b,expanded:g,sourceChunks:y,chunkErrors:E,loadingChunks:_,selectedChunk:T,totalChunks:x,uploaderCount:N,truncate:Cd,formatTs:On,highlightTerms:Lk,chunkBarWidth:F,fetchSources:k,toggleSource:P,doSearch:K,clearSearch:C,doIngest:I,doReingest:O,confirmDelete:$,doDelete:Q}}},Dk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),S=f(null),L=f(new Set),b=f(null),g=f(!1),y=f(!1),E=V(()=>e.value.reduce((X,re)=>X+re.count,0)),_=V(()=>L.value.size);function A(X){const re=t.value[X];if(!re)return[];if(!l.value.trim())return re;const Z=l.value.trim().toLowerCase();return re.filter(ue=>ue.key.toLowerCase().includes(Z)||ue.value&&ue.value.toLowerCase().includes(Z))}function T(X,re){return L.value.has(X+"/"+re)}function x(X,re){const Z=X+"/"+re,ue=new Set(L.value);ue.has(Z)?ue.delete(Z):ue.add(Z),L.value=ue}function N(X){const re=t.value[X];return!re||re.length===0?!1:re.every(Z=>L.value.has(X+"/"+Z.key))}function F(X,re){const Z=t.value[X];if(!Z)return;const ue=new Set(L.value);for(const Oe of Z){const ae=X+"/"+Oe.key;re?ue.add(ae):ue.delete(ae)}L.value=ue}async function k(){s.value=!0,a.value=null;try{const X=await U.get("/api/memory");e.value=Object.entries(X).map(([re,Z])=>({name:re,keys:Z.keys||[],count:Z.count||0}))}catch(X){a.value=X.message}s.value=!1}async function P(X){if(n.value[X]){n.value[X]=!1;return}n.value[X]=!0;const re=e.value.find(ue=>ue.name===X);if(!re||t.value[X]||i.value===X)return;i.value=X;let Z;try{const Oe=(await U.get(`/api/memory/${encodeURIComponent(X)}`)).entries||{};Z=re.keys.map(ae=>Object.prototype.hasOwnProperty.call(Oe,ae)?{key:ae,value:Oe[ae]||"",failed:!1}:{key:ae,value:"",failed:!0,error:"Not found in scope"})}catch(ue){Z=re.keys.map(Oe=>({key:Oe,value:"",failed:!0,error:ue.message||"Failed to load"}))}t.value[X]=Z,i.value=null}function B(X,re,Z){p.value=X+"/"+re,h.value=Z}async function K(X,re){m.value=!0,v.value=null;try{await U.put(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(re)}`,{value:h.value});const Z=t.value[X];if(Z){const ue=Z.find(Oe=>Oe.key===re);ue&&(ue.value=h.value)}p.value=null}catch(Z){v.value=`Failed to save: ${Z.message||"unknown error"}`}m.value=!1}async function C(X,re){try{await navigator.clipboard.writeText(re.value),S.value=X+"/"+re.key,setTimeout(()=>{S.value=null},1500)}catch{}}async function I(){d.value=null,u.value=null;const X=r.value.scope.trim(),re=r.value.key.trim(),Z=r.value.value.trim();if(!X){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!Z){d.value="Value is required";return}c.value=!0;try{await U.put(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(re)}`,{value:Z}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await k(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(ue){d.value=ue.message}c.value=!1}function O(X,re){b.value={scope:X,key:re}}async function $(){if(!b.value)return;g.value=!0,v.value=null;const{scope:X,key:re}=b.value;try{await U.del(`/api/memory/${encodeURIComponent(X)}/${encodeURIComponent(re)}`);const Z=t.value[X];Z&&(t.value[X]=Z.filter(ae=>ae.key!==re));const ue=e.value.find(ae=>ae.name===X);ue&&(ue.count--,ue.keys=ue.keys.filter(ae=>ae!==re));const Oe=new Set(L.value);Oe.delete(X+"/"+re),L.value=Oe}catch(Z){v.value=`Failed to delete: ${Z.message||"unknown error"}`}g.value=!1,b.value=null}function Q(){y.value=!0}async function G(){g.value=!0,v.value=null;const X=[];for(const re of L.value){const Z=re.indexOf("/");X.push({scope:re.slice(0,Z),key:re.slice(Z+1)})}try{await U.post("/api/memory/bulk-delete",{entries:X}),L.value=new Set,t.value={},await k()}catch(re){v.value=`Bulk delete failed: ${re.message||"unknown error"}`}g.value=!1,y.value=!1}return Ge(()=>{k()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:S,selected:L,selectedCount:_,totalEntries:E,deleteTarget:b,deleting:g,showBulkDelete:y,fetchMemory:k,toggleScope:P,startEdit:B,doEdit:K,copyValue:C,doAdd:I,confirmDelete:O,doDelete:$,confirmBulkDelete:Q,doBulkDelete:G,isSelected:T,toggleSelect:x,isScopeAllSelected:N,toggleSelectAll:F,filteredEntries:A}}},Pk={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=V(()=>[...new Set(e.value.map(S=>S.category))].sort()),r=V(()=>{const v={};return e.value.forEach(S=>{v[S.category]=(v[S.category]||0)+1}),v}),c=V(()=>n.value?e.value.filter(v=>v.category===n.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await U.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,we.success("Entry updated"),await m()}catch(S){we.error(S.message||"Failed to save entry")}}async function h(v){if(await Kt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/learned/"+encodeURIComponent(v)),we.success("Entry deleted"),await m()}catch(L){we.error(L.message||"Failed to delete entry")}}async function m(){s.value=!0,a.value=null;try{const v=await U.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){a.value=v.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:On,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},ov=[{id:"tools",label:"Tools",component:vk},{id:"skills",label:"Skills",component:yk},{id:"mcp-servers",label:"MCP Servers",component:Ok},{id:"knowledge",label:"Knowledge",component:Nk},{id:"memory",label:"Memory",component:Dk},{id:"learned",label:"Learned",component:Pk}],Mk={components:{TabbedPage:ir},setup(){return{tabs:ov}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Fk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},$k={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Uk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Bk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=V(()=>e.value.components||[]),l=V(()=>Uk[e.value.overall]||"text-gray-400"),o=V(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=V(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Fk[_]||"text-gray-400"}function d(_){return $k[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function p(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function h(_){return _.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function m(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function v(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function S(){n.value=!0;try{e.value=await U.get("/api/health/components"),s.value=null,a.value=!0}catch(_){s.value=_.message}finally{t.value=!1,n.value=!1}}function L(){t.value=!0,s.value=null,S()}let b=null,g=!1;function y(){g||(g=!0,S(),b||(b=setInterval(S,3e4)))}function E(){g&&(g=!1,b&&(clearInterval(b),b=null))}return Ge(y),es(y),Wt(E),mt(E),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:S,retry:L}}},Hk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=V(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=V(()=>{if(!i.value)return[];const S=i.value,L=S.storage_total_bytes||1;return[{label:"Session Persistence",mb:S.sessions.persist_dir.total_mb,bytes:S.sessions.persist_dir.total_bytes,files:S.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(S.sessions.persist_dir.total_bytes/L*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:S.knowledge.db_file.total_mb,bytes:S.knowledge.db_file.total_bytes,files:S.knowledge.db_file.file_count,pct:Math.min(100,Math.round(S.knowledge.db_file.total_bytes/L*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:S.trajectories.message_dir.total_mb,bytes:S.trajectories.message_dir.total_bytes,files:S.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(S.trajectories.message_dir.total_bytes/L*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:S.trajectories.agent_dir.total_mb,bytes:S.trajectories.agent_dir.total_bytes,files:S.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(S.trajectories.agent_dir.total_bytes/L*100)),color:"res-bar-amber"}]});async function d(){try{const S=await U.get("/api/resource-usage");i.value=S,t.value=null,s.value=!0}catch(S){t.value=S.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),es(m),Wt(v),mt(v),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Ed,refresh:u,retry:p}}},zk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),jk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function Vk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!jk.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?ml(t):""}function qk(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!zk.has(c)));s=Object.keys(r).length?ml(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Xa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),vl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function Gk(e){const t=Xa(e)?e:{},s=Xa(t.metadata)?t.metadata:{},a=Xa(t.audit_metadata)?t.audit_metadata:{},n=Xa(t.turn)?t.turn:{},i=l=>vl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function mp(e){return e.record?JSON.stringify(rv(e),null,2):e.text}function rv(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function bc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function vp(e){if(!bc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,vl(s.channel_id),vl(s.user_id??s.actor)])}function Kk(e,t,s=2e3){var i,l,o;const a=vp(t),n=a?e.findIndex(r=>vp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(b=>JSON.stringify(b)===d))return;c.push(t.record);const u=b=>"result_summary"in b?2:bc(b)==="end"?1:0,p=[...c].sort((b,g)=>u(b)-u(g)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const b of["metadata","audit_metadata","turn"]){const g=p.filter(y=>Xa(y[b])).map(y=>y[b]);g.length&&(h[b]=Object.assign({},...g))}const m=c.some(b=>bc(b)!=="start"),v=c.find(b=>yc(b,0).level==="ERROR"),S=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);h.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(S)?S:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),v&&(h.error=v.error||((o=v.metadata)==null?void 0:o.error)||h.error);const L=yc(h,r.id,r._time);Object.assign(L,{events:c,ts:r.ts,_time:r._time,searchText:c.map(b=>JSON.stringify(b)).join(`
`)}),e.splice(n,1,L)}e.length>s&&e.splice(0,e.length-s)}function yc(e,t,s=new Date){var u,p;let a=e;if(Xa(e)&&e.type==="log"&&"line"in e?a=e.line:Xa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Xa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":vl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:vl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:Gk(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function Wk(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const Jk={components:{ToolOutput:lr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=V(()=>qk(e.entry)),s=V(()=>{var o;return ml(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=V(()=>{var o,r,c;return ml(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=V(()=>Vk(e.entry.record)),i=V(()=>rv(e.entry)),l=V(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(at.state||"disconnected"),u=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,S=Zk,L=Yk,b=Or,g=f("all"),y=f(""),E=f([]),_=f(!1),A=f(""),T=f([]);function x(){try{const ne=localStorage.getItem("odin-log-presets");ne&&(E.value=JSON.parse(ne))}catch{}}function N(){try{localStorage.setItem("odin-log-presets",JSON.stringify(E.value))}catch{}}const F=V(()=>l.value!==""||o.value.trim()!==""||y.value!==""),k=V(()=>{const ne=Or.find(Te=>Te.value===y.value);return ne?ne.label:""}),P=V(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ne){return ne.message}}),B=24,K=V(()=>{if(X.value.length===0)return[];const ne=[],Te=new Date,$e=3600*1e3;for(let tt=B-1;tt>=0;tt--){const wt=new Date(Te.getTime()-(tt+1)*$e),pt=new Date(Te.getTime()-tt*$e);ne.push({start:wt,end:pt,label:$(wt,pt),shortLabel:pt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const tt of X.value){if(!tt._time)continue;const wt=tt._time.getTime();for(const pt of ne)if(wt>=pt.start.getTime()&&wt<pt.end.getTime()){pt.total++,tt.level==="ERROR"?pt.errors++:tt.level==="WARNING"?pt.warnings++:pt.info++;break}}return ne}),C=V(()=>{let ne=1;for(const Te of K.value)Te.total>ne&&(ne=Te.total);return ne}),I=V(()=>{if(K.value.length===0)return"";const ne=X.value.map(tt=>tt._time&&tt._time.getTime()).filter(Boolean);if(ne.length===0)return"";const Te=new Date(Math.min(...ne));return`${X.value.length} shown, oldest ${Te.toLocaleTimeString()}`}),O=V(()=>Math.ceil(B/8));function $(ne,Te){const $e={hour:"2-digit",minute:"2-digit"};return ne.toLocaleTimeString([],$e)+" - "+Te.toLocaleTimeString([],$e)}function Q(ne,Te){return!Te||!ne?"0px":Math.max(2,ne/Te*100)+"%"}function G(ne){const Te=X.value.findIndex($e=>$e._time&&$e._time.getTime()>=ne.start.getTime()&&$e._time.getTime()<ne.end.getTime());if(Te>=0&&p.value){const $e=p.value.querySelector('[data-log-id="'+X.value[Te].id+'"]');$e&&($e.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const X=V(()=>{let ne=t.value;if(l.value&&(ne=ne.filter(Te=>(Te.level||"INFO")===l.value)),y.value){const Te=Or.find($e=>$e.value===y.value);if(Te&&Te.seconds){const $e=new Date(Date.now()-Te.seconds*1e3);ne=ne.filter(tt=>tt._time&&tt._time>=$e)}}if(o.value&&!P.value)if(r.value)try{const Te=new RegExp(o.value,"i");ne=ne.filter($e=>{const tt=$e.searchText,wt=$e.tool||"";return Te.test(tt)||Te.test(wt)})}catch{}else{const Te=o.value.toLowerCase();ne=ne.filter($e=>{const tt=$e.searchText.toLowerCase(),wt=($e.tool||"").toLowerCase();return tt.includes(Te)||wt.includes(Te)})}return ne}),re=V(()=>Wk(X.value));function Z(ne){const Te=yc(ne,++s);if(n.value){T.value.push(Te);return}ue(Te)}function ue(ne){Kk(t.value,ne,v),i.value&&Ot(()=>Oe())}function Oe(ne=!1){const Te=p.value;Te&&Te.scrollTo({top:Te.scrollHeight,behavior:ne?"smooth":"instant"})}function ae(){i.value=!0,h.value=!1,Ot(()=>Oe(!0))}const be=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function q(){const ne=p.value;if(!ne)return;const Te=ne.scrollHeight-ne.scrollTop-ne.clientHeight<40;h.value=!i.value&&!Te&&t.value.length>0,w.value&&de()}function de(){const ne=p.value;!ne||!i.value||ne.scrollHeight-ne.scrollTop-ne.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function he(){i.value&&requestAnimationFrame(de)}function Le(ne){be.has(ne.key)&&he()}const w=f(!1);function M(){i.value&&(w.value=!0,requestAnimationFrame(de))}function z(){w.value&&(w.value=!1,de())}function ce(){i.value&&(h.value=!1,Ot(()=>Oe()))}function ie(){if(n.value=!n.value,!n.value&&T.value.length>0){for(const ne of T.value)ue(ne);T.value=[]}}function le(){t.value=[],T.value=[],h.value=!1}function me(){let ne;e.value==="search"?ne=De.value.map(wt=>{const pt=wt.error?"ERROR":"INFO",Ha=wt.tool_name?`[${wt.tool_name}] `:"";return`${wt.timestamp||""} ${pt} ${Ha}${wt.result_summary||wt.message||""}`}).join(`
`):ne=X.value.map(mp).join(`

`);const Te=new Blob([ne],{type:"text/plain"}),$e=URL.createObjectURL(Te),tt=document.createElement("a");tt.href=$e,tt.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,tt.click(),URL.revokeObjectURL($e)}function H(ne){const Te=mp(ne);navigator.clipboard.writeText(Te).then(()=>{m.value=ne.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function ee(ne){l.value=l.value===ne?"":ne,g.value="all"}function Y(ne){return ne.level==="ERROR"?"log-line-error":ne.level==="WARNING"?"log-line-warning":"text-gray-300"}function fe(ne){return ne==="ERROR"?"text-red-500 font-semibold":ne==="WARNING"?"text-yellow-500":"text-blue-500"}function pe(ne){return ne==="ERROR"?"log-chip-error":ne==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(ne){g.value=ne.id;const Te=ne.filters;l.value=Te.level||"",y.value=Te.timeRange||"",o.value=Te.text||"",Te.levels&&(l.value=Te.levels[0]||""),Te.hasToolName&&(o.value="")}function Re(ne){g.value=ne.id,l.value=ne.filters.level||"",y.value=ne.filters.timeRange||"",o.value=ne.filters.text||""}function ve(){if(!A.value.trim())return;const ne={id:"custom-"+Date.now(),name:A.value.trim(),filters:{level:l.value,timeRange:y.value,text:o.value}};E.value=[...E.value,ne],N(),_.value=!1,A.value=""}function He(ne){E.value=E.value.filter(Te=>Te.id!==ne),N(),g.value===ne&&(g.value="all")}const Pe=f("all"),ze=f(""),Ye=f(""),ot=f(""),nt=f(""),J=f(""),_e=f(100),Ce=Qk,Ne=f(!1),se=f(!1),Ee=f(""),De=f([]),Qe=f(null),Nt=f(null);function We(){e.value="search",Qe.value||Bt()}async function Bt(){try{Qe.value=await U.get("/api/logs/stats")}catch{}}function Ht(){const ne=J.value;if(!ne){ot.value="",nt.value="";return}const $e={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ne];if($e){const tt=new Date(Date.now()-$e*1e3);ot.value=ms(tt),nt.value=""}}function ms(ne){const Te=$e=>String($e).padStart(2,"0");return`${ne.getFullYear()}-${Te(ne.getMonth()+1)}-${Te(ne.getDate())}T${Te(ne.getHours())}:${Te(ne.getMinutes())}`}function Xs(ne){if(!ne)return"";const Te=new Date(ne);return isNaN(Te.getTime())?"":Te.toISOString()}async function Ls(){Ne.value=!0,Ee.value="",se.value=!0,Nt.value=null;try{const ne=new URLSearchParams;Pe.value&&Pe.value!=="all"&&ne.set("level",Pe.value),ze.value&&ne.set("tool",ze.value),Ye.value&&ne.set("q",Ye.value);const Te=Xs(ot.value),$e=Xs(nt.value);Te&&ne.set("start",Te),$e&&ne.set("end",$e),ne.set("limit",String(_e.value));const tt=await U.get(`/api/logs/search?${ne.toString()}`);De.value=tt.entries||[]}catch(ne){Ee.value=ne.message||"Search failed",De.value=[]}finally{Ne.value=!1}}function Ua(){Pe.value="all",ze.value="",Ye.value="",ot.value="",nt.value="",J.value="",_e.value=100,De.value=[],se.value=!1,Ee.value="",Nt.value=null}function fa(ne){Nt.value=Nt.value===ne?null:ne}function Ns(ne){if(!ne.timestamp)return"";try{return new Date(ne.timestamp).toLocaleString()}catch{return ne.timestamp}}function Ba(ne){return ne.type==="web_action"?`${ne.status||""} (${ne.execution_time_ms||0}ms)`:(ne.result_summary||"").slice(0,200)}function vs(ne){return ne.error?"log-line-error":"text-gray-300"}function ha(ne){try{return JSON.stringify(ne,null,2)}catch{return String(ne)}}let Ds=null,et=!1;function Ps(){et||(et=!0,at.subscribe("logs",Z),c.value=at.connected,d.value=at.state||"disconnected",Ds=at.onState(ne=>{d.value=ne,c.value=ne==="connected"}))}function Dt(){et&&(et=!1,at.unsubscribe("logs",Z),Ds&&(Ds(),Ds=null))}return Ge(()=>{x(),window.addEventListener("pointerup",z),window.addEventListener("pointercancel",z)}),es(Ps),Wt(Dt),mt(()=>{Dt(),window.removeEventListener("pointerup",z),window.removeEventListener("pointercancel",z)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:X,pauseBuffer:T,showJumpBottom:h,copiedIndex:m,regexError:P,levels:S,logPresets:L,timeRanges:b,timeRange:y,activeLogPreset:g,customLogPresets:E,showSaveLogPreset:_,newLogPresetName:A,hasActiveLogFilters:F,timeRangeLabel:k,timelineBuckets:K,timelineMax:C,timelineSpanLabel:I,timelineLabelSkip:O,togglePause:ie,clearLogs:le,exportLogs:me,logLineClass:Y,levelClass:fe,levelChipClass:pe,toggleLevel:ee,copyLine:H,jumpToBottom:ae,onScroll:q,onUserScrollIntent:he,onUserScrollKey:Le,onAutoScrollToggle:ce,onPointerDown:M,applyLogPreset:ye,applyCustomLogPreset:Re,saveLogCustomPreset:ve,removeLogCustomPreset:He,segmentHeight:Q,jumpToTimelineBucket:G,searchLevel:Pe,searchTool:ze,searchKeyword:Ye,searchStart:ot,searchEnd:nt,searchTimePreset:J,searchLimit:_e,searchLimits:Ce,searching:Ne,searchRan:se,searchError:Ee,searchResults:De,searchStats:Qe,expandedSearch:Nt,switchToSearch:We,runSearch:Ls,clearSearchFilters:Ua,toggleSearchExpand:fa,formatSearchTs:Ns,searchEntryText:Ba,searchLogLineClass:vs,formatJson:ha,applySearchTimePreset:Ht}}};function zl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const eS=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const li=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},jl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),aS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function gp(e){return aS.some(t=>e===t||e.startsWith(`${t}.`))}const cv="odin_config_center_expanded_v1",dv="odin_config_center_category_v1",nS=50,iS=650,Ii=()=>U.get("/api/config/meta");function fn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Zn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Hn(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function oS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function uv(e,t){if(Zn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return fn(t);const a={};for(const[n,i]of Object.entries(t)){const l=uv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function rS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=uv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function pv(e,t,s,a){if(Zn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)pv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function cS(){try{const e=JSON.parse(localStorage.getItem(cv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dS(){try{const e=localStorage.getItem(dv);return li.some(t=>t.key===e)?e:li[0].key}catch{return li[0].key}}const uS={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=["image_model","outer_model"],o=V(()=>l.every(R=>{var j,te;return(te=(j=t.value)==null?void 0:j.image_model_defaults)==null?void 0:te[R]})),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(!1),h=f(null),m=f(""),v=f("all"),S=f(dS()),L=f(cS()),b=f({}),g=f({}),y=f(""),E=f({}),_=f({}),A=f([]),T=f([]),x=f(!1),N=f(!1),F=f(!1);let k=null,P=null,B={path:null,at:0},K=0;const C=V(()=>{var R;return(((R=t.value)==null?void 0:R.fields)||[]).filter(j=>!jl.has(j.path.split(".")[0])&&!gp(j.path))}),I=V(()=>new Map(C.value.map(R=>[R.path,R]))),O=V(()=>re.value.reduce((R,j)=>R+j.sections.length,0)),$=V(()=>C.value.length),Q=V(()=>eS),G=V(()=>A.value.length>0),X=V(()=>T.value.length>0),re=V(()=>{if(!e.value)return[];const R=new Set(li.flatMap(ke=>ke.sections)),j=li.map(ke=>({...ke,sections:ke.sections.filter(Ke=>Object.hasOwn(e.value,Ke)&&!jl.has(Ke))})).filter(ke=>ke.sections.length),te=Object.keys(e.value).filter(ke=>!R.has(ke)&&!jl.has(ke));return te.length&&j.push({key:"other",label:"Other",icon:"folder",sections:te}),j}),Z=V(()=>e.value?{...e.value,...b.value}:null),ue=V(()=>{if(!e.value)return[];const R=[];for(const[j,te]of Object.entries(b.value))pv(e.value[j],te,j,R);return R.filter(j=>!Zn(j.oldVal,j.newVal)).map(j=>{const te=ie(j.path);return{...j,label:(te==null?void 0:te.label)||Hn(j.path.split(".").at(-1)),apply_mode:(te==null?void 0:te.apply_mode)||pe(j.path.split(".")[0])}})}),Oe=V(()=>ue.value.length>0),ae=V(()=>ue.value.length),be=V(()=>new Set(ue.value.map(R=>R.path.split(".")[0])).size),q=V(()=>!!m.value||v.value!=="all"),de=V(()=>{const R={..._.value};for(const j of ue.value){const te=ie(j.path),ke=Dn(te,j.newVal);ke&&(R[j.path]=ke)}return R}),he=V(()=>Object.keys(de.value).length>0),Le=V(()=>e.value?(q.value?re.value:re.value.filter(j=>j.key===S.value)).map(j=>({...j,sections:j.sections.filter(te=>De(te))})).filter(j=>j.sections.length):[]),w=V(()=>{const R=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],j=new Map(R.map(te=>[te,[]]));for(const te of ue.value){const ke=j.has(te.apply_mode)?te.apply_mode:"restart";j.get(ke).push(te)}return R.filter(te=>j.get(te).length).map(te=>({key:te,label:xe(te),entries:j.get(te)}))}),M=V(()=>ue.value.filter(R=>R.apply_mode==="restart").length),z=V(()=>C.value.filter(R=>R.pending_restart)),ce=V(()=>z.value.length);function ie(R){const j=I.value.get(R);return j?{...j,apply_details:zl([j])}:null}function le(R){const j=`${R}.`;return C.value.filter(te=>te.path===R||te.path.startsWith(j))}function me(){return C.value.some(R=>R.path==="tools.hosts"||R.path.startsWith("tools.hosts."))}function H(){var te,ke;const R=((ke=(te=e.value)==null?void 0:te.tools)==null?void 0:ke.hosts)||{},j=Object.keys(R).length;return`${j} host${j===1?"":"s"} configured.`}function ee(R){return le(R).length}function Y(R){return Hn(R)}function fe(R){const j=le(R);if(!j.length)return`${Hn(R)} configuration.`;const te=j.find(St=>St.sensitivity==="public"&&St.description)||j.find(St=>St.description),ke=(te==null?void 0:te.description)||"";return ke.match(/setting for (.+)\.$/i)?`${Hn(R)} settings and runtime behaviour.`:ke}function pe(R){const j=[...new Set(le(R).map(te=>te.apply_mode))];return j.length===1?j[0]:j.includes("restart")?"restart":j.includes("activation_required")?"activation_required":j[0]||"restart"}function ye(R){const j=[...new Set(le(R).map(te=>xe(te.apply_mode)))];return j.length?j.length===1?j[0]:`Mixed apply behaviour: ${j.join(" · ")}`:""}function Re(R){return zl(le(R))}function ve(R){var j;return Object.hasOwn(b.value,R)?b.value[R]:(j=e.value)==null?void 0:j[R]}function He(){const R=ve("mcp")||{},j=Object.keys(R.servers||{}).length;return`${R.enabled?"Globally enabled":"Globally disabled"} · ${j} configured server${j===1?"":"s"}.`}function Pe(R,j){return j.split(".").reduce((te,ke)=>te==null?void 0:te[ke],R)}function ze(R){const j=Z.value;return le(R).filter(te=>gp(te.path)?!1:te.path.split(".").length<=2?!0:!te.path.includes(".*")).map(te=>({...te,key:te.path.split(".").at(-1),value:Pe(j,te.path),apply_details:zl([te]),editor:te.path==="agents.final_warning_iterations"?"warning-chips":null}))}function Ye(R){const j=R.path.split(".");return j.length>2?j.slice(0,2).join("."):null}function ot(R){const j=new Map;for(const te of ze(R)){const ke=Ye(te),Ke=ke||`${R}.__root`;j.has(Ke)||j.set(Ke,{key:Ke,path:ke,entries:[]}),j.get(Ke).entries.push(te)}return[...j.values()].map(te=>{const ke=te.entries.find(Ke=>Ke.group_description);return{...te,label:te.path?Hn(te.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:zl(te.entries),runtime_summaries:J(te.entries)}})}function nt(R){return{save:R.save_effect||(R.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:R.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[R.apply_mode]||"Effective runtime state is not currently observable."}}function J(R){const j=new Map;for(const te of R){const ke=nt(te),Ke=`${te.apply_mode}|${ke.save}|${ke.runtime}`;j.has(Ke)||j.set(Ke,{key:Ke,label:xe(te.apply_mode),save:ke.save,runtime:ke.runtime})}return[...j.values()]}function _e(R){if(Ce(R))return R.runtime_effect||R.activation_policy||"";if(R.apply_mode==="activation_required"){const j=R.activation_policy||R.runtime_effect;return j?`Not active after saving. No activation control exists in this release. ${j}`:"Not active after saving; no activation control exists in this release."}return""}function Ce(R){return R.action_available===!0&&!!(R.action_label&&R.action_endpoint)}async function Ne(R){if(Ce(R))try{if(Ht(R.path))throw new Error("Save this setting before applying its action.");const j=String(R.action_method||"POST").toLowerCase(),te={post:U.post.bind(U),put:U.put.bind(U),delete:U.del.bind(U)}[j];if(!te)throw new Error("Unsupported configuration action");await te(R.action_endpoint,R.action_body||void 0),await bt(),Se("success",`${R.action_label} completed.`)}catch(j){Se("error",j.message||`${R.action_label} failed`)}}function se(R,j){return[R.label,R.path,R.description,...R.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(j)}function Ee(R){const j=m.value.trim().toLowerCase();return j?le(R).filter(te=>se(te,j)):[]}function De(R){const j=le(R);if(v.value!=="all"&&!j.some(ke=>ke.apply_state===v.value))return!1;const te=m.value.trim().toLowerCase();return!te||`${Y(R)} ${R}`.toLowerCase().includes(te)?!0:j.some(ke=>se(ke,te))}function Qe(R,j){return le(R).filter(te=>te.apply_state===j).length}function Nt(R){return R==="all"?$.value:C.value.filter(j=>j.apply_state===R).length}function We(R){const j=R.sections.flatMap(te=>le(te));return{fields:j.length,modified:ue.value.filter(te=>R.sections.includes(te.path.split(".")[0])).length,pending_restart:j.filter(te=>te.apply_state==="pending_restart").length,invalid:j.filter(te=>te.apply_state==="invalid").length,dormant:j.filter(te=>te.apply_state==="dormant").length}}function Bt(R){var j;return Object.hasOwn(b.value,R)&&!Zn((j=e.value)==null?void 0:j[R],b.value[R])}function Ht(R){return ue.value.some(j=>j.path===R||j.path.startsWith(`${R}.`))}function ms(R){S.value=R,m.value="",v.value="all";try{localStorage.setItem(dv,R)}catch{}}function Xs(R){v.value=R}function Ls(){m.value="",v.value="all"}function Ua(R){var j;return((j=re.value.find(te=>te.sections.includes(R)))==null?void 0:j.sections)||[]}function fa(R){const j=Ua(R),te=j.find(ke=>L.value[ke]===!0);return te||j.find(ke=>L.value[ke]!==!1)||null}function Ns(R){return m.value&&!F.value&&De(R)?!0:F.value?fa(R)===R:Object.hasOwn(L.value,R)?L.value[R]===!0:!0}function Ba(R){const j=!Ns(R);if(F.value){const te={...L.value};for(const ke of Ua(R))te[ke]===!0&&(te[ke]=!1);te[R]=j,L.value=te;return}L.value={...L.value,[R]:j}}function vs(){A.value.push(fn(b.value)),A.value.length>nS&&A.value.shift(),T.value=[]}function ha(){n.value||Oe.value&&(vs(),b.value={},_.value={},x.value=!1)}function Ds(R,j=!1){const te=Date.now();if(j&&B.path===R&&te-B.at<iS){B.at=te;return}vs(),B={path:R,at:te}}function et(R,j,te){if(!j.length)return te;const ke=fn(R??{});let Ke=ke;for(let St=0;St<j.length-1;St+=1){const Ks=j[St];Ke[Ks]=fn(Ke[Ks]??{}),Ke=Ke[Ks]}return Ke[j.at(-1)]=te,ke}function Ps(R){var j;return Object.hasOwn(b.value,R)?b.value[R]:fn((j=e.value)==null?void 0:j[R])}function Dt(R,j,te={}){var Fn;if(n.value||jl.has(R.path.split(".")[0]))return;const[ke,...Ke]=R.path.split(".");Ds(R.path,!!te.coalesce);const St=Ps(ke),Ks=Ke.length?et(St,Ke,j):j,ta={...b.value};if(Zn(Ks,(Fn=e.value)==null?void 0:Fn[ke])?delete ta[ke]:ta[ke]=Ks,b.value=ta,_.value[R.path]){const rn={..._.value};delete rn[R.path],_.value=rn}}function ne(R){B={path:null,at:0},g.value={...g.value,[R]:String(Pe(Z.value,R)??"")}}function Te(R){if(B={path:null,at:0},!Object.hasOwn(g.value,R))return;const j={...g.value};delete j[R],g.value=j}function $e(R){const j=g.value[R.path];if(B={path:null,at:0},j===""){if(R.nullable){Te(R.path),Dt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const te=Number(j);if(Number.isNaN(te)||R.type==="integer"&&!Number.isInteger(te)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...g.value};delete ke[R.path],g.value=ke,Dt(R,te,{coalesce:!0})}function tt(R){return Object.hasOwn(g.value,R.path)?g.value[R.path]:R.value??""}function wt(R,j){if(g.value={...g.value,[R.path]:j},j===""){if(R.nullable){Dt(R,null,{coalesce:!0});return}_.value={..._.value,[R.path]:"Enter a number."};return}const te=Number(j);if(!Number.isFinite(te)||R.type==="integer"&&!Number.isInteger(te)){_.value={..._.value,[R.path]:R.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(_.value[R.path]){const ke={..._.value};delete ke[R.path],_.value=ke}Dt(R,te,{coalesce:!0})}function pt(R){const j=Number.parseInt(y.value,10);if(!Number.isInteger(j)||j<1){_.value={..._.value,[R.path]:"Warning thresholds must be positive whole numbers."};return}const te=[...new Set([...R.value||[],j])].sort((ke,Ke)=>Ke-ke);y.value="",Dt(R,te)}function Ha(R,j){Dt(R,(R.value||[]).filter(te=>te!==j))}function qs(R){return R.apply_mode==="live_read"?"Odin reads the saved file value on next use.":R.apply_mode==="live_for_new_work"?"New work uses the saved file value.":R.apply_mode==="live_apply"?R.apply_handler?`Apply the saved value through ${R.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":R.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":R.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":R.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function wi(R){return R.type==="array"&&Array.isArray(R.value)&&!R.structured_container&&!R.structured_container_child&&R.sensitivity==="public"&&R.value.every(j=>["string","number","boolean"].includes(typeof j))}function ki(R){const j=String(E.value[R.path]??"").trim();if(!j)return;const te=[...new Set([...R.value||[],j])];E.value={...E.value,[R.path]:""},Dt(R,te)}function Nn(R,j){Dt(R,(R.value||[]).filter(te=>te!==j))}function Dn(R,j){var ke;if(!R)return null;if((ke=R.enum)!=null&&ke.length&&!R.enum.includes(j))return`Choose one of: ${R.enum.join(", ")}`;if(R.path==="agents.final_warning_iterations"&&(!Array.isArray(j)||!j.length))return"Add at least one warning threshold.";const te=R.constraints||{};if((R.type==="integer"||R.type==="number")&&typeof j=="number"){if(te.minimum!==void 0&&j<te.minimum)return`Must be at least ${te.minimum}${R.unit?` ${R.unit}`:""}`;if(te.maximum!==void 0&&j>te.maximum)return`Must be at most ${te.maximum}${R.unit?` ${R.unit}`:""}`}return null}function ln(R){return de.value[R.path]||null}function za(R){const j=`${R}.`;return Object.keys(de.value).some(te=>te===R||te.startsWith(j))}function Gs(){n.value||A.value.length&&(T.value.push(fn(b.value)),b.value=A.value.pop(),_.value={},g.value={},B={path:null,at:0})}function ea(){n.value||T.value.length&&(A.value.push(fn(b.value)),b.value=T.value.pop(),_.value={},g.value={},B={path:null,at:0})}function Ts(){!Oe.value||he.value||(x.value=!0,N.value=!1)}function Pn(){x.value=!1}function W(){ha()}function xe(R){return sS[R]||Hn(R||"unknown")}function Ie(R){return`apply-${String(R||"unknown").replaceAll("_","-")}`}function gs(R){return`cfgc-field-${R.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ma(R){return`${gs(R)}-input`}function ja(R){const j=document.getElementById(gs(R))||document.getElementById(gs(R.split(".").slice(0,2).join(".")));j==null||j.scrollIntoView({behavior:"smooth",block:"center"})}function Se(R,j){c.value={type:R,message:j},window.setTimeout(()=>{var te;((te=c.value)==null?void 0:te.message)===j&&(c.value=null)},3500)}function D(){u.value=!1,v.value="pending_restart",m.value="";const R=tS(a.value);R&&(R.scrollTop=0)}function oe(){u.value=!1}function ge(R=1800){P&&window.clearTimeout(P),P=window.setTimeout(Me,R)}async function Me(){if(p.value){if(K+=1,K>45){p.value=!1,h.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ii(),ce.value===0){p.value=!1,h.value=null,Se("success","Odin restarted and the saved startup settings are active.");return}}catch{}ge(2e3)}}async function Ue(){if(!p.value){h.value=null;try{await U.post("/api/restart",{}),p.value=!0,K=0,u.value=!1,ge()}catch(R){h.value=R.message||"Odin could not schedule a restart."}}}async function je(){if(!(!Oe.value||he.value||n.value)){n.value=!0;try{const R=rS(e.value,b.value),j=await U.put("/api/config",R);e.value=j,b.value={},A.value=[],T.value=[],_.value={},x.value=!1;try{t.value=await Ii(),d.value=null,u.value=ce.value>0,Se("success",ce.value?`Configuration saved. ${ce.value} setting${ce.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(te){d.value=te.message||"Unknown metadata error.",Se("error",`Configuration saved, but apply status could not be refreshed: ${d.value}`)}}catch(R){Se("error",R.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Rt(){if(!n.value){n.value=!0,i.value=null;try{t.value=await Ii(),d.value=null}catch(R){i.value=`Image model status could not be refreshed: ${R.message||"Unknown error"}`}finally{n.value=!1}}}async function ft(R,j){if(n.value||!["follow","pin"].includes(j)||!R.length||R.some(ke=>{var Ke,St;return!l.includes(ke)||!((St=(Ke=t.value)==null?void 0:Ke.image_model_defaults)!=null&&St[ke])}))return;n.value=!0,i.value=null;let te=!1;try{const ke=await U.post("/api/config/image-models",{operations:Object.fromEntries(R.map(Ke=>[Ke,j])),expected_revision:t.value.image_model_revision});te=!0;for(const Ke of R){const St=`image.openai.${Ke}`,Ks=Pe(e.value,St),ta=Pe(ke.config,St),Fn=rn=>!Object.hasOwn(rn,"image")||!Zn(Pe(rn,St),Ks)?rn:et(rn,St.split("."),ta);b.value=Fn(b.value),A.value=A.value.map(Fn),T.value=T.value.map(Fn),e.value=et(e.value,St.split("."),ta)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},Se("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){i.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ii(),d.value=null}catch(ke){const Ke=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;d.value=Ke,i.value=te?`Image model defaults were saved, but ${Ke}`:`${i.value} ${Ke}`}finally{n.value=!1}}async function bt(){var R,j;if(!(Oe.value||n.value)){s.value=!0,r.value=null;try{const te=await U.get("/api/config"),ke=await Ii();e.value=te,t.value=ke,d.value=null;const Ke=re.value;if(Ke.some(St=>St.key===S.value)||(S.value=((R=Ke[0])==null?void 0:R.key)||li[0].key),F.value){const Ks=(((j=Ke.find(ta=>ta.key===S.value))==null?void 0:j.sections)||[]).find(ta=>L.value[ta]===!0);L.value=Ks?{...L.value,[Ks]:!0}:{}}}catch(te){r.value=te.message||"Unknown configuration error"}finally{s.value=!1}}}function Ms(R){if(x.value||!(R.ctrlKey||R.metaKey))return;const j=R.target;j instanceof HTMLElement&&(j.matches("input, textarea, select")||j.isContentEditable)||(!R.shiftKey&&R.key.toLowerCase()==="z"?(R.preventDefault(),Gs()):(R.key.toLowerCase()==="y"||R.shiftKey&&R.key.toLowerCase()==="z")&&(R.preventDefault(),ea()))}function kt(R){F.value=R.matches}$t(L,R=>{try{localStorage.setItem(cv,JSON.stringify(R))}catch{}},{deep:!0});let on=!1;function Mn(){on||(on=!0,document.addEventListener("keydown",Ms))}function dr(){on&&(on=!1,document.removeEventListener("keydown",Ms))}return Ge(()=>{var R;bt(),Mn(),k=window.matchMedia("(max-width: 760px)"),kt(k),(R=k.addEventListener)==null||R.call(k,"change",kt)}),es(Mn),Wt(dr),mt(()=>{var R;dr(),(R=k==null?void 0:k.removeEventListener)==null||R.call(k,"change",kt),P&&window.clearTimeout(P)}),{armKeydown:Mn,disarmKeydown:dr,handleKeydown:Ms,config:e,meta:t,loading:s,saving:n,error:r,toast:c,metaRefreshError:d,restartPromptOpen:u,restartScheduled:p,restartError:h,configMain:a,imageModelError:i,imageModelLeaves:l,imageModelMetadataReady:o,setImageModelDefaults:ft,refreshImageModelMetadata:Rt,searchQuery:m,healthFilter:v,activeCategory:S,reviewOpen:x,mobileOverflowOpen:N,warningThresholdInput:y,arrayInputs:E,healthFilters:Q,visibleCategories:re,displayGroups:Le,reviewGroups:w,sectionCount:O,fieldCount:$,hasChanges:Oe,changeCount:ae,changedSectionCount:be,hasDraftErrors:he,canUndo:G,canRedo:X,globalFilterActive:q,reviewRestartCount:M,pendingRestartCount:ce,pendingRestartFields:z,healthCount:Nt,categoryStats:We,selectCategory:ms,selectHealthFilter:Xs,clearFilters:Ls,sectionLabel:Y,sectionDescription:fe,sectionFieldCount:ee,sectionHealthCount:Qe,sectionApplySummary:ye,sectionApplyDetails:Re,sectionEntries:ze,fieldGroups:ot,sectionSearchHits:Ee,mcpConfigSummary:He,fieldRuntimeCopy:nt,fieldSpecificRuntimeNote:_e,hasHonestAction:Ce,runFieldAction:Ne,hasHostsCollection:me,hostsConfigSummary:H,sectionChanged:Bt,fieldChanged:Ht,isSectionExpanded:Ns,toggleSection:Ba,discardAllDrafts:ha,setFieldValue:Dt,setNumberFieldValue:wt,numberInputValue:tt,beginInputEdit:ne,endTextInputEdit:Te,endInputEdit:$e,addWarningThreshold:pt,removeWarningThreshold:Ha,isScalarArray:wi,addScalarArrayItem:ki,removeScalarArrayItem:Nn,fieldError:ln,sectionHasErrors:za,undo:Gs,redo:ea,openReview:Ts,closeReview:Pn,mobileCancel:W,applyModeLabel:xe,applyClass:Ie,compactValue:lS,formatValue:oS,structuredApplyCopy:qs,fieldId:gs,fieldInputId:ma,focusField:ja,fetchConfig:bt,saveConfig:je,restartOdin:Ue,restartLater:oe,reviewPendingRestart:D}}},pS=/^\d{15,25}$/;function fv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const hv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=V(()=>new Set((e.excludedIds||[]).map(String))),o=V(()=>{const E=s.value.toLowerCase().trim();return(e.members||[]).filter(_=>l.value.has(String(_.id))?!1:E?u(_).toLowerCase().includes(E)||String(_.username||"").toLowerCase().includes(E)||String(_.id).includes(E):!0)}),r=V(()=>{const E=s.value.trim();return o.value.length===0&&pS.test(E)&&!l.value.has(E)?E:""}),c=V(()=>o.value.length+(r.value?1:0)),d=V(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(E){return fv(E)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const E=Math.max(c.value-1,0);n.value=Math.min(n.value+1,E)}function v(){n.value=Math.max(n.value-1,0)}function S(){const E=o.value[n.value];E?L(E):r.value&&n.value===o.value.length&&b(r.value)}function L(E){b(String(E.id))}function b(E){t("select",E),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function y(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&Ot(()=>{var E;return(E=i.value)==null?void 0:E.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:S,selectMember:L,selectId:b,closeOptions:g,onBlur:y}}};function bp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const fS={components:{DiscordUserCombobox:hv},template:`
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
  `,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f(null),i=f(null),l=f(!1),o=f(null),r=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=V(()=>JSON.stringify(n.value)!==JSON.stringify(i.value)),h=V(()=>new Map(c.value.map(C=>[String(C.id),C])));function m(C){return C.config&&C.config.enabled!==void 0?C.config.enabled:!0}function v(C){return bp(C,"require_mention",n.value)}function S(C){return bp(C,"respond_to_bots",n.value)}function L(C){return C.config&&Object.keys(C.config).length>0}function b(C){a.value[C]=!a.value[C]}function g(C){const I=C.discord||{};return{allowed_users:[...I.allowed_users||[]],channels:[...I.channels||[]],respond_to_bots:!!I.respond_to_bots,require_mention:!!I.require_mention,ignore_bot_ids:[...I.ignore_bot_ids||[]]}}async function y({showLoading:C=!0}={}){const I=++d;C&&(t.value=!0),s.value=null;try{const O=await U.get("/api/discord/guilds");I===d&&(e.value=O)}catch(O){I===d&&(s.value=O.message)}finally{C&&I===d&&(t.value=!1)}}async function E(){t.value=!0,s.value=null;try{const[C,I,O]=await Promise.all([U.get("/api/discord/guilds"),U.get("/api/discord/members").catch(()=>[]),U.get("/api/config")]),$=g(O),Q=p.value;n.value=$,Q||(i.value=JSON.parse(JSON.stringify($))),c.value=I,e.value=C,o.value=null}catch(C){s.value=C.message}finally{t.value=!1}}let _=Promise.resolve();const A=f(new Set);function T(C,I){const O=new Set(A.value);O.add(C),A.value=O;const $=_.then(I);return _=$.catch(()=>{}),$.finally(()=>{const Q=new Set(A.value);Q.delete(C),A.value=Q})}function x(C,I,O,$){const Q=($==null?void 0:$.target)??null;return T(`guild:${C}:${I}`,async()=>{try{await U.put("/api/discord/guild/"+C+"/config",{[I]:O}),await y({showLoading:!1})}catch(G){s.value=G.message,Q&&typeof O=="boolean"&&(Q.checked=!O)}})}function N(C,I,O,$,Q){const G=(Q==null?void 0:Q.target)??null;return T(`channel:${C}:${O}`,async()=>{try{await U.put("/api/discord/channel/"+C+"/config",{[O]:$}),await y({showLoading:!1})}catch(X){s.value=X.message,G&&typeof $=="boolean"&&(G.checked=!$)}})}function F(C,I){return T(`channel:${C}:clear`,async()=>{try{await U.put("/api/discord/channel/"+C+"/config",{clear:!0}),await y({showLoading:!1})}catch(O){s.value=O.message}})}function k(C,I){const O=String(I);if(!C.userAutocomplete)return O;const $=h.value.get(O);return $?fv($):O}function P(C,I=null){const O=String(I??r.value[C]??"").trim();!O||i.value[C].includes(O)||(i.value[C]=[...i.value[C],O],r.value={...r.value,[C]:""})}function B(C,I){i.value[C]=i.value[C].filter(O=>O!==I)}async function K(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const I=(await U.put("/api/config",{discord:i.value})).discord||i.value;n.value={allowed_users:[...I.allowed_users||[]],channels:[...I.channels||[]],respond_to_bots:!!I.respond_to_bots,require_mention:!!I.require_mention,ignore_bot_ids:[...I.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(n.value))}catch(C){o.value=C.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ge(E),{guilds:e,loading:t,error:s,expanded:a,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:S,hasOverride:L,toggleGuild:b,fetchAll:E,fetchGuilds:y,setGuildConfig:x,setChannelConfig:N,clearOverride:F,mutationPending:A,globalItemLabel:k,addGlobalItem:P,removeGlobalItem:B,saveGlobalDefaults:K}}},Cs=e=>e==null?e:JSON.parse(JSON.stringify(e));function hS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(_){d+=1;const A=c.then(_,_);return c=A.catch(()=>{}),A}function S(_,A){h=Cs(_),m.clear();for(const[T,x]of Object.entries(A||{}))m.set(T,Cs(x))}function L(_){const A=Cs(_),T=++u;return v(async()=>{try{await e(Cs(A)),h=Cs(A),T===u&&a(Cs(A))}catch(x){T===u&&(n(Cs(h)),r(x,{kind:"default"}))}})}function b(_,A){const T=Cs(A),x=(p.get(_)||0)+1;return p.set(_,x),v(async()=>{try{await t(_,Cs(T)),m.set(_,Cs(T)),x===p.get(_)&&i(_,Cs(T))}catch(N){x===p.get(_)&&(l(_,Cs(m.get(_)??null)),r(N,{kind:"user",uid:_}))}})}function g(_){const A=(p.get(_)||0)+1;return p.set(_,A),v(async()=>{try{await s(_),m.delete(_),A===p.get(_)&&o(_)}catch(T){A===p.get(_)&&(l(_,Cs(m.get(_)??null)),r(T,{kind:"delete",uid:_}))}})}async function y(){for(;;){const _=c;if(await _,_===c)return d}}async function E(_){for(;;){const A=await y(),T=await _();if(A===d)return T}}return{seed:S,saveDefault:L,saveUser:b,deleteUser:g,whenIdle:y,readSnapshot:E,get revision(){return d}}}const mS={components:{DiscordUserCombobox:hv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=V(()=>{const k={};for(const P of r.value)k[P.id]=P;return k});function d(k){return c.value[k]||null}function u(k,P){return k?k.allowed_hosts===null||k.allowed_hosts===void 0?{allowed_hosts:[...P],default_host:k.default_host||"",allow_all:!0}:{allowed_hosts:k.allowed_hosts,default_host:k.default_host||"",allow_all:!1}:{allowed_hosts:[...P],default_host:P[0]||"",allow_all:!0}}const p=hS({applyDefault:async k=>{const P=k.allow_all?null:k.allowed_hosts;await U.put("/api/host-access/default-policy",{allowed_hosts:P,default_host:k.default_host})},applyUser:async(k,P)=>{const B=P.allow_all?null:P.allowed_hosts;await U.put(`/api/host-access/user/${k}`,{allowed_hosts:B,default_host:P.default_host})},applyDelete:k=>U.del(`/api/host-access/user/${k}`),onDefaultConfirmed:()=>we.success("Default policy updated"),onDefaultRollback:k=>{k&&(i.value=k)},onUserConfirmed:k=>{const P=d(k);we.success(`Updated access for ${P?P.display_name:k}`)},onUserRollback:(k,P)=>{const B={...l.value};P?B[k]=P:delete B[k],l.value=B},onUserDeleted:k=>{const P={...l.value};delete P[k],l.value=P},onError:(k,P)=>{var K;const B=P.uid?` ${((K=d(P.uid))==null?void 0:K.display_name)||P.uid}`:"";we.error(`${k.message||"Failed to save"} — reverted${B}`)}});let h=0;async function m(){const k=++h;e.value=!0,t.value="";try{const P=await p.readSnapshot(()=>U.get("/api/host-access"));if(k!==h)return;s.value=P,a.value=P.available_hosts||[],n.value=P.host_descriptions||{},i.value=u(P.default_policy,a.value);const B=P.users||{},K={};for(const[C,I]of Object.entries(B))K[C]=u(I,a.value);l.value=K,p.seed(i.value,K)}catch(P){k===h&&(t.value=P.message||"Failed to fetch host access data")}finally{k===h&&(e.value=!1)}try{const P=await U.get("/api/discord/members")||[];k===h&&(r.value=P)}catch{k===h&&(r.value=[])}}const v=500,S=new Map;function L(k,P){const B=S.get(k);B&&clearTimeout(B.timer);const K={run:P,timer:null};K.timer=setTimeout(()=>{S.delete(k),P()},v),S.set(k,K)}function b(k){const P=S.get(k);P&&(clearTimeout(P.timer),S.delete(k))}function g(){for(const[k,P]of[...S])clearTimeout(P.timer),S.delete(k),P.run()}function y(){L("default",()=>p.saveDefault(i.value))}function E(k,P){i.value.allow_all=!1,P?i.value.allowed_hosts.includes(k)||i.value.allowed_hosts.push(k):(i.value.allowed_hosts=i.value.allowed_hosts.filter(B=>B!==k),i.value.default_host===k&&(i.value.default_host=i.value.allowed_hosts[0]||"")),y()}function _(k){L(`user:${k}`,()=>{const P=l.value[k];P&&p.saveUser(k,P)})}function A(k,P,B){const K=l.value[k];K&&(K.allow_all=!1,B?K.allowed_hosts.includes(P)||K.allowed_hosts.push(P):(K.allowed_hosts=K.allowed_hosts.filter(C=>C!==P),K.default_host===P&&(K.default_host=K.allowed_hosts[0]||"")),_(k))}function T(k,P){const B=l.value[k];B&&(B.default_host=P,_(k))}function x(){o.value=!0}function N(k){!/^\d{15,25}$/.test(k)||l.value[k]||(l.value[k]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(k,l.value[k]),o.value=!1)}async function F(k){const P=d(k);await Kt({title:"Remove user override",message:`Remove the host access override for ${P?P.display_name:k}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(b(`user:${k}`),await p.deleteUser(k),l.value[k]||we.success(`Removed override for ${P?P.display_name:k}`))}return Ge(m),Wt(g),mt(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:y,toggleDefaultHost:E,getMember:d,toggleUserHost:A,setUserDefault:T,openAddUser:x,addUserById:N,deleteUser:F,flushPendingSaves:g}}},vS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),S=f(v()),L=V(()=>["127.0.0.1","localhost","::1"].includes(S.value.address));async function b(){t.value=!0,s.value="";try{const K=await U.get("/api/hosts");e.value=K.hosts||[],o.value=K.default_host||"",r.value=!!K.tofu_enabled}catch(K){s.value=K.message}finally{t.value=!1}}async function g(){try{await U.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),we.success("Host settings saved and published live"),await b()}catch(K){we.error(K.message)}}function y(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function E(){i.value=!1,S.value=v(),y()}function _(K){i.value=!0,S.value={...v(),...K},y()}async function A(){try{c.value=await U.get("/api/hosts/public-key")}catch(K){we.error(K.message)}}async function T(K){try{const C=await U.post("/api/hosts/"+encodeURIComponent(K.alias)+"/import-legacy",{});i.value=!0,S.value={...v(),...K,trust_mode:"pinned"},y(),d.value=C.candidate_token,u.value=C.fingerprints||[],m.value=u.value.join(`
`),l.value=4,we.info("Imported existing known_hosts trust. Test before activation.")}catch(C){we.error(C.message)}}async function x(){try{const K=m.value.split(/\s+/).filter(Boolean),C={...S.value,expected_fingerprints:K,candidate_fingerprints:u.value},I=await U.post("/api/hosts/candidates",C);if(d.value=I.candidate_token,u.value=I.fingerprints||[],S.value.trust_mode==="tofu"&&C.candidate_fingerprints.length===0){S.value.confirm_tofu=!1,we.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(K){we.error(K.message)}}async function N(){var K,C;p.value=!1,h.value=null;try{const I=await U.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!I.tested,h.value=I.last_test,p.value&&(l.value=5)}catch(I){const O=(K=I.data)==null?void 0:K.last_test;O&&typeof O=="object"&&!Array.isArray(O)&&(h.value=O);const $=(C=h.value)==null?void 0:C.detail;we.error(typeof $=="string"&&$.trim()?$:I.message)}}async function F(){try{await U.post("/api/hosts/candidates/"+d.value+"/commit",{}),we.success("Host saved and published live"),n.value=!1,await b()}catch(K){we.error(K.message)}}async function k(K){try{await U.post("/api/hosts/"+encodeURIComponent(K.alias)+"/enabled",{enabled:!K.enabled}),await b()}catch(C){we.error(C.message)}}async function P(K){var C;if(await Kt("Delete host "+K.alias+"? Dependencies will block deletion.")){a.value=[];try{await U.del("/api/hosts/"+encodeURIComponent(K.alias)),await b()}catch(I){a.value=Array.isArray((C=I.data)==null?void 0:C.pending_references)?I.data.pending_references:[],we.error(I.message)}}}async function B(K){if(await Kt("Force revoke "+K.alias+"? Remote outcomes may be unknown."))try{await U.post("/api/hosts/"+encodeURIComponent(K.alias)+"/force-revoke",{}),await b()}catch(C){we.error(C.message)}}return Ge(b),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:S,isLocal:L,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:b,saveSettings:g,beginAdd:E,beginEdit:_,loadKey:A,importLegacy:T,prepare:x,testConnection:N,commit:F,toggle:k,remove:P,forceRevoke:B}}},gS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=V(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=V(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const T=await U.get("/api/tokens");s.value=T.tokens||[],a.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function v(T){return!T||!T.trim()?[]:T.split(",").map(x=>x.trim()).filter(Boolean)}function S(T,x){const N=c.value.allowed_hosts;if(x&&!N.includes(T)&&N.push(T),!x){const F=N.indexOf(T);F>=0&&N.splice(F,1)}}function L(T,x){const N=d.value.allowed_hosts;if(x&&!N.includes(T)&&N.push(T),!x){const F=N.indexOf(T);F>=0&&N.splice(F,1)}}async function b(){var T;i.value=!0;try{const x=v(c.value.allowed_tools_str),N=c.value.host_mode,F=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,k={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};F!==null&&(k.allowed_hosts=F),k.default_host=c.value.default_host||"";const P=await U.post("/api/tokens",k);l.value=P.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,we.success("Token created"),await m()}catch(x){we.error(((T=x.data)==null?void 0:T.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(T){o.value=T;const x=T.allowed_hosts;let N="default";x==null?N="default":Array.isArray(x)&&x.length===0?N="none":Array.isArray(x)&&(N="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:N,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function y(){var T;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),N=d.value.host_mode,F={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};N==="none"?F.allowed_hosts=[]:N==="select"?F.allowed_hosts=d.value.allowed_hosts:F.allowed_hosts=null,F.default_host=d.value.default_host||"",await U.put("/api/tokens/"+encodeURIComponent(o.value.user_id),F),o.value=null,we.success("Token updated"),await m()}catch(x){we.error(((T=x.data)==null?void 0:T.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function E(T){var N;if(await Kt({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const F=await U.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=F.token,we.success("Token regenerated")}catch(F){we.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to regenerate")}}async function _(T){var N;if(await Kt({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/tokens/"+encodeURIComponent(T.user_id)),we.success("Token deleted"),await m()}catch(F){we.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),we.success("Copied to clipboard")}catch{we.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:S,toggleEditHost:L,createToken:b,startEdit:g,saveEdit:y,confirmRegenerate:E,confirmDelete:_,copyToken:A}}},bS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),yS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),xS=Object.freeze(["enabled","base_url","model","max_tokens"]),_S=Object.freeze(["enabled","model","max_tokens"]);function or(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function yp(e){return or(e,bS)}function xp(e){return or(e,yS)}function wS(e,{includeApiKey:t=!1}={}){const s=or(e,xS);return t&&(s.api_key=e.api_key),s}function kS(e){return{timeout:e.timeout}}function SS(e,{includeApiKey:t=!1}={}){const s=or(e,_S);return t&&(s.api_key=e.api_key),s}function TS(e){return{timeout:e.timeout}}function Vl(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const CS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=V(()=>{const W=n.value.model;return W&&!i.includes(W)?[W,...i]:i}),o=V(()=>{const W=n.value.agent_model;return W&&W!=="auto"&&!i.includes(W)?[W,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(W,xe)=>!!W&&!!xe&&(r[W]||[]).includes(xe),d=W=>!c(n.value.model,W)&&!(n.value.agent_reasoning_effort===""&&c(n.value.agent_model,W)),u=W=>{const xe=n.value.agent_model;return xe==="auto"?!0:!c(xe||n.value.model,W)},p=V(()=>{const W=n.value.agent_reasoning_effort;return W==="auto"?null:W||n.value.reasoning_effort}),h=W=>c(W,n.value.reasoning_effort)||n.value.agent_model===""&&c(W,p.value),m=W=>c(W,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),S=f({unavailable_reason:null}),L=V(()=>{const W=v.value.model;return W&&!i.includes(W)?[W,...i]:i});function b(W){const xe=W.target.value;v.value.enabled=xe!=="",xe!==""&&(v.value.model=xe),ne()}const g=f(!1),y=f({codex:!1,ollama:!1,kimi:!1}),E=f(null),_=f(!1),A=f(""),T=f(null),x=f(!1);let N=0;const F=V(()=>{var W;return Object.entries(((W=E.value)==null?void 0:W.models)||{}).map(([xe,Ie])=>{var gs,ma,ja;return{model:xe,floor:Ie.floor,override:Ie.override,effectiveBudget:(gs=Ie.effective)==null?void 0:gs.effective_budget,configuredPrimaryChars:(ma=Ie.configured)==null?void 0:ma.primary_chars,primaryChars:(ja=Ie.effective)==null?void 0:ja.primary_chars,provenance:Ie.provenance,clampExpiresAt:Ie.clamp_expires_at,densityPriorMilli:Ie.density_prior_milli,densityScope:Ie.density_scope,workloadCalibration:Ie.workload_calibration}})}),k=V(()=>{var W;return((W=E.value)==null?void 0:W.clamps)||[]}),P=V(()=>{var W,xe;return((xe=(W=E.value)==null?void 0:W.models)==null?void 0:xe[n.value.model])||null}),B=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),K=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),C=f(!1),I=f(!1),O=f(!1),$=f(!1),Q=f(!1),G=f(!1),X=f(!1),re=f({configured:null}),Z=f(!1),ue=f([]),Oe=f(""),ae=f(!1),be=f(!1),q=f({configured:null}),de=f(!1),he=f([]),Le=f(""),w=f(!1),M=f(!1),z=f(!0),ce=f(""),ie=f({configured:null,accounts:[]}),le=f(null),me=f(null),H=f(""),ee=f(null),Y=f(!1),fe=f(null),pe=f(null),ye=f("");let Re=null;function ve(W,xe="success"){we(W,xe==="error"?"error":"success")}function He(W){if(!W)return"?";const xe=W/(1024*1024*1024);return xe>=1?xe.toFixed(1)+" GB":(W/(1024*1024)).toFixed(0)+" MB"}function Pe(W){return Number.isFinite(Number(W))?Number(W).toLocaleString():"—"}function ze(W){return W==null?"automatic (model-derived)":Number(W).toLocaleString()+" characters"}function Ye(W){const xe=new Date(W);return Number.isNaN(xe.getTime())?"unknown":xe.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function ot(W){return typeof W=="string"&&W.length>12?W.slice(0,8)+"…"+W.slice(-4):W}function nt(W){return typeof W!="number"||!Number.isFinite(W)?"—":(W/1e3).toFixed(2)}function J(W){return W==="temporary learned clamp"?"is-clamp":W==="override"?"is-override":"is-built-in"}function _e(W){const xe=n.value.context_budget_overrides[W.model];return W.floor!=null&&Number.isFinite(Number(xe))&&Number(xe)>W.floor}function Ce(W,xe){const Ie={...n.value.context_budget_overrides};xe.target.value===""?delete Ie[W]:Ie[W]=Number(xe.target.value),n.value.context_budget_overrides=Ie,x.value=!0}function Ne(W){n.value.context_utilization=W.target.value===""?"":Number(W.target.value),x.value=!0}function se(W){const xe={...n.value.context_budget_overrides};delete xe[W],n.value.context_budget_overrides=xe,x.value=!0}async function Ee(){e.value=!0,await Promise.all([De(),Nt(),Ls(),We(),Qe()]),e.value=!1}async function De({preserveBasic:W=!1,preserveAdvanced:xe=!1}={}){try{const Ie=await U.get("/api/llm/status");t.value=Ie,s.value=!1,a.value=Ie.active_provider||"codex",Ie.codex&&!Dt.pending()&&(W||(n.value.enabled=Ie.codex.enabled,n.value.model=Ie.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ie.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ie.codex.agent_reasoning_effort||"",n.value.agent_model=Ie.codex.agent_model||""),xe||(n.value.request_timeout_seconds=Ie.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ie.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ie.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ie.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ie.codex.context_compression||{}},!x.value&&!O.value&&(n.value.context_budget_overrides={...Ie.codex.context_budget_overrides||{}},n.value.context_utilization=Ie.codex.context_utilization??n.value.context_utilization))),Ie.ollama&&!Te.pending()&&(W||(B.value.enabled=Ie.ollama.enabled,B.value.base_url=Ie.ollama.base_url||"",B.value.model=Ie.ollama.model||"",B.value.max_tokens=Ie.ollama.max_tokens||4096),xe||(B.value.timeout=Ie.ollama.timeout??B.value.timeout)),Ie.kimi&&!$e.pending()&&(W||(K.value.enabled=Ie.kimi.enabled,K.value.model=Ie.kimi.model||"",K.value.max_tokens=Ie.kimi.max_tokens||4096),xe||(K.value.timeout=Ie.kimi.timeout??K.value.timeout)),Ie.auxiliary&&(S.value=Ie.auxiliary,ne.pending()||(v.value.enabled=Ie.auxiliary.enabled,v.value.model=Ie.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Qe(){const W=++N;_.value=!0,A.value="";try{const xe=await U.get("/api/context/windows");if(W!==N)return;E.value=xe,!O.value&&!x.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(xe.models||{}).filter(([,Ie])=>Ie.override!=null).map(([Ie,gs])=>[Ie,gs.override])),n.value.context_utilization=xe.utilization??n.value.context_utilization)}catch(xe){W===N&&(A.value=xe.message||"Failed to load context budgets")}finally{W===N&&(_.value=!1)}}async function Nt(){try{if(re.value=await U.get("/api/ollama/status"),Z.value=!1,re.value.model&&(Oe.value=re.value.model),re.value.configured)try{const W=await U.get("/api/ollama/models");ue.value=W.models||[]}catch{ue.value=[]}else if(B.value.base_url)try{const W=await U.post("/api/ollama/probe-models",{base_url:B.value.base_url});ue.value=W.models||[]}catch{ue.value=[]}}catch{Z.value=!0}}async function We(){z.value=!0,ce.value="";try{ie.value=await U.get("/api/codex/status")}catch(W){ce.value=W.message||"Failed to fetch Codex status"}finally{z.value=!1}}async function Bt(){const W=t.value?t.value.active_provider:"codex";X.value=!0;try{const xe=await U.post("/api/llm/switch",{provider:a.value});xe.error?(a.value=W,ve(xe.error,"error")):(ve("Switched to "+a.value+" ("+xe.model+")"),await Ee())}catch(xe){a.value=W,ve(xe.message||"Switch failed","error")}finally{X.value=!1}}async function Ht(){ae.value=!0;try{const W=await U.post("/api/ollama/reload");ve(W.configured?"Ollama reloaded":W.reason||"Ollama not configured",W.configured?"success":"error"),await Ee()}catch(W){ve(W.message||"Reload failed","error")}finally{ae.value=!1}}async function ms(){be.value=!0;try{await U.post("/api/ollama/model",{model:Oe.value}),ve("Model set to "+Oe.value),await Ee()}catch(W){ve(W.message||"Failed","error")}finally{be.value=!1}}async function Xs(){const W=B.value.base_url;if(!W){ve("Enter a base URL first","error");return}G.value=!0;try{const xe=await U.post("/api/ollama/probe-models",{base_url:W});ue.value=xe.models||[],ue.value.length?(ve(ue.value.length+" model(s) found"),!B.value.model&&ue.value.length&&(B.value.model=ue.value[0].name)):ve("No models found at "+W,"error")}catch(xe){ve(xe.message||"Could not reach Ollama","error")}finally{G.value=!1}}async function Ls(){try{if(q.value=await U.get("/api/kimi/status"),de.value=!1,q.value.model&&(Le.value=q.value.model),q.value.configured)try{const W=await U.get("/api/kimi/models");he.value=W.models||[]}catch{he.value=[]}}catch{de.value=!0}}async function Ua(){w.value=!0;try{const W=await U.post("/api/kimi/reload");ve(W.configured?"Kimi reloaded":W.reason||"Kimi not configured",W.configured?"success":"error"),await Ee()}catch(W){ve(W.message||"Reload failed","error")}finally{w.value=!1}}async function fa(){M.value=!0;try{await U.post("/api/kimi/model",{model:Le.value}),ve("Model set to "+Le.value),await Ee()}catch(W){ve(W.message||"Failed","error")}finally{M.value=!1}}async function Ns(){if(O.value){Dt();return}O.value=!0;const W=yp(n.value);try{await U.put("/api/llm/codex/config",W),ve("Codex config saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),We()])}catch(xe){ve(xe.message||"Failed","error");const Ie=JSON.stringify(yp(n.value))!==JSON.stringify(W);await Promise.all([De({preserveBasic:Ie,preserveAdvanced:!0}),We()])}finally{O.value=!1}}async function Ba(){if(O.value)return;O.value=!0;const W=xp(n.value);try{await U.put("/api/llm/codex/config",W),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:W.context_budget_overrides,context_utilization:W.context_utilization})&&(x.value=!1),ve("Codex advanced settings saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),We(),Qe()])}catch(xe){ve(xe.message||"Failed","error");const Ie=JSON.stringify(xp(n.value))!==JSON.stringify(W);await Promise.all([De({preserveBasic:!0,preserveAdvanced:Ie}),We(),Qe()])}finally{O.value=!1}}async function vs(){if($.value){Te();return}$.value=!0;try{const W=C.value?B.value.api_key:null,xe=wS(B.value,{includeApiKey:W!==null});await U.put("/api/llm/ollama/config",xe),ve("Ollama config saved"),W!==null&&B.value.api_key===W&&(B.value.api_key="",C.value=!1),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(W){ve(W.message||"Failed","error")}finally{$.value=!1}}async function ha(){if(!$.value){$.value=!0;try{await U.put("/api/llm/ollama/config",kS(B.value)),ve("Ollama timeout saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(W){ve(W.message||"Failed","error")}finally{$.value=!1}}}async function Ds(){if(Q.value){$e();return}Q.value=!0;try{const W=I.value?K.value.api_key:null,xe=SS(K.value,{includeApiKey:W!==null});await U.put("/api/llm/kimi/config",xe),ve("Kimi config saved"),W!==null&&K.value.api_key===W&&(K.value.api_key="",I.value=!1),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Ls()])}catch(W){ve(W.message||"Failed","error")}finally{Q.value=!1}}async function et(){if(!Q.value){Q.value=!0;try{await U.put("/api/llm/kimi/config",TS(K.value)),ve("Kimi timeout saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Ls()])}catch(W){ve(W.message||"Failed","error")}finally{Q.value=!1}}}async function Ps(){if(g.value){ne();return}g.value=!0;try{await U.put("/api/llm/auxiliary/config",v.value),ve("Auxiliary config saved"),await De()}catch(W){ve(W.message||"Failed","error"),await De()}finally{g.value=!1}}const Dt=Vl(Ns),ne=Vl(Ps),Te=Vl(vs),$e=Vl(Ds),tt=()=>(Dt.cancel(),Ns()),wt=()=>(Te.cancel(),vs()),pt=()=>($e.cancel(),Ds()),Ha=()=>Ba(),qs=()=>ha(),wi=()=>et();async function ki(W){const xe=W.account_key+":"+W.model;T.value=xe;try{const Ie=await U.post("/api/context/windows/clear",{account_key:W.account_key,model:W.model});ve(Ie.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Qe()}catch(Ie){ve(Ie.message||"Failed to clear clamp","error"),await Qe()}finally{T.value=null}}async function Nn(W){try{await U.post("/api/codex/account/"+W+"/activate"),ve("Active account switched"),await We()}catch(xe){ve(xe.message||"Failed","error")}}async function Dn(W){le.value=W;try{await U.post("/api/codex/account/"+W+"/refresh"),ve("Token refreshed"),await We()}catch(xe){ve(xe.message||"Refresh failed","error")}finally{le.value=null}}function ln(W,xe){me.value=W,H.value=xe||""}async function za(W){try{await U.put("/api/codex/account/"+W+"/label",{label:H.value}),ve("Label updated"),me.value=null,await We()}catch(xe){ve(xe.message||"Failed","error")}}async function Gs(W,xe){if(await Kt({title:"Delete Codex account",message:`Delete ${xe||"account #"+(W+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/codex/account/"+W),ve("Deleted. Pool reloaded."),await We()}catch(gs){ve(gs.message||"Failed","error")}}async function ea(){Y.value=!0;try{const W=await U.post("/api/codex/device-code");fe.value=W,ee.value="pending",Ts(W)}catch(W){ve(W.message||"Failed","error")}finally{Y.value=!1}}async function Ts(W){Re={cancelled:!1};const xe=Re;try{const Ie=await U.post("/api/codex/device-poll",{device_auth_id:W.device_auth_id,user_code:W.user_code,interval:W.interval});if(xe.cancelled)return;pe.value=Ie,ee.value="success",await Ee()}catch(Ie){if(xe.cancelled)return;ye.value=Ie.message||"Device login failed",ee.value="error"}}function Pn(){Re&&(Re.cancelled=!0),ee.value=null,fe.value=null}return Ge(Ee),mt(()=>{Re&&(Re.cancelled=!0),Dt.cancel(),ne.cancel(),Te.cancel(),$e.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:X,advancedOpen:y,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:S,auxModelOptions:L,onAuxModelChange:b,savingAux:g,saveAuxConfigDebounced:ne,ollamaForm:B,kimiForm:K,savingCodex:O,savingOllama:$,savingKimi:Q,probingOllama:G,ollamaKeyDirty:C,kimiKeyDirty:I,fetchCodexStatus:We,ollamaStatus:re,ollamaStatusLoadFailed:Z,ollamaModels:ue,ollamaSelectedModel:Oe,reloading:ae,settingModel:be,kimiStatus:q,kimiStatusLoadFailed:de,kimiModels:he,kimiSelectedModel:Le,reloadingKimi:w,settingKimiModel:M,codexLoading:z,codexError:ce,codexData:ie,refreshing:le,editingLabel:me,labelValue:H,contextWindows:E,contextWindowsLoading:_,contextWindowsError:A,contextBudgetRows:F,activeClampRows:k,activeContextBudget:P,clearingClamp:T,contextPolicyDirty:x,deviceState:ee,deviceLoading:Y,deviceInfo:fe,deviceResult:pe,deviceError:ye,fetchAll:Ee,fetchLLMStatus:De,fetchOllamaStatus:Nt,fetchKimiStatus:Ls,switchProvider:Bt,reloadOllama:Ht,setOllamaModel:ms,reloadKimi:Ua,setKimiModel:fa,probeOllamaModels:Xs,saveCodexConfig:Ns,saveOllamaConfig:vs,saveKimiConfig:Ds,saveCodexAdvancedConfig:Ba,saveOllamaAdvancedConfig:ha,saveKimiAdvancedConfig:et,saveCodexConfigDebounced:Dt,saveOllamaConfigDebounced:Te,saveKimiConfigDebounced:$e,saveCodexConfigNow:tt,saveOllamaConfigNow:wt,saveKimiConfigNow:pt,saveCodexAdvancedConfigNow:Ha,saveOllamaAdvancedConfigNow:qs,saveKimiAdvancedConfigNow:wi,activateAccount:Nn,refreshAccount:Dn,startEditLabel:ln,saveLabel:za,deleteAccount:Gs,startDeviceLogin:ea,cancelDeviceLogin:Pn,formatSize:He,fetchContextWindows:Qe,clearContextClamp:ki,setContextOverride:Ce,setContextUtilization:Ne,resetContextOverride:se,overrideAboveFloor:_e,formatCount:Pe,formatContextCeiling:ze,formatExpiry:Ye,shortAccountKey:ot,provenanceClass:J,formatDensity:nt}}},_p={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function ES(e){return _p[e]||_p[(e||"").toLowerCase()]||"text-gray-400"}const AS={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=V(()=>{var _;return Object.values(((_=i.value)==null?void 0:_.totals)||{}).reduce((A,T)=>A+Number(T||0),0)}),u=f(""),p=f(0),h=f([]),m=V(()=>h.value.map(_=>`${_.label} (${_.path}${_.reason?`: ${_.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let S=null;async function L(){var N;const _=await Promise.allSettled(v.map(F=>U.get(F.path))),A=F=>_[F].status==="fulfilled"?_[F].value:null;t.value=A(0)||{};const T=A(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],a.value=A(2)||{},n.value=A(3)||{},i.value=A(4),l.value=A(5),o.value=A(6),r.value=A(7),c.value=A(8);const x=_.filter(F=>F.status==="rejected");if(h.value=_.flatMap((F,k)=>{var P;return F.status==="rejected"?[{...v[k],reason:((P=F.reason)==null?void 0:P.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===_.length){const F=(N=x[0])==null?void 0:N.reason;u.value=(F==null?void 0:F.message)||"Failed to load internals"}else u.value="";e.value=!1}function b(){e.value=!0,u.value="",L()}let g=!1;function y(){g||(g=!0,L(),S||(S=setInterval(L,3e4)))}function E(){g&&(g=!1,S&&(clearInterval(S),S=null))}return Ge(y),es(y),Wt(E),mt(E),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:b,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:ES,formatAgeSeconds:Ww}}},RS=1e4,wp=3e4;function Oi(e,t){return Math.max(0,e-t)}function Lr(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const IS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],OS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const I=++p;a.value=!0;try{const O=await U.get("/api/turn-state/turns?limit=100");if(I!==p)return;t.value=O.availability,e.value=O.availability==="available"?O.data:null,s.value=null,n.value=Date.now()}catch(O){if(I!==p)return;s.value=O.message||"Turn-state read failed",O.status===503&&(t.value="unavailable")}I===p&&(a.value=!1)}async function v(){const I=++h;r.value=!0;try{const O=await U.get("/api/turn-state/capacity-breakers");if(I!==h)return;l.value=O.availability,i.value=O.availability==="available"?O.data:null,o.value=null,c.value=Date.now()}catch(O){if(I!==h)return;o.value=O.message||"Breaker read failed",O.status===503&&(l.value="unavailable")}I===h&&(r.value=!1)}function S(){m(),v()}const L=V(()=>e.value!==null&&Oi(d.value,n.value)>wp),b=V(()=>i.value!==null&&Oi(d.value,c.value)>wp),g=V(()=>L.value||b.value),y=V(()=>Math.round(Oi(d.value,n.value)/1e3)),E=V(()=>Math.round(Oi(d.value,c.value)/1e3));function _(I){return Lr(I,d.value/1e3)}function A(I){return IS[_(I)]}const T=V(()=>{var $;const I=[...(($=e.value)==null?void 0:$.turns)||[]],O=d.value/1e3;return I.sort((Q,G)=>Lr(Q,O)-Lr(G,O)||(G.last_progress_at||0)-(Q.last_progress_at||0))});function x(I){return I.state==="closed"?"badge-success":I.state==="probing"?"badge-warning":"badge-danger"}function N(I){if(I.state==="closed")return"—";const O=Oi(d.value,c.value)/1e3,$=Math.max(0,(I.cooldown_remaining_seconds||0)-O);return $>0?`${Math.ceil($)}s`:I.state==="probing"?"probe in flight":"probe eligible"}function F(I){if(!I)return"";const O=Math.max(0,Math.round(d.value/1e3-I));if(O<90)return`${O}s ago`;const $=Math.round(O/60);return $<90?`${$}m ago`:`${Math.round($/60)}h ago`}let k=null,P=null,B=!1;function K(){B||(B=!0,S(),k=setInterval(S,RS),u=setInterval(()=>{d.value=Date.now()},1e3),P=at.onReconnected(S))}function C(){B&&(B=!1,k&&(clearInterval(k),k=null),u&&(clearInterval(u),u=null),P&&(P(),P=null))}return Ge(K),es(K),Wt(C),mt(C),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:L,breakersStale:b,anyStale:g,turnsAgeSeconds:y,breakersAgeSeconds:E,sortedTurns:T,priorityOf:_,priorityBadge:A,breakerBadge:x,cooldownLabel:N,ageLabel:F,fetchTurns:m,fetchBreakers:v,refreshAll:S,arm:K,disarm:C}}},LS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await U.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Kt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await U.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(C,I)=>p&&h===C&&U.token===I,S=C=>"computer-provisioning-"+C.key,L=C=>C===null?"Unset":C===""?"Empty":JSON.stringify(C),b=C=>{const I=n.value[C.key];return C.type==="array"?String(I||"").split(/\r?\n/).map(O=>O.trim()).filter(Boolean):["integer","number"].includes(C.type)?I===""||I==null?null:Number(I):I},g=V(()=>s.value.map(C=>({...C,value:b(C)})).filter(C=>!NS(C.value,a.value[C.key]))),y=V(()=>s.value.filter(C=>C.pending_restart).map(C=>C.label)),E=V(()=>s.value.some(C=>C.apply_state==="unknown")),_=V(()=>{const C={};for(const I of s.value){const O=b(I),$=I.constraints||{};["integer","number"].includes(I.type)&&(O===null&&!I.nullable?C[I.key]="A number is required.":O!==null&&(!Number.isFinite(O)||I.type==="integer"&&!Number.isInteger(O)||$.minimum!=null&&O<$.minimum||$.maximum!=null&&O>$.maximum)&&(C[I.key]="Enter a number within the allowed range.")),I.key==="monitor_names"&&(O.length>16||new Set(O).size!==O.length||O.some(Q=>!/^[A-Za-z0-9_.-]{1,64}$/.test(Q)))&&(C[I.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return C}),A=V(()=>Object.keys(_.value).length>0);function T(C,I){n.value[C.key]=I,u.value=""}function x(){n.value=Object.fromEntries(s.value.map(C=>[C.key,C.type==="array"?a.value[C.key].join(`
`):a.value[C.key]])),r.value=!1}async function N(C,I){const[O,$]=await Promise.all([U.get("/api/config"),U.get("/api/config/meta")]);if(!v(C,I))return!1;const Q=($.fields||[]).filter(G=>/^computer\.[^.]+$/.test(G.path)&&G.path!=="computer.enabled"&&G.sensitivity==="public"&&G.apply_mode==="restart");if(!O.computer||!Q.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=Q.map(G=>({...G,key:G.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(G=>[G.key,kp(O.computer[G.key])])),x(),m=I,i.value=!0,c.value=!1,!0}async function F(){if(!p||l.value||o.value)return;const C=++h,I=U.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await N(C,I)}catch(O){v(C,I)&&(c.value=!0,d.value=O.message||"Could not load provisioning. No changes were sent.")}finally{v(C,I)&&(l.value=!1)}}function k(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!A.value&&(r.value=!0)}async function P(){if(!p||!i.value||!r.value||o.value||l.value||c.value||A.value||!g.value.length)return;if(m!==U.token){K(),B();return}const C={computer:Object.fromEntries(g.value.map(Q=>[Q.key,kp(Q.value)]))},I=h,O=U.token;o.value=!0,d.value="",u.value="";let $=!1;try{if(await U.put("/api/config",C),$=!0,!v(I,O))return;await N(I,O)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(Q){v(I,O)&&(c.value=!0,r.value=!1,d.value=$?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${Q.status===400?": "+Q.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(I,O)&&(o.value=!1)}}function B(){p||(p=!0,F())}function K(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(B),es(B),Wt(K),mt(K),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:y,effectiveUnknown:E,changes:g,validation:_,invalid:A,fieldId:S,format:L,edit:T,discard:x,load:F,openReview:k,save:P}}},PS={components:{ComputerProvisioning:DS},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),v=f(""),S=f(!1),L=f(Date.now()),b=f(""),g=f(null);let y=0,E=null,_=!1,A=U.token,T=0,x=null,N=null,F=!1;const k=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",P=V(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),B=V(()=>{var ee;const H=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(H)&&L.value-H<15e3&&L.value>=H-5e3}),K=V(()=>{var H;return B.value?k((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),C=V(()=>{var H;return B.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),I=V(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,ee])=>`${H}: ${ee}`).join(", ")),O=V(()=>{var ee;const H=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),$=V(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),Q=V(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),G=V(()=>{var ee,Y;const H=Date.parse(((ee=m.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(H)&&L.value<H+Math.min(1e4,((Y=m.value)==null?void 0:Y.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function X(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function re(){y++,X(),g.value=null,c.value=!1,x==null||x.abort(),x=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function Z(H,ee){return _&&H===y&&ee===U.token}function ue(){return _&&c.value&&N===U.token&&Date.now()-u.value<15e3}function Oe(H,ee="mutation"){var fe,pe;re(),F=!0,p.value="";const Y=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(Y)?(u.value=0,N=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:Y===503?"unavailable":"unknown"}),o.value=Y===401||Y===403||Y===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":Y===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(Y)&&typeof((fe=H.data)==null?void 0:fe.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((pe=H.data)==null?void 0:pe.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function ae(){if(t.value||r.value||a.value||n.value||d.value||!_)return;const H=y,ee=U.token;t.value=!0,T=Date.now();const Y=new AbortController;x=Y;try{const fe=await U.get("/api/computer",{signal:Y.signal});if(!Z(H,ee))return;be(fe)}catch(fe){Z(H,ee)&&Oe(fe,"read")}finally{x===Y&&(x=null,t.value=!1)}}function be(H,ee=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&re(),e.value=H,u.value=Date.now(),N=U.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",F=!c.value}async function q(H){if(!ue()||r.value||a.value||n.value||d.value)return;re();const ee=y,Y=U.token;r.value=!0;let fe=!1;try{if(await U.post("/api/computer/enabled",{enabled:H}),fe=!0,!Z(ee,Y))return;const pe=await U.get("/api/computer");Z(ee,Y)&&be(pe,"toggle")}catch(pe){Z(ee,Y)&&Oe(pe,fe?"acknowledged":"mutation")}finally{r.value=!1}}async function de(H){if(!_||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;re();const ee=y,Y=U.token,fe=H==="stop"?a:n;fe.value=!0;let pe=!1;try{if(await U.post("/api/computer/"+H,{}),pe=!0,Z(ee,Y)){const ye=await U.get("/api/computer");Z(ee,Y)&&be(ye,H)}}catch(ye){Z(ee,Y)&&Oe(ye,pe?"acknowledged":"mutation")}finally{fe.value=!1}}async function he(){var fe;if(!ue()||d.value||((fe=e.value.backend)==null?void 0:fe.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;re();const ee=y,Y=U.token;d.value=!0;try{const pe=await U.post("/api/computer/release_owned_input",H);Z(ee,Y)&&be(pe,"recovery")}catch(pe){Z(ee,Y)&&Oe(pe,"mutation")}finally{d.value=!1}}async function Le(){return M(!1)}async function w(){return M(!0)}async function M(H){var Re;if(!ue()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(H){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=h.value}const Y=H?((Re=e.value.recovery)==null?void 0:Re.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const fe=y,pe=U.token;d.value=!0;let ye=!1;try{const ve=await U.post("/api/computer/"+Y,ee);ye=!0,Z(fe,pe)&&be(ve,"recovery")}catch(ve){Z(fe,pe)&&Oe(ve,ye?"acknowledged":"mutation")}finally{d.value=!1}}async function z(){var Y;if(!ue()||s.value||!e.value.available)return;X(),S.value=!1;const H=y,ee=U.token;s.value=!0;try{const fe=await U.post("/api/computer/observe",{});if(!Z(H,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((Y=fe.frame)==null?void 0:Y.evidence_id)||""))throw new Error("Invalid evidence");const pe=await U.getBlob("/api/computer/evidence/"+fe.frame.evidence_id);if(!Z(H,ee))return;if(!["image/png","image/jpeg"].includes(pe.type)||pe.size>2097152||!Number.isFinite(Date.parse(fe.frame.expires_at))||Date.parse(fe.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=fe.frame,v.value=URL.createObjectURL(pe),o.value=""}catch(fe){Z(H,ee)&&Oe(fe)}finally{H===y&&(s.value=!1)}}async function ce(){if(!ue()||i.value||!e.value.available)return;g.value=null;const H=y,ee=U.token;i.value=!0;try{const Y=await U.post("/api/computer/export",{name:b.value});Z(H,ee)&&(g.value=Y,o.value="")}catch(Y){Z(H,ee)&&Oe(Y)}finally{H===y&&(i.value=!1)}}async function ie(){if(!ue()||l.value||!g.value)return;const H=y,ee=U.token,Y=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((Y==null?void 0:Y.artifact_id)||""))throw new Error("Invalid export");const fe=await U.getBlob("/api/computer/download/"+Y.artifact_id);if(!Z(H,ee))return;const pe=URL.createObjectURL(fe),ye=document.createElement("a");ye.href=pe,ye.download=Y.name,ye.click(),setTimeout(()=>URL.revokeObjectURL(pe),1e3)}catch(fe){Z(H,ee)&&Oe(fe)}finally{H===y&&(l.value=!1)}}function le(){_||(A!==U.token&&(A=U.token,re(),u.value=0,N=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),_=!0,ae(),E=setInterval(()=>{L.value=Date.now(),A!==U.token&&(A=U.token,re(),u.value=0,N=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&L.value-u.value>=15e3&&re(),m.value&&Date.parse(m.value.expires_at)<=L.value&&(X(),S.value=!0),g.value&&Date.parse(g.value.expires_at)<=L.value&&(g.value=null),!F&&L.value-T>=5e3&&ae()},500))}function me(){_=!1,clearInterval(E),E=null,re(),c.value=!1}return Ge(le),es(le),Wt(me),mt(me),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:S,freshness:G,name:b,artifact:g,refresh:ae,control:de,observe:z,clearFrame:X,exportFile:ce,download:ie,toggling:r,adminReady:c,enabledLabel:k,restartSettings:Q,setEnabled:q,recovering:d,recover:Le,reconcile:w,releaseOwnedInput:he,reconciliationAck:h,applicationProfiles:$,attached:P,scriptIdentity:O,inputLimits:I,accessibilityLabel:K,accessibilityDetail:C}}},mv=[{id:"health",label:"Health",component:Bk},{id:"resources",label:"Resources",component:Hk},{id:"logs",label:"Logs",component:Xk},{id:"config",label:"Config",component:uS},{id:"discord",label:"Discord",component:fS},{id:"hosts",label:"Hosts",component:vS},{id:"host-access",label:"Host Access",component:mS},{id:"api-tokens",label:"API Tokens",component:gS},{id:"llm",label:"LLM Config",component:CS},{id:"internals",label:"Internals",component:AS},{id:"turn-state",label:"Turn State",component:OS},{id:"computer",label:"Computer",component:PS},{id:"update",label:"Update",component:LS}],MS={components:{TabbedPage:ir},setup(){return{tabs:mv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},ql=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),FS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...ql("Operations","operations","/operations",iv),...ql("History","history","/history",lv),...ql("Capabilities","capabilities","/capabilities",ov),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...ql("System","system","/system",mv)],xs=an({open:!1,query:"",selected:0});function Sp(){xs.query="",xs.selected=0,xs.open=!0}function Nr(){xs.open=!1}function $S(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const US={setup(){const e=Ym(),t=f(null),s=V(()=>{const i=xs.query.trim().toLowerCase();return FS.map(l=>({...l,_score:$S(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});$t(()=>xs.open,async i=>{var l;i&&(await Ot(),(l=t.value)==null||l.focus())}),$t(()=>xs.query,()=>{xs.selected=0});function a(i){Nr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Nr();return}if(i.key==="ArrowDown")i.preventDefault(),xs.selected=Math.min(xs.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),xs.selected=Math.max(xs.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[xs.selected];l&&a(l)}}return{state:xs,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Nr}},template:`
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
  `},xc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(xc));const BS={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ci("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ci("path",{d:xc[e.name]||xc.info})])}},HS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Tp(e){return[...e.querySelectorAll(HS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const zS={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Tp(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Tp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},jS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=V(()=>{const Q=e.value.uptime_seconds||0,G=Math.floor(Q/86400),X=Math.floor(Q%86400/3600),re=Math.floor(Q%3600/60),Z=[];return G>0&&Z.push(`${G}d`),X>0&&Z.push(`${X}h`),(Z.length===0||G===0&&X===0)&&Z.push(`${re}m`),Z.join(" ")}),m=V(()=>{const Q=e.value.uptime_seconds||0;return 125.66*(1-Math.min(Q/86400,1))}),v=V(()=>{const Q=e.value;return[{label:"Guilds",value:Q.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:Q.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:Q.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${Q.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:Q.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:Q.loop_count>0?"text-green-400":"",highlight:Q.loop_count>0},{label:"Agents",value:Q.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:Q.agent_count>0?`${Q.agent_count} total`:"",subColor:"text-gray-500",highlight:(Q.agent_running??0)>0},{label:"Processes",value:Q.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:Q.process_count>0?`${Q.process_count} total`:"",subColor:"text-gray-500",highlight:(Q.process_running??0)>0},{label:"Schedules",value:Q.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(Q.schedule_failing>0?`${Q.schedule_failing} failing`:"")+(Q.schedule_failing>0&&Q.schedule_paused>0?", ":"")+(Q.schedule_paused>0?`${Q.schedule_paused} paused`:"")||void 0,subColor:Q.schedule_failing>0?"text-red-400":"text-yellow-400",color:Q.schedule_failing>0?"text-red-400":"",highlight:Q.schedule_failing>0},{label:"Users",value:Q.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),S=V(()=>{const Q=e.value,G=[];return G.push({label:"Bot",status:Q.status==="online"?"ok":"warn",detail:Q.status==="online"?"Online":"Starting"}),(Q.schedule_failing||0)>0?G.push({label:"Schedules",status:"error",detail:`${Q.schedule_failing} failing`}):(Q.schedule_count||0)>0&&G.push({label:"Schedules",status:"ok",detail:`${Q.schedule_count} configured`}),(Q.loop_count||0)>0&&G.push({label:"Loops",status:"ok",detail:`${Q.loop_count} active`}),(Q.agent_running||0)>0&&G.push({label:"Agents",status:"ok",detail:`${Q.agent_running} running`}),(Q.process_running||0)>0&&G.push({label:"Processes",status:"ok",detail:`${Q.process_running} running`}),G});async function L(){try{e.value=await U.get("/api/status"),s.value=null}catch(Q){s.value=Q.message}finally{t.value=!1}}let b=0,g=0,y=0,E=0;function _(Q,G){const X=new Set;return[...G,...Q].filter(re=>{const Z=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return X.has(Z)?!1:(X.add(Z),!0)})}async function A(){const Q=++b,G=y;n.value=!0;try{const X=await U.get("/api/audit?limit=10");if(Q!==b)return;const re=G===y?[]:a.value.filter(Z=>(Z._liveEpoch||0)>G);a.value=_(X,re).slice(0,10),c.value=re.length}catch{}Q===b&&(n.value=!1)}async function T(){const Q=++g,G=E;l.value=!0;try{const X=await U.get("/api/audit?error_only=1&limit=5");if(Q!==g)return;const re=G===E?[]:i.value.filter(Z=>(Z._liveErrorEpoch||0)>G);i.value=_(X,re).slice(0,5),o.value=!1}catch{if(Q!==g)return;o.value=G===E||i.value.length===0}Q===g&&(l.value=!1)}async function x(){try{const Q=await U.get("/api/knowledge");d.value=(Array.isArray(Q)?Q:[]).reduce((G,X)=>G+(X.chunks||0),0)}catch{d.value=null}}async function N(){try{const Q=await U.get("/api/agents");r.value=Q.filter(G=>G.status==="running")}catch{}}async function F(){u.value={...u.value,reload:!0};try{await U.post("/api/reload"),we.success("Config reloaded")}catch(Q){we.error(Q.message)}u.value={...u.value,reload:!1}}async function k(){if(!await Kt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const G=e.value.session_count;e.value={...e.value,session_count:0};try{const X=await U.post("/api/sessions/clear-all");we.success(`Cleared ${X.count} session${X.count!==1?"s":""}`),await L()}catch(X){e.value={...e.value,session_count:G},we.error(X.message)}u.value={...u.value,clearSessions:!1}}async function P(){if(!await Kt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const G=e.value.loop_count;e.value={...e.value,loop_count:0};try{const X=await U.post("/api/loops/stop-all");we.success(X.result),await L()}catch(X){e.value={...e.value,loop_count:G},we.error(X.message)}u.value={...u.value,stopLoops:!1}}function B(){t.value=!0,s.value=null,L(),A(),T(),N()}let K=null,C=null,I=null;function O(Q){if(Q.payload&&Q.payload.tool_name){y+=1;const G={...Q.payload,_isNew:!0,_key:++p,_liveEpoch:y};a.value.unshift(G),a.value.length>10&&a.value.pop(),c.value++,G.error&&(E+=1,G._liveErrorEpoch=E,o.value=!1,i.value.unshift(G),i.value.length>5&&i.value.pop()),setTimeout(()=>{G._isNew=!1},1500),clearTimeout(I),I=setTimeout(()=>{c.value=0},1e4)}}let $=null;return Ge(async()=>{await Promise.all([L(),A(),T(),N(),x()]),K=setInterval(L,15e3),C=setInterval(N,1e4),at.subscribe("events",O),$=at.onReconnected(()=>{A(),T()})}),mt(()=>{K&&clearInterval(K),C&&clearInterval(C),clearTimeout(I),at.unsubscribe("events",O),$&&($(),$=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:S,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:A,fetchErrors:T,fetchStatus:L,onEvent:O,formatTime:Kw,formatDuration:bi,retry:B,reloadConfig:F,clearSessions:k,stopAllLoops:P}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Cp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function VS(e){if(Array.isArray(e))return e}function qS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function GS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function KS(e,t){return VS(e)||qS(e,t)||WS(e,t)||GS()}function WS(e,t){if(e){if(typeof e=="string")return Cp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Cp(e,t):void 0}}const vv=Object.entries,Ep=Object.setPrototypeOf,JS=Object.isFrozen,ZS=Object.getPrototypeOf,YS=Object.getOwnPropertyDescriptor;let hs=Object.freeze,Vs=Object.seal,Kn=Object.create,gv=typeof Reflect<"u"&&Reflect,_c=gv.apply,wc=gv.construct;hs||(hs=function(t){return t});Vs||(Vs=function(t){return t});_c||(_c=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});wc||(wc=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const ya=Ut(Array.prototype.forEach),QS=Ut(Array.prototype.lastIndexOf),Ap=Ut(Array.prototype.pop),zn=Ut(Array.prototype.push),XS=Ut(Array.prototype.splice),cs=Array.isArray,Ui=Ut(String.prototype.toLowerCase),Dr=Ut(String.prototype.toString),Rp=Ut(String.prototype.match),jn=Ut(String.prototype.replace),Ip=Ut(String.prototype.indexOf),e1=Ut(String.prototype.trim),t1=Ut(Number.prototype.toString),s1=Ut(Boolean.prototype.toString),Op=typeof BigInt>"u"?null:Ut(BigInt.prototype.toString),Lp=typeof Symbol>"u"?null:Ut(Symbol.prototype.toString),Ct=Ut(Object.prototype.hasOwnProperty),Li=Ut(Object.prototype.toString),Jt=Ut(RegExp.prototype.test),un=a1(TypeError);function Ut(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return _c(e,t,a)}}function a1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return wc(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ui;if(Ep&&Ep(e,null),!cs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(JS(t)||(t[a]=i),n=i)}e[n]=!0}return e}function n1(e){for(let t=0;t<e.length;t++)Ct(e,t)||(e[t]=null);return e}function ss(e){const t=Kn(null);for(const a of vv(e)){var s=KS(a,2);const n=s[0],i=s[1];Ct(e,n)&&(cs(i)?t[n]=n1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ss(i):t[n]=i)}return t}function i1(e){switch(typeof e){case"string":return e;case"number":return t1(e);case"boolean":return s1(e);case"bigint":return Op?Op(e):"0";case"symbol":return Lp?Lp(e):"Symbol()";case"undefined":return Li(e);case"function":case"object":{if(e===null)return Li(e);const t=e,s=na(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Li(a)}return Li(e)}default:return Li(e)}}function na(e,t){for(;e!==null;){const a=YS(e,t);if(a){if(a.get)return Ut(a.get);if(typeof a.value=="function")return Ut(a.value)}e=ZS(e)}function s(){return null}return s}function l1(e){try{return Jt(e,""),!0}catch{return!1}}const Np=hs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Pr=hs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Mr=hs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),o1=hs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Fr=hs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),r1=hs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Dp=hs(["#text"]),Pp=hs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),$r=hs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Mp=hs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Gl=hs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),c1=Vs(/{{[\w\W]*|^[\w\W]*}}/g),d1=Vs(/<%[\w\W]*|^[\w\W]*%>/g),u1=Vs(/\${[\w\W]*/g),p1=Vs(/^data-[\-\w.\u00B7-\uFFFF]+$/),f1=Vs(/^aria-[\-\w]+$/),Fp=Vs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),h1=Vs(/^(?:\w+script|data):/i),m1=Vs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),v1=Vs(/^html$/i),g1=Vs(/^[a-z][.\w]*(-[.\w]+)+$/i),sa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},b1=function(){return typeof window>"u"?null:window},y1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},$p=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function bv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:b1();const t=Se=>bv(Se);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==sa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=na(p,"cloneNode"),m=na(p,"remove"),v=na(p,"nextSibling"),S=na(p,"childNodes"),L=na(p,"parentNode"),b=na(p,"shadowRoot"),g=na(p,"attributes"),y=l&&l.prototype?na(l.prototype,"nodeType"):null,E=l&&l.prototype?na(l.prototype,"nodeName"):null;if(typeof i=="function"){const Se=s.createElement("template");Se.content&&Se.content.ownerDocument&&(s=Se.content.ownerDocument)}let _,A="",T,x=!1,N=0;const F=function(){if(N>0)throw un('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},k=function(D){F(),N++;try{return _.createHTML(D)}finally{N--}},P=function(D){F(),N++;try{return _.createScriptURL(D)}finally{N--}},B=function(){return x||(T=y1(u,n),x=!0),T},K=s,C=K.implementation,I=K.createNodeIterator,O=K.createDocumentFragment,$=K.getElementsByTagName,Q=a.importNode;let G=$p();t.isSupported=typeof vv=="function"&&typeof L=="function"&&C&&C.createHTMLDocument!==void 0;const X=c1,re=d1,Z=u1,ue=p1,Oe=f1,ae=h1,be=m1,q=g1;let de=Fp,he=null;const Le=qe({},[...Np,...Pr,...Mr,...Fr,...Dp]);let w=null;const M=qe({},[...Pp,...$r,...Mp,...Gl]);let z=Object.seal(Kn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ce=null,ie=null;const le=Object.seal(Kn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let me=!0,H=!0,ee=!1,Y=!0,fe=!1,pe=!0,ye=!1,Re=!1,ve=!1,He=!1,Pe=!1,ze=!1,Ye=!0,ot=!1;const nt="user-content-";let J=!0,_e=!1,Ce={},Ne=null;const se=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Ee=null;const De=qe({},["audio","video","img","source","image","track"]);let Qe=null;const Nt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),We="http://www.w3.org/1998/Math/MathML",Bt="http://www.w3.org/2000/svg",Ht="http://www.w3.org/1999/xhtml";let ms=Ht,Xs=!1,Ls=null;const Ua=qe({},[We,Bt,Ht],Dr);let fa=qe({},["mi","mo","mn","ms","mtext"]),Ns=qe({},["annotation-xml"]);const Ba=qe({},["title","style","font","a","script"]);let vs=null;const ha=["application/xhtml+xml","text/html"],Ds="text/html";let et=null,Ps=null;const Dt=s.createElement("form"),ne=function(D){return D instanceof RegExp||D instanceof Function},Te=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ps&&Ps===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),vs=ha.indexOf(D.PARSER_MEDIA_TYPE)===-1?Ds:D.PARSER_MEDIA_TYPE,et=vs==="application/xhtml+xml"?Dr:Ui,he=Ct(D,"ALLOWED_TAGS")&&cs(D.ALLOWED_TAGS)?qe({},D.ALLOWED_TAGS,et):Le,w=Ct(D,"ALLOWED_ATTR")&&cs(D.ALLOWED_ATTR)?qe({},D.ALLOWED_ATTR,et):M,Ls=Ct(D,"ALLOWED_NAMESPACES")&&cs(D.ALLOWED_NAMESPACES)?qe({},D.ALLOWED_NAMESPACES,Dr):Ua,Qe=Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)?qe(ss(Nt),D.ADD_URI_SAFE_ATTR,et):Nt,Ee=Ct(D,"ADD_DATA_URI_TAGS")&&cs(D.ADD_DATA_URI_TAGS)?qe(ss(De),D.ADD_DATA_URI_TAGS,et):De,Ne=Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)?qe({},D.FORBID_CONTENTS,et):se,ce=Ct(D,"FORBID_TAGS")&&cs(D.FORBID_TAGS)?qe({},D.FORBID_TAGS,et):ss({}),ie=Ct(D,"FORBID_ATTR")&&cs(D.FORBID_ATTR)?qe({},D.FORBID_ATTR,et):ss({}),Ce=Ct(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,me=D.ALLOW_ARIA_ATTR!==!1,H=D.ALLOW_DATA_ATTR!==!1,ee=D.ALLOW_UNKNOWN_PROTOCOLS||!1,Y=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,fe=D.SAFE_FOR_TEMPLATES||!1,pe=D.SAFE_FOR_XML!==!1,ye=D.WHOLE_DOCUMENT||!1,He=D.RETURN_DOM||!1,Pe=D.RETURN_DOM_FRAGMENT||!1,ze=D.RETURN_TRUSTED_TYPE||!1,ve=D.FORCE_BODY||!1,Ye=D.SANITIZE_DOM!==!1,ot=D.SANITIZE_NAMED_PROPS||!1,J=D.KEEP_CONTENT!==!1,_e=D.IN_PLACE||!1,de=l1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Fp,ms=typeof D.NAMESPACE=="string"?D.NAMESPACE:Ht,fa=Ct(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),Ns=Ct(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const oe=Ct(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Kn(null);if(z=Kn(null),Ct(oe,"tagNameCheck")&&ne(oe.tagNameCheck)&&(z.tagNameCheck=oe.tagNameCheck),Ct(oe,"attributeNameCheck")&&ne(oe.attributeNameCheck)&&(z.attributeNameCheck=oe.attributeNameCheck),Ct(oe,"allowCustomizedBuiltInElements")&&typeof oe.allowCustomizedBuiltInElements=="boolean"&&(z.allowCustomizedBuiltInElements=oe.allowCustomizedBuiltInElements),fe&&(H=!1),Pe&&(He=!0),Ce&&(he=qe({},Dp),w=Kn(null),Ce.html===!0&&(qe(he,Np),qe(w,Pp)),Ce.svg===!0&&(qe(he,Pr),qe(w,$r),qe(w,Gl)),Ce.svgFilters===!0&&(qe(he,Mr),qe(w,$r),qe(w,Gl)),Ce.mathMl===!0&&(qe(he,Fr),qe(w,Mp),qe(w,Gl))),le.tagCheck=null,le.attributeCheck=null,Ct(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?le.tagCheck=D.ADD_TAGS:cs(D.ADD_TAGS)&&(he===Le&&(he=ss(he)),qe(he,D.ADD_TAGS,et))),Ct(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?le.attributeCheck=D.ADD_ATTR:cs(D.ADD_ATTR)&&(w===M&&(w=ss(w)),qe(w,D.ADD_ATTR,et))),Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)&&qe(Qe,D.ADD_URI_SAFE_ATTR,et),Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)&&(Ne===se&&(Ne=ss(Ne)),qe(Ne,D.FORBID_CONTENTS,et)),Ct(D,"ADD_FORBID_CONTENTS")&&cs(D.ADD_FORBID_CONTENTS)&&(Ne===se&&(Ne=ss(Ne)),qe(Ne,D.ADD_FORBID_CONTENTS,et)),J&&(he["#text"]=!0),ye&&qe(he,["html","head","body"]),he.table&&(qe(he,["tbody"]),delete ce.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw un('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw un('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ge=_;_=D.TRUSTED_TYPES_POLICY;try{A=k("")}catch(Me){throw _=ge,Me}}else D.TRUSTED_TYPES_POLICY===null?(_=void 0,A=""):(_===void 0&&(_=B()),_&&typeof A=="string"&&(A=k("")));(G.uponSanitizeElement.length>0||G.uponSanitizeAttribute.length>0)&&he===Le&&(he=ss(he)),G.uponSanitizeAttribute.length>0&&w===M&&(w=ss(w)),hs&&hs(D),Ps=D},$e=qe({},[...Pr,...Mr,...o1]),tt=qe({},[...Fr,...r1]),wt=function(D){let oe=L(D);(!oe||!oe.tagName)&&(oe={namespaceURI:ms,tagName:"template"});const ge=Ui(D.tagName),Me=Ui(oe.tagName);return Ls[D.namespaceURI]?D.namespaceURI===Bt?oe.namespaceURI===Ht?ge==="svg":oe.namespaceURI===We?ge==="svg"&&(Me==="annotation-xml"||fa[Me]):!!$e[ge]:D.namespaceURI===We?oe.namespaceURI===Ht?ge==="math":oe.namespaceURI===Bt?ge==="math"&&Ns[Me]:!!tt[ge]:D.namespaceURI===Ht?oe.namespaceURI===Bt&&!Ns[Me]||oe.namespaceURI===We&&!fa[Me]?!1:!tt[ge]&&(Ba[ge]||!$e[ge]):!!(vs==="application/xhtml+xml"&&Ls[D.namespaceURI]):!1},pt=function(D){zn(t.removed,{element:D});try{L(D).removeChild(D)}catch{if(m(D),!L(D))throw un("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Ha=function(D){const oe=S?S(D):D.childNodes;if(oe){const Me=[];ya(oe,Ue=>{zn(Me,Ue)}),ya(Me,Ue=>{try{m(Ue)}catch{}})}const ge=g?g(D):null;if(ge)for(let Me=ge.length-1;Me>=0;--Me){const Ue=ge[Me],je=Ue&&Ue.name;if(typeof je=="string")try{D.removeAttribute(je)}catch{}}},qs=function(D,oe){try{zn(t.removed,{attribute:oe.getAttributeNode(D),from:oe})}catch{zn(t.removed,{attribute:null,from:oe})}if(oe.removeAttribute(D),D==="is")if(He||Pe)try{pt(oe)}catch{}else try{oe.setAttribute(D,"")}catch{}},wi=function(D){const oe=g?g(D):D.attributes;if(oe)for(let ge=oe.length-1;ge>=0;--ge){const Me=oe[ge],Ue=Me&&Me.name;if(!(typeof Ue!="string"||w[et(Ue)]))try{D.removeAttribute(Ue)}catch{}}},ki=function(D){const oe=[D];for(;oe.length>0;){const ge=oe.pop();(y?y(ge):ge.nodeType)===sa.element&&wi(ge);const Ue=S?S(ge):ge.childNodes;if(Ue)for(let je=Ue.length-1;je>=0;--je)oe.push(Ue[je])}},Nn=function(D){let oe=null,ge=null;if(ve)D="<remove></remove>"+D;else{const je=Rp(D,/^[\r\n\t ]+/);ge=je&&je[0]}vs==="application/xhtml+xml"&&ms===Ht&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const Me=_?k(D):D;if(ms===Ht)try{oe=new d().parseFromString(Me,vs)}catch{}if(!oe||!oe.documentElement){oe=C.createDocument(ms,"template",null);try{oe.documentElement.innerHTML=Xs?A:Me}catch{}}const Ue=oe.body||oe.documentElement;return D&&ge&&Ue.insertBefore(s.createTextNode(ge),Ue.childNodes[0]||null),ms===Ht?$.call(oe,ye?"html":"body")[0]:ye?oe.documentElement:Ue},Dn=function(D){return I.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ln=function(D){var oe,ge;D.normalize();const Me=I.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Ue=Me.nextNode();for(;Ue;){let Rt=Ue.data;ya([X,re,Z],ft=>{Rt=jn(Rt,ft," ")}),Ue.data=Rt,Ue=Me.nextNode()}const je=(oe=(ge=D.querySelectorAll)===null||ge===void 0?void 0:ge.call(D,"template"))!==null&&oe!==void 0?oe:[];ya(Array.from(je),Rt=>{Gs(Rt.content)&&ln(Rt.content)})},za=function(D){const oe=E?E(D):null;return typeof oe!="string"||et(oe)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==y(D)||D.childNodes!==S(D)},Gs=function(D){if(!y||typeof D!="object"||D===null)return!1;try{return y(D)===sa.documentFragment}catch{return!1}},ea=function(D){if(!y||typeof D!="object"||D===null)return!1;try{return typeof y(D)=="number"}catch{return!1}};function Ts(Se,D,oe){ya(Se,ge=>{ge.call(t,D,oe,Ps)})}const Pn=function(D){let oe=null;if(Ts(G.beforeSanitizeElements,D,null),za(D))return pt(D),!0;const ge=et(E?E(D):D.nodeName);if(Ts(G.uponSanitizeElement,D,{tagName:ge,allowedTags:he}),pe&&D.hasChildNodes()&&!ea(D.firstElementChild)&&Jt(/<[/\w!]/g,D.innerHTML)&&Jt(/<[/\w!]/g,D.textContent)||pe&&D.namespaceURI===Ht&&ge==="style"&&ea(D.firstElementChild)||D.nodeType===sa.progressingInstruction||pe&&D.nodeType===sa.comment&&Jt(/<[/\w]/g,D.data))return pt(D),!0;if(ce[ge]||!(le.tagCheck instanceof Function&&le.tagCheck(ge))&&!he[ge]){if(!ce[ge]&&Ie(ge)&&(z.tagNameCheck instanceof RegExp&&Jt(z.tagNameCheck,ge)||z.tagNameCheck instanceof Function&&z.tagNameCheck(ge)))return!1;if(J&&!Ne[ge]){const Ue=L(D),je=S(D);if(je&&Ue){const Rt=je.length;for(let ft=Rt-1;ft>=0;--ft){const bt=_e?je[ft]:h(je[ft],!0);Ue.insertBefore(bt,v(D))}}}return pt(D),!0}return(y?y(D):D.nodeType)===sa.element&&!wt(D)||(ge==="noscript"||ge==="noembed"||ge==="noframes")&&Jt(/<\/no(script|embed|frames)/i,D.innerHTML)?(pt(D),!0):(fe&&D.nodeType===sa.text&&(oe=D.textContent,ya([X,re,Z],Ue=>{oe=jn(oe,Ue," ")}),D.textContent!==oe&&(zn(t.removed,{element:D.cloneNode()}),D.textContent=oe)),Ts(G.afterSanitizeElements,D,null),!1)},W=function(D,oe,ge){if(ie[oe]||Ye&&(oe==="id"||oe==="name")&&(ge in s||ge in Dt))return!1;const Me=w[oe]||le.attributeCheck instanceof Function&&le.attributeCheck(oe,D);if(!(H&&!ie[oe]&&Jt(ue,oe))){if(!(me&&Jt(Oe,oe))){if(!Me||ie[oe]){if(!(Ie(D)&&(z.tagNameCheck instanceof RegExp&&Jt(z.tagNameCheck,D)||z.tagNameCheck instanceof Function&&z.tagNameCheck(D))&&(z.attributeNameCheck instanceof RegExp&&Jt(z.attributeNameCheck,oe)||z.attributeNameCheck instanceof Function&&z.attributeNameCheck(oe,D))||oe==="is"&&z.allowCustomizedBuiltInElements&&(z.tagNameCheck instanceof RegExp&&Jt(z.tagNameCheck,ge)||z.tagNameCheck instanceof Function&&z.tagNameCheck(ge))))return!1}else if(!Qe[oe]){if(!Jt(de,jn(ge,be,""))){if(!((oe==="src"||oe==="xlink:href"||oe==="href")&&D!=="script"&&Ip(ge,"data:")===0&&Ee[D])){if(!(ee&&!Jt(ae,jn(ge,be,"")))){if(ge)return!1}}}}}}return!0},xe=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ie=function(D){return!xe[Ui(D)]&&Jt(q,D)},gs=function(D){Ts(G.beforeSanitizeAttributes,D,null);const oe=D.attributes;if(!oe||za(D))return;const ge={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:w,forceKeepAttr:void 0};let Me=oe.length;for(;Me--;){const Ue=oe[Me],je=Ue.name,Rt=Ue.namespaceURI,ft=Ue.value,bt=et(je),Ms=ft;let kt=je==="value"?Ms:e1(Ms);if(ge.attrName=bt,ge.attrValue=kt,ge.keepAttr=!0,ge.forceKeepAttr=void 0,Ts(G.uponSanitizeAttribute,D,ge),kt=ge.attrValue,ot&&(bt==="id"||bt==="name")&&Ip(kt,nt)!==0&&(qs(je,D),kt=nt+kt),pe&&Jt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,kt)){qs(je,D);continue}if(bt==="attributename"&&Rp(kt,"href")){qs(je,D);continue}if(ge.forceKeepAttr)continue;if(!ge.keepAttr){qs(je,D);continue}if(!Y&&Jt(/\/>/i,kt)){qs(je,D);continue}fe&&ya([X,re,Z],Mn=>{kt=jn(kt,Mn," ")});const on=et(D.nodeName);if(!W(on,bt,kt)){qs(je,D);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Rt)switch(u.getAttributeType(on,bt)){case"TrustedHTML":{kt=k(kt);break}case"TrustedScriptURL":{kt=P(kt);break}}if(kt!==Ms)try{Rt?D.setAttributeNS(Rt,je,kt):D.setAttribute(je,kt),za(D)?pt(D):Ap(t.removed)}catch{qs(je,D)}}Ts(G.afterSanitizeAttributes,D,null)},ma=function(D){let oe=null;const ge=Dn(D);for(Ts(G.beforeSanitizeShadowDOM,D,null);oe=ge.nextNode();)if(Ts(G.uponSanitizeShadowNode,oe,null),Pn(oe),gs(oe),Gs(oe.content)&&ma(oe.content),(y?y(oe):oe.nodeType)===sa.element){const Ue=b?b(oe):oe.shadowRoot;Gs(Ue)&&(ja(Ue),ma(Ue))}Ts(G.afterSanitizeShadowDOM,D,null)},ja=function(D){const oe=[{node:D,shadow:null}];for(;oe.length>0;){const ge=oe.pop();if(ge.shadow){ma(ge.shadow);continue}const Me=ge.node,je=(y?y(Me):Me.nodeType)===sa.element,Rt=S?S(Me):Me.childNodes;if(Rt)for(let ft=Rt.length-1;ft>=0;--ft)oe.push({node:Rt[ft],shadow:null});if(je){const ft=E?E(Me):null;if(typeof ft=="string"&&et(ft)==="template"){const bt=Me.content;Gs(bt)&&oe.push({node:bt,shadow:null})}}if(je){const ft=b?b(Me):Me.shadowRoot;Gs(ft)&&oe.push({node:null,shadow:ft},{node:ft,shadow:null})}}};return t.sanitize=function(Se){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},oe=null,ge=null,Me=null,Ue=null;if(Xs=!Se,Xs&&(Se="<!-->"),typeof Se!="string"&&!ea(Se)&&(Se=i1(Se),typeof Se!="string"))throw un("dirty is not a string, aborting");if(!t.isSupported)return Se;Re||Te(D),t.removed=[];const je=_e&&typeof Se!="string"&&ea(Se);if(je){const bt=E?E(Se):Se.nodeName;if(typeof bt=="string"){const Ms=et(bt);if(!he[Ms]||ce[Ms])throw un("root node is forbidden and cannot be sanitized in-place")}if(za(Se))throw un("root node is clobbered and cannot be sanitized in-place");try{ja(Se)}catch(Ms){throw Ha(Se),Ms}}else if(ea(Se))oe=Nn("<!---->"),ge=oe.ownerDocument.importNode(Se,!0),ge.nodeType===sa.element&&ge.nodeName==="BODY"||ge.nodeName==="HTML"?oe=ge:oe.appendChild(ge),ja(ge);else{if(!He&&!fe&&!ye&&Se.indexOf("<")===-1)return _&&ze?k(Se):Se;if(oe=Nn(Se),!oe)return He?null:ze?A:""}oe&&ve&&pt(oe.firstChild);const Rt=Dn(je?Se:oe);try{for(;Me=Rt.nextNode();)Pn(Me),gs(Me),Gs(Me.content)&&ma(Me.content)}catch(bt){throw je&&Ha(Se),bt}if(je)return ya(t.removed,bt=>{bt.element&&ki(bt.element)}),fe&&ln(Se),Se;if(He){if(fe&&ln(oe),Pe)for(Ue=O.call(oe.ownerDocument);oe.firstChild;)Ue.appendChild(oe.firstChild);else Ue=oe;return(w.shadowroot||w.shadowrootmode)&&(Ue=Q.call(a,Ue,!0)),Ue}let ft=ye?oe.outerHTML:oe.innerHTML;return ye&&he["!doctype"]&&oe.ownerDocument&&oe.ownerDocument.doctype&&oe.ownerDocument.doctype.name&&Jt(v1,oe.ownerDocument.doctype.name)&&(ft="<!DOCTYPE "+oe.ownerDocument.doctype.name+`>
`+ft),fe&&ya([X,re,Z],bt=>{ft=jn(ft,bt," ")}),_&&ze?k(ft):ft},t.setConfig=function(){let Se=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Te(Se),Re=!0},t.clearConfig=function(){Ps=null,Re=!1,_=T,A=""},t.isValidAttribute=function(Se,D,oe){Ps||Te({});const ge=et(Se),Me=et(D);return W(ge,Me,oe)},t.addHook=function(Se,D){typeof D=="function"&&zn(G[Se],D)},t.removeHook=function(Se,D){if(D!==void 0){const oe=QS(G[Se],D);return oe===-1?void 0:XS(G[Se],oe,1)[0]}return Ap(G[Se])},t.removeHooks=function(Se){G[Se]=[]},t.removeAllHooks=function(){G=$p()},t}var Up=bv();function Ad(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var Ln=Ad();function yv(e){Ln=e}var Wi={exec:()=>null};function ut(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ps.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var ps={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},x1=/^(?:[ \t]*(?:\n|$))+/,_1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,w1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,El=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,k1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Rd=/(?:[*+-]|\d{1,9}[.)])/,xv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,_v=ut(xv).replace(/bull/g,Rd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),S1=ut(xv).replace(/bull/g,Rd).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Id=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,T1=/^[^\n]+/,Od=/(?!\s*\])(?:\\.|[^\[\]\\])+/,C1=ut(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Od).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),E1=ut(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Rd).getRegex(),rr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Ld=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,A1=ut("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Ld).replace("tag",rr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),wv=ut(Id).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),R1=ut(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",wv).getRegex(),Nd={blockquote:R1,code:_1,def:C1,fences:w1,heading:k1,hr:El,html:A1,lheading:_v,list:E1,newline:x1,paragraph:wv,table:Wi,text:T1},Bp=ut("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),I1={...Nd,lheading:S1,table:Bp,paragraph:ut(Id).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Bp).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex()},O1={...Nd,html:ut(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Ld).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Wi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:ut(Id).replace("hr",El).replace("heading",` *#{1,6} *[^
]`).replace("lheading",_v).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},L1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,N1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,kv=/^( {2,}|\\)\n(?!\s*$)/,D1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,cr=/[\p{P}\p{S}]/u,Dd=/[\s\p{P}\p{S}]/u,Sv=/[^\s\p{P}\p{S}]/u,P1=ut(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Dd).getRegex(),Tv=/(?!~)[\p{P}\p{S}]/u,M1=/(?!~)[\s\p{P}\p{S}]/u,F1=/(?:[^\s\p{P}\p{S}]|~)/u,$1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Cv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,U1=ut(Cv,"u").replace(/punct/g,cr).getRegex(),B1=ut(Cv,"u").replace(/punct/g,Tv).getRegex(),Ev="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",H1=ut(Ev,"gu").replace(/notPunctSpace/g,Sv).replace(/punctSpace/g,Dd).replace(/punct/g,cr).getRegex(),z1=ut(Ev,"gu").replace(/notPunctSpace/g,F1).replace(/punctSpace/g,M1).replace(/punct/g,Tv).getRegex(),j1=ut("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Sv).replace(/punctSpace/g,Dd).replace(/punct/g,cr).getRegex(),V1=ut(/\\(punct)/,"gu").replace(/punct/g,cr).getRegex(),q1=ut(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),G1=ut(Ld).replace("(?:-->|$)","-->").getRegex(),K1=ut("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",G1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Io=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,W1=ut(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Io).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Av=ut(/^!?\[(label)\]\[(ref)\]/).replace("label",Io).replace("ref",Od).getRegex(),Rv=ut(/^!?\[(ref)\](?:\[\])?/).replace("ref",Od).getRegex(),J1=ut("reflink|nolink(?!\\()","g").replace("reflink",Av).replace("nolink",Rv).getRegex(),Pd={_backpedal:Wi,anyPunctuation:V1,autolink:q1,blockSkip:$1,br:kv,code:N1,del:Wi,emStrongLDelim:U1,emStrongRDelimAst:H1,emStrongRDelimUnd:j1,escape:L1,link:W1,nolink:Rv,punctuation:P1,reflink:Av,reflinkSearch:J1,tag:K1,text:D1,url:Wi},Z1={...Pd,link:ut(/^!?\[(label)\]\((.*?)\)/).replace("label",Io).getRegex(),reflink:ut(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Io).getRegex()},kc={...Pd,emStrongRDelimAst:z1,emStrongLDelim:B1,url:ut(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Y1={...kc,br:ut(kv).replace("{2,}","*").getRegex(),text:ut(kc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Kl={normal:Nd,gfm:I1,pedantic:O1},Ni={normal:Pd,gfm:kc,breaks:Y1,pedantic:Z1},Q1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Hp=e=>Q1[e];function ia(e,t){if(t){if(ps.escapeTest.test(e))return e.replace(ps.escapeReplace,Hp)}else if(ps.escapeTestNoEncode.test(e))return e.replace(ps.escapeReplaceNoEncode,Hp);return e}function zp(e){try{e=encodeURI(e).replace(ps.percentDecode,"%")}catch{return null}return e}function jp(e,t){var i;const s=e.replace(ps.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(ps.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(ps.slashPipe,"|");return a}function Di(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function X1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function Vp(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function eT(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Oo=class{constructor(e){vt(this,"options");vt(this,"rules");vt(this,"lexer");this.options=e||Ln}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Di(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=eT(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Di(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Di(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=Di(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,L=>" ".repeat(3*L.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const L=this.rules.other.nextBulletRegex(m),b=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),y=this.rules.other.headingBeginRegex(m),E=this.rules.other.htmlBeginRegex(m);for(;e;){const _=e.split(`
`,1)[0];let A;if(p=_,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),A=p):A=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||y.test(p)||E.test(p)||L.test(p)||b.test(p))break;if(A.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+A.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||y.test(u)||b.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=_+`
`,e=e.substring(_.length+1),u=A.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,S;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(S=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!v,checked:S,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=jp(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(jp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Di(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=X1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),Vp(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Vp(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ea=class Sc{constructor(t){vt(this,"tokens");vt(this,"options");vt(this,"state");vt(this,"tokenizer");vt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||Ln,this.options.tokenizer=this.options.tokenizer||new Oo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ps,block:Kl.normal,inline:Ni.normal};this.options.pedantic?(s.block=Kl.pedantic,s.inline=Ni.pedantic):this.options.gfm&&(s.block=Kl.gfm,this.options.breaks?s.inline=Ni.breaks:s.inline=Ni.gfm),this.tokenizer.rules=s}static get rules(){return{block:Kl,inline:Ni}}static lex(t,s){return new Sc(s).lex(t)}static lexInline(t,s){return new Sc(s).inlineTokens(t)}lex(t){t=t.replace(ps.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(ps.tabCharGlobal,"    ").replace(ps.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Lo=class{constructor(e){vt(this,"options");vt(this,"parser");this.options=e||Ln}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(ps.notSpaceStart))==null?void 0:i[0],n=e.replace(ps.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${ia(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=zp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+ia(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=zp(e);if(n===null)return ia(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${ia(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:ia(e.text)}},Md=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Aa=class Tc{constructor(t){vt(this,"options");vt(this,"renderer");vt(this,"textRenderer");this.options=t||Ln,this.options.renderer=this.options.renderer||new Lo,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Md}static parse(t,s){return new Tc(s).parse(t)}static parseInline(t,s){return new Tc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},Ur,eo=(Ur=class{constructor(e){vt(this,"options");vt(this,"block");this.options=e||Ln}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ea.lex:Ea.lexInline}provideParser(){return this.block?Aa.parse:Aa.parseInline}},vt(Ur,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Ur),tT=class{constructor(...e){vt(this,"defaults",Ad());vt(this,"options",this.setOptions);vt(this,"parse",this.parseMarkdown(!0));vt(this,"parseInline",this.parseMarkdown(!1));vt(this,"Parser",Aa);vt(this,"Renderer",Lo);vt(this,"TextRenderer",Md);vt(this,"Lexer",Ea);vt(this,"Tokenizer",Oo);vt(this,"Hooks",eo);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Lo(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Oo(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new eo;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];eo.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ea.lex(e,t??this.defaults)}parser(e,t){return Aa.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Ea.lex:Ea.lexInline,r=i.hooks?i.hooks.provideParser():e?Aa.parse:Aa.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+ia(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Cn=new tT;function ct(e,t){return Cn.parse(e,t)}ct.options=ct.setOptions=function(e){return Cn.setOptions(e),ct.defaults=Cn.defaults,yv(ct.defaults),ct};ct.getDefaults=Ad;ct.defaults=Ln;ct.use=function(...e){return Cn.use(...e),ct.defaults=Cn.defaults,yv(ct.defaults),ct};ct.walkTokens=function(e,t){return Cn.walkTokens(e,t)};ct.parseInline=Cn.parseInline;ct.Parser=Aa;ct.parser=Aa.parse;ct.Renderer=Lo;ct.TextRenderer=Md;ct.Lexer=Ea;ct.lexer=Ea.lex;ct.Tokenizer=Oo;ct.Hooks=eo;ct.parse=ct;ct.options;ct.setOptions;ct.use;ct.walkTokens;ct.parseInline;Aa.parse;Ea.lex;const sT={breaks:!0,gfm:!0};function qp(e){if(!e)return"";try{if(typeof ct<"u"&&ct.parse){const t=ct.parse(e,sT);return typeof Up<"u"?Up.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function aT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const nT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function iT(e){return nT[e]||"wrench"}const lT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Gp(e){if(!e)return[];const t=e.match(lT);return t?[...new Set(t)]:[]}const oT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=V(()=>t.value.trim().length>0&&!s.value),p=f(at.state||"disconnected");let h=null;const m=V(()=>{const C=p.value;return C==="connected"?"Connected":C==="reconnecting"?"Reconnecting…":C==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],S=V(()=>{const C=Math.floor(l.value/4)%v.length,I=l.value;return I>3?`${v[C]} (${I}s)`:v[0]});function L(){Ot(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function b(){if(!i.value)return;const C=i.value;C.style.height="auto",C.style.height=Math.min(C.scrollHeight,120)+"px"}function g(C,I,O={}){const $={id:++c,role:C,content:I,timestamp:Date.now(),html:C==="bot"?qp(I):"",tools_used:O.tools_used||[],is_error:O.is_error||!1,images:C==="bot"?Gp(I):[],files:O.files||[],_showTools:!1};return e.value.push($),L(),C==="bot"&&Ot(()=>y()),$}function y(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(I=>{I.setAttribute("data-copy","true"),I.style.position="relative";const O=document.createElement("button");O.className="chat-code-copy",O.textContent="Copy",O.addEventListener("click",()=>{const $=I.querySelector("code"),Q=$?$.textContent:I.textContent;navigator.clipboard.writeText(Q).then(()=>{O.textContent="Copied!",setTimeout(()=>{O.textContent="Copy"},1500)}).catch(()=>{})}),I.appendChild(O)})}function E(C){if(C===0)return!0;const I=e.value[C-1],O=e.value[C],$=new Date(I.timestamp).toDateString(),Q=new Date(O.timestamp).toDateString();return $!==Q}function _(C){const I=new Date(C),O=new Date;if(I.toDateString()===O.toDateString())return"Today";const $=new Date(O);return $.setDate($.getDate()-1),I.toDateString()===$.toDateString()?"Yesterday":I.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A(C){t.value=C,Ot(()=>B())}function T(C){window.open(C,"_blank","noopener")}function x(C){C.target.style.display="none"}function N(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function F(){r&&(clearInterval(r),r=null),l.value=0}function k(C){s.value&&(s.value=!1,F(),C.type==="chat_response"?g("bot",C.content,{tools_used:C.tools_used||[],is_error:C.is_error||!1,files:C.files||[]}):C.type==="chat_error"&&g("bot",C.error||"Unknown error",{is_error:!0}),Ot(()=>{var I;return(I=i.value)==null?void 0:I.focus()}))}async function P(C){try{const I=await U.post("/api/chat",{content:C,channel_id:o.value});g("bot",I.response,{tools_used:I.tools_used||[],is_error:I.is_error||!1,files:I.files||[]})}catch(I){g("bot",I.message||"Failed to send message",{is_error:!0})}}async function B(){const C=t.value.trim();if(!C||s.value)return;g("user",C),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),at.connected&&at.sendChat(C,{channelId:o.value})||(await P(C),s.value=!1,F()),Ot(()=>{var O;return(O=i.value)==null?void 0:O.focus()})}async function K(){a.value="";try{if(!o.value){const I=await U.get("/api/auth/session");o.value=I.channel_id||I.user_id||"web-user"}const C=await U.get("/api/sessions/"+encodeURIComponent(o.value));if(C&&C.messages&&C.messages.length>0){for(const I of C.messages){const O=I.role==="user"?"user":"bot";let $=I.content||"";if(O==="user"){const G=$.match(/^\[.*?\]:\s*/);G&&($=$.slice(G[0].length))}if(!$.trim())continue;const Q={id:++c,role:O,content:$,timestamp:I.timestamp?I.timestamp*1e3:Date.now(),html:O==="bot"?qp($):"",tools_used:[],is_error:!1,images:O==="bot"?Gp($):[],files:[],_showTools:!1};e.value.push(Q)}Ot(()=>{L(),y()})}}catch(C){C&&C.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",we.error(a.value))}}return Ge(()=>{at.subscribe("chat",k),p.value=at.state||"disconnected",h=at.onState(C=>{p.value=C}),K(),Ot(()=>{var C;return(C=i.value)==null?void 0:C.focus()})}),mt(()=>{at.unsubscribe("chat",k),h&&(h(),h=null),F()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:S,suggestions:d,send:B,autoResize:b,formatTime:aT,formatDate:_,showDateSeparator:E,useSuggestion:A,openImage:T,onImageError:x,getToolIcon:iT,loadHistory:K}}},rT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=V(()=>e.value==="custom"),v=V(()=>[...i.value,...l.value]),S=V(()=>l.value.includes(e.value)),L=V(()=>{var T;return m.value?t.value||"Odin":((T=n.value[e.value])==null?void 0:T.name)||e.value}),b=V(()=>{var T;return m.value?s.value||"(empty — will use Odin default)":((T=n.value[e.value])==null?void 0:T.identity)||""}),g=V(()=>{var T;return m.value?a.value||"(empty — will use Odin default)":((T=n.value[e.value])==null?void 0:T.voice)||""});async function y(){d.value=!0;try{const T=await U.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",a.value=T.custom_voice||"",n.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function E(){o.value=!0,c.value=null,r.value=!1;try{await U.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(T){c.value=T.message}finally{o.value=!1}}async function _(){const T=u.value.trim();if(T){h.value=!0,c.value=null;try{await U.post("/api/personality/presets",{name:T,display_name:L.value,identity:b.value,voice:g.value}),p.value=!1,u.value="",await y(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function A(){if(await Kt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await U.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await y(),e.value="odin"}catch(x){c.value=x.message}}}return Ge(y),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:v,isCustom:m,isUserPreset:S,previewName:L,previewIdentity:b,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:E,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:_,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},Tt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Iv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:jS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:oT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:mk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Mk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:rT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:MS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Tt("/operations","live")},{path:"/agents",redirect:Tt("/operations","agents")},{path:"/loops",redirect:Tt("/operations","loops")},{path:"/processes",redirect:Tt("/operations","processes")},{path:"/schedules",redirect:Tt("/operations","schedules")},{path:"/audit",redirect:Tt("/history","audit")},{path:"/sessions",redirect:Tt("/history","sessions")},{path:"/traces",redirect:Tt("/history","traces")},{path:"/usage",redirect:Tt("/history","usage")},{path:"/tools",redirect:Tt("/capabilities","tools")},{path:"/skills",redirect:Tt("/capabilities","skills")},{path:"/mcp",redirect:Tt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Tt("/capabilities","knowledge")},{path:"/memory",redirect:Tt("/capabilities","memory")},{path:"/learned",redirect:Tt("/capabilities","learned")},{path:"/health",redirect:Tt("/system","health")},{path:"/resources",redirect:Tt("/system","resources")},{path:"/logs",redirect:Tt("/system","logs")},{path:"/config",redirect:Tt("/system","config")},{path:"/host-access",redirect:Tt("/system","host-access")},{path:"/hosts",redirect:Tt("/system","hosts")},{path:"/internals",redirect:Tt("/system","internals")}],Ji=Pw({history:fw(),routes:Iv});Ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const cT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{U.setPersist(n.value),await U.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},dT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),S=Iv.filter($=>$.meta),L=V(()=>["Workspace","Operate","Observe","Manage"].map($=>({name:$,routes:S.filter(Q=>Q.meta.section===$)})).filter($=>$.routes.length)),b=V(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.label)||"Odin"}),g=V(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.section)||"Management"}),y=V(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.description)||"Management console"});function E(){at.disconnect(),B&&(clearInterval(B),B=null)}U.onSessionExpired=()=>{t.value=!0,E(),U.setToken(""),e.value="login"};function _($){var Q;if(($.ctrlKey||$.metaKey)&&$.key.toLowerCase()==="k"){e.value==="ready"&&($.preventDefault(),Sp());return}if(a.value&&$.key==="Tab"){const G=[...((Q=n.value)==null?void 0:Q.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(G.length){const X=G[0],re=G[G.length-1];if($.shiftKey&&(document.activeElement===X||!n.value.contains(document.activeElement))){$.preventDefault(),re.focus();return}if(!$.shiftKey&&(document.activeElement===re||!n.value.contains(document.activeElement))){$.preventDefault(),X.focus();return}}}if($.key==="Escape"&&a.value){a.value=!1,$.preventDefault();return}if($.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes($.target.tagName)){$.preventDefault();const G=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');G&&G.focus()}}function A(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}Ge(async()=>{document.addEventListener("keydown",_),o=window.matchMedia("(max-width: 900px)"),A(),o.addEventListener("change",A);const $=await U.check();$.ok?(e.value="ready",I()):$.needsAuth?e.value="login":(e.value="ready",I())});function T(){t.value=!1,e.value="ready",I()}async function x(){E(),e.value="login",await U.logout()}function N(){s.value=!s.value}function F(){a.value=!a.value}$t(a,async $=>{var Q,G;if($)r=document.activeElement,await Ot(),(G=(Q=n.value)==null?void 0:Q.querySelector(".nav-item"))==null||G.focus();else if(r!=null&&r.isConnected){const X=r;r=null,requestAnimationFrame(()=>X.focus())}});const k=V(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P($,Q="info",G=3e3){p.value={text:$,level:Q},clearTimeout(h),h=setTimeout(()=>{p.value=null},G)}let B=null,K=!1,C=[];function I(){for(const $ of C)$();C=[at.onStatus($=>{c.value=$}),at.onLatencyChange($=>{u.value=$}),at.onState(($,Q)=>{d.value=$,$==="connected"?(K&&P("Connection restored","success"),K=!0):$==="reconnecting"&&Q.attempt===1&&P("Connection lost — reconnecting…","warn")})],at.connect(),O(),B&&clearInterval(B),B=setInterval(O,15e3)}async function O(){try{const $=await U.get("/api/status");m.value=$.status==="online"?"online":"starting";const Q=$.uptime_seconds||0,G=Math.floor(Q/3600),X=Math.floor(Q%3600/60);v.value=`${G}h ${X}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{B&&clearInterval(B);for(const $ of C)$();C=[],at.disconnect(),document.removeEventListener("keydown",_),o==null||o.removeEventListener("change",A)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:k,wsToast:p,botStatus:m,botUptime:v,navRoutes:S,navGroups:L,currentPage:b,currentSection:g,currentDescription:y,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:x,toggleSidebar:N,toggleMobileNavigation:F,openPalette:Sp}}},nn=yo(dT);nn.component("odin-icon",BS);nn.component("login-screen",cT);nn.component("toast-container",E_);nn.component("confirm-host",A_);nn.component("command-palette",US);nn.directive("modal-focus",zS);nn.use(Ji);nn.mount("#app");
