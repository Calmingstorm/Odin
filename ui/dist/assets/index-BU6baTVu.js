var Fg=Object.defineProperty;var $g=(e,t,s)=>t in e?Fg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var rt=(e,t,s)=>$g(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Ug{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Cr("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new Bg(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Cr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Cr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Cr extends Error{constructor(t){super(t),this.name="AuthError"}}class Bg extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Hg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){if(a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const Y=new Ug,We=new Hg(Y);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ys(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ge={},wa=[],Bt=()=>{},xa=()=>!1,na=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Zl=e=>e.startsWith("onUpdate:"),qe=Object.assign,Mo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Vg=Object.prototype.hasOwnProperty,et=(e,t)=>Vg.call(e,t),ve=Array.isArray,ka=e=>za(e)==="[object Map]",aa=e=>za(e)==="[object Set]",ed=e=>za(e)==="[object Date]",jg=e=>za(e)==="[object RegExp]",Ae=e=>typeof e=="function",Me=e=>typeof e=="string",Kt=e=>typeof e=="symbol",Xe=e=>e!==null&&typeof e=="object",Po=e=>(Xe(e)||Ae(e))&&Ae(e.then)&&Ae(e.catch),tf=Object.prototype.toString,za=e=>tf.call(e),zg=e=>za(e).slice(8,-1),Jl=e=>za(e)==="[object Object]",Yl=e=>Me(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,fn=ys(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),qg=ys("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Ql=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Gg=/-\w/g,it=Ql(e=>e.replace(Gg,t=>t.slice(1).toUpperCase())),Kg=/\B([A-Z])/g,rs=Ql(e=>e.replace(Kg,"-$1").toLowerCase()),ia=Ql(e=>e.charAt(0).toUpperCase()+e.slice(1)),Sa=Ql(e=>e?`on${ia(e)}`:""),Dt=(e,t)=>!Object.is(e,t),Ta=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},sf=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Xl=e=>{const t=parseFloat(e);return isNaN(t)?e:t},yl=e=>{const t=Me(e)?Number(e):NaN;return isNaN(t)?e:t};let td;const er=()=>td||(td=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Wg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Zg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Jg=ys(Zg);function $i(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Me(n)?nf(n):$i(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Me(e)||Xe(e))return e}const Yg=/;(?![^(]*\))/g,Qg=/:([^]+)/,Xg=/\/\*[^]*?\*\//g;function nf(e){const t={};return e.replace(Xg,"").split(Yg).forEach(s=>{if(s){const n=s.split(Qg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function Ui(e){let t="";if(Me(e))t=e;else if(ve(e))for(let s=0;s<e.length;s++){const n=Ui(e[s]);n&&(t+=n+" ")}else if(Xe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function em(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Me(t)&&(e.class=Ui(t)),s&&(e.style=$i(s)),e}const tm="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",sm="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",nm="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",am="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",im=ys(tm),lm=ys(sm),rm=ys(nm),om=ys(am),cm="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",dm=ys(cm);function af(e){return!!e||e===""}function um(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=mn(e[n],t[n]);return s}function mn(e,t){if(e===t)return!0;let s=ed(e),n=ed(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Kt(e),n=Kt(t),s||n)return e===t;if(s=ve(e),n=ve(t),s||n)return s&&n?um(e,t):!1;if(s=Xe(e),n=Xe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!mn(e[l],t[l]))return!1}}return String(e)===String(t)}function tr(e,t){return e.findIndex(s=>mn(s,t))}const lf=e=>!!(e&&e.__v_isRef===!0),rf=e=>Me(e)?e:e==null?"":ve(e)||Xe(e)&&(e.toString===tf||!Ae(e.toString))?lf(e)?rf(e.value):JSON.stringify(e,of,2):String(e),of=(e,t)=>lf(t)?of(e,t.value):ka(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Er(n,i)+" =>"]=a,s),{})}:aa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Er(s))}:Kt(t)?Er(t):Xe(t)&&!ve(t)&&!Jl(t)?String(t):t,Er=(e,t="")=>{var s;return Kt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function fm(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let It;class Fo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&It&&(It.active?(this.parent=It,this.index=(It.scopes||(It.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=It;try{return It=this,t()}finally{It=s}}}on(){++this._on===1&&(this.prevScope=It,It=this)}off(){if(this._on>0&&--this._on===0){if(It===this)It=this.prevScope;else{let t=It;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function pm(e){return new Fo(e)}function cf(){return It}function hm(e,t=!1){It&&It.cleanups.push(e)}let ct;const Ar=new WeakSet;class xi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,It&&(It.active?It.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Ar.has(this)&&(Ar.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||uf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,sd(this),ff(this);const t=ct,s=Ls;ct=this,Ls=!0;try{return this.fn()}finally{pf(this),ct=t,Ls=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Bo(t);this.deps=this.depsTail=void 0,sd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Ar.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Xr(this)&&this.run()}get dirty(){return Xr(this)}}let df=0,ci,di;function uf(e,t=!1){if(e.flags|=8,t){e.next=di,di=e;return}e.next=ci,ci=e}function $o(){df++}function Uo(){if(--df>0)return;if(di){let t=di;for(di=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;ci;){let t=ci;for(ci=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function ff(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function pf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Bo(n),gm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Xr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(hf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function hf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===_i)||(e.globalVersion=_i,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Xr(e))))return;e.flags|=2;const t=e.dep,s=ct,n=Ls;ct=e,Ls=!0;try{ff(e);const a=e.fn(e._value);(t.version===0||Dt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ct=s,Ls=n,pf(e),e.flags&=-3}}function Bo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Bo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function gm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function mm(e,t){e.effect instanceof xi&&(e=e.effect.fn);const s=new xi(e);t&&qe(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function vm(e){e.effect.stop()}let Ls=!0;const gf=[];function vn(){gf.push(Ls),Ls=!1}function bn(){const e=gf.pop();Ls=e===void 0?!0:e}function sd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ct;ct=void 0;try{t()}finally{ct=s}}}let _i=0;class bm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class sr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ct||!Ls||ct===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ct)s=this.activeLink=new bm(ct,this),ct.deps?(s.prevDep=ct.depsTail,ct.depsTail.nextDep=s,ct.depsTail=s):ct.deps=ct.depsTail=s,mf(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ct.depsTail,s.nextDep=void 0,ct.depsTail.nextDep=s,ct.depsTail=s,ct.deps===s&&(ct.deps=n)}return s}trigger(t){this.version++,_i++,this.notify(t)}notify(t){$o();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Uo()}}}function mf(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)mf(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const xl=new WeakMap,Wn=Symbol(""),eo=Symbol(""),wi=Symbol("");function zt(e,t,s){if(Ls&&ct){let n=xl.get(e);n||xl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new sr),a.map=n,a.key=s),a.track()}}function rn(e,t,s,n,a,i){const l=xl.get(e);if(!l){_i++;return}const r=o=>{o&&o.trigger()};if($o(),t==="clear")l.forEach(r);else{const o=ve(e),c=o&&Yl(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,f)=>{(f==="length"||f===wi||!Kt(f)&&f>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(wi)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Wn)),ka(e)&&r(l.get(eo)));break;case"delete":o||(r(l.get(Wn)),ka(e)&&r(l.get(eo)));break;case"set":ka(e)&&r(l.get(Wn));break}}Uo()}function ym(e,t){const s=xl.get(e);return s&&s.get(t)}function ua(e){const t=Ze(e);return t===e?t:(zt(t,"iterate",wi),cs(e)?t:t.map(Ds))}function nr(e){return zt(e=Ze(e),"iterate",wi),e}function qs(e,t){return Ks(e)?La(pn(e)?Ds(t):t):Ds(t)}const xm={__proto__:null,[Symbol.iterator](){return Rr(this,Symbol.iterator,e=>qs(this,e))},concat(...e){return ua(this).concat(...e.map(t=>ve(t)?ua(t):t))},entries(){return Rr(this,"entries",e=>(e[1]=qs(this,e[1]),e))},every(e,t){return Qs(this,"every",e,t,void 0,arguments)},filter(e,t){return Qs(this,"filter",e,t,s=>s.map(n=>qs(this,n)),arguments)},find(e,t){return Qs(this,"find",e,t,s=>qs(this,s),arguments)},findIndex(e,t){return Qs(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Qs(this,"findLast",e,t,s=>qs(this,s),arguments)},findLastIndex(e,t){return Qs(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Qs(this,"forEach",e,t,void 0,arguments)},includes(...e){return Ir(this,"includes",e)},indexOf(...e){return Ir(this,"indexOf",e)},join(e){return ua(this).join(e)},lastIndexOf(...e){return Ir(this,"lastIndexOf",e)},map(e,t){return Qs(this,"map",e,t,void 0,arguments)},pop(){return Wa(this,"pop")},push(...e){return Wa(this,"push",e)},reduce(e,...t){return nd(this,"reduce",e,t)},reduceRight(e,...t){return nd(this,"reduceRight",e,t)},shift(){return Wa(this,"shift")},some(e,t){return Qs(this,"some",e,t,void 0,arguments)},splice(...e){return Wa(this,"splice",e)},toReversed(){return ua(this).toReversed()},toSorted(e){return ua(this).toSorted(e)},toSpliced(...e){return ua(this).toSpliced(...e)},unshift(...e){return Wa(this,"unshift",e)},values(){return Rr(this,"values",e=>qs(this,e))}};function Rr(e,t,s){const n=nr(e),a=n[t]();return n!==e&&!cs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const _m=Array.prototype;function Qs(e,t,s,n,a,i){const l=nr(e),r=l!==e&&!cs(e),o=l[t];if(o!==_m[t]){const u=o.apply(e,i);return r?Ds(u):u}let c=s;l!==e&&(r?c=function(u,f){return s.call(this,qs(e,u),f,e)}:s.length>2&&(c=function(u,f){return s.call(this,u,f,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function nd(e,t,s,n){const a=nr(e),i=a!==e&&!cs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=qs(e,c)),s.call(this,c,qs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?qs(e,o):o}function Ir(e,t,s){const n=Ze(e);zt(n,"iterate",wi);const a=n[t](...s);return(a===-1||a===!1)&&Bi(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function Wa(e,t,s=[]){vn(),$o();const n=Ze(e)[t].apply(e,s);return Uo(),bn(),n}const wm=ys("__proto__,__v_isRef,__isVue"),vf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Kt));function km(e){Kt(e)||(e=String(e));const t=Ze(this);return zt(t,"has",e),t.hasOwnProperty(e)}class bf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Sf:kf:i?wf:_f).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ve(t);if(!a){let o;if(l&&(o=xm[s]))return o;if(s==="hasOwnProperty")return km}const r=Reflect.get(t,s,Tt(t)?t:n);if((Kt(s)?vf.has(s):wm(s))||(a||zt(t,"get",s),i))return r;if(Tt(r)){const o=l&&Yl(s)?r:r.value;return a&&Xe(o)?_l(o):o}return Xe(r)?a?_l(r):Fn(r):r}}class yf extends bf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ve(t)&&Yl(s);if(!this._isShallow){const c=Ks(i);if(!cs(n)&&!Ks(n)&&(i=Ze(i),n=Ze(n)),!l&&Tt(i)&&!Tt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:et(t,s),o=Reflect.set(t,s,n,Tt(t)?t:a);return t===Ze(a)&&(r?Dt(n,i)&&rn(t,"set",s,n):rn(t,"add",s,n)),o}deleteProperty(t,s){const n=et(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&rn(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Kt(s)||!vf.has(s))&&zt(t,"has",s),n}ownKeys(t){return zt(t,"iterate",ve(t)?"length":Wn),Reflect.ownKeys(t)}}class xf extends bf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Sm=new yf,Tm=new xf,Cm=new yf(!0),Em=new xf(!0),to=e=>e,Yi=e=>Reflect.getPrototypeOf(e);function Am(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=ka(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?to:t?La:Ds;return!t&&zt(i,"iterate",o?eo:Wn),qe(Object.create(c),{next(){const{value:u,done:f}=c.next();return f?{value:u,done:f}:{value:r?[d(u[0]),d(u[1])]:d(u),done:f}}})}}function Qi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Rm(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);e||(Dt(a,r)&&zt(l,"get",a),zt(l,"get",r));const{has:o}=Yi(l),c=t?to:e?La:Ds;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&zt(Ze(a),"iterate",Wn),a.size},has(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);return e||(Dt(a,r)&&zt(l,"has",a),zt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ze(r),c=t?to:e?La:Ds;return!e&&zt(o,"iterate",Wn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return qe(s,e?{add:Qi("add"),set:Qi("set"),delete:Qi("delete"),clear:Qi("clear")}:{add(a){const i=Ze(this),l=Yi(i),r=Ze(a),o=!t&&!cs(a)&&!Ks(a)?r:a;return l.has.call(i,o)||Dt(a,o)&&l.has.call(i,a)||Dt(r,o)&&l.has.call(i,r)||(i.add(o),rn(i,"add",o,o)),this},set(a,i){!t&&!cs(i)&&!Ks(i)&&(i=Ze(i));const l=Ze(this),{has:r,get:o}=Yi(l);let c=r.call(l,a);c||(a=Ze(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Dt(i,d)&&rn(l,"set",a,i):rn(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:r}=Yi(i);let o=l.call(i,a);o||(a=Ze(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&rn(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&rn(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Am(a,e,t)}),s}function ar(e,t){const s=Rm(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(et(s,a)&&a in n?s:n,a,i)}const Im={get:ar(!1,!1)},Om={get:ar(!1,!0)},Lm={get:ar(!0,!1)},Nm={get:ar(!0,!0)},_f=new WeakMap,wf=new WeakMap,kf=new WeakMap,Sf=new WeakMap;function Dm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Fn(e){return Ks(e)?e:ir(e,!1,Sm,Im,_f)}function Ho(e){return ir(e,!1,Cm,Om,wf)}function _l(e){return ir(e,!0,Tm,Lm,kf)}function Mm(e){return ir(e,!0,Em,Nm,Sf)}function ir(e,t,s,n,a){if(!Xe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Dm(zg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function pn(e){return Ks(e)?pn(e.__v_raw):!!(e&&e.__v_isReactive)}function Ks(e){return!!(e&&e.__v_isReadonly)}function cs(e){return!!(e&&e.__v_isShallow)}function Bi(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function Tf(e){return!et(e,"__v_skip")&&Object.isExtensible(e)&&sf(e,"__v_skip",!0),e}const Ds=e=>Xe(e)?Fn(e):e,La=e=>Xe(e)?_l(e):e;function Tt(e){return e?e.__v_isRef===!0:!1}function h(e){return Cf(e,!1)}function Vo(e){return Cf(e,!0)}function Cf(e,t){return Tt(e)?e:new Pm(e,t)}class Pm{constructor(t,s){this.dep=new sr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Ds(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||cs(t)||Ks(t);t=n?t:Ze(t),Dt(t,s)&&(this._rawValue=t,this._value=n?t:Ds(t),this.dep.trigger())}}function Fm(e){e.dep&&e.dep.trigger()}function Gs(e){return Tt(e)?e.value:e}function $m(e){return Ae(e)?e():Gs(e)}const Um={get:(e,t,s)=>t==="__v_raw"?e:Gs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return Tt(a)&&!Tt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function jo(e){return pn(e)?e:new Proxy(e,Um)}class Bm{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new sr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Ef(e){return new Bm(e)}function Hm(e){const t=ve(e)?new Array(e.length):{};for(const s in e)t[s]=Af(e,s);return t}class Vm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Kt(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!ve(t)||Kt(this._key)||!Yl(this._key))do a=!Bi(i)||cs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Gs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&Tt(this._raw[this._key])){const s=this._object[this._key];if(Tt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return ym(this._raw,this._key)}}class jm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function zm(e,t,s){return Tt(e)?e:Ae(e)?new jm(e):Xe(e)&&arguments.length>1?Af(e,t,s):h(e)}function Af(e,t,s){return new Vm(e,t,s)}class qm{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new sr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=_i-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ct!==this)return uf(this,!0),!0}get value(){const t=this.dep.track();return hf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Gm(e,t,s=!1){let n,a;return Ae(e)?n=e:(n=e.get,a=e.set),new qm(n,a,s)}const Km={GET:"get",HAS:"has",ITERATE:"iterate"},Wm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Xi={},wl=new WeakMap;let In;function Zm(){return In}function Rf(e,t=!1,s=In){if(s){let n=wl.get(s);n||wl.set(s,n=[]),n.push(e)}}function Jm(e,t,s=Ge){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:cs(x)||a===!1||a===0?on(x,1):on(x);let d,u,f,p,g=!1,y=!1;if(Tt(e)?(u=()=>e.value,g=cs(e)):pn(e)?(u=()=>c(e),g=!0):ve(e)?(y=!0,g=e.some(x=>pn(x)||cs(x)),u=()=>e.map(x=>{if(Tt(x))return x.value;if(pn(x))return c(x);if(Ae(x))return o?o(x,2):x()})):Ae(e)?t?u=o?()=>o(e,2):e:u=()=>{if(f){vn();try{f()}finally{bn()}}const x=In;In=d;try{return o?o(e,3,[p]):e(p)}finally{In=x}}:u=Bt,t&&a){const x=u,w=a===!0?1/0:a;u=()=>on(x(),w)}const S=cf(),R=()=>{d.stop(),S&&S.active&&Mo(S.effects,d)};if(i&&t){const x=t;t=(...w)=>{const _=x(...w);return R(),_}}let v=y?new Array(e.length).fill(Xi):Xi;const m=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const w=d.run();if(x||a||g||(y?w.some((_,A)=>Dt(_,v[A])):Dt(w,v))){f&&f();const _=In;In=d;try{const A=[w,v===Xi?void 0:y&&v[0]===Xi?[]:v,p];v=w,o?o(t,3,A):t(...A)}finally{In=_}}}else d.run()};return r&&r(m),d=new xi(u),d.scheduler=l?()=>l(m,!1):m,p=x=>Rf(x,!1,d),f=d.onStop=()=>{const x=wl.get(d);if(x){if(o)o(x,4);else for(const w of x)w();wl.delete(d)}},t?n?m(!0):v=d.run():l?l(m.bind(null,!0),!0):d.run(),R.pause=d.pause.bind(d),R.resume=d.resume.bind(d),R.stop=R,R}function on(e,t=1/0,s){if(t<=0||!Xe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,Tt(e))on(e.value,t,s);else if(ve(e))for(let n=0;n<e.length;n++)on(e[n],t,s);else if(aa(e)||ka(e))e.forEach(n=>{on(n,t,s)});else if(Jl(e)){for(const n in e)on(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&on(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const If=[];function Ym(e){If.push(e)}function Qm(){If.pop()}function Xm(e,t){}const ev={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},tv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function qa(e,t,s,n){try{return n?e(...n):e()}catch(a){la(a,t,s)}}function vs(e,t,s,n){if(Ae(e)){const a=qa(e,t,s,n);return a&&Po(a)&&a.catch(i=>{la(i,t,s)}),a}if(ve(e)){const a=[];for(let i=0;i<e.length;i++)a.push(vs(e[i],t,s,n));return a}}function la(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ge;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){vn(),qa(i,null,10,[e,o,c]),bn();return}}sv(e,s,a,n,l)}function sv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Yt=[];let js=-1;const Ca=[];let On=null,ma=0;const Of=Promise.resolve();let kl=null;function Ot(e){const t=kl||Of;return e?t.then(this?e.bind(this):e):t}function nv(e){let t=js+1,s=Yt.length;for(;t<s;){const n=t+s>>>1,a=Yt[n],i=Si(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function zo(e){if(!(e.flags&1)){const t=Si(e),s=Yt[Yt.length-1];!s||!(e.flags&2)&&t>=Si(s)?Yt.push(e):Yt.splice(nv(t),0,e),e.flags|=1,Lf()}}function Lf(){kl||(kl=Of.then(Nf))}function ki(e){ve(e)?Ca.push(...e):On&&e.id===-1?On.splice(ma+1,0,e):e.flags&1||(Ca.push(e),e.flags|=1),Lf()}function ad(e,t,s=js+1){for(;s<Yt.length;s++){const n=Yt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Yt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Sl(e){if(Ca.length){const t=[...new Set(Ca)].sort((s,n)=>Si(s)-Si(n));if(Ca.length=0,On){On.push(...t);return}for(On=t,ma=0;ma<On.length;ma++){const s=On[ma];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}On=null,ma=0}}const Si=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Nf(e){try{for(js=0;js<Yt.length;js++){const t=Yt[js];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),qa(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;js<Yt.length;js++){const t=Yt[js];t&&(t.flags&=-2)}js=-1,Yt.length=0,Sl(),kl=null,(Yt.length||Ca.length)&&Nf()}}let va,el=[];function Df(e,t){var s,n;va=e,va?(va.enabled=!0,el.forEach(({event:a,args:i})=>va.emit(a,...i)),el=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Df(i,t)}),setTimeout(()=>{va||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,el=[])},3e3)):el=[]}let Ut=null,lr=null;function Ti(e){const t=Ut;return Ut=e,lr=e&&e.type.__scopeId||null,t}function av(e){lr=e}function iv(){lr=null}const lv=e=>qo;function qo(e,t=Ut,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ri(-1);const i=Ti(t);let l;try{l=e(...a)}finally{Ti(i),n._d&&Ri(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function rv(e,t){if(Ut===null)return e;const s=zi(Ut),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ge]=t[a];i&&(Ae(i)&&(i={mounted:i,updated:i}),i.deep&&on(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function zs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(vn(),vs(o,s,8,[e.el,r,e,t]),bn())}}function ui(e,t){if($t){let s=$t.provides;const n=$t.parent&&$t.parent.provides;n===s&&(s=$t.provides=Object.create(n)),s[e]=t}}function Ts(e,t,s=!1){const n=Xt();if(n||Zn){let a=Zn?Zn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ae(t)?t.call(n&&n.proxy):t}}function ov(){return!!(Xt()||Zn)}const Mf=Symbol.for("v-scx"),Pf=()=>Ts(Mf);function cv(e,t){return Hi(e,null,t)}function dv(e,t){return Hi(e,null,{flush:"post"})}function Ff(e,t){return Hi(e,null,{flush:"sync"})}function ds(e,t,s){return Hi(e,t,s)}function Hi(e,t,s=Ge){const{immediate:n,deep:a,flush:i,once:l}=s,r=qe({},s),o=t&&n||!t&&i!=="post";let c;if(ea){if(i==="sync"){const p=Pf();c=p.__watcherHandles||(p.__watcherHandles=[])}else if(!o){const p=()=>{};return p.stop=Bt,p.resume=Bt,p.pause=Bt,p}}const d=$t;r.call=(p,g,y)=>vs(p,d,g,y);let u=!1;i==="post"?r.scheduler=p=>{kt(p,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(p,g)=>{g?p():zo(p)}),r.augmentJob=p=>{t&&(p.flags|=4),u&&(p.flags|=2,d&&(p.id=d.uid,p.i=d))};const f=Jm(e,t,r);return ea&&(c?c.push(f):o&&f()),f}function uv(e,t,s){const n=this.proxy,a=Me(e)?e.includes(".")?$f(n,e):()=>n[e]:e.bind(n,n);let i;Ae(t)?i=t:(i=t.handler,s=t);const l=Ga(this),r=Hi(a,i.bind(n),s);return l(),r}function $f(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const En=new WeakMap,Uf=Symbol("_vte"),Bf=e=>e.__isTeleport,zn=e=>e&&(e.disabled||e.disabled===""),fv=e=>e&&(e.defer||e.defer===""),id=e=>typeof SVGElement<"u"&&e instanceof SVGElement,ld=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,so=(e,t)=>{const s=e&&e.to;return Me(s)?t?t(s):null:s},pv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:f,o:{insert:p,querySelector:g,createText:y,createComment:S,parentNode:R}}=c,v=zn(t.props);let{dynamicChildren:m}=t;const x=(A,T,C)=>{A.shapeFlag&16&&d(A.children,T,C,a,i,l,r,o)},w=(A=t)=>{const T=zn(A.props),C=A.target=so(A.props,g),L=no(C,A,y,p);C&&(l!=="svg"&&id(C)?l="svg":l!=="mathml"&&ld(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),T||(x(A,C,L),ai(A,!1)))},_=A=>{const T=()=>{if(En.get(A)===T){if(En.delete(A),zn(A.props)){const C=R(A.el)||s;x(A,C,A.anchor),ai(A,!0)}w(A)}};En.set(A,T),kt(T,i)};if(e==null){const A=t.el=y(""),T=t.anchor=y("");if(p(A,s,n),p(T,s,n),fv(t.props)||i&&i.pendingBranch){_(t);return}v&&(x(t,s,T),ai(t,!0)),w()}else{t.el=e.el;const A=t.anchor=e.anchor,T=En.get(e);if(T){T.flags|=8,En.delete(e),_(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,L=t.targetAnchor=e.targetAnchor,H=zn(e.props),M=H?s:C,D=H?A:L;if(l==="svg"||id(C)?l="svg":(l==="mathml"||ld(C))&&(l="mathml"),m?(f(e.dynamicChildren,m,M,a,i,l,r),sc(e,t,!0)):o||u(e,t,M,D,a,i,l,r,!1),v)H?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):tl(t,s,A,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const K=t.target=so(t.props,g);K&&tl(t,K,null,c,0)}else H&&tl(t,C,L,c,1);ai(t,v)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:f}=e,p=i||!zn(f),g=En.get(e);if(g&&(g.flags|=8,En.delete(e)),u&&(a(c),a(d)),i&&a(o),!g&&l&16)for(let y=0;y<r.length;y++){const S=r[y];n(S,t,s,p,!!S.dynamicChildren)}},move:tl,hydrate:hv};function tl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!En.has(e)&&(!u||zn(d))&&o&16)for(let f=0;f<c.length;f++)a(c[f],t,s,2);u&&n(r,t,s)}function hv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function f(S,R){let v=R;for(;v;){if(v&&v.nodeType===8){if(v.data==="teleport start anchor")t.targetStart=v;else if(v.data==="teleport anchor"){t.targetAnchor=v,S._lpa=t.targetAnchor&&l(t.targetAnchor);break}}v=l(v)}}function p(S,R){R.anchor=u(l(S),R,r(S),s,n,a,i)}const g=t.target=so(t.props,o),y=zn(t.props);if(g){const S=g._lpa||g.firstChild;t.shapeFlag&16&&(y?(p(e,t),f(g,S),t.targetAnchor||no(g,t,d,c,r(e)===g?e:null)):(t.anchor=l(e),f(g,S),t.targetAnchor||no(g,t,d,c),u(S&&l(S),t,g,s,n,a,i))),ai(t,y)}else y&&t.shapeFlag&16&&(p(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const gv=pv;function ai(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function no(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Uf]=l,e&&(n(i,e,a),n(l,e,a)),l}const ws=Symbol("_leaveCb"),Za=Symbol("_enterCb");function Go(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Je(()=>{e.isMounted=!0}),dr(()=>{e.isUnmounting=!0}),e}const _s=[Function,Array],Ko={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:_s,onEnter:_s,onAfterEnter:_s,onEnterCancelled:_s,onBeforeLeave:_s,onLeave:_s,onAfterLeave:_s,onLeaveCancelled:_s,onBeforeAppear:_s,onAppear:_s,onAfterAppear:_s,onAppearCancelled:_s},Hf=e=>{const t=e.subTree;return t.component?Hf(t.component):t},mv={name:"BaseTransition",props:Ko,setup(e,{slots:t}){const s=Xt(),n=Go();return()=>{const a=t.default&&rr(t.default(),!0),i=a&&a.length?Vf(a):s.subTree?Sp():void 0;if(!i)return;const l=Ze(e),{mode:r}=l;if(n.isLeaving)return Or(i);const o=rd(i);if(!o)return Or(i);let c=Na(o,l,n,s,u=>c=u);o.type!==xt&&yn(o,c);let d=s.subTree&&rd(s.subTree);if(d&&d.type!==xt&&!Os(d,o)&&Hf(s).type!==xt){let u=Na(d,l,n,s);if(yn(d,u),r==="out-in"&&o.type!==xt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Or(i);r==="in-out"&&o.type!==xt?u.delayLeave=(f,p,g)=>{const y=zf(n,d);y[String(d.key)]=d,f[ws]=()=>{p(),f[ws]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{g(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Vf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==xt){t=s;break}}return t}const jf=mv;function zf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function Na(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:f,onLeave:p,onAfterLeave:g,onLeaveCancelled:y,onBeforeAppear:S,onAppear:R,onAfterAppear:v,onAppearCancelled:m}=t,x=String(e.key),w=zf(s,e),_=(C,L)=>{C&&vs(C,n,9,L)},A=(C,L)=>{const H=L[1];_(C,L),ve(C)?C.every(M=>M.length<=1)&&H():C.length<=1&&H()},T={mode:l,persisted:r,beforeEnter(C){let L=o;if(!s.isMounted)if(i)L=S||o;else return;C[ws]&&C[ws](!0);const H=w[x];H&&Os(e,H)&&H.el[ws]&&H.el[ws](),_(L,[C])},enter(C){if(w[x]===e)return;let L=c,H=d,M=u;if(!s.isMounted)if(i)L=R||c,H=v||d,M=m||u;else return;let D=!1;C[Za]=ne=>{D||(D=!0,ne?_(M,[C]):_(H,[C]),T.delayedLeave&&T.delayedLeave(),C[Za]=void 0)};const K=C[Za].bind(null,!1);L?A(L,[C,K]):K()},leave(C,L){const H=String(e.key);if(C[Za]&&C[Za](!0),s.isUnmounting)return L();_(f,[C]);let M=!1;C[ws]=K=>{M||(M=!0,L(),K?_(y,[C]):_(g,[C]),C[ws]=void 0,w[H]===e&&delete w[H])};const D=C[ws].bind(null,!1);w[H]=e,p?A(p,[C,D]):D()},clone(C){const L=Na(C,t,s,n,a);return a&&a(L),L}};return T}function Or(e){if(ji(e))return e=Ws(e),e.children=null,e}function rd(e){if(!ji(e))return Bf(e.type)&&e.children?Vf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ae(s.default))return s.default()}}function yn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,yn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function rr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Mt?(l.patchFlag&128&&a++,n=n.concat(rr(l.children,t,r))):(t||l.type!==xt)&&n.push(r!=null?Ws(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Vi(e,t){return Ae(e)?qe({name:e.name},t,{setup:e}):e}function vv(){const e=Xt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Wo(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function bv(e){const t=Xt(),s=Vo(null);if(t){const a=t.refs===Ge?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function od(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Tl=new WeakMap;function Ea(e,t,s,n,a=!1){if(ve(e)){e.forEach((y,S)=>Ea(y,t&&(ve(t)?t[S]:t),s,n,a));return}if(hn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ea(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?zi(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ge?r.refs={}:r.refs,u=r.setupState,f=Ze(u),p=u===Ge?xa:y=>od(d,y)?!1:et(f,y),g=(y,S)=>!(S&&od(d,S));if(c!=null&&c!==o){if(cd(t),Me(c))d[c]=null,p(c)&&(u[c]=null);else if(Tt(c)){const y=t;g(c,y.k)&&(c.value=null),y.k&&(d[y.k]=null)}}if(Ae(o))qa(o,r,12,[l,d]);else{const y=Me(o),S=Tt(o);if(y||S){const R=()=>{if(e.f){const v=y?p(o)?u[o]:d[o]:g()||!e.k?o.value:d[e.k];if(a)ve(v)&&Mo(v,i);else if(ve(v))v.includes(i)||v.push(i);else if(y)d[o]=[i],p(o)&&(u[o]=d[o]);else{const m=[i];g(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else y?(d[o]=l,p(o)&&(u[o]=l)):S&&(g(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const v=()=>{R(),Tl.delete(e)};v.id=-1,Tl.set(e,v),kt(v,s)}else cd(e),R()}}}function cd(e){const t=Tl.get(e);t&&(t.flags|=8,Tl.delete(e))}let dd=!1;const fa=()=>{dd||(console.error("Hydration completed but contains mismatches."),dd=!0)},yv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",xv=e=>e.namespaceURI.includes("MathML"),sl=e=>{if(e.nodeType===1){if(yv(e))return"svg";if(xv(e))return"mathml"}},_a=e=>e.nodeType===8;function _v(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,x)=>{if(!x.hasChildNodes()){s(null,m,x),Sl(),x._vnode=m;return}u(x.firstChild,m,null,null,null),Sl(),x._vnode=m},u=(m,x,w,_,A,T=!1)=>{T=T||!!x.dynamicChildren;const C=_a(m)&&m.data==="[",L=()=>y(m,x,w,_,A,C),{type:H,ref:M,shapeFlag:D,patchFlag:K}=x;let ne=m.nodeType;x.el=m,K===-2&&(T=!1,x.dynamicChildren=null);let $=null;switch(H){case Dn:ne!==3?x.children===""?(o(x.el=a(""),l(m),m),$=m):$=L():(m.data!==x.children&&(fa(),m.data=x.children),$=i(m));break;case xt:v(m)?($=i(m),R(x.el=m.content.firstChild,m,w)):ne!==8||C?$=L():$=i(m);break;case Jn:if(C&&(m=i(m),ne=m.nodeType),ne===1||ne===3){$=m;const O=!x.children.length;for(let E=0;E<x.staticCount;E++)O&&(x.children+=$.nodeType===1?$.outerHTML:$.data),E===x.staticCount-1&&(x.anchor=$),$=i($);return C?i($):$}else L();break;case Mt:C?$=g(m,x,w,_,A,T):$=L();break;default:if(D&1)(ne!==1||x.type.toLowerCase()!==m.tagName.toLowerCase())&&!v(m)?$=L():$=f(m,x,w,_,A,T);else if(D&6){x.slotScopeIds=A;const O=l(m);if(C?$=S(m):_a(m)&&m.data==="teleport start"?$=S(m,m.data,"teleport end"):$=i(m),t(x,O,null,w,_,sl(O),T),hn(x)&&!x.type.__asyncResolved){let E;C?(E=ft(Mt),E.anchor=$?$.previousSibling:O.lastChild):E=m.nodeType===3?ac(""):ft("div"),E.el=m,x.component.subTree=E}}else D&64?ne!==8?$=L():$=x.type.hydrate(m,x,w,_,A,T,e,p):D&128&&($=x.type.hydrate(m,x,w,_,sl(l(m)),A,T,e,u))}return M!=null&&Ea(M,null,_,x),$},f=(m,x,w,_,A,T)=>{T=T||!!x.dynamicChildren;const{type:C,props:L,patchFlag:H,shapeFlag:M,dirs:D,transition:K}=x,ne=C==="input"||C==="option";if(ne||H!==-1){D&&zs(x,null,w,"created");let $=!1;if(v(m)){$=gp(null,K)&&w&&w.vnode.props&&w.vnode.props.appear;const E=m.content.firstChild;if($){const N=E.getAttribute("class");N&&(E.$cls=N),K.beforeEnter(E)}R(E,m,w),x.el=m=E}if(M&16&&!(L&&(L.innerHTML||L.textContent))){let E=p(m.firstChild,x,m,w,_,A,T);for(E&&!nl(m,1)&&fa();E;){const N=E;E=E.nextSibling,r(N)}}else if(M&8){let E=x.children;E[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(E=E.slice(1));const{textContent:N}=m;N!==E&&N!==E.replace(/\r\n|\r/g,`
`)&&(nl(m,0)||fa(),m.textContent=x.children)}if(L){if(ne||!T||H&48){const E=m.tagName.includes("-");for(const N in L)(ne&&(N.endsWith("value")||N==="indeterminate")||na(N)&&!fn(N)||N[0]==="."||E&&!fn(N))&&n(m,N,null,L[N],void 0,w)}else if(L.onClick)n(m,"onClick",null,L.onClick,void 0,w);else if(H&4&&pn(L.style))for(const E in L.style)L.style[E]}let O;(O=L&&L.onVnodeBeforeMount)&&as(O,w,x),D&&zs(x,null,w,"beforeMount"),((O=L&&L.onVnodeMounted)||D||$)&&yp(()=>{O&&as(O,w,x),$&&K.enter(m),D&&zs(x,null,w,"mounted")},_)}return m.nextSibling},p=(m,x,w,_,A,T,C)=>{C=C||!!x.dynamicChildren;const L=x.children,H=L.length;let M=!1;for(let D=0;D<H;D++){const K=C?L[D]:L[D]=ls(L[D]),ne=K.type===Dn;m?(ne&&!C&&D+1<H&&ls(L[D+1]).type===Dn&&(o(a(m.data.slice(K.children.length)),w,i(m)),m.data=K.children),m=u(m,K,_,A,T,C)):ne&&!K.children?o(K.el=a(""),w):(M||(M=!0,nl(w,1)||fa()),s(null,K,w,null,_,A,sl(w),T))}return m},g=(m,x,w,_,A,T)=>{const{slotScopeIds:C}=x;C&&(A=A?A.concat(C):C);const L=l(m),H=p(i(m),x,L,w,_,A,T);return H&&_a(H)&&H.data==="]"?i(x.anchor=H):(fa(),o(x.anchor=c("]"),L,H),H)},y=(m,x,w,_,A,T)=>{if(nl(m.parentElement,1)||fa(),x.el=null,T){const H=S(m);for(;;){const M=i(m);if(M&&M!==H)r(M);else break}}const C=i(m),L=l(m);return r(m),s(null,x,L,C,w,_,sl(L),A),w&&(w.vnode.el=x.el,fr(w,x.el)),C},S=(m,x="[",w="]")=>{let _=0;for(;m;)if(m=i(m),m&&_a(m)&&(m.data===x&&_++,m.data===w)){if(_===0)return i(m);_--}return m},R=(m,x,w)=>{const _=x.parentNode;_&&_.replaceChild(m,x);let A=w;for(;A;)A.vnode.el===x&&(A.vnode.el=A.subTree.el=m),A=A.parent},v=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const ud="data-allow-mismatch",wv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function nl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(ud);)e=e.parentElement;const s=e&&e.getAttribute(ud);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(wv[t])}}const kv=er().requestIdleCallback||(e=>setTimeout(e,1)),Sv=er().cancelIdleCallback||(e=>clearTimeout(e)),Tv=(e=1e4)=>t=>{const s=kv(t,{timeout:e});return()=>Sv(s)};function Cv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Ev=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Cv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Av=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Rv=(e=[])=>(t,s)=>{Me(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Iv(e,t){if(_a(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(_a(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const hn=e=>!!e.type.__asyncLoader;function Ov(e){Ae(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const f=()=>(u++,c=null,p()),p=()=>{let g;return c||(g=c=t().catch(y=>{if(y=y instanceof Error?y:new Error(String(y)),o)return new Promise((S,R)=>{o(y,()=>S(f()),()=>R(y),u+1)});throw y}).then(y=>g!==c&&c?c:(y&&(y.__esModule||y[Symbol.toStringTag]==="Module")&&(y=y.default),d=y,y)))};return Vi({name:"AsyncComponentWrapper",__asyncLoader:p,__asyncHydrate(g,y,S){let R=!1;(y.bu||(y.bu=[])).push(()=>R=!0);const v=()=>{R||S()},m=i?()=>{const x=i(v,w=>Iv(g,w));x&&(y.bum||(y.bum=[])).push(x)}:v;d?m():p().then(()=>!y.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const g=$t;if(Wo(g),d)return()=>al(d,g);const y=w=>{c=null,la(w,g,13,!n)};if(r&&g.suspense||ea)return p().then(w=>()=>al(w,g)).catch(w=>(y(w),()=>n?ft(n,{error:w}):null));const S=h(!1),R=h(),v=h(!!a);let m,x;return _t(()=>{m!=null&&clearTimeout(m),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{g.isUnmounted||(v.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!g.isUnmounted&&!S.value&&!R.value){const w=new Error(`Async component timed out after ${l}ms.`);y(w),R.value=w}},l)),p().then(()=>{g.isUnmounted||(S.value=!0,g.parent&&ji(g.parent.vnode)&&g.parent.update())}).catch(w=>{if(g.isUnmounted){c=null;return}y(w),R.value=w}),()=>{if(S.value&&d)return al(d,g);if(R.value&&n)return ft(n,{error:R.value});if(s&&!v.value)return al(s,g)}}})}function al(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ft(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const ji=e=>e.type.__isKeepAlive,Lv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Xt(),n=s.ctx;if(!n.renderer)return()=>{const v=t.default&&t.default();return v&&v.length===1?v[0]:v};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,f=u("div");n.activate=(v,m,x,w,_)=>{const A=v.component;c(v,m,x,0,r),o(A.vnode,v,m,x,A,r,w,v.slotScopeIds,_),kt(()=>{A.isDeactivated=!1,A.a&&Ta(A.a);const T=v.props&&v.props.onVnodeMounted;T&&as(T,A.parent,v)},r)},n.deactivate=v=>{const m=v.component;El(m.m),El(m.a),c(v,f,null,1,r),kt(()=>{m.da&&Ta(m.da);const x=v.props&&v.props.onVnodeUnmounted;x&&as(x,m.parent,v),m.isDeactivated=!0},r)};function p(v){Lr(v),d(v,s,r,!0)}function g(v){a.forEach((m,x)=>{const w=po(hn(m)?m.type.__asyncResolved||{}:m.type);w&&!v(w)&&y(x)})}function y(v){const m=a.get(v);m&&(!l||!Os(m,l))?p(m):l&&Lr(l),a.delete(v),i.delete(v)}ds(()=>[e.include,e.exclude],([v,m])=>{v&&g(x=>ii(v,x)),m&&g(x=>!ii(m,x))},{flush:"post",deep:!0});let S=null;const R=()=>{S!=null&&(Al(s.subTree.type)?kt(()=>{a.set(S,il(s.subTree))},s.subTree.suspense):a.set(S,il(s.subTree)))};return Je(R),cr(R),dr(()=>{a.forEach(v=>{const{subTree:m,suspense:x}=s,w=il(m);if(v.type===w.type&&v.key===w.key){Lr(w);const _=w.component.da;_&&kt(_,x);return}p(v)})}),()=>{if(S=null,!t.default)return l=null;const v=t.default(),m=v[0];if(v.length>1)return l=null,v;if(!xn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let x=il(m);if(x.type===xt)return l=null,x;const w=x.type,_=po(hn(x)?x.type.__asyncResolved||{}:w),{include:A,exclude:T,max:C}=e;if(A&&(!_||!ii(A,_))||T&&_&&ii(T,_))return x.shapeFlag&=-257,l=x,m;const L=x.key==null?w:x.key,H=a.get(L);return x.el&&(x=Ws(x),m.shapeFlag&128&&(m.ssContent=x)),S=L,H?(x.el=H.el,x.component=H.component,x.transition&&yn(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),C&&i.size>parseInt(C,10)&&y(i.values().next().value)),x.shapeFlag|=256,l=x,Al(m.type)?m:x}}},Nv=Lv;function ii(e,t){return ve(e)?e.some(s=>ii(s,t)):Me(e)?e.split(",").includes(t):jg(e)?(e.lastIndex=0,e.test(t)):!1}function As(e,t){qf(e,"a",t)}function Rs(e,t){qf(e,"da",t)}function qf(e,t,s=$t){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(or(t,n,s),s){let a=s.parent;for(;a&&a.parent;)ji(a.parent.vnode)&&Dv(n,t,s,a),a=a.parent}}function Dv(e,t,s,n){const a=or(t,e,n,!0);_t(()=>{Mo(n[t],a)},s)}function Lr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function il(e){return e.shapeFlag&128?e.ssContent:e}function or(e,t,s=$t,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{vn();const r=Ga(s),o=vs(t,s,e,l);return r(),bn(),o});return n?a.unshift(i):a.push(i),i}}const _n=e=>(t,s=$t)=>{(!ea||e==="sp")&&or(e,(...n)=>t(...n),s)},Gf=_n("bm"),Je=_n("m"),Zo=_n("bu"),cr=_n("u"),dr=_n("bum"),_t=_n("um"),Kf=_n("sp"),Wf=_n("rtg"),Zf=_n("rtc");function Jf(e,t=$t){or("ec",e,t)}const Jo="components",Mv="directives";function Pv(e,t){return Yo(Jo,e,!0,t)||e}const Yf=Symbol.for("v-ndc");function Fv(e){return Me(e)?Yo(Jo,e,!1)||e:e||Yf}function $v(e){return Yo(Mv,e)}function Yo(e,t,s=!0,n=!1){const a=Ut||$t;if(a){const i=a.type;if(e===Jo){const r=po(i,!1);if(r&&(r===t||r===it(t)||r===ia(it(t))))return i}const l=fd(a[e]||i[e],t)||fd(a.appContext[e],t);return!l&&n?i:l}}function fd(e,t){return e&&(e[t]||e[it(t)]||e[ia(it(t))])}function Uv(e,t,s,n){let a;const i=s&&s[n],l=ve(e);if(l||Me(e)){const r=l&&pn(e);let o=!1,c=!1;r&&(o=!cs(e),c=Ks(e),e=nr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?La(Ds(e[d])):Ds(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Xe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Bv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ve(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Hv(e,t,s={},n,a){if(Ut.ce||Ut.parent&&hn(Ut.parent)&&Ut.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ai(),Rl(Mt,null,[ft("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ai();const l=i&&Qo(i(s)),r=s.key||l&&l.key,o=Rl(Mt,{key:(r&&!Kt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Qo(e){return e.some(t=>xn(t)?!(t.type===xt||t.type===Mt&&!Qo(t.children)):!0)?e:null}function Vv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Sa(n)]=e[n];return s}const ao=e=>e?Ep(e)?zi(e):ao(e.parent):null,fi=qe(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>ao(e.parent),$root:e=>ao(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Xo(e),$forceUpdate:e=>e.f||(e.f=()=>{zo(e.update)}),$nextTick:e=>e.n||(e.n=Ot.bind(e.proxy)),$watch:e=>uv.bind(e)}),Nr=(e,t)=>e!==Ge&&!e.__isScriptSetup&&et(e,t),io={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const f=l[t];if(f!==void 0)switch(f){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Nr(n,t))return l[t]=1,n[t];if(a!==Ge&&et(a,t))return l[t]=2,a[t];if(et(i,t))return l[t]=3,i[t];if(s!==Ge&&et(s,t))return l[t]=4,s[t];lo&&(l[t]=0)}}const c=fi[t];let d,u;if(c)return t==="$attrs"&&zt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ge&&et(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,et(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Nr(a,t)?(a[t]=s,!0):n!==Ge&&et(n,t)?(n[t]=s,!0):et(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ge&&r[0]!=="$"&&et(e,r)||Nr(t,r)||et(i,r)||et(n,r)||et(fi,r)||et(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:et(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},jv=qe({},io,{get(e,t){if(t!==Symbol.unscopables)return io.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Jg(t)}});function zv(){return null}function qv(){return null}function Gv(e){}function Kv(e){}function Wv(){return null}function Zv(){}function Jv(e,t){return null}function Yv(){return Qf().slots}function Qv(){return Qf().attrs}function Qf(e){const t=Xt();return t.setupContext||(t.setupContext=Op(t))}function Ci(e){return ve(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Xv(e,t){const s=Ci(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ve(a)||Ae(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function eb(e,t){return!e||!t?e||t:ve(e)&&ve(t)?e.concat(t):qe({},Ci(e),Ci(t))}function tb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function sb(e){const t=Xt(),s=ea;let n=e();Ii(),s&&Ra(!1);const a=()=>{Ga(t),s&&Ra(!0)},i=()=>{Xt()!==t&&t.scope.off(),Ii(),s&&Ra(!1)};return Po(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let lo=!0;function nb(e){const t=Xo(e),s=e.proxy,n=e.ctx;lo=!1,t.beforeCreate&&pd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:f,beforeUpdate:p,updated:g,activated:y,deactivated:S,beforeDestroy:R,beforeUnmount:v,destroyed:m,unmounted:x,render:w,renderTracked:_,renderTriggered:A,errorCaptured:T,serverPrefetch:C,expose:L,inheritAttrs:H,components:M,directives:D,filters:K}=t;if(c&&ab(c,n,null),l)for(const O in l){const E=l[O];Ae(E)&&(n[O]=E.bind(s))}if(a){const O=a.call(s,s);Xe(O)&&(e.data=Fn(O))}if(lo=!0,i)for(const O in i){const E=i[O],N=Ae(E)?E.bind(s,s):Ae(E.get)?E.get.bind(s,s):Bt,B=!Ae(E)&&Ae(E.set)?E.set.bind(s):Bt,W=ee({get:N,set:B});Object.defineProperty(n,O,{enumerable:!0,configurable:!0,get:()=>W.value,set:te=>W.value=te})}if(r)for(const O in r)Xf(r[O],n,s,O);if(o){const O=Ae(o)?o.call(s):o;Reflect.ownKeys(O).forEach(E=>{ui(E,O[E])})}d&&pd(d,e,"c");function $(O,E){ve(E)?E.forEach(N=>O(N.bind(s))):E&&O(E.bind(s))}if($(Gf,u),$(Je,f),$(Zo,p),$(cr,g),$(As,y),$(Rs,S),$(Jf,T),$(Zf,_),$(Wf,A),$(dr,v),$(_t,x),$(Kf,C),ve(L))if(L.length){const O=e.exposed||(e.exposed={});L.forEach(E=>{Object.defineProperty(O,E,{get:()=>s[E],set:N=>s[E]=N,enumerable:!0})})}else e.exposed||(e.exposed={});w&&e.render===Bt&&(e.render=w),H!=null&&(e.inheritAttrs=H),M&&(e.components=M),D&&(e.directives=D),C&&Wo(e)}function ab(e,t,s=Bt){ve(e)&&(e=ro(e));for(const n in e){const a=e[n];let i;Xe(a)?"default"in a?i=Ts(a.from||n,a.default,!0):i=Ts(a.from||n):i=Ts(a),Tt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function pd(e,t,s){vs(ve(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Xf(e,t,s,n){let a=n.includes(".")?$f(s,n):()=>s[n];if(Me(e)){const i=t[e];Ae(i)&&ds(a,i)}else if(Ae(e))ds(a,e.bind(s));else if(Xe(e))if(ve(e))e.forEach(i=>Xf(i,t,s,n));else{const i=Ae(e.handler)?e.handler.bind(s):t[e.handler];Ae(i)&&ds(a,i,e)}}function Xo(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Cl(o,c,l,!0)),Cl(o,t,l)),Xe(t)&&i.set(t,o),o}function Cl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Cl(e,i,s,!0),a&&a.forEach(l=>Cl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=ib[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const ib={data:hd,props:gd,emits:gd,methods:li,computed:li,beforeCreate:Wt,created:Wt,beforeMount:Wt,mounted:Wt,beforeUpdate:Wt,updated:Wt,beforeDestroy:Wt,beforeUnmount:Wt,destroyed:Wt,unmounted:Wt,activated:Wt,deactivated:Wt,errorCaptured:Wt,serverPrefetch:Wt,components:li,directives:li,watch:rb,provide:hd,inject:lb};function hd(e,t){return t?e?function(){return qe(Ae(e)?e.call(this,this):e,Ae(t)?t.call(this,this):t)}:t:e}function lb(e,t){return li(ro(e),ro(t))}function ro(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Wt(e,t){return e?[...new Set([].concat(e,t))]:t}function li(e,t){return e?qe(Object.create(null),e,t):t}function gd(e,t){return e?ve(e)&&ve(t)?[...new Set([...e,...t])]:qe(Object.create(null),Ci(e),Ci(t??{})):t}function rb(e,t){if(!e)return t;if(!t)return e;const s=qe(Object.create(null),e);for(const n in t)s[n]=Wt(e[n],t[n]);return s}function ep(){return{app:null,config:{isNativeTag:xa,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let ob=0;function cb(e,t){return function(n,a=null){Ae(n)||(n=qe({},n)),a!=null&&!Xe(a)&&(a=null);const i=ep(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:ob++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Np,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ae(d.install)?(l.add(d),d.install(c,...u)):Ae(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,f){if(!o){const p=c._ceVNode||ft(n,a);return p.appContext=i,f===!0?f="svg":f===!1&&(f=void 0),u&&t?t(p,d):e(p,d,f),o=!0,c._container=d,d.__vue_app__=c,zi(p.component)}},onUnmount(d){r.push(d)},unmount(){o&&(vs(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Zn;Zn=c;try{return d()}finally{Zn=u}}};return c}}let Zn=null;function db(e,t,s=Ge){const n=Xt(),a=it(t),i=rs(t),l=tp(e,a),r=Ef((o,c)=>{let d,u=Ge,f;return Ff(()=>{const p=e[a];Dt(d,p)&&(d=p,c())}),{get(){return o(),s.get?s.get(d):d},set(p){const g=s.set?s.set(p):p;if(!Dt(g,d)&&!(u!==Ge&&Dt(p,u)))return;const y=n.vnode.props,S=!!(y&&(t in y||a in y||i in y)&&(`onUpdate:${t}`in y||`onUpdate:${a}`in y||`onUpdate:${i}`in y));S||(d=p,c()),n.emit(`update:${t}`,g),Dt(p,u)&&(Dt(p,g)&&!Dt(g,f)||S&&u!==Ge&&!Dt(g,d))&&c(),u=p,f=g}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ge:r,done:!1}:{done:!0}}}},r}const tp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${it(t)}Modifiers`]||e[`${rs(t)}Modifiers`];function ub(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ge;let a=s;const i=t.startsWith("update:"),l=i&&tp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Me(d)?d.trim():d)),l.number&&(a=s.map(Xl)));let r,o=n[r=Sa(t)]||n[r=Sa(it(t))];!o&&i&&(o=n[r=Sa(rs(t))]),o&&vs(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,vs(c,e,6,a)}}const fb=new WeakMap;function sp(e,t,s=!1){const n=s?fb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ae(e)){const o=c=>{const d=sp(c,t,!0);d&&(r=!0,qe(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Xe(e)&&n.set(e,null),null):(ve(i)?i.forEach(o=>l[o]=null):qe(l,i),Xe(e)&&n.set(e,l),l)}function ur(e,t){return!e||!na(t)?!1:(t=t.slice(2).replace(/Once$/,""),et(e,t[0].toLowerCase()+t.slice(1))||et(e,rs(t))||et(e,t))}function fl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:f,setupState:p,ctx:g,inheritAttrs:y}=e,S=Ti(e);let R,v;try{if(s.shapeFlag&4){const x=a||n,w=x;R=ls(c.call(w,x,d,u,p,f,g)),v=r}else{const x=t;R=ls(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),v=t.props?r:hb(r)}}catch(x){pi.length=0,la(x,e,1),R=ft(xt)}let m=R;if(v&&y!==!1){const x=Object.keys(v),{shapeFlag:w}=m;x.length&&w&7&&(i&&x.some(Zl)&&(v=gb(v,i)),m=Ws(m,v,!1,!0))}return s.dirs&&(m=Ws(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&yn(m,s.transition),R=m,Ti(S),R}function pb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(xn(a)){if(a.type!==xt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const hb=e=>{let t;for(const s in e)(s==="class"||s==="style"||na(s))&&((t||(t={}))[s]=e[s]);return t},gb=(e,t)=>{const s={};for(const n in e)(!Zl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function mb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?md(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const f=d[u];if(np(l,n,f)&&!ur(c,f))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?md(n,l,c):!0:!!l;return!1}function md(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(np(t,e,i)&&!ur(s,i))return!0}return!1}function np(e,t,s){const n=e[s],a=t[s];return s==="style"&&Xe(n)&&Xe(a)?!mn(n,a):n!==a}function fr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const ap={},ip=()=>Object.create(ap),lp=e=>Object.getPrototypeOf(e)===ap;function vb(e,t,s,n=!1){const a={},i=ip();e.propsDefaults=Object.create(null),rp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Ho(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function bb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ze(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let f=d[u];if(ur(e.emitsOptions,f))continue;const p=t[f];if(o)if(et(i,f))p!==i[f]&&(i[f]=p,c=!0);else{const g=it(f);a[g]=oo(o,r,g,p,e,!1)}else p!==i[f]&&(i[f]=p,c=!0)}}}else{rp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!et(t,u)&&((d=rs(u))===u||!et(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=oo(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!et(t,u))&&(delete i[u],c=!0)}c&&rn(e.attrs,"set","")}function rp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(fn(o))continue;const c=t[o];let d;a&&et(a,d=it(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:ur(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ze(s),c=r||Ge;for(let d=0;d<i.length;d++){const u=i[d];s[u]=oo(a,o,u,c[u],e,!et(c,u))}}return l}function oo(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=et(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ae(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ga(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===rs(s))&&(n=!0))}return n}const yb=new WeakMap;function op(e,t,s=!1){const n=s?yb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ae(e)){const d=u=>{o=!0;const[f,p]=op(u,t,!0);qe(l,f),p&&r.push(...p)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Xe(e)&&n.set(e,wa),wa;if(ve(i))for(let d=0;d<i.length;d++){const u=it(i[d]);vd(u)&&(l[u]=Ge)}else if(i)for(const d in i){const u=it(d);if(vd(u)){const f=i[d],p=l[u]=ve(f)||Ae(f)?{type:f}:qe({},f),g=p.type;let y=!1,S=!0;if(ve(g))for(let R=0;R<g.length;++R){const v=g[R],m=Ae(v)&&v.name;if(m==="Boolean"){y=!0;break}else m==="String"&&(S=!1)}else y=Ae(g)&&g.name==="Boolean";p[0]=y,p[1]=S,(y||et(p,"default"))&&r.push(u)}}const c=[l,r];return Xe(e)&&n.set(e,c),c}function vd(e){return e[0]!=="$"&&!fn(e)}const ec=e=>e==="_"||e==="_ctx"||e==="$stable",tc=e=>ve(e)?e.map(ls):[ls(e)],xb=(e,t,s)=>{if(t._n)return t;const n=qo((...a)=>tc(t(...a)),s);return n._c=!1,n},cp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(ec(a))continue;const i=e[a];if(Ae(i))t[a]=xb(a,i,n);else if(i!=null){const l=tc(i);t[a]=()=>l}}},dp=(e,t)=>{const s=tc(t);e.slots.default=()=>s},up=(e,t,s)=>{for(const n in t)(s||!ec(n))&&(e[n]=t[n])},_b=(e,t,s)=>{const n=e.slots=ip();if(e.vnode.shapeFlag&32){const a=t._;a?(up(n,t,s),s&&sf(n,"_",a,!0)):cp(t,n)}else t&&dp(e,t)},wb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ge;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:up(a,t,s):(i=!t.$stable,cp(t,a)),l=t}else t&&(dp(e,t),l={default:1});if(i)for(const r in a)!ec(r)&&l[r]==null&&delete a[r]},kt=yp;function fp(e){return hp(e)}function pp(e){return hp(e,_v)}function hp(e,t){const s=er();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:f,setScopeId:p=Bt,insertStaticContent:g}=e,y=(b,I,F,X=null,Z=null,J=null,ue=void 0,re=null,ie=!!I.dynamicChildren)=>{if(b===I)return;b&&!Os(b,I)&&(X=z(b),te(b,Z,J,!0),b=null),I.patchFlag===-2&&(ie=!1,I.dynamicChildren=null);const{type:se,ref:ye,shapeFlag:fe}=I;switch(se){case Dn:S(b,I,F,X);break;case xt:R(b,I,F,X);break;case Jn:b==null&&v(I,F,X,ue);break;case Mt:M(b,I,F,X,Z,J,ue,re,ie);break;default:fe&1?w(b,I,F,X,Z,J,ue,re,ie):fe&6?D(b,I,F,X,Z,J,ue,re,ie):(fe&64||fe&128)&&se.process(b,I,F,X,Z,J,ue,re,ie,xe)}ye!=null&&Z?Ea(ye,b&&b.ref,J,I||b,!I):ye==null&&b&&b.ref!=null&&Ea(b.ref,null,J,b,!0)},S=(b,I,F,X)=>{if(b==null)n(I.el=r(I.children),F,X);else{const Z=I.el=b.el;I.children!==b.children&&c(Z,I.children)}},R=(b,I,F,X)=>{b==null?n(I.el=o(I.children||""),F,X):I.el=b.el},v=(b,I,F,X)=>{[b.el,b.anchor]=g(b.children,I,F,X,b.el,b.anchor)},m=({el:b,anchor:I},F,X)=>{let Z;for(;b&&b!==I;)Z=f(b),n(b,F,X),b=Z;n(I,F,X)},x=({el:b,anchor:I})=>{let F;for(;b&&b!==I;)F=f(b),a(b),b=F;a(I)},w=(b,I,F,X,Z,J,ue,re,ie)=>{if(I.type==="svg"?ue="svg":I.type==="math"&&(ue="mathml"),b==null)_(I,F,X,Z,J,ue,re,ie);else{const se=b.el&&b.el._isVueCE?b.el:null;try{se&&se._beginPatch(),C(b,I,Z,J,ue,re,ie)}finally{se&&se._endPatch()}}},_=(b,I,F,X,Z,J,ue,re)=>{let ie,se;const{props:ye,shapeFlag:fe,transition:ge,dirs:we}=b;if(ie=b.el=l(b.type,J,ye&&ye.is,ye),fe&8?d(ie,b.children):fe&16&&T(b.children,ie,null,X,Z,Dr(b,J),ue,re),we&&zs(b,null,X,"created"),A(ie,b,b.scopeId,ue,X),ye){for(const Re in ye)Re!=="value"&&!fn(Re)&&i(ie,Re,null,ye[Re],J,X);"value"in ye&&i(ie,"value",null,ye.value,J),(se=ye.onVnodeBeforeMount)&&as(se,X,b)}we&&zs(b,null,X,"beforeMount");const Te=gp(Z,ge);Te&&ge.beforeEnter(ie),n(ie,I,F),((se=ye&&ye.onVnodeMounted)||Te||we)&&kt(()=>{try{se&&as(se,X,b),Te&&ge.enter(ie),we&&zs(b,null,X,"mounted")}finally{}},Z)},A=(b,I,F,X,Z)=>{if(F&&p(b,F),X)for(let J=0;J<X.length;J++)p(b,X[J]);if(Z){let J=Z.subTree;if(I===J||Al(J.type)&&(J.ssContent===I||J.ssFallback===I)){const ue=Z.vnode;A(b,ue,ue.scopeId,ue.slotScopeIds,Z.parent)}}},T=(b,I,F,X,Z,J,ue,re,ie=0)=>{for(let se=ie;se<b.length;se++){const ye=b[se]=re?an(b[se]):ls(b[se]);y(null,ye,I,F,X,Z,J,ue,re)}},C=(b,I,F,X,Z,J,ue)=>{const re=I.el=b.el;let{patchFlag:ie,dynamicChildren:se,dirs:ye}=I;ie|=b.patchFlag&16;const fe=b.props||Ge,ge=I.props||Ge;let we;if(F&&Bn(F,!1),(we=ge.onVnodeBeforeUpdate)&&as(we,F,I,b),ye&&zs(I,b,F,"beforeUpdate"),F&&Bn(F,!0),(fe.innerHTML&&ge.innerHTML==null||fe.textContent&&ge.textContent==null)&&d(re,""),se?L(b.dynamicChildren,se,re,F,X,Dr(I,Z),J):ue||E(b,I,re,null,F,X,Dr(I,Z),J,!1),ie>0){if(ie&16)H(re,fe,ge,F,Z);else if(ie&2&&fe.class!==ge.class&&i(re,"class",null,ge.class,Z),ie&4&&i(re,"style",fe.style,ge.style,Z),ie&8){const Te=I.dynamicProps;for(let Re=0;Re<Te.length;Re++){const Ne=Te[Re],Pe=fe[Ne],Ve=ge[Ne];(Ve!==Pe||Ne==="value")&&i(re,Ne,Pe,Ve,Z,F)}}ie&1&&b.children!==I.children&&d(re,I.children)}else!ue&&se==null&&H(re,fe,ge,F,Z);((we=ge.onVnodeUpdated)||ye)&&kt(()=>{we&&as(we,F,I,b),ye&&zs(I,b,F,"updated")},X)},L=(b,I,F,X,Z,J,ue)=>{for(let re=0;re<I.length;re++){const ie=b[re],se=I[re],ye=ie.el&&(ie.type===Mt||!Os(ie,se)||ie.shapeFlag&198)?u(ie.el):F;y(ie,se,ye,null,X,Z,J,ue,!0)}},H=(b,I,F,X,Z)=>{if(I!==F){if(I!==Ge)for(const J in I)!fn(J)&&!(J in F)&&i(b,J,I[J],null,Z,X);for(const J in F){if(fn(J))continue;const ue=F[J],re=I[J];ue!==re&&J!=="value"&&i(b,J,re,ue,Z,X)}"value"in F&&i(b,"value",I.value,F.value,Z)}},M=(b,I,F,X,Z,J,ue,re,ie)=>{const se=I.el=b?b.el:r(""),ye=I.anchor=b?b.anchor:r("");let{patchFlag:fe,dynamicChildren:ge,slotScopeIds:we}=I;we&&(re=re?re.concat(we):we),b==null?(n(se,F,X),n(ye,F,X),T(I.children||[],F,ye,Z,J,ue,re,ie)):fe>0&&fe&64&&ge&&b.dynamicChildren&&b.dynamicChildren.length===ge.length?(L(b.dynamicChildren,ge,F,Z,J,ue,re),(I.key!=null||Z&&I===Z.subTree)&&sc(b,I,!0)):E(b,I,F,ye,Z,J,ue,re,ie)},D=(b,I,F,X,Z,J,ue,re,ie)=>{I.slotScopeIds=re,b==null?I.shapeFlag&512?Z.ctx.activate(I,F,X,ue,ie):K(I,F,X,Z,J,ue,ie):ne(b,I,ie)},K=(b,I,F,X,Z,J,ue)=>{const re=b.component=Cp(b,X,Z);if(ji(b)&&(re.ctx.renderer=xe),Ap(re,!1,ue),re.asyncDep){if(Z&&Z.registerDep(re,$,ue),!b.el){const ie=re.subTree=ft(xt);R(null,ie,I,F),b.placeholder=ie.el}}else $(re,b,I,F,Z,J,ue)},ne=(b,I,F)=>{const X=I.component=b.component;if(mb(b,I,F))if(X.asyncDep&&!X.asyncResolved){O(X,I,F);return}else X.next=I,X.update();else I.el=b.el,X.vnode=I},$=(b,I,F,X,Z,J,ue)=>{const re=()=>{if(b.isMounted){let{next:fe,bu:ge,u:we,parent:Te,vnode:Re}=b;{const V=mp(b);if(V){fe&&(fe.el=Re.el,O(b,fe,ue)),V.asyncDep.then(()=>{kt(()=>{b.isUnmounted||se()},Z)});return}}let Ne=fe,Pe;Bn(b,!1),fe?(fe.el=Re.el,O(b,fe,ue)):fe=Re,ge&&Ta(ge),(Pe=fe.props&&fe.props.onVnodeBeforeUpdate)&&as(Pe,Te,fe,Re),Bn(b,!0);const Ve=fl(b),st=b.subTree;b.subTree=Ve,y(st,Ve,u(st.el),z(st),b,Z,J),fe.el=Ve.el,Ne===null&&fr(b,Ve.el),we&&kt(we,Z),(Pe=fe.props&&fe.props.onVnodeUpdated)&&kt(()=>as(Pe,Te,fe,Re),Z)}else{let fe;const{el:ge,props:we}=I,{bm:Te,m:Re,parent:Ne,root:Pe,type:Ve}=b,st=hn(I);if(Bn(b,!1),Te&&Ta(Te),!st&&(fe=we&&we.onVnodeBeforeMount)&&as(fe,Ne,I),Bn(b,!0),ge&&Be){const V=()=>{b.subTree=fl(b),Be(ge,b.subTree,b,Z,null)};st&&Ve.__asyncHydrate?Ve.__asyncHydrate(ge,b,V):V()}else{Pe.ce&&Pe.ce._hasShadowRoot()&&Pe.ce._injectChildStyle(Ve,b.parent?b.parent.type:void 0);const V=b.subTree=fl(b);y(null,V,F,X,b,Z,J),I.el=V.el}if(Re&&kt(Re,Z),!st&&(fe=we&&we.onVnodeMounted)){const V=I;kt(()=>as(fe,Ne,V),Z)}(I.shapeFlag&256||Ne&&hn(Ne.vnode)&&Ne.vnode.shapeFlag&256)&&b.a&&kt(b.a,Z),b.isMounted=!0,I=F=X=null}};b.scope.on();const ie=b.effect=new xi(re);b.scope.off();const se=b.update=ie.run.bind(ie),ye=b.job=ie.runIfDirty.bind(ie);ye.i=b,ye.id=b.uid,ie.scheduler=()=>zo(ye),Bn(b,!0),se()},O=(b,I,F)=>{I.component=b;const X=b.vnode.props;b.vnode=I,b.next=null,bb(b,I.props,X,F),wb(b,I.children,F),vn(),ad(b),bn()},E=(b,I,F,X,Z,J,ue,re,ie=!1)=>{const se=b&&b.children,ye=b?b.shapeFlag:0,fe=I.children,{patchFlag:ge,shapeFlag:we}=I;if(ge>0){if(ge&128){B(se,fe,F,X,Z,J,ue,re,ie);return}else if(ge&256){N(se,fe,F,X,Z,J,ue,re,ie);return}}we&8?(ye&16&&Fe(se,Z,J),fe!==se&&d(F,fe)):ye&16?we&16?B(se,fe,F,X,Z,J,ue,re,ie):Fe(se,Z,J,!0):(ye&8&&d(F,""),we&16&&T(fe,F,X,Z,J,ue,re,ie))},N=(b,I,F,X,Z,J,ue,re,ie)=>{b=b||wa,I=I||wa;const se=b.length,ye=I.length,fe=Math.min(se,ye);let ge;for(ge=0;ge<fe;ge++){const we=I[ge]=ie?an(I[ge]):ls(I[ge]);y(b[ge],we,F,null,Z,J,ue,re,ie)}se>ye?Fe(b,Z,J,!0,!1,fe):T(I,F,X,Z,J,ue,re,ie,fe)},B=(b,I,F,X,Z,J,ue,re,ie)=>{let se=0;const ye=I.length;let fe=b.length-1,ge=ye-1;for(;se<=fe&&se<=ge;){const we=b[se],Te=I[se]=ie?an(I[se]):ls(I[se]);if(Os(we,Te))y(we,Te,F,null,Z,J,ue,re,ie);else break;se++}for(;se<=fe&&se<=ge;){const we=b[fe],Te=I[ge]=ie?an(I[ge]):ls(I[ge]);if(Os(we,Te))y(we,Te,F,null,Z,J,ue,re,ie);else break;fe--,ge--}if(se>fe){if(se<=ge){const we=ge+1,Te=we<ye?I[we].el:X;for(;se<=ge;)y(null,I[se]=ie?an(I[se]):ls(I[se]),F,Te,Z,J,ue,re,ie),se++}}else if(se>ge)for(;se<=fe;)te(b[se],Z,J,!0),se++;else{const we=se,Te=se,Re=new Map;for(se=Te;se<=ge;se++){const De=I[se]=ie?an(I[se]):ls(I[se]);De.key!=null&&Re.set(De.key,se)}let Ne,Pe=0;const Ve=ge-Te+1;let st=!1,V=0;const _e=new Array(Ve);for(se=0;se<Ve;se++)_e[se]=0;for(se=we;se<=fe;se++){const De=b[se];if(Pe>=Ve){te(De,Z,J,!0);continue}let ze;if(De.key!=null)ze=Re.get(De.key);else for(Ne=Te;Ne<=ge;Ne++)if(_e[Ne-Te]===0&&Os(De,I[Ne])){ze=Ne;break}ze===void 0?te(De,Z,J,!0):(_e[ze-Te]=se+1,ze>=V?V=ze:st=!0,y(De,I[ze],F,null,Z,J,ue,re,ie),Pe++)}const Ie=st?kb(_e):wa;for(Ne=Ie.length-1,se=Ve-1;se>=0;se--){const De=Te+se,ze=I[De],Ye=I[De+1],ht=De+1<ye?Ye.el||vp(Ye):X;_e[se]===0?y(null,ze,F,ht,Z,J,ue,re,ie):st&&(Ne<0||se!==Ie[Ne]?W(ze,F,ht,2):Ne--)}}},W=(b,I,F,X,Z=null)=>{const{el:J,type:ue,transition:re,children:ie,shapeFlag:se}=b;if(se&6){W(b.component.subTree,I,F,X);return}if(se&128){b.suspense.move(I,F,X);return}if(se&64){ue.move(b,I,F,xe);return}if(ue===Mt){n(J,I,F);for(let fe=0;fe<ie.length;fe++)W(ie[fe],I,F,X);n(b.anchor,I,F);return}if(ue===Jn){m(b,I,F);return}if(X!==2&&se&1&&re)if(X===0)re.persisted&&!J[ws]?n(J,I,F):(re.beforeEnter(J),n(J,I,F),kt(()=>re.enter(J),Z));else{const{leave:fe,delayLeave:ge,afterLeave:we}=re,Te=()=>{b.ctx.isUnmounted?a(J):n(J,I,F)},Re=()=>{const Ne=J._isLeaving||!!J[ws];J._isLeaving&&J[ws](!0),re.persisted&&!Ne?Te():fe(J,()=>{Te(),we&&we()})};ge?ge(J,Te,Re):Re()}else n(J,I,F)},te=(b,I,F,X=!1,Z=!1)=>{const{type:J,props:ue,ref:re,children:ie,dynamicChildren:se,shapeFlag:ye,patchFlag:fe,dirs:ge,cacheIndex:we,memo:Te}=b;if(fe===-2&&(Z=!1),re!=null&&(vn(),Ea(re,null,F,b,!0),bn()),we!=null&&(I.renderCache[we]=void 0),ye&256){I.ctx.deactivate(b);return}const Re=ye&1&&ge,Ne=!hn(b);let Pe;if(Ne&&(Pe=ue&&ue.onVnodeBeforeUnmount)&&as(Pe,I,b),ye&6)he(b.component,F,X);else{if(ye&128){b.suspense.unmount(F,X);return}Re&&zs(b,null,I,"beforeUnmount"),ye&64?b.type.remove(b,I,F,xe,X):se&&!se.hasOnce&&(J!==Mt||fe>0&&fe&64)?Fe(se,I,F,!1,!0):(J===Mt&&fe&384||!Z&&ye&16)&&Fe(ie,I,F),X&&oe(b)}const Ve=Te!=null&&we==null;(Ne&&(Pe=ue&&ue.onVnodeUnmounted)||Re||Ve)&&kt(()=>{Pe&&as(Pe,I,b),Re&&zs(b,null,I,"unmounted"),Ve&&(b.el=null)},F)},oe=b=>{const{type:I,el:F,anchor:X,transition:Z}=b;if(I===Mt){Q(F,X);return}if(I===Jn){x(b);return}const J=()=>{a(F),Z&&!Z.persisted&&Z.afterLeave&&Z.afterLeave()};if(b.shapeFlag&1&&Z&&!Z.persisted){const{leave:ue,delayLeave:re}=Z,ie=()=>ue(F,J);re?re(b.el,J,ie):ie()}else J()},Q=(b,I)=>{let F;for(;b!==I;)F=f(b),a(b),b=F;a(I)},he=(b,I,F)=>{const{bum:X,scope:Z,job:J,subTree:ue,um:re,m:ie,a:se}=b;El(ie),El(se),X&&Ta(X),Z.stop(),J&&(J.flags|=8,te(ue,b,I,F)),re&&kt(re,I),kt(()=>{b.isUnmounted=!0},I)},Fe=(b,I,F,X=!1,Z=!1,J=0)=>{for(let ue=J;ue<b.length;ue++)te(b[ue],I,F,X,Z)},z=b=>{if(b.shapeFlag&6)return z(b.component.subTree);if(b.shapeFlag&128)return b.suspense.next();const I=f(b.anchor||b.el),F=I&&I[Uf];return F?f(F):I};let pe=!1;const de=(b,I,F)=>{let X;b==null?I._vnode&&(te(I._vnode,null,null,!0),X=I._vnode.component):y(I._vnode||null,b,I,null,null,null,F),I._vnode=b,pe||(pe=!0,ad(X),Sl(),pe=!1)},xe={p:y,um:te,m:W,r:oe,mt:K,mc:T,pc:E,pbc:L,n:z,o:e};let me,Be;return t&&([me,Be]=t(xe)),{render:de,hydrate:me,createApp:cb(de,me)}}function Dr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Bn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function gp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function sc(e,t,s=!1){const n=e.children,a=t.children;if(ve(n)&&ve(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=an(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&sc(l,r)),r.type===Dn&&(r.patchFlag===-1&&(r=a[i]=an(r)),r.el=l.el),r.type===xt&&!r.el&&(r.el=l.el)}}function kb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function mp(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:mp(t)}function El(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function vp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?vp(t.subTree):null}const Al=e=>e.__isSuspense;let co=0;const Sb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Cb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Eb(e,t,s,n,a,l,r,o,c)}},hydrate:Ab,normalize:Rb},Tb=Sb;function Ei(e,t){const s=e.props&&e.props[t];Ae(s)&&s()}function Cb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),f=e.suspense=bp(e,a,n,t,u,s,i,l,r,o);c(null,f.pendingBranch=e.ssContent,u,null,n,f,i,l),f.deps>0?(Ei(e,"onPending"),Ei(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Aa(f,e.ssFallback)):f.resolve(!1,!0)}function Eb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const f=t.ssContent,p=t.ssFallback,{activeBranch:g,pendingBranch:y,isInFallback:S,isHydrating:R}=u;if(y)u.pendingBranch=f,Os(y,f)?(o(y,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():S&&(R||(o(g,p,s,n,a,null,i,l,r),Aa(u,p)))):(u.pendingId=co++,R?(u.isHydrating=!1,u.activeBranch=y):c(y,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),S?(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(g,p,s,n,a,null,i,l,r),Aa(u,p))):g&&Os(g,f)?(o(g,f,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(g&&Os(g,f))o(g,f,s,n,a,u,i,l,r),Aa(u,f);else if(Ei(t,"onPending"),u.pendingBranch=f,f.shapeFlag&512?u.pendingId=f.component.suspenseId:u.pendingId=co++,o(null,f,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:v,pendingId:m}=u;v>0?setTimeout(()=>{u.pendingId===m&&u.fallback(p)},v):v===0&&u.fallback(p)}}function bp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:f,um:p,n:g,o:{parentNode:y,remove:S}}=c;let R;const v=Ib(e);v&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const m=e.props?yl(e.props.timeout):void 0,x=i,w={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:co++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(_=!1,A=!1){const{vnode:T,activeBranch:C,pendingBranch:L,pendingId:H,effects:M,parentComponent:D,container:K,isInFallback:ne}=w;let $=!1;if(w.isHydrating)w.isHydrating=!1;else if(!_){$=C&&L.transition&&L.transition.mode==="out-in";let N=!1;$&&(C.transition.afterLeave=()=>{H===w.pendingId&&(f(L,K,i===x&&!N?g(C):i,0),ki(M),ne&&T.ssFallback&&(T.ssFallback.el=null))}),C&&!w.isFallbackMountPending&&(y(C.el)===K&&(i=g(C),N=!0),p(C,D,w,!0),!$&&ne&&T.ssFallback&&kt(()=>T.ssFallback.el=null,w)),$||f(L,K,i,0)}w.isFallbackMountPending=!1,Aa(w,L),w.pendingBranch=null,w.isInFallback=!1;let O=w.parent,E=!1;for(;O;){if(O.pendingBranch){O.effects.push(...M),E=!0;break}O=O.parent}!E&&!$&&ki(M),w.effects=[],v&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!A&&t.resolve()),Ei(T,"onResolve")},fallback(_){if(!w.pendingBranch)return;const{vnode:A,activeBranch:T,parentComponent:C,container:L,namespace:H}=w;Ei(A,"onFallback");const M=g(T),D=()=>{w.isFallbackMountPending=!1,w.isInFallback&&(u(null,_,L,M,C,null,H,r,o),Aa(w,_))},K=_.transition&&_.transition.mode==="out-in";K&&(w.isFallbackMountPending=!0,T.transition.afterLeave=D),w.isInFallback=!0,p(T,C,null,!0),K||D()},move(_,A,T){w.activeBranch&&f(w.activeBranch,_,A,T),w.container=_},next(){return w.activeBranch&&g(w.activeBranch)},registerDep(_,A,T){const C=!!w.pendingBranch;C&&w.deps++;const L=_.vnode.el;_.asyncDep.catch(H=>{la(H,_,0)}).then(H=>{if(_.isUnmounted||w.isUnmounted||w.pendingId!==_.suspenseId)return;Ii(),_.asyncResolved=!0;const{vnode:M}=_;uo(_,H,!1),L&&(M.el=L);const D=!L&&_.subTree.el;A(_,M,y(L||_.subTree.el),L?null:g(_.subTree),w,l,T),D&&(M.placeholder=null,S(D)),fr(_,M.el),C&&--w.deps===0&&w.resolve()})},unmount(_,A){w.isUnmounted=!0,w.activeBranch&&p(w.activeBranch,s,_,A),w.pendingBranch&&p(w.pendingBranch,s,_,A)}};return w}function Ab(e,t,s,n,a,i,l,r,o){const c=t.suspense=bp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Rb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=bd(n?s.default:s),e.ssFallback=n?bd(s.fallback):ft(xt)}function bd(e){let t;if(Ae(e)){const s=Xn&&e._c;s&&(e._d=!1,Ai()),e=e(),s&&(e._d=!0,t=qt,xp())}return ve(e)&&(e=pb(e)),e=ls(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function yp(e,t){t&&t.pendingBranch?ve(e)?t.effects.push(...e):t.effects.push(e):ki(e)}function Aa(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,fr(n,a))}function Ib(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Mt=Symbol.for("v-fgt"),Dn=Symbol.for("v-txt"),xt=Symbol.for("v-cmt"),Jn=Symbol.for("v-stc"),pi=[];let qt=null;function Ai(e=!1){pi.push(qt=e?null:[])}function xp(){pi.pop(),qt=pi[pi.length-1]||null}let Xn=1;function Ri(e,t=!1){Xn+=e,e<0&&qt&&t&&(qt.hasOnce=!0)}function _p(e){return e.dynamicChildren=Xn>0?qt||wa:null,xp(),Xn>0&&qt&&qt.push(e),e}function Ob(e,t,s,n,a,i){return _p(nc(e,t,s,n,a,i,!0))}function Rl(e,t,s,n,a){return _p(ft(e,t,s,n,a,!0))}function xn(e){return e?e.__v_isVNode===!0:!1}function Os(e,t){return e.type===t.type&&e.key===t.key}function Lb(e){}const wp=({key:e})=>e??null,pl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Me(e)||Tt(e)||Ae(e)?{i:Ut,r:e,k:t,f:!!s}:e:null);function nc(e,t=null,s=null,n=0,a=null,i=e===Mt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&wp(t),ref:t&&pl(t),scopeId:lr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Ut};return r?(ic(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Me(s)?8:16),Xn>0&&!l&&qt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&qt.push(o),o}const ft=Nb;function Nb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Yf)&&(e=xt),xn(e)){const r=Ws(e,t,!0);return s&&ic(r,s),Xn>0&&!i&&qt&&(r.shapeFlag&6?qt[qt.indexOf(e)]=r:qt.push(r)),r.patchFlag=-2,r}if(Bb(e)&&(e=e.__vccOpts),t){t=kp(t);let{class:r,style:o}=t;r&&!Me(r)&&(t.class=Ui(r)),Xe(o)&&(Bi(o)&&!ve(o)&&(o=qe({},o)),t.style=$i(o))}const l=Me(e)?1:Al(e)?128:Bf(e)?64:Xe(e)?4:Ae(e)?2:0;return nc(e,t,s,n,a,l,i,!0)}function kp(e){return e?Bi(e)||lp(e)?qe({},e):e:null}function Ws(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Tp(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&wp(c),ref:t&&t.ref?s&&i?ve(i)?i.concat(pl(t)):[i,pl(t)]:pl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Mt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ws(e.ssContent),ssFallback:e.ssFallback&&Ws(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&yn(d,o.clone(d)),d}function ac(e=" ",t=0){return ft(Dn,null,e,t)}function Db(e,t){const s=ft(Jn,null,e);return s.staticCount=t,s}function Sp(e="",t=!1){return t?(Ai(),Rl(xt,null,e)):ft(xt,null,e)}function ls(e){return e==null||typeof e=="boolean"?ft(xt):ve(e)?ft(Mt,null,e.slice()):xn(e)?an(e):ft(Dn,null,String(e))}function an(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ws(e)}function ic(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ve(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),ic(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!lp(t)?t._ctx=Ut:a===3&&Ut&&(Ut.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ae(t)?(t={default:t,_ctx:Ut},s=32):(t=String(t),n&64?(s=16,t=[ac(t)]):s=8);e.children=t,e.shapeFlag|=s}function Tp(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=Ui([t.class,n.class]));else if(a==="style")t.style=$i([t.style,n.style]);else if(na(a)){const i=t[a],l=n[a];l&&i!==l&&!(ve(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Zl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function as(e,t,s,n=null){vs(e,t,7,[s,n])}const Mb=ep();let Pb=0;function Cp(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Mb,i={uid:Pb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Fo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:op(n,a),emitsOptions:sp(n,a),emit:null,emitted:null,propsDefaults:Ge,inheritAttrs:n.inheritAttrs,ctx:Ge,data:Ge,props:Ge,attrs:Ge,slots:Ge,refs:Ge,setupState:Ge,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=ub.bind(null,i),e.ce&&e.ce(i),i}let $t=null;const Xt=()=>$t||Ut;let Il,Ra;{const e=er(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Il=t("__VUE_INSTANCE_SETTERS__",s=>$t=s),Ra=t("__VUE_SSR_SETTERS__",s=>ea=s)}const Ga=e=>{const t=$t;return Il(e),e.scope.on(),()=>{e.scope.off(),Il(t)}},Ii=()=>{$t&&$t.scope.off(),Il(null)};function Ep(e){return e.vnode.shapeFlag&4}let ea=!1;function Ap(e,t=!1,s=!1){t&&Ra(t);const{props:n,children:a}=e.vnode,i=Ep(e);vb(e,n,i,t),_b(e,a,s||t);const l=i?Fb(e,t):void 0;return t&&Ra(!1),l}function Fb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,io);const{setup:n}=s;if(n){vn();const a=e.setupContext=n.length>1?Op(e):null,i=Ga(e),l=qa(n,e,0,[e.props,a]),r=Po(l);if(bn(),i(),(r||e.sp)&&!hn(e)&&Wo(e),r){if(l.then(Ii,Ii),t)return l.then(o=>{uo(e,o,t)}).catch(o=>{la(o,e,0)});e.asyncDep=l}else uo(e,l,t)}else Ip(e,t)}function uo(e,t,s){Ae(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Xe(t)&&(e.setupState=jo(t)),Ip(e,s)}let Ol,fo;function Rp(e){Ol=e,fo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,jv))}}const $b=()=>!Ol;function Ip(e,t,s){const n=e.type;if(!e.render){if(!t&&Ol&&!n.render){const a=n.template||Xo(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=qe(qe({isCustomElement:i,delimiters:r},l),o);n.render=Ol(a,c)}}e.render=n.render||Bt,fo&&fo(e)}{const a=Ga(e);vn();try{nb(e)}finally{bn(),a()}}}const Ub={get(e,t){return zt(e,"get",""),e[t]}};function Op(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Ub),slots:e.slots,emit:e.emit,expose:t}}function zi(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(jo(Tf(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in fi)return fi[s](e)},has(t,s){return s in t||s in fi}})):e.proxy}function po(e,t=!0){return Ae(e)?e.displayName||e.name:e.name||t&&e.__name}function Bb(e){return Ae(e)&&"__vccOpts"in e}const ee=(e,t)=>Gm(e,t,ea);function Da(e,t,s){try{Ri(-1);const n=arguments.length;return n===2?Xe(t)&&!ve(t)?xn(t)?ft(e,null,[t]):ft(e,t):ft(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&xn(s)&&(s=[s]),ft(e,t,s))}finally{Ri(1)}}function Hb(){}function Vb(e,t,s,n){const a=s[n];if(a&&Lp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Lp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Dt(s[n],t[n]))return!1;return Xn>0&&qt&&qt.push(e),!0}const Np="3.5.38",jb=Bt,zb=tv,qb=va,Gb=Df,Kb={createComponentInstance:Cp,setupComponent:Ap,renderComponentRoot:fl,setCurrentRenderingInstance:Ti,isVNode:xn,normalizeVNode:ls,getComponentPublicInstance:zi,ensureValidVNode:Qo,pushWarningContext:Ym,popWarningContext:Qm},Wb=Kb,Zb=null,Jb=null,Yb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let ho;const yd=typeof window<"u"&&window.trustedTypes;if(yd)try{ho=yd.createPolicy("vue",{createHTML:e=>e})}catch{}const Dp=ho?e=>ho.createHTML(e):e=>e,Qb="http://www.w3.org/2000/svg",Xb="http://www.w3.org/1998/Math/MathML",nn=typeof document<"u"?document:null,xd=nn&&nn.createElement("template"),Mp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?nn.createElementNS(Qb,e):t==="mathml"?nn.createElementNS(Xb,e):s?nn.createElement(e,{is:s}):nn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>nn.createTextNode(e),createComment:e=>nn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>nn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{xd.innerHTML=Dp(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=xd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Sn="transition",Ja="animation",Ma=Symbol("_vtc"),Pp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Fp=qe({},Ko,Pp),ey=e=>(e.displayName="Transition",e.props=Fp,e),ty=ey((e,{slots:t})=>Da(jf,$p(e),t)),Hn=(e,t=[])=>{ve(e)?e.forEach(s=>s(...t)):e&&e(...t)},_d=e=>e?ve(e)?e.some(t=>t.length>1):e.length>1:!1;function $p(e){const t={};for(const M in e)M in Pp||(t[M]=e[M]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:f=`${s}-leave-active`,leaveToClass:p=`${s}-leave-to`}=e,g=sy(a),y=g&&g[0],S=g&&g[1],{onBeforeEnter:R,onEnter:v,onEnterCancelled:m,onLeave:x,onLeaveCancelled:w,onBeforeAppear:_=R,onAppear:A=v,onAppearCancelled:T=m}=t,C=(M,D,K,ne)=>{M._enterCancelled=ne,An(M,D?d:r),An(M,D?c:l),K&&K()},L=(M,D)=>{M._isLeaving=!1,An(M,u),An(M,p),An(M,f),D&&D()},H=M=>(D,K)=>{const ne=M?A:v,$=()=>C(D,M,K);Hn(ne,[D,$]),wd(()=>{An(D,M?o:i),Bs(D,M?d:r),_d(ne)||kd(D,n,y,$)})};return qe(t,{onBeforeEnter(M){Hn(R,[M]),Bs(M,i),Bs(M,l)},onBeforeAppear(M){Hn(_,[M]),Bs(M,o),Bs(M,c)},onEnter:H(!1),onAppear:H(!0),onLeave(M,D){M._isLeaving=!0;const K=()=>L(M,D);Bs(M,u),M._enterCancelled?(Bs(M,f),go(M)):(go(M),Bs(M,f)),wd(()=>{M._isLeaving&&(An(M,u),Bs(M,p),_d(x)||kd(M,n,S,K))}),Hn(x,[M,K])},onEnterCancelled(M){C(M,!1,void 0,!0),Hn(m,[M])},onAppearCancelled(M){C(M,!0,void 0,!0),Hn(T,[M])},onLeaveCancelled(M){L(M),Hn(w,[M])}})}function sy(e){if(e==null)return null;if(Xe(e))return[Mr(e.enter),Mr(e.leave)];{const t=Mr(e);return[t,t]}}function Mr(e){return yl(e)}function Bs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ma]||(e[Ma]=new Set)).add(t)}function An(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ma];s&&(s.delete(t),s.size||(e[Ma]=void 0))}function wd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let ny=0;function kd(e,t,s,n){const a=e._endId=++ny,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=Up(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,f),i()},f=p=>{p.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,f)}function Up(e,t){const s=window.getComputedStyle(e),n=g=>(s[g]||"").split(", "),a=n(`${Sn}Delay`),i=n(`${Sn}Duration`),l=Sd(a,i),r=n(`${Ja}Delay`),o=n(`${Ja}Duration`),c=Sd(r,o);let d=null,u=0,f=0;t===Sn?l>0&&(d=Sn,u=l,f=i.length):t===Ja?c>0&&(d=Ja,u=c,f=o.length):(u=Math.max(l,c),d=u>0?l>c?Sn:Ja:null,f=d?d===Sn?i.length:o.length:0);const p=d===Sn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Sn}Property`).toString());return{type:d,timeout:u,propCount:f,hasTransform:p}}function Sd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Td(s)+Td(e[n])))}function Td(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function go(e){return(e?e.ownerDocument:document).body.offsetHeight}function ay(e,t,s){const n=e[Ma];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Ll=Symbol("_vod"),lc=Symbol("_vsh"),Bp={name:"show",beforeMount(e,{value:t},{transition:s}){e[Ll]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ya(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ya(e,!0),n.enter(e)):n.leave(e,()=>{Ya(e,!1)}):Ya(e,t))},beforeUnmount(e,{value:t}){Ya(e,t)}};function Ya(e,t){e.style.display=t?e[Ll]:"none",e[lc]=!t}function iy(){Bp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Hp=Symbol("");function ly(e){const t=Xt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Nl(i,a))},n=()=>{const a=e(t.proxy);t.ce?Nl(t.ce,a):mo(t.subTree,a),s(a)};Zo(()=>{ki(n)}),Je(()=>{ds(n,Bt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),_t(()=>a.disconnect())})}function mo(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{mo(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Nl(e.el,t);else if(e.type===Mt)e.children.forEach(s=>mo(s,t));else if(e.type===Jn){let{el:s,anchor:n}=e;for(;s&&(Nl(s,t),s!==n);)s=s.nextSibling}}function Nl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=fm(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Hp]=n}}const ry=/(?:^|;)\s*display\s*:/;function oy(e,t,s){const n=e.style,a=Me(s);let i=!1;if(s&&!a){if(t)if(Me(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&ri(n,r,"")}else for(const l in t)s[l]==null&&ri(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?dy(e,l,!Me(t)&&t?t[l]:void 0,r)||ri(n,l,r):ri(n,l,"")}}else if(a){if(t!==s){const l=n[Hp];l&&(s+=";"+l),n.cssText=s,i=ry.test(s)}}else t&&e.removeAttribute("style");Ll in e&&(e[Ll]=i?n.display:"",e[lc]&&(n.display="none"))}const Cd=/\s*!important$/;function ri(e,t,s){if(ve(s))s.forEach(n=>ri(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=cy(e,t);Cd.test(s)?e.setProperty(rs(n),s.replace(Cd,""),"important"):e[n]=s}}const Ed=["Webkit","Moz","ms"],Pr={};function cy(e,t){const s=Pr[t];if(s)return s;let n=it(t);if(n!=="filter"&&n in e)return Pr[t]=n;n=ia(n);for(let a=0;a<Ed.length;a++){const i=Ed[a]+n;if(i in e)return Pr[t]=i}return t}function dy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Me(n)&&s===n}const Ad="http://www.w3.org/1999/xlink";function Rd(e,t,s,n,a,i=dm(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ad,t.slice(6,t.length)):e.setAttributeNS(Ad,t,s):s==null||i&&!af(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Kt(s)?String(s):s)}function Id(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Dp(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=af(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function cn(e,t,s,n){e.addEventListener(t,s,n)}function uy(e,t,s,n){e.removeEventListener(t,s,n)}const Od=Symbol("_vei");function fy(e,t,s,n,a=null){const i=e[Od]||(e[Od]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=py(t);if(n){const c=i[t]=my(n,a);cn(e,r,c,o)}else l&&(uy(e,r,l,o),i[t]=void 0)}}const Ld=/(?:Once|Passive|Capture)$/;function py(e){let t;if(Ld.test(e)){t={};let n;for(;n=e.match(Ld);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):rs(e.slice(2)),t]}let Fr=0;const hy=Promise.resolve(),gy=()=>Fr||(hy.then(()=>Fr=0),Fr=Date.now());function my(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ve(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&vs(c,t,5,r)}}else vs(a,t,5,[n])};return s.value=e,s.attached=gy(),s}const Nd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Vp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?ay(e,n,l):t==="style"?oy(e,s,n):na(t)?Zl(t)||fy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):vy(e,t,n,l))?(Id(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Rd(e,t,n,l,i,t!=="value")):e._isVueCE&&(by(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Me(n)))?Id(e,it(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Rd(e,t,n,l))};function vy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Nd(t)&&Ae(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Nd(t)&&Me(s)?!1:t in e}function by(e,t){const s=e._def.props;if(!s)return!1;const n=it(t);return Array.isArray(s)?s.some(a=>it(a)===n):Object.keys(s).some(a=>it(a)===n)}const Dd={};function jp(e,t,s){let n=Vi(e,t);Jl(n)&&(n=qe({},n,t));class a extends pr{constructor(l){super(n,l,s)}}return a.def=n,a}const yy=((e,t)=>jp(e,t,sh)),xy=typeof HTMLElement<"u"?HTMLElement:class{};class pr extends xy{constructor(t,s={},n=Pl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Pl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(qe({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof pr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ot(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ve(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=yl(this._props[o])),(r||(r=Object.create(null)))[it(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)et(this,n)||Object.defineProperty(this,n,{get:()=>Gs(s[n])})}_resolveProps(t){const{props:s}=t,n=ve(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(it))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Dd;const a=it(t);s&&this._numberProps&&this._numberProps[a]&&(n=yl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Dd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(rs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(rs(t),s+""):s||this.removeAttribute(rs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),th(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ft(this._def,qe(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Jl(l[0])?qe({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),rs(i)!==i&&a(rs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function zp(e){const t=Xt(),s=t&&t.ce;return s||null}function _y(){const e=zp();return e&&e.shadowRoot}function wy(e="$style"){{const t=Xt();if(!t)return Ge;const s=t.type.__cssModules;if(!s)return Ge;const n=s[e];return n||Ge}}const qp=new WeakMap,Gp=new WeakMap,Dl=Symbol("_moveCb"),Md=Symbol("_enterCb"),ky=e=>(delete e.props.mode,e),Sy=ky({name:"TransitionGroup",props:qe({},Fp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Xt(),n=Go();let a,i;return cr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ry(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Cy),a.forEach(Ey);const r=a.filter(Ay);go(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Bs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Dl]=f=>{f&&f.target!==c||(!f||f.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Dl]=null,An(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),r=$p(l);let o=l.tag||Mt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[lc]&&(a.push(d),yn(d,Na(d,r,n,s)),qp.set(d,Kp(d.el)))}i=t.default?rr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&yn(d,Na(d,r,n,s))}return ft(o,null,i)}}}),Ty=Sy;function Cy(e){const t=e.el;t[Dl]&&t[Dl](),t[Md]&&t[Md]()}function Ey(e){Gp.set(e,Kp(e.el))}function Ay(e){const t=qp.get(e),s=Gp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Kp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ry(e,t,s){const n=e.cloneNode(),a=e[Ma];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=Up(n);return i.removeChild(n),l}const Pn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ve(t)?s=>Ta(t,s):t};function Iy(e){e.target.composing=!0}function Pd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Cs=Symbol("_assign");function Fd(e,t,s){return t&&(e=e.trim()),s&&(e=Xl(e)),e}const Ml={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Cs]=Pn(a);const i=n||a.props&&a.props.type==="number";cn(e,t?"change":"input",l=>{l.target.composing||e[Cs](Fd(e.value,s,i))}),(s||i)&&cn(e,"change",()=>{e.value=Fd(e.value,s,i)}),t||(cn(e,"compositionstart",Iy),cn(e,"compositionend",Pd),cn(e,"change",Pd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Cs]=Pn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Xl(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},rc={deep:!0,created(e,t,s){e[Cs]=Pn(s),cn(e,"change",()=>{const n=e._modelValue,a=Pa(e),i=e.checked,l=e[Cs];if(ve(n)){const r=tr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(aa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Zp(e,i))})},mounted:$d,beforeUpdate(e,t,s){e[Cs]=Pn(s),$d(e,t,s)}};function $d(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ve(t))a=tr(t,n.props.value)>-1;else if(aa(t))a=t.has(n.props.value);else{if(t===s)return;a=mn(t,Zp(e,!0))}e.checked!==a&&(e.checked=a)}const oc={created(e,{value:t},s){e.checked=mn(t,s.props.value),e[Cs]=Pn(s),cn(e,"change",()=>{e[Cs](Pa(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Cs]=Pn(n),t!==s&&(e.checked=mn(t,n.props.value))}},Wp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=aa(t);cn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Xl(Pa(l)):Pa(l));e[Cs](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ot(()=>{e._assigning=!1})}),e[Cs]=Pn(n)},mounted(e,{value:t}){Ud(e,t)},beforeUpdate(e,t,s){e[Cs]=Pn(s)},updated(e,{value:t}){e._assigning||Ud(e,t)}};function Ud(e,t){const s=e.multiple,n=ve(t);if(!(s&&!n&&!aa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Pa(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=tr(t,r)>-1}else l.selected=t.has(r);else if(mn(Pa(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Pa(e){return"_value"in e?e._value:e.value}function Zp(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Jp={created(e,t,s){ll(e,t,s,null,"created")},mounted(e,t,s){ll(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){ll(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){ll(e,t,s,n,"updated")}};function Yp(e,t){switch(e){case"SELECT":return Wp;case"TEXTAREA":return Ml;default:switch(t){case"checkbox":return rc;case"radio":return oc;default:return Ml}}}function ll(e,t,s,n,a){const l=Yp(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Oy(){Ml.getSSRProps=({value:e})=>({value:e}),oc.getSSRProps=({value:e},t)=>{if(t.props&&mn(t.props.value,e))return{checked:!0}},rc.getSSRProps=({value:e},t)=>{if(ve(e)){if(t.props&&tr(e,t.props.value)>-1)return{checked:!0}}else if(aa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Jp.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Yp(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Ly=["ctrl","shift","alt","meta"],Ny={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Ly.some(s=>e[`${s}Key`]&&!t.includes(s))},Dy=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Ny[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},My={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},Py=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=rs(a.key);if(t.some(l=>l===i||My[l]===i))return e(a)}))},Qp=qe({patchProp:Vp},Mp);let hi,Bd=!1;function Xp(){return hi||(hi=fp(Qp))}function eh(){return hi=Bd?hi:pp(Qp),Bd=!0,hi}const th=((...e)=>{Xp().render(...e)}),Fy=((...e)=>{eh().hydrate(...e)}),Pl=((...e)=>{const t=Xp().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ah(n);if(!a)return;const i=t._component;!Ae(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,nh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),sh=((...e)=>{const t=eh().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ah(n);if(a)return s(a,!0,nh(a))},t});function nh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function ah(e){return Me(e)?document.querySelector(e):e}let Hd=!1;const $y=()=>{Hd||(Hd=!0,Oy(),iy())},Uy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:jf,BaseTransitionPropsValidators:Ko,Comment:xt,DeprecationTypes:Yb,EffectScope:Fo,ErrorCodes:ev,ErrorTypeStrings:zb,Fragment:Mt,KeepAlive:Nv,ReactiveEffect:xi,Static:Jn,Suspense:Tb,Teleport:gv,Text:Dn,TrackOpTypes:Km,Transition:ty,TransitionGroup:Ty,TriggerOpTypes:Wm,VueElement:pr,assertNumber:Xm,callWithAsyncErrorHandling:vs,callWithErrorHandling:qa,camelize:it,capitalize:ia,cloneVNode:Ws,compatUtils:Jb,computed:ee,createApp:Pl,createBlock:Rl,createCommentVNode:Sp,createElementBlock:Ob,createElementVNode:nc,createHydrationRenderer:pp,createPropsRestProxy:tb,createRenderer:fp,createSSRApp:sh,createSlots:Bv,createStaticVNode:Db,createTextVNode:ac,createVNode:ft,customRef:Ef,defineAsyncComponent:Ov,defineComponent:Vi,defineCustomElement:jp,defineEmits:qv,defineExpose:Gv,defineModel:Zv,defineOptions:Kv,defineProps:zv,defineSSRCustomElement:yy,defineSlots:Wv,devtools:qb,effect:mm,effectScope:pm,getCurrentInstance:Xt,getCurrentScope:cf,getCurrentWatcher:Zm,getTransitionRawChildren:rr,guardReactiveProps:kp,h:Da,handleError:la,hasInjectionContext:ov,hydrate:Fy,hydrateOnIdle:Tv,hydrateOnInteraction:Rv,hydrateOnMediaQuery:Av,hydrateOnVisible:Ev,initCustomFormatter:Hb,initDirectivesForSSR:$y,inject:Ts,isMemoSame:Lp,isProxy:Bi,isReactive:pn,isReadonly:Ks,isRef:Tt,isRuntimeOnly:$b,isShallow:cs,isVNode:xn,markRaw:Tf,mergeDefaults:Xv,mergeModels:eb,mergeProps:Tp,nextTick:Ot,nodeOps:Mp,normalizeClass:Ui,normalizeProps:em,normalizeStyle:$i,onActivated:As,onBeforeMount:Gf,onBeforeUnmount:dr,onBeforeUpdate:Zo,onDeactivated:Rs,onErrorCaptured:Jf,onMounted:Je,onRenderTracked:Zf,onRenderTriggered:Wf,onScopeDispose:hm,onServerPrefetch:Kf,onUnmounted:_t,onUpdated:cr,onWatcherCleanup:Rf,openBlock:Ai,patchProp:Vp,popScopeId:iv,provide:ui,proxyRefs:jo,pushScopeId:av,queuePostFlushCb:ki,reactive:Fn,readonly:_l,ref:h,registerRuntimeCompiler:Rp,render:th,renderList:Uv,renderSlot:Hv,resolveComponent:Pv,resolveDirective:$v,resolveDynamicComponent:Fv,resolveFilter:Zb,resolveTransitionHooks:Na,setBlockTracking:Ri,setDevtoolsHook:Gb,setTransitionHooks:yn,shallowReactive:Ho,shallowReadonly:Mm,shallowRef:Vo,ssrContextKey:Mf,ssrUtils:Wb,stop:vm,toDisplayString:rf,toHandlerKey:Sa,toHandlers:Vv,toRaw:Ze,toRef:zm,toRefs:Hm,toValue:$m,transformVNodeArgs:Lb,triggerRef:Fm,unref:Gs,useAttrs:Qv,useCssModule:wy,useCssVars:ly,useHost:zp,useId:vv,useModel:db,useSSRContext:Pf,useShadowRoot:_y,useSlots:Yv,useTemplateRef:bv,useTransitionState:Go,vModelCheckbox:rc,vModelDynamic:Jp,vModelRadio:oc,vModelSelect:Wp,vModelText:Ml,vShow:Bp,version:Np,warn:jb,watch:ds,watchEffect:cv,watchPostEffect:dv,watchSyncEffect:Ff,withAsyncContext:sb,withCtx:qo,withDefaults:Jv,withDirectives:rv,withKeys:Py,withMemo:Vb,withModifiers:Dy,withScopeId:lv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Oi=Symbol(""),gi=Symbol(""),cc=Symbol(""),Fl=Symbol(""),ih=Symbol(""),ta=Symbol(""),lh=Symbol(""),rh=Symbol(""),dc=Symbol(""),uc=Symbol(""),qi=Symbol(""),fc=Symbol(""),oh=Symbol(""),pc=Symbol(""),hc=Symbol(""),gc=Symbol(""),mc=Symbol(""),vc=Symbol(""),bc=Symbol(""),ch=Symbol(""),dh=Symbol(""),hr=Symbol(""),$l=Symbol(""),yc=Symbol(""),xc=Symbol(""),Li=Symbol(""),Gi=Symbol(""),_c=Symbol(""),vo=Symbol(""),By=Symbol(""),bo=Symbol(""),Ul=Symbol(""),Hy=Symbol(""),Vy=Symbol(""),wc=Symbol(""),jy=Symbol(""),zy=Symbol(""),kc=Symbol(""),uh=Symbol(""),Fa={[Oi]:"Fragment",[gi]:"Teleport",[cc]:"Suspense",[Fl]:"KeepAlive",[ih]:"BaseTransition",[ta]:"openBlock",[lh]:"createBlock",[rh]:"createElementBlock",[dc]:"createVNode",[uc]:"createElementVNode",[qi]:"createCommentVNode",[fc]:"createTextVNode",[oh]:"createStaticVNode",[pc]:"resolveComponent",[hc]:"resolveDynamicComponent",[gc]:"resolveDirective",[mc]:"resolveFilter",[vc]:"withDirectives",[bc]:"renderList",[ch]:"renderSlot",[dh]:"createSlots",[hr]:"toDisplayString",[$l]:"mergeProps",[yc]:"normalizeClass",[xc]:"normalizeStyle",[Li]:"normalizeProps",[Gi]:"guardReactiveProps",[_c]:"toHandlers",[vo]:"camelize",[By]:"capitalize",[bo]:"toHandlerKey",[Ul]:"setBlockTracking",[Hy]:"pushScopeId",[Vy]:"popScopeId",[wc]:"withCtx",[jy]:"unref",[zy]:"isRef",[kc]:"withMemo",[uh]:"isMemoSame"};function qy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Fa[t]=e[t]})}const xs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Gy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:xs}}function Ni(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=xs){return e&&(r?(e.helper(ta),e.helper(Ba(e.inSSR,c))):e.helper(Ua(e.inSSR,c)),l&&e.helper(vc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function Yn(e,t=xs){return{type:17,loc:t,elements:e}}function Ss(e,t=xs){return{type:15,loc:t,properties:e}}function St(e,t){return{type:16,loc:xs,key:Me(e)?Ue(e,!0):e,value:t}}function Ue(e,t=!1,s=xs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ns(e,t=xs){return{type:8,loc:t,children:e}}function Lt(e,t=[],s=xs){return{type:14,loc:s,callee:e,arguments:t}}function $a(e,t=void 0,s=!1,n=!1,a=xs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function yo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:xs}}function Ky(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:xs}}function Wy(e){return{type:21,body:e,loc:xs}}function Ua(e,t){return e||t?dc:uc}function Ba(e,t){return e||t?lh:rh}function Sc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(Ua(n,e.isComponent)),t(ta),t(Ba(n,e.isComponent)))}const Vd=new Uint8Array([123,123]),jd=new Uint8Array([125,125]);function zd(e){return e>=97&&e<=122||e>=65&&e<=90}function gs(e){return e===32||e===10||e===9||e===12||e===13}function Tn(e){return e===47||e===62||gs(e)}function Bl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ht={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Zy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Vd,this.delimiterClose=jd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Vd,this.delimiterClose=jd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Tn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||gs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ht.TitleEnd||this.currentSequence===Ht.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ht.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ht.Cdata.length&&(this.state=28,this.currentSequence=Ht.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ht.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):zd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Tn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Tn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Bl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){gs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=zd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||gs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):gs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):gs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Tn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Tn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Tn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Tn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Tn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):gs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):gs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){gs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ht.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ht.ScriptEnd[3]?this.startSpecial(Ht.ScriptEnd,4):t===Ht.StyleEnd[3]?this.startSpecial(Ht.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ht.TitleEnd[3]?this.startSpecial(Ht.TitleEnd,4):t===Ht.TextareaEnd[3]?this.startSpecial(Ht.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ht.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function qd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Qn(e,t){const s=qd("MODE",t),n=qd(e,t);return s===3?n===!0:n!==!1}function Di(e,t,s,...n){return Qn(e,t)}function Tc(e){throw e}function fh(e){}function ut(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const os=e=>e.type===4&&e.isStatic;function ph(e){switch(e){case"Teleport":case"teleport":return gi;case"Suspense":case"suspense":return cc;case"KeepAlive":case"keep-alive":return Fl;case"BaseTransition":case"base-transition":return ih}}const Jy=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Cc=e=>!Jy.test(e),hh=/[A-Za-z_$\xA0-\uFFFF]/,Yy=/[\.\?\w$\xA0-\uFFFF]/,Qy=/\s+[.[]\s*|\s*[.[]\s+/g,gh=e=>e.type===4?e.content:e.loc.source,Xy=e=>{const t=gh(e).trim().replace(Qy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?hh:Yy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},mh=Xy,ex=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,tx=e=>ex.test(gh(e)),sx=tx;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Me(t)?a.name===t:t.test(a.name)))return a}}function gr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&qn(i.arg,t))return i}}function qn(e,t){return!!(e&&os(e)&&e.content===t)}function nx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function $r(e){return e.type===5||e.type===2}function Gd(e){return e.type===7&&e.name==="pre"}function ax(e){return e.type===7&&e.name==="slot"}function Hl(e){return e.type===1&&e.tagType===3}function Vl(e){return e.type===1&&e.tagType===2}const ix=new Set([Li,Gi]);function vh(e,t=[]){if(e&&!Me(e)&&e.type===14){const s=e.callee;if(!Me(s)&&ix.has(s))return vh(e.arguments[0],t.concat(e))}return[e,t]}function jl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Me(a)&&a.type===14){const r=vh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Me(a))n=Ss([t]);else if(a.type===14){const r=a.arguments[0];!Me(r)&&r.type===15?Kd(t,r)||r.properties.unshift(t):a.callee===_c?n=Lt(s.helper($l),[Ss([t]),a]):a.arguments.unshift(Ss([t])),!n&&(n=a)}else a.type===15?(Kd(t,a)||a.properties.unshift(t),n=a):(n=Lt(s.helper($l),[Ss([t]),a]),l&&l.callee===Gi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Kd(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Mi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function lx(e){return e.type===14&&e.callee===kc?e.arguments[1].returns:e}const rx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function bh(e){for(let t=0;t<e.length;t++)if(!gs(e.charCodeAt(t)))return!1;return!0}function Ec(e){return e.type===2&&bh(e.content)||e.type===12&&Ec(e.content)}function yh(e){return e.type===3||Ec(e)}const xh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:xa,isPreTag:xa,isIgnoreNewlineTag:xa,isCustomElement:xa,onError:Tc,onWarn:fh,comments:!1,prefixIdentifiers:!1};let Qe=xh,Pi=null,gn="",jt=null,Ke=null,ns="",sn=-1,jn=-1,Ac=0,Ln=!1,xo=null;const dt=[],vt=new Zy(dt,{onerr:Xs,ontext(e,t){rl(Ft(e,t),e,t)},ontextentity(e,t,s){rl(e,t,s)},oninterpolation(e,t){if(Ln)return rl(Ft(e,t),e,t);let s=e+vt.delimiterOpen.length,n=t-vt.delimiterClose.length;for(;gs(gn.charCodeAt(s));)s++;for(;gs(gn.charCodeAt(n-1));)n--;let a=Ft(s,n);a.includes("&")&&(a=Qe.decodeEntities(a,!1)),_o({type:5,content:gl(a,!1,yt(s,n)),loc:yt(e,t)})},onopentagname(e,t){const s=Ft(e,t);jt={type:1,tag:s,ns:Qe.getNamespace(s,dt[0],Qe.ns),tagType:0,props:[],children:[],loc:yt(e-1,t),codegenNode:void 0}},onopentagend(e){Zd(e)},onclosetag(e,t){const s=Ft(e,t);if(!Qe.isVoidTag(s)){let n=!1;for(let a=0;a<dt.length;a++)if(dt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Xs(24,dt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=dt.shift();hl(r,t,l<a)}break}n||Xs(23,_h(e,60))}},onselfclosingtag(e){const t=jt.tag;jt.isSelfClosing=!0,Zd(e),dt[0]&&dt[0].tag===t&&hl(dt.shift(),e)},onattribname(e,t){Ke={type:6,name:Ft(e,t),nameLoc:yt(e,t),value:void 0,loc:yt(e)}},ondirname(e,t){const s=Ft(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ln&&n===""&&Xs(26,e),Ln||n==="")Ke={type:6,name:s,nameLoc:yt(e,t),value:void 0,loc:yt(e)};else if(Ke={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ue("prop")]:[],loc:yt(e)},n==="pre"){Ln=vt.inVPre=!0,xo=jt;const a=jt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=vx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Ft(e,t);if(Ln&&!Gd(Ke))Ke.name+=s,Gn(Ke.nameLoc,t);else{const n=s[0]!=="[";Ke.arg=gl(n?s:s.slice(1,-1),n,yt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Ft(e,t);if(Ln&&!Gd(Ke))Ke.name+="."+s,Gn(Ke.nameLoc,t);else if(Ke.name==="slot"){const n=Ke.arg;n&&(n.content+="."+s,Gn(n.loc,t))}else{const n=Ue(s,!0,yt(e,t));Ke.modifiers.push(n)}},onattribdata(e,t){ns+=Ft(e,t),sn<0&&(sn=e),jn=t},onattribentity(e,t,s){ns+=e,sn<0&&(sn=t),jn=s},onattribnameend(e){const t=Ke.loc.start.offset,s=Ft(t,e);Ke.type===7&&(Ke.rawName=s),jt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Xs(2,t)},onattribend(e,t){if(jt&&Ke){if(Gn(Ke.loc,t),e!==0)if(ns.includes("&")&&(ns=Qe.decodeEntities(ns,!0)),Ke.type===6)Ke.name==="class"&&(ns=kh(ns).trim()),e===1&&!ns&&Xs(13,t),Ke.value={type:2,content:ns,loc:e===1?yt(sn,jn):yt(sn-1,jn+1)},vt.inSFCRoot&&jt.tag==="template"&&Ke.name==="lang"&&ns&&ns!=="html"&&vt.enterRCDATA(Bl("</template"),0);else{let s=0;Ke.exp=gl(ns,!1,yt(sn,jn),0,s),Ke.name==="for"&&(Ke.forParseResult=cx(Ke.exp));let n=-1;Ke.name==="bind"&&(n=Ke.modifiers.findIndex(a=>a.content==="sync"))>-1&&Di("COMPILER_V_BIND_SYNC",Qe,Ke.loc,Ke.arg.loc.source)&&(Ke.name="model",Ke.modifiers.splice(n,1))}(Ke.type!==7||Ke.name!=="pre")&&jt.props.push(Ke)}ns="",sn=jn=-1},oncomment(e,t){Qe.comments&&_o({type:3,content:Ft(e,t),loc:yt(e-4,t+3)})},onend(){const e=gn.length;for(let t=0;t<dt.length;t++)hl(dt[t],e-1),Xs(24,dt[t].loc.start.offset)},oncdata(e,t){(dt[0]?dt[0].ns:Qe.ns)!==0?rl(Ft(e,t),e,t):Xs(1,e-9)},onprocessinginstruction(e){(dt[0]?dt[0].ns:Qe.ns)===0&&Xs(21,e-1)}}),Wd=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,ox=/^\(|\)$/g;function cx(e){const t=e.loc,s=e.content,n=s.match(rx);if(!n)return;const[,a,i]=n,l=(u,f,p=!1)=>{const g=t.start.offset+f,y=g+u.length;return gl(u,!1,yt(g,y),0,p?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(ox,"").trim();const c=a.indexOf(o),d=o.match(Wd);if(d){o=o.replace(Wd,"").trim();const u=d[1].trim();let f;if(u&&(f=s.indexOf(u,c+o.length),r.key=l(u,f,!0)),d[2]){const p=d[2].trim();p&&(r.index=l(p,s.indexOf(p,r.key?f+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Ft(e,t){return gn.slice(e,t)}function Zd(e){vt.inSFCRoot&&(jt.innerLoc=yt(e+1,e+1)),_o(jt);const{tag:t,ns:s}=jt;s===0&&Qe.isPreTag(t)&&Ac++,Qe.isVoidTag(t)?hl(jt,e):(dt.unshift(jt),(s===1||s===2)&&(vt.inXML=!0)),jt=null}function rl(e,t,s){{const i=dt[0]&&dt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Qe.decodeEntities(e,!1))}const n=dt[0]||Pi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Gn(a.loc,s)):n.children.push({type:2,content:e,loc:yt(t,s)})}function hl(e,t,s=!1){s?Gn(e.loc,_h(t,60)):Gn(e.loc,dx(t,62)+1),vt.inSFCRoot&&(e.children.length?e.innerLoc.end=qe({},e.children[e.children.length-1].loc.end):e.innerLoc.end=qe({},e.innerLoc.start),e.innerLoc.source=Ft(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Ln||(n==="slot"?e.tagType=2:Jd(e)?e.tagType=3:fx(e)&&(e.tagType=1)),vt.inRCDATA||(e.children=wh(i)),a===0&&Qe.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Qe.isPreTag(n)&&Ac--,xo===e&&(Ln=vt.inVPre=!1,xo=null),vt.inXML&&(dt[0]?dt[0].ns:Qe.ns)===0&&(vt.inXML=!1);{const l=e.props;if(!vt.inSFCRoot&&Qn("COMPILER_NATIVE_TEMPLATE",Qe)&&e.tag==="template"&&!Jd(e)){const o=dt[0]||Pi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Di("COMPILER_INLINE_TEMPLATE",Qe,r.loc)&&e.children.length&&(r.value={type:2,content:Ft(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function dx(e,t){let s=e;for(;gn.charCodeAt(s)!==t&&s<gn.length-1;)s++;return s}function _h(e,t){let s=e;for(;gn.charCodeAt(s)!==t&&s>=0;)s--;return s}const ux=new Set(["if","else","else-if","for","slot"]);function Jd({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&ux.has(t[s].name))return!0}return!1}function fx({tag:e,props:t}){if(Qe.isCustomElement(e))return!1;if(e==="component"||px(e.charCodeAt(0))||ph(e)||Qe.isBuiltInComponent&&Qe.isBuiltInComponent(e)||Qe.isNativeTag&&!Qe.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Di("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}}else if(n.name==="bind"&&qn(n.arg,"is")&&Di("COMPILER_IS_ON_ELEMENT",Qe,n.loc))return!0}return!1}function px(e){return e>64&&e<91}const hx=/\r\n/g;function wh(e){const t=Qe.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Ac)a.content=a.content.replace(hx,`
`);else if(bh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&gx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=kh(a.content))}return s?e.filter(Boolean):e}function gx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function kh(e){let t="",s=!1;for(let n=0;n<e.length;n++)gs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function _o(e){(dt[0]||Pi).children.push(e)}function yt(e,t){return{start:vt.getPos(e),end:t==null?t:vt.getPos(t),source:t==null?t:Ft(e,t)}}function mx(e){return yt(e.start.offset,e.end.offset)}function Gn(e,t){e.end=vt.getPos(t),e.source=Ft(e.start.offset,t)}function vx(e){const t={type:6,name:e.rawName,nameLoc:yt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function gl(e,t=!1,s,n=0,a=0){return Ue(e,t,s,n)}function Xs(e,t,s){Qe.onError(ut(e,yt(t,t)))}function bx(){vt.reset(),jt=null,Ke=null,ns="",sn=-1,jn=-1,dt.length=0}function yx(e,t){if(bx(),gn=e,Qe=qe({},xh),t){let a;for(a in t)t[a]!=null&&(Qe[a]=t[a])}vt.mode=Qe.parseMode==="html"?1:Qe.parseMode==="sfc"?2:0,vt.inXML=Qe.ns===1||Qe.ns===2;const s=t&&t.delimiters;s&&(vt.delimiterOpen=Bl(s[0]),vt.delimiterClose=Bl(s[1]));const n=Pi=Gy([],e);return vt.parse(gn),n.loc=yt(0,e.length),n.children=wh(n.children),Pi=null,n}function xx(e,t){ml(e,void 0,t,!!Sh(e))}function Sh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Vl(t[0])?t[0]:null}function ml(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const f=n?0:ms(u,s);if(f>0){if(f>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const p=u.codegenNode;if(p.type===13){const g=p.patchFlag;if((g===void 0||g===512||g===1)&&Ch(u,s)>=2){const y=Eh(u);y&&(p.props=s.hoist(y))}p.dynamicProps&&(p.dynamicProps=s.hoist(p.dynamicProps))}}}else if(u.type===12&&(n?0:ms(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const f=u.tagType===1;f&&s.scopes.vSlot++,ml(u,e,s,!1,a),f&&s.scopes.vSlot--}else if(u.type===11)ml(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let f=0;f<u.branches.length;f++)ml(u.branches[f],e,s,u.branches[f].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ve(e.codegenNode.children))e.codegenNode.children=o(Yn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ve(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(Yn(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ve(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(Yn(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!ve(d.children)&&d.children.type===15){const f=d.children.properties.find(p=>p.key===u||p.key.content===u);return f&&f.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function ms(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Ch(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=ms(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=ms(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ta),t.removeHelper(Ba(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(Ua(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return ms(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Me(r)||Kt(r))continue;const o=ms(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const _x=new Set([yc,xc,Li,Gi]);function Th(e,t){if(e.type===14&&!Me(e.callee)&&_x.has(e.callee)){const s=e.arguments[0];if(s.type===4)return ms(s,t);if(s.type===14)return Th(s,t)}return 0}function Ch(e,t){let s=3;const n=Eh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=ms(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=ms(r,t):r.type===14?c=Th(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Eh(e){const t=e.codegenNode;if(t.type===13)return t.props}function wx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Bt,isCustomElement:d=Bt,expressionPlugins:u=[],scopeId:f=null,slotted:p=!0,ssr:g=!1,inSSR:y=!1,ssrCssVars:S="",bindingMetadata:R=Ge,inline:v=!1,isTS:m=!1,onError:x=Tc,onWarn:w=fh,compatConfig:_}){const A=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),T={filename:t,selfName:A&&ia(it(A[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:f,slotted:p,ssr:g,inSSR:y,ssrCssVars:S,bindingMetadata:R,inline:v,isTS:m,onError:x,onWarn:w,compatConfig:_,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const L=T.helpers.get(C)||0;return T.helpers.set(C,L+1),C},removeHelper(C){const L=T.helpers.get(C);if(L){const H=L-1;H?T.helpers.set(C,H):T.helpers.delete(C)}},helperString(C){return`_${Fa[T.helper(C)]}`},replaceNode(C){T.parent.children[T.childIndex]=T.currentNode=C},removeNode(C){const L=T.parent.children,H=C?L.indexOf(C):T.currentNode?T.childIndex:-1;!C||C===T.currentNode?(T.currentNode=null,T.onNodeRemoved()):T.childIndex>H&&(T.childIndex--,T.onNodeRemoved()),T.parent.children.splice(H,1)},onNodeRemoved:Bt,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){Me(C)&&(C=Ue(C)),T.hoists.push(C);const L=Ue(`_hoisted_${T.hoists.length}`,!1,C.loc,2);return L.hoisted=C,L},cache(C,L=!1,H=!1){const M=Ky(T.cached.length,C,L,H);return T.cached.push(M),M}};return T.filters=new Set,T}function kx(e,t){const s=wx(e,t);mr(e,s),t.hoistStatic&&xx(e,s),t.ssr||Sx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Sx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Sh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Sc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ni(t,s(Oi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Tx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Me(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,mr(a,t))}}function mr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ve(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(qi);break;case 5:t.ssr||t.helper(hr);break;case 9:for(let i=0;i<e.branches.length;i++)mr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Tx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Ah(e,t){const s=Me(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(ax))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const vr="/*@__PURE__*/",Rh=e=>`${Fa[e]}: _${Fa[e]}`;function Cx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:f=!1}){const p={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:f,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(y){return`_${Fa[y]}`},push(y,S=-2,R){p.code+=y},indent(){g(++p.indentLevel)},deindent(y=!1){y?--p.indentLevel:g(--p.indentLevel)},newline(){g(p.indentLevel)}};function g(y){p.push(`
`+"  ".repeat(y),0)}return p}function Ex(e,t={}){const s=Cx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),f=u.length>0,p=!i&&n!=="module";Ax(e,s);const y=d?"ssrRender":"render",R=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${y}(${R}) {`),l(),p&&(a("with (_ctx) {"),l(),f&&(a(`const { ${u.map(Rh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Ur(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Ur(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Ur(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let v=0;v<e.temps;v++)a(`${v>0?", ":""}_temp${v}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?Gt(e.codegenNode,s):a("null"),p&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Ax(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[dc,uc,qi,fc,oh].filter(f=>d.includes(f)).map(Rh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Rx(e.hoists,t),i(),a("return ")}function Ur(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?mc:t==="component"?pc:gc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Mi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Rx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),Gt(i,t),n())}t.pure=!1}function Rc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ki(e,t,s),s&&t.deindent(),t.push("]")}function Ki(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Me(r)?a(r,-3):ve(r)?Rc(r,t):Gt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function Gt(e,t){if(Me(e)){t.push(e,-3);return}if(Kt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:Gt(e.codegenNode,t);break;case 2:Ix(e,t);break;case 4:Ih(e,t);break;case 5:Ox(e,t);break;case 12:Gt(e.codegenNode,t);break;case 8:Oh(e,t);break;case 3:Nx(e,t);break;case 13:Dx(e,t);break;case 14:Px(e,t);break;case 15:Fx(e,t);break;case 17:$x(e,t);break;case 18:Ux(e,t);break;case 19:Bx(e,t);break;case 20:Hx(e,t);break;case 21:Ki(e.body,t,!0,!1);break}}function Ix(e,t){t.push(JSON.stringify(e.content),-3,e)}function Ih(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Ox(e,t){const{push:s,helper:n,pure:a}=t;a&&s(vr),s(`${n(hr)}(`),Gt(e.content,t),s(")")}function Oh(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Me(n)?t.push(n,-3):Gt(n,t)}}function Lx(e,t){const{push:s}=t;if(e.type===8)s("["),Oh(e,t),s("]");else if(e.isStatic){const n=Cc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Nx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(vr),s(`${n(qi)}(${JSON.stringify(e.content)})`,-3,e)}function Dx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:f,isComponent:p}=e;let g;o&&(g=String(o)),d&&s(n(vc)+"("),u&&s(`(${n(ta)}(${f?"true":""}), `),a&&s(vr);const y=u?Ba(t.inSSR,p):Ua(t.inSSR,p);s(n(y)+"(",-2,e),Ki(Mx([i,l,r,g,c]),t),s(")"),u&&s(")"),d&&(s(", "),Gt(d,t),s(")"))}function Mx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Px(e,t){const{push:s,helper:n,pure:a}=t,i=Me(e.callee)?e.callee:n(e.callee);a&&s(vr),s(i+"(",-2,e),Ki(e.arguments,t),s(")")}function Fx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Lx(c,t),s(": "),Gt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function $x(e,t){Rc(e.elements,t)}function Ux(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Fa[wc]}(`),s("(",-2,e),ve(i)?Ki(i,t):i&&Gt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ve(l)?Rc(l,t):Gt(l,t)):r&&Gt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Bx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Cc(s.content);u&&l("("),Ih(s,t),u&&l(")")}else l("("),Gt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),Gt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,Gt(a,t),d||t.indentLevel--,i&&o(!0)}function Hx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Ul)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),Gt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Ul)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Vx=Ah(/^(?:if|else|else-if)$/,(e,t,s)=>jx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Qd(a,o,s);else{const c=zx(n.codegenNode);c.alternate=Qd(a,o+n.branches.length-1,s)}}}));function jx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ut(28,t.loc)),t.exp=Ue("true",!1,a)}if(t.name==="if"){const a=Yd(e,t),i={type:9,loc:mx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&yh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ut(30,e.loc)),s.removeNode();const r=Yd(e,t);l.branches.push(r);const o=n&&n(l,r,!1);mr(r,s),o&&o(),s.currentNode=null}else s.onError(ut(30,e.loc));break}}}function Yd(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:gr(e,"key"),isTemplateIf:s}}function Qd(e,t,s){return e.condition?yo(e.condition,Xd(e,t,s),Lt(s.helper(qi),['""',"true"])):Xd(e,t,s)}function Xd(e,t,s){const{helper:n}=s,a=St("key",Ue(`${t}`,!1,xs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return jl(o,a,s),o}else return Ni(s,n(Oi),Ss([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=lx(o);return c.type===13&&Sc(c,s),jl(c,a,s),o}}function zx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const qx=Ah("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Gx(e,t,s,i=>{const l=Lt(n(bc),[i.source]),r=Hl(e),o=ks(e,"memo"),c=gr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ue(c.value.content,!0):void 0:c.exp);const u=d?St("key",d):null,f=i.source.type===4&&i.source.constType>0,p=f?64:c?128:256;return i.codegenNode=Ni(s,n(Oi),void 0,l,p,void 0,void 0,!0,!f,!1,e.loc),()=>{let g;const{children:y}=i,S=y.length!==1||y[0].type!==1,R=Vl(e)?e:r&&e.children.length===1&&Vl(e.children[0])?e.children[0]:null;if(R?(g=R.codegenNode,r&&u&&jl(g,u,s)):S?g=Ni(s,n(Oi),u?Ss([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(g=y[0].codegenNode,r&&u&&jl(g,u,s),g.isBlock!==!f&&(g.isBlock?(a(ta),a(Ba(s.inSSR,g.isComponent))):a(Ua(s.inSSR,g.isComponent))),g.isBlock=!f,g.isBlock?(n(ta),n(Ba(s.inSSR,g.isComponent))):n(Ua(s.inSSR,g.isComponent))),o){const v=$a(wo(i.parseResult,[Ue("_cached")]));v.body=Wy([Ns(["const _memo = (",o.exp,")"]),Ns(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(uh)}(_cached, _memo)) return _cached`]),Ns(["const _item = ",g]),Ue("_item.memo = _memo"),Ue("return _item")]),l.arguments.push(v,Ue("_cache"),Ue(String(s.cached.length))),s.cached.push(null)}else l.arguments.push($a(wo(i.parseResult),g,!0))}})});function Gx(e,t,s,n){if(!t.exp){s.onError(ut(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ut(32,t.loc));return}Lh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,f={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Hl(e)?e.children:[e]};s.replaceNode(f),r.vFor++;const p=n&&n(f);return()=>{r.vFor--,p&&p()}}function Lh(e,t){e.finalized||(e.finalized=!0)}function wo({value:e,key:t,index:s},n=[]){return Kx([e,t,s,...n])}function Kx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ue("_".repeat(n+1),!1))}const eu=Ue("undefined",!1),Wx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Zx=(e,t,s,n)=>$a(e,s,!1,!0,s.length?s[0].loc:n);function Jx(e,t,s=Zx){t.helper(wc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:S,exp:R}=o;S&&!os(S)&&(r=!0),i.push(St(S||Ue("default",!0),s(R,void 0,n,a)))}let c=!1,d=!1;const u=[],f=new Set;let p=0;for(let S=0;S<n.length;S++){const R=n[S];let v;if(!Hl(R)||!(v=ks(R,"slot",!0))){R.type!==3&&u.push(R);continue}if(o){t.onError(ut(37,v.loc));break}c=!0;const{children:m,loc:x}=R,{arg:w=Ue("default",!0),exp:_,loc:A}=v;let T;os(w)?T=w?w.content:"default":r=!0;const C=ks(R,"for"),L=s(_,C,m,x);let H,M;if(H=ks(R,"if"))r=!0,l.push(yo(H.exp,ol(w,L,p++),eu));else if(M=ks(R,/^else(?:-if)?$/,!0)){let D=S,K;for(;D--&&(K=n[D],!!yh(K)););if(K&&Hl(K)&&ks(K,/^(?:else-)?if$/)){let ne=l[l.length-1];for(;ne.alternate.type===19;)ne=ne.alternate;ne.alternate=M.exp?yo(M.exp,ol(w,L,p++),eu):ol(w,L,p++)}else t.onError(ut(30,M.loc))}else if(C){r=!0;const D=C.forParseResult;D?(Lh(D),l.push(Lt(t.helper(bc),[D.source,$a(wo(D),ol(w,L),!0)]))):t.onError(ut(32,C.loc))}else{if(T){if(f.has(T)){t.onError(ut(38,A));continue}f.add(T),T==="default"&&(d=!0)}i.push(St(w,L))}}if(!o){const S=(R,v)=>{const m=s(R,void 0,v,a);return t.compatConfig&&(m.isNonScopedSlot=!0),St("default",m)};c?u.length&&!u.every(Ec)&&(d?t.onError(ut(39,u[0].loc)):i.push(S(void 0,u))):i.push(S(void 0,n))}const g=r?2:vl(e.children)?3:1;let y=Ss(i.concat(St("_",Ue(g+"",!1))),a);return l.length&&(y=Lt(t.helper(dh),[y,Yn(l)])),{slots:y,hasDynamicSlots:r}}function ol(e,t,s){const n=[St("name",e),St("fn",t)];return s!=null&&n.push(St("key",Ue(String(s),!0))),Ss(n)}function vl(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||vl(s.children))return!0;break;case 9:if(vl(s.branches))return!0;break;case 10:case 11:if(vl(s.children))return!0;break}}return!1}const Nh=new WeakMap,Yx=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?Qx(e,t):`"${n}"`;const r=Xe(l)&&l.callee===hc;let o,c,d=0,u,f,p,g=r||l===gi||l===cc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=Dh(e,t,void 0,i,r);o=y.props,d=y.patchFlag,f=y.dynamicPropNames;const S=y.directives;p=S&&S.length?Yn(S.map(R=>e0(R,t))):void 0,y.shouldUseBlock&&(g=!0)}if(e.children.length>0)if(l===Fl&&(g=!0,d|=1024),i&&l!==gi&&l!==Fl){const{slots:S,hasDynamicSlots:R}=Jx(e,t);c=S,R&&(d|=1024)}else if(e.children.length===1&&l!==gi){const S=e.children[0],R=S.type,v=R===5||R===8;v&&ms(S,t)===0&&(d|=1),v||R===2?c=S:c=e.children}else c=e.children;f&&f.length&&(u=t0(f)),e.codegenNode=Ni(t,l,o,c,d===0?void 0:d,u,p,!!g,!1,i,e.loc)};function Qx(e,t,s=!1){let{tag:n}=e;const a=ko(n),i=gr(e,"is",!1,!0);if(i)if(a||Qn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ue(i.value.content,!0):(r=i.exp,r||(r=Ue("is",!1,i.arg.loc))),r)return Lt(t.helper(hc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=ph(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(pc),t.components.add(n),Mi(n,"component"))}function Dh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],f=o.length>0;let p=!1,g=0,y=!1,S=!1,R=!1,v=!1,m=!1,x=!1;const w=[],_=L=>{c.length&&(d.push(Ss(tu(c),r)),c=[]),L&&d.push(L)},A=()=>{t.scopes.vFor>0&&c.push(St(Ue("ref_for",!0),Ue("true")))},T=({key:L,value:H})=>{if(os(L)){const M=L.content,D=na(M);if(D&&(!n||a)&&M.toLowerCase()!=="onclick"&&M!=="onUpdate:modelValue"&&!fn(M)&&(v=!0),D&&fn(M)&&(x=!0),D&&H.type===14&&(H=H.arguments[0]),H.type===20||(H.type===4||H.type===8)&&ms(H,t)>0)return;M==="ref"?y=!0:M==="class"?S=!0:M==="style"?R=!0:M!=="key"&&!w.includes(M)&&w.push(M),n&&(M==="class"||M==="style")&&!w.includes(M)&&w.push(M)}else m=!0};for(let L=0;L<s.length;L++){const H=s[L];if(H.type===6){const{loc:M,name:D,nameLoc:K,value:ne}=H;let $=!0;if(D==="ref"&&(y=!0,A()),D==="is"&&(ko(l)||ne&&ne.content.startsWith("vue:")||Qn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(St(Ue(D,!0,K),Ue(ne?ne.content:"",$,ne?ne.loc:M)))}else{const{name:M,arg:D,exp:K,loc:ne,modifiers:$}=H,O=M==="bind",E=M==="on";if(M==="slot"){n||t.onError(ut(40,ne));continue}if(M==="once"||M==="memo"||M==="is"||O&&qn(D,"is")&&(ko(l)||Qn("COMPILER_IS_ON_ELEMENT",t))||E&&i)continue;if((O&&qn(D,"key")||E&&f&&qn(D,"vue:before-update"))&&(p=!0),O&&qn(D,"ref")&&A(),!D&&(O||E)){if(m=!0,K)if(O){if(_(),Qn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(K);continue}A(),_(),d.push(K)}else _({type:14,loc:ne,callee:t.helper(_c),arguments:n?[K]:[K,"true"]});else t.onError(ut(O?34:35,ne));continue}O&&$.some(B=>B.content==="prop")&&(g|=32);const N=t.directiveTransforms[M];if(N){const{props:B,needRuntime:W}=N(H,e,t);!i&&B.forEach(T),E&&D&&!os(D)?_(Ss(B,r)):c.push(...B),W&&(u.push(H),Kt(W)&&Nh.set(H,W))}else qg(M)||(u.push(H),f&&(p=!0))}}let C;if(d.length?(_(),d.length>1?C=Lt(t.helper($l),d,r):C=d[0]):c.length&&(C=Ss(tu(c),r)),m?g|=16:(S&&!n&&(g|=2),R&&!n&&(g|=4),w.length&&(g|=8),v&&(g|=32)),!p&&(g===0||g===32)&&(y||x||u.length>0)&&(g|=512),!t.inSSR&&C)switch(C.type){case 15:let L=-1,H=-1,M=!1;for(let ne=0;ne<C.properties.length;ne++){const $=C.properties[ne].key;os($)?$.content==="class"?L=ne:$.content==="style"&&(H=ne):$.isHandlerKey||(M=!0)}const D=C.properties[L],K=C.properties[H];M?C=Lt(t.helper(Li),[C]):(D&&!os(D.value)&&(D.value=Lt(t.helper(yc),[D.value])),K&&(R||K.value.type===4&&K.value.content.trim()[0]==="["||K.value.type===17)&&(K.value=Lt(t.helper(xc),[K.value])));break;case 14:break;default:C=Lt(t.helper(Li),[Lt(t.helper(Gi),[C])]);break}return{props:C,directives:u,patchFlag:g,dynamicPropNames:w,shouldUseBlock:p}}function tu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||na(i))&&Xx(l,a):(t.set(i,a),s.push(a))}return s}function Xx(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Yn([e.value,t.value],e.loc)}function e0(e,t){const s=[],n=Nh.get(e);n?s.push(t.helperString(n)):(t.helper(gc),t.directives.add(e.name),s.push(Mi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ue("true",!1,a);s.push(Ss(e.modifiers.map(l=>St(l,i)),a))}return Yn(s,e.loc)}function t0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function ko(e){return e==="component"||e==="Component"}const s0=(e,t)=>{if(Vl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=n0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=$a([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Lt(t.helper(ch),l,n)}};function n0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=it(l.name),a.push(l)));else if(l.name==="bind"&&qn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=it(l.arg.content);s=l.exp=Ue(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&os(l.arg)&&(l.arg.content=it(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Dh(e,t,a,!1,!1);n=i,l.length&&t.onError(ut(36,l[0].loc))}return{slotName:s,slotProps:n}}const Mh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ut(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const f=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Sa(it(u)):`on:${u}`;r=Ue(f,!0,l.loc)}else r=Ns([`${s.helperString(bo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(bo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=mh(o),f=!(u||sx(o)),p=o.content.includes(";");(f||c&&u)&&(o=Ns([`${f?"$event":"(...args)"} => ${p?"{":"("}`,o,p?"}":")"]))}let d={props:[St(r,o||Ue("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},a0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=it(i.content):i.content=`${s.helperString(vo)}(${i.content})`:(i.children.unshift(`${s.helperString(vo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&su(i,"."),n.some(r=>r.content==="attr")&&su(i,"^")),{props:[St(i,l)]}},su=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},i0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if($r(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if($r(o))n||(n=s[i]=Ns([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if($r(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&ms(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Lt(t.helper(fc),r)}}}}},nu=new WeakSet,l0=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return nu.has(e)||t.inVOnce||t.inSSR?void 0:(nu.add(e),t.inVOnce=!0,t.helper(Ul),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Ph=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ut(41,e.loc)),Qa();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ut(44,n.loc)),Qa();if(r==="literal-const"||r==="setup-const")return s.onError(ut(45,n.loc)),Qa();if(!l.trim()||!mh(n))return s.onError(ut(42,n.loc)),Qa();const o=a||Ue("modelValue",!0),c=a?os(a)?`onUpdate:${it(a.content)}`:Ns(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ns([`${u} => ((`,n,") = $event)"]);const f=[St(o,e.exp),St(c,d)];if(e.modifiers.length&&t.tagType===1){const p=e.modifiers.map(y=>y.content).map(y=>(Cc(y)?y:JSON.stringify(y))+": true").join(", "),g=a?os(a)?`${a.content}Modifiers`:Ns([a,' + "Modifiers"']):"modelModifiers";f.push(St(g,Ue(`{ ${p} }`,!1,e.loc,2)))}return Qa(f)};function Qa(e=[]){return{props:e}}const r0=/[\w).+\-_$\]]/,o0=(e,t)=>{Qn("COMPILER_FILTERS",t)&&(e.type===5?zl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&zl(s.exp,t)}))};function zl(e,t){if(e.type===4)au(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?au(n,t):n.type===8?zl(e,t):n.type===5&&zl(n.content,t))}}function au(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,f,p,g,y=[];for(p=0;p<s.length;p++)if(f=u,u=s.charCodeAt(p),n)u===39&&f!==92&&(n=!1);else if(a)u===34&&f!==92&&(a=!1);else if(i)u===96&&f!==92&&(i=!1);else if(l)u===47&&f!==92&&(l=!1);else if(u===124&&s.charCodeAt(p+1)!==124&&s.charCodeAt(p-1)!==124&&!r&&!o&&!c)g===void 0?(d=p+1,g=s.slice(0,p).trim()):S();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let R=p-1,v;for(;R>=0&&(v=s.charAt(R),v===" ");R--);(!v||!r0.test(v))&&(l=!0)}}g===void 0?g=s.slice(0,p).trim():d!==0&&S();function S(){y.push(s.slice(d,p).trim()),d=p+1}if(y.length){for(p=0;p<y.length;p++)g=c0(g,y[p],t);e.content=g,e.ast=void 0}}function c0(e,t,s){s.helper(mc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Mi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Mi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const iu=new WeakSet,d0=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||iu.has(e)||t.inSSR?void 0:(iu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Sc(n,t),e.codegenNode=Lt(t.helper(kc),[s.exp,$a(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},u0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ut(53,n.loc)),s.exp=Ue("",!0,n.loc);else{const a=it(n.content);(hh.test(a[0])||a[0]==="-")&&(s.exp=Ue(a,!1,n.loc))}}}};function f0(e){return[[u0,l0,Vx,d0,qx,o0,s0,Yx,Wx,i0],{on:Mh,bind:a0,model:Ph}]}function p0(e,t={}){const s=t.onError||Tc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ut(48)):n&&s(ut(49));const a=!1;t.cacheHandlers&&s(ut(50)),t.scopeId&&!n&&s(ut(51));const i=qe({},t,{prefixIdentifiers:a}),l=Me(e)?yx(e,i):e,[r,o]=f0();return kx(l,qe({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:qe({},o,t.directiveTransforms||{})})),Ex(l,i)}const h0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Fh=Symbol(""),$h=Symbol(""),Uh=Symbol(""),Bh=Symbol(""),So=Symbol(""),Hh=Symbol(""),Vh=Symbol(""),jh=Symbol(""),zh=Symbol(""),qh=Symbol("");qy({[Fh]:"vModelRadio",[$h]:"vModelCheckbox",[Uh]:"vModelText",[Bh]:"vModelSelect",[So]:"vModelDynamic",[Hh]:"withModifiers",[Vh]:"withKeys",[jh]:"vShow",[zh]:"Transition",[qh]:"TransitionGroup"});let pa;function g0(e,t=!1){return pa||(pa=document.createElement("div")),t?(pa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,pa.children[0].getAttribute("foo")):(pa.innerHTML=e,pa.textContent)}const m0={parseMode:"html",isVoidTag:om,isNativeTag:e=>im(e)||lm(e)||rm(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:g0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return zh;if(e==="TransitionGroup"||e==="transition-group")return qh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},v0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ue("style",!0,t.loc),exp:b0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},b0=(e,t)=>{const s=nf(e);return Ue(JSON.stringify(s),!1,t,3)};function Mn(e,t){return ut(e,t)}const y0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(54,a)),t.children.length&&(s.onError(Mn(55,a)),t.children.length=0),{props:[St(Ue("innerHTML",!0,a),n||Ue("",!0))]}},x0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(56,a)),t.children.length&&(s.onError(Mn(57,a)),t.children.length=0),{props:[St(Ue("textContent",!0),n?ms(n,s)>0?n:Lt(s.helperString(hr),[n],a):Ue("",!0))]}},_0=(e,t,s)=>{const n=Ph(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Mn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=Uh,r=!1;if(a==="input"||i){const o=gr(t,"type");if(o){if(o.type===7)l=So;else if(o.value)switch(o.value.content){case"radio":l=Fh;break;case"checkbox":l=$h;break;case"file":r=!0,s.onError(Mn(60,e.loc));break}}else nx(t)&&(l=So)}else a==="select"&&(l=Bh);r||(n.needRuntime=s.helper(l))}else s.onError(Mn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},w0=ys("passive,once,capture"),k0=ys("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),S0=ys("left,right"),Gh=ys("onkeyup,onkeydown,onkeypress"),T0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Di("COMPILER_V_ON_NATIVE",s)||w0(o)?l.push(o):S0(o)?os(e)?Gh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):k0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},lu=(e,t)=>os(e)&&e.content.toLowerCase()==="onclick"?Ue(t,!0):e.type!==4?Ns(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,C0=(e,t,s)=>Mh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=T0(i,a,s,e.loc);if(o.includes("right")&&(i=lu(i,"onContextmenu")),o.includes("middle")&&(i=lu(i,"onMouseup")),o.length&&(l=Lt(s.helper(Hh),[l,JSON.stringify(o)])),r.length&&(!os(i)||Gh(i.content.toLowerCase()))&&(l=Lt(s.helper(Vh),[l,JSON.stringify(r)])),c.length){const d=c.map(ia).join("");i=os(i)?Ue(`${i.content}${d}`,!0):Ns(["(",i,`) + "${d}"`])}return{props:[St(i,l)]}}),E0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Mn(62,a)),{props:[],needRuntime:s.helper(jh)}},A0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},R0=[v0],I0={cloak:h0,html:y0,text:x0,model:_0,on:C0,show:E0};function O0(e,t={}){return p0(e,qe({},m0,t,{nodeTransforms:[A0,...R0,...t.nodeTransforms||[]],directiveTransforms:qe({},I0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const ru=Object.create(null);function L0(e,t){if(!Me(e))if(e.nodeType)e=e.innerHTML;else return Bt;const s=Wg(e,t),n=ru[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=qe({hoistStatic:!0,onError:void 0,onWarn:Bt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=O0(e,a),l=new Function("Vue",i)(Uy);return l._rc=!0,ru[s]=l}Rp(L0);const ql=Fn({items:[]});let N0=1;function br(e,t="info",s=3e3){const n=N0++;return ql.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Ic(n),s),n}function Ic(e){const t=ql.items.findIndex(s=>s.id===e);t>=0&&ql.items.splice(t,1)}function Se(e,t="info",s=3e3){return br(e,t,s)}Se.success=(e,t=3e3)=>br(e,"success",t);Se.error=(e,t=5e3)=>br(e,"error",t);Se.info=(e,t=3e3)=>br(e,"info",t);Se.dismiss=Ic;const D0={setup(){return{state:ql,dismiss:Ic}},template:`
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
  `},ln=Fn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ia=null;function bs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ia&&Ia(!1),ln.title=e,ln.message=t,ln.confirmLabel=s,ln.cancelLabel=n,ln.danger=a,ln.open=!0,new Promise(i=>{Ia=i})}function ou(e){ln.open=!1,Ia&&(Ia(e),Ia=null)}const M0={setup(){function e(t){ln.open&&t.key==="Escape"&&(t.stopPropagation(),ou(!1))}return Je(()=>document.addEventListener("keydown",e,!0)),_t(()=>document.removeEventListener("keydown",e,!0)),{state:ln,settle:ou}},template:`
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
 */const ba=typeof document<"u";function Kh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function P0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Kh(e.default)}const nt=Object.assign;function Br(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ms(a)?a.map(e):e(a)}return s}const mi=()=>{},Ms=Array.isArray;function cu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Wh=/#/g,F0=/&/g,$0=/\//g,U0=/=/g,B0=/\?/g,Zh=/\+/g,H0=/%5B/g,V0=/%5D/g,Jh=/%5E/g,j0=/%60/g,Yh=/%7B/g,z0=/%7C/g,Qh=/%7D/g,q0=/%20/g;function Oc(e){return e==null?"":encodeURI(""+e).replace(z0,"|").replace(H0,"[").replace(V0,"]")}function G0(e){return Oc(e).replace(Yh,"{").replace(Qh,"}").replace(Jh,"^")}function To(e){return Oc(e).replace(Zh,"%2B").replace(q0,"+").replace(Wh,"%23").replace(F0,"%26").replace(j0,"`").replace(Yh,"{").replace(Qh,"}").replace(Jh,"^")}function K0(e){return To(e).replace(U0,"%3D")}function W0(e){return Oc(e).replace(Wh,"%23").replace(B0,"%3F")}function Z0(e){return W0(e).replace($0,"%2F")}function Fi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const J0=/\/$/,Y0=e=>e.replace(J0,"");function Hr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=t_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Fi(l)}}function Q0(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function du(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function X0(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ha(t.matched[n],s.matched[a])&&Xh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ha(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Xh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!e_(e[s],t[s]))return!1;return!0}function e_(e,t){return Ms(e)?uu(e,t):Ms(t)?uu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function uu(e,t){return Ms(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function t_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Cn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Co=(function(e){return e.pop="pop",e.push="push",e})({}),Vr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function s_(e){if(!e)if(ba){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),Y0(e)}const n_=/^[^#]+#/;function a_(e,t){return e.replace(n_,"#")+t}function i_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const yr=()=>({left:window.scrollX,top:window.scrollY});function l_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=i_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function fu(e,t){return(history.state?history.state.position-t:-1)+e}const Eo=new Map;function r_(e,t){Eo.set(e,t)}function o_(e){const t=Eo.get(e);return Eo.delete(e),t}function c_(e){return typeof e=="string"||e&&typeof e=="object"}function eg(e){return typeof e=="string"||typeof e=="symbol"}let mt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const tg=Symbol("");mt.MATCHER_NOT_FOUND+"",mt.NAVIGATION_GUARD_REDIRECT+"",mt.NAVIGATION_ABORTED+"",mt.NAVIGATION_CANCELLED+"",mt.NAVIGATION_DUPLICATED+"";function Va(e,t){return nt(new Error,{type:e,[tg]:!0},t)}function en(e,t){return e instanceof Error&&tg in e&&(t==null||!!(e.type&t))}const d_=["params","query","hash"];function u_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of d_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function f_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Zh," "),i=a.indexOf("="),l=Fi(i<0?a:a.slice(0,i)),r=i<0?null:Fi(a.slice(i+1));if(l in t){let o=t[l];Ms(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function pu(e){let t="";for(let s in e){const n=e[s];if(s=K0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ms(n)?n.map(a=>a&&To(a)):[n&&To(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function p_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ms(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const h_=Symbol(""),hu=Symbol(""),xr=Symbol(""),Lc=Symbol(""),Ao=Symbol("");function Xa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Nn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=f=>{f===!1?o(Va(mt.NAVIGATION_ABORTED,{from:s,to:t})):f instanceof Error?o(f):c_(f)?o(Va(mt.NAVIGATION_GUARD_REDIRECT,{from:t,to:f})):(l&&n.enterCallbacks[a]===l&&typeof f=="function"&&l.push(f),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(f=>o(f))})}function jr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Kh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Nn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=P0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const f=(u.__vccOpts||u)[t];return f&&Nn(f,s,n,l,r,a)()}))}}return i}function g_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ha(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ha(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let m_=()=>location.protocol+"//"+location.host;function sg(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),du(r,"")}return du(s,e)+n+a}function v_(e,t,s,n){let a=[],i=[],l=null;const r=({state:f})=>{const p=sg(e,location),g=s.value,y=t.value;let S=0;if(f){if(s.value=p,t.value=f,l&&l===g){l=null;return}S=y?f.position-y.position:0}else n(p);a.forEach(R=>{R(s.value,g,{delta:S,type:Co.pop,direction:S?S>0?Vr.forward:Vr.back:Vr.unknown})})};function o(){l=s.value}function c(f){a.push(f);const p=()=>{const g=a.indexOf(f);g>-1&&a.splice(g,1)};return i.push(p),p}function d(){if(document.visibilityState==="hidden"){const{history:f}=window;if(!f.state)return;f.replaceState(nt({},f.state,{scroll:yr()}),"")}}function u(){for(const f of i)f();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function gu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?yr():null}}function b_(e){const{history:t,location:s}=window,n={value:sg(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),f=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:m_()+e+o;try{t[d?"replaceState":"pushState"](c,"",f),a.value=c}catch(p){console.error(p),s[d?"replace":"assign"](f)}}function l(o,c){i(o,nt({},t.state,gu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=nt({},a.value,t.state,{forward:o,scroll:yr()});i(d.current,d,!0),i(o,nt({},gu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function y_(e){e=s_(e);const t=b_(e),s=v_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=nt({location:"",base:e,go:n,createHref:a_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function x_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),y_(e)}let Kn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var Rt=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(Rt||{});const __={type:Kn.Static,value:""},w_=/[a-zA-Z0-9_]/;function k_(e){if(!e)return[[]];if(e==="/")return[[__]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(p){throw new Error(`ERR (${s})/"${c}": ${p}`)}let s=Rt.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===Rt.Static?i.push({type:Kn.Static,value:c}):s===Rt.Param||s===Rt.ParamRegExp||s===Rt.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Kn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function f(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==Rt.ParamRegExp){n=s,s=Rt.EscapeNext;continue}switch(s){case Rt.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=Rt.Param):f();break;case Rt.EscapeNext:f(),s=n;break;case Rt.Param:o==="("?s=Rt.ParamRegExp:w_.test(o)?f():(u(),s=Rt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case Rt.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=Rt.ParamRegExpEnd:d+=o;break;case Rt.ParamRegExpEnd:u(),s=Rt.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===Rt.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const mu="[^/]+?",S_={sensitive:!1,strict:!1,start:!0,end:!0};var Jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Jt||{});const T_=/[.+*?^${}()[\]/\\]/g;function C_(e,t){const s=nt({},S_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Jt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const f=c[u];let p=Jt.Segment+(s.sensitive?Jt.BonusCaseSensitive:0);if(f.type===Kn.Static)u||(a+="/"),a+=f.value.replace(T_,"\\$&"),p+=Jt.Static;else if(f.type===Kn.Param){const{value:g,repeatable:y,optional:S,regexp:R}=f;i.push({name:g,repeatable:y,optional:S});const v=R||mu;if(v!==mu){p+=Jt.BonusCustomRegExp;try{`${v}`}catch(x){throw new Error(`Invalid custom RegExp for param "${g}" (${v}): `+x.message)}}let m=y?`((?:${v})(?:/(?:${v}))*)`:`(${v})`;u||(m=S&&c.length<2?`(?:/${m})`:"/"+m),S&&(m+="?"),a+=m,p+=Jt.Dynamic,S&&(p+=Jt.BonusOptional),y&&(p+=Jt.BonusRepeatable),v===".*"&&(p+=Jt.BonusWildcard)}d.push(p)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let f=1;f<d.length;f++){const p=d[f]||"",g=i[f-1];u[g.name]=p&&g.repeatable?p.split("/"):p}return u}function o(c){let d="",u=!1;for(const f of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const p of f)if(p.type===Kn.Static)d+=p.value;else if(p.type===Kn.Param){const{value:g,repeatable:y,optional:S}=p,R=g in c?c[g]:"";if(Ms(R)&&!y)throw new Error(`Provided param "${g}" is an array but it is not repeatable (* or + modifiers)`);const v=Ms(R)?R.join("/"):R;if(!v)if(S)f.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${g}"`);d+=v}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function E_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Jt.Static+Jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Jt.Static+Jt.Segment?1:-1:0}function ng(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=E_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(vu(n))return 1;if(vu(a))return-1}return a.length-n.length}function vu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const A_={strict:!1,end:!0,sensitive:!1};function R_(e,t,s){const n=C_(k_(e.path),s),a=nt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function I_(e,t){const s=[],n=new Map;t=cu(A_,t);function a(u){return n.get(u)}function i(u,f,p){const g=!p,y=yu(u);y.aliasOf=p&&p.record;const S=cu(t,u),R=[y];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const w of x)R.push(yu(nt({},y,{components:p?p.record.components:y.components,path:w,aliasOf:p?p.record:y})))}let v,m;for(const x of R){const{path:w}=x;if(f&&w[0]!=="/"){const _=f.record.path,A=_[_.length-1]==="/"?"":"/";x.path=f.record.path+(w&&A+w)}if(v=R_(x,f,S),p?p.alias.push(v):(m=m||v,m!==v&&m.alias.push(v),g&&u.name&&!xu(v)&&l(u.name)),ag(v)&&o(v),y.children){const _=y.children;for(let A=0;A<_.length;A++)i(_[A],v,p&&p.children[A])}p=p||v}return m?()=>{l(m)}:mi}function l(u){if(eg(u)){const f=n.get(u);f&&(n.delete(u),s.splice(s.indexOf(f),1),f.children.forEach(l),f.alias.forEach(l))}else{const f=s.indexOf(u);f>-1&&(s.splice(f,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const f=N_(u,s);s.splice(f,0,u),u.record.name&&!xu(u)&&n.set(u.record.name,u)}function c(u,f){let p,g={},y,S;if("name"in u&&u.name){if(p=n.get(u.name),!p)throw Va(mt.MATCHER_NOT_FOUND,{location:u});S=p.record.name,g=nt(bu(f.params,p.keys.filter(m=>!m.optional).concat(p.parent?p.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&bu(u.params,p.keys.map(m=>m.name))),y=p.stringify(g)}else if(u.path!=null)y=u.path,p=s.find(m=>m.re.test(y)),p&&(g=p.parse(y),S=p.record.name);else{if(p=f.name?n.get(f.name):s.find(m=>m.re.test(f.path)),!p)throw Va(mt.MATCHER_NOT_FOUND,{location:u,currentLocation:f});S=p.record.name,g=nt({},f.params,u.params),y=p.stringify(g)}const R=[];let v=p;for(;v;)R.unshift(v.record),v=v.parent;return{name:S,path:y,params:g,matched:R,meta:L_(R)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function bu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function yu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:O_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function O_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function xu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function L_(e){return e.reduce((t,s)=>nt(t,s.meta),{})}function N_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;ng(e,t[i])<0?n=i:s=i+1}const a=D_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function D_(e){let t=e;for(;t=t.parent;)if(ag(t)&&ng(e,t)===0)return t}function ag({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function _u(e){const t=Ts(xr),s=Ts(Lc),n=ee(()=>{const o=Gs(e.to);return t.resolve(o)}),a=ee(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const f=u.findIndex(Ha.bind(null,d));if(f>-1)return f;const p=wu(o[c-2]);return c>1&&wu(d)===p&&u[u.length-1].path!==p?u.findIndex(Ha.bind(null,o[c-2])):f}),i=ee(()=>a.value>-1&&U_(s.params,n.value.params)),l=ee(()=>a.value>-1&&a.value===s.matched.length-1&&Xh(s.params,n.value.params));function r(o={}){if($_(o)){const c=t[Gs(e.replace)?"replace":"push"](Gs(e.to)).catch(mi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:ee(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function M_(e){return e.length===1?e[0]:e}const P_=Vi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:_u,setup(e,{slots:t}){const s=Fn(_u(e)),{options:n}=Ts(xr),a=ee(()=>({[ku(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[ku(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&M_(t.default(s));return e.custom?i:Da("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),F_=P_;function $_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function U_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ms(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function wu(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ku=(e,t,s)=>e??t??s,B_=Vi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ts(Ao),a=ee(()=>e.route||n.value),i=Ts(hu,0),l=ee(()=>{let c=Gs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=ee(()=>a.value.matched[l.value]);ui(hu,ee(()=>l.value+1)),ui(h_,r),ui(Ao,a);const o=h();return ds(()=>[o.value,r.value,e.name],([c,d,u],[f,p,g])=>{d&&(d.instances[u]=c,p&&p!==d&&c&&c===f&&(d.leaveGuards.size||(d.leaveGuards=p.leaveGuards),d.updateGuards.size||(d.updateGuards=p.updateGuards))),c&&d&&(!p||!Ha(d,p)||!f)&&(d.enterCallbacks[u]||[]).forEach(y=>y(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,f=u&&u.components[d];if(!f)return Su(s.default,{Component:f,route:c});const p=u.props[d],g=p?p===!0?c.params:typeof p=="function"?p(c):p:null,S=Da(f,nt({},g,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Su(s.default,{Component:S,route:c})||S}}});function Su(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const H_=B_;function V_(e){const t=I_(e.routes,e),s=e.parseQuery||f_,n=e.stringifyQuery||pu,a=e.history,i=Xa(),l=Xa(),r=Xa(),o=Vo(Cn);let c=Cn;ba&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Br.bind(null,z=>""+z),u=Br.bind(null,Z0),f=Br.bind(null,Fi);function p(z,pe){let de,xe;return eg(z)?(de=t.getRecordMatcher(z),xe=pe):xe=z,t.addRoute(xe,de)}function g(z){const pe=t.getRecordMatcher(z);pe&&t.removeRoute(pe)}function y(){return t.getRoutes().map(z=>z.record)}function S(z){return!!t.getRecordMatcher(z)}function R(z,pe){if(pe=nt({},pe||o.value),typeof z=="string"){const I=Hr(s,z,pe.path),F=t.resolve({path:I.path},pe),X=a.createHref(I.fullPath);return nt(I,F,{params:f(F.params),hash:Fi(I.hash),redirectedFrom:void 0,href:X})}let de;if(z.path!=null)de=nt({},z,{path:Hr(s,z.path,pe.path).path});else{const I=nt({},z.params);for(const F in I)I[F]==null&&delete I[F];de=nt({},z,{params:u(I)}),pe.params=u(pe.params)}const xe=t.resolve(de,pe),me=z.hash||"";xe.params=d(f(xe.params));const Be=Q0(n,nt({},z,{hash:G0(me),path:xe.path})),b=a.createHref(Be);return nt({fullPath:Be,hash:me,query:n===pu?p_(z.query):z.query||{}},xe,{redirectedFrom:void 0,href:b})}function v(z){return typeof z=="string"?Hr(s,z,o.value.path):nt({},z)}function m(z,pe){if(c!==z)return Va(mt.NAVIGATION_CANCELLED,{from:pe,to:z})}function x(z){return A(z)}function w(z){return x(nt(v(z),{replace:!0}))}function _(z,pe){const de=z.matched[z.matched.length-1];if(de&&de.redirect){const{redirect:xe}=de;let me=typeof xe=="function"?xe(z,pe):xe;return typeof me=="string"&&(me=me.includes("?")||me.includes("#")?me=v(me):{path:me},me.params={}),nt({query:z.query,hash:z.hash,params:me.path!=null?{}:z.params},me)}}function A(z,pe){const de=c=R(z),xe=o.value,me=z.state,Be=z.force,b=z.replace===!0,I=_(de,xe);if(I)return A(nt(v(I),{state:typeof I=="object"?nt({},me,I.state):me,force:Be,replace:b}),pe||de);const F=de;F.redirectedFrom=pe;let X;return!Be&&X0(n,xe,de)&&(X=Va(mt.NAVIGATION_DUPLICATED,{to:F,from:xe}),W(xe,xe,!0,!1)),(X?Promise.resolve(X):L(F,xe)).catch(Z=>en(Z)?en(Z,mt.NAVIGATION_GUARD_REDIRECT)?Z:B(Z):E(Z,F,xe)).then(Z=>{if(Z){if(en(Z,mt.NAVIGATION_GUARD_REDIRECT))return A(nt({replace:b},v(Z.to),{state:typeof Z.to=="object"?nt({},me,Z.to.state):me,force:Be}),pe||F)}else Z=M(F,xe,!0,b,me);return H(F,xe,Z),Z})}function T(z,pe){const de=m(z,pe);return de?Promise.reject(de):Promise.resolve()}function C(z){const pe=Q.values().next().value;return pe&&typeof pe.runWithContext=="function"?pe.runWithContext(z):z()}function L(z,pe){let de;const[xe,me,Be]=g_(z,pe);de=jr(xe.reverse(),"beforeRouteLeave",z,pe);for(const I of xe)I.leaveGuards.forEach(F=>{de.push(Nn(F,z,pe))});const b=T.bind(null,z,pe);return de.push(b),Fe(de).then(()=>{de=[];for(const I of i.list())de.push(Nn(I,z,pe));return de.push(b),Fe(de)}).then(()=>{de=jr(me,"beforeRouteUpdate",z,pe);for(const I of me)I.updateGuards.forEach(F=>{de.push(Nn(F,z,pe))});return de.push(b),Fe(de)}).then(()=>{de=[];for(const I of Be)if(I.beforeEnter)if(Ms(I.beforeEnter))for(const F of I.beforeEnter)de.push(Nn(F,z,pe));else de.push(Nn(I.beforeEnter,z,pe));return de.push(b),Fe(de)}).then(()=>(z.matched.forEach(I=>I.enterCallbacks={}),de=jr(Be,"beforeRouteEnter",z,pe,C),de.push(b),Fe(de))).then(()=>{de=[];for(const I of l.list())de.push(Nn(I,z,pe));return de.push(b),Fe(de)}).catch(I=>en(I,mt.NAVIGATION_CANCELLED)?I:Promise.reject(I))}function H(z,pe,de){r.list().forEach(xe=>C(()=>xe(z,pe,de)))}function M(z,pe,de,xe,me){const Be=m(z,pe);if(Be)return Be;const b=pe===Cn,I=ba?history.state:{};de&&(xe||b?a.replace(z.fullPath,nt({scroll:b&&I&&I.scroll},me)):a.push(z.fullPath,me)),o.value=z,W(z,pe,de,b),B()}let D;function K(){D||(D=a.listen((z,pe,de)=>{if(!he.listening)return;const xe=R(z),me=_(xe,he.currentRoute.value);if(me){A(nt(me,{replace:!0,force:!0}),xe).catch(mi);return}c=xe;const Be=o.value;ba&&r_(fu(Be.fullPath,de.delta),yr()),L(xe,Be).catch(b=>en(b,mt.NAVIGATION_ABORTED|mt.NAVIGATION_CANCELLED)?b:en(b,mt.NAVIGATION_GUARD_REDIRECT)?(A(nt(v(b.to),{force:!0}),xe).then(I=>{en(I,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&!de.delta&&de.type===Co.pop&&a.go(-1,!1)}).catch(mi),Promise.reject()):(de.delta&&a.go(-de.delta,!1),E(b,xe,Be))).then(b=>{b=b||M(xe,Be,!1),b&&(de.delta&&!en(b,mt.NAVIGATION_CANCELLED)?a.go(-de.delta,!1):de.type===Co.pop&&en(b,mt.NAVIGATION_ABORTED|mt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),H(xe,Be,b)}).catch(mi)}))}let ne=Xa(),$=Xa(),O;function E(z,pe,de){B(z);const xe=$.list();return xe.length?xe.forEach(me=>me(z,pe,de)):console.error(z),Promise.reject(z)}function N(){return O&&o.value!==Cn?Promise.resolve():new Promise((z,pe)=>{ne.add([z,pe])})}function B(z){return O||(O=!z,K(),ne.list().forEach(([pe,de])=>z?de(z):pe()),ne.reset()),z}function W(z,pe,de,xe){const{scrollBehavior:me}=e;if(!ba||!me)return Promise.resolve();const Be=!de&&o_(fu(z.fullPath,0))||(xe||!de)&&history.state&&history.state.scroll||null;return Ot().then(()=>me(z,pe,Be)).then(b=>b&&l_(b)).catch(b=>E(b,z,pe))}const te=z=>a.go(z);let oe;const Q=new Set,he={currentRoute:o,listening:!0,addRoute:p,removeRoute:g,clearRoutes:t.clearRoutes,hasRoute:S,getRoutes:y,resolve:R,options:e,push:x,replace:w,go:te,back:()=>te(-1),forward:()=>te(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:$.add,isReady:N,install(z){z.component("RouterLink",F_),z.component("RouterView",H_),z.config.globalProperties.$router=he,Object.defineProperty(z.config.globalProperties,"$route",{enumerable:!0,get:()=>Gs(o)}),ba&&!oe&&o.value===Cn&&(oe=!0,x(a.location).catch(xe=>{}));const pe={};for(const xe in Cn)Object.defineProperty(pe,xe,{get:()=>o.value[xe],enumerable:!0});z.provide(xr,he),z.provide(Lc,Ho(pe)),z.provide(Ao,o);const de=z.unmount;Q.add(z),z.unmount=function(){Q.delete(z),Q.size<1&&(c=Cn,D&&D(),D=null,o.value=Cn,oe=!1,O=!1),de()}}};function Fe(z){return z.reduce((pe,de)=>pe.then(()=>C(de)),Promise.resolve())}return he}function ig(){return Ts(xr)}function j_(e){return Ts(Lc)}const z_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],is=Fn({open:!1,query:"",selected:0});function Tu(){is.query="",is.selected=0,is.open=!0}function zr(){is.open=!1}function q_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const G_={setup(){const e=ig(),t=h(null),s=ee(()=>{const i=is.query.trim().toLowerCase();return z_.map(l=>({...l,_score:q_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ds(()=>is.open,async i=>{var l;i&&(await Ot(),(l=t.value)==null||l.focus())}),ds(()=>is.query,()=>{is.selected=0});function n(i){zr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),zr();return}if(i.key==="ArrowDown")i.preventDefault(),is.selected=Math.min(is.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),is.selected=Math.max(is.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[is.selected];l&&n(l)}}return{state:is,results:s,inputEl:t,go:n,onKeydown:a,closePalette:zr}},template:`
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
  `},Ro={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ro));const K_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Da("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Da("path",{d:Ro[e.name]||Ro.info})])}},W_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Cu(e){return[...e.querySelectorAll(W_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const Z_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Cu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Cu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Nc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ra(e){const t=Nc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Dc(e){const t=Nc(e);return t?t.toLocaleTimeString():"—"}function lg(e){const t=Nc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function ja(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Mc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function rg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Eu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function og(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function cg(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const J_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const f=ee(()=>{const D=e.value.uptime_seconds||0,K=Math.floor(D/86400),ne=Math.floor(D%86400/3600),$=Math.floor(D%3600/60),O=[];return K>0&&O.push(`${K}d`),ne>0&&O.push(`${ne}h`),(O.length===0||K===0&&ne===0)&&O.push(`${$}m`),O.join(" ")}),p=ee(()=>{const D=e.value.uptime_seconds||0;return 125.66*(1-Math.min(D/86400,1))}),g=ee(()=>{const D=e.value;return[{label:"Guilds",value:D.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:D.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:D.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${D.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:D.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:D.loop_count>0?"text-green-400":"",highlight:D.loop_count>0},{label:"Agents",value:D.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:D.agent_count>0?`${D.agent_count} total`:"",subColor:"text-gray-500",highlight:(D.agent_running??0)>0},{label:"Processes",value:D.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:D.process_count>0?`${D.process_count} total`:"",subColor:"text-gray-500",highlight:(D.process_running??0)>0},{label:"Schedules",value:D.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(D.schedule_failing>0?`${D.schedule_failing} failing`:"")+(D.schedule_failing>0&&D.schedule_paused>0?", ":"")+(D.schedule_paused>0?`${D.schedule_paused} paused`:"")||void 0,subColor:D.schedule_failing>0?"text-red-400":"text-yellow-400",color:D.schedule_failing>0?"text-red-400":"",highlight:D.schedule_failing>0},{label:"Users",value:D.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),y=ee(()=>{const D=e.value,K=[];return K.push({label:"Bot",status:D.status==="online"?"ok":"warn",detail:D.status==="online"?"Online":"Starting"}),(D.schedule_failing||0)>0?K.push({label:"Schedules",status:"error",detail:`${D.schedule_failing} failing`}):(D.schedule_count||0)>0&&K.push({label:"Schedules",status:"ok",detail:`${D.schedule_count} configured`}),(D.loop_count||0)>0&&K.push({label:"Loops",status:"ok",detail:`${D.loop_count} active`}),(D.agent_running||0)>0&&K.push({label:"Agents",status:"ok",detail:`${D.agent_running} running`}),(D.process_running||0)>0&&K.push({label:"Processes",status:"ok",detail:`${D.process_running} running`}),K});async function S(){try{e.value=await Y.get("/api/status"),s.value=null}catch(D){s.value=D.message}finally{t.value=!1}}async function R(){a.value=!0;try{n.value=await Y.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function v(){l.value=!0;try{i.value=await Y.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const D=await Y.get("/api/knowledge");c.value=(Array.isArray(D)?D:[]).reduce((K,ne)=>K+(ne.chunks||0),0)}catch{c.value=null}}async function x(){try{const D=await Y.get("/api/agents");r.value=D.filter(K=>K.status==="running")}catch{}}async function w(){d.value={...d.value,reload:!0};try{await Y.post("/api/reload"),Se.success("Config reloaded")}catch(D){Se.error(D.message)}d.value={...d.value,reload:!1}}async function _(){if(!await bs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const K=e.value.session_count;e.value={...e.value,session_count:0};try{const ne=await Y.post("/api/sessions/clear-all");Se.success(`Cleared ${ne.count} session${ne.count!==1?"s":""}`),await S()}catch(ne){e.value={...e.value,session_count:K},Se.error(ne.message)}d.value={...d.value,clearSessions:!1}}async function A(){if(!await bs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const K=e.value.loop_count;e.value={...e.value,loop_count:0};try{const ne=await Y.post("/api/loops/stop-all");Se.success(ne.result),await S()}catch(ne){e.value={...e.value,loop_count:K},Se.error(ne.message)}d.value={...d.value,stopLoops:!1}}function T(){t.value=!0,s.value=null,S(),R(),v(),x()}let C=null,L=null,H=null;function M(D){if(D.payload&&D.payload.tool_name){const K={...D.payload,_isNew:!0,_key:++u};n.value.unshift(K),n.value.length>10&&n.value.pop(),o.value++,K.error&&(i.value.unshift(K),i.value.length>5&&i.value.pop()),setTimeout(()=>{K._isNew=!1},1500),clearTimeout(H),H=setTimeout(()=>{o.value=0},1e4)}}return Je(async()=>{await Promise.all([S(),R(),v(),x(),m()]),C=setInterval(S,15e3),L=setInterval(x,1e4),We.subscribe("events",M)}),_t(()=>{C&&clearInterval(C),L&&clearInterval(L),clearTimeout(H),We.unsubscribe("events",M)}),{status:e,loading:t,error:s,uptime:f,uptimeRingOffset:p,stats:g,healthIndicators:y,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:R,fetchStatus:S,formatTime:Dc,formatDuration:ja,retry:T,reloadConfig:w,clearSessions:_,stopAllLoops:A}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Au(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function Y_(e){if(Array.isArray(e))return e}function Q_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function X_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function ew(e,t){return Y_(e)||Q_(e,t)||tw(e,t)||X_()}function tw(e,t){if(e){if(typeof e=="string")return Au(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Au(e,t):void 0}}const dg=Object.entries,Ru=Object.setPrototypeOf,sw=Object.isFrozen,nw=Object.getPrototypeOf,aw=Object.getOwnPropertyDescriptor;let es=Object.freeze,Es=Object.seal,ya=Object.create,ug=typeof Reflect<"u"&&Reflect,Io=ug.apply,Oo=ug.construct;es||(es=function(t){return t});Es||(Es=function(t){return t});Io||(Io=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Oo||(Oo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const tn=Ct(Array.prototype.forEach),iw=Ct(Array.prototype.lastIndexOf),Iu=Ct(Array.prototype.pop),ha=Ct(Array.prototype.push),lw=Ct(Array.prototype.splice),Zt=Array.isArray,oi=Ct(String.prototype.toLowerCase),qr=Ct(String.prototype.toString),Ou=Ct(String.prototype.match),ga=Ct(String.prototype.replace),Lu=Ct(String.prototype.indexOf),rw=Ct(String.prototype.trim),ow=Ct(Number.prototype.toString),cw=Ct(Boolean.prototype.toString),Nu=typeof BigInt>"u"?null:Ct(BigInt.prototype.toString),Du=typeof Symbol>"u"?null:Ct(Symbol.prototype.toString),gt=Ct(Object.prototype.hasOwnProperty),ei=Ct(Object.prototype.toString),Pt=Ct(RegExp.prototype.test),Vn=dw(TypeError);function Ct(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Io(e,t,n)}}function dw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Oo(e,s)}}function He(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:oi;if(Ru&&Ru(e,null),!Zt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(sw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function uw(e){for(let t=0;t<e.length;t++)gt(e,t)||(e[t]=null);return e}function Vt(e){const t=ya(null);for(const n of dg(e)){var s=ew(n,2);const a=s[0],i=s[1];gt(e,a)&&(Zt(i)?t[a]=uw(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Vt(i):t[a]=i)}return t}function fw(e){switch(typeof e){case"string":return e;case"number":return ow(e);case"boolean":return cw(e);case"bigint":return Nu?Nu(e):"0";case"symbol":return Du?Du(e):"Symbol()";case"undefined":return ei(e);case"function":case"object":{if(e===null)return ei(e);const t=e,s=Hs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ei(n)}return ei(e)}default:return ei(e)}}function Hs(e,t){for(;e!==null;){const n=aw(e,t);if(n){if(n.get)return Ct(n.get);if(typeof n.value=="function")return Ct(n.value)}e=nw(e)}function s(){return null}return s}function pw(e){try{return Pt(e,""),!0}catch{return!1}}const Mu=es(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),Gr=es(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Kr=es(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),hw=es(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Wr=es(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),gw=es(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Pu=es(["#text"]),Fu=es(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Zr=es(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),$u=es(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),cl=es(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),mw=Es(/{{[\w\W]*|^[\w\W]*}}/g),vw=Es(/<%[\w\W]*|^[\w\W]*%>/g),bw=Es(/\${[\w\W]*/g),yw=Es(/^data-[\-\w.\u00B7-\uFFFF]+$/),xw=Es(/^aria-[\-\w]+$/),Uu=Es(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),_w=Es(/^(?:\w+script|data):/i),ww=Es(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),kw=Es(/^html$/i),Sw=Es(/^[a-z][.\w]*(-[.\w]+)+$/i),$s={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Tw=function(){return typeof window>"u"?null:window},Cw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Bu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function fg(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Tw();const t=be=>fg(be);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==$s.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,f=r.prototype,p=Hs(f,"cloneNode"),g=Hs(f,"remove"),y=Hs(f,"nextSibling"),S=Hs(f,"childNodes"),R=Hs(f,"parentNode"),v=Hs(f,"shadowRoot"),m=Hs(f,"attributes"),x=l&&l.prototype?Hs(l.prototype,"nodeType"):null,w=l&&l.prototype?Hs(l.prototype,"nodeName"):null;if(typeof i=="function"){const be=s.createElement("template");be.content&&be.content.ownerDocument&&(s=be.content.ownerDocument)}let _,A="",T,C=!1,L=0;const H=function(){if(L>0)throw Vn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},M=function(k){H(),L++;try{return _.createHTML(k)}finally{L--}},D=function(k){H(),L++;try{return _.createScriptURL(k)}finally{L--}},K=function(){return C||(T=Cw(u,a),C=!0),T},ne=s,$=ne.implementation,O=ne.createNodeIterator,E=ne.createDocumentFragment,N=ne.getElementsByTagName,B=n.importNode;let W=Bu();t.isSupported=typeof dg=="function"&&typeof R=="function"&&$&&$.createHTMLDocument!==void 0;const te=mw,oe=vw,Q=bw,he=yw,Fe=xw,z=_w,pe=ww,de=Sw;let xe=Uu,me=null;const Be=He({},[...Mu,...Gr,...Kr,...Wr,...Pu]);let b=null;const I=He({},[...Fu,...Zr,...$u,...cl]);let F=Object.seal(ya(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),X=null,Z=null;const J=Object.seal(ya(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ue=!0,re=!0,ie=!1,se=!0,ye=!1,fe=!0,ge=!1,we=!1,Te=!1,Re=!1,Ne=!1,Pe=!1,Ve=!0,st=!1;const V="user-content-";let _e=!0,Ie=!1,De={},ze=null;const Ye=He({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ht=null;const ts=He({},["audio","video","img","source","image","track"]);let Is=null;const Ps=He({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Fs="http://www.w3.org/1998/Math/MathML",us="http://www.w3.org/2000/svg",q="http://www.w3.org/1999/xhtml";let Ee=q,fs=!1,Zs=null;const ca=He({},[Fs,us,q],qr);let wn=He({},["mi","mo","mn","ms","mtext"]),Js=He({},["annotation-xml"]);const P=He({},["title","style","font","a","script"]);let j=null;const ae=["application/xhtml+xml","text/html"],ke="text/html";let Ce=null,Et=null;const U=s.createElement("form"),le=function(k){return k instanceof RegExp||k instanceof Function},Oe=function(){let k=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Et&&Et===k)return;(!k||typeof k!="object")&&(k={}),k=Vt(k),j=ae.indexOf(k.PARSER_MEDIA_TYPE)===-1?ke:k.PARSER_MEDIA_TYPE,Ce=j==="application/xhtml+xml"?qr:oi,me=gt(k,"ALLOWED_TAGS")&&Zt(k.ALLOWED_TAGS)?He({},k.ALLOWED_TAGS,Ce):Be,b=gt(k,"ALLOWED_ATTR")&&Zt(k.ALLOWED_ATTR)?He({},k.ALLOWED_ATTR,Ce):I,Zs=gt(k,"ALLOWED_NAMESPACES")&&Zt(k.ALLOWED_NAMESPACES)?He({},k.ALLOWED_NAMESPACES,qr):ca,Is=gt(k,"ADD_URI_SAFE_ATTR")&&Zt(k.ADD_URI_SAFE_ATTR)?He(Vt(Ps),k.ADD_URI_SAFE_ATTR,Ce):Ps,ht=gt(k,"ADD_DATA_URI_TAGS")&&Zt(k.ADD_DATA_URI_TAGS)?He(Vt(ts),k.ADD_DATA_URI_TAGS,Ce):ts,ze=gt(k,"FORBID_CONTENTS")&&Zt(k.FORBID_CONTENTS)?He({},k.FORBID_CONTENTS,Ce):Ye,X=gt(k,"FORBID_TAGS")&&Zt(k.FORBID_TAGS)?He({},k.FORBID_TAGS,Ce):Vt({}),Z=gt(k,"FORBID_ATTR")&&Zt(k.FORBID_ATTR)?He({},k.FORBID_ATTR,Ce):Vt({}),De=gt(k,"USE_PROFILES")?k.USE_PROFILES&&typeof k.USE_PROFILES=="object"?Vt(k.USE_PROFILES):k.USE_PROFILES:!1,ue=k.ALLOW_ARIA_ATTR!==!1,re=k.ALLOW_DATA_ATTR!==!1,ie=k.ALLOW_UNKNOWN_PROTOCOLS||!1,se=k.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ye=k.SAFE_FOR_TEMPLATES||!1,fe=k.SAFE_FOR_XML!==!1,ge=k.WHOLE_DOCUMENT||!1,Re=k.RETURN_DOM||!1,Ne=k.RETURN_DOM_FRAGMENT||!1,Pe=k.RETURN_TRUSTED_TYPE||!1,Te=k.FORCE_BODY||!1,Ve=k.SANITIZE_DOM!==!1,st=k.SANITIZE_NAMED_PROPS||!1,_e=k.KEEP_CONTENT!==!1,Ie=k.IN_PLACE||!1,xe=pw(k.ALLOWED_URI_REGEXP)?k.ALLOWED_URI_REGEXP:Uu,Ee=typeof k.NAMESPACE=="string"?k.NAMESPACE:q,wn=gt(k,"MATHML_TEXT_INTEGRATION_POINTS")&&k.MATHML_TEXT_INTEGRATION_POINTS&&typeof k.MATHML_TEXT_INTEGRATION_POINTS=="object"?Vt(k.MATHML_TEXT_INTEGRATION_POINTS):He({},["mi","mo","mn","ms","mtext"]),Js=gt(k,"HTML_INTEGRATION_POINTS")&&k.HTML_INTEGRATION_POINTS&&typeof k.HTML_INTEGRATION_POINTS=="object"?Vt(k.HTML_INTEGRATION_POINTS):He({},["annotation-xml"]);const G=gt(k,"CUSTOM_ELEMENT_HANDLING")&&k.CUSTOM_ELEMENT_HANDLING&&typeof k.CUSTOM_ELEMENT_HANDLING=="object"?Vt(k.CUSTOM_ELEMENT_HANDLING):ya(null);if(F=ya(null),gt(G,"tagNameCheck")&&le(G.tagNameCheck)&&(F.tagNameCheck=G.tagNameCheck),gt(G,"attributeNameCheck")&&le(G.attributeNameCheck)&&(F.attributeNameCheck=G.attributeNameCheck),gt(G,"allowCustomizedBuiltInElements")&&typeof G.allowCustomizedBuiltInElements=="boolean"&&(F.allowCustomizedBuiltInElements=G.allowCustomizedBuiltInElements),ye&&(re=!1),Ne&&(Re=!0),De&&(me=He({},Pu),b=ya(null),De.html===!0&&(He(me,Mu),He(b,Fu)),De.svg===!0&&(He(me,Gr),He(b,Zr),He(b,cl)),De.svgFilters===!0&&(He(me,Kr),He(b,Zr),He(b,cl)),De.mathMl===!0&&(He(me,Wr),He(b,$u),He(b,cl))),J.tagCheck=null,J.attributeCheck=null,gt(k,"ADD_TAGS")&&(typeof k.ADD_TAGS=="function"?J.tagCheck=k.ADD_TAGS:Zt(k.ADD_TAGS)&&(me===Be&&(me=Vt(me)),He(me,k.ADD_TAGS,Ce))),gt(k,"ADD_ATTR")&&(typeof k.ADD_ATTR=="function"?J.attributeCheck=k.ADD_ATTR:Zt(k.ADD_ATTR)&&(b===I&&(b=Vt(b)),He(b,k.ADD_ATTR,Ce))),gt(k,"ADD_URI_SAFE_ATTR")&&Zt(k.ADD_URI_SAFE_ATTR)&&He(Is,k.ADD_URI_SAFE_ATTR,Ce),gt(k,"FORBID_CONTENTS")&&Zt(k.FORBID_CONTENTS)&&(ze===Ye&&(ze=Vt(ze)),He(ze,k.FORBID_CONTENTS,Ce)),gt(k,"ADD_FORBID_CONTENTS")&&Zt(k.ADD_FORBID_CONTENTS)&&(ze===Ye&&(ze=Vt(ze)),He(ze,k.ADD_FORBID_CONTENTS,Ce)),_e&&(me["#text"]=!0),ge&&He(me,["html","head","body"]),me.table&&(He(me,["tbody"]),delete X.tbody),k.TRUSTED_TYPES_POLICY){if(typeof k.TRUSTED_TYPES_POLICY.createHTML!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof k.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Vn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const ce=_;_=k.TRUSTED_TYPES_POLICY;try{A=M("")}catch(Le){throw _=ce,Le}}else k.TRUSTED_TYPES_POLICY===null?(_=void 0,A=""):(_===void 0&&(_=K()),_&&typeof A=="string"&&(A=M("")));(W.uponSanitizeElement.length>0||W.uponSanitizeAttribute.length>0)&&me===Be&&(me=Vt(me)),W.uponSanitizeAttribute.length>0&&b===I&&(b=Vt(b)),es&&es(k),Et=k},lt=He({},[...Gr,...Kr,...hw]),pt=He({},[...Wr,...gw]),ss=function(k){let G=R(k);(!G||!G.tagName)&&(G={namespaceURI:Ee,tagName:"template"});const ce=oi(k.tagName),Le=oi(G.tagName);return Zs[k.namespaceURI]?k.namespaceURI===us?G.namespaceURI===q?ce==="svg":G.namespaceURI===Fs?ce==="svg"&&(Le==="annotation-xml"||wn[Le]):!!lt[ce]:k.namespaceURI===Fs?G.namespaceURI===q?ce==="math":G.namespaceURI===us?ce==="math"&&Js[Le]:!!pt[ce]:k.namespaceURI===q?G.namespaceURI===us&&!Js[Le]||G.namespaceURI===Fs&&!wn[Le]?!1:!pt[ce]&&(P[ce]||!lt[ce]):!!(j==="application/xhtml+xml"&&Zs[k.namespaceURI]):!1},ps=function(k){ha(t.removed,{element:k});try{R(k).removeChild(k)}catch{if(g(k),!R(k))throw Vn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},qc=function(k){const G=S?S(k):k.childNodes;if(G){const Le=[];tn(G,$e=>{ha(Le,$e)}),tn(Le,$e=>{try{g($e)}catch{}})}const ce=m?m(k):null;if(ce)for(let Le=ce.length-1;Le>=0;--Le){const $e=ce[Le],je=$e&&$e.name;if(typeof je=="string")try{k.removeAttribute(je)}catch{}}},Un=function(k,G){try{ha(t.removed,{attribute:G.getAttributeNode(k),from:G})}catch{ha(t.removed,{attribute:null,from:G})}if(G.removeAttribute(k),k==="is")if(Re||Ne)try{ps(G)}catch{}else try{G.setAttribute(k,"")}catch{}},Dg=function(k){const G=m?m(k):k.attributes;if(G)for(let ce=G.length-1;ce>=0;--ce){const Le=G[ce],$e=Le&&Le.name;if(!(typeof $e!="string"||b[Ce($e)]))try{k.removeAttribute($e)}catch{}}},Mg=function(k){const G=[k];for(;G.length>0;){const ce=G.pop();(x?x(ce):ce.nodeType)===$s.element&&Dg(ce);const $e=S?S(ce):ce.childNodes;if($e)for(let je=$e.length-1;je>=0;--je)G.push($e[je])}},Gc=function(k){let G=null,ce=null;if(Te)k="<remove></remove>"+k;else{const je=Ou(k,/^[\r\n\t ]+/);ce=je&&je[0]}j==="application/xhtml+xml"&&Ee===q&&(k='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+k+"</body></html>");const Le=_?M(k):k;if(Ee===q)try{G=new d().parseFromString(Le,j)}catch{}if(!G||!G.documentElement){G=$.createDocument(Ee,"template",null);try{G.documentElement.innerHTML=fs?A:Le}catch{}}const $e=G.body||G.documentElement;return k&&ce&&$e.insertBefore(s.createTextNode(ce),$e.childNodes[0]||null),Ee===q?N.call(G,ge?"html":"body")[0]:ge?G.documentElement:$e},Kc=function(k){return O.call(k.ownerDocument||k,k,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},Sr=function(k){var G,ce;k.normalize();const Le=O.call(k.ownerDocument||k,k,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let $e=Le.nextNode();for(;$e;){let At=$e.data;tn([te,oe,Q],ot=>{At=ga(At,ot," ")}),$e.data=At,$e=Le.nextNode()}const je=(G=(ce=k.querySelectorAll)===null||ce===void 0?void 0:ce.call(k,"template"))!==null&&G!==void 0?G:[];tn(Array.from(je),At=>{da(At.content)&&Sr(At.content)})},Zi=function(k){const G=w?w(k):null;return typeof G!="string"||Ce(G)!=="form"?!1:typeof k.nodeName!="string"||typeof k.textContent!="string"||typeof k.removeChild!="function"||k.attributes!==m(k)||typeof k.removeAttribute!="function"||typeof k.setAttribute!="function"||typeof k.namespaceURI!="string"||typeof k.insertBefore!="function"||typeof k.hasChildNodes!="function"||k.nodeType!==x(k)||k.childNodes!==S(k)},da=function(k){if(!x||typeof k!="object"||k===null)return!1;try{return x(k)===$s.documentFragment}catch{return!1}},Ka=function(k){if(!x||typeof k!="object"||k===null)return!1;try{return typeof x(k)=="number"}catch{return!1}};function Ys(be,k,G){tn(be,ce=>{ce.call(t,k,G,Et)})}const Wc=function(k){let G=null;if(Ys(W.beforeSanitizeElements,k,null),Zi(k))return ps(k),!0;const ce=Ce(w?w(k):k.nodeName);if(Ys(W.uponSanitizeElement,k,{tagName:ce,allowedTags:me}),fe&&k.hasChildNodes()&&!Ka(k.firstElementChild)&&Pt(/<[/\w!]/g,k.innerHTML)&&Pt(/<[/\w!]/g,k.textContent)||fe&&k.namespaceURI===q&&ce==="style"&&Ka(k.firstElementChild)||k.nodeType===$s.progressingInstruction||fe&&k.nodeType===$s.comment&&Pt(/<[/\w]/g,k.data))return ps(k),!0;if(X[ce]||!(J.tagCheck instanceof Function&&J.tagCheck(ce))&&!me[ce]){if(!X[ce]&&Jc(ce)&&(F.tagNameCheck instanceof RegExp&&Pt(F.tagNameCheck,ce)||F.tagNameCheck instanceof Function&&F.tagNameCheck(ce)))return!1;if(_e&&!ze[ce]){const $e=R(k),je=S(k);if(je&&$e){const At=je.length;for(let ot=At-1;ot>=0;--ot){const bt=Ie?je[ot]:p(je[ot],!0);$e.insertBefore(bt,y(k))}}}return ps(k),!0}return(x?x(k):k.nodeType)===$s.element&&!ss(k)||(ce==="noscript"||ce==="noembed"||ce==="noframes")&&Pt(/<\/no(script|embed|frames)/i,k.innerHTML)?(ps(k),!0):(ye&&k.nodeType===$s.text&&(G=k.textContent,tn([te,oe,Q],$e=>{G=ga(G,$e," ")}),k.textContent!==G&&(ha(t.removed,{element:k.cloneNode()}),k.textContent=G)),Ys(W.afterSanitizeElements,k,null),!1)},Zc=function(k,G,ce){if(Z[G]||Ve&&(G==="id"||G==="name")&&(ce in s||ce in U))return!1;const Le=b[G]||J.attributeCheck instanceof Function&&J.attributeCheck(G,k);if(!(re&&!Z[G]&&Pt(he,G))){if(!(ue&&Pt(Fe,G))){if(!Le||Z[G]){if(!(Jc(k)&&(F.tagNameCheck instanceof RegExp&&Pt(F.tagNameCheck,k)||F.tagNameCheck instanceof Function&&F.tagNameCheck(k))&&(F.attributeNameCheck instanceof RegExp&&Pt(F.attributeNameCheck,G)||F.attributeNameCheck instanceof Function&&F.attributeNameCheck(G,k))||G==="is"&&F.allowCustomizedBuiltInElements&&(F.tagNameCheck instanceof RegExp&&Pt(F.tagNameCheck,ce)||F.tagNameCheck instanceof Function&&F.tagNameCheck(ce))))return!1}else if(!Is[G]){if(!Pt(xe,ga(ce,pe,""))){if(!((G==="src"||G==="xlink:href"||G==="href")&&k!=="script"&&Lu(ce,"data:")===0&&ht[k])){if(!(ie&&!Pt(z,ga(ce,pe,"")))){if(ce)return!1}}}}}}return!0},Pg=He({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Jc=function(k){return!Pg[oi(k)]&&Pt(de,k)},Yc=function(k){Ys(W.beforeSanitizeAttributes,k,null);const G=k.attributes;if(!G||Zi(k))return;const ce={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:b,forceKeepAttr:void 0};let Le=G.length;for(;Le--;){const $e=G[Le],je=$e.name,At=$e.namespaceURI,ot=$e.value,bt=Ce(je),kn=ot;let Nt=je==="value"?kn:rw(kn);if(ce.attrName=bt,ce.attrValue=Nt,ce.keepAttr=!0,ce.forceKeepAttr=void 0,Ys(W.uponSanitizeAttribute,k,ce),Nt=ce.attrValue,st&&(bt==="id"||bt==="name")&&Lu(Nt,V)!==0&&(Un(je,k),Nt=V+Nt),fe&&Pt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Nt)){Un(je,k);continue}if(bt==="attributename"&&Ou(Nt,"href")){Un(je,k);continue}if(ce.forceKeepAttr)continue;if(!ce.keepAttr){Un(je,k);continue}if(!se&&Pt(/\/>/i,Nt)){Un(je,k);continue}ye&&tn([te,oe,Q],Xc=>{Nt=ga(Nt,Xc," ")});const Qc=Ce(k.nodeName);if(!Zc(Qc,bt,Nt)){Un(je,k);continue}if(_&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!At)switch(u.getAttributeType(Qc,bt)){case"TrustedHTML":{Nt=M(Nt);break}case"TrustedScriptURL":{Nt=D(Nt);break}}if(Nt!==kn)try{At?k.setAttributeNS(At,je,Nt):k.setAttribute(je,Nt),Zi(k)?ps(k):Iu(t.removed)}catch{Un(je,k)}}Ys(W.afterSanitizeAttributes,k,null)},Ji=function(k){let G=null;const ce=Kc(k);for(Ys(W.beforeSanitizeShadowDOM,k,null);G=ce.nextNode();)if(Ys(W.uponSanitizeShadowNode,G,null),Wc(G),Yc(G),da(G.content)&&Ji(G.content),(x?x(G):G.nodeType)===$s.element){const $e=v?v(G):G.shadowRoot;da($e)&&(Tr($e),Ji($e))}Ys(W.afterSanitizeShadowDOM,k,null)},Tr=function(k){const G=[{node:k,shadow:null}];for(;G.length>0;){const ce=G.pop();if(ce.shadow){Ji(ce.shadow);continue}const Le=ce.node,je=(x?x(Le):Le.nodeType)===$s.element,At=S?S(Le):Le.childNodes;if(At)for(let ot=At.length-1;ot>=0;--ot)G.push({node:At[ot],shadow:null});if(je){const ot=w?w(Le):null;if(typeof ot=="string"&&Ce(ot)==="template"){const bt=Le.content;da(bt)&&G.push({node:bt,shadow:null})}}if(je){const ot=v?v(Le):Le.shadowRoot;da(ot)&&G.push({node:null,shadow:ot},{node:ot,shadow:null})}}};return t.sanitize=function(be){let k=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},G=null,ce=null,Le=null,$e=null;if(fs=!be,fs&&(be="<!-->"),typeof be!="string"&&!Ka(be)&&(be=fw(be),typeof be!="string"))throw Vn("dirty is not a string, aborting");if(!t.isSupported)return be;we||Oe(k),t.removed=[];const je=Ie&&typeof be!="string"&&Ka(be);if(je){const bt=w?w(be):be.nodeName;if(typeof bt=="string"){const kn=Ce(bt);if(!me[kn]||X[kn])throw Vn("root node is forbidden and cannot be sanitized in-place")}if(Zi(be))throw Vn("root node is clobbered and cannot be sanitized in-place");try{Tr(be)}catch(kn){throw qc(be),kn}}else if(Ka(be))G=Gc("<!---->"),ce=G.ownerDocument.importNode(be,!0),ce.nodeType===$s.element&&ce.nodeName==="BODY"||ce.nodeName==="HTML"?G=ce:G.appendChild(ce),Tr(ce);else{if(!Re&&!ye&&!ge&&be.indexOf("<")===-1)return _&&Pe?M(be):be;if(G=Gc(be),!G)return Re?null:Pe?A:""}G&&Te&&ps(G.firstChild);const At=Kc(je?be:G);try{for(;Le=At.nextNode();)Wc(Le),Yc(Le),da(Le.content)&&Ji(Le.content)}catch(bt){throw je&&qc(be),bt}if(je)return tn(t.removed,bt=>{bt.element&&Mg(bt.element)}),ye&&Sr(be),be;if(Re){if(ye&&Sr(G),Ne)for($e=E.call(G.ownerDocument);G.firstChild;)$e.appendChild(G.firstChild);else $e=G;return(b.shadowroot||b.shadowrootmode)&&($e=B.call(n,$e,!0)),$e}let ot=ge?G.outerHTML:G.innerHTML;return ge&&me["!doctype"]&&G.ownerDocument&&G.ownerDocument.doctype&&G.ownerDocument.doctype.name&&Pt(kw,G.ownerDocument.doctype.name)&&(ot="<!DOCTYPE "+G.ownerDocument.doctype.name+`>
`+ot),ye&&tn([te,oe,Q],bt=>{ot=ga(ot,bt," ")}),_&&Pe?M(ot):ot},t.setConfig=function(){let be=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Oe(be),we=!0},t.clearConfig=function(){Et=null,we=!1,_=T,A=""},t.isValidAttribute=function(be,k,G){Et||Oe({});const ce=Ce(be),Le=Ce(k);return Zc(ce,Le,G)},t.addHook=function(be,k){typeof k=="function"&&ha(W[be],k)},t.removeHook=function(be,k){if(k!==void 0){const G=iw(W[be],k);return G===-1?void 0:lw(W[be],G,1)[0]}return Iu(W[be])},t.removeHooks=function(be){W[be]=[]},t.removeAllHooks=function(){W=Bu()},t}var Hu=fg();function Pc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var oa=Pc();function pg(e){oa=e}var vi={exec:()=>null};function at(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Ew=/^(?:[ \t]*(?:\n|$))+/,Aw=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Rw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Wi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Iw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Fc=/(?:[*+-]|\d{1,9}[.)])/,hg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,gg=at(hg).replace(/bull/g,Fc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),Ow=at(hg).replace(/bull/g,Fc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),$c=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Lw=/^[^\n]+/,Uc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Nw=at(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Uc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),Dw=at(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Fc).getRegex(),_r="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Bc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Mw=at("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Bc).replace("tag",_r).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),mg=at($c).replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",_r).getRegex(),Pw=at(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",mg).getRegex(),Hc={blockquote:Pw,code:Aw,def:Nw,fences:Rw,heading:Iw,hr:Wi,html:Mw,lheading:gg,list:Dw,newline:Ew,paragraph:mg,table:vi,text:Lw},Vu=at("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",_r).getRegex(),Fw={...Hc,lheading:Ow,table:Vu,paragraph:at($c).replace("hr",Wi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Vu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",_r).getRegex()},$w={...Hc,html:at(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Bc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:vi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:at($c).replace("hr",Wi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",gg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Uw=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Bw=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,vg=/^( {2,}|\\)\n(?!\s*$)/,Hw=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,wr=/[\p{P}\p{S}]/u,Vc=/[\s\p{P}\p{S}]/u,bg=/[^\s\p{P}\p{S}]/u,Vw=at(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Vc).getRegex(),yg=/(?!~)[\p{P}\p{S}]/u,jw=/(?!~)[\s\p{P}\p{S}]/u,zw=/(?:[^\s\p{P}\p{S}]|~)/u,qw=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,xg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Gw=at(xg,"u").replace(/punct/g,wr).getRegex(),Kw=at(xg,"u").replace(/punct/g,yg).getRegex(),_g="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Ww=at(_g,"gu").replace(/notPunctSpace/g,bg).replace(/punctSpace/g,Vc).replace(/punct/g,wr).getRegex(),Zw=at(_g,"gu").replace(/notPunctSpace/g,zw).replace(/punctSpace/g,jw).replace(/punct/g,yg).getRegex(),Jw=at("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,bg).replace(/punctSpace/g,Vc).replace(/punct/g,wr).getRegex(),Yw=at(/\\(punct)/,"gu").replace(/punct/g,wr).getRegex(),Qw=at(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Xw=at(Bc).replace("(?:-->|$)","-->").getRegex(),ek=at("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Xw).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Gl=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,tk=at(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",Gl).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),wg=at(/^!?\[(label)\]\[(ref)\]/).replace("label",Gl).replace("ref",Uc).getRegex(),kg=at(/^!?\[(ref)\](?:\[\])?/).replace("ref",Uc).getRegex(),sk=at("reflink|nolink(?!\\()","g").replace("reflink",wg).replace("nolink",kg).getRegex(),jc={_backpedal:vi,anyPunctuation:Yw,autolink:Qw,blockSkip:qw,br:vg,code:Bw,del:vi,emStrongLDelim:Gw,emStrongRDelimAst:Ww,emStrongRDelimUnd:Jw,escape:Uw,link:tk,nolink:kg,punctuation:Vw,reflink:wg,reflinkSearch:sk,tag:ek,text:Hw,url:vi},nk={...jc,link:at(/^!?\[(label)\]\((.*?)\)/).replace("label",Gl).getRegex(),reflink:at(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Gl).getRegex()},Lo={...jc,emStrongRDelimAst:Zw,emStrongLDelim:Kw,url:at(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},ak={...Lo,br:at(vg).replace("{2,}","*").getRegex(),text:at(Lo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},dl={normal:Hc,gfm:Fw,pedantic:$w},ti={normal:jc,gfm:Lo,breaks:ak,pedantic:nk},ik={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},ju=e=>ik[e];function Vs(e,t){if(t){if(Qt.escapeTest.test(e))return e.replace(Qt.escapeReplace,ju)}else if(Qt.escapeTestNoEncode.test(e))return e.replace(Qt.escapeReplaceNoEncode,ju);return e}function zu(e){try{e=encodeURI(e).replace(Qt.percentDecode,"%")}catch{return null}return e}function qu(e,t){var i;const s=e.replace(Qt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Qt.slashPipe,"|");return n}function si(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function lk(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function Gu(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function rk(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Kl=class{constructor(e){rt(this,"options");rt(this,"rules");rt(this,"lexer");this.options=e||oa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:si(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=rk(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=si(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:si(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=si(t[0],`
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
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),f=e.split(`
`,1)[0],p=!u.trim(),g=0;if(this.options.pedantic?(g=2,d=u.trimStart()):p?g=t[1].length+1:(g=t[2].search(this.rules.other.nonSpaceChar),g=g>4?1:g,d=u.slice(g),g+=t[1].length),p&&this.rules.other.blankLine.test(f)&&(c+=f+`
`,e=e.substring(f.length+1),o=!0),!o){const R=this.rules.other.nextBulletRegex(g),v=this.rules.other.hrRegex(g),m=this.rules.other.fencesBeginRegex(g),x=this.rules.other.headingBeginRegex(g),w=this.rules.other.htmlBeginRegex(g);for(;e;){const _=e.split(`
`,1)[0];let A;if(f=_,this.options.pedantic?(f=f.replace(this.rules.other.listReplaceNesting,"  "),A=f):A=f.replace(this.rules.other.tabCharGlobal,"    "),m.test(f)||x.test(f)||w.test(f)||R.test(f)||v.test(f))break;if(A.search(this.rules.other.nonSpaceChar)>=g||!f.trim())d+=`
`+A.slice(g);else{if(p||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||x.test(u)||v.test(u))break;d+=`
`+f}!p&&!f.trim()&&(p=!0),c+=_+`
`,e=e.substring(_.length+1),u=A.slice(g)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let y=null,S;this.options.gfm&&(y=this.rules.other.listIsTask.exec(d),y&&(S=y[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!y,checked:S,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=qu(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(qu(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=si(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=lk(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),Gu(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return Gu(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,f=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const g=f.slice(1,-1);return{type:"em",raw:f,text:g,tokens:this.lexer.inlineTokens(g)}}const p=f.slice(2,-2);return{type:"strong",raw:f,text:p,tokens:this.lexer.inlineTokens(p)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},dn=class No{constructor(t){rt(this,"tokens");rt(this,"options");rt(this,"state");rt(this,"tokenizer");rt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||oa,this.options.tokenizer=this.options.tokenizer||new Kl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Qt,block:dl.normal,inline:ti.normal};this.options.pedantic?(s.block=dl.pedantic,s.inline=ti.pedantic):this.options.gfm&&(s.block=dl.gfm,this.options.breaks?s.inline=ti.breaks:s.inline=ti.gfm),this.tokenizer.rules=s}static get rules(){return{block:dl,inline:ti}}static lex(t,s){return new No(s).lex(t)}static lexInline(t,s){return new No(s).inlineTokens(t)}lex(t){t=t.replace(Qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Qt.tabCharGlobal,"    ").replace(Qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(f=>{u=f.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(f=>(d=f.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const f=s.at(-1);d.type==="text"&&(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let f=1/0;const p=t.slice(1);let g;this.options.extensions.startInline.forEach(y=>{g=y.call({lexer:this},p),typeof g=="number"&&g>=0&&(f=Math.min(f,g))}),f<1/0&&f>=0&&(u=t.substring(0,f+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const f=s.at(-1);(f==null?void 0:f.type)==="text"?(f.raw+=d.raw,f.text+=d.text):s.push(d);continue}if(t){const f="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(f);break}else throw new Error(f)}}return s}},Wl=class{constructor(e){rt(this,"options");rt(this,"parser");this.options=e||oa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Qt.notSpaceStart))==null?void 0:i[0],a=e.replace(Qt.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Vs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=zu(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Vs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=zu(e);if(a===null)return Vs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Vs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Vs(e.text)}},zc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},un=class Do{constructor(t){rt(this,"options");rt(this,"renderer");rt(this,"textRenderer");this.options=t||oa,this.options.renderer=this.options.renderer||new Wl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new zc}static parse(t,s){return new Do(s).parse(t)}static parseInline(t,s){return new Do(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Qr,bl=(Qr=class{constructor(e){rt(this,"options");rt(this,"block");this.options=e||oa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?dn.lex:dn.lexInline}provideParser(){return this.block?un.parse:un.parseInline}},rt(Qr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Qr),ok=class{constructor(...e){rt(this,"defaults",Pc());rt(this,"options",this.setOptions);rt(this,"parse",this.parseMarkdown(!0));rt(this,"parseInline",this.parseMarkdown(!1));rt(this,"Parser",un);rt(this,"Renderer",Wl);rt(this,"TextRenderer",zc);rt(this,"Lexer",dn);rt(this,"Tokenizer",Kl);rt(this,"Hooks",bl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Wl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Kl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new bl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];bl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return dn.lex(e,t??this.defaults)}parser(e,t){return un.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?dn.lex:dn.lexInline,o=i.hooks?i.hooks.provideParser():e?un.parse:un.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Vs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},sa=new ok;function tt(e,t){return sa.parse(e,t)}tt.options=tt.setOptions=function(e){return sa.setOptions(e),tt.defaults=sa.defaults,pg(tt.defaults),tt};tt.getDefaults=Pc;tt.defaults=oa;tt.use=function(...e){return sa.use(...e),tt.defaults=sa.defaults,pg(tt.defaults),tt};tt.walkTokens=function(e,t){return sa.walkTokens(e,t)};tt.parseInline=sa.parseInline;tt.Parser=un;tt.parser=un.parse;tt.Renderer=Wl;tt.TextRenderer=zc;tt.Lexer=dn;tt.lexer=dn.lex;tt.Tokenizer=Kl;tt.Hooks=bl;tt.parse=tt;tt.options;tt.setOptions;tt.use;tt.walkTokens;tt.parseInline;un.parse;dn.lex;const ck={breaks:!0,gfm:!0};function Ku(e){if(!e)return"";try{if(typeof tt<"u"&&tt.parse){const t=tt.parse(e,ck);return typeof Hu<"u"?Hu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function dk(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const uk={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function fk(e){return uk[e]||"wrench"}const pk=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Wu(e){if(!e)return[];const t=e.match(pk);return t?[...new Set(t)]:[]}const hk={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=ee(()=>t.value.trim().length>0&&!s.value),u=h(We.state||"disconnected");let f=null,p=null;const g=ee(()=>{const $=u.value;return $==="connected"?"Connected":$==="reconnecting"?"Reconnecting…":$==="connecting"?"Connecting…":"REST fallback"}),y=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],S=ee(()=>{const $=Math.floor(i.value/4)%y.length,O=i.value;return O>3?`${y[$]} (${O}s)`:y[0]});function R(){Ot(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function v(){if(!a.value)return;const $=a.value;$.style.height="auto",$.style.height=Math.min($.scrollHeight,120)+"px"}function m($,O,E={}){const N={id:++o,role:$,content:O,timestamp:Date.now(),html:$==="bot"?Ku(O):"",tools_used:E.tools_used||[],is_error:E.is_error||!1,images:$==="bot"?Wu(O):[],files:E.files||[],_showTools:!1};return e.value.push(N),R(),$==="bot"&&Ot(()=>x()),N}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const E=document.createElement("button");E.className="chat-code-copy",E.textContent="Copy",E.addEventListener("click",()=>{const N=O.querySelector("code"),B=N?N.textContent:O.textContent;navigator.clipboard.writeText(B).then(()=>{E.textContent="Copied!",setTimeout(()=>{E.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(E)})}function w($){if($===0)return!0;const O=e.value[$-1],E=e.value[$],N=new Date(O.timestamp).toDateString(),B=new Date(E.timestamp).toDateString();return N!==B}function _($){const O=new Date($),E=new Date;if(O.toDateString()===E.toDateString())return"Today";const N=new Date(E);return N.setDate(N.getDate()-1),O.toDateString()===N.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function A($){t.value=$,Ot(()=>K())}function T($){window.open($,"_blank","noopener")}function C($){$.target.style.display="none"}function L(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function H(){r&&(clearInterval(r),r=null),i.value=0}function M($){s.value&&(s.value=!1,H(),$.type==="chat_response"?m("bot",$.content,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]}):$.type==="chat_error"&&m("bot",$.error||"Unknown error",{is_error:!0}),Ot(()=>{var O;return(O=a.value)==null?void 0:O.focus()}))}async function D($){try{const O=await Y.post("/api/chat",{content:$,channel_id:l.value});m("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){m("bot",O.message||"Failed to send message",{is_error:!0})}}async function K(){const $=t.value.trim();if(!$||s.value)return;m("user",$),t.value="",s.value=!0,L(),a.value&&(a.value.style.height="auto"),We.connected&&We.sendChat($,{channelId:l.value})||(await D($),s.value=!1,H()),Ot(()=>{var E;return(E=a.value)==null?void 0:E.focus()})}async function ne(){try{if(!l.value){const O=await Y.get("/api/auth/session");l.value=O.channel_id||O.user_id||"web-user"}const $=await Y.get("/api/sessions/"+encodeURIComponent(l.value));if($&&$.messages&&$.messages.length>0){for(const O of $.messages){const E=O.role==="user"?"user":"bot";let N=O.content||"";if(E==="user"){const W=N.match(/^\[.*?\]:\s*/);W&&(N=N.slice(W[0].length))}if(!N.trim())continue;const B={id:++o,role:E,content:N,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:E==="bot"?Ku(N):"",tools_used:[],is_error:!1,images:E==="bot"?Wu(N):[],files:[],_showTools:!1};e.value.push(B)}Ot(()=>{R(),x()})}}catch{}}return Je(()=>{We.subscribe("chat",M),u.value=We.state||"disconnected",f=We.onStateChange,p=($,O)=>{u.value=$,f&&f($,O)},We.onStateChange=p,ne(),Ot(()=>{var $;return($=a.value)==null?void 0:$.focus()})}),_t(()=>{We.unsubscribe("chat",M),We.onStateChange===p&&(We.onStateChange=f),H()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:g,typingText:S,suggestions:c,send:K,autoResize:v,formatTime:dk,formatDate:_,showDateSeparator:w,useSuggestion:A,openImage:T,onImageError:C,getToolIcon:fk}}},kr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=j_(),s=ig(),n=ee({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=ee(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ds(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},gk={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(f){var y,S,R,v,m;const p=f.payload||f,g=p.type||f.type;if(g==="tool_start"){const x=((y=p.metadata)==null?void 0:y.call_id)||null,w={callId:x,id:x||`${p.action}-${Date.now()}`,tool:p.action,actor:p.actor||"",channel:p.channel_id||"",iteration:((S=p.metadata)==null?void 0:S.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(w);return}if(g==="tool_end"){const x=((R=p.metadata)==null?void 0:R.call_id)||null;let w=-1;if(x&&(w=e.value.findIndex(_=>_.callId===x&&_.status==="running")),w<0&&!x)for(let _=e.value.length-1;_>=0;_--){const A=e.value[_];if(A.tool===p.action&&A.status==="running"){w=_;break}}if(w>=0){const _=e.value[w];_.status=(v=p.metadata)!=null&&v.error?"error":"success",_.elapsed=((m=p.metadata)==null?void 0:m.elapsed_ms)||Date.now()-_.startTime,_.result=p.detail||"",_.fadingOut=!0,setTimeout(()=>{const A=e.value.indexOf(_);A>=0&&e.value.splice(A,1),t.value.unshift(_),t.value.length>n&&t.value.pop()},5e3)}return}if(g==="tool_stream"){const x=p.call_id||p.tool_name||"unknown";if(p.finished){const w={...s.value};delete w[x],s.value=w}else{const _=((s.value[x]||"")+(p.chunk||"")).split(`
`);s.value={...s.value,[x]:_.slice(-30).join(`
`)}}return}}let i=null;function l(){const f=Date.now();e.value.forEach(p=>{p.status==="running"&&(p.elapsed=f-p.startTime)})}let r=!1;function o(){r||(r=!0,We.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,We.off("events",a),i&&(clearInterval(i),i=null))}Je(o),As(o),Rs(c),_t(c);function d(f){return f<1e3?`${f}ms`:`${(f/1e3).toFixed(1)}s`}function u(f){return f==="running"?"clock":f==="success"?"success":f==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
          <div class="text-gray-400 text-xs mb-1 font-mono">{{ tool }}</div>
          <div class="max-h-64 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">{{ output }}</div>
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
  `},Sg=Symbol("agent-detail-cancelled"),mk=15e3;function vk(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((p,g)=>{o=p,c=g});function u(p,g){r||(r=!0,l!==null&&a(l),l=null,(p?o:c)(g))}let f;try{f=e(i==null?void 0:i.signal)}catch(p){u(!1,p)}return r||Promise.resolve(f).then(p=>u(!0,p),p=>u(!1,p)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const p=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${p}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,Sg),i==null||i.abort()}}}function Tg({state:e,requestDetail:t,timeoutMs:s=mk,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const f=l;l=null,f==null||f.cancel()}function o(f,{initial:p,coalesce:g}){if(!f)return Promise.resolve();if(g&&l&&l.agentId===f&&e.detailId===f)return l.promise;r();const y={agentId:f,cancel:null,promise:null};l=y,p?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const S=vk(R=>t(f,{signal:R}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return y.cancel=S.cancel,y.promise=(async()=>{let R=null,v=null;try{R=await S.promise}catch(m){v=m}R!==Sg&&(l!==y||e.detailId!==f||(l=null,!v&&(R===null||typeof R!="object")&&(v=new Error(`${n} response was empty or invalid`)),v?e.detail===null&&(e.detailError=(v==null?void 0:v.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=R,e.detailError=null),e.detailLoading=!1))})(),y.promise}function c(f){return e.detailId=f,o(f,{initial:!0,coalesce:!1})}function d(){const f=e.detailId;return f?o(f,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function bk({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const yk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=ee(()=>e.value.filter(E=>E.status==="running").length),o=ee(()=>e.value.filter(E=>E.status==="completed").length),c=ee(()=>e.value.filter(E=>["failed","timeout","killed"].includes(E.status)).length),d=ee(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=ee(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(E=>["failed","timeout","killed"].includes(E.status)):e.value.filter(E=>E.status===i.value));function f(E){const N=Number(E.max_iterations)||0;return N<=0?0:Math.min(100,Math.round(E.iteration_count/N*100))}function p(E){return(Number(E.max_iterations)||0)>0}function g(E,N){return E?E==="N/A"?"N/A":N==="current_inheritance"?`inherit (currently ${E})`:E:"unknown"}function y(E){return g(E.display_model,E.display_model_source||E.display_source)}function S(E){return g(E.display_reasoning_effort,E.display_reasoning_effort_source||E.display_source)}function R(E){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[E]||""}const v=h(null),m=h(null),x=h(!1),w=h(null),_=h(""),T=Tg({state:{get detail(){return v.value},set detail(E){v.value=E},get detailId(){return m.value},set detailId(E){m.value=E},get detailLoading(){return x.value},set detailLoading(E){x.value=E},get detailError(){return w.value},set detailError(E){w.value=E}},requestDetail:(E,{signal:N})=>Y.get(`/api/agents/${encodeURIComponent(E)}`,{signal:N})});async function C(E){_.value="",await T.open(E.id)}function L(){T.close(),_.value=""}async function H(){await T.refresh()}async function M(E,N){try{await navigator.clipboard.writeText(N||""),_.value=E,setTimeout(()=>{_.value===E&&(_.value="")},1500)}catch{Se.error("Copy failed")}}async function D(E=!1){E=E===!0,E||(t.value=!0);try{const N=await Y.get("/api/agents");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){E||(s.value=N.message)}E||(t.value=!1)}async function K(E){const N=e.value.find(W=>W.id===E);if(await bs({title:"Kill agent",message:`Kill agent "${(N==null?void 0:N.label)||E}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=E;try{await Y.del(`/api/agents/${encodeURIComponent(E)}`),Se.success("Agent killed"),await D()}catch(W){Se.error(W.message||"Failed to kill agent")}n.value=null}}const ne=bk({isEnabled:()=>a.value&&l,refreshList:()=>D(!0),hasOpenDetail:()=>!!m.value,refreshDetail:H});function $(){ne.start()}function O(){ne.stop()}return ds(a,()=>ne.sync()),Je(()=>{l=!0,D(),$()}),As(()=>{l=!0,D(!0),$()}),Rs(()=>{l=!1,O()}),_t(()=>{l=!1,O(),T.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ra,formatDuration:ja,progressPercent:f,hasProgress:p,displayModelText:y,displayEffortText:S,displaySourceLabel:R,detail:v,detailId:m,detailLoading:x,detailError:w,copied:_,openDetail:C,closeDetail:L,copyText:M,fetchAgents:D,killAgent:K,startAutoRefresh:$,stopAutoRefresh:O}}},xk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),f=h(null),p=h("");let g=!1;const S=Tg({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return f.value},set detailError(O){f.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:E})=>Y.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:E})});async function R(O){p.value="",await S.open(O.id)}function v(){S.close(),p.value=""}async function m(O,E){try{await navigator.clipboard.writeText(E||""),p.value=O,setTimeout(()=>{p.value===O&&(p.value="")},1500)}catch{Se.error("Copy failed")}}const x=ee(()=>e.value.reduce((O,E)=>O+(E.iteration_count||0),0)),w=ee(()=>e.value.filter(O=>O.status==="running").length);function _(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function A(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function T(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function C(O=!1){O=O===!0,O||(t.value=!0);try{const E=await Y.get("/api/loops");e.value=Array.isArray(E)?E:[],s.value=null}catch(E){O||(s.value=E.message)}O||(t.value=!1)}async function L(){l.value=null;const O=a.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const E={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(E.stop_condition=O.stop_condition.trim()),i.value=!0;try{const N=await Y.post("/api/loops",E);Se.success(`Loop started: ${N.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(N){l.value=N.message}i.value=!1}async function H(O){if(await bs({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=O;try{await Y.del(`/api/loops/${encodeURIComponent(O)}`),Se.success("Loop stopped"),await C()}catch(N){Se.error(N.message||"Failed to stop loop")}r.value=null}}async function M(O){o.value=O;try{await Y.post(`/api/loops/${encodeURIComponent(O)}/restart`),Se.success("Loop restarted"),await C()}catch(E){Se.error(E.message||"Failed to restart loop")}o.value=null}function D(O){g&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(C(!0),d.value&&S.refresh())}let K=null;function ne(){K!==null&&clearInterval(K),K=null}function $(){ne(),g&&(K=setInterval(()=>{C(!0),d.value&&S.refresh()},5e3))}return Je(()=>{g=!0,C(),We.subscribe("events",D),$()}),As(()=>{g=!0,C(!0),$()}),Rs(()=>{g=!1,ne()}),_t(()=>{g=!1,We.unsubscribe("events",D),ne(),S.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:f,copied:p,totalIterations:x,runningCount:w,statusDotClass:_,statusBadge:A,modeBadge:T,formatAge:lg,formatDuration:ja,formatTs:ra,formatTokens:cg,openDetail:R,closeDetail:v,copyText:m,fetchLoops:C,doCreate:L,doStop:H,doRestart:M}}},_k={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=ee(()=>e.value.filter(v=>v.status==="running").length),r=ee(()=>e.value.filter(v=>v.status!=="running").length);function o(v){return v==="running"?"loop-status-running":v==="failed"||v==="error"?"loop-status-error":"loop-status-stopped"}function c(v){return v==="running"?"badge-success":v==="completed"||v==="exited"?"badge-info":v==="killed"||v==="error"||v==="failed"?"badge-danger":"badge-warning"}async function d(v=!1){v=v===!0,v||(t.value=!0);try{e.value=await Y.get("/api/processes"),s.value=null}catch(m){v||(s.value=m.message)}v||(t.value=!1)}function u(){f(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function f(){a&&(clearInterval(a),a=null)}ds(n,v=>{v?u():f()});async function p(v){if(await bs({title:"Kill process",message:`Kill process ${v}?`,confirmLabel:"Kill",danger:!0})){i.value=v;try{await Y.del(`/api/processes/${v}`),Se.success(`Process ${v} killed`),await d()}catch(x){Se.error(x.message||"Failed to kill process")}i.value=null}}function g(v){v.payload&&(v.payload.pid||v.payload.type==="process")&&d(!0)}let y=!1;function S(){y||(y=!0,d(),We.subscribe("events",g),u())}function R(){y&&(y=!1,We.unsubscribe("events",g),f())}return Je(S),As(S),Rs(R),_t(R),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:ja,fetchProcesses:d,doKill:p}}},wk={template:`
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
            <label class="text-gray-400 text-xs block mb-1">One-Time (ISO datetime)
            <input v-model="form.run_at" type="text" class="hm-input"
                   placeholder="e.g. 2026-04-01T09:00:00" />
            </label>
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],d=h(null),u=h(null),f=h(null),p=h(null),g=h(null),y=h([]),S=h(!1),R=h("");let v=0;const m=ee(()=>e.value.filter(N=>N.cron&&!N.one_time).length),x=ee(()=>e.value.filter(N=>N.one_time).length),w=ee(()=>e.value.filter(N=>N.trigger).length),_=ee(()=>e.value.filter(N=>N.paused).length),A=ee(()=>e.value.filter(N=>N.consecutive_failures>0).length);function T(N){if(!N)return"-";const B=Date.now(),te=(new Date(N).getTime()-B)/1e3;if(te<0)return"overdue";if(te<60)return"in < 1 min";if(te<3600)return`in ${Math.floor(te/60)} min`;if(te<86400){const Q=Math.floor(te/3600),he=Math.floor(te%3600/60);return he>0?`in ${Q}h ${he}m`:`in ${Q}h`}const oe=Math.floor(te/86400);return`in ${oe} day${oe!==1?"s":""}`}function C(N){return N==null?"-":N<1e3?`${N}ms`:N<6e4?`${(N/1e3).toFixed(1)}s`:ja(N/1e3)}function L(){r.value=null}async function H(){const N=a.value.cron.trim();if(N){o.value=!0;try{r.value=await Y.post("/api/schedules/validate-cron",{expression:N})}catch(B){r.value={valid:!1,error:B.message}}o.value=!1}}async function M(){t.value=!0,s.value=null;try{e.value=await Y.get("/api/schedules")}catch(N){s.value=N.message}t.value=!1}async function D(N){if(g.value===N){g.value=null,y.value=[];return}g.value=N,S.value=!0,y.value=[];const B=++v;try{const W=await Y.get(`/api/schedules/${encodeURIComponent(N)}/history?limit=10`);if(B!==v||g.value!==N)return;y.value=W,R.value=""}catch(W){if(B!==v||g.value!==N)return;y.value=[],R.value=W.message||"Failed to load execution history"}B===v&&(S.value=!1)}async function K(){l.value=null;const N=a.value;if(!N.description.trim()){l.value="Description is required";return}if(!N.channel_id.trim()){l.value="Channel ID is required";return}if(!N.cron.trim()&&!N.run_at.trim()){l.value="Cron expression or run_at time is required";return}const B={description:N.description.trim(),action:N.action,channel_id:N.channel_id.trim()};if(N.cron.trim()&&(B.cron=N.cron.trim()),N.run_at.trim()&&(B.run_at=N.run_at.trim()),N.action==="reminder"&&N.message.trim()&&(B.message=N.message.trim()),N.action==="check"&&(N.tool_name.trim()&&(B.tool_name=N.tool_name.trim()),N.tool_input_str.trim()))try{B.tool_input=JSON.parse(N.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await Y.post("/api/schedules",B),Se.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await M()}catch(W){l.value=W.message}i.value=!1}async function ne(N){d.value=N;try{const B=await Y.post(`/api/schedules/${encodeURIComponent(N)}/run`);if(B.status==="failure")Se.error(`Execution failed: ${B.error||"unknown error"}`);else{const W=B.warning?`Executed (${B.warning})`:"Executed successfully";Se.success(W)}await M()}catch(B){Se.error(B.message||"Failed to trigger")}d.value=null}async function $(N){f.value=N.id;const B=!N.paused;try{await Y.put(`/api/schedules/${encodeURIComponent(N.id)}`,{paused:B}),Se.success(B?"Schedule paused":"Schedule resumed"),await M()}catch(W){Se.error(W.message||"Failed to update schedule")}f.value=null}async function O(N){p.value=N;try{await Y.post(`/api/schedules/${encodeURIComponent(N)}/reset-failures`),Se.success("Failure counters reset"),await M()}catch(B){Se.error(B.message||"Failed to reset")}p.value=null}async function E(N){const B=e.value.find(te=>te.id===N);if(await bs({title:"Delete schedule",message:`Delete "${(B==null?void 0:B.description)||N}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){u.value=N;try{await Y.del(`/api/schedules/${encodeURIComponent(N)}`),Se.success("Schedule deleted"),await M()}catch(te){Se.error(te.message||"Failed to delete schedule")}u.value=null}}return Je(()=>{M()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:d,deletingId:u,togglingId:f,resettingId:p,expandedId:g,history:y,historyLoading:S,historyError:R,cronCount:m,oneTimeCount:x,webhookCount:w,pausedCount:_,failingCount:A,formatTs:ra,formatAge:lg,formatFuture:T,formatMs:C,formatDuration:ja,onCronInput:L,validateCron:H,toggleExpand:D,fetchSchedules:M,doCreate:K,doRunNow:ne,doTogglePause:$,doResetFailures:O,doDelete:E}}},kk={components:{TabbedPage:kr},setup(){return{tabs:[{id:"live",label:"Live",component:gk},{id:"agents",label:"Agents",component:yk},{id:"loops",label:"Loops",component:xk},{id:"processes",label:"Processes",component:_k},{id:"schedules",label:"Schedules",component:wk}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},Sk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await Y.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Je(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ra,formatDetail:i,truncateBlock:rg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Zu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Tk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Ck={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1);let l=0;const r=h(null),o=h(!1),c=h(new Set),d=h(!1),u=h("all"),f=h(""),p=h("last_active"),g=h(!1),y=Zu,S=Tk,R=h([]),v=h(!1),m=h(""),x=h("flat"),w=h(new Set),_=h(""),A=h(""),T=h(""),C=h(null),L=h(!1);function H(){try{const V=localStorage.getItem("odin-session-presets");V&&(R.value=JSON.parse(V))}catch{}}function M(){try{localStorage.setItem("odin-session-presets",JSON.stringify(R.value))}catch{}}const D=ee(()=>f.value.trim()!==""||u.value!=="all"),K=ee(()=>{let V=[...e.value];const _e=Zu.find(Ye=>Ye.id===u.value),Ie=_e?_e.filters:{};if(Ie.source&&(V=V.filter(Ye=>Ye.source===Ie.source)),Ie.minMessages&&(V=V.filter(Ye=>Ye.message_count>=Ie.minMessages)),Ie.hasCompaction&&(V=V.filter(Ye=>Ye.has_summary)),Ie.maxAge!=null){const Ye=Date.now()/1e3;V=V.filter(ht=>ht.last_active&&Ye-ht.last_active<=Ie.maxAge)}if(f.value.trim()){const Ye=f.value.toLowerCase().trim();V=V.filter(ht=>(ht.channel_id||"").toLowerCase().includes(Ye)||(ht.last_user_id||"").toLowerCase().includes(Ye)||(ht.source||"").toLowerCase().includes(Ye))}const De=p.value,ze=g.value?1:-1;return V.sort((Ye,ht)=>{const ts=Ye[De]||0,Is=ht[De]||0;return(ts-Is)*ze}),V}),ne=ee(()=>{if(!a.value||!a.value.messages)return[];const V=a.value.messages;if(V.length===0)return[];const _e=[];let Ie=[];for(const De of V)De.role==="user"&&Ie.length>0&&(_e.push(Ie),Ie=[]),Ie.push(De);return Ie.length>0&&_e.push(Ie),_e}),$=ee(()=>K.value.length>0&&c.value.size===K.value.length);function O(V){const _e=V.find(Ie=>Ie.role==="user");if(_e&&_e.content){const Ie=_e.content.slice(0,120);return Ie.length<_e.content.length?Ie+"...":Ie}return"(no user message)"}function E(V){const _e=new Set(w.value);_e.has(V)?_e.delete(V):_e.add(V),w.value=_e}function N(V){u.value=V}function B(V){u.value=V.id,V.filters.searchQuery!=null&&(f.value=V.filters.searchQuery),V.filters.sortBy&&(p.value=V.filters.sortBy)}function W(){if(!m.value.trim())return;const V={id:"custom-"+Date.now(),name:m.value.trim(),filters:{searchQuery:f.value,sortBy:p.value}};R.value=[...R.value,V],M(),v.value=!1,m.value=""}function te(V){R.value=R.value.filter(_e=>_e.id!==V),M(),u.value===V&&(u.value="all")}function oe(){u.value="all",f.value="",p.value="last_active",g.value=!1}function Q(V){if(!V)return"—";const _e=Date.now()/1e3-V;if(_e<60)return"just now";if(_e<3600){const De=Math.floor(_e/60);return`${De} minute${De!==1?"s":""} ago`}if(_e<86400){const De=Math.floor(_e/3600);return`${De} hour${De!==1?"s":""} ago`}const Ie=Math.floor(_e/86400);return`${Ie} day${Ie!==1?"s":""} ago`}function he(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function Fe(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString()}catch{return""}}function z(V){return V==="user"?"bg-gray-900/50 border border-gray-800":V==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function pe(V){return V==="user"?"sess-msg-user":V==="assistant"?"sess-msg-assistant":"sess-msg-system"}function de(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":"badge-warning"}function xe(V){return V==="user"?"sess-dot-user":V==="assistant"?"sess-dot-assistant":"sess-dot-system"}function me(V){return V==="user"?"text-cyan-400":V==="assistant"?"text-indigo-400":"text-gray-500"}function Be(V){return V?V.length>2e3?V.slice(0,2e3)+`
... (truncated)`:V:""}async function b(){const V=_.value.trim();if(V){L.value=!0;try{let _e=`/api/sessions/search?q=${encodeURIComponent(V)}&limit=50`;A.value.trim()&&(_e+=`&channel_id=${encodeURIComponent(A.value.trim())}`),T.value.trim()&&(_e+=`&user_id=${encodeURIComponent(T.value.trim())}`);const Ie=await Y.get(_e);C.value=Ie.results||[]}catch{C.value=[]}L.value=!1}}function I(){_.value="",A.value="",T.value="",C.value=null}function F(V){return V?V.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function X(V){return V==="user"?"fts-result-user":V==="assistant"?"fts-result-assistant":V==="summary"?"fts-result-summary":V==="fts"?"fts-result-fts":V==="channel"?"fts-result-channel":"fts-result-default"}function Z(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":V==="summary"?"badge-warning":V==="fts"?"badge-success":"badge-info"}async function J(){t.value=!0,s.value=null;try{e.value=await Y.get("/api/sessions")}catch(V){s.value=V.message}t.value=!1}function ue(){s.value=null,J()}async function re(V){if(n.value===V){n.value=null,a.value=null,w.value=new Set;return}n.value=V,a.value=null,i.value=!0,w.value=new Set;const _e=++l;try{const Ie=await Y.get(`/api/sessions/${encodeURIComponent(V)}`);_e===l&&n.value===V&&(a.value=Ie)}catch(Ie){_e===l&&n.value===V&&(a.value={messages:[],summary:"",error:Ie.message||"Failed to load session"})}finally{_e===l&&(i.value=!1)}}function ie(V){const _e=new Set(c.value);_e.has(V)?_e.delete(V):_e.add(V),c.value=_e}function se(){$.value?c.value=new Set:c.value=new Set(K.value.map(V=>V.channel_id))}function ye(V){r.value=V}async function fe(){if(r.value){o.value=!0;try{await Y.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await J()}catch(V){s.value=V.message||"Failed to clear session"}o.value=!1,r.value=null}}function ge(){d.value=!0}async function we(){if(c.value.size!==0){o.value=!0;try{await Y.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await J()}catch(V){s.value=V.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}function Te(V,_e){const Ie=Y._token;let De=`/api/sessions/${encodeURIComponent(V)}/export?format=${_e}`;Ie&&(De+=`&token=${encodeURIComponent(Ie)}`);const ze=document.createElement("a");ze.href=De,ze.download=`session-${V}.${_e==="text"?"txt":"json"}`,document.body.appendChild(ze),ze.click(),document.body.removeChild(ze)}let Re=null;function Ne(V){V.payload&&V.payload.channel_id&&(clearTimeout(Re),Re=setTimeout(()=>{if(J(),n.value&&V.payload.channel_id===n.value){const _e=n.value,Ie=l;Y.get(`/api/sessions/${encodeURIComponent(_e)}`).then(De=>{Ie!==l||n.value!==_e||(a.value=De)}).catch(()=>{})}},2e3))}let Pe=!1;function Ve(){Pe||(Pe=!0,J(),We.subscribe("events",Ne))}Je(()=>{H(),Ve()}),As(()=>{Ve()});function st(){Pe&&(Pe=!1,We.unsubscribe("events",Ne),clearTimeout(Re))}return Rs(st),_t(st),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:$,bulkClearing:d,activePreset:u,searchQuery:f,sortBy:p,sortAsc:g,filterPresets:y,sortOptions:S,filteredSessions:K,hasActiveFilters:D,customPresets:R,showSavePreset:v,newPresetName:m,threadView:x,threads:ne,collapsedThreads:w,ftsQuery:_,ftsChannelId:A,ftsUserId:T,ftsResults:C,ftsSearching:L,formatAge:Q,formatTimestamp:he,formatFullTimestamp:Fe,messageClass:z,threadMsgClass:pe,roleBadge:de,roleDotClass:xe,roleLabelClass:me,truncateContent:Be,threadSummary:O,fetchSessions:J,retry:ue,toggleSession:re,toggleSelect:ie,toggleSelectAll:se,confirmClear:ye,clearSession:fe,confirmBulkClear:ge,doBulkClear:we,exportSession:Te,applyPreset:N,applyCustomPreset:B,saveCustomPreset:W,removeCustomPreset:te,resetFilters:oe,toggleThread:E,runFtsSearch:b,clearFtsSearch:I,highlightSnippet:F,ftsResultClass:X,ftsTypeBadge:Z}}},Ek={props:["trace"],template:`
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
  `,setup(){return{formatTokens:cg}}},Ak={components:{ContextAssemblyPanel:Ek},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(A){if(!A)return"—";try{const T=new Date(A);return isNaN(T.getTime())?A:T.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return A}}function f(A){return!A&&A!==0?"—":A<1e3?A+"ms":(A/1e3).toFixed(1)+"s"}function p(A){return!A&&A!==0?"—":A>=1e3?(A/1e3).toFixed(1)+"k":String(A)}function g(A){if(!A)return"";if(typeof A=="string")return A;try{return JSON.stringify(A,null,2)}catch{return String(A)}}function y(A){a.value===A?a.value=null:(a.value=A,c.value={})}function S(A,T){const C=A+"-"+T;c.value={...c.value,[C]:!c.value[C]}}function R(A,T){return!!c.value[A+"-"+T]}function v(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,w()}async function m(){try{const A=await Y.get("/api/trajectories");e.value=A.files||[],o.value=A.count||0}catch{}}let x=0;async function w(){const A=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const T=await Y.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(A!==x)return;let C=T.entries||[];d.value.tool_name&&(C=C.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(L=>L.is_error)),d.value.channel_id&&(C=C.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(L=>L.user_id===d.value.user_id)),t.value=C}else{const T=new URLSearchParams;d.value.channel_id&&T.set("channel_id",d.value.channel_id),d.value.user_id&&T.set("user_id",d.value.user_id),d.value.tool_name&&T.set("tool_name",d.value.tool_name),d.value.errors_only&&T.set("errors_only","true"),T.set("limit",String(d.value.limit));const C=T.toString(),L=await Y.get(`/api/trajectories/search/query?${C}`);if(A!==x)return;t.value=L.results||[]}}catch(T){if(A!==x)return;n.value=T.message}A===x&&(s.value=!1)}async function _(){if(!l.value.trim())return;const A=++x;s.value=!0,n.value=null,c.value={};try{const T=await Y.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(A!==x)return;i.value=T.entry||null,i.value||(n.value="No trace found for this message ID")}catch(T){if(A!==x)return;T.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=T.message}A===x&&(s.value=!1)}return Je(async()=>{await m(),await w()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:f,formatTokens:p,formatJSON:g,truncateBlock:rg,toggleExpand:y,toggleIteration:S,isIterationExpanded:R,clearFilters:v,fetchFiles:m,fetchTraces:w,lookupMessage:_}}},Rk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=h("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=ee(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const g=await Y.get("/api/usage");n.value=g,a.value=g.totals||a.value,t.value=null,s.value=!0}catch(g){t.value=g.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function f(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function p(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Je(f),As(f),Rs(p),_t(p),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:og,formatTime:Dc,retry:d}}},Ik={components:{TabbedPage:kr},setup(){return{tabs:[{id:"audit",label:"Audit",component:Sk},{id:"sessions",label:"Sessions",component:Ck},{id:"traces",label:"Traces",component:Ak},{id:"usage",label:"Usage",component:Rk}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Jr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Ok={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=ee(()=>e.value.filter(v=>v.is_core).length),c=ee(()=>e.value.filter(v=>!v.is_core).length),d=ee(()=>Object.values(a.value).reduce((v,m)=>v+m,0));function u(v){for(const m of Jr)if(m.id!=="other"&&m.match(v))return m.id;return"other"}const f=ee(()=>{let v=e.value;if(n.value){const m=n.value.toLowerCase();v=v.filter(x=>x.name.toLowerCase().includes(m)||(x.description||"").toLowerCase().includes(m))}return r.value&&(v=v.filter(m=>u(m.name)===r.value)),v}),p=ee(()=>{const v=new Set;for(const m of e.value)v.add(u(m.name));return Jr.filter(m=>v.has(m.id))}),g=ee(()=>{const v=f.value,m={};for(const w of v){const _=u(w.name);m[_]||(m[_]=[]),m[_].push(w)}const x=[];for(const w of Jr)m[w.id]&&m[w.id].length>0&&x.push({label:w.label,icon:w.icon,tools:m[w.id].sort((_,A)=>_.name.localeCompare(A.name))});return x});function y(v){i.value={...i.value,[v]:!i.value[v]}}async function S(){t.value=!0,s.value=null;try{const[v,m]=await Promise.all([Y.get("/api/tools"),Y.get("/api/tools/stats").catch(()=>({}))]);e.value=v,a.value=m||{};const x=Object.values(m||{}).filter(w=>w>0).sort((w,_)=>w-_)}catch(v){s.value=v.message}t.value=!1}function R(){S()}return Je(()=>{S()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:f,groupedTools:g,usedCategories:p,truncate:Mc,toggleExpand:y,refresh:R}}};function Lk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Nk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Dk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),f=h(null),p=h(null),g=h(!1),y=h(null),S=h(null),R=h(!1),v=ee(()=>e.value.length),m=ee(()=>e.value.reduce((Q,he)=>Q+(he.execution_count||0),0)),x=ee(()=>e.value.reduce((Q,he)=>Q+L(he.code),0)),w=ee(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(he=>he.name.toLowerCase().includes(Q)||(he.description||"").toLowerCase().includes(Q))}),_=ee(()=>u.value?u.value.split(`
`).length:0),A=ee(()=>{const Q=Math.max(_.value,1);return Array.from({length:Q},(he,Fe)=>Fe+1).join(`
`)}),T=ee(()=>{const Q=u.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(Q){return Lk(Q)}function L(Q){return Q?Q.split(`
`).length:0}function H(Q){return Nk(Q)}function M(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function D(Q){try{await navigator.clipboard.writeText(Q);const he=e.value.find(Fe=>Fe.code===Q);he&&(r.value=he.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function K(Q){if(Q.key==="Tab"){Q.preventDefault();const he=Q.target,Fe=he.selectionStart,z=he.selectionEnd;u.value=u.value.substring(0,Fe)+"    "+u.value.substring(z),Ot(()=>{he.selectionStart=he.selectionEnd=Fe+4})}}function ne(Q){const he=Q.target.previousElementSibling;he&&(he.scrollTop=Q.target.scrollTop)}async function $(){t.value=!0,s.value=null;try{e.value=await Y.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function O(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const he=await Y.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:he}}catch(he){a.value={...a.value,[Q]:{result:he.message,is_error:!0}}}i.value=null}function E(){o.value=!0,c.value="create",d.value="",u.value="",f.value=null,p.value=null}function N(Q){o.value=!0,c.value="edit",d.value=Q.name,u.value=Q.code||"",f.value=null,p.value=null}function B(){o.value=!1,f.value=null,p.value=null}async function W(){f.value=null,p.value=null;const Q=d.value.trim(),he=u.value.trim();if(!Q){f.value="Name is required";return}if(!he){f.value="Code is required";return}g.value=!0;try{c.value==="create"?(await Y.post("/api/skills",{name:Q,code:he}),p.value="Skill created successfully"):(await Y.put(`/api/skills/${encodeURIComponent(Q)}`,{code:he}),p.value="Skill updated successfully"),await $(),setTimeout(()=>{o.value=!1},800)}catch(Fe){f.value=Fe.message}g.value=!1}function te(Q){S.value=Q}async function oe(){if(S.value){R.value=!0;try{await Y.del(`/api/skills/${encodeURIComponent(S.value)}`),await $()}catch(Q){Se.error(`Failed to delete skill: ${Q.message||"unknown error"}`)}R.value=!1,S.value=null}}return Je(()=>{$()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:f,editSuccess:p,saving:g,editorRef:y,deleteTarget:S,deleting:R,enabledCount:v,totalExecutions:m,totalLines:x,displayedSkills:w,editLineCount:_,editorLineNums:A,editValidation:T,highlight:C,truncate:Mc,formatTs:ra,countLines:L,getLineNumbers:H,toggleCode:M,copyCode:D,handleEditorKey:K,syncScroll:ne,fetchSkills:$,testSkill:O,showCreate:E,editSkill:N,cancelEdit:B,saveSkill:W,confirmDelete:te,doDelete:oe}}};function Mk(e,t){if(!e||!t)return Eu(e);const s=Eu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Pk={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),f=h(null),p=h(!1),g=h(null),y=h(null);let S=null;const R=h(null),v=h(!1),m=h({}),x=h({}),w=h(null),_=h(null),A=ee(()=>e.value.reduce((E,N)=>E+(N.chunks||0),0)),T=ee(()=>new Set(e.value.map(N=>N.uploader).filter(Boolean)).size);function C(E,N){const B=x.value[N];if(!B||B.length===0)return 0;const W=Math.max(...B.map(te=>te.char_count||0));return W===0?0:Math.round(E.char_count/W*100)}async function L(){t.value=!0,s.value=null;try{const E=await Y.get("/api/knowledge");e.value=Array.isArray(E)?E:[]}catch(E){s.value=E.message}t.value=!1}async function H(E){if(m.value[E]){m.value[E]=!1,_.value=null;return}if(m.value[E]=!0,!(x.value[E]||w.value===E)){w.value=E;try{const N=await Y.get(`/api/knowledge/${encodeURIComponent(E)}/chunks`);x.value[E]=Array.isArray(N)?N:[]}catch(N){x.value[E]=[],Se.error(`Failed to load chunks: ${N.message}`)}w.value=null}}async function M(){const E=n.value.trim();if(E){i.value=!0,r.value=null,l.value=E;try{const N=await Y.get(`/api/knowledge/search?q=${encodeURIComponent(E)}`);a.value=Array.isArray(N)?N:[]}catch(N){a.value=[],r.value=N.message||"Search failed"}i.value=!1}}function D(){a.value=null,n.value="",r.value=null}async function K(){u.value=null,f.value=null;const E=c.value.trim(),N=d.value.trim();if(!E){u.value="Source name is required";return}if(!N){u.value="Content is required";return}p.value=!0;try{const B=await Y.post("/api/knowledge",{source:E,content:N});f.value=`Ingested ${B.chunks||0} chunks from "${E}"`,c.value="",d.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,f.value=null},1500)}catch(B){u.value=B.message}p.value=!1}async function ne(E){g.value=E,y.value=null,S&&(clearTimeout(S),S=null);try{const N=await Y.post(`/api/knowledge/${encodeURIComponent(E)}/reingest`);y.value={source:E,error:!1,message:`Re-ingested ${N.chunks||0} chunks`},delete x.value[E],await L(),S=setTimeout(()=>{y.value=null,S=null},3e3)}catch(N){y.value={source:E,error:!0,message:N.message}}g.value=null}function $(E){R.value=E}async function O(){if(R.value){v.value=!0;try{await Y.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete x.value[R.value],await L()}catch(E){Se.error(`Failed to delete source: ${E.message||"unknown error"}`)}v.value=!1,R.value=null}}return Je(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:f,ingesting:p,reingesting:g,reingestResult:y,deleteTarget:R,deleting:v,expanded:m,sourceChunks:x,loadingChunks:w,selectedChunk:_,totalChunks:A,uploaderCount:T,truncate:Mc,formatTs:ra,highlightTerms:Mk,chunkBarWidth:C,fetchSources:L,toggleSource:H,doSearch:M,clearSearch:D,doIngest:K,doReingest:ne,confirmDelete:$,doDelete:O}}},Fk={template:`
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
                    <button @click="copyValue(scope.name, entry)" class="btn btn-ghost text-xs">
                      {{ copied === scope.name + '/' + entry.key ? 'Copied!' : 'Copy' }}
                    </button>
                    <button @click="startEdit(scope.name, entry.key, entry.value)" class="btn btn-ghost text-xs">Edit</button>
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),f=h(null),p=h(""),g=h(!1),y=h(null),S=h(null),R=h(new Set),v=h(null),m=h(!1),x=h(!1),w=ee(()=>e.value.reduce((te,oe)=>te+oe.count,0)),_=ee(()=>R.value.size);function A(te){const oe=t.value[te];if(!oe)return[];if(!l.value.trim())return oe;const Q=l.value.trim().toLowerCase();return oe.filter(he=>he.key.toLowerCase().includes(Q)||he.value&&he.value.toLowerCase().includes(Q))}function T(te,oe){return R.value.has(te+"/"+oe)}function C(te,oe){const Q=te+"/"+oe,he=new Set(R.value);he.has(Q)?he.delete(Q):he.add(Q),R.value=he}function L(te){const oe=t.value[te];return!oe||oe.length===0?!1:oe.every(Q=>R.value.has(te+"/"+Q.key))}function H(te,oe){const Q=t.value[te];if(!Q)return;const he=new Set(R.value);for(const Fe of Q){const z=te+"/"+Fe.key;oe?he.add(z):he.delete(z)}R.value=he}async function M(){s.value=!0,n.value=null;try{const te=await Y.get("/api/memory");e.value=Object.entries(te).map(([oe,Q])=>({name:oe,keys:Q.keys||[],count:Q.count||0}))}catch(te){n.value=te.message}s.value=!1}async function D(te){if(a.value[te]){a.value[te]=!1;return}a.value[te]=!0;const oe=e.value.find(he=>he.name===te);if(!oe||t.value[te]||i.value===te)return;i.value=te;const Q=await Promise.all(oe.keys.map(async he=>{try{const Fe=await Y.get(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(he)}`);return{key:he,value:Fe.value||""}}catch{return{key:he,value:"(error loading)"}}}));t.value[te]=Q,i.value=null}function K(te,oe,Q){f.value=te+"/"+oe,p.value=Q}async function ne(te,oe){g.value=!0,y.value=null;try{await Y.put(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(oe)}`,{value:p.value});const Q=t.value[te];if(Q){const he=Q.find(Fe=>Fe.key===oe);he&&(he.value=p.value)}f.value=null}catch(Q){y.value=`Failed to save: ${Q.message||"unknown error"}`}g.value=!1}async function $(te,oe){try{await navigator.clipboard.writeText(oe.value),S.value=te+"/"+oe.key,setTimeout(()=>{S.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const te=o.value.scope.trim(),oe=o.value.key.trim(),Q=o.value.value.trim();if(!te){d.value="Scope is required";return}if(!oe){d.value="Key is required";return}if(!Q){d.value="Value is required";return}c.value=!0;try{await Y.put(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(oe)}`,{value:Q}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await M(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(he){d.value=he.message}c.value=!1}function E(te,oe){v.value={scope:te,key:oe}}async function N(){if(!v.value)return;m.value=!0,y.value=null;const{scope:te,key:oe}=v.value;try{await Y.del(`/api/memory/${encodeURIComponent(te)}/${encodeURIComponent(oe)}`);const Q=t.value[te];Q&&(t.value[te]=Q.filter(z=>z.key!==oe));const he=e.value.find(z=>z.name===te);he&&(he.count--,he.keys=he.keys.filter(z=>z!==oe));const Fe=new Set(R.value);Fe.delete(te+"/"+oe),R.value=Fe}catch(Q){y.value=`Failed to delete: ${Q.message||"unknown error"}`}m.value=!1,v.value=null}function B(){x.value=!0}async function W(){m.value=!0,y.value=null;const te=[];for(const oe of R.value){const Q=oe.indexOf("/");te.push({scope:oe.slice(0,Q),key:oe.slice(Q+1)})}try{await Y.post("/api/memory/bulk-delete",{entries:te}),R.value=new Set,t.value={},await M()}catch(oe){y.value=`Bulk delete failed: ${oe.message||"unknown error"}`}m.value=!1,x.value=!1}return Je(()=>{M()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:f,editValue:p,saving:g,actionError:y,copied:S,selected:R,selectedCount:_,totalEntries:w,deleteTarget:v,deleting:m,showBulkDelete:x,fetchMemory:M,toggleScope:D,startEdit:K,doEdit:ne,copyValue:$,doAdd:O,confirmDelete:E,doDelete:N,confirmBulkDelete:B,doBulkDelete:W,isSelected:T,toggleSelect:C,isScopeAllSelected:L,toggleSelectAll:H,filteredEntries:A}}},$k={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=ee(()=>[...new Set(e.value.map(S=>S.category))].sort()),o=ee(()=>{const y={};return e.value.forEach(S=>{y[S.category]=(y[S.category]||0)+1}),y}),c=ee(()=>a.value?e.value.filter(y=>y.category===a.value):e.value);function d(y){return y==="correction"?"badge-warning":y==="operational"?"badge-info":y==="preference"?"badge-success":"badge-info"}function u(y){i.value=y.key,l.value=y.content}async function f(y){try{await Y.put("/api/learned/"+encodeURIComponent(y),{content:l.value}),i.value=null,Se.success("Entry updated"),await g()}catch(S){Se.error(S.message||"Failed to save entry")}}async function p(y){if(await bs({title:"Delete learned entry",message:`Delete "${y}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await Y.del("/api/learned/"+encodeURIComponent(y)),Se.success("Entry deleted"),await g()}catch(R){Se.error(R.message||"Failed to delete entry")}}async function g(){s.value=!0,n.value=null;try{const y=await Y.get("/api/learned");e.value=y.entries||[],t.value={last_reflection:y.last_reflection,count:y.count}}catch(y){n.value=y.message}s.value=!1}return Je(g),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ra,startEdit:u,saveEdit:f,deleteEntry:p,fetchEntries:g}}},Uk={components:{TabbedPage:kr},setup(){return{tabs:[{id:"tools",label:"Tools",component:Ok},{id:"skills",label:"Skills",component:Dk},{id:"knowledge",label:"Knowledge",component:Pk},{id:"memory",label:"Memory",component:Fk},{id:"learned",label:"Learned",component:$k}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Bk={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),f=h(!1),p=h(!1),g=ee(()=>e.value==="custom"),y=ee(()=>[...i.value,...l.value]),S=ee(()=>l.value.includes(e.value)),R=ee(()=>{var T;return g.value?t.value||"Odin":((T=a.value[e.value])==null?void 0:T.name)||e.value}),v=ee(()=>{var T;return g.value?s.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.identity)||""}),m=ee(()=>{var T;return g.value?n.value||"(empty — will use Odin default)":((T=a.value[e.value])==null?void 0:T.voice)||""});async function x(){d.value=!0;try{const T=await Y.get("/api/personality");e.value=T.preset||"odin",t.value=T.custom_name||"",s.value=T.custom_identity||"",n.value=T.custom_voice||"",a.value=T.presets||{},i.value=T.builtin_presets||[],l.value=T.user_presets||[]}catch(T){c.value=T.message}finally{d.value=!1}}async function w(){r.value=!0,c.value=null,o.value=!1;try{await Y.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(T){c.value=T.message}finally{r.value=!1}}async function _(){const T=u.value.trim();if(T){p.value=!0,c.value=null;try{await Y.post("/api/personality/presets",{name:T,display_name:R.value,identity:v.value,voice:m.value}),f.value=!1,u.value="",await x(),e.value=T.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{p.value=!1}}}async function A(){if(await bs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await Y.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(C){c.value=C.message}}}return Je(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:y,isCustom:g,isUserPreset:S,previewName:R,previewIdentity:v,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:w,showSavePreset:f,newPresetName:u,savingPreset:p,saveAsPreset:_,deletePreset:A,builtinPresets:i,userPresets:l}},template:`
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
  `},Hk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Vk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},jk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},zk={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=h(!1),i=ee(()=>e.value.components||[]),l=ee(()=>jk[e.value.overall]||"text-gray-400"),r=ee(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=ee(()=>{const _=e.value.overall;return _==="healthy"?"All Systems Healthy":_==="degraded"?"Some Systems Degraded":_==="unhealthy"?"System Issues Detected":"Unknown"});function c(_){return Hk[_]||"text-gray-400"}function d(_){return Vk[_]||"info"}function u(_){return _==="ok"?"badge-success":_==="degraded"?"badge-warning":_==="down"?"badge-danger":"badge-info"}function f(_){return _==="closed"?"text-green-400":_==="half_open"?"text-yellow-400":_==="open"?"text-red-400":"text-gray-400"}function p(_){return _.replace(/_/g," ").replace(/\b\w/g,A=>A.toUpperCase())}function g(_){if(!_)return"—";try{return new Date(_).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return _}}function y(_){return _>=1e6?(_/1e6).toFixed(1)+"M":_>=1e3?(_/1e3).toFixed(1)+"K":String(_)}async function S(){a.value=!0;try{e.value=await Y.get("/api/health/components"),s.value=null,n.value=!0}catch(_){s.value=_.message}finally{t.value=!1,a.value=!1}}function R(){t.value=!0,s.value=null,S()}let v=null,m=!1;function x(){m||(m=!0,S(),v||(v=setInterval(S,3e4)))}function w(){m&&(m=!1,v&&(clearInterval(v),v=null))}return Je(x),As(x),Rs(w),_t(w),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:f,formatName:p,formatTime:g,formatNumber:y,fetchHealth:S,retry:R}}},qk={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h(!1),a=h("sessions"),i=h(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=ee(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=ee(()=>{if(!i.value)return[];const S=i.value,R=S.storage_total_bytes||1;return[{label:"Session Persistence",mb:S.sessions.persist_dir.total_mb,bytes:S.sessions.persist_dir.total_bytes,files:S.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(S.sessions.persist_dir.total_bytes/R*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:S.knowledge.db_file.total_mb,bytes:S.knowledge.db_file.total_bytes,files:S.knowledge.db_file.file_count,pct:Math.min(100,Math.round(S.knowledge.db_file.total_bytes/R*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:S.trajectories.message_dir.total_mb,bytes:S.trajectories.message_dir.total_bytes,files:S.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(S.trajectories.message_dir.total_bytes/R*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:S.trajectories.agent_dir.total_mb,bytes:S.trajectories.agent_dir.total_bytes,files:S.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(S.trajectories.agent_dir.total_bytes/R*100)),color:"res-bar-amber"}]});async function d(){try{const S=await Y.get("/api/resource-usage");i.value=S,t.value=null,s.value=!0}catch(S){t.value=S.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function f(){e.value=!0,t.value=null,d()}let p=!1;function g(){p||(p=!0,d(),l||(l=setInterval(d,3e4)))}function y(){p&&(p=!1,l&&(clearInterval(l),l=null))}return Je(g),As(g),Rs(y),_t(y),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:og,refresh:u,retry:f}}},Gk=["INFO","WARNING","ERROR"],Kk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Yr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Wk=[50,100,200,500],Zk={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(We.state||"disconnected"),c=ee(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),f=h(null),p=2e3,g=Gk,y=Kk,S=Yr,R=h("all"),v=h(""),m=h([]),x=h(!1),w=h(""),_=h([]);function A(){try{const U=localStorage.getItem("odin-log-presets");U&&(m.value=JSON.parse(U))}catch{}}function T(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=ee(()=>a.value!==""||i.value.trim()!==""||v.value!==""),L=ee(()=>{const U=Yr.find(le=>le.value===v.value);return U?U.label:""}),H=ee(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(U){return U.message}}),M=24,D=ee(()=>{if(t.value.length===0)return[];const U=[],le=new Date,Oe=3600*1e3;for(let lt=M-1;lt>=0;lt--){const pt=new Date(le.getTime()-(lt+1)*Oe),ss=new Date(le.getTime()-lt*Oe);U.push({start:pt,end:ss,label:O(pt,ss),shortLabel:ss.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const lt of t.value){if(!lt._time)continue;const pt=lt._time.getTime();for(const ss of U)if(pt>=ss.start.getTime()&&pt<ss.end.getTime()){ss.total++,lt.level==="ERROR"?ss.errors++:lt.level==="WARNING"?ss.warnings++:ss.info++;break}}return U}),K=ee(()=>{let U=1;for(const le of D.value)le.total>U&&(U=le.total);return U}),ne=ee(()=>D.value.length===0?"":"Last 24 hours"),$=ee(()=>Math.ceil(M/8));function O(U,le){const Oe={hour:"2-digit",minute:"2-digit"};return U.toLocaleTimeString([],Oe)+" - "+le.toLocaleTimeString([],Oe)}function E(U,le){return!le||!U?"0px":Math.max(2,U/le*100)+"%"}function N(U){const le=B.value.findIndex(Oe=>Oe._time&&Oe._time.getTime()>=U.start.getTime()&&Oe._time.getTime()<U.end.getTime());if(le>=0&&d.value){const Oe=d.value.querySelectorAll(".log-line");Oe[le]&&(Oe[le].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const B=ee(()=>{let U=t.value;if(a.value&&(U=U.filter(le=>(le.level||"INFO")===a.value)),v.value){const le=Yr.find(Oe=>Oe.value===v.value);if(le&&le.seconds){const Oe=new Date(Date.now()-le.seconds*1e3);U=U.filter(lt=>lt._time&&lt._time>=Oe)}}if(i.value&&!H.value)if(l.value)try{const le=new RegExp(i.value,"i");U=U.filter(Oe=>{const lt=Oe.text||Oe.raw||"",pt=Oe.tool||"";return le.test(lt)||le.test(pt)})}catch{}else{const le=i.value.toLowerCase();U=U.filter(Oe=>{const lt=(Oe.text||Oe.raw||"").toLowerCase(),pt=(Oe.tool||"").toLowerCase();return lt.includes(le)||pt.includes(le)})}return U});function W(U){if(U.type==="log"&&U.line)try{const le=typeof U.line=="string"?JSON.parse(U.line):U.line,Oe=le.timestamp?new Date(le.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(U.line),tool:"",raw:String(U.line)}}if(U.payload){const le=U.payload,Oe=le.timestamp?new Date(le.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:le.error?"ERROR":"INFO",text:le.tool_name?`[${le.tool_name}] ${le.result_summary||""}`.trim():le.message||JSON.stringify(le),tool:le.tool_name||"",raw:null}}return typeof U=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:U,tool:"",raw:U}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(U),tool:"",raw:null}}function te(U){const le=W(U);if(s.value){_.value.push(le);return}oe(le)}function oe(U){t.value.push(U),t.value.length>p&&(t.value=t.value.slice(-p)),n.value&&Ot(()=>Q())}function Q(U=!1){const le=d.value;le&&le.scrollTo({top:le.scrollHeight,behavior:U?"smooth":"instant"})}function he(){n.value=!0,u.value=!1,Ot(()=>Q(!0))}const Fe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function z(){const U=d.value;if(!U)return;const le=U.scrollHeight-U.scrollTop-U.clientHeight<40;u.value=!n.value&&!le&&t.value.length>0,me.value&&pe()}function pe(){const U=d.value;!U||!n.value||U.scrollHeight-U.scrollTop-U.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function de(){n.value&&requestAnimationFrame(pe)}function xe(U){Fe.has(U.key)&&de()}const me=h(!1);function Be(){n.value&&(me.value=!0,requestAnimationFrame(pe))}function b(){me.value&&(me.value=!1,pe())}function I(){n.value&&(u.value=!1,Ot(()=>Q()))}function F(){if(s.value=!s.value,!s.value&&_.value.length>0){for(const U of _.value)oe(U);_.value=[]}}function X(){t.value=[],_.value=[],u.value=!1}function Z(){let U;e.value==="search"?U=Ye.value.map(pt=>{const ss=pt.error?"ERROR":"INFO",ps=pt.tool_name?`[${pt.tool_name}] `:"";return`${pt.timestamp||""} ${ss} ${ps}${pt.result_summary||pt.message||""}`}).join(`
`):U=B.value.map(pt=>`${pt.ts} ${pt.level} ${pt.text}`).join(`
`);const le=new Blob([U],{type:"text/plain"}),Oe=URL.createObjectURL(le),lt=document.createElement("a");lt.href=Oe,lt.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,lt.click(),URL.revokeObjectURL(Oe)}function J(U,le){const Oe=`${U.ts} ${U.level} ${U.text||U.raw||""}`;navigator.clipboard.writeText(Oe).then(()=>{f.value=le,setTimeout(()=>{f.value=null},1500)}).catch(()=>{})}function ue(U){a.value=a.value===U?"":U,R.value="all"}function re(U){return U.level==="ERROR"?"log-line-error":U.level==="WARNING"?"log-line-warning":"text-gray-300"}function ie(U){return U==="ERROR"?"text-red-500 font-semibold":U==="WARNING"?"text-yellow-500":"text-blue-500"}function se(U){return U==="ERROR"?"log-chip-error":U==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(U){R.value=U.id;const le=U.filters;a.value=le.level||"",v.value=le.timeRange||"",i.value=le.text||"",le.levels&&(a.value=le.levels[0]||""),le.hasToolName&&(i.value="")}function fe(U){R.value=U.id,a.value=U.filters.level||"",v.value=U.filters.timeRange||"",i.value=U.filters.text||""}function ge(){if(!w.value.trim())return;const U={id:"custom-"+Date.now(),name:w.value.trim(),filters:{level:a.value,timeRange:v.value,text:i.value}};m.value=[...m.value,U],T(),x.value=!1,w.value=""}function we(U){m.value=m.value.filter(le=>le.id!==U),T(),R.value===U&&(R.value="all")}const Te=h("all"),Re=h(""),Ne=h(""),Pe=h(""),Ve=h(""),st=h(""),V=h(100),_e=Wk,Ie=h(!1),De=h(!1),ze=h(""),Ye=h([]),ht=h(null),ts=h(null);function Is(){e.value="search",ht.value||Ps()}async function Ps(){try{ht.value=await Y.get("/api/logs/stats")}catch{}}function Fs(){const U=st.value;if(!U){Pe.value="",Ve.value="";return}const Oe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[U];if(Oe){const lt=new Date(Date.now()-Oe*1e3);Pe.value=us(lt),Ve.value=""}}function us(U){const le=Oe=>String(Oe).padStart(2,"0");return`${U.getFullYear()}-${le(U.getMonth()+1)}-${le(U.getDate())}T${le(U.getHours())}:${le(U.getMinutes())}`}function q(U){if(!U)return"";const le=new Date(U);return isNaN(le.getTime())?"":le.toISOString()}async function Ee(){Ie.value=!0,ze.value="",De.value=!0,ts.value=null;try{const U=new URLSearchParams;Te.value&&Te.value!=="all"&&U.set("level",Te.value),Re.value&&U.set("tool",Re.value),Ne.value&&U.set("q",Ne.value);const le=q(Pe.value),Oe=q(Ve.value);le&&U.set("start",le),Oe&&U.set("end",Oe),U.set("limit",String(V.value));const lt=await Y.get(`/api/logs/search?${U.toString()}`);Ye.value=lt.entries||[]}catch(U){ze.value=U.message||"Search failed",Ye.value=[]}finally{Ie.value=!1}}function fs(){Te.value="all",Re.value="",Ne.value="",Pe.value="",Ve.value="",st.value="",V.value=100,Ye.value=[],De.value=!1,ze.value="",ts.value=null}function Zs(U){ts.value=ts.value===U?null:U}function ca(U){if(!U.timestamp)return"";try{return new Date(U.timestamp).toLocaleString()}catch{return U.timestamp}}function wn(U){return U.type==="web_action"?`${U.status||""} (${U.execution_time_ms||0}ms)`:(U.result_summary||"").slice(0,200)}function Js(U){return U.error?"log-line-error":"text-gray-300"}function P(U){try{return JSON.stringify(U,null,2)}catch{return String(U)}}let j=null,ae=null,ke=!1;function Ce(){ke||(ke=!0,We.subscribe("logs",te),r.value=We.connected,o.value=We.state||"disconnected",j=We.onStateChange,ae=(U,le)=>{o.value=U,r.value=U==="connected",j&&j(U,le)},We.onStateChange=ae)}function Et(){ke&&(ke=!1,We.unsubscribe("logs",te),We.onStateChange===ae&&(We.onStateChange=j),ae=null,j=null)}return Je(()=>{A(),window.addEventListener("pointerup",b),window.addEventListener("pointercancel",b)}),As(Ce),Rs(Et),_t(()=>{Et(),window.removeEventListener("pointerup",b),window.removeEventListener("pointercancel",b)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:B,pauseBuffer:_,showJumpBottom:u,copiedIndex:f,regexError:H,levels:g,logPresets:y,timeRanges:S,timeRange:v,activeLogPreset:R,customLogPresets:m,showSaveLogPreset:x,newLogPresetName:w,hasActiveLogFilters:C,timeRangeLabel:L,timelineBuckets:D,timelineMax:K,timelineSpanLabel:ne,timelineLabelSkip:$,togglePause:F,clearLogs:X,exportLogs:Z,logLineClass:re,levelClass:ie,levelChipClass:se,toggleLevel:ue,copyLine:J,jumpToBottom:he,onScroll:z,onUserScrollIntent:de,onUserScrollKey:xe,onAutoScrollToggle:I,onPointerDown:Be,applyLogPreset:ye,applyCustomLogPreset:fe,saveLogCustomPreset:ge,removeLogCustomPreset:we,segmentHeight:E,jumpToTimelineBucket:N,searchLevel:Te,searchTool:Re,searchKeyword:Ne,searchStart:Pe,searchEnd:Ve,searchTimePreset:st,searchLimit:V,searchLimits:_e,searching:Ie,searchRan:De,searchError:ze,searchResults:Ye,searchStats:ht,expandedSearch:ts,switchToSearch:Is,runSearch:Ee,clearSearchFilters:fs,toggleSearchExpand:Zs,formatSearchTs:ca,searchEntryText:wn,searchLogLineClass:Js,formatJson:P,applySearchTimePreset:Fs}}},Cg="••••••••",Jk={timezone:{apply_mode:"restart",description:"Locale and scheduling defaults used across Odin."},discord:{apply_mode:"live_read",description:"Global Discord defaults. Guild and channel overrides take precedence."},llm_provider:{apply_mode:"live_apply",owner:"llm",description:"Active language-model provider and failover ownership."},openai_codex:{apply_mode:"live_apply",owner:"llm",description:"Codex models, reasoning, transport, and pool behaviour."},ollama:{apply_mode:"restart",owner:"llm",description:"Local or remote Ollama provider settings."},kimi:{apply_mode:"restart",owner:"llm",description:"Kimi provider settings and request limits."},context:{apply_mode:"restart",description:"System-prompt sources and prompt-budget controls."},sessions:{apply_mode:"restart",description:"Conversation persistence, retention, and history limits."},tools:{apply_mode:"restart",description:"Execution policy, hosts, timeouts, pools, and recovery."},logging:{apply_mode:"restart",description:"Runtime log verbosity and storage policy."},usage:{apply_mode:"activation_required",description:"Usage accounting and durable history storage."},webhook:{apply_mode:"restart",description:"Inbound webhook listener and authentication policy."},learning:{apply_mode:"restart",description:"Reflection, consolidation, and learned-context limits."},observability:{apply_mode:"live_read",description:"Metrics, tracing, and failure-classification controls."},email:{apply_mode:"restart",description:"SMTP and IMAP behaviour for email tools."},search:{apply_mode:"restart",description:"Knowledge and history search backends."},browser:{apply_mode:"restart",description:"Browser automation limits and viewport defaults."},permissions:{apply_mode:"restart",description:"Default and per-user execution policy."},comfyui:{apply_mode:"live_read",description:"ComfyUI image backend connection settings."},image:{apply_mode:"live_read",description:"Image routing and native generation policy."},web:{apply_mode:"restart",description:"Management API listener, authentication, and sessions."},attachments:{apply_mode:"live_read",description:"Attachment limits, paths, and cleanup policy."},personality:{apply_mode:"live_read",owner:"personality",description:"Response identity, style, and personality presets."},reaction_triggers:{apply_mode:"activation_required",owner:"reaction_triggers",description:"Discord reaction event automation."},message_triggers:{apply_mode:"activation_required",owner:"message_triggers",description:"Discord message event automation."},mcp:{apply_mode:"activation_required",owner:"mcp",description:"Model Context Protocol servers and tool publication."},slack:{apply_mode:"restart",description:"Slack destinations and internal alert forwarding."},issue_tracker:{apply_mode:"activation_required",owner:"issue_tracker",description:"Issue tracker provider and tool lifecycle."},audit:{apply_mode:"restart",description:"Audit signing, verification, and retention."},agents:{apply_mode:"live_for_new_work",description:"Spawned-agent budgets, inheritance, and tree limits."},grafana_alerts:{apply_mode:"activation_required",owner:"grafana_alerts",description:"Grafana alert intake, routing, and remediation."},outbound_webhooks:{apply_mode:"live_apply",owner:"outbound_webhooks",description:"Outbound event targets, delivery, and safety policy."},graceful_degradation:{apply_mode:"activation_required",description:"Subsystem failure thresholds and request guarding."},llm_recovery:{apply_mode:"restart",description:"Provider recovery, breaker, and retry policy."},turn_state:{apply_mode:"restart",description:"Durable turn checkpoints, expiry, and resume behaviour."}},Ju={timezone:{label:"Timezone",description:"Timezone used in prompts and scheduled-time parsing.",consumers:[{name:"Prompt context",apply_mode:"live_read",detail:"Future prompts read the configured value."},{name:"Time parser",apply_mode:"restart",detail:"The parser currently captures the boot value."}],restart_reason:"The scheduling parser captures timezone during startup."},"discord.token":{owner:"secrets",sensitivity:"sensitive",description:"Write-only Discord bot credential."},"discord.allowed_users":{description:"Global allowlist of Discord user IDs. An empty list allows all users."},"discord.channels":{description:"Global allowlist of Discord channel IDs. An empty list allows all channels."},"discord.require_mention":{description:"Require a mention by default unless a guild or channel override says otherwise."},"discord.respond_to_bots":{description:"Allow replies to bot-authored messages by default."},"llm_provider.active_provider":{enum:["codex","ollama","kimi"],description:"Provider used for new primary requests."},"openai_codex.enabled":{apply_mode:"live_apply",description:"Enable or disable the primary Codex client through the dedicated Codex reload path."},"openai_codex.model":{apply_mode:"live_apply",description:"Primary Codex model. Spawned agents may inherit it directly; chat and loops require a Codex reload.",consumers:[{name:"Spawned agents inheriting the main model",apply_mode:"live_read",detail:"Future agent generations read the configured model at call time."},{name:"Chat and autonomous loops",apply_mode:"live_apply",detail:"The dedicated Codex endpoint reloads the live client."}]},"openai_codex.max_tokens":{apply_mode:"live_apply",constraints:{minimum:1,maximum:128e3},unit:"tokens",description:"Maximum Codex response tokens; requires the dedicated Codex reload path."},"openai_codex.reasoning_effort":{apply_mode:"live_apply",description:"Main Codex reasoning effort; requires the dedicated Codex reload path."},"openai_codex.agent_reasoning_effort":{apply_mode:"live_read",description:"Reasoning policy for spawned-agent generations; future generations read it at call time."},"openai_codex.agent_model":{apply_mode:"live_read",description:"Model policy for spawned-agent generations; future generations read it at call time."},"openai_codex.credentials_path":{owner:"secrets",sensitivity:"sensitive",apply_mode:"restart",description:"Write-only Codex credential-store path; an existing client cannot switch stores live.",restart_reason:"The credential pool is constructed from this path when the Codex client starts."},"openai_codex.request_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Whole-request timeout; requires the dedicated Codex reload path."},"openai_codex.stream_stall_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Maximum silent-stream interval; requires the dedicated Codex reload path."},"openai_codex.retry.max_retries":{apply_mode:"live_apply",description:"Retry-attempt ceiling; requires the dedicated Codex reload path."},"openai_codex.retry.base_delay":{apply_mode:"live_apply",unit:"seconds",description:"Initial retry delay; requires the dedicated Codex reload path."},"openai_codex.retry.max_delay":{apply_mode:"live_apply",unit:"seconds",description:"Maximum retry delay; requires the dedicated Codex reload path."},"openai_codex.connection_pool.max_connections":{apply_mode:"restart",description:"Maximum Codex transport connections.",restart_reason:"Connection-pool sizing is fixed when the live client transport is constructed."},"openai_codex.connection_pool.keepalive_timeout":{apply_mode:"restart",unit:"seconds",description:"Codex connection keepalive timeout.",restart_reason:"Connection-pool keepalive policy is fixed when the live client transport is constructed."},"openai_codex.context_compression.enabled":{apply_mode:"restart",description:"Enable context compression for chat and agent tool loops.",restart_reason:"The context-compressor holder is constructed at startup and has no live apply path."},"openai_codex.context_compression.max_context_chars":{apply_mode:"restart",unit:"characters",description:"Context size at which compression begins.",restart_reason:"The context-compressor holder retains its startup configuration."},"openai_codex.context_compression.keep_recent_iterations":{apply_mode:"restart",unit:"iterations",description:"Recent tool iterations preserved during compression.",restart_reason:"The context-compressor holder retains its startup configuration."},"logging.level":{enum:["DEBUG","INFO","WARNING","ERROR","CRITICAL"],description:"Minimum runtime log level."},"browser.default_timeout_ms":{constraints:{minimum:1e3},unit:"ms",description:"Default browser operation timeout."},"browser.viewport_width":{constraints:{minimum:100,maximum:7680},unit:"px"},"browser.viewport_height":{constraints:{minimum:100,maximum:4320},unit:"px"},"sessions.max_history":{constraints:{minimum:1,maximum:1e4},unit:"messages"},"sessions.max_age_hours":{constraints:{minimum:1},unit:"hours"},"tools.command_timeout_seconds":{constraints:{minimum:10,maximum:3600},unit:"seconds"},"agents.max_children_per_agent":{apply_mode:"activation_required",description:"Child limit adopted by newly spawned parent agents after explicit activation.",activation_policy:"Explicitly apply the configured limit after reviewing worst-case tree breadth."},"context.max_system_prompt_tokens":{apply_mode:"activation_required",description:"Optional hard budget for future assembled system prompts.",activation_policy:"Preview mandatory prompt usage and omissions before applying the budget."},"usage.directory":{apply_mode:"activation_required",description:"Target for durable usage history; currently no durable store is active.",activation_policy:"Validate the path and explicitly enable durable usage history."},"slack.forward_alerts":{apply_mode:"activation_required",description:"Forward normalized internal alerts to tested Slack destinations.",activation_policy:"Requires an effective notifier, tested destination, and activation receipt."},"grafana_alerts.enabled":{apply_mode:"activation_required",description:"Adopt explicit Grafana processing control without changing legacy webhook behaviour on upgrade.",activation_policy:"Explicit adoption preserves working legacy-control installations."},"graceful_degradation.enabled":{apply_mode:"activation_required",description:"Allow subsystem guards to short-circuit calls while a dependency is unhealthy.",activation_policy:"Explicit adoption resolves the legacy always-on behaviour."}},Yk=["tools.enabled","tools.max_tool_iterations_chat","tools.max_tool_iterations_loop","learning.loop_reflection_enabled","turn_state.retention"],Qk=new Set(["token","api_token","api_key","password","secret","credentials_path","ssh_key_path","hmac_key","webhook_urls","headers","env"]);function ni(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Xk(e){return Array.isArray(e)?"array":e===null?"null":Number.isInteger(e)?"integer":typeof e=="number"?"number":typeof e=="boolean"?"boolean":typeof e=="object"?"object":"string"}function Eg(e,t="",s=[]){if(e&&typeof e=="object"&&!Array.isArray(e)){const n=Object.entries(e);n.length===0&&t&&s.push([t,e]);for(const[a,i]of n)Eg(i,t?`${t}.${a}`:a,s);return s}return t&&s.push([t,e]),s}function e1(e){return e.split(".").some(s=>Qk.has(s))}function t1(e){return Ju[e]?Ju[e]:e.startsWith("mcp.servers.")&&(e.endsWith(".headers")||e.endsWith(".env"))?{owner:"secrets",sensitivity:"secret_container"}:e.startsWith("outbound_webhooks.targets.")&&e.endsWith(".secret")?{owner:"secrets",sensitivity:"sensitive"}:e.startsWith("outbound_webhooks.targets.")&&(e.endsWith(".scrub_secrets")||e.endsWith(".verify_ssl"))?{apply_mode:"activation_required",activation_policy:"Review this target and acknowledge the target-bound safety override."}:{}}function Ag(e){return e==null||e===""?!1:Array.isArray(e)?e.length>0:typeof e=="object"?Object.keys(e).length>0:!0}function Yu(e,t){return t==="public"?e:e&&typeof e=="object"?Array.isArray(e)?[]:{}:Ag(e)?Cg:""}function s1(e){return e.valid===!1?"invalid":e.pending_restart?"pending_restart":e.drift?"drift":e.apply_mode==="activation_required"||e.apply_mode==="dormant"?"dormant":"applied"}function n1(e,t){const s=e.split(".")[0],n=e.split(".").at(-1),a=Jk[s]||{apply_mode:"restart",description:`${ni(s)} configuration.`},i=t1(e),l=i.sensitivity||(e1(e)?"sensitive":"public");let r=i.apply_mode||a.apply_mode;Yk.some(p=>e===p||e.startsWith(`${p}.`))&&(r="live_read");const o=i.owner||a.owner||(l==="public"?"config":"secrets"),c=Yu(t,l),d=Yu(t,l),u=Ag(t)&&!(l!=="public"&&t===Cg),f={path:e,owner:o,label:i.label||ni(n),description:i.description||`${ni(n)} setting for ${ni(s)}.`,aliases:i.aliases||[],unit:i.unit||null,examples:i.examples||[],type:i.type||Xk(t),enum:i.enum||null,constraints:i.constraints||{},default:i.default??null,sensitivity:l,secret_route:l==="public"?null:`/api/config/secrets/${encodeURIComponent(e)}`,apply_mode:r,apply_handler:i.apply_handler||null,consumers:i.consumers||[],restart_reason:i.restart_reason||(r==="restart"?`${ni(s)} is currently constructed during startup.`:null),activation_policy:i.activation_policy||(r==="activation_required"?"Saving configuration does not enable this feature. Explicit activation is required.":null),desired:c,effective:d,configured:u,provenance:u?"config_file":"unset",valid:!0,validation_errors:[],pending_restart:!1,drift:!1,last_apply:null};return f.apply_state=s1(f),f}function a1(e){const t={applied:0,pending_restart:0,dormant:0,invalid:0,drift:0};for(const s of e)Object.hasOwn(t,s.apply_state)&&(t[s.apply_state]+=1);return t}function i1(e){const t=Eg(e||{}).map(([s,n])=>n1(s,n));return{schema_version:1,revision:"local-fixture",generated_at:null,fields:t,status:{counts:a1(t),persistence_error:null,unsafe_overrides:[],desired_revision:null,effective_revision:null}}}const Oa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["personality","context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],l1=[{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Activation required",short:"Dormant",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"}],r1={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Activation required",legacy_control:"Legacy control",dormant:"Not wired"},Qu={llm:{label:"LLM Config",href:"#/system?tab=llm",description:"This section has one canonical editor so provider changes use the safe switch and reload paths."},personality:{label:"Personality",href:"#/personality",description:"Personality presets and the active profile are managed on the dedicated Personality page."},discord:{label:"Discord overrides",href:"#/system?tab=discord",description:"Guild and channel overrides take precedence over these global defaults."},secrets:{label:"Secret controls",href:"#/system?tab=config",description:"Secret values are write-only and use dedicated set and clear flows."}},Rg="odin_config_center_expanded_v1",Ig="odin_config_center_category_v1",o1=50,Xu=e=>Promise.resolve(i1(e));function Rn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function bi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Us(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function c1(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function d1(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Og(e,t){if(bi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Rn(t);const n={};for(const[a,i]of Object.entries(t)){const l=Og(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function u1(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Og(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Lg(e,t,s,n){if(bi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Lg(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function f1(){try{const e=JSON.parse(localStorage.getItem(Rg)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function p1(){try{const e=localStorage.getItem(Ig);return Oa.some(t=>t.key===e)?e:Oa[0].key}catch{return Oa[0].key}}const h1={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(!1),a=h(null),i=h(null),l=h(""),r=h("all"),o=h(p1()),c=h(f1()),d=h({}),u=h(null),f=h(void 0),p=h(!1),g=h({}),y=h([]),S=h([]),R=h(!1),v=h(!1),m=h(!1);let x=null;const w=ee(()=>{var P;return((P=t.value)==null?void 0:P.fields)||[]}),_=ee(()=>new Map(w.value.map(P=>[P.path,P]))),A=ee(()=>e.value?Object.keys(e.value).length:0),T=ee(()=>w.value.length),C=ee(()=>l1),L=ee(()=>y.value.length>0),H=ee(()=>S.value.length>0),M=ee(()=>{if(!e.value)return[];const P=new Set(Oa.flatMap(ke=>ke.sections)),j=Oa.map(ke=>({...ke,sections:ke.sections.filter(Ce=>Object.hasOwn(e.value,Ce))})).filter(ke=>ke.sections.length),ae=Object.keys(e.value).filter(ke=>!P.has(ke));return ae.length&&j.push({key:"other",label:"Other",icon:"folder",sections:ae}),j}),D=ee(()=>{if(!e.value)return[];const P=[];for(const[j,ae]of Object.entries(d.value))Lg(e.value[j],ae,j,P);return P.filter(j=>!bi(j.oldVal,j.newVal)).map(j=>{const ae=oe(j.path);return{...j,label:(ae==null?void 0:ae.label)||Us(j.path.split(".").at(-1)),apply_mode:(ae==null?void 0:ae.apply_mode)||pe(j.path.split(".")[0])}})}),K=ee(()=>D.value.length>0),ne=ee(()=>D.value.length),$=ee(()=>new Set(D.value.map(P=>P.path.split(".")[0])).size),O=ee(()=>!!l.value||r.value!=="all"),E=ee(()=>{const P={...g.value};for(const j of D.value){const ae=oe(j.path),ke=_e(ae,j.newVal);ke&&(P[j.path]=ke)}return P}),N=ee(()=>Object.keys(E.value).length>0),B=ee(()=>e.value?(O.value?M.value:M.value.filter(j=>j.key===o.value)).map(j=>({...j,sections:j.sections.filter(ae=>X(ae))})).filter(j=>j.sections.length):[]),W=ee(()=>{const P=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],j=new Map(P.map(ae=>[ae,[]]));for(const ae of D.value){const ke=j.has(ae.apply_mode)?ae.apply_mode:"restart";j.get(ke).push(ae)}return P.filter(ae=>j.get(ae).length).map(ae=>({key:ae,label:Ps(ae),entries:j.get(ae)}))}),te=ee(()=>D.value.filter(P=>P.apply_mode==="restart").length);function oe(P){var Et;if(_.value.has(P))return _.value.get(P);const j=`${P}.`,ae=w.value.filter(U=>U.path.startsWith(j));if(!ae.length)return null;const ke=ae.some(U=>U.sensitivity!=="public")?"secret_container":"public",Ce=[...new Set(ae.map(U=>U.apply_mode))];return{path:P,label:Us(P.split(".").at(-1)),description:ae[0].description,type:"object",sensitivity:ke,configured:ae.some(U=>U.configured),provenance:((Et=ae.find(U=>U.provenance!=="unset"))==null?void 0:Et.provenance)||"unset",apply_mode:Ce.length===1?Ce[0]:pe(P.split(".")[0]),constraints:{},enum:null}}function Q(P){const j=`${P}.`;return w.value.filter(ae=>ae.path===P||ae.path.startsWith(j))}function he(P){return Q(P).length}function Fe(P){return Us(P)}function z(P){const j=Q(P);if(!j.length)return`${Us(P)} configuration.`;const ae=j.find(Et=>Et.sensitivity==="public"&&Et.description)||j.find(Et=>Et.description),ke=(ae==null?void 0:ae.description)||"";return ke.match(/setting for (.+)\.$/i)?`${Us(P)} settings and runtime behaviour.`:ke}function pe(P){const j=[...new Set(Q(P).map(ae=>ae.apply_mode))];return j.length===1?j[0]:j.includes("restart")?"restart":j.includes("activation_required")?"activation_required":j[0]||"restart"}function de(P){const j=[...new Set(Q(P).map(ae=>Ps(ae.apply_mode)))];return j.length?j.length===1?j[0]:`Mixed apply behaviour: ${j.join(" · ")}`:""}function xe(P){const j=Q(P),ae=j.map(U=>U.owner).filter(U=>U&&U!=="config"&&U!=="secrets");if(!ae.length)return null;const ke=ae.reduce((U,le)=>({...U,[le]:(U[le]||0)+1}),{}),[Ce,Et]=Object.entries(ke).sort((U,le)=>le[1]-U[1])[0];return Et>=Math.max(1,j.length-1)&&Qu[Ce]?Ce:null}function me(P){return Qu[P]||{label:Us(P),href:"#/system?tab=config",description:"This feature uses a dedicated configuration and activation panel."}}function Be(P){var j;return Object.hasOwn(d.value,P)?d.value[P]:(j=e.value)==null?void 0:j[P]}function b(P){const j=Be(P);return(j&&typeof j=="object"&&!Array.isArray(j)?Object.entries(j).map(([ke,Ce])=>({key:ke,path:`${P}.${ke}`,value:Ce})):[{key:null,path:P,value:j}]).map(ke=>{const Ce=oe(ke.path)||{};return{...Ce,...ke,label:Ce.label||(ke.key===null?Fe(P):Us(ke.key)),description:Ce.description||`${Us(ke.key||P)} setting for ${Us(P)}.`,apply_mode:Ce.apply_mode||pe(P),sensitivity:Ce.sensitivity||"public",constraints:Ce.constraints||{},configured:Ce.configured??!0,provenance:Ce.provenance||"config_file"}})}function I(P,j){return[P.label,P.path,P.description,...P.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(j)}function F(P){const j=l.value.trim().toLowerCase();return j?Q(P).filter(ae=>I(ae,j)):[]}function X(P){const j=Q(P);if(r.value!=="all"&&!j.some(ke=>ke.apply_state===r.value))return!1;const ae=l.value.trim().toLowerCase();return!ae||`${Fe(P)} ${P}`.toLowerCase().includes(ae)?!0:j.some(ke=>I(ke,ae))}function Z(P,j){return Q(P).filter(ae=>ae.apply_state===j).length}function J(P){var j,ae,ke;return P==="all"?T.value:((ke=(ae=(j=t.value)==null?void 0:j.status)==null?void 0:ae.counts)==null?void 0:ke[P])??w.value.filter(Ce=>Ce.apply_state===P).length}function ue(P){const j=P.sections.flatMap(ae=>Q(ae));return{fields:j.length,modified:D.value.filter(ae=>P.sections.includes(ae.path.split(".")[0])).length,pending_restart:j.filter(ae=>ae.apply_state==="pending_restart").length,invalid:j.filter(ae=>ae.apply_state==="invalid").length,dormant:j.filter(ae=>ae.apply_state==="dormant").length}}function re(P){var j;return Object.hasOwn(d.value,P)&&!bi((j=e.value)==null?void 0:j[P],d.value[P])}function ie(P){return D.value.some(j=>j.path===P||j.path.startsWith(`${P}.`))}function se(P){o.value=P,l.value="",r.value="all";try{localStorage.setItem(Ig,P)}catch{}}function ye(P){r.value=P}function fe(){l.value="",r.value="all"}function ge(P){return c.value[P]?!0:!!(l.value&&!m.value&&X(P))}function we(P){const j=!ge(P);m.value&&j?c.value={[P]:!0}:c.value={...c.value,[P]:j}}function Te(){y.value.push(Rn(d.value)),y.value.length>o1&&y.value.shift(),S.value=[]}function Re(P){u.value!==P&&(u.value=P,p.value=Object.hasOwn(d.value,P),f.value=p.value?Rn(d.value[P]):void 0,p.value||(d.value={...d.value,[P]:Rn(e.value[P])}),c.value=m.value?{[P]:!0}:{...c.value,[P]:!0})}function Ne(P){if(!De(P)){if(bi(d.value[P],e.value[P])){const j={...d.value};delete j[P],d.value=j}u.value=null,f.value=void 0,p.value=!1}}function Pe(P){const j={...d.value};p.value?j[P]=Rn(f.value):delete j[P],d.value=j,u.value=null,f.value=void 0,p.value=!1;const ae=`${P}.`;g.value=Object.fromEntries(Object.entries(g.value).filter(([ke])=>ke!==P&&!ke.startsWith(ae)))}function Ve(){!K.value&&!u.value||(Te(),d.value={},u.value=null,f.value=void 0,p.value=!1,g.value={},R.value=!1)}function st(P,j){const ae=P.path.split(".")[0];if(u.value!==ae)return;Te();const ke=Rn(d.value[ae]);if(P.key===null?d.value={...d.value,[ae]:j}:(ke[P.key]=j,d.value={...d.value,[ae]:ke}),g.value[P.path]){const Ce={...g.value};delete Ce[P.path],g.value=Ce}}function V(P,j){try{const ae=JSON.parse(j),ke={...g.value};delete ke[P.path],g.value=ke,st(P,ae)}catch(ae){g.value={...g.value,[P.path]:`Invalid JSON: ${ae.message}`}}}function _e(P,j){var ke;if(!P)return null;if((ke=P.enum)!=null&&ke.length&&!P.enum.includes(j))return`Choose one of: ${P.enum.join(", ")}`;const ae=P.constraints||{};if((P.type==="integer"||P.type==="number")&&typeof j=="number"){if(ae.minimum!==void 0&&j<ae.minimum)return`Must be at least ${ae.minimum}${P.unit?` ${P.unit}`:""}`;if(ae.maximum!==void 0&&j>ae.maximum)return`Must be at most ${ae.maximum}${P.unit?` ${P.unit}`:""}`}return null}function Ie(P){return E.value[P.path]||null}function De(P){const j=`${P}.`;return Object.keys(E.value).some(ae=>ae===P||ae.startsWith(j))}function ze(){y.value.length&&(S.value.push(Rn(d.value)),d.value=y.value.pop(),g.value={})}function Ye(){S.value.length&&(y.value.push(Rn(d.value)),d.value=S.value.pop(),g.value={})}function ht(){!K.value||N.value||(u.value&&Ne(u.value),R.value=!0,v.value=!1)}function ts(){R.value=!1}function Is(){u.value?Pe(u.value):Ve()}function Ps(P){return r1[P]||Us(P||"unknown")}function Fs(P){return`apply-${String(P||"unknown").replaceAll("_","-")}`}function us(P){return`cfgc-field-${P.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function q(P){return`${us(P)}-input`}function Ee(P){const j=document.getElementById(us(P))||document.getElementById(us(P.split(".").slice(0,2).join(".")));j==null||j.scrollIntoView({behavior:"smooth",block:"center"})}function fs(P,j){i.value={type:P,message:j},window.setTimeout(()=>{var ae;((ae=i.value)==null?void 0:ae.message)===j&&(i.value=null)},3500)}async function Zs(){if(!(!K.value||N.value||n.value)){n.value=!0;try{const P=u1(e.value,d.value),j=await Y.put("/api/config",P);e.value=j,t.value=await Xu(j),d.value={},u.value=null,f.value=void 0,p.value=!1,y.value=[],S.value=[],g.value={},R.value=!1,fs("success","Configuration saved. Apply status has been refreshed.")}catch(P){fs("error",P.message||"Configuration could not be saved")}finally{n.value=!1}}}async function ca(){var P;if(!K.value){s.value=!0,a.value=null;try{const j=await Y.get("/api/config"),ae=await Xu(j);e.value=j,t.value=ae;const ke=M.value;ke.some(Ce=>Ce.key===o.value)||(o.value=((P=ke[0])==null?void 0:P.key)||Oa[0].key)}catch(j){a.value=j.message||"Unknown configuration error"}finally{s.value=!1}}}function wn(P){if(R.value||!(P.ctrlKey||P.metaKey))return;const j=P.target;j instanceof HTMLElement&&(j.matches("input, textarea, select")||j.isContentEditable)||(!P.shiftKey&&P.key.toLowerCase()==="z"?(P.preventDefault(),ze()):(P.key.toLowerCase()==="y"||P.shiftKey&&P.key.toLowerCase()==="z")&&(P.preventDefault(),Ye()))}function Js(P){if(m.value=P.matches,P.matches){const j=Object.keys(c.value).find(ae=>c.value[ae]);c.value=j?{[j]:!0}:{}}}return ds(c,P=>{try{localStorage.setItem(Rg,JSON.stringify(P))}catch{}},{deep:!0}),Je(()=>{var P;ca(),document.addEventListener("keydown",wn),x=window.matchMedia("(max-width: 760px)"),Js(x),(P=x.addEventListener)==null||P.call(x,"change",Js)}),_t(()=>{var P;document.removeEventListener("keydown",wn),(P=x==null?void 0:x.removeEventListener)==null||P.call(x,"change",Js)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,searchQuery:l,healthFilter:r,activeCategory:o,editingSection:u,reviewOpen:R,mobileOverflowOpen:v,healthFilters:C,visibleCategories:M,displayGroups:B,reviewGroups:W,sectionCount:A,fieldCount:T,hasChanges:K,changeCount:ne,changedSectionCount:$,hasDraftErrors:N,canUndo:L,canRedo:H,globalFilterActive:O,reviewRestartCount:te,healthCount:J,categoryStats:ue,selectCategory:se,selectHealthFilter:ye,clearFilters:fe,sectionLabel:Fe,sectionDescription:z,sectionFieldCount:he,sectionHealthCount:Z,sectionApplySummary:de,sectionOwner:xe,ownerInfo:me,sectionEntries:b,sectionSearchHits:F,sectionChanged:re,fieldChanged:ie,isSectionExpanded:ge,toggleSection:we,startSectionDraft:Re,finishSectionDraft:Ne,cancelSectionDraft:Pe,discardAllDrafts:Ve,setFieldValue:st,setJsonFieldValue:V,fieldError:Ie,sectionHasErrors:De,undo:ze,redo:Ye,openReview:ht,closeReview:ts,mobileCancel:Is,applyModeLabel:Ps,applyClass:Fs,compactValue:c1,formatValue:d1,fieldId:us,fieldInputId:q,focusField:Ee,fetchConfig:ca,saveConfig:Zs}}},g1={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(p){return p.config&&p.config.enabled!==void 0?p.config.enabled:!0}function i(p){return p.config&&p.config.require_mention!==void 0?p.config.require_mention:!1}function l(p){return p.config&&p.config.respond_to_bots!==void 0?p.config.respond_to_bots:!1}function r(p){return p.config&&Object.keys(p.config).length>0}function o(p){n.value[p]=!n.value[p]}async function c(){t.value=!0,s.value=null;try{e.value=await Y.get("/api/discord/guilds")}catch(p){s.value=p.message}t.value=!1}async function d(p,g,y){try{await Y.put("/api/discord/guild/"+p+"/config",{[g]:y}),await c()}catch(S){s.value=S.message}}async function u(p,g,y,S){try{await Y.put("/api/discord/channel/"+p+"/config",{[y]:S}),await c()}catch(R){s.value=R.message}}async function f(p,g){try{await Y.put("/api/discord/channel/"+p+"/config",{clear:!0}),await c()}catch(y){s.value=y.message}}return Je(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:d,setChannelConfig:u,clearOverride:f}}},hs=e=>e==null?e:JSON.parse(JSON.stringify(e));function m1({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const f=new Map;let p=null;const g=new Map;function y(_){d+=1;const A=c.then(_,_);return c=A.catch(()=>{}),A}function S(_,A){p=hs(_),g.clear();for(const[T,C]of Object.entries(A||{}))g.set(T,hs(C))}function R(_){const A=hs(_),T=++u;return y(async()=>{try{await e(hs(A)),p=hs(A),T===u&&n(hs(A))}catch(C){T===u&&(a(hs(p)),o(C,{kind:"default"}))}})}function v(_,A){const T=hs(A),C=(f.get(_)||0)+1;return f.set(_,C),y(async()=>{try{await t(_,hs(T)),g.set(_,hs(T)),C===f.get(_)&&i(_,hs(T))}catch(L){C===f.get(_)&&(l(_,hs(g.get(_)??null)),o(L,{kind:"user",uid:_}))}})}function m(_){const A=(f.get(_)||0)+1;return f.set(_,A),y(async()=>{try{await s(_),g.delete(_),A===f.get(_)&&r(_)}catch(T){A===f.get(_)&&(l(_,hs(g.get(_)??null)),o(T,{kind:"delete",uid:_}))}})}async function x(){for(;;){const _=c;if(await _,_===c)return d}}async function w(_){for(;;){const A=await x(),T=await _();if(A===d)return T}}return{seed:S,saveDefault:R,saveUser:v,deleteUser:m,whenIdle:x,readSnapshot:w,get revision(){return d}}}const v1={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),d=h([]),u=h(null),f=ee(()=>{const B={};for(const W of d.value)B[W.id]=W;return B});function p(B){return f.value[B]||null}const g=ee(()=>/^\d{15,25}$/.test(r.value.trim())),y=ee(()=>{if(o.value){if(S.value[c.value])return"host-user-option-"+c.value;if(g.value)return"host-user-option-raw"}}),S=ee(()=>{const B=r.value.toLowerCase().trim();return B?d.value.filter(W=>!i.value[W.id]&&(W.display_name.toLowerCase().includes(B)||W.username.toLowerCase().includes(B)||W.id.includes(B))):d.value.filter(W=>!i.value[W.id])});function R(B,W){return B?B.allowed_hosts===null||B.allowed_hosts===void 0?{allowed_hosts:[...W],default_host:B.default_host||"",allow_all:!0}:{allowed_hosts:B.allowed_hosts,default_host:B.default_host||"",allow_all:!1}:{allowed_hosts:[...W],default_host:W[0]||"",allow_all:!0}}const v=m1({applyDefault:async B=>{const W=B.allow_all?null:B.allowed_hosts;await Y.put("/api/host-access/default-policy",{allowed_hosts:W,default_host:B.default_host})},applyUser:async(B,W)=>{const te=W.allow_all?null:W.allowed_hosts;await Y.put(`/api/host-access/user/${B}`,{allowed_hosts:te,default_host:W.default_host})},applyDelete:B=>Y.del(`/api/host-access/user/${B}`),onDefaultConfirmed:()=>Se.success("Default policy updated"),onDefaultRollback:B=>{B&&(a.value=B)},onUserConfirmed:B=>{const W=p(B);Se.success(`Updated access for ${W?W.display_name:B}`)},onUserRollback:(B,W)=>{const te={...i.value};W?te[B]=W:delete te[B],i.value=te},onUserDeleted:B=>{const W={...i.value};delete W[B],i.value=W},onError:(B,W)=>{var oe;const te=W.uid?` ${((oe=p(W.uid))==null?void 0:oe.display_name)||W.uid}`:"";Se.error(`${B.message||"Failed to save"} — reverted${te}`)}});let m=0;async function x(){const B=++m;e.value=!0,t.value="";try{const W=await v.readSnapshot(()=>Y.get("/api/host-access"));if(B!==m)return;s.value=W,n.value=W.available_hosts||[],a.value=R(W.default_policy,n.value);const te=W.users||{},oe={};for(const[Q,he]of Object.entries(te))oe[Q]=R(he,n.value);i.value=oe,v.seed(a.value,oe)}catch(W){B===m&&(t.value=W.message||"Failed to fetch host access data")}finally{B===m&&(e.value=!1)}try{const W=await Y.get("/api/discord/members")||[];B===m&&(d.value=W)}catch{B===m&&(d.value=[])}}function w(){v.saveDefault(a.value)}function _(B,W){a.value.allow_all=!1,W?a.value.allowed_hosts.includes(B)||a.value.allowed_hosts.push(B):(a.value.allowed_hosts=a.value.allowed_hosts.filter(te=>te!==B),a.value.default_host===B&&(a.value.default_host=a.value.allowed_hosts[0]||"")),w()}function A(B){const W=i.value[B];W&&v.saveUser(B,W)}function T(B,W,te){const oe=i.value[B];oe&&(oe.allow_all=!1,te?oe.allowed_hosts.includes(W)||oe.allowed_hosts.push(W):(oe.allowed_hosts=oe.allowed_hosts.filter(Q=>Q!==W),oe.default_host===W&&(oe.default_host=oe.allowed_hosts[0]||"")),A(B))}function C(B,W){const te=i.value[B];te&&(te.default_host=W,A(B))}function L(){l.value=!0,r.value="",c.value=0,Ot(()=>{u.value&&u.value.focus()})}function H(){o.value=!0,c.value=0}function M(){c.value<S.value.length-1&&c.value++}function D(){c.value>0&&c.value--}function K(){const B=S.value[c.value];if(B){$(B);return}g.value&&ne()}function ne(){const B=r.value.trim();/^\d{15,25}$/.test(B)&&(i.value[B]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(B),r.value="",o.value=!1,l.value=!1)}function $(B){i.value[B.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},A(B.id),r.value="",o.value=!1,l.value=!1}function O(){o.value=!1}function E(){setTimeout(()=>{o.value=!1},150)}async function N(B){const W=p(B);await bs({title:"Remove user override",message:`Remove the host access override for ${W?W.display_name:B}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await v.deleteUser(B),i.value[B]||Se.success(`Removed override for ${W?W.display_name:B}`))}return Je(x),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:S,isRawId:g,activeOptionId:y,searchInput:u,fetchData:x,saveDefaultPolicy:w,toggleDefaultHost:_,getMember:p,toggleUserHost:T,setUserDefault:C,openAddUser:L,deleteUser:N,onSearchInput:H,highlightNext:M,highlightPrev:D,selectHighlighted:K,selectMember:$,closeDropdown:O,onBlur:E,addRawId:ne}}},b1={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=ee(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),f=ee(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function p(T){return T==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":T==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function g(){e.value=!0,t.value="";try{const T=await Y.get("/api/tokens");s.value=T.tokens||[],n.value=T.available_hosts||[]}catch(T){t.value=T.message||"Failed to load tokens"}finally{e.value=!1}}function y(T){return!T||!T.trim()?[]:T.split(",").map(C=>C.trim()).filter(Boolean)}function S(T,C){const L=c.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}function R(T,C){const L=d.value.allowed_hosts;if(C&&!L.includes(T)&&L.push(T),!C){const H=L.indexOf(T);H>=0&&L.splice(H,1)}}async function v(){var T;i.value=!0;try{const C=y(c.value.allowed_tools_str),L=c.value.host_mode,H=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,M={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};H!==null&&(M.allowed_hosts=H),M.default_host=c.value.default_host||"";const D=await Y.post("/api/tokens",M);l.value=D.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Se.success("Token created"),await g()}catch(C){Se.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(T){r.value=T;const C=T.allowed_hosts;let L="default";C==null?L="default":Array.isArray(C)&&C.length===0?L="none":Array.isArray(C)&&(L="select"),d.value={username:T.username||"",tier:T.tier||"admin",label:T.label||"",host_mode:L,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:T.default_host||"",allowed_tools_str:(T.allowed_tools||[]).join(", ")}}async function x(){var T;if(r.value){o.value=!0;try{const C=y(d.value.allowed_tools_str),L=d.value.host_mode,H={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};L==="none"?H.allowed_hosts=[]:L==="select"?H.allowed_hosts=d.value.allowed_hosts:H.allowed_hosts=null,H.default_host=d.value.default_host||"",await Y.put("/api/tokens/"+encodeURIComponent(r.value.user_id),H),r.value=null,Se.success("Token updated"),await g()}catch(C){Se.error(((T=C.data)==null?void 0:T.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function w(T){var L;if(await bs({title:"Regenerate token",message:`Regenerate token for ${T.username||T.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const H=await Y.post("/api/tokens/"+encodeURIComponent(T.user_id)+"/regenerate");l.value=H.token,Se.success("Token regenerated")}catch(H){Se.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to regenerate")}}async function _(T){var L;if(await bs({title:"Delete token",message:`Delete token for ${T.username||T.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await Y.del("/api/tokens/"+encodeURIComponent(T.user_id)),Se.success("Token deleted"),await g()}catch(H){Se.error(((L=H.data)==null?void 0:L.error)||H.message||"Failed to delete")}}async function A(){if(l.value)try{await navigator.clipboard.writeText(l.value),Se.success("Copied to clipboard")}catch{Se.error("Copy failed — select and copy manually")}}return Je(g),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:f,fetchData:g,tierBadge:p,toggleCreateHost:S,toggleEditHost:R,createToken:v,startEdit:m,saveEdit:x,confirmRegenerate:w,confirmDelete:_,copyToken:A}}};function ul(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const y1={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=ee(()=>{const q=n.value.model;return q&&!a.includes(q)?[q,...a]:a}),l=ee(()=>{const q=n.value.agent_model;return q&&q!=="auto"&&!a.includes(q)?[q,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=ee(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=ee(()=>{const q=n.value.agent_model;return q==="auto"?!0:!r.includes(q||n.value.model)}),d=ee(()=>{const q=n.value.agent_reasoning_effort;return q==="auto"?!1:(q||n.value.reasoning_effort)==="max"}),u=q=>r.includes(q)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),f=q=>r.includes(q)&&d.value,p=h({enabled:!1,model:"gpt-5.6-luna"}),g=h({unavailable_reason:null}),y=ee(()=>{const q=p.value.model;return q&&!a.includes(q)?[q,...a]:a});function S(q){const Ee=q.target.value;p.value.enabled=Ee!=="",Ee!==""&&(p.value.model=Ee),Ve()}const R=h(!1),v=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),m=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),x=h(!1),w=h(!1),_=h(!1),A=h(!1),T=h(!1),C=h(!1),L=h(!1),H=h({configured:!1}),M=h([]),D=h(""),K=h(!1),ne=h(!1),$=h({configured:!1}),O=h([]),E=h(""),N=h(!1),B=h(!1),W=h(!0),te=h(""),oe=h({configured:!1,accounts:[]}),Q=h(null),he=h(null),Fe=h(""),z=h(null),pe=h(!1),de=h(null),xe=h(null),me=h("");let Be=null;function b(q,Ee="success"){Se(q,Ee==="error"?"error":"success")}function I(q){if(!q)return"?";const Ee=q/(1024*1024*1024);return Ee>=1?Ee.toFixed(1)+" GB":(q/(1024*1024)).toFixed(0)+" MB"}async function F(){e.value=!0,await Promise.all([X(),Z(),ye(),J()]),e.value=!1}async function X(){try{const q=await Y.get("/api/llm/status");t.value=q,s.value=q.active_provider||"codex",q.codex&&!Pe.pending()&&(n.value.enabled=q.codex.enabled,n.value.model=q.codex.model||"gpt-5.5",n.value.reasoning_effort=q.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=q.codex.agent_reasoning_effort||"",n.value.agent_model=q.codex.agent_model||"",n.value.max_tokens=q.codex.max_tokens||4096),q.ollama&&!st.pending()&&(v.value.enabled=q.ollama.enabled,v.value.base_url=q.ollama.base_url||"",v.value.model=q.ollama.model||"",v.value.max_tokens=q.ollama.max_tokens||4096),q.kimi&&!V.pending()&&(m.value.enabled=q.kimi.enabled,m.value.model=q.kimi.model||"",m.value.max_tokens=q.kimi.max_tokens||4096),q.auxiliary&&(g.value=q.auxiliary,Ve.pending()||(p.value.enabled=q.auxiliary.enabled,p.value.model=q.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Z(){try{if(H.value=await Y.get("/api/ollama/status"),H.value.model&&(D.value=H.value.model),H.value.configured)try{const q=await Y.get("/api/ollama/models");M.value=q.models||[]}catch{M.value=[]}else if(v.value.base_url)try{const q=await Y.post("/api/ollama/probe-models",{base_url:v.value.base_url});M.value=q.models||[]}catch{M.value=[]}}catch{H.value={configured:!1}}}async function J(){W.value=!0,te.value="";try{oe.value=await Y.get("/api/codex/status")}catch(q){te.value=q.message||"Failed to fetch Codex status"}finally{W.value=!1}}async function ue(){const q=t.value?t.value.active_provider:"codex";L.value=!0;try{const Ee=await Y.post("/api/llm/switch",{provider:s.value});Ee.error?(s.value=q,b(Ee.error,"error")):(b("Switched to "+s.value+" ("+Ee.model+")"),await F())}catch(Ee){s.value=q,b(Ee.message||"Switch failed","error")}finally{L.value=!1}}async function re(){K.value=!0;try{const q=await Y.post("/api/ollama/reload");b(q.configured?"Ollama reloaded":q.reason||"Ollama not configured",q.configured?"success":"error"),await F()}catch(q){b(q.message||"Reload failed","error")}finally{K.value=!1}}async function ie(){ne.value=!0;try{await Y.post("/api/ollama/model",{model:D.value}),b("Model set to "+D.value),await F()}catch(q){b(q.message||"Failed","error")}finally{ne.value=!1}}async function se(){const q=v.value.base_url;if(!q){b("Enter a base URL first","error");return}C.value=!0;try{const Ee=await Y.post("/api/ollama/probe-models",{base_url:q});M.value=Ee.models||[],M.value.length?(b(M.value.length+" model(s) found"),!v.value.model&&M.value.length&&(v.value.model=M.value[0].name)):b("No models found at "+q,"error")}catch(Ee){b(Ee.message||"Could not reach Ollama","error")}finally{C.value=!1}}async function ye(){try{if($.value=await Y.get("/api/kimi/status"),$.value.model&&(E.value=$.value.model),$.value.configured)try{const q=await Y.get("/api/kimi/models");O.value=q.models||[]}catch{O.value=[]}}catch{$.value={configured:!1}}}async function fe(){N.value=!0;try{const q=await Y.post("/api/kimi/reload");b(q.configured?"Kimi reloaded":q.reason||"Kimi not configured",q.configured?"success":"error"),await F()}catch(q){b(q.message||"Reload failed","error")}finally{N.value=!1}}async function ge(){B.value=!0;try{await Y.post("/api/kimi/model",{model:E.value}),b("Model set to "+E.value),await F()}catch(q){b(q.message||"Failed","error")}finally{B.value=!1}}async function we(){if(_.value){Pe();return}_.value=!0;try{await Y.put("/api/llm/codex/config",n.value),b("Codex config saved"),await Promise.all([X(),J()])}catch(q){b(q.message||"Failed","error"),await Promise.all([X(),J()])}finally{_.value=!1}}async function Te(){if(A.value){st();return}A.value=!0;try{const q={...v.value},Ee=x.value?v.value.api_key:null;Ee===null&&delete q.api_key,await Y.put("/api/llm/ollama/config",q),b("Ollama config saved"),Ee!==null&&v.value.api_key===Ee&&(v.value.api_key="",x.value=!1),await Promise.all([X(),Z()])}catch(q){b(q.message||"Failed","error")}finally{A.value=!1}}async function Re(){if(T.value){V();return}T.value=!0;try{const q={...m.value},Ee=w.value?m.value.api_key:null;Ee===null&&delete q.api_key,await Y.put("/api/llm/kimi/config",q),b("Kimi config saved"),Ee!==null&&m.value.api_key===Ee&&(m.value.api_key="",w.value=!1),await Promise.all([X(),ye()])}catch(q){b(q.message||"Failed","error")}finally{T.value=!1}}async function Ne(){if(R.value){Ve();return}R.value=!0;try{await Y.put("/api/llm/auxiliary/config",p.value),b("Auxiliary config saved"),await X()}catch(q){b(q.message||"Failed","error"),await X()}finally{R.value=!1}}const Pe=ul(we),Ve=ul(Ne),st=ul(Te),V=ul(Re),_e=()=>(Pe.cancel(),we()),Ie=()=>(st.cancel(),Te()),De=()=>(V.cancel(),Re());async function ze(q){try{await Y.post("/api/codex/account/"+q+"/activate"),b("Active account switched"),await J()}catch(Ee){b(Ee.message||"Failed","error")}}async function Ye(q){Q.value=q;try{await Y.post("/api/codex/account/"+q+"/refresh"),b("Token refreshed"),await J()}catch(Ee){b(Ee.message||"Refresh failed","error")}finally{Q.value=null}}function ht(q,Ee){he.value=q,Fe.value=Ee||""}async function ts(q){try{await Y.put("/api/codex/account/"+q+"/label",{label:Fe.value}),b("Label updated"),he.value=null,await J()}catch(Ee){b(Ee.message||"Failed","error")}}async function Is(q,Ee){if(await bs({title:"Delete Codex account",message:`Delete ${Ee||"account #"+(q+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await Y.del("/api/codex/account/"+q),b("Deleted. Pool reloaded."),await J()}catch(Zs){b(Zs.message||"Failed","error")}}async function Ps(){pe.value=!0;try{const q=await Y.post("/api/codex/device-code");de.value=q,z.value="pending",Fs(q)}catch(q){b(q.message||"Failed","error")}finally{pe.value=!1}}async function Fs(q){Be={cancelled:!1};const Ee=Be;try{const fs=await Y.post("/api/codex/device-poll",{device_auth_id:q.device_auth_id,user_code:q.user_code,interval:q.interval});if(Ee.cancelled)return;xe.value=fs,z.value="success",await F()}catch(fs){if(Ee.cancelled)return;me.value=fs.message||"Device login failed",z.value="error"}}function us(){Be&&(Be.cancelled=!0),z.value=null,de.value=null}return Je(F),_t(()=>{Be&&(Be.cancelled=!0),Pe.cancel(),Ve.cancel(),st.cancel(),V.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:L,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:f,auxForm:p,auxData:g,auxModelOptions:y,onAuxModelChange:S,savingAux:R,saveAuxConfigDebounced:Ve,ollamaForm:v,kimiForm:m,savingCodex:_,savingOllama:A,savingKimi:T,probingOllama:C,ollamaKeyDirty:x,kimiKeyDirty:w,ollamaStatus:H,ollamaModels:M,ollamaSelectedModel:D,reloading:K,settingModel:ne,kimiStatus:$,kimiModels:O,kimiSelectedModel:E,reloadingKimi:N,settingKimiModel:B,codexLoading:W,codexError:te,codexData:oe,refreshing:Q,editingLabel:he,labelValue:Fe,deviceState:z,deviceLoading:pe,deviceInfo:de,deviceResult:xe,deviceError:me,fetchAll:F,switchProvider:ue,reloadOllama:re,setOllamaModel:ie,reloadKimi:fe,setKimiModel:ge,probeOllamaModels:se,saveCodexConfig:we,saveOllamaConfig:Te,saveKimiConfig:Re,saveCodexConfigDebounced:Pe,saveOllamaConfigDebounced:st,saveKimiConfigDebounced:V,saveCodexConfigNow:_e,saveOllamaConfigNow:Ie,saveKimiConfigNow:De,activateAccount:ze,refreshAccount:Ye,startEditLabel:ht,saveLabel:ts,deleteAccount:Is,startDeviceLogin:Ps,cancelDeviceLogin:us,formatSize:I}}},ef={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function x1(e){return ef[e]||ef[(e||"").toLowerCase()]||"text-gray-400"}const _1={template:`
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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null),d=h(""),u=h(0);let f=null;async function p(){var _;const v=await Promise.allSettled([Y.get("/api/startup/diagnostics"),Y.get("/api/subsystems/status"),Y.get("/api/pools/ssh"),Y.get("/api/pools/http"),Y.get("/api/risk/stats"),Y.get("/api/recovery/stats"),Y.get("/api/compression/stats"),Y.get("/api/freshness/stats"),Y.get("/api/governor/stats")]),m=A=>v[A].status==="fulfilled"?v[A].value:null;t.value=m(0)||{};const x=m(1);s.value=Array.isArray(x)?x:x&&x.subsystems||[],n.value=m(2)||{},a.value=m(3)||{},i.value=m(4),l.value=m(5),r.value=m(6),o.value=m(7),c.value=m(8);const w=v.filter(A=>A.status==="rejected");if(u.value=w.length,w.length===v.length){const A=(_=w[0])==null?void 0:_.reason;d.value=(A==null?void 0:A.message)||"Failed to load internals"}else d.value="";e.value=!1}function g(){e.value=!0,d.value="",p()}let y=!1;function S(){y||(y=!0,p(),f||(f=setInterval(p,3e4)))}function R(){y&&(y=!1,f&&(clearInterval(f),f=null))}return Je(S),As(S),Rs(R),_t(R),{loading:e,error:d,failedCount:u,retry:g,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:x1,formatTime:Dc}}},w1={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await Y.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await bs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await Y.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(f){r.value=f.message}finally{i.value=!1}}}return Je(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},k1={components:{TabbedPage:kr},setup(){return{tabs:[{id:"health",label:"Health",component:zk},{id:"resources",label:"Resources",component:qk},{id:"logs",label:"Logs",component:Zk},{id:"config",label:"Config",component:h1},{id:"discord",label:"Discord",component:g1},{id:"host-access",label:"Host Access",component:v1},{id:"api-tokens",label:"API Tokens",component:b1},{id:"llm",label:"LLM Config",component:y1},{id:"internals",label:"Internals",component:_1},{id:"update",label:"Update",component:w1}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},wt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Ng=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:J_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:hk,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:kk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Ik,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:Uk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:Bk,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:k1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:wt("/operations","live")},{path:"/agents",redirect:wt("/operations","agents")},{path:"/loops",redirect:wt("/operations","loops")},{path:"/processes",redirect:wt("/operations","processes")},{path:"/schedules",redirect:wt("/operations","schedules")},{path:"/audit",redirect:wt("/history","audit")},{path:"/sessions",redirect:wt("/history","sessions")},{path:"/traces",redirect:wt("/history","traces")},{path:"/usage",redirect:wt("/history","usage")},{path:"/tools",redirect:wt("/capabilities","tools")},{path:"/skills",redirect:wt("/capabilities","skills")},{path:"/knowledge",redirect:wt("/capabilities","knowledge")},{path:"/memory",redirect:wt("/capabilities","memory")},{path:"/learned",redirect:wt("/capabilities","learned")},{path:"/health",redirect:wt("/system","health")},{path:"/resources",redirect:wt("/system","resources")},{path:"/logs",redirect:wt("/system","logs")},{path:"/config",redirect:wt("/system","config")},{path:"/host-access",redirect:wt("/system","host-access")},{path:"/internals",redirect:wt("/system","internals")}],yi=V_({history:x_(),routes:Ng});yi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const S1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{Y.setPersist(a.value),await Y.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},T1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),f=h(null);let p=null;const g=h("starting"),y=h(""),S=Ng.filter(O=>O.meta),R=ee(()=>["Workspace","Operate","Observe","Manage"].map(O=>({name:O,routes:S.filter(E=>E.meta.section===O)})).filter(O=>O.routes.length)),v=ee(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.label)||"Odin"}),m=ee(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.section)||"Management"}),x=ee(()=>{var O;return((O=yi.currentRoute.value.meta)==null?void 0:O.description)||"Management console"});Y.onSessionExpired=()=>{t.value=!0,We.disconnect(),Y.setToken(""),e.value="login"};function w(O){var E;if((O.ctrlKey||O.metaKey)&&O.key.toLowerCase()==="k"){e.value==="ready"&&(O.preventDefault(),Tu());return}if(n.value&&O.key==="Tab"){const N=[...((E=a.value)==null?void 0:E.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(N.length){const B=N[0],W=N[N.length-1];if(O.shiftKey&&(document.activeElement===B||!a.value.contains(document.activeElement))){O.preventDefault(),W.focus();return}if(!O.shiftKey&&(document.activeElement===W||!a.value.contains(document.activeElement))){O.preventDefault(),B.focus();return}}}if(O.key==="Escape"&&n.value){n.value=!1,O.preventDefault();return}if(O.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(O.target.tagName)){O.preventDefault();const N=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');N&&N.focus()}}function _(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Je(async()=>{document.addEventListener("keydown",w),r=window.matchMedia("(max-width: 900px)"),_(),r.addEventListener("change",_);const O=await Y.check();O.ok?(e.value="ready",ne()):O.needsAuth?e.value="login":(e.value="ready",ne())});function A(){t.value=!1,e.value="ready",ne()}async function T(){await Y.logout(),We.disconnect(),e.value="login"}function C(){s.value=!s.value}function L(){n.value=!n.value}ds(n,async O=>{var E,N;if(O)o=document.activeElement,await Ot(),(N=(E=a.value)==null?void 0:E.querySelector(".nav-item"))==null||N.focus();else if(o!=null&&o.isConnected){const B=o;o=null,requestAnimationFrame(()=>B.focus())}});const H=ee(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(O,E="info",N=3e3){f.value={text:O,level:E},clearTimeout(p),p=setTimeout(()=>{f.value=null},N)}let D=null,K=!1;function ne(){We.onStatusChange=O=>{c.value=O},We.onLatency=O=>{u.value=O},We.onStateChange=(O,E)=>{d.value=O,O==="connected"?(K&&M("Connection restored","success"),K=!0):O==="reconnecting"&&E.attempt===1&&M("Connection lost — reconnecting…","warn")},We.connect(),$(),D&&clearInterval(D),D=setInterval($,15e3)}async function $(){try{const O=await Y.get("/api/status");g.value=O.status==="online"?"online":"starting";const E=O.uptime_seconds||0,N=Math.floor(E/3600),B=Math.floor(E%3600/60);y.value=`${N}h ${B}m uptime`}catch{g.value="offline",y.value=""}}return _t(()=>{D&&clearInterval(D),We.disconnect(),document.removeEventListener("keydown",w),r==null||r.removeEventListener("change",_)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:H,wsToast:f,botStatus:g,botUptime:y,navRoutes:S,navGroups:R,currentPage:v,currentSection:m,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:A,logout:T,toggleSidebar:C,toggleMobileNavigation:L,openPalette:Tu}}},$n=Pl(T1);$n.component("odin-icon",K_);$n.component("login-screen",S1);$n.component("toast-container",D0);$n.component("confirm-host",M0);$n.component("command-palette",G_);$n.directive("modal-focus",Z_);$n.use(yi);$n.mount("#app");
