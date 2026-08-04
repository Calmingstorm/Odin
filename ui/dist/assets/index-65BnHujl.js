var jg=Object.defineProperty;var zg=(e,t,s)=>t in e?jg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var rt=(e,t,s)=>zg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class qg{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Yi("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new td(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new Yi("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new td((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Yi((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Yi?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Yi extends Error{constructor(t){super(t),this.name="AuthError"}}class td extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Gg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const Q=new qg,Ze=new Gg(Q);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ys(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},wa=[],Bt=()=>{},xa=()=>!1,na=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Yl=e=>e.startsWith("onUpdate:"),ze=Object.assign,Po=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Kg=Object.prototype.hasOwnProperty,et=(e,t)=>Kg.call(e,t),ve=Array.isArray,ka=e=>za(e)==="[object Map]",aa=e=>za(e)==="[object Set]",sd=e=>za(e)==="[object Date]",Wg=e=>za(e)==="[object RegExp]",Re=e=>typeof e=="function",Pe=e=>typeof e=="string",Kt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",Fo=e=>(Xe(e)||Re(e))&&Re(e.then)&&Re(e.catch),nf=Object.prototype.toString,za=e=>nf.call(e),Zg=e=>za(e).slice(8,-1),Ql=e=>za(e)==="[object Object]",Xl=e=>Pe(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,fn=ys(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Jg=ys("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),er=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Yg=/-\w/g,lt=er(e=>e.replace(Yg,t=>t.slice(1).toUpperCase())),Qg=/\B([A-Z])/g,os=er(e=>e.replace(Qg,"-$1").toLowerCase()),ia=er(e=>e.charAt(0).toUpperCase()+e.slice(1)),Sa=er(e=>e?`on${ia(e)}`:""),Dt=(e,t)=>!Object.is(e,t),Ta=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},af=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},tr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},_l=e=>{const t=Pe(e)?Number(e):NaN;return isNaN(t)?e:t};let nd;const sr=()=>nd||(nd=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Xg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const em="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",tm=ys(em);function $i(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Pe(n)?lf(n):$i(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Pe(e)||Xe(e))return e}const sm=/;(?![^(]*\))/g,nm=/:([^]+)/,am=/\/\*[^]*?\*\//g;function lf(e){const t={};return e.replace(am,"").split(sm).forEach(s=>{if(s){const n=s.split(nm);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ui(e){let t="";if(Pe(e))t=e;else if(ve(e))for(let s=0;s<e.length;s++){const n=Ui(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function im(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Pe(t)&&(e.class=Ui(t)),s&&(e.style=$i(s)),e}const lm="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",rm="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",om="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",cm="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",dm=ys(lm),um=ys(rm),fm=ys(om),pm=ys(cm),hm="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",gm=ys(hm);function rf(e){return!!e||e===""}function mm(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=mn(e[n],t[n]);return s}function mn(e,t){if(e===t)return!0;let s=sd(e),n=sd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Kt(e),n=Kt(t),s||n)return e===t;if(s=ve(e),n=ve(t),s||n)return s&&n?mm(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!mn(e[l],t[l]))return!1}}return String(e)===String(t)}function nr(e,t){return e.findIndex(s=>mn(s,t))}const of=e=>!!(e&&e.__v_isRef===!0),cf=e=>Pe(e)?e:e==null?"":ve(e)||Xe(e)&&(e.toString===nf||!Re(e.toString))?of(e)?cf(e.value):JSON.stringify(e,df,2):String(e),df=(e,t)=>of(t)?df(e,t.value):ka(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Ar(n,i)+" =>"]=a,s),{})}:aa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Ar(s))}:Kt(t)?Ar(t):Xe(t)&&!ve(t)&&!Ql(t)?String(t):t,Ar=(e,t="")=>{var s;return Kt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function vm(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let It;class $o{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&It&&(It.active?(this.parent=It,this.index=(It.scopes||(It.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=It;try{return It=this,t()}finally{It=s}}}on(){++this._on===1&&(this.prevScope=It,It=this)}off(){if(this._on>0&&--this._on===0){if(It===this)It=this.prevScope;else{let t=It;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function bm(e){return new $o(e)}function uf(){return It}function ym(e,t=!1){It&&It.cleanups.push(e)}let ct;const Rr=new WeakSet;class xi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,It&&(It.active?It.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Rr.has(this)&&(Rr.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||pf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,ad(this),hf(this);const t=ct,s=Ls;ct=this,Ls=!0;try{return this.fn()}finally{gf(this),ct=t,Ls=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Ho(t);this.deps=this.depsTail=void 0,ad(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Rr.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){eo(this)&&this.run()}get dirty(){return eo(this)}}let ff=0,ci,di;function pf(e,t=!1){if(e.flags|=8,t){e.next=di,di=e;return}e.next=ci,ci=e}function Uo(){ff++}function Bo(){if(--ff>0)return;if(di){let t=di;for(di=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ci;){let t=ci;for(ci=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function hf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function gf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Ho(n),xm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function eo(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(mf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function mf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===_i)||(e.globalVersion=_i,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!eo(e))))return;e.flags|=2;const t=e.dep,s=ct,n=Ls;ct=e,Ls=!0;try{hf(e);const a=e.fn(e._value);(t.version===0||Dt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ct=s,Ls=n,gf(e),e.flags&=-3}}function Ho(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Ho(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function xm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function _m(e,t){e.effect instanceof xi&&(e=e.effect.fn);const s=new xi(e);t&&ze(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function wm(e){e.effect.stop()}let Ls=!0;const vf=[];function vn(){vf.push(Ls),Ls=!1}function bn(){const e=vf.pop();Ls=e===void 0?!0:e}function ad(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ct;ct=void 0;try{t()}finally{ct=s}}}let _i=0;class km{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class ar{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ct||!Ls||ct===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ct)s=this.activeLink=new km(ct,this),ct.deps?(s.prevDep=ct.depsTail,ct.depsTail.nextDep=s,ct.depsTail=s):ct.deps=ct.depsTail=s,bf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ct.depsTail,s.nextDep=void 0,ct.depsTail.nextDep=s,ct.depsTail=s,ct.deps===s&&(ct.deps=n)}return s}trigger(t){this.version++,_i++,this.notify(t)}notify(t){Uo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Bo()}}}function bf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)bf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const wl=new WeakMap,Wn=Symbol(""),to=Symbol(""),wi=Symbol("");function zt(e,t,s){if(Ls&&ct){let n=wl.get(e);n||wl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new ar),a.map=n,a.key=s),a.track()}}function rn(e,t,s,n,a,i){const l=wl.get(e);if(!l){_i++;return}const r=o=>{o&&o.trigger()};if(Uo(),t==="clear")l.forEach(r);else{const o=ve(e),c=o&&Xl(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===wi||!Kt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(wi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Wn)),ka(e)&&r(l.get(to)));break;case"delete":o||(r(l.get(Wn)),ka(e)&&r(l.get(to)));break;case"set":ka(e)&&r(l.get(Wn));break}}Bo()}function Sm(e,t){const s=wl.get(e);return s&&s.get(t)}function ua(e){const t=Je(e);return t===e?t:(zt(t,"iterate",wi),ds(e)?t:t.map(Ds))}function ir(e){return zt(e=Je(e),"iterate",wi),e}function qs(e,t){return Ks(e)?La(pn(e)?Ds(t):t):Ds(t)}const Tm={__proto__:null,[Symbol.iterator](){return Ir(this,Symbol.iterator,e=>qs(this,e))},concat(...e){return ua(this).concat(...e.map(t=>ve(t)?ua(t):t))},entries(){return Ir(this,"entries",e=>(e[1]=qs(this,e[1]),e))},every(e,t){return Qs(this,"every",e,t,void 0,arguments)},filter(e,t){return Qs(this,"filter",e,t,s=>s.map(n=>qs(this,n)),arguments)},find(e,t){return Qs(this,"find",e,t,s=>qs(this,s),arguments)},findIndex(e,t){return Qs(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Qs(this,"findLast",e,t,s=>qs(this,s),arguments)},findLastIndex(e,t){return Qs(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Qs(this,"forEach",e,t,void 0,arguments)},includes(...e){return Or(this,"includes",e)},indexOf(...e){return Or(this,"indexOf",e)},join(e){return ua(this).join(e)},lastIndexOf(...e){return Or(this,"lastIndexOf",e)},map(e,t){return Qs(this,"map",e,t,void 0,arguments)},pop(){return Wa(this,"pop")},push(...e){return Wa(this,"push",e)},reduce(e,...t){return id(this,"reduce",e,t)},reduceRight(e,...t){return id(this,"reduceRight",e,t)},shift(){return Wa(this,"shift")},some(e,t){return Qs(this,"some",e,t,void 0,arguments)},splice(...e){return Wa(this,"splice",e)},toReversed(){return ua(this).toReversed()},toSorted(e){return ua(this).toSorted(e)},toSpliced(...e){return ua(this).toSpliced(...e)},unshift(...e){return Wa(this,"unshift",e)},values(){return Ir(this,"values",e=>qs(this,e))}};function Ir(e,t,s){const n=ir(e),a=n[t]();return n!==e&&!ds(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Cm=Array.prototype;function Qs(e,t,s,n,a,i){const l=ir(e),r=l!==e&&!ds(e),o=l[t];if(o!==Cm[t]){const u=o.apply(e,i);return r?Ds(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,qs(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function id(e,t,s,n){const a=ir(e),i=a!==e&&!ds(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=qs(e,c)),s.call(this,c,qs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?qs(e,o):o}function Or(e,t,s){const n=Je(e);zt(n,"iterate",wi);const a=n[t](...s);return(a===-1||a===!1)&&Bi(s[0])?(s[0]=Je(s[0]),n[t](...s)):a}function Wa(e,t,s=[]){vn(),Uo();const n=Je(e)[t].apply(e,s);return Bo(),bn(),n}const Em=ys("__proto__,__v_isRef,__isVue"),yf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Kt));function Am(e){Kt(e)||(e=String(e));const t=Je(this);return zt(t,"has",e),t.hasOwnProperty(e)}class xf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Cf:Tf:i?Sf:kf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ve(t);if(!a){let o;if(l&&(o=Tm[s]))return o;if(s==="hasOwnProperty")return Am}const r=Reflect.get(t,s,Tt(t)?t:n);if((Kt(s)?yf.has(s):Em(s))||(a||zt(t,"get",s),i))return r;if(Tt(r)){const o=l&&Xl(s)?r:r.value;return a&&Xe(o)?kl(o):o}return Xe(r)?a?kl(r):Fn(r):r}}class _f extends xf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ve(t)&&Xl(s);if(!this._isShallow){const c=Ks(i);if(!ds(n)&&!Ks(n)&&(i=Je(i),n=Je(n)),!l&&Tt(i)&&!Tt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:et(t,s),o=Reflect.set(t,s,n,Tt(t)?t:a);return t===Je(a)&&(r?Dt(n,i)&&rn(t,"set",s,n):rn(t,"add",s,n)),o}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&rn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Kt(s)||!yf.has(s))&&zt(t,"has",s),n}ownKeys(t){return zt(t,"iterate",ve(t)?"length":Wn),Reflect.ownKeys(t)}}class wf extends xf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Rm=new _f,Im=new wf,Om=new _f(!0),Lm=new wf(!0),so=e=>e,Qi=e=>Reflect.getPrototypeOf(e);function Nm(e,t,s){return function(...n){const a=this.__v_raw,i=Je(a),l=ka(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?so:t?La:Ds;return!t&&zt(i,"iterate",o?to:Wn),ze(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function Xi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Dm(e,t){const s={get(a){const i=this.__v_raw,l=Je(i),r=Je(a);e||(Dt(a,r)&&zt(l,"get",a),zt(l,"get",r));const{has:o}=Qi(l),c=t?so:e?La:Ds;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&zt(Je(a),"iterate",Wn),a.size},has(a){const i=this.__v_raw,l=Je(i),r=Je(a);return e||(Dt(a,r)&&zt(l,"has",a),zt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Je(r),c=t?so:e?La:Ds;return!e&&zt(o,"iterate",Wn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return ze(s,e?{add:Xi("add"),set:Xi("set"),delete:Xi("delete"),clear:Xi("clear")}:{add(a){const i=Je(this),l=Qi(i),r=Je(a),o=!t&&!ds(a)&&!Ks(a)?r:a;return l.has.call(i,o)||Dt(a,o)&&l.has.call(i,a)||Dt(r,o)&&l.has.call(i,r)||(i.add(o),rn(i,"add",o,o)),this},set(a,i){!t&&!ds(i)&&!Ks(i)&&(i=Je(i));const l=Je(this),{has:r,get:o}=Qi(l);let c=r.call(l,a);c||(a=Je(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Dt(i,d)&&rn(l,"set",a,i):rn(l,"add",a,i),this},delete(a){const i=Je(this),{has:l,get:r}=Qi(i);let o=l.call(i,a);o||(a=Je(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&rn(i,"delete",a,void 0),c},clear(){const a=Je(this),i=a.size!==0,l=a.clear();return i&&rn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Nm(a,e,t)}),s}function lr(e,t){const s=Dm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const Mm={get:lr(!1,!1)},Pm={get:lr(!1,!0)},Fm={get:lr(!0,!1)},$m={get:lr(!0,!0)},kf=new WeakMap,Sf=new WeakMap,Tf=new WeakMap,Cf=new WeakMap;function Um(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Fn(e){return Ks(e)?e:rr(e,!1,Rm,Mm,kf)}function Vo(e){return rr(e,!1,Om,Pm,Sf)}function kl(e){return rr(e,!0,Im,Fm,Tf)}function Bm(e){return rr(e,!0,Lm,$m,Cf)}function rr(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Um(Zg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function pn(e){return Ks(e)?pn(e.__v_raw):!!(e&&e.__v_isReactive)}function Ks(e){return!!(e&&e.__v_isReadonly)}function ds(e){return!!(e&&e.__v_isShallow)}function Bi(e){return e?!!e.__v_raw:!1}function Je(e){const t=e&&e.__v_raw;return t?Je(t):e}function Ef(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&af(e,"__v_skip",!0),e}const Ds=e=>Xe(e)?Fn(e):e,La=e=>Xe(e)?kl(e):e;function Tt(e){return e?e.__v_isRef===!0:!1}function h(e){return Af(e,!1)}function jo(e){return Af(e,!0)}function Af(e,t){return Tt(e)?e:new Hm(e,t)}class Hm{constructor(t,s){this.dep=new ar,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Je(t),this._value=s?t:Ds(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||ds(t)||Ks(t);t=n?t:Je(t),Dt(t,s)&&(this._rawValue=t,this._value=n?t:Ds(t),this.dep.trigger())}}function Vm(e){e.dep&&e.dep.trigger()}function Gs(e){return Tt(e)?e.value:e}function jm(e){return Re(e)?e():Gs(e)}const zm={get:(e,t,s)=>t==="__v_raw"?e:Gs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Tt(a)&&!Tt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function zo(e){return pn(e)?e:new Proxy(e,zm)}class qm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new ar,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Rf(e){return new qm(e)}function Gm(e){const t=ve(e)?new Array(e.length):{};for(const s in e)t[s]=If(e,s);return t}class Km{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Kt(s)?s:String(s),this._raw=Je(t);let a=!0,i=t;if(!ve(t)||Kt(this._key)||!Xl(this._key))do a=!Bi(i)||ds(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Gs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Tt(this._raw[this._key])){const s=this._object[this._key];if(Tt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return Sm(this._raw,this._key)}}class Wm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Zm(e,t,s){return Tt(e)?e:Re(e)?new Wm(e):Xe(e)&&arguments.length>1?If(e,t,s):h(e)}function If(e,t,s){return new Km(e,t,s)}class Jm{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new ar(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=_i-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ct!==this)return pf(this,!0),!0}get value(){const t=this.dep.track();return mf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Ym(e,t,s=!1){let n,a;return Re(e)?n=e:(n=e.get,a=e.set),new Jm(n,a,s)}const Qm={GET:"get",HAS:"has",ITERATE:"iterate"},Xm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},el={},Sl=new WeakMap;let In;function ev(){return In}function Of(e,t=!1,s=In){if(s){let n=Sl.get(s);n||Sl.set(s,n=[]),n.push(e)}}function tv(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:ds(x)||a===!1||a===0?on(x,1):on(x);let d,u,f,p,g=!1,y=!1;if(Tt(e)?(u=()=>e.value,g=ds(e)):pn(e)?(u=()=>c(e),g=!0):ve(e)?(y=!0,g=e.some(x=>pn(x)||ds(x)),u=()=>e.map(x=>{if(Tt(x))return x.value;if(pn(x))return c(x);if(Re(x))return o?o(x,2):x()})):Re(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){vn();try{f()}finally{bn()}}const x=In;In=d;try{return o?o(e,3,[p]):e(p)}finally{In=x}}:u=Bt,t&&a){const x=u,w=a===!0?1/0:a;u=()=>on(x(),w)}const k=uf(),E=()=>{d.stop(),k&&k.active&&Po(k.effects,d)};if(i&&t){const x=t;t=(...w)=>{const _=x(...w);return E(),_}}let v=y?new Array(e.length).fill(el):el;const m=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const w=d.run();if(x||a||g||(y?w.some((_,R)=>Dt(_,v[R])):Dt(w,v))){f&&f();const _=In;In=d;try{const R=[w,v===el?void 0:y&&v[0]===el?[]:v,p];v=w,o?o(t,3,R):t(...R)}finally{In=_}}}else d.run()};return r&&r(m),d=new xi(u),d.scheduler=l?()=>l(m,!1):m,p=x=>Of(x,!1,d),f=d.onStop=()=>{const x=Sl.get(d);if(x){if(o)o(x,4);else for(const w of x)w();Sl.delete(d)}},t?n?m(!0):v=d.run():l?l(m.bind(null,!0),!0):d.run(),E.pause=d.pause.bind(d),E.resume=d.resume.bind(d),E.stop=E,E}function on(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Tt(e))on(e.value,t,s);else if(ve(e))for(let n=0;n<e.length;n++)on(e[n],t,s);else if(aa(e)||ka(e))e.forEach(n=>{on(n,t,s)});else if(Ql(e)){for(const n in e)on(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&on(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Lf=[];function sv(e){Lf.push(e)}function nv(){Lf.pop()}function av(e,t){}const iv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},lv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function qa(e,t,s,n){try{return n?e(...n):e()}catch(a){la(a,t,s)}}function vs(e,t,s,n){if(Re(e)){const a=qa(e,t,s,n);return a&&Fo(a)&&a.catch(i=>{la(i,t,s)}),a}if(ve(e)){const a=[];for(let i=0;i<e.length;i++)a.push(vs(e[i],t,s,n));return a}}function la(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){vn(),qa(i,null,10,[e,o,c]),bn();return}}rv(e,s,a,n,l)}function rv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Yt=[];let js=-1;const Ca=[];let On=null,ma=0;const Nf=Promise.resolve();let Tl=null;function Ot(e){const t=Tl||Nf;return e?t.then(this?e.bind(this):e):t}function ov(e){let t=js+1,s=Yt.length;for(;t<s;){const n=t+s>>>1,a=Yt[n],i=Si(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function qo(e){if(!(e.flags&1)){const t=Si(e),s=Yt[Yt.length-1];!s||!(e.flags&2)&&t>=Si(s)?Yt.push(e):Yt.splice(ov(t),0,e),e.flags|=1,Df()}}function Df(){Tl||(Tl=Nf.then(Mf))}function ki(e){ve(e)?Ca.push(...e):On&&e.id===-1?On.splice(ma+1,0,e):e.flags&1||(Ca.push(e),e.flags|=1),Df()}function ld(e,t,s=js+1){for(;s<Yt.length;s++){const n=Yt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Yt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Cl(e){if(Ca.length){const t=[...new Set(Ca)].sort((s,n)=>Si(s)-Si(n));if(Ca.length=0,On){On.push(...t);return}for(On=t,ma=0;ma<On.length;ma++){const s=On[ma];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}On=null,ma=0}}const Si=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Mf(e){try{for(js=0;js<Yt.length;js++){const t=Yt[js];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),qa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;js<Yt.length;js++){const t=Yt[js];t&&(t.flags&=-2)}js=-1,Yt.length=0,Cl(),Tl=null,(Yt.length||Ca.length)&&Mf()}}let va,tl=[];function Pf(e,t){var s,n;va=e,va?(va.enabled=!0,tl.forEach(({event:a,args:i})=>va.emit(a,...i)),tl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Pf(i,t)}),setTimeout(()=>{va||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,tl=[])},3e3)):tl=[]}let Ut=null,or=null;function Ti(e){const t=Ut;return Ut=e,or=e&&e.type.__scopeId||null,t}function cv(e){or=e}function dv(){or=null}const uv=e=>Go;function Go(e,t=Ut,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ri(-1);const i=Ti(t);let l;try{l=e(...a)}finally{Ti(i),n._d&&Ri(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function fv(e,t){if(Ut===null)return e;const s=zi(Ut),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ge]=t[a];i&&(Re(i)&&(i={mounted:i,updated:i}),i.deep&&on(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function zs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(vn(),vs(o,s,8,[e.el,r,e,t]),bn())}}function ui(e,t){if($t){let s=$t.provides;const n=$t.parent&&$t.parent.provides;n===s&&(s=$t.provides=Object.create(n)),s[e]=t}}function Ts(e,t,s=!1){const n=es();if(n||Zn){let a=Zn?Zn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Re(t)?t.call(n&&n.proxy):t}}function pv(){return!!(es()||Zn)}const Ff=Symbol.for("v-scx"),$f=()=>Ts(Ff);function hv(e,t){return Hi(e,null,t)}function gv(e,t){return Hi(e,null,{flush:"post"})}function Uf(e,t){return Hi(e,null,{flush:"sync"})}function Xt(e,t,s){return Hi(e,t,s)}function Hi(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,r=ze({},s),o=t&&n||!t&&i!=="post";let c;if(ea){if(i==="sync"){const p=$f();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Bt,p.resume=Bt,p.pause=Bt,p}}const d=$t;r.call=(p,g,y)=>vs(p,d,g,y);let u=!1;i==="post"?r.scheduler=p=>{kt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,g)=>{g?p():qo(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=tv(e,t,r);return ea&&(c?c.push(f):o&&f()),f}function mv(e,t,s){const n=this.proxy,a=Pe(e)?e.includes(".")?Bf(n,e):()=>n[e]:e.bind(n,n);let i;Re(t)?i=t:(i=t.handler,s=t);const l=Ga(this),r=Hi(a,i.bind(n),s);return l(),r}function Bf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const En=new WeakMap,Hf=Symbol("_vte"),Vf=e=>e.__isTeleport,zn=e=>e&&(e.disabled||e.disabled===""),vv=e=>e&&(e.defer||e.defer===""),rd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,od=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,no=(e,t)=>{const s=e&&e.to;return Pe(s)?t?t(s):null:s},bv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:g,createText:y,createComment:k,parentNode:E}}=c,v=zn(t.props);let{dynamicChildren:m}=t;const x=(R,T,C)=>{R.shapeFlag&16&&d(R.children,T,C,a,i,l,r,o)},w=(R=t)=>{const T=zn(R.props),C=R.target=no(R.props,g),L=ao(C,R,y,p);C&&(l!=="svg"&&rd(C)?l="svg":l!=="mathml"&&od(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(x(R,C,L),ai(R,!1)))},_=R=>{const T=()=>{if(En.get(R)===T){if(En.delete(R),zn(R.props)){const C=E(R.el)||s;x(R,C,R.anchor),ai(R,!0)}w(R)}};En.set(R,T),kt(T,i)};if(e==null){const R=t.el=y(""),T=t.anchor=y("");if(p(R,s,n),p(T,s,n),vv(t.props)||i&&i.pendingBranch){_(t);return}v&&(x(t,s,T),ai(t,!0)),w()}else{t.el=e.el;const R=t.anchor=e.anchor,T=En.get(e);if(T){T.flags|=8,En.delete(e),_(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,L=t.targetAnchor=e.targetAnchor,H=zn(e.props),M=H?s:C,N=H?R:L;if(l==="svg"||rd(C)?l="svg":(l==="mathml"||od(C))&&(l="mathml"),m?(f(e.dynamicChildren,m,M,a,i,l,r),nc(e,t,!0)):o||u(e,t,M,N,a,i,l,r,!1),v)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):sl(t,s,R,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Z=t.target=no(t.props,g);Z&&sl(t,Z,null,c,0)}else H&&sl(t,C,L,c,1);ai(t,v)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!zn(f),g=En.get(e);if(g&&(g.flags|=8,En.delete(e)),u&&(a(c),a(d)),i&&a(o),!g&&l&16)for(let y=0;y<r.length;y++){const k=r[y];n(k,t,s,p,!!k.dynamicChildren)}},move:sl,hydrate:yv};function sl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!En.has(e)&&(!u||zn(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function yv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(k,E){let v=E;for(;v;){if(v&&v.nodeType===8){if(v.data==="teleport start anchor")t.targetStart=v;else if(v.data==="teleport anchor"){t.targetAnchor=v,k._lpa=t.targetAnchor&&l(t.targetAnchor);break}}v=l(v)}}function p(k,E){E.anchor=u(l(k),E,r(k),s,n,a,i)}const g=t.target=no(t.props,o),y=zn(t.props);if(g){const k=g._lpa||g.firstChild;t.shapeFlag&16&&(y?(p(e,t),f(g,k),t.targetAnchor||ao(g,t,d,c,r(e)===g?e:null)):(t.anchor=l(e),f(g,k),t.targetAnchor||ao(g,t,d,c),u(k&&l(k),t,g,s,n,a,i))),ai(t,y)}else y&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const xv=bv;function ai(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function ao(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Hf]=l,e&&(n(i,e,a),n(l,e,a)),l}const ws=Symbol("_leaveCb"),Za=Symbol("_enterCb");function Ko(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ye(()=>{e.isMounted=!0}),fr(()=>{e.isUnmounting=!0}),e}const _s=[Function,Array],Wo={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:_s,onEnter:_s,onAfterEnter:_s,onEnterCancelled:_s,onBeforeLeave:_s,onLeave:_s,onAfterLeave:_s,onLeaveCancelled:_s,onBeforeAppear:_s,onAppear:_s,onAfterAppear:_s,onAppearCancelled:_s},jf=e=>{const t=e.subTree;return t.component?jf(t.component):t},_v={name:"BaseTransition",props:Wo,setup(e,{slots:t}){const s=es(),n=Ko();return()=>{const a=t.default&&cr(t.default(),!0),i=a&&a.length?zf(a):s.subTree?Cp():void 0;if(!i)return;const l=Je(e),{mode:r}=l;if(n.isLeaving)return Lr(i);const o=cd(i);if(!o)return Lr(i);let c=Na(o,l,n,s,u=>c=u);o.type!==xt&&yn(o,c);let d=s.subTree&&cd(s.subTree);if(d&&d.type!==xt&&!Os(d,o)&&jf(s).type!==xt){let u=Na(d,l,n,s);if(yn(d,u),r==="out-in"&&o.type!==xt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Lr(i);r==="in-out"&&o.type!==xt?u.delayLeave=(f,p,g)=>{const y=Gf(n,d);y[String(d.key)]=d,f[ws]=()=>{p(),f[ws]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{g(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function zf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==xt){t=s;break}}return t}const qf=_v;function Gf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Na(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:g,onLeaveCancelled:y,onBeforeAppear:k,onAppear:E,onAfterAppear:v,onAppearCancelled:m}=t,x=String(e.key),w=Gf(s,e),_=(C,L)=>{C&&vs(C,n,9,L)},R=(C,L)=>{const H=L[1];_(C,L),ve(C)?C.every(M=>M.length<=1)&&H():C.length<=1&&H()},T={mode:l,persisted:r,beforeEnter(C){let L=o;if(!s.isMounted)if(i)L=k||o;else return;C[ws]&&C[ws](!0);const H=w[x];H&&Os(e,H)&&H.el[ws]&&H.el[ws](),_(L,[C])},enter(C){if(w[x]===e)return;let L=c,H=d,M=u;if(!s.isMounted)if(i)L=E||c,H=v||d,M=m||u;else return;let N=!1;C[Za]=ne=>{N||(N=!0,ne?_(M,[C]):_(H,[C]),T.delayedLeave&&T.delayedLeave(),C[Za]=void 0)};const Z=C[Za].bind(null,!1);L?R(L,[C,Z]):Z()},leave(C,L){const H=String(e.key);if(C[Za]&&C[Za](!0),s.isUnmounting)return L();_(f,[C]);let M=!1;C[ws]=Z=>{M||(M=!0,L(),Z?_(y,[C]):_(g,[C]),C[ws]=void 0,w[H]===e&&delete w[H])};const N=C[ws].bind(null,!1);w[H]=e,p?R(p,[C,N]):N()},clone(C){const L=Na(C,t,s,n,a);return a&&a(L),L}};return T}function Lr(e){if(ji(e))return e=Ws(e),e.children=null,e}function cd(e){if(!ji(e))return Vf(e.type)&&e.children?zf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Re(s.default))return s.default()}}function yn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,yn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function cr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Mt?(l.patchFlag&128&&a++,n=n.concat(cr(l.children,t,r))):(t||l.type!==xt)&&n.push(r!=null?Ws(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Vi(e,t){return Re(e)?ze({name:e.name},t,{setup:e}):e}function wv(){const e=es();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Zo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function kv(e){const t=es(),s=jo(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function dd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const El=new WeakMap;function Ea(e,t,s,n,a=!1){if(ve(e)){e.forEach((y,k)=>Ea(y,t&&(ve(t)?t[k]:t),s,n,a));return}if(hn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ea(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?zi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ge?r.refs={}:r.refs,u=r.setupState,f=Je(u),p=u===Ge?xa:y=>dd(d,y)?!1:et(f,y),g=(y,k)=>!(k&&dd(d,k));if(c!=null&&c!==o){if(ud(t),Pe(c))d[c]=null,p(c)&&(u[c]=null);else if(Tt(c)){const y=t;g(c,y.k)&&(c.value=null),y.k&&(d[y.k]=null)}}if(Re(o))qa(o,r,12,[l,d]);else{const y=Pe(o),k=Tt(o);if(y||k){const E=()=>{if(e.f){const v=y?p(o)?u[o]:d[o]:g()||!e.k?o.value:d[e.k];if(a)ve(v)&&Po(v,i);else if(ve(v))v.includes(i)||v.push(i);else if(y)d[o]=[i],p(o)&&(u[o]=d[o]);else{const m=[i];g(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else y?(d[o]=l,p(o)&&(u[o]=l)):k&&(g(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const v=()=>{E(),El.delete(e)};v.id=-1,El.set(e,v),kt(v,s)}else ud(e),E()}}}function ud(e){const t=El.get(e);t&&(t.flags|=8,El.delete(e))}let fd=!1;const fa=()=>{fd||(console.error("Hydration completed but contains mismatches."),fd=!0)},Sv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Tv=e=>e.namespaceURI.includes("MathML"),nl=e=>{if(e.nodeType===1){if(Sv(e))return"svg";if(Tv(e))return"mathml"}},_a=e=>e.nodeType===8;function Cv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,x)=>{if(!x.hasChildNodes()){s(null,m,x),Cl(),x._vnode=m;return}u(x.firstChild,m,null,null,null),Cl(),x._vnode=m},u=(m,x,w,_,R,T=!1)=>{T=T||!!x.dynamicChildren;const C=_a(m)&&m.data==="[",L=()=>y(m,x,w,_,R,C),{type:H,ref:M,shapeFlag:N,patchFlag:Z}=x;let ne=m.nodeType;x.el=m,Z===-2&&(T=!1,x.dynamicChildren=null);let F=null;switch(H){case Dn:ne!==3?x.children===""?(o(x.el=a(""),l(m),m),F=m):F=L():(m.data!==x.children&&(fa(),m.data=x.children),F=i(m));break;case xt:v(m)?(F=i(m),E(x.el=m.content.firstChild,m,w)):ne!==8||C?F=L():F=i(m);break;case Jn:if(C&&(m=i(m),ne=m.nodeType),ne===1||ne===3){F=m;const O=!x.children.length;for(let A=0;A<x.staticCount;A++)O&&(x.children+=F.nodeType===1?F.outerHTML:F.data),A===x.staticCount-1&&(x.anchor=F),F=i(F);return C?i(F):F}else L();break;case Mt:C?F=g(m,x,w,_,R,T):F=L();break;default:if(N&1)(ne!==1||x.type.toLowerCase()!==m.tagName.toLowerCase())&&!v(m)?F=L():F=f(m,x,w,_,R,T);else if(N&6){x.slotScopeIds=R;const O=l(m);if(C?F=k(m):_a(m)&&m.data==="teleport start"?F=k(m,m.data,"teleport end"):F=i(m),t(x,O,null,w,_,nl(O),T),hn(x)&&!x.type.__asyncResolved){let A;C?(A=ft(Mt),A.anchor=F?F.previousSibling:O.lastChild):A=m.nodeType===3?ic(""):ft("div"),A.el=m,x.component.subTree=A}}else N&64?ne!==8?F=L():F=x.type.hydrate(m,x,w,_,R,T,e,p):N&128&&(F=x.type.hydrate(m,x,w,_,nl(l(m)),R,T,e,u))}return M!=null&&Ea(M,null,_,x),F},f=(m,x,w,_,R,T)=>{T=T||!!x.dynamicChildren;const{type:C,props:L,patchFlag:H,shapeFlag:M,dirs:N,transition:Z}=x,ne=C==="input"||C==="option";if(ne||H!==-1){N&&zs(x,null,w,"created");let F=!1;if(v(m)){F=vp(null,Z)&&w&&w.vnode.props&&w.vnode.props.appear;const A=m.content.firstChild;if(F){const q=A.getAttribute("class");q&&(A.$cls=q),Z.beforeEnter(A)}E(A,m,w),x.el=m=A}if(M&16&&!(L&&(L.innerHTML||L.textContent))){let A=p(m.firstChild,x,m,w,_,R,T);for(A&&!al(m,1)&&fa();A;){const q=A;A=A.nextSibling,r(q)}}else if(M&8){let A=x.children;A[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(A=A.slice(1));const{textContent:q}=m;q!==A&&q!==A.replace(/\r\n|\r/g,`
`)&&(al(m,0)||fa(),m.textContent=x.children)}if(L){if(ne||!T||H&48){const A=m.tagName.includes("-");for(const q in L)(ne&&(q.endsWith("value")||q==="indeterminate")||na(q)&&!fn(q)||q[0]==="."||A&&!fn(q))&&n(m,q,null,L[q],void 0,w)}else if(L.onClick)n(m,"onClick",null,L.onClick,void 0,w);else if(H&4&&pn(L.style))for(const A in L.style)L.style[A]}let O;(O=L&&L.onVnodeBeforeMount)&&is(O,w,x),N&&zs(x,null,w,"beforeMount"),((O=L&&L.onVnodeMounted)||N||F)&&_p(()=>{O&&is(O,w,x),F&&Z.enter(m),N&&zs(x,null,w,"mounted")},_)}return m.nextSibling},p=(m,x,w,_,R,T,C)=>{C=C||!!x.dynamicChildren;const L=x.children,H=L.length;let M=!1;for(let N=0;N<H;N++){const Z=C?L[N]:L[N]=rs(L[N]),ne=Z.type===Dn;m?(ne&&!C&&N+1<H&&rs(L[N+1]).type===Dn&&(o(a(m.data.slice(Z.children.length)),w,i(m)),m.data=Z.children),m=u(m,Z,_,R,T,C)):ne&&!Z.children?o(Z.el=a(""),w):(M||(M=!0,al(w,1)||fa()),s(null,Z,w,null,_,R,nl(w),T))}return m},g=(m,x,w,_,R,T)=>{const{slotScopeIds:C}=x;C&&(R=R?R.concat(C):C);const L=l(m),H=p(i(m),x,L,w,_,R,T);return H&&_a(H)&&H.data==="]"?i(x.anchor=H):(fa(),o(x.anchor=c("]"),L,H),H)},y=(m,x,w,_,R,T)=>{if(al(m.parentElement,1)||fa(),x.el=null,T){const H=k(m);for(;;){const M=i(m);if(M&&M!==H)r(M);else break}}const C=i(m),L=l(m);return r(m),s(null,x,L,C,w,_,nl(L),R),w&&(w.vnode.el=x.el,hr(w,x.el)),C},k=(m,x="[",w="]")=>{let _=0;for(;m;)if(m=i(m),m&&_a(m)&&(m.data===x&&_++,m.data===w)){if(_===0)return i(m);_--}return m},E=(m,x,w)=>{const _=x.parentNode;_&&_.replaceChild(m,x);let R=w;for(;R;)R.vnode.el===x&&(R.vnode.el=R.subTree.el=m),R=R.parent},v=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const pd="data-allow-mismatch",Ev={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function al(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(pd);)e=e.parentElement;const s=e&&e.getAttribute(pd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Ev[t])}}const Av=sr().requestIdleCallback||(e=>setTimeout(e,1)),Rv=sr().cancelIdleCallback||(e=>clearTimeout(e)),Iv=(e=1e4)=>t=>{const s=Av(t,{timeout:e});return()=>Rv(s)};function Ov(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Lv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Ov(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Nv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Dv=(e=[])=>(t,s)=>{Pe(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Mv(e,t){if(_a(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(_a(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const hn=e=>!!e.type.__asyncLoader;function Pv(e){Re(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let g;return c||(g=c=t().catch(y=>{if(y=y instanceof Error?y:new Error(String(y)),o)return new Promise((k,E)=>{o(y,()=>k(f()),()=>E(y),u+1)});throw y}).then(y=>g!==c&&c?c:(y&&(y.__esModule||y[Symbol.toStringTag]==="Module")&&(y=y.default),d=y,y)))};return Vi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(g,y,k){let E=!1;(y.bu||(y.bu=[])).push(()=>E=!0);const v=()=>{E||k()},m=i?()=>{const x=i(v,w=>Mv(g,w));x&&(y.bum||(y.bum=[])).push(x)}:v;d?m():p().then(()=>!y.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const g=$t;if(Zo(g),d)return()=>il(d,g);const y=w=>{c=null,la(w,g,13,!n)};if(r&&g.suspense||ea)return p().then(w=>()=>il(w,g)).catch(w=>(y(w),()=>n?ft(n,{error:w}):null));const k=h(!1),E=h(),v=h(!!a);let m,x;return _t(()=>{m!=null&&clearTimeout(m),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{g.isUnmounted||(v.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!g.isUnmounted&&!k.value&&!E.value){const w=new Error(`Async component timed out after ${l}ms.`);y(w),E.value=w}},l)),p().then(()=>{g.isUnmounted||(k.value=!0,g.parent&&ji(g.parent.vnode)&&g.parent.update())}).catch(w=>{if(g.isUnmounted){c=null;return}y(w),E.value=w}),()=>{if(k.value&&d)return il(d,g);if(E.value&&n)return ft(n,{error:E.value});if(s&&!v.value)return il(s,g)}}})}function il(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ft(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ji=e=>e.type.__isKeepAlive,Fv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=es(),n=s.ctx;if(!n.renderer)return()=>{const v=t.default&&t.default();return v&&v.length===1?v[0]:v};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(v,m,x,w,_)=>{const R=v.component;c(v,m,x,0,r),o(R.vnode,v,m,x,R,r,w,v.slotScopeIds,_),kt(()=>{R.isDeactivated=!1,R.a&&Ta(R.a);const T=v.props&&v.props.onVnodeMounted;T&&is(T,R.parent,v)},r)},n.deactivate=v=>{const m=v.component;Rl(m.m),Rl(m.a),c(v,f,null,1,r),kt(()=>{m.da&&Ta(m.da);const x=v.props&&v.props.onVnodeUnmounted;x&&is(x,m.parent,v),m.isDeactivated=!0},r)};function p(v){Nr(v),d(v,s,r,!0)}function g(v){a.forEach((m,x)=>{const w=ho(hn(m)?m.type.__asyncResolved||{}:m.type);w&&!v(w)&&y(x)})}function y(v){const m=a.get(v);m&&(!l||!Os(m,l))?p(m):l&&Nr(l),a.delete(v),i.delete(v)}Xt(()=>[e.include,e.exclude],([v,m])=>{v&&g(x=>ii(v,x)),m&&g(x=>!ii(m,x))},{flush:"post",deep:!0});let k=null;const E=()=>{k!=null&&(Il(s.subTree.type)?kt(()=>{a.set(k,ll(s.subTree))},s.subTree.suspense):a.set(k,ll(s.subTree)))};return Ye(E),ur(E),fr(()=>{a.forEach(v=>{const{subTree:m,suspense:x}=s,w=ll(m);if(v.type===w.type&&v.key===w.key){Nr(w);const _=w.component.da;_&&kt(_,x);return}p(v)})}),()=>{if(k=null,!t.default)return l=null;const v=t.default(),m=v[0];if(v.length>1)return l=null,v;if(!xn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let x=ll(m);if(x.type===xt)return l=null,x;const w=x.type,_=ho(hn(x)?x.type.__asyncResolved||{}:w),{include:R,exclude:T,max:C}=e;if(R&&(!_||!ii(R,_))||T&&_&&ii(T,_))return x.shapeFlag&=-257,l=x,m;const L=x.key==null?w:x.key,H=a.get(L);return x.el&&(x=Ws(x),m.shapeFlag&128&&(m.ssContent=x)),k=L,H?(x.el=H.el,x.component=H.component,x.transition&&yn(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),C&&i.size>parseInt(C,10)&&y(i.values().next().value)),x.shapeFlag|=256,l=x,Il(m.type)?m:x}}},$v=Fv;function ii(e,t){return ve(e)?e.some(s=>ii(s,t)):Pe(e)?e.split(",").includes(t):Wg(e)?(e.lastIndex=0,e.test(t)):!1}function As(e,t){Kf(e,"a",t)}function Rs(e,t){Kf(e,"da",t)}function Kf(e,t,s=$t){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(dr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ji(a.parent.vnode)&&Uv(n,t,s,a),a=a.parent}}function Uv(e,t,s,n){const a=dr(t,e,n,!0);_t(()=>{Po(n[t],a)},s)}function Nr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function ll(e){return e.shapeFlag&128?e.ssContent:e}function dr(e,t,s=$t,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{vn();const r=Ga(s),o=vs(t,s,e,l);return r(),bn(),o});return n?a.unshift(i):a.push(i),i}}const _n=e=>(t,s=$t)=>{(!ea||e==="sp")&&dr(e,(...n)=>t(...n),s)},Wf=_n("bm"),Ye=_n("m"),Jo=_n("bu"),ur=_n("u"),fr=_n("bum"),_t=_n("um"),Zf=_n("sp"),Jf=_n("rtg"),Yf=_n("rtc");function Qf(e,t=$t){dr("ec",e,t)}const Yo="components",Bv="directives";function Hv(e,t){return Qo(Yo,e,!0,t)||e}const Xf=Symbol.for("v-ndc");function Vv(e){return Pe(e)?Qo(Yo,e,!1)||e:e||Xf}function jv(e){return Qo(Bv,e)}function Qo(e,t,s=!0,n=!1){const a=Ut||$t;if(a){const i=a.type;if(e===Yo){const r=ho(i,!1);if(r&&(r===t||r===lt(t)||r===ia(lt(t))))return i}const l=hd(a[e]||i[e],t)||hd(a.appContext[e],t);return!l&&n?i:l}}function hd(e,t){return e&&(e[t]||e[lt(t)]||e[ia(lt(t))])}function zv(e,t,s,n){let a;const i=s&&s[n],l=ve(e);if(l||Pe(e)){const r=l&&pn(e);let o=!1,c=!1;r&&(o=!ds(e),c=Ks(e),e=ir(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?La(Ds(e[d])):Ds(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function qv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ve(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Gv(e,t,s={},n,a){if(Ut.ce||Ut.parent&&hn(Ut.parent)&&Ut.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ai(),Ol(Mt,null,[ft("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ai();const l=i&&Xo(i(s)),r=s.key||l&&l.key,o=Ol(Mt,{key:(r&&!Kt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Xo(e){return e.some(t=>xn(t)?!(t.type===xt||t.type===Mt&&!Xo(t.children)):!0)?e:null}function Kv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Sa(n)]=e[n];return s}const io=e=>e?Rp(e)?zi(e):io(e.parent):null,fi=ze(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>io(e.parent),$root:e=>io(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>ec(e),$forceUpdate:e=>e.f||(e.f=()=>{qo(e.update)}),$nextTick:e=>e.n||(e.n=Ot.bind(e.proxy)),$watch:e=>mv.bind(e)}),Dr=(e,t)=>e!==Ge&&!e.__isScriptSetup&&et(e,t),lo={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Dr(n,t))return l[t]=1,n[t];if(a!==Ge&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==Ge&&et(s,t))return l[t]=4,s[t];ro&&(l[t]=0)}}const c=fi[t];let d,u;if(c)return t==="$attrs"&&zt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&et(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Dr(a,t)?(a[t]=s,!0):n!==Ge&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ge&&r[0]!=="$"&&et(e,r)||Dr(t,r)||et(i,r)||et(n,r)||et(fi,r)||et(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Wv=ze({},lo,{get(e,t){if(t!==Symbol.unscopables)return lo.get(e,t,e)},has(e,t){return t[0]!=="_"&&!tm(t)}});function Zv(){return null}function Jv(){return null}function Yv(e){}function Qv(e){}function Xv(){return null}function eb(){}function tb(e,t){return null}function sb(){return ep().slots}function nb(){return ep().attrs}function ep(e){const t=es();return t.setupContext||(t.setupContext=Np(t))}function Ci(e){return ve(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function ab(e,t){const s=Ci(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ve(a)||Re(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function ib(e,t){return!e||!t?e||t:ve(e)&&ve(t)?e.concat(t):ze({},Ci(e),Ci(t))}function lb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function rb(e){const t=es(),s=ea;let n=e();Ii(),s&&Ra(!1);const a=()=>{Ga(t),s&&Ra(!0)},i=()=>{es()!==t&&t.scope.off(),Ii(),s&&Ra(!1)};return Fo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let ro=!0;function ob(e){const t=ec(e),s=e.proxy,n=e.ctx;ro=!1,t.beforeCreate&&gd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:g,activated:y,deactivated:k,beforeDestroy:E,beforeUnmount:v,destroyed:m,unmounted:x,render:w,renderTracked:_,renderTriggered:R,errorCaptured:T,serverPrefetch:C,expose:L,inheritAttrs:H,components:M,directives:N,filters:Z}=t;if(c&&cb(c,n,null),l)for(const O in l){const A=l[O];Re(A)&&(n[O]=A.bind(s))}if(a){const O=a.call(s,s);Xe(O)&&(e.data=Fn(O))}if(ro=!0,i)for(const O in i){const A=i[O],q=Re(A)?A.bind(s,s):Re(A.get)?A.get.bind(s,s):Bt,K=!Re(A)&&Re(A.set)?A.set.bind(s):Bt,ee=te({get:q,set:K});Object.defineProperty(n,O,{enumerable:!0,configurable:!0,get:()=>ee.value,set:ie=>ee.value=ie})}if(r)for(const O in r)tp(r[O],n,s,O);if(o){const O=Re(o)?o.call(s):o;Reflect.ownKeys(O).forEach(A=>{ui(A,O[A])})}d&&gd(d,e,"c");function F(O,A){ve(A)?A.forEach(q=>O(q.bind(s))):A&&O(A.bind(s))}if(F(Wf,u),F(Ye,f),F(Jo,p),F(ur,g),F(As,y),F(Rs,k),F(Qf,T),F(Yf,_),F(Jf,R),F(fr,v),F(_t,x),F(Zf,C),ve(L))if(L.length){const O=e.exposed||(e.exposed={});L.forEach(A=>{Object.defineProperty(O,A,{get:()=>s[A],set:q=>s[A]=q,enumerable:!0})})}else e.exposed||(e.exposed={});w&&e.render===Bt&&(e.render=w),H!=null&&(e.inheritAttrs=H),M&&(e.components=M),N&&(e.directives=N),C&&Zo(e)}function cb(e,t,s=Bt){ve(e)&&(e=oo(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Ts(a.from||n,a.default,!0):i=Ts(a.from||n):i=Ts(a),Tt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function gd(e,t,s){vs(ve(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function tp(e,t,s,n){let a=n.includes(".")?Bf(s,n):()=>s[n];if(Pe(e)){const i=t[e];Re(i)&&Xt(a,i)}else if(Re(e))Xt(a,e.bind(s));else if(Xe(e))if(ve(e))e.forEach(i=>tp(i,t,s,n));else{const i=Re(e.handler)?e.handler.bind(s):t[e.handler];Re(i)&&Xt(a,i,e)}}function ec(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Al(o,c,l,!0)),Al(o,t,l)),Xe(t)&&i.set(t,o),o}function Al(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Al(e,i,s,!0),a&&a.forEach(l=>Al(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=db[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const db={data:md,props:vd,emits:vd,methods:li,computed:li,beforeCreate:Wt,created:Wt,beforeMount:Wt,mounted:Wt,beforeUpdate:Wt,updated:Wt,beforeDestroy:Wt,beforeUnmount:Wt,destroyed:Wt,unmounted:Wt,activated:Wt,deactivated:Wt,errorCaptured:Wt,serverPrefetch:Wt,components:li,directives:li,watch:fb,provide:md,inject:ub};function md(e,t){return t?e?function(){return ze(Re(e)?e.call(this,this):e,Re(t)?t.call(this,this):t)}:t:e}function ub(e,t){return li(oo(e),oo(t))}function oo(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Wt(e,t){return e?[...new Set([].concat(e,t))]:t}function li(e,t){return e?ze(Object.create(null),e,t):t}function vd(e,t){return e?ve(e)&&ve(t)?[...new Set([...e,...t])]:ze(Object.create(null),Ci(e),Ci(t??{})):t}function fb(e,t){if(!e)return t;if(!t)return e;const s=ze(Object.create(null),e);for(const n in t)s[n]=Wt(e[n],t[n]);return s}function sp(){return{app:null,config:{isNativeTag:xa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let pb=0;function hb(e,t){return function(n,a=null){Re(n)||(n=ze({},n)),a!=null&&!Xe(a)&&(a=null);const i=sp(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:pb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Mp,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Re(d.install)?(l.add(d),d.install(c,...u)):Re(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||ft(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,zi(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(vs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Zn;Zn=c;try{return d()}finally{Zn=u}}};return c}}let Zn=null;function gb(e,t,s=Ge){const n=es(),a=lt(t),i=os(t),l=np(e,a),r=Rf((o,c)=>{let d,u=Ge,f;return Uf(()=>{const p=e[a];Dt(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const g=s.set?s.set(p):p;if(!Dt(g,d)&&!(u!==Ge&&Dt(p,u)))return;const y=n.vnode.props,k=!!(y&&(t in y||a in y||i in y)&&(`onUpdate:${t}`in y||`onUpdate:${a}`in y||`onUpdate:${i}`in y));k||(d=p,c()),n.emit(`update:${t}`,g),Dt(p,u)&&(Dt(p,g)&&!Dt(g,f)||k&&u!==Ge&&!Dt(g,d))&&c(),u=p,f=g}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ge:r,done:!1}:{done:!0}}}},r}const np=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${lt(t)}Modifiers`]||e[`${os(t)}Modifiers`];function mb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&np(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Pe(d)?d.trim():d)),l.number&&(a=s.map(tr)));let r,o=n[r=Sa(t)]||n[r=Sa(lt(t))];!o&&i&&(o=n[r=Sa(os(t))]),o&&vs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,vs(c,e,6,a)}}const vb=new WeakMap;function ap(e,t,s=!1){const n=s?vb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Re(e)){const o=c=>{const d=ap(c,t,!0);d&&(r=!0,ze(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Xe(e)&&n.set(e,null),null):(ve(i)?i.forEach(o=>l[o]=null):ze(l,i),Xe(e)&&n.set(e,l),l)}function pr(e,t){return!e||!na(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,os(t))||et(e,t))}function hl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:g,inheritAttrs:y}=e,k=Ti(e);let E,v;try{if(s.shapeFlag&4){const x=a||n,w=x;E=rs(c.call(w,x,d,u,p,f,g)),v=r}else{const x=t;E=rs(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),v=t.props?r:yb(r)}}catch(x){pi.length=0,la(x,e,1),E=ft(xt)}let m=E;if(v&&y!==!1){const x=Object.keys(v),{shapeFlag:w}=m;x.length&&w&7&&(i&&x.some(Yl)&&(v=xb(v,i)),m=Ws(m,v,!1,!0))}return s.dirs&&(m=Ws(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&yn(m,s.transition),E=m,Ti(k),E}function bb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(xn(a)){if(a.type!==xt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const yb=e=>{let t;for(const s in e)(s==="class"||s==="style"||na(s))&&((t||(t={}))[s]=e[s]);return t},xb=(e,t)=>{const s={};for(const n in e)(!Yl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function _b(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?bd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(ip(l,n,f)&&!pr(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?bd(n,l,c):!0:!!l;return!1}function bd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(ip(t,e,i)&&!pr(s,i))return!0}return!1}function ip(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!mn(n,a):n!==a}function hr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const lp={},rp=()=>Object.create(lp),op=e=>Object.getPrototypeOf(e)===lp;function wb(e,t,s,n=!1){const a={},i=rp();e.propsDefaults=Object.create(null),cp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Vo(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function kb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Je(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(pr(e.emitsOptions,f))continue;const p=t[f];if(o)if(et(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const g=lt(f);a[g]=co(o,r,g,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{cp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!et(t,u)&&((d=os(u))===u||!et(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=co(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&rn(e.attrs,"set","")}function cp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(fn(o))continue;const c=t[o];let d;a&&et(a,d=lt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:pr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Je(s),c=r||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=co(a,o,u,c[u],e,!et(c,u))}}return l}function co(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=et(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Re(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ga(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===os(s))&&(n=!0))}return n}const Sb=new WeakMap;function dp(e,t,s=!1){const n=s?Sb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Re(e)){const d=u=>{o=!0;const[f,p]=dp(u,t,!0);ze(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Xe(e)&&n.set(e,wa),wa;if(ve(i))for(let d=0;d<i.length;d++){const u=lt(i[d]);yd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=lt(d);if(yd(u)){const f=i[d],p=l[u]=ve(f)||Re(f)?{type:f}:ze({},f),g=p.type;let y=!1,k=!0;if(ve(g))for(let E=0;E<g.length;++E){const v=g[E],m=Re(v)&&v.name;if(m==="Boolean"){y=!0;break}else m==="String"&&(k=!1)}else y=Re(g)&&g.name==="Boolean";p[0]=y,p[1]=k,(y||et(p,"default"))&&r.push(u)}}const c=[l,r];return Xe(e)&&n.set(e,c),c}function yd(e){return e[0]!=="$"&&!fn(e)}const tc=e=>e==="_"||e==="_ctx"||e==="$stable",sc=e=>ve(e)?e.map(rs):[rs(e)],Tb=(e,t,s)=>{if(t._n)return t;const n=Go((...a)=>sc(t(...a)),s);return n._c=!1,n},up=(e,t,s)=>{const n=e._ctx;for(const a in e){if(tc(a))continue;const i=e[a];if(Re(i))t[a]=Tb(a,i,n);else if(i!=null){const l=sc(i);t[a]=()=>l}}},fp=(e,t)=>{const s=sc(t);e.slots.default=()=>s},pp=(e,t,s)=>{for(const n in t)(s||!tc(n))&&(e[n]=t[n])},Cb=(e,t,s)=>{const n=e.slots=rp();if(e.vnode.shapeFlag&32){const a=t._;a?(pp(n,t,s),s&&af(n,"_",a,!0)):up(t,n)}else t&&fp(e,t)},Eb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:pp(a,t,s):(i=!t.$stable,up(t,a)),l=t}else t&&(fp(e,t),l={default:1});if(i)for(const r in a)!tc(r)&&l[r]==null&&delete a[r]},kt=_p;function hp(e){return mp(e)}function gp(e){return mp(e,Cv)}function mp(e,t){const s=sr();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=Bt,insertStaticContent:g}=e,y=(b,I,P,X=null,J=null,Y=null,pe=void 0,ce=null,oe=!!I.dynamicChildren)=>{if(b===I)return;b&&!Os(b,I)&&(X=V(b),ie(b,J,Y,!0),b=null),I.patchFlag===-2&&(oe=!1,I.dynamicChildren=null);const{type:se,ref:ye,shapeFlag:he}=I;switch(se){case Dn:k(b,I,P,X);break;case xt:E(b,I,P,X);break;case Jn:b==null&&v(I,P,X,pe);break;case Mt:M(b,I,P,X,J,Y,pe,ce,oe);break;default:he&1?w(b,I,P,X,J,Y,pe,ce,oe):he&6?N(b,I,P,X,J,Y,pe,ce,oe):(he&64||he&128)&&se.process(b,I,P,X,J,Y,pe,ce,oe,xe)}ye!=null&&J?Ea(ye,b&&b.ref,Y,I||b,!I):ye==null&&b&&b.ref!=null&&Ea(b.ref,null,Y,b,!0)},k=(b,I,P,X)=>{if(b==null)n(I.el=r(I.children),P,X);else{const J=I.el=b.el;I.children!==b.children&&c(J,I.children)}},E=(b,I,P,X)=>{b==null?n(I.el=o(I.children||""),P,X):I.el=b.el},v=(b,I,P,X)=>{[b.el,b.anchor]=g(b.children,I,P,X,b.el,b.anchor)},m=({el:b,anchor:I},P,X)=>{let J;for(;b&&b!==I;)J=f(b),n(b,P,X),b=J;n(I,P,X)},x=({el:b,anchor:I})=>{let P;for(;b&&b!==I;)P=f(b),a(b),b=P;a(I)},w=(b,I,P,X,J,Y,pe,ce,oe)=>{if(I.type==="svg"?pe="svg":I.type==="math"&&(pe="mathml"),b==null)_(I,P,X,J,Y,pe,ce,oe);else{const se=b.el&&b.el._isVueCE?b.el:null;try{se&&se._beginPatch(),C(b,I,J,Y,pe,ce,oe)}finally{se&&se._endPatch()}}},_=(b,I,P,X,J,Y,pe,ce)=>{let oe,se;const{props:ye,shapeFlag:he,transition:ge,dirs:ke}=b;if(oe=b.el=l(b.type,Y,ye&&ye.is,ye),he&8?d(oe,b.children):he&16&&T(b.children,oe,null,X,J,Mr(b,Y),pe,ce),ke&&zs(b,null,X,"created"),R(oe,b,b.scopeId,pe,X),ye){for(const Ie in ye)Ie!=="value"&&!fn(Ie)&&i(oe,Ie,null,ye[Ie],Y,X);"value"in ye&&i(oe,"value",null,ye.value,Y),(se=ye.onVnodeBeforeMount)&&is(se,X,b)}ke&&zs(b,null,X,"beforeMount");const Ce=vp(J,ge);Ce&&ge.beforeEnter(oe),n(oe,I,P),((se=ye&&ye.onVnodeMounted)||Ce||ke)&&kt(()=>{try{se&&is(se,X,b),Ce&&ge.enter(oe),ke&&zs(b,null,X,"mounted")}finally{}},J)},R=(b,I,P,X,J)=>{if(P&&p(b,P),X)for(let Y=0;Y<X.length;Y++)p(b,X[Y]);if(J){let Y=J.subTree;if(I===Y||Il(Y.type)&&(Y.ssContent===I||Y.ssFallback===I)){const pe=J.vnode;R(b,pe,pe.scopeId,pe.slotScopeIds,J.parent)}}},T=(b,I,P,X,J,Y,pe,ce,oe=0)=>{for(let se=oe;se<b.length;se++){const ye=b[se]=ce?an(b[se]):rs(b[se]);y(null,ye,I,P,X,J,Y,pe,ce)}},C=(b,I,P,X,J,Y,pe)=>{const ce=I.el=b.el;let{patchFlag:oe,dynamicChildren:se,dirs:ye}=I;oe|=b.patchFlag&16;const he=b.props||Ge,ge=I.props||Ge;let ke;if(P&&Bn(P,!1),(ke=ge.onVnodeBeforeUpdate)&&is(ke,P,I,b),ye&&zs(I,b,P,"beforeUpdate"),P&&Bn(P,!0),(he.innerHTML&&ge.innerHTML==null||he.textContent&&ge.textContent==null)&&d(ce,""),se?L(b.dynamicChildren,se,ce,P,X,Mr(I,J),Y):pe||A(b,I,ce,null,P,X,Mr(I,J),Y,!1),oe>0){if(oe&16)H(ce,he,ge,P,J);else if(oe&2&&he.class!==ge.class&&i(ce,"class",null,ge.class,J),oe&4&&i(ce,"style",he.style,ge.style,J),oe&8){const Ce=I.dynamicProps;for(let Ie=0;Ie<Ce.length;Ie++){const Me=Ce[Ie],Fe=he[Me],Ve=ge[Me];(Ve!==Fe||Me==="value")&&i(ce,Me,Fe,Ve,J,P)}}oe&1&&b.children!==I.children&&d(ce,I.children)}else!pe&&se==null&&H(ce,he,ge,P,J);((ke=ge.onVnodeUpdated)||ye)&&kt(()=>{ke&&is(ke,P,I,b),ye&&zs(I,b,P,"updated")},X)},L=(b,I,P,X,J,Y,pe)=>{for(let ce=0;ce<I.length;ce++){const oe=b[ce],se=I[ce],ye=oe.el&&(oe.type===Mt||!Os(oe,se)||oe.shapeFlag&198)?u(oe.el):P;y(oe,se,ye,null,X,J,Y,pe,!0)}},H=(b,I,P,X,J)=>{if(I!==P){if(I!==Ge)for(const Y in I)!fn(Y)&&!(Y in P)&&i(b,Y,I[Y],null,J,X);for(const Y in P){if(fn(Y))continue;const pe=P[Y],ce=I[Y];pe!==ce&&Y!=="value"&&i(b,Y,ce,pe,J,X)}"value"in P&&i(b,"value",I.value,P.value,J)}},M=(b,I,P,X,J,Y,pe,ce,oe)=>{const se=I.el=b?b.el:r(""),ye=I.anchor=b?b.anchor:r("");let{patchFlag:he,dynamicChildren:ge,slotScopeIds:ke}=I;ke&&(ce=ce?ce.concat(ke):ke),b==null?(n(se,P,X),n(ye,P,X),T(I.children||[],P,ye,J,Y,pe,ce,oe)):he>0&&he&64&&ge&&b.dynamicChildren&&b.dynamicChildren.length===ge.length?(L(b.dynamicChildren,ge,P,J,Y,pe,ce),(I.key!=null||J&&I===J.subTree)&&nc(b,I,!0)):A(b,I,P,ye,J,Y,pe,ce,oe)},N=(b,I,P,X,J,Y,pe,ce,oe)=>{I.slotScopeIds=ce,b==null?I.shapeFlag&512?J.ctx.activate(I,P,X,pe,oe):Z(I,P,X,J,Y,pe,oe):ne(b,I,oe)},Z=(b,I,P,X,J,Y,pe)=>{const ce=b.component=Ap(b,X,J);if(ji(b)&&(ce.ctx.renderer=xe),Ip(ce,!1,pe),ce.asyncDep){if(J&&J.registerDep(ce,F,pe),!b.el){const oe=ce.subTree=ft(xt);E(null,oe,I,P),b.placeholder=oe.el}}else F(ce,b,I,P,J,Y,pe)},ne=(b,I,P)=>{const X=I.component=b.component;if(_b(b,I,P))if(X.asyncDep&&!X.asyncResolved){O(X,I,P);return}else X.next=I,X.update();else I.el=b.el,X.vnode=I},F=(b,I,P,X,J,Y,pe)=>{const ce=()=>{if(b.isMounted){let{next:he,bu:ge,u:ke,parent:Ce,vnode:Ie}=b;{const j=bp(b);if(j){he&&(he.el=Ie.el,O(b,he,pe)),j.asyncDep.then(()=>{kt(()=>{b.isUnmounted||se()},J)});return}}let Me=he,Fe;Bn(b,!1),he?(he.el=Ie.el,O(b,he,pe)):he=Ie,ge&&Ta(ge),(Fe=he.props&&he.props.onVnodeBeforeUpdate)&&is(Fe,Ce,he,Ie),Bn(b,!0);const Ve=hl(b),st=b.subTree;b.subTree=Ve,y(st,Ve,u(st.el),V(st),b,J,Y),he.el=Ve.el,Me===null&&hr(b,Ve.el),ke&&kt(ke,J),(Fe=he.props&&he.props.onVnodeUpdated)&&kt(()=>is(Fe,Ce,he,Ie),J)}else{let he;const{el:ge,props:ke}=I,{bm:Ce,m:Ie,parent:Me,root:Fe,type:Ve}=b,st=hn(I);if(Bn(b,!1),Ce&&Ta(Ce),!st&&(he=ke&&ke.onVnodeBeforeMount)&&is(he,Me,I),Bn(b,!0),ge&&Be){const j=()=>{b.subTree=hl(b),Be(ge,b.subTree,b,J,null)};st&&Ve.__asyncHydrate?Ve.__asyncHydrate(ge,b,j):j()}else{Fe.ce&&Fe.ce._hasShadowRoot()&&Fe.ce._injectChildStyle(Ve,b.parent?b.parent.type:void 0);const j=b.subTree=hl(b);y(null,j,P,X,b,J,Y),I.el=j.el}if(Ie&&kt(Ie,J),!st&&(he=ke&&ke.onVnodeMounted)){const j=I;kt(()=>is(he,Me,j),J)}(I.shapeFlag&256||Me&&hn(Me.vnode)&&Me.vnode.shapeFlag&256)&&b.a&&kt(b.a,J),b.isMounted=!0,I=P=X=null}};b.scope.on();const oe=b.effect=new xi(ce);b.scope.off();const se=b.update=oe.run.bind(oe),ye=b.job=oe.runIfDirty.bind(oe);ye.i=b,ye.id=b.uid,oe.scheduler=()=>qo(ye),Bn(b,!0),se()},O=(b,I,P)=>{I.component=b;const X=b.vnode.props;b.vnode=I,b.next=null,kb(b,I.props,X,P),Eb(b,I.children,P),vn(),ld(b),bn()},A=(b,I,P,X,J,Y,pe,ce,oe=!1)=>{const se=b&&b.children,ye=b?b.shapeFlag:0,he=I.children,{patchFlag:ge,shapeFlag:ke}=I;if(ge>0){if(ge&128){K(se,he,P,X,J,Y,pe,ce,oe);return}else if(ge&256){q(se,he,P,X,J,Y,pe,ce,oe);return}}ke&8?(ye&16&&_e(se,J,Y),he!==se&&d(P,he)):ye&16?ke&16?K(se,he,P,X,J,Y,pe,ce,oe):_e(se,J,Y,!0):(ye&8&&d(P,""),ke&16&&T(he,P,X,J,Y,pe,ce,oe))},q=(b,I,P,X,J,Y,pe,ce,oe)=>{b=b||wa,I=I||wa;const se=b.length,ye=I.length,he=Math.min(se,ye);let ge;for(ge=0;ge<he;ge++){const ke=I[ge]=oe?an(I[ge]):rs(I[ge]);y(b[ge],ke,P,null,J,Y,pe,ce,oe)}se>ye?_e(b,J,Y,!0,!1,he):T(I,P,X,J,Y,pe,ce,oe,he)},K=(b,I,P,X,J,Y,pe,ce,oe)=>{let se=0;const ye=I.length;let he=b.length-1,ge=ye-1;for(;se<=he&&se<=ge;){const ke=b[se],Ce=I[se]=oe?an(I[se]):rs(I[se]);if(Os(ke,Ce))y(ke,Ce,P,null,J,Y,pe,ce,oe);else break;se++}for(;se<=he&&se<=ge;){const ke=b[he],Ce=I[ge]=oe?an(I[ge]):rs(I[ge]);if(Os(ke,Ce))y(ke,Ce,P,null,J,Y,pe,ce,oe);else break;he--,ge--}if(se>he){if(se<=ge){const ke=ge+1,Ce=ke<ye?I[ke].el:X;for(;se<=ge;)y(null,I[se]=oe?an(I[se]):rs(I[se]),P,Ce,J,Y,pe,ce,oe),se++}}else if(se>ge)for(;se<=he;)ie(b[se],J,Y,!0),se++;else{const ke=se,Ce=se,Ie=new Map;for(se=Ce;se<=ge;se++){const De=I[se]=oe?an(I[se]):rs(I[se]);De.key!=null&&Ie.set(De.key,se)}let Me,Fe=0;const Ve=ge-Ce+1;let st=!1,j=0;const we=new Array(Ve);for(se=0;se<Ve;se++)we[se]=0;for(se=ke;se<=he;se++){const De=b[se];if(Fe>=Ve){ie(De,J,Y,!0);continue}let Ke;if(De.key!=null)Ke=Ie.get(De.key);else for(Me=Ce;Me<=ge;Me++)if(we[Me-Ce]===0&&Os(De,I[Me])){Ke=Me;break}Ke===void 0?ie(De,J,Y,!0):(we[Ke-Ce]=se+1,Ke>=j?j=Ke:st=!0,y(De,I[Ke],P,null,J,Y,pe,ce,oe),Fe++)}const Le=st?Ab(we):wa;for(Me=Le.length-1,se=Ve-1;se>=0;se--){const De=Ce+se,Ke=I[De],qe=I[De+1],ht=De+1<ye?qe.el||yp(qe):X;we[se]===0?y(null,Ke,P,ht,J,Y,pe,ce,oe):st&&(Me<0||se!==Le[Me]?ee(Ke,P,ht,2):Me--)}}},ee=(b,I,P,X,J=null)=>{const{el:Y,type:pe,transition:ce,children:oe,shapeFlag:se}=b;if(se&6){ee(b.component.subTree,I,P,X);return}if(se&128){b.suspense.move(I,P,X);return}if(se&64){pe.move(b,I,P,xe);return}if(pe===Mt){n(Y,I,P);for(let he=0;he<oe.length;he++)ee(oe[he],I,P,X);n(b.anchor,I,P);return}if(pe===Jn){m(b,I,P);return}if(X!==2&&se&1&&ce)if(X===0)ce.persisted&&!Y[ws]?n(Y,I,P):(ce.beforeEnter(Y),n(Y,I,P),kt(()=>ce.enter(Y),J));else{const{leave:he,delayLeave:ge,afterLeave:ke}=ce,Ce=()=>{b.ctx.isUnmounted?a(Y):n(Y,I,P)},Ie=()=>{const Me=Y._isLeaving||!!Y[ws];Y._isLeaving&&Y[ws](!0),ce.persisted&&!Me?Ce():he(Y,()=>{Ce(),ke&&ke()})};ge?ge(Y,Ce,Ie):Ie()}else n(Y,I,P)},ie=(b,I,P,X=!1,J=!1)=>{const{type:Y,props:pe,ref:ce,children:oe,dynamicChildren:se,shapeFlag:ye,patchFlag:he,dirs:ge,cacheIndex:ke,memo:Ce}=b;if(he===-2&&(J=!1),ce!=null&&(vn(),Ea(ce,null,P,b,!0),bn()),ke!=null&&(I.renderCache[ke]=void 0),ye&256){I.ctx.deactivate(b);return}const Ie=ye&1&&ge,Me=!hn(b);let Fe;if(Me&&(Fe=pe&&pe.onVnodeBeforeUnmount)&&is(Fe,I,b),ye&6)re(b.component,P,X);else{if(ye&128){b.suspense.unmount(P,X);return}Ie&&zs(b,null,I,"beforeUnmount"),ye&64?b.type.remove(b,I,P,xe,X):se&&!se.hasOnce&&(Y!==Mt||he>0&&he&64)?_e(se,I,P,!1,!0):(Y===Mt&&he&384||!J&&ye&16)&&_e(oe,I,P),X&&U(b)}const Ve=Ce!=null&&ke==null;(Me&&(Fe=pe&&pe.onVnodeUnmounted)||Ie||Ve)&&kt(()=>{Fe&&is(Fe,I,b),Ie&&zs(b,null,I,"unmounted"),Ve&&(b.el=null)},P)},U=b=>{const{type:I,el:P,anchor:X,transition:J}=b;if(I===Mt){B(P,X);return}if(I===Jn){x(b);return}const Y=()=>{a(P),J&&!J.persisted&&J.afterLeave&&J.afterLeave()};if(b.shapeFlag&1&&J&&!J.persisted){const{leave:pe,delayLeave:ce}=J,oe=()=>pe(P,Y);ce?ce(b.el,Y,oe):oe()}else Y()},B=(b,I)=>{let P;for(;b!==I;)P=f(b),a(b),b=P;a(I)},re=(b,I,P)=>{const{bum:X,scope:J,job:Y,subTree:pe,um:ce,m:oe,a:se}=b;Rl(oe),Rl(se),X&&Ta(X),J.stop(),Y&&(Y.flags|=8,ie(pe,b,I,P)),ce&&kt(ce,I),kt(()=>{b.isUnmounted=!0},I)},_e=(b,I,P,X=!1,J=!1,Y=0)=>{for(let pe=Y;pe<b.length;pe++)ie(b[pe],I,P,X,J)},V=b=>{if(b.shapeFlag&6)return V(b.component.subTree);if(b.shapeFlag&128)return b.suspense.next();const I=f(b.anchor||b.el),P=I&&I[Hf];return P?f(P):I};let fe=!1;const de=(b,I,P)=>{let X;b==null?I._vnode&&(ie(I._vnode,null,null,!0),X=I._vnode.component):y(I._vnode||null,b,I,null,null,null,P),I._vnode=b,fe||(fe=!0,ld(X),Cl(),fe=!1)},xe={p:y,um:ie,m:ee,r:U,mt:Z,mc:T,pc:A,pbc:L,n:V,o:e};let me,Be;return t&&([me,Be]=t(xe)),{render:de,hydrate:me,createApp:hb(de,me)}}function Mr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function vp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function nc(e,t,s=!1){const n=e.children,a=t.children;if(ve(n)&&ve(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=an(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&nc(l,r)),r.type===Dn&&(r.patchFlag===-1&&(r=a[i]=an(r)),r.el=l.el),r.type===xt&&!r.el&&(r.el=l.el)}}function Ab(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function bp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:bp(t)}function Rl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function yp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?yp(t.subTree):null}const Il=e=>e.__isSuspense;let uo=0;const Rb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Ob(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Lb(e,t,s,n,a,l,r,o,c)}},hydrate:Nb,normalize:Db},Ib=Rb;function Ei(e,t){const s=e.props&&e.props[t];Re(s)&&s()}function Ob(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=xp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(Ei(e,"onPending"),Ei(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Aa(f,e.ssFallback)):f.resolve(!1,!0)}function Lb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:g,pendingBranch:y,isInFallback:k,isHydrating:E}=u;if(y)u.pendingBranch=f,Os(y,f)?(o(y,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():k&&(E||(o(g,p,s,n,a,null,i,l,r),Aa(u,p)))):(u.pendingId=uo++,E?(u.isHydrating=!1,u.activeBranch=y):c(y,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),k?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(g,p,s,n,a,null,i,l,r),Aa(u,p))):g&&Os(g,f)?(o(g,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(g&&Os(g,f))o(g,f,s,n,a,u,i,l,r),Aa(u,f);else if(Ei(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=uo++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:v,pendingId:m}=u;v>0?setTimeout(()=>{u.pendingId===m&&u.fallback(p)},v):v===0&&u.fallback(p)}}function xp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:g,o:{parentNode:y,remove:k}}=c;let E;const v=Mb(e);v&&t&&t.pendingBranch&&(E=t.pendingId,t.deps++);const m=e.props?_l(e.props.timeout):void 0,x=i,w={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:uo++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,R=!1){const{vnode:T,activeBranch:C,pendingBranch:L,pendingId:H,effects:M,parentComponent:N,container:Z,isInFallback:ne}=w;let F=!1;if(w.isHydrating)w.isHydrating=!1;else if(!_){F=C&&L.transition&&L.transition.mode==="out-in";let q=!1;F&&(C.transition.afterLeave=()=>{H===w.pendingId&&(f(L,Z,i===x&&!q?g(C):i,0),ki(M),ne&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!w.isFallbackMountPending&&(y(C.el)===Z&&(i=g(C),q=!0),p(C,N,w,!0),!F&&ne&&T.ssFallback&&kt(()=>T.ssFallback.el=null,w)),F||f(L,Z,i,0)}w.isFallbackMountPending=!1,Aa(w,L),w.pendingBranch=null,w.isInFallback=!1;let O=w.parent,A=!1;for(;O;){if(O.pendingBranch){O.effects.push(...M),A=!0;break}O=O.parent}!A&&!F&&ki(M),w.effects=[],v&&t&&t.pendingBranch&&E===t.pendingId&&(t.deps--,t.deps===0&&!R&&t.resolve()),Ei(T,"onResolve")},fallback(_){if(!w.pendingBranch)return;const{vnode:R,activeBranch:T,parentComponent:C,container:L,namespace:H}=w;Ei(R,"onFallback");const M=g(T),N=()=>{w.isFallbackMountPending=!1,w.isInFallback&&(u(null,_,L,M,C,null,H,r,o),Aa(w,_))},Z=_.transition&&_.transition.mode==="out-in";Z&&(w.isFallbackMountPending=!0,T.transition.afterLeave=N),w.isInFallback=!0,p(T,C,null,!0),Z||N()},move(_,R,T){w.activeBranch&&f(w.activeBranch,_,R,T),w.container=_},next(){return w.activeBranch&&g(w.activeBranch)},registerDep(_,R,T){const C=!!w.pendingBranch;C&&w.deps++;const L=_.vnode.el;_.asyncDep.catch(H=>{la(H,_,0)}).then(H=>{if(_.isUnmounted||w.isUnmounted||w.pendingId!==_.suspenseId)return;Ii(),_.asyncResolved=!0;const{vnode:M}=_;fo(_,H,!1),L&&(M.el=L);const N=!L&&_.subTree.el;R(_,M,y(L||_.subTree.el),L?null:g(_.subTree),w,l,T),N&&(M.placeholder=null,k(N)),hr(_,M.el),C&&--w.deps===0&&w.resolve()})},unmount(_,R){w.isUnmounted=!0,w.activeBranch&&p(w.activeBranch,s,_,R),w.pendingBranch&&p(w.pendingBranch,s,_,R)}};return w}function Nb(e,t,s,n,a,i,l,r,o){const c=t.suspense=xp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Db(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=xd(n?s.default:s),e.ssFallback=n?xd(s.fallback):ft(xt)}function xd(e){let t;if(Re(e)){const s=Xn&&e._c;s&&(e._d=!1,Ai()),e=e(),s&&(e._d=!0,t=qt,wp())}return ve(e)&&(e=bb(e)),e=rs(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function _p(e,t){t&&t.pendingBranch?ve(e)?t.effects.push(...e):t.effects.push(e):ki(e)}function Aa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,hr(n,a))}function Mb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Mt=Symbol.for("v-fgt"),Dn=Symbol.for("v-txt"),xt=Symbol.for("v-cmt"),Jn=Symbol.for("v-stc"),pi=[];let qt=null;function Ai(e=!1){pi.push(qt=e?null:[])}function wp(){pi.pop(),qt=pi[pi.length-1]||null}let Xn=1;function Ri(e,t=!1){Xn+=e,e<0&&qt&&t&&(qt.hasOnce=!0)}function kp(e){return e.dynamicChildren=Xn>0?qt||wa:null,wp(),Xn>0&&qt&&qt.push(e),e}function Pb(e,t,s,n,a,i){return kp(ac(e,t,s,n,a,i,!0))}function Ol(e,t,s,n,a){return kp(ft(e,t,s,n,a,!0))}function xn(e){return e?e.__v_isVNode===!0:!1}function Os(e,t){return e.type===t.type&&e.key===t.key}function Fb(e){}const Sp=({key:e})=>e??null,gl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Pe(e)||Tt(e)||Re(e)?{i:Ut,r:e,k:t,f:!!s}:e:null);function ac(e,t=null,s=null,n=0,a=null,i=e===Mt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Sp(t),ref:t&&gl(t),scopeId:or,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ut};return r?(lc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Pe(s)?8:16),Xn>0&&!l&&qt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&qt.push(o),o}const ft=$b;function $b(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Xf)&&(e=xt),xn(e)){const r=Ws(e,t,!0);return s&&lc(r,s),Xn>0&&!i&&qt&&(r.shapeFlag&6?qt[qt.indexOf(e)]=r:qt.push(r)),r.patchFlag=-2,r}if(qb(e)&&(e=e.__vccOpts),t){t=Tp(t);let{class:r,style:o}=t;r&&!Pe(r)&&(t.class=Ui(r)),Xe(o)&&(Bi(o)&&!ve(o)&&(o=ze({},o)),t.style=$i(o))}const l=Pe(e)?1:Il(e)?128:Vf(e)?64:Xe(e)?4:Re(e)?2:0;return ac(e,t,s,n,a,l,i,!0)}function Tp(e){return e?Bi(e)||op(e)?ze({},e):e:null}function Ws(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Ep(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Sp(c),ref:t&&t.ref?s&&i?ve(i)?i.concat(gl(t)):[i,gl(t)]:gl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Mt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ws(e.ssContent),ssFallback:e.ssFallback&&Ws(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&yn(d,o.clone(d)),d}function ic(e=" ",t=0){return ft(Dn,null,e,t)}function Ub(e,t){const s=ft(Jn,null,e);return s.staticCount=t,s}function Cp(e="",t=!1){return t?(Ai(),Ol(xt,null,e)):ft(xt,null,e)}function rs(e){return e==null||typeof e=="boolean"?ft(xt):ve(e)?ft(Mt,null,e.slice()):xn(e)?an(e):ft(Dn,null,String(e))}function an(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ws(e)}function lc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ve(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),lc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!op(t)?t._ctx=Ut:a===3&&Ut&&(Ut.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Re(t)?(t={default:t,_ctx:Ut},s=32):(t=String(t),n&64?(s=16,t=[ic(t)]):s=8);e.children=t,e.shapeFlag|=s}function Ep(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ui([t.class,n.class]));else if(a==="style")t.style=$i([t.style,n.style]);else if(na(a)){const i=t[a],l=n[a];l&&i!==l&&!(ve(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Yl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function is(e,t,s,n=null){vs(e,t,7,[s,n])}const Bb=sp();let Hb=0;function Ap(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Bb,i={uid:Hb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new $o(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:dp(n,a),emitsOptions:ap(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=mb.bind(null,i),e.ce&&e.ce(i),i}let $t=null;const es=()=>$t||Ut;let Ll,Ra;{const e=sr(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Ll=t("__VUE_INSTANCE_SETTERS__",s=>$t=s),Ra=t("__VUE_SSR_SETTERS__",s=>ea=s)}const Ga=e=>{const t=$t;return Ll(e),e.scope.on(),()=>{e.scope.off(),Ll(t)}},Ii=()=>{$t&&$t.scope.off(),Ll(null)};function Rp(e){return e.vnode.shapeFlag&4}let ea=!1;function Ip(e,t=!1,s=!1){t&&Ra(t);const{props:n,children:a}=e.vnode,i=Rp(e);wb(e,n,i,t),Cb(e,a,s||t);const l=i?Vb(e,t):void 0;return t&&Ra(!1),l}function Vb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,lo);const{setup:n}=s;if(n){vn();const a=e.setupContext=n.length>1?Np(e):null,i=Ga(e),l=qa(n,e,0,[e.props,a]),r=Fo(l);if(bn(),i(),(r||e.sp)&&!hn(e)&&Zo(e),r){if(l.then(Ii,Ii),t)return l.then(o=>{fo(e,o,t)}).catch(o=>{la(o,e,0)});e.asyncDep=l}else fo(e,l,t)}else Lp(e,t)}function fo(e,t,s){Re(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=zo(t)),Lp(e,s)}let Nl,po;function Op(e){Nl=e,po=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Wv))}}const jb=()=>!Nl;function Lp(e,t,s){const n=e.type;if(!e.render){if(!t&&Nl&&!n.render){const a=n.template||ec(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=ze(ze({isCustomElement:i,delimiters:r},l),o);n.render=Nl(a,c)}}e.render=n.render||Bt,po&&po(e)}{const a=Ga(e);vn();try{ob(e)}finally{bn(),a()}}}const zb={get(e,t){return zt(e,"get",""),e[t]}};function Np(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,zb),slots:e.slots,emit:e.emit,expose:t}}function zi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(zo(Ef(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in fi)return fi[s](e)},has(t,s){return s in t||s in fi}})):e.proxy}function ho(e,t=!0){return Re(e)?e.displayName||e.name:e.name||t&&e.__name}function qb(e){return Re(e)&&"__vccOpts"in e}const te=(e,t)=>Ym(e,t,ea);function Da(e,t,s){try{Ri(-1);const n=arguments.length;return n===2?Xe(t)&&!ve(t)?xn(t)?ft(e,null,[t]):ft(e,t):ft(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&xn(s)&&(s=[s]),ft(e,t,s))}finally{Ri(1)}}function Gb(){}function Kb(e,t,s,n){const a=s[n];if(a&&Dp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Dp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Dt(s[n],t[n]))return!1;return Xn>0&&qt&&qt.push(e),!0}const Mp="3.5.38",Wb=Bt,Zb=lv,Jb=va,Yb=Pf,Qb={createComponentInstance:Ap,setupComponent:Ip,renderComponentRoot:hl,setCurrentRenderingInstance:Ti,isVNode:xn,normalizeVNode:rs,getComponentPublicInstance:zi,ensureValidVNode:Xo,pushWarningContext:sv,popWarningContext:nv},Xb=Qb,ey=null,ty=null,sy=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let go;const _d=typeof window<"u"&&window.trustedTypes;if(_d)try{go=_d.createPolicy("vue",{createHTML:e=>e})}catch{}const Pp=go?e=>go.createHTML(e):e=>e,ny="http://www.w3.org/2000/svg",ay="http://www.w3.org/1998/Math/MathML",nn=typeof document<"u"?document:null,wd=nn&&nn.createElement("template"),Fp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?nn.createElementNS(ny,e):t==="mathml"?nn.createElementNS(ay,e):s?nn.createElement(e,{is:s}):nn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>nn.createTextNode(e),createComment:e=>nn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>nn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{wd.innerHTML=Pp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=wd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Sn="transition",Ja="animation",Ma=Symbol("_vtc"),$p={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Up=ze({},Wo,$p),iy=e=>(e.displayName="Transition",e.props=Up,e),ly=iy((e,{slots:t})=>Da(qf,Bp(e),t)),Hn=(e,t=[])=>{ve(e)?e.forEach(s=>s(...t)):e&&e(...t)},kd=e=>e?ve(e)?e.some(t=>t.length>1):e.length>1:!1;function Bp(e){const t={};for(const M in e)M in $p||(t[M]=e[M]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,g=ry(a),y=g&&g[0],k=g&&g[1],{onBeforeEnter:E,onEnter:v,onEnterCancelled:m,onLeave:x,onLeaveCancelled:w,onBeforeAppear:_=E,onAppear:R=v,onAppearCancelled:T=m}=t,C=(M,N,Z,ne)=>{M._enterCancelled=ne,An(M,N?d:r),An(M,N?c:l),Z&&Z()},L=(M,N)=>{M._isLeaving=!1,An(M,u),An(M,p),An(M,f),N&&N()},H=M=>(N,Z)=>{const ne=M?R:v,F=()=>C(N,M,Z);Hn(ne,[N,F]),Sd(()=>{An(N,M?o:i),Bs(N,M?d:r),kd(ne)||Td(N,n,y,F)})};return ze(t,{onBeforeEnter(M){Hn(E,[M]),Bs(M,i),Bs(M,l)},onBeforeAppear(M){Hn(_,[M]),Bs(M,o),Bs(M,c)},onEnter:H(!1),onAppear:H(!0),onLeave(M,N){M._isLeaving=!0;const Z=()=>L(M,N);Bs(M,u),M._enterCancelled?(Bs(M,f),mo(M)):(mo(M),Bs(M,f)),Sd(()=>{M._isLeaving&&(An(M,u),Bs(M,p),kd(x)||Td(M,n,k,Z))}),Hn(x,[M,Z])},onEnterCancelled(M){C(M,!1,void 0,!0),Hn(m,[M])},onAppearCancelled(M){C(M,!0,void 0,!0),Hn(T,[M])},onLeaveCancelled(M){L(M),Hn(w,[M])}})}function ry(e){if(e==null)return null;if(Xe(e))return[Pr(e.enter),Pr(e.leave)];{const t=Pr(e);return[t,t]}}function Pr(e){return _l(e)}function Bs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ma]||(e[Ma]=new Set)).add(t)}function An(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ma];s&&(s.delete(t),s.size||(e[Ma]=void 0))}function Sd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let oy=0;function Td(e,t,s,n){const a=e._endId=++oy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Hp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Hp(e,t){const s=window.getComputedStyle(e),n=g=>(s[g]||"").split(", "),a=n(`${Sn}Delay`),i=n(`${Sn}Duration`),l=Cd(a,i),r=n(`${Ja}Delay`),o=n(`${Ja}Duration`),c=Cd(r,o);let d=null,u=0,f=0;t===Sn?l>0&&(d=Sn,u=l,f=i.length):t===Ja?c>0&&(d=Ja,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?Sn:Ja:null,f=d?d===Sn?i.length:o.length:0);const p=d===Sn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Sn}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function Cd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Ed(s)+Ed(e[n])))}function Ed(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function mo(e){return(e?e.ownerDocument:document).body.offsetHeight}function cy(e,t,s){const n=e[Ma];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Dl=Symbol("_vod"),rc=Symbol("_vsh"),Vp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Dl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ya(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ya(e,!0),n.enter(e)):n.leave(e,()=>{Ya(e,!1)}):Ya(e,t))},beforeUnmount(e,{value:t}){Ya(e,t)}};function Ya(e,t){e.style.display=t?e[Dl]:"none",e[rc]=!t}function dy(){Vp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const jp=Symbol("");function uy(e){const t=es();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Ml(i,a))},n=()=>{const a=e(t.proxy);t.ce?Ml(t.ce,a):vo(t.subTree,a),s(a)};Jo(()=>{ki(n)}),Ye(()=>{Xt(n,Bt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>a.disconnect())})}function vo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{vo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Ml(e.el,t);else if(e.type===Mt)e.children.forEach(s=>vo(s,t));else if(e.type===Jn){let{el:s,anchor:n}=e;for(;s&&(Ml(s,t),s!==n);)s=s.nextSibling}}function Ml(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=vm(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[jp]=n}}const fy=/(?:^|;)\s*display\s*:/;function py(e,t,s){const n=e.style,a=Pe(s);let i=!1;if(s&&!a){if(t)if(Pe(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ri(n,r,"")}else for(const l in t)s[l]==null&&ri(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?gy(e,l,!Pe(t)&&t?t[l]:void 0,r)||ri(n,l,r):ri(n,l,"")}}else if(a){if(t!==s){const l=n[jp];l&&(s+=";"+l),n.cssText=s,i=fy.test(s)}}else t&&e.removeAttribute("style");Dl in e&&(e[Dl]=i?n.display:"",e[rc]&&(n.display="none"))}const Ad=/\s*!important$/;function ri(e,t,s){if(ve(s))s.forEach(n=>ri(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=hy(e,t);Ad.test(s)?e.setProperty(os(n),s.replace(Ad,""),"important"):e[n]=s}}const Rd=["Webkit","Moz","ms"],Fr={};function hy(e,t){const s=Fr[t];if(s)return s;let n=lt(t);if(n!=="filter"&&n in e)return Fr[t]=n;n=ia(n);for(let a=0;a<Rd.length;a++){const i=Rd[a]+n;if(i in e)return Fr[t]=i}return t}function gy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Pe(n)&&s===n}const Id="http://www.w3.org/1999/xlink";function Od(e,t,s,n,a,i=gm(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Id,t.slice(6,t.length)):e.setAttributeNS(Id,t,s):s==null||i&&!rf(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Kt(s)?String(s):s)}function Ld(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Pp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=rf(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function cn(e,t,s,n){e.addEventListener(t,s,n)}function my(e,t,s,n){e.removeEventListener(t,s,n)}const Nd=Symbol("_vei");function vy(e,t,s,n,a=null){const i=e[Nd]||(e[Nd]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=by(t);if(n){const c=i[t]=_y(n,a);cn(e,r,c,o)}else l&&(my(e,r,l,o),i[t]=void 0)}}const Dd=/(?:Once|Passive|Capture)$/;function by(e){let t;if(Dd.test(e)){t={};let n;for(;n=e.match(Dd);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):os(e.slice(2)),t]}let $r=0;const yy=Promise.resolve(),xy=()=>$r||(yy.then(()=>$r=0),$r=Date.now());function _y(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ve(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&vs(c,t,5,r)}}else vs(a,t,5,[n])};return s.value=e,s.attached=xy(),s}const Md=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,zp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?cy(e,n,l):t==="style"?py(e,s,n):na(t)?Yl(t)||vy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):wy(e,t,n,l))?(Ld(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Od(e,t,n,l,i,t!=="value")):e._isVueCE&&(ky(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Pe(n)))?Ld(e,lt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Od(e,t,n,l))};function wy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Md(t)&&Re(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Md(t)&&Pe(s)?!1:t in e}function ky(e,t){const s=e._def.props;if(!s)return!1;const n=lt(t);return Array.isArray(s)?s.some(a=>lt(a)===n):Object.keys(s).some(a=>lt(a)===n)}const Pd={};function qp(e,t,s){let n=Vi(e,t);Ql(n)&&(n=ze({},n,t));class a extends gr{constructor(l){super(n,l,s)}}return a.def=n,a}const Sy=((e,t)=>qp(e,t,ah)),Ty=typeof HTMLElement<"u"?HTMLElement:class{};class gr extends Ty{constructor(t,s={},n=$l){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==$l?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(ze({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof gr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ot(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ve(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=_l(this._props[o])),(r||(r=Object.create(null)))[lt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>Gs(s[n])})}_resolveProps(t){const{props:s}=t,n=ve(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(lt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Pd;const a=lt(t);s&&this._numberProps&&this._numberProps[a]&&(n=_l(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Pd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(os(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(os(t),s+""):s||this.removeAttribute(os(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),nh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ft(this._def,ze(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Ql(l[0])?ze({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),os(i)!==i&&a(os(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Gp(e){const t=es(),s=t&&t.ce;return s||null}function Cy(){const e=Gp();return e&&e.shadowRoot}function Ey(e="$style"){{const t=es();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const Kp=new WeakMap,Wp=new WeakMap,Pl=Symbol("_moveCb"),Fd=Symbol("_enterCb"),Ay=e=>(delete e.props.mode,e),Ry=Ay({name:"TransitionGroup",props:ze({},Up,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=es(),n=Ko();let a,i;return ur(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Dy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Oy),a.forEach(Ly);const r=a.filter(Ny);mo(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Bs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Pl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Pl]=null,An(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Je(e),r=Bp(l);let o=l.tag||Mt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[rc]&&(a.push(d),yn(d,Na(d,r,n,s)),Kp.set(d,Zp(d.el)))}i=t.default?cr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&yn(d,Na(d,r,n,s))}return ft(o,null,i)}}}),Iy=Ry;function Oy(e){const t=e.el;t[Pl]&&t[Pl](),t[Fd]&&t[Fd]()}function Ly(e){Wp.set(e,Zp(e.el))}function Ny(e){const t=Kp.get(e),s=Wp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Zp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Dy(e,t,s){const n=e.cloneNode(),a=e[Ma];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Hp(n);return i.removeChild(n),l}const Pn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ve(t)?s=>Ta(t,s):t};function My(e){e.target.composing=!0}function $d(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Cs=Symbol("_assign");function Ud(e,t,s){return t&&(e=e.trim()),s&&(e=tr(e)),e}const Fl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Cs]=Pn(a);const i=n||a.props&&a.props.type==="number";cn(e,t?"change":"input",l=>{l.target.composing||e[Cs](Ud(e.value,s,i))}),(s||i)&&cn(e,"change",()=>{e.value=Ud(e.value,s,i)}),t||(cn(e,"compositionstart",My),cn(e,"compositionend",$d),cn(e,"change",$d))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Cs]=Pn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?tr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},oc={deep:!0,created(e,t,s){e[Cs]=Pn(s),cn(e,"change",()=>{const n=e._modelValue,a=Pa(e),i=e.checked,l=e[Cs];if(ve(n)){const r=nr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(aa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Yp(e,i))})},mounted:Bd,beforeUpdate(e,t,s){e[Cs]=Pn(s),Bd(e,t,s)}};function Bd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ve(t))a=nr(t,n.props.value)>-1;else if(aa(t))a=t.has(n.props.value);else{if(t===s)return;a=mn(t,Yp(e,!0))}e.checked!==a&&(e.checked=a)}const cc={created(e,{value:t},s){e.checked=mn(t,s.props.value),e[Cs]=Pn(s),cn(e,"change",()=>{e[Cs](Pa(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Cs]=Pn(n),t!==s&&(e.checked=mn(t,n.props.value))}},Jp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=aa(t);cn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?tr(Pa(l)):Pa(l));e[Cs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ot(()=>{e._assigning=!1})}),e[Cs]=Pn(n)},mounted(e,{value:t}){Hd(e,t)},beforeUpdate(e,t,s){e[Cs]=Pn(s)},updated(e,{value:t}){e._assigning||Hd(e,t)}};function Hd(e,t){const s=e.multiple,n=ve(t);if(!(s&&!n&&!aa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Pa(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=nr(t,r)>-1}else l.selected=t.has(r);else if(mn(Pa(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Pa(e){return"_value"in e?e._value:e.value}function Yp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Qp={created(e,t,s){rl(e,t,s,null,"created")},mounted(e,t,s){rl(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){rl(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){rl(e,t,s,n,"updated")}};function Xp(e,t){switch(e){case"SELECT":return Jp;case"TEXTAREA":return Fl;default:switch(t){case"checkbox":return oc;case"radio":return cc;default:return Fl}}}function rl(e,t,s,n,a){const l=Xp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Py(){Fl.getSSRProps=({value:e})=>({value:e}),cc.getSSRProps=({value:e},t)=>{if(t.props&&mn(t.props.value,e))return{checked:!0}},oc.getSSRProps=({value:e},t)=>{if(ve(e)){if(t.props&&nr(e,t.props.value)>-1)return{checked:!0}}else if(aa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Qp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Xp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Fy=["ctrl","shift","alt","meta"],$y={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Fy.some(s=>e[`${s}Key`]&&!t.includes(s))},Uy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=$y[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},By={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Hy=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=os(a.key);if(t.some(l=>l===i||By[l]===i))return e(a)}))},eh=ze({patchProp:zp},Fp);let hi,Vd=!1;function th(){return hi||(hi=hp(eh))}function sh(){return hi=Vd?hi:gp(eh),Vd=!0,hi}const nh=((...e)=>{th().render(...e)}),Vy=((...e)=>{sh().hydrate(...e)}),$l=((...e)=>{const t=th().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=lh(n);if(!a)return;const i=t._component;!Re(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,ih(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),ah=((...e)=>{const t=sh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=lh(n);if(a)return s(a,!0,ih(a))},t});function ih(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function lh(e){return Pe(e)?document.querySelector(e):e}let jd=!1;const jy=()=>{jd||(jd=!0,Py(),dy())},zy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:qf,BaseTransitionPropsValidators:Wo,Comment:xt,DeprecationTypes:sy,EffectScope:$o,ErrorCodes:iv,ErrorTypeStrings:Zb,Fragment:Mt,KeepAlive:$v,ReactiveEffect:xi,Static:Jn,Suspense:Ib,Teleport:xv,Text:Dn,TrackOpTypes:Qm,Transition:ly,TransitionGroup:Iy,TriggerOpTypes:Xm,VueElement:gr,assertNumber:av,callWithAsyncErrorHandling:vs,callWithErrorHandling:qa,camelize:lt,capitalize:ia,cloneVNode:Ws,compatUtils:ty,computed:te,createApp:$l,createBlock:Ol,createCommentVNode:Cp,createElementBlock:Pb,createElementVNode:ac,createHydrationRenderer:gp,createPropsRestProxy:lb,createRenderer:hp,createSSRApp:ah,createSlots:qv,createStaticVNode:Ub,createTextVNode:ic,createVNode:ft,customRef:Rf,defineAsyncComponent:Pv,defineComponent:Vi,defineCustomElement:qp,defineEmits:Jv,defineExpose:Yv,defineModel:eb,defineOptions:Qv,defineProps:Zv,defineSSRCustomElement:Sy,defineSlots:Xv,devtools:Jb,effect:_m,effectScope:bm,getCurrentInstance:es,getCurrentScope:uf,getCurrentWatcher:ev,getTransitionRawChildren:cr,guardReactiveProps:Tp,h:Da,handleError:la,hasInjectionContext:pv,hydrate:Vy,hydrateOnIdle:Iv,hydrateOnInteraction:Dv,hydrateOnMediaQuery:Nv,hydrateOnVisible:Lv,initCustomFormatter:Gb,initDirectivesForSSR:jy,inject:Ts,isMemoSame:Dp,isProxy:Bi,isReactive:pn,isReadonly:Ks,isRef:Tt,isRuntimeOnly:jb,isShallow:ds,isVNode:xn,markRaw:Ef,mergeDefaults:ab,mergeModels:ib,mergeProps:Ep,nextTick:Ot,nodeOps:Fp,normalizeClass:Ui,normalizeProps:im,normalizeStyle:$i,onActivated:As,onBeforeMount:Wf,onBeforeUnmount:fr,onBeforeUpdate:Jo,onDeactivated:Rs,onErrorCaptured:Qf,onMounted:Ye,onRenderTracked:Yf,onRenderTriggered:Jf,onScopeDispose:ym,onServerPrefetch:Zf,onUnmounted:_t,onUpdated:ur,onWatcherCleanup:Of,openBlock:Ai,patchProp:zp,popScopeId:dv,provide:ui,proxyRefs:zo,pushScopeId:cv,queuePostFlushCb:ki,reactive:Fn,readonly:kl,ref:h,registerRuntimeCompiler:Op,render:nh,renderList:zv,renderSlot:Gv,resolveComponent:Hv,resolveDirective:jv,resolveDynamicComponent:Vv,resolveFilter:ey,resolveTransitionHooks:Na,setBlockTracking:Ri,setDevtoolsHook:Yb,setTransitionHooks:yn,shallowReactive:Vo,shallowReadonly:Bm,shallowRef:jo,ssrContextKey:Ff,ssrUtils:Xb,stop:wm,toDisplayString:cf,toHandlerKey:Sa,toHandlers:Kv,toRaw:Je,toRef:Zm,toRefs:Gm,toValue:jm,transformVNodeArgs:Fb,triggerRef:Vm,unref:Gs,useAttrs:nb,useCssModule:Ey,useCssVars:uy,useHost:Gp,useId:wv,useModel:gb,useSSRContext:$f,useShadowRoot:Cy,useSlots:sb,useTemplateRef:kv,useTransitionState:Ko,vModelCheckbox:oc,vModelDynamic:Qp,vModelRadio:cc,vModelSelect:Jp,vModelText:Fl,vShow:Vp,version:Mp,warn:Wb,watch:Xt,watchEffect:hv,watchPostEffect:gv,watchSyncEffect:Uf,withAsyncContext:rb,withCtx:Go,withDefaults:tb,withDirectives:fv,withKeys:Hy,withMemo:Kb,withModifiers:Uy,withScopeId:uv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Oi=Symbol(""),gi=Symbol(""),dc=Symbol(""),Ul=Symbol(""),rh=Symbol(""),ta=Symbol(""),oh=Symbol(""),ch=Symbol(""),uc=Symbol(""),fc=Symbol(""),qi=Symbol(""),pc=Symbol(""),dh=Symbol(""),hc=Symbol(""),gc=Symbol(""),mc=Symbol(""),vc=Symbol(""),bc=Symbol(""),yc=Symbol(""),uh=Symbol(""),fh=Symbol(""),mr=Symbol(""),Bl=Symbol(""),xc=Symbol(""),_c=Symbol(""),Li=Symbol(""),Gi=Symbol(""),wc=Symbol(""),bo=Symbol(""),qy=Symbol(""),yo=Symbol(""),Hl=Symbol(""),Gy=Symbol(""),Ky=Symbol(""),kc=Symbol(""),Wy=Symbol(""),Zy=Symbol(""),Sc=Symbol(""),ph=Symbol(""),Fa={[Oi]:"Fragment",[gi]:"Teleport",[dc]:"Suspense",[Ul]:"KeepAlive",[rh]:"BaseTransition",[ta]:"openBlock",[oh]:"createBlock",[ch]:"createElementBlock",[uc]:"createVNode",[fc]:"createElementVNode",[qi]:"createCommentVNode",[pc]:"createTextVNode",[dh]:"createStaticVNode",[hc]:"resolveComponent",[gc]:"resolveDynamicComponent",[mc]:"resolveDirective",[vc]:"resolveFilter",[bc]:"withDirectives",[yc]:"renderList",[uh]:"renderSlot",[fh]:"createSlots",[mr]:"toDisplayString",[Bl]:"mergeProps",[xc]:"normalizeClass",[_c]:"normalizeStyle",[Li]:"normalizeProps",[Gi]:"guardReactiveProps",[wc]:"toHandlers",[bo]:"camelize",[qy]:"capitalize",[yo]:"toHandlerKey",[Hl]:"setBlockTracking",[Gy]:"pushScopeId",[Ky]:"popScopeId",[kc]:"withCtx",[Wy]:"unref",[Zy]:"isRef",[Sc]:"withMemo",[ph]:"isMemoSame"};function Jy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Fa[t]=e[t]})}const xs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Yy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:xs}}function Ni(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=xs){return e&&(r?(e.helper(ta),e.helper(Ba(e.inSSR,c))):e.helper(Ua(e.inSSR,c)),l&&e.helper(bc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function Yn(e,t=xs){return{type:17,loc:t,elements:e}}function Ss(e,t=xs){return{type:15,loc:t,properties:e}}function St(e,t){return{type:16,loc:xs,key:Pe(e)?Ue(e,!0):e,value:t}}function Ue(e,t=!1,s=xs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ns(e,t=xs){return{type:8,loc:t,children:e}}function Lt(e,t=[],s=xs){return{type:14,loc:s,callee:e,arguments:t}}function $a(e,t=void 0,s=!1,n=!1,a=xs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function xo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:xs}}function Qy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:xs}}function Xy(e){return{type:21,body:e,loc:xs}}function Ua(e,t){return e||t?uc:fc}function Ba(e,t){return e||t?oh:ch}function Tc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ua(n,e.isComponent)),t(ta),t(Ba(n,e.isComponent)))}const zd=new Uint8Array([123,123]),qd=new Uint8Array([125,125]);function Gd(e){return e>=97&&e<=122||e>=65&&e<=90}function gs(e){return e===32||e===10||e===9||e===12||e===13}function Tn(e){return e===47||e===62||gs(e)}function Vl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ht={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class ex{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=zd,this.delimiterClose=qd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=zd,this.delimiterClose=qd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Tn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||gs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ht.TitleEnd||this.currentSequence===Ht.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ht.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ht.Cdata.length&&(this.state=28,this.currentSequence=Ht.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ht.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Gd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Tn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Tn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Vl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){gs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Gd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||gs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):gs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):gs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Tn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Tn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Tn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Tn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Tn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):gs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):gs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){gs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ht.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ht.ScriptEnd[3]?this.startSpecial(Ht.ScriptEnd,4):t===Ht.StyleEnd[3]?this.startSpecial(Ht.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ht.TitleEnd[3]?this.startSpecial(Ht.TitleEnd,4):t===Ht.TextareaEnd[3]?this.startSpecial(Ht.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ht.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Kd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Qn(e,t){const s=Kd("MODE",t),n=Kd(e,t);return s===3?n===!0:n!==!1}function Di(e,t,s,...n){return Qn(e,t)}function Cc(e){throw e}function hh(e){}function ut(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const cs=e=>e.type===4&&e.isStatic;function gh(e){switch(e){case"Teleport":case"teleport":return gi;case"Suspense":case"suspense":return dc;case"KeepAlive":case"keep-alive":return Ul;case"BaseTransition":case"base-transition":return rh}}const tx=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Ec=e=>!tx.test(e),mh=/[A-Za-z_$\xA0-\uFFFF]/,sx=/[\.\?\w$\xA0-\uFFFF]/,nx=/\s+[.[]\s*|\s*[.[]\s+/g,vh=e=>e.type===4?e.content:e.loc.source,ax=e=>{const t=vh(e).trim().replace(nx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?mh:sx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},bh=ax,ix=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,lx=e=>ix.test(vh(e)),rx=lx;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Pe(t)?a.name===t:t.test(a.name)))return a}}function vr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&qn(i.arg,t))return i}}function qn(e,t){return!!(e&&cs(e)&&e.content===t)}function ox(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Ur(e){return e.type===5||e.type===2}function Wd(e){return e.type===7&&e.name==="pre"}function cx(e){return e.type===7&&e.name==="slot"}function jl(e){return e.type===1&&e.tagType===3}function zl(e){return e.type===1&&e.tagType===2}const dx=new Set([Li,Gi]);function yh(e,t=[]){if(e&&!Pe(e)&&e.type===14){const s=e.callee;if(!Pe(s)&&dx.has(s))return yh(e.arguments[0],t.concat(e))}return[e,t]}function ql(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Pe(a)&&a.type===14){const r=yh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Pe(a))n=Ss([t]);else if(a.type===14){const r=a.arguments[0];!Pe(r)&&r.type===15?Zd(t,r)||r.properties.unshift(t):a.callee===wc?n=Lt(s.helper(Bl),[Ss([t]),a]):a.arguments.unshift(Ss([t])),!n&&(n=a)}else a.type===15?(Zd(t,a)||a.properties.unshift(t),n=a):(n=Lt(s.helper(Bl),[Ss([t]),a]),l&&l.callee===Gi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Zd(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Mi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function ux(e){return e.type===14&&e.callee===Sc?e.arguments[1].returns:e}const fx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function xh(e){for(let t=0;t<e.length;t++)if(!gs(e.charCodeAt(t)))return!1;return!0}function Ac(e){return e.type===2&&xh(e.content)||e.type===12&&Ac(e.content)}function _h(e){return e.type===3||Ac(e)}const wh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:xa,isPreTag:xa,isIgnoreNewlineTag:xa,isCustomElement:xa,onError:Cc,onWarn:hh,comments:!1,prefixIdentifiers:!1};let Qe=wh,Pi=null,gn="",jt=null,We=null,as="",sn=-1,jn=-1,Rc=0,Ln=!1,_o=null;const dt=[],vt=new ex(dt,{onerr:Xs,ontext(e,t){ol(Ft(e,t),e,t)},ontextentity(e,t,s){ol(e,t,s)},oninterpolation(e,t){if(Ln)return ol(Ft(e,t),e,t);let s=e+vt.delimiterOpen.length,n=t-vt.delimiterClose.length;for(;gs(gn.charCodeAt(s));)s++;for(;gs(gn.charCodeAt(n-1));)n--;let a=Ft(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),wo({type:5,content:vl(a,!1,yt(s,n)),loc:yt(e,t)})},onopentagname(e,t){const s=Ft(e,t);jt={type:1,tag:s,ns:Qe.getNamespace(s,dt[0],Qe.ns),tagType:0,props:[],children:[],loc:yt(e-1,t),codegenNode:void 0}},onopentagend(e){Yd(e)},onclosetag(e,t){const s=Ft(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<dt.length;a++)if(dt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Xs(24,dt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=dt.shift();ml(r,t,l<a)}break}n||Xs(23,kh(e,60))}},onselfclosingtag(e){const t=jt.tag;jt.isSelfClosing=!0,Yd(e),dt[0]&&dt[0].tag===t&&ml(dt.shift(),e)},onattribname(e,t){We={type:6,name:Ft(e,t),nameLoc:yt(e,t),value:void 0,loc:yt(e)}},ondirname(e,t){const s=Ft(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ln&&n===""&&Xs(26,e),Ln||n==="")We={type:6,name:s,nameLoc:yt(e,t),value:void 0,loc:yt(e)};else if(We={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ue("prop")]:[],loc:yt(e)},n==="pre"){Ln=vt.inVPre=!0,_o=jt;const a=jt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=wx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ft(e,t);if(Ln&&!Wd(We))We.name+=s,Gn(We.nameLoc,t);else{const n=s[0]!=="[";We.arg=vl(n?s:s.slice(1,-1),n,yt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ft(e,t);if(Ln&&!Wd(We))We.name+="."+s,Gn(We.nameLoc,t);else if(We.name==="slot"){const n=We.arg;n&&(n.content+="."+s,Gn(n.loc,t))}else{const n=Ue(s,!0,yt(e,t));We.modifiers.push(n)}},onattribdata(e,t){as+=Ft(e,t),sn<0&&(sn=e),jn=t},onattribentity(e,t,s){as+=e,sn<0&&(sn=t),jn=s},onattribnameend(e){const t=We.loc.start.offset,s=Ft(t,e);We.type===7&&(We.rawName=s),jt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Xs(2,t)},onattribend(e,t){if(jt&&We){if(Gn(We.loc,t),e!==0)if(as.includes("&")&&(as=Qe.decodeEntities(as,!0)),We.type===6)We.name==="class"&&(as=Th(as).trim()),e===1&&!as&&Xs(13,t),We.value={type:2,content:as,loc:e===1?yt(sn,jn):yt(sn-1,jn+1)},vt.inSFCRoot&&jt.tag==="template"&&We.name==="lang"&&as&&as!=="html"&&vt.enterRCDATA(Vl("</template"),0);else{let s=0;We.exp=vl(as,!1,yt(sn,jn),0,s),We.name==="for"&&(We.forParseResult=hx(We.exp));let n=-1;We.name==="bind"&&(n=We.modifiers.findIndex(a=>a.content==="sync"))>-1&&Di("COMPILER_V_BIND_SYNC",Qe,We.loc,We.arg.loc.source)&&(We.name="model",We.modifiers.splice(n,1))}(We.type!==7||We.name!=="pre")&&jt.props.push(We)}as="",sn=jn=-1},oncomment(e,t){Qe.comments&&wo({type:3,content:Ft(e,t),loc:yt(e-4,t+3)})},onend(){const e=gn.length;for(let t=0;t<dt.length;t++)ml(dt[t],e-1),Xs(24,dt[t].loc.start.offset)},oncdata(e,t){(dt[0]?dt[0].ns:Qe.ns)!==0?ol(Ft(e,t),e,t):Xs(1,e-9)},onprocessinginstruction(e){(dt[0]?dt[0].ns:Qe.ns)===0&&Xs(21,e-1)}}),Jd=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,px=/^\(|\)$/g;function hx(e){const t=e.loc,s=e.content,n=s.match(fx);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const g=t.start.offset+f,y=g+u.length;return vl(u,!1,yt(g,y),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(px,"").trim();const c=a.indexOf(o),d=o.match(Jd);if(d){o=o.replace(Jd,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ft(e,t){return gn.slice(e,t)}function Yd(e){vt.inSFCRoot&&(jt.innerLoc=yt(e+1,e+1)),wo(jt);const{tag:t,ns:s}=jt;s===0&&Qe.isPreTag(t)&&Rc++,Qe.isVoidTag(t)?ml(jt,e):(dt.unshift(jt),(s===1||s===2)&&(vt.inXML=!0)),jt=null}function ol(e,t,s){{const i=dt[0]&&dt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=dt[0]||Pi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Gn(a.loc,s)):n.children.push({type:2,content:e,loc:yt(t,s)})}function ml(e,t,s=!1){s?Gn(e.loc,kh(t,60)):Gn(e.loc,gx(t,62)+1),vt.inSFCRoot&&(e.children.length?e.innerLoc.end=ze({},e.children[e.children.length-1].loc.end):e.innerLoc.end=ze({},e.innerLoc.start),e.innerLoc.source=Ft(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Ln||(n==="slot"?e.tagType=2:Qd(e)?e.tagType=3:vx(e)&&(e.tagType=1)),vt.inRCDATA||(e.children=Sh(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Rc--,_o===e&&(Ln=vt.inVPre=!1,_o=null),vt.inXML&&(dt[0]?dt[0].ns:Qe.ns)===0&&(vt.inXML=!1);{const l=e.props;if(!vt.inSFCRoot&&Qn("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!Qd(e)){const o=dt[0]||Pi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Di("COMPILER_INLINE_TEMPLATE",Qe,r.loc)&&e.children.length&&(r.value={type:2,content:Ft(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function gx(e,t){let s=e;for(;gn.charCodeAt(s)!==t&&s<gn.length-1;)s++;return s}function kh(e,t){let s=e;for(;gn.charCodeAt(s)!==t&&s>=0;)s--;return s}const mx=new Set(["if","else","else-if","for","slot"]);function Qd({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&mx.has(t[s].name))return!0}return!1}function vx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||bx(e.charCodeAt(0))||gh(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Di("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&qn(n.arg,"is")&&Di("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function bx(e){return e>64&&e<91}const yx=/\r\n/g;function Sh(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Rc)a.content=a.content.replace(yx,`
`);else if(xh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&xx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Th(a.content))}return s?e.filter(Boolean):e}function xx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Th(e){let t="",s=!1;for(let n=0;n<e.length;n++)gs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function wo(e){(dt[0]||Pi).children.push(e)}function yt(e,t){return{start:vt.getPos(e),end:t==null?t:vt.getPos(t),source:t==null?t:Ft(e,t)}}function _x(e){return yt(e.start.offset,e.end.offset)}function Gn(e,t){e.end=vt.getPos(t),e.source=Ft(e.start.offset,t)}function wx(e){const t={type:6,name:e.rawName,nameLoc:yt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function vl(e,t=!1,s,n=0,a=0){return Ue(e,t,s,n)}function Xs(e,t,s){Qe.onError(ut(e,yt(t,t)))}function kx(){vt.reset(),jt=null,We=null,as="",sn=-1,jn=-1,dt.length=0}function Sx(e,t){if(kx(),gn=e,Qe=ze({},wh),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}vt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,vt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(vt.delimiterOpen=Vl(s[0]),vt.delimiterClose=Vl(s[1]));const n=Pi=Yy([],e);return vt.parse(gn),n.loc=yt(0,e.length),n.children=Sh(n.children),Pi=null,n}function Tx(e,t){bl(e,void 0,t,!!Ch(e))}function Ch(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!zl(t[0])?t[0]:null}function bl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:ms(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const g=p.patchFlag;if((g===void 0||g===512||g===1)&&Ah(u,s)>=2){const y=Rh(u);y&&(p.props=s.hoist(y))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:ms(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,bl(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)bl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)bl(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ve(e.codegenNode.children))e.codegenNode.children=o(Yn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ve(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(Yn(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ve(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(Yn(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!ve(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ms(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Ah(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ms(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ms(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ta),t.removeHelper(Ba(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ua(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ms(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Pe(r)||Kt(r))continue;const o=ms(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Cx=new Set([xc,_c,Li,Gi]);function Eh(e,t){if(e.type===14&&!Pe(e.callee)&&Cx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ms(s,t);if(s.type===14)return Eh(s,t)}return 0}function Ah(e,t){let s=3;const n=Rh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ms(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ms(r,t):r.type===14?c=Eh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Rh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Ex(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Bt,isCustomElement:d=Bt,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:g=!1,inSSR:y=!1,ssrCssVars:k="",bindingMetadata:E=Ge,inline:v=!1,isTS:m=!1,onError:x=Cc,onWarn:w=hh,compatConfig:_}){const R=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:R&&ia(lt(R[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:g,inSSR:y,ssrCssVars:k,bindingMetadata:E,inline:v,isTS:m,onError:x,onWarn:w,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const L=T.helpers.get(C)||0;return T.helpers.set(C,L+1),C},removeHelper(C){const L=T.helpers.get(C);if(L){const H=L-1;H?T.helpers.set(C,H):T.helpers.delete(C)}},helperString(C){return`_${Fa[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const L=T.parent.children,H=C?L.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>H&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(H,1)},onNodeRemoved:Bt,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Pe(C)&&(C=Ue(C)),T.hoists.push(C);const L=Ue(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return L.hoisted=C,L},cache(C,L=!1,H=!1){const M=Qy(T.cached.length,C,L,H);return T.cached.push(M),M}};return T.filters=new Set,T}function Ax(e,t){const s=Ex(e,t);br(e,s),t.hoistStatic&&Tx(e,s),t.ssr||Rx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Rx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Ch(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Tc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ni(t,s(Oi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Ix(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Pe(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,br(a,t))}}function br(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ve(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(qi);break;case 5:t.ssr||t.helper(mr);break;case 9:for(let i=0;i<e.branches.length;i++)br(e.branches[i],t);break;case 10:case 11:case 1:case 0:Ix(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Ih(e,t){const s=Pe(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(cx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const yr="/*@__PURE__*/",Oh=e=>`${Fa[e]}: _${Fa[e]}`;function Ox(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(y){return`_${Fa[y]}`},push(y,k=-2,E){p.code+=y},indent(){g(++p.indentLevel)},deindent(y=!1){y?--p.indentLevel:g(--p.indentLevel)},newline(){g(p.indentLevel)}};function g(y){p.push(`
`+"  ".repeat(y),0)}return p}function Lx(e,t={}){const s=Ox(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";Nx(e,s);const y=d?"ssrRender":"render",E=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${y}(${E}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(Oh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Br(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Br(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Br(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let v=0;v<e.temps;v++)a(`${v>0?", ":""}_temp${v}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Gt(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Nx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[uc,fc,qi,pc,dh].filter(f=>d.includes(f)).map(Oh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Dx(e.hoists,t),i(),a("return ")}function Br(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?vc:t==="component"?hc:mc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Mi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Dx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Gt(i,t),n())}t.pure=!1}function Ic(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ki(e,t,s),s&&t.deindent(),t.push("]")}function Ki(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Pe(r)?a(r,-3):ve(r)?Ic(r,t):Gt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Gt(e,t){if(Pe(e)){t.push(e,-3);return}if(Kt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Gt(e.codegenNode,t);break;case 2:Mx(e,t);break;case 4:Lh(e,t);break;case 5:Px(e,t);break;case 12:Gt(e.codegenNode,t);break;case 8:Nh(e,t);break;case 3:$x(e,t);break;case 13:Ux(e,t);break;case 14:Hx(e,t);break;case 15:Vx(e,t);break;case 17:jx(e,t);break;case 18:zx(e,t);break;case 19:qx(e,t);break;case 20:Gx(e,t);break;case 21:Ki(e.body,t,!0,!1);break}}function Mx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Lh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Px(e,t){const{push:s,helper:n,pure:a}=t;a&&s(yr),s(`${n(mr)}(`),Gt(e.content,t),s(")")}function Nh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Pe(n)?t.push(n,-3):Gt(n,t)}}function Fx(e,t){const{push:s}=t;if(e.type===8)s("["),Nh(e,t),s("]");else if(e.isStatic){const n=Ec(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function $x(e,t){const{push:s,helper:n,pure:a}=t;a&&s(yr),s(`${n(qi)}(${JSON.stringify(e.content)})`,-3,e)}function Ux(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let g;o&&(g=String(o)),d&&s(n(bc)+"("),u&&s(`(${n(ta)}(${f?"true":""}), `),a&&s(yr);const y=u?Ba(t.inSSR,p):Ua(t.inSSR,p);s(n(y)+"(",-2,e),Ki(Bx([i,l,r,g,c]),t),s(")"),u&&s(")"),d&&(s(", "),Gt(d,t),s(")"))}function Bx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Hx(e,t){const{push:s,helper:n,pure:a}=t,i=Pe(e.callee)?e.callee:n(e.callee);a&&s(yr),s(i+"(",-2,e),Ki(e.arguments,t),s(")")}function Vx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Fx(c,t),s(": "),Gt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function jx(e,t){Ic(e.elements,t)}function zx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Fa[kc]}(`),s("(",-2,e),ve(i)?Ki(i,t):i&&Gt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ve(l)?Ic(l,t):Gt(l,t)):r&&Gt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function qx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Ec(s.content);u&&l("("),Lh(s,t),u&&l(")")}else l("("),Gt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Gt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Gt(a,t),d||t.indentLevel--,i&&o(!0)}function Gx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Hl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Gt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Hl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Kx=Ih(/^(?:if|else|else-if)$/,(e,t,s)=>Wx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=eu(a,o,s);else{const c=Zx(n.codegenNode);c.alternate=eu(a,o+n.branches.length-1,s)}}}));function Wx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ut(28,t.loc)),t.exp=Ue("true",!1,a)}if(t.name==="if"){const a=Xd(e,t),i={type:9,loc:_x(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&_h(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ut(30,e.loc)),s.removeNode();const r=Xd(e,t);l.branches.push(r);const o=n&&n(l,r,!1);br(r,s),o&&o(),s.currentNode=null}else s.onError(ut(30,e.loc));break}}}function Xd(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:vr(e,"key"),isTemplateIf:s}}function eu(e,t,s){return e.condition?xo(e.condition,tu(e,t,s),Lt(s.helper(qi),['""',"true"])):tu(e,t,s)}function tu(e,t,s){const{helper:n}=s,a=St("key",Ue(`${t}`,!1,xs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return ql(o,a,s),o}else return Ni(s,n(Oi),Ss([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=ux(o);return c.type===13&&Tc(c,s),ql(c,a,s),o}}function Zx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Jx=Ih("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Yx(e,t,s,i=>{const l=Lt(n(yc),[i.source]),r=jl(e),o=ks(e,"memo"),c=vr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ue(c.value.content,!0):void 0:c.exp);const u=d?St("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Ni(s,n(Oi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let g;const{children:y}=i,k=y.length!==1||y[0].type!==1,E=zl(e)?e:r&&e.children.length===1&&zl(e.children[0])?e.children[0]:null;if(E?(g=E.codegenNode,r&&u&&ql(g,u,s)):k?g=Ni(s,n(Oi),u?Ss([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(g=y[0].codegenNode,r&&u&&ql(g,u,s),g.isBlock!==!f&&(g.isBlock?(a(ta),a(Ba(s.inSSR,g.isComponent))):a(Ua(s.inSSR,g.isComponent))),g.isBlock=!f,g.isBlock?(n(ta),n(Ba(s.inSSR,g.isComponent))):n(Ua(s.inSSR,g.isComponent))),o){const v=$a(ko(i.parseResult,[Ue("_cached")]));v.body=Xy([Ns(["const _memo = (",o.exp,")"]),Ns(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(ph)}(_cached, _memo)) return _cached`]),Ns(["const _item = ",g]),Ue("_item.memo = _memo"),Ue("return _item")]),l.arguments.push(v,Ue("_cache"),Ue(String(s.cached.length))),s.cached.push(null)}else l.arguments.push($a(ko(i.parseResult),g,!0))}})});function Yx(e,t,s,n){if(!t.exp){s.onError(ut(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ut(32,t.loc));return}Dh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:jl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Dh(e,t){e.finalized||(e.finalized=!0)}function ko({value:e,key:t,index:s},n=[]){return Qx([e,t,s,...n])}function Qx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ue("_".repeat(n+1),!1))}const su=Ue("undefined",!1),Xx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},e0=(e,t,s,n)=>$a(e,s,!1,!0,s.length?s[0].loc:n);function t0(e,t,s=e0){t.helper(kc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:k,exp:E}=o;k&&!cs(k)&&(r=!0),i.push(St(k||Ue("default",!0),s(E,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let k=0;k<n.length;k++){const E=n[k];let v;if(!jl(E)||!(v=ks(E,"slot",!0))){E.type!==3&&u.push(E);continue}if(o){t.onError(ut(37,v.loc));break}c=!0;const{children:m,loc:x}=E,{arg:w=Ue("default",!0),exp:_,loc:R}=v;let T;cs(w)?T=w?w.content:"default":r=!0;const C=ks(E,"for"),L=s(_,C,m,x);let H,M;if(H=ks(E,"if"))r=!0,l.push(xo(H.exp,cl(w,L,p++),su));else if(M=ks(E,/^else(?:-if)?$/,!0)){let N=k,Z;for(;N--&&(Z=n[N],!!_h(Z)););if(Z&&jl(Z)&&ks(Z,/^(?:else-)?if$/)){let ne=l[l.length-1];for(;ne.alternate.type===19;)ne=ne.alternate;ne.alternate=M.exp?xo(M.exp,cl(w,L,p++),su):cl(w,L,p++)}else t.onError(ut(30,M.loc))}else if(C){r=!0;const N=C.forParseResult;N?(Dh(N),l.push(Lt(t.helper(yc),[N.source,$a(ko(N),cl(w,L),!0)]))):t.onError(ut(32,C.loc))}else{if(T){if(f.has(T)){t.onError(ut(38,R));continue}f.add(T),T==="default"&&(d=!0)}i.push(St(w,L))}}if(!o){const k=(E,v)=>{const m=s(E,void 0,v,a);return t.compatConfig&&(m.isNonScopedSlot=!0),St("default",m)};c?u.length&&!u.every(Ac)&&(d?t.onError(ut(39,u[0].loc)):i.push(k(void 0,u))):i.push(k(void 0,n))}const g=r?2:yl(e.children)?3:1;let y=Ss(i.concat(St("_",Ue(g+"",!1))),a);return l.length&&(y=Lt(t.helper(fh),[y,Yn(l)])),{slots:y,hasDynamicSlots:r}}function cl(e,t,s){const n=[St("name",e),St("fn",t)];return s!=null&&n.push(St("key",Ue(String(s),!0))),Ss(n)}function yl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||yl(s.children))return!0;break;case 9:if(yl(s.branches))return!0;break;case 10:case 11:if(yl(s.children))return!0;break}}return!1}const Mh=new WeakMap,s0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?n0(e,t):`"${n}"`;const r=Xe(l)&&l.callee===gc;let o,c,d=0,u,f,p,g=r||l===gi||l===dc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=Ph(e,t,void 0,i,r);o=y.props,d=y.patchFlag,f=y.dynamicPropNames;const k=y.directives;p=k&&k.length?Yn(k.map(E=>i0(E,t))):void 0,y.shouldUseBlock&&(g=!0)}if(e.children.length>0)if(l===Ul&&(g=!0,d|=1024),i&&l!==gi&&l!==Ul){const{slots:k,hasDynamicSlots:E}=t0(e,t);c=k,E&&(d|=1024)}else if(e.children.length===1&&l!==gi){const k=e.children[0],E=k.type,v=E===5||E===8;v&&ms(k,t)===0&&(d|=1),v||E===2?c=k:c=e.children}else c=e.children;f&&f.length&&(u=l0(f)),e.codegenNode=Ni(t,l,o,c,d===0?void 0:d,u,p,!!g,!1,i,e.loc)};function n0(e,t,s=!1){let{tag:n}=e;const a=So(n),i=vr(e,"is",!1,!0);if(i)if(a||Qn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ue(i.value.content,!0):(r=i.exp,r||(r=Ue("is",!1,i.arg.loc))),r)return Lt(t.helper(gc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=gh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(hc),t.components.add(n),Mi(n,"component"))}function Ph(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,g=0,y=!1,k=!1,E=!1,v=!1,m=!1,x=!1;const w=[],_=L=>{c.length&&(d.push(Ss(nu(c),r)),c=[]),L&&d.push(L)},R=()=>{t.scopes.vFor>0&&c.push(St(Ue("ref_for",!0),Ue("true")))},T=({key:L,value:H})=>{if(cs(L)){const M=L.content,N=na(M);if(N&&(!n||a)&&M.toLowerCase()!=="onclick"&&M!=="onUpdate:modelValue"&&!fn(M)&&(v=!0),N&&fn(M)&&(x=!0),N&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ms(H,t)>0)return;M==="ref"?y=!0:M==="class"?k=!0:M==="style"?E=!0:M!=="key"&&!w.includes(M)&&w.push(M),n&&(M==="class"||M==="style")&&!w.includes(M)&&w.push(M)}else m=!0};for(let L=0;L<s.length;L++){const H=s[L];if(H.type===6){const{loc:M,name:N,nameLoc:Z,value:ne}=H;let F=!0;if(N==="ref"&&(y=!0,R()),N==="is"&&(So(l)||ne&&ne.content.startsWith("vue:")||Qn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(St(Ue(N,!0,Z),Ue(ne?ne.content:"",F,ne?ne.loc:M)))}else{const{name:M,arg:N,exp:Z,loc:ne,modifiers:F}=H,O=M==="bind",A=M==="on";if(M==="slot"){n||t.onError(ut(40,ne));continue}if(M==="once"||M==="memo"||M==="is"||O&&qn(N,"is")&&(So(l)||Qn("COMPILER_IS_ON_ELEMENT",t))||A&&i)continue;if((O&&qn(N,"key")||A&&f&&qn(N,"vue:before-update"))&&(p=!0),O&&qn(N,"ref")&&R(),!N&&(O||A)){if(m=!0,Z)if(O){if(_(),Qn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Z);continue}R(),_(),d.push(Z)}else _({type:14,loc:ne,callee:t.helper(wc),arguments:n?[Z]:[Z,"true"]});else t.onError(ut(O?34:35,ne));continue}O&&F.some(K=>K.content==="prop")&&(g|=32);const q=t.directiveTransforms[M];if(q){const{props:K,needRuntime:ee}=q(H,e,t);!i&&K.forEach(T),A&&N&&!cs(N)?_(Ss(K,r)):c.push(...K),ee&&(u.push(H),Kt(ee)&&Mh.set(H,ee))}else Jg(M)||(u.push(H),f&&(p=!0))}}let C;if(d.length?(_(),d.length>1?C=Lt(t.helper(Bl),d,r):C=d[0]):c.length&&(C=Ss(nu(c),r)),m?g|=16:(k&&!n&&(g|=2),E&&!n&&(g|=4),w.length&&(g|=8),v&&(g|=32)),!p&&(g===0||g===32)&&(y||x||u.length>0)&&(g|=512),!t.inSSR&&C)switch(C.type){case 15:let L=-1,H=-1,M=!1;for(let ne=0;ne<C.properties.length;ne++){const F=C.properties[ne].key;cs(F)?F.content==="class"?L=ne:F.content==="style"&&(H=ne):F.isHandlerKey||(M=!0)}const N=C.properties[L],Z=C.properties[H];M?C=Lt(t.helper(Li),[C]):(N&&!cs(N.value)&&(N.value=Lt(t.helper(xc),[N.value])),Z&&(E||Z.value.type===4&&Z.value.content.trim()[0]==="["||Z.value.type===17)&&(Z.value=Lt(t.helper(_c),[Z.value])));break;case 14:break;default:C=Lt(t.helper(Li),[Lt(t.helper(Gi),[C])]);break}return{props:C,directives:u,patchFlag:g,dynamicPropNames:w,shouldUseBlock:p}}function nu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||na(i))&&a0(l,a):(t.set(i,a),s.push(a))}return s}function a0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Yn([e.value,t.value],e.loc)}function i0(e,t){const s=[],n=Mh.get(e);n?s.push(t.helperString(n)):(t.helper(mc),t.directives.add(e.name),s.push(Mi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ue("true",!1,a);s.push(Ss(e.modifiers.map(l=>St(l,i)),a))}return Yn(s,e.loc)}function l0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function So(e){return e==="component"||e==="Component"}const r0=(e,t)=>{if(zl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=o0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=$a([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Lt(t.helper(uh),l,n)}};function o0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=lt(l.name),a.push(l)));else if(l.name==="bind"&&qn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=lt(l.arg.content);s=l.exp=Ue(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&cs(l.arg)&&(l.arg.content=lt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Ph(e,t,a,!1,!1);n=i,l.length&&t.onError(ut(36,l[0].loc))}return{slotName:s,slotProps:n}}const Fh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ut(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Sa(lt(u)):`on:${u}`;r=Ue(f,!0,l.loc)}else r=Ns([`${s.helperString(yo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(yo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=bh(o),f=!(u||rx(o)),p=o.content.includes(";");(f||c&&u)&&(o=Ns([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[St(r,o||Ue("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},c0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=lt(i.content):i.content=`${s.helperString(bo)}(${i.content})`:(i.children.unshift(`${s.helperString(bo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&au(i,"."),n.some(r=>r.content==="attr")&&au(i,"^")),{props:[St(i,l)]}},au=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},d0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Ur(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Ur(o))n||(n=s[i]=Ns([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Ur(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ms(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Lt(t.helper(pc),r)}}}}},iu=new WeakSet,u0=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return iu.has(e)||t.inVOnce||t.inSSR?void 0:(iu.add(e),t.inVOnce=!0,t.helper(Hl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},$h=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ut(41,e.loc)),Qa();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ut(44,n.loc)),Qa();if(r==="literal-const"||r==="setup-const")return s.onError(ut(45,n.loc)),Qa();if(!l.trim()||!bh(n))return s.onError(ut(42,n.loc)),Qa();const o=a||Ue("modelValue",!0),c=a?cs(a)?`onUpdate:${lt(a.content)}`:Ns(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ns([`${u} => ((`,n,") = $event)"]);const f=[St(o,e.exp),St(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(y=>y.content).map(y=>(Ec(y)?y:JSON.stringify(y))+": true").join(", "),g=a?cs(a)?`${a.content}Modifiers`:Ns([a,' + "Modifiers"']):"modelModifiers";f.push(St(g,Ue(`{ ${p} }`,!1,e.loc,2)))}return Qa(f)};function Qa(e=[]){return{props:e}}const f0=/[\w).+\-_$\]]/,p0=(e,t)=>{Qn("COMPILER_FILTERS",t)&&(e.type===5?Gl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&Gl(s.exp,t)}))};function Gl(e,t){if(e.type===4)lu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?lu(n,t):n.type===8?Gl(e,t):n.type===5&&Gl(n.content,t))}}function lu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,g,y=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)g===void 0?(d=p+1,g=s.slice(0,p).trim()):k();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let E=p-1,v;for(;E>=0&&(v=s.charAt(E),v===" ");E--);(!v||!f0.test(v))&&(l=!0)}}g===void 0?g=s.slice(0,p).trim():d!==0&&k();function k(){y.push(s.slice(d,p).trim()),d=p+1}if(y.length){for(p=0;p<y.length;p++)g=h0(g,y[p],t);e.content=g,e.ast=void 0}}function h0(e,t,s){s.helper(vc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Mi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Mi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const ru=new WeakSet,g0=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||ru.has(e)||t.inSSR?void 0:(ru.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Tc(n,t),e.codegenNode=Lt(t.helper(Sc),[s.exp,$a(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},m0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ut(53,n.loc)),s.exp=Ue("",!0,n.loc);else{const a=lt(n.content);(mh.test(a[0])||a[0]==="-")&&(s.exp=Ue(a,!1,n.loc))}}}};function v0(e){return[[m0,u0,Kx,g0,Jx,p0,r0,s0,Xx,d0],{on:Fh,bind:c0,model:$h}]}function b0(e,t={}){const s=t.onError||Cc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ut(48)):n&&s(ut(49));const a=!1;t.cacheHandlers&&s(ut(50)),t.scopeId&&!n&&s(ut(51));const i=ze({},t,{prefixIdentifiers:a}),l=Pe(e)?Sx(e,i):e,[r,o]=v0();return Ax(l,ze({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:ze({},o,t.directiveTransforms||{})})),Lx(l,i)}const y0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Uh=Symbol(""),Bh=Symbol(""),Hh=Symbol(""),Vh=Symbol(""),To=Symbol(""),jh=Symbol(""),zh=Symbol(""),qh=Symbol(""),Gh=Symbol(""),Kh=Symbol("");Jy({[Uh]:"vModelRadio",[Bh]:"vModelCheckbox",[Hh]:"vModelText",[Vh]:"vModelSelect",[To]:"vModelDynamic",[jh]:"withModifiers",[zh]:"withKeys",[qh]:"vShow",[Gh]:"Transition",[Kh]:"TransitionGroup"});let pa;function x0(e,t=!1){return pa||(pa=document.createElement("div")),t?(pa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,pa.children[0].getAttribute("foo")):(pa.innerHTML=e,pa.textContent)}const _0={parseMode:"html",isVoidTag:pm,isNativeTag:e=>dm(e)||um(e)||fm(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:x0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Gh;if(e==="TransitionGroup"||e==="transition-group")return Kh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},w0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ue("style",!0,t.loc),exp:k0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},k0=(e,t)=>{const s=lf(e);return Ue(JSON.stringify(s),!1,t,3)};function Mn(e,t){return ut(e,t)}const S0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(54,a)),t.children.length&&(s.onError(Mn(55,a)),t.children.length=0),{props:[St(Ue("innerHTML",!0,a),n||Ue("",!0))]}},T0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(56,a)),t.children.length&&(s.onError(Mn(57,a)),t.children.length=0),{props:[St(Ue("textContent",!0),n?ms(n,s)>0?n:Lt(s.helperString(mr),[n],a):Ue("",!0))]}},C0=(e,t,s)=>{const n=$h(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Mn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Hh,r=!1;if(a==="input"||i){const o=vr(t,"type");if(o){if(o.type===7)l=To;else if(o.value)switch(o.value.content){case"radio":l=Uh;break;case"checkbox":l=Bh;break;case"file":r=!0,s.onError(Mn(60,e.loc));break}}else ox(t)&&(l=To)}else a==="select"&&(l=Vh);r||(n.needRuntime=s.helper(l))}else s.onError(Mn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},E0=ys("passive,once,capture"),A0=ys("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),R0=ys("left,right"),Wh=ys("onkeyup,onkeydown,onkeypress"),I0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Di("COMPILER_V_ON_NATIVE",s)||E0(o)?l.push(o):R0(o)?cs(e)?Wh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):A0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},ou=(e,t)=>cs(e)&&e.content.toLowerCase()==="onclick"?Ue(t,!0):e.type!==4?Ns(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,O0=(e,t,s)=>Fh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=I0(i,a,s,e.loc);if(o.includes("right")&&(i=ou(i,"onContextmenu")),o.includes("middle")&&(i=ou(i,"onMouseup")),o.length&&(l=Lt(s.helper(jh),[l,JSON.stringify(o)])),r.length&&(!cs(i)||Wh(i.content.toLowerCase()))&&(l=Lt(s.helper(zh),[l,JSON.stringify(r)])),c.length){const d=c.map(ia).join("");i=cs(i)?Ue(`${i.content}${d}`,!0):Ns(["(",i,`) + "${d}"`])}return{props:[St(i,l)]}}),L0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(62,a)),{props:[],needRuntime:s.helper(qh)}},N0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},D0=[w0],M0={cloak:y0,html:S0,text:T0,model:C0,on:O0,show:L0};function P0(e,t={}){return b0(e,ze({},_0,t,{nodeTransforms:[N0,...D0,...t.nodeTransforms||[]],directiveTransforms:ze({},M0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const cu=Object.create(null);function F0(e,t){if(!Pe(e))if(e.nodeType)e=e.innerHTML;else return Bt;const s=Xg(e,t),n=cu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=ze({hoistStatic:!0,onError:void 0,onWarn:Bt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=P0(e,a),l=new Function("Vue",i)(zy);return l._rc=!0,cu[s]=l}Op(F0);const Kl=Fn({items:[]});let $0=1;function xr(e,t="info",s=3e3){const n=$0++;return Kl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Oc(n),s),n}function Oc(e){const t=Kl.items.findIndex(s=>s.id===e);t>=0&&Kl.items.splice(t,1)}function Te(e,t="info",s=3e3){return xr(e,t,s)}Te.success=(e,t=3e3)=>xr(e,"success",t);Te.error=(e,t=5e3)=>xr(e,"error",t);Te.info=(e,t=3e3)=>xr(e,"info",t);Te.dismiss=Oc;const U0={setup(){return{state:Kl,dismiss:Oc}},template:`
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
  `},ln=Fn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ia=null;function bs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ia&&Ia(!1),ln.title=e,ln.message=t,ln.confirmLabel=s,ln.cancelLabel=n,ln.danger=a,ln.open=!0,new Promise(i=>{Ia=i})}function du(e){ln.open=!1,Ia&&(Ia(e),Ia=null)}const B0={setup(){function e(t){ln.open&&t.key==="Escape"&&(t.stopPropagation(),du(!1))}return Ye(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:ln,settle:du}},template:`
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
 */const ba=typeof document<"u";function Zh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function H0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Zh(e.default)}const at=Object.assign;function Hr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ms(a)?a.map(e):e(a)}return s}const mi=()=>{},Ms=Array.isArray;function uu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Jh=/#/g,V0=/&/g,j0=/\//g,z0=/=/g,q0=/\?/g,Yh=/\+/g,G0=/%5B/g,K0=/%5D/g,Qh=/%5E/g,W0=/%60/g,Xh=/%7B/g,Z0=/%7C/g,eg=/%7D/g,J0=/%20/g;function Lc(e){return e==null?"":encodeURI(""+e).replace(Z0,"|").replace(G0,"[").replace(K0,"]")}function Y0(e){return Lc(e).replace(Xh,"{").replace(eg,"}").replace(Qh,"^")}function Co(e){return Lc(e).replace(Yh,"%2B").replace(J0,"+").replace(Jh,"%23").replace(V0,"%26").replace(W0,"`").replace(Xh,"{").replace(eg,"}").replace(Qh,"^")}function Q0(e){return Co(e).replace(z0,"%3D")}function X0(e){return Lc(e).replace(Jh,"%23").replace(q0,"%3F")}function e_(e){return X0(e).replace(j0,"%2F")}function Fi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const t_=/\/$/,s_=e=>e.replace(t_,"");function Vr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=l_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Fi(l)}}function n_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function fu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function a_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ha(t.matched[n],s.matched[a])&&tg(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ha(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function tg(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!i_(e[s],t[s]))return!1;return!0}function i_(e,t){return Ms(e)?pu(e,t):Ms(t)?pu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function pu(e,t){return Ms(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function l_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Cn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Eo=(function(e){return e.pop="pop",e.push="push",e})({}),jr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function r_(e){if(!e)if(ba){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),s_(e)}const o_=/^[^#]+#/;function c_(e,t){return e.replace(o_,"#")+t}function d_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const _r=()=>({left:window.scrollX,top:window.scrollY});function u_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=d_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function hu(e,t){return(history.state?history.state.position-t:-1)+e}const Ao=new Map;function f_(e,t){Ao.set(e,t)}function p_(e){const t=Ao.get(e);return Ao.delete(e),t}function h_(e){return typeof e=="string"||e&&typeof e=="object"}function sg(e){return typeof e=="string"||typeof e=="symbol"}let mt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const ng=Symbol("");mt.MATCHER_NOT_FOUND+"",mt.NAVIGATION_GUARD_REDIRECT+"",mt.NAVIGATION_ABORTED+"",mt.NAVIGATION_CANCELLED+"",mt.NAVIGATION_DUPLICATED+"";function Va(e,t){return at(new Error,{type:e,[ng]:!0},t)}function en(e,t){return e instanceof Error&&ng in e&&(t==null||!!(e.type&t))}const g_=["params","query","hash"];function m_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of g_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function v_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Yh," "),i=a.indexOf("="),l=Fi(i<0?a:a.slice(0,i)),r=i<0?null:Fi(a.slice(i+1));if(l in t){let o=t[l];Ms(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function gu(e){let t="";for(let s in e){const n=e[s];if(s=Q0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ms(n)?n.map(a=>a&&Co(a)):[n&&Co(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function b_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ms(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const y_=Symbol(""),mu=Symbol(""),wr=Symbol(""),Nc=Symbol(""),Ro=Symbol("");function Xa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Nn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Va(mt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):h_(f)?o(Va(mt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function zr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Zh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Nn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=H0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&Nn(f,s,n,l,r,a)()}))}}return i}function x_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ha(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ha(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let __=()=>location.protocol+"//"+location.host;function ag(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),fu(r,"")}return fu(s,e)+n+a}function w_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=ag(e,location),g=s.value,y=t.value;let k=0;if(f){if(s.value=p,t.value=f,l&&l===g){l=null;return}k=y?f.position-y.position:0}else n(p);a.forEach(E=>{E(s.value,g,{delta:k,type:Eo.pop,direction:k?k>0?jr.forward:jr.back:jr.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const g=a.indexOf(f);g>-1&&a.splice(g,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(at({},f.state,{scroll:_r()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function vu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?_r():null}}function k_(e){const{history:t,location:s}=window,n={value:ag(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:__()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,at({},t.state,vu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=at({},a.value,t.state,{forward:o,scroll:_r()});i(d.current,d,!0),i(o,at({},vu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function S_(e){e=r_(e);const t=k_(e),s=w_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=at({location:"",base:e,go:n,createHref:c_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function T_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),S_(e)}let Kn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Rt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Rt||{});const C_={type:Kn.Static,value:""},E_=/[a-zA-Z0-9_]/;function A_(e){if(!e)return[[]];if(e==="/")return[[C_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=Rt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Rt.Static?i.push({type:Kn.Static,value:c}):s===Rt.Param||s===Rt.ParamRegExp||s===Rt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Kn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Rt.ParamRegExp){n=s,s=Rt.EscapeNext;continue}switch(s){case Rt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Rt.Param):f();break;case Rt.EscapeNext:f(),s=n;break;case Rt.Param:o==="("?s=Rt.ParamRegExp:E_.test(o)?f():(u(),s=Rt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Rt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Rt.ParamRegExpEnd:d+=o;break;case Rt.ParamRegExpEnd:u(),s=Rt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Rt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const bu="[^/]+?",R_={sensitive:!1,strict:!1,start:!0,end:!0};var Jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Jt||{});const I_=/[.+*?^${}()[\]/\\]/g;function O_(e,t){const s=at({},R_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Jt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=Jt.Segment+(s.sensitive?Jt.BonusCaseSensitive:0);if(f.type===Kn.Static)u||(a+="/"),a+=f.value.replace(I_,"\\$&"),p+=Jt.Static;else if(f.type===Kn.Param){const{value:g,repeatable:y,optional:k,regexp:E}=f;i.push({name:g,repeatable:y,optional:k});const v=E||bu;if(v!==bu){p+=Jt.BonusCustomRegExp;try{`${v}`}catch(x){throw new Error(`Invalid custom RegExp for param "${g}" (${v}): `+x.message)}}let m=y?`((?:${v})(?:/(?:${v}))*)`:`(${v})`;u||(m=k&&c.length<2?`(?:/${m})`:"/"+m),k&&(m+="?"),a+=m,p+=Jt.Dynamic,k&&(p+=Jt.BonusOptional),y&&(p+=Jt.BonusRepeatable),v===".*"&&(p+=Jt.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",g=i[f-1];u[g.name]=p&&g.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Kn.Static)d+=p.value;else if(p.type===Kn.Param){const{value:g,repeatable:y,optional:k}=p,E=g in c?c[g]:"";if(Ms(E)&&!y)throw new Error(`Provided param "${g}" is an array but it is not repeatable (* or + modifiers)`);const v=Ms(E)?E.join("/"):E;if(!v)if(k)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${g}"`);d+=v}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function L_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Jt.Static+Jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Jt.Static+Jt.Segment?1:-1:0}function ig(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=L_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(yu(n))return 1;if(yu(a))return-1}return a.length-n.length}function yu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const N_={strict:!1,end:!0,sensitive:!1};function D_(e,t,s){const n=O_(A_(e.path),s),a=at(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function M_(e,t){const s=[],n=new Map;t=uu(N_,t);function a(u){return n.get(u)}function i(u,f,p){const g=!p,y=_u(u);y.aliasOf=p&&p.record;const k=uu(t,u),E=[y];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const w of x)E.push(_u(at({},y,{components:p?p.record.components:y.components,path:w,aliasOf:p?p.record:y})))}let v,m;for(const x of E){const{path:w}=x;if(f&&w[0]!=="/"){const _=f.record.path,R=_[_.length-1]==="/"?"":"/";x.path=f.record.path+(w&&R+w)}if(v=D_(x,f,k),p?p.alias.push(v):(m=m||v,m!==v&&m.alias.push(v),g&&u.name&&!wu(v)&&l(u.name)),lg(v)&&o(v),y.children){const _=y.children;for(let R=0;R<_.length;R++)i(_[R],v,p&&p.children[R])}p=p||v}return m?()=>{l(m)}:mi}function l(u){if(sg(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=$_(u,s);s.splice(f,0,u),u.record.name&&!wu(u)&&n.set(u.record.name,u)}function c(u,f){let p,g={},y,k;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Va(mt.MATCHER_NOT_FOUND,{location:u});k=p.record.name,g=at(xu(f.params,p.keys.filter(m=>!m.optional).concat(p.parent?p.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&xu(u.params,p.keys.map(m=>m.name))),y=p.stringify(g)}else if(u.path!=null)y=u.path,p=s.find(m=>m.re.test(y)),p&&(g=p.parse(y),k=p.record.name);else{if(p=f.name?n.get(f.name):s.find(m=>m.re.test(f.path)),!p)throw Va(mt.MATCHER_NOT_FOUND,{location:u,currentLocation:f});k=p.record.name,g=at({},f.params,u.params),y=p.stringify(g)}const E=[];let v=p;for(;v;)E.unshift(v.record),v=v.parent;return{name:k,path:y,params:g,matched:E,meta:F_(E)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function xu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function _u(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:P_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function P_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function wu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function F_(e){return e.reduce((t,s)=>at(t,s.meta),{})}function $_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;ig(e,t[i])<0?n=i:s=i+1}const a=U_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function U_(e){let t=e;for(;t=t.parent;)if(lg(t)&&ig(e,t)===0)return t}function lg({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function ku(e){const t=Ts(wr),s=Ts(Nc),n=te(()=>{const o=Gs(e.to);return t.resolve(o)}),a=te(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(Ha.bind(null,d));if(f>-1)return f;const p=Su(o[c-2]);return c>1&&Su(d)===p&&u[u.length-1].path!==p?u.findIndex(Ha.bind(null,o[c-2])):f}),i=te(()=>a.value>-1&&z_(s.params,n.value.params)),l=te(()=>a.value>-1&&a.value===s.matched.length-1&&tg(s.params,n.value.params));function r(o={}){if(j_(o)){const c=t[Gs(e.replace)?"replace":"push"](Gs(e.to)).catch(mi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:te(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function B_(e){return e.length===1?e[0]:e}const H_=Vi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:ku,setup(e,{slots:t}){const s=Fn(ku(e)),{options:n}=Ts(wr),a=te(()=>({[Tu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Tu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&B_(t.default(s));return e.custom?i:Da("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),V_=H_;function j_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function z_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ms(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Su(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Tu=(e,t,s)=>e??t??s,q_=Vi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ts(Ro),a=te(()=>e.route||n.value),i=Ts(mu,0),l=te(()=>{let c=Gs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=te(()=>a.value.matched[l.value]);ui(mu,te(()=>l.value+1)),ui(y_,r),ui(Ro,a);const o=h();return Xt(()=>[o.value,r.value,e.name],([c,d,u],[f,p,g])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!Ha(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(y=>y(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return Cu(s.default,{Component:f,route:c});const p=u.props[d],g=p?p===!0?c.params:typeof p=="function"?p(c):p:null,k=Da(f,at({},g,t,{onVnodeUnmounted:E=>{E.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Cu(s.default,{Component:k,route:c})||k}}});function Cu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const G_=q_;function K_(e){const t=M_(e.routes,e),s=e.parseQuery||v_,n=e.stringifyQuery||gu,a=e.history,i=Xa(),l=Xa(),r=Xa(),o=jo(Cn);let c=Cn;ba&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Hr.bind(null,V=>""+V),u=Hr.bind(null,e_),f=Hr.bind(null,Fi);function p(V,fe){let de,xe;return sg(V)?(de=t.getRecordMatcher(V),xe=fe):xe=V,t.addRoute(xe,de)}function g(V){const fe=t.getRecordMatcher(V);fe&&t.removeRoute(fe)}function y(){return t.getRoutes().map(V=>V.record)}function k(V){return!!t.getRecordMatcher(V)}function E(V,fe){if(fe=at({},fe||o.value),typeof V=="string"){const I=Vr(s,V,fe.path),P=t.resolve({path:I.path},fe),X=a.createHref(I.fullPath);return at(I,P,{params:f(P.params),hash:Fi(I.hash),redirectedFrom:void 0,href:X})}let de;if(V.path!=null)de=at({},V,{path:Vr(s,V.path,fe.path).path});else{const I=at({},V.params);for(const P in I)I[P]==null&&delete I[P];de=at({},V,{params:u(I)}),fe.params=u(fe.params)}const xe=t.resolve(de,fe),me=V.hash||"";xe.params=d(f(xe.params));const Be=n_(n,at({},V,{hash:Y0(me),path:xe.path})),b=a.createHref(Be);return at({fullPath:Be,hash:me,query:n===gu?b_(V.query):V.query||{}},xe,{redirectedFrom:void 0,href:b})}function v(V){return typeof V=="string"?Vr(s,V,o.value.path):at({},V)}function m(V,fe){if(c!==V)return Va(mt.NAVIGATION_CANCELLED,{from:fe,to:V})}function x(V){return R(V)}function w(V){return x(at(v(V),{replace:!0}))}function _(V,fe){const de=V.matched[V.matched.length-1];if(de&&de.redirect){const{redirect:xe}=de;let me=typeof xe=="function"?xe(V,fe):xe;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=v(me):{path:me},me.params={}),at({query:V.query,hash:V.hash,params:me.path!=null?{}:V.params},me)}}function R(V,fe){const de=c=E(V),xe=o.value,me=V.state,Be=V.force,b=V.replace===!0,I=_(de,xe);if(I)return R(at(v(I),{state:typeof I=="object"?at({},me,I.state):me,force:Be,replace:b}),fe||de);const P=de;P.redirectedFrom=fe;let X;return!Be&&a_(n,xe,de)&&(X=Va(mt.NAVIGATION_DUPLICATED,{to:P,from:xe}),ee(xe,xe,!0,!1)),(X?Promise.resolve(X):L(P,xe)).catch(J=>en(J)?en(J,mt.NAVIGATION_GUARD_REDIRECT)?J:K(J):A(J,P,xe)).then(J=>{if(J){if(en(J,mt.NAVIGATION_GUARD_REDIRECT))return R(at({replace:b},v(J.to),{state:typeof J.to=="object"?at({},me,J.to.state):me,force:Be}),fe||P)}else J=M(P,xe,!0,b,me);return H(P,xe,J),J})}function T(V,fe){const de=m(V,fe);return de?Promise.reject(de):Promise.resolve()}function C(V){const fe=B.values().next().value;return fe&&typeof fe.runWithContext=="function"?fe.runWithContext(V):V()}function L(V,fe){let de;const[xe,me,Be]=x_(V,fe);de=zr(xe.reverse(),"beforeRouteLeave",V,fe);for(const I of xe)I.leaveGuards.forEach(P=>{de.push(Nn(P,V,fe))});const b=T.bind(null,V,fe);return de.push(b),_e(de).then(()=>{de=[];for(const I of i.list())de.push(Nn(I,V,fe));return de.push(b),_e(de)}).then(()=>{de=zr(me,"beforeRouteUpdate",V,fe);for(const I of me)I.updateGuards.forEach(P=>{de.push(Nn(P,V,fe))});return de.push(b),_e(de)}).then(()=>{de=[];for(const I of Be)if(I.beforeEnter)if(Ms(I.beforeEnter))for(const P of I.beforeEnter)de.push(Nn(P,V,fe));else de.push(Nn(I.beforeEnter,V,fe));return de.push(b),_e(de)}).then(()=>(V.matched.forEach(I=>I.enterCallbacks={}),de=zr(Be,"beforeRouteEnter",V,fe,C),de.push(b),_e(de))).then(()=>{de=[];for(const I of l.list())de.push(Nn(I,V,fe));return de.push(b),_e(de)}).catch(I=>en(I,mt.NAVIGATION_CANCELLED)?I:Promise.reject(I))}function H(V,fe,de){r.list().forEach(xe=>C(()=>xe(V,fe,de)))}function M(V,fe,de,xe,me){const Be=m(V,fe);if(Be)return Be;const b=fe===Cn,I=ba?history.state:{};de&&(xe||b?a.replace(V.fullPath,at({scroll:b&&I&&I.scroll},me)):a.push(V.fullPath,me)),o.value=V,ee(V,fe,de,b),K()}let N;function Z(){N||(N=a.listen((V,fe,de)=>{if(!re.listening)return;const xe=E(V),me=_(xe,re.currentRoute.value);if(me){R(at(me,{replace:!0,force:!0}),xe).catch(mi);return}c=xe;const Be=o.value;ba&&f_(hu(Be.fullPath,de.delta),_r()),L(xe,Be).catch(b=>en(b,mt.NAVIGATION_ABORTED|mt.NAVIGATION_CANCELLED)?b:en(b,mt.NAVIGATION_GUARD_REDIRECT)?(R(at(v(b.to),{force:!0}),xe).then(I=>{en(I,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&!de.delta&&de.type===Eo.pop&&a.go(-1,!1)}).catch(mi),Promise.reject()):(de.delta&&a.go(-de.delta,!1),A(b,xe,Be))).then(b=>{b=b||M(xe,Be,!1),b&&(de.delta&&!en(b,mt.NAVIGATION_CANCELLED)?a.go(-de.delta,!1):de.type===Eo.pop&&en(b,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(xe,Be,b)}).catch(mi)}))}let ne=Xa(),F=Xa(),O;function A(V,fe,de){K(V);const xe=F.list();return xe.length?xe.forEach(me=>me(V,fe,de)):console.error(V),Promise.reject(V)}function q(){return O&&o.value!==Cn?Promise.resolve():new Promise((V,fe)=>{ne.add([V,fe])})}function K(V){return O||(O=!V,Z(),ne.list().forEach(([fe,de])=>V?de(V):fe()),ne.reset()),V}function ee(V,fe,de,xe){const{scrollBehavior:me}=e;if(!ba||!me)return Promise.resolve();const Be=!de&&p_(hu(V.fullPath,0))||(xe||!de)&&history.state&&history.state.scroll||null;return Ot().then(()=>me(V,fe,Be)).then(b=>b&&u_(b)).catch(b=>A(b,V,fe))}const ie=V=>a.go(V);let U;const B=new Set,re={currentRoute:o,listening:!0,addRoute:p,removeRoute:g,clearRoutes:t.clearRoutes,hasRoute:k,getRoutes:y,resolve:E,options:e,push:x,replace:w,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:F.add,isReady:q,install(V){V.component("RouterLink",V_),V.component("RouterView",G_),V.config.globalProperties.$router=re,Object.defineProperty(V.config.globalProperties,"$route",{enumerable:!0,get:()=>Gs(o)}),ba&&!U&&o.value===Cn&&(U=!0,x(a.location).catch(xe=>{}));const fe={};for(const xe in Cn)Object.defineProperty(fe,xe,{get:()=>o.value[xe],enumerable:!0});V.provide(wr,re),V.provide(Nc,Vo(fe)),V.provide(Ro,o);const de=V.unmount;B.add(V),V.unmount=function(){B.delete(V),B.size<1&&(c=Cn,N&&N(),N=null,o.value=Cn,U=!1,O=!1),de()}}};function _e(V){return V.reduce((fe,de)=>fe.then(()=>C(de)),Promise.resolve())}return re}function rg(){return Ts(wr)}function W_(e){return Ts(Nc)}const kr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=W_(),s=rg(),n=te({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=te(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=te(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});Xt(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},Z_={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(f){var y,k,E,v,m;const p=f.payload||f,g=p.type||f.type;if(g==="tool_start"){const x=((y=p.metadata)==null?void 0:y.call_id)||null,w={callId:x,id:x||`${p.action}-${Date.now()}`,tool:p.action,actor:p.actor||"",channel:p.channel_id||"",iteration:((k=p.metadata)==null?void 0:k.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(w);return}if(g==="tool_end"){const x=((E=p.metadata)==null?void 0:E.call_id)||null;let w=-1;if(x&&(w=e.value.findIndex(_=>_.callId===x&&_.status==="running")),w<0&&!x)for(let _=e.value.length-1;_>=0;_--){const R=e.value[_];if(R.tool===p.action&&R.status==="running"){w=_;break}}if(w>=0){const _=e.value[w];_.status=(v=p.metadata)!=null&&v.error?"error":"success",_.elapsed=((m=p.metadata)==null?void 0:m.elapsed_ms)||Date.now()-_.startTime,_.result=p.detail||"",_.fadingOut=!0,setTimeout(()=>{const R=e.value.indexOf(_);R>=0&&e.value.splice(R,1),t.value.unshift(_),t.value.length>n&&t.value.pop()},5e3)}return}if(g==="tool_stream"){const x=p.call_id||p.tool_name||"unknown";if(p.finished){const w={...s.value};delete w[x],s.value=w}else{const _=((s.value[x]||"")+(p.chunk||"")).split(`
`);s.value={...s.value,[x]:_.slice(-30).join(`
`)}}return}}let i=null;function l(){const f=Date.now();e.value.forEach(p=>{p.status==="running"&&(p.elapsed=f-p.startTime)})}let r=!1;function o(){r||(r=!0,Ze.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,Ze.off("events",a),i&&(clearInterval(i),i=null))}Ye(o),As(o),Rs(c),_t(c);function d(f){return f<1e3?`${f}ms`:`${(f/1e3).toFixed(1)}s`}function u(f){return f==="running"?"clock":f==="success"?"success":f==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Dc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ra(e){const t=Dc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Mc(e){const t=Dc(e);return t?t.toLocaleTimeString():"—"}function og(e){const t=Dc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function ja(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Pc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function cg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Eu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function dg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function ug(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const fg=Symbol("agent-detail-cancelled"),J_=15e3;function Y_(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,g)=>{o=p,c=g});function u(p,g){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(g))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,fg),i==null||i.abort()}}}function pg({state:e,requestDetail:t,timeoutMs:s=J_,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:g}){if(!f)return Promise.resolve();if(g&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const y={agentId:f,cancel:null,promise:null};l=y,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const k=Y_(E=>t(f,{signal:E}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return y.cancel=k.cancel,y.promise=(async()=>{let E=null,v=null;try{E=await k.promise}catch(m){v=m}E!==fg&&(l!==y||e.detailId!==f||(l=null,!v&&(E===null||typeof E!="object")&&(v=new Error(`${n} response was empty or invalid`)),v?e.detail===null&&(e.detailError=(v==null?void 0:v.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=E,e.detailError=null),e.detailLoading=!1))})(),y.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Q_({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const X_={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=te(()=>e.value.filter(A=>A.status==="running").length),o=te(()=>e.value.filter(A=>A.status==="completed").length),c=te(()=>e.value.filter(A=>["failed","timeout","killed"].includes(A.status)).length),d=te(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=te(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(A=>["failed","timeout","killed"].includes(A.status)):e.value.filter(A=>A.status===i.value));function f(A){const q=Number(A.max_iterations)||0;return q<=0?0:Math.min(100,Math.round(A.iteration_count/q*100))}function p(A){return(Number(A.max_iterations)||0)>0}function g(A,q){return A?A==="N/A"?"N/A":q==="current_inheritance"?`inherit (currently ${A})`:A:"unknown"}function y(A){return g(A.display_model,A.display_model_source||A.display_source)}function k(A){return g(A.display_reasoning_effort,A.display_reasoning_effort_source||A.display_source)}function E(A){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[A]||""}const v=h(null),m=h(null),x=h(!1),w=h(null),_=h(""),T=pg({state:{get detail(){return v.value},set detail(A){v.value=A},get detailId(){return m.value},set detailId(A){m.value=A},get detailLoading(){return x.value},set detailLoading(A){x.value=A},get detailError(){return w.value},set detailError(A){w.value=A}},requestDetail:(A,{signal:q})=>Q.get(`/api/agents/${encodeURIComponent(A)}`,{signal:q})});async function C(A){_.value="",await T.open(A.id)}function L(){T.close(),_.value=""}async function H(){await T.refresh()}async function M(A,q){try{await navigator.clipboard.writeText(q||""),_.value=A,setTimeout(()=>{_.value===A&&(_.value="")},1500)}catch{Te.error("Copy failed")}}async function N(A=!1){A=A===!0,A||(t.value=!0);try{const q=await Q.get("/api/agents");e.value=Array.isArray(q)?q:[],s.value=null}catch(q){A||(s.value=q.message)}A||(t.value=!1)}async function Z(A){const q=e.value.find(ee=>ee.id===A);if(await bs({title:"Kill agent",message:`Kill agent "${(q==null?void 0:q.label)||A}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=A;try{await Q.del(`/api/agents/${encodeURIComponent(A)}`),Te.success("Agent killed"),await N()}catch(ee){Te.error(ee.message||"Failed to kill agent")}n.value=null}}const ne=Q_({isEnabled:()=>a.value&&l,refreshList:()=>N(!0),hasOpenDetail:()=>!!m.value,refreshDetail:H});function F(){ne.start()}function O(){ne.stop()}return Xt(a,()=>ne.sync()),Ye(()=>{l=!0,N(),F()}),As(()=>{l=!0,N(!0),F()}),Rs(()=>{l=!1,O()}),_t(()=>{l=!1,O(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ra,formatDuration:ja,progressPercent:f,hasProgress:p,displayModelText:y,displayEffortText:k,displaySourceLabel:E,detail:v,detailId:m,detailLoading:x,detailError:w,copied:_,openDetail:C,closeDetail:L,copyText:M,fetchAgents:N,killAgent:Z,startAutoRefresh:F,stopAutoRefresh:O}}},ew={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let g=!1;const k=pg({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return f.value},set detailError(O){f.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:A})=>Q.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:A})});async function E(O){p.value="",await k.open(O.id)}function v(){k.close(),p.value=""}async function m(O,A){try{await navigator.clipboard.writeText(A||""),p.value=O,setTimeout(()=>{p.value===O&&(p.value="")},1500)}catch{Te.error("Copy failed")}}const x=te(()=>e.value.reduce((O,A)=>O+(A.iteration_count||0),0)),w=te(()=>e.value.filter(O=>O.status==="running").length);function _(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function R(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function T(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function C(O=!1){O=O===!0,O||(t.value=!0);try{const A=await Q.get("/api/loops");e.value=Array.isArray(A)?A:[],s.value=null}catch(A){O||(s.value=A.message)}O||(t.value=!1)}async function L(){l.value=null;const O=a.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const A={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(A.stop_condition=O.stop_condition.trim()),i.value=!0;try{const q=await Q.post("/api/loops",A);Te.success(`Loop started: ${q.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(q){l.value=q.message}i.value=!1}async function H(O){if(await bs({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=O;try{await Q.del(`/api/loops/${encodeURIComponent(O)}`),Te.success("Loop stopped"),await C()}catch(q){Te.error(q.message||"Failed to stop loop")}r.value=null}}async function M(O){o.value=O;try{await Q.post(`/api/loops/${encodeURIComponent(O)}/restart`),Te.success("Loop restarted"),await C()}catch(A){Te.error(A.message||"Failed to restart loop")}o.value=null}function N(O){g&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(C(!0),d.value&&k.refresh())}let Z=null;function ne(){Z!==null&&clearInterval(Z),Z=null}function F(){ne(),g&&(Z=setInterval(()=>{C(!0),d.value&&k.refresh()},5e3))}return Ye(()=>{g=!0,C(),Ze.subscribe("events",N),F()}),As(()=>{g=!0,C(!0),F()}),Rs(()=>{g=!1,ne()}),_t(()=>{g=!1,Ze.unsubscribe("events",N),ne(),k.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:x,runningCount:w,statusDotClass:_,statusBadge:R,modeBadge:T,formatAge:og,formatDuration:ja,formatTs:ra,formatTokens:ug,openDetail:E,closeDetail:v,copyText:m,fetchLoops:C,doCreate:L,doStop:H,doRestart:M}}},tw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=te(()=>e.value.filter(v=>v.status==="running").length),r=te(()=>e.value.filter(v=>v.status!=="running").length);function o(v){return v==="running"?"loop-status-running":v==="failed"||v==="error"?"loop-status-error":"loop-status-stopped"}function c(v){return v==="running"?"badge-success":v==="completed"||v==="exited"?"badge-info":v==="killed"||v==="error"||v==="failed"?"badge-danger":"badge-warning"}async function d(v=!1){v=v===!0,v||(t.value=!0);try{e.value=await Q.get("/api/processes"),s.value=null}catch(m){v||(s.value=m.message)}v||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}Xt(n,v=>{v?u():f()});async function p(v){if(await bs({title:"Kill process",message:`Kill process ${v}?`,confirmLabel:"Kill",danger:!0})){i.value=v;try{await Q.del(`/api/processes/${v}`),Te.success(`Process ${v} killed`),await d()}catch(x){Te.error(x.message||"Failed to kill process")}i.value=null}}function g(v){v.payload&&(v.payload.pid||v.payload.type==="process")&&d(!0)}let y=!1;function k(){y||(y=!0,d(),Ze.subscribe("events",g),u())}function E(){y&&(y=!1,Ze.unsubscribe("events",g),f())}return Ye(k),As(k),Rs(E),_t(E),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ja,fetchProcesses:d,doKill:p}}},sw=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function nw(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function aw(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function iw(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=sw.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),f=new Date(u-864e5).getTimezoneOffset(),p=new Date(u+864e5).getTimezoneOffset(),g=[];for(const k of new Set([f,p])){const E=new Date(u+k*6e4);nw(E,c)===d&&(g.some(v=>v.getTime()===E.getTime())||g.push(E))}if(g.sort((k,E)=>k.getTime()-E.getTime()),g.length===0)return{state:"nonexistent",typed:t};if(g.length>1)return{state:"ambiguous",typed:t,options:g.map(k=>({instant:k,offset:aw(k),iso:k.toISOString()}))};const y=g[0];return{state:"ok",typed:t,instant:y,iso:y.toISOString()}}const lw={template:`
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

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <span class="text-gray-400 text-xs block mb-1">Cron Expression</span>
            <div class="flex gap-2">
              <input v-model="form.cron" type="text" class="hm-input"
                     placeholder="e.g. 0 */6 * * *" @input="onCronInput" />
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
            <input v-model="form.run_at" type="datetime-local" class="hm-input" />
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=te(()=>iw(a.value.run_at));Xt(()=>a.value.run_at,()=>{r.value=null});const c=te(()=>{var B;const U=o.value;return U.state==="ok"?U.instant:U.state==="ambiguous"&&r.value!==null&&((B=U.options[r.value])==null?void 0:B.instant)||null}),d=te(()=>{const U=c.value;return U?`${U.toLocaleString()} local — ${U.toISOString()} UTC`:""}),u=h(null),f=h(!1),p=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],g=h(null),y=h(null),k=h(null),E=h(null),v=h(null),m=h([]),x=h(!1),w=h("");let _=0;const R=te(()=>e.value.filter(U=>U.cron&&!U.one_time).length),T=te(()=>e.value.filter(U=>U.one_time).length),C=te(()=>e.value.filter(U=>U.trigger).length),L=te(()=>e.value.filter(U=>U.paused).length),H=te(()=>e.value.filter(U=>U.consecutive_failures>0).length);function M(U){if(!U)return"-";const B=Date.now(),_e=(new Date(U).getTime()-B)/1e3;if(_e<0)return"overdue";if(_e<60)return"in < 1 min";if(_e<3600)return`in ${Math.floor(_e/60)} min`;if(_e<86400){const fe=Math.floor(_e/3600),de=Math.floor(_e%3600/60);return de>0?`in ${fe}h ${de}m`:`in ${fe}h`}const V=Math.floor(_e/86400);return`in ${V} day${V!==1?"s":""}`}function N(U){return U==null?"-":U<1e3?`${U}ms`:U<6e4?`${(U/1e3).toFixed(1)}s`:ja(U/1e3)}function Z(){u.value=null}async function ne(){const U=a.value.cron.trim();if(U){f.value=!0;try{u.value=await Q.post("/api/schedules/validate-cron",{expression:U})}catch(B){u.value={valid:!1,error:B.message}}f.value=!1}}async function F(){t.value=!0,s.value=null;try{e.value=await Q.get("/api/schedules")}catch(U){s.value=U.message}t.value=!1}async function O(U){if(v.value===U){v.value=null,m.value=[];return}v.value=U,x.value=!0,m.value=[];const B=++_;try{const re=await Q.get(`/api/schedules/${encodeURIComponent(U)}/history?limit=10`);if(B!==_||v.value!==U)return;m.value=re,w.value=""}catch(re){if(B!==_||v.value!==U)return;m.value=[],w.value=re.message||"Failed to load execution history"}B===_&&(x.value=!1)}async function A(){l.value=null;const U=a.value;if(!U.description.trim()){l.value="Description is required";return}if(!U.channel_id.trim()){l.value="Channel ID is required";return}if(!U.cron.trim()&&!U.run_at.trim()){l.value="Cron expression or run_at time is required";return}const B={description:U.description.trim(),action:U.action,channel_id:U.channel_id.trim()};if(U.cron.trim()&&(B.cron=U.cron.trim()),U.run_at.trim()){const re=o.value;if(re.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(re.state==="invalid"){l.value="One-time run time is not a valid date";return}const _e=c.value;if(re.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!_e){l.value="One-time run time could not be resolved";return}B.run_at=_e.toISOString()}if(U.action==="reminder"&&U.message.trim()&&(B.message=U.message.trim()),U.action==="check"&&(U.tool_name.trim()&&(B.tool_name=U.tool_name.trim()),U.tool_input_str.trim()))try{B.tool_input=JSON.parse(U.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await Q.post("/api/schedules",B),Te.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await F()}catch(re){l.value=re.message}i.value=!1}async function q(U){g.value=U;try{const B=await Q.post(`/api/schedules/${encodeURIComponent(U)}/run`);if(B.status==="failure")Te.error(`Execution failed: ${B.error||"unknown error"}`);else{const re=B.warning?`Executed (${B.warning})`:"Executed successfully";Te.success(re)}await F()}catch(B){Te.error(B.message||"Failed to trigger")}g.value=null}async function K(U){k.value=U.id;const B=!U.paused;try{await Q.put(`/api/schedules/${encodeURIComponent(U.id)}`,{paused:B}),Te.success(B?"Schedule paused":"Schedule resumed"),await F()}catch(re){Te.error(re.message||"Failed to update schedule")}k.value=null}async function ee(U){E.value=U;try{await Q.post(`/api/schedules/${encodeURIComponent(U)}/reset-failures`),Te.success("Failure counters reset"),await F()}catch(B){Te.error(B.message||"Failed to reset")}E.value=null}async function ie(U){const B=e.value.find(_e=>_e.id===U);if(await bs({title:"Delete schedule",message:`Delete "${(B==null?void 0:B.description)||U}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){y.value=U;try{await Q.del(`/api/schedules/${encodeURIComponent(U)}`),Te.success("Schedule deleted"),await F()}catch(_e){Te.error(_e.message||"Failed to delete schedule")}y.value=null}}return Ye(()=>{F()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:f,cronPresets:p,runningId:g,deletingId:y,togglingId:k,resettingId:E,expandedId:v,history:m,historyLoading:x,historyError:w,cronCount:R,oneTimeCount:T,webhookCount:C,pausedCount:L,failingCount:H,formatTs:ra,formatAge:og,formatFuture:M,formatMs:N,formatDuration:ja,onCronInput:Z,validateCron:ne,toggleExpand:O,fetchSchedules:F,doCreate:A,doRunNow:q,doTogglePause:K,doResetFailures:ee,doDelete:ie}}},hg=[{id:"live",label:"Live",component:Z_},{id:"agents",label:"Agents",component:X_},{id:"loops",label:"Loops",component:ew},{id:"processes",label:"Processes",component:tw},{id:"schedules",label:"Schedules",component:lw}],rw={components:{TabbedPage:kr},setup(){return{tabs:hg}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ow={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await Q.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ye(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ra,formatDetail:i,truncateBlock:cg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Au=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],cw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],dw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),f=h(""),p=h("last_active"),g=h(!1),y=Au,k=cw,E=h([]),v=h(!1),m=h(""),x=h("flat"),w=h(new Set),_=h(""),R=h(""),T=h(""),C=h(null),L=h(!1);function H(){try{const j=localStorage.getItem("odin-session-presets");j&&(E.value=JSON.parse(j))}catch{}}function M(){try{localStorage.setItem("odin-session-presets",JSON.stringify(E.value))}catch{}}const N=te(()=>f.value.trim()!==""||u.value!=="all"),Z=te(()=>{let j=[...e.value];const we=Au.find(qe=>qe.id===u.value),Le=we?we.filters:{};if(Le.source&&(j=j.filter(qe=>qe.source===Le.source)),Le.minMessages&&(j=j.filter(qe=>qe.message_count>=Le.minMessages)),Le.hasCompaction&&(j=j.filter(qe=>qe.has_summary)),Le.maxAge!=null){const qe=Date.now()/1e3;j=j.filter(ht=>ht.last_active&&qe-ht.last_active<=Le.maxAge)}if(f.value.trim()){const qe=f.value.toLowerCase().trim();j=j.filter(ht=>(ht.channel_id||"").toLowerCase().includes(qe)||(ht.last_user_id||"").toLowerCase().includes(qe)||(ht.source||"").toLowerCase().includes(qe))}const De=p.value,Ke=g.value?1:-1;return j.sort((qe,ht)=>{const ss=qe[De]||0,Is=ht[De]||0;return(ss-Is)*Ke}),j}),ne=te(()=>{if(!a.value||!a.value.messages)return[];const j=a.value.messages;if(j.length===0)return[];const we=[];let Le=[];for(const De of j)De.role==="user"&&Le.length>0&&(we.push(Le),Le=[]),Le.push(De);return Le.length>0&&we.push(Le),we}),F=te(()=>Z.value.length>0&&c.value.size===Z.value.length);function O(j){const we=j.find(Le=>Le.role==="user");if(we&&we.content){const Le=we.content.slice(0,120);return Le.length<we.content.length?Le+"...":Le}return"(no user message)"}function A(j){const we=new Set(w.value);we.has(j)?we.delete(j):we.add(j),w.value=we}function q(j){u.value=j}function K(j){u.value=j.id,j.filters.searchQuery!=null&&(f.value=j.filters.searchQuery),j.filters.sortBy&&(p.value=j.filters.sortBy)}function ee(){if(!m.value.trim())return;const j={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:f.value,sortBy:p.value}};E.value=[...E.value,j],M(),v.value=!1,m.value=""}function ie(j){E.value=E.value.filter(we=>we.id!==j),M(),u.value===j&&(u.value="all")}function U(){u.value="all",f.value="",p.value="last_active",g.value=!1}function B(j){if(!j)return"—";const we=Date.now()/1e3-j;if(we<60)return"just now";if(we<3600){const De=Math.floor(we/60);return`${De} minute${De!==1?"s":""} ago`}if(we<86400){const De=Math.floor(we/3600);return`${De} hour${De!==1?"s":""} ago`}const Le=Math.floor(we/86400);return`${Le} day${Le!==1?"s":""} ago`}function re(j){if(!j)return"";try{return new Date(j*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function _e(j){if(!j)return"";try{return new Date(j*1e3).toLocaleString()}catch{return""}}function V(j){return j==="user"?"bg-gray-900/50 border border-gray-800":j==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function fe(j){return j==="user"?"sess-msg-user":j==="assistant"?"sess-msg-assistant":"sess-msg-system"}function de(j){return j==="user"?"badge-info":j==="assistant"?"badge-success":"badge-warning"}function xe(j){return j==="user"?"sess-dot-user":j==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(j){return j==="user"?"text-cyan-400":j==="assistant"?"text-indigo-400":"text-gray-500"}function Be(j){return j?j.length>2e3?j.slice(0,2e3)+`
... (truncated)`:j:""}async function b(){const j=_.value.trim();if(j){L.value=!0;try{let we=`/api/sessions/search?q=${encodeURIComponent(j)}&limit=50`;R.value.trim()&&(we+=`&channel_id=${encodeURIComponent(R.value.trim())}`),T.value.trim()&&(we+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Le=await Q.get(we);C.value=Le.results||[]}catch{C.value=[]}L.value=!1}}function I(){_.value="",R.value="",T.value="",C.value=null}function P(j){return j?j.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function X(j){return j==="user"?"fts-result-user":j==="assistant"?"fts-result-assistant":j==="summary"?"fts-result-summary":j==="fts"?"fts-result-fts":j==="channel"?"fts-result-channel":"fts-result-default"}function J(j){return j==="user"?"badge-info":j==="assistant"?"badge-success":j==="summary"?"badge-warning":j==="fts"?"badge-success":"badge-info"}async function Y(){t.value=!0,s.value=null;try{e.value=await Q.get("/api/sessions")}catch(j){s.value=j.message}t.value=!1}function pe(){s.value=null,Y()}async function ce(j){if(n.value===j){n.value=null,a.value=null,w.value=new Set;return}n.value=j,a.value=null,i.value=!0,w.value=new Set;const we=++l;try{const Le=await Q.get(`/api/sessions/${encodeURIComponent(j)}`);we===l&&n.value===j&&(a.value=Le)}catch(Le){we===l&&n.value===j&&(a.value={messages:[],summary:"",error:Le.message||"Failed to load session"})}finally{we===l&&(i.value=!1)}}function oe(j){const we=new Set(c.value);we.has(j)?we.delete(j):we.add(j),c.value=we}function se(){F.value?c.value=new Set:c.value=new Set(Z.value.map(j=>j.channel_id))}function ye(j){r.value=j}async function he(){if(r.value){o.value=!0;try{await Q.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await Y()}catch(j){s.value=j.message||"Failed to clear session"}o.value=!1,r.value=null}}function ge(){d.value=!0}async function ke(){if(c.value.size!==0){o.value=!0;try{await Q.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await Y()}catch(j){s.value=j.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Ce(j,we){const Le=`/api/sessions/${encodeURIComponent(j)}/export?format=${we}`;try{const De=await Q.getBlob(Le),Ke=URL.createObjectURL(De),qe=document.createElement("a");qe.href=Ke,qe.download=`session-${j}.${we==="text"?"txt":"json"}`,qe.click(),URL.revokeObjectURL(Ke)}catch(De){s.value=De.message||"Failed to export session"}}let Ie=null;function Me(j){j.payload&&j.payload.channel_id&&(clearTimeout(Ie),Ie=setTimeout(()=>{if(Y(),n.value&&j.payload.channel_id===n.value){const we=n.value,Le=l;Q.get(`/api/sessions/${encodeURIComponent(we)}`).then(De=>{Le!==l||n.value!==we||(a.value=De)}).catch(()=>{})}},2e3))}let Fe=!1;function Ve(){Fe||(Fe=!0,Y(),Ze.subscribe("events",Me))}Ye(()=>{H(),Ve()}),As(()=>{Ve()});function st(){Fe&&(Fe=!1,Ze.unsubscribe("events",Me),clearTimeout(Ie))}return Rs(st),_t(st),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:F,bulkClearing:d,activePreset:u,searchQuery:f,sortBy:p,sortAsc:g,filterPresets:y,sortOptions:k,filteredSessions:Z,hasActiveFilters:N,customPresets:E,showSavePreset:v,newPresetName:m,threadView:x,threads:ne,collapsedThreads:w,ftsQuery:_,ftsChannelId:R,ftsUserId:T,ftsResults:C,ftsSearching:L,formatAge:B,formatTimestamp:re,formatFullTimestamp:_e,messageClass:V,threadMsgClass:fe,roleBadge:de,roleDotClass:xe,roleLabelClass:me,truncateContent:Be,threadSummary:O,fetchSessions:Y,retry:pe,toggleSession:ce,toggleSelect:oe,toggleSelectAll:se,confirmClear:ye,clearSession:he,confirmBulkClear:ge,doBulkClear:ke,exportSession:Ce,applyPreset:q,applyCustomPreset:K,saveCustomPreset:ee,removeCustomPreset:ie,resetFilters:U,toggleThread:A,runFtsSearch:b,clearFtsSearch:I,highlightSnippet:P,ftsResultClass:X,ftsTypeBadge:J}}},uw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:ug}}},fw={components:{ContextAssemblyPanel:uw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(R){if(!R)return"—";try{const T=new Date(R);return isNaN(T.getTime())?R:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return R}}function f(R){return!R&&R!==0?"—":R<1e3?R+"ms":(R/1e3).toFixed(1)+"s"}function p(R){return!R&&R!==0?"—":R>=1e3?(R/1e3).toFixed(1)+"k":String(R)}function g(R){if(!R)return"";if(typeof R=="string")return R;try{return JSON.stringify(R,null,2)}catch{return String(R)}}function y(R){a.value===R?a.value=null:(a.value=R,c.value={})}function k(R,T){const C=R+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function E(R,T){return!!c.value[R+"-"+T]}function v(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,w()}async function m(){try{const R=await Q.get("/api/trajectories");e.value=R.files||[],o.value=R.count||0}catch{}}let x=0;async function w(){const R=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await Q.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(R!==x)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(L=>L.is_error)),d.value.channel_id&&(C=C.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(L=>L.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),L=await Q.get(`/api/trajectories/search/query?${C}`);if(R!==x)return;t.value=L.results||[]}}catch(T){if(R!==x)return;n.value=T.message}R===x&&(s.value=!1)}async function _(){if(!l.value.trim())return;const R=++x;s.value=!0,n.value=null,c.value={};try{const T=await Q.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(R!==x)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(R!==x)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}R===x&&(s.value=!1)}return Ye(async()=>{await m(),await w()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:g,truncateBlock:cg,toggleExpand:y,toggleIteration:k,isIterationExpanded:E,clearFilters:v,fetchFiles:m,fetchTraces:w,lookupMessage:_}}},pw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=te(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const g=await Q.get("/api/usage");n.value=g,a.value=g.totals||a.value,t.value=null,s.value=!0}catch(g){t.value=g.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function f(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function p(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ye(f),As(f),Rs(p),_t(p),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:dg,formatTime:Mc,retry:d}}},gg=[{id:"audit",label:"Audit",component:ow},{id:"sessions",label:"Sessions",component:dw},{id:"traces",label:"Traces",component:fw},{id:"usage",label:"Usage",component:pw}],hw={components:{TabbedPage:kr},setup(){return{tabs:gg}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},qr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],gw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Tools</h1>
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
          <div class="tl-stat-card">
            <div class="tl-stat-value">{{ coreCount }}</div>
            <div class="tl-stat-label">Core Tools</div>
          </div>
          <div class="tl-stat-card">
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
                   class="tl-tool-card" :class="{ 'tl-tool-card-active': stats[t.name] > 0 }"
                   role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                   @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                <div class="tl-tool-header">
                  <span class="tl-tool-name">{{ t.name }}</span>
                </div>
                <div class="tl-tool-desc">{{ truncate(t.description, 80) }}</div>
                <div class="tl-tool-footer">
                  <div class="tl-tool-usage">
                    <span v-if="stats[t.name]" class="tl-tool-usage-count">{{ stats[t.name].toLocaleString() }}</span>
                    <span v-else class="tl-tool-usage-zero">—</span>
                    <span class="tl-tool-usage-label">uses</span>
                  </div>
                </div>
                <!-- Expanded detail -->
                <div v-if="expanded[t.name]" class="tl-tool-detail">
                  <div class="tl-tool-detail-desc">{{ t.description }}</div>
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
                </tr>
              </thead>
              <tbody>
                <template v-for="t in group.tools" :key="t.name">
                  <tr class="cursor-pointer" role="button" tabindex="0" :aria-expanded="!!expanded[t.name]"
                      @click="toggleExpand(t.name)" @keydown.enter="toggleExpand(t.name)" @keydown.space.prevent="toggleExpand(t.name)">
                    <td class="font-mono text-sm whitespace-nowrap">
                      <span class="tool-expand-icon text-gray-600 mr-1" aria-hidden="true"><odin-icon :name="expanded[t.name] ? 'chevronUp' : 'chevronDown'" :size="13" /></span>
                      {{ t.name }}
                    </td>
                    <td class="text-gray-400 text-sm mobile-hide">{{ truncate(t.description, 100) }}</td>
                    <td class="text-right">
                      <div class="flex items-center justify-end gap-2">
                        <span v-if="stats[t.name]" class="text-gray-300 text-sm font-mono">{{ stats[t.name].toLocaleString() }}</span>
                        <span v-else class="text-gray-600 text-sm">—</span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="expanded[t.name]" class="tool-detail-row">
                    <td colspan="3" class="tool-detail-cell">
                      <div class="text-gray-300 text-sm whitespace-pre-wrap">{{ t.description }}</div>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=te(()=>e.value.filter(v=>v.is_core).length),c=te(()=>e.value.filter(v=>!v.is_core).length),d=te(()=>Object.values(a.value).reduce((v,m)=>v+m,0));function u(v){for(const m of qr)if(m.id!=="other"&&m.match(v))return m.id;return"other"}const f=te(()=>{let v=e.value;if(n.value){const m=n.value.toLowerCase();v=v.filter(x=>x.name.toLowerCase().includes(m)||(x.description||"").toLowerCase().includes(m))}return r.value&&(v=v.filter(m=>u(m.name)===r.value)),v}),p=te(()=>{const v=new Set;for(const m of e.value)v.add(u(m.name));return qr.filter(m=>v.has(m.id))}),g=te(()=>{const v=f.value,m={};for(const w of v){const _=u(w.name);m[_]||(m[_]=[]),m[_].push(w)}const x=[];for(const w of qr)m[w.id]&&m[w.id].length>0&&x.push({label:w.label,icon:w.icon,tools:m[w.id].sort((_,R)=>_.name.localeCompare(R.name))});return x});function y(v){i.value={...i.value,[v]:!i.value[v]}}async function k(){t.value=!0,s.value=null;try{const[v,m]=await Promise.all([Q.get("/api/tools"),Q.get("/api/tools/stats").catch(()=>({}))]);e.value=v,a.value=m||{};const x=Object.values(m||{}).filter(w=>w>0).sort((w,_)=>w-_)}catch(v){s.value=v.message}t.value=!1}function E(){k()}return Ye(()=>{k()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:g,usedCategories:p,truncate:Pc,toggleExpand:y,refresh:E}}};function mw(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function vw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const bw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),g=h(!1),y=h(null),k=h(null),E=h(!1),v=te(()=>e.value.length),m=te(()=>e.value.reduce((B,re)=>B+(re.execution_count||0),0)),x=te(()=>e.value.reduce((B,re)=>B+L(re.code),0)),w=te(()=>{if(!l.value)return e.value;const B=l.value.toLowerCase();return e.value.filter(re=>re.name.toLowerCase().includes(B)||(re.description||"").toLowerCase().includes(B))}),_=te(()=>u.value?u.value.split(`
`).length:0),R=te(()=>{const B=Math.max(_.value,1);return Array.from({length:B},(re,_e)=>_e+1).join(`
`)}),T=te(()=>{const B=u.value.trim();return B?B.includes("SKILL_DEFINITION")?B.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(B){return mw(B)}function L(B){return B?B.split(`
`).length:0}function H(B){return vw(B)}function M(B){n.value={...n.value,[B]:!n.value[B]}}async function N(B){try{await navigator.clipboard.writeText(B);const re=e.value.find(_e=>_e.code===B);re&&(r.value=re.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function Z(B){if(B.key==="Tab"){B.preventDefault();const re=B.target,_e=re.selectionStart,V=re.selectionEnd;u.value=u.value.substring(0,_e)+"    "+u.value.substring(V),Ot(()=>{re.selectionStart=re.selectionEnd=_e+4})}}function ne(B){const re=B.target.previousElementSibling;re&&(re.scrollTop=B.target.scrollTop)}async function F(){t.value=!0,s.value=null;try{e.value=await Q.get("/api/skills")}catch(B){s.value=B.message}t.value=!1}async function O(B){i.value=B,delete a.value[B],a.value={...a.value};try{const re=await Q.post(`/api/skills/${encodeURIComponent(B)}/test`);a.value={...a.value,[B]:re}}catch(re){a.value={...a.value,[B]:{result:re.message,is_error:!0}}}i.value=null}function A(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function q(B){o.value=!0,c.value="edit",d.value=B.name,u.value=B.code||"",f.value=null,p.value=null}function K(){o.value=!1,f.value=null,p.value=null}async function ee(){f.value=null,p.value=null;const B=d.value.trim(),re=u.value.trim();if(!B){f.value="Name is required";return}if(!re){f.value="Code is required";return}g.value=!0;try{c.value==="create"?(await Q.post("/api/skills",{name:B,code:re}),p.value="Skill created successfully"):(await Q.put(`/api/skills/${encodeURIComponent(B)}`,{code:re}),p.value="Skill updated successfully"),await F(),setTimeout(()=>{o.value=!1},800)}catch(_e){f.value=_e.message}g.value=!1}function ie(B){k.value=B}async function U(){if(k.value){E.value=!0;try{await Q.del(`/api/skills/${encodeURIComponent(k.value)}`),await F()}catch(B){Te.error(`Failed to delete skill: ${B.message||"unknown error"}`)}E.value=!1,k.value=null}}return Ye(()=>{F()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:g,editorRef:y,deleteTarget:k,deleting:E,enabledCount:v,totalExecutions:m,totalLines:x,displayedSkills:w,editLineCount:_,editorLineNums:R,editValidation:T,highlight:C,truncate:Pc,formatTs:ra,countLines:L,getLineNumbers:H,toggleCode:M,copyCode:N,handleEditorKey:Z,syncScroll:ne,fetchSkills:F,testSkill:O,showCreate:A,editSkill:q,cancelEdit:K,saveSkill:ee,confirmDelete:ie,doDelete:U}}};function yw(e,t){if(!e||!t)return Eu(e);const s=Eu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const xw={template:`
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
              <div v-if="loadingChunks === (s.source || s.name || s)" class="kb-chunk-loading">
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),g=h(null),y=h(null);let k=null;const E=h(null),v=h(!1),m=h({}),x=h({}),w=h(null),_=h(null),R=te(()=>e.value.reduce((A,q)=>A+(q.chunks||0),0)),T=te(()=>new Set(e.value.map(q=>q.uploader).filter(Boolean)).size);function C(A,q){const K=x.value[q];if(!K||K.length===0)return 0;const ee=Math.max(...K.map(ie=>ie.char_count||0));return ee===0?0:Math.round(A.char_count/ee*100)}async function L(){t.value=!0,s.value=null;try{const A=await Q.get("/api/knowledge");e.value=Array.isArray(A)?A:[]}catch(A){s.value=A.message}t.value=!1}async function H(A){if(m.value[A]){m.value[A]=!1,_.value=null;return}if(m.value[A]=!0,!(x.value[A]||w.value===A)){w.value=A;try{const q=await Q.get(`/api/knowledge/${encodeURIComponent(A)}/chunks`);x.value[A]=Array.isArray(q)?q:[]}catch(q){x.value[A]=[],Te.error(`Failed to load chunks: ${q.message}`)}w.value=null}}async function M(){const A=n.value.trim();if(A){i.value=!0,r.value=null,l.value=A;try{const q=await Q.get(`/api/knowledge/search?q=${encodeURIComponent(A)}`);a.value=Array.isArray(q)?q:[]}catch(q){a.value=[],r.value=q.message||"Search failed"}i.value=!1}}function N(){a.value=null,n.value="",r.value=null}async function Z(){u.value=null,f.value=null;const A=c.value.trim(),q=d.value.trim();if(!A){u.value="Source name is required";return}if(!q){u.value="Content is required";return}p.value=!0;try{const K=await Q.post("/api/knowledge",{source:A,content:q});f.value=`Ingested ${K.chunks||0} chunks from "${A}"`,c.value="",d.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(K){u.value=K.message}p.value=!1}async function ne(A){g.value=A,y.value=null,k&&(clearTimeout(k),k=null);try{const q=await Q.post(`/api/knowledge/${encodeURIComponent(A)}/reingest`);y.value={source:A,error:!1,message:`Re-ingested ${q.chunks||0} chunks`},delete x.value[A],await L(),k=setTimeout(()=>{y.value=null,k=null},3e3)}catch(q){y.value={source:A,error:!0,message:q.message}}g.value=null}function F(A){E.value=A}async function O(){if(E.value){v.value=!0;try{await Q.del(`/api/knowledge/${encodeURIComponent(E.value)}`),delete x.value[E.value],await L()}catch(A){Te.error(`Failed to delete source: ${A.message||"unknown error"}`)}v.value=!1,E.value=null}}return Ye(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:g,reingestResult:y,deleteTarget:E,deleting:v,expanded:m,sourceChunks:x,loadingChunks:w,selectedChunk:_,totalChunks:R,uploaderCount:T,truncate:Pc,formatTs:ra,highlightTerms:yw,chunkBarWidth:C,fetchSources:L,toggleSource:H,doSearch:M,clearSearch:N,doIngest:Z,doReingest:ne,confirmDelete:F,doDelete:O}}},_w={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),g=h(!1),y=h(null),k=h(null),E=h(new Set),v=h(null),m=h(!1),x=h(!1),w=te(()=>e.value.reduce((ie,U)=>ie+U.count,0)),_=te(()=>E.value.size);function R(ie){const U=t.value[ie];if(!U)return[];if(!l.value.trim())return U;const B=l.value.trim().toLowerCase();return U.filter(re=>re.key.toLowerCase().includes(B)||re.value&&re.value.toLowerCase().includes(B))}function T(ie,U){return E.value.has(ie+"/"+U)}function C(ie,U){const B=ie+"/"+U,re=new Set(E.value);re.has(B)?re.delete(B):re.add(B),E.value=re}function L(ie){const U=t.value[ie];return!U||U.length===0?!1:U.every(B=>E.value.has(ie+"/"+B.key))}function H(ie,U){const B=t.value[ie];if(!B)return;const re=new Set(E.value);for(const _e of B){const V=ie+"/"+_e.key;U?re.add(V):re.delete(V)}E.value=re}async function M(){s.value=!0,n.value=null;try{const ie=await Q.get("/api/memory");e.value=Object.entries(ie).map(([U,B])=>({name:U,keys:B.keys||[],count:B.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function N(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const U=e.value.find(re=>re.name===ie);if(!U||t.value[ie]||i.value===ie)return;i.value=ie;let B;try{const _e=(await Q.get(`/api/memory/${encodeURIComponent(ie)}`)).entries||{};B=U.keys.map(V=>Object.prototype.hasOwnProperty.call(_e,V)?{key:V,value:_e[V]||"",failed:!1}:{key:V,value:"",failed:!0,error:"Not found in scope"})}catch(re){B=U.keys.map(_e=>({key:_e,value:"",failed:!0,error:re.message||"Failed to load"}))}t.value[ie]=B,i.value=null}function Z(ie,U,B){f.value=ie+"/"+U,p.value=B}async function ne(ie,U){g.value=!0,y.value=null;try{await Q.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(U)}`,{value:p.value});const B=t.value[ie];if(B){const re=B.find(_e=>_e.key===U);re&&(re.value=p.value)}f.value=null}catch(B){y.value=`Failed to save: ${B.message||"unknown error"}`}g.value=!1}async function F(ie,U){try{await navigator.clipboard.writeText(U.value),k.value=ie+"/"+U.key,setTimeout(()=>{k.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const ie=o.value.scope.trim(),U=o.value.key.trim(),B=o.value.value.trim();if(!ie){d.value="Scope is required";return}if(!U){d.value="Key is required";return}if(!B){d.value="Value is required";return}c.value=!0;try{await Q.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(U)}`,{value:B}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await M(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(re){d.value=re.message}c.value=!1}function A(ie,U){v.value={scope:ie,key:U}}async function q(){if(!v.value)return;m.value=!0,y.value=null;const{scope:ie,key:U}=v.value;try{await Q.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(U)}`);const B=t.value[ie];B&&(t.value[ie]=B.filter(V=>V.key!==U));const re=e.value.find(V=>V.name===ie);re&&(re.count--,re.keys=re.keys.filter(V=>V!==U));const _e=new Set(E.value);_e.delete(ie+"/"+U),E.value=_e}catch(B){y.value=`Failed to delete: ${B.message||"unknown error"}`}m.value=!1,v.value=null}function K(){x.value=!0}async function ee(){m.value=!0,y.value=null;const ie=[];for(const U of E.value){const B=U.indexOf("/");ie.push({scope:U.slice(0,B),key:U.slice(B+1)})}try{await Q.post("/api/memory/bulk-delete",{entries:ie}),E.value=new Set,t.value={},await M()}catch(U){y.value=`Bulk delete failed: ${U.message||"unknown error"}`}m.value=!1,x.value=!1}return Ye(()=>{M()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:g,actionError:y,copied:k,selected:E,selectedCount:_,totalEntries:w,deleteTarget:v,deleting:m,showBulkDelete:x,fetchMemory:M,toggleScope:N,startEdit:Z,doEdit:ne,copyValue:F,doAdd:O,confirmDelete:A,doDelete:q,confirmBulkDelete:K,doBulkDelete:ee,isSelected:T,toggleSelect:C,isScopeAllSelected:L,toggleSelectAll:H,filteredEntries:R}}},ww={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=te(()=>[...new Set(e.value.map(k=>k.category))].sort()),o=te(()=>{const y={};return e.value.forEach(k=>{y[k.category]=(y[k.category]||0)+1}),y}),c=te(()=>a.value?e.value.filter(y=>y.category===a.value):e.value);function d(y){return y==="correction"?"badge-warning":y==="operational"?"badge-info":y==="preference"?"badge-success":"badge-info"}function u(y){i.value=y.key,l.value=y.content}async function f(y){try{await Q.put("/api/learned/"+encodeURIComponent(y),{content:l.value}),i.value=null,Te.success("Entry updated"),await g()}catch(k){Te.error(k.message||"Failed to save entry")}}async function p(y){if(await bs({title:"Delete learned entry",message:`Delete "${y}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await Q.del("/api/learned/"+encodeURIComponent(y)),Te.success("Entry deleted"),await g()}catch(E){Te.error(E.message||"Failed to delete entry")}}async function g(){s.value=!0,n.value=null;try{const y=await Q.get("/api/learned");e.value=y.entries||[],t.value={last_reflection:y.last_reflection,count:y.count}}catch(y){n.value=y.message}s.value=!1}return Ye(g),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ra,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:g}}},mg=[{id:"tools",label:"Tools",component:gw},{id:"skills",label:"Skills",component:bw},{id:"knowledge",label:"Knowledge",component:xw},{id:"memory",label:"Memory",component:_w},{id:"learned",label:"Learned",component:ww}],kw={components:{TabbedPage:kr},setup(){return{tabs:mg}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Sw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Tw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Cw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ew={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=te(()=>e.value.components||[]),l=te(()=>Cw[e.value.overall]||"text-gray-400"),r=te(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=te(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Sw[_]||"text-gray-400"}function d(_){return Tw[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function f(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function p(_){return _.replace(/_/g," ").replace(/\b\w/g,R=>R.toUpperCase())}function g(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function y(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function k(){a.value=!0;try{e.value=await Q.get("/api/health/components"),s.value=null,n.value=!0}catch(_){s.value=_.message}finally{t.value=!1,a.value=!1}}function E(){t.value=!0,s.value=null,k()}let v=null,m=!1;function x(){m||(m=!0,k(),v||(v=setInterval(k,3e4)))}function w(){m&&(m=!1,v&&(clearInterval(v),v=null))}return Ye(x),As(x),Rs(w),_t(w),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:f,formatName:p,formatTime:g,formatNumber:y,fetchHealth:k,retry:E}}},Aw={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=te(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=te(()=>{if(!i.value)return[];const k=i.value,E=k.storage_total_bytes||1;return[{label:"Session Persistence",mb:k.sessions.persist_dir.total_mb,bytes:k.sessions.persist_dir.total_bytes,files:k.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(k.sessions.persist_dir.total_bytes/E*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:k.knowledge.db_file.total_mb,bytes:k.knowledge.db_file.total_bytes,files:k.knowledge.db_file.file_count,pct:Math.min(100,Math.round(k.knowledge.db_file.total_bytes/E*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:k.trajectories.message_dir.total_mb,bytes:k.trajectories.message_dir.total_bytes,files:k.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.message_dir.total_bytes/E*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:k.trajectories.agent_dir.total_mb,bytes:k.trajectories.agent_dir.total_bytes,files:k.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(k.trajectories.agent_dir.total_bytes/E*100)),color:"res-bar-amber"}]});async function d(){try{const k=await Q.get("/api/resource-usage");i.value=k,t.value=null,s.value=!0}catch(k){t.value=k.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function f(){e.value=!0,t.value=null,d()}let p=!1;function g(){p||(p=!0,d(),l||(l=setInterval(d,3e4)))}function y(){p&&(p=!1,l&&(clearInterval(l),l=null))}return Ye(g),As(g),Rs(y),_t(y),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:dg,refresh:u,retry:f}}},Rw=["INFO","WARNING","ERROR"],Iw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Gr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Ow=[50,100,200,500],Lw={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(Ze.state||"disconnected"),c=te(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,g=Rw,y=Iw,k=Gr,E=h("all"),v=h(""),m=h([]),x=h(!1),w=h(""),_=h([]);function R(){try{const $=localStorage.getItem("odin-log-presets");$&&(m.value=JSON.parse($))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=te(()=>a.value!==""||i.value.trim()!==""||v.value!==""),L=te(()=>{const $=Gr.find(le=>le.value===v.value);return $?$.label:""}),H=te(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch($){return $.message}}),M=24,N=te(()=>{if(K.value.length===0)return[];const $=[],le=new Date,Oe=3600*1e3;for(let nt=M-1;nt>=0;nt--){const pt=new Date(le.getTime()-(nt+1)*Oe),ns=new Date(le.getTime()-nt*Oe);$.push({start:pt,end:ns,label:O(pt,ns),shortLabel:ns.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const nt of K.value){if(!nt._time)continue;const pt=nt._time.getTime();for(const ns of $)if(pt>=ns.start.getTime()&&pt<ns.end.getTime()){ns.total++,nt.level==="ERROR"?ns.errors++:nt.level==="WARNING"?ns.warnings++:ns.info++;break}}return $}),Z=te(()=>{let $=1;for(const le of N.value)le.total>$&&($=le.total);return $}),ne=te(()=>{if(N.value.length===0)return"";const $=K.value.map(nt=>nt._time&&nt._time.getTime()).filter(Boolean);if($.length===0)return"";const le=new Date(Math.min(...$));return`${K.value.length} shown, oldest ${le.toLocaleTimeString()}`}),F=te(()=>Math.ceil(M/8));function O($,le){const Oe={hour:"2-digit",minute:"2-digit"};return $.toLocaleTimeString([],Oe)+" - "+le.toLocaleTimeString([],Oe)}function A($,le){return!le||!$?"0px":Math.max(2,$/le*100)+"%"}function q($){const le=K.value.findIndex(Oe=>Oe._time&&Oe._time.getTime()>=$.start.getTime()&&Oe._time.getTime()<$.end.getTime());if(le>=0&&d.value){const Oe=d.value.querySelectorAll(".log-line");Oe[le]&&(Oe[le].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const K=te(()=>{let $=t.value;if(a.value&&($=$.filter(le=>(le.level||"INFO")===a.value)),v.value){const le=Gr.find(Oe=>Oe.value===v.value);if(le&&le.seconds){const Oe=new Date(Date.now()-le.seconds*1e3);$=$.filter(nt=>nt._time&&nt._time>=Oe)}}if(i.value&&!H.value)if(l.value)try{const le=new RegExp(i.value,"i");$=$.filter(Oe=>{const nt=Oe.text||Oe.raw||"",pt=Oe.tool||"";return le.test(nt)||le.test(pt)})}catch{}else{const le=i.value.toLowerCase();$=$.filter(Oe=>{const nt=(Oe.text||Oe.raw||"").toLowerCase(),pt=(Oe.tool||"").toLowerCase();return nt.includes(le)||pt.includes(le)})}return $});function ee($){if($.type==="log"&&$.line)try{const le=typeof $.line=="string"?JSON.parse($.line):$.line,Oe=le.timestamp?new Date(le.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String($.line),tool:"",raw:String($.line)}}if($.payload){const le=$.payload,Oe=le.timestamp?new Date(le.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}return typeof $=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:$,tool:"",raw:$}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify($),tool:"",raw:null}}function ie($){const le=ee($);if(s.value){_.value.push(le);return}U(le)}function U($){t.value.push($),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Ot(()=>B())}function B($=!1){const le=d.value;le&&le.scrollTo({top:le.scrollHeight,behavior:$?"smooth":"instant"})}function re(){n.value=!0,u.value=!1,Ot(()=>B(!0))}const _e=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function V(){const $=d.value;if(!$)return;const le=$.scrollHeight-$.scrollTop-$.clientHeight<40;u.value=!n.value&&!le&&t.value.length>0,me.value&&fe()}function fe(){const $=d.value;!$||!n.value||$.scrollHeight-$.scrollTop-$.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function de(){n.value&&requestAnimationFrame(fe)}function xe($){_e.has($.key)&&de()}const me=h(!1);function Be(){n.value&&(me.value=!0,requestAnimationFrame(fe))}function b(){me.value&&(me.value=!1,fe())}function I(){n.value&&(u.value=!1,Ot(()=>B()))}function P(){if(s.value=!s.value,!s.value&&_.value.length>0){for(const $ of _.value)U($);_.value=[]}}function X(){t.value=[],_.value=[],u.value=!1}function J(){let $;e.value==="search"?$=qe.value.map(pt=>{const ns=pt.error?"ERROR":"INFO",ps=pt.tool_name?`[${pt.tool_name}] `:"";return`${pt.timestamp||""} ${ns} ${ps}${pt.result_summary||pt.message||""}`}).join(`
`):$=K.value.map(pt=>`${pt.ts} ${pt.level} ${pt.text}`).join(`
`);const le=new Blob([$],{type:"text/plain"}),Oe=URL.createObjectURL(le),nt=document.createElement("a");nt.href=Oe,nt.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,nt.click(),URL.revokeObjectURL(Oe)}function Y($,le){const Oe=`${$.ts} ${$.level} ${$.text||$.raw||""}`;navigator.clipboard.writeText(Oe).then(()=>{f.value=le,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function pe($){a.value=a.value===$?"":$,E.value="all"}function ce($){return $.level==="ERROR"?"log-line-error":$.level==="WARNING"?"log-line-warning":"text-gray-300"}function oe($){return $==="ERROR"?"text-red-500 font-semibold":$==="WARNING"?"text-yellow-500":"text-blue-500"}function se($){return $==="ERROR"?"log-chip-error":$==="WARNING"?"log-chip-warning":"log-chip-info"}function ye($){E.value=$.id;const le=$.filters;a.value=le.level||"",v.value=le.timeRange||"",i.value=le.text||"",le.levels&&(a.value=le.levels[0]||""),le.hasToolName&&(i.value="")}function he($){E.value=$.id,a.value=$.filters.level||"",v.value=$.filters.timeRange||"",i.value=$.filters.text||""}function ge(){if(!w.value.trim())return;const $={id:"custom-"+Date.now(),name:w.value.trim(),filters:{level:a.value,timeRange:v.value,text:i.value}};m.value=[...m.value,$],T(),x.value=!1,w.value=""}function ke($){m.value=m.value.filter(le=>le.id!==$),T(),E.value===$&&(E.value="all")}const Ce=h("all"),Ie=h(""),Me=h(""),Fe=h(""),Ve=h(""),st=h(""),j=h(100),we=Ow,Le=h(!1),De=h(!1),Ke=h(""),qe=h([]),ht=h(null),ss=h(null);function Is(){e.value="search",ht.value||Ps()}async function Ps(){try{ht.value=await Q.get("/api/logs/stats")}catch{}}function Fs(){const $=st.value;if(!$){Fe.value="",Ve.value="";return}const Oe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[$];if(Oe){const nt=new Date(Date.now()-Oe*1e3);Fe.value=us(nt),Ve.value=""}}function us($){const le=Oe=>String(Oe).padStart(2,"0");return`${$.getFullYear()}-${le($.getMonth()+1)}-${le($.getDate())}T${le($.getHours())}:${le($.getMinutes())}`}function G($){if(!$)return"";const le=new Date($);return isNaN(le.getTime())?"":le.toISOString()}async function Ae(){Le.value=!0,Ke.value="",De.value=!0,ss.value=null;try{const $=new URLSearchParams;Ce.value&&Ce.value!=="all"&&$.set("level",Ce.value),Ie.value&&$.set("tool",Ie.value),Me.value&&$.set("q",Me.value);const le=G(Fe.value),Oe=G(Ve.value);le&&$.set("start",le),Oe&&$.set("end",Oe),$.set("limit",String(j.value));const nt=await Q.get(`/api/logs/search?${$.toString()}`);qe.value=nt.entries||[]}catch($){Ke.value=$.message||"Search failed",qe.value=[]}finally{Le.value=!1}}function fs(){Ce.value="all",Ie.value="",Me.value="",Fe.value="",Ve.value="",st.value="",j.value=100,qe.value=[],De.value=!1,Ke.value="",ss.value=null}function Zs($){ss.value=ss.value===$?null:$}function ca($){if(!$.timestamp)return"";try{return new Date($.timestamp).toLocaleString()}catch{return $.timestamp}}function wn($){return $.type==="web_action"?`${$.status||""} (${$.execution_time_ms||0}ms)`:($.result_summary||"").slice(0,200)}function Js($){return $.error?"log-line-error":"text-gray-300"}function D($){try{return JSON.stringify($,null,2)}catch{return String($)}}let z=null,ae=null,Se=!1;function Ee(){Se||(Se=!0,Ze.subscribe("logs",ie),r.value=Ze.connected,o.value=Ze.state||"disconnected",z=Ze.onStateChange,ae=($,le)=>{o.value=$,r.value=$==="connected",z&&z($,le)},Ze.onStateChange=ae)}function Et(){Se&&(Se=!1,Ze.unsubscribe("logs",ie),Ze.onStateChange===ae&&(Ze.onStateChange=z),ae=null,z=null)}return Ye(()=>{R(),window.addEventListener("pointerup",b),window.addEventListener("pointercancel",b)}),As(Ee),Rs(Et),_t(()=>{Et(),window.removeEventListener("pointerup",b),window.removeEventListener("pointercancel",b)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:K,pauseBuffer:_,showJumpBottom:u,copiedIndex:f,regexError:H,levels:g,logPresets:y,timeRanges:k,timeRange:v,activeLogPreset:E,customLogPresets:m,showSaveLogPreset:x,newLogPresetName:w,hasActiveLogFilters:C,timeRangeLabel:L,timelineBuckets:N,timelineMax:Z,timelineSpanLabel:ne,timelineLabelSkip:F,togglePause:P,clearLogs:X,exportLogs:J,logLineClass:ce,levelClass:oe,levelChipClass:se,toggleLevel:pe,copyLine:Y,jumpToBottom:re,onScroll:V,onUserScrollIntent:de,onUserScrollKey:xe,onAutoScrollToggle:I,onPointerDown:Be,applyLogPreset:ye,applyCustomLogPreset:he,saveLogCustomPreset:ge,removeLogCustomPreset:ke,segmentHeight:A,jumpToTimelineBucket:q,searchLevel:Ce,searchTool:Ie,searchKeyword:Me,searchStart:Fe,searchEnd:Ve,searchTimePreset:st,searchLimit:j,searchLimits:we,searching:Le,searchRan:De,searchError:Ke,searchResults:qe,searchStats:ht,expandedSearch:ss,switchToSearch:Is,runSearch:Ae,clearSearchFilters:fs,toggleSearchExpand:Zs,formatSearchTs:ca,searchEntryText:wn,searchLogLineClass:Js,formatJson:D,applySearchTimePreset:Fs}}},vg="••••••••",Nw={timezone:{apply_mode:"restart",description:"Locale and scheduling defaults used across Odin."},discord:{apply_mode:"live_read",description:"Global Discord defaults. Guild and channel overrides take precedence."},llm_provider:{apply_mode:"live_apply",owner:"llm",description:"Active language-model provider and failover ownership."},openai_codex:{apply_mode:"live_apply",owner:"llm",description:"Codex models, reasoning, transport, and pool behaviour."},ollama:{apply_mode:"restart",owner:"llm",description:"Local or remote Ollama provider settings."},kimi:{apply_mode:"restart",owner:"llm",description:"Kimi provider settings and request limits."},context:{apply_mode:"restart",description:"System-prompt sources and prompt-budget controls."},sessions:{apply_mode:"restart",description:"Conversation persistence, retention, and history limits."},tools:{apply_mode:"restart",description:"Execution policy, hosts, timeouts, pools, and recovery."},logging:{apply_mode:"restart",description:"Runtime log verbosity and storage policy."},usage:{apply_mode:"activation_required",description:"Usage accounting and durable history storage."},webhook:{apply_mode:"restart",description:"Inbound webhook listener and authentication policy."},learning:{apply_mode:"restart",description:"Reflection, consolidation, and learned-context limits."},observability:{apply_mode:"live_read",description:"Metrics, tracing, and failure-classification controls."},email:{apply_mode:"restart",description:"SMTP and IMAP behaviour for email tools."},search:{apply_mode:"restart",description:"Knowledge and history search backends."},browser:{apply_mode:"restart",description:"Browser automation limits and viewport defaults."},permissions:{apply_mode:"restart",description:"Default and per-user execution policy."},comfyui:{apply_mode:"live_read",description:"ComfyUI image backend connection settings."},image:{apply_mode:"live_read",description:"Image routing and native generation policy."},web:{apply_mode:"restart",description:"Management API listener, authentication, and sessions."},attachments:{apply_mode:"live_read",description:"Attachment limits, paths, and cleanup policy."},personality:{apply_mode:"live_read",owner:"personality",description:"Response identity, style, and personality presets."},reaction_triggers:{apply_mode:"activation_required",owner:"reaction_triggers",description:"Discord reaction event automation."},message_triggers:{apply_mode:"activation_required",owner:"message_triggers",description:"Discord message event automation."},mcp:{apply_mode:"activation_required",owner:"mcp",description:"Model Context Protocol servers and tool publication."},slack:{apply_mode:"restart",description:"Slack destinations and internal alert forwarding."},issue_tracker:{apply_mode:"activation_required",owner:"issue_tracker",description:"Issue tracker provider and tool lifecycle."},audit:{apply_mode:"restart",description:"Audit signing, verification, and retention."},agents:{apply_mode:"live_for_new_work",description:"Spawned-agent budgets, inheritance, and tree limits."},grafana_alerts:{apply_mode:"activation_required",owner:"grafana_alerts",description:"Grafana alert intake, routing, and remediation."},outbound_webhooks:{apply_mode:"live_apply",owner:"outbound_webhooks",description:"Outbound event targets, delivery, and safety policy."},graceful_degradation:{apply_mode:"activation_required",description:"Subsystem failure thresholds and request guarding."},llm_recovery:{apply_mode:"restart",description:"Provider recovery, breaker, and retry policy."},turn_state:{apply_mode:"restart",description:"Durable turn checkpoints, expiry, and resume behaviour."}},Ru={timezone:{label:"Timezone",description:"Timezone used in prompts and scheduled-time parsing.",consumers:[{name:"Prompt context",apply_mode:"live_read",detail:"Future prompts read the configured value."},{name:"Time parser",apply_mode:"restart",detail:"The parser currently captures the boot value."}],restart_reason:"The scheduling parser captures timezone during startup."},"discord.token":{owner:"secrets",sensitivity:"sensitive",description:"Write-only Discord bot credential."},"discord.allowed_users":{description:"Global allowlist of Discord user IDs. An empty list allows all users."},"discord.channels":{description:"Global allowlist of Discord channel IDs. An empty list allows all channels."},"discord.require_mention":{description:"Require a mention by default unless a guild or channel override says otherwise."},"discord.respond_to_bots":{description:"Allow replies to bot-authored messages by default."},"llm_provider.active_provider":{enum:["codex","ollama","kimi"],description:"Provider used for new primary requests."},"openai_codex.enabled":{apply_mode:"live_apply",description:"Enable or disable the primary Codex client through the dedicated Codex reload path."},"openai_codex.model":{apply_mode:"live_apply",description:"Primary Codex model. Spawned agents may inherit it directly; chat and loops require a Codex reload.",consumers:[{name:"Spawned agents inheriting the main model",apply_mode:"live_read",detail:"Future agent generations read the configured model at call time."},{name:"Chat and autonomous loops",apply_mode:"live_apply",detail:"The dedicated Codex endpoint reloads the live client."}]},"openai_codex.max_tokens":{apply_mode:"live_apply",constraints:{minimum:1,maximum:128e3},unit:"tokens",description:"Maximum Codex response tokens; requires the dedicated Codex reload path."},"openai_codex.reasoning_effort":{apply_mode:"live_apply",description:"Main Codex reasoning effort; requires the dedicated Codex reload path."},"openai_codex.agent_reasoning_effort":{apply_mode:"live_read",description:"Reasoning policy for spawned-agent generations; future generations read it at call time."},"openai_codex.agent_model":{apply_mode:"live_read",description:"Model policy for spawned-agent generations; future generations read it at call time."},"openai_codex.credentials_path":{owner:"secrets",sensitivity:"sensitive",apply_mode:"restart",description:"Write-only Codex credential-store path; an existing client cannot switch stores live.",restart_reason:"The credential pool is constructed from this path when the Codex client starts."},"openai_codex.request_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Whole-request timeout; requires the dedicated Codex reload path."},"openai_codex.stream_stall_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Maximum silent-stream interval; requires the dedicated Codex reload path."},"openai_codex.retry.max_retries":{apply_mode:"live_apply",description:"Retry-attempt ceiling; requires the dedicated Codex reload path."},"openai_codex.retry.base_delay":{apply_mode:"live_apply",unit:"seconds",description:"Initial retry delay; requires the dedicated Codex reload path."},"openai_codex.retry.max_delay":{apply_mode:"live_apply",unit:"seconds",description:"Maximum retry delay; requires the dedicated Codex reload path."},"openai_codex.connection_pool.max_connections":{apply_mode:"restart",description:"Maximum Codex transport connections.",restart_reason:"Connection-pool sizing is fixed when the live client transport is constructed."},"openai_codex.connection_pool.keepalive_timeout":{apply_mode:"restart",unit:"seconds",description:"Codex connection keepalive timeout.",restart_reason:"Connection-pool keepalive policy is fixed when the live client transport is constructed."},"openai_codex.context_compression.enabled":{apply_mode:"restart",description:"Enable context compression for chat and agent tool loops.",restart_reason:"The context-compressor holder is constructed at startup and has no live apply path."},"openai_codex.context_compression.max_context_chars":{apply_mode:"restart",unit:"characters",description:"Context size at which compression begins.",restart_reason:"The context-compressor holder retains its startup configuration."},"openai_codex.context_compression.keep_recent_iterations":{apply_mode:"restart",unit:"iterations",description:"Recent tool iterations preserved during compression.",restart_reason:"The context-compressor holder retains its startup configuration."},"logging.level":{enum:["DEBUG","INFO","WARNING","ERROR","CRITICAL"],description:"Minimum runtime log level."},"browser.default_timeout_ms":{constraints:{minimum:1e3},unit:"ms",description:"Default browser operation timeout."},"browser.viewport_width":{constraints:{minimum:100,maximum:7680},unit:"px"},"browser.viewport_height":{constraints:{minimum:100,maximum:4320},unit:"px"},"sessions.max_history":{constraints:{minimum:1,maximum:1e4},unit:"messages"},"sessions.max_age_hours":{constraints:{minimum:1},unit:"hours"},"tools.command_timeout_seconds":{constraints:{minimum:10,maximum:3600},unit:"seconds"},"agents.max_children_per_agent":{apply_mode:"activation_required",description:"Child limit adopted by newly spawned parent agents after explicit activation.",activation_policy:"Explicitly apply the configured limit after reviewing worst-case tree breadth."},"context.max_system_prompt_tokens":{apply_mode:"activation_required",description:"Optional hard budget for future assembled system prompts.",activation_policy:"Preview mandatory prompt usage and omissions before applying the budget."},"usage.directory":{apply_mode:"activation_required",description:"Target for durable usage history; currently no durable store is active.",activation_policy:"Validate the path and explicitly enable durable usage history."},"slack.forward_alerts":{apply_mode:"activation_required",description:"Forward normalized internal alerts to tested Slack destinations.",activation_policy:"Requires an effective notifier, tested destination, and activation receipt."},"grafana_alerts.enabled":{apply_mode:"activation_required",description:"Adopt explicit Grafana processing control without changing legacy webhook behaviour on upgrade.",activation_policy:"Explicit adoption preserves working legacy-control installations."},"graceful_degradation.enabled":{apply_mode:"activation_required",description:"Allow subsystem guards to short-circuit calls while a dependency is unhealthy.",activation_policy:"Explicit adoption resolves the legacy always-on behaviour."}},Dw=["tools.enabled","tools.max_tool_iterations_chat","tools.max_tool_iterations_loop","learning.loop_reflection_enabled","turn_state.retention"],Mw=new Set(["token","api_token","api_key","password","secret","credentials_path","ssh_key_path","hmac_key","webhook_urls","headers","env"]);function ei(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Pw(e){return Array.isArray(e)?"array":e===null?"null":Number.isInteger(e)?"integer":typeof e=="number"?"number":typeof e=="boolean"?"boolean":typeof e=="object"?"object":"string"}function bg(e,t="",s=[]){if(e&&typeof e=="object"&&!Array.isArray(e)){const n=Object.entries(e);n.length===0&&t&&s.push([t,e]);for(const[a,i]of n)bg(i,t?`${t}.${a}`:a,s);return s}return t&&s.push([t,e]),s}function Fw(e){return e.split(".").some(s=>Mw.has(s))}function $w(e){return Ru[e]?Ru[e]:e.startsWith("mcp.servers.")&&(e.endsWith(".headers")||e.endsWith(".env"))?{owner:"secrets",sensitivity:"secret_container"}:e.startsWith("outbound_webhooks.targets.")&&e.endsWith(".secret")?{owner:"secrets",sensitivity:"sensitive"}:e.startsWith("outbound_webhooks.targets.")&&(e.endsWith(".scrub_secrets")||e.endsWith(".verify_ssl"))?{apply_mode:"activation_required",activation_policy:"Review this target and acknowledge the target-bound safety override."}:{}}function yg(e){return e==null||e===""?!1:Array.isArray(e)?e.length>0:typeof e=="object"?Object.keys(e).length>0:!0}function Iu(e,t){return t==="public"?e:e&&typeof e=="object"?Array.isArray(e)?[]:{}:yg(e)?vg:""}function Uw(e){return e.valid===!1?"invalid":e.pending_restart?"pending_restart":e.drift?"drift":e.apply_mode==="activation_required"||e.apply_mode==="dormant"?"dormant":"applied"}function Bw(e,t){const s=e.split(".")[0],n=e.split(".").at(-1),a=Nw[s]||{apply_mode:"restart",description:`${ei(s)} configuration.`},i=$w(e),l=i.sensitivity||(Fw(e)?"sensitive":"public");let r=i.apply_mode||a.apply_mode;Dw.some(p=>e===p||e.startsWith(`${p}.`))&&(r="live_read");const o=i.owner||a.owner||(l==="public"?"config":"secrets"),c=Iu(t,l),d=Iu(t,l),u=yg(t)&&!(l!=="public"&&t===vg),f={path:e,owner:o,label:i.label||ei(n),description:i.description||`${ei(n)} setting for ${ei(s)}.`,aliases:i.aliases||[],unit:i.unit||null,examples:i.examples||[],type:i.type||Pw(t),enum:i.enum||null,constraints:i.constraints||{},default:i.default??null,sensitivity:l,secret_route:l==="public"?null:`/api/config/secrets/${encodeURIComponent(e)}`,apply_mode:r,apply_handler:i.apply_handler||null,consumers:i.consumers||[],restart_reason:i.restart_reason||(r==="restart"?`${ei(s)} is currently constructed during startup.`:null),activation_policy:i.activation_policy||(r==="activation_required"?"Saving configuration does not enable this feature. Explicit activation is required.":null),desired:c,effective:d,configured:u,provenance:u?"config_file":"unset",valid:!0,validation_errors:[],pending_restart:!1,drift:!1,last_apply:null};return f.apply_state=Uw(f),f}function Hw(e){const t={applied:0,pending_restart:0,dormant:0,invalid:0,drift:0};for(const s of e)Object.hasOwn(t,s.apply_state)&&(t[s.apply_state]+=1);return t}function Vw(e){const t=bg(e||{}).map(([s,n])=>Bw(s,n));return{schema_version:1,revision:"local-fixture",generated_at:null,fields:t,status:{counts:Hw(t),persistence_error:null,unsafe_overrides:[],desired_revision:null,effective_revision:null}}}const Oa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["personality","context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],jw=[{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Activation required",short:"Dormant",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"}],zw={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Activation required",legacy_control:"Legacy control",dormant:"Not wired"},Ou={llm:{label:"LLM Config",href:"#/system?tab=llm",description:"This section has one canonical editor so provider changes use the safe switch and reload paths."},personality:{label:"Personality",href:"#/personality",description:"Personality presets and the active profile are managed on the dedicated Personality page."},discord:{label:"Discord overrides",href:"#/system?tab=discord",description:"Guild and channel overrides take precedence over these global defaults."},secrets:{label:"Secret controls",href:"#/system?tab=config",description:"Secret values are write-only and use dedicated set and clear flows."}},xg="odin_config_center_expanded_v1",_g="odin_config_center_category_v1",qw=50,Lu=e=>Promise.resolve(Vw(e));function Rn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function vi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function $s(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Gw(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Kw(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function wg(e,t){if(vi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Rn(t);const n={};for(const[a,i]of Object.entries(t)){const l=wg(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Ww(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=wg(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function kg(e,t,s,n){if(vi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)kg(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Zw(){try{const e=JSON.parse(localStorage.getItem(xg)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Jw(){try{const e=localStorage.getItem(_g);return Oa.some(t=>t.key===e)?e:Oa[0].key}catch{return Oa[0].key}}const Yw={template:`
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
            <span v-else class="cfgc-health-ok"><odin-icon name="success" :size="13" /> Drafts clear</span>
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

          <div v-if="meta.status?.persistence_error" class="cfgc-health-alert danger" role="alert">
            <odin-icon name="error" :size="16" />
            <div><strong>Persistence error</strong><span>{{ meta.status.persistence_error }}</span></div>
          </div>
          <div v-if="meta.status?.unsafe_overrides?.length" class="cfgc-health-alert warning" role="status">
            <odin-icon name="warning" :size="16" />
            <div><strong>Unsafe overrides effective</strong><span>{{ meta.status.unsafe_overrides.length }} item{{ meta.status.unsafe_overrides.length === 1 ? '' : 's' }} require review.</span></div>
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
              <span><b class="dormant">D</b> Activation</span>
            </div>
          </aside>

          <main class="cfgc-main">
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
                       :class="['cfgc-section', { modified: sectionChanged(section), editing: editingSection === section }]">
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
                    <span v-if="sectionHealthCount(section, 'dormant')" class="badge cfgc-badge-dormant">activation</span>
                    <span class="cfgc-field-count">{{ sectionFieldCount(section) }}</span>
                  </span>
                </button>

                <div v-if="isSectionExpanded(section)" :id="'cfgc-section-' + section" class="cfgc-section-body">
                  <div v-if="searchQuery && sectionSearchHits(section).length" class="cfgc-search-hits">
                    <span>Matched</span>
                    <button v-for="hit in sectionSearchHits(section).slice(0, 5)" :key="hit.path" type="button" @click="focusField(hit.path)">
                      {{ hit.label }} <code>{{ hit.path }}</code>
                    </button>
                    <span v-if="sectionSearchHits(section).length > 5">+{{ sectionSearchHits(section).length - 5 }} more</span>
                  </div>

                  <div v-if="sectionOwner(section)" class="cfgc-owner-card">
                    <span class="cfgc-owner-icon"><odin-icon :name="sectionOwner(section) === 'personality' ? 'personality' : 'external'" :size="18" /></span>
                    <div>
                      <strong>Managed in {{ ownerInfo(sectionOwner(section)).label }}</strong>
                      <p>{{ ownerInfo(sectionOwner(section)).description }}</p>
                    </div>
                    <a :href="ownerInfo(sectionOwner(section)).href" class="btn btn-ghost text-xs">
                      Open {{ ownerInfo(sectionOwner(section)).label }} <odin-icon name="external" :size="13" />
                    </a>
                  </div>

                  <div v-if="section === 'discord'" class="cfgc-owner-card compact">
                    <span class="cfgc-owner-icon"><odin-icon name="message" :size="18" /></span>
                    <div>
                      <strong>Global Discord defaults</strong>
                      <p>Guild and channel overrides take precedence. These values apply only where no narrower override exists.</p>
                    </div>
                    <a href="#/system?tab=discord" class="btn btn-ghost text-xs">Open overrides <odin-icon name="external" :size="13" /></a>
                  </div>

                  <div class="cfgc-section-actions" v-if="!sectionOwner(section)">
                    <div>
                      <strong>{{ editingSection === section ? 'Section draft open' : (sectionChanged(section) ? 'Draft ready for review' : 'No local draft') }}</strong>
                      <span v-if="sectionApplySummary(section)">{{ sectionApplySummary(section) }}</span>
                    </div>
                    <div class="flex gap-2">
                      <template v-if="editingSection === section">
                        <button type="button" class="btn btn-ghost text-xs" @click="cancelSectionDraft(section)">Cancel</button>
                        <button type="button" class="btn btn-primary text-xs" @click="finishSectionDraft(section)" :disabled="sectionHasErrors(section)">Done</button>
                      </template>
                      <button v-else type="button" class="btn btn-ghost text-xs" @click="startSectionDraft(section)">
                        <odin-icon name="edit" :size="13" /> {{ sectionChanged(section) ? 'Continue editing' : 'Edit section' }}
                      </button>
                    </div>
                  </div>

                  <div v-if="!sectionOwner(section)" class="cfgc-fields">
                    <div v-for="field in sectionEntries(section)" :key="field.path" :id="fieldId(field.path)"
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
                        <template v-if="field.sensitivity !== 'public'">
                          <div class="cfgc-write-only">
                            <span><odin-icon name="shield" :size="15" /> {{ field.configured ? 'Configured' : 'Not configured' }}</span>
                            <small>{{ field.provenance === 'unset' ? 'No credential source' : 'Source: ' + field.provenance.replace('_', ' ') }}</small>
                            <button type="button" class="btn btn-ghost text-xs" disabled title="Dedicated secret flows arrive in lane X1">Manage secret</button>
                          </div>
                        </template>

                        <template v-else-if="editingSection === section">
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

                          <input v-else-if="typeof field.value === 'number'" :id="fieldInputId(field.path)" class="hm-input font-mono"
                                 type="number" :min="field.constraints?.minimum" :max="field.constraints?.maximum"
                                 :value="field.value" @input="setFieldValue(field, Number($event.target.value))" />

                          <textarea v-else-if="typeof field.value === 'object' && field.value !== null"
                                    :id="fieldInputId(field.path)" class="hm-input cfgc-json-input font-mono" rows="6"
                                    :value="formatValue(field.value)" @change="setJsonFieldValue(field, $event.target.value)"></textarea>

                          <input v-else :id="fieldInputId(field.path)" class="hm-input font-mono" type="text"
                                 :value="field.value ?? ''" @input="setFieldValue(field, $event.target.value)" />
                          <p v-if="fieldError(field)" class="cfgc-field-error" role="alert">{{ fieldError(field) }}</p>
                          <p v-else-if="typeof field.value === 'object' && field.value !== null" class="cfgc-expert-note">Temporary expert JSON editor; typed controls replace this in U2.</p>
                        </template>

                        <template v-else>
                          <pre v-if="typeof field.value === 'object' && field.value !== null" class="cfgc-value-block">{{ formatValue(field.value) }}</pre>
                          <span v-else class="cfgc-value">{{ compactValue(field.value) }}</span>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>

        <div v-if="hasChanges || editingSection" class="cfgc-mobile-action-bar" aria-label="Draft actions">
          <button type="button" class="btn btn-ghost" @click="mobileCancel">Cancel</button>
          <button type="button" class="btn btn-ghost" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Review</button>
          <button type="button" class="btn btn-primary" @click="openReview" :disabled="!hasChanges || hasDraftErrors">Save</button>
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
                <strong>No runtime mutation occurs until this commit.</strong>
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(!1),a=h(null),i=h(null),l=h(""),r=h("all"),o=h(Jw()),c=h(Zw()),d=h({}),u=h(null),f=h(void 0),p=h(!1),g=h({}),y=h([]),k=h([]),E=h(!1),v=h(!1),m=h(!1);let x=null;const w=te(()=>{var D;return((D=t.value)==null?void 0:D.fields)||[]}),_=te(()=>new Map(w.value.map(D=>[D.path,D]))),R=te(()=>e.value?Object.keys(e.value).length:0),T=te(()=>w.value.length),C=te(()=>jw),L=te(()=>y.value.length>0),H=te(()=>k.value.length>0),M=te(()=>{if(!e.value)return[];const D=new Set(Oa.flatMap(Se=>Se.sections)),z=Oa.map(Se=>({...Se,sections:Se.sections.filter(Ee=>Object.hasOwn(e.value,Ee))})).filter(Se=>Se.sections.length),ae=Object.keys(e.value).filter(Se=>!D.has(Se));return ae.length&&z.push({key:"other",label:"Other",icon:"folder",sections:ae}),z}),N=te(()=>{if(!e.value)return[];const D=[];for(const[z,ae]of Object.entries(d.value))kg(e.value[z],ae,z,D);return D.filter(z=>!vi(z.oldVal,z.newVal)).map(z=>{const ae=U(z.path);return{...z,label:(ae==null?void 0:ae.label)||$s(z.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||fe(z.path.split(".")[0])}})}),Z=te(()=>N.value.length>0),ne=te(()=>N.value.length),F=te(()=>new Set(N.value.map(D=>D.path.split(".")[0])).size),O=te(()=>!!l.value||r.value!=="all"),A=te(()=>{const D={...g.value};for(const z of N.value){const ae=U(z.path),Se=we(ae,z.newVal);Se&&(D[z.path]=Se)}return D}),q=te(()=>Object.keys(A.value).length>0),K=te(()=>e.value?(O.value?M.value:M.value.filter(z=>z.key===o.value)).map(z=>({...z,sections:z.sections.filter(ae=>X(ae))})).filter(z=>z.sections.length):[]),ee=te(()=>{const D=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],z=new Map(D.map(ae=>[ae,[]]));for(const ae of N.value){const Se=z.has(ae.apply_mode)?ae.apply_mode:"restart";z.get(Se).push(ae)}return D.filter(ae=>z.get(ae).length).map(ae=>({key:ae,label:Ps(ae),entries:z.get(ae)}))}),ie=te(()=>N.value.filter(D=>D.apply_mode==="restart").length);function U(D){var Et;if(_.value.has(D))return _.value.get(D);const z=`${D}.`,ae=w.value.filter($=>$.path.startsWith(z));if(!ae.length)return null;const Se=ae.some($=>$.sensitivity!=="public")?"secret_container":"public",Ee=[...new Set(ae.map($=>$.apply_mode))];return{path:D,label:$s(D.split(".").at(-1)),description:ae[0].description,type:"object",sensitivity:Se,configured:ae.some($=>$.configured),provenance:((Et=ae.find($=>$.provenance!=="unset"))==null?void 0:Et.provenance)||"unset",apply_mode:Ee.length===1?Ee[0]:fe(D.split(".")[0]),constraints:{},enum:null}}function B(D){const z=`${D}.`;return w.value.filter(ae=>ae.path===D||ae.path.startsWith(z))}function re(D){return B(D).length}function _e(D){return $s(D)}function V(D){const z=B(D);if(!z.length)return`${$s(D)} configuration.`;const ae=z.find(Et=>Et.sensitivity==="public"&&Et.description)||z.find(Et=>Et.description),Se=(ae==null?void 0:ae.description)||"";return Se.match(/setting for (.+)\.$/i)?`${$s(D)} settings and runtime behaviour.`:Se}function fe(D){const z=[...new Set(B(D).map(ae=>ae.apply_mode))];return z.length===1?z[0]:z.includes("restart")?"restart":z.includes("activation_required")?"activation_required":z[0]||"restart"}function de(D){const z=[...new Set(B(D).map(ae=>Ps(ae.apply_mode)))];return z.length?z.length===1?z[0]:`Mixed apply behaviour: ${z.join(" · ")}`:""}function xe(D){const z=B(D),ae=z.map($=>$.owner).filter($=>$&&$!=="config"&&$!=="secrets");if(!ae.length)return null;const Se=ae.reduce(($,le)=>({...$,[le]:($[le]||0)+1}),{}),[Ee,Et]=Object.entries(Se).sort(($,le)=>le[1]-$[1])[0];return Et>=Math.max(1,z.length-1)&&Ou[Ee]?Ee:null}function me(D){return Ou[D]||{label:$s(D),href:"#/system?tab=config",description:"This feature uses a dedicated configuration and activation panel."}}function Be(D){var z;return Object.hasOwn(d.value,D)?d.value[D]:(z=e.value)==null?void 0:z[D]}function b(D){const z=Be(D);return(z&&typeof z=="object"&&!Array.isArray(z)?Object.entries(z).map(([Se,Ee])=>({key:Se,path:`${D}.${Se}`,value:Ee})):[{key:null,path:D,value:z}]).map(Se=>{const Ee=U(Se.path)||{};return{...Ee,...Se,label:Ee.label||(Se.key===null?_e(D):$s(Se.key)),description:Ee.description||`${$s(Se.key||D)} setting for ${$s(D)}.`,apply_mode:Ee.apply_mode||fe(D),sensitivity:Ee.sensitivity||"public",constraints:Ee.constraints||{},configured:Ee.configured??!0,provenance:Ee.provenance||"config_file"}})}function I(D,z){return[D.label,D.path,D.description,...D.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(z)}function P(D){const z=l.value.trim().toLowerCase();return z?B(D).filter(ae=>I(ae,z)):[]}function X(D){const z=B(D);if(r.value!=="all"&&!z.some(Se=>Se.apply_state===r.value))return!1;const ae=l.value.trim().toLowerCase();return!ae||`${_e(D)} ${D}`.toLowerCase().includes(ae)?!0:z.some(Se=>I(Se,ae))}function J(D,z){return B(D).filter(ae=>ae.apply_state===z).length}function Y(D){var z,ae,Se;return D==="all"?T.value:((Se=(ae=(z=t.value)==null?void 0:z.status)==null?void 0:ae.counts)==null?void 0:Se[D])??w.value.filter(Ee=>Ee.apply_state===D).length}function pe(D){const z=D.sections.flatMap(ae=>B(ae));return{fields:z.length,modified:N.value.filter(ae=>D.sections.includes(ae.path.split(".")[0])).length,pending_restart:z.filter(ae=>ae.apply_state==="pending_restart").length,invalid:z.filter(ae=>ae.apply_state==="invalid").length,dormant:z.filter(ae=>ae.apply_state==="dormant").length}}function ce(D){var z;return Object.hasOwn(d.value,D)&&!vi((z=e.value)==null?void 0:z[D],d.value[D])}function oe(D){return N.value.some(z=>z.path===D||z.path.startsWith(`${D}.`))}function se(D){o.value=D,l.value="",r.value="all";try{localStorage.setItem(_g,D)}catch{}}function ye(D){r.value=D}function he(){l.value="",r.value="all"}function ge(D){return c.value[D]?!0:!!(l.value&&!m.value&&X(D))}function ke(D){const z=!ge(D);m.value&&z?c.value={[D]:!0}:c.value={...c.value,[D]:z}}function Ce(){y.value.push(Rn(d.value)),y.value.length>qw&&y.value.shift(),k.value=[]}function Ie(D){u.value!==D&&(u.value=D,p.value=Object.hasOwn(d.value,D),f.value=p.value?Rn(d.value[D]):void 0,p.value||(d.value={...d.value,[D]:Rn(e.value[D])}),c.value=m.value?{[D]:!0}:{...c.value,[D]:!0})}function Me(D){if(!De(D)){if(vi(d.value[D],e.value[D])){const z={...d.value};delete z[D],d.value=z}u.value=null,f.value=void 0,p.value=!1}}function Fe(D){const z={...d.value};p.value?z[D]=Rn(f.value):delete z[D],d.value=z,u.value=null,f.value=void 0,p.value=!1;const ae=`${D}.`;g.value=Object.fromEntries(Object.entries(g.value).filter(([Se])=>Se!==D&&!Se.startsWith(ae)))}function Ve(){!Z.value&&!u.value||(Ce(),d.value={},u.value=null,f.value=void 0,p.value=!1,g.value={},E.value=!1)}function st(D,z){const ae=D.path.split(".")[0];if(u.value!==ae)return;Ce();const Se=Rn(d.value[ae]);if(D.key===null?d.value={...d.value,[ae]:z}:(Se[D.key]=z,d.value={...d.value,[ae]:Se}),g.value[D.path]){const Ee={...g.value};delete Ee[D.path],g.value=Ee}}function j(D,z){try{const ae=JSON.parse(z),Se={...g.value};delete Se[D.path],g.value=Se,st(D,ae)}catch(ae){g.value={...g.value,[D.path]:`Invalid JSON: ${ae.message}`}}}function we(D,z){var Se;if(!D)return null;if((Se=D.enum)!=null&&Se.length&&!D.enum.includes(z))return`Choose one of: ${D.enum.join(", ")}`;const ae=D.constraints||{};if((D.type==="integer"||D.type==="number")&&typeof z=="number"){if(ae.minimum!==void 0&&z<ae.minimum)return`Must be at least ${ae.minimum}${D.unit?` ${D.unit}`:""}`;if(ae.maximum!==void 0&&z>ae.maximum)return`Must be at most ${ae.maximum}${D.unit?` ${D.unit}`:""}`}return null}function Le(D){return A.value[D.path]||null}function De(D){const z=`${D}.`;return Object.keys(A.value).some(ae=>ae===D||ae.startsWith(z))}function Ke(){y.value.length&&(k.value.push(Rn(d.value)),d.value=y.value.pop(),g.value={})}function qe(){k.value.length&&(y.value.push(Rn(d.value)),d.value=k.value.pop(),g.value={})}function ht(){!Z.value||q.value||(u.value&&Me(u.value),E.value=!0,v.value=!1)}function ss(){E.value=!1}function Is(){u.value?Fe(u.value):Ve()}function Ps(D){return zw[D]||$s(D||"unknown")}function Fs(D){return`apply-${String(D||"unknown").replaceAll("_","-")}`}function us(D){return`cfgc-field-${D.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function G(D){return`${us(D)}-input`}function Ae(D){const z=document.getElementById(us(D))||document.getElementById(us(D.split(".").slice(0,2).join(".")));z==null||z.scrollIntoView({behavior:"smooth",block:"center"})}function fs(D,z){i.value={type:D,message:z},window.setTimeout(()=>{var ae;((ae=i.value)==null?void 0:ae.message)===z&&(i.value=null)},3500)}async function Zs(){if(!(!Z.value||q.value||n.value)){n.value=!0;try{const D=Ww(e.value,d.value),z=await Q.put("/api/config",D);e.value=z,t.value=await Lu(z),d.value={},u.value=null,f.value=void 0,p.value=!1,y.value=[],k.value=[],g.value={},E.value=!1,fs("success","Configuration saved. Apply status has been refreshed.")}catch(D){fs("error",D.message||"Configuration could not be saved")}finally{n.value=!1}}}async function ca(){var D;if(!Z.value){s.value=!0,a.value=null;try{const z=await Q.get("/api/config"),ae=await Lu(z);e.value=z,t.value=ae;const Se=M.value;Se.some(Ee=>Ee.key===o.value)||(o.value=((D=Se[0])==null?void 0:D.key)||Oa[0].key)}catch(z){a.value=z.message||"Unknown configuration error"}finally{s.value=!1}}}function wn(D){if(E.value||!(D.ctrlKey||D.metaKey))return;const z=D.target;z instanceof HTMLElement&&(z.matches("input, textarea, select")||z.isContentEditable)||(!D.shiftKey&&D.key.toLowerCase()==="z"?(D.preventDefault(),Ke()):(D.key.toLowerCase()==="y"||D.shiftKey&&D.key.toLowerCase()==="z")&&(D.preventDefault(),qe()))}function Js(D){if(m.value=D.matches,D.matches){const z=Object.keys(c.value).find(ae=>c.value[ae]);c.value=z?{[z]:!0}:{}}}return Xt(c,D=>{try{localStorage.setItem(xg,JSON.stringify(D))}catch{}},{deep:!0}),Ye(()=>{var D;ca(),document.addEventListener("keydown",wn),x=window.matchMedia("(max-width: 760px)"),Js(x),(D=x.addEventListener)==null||D.call(x,"change",Js)}),_t(()=>{var D;document.removeEventListener("keydown",wn),(D=x==null?void 0:x.removeEventListener)==null||D.call(x,"change",Js)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,searchQuery:l,healthFilter:r,activeCategory:o,editingSection:u,reviewOpen:E,mobileOverflowOpen:v,healthFilters:C,visibleCategories:M,displayGroups:K,reviewGroups:ee,sectionCount:R,fieldCount:T,hasChanges:Z,changeCount:ne,changedSectionCount:F,hasDraftErrors:q,canUndo:L,canRedo:H,globalFilterActive:O,reviewRestartCount:ie,healthCount:Y,categoryStats:pe,selectCategory:se,selectHealthFilter:ye,clearFilters:he,sectionLabel:_e,sectionDescription:V,sectionFieldCount:re,sectionHealthCount:J,sectionApplySummary:de,sectionOwner:xe,ownerInfo:me,sectionEntries:b,sectionSearchHits:P,sectionChanged:ce,fieldChanged:oe,isSectionExpanded:ge,toggleSection:ke,startSectionDraft:Ie,finishSectionDraft:Me,cancelSectionDraft:Fe,discardAllDrafts:Ve,setFieldValue:st,setJsonFieldValue:j,fieldError:Le,sectionHasErrors:De,undo:Ke,redo:qe,openReview:ht,closeReview:ss,mobileCancel:Is,applyModeLabel:Ps,applyClass:Fs,compactValue:Gw,formatValue:Kw,fieldId:us,fieldInputId:G,focusField:Ae,fetchConfig:ca,saveConfig:Zs}}},Qw={template:`
    <div class="p-6 page-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold">Discord Channels</h1>
        <button @click="fetchGuilds" class="btn btn-ghost text-xs" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
      <p class="text-xs text-gray-500 mb-4">
        Configure response behavior per guild and channel. Channel overrides take priority over guild defaults.
        Changes take effect immediately.
      </p>

      <div v-if="loading && guilds.length === 0" class="space-y-2">
        <div v-for="n in 3" :key="n" class="skeleton skeleton-row"></div>
      </div>
      <div v-else-if="error" class="hm-card border-red-900 error-state">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchGuilds" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else class="space-y-4">
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
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildEnabled(guild)"
                    @change="setGuildConfig(guild.id, 'enabled', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Require @mention
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildMention(guild)"
                    @change="setGuildConfig(guild.id, 'require_mention', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
              </label>
              <label class="flex items-center gap-2 text-xs text-gray-400">
                Respond to bots
                <label class="toggle-switch">
                  <input type="checkbox"
                    :checked="guildBots(guild)"
                    @change="setGuildConfig(guild.id, 'respond_to_bots', $event.target.checked)" />
                  <span class="toggle-slider"></span>
                </label>
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await Q.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function d(p,g,y){try{await Q.put("/api/discord/guild/"+p+"/config",{[g]:y}),await c()}catch(k){s.value=k.message}}async function u(p,g,y,k){try{await Q.put("/api/discord/channel/"+p+"/config",{[y]:k}),await c()}catch(E){s.value=E.message}}async function f(p,g){try{await Q.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(y){s.value=y.message}}return Ye(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:d,setChannelConfig:u,clearOverride:f}}},hs=e=>e==null?e:JSON.parse(JSON.stringify(e));function Xw({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const f=new Map;let p=null;const g=new Map;function y(_){d+=1;const R=c.then(_,_);return c=R.catch(()=>{}),R}function k(_,R){p=hs(_),g.clear();for(const[T,C]of Object.entries(R||{}))g.set(T,hs(C))}function E(_){const R=hs(_),T=++u;return y(async()=>{try{await e(hs(R)),p=hs(R),T===u&&n(hs(R))}catch(C){T===u&&(a(hs(p)),o(C,{kind:"default"}))}})}function v(_,R){const T=hs(R),C=(f.get(_)||0)+1;return f.set(_,C),y(async()=>{try{await t(_,hs(T)),g.set(_,hs(T)),C===f.get(_)&&i(_,hs(T))}catch(L){C===f.get(_)&&(l(_,hs(g.get(_)??null)),o(L,{kind:"user",uid:_}))}})}function m(_){const R=(f.get(_)||0)+1;return f.set(_,R),y(async()=>{try{await s(_),g.delete(_),R===f.get(_)&&r(_)}catch(T){R===f.get(_)&&(l(_,hs(g.get(_)??null)),o(T,{kind:"delete",uid:_}))}})}async function x(){for(;;){const _=c;if(await _,_===c)return d}}async function w(_){for(;;){const R=await x(),T=await _();if(R===d)return T}}return{seed:k,saveDefault:E,saveUser:v,deleteUser:m,whenIdle:x,readSnapshot:w,get revision(){return d}}}const ek={template:`
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
              <div class="relative w-72">
                <input ref="searchInput" v-model="searchQuery" placeholder="Search users..."
                       role="combobox" aria-label="Search users" aria-autocomplete="list"
                       :aria-expanded="showDropdown" aria-controls="host-user-options"
                       :aria-activedescendant="activeOptionId"
                       @input="onSearchInput" @keydown.down.prevent="highlightNext"
                       @keydown.up.prevent="highlightPrev" @keydown.enter.prevent="selectHighlighted"
                       @keydown.escape="closeDropdown" @blur="onBlur"
                       class="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-300 w-full" />
                <div v-if="showDropdown && (filteredMembers.length > 0 || isRawId)"
                     id="host-user-options" role="listbox"
                     class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-gray-900 border border-gray-600 rounded shadow-lg">
                  <div v-if="isRawId && !filteredMembers.length"
                       @mousedown.prevent="addRawId" id="host-user-option-raw" role="option"
                       :aria-selected="highlightIdx === 0"
                       class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-800">
                    <div class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">?</div>
                    <span class="text-gray-200">Add by ID: {{ searchQuery.trim() }}</span>
                    <span class="text-gray-500 text-xs ml-auto">press Enter</span>
                  </div>
                  <div v-for="(m, idx) in filteredMembers" :key="m.id"
                       @mousedown.prevent="selectMember(m)" :id="'host-user-option-' + idx" role="option"
                       :aria-selected="idx === highlightIdx"
                       class="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm"
                       :class="idx === highlightIdx ? 'bg-gray-700' : 'hover:bg-gray-800'">
                    <img v-if="m.avatar_url" :src="m.avatar_url + '?size=24'" class="w-5 h-5 rounded-full" />
                    <div v-else class="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                      {{ m.display_name.charAt(0) }}
                    </div>
                    <span class="text-gray-200">{{ m.display_name }}</span>
                    <span class="text-gray-500 text-xs">{{ m.username }}</span>
                    <span v-if="m.bot" class="text-xs px-1 rounded bg-indigo-900 text-indigo-300 ml-auto">BOT</span>
                  </div>
                </div>
              </div>
              <button @click="showAddUser = false; searchQuery = ''" class="btn btn-ghost text-xs">Cancel</button>
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),d=h([]),u=h(null),f=te(()=>{const K={};for(const ee of d.value)K[ee.id]=ee;return K});function p(K){return f.value[K]||null}const g=te(()=>/^\d{15,25}$/.test(r.value.trim())),y=te(()=>{if(o.value){if(k.value[c.value])return"host-user-option-"+c.value;if(g.value)return"host-user-option-raw"}}),k=te(()=>{const K=r.value.toLowerCase().trim();return K?d.value.filter(ee=>!i.value[ee.id]&&(ee.display_name.toLowerCase().includes(K)||ee.username.toLowerCase().includes(K)||ee.id.includes(K))):d.value.filter(ee=>!i.value[ee.id])});function E(K,ee){return K?K.allowed_hosts===null||K.allowed_hosts===void 0?{allowed_hosts:[...ee],default_host:K.default_host||"",allow_all:!0}:{allowed_hosts:K.allowed_hosts,default_host:K.default_host||"",allow_all:!1}:{allowed_hosts:[...ee],default_host:ee[0]||"",allow_all:!0}}const v=Xw({applyDefault:async K=>{const ee=K.allow_all?null:K.allowed_hosts;await Q.put("/api/host-access/default-policy",{allowed_hosts:ee,default_host:K.default_host})},applyUser:async(K,ee)=>{const ie=ee.allow_all?null:ee.allowed_hosts;await Q.put(`/api/host-access/user/${K}`,{allowed_hosts:ie,default_host:ee.default_host})},applyDelete:K=>Q.del(`/api/host-access/user/${K}`),onDefaultConfirmed:()=>Te.success("Default policy updated"),onDefaultRollback:K=>{K&&(a.value=K)},onUserConfirmed:K=>{const ee=p(K);Te.success(`Updated access for ${ee?ee.display_name:K}`)},onUserRollback:(K,ee)=>{const ie={...i.value};ee?ie[K]=ee:delete ie[K],i.value=ie},onUserDeleted:K=>{const ee={...i.value};delete ee[K],i.value=ee},onError:(K,ee)=>{var U;const ie=ee.uid?` ${((U=p(ee.uid))==null?void 0:U.display_name)||ee.uid}`:"";Te.error(`${K.message||"Failed to save"} — reverted${ie}`)}});let m=0;async function x(){const K=++m;e.value=!0,t.value="";try{const ee=await v.readSnapshot(()=>Q.get("/api/host-access"));if(K!==m)return;s.value=ee,n.value=ee.available_hosts||[],a.value=E(ee.default_policy,n.value);const ie=ee.users||{},U={};for(const[B,re]of Object.entries(ie))U[B]=E(re,n.value);i.value=U,v.seed(a.value,U)}catch(ee){K===m&&(t.value=ee.message||"Failed to fetch host access data")}finally{K===m&&(e.value=!1)}try{const ee=await Q.get("/api/discord/members")||[];K===m&&(d.value=ee)}catch{K===m&&(d.value=[])}}function w(){v.saveDefault(a.value)}function _(K,ee){a.value.allow_all=!1,ee?a.value.allowed_hosts.includes(K)||a.value.allowed_hosts.push(K):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ie=>ie!==K),a.value.default_host===K&&(a.value.default_host=a.value.allowed_hosts[0]||"")),w()}function R(K){const ee=i.value[K];ee&&v.saveUser(K,ee)}function T(K,ee,ie){const U=i.value[K];U&&(U.allow_all=!1,ie?U.allowed_hosts.includes(ee)||U.allowed_hosts.push(ee):(U.allowed_hosts=U.allowed_hosts.filter(B=>B!==ee),U.default_host===ee&&(U.default_host=U.allowed_hosts[0]||"")),R(K))}function C(K,ee){const ie=i.value[K];ie&&(ie.default_host=ee,R(K))}function L(){l.value=!0,r.value="",c.value=0,Ot(()=>{u.value&&u.value.focus()})}function H(){o.value=!0,c.value=0}function M(){c.value<k.value.length-1&&c.value++}function N(){c.value>0&&c.value--}function Z(){const K=k.value[c.value];if(K){F(K);return}g.value&&ne()}function ne(){const K=r.value.trim();/^\d{15,25}$/.test(K)&&(i.value[K]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},R(K),r.value="",o.value=!1,l.value=!1)}function F(K){i.value[K.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},R(K.id),r.value="",o.value=!1,l.value=!1}function O(){o.value=!1}function A(){setTimeout(()=>{o.value=!1},150)}async function q(K){const ee=p(K);await bs({title:"Remove user override",message:`Remove the host access override for ${ee?ee.display_name:K}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await v.deleteUser(K),i.value[K]||Te.success(`Removed override for ${ee?ee.display_name:K}`))}return Ye(x),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:k,isRawId:g,activeOptionId:y,searchInput:u,fetchData:x,saveDefaultPolicy:w,toggleDefaultHost:_,getMember:p,toggleUserHost:T,setUserDefault:C,openAddUser:L,deleteUser:q,onSearchInput:H,highlightNext:M,highlightPrev:N,selectHighlighted:Z,selectMember:F,closeDropdown:O,onBlur:A,addRawId:ne}}},tk={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=te(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=te(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function g(){e.value=!0,t.value="";try{const T=await Q.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function y(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function k(T,C){const L=c.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}function E(T,C){const L=d.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}async function v(){var T;i.value=!0;try{const C=y(c.value.allowed_tools_str),L=c.value.host_mode,H=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,M={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};H!==null&&(M.allowed_hosts=H),M.default_host=c.value.default_host||"";const N=await Q.post("/api/tokens",M);l.value=N.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Te.success("Token created"),await g()}catch(C){Te.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(T){r.value=T;const C=T.allowed_hosts;let L="default";C==null?L="default":Array.isArray(C)&&C.length===0?L="none":Array.isArray(C)&&(L="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:L,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function x(){var T;if(r.value){o.value=!0;try{const C=y(d.value.allowed_tools_str),L=d.value.host_mode,H={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};L==="none"?H.allowed_hosts=[]:L==="select"?H.allowed_hosts=d.value.allowed_hosts:H.allowed_hosts=null,H.default_host=d.value.default_host||"",await Q.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,Te.success("Token updated"),await g()}catch(C){Te.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function w(T){var L;if(await bs({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await Q.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=H.token,Te.success("Token regenerated")}catch(H){Te.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to regenerate")}}async function _(T){var L;if(await bs({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await Q.del("/api/tokens/"+encodeURIComponent(T.user_id)),Te.success("Token deleted"),await g()}catch(H){Te.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to delete")}}async function R(){if(l.value)try{await navigator.clipboard.writeText(l.value),Te.success("Copied to clipboard")}catch{Te.error("Copy failed — select and copy manually")}}return Ye(g),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:g,tierBadge:p,toggleCreateHost:k,toggleEditHost:E,createToken:v,startEdit:m,saveEdit:x,confirmRegenerate:w,confirmDelete:_,copyToken:R}}};function dl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const sk={template:`
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
                <span v-if="!llmStatus.codex.configured" class="text-xs text-yellow-500">— not configured</span>
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
                <span v-if="!llmStatus.ollama.configured" class="text-xs text-yellow-500">— not configured</span>
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
                <span v-if="!llmStatus.kimi.configured" class="text-xs text-yellow-500">— not configured</span>
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
            <div>
              <label class="text-xs text-gray-400 block">Max Tokens
              <input v-model.number="codexForm.max_tokens" type="number" @keydown.enter="saveCodexConfigNow"
                     class="hm-input" />
              </label>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">
            The Auxiliary Model runs the background jobs (compaction, reflection, consolidation,
            background follow-up) on a cheaper Codex model, with automatic fallback to the primary
            on error. It shares the main Codex login and token limit — only the model differs.
            "Off" runs those jobs on the primary model.
          </p>
          <div v-if="auxData.unavailable_reason"
               class="text-sm text-yellow-400 bg-yellow-900/20 rounded p-2 border border-yellow-800 mt-3">
            {{ auxData.unavailable_reason }}
          </div>
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
              <div v-if="kimiStatus.configured" class="text-sm">
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
          <div v-if="kimiStatus.health && kimiStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ kimiStatus.health.error }}
          </div>
        </div>

        <!-- ==================== Ollama Config ==================== -->
        <div class="hm-card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-300">Ollama (Local/Remote)</h2>
            <div class="flex items-center gap-3">
              <div v-if="ollamaStatus.configured" class="text-sm">
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
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=te(()=>{const G=n.value.model;return G&&!a.includes(G)?[G,...a]:a}),l=te(()=>{const G=n.value.agent_model;return G&&G!=="auto"&&!a.includes(G)?[G,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=te(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=te(()=>{const G=n.value.agent_model;return G==="auto"?!0:!r.includes(G||n.value.model)}),d=te(()=>{const G=n.value.agent_reasoning_effort;return G==="auto"?!1:(G||n.value.reasoning_effort)==="max"}),u=G=>r.includes(G)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=G=>r.includes(G)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),g=h({unavailable_reason:null}),y=te(()=>{const G=p.value.model;return G&&!a.includes(G)?[G,...a]:a});function k(G){const Ae=G.target.value;p.value.enabled=Ae!=="",Ae!==""&&(p.value.model=Ae),Ve()}const E=h(!1),v=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),m=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),x=h(!1),w=h(!1),_=h(!1),R=h(!1),T=h(!1),C=h(!1),L=h(!1),H=h({configured:!1}),M=h([]),N=h(""),Z=h(!1),ne=h(!1),F=h({configured:!1}),O=h([]),A=h(""),q=h(!1),K=h(!1),ee=h(!0),ie=h(""),U=h({configured:!1,accounts:[]}),B=h(null),re=h(null),_e=h(""),V=h(null),fe=h(!1),de=h(null),xe=h(null),me=h("");let Be=null;function b(G,Ae="success"){Te(G,Ae==="error"?"error":"success")}function I(G){if(!G)return"?";const Ae=G/(1024*1024*1024);return Ae>=1?Ae.toFixed(1)+" GB":(G/(1024*1024)).toFixed(0)+" MB"}async function P(){e.value=!0,await Promise.all([X(),J(),ye(),Y()]),e.value=!1}async function X(){try{const G=await Q.get("/api/llm/status");t.value=G,s.value=G.active_provider||"codex",G.codex&&!Fe.pending()&&(n.value.enabled=G.codex.enabled,n.value.model=G.codex.model||"gpt-5.5",n.value.reasoning_effort=G.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=G.codex.agent_reasoning_effort||"",n.value.agent_model=G.codex.agent_model||"",n.value.max_tokens=G.codex.max_tokens||4096),G.ollama&&!st.pending()&&(v.value.enabled=G.ollama.enabled,v.value.base_url=G.ollama.base_url||"",v.value.model=G.ollama.model||"",v.value.max_tokens=G.ollama.max_tokens||4096),G.kimi&&!j.pending()&&(m.value.enabled=G.kimi.enabled,m.value.model=G.kimi.model||"",m.value.max_tokens=G.kimi.max_tokens||4096),G.auxiliary&&(g.value=G.auxiliary,Ve.pending()||(p.value.enabled=G.auxiliary.enabled,p.value.model=G.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function J(){try{if(H.value=await Q.get("/api/ollama/status"),H.value.model&&(N.value=H.value.model),H.value.configured)try{const G=await Q.get("/api/ollama/models");M.value=G.models||[]}catch{M.value=[]}else if(v.value.base_url)try{const G=await Q.post("/api/ollama/probe-models",{base_url:v.value.base_url});M.value=G.models||[]}catch{M.value=[]}}catch{H.value={configured:!1}}}async function Y(){ee.value=!0,ie.value="";try{U.value=await Q.get("/api/codex/status")}catch(G){ie.value=G.message||"Failed to fetch Codex status"}finally{ee.value=!1}}async function pe(){const G=t.value?t.value.active_provider:"codex";L.value=!0;try{const Ae=await Q.post("/api/llm/switch",{provider:s.value});Ae.error?(s.value=G,b(Ae.error,"error")):(b("Switched to "+s.value+" ("+Ae.model+")"),await P())}catch(Ae){s.value=G,b(Ae.message||"Switch failed","error")}finally{L.value=!1}}async function ce(){Z.value=!0;try{const G=await Q.post("/api/ollama/reload");b(G.configured?"Ollama reloaded":G.reason||"Ollama not configured",G.configured?"success":"error"),await P()}catch(G){b(G.message||"Reload failed","error")}finally{Z.value=!1}}async function oe(){ne.value=!0;try{await Q.post("/api/ollama/model",{model:N.value}),b("Model set to "+N.value),await P()}catch(G){b(G.message||"Failed","error")}finally{ne.value=!1}}async function se(){const G=v.value.base_url;if(!G){b("Enter a base URL first","error");return}C.value=!0;try{const Ae=await Q.post("/api/ollama/probe-models",{base_url:G});M.value=Ae.models||[],M.value.length?(b(M.value.length+" model(s) found"),!v.value.model&&M.value.length&&(v.value.model=M.value[0].name)):b("No models found at "+G,"error")}catch(Ae){b(Ae.message||"Could not reach Ollama","error")}finally{C.value=!1}}async function ye(){try{if(F.value=await Q.get("/api/kimi/status"),F.value.model&&(A.value=F.value.model),F.value.configured)try{const G=await Q.get("/api/kimi/models");O.value=G.models||[]}catch{O.value=[]}}catch{F.value={configured:!1}}}async function he(){q.value=!0;try{const G=await Q.post("/api/kimi/reload");b(G.configured?"Kimi reloaded":G.reason||"Kimi not configured",G.configured?"success":"error"),await P()}catch(G){b(G.message||"Reload failed","error")}finally{q.value=!1}}async function ge(){K.value=!0;try{await Q.post("/api/kimi/model",{model:A.value}),b("Model set to "+A.value),await P()}catch(G){b(G.message||"Failed","error")}finally{K.value=!1}}async function ke(){if(_.value){Fe();return}_.value=!0;try{await Q.put("/api/llm/codex/config",n.value),b("Codex config saved"),await Promise.all([X(),Y()])}catch(G){b(G.message||"Failed","error"),await Promise.all([X(),Y()])}finally{_.value=!1}}async function Ce(){if(R.value){st();return}R.value=!0;try{const G={...v.value},Ae=x.value?v.value.api_key:null;Ae===null&&delete G.api_key,await Q.put("/api/llm/ollama/config",G),b("Ollama config saved"),Ae!==null&&v.value.api_key===Ae&&(v.value.api_key="",x.value=!1),await Promise.all([X(),J()])}catch(G){b(G.message||"Failed","error")}finally{R.value=!1}}async function Ie(){if(T.value){j();return}T.value=!0;try{const G={...m.value},Ae=w.value?m.value.api_key:null;Ae===null&&delete G.api_key,await Q.put("/api/llm/kimi/config",G),b("Kimi config saved"),Ae!==null&&m.value.api_key===Ae&&(m.value.api_key="",w.value=!1),await Promise.all([X(),ye()])}catch(G){b(G.message||"Failed","error")}finally{T.value=!1}}async function Me(){if(E.value){Ve();return}E.value=!0;try{await Q.put("/api/llm/auxiliary/config",p.value),b("Auxiliary config saved"),await X()}catch(G){b(G.message||"Failed","error"),await X()}finally{E.value=!1}}const Fe=dl(ke),Ve=dl(Me),st=dl(Ce),j=dl(Ie),we=()=>(Fe.cancel(),ke()),Le=()=>(st.cancel(),Ce()),De=()=>(j.cancel(),Ie());async function Ke(G){try{await Q.post("/api/codex/account/"+G+"/activate"),b("Active account switched"),await Y()}catch(Ae){b(Ae.message||"Failed","error")}}async function qe(G){B.value=G;try{await Q.post("/api/codex/account/"+G+"/refresh"),b("Token refreshed"),await Y()}catch(Ae){b(Ae.message||"Refresh failed","error")}finally{B.value=null}}function ht(G,Ae){re.value=G,_e.value=Ae||""}async function ss(G){try{await Q.put("/api/codex/account/"+G+"/label",{label:_e.value}),b("Label updated"),re.value=null,await Y()}catch(Ae){b(Ae.message||"Failed","error")}}async function Is(G,Ae){if(await bs({title:"Delete Codex account",message:`Delete ${Ae||"account #"+(G+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await Q.del("/api/codex/account/"+G),b("Deleted. Pool reloaded."),await Y()}catch(Zs){b(Zs.message||"Failed","error")}}async function Ps(){fe.value=!0;try{const G=await Q.post("/api/codex/device-code");de.value=G,V.value="pending",Fs(G)}catch(G){b(G.message||"Failed","error")}finally{fe.value=!1}}async function Fs(G){Be={cancelled:!1};const Ae=Be;try{const fs=await Q.post("/api/codex/device-poll",{device_auth_id:G.device_auth_id,user_code:G.user_code,interval:G.interval});if(Ae.cancelled)return;xe.value=fs,V.value="success",await P()}catch(fs){if(Ae.cancelled)return;me.value=fs.message||"Device login failed",V.value="error"}}function us(){Be&&(Be.cancelled=!0),V.value=null,de.value=null}return Ye(P),_t(()=>{Be&&(Be.cancelled=!0),Fe.cancel(),Ve.cancel(),st.cancel(),j.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:L,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:g,auxModelOptions:y,onAuxModelChange:k,savingAux:E,saveAuxConfigDebounced:Ve,ollamaForm:v,kimiForm:m,savingCodex:_,savingOllama:R,savingKimi:T,probingOllama:C,ollamaKeyDirty:x,kimiKeyDirty:w,ollamaStatus:H,ollamaModels:M,ollamaSelectedModel:N,reloading:Z,settingModel:ne,kimiStatus:F,kimiModels:O,kimiSelectedModel:A,reloadingKimi:q,settingKimiModel:K,codexLoading:ee,codexError:ie,codexData:U,refreshing:B,editingLabel:re,labelValue:_e,deviceState:V,deviceLoading:fe,deviceInfo:de,deviceResult:xe,deviceError:me,fetchAll:P,switchProvider:pe,reloadOllama:ce,setOllamaModel:oe,reloadKimi:he,setKimiModel:ge,probeOllamaModels:se,saveCodexConfig:ke,saveOllamaConfig:Ce,saveKimiConfig:Ie,saveCodexConfigDebounced:Fe,saveOllamaConfigDebounced:st,saveKimiConfigDebounced:j,saveCodexConfigNow:we,saveOllamaConfigNow:Le,saveKimiConfigNow:De,activateAccount:Ke,refreshAccount:qe,startEditLabel:ht,saveLabel:ss,deleteAccount:Is,startDeviceLogin:Ps,cancelDeviceLogin:us,formatSize:I}}},Nu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function nk(e){return Nu[e]||Nu[(e||"").toLowerCase()]||"text-gray-400"}const ak={template:`
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
            {{ failedCount }} of 9 internal endpoints failed to load — those sections may be empty.
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
                <span v-if="s.last_failure_at"> &mdash; last fail: {{ formatTime(s.last_failure_at) }}</span>
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
              <div v-if="sshPool && sshPool.connections" class="text-xs text-gray-400">
                <div v-for="(conn, host) in sshPool.connections" :key="host">
                  {{ host }}: {{ conn.active || 0 }} active, {{ conn.idle || 0 }} idle
                </div>
              </div>
              <p v-else class="text-xs text-gray-500">{{ sshPool.message || 'No SSH pool data' }}</p>
            </div>
            <div class="hm-card" style="padding:0.75rem;">
              <h3 class="text-sm font-medium mb-1">HTTP Pool</h3>
              <div v-if="httpPool && httpPool.connections" class="text-xs text-gray-400">
                Active: {{ httpPool.active || 0 }} / Limit: {{ httpPool.limit || 'n/a' }}
              </div>
              <p v-else class="text-xs text-gray-500">{{ httpPool.message || 'No HTTP pool data' }}</p>
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
              <div>Total assessed: {{ riskStats.total || 0 }}</div>
              <div>High risk: <span class="text-red-400">{{ riskStats.high || 0 }}</span></div>
              <div>Medium: <span class="text-yellow-400">{{ riskStats.medium || 0 }}</span></div>
              <div>Low: <span class="text-green-400">{{ riskStats.low || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">No risk data</p>
          </section>

          <!-- Recovery Stats -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Recovery</h3>
            <div v-if="recoveryStats" class="text-xs text-gray-400 space-y-1">
              <div>Attempts: {{ recoveryStats.total || 0 }}</div>
              <div>Recovered: <span class="text-green-400">{{ recoveryStats.recovered || 0 }}</span></div>
              <div>Failed: <span class="text-red-400">{{ recoveryStats.failed || 0 }}</span></div>
            </div>
            <p v-else class="text-xs text-gray-500">Recovery disabled or no data</p>
          </section>

          <!-- Context Compression -->
          <section class="hm-card" style="padding:1rem;">
            <h3 class="text-sm font-medium mb-2">Context Compression</h3>
            <div v-if="compressionStats" class="text-xs text-gray-400 space-y-1">
              <div>Compressions: {{ compressionStats.total || 0 }}</div>
              <div>Chars saved: {{ (compressionStats.chars_saved || 0).toLocaleString() }}</div>
              <div v-if="compressionStats.avg_ratio">Avg ratio: {{ (compressionStats.avg_ratio * 100).toFixed(0) }}%</div>
            </div>
            <p v-else class="text-xs text-gray-500">No compression data</p>
          </section>

        </div>

        <!-- Freshness Stats -->
        <section class="hm-card" style="padding:1.25rem;">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Branch Freshness</h2>
          <div v-if="freshnessStats" class="text-xs text-gray-400 space-y-1">
            <div>Checks: {{ freshnessStats.total || 0 }}</div>
            <div>Stale detected: <span class="text-yellow-400">{{ freshnessStats.stale || 0 }}</span></div>
            <div>Fetch failures: <span class="text-red-400">{{ freshnessStats.fetch_failures || 0 }}</span></div>
          </div>
          <p v-else class="text-xs text-gray-500">Freshness checking disabled or no data</p>
        </section>

      </div>
    </div>
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=h(""),u=h(0);let f=null;async function p(){var _;const v=await Promise.allSettled([Q.get("/api/startup/diagnostics"),Q.get("/api/subsystems/status"),Q.get("/api/pools/ssh"),Q.get("/api/pools/http"),Q.get("/api/risk/stats"),Q.get("/api/recovery/stats"),Q.get("/api/compression/stats"),Q.get("/api/freshness/stats"),Q.get("/api/governor/stats")]),m=R=>v[R].status==="fulfilled"?v[R].value:null;t.value=m(0)||{};const x=m(1);s.value=Array.isArray(x)?x:x&&x.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8);const w=v.filter(R=>R.status==="rejected");if(u.value=w.length,w.length===v.length){const R=(_=w[0])==null?void 0:_.reason;d.value=(R==null?void 0:R.message)||"Failed to load internals"}else d.value="";e.value=!1}function g(){e.value=!0,d.value="",p()}let y=!1;function k(){y||(y=!0,p(),f||(f=setInterval(p,3e4)))}function E(){y&&(y=!1,f&&(clearInterval(f),f=null))}return Ye(k),As(k),Rs(E),_t(E),{loading:e,error:d,failedCount:u,retry:g,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:nk,formatTime:Mc}}},ik={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await Q.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await bs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await Q.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return Ye(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Sg=[{id:"health",label:"Health",component:Ew},{id:"resources",label:"Resources",component:Aw},{id:"logs",label:"Logs",component:Lw},{id:"config",label:"Config",component:Yw},{id:"discord",label:"Discord",component:Qw},{id:"host-access",label:"Host Access",component:ek},{id:"api-tokens",label:"API Tokens",component:tk},{id:"llm",label:"LLM Config",component:sk},{id:"internals",label:"Internals",component:ak},{id:"update",label:"Update",component:ik}],lk={components:{TabbedPage:kr},setup(){return{tabs:Sg}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},ul=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),rk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...ul("Operations","operations","/operations",hg),...ul("History","history","/history",gg),...ul("Capabilities","capabilities","/capabilities",mg),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...ul("System","system","/system",Sg)],ls=Fn({open:!1,query:"",selected:0});function Du(){ls.query="",ls.selected=0,ls.open=!0}function Kr(){ls.open=!1}function ok(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const ck={setup(){const e=rg(),t=h(null),s=te(()=>{const i=ls.query.trim().toLowerCase();return rk.map(l=>({...l,_score:ok(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});Xt(()=>ls.open,async i=>{var l;i&&(await Ot(),(l=t.value)==null||l.focus())}),Xt(()=>ls.query,()=>{ls.selected=0});function n(i){Kr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),Kr();return}if(i.key==="ArrowDown")i.preventDefault(),ls.selected=Math.min(ls.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ls.selected=Math.max(ls.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ls.selected];l&&n(l)}}return{state:ls,results:s,inputEl:t,go:n,onKeydown:a,closePalette:Kr}},template:`
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
  `},Io={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Io));const dk={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Da("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Da("path",{d:Io[e.name]||Io.info})])}},uk=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Mu(e){return[...e.querySelectorAll(uk)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const fk={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Mu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Mu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},pk={template:`
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
              <div v-if="errors.length === 0" class="dash-empty">
                <span class="dash-empty-icon"><odin-icon name="success" :size="21" /></span>
                <span>All clear</span>
              </div>
              <div v-else class="dash-error-list">
                <div v-for="(e, i) in errors" :key="i" class="dash-error-item">
                  <div class="dash-error-top">
                    <span class="text-red-400"><odin-icon name="warning" :size="16" /></span>
                    <span class="dash-error-tool">{{ e.tool_name }}</span>
                    <span class="dash-error-time">{{ formatTime(e.timestamp) }}</span>
                  </div>
                  <div v-if="e.error_message" class="dash-error-msg">{{ e.error_message }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=te(()=>{const N=e.value.uptime_seconds||0,Z=Math.floor(N/86400),ne=Math.floor(N%86400/3600),F=Math.floor(N%3600/60),O=[];return Z>0&&O.push(`${Z}d`),ne>0&&O.push(`${ne}h`),(O.length===0||Z===0&&ne===0)&&O.push(`${F}m`),O.join(" ")}),p=te(()=>{const N=e.value.uptime_seconds||0;return 125.66*(1-Math.min(N/86400,1))}),g=te(()=>{const N=e.value;return[{label:"Guilds",value:N.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:N.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:N.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${N.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:N.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:N.loop_count>0?"text-green-400":"",highlight:N.loop_count>0},{label:"Agents",value:N.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:N.agent_count>0?`${N.agent_count} total`:"",subColor:"text-gray-500",highlight:(N.agent_running??0)>0},{label:"Processes",value:N.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:N.process_count>0?`${N.process_count} total`:"",subColor:"text-gray-500",highlight:(N.process_running??0)>0},{label:"Schedules",value:N.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(N.schedule_failing>0?`${N.schedule_failing} failing`:"")+(N.schedule_failing>0&&N.schedule_paused>0?", ":"")+(N.schedule_paused>0?`${N.schedule_paused} paused`:"")||void 0,subColor:N.schedule_failing>0?"text-red-400":"text-yellow-400",color:N.schedule_failing>0?"text-red-400":"",highlight:N.schedule_failing>0},{label:"Users",value:N.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),y=te(()=>{const N=e.value,Z=[];return Z.push({label:"Bot",status:N.status==="online"?"ok":"warn",detail:N.status==="online"?"Online":"Starting"}),(N.schedule_failing||0)>0?Z.push({label:"Schedules",status:"error",detail:`${N.schedule_failing} failing`}):(N.schedule_count||0)>0&&Z.push({label:"Schedules",status:"ok",detail:`${N.schedule_count} configured`}),(N.loop_count||0)>0&&Z.push({label:"Loops",status:"ok",detail:`${N.loop_count} active`}),(N.agent_running||0)>0&&Z.push({label:"Agents",status:"ok",detail:`${N.agent_running} running`}),(N.process_running||0)>0&&Z.push({label:"Processes",status:"ok",detail:`${N.process_running} running`}),Z});async function k(){try{e.value=await Q.get("/api/status"),s.value=null}catch(N){s.value=N.message}finally{t.value=!1}}async function E(){a.value=!0;try{n.value=await Q.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function v(){l.value=!0;try{i.value=await Q.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const N=await Q.get("/api/knowledge");c.value=(Array.isArray(N)?N:[]).reduce((Z,ne)=>Z+(ne.chunks||0),0)}catch{c.value=null}}async function x(){try{const N=await Q.get("/api/agents");r.value=N.filter(Z=>Z.status==="running")}catch{}}async function w(){d.value={...d.value,reload:!0};try{await Q.post("/api/reload"),Te.success("Config reloaded")}catch(N){Te.error(N.message)}d.value={...d.value,reload:!1}}async function _(){if(!await bs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const Z=e.value.session_count;e.value={...e.value,session_count:0};try{const ne=await Q.post("/api/sessions/clear-all");Te.success(`Cleared ${ne.count} session${ne.count!==1?"s":""}`),await k()}catch(ne){e.value={...e.value,session_count:Z},Te.error(ne.message)}d.value={...d.value,clearSessions:!1}}async function R(){if(!await bs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const Z=e.value.loop_count;e.value={...e.value,loop_count:0};try{const ne=await Q.post("/api/loops/stop-all");Te.success(ne.result),await k()}catch(ne){e.value={...e.value,loop_count:Z},Te.error(ne.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,k(),E(),v(),x()}let C=null,L=null,H=null;function M(N){if(N.payload&&N.payload.tool_name){const Z={...N.payload,_isNew:!0,_key:++u};n.value.unshift(Z),n.value.length>10&&n.value.pop(),o.value++,Z.error&&(i.value.unshift(Z),i.value.length>5&&i.value.pop()),setTimeout(()=>{Z._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return Ye(async()=>{await Promise.all([k(),E(),v(),x(),m()]),C=setInterval(k,15e3),L=setInterval(x,1e4),Ze.subscribe("events",M)}),_t(()=>{C&&clearInterval(C),L&&clearInterval(L),clearTimeout(H),Ze.unsubscribe("events",M)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:g,healthIndicators:y,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:E,fetchStatus:k,formatTime:Mc,formatDuration:ja,retry:T,reloadConfig:w,clearSessions:_,stopAllLoops:R}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Pu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function hk(e){if(Array.isArray(e))return e}function gk(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function mk(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function vk(e,t){return hk(e)||gk(e,t)||bk(e,t)||mk()}function bk(e,t){if(e){if(typeof e=="string")return Pu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Pu(e,t):void 0}}const Tg=Object.entries,Fu=Object.setPrototypeOf,yk=Object.isFrozen,xk=Object.getPrototypeOf,_k=Object.getOwnPropertyDescriptor;let ts=Object.freeze,Es=Object.seal,ya=Object.create,Cg=typeof Reflect<"u"&&Reflect,Oo=Cg.apply,Lo=Cg.construct;ts||(ts=function(t){return t});Es||(Es=function(t){return t});Oo||(Oo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Lo||(Lo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const tn=Ct(Array.prototype.forEach),wk=Ct(Array.prototype.lastIndexOf),$u=Ct(Array.prototype.pop),ha=Ct(Array.prototype.push),kk=Ct(Array.prototype.splice),Zt=Array.isArray,oi=Ct(String.prototype.toLowerCase),Wr=Ct(String.prototype.toString),Uu=Ct(String.prototype.match),ga=Ct(String.prototype.replace),Bu=Ct(String.prototype.indexOf),Sk=Ct(String.prototype.trim),Tk=Ct(Number.prototype.toString),Ck=Ct(Boolean.prototype.toString),Hu=typeof BigInt>"u"?null:Ct(BigInt.prototype.toString),Vu=typeof Symbol>"u"?null:Ct(Symbol.prototype.toString),gt=Ct(Object.prototype.hasOwnProperty),ti=Ct(Object.prototype.toString),Pt=Ct(RegExp.prototype.test),Vn=Ek(TypeError);function Ct(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Oo(e,t,n)}}function Ek(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Lo(e,s)}}function He(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:oi;if(Fu&&Fu(e,null),!Zt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(yk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function Ak(e){for(let t=0;t<e.length;t++)gt(e,t)||(e[t]=null);return e}function Vt(e){const t=ya(null);for(const n of Tg(e)){var s=vk(n,2);const a=s[0],i=s[1];gt(e,a)&&(Zt(i)?t[a]=Ak(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Vt(i):t[a]=i)}return t}function Rk(e){switch(typeof e){case"string":return e;case"number":return Tk(e);case"boolean":return Ck(e);case"bigint":return Hu?Hu(e):"0";case"symbol":return Vu?Vu(e):"Symbol()";case"undefined":return ti(e);case"function":case"object":{if(e===null)return ti(e);const t=e,s=Hs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ti(n)}return ti(e)}default:return ti(e)}}function Hs(e,t){for(;e!==null;){const n=_k(e,t);if(n){if(n.get)return Ct(n.get);if(typeof n.value=="function")return Ct(n.value)}e=xk(e)}function s(){return null}return s}function Ik(e){try{return Pt(e,""),!0}catch{return!1}}const ju=ts(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Zr=ts(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Jr=ts(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),Ok=ts(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Yr=ts(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),Lk=ts(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),zu=ts(["#text"]),qu=ts(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Qr=ts(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Gu=ts(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),fl=ts(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Nk=Es(/{{[\w\W]*|^[\w\W]*}}/g),Dk=Es(/<%[\w\W]*|^[\w\W]*%>/g),Mk=Es(/\${[\w\W]*/g),Pk=Es(/^data-[\-\w.\u00B7-\uFFFF]+$/),Fk=Es(/^aria-[\-\w]+$/),Ku=Es(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),$k=Es(/^(?:\w+script|data):/i),Uk=Es(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Bk=Es(/^html$/i),Hk=Es(/^[a-z][.\w]*(-[.\w]+)+$/i),Us={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Vk=function(){return typeof window>"u"?null:window},jk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Wu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Eg(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Vk();const t=be=>Eg(be);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Us.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=Hs(f,"cloneNode"),g=Hs(f,"remove"),y=Hs(f,"nextSibling"),k=Hs(f,"childNodes"),E=Hs(f,"parentNode"),v=Hs(f,"shadowRoot"),m=Hs(f,"attributes"),x=l&&l.prototype?Hs(l.prototype,"nodeType"):null,w=l&&l.prototype?Hs(l.prototype,"nodeName"):null;if(typeof i=="function"){const be=s.createElement("template");be.content&&be.content.ownerDocument&&(s=be.content.ownerDocument)}let _,R="",T,C=!1,L=0;const H=function(){if(L>0)throw Vn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},M=function(S){H(),L++;try{return _.createHTML(S)}finally{L--}},N=function(S){H(),L++;try{return _.createScriptURL(S)}finally{L--}},Z=function(){return C||(T=jk(u,a),C=!0),T},ne=s,F=ne.implementation,O=ne.createNodeIterator,A=ne.createDocumentFragment,q=ne.getElementsByTagName,K=n.importNode;let ee=Wu();t.isSupported=typeof Tg=="function"&&typeof E=="function"&&F&&F.createHTMLDocument!==void 0;const ie=Nk,U=Dk,B=Mk,re=Pk,_e=Fk,V=$k,fe=Uk,de=Hk;let xe=Ku,me=null;const Be=He({},[...ju,...Zr,...Jr,...Yr,...zu]);let b=null;const I=He({},[...qu,...Qr,...Gu,...fl]);let P=Object.seal(ya(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),X=null,J=null;const Y=Object.seal(ya(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let pe=!0,ce=!0,oe=!1,se=!0,ye=!1,he=!0,ge=!1,ke=!1,Ce=!1,Ie=!1,Me=!1,Fe=!1,Ve=!0,st=!1;const j="user-content-";let we=!0,Le=!1,De={},Ke=null;const qe=He({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ht=null;const ss=He({},["audio","video","img","source","image","track"]);let Is=null;const Ps=He({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Fs="http://www.w3.org/1998/Math/MathML",us="http://www.w3.org/2000/svg",G="http://www.w3.org/1999/xhtml";let Ae=G,fs=!1,Zs=null;const ca=He({},[Fs,us,G],Wr);let wn=He({},["mi","mo","mn","ms","mtext"]),Js=He({},["annotation-xml"]);const D=He({},["title","style","font","a","script"]);let z=null;const ae=["application/xhtml+xml","text/html"],Se="text/html";let Ee=null,Et=null;const $=s.createElement("form"),le=function(S){return S instanceof RegExp||S instanceof Function},Oe=function(){let S=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Et&&Et===S)return;(!S||typeof S!="object")&&(S={}),S=Vt(S),z=ae.indexOf(S.PARSER_MEDIA_TYPE)===-1?Se:S.PARSER_MEDIA_TYPE,Ee=z==="application/xhtml+xml"?Wr:oi,me=gt(S,"ALLOWED_TAGS")&&Zt(S.ALLOWED_TAGS)?He({},S.ALLOWED_TAGS,Ee):Be,b=gt(S,"ALLOWED_ATTR")&&Zt(S.ALLOWED_ATTR)?He({},S.ALLOWED_ATTR,Ee):I,Zs=gt(S,"ALLOWED_NAMESPACES")&&Zt(S.ALLOWED_NAMESPACES)?He({},S.ALLOWED_NAMESPACES,Wr):ca,Is=gt(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)?He(Vt(Ps),S.ADD_URI_SAFE_ATTR,Ee):Ps,ht=gt(S,"ADD_DATA_URI_TAGS")&&Zt(S.ADD_DATA_URI_TAGS)?He(Vt(ss),S.ADD_DATA_URI_TAGS,Ee):ss,Ke=gt(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)?He({},S.FORBID_CONTENTS,Ee):qe,X=gt(S,"FORBID_TAGS")&&Zt(S.FORBID_TAGS)?He({},S.FORBID_TAGS,Ee):Vt({}),J=gt(S,"FORBID_ATTR")&&Zt(S.FORBID_ATTR)?He({},S.FORBID_ATTR,Ee):Vt({}),De=gt(S,"USE_PROFILES")?S.USE_PROFILES&&typeof S.USE_PROFILES=="object"?Vt(S.USE_PROFILES):S.USE_PROFILES:!1,pe=S.ALLOW_ARIA_ATTR!==!1,ce=S.ALLOW_DATA_ATTR!==!1,oe=S.ALLOW_UNKNOWN_PROTOCOLS||!1,se=S.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ye=S.SAFE_FOR_TEMPLATES||!1,he=S.SAFE_FOR_XML!==!1,ge=S.WHOLE_DOCUMENT||!1,Ie=S.RETURN_DOM||!1,Me=S.RETURN_DOM_FRAGMENT||!1,Fe=S.RETURN_TRUSTED_TYPE||!1,Ce=S.FORCE_BODY||!1,Ve=S.SANITIZE_DOM!==!1,st=S.SANITIZE_NAMED_PROPS||!1,we=S.KEEP_CONTENT!==!1,Le=S.IN_PLACE||!1,xe=Ik(S.ALLOWED_URI_REGEXP)?S.ALLOWED_URI_REGEXP:Ku,Ae=typeof S.NAMESPACE=="string"?S.NAMESPACE:G,wn=gt(S,"MATHML_TEXT_INTEGRATION_POINTS")&&S.MATHML_TEXT_INTEGRATION_POINTS&&typeof S.MATHML_TEXT_INTEGRATION_POINTS=="object"?Vt(S.MATHML_TEXT_INTEGRATION_POINTS):He({},["mi","mo","mn","ms","mtext"]),Js=gt(S,"HTML_INTEGRATION_POINTS")&&S.HTML_INTEGRATION_POINTS&&typeof S.HTML_INTEGRATION_POINTS=="object"?Vt(S.HTML_INTEGRATION_POINTS):He({},["annotation-xml"]);const W=gt(S,"CUSTOM_ELEMENT_HANDLING")&&S.CUSTOM_ELEMENT_HANDLING&&typeof S.CUSTOM_ELEMENT_HANDLING=="object"?Vt(S.CUSTOM_ELEMENT_HANDLING):ya(null);if(P=ya(null),gt(W,"tagNameCheck")&&le(W.tagNameCheck)&&(P.tagNameCheck=W.tagNameCheck),gt(W,"attributeNameCheck")&&le(W.attributeNameCheck)&&(P.attributeNameCheck=W.attributeNameCheck),gt(W,"allowCustomizedBuiltInElements")&&typeof W.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=W.allowCustomizedBuiltInElements),ye&&(ce=!1),Me&&(Ie=!0),De&&(me=He({},zu),b=ya(null),De.html===!0&&(He(me,ju),He(b,qu)),De.svg===!0&&(He(me,Zr),He(b,Qr),He(b,fl)),De.svgFilters===!0&&(He(me,Jr),He(b,Qr),He(b,fl)),De.mathMl===!0&&(He(me,Yr),He(b,Gu),He(b,fl))),Y.tagCheck=null,Y.attributeCheck=null,gt(S,"ADD_TAGS")&&(typeof S.ADD_TAGS=="function"?Y.tagCheck=S.ADD_TAGS:Zt(S.ADD_TAGS)&&(me===Be&&(me=Vt(me)),He(me,S.ADD_TAGS,Ee))),gt(S,"ADD_ATTR")&&(typeof S.ADD_ATTR=="function"?Y.attributeCheck=S.ADD_ATTR:Zt(S.ADD_ATTR)&&(b===I&&(b=Vt(b)),He(b,S.ADD_ATTR,Ee))),gt(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)&&He(Is,S.ADD_URI_SAFE_ATTR,Ee),gt(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)&&(Ke===qe&&(Ke=Vt(Ke)),He(Ke,S.FORBID_CONTENTS,Ee)),gt(S,"ADD_FORBID_CONTENTS")&&Zt(S.ADD_FORBID_CONTENTS)&&(Ke===qe&&(Ke=Vt(Ke)),He(Ke,S.ADD_FORBID_CONTENTS,Ee)),we&&(me["#text"]=!0),ge&&He(me,["html","head","body"]),me.table&&(He(me,["tbody"]),delete X.tbody),S.TRUSTED_TYPES_POLICY){if(typeof S.TRUSTED_TYPES_POLICY.createHTML!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof S.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ue=_;_=S.TRUSTED_TYPES_POLICY;try{R=M("")}catch(Ne){throw _=ue,Ne}}else S.TRUSTED_TYPES_POLICY===null?(_=void 0,R=""):(_===void 0&&(_=Z()),_&&typeof R=="string"&&(R=M("")));(ee.uponSanitizeElement.length>0||ee.uponSanitizeAttribute.length>0)&&me===Be&&(me=Vt(me)),ee.uponSanitizeAttribute.length>0&&b===I&&(b=Vt(b)),ts&&ts(S),Et=S},nt=He({},[...Zr,...Jr,...Ok]),pt=He({},[...Yr,...Lk]),ns=function(S){let W=E(S);(!W||!W.tagName)&&(W={namespaceURI:Ae,tagName:"template"});const ue=oi(S.tagName),Ne=oi(W.tagName);return Zs[S.namespaceURI]?S.namespaceURI===us?W.namespaceURI===G?ue==="svg":W.namespaceURI===Fs?ue==="svg"&&(Ne==="annotation-xml"||wn[Ne]):!!nt[ue]:S.namespaceURI===Fs?W.namespaceURI===G?ue==="math":W.namespaceURI===us?ue==="math"&&Js[Ne]:!!pt[ue]:S.namespaceURI===G?W.namespaceURI===us&&!Js[Ne]||W.namespaceURI===Fs&&!wn[Ne]?!1:!pt[ue]&&(D[ue]||!nt[ue]):!!(z==="application/xhtml+xml"&&Zs[S.namespaceURI]):!1},ps=function(S){ha(t.removed,{element:S});try{E(S).removeChild(S)}catch{if(g(S),!E(S))throw Vn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Gc=function(S){const W=k?k(S):S.childNodes;if(W){const Ne=[];tn(W,$e=>{ha(Ne,$e)}),tn(Ne,$e=>{try{g($e)}catch{}})}const ue=m?m(S):null;if(ue)for(let Ne=ue.length-1;Ne>=0;--Ne){const $e=ue[Ne],je=$e&&$e.name;if(typeof je=="string")try{S.removeAttribute(je)}catch{}}},Un=function(S,W){try{ha(t.removed,{attribute:W.getAttributeNode(S),from:W})}catch{ha(t.removed,{attribute:null,from:W})}if(W.removeAttribute(S),S==="is")if(Ie||Me)try{ps(W)}catch{}else try{W.setAttribute(S,"")}catch{}},Bg=function(S){const W=m?m(S):S.attributes;if(W)for(let ue=W.length-1;ue>=0;--ue){const Ne=W[ue],$e=Ne&&Ne.name;if(!(typeof $e!="string"||b[Ee($e)]))try{S.removeAttribute($e)}catch{}}},Hg=function(S){const W=[S];for(;W.length>0;){const ue=W.pop();(x?x(ue):ue.nodeType)===Us.element&&Bg(ue);const $e=k?k(ue):ue.childNodes;if($e)for(let je=$e.length-1;je>=0;--je)W.push($e[je])}},Kc=function(S){let W=null,ue=null;if(Ce)S="<remove></remove>"+S;else{const je=Uu(S,/^[\r\n\t ]+/);ue=je&&je[0]}z==="application/xhtml+xml"&&Ae===G&&(S='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+S+"</body></html>");const Ne=_?M(S):S;if(Ae===G)try{W=new d().parseFromString(Ne,z)}catch{}if(!W||!W.documentElement){W=F.createDocument(Ae,"template",null);try{W.documentElement.innerHTML=fs?R:Ne}catch{}}const $e=W.body||W.documentElement;return S&&ue&&$e.insertBefore(s.createTextNode(ue),$e.childNodes[0]||null),Ae===G?q.call(W,ge?"html":"body")[0]:ge?W.documentElement:$e},Wc=function(S){return O.call(S.ownerDocument||S,S,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Cr=function(S){var W,ue;S.normalize();const Ne=O.call(S.ownerDocument||S,S,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let $e=Ne.nextNode();for(;$e;){let At=$e.data;tn([ie,U,B],ot=>{At=ga(At,ot," ")}),$e.data=At,$e=Ne.nextNode()}const je=(W=(ue=S.querySelectorAll)===null||ue===void 0?void 0:ue.call(S,"template"))!==null&&W!==void 0?W:[];tn(Array.from(je),At=>{da(At.content)&&Cr(At.content)})},Zi=function(S){const W=w?w(S):null;return typeof W!="string"||Ee(W)!=="form"?!1:typeof S.nodeName!="string"||typeof S.textContent!="string"||typeof S.removeChild!="function"||S.attributes!==m(S)||typeof S.removeAttribute!="function"||typeof S.setAttribute!="function"||typeof S.namespaceURI!="string"||typeof S.insertBefore!="function"||typeof S.hasChildNodes!="function"||S.nodeType!==x(S)||S.childNodes!==k(S)},da=function(S){if(!x||typeof S!="object"||S===null)return!1;try{return x(S)===Us.documentFragment}catch{return!1}},Ka=function(S){if(!x||typeof S!="object"||S===null)return!1;try{return typeof x(S)=="number"}catch{return!1}};function Ys(be,S,W){tn(be,ue=>{ue.call(t,S,W,Et)})}const Zc=function(S){let W=null;if(Ys(ee.beforeSanitizeElements,S,null),Zi(S))return ps(S),!0;const ue=Ee(w?w(S):S.nodeName);if(Ys(ee.uponSanitizeElement,S,{tagName:ue,allowedTags:me}),he&&S.hasChildNodes()&&!Ka(S.firstElementChild)&&Pt(/<[/\w!]/g,S.innerHTML)&&Pt(/<[/\w!]/g,S.textContent)||he&&S.namespaceURI===G&&ue==="style"&&Ka(S.firstElementChild)||S.nodeType===Us.progressingInstruction||he&&S.nodeType===Us.comment&&Pt(/<[/\w]/g,S.data))return ps(S),!0;if(X[ue]||!(Y.tagCheck instanceof Function&&Y.tagCheck(ue))&&!me[ue]){if(!X[ue]&&Yc(ue)&&(P.tagNameCheck instanceof RegExp&&Pt(P.tagNameCheck,ue)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ue)))return!1;if(we&&!Ke[ue]){const $e=E(S),je=k(S);if(je&&$e){const At=je.length;for(let ot=At-1;ot>=0;--ot){const bt=Le?je[ot]:p(je[ot],!0);$e.insertBefore(bt,y(S))}}}return ps(S),!0}return(x?x(S):S.nodeType)===Us.element&&!ns(S)||(ue==="noscript"||ue==="noembed"||ue==="noframes")&&Pt(/<\/no(script|embed|frames)/i,S.innerHTML)?(ps(S),!0):(ye&&S.nodeType===Us.text&&(W=S.textContent,tn([ie,U,B],$e=>{W=ga(W,$e," ")}),S.textContent!==W&&(ha(t.removed,{element:S.cloneNode()}),S.textContent=W)),Ys(ee.afterSanitizeElements,S,null),!1)},Jc=function(S,W,ue){if(J[W]||Ve&&(W==="id"||W==="name")&&(ue in s||ue in $))return!1;const Ne=b[W]||Y.attributeCheck instanceof Function&&Y.attributeCheck(W,S);if(!(ce&&!J[W]&&Pt(re,W))){if(!(pe&&Pt(_e,W))){if(!Ne||J[W]){if(!(Yc(S)&&(P.tagNameCheck instanceof RegExp&&Pt(P.tagNameCheck,S)||P.tagNameCheck instanceof Function&&P.tagNameCheck(S))&&(P.attributeNameCheck instanceof RegExp&&Pt(P.attributeNameCheck,W)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(W,S))||W==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&Pt(P.tagNameCheck,ue)||P.tagNameCheck instanceof Function&&P.tagNameCheck(ue))))return!1}else if(!Is[W]){if(!Pt(xe,ga(ue,fe,""))){if(!((W==="src"||W==="xlink:href"||W==="href")&&S!=="script"&&Bu(ue,"data:")===0&&ht[S])){if(!(oe&&!Pt(V,ga(ue,fe,"")))){if(ue)return!1}}}}}}return!0},Vg=He({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Yc=function(S){return!Vg[oi(S)]&&Pt(de,S)},Qc=function(S){Ys(ee.beforeSanitizeAttributes,S,null);const W=S.attributes;if(!W||Zi(S))return;const ue={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:b,forceKeepAttr:void 0};let Ne=W.length;for(;Ne--;){const $e=W[Ne],je=$e.name,At=$e.namespaceURI,ot=$e.value,bt=Ee(je),kn=ot;let Nt=je==="value"?kn:Sk(kn);if(ue.attrName=bt,ue.attrValue=Nt,ue.keepAttr=!0,ue.forceKeepAttr=void 0,Ys(ee.uponSanitizeAttribute,S,ue),Nt=ue.attrValue,st&&(bt==="id"||bt==="name")&&Bu(Nt,j)!==0&&(Un(je,S),Nt=j+Nt),he&&Pt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){Un(je,S);continue}if(bt==="attributename"&&Uu(Nt,"href")){Un(je,S);continue}if(ue.forceKeepAttr)continue;if(!ue.keepAttr){Un(je,S);continue}if(!se&&Pt(/\/>/i,Nt)){Un(je,S);continue}ye&&tn([ie,U,B],ed=>{Nt=ga(Nt,ed," ")});const Xc=Ee(S.nodeName);if(!Jc(Xc,bt,Nt)){Un(je,S);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(Xc,bt)){case"TrustedHTML":{Nt=M(Nt);break}case"TrustedScriptURL":{Nt=N(Nt);break}}if(Nt!==kn)try{At?S.setAttributeNS(At,je,Nt):S.setAttribute(je,Nt),Zi(S)?ps(S):$u(t.removed)}catch{Un(je,S)}}Ys(ee.afterSanitizeAttributes,S,null)},Ji=function(S){let W=null;const ue=Wc(S);for(Ys(ee.beforeSanitizeShadowDOM,S,null);W=ue.nextNode();)if(Ys(ee.uponSanitizeShadowNode,W,null),Zc(W),Qc(W),da(W.content)&&Ji(W.content),(x?x(W):W.nodeType)===Us.element){const $e=v?v(W):W.shadowRoot;da($e)&&(Er($e),Ji($e))}Ys(ee.afterSanitizeShadowDOM,S,null)},Er=function(S){const W=[{node:S,shadow:null}];for(;W.length>0;){const ue=W.pop();if(ue.shadow){Ji(ue.shadow);continue}const Ne=ue.node,je=(x?x(Ne):Ne.nodeType)===Us.element,At=k?k(Ne):Ne.childNodes;if(At)for(let ot=At.length-1;ot>=0;--ot)W.push({node:At[ot],shadow:null});if(je){const ot=w?w(Ne):null;if(typeof ot=="string"&&Ee(ot)==="template"){const bt=Ne.content;da(bt)&&W.push({node:bt,shadow:null})}}if(je){const ot=v?v(Ne):Ne.shadowRoot;da(ot)&&W.push({node:null,shadow:ot},{node:ot,shadow:null})}}};return t.sanitize=function(be){let S=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},W=null,ue=null,Ne=null,$e=null;if(fs=!be,fs&&(be="<!-->"),typeof be!="string"&&!Ka(be)&&(be=Rk(be),typeof be!="string"))throw Vn("dirty is not a string, aborting");if(!t.isSupported)return be;ke||Oe(S),t.removed=[];const je=Le&&typeof be!="string"&&Ka(be);if(je){const bt=w?w(be):be.nodeName;if(typeof bt=="string"){const kn=Ee(bt);if(!me[kn]||X[kn])throw Vn("root node is forbidden and cannot be sanitized in-place")}if(Zi(be))throw Vn("root node is clobbered and cannot be sanitized in-place");try{Er(be)}catch(kn){throw Gc(be),kn}}else if(Ka(be))W=Kc("<!---->"),ue=W.ownerDocument.importNode(be,!0),ue.nodeType===Us.element&&ue.nodeName==="BODY"||ue.nodeName==="HTML"?W=ue:W.appendChild(ue),Er(ue);else{if(!Ie&&!ye&&!ge&&be.indexOf("<")===-1)return _&&Fe?M(be):be;if(W=Kc(be),!W)return Ie?null:Fe?R:""}W&&Ce&&ps(W.firstChild);const At=Wc(je?be:W);try{for(;Ne=At.nextNode();)Zc(Ne),Qc(Ne),da(Ne.content)&&Ji(Ne.content)}catch(bt){throw je&&Gc(be),bt}if(je)return tn(t.removed,bt=>{bt.element&&Hg(bt.element)}),ye&&Cr(be),be;if(Ie){if(ye&&Cr(W),Me)for($e=A.call(W.ownerDocument);W.firstChild;)$e.appendChild(W.firstChild);else $e=W;return(b.shadowroot||b.shadowrootmode)&&($e=K.call(n,$e,!0)),$e}let ot=ge?W.outerHTML:W.innerHTML;return ge&&me["!doctype"]&&W.ownerDocument&&W.ownerDocument.doctype&&W.ownerDocument.doctype.name&&Pt(Bk,W.ownerDocument.doctype.name)&&(ot="<!DOCTYPE "+W.ownerDocument.doctype.name+`>
`+ot),ye&&tn([ie,U,B],bt=>{ot=ga(ot,bt," ")}),_&&Fe?M(ot):ot},t.setConfig=function(){let be=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Oe(be),ke=!0},t.clearConfig=function(){Et=null,ke=!1,_=T,R=""},t.isValidAttribute=function(be,S,W){Et||Oe({});const ue=Ee(be),Ne=Ee(S);return Jc(ue,Ne,W)},t.addHook=function(be,S){typeof S=="function"&&ha(ee[be],S)},t.removeHook=function(be,S){if(S!==void 0){const W=wk(ee[be],S);return W===-1?void 0:kk(ee[be],W,1)[0]}return $u(ee[be])},t.removeHooks=function(be){ee[be]=[]},t.removeAllHooks=function(){ee=Wu()},t}var Zu=Eg();function Fc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var oa=Fc();function Ag(e){oa=e}var bi={exec:()=>null};function it(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},zk=/^(?:[ \t]*(?:\n|$))+/,qk=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Gk=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Wi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Kk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,$c=/(?:[*+-]|\d{1,9}[.)])/,Rg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Ig=it(Rg).replace(/bull/g,$c).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),Wk=it(Rg).replace(/bull/g,$c).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Uc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Zk=/^[^\n]+/,Bc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Jk=it(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Bc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),Yk=it(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,$c).getRegex(),Sr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Hc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Qk=it("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Hc).replace("tag",Sr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Og=it(Uc).replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex(),Xk=it(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Og).getRegex(),Vc={blockquote:Xk,code:qk,def:Jk,fences:Gk,heading:Kk,hr:Wi,html:Qk,lheading:Ig,list:Yk,newline:zk,paragraph:Og,table:bi,text:Zk},Ju=it("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex(),e1={...Vc,lheading:Wk,table:Ju,paragraph:it(Uc).replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ju).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Sr).getRegex()},t1={...Vc,html:it(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Hc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:bi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:it(Uc).replace("hr",Wi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Ig).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},s1=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,n1=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Lg=/^( {2,}|\\)\n(?!\s*$)/,a1=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Tr=/[\p{P}\p{S}]/u,jc=/[\s\p{P}\p{S}]/u,Ng=/[^\s\p{P}\p{S}]/u,i1=it(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,jc).getRegex(),Dg=/(?!~)[\p{P}\p{S}]/u,l1=/(?!~)[\s\p{P}\p{S}]/u,r1=/(?:[^\s\p{P}\p{S}]|~)/u,o1=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Mg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,c1=it(Mg,"u").replace(/punct/g,Tr).getRegex(),d1=it(Mg,"u").replace(/punct/g,Dg).getRegex(),Pg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",u1=it(Pg,"gu").replace(/notPunctSpace/g,Ng).replace(/punctSpace/g,jc).replace(/punct/g,Tr).getRegex(),f1=it(Pg,"gu").replace(/notPunctSpace/g,r1).replace(/punctSpace/g,l1).replace(/punct/g,Dg).getRegex(),p1=it("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Ng).replace(/punctSpace/g,jc).replace(/punct/g,Tr).getRegex(),h1=it(/\\(punct)/,"gu").replace(/punct/g,Tr).getRegex(),g1=it(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),m1=it(Hc).replace("(?:-->|$)","-->").getRegex(),v1=it("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",m1).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Wl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,b1=it(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Wl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Fg=it(/^!?\[(label)\]\[(ref)\]/).replace("label",Wl).replace("ref",Bc).getRegex(),$g=it(/^!?\[(ref)\](?:\[\])?/).replace("ref",Bc).getRegex(),y1=it("reflink|nolink(?!\\()","g").replace("reflink",Fg).replace("nolink",$g).getRegex(),zc={_backpedal:bi,anyPunctuation:h1,autolink:g1,blockSkip:o1,br:Lg,code:n1,del:bi,emStrongLDelim:c1,emStrongRDelimAst:u1,emStrongRDelimUnd:p1,escape:s1,link:b1,nolink:$g,punctuation:i1,reflink:Fg,reflinkSearch:y1,tag:v1,text:a1,url:bi},x1={...zc,link:it(/^!?\[(label)\]\((.*?)\)/).replace("label",Wl).getRegex(),reflink:it(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Wl).getRegex()},No={...zc,emStrongRDelimAst:f1,emStrongLDelim:d1,url:it(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},_1={...No,br:it(Lg).replace("{2,}","*").getRegex(),text:it(No.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},pl={normal:Vc,gfm:e1,pedantic:t1},si={normal:zc,gfm:No,breaks:_1,pedantic:x1},w1={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Yu=e=>w1[e];function Vs(e,t){if(t){if(Qt.escapeTest.test(e))return e.replace(Qt.escapeReplace,Yu)}else if(Qt.escapeTestNoEncode.test(e))return e.replace(Qt.escapeReplaceNoEncode,Yu);return e}function Qu(e){try{e=encodeURI(e).replace(Qt.percentDecode,"%")}catch{return null}return e}function Xu(e,t){var i;const s=e.replace(Qt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Qt.slashPipe,"|");return n}function ni(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function k1(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function ef(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function S1(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Zl=class{constructor(e){rt(this,"options");rt(this,"rules");rt(this,"lexer");this.options=e||oa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ni(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=S1(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=ni(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ni(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ni(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const f=i.at(-1);if((f==null?void 0:f.type)==="code")break;if((f==null?void 0:f.type)==="blockquote"){const p=f,g=p.raw+`
`+s.join(`
`),y=this.blockquote(g);i[i.length-1]=y,n=n.substring(0,n.length-p.raw.length)+y.raw,a=a.substring(0,a.length-p.text.length)+y.text;break}else if((f==null?void 0:f.type)==="list"){const p=f,g=p.raw+`
`+s.join(`
`),y=this.list(g);i[i.length-1]=y,n=n.substring(0,n.length-f.raw.length)+y.raw,a=a.substring(0,a.length-p.raw.length)+y.raw,s=g.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,E=>" ".repeat(3*E.length)),f=e.split(`
`,1)[0],p=!u.trim(),g=0;if(this.options.pedantic?(g=2,d=u.trimStart()):p?g=t[1].length+1:(g=t[2].search(this.rules.other.nonSpaceChar),g=g>4?1:g,d=u.slice(g),g+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const E=this.rules.other.nextBulletRegex(g),v=this.rules.other.hrRegex(g),m=this.rules.other.fencesBeginRegex(g),x=this.rules.other.headingBeginRegex(g),w=this.rules.other.htmlBeginRegex(g);for(;e;){const _=e.split(`
`,1)[0];let R;if(f=_,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),R=f):R=f.replace(this.rules.other.tabCharGlobal,"    "),m.test(f)||x.test(f)||w.test(f)||E.test(f)||v.test(f))break;if(R.search(this.rules.other.nonSpaceChar)>=g||!f.trim())d+=`
`+R.slice(g);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||x.test(u)||v.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=_+`
`,e=e.substring(_.length+1),u=R.slice(g)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let y=null,k;this.options.gfm&&(y=this.rules.other.listIsTask.exec(d),y&&(k=y[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!y,checked:k,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=Xu(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(Xu(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ni(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=k1(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),ef(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return ef(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const g=f.slice(1,-1);return{type:"em",raw:f,text:g,tokens:this.lexer.inlineTokens(g)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},dn=class Do{constructor(t){rt(this,"tokens");rt(this,"options");rt(this,"state");rt(this,"tokenizer");rt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||oa,this.options.tokenizer=this.options.tokenizer||new Zl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Qt,block:pl.normal,inline:si.normal};this.options.pedantic?(s.block=pl.pedantic,s.inline=si.pedantic):this.options.gfm&&(s.block=pl.gfm,this.options.breaks?s.inline=si.breaks:s.inline=si.gfm),this.tokenizer.rules=s}static get rules(){return{block:pl,inline:si}}static lex(t,s){return new Do(s).lex(t)}static lexInline(t,s){return new Do(s).inlineTokens(t)}lex(t){t=t.replace(Qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Qt.tabCharGlobal,"    ").replace(Qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let g;this.options.extensions.startInline.forEach(y=>{g=y.call({lexer:this},p),typeof g=="number"&&g>=0&&(f=Math.min(f,g))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Jl=class{constructor(e){rt(this,"options");rt(this,"parser");this.options=e||oa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Qt.notSpaceStart))==null?void 0:i[0],a=e.replace(Qt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Vs(n)+'">'+(s?a:Vs(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Vs(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Vs(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Vs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=Qu(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Vs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=Qu(e);if(a===null)return Vs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Vs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Vs(e.text)}},qc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},un=class Mo{constructor(t){rt(this,"options");rt(this,"renderer");rt(this,"textRenderer");this.options=t||oa,this.options.renderer=this.options.renderer||new Jl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new qc}static parse(t,s){return new Mo(s).parse(t)}static parseInline(t,s){return new Mo(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Xr,xl=(Xr=class{constructor(e){rt(this,"options");rt(this,"block");this.options=e||oa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?dn.lex:dn.lexInline}provideParser(){return this.block?un.parse:un.parseInline}},rt(Xr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Xr),T1=class{constructor(...e){rt(this,"defaults",Fc());rt(this,"options",this.setOptions);rt(this,"parse",this.parseMarkdown(!0));rt(this,"parseInline",this.parseMarkdown(!1));rt(this,"Parser",un);rt(this,"Renderer",Jl);rt(this,"TextRenderer",qc);rt(this,"Lexer",dn);rt(this,"Tokenizer",Zl);rt(this,"Hooks",xl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Jl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Zl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new xl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];xl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return dn.lex(e,t??this.defaults)}parser(e,t){return un.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?dn.lex:dn.lexInline,o=i.hooks?i.hooks.provideParser():e?un.parse:un.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Vs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},sa=new T1;function tt(e,t){return sa.parse(e,t)}tt.options=tt.setOptions=function(e){return sa.setOptions(e),tt.defaults=sa.defaults,Ag(tt.defaults),tt};tt.getDefaults=Fc;tt.defaults=oa;tt.use=function(...e){return sa.use(...e),tt.defaults=sa.defaults,Ag(tt.defaults),tt};tt.walkTokens=function(e,t){return sa.walkTokens(e,t)};tt.parseInline=sa.parseInline;tt.Parser=un;tt.parser=un.parse;tt.Renderer=Jl;tt.TextRenderer=qc;tt.Lexer=dn;tt.lexer=dn.lex;tt.Tokenizer=Zl;tt.Hooks=xl;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;un.parse;dn.lex;const C1={breaks:!0,gfm:!0};function tf(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,C1);return typeof Zu<"u"?Zu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function E1(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const A1={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function R1(e){return A1[e]||"wrench"}const I1=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function sf(e){if(!e)return[];const t=e.match(I1);return t?[...new Set(t)]:[]}const O1={template:`
    <div class="chat-container page-fade-in" role="region" aria-label="Chat">
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=te(()=>t.value.trim().length>0&&!s.value),u=h(Ze.state||"disconnected");let f=null,p=null;const g=te(()=>{const F=u.value;return F==="connected"?"Connected":F==="reconnecting"?"Reconnecting…":F==="connecting"?"Connecting…":"REST fallback"}),y=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],k=te(()=>{const F=Math.floor(i.value/4)%y.length,O=i.value;return O>3?`${y[F]} (${O}s)`:y[0]});function E(){Ot(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function v(){if(!a.value)return;const F=a.value;F.style.height="auto",F.style.height=Math.min(F.scrollHeight,120)+"px"}function m(F,O,A={}){const q={id:++o,role:F,content:O,timestamp:Date.now(),html:F==="bot"?tf(O):"",tools_used:A.tools_used||[],is_error:A.is_error||!1,images:F==="bot"?sf(O):[],files:A.files||[],_showTools:!1};return e.value.push(q),E(),F==="bot"&&Ot(()=>x()),q}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const A=document.createElement("button");A.className="chat-code-copy",A.textContent="Copy",A.addEventListener("click",()=>{const q=O.querySelector("code"),K=q?q.textContent:O.textContent;navigator.clipboard.writeText(K).then(()=>{A.textContent="Copied!",setTimeout(()=>{A.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(A)})}function w(F){if(F===0)return!0;const O=e.value[F-1],A=e.value[F],q=new Date(O.timestamp).toDateString(),K=new Date(A.timestamp).toDateString();return q!==K}function _(F){const O=new Date(F),A=new Date;if(O.toDateString()===A.toDateString())return"Today";const q=new Date(A);return q.setDate(q.getDate()-1),O.toDateString()===q.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function R(F){t.value=F,Ot(()=>Z())}function T(F){window.open(F,"_blank","noopener")}function C(F){F.target.style.display="none"}function L(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function H(){r&&(clearInterval(r),r=null),i.value=0}function M(F){s.value&&(s.value=!1,H(),F.type==="chat_response"?m("bot",F.content,{tools_used:F.tools_used||[],is_error:F.is_error||!1,files:F.files||[]}):F.type==="chat_error"&&m("bot",F.error||"Unknown error",{is_error:!0}),Ot(()=>{var O;return(O=a.value)==null?void 0:O.focus()}))}async function N(F){try{const O=await Q.post("/api/chat",{content:F,channel_id:l.value});m("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){m("bot",O.message||"Failed to send message",{is_error:!0})}}async function Z(){const F=t.value.trim();if(!F||s.value)return;m("user",F),t.value="",s.value=!0,L(),a.value&&(a.value.style.height="auto"),Ze.connected&&Ze.sendChat(F,{channelId:l.value})||(await N(F),s.value=!1,H()),Ot(()=>{var A;return(A=a.value)==null?void 0:A.focus()})}async function ne(){try{if(!l.value){const O=await Q.get("/api/auth/session");l.value=O.channel_id||O.user_id||"web-user"}const F=await Q.get("/api/sessions/"+encodeURIComponent(l.value));if(F&&F.messages&&F.messages.length>0){for(const O of F.messages){const A=O.role==="user"?"user":"bot";let q=O.content||"";if(A==="user"){const ee=q.match(/^\[.*?\]:\s*/);ee&&(q=q.slice(ee[0].length))}if(!q.trim())continue;const K={id:++o,role:A,content:q,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:A==="bot"?tf(q):"",tools_used:[],is_error:!1,images:A==="bot"?sf(q):[],files:[],_showTools:!1};e.value.push(K)}Ot(()=>{E(),x()})}}catch{}}return Ye(()=>{Ze.subscribe("chat",M),u.value=Ze.state||"disconnected",f=Ze.onStateChange,p=(F,O)=>{u.value=F,f&&f(F,O)},Ze.onStateChange=p,ne(),Ot(()=>{var F;return(F=a.value)==null?void 0:F.focus()})}),_t(()=>{Ze.unsubscribe("chat",M),Ze.onStateChange===p&&(Ze.onStateChange=f),H()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:g,typingText:k,suggestions:c,send:Z,autoResize:v,formatTime:E1,formatDate:_,showDateSeparator:w,useSuggestion:R,openImage:T,onImageError:C,getToolIcon:R1}}},L1={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),g=te(()=>e.value==="custom"),y=te(()=>[...i.value,...l.value]),k=te(()=>l.value.includes(e.value)),E=te(()=>{var T;return g.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),v=te(()=>{var T;return g.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),m=te(()=>{var T;return g.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function x(){d.value=!0;try{const T=await Q.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function w(){r.value=!0,c.value=null,o.value=!1;try{await Q.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function _(){const T=u.value.trim();if(T){p.value=!0,c.value=null;try{await Q.post("/api/personality/presets",{name:T,display_name:E.value,identity:v.value,voice:m.value}),f.value=!1,u.value="",await x(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{p.value=!1}}}async function R(){if(await bs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await Q.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(C){c.value=C.message}}}return Ye(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:y,isCustom:g,isUserPreset:k,previewName:E,previewIdentity:v,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:w,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:_,deletePreset:R,builtinPresets:i,userPresets:l}},template:`
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
  `},wt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Ug=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:pk,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:O1,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:rw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:hw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:kw,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:L1,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:lk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:wt("/operations","live")},{path:"/agents",redirect:wt("/operations","agents")},{path:"/loops",redirect:wt("/operations","loops")},{path:"/processes",redirect:wt("/operations","processes")},{path:"/schedules",redirect:wt("/operations","schedules")},{path:"/audit",redirect:wt("/history","audit")},{path:"/sessions",redirect:wt("/history","sessions")},{path:"/traces",redirect:wt("/history","traces")},{path:"/usage",redirect:wt("/history","usage")},{path:"/tools",redirect:wt("/capabilities","tools")},{path:"/skills",redirect:wt("/capabilities","skills")},{path:"/knowledge",redirect:wt("/capabilities","knowledge")},{path:"/memory",redirect:wt("/capabilities","memory")},{path:"/learned",redirect:wt("/capabilities","learned")},{path:"/health",redirect:wt("/system","health")},{path:"/resources",redirect:wt("/system","resources")},{path:"/logs",redirect:wt("/system","logs")},{path:"/config",redirect:wt("/system","config")},{path:"/host-access",redirect:wt("/system","host-access")},{path:"/internals",redirect:wt("/system","internals")}],yi=K_({history:T_(),routes:Ug});yi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const N1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{Q.setPersist(a.value),await Q.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},D1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const g=h("starting"),y=h(""),k=Ug.filter(O=>O.meta),E=te(()=>["Workspace","Operate","Observe","Manage"].map(O=>({name:O,routes:k.filter(A=>A.meta.section===O)})).filter(O=>O.routes.length)),v=te(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.label)||"Odin"}),m=te(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.section)||"Management"}),x=te(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.description)||"Management console"});Q.onSessionExpired=()=>{t.value=!0,Ze.disconnect(),Q.setToken(""),e.value="login"};function w(O){var A;if((O.ctrlKey||O.metaKey)&&O.key.toLowerCase()==="k"){e.value==="ready"&&(O.preventDefault(),Du());return}if(n.value&&O.key==="Tab"){const q=[...((A=a.value)==null?void 0:A.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(q.length){const K=q[0],ee=q[q.length-1];if(O.shiftKey&&(document.activeElement===K||!a.value.contains(document.activeElement))){O.preventDefault(),ee.focus();return}if(!O.shiftKey&&(document.activeElement===ee||!a.value.contains(document.activeElement))){O.preventDefault(),K.focus();return}}}if(O.key==="Escape"&&n.value){n.value=!1,O.preventDefault();return}if(O.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(O.target.tagName)){O.preventDefault();const q=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');q&&q.focus()}}function _(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ye(async()=>{document.addEventListener("keydown",w),r=window.matchMedia("(max-width: 900px)"),_(),r.addEventListener("change",_);const O=await Q.check();O.ok?(e.value="ready",ne()):O.needsAuth?e.value="login":(e.value="ready",ne())});function R(){t.value=!1,e.value="ready",ne()}async function T(){await Q.logout(),Ze.disconnect(),e.value="login"}function C(){s.value=!s.value}function L(){n.value=!n.value}Xt(n,async O=>{var A,q;if(O)o=document.activeElement,await Ot(),(q=(A=a.value)==null?void 0:A.querySelector(".nav-item"))==null||q.focus();else if(o!=null&&o.isConnected){const K=o;o=null,requestAnimationFrame(()=>K.focus())}});const H=te(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(O,A="info",q=3e3){f.value={text:O,level:A},clearTimeout(p),p=setTimeout(()=>{f.value=null},q)}let N=null,Z=!1;function ne(){Ze.onStatusChange=O=>{c.value=O},Ze.onLatency=O=>{u.value=O},Ze.onStateChange=(O,A)=>{d.value=O,O==="connected"?(Z&&M("Connection restored","success"),Z=!0):O==="reconnecting"&&A.attempt===1&&M("Connection lost — reconnecting…","warn")},Ze.connect(),F(),N&&clearInterval(N),N=setInterval(F,15e3)}async function F(){try{const O=await Q.get("/api/status");g.value=O.status==="online"?"online":"starting";const A=O.uptime_seconds||0,q=Math.floor(A/3600),K=Math.floor(A%3600/60);y.value=`${q}h ${K}m uptime`}catch{g.value="offline",y.value=""}}return _t(()=>{N&&clearInterval(N),Ze.disconnect(),document.removeEventListener("keydown",w),r==null||r.removeEventListener("change",_)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:H,wsToast:f,botStatus:g,botUptime:y,navRoutes:k,navGroups:E,currentPage:v,currentSection:m,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:R,logout:T,toggleSidebar:C,toggleMobileNavigation:L,openPalette:Du}}},$n=$l(D1);$n.component("odin-icon",dk);$n.component("login-screen",N1);$n.component("toast-container",U0);$n.component("confirm-host",B0);$n.component("command-palette",ck);$n.directive("modal-focus",fk);$n.use(yi);$n.mount("#app");
