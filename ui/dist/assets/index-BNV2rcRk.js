var Pg=Object.defineProperty;var Fg=(e,t,s)=>t in e?Pg(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var lt=(e,t,s)=>Fg(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class $g{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new Tr("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new Ug(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new Tr((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof Tr?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class Tr extends Error{constructor(t){super(t),this.name="AuthError"}}class Ug extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class Bg{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._latency=-1,this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`),this._ws=new WebSocket(s),this._ws.onopen=()=>{this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const n of this._subscriptions)this._ws.send(JSON.stringify({subscribe:n}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)},this._ws.onmessage=n=>{let a;try{a=JSON.parse(n.data)}catch{return}const i=a.type;if(i==="pong"){a.ts&&(this._latency=Date.now()-a.ts,this._lastPongTime=Date.now());return}if(i==="log")for(const l of this._handlers.logs||[])l(a);else if(i==="event")for(const l of this._handlers.events||[])l(a);else if(i==="chat_response"||i==="chat_error"){this._chatPending=!1;for(const l of this._handlers.chat||[])l(a)}},this._ws.onclose=()=>{if(this._ws=null,this._stopPing(),this._latency=-1,this._chatPending){this._chatPending=!1;const n={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const a of this._handlers.chat||[])a(n)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")},this._ws.onerror=()=>{}}}const G=new $g,We=new Bg(G);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function bs(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Ke={},_a=[],Ut=()=>{},ya=()=>!1,sa=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),Wl=e=>e.startsWith("onUpdate:"),ze=Object.assign,Do=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Hg=Object.prototype.hasOwnProperty,Xe=(e,t)=>Hg.call(e,t),be=Array.isArray,ka=e=>ja(e)==="[object Map]",na=e=>ja(e)==="[object Set]",Xc=e=>ja(e)==="[object Date]",Vg=e=>ja(e)==="[object RegExp]",Ae=e=>typeof e=="function",De=e=>typeof e=="string",Kt=e=>typeof e=="symbol",Qe=e=>e!==null&&typeof e=="object",Mo=e=>(Qe(e)||Ae(e))&&Ae(e.then)&&Ae(e.catch),ep=Object.prototype.toString,ja=e=>ep.call(e),jg=e=>ja(e).slice(8,-1),Zl=e=>ja(e)==="[object Object]",Jl=e=>De(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,un=bs(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),zg=bs("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),Yl=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},qg=/-\w/g,at=Yl(e=>e.replace(qg,t=>t.slice(1).toUpperCase())),Kg=/\B([A-Z])/g,rs=Yl(e=>e.replace(Kg,"-$1").toLowerCase()),aa=Yl(e=>e.charAt(0).toUpperCase()+e.slice(1)),wa=Yl(e=>e?`on${aa(e)}`:""),Nt=(e,t)=>!Object.is(e,t),Sa=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},tp=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},Ql=e=>{const t=parseFloat(e);return isNaN(t)?e:t},bl=e=>{const t=De(e)?Number(e):NaN;return isNaN(t)?e:t};let ed;const Xl=()=>ed||(ed=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Gg(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Wg="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Zg=bs(Wg);function Fi(e){if(be(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=De(n)?sp(n):Fi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(De(e)||Qe(e))return e}const Jg=/;(?![^(]*\))/g,Yg=/:([^]+)/,Qg=/\/\*[^]*?\*\//g;function sp(e){const t={};return e.replace(Qg,"").split(Jg).forEach(s=>{if(s){const n=s.split(Yg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function $i(e){let t="";if(De(e))t=e;else if(be(e))for(let s=0;s<e.length;s++){const n=$i(e[s]);n&&(t+=n+" ")}else if(Qe(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function Xg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!De(t)&&(e.class=$i(t)),s&&(e.style=Fi(s)),e}const em="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",tm="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",sm="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",nm="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",am=bs(em),im=bs(tm),lm=bs(sm),rm=bs(nm),om="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",cm=bs(om);function np(e){return!!e||e===""}function dm(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=gn(e[n],t[n]);return s}function gn(e,t){if(e===t)return!0;let s=Xc(e),n=Xc(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=Kt(e),n=Kt(t),s||n)return e===t;if(s=be(e),n=be(t),s||n)return s&&n?dm(e,t):!1;if(s=Qe(e),n=Qe(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!gn(e[l],t[l]))return!1}}return String(e)===String(t)}function er(e,t){return e.findIndex(s=>gn(s,t))}const ap=e=>!!(e&&e.__v_isRef===!0),ip=e=>De(e)?e:e==null?"":be(e)||Qe(e)&&(e.toString===ep||!Ae(e.toString))?ap(e)?ip(e.value):JSON.stringify(e,lp,2):String(e),lp=(e,t)=>ap(t)?lp(e,t.value):ka(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[Cr(n,i)+" =>"]=a,s),{})}:na(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>Cr(s))}:Kt(t)?Cr(t):Qe(t)&&!be(t)&&!Zl(t)?String(t):t,Cr=(e,t="")=>{var s;return Kt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function um(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Rt;class Po{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Rt&&(Rt.active?(this.parent=Rt,this.index=(Rt.scopes||(Rt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Rt;try{return Rt=this,t()}finally{Rt=s}}}on(){++this._on===1&&(this.prevScope=Rt,Rt=this)}off(){if(this._on>0&&--this._on===0){if(Rt===this)Rt=this.prevScope;else{let t=Rt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function pm(e){return new Po(e)}function rp(){return Rt}function fm(e,t=!1){Rt&&Rt.cleanups.push(e)}let ct;const Er=new WeakSet;class yi{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Rt&&(Rt.active?Rt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Er.has(this)&&(Er.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||cp(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,td(this),dp(this);const t=ct,s=Is;ct=this,Is=!0;try{return this.fn()}finally{up(this),ct=t,Is=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Uo(t);this.deps=this.depsTail=void 0,td(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Er.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){Qr(this)&&this.run()}get dirty(){return Qr(this)}}let op=0,oi,ci;function cp(e,t=!1){if(e.flags|=8,t){e.next=ci,ci=e;return}e.next=oi,oi=e}function Fo(){op++}function $o(){if(--op>0)return;if(ci){let t=ci;for(ci=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;oi;){let t=oi;for(oi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function dp(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function up(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Uo(n),hm(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function Qr(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(pp(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function pp(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===xi)||(e.globalVersion=xi,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!Qr(e))))return;e.flags|=2;const t=e.dep,s=ct,n=Is;ct=e,Is=!0;try{dp(e);const a=e.fn(e._value);(t.version===0||Nt(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{ct=s,Is=n,up(e),e.flags&=-3}}function Uo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Uo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function hm(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function gm(e,t){e.effect instanceof yi&&(e=e.effect.fn);const s=new yi(e);t&&ze(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function mm(e){e.effect.stop()}let Is=!0;const fp=[];function mn(){fp.push(Is),Is=!1}function vn(){const e=fp.pop();Is=e===void 0?!0:e}function td(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=ct;ct=void 0;try{t()}finally{ct=s}}}let xi=0;class vm{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class tr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!ct||!Is||ct===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==ct)s=this.activeLink=new vm(ct,this),ct.deps?(s.prevDep=ct.depsTail,ct.depsTail.nextDep=s,ct.depsTail=s):ct.deps=ct.depsTail=s,hp(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=ct.depsTail,s.nextDep=void 0,ct.depsTail.nextDep=s,ct.depsTail=s,ct.deps===s&&(ct.deps=n)}return s}trigger(t){this.version++,xi++,this.notify(t)}notify(t){Fo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{$o()}}}function hp(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)hp(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const yl=new WeakMap,Gn=Symbol(""),Xr=Symbol(""),_i=Symbol("");function jt(e,t,s){if(Is&&ct){let n=yl.get(e);n||yl.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new tr),a.map=n,a.key=s),a.track()}}function ln(e,t,s,n,a,i){const l=yl.get(e);if(!l){xi++;return}const r=o=>{o&&o.trigger()};if(Fo(),t==="clear")l.forEach(r);else{const o=be(e),c=o&&Jl(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===_i||!Kt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(_i)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Gn)),ka(e)&&r(l.get(Xr)));break;case"delete":o||(r(l.get(Gn)),ka(e)&&r(l.get(Xr)));break;case"set":ka(e)&&r(l.get(Gn));break}}$o()}function bm(e,t){const s=yl.get(e);return s&&s.get(t)}function da(e){const t=Ze(e);return t===e?t:(jt(t,"iterate",_i),cs(e)?t:t.map(Ls))}function sr(e){return jt(e=Ze(e),"iterate",_i),e}function js(e,t){return qs(e)?Oa(pn(e)?Ls(t):t):Ls(t)}const ym={__proto__:null,[Symbol.iterator](){return Ar(this,Symbol.iterator,e=>js(this,e))},concat(...e){return da(this).concat(...e.map(t=>be(t)?da(t):t))},entries(){return Ar(this,"entries",e=>(e[1]=js(this,e[1]),e))},every(e,t){return Ys(this,"every",e,t,void 0,arguments)},filter(e,t){return Ys(this,"filter",e,t,s=>s.map(n=>js(this,n)),arguments)},find(e,t){return Ys(this,"find",e,t,s=>js(this,s),arguments)},findIndex(e,t){return Ys(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Ys(this,"findLast",e,t,s=>js(this,s),arguments)},findLastIndex(e,t){return Ys(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Ys(this,"forEach",e,t,void 0,arguments)},includes(...e){return Rr(this,"includes",e)},indexOf(...e){return Rr(this,"indexOf",e)},join(e){return da(this).join(e)},lastIndexOf(...e){return Rr(this,"lastIndexOf",e)},map(e,t){return Ys(this,"map",e,t,void 0,arguments)},pop(){return Ga(this,"pop")},push(...e){return Ga(this,"push",e)},reduce(e,...t){return sd(this,"reduce",e,t)},reduceRight(e,...t){return sd(this,"reduceRight",e,t)},shift(){return Ga(this,"shift")},some(e,t){return Ys(this,"some",e,t,void 0,arguments)},splice(...e){return Ga(this,"splice",e)},toReversed(){return da(this).toReversed()},toSorted(e){return da(this).toSorted(e)},toSpliced(...e){return da(this).toSpliced(...e)},unshift(...e){return Ga(this,"unshift",e)},values(){return Ar(this,"values",e=>js(this,e))}};function Ar(e,t,s){const n=sr(e),a=n[t]();return n!==e&&!cs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const xm=Array.prototype;function Ys(e,t,s,n,a,i){const l=sr(e),r=l!==e&&!cs(e),o=l[t];if(o!==xm[t]){const u=o.apply(e,i);return r?Ls(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,js(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function sd(e,t,s,n){const a=sr(e),i=a!==e&&!cs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=js(e,c)),s.call(this,c,js(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?js(e,o):o}function Rr(e,t,s){const n=Ze(e);jt(n,"iterate",_i);const a=n[t](...s);return(a===-1||a===!1)&&Ui(s[0])?(s[0]=Ze(s[0]),n[t](...s)):a}function Ga(e,t,s=[]){mn(),Fo();const n=Ze(e)[t].apply(e,s);return $o(),vn(),n}const _m=bs("__proto__,__v_isRef,__isVue"),gp=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(Kt));function km(e){Kt(e)||(e=String(e));const t=Ze(this);return jt(t,"has",e),t.hasOwnProperty(e)}class mp{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?kp:_p:i?xp:yp).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=be(t);if(!a){let o;if(l&&(o=ym[s]))return o;if(s==="hasOwnProperty")return km}const r=Reflect.get(t,s,St(t)?t:n);if((Kt(s)?gp.has(s):_m(s))||(a||jt(t,"get",s),i))return r;if(St(r)){const o=l&&Jl(s)?r:r.value;return a&&Qe(o)?xl(o):o}return Qe(r)?a?xl(r):Pn(r):r}}class vp extends mp{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=be(t)&&Jl(s);if(!this._isShallow){const c=qs(i);if(!cs(n)&&!qs(n)&&(i=Ze(i),n=Ze(n)),!l&&St(i)&&!St(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:Xe(t,s),o=Reflect.set(t,s,n,St(t)?t:a);return t===Ze(a)&&(r?Nt(n,i)&&ln(t,"set",s,n):ln(t,"add",s,n)),o}deleteProperty(t,s){const n=Xe(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&ln(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!Kt(s)||!gp.has(s))&&jt(t,"has",s),n}ownKeys(t){return jt(t,"iterate",be(t)?"length":Gn),Reflect.ownKeys(t)}}class bp extends mp{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const wm=new vp,Sm=new bp,Tm=new vp(!0),Cm=new bp(!0),eo=e=>e,Ji=e=>Reflect.getPrototypeOf(e);function Em(e,t,s){return function(...n){const a=this.__v_raw,i=Ze(a),l=ka(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?eo:t?Oa:Ls;return!t&&jt(i,"iterate",o?Xr:Gn),ze(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function Yi(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Am(e,t){const s={get(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);e||(Nt(a,r)&&jt(l,"get",a),jt(l,"get",r));const{has:o}=Ji(l),c=t?eo:e?Oa:Ls;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&jt(Ze(a),"iterate",Gn),a.size},has(a){const i=this.__v_raw,l=Ze(i),r=Ze(a);return e||(Nt(a,r)&&jt(l,"has",a),jt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ze(r),c=t?eo:e?Oa:Ls;return!e&&jt(o,"iterate",Gn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return ze(s,e?{add:Yi("add"),set:Yi("set"),delete:Yi("delete"),clear:Yi("clear")}:{add(a){const i=Ze(this),l=Ji(i),r=Ze(a),o=!t&&!cs(a)&&!qs(a)?r:a;return l.has.call(i,o)||Nt(a,o)&&l.has.call(i,a)||Nt(r,o)&&l.has.call(i,r)||(i.add(o),ln(i,"add",o,o)),this},set(a,i){!t&&!cs(i)&&!qs(i)&&(i=Ze(i));const l=Ze(this),{has:r,get:o}=Ji(l);let c=r.call(l,a);c||(a=Ze(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?Nt(i,d)&&ln(l,"set",a,i):ln(l,"add",a,i),this},delete(a){const i=Ze(this),{has:l,get:r}=Ji(i);let o=l.call(i,a);o||(a=Ze(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&ln(i,"delete",a,void 0),c},clear(){const a=Ze(this),i=a.size!==0,l=a.clear();return i&&ln(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Em(a,e,t)}),s}function nr(e,t){const s=Am(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(Xe(s,a)&&a in n?s:n,a,i)}const Rm={get:nr(!1,!1)},Im={get:nr(!1,!0)},Om={get:nr(!0,!1)},Lm={get:nr(!0,!0)},yp=new WeakMap,xp=new WeakMap,_p=new WeakMap,kp=new WeakMap;function Nm(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function Pn(e){return qs(e)?e:ar(e,!1,wm,Rm,yp)}function Bo(e){return ar(e,!1,Tm,Im,xp)}function xl(e){return ar(e,!0,Sm,Om,_p)}function Dm(e){return ar(e,!0,Cm,Lm,kp)}function ar(e,t,s,n,a){if(!Qe(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Nm(jg(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function pn(e){return qs(e)?pn(e.__v_raw):!!(e&&e.__v_isReactive)}function qs(e){return!!(e&&e.__v_isReadonly)}function cs(e){return!!(e&&e.__v_isShallow)}function Ui(e){return e?!!e.__v_raw:!1}function Ze(e){const t=e&&e.__v_raw;return t?Ze(t):e}function wp(e){return!Xe(e,"__v_skip")&&Object.isExtensible(e)&&tp(e,"__v_skip",!0),e}const Ls=e=>Qe(e)?Pn(e):e,Oa=e=>Qe(e)?xl(e):e;function St(e){return e?e.__v_isRef===!0:!1}function h(e){return Sp(e,!1)}function Ho(e){return Sp(e,!0)}function Sp(e,t){return St(e)?e:new Mm(e,t)}class Mm{constructor(t,s){this.dep=new tr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ze(t),this._value=s?t:Ls(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||cs(t)||qs(t);t=n?t:Ze(t),Nt(t,s)&&(this._rawValue=t,this._value=n?t:Ls(t),this.dep.trigger())}}function Pm(e){e.dep&&e.dep.trigger()}function zs(e){return St(e)?e.value:e}function Fm(e){return Ae(e)?e():zs(e)}const $m={get:(e,t,s)=>t==="__v_raw"?e:zs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return St(a)&&!St(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function Vo(e){return pn(e)?e:new Proxy(e,$m)}class Um{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new tr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Tp(e){return new Um(e)}function Bm(e){const t=be(e)?new Array(e.length):{};for(const s in e)t[s]=Cp(e,s);return t}class Hm{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=Kt(s)?s:String(s),this._raw=Ze(t);let a=!0,i=t;if(!be(t)||Kt(this._key)||!Jl(this._key))do a=!Ui(i)||cs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=zs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&St(this._raw[this._key])){const s=this._object[this._key];if(St(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return bm(this._raw,this._key)}}class Vm{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function jm(e,t,s){return St(e)?e:Ae(e)?new Vm(e):Qe(e)&&arguments.length>1?Cp(e,t,s):h(e)}function Cp(e,t,s){return new Hm(e,t,s)}class zm{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new tr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=xi-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&ct!==this)return cp(this,!0),!0}get value(){const t=this.dep.track();return pp(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function qm(e,t,s=!1){let n,a;return Ae(e)?n=e:(n=e.get,a=e.set),new zm(n,a,s)}const Km={GET:"get",HAS:"has",ITERATE:"iterate"},Gm={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},Qi={},_l=new WeakMap;let Rn;function Wm(){return Rn}function Ep(e,t=!1,s=Rn){if(s){let n=_l.get(s);n||_l.set(s,n=[]),n.push(e)}}function Zm(e,t,s=Ke){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:cs(_)||a===!1||a===0?rn(_,1):rn(_);let d,u,p,f,v=!1,g=!1;if(St(e)?(u=()=>e.value,v=cs(e)):pn(e)?(u=()=>c(e),v=!0):be(e)?(g=!0,v=e.some(_=>pn(_)||cs(_)),u=()=>e.map(_=>{if(St(_))return _.value;if(pn(_))return c(_);if(Ae(_))return o?o(_,2):_()})):Ae(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){mn();try{p()}finally{vn()}}const _=Rn;Rn=d;try{return o?o(e,3,[f]):e(f)}finally{Rn=_}}:u=Ut,t&&a){const _=u,w=a===!0?1/0:a;u=()=>rn(_(),w)}const T=rp(),R=()=>{d.stop(),T&&T.active&&Do(T.effects,d)};if(i&&t){const _=t;t=(...w)=>{const D=_(...w);return R(),D}}let y=g?new Array(e.length).fill(Qi):Qi;const m=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const w=d.run();if(_||a||v||(g?w.some((D,O)=>Nt(D,y[O])):Nt(w,y))){p&&p();const D=Rn;Rn=d;try{const O=[w,y===Qi?void 0:g&&y[0]===Qi?[]:y,f];y=w,o?o(t,3,O):t(...O)}finally{Rn=D}}}else d.run()};return r&&r(m),d=new yi(u),d.scheduler=l?()=>l(m,!1):m,f=_=>Ep(_,!1,d),p=d.onStop=()=>{const _=_l.get(d);if(_){if(o)o(_,4);else for(const w of _)w();_l.delete(d)}},t?n?m(!0):y=d.run():l?l(m.bind(null,!0),!0):d.run(),R.pause=d.pause.bind(d),R.resume=d.resume.bind(d),R.stop=R,R}function rn(e,t=1/0,s){if(t<=0||!Qe(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,St(e))rn(e.value,t,s);else if(be(e))for(let n=0;n<e.length;n++)rn(e[n],t,s);else if(na(e)||ka(e))e.forEach(n=>{rn(n,t,s)});else if(Zl(e)){for(const n in e)rn(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&rn(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ap=[];function Jm(e){Ap.push(e)}function Ym(){Ap.pop()}function Qm(e,t){}const Xm={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},ev={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function za(e,t,s,n){try{return n?e(...n):e()}catch(a){ia(a,t,s)}}function ms(e,t,s,n){if(Ae(e)){const a=za(e,t,s,n);return a&&Mo(a)&&a.catch(i=>{ia(i,t,s)}),a}if(be(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ms(e[i],t,s,n));return a}}function ia(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Ke;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){mn(),za(i,null,10,[e,o,c]),vn();return}}tv(e,s,a,n,l)}function tv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Yt=[];let Hs=-1;const Ta=[];let In=null,ga=0;const Rp=Promise.resolve();let kl=null;function It(e){const t=kl||Rp;return e?t.then(this?e.bind(this):e):t}function sv(e){let t=Hs+1,s=Yt.length;for(;t<s;){const n=t+s>>>1,a=Yt[n],i=wi(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function jo(e){if(!(e.flags&1)){const t=wi(e),s=Yt[Yt.length-1];!s||!(e.flags&2)&&t>=wi(s)?Yt.push(e):Yt.splice(sv(t),0,e),e.flags|=1,Ip()}}function Ip(){kl||(kl=Rp.then(Op))}function ki(e){be(e)?Ta.push(...e):In&&e.id===-1?In.splice(ga+1,0,e):e.flags&1||(Ta.push(e),e.flags|=1),Ip()}function nd(e,t,s=Hs+1){for(;s<Yt.length;s++){const n=Yt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Yt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function wl(e){if(Ta.length){const t=[...new Set(Ta)].sort((s,n)=>wi(s)-wi(n));if(Ta.length=0,In){In.push(...t);return}for(In=t,ga=0;ga<In.length;ga++){const s=In[ga];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}In=null,ga=0}}const wi=e=>e.id==null?e.flags&2?-1:1/0:e.id;function Op(e){try{for(Hs=0;Hs<Yt.length;Hs++){const t=Yt[Hs];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),za(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;Hs<Yt.length;Hs++){const t=Yt[Hs];t&&(t.flags&=-2)}Hs=-1,Yt.length=0,wl(),kl=null,(Yt.length||Ta.length)&&Op()}}let ma,Xi=[];function Lp(e,t){var s,n;ma=e,ma?(ma.enabled=!0,Xi.forEach(({event:a,args:i})=>ma.emit(a,...i)),Xi=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Lp(i,t)}),setTimeout(()=>{ma||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,Xi=[])},3e3)):Xi=[]}let $t=null,ir=null;function Si(e){const t=$t;return $t=e,ir=e&&e.type.__scopeId||null,t}function nv(e){ir=e}function av(){ir=null}const iv=e=>zo;function zo(e,t=$t,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Ai(-1);const i=Si(t);let l;try{l=e(...a)}finally{Si(i),n._d&&Ai(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function lv(e,t){if($t===null)return e;const s=ji($t),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Ke]=t[a];i&&(Ae(i)&&(i={mounted:i,updated:i}),i.deep&&rn(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function Vs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(mn(),ms(o,s,8,[e.el,r,e,t]),vn())}}function di(e,t){if(Ft){let s=Ft.provides;const n=Ft.parent&&Ft.parent.provides;n===s&&(s=Ft.provides=Object.create(n)),s[e]=t}}function Ss(e,t,s=!1){const n=Xt();if(n||Wn){let a=Wn?Wn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ae(t)?t.call(n&&n.proxy):t}}function rv(){return!!(Xt()||Wn)}const Np=Symbol.for("v-scx"),Dp=()=>Ss(Np);function ov(e,t){return Bi(e,null,t)}function cv(e,t){return Bi(e,null,{flush:"post"})}function Mp(e,t){return Bi(e,null,{flush:"sync"})}function ds(e,t,s){return Bi(e,t,s)}function Bi(e,t,s=Ke){const{immediate:n,deep:a,flush:i,once:l}=s,r=ze({},s),o=t&&n||!t&&i!=="post";let c;if(Xn){if(i==="sync"){const f=Dp();c=f.__watcherHandles||(f.__watcherHandles=[])}else if(!o){const f=()=>{};return f.stop=Ut,f.resume=Ut,f.pause=Ut,f}}const d=Ft;r.call=(f,v,g)=>ms(f,d,v,g);let u=!1;i==="post"?r.scheduler=f=>{kt(f,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(f,v)=>{v?f():jo(f)}),r.augmentJob=f=>{t&&(f.flags|=4),u&&(f.flags|=2,d&&(f.id=d.uid,f.i=d))};const p=Zm(e,t,r);return Xn&&(c?c.push(p):o&&p()),p}function dv(e,t,s){const n=this.proxy,a=De(e)?e.includes(".")?Pp(n,e):()=>n[e]:e.bind(n,n);let i;Ae(t)?i=t:(i=t.handler,s=t);const l=qa(this),r=Bi(a,i.bind(n),s);return l(),r}function Pp(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Cn=new WeakMap,Fp=Symbol("_vte"),$p=e=>e.__isTeleport,jn=e=>e&&(e.disabled||e.disabled===""),uv=e=>e&&(e.defer||e.defer===""),ad=e=>typeof SVGElement<"u"&&e instanceof SVGElement,id=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,to=(e,t)=>{const s=e&&e.to;return De(s)?t?t(s):null:s},pv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:f,querySelector:v,createText:g,createComment:T,parentNode:R}}=c,y=jn(t.props);let{dynamicChildren:m}=t;const _=(O,E,C)=>{O.shapeFlag&16&&d(O.children,E,C,a,i,l,r,o)},w=(O=t)=>{const E=jn(O.props),C=O.target=to(O.props,v),I=so(C,O,g,f);C&&(l!=="svg"&&ad(C)?l="svg":l!=="mathml"&&id(C)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(C),E||(_(O,C,I),ni(O,!1)))},D=O=>{const E=()=>{if(Cn.get(O)===E){if(Cn.delete(O),jn(O.props)){const C=R(O.el)||s;_(O,C,O.anchor),ni(O,!0)}w(O)}};Cn.set(O,E),kt(E,i)};if(e==null){const O=t.el=g(""),E=t.anchor=g("");if(f(O,s,n),f(E,s,n),uv(t.props)||i&&i.pendingBranch){D(t);return}y&&(_(t,s,E),ni(t,!0)),w()}else{t.el=e.el;const O=t.anchor=e.anchor,E=Cn.get(e);if(E){E.flags|=8,Cn.delete(e),D(t);return}t.targetStart=e.targetStart;const C=t.target=e.target,I=t.targetAnchor=e.targetAnchor,B=jn(e.props),M=B?s:C,L=B?O:I;if(l==="svg"||ad(C)?l="svg":(l==="mathml"||id(C))&&(l="mathml"),m?(p(e.dynamicChildren,m,M,a,i,l,r),tc(e,t,!0)):o||u(e,t,M,L,a,i,l,r,!1),y)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):el(t,s,O,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const W=t.target=to(t.props,v);W&&el(t,W,null,c,0)}else B&&el(t,C,I,c,1);ni(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,f=i||!jn(p),v=Cn.get(e);if(v&&(v.flags|=8,Cn.delete(e)),u&&(a(c),a(d)),i&&a(o),!v&&l&16)for(let g=0;g<r.length;g++){const T=r[g];n(T,t,s,f,!!T.dynamicChildren)}},move:el,hydrate:fv};function el(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Cn.has(e)&&(!u||jn(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function fv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(T,R){let y=R;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,T._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function f(T,R){R.anchor=u(l(T),R,r(T),s,n,a,i)}const v=t.target=to(t.props,o),g=jn(t.props);if(v){const T=v._lpa||v.firstChild;t.shapeFlag&16&&(g?(f(e,t),p(v,T),t.targetAnchor||so(v,t,d,c,r(e)===v?e:null)):(t.anchor=l(e),p(v,T),t.targetAnchor||so(v,t,d,c),u(T&&l(T),t,v,s,n,a,i))),ni(t,g)}else g&&t.shapeFlag&16&&(f(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const hv=pv;function ni(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function so(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[Fp]=l,e&&(n(i,e,a),n(l,e,a)),l}const _s=Symbol("_leaveCb"),Wa=Symbol("_enterCb");function qo(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Je(()=>{e.isMounted=!0}),cr(()=>{e.isUnmounting=!0}),e}const xs=[Function,Array],Ko={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:xs,onEnter:xs,onAfterEnter:xs,onEnterCancelled:xs,onBeforeLeave:xs,onLeave:xs,onAfterLeave:xs,onLeaveCancelled:xs,onBeforeAppear:xs,onAppear:xs,onAfterAppear:xs,onAppearCancelled:xs},Up=e=>{const t=e.subTree;return t.component?Up(t.component):t},gv={name:"BaseTransition",props:Ko,setup(e,{slots:t}){const s=Xt(),n=qo();return()=>{const a=t.default&&lr(t.default(),!0),i=a&&a.length?Bp(a):s.subTree?wf():void 0;if(!i)return;const l=Ze(e),{mode:r}=l;if(n.isLeaving)return Ir(i);const o=ld(i);if(!o)return Ir(i);let c=La(o,l,n,s,u=>c=u);o.type!==yt&&bn(o,c);let d=s.subTree&&ld(s.subTree);if(d&&d.type!==yt&&!Rs(d,o)&&Up(s).type!==yt){let u=La(d,l,n,s);if(bn(d,u),r==="out-in"&&o.type!==yt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Ir(i);r==="in-out"&&o.type!==yt?u.delayLeave=(p,f,v)=>{const g=Vp(n,d);g[String(d.key)]=d,p[_s]=()=>{f(),p[_s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{v(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Bp(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==yt){t=s;break}}return t}const Hp=gv;function Vp(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function La(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:f,onAfterLeave:v,onLeaveCancelled:g,onBeforeAppear:T,onAppear:R,onAfterAppear:y,onAppearCancelled:m}=t,_=String(e.key),w=Vp(s,e),D=(C,I)=>{C&&ms(C,n,9,I)},O=(C,I)=>{const B=I[1];D(C,I),be(C)?C.every(M=>M.length<=1)&&B():C.length<=1&&B()},E={mode:l,persisted:r,beforeEnter(C){let I=o;if(!s.isMounted)if(i)I=T||o;else return;C[_s]&&C[_s](!0);const B=w[_];B&&Rs(e,B)&&B.el[_s]&&B.el[_s](),D(I,[C])},enter(C){if(w[_]===e)return;let I=c,B=d,M=u;if(!s.isMounted)if(i)I=R||c,B=y||d,M=m||u;else return;let L=!1;C[Wa]=ee=>{L||(L=!0,ee?D(M,[C]):D(B,[C]),E.delayedLeave&&E.delayedLeave(),C[Wa]=void 0)};const W=C[Wa].bind(null,!1);I?O(I,[C,W]):W()},leave(C,I){const B=String(e.key);if(C[Wa]&&C[Wa](!0),s.isUnmounting)return I();D(p,[C]);let M=!1;C[_s]=W=>{M||(M=!0,I(),W?D(g,[C]):D(v,[C]),C[_s]=void 0,w[B]===e&&delete w[B])};const L=C[_s].bind(null,!1);w[B]=e,f?O(f,[C,L]):L()},clone(C){const I=La(C,t,s,n,a);return a&&a(I),I}};return E}function Ir(e){if(Vi(e))return e=Ks(e),e.children=null,e}function ld(e){if(!Vi(e))return $p(e.type)&&e.children?Bp(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ae(s.default))return s.default()}}function bn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,bn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function lr(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Dt?(l.patchFlag&128&&a++,n=n.concat(lr(l.children,t,r))):(t||l.type!==yt)&&n.push(r!=null?Ks(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Hi(e,t){return Ae(e)?ze({name:e.name},t,{setup:e}):e}function mv(){const e=Xt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function Go(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function vv(e){const t=Xt(),s=Ho(null);if(t){const a=t.refs===Ke?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function rd(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Sl=new WeakMap;function Ca(e,t,s,n,a=!1){if(be(e)){e.forEach((g,T)=>Ca(g,t&&(be(t)?t[T]:t),s,n,a));return}if(fn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Ca(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?ji(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Ke?r.refs={}:r.refs,u=r.setupState,p=Ze(u),f=u===Ke?ya:g=>rd(d,g)?!1:Xe(p,g),v=(g,T)=>!(T&&rd(d,T));if(c!=null&&c!==o){if(od(t),De(c))d[c]=null,f(c)&&(u[c]=null);else if(St(c)){const g=t;v(c,g.k)&&(c.value=null),g.k&&(d[g.k]=null)}}if(Ae(o))za(o,r,12,[l,d]);else{const g=De(o),T=St(o);if(g||T){const R=()=>{if(e.f){const y=g?f(o)?u[o]:d[o]:v()||!e.k?o.value:d[e.k];if(a)be(y)&&Do(y,i);else if(be(y))y.includes(i)||y.push(i);else if(g)d[o]=[i],f(o)&&(u[o]=d[o]);else{const m=[i];v(o,e.k)&&(o.value=m),e.k&&(d[e.k]=m)}}else g?(d[o]=l,f(o)&&(u[o]=l)):T&&(v(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{R(),Sl.delete(e)};y.id=-1,Sl.set(e,y),kt(y,s)}else od(e),R()}}}function od(e){const t=Sl.get(e);t&&(t.flags|=8,Sl.delete(e))}let cd=!1;const ua=()=>{cd||(console.error("Hydration completed but contains mismatches."),cd=!0)},bv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",yv=e=>e.namespaceURI.includes("MathML"),tl=e=>{if(e.nodeType===1){if(bv(e))return"svg";if(yv(e))return"mathml"}},xa=e=>e.nodeType===8;function xv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(m,_)=>{if(!_.hasChildNodes()){s(null,m,_),wl(),_._vnode=m;return}u(_.firstChild,m,null,null,null),wl(),_._vnode=m},u=(m,_,w,D,O,E=!1)=>{E=E||!!_.dynamicChildren;const C=xa(m)&&m.data==="[",I=()=>g(m,_,w,D,O,C),{type:B,ref:M,shapeFlag:L,patchFlag:W}=_;let ee=m.nodeType;_.el=m,W===-2&&(E=!1,_.dynamicChildren=null);let $=null;switch(B){case Nn:ee!==3?_.children===""?(o(_.el=a(""),l(m),m),$=m):$=I():(m.data!==_.children&&(ua(),m.data=_.children),$=i(m));break;case yt:y(m)?($=i(m),R(_.el=m.content.firstChild,m,w)):ee!==8||C?$=I():$=i(m);break;case Zn:if(C&&(m=i(m),ee=m.nodeType),ee===1||ee===3){$=m;const k=!_.children.length;for(let x=0;x<_.staticCount;x++)k&&(_.children+=$.nodeType===1?$.outerHTML:$.data),x===_.staticCount-1&&(_.anchor=$),$=i($);return C?i($):$}else I();break;case Dt:C?$=v(m,_,w,D,O,E):$=I();break;default:if(L&1)(ee!==1||_.type.toLowerCase()!==m.tagName.toLowerCase())&&!y(m)?$=I():$=p(m,_,w,D,O,E);else if(L&6){_.slotScopeIds=O;const k=l(m);if(C?$=T(m):xa(m)&&m.data==="teleport start"?$=T(m,m.data,"teleport end"):$=i(m),t(_,k,null,w,D,tl(k),E),fn(_)&&!_.type.__asyncResolved){let x;C?(x=pt(Dt),x.anchor=$?$.previousSibling:k.lastChild):x=m.nodeType===3?nc(""):pt("div"),x.el=m,_.component.subTree=x}}else L&64?ee!==8?$=I():$=_.type.hydrate(m,_,w,D,O,E,e,f):L&128&&($=_.type.hydrate(m,_,w,D,tl(l(m)),O,E,e,u))}return M!=null&&Ca(M,null,D,_),$},p=(m,_,w,D,O,E)=>{E=E||!!_.dynamicChildren;const{type:C,props:I,patchFlag:B,shapeFlag:M,dirs:L,transition:W}=_,ee=C==="input"||C==="option";if(ee||B!==-1){L&&Vs(_,null,w,"created");let $=!1;if(y(m)){$=hf(null,W)&&w&&w.vnode.props&&w.vnode.props.appear;const x=m.content.firstChild;if($){const F=x.getAttribute("class");F&&(x.$cls=F),W.beforeEnter(x)}R(x,m,w),_.el=m=x}if(M&16&&!(I&&(I.innerHTML||I.textContent))){let x=f(m.firstChild,_,m,w,D,O,E);for(x&&!sl(m,1)&&ua();x;){const F=x;x=x.nextSibling,r(F)}}else if(M&8){let x=_.children;x[0]===`
`&&(m.tagName==="PRE"||m.tagName==="TEXTAREA")&&(x=x.slice(1));const{textContent:F}=m;F!==x&&F!==x.replace(/\r\n|\r/g,`
`)&&(sl(m,0)||ua(),m.textContent=_.children)}if(I){if(ee||!E||B&48){const x=m.tagName.includes("-");for(const F in I)(ee&&(F.endsWith("value")||F==="indeterminate")||sa(F)&&!un(F)||F[0]==="."||x&&!un(F))&&n(m,F,null,I[F],void 0,w)}else if(I.onClick)n(m,"onClick",null,I.onClick,void 0,w);else if(B&4&&pn(I.style))for(const x in I.style)I.style[x]}let k;(k=I&&I.onVnodeBeforeMount)&&as(k,w,_),L&&Vs(_,null,w,"beforeMount"),((k=I&&I.onVnodeMounted)||L||$)&&bf(()=>{k&&as(k,w,_),$&&W.enter(m),L&&Vs(_,null,w,"mounted")},D)}return m.nextSibling},f=(m,_,w,D,O,E,C)=>{C=C||!!_.dynamicChildren;const I=_.children,B=I.length;let M=!1;for(let L=0;L<B;L++){const W=C?I[L]:I[L]=ls(I[L]),ee=W.type===Nn;m?(ee&&!C&&L+1<B&&ls(I[L+1]).type===Nn&&(o(a(m.data.slice(W.children.length)),w,i(m)),m.data=W.children),m=u(m,W,D,O,E,C)):ee&&!W.children?o(W.el=a(""),w):(M||(M=!0,sl(w,1)||ua()),s(null,W,w,null,D,O,tl(w),E))}return m},v=(m,_,w,D,O,E)=>{const{slotScopeIds:C}=_;C&&(O=O?O.concat(C):C);const I=l(m),B=f(i(m),_,I,w,D,O,E);return B&&xa(B)&&B.data==="]"?i(_.anchor=B):(ua(),o(_.anchor=c("]"),I,B),B)},g=(m,_,w,D,O,E)=>{if(sl(m.parentElement,1)||ua(),_.el=null,E){const B=T(m);for(;;){const M=i(m);if(M&&M!==B)r(M);else break}}const C=i(m),I=l(m);return r(m),s(null,_,I,C,w,D,tl(I),O),w&&(w.vnode.el=_.el,ur(w,_.el)),C},T=(m,_="[",w="]")=>{let D=0;for(;m;)if(m=i(m),m&&xa(m)&&(m.data===_&&D++,m.data===w)){if(D===0)return i(m);D--}return m},R=(m,_,w)=>{const D=_.parentNode;D&&D.replaceChild(m,_);let O=w;for(;O;)O.vnode.el===_&&(O.vnode.el=O.subTree.el=m),O=O.parent},y=m=>m.nodeType===1&&m.tagName==="TEMPLATE";return[d,u]}const dd="data-allow-mismatch",_v={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function sl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(dd);)e=e.parentElement;const s=e&&e.getAttribute(dd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(_v[t])}}const kv=Xl().requestIdleCallback||(e=>setTimeout(e,1)),wv=Xl().cancelIdleCallback||(e=>clearTimeout(e)),Sv=(e=1e4)=>t=>{const s=kv(t,{timeout:e});return()=>wv(s)};function Tv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Cv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Tv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Ev=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Av=(e=[])=>(t,s)=>{De(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Rv(e,t){if(xa(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(xa(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const fn=e=>!!e.type.__asyncLoader;function Iv(e){Ae(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,f()),f=()=>{let v;return c||(v=c=t().catch(g=>{if(g=g instanceof Error?g:new Error(String(g)),o)return new Promise((T,R)=>{o(g,()=>T(p()),()=>R(g),u+1)});throw g}).then(g=>v!==c&&c?c:(g&&(g.__esModule||g[Symbol.toStringTag]==="Module")&&(g=g.default),d=g,g)))};return Hi({name:"AsyncComponentWrapper",__asyncLoader:f,__asyncHydrate(v,g,T){let R=!1;(g.bu||(g.bu=[])).push(()=>R=!0);const y=()=>{R||T()},m=i?()=>{const _=i(y,w=>Rv(v,w));_&&(g.bum||(g.bum=[])).push(_)}:y;d?m():f().then(()=>!g.isUnmounted&&m())},get __asyncResolved(){return d},setup(){const v=Ft;if(Go(v),d)return()=>nl(d,v);const g=w=>{c=null,ia(w,v,13,!n)};if(r&&v.suspense||Xn)return f().then(w=>()=>nl(w,v)).catch(w=>(g(w),()=>n?pt(n,{error:w}):null));const T=h(!1),R=h(),y=h(!!a);let m,_;return xt(()=>{m!=null&&clearTimeout(m),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{v.isUnmounted||(y.value=!1)},a)),l!=null&&(m=setTimeout(()=>{if(!v.isUnmounted&&!T.value&&!R.value){const w=new Error(`Async component timed out after ${l}ms.`);g(w),R.value=w}},l)),f().then(()=>{v.isUnmounted||(T.value=!0,v.parent&&Vi(v.parent.vnode)&&v.parent.update())}).catch(w=>{if(v.isUnmounted){c=null;return}g(w),R.value=w}),()=>{if(T.value&&d)return nl(d,v);if(R.value&&n)return pt(n,{error:R.value});if(s&&!y.value)return nl(s,v)}}})}function nl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=pt(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Vi=e=>e.type.__isKeepAlive,Ov={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Xt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,m,_,w,D)=>{const O=y.component;c(y,m,_,0,r),o(O.vnode,y,m,_,O,r,w,y.slotScopeIds,D),kt(()=>{O.isDeactivated=!1,O.a&&Sa(O.a);const E=y.props&&y.props.onVnodeMounted;E&&as(E,O.parent,y)},r)},n.deactivate=y=>{const m=y.component;Cl(m.m),Cl(m.a),c(y,p,null,1,r),kt(()=>{m.da&&Sa(m.da);const _=y.props&&y.props.onVnodeUnmounted;_&&as(_,m.parent,y),m.isDeactivated=!0},r)};function f(y){Or(y),d(y,s,r,!0)}function v(y){a.forEach((m,_)=>{const w=po(fn(m)?m.type.__asyncResolved||{}:m.type);w&&!y(w)&&g(_)})}function g(y){const m=a.get(y);m&&(!l||!Rs(m,l))?f(m):l&&Or(l),a.delete(y),i.delete(y)}ds(()=>[e.include,e.exclude],([y,m])=>{y&&v(_=>ai(y,_)),m&&v(_=>!ai(m,_))},{flush:"post",deep:!0});let T=null;const R=()=>{T!=null&&(El(s.subTree.type)?kt(()=>{a.set(T,al(s.subTree))},s.subTree.suspense):a.set(T,al(s.subTree)))};return Je(R),or(R),cr(()=>{a.forEach(y=>{const{subTree:m,suspense:_}=s,w=al(m);if(y.type===w.type&&y.key===w.key){Or(w);const D=w.component.da;D&&kt(D,_);return}f(y)})}),()=>{if(T=null,!t.default)return l=null;const y=t.default(),m=y[0];if(y.length>1)return l=null,y;if(!yn(m)||!(m.shapeFlag&4)&&!(m.shapeFlag&128))return l=null,m;let _=al(m);if(_.type===yt)return l=null,_;const w=_.type,D=po(fn(_)?_.type.__asyncResolved||{}:w),{include:O,exclude:E,max:C}=e;if(O&&(!D||!ai(O,D))||E&&D&&ai(E,D))return _.shapeFlag&=-257,l=_,m;const I=_.key==null?w:_.key,B=a.get(I);return _.el&&(_=Ks(_),m.shapeFlag&128&&(m.ssContent=_)),T=I,B?(_.el=B.el,_.component=B.component,_.transition&&bn(_,_.transition),_.shapeFlag|=512,i.delete(I),i.add(I)):(i.add(I),C&&i.size>parseInt(C,10)&&g(i.values().next().value)),_.shapeFlag|=256,l=_,El(m.type)?m:_}}},Lv=Ov;function ai(e,t){return be(e)?e.some(s=>ai(s,t)):De(e)?e.split(",").includes(t):Vg(e)?(e.lastIndex=0,e.test(t)):!1}function Es(e,t){jp(e,"a",t)}function As(e,t){jp(e,"da",t)}function jp(e,t,s=Ft){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(rr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Vi(a.parent.vnode)&&Nv(n,t,s,a),a=a.parent}}function Nv(e,t,s,n){const a=rr(t,e,n,!0);xt(()=>{Do(n[t],a)},s)}function Or(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function al(e){return e.shapeFlag&128?e.ssContent:e}function rr(e,t,s=Ft,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{mn();const r=qa(s),o=ms(t,s,e,l);return r(),vn(),o});return n?a.unshift(i):a.push(i),i}}const xn=e=>(t,s=Ft)=>{(!Xn||e==="sp")&&rr(e,(...n)=>t(...n),s)},zp=xn("bm"),Je=xn("m"),Wo=xn("bu"),or=xn("u"),cr=xn("bum"),xt=xn("um"),qp=xn("sp"),Kp=xn("rtg"),Gp=xn("rtc");function Wp(e,t=Ft){rr("ec",e,t)}const Zo="components",Dv="directives";function Mv(e,t){return Jo(Zo,e,!0,t)||e}const Zp=Symbol.for("v-ndc");function Pv(e){return De(e)?Jo(Zo,e,!1)||e:e||Zp}function Fv(e){return Jo(Dv,e)}function Jo(e,t,s=!0,n=!1){const a=$t||Ft;if(a){const i=a.type;if(e===Zo){const r=po(i,!1);if(r&&(r===t||r===at(t)||r===aa(at(t))))return i}const l=ud(a[e]||i[e],t)||ud(a.appContext[e],t);return!l&&n?i:l}}function ud(e,t){return e&&(e[t]||e[at(t)]||e[aa(at(t))])}function $v(e,t,s,n){let a;const i=s&&s[n],l=be(e);if(l||De(e)){const r=l&&pn(e);let o=!1,c=!1;r&&(o=!cs(e),c=qs(e),e=sr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Oa(Ls(e[d])):Ls(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Qe(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Uv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(be(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function Bv(e,t,s={},n,a){if($t.ce||$t.parent&&fn($t.parent)&&$t.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Ei(),Al(Dt,null,[pt("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Ei();const l=i&&Yo(i(s)),r=s.key||l&&l.key,o=Al(Dt,{key:(r&&!Kt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function Yo(e){return e.some(t=>yn(t)?!(t.type===yt||t.type===Dt&&!Yo(t.children)):!0)?e:null}function Hv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:wa(n)]=e[n];return s}const no=e=>e?Cf(e)?ji(e):no(e.parent):null,ui=ze(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>no(e.parent),$root:e=>no(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>Qo(e),$forceUpdate:e=>e.f||(e.f=()=>{jo(e.update)}),$nextTick:e=>e.n||(e.n=It.bind(e.proxy)),$watch:e=>dv.bind(e)}),Lr=(e,t)=>e!==Ke&&!e.__isScriptSetup&&Xe(e,t),ao={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(Lr(n,t))return l[t]=1,n[t];if(a!==Ke&&Xe(a,t))return l[t]=2,a[t];if(Xe(i,t))return l[t]=3,i[t];if(s!==Ke&&Xe(s,t))return l[t]=4,s[t];io&&(l[t]=0)}}const c=ui[t];let d,u;if(c)return t==="$attrs"&&jt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Ke&&Xe(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,Xe(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return Lr(a,t)?(a[t]=s,!0):n!==Ke&&Xe(n,t)?(n[t]=s,!0):Xe(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Ke&&r[0]!=="$"&&Xe(e,r)||Lr(t,r)||Xe(i,r)||Xe(n,r)||Xe(ui,r)||Xe(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:Xe(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Vv=ze({},ao,{get(e,t){if(t!==Symbol.unscopables)return ao.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Zg(t)}});function jv(){return null}function zv(){return null}function qv(e){}function Kv(e){}function Gv(){return null}function Wv(){}function Zv(e,t){return null}function Jv(){return Jp().slots}function Yv(){return Jp().attrs}function Jp(e){const t=Xt();return t.setupContext||(t.setupContext=If(t))}function Ti(e){return be(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function Qv(e,t){const s=Ti(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?be(a)||Ae(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function Xv(e,t){return!e||!t?e||t:be(e)&&be(t)?e.concat(t):ze({},Ti(e),Ti(t))}function eb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function tb(e){const t=Xt(),s=Xn;let n=e();Ri(),s&&Aa(!1);const a=()=>{qa(t),s&&Aa(!0)},i=()=>{Xt()!==t&&t.scope.off(),Ri(),s&&Aa(!1)};return Mo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let io=!0;function sb(e){const t=Qo(e),s=e.proxy,n=e.ctx;io=!1,t.beforeCreate&&pd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:f,updated:v,activated:g,deactivated:T,beforeDestroy:R,beforeUnmount:y,destroyed:m,unmounted:_,render:w,renderTracked:D,renderTriggered:O,errorCaptured:E,serverPrefetch:C,expose:I,inheritAttrs:B,components:M,directives:L,filters:W}=t;if(c&&nb(c,n,null),l)for(const k in l){const x=l[k];Ae(x)&&(n[k]=x.bind(s))}if(a){const k=a.call(s,s);Qe(k)&&(e.data=Pn(k))}if(io=!0,i)for(const k in i){const x=i[k],F=Ae(x)?x.bind(s,s):Ae(x.get)?x.get.bind(s,s):Ut,de=!Ae(x)&&Ae(x.set)?x.set.bind(s):Ut,pe=Y({get:F,set:de});Object.defineProperty(n,k,{enumerable:!0,configurable:!0,get:()=>pe.value,set:ie=>pe.value=ie})}if(r)for(const k in r)Yp(r[k],n,s,k);if(o){const k=Ae(o)?o.call(s):o;Reflect.ownKeys(k).forEach(x=>{di(x,k[x])})}d&&pd(d,e,"c");function $(k,x){be(x)?x.forEach(F=>k(F.bind(s))):x&&k(x.bind(s))}if($(zp,u),$(Je,p),$(Wo,f),$(or,v),$(Es,g),$(As,T),$(Wp,E),$(Gp,D),$(Kp,O),$(cr,y),$(xt,_),$(qp,C),be(I))if(I.length){const k=e.exposed||(e.exposed={});I.forEach(x=>{Object.defineProperty(k,x,{get:()=>s[x],set:F=>s[x]=F,enumerable:!0})})}else e.exposed||(e.exposed={});w&&e.render===Ut&&(e.render=w),B!=null&&(e.inheritAttrs=B),M&&(e.components=M),L&&(e.directives=L),C&&Go(e)}function nb(e,t,s=Ut){be(e)&&(e=lo(e));for(const n in e){const a=e[n];let i;Qe(a)?"default"in a?i=Ss(a.from||n,a.default,!0):i=Ss(a.from||n):i=Ss(a),St(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function pd(e,t,s){ms(be(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function Yp(e,t,s,n){let a=n.includes(".")?Pp(s,n):()=>s[n];if(De(e)){const i=t[e];Ae(i)&&ds(a,i)}else if(Ae(e))ds(a,e.bind(s));else if(Qe(e))if(be(e))e.forEach(i=>Yp(i,t,s,n));else{const i=Ae(e.handler)?e.handler.bind(s):t[e.handler];Ae(i)&&ds(a,i,e)}}function Qo(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Tl(o,c,l,!0)),Tl(o,t,l)),Qe(t)&&i.set(t,o),o}function Tl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Tl(e,i,s,!0),a&&a.forEach(l=>Tl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=ab[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const ab={data:fd,props:hd,emits:hd,methods:ii,computed:ii,beforeCreate:Wt,created:Wt,beforeMount:Wt,mounted:Wt,beforeUpdate:Wt,updated:Wt,beforeDestroy:Wt,beforeUnmount:Wt,destroyed:Wt,unmounted:Wt,activated:Wt,deactivated:Wt,errorCaptured:Wt,serverPrefetch:Wt,components:ii,directives:ii,watch:lb,provide:fd,inject:ib};function fd(e,t){return t?e?function(){return ze(Ae(e)?e.call(this,this):e,Ae(t)?t.call(this,this):t)}:t:e}function ib(e,t){return ii(lo(e),lo(t))}function lo(e){if(be(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Wt(e,t){return e?[...new Set([].concat(e,t))]:t}function ii(e,t){return e?ze(Object.create(null),e,t):t}function hd(e,t){return e?be(e)&&be(t)?[...new Set([...e,...t])]:ze(Object.create(null),Ti(e),Ti(t??{})):t}function lb(e,t){if(!e)return t;if(!t)return e;const s=ze(Object.create(null),e);for(const n in t)s[n]=Wt(e[n],t[n]);return s}function Qp(){return{app:null,config:{isNativeTag:ya,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let rb=0;function ob(e,t){return function(n,a=null){Ae(n)||(n=ze({},n)),a!=null&&!Qe(a)&&(a=null);const i=Qp(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:rb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:Lf,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ae(d.install)?(l.add(d),d.install(c,...u)):Ae(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const f=c._ceVNode||pt(n,a);return f.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(f,d):e(f,d,p),o=!0,c._container=d,d.__vue_app__=c,ji(f.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ms(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Wn;Wn=c;try{return d()}finally{Wn=u}}};return c}}let Wn=null;function cb(e,t,s=Ke){const n=Xt(),a=at(t),i=rs(t),l=Xp(e,a),r=Tp((o,c)=>{let d,u=Ke,p;return Mp(()=>{const f=e[a];Nt(d,f)&&(d=f,c())}),{get(){return o(),s.get?s.get(d):d},set(f){const v=s.set?s.set(f):f;if(!Nt(v,d)&&!(u!==Ke&&Nt(f,u)))return;const g=n.vnode.props,T=!!(g&&(t in g||a in g||i in g)&&(`onUpdate:${t}`in g||`onUpdate:${a}`in g||`onUpdate:${i}`in g));T||(d=f,c()),n.emit(`update:${t}`,v),Nt(f,u)&&(Nt(f,v)&&!Nt(v,p)||T&&u!==Ke&&!Nt(v,d))&&c(),u=f,p=v}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Ke:r,done:!1}:{done:!0}}}},r}const Xp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${at(t)}Modifiers`]||e[`${rs(t)}Modifiers`];function db(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Ke;let a=s;const i=t.startsWith("update:"),l=i&&Xp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>De(d)?d.trim():d)),l.number&&(a=s.map(Ql)));let r,o=n[r=wa(t)]||n[r=wa(at(t))];!o&&i&&(o=n[r=wa(rs(t))]),o&&ms(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ms(c,e,6,a)}}const ub=new WeakMap;function ef(e,t,s=!1){const n=s?ub:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ae(e)){const o=c=>{const d=ef(c,t,!0);d&&(r=!0,ze(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Qe(e)&&n.set(e,null),null):(be(i)?i.forEach(o=>l[o]=null):ze(l,i),Qe(e)&&n.set(e,l),l)}function dr(e,t){return!e||!sa(t)?!1:(t=t.slice(2).replace(/Once$/,""),Xe(e,t[0].toLowerCase()+t.slice(1))||Xe(e,rs(t))||Xe(e,t))}function ul(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:f,ctx:v,inheritAttrs:g}=e,T=Si(e);let R,y;try{if(s.shapeFlag&4){const _=a||n,w=_;R=ls(c.call(w,_,d,u,f,p,v)),y=r}else{const _=t;R=ls(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),y=t.props?r:fb(r)}}catch(_){pi.length=0,ia(_,e,1),R=pt(yt)}let m=R;if(y&&g!==!1){const _=Object.keys(y),{shapeFlag:w}=m;_.length&&w&7&&(i&&_.some(Wl)&&(y=hb(y,i)),m=Ks(m,y,!1,!0))}return s.dirs&&(m=Ks(m,null,!1,!0),m.dirs=m.dirs?m.dirs.concat(s.dirs):s.dirs),s.transition&&bn(m,s.transition),R=m,Si(T),R}function pb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(yn(a)){if(a.type!==yt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const fb=e=>{let t;for(const s in e)(s==="class"||s==="style"||sa(s))&&((t||(t={}))[s]=e[s]);return t},hb=(e,t)=>{const s={};for(const n in e)(!Wl(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function gb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?gd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(tf(l,n,p)&&!dr(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?gd(n,l,c):!0:!!l;return!1}function gd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(tf(t,e,i)&&!dr(s,i))return!0}return!1}function tf(e,t,s){const n=e[s],a=t[s];return s==="style"&&Qe(n)&&Qe(a)?!gn(n,a):n!==a}function ur({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const sf={},nf=()=>Object.create(sf),af=e=>Object.getPrototypeOf(e)===sf;function mb(e,t,s,n=!1){const a={},i=nf();e.propsDefaults=Object.create(null),lf(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:Bo(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function vb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ze(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(dr(e.emitsOptions,p))continue;const f=t[p];if(o)if(Xe(i,p))f!==i[p]&&(i[p]=f,c=!0);else{const v=at(p);a[v]=ro(o,r,v,f,e,!1)}else f!==i[p]&&(i[p]=f,c=!0)}}}else{lf(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!Xe(t,u)&&((d=rs(u))===u||!Xe(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=ro(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!Xe(t,u))&&(delete i[u],c=!0)}c&&ln(e.attrs,"set","")}function lf(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(un(o))continue;const c=t[o];let d;a&&Xe(a,d=at(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:dr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ze(s),c=r||Ke;for(let d=0;d<i.length;d++){const u=i[d];s[u]=ro(a,o,u,c[u],e,!Xe(c,u))}}return l}function ro(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=Xe(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ae(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=qa(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===rs(s))&&(n=!0))}return n}const bb=new WeakMap;function rf(e,t,s=!1){const n=s?bb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ae(e)){const d=u=>{o=!0;const[p,f]=rf(u,t,!0);ze(l,p),f&&r.push(...f)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Qe(e)&&n.set(e,_a),_a;if(be(i))for(let d=0;d<i.length;d++){const u=at(i[d]);md(u)&&(l[u]=Ke)}else if(i)for(const d in i){const u=at(d);if(md(u)){const p=i[d],f=l[u]=be(p)||Ae(p)?{type:p}:ze({},p),v=f.type;let g=!1,T=!0;if(be(v))for(let R=0;R<v.length;++R){const y=v[R],m=Ae(y)&&y.name;if(m==="Boolean"){g=!0;break}else m==="String"&&(T=!1)}else g=Ae(v)&&v.name==="Boolean";f[0]=g,f[1]=T,(g||Xe(f,"default"))&&r.push(u)}}const c=[l,r];return Qe(e)&&n.set(e,c),c}function md(e){return e[0]!=="$"&&!un(e)}const Xo=e=>e==="_"||e==="_ctx"||e==="$stable",ec=e=>be(e)?e.map(ls):[ls(e)],yb=(e,t,s)=>{if(t._n)return t;const n=zo((...a)=>ec(t(...a)),s);return n._c=!1,n},of=(e,t,s)=>{const n=e._ctx;for(const a in e){if(Xo(a))continue;const i=e[a];if(Ae(i))t[a]=yb(a,i,n);else if(i!=null){const l=ec(i);t[a]=()=>l}}},cf=(e,t)=>{const s=ec(t);e.slots.default=()=>s},df=(e,t,s)=>{for(const n in t)(s||!Xo(n))&&(e[n]=t[n])},xb=(e,t,s)=>{const n=e.slots=nf();if(e.vnode.shapeFlag&32){const a=t._;a?(df(n,t,s),s&&tp(n,"_",a,!0)):of(t,n)}else t&&cf(e,t)},_b=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Ke;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:df(a,t,s):(i=!t.$stable,of(t,a)),l=t}else t&&(cf(e,t),l={default:1});if(i)for(const r in a)!Xo(r)&&l[r]==null&&delete a[r]},kt=bf;function uf(e){return ff(e)}function pf(e){return ff(e,xv)}function ff(e,t){const s=Xl();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:f=Ut,insertStaticContent:v}=e,g=(b,A,P,J=null,q=null,Z=null,oe=void 0,ae=null,se=!!A.dynamicChildren)=>{if(b===A)return;b&&!Rs(b,A)&&(J=j(b),ie(b,q,Z,!0),b=null),A.patchFlag===-2&&(se=!1,A.dynamicChildren=null);const{type:X,ref:xe,shapeFlag:ce}=A;switch(X){case Nn:T(b,A,P,J);break;case yt:R(b,A,P,J);break;case Zn:b==null&&y(A,P,J,oe);break;case Dt:M(b,A,P,J,q,Z,oe,ae,se);break;default:ce&1?w(b,A,P,J,q,Z,oe,ae,se):ce&6?L(b,A,P,J,q,Z,oe,ae,se):(ce&64||ce&128)&&X.process(b,A,P,J,q,Z,oe,ae,se,_e)}xe!=null&&q?Ca(xe,b&&b.ref,Z,A||b,!A):xe==null&&b&&b.ref!=null&&Ca(b.ref,null,Z,b,!0)},T=(b,A,P,J)=>{if(b==null)n(A.el=r(A.children),P,J);else{const q=A.el=b.el;A.children!==b.children&&c(q,A.children)}},R=(b,A,P,J)=>{b==null?n(A.el=o(A.children||""),P,J):A.el=b.el},y=(b,A,P,J)=>{[b.el,b.anchor]=v(b.children,A,P,J,b.el,b.anchor)},m=({el:b,anchor:A},P,J)=>{let q;for(;b&&b!==A;)q=p(b),n(b,P,J),b=q;n(A,P,J)},_=({el:b,anchor:A})=>{let P;for(;b&&b!==A;)P=p(b),a(b),b=P;a(A)},w=(b,A,P,J,q,Z,oe,ae,se)=>{if(A.type==="svg"?oe="svg":A.type==="math"&&(oe="mathml"),b==null)D(A,P,J,q,Z,oe,ae,se);else{const X=b.el&&b.el._isVueCE?b.el:null;try{X&&X._beginPatch(),C(b,A,q,Z,oe,ae,se)}finally{X&&X._endPatch()}}},D=(b,A,P,J,q,Z,oe,ae)=>{let se,X;const{props:xe,shapeFlag:ce,transition:ge,dirs:ke}=b;if(se=b.el=l(b.type,Z,xe&&xe.is,xe),ce&8?d(se,b.children):ce&16&&E(b.children,se,null,J,q,Nr(b,Z),oe,ae),ke&&Vs(b,null,J,"created"),O(se,b,b.scopeId,oe,J),xe){for(const Re in xe)Re!=="value"&&!un(Re)&&i(se,Re,null,xe[Re],Z,J);"value"in xe&&i(se,"value",null,xe.value,Z),(X=xe.onVnodeBeforeMount)&&as(X,J,b)}ke&&Vs(b,null,J,"beforeMount");const Se=hf(q,ge);Se&&ge.beforeEnter(se),n(se,A,P),((X=xe&&xe.onVnodeMounted)||Se||ke)&&kt(()=>{try{X&&as(X,J,b),Se&&ge.enter(se),ke&&Vs(b,null,J,"mounted")}finally{}},q)},O=(b,A,P,J,q)=>{if(P&&f(b,P),J)for(let Z=0;Z<J.length;Z++)f(b,J[Z]);if(q){let Z=q.subTree;if(A===Z||El(Z.type)&&(Z.ssContent===A||Z.ssFallback===A)){const oe=q.vnode;O(b,oe,oe.scopeId,oe.slotScopeIds,q.parent)}}},E=(b,A,P,J,q,Z,oe,ae,se=0)=>{for(let X=se;X<b.length;X++){const xe=b[X]=ae?nn(b[X]):ls(b[X]);g(null,xe,A,P,J,q,Z,oe,ae)}},C=(b,A,P,J,q,Z,oe)=>{const ae=A.el=b.el;let{patchFlag:se,dynamicChildren:X,dirs:xe}=A;se|=b.patchFlag&16;const ce=b.props||Ke,ge=A.props||Ke;let ke;if(P&&Un(P,!1),(ke=ge.onVnodeBeforeUpdate)&&as(ke,P,A,b),xe&&Vs(A,b,P,"beforeUpdate"),P&&Un(P,!0),(ce.innerHTML&&ge.innerHTML==null||ce.textContent&&ge.textContent==null)&&d(ae,""),X?I(b.dynamicChildren,X,ae,P,J,Nr(A,q),Z):oe||x(b,A,ae,null,P,J,Nr(A,q),Z,!1),se>0){if(se&16)B(ae,ce,ge,P,q);else if(se&2&&ce.class!==ge.class&&i(ae,"class",null,ge.class,q),se&4&&i(ae,"style",ce.style,ge.style,q),se&8){const Se=A.dynamicProps;for(let Re=0;Re<Se.length;Re++){const Ie=Se[Re],$e=ce[Ie],Ve=ge[Ie];(Ve!==$e||Ie==="value")&&i(ae,Ie,$e,Ve,q,P)}}se&1&&b.children!==A.children&&d(ae,A.children)}else!oe&&X==null&&B(ae,ce,ge,P,q);((ke=ge.onVnodeUpdated)||xe)&&kt(()=>{ke&&as(ke,P,A,b),xe&&Vs(A,b,P,"updated")},J)},I=(b,A,P,J,q,Z,oe)=>{for(let ae=0;ae<A.length;ae++){const se=b[ae],X=A[ae],xe=se.el&&(se.type===Dt||!Rs(se,X)||se.shapeFlag&198)?u(se.el):P;g(se,X,xe,null,J,q,Z,oe,!0)}},B=(b,A,P,J,q)=>{if(A!==P){if(A!==Ke)for(const Z in A)!un(Z)&&!(Z in P)&&i(b,Z,A[Z],null,q,J);for(const Z in P){if(un(Z))continue;const oe=P[Z],ae=A[Z];oe!==ae&&Z!=="value"&&i(b,Z,ae,oe,q,J)}"value"in P&&i(b,"value",A.value,P.value,q)}},M=(b,A,P,J,q,Z,oe,ae,se)=>{const X=A.el=b?b.el:r(""),xe=A.anchor=b?b.anchor:r("");let{patchFlag:ce,dynamicChildren:ge,slotScopeIds:ke}=A;ke&&(ae=ae?ae.concat(ke):ke),b==null?(n(X,P,J),n(xe,P,J),E(A.children||[],P,xe,q,Z,oe,ae,se)):ce>0&&ce&64&&ge&&b.dynamicChildren&&b.dynamicChildren.length===ge.length?(I(b.dynamicChildren,ge,P,q,Z,oe,ae),(A.key!=null||q&&A===q.subTree)&&tc(b,A,!0)):x(b,A,P,xe,q,Z,oe,ae,se)},L=(b,A,P,J,q,Z,oe,ae,se)=>{A.slotScopeIds=ae,b==null?A.shapeFlag&512?q.ctx.activate(A,P,J,oe,se):W(A,P,J,q,Z,oe,se):ee(b,A,se)},W=(b,A,P,J,q,Z,oe)=>{const ae=b.component=Tf(b,J,q);if(Vi(b)&&(ae.ctx.renderer=_e),Ef(ae,!1,oe),ae.asyncDep){if(q&&q.registerDep(ae,$,oe),!b.el){const se=ae.subTree=pt(yt);R(null,se,A,P),b.placeholder=se.el}}else $(ae,b,A,P,q,Z,oe)},ee=(b,A,P)=>{const J=A.component=b.component;if(gb(b,A,P))if(J.asyncDep&&!J.asyncResolved){k(J,A,P);return}else J.next=A,J.update();else A.el=b.el,J.vnode=A},$=(b,A,P,J,q,Z,oe)=>{const ae=()=>{if(b.isMounted){let{next:ce,bu:ge,u:ke,parent:Se,vnode:Re}=b;{const me=gf(b);if(me){ce&&(ce.el=Re.el,k(b,ce,oe)),me.asyncDep.then(()=>{kt(()=>{b.isUnmounted||X()},q)});return}}let Ie=ce,$e;Un(b,!1),ce?(ce.el=Re.el,k(b,ce,oe)):ce=Re,ge&&Sa(ge),($e=ce.props&&ce.props.onVnodeBeforeUpdate)&&as($e,Se,ce,Re),Un(b,!0);const Ve=ul(b),V=b.subTree;b.subTree=Ve,g(V,Ve,u(V.el),j(V),b,q,Z),ce.el=Ve.el,Ie===null&&ur(b,Ve.el),ke&&kt(ke,q),($e=ce.props&&ce.props.onVnodeUpdated)&&kt(()=>as($e,Se,ce,Re),q)}else{let ce;const{el:ge,props:ke}=A,{bm:Se,m:Re,parent:Ie,root:$e,type:Ve}=b,V=fn(A);if(Un(b,!1),Se&&Sa(Se),!V&&(ce=ke&&ke.onVnodeBeforeMount)&&as(ce,Ie,A),Un(b,!0),ge&&Be){const me=()=>{b.subTree=ul(b),Be(ge,b.subTree,b,q,null)};V&&Ve.__asyncHydrate?Ve.__asyncHydrate(ge,b,me):me()}else{$e.ce&&$e.ce._hasShadowRoot()&&$e.ce._injectChildStyle(Ve,b.parent?b.parent.type:void 0);const me=b.subTree=ul(b);g(null,me,P,J,b,q,Z),A.el=me.el}if(Re&&kt(Re,q),!V&&(ce=ke&&ke.onVnodeMounted)){const me=A;kt(()=>as(ce,Ie,me),q)}(A.shapeFlag&256||Ie&&fn(Ie.vnode)&&Ie.vnode.shapeFlag&256)&&b.a&&kt(b.a,q),b.isMounted=!0,A=P=J=null}};b.scope.on();const se=b.effect=new yi(ae);b.scope.off();const X=b.update=se.run.bind(se),xe=b.job=se.runIfDirty.bind(se);xe.i=b,xe.id=b.uid,se.scheduler=()=>jo(xe),Un(b,!0),X()},k=(b,A,P)=>{A.component=b;const J=b.vnode.props;b.vnode=A,b.next=null,vb(b,A.props,J,P),_b(b,A.children,P),mn(),nd(b),vn()},x=(b,A,P,J,q,Z,oe,ae,se=!1)=>{const X=b&&b.children,xe=b?b.shapeFlag:0,ce=A.children,{patchFlag:ge,shapeFlag:ke}=A;if(ge>0){if(ge&128){de(X,ce,P,J,q,Z,oe,ae,se);return}else if(ge&256){F(X,ce,P,J,q,Z,oe,ae,se);return}}ke&8?(xe&16&&Me(X,q,Z),ce!==X&&d(P,ce)):xe&16?ke&16?de(X,ce,P,J,q,Z,oe,ae,se):Me(X,q,Z,!0):(xe&8&&d(P,""),ke&16&&E(ce,P,J,q,Z,oe,ae,se))},F=(b,A,P,J,q,Z,oe,ae,se)=>{b=b||_a,A=A||_a;const X=b.length,xe=A.length,ce=Math.min(X,xe);let ge;for(ge=0;ge<ce;ge++){const ke=A[ge]=se?nn(A[ge]):ls(A[ge]);g(b[ge],ke,P,null,q,Z,oe,ae,se)}X>xe?Me(b,q,Z,!0,!1,ce):E(A,P,J,q,Z,oe,ae,se,ce)},de=(b,A,P,J,q,Z,oe,ae,se)=>{let X=0;const xe=A.length;let ce=b.length-1,ge=xe-1;for(;X<=ce&&X<=ge;){const ke=b[X],Se=A[X]=se?nn(A[X]):ls(A[X]);if(Rs(ke,Se))g(ke,Se,P,null,q,Z,oe,ae,se);else break;X++}for(;X<=ce&&X<=ge;){const ke=b[ce],Se=A[ge]=se?nn(A[ge]):ls(A[ge]);if(Rs(ke,Se))g(ke,Se,P,null,q,Z,oe,ae,se);else break;ce--,ge--}if(X>ce){if(X<=ge){const ke=ge+1,Se=ke<xe?A[ke].el:J;for(;X<=ge;)g(null,A[X]=se?nn(A[X]):ls(A[X]),P,Se,q,Z,oe,ae,se),X++}}else if(X>ge)for(;X<=ce;)ie(b[X],q,Z,!0),X++;else{const ke=X,Se=X,Re=new Map;for(X=Se;X<=ge;X++){const qe=A[X]=se?nn(A[X]):ls(A[X]);qe.key!=null&&Re.set(qe.key,X)}let Ie,$e=0;const Ve=ge-Se+1;let V=!1,me=0;const Pe=new Array(Ve);for(X=0;X<Ve;X++)Pe[X]=0;for(X=ke;X<=ce;X++){const qe=b[X];if($e>=Ve){ie(qe,q,Z,!0);continue}let Ne;if(qe.key!=null)Ne=Re.get(qe.key);else for(Ie=Se;Ie<=ge;Ie++)if(Pe[Ie-Se]===0&&Rs(qe,A[Ie])){Ne=Ie;break}Ne===void 0?ie(qe,q,Z,!0):(Pe[Ne-Se]=X+1,Ne>=me?me=Ne:V=!0,g(qe,A[Ne],P,null,q,Z,oe,ae,se),$e++)}const nt=V?kb(Pe):_a;for(Ie=nt.length-1,X=Ve-1;X>=0;X--){const qe=Se+X,Ne=A[qe],rt=A[qe+1],Gt=qe+1<xe?rt.el||mf(rt):J;Pe[X]===0?g(null,Ne,P,Gt,q,Z,oe,ae,se):V&&(Ie<0||X!==nt[Ie]?pe(Ne,P,Gt,2):Ie--)}}},pe=(b,A,P,J,q=null)=>{const{el:Z,type:oe,transition:ae,children:se,shapeFlag:X}=b;if(X&6){pe(b.component.subTree,A,P,J);return}if(X&128){b.suspense.move(A,P,J);return}if(X&64){oe.move(b,A,P,_e);return}if(oe===Dt){n(Z,A,P);for(let ce=0;ce<se.length;ce++)pe(se[ce],A,P,J);n(b.anchor,A,P);return}if(oe===Zn){m(b,A,P);return}if(J!==2&&X&1&&ae)if(J===0)ae.persisted&&!Z[_s]?n(Z,A,P):(ae.beforeEnter(Z),n(Z,A,P),kt(()=>ae.enter(Z),q));else{const{leave:ce,delayLeave:ge,afterLeave:ke}=ae,Se=()=>{b.ctx.isUnmounted?a(Z):n(Z,A,P)},Re=()=>{const Ie=Z._isLeaving||!!Z[_s];Z._isLeaving&&Z[_s](!0),ae.persisted&&!Ie?Se():ce(Z,()=>{Se(),ke&&ke()})};ge?ge(Z,Se,Re):Re()}else n(Z,A,P)},ie=(b,A,P,J=!1,q=!1)=>{const{type:Z,props:oe,ref:ae,children:se,dynamicChildren:X,shapeFlag:xe,patchFlag:ce,dirs:ge,cacheIndex:ke,memo:Se}=b;if(ce===-2&&(q=!1),ae!=null&&(mn(),Ca(ae,null,P,b,!0),vn()),ke!=null&&(A.renderCache[ke]=void 0),xe&256){A.ctx.deactivate(b);return}const Re=xe&1&&ge,Ie=!fn(b);let $e;if(Ie&&($e=oe&&oe.onVnodeBeforeUnmount)&&as($e,A,b),xe&6)fe(b.component,P,J);else{if(xe&128){b.suspense.unmount(P,J);return}Re&&Vs(b,null,A,"beforeUnmount"),xe&64?b.type.remove(b,A,P,_e,J):X&&!X.hasOnce&&(Z!==Dt||ce>0&&ce&64)?Me(X,A,P,!1,!0):(Z===Dt&&ce&384||!q&&xe&16)&&Me(se,A,P),J&&he(b)}const Ve=Se!=null&&ke==null;(Ie&&($e=oe&&oe.onVnodeUnmounted)||Re||Ve)&&kt(()=>{$e&&as($e,A,b),Re&&Vs(b,null,A,"unmounted"),Ve&&(b.el=null)},P)},he=b=>{const{type:A,el:P,anchor:J,transition:q}=b;if(A===Dt){Q(P,J);return}if(A===Zn){_(b);return}const Z=()=>{a(P),q&&!q.persisted&&q.afterLeave&&q.afterLeave()};if(b.shapeFlag&1&&q&&!q.persisted){const{leave:oe,delayLeave:ae}=q,se=()=>oe(P,Z);ae?ae(b.el,Z,se):se()}else Z()},Q=(b,A)=>{let P;for(;b!==A;)P=p(b),a(b),b=P;a(A)},fe=(b,A,P)=>{const{bum:J,scope:q,job:Z,subTree:oe,um:ae,m:se,a:X}=b;Cl(se),Cl(X),J&&Sa(J),q.stop(),Z&&(Z.flags|=8,ie(oe,b,A,P)),ae&&kt(ae,A),kt(()=>{b.isUnmounted=!0},A)},Me=(b,A,P,J=!1,q=!1,Z=0)=>{for(let oe=Z;oe<b.length;oe++)ie(b[oe],A,P,J,q)},j=b=>{if(b.shapeFlag&6)return j(b.component.subTree);if(b.shapeFlag&128)return b.suspense.next();const A=p(b.anchor||b.el),P=A&&A[Fp];return P?p(P):A};let ue=!1;const re=(b,A,P)=>{let J;b==null?A._vnode&&(ie(A._vnode,null,null,!0),J=A._vnode.component):g(A._vnode||null,b,A,null,null,null,P),A._vnode=b,ue||(ue=!0,nd(J),wl(),ue=!1)},_e={p:g,um:ie,m:pe,r:he,mt:W,mc:E,pc:x,pbc:I,n:j,o:e};let ve,Be;return t&&([ve,Be]=t(_e)),{render:re,hydrate:ve,createApp:ob(re,ve)}}function Nr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function Un({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function hf(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function tc(e,t,s=!1){const n=e.children,a=t.children;if(be(n)&&be(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=nn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&tc(l,r)),r.type===Nn&&(r.patchFlag===-1&&(r=a[i]=nn(r)),r.el=l.el),r.type===yt&&!r.el&&(r.el=l.el)}}function kb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function gf(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:gf(t)}function Cl(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function mf(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?mf(t.subTree):null}const El=e=>e.__isSuspense;let oo=0;const wb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Tb(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Cb(e,t,s,n,a,l,r,o,c)}},hydrate:Eb,normalize:Ab},Sb=wb;function Ci(e,t){const s=e.props&&e.props[t];Ae(s)&&s()}function Tb(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=vf(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Ci(e,"onPending"),Ci(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Ea(p,e.ssFallback)):p.resolve(!1,!0)}function Cb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,f=t.ssFallback,{activeBranch:v,pendingBranch:g,isInFallback:T,isHydrating:R}=u;if(g)u.pendingBranch=p,Rs(g,p)?(o(g,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():T&&(R||(o(v,f,s,n,a,null,i,l,r),Ea(u,f)))):(u.pendingId=oo++,R?(u.isHydrating=!1,u.activeBranch=g):c(g,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),T?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(v,f,s,n,a,null,i,l,r),Ea(u,f))):v&&Rs(v,p)?(o(v,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(v&&Rs(v,p))o(v,p,s,n,a,u,i,l,r),Ea(u,p);else if(Ci(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=oo++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:m}=u;y>0?setTimeout(()=>{u.pendingId===m&&u.fallback(f)},y):y===0&&u.fallback(f)}}function vf(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:f,n:v,o:{parentNode:g,remove:T}}=c;let R;const y=Rb(e);y&&t&&t.pendingBranch&&(R=t.pendingId,t.deps++);const m=e.props?bl(e.props.timeout):void 0,_=i,w={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:oo++,timeout:typeof m=="number"?m:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(D=!1,O=!1){const{vnode:E,activeBranch:C,pendingBranch:I,pendingId:B,effects:M,parentComponent:L,container:W,isInFallback:ee}=w;let $=!1;if(w.isHydrating)w.isHydrating=!1;else if(!D){$=C&&I.transition&&I.transition.mode==="out-in";let F=!1;$&&(C.transition.afterLeave=()=>{B===w.pendingId&&(p(I,W,i===_&&!F?v(C):i,0),ki(M),ee&&E.ssFallback&&(E.ssFallback.el=null))}),C&&!w.isFallbackMountPending&&(g(C.el)===W&&(i=v(C),F=!0),f(C,L,w,!0),!$&&ee&&E.ssFallback&&kt(()=>E.ssFallback.el=null,w)),$||p(I,W,i,0)}w.isFallbackMountPending=!1,Ea(w,I),w.pendingBranch=null,w.isInFallback=!1;let k=w.parent,x=!1;for(;k;){if(k.pendingBranch){k.effects.push(...M),x=!0;break}k=k.parent}!x&&!$&&ki(M),w.effects=[],y&&t&&t.pendingBranch&&R===t.pendingId&&(t.deps--,t.deps===0&&!O&&t.resolve()),Ci(E,"onResolve")},fallback(D){if(!w.pendingBranch)return;const{vnode:O,activeBranch:E,parentComponent:C,container:I,namespace:B}=w;Ci(O,"onFallback");const M=v(E),L=()=>{w.isFallbackMountPending=!1,w.isInFallback&&(u(null,D,I,M,C,null,B,r,o),Ea(w,D))},W=D.transition&&D.transition.mode==="out-in";W&&(w.isFallbackMountPending=!0,E.transition.afterLeave=L),w.isInFallback=!0,f(E,C,null,!0),W||L()},move(D,O,E){w.activeBranch&&p(w.activeBranch,D,O,E),w.container=D},next(){return w.activeBranch&&v(w.activeBranch)},registerDep(D,O,E){const C=!!w.pendingBranch;C&&w.deps++;const I=D.vnode.el;D.asyncDep.catch(B=>{ia(B,D,0)}).then(B=>{if(D.isUnmounted||w.isUnmounted||w.pendingId!==D.suspenseId)return;Ri(),D.asyncResolved=!0;const{vnode:M}=D;co(D,B,!1),I&&(M.el=I);const L=!I&&D.subTree.el;O(D,M,g(I||D.subTree.el),I?null:v(D.subTree),w,l,E),L&&(M.placeholder=null,T(L)),ur(D,M.el),C&&--w.deps===0&&w.resolve()})},unmount(D,O){w.isUnmounted=!0,w.activeBranch&&f(w.activeBranch,s,D,O),w.pendingBranch&&f(w.pendingBranch,s,D,O)}};return w}function Eb(e,t,s,n,a,i,l,r,o){const c=t.suspense=vf(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Ab(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=vd(n?s.default:s),e.ssFallback=n?vd(s.fallback):pt(yt)}function vd(e){let t;if(Ae(e)){const s=Qn&&e._c;s&&(e._d=!1,Ei()),e=e(),s&&(e._d=!0,t=zt,yf())}return be(e)&&(e=pb(e)),e=ls(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function bf(e,t){t&&t.pendingBranch?be(e)?t.effects.push(...e):t.effects.push(e):ki(e)}function Ea(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,ur(n,a))}function Rb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Dt=Symbol.for("v-fgt"),Nn=Symbol.for("v-txt"),yt=Symbol.for("v-cmt"),Zn=Symbol.for("v-stc"),pi=[];let zt=null;function Ei(e=!1){pi.push(zt=e?null:[])}function yf(){pi.pop(),zt=pi[pi.length-1]||null}let Qn=1;function Ai(e,t=!1){Qn+=e,e<0&&zt&&t&&(zt.hasOnce=!0)}function xf(e){return e.dynamicChildren=Qn>0?zt||_a:null,yf(),Qn>0&&zt&&zt.push(e),e}function Ib(e,t,s,n,a,i){return xf(sc(e,t,s,n,a,i,!0))}function Al(e,t,s,n,a){return xf(pt(e,t,s,n,a,!0))}function yn(e){return e?e.__v_isVNode===!0:!1}function Rs(e,t){return e.type===t.type&&e.key===t.key}function Ob(e){}const _f=({key:e})=>e??null,pl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?De(e)||St(e)||Ae(e)?{i:$t,r:e,k:t,f:!!s}:e:null);function sc(e,t=null,s=null,n=0,a=null,i=e===Dt?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&_f(t),ref:t&&pl(t),scopeId:ir,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:$t};return r?(ac(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=De(s)?8:16),Qn>0&&!l&&zt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&zt.push(o),o}const pt=Lb;function Lb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===Zp)&&(e=yt),yn(e)){const r=Ks(e,t,!0);return s&&ac(r,s),Qn>0&&!i&&zt&&(r.shapeFlag&6?zt[zt.indexOf(e)]=r:zt.push(r)),r.patchFlag=-2,r}if(Ub(e)&&(e=e.__vccOpts),t){t=kf(t);let{class:r,style:o}=t;r&&!De(r)&&(t.class=$i(r)),Qe(o)&&(Ui(o)&&!be(o)&&(o=ze({},o)),t.style=Fi(o))}const l=De(e)?1:El(e)?128:$p(e)?64:Qe(e)?4:Ae(e)?2:0;return sc(e,t,s,n,a,l,i,!0)}function kf(e){return e?Ui(e)||af(e)?ze({},e):e:null}function Ks(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Sf(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&_f(c),ref:t&&t.ref?s&&i?be(i)?i.concat(pl(t)):[i,pl(t)]:pl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Dt?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ks(e.ssContent),ssFallback:e.ssFallback&&Ks(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&bn(d,o.clone(d)),d}function nc(e=" ",t=0){return pt(Nn,null,e,t)}function Nb(e,t){const s=pt(Zn,null,e);return s.staticCount=t,s}function wf(e="",t=!1){return t?(Ei(),Al(yt,null,e)):pt(yt,null,e)}function ls(e){return e==null||typeof e=="boolean"?pt(yt):be(e)?pt(Dt,null,e.slice()):yn(e)?nn(e):pt(Nn,null,String(e))}function nn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ks(e)}function ac(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(be(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),ac(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!af(t)?t._ctx=$t:a===3&&$t&&($t.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ae(t)?(t={default:t,_ctx:$t},s=32):(t=String(t),n&64?(s=16,t=[nc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Sf(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=$i([t.class,n.class]));else if(a==="style")t.style=Fi([t.style,n.style]);else if(sa(a)){const i=t[a],l=n[a];l&&i!==l&&!(be(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!Wl(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function as(e,t,s,n=null){ms(e,t,7,[s,n])}const Db=Qp();let Mb=0;function Tf(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Db,i={uid:Mb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Po(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:rf(n,a),emitsOptions:ef(n,a),emit:null,emitted:null,propsDefaults:Ke,inheritAttrs:n.inheritAttrs,ctx:Ke,data:Ke,props:Ke,attrs:Ke,slots:Ke,refs:Ke,setupState:Ke,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=db.bind(null,i),e.ce&&e.ce(i),i}let Ft=null;const Xt=()=>Ft||$t;let Rl,Aa;{const e=Xl(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Rl=t("__VUE_INSTANCE_SETTERS__",s=>Ft=s),Aa=t("__VUE_SSR_SETTERS__",s=>Xn=s)}const qa=e=>{const t=Ft;return Rl(e),e.scope.on(),()=>{e.scope.off(),Rl(t)}},Ri=()=>{Ft&&Ft.scope.off(),Rl(null)};function Cf(e){return e.vnode.shapeFlag&4}let Xn=!1;function Ef(e,t=!1,s=!1){t&&Aa(t);const{props:n,children:a}=e.vnode,i=Cf(e);mb(e,n,i,t),xb(e,a,s||t);const l=i?Pb(e,t):void 0;return t&&Aa(!1),l}function Pb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,ao);const{setup:n}=s;if(n){mn();const a=e.setupContext=n.length>1?If(e):null,i=qa(e),l=za(n,e,0,[e.props,a]),r=Mo(l);if(vn(),i(),(r||e.sp)&&!fn(e)&&Go(e),r){if(l.then(Ri,Ri),t)return l.then(o=>{co(e,o,t)}).catch(o=>{ia(o,e,0)});e.asyncDep=l}else co(e,l,t)}else Rf(e,t)}function co(e,t,s){Ae(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Qe(t)&&(e.setupState=Vo(t)),Rf(e,s)}let Il,uo;function Af(e){Il=e,uo=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Vv))}}const Fb=()=>!Il;function Rf(e,t,s){const n=e.type;if(!e.render){if(!t&&Il&&!n.render){const a=n.template||Qo(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=ze(ze({isCustomElement:i,delimiters:r},l),o);n.render=Il(a,c)}}e.render=n.render||Ut,uo&&uo(e)}{const a=qa(e);mn();try{sb(e)}finally{vn(),a()}}}const $b={get(e,t){return jt(e,"get",""),e[t]}};function If(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,$b),slots:e.slots,emit:e.emit,expose:t}}function ji(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(Vo(wp(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in ui)return ui[s](e)},has(t,s){return s in t||s in ui}})):e.proxy}function po(e,t=!0){return Ae(e)?e.displayName||e.name:e.name||t&&e.__name}function Ub(e){return Ae(e)&&"__vccOpts"in e}const Y=(e,t)=>qm(e,t,Xn);function Na(e,t,s){try{Ai(-1);const n=arguments.length;return n===2?Qe(t)&&!be(t)?yn(t)?pt(e,null,[t]):pt(e,t):pt(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&yn(s)&&(s=[s]),pt(e,t,s))}finally{Ai(1)}}function Bb(){}function Hb(e,t,s,n){const a=s[n];if(a&&Of(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Of(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(Nt(s[n],t[n]))return!1;return Qn>0&&zt&&zt.push(e),!0}const Lf="3.5.38",Vb=Ut,jb=ev,zb=ma,qb=Lp,Kb={createComponentInstance:Tf,setupComponent:Ef,renderComponentRoot:ul,setCurrentRenderingInstance:Si,isVNode:yn,normalizeVNode:ls,getComponentPublicInstance:ji,ensureValidVNode:Yo,pushWarningContext:Jm,popWarningContext:Ym},Gb=Kb,Wb=null,Zb=null,Jb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let fo;const bd=typeof window<"u"&&window.trustedTypes;if(bd)try{fo=bd.createPolicy("vue",{createHTML:e=>e})}catch{}const Nf=fo?e=>fo.createHTML(e):e=>e,Yb="http://www.w3.org/2000/svg",Qb="http://www.w3.org/1998/Math/MathML",sn=typeof document<"u"?document:null,yd=sn&&sn.createElement("template"),Df={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?sn.createElementNS(Yb,e):t==="mathml"?sn.createElementNS(Qb,e):s?sn.createElement(e,{is:s}):sn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>sn.createTextNode(e),createComment:e=>sn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>sn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{yd.innerHTML=Nf(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=yd.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},wn="transition",Za="animation",Da=Symbol("_vtc"),Mf={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Pf=ze({},Ko,Mf),Xb=e=>(e.displayName="Transition",e.props=Pf,e),ey=Xb((e,{slots:t})=>Na(Hp,Ff(e),t)),Bn=(e,t=[])=>{be(e)?e.forEach(s=>s(...t)):e&&e(...t)},xd=e=>e?be(e)?e.some(t=>t.length>1):e.length>1:!1;function Ff(e){const t={};for(const M in e)M in Mf||(t[M]=e[M]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:f=`${s}-leave-to`}=e,v=ty(a),g=v&&v[0],T=v&&v[1],{onBeforeEnter:R,onEnter:y,onEnterCancelled:m,onLeave:_,onLeaveCancelled:w,onBeforeAppear:D=R,onAppear:O=y,onAppearCancelled:E=m}=t,C=(M,L,W,ee)=>{M._enterCancelled=ee,En(M,L?d:r),En(M,L?c:l),W&&W()},I=(M,L)=>{M._isLeaving=!1,En(M,u),En(M,f),En(M,p),L&&L()},B=M=>(L,W)=>{const ee=M?O:y,$=()=>C(L,M,W);Bn(ee,[L,$]),_d(()=>{En(L,M?o:i),$s(L,M?d:r),xd(ee)||kd(L,n,g,$)})};return ze(t,{onBeforeEnter(M){Bn(R,[M]),$s(M,i),$s(M,l)},onBeforeAppear(M){Bn(D,[M]),$s(M,o),$s(M,c)},onEnter:B(!1),onAppear:B(!0),onLeave(M,L){M._isLeaving=!0;const W=()=>I(M,L);$s(M,u),M._enterCancelled?($s(M,p),ho(M)):(ho(M),$s(M,p)),_d(()=>{M._isLeaving&&(En(M,u),$s(M,f),xd(_)||kd(M,n,T,W))}),Bn(_,[M,W])},onEnterCancelled(M){C(M,!1,void 0,!0),Bn(m,[M])},onAppearCancelled(M){C(M,!0,void 0,!0),Bn(E,[M])},onLeaveCancelled(M){I(M),Bn(w,[M])}})}function ty(e){if(e==null)return null;if(Qe(e))return[Dr(e.enter),Dr(e.leave)];{const t=Dr(e);return[t,t]}}function Dr(e){return bl(e)}function $s(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Da]||(e[Da]=new Set)).add(t)}function En(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Da];s&&(s.delete(t),s.size||(e[Da]=void 0))}function _d(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let sy=0;function kd(e,t,s,n){const a=e._endId=++sy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=$f(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=f=>{f.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function $f(e,t){const s=window.getComputedStyle(e),n=v=>(s[v]||"").split(", "),a=n(`${wn}Delay`),i=n(`${wn}Duration`),l=wd(a,i),r=n(`${Za}Delay`),o=n(`${Za}Duration`),c=wd(r,o);let d=null,u=0,p=0;t===wn?l>0&&(d=wn,u=l,p=i.length):t===Za?c>0&&(d=Za,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?wn:Za:null,p=d?d===wn?i.length:o.length:0);const f=d===wn&&/\b(?:transform|all)(?:,|$)/.test(n(`${wn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:f}}function wd(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Sd(s)+Sd(e[n])))}function Sd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function ho(e){return(e?e.ownerDocument:document).body.offsetHeight}function ny(e,t,s){const n=e[Da];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const Ol=Symbol("_vod"),ic=Symbol("_vsh"),Uf={name:"show",beforeMount(e,{value:t},{transition:s}){e[Ol]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):Ja(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),Ja(e,!0),n.enter(e)):n.leave(e,()=>{Ja(e,!1)}):Ja(e,t))},beforeUnmount(e,{value:t}){Ja(e,t)}};function Ja(e,t){e.style.display=t?e[Ol]:"none",e[ic]=!t}function ay(){Uf.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Bf=Symbol("");function iy(e){const t=Xt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>Ll(i,a))},n=()=>{const a=e(t.proxy);t.ce?Ll(t.ce,a):go(t.subTree,a),s(a)};Wo(()=>{ki(n)}),Je(()=>{ds(n,Ut,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),xt(()=>a.disconnect())})}function go(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{go(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)Ll(e.el,t);else if(e.type===Dt)e.children.forEach(s=>go(s,t));else if(e.type===Zn){let{el:s,anchor:n}=e;for(;s&&(Ll(s,t),s!==n);)s=s.nextSibling}}function Ll(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=um(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Bf]=n}}const ly=/(?:^|;)\s*display\s*:/;function ry(e,t,s){const n=e.style,a=De(s);let i=!1;if(s&&!a){if(t)if(De(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&li(n,r,"")}else for(const l in t)s[l]==null&&li(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?cy(e,l,!De(t)&&t?t[l]:void 0,r)||li(n,l,r):li(n,l,"")}}else if(a){if(t!==s){const l=n[Bf];l&&(s+=";"+l),n.cssText=s,i=ly.test(s)}}else t&&e.removeAttribute("style");Ol in e&&(e[Ol]=i?n.display:"",e[ic]&&(n.display="none"))}const Td=/\s*!important$/;function li(e,t,s){if(be(s))s.forEach(n=>li(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=oy(e,t);Td.test(s)?e.setProperty(rs(n),s.replace(Td,""),"important"):e[n]=s}}const Cd=["Webkit","Moz","ms"],Mr={};function oy(e,t){const s=Mr[t];if(s)return s;let n=at(t);if(n!=="filter"&&n in e)return Mr[t]=n;n=aa(n);for(let a=0;a<Cd.length;a++){const i=Cd[a]+n;if(i in e)return Mr[t]=i}return t}function cy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&De(n)&&s===n}const Ed="http://www.w3.org/1999/xlink";function Ad(e,t,s,n,a,i=cm(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Ed,t.slice(6,t.length)):e.setAttributeNS(Ed,t,s):s==null||i&&!np(s)?e.removeAttribute(t):e.setAttribute(t,i?"":Kt(s)?String(s):s)}function Rd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Nf(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=np(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function on(e,t,s,n){e.addEventListener(t,s,n)}function dy(e,t,s,n){e.removeEventListener(t,s,n)}const Id=Symbol("_vei");function uy(e,t,s,n,a=null){const i=e[Id]||(e[Id]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=py(t);if(n){const c=i[t]=gy(n,a);on(e,r,c,o)}else l&&(dy(e,r,l,o),i[t]=void 0)}}const Od=/(?:Once|Passive|Capture)$/;function py(e){let t;if(Od.test(e)){t={};let n;for(;n=e.match(Od);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):rs(e.slice(2)),t]}let Pr=0;const fy=Promise.resolve(),hy=()=>Pr||(fy.then(()=>Pr=0),Pr=Date.now());function gy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(be(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ms(c,t,5,r)}}else ms(a,t,5,[n])};return s.value=e,s.attached=hy(),s}const Ld=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Hf=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?ny(e,n,l):t==="style"?ry(e,s,n):sa(t)?Wl(t)||uy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):my(e,t,n,l))?(Rd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Ad(e,t,n,l,i,t!=="value")):e._isVueCE&&(vy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!De(n)))?Rd(e,at(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Ad(e,t,n,l))};function my(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Ld(t)&&Ae(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Ld(t)&&De(s)?!1:t in e}function vy(e,t){const s=e._def.props;if(!s)return!1;const n=at(t);return Array.isArray(s)?s.some(a=>at(a)===n):Object.keys(s).some(a=>at(a)===n)}const Nd={};function Vf(e,t,s){let n=Hi(e,t);Zl(n)&&(n=ze({},n,t));class a extends pr{constructor(l){super(n,l,s)}}return a.def=n,a}const by=((e,t)=>Vf(e,t,th)),yy=typeof HTMLElement<"u"?HTMLElement:class{};class pr extends yy{constructor(t,s={},n=Ml){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Ml?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(ze({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof pr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,It(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!be(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=bl(this._props[o])),(r||(r=Object.create(null)))[at(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)Xe(this,n)||Object.defineProperty(this,n,{get:()=>zs(s[n])})}_resolveProps(t){const{props:s}=t,n=be(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(at))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Nd;const a=at(t);s&&this._numberProps&&this._numberProps[a]&&(n=bl(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Nd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(rs(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(rs(t),s+""):s||this.removeAttribute(rs(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),eh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=pt(this._def,ze(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,Zl(l[0])?ze({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),rs(i)!==i&&a(rs(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function jf(e){const t=Xt(),s=t&&t.ce;return s||null}function xy(){const e=jf();return e&&e.shadowRoot}function _y(e="$style"){{const t=Xt();if(!t)return Ke;const s=t.type.__cssModules;if(!s)return Ke;const n=s[e];return n||Ke}}const zf=new WeakMap,qf=new WeakMap,Nl=Symbol("_moveCb"),Dd=Symbol("_enterCb"),ky=e=>(delete e.props.mode,e),wy=ky({name:"TransitionGroup",props:ze({},Pf,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Xt(),n=qo();let a,i;return or(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ay(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Ty),a.forEach(Cy);const r=a.filter(Ey);ho(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;$s(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[Nl]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[Nl]=null,En(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ze(e),r=Ff(l);let o=l.tag||Dt;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[ic]&&(a.push(d),bn(d,La(d,r,n,s)),zf.set(d,Kf(d.el)))}i=t.default?lr(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&bn(d,La(d,r,n,s))}return pt(o,null,i)}}}),Sy=wy;function Ty(e){const t=e.el;t[Nl]&&t[Nl](),t[Dd]&&t[Dd]()}function Cy(e){qf.set(e,Kf(e.el))}function Ey(e){const t=zf.get(e),s=qf.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Kf(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ay(e,t,s){const n=e.cloneNode(),a=e[Da];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=$f(n);return i.removeChild(n),l}const Mn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return be(t)?s=>Sa(t,s):t};function Ry(e){e.target.composing=!0}function Md(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ts=Symbol("_assign");function Pd(e,t,s){return t&&(e=e.trim()),s&&(e=Ql(e)),e}const Dl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ts]=Mn(a);const i=n||a.props&&a.props.type==="number";on(e,t?"change":"input",l=>{l.target.composing||e[Ts](Pd(e.value,s,i))}),(s||i)&&on(e,"change",()=>{e.value=Pd(e.value,s,i)}),t||(on(e,"compositionstart",Ry),on(e,"compositionend",Md),on(e,"change",Md))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ts]=Mn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?Ql(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},lc={deep:!0,created(e,t,s){e[Ts]=Mn(s),on(e,"change",()=>{const n=e._modelValue,a=Ma(e),i=e.checked,l=e[Ts];if(be(n)){const r=er(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(na(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(Wf(e,i))})},mounted:Fd,beforeUpdate(e,t,s){e[Ts]=Mn(s),Fd(e,t,s)}};function Fd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(be(t))a=er(t,n.props.value)>-1;else if(na(t))a=t.has(n.props.value);else{if(t===s)return;a=gn(t,Wf(e,!0))}e.checked!==a&&(e.checked=a)}const rc={created(e,{value:t},s){e.checked=gn(t,s.props.value),e[Ts]=Mn(s),on(e,"change",()=>{e[Ts](Ma(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ts]=Mn(n),t!==s&&(e.checked=gn(t,n.props.value))}},Gf={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=na(t);on(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?Ql(Ma(l)):Ma(l));e[Ts](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,It(()=>{e._assigning=!1})}),e[Ts]=Mn(n)},mounted(e,{value:t}){$d(e,t)},beforeUpdate(e,t,s){e[Ts]=Mn(s)},updated(e,{value:t}){e._assigning||$d(e,t)}};function $d(e,t){const s=e.multiple,n=be(t);if(!(s&&!n&&!na(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ma(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=er(t,r)>-1}else l.selected=t.has(r);else if(gn(Ma(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ma(e){return"_value"in e?e._value:e.value}function Wf(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const Zf={created(e,t,s){il(e,t,s,null,"created")},mounted(e,t,s){il(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){il(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){il(e,t,s,n,"updated")}};function Jf(e,t){switch(e){case"SELECT":return Gf;case"TEXTAREA":return Dl;default:switch(t){case"checkbox":return lc;case"radio":return rc;default:return Dl}}}function il(e,t,s,n,a){const l=Jf(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Iy(){Dl.getSSRProps=({value:e})=>({value:e}),rc.getSSRProps=({value:e},t)=>{if(t.props&&gn(t.props.value,e))return{checked:!0}},lc.getSSRProps=({value:e},t)=>{if(be(e)){if(t.props&&er(e,t.props.value)>-1)return{checked:!0}}else if(na(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},Zf.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=Jf(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Oy=["ctrl","shift","alt","meta"],Ly={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Oy.some(s=>e[`${s}Key`]&&!t.includes(s))},Ny=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Ly[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Dy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},My=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=rs(a.key);if(t.some(l=>l===i||Dy[l]===i))return e(a)}))},Yf=ze({patchProp:Hf},Df);let fi,Ud=!1;function Qf(){return fi||(fi=uf(Yf))}function Xf(){return fi=Ud?fi:pf(Yf),Ud=!0,fi}const eh=((...e)=>{Qf().render(...e)}),Py=((...e)=>{Xf().hydrate(...e)}),Ml=((...e)=>{const t=Qf().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=nh(n);if(!a)return;const i=t._component;!Ae(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,sh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),th=((...e)=>{const t=Xf().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=nh(n);if(a)return s(a,!0,sh(a))},t});function sh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function nh(e){return De(e)?document.querySelector(e):e}let Bd=!1;const Fy=()=>{Bd||(Bd=!0,Iy(),ay())},$y=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Hp,BaseTransitionPropsValidators:Ko,Comment:yt,DeprecationTypes:Jb,EffectScope:Po,ErrorCodes:Xm,ErrorTypeStrings:jb,Fragment:Dt,KeepAlive:Lv,ReactiveEffect:yi,Static:Zn,Suspense:Sb,Teleport:hv,Text:Nn,TrackOpTypes:Km,Transition:ey,TransitionGroup:Sy,TriggerOpTypes:Gm,VueElement:pr,assertNumber:Qm,callWithAsyncErrorHandling:ms,callWithErrorHandling:za,camelize:at,capitalize:aa,cloneVNode:Ks,compatUtils:Zb,computed:Y,createApp:Ml,createBlock:Al,createCommentVNode:wf,createElementBlock:Ib,createElementVNode:sc,createHydrationRenderer:pf,createPropsRestProxy:eb,createRenderer:uf,createSSRApp:th,createSlots:Uv,createStaticVNode:Nb,createTextVNode:nc,createVNode:pt,customRef:Tp,defineAsyncComponent:Iv,defineComponent:Hi,defineCustomElement:Vf,defineEmits:zv,defineExpose:qv,defineModel:Wv,defineOptions:Kv,defineProps:jv,defineSSRCustomElement:by,defineSlots:Gv,devtools:zb,effect:gm,effectScope:pm,getCurrentInstance:Xt,getCurrentScope:rp,getCurrentWatcher:Wm,getTransitionRawChildren:lr,guardReactiveProps:kf,h:Na,handleError:ia,hasInjectionContext:rv,hydrate:Py,hydrateOnIdle:Sv,hydrateOnInteraction:Av,hydrateOnMediaQuery:Ev,hydrateOnVisible:Cv,initCustomFormatter:Bb,initDirectivesForSSR:Fy,inject:Ss,isMemoSame:Of,isProxy:Ui,isReactive:pn,isReadonly:qs,isRef:St,isRuntimeOnly:Fb,isShallow:cs,isVNode:yn,markRaw:wp,mergeDefaults:Qv,mergeModels:Xv,mergeProps:Sf,nextTick:It,nodeOps:Df,normalizeClass:$i,normalizeProps:Xg,normalizeStyle:Fi,onActivated:Es,onBeforeMount:zp,onBeforeUnmount:cr,onBeforeUpdate:Wo,onDeactivated:As,onErrorCaptured:Wp,onMounted:Je,onRenderTracked:Gp,onRenderTriggered:Kp,onScopeDispose:fm,onServerPrefetch:qp,onUnmounted:xt,onUpdated:or,onWatcherCleanup:Ep,openBlock:Ei,patchProp:Hf,popScopeId:av,provide:di,proxyRefs:Vo,pushScopeId:nv,queuePostFlushCb:ki,reactive:Pn,readonly:xl,ref:h,registerRuntimeCompiler:Af,render:eh,renderList:$v,renderSlot:Bv,resolveComponent:Mv,resolveDirective:Fv,resolveDynamicComponent:Pv,resolveFilter:Wb,resolveTransitionHooks:La,setBlockTracking:Ai,setDevtoolsHook:qb,setTransitionHooks:bn,shallowReactive:Bo,shallowReadonly:Dm,shallowRef:Ho,ssrContextKey:Np,ssrUtils:Gb,stop:mm,toDisplayString:ip,toHandlerKey:wa,toHandlers:Hv,toRaw:Ze,toRef:jm,toRefs:Bm,toValue:Fm,transformVNodeArgs:Ob,triggerRef:Pm,unref:zs,useAttrs:Yv,useCssModule:_y,useCssVars:iy,useHost:jf,useId:mv,useModel:cb,useSSRContext:Dp,useShadowRoot:xy,useSlots:Jv,useTemplateRef:vv,useTransitionState:qo,vModelCheckbox:lc,vModelDynamic:Zf,vModelRadio:rc,vModelSelect:Gf,vModelText:Dl,vShow:Uf,version:Lf,warn:Vb,watch:ds,watchEffect:ov,watchPostEffect:cv,watchSyncEffect:Mp,withAsyncContext:tb,withCtx:zo,withDefaults:Zv,withDirectives:lv,withKeys:My,withMemo:Hb,withModifiers:Ny,withScopeId:iv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ii=Symbol(""),hi=Symbol(""),oc=Symbol(""),Pl=Symbol(""),ah=Symbol(""),ea=Symbol(""),ih=Symbol(""),lh=Symbol(""),cc=Symbol(""),dc=Symbol(""),zi=Symbol(""),uc=Symbol(""),rh=Symbol(""),pc=Symbol(""),fc=Symbol(""),hc=Symbol(""),gc=Symbol(""),mc=Symbol(""),vc=Symbol(""),oh=Symbol(""),ch=Symbol(""),fr=Symbol(""),Fl=Symbol(""),bc=Symbol(""),yc=Symbol(""),Oi=Symbol(""),qi=Symbol(""),xc=Symbol(""),mo=Symbol(""),Uy=Symbol(""),vo=Symbol(""),$l=Symbol(""),By=Symbol(""),Hy=Symbol(""),_c=Symbol(""),Vy=Symbol(""),jy=Symbol(""),kc=Symbol(""),dh=Symbol(""),Pa={[Ii]:"Fragment",[hi]:"Teleport",[oc]:"Suspense",[Pl]:"KeepAlive",[ah]:"BaseTransition",[ea]:"openBlock",[ih]:"createBlock",[lh]:"createElementBlock",[cc]:"createVNode",[dc]:"createElementVNode",[zi]:"createCommentVNode",[uc]:"createTextVNode",[rh]:"createStaticVNode",[pc]:"resolveComponent",[fc]:"resolveDynamicComponent",[hc]:"resolveDirective",[gc]:"resolveFilter",[mc]:"withDirectives",[vc]:"renderList",[oh]:"renderSlot",[ch]:"createSlots",[fr]:"toDisplayString",[Fl]:"mergeProps",[bc]:"normalizeClass",[yc]:"normalizeStyle",[Oi]:"normalizeProps",[qi]:"guardReactiveProps",[xc]:"toHandlers",[mo]:"camelize",[Uy]:"capitalize",[vo]:"toHandlerKey",[$l]:"setBlockTracking",[By]:"pushScopeId",[Hy]:"popScopeId",[_c]:"withCtx",[Vy]:"unref",[jy]:"isRef",[kc]:"withMemo",[dh]:"isMemoSame"};function zy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Pa[t]=e[t]})}const ys={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function qy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:ys}}function Li(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=ys){return e&&(r?(e.helper(ea),e.helper(Ua(e.inSSR,c))):e.helper($a(e.inSSR,c)),l&&e.helper(mc)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function Jn(e,t=ys){return{type:17,loc:t,elements:e}}function ws(e,t=ys){return{type:15,loc:t,properties:e}}function wt(e,t){return{type:16,loc:ys,key:De(e)?Ue(e,!0):e,value:t}}function Ue(e,t=!1,s=ys,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Os(e,t=ys){return{type:8,loc:t,children:e}}function Ot(e,t=[],s=ys){return{type:14,loc:s,callee:e,arguments:t}}function Fa(e,t=void 0,s=!1,n=!1,a=ys){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function bo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:ys}}function Ky(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:ys}}function Gy(e){return{type:21,body:e,loc:ys}}function $a(e,t){return e||t?cc:dc}function Ua(e,t){return e||t?ih:lh}function wc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s($a(n,e.isComponent)),t(ea),t(Ua(n,e.isComponent)))}const Hd=new Uint8Array([123,123]),Vd=new Uint8Array([125,125]);function jd(e){return e>=97&&e<=122||e>=65&&e<=90}function hs(e){return e===32||e===10||e===9||e===12||e===13}function Sn(e){return e===47||e===62||hs(e)}function Ul(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Bt={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Wy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Hd,this.delimiterClose=Vd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Hd,this.delimiterClose=Vd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?Sn(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||hs(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Bt.TitleEnd||this.currentSequence===Bt.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Bt.Cdata[this.sequenceIndex]?++this.sequenceIndex===Bt.Cdata.length&&(this.state=28,this.currentSequence=Bt.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Bt.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):jd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){Sn(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(Sn(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Ul("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){hs(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=jd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||hs(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):hs(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):hs(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||Sn(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||Sn(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||Sn(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||Sn(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||Sn(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):hs(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):hs(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){hs(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Bt.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Bt.ScriptEnd[3]?this.startSpecial(Bt.ScriptEnd,4):t===Bt.StyleEnd[3]?this.startSpecial(Bt.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Bt.TitleEnd[3]?this.startSpecial(Bt.TitleEnd,4):t===Bt.TextareaEnd[3]?this.startSpecial(Bt.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Bt.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function zd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function Yn(e,t){const s=zd("MODE",t),n=zd(e,t);return s===3?n===!0:n!==!1}function Ni(e,t,s,...n){return Yn(e,t)}function Sc(e){throw e}function uh(e){}function ut(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const os=e=>e.type===4&&e.isStatic;function ph(e){switch(e){case"Teleport":case"teleport":return hi;case"Suspense":case"suspense":return oc;case"KeepAlive":case"keep-alive":return Pl;case"BaseTransition":case"base-transition":return ah}}const Zy=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Tc=e=>!Zy.test(e),fh=/[A-Za-z_$\xA0-\uFFFF]/,Jy=/[\.\?\w$\xA0-\uFFFF]/,Yy=/\s+[.[]\s*|\s*[.[]\s+/g,hh=e=>e.type===4?e.content:e.loc.source,Qy=e=>{const t=hh(e).trim().replace(Yy,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?fh:Jy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},gh=Qy,Xy=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,ex=e=>Xy.test(hh(e)),tx=ex;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(De(t)?a.name===t:t.test(a.name)))return a}}function hr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&zn(i.arg,t))return i}}function zn(e,t){return!!(e&&os(e)&&e.content===t)}function sx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Fr(e){return e.type===5||e.type===2}function qd(e){return e.type===7&&e.name==="pre"}function nx(e){return e.type===7&&e.name==="slot"}function Bl(e){return e.type===1&&e.tagType===3}function Hl(e){return e.type===1&&e.tagType===2}const ax=new Set([Oi,qi]);function mh(e,t=[]){if(e&&!De(e)&&e.type===14){const s=e.callee;if(!De(s)&&ax.has(s))return mh(e.arguments[0],t.concat(e))}return[e,t]}function Vl(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!De(a)&&a.type===14){const r=mh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||De(a))n=ws([t]);else if(a.type===14){const r=a.arguments[0];!De(r)&&r.type===15?Kd(t,r)||r.properties.unshift(t):a.callee===xc?n=Ot(s.helper(Fl),[ws([t]),a]):a.arguments.unshift(ws([t])),!n&&(n=a)}else a.type===15?(Kd(t,a)||a.properties.unshift(t),n=a):(n=Ot(s.helper(Fl),[ws([t]),a]),l&&l.callee===qi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function Kd(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Di(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function ix(e){return e.type===14&&e.callee===kc?e.arguments[1].returns:e}const lx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function vh(e){for(let t=0;t<e.length;t++)if(!hs(e.charCodeAt(t)))return!1;return!0}function Cc(e){return e.type===2&&vh(e.content)||e.type===12&&Cc(e.content)}function bh(e){return e.type===3||Cc(e)}const yh={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:ya,isPreTag:ya,isIgnoreNewlineTag:ya,isCustomElement:ya,onError:Sc,onWarn:uh,comments:!1,prefixIdentifiers:!1};let Ye=yh,Mi=null,hn="",Vt=null,Ge=null,ns="",tn=-1,Vn=-1,Ec=0,On=!1,yo=null;const dt=[],mt=new Wy(dt,{onerr:Qs,ontext(e,t){ll(Pt(e,t),e,t)},ontextentity(e,t,s){ll(e,t,s)},oninterpolation(e,t){if(On)return ll(Pt(e,t),e,t);let s=e+mt.delimiterOpen.length,n=t-mt.delimiterClose.length;for(;hs(hn.charCodeAt(s));)s++;for(;hs(hn.charCodeAt(n-1));)n--;let a=Pt(s,n);a.includes("&")&&(a=Ye.decodeEntities(a,!1)),xo({type:5,content:hl(a,!1,bt(s,n)),loc:bt(e,t)})},onopentagname(e,t){const s=Pt(e,t);Vt={type:1,tag:s,ns:Ye.getNamespace(s,dt[0],Ye.ns),tagType:0,props:[],children:[],loc:bt(e-1,t),codegenNode:void 0}},onopentagend(e){Wd(e)},onclosetag(e,t){const s=Pt(e,t);if(!Ye.isVoidTag(s)){let n=!1;for(let a=0;a<dt.length;a++)if(dt[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Qs(24,dt[0].loc.start.offset);for(let l=0;l<=a;l++){const r=dt.shift();fl(r,t,l<a)}break}n||Qs(23,xh(e,60))}},onselfclosingtag(e){const t=Vt.tag;Vt.isSelfClosing=!0,Wd(e),dt[0]&&dt[0].tag===t&&fl(dt.shift(),e)},onattribname(e,t){Ge={type:6,name:Pt(e,t),nameLoc:bt(e,t),value:void 0,loc:bt(e)}},ondirname(e,t){const s=Pt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!On&&n===""&&Qs(26,e),On||n==="")Ge={type:6,name:s,nameLoc:bt(e,t),value:void 0,loc:bt(e)};else if(Ge={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Ue("prop")]:[],loc:bt(e)},n==="pre"){On=mt.inVPre=!0,yo=Vt;const a=Vt.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=mx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Pt(e,t);if(On&&!qd(Ge))Ge.name+=s,qn(Ge.nameLoc,t);else{const n=s[0]!=="[";Ge.arg=hl(n?s:s.slice(1,-1),n,bt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Pt(e,t);if(On&&!qd(Ge))Ge.name+="."+s,qn(Ge.nameLoc,t);else if(Ge.name==="slot"){const n=Ge.arg;n&&(n.content+="."+s,qn(n.loc,t))}else{const n=Ue(s,!0,bt(e,t));Ge.modifiers.push(n)}},onattribdata(e,t){ns+=Pt(e,t),tn<0&&(tn=e),Vn=t},onattribentity(e,t,s){ns+=e,tn<0&&(tn=t),Vn=s},onattribnameend(e){const t=Ge.loc.start.offset,s=Pt(t,e);Ge.type===7&&(Ge.rawName=s),Vt.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Qs(2,t)},onattribend(e,t){if(Vt&&Ge){if(qn(Ge.loc,t),e!==0)if(ns.includes("&")&&(ns=Ye.decodeEntities(ns,!0)),Ge.type===6)Ge.name==="class"&&(ns=kh(ns).trim()),e===1&&!ns&&Qs(13,t),Ge.value={type:2,content:ns,loc:e===1?bt(tn,Vn):bt(tn-1,Vn+1)},mt.inSFCRoot&&Vt.tag==="template"&&Ge.name==="lang"&&ns&&ns!=="html"&&mt.enterRCDATA(Ul("</template"),0);else{let s=0;Ge.exp=hl(ns,!1,bt(tn,Vn),0,s),Ge.name==="for"&&(Ge.forParseResult=ox(Ge.exp));let n=-1;Ge.name==="bind"&&(n=Ge.modifiers.findIndex(a=>a.content==="sync"))>-1&&Ni("COMPILER_V_BIND_SYNC",Ye,Ge.loc,Ge.arg.loc.source)&&(Ge.name="model",Ge.modifiers.splice(n,1))}(Ge.type!==7||Ge.name!=="pre")&&Vt.props.push(Ge)}ns="",tn=Vn=-1},oncomment(e,t){Ye.comments&&xo({type:3,content:Pt(e,t),loc:bt(e-4,t+3)})},onend(){const e=hn.length;for(let t=0;t<dt.length;t++)fl(dt[t],e-1),Qs(24,dt[t].loc.start.offset)},oncdata(e,t){(dt[0]?dt[0].ns:Ye.ns)!==0?ll(Pt(e,t),e,t):Qs(1,e-9)},onprocessinginstruction(e){(dt[0]?dt[0].ns:Ye.ns)===0&&Qs(21,e-1)}}),Gd=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,rx=/^\(|\)$/g;function ox(e){const t=e.loc,s=e.content,n=s.match(lx);if(!n)return;const[,a,i]=n,l=(u,p,f=!1)=>{const v=t.start.offset+p,g=v+u.length;return hl(u,!1,bt(v,g),0,f?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(rx,"").trim();const c=a.indexOf(o),d=o.match(Gd);if(d){o=o.replace(Gd,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const f=d[2].trim();f&&(r.index=l(f,s.indexOf(f,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Pt(e,t){return hn.slice(e,t)}function Wd(e){mt.inSFCRoot&&(Vt.innerLoc=bt(e+1,e+1)),xo(Vt);const{tag:t,ns:s}=Vt;s===0&&Ye.isPreTag(t)&&Ec++,Ye.isVoidTag(t)?fl(Vt,e):(dt.unshift(Vt),(s===1||s===2)&&(mt.inXML=!0)),Vt=null}function ll(e,t,s){{const i=dt[0]&&dt[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ye.decodeEntities(e,!1))}const n=dt[0]||Mi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,qn(a.loc,s)):n.children.push({type:2,content:e,loc:bt(t,s)})}function fl(e,t,s=!1){s?qn(e.loc,xh(t,60)):qn(e.loc,cx(t,62)+1),mt.inSFCRoot&&(e.children.length?e.innerLoc.end=ze({},e.children[e.children.length-1].loc.end):e.innerLoc.end=ze({},e.innerLoc.start),e.innerLoc.source=Pt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(On||(n==="slot"?e.tagType=2:Zd(e)?e.tagType=3:ux(e)&&(e.tagType=1)),mt.inRCDATA||(e.children=_h(i)),a===0&&Ye.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ye.isPreTag(n)&&Ec--,yo===e&&(On=mt.inVPre=!1,yo=null),mt.inXML&&(dt[0]?dt[0].ns:Ye.ns)===0&&(mt.inXML=!1);{const l=e.props;if(!mt.inSFCRoot&&Yn("COMPILER_NATIVE_TEMPLATE",Ye)&&e.tag==="template"&&!Zd(e)){const o=dt[0]||Mi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Ni("COMPILER_INLINE_TEMPLATE",Ye,r.loc)&&e.children.length&&(r.value={type:2,content:Pt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function cx(e,t){let s=e;for(;hn.charCodeAt(s)!==t&&s<hn.length-1;)s++;return s}function xh(e,t){let s=e;for(;hn.charCodeAt(s)!==t&&s>=0;)s--;return s}const dx=new Set(["if","else","else-if","for","slot"]);function Zd({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&dx.has(t[s].name))return!0}return!1}function ux({tag:e,props:t}){if(Ye.isCustomElement(e))return!1;if(e==="component"||px(e.charCodeAt(0))||ph(e)||Ye.isBuiltInComponent&&Ye.isBuiltInComponent(e)||Ye.isNativeTag&&!Ye.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Ni("COMPILER_IS_ON_ELEMENT",Ye,n.loc))return!0}}else if(n.name==="bind"&&zn(n.arg,"is")&&Ni("COMPILER_IS_ON_ELEMENT",Ye,n.loc))return!0}return!1}function px(e){return e>64&&e<91}const fx=/\r\n/g;function _h(e){const t=Ye.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Ec)a.content=a.content.replace(fx,`
`);else if(vh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&hx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=kh(a.content))}return s?e.filter(Boolean):e}function hx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function kh(e){let t="",s=!1;for(let n=0;n<e.length;n++)hs(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function xo(e){(dt[0]||Mi).children.push(e)}function bt(e,t){return{start:mt.getPos(e),end:t==null?t:mt.getPos(t),source:t==null?t:Pt(e,t)}}function gx(e){return bt(e.start.offset,e.end.offset)}function qn(e,t){e.end=mt.getPos(t),e.source=Pt(e.start.offset,t)}function mx(e){const t={type:6,name:e.rawName,nameLoc:bt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function hl(e,t=!1,s,n=0,a=0){return Ue(e,t,s,n)}function Qs(e,t,s){Ye.onError(ut(e,bt(t,t)))}function vx(){mt.reset(),Vt=null,Ge=null,ns="",tn=-1,Vn=-1,dt.length=0}function bx(e,t){if(vx(),hn=e,Ye=ze({},yh),t){let a;for(a in t)t[a]!=null&&(Ye[a]=t[a])}mt.mode=Ye.parseMode==="html"?1:Ye.parseMode==="sfc"?2:0,mt.inXML=Ye.ns===1||Ye.ns===2;const s=t&&t.delimiters;s&&(mt.delimiterOpen=Ul(s[0]),mt.delimiterClose=Ul(s[1]));const n=Mi=qy([],e);return mt.parse(hn),n.loc=bt(0,e.length),n.children=_h(n.children),Mi=null,n}function yx(e,t){gl(e,void 0,t,!!wh(e))}function wh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Hl(t[0])?t[0]:null}function gl(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:gs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const f=u.codegenNode;if(f.type===13){const v=f.patchFlag;if((v===void 0||v===512||v===1)&&Th(u,s)>=2){const g=Ch(u);g&&(f.props=s.hoist(g))}f.dynamicProps&&(f.dynamicProps=s.hoist(f.dynamicProps))}}}else if(u.type===12&&(n?0:gs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,gl(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)gl(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)gl(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&be(e.codegenNode.children))e.codegenNode.children=o(Jn(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!be(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(Jn(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!be(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(Jn(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!be(d.children)&&d.children.type===15){const p=d.children.properties.find(f=>f.key===u||f.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function gs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Th(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=gs(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=gs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ea),t.removeHelper(Ua(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper($a(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return gs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(De(r)||Kt(r))continue;const o=gs(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const xx=new Set([bc,yc,Oi,qi]);function Sh(e,t){if(e.type===14&&!De(e.callee)&&xx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return gs(s,t);if(s.type===14)return Sh(s,t)}return 0}function Th(e,t){let s=3;const n=Ch(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=gs(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=gs(r,t):r.type===14?c=Sh(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Ch(e){const t=e.codegenNode;if(t.type===13)return t.props}function _x(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Ut,isCustomElement:d=Ut,expressionPlugins:u=[],scopeId:p=null,slotted:f=!0,ssr:v=!1,inSSR:g=!1,ssrCssVars:T="",bindingMetadata:R=Ke,inline:y=!1,isTS:m=!1,onError:_=Sc,onWarn:w=uh,compatConfig:D}){const O=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),E={filename:t,selfName:O&&aa(at(O[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:f,ssr:v,inSSR:g,ssrCssVars:T,bindingMetadata:R,inline:y,isTS:m,onError:_,onWarn:w,compatConfig:D,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(C){const I=E.helpers.get(C)||0;return E.helpers.set(C,I+1),C},removeHelper(C){const I=E.helpers.get(C);if(I){const B=I-1;B?E.helpers.set(C,B):E.helpers.delete(C)}},helperString(C){return`_${Pa[E.helper(C)]}`},replaceNode(C){E.parent.children[E.childIndex]=E.currentNode=C},removeNode(C){const I=E.parent.children,B=C?I.indexOf(C):E.currentNode?E.childIndex:-1;!C||C===E.currentNode?(E.currentNode=null,E.onNodeRemoved()):E.childIndex>B&&(E.childIndex--,E.onNodeRemoved()),E.parent.children.splice(B,1)},onNodeRemoved:Ut,addIdentifiers(C){},removeIdentifiers(C){},hoist(C){De(C)&&(C=Ue(C)),E.hoists.push(C);const I=Ue(`_hoisted_${E.hoists.length}`,!1,C.loc,2);return I.hoisted=C,I},cache(C,I=!1,B=!1){const M=Ky(E.cached.length,C,I,B);return E.cached.push(M),M}};return E.filters=new Set,E}function kx(e,t){const s=_x(e,t);gr(e,s),t.hoistStatic&&yx(e,s),t.ssr||wx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function wx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=wh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&wc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Li(t,s(Ii),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Sx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];De(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,gr(a,t))}}function gr(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(be(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(zi);break;case 5:t.ssr||t.helper(fr);break;case 9:for(let i=0;i<e.branches.length;i++)gr(e.branches[i],t);break;case 10:case 11:case 1:case 0:Sx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Eh(e,t){const s=De(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(nx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const mr="/*@__PURE__*/",Ah=e=>`${Pa[e]}: _${Pa[e]}`;function Tx(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const f={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(g){return`_${Pa[g]}`},push(g,T=-2,R){f.code+=g},indent(){v(++f.indentLevel)},deindent(g=!1){g?--f.indentLevel:v(--f.indentLevel)},newline(){v(f.indentLevel)}};function v(g){f.push(`
`+"  ".repeat(g),0)}return f}function Cx(e,t={}){const s=Tx(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,f=!i&&n!=="module";Ex(e,s);const g=d?"ssrRender":"render",R=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${g}(${R}) {`),l(),f&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Ah).join(", ")} } = _Vue
`,-1),o())),e.components.length&&($r(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&($r(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),$r(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?qt(e.codegenNode,s):a("null"),f&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Ex(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[cc,dc,zi,uc,rh].filter(p=>d.includes(p)).map(Ah).join(", ");a(`const { ${u} } = _Vue
`,-1)}Ax(e.hoists,t),i(),a("return ")}function $r(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?gc:t==="component"?pc:hc);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Di(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Ax(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),qt(i,t),n())}t.pure=!1}function Ac(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Ki(e,t,s),s&&t.deindent(),t.push("]")}function Ki(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];De(r)?a(r,-3):be(r)?Ac(r,t):qt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function qt(e,t){if(De(e)){t.push(e,-3);return}if(Kt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:qt(e.codegenNode,t);break;case 2:Rx(e,t);break;case 4:Rh(e,t);break;case 5:Ix(e,t);break;case 12:qt(e.codegenNode,t);break;case 8:Ih(e,t);break;case 3:Lx(e,t);break;case 13:Nx(e,t);break;case 14:Mx(e,t);break;case 15:Px(e,t);break;case 17:Fx(e,t);break;case 18:$x(e,t);break;case 19:Ux(e,t);break;case 20:Bx(e,t);break;case 21:Ki(e.body,t,!0,!1);break}}function Rx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Rh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Ix(e,t){const{push:s,helper:n,pure:a}=t;a&&s(mr),s(`${n(fr)}(`),qt(e.content,t),s(")")}function Ih(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];De(n)?t.push(n,-3):qt(n,t)}}function Ox(e,t){const{push:s}=t;if(e.type===8)s("["),Ih(e,t),s("]");else if(e.isStatic){const n=Tc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Lx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(mr),s(`${n(zi)}(${JSON.stringify(e.content)})`,-3,e)}function Nx(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:f}=e;let v;o&&(v=String(o)),d&&s(n(mc)+"("),u&&s(`(${n(ea)}(${p?"true":""}), `),a&&s(mr);const g=u?Ua(t.inSSR,f):$a(t.inSSR,f);s(n(g)+"(",-2,e),Ki(Dx([i,l,r,v,c]),t),s(")"),u&&s(")"),d&&(s(", "),qt(d,t),s(")"))}function Dx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Mx(e,t){const{push:s,helper:n,pure:a}=t,i=De(e.callee)?e.callee:n(e.callee);a&&s(mr),s(i+"(",-2,e),Ki(e.arguments,t),s(")")}function Px(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Ox(c,t),s(": "),qt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Fx(e,t){Ac(e.elements,t)}function $x(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Pa[_c]}(`),s("(",-2,e),be(i)?Ki(i,t):i&&qt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),be(l)?Ac(l,t):qt(l,t)):r&&qt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Ux(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Tc(s.content);u&&l("("),Rh(s,t),u&&l(")")}else l("("),qt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),qt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,qt(a,t),d||t.indentLevel--,i&&o(!0)}function Bx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n($l)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),qt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n($l)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Hx=Eh(/^(?:if|else|else-if)$/,(e,t,s)=>Vx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=Yd(a,o,s);else{const c=jx(n.codegenNode);c.alternate=Yd(a,o+n.branches.length-1,s)}}}));function Vx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ut(28,t.loc)),t.exp=Ue("true",!1,a)}if(t.name==="if"){const a=Jd(e,t),i={type:9,loc:gx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&bh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ut(30,e.loc)),s.removeNode();const r=Jd(e,t);l.branches.push(r);const o=n&&n(l,r,!1);gr(r,s),o&&o(),s.currentNode=null}else s.onError(ut(30,e.loc));break}}}function Jd(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:hr(e,"key"),isTemplateIf:s}}function Yd(e,t,s){return e.condition?bo(e.condition,Qd(e,t,s),Ot(s.helper(zi),['""',"true"])):Qd(e,t,s)}function Qd(e,t,s){const{helper:n}=s,a=wt("key",Ue(`${t}`,!1,ys,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return Vl(o,a,s),o}else return Li(s,n(Ii),ws([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=ix(o);return c.type===13&&wc(c,s),Vl(c,a,s),o}}function jx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const zx=Eh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return qx(e,t,s,i=>{const l=Ot(n(vc),[i.source]),r=Bl(e),o=ks(e,"memo"),c=hr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Ue(c.value.content,!0):void 0:c.exp);const u=d?wt("key",d):null,p=i.source.type===4&&i.source.constType>0,f=p?64:c?128:256;return i.codegenNode=Li(s,n(Ii),void 0,l,f,void 0,void 0,!0,!p,!1,e.loc),()=>{let v;const{children:g}=i,T=g.length!==1||g[0].type!==1,R=Hl(e)?e:r&&e.children.length===1&&Hl(e.children[0])?e.children[0]:null;if(R?(v=R.codegenNode,r&&u&&Vl(v,u,s)):T?v=Li(s,n(Ii),u?ws([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(v=g[0].codegenNode,r&&u&&Vl(v,u,s),v.isBlock!==!p&&(v.isBlock?(a(ea),a(Ua(s.inSSR,v.isComponent))):a($a(s.inSSR,v.isComponent))),v.isBlock=!p,v.isBlock?(n(ea),n(Ua(s.inSSR,v.isComponent))):n($a(s.inSSR,v.isComponent))),o){const y=Fa(_o(i.parseResult,[Ue("_cached")]));y.body=Gy([Os(["const _memo = (",o.exp,")"]),Os(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(dh)}(_cached, _memo)) return _cached`]),Os(["const _item = ",v]),Ue("_item.memo = _memo"),Ue("return _item")]),l.arguments.push(y,Ue("_cache"),Ue(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(Fa(_o(i.parseResult),v,!0))}})});function qx(e,t,s,n){if(!t.exp){s.onError(ut(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ut(32,t.loc));return}Oh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Bl(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const f=n&&n(p);return()=>{r.vFor--,f&&f()}}function Oh(e,t){e.finalized||(e.finalized=!0)}function _o({value:e,key:t,index:s},n=[]){return Kx([e,t,s,...n])}function Kx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Ue("_".repeat(n+1),!1))}const Xd=Ue("undefined",!1),Gx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Wx=(e,t,s,n)=>Fa(e,s,!1,!0,s.length?s[0].loc:n);function Zx(e,t,s=Wx){t.helper(_c);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:T,exp:R}=o;T&&!os(T)&&(r=!0),i.push(wt(T||Ue("default",!0),s(R,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let f=0;for(let T=0;T<n.length;T++){const R=n[T];let y;if(!Bl(R)||!(y=ks(R,"slot",!0))){R.type!==3&&u.push(R);continue}if(o){t.onError(ut(37,y.loc));break}c=!0;const{children:m,loc:_}=R,{arg:w=Ue("default",!0),exp:D,loc:O}=y;let E;os(w)?E=w?w.content:"default":r=!0;const C=ks(R,"for"),I=s(D,C,m,_);let B,M;if(B=ks(R,"if"))r=!0,l.push(bo(B.exp,rl(w,I,f++),Xd));else if(M=ks(R,/^else(?:-if)?$/,!0)){let L=T,W;for(;L--&&(W=n[L],!!bh(W)););if(W&&Bl(W)&&ks(W,/^(?:else-)?if$/)){let ee=l[l.length-1];for(;ee.alternate.type===19;)ee=ee.alternate;ee.alternate=M.exp?bo(M.exp,rl(w,I,f++),Xd):rl(w,I,f++)}else t.onError(ut(30,M.loc))}else if(C){r=!0;const L=C.forParseResult;L?(Oh(L),l.push(Ot(t.helper(vc),[L.source,Fa(_o(L),rl(w,I),!0)]))):t.onError(ut(32,C.loc))}else{if(E){if(p.has(E)){t.onError(ut(38,O));continue}p.add(E),E==="default"&&(d=!0)}i.push(wt(w,I))}}if(!o){const T=(R,y)=>{const m=s(R,void 0,y,a);return t.compatConfig&&(m.isNonScopedSlot=!0),wt("default",m)};c?u.length&&!u.every(Cc)&&(d?t.onError(ut(39,u[0].loc)):i.push(T(void 0,u))):i.push(T(void 0,n))}const v=r?2:ml(e.children)?3:1;let g=ws(i.concat(wt("_",Ue(v+"",!1))),a);return l.length&&(g=Ot(t.helper(ch),[g,Jn(l)])),{slots:g,hasDynamicSlots:r}}function rl(e,t,s){const n=[wt("name",e),wt("fn",t)];return s!=null&&n.push(wt("key",Ue(String(s),!0))),ws(n)}function ml(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||ml(s.children))return!0;break;case 9:if(ml(s.branches))return!0;break;case 10:case 11:if(ml(s.children))return!0;break}}return!1}const Lh=new WeakMap,Jx=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?Yx(e,t):`"${n}"`;const r=Qe(l)&&l.callee===fc;let o,c,d=0,u,p,f,v=r||l===hi||l===oc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const g=Nh(e,t,void 0,i,r);o=g.props,d=g.patchFlag,p=g.dynamicPropNames;const T=g.directives;f=T&&T.length?Jn(T.map(R=>Xx(R,t))):void 0,g.shouldUseBlock&&(v=!0)}if(e.children.length>0)if(l===Pl&&(v=!0,d|=1024),i&&l!==hi&&l!==Pl){const{slots:T,hasDynamicSlots:R}=Zx(e,t);c=T,R&&(d|=1024)}else if(e.children.length===1&&l!==hi){const T=e.children[0],R=T.type,y=R===5||R===8;y&&gs(T,t)===0&&(d|=1),y||R===2?c=T:c=e.children}else c=e.children;p&&p.length&&(u=e0(p)),e.codegenNode=Li(t,l,o,c,d===0?void 0:d,u,f,!!v,!1,i,e.loc)};function Yx(e,t,s=!1){let{tag:n}=e;const a=ko(n),i=hr(e,"is",!1,!0);if(i)if(a||Yn("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Ue(i.value.content,!0):(r=i.exp,r||(r=Ue("is",!1,i.arg.loc))),r)return Ot(t.helper(fc),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=ph(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(pc),t.components.add(n),Di(n,"component"))}function Nh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let f=!1,v=0,g=!1,T=!1,R=!1,y=!1,m=!1,_=!1;const w=[],D=I=>{c.length&&(d.push(ws(eu(c),r)),c=[]),I&&d.push(I)},O=()=>{t.scopes.vFor>0&&c.push(wt(Ue("ref_for",!0),Ue("true")))},E=({key:I,value:B})=>{if(os(I)){const M=I.content,L=sa(M);if(L&&(!n||a)&&M.toLowerCase()!=="onclick"&&M!=="onUpdate:modelValue"&&!un(M)&&(y=!0),L&&un(M)&&(_=!0),L&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&gs(B,t)>0)return;M==="ref"?g=!0:M==="class"?T=!0:M==="style"?R=!0:M!=="key"&&!w.includes(M)&&w.push(M),n&&(M==="class"||M==="style")&&!w.includes(M)&&w.push(M)}else m=!0};for(let I=0;I<s.length;I++){const B=s[I];if(B.type===6){const{loc:M,name:L,nameLoc:W,value:ee}=B;let $=!0;if(L==="ref"&&(g=!0,O()),L==="is"&&(ko(l)||ee&&ee.content.startsWith("vue:")||Yn("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(wt(Ue(L,!0,W),Ue(ee?ee.content:"",$,ee?ee.loc:M)))}else{const{name:M,arg:L,exp:W,loc:ee,modifiers:$}=B,k=M==="bind",x=M==="on";if(M==="slot"){n||t.onError(ut(40,ee));continue}if(M==="once"||M==="memo"||M==="is"||k&&zn(L,"is")&&(ko(l)||Yn("COMPILER_IS_ON_ELEMENT",t))||x&&i)continue;if((k&&zn(L,"key")||x&&p&&zn(L,"vue:before-update"))&&(f=!0),k&&zn(L,"ref")&&O(),!L&&(k||x)){if(m=!0,W)if(k){if(D(),Yn("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(W);continue}O(),D(),d.push(W)}else D({type:14,loc:ee,callee:t.helper(xc),arguments:n?[W]:[W,"true"]});else t.onError(ut(k?34:35,ee));continue}k&&$.some(de=>de.content==="prop")&&(v|=32);const F=t.directiveTransforms[M];if(F){const{props:de,needRuntime:pe}=F(B,e,t);!i&&de.forEach(E),x&&L&&!os(L)?D(ws(de,r)):c.push(...de),pe&&(u.push(B),Kt(pe)&&Lh.set(B,pe))}else zg(M)||(u.push(B),p&&(f=!0))}}let C;if(d.length?(D(),d.length>1?C=Ot(t.helper(Fl),d,r):C=d[0]):c.length&&(C=ws(eu(c),r)),m?v|=16:(T&&!n&&(v|=2),R&&!n&&(v|=4),w.length&&(v|=8),y&&(v|=32)),!f&&(v===0||v===32)&&(g||_||u.length>0)&&(v|=512),!t.inSSR&&C)switch(C.type){case 15:let I=-1,B=-1,M=!1;for(let ee=0;ee<C.properties.length;ee++){const $=C.properties[ee].key;os($)?$.content==="class"?I=ee:$.content==="style"&&(B=ee):$.isHandlerKey||(M=!0)}const L=C.properties[I],W=C.properties[B];M?C=Ot(t.helper(Oi),[C]):(L&&!os(L.value)&&(L.value=Ot(t.helper(bc),[L.value])),W&&(R||W.value.type===4&&W.value.content.trim()[0]==="["||W.value.type===17)&&(W.value=Ot(t.helper(yc),[W.value])));break;case 14:break;default:C=Ot(t.helper(Oi),[Ot(t.helper(qi),[C])]);break}return{props:C,directives:u,patchFlag:v,dynamicPropNames:w,shouldUseBlock:f}}function eu(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||sa(i))&&Qx(l,a):(t.set(i,a),s.push(a))}return s}function Qx(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=Jn([e.value,t.value],e.loc)}function Xx(e,t){const s=[],n=Lh.get(e);n?s.push(t.helperString(n)):(t.helper(hc),t.directives.add(e.name),s.push(Di(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Ue("true",!1,a);s.push(ws(e.modifiers.map(l=>wt(l,i)),a))}return Jn(s,e.loc)}function e0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function ko(e){return e==="component"||e==="Component"}const t0=(e,t)=>{if(Hl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=s0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=Fa([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Ot(t.helper(oh),l,n)}};function s0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=at(l.name),a.push(l)));else if(l.name==="bind"&&zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=at(l.arg.content);s=l.exp=Ue(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&os(l.arg)&&(l.arg.content=at(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Nh(e,t,a,!1,!1);n=i,l.length&&t.onError(ut(36,l[0].loc))}return{slotName:s,slotProps:n}}const Dh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ut(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?wa(at(u)):`on:${u}`;r=Ue(p,!0,l.loc)}else r=Os([`${s.helperString(vo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(vo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=gh(o),p=!(u||tx(o)),f=o.content.includes(";");(p||c&&u)&&(o=Os([`${p?"$event":"(...args)"} => ${f?"{":"("}`,o,f?"}":")"]))}let d={props:[wt(r,o||Ue("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},n0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=at(i.content):i.content=`${s.helperString(mo)}(${i.content})`:(i.children.unshift(`${s.helperString(mo)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&tu(i,"."),n.some(r=>r.content==="attr")&&tu(i,"^")),{props:[wt(i,l)]}},tu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},a0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Fr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Fr(o))n||(n=s[i]=Os([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Fr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&gs(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Ot(t.helper(uc),r)}}}}},su=new WeakSet,i0=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return su.has(e)||t.inVOnce||t.inSSR?void 0:(su.add(e),t.inVOnce=!0,t.helper($l),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Mh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ut(41,e.loc)),Ya();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ut(44,n.loc)),Ya();if(r==="literal-const"||r==="setup-const")return s.onError(ut(45,n.loc)),Ya();if(!l.trim()||!gh(n))return s.onError(ut(42,n.loc)),Ya();const o=a||Ue("modelValue",!0),c=a?os(a)?`onUpdate:${at(a.content)}`:Os(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Os([`${u} => ((`,n,") = $event)"]);const p=[wt(o,e.exp),wt(c,d)];if(e.modifiers.length&&t.tagType===1){const f=e.modifiers.map(g=>g.content).map(g=>(Tc(g)?g:JSON.stringify(g))+": true").join(", "),v=a?os(a)?`${a.content}Modifiers`:Os([a,' + "Modifiers"']):"modelModifiers";p.push(wt(v,Ue(`{ ${f} }`,!1,e.loc,2)))}return Ya(p)};function Ya(e=[]){return{props:e}}const l0=/[\w).+\-_$\]]/,r0=(e,t)=>{Yn("COMPILER_FILTERS",t)&&(e.type===5?jl(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&jl(s.exp,t)}))};function jl(e,t){if(e.type===4)nu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?nu(n,t):n.type===8?jl(e,t):n.type===5&&jl(n.content,t))}}function nu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,f,v,g=[];for(f=0;f<s.length;f++)if(p=u,u=s.charCodeAt(f),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(f+1)!==124&&s.charCodeAt(f-1)!==124&&!r&&!o&&!c)v===void 0?(d=f+1,v=s.slice(0,f).trim()):T();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let R=f-1,y;for(;R>=0&&(y=s.charAt(R),y===" ");R--);(!y||!l0.test(y))&&(l=!0)}}v===void 0?v=s.slice(0,f).trim():d!==0&&T();function T(){g.push(s.slice(d,f).trim()),d=f+1}if(g.length){for(f=0;f<g.length;f++)v=o0(v,g[f],t);e.content=v,e.ast=void 0}}function o0(e,t,s){s.helper(gc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Di(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Di(a,"filter")}(${e}${i!==")"?","+i:i}`}}const au=new WeakSet,c0=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||au.has(e)||t.inSSR?void 0:(au.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&wc(n,t),e.codegenNode=Ot(t.helper(kc),[s.exp,Fa(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},d0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ut(53,n.loc)),s.exp=Ue("",!0,n.loc);else{const a=at(n.content);(fh.test(a[0])||a[0]==="-")&&(s.exp=Ue(a,!1,n.loc))}}}};function u0(e){return[[d0,i0,Hx,c0,zx,r0,t0,Jx,Gx,a0],{on:Dh,bind:n0,model:Mh}]}function p0(e,t={}){const s=t.onError||Sc,n=t.mode==="module";t.prefixIdentifiers===!0?s(ut(48)):n&&s(ut(49));const a=!1;t.cacheHandlers&&s(ut(50)),t.scopeId&&!n&&s(ut(51));const i=ze({},t,{prefixIdentifiers:a}),l=De(e)?bx(e,i):e,[r,o]=u0();return kx(l,ze({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:ze({},o,t.directiveTransforms||{})})),Cx(l,i)}const f0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Ph=Symbol(""),Fh=Symbol(""),$h=Symbol(""),Uh=Symbol(""),wo=Symbol(""),Bh=Symbol(""),Hh=Symbol(""),Vh=Symbol(""),jh=Symbol(""),zh=Symbol("");zy({[Ph]:"vModelRadio",[Fh]:"vModelCheckbox",[$h]:"vModelText",[Uh]:"vModelSelect",[wo]:"vModelDynamic",[Bh]:"withModifiers",[Hh]:"withKeys",[Vh]:"vShow",[jh]:"Transition",[zh]:"TransitionGroup"});let pa;function h0(e,t=!1){return pa||(pa=document.createElement("div")),t?(pa.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,pa.children[0].getAttribute("foo")):(pa.innerHTML=e,pa.textContent)}const g0={parseMode:"html",isVoidTag:rm,isNativeTag:e=>am(e)||im(e)||lm(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:h0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return jh;if(e==="TransitionGroup"||e==="transition-group")return zh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},m0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Ue("style",!0,t.loc),exp:v0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},v0=(e,t)=>{const s=sp(e);return Ue(JSON.stringify(s),!1,t,3)};function Dn(e,t){return ut(e,t)}const b0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Dn(54,a)),t.children.length&&(s.onError(Dn(55,a)),t.children.length=0),{props:[wt(Ue("innerHTML",!0,a),n||Ue("",!0))]}},y0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Dn(56,a)),t.children.length&&(s.onError(Dn(57,a)),t.children.length=0),{props:[wt(Ue("textContent",!0),n?gs(n,s)>0?n:Ot(s.helperString(fr),[n],a):Ue("",!0))]}},x0=(e,t,s)=>{const n=Mh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Dn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=$h,r=!1;if(a==="input"||i){const o=hr(t,"type");if(o){if(o.type===7)l=wo;else if(o.value)switch(o.value.content){case"radio":l=Ph;break;case"checkbox":l=Fh;break;case"file":r=!0,s.onError(Dn(60,e.loc));break}}else sx(t)&&(l=wo)}else a==="select"&&(l=Uh);r||(n.needRuntime=s.helper(l))}else s.onError(Dn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},_0=bs("passive,once,capture"),k0=bs("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),w0=bs("left,right"),qh=bs("onkeyup,onkeydown,onkeypress"),S0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Ni("COMPILER_V_ON_NATIVE",s)||_0(o)?l.push(o):w0(o)?os(e)?qh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):k0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},iu=(e,t)=>os(e)&&e.content.toLowerCase()==="onclick"?Ue(t,!0):e.type!==4?Os(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,T0=(e,t,s)=>Dh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=S0(i,a,s,e.loc);if(o.includes("right")&&(i=iu(i,"onContextmenu")),o.includes("middle")&&(i=iu(i,"onMouseup")),o.length&&(l=Ot(s.helper(Bh),[l,JSON.stringify(o)])),r.length&&(!os(i)||qh(i.content.toLowerCase()))&&(l=Ot(s.helper(Hh),[l,JSON.stringify(r)])),c.length){const d=c.map(aa).join("");i=os(i)?Ue(`${i.content}${d}`,!0):Os(["(",i,`) + "${d}"`])}return{props:[wt(i,l)]}}),C0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Dn(62,a)),{props:[],needRuntime:s.helper(Vh)}},E0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},A0=[m0],R0={cloak:f0,html:b0,text:y0,model:x0,on:T0,show:C0};function I0(e,t={}){return p0(e,ze({},g0,t,{nodeTransforms:[E0,...A0,...t.nodeTransforms||[]],directiveTransforms:ze({},R0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const lu=Object.create(null);function O0(e,t){if(!De(e))if(e.nodeType)e=e.innerHTML;else return Ut;const s=Gg(e,t),n=lu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=ze({hoistStatic:!0,onError:void 0,onWarn:Ut},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=I0(e,a),l=new Function("Vue",i)($y);return l._rc=!0,lu[s]=l}Af(O0);const zl=Pn({items:[]});let L0=1;function vr(e,t="info",s=3e3){const n=L0++;return zl.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>Rc(n),s),n}function Rc(e){const t=zl.items.findIndex(s=>s.id===e);t>=0&&zl.items.splice(t,1)}function Te(e,t="info",s=3e3){return vr(e,t,s)}Te.success=(e,t=3e3)=>vr(e,"success",t);Te.error=(e,t=5e3)=>vr(e,"error",t);Te.info=(e,t=3e3)=>vr(e,"info",t);Te.dismiss=Rc;const N0={setup(){return{state:zl,dismiss:Rc}},template:`
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
  `},an=Pn({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ra=null;function vs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ra&&Ra(!1),an.title=e,an.message=t,an.confirmLabel=s,an.cancelLabel=n,an.danger=a,an.open=!0,new Promise(i=>{Ra=i})}function ru(e){an.open=!1,Ra&&(Ra(e),Ra=null)}const D0={setup(){function e(t){an.open&&t.key==="Escape"&&(t.stopPropagation(),ru(!1))}return Je(()=>document.addEventListener("keydown",e,!0)),xt(()=>document.removeEventListener("keydown",e,!0)),{state:an,settle:ru}},template:`
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
 */const va=typeof document<"u";function Kh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function M0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Kh(e.default)}const tt=Object.assign;function Ur(e,t){const s={};for(const n in t){const a=t[n];s[n]=Ns(a)?a.map(e):e(a)}return s}const gi=()=>{},Ns=Array.isArray;function ou(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Gh=/#/g,P0=/&/g,F0=/\//g,$0=/=/g,U0=/\?/g,Wh=/\+/g,B0=/%5B/g,H0=/%5D/g,Zh=/%5E/g,V0=/%60/g,Jh=/%7B/g,j0=/%7C/g,Yh=/%7D/g,z0=/%20/g;function Ic(e){return e==null?"":encodeURI(""+e).replace(j0,"|").replace(B0,"[").replace(H0,"]")}function q0(e){return Ic(e).replace(Jh,"{").replace(Yh,"}").replace(Zh,"^")}function So(e){return Ic(e).replace(Wh,"%2B").replace(z0,"+").replace(Gh,"%23").replace(P0,"%26").replace(V0,"`").replace(Jh,"{").replace(Yh,"}").replace(Zh,"^")}function K0(e){return So(e).replace($0,"%3D")}function G0(e){return Ic(e).replace(Gh,"%23").replace(U0,"%3F")}function W0(e){return G0(e).replace(F0,"%2F")}function Pi(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Z0=/\/$/,J0=e=>e.replace(Z0,"");function Br(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=e_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:Pi(l)}}function Y0(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function cu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function Q0(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ba(t.matched[n],s.matched[a])&&Qh(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ba(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function Qh(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!X0(e[s],t[s]))return!1;return!0}function X0(e,t){return Ns(e)?du(e,t):Ns(t)?du(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function du(e,t){return Ns(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function e_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const Tn={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let To=(function(e){return e.pop="pop",e.push="push",e})({}),Hr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function t_(e){if(!e)if(va){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),J0(e)}const s_=/^[^#]+#/;function n_(e,t){return e.replace(s_,"#")+t}function a_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const br=()=>({left:window.scrollX,top:window.scrollY});function i_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=a_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function uu(e,t){return(history.state?history.state.position-t:-1)+e}const Co=new Map;function l_(e,t){Co.set(e,t)}function r_(e){const t=Co.get(e);return Co.delete(e),t}function o_(e){return typeof e=="string"||e&&typeof e=="object"}function Xh(e){return typeof e=="string"||typeof e=="symbol"}let gt=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const eg=Symbol("");gt.MATCHER_NOT_FOUND+"",gt.NAVIGATION_GUARD_REDIRECT+"",gt.NAVIGATION_ABORTED+"",gt.NAVIGATION_CANCELLED+"",gt.NAVIGATION_DUPLICATED+"";function Ha(e,t){return tt(new Error,{type:e,[eg]:!0},t)}function Xs(e,t){return e instanceof Error&&eg in e&&(t==null||!!(e.type&t))}const c_=["params","query","hash"];function d_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of c_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function u_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(Wh," "),i=a.indexOf("="),l=Pi(i<0?a:a.slice(0,i)),r=i<0?null:Pi(a.slice(i+1));if(l in t){let o=t[l];Ns(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function pu(e){let t="";for(let s in e){const n=e[s];if(s=K0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Ns(n)?n.map(a=>a&&So(a)):[n&&So(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function p_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Ns(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const f_=Symbol(""),fu=Symbol(""),yr=Symbol(""),Oc=Symbol(""),Eo=Symbol("");function Qa(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Ln(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(Ha(gt.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):o_(p)?o(Ha(gt.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function Vr(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Kh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Ln(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=M0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Ln(p,s,n,l,r,a)()}))}}return i}function h_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ba(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ba(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let g_=()=>location.protocol+"//"+location.host;function tg(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),cu(r,"")}return cu(s,e)+n+a}function m_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const f=tg(e,location),v=s.value,g=t.value;let T=0;if(p){if(s.value=f,t.value=p,l&&l===v){l=null;return}T=g?p.position-g.position:0}else n(f);a.forEach(R=>{R(s.value,v,{delta:T,type:To.pop,direction:T?T>0?Hr.forward:Hr.back:Hr.unknown})})};function o(){l=s.value}function c(p){a.push(p);const f=()=>{const v=a.indexOf(p);v>-1&&a.splice(v,1)};return i.push(f),f}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(tt({},p.state,{scroll:br()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function hu(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?br():null}}function v_(e){const{history:t,location:s}=window,n={value:tg(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:g_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(f){console.error(f),s[d?"replace":"assign"](p)}}function l(o,c){i(o,tt({},t.state,hu(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=tt({},a.value,t.state,{forward:o,scroll:br()});i(d.current,d,!0),i(o,tt({},hu(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function b_(e){e=t_(e);const t=v_(e),s=m_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=tt({location:"",base:e,go:n,createHref:n_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function y_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),b_(e)}let Kn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var At=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(At||{});const x_={type:Kn.Static,value:""},__=/[a-zA-Z0-9_]/;function k_(e){if(!e)return[[]];if(e==="/")return[[x_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(f){throw new Error(`ERR (${s})/"${c}": ${f}`)}let s=At.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===At.Static?i.push({type:Kn.Static,value:c}):s===At.Param||s===At.ParamRegExp||s===At.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Kn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==At.ParamRegExp){n=s,s=At.EscapeNext;continue}switch(s){case At.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=At.Param):p();break;case At.EscapeNext:p(),s=n;break;case At.Param:o==="("?s=At.ParamRegExp:__.test(o)?p():(u(),s=At.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case At.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=At.ParamRegExpEnd:d+=o;break;case At.ParamRegExpEnd:u(),s=At.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===At.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const gu="[^/]+?",w_={sensitive:!1,strict:!1,start:!0,end:!0};var Jt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Jt||{});const S_=/[.+*?^${}()[\]/\\]/g;function T_(e,t){const s=tt({},w_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Jt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let f=Jt.Segment+(s.sensitive?Jt.BonusCaseSensitive:0);if(p.type===Kn.Static)u||(a+="/"),a+=p.value.replace(S_,"\\$&"),f+=Jt.Static;else if(p.type===Kn.Param){const{value:v,repeatable:g,optional:T,regexp:R}=p;i.push({name:v,repeatable:g,optional:T});const y=R||gu;if(y!==gu){f+=Jt.BonusCustomRegExp;try{`${y}`}catch(_){throw new Error(`Invalid custom RegExp for param "${v}" (${y}): `+_.message)}}let m=g?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(m=T&&c.length<2?`(?:/${m})`:"/"+m),T&&(m+="?"),a+=m,f+=Jt.Dynamic,T&&(f+=Jt.BonusOptional),g&&(f+=Jt.BonusRepeatable),y===".*"&&(f+=Jt.BonusWildcard)}d.push(f)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Jt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const f=d[p]||"",v=i[p-1];u[v.name]=f&&v.repeatable?f.split("/"):f}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const f of p)if(f.type===Kn.Static)d+=f.value;else if(f.type===Kn.Param){const{value:v,repeatable:g,optional:T}=f,R=v in c?c[v]:"";if(Ns(R)&&!g)throw new Error(`Provided param "${v}" is an array but it is not repeatable (* or + modifiers)`);const y=Ns(R)?R.join("/"):R;if(!y)if(T)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${v}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function C_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Jt.Static+Jt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Jt.Static+Jt.Segment?1:-1:0}function sg(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=C_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(mu(n))return 1;if(mu(a))return-1}return a.length-n.length}function mu(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const E_={strict:!1,end:!0,sensitive:!1};function A_(e,t,s){const n=T_(k_(e.path),s),a=tt(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function R_(e,t){const s=[],n=new Map;t=ou(E_,t);function a(u){return n.get(u)}function i(u,p,f){const v=!f,g=bu(u);g.aliasOf=f&&f.record;const T=ou(t,u),R=[g];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const w of _)R.push(bu(tt({},g,{components:f?f.record.components:g.components,path:w,aliasOf:f?f.record:g})))}let y,m;for(const _ of R){const{path:w}=_;if(p&&w[0]!=="/"){const D=p.record.path,O=D[D.length-1]==="/"?"":"/";_.path=p.record.path+(w&&O+w)}if(y=A_(_,p,T),f?f.alias.push(y):(m=m||y,m!==y&&m.alias.push(y),v&&u.name&&!yu(y)&&l(u.name)),ng(y)&&o(y),g.children){const D=g.children;for(let O=0;O<D.length;O++)i(D[O],y,f&&f.children[O])}f=f||y}return m?()=>{l(m)}:gi}function l(u){if(Xh(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=L_(u,s);s.splice(p,0,u),u.record.name&&!yu(u)&&n.set(u.record.name,u)}function c(u,p){let f,v={},g,T;if("name"in u&&u.name){if(f=n.get(u.name),!f)throw Ha(gt.MATCHER_NOT_FOUND,{location:u});T=f.record.name,v=tt(vu(p.params,f.keys.filter(m=>!m.optional).concat(f.parent?f.parent.keys.filter(m=>m.optional):[]).map(m=>m.name)),u.params&&vu(u.params,f.keys.map(m=>m.name))),g=f.stringify(v)}else if(u.path!=null)g=u.path,f=s.find(m=>m.re.test(g)),f&&(v=f.parse(g),T=f.record.name);else{if(f=p.name?n.get(p.name):s.find(m=>m.re.test(p.path)),!f)throw Ha(gt.MATCHER_NOT_FOUND,{location:u,currentLocation:p});T=f.record.name,v=tt({},p.params,u.params),g=f.stringify(v)}const R=[];let y=f;for(;y;)R.unshift(y.record),y=y.parent;return{name:T,path:g,params:v,matched:R,meta:O_(R)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function vu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function bu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:I_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function I_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function yu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function O_(e){return e.reduce((t,s)=>tt(t,s.meta),{})}function L_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;sg(e,t[i])<0?n=i:s=i+1}const a=N_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function N_(e){let t=e;for(;t=t.parent;)if(ng(t)&&sg(e,t)===0)return t}function ng({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function xu(e){const t=Ss(yr),s=Ss(Oc),n=Y(()=>{const o=zs(e.to);return t.resolve(o)}),a=Y(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Ba.bind(null,d));if(p>-1)return p;const f=_u(o[c-2]);return c>1&&_u(d)===f&&u[u.length-1].path!==f?u.findIndex(Ba.bind(null,o[c-2])):p}),i=Y(()=>a.value>-1&&$_(s.params,n.value.params)),l=Y(()=>a.value>-1&&a.value===s.matched.length-1&&Qh(s.params,n.value.params));function r(o={}){if(F_(o)){const c=t[zs(e.replace)?"replace":"push"](zs(e.to)).catch(gi);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:Y(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function D_(e){return e.length===1?e[0]:e}const M_=Hi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:xu,setup(e,{slots:t}){const s=Pn(xu(e)),{options:n}=Ss(yr),a=Y(()=>({[ku(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[ku(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&D_(t.default(s));return e.custom?i:Na("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),P_=M_;function F_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function $_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Ns(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function _u(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const ku=(e,t,s)=>e??t??s,U_=Hi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ss(Eo),a=Y(()=>e.route||n.value),i=Ss(fu,0),l=Y(()=>{let c=zs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=Y(()=>a.value.matched[l.value]);di(fu,Y(()=>l.value+1)),di(f_,r),di(Eo,a);const o=h();return ds(()=>[o.value,r.value,e.name],([c,d,u],[p,f,v])=>{d&&(d.instances[u]=c,f&&f!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=f.leaveGuards),d.updateGuards.size||(d.updateGuards=f.updateGuards))),c&&d&&(!f||!Ba(d,f)||!p)&&(d.enterCallbacks[u]||[]).forEach(g=>g(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return wu(s.default,{Component:p,route:c});const f=u.props[d],v=f?f===!0?c.params:typeof f=="function"?f(c):f:null,T=Na(p,tt({},v,t,{onVnodeUnmounted:R=>{R.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return wu(s.default,{Component:T,route:c})||T}}});function wu(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const B_=U_;function H_(e){const t=R_(e.routes,e),s=e.parseQuery||u_,n=e.stringifyQuery||pu,a=e.history,i=Qa(),l=Qa(),r=Qa(),o=Ho(Tn);let c=Tn;va&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Ur.bind(null,j=>""+j),u=Ur.bind(null,W0),p=Ur.bind(null,Pi);function f(j,ue){let re,_e;return Xh(j)?(re=t.getRecordMatcher(j),_e=ue):_e=j,t.addRoute(_e,re)}function v(j){const ue=t.getRecordMatcher(j);ue&&t.removeRoute(ue)}function g(){return t.getRoutes().map(j=>j.record)}function T(j){return!!t.getRecordMatcher(j)}function R(j,ue){if(ue=tt({},ue||o.value),typeof j=="string"){const A=Br(s,j,ue.path),P=t.resolve({path:A.path},ue),J=a.createHref(A.fullPath);return tt(A,P,{params:p(P.params),hash:Pi(A.hash),redirectedFrom:void 0,href:J})}let re;if(j.path!=null)re=tt({},j,{path:Br(s,j.path,ue.path).path});else{const A=tt({},j.params);for(const P in A)A[P]==null&&delete A[P];re=tt({},j,{params:u(A)}),ue.params=u(ue.params)}const _e=t.resolve(re,ue),ve=j.hash||"";_e.params=d(p(_e.params));const Be=Y0(n,tt({},j,{hash:q0(ve),path:_e.path})),b=a.createHref(Be);return tt({fullPath:Be,hash:ve,query:n===pu?p_(j.query):j.query||{}},_e,{redirectedFrom:void 0,href:b})}function y(j){return typeof j=="string"?Br(s,j,o.value.path):tt({},j)}function m(j,ue){if(c!==j)return Ha(gt.NAVIGATION_CANCELLED,{from:ue,to:j})}function _(j){return O(j)}function w(j){return _(tt(y(j),{replace:!0}))}function D(j,ue){const re=j.matched[j.matched.length-1];if(re&&re.redirect){const{redirect:_e}=re;let ve=typeof _e=="function"?_e(j,ue):_e;return typeof ve=="string"&&(ve=ve.includes("?")||ve.includes("#")?ve=y(ve):{path:ve},ve.params={}),tt({query:j.query,hash:j.hash,params:ve.path!=null?{}:j.params},ve)}}function O(j,ue){const re=c=R(j),_e=o.value,ve=j.state,Be=j.force,b=j.replace===!0,A=D(re,_e);if(A)return O(tt(y(A),{state:typeof A=="object"?tt({},ve,A.state):ve,force:Be,replace:b}),ue||re);const P=re;P.redirectedFrom=ue;let J;return!Be&&Q0(n,_e,re)&&(J=Ha(gt.NAVIGATION_DUPLICATED,{to:P,from:_e}),pe(_e,_e,!0,!1)),(J?Promise.resolve(J):I(P,_e)).catch(q=>Xs(q)?Xs(q,gt.NAVIGATION_GUARD_REDIRECT)?q:de(q):x(q,P,_e)).then(q=>{if(q){if(Xs(q,gt.NAVIGATION_GUARD_REDIRECT))return O(tt({replace:b},y(q.to),{state:typeof q.to=="object"?tt({},ve,q.to.state):ve,force:Be}),ue||P)}else q=M(P,_e,!0,b,ve);return B(P,_e,q),q})}function E(j,ue){const re=m(j,ue);return re?Promise.reject(re):Promise.resolve()}function C(j){const ue=Q.values().next().value;return ue&&typeof ue.runWithContext=="function"?ue.runWithContext(j):j()}function I(j,ue){let re;const[_e,ve,Be]=h_(j,ue);re=Vr(_e.reverse(),"beforeRouteLeave",j,ue);for(const A of _e)A.leaveGuards.forEach(P=>{re.push(Ln(P,j,ue))});const b=E.bind(null,j,ue);return re.push(b),Me(re).then(()=>{re=[];for(const A of i.list())re.push(Ln(A,j,ue));return re.push(b),Me(re)}).then(()=>{re=Vr(ve,"beforeRouteUpdate",j,ue);for(const A of ve)A.updateGuards.forEach(P=>{re.push(Ln(P,j,ue))});return re.push(b),Me(re)}).then(()=>{re=[];for(const A of Be)if(A.beforeEnter)if(Ns(A.beforeEnter))for(const P of A.beforeEnter)re.push(Ln(P,j,ue));else re.push(Ln(A.beforeEnter,j,ue));return re.push(b),Me(re)}).then(()=>(j.matched.forEach(A=>A.enterCallbacks={}),re=Vr(Be,"beforeRouteEnter",j,ue,C),re.push(b),Me(re))).then(()=>{re=[];for(const A of l.list())re.push(Ln(A,j,ue));return re.push(b),Me(re)}).catch(A=>Xs(A,gt.NAVIGATION_CANCELLED)?A:Promise.reject(A))}function B(j,ue,re){r.list().forEach(_e=>C(()=>_e(j,ue,re)))}function M(j,ue,re,_e,ve){const Be=m(j,ue);if(Be)return Be;const b=ue===Tn,A=va?history.state:{};re&&(_e||b?a.replace(j.fullPath,tt({scroll:b&&A&&A.scroll},ve)):a.push(j.fullPath,ve)),o.value=j,pe(j,ue,re,b),de()}let L;function W(){L||(L=a.listen((j,ue,re)=>{if(!fe.listening)return;const _e=R(j),ve=D(_e,fe.currentRoute.value);if(ve){O(tt(ve,{replace:!0,force:!0}),_e).catch(gi);return}c=_e;const Be=o.value;va&&l_(uu(Be.fullPath,re.delta),br()),I(_e,Be).catch(b=>Xs(b,gt.NAVIGATION_ABORTED|gt.NAVIGATION_CANCELLED)?b:Xs(b,gt.NAVIGATION_GUARD_REDIRECT)?(O(tt(y(b.to),{force:!0}),_e).then(A=>{Xs(A,gt.NAVIGATION_ABORTED|gt.NAVIGATION_DUPLICATED)&&!re.delta&&re.type===To.pop&&a.go(-1,!1)}).catch(gi),Promise.reject()):(re.delta&&a.go(-re.delta,!1),x(b,_e,Be))).then(b=>{b=b||M(_e,Be,!1),b&&(re.delta&&!Xs(b,gt.NAVIGATION_CANCELLED)?a.go(-re.delta,!1):re.type===To.pop&&Xs(b,gt.NAVIGATION_ABORTED|gt.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(_e,Be,b)}).catch(gi)}))}let ee=Qa(),$=Qa(),k;function x(j,ue,re){de(j);const _e=$.list();return _e.length?_e.forEach(ve=>ve(j,ue,re)):console.error(j),Promise.reject(j)}function F(){return k&&o.value!==Tn?Promise.resolve():new Promise((j,ue)=>{ee.add([j,ue])})}function de(j){return k||(k=!j,W(),ee.list().forEach(([ue,re])=>j?re(j):ue()),ee.reset()),j}function pe(j,ue,re,_e){const{scrollBehavior:ve}=e;if(!va||!ve)return Promise.resolve();const Be=!re&&r_(uu(j.fullPath,0))||(_e||!re)&&history.state&&history.state.scroll||null;return It().then(()=>ve(j,ue,Be)).then(b=>b&&i_(b)).catch(b=>x(b,j,ue))}const ie=j=>a.go(j);let he;const Q=new Set,fe={currentRoute:o,listening:!0,addRoute:f,removeRoute:v,clearRoutes:t.clearRoutes,hasRoute:T,getRoutes:g,resolve:R,options:e,push:_,replace:w,go:ie,back:()=>ie(-1),forward:()=>ie(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:$.add,isReady:F,install(j){j.component("RouterLink",P_),j.component("RouterView",B_),j.config.globalProperties.$router=fe,Object.defineProperty(j.config.globalProperties,"$route",{enumerable:!0,get:()=>zs(o)}),va&&!he&&o.value===Tn&&(he=!0,_(a.location).catch(_e=>{}));const ue={};for(const _e in Tn)Object.defineProperty(ue,_e,{get:()=>o.value[_e],enumerable:!0});j.provide(yr,fe),j.provide(Oc,Bo(ue)),j.provide(Eo,o);const re=j.unmount;Q.add(j),j.unmount=function(){Q.delete(j),Q.size<1&&(c=Tn,L&&L(),L=null,o.value=Tn,he=!1,k=!1),re()}}};function Me(j){return j.reduce((ue,re)=>ue.then(()=>C(re)),Promise.resolve())}return fe}function ag(){return Ss(yr)}function V_(e){return Ss(Oc)}const j_=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...["Live","Agents","Loops","Processes","Schedules"].map(e=>({group:"Operations",label:e,icon:"operations",to:{path:"/operations",query:{tab:e.toLowerCase()}}})),...["Audit","Sessions","Traces","Usage"].map(e=>({group:"History",label:e,icon:"history",to:{path:"/history",query:{tab:e.toLowerCase()}}})),...["Tools","Skills","Knowledge","Memory","Learned"].map(e=>({group:"Capabilities",label:e,icon:"capabilities",to:{path:"/capabilities",query:{tab:e.toLowerCase()}}})),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...[["Health","health"],["Resources","resources"],["Logs","logs"],["Config","config"],["Discord","discord"],["Host Access","host-access"],["API Tokens","api-tokens"],["LLM Config","llm"],["Internals","internals"],["Update","update"]].map(([e,t])=>({group:"System",label:e,icon:"system",to:{path:"/system",query:{tab:t}}}))],is=Pn({open:!1,query:"",selected:0});function Su(){is.query="",is.selected=0,is.open=!0}function jr(){is.open=!1}function z_(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const q_={setup(){const e=ag(),t=h(null),s=Y(()=>{const i=is.query.trim().toLowerCase();return j_.map(l=>({...l,_score:z_(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});ds(()=>is.open,async i=>{var l;i&&(await It(),(l=t.value)==null||l.focus())}),ds(()=>is.query,()=>{is.selected=0});function n(i){jr(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),jr();return}if(i.key==="ArrowDown")i.preventDefault(),is.selected=Math.min(is.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),is.selected=Math.max(is.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[is.selected];l&&n(l)}}return{state:is,results:s,inputEl:t,go:n,onKeydown:a,closePalette:jr}},template:`
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
  `},Ao={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Ao));const K_={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Na("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Na("path",{d:Ao[e.name]||Ao.info})])}},G_=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function Tu(e){return[...e.querySelectorAll(G_)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const W_={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=Tu(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||Tu(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}};function Lc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function la(e){const t=Lc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Nc(e){const t=Lc(e);return t?t.toLocaleTimeString():"—"}function ig(e){const t=Lc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Va(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Dc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function lg(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Cu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function rg(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function og(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const Z_={template:`
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h([]),a=h(!1),i=h([]),l=h(!1),r=h([]),o=h(0),c=h(null),d=h({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=Y(()=>{const L=e.value.uptime_seconds||0,W=Math.floor(L/86400),ee=Math.floor(L%86400/3600),$=Math.floor(L%3600/60),k=[];return W>0&&k.push(`${W}d`),ee>0&&k.push(`${ee}h`),(k.length===0||W===0&&ee===0)&&k.push(`${$}m`),k.join(" ")}),f=Y(()=>{const L=e.value.uptime_seconds||0;return 125.66*(1-Math.min(L/86400,1))}),v=Y(()=>{const L=e.value;return[{label:"Guilds",value:L.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:L.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:L.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${L.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:L.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:L.loop_count>0?"text-green-400":"",highlight:L.loop_count>0},{label:"Agents",value:L.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:L.agent_count>0?`${L.agent_count} total`:"",subColor:"text-gray-500",highlight:(L.agent_running??0)>0},{label:"Processes",value:L.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:L.process_count>0?`${L.process_count} total`:"",subColor:"text-gray-500",highlight:(L.process_running??0)>0},{label:"Schedules",value:L.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(L.schedule_failing>0?`${L.schedule_failing} failing`:"")+(L.schedule_failing>0&&L.schedule_paused>0?", ":"")+(L.schedule_paused>0?`${L.schedule_paused} paused`:"")||void 0,subColor:L.schedule_failing>0?"text-red-400":"text-yellow-400",color:L.schedule_failing>0?"text-red-400":"",highlight:L.schedule_failing>0},{label:"Users",value:L.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),g=Y(()=>{const L=e.value,W=[];return W.push({label:"Bot",status:L.status==="online"?"ok":"warn",detail:L.status==="online"?"Online":"Starting"}),(L.schedule_failing||0)>0?W.push({label:"Schedules",status:"error",detail:`${L.schedule_failing} failing`}):(L.schedule_count||0)>0&&W.push({label:"Schedules",status:"ok",detail:`${L.schedule_count} configured`}),(L.loop_count||0)>0&&W.push({label:"Loops",status:"ok",detail:`${L.loop_count} active`}),(L.agent_running||0)>0&&W.push({label:"Agents",status:"ok",detail:`${L.agent_running} running`}),(L.process_running||0)>0&&W.push({label:"Processes",status:"ok",detail:`${L.process_running} running`}),W});async function T(){try{e.value=await G.get("/api/status"),s.value=null}catch(L){s.value=L.message}finally{t.value=!1}}async function R(){a.value=!0;try{n.value=await G.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await G.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function m(){try{const L=await G.get("/api/knowledge");c.value=(Array.isArray(L)?L:[]).reduce((W,ee)=>W+(ee.chunks||0),0)}catch{c.value=null}}async function _(){try{const L=await G.get("/api/agents");r.value=L.filter(W=>W.status==="running")}catch{}}async function w(){d.value={...d.value,reload:!0};try{await G.post("/api/reload"),Te.success("Config reloaded")}catch(L){Te.error(L.message)}d.value={...d.value,reload:!1}}async function D(){if(!await vs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const W=e.value.session_count;e.value={...e.value,session_count:0};try{const ee=await G.post("/api/sessions/clear-all");Te.success(`Cleared ${ee.count} session${ee.count!==1?"s":""}`),await T()}catch(ee){e.value={...e.value,session_count:W},Te.error(ee.message)}d.value={...d.value,clearSessions:!1}}async function O(){if(!await vs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const W=e.value.loop_count;e.value={...e.value,loop_count:0};try{const ee=await G.post("/api/loops/stop-all");Te.success(ee.result),await T()}catch(ee){e.value={...e.value,loop_count:W},Te.error(ee.message)}d.value={...d.value,stopLoops:!1}}function E(){t.value=!0,s.value=null,T(),R(),y(),_()}let C=null,I=null,B=null;function M(L){if(L.payload&&L.payload.tool_name){const W={...L.payload,_isNew:!0,_key:++u};n.value.unshift(W),n.value.length>10&&n.value.pop(),o.value++,W.error&&(i.value.unshift(W),i.value.length>5&&i.value.pop()),setTimeout(()=>{W._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return Je(async()=>{await Promise.all([T(),R(),y(),_(),m()]),C=setInterval(T,15e3),I=setInterval(_,1e4),We.subscribe("events",M)}),xt(()=>{C&&clearInterval(C),I&&clearInterval(I),clearTimeout(B),We.unsubscribe("events",M)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:f,stats:v,healthIndicators:g,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:R,fetchStatus:T,formatTime:Nc,formatDuration:Va,retry:E,reloadConfig:w,clearSessions:D,stopAllLoops:O}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Eu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function J_(e){if(Array.isArray(e))return e}function Y_(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function Q_(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function X_(e,t){return J_(e)||Y_(e,t)||ek(e,t)||Q_()}function ek(e,t){if(e){if(typeof e=="string")return Eu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Eu(e,t):void 0}}const cg=Object.entries,Au=Object.setPrototypeOf,tk=Object.isFrozen,sk=Object.getPrototypeOf,nk=Object.getOwnPropertyDescriptor;let es=Object.freeze,Cs=Object.seal,ba=Object.create,dg=typeof Reflect<"u"&&Reflect,Ro=dg.apply,Io=dg.construct;es||(es=function(t){return t});Cs||(Cs=function(t){return t});Ro||(Ro=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});Io||(Io=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const en=Tt(Array.prototype.forEach),ak=Tt(Array.prototype.lastIndexOf),Ru=Tt(Array.prototype.pop),fa=Tt(Array.prototype.push),ik=Tt(Array.prototype.splice),Zt=Array.isArray,ri=Tt(String.prototype.toLowerCase),zr=Tt(String.prototype.toString),Iu=Tt(String.prototype.match),ha=Tt(String.prototype.replace),Ou=Tt(String.prototype.indexOf),lk=Tt(String.prototype.trim),rk=Tt(Number.prototype.toString),ok=Tt(Boolean.prototype.toString),Lu=typeof BigInt>"u"?null:Tt(BigInt.prototype.toString),Nu=typeof Symbol>"u"?null:Tt(Symbol.prototype.toString),ht=Tt(Object.prototype.hasOwnProperty),Xa=Tt(Object.prototype.toString),Mt=Tt(RegExp.prototype.test),Hn=ck(TypeError);function Tt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return Ro(e,t,n)}}function ck(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return Io(e,s)}}function He(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:ri;if(Au&&Au(e,null),!Zt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(tk(t)||(t[n]=i),a=i)}e[a]=!0}return e}function dk(e){for(let t=0;t<e.length;t++)ht(e,t)||(e[t]=null);return e}function Ht(e){const t=ba(null);for(const n of cg(e)){var s=X_(n,2);const a=s[0],i=s[1];ht(e,a)&&(Zt(i)?t[a]=dk(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Ht(i):t[a]=i)}return t}function uk(e){switch(typeof e){case"string":return e;case"number":return rk(e);case"boolean":return ok(e);case"bigint":return Lu?Lu(e):"0";case"symbol":return Nu?Nu(e):"Symbol()";case"undefined":return Xa(e);case"function":case"object":{if(e===null)return Xa(e);const t=e,s=Us(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:Xa(n)}return Xa(e)}default:return Xa(e)}}function Us(e,t){for(;e!==null;){const n=nk(e,t);if(n){if(n.get)return Tt(n.get);if(typeof n.value=="function")return Tt(n.value)}e=sk(e)}function s(){return null}return s}function pk(e){try{return Mt(e,""),!0}catch{return!1}}const Du=es(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),qr=es(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),Kr=es(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),fk=es(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),Gr=es(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),hk=es(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Mu=es(["#text"]),Pu=es(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),Wr=es(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Fu=es(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),ol=es(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),gk=Cs(/{{[\w\W]*|^[\w\W]*}}/g),mk=Cs(/<%[\w\W]*|^[\w\W]*%>/g),vk=Cs(/\${[\w\W]*/g),bk=Cs(/^data-[\-\w.\u00B7-\uFFFF]+$/),yk=Cs(/^aria-[\-\w]+$/),$u=Cs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),xk=Cs(/^(?:\w+script|data):/i),_k=Cs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),kk=Cs(/^html$/i),wk=Cs(/^[a-z][.\w]*(-[.\w]+)+$/i),Ps={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Sk=function(){return typeof window>"u"?null:window},Tk=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Uu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function ug(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Sk();const t=ye=>ug(ye);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Ps.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,f=Us(p,"cloneNode"),v=Us(p,"remove"),g=Us(p,"nextSibling"),T=Us(p,"childNodes"),R=Us(p,"parentNode"),y=Us(p,"shadowRoot"),m=Us(p,"attributes"),_=l&&l.prototype?Us(l.prototype,"nodeType"):null,w=l&&l.prototype?Us(l.prototype,"nodeName"):null;if(typeof i=="function"){const ye=s.createElement("template");ye.content&&ye.content.ownerDocument&&(s=ye.content.ownerDocument)}let D,O="",E,C=!1,I=0;const B=function(){if(I>0)throw Hn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},M=function(S){B(),I++;try{return D.createHTML(S)}finally{I--}},L=function(S){B(),I++;try{return D.createScriptURL(S)}finally{I--}},W=function(){return C||(E=Tk(u,a),C=!0),E},ee=s,$=ee.implementation,k=ee.createNodeIterator,x=ee.createDocumentFragment,F=ee.getElementsByTagName,de=n.importNode;let pe=Uu();t.isSupported=typeof cg=="function"&&typeof R=="function"&&$&&$.createHTMLDocument!==void 0;const ie=gk,he=mk,Q=vk,fe=bk,Me=yk,j=xk,ue=_k,re=wk;let _e=$u,ve=null;const Be=He({},[...Du,...qr,...Kr,...Gr,...Mu]);let b=null;const A=He({},[...Pu,...Wr,...Fu,...ol]);let P=Object.seal(ba(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),J=null,q=null;const Z=Object.seal(ba(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let oe=!0,ae=!0,se=!1,X=!0,xe=!1,ce=!0,ge=!1,ke=!1,Se=!1,Re=!1,Ie=!1,$e=!1,Ve=!0,V=!1;const me="user-content-";let Pe=!0,nt=!1,qe={},Ne=null;const rt=He({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let Gt=null;const ts=He({},["audio","video","img","source","image","track"]);let Gs=null;const Ds=He({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ms="http://www.w3.org/1998/Math/MathML",us="http://www.w3.org/2000/svg",z="http://www.w3.org/1999/xhtml";let Ee=z,ps=!1,Ws=null;const oa=He({},[Ms,us,z],zr);let _n=He({},["mi","mo","mn","ms","mtext"]),Zs=He({},["annotation-xml"]);const N=He({},["title","style","font","a","script"]);let H=null;const te=["application/xhtml+xml","text/html"],we="text/html";let Ce=null,Ct=null;const U=s.createElement("form"),ne=function(S){return S instanceof RegExp||S instanceof Function},Oe=function(){let S=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Ct&&Ct===S)return;(!S||typeof S!="object")&&(S={}),S=Ht(S),H=te.indexOf(S.PARSER_MEDIA_TYPE)===-1?we:S.PARSER_MEDIA_TYPE,Ce=H==="application/xhtml+xml"?zr:ri,ve=ht(S,"ALLOWED_TAGS")&&Zt(S.ALLOWED_TAGS)?He({},S.ALLOWED_TAGS,Ce):Be,b=ht(S,"ALLOWED_ATTR")&&Zt(S.ALLOWED_ATTR)?He({},S.ALLOWED_ATTR,Ce):A,Ws=ht(S,"ALLOWED_NAMESPACES")&&Zt(S.ALLOWED_NAMESPACES)?He({},S.ALLOWED_NAMESPACES,zr):oa,Gs=ht(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)?He(Ht(Ds),S.ADD_URI_SAFE_ATTR,Ce):Ds,Gt=ht(S,"ADD_DATA_URI_TAGS")&&Zt(S.ADD_DATA_URI_TAGS)?He(Ht(ts),S.ADD_DATA_URI_TAGS,Ce):ts,Ne=ht(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)?He({},S.FORBID_CONTENTS,Ce):rt,J=ht(S,"FORBID_TAGS")&&Zt(S.FORBID_TAGS)?He({},S.FORBID_TAGS,Ce):Ht({}),q=ht(S,"FORBID_ATTR")&&Zt(S.FORBID_ATTR)?He({},S.FORBID_ATTR,Ce):Ht({}),qe=ht(S,"USE_PROFILES")?S.USE_PROFILES&&typeof S.USE_PROFILES=="object"?Ht(S.USE_PROFILES):S.USE_PROFILES:!1,oe=S.ALLOW_ARIA_ATTR!==!1,ae=S.ALLOW_DATA_ATTR!==!1,se=S.ALLOW_UNKNOWN_PROTOCOLS||!1,X=S.ALLOW_SELF_CLOSE_IN_ATTR!==!1,xe=S.SAFE_FOR_TEMPLATES||!1,ce=S.SAFE_FOR_XML!==!1,ge=S.WHOLE_DOCUMENT||!1,Re=S.RETURN_DOM||!1,Ie=S.RETURN_DOM_FRAGMENT||!1,$e=S.RETURN_TRUSTED_TYPE||!1,Se=S.FORCE_BODY||!1,Ve=S.SANITIZE_DOM!==!1,V=S.SANITIZE_NAMED_PROPS||!1,Pe=S.KEEP_CONTENT!==!1,nt=S.IN_PLACE||!1,_e=pk(S.ALLOWED_URI_REGEXP)?S.ALLOWED_URI_REGEXP:$u,Ee=typeof S.NAMESPACE=="string"?S.NAMESPACE:z,_n=ht(S,"MATHML_TEXT_INTEGRATION_POINTS")&&S.MATHML_TEXT_INTEGRATION_POINTS&&typeof S.MATHML_TEXT_INTEGRATION_POINTS=="object"?Ht(S.MATHML_TEXT_INTEGRATION_POINTS):He({},["mi","mo","mn","ms","mtext"]),Zs=ht(S,"HTML_INTEGRATION_POINTS")&&S.HTML_INTEGRATION_POINTS&&typeof S.HTML_INTEGRATION_POINTS=="object"?Ht(S.HTML_INTEGRATION_POINTS):He({},["annotation-xml"]);const K=ht(S,"CUSTOM_ELEMENT_HANDLING")&&S.CUSTOM_ELEMENT_HANDLING&&typeof S.CUSTOM_ELEMENT_HANDLING=="object"?Ht(S.CUSTOM_ELEMENT_HANDLING):ba(null);if(P=ba(null),ht(K,"tagNameCheck")&&ne(K.tagNameCheck)&&(P.tagNameCheck=K.tagNameCheck),ht(K,"attributeNameCheck")&&ne(K.attributeNameCheck)&&(P.attributeNameCheck=K.attributeNameCheck),ht(K,"allowCustomizedBuiltInElements")&&typeof K.allowCustomizedBuiltInElements=="boolean"&&(P.allowCustomizedBuiltInElements=K.allowCustomizedBuiltInElements),xe&&(ae=!1),Ie&&(Re=!0),qe&&(ve=He({},Mu),b=ba(null),qe.html===!0&&(He(ve,Du),He(b,Pu)),qe.svg===!0&&(He(ve,qr),He(b,Wr),He(b,ol)),qe.svgFilters===!0&&(He(ve,Kr),He(b,Wr),He(b,ol)),qe.mathMl===!0&&(He(ve,Gr),He(b,Fu),He(b,ol))),Z.tagCheck=null,Z.attributeCheck=null,ht(S,"ADD_TAGS")&&(typeof S.ADD_TAGS=="function"?Z.tagCheck=S.ADD_TAGS:Zt(S.ADD_TAGS)&&(ve===Be&&(ve=Ht(ve)),He(ve,S.ADD_TAGS,Ce))),ht(S,"ADD_ATTR")&&(typeof S.ADD_ATTR=="function"?Z.attributeCheck=S.ADD_ATTR:Zt(S.ADD_ATTR)&&(b===A&&(b=Ht(b)),He(b,S.ADD_ATTR,Ce))),ht(S,"ADD_URI_SAFE_ATTR")&&Zt(S.ADD_URI_SAFE_ATTR)&&He(Gs,S.ADD_URI_SAFE_ATTR,Ce),ht(S,"FORBID_CONTENTS")&&Zt(S.FORBID_CONTENTS)&&(Ne===rt&&(Ne=Ht(Ne)),He(Ne,S.FORBID_CONTENTS,Ce)),ht(S,"ADD_FORBID_CONTENTS")&&Zt(S.ADD_FORBID_CONTENTS)&&(Ne===rt&&(Ne=Ht(Ne)),He(Ne,S.ADD_FORBID_CONTENTS,Ce)),Pe&&(ve["#text"]=!0),ge&&He(ve,["html","head","body"]),ve.table&&(He(ve,["tbody"]),delete J.tbody),S.TRUSTED_TYPES_POLICY){if(typeof S.TRUSTED_TYPES_POLICY.createHTML!="function")throw Hn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof S.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw Hn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const le=D;D=S.TRUSTED_TYPES_POLICY;try{O=M("")}catch(Le){throw D=le,Le}}else S.TRUSTED_TYPES_POLICY===null?(D=void 0,O=""):(D===void 0&&(D=W()),D&&typeof O=="string"&&(O=M("")));(pe.uponSanitizeElement.length>0||pe.uponSanitizeAttribute.length>0)&&ve===Be&&(ve=Ht(ve)),pe.uponSanitizeAttribute.length>0&&b===A&&(b=Ht(b)),es&&es(S),Ct=S},it=He({},[...qr,...Kr,...fk]),ft=He({},[...Gr,...hk]),ss=function(S){let K=R(S);(!K||!K.tagName)&&(K={namespaceURI:Ee,tagName:"template"});const le=ri(S.tagName),Le=ri(K.tagName);return Ws[S.namespaceURI]?S.namespaceURI===us?K.namespaceURI===z?le==="svg":K.namespaceURI===Ms?le==="svg"&&(Le==="annotation-xml"||_n[Le]):!!it[le]:S.namespaceURI===Ms?K.namespaceURI===z?le==="math":K.namespaceURI===us?le==="math"&&Zs[Le]:!!ft[le]:S.namespaceURI===z?K.namespaceURI===us&&!Zs[Le]||K.namespaceURI===Ms&&!_n[Le]?!1:!ft[le]&&(N[le]||!it[le]):!!(H==="application/xhtml+xml"&&Ws[S.namespaceURI]):!1},fs=function(S){fa(t.removed,{element:S});try{R(S).removeChild(S)}catch{if(v(S),!R(S))throw Hn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},zc=function(S){const K=T?T(S):S.childNodes;if(K){const Le=[];en(K,Fe=>{fa(Le,Fe)}),en(Le,Fe=>{try{v(Fe)}catch{}})}const le=m?m(S):null;if(le)for(let Le=le.length-1;Le>=0;--Le){const Fe=le[Le],je=Fe&&Fe.name;if(typeof je=="string")try{S.removeAttribute(je)}catch{}}},$n=function(S,K){try{fa(t.removed,{attribute:K.getAttributeNode(S),from:K})}catch{fa(t.removed,{attribute:null,from:K})}if(K.removeAttribute(S),S==="is")if(Re||Ie)try{fs(K)}catch{}else try{K.setAttribute(S,"")}catch{}},Ng=function(S){const K=m?m(S):S.attributes;if(K)for(let le=K.length-1;le>=0;--le){const Le=K[le],Fe=Le&&Le.name;if(!(typeof Fe!="string"||b[Ce(Fe)]))try{S.removeAttribute(Fe)}catch{}}},Dg=function(S){const K=[S];for(;K.length>0;){const le=K.pop();(_?_(le):le.nodeType)===Ps.element&&Ng(le);const Fe=T?T(le):le.childNodes;if(Fe)for(let je=Fe.length-1;je>=0;--je)K.push(Fe[je])}},qc=function(S){let K=null,le=null;if(Se)S="<remove></remove>"+S;else{const je=Iu(S,/^[\r\n\t ]+/);le=je&&je[0]}H==="application/xhtml+xml"&&Ee===z&&(S='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+S+"</body></html>");const Le=D?M(S):S;if(Ee===z)try{K=new d().parseFromString(Le,H)}catch{}if(!K||!K.documentElement){K=$.createDocument(Ee,"template",null);try{K.documentElement.innerHTML=ps?O:Le}catch{}}const Fe=K.body||K.documentElement;return S&&le&&Fe.insertBefore(s.createTextNode(le),Fe.childNodes[0]||null),Ee===z?F.call(K,ge?"html":"body")[0]:ge?K.documentElement:Fe},Kc=function(S){return k.call(S.ownerDocument||S,S,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},wr=function(S){var K,le;S.normalize();const Le=k.call(S.ownerDocument||S,S,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let Fe=Le.nextNode();for(;Fe;){let Et=Fe.data;en([ie,he,Q],ot=>{Et=ha(Et,ot," ")}),Fe.data=Et,Fe=Le.nextNode()}const je=(K=(le=S.querySelectorAll)===null||le===void 0?void 0:le.call(S,"template"))!==null&&K!==void 0?K:[];en(Array.from(je),Et=>{ca(Et.content)&&wr(Et.content)})},Wi=function(S){const K=w?w(S):null;return typeof K!="string"||Ce(K)!=="form"?!1:typeof S.nodeName!="string"||typeof S.textContent!="string"||typeof S.removeChild!="function"||S.attributes!==m(S)||typeof S.removeAttribute!="function"||typeof S.setAttribute!="function"||typeof S.namespaceURI!="string"||typeof S.insertBefore!="function"||typeof S.hasChildNodes!="function"||S.nodeType!==_(S)||S.childNodes!==T(S)},ca=function(S){if(!_||typeof S!="object"||S===null)return!1;try{return _(S)===Ps.documentFragment}catch{return!1}},Ka=function(S){if(!_||typeof S!="object"||S===null)return!1;try{return typeof _(S)=="number"}catch{return!1}};function Js(ye,S,K){en(ye,le=>{le.call(t,S,K,Ct)})}const Gc=function(S){let K=null;if(Js(pe.beforeSanitizeElements,S,null),Wi(S))return fs(S),!0;const le=Ce(w?w(S):S.nodeName);if(Js(pe.uponSanitizeElement,S,{tagName:le,allowedTags:ve}),ce&&S.hasChildNodes()&&!Ka(S.firstElementChild)&&Mt(/<[/\w!]/g,S.innerHTML)&&Mt(/<[/\w!]/g,S.textContent)||ce&&S.namespaceURI===z&&le==="style"&&Ka(S.firstElementChild)||S.nodeType===Ps.progressingInstruction||ce&&S.nodeType===Ps.comment&&Mt(/<[/\w]/g,S.data))return fs(S),!0;if(J[le]||!(Z.tagCheck instanceof Function&&Z.tagCheck(le))&&!ve[le]){if(!J[le]&&Zc(le)&&(P.tagNameCheck instanceof RegExp&&Mt(P.tagNameCheck,le)||P.tagNameCheck instanceof Function&&P.tagNameCheck(le)))return!1;if(Pe&&!Ne[le]){const Fe=R(S),je=T(S);if(je&&Fe){const Et=je.length;for(let ot=Et-1;ot>=0;--ot){const vt=nt?je[ot]:f(je[ot],!0);Fe.insertBefore(vt,g(S))}}}return fs(S),!0}return(_?_(S):S.nodeType)===Ps.element&&!ss(S)||(le==="noscript"||le==="noembed"||le==="noframes")&&Mt(/<\/no(script|embed|frames)/i,S.innerHTML)?(fs(S),!0):(xe&&S.nodeType===Ps.text&&(K=S.textContent,en([ie,he,Q],Fe=>{K=ha(K,Fe," ")}),S.textContent!==K&&(fa(t.removed,{element:S.cloneNode()}),S.textContent=K)),Js(pe.afterSanitizeElements,S,null),!1)},Wc=function(S,K,le){if(q[K]||Ve&&(K==="id"||K==="name")&&(le in s||le in U))return!1;const Le=b[K]||Z.attributeCheck instanceof Function&&Z.attributeCheck(K,S);if(!(ae&&!q[K]&&Mt(fe,K))){if(!(oe&&Mt(Me,K))){if(!Le||q[K]){if(!(Zc(S)&&(P.tagNameCheck instanceof RegExp&&Mt(P.tagNameCheck,S)||P.tagNameCheck instanceof Function&&P.tagNameCheck(S))&&(P.attributeNameCheck instanceof RegExp&&Mt(P.attributeNameCheck,K)||P.attributeNameCheck instanceof Function&&P.attributeNameCheck(K,S))||K==="is"&&P.allowCustomizedBuiltInElements&&(P.tagNameCheck instanceof RegExp&&Mt(P.tagNameCheck,le)||P.tagNameCheck instanceof Function&&P.tagNameCheck(le))))return!1}else if(!Gs[K]){if(!Mt(_e,ha(le,ue,""))){if(!((K==="src"||K==="xlink:href"||K==="href")&&S!=="script"&&Ou(le,"data:")===0&&Gt[S])){if(!(se&&!Mt(j,ha(le,ue,"")))){if(le)return!1}}}}}}return!0},Mg=He({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),Zc=function(S){return!Mg[ri(S)]&&Mt(re,S)},Jc=function(S){Js(pe.beforeSanitizeAttributes,S,null);const K=S.attributes;if(!K||Wi(S))return;const le={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:b,forceKeepAttr:void 0};let Le=K.length;for(;Le--;){const Fe=K[Le],je=Fe.name,Et=Fe.namespaceURI,ot=Fe.value,vt=Ce(je),kn=ot;let Lt=je==="value"?kn:lk(kn);if(le.attrName=vt,le.attrValue=Lt,le.keepAttr=!0,le.forceKeepAttr=void 0,Js(pe.uponSanitizeAttribute,S,le),Lt=le.attrValue,V&&(vt==="id"||vt==="name")&&Ou(Lt,me)!==0&&($n(je,S),Lt=me+Lt),ce&&Mt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Lt)){$n(je,S);continue}if(vt==="attributename"&&Iu(Lt,"href")){$n(je,S);continue}if(le.forceKeepAttr)continue;if(!le.keepAttr){$n(je,S);continue}if(!X&&Mt(/\/>/i,Lt)){$n(je,S);continue}xe&&en([ie,he,Q],Qc=>{Lt=ha(Lt,Qc," ")});const Yc=Ce(S.nodeName);if(!Wc(Yc,vt,Lt)){$n(je,S);continue}if(D&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!Et)switch(u.getAttributeType(Yc,vt)){case"TrustedHTML":{Lt=M(Lt);break}case"TrustedScriptURL":{Lt=L(Lt);break}}if(Lt!==kn)try{Et?S.setAttributeNS(Et,je,Lt):S.setAttribute(je,Lt),Wi(S)?fs(S):Ru(t.removed)}catch{$n(je,S)}}Js(pe.afterSanitizeAttributes,S,null)},Zi=function(S){let K=null;const le=Kc(S);for(Js(pe.beforeSanitizeShadowDOM,S,null);K=le.nextNode();)if(Js(pe.uponSanitizeShadowNode,K,null),Gc(K),Jc(K),ca(K.content)&&Zi(K.content),(_?_(K):K.nodeType)===Ps.element){const Fe=y?y(K):K.shadowRoot;ca(Fe)&&(Sr(Fe),Zi(Fe))}Js(pe.afterSanitizeShadowDOM,S,null)},Sr=function(S){const K=[{node:S,shadow:null}];for(;K.length>0;){const le=K.pop();if(le.shadow){Zi(le.shadow);continue}const Le=le.node,je=(_?_(Le):Le.nodeType)===Ps.element,Et=T?T(Le):Le.childNodes;if(Et)for(let ot=Et.length-1;ot>=0;--ot)K.push({node:Et[ot],shadow:null});if(je){const ot=w?w(Le):null;if(typeof ot=="string"&&Ce(ot)==="template"){const vt=Le.content;ca(vt)&&K.push({node:vt,shadow:null})}}if(je){const ot=y?y(Le):Le.shadowRoot;ca(ot)&&K.push({node:null,shadow:ot},{node:ot,shadow:null})}}};return t.sanitize=function(ye){let S=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},K=null,le=null,Le=null,Fe=null;if(ps=!ye,ps&&(ye="<!-->"),typeof ye!="string"&&!Ka(ye)&&(ye=uk(ye),typeof ye!="string"))throw Hn("dirty is not a string, aborting");if(!t.isSupported)return ye;ke||Oe(S),t.removed=[];const je=nt&&typeof ye!="string"&&Ka(ye);if(je){const vt=w?w(ye):ye.nodeName;if(typeof vt=="string"){const kn=Ce(vt);if(!ve[kn]||J[kn])throw Hn("root node is forbidden and cannot be sanitized in-place")}if(Wi(ye))throw Hn("root node is clobbered and cannot be sanitized in-place");try{Sr(ye)}catch(kn){throw zc(ye),kn}}else if(Ka(ye))K=qc("<!---->"),le=K.ownerDocument.importNode(ye,!0),le.nodeType===Ps.element&&le.nodeName==="BODY"||le.nodeName==="HTML"?K=le:K.appendChild(le),Sr(le);else{if(!Re&&!xe&&!ge&&ye.indexOf("<")===-1)return D&&$e?M(ye):ye;if(K=qc(ye),!K)return Re?null:$e?O:""}K&&Se&&fs(K.firstChild);const Et=Kc(je?ye:K);try{for(;Le=Et.nextNode();)Gc(Le),Jc(Le),ca(Le.content)&&Zi(Le.content)}catch(vt){throw je&&zc(ye),vt}if(je)return en(t.removed,vt=>{vt.element&&Dg(vt.element)}),xe&&wr(ye),ye;if(Re){if(xe&&wr(K),Ie)for(Fe=x.call(K.ownerDocument);K.firstChild;)Fe.appendChild(K.firstChild);else Fe=K;return(b.shadowroot||b.shadowrootmode)&&(Fe=de.call(n,Fe,!0)),Fe}let ot=ge?K.outerHTML:K.innerHTML;return ge&&ve["!doctype"]&&K.ownerDocument&&K.ownerDocument.doctype&&K.ownerDocument.doctype.name&&Mt(kk,K.ownerDocument.doctype.name)&&(ot="<!DOCTYPE "+K.ownerDocument.doctype.name+`>
`+ot),xe&&en([ie,he,Q],vt=>{ot=ha(ot,vt," ")}),D&&$e?M(ot):ot},t.setConfig=function(){let ye=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Oe(ye),ke=!0},t.clearConfig=function(){Ct=null,ke=!1,D=E,O=""},t.isValidAttribute=function(ye,S,K){Ct||Oe({});const le=Ce(ye),Le=Ce(S);return Wc(le,Le,K)},t.addHook=function(ye,S){typeof S=="function"&&fa(pe[ye],S)},t.removeHook=function(ye,S){if(S!==void 0){const K=ak(pe[ye],S);return K===-1?void 0:ik(pe[ye],K,1)[0]}return Ru(pe[ye])},t.removeHooks=function(ye){pe[ye]=[]},t.removeAllHooks=function(){pe=Uu()},t}var Bu=ug();function Mc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var ra=Mc();function pg(e){ra=e}var mi={exec:()=>null};function st(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Qt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Qt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Ck=/^(?:[ \t]*(?:\n|$))+/,Ek=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Ak=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Gi=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Rk=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Pc=/(?:[*+-]|\d{1,9}[.)])/,fg=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,hg=st(fg).replace(/bull/g,Pc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),Ik=st(fg).replace(/bull/g,Pc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Fc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Ok=/^[^\n]+/,$c=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Lk=st(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",$c).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),Nk=st(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Pc).getRegex(),xr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Uc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Dk=st("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Uc).replace("tag",xr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),gg=st(Fc).replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",xr).getRegex(),Mk=st(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",gg).getRegex(),Bc={blockquote:Mk,code:Ek,def:Lk,fences:Ak,heading:Rk,hr:Gi,html:Dk,lheading:hg,list:Nk,newline:Ck,paragraph:gg,table:mi,text:Ok},Hu=st("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",xr).getRegex(),Pk={...Bc,lheading:Ik,table:Hu,paragraph:st(Fc).replace("hr",Gi).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Hu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",xr).getRegex()},Fk={...Bc,html:st(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Uc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:mi,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:st(Fc).replace("hr",Gi).replace("heading",` *#{1,6} *[^
]`).replace("lheading",hg).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},$k=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Uk=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,mg=/^( {2,}|\\)\n(?!\s*$)/,Bk=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,_r=/[\p{P}\p{S}]/u,Hc=/[\s\p{P}\p{S}]/u,vg=/[^\s\p{P}\p{S}]/u,Hk=st(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,Hc).getRegex(),bg=/(?!~)[\p{P}\p{S}]/u,Vk=/(?!~)[\s\p{P}\p{S}]/u,jk=/(?:[^\s\p{P}\p{S}]|~)/u,zk=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,yg=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,qk=st(yg,"u").replace(/punct/g,_r).getRegex(),Kk=st(yg,"u").replace(/punct/g,bg).getRegex(),xg="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Gk=st(xg,"gu").replace(/notPunctSpace/g,vg).replace(/punctSpace/g,Hc).replace(/punct/g,_r).getRegex(),Wk=st(xg,"gu").replace(/notPunctSpace/g,jk).replace(/punctSpace/g,Vk).replace(/punct/g,bg).getRegex(),Zk=st("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,vg).replace(/punctSpace/g,Hc).replace(/punct/g,_r).getRegex(),Jk=st(/\\(punct)/,"gu").replace(/punct/g,_r).getRegex(),Yk=st(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Qk=st(Uc).replace("(?:-->|$)","-->").getRegex(),Xk=st("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Qk).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),ql=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,ew=st(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",ql).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),_g=st(/^!?\[(label)\]\[(ref)\]/).replace("label",ql).replace("ref",$c).getRegex(),kg=st(/^!?\[(ref)\](?:\[\])?/).replace("ref",$c).getRegex(),tw=st("reflink|nolink(?!\\()","g").replace("reflink",_g).replace("nolink",kg).getRegex(),Vc={_backpedal:mi,anyPunctuation:Jk,autolink:Yk,blockSkip:zk,br:mg,code:Uk,del:mi,emStrongLDelim:qk,emStrongRDelimAst:Gk,emStrongRDelimUnd:Zk,escape:$k,link:ew,nolink:kg,punctuation:Hk,reflink:_g,reflinkSearch:tw,tag:Xk,text:Bk,url:mi},sw={...Vc,link:st(/^!?\[(label)\]\((.*?)\)/).replace("label",ql).getRegex(),reflink:st(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ql).getRegex()},Oo={...Vc,emStrongRDelimAst:Wk,emStrongLDelim:Kk,url:st(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},nw={...Oo,br:st(mg).replace("{2,}","*").getRegex(),text:st(Oo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},cl={normal:Bc,gfm:Pk,pedantic:Fk},ei={normal:Vc,gfm:Oo,breaks:nw,pedantic:sw},aw={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Vu=e=>aw[e];function Bs(e,t){if(t){if(Qt.escapeTest.test(e))return e.replace(Qt.escapeReplace,Vu)}else if(Qt.escapeTestNoEncode.test(e))return e.replace(Qt.escapeReplaceNoEncode,Vu);return e}function ju(e){try{e=encodeURI(e).replace(Qt.percentDecode,"%")}catch{return null}return e}function zu(e,t){var i;const s=e.replace(Qt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Qt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Qt.slashPipe,"|");return n}function ti(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function iw(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function qu(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function lw(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var Kl=class{constructor(e){lt(this,"options");lt(this,"rules");lt(this,"lexer");this.options=e||ra}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ti(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=lw(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=ti(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ti(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ti(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const f=p,v=f.raw+`
`+s.join(`
`),g=this.blockquote(v);i[i.length-1]=g,n=n.substring(0,n.length-f.raw.length)+g.raw,a=a.substring(0,a.length-f.text.length)+g.text;break}else if((p==null?void 0:p.type)==="list"){const f=p,v=f.raw+`
`+s.join(`
`),g=this.list(v);i[i.length-1]=g,n=n.substring(0,n.length-p.raw.length)+g.raw,a=a.substring(0,a.length-f.raw.length)+g.raw,s=v.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,R=>" ".repeat(3*R.length)),p=e.split(`
`,1)[0],f=!u.trim(),v=0;if(this.options.pedantic?(v=2,d=u.trimStart()):f?v=t[1].length+1:(v=t[2].search(this.rules.other.nonSpaceChar),v=v>4?1:v,d=u.slice(v),v+=t[1].length),f&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const R=this.rules.other.nextBulletRegex(v),y=this.rules.other.hrRegex(v),m=this.rules.other.fencesBeginRegex(v),_=this.rules.other.headingBeginRegex(v),w=this.rules.other.htmlBeginRegex(v);for(;e;){const D=e.split(`
`,1)[0];let O;if(p=D,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),O=p):O=p.replace(this.rules.other.tabCharGlobal,"    "),m.test(p)||_.test(p)||w.test(p)||R.test(p)||y.test(p))break;if(O.search(this.rules.other.nonSpaceChar)>=v||!p.trim())d+=`
`+O.slice(v);else{if(f||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||m.test(u)||_.test(u)||y.test(u))break;d+=`
`+p}!f&&!p.trim()&&(f=!0),c+=D+`
`,e=e.substring(D.length+1),u=O.slice(v)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let g=null,T;this.options.gfm&&(g=this.rules.other.listIsTask.exec(d),g&&(T=g[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!g,checked:T,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=zu(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(zu(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ti(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=iw(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),qu(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return qu(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const v=p.slice(1,-1);return{type:"em",raw:p,text:v,tokens:this.lexer.inlineTokens(v)}}const f=p.slice(2,-2);return{type:"strong",raw:p,text:f,tokens:this.lexer.inlineTokens(f)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},cn=class Lo{constructor(t){lt(this,"tokens");lt(this,"options");lt(this,"state");lt(this,"tokenizer");lt(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||ra,this.options.tokenizer=this.options.tokenizer||new Kl,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Qt,block:cl.normal,inline:ei.normal};this.options.pedantic?(s.block=cl.pedantic,s.inline=ei.pedantic):this.options.gfm&&(s.block=cl.gfm,this.options.breaks?s.inline=ei.breaks:s.inline=ei.gfm),this.tokenizer.rules=s}static get rules(){return{block:cl,inline:ei}}static lex(t,s){return new Lo(s).lex(t)}static lexInline(t,s){return new Lo(s).inlineTokens(t)}lex(t){t=t.replace(Qt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Qt.tabCharGlobal,"    ").replace(Qt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const f=t.slice(1);let v;this.options.extensions.startInline.forEach(g=>{v=g.call({lexer:this},f),typeof v=="number"&&v>=0&&(p=Math.min(p,v))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},Gl=class{constructor(e){lt(this,"options");lt(this,"parser");this.options=e||ra}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Qt.notSpaceStart))==null?void 0:i[0],a=e.replace(Qt.endingNewline,"")+`
`;return n?'<pre><code class="language-'+Bs(n)+'">'+(s?a:Bs(a,!0))+`</code></pre>
`:"<pre><code>"+(s?a:Bs(a,!0))+`</code></pre>
`}blockquote({tokens:e}){return`<blockquote>
${this.parser.parse(e)}</blockquote>
`}html({text:e}){return e}heading({tokens:e,depth:t}){return`<h${t}>${this.parser.parseInline(e)}</h${t}>
`}hr(e){return`<hr>
`}list(e){const t=e.ordered,s=e.start;let n="";for(let l=0;l<e.items.length;l++){const r=e.items[l];n+=this.listitem(r)}const a=t?"ol":"ul",i=t&&s!==1?' start="'+s+'"':"";return"<"+a+i+`>
`+n+"</"+a+`>
`}listitem(e){var s;let t="";if(e.task){const n=this.checkbox({checked:!!e.checked});e.loose?((s=e.tokens[0])==null?void 0:s.type)==="paragraph"?(e.tokens[0].text=n+" "+e.tokens[0].text,e.tokens[0].tokens&&e.tokens[0].tokens.length>0&&e.tokens[0].tokens[0].type==="text"&&(e.tokens[0].tokens[0].text=n+" "+Bs(e.tokens[0].tokens[0].text),e.tokens[0].tokens[0].escaped=!0)):e.tokens.unshift({type:"text",raw:n+" ",text:n+" ",escaped:!0}):t+=n+" "}return t+=this.parser.parse(e.tokens,!!e.loose),`<li>${t}</li>
`}checkbox({checked:e}){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph({tokens:e}){return`<p>${this.parser.parseInline(e)}</p>
`}table(e){let t="",s="";for(let a=0;a<e.header.length;a++)s+=this.tablecell(e.header[a]);t+=this.tablerow({text:s});let n="";for(let a=0;a<e.rows.length;a++){const i=e.rows[a];s="";for(let l=0;l<i.length;l++)s+=this.tablecell(i[l]);n+=this.tablerow({text:s})}return n&&(n=`<tbody>${n}</tbody>`),`<table>
<thead>
`+t+`</thead>
`+n+`</table>
`}tablerow({text:e}){return`<tr>
${e}</tr>
`}tablecell(e){const t=this.parser.parseInline(e.tokens),s=e.header?"th":"td";return(e.align?`<${s} align="${e.align}">`:`<${s}>`)+t+`</${s}>
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Bs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=ju(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Bs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=ju(e);if(a===null)return Bs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Bs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Bs(e.text)}},jc=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},dn=class No{constructor(t){lt(this,"options");lt(this,"renderer");lt(this,"textRenderer");this.options=t||ra,this.options.renderer=this.options.renderer||new Gl,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new jc}static parse(t,s){return new No(s).parse(t)}static parseInline(t,s){return new No(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},Yr,vl=(Yr=class{constructor(e){lt(this,"options");lt(this,"block");this.options=e||ra}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?cn.lex:cn.lexInline}provideParser(){return this.block?dn.parse:dn.parseInline}},lt(Yr,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),Yr),rw=class{constructor(...e){lt(this,"defaults",Mc());lt(this,"options",this.setOptions);lt(this,"parse",this.parseMarkdown(!0));lt(this,"parseInline",this.parseMarkdown(!1));lt(this,"Parser",dn);lt(this,"Renderer",Gl);lt(this,"TextRenderer",jc);lt(this,"Lexer",cn);lt(this,"Tokenizer",Kl);lt(this,"Hooks",vl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new Gl(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new Kl(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new vl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];vl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return cn.lex(e,t??this.defaults)}parser(e,t){return dn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?cn.lex:cn.lexInline,o=i.hooks?i.hooks.provideParser():e?dn.parse:dn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Bs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},ta=new rw;function et(e,t){return ta.parse(e,t)}et.options=et.setOptions=function(e){return ta.setOptions(e),et.defaults=ta.defaults,pg(et.defaults),et};et.getDefaults=Mc;et.defaults=ra;et.use=function(...e){return ta.use(...e),et.defaults=ta.defaults,pg(et.defaults),et};et.walkTokens=function(e,t){return ta.walkTokens(e,t)};et.parseInline=ta.parseInline;et.Parser=dn;et.parser=dn.parse;et.Renderer=Gl;et.TextRenderer=jc;et.Lexer=cn;et.lexer=cn.lex;et.Tokenizer=Kl;et.Hooks=vl;et.parse=et;et.options;et.setOptions;et.use;et.walkTokens;et.parseInline;dn.parse;cn.lex;const ow={breaks:!0,gfm:!0};function Ku(e){if(!e)return"";try{if(typeof et<"u"&&et.parse){const t=et.parse(e,ow);return typeof Bu<"u"?Bu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function cw(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const dw={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function uw(e){return dw[e]||"wrench"}const pw=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function Gu(e){if(!e)return[];const t=e.match(pw);return t?[...new Set(t)]:[]}const fw={template:`
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
    </div>`,setup(){const e=h([]),t=h(""),s=h(!1),n=h(null),a=h(null),i=h(0),l=h("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=Y(()=>t.value.trim().length>0&&!s.value),u=h(We.state||"disconnected");let p=null,f=null;const v=Y(()=>{const $=u.value;return $==="connected"?"Connected":$==="reconnecting"?"Reconnecting…":$==="connecting"?"Connecting…":"REST fallback"}),g=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],T=Y(()=>{const $=Math.floor(i.value/4)%g.length,k=i.value;return k>3?`${g[$]} (${k}s)`:g[0]});function R(){It(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!a.value)return;const $=a.value;$.style.height="auto",$.style.height=Math.min($.scrollHeight,120)+"px"}function m($,k,x={}){const F={id:++o,role:$,content:k,timestamp:Date.now(),html:$==="bot"?Ku(k):"",tools_used:x.tools_used||[],is_error:x.is_error||!1,images:$==="bot"?Gu(k):[],files:x.files||[],_showTools:!1};return e.value.push(F),R(),$==="bot"&&It(()=>_()),F}function _(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(k=>{k.setAttribute("data-copy","true"),k.style.position="relative";const x=document.createElement("button");x.className="chat-code-copy",x.textContent="Copy",x.addEventListener("click",()=>{const F=k.querySelector("code"),de=F?F.textContent:k.textContent;navigator.clipboard.writeText(de).then(()=>{x.textContent="Copied!",setTimeout(()=>{x.textContent="Copy"},1500)}).catch(()=>{})}),k.appendChild(x)})}function w($){if($===0)return!0;const k=e.value[$-1],x=e.value[$],F=new Date(k.timestamp).toDateString(),de=new Date(x.timestamp).toDateString();return F!==de}function D($){const k=new Date($),x=new Date;if(k.toDateString()===x.toDateString())return"Today";const F=new Date(x);return F.setDate(F.getDate()-1),k.toDateString()===F.toDateString()?"Yesterday":k.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function O($){t.value=$,It(()=>W())}function E($){window.open($,"_blank","noopener")}function C($){$.target.style.display="none"}function I(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function B(){r&&(clearInterval(r),r=null),i.value=0}function M($){s.value&&(s.value=!1,B(),$.type==="chat_response"?m("bot",$.content,{tools_used:$.tools_used||[],is_error:$.is_error||!1,files:$.files||[]}):$.type==="chat_error"&&m("bot",$.error||"Unknown error",{is_error:!0}),It(()=>{var k;return(k=a.value)==null?void 0:k.focus()}))}async function L($){try{const k=await G.post("/api/chat",{content:$,channel_id:l.value});m("bot",k.response,{tools_used:k.tools_used||[],is_error:k.is_error||!1,files:k.files||[]})}catch(k){m("bot",k.message||"Failed to send message",{is_error:!0})}}async function W(){const $=t.value.trim();if(!$||s.value)return;m("user",$),t.value="",s.value=!0,I(),a.value&&(a.value.style.height="auto"),We.connected&&We.sendChat($,{channelId:l.value})||(await L($),s.value=!1,B()),It(()=>{var x;return(x=a.value)==null?void 0:x.focus()})}async function ee(){try{if(!l.value){const k=await G.get("/api/auth/session");l.value=k.channel_id||k.user_id||"web-user"}const $=await G.get("/api/sessions/"+encodeURIComponent(l.value));if($&&$.messages&&$.messages.length>0){for(const k of $.messages){const x=k.role==="user"?"user":"bot";let F=k.content||"";if(x==="user"){const pe=F.match(/^\[.*?\]:\s*/);pe&&(F=F.slice(pe[0].length))}if(!F.trim())continue;const de={id:++o,role:x,content:F,timestamp:k.timestamp?k.timestamp*1e3:Date.now(),html:x==="bot"?Ku(F):"",tools_used:[],is_error:!1,images:x==="bot"?Gu(F):[],files:[],_showTools:!1};e.value.push(de)}It(()=>{R(),_()})}}catch{}}return Je(()=>{We.subscribe("chat",M),u.value=We.state||"disconnected",p=We.onStateChange,f=($,k)=>{u.value=$,p&&p($,k)},We.onStateChange=f,ee(),It(()=>{var $;return($=a.value)==null?void 0:$.focus()})}),xt(()=>{We.unsubscribe("chat",M),We.onStateChange===f&&(We.onStateChange=p),B()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:v,typingText:T,suggestions:c,send:W,autoResize:y,formatTime:cw,formatDate:D,showDateSeparator:w,useSuggestion:O,openImage:E,onImageError:C,getToolIcon:uw}}},kr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=V_(),s=ag(),n=Y({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=Y(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=Y(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});ds(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},hw={setup(){const e=h([]),t=h([]),s=h({}),n=50;function a(p){var g,T,R;const f=p.payload||p,v=f.type||p.type;if(v==="tool_start"){const y={id:`${f.action}-${Date.now()}`,tool:f.action,actor:f.actor||"",channel:f.channel_id||"",iteration:((g=f.metadata)==null?void 0:g.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(y);return}if(v==="tool_end"){const y=e.value.findIndex(m=>m.tool===f.action&&m.status==="running");if(y>=0){const m=e.value[y];m.status=(T=f.metadata)!=null&&T.error?"error":"success",m.elapsed=((R=f.metadata)==null?void 0:R.elapsed_ms)||Date.now()-m.startTime,m.result=f.detail||"",m.fadingOut=!0,setTimeout(()=>{const _=e.value.indexOf(m);_>=0&&e.value.splice(_,1),t.value.unshift(m),t.value.length>n&&t.value.pop()},5e3)}return}if(v==="tool_stream"){const y=f.tool_name||"unknown";if(f.finished)delete s.value[y];else{const _=((s.value[y]||"")+(f.chunk||"")).split(`
`);s.value[y]=_.slice(-30).join(`
`)}return}}let i=null;function l(){const p=Date.now();e.value.forEach(f=>{f.status==="running"&&(f.elapsed=p-f.startTime)})}let r=!1;function o(){r||(r=!0,We.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,We.off("events",a),i&&(clearInterval(i),i=null))}Je(o),Es(o),As(c),xt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
          <div v-if="streamOutput[task.tool]"
               class="bg-black rounded p-2 mt-2 max-h-48 overflow-y-auto font-mono text-xs text-green-400 whitespace-pre-wrap">{{ streamOutput[task.tool] }}</div>
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
  `},wg=Symbol("agent-detail-cancelled"),gw=15e3;function mw(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((f,v)=>{o=f,c=v});function u(f,v){r||(r=!0,l!==null&&a(l),l=null,(f?o:c)(v))}let p;try{p=e(i==null?void 0:i.signal)}catch(f){u(!1,f)}return r||Promise.resolve(p).then(f=>u(!0,f),f=>u(!1,f)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const f=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${f}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,wg),i==null||i.abort()}}}function Sg({state:e,requestDetail:t,timeoutMs:s=gw,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:f,coalesce:v}){if(!p)return Promise.resolve();if(v&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const g={agentId:p,cancel:null,promise:null};l=g,f?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const T=mw(R=>t(p,{signal:R}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return g.cancel=T.cancel,g.promise=(async()=>{let R=null,y=null;try{R=await T.promise}catch(m){y=m}R!==wg&&(l!==g||e.detailId!==p||(l=null,!y&&(R===null||typeof R!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=R,e.detailError=null),e.detailLoading=!1))})(),g.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function vw({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const bw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(!0),i=h("all");let l=!1;const r=Y(()=>e.value.filter(x=>x.status==="running").length),o=Y(()=>e.value.filter(x=>x.status==="completed").length),c=Y(()=>e.value.filter(x=>["failed","timeout","killed"].includes(x.status)).length),d=Y(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=Y(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(x=>["failed","timeout","killed"].includes(x.status)):e.value.filter(x=>x.status===i.value));function p(x){const F=Number(x.max_iterations)||0;return F<=0?0:Math.min(100,Math.round(x.iteration_count/F*100))}function f(x){return(Number(x.max_iterations)||0)>0}function v(x,F){return x?x==="N/A"?"N/A":F==="current_inheritance"?`inherit (currently ${x})`:x:"unknown"}function g(x){return v(x.display_model,x.display_model_source||x.display_source)}function T(x){return v(x.display_reasoning_effort,x.display_reasoning_effort_source||x.display_source)}function R(x){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[x]||""}const y=h(null),m=h(null),_=h(!1),w=h(null),D=h(""),E=Sg({state:{get detail(){return y.value},set detail(x){y.value=x},get detailId(){return m.value},set detailId(x){m.value=x},get detailLoading(){return _.value},set detailLoading(x){_.value=x},get detailError(){return w.value},set detailError(x){w.value=x}},requestDetail:(x,{signal:F})=>G.get(`/api/agents/${encodeURIComponent(x)}`,{signal:F})});async function C(x){D.value="",await E.open(x.id)}function I(){E.close(),D.value=""}async function B(){await E.refresh()}async function M(x,F){try{await navigator.clipboard.writeText(F||""),D.value=x,setTimeout(()=>{D.value===x&&(D.value="")},1500)}catch{Te.error("Copy failed")}}async function L(x=!1){x=x===!0,x||(t.value=!0);try{const F=await G.get("/api/agents");e.value=Array.isArray(F)?F:[],s.value=null}catch(F){x||(s.value=F.message)}x||(t.value=!1)}async function W(x){const F=e.value.find(pe=>pe.id===x);if(await vs({title:"Kill agent",message:`Kill agent "${(F==null?void 0:F.label)||x}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=x;try{await G.del(`/api/agents/${encodeURIComponent(x)}`),Te.success("Agent killed"),await L()}catch(pe){Te.error(pe.message||"Failed to kill agent")}n.value=null}}const ee=vw({isEnabled:()=>a.value&&l,refreshList:()=>L(!0),hasOpenDetail:()=>!!m.value,refreshDetail:B});function $(){ee.start()}function k(){ee.stop()}return ds(a,()=>ee.sync()),Je(()=>{l=!0,L(),$()}),Es(()=>{l=!0,L(!0),$()}),As(()=>{l=!1,k()}),xt(()=>{l=!1,k(),E.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:la,formatDuration:Va,progressPercent:p,hasProgress:f,displayModelText:g,displayEffortText:T,displaySourceLabel:R,detail:y,detailId:m,detailLoading:_,detailError:w,copied:D,openDetail:C,closeDetail:I,copyText:M,fetchAgents:L,killAgent:W,startAutoRefresh:$,stopAutoRefresh:k}}},yw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=h(!1),l=h(null),r=h(null),o=h(null),c=h(null),d=h(null),u=h(!1),p=h(null),f=h("");let v=!1;const T=Sg({state:{get detail(){return c.value},set detail(k){c.value=k},get detailId(){return d.value},set detailId(k){d.value=k},get detailLoading(){return u.value},set detailLoading(k){u.value=k},get detailError(){return p.value},set detailError(k){p.value=k}},detailLabel:"Loop detail",requestDetail:(k,{signal:x})=>G.get(`/api/loops/${encodeURIComponent(k)}?limit=100`,{signal:x})});async function R(k){f.value="",await T.open(k.id)}function y(){T.close(),f.value=""}async function m(k,x){try{await navigator.clipboard.writeText(x||""),f.value=k,setTimeout(()=>{f.value===k&&(f.value="")},1500)}catch{Te.error("Copy failed")}}const _=Y(()=>e.value.reduce((k,x)=>k+(x.iteration_count||0),0)),w=Y(()=>e.value.filter(k=>k.status==="running").length);function D(k){return k==="running"?"loop-status-running":k==="error"?"loop-status-error":"loop-status-stopped"}function O(k){return k==="running"?"badge-success":k==="error"?"badge-danger":k==="completed"?"badge-info":"badge-warning"}function E(k){return k==="act"?"badge-warning":k==="silent"?"badge-info":"badge-success"}async function C(k=!1){k=k===!0,k||(t.value=!0);try{const x=await G.get("/api/loops");e.value=Array.isArray(x)?x:[],s.value=null}catch(x){k||(s.value=x.message)}k||(t.value=!1)}async function I(){l.value=null;const k=a.value;if(!k.goal.trim()){l.value="Goal is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}const x={goal:k.goal.trim(),channel_id:k.channel_id.trim(),interval_seconds:k.interval_seconds||60,mode:k.mode,max_iterations:k.max_iterations||50};k.stop_condition.trim()&&(x.stop_condition=k.stop_condition.trim()),i.value=!0;try{const F=await G.post("/api/loops",x);Te.success(`Loop started: ${F.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await C()}catch(F){l.value=F.message}i.value=!1}async function B(k){if(await vs({title:"Stop loop",message:`Stop loop ${k}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=k;try{await G.del(`/api/loops/${encodeURIComponent(k)}`),Te.success("Loop stopped"),await C()}catch(F){Te.error(F.message||"Failed to stop loop")}r.value=null}}async function M(k){o.value=k;try{await G.post(`/api/loops/${encodeURIComponent(k)}/restart`),Te.success("Loop restarted"),await C()}catch(x){Te.error(x.message||"Failed to restart loop")}o.value=null}function L(k){v&&k.payload&&(k.payload.loop_id||k.payload.type==="loop")&&(C(!0),d.value&&T.refresh())}let W=null;function ee(){W!==null&&clearInterval(W),W=null}function $(){ee(),v&&(W=setInterval(()=>{C(!0),d.value&&T.refresh()},5e3))}return Je(()=>{v=!0,C(),We.subscribe("events",L),$()}),Es(()=>{v=!0,C(!0),$()}),As(()=>{v=!1,ee()}),xt(()=>{v=!1,We.unsubscribe("events",L),ee(),T.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:f,totalIterations:_,runningCount:w,statusDotClass:D,statusBadge:O,modeBadge:E,formatAge:ig,formatDuration:Va,formatTs:la,formatTokens:og,openDetail:R,closeDetail:y,copyText:m,fetchLoops:C,doCreate:I,doStop:B,doRestart:M}}},xw={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!0);let a=null;const i=h(null),l=Y(()=>e.value.filter(y=>y.status==="running").length),r=Y(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await G.get("/api/processes"),s.value=null}catch(m){y||(s.value=m.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}ds(n,y=>{y?u():p()});async function f(y){if(await vs({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await G.del(`/api/processes/${y}`),Te.success(`Process ${y} killed`),await d()}catch(_){Te.error(_.message||"Failed to kill process")}i.value=null}}function v(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let g=!1;function T(){g||(g=!0,d(),We.subscribe("events",v),u())}function R(){g&&(g=!1,We.unsubscribe("events",v),p())}return Je(T),Es(T),As(R),xt(R),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Va,fetchProcesses:d,doKill:f}}},_w={template:`
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

    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(!1),a=h({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=h(!1),l=h(null),r=h(null),o=h(!1),c=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],d=h(null),u=h(null),p=h(null),f=h(null),v=h(null),g=h([]),T=h(!1),R=Y(()=>e.value.filter(k=>k.cron&&!k.one_time).length),y=Y(()=>e.value.filter(k=>k.one_time).length),m=Y(()=>e.value.filter(k=>k.trigger).length),_=Y(()=>e.value.filter(k=>k.paused).length),w=Y(()=>e.value.filter(k=>k.consecutive_failures>0).length);function D(k){if(!k)return"-";const x=Date.now(),de=(new Date(k).getTime()-x)/1e3;if(de<0)return"overdue";if(de<60)return"in < 1 min";if(de<3600)return`in ${Math.floor(de/60)} min`;if(de<86400){const ie=Math.floor(de/3600),he=Math.floor(de%3600/60);return he>0?`in ${ie}h ${he}m`:`in ${ie}h`}const pe=Math.floor(de/86400);return`in ${pe} day${pe!==1?"s":""}`}function O(k){return k==null?"-":k<1e3?`${k}ms`:k<6e4?`${(k/1e3).toFixed(1)}s`:Va(k/1e3)}function E(){r.value=null}async function C(){const k=a.value.cron.trim();if(k){o.value=!0;try{r.value=await G.post("/api/schedules/validate-cron",{expression:k})}catch(x){r.value={valid:!1,error:x.message}}o.value=!1}}async function I(){t.value=!0,s.value=null;try{e.value=await G.get("/api/schedules")}catch(k){s.value=k.message}t.value=!1}async function B(k){if(v.value===k){v.value=null,g.value=[];return}v.value=k,T.value=!0,g.value=[];try{g.value=await G.get(`/api/schedules/${encodeURIComponent(k)}/history?limit=10`)}catch{g.value=[]}T.value=!1}async function M(){l.value=null;const k=a.value;if(!k.description.trim()){l.value="Description is required";return}if(!k.channel_id.trim()){l.value="Channel ID is required";return}if(!k.cron.trim()&&!k.run_at.trim()){l.value="Cron expression or run_at time is required";return}const x={description:k.description.trim(),action:k.action,channel_id:k.channel_id.trim()};if(k.cron.trim()&&(x.cron=k.cron.trim()),k.run_at.trim()&&(x.run_at=k.run_at.trim()),k.action==="reminder"&&k.message.trim()&&(x.message=k.message.trim()),k.action==="check"&&(k.tool_name.trim()&&(x.tool_name=k.tool_name.trim()),k.tool_input_str.trim()))try{x.tool_input=JSON.parse(k.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await G.post("/api/schedules",x),Te.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},r.value=null,n.value=!1,await I()}catch(F){l.value=F.message}i.value=!1}async function L(k){d.value=k;try{const x=await G.post(`/api/schedules/${encodeURIComponent(k)}/run`);if(x.status==="failure")Te.error(`Execution failed: ${x.error||"unknown error"}`);else{const F=x.warning?`Executed (${x.warning})`:"Executed successfully";Te.success(F)}await I()}catch(x){Te.error(x.message||"Failed to trigger")}d.value=null}async function W(k){p.value=k.id;const x=!k.paused;try{await G.put(`/api/schedules/${encodeURIComponent(k.id)}`,{paused:x}),Te.success(x?"Schedule paused":"Schedule resumed"),await I()}catch(F){Te.error(F.message||"Failed to update schedule")}p.value=null}async function ee(k){f.value=k;try{await G.post(`/api/schedules/${encodeURIComponent(k)}/reset-failures`),Te.success("Failure counters reset"),await I()}catch(x){Te.error(x.message||"Failed to reset")}f.value=null}async function $(k){const x=e.value.find(de=>de.id===k);if(await vs({title:"Delete schedule",message:`Delete "${(x==null?void 0:x.description)||k}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){u.value=k;try{await G.del(`/api/schedules/${encodeURIComponent(k)}`),Te.success("Schedule deleted"),await I()}catch(de){Te.error(de.message||"Failed to delete schedule")}u.value=null}}return Je(()=>{I()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,cronResult:r,validatingCron:o,cronPresets:c,runningId:d,deletingId:u,togglingId:p,resettingId:f,expandedId:v,history:g,historyLoading:T,cronCount:R,oneTimeCount:y,webhookCount:m,pausedCount:_,failingCount:w,formatTs:la,formatAge:ig,formatFuture:D,formatMs:O,formatDuration:Va,onCronInput:E,validateCron:C,toggleExpand:B,fetchSchedules:I,doCreate:M,doRunNow:L,doTogglePause:W,doResetFailures:ee,doDelete:$}}},kw={components:{TabbedPage:kr},setup(){return{tabs:[{id:"live",label:"Live",component:hw},{id:"agents",label:"Agents",component:bw},{id:"loops",label:"Loops",component:yw},{id:"processes",label:"Processes",component:xw},{id:"schedules",label:"Schedules",component:_w}]}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ww={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await G.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Je(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:la,formatDetail:i,truncateBlock:lg,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Wu=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],Sw=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],Tw={template:`
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
                  <div v-if="threads.length === 0 && detail.messages && detail.messages.length === 0"
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
                  <div v-if="detail.messages && detail.messages.length === 0" class="text-gray-500 text-sm">No messages in this session</div>
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(null),a=h(null),i=h(!1),l=h(null),r=h(!1),o=h(new Set),c=h(!1),d=h("all"),u=h(""),p=h("last_active"),f=h(!1),v=Wu,g=Sw,T=h([]),R=h(!1),y=h(""),m=h("flat"),_=h(new Set),w=h(""),D=h(""),O=h(""),E=h(null),C=h(!1);function I(){try{const V=localStorage.getItem("odin-session-presets");V&&(T.value=JSON.parse(V))}catch{}}function B(){try{localStorage.setItem("odin-session-presets",JSON.stringify(T.value))}catch{}}const M=Y(()=>u.value.trim()!==""||d.value!=="all"),L=Y(()=>{let V=[...e.value];const me=Wu.find(Ne=>Ne.id===d.value),Pe=me?me.filters:{};if(Pe.source&&(V=V.filter(Ne=>Ne.source===Pe.source)),Pe.minMessages&&(V=V.filter(Ne=>Ne.message_count>=Pe.minMessages)),Pe.hasCompaction&&(V=V.filter(Ne=>Ne.has_summary)),Pe.maxAge!=null){const Ne=Date.now()/1e3;V=V.filter(rt=>rt.last_active&&Ne-rt.last_active<=Pe.maxAge)}if(u.value.trim()){const Ne=u.value.toLowerCase().trim();V=V.filter(rt=>(rt.channel_id||"").toLowerCase().includes(Ne)||(rt.last_user_id||"").toLowerCase().includes(Ne)||(rt.source||"").toLowerCase().includes(Ne))}const nt=p.value,qe=f.value?1:-1;return V.sort((Ne,rt)=>{const Gt=Ne[nt]||0,ts=rt[nt]||0;return(Gt-ts)*qe}),V}),W=Y(()=>{if(!a.value||!a.value.messages)return[];const V=a.value.messages;if(V.length===0)return[];const me=[];let Pe=[];for(const nt of V)nt.role==="user"&&Pe.length>0&&(me.push(Pe),Pe=[]),Pe.push(nt);return Pe.length>0&&me.push(Pe),me}),ee=Y(()=>L.value.length>0&&o.value.size===L.value.length);function $(V){const me=V.find(Pe=>Pe.role==="user");if(me&&me.content){const Pe=me.content.slice(0,120);return Pe.length<me.content.length?Pe+"...":Pe}return"(no user message)"}function k(V){const me=new Set(_.value);me.has(V)?me.delete(V):me.add(V),_.value=me}function x(V){d.value=V}function F(V){d.value=V.id,V.filters.searchQuery!=null&&(u.value=V.filters.searchQuery),V.filters.sortBy&&(p.value=V.filters.sortBy)}function de(){if(!y.value.trim())return;const V={id:"custom-"+Date.now(),name:y.value.trim(),filters:{searchQuery:u.value,sortBy:p.value}};T.value=[...T.value,V],B(),R.value=!1,y.value=""}function pe(V){T.value=T.value.filter(me=>me.id!==V),B(),d.value===V&&(d.value="all")}function ie(){d.value="all",u.value="",p.value="last_active",f.value=!1}function he(V){if(!V)return"—";const me=Date.now()/1e3-V;if(me<60)return"just now";if(me<3600){const nt=Math.floor(me/60);return`${nt} minute${nt!==1?"s":""} ago`}if(me<86400){const nt=Math.floor(me/3600);return`${nt} hour${nt!==1?"s":""} ago`}const Pe=Math.floor(me/86400);return`${Pe} day${Pe!==1?"s":""} ago`}function Q(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function fe(V){if(!V)return"";try{return new Date(V*1e3).toLocaleString()}catch{return""}}function Me(V){return V==="user"?"bg-gray-900/50 border border-gray-800":V==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function j(V){return V==="user"?"sess-msg-user":V==="assistant"?"sess-msg-assistant":"sess-msg-system"}function ue(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":"badge-warning"}function re(V){return V==="user"?"sess-dot-user":V==="assistant"?"sess-dot-assistant":"sess-dot-system"}function _e(V){return V==="user"?"text-cyan-400":V==="assistant"?"text-indigo-400":"text-gray-500"}function ve(V){return V?V.length>2e3?V.slice(0,2e3)+`
... (truncated)`:V:""}async function Be(){const V=w.value.trim();if(V){C.value=!0;try{let me=`/api/sessions/search?q=${encodeURIComponent(V)}&limit=50`;D.value.trim()&&(me+=`&channel_id=${encodeURIComponent(D.value.trim())}`),O.value.trim()&&(me+=`&user_id=${encodeURIComponent(O.value.trim())}`);const Pe=await G.get(me);E.value=Pe.results||[]}catch{E.value=[]}C.value=!1}}function b(){w.value="",D.value="",O.value="",E.value=null}function A(V){return V?V.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function P(V){return V==="user"?"fts-result-user":V==="assistant"?"fts-result-assistant":V==="summary"?"fts-result-summary":V==="fts"?"fts-result-fts":V==="channel"?"fts-result-channel":"fts-result-default"}function J(V){return V==="user"?"badge-info":V==="assistant"?"badge-success":V==="summary"?"badge-warning":V==="fts"?"badge-success":"badge-info"}async function q(){t.value=!0,s.value=null;try{e.value=await G.get("/api/sessions")}catch(V){s.value=V.message}t.value=!1}function Z(){s.value=null,q()}async function oe(V){if(n.value===V){n.value=null,a.value=null,_.value=new Set;return}n.value=V,a.value=null,i.value=!0,_.value=new Set;try{a.value=await G.get(`/api/sessions/${encodeURIComponent(V)}`)}catch{a.value={messages:[],summary:""}}i.value=!1}function ae(V){const me=new Set(o.value);me.has(V)?me.delete(V):me.add(V),o.value=me}function se(){ee.value?o.value=new Set:o.value=new Set(L.value.map(V=>V.channel_id))}function X(V){l.value=V}async function xe(){if(l.value){r.value=!0;try{await G.del(`/api/sessions/${encodeURIComponent(l.value)}`),n.value===l.value&&(n.value=null,a.value=null),o.value.delete(l.value),await q()}catch(V){s.value=V.message||"Failed to clear session"}r.value=!1,l.value=null}}function ce(){c.value=!0}async function ge(){if(o.value.size!==0){r.value=!0;try{await G.post("/api/sessions/clear-bulk",{channel_ids:[...o.value]}),o.value.has(n.value)&&(n.value=null,a.value=null),o.value=new Set,await q()}catch(V){s.value=V.message||"Failed to clear sessions"}r.value=!1,c.value=!1}}function ke(V,me){const Pe=G._token;let nt=`/api/sessions/${encodeURIComponent(V)}/export?format=${me}`;Pe&&(nt+=`&token=${encodeURIComponent(Pe)}`);const qe=document.createElement("a");qe.href=nt,qe.download=`session-${V}.${me==="text"?"txt":"json"}`,document.body.appendChild(qe),qe.click(),document.body.removeChild(qe)}let Se=null;function Re(V){V.payload&&V.payload.channel_id&&(clearTimeout(Se),Se=setTimeout(()=>{q(),n.value&&V.payload.channel_id===n.value&&G.get(`/api/sessions/${encodeURIComponent(n.value)}`).then(me=>{a.value=me}).catch(()=>{})},2e3))}let Ie=!1;function $e(){Ie||(Ie=!0,q(),We.subscribe("events",Re))}Je(()=>{I(),$e()}),Es(()=>{$e()});function Ve(){Ie&&(Ie=!1,We.unsubscribe("events",Re),clearTimeout(Se))}return As(Ve),xt(Ve),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:l,clearing:r,selected:o,allSelected:ee,bulkClearing:c,activePreset:d,searchQuery:u,sortBy:p,sortAsc:f,filterPresets:v,sortOptions:g,filteredSessions:L,hasActiveFilters:M,customPresets:T,showSavePreset:R,newPresetName:y,threadView:m,threads:W,collapsedThreads:_,ftsQuery:w,ftsChannelId:D,ftsUserId:O,ftsResults:E,ftsSearching:C,formatAge:he,formatTimestamp:Q,formatFullTimestamp:fe,messageClass:Me,threadMsgClass:j,roleBadge:ue,roleDotClass:re,roleLabelClass:_e,truncateContent:ve,threadSummary:$,fetchSessions:q,retry:Z,toggleSession:oe,toggleSelect:ae,toggleSelectAll:se,confirmClear:X,clearSession:xe,confirmBulkClear:ce,doBulkClear:ge,exportSession:ke,applyPreset:x,applyCustomPreset:F,saveCustomPreset:de,removeCustomPreset:pe,resetFilters:ie,toggleThread:k,runFtsSearch:Be,clearFtsSearch:b,highlightSnippet:A,ftsResultClass:P,ftsTypeBadge:J}}},Cw={props:["trace"],template:`
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
  `,setup(){return{formatTokens:og}}},Ew={components:{ContextAssemblyPanel:Cw},template:`
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
    </div>`,setup(){const e=h([]),t=h([]),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=h(""),o=h(0),c=h({}),d=h({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(O){if(!O)return"—";try{const E=new Date(O);return isNaN(E.getTime())?O:E.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return O}}function p(O){return!O&&O!==0?"—":O<1e3?O+"ms":(O/1e3).toFixed(1)+"s"}function f(O){return!O&&O!==0?"—":O>=1e3?(O/1e3).toFixed(1)+"k":String(O)}function v(O){if(!O)return"";if(typeof O=="string")return O;try{return JSON.stringify(O,null,2)}catch{return String(O)}}function g(O){a.value===O?a.value=null:(a.value=O,c.value={})}function T(O,E){const C=O+"-"+E;c.value={...c.value,[C]:!c.value[C]}}function R(O,E){return!!c.value[O+"-"+E]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,w()}async function m(){try{const O=await G.get("/api/trajectories");e.value=O.files||[],o.value=O.count||0}catch{}}let _=0;async function w(){const O=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const E=await G.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(O!==_)return;let C=E.entries||[];d.value.tool_name&&(C=C.filter(I=>(I.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(C=C.filter(I=>I.is_error)),d.value.channel_id&&(C=C.filter(I=>I.channel_id===d.value.channel_id)),d.value.user_id&&(C=C.filter(I=>I.user_id===d.value.user_id)),t.value=C}else{const E=new URLSearchParams;d.value.channel_id&&E.set("channel_id",d.value.channel_id),d.value.user_id&&E.set("user_id",d.value.user_id),d.value.tool_name&&E.set("tool_name",d.value.tool_name),d.value.errors_only&&E.set("errors_only","true"),E.set("limit",String(d.value.limit));const C=E.toString(),I=await G.get(`/api/trajectories/search/query?${C}`);if(O!==_)return;t.value=I.results||[]}}catch(E){if(O!==_)return;n.value=E.message}O===_&&(s.value=!1)}async function D(){if(!l.value.trim())return;const O=++_;s.value=!0,n.value=null,c.value={};try{const E=await G.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(O!==_)return;i.value=E.entry||null,i.value||(n.value="No trace found for this message ID")}catch(E){if(O!==_)return;E.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=E.message}O===_&&(s.value=!1)}return Je(async()=>{await m(),await w()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:f,formatJSON:v,truncateBlock:lg,toggleExpand:g,toggleIteration:T,isIterationExpanded:R,clearFilters:y,fetchFiles:m,fetchTraces:w,lookupMessage:D}}},Aw={template:`
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
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
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
  `,setup(){const e=h(!0),t=h(null),s=h({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),n=h({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),a=h("user");let i=null;const l=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],r=Y(()=>[...s.value.recent||[]].reverse()),o=async()=>{try{const f=await G.get("/api/usage");s.value=f,n.value=f.totals||n.value,t.value=null}catch(f){t.value=f.message}finally{e.value=!1}},c=()=>{e.value=!0,o()};let d=!1;function u(){d||(d=!0,o(),i||(i=setInterval(o,15e3)))}function p(){d&&(d=!1,i&&(clearInterval(i),i=null))}return Je(u),Es(u),As(p),xt(p),{loading:e,error:t,data:s,totals:n,activeTab:a,tabs:l,recentReversed:r,fmtNum:rg,formatTime:Nc,retry:c}}},Rw={components:{TabbedPage:kr},setup(){return{tabs:[{id:"audit",label:"Audit",component:ww},{id:"sessions",label:"Sessions",component:Tw},{id:"traces",label:"Traces",component:Ew},{id:"usage",label:"Usage",component:Aw}]}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},Zr=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],Iw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h({}),i=h({}),l=h("cards"),r=h(null),o=Y(()=>e.value.filter(y=>y.is_core).length),c=Y(()=>e.value.filter(y=>!y.is_core).length),d=Y(()=>Object.values(a.value).reduce((y,m)=>y+m,0));function u(y){for(const m of Zr)if(m.id!=="other"&&m.match(y))return m.id;return"other"}const p=Y(()=>{let y=e.value;if(n.value){const m=n.value.toLowerCase();y=y.filter(_=>_.name.toLowerCase().includes(m)||(_.description||"").toLowerCase().includes(m))}return r.value&&(y=y.filter(m=>u(m.name)===r.value)),y}),f=Y(()=>{const y=new Set;for(const m of e.value)y.add(u(m.name));return Zr.filter(m=>y.has(m.id))}),v=Y(()=>{const y=p.value,m={};for(const w of y){const D=u(w.name);m[D]||(m[D]=[]),m[D].push(w)}const _=[];for(const w of Zr)m[w.id]&&m[w.id].length>0&&_.push({label:w.label,icon:w.icon,tools:m[w.id].sort((D,O)=>D.name.localeCompare(O.name))});return _});function g(y){i.value={...i.value,[y]:!i.value[y]}}async function T(){t.value=!0,s.value=null;try{const[y,m]=await Promise.all([G.get("/api/tools"),G.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=m||{};const _=Object.values(m||{}).filter(w=>w>0).sort((w,D)=>w-D)}catch(y){s.value=y.message}t.value=!1}function R(){T()}return Je(()=>{T()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:p,groupedTools:v,usedCategories:f,truncate:Dc,toggleExpand:g,refresh:R}}};function Ow(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function Lw(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const Nw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h({}),a=h({}),i=h(null),l=h(""),r=h(null),o=h(!1),c=h("create"),d=h(""),u=h(""),p=h(null),f=h(null),v=h(!1),g=h(null),T=h(null),R=h(!1),y=Y(()=>e.value.length),m=Y(()=>e.value.reduce((Q,fe)=>Q+(fe.execution_count||0),0)),_=Y(()=>e.value.reduce((Q,fe)=>Q+I(fe.code),0)),w=Y(()=>{if(!l.value)return e.value;const Q=l.value.toLowerCase();return e.value.filter(fe=>fe.name.toLowerCase().includes(Q)||(fe.description||"").toLowerCase().includes(Q))}),D=Y(()=>u.value?u.value.split(`
`).length:0),O=Y(()=>{const Q=Math.max(D.value,1);return Array.from({length:Q},(fe,Me)=>Me+1).join(`
`)}),E=Y(()=>{const Q=u.value.trim();return Q?Q.includes("SKILL_DEFINITION")?Q.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function C(Q){return Ow(Q)}function I(Q){return Q?Q.split(`
`).length:0}function B(Q){return Lw(Q)}function M(Q){n.value={...n.value,[Q]:!n.value[Q]}}async function L(Q){try{await navigator.clipboard.writeText(Q);const fe=e.value.find(Me=>Me.code===Q);fe&&(r.value=fe.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function W(Q){if(Q.key==="Tab"){Q.preventDefault();const fe=Q.target,Me=fe.selectionStart,j=fe.selectionEnd;u.value=u.value.substring(0,Me)+"    "+u.value.substring(j),It(()=>{fe.selectionStart=fe.selectionEnd=Me+4})}}function ee(Q){const fe=Q.target.previousElementSibling;fe&&(fe.scrollTop=Q.target.scrollTop)}async function $(){t.value=!0,s.value=null;try{e.value=await G.get("/api/skills")}catch(Q){s.value=Q.message}t.value=!1}async function k(Q){i.value=Q,delete a.value[Q],a.value={...a.value};try{const fe=await G.post(`/api/skills/${encodeURIComponent(Q)}/test`);a.value={...a.value,[Q]:fe}}catch(fe){a.value={...a.value,[Q]:{result:fe.message,is_error:!0}}}i.value=null}function x(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,f.value=null}function F(Q){o.value=!0,c.value="edit",d.value=Q.name,u.value=Q.code||"",p.value=null,f.value=null}function de(){o.value=!1,p.value=null,f.value=null}async function pe(){p.value=null,f.value=null;const Q=d.value.trim(),fe=u.value.trim();if(!Q){p.value="Name is required";return}if(!fe){p.value="Code is required";return}v.value=!0;try{c.value==="create"?(await G.post("/api/skills",{name:Q,code:fe}),f.value="Skill created successfully"):(await G.put(`/api/skills/${encodeURIComponent(Q)}`,{code:fe}),f.value="Skill updated successfully"),await $(),setTimeout(()=>{o.value=!1},800)}catch(Me){p.value=Me.message}v.value=!1}function ie(Q){T.value=Q}async function he(){if(T.value){R.value=!0;try{await G.del(`/api/skills/${encodeURIComponent(T.value)}`),await $()}catch{}R.value=!1,T.value=null}}return Je(()=>{$()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:f,saving:v,editorRef:g,deleteTarget:T,deleting:R,enabledCount:y,totalExecutions:m,totalLines:_,displayedSkills:w,editLineCount:D,editorLineNums:O,editValidation:E,highlight:C,truncate:Dc,formatTs:la,countLines:I,getLineNumbers:B,toggleCode:M,copyCode:L,handleEditorKey:W,syncScroll:ee,fetchSkills:$,testSkill:k,showCreate:x,editSkill:F,cancelEdit:de,saveSkill:pe,confirmDelete:ie,doDelete:he}}};function Dw(e,t){if(!e||!t)return Cu(e);const s=Cu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const Mw={template:`
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
    </div>`,setup(){const e=h([]),t=h(!0),s=h(null),n=h(""),a=h(null),i=h(!1),l=h(""),r=h(null),o=h(!1),c=h(""),d=h(""),u=h(null),p=h(null),f=h(!1),v=h(null),g=h(null);let T=null;const R=h(null),y=h(!1),m=h({}),_=h({}),w=h(null),D=h(null),O=Y(()=>e.value.reduce((x,F)=>x+(F.chunks||0),0)),E=Y(()=>new Set(e.value.map(F=>F.uploader).filter(Boolean)).size);function C(x,F){const de=_.value[F];if(!de||de.length===0)return 0;const pe=Math.max(...de.map(ie=>ie.char_count||0));return pe===0?0:Math.round(x.char_count/pe*100)}async function I(){t.value=!0,s.value=null;try{const x=await G.get("/api/knowledge");e.value=Array.isArray(x)?x:[]}catch(x){s.value=x.message}t.value=!1}async function B(x){if(m.value[x]){m.value[x]=!1,D.value=null;return}if(m.value[x]=!0,!(_.value[x]||w.value===x)){w.value=x;try{const F=await G.get(`/api/knowledge/${encodeURIComponent(x)}/chunks`);_.value[x]=Array.isArray(F)?F:[]}catch(F){_.value[x]=[],Te.error(`Failed to load chunks: ${F.message}`)}w.value=null}}async function M(){const x=n.value.trim();if(x){i.value=!0,r.value=null,l.value=x;try{const F=await G.get(`/api/knowledge/search?q=${encodeURIComponent(x)}`);a.value=Array.isArray(F)?F:[]}catch(F){a.value=[],r.value=F.message||"Search failed"}i.value=!1}}function L(){a.value=null,n.value="",r.value=null}async function W(){u.value=null,p.value=null;const x=c.value.trim(),F=d.value.trim();if(!x){u.value="Source name is required";return}if(!F){u.value="Content is required";return}f.value=!0;try{const de=await G.post("/api/knowledge",{source:x,content:F});p.value=`Ingested ${de.chunks||0} chunks from "${x}"`,c.value="",d.value="",_.value={},await I(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(de){u.value=de.message}f.value=!1}async function ee(x){v.value=x,g.value=null,T&&(clearTimeout(T),T=null);try{const F=await G.post(`/api/knowledge/${encodeURIComponent(x)}/reingest`);g.value={source:x,error:!1,message:`Re-ingested ${F.chunks||0} chunks`},delete _.value[x],await I(),T=setTimeout(()=>{g.value=null,T=null},3e3)}catch(F){g.value={source:x,error:!0,message:F.message}}v.value=null}function $(x){R.value=x}async function k(){if(R.value){y.value=!0;try{await G.del(`/api/knowledge/${encodeURIComponent(R.value)}`),delete _.value[R.value],await I()}catch{}y.value=!1,R.value=null}}return Je(()=>{I()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:f,reingesting:v,reingestResult:g,deleteTarget:R,deleting:y,expanded:m,sourceChunks:_,loadingChunks:w,selectedChunk:D,totalChunks:O,uploaderCount:E,truncate:Dc,formatTs:la,highlightTerms:Dw,chunkBarWidth:C,fetchSources:I,toggleSource:B,doSearch:M,clearSearch:L,doIngest:W,doReingest:ee,confirmDelete:$,doDelete:k}}},Pw={template:`
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
    </div>`,setup(){const e=h([]),t=h({}),s=h(!0),n=h(null),a=h({}),i=h(null),l=h(""),r=h(!1),o=h({scope:"global",key:"",value:""}),c=h(!1),d=h(null),u=h(null),p=h(null),f=h(""),v=h(!1),g=h(null),T=h(null),R=h(new Set),y=h(null),m=h(!1),_=h(!1),w=Y(()=>e.value.reduce((ie,he)=>ie+he.count,0)),D=Y(()=>R.value.size);function O(ie){const he=t.value[ie];if(!he)return[];if(!l.value.trim())return he;const Q=l.value.trim().toLowerCase();return he.filter(fe=>fe.key.toLowerCase().includes(Q)||fe.value&&fe.value.toLowerCase().includes(Q))}function E(ie,he){return R.value.has(ie+"/"+he)}function C(ie,he){const Q=ie+"/"+he,fe=new Set(R.value);fe.has(Q)?fe.delete(Q):fe.add(Q),R.value=fe}function I(ie){const he=t.value[ie];return!he||he.length===0?!1:he.every(Q=>R.value.has(ie+"/"+Q.key))}function B(ie,he){const Q=t.value[ie];if(!Q)return;const fe=new Set(R.value);for(const Me of Q){const j=ie+"/"+Me.key;he?fe.add(j):fe.delete(j)}R.value=fe}async function M(){s.value=!0,n.value=null;try{const ie=await G.get("/api/memory");e.value=Object.entries(ie).map(([he,Q])=>({name:he,keys:Q.keys||[],count:Q.count||0}))}catch(ie){n.value=ie.message}s.value=!1}async function L(ie){if(a.value[ie]){a.value[ie]=!1;return}a.value[ie]=!0;const he=e.value.find(fe=>fe.name===ie);if(!he||t.value[ie]||i.value===ie)return;i.value=ie;const Q=await Promise.all(he.keys.map(async fe=>{try{const Me=await G.get(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(fe)}`);return{key:fe,value:Me.value||""}}catch{return{key:fe,value:"(error loading)"}}}));t.value[ie]=Q,i.value=null}function W(ie,he,Q){p.value=ie+"/"+he,f.value=Q}async function ee(ie,he){v.value=!0,g.value=null;try{await G.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`,{value:f.value});const Q=t.value[ie];if(Q){const fe=Q.find(Me=>Me.key===he);fe&&(fe.value=f.value)}p.value=null}catch(Q){g.value=`Failed to save: ${Q.message||"unknown error"}`}v.value=!1}async function $(ie,he){try{await navigator.clipboard.writeText(he.value),T.value=ie+"/"+he.key,setTimeout(()=>{T.value=null},1500)}catch{}}async function k(){d.value=null,u.value=null;const ie=o.value.scope.trim(),he=o.value.key.trim(),Q=o.value.value.trim();if(!ie){d.value="Scope is required";return}if(!he){d.value="Key is required";return}if(!Q){d.value="Value is required";return}c.value=!0;try{await G.put(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`,{value:Q}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await M(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(fe){d.value=fe.message}c.value=!1}function x(ie,he){y.value={scope:ie,key:he}}async function F(){if(!y.value)return;m.value=!0,g.value=null;const{scope:ie,key:he}=y.value;try{await G.del(`/api/memory/${encodeURIComponent(ie)}/${encodeURIComponent(he)}`);const Q=t.value[ie];Q&&(t.value[ie]=Q.filter(j=>j.key!==he));const fe=e.value.find(j=>j.name===ie);fe&&(fe.count--,fe.keys=fe.keys.filter(j=>j!==he));const Me=new Set(R.value);Me.delete(ie+"/"+he),R.value=Me}catch(Q){g.value=`Failed to delete: ${Q.message||"unknown error"}`}m.value=!1,y.value=null}function de(){_.value=!0}async function pe(){m.value=!0,g.value=null;const ie=[];for(const he of R.value){const Q=he.indexOf("/");ie.push({scope:he.slice(0,Q),key:he.slice(Q+1)})}try{await G.post("/api/memory/bulk-delete",{entries:ie}),R.value=new Set,t.value={},await M()}catch(he){g.value=`Bulk delete failed: ${he.message||"unknown error"}`}m.value=!1,_.value=!1}return Je(()=>{M()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:f,saving:v,actionError:g,copied:T,selected:R,selectedCount:D,totalEntries:w,deleteTarget:y,deleting:m,showBulkDelete:_,fetchMemory:M,toggleScope:L,startEdit:W,doEdit:ee,copyValue:$,doAdd:k,confirmDelete:x,doDelete:F,confirmBulkDelete:de,doBulkDelete:pe,isSelected:E,toggleSelect:C,isScopeAllSelected:I,toggleSelectAll:B,filteredEntries:O}}},Fw={template:`
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
  `,setup(){const e=h([]),t=h(null),s=h(!0),n=h(null),a=h(null),i=h(null),l=h(""),r=Y(()=>[...new Set(e.value.map(T=>T.category))].sort()),o=Y(()=>{const g={};return e.value.forEach(T=>{g[T.category]=(g[T.category]||0)+1}),g}),c=Y(()=>a.value?e.value.filter(g=>g.category===a.value):e.value);function d(g){return g==="correction"?"badge-warning":g==="operational"?"badge-info":g==="preference"?"badge-success":"badge-info"}function u(g){i.value=g.key,l.value=g.content}async function p(g){try{await G.put("/api/learned/"+encodeURIComponent(g),{content:l.value}),i.value=null,Te.success("Entry updated"),await v()}catch(T){Te.error(T.message||"Failed to save entry")}}async function f(g){if(await vs({title:"Delete learned entry",message:`Delete "${g}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/learned/"+encodeURIComponent(g)),Te.success("Entry deleted"),await v()}catch(R){Te.error(R.message||"Failed to delete entry")}}async function v(){s.value=!0,n.value=null;try{const g=await G.get("/api/learned");e.value=g.entries||[],t.value={last_reflection:g.last_reflection,count:g.count}}catch(g){n.value=g.message}s.value=!1}return Je(v),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:la,startEdit:u,saveEdit:p,deleteEntry:f,fetchEntries:v}}},$w={components:{TabbedPage:kr},setup(){return{tabs:[{id:"tools",label:"Tools",component:Iw},{id:"skills",label:"Skills",component:Nw},{id:"knowledge",label:"Knowledge",component:Mw},{id:"memory",label:"Memory",component:Pw},{id:"learned",label:"Learned",component:Fw}]}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},Uw={setup(){const e=h("odin"),t=h(""),s=h(""),n=h(""),a=h({}),i=h([]),l=h([]),r=h(!1),o=h(!1),c=h(null),d=h(!0),u=h(""),p=h(!1),f=h(!1),v=Y(()=>e.value==="custom"),g=Y(()=>[...i.value,...l.value]),T=Y(()=>l.value.includes(e.value)),R=Y(()=>{var E;return v.value?t.value||"Odin":((E=a.value[e.value])==null?void 0:E.name)||e.value}),y=Y(()=>{var E;return v.value?s.value||"(empty — will use Odin default)":((E=a.value[e.value])==null?void 0:E.identity)||""}),m=Y(()=>{var E;return v.value?n.value||"(empty — will use Odin default)":((E=a.value[e.value])==null?void 0:E.voice)||""});async function _(){d.value=!0;try{const E=await G.get("/api/personality");e.value=E.preset||"odin",t.value=E.custom_name||"",s.value=E.custom_identity||"",n.value=E.custom_voice||"",a.value=E.presets||{},i.value=E.builtin_presets||[],l.value=E.user_presets||[]}catch(E){c.value=E.message}finally{d.value=!1}}async function w(){r.value=!0,c.value=null,o.value=!1;try{await G.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(E){c.value=E.message}finally{r.value=!1}}async function D(){const E=u.value.trim();if(E){f.value=!0,c.value=null;try{await G.post("/api/personality/presets",{name:E,display_name:R.value,identity:y.value,voice:m.value}),p.value=!1,u.value="",await _(),e.value=E.toLowerCase().replace(/ /g,"_")}catch(C){c.value=C.message}finally{f.value=!1}}}async function O(){if(await vs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await G.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(C){c.value=C.message}}}return Je(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:g,isCustom:v,isUserPreset:T,previewName:R,previewIdentity:y,previewVoice:m,saving:r,saved:o,error:c,loading:d,save:w,showSavePreset:p,newPresetName:u,savingPreset:f,saveAsPreset:D,deletePreset:O,builtinPresets:i,userPresets:l}},template:`
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
  `},Bw={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Hw={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Vw={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},jw={template:`
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
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
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
    </div>`,setup(){const e=h({}),t=h(!0),s=h(null),n=h(!1),a=Y(()=>e.value.components||[]),i=Y(()=>Vw[e.value.overall]||"text-gray-400"),l=Y(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),r=Y(()=>{const w=e.value.overall;return w==="healthy"?"All Systems Healthy":w==="degraded"?"Some Systems Degraded":w==="unhealthy"?"System Issues Detected":"Unknown"});function o(w){return Bw[w]||"text-gray-400"}function c(w){return Hw[w]||"info"}function d(w){return w==="ok"?"badge-success":w==="degraded"?"badge-warning":w==="down"?"badge-danger":"badge-info"}function u(w){return w==="closed"?"text-green-400":w==="half_open"?"text-yellow-400":w==="open"?"text-red-400":"text-gray-400"}function p(w){return w.replace(/_/g," ").replace(/\b\w/g,D=>D.toUpperCase())}function f(w){if(!w)return"—";try{return new Date(w).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return w}}function v(w){return w>=1e6?(w/1e6).toFixed(1)+"M":w>=1e3?(w/1e3).toFixed(1)+"K":String(w)}async function g(){n.value=!0;try{e.value=await G.get("/api/health/components"),s.value=null}catch(w){s.value=w.message}finally{t.value=!1,n.value=!1}}function T(){t.value=!0,s.value=null,g()}let R=null,y=!1;function m(){y||(y=!0,g(),R||(R=setInterval(g,3e4)))}function _(){y&&(y=!1,R&&(clearInterval(R),R=null))}return Je(m),Es(m),As(_),xt(_),{data:e,loading:t,error:s,refreshing:n,components:a,overallColor:i,overallIcon:l,overallLabel:r,statusColor:o,statusIcon:c,badgeClass:d,circuitColor:u,formatName:p,formatTime:f,formatNumber:v,fetchHealth:g,retry:T}}},zw={template:`
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
      <div v-else-if="error" class="hm-card border-red-900 error-state" role="alert">
        <span class="error-icon" aria-hidden="true"><odin-icon name="warning" :size="21" /></span>
        <p class="text-red-400">{{ error }}</p>
        <button @click="retry" class="btn btn-ghost text-xs">Retry</button>
      </div>

      <div v-else>
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
  `,setup(){const e=h(!0),t=h(null),s=h(!1),n=h("sessions"),a=h(null);let i=null;const l=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],r=Y(()=>{if(!a.value||!a.value.collected_at)return"";try{return new Date(a.value.collected_at).toLocaleTimeString()}catch{return""}}),o=Y(()=>{if(!a.value)return[];const g=a.value,T=g.storage_total_bytes||1;return[{label:"Session Persistence",mb:g.sessions.persist_dir.total_mb,bytes:g.sessions.persist_dir.total_bytes,files:g.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(g.sessions.persist_dir.total_bytes/T*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:g.knowledge.db_file.total_mb,bytes:g.knowledge.db_file.total_bytes,files:g.knowledge.db_file.file_count,pct:Math.min(100,Math.round(g.knowledge.db_file.total_bytes/T*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:g.trajectories.message_dir.total_mb,bytes:g.trajectories.message_dir.total_bytes,files:g.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(g.trajectories.message_dir.total_bytes/T*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:g.trajectories.agent_dir.total_mb,bytes:g.trajectories.agent_dir.total_bytes,files:g.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(g.trajectories.agent_dir.total_bytes/T*100)),color:"res-bar-amber"}]});async function c(){try{const g=await G.get("/api/resource-usage");a.value=g,t.value=null}catch(g){t.value=g.message||"Failed to load resource usage"}finally{e.value=!1,s.value=!1}}async function d(){s.value=!0,await c()}function u(){e.value=!0,t.value=null,c()}let p=!1;function f(){p||(p=!0,c(),i||(i=setInterval(c,3e4)))}function v(){p&&(p=!1,i&&(clearInterval(i),i=null))}return Je(f),Es(f),As(v),xt(v),{loading:e,error:t,refreshing:s,data:a,activeTab:n,tabs:l,collectedAt:r,storageItems:o,fmtNum:rg,refresh:d,retry:u}}},qw=["INFO","WARNING","ERROR"],Kw=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],Jr=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Gw=[50,100,200,500],Ww={template:`
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
    </div>`,setup(){const e=h("live"),t=h([]),s=h(!1),n=h(!0),a=h(""),i=h(""),l=h(!1),r=h(!1),o=h(We.state||"disconnected"),c=Y(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=h(null),u=h(!1),p=h(null),f=2e3,v=qw,g=Kw,T=Jr,R=h("all"),y=h(""),m=h([]),_=h(!1),w=h(""),D=h([]);function O(){try{const U=localStorage.getItem("odin-log-presets");U&&(m.value=JSON.parse(U))}catch{}}function E(){try{localStorage.setItem("odin-log-presets",JSON.stringify(m.value))}catch{}}const C=Y(()=>a.value!==""||i.value.trim()!==""||y.value!==""),I=Y(()=>{const U=Jr.find(ne=>ne.value===y.value);return U?U.label:""}),B=Y(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(U){return U.message}}),M=24,L=Y(()=>{if(t.value.length===0)return[];const U=[],ne=new Date,Oe=3600*1e3;for(let it=M-1;it>=0;it--){const ft=new Date(ne.getTime()-(it+1)*Oe),ss=new Date(ne.getTime()-it*Oe);U.push({start:ft,end:ss,label:k(ft,ss),shortLabel:ss.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const it of t.value){if(!it._time)continue;const ft=it._time.getTime();for(const ss of U)if(ft>=ss.start.getTime()&&ft<ss.end.getTime()){ss.total++,it.level==="ERROR"?ss.errors++:it.level==="WARNING"?ss.warnings++:ss.info++;break}}return U}),W=Y(()=>{let U=1;for(const ne of L.value)ne.total>U&&(U=ne.total);return U}),ee=Y(()=>L.value.length===0?"":"Last 24 hours"),$=Y(()=>Math.ceil(M/8));function k(U,ne){const Oe={hour:"2-digit",minute:"2-digit"};return U.toLocaleTimeString([],Oe)+" - "+ne.toLocaleTimeString([],Oe)}function x(U,ne){return!ne||!U?"0px":Math.max(2,U/ne*100)+"%"}function F(U){const ne=de.value.findIndex(Oe=>Oe._time&&Oe._time.getTime()>=U.start.getTime()&&Oe._time.getTime()<U.end.getTime());if(ne>=0&&d.value){const Oe=d.value.querySelectorAll(".log-line");Oe[ne]&&(Oe[ne].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const de=Y(()=>{let U=t.value;if(a.value&&(U=U.filter(ne=>(ne.level||"INFO")===a.value)),y.value){const ne=Jr.find(Oe=>Oe.value===y.value);if(ne&&ne.seconds){const Oe=new Date(Date.now()-ne.seconds*1e3);U=U.filter(it=>it._time&&it._time>=Oe)}}if(i.value&&!B.value)if(l.value)try{const ne=new RegExp(i.value,"i");U=U.filter(Oe=>{const it=Oe.text||Oe.raw||"",ft=Oe.tool||"";return ne.test(it)||ne.test(ft)})}catch{}else{const ne=i.value.toLowerCase();U=U.filter(Oe=>{const it=(Oe.text||Oe.raw||"").toLowerCase(),ft=(Oe.tool||"").toLowerCase();return it.includes(ne)||ft.includes(ne)})}return U});function pe(U){if(U.type==="log"&&U.line)try{const ne=typeof U.line=="string"?JSON.parse(U.line):U.line,Oe=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(U.line),tool:"",raw:String(U.line)}}if(U.payload){const ne=U.payload,Oe=ne.timestamp?new Date(ne.timestamp):new Date;return{ts:Oe.toLocaleTimeString(),_time:Oe,level:ne.error?"ERROR":"INFO",text:ne.tool_name?`[${ne.tool_name}] ${ne.result_summary||""}`.trim():ne.message||JSON.stringify(ne),tool:ne.tool_name||"",raw:null}}return typeof U=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:U,tool:"",raw:U}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(U),tool:"",raw:null}}function ie(U){const ne=pe(U);if(s.value){D.value.push(ne);return}he(ne)}function he(U){t.value.push(U),t.value.length>f&&(t.value=t.value.slice(-f)),n.value&&It(()=>Q())}function Q(U=!1){const ne=d.value;ne&&ne.scrollTo({top:ne.scrollHeight,behavior:U?"smooth":"instant"})}function fe(){n.value=!0,u.value=!1,It(()=>Q(!0))}const Me=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function j(){const U=d.value;if(!U)return;const ne=U.scrollHeight-U.scrollTop-U.clientHeight<40;u.value=!n.value&&!ne&&t.value.length>0,ve.value&&ue()}function ue(){const U=d.value;!U||!n.value||U.scrollHeight-U.scrollTop-U.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function re(){n.value&&requestAnimationFrame(ue)}function _e(U){Me.has(U.key)&&re()}const ve=h(!1);function Be(){n.value&&(ve.value=!0,requestAnimationFrame(ue))}function b(){ve.value&&(ve.value=!1,ue())}function A(){n.value&&(u.value=!1,It(()=>Q()))}function P(){if(s.value=!s.value,!s.value&&D.value.length>0){for(const U of D.value)he(U);D.value=[]}}function J(){t.value=[],D.value=[],u.value=!1}function q(){let U;e.value==="search"?U=rt.value.map(ft=>{const ss=ft.error?"ERROR":"INFO",fs=ft.tool_name?`[${ft.tool_name}] `:"";return`${ft.timestamp||""} ${ss} ${fs}${ft.result_summary||ft.message||""}`}).join(`
`):U=de.value.map(ft=>`${ft.ts} ${ft.level} ${ft.text}`).join(`
`);const ne=new Blob([U],{type:"text/plain"}),Oe=URL.createObjectURL(ne),it=document.createElement("a");it.href=Oe,it.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,it.click(),URL.revokeObjectURL(Oe)}function Z(U,ne){const Oe=`${U.ts} ${U.level} ${U.text||U.raw||""}`;navigator.clipboard.writeText(Oe).then(()=>{p.value=ne,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function oe(U){a.value=a.value===U?"":U,R.value="all"}function ae(U){return U.level==="ERROR"?"log-line-error":U.level==="WARNING"?"log-line-warning":"text-gray-300"}function se(U){return U==="ERROR"?"text-red-500 font-semibold":U==="WARNING"?"text-yellow-500":"text-blue-500"}function X(U){return U==="ERROR"?"log-chip-error":U==="WARNING"?"log-chip-warning":"log-chip-info"}function xe(U){R.value=U.id;const ne=U.filters;a.value=ne.level||"",y.value=ne.timeRange||"",i.value=ne.text||"",ne.levels&&(a.value=ne.levels[0]||""),ne.hasToolName&&(i.value="")}function ce(U){R.value=U.id,a.value=U.filters.level||"",y.value=U.filters.timeRange||"",i.value=U.filters.text||""}function ge(){if(!w.value.trim())return;const U={id:"custom-"+Date.now(),name:w.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};m.value=[...m.value,U],E(),_.value=!1,w.value=""}function ke(U){m.value=m.value.filter(ne=>ne.id!==U),E(),R.value===U&&(R.value="all")}const Se=h("all"),Re=h(""),Ie=h(""),$e=h(""),Ve=h(""),V=h(""),me=h(100),Pe=Gw,nt=h(!1),qe=h(!1),Ne=h(""),rt=h([]),Gt=h(null),ts=h(null);function Gs(){e.value="search",Gt.value||Ds()}async function Ds(){try{Gt.value=await G.get("/api/logs/stats")}catch{}}function Ms(){const U=V.value;if(!U){$e.value="",Ve.value="";return}const Oe={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[U];if(Oe){const it=new Date(Date.now()-Oe*1e3);$e.value=us(it),Ve.value=""}}function us(U){const ne=Oe=>String(Oe).padStart(2,"0");return`${U.getFullYear()}-${ne(U.getMonth()+1)}-${ne(U.getDate())}T${ne(U.getHours())}:${ne(U.getMinutes())}`}function z(U){if(!U)return"";const ne=new Date(U);return isNaN(ne.getTime())?"":ne.toISOString()}async function Ee(){nt.value=!0,Ne.value="",qe.value=!0,ts.value=null;try{const U=new URLSearchParams;Se.value&&Se.value!=="all"&&U.set("level",Se.value),Re.value&&U.set("tool",Re.value),Ie.value&&U.set("q",Ie.value);const ne=z($e.value),Oe=z(Ve.value);ne&&U.set("start",ne),Oe&&U.set("end",Oe),U.set("limit",String(me.value));const it=await G.get(`/api/logs/search?${U.toString()}`);rt.value=it.entries||[]}catch(U){Ne.value=U.message||"Search failed",rt.value=[]}finally{nt.value=!1}}function ps(){Se.value="all",Re.value="",Ie.value="",$e.value="",Ve.value="",V.value="",me.value=100,rt.value=[],qe.value=!1,Ne.value="",ts.value=null}function Ws(U){ts.value=ts.value===U?null:U}function oa(U){if(!U.timestamp)return"";try{return new Date(U.timestamp).toLocaleString()}catch{return U.timestamp}}function _n(U){return U.type==="web_action"?`${U.status||""} (${U.execution_time_ms||0}ms)`:(U.result_summary||"").slice(0,200)}function Zs(U){return U.error?"log-line-error":"text-gray-300"}function N(U){try{return JSON.stringify(U,null,2)}catch{return String(U)}}let H=null,te=null,we=!1;function Ce(){we||(we=!0,We.subscribe("logs",ie),r.value=We.connected,o.value=We.state||"disconnected",H=We.onStateChange,te=(U,ne)=>{o.value=U,r.value=U==="connected",H&&H(U,ne)},We.onStateChange=te)}function Ct(){we&&(we=!1,We.unsubscribe("logs",ie),We.onStateChange===te&&(We.onStateChange=H),te=null,H=null)}return Je(()=>{O(),window.addEventListener("pointerup",b),window.addEventListener("pointercancel",b)}),Es(Ce),As(Ct),xt(()=>{Ct(),window.removeEventListener("pointerup",b),window.removeEventListener("pointercancel",b)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:de,pauseBuffer:D,showJumpBottom:u,copiedIndex:p,regexError:B,levels:v,logPresets:g,timeRanges:T,timeRange:y,activeLogPreset:R,customLogPresets:m,showSaveLogPreset:_,newLogPresetName:w,hasActiveLogFilters:C,timeRangeLabel:I,timelineBuckets:L,timelineMax:W,timelineSpanLabel:ee,timelineLabelSkip:$,togglePause:P,clearLogs:J,exportLogs:q,logLineClass:ae,levelClass:se,levelChipClass:X,toggleLevel:oe,copyLine:Z,jumpToBottom:fe,onScroll:j,onUserScrollIntent:re,onUserScrollKey:_e,onAutoScrollToggle:A,onPointerDown:Be,applyLogPreset:xe,applyCustomLogPreset:ce,saveLogCustomPreset:ge,removeLogCustomPreset:ke,segmentHeight:x,jumpToTimelineBucket:F,searchLevel:Se,searchTool:Re,searchKeyword:Ie,searchStart:$e,searchEnd:Ve,searchTimePreset:V,searchLimit:me,searchLimits:Pe,searching:nt,searchRan:qe,searchError:Ne,searchResults:rt,searchStats:Gt,expandedSearch:ts,switchToSearch:Gs,runSearch:Ee,clearSearchFilters:ps,toggleSearchExpand:Ws,formatSearchTs:oa,searchEntryText:_n,searchLogLineClass:Zs,formatJson:N,applySearchTimePreset:Ms}}},Tg="••••••••",Zw={timezone:{apply_mode:"restart",description:"Locale and scheduling defaults used across Odin."},discord:{apply_mode:"live_read",description:"Global Discord defaults. Guild and channel overrides take precedence."},llm_provider:{apply_mode:"live_apply",owner:"llm",description:"Active language-model provider and failover ownership."},openai_codex:{apply_mode:"live_apply",owner:"llm",description:"Codex models, reasoning, transport, and pool behaviour."},ollama:{apply_mode:"restart",owner:"llm",description:"Local or remote Ollama provider settings."},kimi:{apply_mode:"restart",owner:"llm",description:"Kimi provider settings and request limits."},context:{apply_mode:"restart",description:"System-prompt sources and prompt-budget controls."},sessions:{apply_mode:"restart",description:"Conversation persistence, retention, and history limits."},tools:{apply_mode:"restart",description:"Execution policy, hosts, timeouts, pools, and recovery."},logging:{apply_mode:"restart",description:"Runtime log verbosity and storage policy."},usage:{apply_mode:"activation_required",description:"Usage accounting and durable history storage."},webhook:{apply_mode:"restart",description:"Inbound webhook listener and authentication policy."},learning:{apply_mode:"restart",description:"Reflection, consolidation, and learned-context limits."},observability:{apply_mode:"live_read",description:"Metrics, tracing, and failure-classification controls."},email:{apply_mode:"restart",description:"SMTP and IMAP behaviour for email tools."},search:{apply_mode:"restart",description:"Knowledge and history search backends."},browser:{apply_mode:"restart",description:"Browser automation limits and viewport defaults."},permissions:{apply_mode:"restart",description:"Default and per-user execution policy."},comfyui:{apply_mode:"live_read",description:"ComfyUI image backend connection settings."},image:{apply_mode:"live_read",description:"Image routing and native generation policy."},web:{apply_mode:"restart",description:"Management API listener, authentication, and sessions."},attachments:{apply_mode:"live_read",description:"Attachment limits, paths, and cleanup policy."},personality:{apply_mode:"live_read",owner:"personality",description:"Response identity, style, and personality presets."},reaction_triggers:{apply_mode:"activation_required",owner:"reaction_triggers",description:"Discord reaction event automation."},message_triggers:{apply_mode:"activation_required",owner:"message_triggers",description:"Discord message event automation."},mcp:{apply_mode:"activation_required",owner:"mcp",description:"Model Context Protocol servers and tool publication."},slack:{apply_mode:"restart",description:"Slack destinations and internal alert forwarding."},issue_tracker:{apply_mode:"activation_required",owner:"issue_tracker",description:"Issue tracker provider and tool lifecycle."},audit:{apply_mode:"restart",description:"Audit signing, verification, and retention."},agents:{apply_mode:"live_for_new_work",description:"Spawned-agent budgets, inheritance, and tree limits."},grafana_alerts:{apply_mode:"activation_required",owner:"grafana_alerts",description:"Grafana alert intake, routing, and remediation."},outbound_webhooks:{apply_mode:"live_apply",owner:"outbound_webhooks",description:"Outbound event targets, delivery, and safety policy."},graceful_degradation:{apply_mode:"activation_required",description:"Subsystem failure thresholds and request guarding."},llm_recovery:{apply_mode:"restart",description:"Provider recovery, breaker, and retry policy."},turn_state:{apply_mode:"restart",description:"Durable turn checkpoints, expiry, and resume behaviour."}},Zu={timezone:{label:"Timezone",description:"Timezone used in prompts and scheduled-time parsing.",consumers:[{name:"Prompt context",apply_mode:"live_read",detail:"Future prompts read the configured value."},{name:"Time parser",apply_mode:"restart",detail:"The parser currently captures the boot value."}],restart_reason:"The scheduling parser captures timezone during startup."},"discord.token":{owner:"secrets",sensitivity:"sensitive",description:"Write-only Discord bot credential."},"discord.allowed_users":{description:"Global allowlist of Discord user IDs. An empty list allows all users."},"discord.channels":{description:"Global allowlist of Discord channel IDs. An empty list allows all channels."},"discord.require_mention":{description:"Require a mention by default unless a guild or channel override says otherwise."},"discord.respond_to_bots":{description:"Allow replies to bot-authored messages by default."},"llm_provider.active_provider":{enum:["codex","ollama","kimi"],description:"Provider used for new primary requests."},"openai_codex.enabled":{apply_mode:"live_apply",description:"Enable or disable the primary Codex client through the dedicated Codex reload path."},"openai_codex.model":{apply_mode:"live_apply",description:"Primary Codex model. Spawned agents may inherit it directly; chat and loops require a Codex reload.",consumers:[{name:"Spawned agents inheriting the main model",apply_mode:"live_read",detail:"Future agent generations read the configured model at call time."},{name:"Chat and autonomous loops",apply_mode:"live_apply",detail:"The dedicated Codex endpoint reloads the live client."}]},"openai_codex.max_tokens":{apply_mode:"live_apply",constraints:{minimum:1,maximum:128e3},unit:"tokens",description:"Maximum Codex response tokens; requires the dedicated Codex reload path."},"openai_codex.reasoning_effort":{apply_mode:"live_apply",description:"Main Codex reasoning effort; requires the dedicated Codex reload path."},"openai_codex.agent_reasoning_effort":{apply_mode:"live_read",description:"Reasoning policy for spawned-agent generations; future generations read it at call time."},"openai_codex.agent_model":{apply_mode:"live_read",description:"Model policy for spawned-agent generations; future generations read it at call time."},"openai_codex.credentials_path":{owner:"secrets",sensitivity:"sensitive",apply_mode:"restart",description:"Write-only Codex credential-store path; an existing client cannot switch stores live.",restart_reason:"The credential pool is constructed from this path when the Codex client starts."},"openai_codex.request_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Whole-request timeout; requires the dedicated Codex reload path."},"openai_codex.stream_stall_timeout_seconds":{apply_mode:"live_apply",unit:"seconds",description:"Maximum silent-stream interval; requires the dedicated Codex reload path."},"openai_codex.retry.max_retries":{apply_mode:"live_apply",description:"Retry-attempt ceiling; requires the dedicated Codex reload path."},"openai_codex.retry.base_delay":{apply_mode:"live_apply",unit:"seconds",description:"Initial retry delay; requires the dedicated Codex reload path."},"openai_codex.retry.max_delay":{apply_mode:"live_apply",unit:"seconds",description:"Maximum retry delay; requires the dedicated Codex reload path."},"openai_codex.connection_pool.max_connections":{apply_mode:"restart",description:"Maximum Codex transport connections.",restart_reason:"Connection-pool sizing is fixed when the live client transport is constructed."},"openai_codex.connection_pool.keepalive_timeout":{apply_mode:"restart",unit:"seconds",description:"Codex connection keepalive timeout.",restart_reason:"Connection-pool keepalive policy is fixed when the live client transport is constructed."},"openai_codex.context_compression.enabled":{apply_mode:"restart",description:"Enable context compression for chat and agent tool loops.",restart_reason:"The context-compressor holder is constructed at startup and has no live apply path."},"openai_codex.context_compression.max_context_chars":{apply_mode:"restart",unit:"characters",description:"Context size at which compression begins.",restart_reason:"The context-compressor holder retains its startup configuration."},"openai_codex.context_compression.keep_recent_iterations":{apply_mode:"restart",unit:"iterations",description:"Recent tool iterations preserved during compression.",restart_reason:"The context-compressor holder retains its startup configuration."},"logging.level":{enum:["DEBUG","INFO","WARNING","ERROR","CRITICAL"],description:"Minimum runtime log level."},"browser.default_timeout_ms":{constraints:{minimum:1e3},unit:"ms",description:"Default browser operation timeout."},"browser.viewport_width":{constraints:{minimum:100,maximum:7680},unit:"px"},"browser.viewport_height":{constraints:{minimum:100,maximum:4320},unit:"px"},"sessions.max_history":{constraints:{minimum:1,maximum:1e4},unit:"messages"},"sessions.max_age_hours":{constraints:{minimum:1},unit:"hours"},"tools.command_timeout_seconds":{constraints:{minimum:10,maximum:3600},unit:"seconds"},"agents.max_children_per_agent":{apply_mode:"activation_required",description:"Child limit adopted by newly spawned parent agents after explicit activation.",activation_policy:"Explicitly apply the configured limit after reviewing worst-case tree breadth."},"context.max_system_prompt_tokens":{apply_mode:"activation_required",description:"Optional hard budget for future assembled system prompts.",activation_policy:"Preview mandatory prompt usage and omissions before applying the budget."},"usage.directory":{apply_mode:"activation_required",description:"Target for durable usage history; currently no durable store is active.",activation_policy:"Validate the path and explicitly enable durable usage history."},"slack.forward_alerts":{apply_mode:"activation_required",description:"Forward normalized internal alerts to tested Slack destinations.",activation_policy:"Requires an effective notifier, tested destination, and activation receipt."},"grafana_alerts.enabled":{apply_mode:"activation_required",description:"Adopt explicit Grafana processing control without changing legacy webhook behaviour on upgrade.",activation_policy:"Explicit adoption preserves working legacy-control installations."},"graceful_degradation.enabled":{apply_mode:"activation_required",description:"Allow subsystem guards to short-circuit calls while a dependency is unhealthy.",activation_policy:"Explicit adoption resolves the legacy always-on behaviour."}},Jw=["tools.enabled","tools.max_tool_iterations_chat","tools.max_tool_iterations_loop","learning.loop_reflection_enabled","turn_state.retention"],Yw=new Set(["token","api_token","api_key","password","secret","credentials_path","ssh_key_path","hmac_key","webhook_urls","headers","env"]);function si(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Qw(e){return Array.isArray(e)?"array":e===null?"null":Number.isInteger(e)?"integer":typeof e=="number"?"number":typeof e=="boolean"?"boolean":typeof e=="object"?"object":"string"}function Cg(e,t="",s=[]){if(e&&typeof e=="object"&&!Array.isArray(e)){const n=Object.entries(e);n.length===0&&t&&s.push([t,e]);for(const[a,i]of n)Cg(i,t?`${t}.${a}`:a,s);return s}return t&&s.push([t,e]),s}function Xw(e){return e.split(".").some(s=>Yw.has(s))}function e1(e){return Zu[e]?Zu[e]:e.startsWith("mcp.servers.")&&(e.endsWith(".headers")||e.endsWith(".env"))?{owner:"secrets",sensitivity:"secret_container"}:e.startsWith("outbound_webhooks.targets.")&&e.endsWith(".secret")?{owner:"secrets",sensitivity:"sensitive"}:e.startsWith("outbound_webhooks.targets.")&&(e.endsWith(".scrub_secrets")||e.endsWith(".verify_ssl"))?{apply_mode:"activation_required",activation_policy:"Review this target and acknowledge the target-bound safety override."}:{}}function Eg(e){return e==null||e===""?!1:Array.isArray(e)?e.length>0:typeof e=="object"?Object.keys(e).length>0:!0}function Ju(e,t){return t==="public"?e:e&&typeof e=="object"?Array.isArray(e)?[]:{}:Eg(e)?Tg:""}function t1(e){return e.valid===!1?"invalid":e.pending_restart?"pending_restart":e.drift?"drift":e.apply_mode==="activation_required"||e.apply_mode==="dormant"?"dormant":"applied"}function s1(e,t){const s=e.split(".")[0],n=e.split(".").at(-1),a=Zw[s]||{apply_mode:"restart",description:`${si(s)} configuration.`},i=e1(e),l=i.sensitivity||(Xw(e)?"sensitive":"public");let r=i.apply_mode||a.apply_mode;Jw.some(f=>e===f||e.startsWith(`${f}.`))&&(r="live_read");const o=i.owner||a.owner||(l==="public"?"config":"secrets"),c=Ju(t,l),d=Ju(t,l),u=Eg(t)&&!(l!=="public"&&t===Tg),p={path:e,owner:o,label:i.label||si(n),description:i.description||`${si(n)} setting for ${si(s)}.`,aliases:i.aliases||[],unit:i.unit||null,examples:i.examples||[],type:i.type||Qw(t),enum:i.enum||null,constraints:i.constraints||{},default:i.default??null,sensitivity:l,secret_route:l==="public"?null:`/api/config/secrets/${encodeURIComponent(e)}`,apply_mode:r,apply_handler:i.apply_handler||null,consumers:i.consumers||[],restart_reason:i.restart_reason||(r==="restart"?`${si(s)} is currently constructed during startup.`:null),activation_policy:i.activation_policy||(r==="activation_required"?"Saving configuration does not enable this feature. Explicit activation is required.":null),desired:c,effective:d,configured:u,provenance:u?"config_file":"unset",valid:!0,validation_errors:[],pending_restart:!1,drift:!1,last_apply:null};return p.apply_state=t1(p),p}function n1(e){const t={applied:0,pending_restart:0,dormant:0,invalid:0,drift:0};for(const s of e)Object.hasOwn(t,s.apply_state)&&(t[s.apply_state]+=1);return t}function a1(e){const t=Cg(e||{}).map(([s,n])=>s1(s,n));return{schema_version:1,revision:"local-fixture",generated_at:null,fields:t,status:{counts:n1(t),persistence_error:null,unsafe_overrides:[],desired_revision:null,effective_revision:null}}}const Ia=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","discord","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["llm_provider","openai_codex","ollama","kimi","image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["personality","context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],i1=[{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Activation required",short:"Dormant",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"}],l1={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Activation required",legacy_control:"Legacy control",dormant:"Not wired"},Yu={llm:{label:"LLM Config",href:"#/system?tab=llm",description:"This section has one canonical editor so provider changes use the safe switch and reload paths."},personality:{label:"Personality",href:"#/personality",description:"Personality presets and the active profile are managed on the dedicated Personality page."},discord:{label:"Discord overrides",href:"#/system?tab=discord",description:"Guild and channel overrides take precedence over these global defaults."},secrets:{label:"Secret controls",href:"#/system?tab=config",description:"Secret values are write-only and use dedicated set and clear flows."}},Ag="odin_config_center_expanded_v1",Rg="odin_config_center_category_v1",r1=50,Qu=e=>Promise.resolve(a1(e));function An(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function vi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function Fs(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function o1(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function c1(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function Ig(e,t){if(vi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return An(t);const n={};for(const[a,i]of Object.entries(t)){const l=Ig(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function d1(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=Ig(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function Og(e,t,s,n){if(vi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)Og(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function u1(){try{const e=JSON.parse(localStorage.getItem(Ag)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function p1(){try{const e=localStorage.getItem(Rg);return Ia.some(t=>t.key===e)?e:Ia[0].key}catch{return Ia[0].key}}const f1={template:`
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
  `,setup(){const e=h(null),t=h(null),s=h(!0),n=h(!1),a=h(null),i=h(null),l=h(""),r=h("all"),o=h(p1()),c=h(u1()),d=h({}),u=h(null),p=h(void 0),f=h(!1),v=h({}),g=h([]),T=h([]),R=h(!1),y=h(!1),m=h(!1);let _=null;const w=Y(()=>{var N;return((N=t.value)==null?void 0:N.fields)||[]}),D=Y(()=>new Map(w.value.map(N=>[N.path,N]))),O=Y(()=>e.value?Object.keys(e.value).length:0),E=Y(()=>w.value.length),C=Y(()=>i1),I=Y(()=>g.value.length>0),B=Y(()=>T.value.length>0),M=Y(()=>{if(!e.value)return[];const N=new Set(Ia.flatMap(we=>we.sections)),H=Ia.map(we=>({...we,sections:we.sections.filter(Ce=>Object.hasOwn(e.value,Ce))})).filter(we=>we.sections.length),te=Object.keys(e.value).filter(we=>!N.has(we));return te.length&&H.push({key:"other",label:"Other",icon:"folder",sections:te}),H}),L=Y(()=>{if(!e.value)return[];const N=[];for(const[H,te]of Object.entries(d.value))Og(e.value[H],te,H,N);return N.filter(H=>!vi(H.oldVal,H.newVal)).map(H=>{const te=he(H.path);return{...H,label:(te==null?void 0:te.label)||Fs(H.path.split(".").at(-1)),apply_mode:(te==null?void 0:te.apply_mode)||ue(H.path.split(".")[0])}})}),W=Y(()=>L.value.length>0),ee=Y(()=>L.value.length),$=Y(()=>new Set(L.value.map(N=>N.path.split(".")[0])).size),k=Y(()=>!!l.value||r.value!=="all"),x=Y(()=>{const N={...v.value};for(const H of L.value){const te=he(H.path),we=Pe(te,H.newVal);we&&(N[H.path]=we)}return N}),F=Y(()=>Object.keys(x.value).length>0),de=Y(()=>e.value?(k.value?M.value:M.value.filter(H=>H.key===o.value)).map(H=>({...H,sections:H.sections.filter(te=>J(te))})).filter(H=>H.sections.length):[]),pe=Y(()=>{const N=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],H=new Map(N.map(te=>[te,[]]));for(const te of L.value){const we=H.has(te.apply_mode)?te.apply_mode:"restart";H.get(we).push(te)}return N.filter(te=>H.get(te).length).map(te=>({key:te,label:Ds(te),entries:H.get(te)}))}),ie=Y(()=>L.value.filter(N=>N.apply_mode==="restart").length);function he(N){var Ct;if(D.value.has(N))return D.value.get(N);const H=`${N}.`,te=w.value.filter(U=>U.path.startsWith(H));if(!te.length)return null;const we=te.some(U=>U.sensitivity!=="public")?"secret_container":"public",Ce=[...new Set(te.map(U=>U.apply_mode))];return{path:N,label:Fs(N.split(".").at(-1)),description:te[0].description,type:"object",sensitivity:we,configured:te.some(U=>U.configured),provenance:((Ct=te.find(U=>U.provenance!=="unset"))==null?void 0:Ct.provenance)||"unset",apply_mode:Ce.length===1?Ce[0]:ue(N.split(".")[0]),constraints:{},enum:null}}function Q(N){const H=`${N}.`;return w.value.filter(te=>te.path===N||te.path.startsWith(H))}function fe(N){return Q(N).length}function Me(N){return Fs(N)}function j(N){const H=Q(N);if(!H.length)return`${Fs(N)} configuration.`;const te=H.find(Ct=>Ct.sensitivity==="public"&&Ct.description)||H.find(Ct=>Ct.description),we=(te==null?void 0:te.description)||"";return we.match(/setting for (.+)\.$/i)?`${Fs(N)} settings and runtime behaviour.`:we}function ue(N){const H=[...new Set(Q(N).map(te=>te.apply_mode))];return H.length===1?H[0]:H.includes("restart")?"restart":H.includes("activation_required")?"activation_required":H[0]||"restart"}function re(N){const H=[...new Set(Q(N).map(te=>Ds(te.apply_mode)))];return H.length?H.length===1?H[0]:`Mixed apply behaviour: ${H.join(" · ")}`:""}function _e(N){const H=Q(N),te=H.map(U=>U.owner).filter(U=>U&&U!=="config"&&U!=="secrets");if(!te.length)return null;const we=te.reduce((U,ne)=>({...U,[ne]:(U[ne]||0)+1}),{}),[Ce,Ct]=Object.entries(we).sort((U,ne)=>ne[1]-U[1])[0];return Ct>=Math.max(1,H.length-1)&&Yu[Ce]?Ce:null}function ve(N){return Yu[N]||{label:Fs(N),href:"#/system?tab=config",description:"This feature uses a dedicated configuration and activation panel."}}function Be(N){var H;return Object.hasOwn(d.value,N)?d.value[N]:(H=e.value)==null?void 0:H[N]}function b(N){const H=Be(N);return(H&&typeof H=="object"&&!Array.isArray(H)?Object.entries(H).map(([we,Ce])=>({key:we,path:`${N}.${we}`,value:Ce})):[{key:null,path:N,value:H}]).map(we=>{const Ce=he(we.path)||{};return{...Ce,...we,label:Ce.label||(we.key===null?Me(N):Fs(we.key)),description:Ce.description||`${Fs(we.key||N)} setting for ${Fs(N)}.`,apply_mode:Ce.apply_mode||ue(N),sensitivity:Ce.sensitivity||"public",constraints:Ce.constraints||{},configured:Ce.configured??!0,provenance:Ce.provenance||"config_file"}})}function A(N,H){return[N.label,N.path,N.description,...N.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(H)}function P(N){const H=l.value.trim().toLowerCase();return H?Q(N).filter(te=>A(te,H)):[]}function J(N){const H=Q(N);if(r.value!=="all"&&!H.some(we=>we.apply_state===r.value))return!1;const te=l.value.trim().toLowerCase();return!te||`${Me(N)} ${N}`.toLowerCase().includes(te)?!0:H.some(we=>A(we,te))}function q(N,H){return Q(N).filter(te=>te.apply_state===H).length}function Z(N){var H,te,we;return N==="all"?E.value:((we=(te=(H=t.value)==null?void 0:H.status)==null?void 0:te.counts)==null?void 0:we[N])??w.value.filter(Ce=>Ce.apply_state===N).length}function oe(N){const H=N.sections.flatMap(te=>Q(te));return{fields:H.length,modified:L.value.filter(te=>N.sections.includes(te.path.split(".")[0])).length,pending_restart:H.filter(te=>te.apply_state==="pending_restart").length,invalid:H.filter(te=>te.apply_state==="invalid").length,dormant:H.filter(te=>te.apply_state==="dormant").length}}function ae(N){var H;return Object.hasOwn(d.value,N)&&!vi((H=e.value)==null?void 0:H[N],d.value[N])}function se(N){return L.value.some(H=>H.path===N||H.path.startsWith(`${N}.`))}function X(N){o.value=N,l.value="",r.value="all";try{localStorage.setItem(Rg,N)}catch{}}function xe(N){r.value=N}function ce(){l.value="",r.value="all"}function ge(N){return c.value[N]?!0:!!(l.value&&!m.value&&J(N))}function ke(N){const H=!ge(N);m.value&&H?c.value={[N]:!0}:c.value={...c.value,[N]:H}}function Se(){g.value.push(An(d.value)),g.value.length>r1&&g.value.shift(),T.value=[]}function Re(N){u.value!==N&&(u.value=N,f.value=Object.hasOwn(d.value,N),p.value=f.value?An(d.value[N]):void 0,f.value||(d.value={...d.value,[N]:An(e.value[N])}),c.value=m.value?{[N]:!0}:{...c.value,[N]:!0})}function Ie(N){if(!qe(N)){if(vi(d.value[N],e.value[N])){const H={...d.value};delete H[N],d.value=H}u.value=null,p.value=void 0,f.value=!1}}function $e(N){const H={...d.value};f.value?H[N]=An(p.value):delete H[N],d.value=H,u.value=null,p.value=void 0,f.value=!1;const te=`${N}.`;v.value=Object.fromEntries(Object.entries(v.value).filter(([we])=>we!==N&&!we.startsWith(te)))}function Ve(){!W.value&&!u.value||(Se(),d.value={},u.value=null,p.value=void 0,f.value=!1,v.value={},R.value=!1)}function V(N,H){const te=N.path.split(".")[0];if(u.value!==te)return;Se();const we=An(d.value[te]);if(N.key===null?d.value={...d.value,[te]:H}:(we[N.key]=H,d.value={...d.value,[te]:we}),v.value[N.path]){const Ce={...v.value};delete Ce[N.path],v.value=Ce}}function me(N,H){try{const te=JSON.parse(H),we={...v.value};delete we[N.path],v.value=we,V(N,te)}catch(te){v.value={...v.value,[N.path]:`Invalid JSON: ${te.message}`}}}function Pe(N,H){var we;if(!N)return null;if((we=N.enum)!=null&&we.length&&!N.enum.includes(H))return`Choose one of: ${N.enum.join(", ")}`;const te=N.constraints||{};if((N.type==="integer"||N.type==="number")&&typeof H=="number"){if(te.minimum!==void 0&&H<te.minimum)return`Must be at least ${te.minimum}${N.unit?` ${N.unit}`:""}`;if(te.maximum!==void 0&&H>te.maximum)return`Must be at most ${te.maximum}${N.unit?` ${N.unit}`:""}`}return null}function nt(N){return x.value[N.path]||null}function qe(N){const H=`${N}.`;return Object.keys(x.value).some(te=>te===N||te.startsWith(H))}function Ne(){g.value.length&&(T.value.push(An(d.value)),d.value=g.value.pop(),v.value={})}function rt(){T.value.length&&(g.value.push(An(d.value)),d.value=T.value.pop(),v.value={})}function Gt(){!W.value||F.value||(u.value&&Ie(u.value),R.value=!0,y.value=!1)}function ts(){R.value=!1}function Gs(){u.value?$e(u.value):Ve()}function Ds(N){return l1[N]||Fs(N||"unknown")}function Ms(N){return`apply-${String(N||"unknown").replaceAll("_","-")}`}function us(N){return`cfgc-field-${N.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function z(N){return`${us(N)}-input`}function Ee(N){const H=document.getElementById(us(N))||document.getElementById(us(N.split(".").slice(0,2).join(".")));H==null||H.scrollIntoView({behavior:"smooth",block:"center"})}function ps(N,H){i.value={type:N,message:H},window.setTimeout(()=>{var te;((te=i.value)==null?void 0:te.message)===H&&(i.value=null)},3500)}async function Ws(){if(!(!W.value||F.value||n.value)){n.value=!0;try{const N=d1(e.value,d.value),H=await G.put("/api/config",N);e.value=H,t.value=await Qu(H),d.value={},u.value=null,p.value=void 0,f.value=!1,g.value=[],T.value=[],v.value={},R.value=!1,ps("success","Configuration saved. Apply status has been refreshed.")}catch(N){ps("error",N.message||"Configuration could not be saved")}finally{n.value=!1}}}async function oa(){var N;if(!W.value){s.value=!0,a.value=null;try{const H=await G.get("/api/config"),te=await Qu(H);e.value=H,t.value=te;const we=M.value;we.some(Ce=>Ce.key===o.value)||(o.value=((N=we[0])==null?void 0:N.key)||Ia[0].key)}catch(H){a.value=H.message||"Unknown configuration error"}finally{s.value=!1}}}function _n(N){if(R.value||!(N.ctrlKey||N.metaKey))return;const H=N.target;H instanceof HTMLElement&&(H.matches("input, textarea, select")||H.isContentEditable)||(!N.shiftKey&&N.key.toLowerCase()==="z"?(N.preventDefault(),Ne()):(N.key.toLowerCase()==="y"||N.shiftKey&&N.key.toLowerCase()==="z")&&(N.preventDefault(),rt()))}function Zs(N){if(m.value=N.matches,N.matches){const H=Object.keys(c.value).find(te=>c.value[te]);c.value=H?{[H]:!0}:{}}}return ds(c,N=>{try{localStorage.setItem(Ag,JSON.stringify(N))}catch{}},{deep:!0}),Je(()=>{var N;oa(),document.addEventListener("keydown",_n),_=window.matchMedia("(max-width: 760px)"),Zs(_),(N=_.addEventListener)==null||N.call(_,"change",Zs)}),xt(()=>{var N;document.removeEventListener("keydown",_n),(N=_==null?void 0:_.removeEventListener)==null||N.call(_,"change",Zs)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,searchQuery:l,healthFilter:r,activeCategory:o,editingSection:u,reviewOpen:R,mobileOverflowOpen:y,healthFilters:C,visibleCategories:M,displayGroups:de,reviewGroups:pe,sectionCount:O,fieldCount:E,hasChanges:W,changeCount:ee,changedSectionCount:$,hasDraftErrors:F,canUndo:I,canRedo:B,globalFilterActive:k,reviewRestartCount:ie,healthCount:Z,categoryStats:oe,selectCategory:X,selectHealthFilter:xe,clearFilters:ce,sectionLabel:Me,sectionDescription:j,sectionFieldCount:fe,sectionHealthCount:q,sectionApplySummary:re,sectionOwner:_e,ownerInfo:ve,sectionEntries:b,sectionSearchHits:P,sectionChanged:ae,fieldChanged:se,isSectionExpanded:ge,toggleSection:ke,startSectionDraft:Re,finishSectionDraft:Ie,cancelSectionDraft:$e,discardAllDrafts:Ve,setFieldValue:V,setJsonFieldValue:me,fieldError:nt,sectionHasErrors:qe,undo:Ne,redo:rt,openReview:Gt,closeReview:ts,mobileCancel:Gs,applyModeLabel:Ds,applyClass:Ms,compactValue:o1,formatValue:c1,fieldId:us,fieldInputId:z,focusField:Ee,fetchConfig:oa,saveConfig:Ws}}},h1={template:`
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
  `,setup(){const e=h([]),t=h(!0),s=h(null),n=h({});function a(f){return f.config&&f.config.enabled!==void 0?f.config.enabled:!0}function i(f){return f.config&&f.config.require_mention!==void 0?f.config.require_mention:!1}function l(f){return f.config&&f.config.respond_to_bots!==void 0?f.config.respond_to_bots:!1}function r(f){return f.config&&Object.keys(f.config).length>0}function o(f){n.value[f]=!n.value[f]}async function c(){t.value=!0,s.value=null;try{e.value=await G.get("/api/discord/guilds")}catch(f){s.value=f.message}t.value=!1}async function d(f,v,g){try{await G.put("/api/discord/guild/"+f+"/config",{[v]:g}),await c()}catch(T){s.value=T.message}}async function u(f,v,g,T){try{await G.put("/api/discord/channel/"+f+"/config",{[g]:T}),await c()}catch(R){s.value=R.message}}async function p(f,v){try{await G.put("/api/discord/channel/"+f+"/config",{clear:!0}),await c()}catch(g){s.value=g.message}}return Je(c),{guilds:e,loading:t,error:s,expanded:n,guildEnabled:a,guildMention:i,guildBots:l,hasOverride:r,toggleGuild:o,fetchGuilds:c,setGuildConfig:d,setChannelConfig:u,clearOverride:p}}},g1={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h({allowed_hosts:[],default_host:""}),i=h({}),l=h(!1),r=h(""),o=h(!1),c=h(0),d=h([]),u=h(null),p=Y(()=>{const x={};for(const F of d.value)x[F.id]=F;return x});function f(x){return p.value[x]||null}const v=Y(()=>/^\d{15,25}$/.test(r.value.trim())),g=Y(()=>{if(o.value){if(T.value[c.value])return"host-user-option-"+c.value;if(v.value)return"host-user-option-raw"}}),T=Y(()=>{const x=r.value.toLowerCase().trim();return x?d.value.filter(F=>!i.value[F.id]&&(F.display_name.toLowerCase().includes(x)||F.username.toLowerCase().includes(x)||F.id.includes(x))):d.value.filter(F=>!i.value[F.id])});function R(x,F){return x?x.allowed_hosts===null||x.allowed_hosts===void 0?{allowed_hosts:[...F],default_host:x.default_host||"",allow_all:!0}:{allowed_hosts:x.allowed_hosts,default_host:x.default_host||"",allow_all:!1}:{allowed_hosts:[...F],default_host:F[0]||"",allow_all:!0}}async function y(){e.value=!0,t.value="";try{const x=await G.get("/api/host-access");s.value=x,n.value=x.available_hosts||[],a.value=R(x.default_policy,n.value);const F=x.users||{},de={};for(const[pe,ie]of Object.entries(F))de[pe]=R(ie,n.value);i.value=de}catch(x){t.value=x.message||"Failed to fetch host access data"}finally{e.value=!1}try{d.value=await G.get("/api/discord/members")||[]}catch{d.value=[]}}async function m(){try{const x=a.value.allow_all?null:a.value.allowed_hosts;await G.put("/api/host-access/default-policy",{allowed_hosts:x,default_host:a.value.default_host}),Te.success("Default policy updated")}catch(x){Te.error(x.message||"Failed to save")}}function _(x,F){a.value.allow_all=!1,F?a.value.allowed_hosts.includes(x)||a.value.allowed_hosts.push(x):(a.value.allowed_hosts=a.value.allowed_hosts.filter(de=>de!==x),a.value.default_host===x&&(a.value.default_host=a.value.allowed_hosts[0]||"")),m()}async function w(x){const F=i.value[x];if(F)try{const de=F.allow_all?null:F.allowed_hosts;await G.put(`/api/host-access/user/${x}`,{allowed_hosts:de,default_host:F.default_host});const pe=f(x);Te.success(`Updated access for ${pe?pe.display_name:x}`)}catch(de){Te.error(de.message||"Failed to save")}}function D(x,F,de){const pe=i.value[x];pe&&(pe.allow_all=!1,de?pe.allowed_hosts.includes(F)||pe.allowed_hosts.push(F):(pe.allowed_hosts=pe.allowed_hosts.filter(ie=>ie!==F),pe.default_host===F&&(pe.default_host=pe.allowed_hosts[0]||"")),w(x))}function O(x,F){const de=i.value[x];de&&(de.default_host=F,w(x))}function E(){l.value=!0,r.value="",c.value=0,It(()=>{u.value&&u.value.focus()})}function C(){o.value=!0,c.value=0}function I(){c.value<T.value.length-1&&c.value++}function B(){c.value>0&&c.value--}function M(){const x=T.value[c.value];if(x){W(x);return}v.value&&L()}function L(){const x=r.value.trim();/^\d{15,25}$/.test(x)&&(i.value[x]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},w(x),r.value="",o.value=!1,l.value=!1)}function W(x){i.value[x.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},w(x.id),r.value="",o.value=!1,l.value=!1}function ee(){o.value=!1}function $(){setTimeout(()=>{o.value=!1},150)}async function k(x){const F=f(x);if(await vs({title:"Remove user override",message:`Remove the host access override for ${F?F.display_name:x}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0}))try{await G.del(`/api/host-access/user/${x}`),delete i.value[x],Te.success(`Removed override for ${F?F.display_name:x}`)}catch(pe){Te.error(pe.message||"Failed to delete")}}return Je(y),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:T,isRawId:v,activeOptionId:g,searchInput:u,fetchData:y,saveDefaultPolicy:m,toggleDefaultHost:_,getMember:f,toggleUserHost:D,setUserDefault:O,openAddUser:E,deleteUser:k,onSearchInput:C,highlightNext:I,highlightPrev:B,selectHighlighted:M,selectMember:W,closeDropdown:ee,onBlur:$,addRawId:L}}},m1={template:`
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
  `,setup(){const e=h(!0),t=h(""),s=h(null),n=h([]),a=h(!1),i=h(!1),l=h(null),r=h(null),o=h(!1),c=h({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=h({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=Y(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=Y(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function f(E){return E==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":E==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function v(){e.value=!0,t.value="";try{const E=await G.get("/api/tokens");s.value=E.tokens||[],n.value=E.available_hosts||[]}catch(E){t.value=E.message||"Failed to load tokens"}finally{e.value=!1}}function g(E){return!E||!E.trim()?[]:E.split(",").map(C=>C.trim()).filter(Boolean)}function T(E,C){const I=c.value.allowed_hosts;if(C&&!I.includes(E)&&I.push(E),!C){const B=I.indexOf(E);B>=0&&I.splice(B,1)}}function R(E,C){const I=d.value.allowed_hosts;if(C&&!I.includes(E)&&I.push(E),!C){const B=I.indexOf(E);B>=0&&I.splice(B,1)}}async function y(){var E;i.value=!0;try{const C=g(c.value.allowed_tools_str),I=c.value.host_mode,B=I==="none"?[]:I==="select"?c.value.allowed_hosts:null,M={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:C.length?C:[]};B!==null&&(M.allowed_hosts=B),M.default_host=c.value.default_host||"";const L=await G.post("/api/tokens",M);l.value=L.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Te.success("Token created"),await v()}catch(C){Te.error(((E=C.data)==null?void 0:E.error)||C.message||"Failed to create token")}finally{i.value=!1}}function m(E){r.value=E;const C=E.allowed_hosts;let I="default";C==null?I="default":Array.isArray(C)&&C.length===0?I="none":Array.isArray(C)&&(I="select"),d.value={username:E.username||"",tier:E.tier||"admin",label:E.label||"",host_mode:I,allowed_hosts:Array.isArray(C)?[...C]:[],default_host:E.default_host||"",allowed_tools_str:(E.allowed_tools||[]).join(", ")}}async function _(){var E;if(r.value){o.value=!0;try{const C=g(d.value.allowed_tools_str),I=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:C};I==="none"?B.allowed_hosts=[]:I==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await G.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,Te.success("Token updated"),await v()}catch(C){Te.error(((E=C.data)==null?void 0:E.error)||C.message||"Failed to update")}finally{o.value=!1}}}async function w(E){var I;if(await vs({title:"Regenerate token",message:`Regenerate token for ${E.username||E.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await G.post("/api/tokens/"+encodeURIComponent(E.user_id)+"/regenerate");l.value=B.token,Te.success("Token regenerated")}catch(B){Te.error(((I=B.data)==null?void 0:I.error)||B.message||"Failed to regenerate")}}async function D(E){var I;if(await vs({title:"Delete token",message:`Delete token for ${E.username||E.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/tokens/"+encodeURIComponent(E.user_id)),Te.success("Token deleted"),await v()}catch(B){Te.error(((I=B.data)==null?void 0:I.error)||B.message||"Failed to delete")}}async function O(){if(l.value)try{await navigator.clipboard.writeText(l.value),Te.success("Copied to clipboard")}catch{Te.error("Copy failed — select and copy manually")}}return Je(v),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:v,tierBadge:f,toggleCreateHost:T,toggleEditHost:R,createToken:y,startEdit:m,saveEdit:_,confirmRegenerate:w,confirmDelete:D,copyToken:O}}};function dl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const v1={template:`
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
  `,setup(){const e=h(!0),t=h(null),s=h("codex"),n=h({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:""}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=Y(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=Y(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=Y(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=Y(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),d=Y(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),u=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=z=>r.includes(z)&&d.value,f=h({enabled:!1,model:"gpt-5.6-luna"}),v=h({unavailable_reason:null}),g=Y(()=>{const z=f.value.model;return z&&!a.includes(z)?[z,...a]:a});function T(z){const Ee=z.target.value;f.value.enabled=Ee!=="",Ee!==""&&(f.value.model=Ee),Ve()}const R=h(!1),y=h({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096}),m=h({enabled:!1,api_key:"",model:"",max_tokens:4096}),_=h(!1),w=h(!1),D=h(!1),O=h(!1),E=h(!1),C=h(!1),I=h(!1),B=h({configured:!1}),M=h([]),L=h(""),W=h(!1),ee=h(!1),$=h({configured:!1}),k=h([]),x=h(""),F=h(!1),de=h(!1),pe=h(!0),ie=h(""),he=h({configured:!1,accounts:[]}),Q=h(null),fe=h(null),Me=h(""),j=h(null),ue=h(!1),re=h(null),_e=h(null),ve=h("");let Be=null;function b(z,Ee="success"){Te(z,Ee==="error"?"error":"success")}function A(z){if(!z)return"?";const Ee=z/(1024*1024*1024);return Ee>=1?Ee.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}async function P(){e.value=!0,await Promise.all([J(),q(),xe(),Z()]),e.value=!1}async function J(){try{const z=await G.get("/api/llm/status");t.value=z,s.value=z.active_provider||"codex",z.codex&&!$e.pending()&&(n.value.enabled=z.codex.enabled,n.value.model=z.codex.model||"gpt-5.5",n.value.reasoning_effort=z.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=z.codex.agent_reasoning_effort||"",n.value.agent_model=z.codex.agent_model||"",n.value.max_tokens=z.codex.max_tokens||4096),z.ollama&&!V.pending()&&(y.value.enabled=z.ollama.enabled,y.value.base_url=z.ollama.base_url||"",y.value.model=z.ollama.model||"",y.value.max_tokens=z.ollama.max_tokens||4096),z.kimi&&!me.pending()&&(m.value.enabled=z.kimi.enabled,m.value.model=z.kimi.model||"",m.value.max_tokens=z.kimi.max_tokens||4096),z.auxiliary&&(v.value=z.auxiliary,Ve.pending()||(f.value.enabled=z.auxiliary.enabled,f.value.model=z.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function q(){try{if(B.value=await G.get("/api/ollama/status"),B.value.model&&(L.value=B.value.model),B.value.configured)try{const z=await G.get("/api/ollama/models");M.value=z.models||[]}catch{M.value=[]}else if(y.value.base_url)try{const z=await G.post("/api/ollama/probe-models",{base_url:y.value.base_url});M.value=z.models||[]}catch{M.value=[]}}catch{B.value={configured:!1}}}async function Z(){pe.value=!0,ie.value="";try{he.value=await G.get("/api/codex/status")}catch(z){ie.value=z.message||"Failed to fetch Codex status"}finally{pe.value=!1}}async function oe(){const z=t.value?t.value.active_provider:"codex";I.value=!0;try{const Ee=await G.post("/api/llm/switch",{provider:s.value});Ee.error?(s.value=z,b(Ee.error,"error")):(b("Switched to "+s.value+" ("+Ee.model+")"),await P())}catch(Ee){s.value=z,b(Ee.message||"Switch failed","error")}finally{I.value=!1}}async function ae(){W.value=!0;try{const z=await G.post("/api/ollama/reload");b(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await P()}catch(z){b(z.message||"Reload failed","error")}finally{W.value=!1}}async function se(){ee.value=!0;try{await G.post("/api/ollama/model",{model:L.value}),b("Model set to "+L.value),await P()}catch(z){b(z.message||"Failed","error")}finally{ee.value=!1}}async function X(){const z=y.value.base_url;if(!z){b("Enter a base URL first","error");return}C.value=!0;try{const Ee=await G.post("/api/ollama/probe-models",{base_url:z});M.value=Ee.models||[],M.value.length?(b(M.value.length+" model(s) found"),!y.value.model&&M.value.length&&(y.value.model=M.value[0].name)):b("No models found at "+z,"error")}catch(Ee){b(Ee.message||"Could not reach Ollama","error")}finally{C.value=!1}}async function xe(){try{if($.value=await G.get("/api/kimi/status"),$.value.model&&(x.value=$.value.model),$.value.configured)try{const z=await G.get("/api/kimi/models");k.value=z.models||[]}catch{k.value=[]}}catch{$.value={configured:!1}}}async function ce(){F.value=!0;try{const z=await G.post("/api/kimi/reload");b(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await P()}catch(z){b(z.message||"Reload failed","error")}finally{F.value=!1}}async function ge(){de.value=!0;try{await G.post("/api/kimi/model",{model:x.value}),b("Model set to "+x.value),await P()}catch(z){b(z.message||"Failed","error")}finally{de.value=!1}}async function ke(){if(D.value){$e();return}D.value=!0;try{await G.put("/api/llm/codex/config",n.value),b("Codex config saved"),await Promise.all([J(),Z()])}catch(z){b(z.message||"Failed","error"),await Promise.all([J(),Z()])}finally{D.value=!1}}async function Se(){if(O.value){V();return}O.value=!0;try{const z={...y.value},Ee=_.value?y.value.api_key:null;Ee===null&&delete z.api_key,await G.put("/api/llm/ollama/config",z),b("Ollama config saved"),Ee!==null&&y.value.api_key===Ee&&(y.value.api_key="",_.value=!1),await Promise.all([J(),q()])}catch(z){b(z.message||"Failed","error")}finally{O.value=!1}}async function Re(){if(E.value){me();return}E.value=!0;try{const z={...m.value},Ee=w.value?m.value.api_key:null;Ee===null&&delete z.api_key,await G.put("/api/llm/kimi/config",z),b("Kimi config saved"),Ee!==null&&m.value.api_key===Ee&&(m.value.api_key="",w.value=!1),await Promise.all([J(),xe()])}catch(z){b(z.message||"Failed","error")}finally{E.value=!1}}async function Ie(){if(R.value){Ve();return}R.value=!0;try{await G.put("/api/llm/auxiliary/config",f.value),b("Auxiliary config saved"),await J()}catch(z){b(z.message||"Failed","error"),await J()}finally{R.value=!1}}const $e=dl(ke),Ve=dl(Ie),V=dl(Se),me=dl(Re),Pe=()=>($e.cancel(),ke()),nt=()=>(V.cancel(),Se()),qe=()=>(me.cancel(),Re());async function Ne(z){try{await G.post("/api/codex/account/"+z+"/activate"),b("Active account switched"),await Z()}catch(Ee){b(Ee.message||"Failed","error")}}async function rt(z){Q.value=z;try{await G.post("/api/codex/account/"+z+"/refresh"),b("Token refreshed"),await Z()}catch(Ee){b(Ee.message||"Refresh failed","error")}finally{Q.value=null}}function Gt(z,Ee){fe.value=z,Me.value=Ee||""}async function ts(z){try{await G.put("/api/codex/account/"+z+"/label",{label:Me.value}),b("Label updated"),fe.value=null,await Z()}catch(Ee){b(Ee.message||"Failed","error")}}async function Gs(z,Ee){if(await vs({title:"Delete Codex account",message:`Delete ${Ee||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await G.del("/api/codex/account/"+z),b("Deleted. Pool reloaded."),await Z()}catch(Ws){b(Ws.message||"Failed","error")}}async function Ds(){ue.value=!0;try{const z=await G.post("/api/codex/device-code");re.value=z,j.value="pending",Ms(z)}catch(z){b(z.message||"Failed","error")}finally{ue.value=!1}}async function Ms(z){Be={cancelled:!1};const Ee=Be;try{const ps=await G.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(Ee.cancelled)return;_e.value=ps,j.value="success",await P()}catch(ps){if(Ee.cancelled)return;ve.value=ps.message||"Device login failed",j.value="error"}}function us(){Be&&(Be.cancelled=!0),j.value=null,re.value=null}return Je(P),xt(()=>{Be&&(Be.cancelled=!0),$e.cancel(),Ve.cancel(),V.cancel(),me.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:I,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:f,auxData:v,auxModelOptions:g,onAuxModelChange:T,savingAux:R,saveAuxConfigDebounced:Ve,ollamaForm:y,kimiForm:m,savingCodex:D,savingOllama:O,savingKimi:E,probingOllama:C,ollamaKeyDirty:_,kimiKeyDirty:w,ollamaStatus:B,ollamaModels:M,ollamaSelectedModel:L,reloading:W,settingModel:ee,kimiStatus:$,kimiModels:k,kimiSelectedModel:x,reloadingKimi:F,settingKimiModel:de,codexLoading:pe,codexError:ie,codexData:he,refreshing:Q,editingLabel:fe,labelValue:Me,deviceState:j,deviceLoading:ue,deviceInfo:re,deviceResult:_e,deviceError:ve,fetchAll:P,switchProvider:oe,reloadOllama:ae,setOllamaModel:se,reloadKimi:ce,setKimiModel:ge,probeOllamaModels:X,saveCodexConfig:ke,saveOllamaConfig:Se,saveKimiConfig:Re,saveCodexConfigDebounced:$e,saveOllamaConfigDebounced:V,saveKimiConfigDebounced:me,saveCodexConfigNow:Pe,saveOllamaConfigNow:nt,saveKimiConfigNow:qe,activateAccount:Ne,refreshAccount:rt,startEditLabel:Gt,saveLabel:ts,deleteAccount:Gs,startDeviceLogin:Ds,cancelDeviceLogin:us,formatSize:A}}},Xu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function b1(e){return Xu[e]||Xu[(e||"").toLowerCase()]||"text-gray-400"}const y1={template:`
    <div class="p-6 page-fade-in" role="region" aria-label="Internals">
      <div v-if="loading" class="hm-card" style="padding:2rem;text-align:center;">
        <div class="skeleton skeleton-text" style="width:200px;margin:0 auto;"></div>
      </div>

      <div v-else class="space-y-4">

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
  `,setup(){const e=h(!0),t=h({}),s=h([]),n=h({}),a=h({}),i=h(null),l=h(null),r=h(null),o=h(null),c=h(null);let d=null;async function u(){const g=await Promise.allSettled([G.get("/api/startup/diagnostics"),G.get("/api/subsystems/status"),G.get("/api/pools/ssh"),G.get("/api/pools/http"),G.get("/api/risk/stats"),G.get("/api/recovery/stats"),G.get("/api/compression/stats"),G.get("/api/freshness/stats"),G.get("/api/governor/stats")]),T=y=>g[y].status==="fulfilled"?g[y].value:null;t.value=T(0)||{};const R=T(1);s.value=Array.isArray(R)?R:R&&R.subsystems||[],n.value=T(2)||{},a.value=T(3)||{},i.value=T(4),l.value=T(5),r.value=T(6),o.value=T(7),c.value=T(8),e.value=!1}let p=!1;function f(){p||(p=!0,u(),d||(d=setInterval(u,3e4)))}function v(){p&&(p=!1,d&&(clearInterval(d),d=null))}return Je(f),Es(f),As(v),xt(v),{loading:e,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:b1,formatTime:Nc}}},x1={setup(){const e=h(""),t=h(""),s=h(!1),n=h(""),a=h(!1),i=h(!1),l=h(!1),r=h(null),o=h(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await G.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await vs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await G.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Je(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},_1={components:{TabbedPage:kr},setup(){return{tabs:[{id:"health",label:"Health",component:jw},{id:"resources",label:"Resources",component:zw},{id:"logs",label:"Logs",component:Ww},{id:"config",label:"Config",component:f1},{id:"discord",label:"Discord",component:h1},{id:"host-access",label:"Host Access",component:g1},{id:"api-tokens",label:"API Tokens",component:m1},{id:"llm",label:"LLM Config",component:v1},{id:"internals",label:"Internals",component:y1},{id:"update",label:"Update",component:x1}]}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},_t=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Lg=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:Z_,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:fw,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:kw,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:Rw,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:$w,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:Uw,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:_1,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:_t("/operations","live")},{path:"/agents",redirect:_t("/operations","agents")},{path:"/loops",redirect:_t("/operations","loops")},{path:"/processes",redirect:_t("/operations","processes")},{path:"/schedules",redirect:_t("/operations","schedules")},{path:"/audit",redirect:_t("/history","audit")},{path:"/sessions",redirect:_t("/history","sessions")},{path:"/traces",redirect:_t("/history","traces")},{path:"/usage",redirect:_t("/history","usage")},{path:"/tools",redirect:_t("/capabilities","tools")},{path:"/skills",redirect:_t("/capabilities","skills")},{path:"/knowledge",redirect:_t("/capabilities","knowledge")},{path:"/memory",redirect:_t("/capabilities","memory")},{path:"/learned",redirect:_t("/capabilities","learned")},{path:"/health",redirect:_t("/system","health")},{path:"/resources",redirect:_t("/system","resources")},{path:"/logs",redirect:_t("/system","logs")},{path:"/config",redirect:_t("/system","config")},{path:"/host-access",redirect:_t("/system","host-access")},{path:"/internals",redirect:_t("/system","internals")}],bi=H_({history:y_(),routes:Lg});bi.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const k1={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=h(""),s=h(null),n=h(!1),a=h(!1);async function i(){n.value=!0,s.value=null;try{G.setPersist(a.value),await G.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},w1={template:`
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
    <command-palette />`,setup(){const e=h("checking"),t=h(!1),s=h(!1),n=h(!1),a=h(null),i=h(null),l=h(!1);let r=null,o=null;const c=h(!1),d=h("disconnected"),u=h(-1),p=h(null);let f=null;const v=h("starting"),g=h(""),T=Lg.filter(k=>k.meta),R=Y(()=>["Workspace","Operate","Observe","Manage"].map(k=>({name:k,routes:T.filter(x=>x.meta.section===k)})).filter(k=>k.routes.length)),y=Y(()=>{var k;return((k=bi.currentRoute.value.meta)==null?void 0:k.label)||"Odin"}),m=Y(()=>{var k;return((k=bi.currentRoute.value.meta)==null?void 0:k.section)||"Management"}),_=Y(()=>{var k;return((k=bi.currentRoute.value.meta)==null?void 0:k.description)||"Management console"});G.onSessionExpired=()=>{t.value=!0,We.disconnect(),G.setToken(""),e.value="login"};function w(k){var x;if((k.ctrlKey||k.metaKey)&&k.key.toLowerCase()==="k"){e.value==="ready"&&(k.preventDefault(),Su());return}if(n.value&&k.key==="Tab"){const F=[...((x=a.value)==null?void 0:x.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(F.length){const de=F[0],pe=F[F.length-1];if(k.shiftKey&&(document.activeElement===de||!a.value.contains(document.activeElement))){k.preventDefault(),pe.focus();return}if(!k.shiftKey&&(document.activeElement===pe||!a.value.contains(document.activeElement))){k.preventDefault(),de.focus();return}}}if(k.key==="Escape"&&n.value){n.value=!1,k.preventDefault();return}if(k.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(k.target.tagName)){k.preventDefault();const F=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');F&&F.focus()}}function D(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Je(async()=>{document.addEventListener("keydown",w),r=window.matchMedia("(max-width: 900px)"),D(),r.addEventListener("change",D);const k=await G.check();k.ok?(e.value="ready",ee()):k.needsAuth?e.value="login":(e.value="ready",ee())});function O(){t.value=!1,e.value="ready",ee()}async function E(){await G.logout(),We.disconnect(),e.value="login"}function C(){s.value=!s.value}function I(){n.value=!n.value}ds(n,async k=>{var x,F;if(k)o=document.activeElement,await It(),(F=(x=a.value)==null?void 0:x.querySelector(".nav-item"))==null||F.focus();else if(o!=null&&o.isConnected){const de=o;o=null,requestAnimationFrame(()=>de.focus())}});const B=Y(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function M(k,x="info",F=3e3){p.value={text:k,level:x},clearTimeout(f),f=setTimeout(()=>{p.value=null},F)}let L=null,W=!1;function ee(){We.onStatusChange=k=>{c.value=k},We.onStateChange=(k,x)=>{d.value=k,u.value=x.latency??-1,k==="connected"?(W&&M("Connection restored","success"),W=!0):k==="reconnecting"&&x.attempt===1&&M("Connection lost — reconnecting…","warn")},We.connect(),$(),L&&clearInterval(L),L=setInterval($,15e3)}async function $(){try{const k=await G.get("/api/status");v.value=k.status==="online"?"online":"starting";const x=k.uptime_seconds||0,F=Math.floor(x/3600),de=Math.floor(x%3600/60);g.value=`${F}h ${de}m uptime`}catch{v.value="offline",g.value=""}}return xt(()=>{L&&clearInterval(L),We.disconnect(),document.removeEventListener("keydown",w),r==null||r.removeEventListener("change",D)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:B,wsToast:p,botStatus:v,botUptime:g,navRoutes:T,navGroups:R,currentPage:y,currentSection:m,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:O,logout:E,toggleSidebar:C,toggleMobileNavigation:I,openPalette:Su}}},Fn=Ml(w1);Fn.component("odin-icon",K_);Fn.component("login-screen",k1);Fn.component("toast-container",N0);Fn.component("confirm-host",D0);Fn.component("command-palette",q_);Fn.directive("modal-focus",W_);Fn.use(bi);Fn.mount("#app");
