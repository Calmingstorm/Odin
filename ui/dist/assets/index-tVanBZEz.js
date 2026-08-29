var Ym=Object.defineProperty;var Qm=(e,t,s)=>t in e?Ym(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var ct=(e,t,s)=>Qm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Xm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new ul("Unauthorized");const o=await l.json().catch(()=>null);if(!l.ok){const r=(o==null?void 0:o.error)||`HTTP ${l.status}`;throw new cd(r,l.status,o)}return o}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new ul("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new cd((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new ul((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof ul?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class ul extends Error{constructor(t){super(t),this.name="AuthError"}}class cd extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class ev{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const o=l.type;if(o==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(o==="log")for(const r of this._handlers.logs||[])r(l);else if(o==="event")for(const r of this._handlers.events||[])r(l);else if(o==="chat_response"||o==="chat_error"){this._chatPending=!1;for(const r of this._handlers.chat||[])r(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const G=new Xm,qe=new ev(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ws(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},Fa=[],Vt=()=>{},Ma=()=>!1,va=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),fo=e=>e.startsWith("onUpdate:"),Ge=Object.assign,Xr=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},tv=Object.prototype.hasOwnProperty,tt=(e,t)=>tv.call(e,t),Ce=Array.isArray,$a=e=>ii(e)==="[object Map]",ga=e=>ii(e)==="[object Set]",dd=e=>ii(e)==="[object Date]",sv=e=>ii(e)==="[object RegExp]",Fe=e=>typeof e=="function",He=e=>typeof e=="string",Xt=e=>typeof e=="symbol",et=e=>e!==null&&typeof e=="object",ec=e=>(et(e)||Fe(e))&&Fe(e.then)&&Fe(e.catch),hp=Object.prototype.toString,ii=e=>hp.call(e),nv=e=>ii(e).slice(8,-1),ho=e=>ii(e)==="[object Object]",mo=e=>He(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,xn=ws(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),av=ws("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),vo=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},iv=/-\w/g,lt=vo(e=>e.replace(iv,t=>t.slice(1).toUpperCase())),lv=/\B([A-Z])/g,fs=vo(e=>e.replace(lv,"-$1").toLowerCase()),ba=vo(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ua=vo(e=>e?`on${ba(e)}`:""),Mt=(e,t)=>!Object.is(e,t),Ba=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},mp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},go=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Dl=e=>{const t=He(e)?Number(e):NaN;return isNaN(t)?e:t};let ud;const bo=()=>ud||(ud=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function ov(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const rv="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",cv=ws(rv);function el(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=He(n)?vp(n):el(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(He(e)||et(e))return e}const dv=/;(?![^(]*\))/g,uv=/:([^]+)/,pv=/\/\*[^]*?\*\//g;function vp(e){const t={};return e.replace(pv,"").split(dv).forEach(s=>{if(s){const n=s.split(uv);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function tl(e){let t="";if(He(e))t=e;else if(Ce(e))for(let s=0;s<e.length;s++){const n=tl(e[s]);n&&(t+=n+" ")}else if(et(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function fv(e){if(!e)return null;let{class:t,style:s}=e;return t&&!He(t)&&(e.class=tl(t)),s&&(e.style=el(s)),e}const hv="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",mv="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",vv="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",gv="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",bv=ws(hv),yv=ws(mv),xv=ws(vv),_v=ws(gv),wv="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",kv=ws(wv);function gp(e){return!!e||e===""}function Sv(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=Sn(e[n],t[n]);return s}function Sn(e,t){if(e===t)return!0;let s=dd(e),n=dd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Xt(e),n=Xt(t),s||n)return e===t;if(s=Ce(e),n=Ce(t),s||n)return s&&n?Sv(e,t):!1;if(s=et(e),n=et(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const o=e.hasOwnProperty(l),r=t.hasOwnProperty(l);if(o&&!r||!o&&r||!Sn(e[l],t[l]))return!1}}return String(e)===String(t)}function yo(e,t){return e.findIndex(s=>Sn(s,t))}const bp=e=>!!(e&&e.__v_isRef===!0),yp=e=>He(e)?e:e==null?"":Ce(e)||et(e)&&(e.toString===hp||!Fe(e.toString))?bp(e)?yp(e.value):JSON.stringify(e,xp,2):String(e),xp=(e,t)=>bp(t)?xp(e,t.value):$a(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[jo(n,i)+" =>"]=a,s),{})}:ga(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>jo(s))}:Xt(t)?jo(t):et(t)&&!Ce(t)&&!ho(t)?String(t):t,jo=(e,t="")=>{var s;return Xt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function Tv(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Ot;class tc{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Ot&&(Ot.active?(this.parent=Ot,this.index=(Ot.scopes||(Ot.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Ot;try{return Ot=this,t()}finally{Ot=s}}}on(){++this._on===1&&(this.prevScope=Ot,Ot=this)}off(){if(this._on>0&&--this._on===0){if(Ot===this)Ot=this.prevScope;else{let t=Ot;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function Cv(e){return new tc(e)}function _p(){return Ot}function Ev(e,t=!1){Ot&&Ot.cleanups.push(e)}let dt;const Vo=new WeakSet;class Di{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Ot&&(Ot.active?Ot.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Vo.has(this)&&(Vo.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||kp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,pd(this),Sp(this);const t=dt,s=$s;dt=this,$s=!0;try{return this.fn()}finally{Tp(this),dt=t,$s=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)ac(t);this.deps=this.depsTail=void 0,pd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Vo.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){br(this)&&this.run()}get dirty(){return br(this)}}let wp=0,Ti,Ci;function kp(e,t=!1){if(e.flags|=8,t){e.next=Ci,Ci=e;return}e.next=Ti,Ti=e}function sc(){wp++}function nc(){if(--wp>0)return;if(Ci){let t=Ci;for(Ci=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;Ti;){let t=Ti;for(Ti=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function Sp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function Tp(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),ac(n),Av(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function br(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(Cp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function Cp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Fi)||(e.globalVersion=Fi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!br(e))))return;e.flags|=2;const t=e.dep,s=dt,n=$s;dt=e,$s=!0;try{Sp(e);const a=e.fn(e._value);(t.version===0||Mt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{dt=s,$s=n,Tp(e),e.flags&=-3}}function ac(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)ac(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function Av(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function Rv(e,t){e.effect instanceof Di&&(e=e.effect.fn);const s=new Di(e);t&&Ge(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function Iv(e){e.effect.stop()}let $s=!0;const Ep=[];function Tn(){Ep.push($s),$s=!1}function Cn(){const e=Ep.pop();$s=e===void 0?!0:e}function pd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=dt;dt=void 0;try{t()}finally{dt=s}}}let Fi=0;class Ov{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class xo{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!dt||!$s||dt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==dt)s=this.activeLink=new Ov(dt,this),dt.deps?(s.prevDep=dt.depsTail,dt.depsTail.nextDep=s,dt.depsTail=s):dt.deps=dt.depsTail=s,Ap(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=dt.depsTail,s.nextDep=void 0,dt.depsTail.nextDep=s,dt.depsTail=s,dt.deps===s&&(dt.deps=n)}return s}trigger(t){this.version++,Fi++,this.notify(t)}notify(t){sc();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{nc()}}}function Ap(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)Ap(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Fl=new WeakMap,oa=Symbol(""),yr=Symbol(""),$i=Symbol("");function Zt(e,t,s){if($s&&dt){let n=Fl.get(e);n||Fl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new xo),a.map=n,a.key=s),a.track()}}function mn(e,t,s,n,a,i){const l=Fl.get(e);if(!l){Fi++;return}const o=r=>{r&&r.trigger()};if(sc(),t==="clear")l.forEach(o);else{const r=Ce(e),c=r&&mo(s);if(r&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===$i||!Xt(p)&&p>=d)&&o(u)})}else switch((s!==void 0||l.has(void 0))&&o(l.get(s)),c&&o(l.get($i)),t){case"add":r?c&&o(l.get("length")):(o(l.get(oa)),$a(e)&&o(l.get(yr)));break;case"delete":r||(o(l.get(oa)),$a(e)&&o(l.get(yr)));break;case"set":$a(e)&&o(l.get(oa));break}}nc()}function Lv(e,t){const s=Fl.get(e);return s&&s.get(t)}function Ta(e){const t=Ye(e);return t===e?t:(Zt(t,"iterate",$i),ms(e)?t:t.map(Bs))}function _o(e){return Zt(e=Ye(e),"iterate",$i),e}function en(e,t){return sn(e)?Ka(_n(e)?Bs(t):t):Bs(t)}const Nv={__proto__:null,[Symbol.iterator](){return qo(this,Symbol.iterator,e=>en(this,e))},concat(...e){return Ta(this).concat(...e.map(t=>Ce(t)?Ta(t):t))},entries(){return qo(this,"entries",e=>(e[1]=en(this,e[1]),e))},every(e,t){return on(this,"every",e,t,void 0,arguments)},filter(e,t){return on(this,"filter",e,t,s=>s.map(n=>en(this,n)),arguments)},find(e,t){return on(this,"find",e,t,s=>en(this,s),arguments)},findIndex(e,t){return on(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return on(this,"findLast",e,t,s=>en(this,s),arguments)},findLastIndex(e,t){return on(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return on(this,"forEach",e,t,void 0,arguments)},includes(...e){return Go(this,"includes",e)},indexOf(...e){return Go(this,"indexOf",e)},join(e){return Ta(this).join(e)},lastIndexOf(...e){return Go(this,"lastIndexOf",e)},map(e,t){return on(this,"map",e,t,void 0,arguments)},pop(){return ui(this,"pop")},push(...e){return ui(this,"push",e)},reduce(e,...t){return fd(this,"reduce",e,t)},reduceRight(e,...t){return fd(this,"reduceRight",e,t)},shift(){return ui(this,"shift")},some(e,t){return on(this,"some",e,t,void 0,arguments)},splice(...e){return ui(this,"splice",e)},toReversed(){return Ta(this).toReversed()},toSorted(e){return Ta(this).toSorted(e)},toSpliced(...e){return Ta(this).toSpliced(...e)},unshift(...e){return ui(this,"unshift",e)},values(){return qo(this,"values",e=>en(this,e))}};function qo(e,t,s){const n=_o(e),a=n[t]();return n!==e&&!ms(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Pv=Array.prototype;function on(e,t,s,n,a,i){const l=_o(e),o=l!==e&&!ms(e),r=l[t];if(r!==Pv[t]){const u=r.apply(e,i);return o?Bs(u):u}let c=s;l!==e&&(o?c=function(u,p){return s.call(this,en(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=r.call(l,c,n);return o&&a?a(d):d}function fd(e,t,s,n){const a=_o(e),i=a!==e&&!ms(e);let l=s,o=!1;a!==e&&(i?(o=n.length===0,l=function(c,d,u){return o&&(o=!1,c=en(e,c)),s.call(this,c,en(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const r=a[t](l,...n);return o?en(e,r):r}function Go(e,t,s){const n=Ye(e);Zt(n,"iterate",$i);const a=n[t](...s);return(a===-1||a===!1)&&sl(s[0])?(s[0]=Ye(s[0]),n[t](...s)):a}function ui(e,t,s=[]){Tn(),sc();const n=Ye(e)[t].apply(e,s);return nc(),Cn(),n}const Mv=ws("__proto__,__v_isRef,__isVue"),Rp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Xt));function Dv(e){Xt(e)||(e=String(e));const t=Ye(this);return Zt(t,"has",e),t.hasOwnProperty(e)}class Ip{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Dp:Mp:i?Pp:Np).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=Ce(t);if(!a){let r;if(l&&(r=Nv[s]))return r;if(s==="hasOwnProperty")return Dv}const o=Reflect.get(t,s,At(t)?t:n);if((Xt(s)?Rp.has(s):Mv(s))||(a||Zt(t,"get",s),i))return o;if(At(o)){const r=l&&mo(s)?o:o.value;return a&&et(r)?$l(r):r}return et(o)?a?$l(o):qn(o):o}}class Op extends Ip{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=Ce(t)&&mo(s);if(!this._isShallow){const c=sn(i);if(!ms(n)&&!sn(n)&&(i=Ye(i),n=Ye(n)),!l&&At(i)&&!At(n))return c||(i.value=n),!0}const o=l?Number(s)<t.length:tt(t,s),r=Reflect.set(t,s,n,At(t)?t:a);return t===Ye(a)&&(o?Mt(n,i)&&mn(t,"set",s,n):mn(t,"add",s,n)),r}deleteProperty(t,s){const n=tt(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&mn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Xt(s)||!Rp.has(s))&&Zt(t,"has",s),n}ownKeys(t){return Zt(t,"iterate",Ce(t)?"length":oa),Reflect.ownKeys(t)}}class Lp extends Ip{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Fv=new Op,$v=new Lp,Uv=new Op(!0),Bv=new Lp(!0),xr=e=>e,pl=e=>Reflect.getPrototypeOf(e);function Hv(e,t,s){return function(...n){const a=this.__v_raw,i=Ye(a),l=$a(i),o=e==="entries"||e===Symbol.iterator&&l,r=e==="keys"&&l,c=a[e](...n),d=s?xr:t?Ka:Bs;return!t&&Zt(i,"iterate",r?yr:oa),Ge(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:o?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function fl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function zv(e,t){const s={get(a){const i=this.__v_raw,l=Ye(i),o=Ye(a);e||(Mt(a,o)&&Zt(l,"get",a),Zt(l,"get",o));const{has:r}=pl(l),c=t?xr:e?Ka:Bs;if(r.call(l,a))return c(i.get(a));if(r.call(l,o))return c(i.get(o));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Zt(Ye(a),"iterate",oa),a.size},has(a){const i=this.__v_raw,l=Ye(i),o=Ye(a);return e||(Mt(a,o)&&Zt(l,"has",a),Zt(l,"has",o)),a===o?i.has(a):i.has(a)||i.has(o)},forEach(a,i){const l=this,o=l.__v_raw,r=Ye(o),c=t?xr:e?Ka:Bs;return!e&&Zt(r,"iterate",oa),o.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ge(s,e?{add:fl("add"),set:fl("set"),delete:fl("delete"),clear:fl("clear")}:{add(a){const i=Ye(this),l=pl(i),o=Ye(a),r=!t&&!ms(a)&&!sn(a)?o:a;return l.has.call(i,r)||Mt(a,r)&&l.has.call(i,a)||Mt(o,r)&&l.has.call(i,o)||(i.add(r),mn(i,"add",r,r)),this},set(a,i){!t&&!ms(i)&&!sn(i)&&(i=Ye(i));const l=Ye(this),{has:o,get:r}=pl(l);let c=o.call(l,a);c||(a=Ye(a),c=o.call(l,a));const d=r.call(l,a);return l.set(a,i),c?Mt(i,d)&&mn(l,"set",a,i):mn(l,"add",a,i),this},delete(a){const i=Ye(this),{has:l,get:o}=pl(i);let r=l.call(i,a);r||(a=Ye(a),r=l.call(i,a)),o&&o.call(i,a);const c=i.delete(a);return r&&mn(i,"delete",a,void 0),c},clear(){const a=Ye(this),i=a.size!==0,l=a.clear();return i&&mn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Hv(a,e,t)}),s}function wo(e,t){const s=zv(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(tt(s,a)&&a in n?s:n,a,i)}const jv={get:wo(!1,!1)},Vv={get:wo(!1,!0)},qv={get:wo(!0,!1)},Gv={get:wo(!0,!0)},Np=new WeakMap,Pp=new WeakMap,Mp=new WeakMap,Dp=new WeakMap;function Kv(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function qn(e){return sn(e)?e:ko(e,!1,Fv,jv,Np)}function ic(e){return ko(e,!1,Uv,Vv,Pp)}function $l(e){return ko(e,!0,$v,qv,Mp)}function Wv(e){return ko(e,!0,Bv,Gv,Dp)}function ko(e,t,s,n,a){if(!et(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Kv(nv(e));if(l===0)return e;const o=new Proxy(e,l===2?n:s);return a.set(e,o),o}function _n(e){return sn(e)?_n(e.__v_raw):!!(e&&e.__v_isReactive)}function sn(e){return!!(e&&e.__v_isReadonly)}function ms(e){return!!(e&&e.__v_isShallow)}function sl(e){return e?!!e.__v_raw:!1}function Ye(e){const t=e&&e.__v_raw;return t?Ye(t):e}function Fp(e){return!tt(e,"__v_skip")&&Object.isExtensible(e)&&mp(e,"__v_skip",!0),e}const Bs=e=>et(e)?qn(e):e,Ka=e=>et(e)?$l(e):e;function At(e){return e?e.__v_isRef===!0:!1}function h(e){return $p(e,!1)}function lc(e){return $p(e,!0)}function $p(e,t){return At(e)?e:new Zv(e,t)}class Zv{constructor(t,s){this.dep=new xo,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ye(t),this._value=s?t:Bs(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ms(t)||sn(t);t=n?t:Ye(t),Mt(t,s)&&(this._rawValue=t,this._value=n?t:Bs(t),this.dep.trigger())}}function Jv(e){e.dep&&e.dep.trigger()}function tn(e){return At(e)?e.value:e}function Yv(e){return Fe(e)?e():tn(e)}const Qv={get:(e,t,s)=>t==="__v_raw"?e:tn(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return At(a)&&!At(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function oc(e){return _n(e)?e:new Proxy(e,Qv)}class Xv{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new xo,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Up(e){return new Xv(e)}function eg(e){const t=Ce(e)?new Array(e.length):{};for(const s in e)t[s]=Bp(e,s);return t}class tg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Xt(s)?s:String(s),this._raw=Ye(t);let a=!0,i=t;if(!Ce(t)||Xt(this._key)||!mo(this._key))do a=!sl(i)||ms(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=tn(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&At(this._raw[this._key])){const s=this._object[this._key];if(At(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Lv(this._raw,this._key)}}class sg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function ng(e,t,s){return At(e)?e:Fe(e)?new sg(e):et(e)&&arguments.length>1?Bp(e,t,s):h(e)}function Bp(e,t,s){return new tg(e,t,s)}class ag{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new xo(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Fi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&dt!==this)return kp(this,!0),!0}get value(){const t=this.dep.track();return Cp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function ig(e,t,s=!1){let n,a;return Fe(e)?n=e:(n=e.get,a=e.set),new ag(n,a,s)}const lg={GET:"get",HAS:"has",ITERATE:"iterate"},og={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},hl={},Ul=new WeakMap;let $n;function rg(){return $n}function Hp(e,t=!1,s=$n){if(s){let n=Ul.get(s);n||Ul.set(s,n=[]),n.push(e)}}function cg(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:o,call:r}=s,c=y=>a?y:ms(y)||a===!1||a===0?vn(y,1):vn(y);let d,u,p,f,m=!1,v=!1;if(At(e)?(u=()=>e.value,m=ms(e)):_n(e)?(u=()=>c(e),m=!0):Ce(e)?(v=!0,m=e.some(y=>_n(y)||ms(y)),u=()=>e.map(y=>{if(At(y))return y.value;if(_n(y))return c(y);if(Fe(y))return r?r(y,2):y()})):Fe(e)?t?u=r?()=>r(e,2):e:u=()=>{if(p){Tn();try{p()}finally{Cn()}}const y=$n;$n=d;try{return r?r(e,3,[f]):e(f)}finally{$n=y}}:u=Vt,t&&a){const y=u,T=a===!0?1/0:a;u=()=>vn(y(),T)}const E=_p(),N=()=>{d.stop(),E&&E.active&&Xr(E.effects,d)};if(i&&t){const y=t;t=(...T)=>{const k=y(...T);return N(),k}}let _=v?new Array(e.length).fill(hl):hl;const g=y=>{if(!(!(d.flags&1)||!d.dirty&&!y))if(t){const T=d.run();if(y||a||m||(v?T.some((k,O)=>Mt(k,_[O])):Mt(T,_))){p&&p();const k=$n;$n=d;try{const O=[T,_===hl?void 0:v&&_[0]===hl?[]:_,f];_=T,r?r(t,3,O):t(...O)}finally{$n=k}}}else d.run()};return o&&o(g),d=new Di(u),d.scheduler=l?()=>l(g,!1):g,f=y=>Hp(y,!1,d),p=d.onStop=()=>{const y=Ul.get(d);if(y){if(r)r(y,4);else for(const T of y)T();Ul.delete(d)}},t?n?g(!0):_=d.run():l?l(g.bind(null,!0),!0):d.run(),N.pause=d.pause.bind(d),N.resume=d.resume.bind(d),N.stop=N,N}function vn(e,t=1/0,s){if(t<=0||!et(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,At(e))vn(e.value,t,s);else if(Ce(e))for(let n=0;n<e.length;n++)vn(e[n],t,s);else if(ga(e)||$a(e))e.forEach(n=>{vn(n,t,s)});else if(ho(e)){for(const n in e)vn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&vn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const zp=[];function dg(e){zp.push(e)}function ug(){zp.pop()}function pg(e,t){}const fg={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},hg={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function li(e,t,s,n){try{return n?e(...n):e()}catch(a){ya(a,t,s)}}function _s(e,t,s,n){if(Fe(e)){const a=li(e,t,s,n);return a&&ec(a)&&a.catch(i=>{ya(i,t,s)}),a}if(Ce(e)){const a=[];for(let i=0;i<e.length;i++)a.push(_s(e[i],t,s,n));return a}}function ya(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let o=t.parent;const r=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;o;){const d=o.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,r,c)===!1)return}o=o.parent}if(i){Tn(),li(i,null,10,[e,r,c]),Cn();return}}mg(e,s,a,n,l)}function mg(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const as=[];let Qs=-1;const Ha=[];let Un=null,Oa=0;const jp=Promise.resolve();let Bl=null;function Ct(e){const t=Bl||jp;return e?t.then(this?e.bind(this):e):t}function vg(e){let t=Qs+1,s=as.length;for(;t<s;){const n=t+s>>>1,a=as[n],i=Bi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function rc(e){if(!(e.flags&1)){const t=Bi(e),s=as[as.length-1];!s||!(e.flags&2)&&t>=Bi(s)?as.push(e):as.splice(vg(t),0,e),e.flags|=1,Vp()}}function Vp(){Bl||(Bl=jp.then(qp))}function Ui(e){Ce(e)?Ha.push(...e):Un&&e.id===-1?Un.splice(Oa+1,0,e):e.flags&1||(Ha.push(e),e.flags|=1),Vp()}function hd(e,t,s=Qs+1){for(;s<as.length;s++){const n=as[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;as.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Hl(e){if(Ha.length){const t=[...new Set(Ha)].sort((s,n)=>Bi(s)-Bi(n));if(Ha.length=0,Un){Un.push(...t);return}for(Un=t,Oa=0;Oa<Un.length;Oa++){const s=Un[Oa];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Un=null,Oa=0}}const Bi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function qp(e){try{for(Qs=0;Qs<as.length;Qs++){const t=as[Qs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),li(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Qs<as.length;Qs++){const t=as[Qs];t&&(t.flags&=-2)}Qs=-1,as.length=0,Hl(),Bl=null,(as.length||Ha.length)&&qp()}}let La,ml=[];function Gp(e,t){var s,n;La=e,La?(La.enabled=!0,ml.forEach(({event:a,args:i})=>La.emit(a,...i)),ml=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Gp(i,t)}),setTimeout(()=>{La||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,ml=[])},3e3)):ml=[]}let jt=null,So=null;function Hi(e){const t=jt;return jt=e,So=e&&e.type.__scopeId||null,t}function gg(e){So=e}function bg(){So=null}const yg=e=>cc;function cc(e,t=jt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&qi(-1);const i=Hi(t);let l;try{l=e(...a)}finally{Hi(i),n._d&&qi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function xg(e,t){if(jt===null)return e;const s=ll(jt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,o,r=Ke]=t[a];i&&(Fe(i)&&(i={mounted:i,updated:i}),i.deep&&vn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:o,modifiers:r}))}return e}function Xs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const o=a[l];i&&(o.oldValue=i[l].value);let r=o.dir[n];r&&(Tn(),_s(r,s,8,[e.el,o,e,t]),Cn())}}function Ei(e,t){if(zt){let s=zt.provides;const n=zt.parent&&zt.parent.provides;n===s&&(s=zt.provides=Object.create(n)),s[e]=t}}function Is(e,t,s=!1){const n=os();if(n||ra){let a=ra?ra._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Fe(t)?t.call(n&&n.proxy):t}}function _g(){return!!(os()||ra)}const Kp=Symbol.for("v-scx"),Wp=()=>Is(Kp);function wg(e,t){return nl(e,null,t)}function kg(e,t){return nl(e,null,{flush:"post"})}function Zp(e,t){return nl(e,null,{flush:"sync"})}function ls(e,t,s){return nl(e,t,s)}function nl(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,o=Ge({},s),r=t&&n||!t&&i!=="post";let c;if(fa){if(i==="sync"){const f=Wp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!r){const f=()=>{};return f.stop=Vt,f.resume=Vt,f.pause=Vt,f}}const d=zt;o.call=(f,m,v)=>_s(f,d,m,v);let u=!1;i==="post"?o.scheduler=f=>{Tt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,o.scheduler=(f,m)=>{m?f():rc(f)}),o.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=cg(e,t,o);return fa&&(c?c.push(p):r&&p()),p}function Sg(e,t,s){const n=this.proxy,a=He(e)?e.includes(".")?Jp(n,e):()=>n[e]:e.bind(n,n);let i;Fe(t)?i=t:(i=t.handler,s=t);const l=oi(this),o=nl(a,i.bind(n),s);return l(),o}function Jp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Dn=new WeakMap,Yp=Symbol("_vte"),Qp=e=>e.__isTeleport,na=e=>e&&(e.disabled||e.disabled===""),Tg=e=>e&&(e.defer||e.defer===""),md=e=>typeof SVGElement<"u"&&e instanceof SVGElement,vd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,_r=(e,t)=>{const s=e&&e.to;return He(s)?t?t(s):null:s},Cg={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,o,r,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:m,createText:v,createComment:E,parentNode:N}}=c,_=na(t.props);let{dynamicChildren:g}=t;const y=(O,C,w)=>{O.shapeFlag&16&&d(O.children,C,w,a,i,l,o,r)},T=(O=t)=>{const C=na(O.props),w=O.target=_r(O.props,m),M=wr(w,O,v,f);w&&(l!=="svg"&&md(w)?l="svg":l!=="mathml"&&vd(w)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(w),C||(y(O,w,M),xi(O,!1)))},k=O=>{const C=()=>{if(Dn.get(O)===C){if(Dn.delete(O),na(O.props)){const w=N(O.el)||s;y(O,w,O.anchor),xi(O,!0)}T(O)}};Dn.set(O,C),Tt(C,i)};if(e==null){const O=t.el=v(""),C=t.anchor=v("");if(f(O,s,n),f(C,s,n),Tg(t.props)||i&&i.pendingBranch){k(t);return}_&&(y(t,s,C),xi(t,!0)),T()}else{t.el=e.el;const O=t.anchor=e.anchor,C=Dn.get(e);if(C){C.flags|=8,Dn.delete(e),k(t);return}t.targetStart=e.targetStart;const w=t.target=e.target,M=t.targetAnchor=e.targetAnchor,A=na(e.props),I=A?s:w,$=A?O:M;if(l==="svg"||md(w)?l="svg":(l==="mathml"||vd(w))&&(l="mathml"),g?(p(e.dynamicChildren,g,I,a,i,l,o),xc(e,t,!0)):r||u(e,t,I,$,a,i,l,o,!1),_)A?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):vl(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const F=t.target=_r(t.props,m);F&&vl(t,F,null,c,0)}else A&&vl(t,w,M,c,1);xi(t,_)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:o,anchor:r,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!na(p),m=Dn.get(e);if(m&&(m.flags|=8,Dn.delete(e)),u&&(a(c),a(d)),i&&a(r),!m&&l&16)for(let v=0;v<o.length;v++){const E=o[v];n(E,t,s,f,!!E.dynamicChildren)}},move:vl,hydrate:Eg};function vl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:o,shapeFlag:r,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Dn.has(e)&&(!u||na(d))&&r&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(o,t,s)}function Eg(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:o,querySelector:r,insert:c,createText:d}},u){function p(E,N){let _=N;for(;_;){if(_&&_.nodeType===8){if(_.data==="teleport start anchor")t.targetStart=_;else if(_.data==="teleport anchor"){t.targetAnchor=_,E._lpa=t.targetAnchor&&l(t.targetAnchor);break}}_=l(_)}}function f(E,N){N.anchor=u(l(E),N,o(E),s,n,a,i)}const m=t.target=_r(t.props,r),v=na(t.props);if(m){const E=m._lpa||m.firstChild;t.shapeFlag&16&&(v?(f(e,t),p(m,E),t.targetAnchor||wr(m,t,d,c,o(e)===m?e:null)):(t.anchor=l(e),p(m,E),t.targetAnchor||wr(m,t,d,c),u(E&&l(E),t,m,s,n,a,i))),xi(t,v)}else v&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const Ag=Cg;function xi(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function wr(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Yp]=l,e&&(n(i,e,a),n(l,e,a)),l}const Cs=Symbol("_leaveCb"),pi=Symbol("_enterCb");function dc(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ze(()=>{e.isMounted=!0}),Ao(()=>{e.isUnmounting=!0}),e}const Ts=[Function,Array],uc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:Ts,onEnter:Ts,onAfterEnter:Ts,onEnterCancelled:Ts,onBeforeLeave:Ts,onLeave:Ts,onAfterLeave:Ts,onLeaveCancelled:Ts,onBeforeAppear:Ts,onAppear:Ts,onAfterAppear:Ts,onAppearCancelled:Ts},Xp=e=>{const t=e.subTree;return t.component?Xp(t.component):t},Rg={name:"BaseTransition",props:uc,setup(e,{slots:t}){const s=os(),n=dc();return()=>{const a=t.default&&To(t.default(),!0),i=a&&a.length?ef(a):s.subTree?Ff():void 0;if(!i)return;const l=Ye(e),{mode:o}=l;if(n.isLeaving)return Ko(i);const r=gd(i);if(!r)return Ko(i);let c=Wa(r,l,n,s,u=>c=u);r.type!==kt&&En(r,c);let d=s.subTree&&gd(s.subTree);if(d&&d.type!==kt&&!Fs(d,r)&&Xp(s).type!==kt){let u=Wa(d,l,n,s);if(En(d,u),o==="out-in"&&r.type!==kt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Ko(i);o==="in-out"&&r.type!==kt?u.delayLeave=(p,f,m)=>{const v=sf(n,d);v[String(d.key)]=d,p[Cs]=()=>{f(),p[Cs]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{m(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function ef(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==kt){t=s;break}}return t}const tf=Rg;function sf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Wa(e,t,s,n,a){const{appear:i,mode:l,persisted:o=!1,onBeforeEnter:r,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:m,onLeaveCancelled:v,onBeforeAppear:E,onAppear:N,onAfterAppear:_,onAppearCancelled:g}=t,y=String(e.key),T=sf(s,e),k=(w,M)=>{w&&_s(w,n,9,M)},O=(w,M)=>{const A=M[1];k(w,M),Ce(w)?w.every(I=>I.length<=1)&&A():w.length<=1&&A()},C={mode:l,persisted:o,beforeEnter(w){let M=r;if(!s.isMounted)if(i)M=E||r;else return;w[Cs]&&w[Cs](!0);const A=T[y];A&&Fs(e,A)&&A.el[Cs]&&A.el[Cs](),k(M,[w])},enter(w){if(T[y]===e)return;let M=c,A=d,I=u;if(!s.isMounted)if(i)M=N||c,A=_||d,I=g||u;else return;let $=!1;w[pi]=se=>{$||($=!0,se?k(I,[w]):k(A,[w]),C.delayedLeave&&C.delayedLeave(),w[pi]=void 0)};const F=w[pi].bind(null,!1);M?O(M,[w,F]):F()},leave(w,M){const A=String(e.key);if(w[pi]&&w[pi](!0),s.isUnmounting)return M();k(p,[w]);let I=!1;w[Cs]=F=>{I||(I=!0,M(),F?k(v,[w]):k(m,[w]),w[Cs]=void 0,T[A]===e&&delete T[A])};const $=w[Cs].bind(null,!1);T[A]=e,f?O(f,[w,$]):$()},clone(w){const M=Wa(w,t,s,n,a);return a&&a(M),M}};return C}function Ko(e){if(il(e))return e=nn(e),e.children=null,e}function gd(e){if(!il(e))return Qp(e.type)&&e.children?ef(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Fe(s.default))return s.default()}}function En(e,t){e.shapeFlag&6&&e.component?(e.transition=t,En(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function To(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const o=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Dt?(l.patchFlag&128&&a++,n=n.concat(To(l.children,t,o))):(t||l.type!==kt)&&n.push(o!=null?nn(l,{key:o}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function al(e,t){return Fe(e)?Ge({name:e.name},t,{setup:e}):e}function Ig(){const e=os();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function pc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function Og(e){const t=os(),s=lc(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function bd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const zl=new WeakMap;function za(e,t,s,n,a=!1){if(Ce(e)){e.forEach((v,E)=>za(v,t&&(Ce(t)?t[E]:t),s,n,a));return}if(wn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&za(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ll(n.component):n.el,l=a?null:i,{i:o,r}=e,c=t&&t.r,d=o.refs===Ke?o.refs={}:o.refs,u=o.setupState,p=Ye(u),f=u===Ke?Ma:v=>bd(d,v)?!1:tt(p,v),m=(v,E)=>!(E&&bd(d,E));if(c!=null&&c!==r){if(yd(t),He(c))d[c]=null,f(c)&&(u[c]=null);else if(At(c)){const v=t;m(c,v.k)&&(c.value=null),v.k&&(d[v.k]=null)}}if(Fe(r))li(r,o,12,[l,d]);else{const v=He(r),E=At(r);if(v||E){const N=()=>{if(e.f){const _=v?f(r)?u[r]:d[r]:m()||!e.k?r.value:d[e.k];if(a)Ce(_)&&Xr(_,i);else if(Ce(_))_.includes(i)||_.push(i);else if(v)d[r]=[i],f(r)&&(u[r]=d[r]);else{const g=[i];m(r,e.k)&&(r.value=g),e.k&&(d[e.k]=g)}}else v?(d[r]=l,f(r)&&(u[r]=l)):E&&(m(r,e.k)&&(r.value=l),e.k&&(d[e.k]=l))};if(l){const _=()=>{N(),zl.delete(e)};_.id=-1,zl.set(e,_),Tt(_,s)}else yd(e),N()}}}function yd(e){const t=zl.get(e);t&&(t.flags|=8,zl.delete(e))}let xd=!1;const Ca=()=>{xd||(console.error("Hydration completed but contains mismatches."),xd=!0)},Lg=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Ng=e=>e.namespaceURI.includes("MathML"),gl=e=>{if(e.nodeType===1){if(Lg(e))return"svg";if(Ng(e))return"mathml"}},Da=e=>e.nodeType===8;function Pg(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:o,insert:r,createComment:c}}=e,d=(g,y)=>{if(!y.hasChildNodes()){s(null,g,y),Hl(),y._vnode=g;return}u(y.firstChild,g,null,null,null),Hl(),y._vnode=g},u=(g,y,T,k,O,C=!1)=>{C=C||!!y.dynamicChildren;const w=Da(g)&&g.data==="[",M=()=>v(g,y,T,k,O,w),{type:A,ref:I,shapeFlag:$,patchFlag:F}=y;let se=g.nodeType;y.el=g,F===-2&&(C=!1,y.dynamicChildren=null);let B=null;switch(A){case zn:se!==3?y.children===""?(r(y.el=a(""),l(g),g),B=g):B=M():(g.data!==y.children&&(Ca(),g.data=y.children),B=i(g));break;case kt:_(g)?(B=i(g),N(y.el=g.content.firstChild,g,T)):se!==8||w?B=M():B=i(g);break;case ca:if(w&&(g=i(g),se=g.nodeType),se===1||se===3){B=g;const S=!y.children.length;for(let R=0;R<y.staticCount;R++)S&&(y.children+=B.nodeType===1?B.outerHTML:B.data),R===y.staticCount-1&&(y.anchor=B),B=i(B);return w?i(B):B}else M();break;case Dt:w?B=m(g,y,T,k,O,C):B=M();break;default:if($&1)(se!==1||y.type.toLowerCase()!==g.tagName.toLowerCase())&&!_(g)?B=M():B=p(g,y,T,k,O,C);else if($&6){y.slotScopeIds=O;const S=l(g);if(w?B=E(g):Da(g)&&g.data==="teleport start"?B=E(g,g.data,"teleport end"):B=i(g),t(y,S,null,T,k,gl(S),C),wn(y)&&!y.type.__asyncResolved){let R;w?(R=ht(Dt),R.anchor=B?B.previousSibling:S.lastChild):R=g.nodeType===3?wc(""):ht("div"),R.el=g,y.component.subTree=R}}else $&64?se!==8?B=M():B=y.type.hydrate(g,y,T,k,O,C,e,f):$&128&&(B=y.type.hydrate(g,y,T,k,gl(l(g)),O,C,e,u))}return I!=null&&za(I,null,k,y),B},p=(g,y,T,k,O,C)=>{C=C||!!y.dynamicChildren;const{type:w,props:M,patchFlag:A,shapeFlag:I,dirs:$,transition:F}=y,se=w==="input"||w==="option";if(se||A!==-1){$&&Xs(y,null,T,"created");let B=!1;if(_(g)){B=Af(null,F)&&T&&T.vnode.props&&T.vnode.props.appear;const R=g.content.firstChild;if(B){const W=R.getAttribute("class");W&&(R.$cls=W),F.beforeEnter(R)}N(R,g,T),y.el=g=R}if(I&16&&!(M&&(M.innerHTML||M.textContent))){let R=f(g.firstChild,y,g,T,k,O,C);for(R&&!bl(g,1)&&Ca();R;){const W=R;R=R.nextSibling,o(W)}}else if(I&8){let R=y.children;R[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(R=R.slice(1));const{textContent:W}=g;W!==R&&W!==R.replace(/\r\n|\r/g,`
`)&&(bl(g,0)||Ca(),g.textContent=y.children)}if(M){if(se||!C||A&48){const R=g.tagName.includes("-");for(const W in M)(se&&(W.endsWith("value")||W==="indeterminate")||va(W)&&!xn(W)||W[0]==="."||R&&!xn(W))&&n(g,W,null,M[W],void 0,T)}else if(M.onClick)n(g,"onClick",null,M.onClick,void 0,T);else if(A&4&&_n(M.style))for(const R in M.style)M.style[R]}let S;(S=M&&M.onVnodeBeforeMount)&&ds(S,T,y),$&&Xs(y,null,T,"beforeMount"),((S=M&&M.onVnodeMounted)||$||B)&&Lf(()=>{S&&ds(S,T,y),B&&F.enter(g),$&&Xs(y,null,T,"mounted")},k)}return g.nextSibling},f=(g,y,T,k,O,C,w)=>{w=w||!!y.dynamicChildren;const M=y.children,A=M.length;let I=!1;for(let $=0;$<A;$++){const F=w?M[$]:M[$]=ps(M[$]),se=F.type===zn;g?(se&&!w&&$+1<A&&ps(M[$+1]).type===zn&&(r(a(g.data.slice(F.children.length)),T,i(g)),g.data=F.children),g=u(g,F,k,O,C,w)):se&&!F.children?r(F.el=a(""),T):(I||(I=!0,bl(T,1)||Ca()),s(null,F,T,null,k,O,gl(T),C))}return g},m=(g,y,T,k,O,C)=>{const{slotScopeIds:w}=y;w&&(O=O?O.concat(w):w);const M=l(g),A=f(i(g),y,M,T,k,O,C);return A&&Da(A)&&A.data==="]"?i(y.anchor=A):(Ca(),r(y.anchor=c("]"),M,A),A)},v=(g,y,T,k,O,C)=>{if(bl(g.parentElement,1)||Ca(),y.el=null,C){const A=E(g);for(;;){const I=i(g);if(I&&I!==A)o(I);else break}}const w=i(g),M=l(g);return o(g),s(null,y,M,w,T,k,gl(M),O),T&&(T.vnode.el=y.el,Io(T,y.el)),w},E=(g,y="[",T="]")=>{let k=0;for(;g;)if(g=i(g),g&&Da(g)&&(g.data===y&&k++,g.data===T)){if(k===0)return i(g);k--}return g},N=(g,y,T)=>{const k=y.parentNode;k&&k.replaceChild(g,y);let O=T;for(;O;)O.vnode.el===y&&(O.vnode.el=O.subTree.el=g),O=O.parent},_=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const _d="data-allow-mismatch",Mg={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function bl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(_d);)e=e.parentElement;const s=e&&e.getAttribute(_d);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Mg[t])}}const Dg=bo().requestIdleCallback||(e=>setTimeout(e,1)),Fg=bo().cancelIdleCallback||(e=>clearTimeout(e)),$g=(e=1e4)=>t=>{const s=Dg(t,{timeout:e});return()=>Fg(s)};function Ug(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Bg=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Ug(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Hg=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},zg=(e=[])=>(t,s)=>{He(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const o of e)l.removeEventListener(o,a)})};return s(l=>{for(const o of e)l.addEventListener(o,a,{once:!0})}),i};function jg(e,t){if(Da(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Da(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const wn=e=>!!e.type.__asyncLoader;function Vg(e){Fe(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:o=!0,onError:r}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let m;return c||(m=c=t().catch(v=>{if(v=v instanceof Error?v:new Error(String(v)),r)return new Promise((E,N)=>{r(v,()=>E(p()),()=>N(v),u+1)});throw v}).then(v=>m!==c&&c?c:(v&&(v.__esModule||v[Symbol.toStringTag]==="Module")&&(v=v.default),d=v,v)))};return al({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(m,v,E){let N=!1;(v.bu||(v.bu=[])).push(()=>N=!0);const _=()=>{N||E()},g=i?()=>{const y=i(_,T=>jg(m,T));y&&(v.bum||(v.bum=[])).push(y)}:_;d?g():f().then(()=>!v.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const m=zt;if(pc(m),d)return()=>yl(d,m);const v=T=>{c=null,ya(T,m,13,!n)};if(o&&m.suspense||fa)return f().then(T=>()=>yl(T,m)).catch(T=>(v(T),()=>n?ht(n,{error:T}):null));const E=h(!1),N=h(),_=h(!!a);let g,y;return mt(()=>{g!=null&&clearTimeout(g),y!=null&&clearTimeout(y)}),a&&(y=setTimeout(()=>{m.isUnmounted||(_.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!m.isUnmounted&&!E.value&&!N.value){const T=new Error(`Async component timed out after ${l}ms.`);v(T),N.value=T}},l)),f().then(()=>{m.isUnmounted||(E.value=!0,m.parent&&il(m.parent.vnode)&&m.parent.update())}).catch(T=>{if(m.isUnmounted){c=null;return}v(T),N.value=T}),()=>{if(E.value&&d)return yl(d,m);if(N.value&&n)return ht(n,{error:N.value});if(s&&!_.value)return yl(s,m)}}})}function yl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ht(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const il=e=>e.type.__isKeepAlive,qg={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=os(),n=s.ctx;if(!n.renderer)return()=>{const _=t.default&&t.default();return _&&_.length===1?_[0]:_};const a=new Map,i=new Set;let l=null;const o=s.suspense,{renderer:{p:r,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(_,g,y,T,k)=>{const O=_.component;c(_,g,y,0,o),r(O.vnode,_,g,y,O,o,T,_.slotScopeIds,k),Tt(()=>{O.isDeactivated=!1,O.a&&Ba(O.a);const C=_.props&&_.props.onVnodeMounted;C&&ds(C,O.parent,_)},o)},n.deactivate=_=>{const g=_.component;Vl(g.m),Vl(g.a),c(_,p,null,1,o),Tt(()=>{g.da&&Ba(g.da);const y=_.props&&_.props.onVnodeUnmounted;y&&ds(y,g.parent,_),g.isDeactivated=!0},o)};function f(_){Wo(_),d(_,s,o,!0)}function m(_){a.forEach((g,y)=>{const T=Or(wn(g)?g.type.__asyncResolved||{}:g.type);T&&!_(T)&&v(y)})}function v(_){const g=a.get(_);g&&(!l||!Fs(g,l))?f(g):l&&Wo(l),a.delete(_),i.delete(_)}ls(()=>[e.include,e.exclude],([_,g])=>{_&&m(y=>_i(_,y)),g&&m(y=>!_i(g,y))},{flush:"post",deep:!0});let E=null;const N=()=>{E!=null&&(ql(s.subTree.type)?Tt(()=>{a.set(E,xl(s.subTree))},s.subTree.suspense):a.set(E,xl(s.subTree)))};return Ze(N),Eo(N),Ao(()=>{a.forEach(_=>{const{subTree:g,suspense:y}=s,T=xl(g);if(_.type===T.type&&_.key===T.key){Wo(T);const k=T.component.da;k&&Tt(k,y);return}f(_)})}),()=>{if(E=null,!t.default)return l=null;const _=t.default(),g=_[0];if(_.length>1)return l=null,_;if(!An(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let y=xl(g);if(y.type===kt)return l=null,y;const T=y.type,k=Or(wn(y)?y.type.__asyncResolved||{}:T),{include:O,exclude:C,max:w}=e;if(O&&(!k||!_i(O,k))||C&&k&&_i(C,k))return y.shapeFlag&=-257,l=y,g;const M=y.key==null?T:y.key,A=a.get(M);return y.el&&(y=nn(y),g.shapeFlag&128&&(g.ssContent=y)),E=M,A?(y.el=A.el,y.component=A.component,y.transition&&En(y,y.transition),y.shapeFlag|=512,i.delete(M),i.add(M)):(i.add(M),w&&i.size>parseInt(w,10)&&v(i.values().next().value)),y.shapeFlag|=256,l=y,ql(g.type)?g:y}}},Gg=qg;function _i(e,t){return Ce(e)?e.some(s=>_i(s,t)):He(e)?e.split(",").includes(t):sv(e)?(e.lastIndex=0,e.test(t)):!1}function ks(e,t){nf(e,"a",t)}function vs(e,t){nf(e,"da",t)}function nf(e,t,s=zt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(Co(t,n,s),s){let a=s.parent;for(;a&&a.parent;)il(a.parent.vnode)&&Kg(n,t,s,a),a=a.parent}}function Kg(e,t,s,n){const a=Co(t,e,n,!0);mt(()=>{Xr(n[t],a)},s)}function Wo(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function xl(e){return e.shapeFlag&128?e.ssContent:e}function Co(e,t,s=zt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{Tn();const o=oi(s),r=_s(t,s,e,l);return o(),Cn(),r});return n?a.unshift(i):a.push(i),i}}const Rn=e=>(t,s=zt)=>{(!fa||e==="sp")&&Co(e,(...n)=>t(...n),s)},af=Rn("bm"),Ze=Rn("m"),fc=Rn("bu"),Eo=Rn("u"),Ao=Rn("bum"),mt=Rn("um"),lf=Rn("sp"),of=Rn("rtg"),rf=Rn("rtc");function cf(e,t=zt){Co("ec",e,t)}const hc="components",Wg="directives";function Zg(e,t){return mc(hc,e,!0,t)||e}const df=Symbol.for("v-ndc");function Jg(e){return He(e)?mc(hc,e,!1)||e:e||df}function Yg(e){return mc(Wg,e)}function mc(e,t,s=!0,n=!1){const a=jt||zt;if(a){const i=a.type;if(e===hc){const o=Or(i,!1);if(o&&(o===t||o===lt(t)||o===ba(lt(t))))return i}const l=wd(a[e]||i[e],t)||wd(a.appContext[e],t);return!l&&n?i:l}}function wd(e,t){return e&&(e[t]||e[lt(t)]||e[ba(lt(t))])}function Qg(e,t,s,n){let a;const i=s&&s[n],l=Ce(e);if(l||He(e)){const o=l&&_n(e);let r=!1,c=!1;o&&(r=!ms(e),c=sn(e),e=_o(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(r?c?Ka(Bs(e[d])):Bs(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let o=0;o<e;o++)a[o]=t(o+1,o,void 0,i&&i[o])}else if(et(e))if(e[Symbol.iterator])a=Array.from(e,(o,r)=>t(o,r,void 0,i&&i[r]));else{const o=Object.keys(e);a=new Array(o.length);for(let r=0,c=o.length;r<c;r++){const d=o[r];a[r]=t(e[d],d,r,i&&i[r])}}else a=[];return s&&(s[n]=a),a}function Xg(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(Ce(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function eb(e,t,s={},n,a){if(jt.ce||jt.parent&&wn(jt.parent)&&jt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Vi(),Gl(Dt,null,[ht("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Vi();const l=i&&vc(i(s)),o=s.key||l&&l.key,r=Gl(Dt,{key:(o&&!Xt(o)?o:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&r.scopeId&&(r.slotScopeIds=[r.scopeId+"-s"]),i&&i._c&&(i._d=!0),r}function vc(e){return e.some(t=>An(t)?!(t.type===kt||t.type===Dt&&!vc(t.children)):!0)?e:null}function tb(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ua(n)]=e[n];return s}const kr=e=>e?Bf(e)?ll(e):kr(e.parent):null,Ai=Ge(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>kr(e.parent),$root:e=>kr(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>gc(e),$forceUpdate:e=>e.f||(e.f=()=>{rc(e.update)}),$nextTick:e=>e.n||(e.n=Ct.bind(e.proxy)),$watch:e=>Sg.bind(e)}),Zo=(e,t)=>e!==Ke&&!e.__isScriptSetup&&tt(e,t),Sr={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:o,appContext:r}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Zo(n,t))return l[t]=1,n[t];if(a!==Ke&&tt(a,t))return l[t]=2,a[t];if(tt(i,t))return l[t]=3,i[t];if(s!==Ke&&tt(s,t))return l[t]=4,s[t];Tr&&(l[t]=0)}}const c=Ai[t];let d,u;if(c)return t==="$attrs"&&Zt(e.attrs,"get",""),c(e);if((d=o.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&tt(s,t))return l[t]=4,s[t];if(u=r.config.globalProperties,tt(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Zo(a,t)?(a[t]=s,!0):n!==Ke&&tt(n,t)?(n[t]=s,!0):tt(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},o){let r;return!!(s[o]||e!==Ke&&o[0]!=="$"&&tt(e,o)||Zo(t,o)||tt(i,o)||tt(n,o)||tt(Ai,o)||tt(a.config.globalProperties,o)||(r=l.__cssModules)&&r[o])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:tt(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},sb=Ge({},Sr,{get(e,t){if(t!==Symbol.unscopables)return Sr.get(e,t,e)},has(e,t){return t[0]!=="_"&&!cv(t)}});function nb(){return null}function ab(){return null}function ib(e){}function lb(e){}function ob(){return null}function rb(){}function cb(e,t){return null}function db(){return uf().slots}function ub(){return uf().attrs}function uf(e){const t=os();return t.setupContext||(t.setupContext=Vf(t))}function zi(e){return Ce(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function pb(e,t){const s=zi(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?Ce(a)||Fe(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function fb(e,t){return!e||!t?e||t:Ce(e)&&Ce(t)?e.concat(t):Ge({},zi(e),zi(t))}function hb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function mb(e){const t=os(),s=fa;let n=e();Gi(),s&&Va(!1);const a=()=>{oi(t),s&&Va(!0)},i=()=>{os()!==t&&t.scope.off(),Gi(),s&&Va(!1)};return ec(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let Tr=!0;function vb(e){const t=gc(e),s=e.proxy,n=e.ctx;Tr=!1,t.beforeCreate&&kd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:o,provide:r,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:m,activated:v,deactivated:E,beforeDestroy:N,beforeUnmount:_,destroyed:g,unmounted:y,render:T,renderTracked:k,renderTriggered:O,errorCaptured:C,serverPrefetch:w,expose:M,inheritAttrs:A,components:I,directives:$,filters:F}=t;if(c&&gb(c,n,null),l)for(const S in l){const R=l[S];Fe(R)&&(n[S]=R.bind(s))}if(a){const S=a.call(s,s);et(S)&&(e.data=qn(S))}if(Tr=!0,i)for(const S in i){const R=i[S],W=Fe(R)?R.bind(s,s):Fe(R.get)?R.get.bind(s,s):Vt,ee=!Fe(R)&&Fe(R.set)?R.set.bind(s):Vt,he=Z({get:W,set:ee});Object.defineProperty(n,S,{enumerable:!0,configurable:!0,get:()=>he.value,set:le=>he.value=le})}if(o)for(const S in o)pf(o[S],n,s,S);if(r){const S=Fe(r)?r.call(s):r;Reflect.ownKeys(S).forEach(R=>{Ei(R,S[R])})}d&&kd(d,e,"c");function B(S,R){Ce(R)?R.forEach(W=>S(W.bind(s))):R&&S(R.bind(s))}if(B(af,u),B(Ze,p),B(fc,f),B(Eo,m),B(ks,v),B(vs,E),B(cf,C),B(rf,k),B(of,O),B(Ao,_),B(mt,y),B(lf,w),Ce(M))if(M.length){const S=e.exposed||(e.exposed={});M.forEach(R=>{Object.defineProperty(S,R,{get:()=>s[R],set:W=>s[R]=W,enumerable:!0})})}else e.exposed||(e.exposed={});T&&e.render===Vt&&(e.render=T),A!=null&&(e.inheritAttrs=A),I&&(e.components=I),$&&(e.directives=$),w&&pc(e)}function gb(e,t,s=Vt){Ce(e)&&(e=Cr(e));for(const n in e){const a=e[n];let i;et(a)?"default"in a?i=Is(a.from||n,a.default,!0):i=Is(a.from||n):i=Is(a),At(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function kd(e,t,s){_s(Ce(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function pf(e,t,s,n){let a=n.includes(".")?Jp(s,n):()=>s[n];if(He(e)){const i=t[e];Fe(i)&&ls(a,i)}else if(Fe(e))ls(a,e.bind(s));else if(et(e))if(Ce(e))e.forEach(i=>pf(i,t,s,n));else{const i=Fe(e.handler)?e.handler.bind(s):t[e.handler];Fe(i)&&ls(a,i,e)}}function gc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,o=i.get(t);let r;return o?r=o:!a.length&&!s&&!n?r=t:(r={},a.length&&a.forEach(c=>jl(r,c,l,!0)),jl(r,t,l)),et(t)&&i.set(t,r),r}function jl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&jl(e,i,s,!0),a&&a.forEach(l=>jl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const o=bb[l]||s&&s[l];e[l]=o?o(e[l],t[l]):t[l]}return e}const bb={data:Sd,props:Td,emits:Td,methods:wi,computed:wi,beforeCreate:ts,created:ts,beforeMount:ts,mounted:ts,beforeUpdate:ts,updated:ts,beforeDestroy:ts,beforeUnmount:ts,destroyed:ts,unmounted:ts,activated:ts,deactivated:ts,errorCaptured:ts,serverPrefetch:ts,components:wi,directives:wi,watch:xb,provide:Sd,inject:yb};function Sd(e,t){return t?e?function(){return Ge(Fe(e)?e.call(this,this):e,Fe(t)?t.call(this,this):t)}:t:e}function yb(e,t){return wi(Cr(e),Cr(t))}function Cr(e){if(Ce(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function ts(e,t){return e?[...new Set([].concat(e,t))]:t}function wi(e,t){return e?Ge(Object.create(null),e,t):t}function Td(e,t){return e?Ce(e)&&Ce(t)?[...new Set([...e,...t])]:Ge(Object.create(null),zi(e),zi(t??{})):t}function xb(e,t){if(!e)return t;if(!t)return e;const s=Ge(Object.create(null),e);for(const n in t)s[n]=ts(e[n],t[n]);return s}function ff(){return{app:null,config:{isNativeTag:Ma,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let _b=0;function wb(e,t){return function(n,a=null){Fe(n)||(n=Ge({},n)),a!=null&&!et(a)&&(a=null);const i=ff(),l=new WeakSet,o=[];let r=!1;const c=i.app={_uid:_b++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Gf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Fe(d.install)?(l.add(d),d.install(c,...u)):Fe(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!r){const f=c._ceVNode||ht(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),r=!0,c._container=d,d.__vue_app__=c,ll(f.component)}},onUnmount(d){o.push(d)},unmount(){r&&(_s(o,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=ra;ra=c;try{return d()}finally{ra=u}}};return c}}let ra=null;function kb(e,t,s=Ke){const n=os(),a=lt(t),i=fs(t),l=hf(e,a),o=Up((r,c)=>{let d,u=Ke,p;return Zp(()=>{const f=e[a];Mt(d,f)&&(d=f,c())}),{get(){return r(),s.get?s.get(d):d},set(f){const m=s.set?s.set(f):f;if(!Mt(m,d)&&!(u!==Ke&&Mt(f,u)))return;const v=n.vnode.props,E=!!(v&&(t in v||a in v||i in v)&&(`onUpdate:${t}`in v||`onUpdate:${a}`in v||`onUpdate:${i}`in v));E||(d=f,c()),n.emit(`update:${t}`,m),Mt(f,u)&&(Mt(f,m)&&!Mt(m,p)||E&&u!==Ke&&!Mt(m,d))&&c(),u=f,p=m}}});return o[Symbol.iterator]=()=>{let r=0;return{next(){return r<2?{value:r++?l||Ke:o,done:!1}:{done:!0}}}},o}const hf=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${lt(t)}Modifiers`]||e[`${fs(t)}Modifiers`];function Sb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&hf(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>He(d)?d.trim():d)),l.number&&(a=s.map(go)));let o,r=n[o=Ua(t)]||n[o=Ua(lt(t))];!r&&i&&(r=n[o=Ua(fs(t))]),r&&_s(r,e,6,a);const c=n[o+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[o])return;e.emitted[o]=!0,_s(c,e,6,a)}}const Tb=new WeakMap;function mf(e,t,s=!1){const n=s?Tb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},o=!1;if(!Fe(e)){const r=c=>{const d=mf(c,t,!0);d&&(o=!0,Ge(l,d))};!s&&t.mixins.length&&t.mixins.forEach(r),e.extends&&r(e.extends),e.mixins&&e.mixins.forEach(r)}return!i&&!o?(et(e)&&n.set(e,null),null):(Ce(i)?i.forEach(r=>l[r]=null):Ge(l,i),et(e)&&n.set(e,l),l)}function Ro(e,t){return!e||!va(t)?!1:(t=t.slice(2).replace(/Once$/,""),tt(e,t[0].toLowerCase()+t.slice(1))||tt(e,fs(t))||tt(e,t))}function Rl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:o,emit:r,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:m,inheritAttrs:v}=e,E=Hi(e);let N,_;try{if(s.shapeFlag&4){const y=a||n,T=y;N=ps(c.call(T,y,d,u,f,p,m)),_=o}else{const y=t;N=ps(y.length>1?y(u,{attrs:o,slots:l,emit:r}):y(u,null)),_=t.props?o:Eb(o)}}catch(y){Ri.length=0,ya(y,e,1),N=ht(kt)}let g=N;if(_&&v!==!1){const y=Object.keys(_),{shapeFlag:T}=g;y.length&&T&7&&(i&&y.some(fo)&&(_=Ab(_,i)),g=nn(g,_,!1,!0))}return s.dirs&&(g=nn(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&En(g,s.transition),N=g,Hi(E),N}function Cb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(An(a)){if(a.type!==kt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const Eb=e=>{let t;for(const s in e)(s==="class"||s==="style"||va(s))&&((t||(t={}))[s]=e[s]);return t},Ab=(e,t)=>{const s={};for(const n in e)(!fo(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function Rb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:o,patchFlag:r}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&r>=0){if(r&1024)return!0;if(r&16)return n?Cd(n,l,c):!!l;if(r&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(vf(l,n,p)&&!Ro(c,p))return!0}}}else return(a||o)&&(!o||!o.$stable)?!0:n===l?!1:n?l?Cd(n,l,c):!0:!!l;return!1}function Cd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(vf(t,e,i)&&!Ro(s,i))return!0}return!1}function vf(e,t,s){const n=e[s],a=t[s];return s==="style"&&et(n)&&et(a)?!Sn(n,a):n!==a}function Io({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const gf={},bf=()=>Object.create(gf),yf=e=>Object.getPrototypeOf(e)===gf;function Ib(e,t,s,n=!1){const a={},i=bf();e.propsDefaults=Object.create(null),xf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ic(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function Ob(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,o=Ye(a),[r]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(Ro(e.emitsOptions,p))continue;const f=t[p];if(r)if(tt(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const m=lt(p);a[m]=Er(r,o,m,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{xf(e,t,a,i)&&(c=!0);let d;for(const u in o)(!t||!tt(t,u)&&((d=fs(u))===u||!tt(t,d)))&&(r?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=Er(r,o,u,void 0,e,!0)):delete a[u]);if(i!==o)for(const u in i)(!t||!tt(t,u))&&(delete i[u],c=!0)}c&&mn(e.attrs,"set","")}function xf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,o;if(t)for(let r in t){if(xn(r))continue;const c=t[r];let d;a&&tt(a,d=lt(r))?!i||!i.includes(d)?s[d]=c:(o||(o={}))[d]=c:Ro(e.emitsOptions,r)||(!(r in n)||c!==n[r])&&(n[r]=c,l=!0)}if(i){const r=Ye(s),c=o||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=Er(a,r,u,c[u],e,!tt(c,u))}}return l}function Er(e,t,s,n,a,i){const l=e[s];if(l!=null){const o=tt(l,"default");if(o&&n===void 0){const r=l.default;if(l.type!==Function&&!l.skipFactory&&Fe(r)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=oi(a);n=c[s]=r.call(null,t),d()}}else n=r;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!o?n=!1:l[1]&&(n===""||n===fs(s))&&(n=!0))}return n}const Lb=new WeakMap;function _f(e,t,s=!1){const n=s?Lb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},o=[];let r=!1;if(!Fe(e)){const d=u=>{r=!0;const[p,f]=_f(u,t,!0);Ge(l,p),f&&o.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!r)return et(e)&&n.set(e,Fa),Fa;if(Ce(i))for(let d=0;d<i.length;d++){const u=lt(i[d]);Ed(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=lt(d);if(Ed(u)){const p=i[d],f=l[u]=Ce(p)||Fe(p)?{type:p}:Ge({},p),m=f.type;let v=!1,E=!0;if(Ce(m))for(let N=0;N<m.length;++N){const _=m[N],g=Fe(_)&&_.name;if(g==="Boolean"){v=!0;break}else g==="String"&&(E=!1)}else v=Fe(m)&&m.name==="Boolean";f[0]=v,f[1]=E,(v||tt(f,"default"))&&o.push(u)}}const c=[l,o];return et(e)&&n.set(e,c),c}function Ed(e){return e[0]!=="$"&&!xn(e)}const bc=e=>e==="_"||e==="_ctx"||e==="$stable",yc=e=>Ce(e)?e.map(ps):[ps(e)],Nb=(e,t,s)=>{if(t._n)return t;const n=cc((...a)=>yc(t(...a)),s);return n._c=!1,n},wf=(e,t,s)=>{const n=e._ctx;for(const a in e){if(bc(a))continue;const i=e[a];if(Fe(i))t[a]=Nb(a,i,n);else if(i!=null){const l=yc(i);t[a]=()=>l}}},kf=(e,t)=>{const s=yc(t);e.slots.default=()=>s},Sf=(e,t,s)=>{for(const n in t)(s||!bc(n))&&(e[n]=t[n])},Pb=(e,t,s)=>{const n=e.slots=bf();if(e.vnode.shapeFlag&32){const a=t._;a?(Sf(n,t,s),s&&mp(n,"_",a,!0)):wf(t,n)}else t&&kf(e,t)},Mb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const o=t._;o?s&&o===1?i=!1:Sf(a,t,s):(i=!t.$stable,wf(t,a)),l=t}else t&&(kf(e,t),l={default:1});if(i)for(const o in a)!bc(o)&&l[o]==null&&delete a[o]},Tt=Lf;function Tf(e){return Ef(e)}function Cf(e){return Ef(e,Pg)}function Ef(e,t){const s=bo();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:o,createComment:r,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Vt,insertStaticContent:m}=e,v=(x,P,U,ne=null,Q=null,te=null,be=void 0,re=null,ue=!!P.dynamicChildren)=>{if(x===P)return;x&&!Fs(x,P)&&(ne=K(x),le(x,Q,te,!0),x=null),P.patchFlag===-2&&(ue=!1,P.dynamicChildren=null);const{type:ae,ref:we,shapeFlag:ye}=P;switch(ae){case zn:E(x,P,U,ne);break;case kt:N(x,P,U,ne);break;case ca:x==null&&_(P,U,ne,be);break;case Dt:I(x,P,U,ne,Q,te,be,re,ue);break;default:ye&1?T(x,P,U,ne,Q,te,be,re,ue):ye&6?$(x,P,U,ne,Q,te,be,re,ue):(ye&64||ye&128)&&ae.process(x,P,U,ne,Q,te,be,re,ue,ie)}we!=null&&Q?za(we,x&&x.ref,te,P||x,!P):we==null&&x&&x.ref!=null&&za(x.ref,null,te,x,!0)},E=(x,P,U,ne)=>{if(x==null)n(P.el=o(P.children),U,ne);else{const Q=P.el=x.el;P.children!==x.children&&c(Q,P.children)}},N=(x,P,U,ne)=>{x==null?n(P.el=r(P.children||""),U,ne):P.el=x.el},_=(x,P,U,ne)=>{[x.el,x.anchor]=m(x.children,P,U,ne,x.el,x.anchor)},g=({el:x,anchor:P},U,ne)=>{let Q;for(;x&&x!==P;)Q=p(x),n(x,U,ne),x=Q;n(P,U,ne)},y=({el:x,anchor:P})=>{let U;for(;x&&x!==P;)U=p(x),a(x),x=U;a(P)},T=(x,P,U,ne,Q,te,be,re,ue)=>{if(P.type==="svg"?be="svg":P.type==="math"&&(be="mathml"),x==null)k(P,U,ne,Q,te,be,re,ue);else{const ae=x.el&&x.el._isVueCE?x.el:null;try{ae&&ae._beginPatch(),w(x,P,Q,te,be,re,ue)}finally{ae&&ae._endPatch()}}},k=(x,P,U,ne,Q,te,be,re)=>{let ue,ae;const{props:we,shapeFlag:ye,transition:_e,dirs:oe}=x;if(ue=x.el=l(x.type,te,we&&we.is,we),ye&8?d(ue,x.children):ye&16&&C(x.children,ue,null,ne,Q,Jo(x,te),be,re),oe&&Xs(x,null,ne,"created"),O(ue,x,x.scopeId,be,ne),we){for(const pe in we)pe!=="value"&&!xn(pe)&&i(ue,pe,null,we[pe],te,ne);"value"in we&&i(ue,"value",null,we.value,te),(ae=we.onVnodeBeforeMount)&&ds(ae,ne,x)}oe&&Xs(x,null,ne,"beforeMount");const z=Af(Q,_e);z&&_e.beforeEnter(ue),n(ue,P,U),((ae=we&&we.onVnodeMounted)||z||oe)&&Tt(()=>{try{ae&&ds(ae,ne,x),z&&_e.enter(ue),oe&&Xs(x,null,ne,"mounted")}finally{}},Q)},O=(x,P,U,ne,Q)=>{if(U&&f(x,U),ne)for(let te=0;te<ne.length;te++)f(x,ne[te]);if(Q){let te=Q.subTree;if(P===te||ql(te.type)&&(te.ssContent===P||te.ssFallback===P)){const be=Q.vnode;O(x,be,be.scopeId,be.slotScopeIds,Q.parent)}}},C=(x,P,U,ne,Q,te,be,re,ue=0)=>{for(let ae=ue;ae<x.length;ae++){const we=x[ae]=re?fn(x[ae]):ps(x[ae]);v(null,we,P,U,ne,Q,te,be,re)}},w=(x,P,U,ne,Q,te,be)=>{const re=P.el=x.el;let{patchFlag:ue,dynamicChildren:ae,dirs:we}=P;ue|=x.patchFlag&16;const ye=x.props||Ke,_e=P.props||Ke;let oe;if(U&&Qn(U,!1),(oe=_e.onVnodeBeforeUpdate)&&ds(oe,U,P,x),we&&Xs(P,x,U,"beforeUpdate"),U&&Qn(U,!0),(ye.innerHTML&&_e.innerHTML==null||ye.textContent&&_e.textContent==null)&&d(re,""),ae?M(x.dynamicChildren,ae,re,U,ne,Jo(P,Q),te):be||R(x,P,re,null,U,ne,Jo(P,Q),te,!1),ue>0){if(ue&16)A(re,ye,_e,U,Q);else if(ue&2&&ye.class!==_e.class&&i(re,"class",null,_e.class,Q),ue&4&&i(re,"style",ye.style,_e.style,Q),ue&8){const z=P.dynamicProps;for(let pe=0;pe<z.length;pe++){const Se=z[pe],Ee=ye[Se],Ne=_e[Se];(Ne!==Ee||Se==="value")&&i(re,Se,Ee,Ne,Q,U)}}ue&1&&x.children!==P.children&&d(re,P.children)}else!be&&ae==null&&A(re,ye,_e,U,Q);((oe=_e.onVnodeUpdated)||we)&&Tt(()=>{oe&&ds(oe,U,P,x),we&&Xs(P,x,U,"updated")},ne)},M=(x,P,U,ne,Q,te,be)=>{for(let re=0;re<P.length;re++){const ue=x[re],ae=P[re],we=ue.el&&(ue.type===Dt||!Fs(ue,ae)||ue.shapeFlag&198)?u(ue.el):U;v(ue,ae,we,null,ne,Q,te,be,!0)}},A=(x,P,U,ne,Q)=>{if(P!==U){if(P!==Ke)for(const te in P)!xn(te)&&!(te in U)&&i(x,te,P[te],null,Q,ne);for(const te in U){if(xn(te))continue;const be=U[te],re=P[te];be!==re&&te!=="value"&&i(x,te,re,be,Q,ne)}"value"in U&&i(x,"value",P.value,U.value,Q)}},I=(x,P,U,ne,Q,te,be,re,ue)=>{const ae=P.el=x?x.el:o(""),we=P.anchor=x?x.anchor:o("");let{patchFlag:ye,dynamicChildren:_e,slotScopeIds:oe}=P;oe&&(re=re?re.concat(oe):oe),x==null?(n(ae,U,ne),n(we,U,ne),C(P.children||[],U,we,Q,te,be,re,ue)):ye>0&&ye&64&&_e&&x.dynamicChildren&&x.dynamicChildren.length===_e.length?(M(x.dynamicChildren,_e,U,Q,te,be,re),(P.key!=null||Q&&P===Q.subTree)&&xc(x,P,!0)):R(x,P,U,we,Q,te,be,re,ue)},$=(x,P,U,ne,Q,te,be,re,ue)=>{P.slotScopeIds=re,x==null?P.shapeFlag&512?Q.ctx.activate(P,U,ne,be,ue):F(P,U,ne,Q,te,be,ue):se(x,P,ue)},F=(x,P,U,ne,Q,te,be)=>{const re=x.component=Uf(x,ne,Q);if(il(x)&&(re.ctx.renderer=ie),Hf(re,!1,be),re.asyncDep){if(Q&&Q.registerDep(re,B,be),!x.el){const ue=re.subTree=ht(kt);N(null,ue,P,U),x.placeholder=ue.el}}else B(re,x,P,U,Q,te,be)},se=(x,P,U)=>{const ne=P.component=x.component;if(Rb(x,P,U))if(ne.asyncDep&&!ne.asyncResolved){S(ne,P,U);return}else ne.next=P,ne.update();else P.el=x.el,ne.vnode=P},B=(x,P,U,ne,Q,te,be)=>{const re=()=>{if(x.isMounted){let{next:ye,bu:_e,u:oe,parent:z,vnode:pe}=x;{const J=Rf(x);if(J){ye&&(ye.el=pe.el,S(x,ye,be)),J.asyncDep.then(()=>{Tt(()=>{x.isUnmounted||ae()},Q)});return}}let Se=ye,Ee;Qn(x,!1),ye?(ye.el=pe.el,S(x,ye,be)):ye=pe,_e&&Ba(_e),(Ee=ye.props&&ye.props.onVnodeBeforeUpdate)&&ds(Ee,z,ye,pe),Qn(x,!0);const Ne=Rl(x),ut=x.subTree;x.subTree=Ne,v(ut,Ne,u(ut.el),K(ut),x,Q,te),ye.el=Ne.el,Se===null&&Io(x,Ne.el),oe&&Tt(oe,Q),(Ee=ye.props&&ye.props.onVnodeUpdated)&&Tt(()=>ds(Ee,z,ye,pe),Q)}else{let ye;const{el:_e,props:oe}=P,{bm:z,m:pe,parent:Se,root:Ee,type:Ne}=x,ut=wn(P);if(Qn(x,!1),z&&Ba(z),!ut&&(ye=oe&&oe.onVnodeBeforeMount)&&ds(ye,Se,P),Qn(x,!0),_e&&Oe){const J=()=>{x.subTree=Rl(x),Oe(_e,x.subTree,x,Q,null)};ut&&Ne.__asyncHydrate?Ne.__asyncHydrate(_e,x,J):J()}else{Ee.ce&&Ee.ce._hasShadowRoot()&&Ee.ce._injectChildStyle(Ne,x.parent?x.parent.type:void 0);const J=x.subTree=Rl(x);v(null,J,U,ne,x,Q,te),P.el=J.el}if(pe&&Tt(pe,Q),!ut&&(ye=oe&&oe.onVnodeMounted)){const J=P;Tt(()=>ds(ye,Se,J),Q)}(P.shapeFlag&256||Se&&wn(Se.vnode)&&Se.vnode.shapeFlag&256)&&x.a&&Tt(x.a,Q),x.isMounted=!0,P=U=ne=null}};x.scope.on();const ue=x.effect=new Di(re);x.scope.off();const ae=x.update=ue.run.bind(ue),we=x.job=ue.runIfDirty.bind(ue);we.i=x,we.id=x.uid,ue.scheduler=()=>rc(we),Qn(x,!0),ae()},S=(x,P,U)=>{P.component=x;const ne=x.vnode.props;x.vnode=P,x.next=null,Ob(x,P.props,ne,U),Mb(x,P.children,U),Tn(),hd(x),Cn()},R=(x,P,U,ne,Q,te,be,re,ue=!1)=>{const ae=x&&x.children,we=x?x.shapeFlag:0,ye=P.children,{patchFlag:_e,shapeFlag:oe}=P;if(_e>0){if(_e&128){ee(ae,ye,U,ne,Q,te,be,re,ue);return}else if(_e&256){W(ae,ye,U,ne,Q,te,be,re,ue);return}}oe&8?(we&16&&Me(ae,Q,te),ye!==ae&&d(U,ye)):we&16?oe&16?ee(ae,ye,U,ne,Q,te,be,re,ue):Me(ae,Q,te,!0):(we&8&&d(U,""),oe&16&&C(ye,U,ne,Q,te,be,re,ue))},W=(x,P,U,ne,Q,te,be,re,ue)=>{x=x||Fa,P=P||Fa;const ae=x.length,we=P.length,ye=Math.min(ae,we);let _e;for(_e=0;_e<ye;_e++){const oe=P[_e]=ue?fn(P[_e]):ps(P[_e]);v(x[_e],oe,U,null,Q,te,be,re,ue)}ae>we?Me(x,Q,te,!0,!1,ye):C(P,U,ne,Q,te,be,re,ue,ye)},ee=(x,P,U,ne,Q,te,be,re,ue)=>{let ae=0;const we=P.length;let ye=x.length-1,_e=we-1;for(;ae<=ye&&ae<=_e;){const oe=x[ae],z=P[ae]=ue?fn(P[ae]):ps(P[ae]);if(Fs(oe,z))v(oe,z,U,null,Q,te,be,re,ue);else break;ae++}for(;ae<=ye&&ae<=_e;){const oe=x[ye],z=P[_e]=ue?fn(P[_e]):ps(P[_e]);if(Fs(oe,z))v(oe,z,U,null,Q,te,be,re,ue);else break;ye--,_e--}if(ae>ye){if(ae<=_e){const oe=_e+1,z=oe<we?P[oe].el:ne;for(;ae<=_e;)v(null,P[ae]=ue?fn(P[ae]):ps(P[ae]),U,z,Q,te,be,re,ue),ae++}}else if(ae>_e)for(;ae<=ye;)le(x[ae],Q,te,!0),ae++;else{const oe=ae,z=ae,pe=new Map;for(ae=z;ae<=_e;ae++){const Be=P[ae]=ue?fn(P[ae]):ps(P[ae]);Be.key!=null&&pe.set(Be.key,ae)}let Se,Ee=0;const Ne=_e-z+1;let ut=!1,J=0;const Ie=new Array(Ne);for(ae=0;ae<Ne;ae++)Ie[ae]=0;for(ae=oe;ae<=ye;ae++){const Be=x[ae];if(Ee>=Ne){le(Be,Q,te,!0);continue}let ze;if(Be.key!=null)ze=pe.get(Be.key);else for(Se=z;Se<=_e;Se++)if(Ie[Se-z]===0&&Fs(Be,P[Se])){ze=Se;break}ze===void 0?le(Be,Q,te,!0):(Ie[ze-z]=ae+1,ze>=J?J=ze:ut=!0,v(Be,P[ze],U,null,Q,te,be,re,ue),Ee++)}const $e=ut?Db(Ie):Fa;for(Se=$e.length-1,ae=Ne-1;ae>=0;ae--){const Be=z+ae,ze=P[Be],Ue=P[Be+1],ot=Be+1<we?Ue.el||If(Ue):ne;Ie[ae]===0?v(null,ze,U,ot,Q,te,be,re,ue):ut&&(Se<0||ae!==$e[Se]?he(ze,U,ot,2):Se--)}}},he=(x,P,U,ne,Q=null)=>{const{el:te,type:be,transition:re,children:ue,shapeFlag:ae}=x;if(ae&6){he(x.component.subTree,P,U,ne);return}if(ae&128){x.suspense.move(P,U,ne);return}if(ae&64){be.move(x,P,U,ie);return}if(be===Dt){n(te,P,U);for(let ye=0;ye<ue.length;ye++)he(ue[ye],P,U,ne);n(x.anchor,P,U);return}if(be===ca){g(x,P,U);return}if(ne!==2&&ae&1&&re)if(ne===0)re.persisted&&!te[Cs]?n(te,P,U):(re.beforeEnter(te),n(te,P,U),Tt(()=>re.enter(te),Q));else{const{leave:ye,delayLeave:_e,afterLeave:oe}=re,z=()=>{x.ctx.isUnmounted?a(te):n(te,P,U)},pe=()=>{const Se=te._isLeaving||!!te[Cs];te._isLeaving&&te[Cs](!0),re.persisted&&!Se?z():ye(te,()=>{z(),oe&&oe()})};_e?_e(te,z,pe):pe()}else n(te,P,U)},le=(x,P,U,ne=!1,Q=!1)=>{const{type:te,props:be,ref:re,children:ue,dynamicChildren:ae,shapeFlag:we,patchFlag:ye,dirs:_e,cacheIndex:oe,memo:z}=x;if(ye===-2&&(Q=!1),re!=null&&(Tn(),za(re,null,U,x,!0),Cn()),oe!=null&&(P.renderCache[oe]=void 0),we&256){P.ctx.deactivate(x);return}const pe=we&1&&_e,Se=!wn(x);let Ee;if(Se&&(Ee=be&&be.onVnodeBeforeUnmount)&&ds(Ee,P,x),we&6)xe(x.component,U,ne);else{if(we&128){x.suspense.unmount(U,ne);return}pe&&Xs(x,null,P,"beforeUnmount"),we&64?x.type.remove(x,P,U,ie,ne):ae&&!ae.hasOnce&&(te!==Dt||ye>0&&ye&64)?Me(ae,P,U,!1,!0):(te===Dt&&ye&384||!Q&&we&16)&&Me(ue,P,U),ne&&ve(x)}const Ne=z!=null&&oe==null;(Se&&(Ee=be&&be.onVnodeUnmounted)||pe||Ne)&&Tt(()=>{Ee&&ds(Ee,P,x),pe&&Xs(x,null,P,"unmounted"),Ne&&(x.el=null)},U)},ve=x=>{const{type:P,el:U,anchor:ne,transition:Q}=x;if(P===Dt){X(U,ne);return}if(P===ca){y(x);return}const te=()=>{a(U),Q&&!Q.persisted&&Q.afterLeave&&Q.afterLeave()};if(x.shapeFlag&1&&Q&&!Q.persisted){const{leave:be,delayLeave:re}=Q,ue=()=>be(U,te);re?re(x.el,te,ue):ue()}else te()},X=(x,P)=>{let U;for(;x!==P;)U=p(x),a(x),x=U;a(P)},xe=(x,P,U)=>{const{bum:ne,scope:Q,job:te,subTree:be,um:re,m:ue,a:ae}=x;Vl(ue),Vl(ae),ne&&Ba(ne),Q.stop(),te&&(te.flags|=8,le(be,x,P,U)),re&&Tt(re,P),Tt(()=>{x.isUnmounted=!0},P)},Me=(x,P,U,ne=!1,Q=!1,te=0)=>{for(let be=te;be<x.length;be++)le(x[be],P,U,ne,Q)},K=x=>{if(x.shapeFlag&6)return K(x.component.subTree);if(x.shapeFlag&128)return x.suspense.next();const P=p(x.anchor||x.el),U=P&&P[Yp];return U?p(U):P};let ge=!1;const H=(x,P,U)=>{let ne;x==null?P._vnode&&(le(P._vnode,null,null,!0),ne=P._vnode.component):v(P._vnode||null,x,P,null,null,null,U),P._vnode=x,ge||(ge=!0,hd(ne),Hl(),ge=!1)},ie={p:v,um:le,m:he,r:ve,mt:F,mc:C,pc:R,pbc:M,n:K,o:e};let de,Oe;return t&&([de,Oe]=t(ie)),{render:H,hydrate:de,createApp:wb(H,de)}}function Jo({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Qn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function Af(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function xc(e,t,s=!1){const n=e.children,a=t.children;if(Ce(n)&&Ce(a))for(let i=0;i<n.length;i++){const l=n[i];let o=a[i];o.shapeFlag&1&&!o.dynamicChildren&&((o.patchFlag<=0||o.patchFlag===32)&&(o=a[i]=fn(a[i]),o.el=l.el),!s&&o.patchFlag!==-2&&xc(l,o)),o.type===zn&&(o.patchFlag===-1&&(o=a[i]=fn(o)),o.el=l.el),o.type===kt&&!o.el&&(o.el=l.el)}}function Db(e){const t=e.slice(),s=[0];let n,a,i,l,o;const r=e.length;for(n=0;n<r;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)o=i+l>>1,e[s[o]]<c?i=o+1:l=o;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function Rf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:Rf(t)}function Vl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function If(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?If(t.subTree):null}const ql=e=>e.__isSuspense;let Ar=0;const Fb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,o,r,c){if(e==null)Ub(t,s,n,a,i,l,o,r,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Bb(e,t,s,n,a,l,o,r,c)}},hydrate:Hb,normalize:zb},$b=Fb;function ji(e,t){const s=e.props&&e.props[t];Fe(s)&&s()}function Ub(e,t,s,n,a,i,l,o,r){const{p:c,o:{createElement:d}}=r,u=d("div"),p=e.suspense=Of(e,a,n,t,u,s,i,l,o,r);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(ji(e,"onPending"),ji(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),ja(p,e.ssFallback)):p.resolve(!1,!0)}function Bb(e,t,s,n,a,i,l,o,{p:r,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:m,pendingBranch:v,isInFallback:E,isHydrating:N}=u;if(v)u.pendingBranch=p,Fs(v,p)?(r(v,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():E&&(N||(r(m,f,s,n,a,null,i,l,o),ja(u,f)))):(u.pendingId=Ar++,N?(u.isHydrating=!1,u.activeBranch=v):c(v,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),E?(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0?u.resolve():(r(m,f,s,n,a,null,i,l,o),ja(u,f))):m&&Fs(m,p)?(r(m,p,s,n,a,u,i,l,o),u.resolve(!0)):(r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0&&u.resolve()));else if(m&&Fs(m,p))r(m,p,s,n,a,u,i,l,o),ja(u,p);else if(ji(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=Ar++,r(null,p,u.hiddenContainer,null,a,u,i,l,o),u.deps<=0)u.resolve();else{const{timeout:_,pendingId:g}=u;_>0?setTimeout(()=>{u.pendingId===g&&u.fallback(f)},_):_===0&&u.fallback(f)}}function Of(e,t,s,n,a,i,l,o,r,c,d=!1){const{p:u,m:p,um:f,n:m,o:{parentNode:v,remove:E}}=c;let N;const _=jb(e);_&&t&&t.pendingBranch&&(N=t.pendingId,t.deps++);const g=e.props?Dl(e.props.timeout):void 0,y=i,T={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:Ar++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(k=!1,O=!1){const{vnode:C,activeBranch:w,pendingBranch:M,pendingId:A,effects:I,parentComponent:$,container:F,isInFallback:se}=T;let B=!1;if(T.isHydrating)T.isHydrating=!1;else if(!k){B=w&&M.transition&&M.transition.mode==="out-in";let W=!1;B&&(w.transition.afterLeave=()=>{A===T.pendingId&&(p(M,F,i===y&&!W?m(w):i,0),Ui(I),se&&C.ssFallback&&(C.ssFallback.el=null))}),w&&!T.isFallbackMountPending&&(v(w.el)===F&&(i=m(w),W=!0),f(w,$,T,!0),!B&&se&&C.ssFallback&&Tt(()=>C.ssFallback.el=null,T)),B||p(M,F,i,0)}T.isFallbackMountPending=!1,ja(T,M),T.pendingBranch=null,T.isInFallback=!1;let S=T.parent,R=!1;for(;S;){if(S.pendingBranch){S.effects.push(...I),R=!0;break}S=S.parent}!R&&!B&&Ui(I),T.effects=[],_&&t&&t.pendingBranch&&N===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),ji(C,"onResolve")},fallback(k){if(!T.pendingBranch)return;const{vnode:O,activeBranch:C,parentComponent:w,container:M,namespace:A}=T;ji(O,"onFallback");const I=m(C),$=()=>{T.isFallbackMountPending=!1,T.isInFallback&&(u(null,k,M,I,w,null,A,o,r),ja(T,k))},F=k.transition&&k.transition.mode==="out-in";F&&(T.isFallbackMountPending=!0,C.transition.afterLeave=$),T.isInFallback=!0,f(C,w,null,!0),F||$()},move(k,O,C){T.activeBranch&&p(T.activeBranch,k,O,C),T.container=k},next(){return T.activeBranch&&m(T.activeBranch)},registerDep(k,O,C){const w=!!T.pendingBranch;w&&T.deps++;const M=k.vnode.el;k.asyncDep.catch(A=>{ya(A,k,0)}).then(A=>{if(k.isUnmounted||T.isUnmounted||T.pendingId!==k.suspenseId)return;Gi(),k.asyncResolved=!0;const{vnode:I}=k;Rr(k,A,!1),M&&(I.el=M);const $=!M&&k.subTree.el;O(k,I,v(M||k.subTree.el),M?null:m(k.subTree),T,l,C),$&&(I.placeholder=null,E($)),Io(k,I.el),w&&--T.deps===0&&T.resolve()})},unmount(k,O){T.isUnmounted=!0,T.activeBranch&&f(T.activeBranch,s,k,O),T.pendingBranch&&f(T.pendingBranch,s,k,O)}};return T}function Hb(e,t,s,n,a,i,l,o,r){const c=t.suspense=Of(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,o,!0),d=r(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function zb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Ad(n?s.default:s),e.ssFallback=n?Ad(s.fallback):ht(kt)}function Ad(e){let t;if(Fe(e)){const s=pa&&e._c;s&&(e._d=!1,Vi()),e=e(),s&&(e._d=!0,t=Jt,Nf())}return Ce(e)&&(e=Cb(e)),e=ps(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Lf(e,t){t&&t.pendingBranch?Ce(e)?t.effects.push(...e):t.effects.push(e):Ui(e)}function ja(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,Io(n,a))}function jb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Dt=Symbol.for("v-fgt"),zn=Symbol.for("v-txt"),kt=Symbol.for("v-cmt"),ca=Symbol.for("v-stc"),Ri=[];let Jt=null;function Vi(e=!1){Ri.push(Jt=e?null:[])}function Nf(){Ri.pop(),Jt=Ri[Ri.length-1]||null}let pa=1;function qi(e,t=!1){pa+=e,e<0&&Jt&&t&&(Jt.hasOnce=!0)}function Pf(e){return e.dynamicChildren=pa>0?Jt||Fa:null,Nf(),pa>0&&Jt&&Jt.push(e),e}function Vb(e,t,s,n,a,i){return Pf(_c(e,t,s,n,a,i,!0))}function Gl(e,t,s,n,a){return Pf(ht(e,t,s,n,a,!0))}function An(e){return e?e.__v_isVNode===!0:!1}function Fs(e,t){return e.type===t.type&&e.key===t.key}function qb(e){}const Mf=({key:e})=>e??null,Il=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?He(e)||At(e)||Fe(e)?{i:jt,r:e,k:t,f:!!s}:e:null);function _c(e,t=null,s=null,n=0,a=null,i=e===Dt?0:1,l=!1,o=!1){const r={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Mf(t),ref:t&&Il(t),scopeId:So,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:jt};return o?(kc(r,s),i&128&&e.normalize(r)):s&&(r.shapeFlag|=He(s)?8:16),pa>0&&!l&&Jt&&(r.patchFlag>0||i&6)&&r.patchFlag!==32&&Jt.push(r),r}const ht=Gb;function Gb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===df)&&(e=kt),An(e)){const o=nn(e,t,!0);return s&&kc(o,s),pa>0&&!i&&Jt&&(o.shapeFlag&6?Jt[Jt.indexOf(e)]=o:Jt.push(o)),o.patchFlag=-2,o}if(Xb(e)&&(e=e.__vccOpts),t){t=Df(t);let{class:o,style:r}=t;o&&!He(o)&&(t.class=tl(o)),et(r)&&(sl(r)&&!Ce(r)&&(r=Ge({},r)),t.style=el(r))}const l=He(e)?1:ql(e)?128:Qp(e)?64:et(e)?4:Fe(e)?2:0;return _c(e,t,s,n,a,l,i,!0)}function Df(e){return e?sl(e)||yf(e)?Ge({},e):e:null}function nn(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:o,transition:r}=e,c=t?$f(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Mf(c),ref:t&&t.ref?s&&i?Ce(i)?i.concat(Il(t)):[i,Il(t)]:Il(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:o,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Dt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:r,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&nn(e.ssContent),ssFallback:e.ssFallback&&nn(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return r&&n&&En(d,r.clone(d)),d}function wc(e=" ",t=0){return ht(zn,null,e,t)}function Kb(e,t){const s=ht(ca,null,e);return s.staticCount=t,s}function Ff(e="",t=!1){return t?(Vi(),Gl(kt,null,e)):ht(kt,null,e)}function ps(e){return e==null||typeof e=="boolean"?ht(kt):Ce(e)?ht(Dt,null,e.slice()):An(e)?fn(e):ht(zn,null,String(e))}function fn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:nn(e)}function kc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(Ce(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),kc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!yf(t)?t._ctx=jt:a===3&&jt&&(jt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Fe(t)?(t={default:t,_ctx:jt},s=32):(t=String(t),n&64?(s=16,t=[wc(t)]):s=8);e.children=t,e.shapeFlag|=s}function $f(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=tl([t.class,n.class]));else if(a==="style")t.style=el([t.style,n.style]);else if(va(a)){const i=t[a],l=n[a];l&&i!==l&&!(Ce(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!fo(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ds(e,t,s,n=null){_s(e,t,7,[s,n])}const Wb=ff();let Zb=0;function Uf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Wb,i={uid:Zb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new tc(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:_f(n,a),emitsOptions:mf(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=Sb.bind(null,i),e.ce&&e.ce(i),i}let zt=null;const os=()=>zt||jt;let Kl,Va;{const e=bo(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Kl=t("__VUE_INSTANCE_SETTERS__",s=>zt=s),Va=t("__VUE_SSR_SETTERS__",s=>fa=s)}const oi=e=>{const t=zt;return Kl(e),e.scope.on(),()=>{e.scope.off(),Kl(t)}},Gi=()=>{zt&&zt.scope.off(),Kl(null)};function Bf(e){return e.vnode.shapeFlag&4}let fa=!1;function Hf(e,t=!1,s=!1){t&&Va(t);const{props:n,children:a}=e.vnode,i=Bf(e);Ib(e,n,i,t),Pb(e,a,s||t);const l=i?Jb(e,t):void 0;return t&&Va(!1),l}function Jb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,Sr);const{setup:n}=s;if(n){Tn();const a=e.setupContext=n.length>1?Vf(e):null,i=oi(e),l=li(n,e,0,[e.props,a]),o=ec(l);if(Cn(),i(),(o||e.sp)&&!wn(e)&&pc(e),o){if(l.then(Gi,Gi),t)return l.then(r=>{Rr(e,r,t)}).catch(r=>{ya(r,e,0)});e.asyncDep=l}else Rr(e,l,t)}else jf(e,t)}function Rr(e,t,s){Fe(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:et(t)&&(e.setupState=oc(t)),jf(e,s)}let Wl,Ir;function zf(e){Wl=e,Ir=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,sb))}}const Yb=()=>!Wl;function jf(e,t,s){const n=e.type;if(!e.render){if(!t&&Wl&&!n.render){const a=n.template||gc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:o,compilerOptions:r}=n,c=Ge(Ge({isCustomElement:i,delimiters:o},l),r);n.render=Wl(a,c)}}e.render=n.render||Vt,Ir&&Ir(e)}{const a=oi(e);Tn();try{vb(e)}finally{Cn(),a()}}}const Qb={get(e,t){return Zt(e,"get",""),e[t]}};function Vf(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Qb),slots:e.slots,emit:e.emit,expose:t}}function ll(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(oc(Fp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in Ai)return Ai[s](e)},has(t,s){return s in t||s in Ai}})):e.proxy}function Or(e,t=!0){return Fe(e)?e.displayName||e.name:e.name||t&&e.__name}function Xb(e){return Fe(e)&&"__vccOpts"in e}const Z=(e,t)=>ig(e,t,fa);function Za(e,t,s){try{qi(-1);const n=arguments.length;return n===2?et(t)&&!Ce(t)?An(t)?ht(e,null,[t]):ht(e,t):ht(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&An(s)&&(s=[s]),ht(e,t,s))}finally{qi(1)}}function ey(){}function ty(e,t,s,n){const a=s[n];if(a&&qf(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function qf(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Mt(s[n],t[n]))return!1;return pa>0&&Jt&&Jt.push(e),!0}const Gf="3.5.38",sy=Vt,ny=hg,ay=La,iy=Gp,ly={createComponentInstance:Uf,setupComponent:Hf,renderComponentRoot:Rl,setCurrentRenderingInstance:Hi,isVNode:An,normalizeVNode:ps,getComponentPublicInstance:ll,ensureValidVNode:vc,pushWarningContext:dg,popWarningContext:ug},oy=ly,ry=null,cy=null,dy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Lr;const Rd=typeof window<"u"&&window.trustedTypes;if(Rd)try{Lr=Rd.createPolicy("vue",{createHTML:e=>e})}catch{}const Kf=Lr?e=>Lr.createHTML(e):e=>e,uy="http://www.w3.org/2000/svg",py="http://www.w3.org/1998/Math/MathML",pn=typeof document<"u"?document:null,Id=pn&&pn.createElement("template"),Wf={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?pn.createElementNS(uy,e):t==="mathml"?pn.createElementNS(py,e):s?pn.createElement(e,{is:s}):pn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>pn.createTextNode(e),createComment:e=>pn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>pn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Id.innerHTML=Kf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const o=Id.content;if(n==="svg"||n==="mathml"){const r=o.firstChild;for(;r.firstChild;)o.appendChild(r.firstChild);o.removeChild(r)}t.insertBefore(o,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Nn="transition",fi="animation",Ja=Symbol("_vtc"),Zf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Jf=Ge({},uc,Zf),fy=e=>(e.displayName="Transition",e.props=Jf,e),hy=fy((e,{slots:t})=>Za(tf,Yf(e),t)),Xn=(e,t=[])=>{Ce(e)?e.forEach(s=>s(...t)):e&&e(...t)},Od=e=>e?Ce(e)?e.some(t=>t.length>1):e.length>1:!1;function Yf(e){const t={};for(const I in e)I in Zf||(t[I]=e[I]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:o=`${s}-enter-to`,appearFromClass:r=i,appearActiveClass:c=l,appearToClass:d=o,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,m=my(a),v=m&&m[0],E=m&&m[1],{onBeforeEnter:N,onEnter:_,onEnterCancelled:g,onLeave:y,onLeaveCancelled:T,onBeforeAppear:k=N,onAppear:O=_,onAppearCancelled:C=g}=t,w=(I,$,F,se)=>{I._enterCancelled=se,Fn(I,$?d:o),Fn(I,$?c:l),F&&F()},M=(I,$)=>{I._isLeaving=!1,Fn(I,u),Fn(I,f),Fn(I,p),$&&$()},A=I=>($,F)=>{const se=I?O:_,B=()=>w($,I,F);Xn(se,[$,B]),Ld(()=>{Fn($,I?r:i),Zs($,I?d:o),Od(se)||Nd($,n,v,B)})};return Ge(t,{onBeforeEnter(I){Xn(N,[I]),Zs(I,i),Zs(I,l)},onBeforeAppear(I){Xn(k,[I]),Zs(I,r),Zs(I,c)},onEnter:A(!1),onAppear:A(!0),onLeave(I,$){I._isLeaving=!0;const F=()=>M(I,$);Zs(I,u),I._enterCancelled?(Zs(I,p),Nr(I)):(Nr(I),Zs(I,p)),Ld(()=>{I._isLeaving&&(Fn(I,u),Zs(I,f),Od(y)||Nd(I,n,E,F))}),Xn(y,[I,F])},onEnterCancelled(I){w(I,!1,void 0,!0),Xn(g,[I])},onAppearCancelled(I){w(I,!0,void 0,!0),Xn(C,[I])},onLeaveCancelled(I){M(I),Xn(T,[I])}})}function my(e){if(e==null)return null;if(et(e))return[Yo(e.enter),Yo(e.leave)];{const t=Yo(e);return[t,t]}}function Yo(e){return Dl(e)}function Zs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ja]||(e[Ja]=new Set)).add(t)}function Fn(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ja];s&&(s.delete(t),s.size||(e[Ja]=void 0))}function Ld(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let vy=0;function Nd(e,t,s,n){const a=e._endId=++vy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:o,propCount:r}=Qf(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=r&&u()};setTimeout(()=>{d<r&&u()},o+1),e.addEventListener(c,p)}function Qf(e,t){const s=window.getComputedStyle(e),n=m=>(s[m]||"").split(", "),a=n(`${Nn}Delay`),i=n(`${Nn}Duration`),l=Pd(a,i),o=n(`${fi}Delay`),r=n(`${fi}Duration`),c=Pd(o,r);let d=null,u=0,p=0;t===Nn?l>0&&(d=Nn,u=l,p=i.length):t===fi?c>0&&(d=fi,u=c,p=r.length):(u=Math.max(l,c),d=u>0?l>c?Nn:fi:null,p=d?d===Nn?i.length:r.length:0);const f=d===Nn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Nn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function Pd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Md(s)+Md(e[n])))}function Md(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Nr(e){return(e?e.ownerDocument:document).body.offsetHeight}function gy(e,t,s){const n=e[Ja];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Zl=Symbol("_vod"),Sc=Symbol("_vsh"),Xf={name:"show",beforeMount(e,{value:t},{transition:s}){e[Zl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):hi(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),hi(e,!0),n.enter(e)):n.leave(e,()=>{hi(e,!1)}):hi(e,t))},beforeUnmount(e,{value:t}){hi(e,t)}};function hi(e,t){e.style.display=t?e[Zl]:"none",e[Sc]=!t}function by(){Xf.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const eh=Symbol("");function yy(e){const t=os();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Jl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Jl(t.ce,a):Pr(t.subTree,a),s(a)};fc(()=>{Ui(n)}),Ze(()=>{ls(n,Vt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),mt(()=>a.disconnect())})}function Pr(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Pr(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Jl(e.el,t);else if(e.type===Dt)e.children.forEach(s=>Pr(s,t));else if(e.type===ca){let{el:s,anchor:n}=e;for(;s&&(Jl(s,t),s!==n);)s=s.nextSibling}}function Jl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=Tv(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[eh]=n}}const xy=/(?:^|;)\s*display\s*:/;function _y(e,t,s){const n=e.style,a=He(s);let i=!1;if(s&&!a){if(t)if(He(t))for(const l of t.split(";")){const o=l.slice(0,l.indexOf(":")).trim();s[o]==null&&ki(n,o,"")}else for(const l in t)s[l]==null&&ki(n,l,"");for(const l in s){l==="display"&&(i=!0);const o=s[l];o!=null?ky(e,l,!He(t)&&t?t[l]:void 0,o)||ki(n,l,o):ki(n,l,"")}}else if(a){if(t!==s){const l=n[eh];l&&(s+=";"+l),n.cssText=s,i=xy.test(s)}}else t&&e.removeAttribute("style");Zl in e&&(e[Zl]=i?n.display:"",e[Sc]&&(n.display="none"))}const Dd=/\s*!important$/;function ki(e,t,s){if(Ce(s))s.forEach(n=>ki(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=wy(e,t);Dd.test(s)?e.setProperty(fs(n),s.replace(Dd,""),"important"):e[n]=s}}const Fd=["Webkit","Moz","ms"],Qo={};function wy(e,t){const s=Qo[t];if(s)return s;let n=lt(t);if(n!=="filter"&&n in e)return Qo[t]=n;n=ba(n);for(let a=0;a<Fd.length;a++){const i=Fd[a]+n;if(i in e)return Qo[t]=i}return t}function ky(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&He(n)&&s===n}const $d="http://www.w3.org/1999/xlink";function Ud(e,t,s,n,a,i=kv(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS($d,t.slice(6,t.length)):e.setAttributeNS($d,t,s):s==null||i&&!gp(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Xt(s)?String(s):s)}function Bd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Kf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const o=i==="OPTION"?e.getAttribute("value")||"":e.value,r=s==null?e.type==="checkbox"?"on":"":String(s);(o!==r||!("_value"in e))&&(e.value=r),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const o=typeof e[t];o==="boolean"?s=gp(s):s==null&&o==="string"?(s="",l=!0):o==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function gn(e,t,s,n){e.addEventListener(t,s,n)}function Sy(e,t,s,n){e.removeEventListener(t,s,n)}const Hd=Symbol("_vei");function Ty(e,t,s,n,a=null){const i=e[Hd]||(e[Hd]={}),l=i[t];if(n&&l)l.value=n;else{const[o,r]=Cy(t);if(n){const c=i[t]=Ry(n,a);gn(e,o,c,r)}else l&&(Sy(e,o,l,r),i[t]=void 0)}}const zd=/(?:Once|Passive|Capture)$/;function Cy(e){let t;if(zd.test(e)){t={};let n;for(;n=e.match(zd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):fs(e.slice(2)),t]}let Xo=0;const Ey=Promise.resolve(),Ay=()=>Xo||(Ey.then(()=>Xo=0),Xo=Date.now());function Ry(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(Ce(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),o=[n];for(let r=0;r<l.length&&!n._stopped;r++){const c=l[r];c&&_s(c,t,5,o)}}else _s(a,t,5,[n])};return s.value=e,s.attached=Ay(),s}const jd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,th=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?gy(e,n,l):t==="style"?_y(e,s,n):va(t)?fo(t)||Ty(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):Iy(e,t,n,l))?(Bd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ud(e,t,n,l,i,t!=="value")):e._isVueCE&&(Oy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!He(n)))?Bd(e,lt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Ud(e,t,n,l))};function Iy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&jd(t)&&Fe(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return jd(t)&&He(s)?!1:t in e}function Oy(e,t){const s=e._def.props;if(!s)return!1;const n=lt(t);return Array.isArray(s)?s.some(a=>lt(a)===n):Object.keys(s).some(a=>lt(a)===n)}const Vd={};function sh(e,t,s){let n=al(e,t);ho(n)&&(n=Ge({},n,t));class a extends Oo{constructor(l){super(n,l,s)}}return a.def=n,a}const Ly=((e,t)=>sh(e,t,mh)),Ny=typeof HTMLElement<"u"?HTMLElement:class{};class Oo extends Ny{constructor(t,s={},n=Xl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Xl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ge({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Oo){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ct(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let o;if(i&&!Ce(i))for(const r in i){const c=i[r];(c===Number||c&&c.type===Number)&&(r in this._props&&(this._props[r]=Dl(this._props[r])),(o||(o=Object.create(null)))[lt(r)]=!0)}this._numberProps=o,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)tt(this,n)||Object.defineProperty(this,n,{get:()=>tn(s[n])})}_resolveProps(t){const{props:s}=t,n=Ce(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(lt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Vd;const a=lt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Dl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Vd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(fs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(fs(t),s+""):s||this.removeAttribute(fs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),hh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ht(this._def,Ge(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,ho(l[0])?Ge({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),fs(i)!==i&&a(fs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let o=null;for(let r=t.length-1;r>=0;r--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[r],i.insertBefore(c,o||l),o=c,r===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],o=a.parentNode;if(l)for(const r of l){if(s&&r.nodeType===1){const c=s+"-s",d=document.createTreeWalker(r,1);r.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}o.insertBefore(r,a)}else for(;a.firstChild;)o.insertBefore(a.firstChild,a);o.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function nh(e){const t=os(),s=t&&t.ce;return s||null}function Py(){const e=nh();return e&&e.shadowRoot}function My(e="$style"){{const t=os();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const ah=new WeakMap,ih=new WeakMap,Yl=Symbol("_moveCb"),qd=Symbol("_enterCb"),Dy=e=>(delete e.props.mode,e),Fy=Dy({name:"TransitionGroup",props:Ge({},Jf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=os(),n=dc();let a,i;return Eo(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!zy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Uy),a.forEach(By);const o=a.filter(Hy);Nr(s.vnode.el),o.forEach(r=>{const c=r.el,d=c.style;Zs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Yl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Yl]=null,Fn(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ye(e),o=Yf(l);let r=l.tag||Dt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[Sc]&&(a.push(d),En(d,Wa(d,o,n,s)),ah.set(d,lh(d.el)))}i=t.default?To(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&En(d,Wa(d,o,n,s))}return ht(r,null,i)}}}),$y=Fy;function Uy(e){const t=e.el;t[Yl]&&t[Yl](),t[qd]&&t[qd]()}function By(e){ih.set(e,lh(e.el))}function Hy(e){const t=ah.get(e),s=ih.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,o=i.getBoundingClientRect();let r=1,c=1;return i.offsetWidth&&(r=o.width/i.offsetWidth),i.offsetHeight&&(c=o.height/i.offsetHeight),(!Number.isFinite(r)||r===0)&&(r=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(r-1)<.01&&(r=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/r}px,${a/c}px)`,l.transitionDuration="0s",e}}function lh(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function zy(e,t,s){const n=e.cloneNode(),a=e[Ja];a&&a.forEach(o=>{o.split(/\s+/).forEach(r=>r&&n.classList.remove(r))}),s.split(/\s+/).forEach(o=>o&&n.classList.add(o)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Qf(n);return i.removeChild(n),l}const Vn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return Ce(t)?s=>Ba(t,s):t};function jy(e){e.target.composing=!0}function Gd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Os=Symbol("_assign");function Kd(e,t,s){return t&&(e=e.trim()),s&&(e=go(e)),e}const Ql={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Os]=Vn(a);const i=n||a.props&&a.props.type==="number";gn(e,t?"change":"input",l=>{l.target.composing||e[Os](Kd(e.value,s,i))}),(s||i)&&gn(e,"change",()=>{e.value=Kd(e.value,s,i)}),t||(gn(e,"compositionstart",jy),gn(e,"compositionend",Gd),gn(e,"change",Gd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Os]=Vn(l),e.composing)return;const o=(i||e.type==="number")&&!/^0\d/.test(e.value)?go(e.value):e.value,r=t??"";if(o===r)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===r)||(e.value=r)}},Tc={deep:!0,created(e,t,s){e[Os]=Vn(s),gn(e,"change",()=>{const n=e._modelValue,a=Ya(e),i=e.checked,l=e[Os];if(Ce(n)){const o=yo(n,a),r=o!==-1;if(i&&!r)l(n.concat(a));else if(!i&&r){const c=[...n];c.splice(o,1),l(c)}}else if(ga(n)){const o=new Set(n);i?o.add(a):o.delete(a),l(o)}else l(rh(e,i))})},mounted:Wd,beforeUpdate(e,t,s){e[Os]=Vn(s),Wd(e,t,s)}};function Wd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(Ce(t))a=yo(t,n.props.value)>-1;else if(ga(t))a=t.has(n.props.value);else{if(t===s)return;a=Sn(t,rh(e,!0))}e.checked!==a&&(e.checked=a)}const Cc={created(e,{value:t},s){e.checked=Sn(t,s.props.value),e[Os]=Vn(s),gn(e,"change",()=>{e[Os](Ya(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Os]=Vn(n),t!==s&&(e.checked=Sn(t,n.props.value))}},oh={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=ga(t);gn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?go(Ya(l)):Ya(l));e[Os](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ct(()=>{e._assigning=!1})}),e[Os]=Vn(n)},mounted(e,{value:t}){Zd(e,t)},beforeUpdate(e,t,s){e[Os]=Vn(s)},updated(e,{value:t}){e._assigning||Zd(e,t)}};function Zd(e,t){const s=e.multiple,n=Ce(t);if(!(s&&!n&&!ga(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],o=Ya(l);if(s)if(n){const r=typeof o;r==="string"||r==="number"?l.selected=t.some(c=>String(c)===String(o)):l.selected=yo(t,o)>-1}else l.selected=t.has(o);else if(Sn(Ya(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ya(e){return"_value"in e?e._value:e.value}function rh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const ch={created(e,t,s){_l(e,t,s,null,"created")},mounted(e,t,s){_l(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){_l(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){_l(e,t,s,n,"updated")}};function dh(e,t){switch(e){case"SELECT":return oh;case"TEXTAREA":return Ql;default:switch(t){case"checkbox":return Tc;case"radio":return Cc;default:return Ql}}}function _l(e,t,s,n,a){const l=dh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Vy(){Ql.getSSRProps=({value:e})=>({value:e}),Cc.getSSRProps=({value:e},t)=>{if(t.props&&Sn(t.props.value,e))return{checked:!0}},Tc.getSSRProps=({value:e},t)=>{if(Ce(e)){if(t.props&&yo(e,t.props.value)>-1)return{checked:!0}}else if(ga(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},ch.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=dh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const qy=["ctrl","shift","alt","meta"],Gy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>qy.some(s=>e[`${s}Key`]&&!t.includes(s))},Ky=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const o=Gy[t[l]];if(o&&o(a,t))return}return e(a,...i)}))},Wy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Zy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=fs(a.key);if(t.some(l=>l===i||Wy[l]===i))return e(a)}))},uh=Ge({patchProp:th},Wf);let Ii,Jd=!1;function ph(){return Ii||(Ii=Tf(uh))}function fh(){return Ii=Jd?Ii:Cf(uh),Jd=!0,Ii}const hh=((...e)=>{ph().render(...e)}),Jy=((...e)=>{fh().hydrate(...e)}),Xl=((...e)=>{const t=ph().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=gh(n);if(!a)return;const i=t._component;!Fe(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,vh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),mh=((...e)=>{const t=fh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=gh(n);if(a)return s(a,!0,vh(a))},t});function vh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function gh(e){return He(e)?document.querySelector(e):e}let Yd=!1;const Yy=()=>{Yd||(Yd=!0,Vy(),by())},Qy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:tf,BaseTransitionPropsValidators:uc,Comment:kt,DeprecationTypes:dy,EffectScope:tc,ErrorCodes:fg,ErrorTypeStrings:ny,Fragment:Dt,KeepAlive:Gg,ReactiveEffect:Di,Static:ca,Suspense:$b,Teleport:Ag,Text:zn,TrackOpTypes:lg,Transition:hy,TransitionGroup:$y,TriggerOpTypes:og,VueElement:Oo,assertNumber:pg,callWithAsyncErrorHandling:_s,callWithErrorHandling:li,camelize:lt,capitalize:ba,cloneVNode:nn,compatUtils:cy,computed:Z,createApp:Xl,createBlock:Gl,createCommentVNode:Ff,createElementBlock:Vb,createElementVNode:_c,createHydrationRenderer:Cf,createPropsRestProxy:hb,createRenderer:Tf,createSSRApp:mh,createSlots:Xg,createStaticVNode:Kb,createTextVNode:wc,createVNode:ht,customRef:Up,defineAsyncComponent:Vg,defineComponent:al,defineCustomElement:sh,defineEmits:ab,defineExpose:ib,defineModel:rb,defineOptions:lb,defineProps:nb,defineSSRCustomElement:Ly,defineSlots:ob,devtools:ay,effect:Rv,effectScope:Cv,getCurrentInstance:os,getCurrentScope:_p,getCurrentWatcher:rg,getTransitionRawChildren:To,guardReactiveProps:Df,h:Za,handleError:ya,hasInjectionContext:_g,hydrate:Jy,hydrateOnIdle:$g,hydrateOnInteraction:zg,hydrateOnMediaQuery:Hg,hydrateOnVisible:Bg,initCustomFormatter:ey,initDirectivesForSSR:Yy,inject:Is,isMemoSame:qf,isProxy:sl,isReactive:_n,isReadonly:sn,isRef:At,isRuntimeOnly:Yb,isShallow:ms,isVNode:An,markRaw:Fp,mergeDefaults:pb,mergeModels:fb,mergeProps:$f,nextTick:Ct,nodeOps:Wf,normalizeClass:tl,normalizeProps:fv,normalizeStyle:el,onActivated:ks,onBeforeMount:af,onBeforeUnmount:Ao,onBeforeUpdate:fc,onDeactivated:vs,onErrorCaptured:cf,onMounted:Ze,onRenderTracked:rf,onRenderTriggered:of,onScopeDispose:Ev,onServerPrefetch:lf,onUnmounted:mt,onUpdated:Eo,onWatcherCleanup:Hp,openBlock:Vi,patchProp:th,popScopeId:bg,provide:Ei,proxyRefs:oc,pushScopeId:gg,queuePostFlushCb:Ui,reactive:qn,readonly:$l,ref:h,registerRuntimeCompiler:zf,render:hh,renderList:Qg,renderSlot:eb,resolveComponent:Zg,resolveDirective:Yg,resolveDynamicComponent:Jg,resolveFilter:ry,resolveTransitionHooks:Wa,setBlockTracking:qi,setDevtoolsHook:iy,setTransitionHooks:En,shallowReactive:ic,shallowReadonly:Wv,shallowRef:lc,ssrContextKey:Kp,ssrUtils:oy,stop:Iv,toDisplayString:yp,toHandlerKey:Ua,toHandlers:tb,toRaw:Ye,toRef:ng,toRefs:eg,toValue:Yv,transformVNodeArgs:qb,triggerRef:Jv,unref:tn,useAttrs:ub,useCssModule:My,useCssVars:yy,useHost:nh,useId:Ig,useModel:kb,useSSRContext:Wp,useShadowRoot:Py,useSlots:db,useTemplateRef:Og,useTransitionState:dc,vModelCheckbox:Tc,vModelDynamic:ch,vModelRadio:Cc,vModelSelect:oh,vModelText:Ql,vShow:Xf,version:Gf,warn:sy,watch:ls,watchEffect:wg,watchPostEffect:kg,watchSyncEffect:Zp,withAsyncContext:mb,withCtx:cc,withDefaults:cb,withDirectives:xg,withKeys:Zy,withMemo:ty,withModifiers:Ky,withScopeId:yg},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ki=Symbol(""),Oi=Symbol(""),Ec=Symbol(""),eo=Symbol(""),bh=Symbol(""),ha=Symbol(""),yh=Symbol(""),xh=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),ol=Symbol(""),Ic=Symbol(""),_h=Symbol(""),Oc=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),Pc=Symbol(""),Mc=Symbol(""),Dc=Symbol(""),wh=Symbol(""),kh=Symbol(""),Lo=Symbol(""),to=Symbol(""),Fc=Symbol(""),$c=Symbol(""),Wi=Symbol(""),rl=Symbol(""),Uc=Symbol(""),Mr=Symbol(""),Xy=Symbol(""),Dr=Symbol(""),so=Symbol(""),ex=Symbol(""),tx=Symbol(""),Bc=Symbol(""),sx=Symbol(""),nx=Symbol(""),Hc=Symbol(""),Sh=Symbol(""),Qa={[Ki]:"Fragment",[Oi]:"Teleport",[Ec]:"Suspense",[eo]:"KeepAlive",[bh]:"BaseTransition",[ha]:"openBlock",[yh]:"createBlock",[xh]:"createElementBlock",[Ac]:"createVNode",[Rc]:"createElementVNode",[ol]:"createCommentVNode",[Ic]:"createTextVNode",[_h]:"createStaticVNode",[Oc]:"resolveComponent",[Lc]:"resolveDynamicComponent",[Nc]:"resolveDirective",[Pc]:"resolveFilter",[Mc]:"withDirectives",[Dc]:"renderList",[wh]:"renderSlot",[kh]:"createSlots",[Lo]:"toDisplayString",[to]:"mergeProps",[Fc]:"normalizeClass",[$c]:"normalizeStyle",[Wi]:"normalizeProps",[rl]:"guardReactiveProps",[Uc]:"toHandlers",[Mr]:"camelize",[Xy]:"capitalize",[Dr]:"toHandlerKey",[so]:"setBlockTracking",[ex]:"pushScopeId",[tx]:"popScopeId",[Bc]:"withCtx",[sx]:"unref",[nx]:"isRef",[Hc]:"withMemo",[Sh]:"isMemoSame"};function ax(e){Object.getOwnPropertySymbols(e).forEach(t=>{Qa[t]=e[t]})}const Ss={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function ix(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:Ss}}function Zi(e,t,s,n,a,i,l,o=!1,r=!1,c=!1,d=Ss){return e&&(o?(e.helper(ha),e.helper(ti(e.inSSR,c))):e.helper(ei(e.inSSR,c)),l&&e.helper(Mc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:o,disableTracking:r,isComponent:c,loc:d}}function da(e,t=Ss){return{type:17,loc:t,elements:e}}function Rs(e,t=Ss){return{type:15,loc:t,properties:e}}function Et(e,t){return{type:16,loc:Ss,key:He(e)?je(e,!0):e,value:t}}function je(e,t=!1,s=Ss,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Us(e,t=Ss){return{type:8,loc:t,children:e}}function Lt(e,t=[],s=Ss){return{type:14,loc:s,callee:e,arguments:t}}function Xa(e,t=void 0,s=!1,n=!1,a=Ss){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Fr(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:Ss}}function lx(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:Ss}}function ox(e){return{type:21,body:e,loc:Ss}}function ei(e,t){return e||t?Ac:Rc}function ti(e,t){return e||t?yh:xh}function zc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(ei(n,e.isComponent)),t(ha),t(ti(n,e.isComponent)))}const Qd=new Uint8Array([123,123]),Xd=new Uint8Array([125,125]);function eu(e){return e>=97&&e<=122||e>=65&&e<=90}function ys(e){return e===32||e===10||e===9||e===12||e===13}function Pn(e){return e===47||e===62||ys(e)}function no(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Gt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class rx{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Qd,this.delimiterClose=Xd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Qd,this.delimiterClose=Xd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,o=a;for(;l+1<o;){const r=l+o>>>1;this.newlines[r]<t?l=r:o=r}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Pn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||ys(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Gt.TitleEnd||this.currentSequence===Gt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Gt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Gt.Cdata.length&&(this.state=28,this.currentSequence=Gt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Gt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):eu(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Pn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Pn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(no("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){ys(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=eu(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||ys(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):ys(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):ys(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Pn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Pn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Pn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Pn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Pn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):ys(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):ys(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){ys(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Gt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Gt.ScriptEnd[3]?this.startSpecial(Gt.ScriptEnd,4):t===Gt.StyleEnd[3]?this.startSpecial(Gt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Gt.TitleEnd[3]?this.startSpecial(Gt.TitleEnd,4):t===Gt.TextareaEnd[3]?this.startSpecial(Gt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Gt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function tu(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function ua(e,t){const s=tu("MODE",t),n=tu(e,t);return s===3?n===!0:n!==!1}function Ji(e,t,s,...n){return ua(e,t)}function jc(e){throw e}function Th(e){}function ft(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const hs=e=>e.type===4&&e.isStatic;function Ch(e){switch(e){case"Teleport":case"teleport":return Oi;case"Suspense":case"suspense":return Ec;case"KeepAlive":case"keep-alive":return eo;case"BaseTransition":case"base-transition":return bh}}const cx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Vc=e=>!cx.test(e),Eh=/[A-Za-z_$\xA0-\uFFFF]/,dx=/[\.\?\w$\xA0-\uFFFF]/,ux=/\s+[.[]\s*|\s*[.[]\s+/g,Ah=e=>e.type===4?e.content:e.loc.source,px=e=>{const t=Ah(e).trim().replace(ux,o=>o.trim());let s=0,n=[],a=0,i=0,l=null;for(let o=0;o<t.length;o++){const r=t.charAt(o);switch(s){case 0:if(r==="[")n.push(s),s=1,a++;else if(r==="(")n.push(s),s=2,i++;else if(!(o===0?Eh:dx).test(r))return!1;break;case 1:r==="'"||r==='"'||r==="`"?(n.push(s),s=3,l=r):r==="["?a++:r==="]"&&(--a||(s=n.pop()));break;case 2:if(r==="'"||r==='"'||r==="`")n.push(s),s=3,l=r;else if(r==="(")i++;else if(r===")"){if(o===t.length-1)return!1;--i||(s=n.pop())}break;case 3:r===l&&(s=n.pop(),l=null);break}}return!a&&!i},Rh=px,fx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,hx=e=>fx.test(Ah(e)),mx=hx;function As(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(He(t)?a.name===t:t.test(a.name)))return a}}function No(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&aa(i.arg,t))return i}}function aa(e,t){return!!(e&&hs(e)&&e.content===t)}function vx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function er(e){return e.type===5||e.type===2}function su(e){return e.type===7&&e.name==="pre"}function gx(e){return e.type===7&&e.name==="slot"}function ao(e){return e.type===1&&e.tagType===3}function io(e){return e.type===1&&e.tagType===2}const bx=new Set([Wi,rl]);function Ih(e,t=[]){if(e&&!He(e)&&e.type===14){const s=e.callee;if(!He(s)&&bx.has(s))return Ih(e.arguments[0],t.concat(e))}return[e,t]}function lo(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!He(a)&&a.type===14){const o=Ih(a);a=o[0],i=o[1],l=i[i.length-1]}if(a==null||He(a))n=Rs([t]);else if(a.type===14){const o=a.arguments[0];!He(o)&&o.type===15?nu(t,o)||o.properties.unshift(t):a.callee===Uc?n=Lt(s.helper(to),[Rs([t]),a]):a.arguments.unshift(Rs([t])),!n&&(n=a)}else a.type===15?(nu(t,a)||a.properties.unshift(t),n=a):(n=Lt(s.helper(to),[Rs([t]),a]),l&&l.callee===rl&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function nu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Yi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function yx(e){return e.type===14&&e.callee===Hc?e.arguments[1].returns:e}const xx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function Oh(e){for(let t=0;t<e.length;t++)if(!ys(e.charCodeAt(t)))return!1;return!0}function qc(e){return e.type===2&&Oh(e.content)||e.type===12&&qc(e.content)}function Lh(e){return e.type===3||qc(e)}const Nh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ma,isPreTag:Ma,isIgnoreNewlineTag:Ma,isCustomElement:Ma,onError:jc,onWarn:Th,comments:!1,prefixIdentifiers:!1};let Xe=Nh,Qi=null,kn="",Wt=null,We=null,cs="",un=-1,ta=-1,Gc=0,Bn=!1,$r=null;const pt=[],xt=new rx(pt,{onerr:rn,ontext(e,t){wl(Ht(e,t),e,t)},ontextentity(e,t,s){wl(e,t,s)},oninterpolation(e,t){if(Bn)return wl(Ht(e,t),e,t);let s=e+xt.delimiterOpen.length,n=t-xt.delimiterClose.length;for(;ys(kn.charCodeAt(s));)s++;for(;ys(kn.charCodeAt(n-1));)n--;let a=Ht(s,n);a.includes("&")&&(a=Xe.decodeEntities(a,!1)),Ur({type:5,content:Ll(a,!1,wt(s,n)),loc:wt(e,t)})},onopentagname(e,t){const s=Ht(e,t);Wt={type:1,tag:s,ns:Xe.getNamespace(s,pt[0],Xe.ns),tagType:0,props:[],children:[],loc:wt(e-1,t),codegenNode:void 0}},onopentagend(e){iu(e)},onclosetag(e,t){const s=Ht(e,t);if(!Xe.isVoidTag(s)){let n=!1;for(let a=0;a<pt.length;a++)if(pt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&rn(24,pt[0].loc.start.offset);for(let l=0;l<=a;l++){const o=pt.shift();Ol(o,t,l<a)}break}n||rn(23,Ph(e,60))}},onselfclosingtag(e){const t=Wt.tag;Wt.isSelfClosing=!0,iu(e),pt[0]&&pt[0].tag===t&&Ol(pt.shift(),e)},onattribname(e,t){We={type:6,name:Ht(e,t),nameLoc:wt(e,t),value:void 0,loc:wt(e)}},ondirname(e,t){const s=Ht(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Bn&&n===""&&rn(26,e),Bn||n==="")We={type:6,name:s,nameLoc:wt(e,t),value:void 0,loc:wt(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[je("prop")]:[],loc:wt(e)},n==="pre"){Bn=xt.inVPre=!0,$r=Wt;const a=Wt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=Ix(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ht(e,t);if(Bn&&!su(We))We.name+=s,ia(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=Ll(n?s:s.slice(1,-1),n,wt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ht(e,t);if(Bn&&!su(We))We.name+="."+s,ia(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,ia(n.loc,t))}else{const n=je(s,!0,wt(e,t));We.modifiers.push(n)}},onattribdata(e,t){cs+=Ht(e,t),un<0&&(un=e),ta=t},onattribentity(e,t,s){cs+=e,un<0&&(un=t),ta=s},onattribnameend(e){const t=We.loc.start.offset,s=Ht(t,e);We.type===7&&(We.rawName=s),Wt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&rn(2,t)},onattribend(e,t){if(Wt&&We){if(ia(We.loc,t),e!==0)if(cs.includes("&")&&(cs=Xe.decodeEntities(cs,!0)),We.type===6)We.name==="class"&&(cs=Dh(cs).trim()),e===1&&!cs&&rn(13,t),We.value={type:2,content:cs,loc:e===1?wt(un,ta):wt(un-1,ta+1)},xt.inSFCRoot&&Wt.tag==="template"&&We.name==="lang"&&cs&&cs!=="html"&&xt.enterRCDATA(no("</template"),0);else{let s=0;We.exp=Ll(cs,!1,wt(un,ta),0,s),We.name==="for"&&(We.forParseResult=wx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ji("COMPILER_V_BIND_SYNC",Xe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&Wt.props.push(We)}cs="",un=ta=-1},oncomment(e,t){Xe.comments&&Ur({type:3,content:Ht(e,t),loc:wt(e-4,t+3)})},onend(){const e=kn.length;for(let t=0;t<pt.length;t++)Ol(pt[t],e-1),rn(24,pt[t].loc.start.offset)},oncdata(e,t){(pt[0]?pt[0].ns:Xe.ns)!==0?wl(Ht(e,t),e,t):rn(1,e-9)},onprocessinginstruction(e){(pt[0]?pt[0].ns:Xe.ns)===0&&rn(21,e-1)}}),au=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,_x=/^\(|\)$/g;function wx(e){const t=e.loc,s=e.content,n=s.match(xx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const m=t.start.offset+p,v=m+u.length;return Ll(u,!1,wt(m,v),0,f?1:0)},o={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let r=a.trim().replace(_x,"").trim();const c=a.indexOf(r),d=r.match(au);if(d){r=r.replace(au,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+r.length),o.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(o.index=l(f,s.indexOf(f,o.key?p+u.length:c+r.length),!0))}}return r&&(o.value=l(r,c,!0)),o}function Ht(e,t){return kn.slice(e,t)}function iu(e){xt.inSFCRoot&&(Wt.innerLoc=wt(e+1,e+1)),Ur(Wt);const{tag:t,ns:s}=Wt;s===0&&Xe.isPreTag(t)&&Gc++,Xe.isVoidTag(t)?Ol(Wt,e):(pt.unshift(Wt),(s===1||s===2)&&(xt.inXML=!0)),Wt=null}function wl(e,t,s){{const i=pt[0]&&pt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Xe.decodeEntities(e,!1))}const n=pt[0]||Qi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,ia(a.loc,s)):n.children.push({type:2,content:e,loc:wt(t,s)})}function Ol(e,t,s=!1){s?ia(e.loc,Ph(t,60)):ia(e.loc,kx(t,62)+1),xt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ge({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ge({},e.innerLoc.start),e.innerLoc.source=Ht(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Bn||(n==="slot"?e.tagType=2:lu(e)?e.tagType=3:Tx(e)&&(e.tagType=1)),xt.inRCDATA||(e.children=Mh(i)),a===0&&Xe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Xe.isPreTag(n)&&Gc--,$r===e&&(Bn=xt.inVPre=!1,$r=null),xt.inXML&&(pt[0]?pt[0].ns:Xe.ns)===0&&(xt.inXML=!1);{const l=e.props;if(!xt.inSFCRoot&&ua("COMPILER_NATIVE_TEMPLATE",Xe)&&e.tag==="template"&&!lu(e)){const r=pt[0]||Qi,c=r.children.indexOf(e);r.children.splice(c,1,...e.children)}const o=l.find(r=>r.type===6&&r.name==="inline-template");o&&Ji("COMPILER_INLINE_TEMPLATE",Xe,o.loc)&&e.children.length&&(o.value={type:2,content:Ht(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:o.loc})}}function kx(e,t){let s=e;for(;kn.charCodeAt(s)!==t&&s<kn.length-1;)s++;return s}function Ph(e,t){let s=e;for(;kn.charCodeAt(s)!==t&&s>=0;)s--;return s}const Sx=new Set(["if","else","else-if","for","slot"]);function lu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&Sx.has(t[s].name))return!0}return!1}function Tx({tag:e,props:t}){if(Xe.isCustomElement(e))return!1;if(e==="component"||Cx(e.charCodeAt(0))||Ch(e)||Xe.isBuiltInComponent&&Xe.isBuiltInComponent(e)||Xe.isNativeTag&&!Xe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ji("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}}else if(n.name==="bind"&&aa(n.arg,"is")&&Ji("COMPILER_IS_ON_ELEMENT",Xe,n.loc))return!0}return!1}function Cx(e){return e>64&&e<91}const Ex=/\r\n/g;function Mh(e){const t=Xe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Gc)a.content=a.content.replace(Ex,`
`);else if(Oh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&Ax(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Dh(a.content))}return s?e.filter(Boolean):e}function Ax(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Dh(e){let t="",s=!1;for(let n=0;n<e.length;n++)ys(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Ur(e){(pt[0]||Qi).children.push(e)}function wt(e,t){return{start:xt.getPos(e),end:t==null?t:xt.getPos(t),source:t==null?t:Ht(e,t)}}function Rx(e){return wt(e.start.offset,e.end.offset)}function ia(e,t){e.end=xt.getPos(t),e.source=Ht(e.start.offset,t)}function Ix(e){const t={type:6,name:e.rawName,nameLoc:wt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Ll(e,t=!1,s,n=0,a=0){return je(e,t,s,n)}function rn(e,t,s){Xe.onError(ft(e,wt(t,t)))}function Ox(){xt.reset(),Wt=null,We=null,cs="",un=-1,ta=-1,pt.length=0}function Lx(e,t){if(Ox(),kn=e,Xe=Ge({},Nh),t){let a;for(a in t)t[a]!=null&&(Xe[a]=t[a])}xt.mode=Xe.parseMode==="html"?1:Xe.parseMode==="sfc"?2:0,xt.inXML=Xe.ns===1||Xe.ns===2;const s=t&&t.delimiters;s&&(xt.delimiterOpen=no(s[0]),xt.delimiterClose=no(s[1]));const n=Qi=ix([],e);return xt.parse(kn),n.loc=wt(0,e.length),n.children=Mh(n.children),Qi=null,n}function Nx(e,t){Nl(e,void 0,t,!!Fh(e))}function Fh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!io(t[0])?t[0]:null}function Nl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:xs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const m=f.patchFlag;if((m===void 0||m===512||m===1)&&Uh(u,s)>=2){const v=Bh(u);v&&(f.props=s.hoist(v))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:xs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,Nl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)Nl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)Nl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let o=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&Ce(e.codegenNode.children))e.codegenNode.children=r(da(e.codegenNode.children)),o=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!Ce(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=r(da(d.returns)),o=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!Ce(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=As(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=r(da(u.returns)),o=!0)}}if(!o)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function r(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!Ce(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function xs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const o=Uh(e,t);if(o===0)return s.set(e,0),0;o<l&&(l=o);for(let r=0;r<e.children.length;r++){const c=xs(e.children[r],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let r=0;r<e.props.length;r++){const c=e.props[r];if(c.type===7&&c.name==="bind"&&c.exp){const d=xs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let r=0;r<e.props.length;r++)if(e.props[r].type===7)return s.set(e,0),0;t.removeHelper(ha),t.removeHelper(ti(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(ei(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return xs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const o=e.children[l];if(He(o)||Xt(o))continue;const r=xs(o,t);if(r===0)return 0;r<i&&(i=r)}return i;case 20:return 2;default:return 0}}const Px=new Set([Fc,$c,Wi,rl]);function $h(e,t){if(e.type===14&&!He(e.callee)&&Px.has(e.callee)){const s=e.arguments[0];if(s.type===4)return xs(s,t);if(s.type===14)return $h(s,t)}return 0}function Uh(e,t){let s=3;const n=Bh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:o}=a[i],r=xs(l,t);if(r===0)return r;r<s&&(s=r);let c;if(o.type===4?c=xs(o,t):o.type===14?c=$h(o,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Bh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Mx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:o={},transformHoist:r=null,isBuiltInComponent:c=Vt,isCustomElement:d=Vt,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:m=!1,inSSR:v=!1,ssrCssVars:E="",bindingMetadata:N=Ke,inline:_=!1,isTS:g=!1,onError:y=jc,onWarn:T=Th,compatConfig:k}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:O&&ba(lt(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:o,transformHoist:r,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:m,inSSR:v,ssrCssVars:E,bindingMetadata:N,inline:_,isTS:g,onError:y,onWarn:T,compatConfig:k,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(w){const M=C.helpers.get(w)||0;return C.helpers.set(w,M+1),w},removeHelper(w){const M=C.helpers.get(w);if(M){const A=M-1;A?C.helpers.set(w,A):C.helpers.delete(w)}},helperString(w){return`_${Qa[C.helper(w)]}`},replaceNode(w){C.parent.children[C.childIndex]=C.currentNode=w},removeNode(w){const M=C.parent.children,A=w?M.indexOf(w):C.currentNode?C.childIndex:-1;!w||w===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>A&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(A,1)},onNodeRemoved:Vt,addIdentifiers(w){},removeIdentifiers(w){},hoist(w){He(w)&&(w=je(w)),C.hoists.push(w);const M=je(`_hoisted_${C.hoists.length}`,!1,w.loc,2);return M.hoisted=w,M},cache(w,M=!1,A=!1){const I=lx(C.cached.length,w,M,A);return C.cached.push(I),I}};return C.filters=new Set,C}function Dx(e,t){const s=Mx(e,t);Po(e,s),t.hoistStatic&&Nx(e,s),t.ssr||Fx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Fx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Fh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&zc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Zi(t,s(Ki),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function $x(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];He(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Po(a,t))}}function Po(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(Ce(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(ol);break;case 5:t.ssr||t.helper(Lo);break;case 9:for(let i=0;i<e.branches.length;i++)Po(e.branches[i],t);break;case 10:case 11:case 1:case 0:$x(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Hh(e,t){const s=He(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(gx))return;const l=[];for(let o=0;o<i.length;o++){const r=i[o];if(r.type===7&&s(r.name)){i.splice(o,1),o--;const c=t(n,r,a);c&&l.push(c)}}return l}}}const Mo="/*@__PURE__*/",zh=e=>`${Qa[e]}: _${Qa[e]}`;function Ux(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:o="Vue",runtimeModuleName:r="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:o,runtimeModuleName:r,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(v){return`_${Qa[v]}`},push(v,E=-2,N){f.code+=v},indent(){m(++f.indentLevel)},deindent(v=!1){v?--f.indentLevel:m(--f.indentLevel)},newline(){m(f.indentLevel)}};function m(v){f.push(`
`+"  ".repeat(v),0)}return f}function Bx(e,t={}){const s=Ux(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:o,newline:r,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Hx(e,s);const v=d?"ssrRender":"render",N=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${v}(${N}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(zh).join(", ")} } = _Vue
`,-1),r())),e.components.length&&(tr(e.components,"component",s),(e.directives.length||e.temps>0)&&r()),e.directives.length&&(tr(e.directives,"directive",s),e.temps>0&&r()),e.filters&&e.filters.length&&(r(),tr(e.filters,"filter",s),r()),e.temps>0){a("let ");for(let _=0;_<e.temps;_++)a(`${_>0?", ":""}_temp${_}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),r()),d||a("return "),e.codegenNode?Yt(e.codegenNode,s):a("null"),f&&(o(),a("}")),o(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Hx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:o,ssrRuntimeModuleName:r}=t,c=o,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[Ac,Rc,ol,Ic,_h].filter(p=>d.includes(p)).map(zh).join(", ");a(`const { ${u} } = _Vue
`,-1)}zx(e.hoists,t),i(),a("return ")}function tr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Pc:t==="component"?Oc:Nc);for(let o=0;o<e.length;o++){let r=e[o];const c=r.endsWith("__self");c&&(r=r.slice(0,-6)),n(`const ${Yi(r,t)} = ${l}(${JSON.stringify(r)}${c?", true":""})${i?"!":""}`),o<e.length-1&&a()}}function zx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Yt(i,t),n())}t.pure=!1}function Kc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),cl(e,t,s),s&&t.deindent(),t.push("]")}function cl(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const o=e[l];He(o)?a(o,-3):Ce(o)?Kc(o,t):Yt(o,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Yt(e,t){if(He(e)){t.push(e,-3);return}if(Xt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Yt(e.codegenNode,t);break;case 2:jx(e,t);break;case 4:jh(e,t);break;case 5:Vx(e,t);break;case 12:Yt(e.codegenNode,t);break;case 8:Vh(e,t);break;case 3:Gx(e,t);break;case 13:Kx(e,t);break;case 14:Zx(e,t);break;case 15:Jx(e,t);break;case 17:Yx(e,t);break;case 18:Qx(e,t);break;case 19:Xx(e,t);break;case 20:e0(e,t);break;case 21:cl(e.body,t,!0,!1);break}}function jx(e,t){t.push(JSON.stringify(e.content),-3,e)}function jh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Vx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mo),s(`${n(Lo)}(`),Yt(e.content,t),s(")")}function Vh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];He(n)?t.push(n,-3):Yt(n,t)}}function qx(e,t){const{push:s}=t;if(e.type===8)s("["),Vh(e,t),s("]");else if(e.isStatic){const n=Vc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Gx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Mo),s(`${n(ol)}(${JSON.stringify(e.content)})`,-3,e)}function Kx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:o,patchFlag:r,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let m;r&&(m=String(r)),d&&s(n(Mc)+"("),u&&s(`(${n(ha)}(${p?"true":""}), `),a&&s(Mo);const v=u?ti(t.inSSR,f):ei(t.inSSR,f);s(n(v)+"(",-2,e),cl(Wx([i,l,o,m,c]),t),s(")"),u&&s(")"),d&&(s(", "),Yt(d,t),s(")"))}function Wx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Zx(e,t){const{push:s,helper:n,pure:a}=t,i=He(e.callee)?e.callee:n(e.callee);a&&s(Mo),s(i+"(",-2,e),cl(e.arguments,t),s(")")}function Jx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const o=l.length>1||!1;s(o?"{":"{ "),o&&n();for(let r=0;r<l.length;r++){const{key:c,value:d}=l[r];qx(c,t),s(": "),Yt(d,t),r<l.length-1&&(s(","),i())}o&&a(),s(o?"}":" }")}function Yx(e,t){Kc(e.elements,t)}function Qx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:o,newline:r,isSlot:c}=e;c&&s(`_${Qa[Bc]}(`),s("(",-2,e),Ce(i)?cl(i,t):i&&Yt(i,t),s(") => "),(r||o)&&(s("{"),n()),l?(r&&s("return "),Ce(l)?Kc(l,t):Yt(l,t)):o&&Yt(o,t),(r||o)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Xx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:o,deindent:r,newline:c}=t;if(s.type===4){const u=!Vc(s.content);u&&l("("),jh(s,t),u&&l(")")}else l("("),Yt(s,t),l(")");i&&o(),t.indentLevel++,i||l(" "),l("? "),Yt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Yt(a,t),d||t.indentLevel--,i&&r(!0)}function e0(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:o,needArraySpread:r}=e;r&&s("[...("),s(`_cache[${e.index}] || (`),o&&(a(),s(`${n(so)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Yt(e.value,t),o&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(so)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),r&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const t0=Hh(/^(?:if|else|else-if)$/,(e,t,s)=>s0(e,t,s,(n,a,i)=>{const l=s.parent.children;let o=l.indexOf(n),r=0;for(;o-->=0;){const c=l[o];c&&c.type===9&&(r+=c.branches.length)}return()=>{if(i)n.codegenNode=ru(a,r,s);else{const c=n0(n.codegenNode);c.alternate=ru(a,r+n.branches.length-1,s)}}}));function s0(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ft(28,t.loc)),t.exp=je("true",!1,a)}if(t.name==="if"){const a=ou(e,t),i={type:9,loc:Rx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Lh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ft(30,e.loc)),s.removeNode();const o=ou(e,t);l.branches.push(o);const r=n&&n(l,o,!1);Po(o,s),r&&r(),s.currentNode=null}else s.onError(ft(30,e.loc));break}}}function ou(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!As(e,"for")?e.children:[e],userKey:No(e,"key"),isTemplateIf:s}}function ru(e,t,s){return e.condition?Fr(e.condition,cu(e,t,s),Lt(s.helper(ol),['""',"true"])):cu(e,t,s)}function cu(e,t,s){const{helper:n}=s,a=Et("key",je(`${t}`,!1,Ss,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const r=l.codegenNode;return lo(r,a,s),r}else return Zi(s,n(Ki),Rs([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const r=l.codegenNode,c=yx(r);return c.type===13&&zc(c,s),lo(c,a,s),r}}function n0(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const a0=Hh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return i0(e,t,s,i=>{const l=Lt(n(Dc),[i.source]),o=ao(e),r=As(e,"memo"),c=No(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?je(c.value.content,!0):void 0:c.exp);const u=d?Et("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Zi(s,n(Ki),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let m;const{children:v}=i,E=v.length!==1||v[0].type!==1,N=io(e)?e:o&&e.children.length===1&&io(e.children[0])?e.children[0]:null;if(N?(m=N.codegenNode,o&&u&&lo(m,u,s)):E?m=Zi(s,n(Ki),u?Rs([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(m=v[0].codegenNode,o&&u&&lo(m,u,s),m.isBlock!==!p&&(m.isBlock?(a(ha),a(ti(s.inSSR,m.isComponent))):a(ei(s.inSSR,m.isComponent))),m.isBlock=!p,m.isBlock?(n(ha),n(ti(s.inSSR,m.isComponent))):n(ei(s.inSSR,m.isComponent))),r){const _=Xa(Br(i.parseResult,[je("_cached")]));_.body=ox([Us(["const _memo = (",r.exp,")"]),Us(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(Sh)}(_cached, _memo)) return _cached`]),Us(["const _item = ",m]),je("_item.memo = _memo"),je("return _item")]),l.arguments.push(_,je("_cache"),je(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Xa(Br(i.parseResult),m,!0))}})});function i0(e,t,s,n){if(!t.exp){s.onError(ft(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ft(32,t.loc));return}qh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:o}=s,{source:r,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:r,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:ao(e)?e.children:[e]};s.replaceNode(p),o.vFor++;const f=n&&n(p);return()=>{o.vFor--,f&&f()}}function qh(e,t){e.finalized||(e.finalized=!0)}function Br({value:e,key:t,index:s},n=[]){return l0([e,t,s,...n])}function l0(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||je("_".repeat(n+1),!1))}const du=je("undefined",!1),o0=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=As(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},r0=(e,t,s,n)=>Xa(e,s,!1,!0,s.length?s[0].loc:n);function c0(e,t,s=r0){t.helper(Bc);const{children:n,loc:a}=e,i=[],l=[];let o=t.scopes.vSlot>0||t.scopes.vFor>0;const r=As(e,"slot",!0);if(r){const{arg:E,exp:N}=r;E&&!hs(E)&&(o=!0),i.push(Et(E||je("default",!0),s(N,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let E=0;E<n.length;E++){const N=n[E];let _;if(!ao(N)||!(_=As(N,"slot",!0))){N.type!==3&&u.push(N);continue}if(r){t.onError(ft(37,_.loc));break}c=!0;const{children:g,loc:y}=N,{arg:T=je("default",!0),exp:k,loc:O}=_;let C;hs(T)?C=T?T.content:"default":o=!0;const w=As(N,"for"),M=s(k,w,g,y);let A,I;if(A=As(N,"if"))o=!0,l.push(Fr(A.exp,kl(T,M,f++),du));else if(I=As(N,/^else(?:-if)?$/,!0)){let $=E,F;for(;$--&&(F=n[$],!!Lh(F)););if(F&&ao(F)&&As(F,/^(?:else-)?if$/)){let se=l[l.length-1];for(;se.alternate.type===19;)se=se.alternate;se.alternate=I.exp?Fr(I.exp,kl(T,M,f++),du):kl(T,M,f++)}else t.onError(ft(30,I.loc))}else if(w){o=!0;const $=w.forParseResult;$?(qh($),l.push(Lt(t.helper(Dc),[$.source,Xa(Br($),kl(T,M),!0)]))):t.onError(ft(32,w.loc))}else{if(C){if(p.has(C)){t.onError(ft(38,O));continue}p.add(C),C==="default"&&(d=!0)}i.push(Et(T,M))}}if(!r){const E=(N,_)=>{const g=s(N,void 0,_,a);return t.compatConfig&&(g.isNonScopedSlot=!0),Et("default",g)};c?u.length&&!u.every(qc)&&(d?t.onError(ft(39,u[0].loc)):i.push(E(void 0,u))):i.push(E(void 0,n))}const m=o?2:Pl(e.children)?3:1;let v=Rs(i.concat(Et("_",je(m+"",!1))),a);return l.length&&(v=Lt(t.helper(kh),[v,da(l)])),{slots:v,hasDynamicSlots:o}}function kl(e,t,s){const n=[Et("name",e),Et("fn",t)];return s!=null&&n.push(Et("key",je(String(s),!0))),Rs(n)}function Pl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Pl(s.children))return!0;break;case 9:if(Pl(s.branches))return!0;break;case 10:case 11:if(Pl(s.children))return!0;break}}return!1}const Gh=new WeakMap,d0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?u0(e,t):`"${n}"`;const o=et(l)&&l.callee===Lc;let r,c,d=0,u,p,f,m=o||l===Oi||l===Ec||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const v=Kh(e,t,void 0,i,o);r=v.props,d=v.patchFlag,p=v.dynamicPropNames;const E=v.directives;f=E&&E.length?da(E.map(N=>f0(N,t))):void 0,v.shouldUseBlock&&(m=!0)}if(e.children.length>0)if(l===eo&&(m=!0,d|=1024),i&&l!==Oi&&l!==eo){const{slots:E,hasDynamicSlots:N}=c0(e,t);c=E,N&&(d|=1024)}else if(e.children.length===1&&l!==Oi){const E=e.children[0],N=E.type,_=N===5||N===8;_&&xs(E,t)===0&&(d|=1),_||N===2?c=E:c=e.children}else c=e.children;p&&p.length&&(u=h0(p)),e.codegenNode=Zi(t,l,r,c,d===0?void 0:d,u,f,!!m,!1,i,e.loc)};function u0(e,t,s=!1){let{tag:n}=e;const a=Hr(n),i=No(e,"is",!1,!0);if(i)if(a||ua("COMPILER_IS_ON_ELEMENT",t)){let o;if(i.type===6?o=i.value&&je(i.value.content,!0):(o=i.exp,o||(o=je("is",!1,i.arg.loc))),o)return Lt(t.helper(Lc),[o])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=Ch(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Oc),t.components.add(n),Yi(n,"component"))}function Kh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:o,children:r}=e;let c=[];const d=[],u=[],p=r.length>0;let f=!1,m=0,v=!1,E=!1,N=!1,_=!1,g=!1,y=!1;const T=[],k=M=>{c.length&&(d.push(Rs(uu(c),o)),c=[]),M&&d.push(M)},O=()=>{t.scopes.vFor>0&&c.push(Et(je("ref_for",!0),je("true")))},C=({key:M,value:A})=>{if(hs(M)){const I=M.content,$=va(I);if($&&(!n||a)&&I.toLowerCase()!=="onclick"&&I!=="onUpdate:modelValue"&&!xn(I)&&(_=!0),$&&xn(I)&&(y=!0),$&&A.type===14&&(A=A.arguments[0]),A.type===20||(A.type===4||A.type===8)&&xs(A,t)>0)return;I==="ref"?v=!0:I==="class"?E=!0:I==="style"?N=!0:I!=="key"&&!T.includes(I)&&T.push(I),n&&(I==="class"||I==="style")&&!T.includes(I)&&T.push(I)}else g=!0};for(let M=0;M<s.length;M++){const A=s[M];if(A.type===6){const{loc:I,name:$,nameLoc:F,value:se}=A;let B=!0;if($==="ref"&&(v=!0,O()),$==="is"&&(Hr(l)||se&&se.content.startsWith("vue:")||ua("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(Et(je($,!0,F),je(se?se.content:"",B,se?se.loc:I)))}else{const{name:I,arg:$,exp:F,loc:se,modifiers:B}=A,S=I==="bind",R=I==="on";if(I==="slot"){n||t.onError(ft(40,se));continue}if(I==="once"||I==="memo"||I==="is"||S&&aa($,"is")&&(Hr(l)||ua("COMPILER_IS_ON_ELEMENT",t))||R&&i)continue;if((S&&aa($,"key")||R&&p&&aa($,"vue:before-update"))&&(f=!0),S&&aa($,"ref")&&O(),!$&&(S||R)){if(g=!0,F)if(S){if(k(),ua("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(F);continue}O(),k(),d.push(F)}else k({type:14,loc:se,callee:t.helper(Uc),arguments:n?[F]:[F,"true"]});else t.onError(ft(S?34:35,se));continue}S&&B.some(ee=>ee.content==="prop")&&(m|=32);const W=t.directiveTransforms[I];if(W){const{props:ee,needRuntime:he}=W(A,e,t);!i&&ee.forEach(C),R&&$&&!hs($)?k(Rs(ee,o)):c.push(...ee),he&&(u.push(A),Xt(he)&&Gh.set(A,he))}else av(I)||(u.push(A),p&&(f=!0))}}let w;if(d.length?(k(),d.length>1?w=Lt(t.helper(to),d,o):w=d[0]):c.length&&(w=Rs(uu(c),o)),g?m|=16:(E&&!n&&(m|=2),N&&!n&&(m|=4),T.length&&(m|=8),_&&(m|=32)),!f&&(m===0||m===32)&&(v||y||u.length>0)&&(m|=512),!t.inSSR&&w)switch(w.type){case 15:let M=-1,A=-1,I=!1;for(let se=0;se<w.properties.length;se++){const B=w.properties[se].key;hs(B)?B.content==="class"?M=se:B.content==="style"&&(A=se):B.isHandlerKey||(I=!0)}const $=w.properties[M],F=w.properties[A];I?w=Lt(t.helper(Wi),[w]):($&&!hs($.value)&&($.value=Lt(t.helper(Fc),[$.value])),F&&(N||F.value.type===4&&F.value.content.trim()[0]==="["||F.value.type===17)&&(F.value=Lt(t.helper($c),[F.value])));break;case 14:break;default:w=Lt(t.helper(Wi),[Lt(t.helper(rl),[w])]);break}return{props:w,directives:u,patchFlag:m,dynamicPropNames:T,shouldUseBlock:f}}function uu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||va(i))&&p0(l,a):(t.set(i,a),s.push(a))}return s}function p0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=da([e.value,t.value],e.loc)}function f0(e,t){const s=[],n=Gh.get(e);n?s.push(t.helperString(n)):(t.helper(Nc),t.directives.add(e.name),s.push(Yi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=je("true",!1,a);s.push(Rs(e.modifiers.map(l=>Et(l,i)),a))}return da(s,e.loc)}function h0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Hr(e){return e==="component"||e==="Component"}const m0=(e,t)=>{if(io(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=v0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let o=2;i&&(l[2]=i,o=3),s.length&&(l[3]=Xa([],s,!1,!1,n),o=4),t.scopeId&&!t.slotted&&(o=5),l.splice(o),e.codegenNode=Lt(t.helper(wh),l,n)}};function v0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=lt(l.name),a.push(l)));else if(l.name==="bind"&&aa(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const o=lt(l.arg.content);s=l.exp=je(o,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&hs(l.arg)&&(l.arg.content=lt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Kh(e,t,a,!1,!1);n=i,l.length&&t.onError(ft(36,l[0].loc))}return{slotName:s,slotProps:n}}const Wh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ft(35,a));let o;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ua(lt(u)):`on:${u}`;o=je(p,!0,l.loc)}else o=Us([`${s.helperString(Dr)}(`,l,")"]);else o=l,o.children.unshift(`${s.helperString(Dr)}(`),o.children.push(")");let r=e.exp;r&&!r.content.trim()&&(r=void 0);let c=s.cacheHandlers&&!r&&!s.inVOnce;if(r){const u=Rh(r),p=!(u||mx(r)),f=r.content.includes(";");(p||c&&u)&&(r=Us([`${p?"$event":"(...args)"} => ${f?"{":"("}`,r,f?"}":")"]))}let d={props:[Et(o,r||je("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},g0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(o=>o.content==="camel")&&(i.type===4?i.isStatic?i.content=lt(i.content):i.content=`${s.helperString(Mr)}(${i.content})`:(i.children.unshift(`${s.helperString(Mr)}(`),i.children.push(")"))),s.inSSR||(n.some(o=>o.content==="prop")&&pu(i,"."),n.some(o=>o.content==="attr")&&pu(i,"^")),{props:[Et(i,l)]}},pu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},b0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(er(l)){a=!0;for(let o=i+1;o<s.length;o++){const r=s[o];if(er(r))n||(n=s[i]=Us([l],l.loc)),n.children.push(" + ",r),s.splice(o,1),o--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(er(l)||l.type===8){const o=[];(l.type!==2||l.content!==" ")&&o.push(l),!t.ssr&&xs(l,t)===0&&o.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Lt(t.helper(Ic),o)}}}}},fu=new WeakSet,y0=(e,t)=>{if(e.type===1&&As(e,"once",!0))return fu.has(e)||t.inVOnce||t.inSSR?void 0:(fu.add(e),t.inVOnce=!0,t.helper(so),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Zh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ft(41,e.loc)),mi();const i=n.loc.source.trim(),l=n.type===4?n.content:i,o=s.bindingMetadata[i];if(o==="props"||o==="props-aliased")return s.onError(ft(44,n.loc)),mi();if(o==="literal-const"||o==="setup-const")return s.onError(ft(45,n.loc)),mi();if(!l.trim()||!Rh(n))return s.onError(ft(42,n.loc)),mi();const r=a||je("modelValue",!0),c=a?hs(a)?`onUpdate:${lt(a.content)}`:Us(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Us([`${u} => ((`,n,") = $event)"]);const p=[Et(r,e.exp),Et(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(v=>v.content).map(v=>(Vc(v)?v:JSON.stringify(v))+": true").join(", "),m=a?hs(a)?`${a.content}Modifiers`:Us([a,' + "Modifiers"']):"modelModifiers";p.push(Et(m,je(`{ ${f} }`,!1,e.loc,2)))}return mi(p)};function mi(e=[]){return{props:e}}const x0=/[\w).+\-_$\]]/,_0=(e,t)=>{ua("COMPILER_FILTERS",t)&&(e.type===5?oo(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&oo(s.exp,t)}))};function oo(e,t){if(e.type===4)hu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?hu(n,t):n.type===8?oo(e,t):n.type===5&&oo(n.content,t))}}function hu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,o=0,r=0,c=0,d=0,u,p,f,m,v=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!o&&!r&&!c)m===void 0?(d=f+1,m=s.slice(0,f).trim()):E();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:r++;break;case 93:r--;break;case 123:o++;break;case 125:o--;break}if(u===47){let N=f-1,_;for(;N>=0&&(_=s.charAt(N),_===" ");N--);(!_||!x0.test(_))&&(l=!0)}}m===void 0?m=s.slice(0,f).trim():d!==0&&E();function E(){v.push(s.slice(d,f).trim()),d=f+1}if(v.length){for(f=0;f<v.length;f++)m=w0(m,v[f],t);e.content=m,e.ast=void 0}}function w0(e,t,s){s.helper(Pc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Yi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Yi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const mu=new WeakSet,k0=(e,t)=>{if(e.type===1){const s=As(e,"memo");return!s||mu.has(e)||t.inSSR?void 0:(mu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&zc(n,t),e.codegenNode=Lt(t.helper(Hc),[s.exp,Xa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},S0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ft(53,n.loc)),s.exp=je("",!0,n.loc);else{const a=lt(n.content);(Eh.test(a[0])||a[0]==="-")&&(s.exp=je(a,!1,n.loc))}}}};function T0(e){return[[S0,y0,t0,k0,a0,_0,m0,d0,o0,b0],{on:Wh,bind:g0,model:Zh}]}function C0(e,t={}){const s=t.onError||jc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ft(48)):n&&s(ft(49));const a=!1;t.cacheHandlers&&s(ft(50)),t.scopeId&&!n&&s(ft(51));const i=Ge({},t,{prefixIdentifiers:a}),l=He(e)?Lx(e,i):e,[o,r]=T0();return Dx(l,Ge({},i,{nodeTransforms:[...o,...t.nodeTransforms||[]],directiveTransforms:Ge({},r,t.directiveTransforms||{})})),Bx(l,i)}const E0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Jh=Symbol(""),Yh=Symbol(""),Qh=Symbol(""),Xh=Symbol(""),zr=Symbol(""),em=Symbol(""),tm=Symbol(""),sm=Symbol(""),nm=Symbol(""),am=Symbol("");ax({[Jh]:"vModelRadio",[Yh]:"vModelCheckbox",[Qh]:"vModelText",[Xh]:"vModelSelect",[zr]:"vModelDynamic",[em]:"withModifiers",[tm]:"withKeys",[sm]:"vShow",[nm]:"Transition",[am]:"TransitionGroup"});let Ea;function A0(e,t=!1){return Ea||(Ea=document.createElement("div")),t?(Ea.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,Ea.children[0].getAttribute("foo")):(Ea.innerHTML=e,Ea.textContent)}const R0={parseMode:"html",isVoidTag:_v,isNativeTag:e=>bv(e)||yv(e)||xv(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:A0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return nm;if(e==="TransitionGroup"||e==="transition-group")return am},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},I0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:je("style",!0,t.loc),exp:O0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},O0=(e,t)=>{const s=vp(e);return je(JSON.stringify(s),!1,t,3)};function jn(e,t){return ft(e,t)}const L0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(54,a)),t.children.length&&(s.onError(jn(55,a)),t.children.length=0),{props:[Et(je("innerHTML",!0,a),n||je("",!0))]}},N0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(56,a)),t.children.length&&(s.onError(jn(57,a)),t.children.length=0),{props:[Et(je("textContent",!0),n?xs(n,s)>0?n:Lt(s.helperString(Lo),[n],a):je("",!0))]}},P0=(e,t,s)=>{const n=Zh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(jn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Qh,o=!1;if(a==="input"||i){const r=No(t,"type");if(r){if(r.type===7)l=zr;else if(r.value)switch(r.value.content){case"radio":l=Jh;break;case"checkbox":l=Yh;break;case"file":o=!0,s.onError(jn(60,e.loc));break}}else vx(t)&&(l=zr)}else a==="select"&&(l=Xh);o||(n.needRuntime=s.helper(l))}else s.onError(jn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},M0=ws("passive,once,capture"),D0=ws("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),F0=ws("left,right"),im=ws("onkeyup,onkeydown,onkeypress"),$0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let o=0;o<t.length;o++){const r=t[o].content;r==="native"&&Ji("COMPILER_V_ON_NATIVE",s)||M0(r)?l.push(r):F0(r)?hs(e)?im(e.content.toLowerCase())?a.push(r):i.push(r):(a.push(r),i.push(r)):D0(r)?i.push(r):a.push(r)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},vu=(e,t)=>hs(e)&&e.content.toLowerCase()==="onclick"?je(t,!0):e.type!==4?Us(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,U0=(e,t,s)=>Wh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:o,nonKeyModifiers:r,eventOptionModifiers:c}=$0(i,a,s,e.loc);if(r.includes("right")&&(i=vu(i,"onContextmenu")),r.includes("middle")&&(i=vu(i,"onMouseup")),r.length&&(l=Lt(s.helper(em),[l,JSON.stringify(r)])),o.length&&(!hs(i)||im(i.content.toLowerCase()))&&(l=Lt(s.helper(tm),[l,JSON.stringify(o)])),c.length){const d=c.map(ba).join("");i=hs(i)?je(`${i.content}${d}`,!0):Us(["(",i,`) + "${d}"`])}return{props:[Et(i,l)]}}),B0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(jn(62,a)),{props:[],needRuntime:s.helper(sm)}},H0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},z0=[I0],j0={cloak:E0,html:L0,text:N0,model:P0,on:U0,show:B0};function V0(e,t={}){return C0(e,Ge({},R0,t,{nodeTransforms:[H0,...z0,...t.nodeTransforms||[]],directiveTransforms:Ge({},j0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const gu=Object.create(null);function q0(e,t){if(!He(e))if(e.nodeType)e=e.innerHTML;else return Vt;const s=ov(e,t),n=gu[s];if(n)return n;if(e[0]==="#"){const o=document.querySelector(e);e=o?o.innerHTML:""}const a=Ge({hoistStatic:!0,onError:void 0,onWarn:Vt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=o=>!!customElements.get(o));const{code:i}=V0(e,a),l=new Function("Vue",i)(Qy);return l._rc=!0,gu[s]=l}zf(q0);const ro=qn({items:[]});let G0=1;function Do(e,t="info",s=3e3){const n=G0++;return ro.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Wc(n),s),n}function Wc(e){const t=ro.items.findIndex(s=>s.id===e);t>=0&&ro.items.splice(t,1)}function Re(e,t="info",s=3e3){return Do(e,t,s)}Re.success=(e,t=3e3)=>Do(e,"success",t);Re.error=(e,t=5e3)=>Do(e,"error",t);Re.info=(e,t=3e3)=>Do(e,"info",t);Re.dismiss=Wc;const K0={setup(){return{state:ro,dismiss:Wc}},template:`
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
  `},hn=qn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let qa=null;function Qt({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return qa&&qa(!1),hn.title=e,hn.message=t,hn.confirmLabel=s,hn.cancelLabel=n,hn.danger=a,hn.open=!0,new Promise(i=>{qa=i})}function bu(e){hn.open=!1,qa&&(qa(e),qa=null)}const W0={setup(){function e(t){hn.open&&t.key==="Escape"&&(t.stopPropagation(),bu(!1))}return Ze(()=>document.addEventListener("keydown",e,!0)),mt(()=>document.removeEventListener("keydown",e,!0)),{state:hn,settle:bu}},template:`
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
 */const Na=typeof document<"u";function lm(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function Z0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&lm(e.default)}const nt=Object.assign;function sr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Hs(a)?a.map(e):e(a)}return s}const Li=()=>{},Hs=Array.isArray;function yu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const om=/#/g,J0=/&/g,Y0=/\//g,Q0=/=/g,X0=/\?/g,rm=/\+/g,e_=/%5B/g,t_=/%5D/g,cm=/%5E/g,s_=/%60/g,dm=/%7B/g,n_=/%7C/g,um=/%7D/g,a_=/%20/g;function Zc(e){return e==null?"":encodeURI(""+e).replace(n_,"|").replace(e_,"[").replace(t_,"]")}function i_(e){return Zc(e).replace(dm,"{").replace(um,"}").replace(cm,"^")}function jr(e){return Zc(e).replace(rm,"%2B").replace(a_,"+").replace(om,"%23").replace(J0,"%26").replace(s_,"`").replace(dm,"{").replace(um,"}").replace(cm,"^")}function l_(e){return jr(e).replace(Q0,"%3D")}function o_(e){return Zc(e).replace(om,"%23").replace(X0,"%3F")}function r_(e){return o_(e).replace(Y0,"%2F")}function Xi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const c_=/\/$/,d_=e=>e.replace(c_,"");function nr(e,t,s="/"){let n,a={},i="",l="";const o=t.indexOf("#");let r=t.indexOf("?");return r=o>=0&&r>o?-1:r,r>=0&&(n=t.slice(0,r),i=t.slice(r,o>0?o:t.length),a=e(i.slice(1))),o>=0&&(n=n||t.slice(0,o),l=t.slice(o,t.length)),n=h_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Xi(l)}}function u_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function xu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function p_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&si(t.matched[n],s.matched[a])&&pm(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function si(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function pm(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!f_(e[s],t[s]))return!1;return!0}function f_(e,t){return Hs(e)?_u(e,t):Hs(t)?_u(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function _u(e,t){return Hs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function h_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,o;for(l=0;l<n.length;l++)if(o=n[l],o!==".")if(o==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Mn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Vr=(function(e){return e.pop="pop",e.push="push",e})({}),ar=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function m_(e){if(!e)if(Na){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),d_(e)}const v_=/^[^#]+#/;function g_(e,t){return e.replace(v_,"#")+t}function b_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Fo=()=>({left:window.scrollX,top:window.scrollY});function y_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=b_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function wu(e,t){return(history.state?history.state.position-t:-1)+e}const qr=new Map;function x_(e,t){qr.set(e,t)}function __(e){const t=qr.get(e);return qr.delete(e),t}function w_(e){return typeof e=="string"||e&&typeof e=="object"}function fm(e){return typeof e=="string"||typeof e=="symbol"}let yt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const hm=Symbol("");yt.MATCHER_NOT_FOUND+"",yt.NAVIGATION_GUARD_REDIRECT+"",yt.NAVIGATION_ABORTED+"",yt.NAVIGATION_CANCELLED+"",yt.NAVIGATION_DUPLICATED+"";function ni(e,t){return nt(new Error,{type:e,[hm]:!0},t)}function cn(e,t){return e instanceof Error&&hm in e&&(t==null||!!(e.type&t))}const k_=["params","query","hash"];function S_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of k_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function T_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(rm," "),i=a.indexOf("="),l=Xi(i<0?a:a.slice(0,i)),o=i<0?null:Xi(a.slice(i+1));if(l in t){let r=t[l];Hs(r)||(r=t[l]=[r]),r.push(o)}else t[l]=o}return t}function ku(e){let t="";for(let s in e){const n=e[s];if(s=l_(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Hs(n)?n.map(a=>a&&jr(a)):[n&&jr(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function C_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Hs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const E_=Symbol(""),Su=Symbol(""),$o=Symbol(""),Jc=Symbol(""),Gr=Symbol("");function vi(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Hn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((o,r)=>{const c=p=>{p===!1?r(ni(yt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?r(p):w_(p)?r(ni(yt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),o())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>r(p))})}function ir(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const o in l.components){let r=l.components[o];if(!(t!=="beforeRouteEnter"&&!l.instances[o]))if(lm(r)){const c=(r.__vccOpts||r)[t];c&&i.push(Hn(c,s,n,l,o,a))}else{let c=r();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${o}" at "${l.path}"`);const u=Z0(d)?d.default:d;l.mods[o]=d,l.components[o]=u;const p=(u.__vccOpts||u)[t];return p&&Hn(p,s,n,l,o,a)()}))}}return i}function A_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const o=t.matched[l];o&&(e.matched.find(c=>si(c,o))?n.push(o):s.push(o));const r=e.matched[l];r&&(t.matched.find(c=>si(c,r))||a.push(r))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let R_=()=>location.protocol+"//"+location.host;function mm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,o=a.slice(l);return o[0]!=="/"&&(o="/"+o),xu(o,"")}return xu(s,e)+n+a}function I_(e,t,s,n){let a=[],i=[],l=null;const o=({state:p})=>{const f=mm(e,location),m=s.value,v=t.value;let E=0;if(p){if(s.value=f,t.value=p,l&&l===m){l=null;return}E=v?p.position-v.position:0}else n(f);a.forEach(N=>{N(s.value,m,{delta:E,type:Vr.pop,direction:E?E>0?ar.forward:ar.back:ar.unknown})})};function r(){l=s.value}function c(p){a.push(p);const f=()=>{const m=a.indexOf(p);m>-1&&a.splice(m,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(nt({},p.state,{scroll:Fo()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",o),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",o),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:r,listen:c,destroy:u}}function Tu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Fo():null}}function O_(e){const{history:t,location:s}=window,n={value:mm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(r,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+r:R_()+e+r;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(r,c){i(r,nt({},t.state,Tu(a.value.back,r,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=r}function o(r,c){const d=nt({},a.value,t.state,{forward:r,scroll:Fo()});i(d.current,d,!0),i(r,nt({},Tu(n.value,r,null),{position:d.position+1},c),!1),n.value=r}return{location:n,state:a,push:o,replace:l}}function L_(e){e=m_(e);const t=O_(e),s=I_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:g_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function N_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),L_(e)}let la=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var It=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(It||{});const P_={type:la.Static,value:""},M_=/[a-zA-Z0-9_]/;function D_(e){if(!e)return[[]];if(e==="/")return[[P_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=It.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let o=0,r,c="",d="";function u(){c&&(s===It.Static?i.push({type:la.Static,value:c}):s===It.Param||s===It.ParamRegExp||s===It.ParamRegExpEnd?(i.length>1&&(r==="*"||r==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:la.Param,value:c,regexp:d,repeatable:r==="*"||r==="+",optional:r==="*"||r==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=r}for(;o<e.length;){if(r=e[o++],r==="\\"&&s!==It.ParamRegExp){n=s,s=It.EscapeNext;continue}switch(s){case It.Static:r==="/"?(c&&u(),l()):r===":"?(u(),s=It.Param):p();break;case It.EscapeNext:p(),s=n;break;case It.Param:r==="("?s=It.ParamRegExp:M_.test(r)?p():(u(),s=It.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--);break;case It.ParamRegExp:r===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+r:s=It.ParamRegExpEnd:d+=r;break;case It.ParamRegExpEnd:u(),s=It.Static,r!=="*"&&r!=="?"&&r!=="+"&&o--,d="";break;default:t("Unknown state");break}}return s===It.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const Cu="[^/]+?",F_={sensitive:!1,strict:!1,start:!0,end:!0};var ns=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(ns||{});const $_=/[.+*?^${}()[\]/\\]/g;function U_(e,t){const s=nt({},F_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[ns.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=ns.Segment+(s.sensitive?ns.BonusCaseSensitive:0);if(p.type===la.Static)u||(a+="/"),a+=p.value.replace($_,"\\$&"),f+=ns.Static;else if(p.type===la.Param){const{value:m,repeatable:v,optional:E,regexp:N}=p;i.push({name:m,repeatable:v,optional:E});const _=N||Cu;if(_!==Cu){f+=ns.BonusCustomRegExp;try{`${_}`}catch(y){throw new Error(`Invalid custom RegExp for param "${m}" (${_}): `+y.message)}}let g=v?`((?:${_})(?:/(?:${_}))*)`:`(${_})`;u||(g=E&&c.length<2?`(?:/${g})`:"/"+g),E&&(g+="?"),a+=g,f+=ns.Dynamic,E&&(f+=ns.BonusOptional),v&&(f+=ns.BonusRepeatable),_===".*"&&(f+=ns.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=ns.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function o(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",m=i[p-1];u[m.name]=f&&m.repeatable?f.split("/"):f}return u}function r(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===la.Static)d+=f.value;else if(f.type===la.Param){const{value:m,repeatable:v,optional:E}=f,N=m in c?c[m]:"";if(Hs(N)&&!v)throw new Error(`Provided param "${m}" is an array but it is not repeatable (* or + modifiers)`);const _=Hs(N)?N.join("/"):N;if(!_)if(E)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${m}"`);d+=_}}return d||"/"}return{re:l,score:n,keys:i,parse:o,stringify:r}}function B_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===ns.Static+ns.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===ns.Static+ns.Segment?1:-1:0}function vm(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=B_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Eu(n))return 1;if(Eu(a))return-1}return a.length-n.length}function Eu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const H_={strict:!1,end:!0,sensitive:!1};function z_(e,t,s){const n=U_(D_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function j_(e,t){const s=[],n=new Map;t=yu(H_,t);function a(u){return n.get(u)}function i(u,p,f){const m=!f,v=Ru(u);v.aliasOf=f&&f.record;const E=yu(t,u),N=[v];if("alias"in u){const y=typeof u.alias=="string"?[u.alias]:u.alias;for(const T of y)N.push(Ru(nt({},v,{components:f?f.record.components:v.components,path:T,aliasOf:f?f.record:v})))}let _,g;for(const y of N){const{path:T}=y;if(p&&T[0]!=="/"){const k=p.record.path,O=k[k.length-1]==="/"?"":"/";y.path=p.record.path+(T&&O+T)}if(_=z_(y,p,E),f?f.alias.push(_):(g=g||_,g!==_&&g.alias.push(_),m&&u.name&&!Iu(_)&&l(u.name)),gm(_)&&r(_),v.children){const k=v.children;for(let O=0;O<k.length;O++)i(k[O],_,f&&f.children[O])}f=f||_}return g?()=>{l(g)}:Li}function l(u){if(fm(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function o(){return s}function r(u){const p=G_(u,s);s.splice(p,0,u),u.record.name&&!Iu(u)&&n.set(u.record.name,u)}function c(u,p){let f,m={},v,E;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw ni(yt.MATCHER_NOT_FOUND,{location:u});E=f.record.name,m=nt(Au(p.params,f.keys.filter(g=>!g.optional).concat(f.parent?f.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Au(u.params,f.keys.map(g=>g.name))),v=f.stringify(m)}else if(u.path!=null)v=u.path,f=s.find(g=>g.re.test(v)),f&&(m=f.parse(v),E=f.record.name);else{if(f=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!f)throw ni(yt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});E=f.record.name,m=nt({},p.params,u.params),v=f.stringify(m)}const N=[];let _=f;for(;_;)N.unshift(_.record),_=_.parent;return{name:E,path:v,params:m,matched:N,meta:q_(N)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:o,getRecordMatcher:a}}function Au(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Ru(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:V_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function V_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Iu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function q_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function G_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;vm(e,t[i])<0?n=i:s=i+1}const a=K_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function K_(e){let t=e;for(;t=t.parent;)if(gm(t)&&vm(e,t)===0)return t}function gm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Ou(e){const t=Is($o),s=Is(Jc),n=Z(()=>{const r=tn(e.to);return t.resolve(r)}),a=Z(()=>{const{matched:r}=n.value,{length:c}=r,d=r[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(si.bind(null,d));if(p>-1)return p;const f=Lu(r[c-2]);return c>1&&Lu(d)===f&&u[u.length-1].path!==f?u.findIndex(si.bind(null,r[c-2])):p}),i=Z(()=>a.value>-1&&Q_(s.params,n.value.params)),l=Z(()=>a.value>-1&&a.value===s.matched.length-1&&pm(s.params,n.value.params));function o(r={}){if(Y_(r)){const c=t[tn(e.replace)?"replace":"push"](tn(e.to)).catch(Li);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:Z(()=>n.value.href),isActive:i,isExactActive:l,navigate:o}}function W_(e){return e.length===1?e[0]:e}const Z_=al({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Ou,setup(e,{slots:t}){const s=qn(Ou(e)),{options:n}=Is($o),a=Z(()=>({[Nu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Nu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&W_(t.default(s));return e.custom?i:Za("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),J_=Z_;function Y_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function Q_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Hs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Lu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Nu=(e,t,s)=>e??t??s,X_=al({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Is(Gr),a=Z(()=>e.route||n.value),i=Is(Su,0),l=Z(()=>{let c=tn(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),o=Z(()=>a.value.matched[l.value]);Ei(Su,Z(()=>l.value+1)),Ei(E_,o),Ei(Gr,a);const r=h();return ls(()=>[r.value,o.value,e.name],([c,d,u],[p,f,m])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!si(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(v=>v(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=o.value,p=u&&u.components[d];if(!p)return Pu(s.default,{Component:p,route:c});const f=u.props[d],m=f?f===!0?c.params:typeof f=="function"?f(c):f:null,E=Za(p,nt({},m,t,{onVnodeUnmounted:N=>{N.component.isUnmounted&&(u.instances[d]=null)},ref:r}));return Pu(s.default,{Component:E,route:c})||E}}});function Pu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const ew=X_;function tw(e){const t=j_(e.routes,e),s=e.parseQuery||T_,n=e.stringifyQuery||ku,a=e.history,i=vi(),l=vi(),o=vi(),r=lc(Mn);let c=Mn;Na&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=sr.bind(null,K=>""+K),u=sr.bind(null,r_),p=sr.bind(null,Xi);function f(K,ge){let H,ie;return fm(K)?(H=t.getRecordMatcher(K),ie=ge):ie=K,t.addRoute(ie,H)}function m(K){const ge=t.getRecordMatcher(K);ge&&t.removeRoute(ge)}function v(){return t.getRoutes().map(K=>K.record)}function E(K){return!!t.getRecordMatcher(K)}function N(K,ge){if(ge=nt({},ge||r.value),typeof K=="string"){const P=nr(s,K,ge.path),U=t.resolve({path:P.path},ge),ne=a.createHref(P.fullPath);return nt(P,U,{params:p(U.params),hash:Xi(P.hash),redirectedFrom:void 0,href:ne})}let H;if(K.path!=null)H=nt({},K,{path:nr(s,K.path,ge.path).path});else{const P=nt({},K.params);for(const U in P)P[U]==null&&delete P[U];H=nt({},K,{params:u(P)}),ge.params=u(ge.params)}const ie=t.resolve(H,ge),de=K.hash||"";ie.params=d(p(ie.params));const Oe=u_(n,nt({},K,{hash:i_(de),path:ie.path})),x=a.createHref(Oe);return nt({fullPath:Oe,hash:de,query:n===ku?C_(K.query):K.query||{}},ie,{redirectedFrom:void 0,href:x})}function _(K){return typeof K=="string"?nr(s,K,r.value.path):nt({},K)}function g(K,ge){if(c!==K)return ni(yt.NAVIGATION_CANCELLED,{from:ge,to:K})}function y(K){return O(K)}function T(K){return y(nt(_(K),{replace:!0}))}function k(K,ge){const H=K.matched[K.matched.length-1];if(H&&H.redirect){const{redirect:ie}=H;let de=typeof ie=="function"?ie(K,ge):ie;return typeof de=="string"&&(de=de.includes("?")||de.includes("#")?de=_(de):{path:de},de.params={}),nt({query:K.query,hash:K.hash,params:de.path!=null?{}:K.params},de)}}function O(K,ge){const H=c=N(K),ie=r.value,de=K.state,Oe=K.force,x=K.replace===!0,P=k(H,ie);if(P)return O(nt(_(P),{state:typeof P=="object"?nt({},de,P.state):de,force:Oe,replace:x}),ge||H);const U=H;U.redirectedFrom=ge;let ne;return!Oe&&p_(n,ie,H)&&(ne=ni(yt.NAVIGATION_DUPLICATED,{to:U,from:ie}),he(ie,ie,!0,!1)),(ne?Promise.resolve(ne):M(U,ie)).catch(Q=>cn(Q)?cn(Q,yt.NAVIGATION_GUARD_REDIRECT)?Q:ee(Q):R(Q,U,ie)).then(Q=>{if(Q){if(cn(Q,yt.NAVIGATION_GUARD_REDIRECT))return O(nt({replace:x},_(Q.to),{state:typeof Q.to=="object"?nt({},de,Q.to.state):de,force:Oe}),ge||U)}else Q=I(U,ie,!0,x,de);return A(U,ie,Q),Q})}function C(K,ge){const H=g(K,ge);return H?Promise.reject(H):Promise.resolve()}function w(K){const ge=X.values().next().value;return ge&&typeof ge.runWithContext=="function"?ge.runWithContext(K):K()}function M(K,ge){let H;const[ie,de,Oe]=A_(K,ge);H=ir(ie.reverse(),"beforeRouteLeave",K,ge);for(const P of ie)P.leaveGuards.forEach(U=>{H.push(Hn(U,K,ge))});const x=C.bind(null,K,ge);return H.push(x),Me(H).then(()=>{H=[];for(const P of i.list())H.push(Hn(P,K,ge));return H.push(x),Me(H)}).then(()=>{H=ir(de,"beforeRouteUpdate",K,ge);for(const P of de)P.updateGuards.forEach(U=>{H.push(Hn(U,K,ge))});return H.push(x),Me(H)}).then(()=>{H=[];for(const P of Oe)if(P.beforeEnter)if(Hs(P.beforeEnter))for(const U of P.beforeEnter)H.push(Hn(U,K,ge));else H.push(Hn(P.beforeEnter,K,ge));return H.push(x),Me(H)}).then(()=>(K.matched.forEach(P=>P.enterCallbacks={}),H=ir(Oe,"beforeRouteEnter",K,ge,w),H.push(x),Me(H))).then(()=>{H=[];for(const P of l.list())H.push(Hn(P,K,ge));return H.push(x),Me(H)}).catch(P=>cn(P,yt.NAVIGATION_CANCELLED)?P:Promise.reject(P))}function A(K,ge,H){o.list().forEach(ie=>w(()=>ie(K,ge,H)))}function I(K,ge,H,ie,de){const Oe=g(K,ge);if(Oe)return Oe;const x=ge===Mn,P=Na?history.state:{};H&&(ie||x?a.replace(K.fullPath,nt({scroll:x&&P&&P.scroll},de)):a.push(K.fullPath,de)),r.value=K,he(K,ge,H,x),ee()}let $;function F(){$||($=a.listen((K,ge,H)=>{if(!xe.listening)return;const ie=N(K),de=k(ie,xe.currentRoute.value);if(de){O(nt(de,{replace:!0,force:!0}),ie).catch(Li);return}c=ie;const Oe=r.value;Na&&x_(wu(Oe.fullPath,H.delta),Fo()),M(ie,Oe).catch(x=>cn(x,yt.NAVIGATION_ABORTED|yt.NAVIGATION_CANCELLED)?x:cn(x,yt.NAVIGATION_GUARD_REDIRECT)?(O(nt(_(x.to),{force:!0}),ie).then(P=>{cn(P,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&!H.delta&&H.type===Vr.pop&&a.go(-1,!1)}).catch(Li),Promise.reject()):(H.delta&&a.go(-H.delta,!1),R(x,ie,Oe))).then(x=>{x=x||I(ie,Oe,!1),x&&(H.delta&&!cn(x,yt.NAVIGATION_CANCELLED)?a.go(-H.delta,!1):H.type===Vr.pop&&cn(x,yt.NAVIGATION_ABORTED|yt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),A(ie,Oe,x)}).catch(Li)}))}let se=vi(),B=vi(),S;function R(K,ge,H){ee(K);const ie=B.list();return ie.length?ie.forEach(de=>de(K,ge,H)):console.error(K),Promise.reject(K)}function W(){return S&&r.value!==Mn?Promise.resolve():new Promise((K,ge)=>{se.add([K,ge])})}function ee(K){return S||(S=!K,F(),se.list().forEach(([ge,H])=>K?H(K):ge()),se.reset()),K}function he(K,ge,H,ie){const{scrollBehavior:de}=e;if(!Na||!de)return Promise.resolve();const Oe=!H&&__(wu(K.fullPath,0))||(ie||!H)&&history.state&&history.state.scroll||null;return Ct().then(()=>de(K,ge,Oe)).then(x=>x&&y_(x)).catch(x=>R(x,K,ge))}const le=K=>a.go(K);let ve;const X=new Set,xe={currentRoute:r,listening:!0,addRoute:f,removeRoute:m,clearRoutes:t.clearRoutes,hasRoute:E,getRoutes:v,resolve:N,options:e,push:y,replace:T,go:le,back:()=>le(-1),forward:()=>le(1),beforeEach:i.add,beforeResolve:l.add,afterEach:o.add,onError:B.add,isReady:W,install(K){K.component("RouterLink",J_),K.component("RouterView",ew),K.config.globalProperties.$router=xe,Object.defineProperty(K.config.globalProperties,"$route",{enumerable:!0,get:()=>tn(r)}),Na&&!ve&&r.value===Mn&&(ve=!0,y(a.location).catch(ie=>{}));const ge={};for(const ie in Mn)Object.defineProperty(ge,ie,{get:()=>r.value[ie],enumerable:!0});K.provide($o,xe),K.provide(Jc,ic(ge)),K.provide(Gr,r);const H=K.unmount;X.add(K),K.unmount=function(){X.delete(K),X.size<1&&(c=Mn,$&&$(),$=null,r.value=Mn,ve=!1,S=!1),H()}}};function Me(K){return K.reduce((ge,H)=>ge.then(()=>w(H)),Promise.resolve())}return xe}function bm(){return Is($o)}function sw(e){return Is(Jc)}const Uo={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=sw(),s=bm(),n=Z({get(){var r;const o=t.query.tab;return o&&e.tabs.some(c=>c.id===o)?o:e.defaultTab||((r=e.tabs[0])==null?void 0:r.id)||""},set(o){s.replace({query:{...t.query,tab:o}})}}),a=Z(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.component)||null}),i=Z(()=>{var o;return((o=e.tabs.find(r=>r.id===n.value))==null?void 0:o.label)||""});ls(i,o=>{e.groupLabel&&o&&(document.title=`Odin — ${e.groupLabel} › ${o}`)},{immediate:!0});function l(o,r){if(!["ArrowLeft","ArrowRight","Home","End"].includes(o.key))return;o.preventDefault();let c=r;o.key==="ArrowRight"&&(c=(r+1)%e.tabs.length),o.key==="ArrowLeft"&&(c=(r-1+e.tabs.length)%e.tabs.length),o.key==="Home"&&(c=0),o.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},nw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var v,E,N,_,g;const f=p.payload||p,m=f.type||p.type;if(m==="tool_start"){const y=((v=f.metadata)==null?void 0:v.call_id)||null,T={callId:y,id:y||`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((E=f.metadata)==null?void 0:E.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(T);return}if(m==="tool_end"){const y=((N=f.metadata)==null?void 0:N.call_id)||null;let T=-1;if(y&&(T=e.value.findIndex(k=>k.callId===y&&k.status==="running")),T<0&&!y)for(let k=e.value.length-1;k>=0;k--){const O=e.value[k];if(O.tool===f.action&&O.status==="running"){T=k;break}}if(T>=0){const k=e.value[T];k.status=(_=f.metadata)!=null&&_.error?"error":"success",k.elapsed=((g=f.metadata)==null?void 0:g.elapsed_ms)||Date.now()-k.startTime,k.result=f.detail||"",k.fadingOut=!0,setTimeout(()=>{const O=e.value.indexOf(k);O>=0&&e.value.splice(O,1),t.value.unshift(k),t.value.length>n&&t.value.pop()},5e3)}return}if(m==="tool_stream"){const y=f.call_id||f.tool_name||"unknown";if(f.finished){const T={...s.value};delete T[y],s.value=T}else{const k=((s.value[y]||"")+(f.chunk||"")).split(`
`);s.value={...s.value,[y]:k.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let o=!1;function r(){o||(o=!0,qe.on("events",a),i||(i=setInterval(l,500)))}function c(){o&&(o=!1,qe.off("events",a),i&&(clearInterval(i),i=null))}Ze(r),ks(r),vs(c),mt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
... (truncated)`:s}function Mu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function wm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function km(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Sm=Symbol("agent-detail-cancelled"),iw=15e3;function lw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,o=!1,r,c;const d=new Promise((f,m)=>{r=f,c=m});function u(f,m){o||(o=!0,l!==null&&a(l),l=null,(f?r:c)(m))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return o||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!o&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Sm),i==null||i.abort()}}}function Tm({state:e,requestDetail:t,timeoutMs:s=iw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function o(){const p=l;l=null,p==null||p.cancel()}function r(p,{initial:f,coalesce:m}){if(!p)return Promise.resolve();if(m&&l&&l.agentId===p&&e.detailId===p)return l.promise;o();const v={agentId:p,cancel:null,promise:null};l=v,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const E=lw(N=>t(p,{signal:N}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return v.cancel=E.cancel,v.promise=(async()=>{let N=null,_=null;try{N=await E.promise}catch(g){_=g}N!==Sm&&(l!==v||e.detailId!==p||(l=null,!_&&(N===null||typeof N!="object")&&(_=new Error(`${n} response was empty or invalid`)),_?e.detail===null&&(e.detailError=(_==null?void 0:_.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=N,e.detailError=null),e.detailLoading=!1))})(),v.promise}function c(p){return e.detailId=p,r(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?r(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){o(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function ow({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let o=null;function r(){e()&&(t(),s()&&n())}function c(){o!==null&&(l(o),o=null)}function d(){c(),e()&&(o=i(r,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>o!==null}}const rw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const o=Z(()=>e.value.filter(R=>R.status==="running").length),r=Z(()=>e.value.filter(R=>R.status==="completed").length),c=Z(()=>e.value.filter(R=>["failed","timeout","killed"].includes(R.status)).length),d=Z(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:o.value},{value:"completed",label:"Completed",count:r.value},{value:"failed",label:"Failed",count:c.value}]),u=Z(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(R=>["failed","timeout","killed"].includes(R.status)):e.value.filter(R=>R.status===i.value));function p(R){const W=Number(R.max_iterations)||0;return W<=0?0:Math.min(100,Math.round(R.iteration_count/W*100))}function f(R){return(Number(R.max_iterations)||0)>0}function m(R,W){return R?R==="N/A"?"N/A":W==="current_inheritance"?`inherit (currently ${R})`:R:"unknown"}function v(R){return m(R.display_model,R.display_model_source||R.display_source)}function E(R){return m(R.display_reasoning_effort,R.display_reasoning_effort_source||R.display_source)}function N(R){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[R]||""}const _=h(null),g=h(null),y=h(!1),T=h(null),k=h(""),C=Tm({state:{get detail(){return _.value},set detail(R){_.value=R},get detailId(){return g.value},set detailId(R){g.value=R},get detailLoading(){return y.value},set detailLoading(R){y.value=R},get detailError(){return T.value},set detailError(R){T.value=R}},requestDetail:(R,{signal:W})=>G.get(`/api/agents/${encodeURIComponent(R)}`,{signal:W})});async function w(R){k.value="",await C.open(R.id)}function M(){C.close(),k.value=""}async function A(){await C.refresh()}async function I(R,W){try{await navigator.clipboard.writeText(W||""),k.value=R,setTimeout(()=>{k.value===R&&(k.value="")},1500)}catch{Re.error("Copy failed")}}async function $(R=!1){R=R===!0,R||(t.value=!0);try{const W=await G.get("/api/agents");e.value=Array.isArray(W)?W:[],s.value=null}catch(W){R||(s.value=W.message)}R||(t.value=!1)}async function F(R){const W=e.value.find(he=>he.id===R);if(await Qt({title:"Kill agent",message:`Kill agent "${(W==null?void 0:W.label)||R}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=R;try{await G.del(`/api/agents/${encodeURIComponent(R)}`),Re.success("Agent killed"),await $()}catch(he){Re.error(he.message||"Failed to kill agent")}n.value=null}}const se=ow({isEnabled:()=>a.value&&l,refreshList:()=>$(!0),hasOpenDetail:()=>!!g.value,refreshDetail:A});function B(){se.start()}function S(){se.stop()}return ls(a,()=>se.sync()),Ze(()=>{l=!0,$(),B()}),ks(()=>{l=!0,$(!0),B()}),vs(()=>{l=!1,S()}),mt(()=>{l=!1,S(),C.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:o,completedCount:r,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:xa,formatDuration:ai,progressPercent:p,hasProgress:f,displayModelText:v,displayEffortText:E,displaySourceLabel:N,detail:_,detailId:g,detailLoading:y,detailError:T,copied:k,openDetail:w,closeDetail:M,copyText:I,fetchAgents:$,killAgent:F,startAutoRefresh:B,stopAutoRefresh:S}}},cw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),o=h(null),r=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let m=!1;const E=Tm({state:{get detail(){return c.value},set detail(S){c.value=S},get detailId(){return d.value},set detailId(S){d.value=S},get detailLoading(){return u.value},set detailLoading(S){u.value=S},get detailError(){return p.value},set detailError(S){p.value=S}},detailLabel:"Loop detail",requestDetail:(S,{signal:R})=>G.get(`/api/loops/${encodeURIComponent(S)}?limit=100`,{signal:R})});async function N(S){f.value="",await E.open(S.id)}function _(){E.close(),f.value=""}async function g(S,R){try{await navigator.clipboard.writeText(R||""),f.value=S,setTimeout(()=>{f.value===S&&(f.value="")},1500)}catch{Re.error("Copy failed")}}const y=Z(()=>e.value.reduce((S,R)=>S+(R.iteration_count||0),0)),T=Z(()=>e.value.filter(S=>S.status==="running").length);function k(S){return S==="running"?"loop-status-running":S==="error"?"loop-status-error":"loop-status-stopped"}function O(S){return S==="running"?"badge-success":S==="error"?"badge-danger":S==="completed"?"badge-info":"badge-warning"}function C(S){return S==="act"?"badge-warning":S==="silent"?"badge-info":"badge-success"}async function w(S=!1){S=S===!0,S||(t.value=!0);try{const R=await G.get("/api/loops");e.value=Array.isArray(R)?R:[],s.value=null}catch(R){S||(s.value=R.message)}S||(t.value=!1)}async function M(){l.value=null;const S=a.value;if(!S.goal.trim()){l.value="Goal is required";return}if(!S.channel_id.trim()){l.value="Channel ID is required";return}const R={goal:S.goal.trim(),channel_id:S.channel_id.trim(),interval_seconds:S.interval_seconds||60,mode:S.mode,max_iterations:S.max_iterations||50};S.stop_condition.trim()&&(R.stop_condition=S.stop_condition.trim()),i.value=!0;try{const W=await G.post("/api/loops",R);Re.success(`Loop started: ${W.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await w()}catch(W){l.value=W.message}i.value=!1}async function A(S){if(await Qt({title:"Stop loop",message:`Stop loop ${S}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){o.value=S;try{await G.del(`/api/loops/${encodeURIComponent(S)}`),Re.success("Loop stopped"),await w()}catch(W){Re.error(W.message||"Failed to stop loop")}o.value=null}}async function I(S){r.value=S;try{await G.post(`/api/loops/${encodeURIComponent(S)}/restart`),Re.success("Loop restarted"),await w()}catch(R){Re.error(R.message||"Failed to restart loop")}r.value=null}function $(S){m&&S.payload&&(S.payload.loop_id||S.payload.type==="loop")&&(w(!0),d.value&&E.refresh())}let F=null;function se(){F!==null&&clearInterval(F),F=null}function B(){se(),m&&(F=setInterval(()=>{w(!0),d.value&&E.refresh()},5e3))}return Ze(()=>{m=!0,w(),qe.subscribe("events",$),B()}),ks(()=>{m=!0,w(!0),B()}),vs(()=>{m=!1,se()}),mt(()=>{m=!1,qe.unsubscribe("events",$),se(),E.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:o,restartingId:r,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:y,runningCount:T,statusDotClass:k,statusBadge:O,modeBadge:C,formatAge:xm,formatDuration:ai,formatTs:xa,formatTokens:km,openDetail:N,closeDetail:_,copyText:g,fetchLoops:w,doCreate:M,doStop:A,doRestart:I}}},dw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=Z(()=>e.value.filter(_=>_.status==="running").length),o=Z(()=>e.value.filter(_=>_.status!=="running").length);function r(_){return _==="running"?"loop-status-running":_==="failed"||_==="error"?"loop-status-error":"loop-status-stopped"}function c(_){return _==="running"?"badge-success":_==="completed"||_==="exited"?"badge-info":_==="killed"||_==="error"||_==="failed"?"badge-danger":"badge-warning"}async function d(_=!1){_=_===!0,_||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(g){_||(s.value=g.message)}_||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}ls(n,_=>{_?u():p()});async function f(_){if(await Qt({title:"Kill process",message:`Kill process ${_}?`,confirmLabel:"Kill",danger:!0})){i.value=_;try{await G.del(`/api/processes/${_}`),Re.success(`Process ${_} killed`),await d()}catch(y){Re.error(y.message||"Failed to kill process")}i.value=null}}function m(_){_.payload&&(_.payload.pid||_.payload.type==="process")&&d(!0)}let v=!1;function E(){v||(v=!0,d(),qe.subscribe("events",m),u())}function N(){v&&(v=!1,qe.unsubscribe("events",m),p())}return Ze(E),ks(E),vs(N),mt(N),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:o,procStatusDot:r,statusBadge:c,formatDuration:ai,fetchProcesses:d,doKill:f}}},uw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Du(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function pw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function fw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function hw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=uw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,o]=s.slice(0,6).map(Number),r=s[6]===void 0?0:Number(s[6]);if(r>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,o,r),p=new Date(u-864e5).getTimezoneOffset(),f=new Date(u+864e5).getTimezoneOffset(),m=[];for(const E of new Set([p,f])){const N=new Date(u+E*6e4);pw(N,c)===d&&(m.some(_=>_.getTime()===N.getTime())||m.push(N))}if(m.sort((E,N)=>E.getTime()-N.getTime()),m.length===0)return{state:"nonexistent",typed:t};if(m.length>1)return{state:"ambiguous",typed:t,options:m.map(E=>({instant:E,offset:fw(E),iso:E.toISOString()}))};const v=m[0];return{state:"ok",typed:t,instant:v,iso:v.toISOString()}}const mw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""}),i=h(!1),l=h(null),o=h(null),r=Z(()=>hw(a.value.run_at));ls(()=>a.value.run_at,()=>{o.value=null});const c=Z(()=>{var ie;const H=r.value;return H.state==="ok"?H.instant:H.state==="ambiguous"&&o.value!==null&&((ie=H.options[o.value])==null?void 0:ie.instant)||null}),d=Z(()=>{const H=c.value;return H?`${H.toLocaleString()} local — ${H.toISOString()} UTC`:""}),u=h(null),p=h(!1),f=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],m=h(null),v=h(null),E=h(null),N=h(null),_=h(null),g=h(null),y=h([]),T=h(!1),k=h("");let O=0;const C=Z(()=>e.value.filter(H=>H.cron&&!H.one_time).length),w=Z(()=>e.value.filter(H=>H.one_time).length),M=Z(()=>e.value.filter(H=>H.trigger).length),A=Z(()=>e.value.filter(H=>H.paused).length),I=Z(()=>e.value.filter(H=>H.consecutive_failures>0).length);function $(H){if(!H)return"-";const ie=Date.now(),Oe=(new Date(H).getTime()-ie)/1e3;if(Oe<0)return"overdue";if(Oe<60)return"in < 1 min";if(Oe<3600)return`in ${Math.floor(Oe/60)} min`;if(Oe<86400){const P=Math.floor(Oe/3600),U=Math.floor(Oe%3600/60);return U>0?`in ${P}h ${U}m`:`in ${P}h`}const x=Math.floor(Oe/86400);return`in ${x} day${x!==1?"s":""}`}function F(H){return H==null?"-":H<1e3?`${H}ms`:H<6e4?`${(H/1e3).toFixed(1)}s`:ai(H/1e3)}function se(H=a.value.cron){a.value.cron=H,Du(a.value,"cron"),u.value=null}function B(H=a.value.run_at){a.value.run_at=H,Du(a.value,"run_at"),u.value=null}async function S(){const H=a.value.cron.trim();if(H){p.value=!0;try{u.value=await G.post("/api/schedules/validate-cron",{expression:H})}catch(ie){u.value={valid:!1,error:ie.message}}p.value=!1}}async function R(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(H){s.value=H.message}t.value=!1}async function W(H){if(g.value===H){g.value=null,y.value=[];return}g.value=H,T.value=!0,y.value=[];const ie=++O;try{const de=await G.get(`/api/schedules/${encodeURIComponent(H)}/history?limit=10`);if(ie!==O||g.value!==H)return;y.value=de,k.value=""}catch(de){if(ie!==O||g.value!==H)return;y.value=[],k.value=de.message||"Failed to load execution history"}ie===O&&(T.value=!1)}async function ee(){l.value=null;const H=a.value;if(!H.description.trim()){l.value="Description is required";return}if(!H.channel_id.trim()){l.value="Channel ID is required";return}if(!H.cron.trim()&&!H.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(H.cron.trim()&&H.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const ie={description:H.description.trim(),action:H.action,channel_id:H.channel_id.trim()};if(H.cron.trim()&&(ie.cron=H.cron.trim()),H.run_at.trim()){const de=r.value;if(de.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(de.state==="invalid"){l.value="One-time run time is not a valid date";return}const Oe=c.value;if(de.state==="ambiguous"&&o.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!Oe){l.value="One-time run time could not be resolved";return}ie.run_at=Oe.toISOString()}if(H.action==="reminder"&&H.message.trim()&&(ie.message=H.message.trim()),H.action==="check"&&(H.tool_name.trim()&&(ie.tool_name=H.tool_name.trim()),H.report_format&&(ie.report_format=H.report_format),H.tool_input_str.trim()))try{ie.tool_input=JSON.parse(H.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",ie),Re.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:"",report_format:""},u.value=null,n.value=!1,await R()}catch(de){l.value=de.message}i.value=!1}async function he(H){m.value=H;try{const ie=await G.post(`/api/schedules/${encodeURIComponent(H)}/run`);if(ie.status==="failure")Re.error(`Execution failed: ${ie.error||"unknown error"}`);else{const de=ie.warning?`Executed (${ie.warning})`:"Executed successfully";Re.success(de)}await R()}catch(ie){Re.error(ie.message||"Failed to trigger")}m.value=null}async function le(H){E.value=H.id;const ie=!H.paused;try{await G.put(`/api/schedules/${encodeURIComponent(H.id)}`,{paused:ie}),Re.success(ie?"Schedule paused":"Schedule resumed"),await R()}catch(de){Re.error(de.message||"Failed to update schedule")}E.value=null}const ve=new Map;function X(H,ie){const de=ve.get(H.id);de&&clearTimeout(de.timer);const Oe={run:()=>xe(H,ie),timer:null};Oe.timer=setTimeout(()=>{ve.delete(H.id),Oe.run()},500),ve.set(H.id,Oe)}async function xe(H,ie){_.value=H.id;try{await G.put(`/api/schedules/${encodeURIComponent(H.id)}`,{report_format:ie}),Re.success(ie?"Structured report enabled":"Plain-text report enabled")}catch(de){Re.error(`Update failed: ${de.message}`)}finally{await R(),_.value=null}}function Me(){for(const[H,ie]of[...ve])clearTimeout(ie.timer),ve.delete(H),ie.run()}async function K(H){N.value=H;try{await G.post(`/api/schedules/${encodeURIComponent(H)}/reset-failures`),Re.success("Failure counters reset"),await R()}catch(ie){Re.error(ie.message||"Failed to reset")}N.value=null}async function ge(H){const ie=e.value.find(Oe=>Oe.id===H);if(await Qt({title:"Delete schedule",message:`Delete "${(ie==null?void 0:ie.description)||H}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){v.value=H;try{await G.del(`/api/schedules/${encodeURIComponent(H)}`),Re.success("Schedule deleted"),await R()}catch(Oe){Re.error(Oe.message||"Failed to delete schedule")}v.value=null}}return Ze(()=>{R()}),mt(Me),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:r,runAtOccurrence:o,cronResult:u,validatingCron:p,cronPresets:f,runningId:m,deletingId:v,togglingId:E,resettingId:N,reportUpdatingId:_,flushReportFormatTimers:Me,expandedId:g,history:y,historyLoading:T,historyError:k,cronCount:C,oneTimeCount:w,webhookCount:M,pausedCount:A,failingCount:I,formatTs:xa,formatAge:xm,formatFuture:$,formatMs:F,formatDuration:ai,onCronInput:se,onRunAtInput:B,validateCron:S,toggleExpand:W,fetchSchedules:R,doCreate:ee,doRunNow:he,doTogglePause:le,doUpdateReportFormat:X,doResetFailures:K,doDelete:ge}}},Cm=[{id:"live",label:"Live",component:nw},{id:"agents",label:"Agents",component:rw},{id:"loops",label:"Loops",component:cw},{id:"processes",label:"Processes",component:dw},{id:"schedules",label:"Schedules",component:mw}],vw={components:{TabbedPage:Uo},setup(){return{tabs:Cm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},gw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function o(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},r()}async function r(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await G.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ze(()=>{r()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:xa,formatDetail:i,truncateBlock:_m,toggleExpand:l,clearFilters:o,fetchAudit:r}}},Fu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],bw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const o=h(null),r=h(!1),c=h(new Set),d=h(!1),u=h("all"),p=h(""),f=h("last_active"),m=h(!1),v=Fu,E=bw,N=h([]),_=h(!1),g=h(""),y=h("flat"),T=h(new Set),k=h(""),O=h(""),C=h(""),w=h(null),M=h(!1);function A(){try{const J=localStorage.getItem("odin-session-presets");J&&(N.value=JSON.parse(J))}catch{}}function I(){try{localStorage.setItem("odin-session-presets",JSON.stringify(N.value))}catch{}}const $=Z(()=>p.value.trim()!==""||u.value!=="all"),F=Z(()=>{let J=[...e.value];const Ie=Fu.find(Ue=>Ue.id===u.value),$e=Ie?Ie.filters:{};if($e.source&&(J=J.filter(Ue=>Ue.source===$e.source)),$e.minMessages&&(J=J.filter(Ue=>Ue.message_count>=$e.minMessages)),$e.hasCompaction&&(J=J.filter(Ue=>Ue.has_summary)),$e.maxAge!=null){const Ue=Date.now()/1e3;J=J.filter(ot=>ot.last_active&&Ue-ot.last_active<=$e.maxAge)}if(p.value.trim()){const Ue=p.value.toLowerCase().trim();J=J.filter(ot=>(ot.channel_id||"").toLowerCase().includes(Ue)||(ot.last_user_id||"").toLowerCase().includes(Ue)||(ot.source||"").toLowerCase().includes(Ue))}const Be=f.value,ze=m.value?1:-1;return J.sort((Ue,ot)=>{const Nt=Ue[Be]||0,St=ot[Be]||0;return(Nt-St)*ze}),J}),se=Z(()=>{if(!a.value||!a.value.messages)return[];const J=a.value.messages;if(J.length===0)return[];const Ie=[];let $e=[];for(const Be of J)Be.role==="user"&&$e.length>0&&(Ie.push($e),$e=[]),$e.push(Be);return $e.length>0&&Ie.push($e),Ie}),B=Z(()=>F.value.length>0&&c.value.size===F.value.length);function S(J){const Ie=J.find($e=>$e.role==="user");if(Ie&&Ie.content){const $e=Ie.content.slice(0,120);return $e.length<Ie.content.length?$e+"...":$e}return"(no user message)"}function R(J){const Ie=new Set(T.value);Ie.has(J)?Ie.delete(J):Ie.add(J),T.value=Ie}function W(J){u.value=J}function ee(J){u.value=J.id,J.filters.searchQuery!=null&&(p.value=J.filters.searchQuery),J.filters.sortBy&&(f.value=J.filters.sortBy)}function he(){if(!g.value.trim())return;const J={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:f.value}};N.value=[...N.value,J],I(),_.value=!1,g.value=""}function le(J){N.value=N.value.filter(Ie=>Ie.id!==J),I(),u.value===J&&(u.value="all")}function ve(){u.value="all",p.value="",f.value="last_active",m.value=!1}function X(J){if(!J)return"—";const Ie=Date.now()/1e3-J;if(Ie<60)return"just now";if(Ie<3600){const Be=Math.floor(Ie/60);return`${Be} minute${Be!==1?"s":""} ago`}if(Ie<86400){const Be=Math.floor(Ie/3600);return`${Be} hour${Be!==1?"s":""} ago`}const $e=Math.floor(Ie/86400);return`${$e} day${$e!==1?"s":""} ago`}function xe(J){if(!J)return"";try{return new Date(J*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Me(J){if(!J)return"";try{return new Date(J*1e3).toLocaleString()}catch{return""}}function K(J){return J==="user"?"bg-gray-900/50 border border-gray-800":J==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ge(J){return J==="user"?"sess-msg-user":J==="assistant"?"sess-msg-assistant":"sess-msg-system"}function H(J){return J==="user"?"badge-info":J==="assistant"?"badge-success":"badge-warning"}function ie(J){return J==="user"?"sess-dot-user":J==="assistant"?"sess-dot-assistant":"sess-dot-system"}function de(J){return J==="user"?"text-cyan-400":J==="assistant"?"text-indigo-400":"text-gray-500"}function Oe(J){return J?J.length>2e3?J.slice(0,2e3)+`
... (truncated)`:J:""}async function x(){const J=k.value.trim();if(J){M.value=!0;try{let Ie=`/api/sessions/search?q=${encodeURIComponent(J)}&limit=50`;O.value.trim()&&(Ie+=`&channel_id=${encodeURIComponent(O.value.trim())}`),C.value.trim()&&(Ie+=`&user_id=${encodeURIComponent(C.value.trim())}`);const $e=await G.get(Ie);w.value=$e.results||[]}catch{w.value=[]}M.value=!1}}function P(){k.value="",O.value="",C.value="",w.value=null}function U(J){return J?J.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function ne(J){return J==="user"?"fts-result-user":J==="assistant"?"fts-result-assistant":J==="summary"?"fts-result-summary":J==="fts"?"fts-result-fts":J==="channel"?"fts-result-channel":"fts-result-default"}function Q(J){return J==="user"?"badge-info":J==="assistant"?"badge-success":J==="summary"?"badge-warning":J==="fts"?"badge-success":"badge-info"}async function te(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(J){s.value=J.message}t.value=!1}function be(){s.value=null,te()}async function re(J){if(n.value===J){n.value=null,a.value=null,T.value=new Set;return}n.value=J,a.value=null,i.value=!0,T.value=new Set;const Ie=++l;try{const $e=await G.get(`/api/sessions/${encodeURIComponent(J)}`);Ie===l&&n.value===J&&(a.value=$e)}catch($e){Ie===l&&n.value===J&&(a.value={messages:[],summary:"",error:$e.message||"Failed to load session"})}finally{Ie===l&&(i.value=!1)}}function ue(J){const Ie=new Set(c.value);Ie.has(J)?Ie.delete(J):Ie.add(J),c.value=Ie}function ae(){B.value?c.value=new Set:c.value=new Set(F.value.map(J=>J.channel_id))}function we(J){o.value=J}async function ye(){if(o.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(o.value)}`),n.value===o.value&&(n.value=null,a.value=null),c.value.delete(o.value),await te()}catch(J){s.value=J.message||"Failed to clear session"}r.value=!1,o.value=null}}function _e(){d.value=!0}async function oe(){if(c.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await te()}catch(J){s.value=J.message||"Failed to clear sessions"}r.value=!1,d.value=!1}}async function z(J,Ie){const $e=`/api/sessions/${encodeURIComponent(J)}/export?format=${Ie}`;try{const Be=await G.getBlob($e),ze=URL.createObjectURL(Be),Ue=document.createElement("a");Ue.href=ze,Ue.download=`session-${J}.${Ie==="text"?"txt":"json"}`,Ue.click(),URL.revokeObjectURL(ze)}catch(Be){s.value=Be.message||"Failed to export session"}}let pe=null;function Se(J){J.payload&&J.payload.channel_id&&(clearTimeout(pe),pe=setTimeout(()=>{if(te(),n.value&&J.payload.channel_id===n.value){const Ie=n.value,$e=l;G.get(`/api/sessions/${encodeURIComponent(Ie)}`).then(Be=>{$e!==l||n.value!==Ie||(a.value=Be)}).catch(()=>{})}},2e3))}let Ee=!1;function Ne(){Ee||(Ee=!0,te(),qe.subscribe("events",Se))}Ze(()=>{A(),Ne()}),ks(()=>{Ne()});function ut(){Ee&&(Ee=!1,qe.unsubscribe("events",Se),clearTimeout(pe))}return vs(ut),mt(ut),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:o,clearing:r,selected:c,allSelected:B,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:f,sortAsc:m,filterPresets:v,sortOptions:E,filteredSessions:F,hasActiveFilters:$,customPresets:N,showSavePreset:_,newPresetName:g,threadView:y,threads:se,collapsedThreads:T,ftsQuery:k,ftsChannelId:O,ftsUserId:C,ftsResults:w,ftsSearching:M,formatAge:X,formatTimestamp:xe,formatFullTimestamp:Me,messageClass:K,threadMsgClass:ge,roleBadge:H,roleDotClass:ie,roleLabelClass:de,truncateContent:Oe,threadSummary:S,fetchSessions:te,retry:be,toggleSession:re,toggleSelect:ue,toggleSelectAll:ae,confirmClear:we,clearSession:ye,confirmBulkClear:_e,doBulkClear:oe,exportSession:z,applyPreset:W,applyCustomPreset:ee,saveCustomPreset:he,removeCustomPreset:le,resetFilters:ve,toggleThread:R,runFtsSearch:x,clearFtsSearch:P,highlightSnippet:U,ftsResultClass:ne,ftsTypeBadge:Q}}},xw={props:["trace"],template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=h(""),r=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(O){if(!O)return"—";try{const C=new Date(O);return isNaN(C.getTime())?O:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function p(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function f(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function m(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function v(O){a.value===O?a.value=null:(a.value=O,c.value={})}function E(O,C){const w=O+"-"+C;c.value={...c.value,[w]:!c.value[w]}}function N(O,C){return!!c.value[O+"-"+C]}function _(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},o.value="",l.value="",i.value=null,T()}async function g(){try{const O=await G.get("/api/trajectories");e.value=O.files||[],r.value=O.count||0}catch{}}let y=0;async function T(){const O=++y;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(o.value){const C=await G.get(`/api/trajectories/${encodeURIComponent(o.value)}?limit=${d.value.limit}`);if(O!==y)return;let w=C.entries||[];d.value.tool_name&&(w=w.filter(M=>(M.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(w=w.filter(M=>M.is_error)),d.value.channel_id&&(w=w.filter(M=>M.channel_id===d.value.channel_id)),d.value.user_id&&(w=w.filter(M=>M.user_id===d.value.user_id)),t.value=w}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const w=C.toString(),M=await G.get(`/api/trajectories/search/query?${w}`);if(O!==y)return;t.value=M.results||[]}}catch(C){if(O!==y)return;n.value=C.message}O===y&&(s.value=!1)}async function k(){if(!l.value.trim())return;const O=++y;s.value=!0,n.value=null,c.value={};try{const C=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==y)return;i.value=C.entry||null,i.value||(n.value="No trace found for this message ID")}catch(C){if(O!==y)return;C.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=C.message}O===y&&(s.value=!1)}return Ze(async()=>{await g(),await T()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:o,totalSaved:r,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:m,truncateBlock:_m,toggleExpand:v,toggleIteration:E,isIterationExpanded:N,clearFilters:_,fetchFiles:g,fetchTraces:T,lookupMessage:k}}},ww={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const o=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=Z(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const m=await G.get("/api/usage");n.value=m,a.value=m.totals||a.value,t.value=null,s.value=!0}catch(m){t.value=m.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function f(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ze(p),ks(p),vs(f),mt(f),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:o,recentReversed:r,fmtNum:wm,formatTime:ym,retry:d}}},Em=[{id:"audit",label:"Audit",component:gw},{id:"sessions",label:"Sessions",component:yw},{id:"traces",label:"Traces",component:_w},{id:"usage",label:"Usage",component:ww}],kw={components:{TabbedPage:Uo},setup(){return{tabs:Em}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},lr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Sw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),o=h(null),r=h(null),c=h(!1),d=h(new Set),u={disabled:"Disabled by operator",unavailable:"Unavailable — required backend is not configured",global_disabled:"Global tools disabled"};function p(w){return w.source!=="builtin"?"":u[w.state]||""}function f(w,M){const A=w&&Array.isArray(w.tools)?w.tools:null;if(c.value=!!A,r.value=A?!!w.global_enabled:null,!A){e.value=M.map(F=>({...F,source:"unknown",enabled:void 0,state:null}));return}const I=new Set(A.map(F=>F.name)),$=M.filter(F=>!I.has(F.name)).map(F=>({...F,source:F.name.startsWith("mcp_")?"mcp":"skill",enabled:!0,state:null}));e.value=[...A.map(F=>({...F,source:"builtin"})),...$]}async function m(w,M){if(d.value.has(w.name))return;const A=!!M.target.checked,I=new Set(d.value);I.add(w.name),d.value=I;try{const $=await G.post(`/api/tools/builtins/${encodeURIComponent(w.name)}/enabled`,{enabled:A});f($,e.value),s.value=null;try{const F=await G.get("/api/tools");f($,F)}catch(F){console.warn("Built-in toggle committed; visible catalog refresh failed",F)}}catch($){M.target.checked=!!w.enabled,s.value=$.message||`Failed to toggle ${w.name}`}finally{const $=new Set(d.value);$.delete(w.name),d.value=$}}const v=Z(()=>e.value.filter(w=>w.source==="builtin"&&w.is_core).length),E=Z(()=>e.value.filter(w=>w.source==="skill").length),N=Z(()=>Object.values(a.value).reduce((w,M)=>w+M,0));function _(w){for(const M of lr)if(M.id!=="other"&&M.match(w))return M.id;return"other"}const g=Z(()=>{let w=e.value;if(n.value){const M=n.value.toLowerCase();w=w.filter(A=>A.name.toLowerCase().includes(M)||(A.description||"").toLowerCase().includes(M))}return o.value&&(w=w.filter(M=>_(M.name)===o.value)),w}),y=Z(()=>{const w=new Set;for(const M of e.value)w.add(_(M.name));return lr.filter(M=>w.has(M.id))}),T=Z(()=>{const w=g.value,M={};for(const I of w){const $=_(I.name);M[$]||(M[$]=[]),M[$].push(I)}const A=[];for(const I of lr)M[I.id]&&M[I.id].length>0&&A.push({label:I.label,icon:I.icon,tools:M[I.id].sort(($,F)=>$.name.localeCompare(F.name))});return A});function k(w){i.value={...i.value,[w]:!i.value[w]}}async function O(){t.value=!0,s.value=null;try{const[w,M,A]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({})),G.get("/api/tools/builtins").catch(()=>null)]);f(A,w),a.value=M||{}}catch(w){s.value=w.message}t.value=!1}function C(){O()}return Ze(()=>{O()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:o,globalEnabled:r,inventoryAvailable:c,togglePending:d,coreCount:v,skillCount:E,totalUsage:N,filteredTools:g,groupedTools:T,usedCategories:y,stateBadge:p,applyInventory:f,toggleBuiltinTool:m,truncate:Qc,toggleExpand:k,refresh:C}}};function Tw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Cw(e){if(!e)return"1";const t=e.split(`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),o=h(null),r=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),m=h(!1),v=h(null),E=h(null),N=h(!1),_=Z(()=>e.value.length),g=Z(()=>e.value.reduce((X,xe)=>X+(xe.execution_count||0),0)),y=Z(()=>e.value.reduce((X,xe)=>X+M(xe.code),0)),T=Z(()=>{if(!l.value)return e.value;const X=l.value.toLowerCase();return e.value.filter(xe=>xe.name.toLowerCase().includes(X)||(xe.description||"").toLowerCase().includes(X))}),k=Z(()=>u.value?u.value.split(`
`).length:0),O=Z(()=>{const X=Math.max(k.value,1);return Array.from({length:X},(xe,Me)=>Me+1).join(`
`)}),C=Z(()=>{const X=u.value.trim();return X?X.includes("SKILL_DEFINITION")?X.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function w(X){return Tw(X)}function M(X){return X?X.split(`
`).length:0}function A(X){return Cw(X)}function I(X){n.value={...n.value,[X]:!n.value[X]}}async function $(X){try{await navigator.clipboard.writeText(X);const xe=e.value.find(Me=>Me.code===X);xe&&(o.value=xe.name,setTimeout(()=>{o.value=null},2e3))}catch{}}function F(X){if(X.key==="Tab"){X.preventDefault();const xe=X.target,Me=xe.selectionStart,K=xe.selectionEnd;u.value=u.value.substring(0,Me)+"    "+u.value.substring(K),Ct(()=>{xe.selectionStart=xe.selectionEnd=Me+4})}}function se(X){const xe=X.target.previousElementSibling;xe&&(xe.scrollTop=X.target.scrollTop)}async function B(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(X){s.value=X.message}t.value=!1}async function S(X){i.value=X,delete a.value[X],a.value={...a.value};try{const xe=await G.post(`/api/skills/${encodeURIComponent(X)}/test`);a.value={...a.value,[X]:xe}}catch(xe){a.value={...a.value,[X]:{result:xe.message,is_error:!0}}}i.value=null}function R(){r.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function W(X){r.value=!0,c.value="edit",d.value=X.name,u.value=X.code||"",p.value=null,f.value=null}function ee(){r.value=!1,p.value=null,f.value=null}async function he(){p.value=null,f.value=null;const X=d.value.trim(),xe=u.value.trim();if(!X){p.value="Name is required";return}if(!xe){p.value="Code is required";return}m.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:X,code:xe}),f.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(X)}`,{code:xe}),f.value="Skill updated successfully"),await B(),setTimeout(()=>{r.value=!1},800)}catch(Me){p.value=Me.message}m.value=!1}function le(X){E.value=X}async function ve(){if(E.value){N.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(E.value)}`),await B()}catch(X){Re.error(`Failed to delete skill: ${X.message||"unknown error"}`)}N.value=!1,E.value=null}}return Ze(()=>{B()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:o,editing:r,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:m,editorRef:v,deleteTarget:E,deleting:N,enabledCount:_,totalExecutions:g,totalLines:y,displayedSkills:T,editLineCount:k,editorLineNums:O,editValidation:C,highlight:w,truncate:Qc,formatTs:xa,countLines:M,getLineNumbers:A,toggleCode:I,copyCode:$,handleEditorKey:F,syncScroll:se,fetchSkills:B,testSkill:S,showCreate:R,editSkill:W,cancelEdit:ee,saveSkill:he,confirmDelete:le,doDelete:ve}}};class Es extends Error{constructor(t,s=""){super(t),this.name="MCPFormError",this.field=s}}const Aw=/^[A-Za-z_][A-Za-z0-9_]*$/;function $u(e){return String(e||"").split(/\r?\n/).map(t=>t.trim()).filter(Boolean)}function Uu(e,t,s){const n={},a=[...new Set((t||[]).map(l=>String(l)))],i=new Set(a);for(const l of e||[]){const o=String((l==null?void 0:l.key)||"").trim(),r=String((l==null?void 0:l.value)??"");if(!(!o&&!r)){if(!o)throw new Es(`${s} key is required when a value is entered.`,"authentication");if(/[\r\n\0]/.test(o))throw new Es(`${s} keys cannot contain line breaks or NUL bytes.`,"authentication");if(Object.hasOwn(n,o))throw new Es(`${s} key “${o}” appears more than once.`,"authentication");if(i.has(o))throw new Es(`${s} key “${o}” cannot be replaced and removed in the same save.`,"authentication");n[o]=r}}return{set:n,remove:a}}function Rw(e){try{const t=new URL(e);return(t.protocol==="http:"||t.protocol==="https:")&&!!t.hostname}catch{return!1}}function Iw(e,{mode:t="add",originalTransport:s=""}={}){const n=t==="add",a=String(e.name||"").trim();if(!a)throw new Es("Server name is required.","name");if(a.length>128||!Aw.test(a))throw new Es("Use at most 128 letters, digits, or underscores, with no leading digit.","name");const i=e.transport==="http"?"http":"stdio",l=!n&&!!s&&i!==s,o={enabled:!!e.enabled,transport:i};if(n&&(o.name=a),i==="stdio"){const d=String(e.command||"").trim();if((n||l)&&!d)throw new Es("An executable path is required for a new stdio connection.","command");if(d&&(o.command=d),(n||e.replaceArgs)&&(o.args=$u(e.argsText)),n||e.replaceCwd){const u=String(e.cwd||"").trim();if(u&&(!u.startsWith("/")||u.includes("\0")))throw new Es("Working directory must be an absolute path.","cwd");o.cwd=u}}else{const d=String(e.url||"").trim();if((n||l)&&!d)throw new Es("An HTTP endpoint is required for this connection.","url");if(d&&!Rw(d))throw new Es("Endpoint must be a valid http:// or https:// URL.","url");d&&(o.url=d)}if(n||e.replaceTimeout){const d=Number(e.timeoutSeconds);if(!Number.isInteger(d)||d<1||d>3600)throw new Es("Timeout must be a whole number from 1 to 3600 seconds.","timeout");o.timeout_seconds=d}(n||e.replaceAllowlist)&&(o.tool_allowlist=$u(e.allowlistText));const r=Uu(e.headerRows,e.headersRemove,"Header"),c=Uu(e.envRows,e.envRemove,"Environment variable");return Object.keys(r.set).length&&(o.headers_set=r.set),r.remove.length&&(o.headers_remove=r.remove),Object.keys(c.set).length&&(o.env_set=c.set),c.remove.length&&(o.env_remove=c.remove),o}function Ow(e,t){return t?e.transport!==t.transport||!!e.enabled!=!!t.enabled?!0:Object.keys(e).some(s=>!["enabled","transport"].includes(s)):!1}function Lw(e){const t=String(e||"").toLowerCase();return["disabled","connecting","connected","stale","error","blocked"].includes(t)?t:"error"}function Nw(e,t){const s=String(t||"").trim().toLowerCase();return s?[e==null?void 0:e.original_name,e==null?void 0:e.published_name,e==null?void 0:e.description,e==null?void 0:e.exclusion_reason].filter(Boolean).some(n=>String(n).toLowerCase().includes(s)):!0}const Pw=Object.freeze([{id:"identity",label:"Identity"},{id:"transport",label:"Transport"},{id:"authentication",label:"Authentication"},{id:"limits",label:"Limits"}]);function Mw(e,{root:t=document,reducedMotion:s=typeof window<"u"&&(n=>(n=window.matchMedia)==null?void 0:n.call(window,"(prefers-reduced-motion: reduce)").matches)()}={}){var l;const a=t.querySelector(".mcp-editor-groups"),i=a==null?void 0:a.querySelector(`#mcp-form-${e}`);return i?(i.scrollIntoView({behavior:s?"auto":"smooth",block:"start",inline:"nearest"}),(l=i.querySelector("[data-mcp-form-heading]"))==null||l.focus({preventScroll:!0}),!0):!1}const Dw=1e4,Fw=Object.freeze({disabled:"Disabled",connecting:"Connecting",connected:"Connected",stale:"Stale",error:"Error",blocked:"Blocked"});function or(){return{name:"",enabled:!0,transport:"stdio",command:"",argsText:"",cwd:"",url:"",timeoutSeconds:120,allowlistText:"",replaceArgs:!1,replaceCwd:!1,replaceTimeout:!1,replaceAllowlist:!1,headerRows:[],envRows:[],headersRemove:[],envRemove:[]}}function $w(e){if(e==null)return"Never";const t=Math.max(0,Number(e)||0);return t<60?`${Math.round(t)}s ago`:t<3600?`${Math.round(t/60)}m ago`:t<86400?`${Math.round(t/3600)}h ago`:`${Math.round(t/86400)}d ago`}const Uw={template:`
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
  `,setup(){const e=h(null),t=h(!1),s=h(!1),n=h(""),a=h(new Set),i=h(new Set),l=h({}),o=h({}),r=h({}),c=h(new Set),d=h(!1),u=h("add"),p=h(""),f=h(null),m=h(or()),v=h(""),E=h(!1);let N=null,_=0,g=!1,y=!1;const T=Pw,k=Z(()=>{var z;return((z=e.value)==null?void 0:z.servers)||[]}),O=Z(()=>{var z;return!!((z=e.value)!=null&&z.enabled)}),C=Z(()=>{var z,pe,Se,Ee;return{serverCount:((z=e.value)==null?void 0:z.server_count)||0,enabledCount:((pe=e.value)==null?void 0:pe.enabled_server_count)||0,connectedCount:((Se=e.value)==null?void 0:Se.connected_count)||0,toolCount:((Ee=e.value)==null?void 0:Ee.published_tool_count)||0}}),w=Z(()=>{var z;return((z=f.value)==null?void 0:z.header_keys)||[]}),M=Z(()=>{var z;return((z=f.value)==null?void 0:z.env_keys)||[]}),A=Z(()=>{var z;return u.value==="edit"&&((z=f.value)==null?void 0:z.transport)==="http"}),I=Z(()=>u.value==="add"||!A.value),$=Z(()=>A.value?"Replace endpoint URL":"Endpoint URL"),F=Z(()=>A.value?"Leave blank to keep the saved endpoint":"https://mcp.example.com/mcp");function se(){B(),N=window.setInterval(()=>S({quiet:!0}),Dw)}function B(){N&&window.clearInterval(N),N=null}async function S({quiet:z=!1}={}){const pe=++_;z||(t.value=!0);try{const Se=await G.get("/api/mcp/status");if(pe!==_||!g)return;e.value=Se,n.value="";const Ee=new Set((Se.servers||[]).map(Ne=>Ne.name));i.value=new Set([...i.value].filter(Ne=>Ee.has(Ne)))}catch(Se){pe===_&&g&&(n.value=Se.message||"Failed to load MCP status")}finally{pe===_&&(t.value=!1)}}function R(z){return s.value||a.value.has(z)}function W(z,pe){const Se=new Set(a.value);pe?Se.add(z):Se.delete(z),a.value=Se}function ee(z){return Lw(z.state)}function he(z){if(ee(z)==="disabled"){if(!z.enabled)return"Disabled — server switch off";if(!O.value)return"Disabled — global MCP is off"}return Fw[ee(z)]}function le(z){return z.transport==="http"?"Streamable HTTP":"stdio"}function ve(z){return z.negotiated_version?`${z.era?`${String(z.era).charAt(0).toUpperCase()}${String(z.era).slice(1)}`:"Protocol"} · ${z.negotiated_version}`:"Not negotiated"}function X(z){return z.discovered_count?`${z.published_count||0} published · ${z.excluded_count||0} excluded`:"No tools discovered"}const xe=h(new Set);async function Me(z,pe){if(xe.value.has(z.name))return;const Se=!!pe.target.checked,Ee=new Set(xe.value);Ee.add(z.name),xe.value=Ee;try{const Ne=await G.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/enabled`,{enabled:Se});Ne&&Array.isArray(Ne.servers)?e.value=Ne:await S({quiet:!0})}catch(Ne){pe.target.checked=!!z.enabled,Re.error(Ne.message||`Failed to toggle ${z.name}`)}finally{const Ne=new Set(xe.value);Ne.delete(z.name),xe.value=Ne}}async function K(z){if(z!==O.value&&!(!z&&!await Qt({title:"Disable MCP tool publication",message:"Disable MCP globally? All MCP tools will be unpublished immediately and active transports will be stopped. Saved server configuration remains.",confirmLabel:"Disable MCP",danger:!0}))){s.value=!0;try{await G.post("/api/mcp/enabled",{enabled:z}),Re.success(z?"MCP enabled":"MCP disabled"),await S({quiet:!0})}catch(pe){Re.error(pe.message||"Failed to update MCP state"),await S({quiet:!0})}finally{s.value=!1}}}async function ge(z){W(z.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/reconnect`,{}),Re.success(`Reconnected ${z.name}`)}catch(pe){Re.error(pe.message||`Failed to reconnect ${z.name}`)}finally{W(z.name,!1),await S({quiet:!0})}}async function H(z){W(z.name,!0);try{await G.post(`/api/mcp/servers/${encodeURIComponent(z.name)}/refresh-tools`,{}),Re.success(`Refreshed tools from ${z.name}`),await Oe(z.name,!0)}catch(pe){Re.error(pe.message||`Failed to refresh ${z.name}`)}finally{W(z.name,!1),await S({quiet:!0})}}async function ie(z){if(await Qt({title:`Remove ${z.name}`,message:`Remove this saved MCP server? Its ${z.published_count||0} published tool${z.published_count===1?"":"s"} will disappear immediately and configured authentication keys will be deleted. This cannot be undone.`,confirmLabel:"Remove server",danger:!0})){W(z.name,!0);try{await G.del(`/api/mcp/servers/${encodeURIComponent(z.name)}`),Re.success(`Removed ${z.name}`),delete o.value[z.name]}catch(Se){Re.error(Se.message||`Failed to remove ${z.name}`)}finally{W(z.name,!1),await S({quiet:!0})}}}async function de(z){const pe=new Set(i.value);if(pe.has(z.name)){pe.delete(z.name),i.value=pe;return}pe.add(z.name),i.value=pe,Object.hasOwn(o.value,z.name)||await Oe(z.name)}async function Oe(z,pe=!1){if(!pe&&Object.hasOwn(o.value,z))return;const Se=new Set(c.value);Se.add(z),c.value=Se,r.value={...r.value,[z]:""};try{const Ee=await G.get(`/api/mcp/servers/${encodeURIComponent(z)}/tools`);o.value={...o.value,[z]:Ee.tools||[]}}catch(Ee){r.value={...r.value,[z]:Ee.message||"Failed to load tools"}}finally{const Ee=new Set(c.value);Ee.delete(z),c.value=Ee}}function x(z){return(o.value[z]||[]).filter(pe=>Nw(pe,l.value[z]))}function P(z,pe){l.value={...l.value,[z]:pe}}function U(){u.value="add",p.value="",f.value=null,m.value=or(),v.value="",d.value=!0}function ne(z){u.value="edit",p.value=z.name,f.value=z,m.value={...or(),name:z.name,enabled:!!z.enabled,transport:z.transport||"stdio"},v.value="",d.value=!0}function Q(){E.value||(d.value=!1)}function te(z){d.value&&Mw(z)}function be(z){const pe=z==="headers"?"headerRows":"envRows";m.value[pe].push({key:"",value:""})}function re(z,pe){const Se=z==="headers"?"headerRows":"envRows";m.value[Se].splice(pe,1)}function ue(z,pe){const Se=z==="headers"?"headersRemove":"envRemove",Ee=m.value[Se];m.value[Se]=Ee.includes(pe)?Ee.filter(Ne=>Ne!==pe):[...Ee,pe]}async function ae(){var pe,Se;v.value="";let z;try{z=Iw(m.value,{mode:u.value,originalTransport:((pe=f.value)==null?void 0:pe.transport)||""})}catch(Ee){v.value=Ee instanceof Es?Ee.message:"Invalid MCP server configuration",await Ct(),(Se=document.querySelector(".mcp-editor"))==null||Se.scrollTo({top:0,behavior:"smooth"});return}if(!(u.value==="edit"&&Ow(z,f.value)&&!await Qt({title:`Change ${p.value} connection`,message:"Saving this configuration replaces the server runtime. Any current connection will be retired and its tools unpublished; enabled servers reconnect after the change.",confirmLabel:"Save and reconnect",danger:!0}))){E.value=!0;try{u.value==="add"?await G.post("/api/mcp/servers",z):await G.put(`/api/mcp/servers/${encodeURIComponent(p.value)}`,z),Re.success(u.value==="add"?`Saved ${z.name}`:`Updated ${p.value}`),d.value=!1,await S({quiet:!0})}catch(Ee){v.value=Ee.message||"Failed to save MCP server"}finally{E.value=!1}}}let we=null;function ye(z){`${(z==null?void 0:z.event)||""} ${(z==null?void 0:z.type)||""} ${(z==null?void 0:z.tool)||""} ${(z==null?void 0:z.message)||""}`.toLowerCase().includes("mcp")&&(we&&window.clearTimeout(we),we=window.setTimeout(()=>S({quiet:!0}),200))}function _e(){g||(g=!0,y||(qe.subscribe("events",ye),y=!0),S(),se())}function oe(){g=!1,B(),we&&window.clearTimeout(we),we=null,y&&(qe.unsubscribe("events",ye),y=!1)}return Ze(_e),ks(_e),vs(oe),mt(oe),{status:e,loading:t,mutating:s,pageError:n,servers:k,masterEnabled:O,aggregate:C,expandedServers:i,toolQueries:l,toolErrors:r,toolsLoading:c,editorOpen:d,editorMode:u,editingName:p,editingServer:f,form:m,formError:v,saving:E,editorGroups:T,configuredHeaderKeys:w,configuredEnvKeys:M,savedHttpEndpoint:A,endpointRequired:I,endpointFieldLabel:$,endpointPlaceholder:F,refreshAll:S,busy:R,serverState:ee,stateLabel:he,transportLabel:le,protocolLabel:ve,toolSummary:X,formatAge:$w,setMasterEnabled:K,togglePending:xe,toggleServerEnabled:Me,reconnect:ge,refreshTools:H,removeServer:ie,toggleTools:de,filteredTools:x,setToolQuery:P,openAdd:U,openEdit:ne,closeEditor:Q,jumpToEditorGroup:te,addSecretRow:be,removeSecretRow:re,toggleSecretRemoval:ue,saveServer:ae}}};function Bw(e,t){if(!e||!t)return Mu(e);const s=Mu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Hw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),o=h(null),r=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),m=h(null),v=h(null);let E=null;const N=h(null),_=h(!1),g=h({}),y=h({}),T=h({}),k=h({}),O=new Map,C=h(null),w=Z(()=>e.value.reduce((ee,he)=>ee+(he.chunks||0),0)),M=Z(()=>new Set(e.value.map(he=>he.uploader).filter(Boolean)).size);function A(ee,he){const le=y.value[he];if(!le||le.length===0)return 0;const ve=Math.max(...le.map(X=>X.char_count||0));return ve===0?0:Math.round(ee.char_count/ve*100)}async function I(){t.value=!0,s.value=null;try{const ee=await G.get("/api/knowledge");e.value=Array.isArray(ee)?ee:[]}catch(ee){s.value=ee.message}t.value=!1}async function $(ee){if(g.value[ee]){g.value[ee]=!1,C.value=null;return}if(g.value[ee]=!0,Object.prototype.hasOwnProperty.call(y.value,ee))return;if(O.has(ee))return O.get(ee);const he={...k.value,[ee]:!0};k.value=he;const le={...T.value};delete le[ee],T.value=le;const ve=G.get(`/api/knowledge/${encodeURIComponent(ee)}/chunks`).then(X=>{y.value={...y.value,[ee]:Array.isArray(X)?X:[]}}).catch(X=>{T.value={...T.value,[ee]:X.message||"load failed"}}).finally(()=>{if(O.get(ee)!==ve)return;O.delete(ee);const X={...k.value};delete X[ee],k.value=X});return O.set(ee,ve),ve}async function F(){const ee=n.value.trim();if(ee){i.value=!0,o.value=null,l.value=ee;try{const he=await G.get(`/api/knowledge/search?q=${encodeURIComponent(ee)}`);a.value=Array.isArray(he)?he:[]}catch(he){a.value=[],o.value=he.message||"Search failed"}i.value=!1}}function se(){a.value=null,n.value="",o.value=null}async function B(){u.value=null,p.value=null;const ee=c.value.trim(),he=d.value.trim();if(!ee){u.value="Source name is required";return}if(!he){u.value="Content is required";return}f.value=!0;try{const le=await G.post("/api/knowledge",{source:ee,content:he});p.value=`Ingested ${le.chunks||0} chunks from "${ee}"`,c.value="",d.value="",y.value={},await I(),setTimeout(()=>{r.value=!1,p.value=null},1500)}catch(le){u.value=le.message}f.value=!1}async function S(ee){m.value=ee,v.value=null,E&&(clearTimeout(E),E=null);try{const he=await G.post(`/api/knowledge/${encodeURIComponent(ee)}/reingest`);v.value={source:ee,error:!1,message:`Re-ingested ${he.chunks||0} chunks`},delete y.value[ee],await I(),E=setTimeout(()=>{v.value=null,E=null},3e3)}catch(he){v.value={source:ee,error:!0,message:he.message}}m.value=null}function R(ee){N.value=ee}async function W(){if(N.value){_.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(N.value)}`),delete y.value[N.value],await I()}catch(ee){Re.error(`Failed to delete source: ${ee.message||"unknown error"}`)}_.value=!1,N.value=null}}return Ze(()=>{I()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:o,showIngest:r,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:m,reingestResult:v,deleteTarget:N,deleting:_,expanded:g,sourceChunks:y,chunkErrors:T,loadingChunks:k,selectedChunk:C,totalChunks:w,uploaderCount:M,truncate:Qc,formatTs:xa,highlightTerms:Bw,chunkBarWidth:A,fetchSources:I,toggleSource:$,doSearch:F,clearSearch:se,doIngest:B,doReingest:S,confirmDelete:R,doDelete:W}}},zw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),o=h(!1),r=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),m=h(!1),v=h(null),E=h(null),N=h(new Set),_=h(null),g=h(!1),y=h(!1),T=Z(()=>e.value.reduce((le,ve)=>le+ve.count,0)),k=Z(()=>N.value.size);function O(le){const ve=t.value[le];if(!ve)return[];if(!l.value.trim())return ve;const X=l.value.trim().toLowerCase();return ve.filter(xe=>xe.key.toLowerCase().includes(X)||xe.value&&xe.value.toLowerCase().includes(X))}function C(le,ve){return N.value.has(le+"/"+ve)}function w(le,ve){const X=le+"/"+ve,xe=new Set(N.value);xe.has(X)?xe.delete(X):xe.add(X),N.value=xe}function M(le){const ve=t.value[le];return!ve||ve.length===0?!1:ve.every(X=>N.value.has(le+"/"+X.key))}function A(le,ve){const X=t.value[le];if(!X)return;const xe=new Set(N.value);for(const Me of X){const K=le+"/"+Me.key;ve?xe.add(K):xe.delete(K)}N.value=xe}async function I(){s.value=!0,n.value=null;try{const le=await G.get("/api/memory");e.value=Object.entries(le).map(([ve,X])=>({name:ve,keys:X.keys||[],count:X.count||0}))}catch(le){n.value=le.message}s.value=!1}async function $(le){if(a.value[le]){a.value[le]=!1;return}a.value[le]=!0;const ve=e.value.find(xe=>xe.name===le);if(!ve||t.value[le]||i.value===le)return;i.value=le;let X;try{const Me=(await G.get(`/api/memory/${encodeURIComponent(le)}`)).entries||{};X=ve.keys.map(K=>Object.prototype.hasOwnProperty.call(Me,K)?{key:K,value:Me[K]||"",failed:!1}:{key:K,value:"",failed:!0,error:"Not found in scope"})}catch(xe){X=ve.keys.map(Me=>({key:Me,value:"",failed:!0,error:xe.message||"Failed to load"}))}t.value[le]=X,i.value=null}function F(le,ve,X){p.value=le+"/"+ve,f.value=X}async function se(le,ve){m.value=!0,v.value=null;try{await G.put(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(ve)}`,{value:f.value});const X=t.value[le];if(X){const xe=X.find(Me=>Me.key===ve);xe&&(xe.value=f.value)}p.value=null}catch(X){v.value=`Failed to save: ${X.message||"unknown error"}`}m.value=!1}async function B(le,ve){try{await navigator.clipboard.writeText(ve.value),E.value=le+"/"+ve.key,setTimeout(()=>{E.value=null},1500)}catch{}}async function S(){d.value=null,u.value=null;const le=r.value.scope.trim(),ve=r.value.key.trim(),X=r.value.value.trim();if(!le){d.value="Scope is required";return}if(!ve){d.value="Key is required";return}if(!X){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(ve)}`,{value:X}),u.value="Entry saved",r.value={scope:"global",key:"",value:""},t.value={},await I(),setTimeout(()=>{o.value=!1,u.value=null},800)}catch(xe){d.value=xe.message}c.value=!1}function R(le,ve){_.value={scope:le,key:ve}}async function W(){if(!_.value)return;g.value=!0,v.value=null;const{scope:le,key:ve}=_.value;try{await G.del(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(ve)}`);const X=t.value[le];X&&(t.value[le]=X.filter(K=>K.key!==ve));const xe=e.value.find(K=>K.name===le);xe&&(xe.count--,xe.keys=xe.keys.filter(K=>K!==ve));const Me=new Set(N.value);Me.delete(le+"/"+ve),N.value=Me}catch(X){v.value=`Failed to delete: ${X.message||"unknown error"}`}g.value=!1,_.value=null}function ee(){y.value=!0}async function he(){g.value=!0,v.value=null;const le=[];for(const ve of N.value){const X=ve.indexOf("/");le.push({scope:ve.slice(0,X),key:ve.slice(X+1)})}try{await G.post("/api/memory/bulk-delete",{entries:le}),N.value=new Set,t.value={},await I()}catch(ve){v.value=`Bulk delete failed: ${ve.message||"unknown error"}`}g.value=!1,y.value=!1}return Ze(()=>{I()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:o,addForm:r,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:m,actionError:v,copied:E,selected:N,selectedCount:k,totalEntries:T,deleteTarget:_,deleting:g,showBulkDelete:y,fetchMemory:I,toggleScope:$,startEdit:F,doEdit:se,copyValue:B,doAdd:S,confirmDelete:R,doDelete:W,confirmBulkDelete:ee,doBulkDelete:he,isSelected:C,toggleSelect:w,isScopeAllSelected:M,toggleSelectAll:A,filteredEntries:O}}},jw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),o=Z(()=>[...new Set(e.value.map(E=>E.category))].sort()),r=Z(()=>{const v={};return e.value.forEach(E=>{v[E.category]=(v[E.category]||0)+1}),v}),c=Z(()=>a.value?e.value.filter(v=>v.category===a.value):e.value);function d(v){return v==="correction"?"badge-warning":v==="operational"?"badge-info":v==="preference"?"badge-success":"badge-info"}function u(v){i.value=v.key,l.value=v.content}async function p(v){try{await G.put("/api/learned/"+encodeURIComponent(v),{content:l.value}),i.value=null,Re.success("Entry updated"),await m()}catch(E){Re.error(E.message||"Failed to save entry")}}async function f(v){if(await Qt({title:"Delete learned entry",message:`Delete "${v}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(v)),Re.success("Entry deleted"),await m()}catch(N){Re.error(N.message||"Failed to delete entry")}}async function m(){s.value=!0,n.value=null;try{const v=await G.get("/api/learned");e.value=v.entries||[],t.value={last_reflection:v.last_reflection,count:v.count}}catch(v){n.value=v.message}s.value=!1}return Ze(m),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:o,catCounts:r,filtered:c,catBadge:d,formatTs:xa,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:m}}},Am=[{id:"tools",label:"Tools",component:Sw},{id:"skills",label:"Skills",component:Ew},{id:"mcp-servers",label:"MCP Servers",component:Uw},{id:"knowledge",label:"Knowledge",component:Hw},{id:"memory",label:"Memory",component:zw},{id:"learned",label:"Learned",component:jw}],Vw={components:{TabbedPage:Uo},setup(){return{tabs:Am}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},qw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Gw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Kw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ww={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=Z(()=>e.value.components||[]),l=Z(()=>Kw[e.value.overall]||"text-gray-400"),o=Z(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=Z(()=>{const k=e.value.overall;return k==="healthy"?"All Systems Healthy":k==="degraded"?"Some Systems Degraded":k==="unhealthy"?"System Issues Detected":"Unknown"});function c(k){return qw[k]||"text-gray-400"}function d(k){return Gw[k]||"info"}function u(k){return k==="ok"?"badge-success":k==="degraded"?"badge-warning":k==="down"?"badge-danger":"badge-info"}function p(k){return k==="closed"?"text-green-400":k==="half_open"?"text-yellow-400":k==="open"?"text-red-400":"text-gray-400"}function f(k){return k.replace(/_/g," ").replace(/\b\w/g,O=>O.toUpperCase())}function m(k){if(!k)return"—";try{return new Date(k).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return k}}function v(k){return k>=1e6?(k/1e6).toFixed(1)+"M":k>=1e3?(k/1e3).toFixed(1)+"K":String(k)}async function E(){a.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null,n.value=!0}catch(k){s.value=k.message}finally{t.value=!1,a.value=!1}}function N(){t.value=!0,s.value=null,E()}let _=null,g=!1;function y(){g||(g=!0,E(),_||(_=setInterval(E,3e4)))}function T(){g&&(g=!1,_&&(clearInterval(_),_=null))}return Ze(y),ks(y),vs(T),mt(T),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:o,overallLabel:r,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:f,formatTime:m,formatNumber:v,fetchHealth:E,retry:N}}},Zw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const o=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=Z(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=Z(()=>{if(!i.value)return[];const E=i.value,N=E.storage_total_bytes||1;return[{label:"Session Persistence",mb:E.sessions.persist_dir.total_mb,bytes:E.sessions.persist_dir.total_bytes,files:E.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(E.sessions.persist_dir.total_bytes/N*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:E.knowledge.db_file.total_mb,bytes:E.knowledge.db_file.total_bytes,files:E.knowledge.db_file.file_count,pct:Math.min(100,Math.round(E.knowledge.db_file.total_bytes/N*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:E.trajectories.message_dir.total_mb,bytes:E.trajectories.message_dir.total_bytes,files:E.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.message_dir.total_bytes/N*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:E.trajectories.agent_dir.total_mb,bytes:E.trajectories.agent_dir.total_bytes,files:E.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(E.trajectories.agent_dir.total_bytes/N*100)),color:"res-bar-amber"}]});async function d(){try{const E=await G.get("/api/resource-usage");i.value=E,t.value=null,s.value=!0}catch(E){t.value=E.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let f=!1;function m(){f||(f=!0,d(),l||(l=setInterval(d,3e4)))}function v(){f&&(f=!1,l&&(clearInterval(l),l=null))}return Ze(m),ks(m),vs(v),mt(v),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:o,collectedAt:r,storageItems:c,fmtNum:wm,refresh:u,retry:p}}},Jw=["INFO","WARNING","ERROR"],Yw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],rr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Qw=[50,100,200,500],Xw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),o=h(!1),r=h(qe.state||"disconnected"),c=Z(()=>{switch(r.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,m=Jw,v=Yw,E=rr,N=h("all"),_=h(""),g=h([]),y=h(!1),T=h(""),k=h([]);function O(){try{const q=localStorage.getItem("odin-log-presets");q&&(g.value=JSON.parse(q))}catch{}}function C(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const w=Z(()=>a.value!==""||i.value.trim()!==""||_.value!==""),M=Z(()=>{const q=rr.find(ce=>ce.value===_.value);return q?q.label:""}),A=Z(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(q){return q.message}}),I=24,$=Z(()=>{if(ee.value.length===0)return[];const q=[],ce=new Date,Le=3600*1e3;for(let Je=I-1;Je>=0;Je--){const rt=new Date(ce.getTime()-(Je+1)*Le),Pt=new Date(ce.getTime()-Je*Le);q.push({start:rt,end:Pt,label:S(rt,Pt),shortLabel:Pt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const Je of ee.value){if(!Je._time)continue;const rt=Je._time.getTime();for(const Pt of q)if(rt>=Pt.start.getTime()&&rt<Pt.end.getTime()){Pt.total++,Je.level==="ERROR"?Pt.errors++:Je.level==="WARNING"?Pt.warnings++:Pt.info++;break}}return q}),F=Z(()=>{let q=1;for(const ce of $.value)ce.total>q&&(q=ce.total);return q}),se=Z(()=>{if($.value.length===0)return"";const q=ee.value.map(Je=>Je._time&&Je._time.getTime()).filter(Boolean);if(q.length===0)return"";const ce=new Date(Math.min(...q));return`${ee.value.length} shown, oldest ${ce.toLocaleTimeString()}`}),B=Z(()=>Math.ceil(I/8));function S(q,ce){const Le={hour:"2-digit",minute:"2-digit"};return q.toLocaleTimeString([],Le)+" - "+ce.toLocaleTimeString([],Le)}function R(q,ce){return!ce||!q?"0px":Math.max(2,q/ce*100)+"%"}function W(q){const ce=ee.value.findIndex(Le=>Le._time&&Le._time.getTime()>=q.start.getTime()&&Le._time.getTime()<q.end.getTime());if(ce>=0&&d.value){const Le=d.value.querySelectorAll(".log-line");Le[ce]&&(Le[ce].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const ee=Z(()=>{let q=t.value;if(a.value&&(q=q.filter(ce=>(ce.level||"INFO")===a.value)),_.value){const ce=rr.find(Le=>Le.value===_.value);if(ce&&ce.seconds){const Le=new Date(Date.now()-ce.seconds*1e3);q=q.filter(Je=>Je._time&&Je._time>=Le)}}if(i.value&&!A.value)if(l.value)try{const ce=new RegExp(i.value,"i");q=q.filter(Le=>{const Je=Le.text||Le.raw||"",rt=Le.tool||"";return ce.test(Je)||ce.test(rt)})}catch{}else{const ce=i.value.toLowerCase();q=q.filter(Le=>{const Je=(Le.text||Le.raw||"").toLowerCase(),rt=(Le.tool||"").toLowerCase();return Je.includes(ce)||rt.includes(ce)})}return q});function he(q){if(q.type==="log"&&q.line)try{const ce=typeof q.line=="string"?JSON.parse(q.line):q.line,Le=ce.timestamp?new Date(ce.timestamp):new Date;return{ts:Le.toLocaleTimeString(),_time:Le,level:ce.error?"ERROR":"INFO",text:ce.tool_name?`[${ce.tool_name}] ${ce.result_summary||""}`.trim():ce.message||JSON.stringify(ce),tool:ce.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(q.line),tool:"",raw:String(q.line)}}if(q.payload){const ce=q.payload,Le=ce.timestamp?new Date(ce.timestamp):new Date;return{ts:Le.toLocaleTimeString(),_time:Le,level:ce.error?"ERROR":"INFO",text:ce.tool_name?`[${ce.tool_name}] ${ce.result_summary||""}`.trim():ce.message||JSON.stringify(ce),tool:ce.tool_name||"",raw:null}}return typeof q=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:q,tool:"",raw:q}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(q),tool:"",raw:null}}function le(q){const ce=he(q);if(s.value){k.value.push(ce);return}ve(ce)}function ve(q){t.value.push(q),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&Ct(()=>X())}function X(q=!1){const ce=d.value;ce&&ce.scrollTo({top:ce.scrollHeight,behavior:q?"smooth":"instant"})}function xe(){n.value=!0,u.value=!1,Ct(()=>X(!0))}const Me=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function K(){const q=d.value;if(!q)return;const ce=q.scrollHeight-q.scrollTop-q.clientHeight<40;u.value=!n.value&&!ce&&t.value.length>0,de.value&&ge()}function ge(){const q=d.value;!q||!n.value||q.scrollHeight-q.scrollTop-q.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function H(){n.value&&requestAnimationFrame(ge)}function ie(q){Me.has(q.key)&&H()}const de=h(!1);function Oe(){n.value&&(de.value=!0,requestAnimationFrame(ge))}function x(){de.value&&(de.value=!1,ge())}function P(){n.value&&(u.value=!1,Ct(()=>X()))}function U(){if(s.value=!s.value,!s.value&&k.value.length>0){for(const q of k.value)ve(q);k.value=[]}}function ne(){t.value=[],k.value=[],u.value=!1}function Q(){let q;e.value==="search"?q=Ue.value.map(rt=>{const Pt=rt.error?"ERROR":"INFO",Ut=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Pt} ${Ut}${rt.result_summary||rt.message||""}`}).join(`
`):q=ee.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ce=new Blob([q],{type:"text/plain"}),Le=URL.createObjectURL(ce),Je=document.createElement("a");Je.href=Le,Je.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,Je.click(),URL.revokeObjectURL(Le)}function te(q,ce){const Le=`${q.ts} ${q.level} ${q.text||q.raw||""}`;navigator.clipboard.writeText(Le).then(()=>{p.value=ce,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function be(q){a.value=a.value===q?"":q,N.value="all"}function re(q){return q.level==="ERROR"?"log-line-error":q.level==="WARNING"?"log-line-warning":"text-gray-300"}function ue(q){return q==="ERROR"?"text-red-500 font-semibold":q==="WARNING"?"text-yellow-500":"text-blue-500"}function ae(q){return q==="ERROR"?"log-chip-error":q==="WARNING"?"log-chip-warning":"log-chip-info"}function we(q){N.value=q.id;const ce=q.filters;a.value=ce.level||"",_.value=ce.timeRange||"",i.value=ce.text||"",ce.levels&&(a.value=ce.levels[0]||""),ce.hasToolName&&(i.value="")}function ye(q){N.value=q.id,a.value=q.filters.level||"",_.value=q.filters.timeRange||"",i.value=q.filters.text||""}function _e(){if(!T.value.trim())return;const q={id:"custom-"+Date.now(),name:T.value.trim(),filters:{level:a.value,timeRange:_.value,text:i.value}};g.value=[...g.value,q],C(),y.value=!1,T.value=""}function oe(q){g.value=g.value.filter(ce=>ce.id!==q),C(),N.value===q&&(N.value="all")}const z=h("all"),pe=h(""),Se=h(""),Ee=h(""),Ne=h(""),ut=h(""),J=h(100),Ie=Qw,$e=h(!1),Be=h(!1),ze=h(""),Ue=h([]),ot=h(null),Nt=h(null);function St(){e.value="search",ot.value||In()}async function In(){try{ot.value=await G.get("/api/logs/stats")}catch{}}function zs(){const q=ut.value;if(!q){Ee.value="",Ne.value="";return}const Le={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[q];if(Le){const Je=new Date(Date.now()-Le*1e3);Ee.value=Ns(Je),Ne.value=""}}function Ns(q){const ce=Le=>String(Le).padStart(2,"0");return`${q.getFullYear()}-${ce(q.getMonth()+1)}-${ce(q.getDate())}T${ce(q.getHours())}:${ce(q.getMinutes())}`}function Ft(q){if(!q)return"";const ce=new Date(q);return isNaN(ce.getTime())?"":ce.toISOString()}async function qt(){$e.value=!0,ze.value="",Be.value=!0,Nt.value=null;try{const q=new URLSearchParams;z.value&&z.value!=="all"&&q.set("level",z.value),pe.value&&q.set("tool",pe.value),Se.value&&q.set("q",Se.value);const ce=Ft(Ee.value),Le=Ft(Ne.value);ce&&q.set("start",ce),Le&&q.set("end",Le),q.set("limit",String(J.value));const Je=await G.get(`/api/logs/search?${q.toString()}`);Ue.value=Je.entries||[]}catch(q){ze.value=q.message||"Search failed",Ue.value=[]}finally{$e.value=!1}}function an(){z.value="all",pe.value="",Se.value="",Ee.value="",Ne.value="",ut.value="",J.value=100,Ue.value=[],Be.value=!1,ze.value="",Nt.value=null}function js(q){Nt.value=Nt.value===q?null:q}function Vs(q){if(!q.timestamp)return"";try{return new Date(q.timestamp).toLocaleString()}catch{return q.timestamp}}function qs(q){return q.type==="web_action"?`${q.status||""} (${q.execution_time_ms||0}ms)`:(q.result_summary||"").slice(0,200)}function Ps(q){return q.error?"log-line-error":"text-gray-300"}function On(q){try{return JSON.stringify(q,null,2)}catch{return String(q)}}let vt=null,Ms=null,Gs=!1;function Qe(){Gs||(Gs=!0,qe.subscribe("logs",le),o.value=qe.connected,r.value=qe.state||"disconnected",vt=qe.onStateChange,Ms=(q,ce)=>{r.value=q,o.value=q==="connected",vt&&vt(q,ce)},qe.onStateChange=Ms)}function $t(){Gs&&(Gs=!1,qe.unsubscribe("logs",le),qe.onStateChange===Ms&&(qe.onStateChange=vt),Ms=null,vt=null)}return Ze(()=>{O(),window.addEventListener("pointerup",x),window.addEventListener("pointercancel",x)}),ks(Qe),vs($t),mt(()=>{$t(),window.removeEventListener("pointerup",x),window.removeEventListener("pointercancel",x)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:o,wsState:r,wsStateLabel:c,logContainer:d,filteredLogs:ee,pauseBuffer:k,showJumpBottom:u,copiedIndex:p,regexError:A,levels:m,logPresets:v,timeRanges:E,timeRange:_,activeLogPreset:N,customLogPresets:g,showSaveLogPreset:y,newLogPresetName:T,hasActiveLogFilters:w,timeRangeLabel:M,timelineBuckets:$,timelineMax:F,timelineSpanLabel:se,timelineLabelSkip:B,togglePause:U,clearLogs:ne,exportLogs:Q,logLineClass:re,levelClass:ue,levelChipClass:ae,toggleLevel:be,copyLine:te,jumpToBottom:xe,onScroll:K,onUserScrollIntent:H,onUserScrollKey:ie,onAutoScrollToggle:P,onPointerDown:Oe,applyLogPreset:we,applyCustomLogPreset:ye,saveLogCustomPreset:_e,removeLogCustomPreset:oe,segmentHeight:R,jumpToTimelineBucket:W,searchLevel:z,searchTool:pe,searchKeyword:Se,searchStart:Ee,searchEnd:Ne,searchTimePreset:ut,searchLimit:J,searchLimits:Ie,searching:$e,searchRan:Be,searchError:ze,searchResults:Ue,searchStats:ot,expandedSearch:Nt,switchToSearch:St,runSearch:qt,clearSearchFilters:an,toggleSearchExpand:js,formatSearchTs:Vs,searchEntryText:qs,searchLogLineClass:Ps,formatJson:On,applySearchTimePreset:zs}}};function Sl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const ek=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]);function tk(e,t={}){var a,i;const s=t.getStyle||(l=>globalThis.getComputedStyle(l)),n=Object.hasOwn(t,"fallback")?t.fallback:(a=globalThis.document)==null?void 0:a.scrollingElement;for(let l=e;l;l=l.parentElement){const o=((i=s(l))==null?void 0:i.overflowY)||"";if(/^(auto|scroll|overlay)$/.test(o)&&l.scrollHeight>l.clientHeight)return l}return n&&n.scrollHeight>n.clientHeight?n:e||n||null}const Ga=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],sk={live_read:"Applies immediately",live_apply:"Dedicated live apply",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},cr=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),nk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Bu(e){return nk.some(t=>e===t||e.startsWith(`${t}.`))}const Rm="odin_config_center_expanded_v1",Im="odin_config_center_category_v1",ak=50,ik=650,dr=()=>G.get("/api/config/meta");function sa(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function Ni(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Aa(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function lk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function ok(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Om(e,t){if(Ni(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return sa(t);const n={};for(const[a,i]of Object.entries(t)){const l=Om(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function rk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Om(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Lm(e,t,s,n){if(Ni(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Lm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function ck(){try{const e=JSON.parse(localStorage.getItem(Rm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function dk(){try{const e=localStorage.getItem(Im);return Ga.some(t=>t.key===e)?e:Ga[0].key}catch{return Ga[0].key}}const uk={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(null),a=h(!1),i=h(null),l=h(null),o=h(null),r=h(!1),c=h(!1),d=h(null),u=h(""),p=h("all"),f=h(dk()),m=h(ck()),v=h({}),E=h({}),N=h(""),_=h({}),g=h({}),y=h([]),T=h([]),k=h(!1),O=h(!1),C=h(!1);let w=null,M=null,A={path:null,at:0},I=0;const $=Z(()=>{var b;return(((b=t.value)==null?void 0:b.fields)||[]).filter(D=>!cr.has(D.path.split(".")[0])&&!Bu(D.path))}),F=Z(()=>new Map($.value.map(b=>[b.path,b]))),se=Z(()=>ee.value.reduce((b,D)=>b+D.sections.length,0)),B=Z(()=>$.value.length),S=Z(()=>ek),R=Z(()=>y.value.length>0),W=Z(()=>T.value.length>0),ee=Z(()=>{if(!e.value)return[];const b=new Set(Ga.flatMap(fe=>fe.sections)),D=Ga.map(fe=>({...fe,sections:fe.sections.filter(De=>Object.hasOwn(e.value,De)&&!cr.has(De))})).filter(fe=>fe.sections.length),V=Object.keys(e.value).filter(fe=>!b.has(fe)&&!cr.has(fe));return V.length&&D.push({key:"other",label:"Other",icon:"folder",sections:V}),D}),he=Z(()=>e.value?{...e.value,...v.value}:null),le=Z(()=>{if(!e.value)return[];const b=[];for(const[D,V]of Object.entries(v.value))Lm(e.value[D],V,D,b);return b.filter(D=>!Ni(D.oldVal,D.newVal)).map(D=>{const V=P(D.path);return{...D,label:(V==null?void 0:V.label)||Aa(D.path.split(".").at(-1)),apply_mode:(V==null?void 0:V.apply_mode)||be(D.path.split(".")[0])}})}),ve=Z(()=>le.value.length>0),X=Z(()=>le.value.length),xe=Z(()=>new Set(le.value.map(b=>b.path.split(".")[0])).size),Me=Z(()=>!!u.value||p.value!=="all"),K=Z(()=>{const b={...g.value};for(const D of le.value){const V=P(D.path),fe=wa(V,D.newVal);fe&&(b[D.path]=fe)}return b}),ge=Z(()=>Object.keys(K.value).length>0),H=Z(()=>e.value?(Me.value?ee.value:ee.value.filter(D=>D.key===f.value)).map(D=>({...D,sections:D.sections.filter(V=>$e(V))})).filter(D=>D.sections.length):[]),ie=Z(()=>{const b=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],D=new Map(b.map(V=>[V,[]]));for(const V of le.value){const fe=D.has(V.apply_mode)?V.apply_mode:"restart";D.get(fe).push(V)}return b.filter(V=>D.get(V).length).map(V=>({key:V,label:gs(V),entries:D.get(V)}))}),de=Z(()=>le.value.filter(b=>b.apply_mode==="restart").length),Oe=Z(()=>$.value.filter(b=>b.pending_restart)),x=Z(()=>Oe.value.length);function P(b){const D=F.value.get(b);return D?{...D,apply_details:Sl([D])}:null}function U(b){const D=`${b}.`;return $.value.filter(V=>V.path===b||V.path.startsWith(D))}function ne(b){return U(b).length}function Q(b){return Aa(b)}function te(b){const D=U(b);if(!D.length)return`${Aa(b)} configuration.`;const V=D.find(gt=>gt.sensitivity==="public"&&gt.description)||D.find(gt=>gt.description),fe=(V==null?void 0:V.description)||"";return fe.match(/setting for (.+)\.$/i)?`${Aa(b)} settings and runtime behaviour.`:fe}function be(b){const D=[...new Set(U(b).map(V=>V.apply_mode))];return D.length===1?D[0]:D.includes("restart")?"restart":D.includes("activation_required")?"activation_required":D[0]||"restart"}function re(b){const D=[...new Set(U(b).map(V=>gs(V.apply_mode)))];return D.length?D.length===1?D[0]:`Mixed apply behaviour: ${D.join(" · ")}`:""}function ue(b){return Sl(U(b))}function ae(b){var D;return Object.hasOwn(v.value,b)?v.value[b]:(D=e.value)==null?void 0:D[b]}function we(){const b=ae("mcp")||{},D=Object.keys(b.servers||{}).length;return`${b.enabled?"Globally enabled":"Globally disabled"} · ${D} configured server${D===1?"":"s"}.`}function ye(b,D){return D.split(".").reduce((V,fe)=>V==null?void 0:V[fe],b)}function _e(b){const D=he.value;return U(b).filter(V=>Bu(V.path)?!1:V.path.split(".").length<=2?!0:!V.path.includes(".*")).map(V=>({...V,key:V.path.split(".").at(-1),value:ye(D,V.path),apply_details:Sl([V]),editor:V.path==="agents.final_warning_iterations"?"warning-chips":null}))}function oe(b){const D=b.path.split(".");return D.length>2?D.slice(0,2).join("."):null}function z(b){const D=new Map;for(const V of _e(b)){const fe=oe(V),De=fe||`${b}.__root`;D.has(De)||D.set(De,{key:De,path:fe,entries:[]}),D.get(De).entries.push(V)}return[...D.values()].map(V=>{const fe=V.entries.find(De=>De.group_description);return{...V,label:V.path?Aa(V.path.split(".").at(-1)):null,description:(fe==null?void 0:fe.group_description)||null,apply_details:Sl(V.entries),runtime_summaries:Se(V.entries)}})}function pe(b){return{save:b.save_effect||(b.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:b.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[b.apply_mode]||"Effective runtime state is not currently observable."}}function Se(b){const D=new Map;for(const V of b){const fe=pe(V),De=`${V.apply_mode}|${fe.save}|${fe.runtime}`;D.has(De)||D.set(De,{key:De,label:gs(V.apply_mode),save:fe.save,runtime:fe.runtime})}return[...D.values()]}function Ee(b){if(Ne(b))return b.runtime_effect||b.activation_policy||"";if(b.apply_mode==="activation_required"){const D=b.activation_policy||b.runtime_effect;return D?`Not active after saving. No activation control exists in this release. ${D}`:"Not active after saving; no activation control exists in this release."}return""}function Ne(b){return b.action_available===!0&&!!(b.action_label&&b.action_endpoint)}async function ut(b){if(Ne(b))try{if(Nt(b.path))throw new Error("Save this setting before applying its action.");const D=String(b.action_method||"POST").toLowerCase(),V={post:G.post.bind(G),put:G.put.bind(G),delete:G.del.bind(G)}[D];if(!V)throw new Error("Unsupported configuration action");await V(b.action_endpoint,b.action_body||void 0),await Y(),es("success",`${b.action_label} completed.`)}catch(D){es("error",D.message||`${b.action_label} failed`)}}function J(b,D){return[b.label,b.path,b.description,...b.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(D)}function Ie(b){const D=u.value.trim().toLowerCase();return D?U(b).filter(V=>J(V,D)):[]}function $e(b){const D=U(b);if(p.value!=="all"&&!D.some(fe=>fe.apply_state===p.value))return!1;const V=u.value.trim().toLowerCase();return!V||`${Q(b)} ${b}`.toLowerCase().includes(V)?!0:D.some(fe=>J(fe,V))}function Be(b,D){return U(b).filter(V=>V.apply_state===D).length}function ze(b){return b==="all"?B.value:$.value.filter(D=>D.apply_state===b).length}function Ue(b){const D=b.sections.flatMap(V=>U(V));return{fields:D.length,modified:le.value.filter(V=>b.sections.includes(V.path.split(".")[0])).length,pending_restart:D.filter(V=>V.apply_state==="pending_restart").length,invalid:D.filter(V=>V.apply_state==="invalid").length,dormant:D.filter(V=>V.apply_state==="dormant").length}}function ot(b){var D;return Object.hasOwn(v.value,b)&&!Ni((D=e.value)==null?void 0:D[b],v.value[b])}function Nt(b){return le.value.some(D=>D.path===b||D.path.startsWith(`${b}.`))}function St(b){f.value=b,u.value="",p.value="all";try{localStorage.setItem(Im,b)}catch{}}function In(b){p.value=b}function zs(){u.value="",p.value="all"}function Ns(b){var D;return((D=ee.value.find(V=>V.sections.includes(b)))==null?void 0:D.sections)||[]}function Ft(b){const D=Ns(b),V=D.find(fe=>m.value[fe]===!0);return V||D.find(fe=>m.value[fe]!==!1)||null}function qt(b){return u.value&&!C.value&&$e(b)?!0:C.value?Ft(b)===b:Object.hasOwn(m.value,b)?m.value[b]===!0:!0}function an(b){const D=!qt(b);if(C.value){const V={...m.value};for(const fe of Ns(b))V[fe]===!0&&(V[fe]=!1);V[b]=D,m.value=V;return}m.value={...m.value,[b]:D}}function js(){y.value.push(sa(v.value)),y.value.length>ak&&y.value.shift(),T.value=[]}function Vs(){ve.value&&(js(),v.value={},g.value={},k.value=!1)}function qs(b,D=!1){const V=Date.now();if(D&&A.path===b&&V-A.at<ik){A.at=V;return}js(),A={path:b,at:V}}function Ps(b,D,V){if(!D.length)return V;const fe=sa(b??{});let De=fe;for(let gt=0;gt<D.length-1;gt+=1){const it=D[gt];De[it]=sa(De[it]??{}),De=De[it]}return De[D.at(-1)]=V,fe}function On(b){var D;return Object.hasOwn(v.value,b)?v.value[b]:sa((D=e.value)==null?void 0:D[b])}function vt(b,D,V={}){var di;const[fe,...De]=b.path.split(".");qs(b.path,!!V.coalesce);const gt=On(fe),it=De.length?Ps(gt,De,D):D,Ks={...v.value};if(Ni(it,(di=e.value)==null?void 0:di[fe])?delete Ks[fe]:Ks[fe]=it,v.value=Ks,g.value[b.path]){const rd={...g.value};delete rd[b.path],g.value=rd}}function Ms(b){A={path:null,at:0},E.value={...E.value,[b]:String(ye(he.value,b)??"")}}function Gs(b){if(A={path:null,at:0},!Object.hasOwn(E.value,b))return;const D={...E.value};delete D[b],E.value=D}function Qe(b){const D=E.value[b.path];if(A={path:null,at:0},D===""){g.value={...g.value,[b.path]:"Enter a number."};return}const V=Number(D);if(Number.isNaN(V)||b.type==="integer"&&!Number.isInteger(V)){g.value={...g.value,[b.path]:b.type==="integer"?"Enter a whole number.":"Enter a number."};return}const fe={...E.value};delete fe[b.path],E.value=fe,vt(b,V,{coalesce:!0})}function $t(b){return Object.hasOwn(E.value,b.path)?E.value[b.path]:b.value??""}function q(b,D){if(E.value={...E.value,[b.path]:D},D===""){g.value={...g.value,[b.path]:"Enter a number."};return}const V=Number(D);if(!Number.isFinite(V)||b.type==="integer"&&!Number.isInteger(V)){g.value={...g.value,[b.path]:b.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(g.value[b.path]){const fe={...g.value};delete fe[b.path],g.value=fe}vt(b,V,{coalesce:!0})}function ce(b){const D=Number.parseInt(N.value,10);if(!Number.isInteger(D)||D<1){g.value={...g.value,[b.path]:"Warning thresholds must be positive whole numbers."};return}const V=[...new Set([...b.value||[],D])].sort((fe,De)=>De-fe);N.value="",vt(b,V)}function Le(b,D){vt(b,(b.value||[]).filter(V=>V!==D))}function Je(b){return b.apply_mode==="live_read"?"Odin reads the saved file value on next use.":b.apply_mode==="live_for_new_work"?"New work uses the saved file value.":b.apply_mode==="live_apply"?b.apply_handler?`Apply the saved value through ${b.apply_handler}.`:"Apply it through its dedicated owner page or endpoint.":b.apply_mode==="restart"?"Restart Odin for the saved collection to take effect.":b.apply_mode==="activation_required"?"Saving does not enable it. No activation control exists in this release.":b.apply_mode==="dormant"?"This release does not use the saved collection.":"Follow the runtime details shown for this setting."}function rt(b){return b.type==="array"&&Array.isArray(b.value)&&!b.structured_container&&!b.structured_container_child&&b.sensitivity==="public"&&b.value.every(D=>["string","number","boolean"].includes(typeof D))}function Pt(b){const D=String(_.value[b.path]??"").trim();if(!D)return;const V=[...new Set([...b.value||[],D])];_.value={..._.value,[b.path]:""},vt(b,V)}function Ut(b,D){vt(b,(b.value||[]).filter(V=>V!==D))}function wa(b,D){var fe;if(!b)return null;if((fe=b.enum)!=null&&fe.length&&!b.enum.includes(D))return`Choose one of: ${b.enum.join(", ")}`;if(b.path==="agents.final_warning_iterations"&&(!Array.isArray(D)||!D.length))return"Add at least one warning threshold.";const V=b.constraints||{};if((b.type==="integer"||b.type==="number")&&typeof D=="number"){if(V.minimum!==void 0&&D<V.minimum)return`Must be at least ${V.minimum}${b.unit?` ${b.unit}`:""}`;if(V.maximum!==void 0&&D>V.maximum)return`Must be at most ${V.maximum}${b.unit?` ${b.unit}`:""}`}return null}function Ds(b){return K.value[b.path]||null}function ri(b){const D=`${b}.`;return Object.keys(K.value).some(V=>V===b||V.startsWith(D))}function ka(){y.value.length&&(T.value.push(sa(v.value)),v.value=y.value.pop(),g.value={},E.value={},A={path:null,at:0})}function Kn(){T.value.length&&(y.value.push(sa(v.value)),v.value=T.value.pop(),g.value={},E.value={},A={path:null,at:0})}function Sa(){!ve.value||ge.value||(k.value=!0,O.value=!1)}function Wn(){k.value=!1}function Ln(){Vs()}function gs(b){return sk[b]||Aa(b||"unknown")}function ln(b){return`apply-${String(b||"unknown").replaceAll("_","-")}`}function j(b){return`cfgc-field-${b.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function ke(b){return`${j(b)}-input`}function Ae(b){const D=document.getElementById(j(b))||document.getElementById(j(b.split(".").slice(0,2).join(".")));D==null||D.scrollIntoView({behavior:"smooth",block:"center"})}function es(b,D){l.value={type:b,message:D},window.setTimeout(()=>{var V;((V=l.value)==null?void 0:V.message)===D&&(l.value=null)},3500)}function Zn(){r.value=!1,p.value="pending_restart",u.value="";const b=tk(n.value);b&&(b.scrollTop=0)}function Jn(){r.value=!1}function Yn(b=1800){M&&window.clearTimeout(M),M=window.setTimeout(ci,b)}async function ci(){if(c.value){if(I+=1,I>45){c.value=!1,d.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await dr(),x.value===0){c.value=!1,d.value=null,es("success","Odin restarted and the saved startup settings are active.");return}}catch{}Yn(2e3)}}async function Te(){if(!c.value){d.value=null;try{await G.post("/api/restart",{}),c.value=!0,I=0,r.value=!1,Yn()}catch(b){d.value=b.message||"Odin could not schedule a restart."}}}async function L(){if(!(!ve.value||ge.value||a.value)){a.value=!0;try{const b=rk(e.value,v.value),D=await G.put("/api/config",b);e.value=D,v.value={},y.value=[],T.value=[],g.value={},k.value=!1;try{t.value=await dr(),o.value=null,r.value=x.value>0,es("success",x.value?`Configuration saved. ${x.value} setting${x.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(V){o.value=V.message||"Unknown metadata error.",es("error",`Configuration saved, but apply status could not be refreshed: ${o.value}`)}}catch(b){es("error",b.message||"Configuration could not be saved")}finally{a.value=!1}}}async function Y(){var b,D;if(!ve.value){s.value=!0,i.value=null;try{const V=await G.get("/api/config"),fe=await dr();e.value=V,t.value=fe,o.value=null;const De=ee.value;if(De.some(gt=>gt.key===f.value)||(f.value=((b=De[0])==null?void 0:b.key)||Ga[0].key),C.value){const it=(((D=De.find(Ks=>Ks.key===f.value))==null?void 0:D.sections)||[]).find(Ks=>m.value[Ks]===!0);m.value=it?{...m.value,[it]:!0}:{}}}catch(V){i.value=V.message||"Unknown configuration error"}finally{s.value=!1}}}function me(b){if(k.value||!(b.ctrlKey||b.metaKey))return;const D=b.target;D instanceof HTMLElement&&(D.matches("input, textarea, select")||D.isContentEditable)||(!b.shiftKey&&b.key.toLowerCase()==="z"?(b.preventDefault(),ka()):(b.key.toLowerCase()==="y"||b.shiftKey&&b.key.toLowerCase()==="z")&&(b.preventDefault(),Kn()))}function Pe(b){C.value=b.matches}return ls(m,b=>{try{localStorage.setItem(Rm,JSON.stringify(b))}catch{}},{deep:!0}),Ze(()=>{var b;Y(),document.addEventListener("keydown",me),w=window.matchMedia("(max-width: 760px)"),Pe(w),(b=w.addEventListener)==null||b.call(w,"change",Pe)}),mt(()=>{var b;document.removeEventListener("keydown",me),(b=w==null?void 0:w.removeEventListener)==null||b.call(w,"change",Pe),M&&window.clearTimeout(M)}),{config:e,meta:t,loading:s,saving:a,error:i,toast:l,metaRefreshError:o,restartPromptOpen:r,restartScheduled:c,restartError:d,configMain:n,searchQuery:u,healthFilter:p,activeCategory:f,reviewOpen:k,mobileOverflowOpen:O,warningThresholdInput:N,arrayInputs:_,healthFilters:S,visibleCategories:ee,displayGroups:H,reviewGroups:ie,sectionCount:se,fieldCount:B,hasChanges:ve,changeCount:X,changedSectionCount:xe,hasDraftErrors:ge,canUndo:R,canRedo:W,globalFilterActive:Me,reviewRestartCount:de,pendingRestartCount:x,pendingRestartFields:Oe,healthCount:ze,categoryStats:Ue,selectCategory:St,selectHealthFilter:In,clearFilters:zs,sectionLabel:Q,sectionDescription:te,sectionFieldCount:ne,sectionHealthCount:Be,sectionApplySummary:re,sectionApplyDetails:ue,sectionEntries:_e,fieldGroups:z,sectionSearchHits:Ie,mcpConfigSummary:we,fieldRuntimeCopy:pe,fieldSpecificRuntimeNote:Ee,hasHonestAction:Ne,runFieldAction:ut,sectionChanged:ot,fieldChanged:Nt,isSectionExpanded:qt,toggleSection:an,discardAllDrafts:Vs,setFieldValue:vt,setNumberFieldValue:q,numberInputValue:$t,beginInputEdit:Ms,endTextInputEdit:Gs,endInputEdit:Qe,addWarningThreshold:ce,removeWarningThreshold:Le,isScalarArray:rt,addScalarArrayItem:Pt,removeScalarArrayItem:Ut,fieldError:Ds,sectionHasErrors:ri,undo:ka,redo:Kn,openReview:Sa,closeReview:Wn,mobileCancel:Ln,applyModeLabel:gs,applyClass:ln,compactValue:lk,formatValue:ok,structuredApplyCopy:Je,fieldId:j,fieldInputId:ke,focusField:Ae,fetchConfig:Y,saveConfig:L,restartOdin:Te,restartLater:Jn,reviewPendingRestart:Zn}}},pk=/^\d{15,25}$/;function Nm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Pm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=h(""),n=h(!1),a=h(0),i=h(null),l=Z(()=>new Set((e.excludedIds||[]).map(String))),o=Z(()=>{const T=s.value.toLowerCase().trim();return(e.members||[]).filter(k=>l.value.has(String(k.id))?!1:T?u(k).toLowerCase().includes(T)||String(k.username||"").toLowerCase().includes(T)||String(k.id).includes(T):!0)}),r=Z(()=>{const T=s.value.trim();return o.value.length===0&&pk.test(T)&&!l.value.has(T)?T:""}),c=Z(()=>o.value.length+(r.value?1:0)),d=Z(()=>{if(n.value){if(o.value[a.value])return`${e.optionsId}-${a.value}`;if(r.value&&a.value===o.value.length)return`${e.optionsId}-raw`}});function u(T){return Nm(T)}function p(){n.value=!0,a.value=0}function f(){p()}function m(){const T=Math.max(c.value-1,0);a.value=Math.min(a.value+1,T)}function v(){a.value=Math.max(a.value-1,0)}function E(){const T=o.value[a.value];T?N(T):r.value&&a.value===o.value.length&&_(r.value)}function N(T){_(String(T.id))}function _(T){t("select",T),s.value="",n.value=!1,a.value=0}function g(){n.value=!1}function y(){setTimeout(g,150)}return Ze(()=>{e.autofocus&&Ct(()=>{var T;return(T=i.value)==null?void 0:T.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:o,rawId:r,activeOptionId:d,memberName:u,openOptions:p,onInput:f,highlightNext:m,highlightPrevious:v,selectHighlighted:E,selectMember:N,selectId:_,closeOptions:g,onBlur:y}}};function Hu(e,t,s){var n;return((n=e==null?void 0:e.config)==null?void 0:n[t])!=null?e.config[t]:s==null?void 0:s[t]}const fk={components:{DiscordUserCombobox:Pm},template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h(null),i=h(null),l=h(!1),o=h(null),r=h({}),c=h([]);let d=0;const u=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked users; prefix commands use separate authorization and allowed test webhooks bypass this gate.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Absolute gate for ordinary conversational intake. Guild/channel settings cannot readmit blocked channels; prefix commands use separate authorization.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Ignored unless the bot explicitly mentions Odin; the effective respond-to-bots policy still applies.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),p=Z(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),f=Z(()=>new Map(c.value.map(B=>[String(B.id),B])));function m(B){return B.config&&B.config.enabled!==void 0?B.config.enabled:!0}function v(B){return Hu(B,"require_mention",a.value)}function E(B){return Hu(B,"respond_to_bots",a.value)}function N(B){return B.config&&Object.keys(B.config).length>0}function _(B){n.value[B]=!n.value[B]}function g(B){const S=B.discord||{};return{allowed_users:[...S.allowed_users||[]],channels:[...S.channels||[]],respond_to_bots:!!S.respond_to_bots,require_mention:!!S.require_mention,ignore_bot_ids:[...S.ignore_bot_ids||[]]}}async function y({showLoading:B=!0}={}){const S=++d;B&&(t.value=!0),s.value=null;try{const R=await G.get("/api/discord/guilds");S===d&&(e.value=R)}catch(R){S===d&&(s.value=R.message)}finally{B&&S===d&&(t.value=!1)}}async function T(){t.value=!0,s.value=null;try{const[B,S,R]=await Promise.all([G.get("/api/discord/guilds"),G.get("/api/discord/members").catch(()=>[]),G.get("/api/config")]),W=g(R),ee=p.value;a.value=W,ee||(i.value=JSON.parse(JSON.stringify(W))),c.value=S,e.value=B,o.value=null}catch(B){s.value=B.message}finally{t.value=!1}}let k=Promise.resolve();const O=h(new Set);function C(B,S){const R=new Set(O.value);R.add(B),O.value=R;const W=k.then(S);return k=W.catch(()=>{}),W.finally(()=>{const ee=new Set(O.value);ee.delete(B),O.value=ee})}function w(B,S,R,W){const ee=(W==null?void 0:W.target)??null;return C(`guild:${B}:${S}`,async()=>{try{await G.put("/api/discord/guild/"+B+"/config",{[S]:R}),await y({showLoading:!1})}catch(he){s.value=he.message,ee&&typeof R=="boolean"&&(ee.checked=!R)}})}function M(B,S,R,W,ee){const he=(ee==null?void 0:ee.target)??null;return C(`channel:${B}:${R}`,async()=>{try{await G.put("/api/discord/channel/"+B+"/config",{[R]:W}),await y({showLoading:!1})}catch(le){s.value=le.message,he&&typeof W=="boolean"&&(he.checked=!W)}})}function A(B,S){return C(`channel:${B}:clear`,async()=>{try{await G.put("/api/discord/channel/"+B+"/config",{clear:!0}),await y({showLoading:!1})}catch(R){s.value=R.message}})}function I(B,S){const R=String(S);if(!B.userAutocomplete)return R;const W=f.value.get(R);return W?Nm(W):R}function $(B,S=null){const R=String(S??r.value[B]??"").trim();!R||i.value[B].includes(R)||(i.value[B]=[...i.value[B],R],r.value={...r.value,[B]:""})}function F(B,S){i.value[B]=i.value[B].filter(R=>R!==S)}async function se(){if(!(!p.value||l.value)){l.value=!0,o.value=null;try{const S=(await G.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...S.allowed_users||[]],channels:[...S.channels||[]],respond_to_bots:!!S.respond_to_bots,require_mention:!!S.require_mention,ignore_bot_ids:[...S.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(B){o.value=B.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ze(T),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:o,globalArrayInputs:r,globalMembers:c,globalListEditors:u,globalChanged:p,guildEnabled:m,guildMention:v,guildBots:E,hasOverride:N,toggleGuild:_,fetchAll:T,fetchGuilds:y,setGuildConfig:w,setChannelConfig:M,clearOverride:A,mutationPending:O,globalItemLabel:I,addGlobalItem:$,removeGlobalItem:F,saveGlobalDefaults:se}}},bs=e=>e==null?e:JSON.parse(JSON.stringify(e));function hk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:o=()=>{},onError:r=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let f=null;const m=new Map;function v(k){d+=1;const O=c.then(k,k);return c=O.catch(()=>{}),O}function E(k,O){f=bs(k),m.clear();for(const[C,w]of Object.entries(O||{}))m.set(C,bs(w))}function N(k){const O=bs(k),C=++u;return v(async()=>{try{await e(bs(O)),f=bs(O),C===u&&n(bs(O))}catch(w){C===u&&(a(bs(f)),r(w,{kind:"default"}))}})}function _(k,O){const C=bs(O),w=(p.get(k)||0)+1;return p.set(k,w),v(async()=>{try{await t(k,bs(C)),m.set(k,bs(C)),w===p.get(k)&&i(k,bs(C))}catch(M){w===p.get(k)&&(l(k,bs(m.get(k)??null)),r(M,{kind:"user",uid:k}))}})}function g(k){const O=(p.get(k)||0)+1;return p.set(k,O),v(async()=>{try{await s(k),m.delete(k),O===p.get(k)&&o(k)}catch(C){O===p.get(k)&&(l(k,bs(m.get(k)??null)),r(C,{kind:"delete",uid:k}))}})}async function y(){for(;;){const k=c;if(await k,k===c)return d}}async function T(k){for(;;){const O=await y(),C=await k();if(O===d)return C}}return{seed:E,saveDefault:N,saveUser:_,deleteUser:g,whenIdle:y,readSnapshot:T,get revision(){return d}}}const mk={components:{DiscordUserCombobox:Pm},template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),o=h([]),r=Z(()=>{const A={};for(const I of o.value)A[I.id]=I;return A});function c(A){return r.value[A]||null}function d(A,I){return A?A.allowed_hosts===null||A.allowed_hosts===void 0?{allowed_hosts:[...I],default_host:A.default_host||"",allow_all:!0}:{allowed_hosts:A.allowed_hosts,default_host:A.default_host||"",allow_all:!1}:{allowed_hosts:[...I],default_host:I[0]||"",allow_all:!0}}const u=hk({applyDefault:async A=>{const I=A.allow_all?null:A.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:I,default_host:A.default_host})},applyUser:async(A,I)=>{const $=I.allow_all?null:I.allowed_hosts;await G.put(`/api/host-access/user/${A}`,{allowed_hosts:$,default_host:I.default_host})},applyDelete:A=>G.del(`/api/host-access/user/${A}`),onDefaultConfirmed:()=>Re.success("Default policy updated"),onDefaultRollback:A=>{A&&(a.value=A)},onUserConfirmed:A=>{const I=c(A);Re.success(`Updated access for ${I?I.display_name:A}`)},onUserRollback:(A,I)=>{const $={...i.value};I?$[A]=I:delete $[A],i.value=$},onUserDeleted:A=>{const I={...i.value};delete I[A],i.value=I},onError:(A,I)=>{var F;const $=I.uid?` ${((F=c(I.uid))==null?void 0:F.display_name)||I.uid}`:"";Re.error(`${A.message||"Failed to save"} — reverted${$}`)}});let p=0;async function f(){const A=++p;e.value=!0,t.value="";try{const I=await u.readSnapshot(()=>G.get("/api/host-access"));if(A!==p)return;s.value=I,n.value=I.available_hosts||[],a.value=d(I.default_policy,n.value);const $=I.users||{},F={};for(const[se,B]of Object.entries($))F[se]=d(B,n.value);i.value=F,u.seed(a.value,F)}catch(I){A===p&&(t.value=I.message||"Failed to fetch host access data")}finally{A===p&&(e.value=!1)}try{const I=await G.get("/api/discord/members")||[];A===p&&(o.value=I)}catch{A===p&&(o.value=[])}}const m=500,v=new Map;function E(A,I){const $=v.get(A);$&&clearTimeout($.timer);const F={run:I,timer:null};F.timer=setTimeout(()=>{v.delete(A),I()},m),v.set(A,F)}function N(A){const I=v.get(A);I&&(clearTimeout(I.timer),v.delete(A))}function _(){for(const[A,I]of[...v])clearTimeout(I.timer),v.delete(A),I.run()}function g(){E("default",()=>u.saveDefault(a.value))}function y(A,I){a.value.allow_all=!1,I?a.value.allowed_hosts.includes(A)||a.value.allowed_hosts.push(A):(a.value.allowed_hosts=a.value.allowed_hosts.filter($=>$!==A),a.value.default_host===A&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function T(A){E(`user:${A}`,()=>{const I=i.value[A];I&&u.saveUser(A,I)})}function k(A,I,$){const F=i.value[A];F&&(F.allow_all=!1,$?F.allowed_hosts.includes(I)||F.allowed_hosts.push(I):(F.allowed_hosts=F.allowed_hosts.filter(se=>se!==I),F.default_host===I&&(F.default_host=F.allowed_hosts[0]||"")),T(A))}function O(A,I){const $=i.value[A];$&&($.default_host=I,T(A))}function C(){l.value=!0}function w(A){!/^\d{15,25}$/.test(A)||i.value[A]||(i.value[A]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},u.saveUser(A,i.value[A]),l.value=!1)}async function M(A){const I=c(A);await Qt({title:"Remove user override",message:`Remove the host access override for ${I?I.display_name:A}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(N(`user:${A}`),await u.deleteUser(A),i.value[A]||Re.success(`Removed override for ${I?I.display_name:A}`))}return Ze(f),vs(_),mt(_),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:o,fetchData:f,saveDefaultPolicy:g,toggleDefaultHost:y,getMember:c,toggleUserHost:k,setUserDefault:O,openAddUser:C,addUserById:w,deleteUser:M,flushPendingSaves:_}}},vk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),o=h(null),r=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=Z(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=Z(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function m(){e.value=!0,t.value="";try{const C=await G.get("/api/tokens");s.value=C.tokens||[],n.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function v(C){return!C||!C.trim()?[]:C.split(",").map(w=>w.trim()).filter(Boolean)}function E(C,w){const M=c.value.allowed_hosts;if(w&&!M.includes(C)&&M.push(C),!w){const A=M.indexOf(C);A>=0&&M.splice(A,1)}}function N(C,w){const M=d.value.allowed_hosts;if(w&&!M.includes(C)&&M.push(C),!w){const A=M.indexOf(C);A>=0&&M.splice(A,1)}}async function _(){var C;i.value=!0;try{const w=v(c.value.allowed_tools_str),M=c.value.host_mode,A=M==="none"?[]:M==="select"?c.value.allowed_hosts:null,I={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:w.length?w:[]};A!==null&&(I.allowed_hosts=A),I.default_host=c.value.default_host||"";const $=await G.post("/api/tokens",I);l.value=$.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Re.success("Token created"),await m()}catch(w){Re.error(((C=w.data)==null?void 0:C.error)||w.message||"Failed to create token")}finally{i.value=!1}}function g(C){o.value=C;const w=C.allowed_hosts;let M="default";w==null?M="default":Array.isArray(w)&&w.length===0?M="none":Array.isArray(w)&&(M="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:M,allowed_hosts:Array.isArray(w)?[...w]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function y(){var C;if(o.value){r.value=!0;try{const w=v(d.value.allowed_tools_str),M=d.value.host_mode,A={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:w};M==="none"?A.allowed_hosts=[]:M==="select"?A.allowed_hosts=d.value.allowed_hosts:A.allowed_hosts=null,A.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(o.value.user_id),A),o.value=null,Re.success("Token updated"),await m()}catch(w){Re.error(((C=w.data)==null?void 0:C.error)||w.message||"Failed to update")}finally{r.value=!1}}}async function T(C){var M;if(await Qt({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const A=await G.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=A.token,Re.success("Token regenerated")}catch(A){Re.error(((M=A.data)==null?void 0:M.error)||A.message||"Failed to regenerate")}}async function k(C){var M;if(await Qt({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(C.user_id)),Re.success("Token deleted"),await m()}catch(A){Re.error(((M=A.data)==null?void 0:M.error)||A.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),Re.success("Copied to clipboard")}catch{Re.error("Copy failed — select and copy manually")}}return Ze(m),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:o,saving:r,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:m,tierBadge:f,toggleCreateHost:E,toggleEditHost:N,createToken:_,startEdit:g,saveEdit:y,confirmRegenerate:T,confirmDelete:k,copyToken:O}}},gk=Object.freeze(["enabled","model","reasoning_effort","agent_reasoning_effort","agent_model"]),bk=Object.freeze(["request_timeout_seconds","stream_stall_timeout_seconds","retry","connection_pool","context_compression","context_budget_overrides","context_utilization"]),yk=Object.freeze(["enabled","base_url","model","max_tokens"]),xk=Object.freeze(["enabled","model","max_tokens"]);function Bo(e,t){return Object.fromEntries(t.map(s=>[s,e[s]]))}function zu(e){return Bo(e,gk)}function ju(e){return Bo(e,bk)}function _k(e,{includeApiKey:t=!1}={}){const s=Bo(e,yk);return t&&(s.api_key=e.api_key),s}function wk(e){return{timeout:e.timeout}}function kk(e,{includeApiKey:t=!1}={}){const s=Bo(e,xk);return t&&(s.api_key=e.api_key),s}function Sk(e){return{timeout:e.timeout}}function Tl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Tk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("codex"),a=h({enabled:!1,model:"gpt-5.6-sol",reasoning_effort:"xhigh",agent_reasoning_effort:"auto",agent_model:"auto",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:null,keep_recent_iterations:30},context_budget_overrides:{},context_utilization:60}),i=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],l=Z(()=>{const j=a.value.model;return j&&!i.includes(j)?[j,...i]:i}),o=Z(()=>{const j=a.value.agent_model;return j&&j!=="auto"&&!i.includes(j)?[j,...i]:i}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],c=Z(()=>!r.includes(a.value.model)&&!(r.includes(a.value.agent_model)&&a.value.agent_reasoning_effort==="")),d=Z(()=>{const j=a.value.agent_model;return j==="auto"?!0:!r.includes(j||a.value.model)}),u=Z(()=>{const j=a.value.agent_reasoning_effort;return j==="auto"?!1:(j||a.value.reasoning_effort)==="max"}),p=j=>r.includes(j)&&(a.value.reasoning_effort==="max"||a.value.agent_model===""&&u.value),f=j=>r.includes(j)&&u.value,m=h({enabled:!1,model:"gpt-5.6-luna"}),v=h({unavailable_reason:null}),E=Z(()=>{const j=m.value.model;return j&&!i.includes(j)?[j,...i]:i});function N(j){const ke=j.target.value;m.value.enabled=ke!=="",ke!==""&&(m.value.model=ke),$t()}const _=h(!1),g=h({codex:!1,ollama:!1,kimi:!1}),y=h(null),T=h(!1),k=h(""),O=h(null),C=h(!1);let w=0;const M=Z(()=>{var j;return Object.entries(((j=y.value)==null?void 0:j.models)||{}).map(([ke,Ae])=>{var es,Zn,Jn;return{model:ke,floor:Ae.floor,override:Ae.override,effectiveBudget:(es=Ae.effective)==null?void 0:es.effective_budget,configuredPrimaryChars:(Zn=Ae.configured)==null?void 0:Zn.primary_chars,primaryChars:(Jn=Ae.effective)==null?void 0:Jn.primary_chars,provenance:Ae.provenance,clampExpiresAt:Ae.clamp_expires_at}})}),A=Z(()=>{var j;return((j=y.value)==null?void 0:j.clamps)||[]}),I=Z(()=>{var j,ke;return((ke=(j=y.value)==null?void 0:j.models)==null?void 0:ke[a.value.model])||null}),$=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),F=h({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),se=h(!1),B=h(!1),S=h(!1),R=h(!1),W=h(!1),ee=h(!1),he=h(!1),le=h({configured:null}),ve=h(!1),X=h([]),xe=h(""),Me=h(!1),K=h(!1),ge=h({configured:null}),H=h(!1),ie=h([]),de=h(""),Oe=h(!1),x=h(!1),P=h(!0),U=h(""),ne=h({configured:null,accounts:[]}),Q=h(null),te=h(null),be=h(""),re=h(null),ue=h(!1),ae=h(null),we=h(null),ye=h("");let _e=null;function oe(j,ke="success"){Re(j,ke==="error"?"error":"success")}function z(j){if(!j)return"?";const ke=j/(1024*1024*1024);return ke>=1?ke.toFixed(1)+" GB":(j/(1024*1024)).toFixed(0)+" MB"}function pe(j){return Number.isFinite(Number(j))?Number(j).toLocaleString():"—"}function Se(j){return j==null?"automatic (model-derived)":Number(j).toLocaleString()+" characters"}function Ee(j){const ke=new Date(j);return Number.isNaN(ke.getTime())?"unknown":ke.toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}function Ne(j){return typeof j=="string"&&j.length>12?j.slice(0,8)+"…"+j.slice(-4):j}function ut(j){return j==="temporary learned clamp"?"is-clamp":j==="override"?"is-override":"is-built-in"}function J(j){const ke=a.value.context_budget_overrides[j.model];return j.floor!=null&&Number.isFinite(Number(ke))&&Number(ke)>j.floor}function Ie(j,ke){const Ae={...a.value.context_budget_overrides};ke.target.value===""?delete Ae[j]:Ae[j]=Number(ke.target.value),a.value.context_budget_overrides=Ae,C.value=!0}function $e(j){a.value.context_utilization=j.target.value===""?"":Number(j.target.value),C.value=!0}function Be(j){const ke={...a.value.context_budget_overrides};delete ke[j],a.value.context_budget_overrides=ke,C.value=!0}async function ze(){e.value=!0,await Promise.all([Ue(),Nt(),qt(),St(),ot()]),e.value=!1}async function Ue({preserveBasic:j=!1,preserveAdvanced:ke=!1}={}){try{const Ae=await G.get("/api/llm/status");t.value=Ae,s.value=!1,n.value=Ae.active_provider||"codex",Ae.codex&&!Qe.pending()&&(j||(a.value.enabled=Ae.codex.enabled,a.value.model=Ae.codex.model||"gpt-5.6-sol",a.value.reasoning_effort=Ae.codex.reasoning_effort||"medium",a.value.agent_reasoning_effort=Ae.codex.agent_reasoning_effort||"",a.value.agent_model=Ae.codex.agent_model||""),ke||(a.value.request_timeout_seconds=Ae.codex.request_timeout_seconds??a.value.request_timeout_seconds,a.value.stream_stall_timeout_seconds=Ae.codex.stream_stall_timeout_seconds??a.value.stream_stall_timeout_seconds,a.value.retry={...a.value.retry,...Ae.codex.retry||{}},a.value.connection_pool={...a.value.connection_pool,...Ae.codex.connection_pool||{}},a.value.context_compression={...a.value.context_compression,...Ae.codex.context_compression||{}},!C.value&&!S.value&&(a.value.context_budget_overrides={...Ae.codex.context_budget_overrides||{}},a.value.context_utilization=Ae.codex.context_utilization??a.value.context_utilization))),Ae.ollama&&!q.pending()&&(j||($.value.enabled=Ae.ollama.enabled,$.value.base_url=Ae.ollama.base_url||"",$.value.model=Ae.ollama.model||"",$.value.max_tokens=Ae.ollama.max_tokens||4096),ke||($.value.timeout=Ae.ollama.timeout??$.value.timeout)),Ae.kimi&&!ce.pending()&&(j||(F.value.enabled=Ae.kimi.enabled,F.value.model=Ae.kimi.model||"",F.value.max_tokens=Ae.kimi.max_tokens||4096),ke||(F.value.timeout=Ae.kimi.timeout??F.value.timeout)),Ae.auxiliary&&(v.value=Ae.auxiliary,$t.pending()||(m.value.enabled=Ae.auxiliary.enabled,m.value.model=Ae.auxiliary.model||"gpt-5.6-luna"))}catch{t.value||(t.value={active_provider:"",codex:{configured:null},ollama:{configured:null},kimi:{configured:null}}),s.value=!0}}async function ot(){const j=++w;T.value=!0,k.value="";try{const ke=await G.get("/api/context/windows");if(j!==w)return;y.value=ke,!S.value&&!C.value&&(a.value.context_budget_overrides=Object.fromEntries(Object.entries(ke.models||{}).filter(([,Ae])=>Ae.override!=null).map(([Ae,es])=>[Ae,es.override])),a.value.context_utilization=ke.utilization??a.value.context_utilization)}catch(ke){j===w&&(k.value=ke.message||"Failed to load context budgets")}finally{j===w&&(T.value=!1)}}async function Nt(){try{if(le.value=await G.get("/api/ollama/status"),ve.value=!1,le.value.model&&(xe.value=le.value.model),le.value.configured)try{const j=await G.get("/api/ollama/models");X.value=j.models||[]}catch{X.value=[]}else if($.value.base_url)try{const j=await G.post("/api/ollama/probe-models",{base_url:$.value.base_url});X.value=j.models||[]}catch{X.value=[]}}catch{ve.value=!0}}async function St(){P.value=!0,U.value="";try{ne.value=await G.get("/api/codex/status")}catch(j){U.value=j.message||"Failed to fetch Codex status"}finally{P.value=!1}}async function In(){const j=t.value?t.value.active_provider:"codex";he.value=!0;try{const ke=await G.post("/api/llm/switch",{provider:n.value});ke.error?(n.value=j,oe(ke.error,"error")):(oe("Switched to "+n.value+" ("+ke.model+")"),await ze())}catch(ke){n.value=j,oe(ke.message||"Switch failed","error")}finally{he.value=!1}}async function zs(){Me.value=!0;try{const j=await G.post("/api/ollama/reload");oe(j.configured?"Ollama reloaded":j.reason||"Ollama not configured",j.configured?"success":"error"),await ze()}catch(j){oe(j.message||"Reload failed","error")}finally{Me.value=!1}}async function Ns(){K.value=!0;try{await G.post("/api/ollama/model",{model:xe.value}),oe("Model set to "+xe.value),await ze()}catch(j){oe(j.message||"Failed","error")}finally{K.value=!1}}async function Ft(){const j=$.value.base_url;if(!j){oe("Enter a base URL first","error");return}ee.value=!0;try{const ke=await G.post("/api/ollama/probe-models",{base_url:j});X.value=ke.models||[],X.value.length?(oe(X.value.length+" model(s) found"),!$.value.model&&X.value.length&&($.value.model=X.value[0].name)):oe("No models found at "+j,"error")}catch(ke){oe(ke.message||"Could not reach Ollama","error")}finally{ee.value=!1}}async function qt(){try{if(ge.value=await G.get("/api/kimi/status"),H.value=!1,ge.value.model&&(de.value=ge.value.model),ge.value.configured)try{const j=await G.get("/api/kimi/models");ie.value=j.models||[]}catch{ie.value=[]}}catch{H.value=!0}}async function an(){Oe.value=!0;try{const j=await G.post("/api/kimi/reload");oe(j.configured?"Kimi reloaded":j.reason||"Kimi not configured",j.configured?"success":"error"),await ze()}catch(j){oe(j.message||"Reload failed","error")}finally{Oe.value=!1}}async function js(){x.value=!0;try{await G.post("/api/kimi/model",{model:de.value}),oe("Model set to "+de.value),await ze()}catch(j){oe(j.message||"Failed","error")}finally{x.value=!1}}async function Vs(){if(S.value){Qe();return}S.value=!0;const j=zu(a.value);try{await G.put("/api/llm/codex/config",j),oe("Codex config saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),St()])}catch(ke){oe(ke.message||"Failed","error");const Ae=JSON.stringify(zu(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:Ae,preserveAdvanced:!0}),St()])}finally{S.value=!1}}async function qs(){if(S.value)return;S.value=!0;const j=ju(a.value);try{await G.put("/api/llm/codex/config",j),JSON.stringify({context_budget_overrides:a.value.context_budget_overrides,context_utilization:a.value.context_utilization})===JSON.stringify({context_budget_overrides:j.context_budget_overrides,context_utilization:j.context_utilization})&&(C.value=!1),oe("Codex advanced settings saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),St(),ot()])}catch(ke){oe(ke.message||"Failed","error");const Ae=JSON.stringify(ju(a.value))!==JSON.stringify(j);await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:Ae}),St(),ot()])}finally{S.value=!1}}async function Ps(){if(R.value){q();return}R.value=!0;try{const j=se.value?$.value.api_key:null,ke=_k($.value,{includeApiKey:j!==null});await G.put("/api/llm/ollama/config",ke),oe("Ollama config saved"),j!==null&&$.value.api_key===j&&($.value.api_key="",se.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(j){oe(j.message||"Failed","error")}finally{R.value=!1}}async function On(){if(!R.value){R.value=!0;try{await G.put("/api/llm/ollama/config",wk($.value)),oe("Ollama timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),Nt()])}catch(j){oe(j.message||"Failed","error")}finally{R.value=!1}}}async function vt(){if(W.value){ce();return}W.value=!0;try{const j=B.value?F.value.api_key:null,ke=kk(F.value,{includeApiKey:j!==null});await G.put("/api/llm/kimi/config",ke),oe("Kimi config saved"),j!==null&&F.value.api_key===j&&(F.value.api_key="",B.value=!1),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),qt()])}catch(j){oe(j.message||"Failed","error")}finally{W.value=!1}}async function Ms(){if(!W.value){W.value=!0;try{await G.put("/api/llm/kimi/config",Sk(F.value)),oe("Kimi timeout saved"),await Promise.all([Ue({preserveBasic:!0,preserveAdvanced:!0}),qt()])}catch(j){oe(j.message||"Failed","error")}finally{W.value=!1}}}async function Gs(){if(_.value){$t();return}_.value=!0;try{await G.put("/api/llm/auxiliary/config",m.value),oe("Auxiliary config saved"),await Ue()}catch(j){oe(j.message||"Failed","error"),await Ue()}finally{_.value=!1}}const Qe=Tl(Vs),$t=Tl(Gs),q=Tl(Ps),ce=Tl(vt),Le=()=>(Qe.cancel(),Vs()),Je=()=>(q.cancel(),Ps()),rt=()=>(ce.cancel(),vt()),Pt=()=>qs(),Ut=()=>On(),wa=()=>Ms();async function Ds(j){const ke=j.account_key+":"+j.model;O.value=ke;try{const Ae=await G.post("/api/context/windows/clear",{account_key:j.account_key,model:j.model});oe(Ae.cleared?"Temporary clamp cleared":"Clamp was already inactive"),await ot()}catch(Ae){oe(Ae.message||"Failed to clear clamp","error"),await ot()}finally{O.value=null}}async function ri(j){try{await G.post("/api/codex/account/"+j+"/activate"),oe("Active account switched"),await St()}catch(ke){oe(ke.message||"Failed","error")}}async function ka(j){Q.value=j;try{await G.post("/api/codex/account/"+j+"/refresh"),oe("Token refreshed"),await St()}catch(ke){oe(ke.message||"Refresh failed","error")}finally{Q.value=null}}function Kn(j,ke){te.value=j,be.value=ke||""}async function Sa(j){try{await G.put("/api/codex/account/"+j+"/label",{label:be.value}),oe("Label updated"),te.value=null,await St()}catch(ke){oe(ke.message||"Failed","error")}}async function Wn(j,ke){if(await Qt({title:"Delete Codex account",message:`Delete ${ke||"account #"+(j+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+j),oe("Deleted. Pool reloaded."),await St()}catch(es){oe(es.message||"Failed","error")}}async function Ln(){ue.value=!0;try{const j=await G.post("/api/codex/device-code");ae.value=j,re.value="pending",gs(j)}catch(j){oe(j.message||"Failed","error")}finally{ue.value=!1}}async function gs(j){_e={cancelled:!1};const ke=_e;try{const Ae=await G.post("/api/codex/device-poll",{device_auth_id:j.device_auth_id,user_code:j.user_code,interval:j.interval});if(ke.cancelled)return;we.value=Ae,re.value="success",await ze()}catch(Ae){if(ke.cancelled)return;ye.value=Ae.message||"Device login failed",re.value="error"}}function ln(){_e&&(_e.cancelled=!0),re.value=null,ae.value=null}return Ze(ze),mt(()=>{_e&&(_e.cancelled=!0),Qe.cancel(),$t.cancel(),q.cancel(),ce.cancel()}),{loading:e,llmStatus:t,llmStatusLoadFailed:s,selectedProvider:n,switching:he,advancedOpen:g,codexForm:a,codexModelOptions:l,codexAgentModelOptions:o,mainMaxAllowed:c,agentMaxAllowed:d,mainModelOptionDisabled:p,agentModelOptionDisabled:f,auxForm:m,auxData:v,auxModelOptions:E,onAuxModelChange:N,savingAux:_,saveAuxConfigDebounced:$t,ollamaForm:$,kimiForm:F,savingCodex:S,savingOllama:R,savingKimi:W,probingOllama:ee,ollamaKeyDirty:se,kimiKeyDirty:B,fetchCodexStatus:St,ollamaStatus:le,ollamaStatusLoadFailed:ve,ollamaModels:X,ollamaSelectedModel:xe,reloading:Me,settingModel:K,kimiStatus:ge,kimiStatusLoadFailed:H,kimiModels:ie,kimiSelectedModel:de,reloadingKimi:Oe,settingKimiModel:x,codexLoading:P,codexError:U,codexData:ne,refreshing:Q,editingLabel:te,labelValue:be,contextWindows:y,contextWindowsLoading:T,contextWindowsError:k,contextBudgetRows:M,activeClampRows:A,activeContextBudget:I,clearingClamp:O,contextPolicyDirty:C,deviceState:re,deviceLoading:ue,deviceInfo:ae,deviceResult:we,deviceError:ye,fetchAll:ze,fetchLLMStatus:Ue,fetchOllamaStatus:Nt,fetchKimiStatus:qt,switchProvider:In,reloadOllama:zs,setOllamaModel:Ns,reloadKimi:an,setKimiModel:js,probeOllamaModels:Ft,saveCodexConfig:Vs,saveOllamaConfig:Ps,saveKimiConfig:vt,saveCodexAdvancedConfig:qs,saveOllamaAdvancedConfig:On,saveKimiAdvancedConfig:Ms,saveCodexConfigDebounced:Qe,saveOllamaConfigDebounced:q,saveKimiConfigDebounced:ce,saveCodexConfigNow:Le,saveOllamaConfigNow:Je,saveKimiConfigNow:rt,saveCodexAdvancedConfigNow:Pt,saveOllamaAdvancedConfigNow:Ut,saveKimiAdvancedConfigNow:wa,activateAccount:ri,refreshAccount:ka,startEditLabel:Kn,saveLabel:Sa,deleteAccount:Wn,startDeviceLogin:Ln,cancelDeviceLogin:ln,formatSize:z,fetchContextWindows:ot,clearContextClamp:Ds,setContextOverride:Ie,setContextUtilization:$e,resetContextOverride:Be,overrideAboveFloor:J,formatCount:pe,formatContextCeiling:Se,formatExpiry:Ee,shortAccountKey:Ne,provenanceClass:ut}}},Vu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Ck(e){return Vu[e]||Vu[(e||"").toLowerCase()]||"text-gray-400"}const Ek={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),o=h(null),r=h(null),c=h(null),d=Z(()=>{var k;return Object.values(((k=i.value)==null?void 0:k.totals)||{}).reduce((O,C)=>O+Number(C||0),0)}),u=h(""),p=h(0),f=h([]),m=Z(()=>f.value.map(k=>`${k.label} (${k.path}${k.reason?`: ${k.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let E=null;async function N(){var M;const k=await Promise.allSettled(v.map(A=>G.get(A.path))),O=A=>k[A].status==="fulfilled"?k[A].value:null;t.value=O(0)||{};const C=O(1);s.value=Array.isArray(C)?C:C&&C.subsystems||[],n.value=O(2)||{},a.value=O(3)||{},i.value=O(4),l.value=O(5),o.value=O(6),r.value=O(7),c.value=O(8);const w=k.filter(A=>A.status==="rejected");if(f.value=k.flatMap((A,I)=>{var $;return A.status==="rejected"?[{...v[I],reason:(($=A.reason)==null?void 0:$.message)||"request failed"}]:[]}),p.value=f.value.length,w.length===k.length){const A=(M=w[0])==null?void 0:M.reason;u.value=(A==null?void 0:A.message)||"Failed to load internals"}else u.value="";e.value=!1}function _(){e.value=!0,u.value="",N()}let g=!1;function y(){g||(g=!0,N(),E||(E=setInterval(N,3e4)))}function T(){g&&(g=!1,E&&(clearInterval(E),E=null))}return Ze(y),ks(y),vs(T),mt(T),{loading:e,error:u,failedCount:p,failedEndpoints:f,failedEndpointSummary:m,endpoints:v,retry:_,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,riskTotal:d,recoveryStats:l,compressionStats:o,freshnessStats:r,governorStats:c,statusColor:Ck,formatAgeSeconds:aw}}},Ak={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),o=h(null),r=h(!1);async function c(){a.value=!0,o.value=null,r.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(o.value=u.error),r.value=!0}catch(u){o.value=u.message}finally{a.value=!1}}async function d(){if(await Qt({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,o.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){o.value=p.message}finally{i.value=!1}}}return Ze(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:o,checkDone:r,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Mm=[{id:"health",label:"Health",component:Ww},{id:"resources",label:"Resources",component:Zw},{id:"logs",label:"Logs",component:Xw},{id:"config",label:"Config",component:uk},{id:"discord",label:"Discord",component:fk},{id:"host-access",label:"Host Access",component:mk},{id:"api-tokens",label:"API Tokens",component:vk},{id:"llm",label:"LLM Config",component:Tk},{id:"internals",label:"Internals",component:Ek},{id:"update",label:"Update",component:Ak}],Rk={components:{TabbedPage:Uo},setup(){return{tabs:Mm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},Cl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Ik=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...Cl("Operations","operations","/operations",Cm),...Cl("History","history","/history",Em),...Cl("Capabilities","capabilities","/capabilities",Am),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...Cl("System","system","/system",Mm)],us=qn({open:!1,query:"",selected:0});function qu(){us.query="",us.selected=0,us.open=!0}function ur(){us.open=!1}function Ok(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Lk={setup(){const e=bm(),t=h(null),s=Z(()=>{const i=us.query.trim().toLowerCase();return Ik.map(l=>({...l,_score:Ok(l,i)})).filter(l=>l._score>0).sort((l,o)=>o._score-l._score)});ls(()=>us.open,async i=>{var l;i&&(await Ct(),(l=t.value)==null||l.focus())}),ls(()=>us.query,()=>{us.selected=0});function n(i){ur(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),ur();return}if(i.key==="ArrowDown")i.preventDefault(),us.selected=Math.min(us.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),us.selected=Math.max(us.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[us.selected];l&&n(l)}}return{state:us,results:s,inputEl:t,go:n,onKeydown:a,closePalette:ur}},template:`
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
  `},Kr={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",plus:"M12 5v14M5 12h14",network:"M12 3v4m0 10v4M3 12h4m10 0h4M7.8 7.8l2.1 2.1m4.2 4.2 2.1 2.1m0-8.4-2.1 2.1m-4.2 4.2-2.1 2.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Kr));const Nk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Za("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Za("path",{d:Kr[e.name]||Kr.info})])}},Pk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Gu(e){return[...e.querySelectorAll(Pk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Mk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Gu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Gu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},Dk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),o=h(!1),r=h([]),c=h(0),d=h(null),u=h({reload:!1,clearSessions:!1,stopLoops:!1});let p=0;const f=Z(()=>{const F=e.value.uptime_seconds||0,se=Math.floor(F/86400),B=Math.floor(F%86400/3600),S=Math.floor(F%3600/60),R=[];return se>0&&R.push(`${se}d`),B>0&&R.push(`${B}h`),(R.length===0||se===0&&B===0)&&R.push(`${S}m`),R.join(" ")}),m=Z(()=>{const F=e.value.uptime_seconds||0;return 125.66*(1-Math.min(F/86400,1))}),v=Z(()=>{const F=e.value;return[{label:"Guilds",value:F.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:F.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:F.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${F.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:F.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:F.loop_count>0?"text-green-400":"",highlight:F.loop_count>0},{label:"Agents",value:F.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:F.agent_count>0?`${F.agent_count} total`:"",subColor:"text-gray-500",highlight:(F.agent_running??0)>0},{label:"Processes",value:F.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:F.process_count>0?`${F.process_count} total`:"",subColor:"text-gray-500",highlight:(F.process_running??0)>0},{label:"Schedules",value:F.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(F.schedule_failing>0?`${F.schedule_failing} failing`:"")+(F.schedule_failing>0&&F.schedule_paused>0?", ":"")+(F.schedule_paused>0?`${F.schedule_paused} paused`:"")||void 0,subColor:F.schedule_failing>0?"text-red-400":"text-yellow-400",color:F.schedule_failing>0?"text-red-400":"",highlight:F.schedule_failing>0},{label:"Users",value:F.user_count??0,icon:"users",iconColor:"text-indigo-400"},...d.value!==null?[{label:"Knowledge",value:d.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),E=Z(()=>{const F=e.value,se=[];return se.push({label:"Bot",status:F.status==="online"?"ok":"warn",detail:F.status==="online"?"Online":"Starting"}),(F.schedule_failing||0)>0?se.push({label:"Schedules",status:"error",detail:`${F.schedule_failing} failing`}):(F.schedule_count||0)>0&&se.push({label:"Schedules",status:"ok",detail:`${F.schedule_count} configured`}),(F.loop_count||0)>0&&se.push({label:"Loops",status:"ok",detail:`${F.loop_count} active`}),(F.agent_running||0)>0&&se.push({label:"Agents",status:"ok",detail:`${F.agent_running} running`}),(F.process_running||0)>0&&se.push({label:"Processes",status:"ok",detail:`${F.process_running} running`}),se});async function N(){try{e.value=await G.get("/api/status"),s.value=null}catch(F){s.value=F.message}finally{t.value=!1}}async function _(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),c.value=0}catch{}a.value=!1}async function g(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5"),o.value=!1}catch{o.value=!0}l.value=!1}async function y(){try{const F=await G.get("/api/knowledge");d.value=(Array.isArray(F)?F:[]).reduce((se,B)=>se+(B.chunks||0),0)}catch{d.value=null}}async function T(){try{const F=await G.get("/api/agents");r.value=F.filter(se=>se.status==="running")}catch{}}async function k(){u.value={...u.value,reload:!0};try{await G.post("/api/reload"),Re.success("Config reloaded")}catch(F){Re.error(F.message)}u.value={...u.value,reload:!1}}async function O(){if(!await Qt({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;u.value={...u.value,clearSessions:!0};const se=e.value.session_count;e.value={...e.value,session_count:0};try{const B=await G.post("/api/sessions/clear-all");Re.success(`Cleared ${B.count} session${B.count!==1?"s":""}`),await N()}catch(B){e.value={...e.value,session_count:se},Re.error(B.message)}u.value={...u.value,clearSessions:!1}}async function C(){if(!await Qt({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;u.value={...u.value,stopLoops:!0};const se=e.value.loop_count;e.value={...e.value,loop_count:0};try{const B=await G.post("/api/loops/stop-all");Re.success(B.result),await N()}catch(B){e.value={...e.value,loop_count:se},Re.error(B.message)}u.value={...u.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,N(),_(),g(),T()}let M=null,A=null,I=null;function $(F){if(F.payload&&F.payload.tool_name){const se={...F.payload,_isNew:!0,_key:++p};n.value.unshift(se),n.value.length>10&&n.value.pop(),c.value++,se.error&&(o.value=!1,i.value.unshift(se),i.value.length>5&&i.value.pop()),setTimeout(()=>{se._isNew=!1},1500),clearTimeout(I),I=setTimeout(()=>{c.value=0},1e4)}}return Ze(async()=>{await Promise.all([N(),_(),g(),T(),y()]),M=setInterval(N,15e3),A=setInterval(T,1e4),qe.subscribe("events",$)}),mt(()=>{M&&clearInterval(M),A&&clearInterval(A),clearTimeout(I),qe.unsubscribe("events",$)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:m,stats:v,healthIndicators:E,activity:n,activityLoading:a,newEventCount:c,errors:i,errorsLoading:l,errorsError:o,agents:r,actionLoading:u,fetchActivity:_,fetchErrors:g,fetchStatus:N,onEvent:$,formatTime:ym,formatDuration:ai,retry:w,reloadConfig:k,clearSessions:O,stopAllLoops:C}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Ku(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Fk(e){if(Array.isArray(e))return e}function $k(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,o=[],r=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(r=(n=i.call(s)).done)&&(o.push(n.value),o.length!==t);r=!0);}catch(d){c=!0,a=d}finally{try{if(!r&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return o}}function Uk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Bk(e,t){return Fk(e)||$k(e,t)||Hk(e,t)||Uk()}function Hk(e,t){if(e){if(typeof e=="string")return Ku(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Ku(e,t):void 0}}const Dm=Object.entries,Wu=Object.setPrototypeOf,zk=Object.isFrozen,jk=Object.getPrototypeOf,Vk=Object.getOwnPropertyDescriptor;let rs=Object.freeze,Ls=Object.seal,Pa=Object.create,Fm=typeof Reflect<"u"&&Reflect,Wr=Fm.apply,Zr=Fm.construct;rs||(rs=function(t){return t});Ls||(Ls=function(t){return t});Wr||(Wr=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Zr||(Zr=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const dn=Rt(Array.prototype.forEach),qk=Rt(Array.prototype.lastIndexOf),Zu=Rt(Array.prototype.pop),Ra=Rt(Array.prototype.push),Gk=Rt(Array.prototype.splice),ss=Array.isArray,Si=Rt(String.prototype.toLowerCase),pr=Rt(String.prototype.toString),Ju=Rt(String.prototype.match),Ia=Rt(String.prototype.replace),Yu=Rt(String.prototype.indexOf),Kk=Rt(String.prototype.trim),Wk=Rt(Number.prototype.toString),Zk=Rt(Boolean.prototype.toString),Qu=typeof BigInt>"u"?null:Rt(BigInt.prototype.toString),Xu=typeof Symbol>"u"?null:Rt(Symbol.prototype.toString),bt=Rt(Object.prototype.hasOwnProperty),gi=Rt(Object.prototype.toString),Bt=Rt(RegExp.prototype.test),ea=Jk(TypeError);function Rt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Wr(e,t,n)}}function Jk(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Zr(e,s)}}function Ve(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:Si;if(Wu&&Wu(e,null),!ss(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(zk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Yk(e){for(let t=0;t<e.length;t++)bt(e,t)||(e[t]=null);return e}function Kt(e){const t=Pa(null);for(const n of Dm(e)){var s=Bk(n,2);const a=s[0],i=s[1];bt(e,a)&&(ss(i)?t[a]=Yk(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Kt(i):t[a]=i)}return t}function Qk(e){switch(typeof e){case"string":return e;case"number":return Wk(e);case"boolean":return Zk(e);case"bigint":return Qu?Qu(e):"0";case"symbol":return Xu?Xu(e):"Symbol()";case"undefined":return gi(e);case"function":case"object":{if(e===null)return gi(e);const t=e,s=Js(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:gi(n)}return gi(e)}default:return gi(e)}}function Js(e,t){for(;e!==null;){const n=Vk(e,t);if(n){if(n.get)return Rt(n.get);if(typeof n.value=="function")return Rt(n.value)}e=jk(e)}function s(){return null}return s}function Xk(e){try{return Bt(e,""),!0}catch{return!1}}const ep=rs(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),fr=rs(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),hr=rs(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),eS=rs(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),mr=rs(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),tS=rs(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),tp=rs(["#text"]),sp=rs(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),vr=rs(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),np=rs(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),El=rs(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),sS=Ls(/{{[\w\W]*|^[\w\W]*}}/g),nS=Ls(/<%[\w\W]*|^[\w\W]*%>/g),aS=Ls(/\${[\w\W]*/g),iS=Ls(/^data-[\-\w.\u00B7-\uFFFF]+$/),lS=Ls(/^aria-[\-\w]+$/),ap=Ls(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),oS=Ls(/^(?:\w+script|data):/i),rS=Ls(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),cS=Ls(/^html$/i),dS=Ls(/^[a-z][.\w]*(-[.\w]+)+$/i),Ws={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},uS=function(){return typeof window>"u"?null:window},pS=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},ip=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function $m(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:uS();const t=Te=>$m(Te);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ws.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,o=e.Element,r=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=o.prototype,f=Js(p,"cloneNode"),m=Js(p,"remove"),v=Js(p,"nextSibling"),E=Js(p,"childNodes"),N=Js(p,"parentNode"),_=Js(p,"shadowRoot"),g=Js(p,"attributes"),y=l&&l.prototype?Js(l.prototype,"nodeType"):null,T=l&&l.prototype?Js(l.prototype,"nodeName"):null;if(typeof i=="function"){const Te=s.createElement("template");Te.content&&Te.content.ownerDocument&&(s=Te.content.ownerDocument)}let k,O="",C,w=!1,M=0;const A=function(){if(M>0)throw ea('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},I=function(L){A(),M++;try{return k.createHTML(L)}finally{M--}},$=function(L){A(),M++;try{return k.createScriptURL(L)}finally{M--}},F=function(){return w||(C=pS(u,a),w=!0),C},se=s,B=se.implementation,S=se.createNodeIterator,R=se.createDocumentFragment,W=se.getElementsByTagName,ee=n.importNode;let he=ip();t.isSupported=typeof Dm=="function"&&typeof N=="function"&&B&&B.createHTMLDocument!==void 0;const le=sS,ve=nS,X=aS,xe=iS,Me=lS,K=oS,ge=rS,H=dS;let ie=ap,de=null;const Oe=Ve({},[...ep,...fr,...hr,...mr,...tp]);let x=null;const P=Ve({},[...sp,...vr,...np,...El]);let U=Object.seal(Pa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),ne=null,Q=null;const te=Object.seal(Pa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let be=!0,re=!0,ue=!1,ae=!0,we=!1,ye=!0,_e=!1,oe=!1,z=!1,pe=!1,Se=!1,Ee=!1,Ne=!0,ut=!1;const J="user-content-";let Ie=!0,$e=!1,Be={},ze=null;const Ue=Ve({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ot=null;const Nt=Ve({},["audio","video","img","source","image","track"]);let St=null;const In=Ve({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),zs="http://www.w3.org/1998/Math/MathML",Ns="http://www.w3.org/2000/svg",Ft="http://www.w3.org/1999/xhtml";let qt=Ft,an=!1,js=null;const Vs=Ve({},[zs,Ns,Ft],pr);let qs=Ve({},["mi","mo","mn","ms","mtext"]),Ps=Ve({},["annotation-xml"]);const On=Ve({},["title","style","font","a","script"]);let vt=null;const Ms=["application/xhtml+xml","text/html"],Gs="text/html";let Qe=null,$t=null;const q=s.createElement("form"),ce=function(L){return L instanceof RegExp||L instanceof Function},Le=function(){let L=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if($t&&$t===L)return;(!L||typeof L!="object")&&(L={}),L=Kt(L),vt=Ms.indexOf(L.PARSER_MEDIA_TYPE)===-1?Gs:L.PARSER_MEDIA_TYPE,Qe=vt==="application/xhtml+xml"?pr:Si,de=bt(L,"ALLOWED_TAGS")&&ss(L.ALLOWED_TAGS)?Ve({},L.ALLOWED_TAGS,Qe):Oe,x=bt(L,"ALLOWED_ATTR")&&ss(L.ALLOWED_ATTR)?Ve({},L.ALLOWED_ATTR,Qe):P,js=bt(L,"ALLOWED_NAMESPACES")&&ss(L.ALLOWED_NAMESPACES)?Ve({},L.ALLOWED_NAMESPACES,pr):Vs,St=bt(L,"ADD_URI_SAFE_ATTR")&&ss(L.ADD_URI_SAFE_ATTR)?Ve(Kt(In),L.ADD_URI_SAFE_ATTR,Qe):In,ot=bt(L,"ADD_DATA_URI_TAGS")&&ss(L.ADD_DATA_URI_TAGS)?Ve(Kt(Nt),L.ADD_DATA_URI_TAGS,Qe):Nt,ze=bt(L,"FORBID_CONTENTS")&&ss(L.FORBID_CONTENTS)?Ve({},L.FORBID_CONTENTS,Qe):Ue,ne=bt(L,"FORBID_TAGS")&&ss(L.FORBID_TAGS)?Ve({},L.FORBID_TAGS,Qe):Kt({}),Q=bt(L,"FORBID_ATTR")&&ss(L.FORBID_ATTR)?Ve({},L.FORBID_ATTR,Qe):Kt({}),Be=bt(L,"USE_PROFILES")?L.USE_PROFILES&&typeof L.USE_PROFILES=="object"?Kt(L.USE_PROFILES):L.USE_PROFILES:!1,be=L.ALLOW_ARIA_ATTR!==!1,re=L.ALLOW_DATA_ATTR!==!1,ue=L.ALLOW_UNKNOWN_PROTOCOLS||!1,ae=L.ALLOW_SELF_CLOSE_IN_ATTR!==!1,we=L.SAFE_FOR_TEMPLATES||!1,ye=L.SAFE_FOR_XML!==!1,_e=L.WHOLE_DOCUMENT||!1,pe=L.RETURN_DOM||!1,Se=L.RETURN_DOM_FRAGMENT||!1,Ee=L.RETURN_TRUSTED_TYPE||!1,z=L.FORCE_BODY||!1,Ne=L.SANITIZE_DOM!==!1,ut=L.SANITIZE_NAMED_PROPS||!1,Ie=L.KEEP_CONTENT!==!1,$e=L.IN_PLACE||!1,ie=Xk(L.ALLOWED_URI_REGEXP)?L.ALLOWED_URI_REGEXP:ap,qt=typeof L.NAMESPACE=="string"?L.NAMESPACE:Ft,qs=bt(L,"MATHML_TEXT_INTEGRATION_POINTS")&&L.MATHML_TEXT_INTEGRATION_POINTS&&typeof L.MATHML_TEXT_INTEGRATION_POINTS=="object"?Kt(L.MATHML_TEXT_INTEGRATION_POINTS):Ve({},["mi","mo","mn","ms","mtext"]),Ps=bt(L,"HTML_INTEGRATION_POINTS")&&L.HTML_INTEGRATION_POINTS&&typeof L.HTML_INTEGRATION_POINTS=="object"?Kt(L.HTML_INTEGRATION_POINTS):Ve({},["annotation-xml"]);const Y=bt(L,"CUSTOM_ELEMENT_HANDLING")&&L.CUSTOM_ELEMENT_HANDLING&&typeof L.CUSTOM_ELEMENT_HANDLING=="object"?Kt(L.CUSTOM_ELEMENT_HANDLING):Pa(null);if(U=Pa(null),bt(Y,"tagNameCheck")&&ce(Y.tagNameCheck)&&(U.tagNameCheck=Y.tagNameCheck),bt(Y,"attributeNameCheck")&&ce(Y.attributeNameCheck)&&(U.attributeNameCheck=Y.attributeNameCheck),bt(Y,"allowCustomizedBuiltInElements")&&typeof Y.allowCustomizedBuiltInElements=="boolean"&&(U.allowCustomizedBuiltInElements=Y.allowCustomizedBuiltInElements),we&&(re=!1),Se&&(pe=!0),Be&&(de=Ve({},tp),x=Pa(null),Be.html===!0&&(Ve(de,ep),Ve(x,sp)),Be.svg===!0&&(Ve(de,fr),Ve(x,vr),Ve(x,El)),Be.svgFilters===!0&&(Ve(de,hr),Ve(x,vr),Ve(x,El)),Be.mathMl===!0&&(Ve(de,mr),Ve(x,np),Ve(x,El))),te.tagCheck=null,te.attributeCheck=null,bt(L,"ADD_TAGS")&&(typeof L.ADD_TAGS=="function"?te.tagCheck=L.ADD_TAGS:ss(L.ADD_TAGS)&&(de===Oe&&(de=Kt(de)),Ve(de,L.ADD_TAGS,Qe))),bt(L,"ADD_ATTR")&&(typeof L.ADD_ATTR=="function"?te.attributeCheck=L.ADD_ATTR:ss(L.ADD_ATTR)&&(x===P&&(x=Kt(x)),Ve(x,L.ADD_ATTR,Qe))),bt(L,"ADD_URI_SAFE_ATTR")&&ss(L.ADD_URI_SAFE_ATTR)&&Ve(St,L.ADD_URI_SAFE_ATTR,Qe),bt(L,"FORBID_CONTENTS")&&ss(L.FORBID_CONTENTS)&&(ze===Ue&&(ze=Kt(ze)),Ve(ze,L.FORBID_CONTENTS,Qe)),bt(L,"ADD_FORBID_CONTENTS")&&ss(L.ADD_FORBID_CONTENTS)&&(ze===Ue&&(ze=Kt(ze)),Ve(ze,L.ADD_FORBID_CONTENTS,Qe)),Ie&&(de["#text"]=!0),_e&&Ve(de,["html","head","body"]),de.table&&(Ve(de,["tbody"]),delete ne.tbody),L.TRUSTED_TYPES_POLICY){if(typeof L.TRUSTED_TYPES_POLICY.createHTML!="function")throw ea('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof L.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw ea('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const me=k;k=L.TRUSTED_TYPES_POLICY;try{O=I("")}catch(Pe){throw k=me,Pe}}else L.TRUSTED_TYPES_POLICY===null?(k=void 0,O=""):(k===void 0&&(k=F()),k&&typeof O=="string"&&(O=I("")));(he.uponSanitizeElement.length>0||he.uponSanitizeAttribute.length>0)&&de===Oe&&(de=Kt(de)),he.uponSanitizeAttribute.length>0&&x===P&&(x=Kt(x)),rs&&rs(L),$t=L},Je=Ve({},[...fr,...hr,...eS]),rt=Ve({},[...mr,...tS]),Pt=function(L){let Y=N(L);(!Y||!Y.tagName)&&(Y={namespaceURI:qt,tagName:"template"});const me=Si(L.tagName),Pe=Si(Y.tagName);return js[L.namespaceURI]?L.namespaceURI===Ns?Y.namespaceURI===Ft?me==="svg":Y.namespaceURI===zs?me==="svg"&&(Pe==="annotation-xml"||qs[Pe]):!!Je[me]:L.namespaceURI===zs?Y.namespaceURI===Ft?me==="math":Y.namespaceURI===Ns?me==="math"&&Ps[Pe]:!!rt[me]:L.namespaceURI===Ft?Y.namespaceURI===Ns&&!Ps[Pe]||Y.namespaceURI===zs&&!qs[Pe]?!1:!rt[me]&&(On[me]||!Je[me]):!!(vt==="application/xhtml+xml"&&js[L.namespaceURI]):!1},Ut=function(L){Ra(t.removed,{element:L});try{N(L).removeChild(L)}catch{if(m(L),!N(L))throw ea("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},wa=function(L){const Y=E?E(L):L.childNodes;if(Y){const Pe=[];dn(Y,b=>{Ra(Pe,b)}),dn(Pe,b=>{try{m(b)}catch{}})}const me=g?g(L):null;if(me)for(let Pe=me.length-1;Pe>=0;--Pe){const b=me[Pe],D=b&&b.name;if(typeof D=="string")try{L.removeAttribute(D)}catch{}}},Ds=function(L,Y){try{Ra(t.removed,{attribute:Y.getAttributeNode(L),from:Y})}catch{Ra(t.removed,{attribute:null,from:Y})}if(Y.removeAttribute(L),L==="is")if(pe||Se)try{Ut(Y)}catch{}else try{Y.setAttribute(L,"")}catch{}},ri=function(L){const Y=g?g(L):L.attributes;if(Y)for(let me=Y.length-1;me>=0;--me){const Pe=Y[me],b=Pe&&Pe.name;if(!(typeof b!="string"||x[Qe(b)]))try{L.removeAttribute(b)}catch{}}},ka=function(L){const Y=[L];for(;Y.length>0;){const me=Y.pop();(y?y(me):me.nodeType)===Ws.element&&ri(me);const b=E?E(me):me.childNodes;if(b)for(let D=b.length-1;D>=0;--D)Y.push(b[D])}},Kn=function(L){let Y=null,me=null;if(z)L="<remove></remove>"+L;else{const D=Ju(L,/^[\r\n\t ]+/);me=D&&D[0]}vt==="application/xhtml+xml"&&qt===Ft&&(L='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+L+"</body></html>");const Pe=k?I(L):L;if(qt===Ft)try{Y=new d().parseFromString(Pe,vt)}catch{}if(!Y||!Y.documentElement){Y=B.createDocument(qt,"template",null);try{Y.documentElement.innerHTML=an?O:Pe}catch{}}const b=Y.body||Y.documentElement;return L&&me&&b.insertBefore(s.createTextNode(me),b.childNodes[0]||null),qt===Ft?W.call(Y,_e?"html":"body")[0]:_e?Y.documentElement:b},Sa=function(L){return S.call(L.ownerDocument||L,L,r.SHOW_ELEMENT|r.SHOW_COMMENT|r.SHOW_TEXT|r.SHOW_PROCESSING_INSTRUCTION|r.SHOW_CDATA_SECTION,null)},Wn=function(L){var Y,me;L.normalize();const Pe=S.call(L.ownerDocument||L,L,r.SHOW_TEXT|r.SHOW_COMMENT|r.SHOW_CDATA_SECTION|r.SHOW_PROCESSING_INSTRUCTION,null);let b=Pe.nextNode();for(;b;){let V=b.data;dn([le,ve,X],fe=>{V=Ia(V,fe," ")}),b.data=V,b=Pe.nextNode()}const D=(Y=(me=L.querySelectorAll)===null||me===void 0?void 0:me.call(L,"template"))!==null&&Y!==void 0?Y:[];dn(Array.from(D),V=>{gs(V.content)&&Wn(V.content)})},Ln=function(L){const Y=T?T(L):null;return typeof Y!="string"||Qe(Y)!=="form"?!1:typeof L.nodeName!="string"||typeof L.textContent!="string"||typeof L.removeChild!="function"||L.attributes!==g(L)||typeof L.removeAttribute!="function"||typeof L.setAttribute!="function"||typeof L.namespaceURI!="string"||typeof L.insertBefore!="function"||typeof L.hasChildNodes!="function"||L.nodeType!==y(L)||L.childNodes!==E(L)},gs=function(L){if(!y||typeof L!="object"||L===null)return!1;try{return y(L)===Ws.documentFragment}catch{return!1}},ln=function(L){if(!y||typeof L!="object"||L===null)return!1;try{return typeof y(L)=="number"}catch{return!1}};function j(Te,L,Y){dn(Te,me=>{me.call(t,L,Y,$t)})}const ke=function(L){let Y=null;if(j(he.beforeSanitizeElements,L,null),Ln(L))return Ut(L),!0;const me=Qe(T?T(L):L.nodeName);if(j(he.uponSanitizeElement,L,{tagName:me,allowedTags:de}),ye&&L.hasChildNodes()&&!ln(L.firstElementChild)&&Bt(/<[/\w!]/g,L.innerHTML)&&Bt(/<[/\w!]/g,L.textContent)||ye&&L.namespaceURI===Ft&&me==="style"&&ln(L.firstElementChild)||L.nodeType===Ws.progressingInstruction||ye&&L.nodeType===Ws.comment&&Bt(/<[/\w]/g,L.data))return Ut(L),!0;if(ne[me]||!(te.tagCheck instanceof Function&&te.tagCheck(me))&&!de[me]){if(!ne[me]&&Zn(me)&&(U.tagNameCheck instanceof RegExp&&Bt(U.tagNameCheck,me)||U.tagNameCheck instanceof Function&&U.tagNameCheck(me)))return!1;if(Ie&&!ze[me]){const b=N(L),D=E(L);if(D&&b){const V=D.length;for(let fe=V-1;fe>=0;--fe){const De=$e?D[fe]:f(D[fe],!0);b.insertBefore(De,v(L))}}}return Ut(L),!0}return(y?y(L):L.nodeType)===Ws.element&&!Pt(L)||(me==="noscript"||me==="noembed"||me==="noframes")&&Bt(/<\/no(script|embed|frames)/i,L.innerHTML)?(Ut(L),!0):(we&&L.nodeType===Ws.text&&(Y=L.textContent,dn([le,ve,X],b=>{Y=Ia(Y,b," ")}),L.textContent!==Y&&(Ra(t.removed,{element:L.cloneNode()}),L.textContent=Y)),j(he.afterSanitizeElements,L,null),!1)},Ae=function(L,Y,me){if(Q[Y]||Ne&&(Y==="id"||Y==="name")&&(me in s||me in q))return!1;const Pe=x[Y]||te.attributeCheck instanceof Function&&te.attributeCheck(Y,L);if(!(re&&!Q[Y]&&Bt(xe,Y))){if(!(be&&Bt(Me,Y))){if(!Pe||Q[Y]){if(!(Zn(L)&&(U.tagNameCheck instanceof RegExp&&Bt(U.tagNameCheck,L)||U.tagNameCheck instanceof Function&&U.tagNameCheck(L))&&(U.attributeNameCheck instanceof RegExp&&Bt(U.attributeNameCheck,Y)||U.attributeNameCheck instanceof Function&&U.attributeNameCheck(Y,L))||Y==="is"&&U.allowCustomizedBuiltInElements&&(U.tagNameCheck instanceof RegExp&&Bt(U.tagNameCheck,me)||U.tagNameCheck instanceof Function&&U.tagNameCheck(me))))return!1}else if(!St[Y]){if(!Bt(ie,Ia(me,ge,""))){if(!((Y==="src"||Y==="xlink:href"||Y==="href")&&L!=="script"&&Yu(me,"data:")===0&&ot[L])){if(!(ue&&!Bt(K,Ia(me,ge,"")))){if(me)return!1}}}}}}return!0},es=Ve({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Zn=function(L){return!es[Si(L)]&&Bt(H,L)},Jn=function(L){j(he.beforeSanitizeAttributes,L,null);const Y=L.attributes;if(!Y||Ln(L))return;const me={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:x,forceKeepAttr:void 0};let Pe=Y.length;for(;Pe--;){const b=Y[Pe],D=b.name,V=b.namespaceURI,fe=b.value,De=Qe(D),gt=fe;let it=D==="value"?gt:Kk(gt);if(me.attrName=De,me.attrValue=it,me.keepAttr=!0,me.forceKeepAttr=void 0,j(he.uponSanitizeAttribute,L,me),it=me.attrValue,ut&&(De==="id"||De==="name")&&Yu(it,J)!==0&&(Ds(D,L),it=J+it),ye&&Bt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,it)){Ds(D,L);continue}if(De==="attributename"&&Ju(it,"href")){Ds(D,L);continue}if(me.forceKeepAttr)continue;if(!me.keepAttr){Ds(D,L);continue}if(!ae&&Bt(/\/>/i,it)){Ds(D,L);continue}we&&dn([le,ve,X],di=>{it=Ia(it,di," ")});const Ks=Qe(L.nodeName);if(!Ae(Ks,De,it)){Ds(D,L);continue}if(k&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!V)switch(u.getAttributeType(Ks,De)){case"TrustedHTML":{it=I(it);break}case"TrustedScriptURL":{it=$(it);break}}if(it!==gt)try{V?L.setAttributeNS(V,D,it):L.setAttribute(D,it),Ln(L)?Ut(L):Zu(t.removed)}catch{Ds(D,L)}}j(he.afterSanitizeAttributes,L,null)},Yn=function(L){let Y=null;const me=Sa(L);for(j(he.beforeSanitizeShadowDOM,L,null);Y=me.nextNode();)if(j(he.uponSanitizeShadowNode,Y,null),ke(Y),Jn(Y),gs(Y.content)&&Yn(Y.content),(y?y(Y):Y.nodeType)===Ws.element){const b=_?_(Y):Y.shadowRoot;gs(b)&&(ci(b),Yn(b))}j(he.afterSanitizeShadowDOM,L,null)},ci=function(L){const Y=[{node:L,shadow:null}];for(;Y.length>0;){const me=Y.pop();if(me.shadow){Yn(me.shadow);continue}const Pe=me.node,D=(y?y(Pe):Pe.nodeType)===Ws.element,V=E?E(Pe):Pe.childNodes;if(V)for(let fe=V.length-1;fe>=0;--fe)Y.push({node:V[fe],shadow:null});if(D){const fe=T?T(Pe):null;if(typeof fe=="string"&&Qe(fe)==="template"){const De=Pe.content;gs(De)&&Y.push({node:De,shadow:null})}}if(D){const fe=_?_(Pe):Pe.shadowRoot;gs(fe)&&Y.push({node:null,shadow:fe},{node:fe,shadow:null})}}};return t.sanitize=function(Te){let L=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},Y=null,me=null,Pe=null,b=null;if(an=!Te,an&&(Te="<!-->"),typeof Te!="string"&&!ln(Te)&&(Te=Qk(Te),typeof Te!="string"))throw ea("dirty is not a string, aborting");if(!t.isSupported)return Te;oe||Le(L),t.removed=[];const D=$e&&typeof Te!="string"&&ln(Te);if(D){const De=T?T(Te):Te.nodeName;if(typeof De=="string"){const gt=Qe(De);if(!de[gt]||ne[gt])throw ea("root node is forbidden and cannot be sanitized in-place")}if(Ln(Te))throw ea("root node is clobbered and cannot be sanitized in-place");try{ci(Te)}catch(gt){throw wa(Te),gt}}else if(ln(Te))Y=Kn("<!---->"),me=Y.ownerDocument.importNode(Te,!0),me.nodeType===Ws.element&&me.nodeName==="BODY"||me.nodeName==="HTML"?Y=me:Y.appendChild(me),ci(me);else{if(!pe&&!we&&!_e&&Te.indexOf("<")===-1)return k&&Ee?I(Te):Te;if(Y=Kn(Te),!Y)return pe?null:Ee?O:""}Y&&z&&Ut(Y.firstChild);const V=Sa(D?Te:Y);try{for(;Pe=V.nextNode();)ke(Pe),Jn(Pe),gs(Pe.content)&&Yn(Pe.content)}catch(De){throw D&&wa(Te),De}if(D)return dn(t.removed,De=>{De.element&&ka(De.element)}),we&&Wn(Te),Te;if(pe){if(we&&Wn(Y),Se)for(b=R.call(Y.ownerDocument);Y.firstChild;)b.appendChild(Y.firstChild);else b=Y;return(x.shadowroot||x.shadowrootmode)&&(b=ee.call(n,b,!0)),b}let fe=_e?Y.outerHTML:Y.innerHTML;return _e&&de["!doctype"]&&Y.ownerDocument&&Y.ownerDocument.doctype&&Y.ownerDocument.doctype.name&&Bt(cS,Y.ownerDocument.doctype.name)&&(fe="<!DOCTYPE "+Y.ownerDocument.doctype.name+`>
`+fe),we&&dn([le,ve,X],De=>{fe=Ia(fe,De," ")}),k&&Ee?I(fe):fe},t.setConfig=function(){let Te=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Le(Te),oe=!0},t.clearConfig=function(){$t=null,oe=!1,k=C,O=""},t.isValidAttribute=function(Te,L,Y){$t||Le({});const me=Qe(Te),Pe=Qe(L);return Ae(me,Pe,Y)},t.addHook=function(Te,L){typeof L=="function"&&Ra(he[Te],L)},t.removeHook=function(Te,L){if(L!==void 0){const Y=qk(he[Te],L);return Y===-1?void 0:Gk(he[Te],Y,1)[0]}return Zu(he[Te])},t.removeHooks=function(Te){he[Te]=[]},t.removeAllHooks=function(){he=ip()},t}var lp=$m();function Xc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var _a=Xc();function Um(e){_a=e}var Pi={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(is.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var is={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},fS=/^(?:[ \t]*(?:\n|$))+/,hS=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mS=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,dl=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,vS=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ed=/(?:[*+-]|\d{1,9}[.)])/,Bm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Hm=at(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),gS=at(Bm).replace(/bull/g,ed).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),td=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,bS=/^[^\n]+/,sd=/(?!\s*\])(?:\\.|[^\[\]\\])+/,yS=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",sd).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),xS=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ed).getRegex(),Ho="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",nd=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,_S=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",nd).replace("tag",Ho).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),zm=at(td).replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex(),wS=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",zm).getRegex(),ad={blockquote:wS,code:hS,def:yS,fences:mS,heading:vS,hr:dl,html:_S,lheading:Hm,list:xS,newline:fS,paragraph:zm,table:Pi,text:bS},op=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex(),kS={...ad,lheading:gS,table:op,paragraph:at(td).replace("hr",dl).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",op).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Ho).getRegex()},SS={...ad,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",nd).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Pi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at(td).replace("hr",dl).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Hm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},TS=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,CS=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,jm=/^( {2,}|\\)\n(?!\s*$)/,ES=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,zo=/[\p{P}\p{S}]/u,id=/[\s\p{P}\p{S}]/u,Vm=/[^\s\p{P}\p{S}]/u,AS=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,id).getRegex(),qm=/(?!~)[\p{P}\p{S}]/u,RS=/(?!~)[\s\p{P}\p{S}]/u,IS=/(?:[^\s\p{P}\p{S}]|~)/u,OS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Gm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,LS=at(Gm,"u").replace(/punct/g,zo).getRegex(),NS=at(Gm,"u").replace(/punct/g,qm).getRegex(),Km="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",PS=at(Km,"gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,zo).getRegex(),MS=at(Km,"gu").replace(/notPunctSpace/g,IS).replace(/punctSpace/g,RS).replace(/punct/g,qm).getRegex(),DS=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Vm).replace(/punctSpace/g,id).replace(/punct/g,zo).getRegex(),FS=at(/\\(punct)/,"gu").replace(/punct/g,zo).getRegex(),$S=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),US=at(nd).replace("(?:-->|$)","-->").getRegex(),BS=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",US).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),co=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,HS=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",co).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Wm=at(/^!?\[(label)\]\[(ref)\]/).replace("label",co).replace("ref",sd).getRegex(),Zm=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",sd).getRegex(),zS=at("reflink|nolink(?!\\()","g").replace("reflink",Wm).replace("nolink",Zm).getRegex(),ld={_backpedal:Pi,anyPunctuation:FS,autolink:$S,blockSkip:OS,br:jm,code:CS,del:Pi,emStrongLDelim:LS,emStrongRDelimAst:PS,emStrongRDelimUnd:DS,escape:TS,link:HS,nolink:Zm,punctuation:AS,reflink:Wm,reflinkSearch:zS,tag:BS,text:ES,url:Pi},jS={...ld,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",co).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",co).getRegex()},Jr={...ld,emStrongRDelimAst:MS,emStrongLDelim:NS,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},VS={...Jr,br:at(jm).replace("{2,}","*").getRegex(),text:at(Jr.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Al={normal:ad,gfm:kS,pedantic:SS},bi={normal:ld,gfm:Jr,breaks:VS,pedantic:jS},qS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},rp=e=>qS[e];function Ys(e,t){if(t){if(is.escapeTest.test(e))return e.replace(is.escapeReplace,rp)}else if(is.escapeTestNoEncode.test(e))return e.replace(is.escapeReplaceNoEncode,rp);return e}function cp(e){try{e=encodeURI(e).replace(is.percentDecode,"%")}catch{return null}return e}function dp(e,t){var i;const s=e.replace(is.findPipe,(l,o,r)=>{let c=!1,d=o;for(;--d>=0&&r[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(is.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(is.slashPipe,"|");return n}function yi(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function GS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function up(e,t,s,n,a){const i=t.href,l=t.title||null,o=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const r={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:o,tokens:n.inlineTokens(o)};return n.state.inLink=!1,r}function KS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[o]=l;return o.length>=a.length?i.slice(a.length):i}).join(`
`)}var uo=class{constructor(e){ct(this,"options");ct(this,"rules");ct(this,"lexer");this.options=e||_a}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:yi(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=KS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=yi(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:yi(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=yi(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const o=[];let r;for(r=0;r<s.length;r++)if(this.rules.other.blockquoteStart.test(s[r]))o.push(s[r]),l=!0;else if(!l)o.push(s[r]);else break;s=s.slice(r);const c=o.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.blockquote(m);i[i.length-1]=v,n=n.substring(0,n.length-f.raw.length)+v.raw,a=a.substring(0,a.length-f.text.length)+v.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,m=f.raw+`
`+s.join(`
`),v=this.list(m);i[i.length-1]=v,n=n.substring(0,n.length-p.raw.length)+v.raw,a=a.substring(0,a.length-f.raw.length)+v.raw,s=m.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let r=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,N=>" ".repeat(3*N.length)),p=e.split(`
`,1)[0],f=!u.trim(),m=0;if(this.options.pedantic?(m=2,d=u.trimStart()):f?m=t[1].length+1:(m=t[2].search(this.rules.other.nonSpaceChar),m=m>4?1:m,d=u.slice(m),m+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),r=!0),!r){const N=this.rules.other.nextBulletRegex(m),_=this.rules.other.hrRegex(m),g=this.rules.other.fencesBeginRegex(m),y=this.rules.other.headingBeginRegex(m),T=this.rules.other.htmlBeginRegex(m);for(;e;){const k=e.split(`
`,1)[0];let O;if(p=k,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),O=p):O=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||y.test(p)||T.test(p)||N.test(p)||_.test(p))break;if(O.search(this.rules.other.nonSpaceChar)>=m||!p.trim())d+=`
`+O.slice(m);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||y.test(u)||_.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=k+`
`,e=e.substring(k.length+1),u=O.slice(m)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let v=null,E;this.options.gfm&&(v=this.rules.other.listIsTask.exec(d),v&&(E=v[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!v,checked:E,loose:!1,text:d,tokens:[]}),a.raw+=c}const o=a.items.at(-1);if(o)o.raw=o.raw.trimEnd(),o.text=o.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let r=0;r<a.items.length;r++)if(this.lexer.state.top=!1,a.items[r].tokens=this.lexer.blockTokens(a.items[r].text,[]),!a.loose){const c=a.items[r].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let r=0;r<a.items.length;r++)a.items[r].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=dp(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const o of n)this.rules.other.tableAlignRight.test(o)?i.align.push("right"):this.rules.other.tableAlignCenter.test(o)?i.align.push("center"):this.rules.other.tableAlignLeft.test(o)?i.align.push("left"):i.align.push(null);for(let o=0;o<s.length;o++)i.header.push({text:s[o],tokens:this.lexer.inline(s[o]),header:!0,align:i.align[o]});for(const o of a)i.rows.push(dp(o,i.header.length).map((r,c)=>({text:r,tokens:this.lexer.inline(r),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=yi(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=GS(t[2],"()");if(i===-2)return;if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),up(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return up(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,o,r=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(o=[...l].length,n[3]||n[4]){r+=o;continue}else if((n[5]||n[6])&&i%3&&!((i+o)%3)){c+=o;continue}if(r-=o,r>0)continue;o=Math.min(o,o+r+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},bn=class Yr{constructor(t){ct(this,"tokens");ct(this,"options");ct(this,"state");ct(this,"tokenizer");ct(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||_a,this.options.tokenizer=this.options.tokenizer||new uo,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:is,block:Al.normal,inline:bi.normal};this.options.pedantic?(s.block=Al.pedantic,s.inline=bi.pedantic):this.options.gfm&&(s.block=Al.gfm,this.options.breaks?s.inline=bi.breaks:s.inline=bi.gfm),this.tokenizer.rules=s}static get rules(){return{block:Al,inline:bi}}static lex(t,s){return new Yr(s).lex(t)}static lexInline(t,s){return new Yr(s).inlineTokens(t)}lex(t){t=t.replace(is.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(is.tabCharGlobal,"    ").replace(is.spaceLine,""));t;){let o;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(o=c.call({lexer:this},t,s))?(t=t.substring(o.raw.length),s.push(o),!0):!1))continue;if(o=this.tokenizer.space(t)){t=t.substring(o.raw.length);const c=s.at(-1);o.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(o);continue}if(o=this.tokenizer.code(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(o=this.tokenizer.fences(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.heading(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.hr(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.blockquote(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.list(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.html(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.def(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[o.tag]||(this.tokens.links[o.tag]={href:o.href,title:o.title});continue}if(o=this.tokenizer.table(t)){t=t.substring(o.raw.length),s.push(o);continue}if(o=this.tokenizer.lheading(t)){t=t.substring(o.raw.length),s.push(o);continue}let r=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(r=t.substring(0,c+1))}if(this.state.top&&(o=this.tokenizer.paragraph(r))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o),n=r.length!==t.length,t=t.substring(o.raw.length);continue}if(o=this.tokenizer.text(t)){t=t.substring(o.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+o.raw,c.text+=`
`+o.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(o);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var o,r,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((r=(o=this.options.extensions)==null?void 0:o.inline)!=null&&r.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let m;this.options.extensions.startInline.forEach(v=>{m=v.call({lexer:this},f),typeof m=="number"&&m>=0&&(p=Math.min(p,m))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},po=class{constructor(e){ct(this,"options");ct(this,"parser");this.options=e||_a}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(is.notSpaceStart))==null?void 0:i[0],a=e.replace(is.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Ys(n)+'">'+(s?a:Ys(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Ys(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const o=e.items[l];n+=this.listitem(o)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Ys(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=cp(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Ys(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=cp(e);if(a===null)return Ys(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Ys(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Ys(e.text)}},od=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},yn=class Qr{constructor(t){ct(this,"options");ct(this,"renderer");ct(this,"textRenderer");this.options=t||_a,this.options.renderer=this.options.renderer||new po,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new od}static parse(t,s){return new Qr(s).parse(t)}static parseInline(t,s){return new Qr(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=o,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const r=o;switch(r.type){case"space":{n+=this.renderer.space(r);continue}case"hr":{n+=this.renderer.hr(r);continue}case"heading":{n+=this.renderer.heading(r);continue}case"code":{n+=this.renderer.code(r);continue}case"table":{n+=this.renderer.table(r);continue}case"blockquote":{n+=this.renderer.blockquote(r);continue}case"list":{n+=this.renderer.list(r);continue}case"html":{n+=this.renderer.html(r);continue}case"paragraph":{n+=this.renderer.paragraph(r);continue}case"text":{let c=r,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const o=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[o.type]){const c=this.options.extensions.renderers[o.type].call({parser:this},o);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(o.type)){n+=c||"";continue}}const r=o;switch(r.type){case"escape":{n+=s.text(r);break}case"html":{n+=s.html(r);break}case"link":{n+=s.link(r);break}case"image":{n+=s.image(r);break}case"strong":{n+=s.strong(r);break}case"em":{n+=s.em(r);break}case"codespan":{n+=s.codespan(r);break}case"br":{n+=s.br(r);break}case"del":{n+=s.del(r);break}case"text":{n+=s.text(r);break}default:{const c='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},gr,Ml=(gr=class{constructor(e){ct(this,"options");ct(this,"block");this.options=e||_a}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?bn.lex:bn.lexInline}provideParser(){return this.block?yn.parse:yn.parseInline}},ct(gr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),gr),WS=class{constructor(...e){ct(this,"defaults",Xc());ct(this,"options",this.setOptions);ct(this,"parse",this.parseMarkdown(!0));ct(this,"parseInline",this.parseMarkdown(!1));ct(this,"Parser",yn);ct(this,"Renderer",po);ct(this,"TextRenderer",od);ct(this,"Lexer",bn);ct(this,"Tokenizer",uo);ct(this,"Hooks",Ml);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const o of l.header)s=s.concat(this.walkTokens(o.tokens,t));for(const o of l.rows)for(const r of o)s=s.concat(this.walkTokens(r.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(o=>{const r=l[o].flat(1/0);s=s.concat(this.walkTokens(r,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let o=a.renderer.apply(this,l);return o===!1&&(o=i.apply(this,l)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new po(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,o=s.renderer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new uo(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,o=s.tokenizer[l],r=a[l];a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Ml;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,o=s.hooks[l],r=a[l];Ml.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(o.call(a,c)).then(u=>r.call(a,u));const d=o.call(a,c);return r.call(a,d)}:a[l]=(...c)=>{let d=o.apply(a,c);return d===!1&&(d=r.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let o=[];return o.push(i.call(this,l)),a&&(o=o.concat(a.call(this,l))),o}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return bn.lex(e,t??this.defaults)}parser(e,t){return yn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const o=i.hooks?i.hooks.provideLexer():e?bn.lex:bn.lexInline,r=i.hooks?i.hooks.provideParser():e?yn.parse:yn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=o(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=r(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Ys(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ma=new WS;function st(e,t){return ma.parse(e,t)}st.options=st.setOptions=function(e){return ma.setOptions(e),st.defaults=ma.defaults,Um(st.defaults),st};st.getDefaults=Xc;st.defaults=_a;st.use=function(...e){return ma.use(...e),st.defaults=ma.defaults,Um(st.defaults),st};st.walkTokens=function(e,t){return ma.walkTokens(e,t)};st.parseInline=ma.parseInline;st.Parser=yn;st.parser=yn.parse;st.Renderer=po;st.TextRenderer=od;st.Lexer=bn;st.lexer=bn.lex;st.Tokenizer=uo;st.Hooks=Ml;st.parse=st;st.options;st.setOptions;st.use;st.walkTokens;st.parseInline;yn.parse;bn.lex;const ZS={breaks:!0,gfm:!0};function pp(e){if(!e)return"";try{if(typeof st<"u"&&st.parse){const t=st.parse(e,ZS);return typeof lp<"u"?lp.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function JS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const YS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function QS(e){return YS[e]||"wrench"}const XS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function fp(e){if(!e)return[];const t=e.match(XS);return t?[...new Set(t)]:[]}const e1={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(""),a=h(null),i=h(null),l=h(0),o=h("");let r=null,c=0;const d=["Check system health","List running services","Show disk usage","What can you do?"],u=Z(()=>t.value.trim().length>0&&!s.value),p=h(qe.state||"disconnected");let f=null,m=null;const v=Z(()=>{const S=p.value;return S==="connected"?"Connected":S==="reconnecting"?"Reconnecting…":S==="connecting"?"Connecting…":"REST fallback"}),E=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],N=Z(()=>{const S=Math.floor(l.value/4)%E.length,R=l.value;return R>3?`${E[S]} (${R}s)`:E[0]});function _(){Ct(()=>{a.value&&(a.value.scrollTop=a.value.scrollHeight)})}function g(){if(!i.value)return;const S=i.value;S.style.height="auto",S.style.height=Math.min(S.scrollHeight,120)+"px"}function y(S,R,W={}){const ee={id:++c,role:S,content:R,timestamp:Date.now(),html:S==="bot"?pp(R):"",tools_used:W.tools_used||[],is_error:W.is_error||!1,images:S==="bot"?fp(R):[],files:W.files||[],_showTools:!1};return e.value.push(ee),_(),S==="bot"&&Ct(()=>T()),ee}function T(){if(!a.value)return;a.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(R=>{R.setAttribute("data-copy","true"),R.style.position="relative";const W=document.createElement("button");W.className="chat-code-copy",W.textContent="Copy",W.addEventListener("click",()=>{const ee=R.querySelector("code"),he=ee?ee.textContent:R.textContent;navigator.clipboard.writeText(he).then(()=>{W.textContent="Copied!",setTimeout(()=>{W.textContent="Copy"},1500)}).catch(()=>{})}),R.appendChild(W)})}function k(S){if(S===0)return!0;const R=e.value[S-1],W=e.value[S],ee=new Date(R.timestamp).toDateString(),he=new Date(W.timestamp).toDateString();return ee!==he}function O(S){const R=new Date(S),W=new Date;if(R.toDateString()===W.toDateString())return"Today";const ee=new Date(W);return ee.setDate(ee.getDate()-1),R.toDateString()===ee.toDateString()?"Yesterday":R.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function C(S){t.value=S,Ct(()=>se())}function w(S){window.open(S,"_blank","noopener")}function M(S){S.target.style.display="none"}function A(){l.value=0,r=setInterval(()=>{l.value++},1e3)}function I(){r&&(clearInterval(r),r=null),l.value=0}function $(S){s.value&&(s.value=!1,I(),S.type==="chat_response"?y("bot",S.content,{tools_used:S.tools_used||[],is_error:S.is_error||!1,files:S.files||[]}):S.type==="chat_error"&&y("bot",S.error||"Unknown error",{is_error:!0}),Ct(()=>{var R;return(R=i.value)==null?void 0:R.focus()}))}async function F(S){try{const R=await G.post("/api/chat",{content:S,channel_id:o.value});y("bot",R.response,{tools_used:R.tools_used||[],is_error:R.is_error||!1,files:R.files||[]})}catch(R){y("bot",R.message||"Failed to send message",{is_error:!0})}}async function se(){const S=t.value.trim();if(!S||s.value)return;y("user",S),t.value="",s.value=!0,A(),i.value&&(i.value.style.height="auto"),qe.connected&&qe.sendChat(S,{channelId:o.value})||(await F(S),s.value=!1,I()),Ct(()=>{var W;return(W=i.value)==null?void 0:W.focus()})}async function B(){n.value="";try{if(!o.value){const R=await G.get("/api/auth/session");o.value=R.channel_id||R.user_id||"web-user"}const S=await G.get("/api/sessions/"+encodeURIComponent(o.value));if(S&&S.messages&&S.messages.length>0){for(const R of S.messages){const W=R.role==="user"?"user":"bot";let ee=R.content||"";if(W==="user"){const le=ee.match(/^\[.*?\]:\s*/);le&&(ee=ee.slice(le[0].length))}if(!ee.trim())continue;const he={id:++c,role:W,content:ee,timestamp:R.timestamp?R.timestamp*1e3:Date.now(),html:W==="bot"?pp(ee):"",tools_used:[],is_error:!1,images:W==="bot"?fp(ee):[],files:[],_showTools:!1};e.value.push(he)}Ct(()=>{_(),T()})}}catch(S){S&&S.status!==404&&(n.value="Couldn't load chat history — earlier messages may be missing. Refresh to retry.",Re.error(n.value))}}return Ze(()=>{qe.subscribe("chat",$),p.value=qe.state||"disconnected",f=qe.onStateChange,m=(S,R)=>{p.value=S,f&&f(S,R)},qe.onStateChange=m,B(),Ct(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),mt(()=>{qe.unsubscribe("chat",$),qe.onStateChange===m&&(qe.onStateChange=f),I()}),{messages:e,input:t,sending:s,historyError:n,messagesEl:a,inputEl:i,canSend:u,wsStatus:v,typingText:N,suggestions:d,send:se,autoResize:g,formatTime:JS,formatDate:O,showDateSeparator:k,useSuggestion:C,openImage:w,onImageError:M,getToolIcon:QS,loadHistory:B}}},t1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),o=h(!1),r=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),m=Z(()=>e.value==="custom"),v=Z(()=>[...i.value,...l.value]),E=Z(()=>l.value.includes(e.value)),N=Z(()=>{var C;return m.value?t.value||"Odin":((C=a.value[e.value])==null?void 0:C.name)||e.value}),_=Z(()=>{var C;return m.value?s.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.identity)||""}),g=Z(()=>{var C;return m.value?n.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.voice)||""});async function y(){d.value=!0;try{const C=await G.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",n.value=C.custom_voice||"",a.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function T(){o.value=!0,c.value=null,r.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),r.value=!0,setTimeout(()=>r.value=!1,3e3)}catch(C){c.value=C.message}finally{o.value=!1}}async function k(){const C=u.value.trim();if(C){f.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:C,display_name:N.value,identity:_.value,voice:g.value}),p.value=!1,u.value="",await y(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(w){c.value=w.message}finally{f.value=!1}}}async function O(){if(await Qt({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await y(),e.value="odin"}catch(w){c.value=w.message}}}return Ze(y),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:v,isCustom:m,isUserPreset:E,previewName:N,previewIdentity:_,previewVoice:g,saving:o,saved:r,error:c,loading:d,save:T,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:k,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
  `},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Jm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Dk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:e1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:vw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:kw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Vw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:t1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Rk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/mcp",redirect:_t("/capabilities","mcp-servers")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/internals",redirect:_t("/system","internals")}],Mi=tw({history:N_(),routes:Jm});Mi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const s1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},n1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let o=null,r=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const m=h("starting"),v=h(""),E=Jm.filter(S=>S.meta),N=Z(()=>["Workspace","Operate","Observe","Manage"].map(S=>({name:S,routes:E.filter(R=>R.meta.section===S)})).filter(S=>S.routes.length)),_=Z(()=>{var S;return((S=Mi.currentRoute.value.meta)==null?void 0:S.label)||"Odin"}),g=Z(()=>{var S;return((S=Mi.currentRoute.value.meta)==null?void 0:S.section)||"Management"}),y=Z(()=>{var S;return((S=Mi.currentRoute.value.meta)==null?void 0:S.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,qe.disconnect(),G.setToken(""),e.value="login"};function T(S){var R;if((S.ctrlKey||S.metaKey)&&S.key.toLowerCase()==="k"){e.value==="ready"&&(S.preventDefault(),qu());return}if(n.value&&S.key==="Tab"){const W=[...((R=a.value)==null?void 0:R.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(W.length){const ee=W[0],he=W[W.length-1];if(S.shiftKey&&(document.activeElement===ee||!a.value.contains(document.activeElement))){S.preventDefault(),he.focus();return}if(!S.shiftKey&&(document.activeElement===he||!a.value.contains(document.activeElement))){S.preventDefault(),ee.focus();return}}}if(S.key==="Escape"&&n.value){n.value=!1,S.preventDefault();return}if(S.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(S.target.tagName)){S.preventDefault();const W=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');W&&W.focus()}}function k(){l.value=!!(o!=null&&o.matches),l.value||(n.value=!1)}Ze(async()=>{document.addEventListener("keydown",T),o=window.matchMedia("(max-width: 900px)"),k(),o.addEventListener("change",k);const S=await G.check();S.ok?(e.value="ready",se()):S.needsAuth?e.value="login":(e.value="ready",se())});function O(){t.value=!1,e.value="ready",se()}async function C(){await G.logout(),qe.disconnect(),e.value="login"}function w(){s.value=!s.value}function M(){n.value=!n.value}ls(n,async S=>{var R,W;if(S)r=document.activeElement,await Ct(),(W=(R=a.value)==null?void 0:R.querySelector(".nav-item"))==null||W.focus();else if(r!=null&&r.isConnected){const ee=r;r=null,requestAnimationFrame(()=>ee.focus())}});const A=Z(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function I(S,R="info",W=3e3){p.value={text:S,level:R},clearTimeout(f),f=setTimeout(()=>{p.value=null},W)}let $=null,F=!1;function se(){qe.onStatusChange=S=>{c.value=S},qe.onLatency=S=>{u.value=S},qe.onStateChange=(S,R)=>{d.value=S,S==="connected"?(F&&I("Connection restored","success"),F=!0):S==="reconnecting"&&R.attempt===1&&I("Connection lost — reconnecting…","warn")},qe.connect(),B(),$&&clearInterval($),$=setInterval(B,15e3)}async function B(){try{const S=await G.get("/api/status");m.value=S.status==="online"?"online":"starting";const R=S.uptime_seconds||0,W=Math.floor(R/3600),ee=Math.floor(R%3600/60);v.value=`${W}h ${ee}m uptime`}catch{m.value="offline",v.value=""}}return mt(()=>{$&&clearInterval($),qe.disconnect(),document.removeEventListener("keydown",T),o==null||o.removeEventListener("change",k)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:A,wsToast:p,botStatus:m,botUptime:v,navRoutes:E,navGroups:N,currentPage:_,currentSection:g,currentDescription:y,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:C,toggleSidebar:w,toggleMobileNavigation:M,openPalette:qu}}},Gn=Xl(n1);Gn.component("odin-icon",Nk);Gn.component("login-screen",s1);Gn.component("toast-container",K0);Gn.component("confirm-host",W0);Gn.component("command-palette",Lk);Gn.directive("modal-focus",Mk);Gn.use(Mi);Gn.mount("#app");
