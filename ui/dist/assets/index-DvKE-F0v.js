var Iv=Object.defineProperty;var Ov=(e,t,s)=>t in e?Iv(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var vt=(e,t,s)=>Ov(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();class Lv{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const a=this._persist?localStorage:sessionStorage;a.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?a.setItem("odin_session_timeout",String(s)):a.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,a=null,{signal:n}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:n};a!==null&&(i.body=JSON.stringify(a));const l=await fetch(s,i);if(l.status===401)throw new Al("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new Md(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Al("Unauthorized");if(!s.ok){const a=await s.json().catch(()=>null);throw new Md((a==null?void 0:a.error)||`HTTP ${s.status}`,s.status,a)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),a=await s.json().catch(()=>null);if(!s.ok)throw new Al((a==null?void 0:a.error)||"Login failed");return this.setToken(a.session_id,a.timeout_seconds||0),a}async logout(){const t=this.post("/api/auth/logout",{});this.setToken("");try{await t}catch{}}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Al?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Al extends Error{constructor(t){super(t),this.name="AuthError"}}class Md extends Error{constructor(t,s,a){super(t),this.name="ApiError",this.status=s,this.data=a}}class Nv{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._reconnectTimer=null,this._lastPongTime=0,this._pingInterval=null,this._forcedRetireTimer=null,this._subscriptionAckTimer=null,this._pendingReconnect=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this._lifecycle={status:new Set,state:new Set,latency:new Set,reconnected:new Set},this._everConnected=!1,this._reconnectEpoch=0}onStatus(t){return this._addLifecycle("status",t)}onState(t){return this._addLifecycle("state",t)}onLatencyChange(t){return this._addLifecycle("latency",t)}onReconnected(t){return this._addLifecycle("reconnected",t)}_addLifecycle(t,s){return this._lifecycle[t].add(s),()=>{this._lifecycle[t].delete(s)}}_emitLifecycle(t,...s){for(const a of[...this._lifecycle[t]])try{a(...s)}catch{}}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}get reconnectEpoch(){return this._reconnectEpoch}_resetLatency(){this._latency=-1,this._emitLifecycle("latency",-1)}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._everConnected=!1,this._reconnectTimer&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this._emitLifecycle("state",t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(t){this._stopPing(),this._lastPongTime=Date.now(),this._pingInterval=setInterval(()=>{if(!(this._ws!==t||t.readyState!==WebSocket.OPEN)){if(this._lastPongTime&&Date.now()-this._lastPongTime>47e3){this._beginForcedRetirement(t,"pong timeout");return}try{t.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}}},15e3)}_beginForcedRetirement(t,s){if(!(this._ws!==t||this._forcedRetireTimer)){this._stopPing(),this._reconnectAttempt++,this._setState("reconnecting"),this._emitLifecycle("status",!1),this._forcedRetireTimer=setTimeout(()=>{this._forcedRetireTimer=null,this._retireSocket(t,!0,!0)},1e3);try{t.close(4e3,s)}catch{}}}_scheduleReconnect(t=!0){!this._shouldConnect||this._reconnectTimer||(t&&this._reconnectAttempt++,this._setState("reconnecting"),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this._open()},this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay))}_retireSocket(t,s=!1,a=!1){if(this._ws===t){if(this._forcedRetireTimer&&(clearTimeout(this._forcedRetireTimer),this._forcedRetireTimer=null),this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._pendingReconnect=null,this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const i of this._handlers.chat||[])i(n)}s||this._emitLifecycle("status",!1),this._shouldConnect?this._scheduleReconnect(!a):this._setState("disconnected")}}_beginReconnectBarrier(t,s){if(!s)return;const a=new Set(this._subscriptions);if(a.size===0){this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch);return}this._pendingReconnect={socket:t,channels:a},this._subscriptionAckTimer=setTimeout(()=>{var n;((n=this._pendingReconnect)==null?void 0:n.socket)===t&&this._beginForcedRetirement(t,"subscription acknowledgement timeout")},5e3)}_ackSubscription(t,s){const a=this._pendingReconnect;!a||a.socket!==t||!a.channels.has(s)||(a.channels.delete(s),!(a.channels.size>0)&&(this._pendingReconnect=null,this._subscriptionAckTimer&&(clearTimeout(this._subscriptionAckTimer),this._subscriptionAckTimer=null),this._reconnectEpoch+=1,this._emitLifecycle("reconnected",this._reconnectEpoch)))}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){var a;if(this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected)){const n=this._ws;((a=this._pendingReconnect)==null?void 0:a.socket)===n&&this._pendingReconnect.channels.add(t),n.send(JSON.stringify({subscribe:t}))}}unsubscribe(t,s){const a=this._handlers[t];if(a){const n=a.indexOf(s);if(n>=0&&a.splice(n,1),a.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected)){const i=this._ws;i.send(JSON.stringify({unsubscribe:t})),this._ackSubscription(i,t)}}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:a,username:n}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:a||void 0,username:n||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws||!this._shouldConnect)return;const s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`,a=this._api.token?["odin.bearer."+btoa(this._api.token).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")]:void 0,n=a?new WebSocket(s,a):new WebSocket(s);this._ws=n;const i=()=>this._ws===n;n.onopen=()=>{if(!i())return;const l=this._everConnected;this._everConnected=!0,this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const o of this._subscriptions)n.send(JSON.stringify({subscribe:o}));this._startPing(n),this._setState("connected"),this._emitLifecycle("status",!0),this._beginReconnectBarrier(n,l)},n.onmessage=l=>{if(!i())return;let o;try{o=JSON.parse(l.data)}catch{return}const r=o.type;if(r==="pong"){o.ts&&(this._latency=Date.now()-o.ts,this._lastPongTime=Date.now(),this._emitLifecycle("latency",this._latency));return}if(r==="subscribed"){this._ackSubscription(n,o.channel);return}if(r==="log")for(const c of this._handlers.logs||[])c(o);else if(r==="event")for(const c of this._handlers.events||[])c(o);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const c of this._handlers.chat||[])c(o)}},n.onclose=()=>{const l=!!this._forcedRetireTimer;this._retireSocket(n,l,l)},n.onerror=()=>{}}}const U=new Lv,st=new Nv(U);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function Ls(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ze={},Yn=[],Xt=()=>{},Wn=()=>!1,Cn=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),No=e=>e.startsWith("onUpdate:"),Je=Object.assign,Tc=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Dv=Object.prototype.hasOwnProperty,rt=(e,t)=>Dv.call(e,t),Re=Array.isArray,Qn=e=>yi(e)==="[object Map]",En=e=>yi(e)==="[object Set]",Fd=e=>yi(e)==="[object Date]",Pv=e=>yi(e)==="[object RegExp]",Me=e=>typeof e=="function",He=e=>typeof e=="string",os=e=>typeof e=="symbol",ot=e=>e!==null&&typeof e=="object",Cc=e=>(ot(e)||Me(e))&&Me(e.then)&&Me(e.catch),Gp=Object.prototype.toString,yi=e=>Gp.call(e),Mv=e=>yi(e).slice(8,-1),Do=e=>yi(e)==="[object Object]",Po=e=>He(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,Oa=Ls(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Fv=Ls("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Mo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},$v=/-\w/g,ht=Mo(e=>e.replace($v,t=>t.slice(1).toUpperCase())),Uv=/\B([A-Z])/g,ks=Mo(e=>e.replace(Uv,"-$1").toLowerCase()),An=Mo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Xn=Mo(e=>e?`on${An(e)}`:""),qt=(e,t)=>!Object.is(e,t),ei=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},Kp=(e,t,s,a=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:a,value:s})},Fo=e=>{const t=parseFloat(e);return isNaN(t)?e:t},to=e=>{const t=He(e)?Number(e):NaN;return isNaN(t)?e:t};let $d;const $o=()=>$d||($d=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Bv(e,t){return e+JSON.stringify(t,(s,a)=>typeof a=="function"?a.toString():a)}const Hv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",zv=Ls(Hv);function gl(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++){const a=e[s],n=He(a)?Wp(a):gl(a);if(n)for(const i in n)t[i]=n[i]}return t}else if(He(e)||ot(e))return e}const jv=/;(?![^(]*\))/g,Vv=/:([^]+)/,qv=/\/\*[^]*?\*\//g;function Wp(e){const t={};return e.replace(qv,"").split(jv).forEach(s=>{if(s){const a=s.split(Vv);a.length>1&&(t[a[0].trim()]=a[1].trim())}}),t}function bl(e){let t="";if(He(e))t=e;else if(Re(e))for(let s=0;s<e.length;s++){const a=bl(e[s]);a&&(t+=a+" ")}else if(ot(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Gv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!He(t)&&(e.class=bl(t)),s&&(e.style=gl(s)),e}const Kv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",Wv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",Jv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",Zv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",Yv=Ls(Kv),Qv=Ls(Wv),Xv=Ls(Jv),eg=Ls(Zv),tg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",sg=Ls(tg);function Jp(e){return!!e||e===""}function ag(e,t){if(e.length!==t.length)return!1;let s=!0;for(let a=0;s&&a<e.length;a++)s=Pa(e[a],t[a]);return s}function Pa(e,t){if(e===t)return!0;let s=Fd(e),a=Fd(t);if(s||a)return s&&a?e.getTime()===t.getTime():!1;if(s=os(e),a=os(t),s||a)return e===t;if(s=Re(e),a=Re(t),s||a)return s&&a?ag(e,t):!1;if(s=ot(e),a=ot(t),s||a){if(!s||!a)return!1;const n=Object.keys(e).length,i=Object.keys(t).length;if(n!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Pa(e[l],t[l]))return!1}}return String(e)===String(t)}function Uo(e,t){return e.findIndex(s=>Pa(s,t))}const Zp=e=>!!(e&&e.__v_isRef===!0),Yp=e=>He(e)?e:e==null?"":Re(e)||ot(e)&&(e.toString===Gp||!Me(e.toString))?Zp(e)?Yp(e.value):JSON.stringify(e,Qp,2):String(e),Qp=(e,t)=>Zp(t)?Qp(e,t.value):Qn(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[a,n],i)=>(s[dr(a,i)+" =>"]=n,s),{})}:En(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>dr(s))}:os(t)?dr(t):ot(t)&&!Re(t)&&!Do(t)?String(t):t,dr=(e,t="")=>{var s;return os(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function ng(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let zt;class Ec{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&zt&&(zt.active?(this.parent=zt,this.index=(zt.scopes||(zt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=zt;try{return zt=this,t()}finally{zt=s}}}on(){++this._on===1&&(this.prevScope=zt,zt=this)}off(){if(this._on>0&&--this._on===0){if(zt===this)zt=this.prevScope;else{let t=zt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,a;for(s=0,a=this.effects.length;s<a;s++)this.effects[s].stop();for(this.effects.length=0,s=0,a=this.cleanups.length;s<a;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,a=this.scopes.length;s<a;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const n=this.parent.scopes.pop();n&&n!==this&&(this.parent.scopes[this.index]=n,n.index=this.index)}this.parent=void 0}}}function ig(e){return new Ec(e)}function Xp(){return zt}function lg(e,t=!1){zt&&zt.cleanups.push(e)}let gt;const ur=new WeakSet;class Zi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,zt&&(zt.active?zt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,ur.has(this)&&(ur.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||tf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,Ud(this),sf(this);const t=gt,s=Zs;gt=this,Zs=!0;try{return this.fn()}finally{af(this),gt=t,Zs=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Ic(t);this.deps=this.depsTail=void 0,Ud(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?ur.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Ur(this)&&this.run()}get dirty(){return Ur(this)}}let ef=0,Bi,Hi;function tf(e,t=!1){if(e.flags|=8,t){e.next=Hi,Hi=e;return}e.next=Bi,Bi=e}function Ac(){ef++}function Rc(){if(--ef>0)return;if(Hi){let t=Hi;for(Hi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Bi;){let t=Bi;for(Bi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(a){e||(e=a)}t=s}}if(e)throw e}function sf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function af(e){let t,s=e.depsTail,a=s;for(;a;){const n=a.prevDep;a.version===-1?(a===s&&(s=n),Ic(a),og(a)):t=a,a.dep.activeLink=a.prevActiveLink,a.prevActiveLink=void 0,a=n}e.deps=t,e.depsTail=s}function Ur(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(nf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function nf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Yi)||(e.globalVersion=Yi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Ur(e))))return;e.flags|=2;const t=e.dep,s=gt,a=Zs;gt=e,Zs=!0;try{sf(e);const n=e.fn(e._value);(t.version===0||qt(n,e._value))&&(e.flags|=128,e._value=n,t.version++)}catch(n){throw t.version++,n}finally{gt=s,Zs=a,af(e),e.flags&=-3}}function Ic(e,t=!1){const{dep:s,prevSub:a,nextSub:n}=e;if(a&&(a.nextSub=n,e.prevSub=void 0),n&&(n.prevSub=a,e.nextSub=void 0),s.subs===e&&(s.subs=a,!a&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Ic(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function og(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function rg(e,t){e.effect instanceof Zi&&(e=e.effect.fn);const s=new Zi(e);t&&Je(s,t);try{s.run()}catch(n){throw s.stop(),n}const a=s.run.bind(s);return a.effect=s,a}function cg(e){e.effect.stop()}let Zs=!0;const lf=[];function Ma(){lf.push(Zs),Zs=!1}function Fa(){const e=lf.pop();Zs=e===void 0?!0:e}function Ud(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=gt;gt=void 0;try{t()}finally{gt=s}}}let Yi=0;class dg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class Bo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!gt||!Zs||gt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==gt)s=this.activeLink=new dg(gt,this),gt.deps?(s.prevDep=gt.depsTail,gt.depsTail.nextDep=s,gt.depsTail=s):gt.deps=gt.depsTail=s,of(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const a=s.nextDep;a.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=a),s.prevDep=gt.depsTail,s.nextDep=void 0,gt.depsTail.nextDep=s,gt.depsTail=s,gt.deps===s&&(gt.deps=a)}return s}trigger(t){this.version++,Yi++,this.notify(t)}notify(t){Ac();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Rc()}}}function of(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let a=t.deps;a;a=a.nextDep)of(a)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const so=new WeakMap,gn=Symbol(""),Br=Symbol(""),Qi=Symbol("");function ns(e,t,s){if(Zs&&gt){let a=so.get(e);a||so.set(e,a=new Map);let n=a.get(s);n||(a.set(s,n=new Bo),n.map=a,n.key=s),n.track()}}function Ca(e,t,s,a,n,i){const l=so.get(e);if(!l){Yi++;return}const o=r=>{r&&r.trigger()};if(Ac(),t==="clear")l.forEach(o);else{const r=Re(e),c=r&&Po(s);if(r&&s==="length"){const d=Number(a);l.forEach((u,p)=>{(p==="length"||p===Qi||!os(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get(Qi)),t){case"add":r?c&&o(l.get("length")):(o(l.get(gn)),Qn(e)&&o(l.get(Br)));break;case"delete":r||(o(l.get(gn)),Qn(e)&&o(l.get(Br)));break;case"set":Qn(e)&&o(l.get(gn));break}}Rc()}function ug(e,t){const s=so.get(e);return s&&s.get(t)}function $n(e){const t=tt(e);return t===e?t:(ns(t,"iterate",Qi),Ts(e)?t:t.map(Qs))}function Ho(e){return ns(e=tt(e),"iterate",Qi),e}function ca(e,t){return ua(e)?oi(La(e)?Qs(t):t):Qs(t)}const pg={__proto__:null,[Symbol.iterator](){return pr(this,Symbol.iterator,e=>ca(this,e))},concat(...e){return $n(this).concat(...e.map(t=>Re(t)?$n(t):t))},entries(){return pr(this,"entries",e=>(e[1]=ca(this,e[1]),e))},every(e,t){return ba(this,"every",e,t,void 0,arguments)},filter(e,t){return ba(this,"filter",e,t,s=>s.map(a=>ca(this,a)),arguments)},find(e,t){return ba(this,"find",e,t,s=>ca(this,s),arguments)},findIndex(e,t){return ba(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return ba(this,"findLast",e,t,s=>ca(this,s),arguments)},findLastIndex(e,t){return ba(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return ba(this,"forEach",e,t,void 0,arguments)},includes(...e){return fr(this,"includes",e)},indexOf(...e){return fr(this,"indexOf",e)},join(e){return $n(this).join(e)},lastIndexOf(...e){return fr(this,"lastIndexOf",e)},map(e,t){return ba(this,"map",e,t,void 0,arguments)},pop(){return Si(this,"pop")},push(...e){return Si(this,"push",e)},reduce(e,...t){return Bd(this,"reduce",e,t)},reduceRight(e,...t){return Bd(this,"reduceRight",e,t)},shift(){return Si(this,"shift")},some(e,t){return ba(this,"some",e,t,void 0,arguments)},splice(...e){return Si(this,"splice",e)},toReversed(){return $n(this).toReversed()},toSorted(e){return $n(this).toSorted(e)},toSpliced(...e){return $n(this).toSpliced(...e)},unshift(...e){return Si(this,"unshift",e)},values(){return pr(this,"values",e=>ca(this,e))}};function pr(e,t,s){const a=Ho(e),n=a[t]();return a!==e&&!Ts(e)&&(n._next=n.next,n.next=()=>{const i=n._next();return i.done||(i.value=s(i.value)),i}),n}const fg=Array.prototype;function ba(e,t,s,a,n,i){const l=Ho(e),o=l!==e&&!Ts(e),r=l[t];if(r!==fg[t]){const u=r.apply(e,i);return o?Qs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,ca(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,a);return o&&n?n(d):d}function Bd(e,t,s,a){const n=Ho(e),i=n!==e&&!Ts(e);let l=s,o=!1;n!==e&&(i?(o=a.length===0,l=function(c,d,u){return o&&(o=!1,c=ca(e,c)),s.call(this,c,ca(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=n[t](l,...a);return o?ca(e,r):r}function fr(e,t,s){const a=tt(e);ns(a,"iterate",Qi);const n=a[t](...s);return(n===-1||n===!1)&&yl(s[0])?(s[0]=tt(s[0]),a[t](...s)):n}function Si(e,t,s=[]){Ma(),Ac();const a=tt(e)[t].apply(e,s);return Rc(),Fa(),a}const hg=Ls("__proto__,__v_isRef,__isVue"),rf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(os));function mg(e){os(e)||(e=String(e));const t=tt(this);return ns(t,"has",e),t.hasOwnProperty(e)}class cf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,a){if(s==="__v_skip")return t.__v_skip;const n=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!n;if(s==="__v_isReadonly")return n;if(s==="__v_isShallow")return i;if(s==="__v_raw")return a===(n?i?mf:hf:i?ff:pf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(a)?t:void 0;const l=Re(t);if(!n){let r;if(l&&(r=pg[s]))return r;if(s==="hasOwnProperty")return mg}const o=Reflect.get(t,s,$t(t)?t:a);if((os(s)?rf.has(s):hg(s))||(n||ns(t,"get",s),i))return o;if($t(o)){const r=l&&Po(s)?o:o.value;return n&&ot(r)?ao(r):r}return ot(o)?n?ao(o):sn(o):o}}class df extends cf{constructor(t=!1){super(!1,t)}set(t,s,a,n){let i=t[s];const l=Re(t)&&Po(s);if(!this._isShallow){const c=ua(i);if(!Ts(a)&&!ua(a)&&(i=tt(i),a=tt(a)),!l&&$t(i)&&!$t(a))return c||(i.value=a),!0}const o=l?Number(s)<t.length:rt(t,s),r=Reflect.set(t,s,a,$t(t)?t:n);return t===tt(n)&&(o?qt(a,i)&&Ca(t,"set",s,a):Ca(t,"add",s,a)),r}deleteProperty(t,s){const a=rt(t,s);t[s];const n=Reflect.deleteProperty(t,s);return n&&a&&Ca(t,"delete",s,void 0),n}has(t,s){const a=Reflect.has(t,s);return(!os(s)||!rf.has(s))&&ns(t,"has",s),a}ownKeys(t){return ns(t,"iterate",Re(t)?"length":gn),Reflect.ownKeys(t)}}class uf extends cf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const vg=new df,gg=new uf,bg=new df(!0),yg=new uf(!0),Hr=e=>e,Rl=e=>Reflect.getPrototypeOf(e);function xg(e,t,s){return function(...a){const n=this.__v_raw,i=tt(n),l=Qn(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=n[e](...a),d=s?Hr:t?oi:Qs;return!t&&ns(i,"iterate",r?Br:gn),Je(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Il(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function _g(e,t){const s={get(n){const i=this.__v_raw,l=tt(i),o=tt(n);e||(qt(n,o)&&ns(l,"get",n),ns(l,"get",o));const{has:r}=Rl(l),c=t?Hr:e?oi:Qs;if(r.call(l,n))return c(i.get(n));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(n)},get size(){const n=this.__v_raw;return!e&&ns(tt(n),"iterate",gn),n.size},has(n){const i=this.__v_raw,l=tt(i),o=tt(n);return e||(qt(n,o)&&ns(l,"has",n),ns(l,"has",o)),n===o?i.has(n):i.has(n)||i.has(o)},forEach(n,i){const l=this,o=l.__v_raw,r=tt(o),c=t?Hr:e?oi:Qs;return!e&&ns(r,"iterate",gn),o.forEach((d,u)=>n.call(i,c(d),c(u),l))}};return Je(s,e?{add:Il("add"),set:Il("set"),delete:Il("delete"),clear:Il("clear")}:{add(n){const i=tt(this),l=Rl(i),o=tt(n),r=!t&&!Ts(n)&&!ua(n)?o:n;return l.has.call(i,r)||qt(n,r)&&l.has.call(i,n)||qt(o,r)&&l.has.call(i,o)||(i.add(r),Ca(i,"add",r,r)),this},set(n,i){!t&&!Ts(i)&&!ua(i)&&(i=tt(i));const l=tt(this),{has:o,get:r}=Rl(l);let c=o.call(l,n);c||(n=tt(n),c=o.call(l,n));const d=r.call(l,n);return l.set(n,i),c?qt(i,d)&&Ca(l,"set",n,i):Ca(l,"add",n,i),this},delete(n){const i=tt(this),{has:l,get:o}=Rl(i);let r=l.call(i,n);r||(n=tt(n),r=l.call(i,n)),o&&o.call(i,n);const c=i.delete(n);return r&&Ca(i,"delete",n,void 0),c},clear(){const n=tt(this),i=n.size!==0,l=n.clear();return i&&Ca(n,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(n=>{s[n]=xg(n,e,t)}),s}function zo(e,t){const s=_g(e,t);return(a,n,i)=>n==="__v_isReactive"?!e:n==="__v_isReadonly"?e:n==="__v_raw"?a:Reflect.get(rt(s,n)&&n in a?s:a,n,i)}const wg={get:zo(!1,!1)},kg={get:zo(!1,!0)},Sg={get:zo(!0,!1)},Tg={get:zo(!0,!0)},pf=new WeakMap,ff=new WeakMap,hf=new WeakMap,mf=new WeakMap;function Cg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function sn(e){return ua(e)?e:jo(e,!1,vg,wg,pf)}function Oc(e){return jo(e,!1,bg,kg,ff)}function ao(e){return jo(e,!0,gg,Sg,hf)}function Eg(e){return jo(e,!0,yg,Tg,mf)}function jo(e,t,s,a,n){if(!ot(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=n.get(e);if(i)return i;const l=Cg(Mv(e));if(l===0)return e;const o=new Proxy(e,l===2?a:s);return n.set(e,o),o}function La(e){return ua(e)?La(e.__v_raw):!!(e&&e.__v_isReactive)}function ua(e){return!!(e&&e.__v_isReadonly)}function Ts(e){return!!(e&&e.__v_isShallow)}function yl(e){return e?!!e.__v_raw:!1}function tt(e){const t=e&&e.__v_raw;return t?tt(t):e}function vf(e){return!rt(e,"__v_skip")&&Object.isExtensible(e)&&Kp(e,"__v_skip",!0),e}const Qs=e=>ot(e)?sn(e):e,oi=e=>ot(e)?ao(e):e;function $t(e){return e?e.__v_isRef===!0:!1}function f(e){return gf(e,!1)}function Lc(e){return gf(e,!0)}function gf(e,t){return $t(e)?e:new Ag(e,t)}class Ag{constructor(t,s){this.dep=new Bo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:tt(t),this._value=s?t:Qs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,a=this.__v_isShallow||Ts(t)||ua(t);t=a?t:tt(t),qt(t,s)&&(this._rawValue=t,this._value=a?t:Qs(t),this.dep.trigger())}}function Rg(e){e.dep&&e.dep.trigger()}function da(e){return $t(e)?e.value:e}function Ig(e){return Me(e)?e():da(e)}const Og={get:(e,t,s)=>t==="__v_raw"?e:da(Reflect.get(e,t,s)),set:(e,t,s,a)=>{const n=e[t];return $t(n)&&!$t(s)?(n.value=s,!0):Reflect.set(e,t,s,a)}};function Nc(e){return La(e)?e:new Proxy(e,Og)}class Lg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new Bo,{get:a,set:n}=t(s.track.bind(s),s.trigger.bind(s));this._get=a,this._set=n}get value(){return this._value=this._get()}set value(t){this._set(t)}}function bf(e){return new Lg(e)}function Ng(e){const t=Re(e)?new Array(e.length):{};for(const s in e)t[s]=yf(e,s);return t}class Dg{constructor(t,s,a){this._object=t,this._defaultValue=a,this.__v_isRef=!0,this._value=void 0,this._key=os(s)?s:String(s),this._raw=tt(t);let n=!0,i=t;if(!Re(t)||os(this._key)||!Po(this._key))do n=!yl(i)||Ts(i);while(n&&(i=i.__v_raw));this._shallow=n}get value(){let t=this._object[this._key];return this._shallow&&(t=da(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&$t(this._raw[this._key])){const s=this._object[this._key];if($t(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return ug(this._raw,this._key)}}class Pg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Mg(e,t,s){return $t(e)?e:Me(e)?new Pg(e):ot(e)&&arguments.length>1?yf(e,t,s):f(e)}function yf(e,t,s){return new Dg(e,t,s)}class Fg{constructor(t,s,a){this.fn=t,this.setter=s,this._value=void 0,this.dep=new Bo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Yi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=a}notify(){if(this.flags|=16,!(this.flags&8)&&gt!==this)return tf(this,!0),!0}get value(){const t=this.dep.track();return nf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function $g(e,t,s=!1){let a,n;return Me(e)?a=e:(a=e.get,n=e.set),new Fg(a,n,s)}const Ug={GET:"get",HAS:"has",ITERATE:"iterate"},Bg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Ol={},no=new WeakMap;let Wa;function Hg(){return Wa}function xf(e,t=!1,s=Wa){if(s){let a=no.get(s);a||no.set(s,a=[]),a.push(e)}}function zg(e,t,s=Ze){const{immediate:a,deep:n,once:i,scheduler:l,augmentJob:o,call:r}=s,c=b=>n?b:Ts(b)||n===!1||n===0?Ea(b,1):Ea(b);let d,u,p,h,m=!1,v=!1;if($t(e)?(u=()=>e.value,m=Ts(e)):La(e)?(u=()=>c(e),m=!0):Re(e)?(v=!0,m=e.some(b=>La(b)||Ts(b)),u=()=>e.map(b=>{if($t(b))return b.value;if(La(b))return c(b);if(Me(b))return r?r(b,2):b()})):Me(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Ma();try{p()}finally{Fa()}}const b=Wa;Wa=d;try{return r?r(e,3,[h]):e(h)}finally{Wa=b}}:u=Xt,t&&n){const b=u,_=n===!0?1/0:n;u=()=>Ea(b(),_)}const w=Xp(),A=()=>{d.stop(),w&&w.active&&Tc(w.effects,d)};if(i&&t){const b=t;t=(..._)=>{const k=b(..._);return A(),k}}let y=v?new Array(e.length).fill(Ol):Ol;const g=b=>{if(!(!(d.flags&1)||!d.dirty&&!b))if(t){const _=d.run();if(b||n||m||(v?_.some((k,I)=>qt(k,y[I])):qt(_,y))){p&&p();const k=Wa;Wa=d;try{const I=[_,y===Ol?void 0:v&&y[0]===Ol?[]:y,h];y=_,r?r(t,3,I):t(...I)}finally{Wa=k}}}else d.run()};return o&&o(g),d=new Zi(u),d.scheduler=l?()=>l(g,!1):g,h=b=>xf(b,!1,d),p=d.onStop=()=>{const b=no.get(d);if(b){if(r)r(b,4);else for(const _ of b)_();no.delete(d)}},t?a?g(!0):y=d.run():l?l(g.bind(null,!0),!0):d.run(),A.pause=d.pause.bind(d),A.resume=d.resume.bind(d),A.stop=A,A}function Ea(e,t=1/0,s){if(t<=0||!ot(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,$t(e))Ea(e.value,t,s);else if(Re(e))for(let a=0;a<e.length;a++)Ea(e[a],t,s);else if(En(e)||Qn(e))e.forEach(a=>{Ea(a,t,s)});else if(Do(e)){for(const a in e)Ea(e[a],t,s);for(const a of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,a)&&Ea(e[a],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const _f=[];function jg(e){_f.push(e)}function Vg(){_f.pop()}function qg(e,t){}const Gg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},Kg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function xi(e,t,s,a){try{return a?e(...a):e()}catch(n){Rn(n,t,s)}}function Os(e,t,s,a){if(Me(e)){const n=xi(e,t,s,a);return n&&Cc(n)&&n.catch(i=>{Rn(i,t,s)}),n}if(Re(e)){const n=[];for(let i=0;i<e.length;i++)n.push(Os(e[i],t,s,a));return n}}function Rn(e,t,s,a=!0){const n=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ze;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Ma(),xi(i,null,10,[e,r,c]),Fa();return}}Wg(e,s,n,a,l)}function Wg(e,t,s,a=!0,n=!1){if(n)throw e;console.error(e)}const us=[];let oa=-1;const ti=[];let Ja=null,Vn=0;const wf=Promise.resolve();let io=null;function Ot(e){const t=io||wf;return e?t.then(this?e.bind(this):e):t}function Jg(e){let t=oa+1,s=us.length;for(;t<s;){const a=t+s>>>1,n=us[a],i=el(n);i<e||i===e&&n.flags&2?t=a+1:s=a}return t}function Dc(e){if(!(e.flags&1)){const t=el(e),s=us[us.length-1];!s||!(e.flags&2)&&t>=el(s)?us.push(e):us.splice(Jg(t),0,e),e.flags|=1,kf()}}function kf(){io||(io=wf.then(Sf))}function Xi(e){Re(e)?ti.push(...e):Ja&&e.id===-1?Ja.splice(Vn+1,0,e):e.flags&1||(ti.push(e),e.flags|=1),kf()}function Hd(e,t,s=oa+1){for(;s<us.length;s++){const a=us[s];if(a&&a.flags&2){if(e&&a.id!==e.uid)continue;us.splice(s,1),s--,a.flags&4&&(a.flags&=-2),a(),a.flags&4||(a.flags&=-2)}}}function lo(e){if(ti.length){const t=[...new Set(ti)].sort((s,a)=>el(s)-el(a));if(ti.length=0,Ja){Ja.push(...t);return}for(Ja=t,Vn=0;Vn<Ja.length;Vn++){const s=Ja[Vn];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Ja=null,Vn=0}}const el=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Sf(e){try{for(oa=0;oa<us.length;oa++){const t=us[oa];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),xi(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;oa<us.length;oa++){const t=us[oa];t&&(t.flags&=-2)}oa=-1,us.length=0,lo(),io=null,(us.length||ti.length)&&Sf()}}let qn,Ll=[];function Tf(e,t){var s,a;qn=e,qn?(qn.enabled=!0,Ll.forEach(({event:n,args:i})=>qn.emit(n,...i)),Ll=[]):typeof window<"u"&&window.HTMLElement&&!((a=(s=window.navigator)==null?void 0:s.userAgent)!=null&&a.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Tf(i,t)}),setTimeout(()=>{qn||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Ll=[])},3e3)):Ll=[]}let Qt=null,Vo=null;function tl(e){const t=Qt;return Qt=e,Vo=e&&e.type.__scopeId||null,t}function Zg(e){Vo=e}function Yg(){Vo=null}const Qg=e=>Pc;function Pc(e,t=Qt,s){if(!t||e._n)return e;const a=(...n)=>{a._d&&il(-1);const i=tl(t);let l;try{l=e(...n)}finally{tl(i),a._d&&il(1)}return l};return a._n=!0,a._c=!0,a._d=!0,a}function Xg(e,t){if(Qt===null)return e;const s=kl(Qt),a=e.dirs||(e.dirs=[]);for(let n=0;n<t.length;n++){let[i,l,o,r=Ze]=t[n];i&&(Me(i)&&(i={mounted:i,updated:i}),i.deep&&Ea(l),a.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function ra(e,t,s,a){const n=e.dirs,i=t&&t.dirs;for(let l=0;l<n.length;l++){const o=n[l];i&&(o.oldValue=i[l].value);let r=o.dir[a];r&&(Ma(),Os(r,s,8,[e.el,o,e,t]),Fa())}}function zi(e,t){if(Yt){let s=Yt.provides;const a=Yt.parent&&Yt.parent.provides;a===s&&(s=Yt.provides=Object.create(a)),s[e]=t}}function Hs(e,t,s=!1){const a=fs();if(a||bn){let n=bn?bn._context.provides:a?a.parent==null||a.ce?a.vnode.appContext&&a.vnode.appContext.provides:a.parent.provides:void 0;if(n&&e in n)return n[e];if(arguments.length>1)return s&&Me(t)?t.call(a&&a.proxy):t}}function eb(){return!!(fs()||bn)}const Cf=Symbol.for("v-scx"),Ef=()=>Hs(Cf);function tb(e,t){return xl(e,null,t)}function sb(e,t){return xl(e,null,{flush:"post"})}function Af(e,t){return xl(e,null,{flush:"sync"})}function Ut(e,t,s){return xl(e,t,s)}function xl(e,t,s=Ze){const{immediate:a,deep:n,flush:i,once:l}=s,o=Je({},s),r=t&&a||!t&&i!=="post";let c;if(kn){if(i==="sync"){const h=Ef();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!r){const h=()=>{};return h.stop=Xt,h.resume=Xt,h.pause=Xt,h}}const d=Yt;o.call=(h,m,v)=>Os(h,d,m,v);let u=!1;i==="post"?o.scheduler=h=>{Mt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(h,m)=>{m?h():Dc(h)}),o.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=zg(e,t,o);return kn&&(c?c.push(p):r&&p()),p}function ab(e,t,s){const a=this.proxy,n=He(e)?e.includes(".")?Rf(a,e):()=>a[e]:e.bind(a,a);let i;Me(t)?i=t:(i=t.handler,s=t);const l=_i(this),o=xl(n,i.bind(a),s);return l(),o}function Rf(e,t){const s=t.split(".");return()=>{let a=e;for(let n=0;n<s.length&&a;n++)a=a[s[n]];return a}}const Ga=new WeakMap,If=Symbol("_vte"),Of=e=>e.__isTeleport,fn=e=>e&&(e.disabled||e.disabled===""),nb=e=>e&&(e.defer||e.defer===""),zd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,jd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,zr=(e,t)=>{const s=e&&e.to;return He(s)?t?t(s):null:s},ib={name:"Teleport",__isTeleport:!0,process(e,t,s,a,n,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:m,createText:v,createComment:w,parentNode:A}}=c,y=fn(t.props);let{dynamicChildren:g}=t;const b=(I,C,x)=>{I.shapeFlag&16&&d(I.children,C,x,n,i,l,o,r)},_=(I=t)=>{const C=fn(I.props),x=I.target=zr(I.props,m),N=jr(x,I,v,h);x&&(l!=="svg"&&zd(x)?l="svg":l!=="mathml"&&jd(x)&&(l="mathml"),n&&n.isCE&&(n.ce._teleportTargets||(n.ce._teleportTargets=new Set)).add(x),C||(b(I,x,N),Pi(I,!1)))},k=I=>{const C=()=>{if(Ga.get(I)===C){if(Ga.delete(I),fn(I.props)){const x=A(I.el)||s;b(I,x,I.anchor),Pi(I,!0)}_(I)}};Ga.set(I,C),Mt(C,i)};if(e==null){const I=t.el=v(""),C=t.anchor=v("");if(h(I,s,a),h(C,s,a),nb(t.props)||i&&i.pendingBranch){k(t);return}y&&(b(t,s,C),Pi(t,!0)),_()}else{t.el=e.el;const I=t.anchor=e.anchor,C=Ga.get(e);if(C){C.flags|=8,Ga.delete(e),k(t);return}t.targetStart=e.targetStart;const x=t.target=e.target,N=t.targetAnchor=e.targetAnchor,F=fn(e.props),T=F?s:x,P=F?I:N;if(l==="svg"||zd(x)?l="svg":(l==="mathml"||jd(x))&&(l="mathml"),g?(p(e.dynamicChildren,g,T,n,i,l,o),Gc(e,t,!0)):r||u(e,t,T,P,n,i,l,o,!1),y)F?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):Nl(t,s,I,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const z=t.target=zr(t.props,m);z&&Nl(t,z,null,c,0)}else F&&Nl(t,x,N,c,1);Pi(t,y)}},remove(e,t,s,{um:a,o:{remove:n}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!fn(p),m=Ga.get(e);if(m&&(m.flags|=8,Ga.delete(e)),u&&(n(c),n(d)),i&&n(r),!m&&l&16)for(let v=0;v<o.length;v++){const w=o[v];a(w,t,s,h,!!w.dynamicChildren)}},move:Nl,hydrate:lb};function Nl(e,t,s,{o:{insert:a},m:n},i=2){i===0&&a(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&a(l,t,s),!Ga.has(e)&&(!u||fn(d))&&r&16)for(let p=0;p<c.length;p++)n(c[p],t,s,2);u&&a(o,t,s)}function lb(e,t,s,a,n,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(w,A){let y=A;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,w._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(w,A){A.anchor=u(l(w),A,o(w),s,a,n,i)}const m=t.target=zr(t.props,r),v=fn(t.props);if(m){const w=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(h(e,t),p(m,w),t.targetAnchor||jr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,w),t.targetAnchor||jr(m,t,d,c),u(w&&l(w),t,m,s,a,n,i))),Pi(t,v)}else v&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const ob=ib;function Pi(e,t){const s=e.ctx;if(s&&s.ut){let a,n;for(t?(a=e.el,n=e.anchor):(a=e.targetStart,n=e.targetAnchor);a&&a!==n;)a.nodeType===1&&a.setAttribute("data-v-owner",s.uid),a=a.nextSibling;s.ut()}}function jr(e,t,s,a,n=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[If]=l,e&&(a(i,e,n),a(l,e,n)),l}const Fs=Symbol("_leaveCb"),Ti=Symbol("_enterCb");function Mc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ge(()=>{e.isMounted=!0}),Wo(()=>{e.isUnmounting=!0}),e}const Ms=[Function,Array],Fc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ms,onEnter:Ms,onAfterEnter:Ms,onEnterCancelled:Ms,onBeforeLeave:Ms,onLeave:Ms,onAfterLeave:Ms,onLeaveCancelled:Ms,onBeforeAppear:Ms,onAppear:Ms,onAfterAppear:Ms,onAppearCancelled:Ms},Lf=e=>{const t=e.subTree;return t.component?Lf(t.component):t},rb={name:"BaseTransition",props:Fc,setup(e,{slots:t}){const s=fs(),a=Mc();return()=>{const n=t.default&&qo(t.default(),!0),i=n&&n.length?Nf(n):s.subTree?mh():void 0;if(!i)return;const l=tt(e),{mode:o}=l;if(a.isLeaving)return hr(i);const r=Vd(i);if(!r)return hr(i);let c=ri(r,l,a,s,u=>c=u);r.type!==Lt&&$a(r,c);let d=s.subTree&&Vd(s.subTree);if(d&&d.type!==Lt&&!Js(d,r)&&Lf(s).type!==Lt){let u=ri(d,l,a,s);if($a(d,u),o==="out-in"&&r.type!==Lt)return a.isLeaving=!0,u.afterLeave=()=>{a.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},hr(i);o==="in-out"&&r.type!==Lt?u.delayLeave=(p,h,m)=>{const v=Pf(a,d);v[String(d.key)]=d,p[Fs]=()=>{h(),p[Fs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Nf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==Lt){t=s;break}}return t}const Df=rb;function Pf(e,t){const{leavingVNodes:s}=e;let a=s.get(t.type);return a||(a=Object.create(null),s.set(t.type,a)),a}function ri(e,t,s,a,n){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:w,onAppear:A,onAfterAppear:y,onAppearCancelled:g}=t,b=String(e.key),_=Pf(s,e),k=(x,N)=>{x&&Os(x,a,9,N)},I=(x,N)=>{const F=N[1];k(x,N),Re(x)?x.every(T=>T.length<=1)&&F():x.length<=1&&F()},C={mode:l,persisted:o,beforeEnter(x){let N=r;if(!s.isMounted)if(i)N=w||r;else return;x[Fs]&&x[Fs](!0);const F=_[b];F&&Js(e,F)&&F.el[Fs]&&F.el[Fs](),k(N,[x])},enter(x){if(_[b]===e)return;let N=c,F=d,T=u;if(!s.isMounted)if(i)N=A||c,F=y||d,T=g||u;else return;let P=!1;x[Ti]=G=>{P||(P=!0,G?k(T,[x]):k(F,[x]),C.delayedLeave&&C.delayedLeave(),x[Ti]=void 0)};const z=x[Ti].bind(null,!1);N?I(N,[x,z]):z()},leave(x,N){const F=String(e.key);if(x[Ti]&&x[Ti](!0),s.isUnmounting)return N();k(p,[x]);let T=!1;x[Fs]=z=>{T||(T=!0,N(),z?k(v,[x]):k(m,[x]),x[Fs]=void 0,_[F]===e&&delete _[F])};const P=x[Fs].bind(null,!1);_[F]=e,h?I(h,[x,P]):P()},clone(x){const N=ri(x,t,s,a,n);return n&&n(N),N}};return C}function hr(e){if(wl(e))return e=pa(e),e.children=null,e}function Vd(e){if(!wl(e))return Of(e.type)&&e.children?Nf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Me(s.default))return s.default()}}function $a(e,t){e.shapeFlag&6&&e.component?(e.transition=t,$a(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function qo(e,t=!1,s){let a=[],n=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Gt?(l.patchFlag&128&&n++,a=a.concat(qo(l.children,t,o))):(t||l.type!==Lt)&&a.push(o!=null?pa(l,{key:o}):l)}if(n>1)for(let i=0;i<a.length;i++)a[i].patchFlag=-2;return a}function _l(e,t){return Me(e)?Je({name:e.name},t,{setup:e}):e}function cb(){const e=fs();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function $c(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function db(e){const t=fs(),s=Lc(null);if(t){const n=t.refs===Ze?t.refs={}:t.refs;Object.defineProperty(n,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function qd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const oo=new WeakMap;function si(e,t,s,a,n=!1){if(Re(e)){e.forEach((v,w)=>si(v,t&&(Re(t)?t[w]:t),s,a,n));return}if(Na(a)&&!n){a.shapeFlag&512&&a.type.__asyncResolved&&a.component.subTree.component&&si(e,t,s,a.component.subTree);return}const i=a.shapeFlag&4?kl(a.component):a.el,l=n?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ze?o.refs={}:o.refs,u=o.setupState,p=tt(u),h=u===Ze?Wn:v=>qd(d,v)?!1:rt(p,v),m=(v,w)=>!(w&&qd(d,w));if(c!=null&&c!==r){if(Gd(t),He(c))d[c]=null,h(c)&&(u[c]=null);else if($t(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Me(r))xi(r,o,12,[l,d]);else{const v=He(r),w=$t(r);if(v||w){const A=()=>{if(e.f){const y=v?h(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(n)Re(y)&&Tc(y,i);else if(Re(y))y.includes(i)||y.push(i);else if(v)d[r]=[i],h(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,h(r)&&(u[r]=l)):w&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{A(),oo.delete(e)};y.id=-1,oo.set(e,y),Mt(y,s)}else Gd(e),A()}}}function Gd(e){const t=oo.get(e);t&&(t.flags|=8,oo.delete(e))}let Kd=!1;const Un=()=>{Kd||(console.error("Hydration completed but contains mismatches."),Kd=!0)},ub=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",pb=e=>e.namespaceURI.includes("MathML"),Dl=e=>{if(e.nodeType===1){if(ub(e))return"svg";if(pb(e))return"mathml"}},Jn=e=>e.nodeType===8;function fb(e){const{mt:t,p:s,o:{patchProp:a,createText:n,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,b)=>{if(!b.hasChildNodes()){s(null,g,b),lo(),b._vnode=g;return}u(b.firstChild,g,null,null,null),lo(),b._vnode=g},u=(g,b,_,k,I,C=!1)=>{C=C||!!b.dynamicChildren;const x=Jn(g)&&g.data==="[",N=()=>v(g,b,_,k,I,x),{type:F,ref:T,shapeFlag:P,patchFlag:z}=b;let G=g.nodeType;b.el=g,z===-2&&(C=!1,b.dynamicChildren=null);let E=null;switch(F){case Xa:G!==3?b.children===""?(r(b.el=n(""),l(g),g),E=g):E=N():(g.data!==b.children&&(Un(),g.data=b.children),E=i(g));break;case Lt:y(g)?(E=i(g),A(b.el=g.content.firstChild,g,_)):G!==8||x?E=N():E=i(g);break;case yn:if(x&&(g=i(g),G=g.nodeType),G===1||G===3){E=g;const O=!b.children.length;for(let R=0;R<b.staticCount;R++)O&&(b.children+=E.nodeType===1?E.outerHTML:E.data),R===b.staticCount-1&&(b.anchor=E),E=i(E);return x?i(E):E}else N();break;case Gt:x?E=m(g,b,_,k,I,C):E=N();break;default:if(P&1)(G!==1||b.type.toLowerCase()!==g.tagName.toLowerCase())&&!y(g)?E=N():E=p(g,b,_,k,I,C);else if(P&6){b.slotScopeIds=I;const O=l(g);if(x?E=w(g):Jn(g)&&g.data==="teleport start"?E=w(g,g.data,"teleport end"):E=i(g),t(b,O,null,_,k,Dl(O),C),Na(b)&&!b.type.__asyncResolved){let R;x?(R=_t(Gt),R.anchor=E?E.previousSibling:O.lastChild):R=g.nodeType===3?Wc(""):_t("div"),R.el=g,b.component.subTree=R}}else P&64?G!==8?E=N():E=b.type.hydrate(g,b,_,k,I,C,e,h):P&128&&(E=b.type.hydrate(g,b,_,k,Dl(l(g)),I,C,e,u))}return T!=null&&si(T,null,k,b),E},p=(g,b,_,k,I,C)=>{C=C||!!b.dynamicChildren;const{type:x,props:N,patchFlag:F,shapeFlag:T,dirs:P,transition:z}=b,G=x==="input"||x==="option";if(G||F!==-1){P&&ra(b,null,_,"created");let E=!1;if(y(g)){E=lh(null,z)&&_&&_.vnode.props&&_.vnode.props.appear;const R=g.content.firstChild;if(E){const $=R.getAttribute("class");$&&(R.$cls=$),z.beforeEnter(R)}A(R,g,_),b.el=g=R}if(T&16&&!(N&&(N.innerHTML||N.textContent))){let R=h(g.firstChild,b,g,_,k,I,C);for(R&&!Pl(g,1)&&Un();R;){const $=R;R=R.nextSibling,o($)}}else if(T&8){let R=b.children;R[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(R=R.slice(1));const{textContent:$}=g;$!==R&&$!==R.replace(/\r\n|\r/g,`
`)&&(Pl(g,0)||Un(),g.textContent=b.children)}if(N){if(G||!C||F&48){const R=g.tagName.includes("-");for(const $ in N)(G&&($.endsWith("value")||$==="indeterminate")||Cn($)&&!Oa($)||$[0]==="."||R&&!Oa($))&&a(g,$,null,N[$],void 0,_)}else if(N.onClick)a(g,"onClick",null,N.onClick,void 0,_);else if(F&4&&La(N.style))for(const R in N.style)N.style[R]}let O;(O=N&&N.onVnodeBeforeMount)&&xs(O,_,b),P&&ra(b,null,_,"beforeMount"),((O=N&&N.onVnodeMounted)||P||E)&&dh(()=>{O&&xs(O,_,b),E&&z.enter(g),P&&ra(b,null,_,"mounted")},k)}return g.nextSibling},h=(g,b,_,k,I,C,x)=>{x=x||!!b.dynamicChildren;const N=b.children,F=N.length;let T=!1;for(let P=0;P<F;P++){const z=x?N[P]:N[P]=ws(N[P]),G=z.type===Xa;g?(G&&!x&&P+1<F&&ws(N[P+1]).type===Xa&&(r(n(g.data.slice(z.children.length)),_,i(g)),g.data=z.children),g=u(g,z,k,I,C,x)):G&&!z.children?r(z.el=n(""),_):(T||(T=!0,Pl(_,1)||Un()),s(null,z,_,null,k,I,Dl(_),C))}return g},m=(g,b,_,k,I,C)=>{const{slotScopeIds:x}=b;x&&(I=I?I.concat(x):x);const N=l(g),F=h(i(g),b,N,_,k,I,C);return F&&Jn(F)&&F.data==="]"?i(b.anchor=F):(Un(),r(b.anchor=c("]"),N,F),F)},v=(g,b,_,k,I,C)=>{if(Pl(g.parentElement,1)||Un(),b.el=null,C){const F=w(g);for(;;){const T=i(g);if(T&&T!==F)o(T);else break}}const x=i(g),N=l(g);return o(g),s(null,b,N,x,_,k,Dl(N),I),_&&(_.vnode.el=b.el,Zo(_,b.el)),x},w=(g,b="[",_="]")=>{let k=0;for(;g;)if(g=i(g),g&&Jn(g)&&(g.data===b&&k++,g.data===_)){if(k===0)return i(g);k--}return g},A=(g,b,_)=>{const k=b.parentNode;k&&k.replaceChild(g,b);let I=_;for(;I;)I.vnode.el===b&&(I.vnode.el=I.subTree.el=g),I=I.parent},y=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const Wd="data-allow-mismatch",hb={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function Pl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(Wd);)e=e.parentElement;const s=e&&e.getAttribute(Wd);if(s==null)return!1;if(s==="")return!0;{const a=s.split(",");return t===0&&a.includes("children")?!0:a.includes(hb[t])}}const mb=$o().requestIdleCallback||(e=>setTimeout(e,1)),vb=$o().cancelIdleCallback||(e=>clearTimeout(e)),gb=(e=1e4)=>t=>{const s=mb(t,{timeout:e});return()=>vb(s)};function bb(e){const{top:t,left:s,bottom:a,right:n}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||a>0&&a<i)&&(s>0&&s<l||n>0&&n<l)}const yb=e=>(t,s)=>{const a=new IntersectionObserver(n=>{for(const i of n)if(i.isIntersecting){a.disconnect(),t();break}},e);return s(n=>{if(n instanceof Element){if(bb(n))return t(),a.disconnect(),!1;a.observe(n)}}),()=>a.disconnect()},xb=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},_b=(e=[])=>(t,s)=>{He(e)&&(e=[e]);let a=!1;const n=l=>{a||(a=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,n)})};return s(l=>{for(const o of e)l.addEventListener(o,n,{once:!0})}),i};function wb(e,t){if(Jn(e)&&e.data==="["){let s=1,a=e.nextSibling;for(;a;){if(a.nodeType===1){if(t(a)===!1)break}else if(Jn(a))if(a.data==="]"){if(--s===0)break}else a.data==="["&&s++;a=a.nextSibling}}else t(e)}const Na=e=>!!e.type.__asyncLoader;function kb(e){Me(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:a,delay:n=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((w,A)=>{r(v,()=>w(p()),()=>A(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return _l({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(m,v,w){let A=!1;(v.bu||(v.bu=[])).push(()=>A=!0);const y=()=>{A||w()},g=i?()=>{const b=i(y,_=>wb(m,_));b&&(v.bum||(v.bum=[])).push(b)}:y;d?g():h().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=Yt;if($c(m),d)return()=>Ml(d,m);const v=_=>{c=null,Rn(_,m,13,!a)};if(o&&m.suspense||kn)return h().then(_=>()=>Ml(_,m)).catch(_=>(v(_),()=>a?_t(a,{error:_}):null));const w=f(!1),A=f(),y=f(!!n);let g,b;return mt(()=>{g!=null&&clearTimeout(g),b!=null&&clearTimeout(b)}),n&&(b=setTimeout(()=>{m.isUnmounted||(y.value=!1)},n)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!w.value&&!A.value){const _=new Error(`Async component timed out after ${l}ms.`);v(_),A.value=_}},l)),h().then(()=>{m.isUnmounted||(w.value=!0,m.parent&&wl(m.parent.vnode)&&m.parent.update())}).catch(_=>{if(m.isUnmounted){c=null;return}v(_),A.value=_}),()=>{if(w.value&&d)return Ml(d,m);if(A.value&&a)return _t(a,{error:A.value});if(s&&!y.value)return Ml(s,m)}}})}function Ml(e,t){const{ref:s,props:a,children:n,ce:i}=t.vnode,l=_t(e,a,n);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const wl=e=>e.type.__isKeepAlive,Sb={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=fs(),a=s.ctx;if(!a.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const n=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=a,p=u("div");a.activate=(y,g,b,_,k)=>{const I=y.component;c(y,g,b,0,o),r(I.vnode,y,g,b,I,o,_,y.slotScopeIds,k),Mt(()=>{I.isDeactivated=!1,I.a&&ei(I.a);const C=y.props&&y.props.onVnodeMounted;C&&xs(C,I.parent,y)},o)},a.deactivate=y=>{const g=y.component;co(g.m),co(g.a),c(y,p,null,1,o),Mt(()=>{g.da&&ei(g.da);const b=y.props&&y.props.onVnodeUnmounted;b&&xs(b,g.parent,y),g.isDeactivated=!0},o)};function h(y){mr(y),d(y,s,o,!0)}function m(y){n.forEach((g,b)=>{const _=Qr(Na(g)?g.type.__asyncResolved||{}:g.type);_&&!y(_)&&v(b)})}function v(y){const g=n.get(y);g&&(!l||!Js(g,l))?h(g):l&&mr(l),n.delete(y),i.delete(y)}Ut(()=>[e.include,e.exclude],([y,g])=>{y&&m(b=>Mi(y,b)),g&&m(b=>!Mi(g,b))},{flush:"post",deep:!0});let w=null;const A=()=>{w!=null&&(uo(s.subTree.type)?Mt(()=>{n.set(w,Fl(s.subTree))},s.subTree.suspense):n.set(w,Fl(s.subTree)))};return Ge(A),Ko(A),Wo(()=>{n.forEach(y=>{const{subTree:g,suspense:b}=s,_=Fl(g);if(y.type===_.type&&y.key===_.key){mr(_);const k=_.component.da;k&&Mt(k,b);return}h(y)})}),()=>{if(w=null,!t.default)return l=null;const y=t.default(),g=y[0];if(y.length>1)return l=null,y;if(!Ua(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let b=Fl(g);if(b.type===Lt)return l=null,b;const _=b.type,k=Qr(Na(b)?b.type.__asyncResolved||{}:_),{include:I,exclude:C,max:x}=e;if(I&&(!k||!Mi(I,k))||C&&k&&Mi(C,k))return b.shapeFlag&=-257,l=b,g;const N=b.key==null?_:b.key,F=n.get(N);return b.el&&(b=pa(b),g.shapeFlag&128&&(g.ssContent=b)),w=N,F?(b.el=F.el,b.component=F.component,b.transition&&$a(b,b.transition),b.shapeFlag|=512,i.delete(N),i.add(N)):(i.add(N),x&&i.size>parseInt(x,10)&&v(i.values().next().value)),b.shapeFlag|=256,l=b,uo(g.type)?g:b}}},Tb=Sb;function Mi(e,t){return Re(e)?e.some(s=>Mi(s,t)):He(e)?e.split(",").includes(t):Pv(e)?(e.lastIndex=0,e.test(t)):!1}function es(e,t){Mf(e,"a",t)}function Wt(e,t){Mf(e,"da",t)}function Mf(e,t,s=Yt){const a=e.__wdc||(e.__wdc=()=>{let n=s;for(;n;){if(n.isDeactivated)return;n=n.parent}return e()});if(Go(t,a,s),s){let n=s.parent;for(;n&&n.parent;)wl(n.parent.vnode)&&Cb(a,t,s,n),n=n.parent}}function Cb(e,t,s,a){const n=Go(t,e,a,!0);mt(()=>{Tc(a[t],n)},s)}function mr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function Fl(e){return e.shapeFlag&128?e.ssContent:e}function Go(e,t,s=Yt,a=!1){if(s){const n=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Ma();const o=_i(s),r=Os(t,s,e,l);return o(),Fa(),r});return a?n.unshift(i):n.push(i),i}}const Ba=e=>(t,s=Yt)=>{(!kn||e==="sp")&&Go(e,(...a)=>t(...a),s)},Ff=Ba("bm"),Ge=Ba("m"),Uc=Ba("bu"),Ko=Ba("u"),Wo=Ba("bum"),mt=Ba("um"),$f=Ba("sp"),Uf=Ba("rtg"),Bf=Ba("rtc");function Hf(e,t=Yt){Go("ec",e,t)}const Bc="components",Eb="directives";function Ab(e,t){return Hc(Bc,e,!0,t)||e}const zf=Symbol.for("v-ndc");function Rb(e){return He(e)?Hc(Bc,e,!1)||e:e||zf}function Ib(e){return Hc(Eb,e)}function Hc(e,t,s=!0,a=!1){const n=Qt||Yt;if(n){const i=n.type;if(e===Bc){const o=Qr(i,!1);if(o&&(o===t||o===ht(t)||o===An(ht(t))))return i}const l=Jd(n[e]||i[e],t)||Jd(n.appContext[e],t);return!l&&a?i:l}}function Jd(e,t){return e&&(e[t]||e[ht(t)]||e[An(ht(t))])}function Ob(e,t,s,a){let n;const i=s&&s[a],l=Re(e);if(l||He(e)){const o=l&&La(e);let r=!1,c=!1;o&&(r=!Ts(e),c=ua(e),e=Ho(e)),n=new Array(e.length);for(let d=0,u=e.length;d<u;d++)n[d]=t(r?c?oi(Qs(e[d])):Qs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){n=new Array(e);for(let o=0;o<e;o++)n[o]=t(o+1,o,void 0,i&&i[o])}else if(ot(e))if(e[Symbol.iterator])n=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);n=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];n[r]=t(e[d],d,r,i&&i[r])}}else n=[];return s&&(s[a]=n),n}function Lb(e,t){for(let s=0;s<t.length;s++){const a=t[s];if(Re(a))for(let n=0;n<a.length;n++)e[a[n].name]=a[n].fn;else a&&(e[a.name]=a.key?(...n)=>{const i=a.fn(...n);return i&&(i.key=a.key),i}:a.fn)}return e}function Nb(e,t,s={},a,n){if(Qt.ce||Qt.parent&&Na(Qt.parent)&&Qt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),nl(),po(Gt,null,[_t("slot",s,a&&a())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),nl();const l=i&&zc(i(s)),o=s.key||l&&l.key,r=po(Gt,{key:(o&&!os(o)?o:`_${t}`)+(!l&&a?"_fb":"")},l||(a?a():[]),l&&e._===1?64:-2);return!n&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function zc(e){return e.some(t=>Ua(t)?!(t.type===Lt||t.type===Gt&&!zc(t.children)):!0)?e:null}function Db(e,t){const s={};for(const a in e)s[t&&/[A-Z]/.test(a)?`on:${a}`:Xn(a)]=e[a];return s}const Vr=e=>e?bh(e)?kl(e):Vr(e.parent):null,ji=Je(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>Vr(e.parent),$root:e=>Vr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>jc(e),$forceUpdate:e=>e.f||(e.f=()=>{Dc(e.update)}),$nextTick:e=>e.n||(e.n=Ot.bind(e.proxy)),$watch:e=>ab.bind(e)}),vr=(e,t)=>e!==Ze&&!e.__isScriptSetup&&rt(e,t),qr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:a,data:n,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return a[t];case 2:return n[t];case 4:return s[t];case 3:return i[t]}else{if(vr(a,t))return l[t]=1,a[t];if(n!==Ze&&rt(n,t))return l[t]=2,n[t];if(rt(i,t))return l[t]=3,i[t];if(s!==Ze&&rt(s,t))return l[t]=4,s[t];Gr&&(l[t]=0)}}const c=ji[t];let d,u;if(c)return t==="$attrs"&&ns(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ze&&rt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,rt(u,t))return u[t]},set({_:e},t,s){const{data:a,setupState:n,ctx:i}=e;return vr(n,t)?(n[t]=s,!0):a!==Ze&&rt(a,t)?(a[t]=s,!0):rt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:a,appContext:n,props:i,type:l}},o){let r;return!!(s[o]||e!==Ze&&o[0]!=="$"&&rt(e,o)||vr(t,o)||rt(i,o)||rt(a,o)||rt(ji,o)||rt(n.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:rt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Pb=Je({},qr,{get(e,t){if(t!==Symbol.unscopables)return qr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!zv(t)}});function Mb(){return null}function Fb(){return null}function $b(e){}function Ub(e){}function Bb(){return null}function Hb(){}function zb(e,t){return null}function jb(){return jf().slots}function Vb(){return jf().attrs}function jf(e){const t=fs();return t.setupContext||(t.setupContext=wh(t))}function sl(e){return Re(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function qb(e,t){const s=sl(e);for(const a in t){if(a.startsWith("__skip"))continue;let n=s[a];n?Re(n)||Me(n)?n=s[a]={type:n,default:t[a]}:n.default=t[a]:n===null&&(n=s[a]={default:t[a]}),n&&t[`__skip_${a}`]&&(n.skipFactory=!0)}return s}function Gb(e,t){return!e||!t?e||t:Re(e)&&Re(t)?e.concat(t):Je({},sl(e),sl(t))}function Kb(e,t){const s={};for(const a in e)t.includes(a)||Object.defineProperty(s,a,{enumerable:!0,get:()=>e[a]});return s}function Wb(e){const t=fs(),s=kn;let a=e();ll(),s&&ni(!1);const n=()=>{_i(t),s&&ni(!0)},i=()=>{fs()!==t&&t.scope.off(),ll(),s&&ni(!1)};return Cc(a)&&(a=a.catch(l=>{throw n(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[a,()=>{n(),Promise.resolve().then(i)}]}let Gr=!0;function Jb(e){const t=jc(e),s=e.proxy,a=e.ctx;Gr=!1,t.beforeCreate&&Zd(t.beforeCreate,e,"bc");const{data:n,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:m,activated:v,deactivated:w,beforeDestroy:A,beforeUnmount:y,destroyed:g,unmounted:b,render:_,renderTracked:k,renderTriggered:I,errorCaptured:C,serverPrefetch:x,expose:N,inheritAttrs:F,components:T,directives:P,filters:z}=t;if(c&&Zb(c,a,null),l)for(const O in l){const R=l[O];Me(R)&&(a[O]=R.bind(s))}if(n){const O=n.call(s,s);ot(O)&&(e.data=sn(O))}if(Gr=!0,i)for(const O in i){const R=i[O],$=Me(R)?R.bind(s,s):Me(R.get)?R.get.bind(s,s):Xt,Q=!Me(R)&&Me(R.set)?R.set.bind(s):Xt,W=q({get:$,set:Q});Object.defineProperty(a,O,{enumerable:!0,configurable:!0,get:()=>W.value,set:Z=>W.value=Z})}if(o)for(const O in o)Vf(o[O],a,s,O);if(r){const O=Me(r)?r.call(s):r;Reflect.ownKeys(O).forEach(R=>{zi(R,O[R])})}d&&Zd(d,e,"c");function E(O,R){Re(R)?R.forEach($=>O($.bind(s))):R&&O(R.bind(s))}if(E(Ff,u),E(Ge,p),E(Uc,h),E(Ko,m),E(es,v),E(Wt,w),E(Hf,C),E(Bf,k),E(Uf,I),E(Wo,y),E(mt,b),E($f,x),Re(N))if(N.length){const O=e.exposed||(e.exposed={});N.forEach(R=>{Object.defineProperty(O,R,{get:()=>s[R],set:$=>s[R]=$,enumerable:!0})})}else e.exposed||(e.exposed={});_&&e.render===Xt&&(e.render=_),F!=null&&(e.inheritAttrs=F),T&&(e.components=T),P&&(e.directives=P),x&&$c(e)}function Zb(e,t,s=Xt){Re(e)&&(e=Kr(e));for(const a in e){const n=e[a];let i;ot(n)?"default"in n?i=Hs(n.from||a,n.default,!0):i=Hs(n.from||a):i=Hs(n),$t(i)?Object.defineProperty(t,a,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[a]=i}}function Zd(e,t,s){Os(Re(e)?e.map(a=>a.bind(t.proxy)):e.bind(t.proxy),t,s)}function Vf(e,t,s,a){let n=a.includes(".")?Rf(s,a):()=>s[a];if(He(e)){const i=t[e];Me(i)&&Ut(n,i)}else if(Me(e))Ut(n,e.bind(s));else if(ot(e))if(Re(e))e.forEach(i=>Vf(i,t,s,a));else{const i=Me(e.handler)?e.handler.bind(s):t[e.handler];Me(i)&&Ut(n,i,e)}}function jc(e){const t=e.type,{mixins:s,extends:a}=t,{mixins:n,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!n.length&&!s&&!a?r=t:(r={},n.length&&n.forEach(c=>ro(r,c,l,!0)),ro(r,t,l)),ot(t)&&i.set(t,r),r}function ro(e,t,s,a=!1){const{mixins:n,extends:i}=t;i&&ro(e,i,s,!0),n&&n.forEach(l=>ro(e,l,s,!0));for(const l in t)if(!(a&&l==="expose")){const o=Yb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const Yb={data:Yd,props:Qd,emits:Qd,methods:Fi,computed:Fi,beforeCreate:rs,created:rs,beforeMount:rs,mounted:rs,beforeUpdate:rs,updated:rs,beforeDestroy:rs,beforeUnmount:rs,destroyed:rs,unmounted:rs,activated:rs,deactivated:rs,errorCaptured:rs,serverPrefetch:rs,components:Fi,directives:Fi,watch:Xb,provide:Yd,inject:Qb};function Yd(e,t){return t?e?function(){return Je(Me(e)?e.call(this,this):e,Me(t)?t.call(this,this):t)}:t:e}function Qb(e,t){return Fi(Kr(e),Kr(t))}function Kr(e){if(Re(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function rs(e,t){return e?[...new Set([].concat(e,t))]:t}function Fi(e,t){return e?Je(Object.create(null),e,t):t}function Qd(e,t){return e?Re(e)&&Re(t)?[...new Set([...e,...t])]:Je(Object.create(null),sl(e),sl(t??{})):t}function Xb(e,t){if(!e)return t;if(!t)return e;const s=Je(Object.create(null),e);for(const a in t)s[a]=rs(e[a],t[a]);return s}function qf(){return{app:null,config:{isNativeTag:Wn,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let ey=0;function ty(e,t){return function(a,n=null){Me(a)||(a=Je({},a)),n!=null&&!ot(n)&&(n=null);const i=qf(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:ey++,_component:a,_props:n,_container:null,_context:i,_instance:null,version:Sh,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Me(d.install)?(l.add(d),d.install(c,...u)):Me(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const h=c._ceVNode||_t(a,n);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),r=!0,c._container=d,d.__vue_app__=c,kl(h.component)}},onUnmount(d){o.push(d)},unmount(){r&&(Os(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=bn;bn=c;try{return d()}finally{bn=u}}};return c}}let bn=null;function sy(e,t,s=Ze){const a=fs(),n=ht(t),i=ks(t),l=Gf(e,n),o=bf((r,c)=>{let d,u=Ze,p;return Af(()=>{const h=e[n];qt(d,h)&&(d=h,c())}),{get(){return r(),s.get?s.get(d):d},set(h){const m=s.set?s.set(h):h;if(!qt(m,d)&&!(u!==Ze&&qt(h,u)))return;const v=a.vnode.props,w=!!(v&&(t in v||n in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${n}`in v||`onUpdate:${i}`in v));w||(d=h,c()),a.emit(`update:${t}`,m),qt(h,u)&&(qt(h,m)&&!qt(m,p)||w&&u!==Ze&&!qt(m,d))&&c(),u=h,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ze:o,done:!1}:{done:!0}}}},o}const Gf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${ht(t)}Modifiers`]||e[`${ks(t)}Modifiers`];function ay(e,t,...s){if(e.isUnmounted)return;const a=e.vnode.props||Ze;let n=s;const i=t.startsWith("update:"),l=i&&Gf(a,t.slice(7));l&&(l.trim&&(n=s.map(d=>He(d)?d.trim():d)),l.number&&(n=s.map(Fo)));let o,r=a[o=Xn(t)]||a[o=Xn(ht(t))];!r&&i&&(r=a[o=Xn(ks(t))]),r&&Os(r,e,6,n);const c=a[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,Os(c,e,6,n)}}const ny=new WeakMap;function Kf(e,t,s=!1){const a=s?ny:t.emitsCache,n=a.get(e);if(n!==void 0)return n;const i=e.emits;let l={},o=!1;if(!Me(e)){const r=c=>{const d=Kf(c,t,!0);d&&(o=!0,Je(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(ot(e)&&a.set(e,null),null):(Re(i)?i.forEach(r=>l[r]=null):Je(l,i),ot(e)&&a.set(e,l),l)}function Jo(e,t){return!e||!Cn(t)?!1:(t=t.slice(2).replace(/Once$/,""),rt(e,t[0].toLowerCase()+t.slice(1))||rt(e,ks(t))||rt(e,t))}function Wl(e){const{type:t,vnode:s,proxy:a,withProxy:n,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:m,inheritAttrs:v}=e,w=tl(e);let A,y;try{if(s.shapeFlag&4){const b=n||a,_=b;A=ws(c.call(_,b,d,u,h,p,m)),y=o}else{const b=t;A=ws(b.length>1?b(u,{attrs:o,slots:l,emit:r}):b(u,null)),y=t.props?o:ly(o)}}catch(b){Vi.length=0,Rn(b,e,1),A=_t(Lt)}let g=A;if(y&&v!==!1){const b=Object.keys(y),{shapeFlag:_}=g;b.length&&_&7&&(i&&b.some(No)&&(y=oy(y,i)),g=pa(g,y,!1,!0))}return s.dirs&&(g=pa(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&$a(g,s.transition),A=g,tl(w),A}function iy(e,t=!0){let s;for(let a=0;a<e.length;a++){const n=e[a];if(Ua(n)){if(n.type!==Lt||n.children==="v-if"){if(s)return;s=n}}else return}return s}const ly=e=>{let t;for(const s in e)(s==="class"||s==="style"||Cn(s))&&((t||(t={}))[s]=e[s]);return t},oy=(e,t)=>{const s={};for(const a in e)(!No(a)||!(a.slice(9)in t))&&(s[a]=e[a]);return s};function ry(e,t,s){const{props:a,children:n,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return a?Xd(a,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(Wf(l,a,p)&&!Jo(c,p))return!0}}}else return(n||o)&&(!o||!o.$stable)?!0:a===l?!1:a?l?Xd(a,l,c):!0:!!l;return!1}function Xd(e,t,s){const a=Object.keys(t);if(a.length!==Object.keys(e).length)return!0;for(let n=0;n<a.length;n++){const i=a[n];if(Wf(t,e,i)&&!Jo(s,i))return!0}return!1}function Wf(e,t,s){const a=e[s],n=t[s];return s==="style"&&ot(a)&&ot(n)?!Pa(a,n):a!==n}function Zo({vnode:e,parent:t,suspense:s},a){for(;t;){const n=t.subTree;if(n.suspense&&n.suspense.activeBranch===e&&(n.suspense.vnode.el=n.el=a,e=n),n===e)(e=t.vnode).el=a,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=a)}const Jf={},Zf=()=>Object.create(Jf),Yf=e=>Object.getPrototypeOf(e)===Jf;function cy(e,t,s,a=!1){const n={},i=Zf();e.propsDefaults=Object.create(null),Qf(e,t,n,i);for(const l in e.propsOptions[0])l in n||(n[l]=void 0);s?e.props=a?n:Oc(n):e.type.props?e.props=n:e.props=i,e.attrs=i}function dy(e,t,s,a){const{props:n,attrs:i,vnode:{patchFlag:l}}=e,o=tt(n),[r]=e.propsOptions;let c=!1;if((a||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Jo(e.emitsOptions,p))continue;const h=t[p];if(r)if(rt(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const m=ht(p);n[m]=Wr(r,o,m,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{Qf(e,t,n,i)&&(c=!0);let d;for(const u in o)(!t||!rt(t,u)&&((d=ks(u))===u||!rt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(n[u]=Wr(r,o,u,void 0,e,!0)):delete n[u]);if(i!==o)for(const u in i)(!t||!rt(t,u))&&(delete i[u],c=!0)}c&&Ca(e.attrs,"set","")}function Qf(e,t,s,a){const[n,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(Oa(r))continue;const c=t[r];let d;n&&rt(n,d=ht(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Jo(e.emitsOptions,r)||(!(r in a)||c!==a[r])&&(a[r]=c,l=!0)}if(i){const r=tt(s),c=o||Ze;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Wr(n,r,u,c[u],e,!rt(c,u))}}return l}function Wr(e,t,s,a,n,i){const l=e[s];if(l!=null){const o=rt(l,"default");if(o&&a===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Me(r)){const{propsDefaults:c}=n;if(s in c)a=c[s];else{const d=_i(n);a=c[s]=r.call(null,t),d()}}else a=r;n.ce&&n.ce._setProp(s,a)}l[0]&&(i&&!o?a=!1:l[1]&&(a===""||a===ks(s))&&(a=!0))}return a}const uy=new WeakMap;function Xf(e,t,s=!1){const a=s?uy:t.propsCache,n=a.get(e);if(n)return n;const i=e.props,l={},o=[];let r=!1;if(!Me(e)){const d=u=>{r=!0;const[p,h]=Xf(u,t,!0);Je(l,p),h&&o.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return ot(e)&&a.set(e,Yn),Yn;if(Re(i))for(let d=0;d<i.length;d++){const u=ht(i[d]);eu(u)&&(l[u]=Ze)}else if(i)for(const d in i){const u=ht(d);if(eu(u)){const p=i[d],h=l[u]=Re(p)||Me(p)?{type:p}:Je({},p),m=h.type;let v=!1,w=!0;if(Re(m))for(let A=0;A<m.length;++A){const y=m[A],g=Me(y)&&y.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(w=!1)}else v=Me(m)&&m.name==="Boolean";h[0]=v,h[1]=w,(v||rt(h,"default"))&&o.push(u)}}const c=[l,o];return ot(e)&&a.set(e,c),c}function eu(e){return e[0]!=="$"&&!Oa(e)}const Vc=e=>e==="_"||e==="_ctx"||e==="$stable",qc=e=>Re(e)?e.map(ws):[ws(e)],py=(e,t,s)=>{if(t._n)return t;const a=Pc((...n)=>qc(t(...n)),s);return a._c=!1,a},eh=(e,t,s)=>{const a=e._ctx;for(const n in e){if(Vc(n))continue;const i=e[n];if(Me(i))t[n]=py(n,i,a);else if(i!=null){const l=qc(i);t[n]=()=>l}}},th=(e,t)=>{const s=qc(t);e.slots.default=()=>s},sh=(e,t,s)=>{for(const a in t)(s||!Vc(a))&&(e[a]=t[a])},fy=(e,t,s)=>{const a=e.slots=Zf();if(e.vnode.shapeFlag&32){const n=t._;n?(sh(a,t,s),s&&Kp(a,"_",n,!0)):eh(t,a)}else t&&th(e,t)},hy=(e,t,s)=>{const{vnode:a,slots:n}=e;let i=!0,l=Ze;if(a.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:sh(n,t,s):(i=!t.$stable,eh(t,n)),l=t}else t&&(th(e,t),l={default:1});if(i)for(const o in n)!Vc(o)&&l[o]==null&&delete n[o]},Mt=dh;function ah(e){return ih(e)}function nh(e){return ih(e,fb)}function ih(e,t){const s=$o();s.__VUE__=!0;const{insert:a,remove:n,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Xt,insertStaticContent:m}=e,v=(S,M,B,de=null,ne=null,oe=null,me=void 0,H=null,ee=!!M.dynamicChildren)=>{if(S===M)return;S&&!Js(S,M)&&(de=ae(S),Z(S,ne,oe,!0),S=null),M.patchFlag===-2&&(ee=!1,M.dynamicChildren=null);const{type:X,ref:fe,shapeFlag:ue}=M;switch(X){case Xa:w(S,M,B,de);break;case Lt:A(S,M,B,de);break;case yn:S==null&&y(M,B,de,me);break;case Gt:T(S,M,B,de,ne,oe,me,H,ee);break;default:ue&1?_(S,M,B,de,ne,oe,me,H,ee):ue&6?P(S,M,B,de,ne,oe,me,H,ee):(ue&64||ue&128)&&X.process(S,M,B,de,ne,oe,me,H,ee,ce)}fe!=null&&ne?si(fe,S&&S.ref,oe,M||S,!M):fe==null&&S&&S.ref!=null&&si(S.ref,null,oe,S,!0)},w=(S,M,B,de)=>{if(S==null)a(M.el=o(M.children),B,de);else{const ne=M.el=S.el;M.children!==S.children&&c(ne,M.children)}},A=(S,M,B,de)=>{S==null?a(M.el=r(M.children||""),B,de):M.el=S.el},y=(S,M,B,de)=>{[S.el,S.anchor]=m(S.children,M,B,de,S.el,S.anchor)},g=({el:S,anchor:M},B,de)=>{let ne;for(;S&&S!==M;)ne=p(S),a(S,B,de),S=ne;a(M,B,de)},b=({el:S,anchor:M})=>{let B;for(;S&&S!==M;)B=p(S),n(S),S=B;n(M)},_=(S,M,B,de,ne,oe,me,H,ee)=>{if(M.type==="svg"?me="svg":M.type==="math"&&(me="mathml"),S==null)k(M,B,de,ne,oe,me,H,ee);else{const X=S.el&&S.el._isVueCE?S.el:null;try{X&&X._beginPatch(),x(S,M,ne,oe,me,H,ee)}finally{X&&X._endPatch()}}},k=(S,M,B,de,ne,oe,me,H)=>{let ee,X;const{props:fe,shapeFlag:ue,transition:ye,dirs:Ie}=S;if(ee=S.el=l(S.type,oe,fe&&fe.is,fe),ue&8?d(ee,S.children):ue&16&&C(S.children,ee,null,de,ne,gr(S,oe),me,H),Ie&&ra(S,null,de,"created"),I(ee,S,S.scopeId,me,de),fe){for(const Fe in fe)Fe!=="value"&&!Oa(Fe)&&i(ee,Fe,null,fe[Fe],oe,de);"value"in fe&&i(ee,"value",null,fe.value,oe),(X=fe.onVnodeBeforeMount)&&xs(X,de,S)}Ie&&ra(S,null,de,"beforeMount");const ve=lh(ne,ye);ve&&ye.beforeEnter(ee),a(ee,M,B),((X=fe&&fe.onVnodeMounted)||ve||Ie)&&Mt(()=>{try{X&&xs(X,de,S),ve&&ye.enter(ee),Ie&&ra(S,null,de,"mounted")}finally{}},ne)},I=(S,M,B,de,ne)=>{if(B&&h(S,B),de)for(let oe=0;oe<de.length;oe++)h(S,de[oe]);if(ne){let oe=ne.subTree;if(M===oe||uo(oe.type)&&(oe.ssContent===M||oe.ssFallback===M)){const me=ne.vnode;I(S,me,me.scopeId,me.slotScopeIds,ne.parent)}}},C=(S,M,B,de,ne,oe,me,H,ee=0)=>{for(let X=ee;X<S.length;X++){const fe=S[X]=H?Sa(S[X]):ws(S[X]);v(null,fe,M,B,de,ne,oe,me,H)}},x=(S,M,B,de,ne,oe,me)=>{const H=M.el=S.el;let{patchFlag:ee,dynamicChildren:X,dirs:fe}=M;ee|=S.patchFlag&16;const ue=S.props||Ze,ye=M.props||Ze;let Ie;if(B&&rn(B,!1),(Ie=ye.onVnodeBeforeUpdate)&&xs(Ie,B,M,S),fe&&ra(M,S,B,"beforeUpdate"),B&&rn(B,!0),(ue.innerHTML&&ye.innerHTML==null||ue.textContent&&ye.textContent==null)&&d(H,""),X?N(S.dynamicChildren,X,H,B,de,gr(M,ne),oe):me||R(S,M,H,null,B,de,gr(M,ne),oe,!1),ee>0){if(ee&16)F(H,ue,ye,B,ne);else if(ee&2&&ue.class!==ye.class&&i(H,"class",null,ye.class,ne),ee&4&&i(H,"style",ue.style,ye.style,ne),ee&8){const ve=M.dynamicProps;for(let Fe=0;Fe<ve.length;Fe++){const $e=ve[Fe],ze=ue[$e],Ye=ye[$e];(Ye!==ze||$e==="value")&&i(H,$e,ze,Ye,ne,B)}}ee&1&&S.children!==M.children&&d(H,M.children)}else!me&&X==null&&F(H,ue,ye,B,ne);((Ie=ye.onVnodeUpdated)||fe)&&Mt(()=>{Ie&&xs(Ie,B,M,S),fe&&ra(M,S,B,"updated")},de)},N=(S,M,B,de,ne,oe,me)=>{for(let H=0;H<M.length;H++){const ee=S[H],X=M[H],fe=ee.el&&(ee.type===Gt||!Js(ee,X)||ee.shapeFlag&198)?u(ee.el):B;v(ee,X,fe,null,de,ne,oe,me,!0)}},F=(S,M,B,de,ne)=>{if(M!==B){if(M!==Ze)for(const oe in M)!Oa(oe)&&!(oe in B)&&i(S,oe,M[oe],null,ne,de);for(const oe in B){if(Oa(oe))continue;const me=B[oe],H=M[oe];me!==H&&oe!=="value"&&i(S,oe,H,me,ne,de)}"value"in B&&i(S,"value",M.value,B.value,ne)}},T=(S,M,B,de,ne,oe,me,H,ee)=>{const X=M.el=S?S.el:o(""),fe=M.anchor=S?S.anchor:o("");let{patchFlag:ue,dynamicChildren:ye,slotScopeIds:Ie}=M;Ie&&(H=H?H.concat(Ie):Ie),S==null?(a(X,B,de),a(fe,B,de),C(M.children||[],B,fe,ne,oe,me,H,ee)):ue>0&&ue&64&&ye&&S.dynamicChildren&&S.dynamicChildren.length===ye.length?(N(S.dynamicChildren,ye,B,ne,oe,me,H),(M.key!=null||ne&&M===ne.subTree)&&Gc(S,M,!0)):R(S,M,B,fe,ne,oe,me,H,ee)},P=(S,M,B,de,ne,oe,me,H,ee)=>{M.slotScopeIds=H,S==null?M.shapeFlag&512?ne.ctx.activate(M,B,de,me,ee):z(M,B,de,ne,oe,me,ee):G(S,M,ee)},z=(S,M,B,de,ne,oe,me)=>{const H=S.component=gh(S,de,ne);if(wl(S)&&(H.ctx.renderer=ce),yh(H,!1,me),H.asyncDep){if(ne&&ne.registerDep(H,E,me),!S.el){const ee=H.subTree=_t(Lt);A(null,ee,M,B),S.placeholder=ee.el}}else E(H,S,M,B,ne,oe,me)},G=(S,M,B)=>{const de=M.component=S.component;if(ry(S,M,B))if(de.asyncDep&&!de.asyncResolved){O(de,M,B);return}else de.next=M,de.update();else M.el=S.el,de.vnode=M},E=(S,M,B,de,ne,oe,me)=>{const H=()=>{if(S.isMounted){let{next:ue,bu:ye,u:Ie,parent:ve,vnode:Fe}=S;{const nt=oh(S);if(nt){ue&&(ue.el=Fe.el,O(S,ue,me)),nt.asyncDep.then(()=>{Mt(()=>{S.isUnmounted||X()},ne)});return}}let $e=ue,ze;rn(S,!1),ue?(ue.el=Fe.el,O(S,ue,me)):ue=Fe,ye&&ei(ye),(ze=ue.props&&ue.props.onVnodeBeforeUpdate)&&xs(ze,ve,ue,Fe),rn(S,!0);const Ye=Wl(S),at=S.subTree;S.subTree=Ye,v(at,Ye,u(at.el),ae(at),S,ne,oe),ue.el=Ye.el,$e===null&&Zo(S,Ye.el),Ie&&Mt(Ie,ne),(ze=ue.props&&ue.props.onVnodeUpdated)&&Mt(()=>xs(ze,ve,ue,Fe),ne)}else{let ue;const{el:ye,props:Ie}=M,{bm:ve,m:Fe,parent:$e,root:ze,type:Ye}=S,at=Na(M);if(rn(S,!1),ve&&ei(ve),!at&&(ue=Ie&&Ie.onVnodeBeforeMount)&&xs(ue,$e,M),rn(S,!0),ye&&Le){const nt=()=>{S.subTree=Wl(S),Le(ye,S.subTree,S,ne,null)};at&&Ye.__asyncHydrate?Ye.__asyncHydrate(ye,S,nt):nt()}else{ze.ce&&ze.ce._hasShadowRoot()&&ze.ce._injectChildStyle(Ye,S.parent?S.parent.type:void 0);const nt=S.subTree=Wl(S);v(null,nt,B,de,S,ne,oe),M.el=nt.el}if(Fe&&Mt(Fe,ne),!at&&(ue=Ie&&Ie.onVnodeMounted)){const nt=M;Mt(()=>xs(ue,$e,nt),ne)}(M.shapeFlag&256||$e&&Na($e.vnode)&&$e.vnode.shapeFlag&256)&&S.a&&Mt(S.a,ne),S.isMounted=!0,M=B=de=null}};S.scope.on();const ee=S.effect=new Zi(H);S.scope.off();const X=S.update=ee.run.bind(ee),fe=S.job=ee.runIfDirty.bind(ee);fe.i=S,fe.id=S.uid,ee.scheduler=()=>Dc(fe),rn(S,!0),X()},O=(S,M,B)=>{M.component=S;const de=S.vnode.props;S.vnode=M,S.next=null,dy(S,M.props,de,B),hy(S,M.children,B),Ma(),Hd(S),Fa()},R=(S,M,B,de,ne,oe,me,H,ee=!1)=>{const X=S&&S.children,fe=S?S.shapeFlag:0,ue=M.children,{patchFlag:ye,shapeFlag:Ie}=M;if(ye>0){if(ye&128){Q(X,ue,B,de,ne,oe,me,H,ee);return}else if(ye&256){$(X,ue,B,de,ne,oe,me,H,ee);return}}Ie&8?(fe&16&&Ne(X,ne,oe),ue!==X&&d(B,ue)):fe&16?Ie&16?Q(X,ue,B,de,ne,oe,me,H,ee):Ne(X,ne,oe,!0):(fe&8&&d(B,""),Ie&16&&C(ue,B,de,ne,oe,me,H,ee))},$=(S,M,B,de,ne,oe,me,H,ee)=>{S=S||Yn,M=M||Yn;const X=S.length,fe=M.length,ue=Math.min(X,fe);let ye;for(ye=0;ye<ue;ye++){const Ie=M[ye]=ee?Sa(M[ye]):ws(M[ye]);v(S[ye],Ie,B,null,ne,oe,me,H,ee)}X>fe?Ne(S,ne,oe,!0,!1,ue):C(M,B,de,ne,oe,me,H,ee,ue)},Q=(S,M,B,de,ne,oe,me,H,ee)=>{let X=0;const fe=M.length;let ue=S.length-1,ye=fe-1;for(;X<=ue&&X<=ye;){const Ie=S[X],ve=M[X]=ee?Sa(M[X]):ws(M[X]);if(Js(Ie,ve))v(Ie,ve,B,null,ne,oe,me,H,ee);else break;X++}for(;X<=ue&&X<=ye;){const Ie=S[ue],ve=M[ye]=ee?Sa(M[ye]):ws(M[ye]);if(Js(Ie,ve))v(Ie,ve,B,null,ne,oe,me,H,ee);else break;ue--,ye--}if(X>ue){if(X<=ye){const Ie=ye+1,ve=Ie<fe?M[Ie].el:de;for(;X<=ye;)v(null,M[X]=ee?Sa(M[X]):ws(M[X]),B,ve,ne,oe,me,H,ee),X++}}else if(X>ye)for(;X<=ue;)Z(S[X],ne,oe,!0),X++;else{const Ie=X,ve=X,Fe=new Map;for(X=ve;X<=ye;X++){const Ce=M[X]=ee?Sa(M[X]):ws(M[X]);Ce.key!=null&&Fe.set(Ce.key,X)}let $e,ze=0;const Ye=ye-ve+1;let at=!1,nt=0;const Y=new Array(Ye);for(X=0;X<Ye;X++)Y[X]=0;for(X=Ie;X<=ue;X++){const Ce=S[X];if(ze>=Ye){Z(Ce,ne,oe,!0);continue}let Oe;if(Ce.key!=null)Oe=Fe.get(Ce.key);else for($e=ve;$e<=ye;$e++)if(Y[$e-ve]===0&&Js(Ce,M[$e])){Oe=$e;break}Oe===void 0?Z(Ce,ne,oe,!0):(Y[Oe-ve]=X+1,Oe>=nt?nt=Oe:at=!0,v(Ce,M[Oe],B,null,ne,oe,me,H,ee),ze++)}const xe=at?my(Y):Yn;for($e=xe.length-1,X=Ye-1;X>=0;X--){const Ce=ve+X,Oe=M[Ce],te=M[Ce+1],Te=Ce+1<fe?te.el||rh(te):de;Y[X]===0?v(null,Oe,B,Te,ne,oe,me,H,ee):at&&($e<0||X!==xe[$e]?W(Oe,B,Te,2):$e--)}}},W=(S,M,B,de,ne=null)=>{const{el:oe,type:me,transition:H,children:ee,shapeFlag:X}=S;if(X&6){W(S.component.subTree,M,B,de);return}if(X&128){S.suspense.move(M,B,de);return}if(X&64){me.move(S,M,B,ce);return}if(me===Gt){a(oe,M,B);for(let ue=0;ue<ee.length;ue++)W(ee[ue],M,B,de);a(S.anchor,M,B);return}if(me===yn){g(S,M,B);return}if(de!==2&&X&1&&H)if(de===0)H.persisted&&!oe[Fs]?a(oe,M,B):(H.beforeEnter(oe),a(oe,M,B),Mt(()=>H.enter(oe),ne));else{const{leave:ue,delayLeave:ye,afterLeave:Ie}=H,ve=()=>{S.ctx.isUnmounted?n(oe):a(oe,M,B)},Fe=()=>{const $e=oe._isLeaving||!!oe[Fs];oe._isLeaving&&oe[Fs](!0),H.persisted&&!$e?ve():ue(oe,()=>{ve(),Ie&&Ie()})};ye?ye(oe,ve,Fe):Fe()}else a(oe,M,B)},Z=(S,M,B,de=!1,ne=!1)=>{const{type:oe,props:me,ref:H,children:ee,dynamicChildren:X,shapeFlag:fe,patchFlag:ue,dirs:ye,cacheIndex:Ie,memo:ve}=S;if(ue===-2&&(ne=!1),H!=null&&(Ma(),si(H,null,B,S,!0),Fa()),Ie!=null&&(M.renderCache[Ie]=void 0),fe&256){M.ctx.deactivate(S);return}const Fe=fe&1&&ye,$e=!Na(S);let ze;if($e&&(ze=me&&me.onVnodeBeforeUnmount)&&xs(ze,M,S),fe&6)pe(S.component,B,de);else{if(fe&128){S.suspense.unmount(B,de);return}Fe&&ra(S,null,M,"beforeUnmount"),fe&64?S.type.remove(S,M,B,ce,de):X&&!X.hasOnce&&(oe!==Gt||ue>0&&ue&64)?Ne(X,M,B,!1,!0):(oe===Gt&&ue&384||!ne&&fe&16)&&Ne(ee,M,B),de&&re(S)}const Ye=ve!=null&&Ie==null;($e&&(ze=me&&me.onVnodeUnmounted)||Fe||Ye)&&Mt(()=>{ze&&xs(ze,M,S),Fe&&ra(S,null,M,"unmounted"),Ye&&(S.el=null)},B)},re=S=>{const{type:M,el:B,anchor:de,transition:ne}=S;if(M===Gt){J(B,de);return}if(M===yn){b(S);return}const oe=()=>{n(B),ne&&!ne.persisted&&ne.afterLeave&&ne.afterLeave()};if(S.shapeFlag&1&&ne&&!ne.persisted){const{leave:me,delayLeave:H}=ne,ee=()=>me(B,oe);H?H(S.el,oe,ee):ee()}else oe()},J=(S,M)=>{let B;for(;S!==M;)B=p(S),n(S),S=B;n(M)},pe=(S,M,B)=>{const{bum:de,scope:ne,job:oe,subTree:me,um:H,m:ee,a:X}=S;co(ee),co(X),de&&ei(de),ne.stop(),oe&&(oe.flags|=8,Z(me,S,M,B)),H&&Mt(H,M),Mt(()=>{S.isUnmounted=!0},M)},Ne=(S,M,B,de=!1,ne=!1,oe=0)=>{for(let me=oe;me<S.length;me++)Z(S[me],M,B,de,ne)},ae=S=>{if(S.shapeFlag&6)return ae(S.component.subTree);if(S.shapeFlag&128)return S.suspense.next();const M=p(S.anchor||S.el),B=M&&M[If];return B?p(B):M};let be=!1;const j=(S,M,B)=>{let de;S==null?M._vnode&&(Z(M._vnode,null,null,!0),de=M._vnode.component):v(M._vnode||null,S,M,null,null,null,B),M._vnode=S,be||(be=!0,Hd(de),lo(),be=!1)},ce={p:v,um:Z,m:W,r:re,mt:z,mc:C,pc:R,pbc:N,n:ae,o:e};let he,Le;return t&&([he,Le]=t(ce)),{render:j,hydrate:he,createApp:ty(j,he)}}function gr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function rn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function lh(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function Gc(e,t,s=!1){const a=e.children,n=t.children;if(Re(a)&&Re(n))for(let i=0;i<a.length;i++){const l=a[i];let o=n[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=n[i]=Sa(n[i]),o.el=l.el),!s&&o.patchFlag!==-2&&Gc(l,o)),o.type===Xa&&(o.patchFlag===-1&&(o=n[i]=Sa(o)),o.el=l.el),o.type===Lt&&!o.el&&(o.el=l.el)}}function my(e){const t=e.slice(),s=[0];let a,n,i,l,o;const r=e.length;for(a=0;a<r;a++){const c=e[a];if(c!==0){if(n=s[s.length-1],e[n]<c){t[a]=n,s.push(a);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[a]=s[i-1]),s[i]=a)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function oh(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:oh(t)}function co(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function rh(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?rh(t.subTree):null}const uo=e=>e.__isSuspense;let Jr=0;const vy={name:"Suspense",__isSuspense:!0,process(e,t,s,a,n,i,l,o,r,c){if(e==null)by(t,s,a,n,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}yy(e,t,s,a,n,l,o,r,c)}},hydrate:xy,normalize:_y},gy=vy;function al(e,t){const s=e.props&&e.props[t];Me(s)&&s()}function by(e,t,s,a,n,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=ch(e,n,a,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,a,p,i,l),p.deps>0?(al(e,"onPending"),al(e,"onFallback"),c(null,e.ssFallback,t,s,a,null,i,l),ai(p,e.ssFallback)):p.resolve(!1,!0)}function yy(e,t,s,a,n,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:w,isHydrating:A}=u;if(v)u.pendingBranch=p,Js(v,p)?(r(v,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():w&&(A||(r(m,h,s,a,n,null,i,l,o),ai(u,h)))):(u.pendingId=Jr++,A?(u.isHydrating=!1,u.activeBranch=v):c(v,n,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),w?(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0?u.resolve():(r(m,h,s,a,n,null,i,l,o),ai(u,h))):m&&Js(m,p)?(r(m,p,s,a,n,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Js(m,p))r(m,p,s,a,n,u,i,l,o),ai(u,p);else if(al(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Jr++,r(null,p,u.hiddenContainer,null,n,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:g}=u;y>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},y):y===0&&u.fallback(h)}}function ch(e,t,s,a,n,i,l,o,r,c,d=!1){const{p:u,m:p,um:h,n:m,o:{parentNode:v,remove:w}}=c;let A;const y=wy(e);y&&t&&t.pendingBranch&&(A=t.pendingId,t.deps++);const g=e.props?to(e.props.timeout):void 0,b=i,_={vnode:e,parent:t,parentComponent:s,namespace:l,container:a,hiddenContainer:n,deps:0,pendingId:Jr++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,I=!1){const{vnode:C,activeBranch:x,pendingBranch:N,pendingId:F,effects:T,parentComponent:P,container:z,isInFallback:G}=_;let E=!1;if(_.isHydrating)_.isHydrating=!1;else if(!k){E=x&&N.transition&&N.transition.mode==="out-in";let $=!1;E&&(x.transition.afterLeave=()=>{F===_.pendingId&&(p(N,z,i===b&&!$?m(x):i,0),Xi(T),G&&C.ssFallback&&(C.ssFallback.el=null))}),x&&!_.isFallbackMountPending&&(v(x.el)===z&&(i=m(x),$=!0),h(x,P,_,!0),!E&&G&&C.ssFallback&&Mt(()=>C.ssFallback.el=null,_)),E||p(N,z,i,0)}_.isFallbackMountPending=!1,ai(_,N),_.pendingBranch=null,_.isInFallback=!1;let O=_.parent,R=!1;for(;O;){if(O.pendingBranch){O.effects.push(...T),R=!0;break}O=O.parent}!R&&!E&&Xi(T),_.effects=[],y&&t&&t.pendingBranch&&A===t.pendingId&&(t.deps--,t.deps===0&&!I&&t.resolve()),al(C,"onResolve")},fallback(k){if(!_.pendingBranch)return;const{vnode:I,activeBranch:C,parentComponent:x,container:N,namespace:F}=_;al(I,"onFallback");const T=m(C),P=()=>{_.isFallbackMountPending=!1,_.isInFallback&&(u(null,k,N,T,x,null,F,o,r),ai(_,k))},z=k.transition&&k.transition.mode==="out-in";z&&(_.isFallbackMountPending=!0,C.transition.afterLeave=P),_.isInFallback=!0,h(C,x,null,!0),z||P()},move(k,I,C){_.activeBranch&&p(_.activeBranch,k,I,C),_.container=k},next(){return _.activeBranch&&m(_.activeBranch)},registerDep(k,I,C){const x=!!_.pendingBranch;x&&_.deps++;const N=k.vnode.el;k.asyncDep.catch(F=>{Rn(F,k,0)}).then(F=>{if(k.isUnmounted||_.isUnmounted||_.pendingId!==k.suspenseId)return;ll(),k.asyncResolved=!0;const{vnode:T}=k;Zr(k,F,!1),N&&(T.el=N);const P=!N&&k.subTree.el;I(k,T,v(N||k.subTree.el),N?null:m(k.subTree),_,l,C),P&&(T.placeholder=null,w(P)),Zo(k,T.el),x&&--_.deps===0&&_.resolve()})},unmount(k,I){_.isUnmounted=!0,_.activeBranch&&h(_.activeBranch,s,k,I),_.pendingBranch&&h(_.pendingBranch,s,k,I)}};return _}function xy(e,t,s,a,n,i,l,o,r){const c=t.suspense=ch(t,a,s,e.parentNode,document.createElement("div"),null,n,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function _y(e){const{shapeFlag:t,children:s}=e,a=t&32;e.ssContent=tu(a?s.default:s),e.ssFallback=a?tu(s.fallback):_t(Lt)}function tu(e){let t;if(Me(e)){const s=wn&&e._c;s&&(e._d=!1,nl()),e=e(),s&&(e._d=!0,t=is,uh())}return Re(e)&&(e=iy(e)),e=ws(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function dh(e,t){t&&t.pendingBranch?Re(e)?t.effects.push(...e):t.effects.push(e):Xi(e)}function ai(e,t){e.activeBranch=t;const{vnode:s,parentComponent:a}=e;let n=t.el;for(;!n&&t.component;)t=t.component.subTree,n=t.el;s.el=n,a&&a.subTree===s&&(a.vnode.el=n,Zo(a,n))}function wy(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Gt=Symbol.for("v-fgt"),Xa=Symbol.for("v-txt"),Lt=Symbol.for("v-cmt"),yn=Symbol.for("v-stc"),Vi=[];let is=null;function nl(e=!1){Vi.push(is=e?null:[])}function uh(){Vi.pop(),is=Vi[Vi.length-1]||null}let wn=1;function il(e,t=!1){wn+=e,e<0&&is&&t&&(is.hasOnce=!0)}function ph(e){return e.dynamicChildren=wn>0?is||Yn:null,uh(),wn>0&&is&&is.push(e),e}function ky(e,t,s,a,n,i){return ph(Kc(e,t,s,a,n,i,!0))}function po(e,t,s,a,n){return ph(_t(e,t,s,a,n,!0))}function Ua(e){return e?e.__v_isVNode===!0:!1}function Js(e,t){return e.type===t.type&&e.key===t.key}function Sy(e){}const fh=({key:e})=>e??null,Jl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?He(e)||$t(e)||Me(e)?{i:Qt,r:e,k:t,f:!!s}:e:null);function Kc(e,t=null,s=null,a=0,n=null,i=e===Gt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&fh(t),ref:t&&Jl(t),scopeId:Vo,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:a,dynamicProps:n,dynamicChildren:null,appContext:null,ctx:Qt};return o?(Jc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=He(s)?8:16),wn>0&&!l&&is&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&is.push(r),r}const _t=Ty;function Ty(e,t=null,s=null,a=0,n=null,i=!1){if((!e||e===zf)&&(e=Lt),Ua(e)){const o=pa(e,t,!0);return s&&Jc(o,s),wn>0&&!i&&is&&(o.shapeFlag&6?is[is.indexOf(e)]=o:is.push(o)),o.patchFlag=-2,o}if(Ly(e)&&(e=e.__vccOpts),t){t=hh(t);let{class:o,style:r}=t;o&&!He(o)&&(t.class=bl(o)),ot(r)&&(yl(r)&&!Re(r)&&(r=Je({},r)),t.style=gl(r))}const l=He(e)?1:uo(e)?128:Of(e)?64:ot(e)?4:Me(e)?2:0;return Kc(e,t,s,a,n,l,i,!0)}function hh(e){return e?yl(e)||Yf(e)?Je({},e):e:null}function pa(e,t,s=!1,a=!1){const{props:n,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?vh(n||{},t):n,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&fh(c),ref:t&&t.ref?s&&i?Re(i)?i.concat(Jl(t)):[i,Jl(t)]:Jl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Gt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&pa(e.ssContent),ssFallback:e.ssFallback&&pa(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&a&&$a(d,r.clone(d)),d}function Wc(e=" ",t=0){return _t(Xa,null,e,t)}function Cy(e,t){const s=_t(yn,null,e);return s.staticCount=t,s}function mh(e="",t=!1){return t?(nl(),po(Lt,null,e)):_t(Lt,null,e)}function ws(e){return e==null||typeof e=="boolean"?_t(Lt):Re(e)?_t(Gt,null,e.slice()):Ua(e)?Sa(e):_t(Xa,null,String(e))}function Sa(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:pa(e)}function Jc(e,t){let s=0;const{shapeFlag:a}=e;if(t==null)t=null;else if(Re(t))s=16;else if(typeof t=="object")if(a&65){const n=t.default;n&&(n._c&&(n._d=!1),Jc(e,n()),n._c&&(n._d=!0));return}else{s=32;const n=t._;!n&&!Yf(t)?t._ctx=Qt:n===3&&Qt&&(Qt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Me(t)?(t={default:t,_ctx:Qt},s=32):(t=String(t),a&64?(s=16,t=[Wc(t)]):s=8);e.children=t,e.shapeFlag|=s}function vh(...e){const t={};for(let s=0;s<e.length;s++){const a=e[s];for(const n in a)if(n==="class")t.class!==a.class&&(t.class=bl([t.class,a.class]));else if(n==="style")t.style=gl([t.style,a.style]);else if(Cn(n)){const i=t[n],l=a[n];l&&i!==l&&!(Re(i)&&i.includes(l))?t[n]=i?[].concat(i,l):l:l==null&&i==null&&!No(n)&&(t[n]=l)}else n!==""&&(t[n]=a[n])}return t}function xs(e,t,s,a=null){Os(e,t,7,[s,a])}const Ey=qf();let Ay=0;function gh(e,t,s){const a=e.type,n=(t?t.appContext:e.appContext)||Ey,i={uid:Ay++,vnode:e,type:a,parent:t,appContext:n,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Ec(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(n.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:Xf(a,n),emitsOptions:Kf(a,n),emit:null,emitted:null,propsDefaults:Ze,inheritAttrs:a.inheritAttrs,ctx:Ze,data:Ze,props:Ze,attrs:Ze,slots:Ze,refs:Ze,setupState:Ze,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ay.bind(null,i),e.ce&&e.ce(i),i}let Yt=null;const fs=()=>Yt||Qt;let fo,ni;{const e=$o(),t=(s,a)=>{let n;return(n=e[s])||(n=e[s]=[]),n.push(a),i=>{n.length>1?n.forEach(l=>l(i)):n[0](i)}};fo=t("__VUE_INSTANCE_SETTERS__",s=>Yt=s),ni=t("__VUE_SSR_SETTERS__",s=>kn=s)}const _i=e=>{const t=Yt;return fo(e),e.scope.on(),()=>{e.scope.off(),fo(t)}},ll=()=>{Yt&&Yt.scope.off(),fo(null)};function bh(e){return e.vnode.shapeFlag&4}let kn=!1;function yh(e,t=!1,s=!1){t&&ni(t);const{props:a,children:n}=e.vnode,i=bh(e);cy(e,a,i,t),fy(e,n,s||t);const l=i?Ry(e,t):void 0;return t&&ni(!1),l}function Ry(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,qr);const{setup:a}=s;if(a){Ma();const n=e.setupContext=a.length>1?wh(e):null,i=_i(e),l=xi(a,e,0,[e.props,n]),o=Cc(l);if(Fa(),i(),(o||e.sp)&&!Na(e)&&$c(e),o){if(l.then(ll,ll),t)return l.then(r=>{Zr(e,r,t)}).catch(r=>{Rn(r,e,0)});e.asyncDep=l}else Zr(e,l,t)}else _h(e,t)}function Zr(e,t,s){Me(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:ot(t)&&(e.setupState=Nc(t)),_h(e,s)}let ho,Yr;function xh(e){ho=e,Yr=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Pb))}}const Iy=()=>!ho;function _h(e,t,s){const a=e.type;if(!e.render){if(!t&&ho&&!a.render){const n=a.template||jc(e).template;if(n){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=a,c=Je(Je({isCustomElement:i,delimiters:o},l),r);a.render=ho(n,c)}}e.render=a.render||Xt,Yr&&Yr(e)}{const n=_i(e);Ma();try{Jb(e)}finally{Fa(),n()}}}const Oy={get(e,t){return ns(e,"get",""),e[t]}};function wh(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Oy),slots:e.slots,emit:e.emit,expose:t}}function kl(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Nc(vf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ji)return ji[s](e)},has(t,s){return s in t||s in ji}})):e.proxy}function Qr(e,t=!0){return Me(e)?e.displayName||e.name:e.name||t&&e.__name}function Ly(e){return Me(e)&&"__vccOpts"in e}const q=(e,t)=>$g(e,t,kn);function ci(e,t,s){try{il(-1);const a=arguments.length;return a===2?ot(t)&&!Re(t)?Ua(t)?_t(e,null,[t]):_t(e,t):_t(e,null,t):(a>3?s=Array.prototype.slice.call(arguments,2):a===3&&Ua(s)&&(s=[s]),_t(e,t,s))}finally{il(1)}}function Ny(){}function Dy(e,t,s,a){const n=s[a];if(n&&kh(n,e))return n;const i=t();return i.memo=e.slice(),i.cacheIndex=a,s[a]=i}function kh(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let a=0;a<s.length;a++)if(qt(s[a],t[a]))return!1;return wn>0&&is&&is.push(e),!0}const Sh="3.5.38",Py=Xt,My=Kg,Fy=qn,$y=Tf,Uy={createComponentInstance:gh,setupComponent:yh,renderComponentRoot:Wl,setCurrentRenderingInstance:tl,isVNode:Ua,normalizeVNode:ws,getComponentPublicInstance:kl,ensureValidVNode:zc,pushWarningContext:jg,popWarningContext:Vg},By=Uy,Hy=null,zy=null,jy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Xr;const su=typeof window<"u"&&window.trustedTypes;if(su)try{Xr=su.createPolicy("vue",{createHTML:e=>e})}catch{}const Th=Xr?e=>Xr.createHTML(e):e=>e,Vy="http://www.w3.org/2000/svg",qy="http://www.w3.org/1998/Math/MathML",ka=typeof document<"u"?document:null,au=ka&&ka.createElement("template"),Ch={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,a)=>{const n=t==="svg"?ka.createElementNS(Vy,e):t==="mathml"?ka.createElementNS(qy,e):s?ka.createElement(e,{is:s}):ka.createElement(e);return e==="select"&&a&&a.multiple!=null&&n.setAttribute("multiple",a.multiple),n},createText:e=>ka.createTextNode(e),createComment:e=>ka.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>ka.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,a,n,i){const l=s?s.previousSibling:t.lastChild;if(n&&(n===i||n.nextSibling))for(;t.insertBefore(n.cloneNode(!0),s),!(n===i||!(n=n.nextSibling)););else{au.innerHTML=Th(a==="svg"?`<svg>${e}</svg>`:a==="mathml"?`<math>${e}</math>`:e);const o=au.content;if(a==="svg"||a==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},ja="transition",Ci="animation",di=Symbol("_vtc"),Eh={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Ah=Je({},Fc,Eh),Gy=e=>(e.displayName="Transition",e.props=Ah,e),Ky=Gy((e,{slots:t})=>ci(Df,Rh(e),t)),cn=(e,t=[])=>{Re(e)?e.forEach(s=>s(...t)):e&&e(...t)},nu=e=>e?Re(e)?e.some(t=>t.length>1):e.length>1:!1;function Rh(e){const t={};for(const T in e)T in Eh||(t[T]=e[T]);if(e.css===!1)return t;const{name:s="v",type:a,duration:n,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,m=Wy(n),v=m&&m[0],w=m&&m[1],{onBeforeEnter:A,onEnter:y,onEnterCancelled:g,onLeave:b,onLeaveCancelled:_,onBeforeAppear:k=A,onAppear:I=y,onAppearCancelled:C=g}=t,x=(T,P,z,G)=>{T._enterCancelled=G,Ka(T,P?d:o),Ka(T,P?c:l),z&&z()},N=(T,P)=>{T._isLeaving=!1,Ka(T,u),Ka(T,h),Ka(T,p),P&&P()},F=T=>(P,z)=>{const G=T?I:y,E=()=>x(P,T,z);cn(G,[P,E]),iu(()=>{Ka(P,T?r:i),na(P,T?d:o),nu(G)||lu(P,a,v,E)})};return Je(t,{onBeforeEnter(T){cn(A,[T]),na(T,i),na(T,l)},onBeforeAppear(T){cn(k,[T]),na(T,r),na(T,c)},onEnter:F(!1),onAppear:F(!0),onLeave(T,P){T._isLeaving=!0;const z=()=>N(T,P);na(T,u),T._enterCancelled?(na(T,p),ec(T)):(ec(T),na(T,p)),iu(()=>{T._isLeaving&&(Ka(T,u),na(T,h),nu(b)||lu(T,a,w,z))}),cn(b,[T,z])},onEnterCancelled(T){x(T,!1,void 0,!0),cn(g,[T])},onAppearCancelled(T){x(T,!0,void 0,!0),cn(C,[T])},onLeaveCancelled(T){N(T),cn(_,[T])}})}function Wy(e){if(e==null)return null;if(ot(e))return[br(e.enter),br(e.leave)];{const t=br(e);return[t,t]}}function br(e){return to(e)}function na(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[di]||(e[di]=new Set)).add(t)}function Ka(e,t){t.split(/\s+/).forEach(a=>a&&e.classList.remove(a));const s=e[di];s&&(s.delete(t),s.size||(e[di]=void 0))}function iu(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let Jy=0;function lu(e,t,s,a){const n=e._endId=++Jy,i=()=>{n===e._endId&&a()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Ih(e,t);if(!l)return a();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Ih(e,t){const s=window.getComputedStyle(e),a=m=>(s[m]||"").split(", "),n=a(`${ja}Delay`),i=a(`${ja}Duration`),l=ou(n,i),o=a(`${Ci}Delay`),r=a(`${Ci}Duration`),c=ou(o,r);let d=null,u=0,p=0;t===ja?l>0&&(d=ja,u=l,p=i.length):t===Ci?c>0&&(d=Ci,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?ja:Ci:null,p=d?d===ja?i.length:r.length:0);const h=d===ja&&/\b(?:transform|all)(?:,|$)/.test(a(`${ja}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function ou(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,a)=>ru(s)+ru(e[a])))}function ru(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function ec(e){return(e?e.ownerDocument:document).body.offsetHeight}function Zy(e,t,s){const a=e[di];a&&(t=(t?[t,...a]:[...a]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const mo=Symbol("_vod"),Zc=Symbol("_vsh"),Oh={name:"show",beforeMount(e,{value:t},{transition:s}){e[mo]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ei(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:a}){!t!=!s&&(a?t?(a.beforeEnter(e),Ei(e,!0),a.enter(e)):a.leave(e,()=>{Ei(e,!1)}):Ei(e,t))},beforeUnmount(e,{value:t}){Ei(e,t)}};function Ei(e,t){e.style.display=t?e[mo]:"none",e[Zc]=!t}function Yy(){Oh.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Lh=Symbol("");function Qy(e){const t=fs();if(!t)return;const s=t.ut=(n=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>vo(i,n))},a=()=>{const n=e(t.proxy);t.ce?vo(t.ce,n):tc(t.subTree,n),s(n)};Uc(()=>{Xi(a)}),Ge(()=>{Ut(a,Xt,{flush:"post"});const n=new MutationObserver(a);n.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>n.disconnect())})}function tc(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{tc(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)vo(e.el,t);else if(e.type===Gt)e.children.forEach(s=>tc(s,t));else if(e.type===yn){let{el:s,anchor:a}=e;for(;s&&(vo(s,t),s!==a);)s=s.nextSibling}}function vo(e,t){if(e.nodeType===1){const s=e.style;let a="";for(const n in t){const i=ng(t[n]);s.setProperty(`--${n}`,i),a+=`--${n}: ${i};`}s[Lh]=a}}const Xy=/(?:^|;)\s*display\s*:/;function ex(e,t,s){const a=e.style,n=He(s);let i=!1;if(s&&!n){if(t)if(He(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&$i(a,o,"")}else for(const l in t)s[l]==null&&$i(a,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?sx(e,l,!He(t)&&t?t[l]:void 0,o)||$i(a,l,o):$i(a,l,"")}}else if(n){if(t!==s){const l=a[Lh];l&&(s+=";"+l),a.cssText=s,i=Xy.test(s)}}else t&&e.removeAttribute("style");mo in e&&(e[mo]=i?a.display:"",e[Zc]&&(a.display="none"))}const cu=/\s*!important$/;function $i(e,t,s){if(Re(s))s.forEach(a=>$i(e,t,a));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const a=tx(e,t);cu.test(s)?e.setProperty(ks(a),s.replace(cu,""),"important"):e[a]=s}}const du=["Webkit","Moz","ms"],yr={};function tx(e,t){const s=yr[t];if(s)return s;let a=ht(t);if(a!=="filter"&&a in e)return yr[t]=a;a=An(a);for(let n=0;n<du.length;n++){const i=du[n]+a;if(i in e)return yr[t]=i}return t}function sx(e,t,s,a){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&He(a)&&s===a}const uu="http://www.w3.org/1999/xlink";function pu(e,t,s,a,n,i=sg(t)){a&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(uu,t.slice(6,t.length)):e.setAttributeNS(uu,t,s):s==null||i&&!Jp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":os(s)?String(s):s)}function fu(e,t,s,a,n){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Th(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=Jp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(n||t)}function Aa(e,t,s,a){e.addEventListener(t,s,a)}function ax(e,t,s,a){e.removeEventListener(t,s,a)}const hu=Symbol("_vei");function nx(e,t,s,a,n=null){const i=e[hu]||(e[hu]={}),l=i[t];if(a&&l)l.value=a;else{const[o,r]=ix(t);if(a){const c=i[t]=rx(a,n);Aa(e,o,c,r)}else l&&(ax(e,o,l,r),i[t]=void 0)}}const mu=/(?:Once|Passive|Capture)$/;function ix(e){let t;if(mu.test(e)){t={};let a;for(;a=e.match(mu);)e=e.slice(0,e.length-a[0].length),t[a[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):ks(e.slice(2)),t]}let xr=0;const lx=Promise.resolve(),ox=()=>xr||(lx.then(()=>xr=0),xr=Date.now());function rx(e,t){const s=a=>{if(!a._vts)a._vts=Date.now();else if(a._vts<=s.attached)return;const n=s.value;if(Re(n)){const i=a.stopImmediatePropagation;a.stopImmediatePropagation=()=>{i.call(a),a._stopped=!0};const l=n.slice(),o=[a];for(let r=0;r<l.length&&!a._stopped;r++){const c=l[r];c&&Os(c,t,5,o)}}else Os(n,t,5,[a])};return s.value=e,s.attached=ox(),s}const vu=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Nh=(e,t,s,a,n,i)=>{const l=n==="svg";t==="class"?Zy(e,a,l):t==="style"?ex(e,s,a):Cn(t)?No(t)||nx(e,t,s,a,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):cx(e,t,a,l))?(fu(e,t,a),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&pu(e,t,a,l,i,t!=="value")):e._isVueCE&&(dx(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!He(a)))?fu(e,ht(t),a,i,t):(t==="true-value"?e._trueValue=a:t==="false-value"&&(e._falseValue=a),pu(e,t,a,l))};function cx(e,t,s,a){if(a)return!!(t==="innerHTML"||t==="textContent"||t in e&&vu(t)&&Me(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const n=e.tagName;if(n==="IMG"||n==="VIDEO"||n==="CANVAS"||n==="SOURCE")return!1}return vu(t)&&He(s)?!1:t in e}function dx(e,t){const s=e._def.props;if(!s)return!1;const a=ht(t);return Array.isArray(s)?s.some(n=>ht(n)===a):Object.keys(s).some(n=>ht(n)===a)}const gu={};function Dh(e,t,s){let a=_l(e,t);Do(a)&&(a=Je({},a,t));class n extends Yo{constructor(l){super(a,l,s)}}return n.def=a,n}const ux=((e,t)=>Dh(e,t,Kh)),px=typeof HTMLElement<"u"?HTMLElement:class{};class Yo extends px{constructor(t,s={},a=yo){super(),this._def=t,this._props=s,this._createApp=a,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&a!==yo?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Je({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Yo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ot(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let a=0;a<this.attributes.length;a++)this._setAttr(this.attributes[a].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(a,n=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=a;let o;if(i&&!Re(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=to(this._props[r])),(o||(o=Object.create(null)))[ht(r)]=!0)}this._numberProps=o,this._resolveProps(a),this.shadowRoot&&this._applyStyles(l),this._mount(a)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(a=>{a.configureApp=this._def.configureApp,t(this._def=a,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const a in s)rt(this,a)||Object.defineProperty(this,a,{get:()=>da(s[a])})}_resolveProps(t){const{props:s}=t,a=Re(s)?s:Object.keys(s||{});for(const n of Object.keys(this))n[0]!=="_"&&a.includes(n)&&this._setProp(n,this[n]);for(const n of a.map(ht))Object.defineProperty(this,n,{get(){return this._getProp(n)},set(i){this._setProp(n,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let a=s?this.getAttribute(t):gu;const n=ht(t);s&&this._numberProps&&this._numberProps[n]&&(a=to(a)),this._setProp(n,a,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,a=!0,n=!1){if(s!==this._props[t]&&(this._dirty=!0,s===gu?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),n&&this._instance&&this._update(),a)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(ks(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(ks(t),s+""):s||this.removeAttribute(ks(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),Gh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=_t(this._def,Je(t,this._props));return this._instance||(s.ce=a=>{this._instance=a,a.ce=this,a.isCE=!0;const n=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Do(l[0])?Je({detail:l},l[0]):{detail:l}))};a.emit=(i,...l)=>{n(i,l),ks(i)!==i&&n(ks(i),l)},this._setParent()}),s}_applyStyles(t,s,a){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const n=this._nonce,i=this.shadowRoot,l=a?this._getStyleAnchor(a)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");n&&c.setAttribute("nonce",n),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(a||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const a=t.childNodes[s];if(!(a instanceof HTMLStyleElement))return a}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const a=s.nodeType===1&&s.getAttribute("slot")||"default";(t[a]||(t[a]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let a=0;a<t.length;a++){const n=t[a],i=n.getAttribute("name")||"default",l=this._slots[i],o=n.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,n)}else for(;n.firstChild;)o.insertBefore(n.firstChild,n);o.removeChild(n)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const a of t){const n=a.querySelectorAll("slot");for(let i=0;i<n.length;i++)s.add(n[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Ph(e){const t=fs(),s=t&&t.ce;return s||null}function fx(){const e=Ph();return e&&e.shadowRoot}function hx(e="$style"){{const t=fs();if(!t)return Ze;const s=t.type.__cssModules;if(!s)return Ze;const a=s[e];return a||Ze}}const Mh=new WeakMap,Fh=new WeakMap,go=Symbol("_moveCb"),bu=Symbol("_enterCb"),mx=e=>(delete e.props.mode,e),vx=mx({name:"TransitionGroup",props:Je({},Ah,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=fs(),a=Mc();let n,i;return Ko(()=>{if(!n.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!_x(n[0].el,s.vnode.el,l)){n=[];return}n.forEach(bx),n.forEach(yx);const o=n.filter(xx);ec(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;na(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[go]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[go]=null,Ka(c,l))};c.addEventListener("transitionend",u)}),n=[]}),()=>{const l=tt(e),o=Rh(l);let r=l.tag||Gt;if(n=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Zc]&&(n.push(d),$a(d,ri(d,o,a,s)),Mh.set(d,$h(d.el)))}i=t.default?qo(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&$a(d,ri(d,o,a,s))}return _t(r,null,i)}}}),gx=vx;function bx(e){const t=e.el;t[go]&&t[go](),t[bu]&&t[bu]()}function yx(e){Fh.set(e,$h(e.el))}function xx(e){const t=Mh.get(e),s=Fh.get(e),a=t.left-s.left,n=t.top-s.top;if(a||n){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${a/r}px,${n/c}px)`,l.transitionDuration="0s",e}}function $h(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function _x(e,t,s){const a=e.cloneNode(),n=e[di];n&&n.forEach(o=>{o.split(/\s+/).forEach(r=>r&&a.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&a.classList.add(o)),a.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(a);const{hasTransform:l}=Ih(a);return i.removeChild(a),l}const tn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Re(t)?s=>ei(t,s):t};function wx(e){e.target.composing=!0}function yu(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const zs=Symbol("_assign");function xu(e,t,s){return t&&(e=e.trim()),s&&(e=Fo(e)),e}const bo={created(e,{modifiers:{lazy:t,trim:s,number:a}},n){e[zs]=tn(n);const i=a||n.props&&n.props.type==="number";Aa(e,t?"change":"input",l=>{l.target.composing||e[zs](xu(e.value,s,i))}),(s||i)&&Aa(e,"change",()=>{e.value=xu(e.value,s,i)}),t||(Aa(e,"compositionstart",wx),Aa(e,"compositionend",yu),Aa(e,"change",yu))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:a,trim:n,number:i}},l){if(e[zs]=tn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?Fo(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(a&&t===s||n&&e.value.trim()===r)||(e.value=r)}},Yc={deep:!0,created(e,t,s){e[zs]=tn(s),Aa(e,"change",()=>{const a=e._modelValue,n=ui(e),i=e.checked,l=e[zs];if(Re(a)){const o=Uo(a,n),r=o!==-1;if(i&&!r)l(a.concat(n));else if(!i&&r){const c=[...a];c.splice(o,1),l(c)}}else if(En(a)){const o=new Set(a);i?o.add(n):o.delete(n),l(o)}else l(Bh(e,i))})},mounted:_u,beforeUpdate(e,t,s){e[zs]=tn(s),_u(e,t,s)}};function _u(e,{value:t,oldValue:s},a){e._modelValue=t;let n;if(Re(t))n=Uo(t,a.props.value)>-1;else if(En(t))n=t.has(a.props.value);else{if(t===s)return;n=Pa(t,Bh(e,!0))}e.checked!==n&&(e.checked=n)}const Qc={created(e,{value:t},s){e.checked=Pa(t,s.props.value),e[zs]=tn(s),Aa(e,"change",()=>{e[zs](ui(e))})},beforeUpdate(e,{value:t,oldValue:s},a){e[zs]=tn(a),t!==s&&(e.checked=Pa(t,a.props.value))}},Uh={deep:!0,created(e,{value:t,modifiers:{number:s}},a){const n=En(t);Aa(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Fo(ui(l)):ui(l));e[zs](e.multiple?n?new Set(i):i:i[0]),e._assigning=!0,Ot(()=>{e._assigning=!1})}),e[zs]=tn(a)},mounted(e,{value:t}){wu(e,t)},beforeUpdate(e,t,s){e[zs]=tn(s)},updated(e,{value:t}){e._assigning||wu(e,t)}};function wu(e,t){const s=e.multiple,a=Re(t);if(!(s&&!a&&!En(t))){for(let n=0,i=e.options.length;n<i;n++){const l=e.options[n],o=ui(l);if(s)if(a){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=Uo(t,o)>-1}else l.selected=t.has(o);else if(Pa(ui(l),t)){e.selectedIndex!==n&&(e.selectedIndex=n);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function ui(e){return"_value"in e?e._value:e.value}function Bh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Hh={created(e,t,s){$l(e,t,s,null,"created")},mounted(e,t,s){$l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,a){$l(e,t,s,a,"beforeUpdate")},updated(e,t,s,a){$l(e,t,s,a,"updated")}};function zh(e,t){switch(e){case"SELECT":return Uh;case"TEXTAREA":return bo;default:switch(t){case"checkbox":return Yc;case"radio":return Qc;default:return bo}}}function $l(e,t,s,a,n){const l=zh(e.tagName,s.props&&s.props.type)[n];l&&l(e,t,s,a)}function kx(){bo.getSSRProps=({value:e})=>({value:e}),Qc.getSSRProps=({value:e},t)=>{if(t.props&&Pa(t.props.value,e))return{checked:!0}},Yc.getSSRProps=({value:e},t)=>{if(Re(e)){if(t.props&&Uo(e,t.props.value)>-1)return{checked:!0}}else if(En(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Hh.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=zh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Sx=["ctrl","shift","alt","meta"],Tx={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Sx.some(s=>e[`${s}Key`]&&!t.includes(s))},Cx=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),a=t.join(".");return s[a]||(s[a]=((n,...i)=>{for(let l=0;l<t.length;l++){const o=Tx[t[l]];if(o&&o(n,t))return}return e(n,...i)}))},Ex={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Ax=(e,t)=>{const s=e._withKeys||(e._withKeys={}),a=t.join(".");return s[a]||(s[a]=(n=>{if(!("key"in n))return;const i=ks(n.key);if(t.some(l=>l===i||Ex[l]===i))return e(n)}))},jh=Je({patchProp:Nh},Ch);let qi,ku=!1;function Vh(){return qi||(qi=ah(jh))}function qh(){return qi=ku?qi:nh(jh),ku=!0,qi}const Gh=((...e)=>{Vh().render(...e)}),Rx=((...e)=>{qh().hydrate(...e)}),yo=((...e)=>{const t=Vh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Jh(a);if(!n)return;const i=t._component;!Me(i)&&!i.render&&!i.template&&(i.template=n.innerHTML),n.nodeType===1&&(n.textContent="");const l=s(n,!1,Wh(n));return n instanceof Element&&(n.removeAttribute("v-cloak"),n.setAttribute("data-v-app","")),l},t}),Kh=((...e)=>{const t=qh().createApp(...e),{mount:s}=t;return t.mount=a=>{const n=Jh(a);if(n)return s(n,!0,Wh(n))},t});function Wh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function Jh(e){return He(e)?document.querySelector(e):e}let Su=!1;const Ix=()=>{Su||(Su=!0,kx(),Yy())},Ox=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Df,BaseTransitionPropsValidators:Fc,Comment:Lt,DeprecationTypes:jy,EffectScope:Ec,ErrorCodes:Gg,ErrorTypeStrings:My,Fragment:Gt,KeepAlive:Tb,ReactiveEffect:Zi,Static:yn,Suspense:gy,Teleport:ob,Text:Xa,TrackOpTypes:Ug,Transition:Ky,TransitionGroup:gx,TriggerOpTypes:Bg,VueElement:Yo,assertNumber:qg,callWithAsyncErrorHandling:Os,callWithErrorHandling:xi,camelize:ht,capitalize:An,cloneVNode:pa,compatUtils:zy,computed:q,createApp:yo,createBlock:po,createCommentVNode:mh,createElementBlock:ky,createElementVNode:Kc,createHydrationRenderer:nh,createPropsRestProxy:Kb,createRenderer:ah,createSSRApp:Kh,createSlots:Lb,createStaticVNode:Cy,createTextVNode:Wc,createVNode:_t,customRef:bf,defineAsyncComponent:kb,defineComponent:_l,defineCustomElement:Dh,defineEmits:Fb,defineExpose:$b,defineModel:Hb,defineOptions:Ub,defineProps:Mb,defineSSRCustomElement:ux,defineSlots:Bb,devtools:Fy,effect:rg,effectScope:ig,getCurrentInstance:fs,getCurrentScope:Xp,getCurrentWatcher:Hg,getTransitionRawChildren:qo,guardReactiveProps:hh,h:ci,handleError:Rn,hasInjectionContext:eb,hydrate:Rx,hydrateOnIdle:gb,hydrateOnInteraction:_b,hydrateOnMediaQuery:xb,hydrateOnVisible:yb,initCustomFormatter:Ny,initDirectivesForSSR:Ix,inject:Hs,isMemoSame:kh,isProxy:yl,isReactive:La,isReadonly:ua,isRef:$t,isRuntimeOnly:Iy,isShallow:Ts,isVNode:Ua,markRaw:vf,mergeDefaults:qb,mergeModels:Gb,mergeProps:vh,nextTick:Ot,nodeOps:Ch,normalizeClass:bl,normalizeProps:Gv,normalizeStyle:gl,onActivated:es,onBeforeMount:Ff,onBeforeUnmount:Wo,onBeforeUpdate:Uc,onDeactivated:Wt,onErrorCaptured:Hf,onMounted:Ge,onRenderTracked:Bf,onRenderTriggered:Uf,onScopeDispose:lg,onServerPrefetch:$f,onUnmounted:mt,onUpdated:Ko,onWatcherCleanup:xf,openBlock:nl,patchProp:Nh,popScopeId:Yg,provide:zi,proxyRefs:Nc,pushScopeId:Zg,queuePostFlushCb:Xi,reactive:sn,readonly:ao,ref:f,registerRuntimeCompiler:xh,render:Gh,renderList:Ob,renderSlot:Nb,resolveComponent:Ab,resolveDirective:Ib,resolveDynamicComponent:Rb,resolveFilter:Hy,resolveTransitionHooks:ri,setBlockTracking:il,setDevtoolsHook:$y,setTransitionHooks:$a,shallowReactive:Oc,shallowReadonly:Eg,shallowRef:Lc,ssrContextKey:Cf,ssrUtils:By,stop:cg,toDisplayString:Yp,toHandlerKey:Xn,toHandlers:Db,toRaw:tt,toRef:Mg,toRefs:Ng,toValue:Ig,transformVNodeArgs:Sy,triggerRef:Rg,unref:da,useAttrs:Vb,useCssModule:hx,useCssVars:Qy,useHost:Ph,useId:cb,useModel:sy,useSSRContext:Ef,useShadowRoot:fx,useSlots:jb,useTemplateRef:db,useTransitionState:Mc,vModelCheckbox:Yc,vModelDynamic:Hh,vModelRadio:Qc,vModelSelect:Uh,vModelText:bo,vShow:Oh,version:Sh,warn:Py,watch:Ut,watchEffect:tb,watchPostEffect:sb,watchSyncEffect:Af,withAsyncContext:Wb,withCtx:Pc,withDefaults:zb,withDirectives:Xg,withKeys:Ax,withMemo:Dy,withModifiers:Cx,withScopeId:Qg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ol=Symbol(""),Gi=Symbol(""),Xc=Symbol(""),xo=Symbol(""),Zh=Symbol(""),Sn=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),ed=Symbol(""),td=Symbol(""),Sl=Symbol(""),sd=Symbol(""),Xh=Symbol(""),ad=Symbol(""),nd=Symbol(""),id=Symbol(""),ld=Symbol(""),od=Symbol(""),rd=Symbol(""),em=Symbol(""),tm=Symbol(""),Qo=Symbol(""),_o=Symbol(""),cd=Symbol(""),dd=Symbol(""),rl=Symbol(""),Tl=Symbol(""),ud=Symbol(""),sc=Symbol(""),Lx=Symbol(""),ac=Symbol(""),wo=Symbol(""),Nx=Symbol(""),Dx=Symbol(""),pd=Symbol(""),Px=Symbol(""),Mx=Symbol(""),fd=Symbol(""),sm=Symbol(""),pi={[ol]:"Fragment",[Gi]:"Teleport",[Xc]:"Suspense",[xo]:"KeepAlive",[Zh]:"BaseTransition",[Sn]:"openBlock",[Yh]:"createBlock",[Qh]:"createElementBlock",[ed]:"createVNode",[td]:"createElementVNode",[Sl]:"createCommentVNode",[sd]:"createTextVNode",[Xh]:"createStaticVNode",[ad]:"resolveComponent",[nd]:"resolveDynamicComponent",[id]:"resolveDirective",[ld]:"resolveFilter",[od]:"withDirectives",[rd]:"renderList",[em]:"renderSlot",[tm]:"createSlots",[Qo]:"toDisplayString",[_o]:"mergeProps",[cd]:"normalizeClass",[dd]:"normalizeStyle",[rl]:"normalizeProps",[Tl]:"guardReactiveProps",[ud]:"toHandlers",[sc]:"camelize",[Lx]:"capitalize",[ac]:"toHandlerKey",[wo]:"setBlockTracking",[Nx]:"pushScopeId",[Dx]:"popScopeId",[pd]:"withCtx",[Px]:"unref",[Mx]:"isRef",[fd]:"withMemo",[sm]:"isMemoSame"};function Fx(e){Object.getOwnPropertySymbols(e).forEach(t=>{pi[t]=e[t]})}const Ns={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function $x(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ns}}function cl(e,t,s,a,n,i,l,o=!1,r=!1,c=!1,d=Ns){return e&&(o?(e.helper(Sn),e.helper(mi(e.inSSR,c))):e.helper(hi(e.inSSR,c)),l&&e.helper(od)),{type:13,tag:t,props:s,children:a,patchFlag:n,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function xn(e,t=Ns){return{type:17,loc:t,elements:e}}function Bs(e,t=Ns){return{type:15,loc:t,properties:e}}function Ft(e,t){return{type:16,loc:Ns,key:He(e)?Ve(e,!0):e,value:t}}function Ve(e,t=!1,s=Ns,a=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:a}}function Ys(e,t=Ns){return{type:8,loc:t,children:e}}function jt(e,t=[],s=Ns){return{type:14,loc:s,callee:e,arguments:t}}function fi(e,t=void 0,s=!1,a=!1,n=Ns){return{type:18,params:e,returns:t,newline:s,isSlot:a,loc:n}}function nc(e,t,s,a=!0){return{type:19,test:e,consequent:t,alternate:s,newline:a,loc:Ns}}function Ux(e,t,s=!1,a=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:a,needArraySpread:!1,loc:Ns}}function Bx(e){return{type:21,body:e,loc:Ns}}function hi(e,t){return e||t?ed:td}function mi(e,t){return e||t?Yh:Qh}function hd(e,{helper:t,removeHelper:s,inSSR:a}){e.isBlock||(e.isBlock=!0,s(hi(a,e.isComponent)),t(Sn),t(mi(a,e.isComponent)))}const Tu=new Uint8Array([123,123]),Cu=new Uint8Array([125,125]);function Eu(e){return e>=97&&e<=122||e>=65&&e<=90}function Rs(e){return e===32||e===10||e===9||e===12||e===13}function Va(e){return e===47||e===62||Rs(e)}function ko(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const ts={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Hx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Tu,this.delimiterClose=Cu,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Tu,this.delimiterClose=Cu}getPos(t){let s=1,a=t+1;const n=this.newlines.length;let i=-1;if(n>100){let l=-1,o=n;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=n-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,a=t-this.newlines[i]),{column:a,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Va(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||Rs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const a=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=a}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===ts.TitleEnd||this.currentSequence===ts.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===ts.Cdata[this.sequenceIndex]?++this.sequenceIndex===ts.Cdata.length&&(this.state=28,this.currentSequence=ts.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Eu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Va(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Va(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(ko("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){Rs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Eu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||Rs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):Rs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):Rs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Va(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Va(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Va(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Va(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Va(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):Rs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):Rs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){Rs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=ts.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===ts.ScriptEnd[3]?this.startSpecial(ts.ScriptEnd,4):t===ts.StyleEnd[3]?this.startSpecial(ts.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===ts.TitleEnd[3]?this.startSpecial(ts.TitleEnd,4):t===ts.TextareaEnd[3]?this.startSpecial(ts.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===ts.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Au(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function _n(e,t){const s=Au("MODE",t),a=Au(e,t);return s===3?a===!0:a!==!1}function dl(e,t,s,...a){return _n(e,t)}function md(e){throw e}function am(e){}function xt(e,t,s,a){const n=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(n));return i.code=e,i.loc=t,i}const Ss=e=>e.type===4&&e.isStatic;function nm(e){switch(e){case"Teleport":case"teleport":return Gi;case"Suspense":case"suspense":return Xc;case"KeepAlive":case"keep-alive":return xo;case"BaseTransition":case"base-transition":return Zh}}const zx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,vd=e=>!zx.test(e),im=/[A-Za-z_$\xA0-\uFFFF]/,jx=/[\.\?\w$\xA0-\uFFFF]/,Vx=/\s+[.[]\s*|\s*[.[]\s+/g,lm=e=>e.type===4?e.content:e.loc.source,qx=e=>{const t=lm(e).trim().replace(Vx,o=>o.trim());let s=0,a=[],n=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")a.push(s),s=1,n++;else if(r==="(")a.push(s),s=2,i++;else if(!(o===0?im:jx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(a.push(s),s=3,l=r):r==="["?n++:r==="]"&&(--n||(s=a.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")a.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=a.pop())}break;case 3:r===l&&(s=a.pop(),l=null);break}}return!n&&!i},om=qx,Gx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,Kx=e=>Gx.test(lm(e)),Wx=Kx;function Us(e,t,s=!1){for(let a=0;a<e.props.length;a++){const n=e.props[a];if(n.type===7&&(s||n.exp)&&(He(t)?n.name===t:t.test(n.name)))return n}}function Xo(e,t,s=!1,a=!1){for(let n=0;n<e.props.length;n++){const i=e.props[n];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||a))return i}else if(i.name==="bind"&&(i.exp||a)&&hn(i.arg,t))return i}}function hn(e,t){return!!(e&&Ss(e)&&e.content===t)}function Jx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function _r(e){return e.type===5||e.type===2}function Ru(e){return e.type===7&&e.name==="pre"}function Zx(e){return e.type===7&&e.name==="slot"}function So(e){return e.type===1&&e.tagType===3}function To(e){return e.type===1&&e.tagType===2}const Yx=new Set([rl,Tl]);function rm(e,t=[]){if(e&&!He(e)&&e.type===14){const s=e.callee;if(!He(s)&&Yx.has(s))return rm(e.arguments[0],t.concat(e))}return[e,t]}function Co(e,t,s){let a,n=e.type===13?e.props:e.arguments[2],i=[],l;if(n&&!He(n)&&n.type===14){const o=rm(n);n=o[0],i=o[1],l=i[i.length-1]}if(n==null||He(n))a=Bs([t]);else if(n.type===14){const o=n.arguments[0];!He(o)&&o.type===15?Iu(t,o)||o.properties.unshift(t):n.callee===ud?a=jt(s.helper(_o),[Bs([t]),n]):n.arguments.unshift(Bs([t])),!a&&(a=n)}else n.type===15?(Iu(t,n)||n.properties.unshift(t),a=n):(a=jt(s.helper(_o),[Bs([t]),n]),l&&l.callee===Tl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=a:e.props=a:l?l.arguments[0]=a:e.arguments[2]=a}function Iu(e,t){let s=!1;if(e.key.type===4){const a=e.key.content;s=t.properties.some(n=>n.key.type===4&&n.key.content===a)}return s}function ul(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,a)=>s==="-"?"_":e.charCodeAt(a).toString())}`}function Qx(e){return e.type===14&&e.callee===fd?e.arguments[1].returns:e}const Xx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function cm(e){for(let t=0;t<e.length;t++)if(!Rs(e.charCodeAt(t)))return!1;return!0}function gd(e){return e.type===2&&cm(e.content)||e.type===12&&gd(e.content)}function dm(e){return e.type===3||gd(e)}const um={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Wn,isPreTag:Wn,isIgnoreNewlineTag:Wn,isCustomElement:Wn,onError:md,onWarn:am,comments:!1,prefixIdentifiers:!1};let lt=um,pl=null,Da="",as=null,Xe=null,ys="",wa=-1,un=-1,bd=0,Za=!1,ic=null;const yt=[],At=new Hx(yt,{onerr:ya,ontext(e,t){Ul(Zt(e,t),e,t)},ontextentity(e,t,s){Ul(e,t,s)},oninterpolation(e,t){if(Za)return Ul(Zt(e,t),e,t);let s=e+At.delimiterOpen.length,a=t-At.delimiterClose.length;for(;Rs(Da.charCodeAt(s));)s++;for(;Rs(Da.charCodeAt(a-1));)a--;let n=Zt(s,a);n.includes("&")&&(n=lt.decodeEntities(n,!1)),lc({type:5,content:Yl(n,!1,It(s,a)),loc:It(e,t)})},onopentagname(e,t){const s=Zt(e,t);as={type:1,tag:s,ns:lt.getNamespace(s,yt[0],lt.ns),tagType:0,props:[],children:[],loc:It(e-1,t),codegenNode:void 0}},onopentagend(e){Lu(e)},onclosetag(e,t){const s=Zt(e,t);if(!lt.isVoidTag(s)){let a=!1;for(let n=0;n<yt.length;n++)if(yt[n].tag.toLowerCase()===s.toLowerCase()){a=!0,n>0&&ya(24,yt[0].loc.start.offset);for(let l=0;l<=n;l++){const o=yt.shift();Zl(o,t,l<n)}break}a||ya(23,pm(e,60))}},onselfclosingtag(e){const t=as.tag;as.isSelfClosing=!0,Lu(e),yt[0]&&yt[0].tag===t&&Zl(yt.shift(),e)},onattribname(e,t){Xe={type:6,name:Zt(e,t),nameLoc:It(e,t),value:void 0,loc:It(e)}},ondirname(e,t){const s=Zt(e,t),a=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Za&&a===""&&ya(26,e),Za||a==="")Xe={type:6,name:s,nameLoc:It(e,t),value:void 0,loc:It(e)};else if(Xe={type:7,name:a,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ve("prop")]:[],loc:It(e)},a==="pre"){Za=At.inVPre=!0,ic=as;const n=as.props;for(let i=0;i<n.length;i++)n[i].type===7&&(n[i]=c0(n[i]))}},ondirarg(e,t){if(e===t)return;const s=Zt(e,t);if(Za&&!Ru(Xe))Xe.name+=s,mn(Xe.nameLoc,t);else{const a=s[0]!=="[";Xe.arg=Yl(a?s:s.slice(1,-1),a,It(e,t),a?3:0)}},ondirmodifier(e,t){const s=Zt(e,t);if(Za&&!Ru(Xe))Xe.name+="."+s,mn(Xe.nameLoc,t);else if(Xe.name==="slot"){const a=Xe.arg;a&&(a.content+="."+s,mn(a.loc,t))}else{const a=Ve(s,!0,It(e,t));Xe.modifiers.push(a)}},onattribdata(e,t){ys+=Zt(e,t),wa<0&&(wa=e),un=t},onattribentity(e,t,s){ys+=e,wa<0&&(wa=t),un=s},onattribnameend(e){const t=Xe.loc.start.offset,s=Zt(t,e);Xe.type===7&&(Xe.rawName=s),as.props.some(a=>(a.type===7?a.rawName:a.name)===s)&&ya(2,t)},onattribend(e,t){if(as&&Xe){if(mn(Xe.loc,t),e!==0)if(ys.includes("&")&&(ys=lt.decodeEntities(ys,!0)),Xe.type===6)Xe.name==="class"&&(ys=hm(ys).trim()),e===1&&!ys&&ya(13,t),Xe.value={type:2,content:ys,loc:e===1?It(wa,un):It(wa-1,un+1)},At.inSFCRoot&&as.tag==="template"&&Xe.name==="lang"&&ys&&ys!=="html"&&At.enterRCDATA(ko("</template"),0);else{let s=0;Xe.exp=Yl(ys,!1,It(wa,un),0,s),Xe.name==="for"&&(Xe.forParseResult=t0(Xe.exp));let a=-1;Xe.name==="bind"&&(a=Xe.modifiers.findIndex(n=>n.content==="sync"))>-1&&dl("COMPILER_V_BIND_SYNC",lt,Xe.loc,Xe.arg.loc.source)&&(Xe.name="model",Xe.modifiers.splice(a,1))}(Xe.type!==7||Xe.name!=="pre")&&as.props.push(Xe)}ys="",wa=un=-1},oncomment(e,t){lt.comments&&lc({type:3,content:Zt(e,t),loc:It(e-4,t+3)})},onend(){const e=Da.length;for(let t=0;t<yt.length;t++)Zl(yt[t],e-1),ya(24,yt[t].loc.start.offset)},oncdata(e,t){(yt[0]?yt[0].ns:lt.ns)!==0?Ul(Zt(e,t),e,t):ya(1,e-9)},onprocessinginstruction(e){(yt[0]?yt[0].ns:lt.ns)===0&&ya(21,e-1)}}),Ou=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,e0=/^\(|\)$/g;function t0(e){const t=e.loc,s=e.content,a=s.match(Xx);if(!a)return;const[,n,i]=a,l=(u,p,h=!1)=>{const m=t.start.offset+p,v=m+u.length;return Yl(u,!1,It(m,v),0,h?1:0)},o={source:l(i.trim(),s.indexOf(i,n.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=n.trim().replace(e0,"").trim();const c=n.indexOf(r),d=r.match(Ou);if(d){r=r.replace(Ou,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(o.index=l(h,s.indexOf(h,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Zt(e,t){return Da.slice(e,t)}function Lu(e){At.inSFCRoot&&(as.innerLoc=It(e+1,e+1)),lc(as);const{tag:t,ns:s}=as;s===0&&lt.isPreTag(t)&&bd++,lt.isVoidTag(t)?Zl(as,e):(yt.unshift(as),(s===1||s===2)&&(At.inXML=!0)),as=null}function Ul(e,t,s){{const i=yt[0]&&yt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=lt.decodeEntities(e,!1))}const a=yt[0]||pl,n=a.children[a.children.length-1];n&&n.type===2?(n.content+=e,mn(n.loc,s)):a.children.push({type:2,content:e,loc:It(t,s)})}function Zl(e,t,s=!1){s?mn(e.loc,pm(t,60)):mn(e.loc,s0(t,62)+1),At.inSFCRoot&&(e.children.length?e.innerLoc.end=Je({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Je({},e.innerLoc.start),e.innerLoc.source=Zt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:a,ns:n,children:i}=e;if(Za||(a==="slot"?e.tagType=2:Nu(e)?e.tagType=3:n0(e)&&(e.tagType=1)),At.inRCDATA||(e.children=fm(i)),n===0&&lt.isIgnoreNewlineTag(a)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}n===0&&lt.isPreTag(a)&&bd--,ic===e&&(Za=At.inVPre=!1,ic=null),At.inXML&&(yt[0]?yt[0].ns:lt.ns)===0&&(At.inXML=!1);{const l=e.props;if(!At.inSFCRoot&&_n("COMPILER_NATIVE_TEMPLATE",lt)&&e.tag==="template"&&!Nu(e)){const r=yt[0]||pl,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&dl("COMPILER_INLINE_TEMPLATE",lt,o.loc)&&e.children.length&&(o.value={type:2,content:Zt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function s0(e,t){let s=e;for(;Da.charCodeAt(s)!==t&&s<Da.length-1;)s++;return s}function pm(e,t){let s=e;for(;Da.charCodeAt(s)!==t&&s>=0;)s--;return s}const a0=new Set(["if","else","else-if","for","slot"]);function Nu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&a0.has(t[s].name))return!0}return!1}function n0({tag:e,props:t}){if(lt.isCustomElement(e))return!1;if(e==="component"||i0(e.charCodeAt(0))||nm(e)||lt.isBuiltInComponent&&lt.isBuiltInComponent(e)||lt.isNativeTag&&!lt.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const a=t[s];if(a.type===6){if(a.name==="is"&&a.value){if(a.value.content.startsWith("vue:"))return!0;if(dl("COMPILER_IS_ON_ELEMENT",lt,a.loc))return!0}}else if(a.name==="bind"&&hn(a.arg,"is")&&dl("COMPILER_IS_ON_ELEMENT",lt,a.loc))return!0}return!1}function i0(e){return e>64&&e<91}const l0=/\r\n/g;function fm(e){const t=lt.whitespace!=="preserve";let s=!1;for(let a=0;a<e.length;a++){const n=e[a];if(n.type===2)if(bd)n.content=n.content.replace(l0,`
`);else if(cm(n.content)){const i=e[a-1]&&e[a-1].type,l=e[a+1]&&e[a+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&o0(n.content)))?(s=!0,e[a]=null):n.content=" "}else t&&(n.content=hm(n.content))}return s?e.filter(Boolean):e}function o0(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function hm(e){let t="",s=!1;for(let a=0;a<e.length;a++)Rs(e.charCodeAt(a))?s||(t+=" ",s=!0):(t+=e[a],s=!1);return t}function lc(e){(yt[0]||pl).children.push(e)}function It(e,t){return{start:At.getPos(e),end:t==null?t:At.getPos(t),source:t==null?t:Zt(e,t)}}function r0(e){return It(e.start.offset,e.end.offset)}function mn(e,t){e.end=At.getPos(t),e.source=Zt(e.start.offset,t)}function c0(e){const t={type:6,name:e.rawName,nameLoc:It(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Yl(e,t=!1,s,a=0,n=0){return Ve(e,t,s,a)}function ya(e,t,s){lt.onError(xt(e,It(t,t)))}function d0(){At.reset(),as=null,Xe=null,ys="",wa=-1,un=-1,yt.length=0}function u0(e,t){if(d0(),Da=e,lt=Je({},um),t){let n;for(n in t)t[n]!=null&&(lt[n]=t[n])}At.mode=lt.parseMode==="html"?1:lt.parseMode==="sfc"?2:0,At.inXML=lt.ns===1||lt.ns===2;const s=t&&t.delimiters;s&&(At.delimiterOpen=ko(s[0]),At.delimiterClose=ko(s[1]));const a=pl=$x([],e);return At.parse(Da),a.loc=It(0,e.length),a.children=fm(a.children),pl=null,a}function p0(e,t){Ql(e,void 0,t,!!mm(e))}function mm(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!To(t[0])?t[0]:null}function Ql(e,t,s,a=!1,n=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=a?0:Is(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const m=h.patchFlag;if((m===void 0||m===512||m===1)&&gm(u,s)>=2){const v=bm(u);v&&(h.props=s.hoist(v))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(a?0:Is(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Ql(u,e,s,!1,n),p&&s.scopes.vSlot--}else if(u.type===11)Ql(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Ql(u.branches[p],e,s,u.branches[p].children.length===1,n)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Re(e.codegenNode.children))e.codegenNode.children=r(xn(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Re(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(xn(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Re(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=Us(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(xn(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Re(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function Is(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const a=s.get(e);if(a!==void 0)return a;const n=e.codegenNode;if(n.type!==13||n.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(n.patchFlag===void 0){let l=3;const o=gm(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=Is(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=Is(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(n.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(Sn),t.removeHelper(mi(t.inSSR,n.isComponent)),n.isBlock=!1,t.helper(hi(t.inSSR,n.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return Is(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(He(o)||os(o))continue;const r=Is(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const f0=new Set([cd,dd,rl,Tl]);function vm(e,t){if(e.type===14&&!He(e.callee)&&f0.has(e.callee)){const s=e.arguments[0];if(s.type===4)return Is(s,t);if(s.type===14)return vm(s,t)}return 0}function gm(e,t){let s=3;const a=bm(e);if(a&&a.type===15){const{properties:n}=a;for(let i=0;i<n.length;i++){const{key:l,value:o}=n[i],r=Is(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=Is(o,t):o.type===14?c=vm(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function bm(e){const t=e.codegenNode;if(t.type===13)return t.props}function h0(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:a=!1,hmr:n=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Xt,isCustomElement:d=Xt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:w="",bindingMetadata:A=Ze,inline:y=!1,isTS:g=!1,onError:b=md,onWarn:_=am,compatConfig:k}){const I=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:I&&An(ht(I[1])),prefixIdentifiers:s,hoistStatic:a,hmr:n,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:m,inSSR:v,ssrCssVars:w,bindingMetadata:A,inline:y,isTS:g,onError:b,onWarn:_,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(x){const N=C.helpers.get(x)||0;return C.helpers.set(x,N+1),x},removeHelper(x){const N=C.helpers.get(x);if(N){const F=N-1;F?C.helpers.set(x,F):C.helpers.delete(x)}},helperString(x){return`_${pi[C.helper(x)]}`},replaceNode(x){C.parent.children[C.childIndex]=C.currentNode=x},removeNode(x){const N=C.parent.children,F=x?N.indexOf(x):C.currentNode?C.childIndex:-1;!x||x===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>F&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(F,1)},onNodeRemoved:Xt,addIdentifiers(x){},removeIdentifiers(x){},hoist(x){He(x)&&(x=Ve(x)),C.hoists.push(x);const N=Ve(`_hoisted_${C.hoists.length}`,!1,x.loc,2);return N.hoisted=x,N},cache(x,N=!1,F=!1){const T=Ux(C.cached.length,x,N,F);return C.cached.push(T),T}};return C.filters=new Set,C}function m0(e,t){const s=h0(e,t);er(e,s),t.hoistStatic&&p0(e,s),t.ssr||v0(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function v0(e,t){const{helper:s}=t,{children:a}=e;if(a.length===1){const n=mm(e);if(n&&n.codegenNode){const i=n.codegenNode;i.type===13&&hd(i,t),e.codegenNode=i}else e.codegenNode=a[0]}else if(a.length>1){let n=64;e.codegenNode=cl(t,s(ol),void 0,e.children,n,void 0,void 0,!0,void 0,!1)}}function g0(e,t){let s=0;const a=()=>{s--};for(;s<e.children.length;s++){const n=e.children[s];He(n)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=a,er(n,t))}}function er(e,t){t.currentNode=e;const{nodeTransforms:s}=t,a=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Re(l)?a.push(...l):a.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Sl);break;case 5:t.ssr||t.helper(Qo);break;case 9:for(let i=0;i<e.branches.length;i++)er(e.branches[i],t);break;case 10:case 11:case 1:case 0:g0(e,t);break}t.currentNode=e;let n=a.length;for(;n--;)a[n]()}function ym(e,t){const s=He(e)?a=>a===e:a=>e.test(a);return(a,n)=>{if(a.type===1){const{props:i}=a;if(a.tagType===3&&i.some(Zx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(a,r,n);c&&l.push(c)}}return l}}}const tr="/*@__PURE__*/",xm=e=>`${pi[e]}: _${pi[e]}`;function b0(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:a=!1,filename:n="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:a,filename:n,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${pi[v]}`},push(v,w=-2,A){h.code+=v},indent(){m(++h.indentLevel)},deindent(v=!1){v?--h.indentLevel:m(--h.indentLevel)},newline(){m(h.indentLevel)}};function m(v){h.push(`
`+"  ".repeat(v),0)}return h}function y0(e,t={}){const s=b0(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:a,push:n,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&a!=="module";x0(e,s);const v=d?"ssrRender":"render",A=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(n(`function ${v}(${A}) {`),l(),h&&(n("with (_ctx) {"),l(),p&&(n(`const { ${u.map(xm).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(wr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(wr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),wr(e.filters,"filter",s),r()),e.temps>0){n("let ");for(let y=0;y<e.temps;y++)n(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(n(`
`,0),r()),d||n("return "),e.codegenNode?ls(e.codegenNode,s):n("null"),h&&(o(),n("}")),o(),n("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function x0(e,t){const{ssr:s,prefixIdentifiers:a,push:n,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(n(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[ed,td,Sl,sd,Xh].filter(p=>d.includes(p)).map(xm).join(", ");n(`const { ${u} } = _Vue
`,-1)}_0(e.hoists,t),i(),n("return ")}function wr(e,t,{helper:s,push:a,newline:n,isTS:i}){const l=s(t==="filter"?ld:t==="component"?ad:id);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),a(`const ${ul(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&n()}}function _0(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:a}=t;a();for(let n=0;n<e.length;n++){const i=e[n];i&&(s(`const _hoisted_${n+1} = `),ls(i,t),a())}t.pure=!1}function yd(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Cl(e,t,s),s&&t.deindent(),t.push("]")}function Cl(e,t,s=!1,a=!0){const{push:n,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];He(o)?n(o,-3):Re(o)?yd(o,t):ls(o,t),l<e.length-1&&(s?(a&&n(","),i()):a&&n(", "))}}function ls(e,t){if(He(e)){t.push(e,-3);return}if(os(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:ls(e.codegenNode,t);break;case 2:w0(e,t);break;case 4:_m(e,t);break;case 5:k0(e,t);break;case 12:ls(e.codegenNode,t);break;case 8:wm(e,t);break;case 3:T0(e,t);break;case 13:C0(e,t);break;case 14:A0(e,t);break;case 15:R0(e,t);break;case 17:I0(e,t);break;case 18:O0(e,t);break;case 19:L0(e,t);break;case 20:N0(e,t);break;case 21:Cl(e.body,t,!0,!1);break}}function w0(e,t){t.push(JSON.stringify(e.content),-3,e)}function _m(e,t){const{content:s,isStatic:a}=e;t.push(a?JSON.stringify(s):s,-3,e)}function k0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(tr),s(`${a(Qo)}(`),ls(e.content,t),s(")")}function wm(e,t){for(let s=0;s<e.children.length;s++){const a=e.children[s];He(a)?t.push(a,-3):ls(a,t)}}function S0(e,t){const{push:s}=t;if(e.type===8)s("["),wm(e,t),s("]");else if(e.isStatic){const a=vd(e.content)?e.content:JSON.stringify(e.content);s(a,-2,e)}else s(`[${e.content}]`,-3,e)}function T0(e,t){const{push:s,helper:a,pure:n}=t;n&&s(tr),s(`${a(Sl)}(${JSON.stringify(e.content)})`,-3,e)}function C0(e,t){const{push:s,helper:a,pure:n}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let m;r&&(m=String(r)),d&&s(a(od)+"("),u&&s(`(${a(Sn)}(${p?"true":""}), `),n&&s(tr);const v=u?mi(t.inSSR,h):hi(t.inSSR,h);s(a(v)+"(",-2,e),Cl(E0([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),ls(d,t),s(")"))}function E0(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function A0(e,t){const{push:s,helper:a,pure:n}=t,i=He(e.callee)?e.callee:a(e.callee);n&&s(tr),s(i+"(",-2,e),Cl(e.arguments,t),s(")")}function R0(e,t){const{push:s,indent:a,deindent:n,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&a();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];S0(c,t),s(": "),ls(d,t),r<l.length-1&&(s(","),i())}o&&n(),s(o?"}":" }")}function I0(e,t){yd(e.elements,t)}function O0(e,t){const{push:s,indent:a,deindent:n}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${pi[pd]}(`),s("(",-2,e),Re(i)?Cl(i,t):i&&ls(i,t),s(") => "),(r||o)&&(s("{"),a()),l?(r&&s("return "),Re(l)?yd(l,t):ls(l,t)):o&&ls(o,t),(r||o)&&(n(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function L0(e,t){const{test:s,consequent:a,alternate:n,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!vd(s.content);u&&l("("),_m(s,t),u&&l(")")}else l("("),ls(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),ls(a,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=n.type===19;d||t.indentLevel++,ls(n,t),d||t.indentLevel--,i&&r(!0)}function N0(e,t){const{push:s,helper:a,indent:n,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(n(),s(`${a(wo)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),ls(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${a(wo)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const D0=ym(/^(?:if|else|else-if)$/,(e,t,s)=>P0(e,t,s,(a,n,i)=>{const l=s.parent.children;let o=l.indexOf(a),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)a.codegenNode=Pu(n,r,s);else{const c=M0(a.codegenNode);c.alternate=Pu(n,r+a.branches.length-1,s)}}}));function P0(e,t,s,a){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const n=t.exp?t.exp.loc:e.loc;s.onError(xt(28,t.loc)),t.exp=Ve("true",!1,n)}if(t.name==="if"){const n=Du(e,t),i={type:9,loc:r0(e.loc),branches:[n]};if(s.replaceNode(i),a)return a(i,n,!0)}else{const n=s.parent.children;let i=n.indexOf(e);for(;i-->=-1;){const l=n[i];if(l&&dm(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(xt(30,e.loc)),s.removeNode();const o=Du(e,t);l.branches.push(o);const r=a&&a(l,o,!1);er(o,s),r&&r(),s.currentNode=null}else s.onError(xt(30,e.loc));break}}}function Du(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!Us(e,"for")?e.children:[e],userKey:Xo(e,"key"),isTemplateIf:s}}function Pu(e,t,s){return e.condition?nc(e.condition,Mu(e,t,s),jt(s.helper(Sl),['""',"true"])):Mu(e,t,s)}function Mu(e,t,s){const{helper:a}=s,n=Ft("key",Ve(`${t}`,!1,Ns,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return Co(r,n,s),r}else return cl(s,a(ol),Bs([n]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=Qx(r);return c.type===13&&hd(c,s),Co(c,n,s),r}}function M0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const F0=ym("for",(e,t,s)=>{const{helper:a,removeHelper:n}=s;return $0(e,t,s,i=>{const l=jt(a(rd),[i.source]),o=So(e),r=Us(e,"memo"),c=Xo(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ve(c.value.content,!0):void 0:c.exp);const u=d?Ft("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=cl(s,a(ol),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,w=v.length!==1||v[0].type!==1,A=To(e)?e:o&&e.children.length===1&&To(e.children[0])?e.children[0]:null;if(A?(m=A.codegenNode,o&&u&&Co(m,u,s)):w?m=cl(s,a(ol),u?Bs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&Co(m,u,s),m.isBlock!==!p&&(m.isBlock?(n(Sn),n(mi(s.inSSR,m.isComponent))):n(hi(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(a(Sn),a(mi(s.inSSR,m.isComponent))):a(hi(s.inSSR,m.isComponent))),r){const y=fi(oc(i.parseResult,[Ve("_cached")]));y.body=Bx([Ys(["const _memo = (",r.exp,")"]),Ys(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(sm)}(_cached, _memo)) return _cached`]),Ys(["const _item = ",m]),Ve("_item.memo = _memo"),Ve("return _item")]),l.arguments.push(y,Ve("_cache"),Ve(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(fi(oc(i.parseResult),m,!0))}})});function $0(e,t,s,a){if(!t.exp){s.onError(xt(31,t.loc));return}const n=t.forParseResult;if(!n){s.onError(xt(32,t.loc));return}km(n);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=n,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:n,children:So(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const h=a&&a(p);return()=>{o.vFor--,h&&h()}}function km(e,t){e.finalized||(e.finalized=!0)}function oc({value:e,key:t,index:s},a=[]){return U0([e,t,s,...a])}function U0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,a)=>s||Ve("_".repeat(a+1),!1))}const Fu=Ve("undefined",!1),B0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=Us(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},H0=(e,t,s,a)=>fi(e,s,!1,!0,s.length?s[0].loc:a);function z0(e,t,s=H0){t.helper(pd);const{children:a,loc:n}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=Us(e,"slot",!0);if(r){const{arg:w,exp:A}=r;w&&!Ss(w)&&(o=!0),i.push(Ft(w||Ve("default",!0),s(A,void 0,a,n)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let w=0;w<a.length;w++){const A=a[w];let y;if(!So(A)||!(y=Us(A,"slot",!0))){A.type!==3&&u.push(A);continue}if(r){t.onError(xt(37,y.loc));break}c=!0;const{children:g,loc:b}=A,{arg:_=Ve("default",!0),exp:k,loc:I}=y;let C;Ss(_)?C=_?_.content:"default":o=!0;const x=Us(A,"for"),N=s(k,x,g,b);let F,T;if(F=Us(A,"if"))o=!0,l.push(nc(F.exp,Bl(_,N,h++),Fu));else if(T=Us(A,/^else(?:-if)?$/,!0)){let P=w,z;for(;P--&&(z=a[P],!!dm(z)););if(z&&So(z)&&Us(z,/^(?:else-)?if$/)){let G=l[l.length-1];for(;G.alternate.type===19;)G=G.alternate;G.alternate=T.exp?nc(T.exp,Bl(_,N,h++),Fu):Bl(_,N,h++)}else t.onError(xt(30,T.loc))}else if(x){o=!0;const P=x.forParseResult;P?(km(P),l.push(jt(t.helper(rd),[P.source,fi(oc(P),Bl(_,N),!0)]))):t.onError(xt(32,x.loc))}else{if(C){if(p.has(C)){t.onError(xt(38,I));continue}p.add(C),C==="default"&&(d=!0)}i.push(Ft(_,N))}}if(!r){const w=(A,y)=>{const g=s(A,void 0,y,n);return t.compatConfig&&(g.isNonScopedSlot=!0),Ft("default",g)};c?u.length&&!u.every(gd)&&(d?t.onError(xt(39,u[0].loc)):i.push(w(void 0,u))):i.push(w(void 0,a))}const m=o?2:Xl(e.children)?3:1;let v=Bs(i.concat(Ft("_",Ve(m+"",!1))),n);return l.length&&(v=jt(t.helper(tm),[v,xn(l)])),{slots:v,hasDynamicSlots:o}}function Bl(e,t,s){const a=[Ft("name",e),Ft("fn",t)];return s!=null&&a.push(Ft("key",Ve(String(s),!0))),Bs(a)}function Xl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Xl(s.children))return!0;break;case 9:if(Xl(s.branches))return!0;break;case 10:case 11:if(Xl(s.children))return!0;break}}return!1}const Sm=new WeakMap,j0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:a,props:n}=e,i=e.tagType===1;let l=i?V0(e,t):`"${a}"`;const o=ot(l)&&l.callee===nd;let r,c,d=0,u,p,h,m=o||l===Gi||l===Xc||!i&&(a==="svg"||a==="foreignObject"||a==="math");if(n.length>0){const v=Tm(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const w=v.directives;h=w&&w.length?xn(w.map(A=>G0(A,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===xo&&(m=!0,d|=1024),i&&l!==Gi&&l!==xo){const{slots:w,hasDynamicSlots:A}=z0(e,t);c=w,A&&(d|=1024)}else if(e.children.length===1&&l!==Gi){const w=e.children[0],A=w.type,y=A===5||A===8;y&&Is(w,t)===0&&(d|=1),y||A===2?c=w:c=e.children}else c=e.children;p&&p.length&&(u=K0(p)),e.codegenNode=cl(t,l,r,c,d===0?void 0:d,u,h,!!m,!1,i,e.loc)};function V0(e,t,s=!1){let{tag:a}=e;const n=rc(a),i=Xo(e,"is",!1,!0);if(i)if(n||_n("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&Ve(i.value.content,!0):(o=i.exp,o||(o=Ve("is",!1,i.arg.loc))),o)return jt(t.helper(nd),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(a=i.value.content.slice(4));const l=nm(a)||t.isBuiltInComponent(a);return l?(s||t.helper(l),l):(t.helper(ad),t.components.add(a),ul(a,"component"))}function Tm(e,t,s=e.props,a,n,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let h=!1,m=0,v=!1,w=!1,A=!1,y=!1,g=!1,b=!1;const _=[],k=N=>{c.length&&(d.push(Bs($u(c),o)),c=[]),N&&d.push(N)},I=()=>{t.scopes.vFor>0&&c.push(Ft(Ve("ref_for",!0),Ve("true")))},C=({key:N,value:F})=>{if(Ss(N)){const T=N.content,P=Cn(T);if(P&&(!a||n)&&T.toLowerCase()!=="onclick"&&T!=="onUpdate:modelValue"&&!Oa(T)&&(y=!0),P&&Oa(T)&&(b=!0),P&&F.type===14&&(F=F.arguments[0]),F.type===20||(F.type===4||F.type===8)&&Is(F,t)>0)return;T==="ref"?v=!0:T==="class"?w=!0:T==="style"?A=!0:T!=="key"&&!_.includes(T)&&_.push(T),a&&(T==="class"||T==="style")&&!_.includes(T)&&_.push(T)}else g=!0};for(let N=0;N<s.length;N++){const F=s[N];if(F.type===6){const{loc:T,name:P,nameLoc:z,value:G}=F;let E=!0;if(P==="ref"&&(v=!0,I()),P==="is"&&(rc(l)||G&&G.content.startsWith("vue:")||_n("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Ft(Ve(P,!0,z),Ve(G?G.content:"",E,G?G.loc:T)))}else{const{name:T,arg:P,exp:z,loc:G,modifiers:E}=F,O=T==="bind",R=T==="on";if(T==="slot"){a||t.onError(xt(40,G));continue}if(T==="once"||T==="memo"||T==="is"||O&&hn(P,"is")&&(rc(l)||_n("COMPILER_IS_ON_ELEMENT",t))||R&&i)continue;if((O&&hn(P,"key")||R&&p&&hn(P,"vue:before-update"))&&(h=!0),O&&hn(P,"ref")&&I(),!P&&(O||R)){if(g=!0,z)if(O){if(k(),_n("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(z);continue}I(),k(),d.push(z)}else k({type:14,loc:G,callee:t.helper(ud),arguments:a?[z]:[z,"true"]});else t.onError(xt(O?34:35,G));continue}O&&E.some(Q=>Q.content==="prop")&&(m|=32);const $=t.directiveTransforms[T];if($){const{props:Q,needRuntime:W}=$(F,e,t);!i&&Q.forEach(C),R&&P&&!Ss(P)?k(Bs(Q,o)):c.push(...Q),W&&(u.push(F),os(W)&&Sm.set(F,W))}else Fv(T)||(u.push(F),p&&(h=!0))}}let x;if(d.length?(k(),d.length>1?x=jt(t.helper(_o),d,o):x=d[0]):c.length&&(x=Bs($u(c),o)),g?m|=16:(w&&!a&&(m|=2),A&&!a&&(m|=4),_.length&&(m|=8),y&&(m|=32)),!h&&(m===0||m===32)&&(v||b||u.length>0)&&(m|=512),!t.inSSR&&x)switch(x.type){case 15:let N=-1,F=-1,T=!1;for(let G=0;G<x.properties.length;G++){const E=x.properties[G].key;Ss(E)?E.content==="class"?N=G:E.content==="style"&&(F=G):E.isHandlerKey||(T=!0)}const P=x.properties[N],z=x.properties[F];T?x=jt(t.helper(rl),[x]):(P&&!Ss(P.value)&&(P.value=jt(t.helper(cd),[P.value])),z&&(A||z.value.type===4&&z.value.content.trim()[0]==="["||z.value.type===17)&&(z.value=jt(t.helper(dd),[z.value])));break;case 14:break;default:x=jt(t.helper(rl),[jt(t.helper(Tl),[x])]);break}return{props:x,directives:u,patchFlag:m,dynamicPropNames:_,shouldUseBlock:h}}function $u(e){const t=new Map,s=[];for(let a=0;a<e.length;a++){const n=e[a];if(n.key.type===8||!n.key.isStatic){s.push(n);continue}const i=n.key.content,l=t.get(i);l?(i==="style"||i==="class"||Cn(i))&&q0(l,n):(t.set(i,n),s.push(n))}return s}function q0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=xn([e.value,t.value],e.loc)}function G0(e,t){const s=[],a=Sm.get(e);a?s.push(t.helperString(a)):(t.helper(id),t.directives.add(e.name),s.push(ul(e.name,"directive")));const{loc:n}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ve("true",!1,n);s.push(Bs(e.modifiers.map(l=>Ft(l,i)),n))}return xn(s,e.loc)}function K0(e){let t="[";for(let s=0,a=e.length;s<a;s++)t+=JSON.stringify(e[s]),s<a-1&&(t+=", ");return t+"]"}function rc(e){return e==="component"||e==="Component"}const W0=(e,t)=>{if(To(e)){const{children:s,loc:a}=e,{slotName:n,slotProps:i}=J0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",n,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=fi([],s,!1,!1,a),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=jt(t.helper(em),l,a)}};function J0(e,t){let s='"default"',a;const n=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=ht(l.name),n.push(l)));else if(l.name==="bind"&&hn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=ht(l.arg.content);s=l.exp=Ve(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&Ss(l.arg)&&(l.arg.content=ht(l.arg.content)),n.push(l)}if(n.length>0){const{props:i,directives:l}=Tm(e,t,n,!1,!1);a=i,l.length&&t.onError(xt(36,l[0].loc))}return{slotName:s,slotProps:a}}const Cm=(e,t,s,a)=>{const{loc:n,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(xt(35,n));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Xn(ht(u)):`on:${u}`;o=Ve(p,!0,l.loc)}else o=Ys([`${s.helperString(ac)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(ac)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=om(r),p=!(u||Wx(r)),h=r.content.includes(";");(p||c&&u)&&(r=Ys([`${p?"$event":"(...args)"} => ${h?"{":"("}`,r,h?"}":")"]))}let d={props:[Ft(o,r||Ve("() => {}",!1,n))]};return a&&(d=a(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},Z0=(e,t,s)=>{const{modifiers:a,loc:n}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),a.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=ht(i.content):i.content=`${s.helperString(sc)}(${i.content})`:(i.children.unshift(`${s.helperString(sc)}(`),i.children.push(")"))),s.inSSR||(a.some(o=>o.content==="prop")&&Uu(i,"."),a.some(o=>o.content==="attr")&&Uu(i,"^")),{props:[Ft(i,l)]}},Uu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},Y0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let a,n=!1;for(let i=0;i<s.length;i++){const l=s[i];if(_r(l)){n=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(_r(r))a||(a=s[i]=Ys([l],l.loc)),a.children.push(" + ",r),s.splice(o,1),o--;else{a=void 0;break}}}}if(!(!n||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(_r(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&Is(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:jt(t.helper(sd),o)}}}}},Bu=new WeakSet,Q0=(e,t)=>{if(e.type===1&&Us(e,"once",!0))return Bu.has(e)||t.inVOnce||t.inSSR?void 0:(Bu.add(e),t.inVOnce=!0,t.helper(wo),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Em=(e,t,s)=>{const{exp:a,arg:n}=e;if(!a)return s.onError(xt(41,e.loc)),Ai();const i=a.loc.source.trim(),l=a.type===4?a.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(xt(44,a.loc)),Ai();if(o==="literal-const"||o==="setup-const")return s.onError(xt(45,a.loc)),Ai();if(!l.trim()||!om(a))return s.onError(xt(42,a.loc)),Ai();const r=n||Ve("modelValue",!0),c=n?Ss(n)?`onUpdate:${ht(n.content)}`:Ys(['"onUpdate:" + ',n]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ys([`${u} => ((`,a,") = $event)"]);const p=[Ft(r,e.exp),Ft(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(v=>v.content).map(v=>(vd(v)?v:JSON.stringify(v))+": true").join(", "),m=n?Ss(n)?`${n.content}Modifiers`:Ys([n,' + "Modifiers"']):"modelModifiers";p.push(Ft(m,Ve(`{ ${h} }`,!1,e.loc,2)))}return Ai(p)};function Ai(e=[]){return{props:e}}const X0=/[\w).+\-_$\]]/,e_=(e,t)=>{_n("COMPILER_FILTERS",t)&&(e.type===5?Eo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Eo(s.exp,t)}))};function Eo(e,t){if(e.type===4)Hu(e,t);else for(let s=0;s<e.children.length;s++){const a=e.children[s];typeof a=="object"&&(a.type===4?Hu(a,t):a.type===8?Eo(e,t):a.type===5&&Eo(a.content,t))}}function Hu(e,t){const s=e.content;let a=!1,n=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,h,m,v=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),a)u===39&&p!==92&&(a=!1);else if(n)u===34&&p!==92&&(n=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!o&&!r&&!c)m===void 0?(d=h+1,m=s.slice(0,h).trim()):w();else{switch(u){case 34:n=!0;break;case 39:a=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let A=h-1,y;for(;A>=0&&(y=s.charAt(A),y===" ");A--);(!y||!X0.test(y))&&(l=!0)}}m===void 0?m=s.slice(0,h).trim():d!==0&&w();function w(){v.push(s.slice(d,h).trim()),d=h+1}if(v.length){for(h=0;h<v.length;h++)m=t_(m,v[h],t);e.content=m,e.ast=void 0}}function t_(e,t,s){s.helper(ld);const a=t.indexOf("(");if(a<0)return s.filters.add(t),`${ul(t,"filter")}(${e})`;{const n=t.slice(0,a),i=t.slice(a+1);return s.filters.add(n),`${ul(n,"filter")}(${e}${i!==")"?","+i:i}`}}const zu=new WeakSet,s_=(e,t)=>{if(e.type===1){const s=Us(e,"memo");return!s||zu.has(e)||t.inSSR?void 0:(zu.add(e),()=>{const a=e.codegenNode||t.currentNode.codegenNode;a&&a.type===13&&(e.tagType!==1&&hd(a,t),e.codegenNode=jt(t.helper(fd),[s.exp,fi(void 0,a),"_cache",String(t.cached.length)]),t.cached.push(null))})}},a_=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const a=s.arg;if(a.type!==4||!a.isStatic)t.onError(xt(53,a.loc)),s.exp=Ve("",!0,a.loc);else{const n=ht(a.content);(im.test(n[0])||n[0]==="-")&&(s.exp=Ve(n,!1,a.loc))}}}};function n_(e){return[[a_,Q0,D0,s_,F0,e_,W0,j0,B0,Y0],{on:Cm,bind:Z0,model:Em}]}function i_(e,t={}){const s=t.onError||md,a=t.mode==="module";t.prefixIdentifiers===!0?s(xt(48)):a&&s(xt(49));const n=!1;t.cacheHandlers&&s(xt(50)),t.scopeId&&!a&&s(xt(51));const i=Je({},t,{prefixIdentifiers:n}),l=He(e)?u0(e,i):e,[o,r]=n_();return m0(l,Je({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Je({},r,t.directiveTransforms||{})})),y0(l,i)}const l_=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Am=Symbol(""),Rm=Symbol(""),Im=Symbol(""),Om=Symbol(""),cc=Symbol(""),Lm=Symbol(""),Nm=Symbol(""),Dm=Symbol(""),Pm=Symbol(""),Mm=Symbol("");Fx({[Am]:"vModelRadio",[Rm]:"vModelCheckbox",[Im]:"vModelText",[Om]:"vModelSelect",[cc]:"vModelDynamic",[Lm]:"withModifiers",[Nm]:"withKeys",[Dm]:"vShow",[Pm]:"Transition",[Mm]:"TransitionGroup"});let Bn;function o_(e,t=!1){return Bn||(Bn=document.createElement("div")),t?(Bn.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Bn.children[0].getAttribute("foo")):(Bn.innerHTML=e,Bn.textContent)}const r_={parseMode:"html",isVoidTag:eg,isNativeTag:e=>Yv(e)||Qv(e)||Xv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:o_,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Pm;if(e==="TransitionGroup"||e==="transition-group")return Mm},getNamespace(e,t,s){let a=t?t.ns:s;if(t&&a===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(n=>n.type===6&&n.name==="encoding"&&n.value!=null&&(n.value.content==="text/html"||n.value.content==="application/xhtml+xml"))&&(a=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(a=0);else t&&a===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(a=0);if(a===0){if(e==="svg")return 1;if(e==="math")return 2}return a}},c_=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ve("style",!0,t.loc),exp:d_(t.value.content,t.loc),modifiers:[],loc:t.loc})})},d_=(e,t)=>{const s=Wp(e);return Ve(JSON.stringify(s),!1,t,3)};function en(e,t){return xt(e,t)}const u_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(en(54,n)),t.children.length&&(s.onError(en(55,n)),t.children.length=0),{props:[Ft(Ve("innerHTML",!0,n),a||Ve("",!0))]}},p_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(en(56,n)),t.children.length&&(s.onError(en(57,n)),t.children.length=0),{props:[Ft(Ve("textContent",!0),a?Is(a,s)>0?a:jt(s.helperString(Qo),[a],n):Ve("",!0))]}},f_=(e,t,s)=>{const a=Em(e,t,s);if(!a.props.length||t.tagType===1)return a;e.arg&&s.onError(en(59,e.arg.loc));const{tag:n}=t,i=s.isCustomElement(n);if(n==="input"||n==="textarea"||n==="select"||i){let l=Im,o=!1;if(n==="input"||i){const r=Xo(t,"type");if(r){if(r.type===7)l=cc;else if(r.value)switch(r.value.content){case"radio":l=Am;break;case"checkbox":l=Rm;break;case"file":o=!0,s.onError(en(60,e.loc));break}}else Jx(t)&&(l=cc)}else n==="select"&&(l=Om);o||(a.needRuntime=s.helper(l))}else s.onError(en(58,e.loc));return a.props=a.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),a},h_=Ls("passive,once,capture"),m_=Ls("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),v_=Ls("left,right"),Fm=Ls("onkeyup,onkeydown,onkeypress"),g_=(e,t,s,a)=>{const n=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&dl("COMPILER_V_ON_NATIVE",s)||h_(r)?l.push(r):v_(r)?Ss(e)?Fm(e.content.toLowerCase())?n.push(r):i.push(r):(n.push(r),i.push(r)):m_(r)?i.push(r):n.push(r)}return{keyModifiers:n,nonKeyModifiers:i,eventOptionModifiers:l}},ju=(e,t)=>Ss(e)&&e.content.toLowerCase()==="onclick"?Ve(t,!0):e.type!==4?Ys(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,b_=(e,t,s)=>Cm(e,t,s,a=>{const{modifiers:n}=e;if(!n.length)return a;let{key:i,value:l}=a.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=g_(i,n,s,e.loc);if(r.includes("right")&&(i=ju(i,"onContextmenu")),r.includes("middle")&&(i=ju(i,"onMouseup")),r.length&&(l=jt(s.helper(Lm),[l,JSON.stringify(r)])),o.length&&(!Ss(i)||Fm(i.content.toLowerCase()))&&(l=jt(s.helper(Nm),[l,JSON.stringify(o)])),c.length){const d=c.map(An).join("");i=Ss(i)?Ve(`${i.content}${d}`,!0):Ys(["(",i,`) + "${d}"`])}return{props:[Ft(i,l)]}}),y_=(e,t,s)=>{const{exp:a,loc:n}=e;return a||s.onError(en(62,n)),{props:[],needRuntime:s.helper(Dm)}},x_=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},__=[c_],w_={cloak:l_,html:u_,text:p_,model:f_,on:b_,show:y_};function k_(e,t={}){return i_(e,Je({},r_,t,{nodeTransforms:[x_,...__,...t.nodeTransforms||[]],directiveTransforms:Je({},w_,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vu=Object.create(null);function S_(e,t){if(!He(e))if(e.nodeType)e=e.innerHTML;else return Xt;const s=Bv(e,t),a=Vu[s];if(a)return a;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const n=Je({hoistStatic:!0,onError:void 0,onWarn:Xt},t);!n.isCustomElement&&typeof customElements<"u"&&(n.isCustomElement=o=>!!customElements.get(o));const{code:i}=k_(e,n),l=new Function("Vue",i)(Ox);return l._rc=!0,Vu[s]=l}xh(S_);const Ao=sn({items:[]});let T_=1;function sr(e,t="info",s=3e3){const a=T_++;return Ao.items.push({id:a,message:String(e),type:t}),s>0&&setTimeout(()=>xd(a),s),a}function xd(e){const t=Ao.items.findIndex(s=>s.id===e);t>=0&&Ao.items.splice(t,1)}function we(e,t="info",s=3e3){return sr(e,t,s)}we.success=(e,t=3e3)=>sr(e,"success",t);we.error=(e,t=5e3)=>sr(e,"error",t);we.info=(e,t=3e3)=>sr(e,"info",t);we.dismiss=xd;const C_={setup(){return{state:Ao,dismiss:xd}},template:`
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
  `},Ta=sn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let ii=null;function Kt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:a="Cancel",danger:n=!1}={}){return ii&&ii(!1),Ta.title=e,Ta.message=t,Ta.confirmLabel=s,Ta.cancelLabel=a,Ta.danger=n,Ta.open=!0,new Promise(i=>{ii=i})}function qu(e){Ta.open=!1,ii&&(ii(e),ii=null)}const E_={setup(){function e(t){Ta.open&&t.key==="Escape"&&(t.stopPropagation(),qu(!1))}return Ge(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:Ta,settle:qu}},template:`
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
 */const Gn=typeof document<"u";function $m(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function A_(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&$m(e.default)}const ut=Object.assign;function kr(e,t){const s={};for(const a in t){const n=t[a];s[a]=Xs(n)?n.map(e):e(n)}return s}const Ki=()=>{},Xs=Array.isArray;function Gu(e,t){const s={};for(const a in e)s[a]=a in t?t[a]:e[a];return s}const Um=/#/g,R_=/&/g,I_=/\//g,O_=/=/g,L_=/\?/g,Bm=/\+/g,N_=/%5B/g,D_=/%5D/g,Hm=/%5E/g,P_=/%60/g,zm=/%7B/g,M_=/%7C/g,jm=/%7D/g,F_=/%20/g;function _d(e){return e==null?"":encodeURI(""+e).replace(M_,"|").replace(N_,"[").replace(D_,"]")}function $_(e){return _d(e).replace(zm,"{").replace(jm,"}").replace(Hm,"^")}function dc(e){return _d(e).replace(Bm,"%2B").replace(F_,"+").replace(Um,"%23").replace(R_,"%26").replace(P_,"`").replace(zm,"{").replace(jm,"}").replace(Hm,"^")}function U_(e){return dc(e).replace(O_,"%3D")}function B_(e){return _d(e).replace(Um,"%23").replace(L_,"%3F")}function H_(e){return B_(e).replace(I_,"%2F")}function fl(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const z_=/\/$/,j_=e=>e.replace(z_,"");function Sr(e,t,s="/"){let a,n={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(a=t.slice(0,r),i=t.slice(r,o>0?o:t.length),n=e(i.slice(1))),o>=0&&(a=a||t.slice(0,o),l=t.slice(o,t.length)),a=K_(a??t,s),{fullPath:a+i+l,path:a,query:n,hash:fl(l)}}function V_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function Ku(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function q_(e,t,s){const a=t.matched.length-1,n=s.matched.length-1;return a>-1&&a===n&&vi(t.matched[a],s.matched[n])&&Vm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function vi(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Vm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!G_(e[s],t[s]))return!1;return!0}function G_(e,t){return Xs(e)?Wu(e,t):Xs(t)?Wu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function Wu(e,t){return Xs(t)?e.length===t.length&&e.every((s,a)=>s===t[a]):e.length===1&&e[0]===t}function K_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),a=e.split("/"),n=a[a.length-1];(n===".."||n===".")&&a.push("");let i=s.length-1,l,o;for(l=0;l<a.length;l++)if(o=a[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+a.slice(l).join("/")}const qa={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let uc=(function(e){return e.pop="pop",e.push="push",e})({}),Tr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function W_(e){if(!e)if(Gn){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),j_(e)}const J_=/^[^#]+#/;function Z_(e,t){return e.replace(J_,"#")+t}function Y_(e,t){const s=document.documentElement.getBoundingClientRect(),a=e.getBoundingClientRect();return{behavior:t.behavior,left:a.left-s.left-(t.left||0),top:a.top-s.top-(t.top||0)}}const ar=()=>({left:window.scrollX,top:window.scrollY});function Q_(e){let t;if("el"in e){const s=e.el,a=typeof s=="string"&&s.startsWith("#"),n=typeof s=="string"?a?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!n)return;t=Y_(n,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function Ju(e,t){return(history.state?history.state.position-t:-1)+e}const pc=new Map;function X_(e,t){pc.set(e,t)}function ew(e){const t=pc.get(e);return pc.delete(e),t}function tw(e){return typeof e=="string"||e&&typeof e=="object"}function qm(e){return typeof e=="string"||typeof e=="symbol"}let Et=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const Gm=Symbol("");Et.MATCHER_NOT_FOUND+"",Et.NAVIGATION_GUARD_REDIRECT+"",Et.NAVIGATION_ABORTED+"",Et.NAVIGATION_CANCELLED+"",Et.NAVIGATION_DUPLICATED+"";function gi(e,t){return ut(new Error,{type:e,[Gm]:!0},t)}function xa(e,t){return e instanceof Error&&Gm in e&&(t==null||!!(e.type&t))}const sw=["params","query","hash"];function aw(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of sw)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function nw(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let a=0;a<s.length;++a){const n=s[a].replace(Bm," "),i=n.indexOf("="),l=fl(i<0?n:n.slice(0,i)),o=i<0?null:fl(n.slice(i+1));if(l in t){let r=t[l];Xs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function Zu(e){let t="";for(let s in e){const a=e[s];if(s=U_(s),a==null){a!==void 0&&(t+=(t.length?"&":"")+s);continue}(Xs(a)?a.map(n=>n&&dc(n)):[a&&dc(a)]).forEach(n=>{n!==void 0&&(t+=(t.length?"&":"")+s,n!=null&&(t+="="+n))})}return t}function iw(e){const t={};for(const s in e){const a=e[s];a!==void 0&&(t[s]=Xs(a)?a.map(n=>n==null?null:""+n):a==null?a:""+a)}return t}const lw=Symbol(""),Yu=Symbol(""),nr=Symbol(""),wd=Symbol(""),fc=Symbol("");function Ri(){let e=[];function t(a){return e.push(a),()=>{const n=e.indexOf(a);n>-1&&e.splice(n,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Ya(e,t,s,a,n,i=l=>l()){const l=a&&(a.enterCallbacks[n]=a.enterCallbacks[n]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(gi(Et.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):tw(p)?r(gi(Et.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&a.enterCallbacks[n]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(a&&a.instances[n],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function Cr(e,t,s,a,n=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if($m(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Ya(c,s,a,l,o,n))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=A_(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Ya(p,s,a,l,o,n)()}))}}return i}function ow(e,t){const s=[],a=[],n=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>vi(c,o))?a.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>vi(c,r))||n.push(r))}return[s,a,n]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let rw=()=>location.protocol+"//"+location.host;function Km(e,t){const{pathname:s,search:a,hash:n}=t,i=e.indexOf("#");if(i>-1){let l=n.includes(e.slice(i))?e.slice(i).length:1,o=n.slice(l);return o[0]!=="/"&&(o="/"+o),Ku(o,"")}return Ku(s,e)+a+n}function cw(e,t,s,a){let n=[],i=[],l=null;const o=({state:p})=>{const h=Km(e,location),m=s.value,v=t.value;let w=0;if(p){if(s.value=h,t.value=p,l&&l===m){l=null;return}w=v?p.position-v.position:0}else a(h);n.forEach(A=>{A(s.value,m,{delta:w,type:uc.pop,direction:w?w>0?Tr.forward:Tr.back:Tr.unknown})})};function r(){l=s.value}function c(p){n.push(p);const h=()=>{const m=n.indexOf(p);m>-1&&n.splice(m,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(ut({},p.state,{scroll:ar()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Qu(e,t,s,a=!1,n=!1){return{back:e,current:t,forward:s,replaced:a,position:window.history.length,scroll:n?ar():null}}function dw(e){const{history:t,location:s}=window,a={value:Km(e,s)},n={value:t.state};n.value||i(a.value,{back:null,current:a.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:rw()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),n.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(r,c){i(r,ut({},t.state,Qu(n.value.back,r,n.value.forward,!0),c,{position:n.value.position}),!0),a.value=r}function o(r,c){const d=ut({},n.value,t.state,{forward:r,scroll:ar()});i(d.current,d,!0),i(r,ut({},Qu(a.value,r,null),{position:d.position+1},c),!1),a.value=r}return{location:a,state:n,push:o,replace:l}}function uw(e){e=W_(e);const t=dw(e),s=cw(e,t.state,t.location,t.replace);function a(i,l=!0){l||s.pauseListeners(),history.go(i)}const n=ut({location:"",base:e,go:a,createHref:Z_.bind(null,e)},t,s);return Object.defineProperty(n,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(n,"state",{enumerable:!0,get:()=>t.state.value}),n}function pw(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),uw(e)}let vn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Ht=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Ht||{});const fw={type:vn.Static,value:""},hw=/[a-zA-Z0-9_]/;function mw(e){if(!e)return[[]];if(e==="/")return[[fw]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=Ht.Static,a=s;const n=[];let i;function l(){i&&n.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===Ht.Static?i.push({type:vn.Static,value:c}):s===Ht.Param||s===Ht.ParamRegExp||s===Ht.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:vn.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==Ht.ParamRegExp){a=s,s=Ht.EscapeNext;continue}switch(s){case Ht.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=Ht.Param):p();break;case Ht.EscapeNext:p(),s=a;break;case Ht.Param:r==="("?s=Ht.ParamRegExp:hw.test(r)?p():(u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case Ht.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=Ht.ParamRegExpEnd:d+=r;break;case Ht.ParamRegExpEnd:u(),s=Ht.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===Ht.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),n}const Xu="[^/]+?",vw={sensitive:!1,strict:!1,start:!0,end:!0};var ds=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ds||{});const gw=/[.+*?^${}()[\]/\\]/g;function bw(e,t){const s=ut({},vw,t),a=[];let n=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ds.Root];s.strict&&!c.length&&(n+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=ds.Segment+(s.sensitive?ds.BonusCaseSensitive:0);if(p.type===vn.Static)u||(n+="/"),n+=p.value.replace(gw,"\\$&"),h+=ds.Static;else if(p.type===vn.Param){const{value:m,repeatable:v,optional:w,regexp:A}=p;i.push({name:m,repeatable:v,optional:w});const y=A||Xu;if(y!==Xu){h+=ds.BonusCustomRegExp;try{`${y}`}catch(b){throw new Error(`Invalid custom RegExp for param "${m}" (${y}): `+b.message)}}let g=v?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(g=w&&c.length<2?`(?:/${g})`:"/"+g),w&&(g+="?"),n+=g,h+=ds.Dynamic,w&&(h+=ds.BonusOptional),v&&(h+=ds.BonusRepeatable),y===".*"&&(h+=ds.BonusWildcard)}d.push(h)}a.push(d)}if(s.strict&&s.end){const c=a.length-1;a[c][a[c].length-1]+=ds.BonusStrict}s.strict||(n+="/?"),s.end?n+="$":s.strict&&!n.endsWith("/")&&(n+="(?:/|$)");const l=new RegExp(n,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",m=i[p-1];u[m.name]=h&&m.repeatable?h.split("/"):h}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===vn.Static)d+=h.value;else if(h.type===vn.Param){const{value:m,repeatable:v,optional:w}=h,A=m in c?c[m]:"";if(Xs(A)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const y=Xs(A)?A.join("/"):A;if(!y)if(w)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=y}}return d||"/"}return{re:l,score:a,keys:i,parse:o,stringify:r}}function yw(e,t){let s=0;for(;s<e.length&&s<t.length;){const a=t[s]-e[s];if(a)return a;s++}return e.length<t.length?e.length===1&&e[0]===ds.Static+ds.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ds.Static+ds.Segment?1:-1:0}function Wm(e,t){let s=0;const a=e.score,n=t.score;for(;s<a.length&&s<n.length;){const i=yw(a[s],n[s]);if(i)return i;s++}if(Math.abs(n.length-a.length)===1){if(ep(a))return 1;if(ep(n))return-1}return n.length-a.length}function ep(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const xw={strict:!1,end:!0,sensitive:!1};function _w(e,t,s){const a=bw(mw(e.path),s),n=ut(a,{record:e,parent:t,children:[],alias:[]});return t&&!n.record.aliasOf==!t.record.aliasOf&&t.children.push(n),n}function ww(e,t){const s=[],a=new Map;t=Gu(xw,t);function n(u){return a.get(u)}function i(u,p,h){const m=!h,v=sp(u);v.aliasOf=h&&h.record;const w=Gu(t,u),A=[v];if("alias"in u){const b=typeof u.alias=="string"?[u.alias]:u.alias;for(const _ of b)A.push(sp(ut({},v,{components:h?h.record.components:v.components,path:_,aliasOf:h?h.record:v})))}let y,g;for(const b of A){const{path:_}=b;if(p&&_[0]!=="/"){const k=p.record.path,I=k[k.length-1]==="/"?"":"/";b.path=p.record.path+(_&&I+_)}if(y=_w(b,p,w),h?h.alias.push(y):(g=g||y,g!==y&&g.alias.push(y),m&&u.name&&!ap(y)&&l(u.name)),Jm(y)&&r(y),v.children){const k=v.children;for(let I=0;I<k.length;I++)i(k[I],y,h&&h.children[I])}h=h||y}return g?()=>{l(g)}:Ki}function l(u){if(qm(u)){const p=a.get(u);p&&(a.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&a.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=Tw(u,s);s.splice(p,0,u),u.record.name&&!ap(u)&&a.set(u.record.name,u)}function c(u,p){let h,m={},v,w;if("name"in u&&u.name){if(h=a.get(u.name),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u});w=h.record.name,m=ut(tp(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&tp(u.params,h.keys.map(g=>g.name))),v=h.stringify(m)}else if(u.path!=null)v=u.path,h=s.find(g=>g.re.test(v)),h&&(m=h.parse(v),w=h.record.name);else{if(h=p.name?a.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw gi(Et.MATCHER_NOT_FOUND,{location:u,currentLocation:p});w=h.record.name,m=ut({},p.params,u.params),v=h.stringify(m)}const A=[];let y=h;for(;y;)A.unshift(y.record),y=y.parent;return{name:w,path:v,params:m,matched:A,meta:Sw(A)}}e.forEach(u=>i(u));function d(){s.length=0,a.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:n}}function tp(e,t){const s={};for(const a of t)a in e&&(s[a]=e[a]);return s}function sp(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:kw(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function kw(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const a in e.components)t[a]=typeof s=="object"?s[a]:s;return t}function ap(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function Sw(e){return e.reduce((t,s)=>ut(t,s.meta),{})}function Tw(e,t){let s=0,a=t.length;for(;s!==a;){const i=s+a>>1;Wm(e,t[i])<0?a=i:s=i+1}const n=Cw(e);return n&&(a=t.lastIndexOf(n,a-1)),a}function Cw(e){let t=e;for(;t=t.parent;)if(Jm(t)&&Wm(e,t)===0)return t}function Jm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function np(e){const t=Hs(nr),s=Hs(wd),a=q(()=>{const r=da(e.to);return t.resolve(r)}),n=q(()=>{const{matched:r}=a.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(vi.bind(null,d));if(p>-1)return p;const h=ip(r[c-2]);return c>1&&ip(d)===h&&u[u.length-1].path!==h?u.findIndex(vi.bind(null,r[c-2])):p}),i=q(()=>n.value>-1&&Ow(s.params,a.value.params)),l=q(()=>n.value>-1&&n.value===s.matched.length-1&&Vm(s.params,a.value.params));function o(r={}){if(Iw(r)){const c=t[da(e.replace)?"replace":"push"](da(e.to)).catch(Ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:a,href:q(()=>a.value.href),isActive:i,isExactActive:l,navigate:o}}function Ew(e){return e.length===1?e[0]:e}const Aw=_l({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:np,setup(e,{slots:t}){const s=sn(np(e)),{options:a}=Hs(nr),n=q(()=>({[lp(e.activeClass,a.linkActiveClass,"router-link-active")]:s.isActive,[lp(e.exactActiveClass,a.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&Ew(t.default(s));return e.custom?i:ci("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:n.value},i)}}}),Rw=Aw;function Iw(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Ow(e,t){for(const s in t){const a=t[s],n=e[s];if(typeof a=="string"){if(a!==n)return!1}else if(!Xs(n)||n.length!==a.length||a.some((i,l)=>i.valueOf()!==n[l].valueOf()))return!1}return!0}function ip(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const lp=(e,t,s)=>e??t??s,Lw=_l({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const a=Hs(fc),n=q(()=>e.route||a.value),i=Hs(Yu,0),l=q(()=>{let c=da(i);const{matched:d}=n.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=q(()=>n.value.matched[l.value]);zi(Yu,q(()=>l.value+1)),zi(lw,o),zi(fc,n);const r=f();return Ut(()=>[r.value,o.value,e.name],([c,d,u],[p,h,m])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!vi(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=n.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return op(s.default,{Component:p,route:c});const h=u.props[d],m=h?h===!0?c.params:typeof h=="function"?h(c):h:null,w=ci(p,ut({},m,t,{onVnodeUnmounted:A=>{A.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return op(s.default,{Component:w,route:c})||w}}});function op(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const Nw=Lw;function Dw(e){const t=ww(e.routes,e),s=e.parseQuery||nw,a=e.stringifyQuery||Zu,n=e.history,i=Ri(),l=Ri(),o=Ri(),r=Lc(qa);let c=qa;Gn&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=kr.bind(null,ae=>""+ae),u=kr.bind(null,H_),p=kr.bind(null,fl);function h(ae,be){let j,ce;return qm(ae)?(j=t.getRecordMatcher(ae),ce=be):ce=ae,t.addRoute(ce,j)}function m(ae){const be=t.getRecordMatcher(ae);be&&t.removeRoute(be)}function v(){return t.getRoutes().map(ae=>ae.record)}function w(ae){return!!t.getRecordMatcher(ae)}function A(ae,be){if(be=ut({},be||r.value),typeof ae=="string"){const M=Sr(s,ae,be.path),B=t.resolve({path:M.path},be),de=n.createHref(M.fullPath);return ut(M,B,{params:p(B.params),hash:fl(M.hash),redirectedFrom:void 0,href:de})}let j;if(ae.path!=null)j=ut({},ae,{path:Sr(s,ae.path,be.path).path});else{const M=ut({},ae.params);for(const B in M)M[B]==null&&delete M[B];j=ut({},ae,{params:u(M)}),be.params=u(be.params)}const ce=t.resolve(j,be),he=ae.hash||"";ce.params=d(p(ce.params));const Le=V_(a,ut({},ae,{hash:$_(he),path:ce.path})),S=n.createHref(Le);return ut({fullPath:Le,hash:he,query:a===Zu?iw(ae.query):ae.query||{}},ce,{redirectedFrom:void 0,href:S})}function y(ae){return typeof ae=="string"?Sr(s,ae,r.value.path):ut({},ae)}function g(ae,be){if(c!==ae)return gi(Et.NAVIGATION_CANCELLED,{from:be,to:ae})}function b(ae){return I(ae)}function _(ae){return b(ut(y(ae),{replace:!0}))}function k(ae,be){const j=ae.matched[ae.matched.length-1];if(j&&j.redirect){const{redirect:ce}=j;let he=typeof ce=="function"?ce(ae,be):ce;return typeof he=="string"&&(he=he.includes("?")||he.includes("#")?he=y(he):{path:he},he.params={}),ut({query:ae.query,hash:ae.hash,params:he.path!=null?{}:ae.params},he)}}function I(ae,be){const j=c=A(ae),ce=r.value,he=ae.state,Le=ae.force,S=ae.replace===!0,M=k(j,ce);if(M)return I(ut(y(M),{state:typeof M=="object"?ut({},he,M.state):he,force:Le,replace:S}),be||j);const B=j;B.redirectedFrom=be;let de;return!Le&&q_(a,ce,j)&&(de=gi(Et.NAVIGATION_DUPLICATED,{to:B,from:ce}),W(ce,ce,!0,!1)),(de?Promise.resolve(de):N(B,ce)).catch(ne=>xa(ne)?xa(ne,Et.NAVIGATION_GUARD_REDIRECT)?ne:Q(ne):R(ne,B,ce)).then(ne=>{if(ne){if(xa(ne,Et.NAVIGATION_GUARD_REDIRECT))return I(ut({replace:S},y(ne.to),{state:typeof ne.to=="object"?ut({},he,ne.to.state):he,force:Le}),be||B)}else ne=T(B,ce,!0,S,he);return F(B,ce,ne),ne})}function C(ae,be){const j=g(ae,be);return j?Promise.reject(j):Promise.resolve()}function x(ae){const be=J.values().next().value;return be&&typeof be.runWithContext=="function"?be.runWithContext(ae):ae()}function N(ae,be){let j;const[ce,he,Le]=ow(ae,be);j=Cr(ce.reverse(),"beforeRouteLeave",ae,be);for(const M of ce)M.leaveGuards.forEach(B=>{j.push(Ya(B,ae,be))});const S=C.bind(null,ae,be);return j.push(S),Ne(j).then(()=>{j=[];for(const M of i.list())j.push(Ya(M,ae,be));return j.push(S),Ne(j)}).then(()=>{j=Cr(he,"beforeRouteUpdate",ae,be);for(const M of he)M.updateGuards.forEach(B=>{j.push(Ya(B,ae,be))});return j.push(S),Ne(j)}).then(()=>{j=[];for(const M of Le)if(M.beforeEnter)if(Xs(M.beforeEnter))for(const B of M.beforeEnter)j.push(Ya(B,ae,be));else j.push(Ya(M.beforeEnter,ae,be));return j.push(S),Ne(j)}).then(()=>(ae.matched.forEach(M=>M.enterCallbacks={}),j=Cr(Le,"beforeRouteEnter",ae,be,x),j.push(S),Ne(j))).then(()=>{j=[];for(const M of l.list())j.push(Ya(M,ae,be));return j.push(S),Ne(j)}).catch(M=>xa(M,Et.NAVIGATION_CANCELLED)?M:Promise.reject(M))}function F(ae,be,j){o.list().forEach(ce=>x(()=>ce(ae,be,j)))}function T(ae,be,j,ce,he){const Le=g(ae,be);if(Le)return Le;const S=be===qa,M=Gn?history.state:{};j&&(ce||S?n.replace(ae.fullPath,ut({scroll:S&&M&&M.scroll},he)):n.push(ae.fullPath,he)),r.value=ae,W(ae,be,j,S),Q()}let P;function z(){P||(P=n.listen((ae,be,j)=>{if(!pe.listening)return;const ce=A(ae),he=k(ce,pe.currentRoute.value);if(he){I(ut(he,{replace:!0,force:!0}),ce).catch(Ki);return}c=ce;const Le=r.value;Gn&&X_(Ju(Le.fullPath,j.delta),ar()),N(ce,Le).catch(S=>xa(S,Et.NAVIGATION_ABORTED|Et.NAVIGATION_CANCELLED)?S:xa(S,Et.NAVIGATION_GUARD_REDIRECT)?(I(ut(y(S.to),{force:!0}),ce).then(M=>{xa(M,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&!j.delta&&j.type===uc.pop&&n.go(-1,!1)}).catch(Ki),Promise.reject()):(j.delta&&n.go(-j.delta,!1),R(S,ce,Le))).then(S=>{S=S||T(ce,Le,!1),S&&(j.delta&&!xa(S,Et.NAVIGATION_CANCELLED)?n.go(-j.delta,!1):j.type===uc.pop&&xa(S,Et.NAVIGATION_ABORTED|Et.NAVIGATION_DUPLICATED)&&n.go(-1,!1)),F(ce,Le,S)}).catch(Ki)}))}let G=Ri(),E=Ri(),O;function R(ae,be,j){Q(ae);const ce=E.list();return ce.length?ce.forEach(he=>he(ae,be,j)):console.error(ae),Promise.reject(ae)}function $(){return O&&r.value!==qa?Promise.resolve():new Promise((ae,be)=>{G.add([ae,be])})}function Q(ae){return O||(O=!ae,z(),G.list().forEach(([be,j])=>ae?j(ae):be()),G.reset()),ae}function W(ae,be,j,ce){const{scrollBehavior:he}=e;if(!Gn||!he)return Promise.resolve();const Le=!j&&ew(Ju(ae.fullPath,0))||(ce||!j)&&history.state&&history.state.scroll||null;return Ot().then(()=>he(ae,be,Le)).then(S=>S&&Q_(S)).catch(S=>R(S,ae,be))}const Z=ae=>n.go(ae);let re;const J=new Set,pe={currentRoute:r,listening:!0,addRoute:h,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:w,getRoutes:v,resolve:A,options:e,push:b,replace:_,go:Z,back:()=>Z(-1),forward:()=>Z(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:E.add,isReady:$,install(ae){ae.component("RouterLink",Rw),ae.component("RouterView",Nw),ae.config.globalProperties.$router=pe,Object.defineProperty(ae.config.globalProperties,"$route",{enumerable:!0,get:()=>da(r)}),Gn&&!re&&r.value===qa&&(re=!0,b(n.location).catch(ce=>{}));const be={};for(const ce in qa)Object.defineProperty(be,ce,{get:()=>r.value[ce],enumerable:!0});ae.provide(nr,pe),ae.provide(wd,Oc(be)),ae.provide(fc,r);const j=ae.unmount;J.add(ae),ae.unmount=function(){J.delete(ae),J.size<1&&(c=qa,P&&P(),P=null,r.value=qa,re=!1,O=!1),j()}}};function Ne(ae){return ae.reduce((be,j)=>be.then(()=>x(j)),Promise.resolve())}return pe}function Zm(){return Hs(nr)}function Pw(e){return Hs(wd)}const ir={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=Pw(),s=Zm(),a=q({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),n=q(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.component)||null}),i=q(()=>{var o;return((o=e.tabs.find(r=>r.id===a.value))==null?void 0:o.label)||""});Ut(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),a.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:a,activeComponent:n,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hl=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),fa=e=>Number.isSafeInteger(e)&&e>=0,Mw=e=>e===null||typeof e=="string",Ro=(e,t)=>fa(e)&&fa(t)&&t>=e,kd=e=>hl(e)&&typeof e.status=="string"&&typeof e.truncated=="boolean"&&Mw(e.cursor);function Fw(e){return!kd(e)||e.kind!=="tool_output"?!1:e.retention==="failed"?typeof e.error=="string"&&typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&e.cursor===null&&e.truncated:e.retention!=="retained"||typeof e.result_id!="string"||!fa(e.total_chars)||!fa(e.total_bytes)||e.offset_unit!=="unicode_code_points"||!Ro(e.start,e.end)||e.end>e.total_chars?!1:"head"in e?typeof e.head=="string"&&hl(e.tail)&&typeof e.tail.text=="string"&&Ro(e.tail.start,e.tail.end)&&e.tail.end<=e.total_chars&&e.tail_is_context_only===!0:typeof e.text=="string"&&!("tail"in e)}function rp(e){return kd(e)&&e.kind==="process_output"&&fa(e.pid)&&typeof e.generation=="string"&&(e.exit_code===null||Number.isInteger(e.exit_code))&&["emitted_bytes","retained_bytes","shown_bytes","capture_limit_loss_bytes","not_retained_bytes"].every(t=>fa(e[t]))&&e.retained_bytes<=e.emitted_bytes&&Array.isArray(e.shown_intervals)&&e.shown_intervals.every(t=>Array.isArray(t)&&t.length===2&&Ro(...t)&&t[1]<=("text"in e?e.retained_bytes:e.emitted_bytes))}function $w(e){return kd(e)&&!("kind"in e)&&typeof e.id=="string"&&typeof e.label=="string"&&typeof e.preview=="string"&&["original_bytes","result_bytes","error_bytes","source_original_bytes"].every(t=>fa(e[t]))&&Ro(e.offset,e.end)&&e.end<=e.original_bytes&&e.result_bytes+e.error_bytes===e.original_bytes&&Array.isArray(e.tools_used)&&e.tools_used.every(t=>typeof t=="string")&&fa(e.tools_omitted)}function hc(e){try{return JSON.parse(e)}catch{return}}const mc=e=>JSON.stringify(e,null,2),Uw=e=>{const t=hc(e);return t===void 0?e:mc(t)},Hl=(e,t,s)=>`[${e}, ${t}) ${s}`;function Ym(e,{prettyPrint:t=!0}={}){var o,r;const s=typeof e=="string"?e:mc(e)??"";let a=typeof e=="string"?hc(e):e,n=null;if(typeof e=="string"&&a===void 0){const c=`
[output retention] `,d=e.lastIndexOf(c),u=e.indexOf(`
`);if(d>u&&u>0){const p=hc(e.slice(d+c.length)),h=e.slice(0,u);rp(p)&&!("text"in p)&&h.startsWith(`[PID ${p.pid}] status=${p.status} `)&&(a=p,n=e.slice(u+1,d))}}const i={raw:s,kind:"text",header:[],sections:[],metadata:null},l=(c,d)=>({label:c,text:t?Uw(d):d});if(hl(a)&&a.kind==="audit_preview"&&a.audit_clipped===!0&&(!("original_chars"in a)||fa(a.original_chars))&&(!("preview"in a)||typeof a.preview=="string")){if(i.kind="audit_preview",i.header=["audit clipped: yes",...fa(a.original_chars)?[`original ${a.original_chars} code points`]:[]],hl(a.source))for(const c of["kind","status","retention","truncated","capture_loss","capture_limit_loss_bytes","not_retained_bytes","cursor_present","total_bytes","total_chars","retained_bytes","emitted_bytes","shown_bytes","offset_unit","capture_error","pid","exit_code","start","end","tail_status","original_bytes","result_bytes","error_bytes","offset","source_original_bytes","id","capture_lost_bytes","dropped_bytes","output_lost","capture_truncated","retention_seconds_after_exit"])["string","number","boolean"].includes(typeof a.source[c])&&i.header.push(`source ${c}: ${a.source[c]}`);return i.sections.push({label:"Audit preview — incomplete source; raw shows stored wrapper",text:a.preview??(t?"(no preview retained in audit)":"")}),i.metadata=a,i}if(Fw(a))i.kind="tool_output",i.header=[a.status,`retention: ${a.retention}`],a.retention==="retained"?(i.header.push(`${a.total_bytes} UTF-8 bytes`,`${a.total_chars} code points`),i.sections.push(l(`${"head"in a?"Head":"Page"} ${Hl(a.start,a.end,"code points")}`,a.head??a.text)),(o=a.tail)!=null&&o.text&&i.sections.push(l(`Tail context only ${Hl(a.tail.start,a.tail.end,"code points")} — not a continuation`,a.tail.text))):(i.header.push(a.error),i.sections.push(l("Head — retention failed",a.head),l("Tail context only — may overlap head",a.tail.text))),typeof((r=a.matches)==null?void 0:r.summary)=="string"&&i.header.push(a.matches.summary);else if(rp(a)&&(typeof a.text=="string"||n!==null)){i.kind="process_output",i.header=[a.status,`PID ${a.pid}`,...a.exit_code!==null?[`exit ${a.exit_code}`]:[],`emitted ${a.emitted_bytes} B`,`retained ${a.retained_bytes} B`,`shown ${a.shown_bytes} B`,`capture-limit loss ${a.capture_limit_loss_bytes} B`,`not retained ${a.not_retained_bytes} B`],a.capture_error&&i.header.push(`capture error: ${a.capture_error}`),a.tail_status&&i.header.push(`recent output: ${a.tail_status}`);const c=a.shown_intervals.map(d=>Hl(...d,"UTF-8 bytes")).join(", ");i.sections.push(l(`${n!==null?"Recent preview — retrieval starts at byte 0":"Page"}${c?" · "+c:""}`,n??a.text))}else if($w(a))i.kind="agent_result",i.header=[a.status,`agent ${a.id}`,a.label,`original ${a.original_bytes} B`,`result ${a.result_bytes} B`,`error ${a.error_bytes} B`,`source ${a.source_original_bytes} B`,`tools ${a.tools_used.length} shown / ${a.tools_omitted} omitted`],i.sections.push(l(`Result + error page ${Hl(a.offset,a.end,"UTF-8 bytes")}`,a.preview));else return i.kind=a===void 0?"text":"json",i.sections.push({label:"",text:a===void 0||!t&&typeof e=="string"?s:t?mc(a):JSON.stringify(a)}),i;if(i.metadata=a,i.header.push(`source truncated: ${a.truncated?"yes":"no"}`,`cursor: ${a.cursor?"present":"none"}`),typeof a.expires_at=="string"&&i.header.push(`expires: ${a.expires_at}`),typeof a.expires_at=="number"){const c=new Date(a.expires_at*1e3);Number.isNaN(c.valueOf())||i.header.push(`expires: ${c.toISOString()}`)}return i}function Qm(e,t=30,s=6e3){let a=1,n=0,i=0;if(t>0&&s>0)for(const l of e){if(n>=s||l===`
`&&a>=t)break;l===`
`&&a++,n++,i+=l.length}return{text:e.slice(0,i),folded:i<e.length,chars:n,lines:a}}const Er=Object.freeze({inlineChars:240,previewLines:4,previewChars:600}),Bw=e=>e!==null&&typeof e=="object",Hw=new Set(["_hmac","_prev_hmac"]),vc=e=>e.replace(/\r\n?/g,`
`);function ml(e){const t=typeof e=="string"?e:JSON.stringify(e)??"";try{let s=!1;const a=JSON.parse(t,(n,i)=>{if(Hw.has(n)){s=!0;return}return i});return vc(s?JSON.stringify(a):t)}catch{return vc(t)}}function zw(e){const t=e.metadata;if(!t)return[];const s=[],a=e.kind==="audit_preview"&&Bw(t.source)?t.source:t;return e.kind==="audit_preview"&&s.push("audit clipped"),a.truncated===!0&&s.push("source truncated"),a.retention==="failed"&&s.push("retention unavailable"),a.capture_error&&s.push(`capture unavailable: ${a.capture_error}`),a.capture_limit_loss_bytes>0&&s.push(`capture loss ${a.capture_limit_loss_bytes} B`),a.not_retained_bytes>0&&s.push(`not retained ${a.not_retained_bytes} B`),a.capture_lost_bytes>0&&s.push(`capture lost ${a.capture_lost_bytes} B`),a.dropped_bytes>0&&s.push(`dropped ${a.dropped_bytes} B`),(a.capture_loss===!0||a.output_lost===!0||a.capture_truncated===!0)&&s.push("capture loss"),Number.isInteger(a.exit_code)&&a.exit_code!==0&&s.push(`process exit ${a.exit_code}`),["failed","error","cancelled","timed_out"].includes(a.status)&&s.push(`source ${a.status}`),e.kind==="audit_preview"&&!t.preview&&s.push("audit body unavailable"),s}function jw(e){var h;const t=Ym(typeof e=="string"?vc(e):e,{prettyPrint:!1}),s=t.sections.map(m=>({...m,text:ml(m.text)})),a=s.map(m=>m.text).filter(Boolean).join(`
`),n=a.replace(/\n$/,""),i=[...a].length,l=n?n.split(`
`).length:0,o=!["text","json"].includes(t.kind),r=l>=2||i>Er.inlineChars||o&&n.length>0,c=s.filter(m=>m.text).map(m=>{let v=m.text;try{v=JSON.stringify(JSON.parse(v),null,2)}catch{}return m.label?`${m.label}
${v}`:v}).join(`

`).replace(/\n$/,""),d=Qm(c,Er.previewLines,Er.previewChars),u=t.kind==="audit_preview"?(h=t.metadata)==null?void 0:h.source:t.metadata,p=u&&(t.kind==="process_output"||u.kind==="process_output")?`PID ${u.pid??"?"} ${u.status??""}${Number.isInteger(u.exit_code)?` exit ${u.exit_code}`:""}`.trim():t.kind==="agent_result"&&(u!=null&&u.status)?`agent ${u.status}`:"";return{promoted:r,chars:i,lines:l,envelope:o,kind:t.kind,formatted:c,preview:d,outcome:p,header:t.header,summary:n.replace(/\n/g," "),warnings:zw(t)}}const Vw={name:"CompactOutput",props:{value:{default:""},rawValue:{default:void 0},label:{type:String,default:"Output"},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=f(null),l=f(null),o=f(!1),r=q(()=>jw(e.value)),c=q(()=>{const b=e.rawValue===void 0?e.value:e.rawValue;return typeof b=="string"?b:JSON.stringify(b,null,2)??""}),d=q(()=>a.value?c.value:r.value.formatted),u=q(()=>r.value.promoted&&r.value.preview.folded||o.value),p=q(()=>t.value?!!d.value:r.value.promoted),h=q(()=>p.value?"":r.value.summary);let m;function v(){if(t.value)return;const b=r.value.promoted?i.value:l.value;o.value=!!(b&&(b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1))}function w(){m==null||m.disconnect();for(const b of[i.value,l.value])b&&(m==null||m.observe(b));v()}function A(){t.value=!t.value,t.value||(a.value=!1)}function y(){a.value=!a.value,t.value=!0,n.value=""}async function g(){const b=e.value;try{await navigator.clipboard.writeText(d.value),b===e.value&&(n.value="Copied")}catch{b===e.value&&(n.value="Copy unavailable — select text manually")}}return Ut([()=>e.value,()=>e.rawValue,()=>e.recordId],(b,_)=>{(e.recordId===null||b[2]!==_[2])&&(t.value=!1,a.value=!1),n.value=""}),Ut([i,l,t,s,r],()=>Ot(w),{flush:"post"}),Ge(()=>{m=new ResizeObserver(v),w()}),mt(()=>m==null?void 0:m.disconnect()),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,previewElement:i,summaryElement:l,model:r,body:d,canExpand:u,showBody:p,headerSummary:h,toggleExpanded:A,toggleRaw:y,copyOutput:g}},template:`
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
    </section>`},lr={name:"ToolOutput",components:{CompactOutput:Vw},props:{value:{default:""},label:{type:String,default:"Output"},presentation:{type:String,default:"inspector"},rawValue:{default:void 0},hasContext:{type:Boolean,default:!1},recordId:{default:null}},setup(e){const t=f(!1),s=f(!0),a=f(!1),n=f(""),i=q(()=>Ym(e.value)),l=q(()=>a.value?[{label:"Raw received value",text:i.value.raw}]:i.value.sections),o=q(()=>{let u=30,p=6e3;return l.value.map(h=>{const m=Qm(h.text,u,p);return u=Math.max(0,u-m.lines),p=Math.max(0,p-m.chars),{...h,display:t.value?h.text:m.text,folded:m.folded}})}),r=q(()=>o.value.some(u=>u.folded)),c=q(()=>a.value?i.value.raw:l.value.map(u=>u.label?`${u.label}
${u.text}`:u.text).join(`

`));async function d(){const u=e.value;try{await navigator.clipboard.writeText(c.value),e.value===u&&(n.value="Copied")}catch{e.value===u&&(n.value="Copy unavailable — select text manually")}}return Ut(()=>e.value,()=>{t.value=!1,n.value=""}),Ut(a,()=>{t.value=!1,n.value=""}),{expanded:t,wrapped:s,rawMode:a,copyStatus:n,model:i,foldedSections:o,canExpand:r,copyOutput:d}},template:`
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
  `},qw={components:{ToolOutput:lr},setup(){const e=f([]),t=f([]),s=f({}),a=50;function n(p){var v,w,A,y,g,b,_,k,I,C,x;const h=p.payload||p,m=h.type||p.type;if(!(["loop_tool_start","loop_tool"].includes(m)&&!(h.agent_id||(v=h.metadata)!=null&&v.agent_id))&&!(["loop_tool_start","loop_tool"].includes(m)&&!(h.call_id||(w=h.metadata)!=null&&w.call_id))){if(m==="tool_start"||m==="loop_tool_start"){const N=h.call_id||((A=h.metadata)==null?void 0:A.call_id)||null,F=h.agent_id||((y=h.metadata)==null?void 0:y.agent_id)||"",T={callId:N,agentId:F,agentLabel:h.agent_label||((g=h.metadata)==null?void 0:g.agent_label)||"",toolInput:h.tool_input,id:N?`${F}:${N}`:`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:h.iteration??((b=h.metadata)==null?void 0:b.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(m==="tool_end"||m==="loop_tool"){const N=h.call_id||((_=h.metadata)==null?void 0:_.call_id)||null,F=h.agent_id||((k=h.metadata)==null?void 0:k.agent_id)||"";let T=-1;if(N&&(T=e.value.findIndex(P=>P.callId===N&&P.agentId===F&&P.status==="running")),T<0&&!N)for(let P=e.value.length-1;P>=0;P--){const z=e.value[P];if(z.tool===h.action&&z.agentId===F&&z.status==="running"){T=P;break}}if(T>=0){const P=e.value[T];P.status=h.error||(I=h.metadata)!=null&&I.error||["error","failed","cancelled","denied","outcome_unknown"].includes(h.status||((C=h.metadata)==null?void 0:C.status))?"error":"success",P.elapsed=h.execution_time_ms??h.duration_ms??((x=h.metadata)==null?void 0:x.elapsed_ms)??Date.now()-P.startTime,P.result=h.result_summary??h.detail??"",P.fadingOut=!0,setTimeout(()=>{const z=e.value.indexOf(P);z>=0&&e.value.splice(z,1),t.value.unshift(P),t.value.length>a&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const N=h.call_id||h.tool_name||"unknown";if(h.finished){const F={...s.value};delete F[N],s.value=F}else{const T=((s.value[N]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[N]:T.slice(-30).join(`
`)}}return}}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let o=!1;function r(){o||(o=!0,st.on("events",n),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,st.off("events",n),i&&(clearInterval(i),i=null))}Ge(r),es(r),Wt(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Sd(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function In(e){const t=Sd(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Gw(e){const t=Sd(e);return t?t.toLocaleTimeString():"—"}function Xm(e){const t=Sd(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Kw(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.floor(Number(e)));return t<60?"less than 1 min ago":t<3600?`${Math.floor(t/60)} min ago`:t<86400?`${Math.floor(t/3600)} hr ago`:`${Math.floor(t/86400)} day ago`}function bi(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const n=Math.floor(t/60),i=t%60;return i?`${n}m ${i}s`:`${n}m`}const s=Math.floor(t/3600),a=Math.floor(t%3600/60);return a?`${s}h ${a}m`:`${s}h`}function Td(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function ev(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function cp(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Cd(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function tv(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const sv=Symbol("agent-detail-cancelled"),Ww=15e3;function Jw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:a,cancelTimeout:n}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((h,m)=>{r=h,c=m});function u(h,m){o||(o=!0,l!==null&&n(l),l=null,(h?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return o||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!o&&Number.isFinite(t)&&t>0&&(l=a(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,sv),i==null||i.abort()}}}function av({state:e,requestDetail:t,timeoutMs:s=Ww,detailLabel:a="Agent detail",scheduleTimeout:n=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:h,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const w=Jw(A=>t(p,{signal:A}),{timeoutMs:s,timeoutLabel:a,scheduleTimeout:n,cancelTimeout:i});return v.cancel=w.cancel,v.promise=(async()=>{let A=null,y=null;try{A=await w.promise}catch(g){y=g}A!==sv&&(l!==v||e.detailId!==p||(l=null,!y&&(A===null||typeof A!="object")&&(y=new Error(`${a} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${a.toLowerCase()}`):(e.detail=A,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Zw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:a,intervalMs:n=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&a())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,n))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const Yw={components:{ToolOutput:lr},template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(!0),i=f("all");let l=!1;const o=q(()=>e.value.filter(R=>R.status==="running").length),r=q(()=>e.value.filter(R=>R.status==="completed").length),c=q(()=>e.value.filter(R=>["failed","timeout","killed"].includes(R.status)).length),d=q(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=q(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(R=>["failed","timeout","killed"].includes(R.status)):e.value.filter(R=>R.status===i.value));function p(R){const $=Number(R.max_iterations)||0;return $<=0?0:Math.min(100,Math.round(R.iteration_count/$*100))}function h(R){return(Number(R.max_iterations)||0)>0}function m(R,$){return R?R==="N/A"?"N/A":$==="current_inheritance"?`inherit (currently ${R})`:R:"unknown"}function v(R){return m(R.display_model,R.display_model_source||R.display_source)}function w(R){return m(R.display_reasoning_effort,R.display_reasoning_effort_source||R.display_source)}function A(R){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[R]||""}const y=f(null),g=f(null),b=f(!1),_=f(null),k=f(""),C=av({state:{get detail(){return y.value},set detail(R){y.value=R},get detailId(){return g.value},set detailId(R){g.value=R},get detailLoading(){return b.value},set detailLoading(R){b.value=R},get detailError(){return _.value},set detailError(R){_.value=R}},requestDetail:(R,{signal:$})=>U.get(`/api/agents/${encodeURIComponent(R)}`,{signal:$})});async function x(R){k.value="",await C.open(R.id)}function N(){C.close(),k.value=""}async function F(){await C.refresh()}async function T(R,$){try{await navigator.clipboard.writeText($||""),k.value=R,setTimeout(()=>{k.value===R&&(k.value="")},1500)}catch{we.error("Copy failed")}}async function P(R=!1){R=R===!0,R||(t.value=!0);try{const $=await U.get("/api/agents");e.value=Array.isArray($)?$:[],s.value=null}catch($){R||(s.value=$.message)}R||(t.value=!1)}async function z(R){const $=e.value.find(W=>W.id===R);if(await Kt({title:"Kill agent",message:`Kill agent "${($==null?void 0:$.label)||R}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){a.value=R;try{await U.del(`/api/agents/${encodeURIComponent(R)}`),we.success("Agent killed"),await P()}catch(W){we.error(W.message||"Failed to kill agent")}a.value=null}}const G=Zw({isEnabled:()=>n.value&&l,refreshList:()=>P(!0),hasOpenDetail:()=>!!g.value,refreshDetail:F});function E(){G.start()}function O(){G.stop()}return Ut(n,()=>G.sync()),Ge(()=>{l=!0,P(),E()}),es(()=>{l=!0,P(!0),E()}),Wt(()=>{l=!1,O()}),mt(()=>{l=!1,O(),C.close()}),{agents:e,loading:t,error:s,killing:a,autoRefresh:n,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:In,formatDuration:bi,progressPercent:p,hasProgress:h,displayModelText:v,displayEffortText:w,displaySourceLabel:A,detail:y,detailId:g,detailLoading:b,detailError:_,copied:k,openDetail:x,closeDetail:N,copyText:T,fetchAgents:P,killAgent:z,startAutoRefresh:E,stopAutoRefresh:O}}},Qw={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=f(!1),l=f(null),o=f(null),r=f(null),c=f(null),d=f(null),u=f(!1),p=f(null),h=f("");let m=!1;const w=av({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return p.value},set detailError(O){p.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:R})=>U.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:R})});async function A(O){h.value="",await w.open(O.id)}function y(){w.close(),h.value=""}async function g(O,R){try{await navigator.clipboard.writeText(R||""),h.value=O,setTimeout(()=>{h.value===O&&(h.value="")},1500)}catch{we.error("Copy failed")}}const b=q(()=>e.value.reduce((O,R)=>O+(R.iteration_count||0),0)),_=q(()=>e.value.filter(O=>O.status==="running").length);function k(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function I(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function C(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function x(O=!1){O=O===!0,O||(t.value=!0);try{const R=await U.get("/api/loops");e.value=Array.isArray(R)?R:[],s.value=null}catch(R){O||(s.value=R.message)}O||(t.value=!1)}async function N(){l.value=null;const O=n.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const R={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(R.stop_condition=O.stop_condition.trim()),i.value=!0;try{const $=await U.post("/api/loops",R);we.success(`Loop started: ${$.loop_id}`),n.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},a.value=!1,await x()}catch($){l.value=$.message}i.value=!1}async function F(O){if(await Kt({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=O;try{await U.del(`/api/loops/${encodeURIComponent(O)}`),we.success("Loop stopped"),await x()}catch($){we.error($.message||"Failed to stop loop")}o.value=null}}async function T(O){r.value=O;try{await U.post(`/api/loops/${encodeURIComponent(O)}/restart`),we.success("Loop restarted"),await x()}catch(R){we.error(R.message||"Failed to restart loop")}r.value=null}function P(O){m&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(x(!0),d.value&&w.refresh())}let z=null;function G(){z!==null&&clearInterval(z),z=null}function E(){G(),m&&(z=setInterval(()=>{x(!0),d.value&&w.refresh()},5e3))}return Ge(()=>{m=!0,x(),st.subscribe("events",P),E()}),es(()=>{m=!0,x(!0),E()}),Wt(()=>{m=!1,G()}),mt(()=>{m=!1,st.unsubscribe("events",P),G(),w.close()}),{loops:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:b,runningCount:_,statusDotClass:k,statusBadge:I,modeBadge:C,formatAge:Xm,formatDuration:bi,formatTs:In,formatTokens:tv,openDetail:A,closeDetail:y,copyText:g,fetchLoops:x,doCreate:N,doStop:F,doRestart:T}}},Xw={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!0);let n=null;const i=f(null),l=q(()=>e.value.filter(y=>y.status==="running").length),o=q(()=>e.value.filter(y=>y.status!=="running").length);function r(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await U.get("/api/processes"),s.value=null}catch(g){y||(s.value=g.message)}y||(t.value=!1)}function u(){p(),a.value&&(n=setInterval(()=>{t.value||d(!0)},5e3))}function p(){n&&(clearInterval(n),n=null)}Ut(a,y=>{y?u():p()});async function h(y){if(await Kt({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await U.del(`/api/processes/${y}`),we.success(`Process ${y} killed`),await d()}catch(b){we.error(b.message||"Failed to kill process")}i.value=null}}function m(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let v=!1;function w(){v||(v=!0,d(),st.subscribe("events",m),u())}function A(){v&&(v=!1,st.unsubscribe("events",m),p())}return Ge(w),es(w),Wt(A),mt(A),{processes:e,loading:t,error:s,autoRefresh:a,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:bi,fetchProcesses:d,doKill:h}}},ek=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function dp(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function tk(e,t=!1){const s=n=>String(n).padStart(2,"0"),a=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${a}:${s(e.getSeconds())}`:a}function sk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",a=Math.abs(t),n=Math.floor(a/60),i=a%60;return`UTC${s}${n}${i?`:${String(i).padStart(2,"0")}`:""}`}function ak(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=ek.exec(t);if(!s)return{state:"invalid",typed:t};const[,a,n,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(a,n-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),m=[];for(const w of new Set([p,h])){const A=new Date(u+w*6e4);tk(A,c)===d&&(m.some(y=>y.getTime()===A.getTime())||m.push(A))}if(m.sort((w,A)=>w.getTime()-A.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(w=>({instant:w,offset:sk(w),iso:w.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const nk={template:`
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

    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(!1),n=f({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=f(!1),l=f(null),o=f(null),r=q(()=>ak(n.value.run_at));Ut(()=>n.value.run_at,()=>{o.value=null});const c=q(()=>{var ce;const j=r.value;return j.state==="ok"?j.instant:j.state==="ambiguous"&&o.value!==null&&((ce=j.options[o.value])==null?void 0:ce.instant)||null}),d=q(()=>{const j=c.value;return j?`${j.toLocaleString()} local — ${j.toISOString()} UTC`:""}),u=f(null),p=f(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=f(null),v=f(null),w=f(null),A=f(null),y=f(null),g=f(null),b=f([]),_=f(!1),k=f("");let I=0;const C=q(()=>e.value.filter(j=>j.cron&&!j.one_time).length),x=q(()=>e.value.filter(j=>j.one_time).length),N=q(()=>e.value.filter(j=>j.trigger).length),F=q(()=>e.value.filter(j=>j.paused).length),T=q(()=>e.value.filter(j=>j.consecutive_failures>0).length);function P(j){if(!j)return"-";const ce=Date.now(),Le=(new Date(j).getTime()-ce)/1e3;if(Le<0)return"overdue";if(Le<60)return"in < 1 min";if(Le<3600)return`in ${Math.floor(Le/60)} min`;if(Le<86400){const M=Math.floor(Le/3600),B=Math.floor(Le%3600/60);return B>0?`in ${M}h ${B}m`:`in ${M}h`}const S=Math.floor(Le/86400);return`in ${S} day${S!==1?"s":""}`}function z(j){return j==null?"-":j<1e3?`${j}ms`:j<6e4?`${(j/1e3).toFixed(1)}s`:bi(j/1e3)}function G(j=n.value.cron){n.value.cron=j,dp(n.value,"cron"),u.value=null}function E(j=n.value.run_at){n.value.run_at=j,dp(n.value,"run_at"),u.value=null}async function O(){const j=n.value.cron.trim();if(j){p.value=!0;try{u.value=await U.post("/api/schedules/validate-cron",{expression:j})}catch(ce){u.value={valid:!1,error:ce.message}}p.value=!1}}async function R(){t.value=!0,s.value=null;try{e.value=await U.get("/api/schedules")}catch(j){s.value=j.message}t.value=!1}async function $(j){if(g.value===j){g.value=null,b.value=[];return}g.value=j,_.value=!0,b.value=[];const ce=++I;try{const he=await U.get(`/api/schedules/${encodeURIComponent(j)}/history?limit=10`);if(ce!==I||g.value!==j)return;b.value=he,k.value=""}catch(he){if(ce!==I||g.value!==j)return;b.value=[],k.value=he.message||"Failed to load execution history"}ce===I&&(_.value=!1)}async function Q(){l.value=null;const j=n.value;if(!j.description.trim()){l.value="Description is required";return}if(!j.channel_id.trim()){l.value="Channel ID is required";return}if(!j.cron.trim()&&!j.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(j.cron.trim()&&j.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const ce={description:j.description.trim(),action:j.action,channel_id:j.channel_id.trim()};if(j.cron.trim()&&(ce.cron=j.cron.trim()),j.run_at.trim()){const he=r.value;if(he.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(he.state==="invalid"){l.value="One-time run time is not a valid date";return}const Le=c.value;if(he.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Le){l.value="One-time run time could not be resolved";return}ce.run_at=Le.toISOString()}if(j.action==="reminder"&&j.message.trim()&&(ce.message=j.message.trim()),j.action==="check"&&(j.tool_name.trim()&&(ce.tool_name=j.tool_name.trim()),j.report_format&&(ce.report_format=j.report_format),j.tool_input_str.trim()))try{ce.tool_input=JSON.parse(j.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await U.post("/api/schedules",ce),we.success("Schedule created"),n.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,a.value=!1,await R()}catch(he){l.value=he.message}i.value=!1}async function W(j){m.value=j;try{const ce=await U.post(`/api/schedules/${encodeURIComponent(j)}/run`);if(ce.status==="failure")we.error(`Execution failed: ${ce.error||"unknown error"}`);else{const he=ce.warning?`Executed (${ce.warning})`:"Executed successfully";we.success(he)}await R()}catch(ce){we.error(ce.message||"Failed to trigger")}m.value=null}async function Z(j){w.value=j.id;const ce=!j.paused;try{await U.put(`/api/schedules/${encodeURIComponent(j.id)}`,{paused:ce}),we.success(ce?"Schedule paused":"Schedule resumed"),await R()}catch(he){we.error(he.message||"Failed to update schedule")}w.value=null}const re=new Map;function J(j,ce){const he=re.get(j.id);he&&clearTimeout(he.timer);const Le={run:()=>pe(j,ce),timer:null};Le.timer=setTimeout(()=>{re.delete(j.id),Le.run()},500),re.set(j.id,Le)}async function pe(j,ce){y.value=j.id;try{await U.put(`/api/schedules/${encodeURIComponent(j.id)}`,{report_format:ce}),we.success(ce?"Structured report enabled":"Plain-text report enabled")}catch(he){we.error(`Update failed: ${he.message}`)}finally{await R(),y.value=null}}function Ne(){for(const[j,ce]of[...re])clearTimeout(ce.timer),re.delete(j),ce.run()}async function ae(j){A.value=j;try{await U.post(`/api/schedules/${encodeURIComponent(j)}/reset-failures`),we.success("Failure counters reset"),await R()}catch(ce){we.error(ce.message||"Failed to reset")}A.value=null}async function be(j){const ce=e.value.find(Le=>Le.id===j);if(await Kt({title:"Delete schedule",message:`Delete "${(ce==null?void 0:ce.description)||j}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=j;try{await U.del(`/api/schedules/${encodeURIComponent(j)}`),we.success("Schedule deleted"),await R()}catch(Le){we.error(Le.message||"Failed to delete schedule")}v.value=null}}return Ge(()=>{R()}),mt(Ne),{schedules:e,loading:t,error:s,showCreate:a,form:n,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:h,runningId:m,deletingId:v,togglingId:w,resettingId:A,reportUpdatingId:y,flushReportFormatTimers:Ne,expandedId:g,history:b,historyLoading:_,historyError:k,cronCount:C,oneTimeCount:x,webhookCount:N,pausedCount:F,failingCount:T,formatTs:In,formatAge:Xm,formatFuture:P,formatMs:z,formatDuration:bi,onCronInput:G,onRunAtInput:E,validateCron:O,toggleExpand:$,fetchSchedules:R,doCreate:Q,doRunNow:W,doTogglePause:Z,doUpdateReportFormat:J,doResetFailures:ae,doDelete:be}}},nv=[{id:"live",label:"Live",component:qw},{id:"agents",label:"Agents",component:Yw},{id:"loops",label:"Loops",component:Qw},{id:"processes",label:"Processes",component:Xw},{id:"schedules",label:"Schedules",component:nk}],ik={components:{TabbedPage:ir},setup(){return{tabs:nv}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},lk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f({tool:"",user:"",keyword:"",date:"",limit:50});function i(m){if(!m)return"";if(typeof m=="string")return m;try{return JSON.stringify(m,null,2)}catch{return String(m)}}function l(m){a.value=a.value===m?null:m}function o(){n.value={tool:"",user:"",keyword:"",date:"",limit:50},h()}let r=0;const c=f(!1),d=f(null),u=f(null);async function p(){c.value=!0,u.value=null;try{d.value=await U.get("/api/audit/verify")}catch(m){m.status===409&&m.data&&typeof m.data=="object"?d.value=m.data.availability==="not_enabled"?{...m.data,not_enabled:!0}:m.data:(d.value=null,u.value=m.message||"verification request failed")}c.value=!1}async function h(){const m=++r;t.value=!0,s.value=null,a.value=null;try{const v=new URLSearchParams;n.value.tool&&v.set("tool",n.value.tool),n.value.user&&v.set("user",n.value.user),n.value.keyword&&v.set("q",n.value.keyword),n.value.date&&v.set("date",n.value.date),v.set("limit",String(n.value.limit));const w=v.toString(),A=await U.get(`/api/audit${w?"?"+w:""}`);if(m!==r)return;e.value=Array.isArray(A)?A:[]}catch(v){if(m!==r)return;s.value=v.message}m===r&&(t.value=!1)}return Ge(()=>{h()}),{entries:e,loading:t,error:s,expandedIdx:a,filters:n,formatTs:In,formatDetail:i,truncateBlock:ev,toggleExpand:l,clearFilters:o,fetchAudit:h,verifying:c,verifyResult:d,verifyError:u,verifyIntegrity:p}}},up=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ok=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],rk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(null),n=f(null),i=f(!1);let l=0;const o=f(null),r=f(!1),c=f(new Set),d=f(!1),u=f("all"),p=f(""),h=f("last_active"),m=f(!1),v=up,w=ok,A=f([]),y=f(!1),g=f(""),b=f("flat"),_=f(new Set),k=f(""),I=f(""),C=f(""),x=f(null),N=f(!1),F=f(""),T=f(!1);let P=0;Ut([k,I,C],()=>{P++,N.value=!1,F.value="",T.value=x.value!==null},{flush:"sync"});function z(){try{const te=localStorage.getItem("odin-session-presets");te&&(A.value=JSON.parse(te))}catch{}}function G(){try{localStorage.setItem("odin-session-presets",JSON.stringify(A.value))}catch{}}const E=q(()=>p.value.trim()!==""||u.value!=="all"),O=q(()=>{let te=[...e.value];const Te=up.find(We=>We.id===u.value),De=Te?Te.filters:{};if(De.source&&(te=te.filter(We=>We.source===De.source)),De.minMessages&&(te=te.filter(We=>We.message_count>=De.minMessages)),De.hasCompaction&&(te=te.filter(We=>We.has_summary)),De.maxAge!=null){const We=Date.now()/1e3;te=te.filter(Dt=>Dt.last_active&&We-Dt.last_active<=De.maxAge)}if(p.value.trim()){const We=p.value.toLowerCase().trim();te=te.filter(Dt=>(Dt.channel_id||"").toLowerCase().includes(We)||(Dt.last_user_id||"").toLowerCase().includes(We)||(Dt.source||"").toLowerCase().includes(We))}const Qe=h.value,Nt=m.value?1:-1;return te.sort((We,Dt)=>{const Vt=We[Qe]||0,ms=Dt[Qe]||0;return(Vt-ms)*Nt}),te}),R=q(()=>{if(!n.value||!n.value.messages)return[];const te=n.value.messages;if(te.length===0)return[];const Te=[];let De=[];for(const Qe of te)Qe.role==="user"&&De.length>0&&(Te.push(De),De=[]),De.push(Qe);return De.length>0&&Te.push(De),Te}),$=q(()=>O.value.length>0&&c.value.size===O.value.length);function Q(te){const Te=te.find(De=>De.role==="user");if(Te&&Te.content){const De=Te.content.slice(0,120);return De.length<Te.content.length?De+"...":De}return"(no user message)"}function W(te){const Te=new Set(_.value);Te.has(te)?Te.delete(te):Te.add(te),_.value=Te}function Z(te){u.value=te}function re(te){u.value=te.id,te.filters.searchQuery!=null&&(p.value=te.filters.searchQuery),te.filters.sortBy&&(h.value=te.filters.sortBy)}function J(){if(!g.value.trim())return;const te={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};A.value=[...A.value,te],G(),y.value=!1,g.value=""}function pe(te){A.value=A.value.filter(Te=>Te.id!==te),G(),u.value===te&&(u.value="all")}function Ne(){u.value="all",p.value="",h.value="last_active",m.value=!1}function ae(te){if(!te)return"—";const Te=Date.now()/1e3-te;if(Te<60)return"just now";if(Te<3600){const Qe=Math.floor(Te/60);return`${Qe} minute${Qe!==1?"s":""} ago`}if(Te<86400){const Qe=Math.floor(Te/3600);return`${Qe} hour${Qe!==1?"s":""} ago`}const De=Math.floor(Te/86400);return`${De} day${De!==1?"s":""} ago`}function be(te){if(!te)return"";try{return new Date(te*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function j(te){if(!te)return"";try{return new Date(te*1e3).toLocaleString()}catch{return""}}function ce(te){return te==="user"?"bg-gray-900/50 border border-gray-800":te==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function he(te){return te==="user"?"sess-msg-user":te==="assistant"?"sess-msg-assistant":"sess-msg-system"}function Le(te){return te==="user"?"badge-info":te==="assistant"?"badge-success":"badge-warning"}function S(te){return te==="user"?"sess-dot-user":te==="assistant"?"sess-dot-assistant":"sess-dot-system"}function M(te){return te==="user"?"text-cyan-400":te==="assistant"?"text-indigo-400":"text-gray-500"}function B(te){return te?te.length>2e3?te.slice(0,2e3)+`
... (truncated)`:te:""}async function de(){const te=k.value.trim();if(!te)return;const Te=++P;N.value=!0,F.value="",T.value=x.value!==null;try{let De=`/api/sessions/search?q=${encodeURIComponent(te)}&limit=50`;I.value.trim()&&(De+=`&channel_id=${encodeURIComponent(I.value.trim())}`),C.value.trim()&&(De+=`&user_id=${encodeURIComponent(C.value.trim())}`);const Qe=await U.get(De);if(Te!==P)return;x.value=Qe.results||[],T.value=!1}catch(De){if(Te!==P)return;F.value=De.message||"Search failed. Please retry."}finally{Te===P&&(N.value=!1)}}function ne(){P++,k.value="",I.value="",C.value="",x.value=null,F.value="",T.value=!1,N.value=!1}function oe(te){return te?te.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function me(te){return te==="user"?"fts-result-user":te==="assistant"?"fts-result-assistant":te==="summary"?"fts-result-summary":te==="fts"?"fts-result-fts":te==="channel"?"fts-result-channel":"fts-result-default"}function H(te){return te==="user"?"badge-info":te==="assistant"?"badge-success":te==="summary"?"badge-warning":te==="fts"?"badge-success":"badge-info"}let ee=0;async function X(){const te=++ee;t.value=!0,s.value=null;try{const Te=await U.get("/api/sessions");if(te!==ee)return;e.value=Te}catch(Te){if(te!==ee)return;s.value=Te.message}te===ee&&(t.value=!1)}function fe(){s.value=null,X()}async function ue(te){if(a.value===te){a.value=null,n.value=null,_.value=new Set;return}a.value=te,n.value=null,i.value=!0,_.value=new Set;const Te=++l;try{const De=await U.get(`/api/sessions/${encodeURIComponent(te)}`);Te===l&&a.value===te&&(n.value=De)}catch(De){Te===l&&a.value===te&&(n.value={messages:[],summary:"",error:De.message||"Failed to load session"})}finally{Te===l&&(i.value=!1)}}function ye(te){const Te=new Set(c.value);Te.has(te)?Te.delete(te):Te.add(te),c.value=Te}function Ie(){$.value?c.value=new Set:c.value=new Set(O.value.map(te=>te.channel_id))}function ve(te){o.value=te}async function Fe(){if(o.value){r.value=!0;try{await U.del(`/api/sessions/${encodeURIComponent(o.value)}`),a.value===o.value&&(a.value=null,n.value=null),c.value.delete(o.value),await X()}catch(te){s.value=te.message||"Failed to clear session"}r.value=!1,o.value=null}}function $e(){d.value=!0}async function ze(){if(c.value.size!==0){r.value=!0;try{await U.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(a.value)&&(a.value=null,n.value=null),c.value=new Set,await X()}catch(te){s.value=te.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function Ye(te,Te){const De=`/api/sessions/${encodeURIComponent(te)}/export?format=${Te}`;try{const Qe=await U.getBlob(De),Nt=URL.createObjectURL(Qe),We=document.createElement("a");We.href=Nt,We.download=`session-${te}.${Te==="text"?"txt":"json"}`,We.click(),URL.revokeObjectURL(Nt)}catch(Qe){s.value=Qe.message||"Failed to export session"}}let at=null;function nt(te){te.payload&&te.payload.channel_id&&(clearTimeout(at),at=setTimeout(()=>{if(X(),a.value&&te.payload.channel_id===a.value){const Te=a.value,De=l;U.get(`/api/sessions/${encodeURIComponent(Te)}`).then(Qe=>{De!==l||a.value!==Te||(n.value=Qe)}).catch(()=>{})}},2e3))}let Y=!1,xe=null;function Ce(){Y||(Y=!0,X(),st.subscribe("events",nt),xe=st.onReconnected(()=>X()))}Ge(()=>{z(),Ce()}),es(()=>{Ce()});function Oe(){Y&&(Y=!1,st.unsubscribe("events",nt),xe&&(xe(),xe=null),clearTimeout(at))}return Wt(Oe),mt(Oe),{sessions:e,loading:t,error:s,expandedId:a,detail:n,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:$,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:m,filterPresets:v,sortOptions:w,filteredSessions:O,hasActiveFilters:E,customPresets:A,showSavePreset:y,newPresetName:g,threadView:b,threads:R,collapsedThreads:_,ftsQuery:k,ftsChannelId:I,ftsUserId:C,ftsResults:x,ftsSearching:N,ftsError:F,ftsStale:T,formatAge:ae,formatTimestamp:be,formatFullTimestamp:j,messageClass:ce,threadMsgClass:he,roleBadge:Le,roleDotClass:S,roleLabelClass:M,truncateContent:B,threadSummary:Q,fetchSessions:X,retry:fe,toggleSession:ue,toggleSelect:ye,toggleSelectAll:Ie,confirmClear:ve,clearSession:Fe,confirmBulkClear:$e,doBulkClear:ze,exportSession:Ye,applyPreset:Z,applyCustomPreset:re,saveCustomPreset:J,removeCustomPreset:pe,resetFilters:Ne,toggleThread:W,runFtsSearch:de,clearFtsSearch:ne,highlightSnippet:oe,ftsResultClass:me,ftsTypeBadge:H}}},ck={props:["trace"],template:`
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
  `,setup(){return{formatTokens:tv}}},dk={components:{ContextAssemblyPanel:ck},template:`
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
    </div>`,setup(){const e=f([]),t=f([]),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=f(""),r=f(0),c=f({}),d=f({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(I){if(!I)return"—";try{const C=new Date(I);return isNaN(C.getTime())?I:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return I}}function p(I){return!I&&I!==0?"—":I<1e3?I+"ms":(I/1e3).toFixed(1)+"s"}function h(I){return!I&&I!==0?"—":I>=1e3?(I/1e3).toFixed(1)+"k":String(I)}function m(I){if(!I)return"";if(typeof I=="string")return I;try{return JSON.stringify(I,null,2)}catch{return String(I)}}function v(I){n.value===I?n.value=null:(n.value=I,c.value={})}function w(I,C){const x=I+"-"+C;c.value={...c.value,[x]:!c.value[x]}}function A(I,C){return!!c.value[I+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,_()}async function g(){try{const I=await U.get("/api/trajectories");e.value=I.files||[],r.value=I.count||0}catch{}}let b=0;async function _(){const I=++b;s.value=!0,a.value=null,n.value=null,i.value=null,c.value={};try{if(o.value){const C=await U.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(I!==b)return;let x=C.entries||[];d.value.tool_name&&(x=x.filter(N=>(N.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(x=x.filter(N=>N.is_error)),d.value.channel_id&&(x=x.filter(N=>N.channel_id===d.value.channel_id)),d.value.user_id&&(x=x.filter(N=>N.user_id===d.value.user_id)),t.value=x}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const x=C.toString(),N=await U.get(`/api/trajectories/search/query?${x}`);if(I!==b)return;t.value=N.results||[]}}catch(C){if(I!==b)return;a.value=C.message}I===b&&(s.value=!1)}async function k(){if(!l.value.trim())return;const I=++b;s.value=!0,a.value=null,c.value={};try{const C=await U.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(I!==b)return;i.value=C.entry||null,i.value||(a.value="No trace found for this message ID")}catch(C){if(I!==b)return;C.status===404?(i.value=null,a.value="No trace found for message ID: "+l.value):a.value=C.message}I===b&&(s.value=!1)}return Ge(async()=>{await g(),await _()}),{files:e,entries:t,loading:s,error:a,expandedIdx:n,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:m,truncateBlock:ev,toggleExpand:v,toggleIteration:w,isIterationExpanded:A,clearFilters:y,fetchFiles:g,fetchTraces:_,lookupMessage:k}}};function uk(e){const t=Number(e);return!Number.isFinite(t)||t<=0?"—":t<1e3?`${Math.round(t)} ms`:t<6e4?`${(t/1e3).toFixed(1)} s`:t<36e5?`${(t/6e4).toFixed(1)} min`:`${(t/36e5).toFixed(1)} h`}function pk(e){return e?`${e.approximate?"~":""}${Cd(e.total||0)}`:"0"}const fk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f({available:!0,coverage:{},work:{},activity:[],serving:[],tools:[],automation:[]}),n=f("7d"),i=f(0),l=f(Date.now());let o=null,r=null,c=!1,d=0;const u=[{key:"24h",label:"24 hours"},{key:"7d",label:"7 days"},{key:"30d",label:"30 days"},{key:"all",label:"All time"}],p=q(()=>a.value.work||{}),h=q(()=>Math.max(1,...(a.value.activity_over_time||[]).map(k=>Number(k.count||0)))),m=q(()=>({minWidth:`max(100%, ${(a.value.activity_over_time||[]).length*5}px)`})),v=k=>({height:`${Math.max(4,Math.round(Number(k||0)/h.value*100))}%`}),w=q(()=>s.value&&l.value-i.value>3e4);async function A(){const k=++d,I=n.value;try{const C=await U.get(`/api/usage?range=${encodeURIComponent(I)}`);if(k!==d||I!==n.value)return;a.value=C,i.value=Date.now(),l.value=i.value,s.value=!0,t.value=null}catch(C){k===d&&(t.value=C.message)}finally{k===d&&(e.value=!1)}}function y(k){n.value=k,e.value=!s.value,A()}function g(){e.value=!0,A()}function b(){c||(c=!0,A(),o=setInterval(A,15e3),r=setInterval(()=>{l.value=Date.now()},1e3))}function _(){c&&(c=!1,d+=1,o&&clearInterval(o),r&&clearInterval(r),o=null,r=null)}return Ge(b),es(b),Wt(_),mt(_),{data:a,work:p,loading:e,error:t,hasData:s,range:n,ranges:u,isStale:w,fmtNum:Cd,fmtDuration:uk,tokenLabel:pk,activityTrackStyle:m,activityBar:v,selectRange:y,retry:g}}},iv=[{id:"audit",label:"Audit",component:lk},{id:"sessions",label:"Sessions",component:rk},{id:"traces",label:"Traces",component:dk},{id:"usage",label:"Usage & Activity",component:fk}],hk={components:{TabbedPage:ir},setup(){return{tabs:iv}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Ar=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|apply_patch|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],mk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f({}),i=f({}),l=f("cards"),o=f(null),r=f(null),c=f(!1),d=f(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(x){return x.source!=="builtin"?"":u[x.state]||""}function h(x,N){const F=x&&Array.isArray(x.tools)?x.tools:null;if(c.value=!!F,r.value=F?!!x.global_enabled:null,!F){e.value=N.map(z=>({...z,source:"unknown",enabled:void 0,state:null}));return}const T=new Set(F.map(z=>z.name)),P=N.filter(z=>!T.has(z.name)).map(z=>({...z,source:z.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...F.map(z=>({...z,source:"builtin"})),...P]}async function m(x,N){if(d.value.has(x.name))return;const F=!!N.target.checked,T=new Set(d.value);T.add(x.name),d.value=T;try{const P=await U.post(`/api/tools/builtins/${encodeURIComponent(x.name)}/enabled`,{enabled:F});h(P,e.value),s.value=null;try{const z=await U.get("/api/tools");h(P,z)}catch(z){console.warn("Built-in toggle committed; visible catalog refresh failed",z)}}catch(P){N.target.checked=!!x.enabled,s.value=P.message||`Failed to toggle ${x.name}`}finally{const P=new Set(d.value);P.delete(x.name),d.value=P}}const v=q(()=>e.value.filter(x=>x.source==="builtin"&&x.is_core).length),w=q(()=>e.value.filter(x=>x.source==="skill").length),A=q(()=>Object.values(n.value).reduce((x,N)=>x+N,0));function y(x){for(const N of Ar)if(N.id!=="other"&&N.match(x))return N.id;return"other"}const g=q(()=>{let x=e.value;if(a.value){const N=a.value.toLowerCase();x=x.filter(F=>F.name.toLowerCase().includes(N)||(F.description||"").toLowerCase().includes(N))}return o.value&&(x=x.filter(N=>y(N.name)===o.value)),x}),b=q(()=>{const x=new Set;for(const N of e.value)x.add(y(N.name));return Ar.filter(N=>x.has(N.id))}),_=q(()=>{const x=g.value,N={};for(const T of x){const P=y(T.name);N[P]||(N[P]=[]),N[P].push(T)}const F=[];for(const T of Ar)N[T.id]&&N[T.id].length>0&&F.push({label:T.label,icon:T.icon,tools:N[T.id].sort((P,z)=>P.name.localeCompare(z.name))});return F});function k(x){i.value={...i.value,[x]:!i.value[x]}}async function I(){t.value=!0,s.value=null;try{const[x,N,F]=await Promise.all([U.get("/api/tools"),U.get("/api/tools/stats").catch(()=>({})),U.get("/api/tools/builtins").catch(()=>null)]);h(F,x),n.value=N||{}}catch(x){s.value=x.message}t.value=!1}function C(){I()}return Ge(()=>{I()}),{tools:e,loading:t,error:s,search:a,stats:n,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:w,totalUsage:A,filteredTools:g,groupedTools:_,usedCategories:b,stateBadge:p,applyInventory:h,toggleBuiltinTool:m,truncate:Td,toggleExpand:k,refresh:C}}};function vk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const a="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(a,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function gk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,a)=>a+1).join(`
`)}const bk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f({}),i=f(null),l=f(""),o=f(null),r=f(!1),c=f("create"),d=f(""),u=f(""),p=f(null),h=f(null),m=f(!1),v=f(null),w=f(null),A=f(!1),y=q(()=>e.value.length),g=q(()=>e.value.reduce((J,pe)=>J+(pe.execution_count||0),0)),b=q(()=>e.value.reduce((J,pe)=>J+N(pe.code),0)),_=q(()=>{if(!l.value)return e.value;const J=l.value.toLowerCase();return e.value.filter(pe=>pe.name.toLowerCase().includes(J)||(pe.description||"").toLowerCase().includes(J))}),k=q(()=>u.value?u.value.split(`
`).length:0),I=q(()=>{const J=Math.max(k.value,1);return Array.from({length:J},(pe,Ne)=>Ne+1).join(`
`)}),C=q(()=>{const J=u.value.trim();return J?J.includes("SKILL_DEFINITION")?J.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function x(J){return vk(J)}function N(J){return J?J.split(`
`).length:0}function F(J){return gk(J)}function T(J){a.value={...a.value,[J]:!a.value[J]}}async function P(J){try{await navigator.clipboard.writeText(J);const pe=e.value.find(Ne=>Ne.code===J);pe&&(o.value=pe.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function z(J){if(J.key==="Tab"){J.preventDefault();const pe=J.target,Ne=pe.selectionStart,ae=pe.selectionEnd;u.value=u.value.substring(0,Ne)+"    "+u.value.substring(ae),Ot(()=>{pe.selectionStart=pe.selectionEnd=Ne+4})}}function G(J){const pe=J.target.previousElementSibling;pe&&(pe.scrollTop=J.target.scrollTop)}async function E(){t.value=!0,s.value=null;try{e.value=await U.get("/api/skills")}catch(J){s.value=J.message}t.value=!1}async function O(J){i.value=J,delete n.value[J],n.value={...n.value};try{const pe=await U.post(`/api/skills/${encodeURIComponent(J)}/test`);n.value={...n.value,[J]:pe}}catch(pe){n.value={...n.value,[J]:{result:pe.message,is_error:!0}}}i.value=null}function R(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function $(J){r.value=!0,c.value="edit",d.value=J.name,u.value=J.code||"",p.value=null,h.value=null}function Q(){r.value=!1,p.value=null,h.value=null}async function W(){p.value=null,h.value=null;const J=d.value.trim(),pe=u.value.trim();if(!J){p.value="Name is required";return}if(!pe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await U.post("/api/skills",{name:J,code:pe}),h.value="Skill created successfully"):(await U.put(`/api/skills/${encodeURIComponent(J)}`,{code:pe}),h.value="Skill updated successfully"),await E(),setTimeout(()=>{r.value=!1},800)}catch(Ne){p.value=Ne.message}m.value=!1}function Z(J){w.value=J}async function re(){if(w.value){A.value=!0;try{await U.del(`/api/skills/${encodeURIComponent(w.value)}`),await E()}catch(J){we.error(`Failed to delete skill: ${J.message||"unknown error"}`)}A.value=!1,w.value=null}}return Ge(()=>{E()}),{skills:e,loading:t,error:s,showCode:a,testResults:n,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:m,editorRef:v,deleteTarget:w,deleting:A,enabledCount:y,totalExecutions:g,totalLines:b,displayedSkills:_,editLineCount:k,editorLineNums:I,editValidation:C,highlight:x,truncate:Td,formatTs:In,countLines:N,getLineNumbers:F,toggleCode:T,copyCode:P,handleEditorKey:z,syncScroll:G,fetchSkills:E,testSkill:O,showCreate:R,editSkill:$,cancelEdit:Q,saveSkill:W,confirmDelete:Z,doDelete:re}}};class $s extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const yk=/^[A-Za-z_][A-Za-z0-9_]*$/;function pp(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function fp(e,t,s){const a={},n=[...new Set((t||[]).map(l=>String(l)))],i=new Set(n);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new $s(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new $s(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(a,o))throw new $s(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new $s(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");a[o]=r}}return{set:a,remove:n}}function xk(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function _k(e,{mode:t="add",originalTransport:s=""}={}){const a=t==="add",n=String(e.name||"").trim();if(!n)throw new $s("Server name is required.","name");if(n.length>128||!yk.test(n))throw new $s("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!a&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(a&&(o.name=n),i==="stdio"){const d=String(e.command||"").trim();if((a||l)&&!d)throw new $s("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(a||e.replaceArgs)&&(o.args=pp(e.argsText)),a||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new $s("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((a||l)&&!d)throw new $s("An HTTP endpoint is required for this connection.","url");if(d&&!xk(d))throw new $s("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(a||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new $s("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(a||e.replaceAllowlist)&&(o.tool_allowlist=pp(e.allowlistText));const r=fp(e.headerRows,e.headersRemove,"Header"),c=fp(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function wk(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function kk(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Sk(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(a=>String(a).toLowerCase().includes(s)):!0}const Tk=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Ck(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(a=>(a=window.matchMedia)==null?void 0:a.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const n=t.querySelector(".mcp-editor-groups"),i=n==null?void 0:n.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Ek=1e4,Ak=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function Rr(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function Rk(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Ik={template:`
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
  `,setup(){const e=f(null),t=f(!1),s=f(!1),a=f(!1),n=f(""),i=f({max_published_tools_per_server:"",max_published_tools_global:""}),l=f(new Set),o=q(()=>Object.keys(i.value).every(Y=>{var xe;return Number.isInteger((xe=e.value)==null?void 0:xe[Y])})),r=f(""),c=f(new Set),d=f(new Set),u=f({}),p=f({}),h=f({}),m=f(new Set),v=f(!1),w=f("add"),A=f(""),y=f(null),g=f(Rr()),b=f(""),_=f(!1);let k=null,I=0,C=!1,x=!1;const N=Tk,F=q(()=>{var Y;return((Y=e.value)==null?void 0:Y.servers)||[]}),T=q(()=>{var Y;return!!((Y=e.value)!=null&&Y.enabled)}),P=q(()=>{var Y,xe,Ce,Oe;return{serverCount:((Y=e.value)==null?void 0:Y.server_count)||0,enabledCount:((xe=e.value)==null?void 0:xe.enabled_server_count)||0,connectedCount:((Ce=e.value)==null?void 0:Ce.connected_count)||0,toolCount:((Oe=e.value)==null?void 0:Oe.published_tool_count)||0}}),z=q(()=>{var Y;return((Y=y.value)==null?void 0:Y.header_keys)||[]}),G=q(()=>{var Y;return((Y=y.value)==null?void 0:Y.env_keys)||[]}),E=q(()=>{var Y;return w.value==="edit"&&((Y=y.value)==null?void 0:Y.transport)==="http"}),O=q(()=>w.value==="add"||!E.value),R=q(()=>E.value?"Replace endpoint URL":"Endpoint URL"),$=q(()=>E.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function Q(){W(),k=window.setInterval(()=>Z({quiet:!0}),Ek)}function W(){k&&window.clearInterval(k),k=null}async function Z({quiet:Y=!1}={}){if(a.value)return;const xe=++I;Y||(t.value=!0);try{const Ce=await U.get("/api/mcp/status");if(xe!==I||!C)return;e.value=Ce;for(const te of Object.keys(i.value))!l.value.has(te)&&Number.isInteger(Ce[te])&&(i.value[te]=String(Ce[te]));r.value="";const Oe=new Set((Ce.servers||[]).map(te=>te.name));d.value=new Set([...d.value].filter(te=>Oe.has(te)))}catch(Ce){xe===I&&C&&(r.value=Ce.message||"Failed to load MCP status")}finally{xe===I&&(t.value=!1)}}function re(Y){return s.value||c.value.has(Y)}function J(Y,xe){const Ce=new Set(c.value);xe?Ce.add(Y):Ce.delete(Y),c.value=Ce}function pe(Y){return kk(Y.state)}function Ne(Y){if(pe(Y)==="disabled"){if(!Y.enabled)return"Disabled — server switch off";if(!T.value)return"Disabled — global MCP is off"}return Ak[pe(Y)]}function ae(Y){return Y.transport==="http"?"Streamable HTTP":"stdio"}function be(Y){return Y.negotiated_version?`${Y.era?`${String(Y.era).charAt(0).toUpperCase()}${String(Y.era).slice(1)}`:"Protocol"} · ${Y.negotiated_version}`:"Not negotiated"}function j(Y){return Y.discovered_count?`${Y.published_count||0} published · ${Y.excluded_count||0} excluded`:"No tools discovered"}const ce=f(new Set);async function he(Y,xe){if(ce.value.has(Y.name))return;const Ce=!!xe.target.checked,Oe=new Set(ce.value);Oe.add(Y.name),ce.value=Oe;try{const te=await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/enabled`,{enabled:Ce});te&&Array.isArray(te.servers)?e.value=te:await Z({quiet:!0})}catch(te){xe.target.checked=!!Y.enabled,we.error(te.message||`Failed to toggle ${Y.name}`)}finally{const te=new Set(ce.value);te.delete(Y.name),ce.value=te}}function Le(Y,xe){var Oe;i.value[Y]=xe;const Ce=new Set(l.value);xe===String((Oe=e.value)==null?void 0:Oe[Y])?Ce.delete(Y):Ce.add(Y),l.value=Ce,n.value=""}async function S(){if(s.value||!o.value||!l.value.size)return;const Y={};for(const xe of l.value){const Ce=Number(i.value[xe]),Oe=xe==="max_published_tools_per_server"?128:256;if(!Number.isInteger(Ce)||Ce<1||Ce>Oe){n.value=`Enter a whole number between 1 and ${Oe}.`;return}Y[xe]=Ce}a.value=!0,s.value=!0,n.value="",++I,t.value=!1;try{const xe=await U.post("/api/mcp/limits",Y);e.value=xe;for(const Ce of Object.keys(i.value))Number.isInteger(xe[Ce])&&(i.value[Ce]=String(xe[Ce]));l.value=new Set,we.success("MCP limits saved. Applied at the next publication or tools refresh.")}catch(xe){n.value=xe.message||"Failed to save MCP publication limits"}finally{a.value=!1,s.value=!1,await Z({quiet:!0})}}async function M(Y){if(Y!==T.value&&!(!Y&&!await Kt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await U.post("/api/mcp/enabled",{enabled:Y}),we.success(Y?"MCP enabled":"MCP disabled"),await Z({quiet:!0})}catch(xe){we.error(xe.message||"Failed to update MCP state"),await Z({quiet:!0})}finally{s.value=!1}}}async function B(Y){J(Y.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/reconnect`,{}),we.success(`Reconnected ${Y.name}`)}catch(xe){we.error(xe.message||`Failed to reconnect ${Y.name}`)}finally{J(Y.name,!1),await Z({quiet:!0})}}async function de(Y){J(Y.name,!0);try{await U.post(`/api/mcp/servers/${encodeURIComponent(Y.name)}/refresh-tools`,{}),we.success(`Refreshed tools from ${Y.name}`),await me(Y.name,!0)}catch(xe){we.error(xe.message||`Failed to refresh ${Y.name}`)}finally{J(Y.name,!1),await Z({quiet:!0})}}async function ne(Y){if(await Kt({title:`Remove ${Y.name}`,message:`Remove this saved MCP server? Its ${Y.published_count||0} published tool${Y.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){J(Y.name,!0);try{await U.del(`/api/mcp/servers/${encodeURIComponent(Y.name)}`),we.success(`Removed ${Y.name}`),delete p.value[Y.name]}catch(Ce){we.error(Ce.message||`Failed to remove ${Y.name}`)}finally{J(Y.name,!1),await Z({quiet:!0})}}}async function oe(Y){const xe=new Set(d.value);if(xe.has(Y.name)){xe.delete(Y.name),d.value=xe;return}xe.add(Y.name),d.value=xe,Object.hasOwn(p.value,Y.name)||await me(Y.name)}async function me(Y,xe=!1){if(!xe&&Object.hasOwn(p.value,Y))return;const Ce=new Set(m.value);Ce.add(Y),m.value=Ce,h.value={...h.value,[Y]:""};try{const Oe=await U.get(`/api/mcp/servers/${encodeURIComponent(Y)}/tools`);p.value={...p.value,[Y]:Oe.tools||[]}}catch(Oe){h.value={...h.value,[Y]:Oe.message||"Failed to load tools"}}finally{const Oe=new Set(m.value);Oe.delete(Y),m.value=Oe}}function H(Y){return(p.value[Y]||[]).filter(xe=>Sk(xe,u.value[Y]))}function ee(Y,xe){u.value={...u.value,[Y]:xe}}function X(){w.value="add",A.value="",y.value=null,g.value=Rr(),b.value="",v.value=!0}function fe(Y){w.value="edit",A.value=Y.name,y.value=Y,g.value={...Rr(),name:Y.name,enabled:!!Y.enabled,transport:Y.transport||"stdio"},b.value="",v.value=!0}function ue(){_.value||(v.value=!1)}function ye(Y){v.value&&Ck(Y)}function Ie(Y){const xe=Y==="headers"?"headerRows":"envRows";g.value[xe].push({key:"",value:""})}function ve(Y,xe){const Ce=Y==="headers"?"headerRows":"envRows";g.value[Ce].splice(xe,1)}function Fe(Y,xe){const Ce=Y==="headers"?"headersRemove":"envRemove",Oe=g.value[Ce];g.value[Ce]=Oe.includes(xe)?Oe.filter(te=>te!==xe):[...Oe,xe]}async function $e(){var xe,Ce;b.value="";let Y;try{Y=_k(g.value,{mode:w.value,originalTransport:((xe=y.value)==null?void 0:xe.transport)||""})}catch(Oe){b.value=Oe instanceof $s?Oe.message:"Invalid MCP server configuration",await Ot(),(Ce=document.querySelector(".mcp-editor"))==null||Ce.scrollTo({top:0,behavior:"smooth"});return}if(!(w.value==="edit"&&wk(Y,y.value)&&!await Kt({title:`Change ${A.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){_.value=!0;try{w.value==="add"?await U.post("/api/mcp/servers",Y):await U.put(`/api/mcp/servers/${encodeURIComponent(A.value)}`,Y),we.success(w.value==="add"?`Saved ${Y.name}`:`Updated ${A.value}`),v.value=!1,await Z({quiet:!0})}catch(Oe){b.value=Oe.message||"Failed to save MCP server"}finally{_.value=!1}}}let ze=null;function Ye(Y){`${(Y==null?void 0:Y.event)||""} ${(Y==null?void 0:Y.type)||""} ${(Y==null?void 0:Y.tool)||""} ${(Y==null?void 0:Y.message)||""}`.toLowerCase().includes("mcp")&&(ze&&window.clearTimeout(ze),ze=window.setTimeout(()=>Z({quiet:!0}),200))}function at(){C||(C=!0,x||(st.subscribe("events",Ye),x=!0),Z(),Q())}function nt(){C=!1,W(),ze&&window.clearTimeout(ze),ze=null,x&&(st.unsubscribe("events",Ye),x=!1)}return Ge(at),es(at),Wt(nt),mt(nt),{status:e,loading:t,mutating:s,pageError:r,servers:F,masterEnabled:T,aggregate:P,limitsSaving:a,limitsError:n,limitsAvailable:o,limitDraft:i,limitDirty:l,editLimit:Le,saveLimits:S,expandedServers:d,toolQueries:u,toolErrors:h,toolsLoading:m,editorOpen:v,editorMode:w,editingName:A,editingServer:y,form:g,formError:b,saving:_,editorGroups:N,configuredHeaderKeys:z,configuredEnvKeys:G,savedHttpEndpoint:E,endpointRequired:O,endpointFieldLabel:R,endpointPlaceholder:$,refreshAll:Z,busy:re,serverState:pe,stateLabel:Ne,transportLabel:ae,protocolLabel:be,toolSummary:j,formatAge:Rk,setMasterEnabled:M,togglePending:ce,toggleServerEnabled:he,reconnect:B,refreshTools:de,removeServer:ne,toggleTools:oe,filteredTools:H,setToolQuery:ee,openAdd:X,openEdit:fe,closeEditor:ue,jumpToEditorGroup:ye,addSecretRow:Ie,removeSecretRow:ve,toggleSecretRemoval:Fe,saveServer:$e}}};function Ok(e,t){if(!e||!t)return cp(e);const s=cp(e),a=t.trim().split(/\s+/).filter(Boolean);if(!a.length)return s;const n=a.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${n})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Lk={template:`
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
    </div>`,setup(){const e=f([]),t=f(!0),s=f(null),a=f(""),n=f(null),i=f(!1),l=f(""),o=f(null),r=f(!1),c=f(""),d=f(""),u=f(null),p=f(null),h=f(!1),m=f(null),v=f(null);let w=null;const A=f(null),y=f(!1),g=f({}),b=f({}),_=f({}),k=f({}),I=new Map,C=f(null),x=q(()=>e.value.reduce((W,Z)=>W+(Z.chunks||0),0)),N=q(()=>new Set(e.value.map(Z=>Z.uploader).filter(Boolean)).size);function F(W,Z){const re=b.value[Z];if(!re||re.length===0)return 0;const J=Math.max(...re.map(pe=>pe.char_count||0));return J===0?0:Math.round(W.char_count/J*100)}async function T(){t.value=!0,s.value=null;try{const W=await U.get("/api/knowledge");e.value=Array.isArray(W)?W:[]}catch(W){s.value=W.message}t.value=!1}async function P(W){if(g.value[W]){g.value[W]=!1,C.value=null;return}if(g.value[W]=!0,Object.prototype.hasOwnProperty.call(b.value,W))return;if(I.has(W))return I.get(W);const Z={...k.value,[W]:!0};k.value=Z;const re={..._.value};delete re[W],_.value=re;const J=U.get(`/api/knowledge/${encodeURIComponent(W)}/chunks`).then(pe=>{b.value={...b.value,[W]:Array.isArray(pe)?pe:[]}}).catch(pe=>{_.value={..._.value,[W]:pe.message||"load failed"}}).finally(()=>{if(I.get(W)!==J)return;I.delete(W);const pe={...k.value};delete pe[W],k.value=pe});return I.set(W,J),J}let z=0;async function G(){const W=a.value.trim();if(!W)return;const Z=++z;i.value=!0,o.value=null,l.value=W;try{const re=await U.get(`/api/knowledge/search?q=${encodeURIComponent(W)}`);if(Z!==z)return;n.value=Array.isArray(re)?re:[]}catch(re){if(Z!==z)return;n.value=[],o.value=re.message||"Search failed"}Z===z&&(i.value=!1)}function E(){z+=1,i.value=!1,n.value=null,a.value="",o.value=null}async function O(){u.value=null,p.value=null;const W=c.value.trim(),Z=d.value.trim();if(!W){u.value="Source name is required";return}if(!Z){u.value="Content is required";return}h.value=!0;try{const re=await U.post("/api/knowledge",{source:W,content:Z});p.value=`Ingested ${re.chunks||0} chunks from "${W}"`,c.value="",d.value="",b.value={},await T(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(re){u.value=re.message}h.value=!1}async function R(W){m.value=W,v.value=null,w&&(clearTimeout(w),w=null);try{const Z=await U.post(`/api/knowledge/${encodeURIComponent(W)}/reingest`);v.value={source:W,error:!1,message:`Re-ingested ${Z.chunks||0} chunks`},delete b.value[W],await T(),w=setTimeout(()=>{v.value=null,w=null},3e3)}catch(Z){v.value={source:W,error:!0,message:Z.message}}m.value=null}function $(W){A.value=W}async function Q(){if(A.value){y.value=!0;try{await U.del(`/api/knowledge/${encodeURIComponent(A.value)}`),delete b.value[A.value],await T()}catch(W){we.error(`Failed to delete source: ${W.message||"unknown error"}`)}y.value=!1,A.value=null}}return Ge(()=>{T()}),{sources:e,loading:t,error:s,searchQuery:a,searchResults:n,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:m,reingestResult:v,deleteTarget:A,deleting:y,expanded:g,sourceChunks:b,chunkErrors:_,loadingChunks:k,selectedChunk:C,totalChunks:x,uploaderCount:N,truncate:Td,formatTs:In,highlightTerms:Ok,chunkBarWidth:F,fetchSources:T,toggleSource:P,doSearch:G,clearSearch:E,doIngest:O,doReingest:R,confirmDelete:$,doDelete:Q}}},Nk={template:`
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
    </div>`,setup(){const e=f([]),t=f({}),s=f(!0),a=f(null),n=f({}),i=f(null),l=f(""),o=f(!1),r=f({scope:"global",key:"",value:""}),c=f(!1),d=f(null),u=f(null),p=f(null),h=f(""),m=f(!1),v=f(null),w=f(null),A=f(new Set),y=f(null),g=f(!1),b=f(!1),_=q(()=>e.value.reduce((Z,re)=>Z+re.count,0)),k=q(()=>A.value.size);function I(Z){const re=t.value[Z];if(!re)return[];if(!l.value.trim())return re;const J=l.value.trim().toLowerCase();return re.filter(pe=>pe.key.toLowerCase().includes(J)||pe.value&&pe.value.toLowerCase().includes(J))}function C(Z,re){return A.value.has(Z+"/"+re)}function x(Z,re){const J=Z+"/"+re,pe=new Set(A.value);pe.has(J)?pe.delete(J):pe.add(J),A.value=pe}function N(Z){const re=t.value[Z];return!re||re.length===0?!1:re.every(J=>A.value.has(Z+"/"+J.key))}function F(Z,re){const J=t.value[Z];if(!J)return;const pe=new Set(A.value);for(const Ne of J){const ae=Z+"/"+Ne.key;re?pe.add(ae):pe.delete(ae)}A.value=pe}async function T(){s.value=!0,a.value=null;try{const Z=await U.get("/api/memory");e.value=Object.entries(Z).map(([re,J])=>({name:re,keys:J.keys||[],count:J.count||0}))}catch(Z){a.value=Z.message}s.value=!1}async function P(Z){if(n.value[Z]){n.value[Z]=!1;return}n.value[Z]=!0;const re=e.value.find(pe=>pe.name===Z);if(!re||t.value[Z]||i.value===Z)return;i.value=Z;let J;try{const Ne=(await U.get(`/api/memory/${encodeURIComponent(Z)}`)).entries||{};J=re.keys.map(ae=>Object.prototype.hasOwnProperty.call(Ne,ae)?{key:ae,value:Ne[ae]||"",failed:!1}:{key:ae,value:"",failed:!0,error:"Not found in scope"})}catch(pe){J=re.keys.map(Ne=>({key:Ne,value:"",failed:!0,error:pe.message||"Failed to load"}))}t.value[Z]=J,i.value=null}function z(Z,re,J){p.value=Z+"/"+re,h.value=J}async function G(Z,re){m.value=!0,v.value=null;try{await U.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`,{value:h.value});const J=t.value[Z];if(J){const pe=J.find(Ne=>Ne.key===re);pe&&(pe.value=h.value)}p.value=null}catch(J){v.value=`Failed to save: ${J.message||"unknown error"}`}m.value=!1}async function E(Z,re){try{await navigator.clipboard.writeText(re.value),w.value=Z+"/"+re.key,setTimeout(()=>{w.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const Z=r.value.scope.trim(),re=r.value.key.trim(),J=r.value.value.trim();if(!Z){d.value="Scope is required";return}if(!re){d.value="Key is required";return}if(!J){d.value="Value is required";return}c.value=!0;try{await U.put(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`,{value:J}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await T(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(pe){d.value=pe.message}c.value=!1}function R(Z,re){y.value={scope:Z,key:re}}async function $(){if(!y.value)return;g.value=!0,v.value=null;const{scope:Z,key:re}=y.value;try{await U.del(`/api/memory/${encodeURIComponent(Z)}/${encodeURIComponent(re)}`);const J=t.value[Z];J&&(t.value[Z]=J.filter(ae=>ae.key!==re));const pe=e.value.find(ae=>ae.name===Z);pe&&(pe.count--,pe.keys=pe.keys.filter(ae=>ae!==re));const Ne=new Set(A.value);Ne.delete(Z+"/"+re),A.value=Ne}catch(J){v.value=`Failed to delete: ${J.message||"unknown error"}`}g.value=!1,y.value=null}function Q(){b.value=!0}async function W(){g.value=!0,v.value=null;const Z=[];for(const re of A.value){const J=re.indexOf("/");Z.push({scope:re.slice(0,J),key:re.slice(J+1)})}try{await U.post("/api/memory/bulk-delete",{entries:Z}),A.value=new Set,t.value={},await T()}catch(re){v.value=`Bulk delete failed: ${re.message||"unknown error"}`}g.value=!1,b.value=!1}return Ge(()=>{T()}),{scopes:e,scopeEntries:t,loading:s,error:a,expanded:n,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:m,actionError:v,copied:w,selected:A,selectedCount:k,totalEntries:_,deleteTarget:y,deleting:g,showBulkDelete:b,fetchMemory:T,toggleScope:P,startEdit:z,doEdit:G,copyValue:E,doAdd:O,confirmDelete:R,doDelete:$,confirmBulkDelete:Q,doBulkDelete:W,isSelected:C,toggleSelect:x,isScopeAllSelected:N,toggleSelectAll:F,filteredEntries:I}}},Dk={template:`
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
  `,setup(){const e=f([]),t=f(null),s=f(!0),a=f(null),n=f(null),i=f(null),l=f(""),o=q(()=>[...new Set(e.value.map(w=>w.category))].sort()),r=q(()=>{const v={};return e.value.forEach(w=>{v[w.category]=(v[w.category]||0)+1}),v}),c=q(()=>n.value?e.value.filter(v=>v.category===n.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await U.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,we.success("Entry updated"),await m()}catch(w){we.error(w.message||"Failed to save entry")}}async function h(v){if(await Kt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/learned/"+encodeURIComponent(v)),we.success("Entry deleted"),await m()}catch(A){we.error(A.message||"Failed to delete entry")}}async function m(){s.value=!0,a.value=null;try{const v=await U.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){a.value=v.message}s.value=!1}return Ge(m),{entries:e,meta:t,loading:s,error:a,filterCat:n,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:In,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:m}}},lv=[{id:"tools",label:"Tools",component:mk},{id:"skills",label:"Skills",component:bk},{id:"mcp-servers",label:"MCP Servers",component:Ik},{id:"knowledge",label:"Knowledge",component:Lk},{id:"memory",label:"Memory",component:Nk},{id:"learned",label:"Learned",component:Dk}],Pk={components:{TabbedPage:ir},setup(){return{tabs:lv}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Mk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Fk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},$k={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Uk={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f(!1),n=f(!1),i=q(()=>e.value.components||[]),l=q(()=>$k[e.value.overall]||"text-gray-400"),o=q(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=q(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return Mk[k]||"text-gray-400"}function d(k){return Fk[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function h(k){return k.replace(/_/g," ").replace(/\b\w/g,I=>I.toUpperCase())}function m(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function v(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function w(){n.value=!0;try{e.value=await U.get("/api/health/components"),s.value=null,a.value=!0}catch(k){s.value=k.message}finally{t.value=!1,n.value=!1}}function A(){t.value=!0,s.value=null,w()}let y=null,g=!1;function b(){g||(g=!0,w(),y||(y=setInterval(w,3e4)))}function _(){g&&(g=!1,y&&(clearInterval(y),y=null))}return Ge(b),es(b),Wt(_),mt(_),{data:e,hasData:a,loading:t,error:s,refreshing:n,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:m,formatNumber:v,fetchHealth:w,retry:A}}},Bk={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f(!1),n=f("sessions"),i=f(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=q(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=q(()=>{if(!i.value)return[];const w=i.value,A=w.storage_total_bytes||1;return[{label:"Session Persistence",mb:w.sessions.persist_dir.total_mb,bytes:w.sessions.persist_dir.total_bytes,files:w.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(w.sessions.persist_dir.total_bytes/A*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:w.knowledge.db_file.total_mb,bytes:w.knowledge.db_file.total_bytes,files:w.knowledge.db_file.file_count,pct:Math.min(100,Math.round(w.knowledge.db_file.total_bytes/A*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:w.trajectories.message_dir.total_mb,bytes:w.trajectories.message_dir.total_bytes,files:w.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.message_dir.total_bytes/A*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:w.trajectories.agent_dir.total_mb,bytes:w.trajectories.agent_dir.total_bytes,files:w.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(w.trajectories.agent_dir.total_bytes/A*100)),color:"res-bar-amber"}]});async function d(){try{const w=await U.get("/api/resource-usage");i.value=w,t.value=null,s.value=!0}catch(w){t.value=w.message||"Failed to load resource usage"}finally{e.value=!1,a.value=!1}}async function u(){a.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function m(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function v(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ge(m),es(m),Wt(v),mt(v),{hasData:s,loading:e,error:t,refreshing:a,data:i,activeTab:n,tabs:o,collectedAt:r,storageItems:c,fmtNum:Cd,refresh:u,retry:p}}},Hk=new Set(["timestamp","type","level","tool_name","action","method","path","status","success","execution_time_ms","duration_ms","metadata","audit_metadata","turn","tool_input","audit_observer","_hmac","_prev_hmac","agent_id","agent_label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","result_summary","detail","message","diff","error"]),zk=new Set(["agent_id","agent_label","label","parent_agent_id","root_agent_id","originating_turn_id","turn_id","iteration","call_id","status","duration_ms","tool_input_keys","audit_observer","_hmac","_prev_hmac"]);function jk(e){const t={};for(const s of["metadata","audit_metadata"]){if(!(e!=null&&e[s])||typeof e[s]!="object")continue;const a=Object.fromEntries(Object.entries(e[s]).filter(([n])=>!zk.has(n)));Object.keys(a).length&&(t[s]=a)}return Object.keys(t).length?ml(t):""}function Vk(e){var n,i,l,o;const t=e.record;if(!t)return{body:e.text,action:"",status:"",duration:null};let s;for(const r of["result_summary","detail","message","diff","error"])if(t[r]!==void 0&&t[r]!==null&&t[r]!==""){s=t[r];break}if(s===void 0&&((n=t.metadata)!=null&&n.error)&&(s=t.metadata.error),s===void 0){const r=Object.fromEntries(Object.entries(t).filter(([c])=>!Hk.has(c)));s=Object.keys(r).length?ml(r):""}const a=t.status??((i=t.metadata)==null?void 0:i.status)??(t.error||t.success===!1?"failed":t.success===!0?"success":["tool_start","loop_tool_start"].includes(t.type)?"started":"");return{body:s,action:t.tool_name||t.action||(t.method?`${t.method} ${t.path||""}`.trim():t.type||""),status:a,duration:t.execution_time_ms??t.duration_ms??((l=t.metadata)==null?void 0:l.duration_ms)??((o=t.metadata)==null?void 0:o.elapsed_ms)??null}}const Qa=e=>e!==null&&typeof e=="object"&&!Array.isArray(e),vl=e=>typeof e=="string"||typeof e=="number"?String(e):"";function qk(e){const t=Qa(e)?e:{},s=Qa(t.metadata)?t.metadata:{},a=Qa(t.audit_metadata)?t.audit_metadata:{},n=Qa(t.turn)?t.turn:{},i=l=>vl(t[l]??s[l]??a[l]??n[l]);return{agentId:i("agent_id"),label:i("agent_label")||i("label"),parentId:i("parent_agent_id"),rootId:i("root_agent_id"),turnId:i("originating_turn_id")||i("turn_id"),iteration:i("iteration"),callId:i("call_id")}}function hp(e){return e.record?JSON.stringify(ov(e),null,2):e.text}function ov(e){var t;return((t=e.events)==null?void 0:t.length)>1?e.events:e.record}function gc(e){return e!=null&&e.tool_name?["tool_start","loop_tool_start"].includes(e.type)?"start":["tool_end","loop_tool"].includes(e.type)?"end":(!e.type||e.type==="execution")&&"result_summary"in e?"execution":"":""}function mp(e){if(!gc(e.record))return"";const t=e.attribution,s=e.record;return!t.callId||!t.turnId&&!t.agentId?"":JSON.stringify([t.turnId,t.agentId,t.iteration,t.callId,e.tool,vl(s.channel_id),vl(s.user_id??s.actor)])}function Gk(e,t,s=2e3){var i,l,o;const a=mp(t),n=a?e.findIndex(r=>mp(r)===a):-1;if(n<0)e.push(t);else{const r=e[n],c=[...r.events||[r.record]],d=JSON.stringify(t.record);if(c.some(y=>JSON.stringify(y)===d))return;c.push(t.record);const u=y=>"result_summary"in y?2:gc(y)==="end"?1:0,p=[...c].sort((y,g)=>u(y)-u(g)),h=Object.assign({},...p);h.type=p[p.length-1].type||"execution";for(const y of["metadata","audit_metadata","turn"]){const g=p.filter(b=>Qa(b[y])).map(b=>b[y]);g.length&&(h[y]=Object.assign({},...g))}const m=c.some(y=>gc(y)!=="start"),v=c.find(y=>bc(y,0).level==="ERROR"),w=(v==null?void 0:v.status)||((i=v==null?void 0:v.metadata)==null?void 0:i.status);h.status=v?["failed","error","cancelled","denied","outcome_unknown"].includes(w)?w:"failed":m?h.status||((l=h.metadata)==null?void 0:l.status)||"succeeded":"started",m&&h.status==="started"&&(h.status="succeeded"),v&&(h.error=v.error||((o=v.metadata)==null?void 0:o.error)||h.error);const A=bc(h,r.id,r._time);Object.assign(A,{events:c,ts:r.ts,_time:r._time,searchText:c.map(y=>JSON.stringify(y)).join(`
`)}),e.splice(n,1,A)}e.length>s&&e.splice(0,e.length-s)}function bc(e,t,s=new Date){var u,p;let a=e;if(Qa(e)&&e.type==="log"&&"line"in e?a=e.line:Qa(e)&&"payload"in e&&(a=e.payload),typeof a=="string")try{a=JSON.parse(a)}catch{}const n=Qa(a)?a:null,i=n!=null&&n.timestamp?new Date(n.timestamp):s,l=Number.isNaN(i.getTime())?s:i,o=n?n.result_summary??n.detail??n.message??JSON.stringify(n):typeof a=="string"?a:JSON.stringify(a)??"",c=(n==null?void 0:n.error)||((u=n==null?void 0:n.metadata)==null?void 0:u.error)||(n==null?void 0:n.success)===!1||[n==null?void 0:n.status,(p=n==null?void 0:n.metadata)==null?void 0:p.status].some(h=>["failed","error","cancelled","denied","outcome_unknown"].includes(h))?"ERROR":vl(n==null?void 0:n.level).toUpperCase()||"INFO",d={id:t,record:n,ts:l.toLocaleTimeString(),_time:l,level:c,text:typeof o=="string"?o:JSON.stringify(o),tool:vl(n==null?void 0:n.tool_name),raw:n?null:o,attribution:qk(n)};return d.searchText=n?JSON.stringify(n):d.text,d}function Kk(e){const t=new Map;for(const s of e){const{turnId:a,agentId:n,rootId:i,label:l,parentId:o}=s.attribution,r=a?`turn:${a}`:n?`root:${i||n}`:"unattributed";t.has(r)||t.set(r,{key:r,title:a?`Turn ${a}`:n?`Agent root ${i||n} (turn unavailable)`:"Unattributed / legacy records",count:0,sections:[],_sections:new Map});const c=t.get(r),d=n?`agent:${n}`:"main";if(!c._sections.has(d)){const u={key:d,agentId:n,label:l,parentId:o,rootId:i,title:n?`${l||"Agent"} (${n})`:"Main thread / turn events",entries:[]};c._sections.set(d,u),c.sections.push(u)}c._sections.get(d).entries.push(s),c.count++}return[...t.values()].map(({_sections:s,...a})=>a)}const Wk={components:{ToolOutput:lr},props:{entry:{type:Object,required:!0}},emits:["copy"],setup(e){const t=q(()=>Vk(e.entry)),s=q(()=>{var o;return ml(((o=e.entry.record)==null?void 0:o.tool_input)??"")}),a=q(()=>{var o,r,c;return ml(((o=e.entry.record)==null?void 0:o.error)||((c=(r=e.entry.record)==null?void 0:r.metadata)==null?void 0:c.error)||"")}),n=q(()=>jk(e.entry.record)),i=q(()=>ov(e.entry)),l=q(()=>(e.entry.events||[e.entry.record]).filter(Boolean).map(o=>{var r;return{type:o.type||"execution",timestamp:o.timestamp||"Time not recorded",status:o.status||((r=o.metadata)==null?void 0:r.status)||""}}));return{display:t,argumentsText:s,errorText:a,metadataText:n,rawRecord:i,lifecycle:l}},template:`
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
    </article>`},Jk=["INFO","WARNING","ERROR"],Zk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Ir=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Yk=[50,100,200,500],Qk={components:{ToolOutput:lr,LogRecord:Wk},template:`
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
    </div>`,setup(){const e=f("live"),t=f([]);let s=0;const a=f(!1),n=f(!1),i=f(!0),l=f(""),o=f(""),r=f(!1),c=f(!1),d=f(st.state||"disconnected"),u=q(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),p=f(null),h=f(!1),m=f(null),v=2e3,w=Jk,A=Zk,y=Ir,g=f("all"),b=f(""),_=f([]),k=f(!1),I=f(""),C=f([]);function x(){try{const ie=localStorage.getItem("odin-log-presets");ie&&(_.value=JSON.parse(ie))}catch{}}function N(){try{localStorage.setItem("odin-log-presets",JSON.stringify(_.value))}catch{}}const F=q(()=>l.value!==""||o.value.trim()!==""||b.value!==""),T=q(()=>{const ie=Ir.find(Se=>Se.value===b.value);return ie?ie.label:""}),P=q(()=>{if(!r.value||!o.value)return null;try{return new RegExp(o.value,"i"),null}catch(ie){return ie.message}}),z=24,G=q(()=>{if(Z.value.length===0)return[];const ie=[],Se=new Date,Ue=3600*1e3;for(let et=z-1;et>=0;et--){const kt=new Date(Se.getTime()-(et+1)*Ue),ft=new Date(Se.getTime()-et*Ue);ie.push({start:kt,end:ft,label:$(kt,ft),shortLabel:ft.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const et of Z.value){if(!et._time)continue;const kt=et._time.getTime();for(const ft of ie)if(kt>=ft.start.getTime()&&kt<ft.end.getTime()){ft.total++,et.level==="ERROR"?ft.errors++:et.level==="WARNING"?ft.warnings++:ft.info++;break}}return ie}),E=q(()=>{let ie=1;for(const Se of G.value)Se.total>ie&&(ie=Se.total);return ie}),O=q(()=>{if(G.value.length===0)return"";const ie=Z.value.map(et=>et._time&&et._time.getTime()).filter(Boolean);if(ie.length===0)return"";const Se=new Date(Math.min(...ie));return`${Z.value.length} shown, oldest ${Se.toLocaleTimeString()}`}),R=q(()=>Math.ceil(z/8));function $(ie,Se){const Ue={hour:"2-digit",minute:"2-digit"};return ie.toLocaleTimeString([],Ue)+" - "+Se.toLocaleTimeString([],Ue)}function Q(ie,Se){return!Se||!ie?"0px":Math.max(2,ie/Se*100)+"%"}function W(ie){const Se=Z.value.findIndex(Ue=>Ue._time&&Ue._time.getTime()>=ie.start.getTime()&&Ue._time.getTime()<ie.end.getTime());if(Se>=0&&p.value){const Ue=p.value.querySelector('[data-log-id="'+Z.value[Se].id+'"]');Ue&&(Ue.scrollIntoView({behavior:"smooth",block:"center"}),i.value=!1)}}const Z=q(()=>{let ie=t.value;if(l.value&&(ie=ie.filter(Se=>(Se.level||"INFO")===l.value)),b.value){const Se=Ir.find(Ue=>Ue.value===b.value);if(Se&&Se.seconds){const Ue=new Date(Date.now()-Se.seconds*1e3);ie=ie.filter(et=>et._time&&et._time>=Ue)}}if(o.value&&!P.value)if(r.value)try{const Se=new RegExp(o.value,"i");ie=ie.filter(Ue=>{const et=Ue.searchText,kt=Ue.tool||"";return Se.test(et)||Se.test(kt)})}catch{}else{const Se=o.value.toLowerCase();ie=ie.filter(Ue=>{const et=Ue.searchText.toLowerCase(),kt=(Ue.tool||"").toLowerCase();return et.includes(Se)||kt.includes(Se)})}return ie}),re=q(()=>Kk(Z.value));function J(ie){const Se=bc(ie,++s);if(n.value){C.value.push(Se);return}pe(Se)}function pe(ie){Gk(t.value,ie,v),i.value&&Ot(()=>Ne())}function Ne(ie=!1){const Se=p.value;Se&&Se.scrollTo({top:Se.scrollHeight,behavior:ie?"smooth":"instant"})}function ae(){i.value=!0,h.value=!1,Ot(()=>Ne(!0))}const be=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function j(){const ie=p.value;if(!ie)return;const Se=ie.scrollHeight-ie.scrollTop-ie.clientHeight<40;h.value=!i.value&&!Se&&t.value.length>0,S.value&&ce()}function ce(){const ie=p.value;!ie||!i.value||ie.scrollHeight-ie.scrollTop-ie.clientHeight>=40&&(i.value=!1,h.value=t.value.length>0)}function he(){i.value&&requestAnimationFrame(ce)}function Le(ie){be.has(ie.key)&&he()}const S=f(!1);function M(){i.value&&(S.value=!0,requestAnimationFrame(ce))}function B(){S.value&&(S.value=!1,ce())}function de(){i.value&&(h.value=!1,Ot(()=>Ne()))}function ne(){if(n.value=!n.value,!n.value&&C.value.length>0){for(const ie of C.value)pe(ie);C.value=[]}}function oe(){t.value=[],C.value=[],h.value=!1}function me(){let ie;e.value==="search"?ie=De.value.map(kt=>{const ft=kt.error?"ERROR":"INFO",za=kt.tool_name?`[${kt.tool_name}] `:"";return`${kt.timestamp||""} ${ft} ${za}${kt.result_summary||kt.message||""}`}).join(`
`):ie=Z.value.map(hp).join(`

`);const Se=new Blob([ie],{type:"text/plain"}),Ue=URL.createObjectURL(Se),et=document.createElement("a");et.href=Ue,et.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,et.click(),URL.revokeObjectURL(Ue)}function H(ie){const Se=hp(ie);navigator.clipboard.writeText(Se).then(()=>{m.value=ie.id,setTimeout(()=>{m.value=null},1500)}).catch(()=>{})}function ee(ie){l.value=l.value===ie?"":ie,g.value="all"}function X(ie){return ie.level==="ERROR"?"log-line-error":ie.level==="WARNING"?"log-line-warning":"text-gray-300"}function fe(ie){return ie==="ERROR"?"text-red-500 font-semibold":ie==="WARNING"?"text-yellow-500":"text-blue-500"}function ue(ie){return ie==="ERROR"?"log-chip-error":ie==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(ie){g.value=ie.id;const Se=ie.filters;l.value=Se.level||"",b.value=Se.timeRange||"",o.value=Se.text||"",Se.levels&&(l.value=Se.levels[0]||""),Se.hasToolName&&(o.value="")}function Ie(ie){g.value=ie.id,l.value=ie.filters.level||"",b.value=ie.filters.timeRange||"",o.value=ie.filters.text||""}function ve(){if(!I.value.trim())return;const ie={id:"custom-"+Date.now(),name:I.value.trim(),filters:{level:l.value,timeRange:b.value,text:o.value}};_.value=[..._.value,ie],N(),k.value=!1,I.value=""}function Fe(ie){_.value=_.value.filter(Se=>Se.id!==ie),N(),g.value===ie&&(g.value="all")}const $e=f("all"),ze=f(""),Ye=f(""),at=f(""),nt=f(""),Y=f(""),xe=f(100),Ce=Yk,Oe=f(!1),te=f(!1),Te=f(""),De=f([]),Qe=f(null),Nt=f(null);function We(){e.value="search",Qe.value||Dt()}async function Dt(){try{Qe.value=await U.get("/api/logs/stats")}catch{}}function Vt(){const ie=Y.value;if(!ie){at.value="",nt.value="";return}const Ue={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[ie];if(Ue){const et=new Date(Date.now()-Ue*1e3);at.value=ms(et),nt.value=""}}function ms(ie){const Se=Ue=>String(Ue).padStart(2,"0");return`${ie.getFullYear()}-${Se(ie.getMonth()+1)}-${Se(ie.getDate())}T${Se(ie.getHours())}:${Se(ie.getMinutes())}`}function ea(ie){if(!ie)return"";const Se=new Date(ie);return isNaN(Se.getTime())?"":Se.toISOString()}async function Cs(){Oe.value=!0,Te.value="",te.value=!0,Nt.value=null;try{const ie=new URLSearchParams;$e.value&&$e.value!=="all"&&ie.set("level",$e.value),ze.value&&ie.set("tool",ze.value),Ye.value&&ie.set("q",Ye.value);const Se=ea(at.value),Ue=ea(nt.value);Se&&ie.set("start",Se),Ue&&ie.set("end",Ue),ie.set("limit",String(xe.value));const et=await U.get(`/api/logs/search?${ie.toString()}`);De.value=et.entries||[]}catch(ie){Te.value=ie.message||"Search failed",De.value=[]}finally{Oe.value=!1}}function nn(){$e.value="all",ze.value="",Ye.value="",at.value="",nt.value="",Y.value="",xe.value=100,De.value=[],te.value=!1,Te.value="",Nt.value=null}function ta(ie){Nt.value=Nt.value===ie?null:ie}function Vs(ie){if(!ie.timestamp)return"";try{return new Date(ie.timestamp).toLocaleString()}catch{return ie.timestamp}}function ha(ie){return ie.type==="web_action"?`${ie.status||""} (${ie.execution_time_ms||0}ms)`:(ie.result_summary||"").slice(0,200)}function vs(ie){return ie.error?"log-line-error":"text-gray-300"}function Ha(ie){try{return JSON.stringify(ie,null,2)}catch{return String(ie)}}let gs=null,it=!1;function Pt(){it||(it=!0,st.subscribe("logs",J),c.value=st.connected,d.value=st.state||"disconnected",gs=st.onState(ie=>{d.value=ie,c.value=ie==="connected"}))}function Ds(){it&&(it=!1,st.unsubscribe("logs",J),gs&&(gs(),gs=null))}return Ge(()=>{x(),window.addEventListener("pointerup",B),window.addEventListener("pointercancel",B)}),es(Pt),Wt(Ds),mt(()=>{Ds(),window.removeEventListener("pointerup",B),window.removeEventListener("pointercancel",B)}),{mode:e,logs:t,paused:n,autoScroll:i,levelFilter:l,textFilter:o,useRegex:r,groupByTurn:a,groupedLogs:re,subscribed:c,wsState:d,wsStateLabel:u,logContainer:p,filteredLogs:Z,pauseBuffer:C,showJumpBottom:h,copiedIndex:m,regexError:P,levels:w,logPresets:A,timeRanges:y,timeRange:b,activeLogPreset:g,customLogPresets:_,showSaveLogPreset:k,newLogPresetName:I,hasActiveLogFilters:F,timeRangeLabel:T,timelineBuckets:G,timelineMax:E,timelineSpanLabel:O,timelineLabelSkip:R,togglePause:ne,clearLogs:oe,exportLogs:me,logLineClass:X,levelClass:fe,levelChipClass:ue,toggleLevel:ee,copyLine:H,jumpToBottom:ae,onScroll:j,onUserScrollIntent:he,onUserScrollKey:Le,onAutoScrollToggle:de,onPointerDown:M,applyLogPreset:ye,applyCustomLogPreset:Ie,saveLogCustomPreset:ve,removeLogCustomPreset:Fe,segmentHeight:Q,jumpToTimelineBucket:W,searchLevel:$e,searchTool:ze,searchKeyword:Ye,searchStart:at,searchEnd:nt,searchTimePreset:Y,searchLimit:xe,searchLimits:Ce,searching:Oe,searchRan:te,searchError:Te,searchResults:De,searchStats:Qe,expandedSearch:Nt,switchToSearch:We,runSearch:Cs,clearSearchFilters:nn,toggleSearchExpand:ta,formatSearchTs:Vs,searchEntryText:ha,searchLogLineClass:vs,formatJson:Ha,applySearchTimePreset:Vt}}};function zl(e=[]){const t=[],s=new Set;function a(n){const i=[n.kind,n.label,n.apply_mode||"",n.code||"",n.text||""].join("\0");s.has(i)||(s.add(i),t.push({...n,key:i}))}for(const n of e)for(const i of(n==null?void 0:n.consumers)||[])a({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const n of e)n!=null&&n.apply_handler&&a({kind:"handler",label:"Apply handler",code:n.apply_handler});for(const n of e)n!=null&&n.restart_reason&&a({kind:"restart",label:"Why a restart is required",text:n.restart_reason});for(const n of e)n!=null&&n.activation_policy&&a({kind:"activation",label:"Activation policy",text:n.activation_policy});return t}const Xk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function eS(e,t={}){var n,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),a=Object.hasOwn(t,"fallback")?t.fallback:(n=globalThis.document)==null?void 0:n.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return a&&a.scrollHeight>a.clientHeight?a:e||a||null}const li=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],tS={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},jl=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord","computer"]),sS=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function vp(e){return sS.some(t=>e===t||e.startsWith(`${t}.`))}const rv="odin_config_center_expanded_v1",cv="odin_config_center_category_v1",aS=50,nS=650,Ii=()=>U.get("/api/config/meta");function pn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Zn(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Hn(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function iS(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function lS(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function dv(e,t){if(Zn(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return pn(t);const a={};for(const[n,i]of Object.entries(t)){const l=dv(e[n],i);l!==void 0&&(a[n]=l)}return Object.keys(a).length?a:void 0}function oS(e,t){const s={};for(const[a,n]of Object.entries(t||{})){const i=dv(e==null?void 0:e[a],n);i!==void 0&&(s[a]=i)}return s}function uv(e,t,s,a){if(Zn(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)uv(e[l],t[l],s?`${s}.${l}`:l,a);return}a.push({path:s,oldVal:e,newVal:t})}function rS(){try{const e=JSON.parse(localStorage.getItem(rv)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function cS(){try{const e=localStorage.getItem(cv);return li.some(t=>t.key===e)?e:li[0].key}catch{return li[0].key}}const dS={template:`
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
  `,setup(){const e=f(null),t=f(null),s=f(!0),a=f(null),n=f(!1),i=f(null),l=["image_model","outer_model"],o=f(null),r=f(null),c=f(null),d=f(!1),u=f(!1),p=f(null),h=f(""),m=f("all"),v=f(cS()),w=f(rS()),A=f({}),y=f({}),g=f(""),b=f({}),_=f({}),k=f([]),I=f([]),C=f(!1),x=f(!1),N=f(!1);let F=null,T=null,P={path:null,at:0},z=0;const G=q(()=>{var L;return(((L=t.value)==null?void 0:L.fields)||[]).filter(V=>!jl.has(V.path.split(".")[0])&&!vp(V.path))}),E=q(()=>new Map(G.value.map(L=>[L.path,L]))),O=q(()=>Z.value.reduce((L,V)=>L+V.sections.length,0)),R=q(()=>G.value.length),$=q(()=>Xk),Q=q(()=>k.value.length>0),W=q(()=>I.value.length>0),Z=q(()=>{if(!e.value)return[];const L=new Set(li.flatMap(ke=>ke.sections)),V=li.map(ke=>({...ke,sections:ke.sections.filter(Ke=>Object.hasOwn(e.value,Ke)&&!jl.has(Ke))})).filter(ke=>ke.sections.length),se=Object.keys(e.value).filter(ke=>!L.has(ke)&&!jl.has(ke));return se.length&&V.push({key:"other",label:"Other",icon:"folder",sections:se}),V}),re=q(()=>e.value?{...e.value,...A.value}:null),J=q(()=>{if(!e.value)return[];const L=[];for(const[V,se]of Object.entries(A.value))uv(e.value[V],se,V,L);return L.filter(V=>!Zn(V.oldVal,V.newVal)).map(V=>{const se=de(V.path);return{...V,label:(se==null?void 0:se.label)||Hn(V.path.split(".").at(-1)),apply_mode:(se==null?void 0:se.apply_mode)||fe(V.path.split(".")[0])}})}),pe=q(()=>J.value.length>0),Ne=q(()=>J.value.length),ae=q(()=>new Set(J.value.map(L=>L.path.split(".")[0])).size),be=q(()=>!!h.value||m.value!=="all"),j=q(()=>{const L={..._.value};for(const V of J.value){const se=de(V.path),ke=Ln(se,V.newVal);ke&&(L[V.path]=ke)}return L}),ce=q(()=>Object.keys(j.value).length>0),he=q(()=>e.value?(be.value?Z.value:Z.value.filter(V=>V.key===v.value)).map(V=>({...V,sections:V.sections.filter(se=>Te(se))})).filter(V=>V.sections.length):[]),Le=q(()=>{const L=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],V=new Map(L.map(se=>[se,[]]));for(const se of J.value){const ke=V.has(se.apply_mode)?se.apply_mode:"restart";V.get(ke).push(se)}return L.filter(se=>V.get(se).length).map(se=>({key:se,label:K(se),entries:V.get(se)}))}),S=q(()=>J.value.filter(L=>L.apply_mode==="restart").length),M=q(()=>G.value.filter(L=>L.pending_restart)),B=q(()=>M.value.length);function de(L){const V=E.value.get(L);return V?{...V,apply_details:zl([V])}:null}function ne(L){const V=`${L}.`;return G.value.filter(se=>se.path===L||se.path.startsWith(V))}function oe(){return G.value.some(L=>L.path==="tools.hosts"||L.path.startsWith("tools.hosts."))}function me(){var se,ke;const L=((ke=(se=e.value)==null?void 0:se.tools)==null?void 0:ke.hosts)||{},V=Object.keys(L).length;return`${V} host${V===1?"":"s"} configured.`}function H(L){return ne(L).length}function ee(L){return Hn(L)}function X(L){const V=ne(L);if(!V.length)return`${Hn(L)} configuration.`;const se=V.find(St=>St.sensitivity==="public"&&St.description)||V.find(St=>St.description),ke=(se==null?void 0:se.description)||"";return ke.match(/setting for (.+)\.$/i)?`${Hn(L)} settings and runtime behaviour.`:ke}function fe(L){const V=[...new Set(ne(L).map(se=>se.apply_mode))];return V.length===1?V[0]:V.includes("restart")?"restart":V.includes("activation_required")?"activation_required":V[0]||"restart"}function ue(L){const V=[...new Set(ne(L).map(se=>K(se.apply_mode)))];return V.length?V.length===1?V[0]:`Mixed apply behaviour: ${V.join(" · ")}`:""}function ye(L){return zl(ne(L))}function Ie(L){var V;return Object.hasOwn(A.value,L)?A.value[L]:(V=e.value)==null?void 0:V[L]}function ve(){const L=Ie("mcp")||{},V=Object.keys(L.servers||{}).length;return`${L.enabled?"Globally enabled":"Globally disabled"} · ${V} configured server${V===1?"":"s"}.`}function Fe(L,V){return V.split(".").reduce((se,ke)=>se==null?void 0:se[ke],L)}function $e(L){const V=re.value;return ne(L).filter(se=>vp(se.path)?!1:se.path.split(".").length<=2?!0:!se.path.includes(".*")).map(se=>({...se,key:se.path.split(".").at(-1),value:Fe(V,se.path),apply_details:zl([se]),editor:se.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ze(L){const V=L.path.split(".");return V.length>2?V.slice(0,2).join("."):null}function Ye(L){const V=new Map;for(const se of $e(L)){const ke=ze(se),Ke=ke||`${L}.__root`;V.has(Ke)||V.set(Ke,{key:Ke,path:ke,entries:[]}),V.get(Ke).entries.push(se)}return[...V.values()].map(se=>{const ke=se.entries.find(Ke=>Ke.group_description);return{...se,label:se.path?Hn(se.path.split(".").at(-1)):null,description:(ke==null?void 0:ke.group_description)||null,apply_details:zl(se.entries),runtime_summaries:nt(se.entries)}})}function at(L){return{save:L.save_effect||(L.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:L.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[L.apply_mode]||"Effective runtime state is not currently observable."}}function nt(L){const V=new Map;for(const se of L){const ke=at(se),Ke=`${se.apply_mode}|${ke.save}|${ke.runtime}`;V.has(Ke)||V.set(Ke,{key:Ke,label:K(se.apply_mode),save:ke.save,runtime:ke.runtime})}return[...V.values()]}function Y(L){if(xe(L))return L.runtime_effect||L.activation_policy||"";if(L.apply_mode==="activation_required"){const V=L.activation_policy||L.runtime_effect;return V?`Not active after saving. No activation control exists in this release. ${V}`:"Not active after saving; no activation control exists in this release."}return""}function xe(L){return L.action_available===!0&&!!(L.action_label&&L.action_endpoint)}async function Ce(L){if(xe(L))try{if(Dt(L.path))throw new Error("Save this setting before applying its action.");const V=String(L.action_method||"POST").toLowerCase(),se={post:U.post.bind(U),put:U.put.bind(U),delete:U.del.bind(U)}[V];if(!se)throw new Error("Unsupported configuration action");await se(L.action_endpoint,L.action_body||void 0),await dt(),bs("success",`${L.action_label} completed.`)}catch(V){bs("error",V.message||`${L.action_label} failed`)}}function Oe(L,V){return[L.label,L.path,L.description,...L.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(V)}function te(L){const V=h.value.trim().toLowerCase();return V?ne(L).filter(se=>Oe(se,V)):[]}function Te(L){const V=ne(L);if(m.value!=="all"&&!V.some(ke=>ke.apply_state===m.value))return!1;const se=h.value.trim().toLowerCase();return!se||`${ee(L)} ${L}`.toLowerCase().includes(se)?!0:V.some(ke=>Oe(ke,se))}function De(L,V){return ne(L).filter(se=>se.apply_state===V).length}function Qe(L){return L==="all"?R.value:G.value.filter(V=>V.apply_state===L).length}function Nt(L){const V=L.sections.flatMap(se=>ne(se));return{fields:V.length,modified:J.value.filter(se=>L.sections.includes(se.path.split(".")[0])).length,pending_restart:V.filter(se=>se.apply_state==="pending_restart").length,invalid:V.filter(se=>se.apply_state==="invalid").length,dormant:V.filter(se=>se.apply_state==="dormant").length}}function We(L){var V;return Object.hasOwn(A.value,L)&&!Zn((V=e.value)==null?void 0:V[L],A.value[L])}function Dt(L){return J.value.some(V=>V.path===L||V.path.startsWith(`${L}.`))}function Vt(L){v.value=L,h.value="",m.value="all";try{localStorage.setItem(cv,L)}catch{}}function ms(L){m.value=L}function ea(){h.value="",m.value="all"}function Cs(L){var V;return((V=Z.value.find(se=>se.sections.includes(L)))==null?void 0:V.sections)||[]}function nn(L){const V=Cs(L),se=V.find(ke=>w.value[ke]===!0);return se||V.find(ke=>w.value[ke]!==!1)||null}function ta(L){return h.value&&!N.value&&Te(L)?!0:N.value?nn(L)===L:Object.hasOwn(w.value,L)?w.value[L]===!0:!0}function Vs(L){const V=!ta(L);if(N.value){const se={...w.value};for(const ke of Cs(L))se[ke]===!0&&(se[ke]=!1);se[L]=V,w.value=se;return}w.value={...w.value,[L]:V}}function ha(){k.value.push(pn(A.value)),k.value.length>aS&&k.value.shift(),I.value=[]}function vs(){n.value||pe.value&&(ha(),A.value={},_.value={},C.value=!1)}function Ha(L,V=!1){const se=Date.now();if(V&&P.path===L&&se-P.at<nS){P.at=se;return}ha(),P={path:L,at:se}}function gs(L,V,se){if(!V.length)return se;const ke=pn(L??{});let Ke=ke;for(let St=0;St<V.length-1;St+=1){const Ws=V[St];Ke[Ws]=pn(Ke[Ws]??{}),Ke=Ke[Ws]}return Ke[V.at(-1)]=se,ke}function it(L){var V;return Object.hasOwn(A.value,L)?A.value[L]:pn((V=e.value)==null?void 0:V[L])}function Pt(L,V,se={}){var Fn;if(n.value||jl.has(L.path.split(".")[0]))return;const[ke,...Ke]=L.path.split(".");Ha(L.path,!!se.coalesce);const St=it(ke),Ws=Ke.length?gs(St,Ke,V):V,sa={...A.value};if(Zn(Ws,(Fn=e.value)==null?void 0:Fn[ke])?delete sa[ke]:sa[ke]=Ws,A.value=sa,_.value[L.path]){const on={..._.value};delete on[L.path],_.value=on}}function Ds(L){P={path:null,at:0},y.value={...y.value,[L]:String(Fe(re.value,L)??"")}}function ie(L){if(P={path:null,at:0},!Object.hasOwn(y.value,L))return;const V={...y.value};delete V[L],y.value=V}function Se(L){const V=y.value[L.path];if(P={path:null,at:0},V===""){if(L.nullable){ie(L.path),Pt(L,null,{coalesce:!0});return}_.value={..._.value,[L.path]:"Enter a number."};return}const se=Number(V);if(Number.isNaN(se)||L.type==="integer"&&!Number.isInteger(se)){_.value={..._.value,[L.path]:L.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ke={...y.value};delete ke[L.path],y.value=ke,Pt(L,se,{coalesce:!0})}function Ue(L){return Object.hasOwn(y.value,L.path)?y.value[L.path]:L.value??""}function et(L,V){if(y.value={...y.value,[L.path]:V},V===""){if(L.nullable){Pt(L,null,{coalesce:!0});return}_.value={..._.value,[L.path]:"Enter a number."};return}const se=Number(V);if(!Number.isFinite(se)||L.type==="integer"&&!Number.isInteger(se)){_.value={..._.value,[L.path]:L.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(_.value[L.path]){const ke={..._.value};delete ke[L.path],_.value=ke}Pt(L,se,{coalesce:!0})}function kt(L){const V=Number.parseInt(g.value,10);if(!Number.isInteger(V)||V<1){_.value={..._.value,[L.path]:"Warning thresholds must be positive whole numbers."};return}const se=[...new Set([...L.value||[],V])].sort((ke,Ke)=>Ke-ke);g.value="",Pt(L,se)}function ft(L,V){Pt(L,(L.value||[]).filter(se=>se!==V))}function za(L){return L.apply_mode==="live_read"?"Odin reads the saved file value on next use.":L.apply_mode==="live_for_new_work"?"New work uses the saved file value.":L.apply_mode==="live_apply"?L.apply_handler?`Apply the saved value through ${L.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":L.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":L.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":L.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function qs(L){return L.type==="array"&&Array.isArray(L.value)&&!L.structured_container&&!L.structured_container_child&&L.sensitivity==="public"&&L.value.every(V=>["string","number","boolean"].includes(typeof V))}function wi(L){const V=String(b.value[L.path]??"").trim();if(!V)return;const se=[...new Set([...L.value||[],V])];b.value={...b.value,[L.path]:""},Pt(L,se)}function ki(L,V){Pt(L,(L.value||[]).filter(se=>se!==V))}function Ln(L,V){var ke;if(!L)return null;if((ke=L.enum)!=null&&ke.length&&!L.enum.includes(V))return`Choose one of: ${L.enum.join(", ")}`;if(L.path==="agents.final_warning_iterations"&&(!Array.isArray(V)||!V.length))return"Add at least one warning threshold.";const se=L.constraints||{};if((L.type==="integer"||L.type==="number")&&typeof V=="number"){if(se.minimum!==void 0&&V<se.minimum)return`Must be at least ${se.minimum}${L.unit?` ${L.unit}`:""}`;if(se.maximum!==void 0&&V>se.maximum)return`Must be at most ${se.maximum}${L.unit?` ${L.unit}`:""}`}return null}function Nn(L){return j.value[L.path]||null}function ln(L){const V=`${L}.`;return Object.keys(j.value).some(se=>se===L||se.startsWith(V))}function ma(){n.value||k.value.length&&(I.value.push(pn(A.value)),A.value=k.value.pop(),_.value={},y.value={},P={path:null,at:0})}function Gs(){n.value||I.value.length&&(k.value.push(pn(A.value)),A.value=I.value.pop(),_.value={},y.value={},P={path:null,at:0})}function va(){!pe.value||ce.value||(C.value=!0,x.value=!1)}function Es(){C.value=!1}function Dn(){vs()}function K(L){return tS[L]||Hn(L||"unknown")}function _e(L){return`apply-${String(L||"unknown").replaceAll("_","-")}`}function Ee(L){return`cfgc-field-${L.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function Ks(L){return`${Ee(L)}-input`}function ga(L){const V=document.getElementById(Ee(L))||document.getElementById(Ee(L.split(".").slice(0,2).join(".")));V==null||V.scrollIntoView({behavior:"smooth",block:"center"})}function bs(L,V){r.value={type:L,message:V},window.setTimeout(()=>{var se;((se=r.value)==null?void 0:se.message)===V&&(r.value=null)},3500)}function Ae(){d.value=!1,m.value="pending_restart",h.value="";const L=eS(a.value);L&&(L.scrollTop=0)}function D(){d.value=!1}function le(L=1800){T&&window.clearTimeout(T),T=window.setTimeout(ge,L)}async function ge(){if(u.value){if(z+=1,z>45){u.value=!1,p.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await Ii(),B.value===0){u.value=!1,p.value=null,bs("success","Odin restarted and the saved startup settings are active.");return}}catch{}le(2e3)}}async function Pe(){if(!u.value){p.value=null;try{await U.post("/api/restart",{}),u.value=!0,z=0,d.value=!1,le()}catch(L){p.value=L.message||"Odin could not schedule a restart."}}}async function Be(){if(!(!pe.value||ce.value||n.value)){n.value=!0;try{const L=oS(e.value,A.value),V=await U.put("/api/config",L);e.value=V,A.value={},k.value=[],I.value=[],_.value={},C.value=!1;try{t.value=await Ii(),c.value=null,d.value=B.value>0,bs("success",B.value?`Configuration saved. ${B.value} setting${B.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(se){c.value=se.message||"Unknown metadata error.",bs("error",`Configuration saved, but apply status could not be refreshed: ${c.value}`)}}catch(L){bs("error",L.message||"Configuration could not be saved")}finally{n.value=!1}}}async function je(){if(!n.value){n.value=!0,i.value=null;try{t.value=await Ii(),c.value=null}catch(L){i.value=`Image model status could not be refreshed: ${L.message||"Unknown error"}`}finally{n.value=!1}}}async function Rt(L,V){if(n.value||!["follow","pin"].includes(V)||!L.length||L.some(ke=>{var Ke,St;return!l.includes(ke)||!((St=(Ke=t.value)==null?void 0:Ke.image_model_defaults)!=null&&St[ke])}))return;n.value=!0,i.value=null;let se=!1;try{const ke=await U.post("/api/config/image-models",{operations:Object.fromEntries(L.map(Ke=>[Ke,V])),expected_revision:t.value.image_model_revision});se=!0;for(const Ke of L){const St=`image.openai.${Ke}`,Ws=Fe(e.value,St),sa=Fe(ke.config,St),Fn=on=>!Object.hasOwn(on,"image")||!Zn(Fe(on,St),Ws)?on:gs(on,St.split("."),sa);A.value=Fn(A.value),k.value=k.value.map(Fn),I.value=I.value.map(Fn),e.value=gs(e.value,St.split("."),sa)}t.value={...t.value,image_model_defaults:ke.image_model_defaults,image_model_revision:ke.image_model_revision},bs("success","Image model defaults saved. Unrelated drafts were not saved.")}catch(ke){i.value=`Image model operation failed: ${ke.message||"Unknown error"}. Refresh status before retrying if the outcome is uncertain.`}try{t.value=await Ii(),c.value=null}catch(ke){const Ke=`Image model status could not be refreshed: ${ke.message||"Unknown error"}`;c.value=Ke,i.value=se?`Image model defaults were saved, but ${Ke}`:`${i.value} ${Ke}`}finally{n.value=!1}}async function dt(){var L,V;if(!(pe.value||n.value)){s.value=!0,o.value=null;try{const se=await U.get("/api/config"),ke=await Ii();e.value=se,t.value=ke,c.value=null;const Ke=Z.value;if(Ke.some(St=>St.key===v.value)||(v.value=((L=Ke[0])==null?void 0:L.key)||li[0].key),N.value){const Ws=(((V=Ke.find(sa=>sa.key===v.value))==null?void 0:V.sections)||[]).find(sa=>w.value[sa]===!0);w.value=Ws?{...w.value,[Ws]:!0}:{}}}catch(se){o.value=se.message||"Unknown configuration error"}finally{s.value=!1}}}function bt(L){if(C.value||!(L.ctrlKey||L.metaKey))return;const V=L.target;V instanceof HTMLElement&&(V.matches("input, textarea, select")||V.isContentEditable)||(!L.shiftKey&&L.key.toLowerCase()==="z"?(L.preventDefault(),ma()):(L.key.toLowerCase()==="y"||L.shiftKey&&L.key.toLowerCase()==="z")&&(L.preventDefault(),Gs()))}function Ps(L){N.value=L.matches}Ut(w,L=>{try{localStorage.setItem(rv,JSON.stringify(L))}catch{}},{deep:!0});let wt=!1;function Pn(){wt||(wt=!0,document.addEventListener("keydown",bt))}function Mn(){wt&&(wt=!1,document.removeEventListener("keydown",bt))}return Ge(()=>{var L;dt(),Pn(),F=window.matchMedia("(max-width: 760px)"),Ps(F),(L=F.addEventListener)==null||L.call(F,"change",Ps)}),es(Pn),Wt(Mn),mt(()=>{var L;Mn(),(L=F==null?void 0:F.removeEventListener)==null||L.call(F,"change",Ps),T&&window.clearTimeout(T)}),{armKeydown:Pn,disarmKeydown:Mn,handleKeydown:bt,config:e,meta:t,loading:s,saving:n,error:o,toast:r,metaRefreshError:c,restartPromptOpen:d,restartScheduled:u,restartError:p,configMain:a,imageModelError:i,imageModelLeaves:l,setImageModelDefaults:Rt,refreshImageModelMetadata:je,searchQuery:h,healthFilter:m,activeCategory:v,reviewOpen:C,mobileOverflowOpen:x,warningThresholdInput:g,arrayInputs:b,healthFilters:$,visibleCategories:Z,displayGroups:he,reviewGroups:Le,sectionCount:O,fieldCount:R,hasChanges:pe,changeCount:Ne,changedSectionCount:ae,hasDraftErrors:ce,canUndo:Q,canRedo:W,globalFilterActive:be,reviewRestartCount:S,pendingRestartCount:B,pendingRestartFields:M,healthCount:Qe,categoryStats:Nt,selectCategory:Vt,selectHealthFilter:ms,clearFilters:ea,sectionLabel:ee,sectionDescription:X,sectionFieldCount:H,sectionHealthCount:De,sectionApplySummary:ue,sectionApplyDetails:ye,sectionEntries:$e,fieldGroups:Ye,sectionSearchHits:te,mcpConfigSummary:ve,fieldRuntimeCopy:at,fieldSpecificRuntimeNote:Y,hasHonestAction:xe,runFieldAction:Ce,hasHostsCollection:oe,hostsConfigSummary:me,sectionChanged:We,fieldChanged:Dt,isSectionExpanded:ta,toggleSection:Vs,discardAllDrafts:vs,setFieldValue:Pt,setNumberFieldValue:et,numberInputValue:Ue,beginInputEdit:Ds,endTextInputEdit:ie,endInputEdit:Se,addWarningThreshold:kt,removeWarningThreshold:ft,isScalarArray:qs,addScalarArrayItem:wi,removeScalarArrayItem:ki,fieldError:Nn,sectionHasErrors:ln,undo:ma,redo:Gs,openReview:va,closeReview:Es,mobileCancel:Dn,applyModeLabel:K,applyClass:_e,compactValue:iS,formatValue:lS,structuredApplyCopy:za,fieldId:Ee,fieldInputId:Ks,focusField:ga,fetchConfig:dt,saveConfig:Be,restartOdin:Pe,restartLater:D,reviewPendingRestart:Ae}}},uS=/^\d{15,25}$/;function pv(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const fv={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=f(""),a=f(!1),n=f(0),i=f(null),l=q(()=>new Set((e.excludedIds||[]).map(String))),o=q(()=>{const _=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:_?u(k).toLowerCase().includes(_)||String(k.username||"").toLowerCase().includes(_)||String(k.id).includes(_):!0)}),r=q(()=>{const _=s.value.trim();return o.value.length===0&&uS.test(_)&&!l.value.has(_)?_:""}),c=q(()=>o.value.length+(r.value?1:0)),d=q(()=>{if(a.value){if(o.value[n.value])return`${e.optionsId}-${n.value}`;if(r.value&&n.value===o.value.length)return`${e.optionsId}-raw`}});function u(_){return pv(_)}function p(){a.value=!0,n.value=0}function h(){p()}function m(){const _=Math.max(c.value-1,0);n.value=Math.min(n.value+1,_)}function v(){n.value=Math.max(n.value-1,0)}function w(){const _=o.value[n.value];_?A(_):r.value&&n.value===o.value.length&&y(r.value)}function A(_){y(String(_.id))}function y(_){t("select",_),s.value="",a.value=!1,n.value=0}function g(){a.value=!1}function b(){setTimeout(g,150)}return Ge(()=>{e.autofocus&&Ot(()=>{var _;return(_=i.value)==null?void 0:_.focus()})}),{query:s,open:a,highlightedIndex:n,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:m,highlightPrevious:v,selectHighlighted:w,selectMember:A,selectId:y,closeOptions:g,onBlur:b}}};function gp(e,t,s){var a;return((a=e==null?void 0:e.config)==null?void 0:a[t])!=null?e.config[t]:s==null?void 0:s[t]}const pS={components:{DiscordUserCombobox:fv},template:`
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
  `,setup(){const e=f([]),t=f(!0),s=f(null),a=f({}),n=f(null),i=f(null),l=f(!1),o=f(null),r=f({}),c=f([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=q(()=>JSON.stringify(n.value)!==JSON.stringify(i.value)),h=q(()=>new Map(c.value.map(E=>[String(E.id),E])));function m(E){return E.config&&E.config.enabled!==void 0?E.config.enabled:!0}function v(E){return gp(E,"require_mention",n.value)}function w(E){return gp(E,"respond_to_bots",n.value)}function A(E){return E.config&&Object.keys(E.config).length>0}function y(E){a.value[E]=!a.value[E]}function g(E){const O=E.discord||{};return{allowed_users:[...O.allowed_users||[]],channels:[...O.channels||[]],respond_to_bots:!!O.respond_to_bots,require_mention:!!O.require_mention,ignore_bot_ids:[...O.ignore_bot_ids||[]]}}async function b({showLoading:E=!0}={}){const O=++d;E&&(t.value=!0),s.value=null;try{const R=await U.get("/api/discord/guilds");O===d&&(e.value=R)}catch(R){O===d&&(s.value=R.message)}finally{E&&O===d&&(t.value=!1)}}async function _(){t.value=!0,s.value=null;try{const[E,O,R]=await Promise.all([U.get("/api/discord/guilds"),U.get("/api/discord/members").catch(()=>[]),U.get("/api/config")]),$=g(R),Q=p.value;n.value=$,Q||(i.value=JSON.parse(JSON.stringify($))),c.value=O,e.value=E,o.value=null}catch(E){s.value=E.message}finally{t.value=!1}}let k=Promise.resolve();const I=f(new Set);function C(E,O){const R=new Set(I.value);R.add(E),I.value=R;const $=k.then(O);return k=$.catch(()=>{}),$.finally(()=>{const Q=new Set(I.value);Q.delete(E),I.value=Q})}function x(E,O,R,$){const Q=($==null?void 0:$.target)??null;return C(`guild:${E}:${O}`,async()=>{try{await U.put("/api/discord/guild/"+E+"/config",{[O]:R}),await b({showLoading:!1})}catch(W){s.value=W.message,Q&&typeof R=="boolean"&&(Q.checked=!R)}})}function N(E,O,R,$,Q){const W=(Q==null?void 0:Q.target)??null;return C(`channel:${E}:${R}`,async()=>{try{await U.put("/api/discord/channel/"+E+"/config",{[R]:$}),await b({showLoading:!1})}catch(Z){s.value=Z.message,W&&typeof $=="boolean"&&(W.checked=!$)}})}function F(E,O){return C(`channel:${E}:clear`,async()=>{try{await U.put("/api/discord/channel/"+E+"/config",{clear:!0}),await b({showLoading:!1})}catch(R){s.value=R.message}})}function T(E,O){const R=String(O);if(!E.userAutocomplete)return R;const $=h.value.get(R);return $?pv($):R}function P(E,O=null){const R=String(O??r.value[E]??"").trim();!R||i.value[E].includes(R)||(i.value[E]=[...i.value[E],R],r.value={...r.value,[E]:""})}function z(E,O){i.value[E]=i.value[E].filter(R=>R!==O)}async function G(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const O=(await U.put("/api/config",{discord:i.value})).discord||i.value;n.value={allowed_users:[...O.allowed_users||[]],channels:[...O.channels||[]],respond_to_bots:!!O.respond_to_bots,require_mention:!!O.require_mention,ignore_bot_ids:[...O.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(n.value))}catch(E){o.value=E.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ge(_),{guilds:e,loading:t,error:s,expanded:a,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:w,hasOverride:A,toggleGuild:y,fetchAll:_,fetchGuilds:b,setGuildConfig:x,setChannelConfig:N,clearOverride:F,mutationPending:I,globalItemLabel:T,addGlobalItem:P,removeGlobalItem:z,saveGlobalDefaults:G}}},As=e=>e==null?e:JSON.parse(JSON.stringify(e));function fS({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:a=()=>{},onDefaultRollback:n=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const m=new Map;function v(k){d+=1;const I=c.then(k,k);return c=I.catch(()=>{}),I}function w(k,I){h=As(k),m.clear();for(const[C,x]of Object.entries(I||{}))m.set(C,As(x))}function A(k){const I=As(k),C=++u;return v(async()=>{try{await e(As(I)),h=As(I),C===u&&a(As(I))}catch(x){C===u&&(n(As(h)),r(x,{kind:"default"}))}})}function y(k,I){const C=As(I),x=(p.get(k)||0)+1;return p.set(k,x),v(async()=>{try{await t(k,As(C)),m.set(k,As(C)),x===p.get(k)&&i(k,As(C))}catch(N){x===p.get(k)&&(l(k,As(m.get(k)??null)),r(N,{kind:"user",uid:k}))}})}function g(k){const I=(p.get(k)||0)+1;return p.set(k,I),v(async()=>{try{await s(k),m.delete(k),I===p.get(k)&&o(k)}catch(C){I===p.get(k)&&(l(k,As(m.get(k)??null)),r(C,{kind:"delete",uid:k}))}})}async function b(){for(;;){const k=c;if(await k,k===c)return d}}async function _(k){for(;;){const I=await b(),C=await k();if(I===d)return C}}return{seed:w,saveDefault:A,saveUser:y,deleteUser:g,whenIdle:b,readSnapshot:_,get revision(){return d}}}const hS={components:{DiscordUserCombobox:fv},template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f({}),i=f({allowed_hosts:[],default_host:""}),l=f({}),o=f(!1),r=f([]),c=q(()=>{const T={};for(const P of r.value)T[P.id]=P;return T});function d(T){return c.value[T]||null}function u(T,P){return T?T.allowed_hosts===null||T.allowed_hosts===void 0?{allowed_hosts:[...P],default_host:T.default_host||"",allow_all:!0}:{allowed_hosts:T.allowed_hosts,default_host:T.default_host||"",allow_all:!1}:{allowed_hosts:[...P],default_host:P[0]||"",allow_all:!0}}const p=fS({applyDefault:async T=>{const P=T.allow_all?null:T.allowed_hosts;await U.put("/api/host-access/default-policy",{allowed_hosts:P,default_host:T.default_host})},applyUser:async(T,P)=>{const z=P.allow_all?null:P.allowed_hosts;await U.put(`/api/host-access/user/${T}`,{allowed_hosts:z,default_host:P.default_host})},applyDelete:T=>U.del(`/api/host-access/user/${T}`),onDefaultConfirmed:()=>we.success("Default policy updated"),onDefaultRollback:T=>{T&&(i.value=T)},onUserConfirmed:T=>{const P=d(T);we.success(`Updated access for ${P?P.display_name:T}`)},onUserRollback:(T,P)=>{const z={...l.value};P?z[T]=P:delete z[T],l.value=z},onUserDeleted:T=>{const P={...l.value};delete P[T],l.value=P},onError:(T,P)=>{var G;const z=P.uid?` ${((G=d(P.uid))==null?void 0:G.display_name)||P.uid}`:"";we.error(`${T.message||"Failed to save"} — reverted${z}`)}});let h=0;async function m(){const T=++h;e.value=!0,t.value="";try{const P=await p.readSnapshot(()=>U.get("/api/host-access"));if(T!==h)return;s.value=P,a.value=P.available_hosts||[],n.value=P.host_descriptions||{},i.value=u(P.default_policy,a.value);const z=P.users||{},G={};for(const[E,O]of Object.entries(z))G[E]=u(O,a.value);l.value=G,p.seed(i.value,G)}catch(P){T===h&&(t.value=P.message||"Failed to fetch host access data")}finally{T===h&&(e.value=!1)}try{const P=await U.get("/api/discord/members")||[];T===h&&(r.value=P)}catch{T===h&&(r.value=[])}}const v=500,w=new Map;function A(T,P){const z=w.get(T);z&&clearTimeout(z.timer);const G={run:P,timer:null};G.timer=setTimeout(()=>{w.delete(T),P()},v),w.set(T,G)}function y(T){const P=w.get(T);P&&(clearTimeout(P.timer),w.delete(T))}function g(){for(const[T,P]of[...w])clearTimeout(P.timer),w.delete(T),P.run()}function b(){A("default",()=>p.saveDefault(i.value))}function _(T,P){i.value.allow_all=!1,P?i.value.allowed_hosts.includes(T)||i.value.allowed_hosts.push(T):(i.value.allowed_hosts=i.value.allowed_hosts.filter(z=>z!==T),i.value.default_host===T&&(i.value.default_host=i.value.allowed_hosts[0]||"")),b()}function k(T){A(`user:${T}`,()=>{const P=l.value[T];P&&p.saveUser(T,P)})}function I(T,P,z){const G=l.value[T];G&&(G.allow_all=!1,z?G.allowed_hosts.includes(P)||G.allowed_hosts.push(P):(G.allowed_hosts=G.allowed_hosts.filter(E=>E!==P),G.default_host===P&&(G.default_host=G.allowed_hosts[0]||"")),k(T))}function C(T,P){const z=l.value[T];z&&(z.default_host=P,k(T))}function x(){o.value=!0}function N(T){!/^\d{15,25}$/.test(T)||l.value[T]||(l.value[T]={allowed_hosts:[...a.value],default_host:a.value[0]||"",allow_all:!1},p.saveUser(T,l.value[T]),o.value=!1)}async function F(T){const P=d(T);await Kt({title:"Remove user override",message:`Remove the host access override for ${P?P.display_name:T}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(y(`user:${T}`),await p.deleteUser(T),l.value[T]||we.success(`Removed override for ${P?P.display_name:T}`))}return Ge(m),Wt(g),mt(g),{loading:e,error:t,data:s,availableHosts:a,hostDescriptions:n,defaultPolicy:i,users:l,showAddUser:o,members:r,fetchData:m,saveDefaultPolicy:b,toggleDefaultHost:_,getMember:d,toggleUserHost:I,setUserDefault:C,openAddUser:x,addUserById:N,deleteUser:F,flushPendingSaves:g}}},mS={template:`
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
    </div>`,setup(){const e=f([]),t=f(!1),s=f(""),a=f([]),n=f(!1),i=f(!1),l=f(1),o=f(""),r=f(!1),c=f(null),d=f(""),u=f([]),p=f(!1),h=f(null),m=f(""),v=()=>({alias:"",address:"",port:22,ssh_user:"root",os:"linux",description:"",trust_mode:"pinned",enabled:!0,confirm_local:!1,confirm_tofu:!1}),w=f(v()),A=q(()=>["127.0.0.1","localhost","::1"].includes(w.value.address));async function y(){t.value=!0,s.value="";try{const G=await U.get("/api/hosts");e.value=G.hosts||[],o.value=G.default_host||"",r.value=!!G.tofu_enabled}catch(G){s.value=G.message}finally{t.value=!1}}async function g(){try{await U.post("/api/hosts/settings",{default_host:o.value,allow_host_tofu:r.value}),we.success("Host settings saved and published live"),await y()}catch(G){we.error(G.message)}}function b(){d.value="",u.value=[],p.value=!1,h.value=null,c.value=null,m.value="",l.value=1,n.value=!0}function _(){i.value=!1,w.value=v(),b()}function k(G){i.value=!0,w.value={...v(),...G},b()}async function I(){try{c.value=await U.get("/api/hosts/public-key")}catch(G){we.error(G.message)}}async function C(G){try{const E=await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/import-legacy",{});i.value=!0,w.value={...v(),...G,trust_mode:"pinned"},b(),d.value=E.candidate_token,u.value=E.fingerprints||[],m.value=u.value.join(`
`),l.value=4,we.info("Imported existing known_hosts trust. Test before activation.")}catch(E){we.error(E.message)}}async function x(){try{const G=m.value.split(/\s+/).filter(Boolean),E={...w.value,expected_fingerprints:G,candidate_fingerprints:u.value},O=await U.post("/api/hosts/candidates",E);if(d.value=O.candidate_token,u.value=O.fingerprints||[],w.value.trust_mode==="tofu"&&E.candidate_fingerprints.length===0){w.value.confirm_tofu=!1,we.info("Fingerprint scanned. Review it, tick confirmation, then scan again.");return}l.value=4}catch(G){we.error(G.message)}}async function N(){var G,E;p.value=!1,h.value=null;try{const O=await U.post("/api/hosts/candidates/"+d.value+"/test",{});p.value=!!O.tested,h.value=O.last_test,p.value&&(l.value=5)}catch(O){const R=(G=O.data)==null?void 0:G.last_test;R&&typeof R=="object"&&!Array.isArray(R)&&(h.value=R);const $=(E=h.value)==null?void 0:E.detail;we.error(typeof $=="string"&&$.trim()?$:O.message)}}async function F(){try{await U.post("/api/hosts/candidates/"+d.value+"/commit",{}),we.success("Host saved and published live"),n.value=!1,await y()}catch(G){we.error(G.message)}}async function T(G){try{await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/enabled",{enabled:!G.enabled}),await y()}catch(E){we.error(E.message)}}async function P(G){var E;if(await Kt("Delete host "+G.alias+"? Dependencies will block deletion.")){a.value=[];try{await U.del("/api/hosts/"+encodeURIComponent(G.alias)),await y()}catch(O){a.value=Array.isArray((E=O.data)==null?void 0:E.pending_references)?O.data.pending_references:[],we.error(O.message)}}}async function z(G){if(await Kt("Force revoke "+G.alias+"? Remote outcomes may be unknown."))try{await U.post("/api/hosts/"+encodeURIComponent(G.alias)+"/force-revoke",{}),await y()}catch(E){we.error(E.message)}}return Ge(y),{hosts:e,loading:t,error:s,pendingReferences:a,wizard:n,editing:i,step:l,defaultHost:o,tofuEnabled:r,form:w,isLocal:A,keyInfo:c,candidate:d,observed:u,tested:p,testResult:h,fingerprintsText:m,load:y,saveSettings:g,beginAdd:_,beginEdit:k,loadKey:I,importLegacy:C,prepare:x,testConnection:N,commit:F,toggle:T,remove:P,forceRevoke:z}}},vS={template:`
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
  `,setup(){const e=f(!0),t=f(""),s=f(null),a=f([]),n=f(!1),i=f(!1),l=f(null),o=f(null),r=f(!1),c=f({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=f({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=q(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:a.value),p=q(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:a.value);function h(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const C=await U.get("/api/tokens");s.value=C.tokens||[],a.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function v(C){return!C||!C.trim()?[]:C.split(",").map(x=>x.trim()).filter(Boolean)}function w(C,x){const N=c.value.allowed_hosts;if(x&&!N.includes(C)&&N.push(C),!x){const F=N.indexOf(C);F>=0&&N.splice(F,1)}}function A(C,x){const N=d.value.allowed_hosts;if(x&&!N.includes(C)&&N.push(C),!x){const F=N.indexOf(C);F>=0&&N.splice(F,1)}}async function y(){var C;i.value=!0;try{const x=v(c.value.allowed_tools_str),N=c.value.host_mode,F=N==="none"?[]:N==="select"?c.value.allowed_hosts:null,T={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:x.length?x:[]};F!==null&&(T.allowed_hosts=F),T.default_host=c.value.default_host||"";const P=await U.post("/api/tokens",T);l.value=P.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},n.value=!1,we.success("Token created"),await m()}catch(x){we.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to create token")}finally{i.value=!1}}function g(C){o.value=C;const x=C.allowed_hosts;let N="default";x==null?N="default":Array.isArray(x)&&x.length===0?N="none":Array.isArray(x)&&(N="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:N,allowed_hosts:Array.isArray(x)?[...x]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function b(){var C;if(o.value){r.value=!0;try{const x=v(d.value.allowed_tools_str),N=d.value.host_mode,F={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:x};N==="none"?F.allowed_hosts=[]:N==="select"?F.allowed_hosts=d.value.allowed_hosts:F.allowed_hosts=null,F.default_host=d.value.default_host||"",await U.put("/api/tokens/"+encodeURIComponent(o.value.user_id),F),o.value=null,we.success("Token updated"),await m()}catch(x){we.error(((C=x.data)==null?void 0:C.error)||x.message||"Failed to update")}finally{r.value=!1}}}async function _(C){var N;if(await Kt({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const F=await U.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=F.token,we.success("Token regenerated")}catch(F){we.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to regenerate")}}async function k(C){var N;if(await Kt({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/tokens/"+encodeURIComponent(C.user_id)),we.success("Token deleted"),await m()}catch(F){we.error(((N=F.data)==null?void 0:N.error)||F.message||"Failed to delete")}}async function I(){if(l.value)try{await navigator.clipboard.writeText(l.value),we.success("Copied to clipboard")}catch{we.error("Copy failed — select and copy manually")}}return Ge(m),{loading:e,error:t,tokens:s,availableHosts:a,showCreate:n,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:h,toggleCreateHost:w,toggleEditHost:A,createToken:y,startEdit:g,saveEdit:b,confirmRegenerate:_,confirmDelete:k,copyToken:I}}},gS=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),bS=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),yS=Object.freeze(["enabled","base_url","model","max_tokens"]),xS=Object.freeze(["enabled","model","max_tokens"]);function or(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function bp(e){return or(e,gS)}function yp(e){return or(e,bS)}function _S(e,{includeApiKey:t=!1}={}){const s=or(e,yS);return t&&(s.api_key=e.api_key),s}function wS(e){return{timeout:e.timeout}}function kS(e,{includeApiKey:t=!1}={}){const s=or(e,xS);return t&&(s.api_key=e.api_key),s}function SS(e){return{timeout:e.timeout}}function Vl(e,t=500){let s=null;const a=(...n)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...n)},t)};return a.pending=()=>s!==null,a.cancel=()=>{s&&(clearTimeout(s),s=null)},a}const TS={template:`
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
  `,setup(){const e=f(!0),t=f(null),s=f(!1),a=f("codex"),n=f({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-6-astra","gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=q(()=>{const K=n.value.model;return K&&!i.includes(K)?[K,...i]:i}),o=q(()=>{const K=n.value.agent_model;return K&&K!=="auto"&&!i.includes(K)?[K,...i]:i}),r={"gpt-5.5":["max"],"gpt-5.4":["max"],"gpt-5.4-mini":["max"],"gpt-6-astra":["none"]},c=(K,_e)=>!!K&&!!_e&&(r[K]||[]).includes(_e),d=K=>!c(n.value.model,K)&&!(n.value.agent_reasoning_effort===""&&c(n.value.agent_model,K)),u=K=>{const _e=n.value.agent_model;return _e==="auto"?!0:!c(_e||n.value.model,K)},p=q(()=>{const K=n.value.agent_reasoning_effort;return K==="auto"?null:K||n.value.reasoning_effort}),h=K=>c(K,n.value.reasoning_effort)||n.value.agent_model===""&&c(K,p.value),m=K=>c(K,p.value),v=f({enabled:!1,model:"gpt-5.6-luna"}),w=f({unavailable_reason:null}),A=q(()=>{const K=v.value.model;return K&&!i.includes(K)?[K,...i]:i});function y(K){const _e=K.target.value;v.value.enabled=_e!=="",_e!==""&&(v.value.model=_e),ie()}const g=f(!1),b=f({codex:!1,ollama:!1,kimi:!1}),_=f(null),k=f(!1),I=f(""),C=f(null),x=f(!1);let N=0;const F=q(()=>{var K;return Object.entries(((K=_.value)==null?void 0:K.models)||{}).map(([_e,Ee])=>{var Ks,ga,bs;return{model:_e,floor:Ee.floor,override:Ee.override,effectiveBudget:(Ks=Ee.effective)==null?void 0:Ks.effective_budget,configuredPrimaryChars:(ga=Ee.configured)==null?void 0:ga.primary_chars,primaryChars:(bs=Ee.effective)==null?void 0:bs.primary_chars,provenance:Ee.provenance,clampExpiresAt:Ee.clamp_expires_at,densityPriorMilli:Ee.density_prior_milli,densityScope:Ee.density_scope,workloadCalibration:Ee.workload_calibration}})}),T=q(()=>{var K;return((K=_.value)==null?void 0:K.clamps)||[]}),P=q(()=>{var K,_e;return((_e=(K=_.value)==null?void 0:K.models)==null?void 0:_e[n.value.model])||null}),z=f({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),G=f({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),E=f(!1),O=f(!1),R=f(!1),$=f(!1),Q=f(!1),W=f(!1),Z=f(!1),re=f({configured:null}),J=f(!1),pe=f([]),Ne=f(""),ae=f(!1),be=f(!1),j=f({configured:null}),ce=f(!1),he=f([]),Le=f(""),S=f(!1),M=f(!1),B=f(!0),de=f(""),ne=f({configured:null,accounts:[]}),oe=f(null),me=f(null),H=f(""),ee=f(null),X=f(!1),fe=f(null),ue=f(null),ye=f("");let Ie=null;function ve(K,_e="success"){we(K,_e==="error"?"error":"success")}function Fe(K){if(!K)return"?";const _e=K/(1024*1024*1024);return _e>=1?_e.toFixed(1)+" GB":(K/(1024*1024)).toFixed(0)+" MB"}function $e(K){return Number.isFinite(Number(K))?Number(K).toLocaleString():"—"}function ze(K){return K==null?"automatic (model-derived)":Number(K).toLocaleString()+" characters"}function Ye(K){const _e=new Date(K);return Number.isNaN(_e.getTime())?"unknown":_e.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function at(K){return typeof K=="string"&&K.length>12?K.slice(0,8)+"…"+K.slice(-4):K}function nt(K){return typeof K!="number"||!Number.isFinite(K)?"—":(K/1e3).toFixed(2)}function Y(K){return K==="temporary learned clamp"?"is-clamp":K==="override"?"is-override":"is-built-in"}function xe(K){const _e=n.value.context_budget_overrides[K.model];return K.floor!=null&&Number.isFinite(Number(_e))&&Number(_e)>K.floor}function Ce(K,_e){const Ee={...n.value.context_budget_overrides};_e.target.value===""?delete Ee[K]:Ee[K]=Number(_e.target.value),n.value.context_budget_overrides=Ee,x.value=!0}function Oe(K){n.value.context_utilization=K.target.value===""?"":Number(K.target.value),x.value=!0}function te(K){const _e={...n.value.context_budget_overrides};delete _e[K],n.value.context_budget_overrides=_e,x.value=!0}async function Te(){e.value=!0,await Promise.all([De(),Nt(),Cs(),We(),Qe()]),e.value=!1}async function De({preserveBasic:K=!1,preserveAdvanced:_e=!1}={}){try{const Ee=await U.get("/api/llm/status");t.value=Ee,s.value=!1,a.value=Ee.active_provider||"codex",Ee.codex&&!Ds.pending()&&(K||(n.value.enabled=Ee.codex.enabled,n.value.model=Ee.codex.model||"gpt-5.6-sol",n.value.reasoning_effort=Ee.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=Ee.codex.agent_reasoning_effort||"",n.value.agent_model=Ee.codex.agent_model||""),_e||(n.value.request_timeout_seconds=Ee.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=Ee.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...Ee.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...Ee.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...Ee.codex.context_compression||{}},!x.value&&!R.value&&(n.value.context_budget_overrides={...Ee.codex.context_budget_overrides||{}},n.value.context_utilization=Ee.codex.context_utilization??n.value.context_utilization))),Ee.ollama&&!Se.pending()&&(K||(z.value.enabled=Ee.ollama.enabled,z.value.base_url=Ee.ollama.base_url||"",z.value.model=Ee.ollama.model||"",z.value.max_tokens=Ee.ollama.max_tokens||4096),_e||(z.value.timeout=Ee.ollama.timeout??z.value.timeout)),Ee.kimi&&!Ue.pending()&&(K||(G.value.enabled=Ee.kimi.enabled,G.value.model=Ee.kimi.model||"",G.value.max_tokens=Ee.kimi.max_tokens||4096),_e||(G.value.timeout=Ee.kimi.timeout??G.value.timeout)),Ee.auxiliary&&(w.value=Ee.auxiliary,ie.pending()||(v.value.enabled=Ee.auxiliary.enabled,v.value.model=Ee.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function Qe(){const K=++N;k.value=!0,I.value="";try{const _e=await U.get("/api/context/windows");if(K!==N)return;_.value=_e,!R.value&&!x.value&&(n.value.context_budget_overrides=Object.fromEntries(Object.entries(_e.models||{}).filter(([,Ee])=>Ee.override!=null).map(([Ee,Ks])=>[Ee,Ks.override])),n.value.context_utilization=_e.utilization??n.value.context_utilization)}catch(_e){K===N&&(I.value=_e.message||"Failed to load context budgets")}finally{K===N&&(k.value=!1)}}async function Nt(){try{if(re.value=await U.get("/api/ollama/status"),J.value=!1,re.value.model&&(Ne.value=re.value.model),re.value.configured)try{const K=await U.get("/api/ollama/models");pe.value=K.models||[]}catch{pe.value=[]}else if(z.value.base_url)try{const K=await U.post("/api/ollama/probe-models",{base_url:z.value.base_url});pe.value=K.models||[]}catch{pe.value=[]}}catch{J.value=!0}}async function We(){B.value=!0,de.value="";try{ne.value=await U.get("/api/codex/status")}catch(K){de.value=K.message||"Failed to fetch Codex status"}finally{B.value=!1}}async function Dt(){const K=t.value?t.value.active_provider:"codex";Z.value=!0;try{const _e=await U.post("/api/llm/switch",{provider:a.value});_e.error?(a.value=K,ve(_e.error,"error")):(ve("Switched to "+a.value+" ("+_e.model+")"),await Te())}catch(_e){a.value=K,ve(_e.message||"Switch failed","error")}finally{Z.value=!1}}async function Vt(){ae.value=!0;try{const K=await U.post("/api/ollama/reload");ve(K.configured?"Ollama reloaded":K.reason||"Ollama not configured",K.configured?"success":"error"),await Te()}catch(K){ve(K.message||"Reload failed","error")}finally{ae.value=!1}}async function ms(){be.value=!0;try{await U.post("/api/ollama/model",{model:Ne.value}),ve("Model set to "+Ne.value),await Te()}catch(K){ve(K.message||"Failed","error")}finally{be.value=!1}}async function ea(){const K=z.value.base_url;if(!K){ve("Enter a base URL first","error");return}W.value=!0;try{const _e=await U.post("/api/ollama/probe-models",{base_url:K});pe.value=_e.models||[],pe.value.length?(ve(pe.value.length+" model(s) found"),!z.value.model&&pe.value.length&&(z.value.model=pe.value[0].name)):ve("No models found at "+K,"error")}catch(_e){ve(_e.message||"Could not reach Ollama","error")}finally{W.value=!1}}async function Cs(){try{if(j.value=await U.get("/api/kimi/status"),ce.value=!1,j.value.model&&(Le.value=j.value.model),j.value.configured)try{const K=await U.get("/api/kimi/models");he.value=K.models||[]}catch{he.value=[]}}catch{ce.value=!0}}async function nn(){S.value=!0;try{const K=await U.post("/api/kimi/reload");ve(K.configured?"Kimi reloaded":K.reason||"Kimi not configured",K.configured?"success":"error"),await Te()}catch(K){ve(K.message||"Reload failed","error")}finally{S.value=!1}}async function ta(){M.value=!0;try{await U.post("/api/kimi/model",{model:Le.value}),ve("Model set to "+Le.value),await Te()}catch(K){ve(K.message||"Failed","error")}finally{M.value=!1}}async function Vs(){if(R.value){Ds();return}R.value=!0;const K=bp(n.value);try{await U.put("/api/llm/codex/config",K),ve("Codex config saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),We()])}catch(_e){ve(_e.message||"Failed","error");const Ee=JSON.stringify(bp(n.value))!==JSON.stringify(K);await Promise.all([De({preserveBasic:Ee,preserveAdvanced:!0}),We()])}finally{R.value=!1}}async function ha(){if(R.value)return;R.value=!0;const K=yp(n.value);try{await U.put("/api/llm/codex/config",K),JSON.stringify({context_budget_overrides:n.value.context_budget_overrides,context_utilization:n.value.context_utilization})===JSON.stringify({context_budget_overrides:K.context_budget_overrides,context_utilization:K.context_utilization})&&(x.value=!1),ve("Codex advanced settings saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),We(),Qe()])}catch(_e){ve(_e.message||"Failed","error");const Ee=JSON.stringify(yp(n.value))!==JSON.stringify(K);await Promise.all([De({preserveBasic:!0,preserveAdvanced:Ee}),We(),Qe()])}finally{R.value=!1}}async function vs(){if($.value){Se();return}$.value=!0;try{const K=E.value?z.value.api_key:null,_e=_S(z.value,{includeApiKey:K!==null});await U.put("/api/llm/ollama/config",_e),ve("Ollama config saved"),K!==null&&z.value.api_key===K&&(z.value.api_key="",E.value=!1),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(K){ve(K.message||"Failed","error")}finally{$.value=!1}}async function Ha(){if(!$.value){$.value=!0;try{await U.put("/api/llm/ollama/config",wS(z.value)),ve("Ollama timeout saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(K){ve(K.message||"Failed","error")}finally{$.value=!1}}}async function gs(){if(Q.value){Ue();return}Q.value=!0;try{const K=O.value?G.value.api_key:null,_e=kS(G.value,{includeApiKey:K!==null});await U.put("/api/llm/kimi/config",_e),ve("Kimi config saved"),K!==null&&G.value.api_key===K&&(G.value.api_key="",O.value=!1),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Cs()])}catch(K){ve(K.message||"Failed","error")}finally{Q.value=!1}}async function it(){if(!Q.value){Q.value=!0;try{await U.put("/api/llm/kimi/config",SS(G.value)),ve("Kimi timeout saved"),await Promise.all([De({preserveBasic:!0,preserveAdvanced:!0}),Cs()])}catch(K){ve(K.message||"Failed","error")}finally{Q.value=!1}}}async function Pt(){if(g.value){ie();return}g.value=!0;try{await U.put("/api/llm/auxiliary/config",v.value),ve("Auxiliary config saved"),await De()}catch(K){ve(K.message||"Failed","error"),await De()}finally{g.value=!1}}const Ds=Vl(Vs),ie=Vl(Pt),Se=Vl(vs),Ue=Vl(gs),et=()=>(Ds.cancel(),Vs()),kt=()=>(Se.cancel(),vs()),ft=()=>(Ue.cancel(),gs()),za=()=>ha(),qs=()=>Ha(),wi=()=>it();async function ki(K){const _e=K.account_key+":"+K.model;C.value=_e;try{const Ee=await U.post("/api/context/windows/clear",{account_key:K.account_key,model:K.model});ve(Ee.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await Qe()}catch(Ee){ve(Ee.message||"Failed to clear clamp","error"),await Qe()}finally{C.value=null}}async function Ln(K){try{await U.post("/api/codex/account/"+K+"/activate"),ve("Active account switched"),await We()}catch(_e){ve(_e.message||"Failed","error")}}async function Nn(K){oe.value=K;try{await U.post("/api/codex/account/"+K+"/refresh"),ve("Token refreshed"),await We()}catch(_e){ve(_e.message||"Refresh failed","error")}finally{oe.value=null}}function ln(K,_e){me.value=K,H.value=_e||""}async function ma(K){try{await U.put("/api/codex/account/"+K+"/label",{label:H.value}),ve("Label updated"),me.value=null,await We()}catch(_e){ve(_e.message||"Failed","error")}}async function Gs(K,_e){if(await Kt({title:"Delete Codex account",message:`Delete ${_e||"account #"+(K+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await U.del("/api/codex/account/"+K),ve("Deleted. Pool reloaded."),await We()}catch(Ks){ve(Ks.message||"Failed","error")}}async function va(){X.value=!0;try{const K=await U.post("/api/codex/device-code");fe.value=K,ee.value="pending",Es(K)}catch(K){ve(K.message||"Failed","error")}finally{X.value=!1}}async function Es(K){Ie={cancelled:!1};const _e=Ie;try{const Ee=await U.post("/api/codex/device-poll",{device_auth_id:K.device_auth_id,user_code:K.user_code,interval:K.interval});if(_e.cancelled)return;ue.value=Ee,ee.value="success",await Te()}catch(Ee){if(_e.cancelled)return;ye.value=Ee.message||"Device login failed",ee.value="error"}}function Dn(){Ie&&(Ie.cancelled=!0),ee.value=null,fe.value=null}return Ge(Te),mt(()=>{Ie&&(Ie.cancelled=!0),Ds.cancel(),ie.cancel(),Se.cancel(),Ue.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:a,switching:Z,advancedOpen:b,codexForm:n,codexModelOptions:l,codexAgentModelOptions:o,mainEffortAllowed:d,agentEffortAllowed:u,mainModelOptionDisabled:h,agentModelOptionDisabled:m,auxForm:v,auxData:w,auxModelOptions:A,onAuxModelChange:y,savingAux:g,saveAuxConfigDebounced:ie,ollamaForm:z,kimiForm:G,savingCodex:R,savingOllama:$,savingKimi:Q,probingOllama:W,ollamaKeyDirty:E,kimiKeyDirty:O,fetchCodexStatus:We,ollamaStatus:re,ollamaStatusLoadFailed:J,ollamaModels:pe,ollamaSelectedModel:Ne,reloading:ae,settingModel:be,kimiStatus:j,kimiStatusLoadFailed:ce,kimiModels:he,kimiSelectedModel:Le,reloadingKimi:S,settingKimiModel:M,codexLoading:B,codexError:de,codexData:ne,refreshing:oe,editingLabel:me,labelValue:H,contextWindows:_,contextWindowsLoading:k,contextWindowsError:I,contextBudgetRows:F,activeClampRows:T,activeContextBudget:P,clearingClamp:C,contextPolicyDirty:x,deviceState:ee,deviceLoading:X,deviceInfo:fe,deviceResult:ue,deviceError:ye,fetchAll:Te,fetchLLMStatus:De,fetchOllamaStatus:Nt,fetchKimiStatus:Cs,switchProvider:Dt,reloadOllama:Vt,setOllamaModel:ms,reloadKimi:nn,setKimiModel:ta,probeOllamaModels:ea,saveCodexConfig:Vs,saveOllamaConfig:vs,saveKimiConfig:gs,saveCodexAdvancedConfig:ha,saveOllamaAdvancedConfig:Ha,saveKimiAdvancedConfig:it,saveCodexConfigDebounced:Ds,saveOllamaConfigDebounced:Se,saveKimiConfigDebounced:Ue,saveCodexConfigNow:et,saveOllamaConfigNow:kt,saveKimiConfigNow:ft,saveCodexAdvancedConfigNow:za,saveOllamaAdvancedConfigNow:qs,saveKimiAdvancedConfigNow:wi,activateAccount:Ln,refreshAccount:Nn,startEditLabel:ln,saveLabel:ma,deleteAccount:Gs,startDeviceLogin:va,cancelDeviceLogin:Dn,formatSize:Fe,fetchContextWindows:Qe,clearContextClamp:ki,setContextOverride:Ce,setContextUtilization:Oe,resetContextOverride:te,overrideAboveFloor:xe,formatCount:$e,formatContextCeiling:ze,formatExpiry:Ye,shortAccountKey:at,provenanceClass:Y,formatDensity:nt}}},xp={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function CS(e){return xp[e]||xp[(e||"").toLowerCase()]||"text-gray-400"}const ES={template:`
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
  `,setup(){const e=f(!0),t=f({}),s=f([]),a=f({}),n=f({}),i=f(null),l=f(null),o=f(null),r=f(null),c=f(null),d=q(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((I,C)=>I+Number(C||0),0)}),u=f(""),p=f(0),h=f([]),m=q(()=>h.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let w=null;async function A(){var N;const k=await Promise.allSettled(v.map(F=>U.get(F.path))),I=F=>k[F].status==="fulfilled"?k[F].value:null;t.value=I(0)||{};const C=I(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],a.value=I(2)||{},n.value=I(3)||{},i.value=I(4),l.value=I(5),o.value=I(6),r.value=I(7),c.value=I(8);const x=k.filter(F=>F.status==="rejected");if(h.value=k.flatMap((F,T)=>{var P;return F.status==="rejected"?[{...v[T],reason:((P=F.reason)==null?void 0:P.message)||"request failed"}]:[]}),p.value=h.value.length,x.length===k.length){const F=(N=x[0])==null?void 0:N.reason;u.value=(F==null?void 0:F.message)||"Failed to load internals"}else u.value="";e.value=!1}function y(){e.value=!0,u.value="",A()}let g=!1;function b(){g||(g=!0,A(),w||(w=setInterval(A,3e4)))}function _(){g&&(g=!1,w&&(clearInterval(w),w=null))}return Ge(b),es(b),Wt(_),mt(_),{loading:e,error:u,failedCount:p,failedEndpoints:h,failedEndpointSummary:m,endpoints:v,retry:y,startup:t,subsystems:s,sshPool:a,httpPool:n,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:CS,formatAgeSeconds:Kw}}},AS=1e4,_p=3e4;function Oi(e,t){return Math.max(0,e-t)}function Or(e,t){return new Set((e.operations||[]).map(a=>a.state)).has("MANUAL_RESOLUTION_REQUIRED")?0:e.expired_lease||e.status==="ACTIVE"&&(!e.lease_expires_at||e.lease_expires_at<t)?1:e.status==="SUSPENDED"?2:e.status==="ACTIVE"?3:4}const RS=[{label:"Manual resolution required",cls:"badge-danger"},{label:"Lease expired",cls:"badge-warning"},{label:"Suspended",cls:"badge-warning"},{label:"Active",cls:"badge-success"},{label:"Terminal",cls:"badge-info"}],IS={template:`
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
  `,setup(){const e=f(null),t=f(""),s=f(null),a=f(!1),n=f(0),i=f(null),l=f(""),o=f(null),r=f(!1),c=f(0),d=f(Date.now());let u=null,p=0,h=0;async function m(){const O=++p;a.value=!0;try{const R=await U.get("/api/turn-state/turns?limit=100");if(O!==p)return;t.value=R.availability,e.value=R.availability==="available"?R.data:null,s.value=null,n.value=Date.now()}catch(R){if(O!==p)return;s.value=R.message||"Turn-state read failed",R.status===503&&(t.value="unavailable")}O===p&&(a.value=!1)}async function v(){const O=++h;r.value=!0;try{const R=await U.get("/api/turn-state/capacity-breakers");if(O!==h)return;l.value=R.availability,i.value=R.availability==="available"?R.data:null,o.value=null,c.value=Date.now()}catch(R){if(O!==h)return;o.value=R.message||"Breaker read failed",R.status===503&&(l.value="unavailable")}O===h&&(r.value=!1)}function w(){m(),v()}const A=q(()=>e.value!==null&&Oi(d.value,n.value)>_p),y=q(()=>i.value!==null&&Oi(d.value,c.value)>_p),g=q(()=>A.value||y.value),b=q(()=>Math.round(Oi(d.value,n.value)/1e3)),_=q(()=>Math.round(Oi(d.value,c.value)/1e3));function k(O){return Or(O,d.value/1e3)}function I(O){return RS[k(O)]}const C=q(()=>{var $;const O=[...(($=e.value)==null?void 0:$.turns)||[]],R=d.value/1e3;return O.sort((Q,W)=>Or(Q,R)-Or(W,R)||(W.last_progress_at||0)-(Q.last_progress_at||0))});function x(O){return O.state==="closed"?"badge-success":O.state==="probing"?"badge-warning":"badge-danger"}function N(O){if(O.state==="closed")return"—";const R=Oi(d.value,c.value)/1e3,$=Math.max(0,(O.cooldown_remaining_seconds||0)-R);return $>0?`${Math.ceil($)}s`:O.state==="probing"?"probe in flight":"probe eligible"}function F(O){if(!O)return"";const R=Math.max(0,Math.round(d.value/1e3-O));if(R<90)return`${R}s ago`;const $=Math.round(R/60);return $<90?`${$}m ago`:`${Math.round($/60)}h ago`}let T=null,P=null,z=!1;function G(){z||(z=!0,w(),T=setInterval(w,AS),u=setInterval(()=>{d.value=Date.now()},1e3),P=st.onReconnected(w))}function E(){z&&(z=!1,T&&(clearInterval(T),T=null),u&&(clearInterval(u),u=null),P&&(P(),P=null))}return Ge(G),es(G),Wt(E),mt(E),{turnsData:e,turnsAvailability:t,turnsError:s,turnsLoading:a,breakersData:i,breakersAvailability:l,breakersError:o,breakersLoading:r,turnsStale:A,breakersStale:y,anyStale:g,turnsAgeSeconds:b,breakersAgeSeconds:_,sortedTurns:C,priorityOf:k,priorityBadge:I,breakerBadge:x,cooldownLabel:N,ageLabel:F,fetchTurns:m,fetchBreakers:v,refreshAll:w,arm:G,disarm:E}}},OS={setup(){const e=f(""),t=f(""),s=f(!1),a=f(""),n=f(!1),i=f(!1),l=f(!1),o=f(null),r=f(!1);async function c(){n.value=!0,o.value=null,r.value=!1;try{const u=await U.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,a.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{n.value=!1}}async function d(){if(await Kt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await U.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ge(c),{current:e,latest:t,updateAvailable:s,changelog:a,checking:n,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},wp=e=>JSON.parse(JSON.stringify(e)),LS=(e,t)=>JSON.stringify(e)===JSON.stringify(t),NS={emits:["saved"],template:`
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
    </section>`,setup(e,{emit:t}){const s=f([]),a=f({}),n=f({}),i=f(!1),l=f(!1),o=f(!1),r=f(!1),c=f(!1),d=f(""),u=f("");let p=!1,h=0,m=null;const v=(E,O)=>p&&h===E&&U.token===O,w=E=>"computer-provisioning-"+E.key,A=E=>E===null?"Unset":E===""?"Empty":JSON.stringify(E),y=E=>{const O=n.value[E.key];return E.type==="array"?String(O||"").split(/\r?\n/).map(R=>R.trim()).filter(Boolean):["integer","number"].includes(E.type)?O===""||O==null?null:Number(O):O},g=q(()=>s.value.map(E=>({...E,value:y(E)})).filter(E=>!LS(E.value,a.value[E.key]))),b=q(()=>s.value.filter(E=>E.pending_restart).map(E=>E.label)),_=q(()=>s.value.some(E=>E.apply_state==="unknown")),k=q(()=>{const E={};for(const O of s.value){const R=y(O),$=O.constraints||{};["integer","number"].includes(O.type)&&(R===null&&!O.nullable?E[O.key]="A number is required.":R!==null&&(!Number.isFinite(R)||O.type==="integer"&&!Number.isInteger(R)||$.minimum!=null&&R<$.minimum||$.maximum!=null&&R>$.maximum)&&(E[O.key]="Enter a number within the allowed range.")),O.key==="monitor_names"&&(R.length>16||new Set(R).size!==R.length||R.some(Q=>!/^[A-Za-z0-9_.-]{1,64}$/.test(Q)))&&(E[O.key]="Use up to 16 unique monitor names, one per line (letters, digits, dot, underscore or hyphen).")}return E}),I=q(()=>Object.keys(k.value).length>0);function C(E,O){n.value[E.key]=O,u.value=""}function x(){n.value=Object.fromEntries(s.value.map(E=>[E.key,E.type==="array"?a.value[E.key].join(`
`):a.value[E.key]])),r.value=!1}async function N(E,O){const[R,$]=await Promise.all([U.get("/api/config"),U.get("/api/config/meta")]);if(!v(E,O))return!1;const Q=($.fields||[]).filter(W=>/^computer\.[^.]+$/.test(W.path)&&W.path!=="computer.enabled"&&W.sensitivity==="public"&&W.apply_mode==="restart");if(!R.computer||!Q.length)throw new Error("Provisioning metadata is unavailable. Reload before editing.");return s.value=Q.map(W=>({...W,key:W.path.split(".")[1]})),a.value=Object.fromEntries(s.value.map(W=>[W.key,wp(R.computer[W.key])])),x(),m=O,i.value=!0,c.value=!1,!0}async function F(){if(!p||l.value||o.value)return;const E=++h,O=U.token;l.value=!0,i.value=!1,d.value="",u.value="",r.value=!1;try{await N(E,O)}catch(R){v(E,O)&&(c.value=!0,d.value=R.message||"Could not load provisioning. No changes were sent.")}finally{v(E,O)&&(l.value=!1)}}function T(){i.value&&!l.value&&!o.value&&!c.value&&g.value.length&&!I.value&&(r.value=!0)}async function P(){if(!p||!i.value||!r.value||o.value||l.value||c.value||I.value||!g.value.length)return;if(m!==U.token){G(),z();return}const E={computer:Object.fromEntries(g.value.map(Q=>[Q.key,wp(Q.value)]))},O=h,R=U.token;o.value=!0,d.value="",u.value="";let $=!1;try{if(await U.put("/api/config",E),$=!0,!v(O,R))return;await N(O,R)&&(u.value="Provisioning saved and configuration reloaded. Startup settings remain pinned until Odin restarts; no lifecycle action was requested.",t("saved"))}catch(Q){v(O,R)&&(c.value=!0,r.value=!1,d.value=$?"Provisioning was saved, but configuration refresh failed. Reload saved values before editing again.":`Save failed or its outcome is unknown${Q.status===400?": "+Q.message:"."} Reload saved values before editing or retrying. No request was replayed.`)}finally{v(O,R)&&(o.value=!1)}}function z(){p||(p=!0,F())}function G(){p=!1,h++,i.value=!1,l.value=!1,o.value=!1,r.value=!1,m=null,s.value=[],a.value={},n.value={},d.value="",u.value=""}return Ge(z),es(z),Wt(G),mt(G),{fields:s,original:a,draft:n,ready:i,loading:l,saving:o,reviewing:r,uncertain:c,error:d,message:u,pending:b,effectiveUnknown:_,changes:g,validation:k,invalid:I,fieldId:w,format:A,edit:C,discard:x,load:F,openReview:T,save:P}}},DS={components:{ComputerProvisioning:NS},template:`
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
    </div>`,setup(){const e=f({state:"unknown",available:!1}),t=f(!1),s=f(!1),a=f(!1),n=f(!1),i=f(!1),l=f(!1),o=f(""),r=f(!1),c=f(!1),d=f(!1),u=f(0),p=f(""),h=f(""),m=f(null),v=f(""),w=f(!1),A=f(Date.now()),y=f(""),g=f(null);let b=0,_=null,k=!1,I=U.token,C=0,x=null,N=null,F=!1;const T=H=>H===!0?"Enabled":H===!1?"Disabled":"Unknown",P=q(()=>{var H;return((H=e.value.backend)==null?void 0:H.environment)==="existing_session"}),z=q(()=>{var ee;const H=Date.parse(((ee=e.value.accessibility)==null?void 0:ee.checked_at)||"");return c.value&&Number.isFinite(H)&&A.value-H<15e3&&A.value>=H-5e3}),G=q(()=>{var H;return z.value?T((H=e.value.accessibility)==null?void 0:H.enabled):"Unknown / not current"}),E=q(()=>{var H;return z.value?((H=e.value.accessibility)==null?void 0:H.reason)==="property_read"?"Last checked: "+e.value.accessibility.checked_at:"Property unavailable for this target. Isolated sessions, an unbound operator identity, an inactive accessibility service or an inaccessible session bus may prevent this read. Unknown does not mean disabled.":"No current property read; unknown does not mean disabled."}),O=q(()=>Object.entries(e.value.input_limits||{}).filter(([,H])=>typeof H=="number"&&Number.isFinite(H)).map(([H,ee])=>`${H}: ${ee}`).join(", ")),R=q(()=>{var ee;const H=(ee=e.value.application_provenance)==null?void 0:ee.script_identity;return typeof H=="string"?H:!H||typeof H!="object"?"Not observed":`${H.interpreter_basename||"Unknown interpreter"}; argv digest ${H.argv_digest||"not recorded"}; ${H.verified===!0?"verified":"not verified"}`}),$=q(()=>Array.isArray(e.value.application_profiles)?e.value.application_profiles.filter(H=>H&&typeof H.id=="string"&&typeof H.label=="string"&&["supported","capture_only"].includes(H.input)).slice(0,16):[]),Q=q(()=>{const H=e.value.restart_required;return Array.isArray(H)?H.length?H.join(", "):"None reported":H===!0?"Pending; restart required":H===!1?"None reported":"Unknown"}),W=q(()=>{var ee,X;const H=Date.parse(((ee=m.value)==null?void 0:ee.captured_at)||"");return Number.isFinite(H)&&A.value<H+Math.min(1e4,((X=m.value)==null?void 0:X.fresh_for_ms)||0)?"Fresh frame":"Stale frame — observe again before acting"});function Z(){v.value&&URL.revokeObjectURL(v.value),v.value="",m.value=null}function re(){b++,Z(),g.value=null,c.value=!1,x==null||x.abort(),x=null,t.value=!1,h.value="",s.value=!1,i.value=!1,l.value=!1}function J(H,ee){return k&&H===b&&ee===U.token}function pe(){return k&&c.value&&N===U.token&&Date.now()-u.value<15e3}function Ne(H,ee="mutation"){var fe,ue;re(),F=!0,p.value="";const X=H.status||(H.name==="AuthError"?401:0);[401,403,404].includes(X)?(u.value=0,N=null,e.value={available:!1,state:"unknown"}):u.value||(e.value={available:!1,state:X===503?"unavailable":"unknown"}),o.value=X===401||X===403||X===404?"Access unavailable or revoked. Authenticate as the session owner, then refresh.":X===410?"Evidence or artifact expired. Observe or prepare the export again.":ee==="read"?"Status refresh failed. Last-known details are not current. No mutation was requested by this read.":ee==="acknowledged"?"The mutation was acknowledged, but status refresh failed. Refresh status independently; do not replay the change.":"Request failed; outcome unknown. Refresh status. No action was replayed.",ee==="mutation"&&![401,403,404].includes(X)&&typeof((fe=H.data)==null?void 0:fe.code)=="string"&&/^[a-z_]{1,64}$/.test(H.data.code)&&typeof((ue=H.data)==null?void 0:ue.error)=="string"&&(o.value=H.data.error.slice(0,512),H.data.outcome==="not_applied"&&H.data.next_action==="repair_provisioning"&&typeof H.data.remedy=="string"&&(o.value="Not applied (preflight rejection). "+o.value,p.value=H.data.remedy.slice(0,1024)))}async function ae(){if(t.value||r.value||a.value||n.value||d.value||!k)return;const H=b,ee=U.token;t.value=!0,C=Date.now();const X=new AbortController;x=X;try{const fe=await U.get("/api/computer",{signal:X.signal});if(!J(H,ee))return;be(fe)}catch(fe){J(H,ee)&&Ne(fe,"read")}finally{x===X&&(x=null,t.value=!1)}}function be(H,ee=""){if(!H||typeof H!="object"||typeof H.state!="string"||typeof H.available!="boolean")throw new Error("Invalid status");(e.value.session_id&&e.value.session_id!==H.session_id||e.value.generation!=null&&e.value.generation!==H.generation||e.value.session_generation!=null&&e.value.session_generation!==H.session_generation)&&re(),e.value=H,u.value=Date.now(),N=U.token,c.value=!(r.value&&ee!=="toggle")&&!(a.value&&ee!=="stop")&&!(n.value&&ee!=="pause")&&!(d.value&&ee!=="recovery"),o.value="",p.value="",F=!c.value}async function j(H){if(!pe()||r.value||a.value||n.value||d.value)return;re();const ee=b,X=U.token;r.value=!0;let fe=!1;try{if(await U.post("/api/computer/enabled",{enabled:H}),fe=!0,!J(ee,X))return;const ue=await U.get("/api/computer");J(ee,X)&&be(ue,"toggle")}catch(ue){J(ee,X)&&Ne(ue,fe?"acknowledged":"mutation")}finally{r.value=!1}}async function ce(H){if(!k||!["pause","stop"].includes(H)||(H==="stop"?a.value:n.value))return;re();const ee=b,X=U.token,fe=H==="stop"?a:n;fe.value=!0;let ue=!1;try{if(await U.post("/api/computer/"+H,{}),ue=!0,J(ee,X)){const ye=await U.get("/api/computer");J(ee,X)&&be(ye,H)}}catch(ye){J(ee,X)&&Ne(ye,ue?"acknowledged":"mutation")}finally{fe.value=!1}}async function he(){var fe;if(!pe()||d.value||((fe=e.value.backend)==null?void 0:fe.native_backend)!=="hyprland")return;const H={session_id:e.value.session_id,generation:e.value.session_generation};if(!H.session_id||!Number.isInteger(H.generation))return;re();const ee=b,X=U.token;d.value=!0;try{const ue=await U.post("/api/computer/release_owned_input",H);J(ee,X)&&be(ue,"recovery")}catch(ue){J(ee,X)&&Ne(ue,"mutation")}finally{d.value=!1}}async function Le(){return M(!1)}async function S(){return M(!0)}async function M(H){var Ie;if(!pe()||d.value||r.value||a.value||n.value||e.value.state!=="quarantined")return;const ee={session_id:e.value.session_id,generation:e.value.session_generation};if(!ee.session_id||!Number.isInteger(ee.generation))return;if(H){if(h.value!=="ACKNOWLEDGE UNVERIFIED CLEANUP "+ee.session_id)return;ee.acknowledgment=h.value}const X=H?((Ie=e.value.recovery)==null?void 0:Ie.reason)==="legacy_runtime_identity_missing"?"acknowledge_legacy":"reconcile":"recover";re();const fe=b,ue=U.token;d.value=!0;let ye=!1;try{const ve=await U.post("/api/computer/"+X,ee);ye=!0,J(fe,ue)&&be(ve,"recovery")}catch(ve){J(fe,ue)&&Ne(ve,ye?"acknowledged":"mutation")}finally{d.value=!1}}async function B(){var X;if(!pe()||s.value||!e.value.available)return;Z(),w.value=!1;const H=b,ee=U.token;s.value=!0;try{const fe=await U.post("/api/computer/observe",{});if(!J(H,ee))return;if(!/^[A-Za-z0-9_-]{8,128}$/.test(((X=fe.frame)==null?void 0:X.evidence_id)||""))throw new Error("Invalid evidence");const ue=await U.getBlob("/api/computer/evidence/"+fe.frame.evidence_id);if(!J(H,ee))return;if(!["image/png","image/jpeg"].includes(ue.type)||ue.size>2097152||!Number.isFinite(Date.parse(fe.frame.expires_at))||Date.parse(fe.frame.expires_at)<=Date.now())throw new Error("Invalid evidence");m.value=fe.frame,v.value=URL.createObjectURL(ue),o.value=""}catch(fe){J(H,ee)&&Ne(fe)}finally{H===b&&(s.value=!1)}}async function de(){if(!pe()||i.value||!e.value.available)return;g.value=null;const H=b,ee=U.token;i.value=!0;try{const X=await U.post("/api/computer/export",{name:y.value});J(H,ee)&&(g.value=X,o.value="")}catch(X){J(H,ee)&&Ne(X)}finally{H===b&&(i.value=!1)}}async function ne(){if(!pe()||l.value||!g.value)return;const H=b,ee=U.token,X=g.value;l.value=!0;try{if(!/^[A-Za-z0-9_-]{8,128}$/.test((X==null?void 0:X.artifact_id)||""))throw new Error("Invalid export");const fe=await U.getBlob("/api/computer/download/"+X.artifact_id);if(!J(H,ee))return;const ue=URL.createObjectURL(fe),ye=document.createElement("a");ye.href=ue,ye.download=X.name,ye.click(),setTimeout(()=>URL.revokeObjectURL(ue),1e3)}catch(fe){J(H,ee)&&Ne(fe)}finally{H===b&&(l.value=!1)}}function oe(){k||(I!==U.token&&(I=U.token,re(),u.value=0,N=null,e.value={state:"unknown",available:!1},o.value="",p.value=""),k=!0,ae(),_=setInterval(()=>{A.value=Date.now(),I!==U.token&&(I=U.token,re(),u.value=0,N=null,o.value="",p.value="",e.value={state:"unknown",available:!1}),c.value&&A.value-u.value>=15e3&&re(),m.value&&Date.parse(m.value.expires_at)<=A.value&&(Z(),w.value=!0),g.value&&Date.parse(g.value.expires_at)<=A.value&&(g.value=null),!F&&A.value-C>=5e3&&ae()},500))}function me(){k=!1,clearInterval(_),_=null,re(),c.value=!1}return Ge(oe),es(oe),Wt(me),mt(me),{status:e,checkedAt:u,remedy:p,loading:t,observing:s,stopping:a,pausing:n,exporting:i,downloading:l,error:o,frame:m,frameUrl:v,frameExpired:w,freshness:W,name:y,artifact:g,refresh:ae,control:ce,observe:B,clearFrame:Z,exportFile:de,download:ne,toggling:r,adminReady:c,enabledLabel:T,restartSettings:Q,setEnabled:j,recovering:d,recover:Le,reconcile:S,releaseOwnedInput:he,reconciliationAck:h,applicationProfiles:$,attached:P,scriptIdentity:R,inputLimits:O,accessibilityLabel:G,accessibilityDetail:E}}},hv=[{id:"health",label:"Health",component:Uk},{id:"resources",label:"Resources",component:Bk},{id:"logs",label:"Logs",component:Qk},{id:"config",label:"Config",component:dS},{id:"discord",label:"Discord",component:pS},{id:"hosts",label:"Hosts",component:mS},{id:"host-access",label:"Host Access",component:hS},{id:"api-tokens",label:"API Tokens",component:vS},{id:"llm",label:"LLM Config",component:TS},{id:"internals",label:"Internals",component:ES},{id:"turn-state",label:"Turn State",component:IS},{id:"computer",label:"Computer",component:DS},{id:"update",label:"Update",component:OS}],PS={components:{TabbedPage:ir},setup(){return{tabs:hv}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},ql=(e,t,s,a)=>a.map(({id:n,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:n}}})),MS=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...ql("Operations","operations","/operations",nv),...ql("History","history","/history",iv),...ql("Capabilities","capabilities","/capabilities",lv),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...ql("System","system","/system",hv)],_s=sn({open:!1,query:"",selected:0});function kp(){_s.query="",_s.selected=0,_s.open=!0}function Lr(){_s.open=!1}function FS(e,t){const s=e.label.toLowerCase(),a=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:a.startsWith(t)?80:s.includes(t)?60:a.includes(t)?40:0:1}const $S={setup(){const e=Zm(),t=f(null),s=q(()=>{const i=_s.query.trim().toLowerCase();return MS.map(l=>({...l,_score:FS(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});Ut(()=>_s.open,async i=>{var l;i&&(await Ot(),(l=t.value)==null||l.focus())}),Ut(()=>_s.query,()=>{_s.selected=0});function a(i){Lr(),e.push(i.to)}function n(i){if(i.key==="Escape"){i.preventDefault(),Lr();return}if(i.key==="ArrowDown")i.preventDefault(),_s.selected=Math.min(_s.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),_s.selected=Math.max(_s.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[_s.selected];l&&a(l)}}return{state:_s,results:s,inputEl:t,go:a,onKeydown:n,closePalette:Lr}},template:`
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
  `},yc={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(yc));const US={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>ci("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[ci("path",{d:yc[e.name]||yc.info})])}},BS=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Sp(e){return[...e.querySelectorAll(BS)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const HS={mounted(e){const t=document.activeElement,s=a=>{if(a.key!=="Tab")return;const n=Sp(e);if(!n.length){a.preventDefault(),e.focus();return}const i=n[0],l=n[n.length-1];a.shiftKey&&document.activeElement===i?(a.preventDefault(),l.focus()):!a.shiftKey&&document.activeElement===l&&(a.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Sp(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},zS={template:`
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
    </div>`,setup(){const e=f({}),t=f(!0),s=f(null),a=f([]),n=f(!1),i=f([]),l=f(!1),o=f(!1),r=f([]),c=f(0),d=f(null),u=f({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const h=q(()=>{const Q=e.value.uptime_seconds||0,W=Math.floor(Q/86400),Z=Math.floor(Q%86400/3600),re=Math.floor(Q%3600/60),J=[];return W>0&&J.push(`${W}d`),Z>0&&J.push(`${Z}h`),(J.length===0||W===0&&Z===0)&&J.push(`${re}m`),J.join(" ")}),m=q(()=>{const Q=e.value.uptime_seconds||0;return 125.66*(1-Math.min(Q/86400,1))}),v=q(()=>{const Q=e.value;return[{label:"Guilds",value:Q.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:Q.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:Q.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${Q.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:Q.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:Q.loop_count>0?"text-green-400":"",highlight:Q.loop_count>0},{label:"Agents",value:Q.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:Q.agent_count>0?`${Q.agent_count} total`:"",subColor:"text-gray-500",highlight:(Q.agent_running??0)>0},{label:"Processes",value:Q.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:Q.process_count>0?`${Q.process_count} total`:"",subColor:"text-gray-500",highlight:(Q.process_running??0)>0},{label:"Schedules",value:Q.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(Q.schedule_failing>0?`${Q.schedule_failing} failing`:"")+(Q.schedule_failing>0&&Q.schedule_paused>0?", ":"")+(Q.schedule_paused>0?`${Q.schedule_paused} paused`:"")||void 0,subColor:Q.schedule_failing>0?"text-red-400":"text-yellow-400",color:Q.schedule_failing>0?"text-red-400":"",highlight:Q.schedule_failing>0},{label:"Users",value:Q.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),w=q(()=>{const Q=e.value,W=[];return W.push({label:"Bot",status:Q.status==="online"?"ok":"warn",detail:Q.status==="online"?"Online":"Starting"}),(Q.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${Q.schedule_failing} failing`}):(Q.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${Q.schedule_count} configured`}),(Q.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${Q.loop_count} active`}),(Q.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${Q.agent_running} running`}),(Q.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${Q.process_running} running`}),W});async function A(){try{e.value=await U.get("/api/status"),s.value=null}catch(Q){s.value=Q.message}finally{t.value=!1}}let y=0,g=0,b=0,_=0;function k(Q,W){const Z=new Set;return[...W,...Q].filter(re=>{const J=re._hmac||JSON.stringify([re.timestamp,re.tool_name,re.user_id,re.result_summary,re.error]);return Z.has(J)?!1:(Z.add(J),!0)})}async function I(){const Q=++y,W=b;n.value=!0;try{const Z=await U.get("/api/audit?limit=10");if(Q!==y)return;const re=W===b?[]:a.value.filter(J=>(J._liveEpoch||0)>W);a.value=k(Z,re).slice(0,10),c.value=re.length}catch{}Q===y&&(n.value=!1)}async function C(){const Q=++g,W=_;l.value=!0;try{const Z=await U.get("/api/audit?error_only=1&limit=5");if(Q!==g)return;const re=W===_?[]:i.value.filter(J=>(J._liveErrorEpoch||0)>W);i.value=k(Z,re).slice(0,5),o.value=!1}catch{if(Q!==g)return;o.value=W===_||i.value.length===0}Q===g&&(l.value=!1)}async function x(){try{const Q=await U.get("/api/knowledge");d.value=(Array.isArray(Q)?Q:[]).reduce((W,Z)=>W+(Z.chunks||0),0)}catch{d.value=null}}async function N(){try{const Q=await U.get("/api/agents");r.value=Q.filter(W=>W.status==="running")}catch{}}async function F(){u.value={...u.value,reload:!0};try{await U.post("/api/reload"),we.success("Config reloaded")}catch(Q){we.error(Q.message)}u.value={...u.value,reload:!1}}async function T(){if(!await Kt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const Z=await U.post("/api/sessions/clear-all");we.success(`Cleared ${Z.count} session${Z.count!==1?"s":""}`),await A()}catch(Z){e.value={...e.value,session_count:W},we.error(Z.message)}u.value={...u.value,clearSessions:!1}}async function P(){if(!await Kt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const Z=await U.post("/api/loops/stop-all");we.success(Z.result),await A()}catch(Z){e.value={...e.value,loop_count:W},we.error(Z.message)}u.value={...u.value,stopLoops:!1}}function z(){t.value=!0,s.value=null,A(),I(),C(),N()}let G=null,E=null,O=null;function R(Q){if(Q.payload&&Q.payload.tool_name){b+=1;const W={...Q.payload,_isNew:!0,_key:++p,_liveEpoch:b};a.value.unshift(W),a.value.length>10&&a.value.pop(),c.value++,W.error&&(_+=1,W._liveErrorEpoch=_,o.value=!1,i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(O),O=setTimeout(()=>{c.value=0},1e4)}}let $=null;return Ge(async()=>{await Promise.all([A(),I(),C(),N(),x()]),G=setInterval(A,15e3),E=setInterval(N,1e4),st.subscribe("events",R),$=st.onReconnected(()=>{I(),C()})}),mt(()=>{G&&clearInterval(G),E&&clearInterval(E),clearTimeout(O),st.unsubscribe("events",R),$&&($(),$=null)}),{status:e,loading:t,error:s,uptime:h,uptimeRingOffset:m,stats:v,healthIndicators:w,activity:a,activityLoading:n,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:I,fetchErrors:C,fetchStatus:A,onEvent:R,formatTime:Gw,formatDuration:bi,retry:z,reloadConfig:F,clearSessions:T,stopAllLoops:P}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Tp(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,a=Array(t);s<t;s++)a[s]=e[s];return a}function jS(e){if(Array.isArray(e))return e}function VS(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var a,n,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(a=i.call(s)).done)&&(o.push(a.value),o.length!==t);r=!0);}catch(d){c=!0,n=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw n}}return o}}function qS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function GS(e,t){return jS(e)||VS(e,t)||KS(e,t)||qS()}function KS(e,t){if(e){if(typeof e=="string")return Tp(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Tp(e,t):void 0}}const mv=Object.entries,Cp=Object.setPrototypeOf,WS=Object.isFrozen,JS=Object.getPrototypeOf,ZS=Object.getOwnPropertyDescriptor;let hs=Object.freeze,js=Object.seal,Kn=Object.create,vv=typeof Reflect<"u"&&Reflect,xc=vv.apply,_c=vv.construct;hs||(hs=function(t){return t});js||(js=function(t){return t});xc||(xc=function(t,s){for(var a=arguments.length,n=new Array(a>2?a-2:0),i=2;i<a;i++)n[i-2]=arguments[i];return t.apply(s,n)});_c||(_c=function(t){for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return new t(...a)});const _a=Bt(Array.prototype.forEach),YS=Bt(Array.prototype.lastIndexOf),Ep=Bt(Array.prototype.pop),zn=Bt(Array.prototype.push),QS=Bt(Array.prototype.splice),cs=Array.isArray,Ui=Bt(String.prototype.toLowerCase),Nr=Bt(String.prototype.toString),Ap=Bt(String.prototype.match),jn=Bt(String.prototype.replace),Rp=Bt(String.prototype.indexOf),XS=Bt(String.prototype.trim),e1=Bt(Number.prototype.toString),t1=Bt(Boolean.prototype.toString),Ip=typeof BigInt>"u"?null:Bt(BigInt.prototype.toString),Op=typeof Symbol>"u"?null:Bt(Symbol.prototype.toString),Ct=Bt(Object.prototype.hasOwnProperty),Li=Bt(Object.prototype.toString),Jt=Bt(RegExp.prototype.test),dn=s1(TypeError);function Bt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,a=new Array(s>1?s-1:0),n=1;n<s;n++)a[n-1]=arguments[n];return xc(e,t,a)}}function s1(e){return function(){for(var t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return _c(e,s)}}function qe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Ui;if(Cp&&Cp(e,null),!cs(t))return e;let a=t.length;for(;a--;){let n=t[a];if(typeof n=="string"){const i=s(n);i!==n&&(WS(t)||(t[a]=i),n=i)}e[n]=!0}return e}function a1(e){for(let t=0;t<e.length;t++)Ct(e,t)||(e[t]=null);return e}function ss(e){const t=Kn(null);for(const a of mv(e)){var s=GS(a,2);const n=s[0],i=s[1];Ct(e,n)&&(cs(i)?t[n]=a1(i):i&&typeof i=="object"&&i.constructor===Object?t[n]=ss(i):t[n]=i)}return t}function n1(e){switch(typeof e){case"string":return e;case"number":return e1(e);case"boolean":return t1(e);case"bigint":return Ip?Ip(e):"0";case"symbol":return Op?Op(e):"Symbol()";case"undefined":return Li(e);case"function":case"object":{if(e===null)return Li(e);const t=e,s=ia(t,"toString");if(typeof s=="function"){const a=s(t);return typeof a=="string"?a:Li(a)}return Li(e)}default:return Li(e)}}function ia(e,t){for(;e!==null;){const a=ZS(e,t);if(a){if(a.get)return Bt(a.get);if(typeof a.value=="function")return Bt(a.value)}e=JS(e)}function s(){return null}return s}function i1(e){try{return Jt(e,""),!0}catch{return!1}}const Lp=hs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Dr=hs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Pr=hs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),l1=hs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Mr=hs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),o1=hs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Np=hs(["#text"]),Dp=hs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Fr=hs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Pp=hs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),Gl=hs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),r1=js(/{{[\w\W]*|^[\w\W]*}}/g),c1=js(/<%[\w\W]*|^[\w\W]*%>/g),d1=js(/\${[\w\W]*/g),u1=js(/^data-[\-\w.\u00B7-\uFFFF]+$/),p1=js(/^aria-[\-\w]+$/),Mp=js(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),f1=js(/^(?:\w+script|data):/i),h1=js(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),m1=js(/^html$/i),v1=js(/^[a-z][.\w]*(-[.\w]+)+$/i),aa={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},g1=function(){return typeof window>"u"?null:window},b1=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let a=null;const n="data-tt-policy-suffix";s&&s.hasAttribute(n)&&(a=s.getAttribute(n));const i="dompurify"+(a?"#"+a:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Fp=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function gv(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:g1();const t=Ae=>gv(Ae);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==aa.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const a=s,n=a.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,h=ia(p,"cloneNode"),m=ia(p,"remove"),v=ia(p,"nextSibling"),w=ia(p,"childNodes"),A=ia(p,"parentNode"),y=ia(p,"shadowRoot"),g=ia(p,"attributes"),b=l&&l.prototype?ia(l.prototype,"nodeType"):null,_=l&&l.prototype?ia(l.prototype,"nodeName"):null;if(typeof i=="function"){const Ae=s.createElement("template");Ae.content&&Ae.content.ownerDocument&&(s=Ae.content.ownerDocument)}let k,I="",C,x=!1,N=0;const F=function(){if(N>0)throw dn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},T=function(D){F(),N++;try{return k.createHTML(D)}finally{N--}},P=function(D){F(),N++;try{return k.createScriptURL(D)}finally{N--}},z=function(){return x||(C=b1(u,n),x=!0),C},G=s,E=G.implementation,O=G.createNodeIterator,R=G.createDocumentFragment,$=G.getElementsByTagName,Q=a.importNode;let W=Fp();t.isSupported=typeof mv=="function"&&typeof A=="function"&&E&&E.createHTMLDocument!==void 0;const Z=r1,re=c1,J=d1,pe=u1,Ne=p1,ae=f1,be=h1,j=v1;let ce=Mp,he=null;const Le=qe({},[...Lp,...Dr,...Pr,...Mr,...Np]);let S=null;const M=qe({},[...Dp,...Fr,...Pp,...Gl]);let B=Object.seal(Kn(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),de=null,ne=null;const oe=Object.seal(Kn(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let me=!0,H=!0,ee=!1,X=!0,fe=!1,ue=!0,ye=!1,Ie=!1,ve=!1,Fe=!1,$e=!1,ze=!1,Ye=!0,at=!1;const nt="user-content-";let Y=!0,xe=!1,Ce={},Oe=null;const te=qe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Te=null;const De=qe({},["audio","video","img","source","image","track"]);let Qe=null;const Nt=qe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),We="http://www.w3.org/1998/Math/MathML",Dt="http://www.w3.org/2000/svg",Vt="http://www.w3.org/1999/xhtml";let ms=Vt,ea=!1,Cs=null;const nn=qe({},[We,Dt,Vt],Nr);let ta=qe({},["mi","mo","mn","ms","mtext"]),Vs=qe({},["annotation-xml"]);const ha=qe({},["title","style","font","a","script"]);let vs=null;const Ha=["application/xhtml+xml","text/html"],gs="text/html";let it=null,Pt=null;const Ds=s.createElement("form"),ie=function(D){return D instanceof RegExp||D instanceof Function},Se=function(){let D=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Pt&&Pt===D)return;(!D||typeof D!="object")&&(D={}),D=ss(D),vs=Ha.indexOf(D.PARSER_MEDIA_TYPE)===-1?gs:D.PARSER_MEDIA_TYPE,it=vs==="application/xhtml+xml"?Nr:Ui,he=Ct(D,"ALLOWED_TAGS")&&cs(D.ALLOWED_TAGS)?qe({},D.ALLOWED_TAGS,it):Le,S=Ct(D,"ALLOWED_ATTR")&&cs(D.ALLOWED_ATTR)?qe({},D.ALLOWED_ATTR,it):M,Cs=Ct(D,"ALLOWED_NAMESPACES")&&cs(D.ALLOWED_NAMESPACES)?qe({},D.ALLOWED_NAMESPACES,Nr):nn,Qe=Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)?qe(ss(Nt),D.ADD_URI_SAFE_ATTR,it):Nt,Te=Ct(D,"ADD_DATA_URI_TAGS")&&cs(D.ADD_DATA_URI_TAGS)?qe(ss(De),D.ADD_DATA_URI_TAGS,it):De,Oe=Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)?qe({},D.FORBID_CONTENTS,it):te,de=Ct(D,"FORBID_TAGS")&&cs(D.FORBID_TAGS)?qe({},D.FORBID_TAGS,it):ss({}),ne=Ct(D,"FORBID_ATTR")&&cs(D.FORBID_ATTR)?qe({},D.FORBID_ATTR,it):ss({}),Ce=Ct(D,"USE_PROFILES")?D.USE_PROFILES&&typeof D.USE_PROFILES=="object"?ss(D.USE_PROFILES):D.USE_PROFILES:!1,me=D.ALLOW_ARIA_ATTR!==!1,H=D.ALLOW_DATA_ATTR!==!1,ee=D.ALLOW_UNKNOWN_PROTOCOLS||!1,X=D.ALLOW_SELF_CLOSE_IN_ATTR!==!1,fe=D.SAFE_FOR_TEMPLATES||!1,ue=D.SAFE_FOR_XML!==!1,ye=D.WHOLE_DOCUMENT||!1,Fe=D.RETURN_DOM||!1,$e=D.RETURN_DOM_FRAGMENT||!1,ze=D.RETURN_TRUSTED_TYPE||!1,ve=D.FORCE_BODY||!1,Ye=D.SANITIZE_DOM!==!1,at=D.SANITIZE_NAMED_PROPS||!1,Y=D.KEEP_CONTENT!==!1,xe=D.IN_PLACE||!1,ce=i1(D.ALLOWED_URI_REGEXP)?D.ALLOWED_URI_REGEXP:Mp,ms=typeof D.NAMESPACE=="string"?D.NAMESPACE:Vt,ta=Ct(D,"MATHML_TEXT_INTEGRATION_POINTS")&&D.MATHML_TEXT_INTEGRATION_POINTS&&typeof D.MATHML_TEXT_INTEGRATION_POINTS=="object"?ss(D.MATHML_TEXT_INTEGRATION_POINTS):qe({},["mi","mo","mn","ms","mtext"]),Vs=Ct(D,"HTML_INTEGRATION_POINTS")&&D.HTML_INTEGRATION_POINTS&&typeof D.HTML_INTEGRATION_POINTS=="object"?ss(D.HTML_INTEGRATION_POINTS):qe({},["annotation-xml"]);const le=Ct(D,"CUSTOM_ELEMENT_HANDLING")&&D.CUSTOM_ELEMENT_HANDLING&&typeof D.CUSTOM_ELEMENT_HANDLING=="object"?ss(D.CUSTOM_ELEMENT_HANDLING):Kn(null);if(B=Kn(null),Ct(le,"tagNameCheck")&&ie(le.tagNameCheck)&&(B.tagNameCheck=le.tagNameCheck),Ct(le,"attributeNameCheck")&&ie(le.attributeNameCheck)&&(B.attributeNameCheck=le.attributeNameCheck),Ct(le,"allowCustomizedBuiltInElements")&&typeof le.allowCustomizedBuiltInElements=="boolean"&&(B.allowCustomizedBuiltInElements=le.allowCustomizedBuiltInElements),fe&&(H=!1),$e&&(Fe=!0),Ce&&(he=qe({},Np),S=Kn(null),Ce.html===!0&&(qe(he,Lp),qe(S,Dp)),Ce.svg===!0&&(qe(he,Dr),qe(S,Fr),qe(S,Gl)),Ce.svgFilters===!0&&(qe(he,Pr),qe(S,Fr),qe(S,Gl)),Ce.mathMl===!0&&(qe(he,Mr),qe(S,Pp),qe(S,Gl))),oe.tagCheck=null,oe.attributeCheck=null,Ct(D,"ADD_TAGS")&&(typeof D.ADD_TAGS=="function"?oe.tagCheck=D.ADD_TAGS:cs(D.ADD_TAGS)&&(he===Le&&(he=ss(he)),qe(he,D.ADD_TAGS,it))),Ct(D,"ADD_ATTR")&&(typeof D.ADD_ATTR=="function"?oe.attributeCheck=D.ADD_ATTR:cs(D.ADD_ATTR)&&(S===M&&(S=ss(S)),qe(S,D.ADD_ATTR,it))),Ct(D,"ADD_URI_SAFE_ATTR")&&cs(D.ADD_URI_SAFE_ATTR)&&qe(Qe,D.ADD_URI_SAFE_ATTR,it),Ct(D,"FORBID_CONTENTS")&&cs(D.FORBID_CONTENTS)&&(Oe===te&&(Oe=ss(Oe)),qe(Oe,D.FORBID_CONTENTS,it)),Ct(D,"ADD_FORBID_CONTENTS")&&cs(D.ADD_FORBID_CONTENTS)&&(Oe===te&&(Oe=ss(Oe)),qe(Oe,D.ADD_FORBID_CONTENTS,it)),Y&&(he["#text"]=!0),ye&&qe(he,["html","head","body"]),he.table&&(qe(he,["tbody"]),delete de.tbody),D.TRUSTED_TYPES_POLICY){if(typeof D.TRUSTED_TYPES_POLICY.createHTML!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof D.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw dn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ge=k;k=D.TRUSTED_TYPES_POLICY;try{I=T("")}catch(Pe){throw k=ge,Pe}}else D.TRUSTED_TYPES_POLICY===null?(k=void 0,I=""):(k===void 0&&(k=z()),k&&typeof I=="string"&&(I=T("")));(W.uponSanitizeElement.length>0||W.uponSanitizeAttribute.length>0)&&he===Le&&(he=ss(he)),W.uponSanitizeAttribute.length>0&&S===M&&(S=ss(S)),hs&&hs(D),Pt=D},Ue=qe({},[...Dr,...Pr,...l1]),et=qe({},[...Mr,...o1]),kt=function(D){let le=A(D);(!le||!le.tagName)&&(le={namespaceURI:ms,tagName:"template"});const ge=Ui(D.tagName),Pe=Ui(le.tagName);return Cs[D.namespaceURI]?D.namespaceURI===Dt?le.namespaceURI===Vt?ge==="svg":le.namespaceURI===We?ge==="svg"&&(Pe==="annotation-xml"||ta[Pe]):!!Ue[ge]:D.namespaceURI===We?le.namespaceURI===Vt?ge==="math":le.namespaceURI===Dt?ge==="math"&&Vs[Pe]:!!et[ge]:D.namespaceURI===Vt?le.namespaceURI===Dt&&!Vs[Pe]||le.namespaceURI===We&&!ta[Pe]?!1:!et[ge]&&(ha[ge]||!Ue[ge]):!!(vs==="application/xhtml+xml"&&Cs[D.namespaceURI]):!1},ft=function(D){zn(t.removed,{element:D});try{A(D).removeChild(D)}catch{if(m(D),!A(D))throw dn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},za=function(D){const le=w?w(D):D.childNodes;if(le){const Pe=[];_a(le,Be=>{zn(Pe,Be)}),_a(Pe,Be=>{try{m(Be)}catch{}})}const ge=g?g(D):null;if(ge)for(let Pe=ge.length-1;Pe>=0;--Pe){const Be=ge[Pe],je=Be&&Be.name;if(typeof je=="string")try{D.removeAttribute(je)}catch{}}},qs=function(D,le){try{zn(t.removed,{attribute:le.getAttributeNode(D),from:le})}catch{zn(t.removed,{attribute:null,from:le})}if(le.removeAttribute(D),D==="is")if(Fe||$e)try{ft(le)}catch{}else try{le.setAttribute(D,"")}catch{}},wi=function(D){const le=g?g(D):D.attributes;if(le)for(let ge=le.length-1;ge>=0;--ge){const Pe=le[ge],Be=Pe&&Pe.name;if(!(typeof Be!="string"||S[it(Be)]))try{D.removeAttribute(Be)}catch{}}},ki=function(D){const le=[D];for(;le.length>0;){const ge=le.pop();(b?b(ge):ge.nodeType)===aa.element&&wi(ge);const Be=w?w(ge):ge.childNodes;if(Be)for(let je=Be.length-1;je>=0;--je)le.push(Be[je])}},Ln=function(D){let le=null,ge=null;if(ve)D="<remove></remove>"+D;else{const je=Ap(D,/^[\r\n\t ]+/);ge=je&&je[0]}vs==="application/xhtml+xml"&&ms===Vt&&(D='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+D+"</body></html>");const Pe=k?T(D):D;if(ms===Vt)try{le=new d().parseFromString(Pe,vs)}catch{}if(!le||!le.documentElement){le=E.createDocument(ms,"template",null);try{le.documentElement.innerHTML=ea?I:Pe}catch{}}const Be=le.body||le.documentElement;return D&&ge&&Be.insertBefore(s.createTextNode(ge),Be.childNodes[0]||null),ms===Vt?$.call(le,ye?"html":"body")[0]:ye?le.documentElement:Be},Nn=function(D){return O.call(D.ownerDocument||D,D,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},ln=function(D){var le,ge;D.normalize();const Pe=O.call(D.ownerDocument||D,D,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let Be=Pe.nextNode();for(;Be;){let Rt=Be.data;_a([Z,re,J],dt=>{Rt=jn(Rt,dt," ")}),Be.data=Rt,Be=Pe.nextNode()}const je=(le=(ge=D.querySelectorAll)===null||ge===void 0?void 0:ge.call(D,"template"))!==null&&le!==void 0?le:[];_a(Array.from(je),Rt=>{Gs(Rt.content)&&ln(Rt.content)})},ma=function(D){const le=_?_(D):null;return typeof le!="string"||it(le)!=="form"?!1:typeof D.nodeName!="string"||typeof D.textContent!="string"||typeof D.removeChild!="function"||D.attributes!==g(D)||typeof D.removeAttribute!="function"||typeof D.setAttribute!="function"||typeof D.namespaceURI!="string"||typeof D.insertBefore!="function"||typeof D.hasChildNodes!="function"||D.nodeType!==b(D)||D.childNodes!==w(D)},Gs=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return b(D)===aa.documentFragment}catch{return!1}},va=function(D){if(!b||typeof D!="object"||D===null)return!1;try{return typeof b(D)=="number"}catch{return!1}};function Es(Ae,D,le){_a(Ae,ge=>{ge.call(t,D,le,Pt)})}const Dn=function(D){let le=null;if(Es(W.beforeSanitizeElements,D,null),ma(D))return ft(D),!0;const ge=it(_?_(D):D.nodeName);if(Es(W.uponSanitizeElement,D,{tagName:ge,allowedTags:he}),ue&&D.hasChildNodes()&&!va(D.firstElementChild)&&Jt(/<[/\w!]/g,D.innerHTML)&&Jt(/<[/\w!]/g,D.textContent)||ue&&D.namespaceURI===Vt&&ge==="style"&&va(D.firstElementChild)||D.nodeType===aa.progressingInstruction||ue&&D.nodeType===aa.comment&&Jt(/<[/\w]/g,D.data))return ft(D),!0;if(de[ge]||!(oe.tagCheck instanceof Function&&oe.tagCheck(ge))&&!he[ge]){if(!de[ge]&&Ee(ge)&&(B.tagNameCheck instanceof RegExp&&Jt(B.tagNameCheck,ge)||B.tagNameCheck instanceof Function&&B.tagNameCheck(ge)))return!1;if(Y&&!Oe[ge]){const Be=A(D),je=w(D);if(je&&Be){const Rt=je.length;for(let dt=Rt-1;dt>=0;--dt){const bt=xe?je[dt]:h(je[dt],!0);Be.insertBefore(bt,v(D))}}}return ft(D),!0}return(b?b(D):D.nodeType)===aa.element&&!kt(D)||(ge==="noscript"||ge==="noembed"||ge==="noframes")&&Jt(/<\/no(script|embed|frames)/i,D.innerHTML)?(ft(D),!0):(fe&&D.nodeType===aa.text&&(le=D.textContent,_a([Z,re,J],Be=>{le=jn(le,Be," ")}),D.textContent!==le&&(zn(t.removed,{element:D.cloneNode()}),D.textContent=le)),Es(W.afterSanitizeElements,D,null),!1)},K=function(D,le,ge){if(ne[le]||Ye&&(le==="id"||le==="name")&&(ge in s||ge in Ds))return!1;const Pe=S[le]||oe.attributeCheck instanceof Function&&oe.attributeCheck(le,D);if(!(H&&!ne[le]&&Jt(pe,le))){if(!(me&&Jt(Ne,le))){if(!Pe||ne[le]){if(!(Ee(D)&&(B.tagNameCheck instanceof RegExp&&Jt(B.tagNameCheck,D)||B.tagNameCheck instanceof Function&&B.tagNameCheck(D))&&(B.attributeNameCheck instanceof RegExp&&Jt(B.attributeNameCheck,le)||B.attributeNameCheck instanceof Function&&B.attributeNameCheck(le,D))||le==="is"&&B.allowCustomizedBuiltInElements&&(B.tagNameCheck instanceof RegExp&&Jt(B.tagNameCheck,ge)||B.tagNameCheck instanceof Function&&B.tagNameCheck(ge))))return!1}else if(!Qe[le]){if(!Jt(ce,jn(ge,be,""))){if(!((le==="src"||le==="xlink:href"||le==="href")&&D!=="script"&&Rp(ge,"data:")===0&&Te[D])){if(!(ee&&!Jt(ae,jn(ge,be,"")))){if(ge)return!1}}}}}}return!0},_e=qe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Ee=function(D){return!_e[Ui(D)]&&Jt(j,D)},Ks=function(D){Es(W.beforeSanitizeAttributes,D,null);const le=D.attributes;if(!le||ma(D))return;const ge={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:S,forceKeepAttr:void 0};let Pe=le.length;for(;Pe--;){const Be=le[Pe],je=Be.name,Rt=Be.namespaceURI,dt=Be.value,bt=it(je),Ps=dt;let wt=je==="value"?Ps:XS(Ps);if(ge.attrName=bt,ge.attrValue=wt,ge.keepAttr=!0,ge.forceKeepAttr=void 0,Es(W.uponSanitizeAttribute,D,ge),wt=ge.attrValue,at&&(bt==="id"||bt==="name")&&Rp(wt,nt)!==0&&(qs(je,D),wt=nt+wt),ue&&Jt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,wt)){qs(je,D);continue}if(bt==="attributename"&&Ap(wt,"href")){qs(je,D);continue}if(ge.forceKeepAttr)continue;if(!ge.keepAttr){qs(je,D);continue}if(!X&&Jt(/\/>/i,wt)){qs(je,D);continue}fe&&_a([Z,re,J],Mn=>{wt=jn(wt,Mn," ")});const Pn=it(D.nodeName);if(!K(Pn,bt,wt)){qs(je,D);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Rt)switch(u.getAttributeType(Pn,bt)){case"TrustedHTML":{wt=T(wt);break}case"TrustedScriptURL":{wt=P(wt);break}}if(wt!==Ps)try{Rt?D.setAttributeNS(Rt,je,wt):D.setAttribute(je,wt),ma(D)?ft(D):Ep(t.removed)}catch{qs(je,D)}}Es(W.afterSanitizeAttributes,D,null)},ga=function(D){let le=null;const ge=Nn(D);for(Es(W.beforeSanitizeShadowDOM,D,null);le=ge.nextNode();)if(Es(W.uponSanitizeShadowNode,le,null),Dn(le),Ks(le),Gs(le.content)&&ga(le.content),(b?b(le):le.nodeType)===aa.element){const Be=y?y(le):le.shadowRoot;Gs(Be)&&(bs(Be),ga(Be))}Es(W.afterSanitizeShadowDOM,D,null)},bs=function(D){const le=[{node:D,shadow:null}];for(;le.length>0;){const ge=le.pop();if(ge.shadow){ga(ge.shadow);continue}const Pe=ge.node,je=(b?b(Pe):Pe.nodeType)===aa.element,Rt=w?w(Pe):Pe.childNodes;if(Rt)for(let dt=Rt.length-1;dt>=0;--dt)le.push({node:Rt[dt],shadow:null});if(je){const dt=_?_(Pe):null;if(typeof dt=="string"&&it(dt)==="template"){const bt=Pe.content;Gs(bt)&&le.push({node:bt,shadow:null})}}if(je){const dt=y?y(Pe):Pe.shadowRoot;Gs(dt)&&le.push({node:null,shadow:dt},{node:dt,shadow:null})}}};return t.sanitize=function(Ae){let D=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},le=null,ge=null,Pe=null,Be=null;if(ea=!Ae,ea&&(Ae="<!-->"),typeof Ae!="string"&&!va(Ae)&&(Ae=n1(Ae),typeof Ae!="string"))throw dn("dirty is not a string, aborting");if(!t.isSupported)return Ae;Ie||Se(D),t.removed=[];const je=xe&&typeof Ae!="string"&&va(Ae);if(je){const bt=_?_(Ae):Ae.nodeName;if(typeof bt=="string"){const Ps=it(bt);if(!he[Ps]||de[Ps])throw dn("root node is forbidden and cannot be sanitized in-place")}if(ma(Ae))throw dn("root node is clobbered and cannot be sanitized in-place");try{bs(Ae)}catch(Ps){throw za(Ae),Ps}}else if(va(Ae))le=Ln("<!---->"),ge=le.ownerDocument.importNode(Ae,!0),ge.nodeType===aa.element&&ge.nodeName==="BODY"||ge.nodeName==="HTML"?le=ge:le.appendChild(ge),bs(ge);else{if(!Fe&&!fe&&!ye&&Ae.indexOf("<")===-1)return k&&ze?T(Ae):Ae;if(le=Ln(Ae),!le)return Fe?null:ze?I:""}le&&ve&&ft(le.firstChild);const Rt=Nn(je?Ae:le);try{for(;Pe=Rt.nextNode();)Dn(Pe),Ks(Pe),Gs(Pe.content)&&ga(Pe.content)}catch(bt){throw je&&za(Ae),bt}if(je)return _a(t.removed,bt=>{bt.element&&ki(bt.element)}),fe&&ln(Ae),Ae;if(Fe){if(fe&&ln(le),$e)for(Be=R.call(le.ownerDocument);le.firstChild;)Be.appendChild(le.firstChild);else Be=le;return(S.shadowroot||S.shadowrootmode)&&(Be=Q.call(a,Be,!0)),Be}let dt=ye?le.outerHTML:le.innerHTML;return ye&&he["!doctype"]&&le.ownerDocument&&le.ownerDocument.doctype&&le.ownerDocument.doctype.name&&Jt(m1,le.ownerDocument.doctype.name)&&(dt="<!DOCTYPE "+le.ownerDocument.doctype.name+`>
`+dt),fe&&_a([Z,re,J],bt=>{dt=jn(dt,bt," ")}),k&&ze?T(dt):dt},t.setConfig=function(){let Ae=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Se(Ae),Ie=!0},t.clearConfig=function(){Pt=null,Ie=!1,k=C,I=""},t.isValidAttribute=function(Ae,D,le){Pt||Se({});const ge=it(Ae),Pe=it(D);return K(ge,Pe,le)},t.addHook=function(Ae,D){typeof D=="function"&&zn(W[Ae],D)},t.removeHook=function(Ae,D){if(D!==void 0){const le=YS(W[Ae],D);return le===-1?void 0:QS(W[Ae],le,1)[0]}return Ep(W[Ae])},t.removeHooks=function(Ae){W[Ae]=[]},t.removeAllHooks=function(){W=Fp()},t}var $p=gv();function Ed(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var On=Ed();function bv(e){On=e}var Wi={exec:()=>null};function pt(e,t=""){let s=typeof e=="string"?e:e.source;const a={replace:(n,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(ps.caret,"$1"),s=s.replace(n,l),a},getRegex:()=>new RegExp(s,t)};return a}var ps={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},y1=/^(?:[ \t]*(?:\n|$))+/,x1=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,_1=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,El=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,w1=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Ad=/(?:[*+-]|\d{1,9}[.)])/,yv=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,xv=pt(yv).replace(/bull/g,Ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),k1=pt(yv).replace(/bull/g,Ad).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Rd=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,S1=/^[^\n]+/,Id=/(?!\s*\])(?:\\.|[^\[\]\\])+/,T1=pt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Id).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),C1=pt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Ad).getRegex(),rr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Od=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,E1=pt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Od).replace("tag",rr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),_v=pt(Rd).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),A1=pt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",_v).getRegex(),Ld={blockquote:A1,code:x1,def:T1,fences:_1,heading:w1,hr:El,html:E1,lheading:xv,list:C1,newline:y1,paragraph:_v,table:Wi,text:S1},Up=pt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex(),R1={...Ld,lheading:k1,table:Up,paragraph:pt(Rd).replace("hr",El).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Up).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",rr).getRegex()},I1={...Ld,html:pt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Od).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Wi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:pt(Rd).replace("hr",El).replace("heading",` *#{1,6} *[^
]`).replace("lheading",xv).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},O1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,L1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,wv=/^( {2,}|\\)\n(?!\s*$)/,N1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,cr=/[\p{P}\p{S}]/u,Nd=/[\s\p{P}\p{S}]/u,kv=/[^\s\p{P}\p{S}]/u,D1=pt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Nd).getRegex(),Sv=/(?!~)[\p{P}\p{S}]/u,P1=/(?!~)[\s\p{P}\p{S}]/u,M1=/(?:[^\s\p{P}\p{S}]|~)/u,F1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Tv=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,$1=pt(Tv,"u").replace(/punct/g,cr).getRegex(),U1=pt(Tv,"u").replace(/punct/g,Sv).getRegex(),Cv="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",B1=pt(Cv,"gu").replace(/notPunctSpace/g,kv).replace(/punctSpace/g,Nd).replace(/punct/g,cr).getRegex(),H1=pt(Cv,"gu").replace(/notPunctSpace/g,M1).replace(/punctSpace/g,P1).replace(/punct/g,Sv).getRegex(),z1=pt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,kv).replace(/punctSpace/g,Nd).replace(/punct/g,cr).getRegex(),j1=pt(/\\(punct)/,"gu").replace(/punct/g,cr).getRegex(),V1=pt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),q1=pt(Od).replace("(?:-->|$)","-->").getRegex(),G1=pt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",q1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Io=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,K1=pt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Io).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Ev=pt(/^!?\[(label)\]\[(ref)\]/).replace("label",Io).replace("ref",Id).getRegex(),Av=pt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Id).getRegex(),W1=pt("reflink|nolink(?!\\()","g").replace("reflink",Ev).replace("nolink",Av).getRegex(),Dd={_backpedal:Wi,anyPunctuation:j1,autolink:V1,blockSkip:F1,br:wv,code:L1,del:Wi,emStrongLDelim:$1,emStrongRDelimAst:B1,emStrongRDelimUnd:z1,escape:O1,link:K1,nolink:Av,punctuation:D1,reflink:Ev,reflinkSearch:W1,tag:G1,text:N1,url:Wi},J1={...Dd,link:pt(/^!?\[(label)\]\((.*?)\)/).replace("label",Io).getRegex(),reflink:pt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Io).getRegex()},wc={...Dd,emStrongRDelimAst:H1,emStrongLDelim:U1,url:pt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Z1={...wc,br:pt(wv).replace("{2,}","*").getRegex(),text:pt(wc.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Kl={normal:Ld,gfm:R1,pedantic:I1},Ni={normal:Dd,gfm:wc,breaks:Z1,pedantic:J1},Y1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Bp=e=>Y1[e];function la(e,t){if(t){if(ps.escapeTest.test(e))return e.replace(ps.escapeReplace,Bp)}else if(ps.escapeTestNoEncode.test(e))return e.replace(ps.escapeReplaceNoEncode,Bp);return e}function Hp(e){try{e=encodeURI(e).replace(ps.percentDecode,"%")}catch{return null}return e}function zp(e,t){var i;const s=e.replace(ps.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),a=s.split(ps.splitPipe);let n=0;if(a[0].trim()||a.shift(),a.length>0&&!((i=a.at(-1))!=null&&i.trim())&&a.pop(),t)if(a.length>t)a.splice(t);else for(;a.length<t;)a.push("");for(;n<a.length;n++)a[n]=a[n].trim().replace(ps.slashPipe,"|");return a}function Di(e,t,s){const a=e.length;if(a===0)return"";let n=0;for(;n<a&&e.charAt(a-n-1)===t;)n++;return e.slice(0,a-n)}function Q1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let a=0;a<e.length;a++)if(e[a]==="\\")a++;else if(e[a]===t[0])s++;else if(e[a]===t[1]&&(s--,s<0))return a;return s>0?-2:-1}function jp(e,t,s,a,n){const i=t.href,l=t.title||null,o=e[1].replace(n.other.outputLinkReplace,"$1");a.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:a.inlineTokens(o)};return a.state.inLink=!1,r}function X1(e,t,s){const a=e.match(s.other.indentCodeCompensation);if(a===null)return t;const n=a[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=n.length?i.slice(n.length):i}).join(`
`)}var Oo=class{constructor(e){vt(this,"options");vt(this,"rules");vt(this,"lexer");this.options=e||On}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:Di(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],a=X1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:a}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const a=Di(s,"#");(this.options.pedantic||!a||this.rules.other.endingSpaceChar.test(a))&&(s=a.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:Di(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,A=>" ".repeat(3*A.length)),p=e.split(`
`,1)[0],h=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):h?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const A=this.rules.other.nextBulletRegex(m),y=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),b=this.rules.other.headingBeginRegex(m),_=this.rules.other.htmlBeginRegex(m);for(;e;){const k=e.split(`
`,1)[0];let I;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),I=p):I=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||b.test(p)||_.test(p)||A.test(p)||y.test(p))break;if(I.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+I.slice(m);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||b.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=k+`
`,e=e.substring(k.length+1),u=I.slice(m)}}n.loose||(l?n.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,w;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(w=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),n.items.push({type:"list_item",raw:c,task:!!v,checked:w,loose:!1,text:d,tokens:[]}),n.raw+=c}const o=n.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;n.raw=n.raw.trimEnd();for(let r=0;r<n.items.length;r++)if(this.lexer.state.top=!1,n.items[r].tokens=this.lexer.blockTokens(n.items[r].text,[]),!n.loose){const c=n.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));n.loose=d}if(n.loose)for(let r=0;r<n.items.length;r++)n.items[r].loose=!0;return n}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),a=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",n=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:a,title:n}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=zp(t[1]),a=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),n=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===a.length){for(const o of a)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of n)i.rows.push(zp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=Di(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=Q1(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let a=t[2],n="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(a);i&&(a=i[1],n=i[3])}else n=t[3]?t[3].slice(1,-1):"";return a=a.trim(),this.rules.other.startAngleBracket.test(a)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?a=a.slice(1):a=a.slice(1,-1)),jp(t,{href:a&&a.replace(this.rules.inline.anyPunctuation,"$1"),title:n&&n.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const a=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),n=t[a.toLowerCase()];if(!n){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return jp(s,n,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let a=this.rules.inline.emStrongLDelim.exec(e);if(!a||a[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(a[1]||a[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...a[0]].length-1;let l,o,r=i,c=0;const d=a[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(a=d.exec(t))!=null;){if(l=a[1]||a[2]||a[3]||a[4]||a[5]||a[6],!l)continue;if(o=[...l].length,a[3]||a[4]){r+=o;continue}else if((a[5]||a[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...a[0]][0].length,p=e.slice(0,i+a.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const a=this.rules.other.nonSpaceChar.test(s),n=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return a&&n&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,a;return t[2]==="@"?(s=t[1],a="mailto:"+s):(s=t[1],a=s),{type:"link",raw:t[0],text:s,href:a,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let a,n;if(t[2]==="@")a=t[0],n="mailto:"+a;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);a=t[0],t[1]==="www."?n="http://"+t[0]:n=t[0]}return{type:"link",raw:t[0],text:a,href:n,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},Ra=class kc{constructor(t){vt(this,"tokens");vt(this,"options");vt(this,"state");vt(this,"tokenizer");vt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||On,this.options.tokenizer=this.options.tokenizer||new Oo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:ps,block:Kl.normal,inline:Ni.normal};this.options.pedantic?(s.block=Kl.pedantic,s.inline=Ni.pedantic):this.options.gfm&&(s.block=Kl.gfm,this.options.breaks?s.inline=Ni.breaks:s.inline=Ni.gfm),this.tokenizer.rules=s}static get rules(){return{block:Kl,inline:Ni}}static lex(t,s){return new kc(s).lex(t)}static lexInline(t,s){return new kc(s).inlineTokens(t)}lex(t){t=t.replace(ps.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const a=this.inlineQueue[s];this.inlineTokens(a.src,a.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],a=!1){var n,i,l;for(this.options.pedantic&&(t=t.replace(ps.tabCharGlobal,"    ").replace(ps.spaceLine,""));t;){let o;if((i=(n=this.options.extensions)==null?void 0:n.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);a&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),a=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let a=t,n=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(n=this.tokenizer.rules.inline.reflinkSearch.exec(a))!=null;)d.includes(n[0].slice(n[0].lastIndexOf("[")+1,-1))&&(a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(n=this.tokenizer.rules.inline.anyPunctuation.exec(a))!=null;)a=a.slice(0,n.index)+"++"+a.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(n=this.tokenizer.rules.inline.blockSkip.exec(a))!=null;)a=a.slice(0,n.index)+"["+"a".repeat(n[0].length-2)+"]"+a.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,a,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},h),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Lo=class{constructor(e){vt(this,"options");vt(this,"parser");this.options=e||On}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const a=(i=(t||"").match(ps.notSpaceStart))==null?void 0:i[0],n=e.replace(ps.endingNewline,"")+`
`;return a?'<pre><code class="language-'+la(a)+'">'+(s?n:la(n,!0))+`</code></pre>
`:"<pre><code>"+(s?n:la(n,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let a="";for(let l=0;l<e.items.length;l++){const o=e.items[l];a+=this.listitem(o)}const n=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+n+i+`>
`+a+"</"+n+`>
`}listitem(e){var s;let t="";if(e.task){const a=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=a+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=a+" "+la(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:a+" ",text:a+" ",escaped:!0}):t+=a+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let n=0;n<e.header.length;n++)s+=this.tablecell(e.header[n]);t+=this.tablerow({text:s});let a="";for(let n=0;n<e.rows.length;n++){const i=e.rows[n];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);a+=this.tablerow({text:s})}return a&&(a=`<tbody>${a}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+a+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${la(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const a=this.parser.parseInline(s),n=Hp(e);if(n===null)return a;e=n;let i='<a href="'+e+'"';return t&&(i+=' title="'+la(t)+'"'),i+=">"+a+"</a>",i}image({href:e,title:t,text:s,tokens:a}){a&&(s=this.parser.parseInline(a,this.parser.textRenderer));const n=Hp(e);if(n===null)return la(s);e=n;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${la(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:la(e.text)}},Pd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},Ia=class Sc{constructor(t){vt(this,"options");vt(this,"renderer");vt(this,"textRenderer");this.options=t||On,this.options.renderer=this.options.renderer||new Lo,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Pd}static parse(t,s){return new Sc(s).parse(t)}static parseInline(t,s){return new Sc(s).parseInline(t)}parse(t,s=!0){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){a+=d||"";continue}}const r=o;switch(r.type){case"space":{a+=this.renderer.space(r);continue}case"hr":{a+=this.renderer.hr(r);continue}case"heading":{a+=this.renderer.heading(r);continue}case"code":{a+=this.renderer.code(r);continue}case"table":{a+=this.renderer.table(r);continue}case"blockquote":{a+=this.renderer.blockquote(r);continue}case"list":{a+=this.renderer.list(r);continue}case"html":{a+=this.renderer.html(r);continue}case"paragraph":{a+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?a+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):a+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}parseInline(t,s=this.renderer){var n,i;let a="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(n=this.options.extensions)==null?void 0:n.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){a+=c||"";continue}}const r=o;switch(r.type){case"escape":{a+=s.text(r);break}case"html":{a+=s.html(r);break}case"link":{a+=s.link(r);break}case"image":{a+=s.image(r);break}case"strong":{a+=s.strong(r);break}case"em":{a+=s.em(r);break}case"codespan":{a+=s.codespan(r);break}case"br":{a+=s.br(r);break}case"del":{a+=s.del(r);break}case"text":{a+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return a}},$r,eo=($r=class{constructor(e){vt(this,"options");vt(this,"block");this.options=e||On}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?Ra.lex:Ra.lexInline}provideParser(){return this.block?Ia.parse:Ia.parseInline}},vt($r,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),$r),eT=class{constructor(...e){vt(this,"defaults",Ed());vt(this,"options",this.setOptions);vt(this,"parse",this.parseMarkdown(!0));vt(this,"parseInline",this.parseMarkdown(!1));vt(this,"Parser",Ia);vt(this,"Renderer",Lo);vt(this,"TextRenderer",Pd);vt(this,"Lexer",Ra);vt(this,"Tokenizer",Oo);vt(this,"Hooks",eo);this.use(...e)}walkTokens(e,t){var a,n;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(n=(a=this.defaults.extensions)==null?void 0:a.childTokens)!=null&&n[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const a={...s};if(a.async=this.defaults.async||a.async||!1,s.extensions&&(s.extensions.forEach(n=>{if(!n.name)throw new Error("extension name required");if("renderer"in n){const i=t.renderers[n.name];i?t.renderers[n.name]=function(...l){let o=n.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[n.name]=n.renderer}if("tokenizer"in n){if(!n.level||n.level!=="block"&&n.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[n.level];i?i.unshift(n.tokenizer):t[n.level]=[n.tokenizer],n.start&&(n.level==="block"?t.startBlock?t.startBlock.push(n.start):t.startBlock=[n.start]:n.level==="inline"&&(t.startInline?t.startInline.push(n.start):t.startInline=[n.start]))}"childTokens"in n&&n.childTokens&&(t.childTokens[n.name]=n.childTokens)}),a.extensions=t),s.renderer){const n=this.defaults.renderer||new Lo(this.defaults);for(const i in s.renderer){if(!(i in n))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d||""}}a.renderer=n}if(s.tokenizer){const n=this.defaults.tokenizer||new Oo(this.defaults);for(const i in s.tokenizer){if(!(i in n))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=n[l];n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.tokenizer=n}if(s.hooks){const n=this.defaults.hooks||new eo;for(const i in s.hooks){if(!(i in n))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=n[l];eo.passThroughHooks.has(i)?n[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(n,c)).then(u=>r.call(n,u));const d=o.call(n,c);return r.call(n,d)}:n[l]=(...c)=>{let d=o.apply(n,c);return d===!1&&(d=r.apply(n,c)),d}}a.hooks=n}if(s.walkTokens){const n=this.defaults.walkTokens,i=s.walkTokens;a.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),n&&(o=o.concat(n.call(this,l))),o}}this.defaults={...this.defaults,...a}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return Ra.lex(e,t??this.defaults)}parser(e,t){return Ia.parse(e,t??this.defaults)}parseMarkdown(e){return(s,a)=>{const n={...a},i={...this.defaults,...n},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&n.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?Ra.lex:Ra.lexInline,r=i.hooks?i.hooks.provideParser():e?Ia.parse:Ia.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const a="<p>An error occurred:</p><pre>"+la(s.message+"",!0)+"</pre>";return t?Promise.resolve(a):a}if(t)return Promise.reject(s);throw s}}},Tn=new eT;function ct(e,t){return Tn.parse(e,t)}ct.options=ct.setOptions=function(e){return Tn.setOptions(e),ct.defaults=Tn.defaults,bv(ct.defaults),ct};ct.getDefaults=Ed;ct.defaults=On;ct.use=function(...e){return Tn.use(...e),ct.defaults=Tn.defaults,bv(ct.defaults),ct};ct.walkTokens=function(e,t){return Tn.walkTokens(e,t)};ct.parseInline=Tn.parseInline;ct.Parser=Ia;ct.parser=Ia.parse;ct.Renderer=Lo;ct.TextRenderer=Pd;ct.Lexer=Ra;ct.lexer=Ra.lex;ct.Tokenizer=Oo;ct.Hooks=eo;ct.parse=ct;ct.options;ct.setOptions;ct.use;ct.walkTokens;ct.parseInline;Ia.parse;Ra.lex;const tT={breaks:!0,gfm:!0};function Vp(e){if(!e)return"";try{if(typeof ct<"u"&&ct.parse){const t=ct.parse(e,tT);return typeof $p<"u"?$p.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function sT(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),a=t.getMinutes().toString().padStart(2,"0");return`${s}:${a}`}const aT={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",apply_patch:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function nT(e){return aT[e]||"wrench"}const iT=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function qp(e){if(!e)return[];const t=e.match(iT);return t?[...new Set(t)]:[]}const lT={template:`
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
    </div>`,setup(){const e=f([]),t=f(""),s=f(!1),a=f(""),n=f(null),i=f(null),l=f(0),o=f("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=q(()=>t.value.trim().length>0&&!s.value),p=f(st.state||"disconnected");let h=null;const m=q(()=>{const E=p.value;return E==="connected"?"Connected":E==="reconnecting"?"Reconnecting…":E==="connecting"?"Connecting…":"REST fallback"}),v=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],w=q(()=>{const E=Math.floor(l.value/4)%v.length,O=l.value;return O>3?`${v[E]} (${O}s)`:v[0]});function A(){Ot(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!i.value)return;const E=i.value;E.style.height="auto",E.style.height=Math.min(E.scrollHeight,120)+"px"}function g(E,O,R={}){const $={id:++c,role:E,content:O,timestamp:Date.now(),html:E==="bot"?Vp(O):"",tools_used:R.tools_used||[],is_error:R.is_error||!1,images:E==="bot"?qp(O):[],files:R.files||[],_showTools:!1};return e.value.push($),A(),E==="bot"&&Ot(()=>b()),$}function b(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const R=document.createElement("button");R.className="chat-code-copy",R.textContent="Copy",R.addEventListener("click",()=>{const $=O.querySelector("code"),Q=$?$.textContent:O.textContent;navigator.clipboard.writeText(Q).then(()=>{R.textContent="Copied!",setTimeout(()=>{R.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(R)})}function _(E){if(E===0)return!0;const O=e.value[E-1],R=e.value[E],$=new Date(O.timestamp).toDateString(),Q=new Date(R.timestamp).toDateString();return $!==Q}function k(E){const O=new Date(E),R=new Date;if(O.toDateString()===R.toDateString())return"Today";const $=new Date(R);return $.setDate($.getDate()-1),O.toDateString()===$.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function I(E){t.value=E,Ot(()=>z())}function C(E){window.open(E,"_blank","noopener")}function x(E){E.target.style.display="none"}function N(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function F(){r&&(clearInterval(r),r=null),l.value=0}function T(E){s.value&&(s.value=!1,F(),E.type==="chat_response"?g("bot",E.content,{tools_used:E.tools_used||[],is_error:E.is_error||!1,files:E.files||[]}):E.type==="chat_error"&&g("bot",E.error||"Unknown error",{is_error:!0}),Ot(()=>{var O;return(O=i.value)==null?void 0:O.focus()}))}async function P(E){try{const O=await U.post("/api/chat",{content:E,channel_id:o.value});g("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){g("bot",O.message||"Failed to send message",{is_error:!0})}}async function z(){const E=t.value.trim();if(!E||s.value)return;g("user",E),t.value="",s.value=!0,N(),i.value&&(i.value.style.height="auto"),st.connected&&st.sendChat(E,{channelId:o.value})||(await P(E),s.value=!1,F()),Ot(()=>{var R;return(R=i.value)==null?void 0:R.focus()})}async function G(){a.value="";try{if(!o.value){const O=await U.get("/api/auth/session");o.value=O.channel_id||O.user_id||"web-user"}const E=await U.get("/api/sessions/"+encodeURIComponent(o.value));if(E&&E.messages&&E.messages.length>0){for(const O of E.messages){const R=O.role==="user"?"user":"bot";let $=O.content||"";if(R==="user"){const W=$.match(/^\[.*?\]:\s*/);W&&($=$.slice(W[0].length))}if(!$.trim())continue;const Q={id:++c,role:R,content:$,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:R==="bot"?Vp($):"",tools_used:[],is_error:!1,images:R==="bot"?qp($):[],files:[],_showTools:!1};e.value.push(Q)}Ot(()=>{A(),b()})}}catch(E){E&&E.status!==404&&(a.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",we.error(a.value))}}return Ge(()=>{st.subscribe("chat",T),p.value=st.state||"disconnected",h=st.onState(E=>{p.value=E}),G(),Ot(()=>{var E;return(E=i.value)==null?void 0:E.focus()})}),mt(()=>{st.unsubscribe("chat",T),h&&(h(),h=null),F()}),{messages:e,input:t,sending:s,historyError:a,messagesEl:n,inputEl:i,canSend:u,wsStatus:m,typingText:w,suggestions:d,send:z,autoResize:y,formatTime:sT,formatDate:k,showDateSeparator:_,useSuggestion:I,openImage:C,onImageError:x,getToolIcon:nT,loadHistory:G}}},oT={setup(){const e=f("odin"),t=f(""),s=f(""),a=f(""),n=f({}),i=f([]),l=f([]),o=f(!1),r=f(!1),c=f(null),d=f(!0),u=f(""),p=f(!1),h=f(!1),m=q(()=>e.value==="custom"),v=q(()=>[...i.value,...l.value]),w=q(()=>l.value.includes(e.value)),A=q(()=>{var C;return m.value?t.value||"Odin":((C=n.value[e.value])==null?void 0:C.name)||e.value}),y=q(()=>{var C;return m.value?s.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.identity)||""}),g=q(()=>{var C;return m.value?a.value||"(empty — will use Odin default)":((C=n.value[e.value])==null?void 0:C.voice)||""});async function b(){d.value=!0;try{const C=await U.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",a.value=C.custom_voice||"",n.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function _(){o.value=!0,c.value=null,r.value=!1;try{await U.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:a.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(C){c.value=C.message}finally{o.value=!1}}async function k(){const C=u.value.trim();if(C){h.value=!0,c.value=null;try{await U.post("/api/personality/presets",{name:C,display_name:A.value,identity:y.value,voice:g.value}),p.value=!1,u.value="",await b(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(x){c.value=x.message}finally{h.value=!1}}}async function I(){if(await Kt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await U.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await b(),e.value="odin"}catch(x){c.value=x.message}}}return Ge(b),{preset:e,customName:t,customIdentity:s,customVoice:a,presets:n,presetNames:v,isCustom:m,isUserPreset:w,previewName:A,previewIdentity:y,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:_,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:k,deletePreset:I,builtinPresets:i,userPresets:l}},template:`
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
  `},Tt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Rv=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:zS,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:lT,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:ik,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:hk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Pk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:oT,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:PS,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:Tt("/operations","live")},{path:"/agents",redirect:Tt("/operations","agents")},{path:"/loops",redirect:Tt("/operations","loops")},{path:"/processes",redirect:Tt("/operations","processes")},{path:"/schedules",redirect:Tt("/operations","schedules")},{path:"/audit",redirect:Tt("/history","audit")},{path:"/sessions",redirect:Tt("/history","sessions")},{path:"/traces",redirect:Tt("/history","traces")},{path:"/usage",redirect:Tt("/history","usage")},{path:"/tools",redirect:Tt("/capabilities","tools")},{path:"/skills",redirect:Tt("/capabilities","skills")},{path:"/mcp",redirect:Tt("/capabilities","mcp-servers")},{path:"/knowledge",redirect:Tt("/capabilities","knowledge")},{path:"/memory",redirect:Tt("/capabilities","memory")},{path:"/learned",redirect:Tt("/capabilities","learned")},{path:"/health",redirect:Tt("/system","health")},{path:"/resources",redirect:Tt("/system","resources")},{path:"/logs",redirect:Tt("/system","logs")},{path:"/config",redirect:Tt("/system","config")},{path:"/host-access",redirect:Tt("/system","host-access")},{path:"/hosts",redirect:Tt("/system","hosts")},{path:"/internals",redirect:Tt("/system","internals")}],Ji=Dw({history:pw(),routes:Rv});Ji.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const rT={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=f(""),s=f(null),a=f(!1),n=f(!1);async function i(){a.value=!0,s.value=null;try{U.setPersist(n.value),await U.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{a.value=!1}}return{token:t,error:s,busy:a,persist:n,login:i}}},cT={template:`
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
    <command-palette />`,setup(){const e=f("checking"),t=f(!1),s=f(!1),a=f(!1),n=f(null),i=f(null),l=f(!1);let o=null,r=null;const c=f(!1),d=f("disconnected"),u=f(-1),p=f(null);let h=null;const m=f("starting"),v=f(""),w=Rv.filter($=>$.meta),A=q(()=>["Workspace","Operate","Observe","Manage"].map($=>({name:$,routes:w.filter(Q=>Q.meta.section===$)})).filter($=>$.routes.length)),y=q(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.label)||"Odin"}),g=q(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.section)||"Management"}),b=q(()=>{var $;return(($=Ji.currentRoute.value.meta)==null?void 0:$.description)||"Management console"});function _(){st.disconnect(),z&&(clearInterval(z),z=null)}U.onSessionExpired=()=>{t.value=!0,_(),U.setToken(""),e.value="login"};function k($){var Q;if(($.ctrlKey||$.metaKey)&&$.key.toLowerCase()==="k"){e.value==="ready"&&($.preventDefault(),kp());return}if(a.value&&$.key==="Tab"){const W=[...((Q=n.value)==null?void 0:Q.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(W.length){const Z=W[0],re=W[W.length-1];if($.shiftKey&&(document.activeElement===Z||!n.value.contains(document.activeElement))){$.preventDefault(),re.focus();return}if(!$.shiftKey&&(document.activeElement===re||!n.value.contains(document.activeElement))){$.preventDefault(),Z.focus();return}}}if($.key==="Escape"&&a.value){a.value=!1,$.preventDefault();return}if($.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes($.target.tagName)){$.preventDefault();const W=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');W&&W.focus()}}function I(){l.value=!!(o!=null&&o.matches),l.value||(a.value=!1)}Ge(async()=>{document.addEventListener("keydown",k),o=window.matchMedia("(max-width: 900px)"),I(),o.addEventListener("change",I);const $=await U.check();$.ok?(e.value="ready",O()):$.needsAuth?e.value="login":(e.value="ready",O())});function C(){t.value=!1,e.value="ready",O()}async function x(){_(),e.value="login",await U.logout()}function N(){s.value=!s.value}function F(){a.value=!a.value}Ut(a,async $=>{var Q,W;if($)r=document.activeElement,await Ot(),(W=(Q=n.value)==null?void 0:Q.querySelector(".nav-item"))==null||W.focus();else if(r!=null&&r.isConnected){const Z=r;r=null,requestAnimationFrame(()=>Z.focus())}});const T=q(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P($,Q="info",W=3e3){p.value={text:$,level:Q},clearTimeout(h),h=setTimeout(()=>{p.value=null},W)}let z=null,G=!1,E=[];function O(){for(const $ of E)$();E=[st.onStatus($=>{c.value=$}),st.onLatencyChange($=>{u.value=$}),st.onState(($,Q)=>{d.value=$,$==="connected"?(G&&P("Connection restored","success"),G=!0):$==="reconnecting"&&Q.attempt===1&&P("Connection lost — reconnecting…","warn")})],st.connect(),R(),z&&clearInterval(z),z=setInterval(R,15e3)}async function R(){try{const $=await U.get("/api/status");m.value=$.status==="online"?"online":"starting";const Q=$.uptime_seconds||0,W=Math.floor(Q/3600),Z=Math.floor(Q%3600/60);v.value=`${W}h ${Z}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{z&&clearInterval(z);for(const $ of E)$();E=[],st.disconnect(),document.removeEventListener("keydown",k),o==null||o.removeEventListener("change",I)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:a,wsConnected:c,wsState:d,wsLatency:u,wsLabel:T,wsToast:p,botStatus:m,botUptime:v,navRoutes:w,navGroups:A,currentPage:y,currentSection:g,currentDescription:b,sidebarEl:n,mobileMenuButton:i,isMobileViewport:l,onLogin:C,logout:x,toggleSidebar:N,toggleMobileNavigation:F,openPalette:kp}}},an=yo(cT);an.component("odin-icon",US);an.component("login-screen",rT);an.component("toast-container",C_);an.component("confirm-host",E_);an.component("command-palette",$S);an.directive("modal-focus",HS);an.use(Ji);an.mount("#app");
