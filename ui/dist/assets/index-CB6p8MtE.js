var Vm=Object.defineProperty;var jm=(e,t,s)=>t in e?Vm(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var at=(e,t,s)=>jm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class zm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new il("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new ld(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new il("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new ld((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new il((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof il?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class il extends Error{constructor(t){super(t),this.name="AuthError"}}class ld extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class qm{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const K=new zm,ze=new qm(K);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ms(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Be={},Ea=[],Pt=()=>{},Ta=()=>!1,ra=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),lr=e=>e.startsWith("onUpdate:"),Ue=Object.assign,Wo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},Gm=Object.prototype.hasOwnProperty,Ye=(e,t)=>Gm.call(e,t),me=Array.isArray,Aa=e=>Za(e)==="[object Map]",oa=e=>Za(e)==="[object Set]",rd=e=>Za(e)==="[object Date]",Km=e=>Za(e)==="[object RegExp]",Ae=e=>typeof e=="function",Ne=e=>typeof e=="string",qt=e=>typeof e=="symbol",Je=e=>e!==null&&typeof e=="object",Zo=e=>(Je(e)||Ae(e))&&Ae(e.then)&&Ae(e.catch),rf=Object.prototype.toString,Za=e=>rf.call(e),Wm=e=>Za(e).slice(8,-1),rr=e=>Za(e)==="[object Object]",or=e=>Ne(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,dn=ms(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Zm=ms("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),cr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Jm=/-\w/g,nt=cr(e=>e.replace(Jm,t=>t.slice(1).toUpperCase())),Ym=/\B([A-Z])/g,is=cr(e=>e.replace(Ym,"-$1").toLowerCase()),ca=cr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ra=cr(e=>e?`on${ca(e)}`:""),It=(e,t)=>!Object.is(e,t),Ia=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},of=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},dr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Il=e=>{const t=Ne(e)?Number(e):NaN;return isNaN(t)?e:t};let od;const ur=()=>od||(od=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Qm(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Xm="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",eg=ms(Xm);function zi(e){if(me(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Ne(n)?cf(n):zi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Ne(e)||Je(e))return e}const tg=/;(?![^(]*\))/g,sg=/:([^]+)/,ng=/\/\*[^]*?\*\//g;function cf(e){const t={};return e.replace(ng,"").split(tg).forEach(s=>{if(s){const n=s.split(sg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function qi(e){let t="";if(Ne(e))t=e;else if(me(e))for(let s=0;s<e.length;s++){const n=qi(e[s]);n&&(t+=n+" ")}else if(Je(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function ag(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Ne(t)&&(e.class=qi(t)),s&&(e.style=zi(s)),e}const ig="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",lg="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",rg="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",og="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",cg=ms(ig),dg=ms(lg),ug=ms(rg),fg=ms(og),pg="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",hg=ms(pg);function df(e){return!!e||e===""}function mg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=hn(e[n],t[n]);return s}function hn(e,t){if(e===t)return!0;let s=rd(e),n=rd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=qt(e),n=qt(t),s||n)return e===t;if(s=me(e),n=me(t),s||n)return s&&n?mg(e,t):!1;if(s=Je(e),n=Je(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!hn(e[l],t[l]))return!1}}return String(e)===String(t)}function fr(e,t){return e.findIndex(s=>hn(s,t))}const uf=e=>!!(e&&e.__v_isRef===!0),ff=e=>Ne(e)?e:e==null?"":me(e)||Je(e)&&(e.toString===rf||!Ae(e.toString))?uf(e)?ff(e.value):JSON.stringify(e,pf,2):String(e),pf=(e,t)=>uf(t)?pf(e,t.value):Aa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[$r(n,i)+" =>"]=a,s),{})}:oa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>$r(s))}:qt(t)?$r(t):Je(t)&&!me(t)&&!rr(t)?String(t):t,$r=(e,t="")=>{var s;return qt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function gg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Tt;class Jo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Tt&&(Tt.active?(this.parent=Tt,this.index=(Tt.scopes||(Tt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Tt;try{return Tt=this,t()}finally{Tt=s}}}on(){++this._on===1&&(this.prevScope=Tt,Tt=this)}off(){if(this._on>0&&--this._on===0){if(Tt===this)Tt=this.prevScope;else{let t=Tt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function vg(e){return new Jo(e)}function hf(){return Tt}function bg(e,t=!1){Tt&&Tt.cleanups.push(e)}let lt;const Ur=new WeakSet;class Ci{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Tt&&(Tt.active?Tt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Ur.has(this)&&(Ur.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||gf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,cd(this),vf(this);const t=lt,s=Ds;lt=this,Ds=!0;try{return this.fn()}finally{bf(this),lt=t,Ds=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Xo(t);this.deps=this.depsTail=void 0,cd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Ur.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){po(this)&&this.run()}get dirty(){return po(this)}}let mf=0,mi,gi;function gf(e,t=!1){if(e.flags|=8,t){e.next=gi,gi=e;return}e.next=mi,mi=e}function Yo(){mf++}function Qo(){if(--mf>0)return;if(gi){let t=gi;for(gi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;mi;){let t=mi;for(mi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function vf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function bf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Xo(n),yg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function po(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(yf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function yf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ei)||(e.globalVersion=Ei,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!po(e))))return;e.flags|=2;const t=e.dep,s=lt,n=Ds;lt=e,Ds=!0;try{vf(e);const a=e.fn(e._value);(t.version===0||It(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{lt=s,Ds=n,bf(e),e.flags&=-3}}function Xo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Xo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function yg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function xg(e,t){e.effect instanceof Ci&&(e=e.effect.fn);const s=new Ci(e);t&&Ue(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function _g(e){e.effect.stop()}let Ds=!0;const xf=[];function mn(){xf.push(Ds),Ds=!1}function gn(){const e=xf.pop();Ds=e===void 0?!0:e}function cd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=lt;lt=void 0;try{t()}finally{lt=s}}}let Ei=0;class kg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class pr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!lt||!Ds||lt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==lt)s=this.activeLink=new kg(lt,this),lt.deps?(s.prevDep=lt.depsTail,lt.depsTail.nextDep=s,lt.depsTail=s):lt.deps=lt.depsTail=s,_f(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=lt.depsTail,s.nextDep=void 0,lt.depsTail.nextDep=s,lt.depsTail=s,lt.deps===s&&(lt.deps=n)}return s}trigger(t){this.version++,Ei++,this.notify(t)}notify(t){Yo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Qo()}}}function _f(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)_f(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Ol=new WeakMap,Qn=Symbol(""),ho=Symbol(""),Ai=Symbol("");function Vt(e,t,s){if(Ds&&lt){let n=Ol.get(e);n||Ol.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new pr),a.map=n,a.key=s),a.track()}}function an(e,t,s,n,a,i){const l=Ol.get(e);if(!l){Ei++;return}const r=o=>{o&&o.trigger()};if(Yo(),t==="clear")l.forEach(r);else{const o=me(e),c=o&&or(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Ai||!qt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Ai)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Qn)),Aa(e)&&r(l.get(ho)));break;case"delete":o||(r(l.get(Qn)),Aa(e)&&r(l.get(ho)));break;case"set":Aa(e)&&r(l.get(Qn));break}}Qo()}function wg(e,t){const s=Ol.get(e);return s&&s.get(t)}function ma(e){const t=Ke(e);return t===e?t:(Vt(t,"iterate",Ai),rs(e)?t:t.map(Ps))}function hr(e){return Vt(e=Ke(e),"iterate",Ai),e}function qs(e,t){return Ks(e)?Fa(un(e)?Ps(t):t):Ps(t)}const Sg={__proto__:null,[Symbol.iterator](){return Br(this,Symbol.iterator,e=>qs(this,e))},concat(...e){return ma(this).concat(...e.map(t=>me(t)?ma(t):t))},entries(){return Br(this,"entries",e=>(e[1]=qs(this,e[1]),e))},every(e,t){return Js(this,"every",e,t,void 0,arguments)},filter(e,t){return Js(this,"filter",e,t,s=>s.map(n=>qs(this,n)),arguments)},find(e,t){return Js(this,"find",e,t,s=>qs(this,s),arguments)},findIndex(e,t){return Js(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Js(this,"findLast",e,t,s=>qs(this,s),arguments)},findLastIndex(e,t){return Js(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Js(this,"forEach",e,t,void 0,arguments)},includes(...e){return Hr(this,"includes",e)},indexOf(...e){return Hr(this,"indexOf",e)},join(e){return ma(this).join(e)},lastIndexOf(...e){return Hr(this,"lastIndexOf",e)},map(e,t){return Js(this,"map",e,t,void 0,arguments)},pop(){return ti(this,"pop")},push(...e){return ti(this,"push",e)},reduce(e,...t){return dd(this,"reduce",e,t)},reduceRight(e,...t){return dd(this,"reduceRight",e,t)},shift(){return ti(this,"shift")},some(e,t){return Js(this,"some",e,t,void 0,arguments)},splice(...e){return ti(this,"splice",e)},toReversed(){return ma(this).toReversed()},toSorted(e){return ma(this).toSorted(e)},toSpliced(...e){return ma(this).toSpliced(...e)},unshift(...e){return ti(this,"unshift",e)},values(){return Br(this,"values",e=>qs(this,e))}};function Br(e,t,s){const n=hr(e),a=n[t]();return n!==e&&!rs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const Tg=Array.prototype;function Js(e,t,s,n,a,i){const l=hr(e),r=l!==e&&!rs(e),o=l[t];if(o!==Tg[t]){const u=o.apply(e,i);return r?Ps(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,qs(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function dd(e,t,s,n){const a=hr(e),i=a!==e&&!rs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=qs(e,c)),s.call(this,c,qs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?qs(e,o):o}function Hr(e,t,s){const n=Ke(e);Vt(n,"iterate",Ai);const a=n[t](...s);return(a===-1||a===!1)&&Gi(s[0])?(s[0]=Ke(s[0]),n[t](...s)):a}function ti(e,t,s=[]){mn(),Yo();const n=Ke(e)[t].apply(e,s);return Qo(),gn(),n}const Cg=ms("__proto__,__v_isRef,__isVue"),kf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(qt));function Eg(e){qt(e)||(e=String(e));const t=Ke(this);return Vt(t,"has",e),t.hasOwnProperty(e)}class wf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Rf:Af:i?Ef:Cf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=me(t);if(!a){let o;if(l&&(o=Sg[s]))return o;if(s==="hasOwnProperty")return Eg}const r=Reflect.get(t,s,kt(t)?t:n);if((qt(s)?kf.has(s):Cg(s))||(a||Vt(t,"get",s),i))return r;if(kt(r)){const o=l&&or(s)?r:r.value;return a&&Je(o)?Ll(o):o}return Je(r)?a?Ll(r):$n(r):r}}class Sf extends wf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=me(t)&&or(s);if(!this._isShallow){const c=Ks(i);if(!rs(n)&&!Ks(n)&&(i=Ke(i),n=Ke(n)),!l&&kt(i)&&!kt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:Ye(t,s),o=Reflect.set(t,s,n,kt(t)?t:a);return t===Ke(a)&&(r?It(n,i)&&an(t,"set",s,n):an(t,"add",s,n)),o}deleteProperty(t,s){const n=Ye(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&an(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!qt(s)||!kf.has(s))&&Vt(t,"has",s),n}ownKeys(t){return Vt(t,"iterate",me(t)?"length":Qn),Reflect.ownKeys(t)}}class Tf extends wf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Ag=new Sf,Rg=new Tf,Ig=new Sf(!0),Og=new Tf(!0),mo=e=>e,ll=e=>Reflect.getPrototypeOf(e);function Lg(e,t,s){return function(...n){const a=this.__v_raw,i=Ke(a),l=Aa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?mo:t?Fa:Ps;return!t&&Vt(i,"iterate",o?ho:Qn),Ue(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function rl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Ng(e,t){const s={get(a){const i=this.__v_raw,l=Ke(i),r=Ke(a);e||(It(a,r)&&Vt(l,"get",a),Vt(l,"get",r));const{has:o}=ll(l),c=t?mo:e?Fa:Ps;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Vt(Ke(a),"iterate",Qn),a.size},has(a){const i=this.__v_raw,l=Ke(i),r=Ke(a);return e||(It(a,r)&&Vt(l,"has",a),Vt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ke(r),c=t?mo:e?Fa:Ps;return!e&&Vt(o,"iterate",Qn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ue(s,e?{add:rl("add"),set:rl("set"),delete:rl("delete"),clear:rl("clear")}:{add(a){const i=Ke(this),l=ll(i),r=Ke(a),o=!t&&!rs(a)&&!Ks(a)?r:a;return l.has.call(i,o)||It(a,o)&&l.has.call(i,a)||It(r,o)&&l.has.call(i,r)||(i.add(o),an(i,"add",o,o)),this},set(a,i){!t&&!rs(i)&&!Ks(i)&&(i=Ke(i));const l=Ke(this),{has:r,get:o}=ll(l);let c=r.call(l,a);c||(a=Ke(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?It(i,d)&&an(l,"set",a,i):an(l,"add",a,i),this},delete(a){const i=Ke(this),{has:l,get:r}=ll(i);let o=l.call(i,a);o||(a=Ke(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&an(i,"delete",a,void 0),c},clear(){const a=Ke(this),i=a.size!==0,l=a.clear();return i&&an(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Lg(a,e,t)}),s}function mr(e,t){const s=Ng(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(Ye(s,a)&&a in n?s:n,a,i)}const Dg={get:mr(!1,!1)},Mg={get:mr(!1,!0)},Pg={get:mr(!0,!1)},Fg={get:mr(!0,!0)},Cf=new WeakMap,Ef=new WeakMap,Af=new WeakMap,Rf=new WeakMap;function $g(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function $n(e){return Ks(e)?e:gr(e,!1,Ag,Dg,Cf)}function ec(e){return gr(e,!1,Ig,Mg,Ef)}function Ll(e){return gr(e,!0,Rg,Pg,Af)}function Ug(e){return gr(e,!0,Og,Fg,Rf)}function gr(e,t,s,n,a){if(!Je(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=$g(Wm(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function un(e){return Ks(e)?un(e.__v_raw):!!(e&&e.__v_isReactive)}function Ks(e){return!!(e&&e.__v_isReadonly)}function rs(e){return!!(e&&e.__v_isShallow)}function Gi(e){return e?!!e.__v_raw:!1}function Ke(e){const t=e&&e.__v_raw;return t?Ke(t):e}function If(e){return!Ye(e,"__v_skip")&&Object.isExtensible(e)&&of(e,"__v_skip",!0),e}const Ps=e=>Je(e)?$n(e):e,Fa=e=>Je(e)?Ll(e):e;function kt(e){return e?e.__v_isRef===!0:!1}function m(e){return Of(e,!1)}function tc(e){return Of(e,!0)}function Of(e,t){return kt(e)?e:new Bg(e,t)}class Bg{constructor(t,s){this.dep=new pr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ke(t),this._value=s?t:Ps(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||rs(t)||Ks(t);t=n?t:Ke(t),It(t,s)&&(this._rawValue=t,this._value=n?t:Ps(t),this.dep.trigger())}}function Hg(e){e.dep&&e.dep.trigger()}function Gs(e){return kt(e)?e.value:e}function Vg(e){return Ae(e)?e():Gs(e)}const jg={get:(e,t,s)=>t==="__v_raw"?e:Gs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return kt(a)&&!kt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function sc(e){return un(e)?e:new Proxy(e,jg)}class zg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new pr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Lf(e){return new zg(e)}function qg(e){const t=me(e)?new Array(e.length):{};for(const s in e)t[s]=Nf(e,s);return t}class Gg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=qt(s)?s:String(s),this._raw=Ke(t);let a=!0,i=t;if(!me(t)||qt(this._key)||!or(this._key))do a=!Gi(i)||rs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Gs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&kt(this._raw[this._key])){const s=this._object[this._key];if(kt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return wg(this._raw,this._key)}}class Kg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Wg(e,t,s){return kt(e)?e:Ae(e)?new Kg(e):Je(e)&&arguments.length>1?Nf(e,t,s):m(e)}function Nf(e,t,s){return new Gg(e,t,s)}class Zg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new pr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ei-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&lt!==this)return gf(this,!0),!0}get value(){const t=this.dep.track();return yf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Jg(e,t,s=!1){let n,a;return Ae(e)?n=e:(n=e.get,a=e.set),new Zg(n,a,s)}const Yg={GET:"get",HAS:"has",ITERATE:"iterate"},Qg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},ol={},Nl=new WeakMap;let On;function Xg(){return On}function Df(e,t=!1,s=On){if(s){let n=Nl.get(s);n||Nl.set(s,n=[]),n.push(e)}}function ev(e,t,s=Be){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=_=>a?_:rs(_)||a===!1||a===0?ln(_,1):ln(_);let d,u,p,h,g=!1,x=!1;if(kt(e)?(u=()=>e.value,g=rs(e)):un(e)?(u=()=>c(e),g=!0):me(e)?(x=!0,g=e.some(_=>un(_)||rs(_)),u=()=>e.map(_=>{if(kt(_))return _.value;if(un(_))return c(_);if(Ae(_))return o?o(_,2):_()})):Ae(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){mn();try{p()}finally{gn()}}const _=On;On=d;try{return o?o(e,3,[h]):e(h)}finally{On=_}}:u=Pt,t&&a){const _=u,S=a===!0?1/0:a;u=()=>ln(_(),S)}const I=hf(),O=()=>{d.stop(),I&&I.active&&Wo(I.effects,d)};if(i&&t){const _=t;t=(...S)=>{const b=_(...S);return O(),b}}let y=x?new Array(e.length).fill(ol):ol;const v=_=>{if(!(!(d.flags&1)||!d.dirty&&!_))if(t){const S=d.run();if(_||a||g||(x?S.some((b,T)=>It(b,y[T])):It(S,y))){p&&p();const b=On;On=d;try{const T=[S,y===ol?void 0:x&&y[0]===ol?[]:y,h];y=S,o?o(t,3,T):t(...T)}finally{On=b}}}else d.run()};return r&&r(v),d=new Ci(u),d.scheduler=l?()=>l(v,!1):v,h=_=>Df(_,!1,d),p=d.onStop=()=>{const _=Nl.get(d);if(_){if(o)o(_,4);else for(const S of _)S();Nl.delete(d)}},t?n?v(!0):y=d.run():l?l(v.bind(null,!0),!0):d.run(),O.pause=d.pause.bind(d),O.resume=d.resume.bind(d),O.stop=O,O}function ln(e,t=1/0,s){if(t<=0||!Je(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,kt(e))ln(e.value,t,s);else if(me(e))for(let n=0;n<e.length;n++)ln(e[n],t,s);else if(oa(e)||Aa(e))e.forEach(n=>{ln(n,t,s)});else if(rr(e)){for(const n in e)ln(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&ln(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Mf=[];function tv(e){Mf.push(e)}function sv(){Mf.pop()}function nv(e,t){}const av={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},iv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ja(e,t,s,n){try{return n?e(...n):e()}catch(a){da(a,t,s)}}function ps(e,t,s,n){if(Ae(e)){const a=Ja(e,t,s,n);return a&&Zo(a)&&a.catch(i=>{da(i,t,s)}),a}if(me(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ps(e[i],t,s,n));return a}}function da(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Be;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){mn(),Ja(i,null,10,[e,o,c]),gn();return}}lv(e,s,a,n,l)}function lv(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Zt=[];let js=-1;const Oa=[];let Ln=null,_a=0;const Pf=Promise.resolve();let Dl=null;function Ct(e){const t=Dl||Pf;return e?t.then(this?e.bind(this):e):t}function rv(e){let t=js+1,s=Zt.length;for(;t<s;){const n=t+s>>>1,a=Zt[n],i=Ii(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function nc(e){if(!(e.flags&1)){const t=Ii(e),s=Zt[Zt.length-1];!s||!(e.flags&2)&&t>=Ii(s)?Zt.push(e):Zt.splice(rv(t),0,e),e.flags|=1,Ff()}}function Ff(){Dl||(Dl=Pf.then($f))}function Ri(e){me(e)?Oa.push(...e):Ln&&e.id===-1?Ln.splice(_a+1,0,e):e.flags&1||(Oa.push(e),e.flags|=1),Ff()}function ud(e,t,s=js+1){for(;s<Zt.length;s++){const n=Zt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Zt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Ml(e){if(Oa.length){const t=[...new Set(Oa)].sort((s,n)=>Ii(s)-Ii(n));if(Oa.length=0,Ln){Ln.push(...t);return}for(Ln=t,_a=0;_a<Ln.length;_a++){const s=Ln[_a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Ln=null,_a=0}}const Ii=e=>e.id==null?e.flags&2?-1:1/0:e.id;function $f(e){try{for(js=0;js<Zt.length;js++){const t=Zt[js];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ja(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;js<Zt.length;js++){const t=Zt[js];t&&(t.flags&=-2)}js=-1,Zt.length=0,Ml(),Dl=null,(Zt.length||Oa.length)&&$f()}}let ka,cl=[];function Uf(e,t){var s,n;ka=e,ka?(ka.enabled=!0,cl.forEach(({event:a,args:i})=>ka.emit(a,...i)),cl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Uf(i,t)}),setTimeout(()=>{ka||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,cl=[])},3e3)):cl=[]}let Mt=null,vr=null;function Oi(e){const t=Mt;return Mt=e,vr=e&&e.type.__scopeId||null,t}function ov(e){vr=e}function cv(){vr=null}const dv=e=>ac;function ac(e,t=Mt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Mi(-1);const i=Oi(t);let l;try{l=e(...a)}finally{Oi(i),n._d&&Mi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function uv(e,t){if(Mt===null)return e;const s=Ji(Mt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Be]=t[a];i&&(Ae(i)&&(i={mounted:i,updated:i}),i.deep&&ln(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function zs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(mn(),ps(o,s,8,[e.el,r,e,t]),gn())}}function vi(e,t){if(Dt){let s=Dt.provides;const n=Dt.parent&&Dt.parent.provides;n===s&&(s=Dt.provides=Object.create(n)),s[e]=t}}function Ss(e,t,s=!1){const n=Qt();if(n||Xn){let a=Xn?Xn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ae(t)?t.call(n&&n.proxy):t}}function fv(){return!!(Qt()||Xn)}const Bf=Symbol.for("v-scx"),Hf=()=>Ss(Bf);function pv(e,t){return Ki(e,null,t)}function hv(e,t){return Ki(e,null,{flush:"post"})}function Vf(e,t){return Ki(e,null,{flush:"sync"})}function Yt(e,t,s){return Ki(e,t,s)}function Ki(e,t,s=Be){const{immediate:n,deep:a,flush:i,once:l}=s,r=Ue({},s),o=t&&n||!t&&i!=="post";let c;if(aa){if(i==="sync"){const h=Hf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!o){const h=()=>{};return h.stop=Pt,h.resume=Pt,h.pause=Pt,h}}const d=Dt;r.call=(h,g,x)=>ps(h,d,g,x);let u=!1;i==="post"?r.scheduler=h=>{xt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(h,g)=>{g?h():nc(h)}),r.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=ev(e,t,r);return aa&&(c?c.push(p):o&&p()),p}function mv(e,t,s){const n=this.proxy,a=Ne(e)?e.includes(".")?jf(n,e):()=>n[e]:e.bind(n,n);let i;Ae(t)?i=t:(i=t.handler,s=t);const l=Ya(this),r=Ki(a,i.bind(n),s);return l(),r}function jf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Rn=new WeakMap,zf=Symbol("_vte"),qf=e=>e.__isTeleport,Wn=e=>e&&(e.disabled||e.disabled===""),gv=e=>e&&(e.defer||e.defer===""),fd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,pd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,go=(e,t)=>{const s=e&&e.to;return Ne(s)?t?t(s):null:s},vv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:g,createText:x,createComment:I,parentNode:O}}=c,y=Wn(t.props);let{dynamicChildren:v}=t;const _=(T,C,R)=>{T.shapeFlag&16&&d(T.children,C,R,a,i,l,r,o)},S=(T=t)=>{const C=Wn(T.props),R=T.target=go(T.props,g),E=vo(R,T,x,h);R&&(l!=="svg"&&fd(R)?l="svg":l!=="mathml"&&pd(R)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(R),C||(_(T,R,E),di(T,!1)))},b=T=>{const C=()=>{if(Rn.get(T)===C){if(Rn.delete(T),Wn(T.props)){const R=O(T.el)||s;_(T,R,T.anchor),di(T,!0)}S(T)}};Rn.set(T,C),xt(C,i)};if(e==null){const T=t.el=x(""),C=t.anchor=x("");if(h(T,s,n),h(C,s,n),gv(t.props)||i&&i.pendingBranch){b(t);return}y&&(_(t,s,C),di(t,!0)),S()}else{t.el=e.el;const T=t.anchor=e.anchor,C=Rn.get(e);if(C){C.flags|=8,Rn.delete(e),b(t);return}t.targetStart=e.targetStart;const R=t.target=e.target,E=t.targetAnchor=e.targetAnchor,U=Wn(e.props),P=U?s:R,M=U?T:E;if(l==="svg"||fd(R)?l="svg":(l==="mathml"||pd(R))&&(l="mathml"),v?(p(e.dynamicChildren,v,P,a,i,l,r),mc(e,t,!0)):o||u(e,t,P,M,a,i,l,r,!1),y)U?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):dl(t,s,T,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Z=t.target=go(t.props,g);Z&&dl(t,Z,null,c,0)}else U&&dl(t,R,E,c,1);di(t,y)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!Wn(p),g=Rn.get(e);if(g&&(g.flags|=8,Rn.delete(e)),u&&(a(c),a(d)),i&&a(o),!g&&l&16)for(let x=0;x<r.length;x++){const I=r[x];n(I,t,s,h,!!I.dynamicChildren)}},move:dl,hydrate:bv};function dl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Rn.has(e)&&(!u||Wn(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function bv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(I,O){let y=O;for(;y;){if(y&&y.nodeType===8){if(y.data==="teleport start anchor")t.targetStart=y;else if(y.data==="teleport anchor"){t.targetAnchor=y,I._lpa=t.targetAnchor&&l(t.targetAnchor);break}}y=l(y)}}function h(I,O){O.anchor=u(l(I),O,r(I),s,n,a,i)}const g=t.target=go(t.props,o),x=Wn(t.props);if(g){const I=g._lpa||g.firstChild;t.shapeFlag&16&&(x?(h(e,t),p(g,I),t.targetAnchor||vo(g,t,d,c,r(e)===g?e:null)):(t.anchor=l(e),p(g,I),t.targetAnchor||vo(g,t,d,c),u(I&&l(I),t,g,s,n,a,i))),di(t,x)}else x&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const yv=vv;function di(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function vo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[zf]=l,e&&(n(i,e,a),n(l,e,a)),l}const _s=Symbol("_leaveCb"),si=Symbol("_enterCb");function ic(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return qe(()=>{e.isMounted=!0}),_r(()=>{e.isUnmounting=!0}),e}const xs=[Function,Array],lc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:xs,onEnter:xs,onAfterEnter:xs,onEnterCancelled:xs,onBeforeLeave:xs,onLeave:xs,onAfterLeave:xs,onLeaveCancelled:xs,onBeforeAppear:xs,onAppear:xs,onAfterAppear:xs,onAppearCancelled:xs},Gf=e=>{const t=e.subTree;return t.component?Gf(t.component):t},xv={name:"BaseTransition",props:lc,setup(e,{slots:t}){const s=Qt(),n=ic();return()=>{const a=t.default&&br(t.default(),!0),i=a&&a.length?Kf(a):s.subTree?Rp():void 0;if(!i)return;const l=Ke(e),{mode:r}=l;if(n.isLeaving)return Vr(i);const o=hd(i);if(!o)return Vr(i);let c=$a(o,l,n,s,u=>c=u);o.type!==vt&&vn(o,c);let d=s.subTree&&hd(s.subTree);if(d&&d.type!==vt&&!Ns(d,o)&&Gf(s).type!==vt){let u=$a(d,l,n,s);if(vn(d,u),r==="out-in"&&o.type!==vt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Vr(i);r==="in-out"&&o.type!==vt?u.delayLeave=(p,h,g)=>{const x=Zf(n,d);x[String(d.key)]=d,p[_s]=()=>{h(),p[_s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{g(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Kf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==vt){t=s;break}}return t}const Wf=xv;function Zf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function $a(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:g,onLeaveCancelled:x,onBeforeAppear:I,onAppear:O,onAfterAppear:y,onAppearCancelled:v}=t,_=String(e.key),S=Zf(s,e),b=(R,E)=>{R&&ps(R,n,9,E)},T=(R,E)=>{const U=E[1];b(R,E),me(R)?R.every(P=>P.length<=1)&&U():R.length<=1&&U()},C={mode:l,persisted:r,beforeEnter(R){let E=o;if(!s.isMounted)if(i)E=I||o;else return;R[_s]&&R[_s](!0);const U=S[_];U&&Ns(e,U)&&U.el[_s]&&U.el[_s](),b(E,[R])},enter(R){if(S[_]===e)return;let E=c,U=d,P=u;if(!s.isMounted)if(i)E=O||c,U=y||d,P=v||u;else return;let M=!1;R[si]=te=>{M||(M=!0,te?b(P,[R]):b(U,[R]),C.delayedLeave&&C.delayedLeave(),R[si]=void 0)};const Z=R[si].bind(null,!1);E?T(E,[R,Z]):Z()},leave(R,E){const U=String(e.key);if(R[si]&&R[si](!0),s.isUnmounting)return E();b(p,[R]);let P=!1;R[_s]=Z=>{P||(P=!0,E(),Z?b(x,[R]):b(g,[R]),R[_s]=void 0,S[U]===e&&delete S[U])};const M=R[_s].bind(null,!1);S[U]=e,h?T(h,[R,M]):M()},clone(R){const E=$a(R,t,s,n,a);return a&&a(E),E}};return C}function Vr(e){if(Zi(e))return e=Ws(e),e.children=null,e}function hd(e){if(!Zi(e))return qf(e.type)&&e.children?Kf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ae(s.default))return s.default()}}function vn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,vn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function br(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Ot?(l.patchFlag&128&&a++,n=n.concat(br(l.children,t,r))):(t||l.type!==vt)&&n.push(r!=null?Ws(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Wi(e,t){return Ae(e)?Ue({name:e.name},t,{setup:e}):e}function _v(){const e=Qt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function rc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function kv(e){const t=Qt(),s=tc(null);if(t){const a=t.refs===Be?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function md(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Pl=new WeakMap;function La(e,t,s,n,a=!1){if(me(e)){e.forEach((x,I)=>La(x,t&&(me(t)?t[I]:t),s,n,a));return}if(fn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&La(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ji(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Be?r.refs={}:r.refs,u=r.setupState,p=Ke(u),h=u===Be?Ta:x=>md(d,x)?!1:Ye(p,x),g=(x,I)=>!(I&&md(d,I));if(c!=null&&c!==o){if(gd(t),Ne(c))d[c]=null,h(c)&&(u[c]=null);else if(kt(c)){const x=t;g(c,x.k)&&(c.value=null),x.k&&(d[x.k]=null)}}if(Ae(o))Ja(o,r,12,[l,d]);else{const x=Ne(o),I=kt(o);if(x||I){const O=()=>{if(e.f){const y=x?h(o)?u[o]:d[o]:g()||!e.k?o.value:d[e.k];if(a)me(y)&&Wo(y,i);else if(me(y))y.includes(i)||y.push(i);else if(x)d[o]=[i],h(o)&&(u[o]=d[o]);else{const v=[i];g(o,e.k)&&(o.value=v),e.k&&(d[e.k]=v)}}else x?(d[o]=l,h(o)&&(u[o]=l)):I&&(g(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const y=()=>{O(),Pl.delete(e)};y.id=-1,Pl.set(e,y),xt(y,s)}else gd(e),O()}}}function gd(e){const t=Pl.get(e);t&&(t.flags|=8,Pl.delete(e))}let vd=!1;const ga=()=>{vd||(console.error("Hydration completed but contains mismatches."),vd=!0)},wv=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",Sv=e=>e.namespaceURI.includes("MathML"),ul=e=>{if(e.nodeType===1){if(wv(e))return"svg";if(Sv(e))return"mathml"}},Ca=e=>e.nodeType===8;function Tv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(v,_)=>{if(!_.hasChildNodes()){s(null,v,_),Ml(),_._vnode=v;return}u(_.firstChild,v,null,null,null),Ml(),_._vnode=v},u=(v,_,S,b,T,C=!1)=>{C=C||!!_.dynamicChildren;const R=Ca(v)&&v.data==="[",E=()=>x(v,_,S,b,T,R),{type:U,ref:P,shapeFlag:M,patchFlag:Z}=_;let te=v.nodeType;_.el=v,Z===-2&&(C=!1,_.dynamicChildren=null);let B=null;switch(U){case Mn:te!==3?_.children===""?(o(_.el=a(""),l(v),v),B=v):B=E():(v.data!==_.children&&(ga(),v.data=_.children),B=i(v));break;case vt:y(v)?(B=i(v),O(_.el=v.content.firstChild,v,S)):te!==8||R?B=E():B=i(v);break;case ea:if(R&&(v=i(v),te=v.nodeType),te===1||te===3){B=v;const L=!_.children.length;for(let N=0;N<_.staticCount;N++)L&&(_.children+=B.nodeType===1?B.outerHTML:B.data),N===_.staticCount-1&&(_.anchor=B),B=i(B);return R?i(B):B}else E();break;case Ot:R?B=g(v,_,S,b,T,C):B=E();break;default:if(M&1)(te!==1||_.type.toLowerCase()!==v.tagName.toLowerCase())&&!y(v)?B=E():B=p(v,_,S,b,T,C);else if(M&6){_.slotScopeIds=T;const L=l(v);if(R?B=I(v):Ca(v)&&v.data==="teleport start"?B=I(v,v.data,"teleport end"):B=i(v),t(_,L,null,S,b,ul(L),C),fn(_)&&!_.type.__asyncResolved){let N;R?(N=ut(Ot),N.anchor=B?B.previousSibling:L.lastChild):N=v.nodeType===3?vc(""):ut("div"),N.el=v,_.component.subTree=N}}else M&64?te!==8?B=E():B=_.type.hydrate(v,_,S,b,T,C,e,h):M&128&&(B=_.type.hydrate(v,_,S,b,ul(l(v)),T,C,e,u))}return P!=null&&La(P,null,b,_),B},p=(v,_,S,b,T,C)=>{C=C||!!_.dynamicChildren;const{type:R,props:E,patchFlag:U,shapeFlag:P,dirs:M,transition:Z}=_,te=R==="input"||R==="option";if(te||U!==-1){M&&zs(_,null,S,"created");let B=!1;if(y(v)){B=xp(null,Z)&&S&&S.vnode.props&&S.vnode.props.appear;const N=v.content.firstChild;if(B){const q=N.getAttribute("class");q&&(N.$cls=q),Z.beforeEnter(N)}O(N,v,S),_.el=v=N}if(P&16&&!(E&&(E.innerHTML||E.textContent))){let N=h(v.firstChild,_,v,S,b,T,C);for(N&&!fl(v,1)&&ga();N;){const q=N;N=N.nextSibling,r(q)}}else if(P&8){let N=_.children;N[0]===`
`&&(v.tagName==="PRE"||v.tagName==="TEXTAREA")&&(N=N.slice(1));const{textContent:q}=v;q!==N&&q!==N.replace(/\r\n|\r/g,`
`)&&(fl(v,0)||ga(),v.textContent=_.children)}if(E){if(te||!C||U&48){const N=v.tagName.includes("-");for(const q in E)(te&&(q.endsWith("value")||q==="indeterminate")||ra(q)&&!dn(q)||q[0]==="."||N&&!dn(q))&&n(v,q,null,E[q],void 0,S)}else if(E.onClick)n(v,"onClick",null,E.onClick,void 0,S);else if(U&4&&un(E.style))for(const N in E.style)E.style[N]}let L;(L=E&&E.onVnodeBeforeMount)&&ss(L,S,_),M&&zs(_,null,S,"beforeMount"),((L=E&&E.onVnodeMounted)||M||B)&&Sp(()=>{L&&ss(L,S,_),B&&Z.enter(v),M&&zs(_,null,S,"mounted")},b)}return v.nextSibling},h=(v,_,S,b,T,C,R)=>{R=R||!!_.dynamicChildren;const E=_.children,U=E.length;let P=!1;for(let M=0;M<U;M++){const Z=R?E[M]:E[M]=as(E[M]),te=Z.type===Mn;v?(te&&!R&&M+1<U&&as(E[M+1]).type===Mn&&(o(a(v.data.slice(Z.children.length)),S,i(v)),v.data=Z.children),v=u(v,Z,b,T,C,R)):te&&!Z.children?o(Z.el=a(""),S):(P||(P=!0,fl(S,1)||ga()),s(null,Z,S,null,b,T,ul(S),C))}return v},g=(v,_,S,b,T,C)=>{const{slotScopeIds:R}=_;R&&(T=T?T.concat(R):R);const E=l(v),U=h(i(v),_,E,S,b,T,C);return U&&Ca(U)&&U.data==="]"?i(_.anchor=U):(ga(),o(_.anchor=c("]"),E,U),U)},x=(v,_,S,b,T,C)=>{if(fl(v.parentElement,1)||ga(),_.el=null,C){const U=I(v);for(;;){const P=i(v);if(P&&P!==U)r(P);else break}}const R=i(v),E=l(v);return r(v),s(null,_,E,R,S,b,ul(E),T),S&&(S.vnode.el=_.el,wr(S,_.el)),R},I=(v,_="[",S="]")=>{let b=0;for(;v;)if(v=i(v),v&&Ca(v)&&(v.data===_&&b++,v.data===S)){if(b===0)return i(v);b--}return v},O=(v,_,S)=>{const b=_.parentNode;b&&b.replaceChild(v,_);let T=S;for(;T;)T.vnode.el===_&&(T.vnode.el=T.subTree.el=v),T=T.parent},y=v=>v.nodeType===1&&v.tagName==="TEMPLATE";return[d,u]}const bd="data-allow-mismatch",Cv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function fl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(bd);)e=e.parentElement;const s=e&&e.getAttribute(bd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Cv[t])}}const Ev=ur().requestIdleCallback||(e=>setTimeout(e,1)),Av=ur().cancelIdleCallback||(e=>clearTimeout(e)),Rv=(e=1e4)=>t=>{const s=Ev(t,{timeout:e});return()=>Av(s)};function Iv(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Ov=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Iv(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Lv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Nv=(e=[])=>(t,s)=>{Ne(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Dv(e,t){if(Ca(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ca(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const fn=e=>!!e.type.__asyncLoader;function Mv(e){Ae(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let g;return c||(g=c=t().catch(x=>{if(x=x instanceof Error?x:new Error(String(x)),o)return new Promise((I,O)=>{o(x,()=>I(p()),()=>O(x),u+1)});throw x}).then(x=>g!==c&&c?c:(x&&(x.__esModule||x[Symbol.toStringTag]==="Module")&&(x=x.default),d=x,x)))};return Wi({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(g,x,I){let O=!1;(x.bu||(x.bu=[])).push(()=>O=!0);const y=()=>{O||I()},v=i?()=>{const _=i(y,S=>Dv(g,S));_&&(x.bum||(x.bum=[])).push(_)}:y;d?v():h().then(()=>!x.isUnmounted&&v())},get __asyncResolved(){return d},setup(){const g=Dt;if(rc(g),d)return()=>pl(d,g);const x=S=>{c=null,da(S,g,13,!n)};if(r&&g.suspense||aa)return h().then(S=>()=>pl(S,g)).catch(S=>(x(S),()=>n?ut(n,{error:S}):null));const I=m(!1),O=m(),y=m(!!a);let v,_;return bt(()=>{v!=null&&clearTimeout(v),_!=null&&clearTimeout(_)}),a&&(_=setTimeout(()=>{g.isUnmounted||(y.value=!1)},a)),l!=null&&(v=setTimeout(()=>{if(!g.isUnmounted&&!I.value&&!O.value){const S=new Error(`Async component timed out after ${l}ms.`);x(S),O.value=S}},l)),h().then(()=>{g.isUnmounted||(I.value=!0,g.parent&&Zi(g.parent.vnode)&&g.parent.update())}).catch(S=>{if(g.isUnmounted){c=null;return}x(S),O.value=S}),()=>{if(I.value&&d)return pl(d,g);if(O.value&&n)return ut(n,{error:O.value});if(s&&!y.value)return pl(s,g)}}})}function pl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ut(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Zi=e=>e.type.__isKeepAlive,Pv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Qt(),n=s.ctx;if(!n.renderer)return()=>{const y=t.default&&t.default();return y&&y.length===1?y[0]:y};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(y,v,_,S,b)=>{const T=y.component;c(y,v,_,0,r),o(T.vnode,y,v,_,T,r,S,y.slotScopeIds,b),xt(()=>{T.isDeactivated=!1,T.a&&Ia(T.a);const C=y.props&&y.props.onVnodeMounted;C&&ss(C,T.parent,y)},r)},n.deactivate=y=>{const v=y.component;$l(v.m),$l(v.a),c(y,p,null,1,r),xt(()=>{v.da&&Ia(v.da);const _=y.props&&y.props.onVnodeUnmounted;_&&ss(_,v.parent,y),v.isDeactivated=!0},r)};function h(y){jr(y),d(y,s,r,!0)}function g(y){a.forEach((v,_)=>{const S=Co(fn(v)?v.type.__asyncResolved||{}:v.type);S&&!y(S)&&x(_)})}function x(y){const v=a.get(y);v&&(!l||!Ns(v,l))?h(v):l&&jr(l),a.delete(y),i.delete(y)}Yt(()=>[e.include,e.exclude],([y,v])=>{y&&g(_=>ui(y,_)),v&&g(_=>!ui(v,_))},{flush:"post",deep:!0});let I=null;const O=()=>{I!=null&&(Ul(s.subTree.type)?xt(()=>{a.set(I,hl(s.subTree))},s.subTree.suspense):a.set(I,hl(s.subTree)))};return qe(O),xr(O),_r(()=>{a.forEach(y=>{const{subTree:v,suspense:_}=s,S=hl(v);if(y.type===S.type&&y.key===S.key){jr(S);const b=S.component.da;b&&xt(b,_);return}h(y)})}),()=>{if(I=null,!t.default)return l=null;const y=t.default(),v=y[0];if(y.length>1)return l=null,y;if(!bn(v)||!(v.shapeFlag&4)&&!(v.shapeFlag&128))return l=null,v;let _=hl(v);if(_.type===vt)return l=null,_;const S=_.type,b=Co(fn(_)?_.type.__asyncResolved||{}:S),{include:T,exclude:C,max:R}=e;if(T&&(!b||!ui(T,b))||C&&b&&ui(C,b))return _.shapeFlag&=-257,l=_,v;const E=_.key==null?S:_.key,U=a.get(E);return _.el&&(_=Ws(_),v.shapeFlag&128&&(v.ssContent=_)),I=E,U?(_.el=U.el,_.component=U.component,_.transition&&vn(_,_.transition),_.shapeFlag|=512,i.delete(E),i.add(E)):(i.add(E),R&&i.size>parseInt(R,10)&&x(i.values().next().value)),_.shapeFlag|=256,l=_,Ul(v.type)?v:_}}},Fv=Pv;function ui(e,t){return me(e)?e.some(s=>ui(s,t)):Ne(e)?e.split(",").includes(t):Km(e)?(e.lastIndex=0,e.test(t)):!1}function Es(e,t){Jf(e,"a",t)}function As(e,t){Jf(e,"da",t)}function Jf(e,t,s=Dt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(yr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Zi(a.parent.vnode)&&$v(n,t,s,a),a=a.parent}}function $v(e,t,s,n){const a=yr(t,e,n,!0);bt(()=>{Wo(n[t],a)},s)}function jr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function hl(e){return e.shapeFlag&128?e.ssContent:e}function yr(e,t,s=Dt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{mn();const r=Ya(s),o=ps(t,s,e,l);return r(),gn(),o});return n?a.unshift(i):a.push(i),i}}const yn=e=>(t,s=Dt)=>{(!aa||e==="sp")&&yr(e,(...n)=>t(...n),s)},Yf=yn("bm"),qe=yn("m"),oc=yn("bu"),xr=yn("u"),_r=yn("bum"),bt=yn("um"),Qf=yn("sp"),Xf=yn("rtg"),ep=yn("rtc");function tp(e,t=Dt){yr("ec",e,t)}const cc="components",Uv="directives";function Bv(e,t){return dc(cc,e,!0,t)||e}const sp=Symbol.for("v-ndc");function Hv(e){return Ne(e)?dc(cc,e,!1)||e:e||sp}function Vv(e){return dc(Uv,e)}function dc(e,t,s=!0,n=!1){const a=Mt||Dt;if(a){const i=a.type;if(e===cc){const r=Co(i,!1);if(r&&(r===t||r===nt(t)||r===ca(nt(t))))return i}const l=yd(a[e]||i[e],t)||yd(a.appContext[e],t);return!l&&n?i:l}}function yd(e,t){return e&&(e[t]||e[nt(t)]||e[ca(nt(t))])}function jv(e,t,s,n){let a;const i=s&&s[n],l=me(e);if(l||Ne(e)){const r=l&&un(e);let o=!1,c=!1;r&&(o=!rs(e),c=Ks(e),e=hr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Fa(Ps(e[d])):Ps(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Je(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function zv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(me(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function qv(e,t,s={},n,a){if(Mt.ce||Mt.parent&&fn(Mt.parent)&&Mt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Di(),Bl(Ot,null,[ut("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Di();const l=i&&uc(i(s)),r=s.key||l&&l.key,o=Bl(Ot,{key:(r&&!qt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function uc(e){return e.some(t=>bn(t)?!(t.type===vt||t.type===Ot&&!uc(t.children)):!0)?e:null}function Gv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ra(n)]=e[n];return s}const bo=e=>e?Lp(e)?Ji(e):bo(e.parent):null,bi=Ue(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>bo(e.parent),$root:e=>bo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>fc(e),$forceUpdate:e=>e.f||(e.f=()=>{nc(e.update)}),$nextTick:e=>e.n||(e.n=Ct.bind(e.proxy)),$watch:e=>mv.bind(e)}),zr=(e,t)=>e!==Be&&!e.__isScriptSetup&&Ye(e,t),yo={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(zr(n,t))return l[t]=1,n[t];if(a!==Be&&Ye(a,t))return l[t]=2,a[t];if(Ye(i,t))return l[t]=3,i[t];if(s!==Be&&Ye(s,t))return l[t]=4,s[t];xo&&(l[t]=0)}}const c=bi[t];let d,u;if(c)return t==="$attrs"&&Vt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Be&&Ye(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,Ye(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return zr(a,t)?(a[t]=s,!0):n!==Be&&Ye(n,t)?(n[t]=s,!0):Ye(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Be&&r[0]!=="$"&&Ye(e,r)||zr(t,r)||Ye(i,r)||Ye(n,r)||Ye(bi,r)||Ye(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:Ye(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},Kv=Ue({},yo,{get(e,t){if(t!==Symbol.unscopables)return yo.get(e,t,e)},has(e,t){return t[0]!=="_"&&!eg(t)}});function Wv(){return null}function Zv(){return null}function Jv(e){}function Yv(e){}function Qv(){return null}function Xv(){}function eb(e,t){return null}function tb(){return np().slots}function sb(){return np().attrs}function np(e){const t=Qt();return t.setupContext||(t.setupContext=Pp(t))}function Li(e){return me(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function nb(e,t){const s=Li(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?me(a)||Ae(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function ab(e,t){return!e||!t?e||t:me(e)&&me(t)?e.concat(t):Ue({},Li(e),Li(t))}function ib(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function lb(e){const t=Qt(),s=aa;let n=e();Pi(),s&&Da(!1);const a=()=>{Ya(t),s&&Da(!0)},i=()=>{Qt()!==t&&t.scope.off(),Pi(),s&&Da(!1)};return Zo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let xo=!0;function rb(e){const t=fc(e),s=e.proxy,n=e.ctx;xo=!1,t.beforeCreate&&xd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:g,activated:x,deactivated:I,beforeDestroy:O,beforeUnmount:y,destroyed:v,unmounted:_,render:S,renderTracked:b,renderTriggered:T,errorCaptured:C,serverPrefetch:R,expose:E,inheritAttrs:U,components:P,directives:M,filters:Z}=t;if(c&&ob(c,n,null),l)for(const L in l){const N=l[L];Ae(N)&&(n[L]=N.bind(s))}if(a){const L=a.call(s,s);Je(L)&&(e.data=$n(L))}if(xo=!0,i)for(const L in i){const N=i[L],q=Ae(N)?N.bind(s,s):Ae(N.get)?N.get.bind(s,s):Pt,_e=!Ae(N)&&Ae(N.set)?N.set.bind(s):Pt,ve=W({get:q,set:_e});Object.defineProperty(n,L,{enumerable:!0,configurable:!0,get:()=>ve.value,set:le=>ve.value=le})}if(r)for(const L in r)ap(r[L],n,s,L);if(o){const L=Ae(o)?o.call(s):o;Reflect.ownKeys(L).forEach(N=>{vi(N,L[N])})}d&&xd(d,e,"c");function B(L,N){me(N)?N.forEach(q=>L(q.bind(s))):N&&L(N.bind(s))}if(B(Yf,u),B(qe,p),B(oc,h),B(xr,g),B(Es,x),B(As,I),B(tp,C),B(ep,b),B(Xf,T),B(_r,y),B(bt,_),B(Qf,R),me(E))if(E.length){const L=e.exposed||(e.exposed={});E.forEach(N=>{Object.defineProperty(L,N,{get:()=>s[N],set:q=>s[N]=q,enumerable:!0})})}else e.exposed||(e.exposed={});S&&e.render===Pt&&(e.render=S),U!=null&&(e.inheritAttrs=U),P&&(e.components=P),M&&(e.directives=M),R&&rc(e)}function ob(e,t,s=Pt){me(e)&&(e=_o(e));for(const n in e){const a=e[n];let i;Je(a)?"default"in a?i=Ss(a.from||n,a.default,!0):i=Ss(a.from||n):i=Ss(a),kt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function xd(e,t,s){ps(me(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function ap(e,t,s,n){let a=n.includes(".")?jf(s,n):()=>s[n];if(Ne(e)){const i=t[e];Ae(i)&&Yt(a,i)}else if(Ae(e))Yt(a,e.bind(s));else if(Je(e))if(me(e))e.forEach(i=>ap(i,t,s,n));else{const i=Ae(e.handler)?e.handler.bind(s):t[e.handler];Ae(i)&&Yt(a,i,e)}}function fc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Fl(o,c,l,!0)),Fl(o,t,l)),Je(t)&&i.set(t,o),o}function Fl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Fl(e,i,s,!0),a&&a.forEach(l=>Fl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=cb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const cb={data:_d,props:kd,emits:kd,methods:fi,computed:fi,beforeCreate:Gt,created:Gt,beforeMount:Gt,mounted:Gt,beforeUpdate:Gt,updated:Gt,beforeDestroy:Gt,beforeUnmount:Gt,destroyed:Gt,unmounted:Gt,activated:Gt,deactivated:Gt,errorCaptured:Gt,serverPrefetch:Gt,components:fi,directives:fi,watch:ub,provide:_d,inject:db};function _d(e,t){return t?e?function(){return Ue(Ae(e)?e.call(this,this):e,Ae(t)?t.call(this,this):t)}:t:e}function db(e,t){return fi(_o(e),_o(t))}function _o(e){if(me(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Gt(e,t){return e?[...new Set([].concat(e,t))]:t}function fi(e,t){return e?Ue(Object.create(null),e,t):t}function kd(e,t){return e?me(e)&&me(t)?[...new Set([...e,...t])]:Ue(Object.create(null),Li(e),Li(t??{})):t}function ub(e,t){if(!e)return t;if(!t)return e;const s=Ue(Object.create(null),e);for(const n in t)s[n]=Gt(e[n],t[n]);return s}function ip(){return{app:null,config:{isNativeTag:Ta,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let fb=0;function pb(e,t){return function(n,a=null){Ae(n)||(n=Ue({},n)),a!=null&&!Je(a)&&(a=null);const i=ip(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:fb++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:$p,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ae(d.install)?(l.add(d),d.install(c,...u)):Ae(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const h=c._ceVNode||ut(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),o=!0,c._container=d,d.__vue_app__=c,Ji(h.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ps(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Xn;Xn=c;try{return d()}finally{Xn=u}}};return c}}let Xn=null;function hb(e,t,s=Be){const n=Qt(),a=nt(t),i=is(t),l=lp(e,a),r=Lf((o,c)=>{let d,u=Be,p;return Vf(()=>{const h=e[a];It(d,h)&&(d=h,c())}),{get(){return o(),s.get?s.get(d):d},set(h){const g=s.set?s.set(h):h;if(!It(g,d)&&!(u!==Be&&It(h,u)))return;const x=n.vnode.props,I=!!(x&&(t in x||a in x||i in x)&&(`onUpdate:${t}`in x||`onUpdate:${a}`in x||`onUpdate:${i}`in x));I||(d=h,c()),n.emit(`update:${t}`,g),It(h,u)&&(It(h,g)&&!It(g,p)||I&&u!==Be&&!It(g,d))&&c(),u=h,p=g}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Be:r,done:!1}:{done:!0}}}},r}const lp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${nt(t)}Modifiers`]||e[`${is(t)}Modifiers`];function mb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Be;let a=s;const i=t.startsWith("update:"),l=i&&lp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Ne(d)?d.trim():d)),l.number&&(a=s.map(dr)));let r,o=n[r=Ra(t)]||n[r=Ra(nt(t))];!o&&i&&(o=n[r=Ra(is(t))]),o&&ps(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ps(c,e,6,a)}}const gb=new WeakMap;function rp(e,t,s=!1){const n=s?gb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ae(e)){const o=c=>{const d=rp(c,t,!0);d&&(r=!0,Ue(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Je(e)&&n.set(e,null),null):(me(i)?i.forEach(o=>l[o]=null):Ue(l,i),Je(e)&&n.set(e,l),l)}function kr(e,t){return!e||!ra(t)?!1:(t=t.slice(2).replace(/Once$/,""),Ye(e,t[0].toLowerCase()+t.slice(1))||Ye(e,is(t))||Ye(e,t))}function wl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:g,inheritAttrs:x}=e,I=Oi(e);let O,y;try{if(s.shapeFlag&4){const _=a||n,S=_;O=as(c.call(S,_,d,u,h,p,g)),y=r}else{const _=t;O=as(_.length>1?_(u,{attrs:r,slots:l,emit:o}):_(u,null)),y=t.props?r:bb(r)}}catch(_){yi.length=0,da(_,e,1),O=ut(vt)}let v=O;if(y&&x!==!1){const _=Object.keys(y),{shapeFlag:S}=v;_.length&&S&7&&(i&&_.some(lr)&&(y=yb(y,i)),v=Ws(v,y,!1,!0))}return s.dirs&&(v=Ws(v,null,!1,!0),v.dirs=v.dirs?v.dirs.concat(s.dirs):s.dirs),s.transition&&vn(v,s.transition),O=v,Oi(I),O}function vb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(bn(a)){if(a.type!==vt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const bb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ra(s))&&((t||(t={}))[s]=e[s]);return t},yb=(e,t)=>{const s={};for(const n in e)(!lr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function xb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?wd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(op(l,n,p)&&!kr(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?wd(n,l,c):!0:!!l;return!1}function wd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(op(t,e,i)&&!kr(s,i))return!0}return!1}function op(e,t,s){const n=e[s],a=t[s];return s==="style"&&Je(n)&&Je(a)?!hn(n,a):n!==a}function wr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const cp={},dp=()=>Object.create(cp),up=e=>Object.getPrototypeOf(e)===cp;function _b(e,t,s,n=!1){const a={},i=dp();e.propsDefaults=Object.create(null),fp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ec(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function kb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ke(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(kr(e.emitsOptions,p))continue;const h=t[p];if(o)if(Ye(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const g=nt(p);a[g]=ko(o,r,g,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{fp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!Ye(t,u)&&((d=is(u))===u||!Ye(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=ko(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!Ye(t,u))&&(delete i[u],c=!0)}c&&an(e.attrs,"set","")}function fp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(dn(o))continue;const c=t[o];let d;a&&Ye(a,d=nt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:kr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ke(s),c=r||Be;for(let d=0;d<i.length;d++){const u=i[d];s[u]=ko(a,o,u,c[u],e,!Ye(c,u))}}return l}function ko(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=Ye(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ae(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ya(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===is(s))&&(n=!0))}return n}const wb=new WeakMap;function pp(e,t,s=!1){const n=s?wb:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ae(e)){const d=u=>{o=!0;const[p,h]=pp(u,t,!0);Ue(l,p),h&&r.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Je(e)&&n.set(e,Ea),Ea;if(me(i))for(let d=0;d<i.length;d++){const u=nt(i[d]);Sd(u)&&(l[u]=Be)}else if(i)for(const d in i){const u=nt(d);if(Sd(u)){const p=i[d],h=l[u]=me(p)||Ae(p)?{type:p}:Ue({},p),g=h.type;let x=!1,I=!0;if(me(g))for(let O=0;O<g.length;++O){const y=g[O],v=Ae(y)&&y.name;if(v==="Boolean"){x=!0;break}else v==="String"&&(I=!1)}else x=Ae(g)&&g.name==="Boolean";h[0]=x,h[1]=I,(x||Ye(h,"default"))&&r.push(u)}}const c=[l,r];return Je(e)&&n.set(e,c),c}function Sd(e){return e[0]!=="$"&&!dn(e)}const pc=e=>e==="_"||e==="_ctx"||e==="$stable",hc=e=>me(e)?e.map(as):[as(e)],Sb=(e,t,s)=>{if(t._n)return t;const n=ac((...a)=>hc(t(...a)),s);return n._c=!1,n},hp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(pc(a))continue;const i=e[a];if(Ae(i))t[a]=Sb(a,i,n);else if(i!=null){const l=hc(i);t[a]=()=>l}}},mp=(e,t)=>{const s=hc(t);e.slots.default=()=>s},gp=(e,t,s)=>{for(const n in t)(s||!pc(n))&&(e[n]=t[n])},Tb=(e,t,s)=>{const n=e.slots=dp();if(e.vnode.shapeFlag&32){const a=t._;a?(gp(n,t,s),s&&of(n,"_",a,!0)):hp(t,n)}else t&&mp(e,t)},Cb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Be;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:gp(a,t,s):(i=!t.$stable,hp(t,a)),l=t}else t&&(mp(e,t),l={default:1});if(i)for(const r in a)!pc(r)&&l[r]==null&&delete a[r]},xt=Sp;function vp(e){return yp(e)}function bp(e){return yp(e,Tv)}function yp(e,t){const s=ur();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Pt,insertStaticContent:g}=e,x=(k,A,$,Y=null,G=null,J=null,ie=void 0,ne=null,se=!!A.dynamicChildren)=>{if(k===A)return;k&&!Ns(k,A)&&(Y=H(k),le(k,G,J,!0),k=null),A.patchFlag===-2&&(se=!1,A.dynamicChildren=null);const{type:X,ref:be,shapeFlag:ce}=A;switch(X){case Mn:I(k,A,$,Y);break;case vt:O(k,A,$,Y);break;case ea:k==null&&y(A,$,Y,ie);break;case Ot:P(k,A,$,Y,G,J,ie,ne,se);break;default:ce&1?S(k,A,$,Y,G,J,ie,ne,se):ce&6?M(k,A,$,Y,G,J,ie,ne,se):(ce&64||ce&128)&&X.process(k,A,$,Y,G,J,ie,ne,se,ge)}be!=null&&G?La(be,k&&k.ref,J,A||k,!A):be==null&&k&&k.ref!=null&&La(k.ref,null,J,k,!0)},I=(k,A,$,Y)=>{if(k==null)n(A.el=r(A.children),$,Y);else{const G=A.el=k.el;A.children!==k.children&&c(G,A.children)}},O=(k,A,$,Y)=>{k==null?n(A.el=o(A.children||""),$,Y):A.el=k.el},y=(k,A,$,Y)=>{[k.el,k.anchor]=g(k.children,A,$,Y,k.el,k.anchor)},v=({el:k,anchor:A},$,Y)=>{let G;for(;k&&k!==A;)G=p(k),n(k,$,Y),k=G;n(A,$,Y)},_=({el:k,anchor:A})=>{let $;for(;k&&k!==A;)$=p(k),a(k),k=$;a(A)},S=(k,A,$,Y,G,J,ie,ne,se)=>{if(A.type==="svg"?ie="svg":A.type==="math"&&(ie="mathml"),k==null)b(A,$,Y,G,J,ie,ne,se);else{const X=k.el&&k.el._isVueCE?k.el:null;try{X&&X._beginPatch(),R(k,A,G,J,ie,ne,se)}finally{X&&X._endPatch()}}},b=(k,A,$,Y,G,J,ie,ne)=>{let se,X;const{props:be,shapeFlag:ce,transition:ue,dirs:ke}=k;if(se=k.el=l(k.type,J,be&&be.is,be),ce&8?d(se,k.children):ce&16&&C(k.children,se,null,Y,G,qr(k,J),ie,ne),ke&&zs(k,null,Y,"created"),T(se,k,k.scopeId,ie,Y),be){for(const Ce in be)Ce!=="value"&&!dn(Ce)&&i(se,Ce,null,be[Ce],J,Y);"value"in be&&i(se,"value",null,be.value,J),(X=be.onVnodeBeforeMount)&&ss(X,Y,k)}ke&&zs(k,null,Y,"beforeMount");const Te=xp(G,ue);Te&&ue.beforeEnter(se),n(se,A,$),((X=be&&be.onVnodeMounted)||Te||ke)&&xt(()=>{try{X&&ss(X,Y,k),Te&&ue.enter(se),ke&&zs(k,null,Y,"mounted")}finally{}},G)},T=(k,A,$,Y,G)=>{if($&&h(k,$),Y)for(let J=0;J<Y.length;J++)h(k,Y[J]);if(G){let J=G.subTree;if(A===J||Ul(J.type)&&(J.ssContent===A||J.ssFallback===A)){const ie=G.vnode;T(k,ie,ie.scopeId,ie.slotScopeIds,G.parent)}}},C=(k,A,$,Y,G,J,ie,ne,se=0)=>{for(let X=se;X<k.length;X++){const be=k[X]=ne?sn(k[X]):as(k[X]);x(null,be,A,$,Y,G,J,ie,ne)}},R=(k,A,$,Y,G,J,ie)=>{const ne=A.el=k.el;let{patchFlag:se,dynamicChildren:X,dirs:be}=A;se|=k.patchFlag&16;const ce=k.props||Be,ue=A.props||Be;let ke;if($&&jn($,!1),(ke=ue.onVnodeBeforeUpdate)&&ss(ke,$,A,k),be&&zs(A,k,$,"beforeUpdate"),$&&jn($,!0),(ce.innerHTML&&ue.innerHTML==null||ce.textContent&&ue.textContent==null)&&d(ne,""),X?E(k.dynamicChildren,X,ne,$,Y,qr(A,G),J):ie||N(k,A,ne,null,$,Y,qr(A,G),J,!1),se>0){if(se&16)U(ne,ce,ue,$,G);else if(se&2&&ce.class!==ue.class&&i(ne,"class",null,ue.class,G),se&4&&i(ne,"style",ce.style,ue.style,G),se&8){const Te=A.dynamicProps;for(let Ce=0;Ce<Te.length;Ce++){const Ie=Te[Ce],Pe=ce[Ie],$e=ue[Ie];($e!==Pe||Ie==="value")&&i(ne,Ie,Pe,$e,G,$)}}se&1&&k.children!==A.children&&d(ne,A.children)}else!ie&&X==null&&U(ne,ce,ue,$,G);((ke=ue.onVnodeUpdated)||be)&&xt(()=>{ke&&ss(ke,$,A,k),be&&zs(A,k,$,"updated")},Y)},E=(k,A,$,Y,G,J,ie)=>{for(let ne=0;ne<A.length;ne++){const se=k[ne],X=A[ne],be=se.el&&(se.type===Ot||!Ns(se,X)||se.shapeFlag&198)?u(se.el):$;x(se,X,be,null,Y,G,J,ie,!0)}},U=(k,A,$,Y,G)=>{if(A!==$){if(A!==Be)for(const J in A)!dn(J)&&!(J in $)&&i(k,J,A[J],null,G,Y);for(const J in $){if(dn(J))continue;const ie=$[J],ne=A[J];ie!==ne&&J!=="value"&&i(k,J,ne,ie,G,Y)}"value"in $&&i(k,"value",A.value,$.value,G)}},P=(k,A,$,Y,G,J,ie,ne,se)=>{const X=A.el=k?k.el:r(""),be=A.anchor=k?k.anchor:r("");let{patchFlag:ce,dynamicChildren:ue,slotScopeIds:ke}=A;ke&&(ne=ne?ne.concat(ke):ke),k==null?(n(X,$,Y),n(be,$,Y),C(A.children||[],$,be,G,J,ie,ne,se)):ce>0&&ce&64&&ue&&k.dynamicChildren&&k.dynamicChildren.length===ue.length?(E(k.dynamicChildren,ue,$,G,J,ie,ne),(A.key!=null||G&&A===G.subTree)&&mc(k,A,!0)):N(k,A,$,be,G,J,ie,ne,se)},M=(k,A,$,Y,G,J,ie,ne,se)=>{A.slotScopeIds=ne,k==null?A.shapeFlag&512?G.ctx.activate(A,$,Y,ie,se):Z(A,$,Y,G,J,ie,se):te(k,A,se)},Z=(k,A,$,Y,G,J,ie)=>{const ne=k.component=Op(k,Y,G);if(Zi(k)&&(ne.ctx.renderer=ge),Np(ne,!1,ie),ne.asyncDep){if(G&&G.registerDep(ne,B,ie),!k.el){const se=ne.subTree=ut(vt);O(null,se,A,$),k.placeholder=se.el}}else B(ne,k,A,$,G,J,ie)},te=(k,A,$)=>{const Y=A.component=k.component;if(xb(k,A,$))if(Y.asyncDep&&!Y.asyncResolved){L(Y,A,$);return}else Y.next=A,Y.update();else A.el=k.el,Y.vnode=A},B=(k,A,$,Y,G,J,ie)=>{const ne=()=>{if(k.isMounted){let{next:ce,bu:ue,u:ke,parent:Te,vnode:Ce}=k;{const j=_p(k);if(j){ce&&(ce.el=Ce.el,L(k,ce,ie)),j.asyncDep.then(()=>{xt(()=>{k.isUnmounted||X()},G)});return}}let Ie=ce,Pe;jn(k,!1),ce?(ce.el=Ce.el,L(k,ce,ie)):ce=Ce,ue&&Ia(ue),(Pe=ce.props&&ce.props.onVnodeBeforeUpdate)&&ss(Pe,Te,ce,Ce),jn(k,!0);const $e=wl(k),Xe=k.subTree;k.subTree=$e,x(Xe,$e,u(Xe.el),H(Xe),k,G,J),ce.el=$e.el,Ie===null&&wr(k,$e.el),ke&&xt(ke,G),(Pe=ce.props&&ce.props.onVnodeUpdated)&&xt(()=>ss(Pe,Te,ce,Ce),G)}else{let ce;const{el:ue,props:ke}=A,{bm:Te,m:Ce,parent:Ie,root:Pe,type:$e}=k,Xe=fn(A);if(jn(k,!1),Te&&Ia(Te),!Xe&&(ce=ke&&ke.onVnodeBeforeMount)&&ss(ce,Ie,A),jn(k,!0),ue&&De){const j=()=>{k.subTree=wl(k),De(ue,k.subTree,k,G,null)};Xe&&$e.__asyncHydrate?$e.__asyncHydrate(ue,k,j):j()}else{Pe.ce&&Pe.ce._hasShadowRoot()&&Pe.ce._injectChildStyle($e,k.parent?k.parent.type:void 0);const j=k.subTree=wl(k);x(null,j,$,Y,k,G,J),A.el=j.el}if(Ce&&xt(Ce,G),!Xe&&(ce=ke&&ke.onVnodeMounted)){const j=A;xt(()=>ss(ce,Ie,j),G)}(A.shapeFlag&256||Ie&&fn(Ie.vnode)&&Ie.vnode.shapeFlag&256)&&k.a&&xt(k.a,G),k.isMounted=!0,A=$=Y=null}};k.scope.on();const se=k.effect=new Ci(ne);k.scope.off();const X=k.update=se.run.bind(se),be=k.job=se.runIfDirty.bind(se);be.i=k,be.id=k.uid,se.scheduler=()=>nc(be),jn(k,!0),X()},L=(k,A,$)=>{A.component=k;const Y=k.vnode.props;k.vnode=A,k.next=null,kb(k,A.props,Y,$),Cb(k,A.children,$),mn(),ud(k),gn()},N=(k,A,$,Y,G,J,ie,ne,se=!1)=>{const X=k&&k.children,be=k?k.shapeFlag:0,ce=A.children,{patchFlag:ue,shapeFlag:ke}=A;if(ue>0){if(ue&128){_e(X,ce,$,Y,G,J,ie,ne,se);return}else if(ue&256){q(X,ce,$,Y,G,J,ie,ne,se);return}}ke&8?(be&16&&xe(X,G,J),ce!==X&&d($,ce)):be&16?ke&16?_e(X,ce,$,Y,G,J,ie,ne,se):xe(X,G,J,!0):(be&8&&d($,""),ke&16&&C(ce,$,Y,G,J,ie,ne,se))},q=(k,A,$,Y,G,J,ie,ne,se)=>{k=k||Ea,A=A||Ea;const X=k.length,be=A.length,ce=Math.min(X,be);let ue;for(ue=0;ue<ce;ue++){const ke=A[ue]=se?sn(A[ue]):as(A[ue]);x(k[ue],ke,$,null,G,J,ie,ne,se)}X>be?xe(k,G,J,!0,!1,ce):C(A,$,Y,G,J,ie,ne,se,ce)},_e=(k,A,$,Y,G,J,ie,ne,se)=>{let X=0;const be=A.length;let ce=k.length-1,ue=be-1;for(;X<=ce&&X<=ue;){const ke=k[X],Te=A[X]=se?sn(A[X]):as(A[X]);if(Ns(ke,Te))x(ke,Te,$,null,G,J,ie,ne,se);else break;X++}for(;X<=ce&&X<=ue;){const ke=k[ce],Te=A[ue]=se?sn(A[ue]):as(A[ue]);if(Ns(ke,Te))x(ke,Te,$,null,G,J,ie,ne,se);else break;ce--,ue--}if(X>ce){if(X<=ue){const ke=ue+1,Te=ke<be?A[ke].el:Y;for(;X<=ue;)x(null,A[X]=se?sn(A[X]):as(A[X]),$,Te,G,J,ie,ne,se),X++}}else if(X>ue)for(;X<=ce;)le(k[X],G,J,!0),X++;else{const ke=X,Te=X,Ce=new Map;for(X=Te;X<=ue;X++){const Le=A[X]=se?sn(A[X]):as(A[X]);Le.key!=null&&Ce.set(Le.key,X)}let Ie,Pe=0;const $e=ue-Te+1;let Xe=!1,j=0;const ye=new Array($e);for(X=0;X<$e;X++)ye[X]=0;for(X=ke;X<=ce;X++){const Le=k[X];if(Pe>=$e){le(Le,G,J,!0);continue}let He;if(Le.key!=null)He=Ce.get(Le.key);else for(Ie=Te;Ie<=ue;Ie++)if(ye[Ie-Te]===0&&Ns(Le,A[Ie])){He=Ie;break}He===void 0?le(Le,G,J,!0):(ye[He-Te]=X+1,He>=j?j=He:Xe=!0,x(Le,A[He],$,null,G,J,ie,ne,se),Pe++)}const Re=Xe?Eb(ye):Ea;for(Ie=Re.length-1,X=$e-1;X>=0;X--){const Le=Te+X,He=A[Le],Ve=A[Le+1],ft=Le+1<be?Ve.el||kp(Ve):Y;ye[X]===0?x(null,He,$,ft,G,J,ie,ne,se):Xe&&(Ie<0||X!==Re[Ie]?ve(He,$,ft,2):Ie--)}}},ve=(k,A,$,Y,G=null)=>{const{el:J,type:ie,transition:ne,children:se,shapeFlag:X}=k;if(X&6){ve(k.component.subTree,A,$,Y);return}if(X&128){k.suspense.move(A,$,Y);return}if(X&64){ie.move(k,A,$,ge);return}if(ie===Ot){n(J,A,$);for(let ce=0;ce<se.length;ce++)ve(se[ce],A,$,Y);n(k.anchor,A,$);return}if(ie===ea){v(k,A,$);return}if(Y!==2&&X&1&&ne)if(Y===0)ne.persisted&&!J[_s]?n(J,A,$):(ne.beforeEnter(J),n(J,A,$),xt(()=>ne.enter(J),G));else{const{leave:ce,delayLeave:ue,afterLeave:ke}=ne,Te=()=>{k.ctx.isUnmounted?a(J):n(J,A,$)},Ce=()=>{const Ie=J._isLeaving||!!J[_s];J._isLeaving&&J[_s](!0),ne.persisted&&!Ie?Te():ce(J,()=>{Te(),ke&&ke()})};ue?ue(J,Te,Ce):Ce()}else n(J,A,$)},le=(k,A,$,Y=!1,G=!1)=>{const{type:J,props:ie,ref:ne,children:se,dynamicChildren:X,shapeFlag:be,patchFlag:ce,dirs:ue,cacheIndex:ke,memo:Te}=k;if(ce===-2&&(G=!1),ne!=null&&(mn(),La(ne,null,$,k,!0),gn()),ke!=null&&(A.renderCache[ke]=void 0),be&256){A.ctx.deactivate(k);return}const Ce=be&1&&ue,Ie=!fn(k);let Pe;if(Ie&&(Pe=ie&&ie.onVnodeBeforeUnmount)&&ss(Pe,A,k),be&6)ee(k.component,$,Y);else{if(be&128){k.suspense.unmount($,Y);return}Ce&&zs(k,null,A,"beforeUnmount"),be&64?k.type.remove(k,A,$,ge,Y):X&&!X.hasOnce&&(J!==Ot||ce>0&&ce&64)?xe(X,A,$,!1,!0):(J===Ot&&ce&384||!G&&be&16)&&xe(se,A,$),Y&&pe(k)}const $e=Te!=null&&ke==null;(Ie&&(Pe=ie&&ie.onVnodeUnmounted)||Ce||$e)&&xt(()=>{Pe&&ss(Pe,A,k),Ce&&zs(k,null,A,"unmounted"),$e&&(k.el=null)},$)},pe=k=>{const{type:A,el:$,anchor:Y,transition:G}=k;if(A===Ot){F($,Y);return}if(A===ea){_(k);return}const J=()=>{a($),G&&!G.persisted&&G.afterLeave&&G.afterLeave()};if(k.shapeFlag&1&&G&&!G.persisted){const{leave:ie,delayLeave:ne}=G,se=()=>ie($,J);ne?ne(k.el,J,se):se()}else J()},F=(k,A)=>{let $;for(;k!==A;)$=p(k),a(k),k=$;a(A)},ee=(k,A,$)=>{const{bum:Y,scope:G,job:J,subTree:ie,um:ne,m:se,a:X}=k;$l(se),$l(X),Y&&Ia(Y),G.stop(),J&&(J.flags|=8,le(ie,k,A,$)),ne&&xt(ne,A),xt(()=>{k.isUnmounted=!0},A)},xe=(k,A,$,Y=!1,G=!1,J=0)=>{for(let ie=J;ie<k.length;ie++)le(k[ie],A,$,Y,G)},H=k=>{if(k.shapeFlag&6)return H(k.component.subTree);if(k.shapeFlag&128)return k.suspense.next();const A=p(k.anchor||k.el),$=A&&A[zf];return $?p($):A};let oe=!1;const re=(k,A,$)=>{let Y;k==null?A._vnode&&(le(A._vnode,null,null,!0),Y=A._vnode.component):x(A._vnode||null,k,A,null,null,null,$),A._vnode=k,oe||(oe=!0,ud(Y),Ml(),oe=!1)},ge={p:x,um:le,m:ve,r:pe,mt:Z,mc:C,pc:N,pbc:E,n:H,o:e};let he,De;return t&&([he,De]=t(ge)),{render:re,hydrate:he,createApp:pb(re,he)}}function qr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function jn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function xp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function mc(e,t,s=!1){const n=e.children,a=t.children;if(me(n)&&me(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=sn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&mc(l,r)),r.type===Mn&&(r.patchFlag===-1&&(r=a[i]=sn(r)),r.el=l.el),r.type===vt&&!r.el&&(r.el=l.el)}}function Eb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function _p(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:_p(t)}function $l(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function kp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?kp(t.subTree):null}const Ul=e=>e.__isSuspense;let wo=0;const Ab={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Ib(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Ob(e,t,s,n,a,l,r,o,c)}},hydrate:Lb,normalize:Nb},Rb=Ab;function Ni(e,t){const s=e.props&&e.props[t];Ae(s)&&s()}function Ib(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=wp(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Ni(e,"onPending"),Ni(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),Na(p,e.ssFallback)):p.resolve(!1,!0)}function Ob(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:g,pendingBranch:x,isInFallback:I,isHydrating:O}=u;if(x)u.pendingBranch=p,Ns(x,p)?(o(x,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():I&&(O||(o(g,h,s,n,a,null,i,l,r),Na(u,h)))):(u.pendingId=wo++,O?(u.isHydrating=!1,u.activeBranch=x):c(x,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),I?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(g,h,s,n,a,null,i,l,r),Na(u,h))):g&&Ns(g,p)?(o(g,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(g&&Ns(g,p))o(g,p,s,n,a,u,i,l,r),Na(u,p);else if(Ni(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=wo++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:y,pendingId:v}=u;y>0?setTimeout(()=>{u.pendingId===v&&u.fallback(h)},y):y===0&&u.fallback(h)}}function wp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:h,n:g,o:{parentNode:x,remove:I}}=c;let O;const y=Db(e);y&&t&&t.pendingBranch&&(O=t.pendingId,t.deps++);const v=e.props?Il(e.props.timeout):void 0,_=i,S={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:wo++,timeout:typeof v=="number"?v:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(b=!1,T=!1){const{vnode:C,activeBranch:R,pendingBranch:E,pendingId:U,effects:P,parentComponent:M,container:Z,isInFallback:te}=S;let B=!1;if(S.isHydrating)S.isHydrating=!1;else if(!b){B=R&&E.transition&&E.transition.mode==="out-in";let q=!1;B&&(R.transition.afterLeave=()=>{U===S.pendingId&&(p(E,Z,i===_&&!q?g(R):i,0),Ri(P),te&&C.ssFallback&&(C.ssFallback.el=null))}),R&&!S.isFallbackMountPending&&(x(R.el)===Z&&(i=g(R),q=!0),h(R,M,S,!0),!B&&te&&C.ssFallback&&xt(()=>C.ssFallback.el=null,S)),B||p(E,Z,i,0)}S.isFallbackMountPending=!1,Na(S,E),S.pendingBranch=null,S.isInFallback=!1;let L=S.parent,N=!1;for(;L;){if(L.pendingBranch){L.effects.push(...P),N=!0;break}L=L.parent}!N&&!B&&Ri(P),S.effects=[],y&&t&&t.pendingBranch&&O===t.pendingId&&(t.deps--,t.deps===0&&!T&&t.resolve()),Ni(C,"onResolve")},fallback(b){if(!S.pendingBranch)return;const{vnode:T,activeBranch:C,parentComponent:R,container:E,namespace:U}=S;Ni(T,"onFallback");const P=g(C),M=()=>{S.isFallbackMountPending=!1,S.isInFallback&&(u(null,b,E,P,R,null,U,r,o),Na(S,b))},Z=b.transition&&b.transition.mode==="out-in";Z&&(S.isFallbackMountPending=!0,C.transition.afterLeave=M),S.isInFallback=!0,h(C,R,null,!0),Z||M()},move(b,T,C){S.activeBranch&&p(S.activeBranch,b,T,C),S.container=b},next(){return S.activeBranch&&g(S.activeBranch)},registerDep(b,T,C){const R=!!S.pendingBranch;R&&S.deps++;const E=b.vnode.el;b.asyncDep.catch(U=>{da(U,b,0)}).then(U=>{if(b.isUnmounted||S.isUnmounted||S.pendingId!==b.suspenseId)return;Pi(),b.asyncResolved=!0;const{vnode:P}=b;So(b,U,!1),E&&(P.el=E);const M=!E&&b.subTree.el;T(b,P,x(E||b.subTree.el),E?null:g(b.subTree),S,l,C),M&&(P.placeholder=null,I(M)),wr(b,P.el),R&&--S.deps===0&&S.resolve()})},unmount(b,T){S.isUnmounted=!0,S.activeBranch&&h(S.activeBranch,s,b,T),S.pendingBranch&&h(S.pendingBranch,s,b,T)}};return S}function Lb(e,t,s,n,a,i,l,r,o){const c=t.suspense=wp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Nb(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Td(n?s.default:s),e.ssFallback=n?Td(s.fallback):ut(vt)}function Td(e){let t;if(Ae(e)){const s=na&&e._c;s&&(e._d=!1,Di()),e=e(),s&&(e._d=!0,t=jt,Tp())}return me(e)&&(e=vb(e)),e=as(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Sp(e,t){t&&t.pendingBranch?me(e)?t.effects.push(...e):t.effects.push(e):Ri(e)}function Na(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,wr(n,a))}function Db(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Ot=Symbol.for("v-fgt"),Mn=Symbol.for("v-txt"),vt=Symbol.for("v-cmt"),ea=Symbol.for("v-stc"),yi=[];let jt=null;function Di(e=!1){yi.push(jt=e?null:[])}function Tp(){yi.pop(),jt=yi[yi.length-1]||null}let na=1;function Mi(e,t=!1){na+=e,e<0&&jt&&t&&(jt.hasOnce=!0)}function Cp(e){return e.dynamicChildren=na>0?jt||Ea:null,Tp(),na>0&&jt&&jt.push(e),e}function Mb(e,t,s,n,a,i){return Cp(gc(e,t,s,n,a,i,!0))}function Bl(e,t,s,n,a){return Cp(ut(e,t,s,n,a,!0))}function bn(e){return e?e.__v_isVNode===!0:!1}function Ns(e,t){return e.type===t.type&&e.key===t.key}function Pb(e){}const Ep=({key:e})=>e??null,Sl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Ne(e)||kt(e)||Ae(e)?{i:Mt,r:e,k:t,f:!!s}:e:null);function gc(e,t=null,s=null,n=0,a=null,i=e===Ot?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Ep(t),ref:t&&Sl(t),scopeId:vr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Mt};return r?(bc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Ne(s)?8:16),na>0&&!l&&jt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&jt.push(o),o}const ut=Fb;function Fb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===sp)&&(e=vt),bn(e)){const r=Ws(e,t,!0);return s&&bc(r,s),na>0&&!i&&jt&&(r.shapeFlag&6?jt[jt.indexOf(e)]=r:jt.push(r)),r.patchFlag=-2,r}if(zb(e)&&(e=e.__vccOpts),t){t=Ap(t);let{class:r,style:o}=t;r&&!Ne(r)&&(t.class=qi(r)),Je(o)&&(Gi(o)&&!me(o)&&(o=Ue({},o)),t.style=zi(o))}const l=Ne(e)?1:Ul(e)?128:qf(e)?64:Je(e)?4:Ae(e)?2:0;return gc(e,t,s,n,a,l,i,!0)}function Ap(e){return e?Gi(e)||up(e)?Ue({},e):e:null}function Ws(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Ip(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Ep(c),ref:t&&t.ref?s&&i?me(i)?i.concat(Sl(t)):[i,Sl(t)]:Sl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Ot?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ws(e.ssContent),ssFallback:e.ssFallback&&Ws(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&vn(d,o.clone(d)),d}function vc(e=" ",t=0){return ut(Mn,null,e,t)}function $b(e,t){const s=ut(ea,null,e);return s.staticCount=t,s}function Rp(e="",t=!1){return t?(Di(),Bl(vt,null,e)):ut(vt,null,e)}function as(e){return e==null||typeof e=="boolean"?ut(vt):me(e)?ut(Ot,null,e.slice()):bn(e)?sn(e):ut(Mn,null,String(e))}function sn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ws(e)}function bc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(me(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),bc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!up(t)?t._ctx=Mt:a===3&&Mt&&(Mt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ae(t)?(t={default:t,_ctx:Mt},s=32):(t=String(t),n&64?(s=16,t=[vc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Ip(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=qi([t.class,n.class]));else if(a==="style")t.style=zi([t.style,n.style]);else if(ra(a)){const i=t[a],l=n[a];l&&i!==l&&!(me(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!lr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ss(e,t,s,n=null){ps(e,t,7,[s,n])}const Ub=ip();let Bb=0;function Op(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Ub,i={uid:Bb++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Jo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:pp(n,a),emitsOptions:rp(n,a),emit:null,emitted:null,propsDefaults:Be,inheritAttrs:n.inheritAttrs,ctx:Be,data:Be,props:Be,attrs:Be,slots:Be,refs:Be,setupState:Be,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=mb.bind(null,i),e.ce&&e.ce(i),i}let Dt=null;const Qt=()=>Dt||Mt;let Hl,Da;{const e=ur(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Hl=t("__VUE_INSTANCE_SETTERS__",s=>Dt=s),Da=t("__VUE_SSR_SETTERS__",s=>aa=s)}const Ya=e=>{const t=Dt;return Hl(e),e.scope.on(),()=>{e.scope.off(),Hl(t)}},Pi=()=>{Dt&&Dt.scope.off(),Hl(null)};function Lp(e){return e.vnode.shapeFlag&4}let aa=!1;function Np(e,t=!1,s=!1){t&&Da(t);const{props:n,children:a}=e.vnode,i=Lp(e);_b(e,n,i,t),Tb(e,a,s||t);const l=i?Hb(e,t):void 0;return t&&Da(!1),l}function Hb(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,yo);const{setup:n}=s;if(n){mn();const a=e.setupContext=n.length>1?Pp(e):null,i=Ya(e),l=Ja(n,e,0,[e.props,a]),r=Zo(l);if(gn(),i(),(r||e.sp)&&!fn(e)&&rc(e),r){if(l.then(Pi,Pi),t)return l.then(o=>{So(e,o,t)}).catch(o=>{da(o,e,0)});e.asyncDep=l}else So(e,l,t)}else Mp(e,t)}function So(e,t,s){Ae(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Je(t)&&(e.setupState=sc(t)),Mp(e,s)}let Vl,To;function Dp(e){Vl=e,To=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,Kv))}}const Vb=()=>!Vl;function Mp(e,t,s){const n=e.type;if(!e.render){if(!t&&Vl&&!n.render){const a=n.template||fc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Ue(Ue({isCustomElement:i,delimiters:r},l),o);n.render=Vl(a,c)}}e.render=n.render||Pt,To&&To(e)}{const a=Ya(e);mn();try{rb(e)}finally{gn(),a()}}}const jb={get(e,t){return Vt(e,"get",""),e[t]}};function Pp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,jb),slots:e.slots,emit:e.emit,expose:t}}function Ji(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(sc(If(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in bi)return bi[s](e)},has(t,s){return s in t||s in bi}})):e.proxy}function Co(e,t=!0){return Ae(e)?e.displayName||e.name:e.name||t&&e.__name}function zb(e){return Ae(e)&&"__vccOpts"in e}const W=(e,t)=>Jg(e,t,aa);function Ua(e,t,s){try{Mi(-1);const n=arguments.length;return n===2?Je(t)&&!me(t)?bn(t)?ut(e,null,[t]):ut(e,t):ut(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&bn(s)&&(s=[s]),ut(e,t,s))}finally{Mi(1)}}function qb(){}function Gb(e,t,s,n){const a=s[n];if(a&&Fp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Fp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(It(s[n],t[n]))return!1;return na>0&&jt&&jt.push(e),!0}const $p="3.5.38",Kb=Pt,Wb=iv,Zb=ka,Jb=Uf,Yb={createComponentInstance:Op,setupComponent:Np,renderComponentRoot:wl,setCurrentRenderingInstance:Oi,isVNode:bn,normalizeVNode:as,getComponentPublicInstance:Ji,ensureValidVNode:uc,pushWarningContext:tv,popWarningContext:sv},Qb=Yb,Xb=null,ey=null,ty=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Eo;const Cd=typeof window<"u"&&window.trustedTypes;if(Cd)try{Eo=Cd.createPolicy("vue",{createHTML:e=>e})}catch{}const Up=Eo?e=>Eo.createHTML(e):e=>e,sy="http://www.w3.org/2000/svg",ny="http://www.w3.org/1998/Math/MathML",tn=typeof document<"u"?document:null,Ed=tn&&tn.createElement("template"),Bp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?tn.createElementNS(sy,e):t==="mathml"?tn.createElementNS(ny,e):s?tn.createElement(e,{is:s}):tn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>tn.createTextNode(e),createComment:e=>tn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>tn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Ed.innerHTML=Up(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Ed.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Cn="transition",ni="animation",Ba=Symbol("_vtc"),Hp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Vp=Ue({},lc,Hp),ay=e=>(e.displayName="Transition",e.props=Vp,e),iy=ay((e,{slots:t})=>Ua(Wf,jp(e),t)),zn=(e,t=[])=>{me(e)?e.forEach(s=>s(...t)):e&&e(...t)},Ad=e=>e?me(e)?e.some(t=>t.length>1):e.length>1:!1;function jp(e){const t={};for(const P in e)P in Hp||(t[P]=e[P]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,g=ly(a),x=g&&g[0],I=g&&g[1],{onBeforeEnter:O,onEnter:y,onEnterCancelled:v,onLeave:_,onLeaveCancelled:S,onBeforeAppear:b=O,onAppear:T=y,onAppearCancelled:C=v}=t,R=(P,M,Z,te)=>{P._enterCancelled=te,In(P,M?d:r),In(P,M?c:l),Z&&Z()},E=(P,M)=>{P._isLeaving=!1,In(P,u),In(P,h),In(P,p),M&&M()},U=P=>(M,Z)=>{const te=P?T:y,B=()=>R(M,P,Z);zn(te,[M,B]),Rd(()=>{In(M,P?o:i),Bs(M,P?d:r),Ad(te)||Id(M,n,x,B)})};return Ue(t,{onBeforeEnter(P){zn(O,[P]),Bs(P,i),Bs(P,l)},onBeforeAppear(P){zn(b,[P]),Bs(P,o),Bs(P,c)},onEnter:U(!1),onAppear:U(!0),onLeave(P,M){P._isLeaving=!0;const Z=()=>E(P,M);Bs(P,u),P._enterCancelled?(Bs(P,p),Ao(P)):(Ao(P),Bs(P,p)),Rd(()=>{P._isLeaving&&(In(P,u),Bs(P,h),Ad(_)||Id(P,n,I,Z))}),zn(_,[P,Z])},onEnterCancelled(P){R(P,!1,void 0,!0),zn(v,[P])},onAppearCancelled(P){R(P,!0,void 0,!0),zn(C,[P])},onLeaveCancelled(P){E(P),zn(S,[P])}})}function ly(e){if(e==null)return null;if(Je(e))return[Gr(e.enter),Gr(e.leave)];{const t=Gr(e);return[t,t]}}function Gr(e){return Il(e)}function Bs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ba]||(e[Ba]=new Set)).add(t)}function In(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ba];s&&(s.delete(t),s.size||(e[Ba]=void 0))}function Rd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let ry=0;function Id(e,t,s,n){const a=e._endId=++ry,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=zp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function zp(e,t){const s=window.getComputedStyle(e),n=g=>(s[g]||"").split(", "),a=n(`${Cn}Delay`),i=n(`${Cn}Duration`),l=Od(a,i),r=n(`${ni}Delay`),o=n(`${ni}Duration`),c=Od(r,o);let d=null,u=0,p=0;t===Cn?l>0&&(d=Cn,u=l,p=i.length):t===ni?c>0&&(d=ni,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Cn:ni:null,p=d?d===Cn?i.length:o.length:0);const h=d===Cn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Cn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function Od(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Ld(s)+Ld(e[n])))}function Ld(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Ao(e){return(e?e.ownerDocument:document).body.offsetHeight}function oy(e,t,s){const n=e[Ba];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const jl=Symbol("_vod"),yc=Symbol("_vsh"),qp={name:"show",beforeMount(e,{value:t},{transition:s}){e[jl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):ai(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),ai(e,!0),n.enter(e)):n.leave(e,()=>{ai(e,!1)}):ai(e,t))},beforeUnmount(e,{value:t}){ai(e,t)}};function ai(e,t){e.style.display=t?e[jl]:"none",e[yc]=!t}function cy(){qp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Gp=Symbol("");function dy(e){const t=Qt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>zl(i,a))},n=()=>{const a=e(t.proxy);t.ce?zl(t.ce,a):Ro(t.subTree,a),s(a)};oc(()=>{Ri(n)}),qe(()=>{Yt(n,Pt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),bt(()=>a.disconnect())})}function Ro(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Ro(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)zl(e.el,t);else if(e.type===Ot)e.children.forEach(s=>Ro(s,t));else if(e.type===ea){let{el:s,anchor:n}=e;for(;s&&(zl(s,t),s!==n);)s=s.nextSibling}}function zl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=gg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Gp]=n}}const uy=/(?:^|;)\s*display\s*:/;function fy(e,t,s){const n=e.style,a=Ne(s);let i=!1;if(s&&!a){if(t)if(Ne(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&pi(n,r,"")}else for(const l in t)s[l]==null&&pi(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?hy(e,l,!Ne(t)&&t?t[l]:void 0,r)||pi(n,l,r):pi(n,l,"")}}else if(a){if(t!==s){const l=n[Gp];l&&(s+=";"+l),n.cssText=s,i=uy.test(s)}}else t&&e.removeAttribute("style");jl in e&&(e[jl]=i?n.display:"",e[yc]&&(n.display="none"))}const Nd=/\s*!important$/;function pi(e,t,s){if(me(s))s.forEach(n=>pi(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=py(e,t);Nd.test(s)?e.setProperty(is(n),s.replace(Nd,""),"important"):e[n]=s}}const Dd=["Webkit","Moz","ms"],Kr={};function py(e,t){const s=Kr[t];if(s)return s;let n=nt(t);if(n!=="filter"&&n in e)return Kr[t]=n;n=ca(n);for(let a=0;a<Dd.length;a++){const i=Dd[a]+n;if(i in e)return Kr[t]=i}return t}function hy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Ne(n)&&s===n}const Md="http://www.w3.org/1999/xlink";function Pd(e,t,s,n,a,i=hg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Md,t.slice(6,t.length)):e.setAttributeNS(Md,t,s):s==null||i&&!df(s)?e.removeAttribute(t):e.setAttribute(t,i?"":qt(s)?String(s):s)}function Fd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Up(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=df(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function rn(e,t,s,n){e.addEventListener(t,s,n)}function my(e,t,s,n){e.removeEventListener(t,s,n)}const $d=Symbol("_vei");function gy(e,t,s,n,a=null){const i=e[$d]||(e[$d]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=vy(t);if(n){const c=i[t]=xy(n,a);rn(e,r,c,o)}else l&&(my(e,r,l,o),i[t]=void 0)}}const Ud=/(?:Once|Passive|Capture)$/;function vy(e){let t;if(Ud.test(e)){t={};let n;for(;n=e.match(Ud);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):is(e.slice(2)),t]}let Wr=0;const by=Promise.resolve(),yy=()=>Wr||(by.then(()=>Wr=0),Wr=Date.now());function xy(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(me(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ps(c,t,5,r)}}else ps(a,t,5,[n])};return s.value=e,s.attached=yy(),s}const Bd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Kp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?oy(e,n,l):t==="style"?fy(e,s,n):ra(t)?lr(t)||gy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):_y(e,t,n,l))?(Fd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Pd(e,t,n,l,i,t!=="value")):e._isVueCE&&(ky(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Ne(n)))?Fd(e,nt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Pd(e,t,n,l))};function _y(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Bd(t)&&Ae(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Bd(t)&&Ne(s)?!1:t in e}function ky(e,t){const s=e._def.props;if(!s)return!1;const n=nt(t);return Array.isArray(s)?s.some(a=>nt(a)===n):Object.keys(s).some(a=>nt(a)===n)}const Hd={};function Wp(e,t,s){let n=Wi(e,t);rr(n)&&(n=Ue({},n,t));class a extends Sr{constructor(l){super(n,l,s)}}return a.def=n,a}const wy=((e,t)=>Wp(e,t,rh)),Sy=typeof HTMLElement<"u"?HTMLElement:class{};class Sr extends Sy{constructor(t,s={},n=Kl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Kl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ue({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Sr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ct(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!me(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Il(this._props[o])),(r||(r=Object.create(null)))[nt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)Ye(this,n)||Object.defineProperty(this,n,{get:()=>Gs(s[n])})}_resolveProps(t){const{props:s}=t,n=me(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(nt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Hd;const a=nt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Il(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Hd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(is(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(is(t),s+""):s||this.removeAttribute(is(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),lh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ut(this._def,Ue(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,rr(l[0])?Ue({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),is(i)!==i&&a(is(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Zp(e){const t=Qt(),s=t&&t.ce;return s||null}function Ty(){const e=Zp();return e&&e.shadowRoot}function Cy(e="$style"){{const t=Qt();if(!t)return Be;const s=t.type.__cssModules;if(!s)return Be;const n=s[e];return n||Be}}const Jp=new WeakMap,Yp=new WeakMap,ql=Symbol("_moveCb"),Vd=Symbol("_enterCb"),Ey=e=>(delete e.props.mode,e),Ay=Ey({name:"TransitionGroup",props:Ue({},Vp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Qt(),n=ic();let a,i;return xr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Ny(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Iy),a.forEach(Oy);const r=a.filter(Ly);Ao(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Bs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[ql]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[ql]=null,In(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ke(e),r=jp(l);let o=l.tag||Ot;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[yc]&&(a.push(d),vn(d,$a(d,r,n,s)),Jp.set(d,Qp(d.el)))}i=t.default?br(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&vn(d,$a(d,r,n,s))}return ut(o,null,i)}}}),Ry=Ay;function Iy(e){const t=e.el;t[ql]&&t[ql](),t[Vd]&&t[Vd]()}function Oy(e){Yp.set(e,Qp(e.el))}function Ly(e){const t=Jp.get(e),s=Yp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Qp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Ny(e,t,s){const n=e.cloneNode(),a=e[Ba];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=zp(n);return i.removeChild(n),l}const Fn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return me(t)?s=>Ia(t,s):t};function Dy(e){e.target.composing=!0}function jd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ts=Symbol("_assign");function zd(e,t,s){return t&&(e=e.trim()),s&&(e=dr(e)),e}const Gl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ts]=Fn(a);const i=n||a.props&&a.props.type==="number";rn(e,t?"change":"input",l=>{l.target.composing||e[Ts](zd(e.value,s,i))}),(s||i)&&rn(e,"change",()=>{e.value=zd(e.value,s,i)}),t||(rn(e,"compositionstart",Dy),rn(e,"compositionend",jd),rn(e,"change",jd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ts]=Fn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?dr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},xc={deep:!0,created(e,t,s){e[Ts]=Fn(s),rn(e,"change",()=>{const n=e._modelValue,a=Ha(e),i=e.checked,l=e[Ts];if(me(n)){const r=fr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(oa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(eh(e,i))})},mounted:qd,beforeUpdate(e,t,s){e[Ts]=Fn(s),qd(e,t,s)}};function qd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(me(t))a=fr(t,n.props.value)>-1;else if(oa(t))a=t.has(n.props.value);else{if(t===s)return;a=hn(t,eh(e,!0))}e.checked!==a&&(e.checked=a)}const _c={created(e,{value:t},s){e.checked=hn(t,s.props.value),e[Ts]=Fn(s),rn(e,"change",()=>{e[Ts](Ha(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ts]=Fn(n),t!==s&&(e.checked=hn(t,n.props.value))}},Xp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=oa(t);rn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?dr(Ha(l)):Ha(l));e[Ts](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ct(()=>{e._assigning=!1})}),e[Ts]=Fn(n)},mounted(e,{value:t}){Gd(e,t)},beforeUpdate(e,t,s){e[Ts]=Fn(s)},updated(e,{value:t}){e._assigning||Gd(e,t)}};function Gd(e,t){const s=e.multiple,n=me(t);if(!(s&&!n&&!oa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ha(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=fr(t,r)>-1}else l.selected=t.has(r);else if(hn(Ha(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ha(e){return"_value"in e?e._value:e.value}function eh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const th={created(e,t,s){ml(e,t,s,null,"created")},mounted(e,t,s){ml(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){ml(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){ml(e,t,s,n,"updated")}};function sh(e,t){switch(e){case"SELECT":return Xp;case"TEXTAREA":return Gl;default:switch(t){case"checkbox":return xc;case"radio":return _c;default:return Gl}}}function ml(e,t,s,n,a){const l=sh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function My(){Gl.getSSRProps=({value:e})=>({value:e}),_c.getSSRProps=({value:e},t)=>{if(t.props&&hn(t.props.value,e))return{checked:!0}},xc.getSSRProps=({value:e},t)=>{if(me(e)){if(t.props&&fr(e,t.props.value)>-1)return{checked:!0}}else if(oa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},th.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=sh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Py=["ctrl","shift","alt","meta"],Fy={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Py.some(s=>e[`${s}Key`]&&!t.includes(s))},$y=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=Fy[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Uy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},By=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=is(a.key);if(t.some(l=>l===i||Uy[l]===i))return e(a)}))},nh=Ue({patchProp:Kp},Bp);let xi,Kd=!1;function ah(){return xi||(xi=vp(nh))}function ih(){return xi=Kd?xi:bp(nh),Kd=!0,xi}const lh=((...e)=>{ah().render(...e)}),Hy=((...e)=>{ih().hydrate(...e)}),Kl=((...e)=>{const t=ah().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ch(n);if(!a)return;const i=t._component;!Ae(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,oh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),rh=((...e)=>{const t=ih().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ch(n);if(a)return s(a,!0,oh(a))},t});function oh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function ch(e){return Ne(e)?document.querySelector(e):e}let Wd=!1;const Vy=()=>{Wd||(Wd=!0,My(),cy())},jy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Wf,BaseTransitionPropsValidators:lc,Comment:vt,DeprecationTypes:ty,EffectScope:Jo,ErrorCodes:av,ErrorTypeStrings:Wb,Fragment:Ot,KeepAlive:Fv,ReactiveEffect:Ci,Static:ea,Suspense:Rb,Teleport:yv,Text:Mn,TrackOpTypes:Yg,Transition:iy,TransitionGroup:Ry,TriggerOpTypes:Qg,VueElement:Sr,assertNumber:nv,callWithAsyncErrorHandling:ps,callWithErrorHandling:Ja,camelize:nt,capitalize:ca,cloneVNode:Ws,compatUtils:ey,computed:W,createApp:Kl,createBlock:Bl,createCommentVNode:Rp,createElementBlock:Mb,createElementVNode:gc,createHydrationRenderer:bp,createPropsRestProxy:ib,createRenderer:vp,createSSRApp:rh,createSlots:zv,createStaticVNode:$b,createTextVNode:vc,createVNode:ut,customRef:Lf,defineAsyncComponent:Mv,defineComponent:Wi,defineCustomElement:Wp,defineEmits:Zv,defineExpose:Jv,defineModel:Xv,defineOptions:Yv,defineProps:Wv,defineSSRCustomElement:wy,defineSlots:Qv,devtools:Zb,effect:xg,effectScope:vg,getCurrentInstance:Qt,getCurrentScope:hf,getCurrentWatcher:Xg,getTransitionRawChildren:br,guardReactiveProps:Ap,h:Ua,handleError:da,hasInjectionContext:fv,hydrate:Hy,hydrateOnIdle:Rv,hydrateOnInteraction:Nv,hydrateOnMediaQuery:Lv,hydrateOnVisible:Ov,initCustomFormatter:qb,initDirectivesForSSR:Vy,inject:Ss,isMemoSame:Fp,isProxy:Gi,isReactive:un,isReadonly:Ks,isRef:kt,isRuntimeOnly:Vb,isShallow:rs,isVNode:bn,markRaw:If,mergeDefaults:nb,mergeModels:ab,mergeProps:Ip,nextTick:Ct,nodeOps:Bp,normalizeClass:qi,normalizeProps:ag,normalizeStyle:zi,onActivated:Es,onBeforeMount:Yf,onBeforeUnmount:_r,onBeforeUpdate:oc,onDeactivated:As,onErrorCaptured:tp,onMounted:qe,onRenderTracked:ep,onRenderTriggered:Xf,onScopeDispose:bg,onServerPrefetch:Qf,onUnmounted:bt,onUpdated:xr,onWatcherCleanup:Df,openBlock:Di,patchProp:Kp,popScopeId:cv,provide:vi,proxyRefs:sc,pushScopeId:ov,queuePostFlushCb:Ri,reactive:$n,readonly:Ll,ref:m,registerRuntimeCompiler:Dp,render:lh,renderList:jv,renderSlot:qv,resolveComponent:Bv,resolveDirective:Vv,resolveDynamicComponent:Hv,resolveFilter:Xb,resolveTransitionHooks:$a,setBlockTracking:Mi,setDevtoolsHook:Jb,setTransitionHooks:vn,shallowReactive:ec,shallowReadonly:Ug,shallowRef:tc,ssrContextKey:Bf,ssrUtils:Qb,stop:_g,toDisplayString:ff,toHandlerKey:Ra,toHandlers:Gv,toRaw:Ke,toRef:Wg,toRefs:qg,toValue:Vg,transformVNodeArgs:Pb,triggerRef:Hg,unref:Gs,useAttrs:sb,useCssModule:Cy,useCssVars:dy,useHost:Zp,useId:_v,useModel:hb,useSSRContext:Hf,useShadowRoot:Ty,useSlots:tb,useTemplateRef:kv,useTransitionState:ic,vModelCheckbox:xc,vModelDynamic:th,vModelRadio:_c,vModelSelect:Xp,vModelText:Gl,vShow:qp,version:$p,warn:Kb,watch:Yt,watchEffect:pv,watchPostEffect:hv,watchSyncEffect:Vf,withAsyncContext:lb,withCtx:ac,withDefaults:eb,withDirectives:uv,withKeys:By,withMemo:Gb,withModifiers:$y,withScopeId:dv},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Fi=Symbol(""),_i=Symbol(""),kc=Symbol(""),Wl=Symbol(""),dh=Symbol(""),ia=Symbol(""),uh=Symbol(""),fh=Symbol(""),wc=Symbol(""),Sc=Symbol(""),Yi=Symbol(""),Tc=Symbol(""),ph=Symbol(""),Cc=Symbol(""),Ec=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),Ic=Symbol(""),Oc=Symbol(""),hh=Symbol(""),mh=Symbol(""),Tr=Symbol(""),Zl=Symbol(""),Lc=Symbol(""),Nc=Symbol(""),$i=Symbol(""),Qi=Symbol(""),Dc=Symbol(""),Io=Symbol(""),zy=Symbol(""),Oo=Symbol(""),Jl=Symbol(""),qy=Symbol(""),Gy=Symbol(""),Mc=Symbol(""),Ky=Symbol(""),Wy=Symbol(""),Pc=Symbol(""),gh=Symbol(""),Va={[Fi]:"Fragment",[_i]:"Teleport",[kc]:"Suspense",[Wl]:"KeepAlive",[dh]:"BaseTransition",[ia]:"openBlock",[uh]:"createBlock",[fh]:"createElementBlock",[wc]:"createVNode",[Sc]:"createElementVNode",[Yi]:"createCommentVNode",[Tc]:"createTextVNode",[ph]:"createStaticVNode",[Cc]:"resolveComponent",[Ec]:"resolveDynamicComponent",[Ac]:"resolveDirective",[Rc]:"resolveFilter",[Ic]:"withDirectives",[Oc]:"renderList",[hh]:"renderSlot",[mh]:"createSlots",[Tr]:"toDisplayString",[Zl]:"mergeProps",[Lc]:"normalizeClass",[Nc]:"normalizeStyle",[$i]:"normalizeProps",[Qi]:"guardReactiveProps",[Dc]:"toHandlers",[Io]:"camelize",[zy]:"capitalize",[Oo]:"toHandlerKey",[Jl]:"setBlockTracking",[qy]:"pushScopeId",[Gy]:"popScopeId",[Mc]:"withCtx",[Ky]:"unref",[Wy]:"isRef",[Pc]:"withMemo",[gh]:"isMemoSame"};function Zy(e){Object.getOwnPropertySymbols(e).forEach(t=>{Va[t]=e[t]})}const gs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Jy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:gs}}function Ui(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=gs){return e&&(r?(e.helper(ia),e.helper(qa(e.inSSR,c))):e.helper(za(e.inSSR,c)),l&&e.helper(Ic)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function ta(e,t=gs){return{type:17,loc:t,elements:e}}function ws(e,t=gs){return{type:15,loc:t,properties:e}}function _t(e,t){return{type:16,loc:gs,key:Ne(e)?Me(e,!0):e,value:t}}function Me(e,t=!1,s=gs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ms(e,t=gs){return{type:8,loc:t,children:e}}function Et(e,t=[],s=gs){return{type:14,loc:s,callee:e,arguments:t}}function ja(e,t=void 0,s=!1,n=!1,a=gs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function Lo(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:gs}}function Yy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:gs}}function Qy(e){return{type:21,body:e,loc:gs}}function za(e,t){return e||t?wc:Sc}function qa(e,t){return e||t?uh:fh}function Fc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(za(n,e.isComponent)),t(ia),t(qa(n,e.isComponent)))}const Zd=new Uint8Array([123,123]),Jd=new Uint8Array([125,125]);function Yd(e){return e>=97&&e<=122||e>=65&&e<=90}function us(e){return e===32||e===10||e===9||e===12||e===13}function En(e){return e===47||e===62||us(e)}function Yl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ut={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Xy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Zd,this.delimiterClose=Jd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Zd,this.delimiterClose=Jd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?En(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||us(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ut.TitleEnd||this.currentSequence===Ut.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ut.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ut.Cdata.length&&(this.state=28,this.currentSequence=Ut.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Yd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){En(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(En(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Yl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){us(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Yd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||us(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):us(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):us(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||En(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||En(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||En(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||En(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||En(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):us(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):us(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){us(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ut.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ut.ScriptEnd[3]?this.startSpecial(Ut.ScriptEnd,4):t===Ut.StyleEnd[3]?this.startSpecial(Ut.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ut.TitleEnd[3]?this.startSpecial(Ut.TitleEnd,4):t===Ut.TextareaEnd[3]?this.startSpecial(Ut.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Qd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function sa(e,t){const s=Qd("MODE",t),n=Qd(e,t);return s===3?n===!0:n!==!1}function Bi(e,t,s,...n){return sa(e,t)}function $c(e){throw e}function vh(e){}function ct(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ls=e=>e.type===4&&e.isStatic;function bh(e){switch(e){case"Teleport":case"teleport":return _i;case"Suspense":case"suspense":return kc;case"KeepAlive":case"keep-alive":return Wl;case"BaseTransition":case"base-transition":return dh}}const ex=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Uc=e=>!ex.test(e),yh=/[A-Za-z_$\xA0-\uFFFF]/,tx=/[\.\?\w$\xA0-\uFFFF]/,sx=/\s+[.[]\s*|\s*[.[]\s+/g,xh=e=>e.type===4?e.content:e.loc.source,nx=e=>{const t=xh(e).trim().replace(sx,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?yh:tx).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},_h=nx,ax=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,ix=e=>ax.test(xh(e)),lx=ix;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Ne(t)?a.name===t:t.test(a.name)))return a}}function Cr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Zn(i.arg,t))return i}}function Zn(e,t){return!!(e&&ls(e)&&e.content===t)}function rx(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Zr(e){return e.type===5||e.type===2}function Xd(e){return e.type===7&&e.name==="pre"}function ox(e){return e.type===7&&e.name==="slot"}function Ql(e){return e.type===1&&e.tagType===3}function Xl(e){return e.type===1&&e.tagType===2}const cx=new Set([$i,Qi]);function kh(e,t=[]){if(e&&!Ne(e)&&e.type===14){const s=e.callee;if(!Ne(s)&&cx.has(s))return kh(e.arguments[0],t.concat(e))}return[e,t]}function er(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Ne(a)&&a.type===14){const r=kh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Ne(a))n=ws([t]);else if(a.type===14){const r=a.arguments[0];!Ne(r)&&r.type===15?eu(t,r)||r.properties.unshift(t):a.callee===Dc?n=Et(s.helper(Zl),[ws([t]),a]):a.arguments.unshift(ws([t])),!n&&(n=a)}else a.type===15?(eu(t,a)||a.properties.unshift(t),n=a):(n=Et(s.helper(Zl),[ws([t]),a]),l&&l.callee===Qi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function eu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Hi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function dx(e){return e.type===14&&e.callee===Pc?e.arguments[1].returns:e}const ux=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function wh(e){for(let t=0;t<e.length;t++)if(!us(e.charCodeAt(t)))return!1;return!0}function Bc(e){return e.type===2&&wh(e.content)||e.type===12&&Bc(e.content)}function Sh(e){return e.type===3||Bc(e)}const Th={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ta,isPreTag:Ta,isIgnoreNewlineTag:Ta,isCustomElement:Ta,onError:$c,onWarn:vh,comments:!1,prefixIdentifiers:!1};let Ze=Th,Vi=null,pn="",Ht=null,je=null,ts="",en=-1,Gn=-1,Hc=0,Nn=!1,No=null;const ot=[],mt=new Xy(ot,{onerr:Ys,ontext(e,t){gl(Nt(e,t),e,t)},ontextentity(e,t,s){gl(e,t,s)},oninterpolation(e,t){if(Nn)return gl(Nt(e,t),e,t);let s=e+mt.delimiterOpen.length,n=t-mt.delimiterClose.length;for(;us(pn.charCodeAt(s));)s++;for(;us(pn.charCodeAt(n-1));)n--;let a=Nt(s,n);a.includes("&")&&(a=Ze.decodeEntities(a,!1)),Do({type:5,content:Cl(a,!1,gt(s,n)),loc:gt(e,t)})},onopentagname(e,t){const s=Nt(e,t);Ht={type:1,tag:s,ns:Ze.getNamespace(s,ot[0],Ze.ns),tagType:0,props:[],children:[],loc:gt(e-1,t),codegenNode:void 0}},onopentagend(e){su(e)},onclosetag(e,t){const s=Nt(e,t);if(!Ze.isVoidTag(s)){let n=!1;for(let a=0;a<ot.length;a++)if(ot[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ys(24,ot[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ot.shift();Tl(r,t,l<a)}break}n||Ys(23,Ch(e,60))}},onselfclosingtag(e){const t=Ht.tag;Ht.isSelfClosing=!0,su(e),ot[0]&&ot[0].tag===t&&Tl(ot.shift(),e)},onattribname(e,t){je={type:6,name:Nt(e,t),nameLoc:gt(e,t),value:void 0,loc:gt(e)}},ondirname(e,t){const s=Nt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Nn&&n===""&&Ys(26,e),Nn||n==="")je={type:6,name:s,nameLoc:gt(e,t),value:void 0,loc:gt(e)};else if(je={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Me("prop")]:[],loc:gt(e)},n==="pre"){Nn=mt.inVPre=!0,No=Ht;const a=Ht.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=_x(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Nt(e,t);if(Nn&&!Xd(je))je.name+=s,Jn(je.nameLoc,t);else{const n=s[0]!=="[";je.arg=Cl(n?s:s.slice(1,-1),n,gt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Nt(e,t);if(Nn&&!Xd(je))je.name+="."+s,Jn(je.nameLoc,t);else if(je.name==="slot"){const n=je.arg;n&&(n.content+="."+s,Jn(n.loc,t))}else{const n=Me(s,!0,gt(e,t));je.modifiers.push(n)}},onattribdata(e,t){ts+=Nt(e,t),en<0&&(en=e),Gn=t},onattribentity(e,t,s){ts+=e,en<0&&(en=t),Gn=s},onattribnameend(e){const t=je.loc.start.offset,s=Nt(t,e);je.type===7&&(je.rawName=s),Ht.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ys(2,t)},onattribend(e,t){if(Ht&&je){if(Jn(je.loc,t),e!==0)if(ts.includes("&")&&(ts=Ze.decodeEntities(ts,!0)),je.type===6)je.name==="class"&&(ts=Ah(ts).trim()),e===1&&!ts&&Ys(13,t),je.value={type:2,content:ts,loc:e===1?gt(en,Gn):gt(en-1,Gn+1)},mt.inSFCRoot&&Ht.tag==="template"&&je.name==="lang"&&ts&&ts!=="html"&&mt.enterRCDATA(Yl("</template"),0);else{let s=0;je.exp=Cl(ts,!1,gt(en,Gn),0,s),je.name==="for"&&(je.forParseResult=px(je.exp));let n=-1;je.name==="bind"&&(n=je.modifiers.findIndex(a=>a.content==="sync"))>-1&&Bi("COMPILER_V_BIND_SYNC",Ze,je.loc,je.arg.loc.source)&&(je.name="model",je.modifiers.splice(n,1))}(je.type!==7||je.name!=="pre")&&Ht.props.push(je)}ts="",en=Gn=-1},oncomment(e,t){Ze.comments&&Do({type:3,content:Nt(e,t),loc:gt(e-4,t+3)})},onend(){const e=pn.length;for(let t=0;t<ot.length;t++)Tl(ot[t],e-1),Ys(24,ot[t].loc.start.offset)},oncdata(e,t){(ot[0]?ot[0].ns:Ze.ns)!==0?gl(Nt(e,t),e,t):Ys(1,e-9)},onprocessinginstruction(e){(ot[0]?ot[0].ns:Ze.ns)===0&&Ys(21,e-1)}}),tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,fx=/^\(|\)$/g;function px(e){const t=e.loc,s=e.content,n=s.match(ux);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const g=t.start.offset+p,x=g+u.length;return Cl(u,!1,gt(g,x),0,h?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(fx,"").trim();const c=a.indexOf(o),d=o.match(tu);if(d){o=o.replace(tu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(r.index=l(h,s.indexOf(h,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Nt(e,t){return pn.slice(e,t)}function su(e){mt.inSFCRoot&&(Ht.innerLoc=gt(e+1,e+1)),Do(Ht);const{tag:t,ns:s}=Ht;s===0&&Ze.isPreTag(t)&&Hc++,Ze.isVoidTag(t)?Tl(Ht,e):(ot.unshift(Ht),(s===1||s===2)&&(mt.inXML=!0)),Ht=null}function gl(e,t,s){{const i=ot[0]&&ot[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ze.decodeEntities(e,!1))}const n=ot[0]||Vi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Jn(a.loc,s)):n.children.push({type:2,content:e,loc:gt(t,s)})}function Tl(e,t,s=!1){s?Jn(e.loc,Ch(t,60)):Jn(e.loc,hx(t,62)+1),mt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ue({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ue({},e.innerLoc.start),e.innerLoc.source=Nt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Nn||(n==="slot"?e.tagType=2:nu(e)?e.tagType=3:gx(e)&&(e.tagType=1)),mt.inRCDATA||(e.children=Eh(i)),a===0&&Ze.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ze.isPreTag(n)&&Hc--,No===e&&(Nn=mt.inVPre=!1,No=null),mt.inXML&&(ot[0]?ot[0].ns:Ze.ns)===0&&(mt.inXML=!1);{const l=e.props;if(!mt.inSFCRoot&&sa("COMPILER_NATIVE_TEMPLATE",Ze)&&e.tag==="template"&&!nu(e)){const o=ot[0]||Vi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Bi("COMPILER_INLINE_TEMPLATE",Ze,r.loc)&&e.children.length&&(r.value={type:2,content:Nt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function hx(e,t){let s=e;for(;pn.charCodeAt(s)!==t&&s<pn.length-1;)s++;return s}function Ch(e,t){let s=e;for(;pn.charCodeAt(s)!==t&&s>=0;)s--;return s}const mx=new Set(["if","else","else-if","for","slot"]);function nu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&mx.has(t[s].name))return!0}return!1}function gx({tag:e,props:t}){if(Ze.isCustomElement(e))return!1;if(e==="component"||vx(e.charCodeAt(0))||bh(e)||Ze.isBuiltInComponent&&Ze.isBuiltInComponent(e)||Ze.isNativeTag&&!Ze.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Bi("COMPILER_IS_ON_ELEMENT",Ze,n.loc))return!0}}else if(n.name==="bind"&&Zn(n.arg,"is")&&Bi("COMPILER_IS_ON_ELEMENT",Ze,n.loc))return!0}return!1}function vx(e){return e>64&&e<91}const bx=/\r\n/g;function Eh(e){const t=Ze.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Hc)a.content=a.content.replace(bx,`
`);else if(wh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&yx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Ah(a.content))}return s?e.filter(Boolean):e}function yx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Ah(e){let t="",s=!1;for(let n=0;n<e.length;n++)us(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Do(e){(ot[0]||Vi).children.push(e)}function gt(e,t){return{start:mt.getPos(e),end:t==null?t:mt.getPos(t),source:t==null?t:Nt(e,t)}}function xx(e){return gt(e.start.offset,e.end.offset)}function Jn(e,t){e.end=mt.getPos(t),e.source=Nt(e.start.offset,t)}function _x(e){const t={type:6,name:e.rawName,nameLoc:gt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Cl(e,t=!1,s,n=0,a=0){return Me(e,t,s,n)}function Ys(e,t,s){Ze.onError(ct(e,gt(t,t)))}function kx(){mt.reset(),Ht=null,je=null,ts="",en=-1,Gn=-1,ot.length=0}function wx(e,t){if(kx(),pn=e,Ze=Ue({},Th),t){let a;for(a in t)t[a]!=null&&(Ze[a]=t[a])}mt.mode=Ze.parseMode==="html"?1:Ze.parseMode==="sfc"?2:0,mt.inXML=Ze.ns===1||Ze.ns===2;const s=t&&t.delimiters;s&&(mt.delimiterOpen=Yl(s[0]),mt.delimiterClose=Yl(s[1]));const n=Vi=Jy([],e);return mt.parse(pn),n.loc=gt(0,e.length),n.children=Eh(n.children),Vi=null,n}function Sx(e,t){El(e,void 0,t,!!Rh(e))}function Rh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Xl(t[0])?t[0]:null}function El(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:fs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const g=h.patchFlag;if((g===void 0||g===512||g===1)&&Oh(u,s)>=2){const x=Lh(u);x&&(h.props=s.hoist(x))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:fs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,El(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)El(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)El(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&me(e.codegenNode.children))e.codegenNode.children=o(ta(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!me(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(ta(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!me(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(ta(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!me(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function fs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Oh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=fs(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=fs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ia),t.removeHelper(qa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(za(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return fs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Ne(r)||qt(r))continue;const o=fs(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const Tx=new Set([Lc,Nc,$i,Qi]);function Ih(e,t){if(e.type===14&&!Ne(e.callee)&&Tx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return fs(s,t);if(s.type===14)return Ih(s,t)}return 0}function Oh(e,t){let s=3;const n=Lh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=fs(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=fs(r,t):r.type===14?c=Ih(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Lh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Cx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Pt,isCustomElement:d=Pt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:g=!1,inSSR:x=!1,ssrCssVars:I="",bindingMetadata:O=Be,inline:y=!1,isTS:v=!1,onError:_=$c,onWarn:S=vh,compatConfig:b}){const T=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),C={filename:t,selfName:T&&ca(nt(T[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:g,inSSR:x,ssrCssVars:I,bindingMetadata:O,inline:y,isTS:v,onError:_,onWarn:S,compatConfig:b,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(R){const E=C.helpers.get(R)||0;return C.helpers.set(R,E+1),R},removeHelper(R){const E=C.helpers.get(R);if(E){const U=E-1;U?C.helpers.set(R,U):C.helpers.delete(R)}},helperString(R){return`_${Va[C.helper(R)]}`},replaceNode(R){C.parent.children[C.childIndex]=C.currentNode=R},removeNode(R){const E=C.parent.children,U=R?E.indexOf(R):C.currentNode?C.childIndex:-1;!R||R===C.currentNode?(C.currentNode=null,C.onNodeRemoved()):C.childIndex>U&&(C.childIndex--,C.onNodeRemoved()),C.parent.children.splice(U,1)},onNodeRemoved:Pt,addIdentifiers(R){},removeIdentifiers(R){},hoist(R){Ne(R)&&(R=Me(R)),C.hoists.push(R);const E=Me(`_hoisted_${C.hoists.length}`,!1,R.loc,2);return E.hoisted=R,E},cache(R,E=!1,U=!1){const P=Yy(C.cached.length,R,E,U);return C.cached.push(P),P}};return C.filters=new Set,C}function Ex(e,t){const s=Cx(e,t);Er(e,s),t.hoistStatic&&Sx(e,s),t.ssr||Ax(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Ax(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Rh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Fc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ui(t,s(Fi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Rx(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Ne(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Er(a,t))}}function Er(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(me(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Yi);break;case 5:t.ssr||t.helper(Tr);break;case 9:for(let i=0;i<e.branches.length;i++)Er(e.branches[i],t);break;case 10:case 11:case 1:case 0:Rx(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Nh(e,t){const s=Ne(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(ox))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Ar="/*@__PURE__*/",Dh=e=>`${Va[e]}: _${Va[e]}`;function Ix(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(x){return`_${Va[x]}`},push(x,I=-2,O){h.code+=x},indent(){g(++h.indentLevel)},deindent(x=!1){x?--h.indentLevel:g(--h.indentLevel)},newline(){g(h.indentLevel)}};function g(x){h.push(`
`+"  ".repeat(x),0)}return h}function Ox(e,t={}){const s=Ix(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";Lx(e,s);const x=d?"ssrRender":"render",O=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${x}(${O}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Dh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Jr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Jr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Jr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let y=0;y<e.temps;y++)a(`${y>0?", ":""}_temp${y}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?zt(e.codegenNode,s):a("null"),h&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Lx(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[wc,Sc,Yi,Tc,ph].filter(p=>d.includes(p)).map(Dh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Nx(e.hoists,t),i(),a("return ")}function Jr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Rc:t==="component"?Cc:Ac);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Hi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Nx(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),zt(i,t),n())}t.pure=!1}function Vc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Xi(e,t,s),s&&t.deindent(),t.push("]")}function Xi(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Ne(r)?a(r,-3):me(r)?Vc(r,t):zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function zt(e,t){if(Ne(e)){t.push(e,-3);return}if(qt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:zt(e.codegenNode,t);break;case 2:Dx(e,t);break;case 4:Mh(e,t);break;case 5:Mx(e,t);break;case 12:zt(e.codegenNode,t);break;case 8:Ph(e,t);break;case 3:Fx(e,t);break;case 13:$x(e,t);break;case 14:Bx(e,t);break;case 15:Hx(e,t);break;case 17:Vx(e,t);break;case 18:jx(e,t);break;case 19:zx(e,t);break;case 20:qx(e,t);break;case 21:Xi(e.body,t,!0,!1);break}}function Dx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Mh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Mx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ar),s(`${n(Tr)}(`),zt(e.content,t),s(")")}function Ph(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Ne(n)?t.push(n,-3):zt(n,t)}}function Px(e,t){const{push:s}=t;if(e.type===8)s("["),Ph(e,t),s("]");else if(e.isStatic){const n=Uc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Fx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ar),s(`${n(Yi)}(${JSON.stringify(e.content)})`,-3,e)}function $x(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let g;o&&(g=String(o)),d&&s(n(Ic)+"("),u&&s(`(${n(ia)}(${p?"true":""}), `),a&&s(Ar);const x=u?qa(t.inSSR,h):za(t.inSSR,h);s(n(x)+"(",-2,e),Xi(Ux([i,l,r,g,c]),t),s(")"),u&&s(")"),d&&(s(", "),zt(d,t),s(")"))}function Ux(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function Bx(e,t){const{push:s,helper:n,pure:a}=t,i=Ne(e.callee)?e.callee:n(e.callee);a&&s(Ar),s(i+"(",-2,e),Xi(e.arguments,t),s(")")}function Hx(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Px(c,t),s(": "),zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Vx(e,t){Vc(e.elements,t)}function jx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Va[Mc]}(`),s("(",-2,e),me(i)?Xi(i,t):i&&zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),me(l)?Vc(l,t):zt(l,t)):r&&zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function zx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Uc(s.content);u&&l("("),Mh(s,t),u&&l(")")}else l("("),zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,zt(a,t),d||t.indentLevel--,i&&o(!0)}function qx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Jl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Jl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const Gx=Nh(/^(?:if|else|else-if)$/,(e,t,s)=>Kx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=iu(a,o,s);else{const c=Wx(n.codegenNode);c.alternate=iu(a,o+n.branches.length-1,s)}}}));function Kx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ct(28,t.loc)),t.exp=Me("true",!1,a)}if(t.name==="if"){const a=au(e,t),i={type:9,loc:xx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Sh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ct(30,e.loc)),s.removeNode();const r=au(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Er(r,s),o&&o(),s.currentNode=null}else s.onError(ct(30,e.loc));break}}}function au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:Cr(e,"key"),isTemplateIf:s}}function iu(e,t,s){return e.condition?Lo(e.condition,lu(e,t,s),Et(s.helper(Yi),['""',"true"])):lu(e,t,s)}function lu(e,t,s){const{helper:n}=s,a=_t("key",Me(`${t}`,!1,gs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return er(o,a,s),o}else return Ui(s,n(Fi),ws([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=dx(o);return c.type===13&&Fc(c,s),er(c,a,s),o}}function Wx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Zx=Nh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Jx(e,t,s,i=>{const l=Et(n(Oc),[i.source]),r=Ql(e),o=ks(e,"memo"),c=Cr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Me(c.value.content,!0):void 0:c.exp);const u=d?_t("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=Ui(s,n(Fi),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let g;const{children:x}=i,I=x.length!==1||x[0].type!==1,O=Xl(e)?e:r&&e.children.length===1&&Xl(e.children[0])?e.children[0]:null;if(O?(g=O.codegenNode,r&&u&&er(g,u,s)):I?g=Ui(s,n(Fi),u?ws([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(g=x[0].codegenNode,r&&u&&er(g,u,s),g.isBlock!==!p&&(g.isBlock?(a(ia),a(qa(s.inSSR,g.isComponent))):a(za(s.inSSR,g.isComponent))),g.isBlock=!p,g.isBlock?(n(ia),n(qa(s.inSSR,g.isComponent))):n(za(s.inSSR,g.isComponent))),o){const y=ja(Mo(i.parseResult,[Me("_cached")]));y.body=Qy([Ms(["const _memo = (",o.exp,")"]),Ms(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(gh)}(_cached, _memo)) return _cached`]),Ms(["const _item = ",g]),Me("_item.memo = _memo"),Me("return _item")]),l.arguments.push(y,Me("_cache"),Me(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ja(Mo(i.parseResult),g,!0))}})});function Jx(e,t,s,n){if(!t.exp){s.onError(ct(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ct(32,t.loc));return}Fh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Ql(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const h=n&&n(p);return()=>{r.vFor--,h&&h()}}function Fh(e,t){e.finalized||(e.finalized=!0)}function Mo({value:e,key:t,index:s},n=[]){return Yx([e,t,s,...n])}function Yx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Me("_".repeat(n+1),!1))}const ru=Me("undefined",!1),Qx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Xx=(e,t,s,n)=>ja(e,s,!1,!0,s.length?s[0].loc:n);function e0(e,t,s=Xx){t.helper(Mc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:I,exp:O}=o;I&&!ls(I)&&(r=!0),i.push(_t(I||Me("default",!0),s(O,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let I=0;I<n.length;I++){const O=n[I];let y;if(!Ql(O)||!(y=ks(O,"slot",!0))){O.type!==3&&u.push(O);continue}if(o){t.onError(ct(37,y.loc));break}c=!0;const{children:v,loc:_}=O,{arg:S=Me("default",!0),exp:b,loc:T}=y;let C;ls(S)?C=S?S.content:"default":r=!0;const R=ks(O,"for"),E=s(b,R,v,_);let U,P;if(U=ks(O,"if"))r=!0,l.push(Lo(U.exp,vl(S,E,h++),ru));else if(P=ks(O,/^else(?:-if)?$/,!0)){let M=I,Z;for(;M--&&(Z=n[M],!!Sh(Z)););if(Z&&Ql(Z)&&ks(Z,/^(?:else-)?if$/)){let te=l[l.length-1];for(;te.alternate.type===19;)te=te.alternate;te.alternate=P.exp?Lo(P.exp,vl(S,E,h++),ru):vl(S,E,h++)}else t.onError(ct(30,P.loc))}else if(R){r=!0;const M=R.forParseResult;M?(Fh(M),l.push(Et(t.helper(Oc),[M.source,ja(Mo(M),vl(S,E),!0)]))):t.onError(ct(32,R.loc))}else{if(C){if(p.has(C)){t.onError(ct(38,T));continue}p.add(C),C==="default"&&(d=!0)}i.push(_t(S,E))}}if(!o){const I=(O,y)=>{const v=s(O,void 0,y,a);return t.compatConfig&&(v.isNonScopedSlot=!0),_t("default",v)};c?u.length&&!u.every(Bc)&&(d?t.onError(ct(39,u[0].loc)):i.push(I(void 0,u))):i.push(I(void 0,n))}const g=r?2:Al(e.children)?3:1;let x=ws(i.concat(_t("_",Me(g+"",!1))),a);return l.length&&(x=Et(t.helper(mh),[x,ta(l)])),{slots:x,hasDynamicSlots:r}}function vl(e,t,s){const n=[_t("name",e),_t("fn",t)];return s!=null&&n.push(_t("key",Me(String(s),!0))),ws(n)}function Al(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Al(s.children))return!0;break;case 9:if(Al(s.branches))return!0;break;case 10:case 11:if(Al(s.children))return!0;break}}return!1}const $h=new WeakMap,t0=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?s0(e,t):`"${n}"`;const r=Je(l)&&l.callee===Ec;let o,c,d=0,u,p,h,g=r||l===_i||l===kc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const x=Uh(e,t,void 0,i,r);o=x.props,d=x.patchFlag,p=x.dynamicPropNames;const I=x.directives;h=I&&I.length?ta(I.map(O=>a0(O,t))):void 0,x.shouldUseBlock&&(g=!0)}if(e.children.length>0)if(l===Wl&&(g=!0,d|=1024),i&&l!==_i&&l!==Wl){const{slots:I,hasDynamicSlots:O}=e0(e,t);c=I,O&&(d|=1024)}else if(e.children.length===1&&l!==_i){const I=e.children[0],O=I.type,y=O===5||O===8;y&&fs(I,t)===0&&(d|=1),y||O===2?c=I:c=e.children}else c=e.children;p&&p.length&&(u=i0(p)),e.codegenNode=Ui(t,l,o,c,d===0?void 0:d,u,h,!!g,!1,i,e.loc)};function s0(e,t,s=!1){let{tag:n}=e;const a=Po(n),i=Cr(e,"is",!1,!0);if(i)if(a||sa("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Me(i.value.content,!0):(r=i.exp,r||(r=Me("is",!1,i.arg.loc))),r)return Et(t.helper(Ec),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=bh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Cc),t.components.add(n),Hi(n,"component"))}function Uh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let h=!1,g=0,x=!1,I=!1,O=!1,y=!1,v=!1,_=!1;const S=[],b=E=>{c.length&&(d.push(ws(ou(c),r)),c=[]),E&&d.push(E)},T=()=>{t.scopes.vFor>0&&c.push(_t(Me("ref_for",!0),Me("true")))},C=({key:E,value:U})=>{if(ls(E)){const P=E.content,M=ra(P);if(M&&(!n||a)&&P.toLowerCase()!=="onclick"&&P!=="onUpdate:modelValue"&&!dn(P)&&(y=!0),M&&dn(P)&&(_=!0),M&&U.type===14&&(U=U.arguments[0]),U.type===20||(U.type===4||U.type===8)&&fs(U,t)>0)return;P==="ref"?x=!0:P==="class"?I=!0:P==="style"?O=!0:P!=="key"&&!S.includes(P)&&S.push(P),n&&(P==="class"||P==="style")&&!S.includes(P)&&S.push(P)}else v=!0};for(let E=0;E<s.length;E++){const U=s[E];if(U.type===6){const{loc:P,name:M,nameLoc:Z,value:te}=U;let B=!0;if(M==="ref"&&(x=!0,T()),M==="is"&&(Po(l)||te&&te.content.startsWith("vue:")||sa("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(_t(Me(M,!0,Z),Me(te?te.content:"",B,te?te.loc:P)))}else{const{name:P,arg:M,exp:Z,loc:te,modifiers:B}=U,L=P==="bind",N=P==="on";if(P==="slot"){n||t.onError(ct(40,te));continue}if(P==="once"||P==="memo"||P==="is"||L&&Zn(M,"is")&&(Po(l)||sa("COMPILER_IS_ON_ELEMENT",t))||N&&i)continue;if((L&&Zn(M,"key")||N&&p&&Zn(M,"vue:before-update"))&&(h=!0),L&&Zn(M,"ref")&&T(),!M&&(L||N)){if(v=!0,Z)if(L){if(b(),sa("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Z);continue}T(),b(),d.push(Z)}else b({type:14,loc:te,callee:t.helper(Dc),arguments:n?[Z]:[Z,"true"]});else t.onError(ct(L?34:35,te));continue}L&&B.some(_e=>_e.content==="prop")&&(g|=32);const q=t.directiveTransforms[P];if(q){const{props:_e,needRuntime:ve}=q(U,e,t);!i&&_e.forEach(C),N&&M&&!ls(M)?b(ws(_e,r)):c.push(..._e),ve&&(u.push(U),qt(ve)&&$h.set(U,ve))}else Zm(P)||(u.push(U),p&&(h=!0))}}let R;if(d.length?(b(),d.length>1?R=Et(t.helper(Zl),d,r):R=d[0]):c.length&&(R=ws(ou(c),r)),v?g|=16:(I&&!n&&(g|=2),O&&!n&&(g|=4),S.length&&(g|=8),y&&(g|=32)),!h&&(g===0||g===32)&&(x||_||u.length>0)&&(g|=512),!t.inSSR&&R)switch(R.type){case 15:let E=-1,U=-1,P=!1;for(let te=0;te<R.properties.length;te++){const B=R.properties[te].key;ls(B)?B.content==="class"?E=te:B.content==="style"&&(U=te):B.isHandlerKey||(P=!0)}const M=R.properties[E],Z=R.properties[U];P?R=Et(t.helper($i),[R]):(M&&!ls(M.value)&&(M.value=Et(t.helper(Lc),[M.value])),Z&&(O||Z.value.type===4&&Z.value.content.trim()[0]==="["||Z.value.type===17)&&(Z.value=Et(t.helper(Nc),[Z.value])));break;case 14:break;default:R=Et(t.helper($i),[Et(t.helper(Qi),[R])]);break}return{props:R,directives:u,patchFlag:g,dynamicPropNames:S,shouldUseBlock:h}}function ou(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ra(i))&&n0(l,a):(t.set(i,a),s.push(a))}return s}function n0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ta([e.value,t.value],e.loc)}function a0(e,t){const s=[],n=$h.get(e);n?s.push(t.helperString(n)):(t.helper(Ac),t.directives.add(e.name),s.push(Hi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Me("true",!1,a);s.push(ws(e.modifiers.map(l=>_t(l,i)),a))}return ta(s,e.loc)}function i0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Po(e){return e==="component"||e==="Component"}const l0=(e,t)=>{if(Xl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=r0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ja([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Et(t.helper(hh),l,n)}};function r0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=nt(l.name),a.push(l)));else if(l.name==="bind"&&Zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=nt(l.arg.content);s=l.exp=Me(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ls(l.arg)&&(l.arg.content=nt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Uh(e,t,a,!1,!1);n=i,l.length&&t.onError(ct(36,l[0].loc))}return{slotName:s,slotProps:n}}const Bh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ct(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ra(nt(u)):`on:${u}`;r=Me(p,!0,l.loc)}else r=Ms([`${s.helperString(Oo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Oo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=_h(o),p=!(u||lx(o)),h=o.content.includes(";");(p||c&&u)&&(o=Ms([`${p?"$event":"(...args)"} => ${h?"{":"("}`,o,h?"}":")"]))}let d={props:[_t(r,o||Me("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},o0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=nt(i.content):i.content=`${s.helperString(Io)}(${i.content})`:(i.children.unshift(`${s.helperString(Io)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&cu(i,"."),n.some(r=>r.content==="attr")&&cu(i,"^")),{props:[_t(i,l)]}},cu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},c0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Zr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Zr(o))n||(n=s[i]=Ms([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Zr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&fs(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Et(t.helper(Tc),r)}}}}},du=new WeakSet,d0=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return du.has(e)||t.inVOnce||t.inSSR?void 0:(du.add(e),t.inVOnce=!0,t.helper(Jl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Hh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ct(41,e.loc)),ii();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ct(44,n.loc)),ii();if(r==="literal-const"||r==="setup-const")return s.onError(ct(45,n.loc)),ii();if(!l.trim()||!_h(n))return s.onError(ct(42,n.loc)),ii();const o=a||Me("modelValue",!0),c=a?ls(a)?`onUpdate:${nt(a.content)}`:Ms(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ms([`${u} => ((`,n,") = $event)"]);const p=[_t(o,e.exp),_t(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(x=>x.content).map(x=>(Uc(x)?x:JSON.stringify(x))+": true").join(", "),g=a?ls(a)?`${a.content}Modifiers`:Ms([a,' + "Modifiers"']):"modelModifiers";p.push(_t(g,Me(`{ ${h} }`,!1,e.loc,2)))}return ii(p)};function ii(e=[]){return{props:e}}const u0=/[\w).+\-_$\]]/,f0=(e,t)=>{sa("COMPILER_FILTERS",t)&&(e.type===5?tr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&tr(s.exp,t)}))};function tr(e,t){if(e.type===4)uu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?uu(n,t):n.type===8?tr(e,t):n.type===5&&tr(n.content,t))}}function uu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,h,g,x=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!r&&!o&&!c)g===void 0?(d=h+1,g=s.slice(0,h).trim()):I();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let O=h-1,y;for(;O>=0&&(y=s.charAt(O),y===" ");O--);(!y||!u0.test(y))&&(l=!0)}}g===void 0?g=s.slice(0,h).trim():d!==0&&I();function I(){x.push(s.slice(d,h).trim()),d=h+1}if(x.length){for(h=0;h<x.length;h++)g=p0(g,x[h],t);e.content=g,e.ast=void 0}}function p0(e,t,s){s.helper(Rc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Hi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Hi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const fu=new WeakSet,h0=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||fu.has(e)||t.inSSR?void 0:(fu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Fc(n,t),e.codegenNode=Et(t.helper(Pc),[s.exp,ja(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},m0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ct(53,n.loc)),s.exp=Me("",!0,n.loc);else{const a=nt(n.content);(yh.test(a[0])||a[0]==="-")&&(s.exp=Me(a,!1,n.loc))}}}};function g0(e){return[[m0,d0,Gx,h0,Zx,f0,l0,t0,Qx,c0],{on:Bh,bind:o0,model:Hh}]}function v0(e,t={}){const s=t.onError||$c,n=t.mode==="module";t.prefixIdentifiers===!0?s(ct(48)):n&&s(ct(49));const a=!1;t.cacheHandlers&&s(ct(50)),t.scopeId&&!n&&s(ct(51));const i=Ue({},t,{prefixIdentifiers:a}),l=Ne(e)?wx(e,i):e,[r,o]=g0();return Ex(l,Ue({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Ue({},o,t.directiveTransforms||{})})),Ox(l,i)}const b0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vh=Symbol(""),jh=Symbol(""),zh=Symbol(""),qh=Symbol(""),Fo=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Zh=Symbol(""),Jh=Symbol("");Zy({[Vh]:"vModelRadio",[jh]:"vModelCheckbox",[zh]:"vModelText",[qh]:"vModelSelect",[Fo]:"vModelDynamic",[Gh]:"withModifiers",[Kh]:"withKeys",[Wh]:"vShow",[Zh]:"Transition",[Jh]:"TransitionGroup"});let va;function y0(e,t=!1){return va||(va=document.createElement("div")),t?(va.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,va.children[0].getAttribute("foo")):(va.innerHTML=e,va.textContent)}const x0={parseMode:"html",isVoidTag:fg,isNativeTag:e=>cg(e)||dg(e)||ug(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:y0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Zh;if(e==="TransitionGroup"||e==="transition-group")return Jh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},_0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Me("style",!0,t.loc),exp:k0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},k0=(e,t)=>{const s=cf(e);return Me(JSON.stringify(s),!1,t,3)};function Pn(e,t){return ct(e,t)}const w0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(54,a)),t.children.length&&(s.onError(Pn(55,a)),t.children.length=0),{props:[_t(Me("innerHTML",!0,a),n||Me("",!0))]}},S0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(56,a)),t.children.length&&(s.onError(Pn(57,a)),t.children.length=0),{props:[_t(Me("textContent",!0),n?fs(n,s)>0?n:Et(s.helperString(Tr),[n],a):Me("",!0))]}},T0=(e,t,s)=>{const n=Hh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Pn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=zh,r=!1;if(a==="input"||i){const o=Cr(t,"type");if(o){if(o.type===7)l=Fo;else if(o.value)switch(o.value.content){case"radio":l=Vh;break;case"checkbox":l=jh;break;case"file":r=!0,s.onError(Pn(60,e.loc));break}}else rx(t)&&(l=Fo)}else a==="select"&&(l=qh);r||(n.needRuntime=s.helper(l))}else s.onError(Pn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},C0=ms("passive,once,capture"),E0=ms("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),A0=ms("left,right"),Yh=ms("onkeyup,onkeydown,onkeypress"),R0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Bi("COMPILER_V_ON_NATIVE",s)||C0(o)?l.push(o):A0(o)?ls(e)?Yh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):E0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},pu=(e,t)=>ls(e)&&e.content.toLowerCase()==="onclick"?Me(t,!0):e.type!==4?Ms(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,I0=(e,t,s)=>Bh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=R0(i,a,s,e.loc);if(o.includes("right")&&(i=pu(i,"onContextmenu")),o.includes("middle")&&(i=pu(i,"onMouseup")),o.length&&(l=Et(s.helper(Gh),[l,JSON.stringify(o)])),r.length&&(!ls(i)||Yh(i.content.toLowerCase()))&&(l=Et(s.helper(Kh),[l,JSON.stringify(r)])),c.length){const d=c.map(ca).join("");i=ls(i)?Me(`${i.content}${d}`,!0):Ms(["(",i,`) + "${d}"`])}return{props:[_t(i,l)]}}),O0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(62,a)),{props:[],needRuntime:s.helper(Wh)}},L0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},N0=[_0],D0={cloak:b0,html:w0,text:S0,model:T0,on:I0,show:O0};function M0(e,t={}){return v0(e,Ue({},x0,t,{nodeTransforms:[L0,...N0,...t.nodeTransforms||[]],directiveTransforms:Ue({},D0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hu=Object.create(null);function P0(e,t){if(!Ne(e))if(e.nodeType)e=e.innerHTML;else return Pt;const s=Qm(e,t),n=hu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Ue({hoistStatic:!0,onError:void 0,onWarn:Pt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=M0(e,a),l=new Function("Vue",i)(jy);return l._rc=!0,hu[s]=l}Dp(P0);const sr=$n({items:[]});let F0=1;function Rr(e,t="info",s=3e3){const n=F0++;return sr.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>jc(n),s),n}function jc(e){const t=sr.items.findIndex(s=>s.id===e);t>=0&&sr.items.splice(t,1)}function Se(e,t="info",s=3e3){return Rr(e,t,s)}Se.success=(e,t=3e3)=>Rr(e,"success",t);Se.error=(e,t=5e3)=>Rr(e,"error",t);Se.info=(e,t=3e3)=>Rr(e,"info",t);Se.dismiss=jc;const $0={setup(){return{state:sr,dismiss:jc}},template:`
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
  `},nn=$n({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ma=null;function hs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ma&&Ma(!1),nn.title=e,nn.message=t,nn.confirmLabel=s,nn.cancelLabel=n,nn.danger=a,nn.open=!0,new Promise(i=>{Ma=i})}function mu(e){nn.open=!1,Ma&&(Ma(e),Ma=null)}const U0={setup(){function e(t){nn.open&&t.key==="Escape"&&(t.stopPropagation(),mu(!1))}return qe(()=>document.addEventListener("keydown",e,!0)),bt(()=>document.removeEventListener("keydown",e,!0)),{state:nn,settle:mu}},template:`
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
 */const wa=typeof document<"u";function Qh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function B0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Qh(e.default)}const et=Object.assign;function Yr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Fs(a)?a.map(e):e(a)}return s}const ki=()=>{},Fs=Array.isArray;function gu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Xh=/#/g,H0=/&/g,V0=/\//g,j0=/=/g,z0=/\?/g,em=/\+/g,q0=/%5B/g,G0=/%5D/g,tm=/%5E/g,K0=/%60/g,sm=/%7B/g,W0=/%7C/g,nm=/%7D/g,Z0=/%20/g;function zc(e){return e==null?"":encodeURI(""+e).replace(W0,"|").replace(q0,"[").replace(G0,"]")}function J0(e){return zc(e).replace(sm,"{").replace(nm,"}").replace(tm,"^")}function $o(e){return zc(e).replace(em,"%2B").replace(Z0,"+").replace(Xh,"%23").replace(H0,"%26").replace(K0,"`").replace(sm,"{").replace(nm,"}").replace(tm,"^")}function Y0(e){return $o(e).replace(j0,"%3D")}function Q0(e){return zc(e).replace(Xh,"%23").replace(z0,"%3F")}function X0(e){return Q0(e).replace(V0,"%2F")}function ji(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const e_=/\/$/,t_=e=>e.replace(e_,"");function Qr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=i_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ji(l)}}function s_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function vu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function n_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ga(t.matched[n],s.matched[a])&&am(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ga(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function am(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!a_(e[s],t[s]))return!1;return!0}function a_(e,t){return Fs(e)?bu(e,t):Fs(t)?bu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function bu(e,t){return Fs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function i_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const An={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Uo=(function(e){return e.pop="pop",e.push="push",e})({}),Xr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function l_(e){if(!e)if(wa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),t_(e)}const r_=/^[^#]+#/;function o_(e,t){return e.replace(r_,"#")+t}function c_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Ir=()=>({left:window.scrollX,top:window.scrollY});function d_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=c_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function yu(e,t){return(history.state?history.state.position-t:-1)+e}const Bo=new Map;function u_(e,t){Bo.set(e,t)}function f_(e){const t=Bo.get(e);return Bo.delete(e),t}function p_(e){return typeof e=="string"||e&&typeof e=="object"}function im(e){return typeof e=="string"||typeof e=="symbol"}let ht=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const lm=Symbol("");ht.MATCHER_NOT_FOUND+"",ht.NAVIGATION_GUARD_REDIRECT+"",ht.NAVIGATION_ABORTED+"",ht.NAVIGATION_CANCELLED+"",ht.NAVIGATION_DUPLICATED+"";function Ka(e,t){return et(new Error,{type:e,[lm]:!0},t)}function Qs(e,t){return e instanceof Error&&lm in e&&(t==null||!!(e.type&t))}const h_=["params","query","hash"];function m_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of h_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function g_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(em," "),i=a.indexOf("="),l=ji(i<0?a:a.slice(0,i)),r=i<0?null:ji(a.slice(i+1));if(l in t){let o=t[l];Fs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function xu(e){let t="";for(let s in e){const n=e[s];if(s=Y0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Fs(n)?n.map(a=>a&&$o(a)):[n&&$o(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function v_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Fs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const b_=Symbol(""),_u=Symbol(""),Or=Symbol(""),qc=Symbol(""),Ho=Symbol("");function li(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Dn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(Ka(ht.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):p_(p)?o(Ka(ht.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function eo(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Qh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Dn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=B0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Dn(p,s,n,l,r,a)()}))}}return i}function y_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ga(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ga(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let x_=()=>location.protocol+"//"+location.host;function rm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),vu(r,"")}return vu(s,e)+n+a}function __(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const h=rm(e,location),g=s.value,x=t.value;let I=0;if(p){if(s.value=h,t.value=p,l&&l===g){l=null;return}I=x?p.position-x.position:0}else n(h);a.forEach(O=>{O(s.value,g,{delta:I,type:Uo.pop,direction:I?I>0?Xr.forward:Xr.back:Xr.unknown})})};function o(){l=s.value}function c(p){a.push(p);const h=()=>{const g=a.indexOf(p);g>-1&&a.splice(g,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(et({},p.state,{scroll:Ir()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function ku(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Ir():null}}function k_(e){const{history:t,location:s}=window,n={value:rm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:x_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(o,c){i(o,et({},t.state,ku(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=et({},a.value,t.state,{forward:o,scroll:Ir()});i(d.current,d,!0),i(o,et({},ku(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function w_(e){e=l_(e);const t=k_(e),s=__(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=et({location:"",base:e,go:n,createHref:o_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function S_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),w_(e)}let Yn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var St=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(St||{});const T_={type:Yn.Static,value:""},C_=/[a-zA-Z0-9_]/;function E_(e){if(!e)return[[]];if(e==="/")return[[T_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=St.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===St.Static?i.push({type:Yn.Static,value:c}):s===St.Param||s===St.ParamRegExp||s===St.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Yn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==St.ParamRegExp){n=s,s=St.EscapeNext;continue}switch(s){case St.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=St.Param):p();break;case St.EscapeNext:p(),s=n;break;case St.Param:o==="("?s=St.ParamRegExp:C_.test(o)?p():(u(),s=St.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case St.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=St.ParamRegExpEnd:d+=o;break;case St.ParamRegExpEnd:u(),s=St.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===St.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const wu="[^/]+?",A_={sensitive:!1,strict:!1,start:!0,end:!0};var Wt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Wt||{});const R_=/[.+*?^${}()[\]/\\]/g;function I_(e,t){const s=et({},A_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Wt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=Wt.Segment+(s.sensitive?Wt.BonusCaseSensitive:0);if(p.type===Yn.Static)u||(a+="/"),a+=p.value.replace(R_,"\\$&"),h+=Wt.Static;else if(p.type===Yn.Param){const{value:g,repeatable:x,optional:I,regexp:O}=p;i.push({name:g,repeatable:x,optional:I});const y=O||wu;if(y!==wu){h+=Wt.BonusCustomRegExp;try{`${y}`}catch(_){throw new Error(`Invalid custom RegExp for param "${g}" (${y}): `+_.message)}}let v=x?`((?:${y})(?:/(?:${y}))*)`:`(${y})`;u||(v=I&&c.length<2?`(?:/${v})`:"/"+v),I&&(v+="?"),a+=v,h+=Wt.Dynamic,I&&(h+=Wt.BonusOptional),x&&(h+=Wt.BonusRepeatable),y===".*"&&(h+=Wt.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Wt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",g=i[p-1];u[g.name]=h&&g.repeatable?h.split("/"):h}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===Yn.Static)d+=h.value;else if(h.type===Yn.Param){const{value:g,repeatable:x,optional:I}=h,O=g in c?c[g]:"";if(Fs(O)&&!x)throw new Error(`Provided param "${g}" is an array but it is not repeatable (* or + modifiers)`);const y=Fs(O)?O.join("/"):O;if(!y)if(I)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${g}"`);d+=y}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function O_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Wt.Static+Wt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Wt.Static+Wt.Segment?1:-1:0}function om(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=O_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Su(n))return 1;if(Su(a))return-1}return a.length-n.length}function Su(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const L_={strict:!1,end:!0,sensitive:!1};function N_(e,t,s){const n=I_(E_(e.path),s),a=et(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function D_(e,t){const s=[],n=new Map;t=gu(L_,t);function a(u){return n.get(u)}function i(u,p,h){const g=!h,x=Cu(u);x.aliasOf=h&&h.record;const I=gu(t,u),O=[x];if("alias"in u){const _=typeof u.alias=="string"?[u.alias]:u.alias;for(const S of _)O.push(Cu(et({},x,{components:h?h.record.components:x.components,path:S,aliasOf:h?h.record:x})))}let y,v;for(const _ of O){const{path:S}=_;if(p&&S[0]!=="/"){const b=p.record.path,T=b[b.length-1]==="/"?"":"/";_.path=p.record.path+(S&&T+S)}if(y=N_(_,p,I),h?h.alias.push(y):(v=v||y,v!==y&&v.alias.push(y),g&&u.name&&!Eu(y)&&l(u.name)),cm(y)&&o(y),x.children){const b=x.children;for(let T=0;T<b.length;T++)i(b[T],y,h&&h.children[T])}h=h||y}return v?()=>{l(v)}:ki}function l(u){if(im(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=F_(u,s);s.splice(p,0,u),u.record.name&&!Eu(u)&&n.set(u.record.name,u)}function c(u,p){let h,g={},x,I;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw Ka(ht.MATCHER_NOT_FOUND,{location:u});I=h.record.name,g=et(Tu(p.params,h.keys.filter(v=>!v.optional).concat(h.parent?h.parent.keys.filter(v=>v.optional):[]).map(v=>v.name)),u.params&&Tu(u.params,h.keys.map(v=>v.name))),x=h.stringify(g)}else if(u.path!=null)x=u.path,h=s.find(v=>v.re.test(x)),h&&(g=h.parse(x),I=h.record.name);else{if(h=p.name?n.get(p.name):s.find(v=>v.re.test(p.path)),!h)throw Ka(ht.MATCHER_NOT_FOUND,{location:u,currentLocation:p});I=h.record.name,g=et({},p.params,u.params),x=h.stringify(g)}const O=[];let y=h;for(;y;)O.unshift(y.record),y=y.parent;return{name:I,path:x,params:g,matched:O,meta:P_(O)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Tu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Cu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:M_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function M_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Eu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function P_(e){return e.reduce((t,s)=>et(t,s.meta),{})}function F_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;om(e,t[i])<0?n=i:s=i+1}const a=$_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function $_(e){let t=e;for(;t=t.parent;)if(cm(t)&&om(e,t)===0)return t}function cm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Au(e){const t=Ss(Or),s=Ss(qc),n=W(()=>{const o=Gs(e.to);return t.resolve(o)}),a=W(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Ga.bind(null,d));if(p>-1)return p;const h=Ru(o[c-2]);return c>1&&Ru(d)===h&&u[u.length-1].path!==h?u.findIndex(Ga.bind(null,o[c-2])):p}),i=W(()=>a.value>-1&&j_(s.params,n.value.params)),l=W(()=>a.value>-1&&a.value===s.matched.length-1&&am(s.params,n.value.params));function r(o={}){if(V_(o)){const c=t[Gs(e.replace)?"replace":"push"](Gs(e.to)).catch(ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:W(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function U_(e){return e.length===1?e[0]:e}const B_=Wi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Au,setup(e,{slots:t}){const s=$n(Au(e)),{options:n}=Ss(Or),a=W(()=>({[Iu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Iu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&U_(t.default(s));return e.custom?i:Ua("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),H_=B_;function V_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function j_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Fs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Ru(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Iu=(e,t,s)=>e??t??s,z_=Wi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ss(Ho),a=W(()=>e.route||n.value),i=Ss(_u,0),l=W(()=>{let c=Gs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=W(()=>a.value.matched[l.value]);vi(_u,W(()=>l.value+1)),vi(b_,r),vi(Ho,a);const o=m();return Yt(()=>[o.value,r.value,e.name],([c,d,u],[p,h,g])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!Ga(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(x=>x(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Ou(s.default,{Component:p,route:c});const h=u.props[d],g=h?h===!0?c.params:typeof h=="function"?h(c):h:null,I=Ua(p,et({},g,t,{onVnodeUnmounted:O=>{O.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Ou(s.default,{Component:I,route:c})||I}}});function Ou(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const q_=z_;function G_(e){const t=D_(e.routes,e),s=e.parseQuery||g_,n=e.stringifyQuery||xu,a=e.history,i=li(),l=li(),r=li(),o=tc(An);let c=An;wa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Yr.bind(null,H=>""+H),u=Yr.bind(null,X0),p=Yr.bind(null,ji);function h(H,oe){let re,ge;return im(H)?(re=t.getRecordMatcher(H),ge=oe):ge=H,t.addRoute(ge,re)}function g(H){const oe=t.getRecordMatcher(H);oe&&t.removeRoute(oe)}function x(){return t.getRoutes().map(H=>H.record)}function I(H){return!!t.getRecordMatcher(H)}function O(H,oe){if(oe=et({},oe||o.value),typeof H=="string"){const A=Qr(s,H,oe.path),$=t.resolve({path:A.path},oe),Y=a.createHref(A.fullPath);return et(A,$,{params:p($.params),hash:ji(A.hash),redirectedFrom:void 0,href:Y})}let re;if(H.path!=null)re=et({},H,{path:Qr(s,H.path,oe.path).path});else{const A=et({},H.params);for(const $ in A)A[$]==null&&delete A[$];re=et({},H,{params:u(A)}),oe.params=u(oe.params)}const ge=t.resolve(re,oe),he=H.hash||"";ge.params=d(p(ge.params));const De=s_(n,et({},H,{hash:J0(he),path:ge.path})),k=a.createHref(De);return et({fullPath:De,hash:he,query:n===xu?v_(H.query):H.query||{}},ge,{redirectedFrom:void 0,href:k})}function y(H){return typeof H=="string"?Qr(s,H,o.value.path):et({},H)}function v(H,oe){if(c!==H)return Ka(ht.NAVIGATION_CANCELLED,{from:oe,to:H})}function _(H){return T(H)}function S(H){return _(et(y(H),{replace:!0}))}function b(H,oe){const re=H.matched[H.matched.length-1];if(re&&re.redirect){const{redirect:ge}=re;let he=typeof ge=="function"?ge(H,oe):ge;return typeof he=="string"&&(he=he.includes("?")||he.includes("#")?he=y(he):{path:he},he.params={}),et({query:H.query,hash:H.hash,params:he.path!=null?{}:H.params},he)}}function T(H,oe){const re=c=O(H),ge=o.value,he=H.state,De=H.force,k=H.replace===!0,A=b(re,ge);if(A)return T(et(y(A),{state:typeof A=="object"?et({},he,A.state):he,force:De,replace:k}),oe||re);const $=re;$.redirectedFrom=oe;let Y;return!De&&n_(n,ge,re)&&(Y=Ka(ht.NAVIGATION_DUPLICATED,{to:$,from:ge}),ve(ge,ge,!0,!1)),(Y?Promise.resolve(Y):E($,ge)).catch(G=>Qs(G)?Qs(G,ht.NAVIGATION_GUARD_REDIRECT)?G:_e(G):N(G,$,ge)).then(G=>{if(G){if(Qs(G,ht.NAVIGATION_GUARD_REDIRECT))return T(et({replace:k},y(G.to),{state:typeof G.to=="object"?et({},he,G.to.state):he,force:De}),oe||$)}else G=P($,ge,!0,k,he);return U($,ge,G),G})}function C(H,oe){const re=v(H,oe);return re?Promise.reject(re):Promise.resolve()}function R(H){const oe=F.values().next().value;return oe&&typeof oe.runWithContext=="function"?oe.runWithContext(H):H()}function E(H,oe){let re;const[ge,he,De]=y_(H,oe);re=eo(ge.reverse(),"beforeRouteLeave",H,oe);for(const A of ge)A.leaveGuards.forEach($=>{re.push(Dn($,H,oe))});const k=C.bind(null,H,oe);return re.push(k),xe(re).then(()=>{re=[];for(const A of i.list())re.push(Dn(A,H,oe));return re.push(k),xe(re)}).then(()=>{re=eo(he,"beforeRouteUpdate",H,oe);for(const A of he)A.updateGuards.forEach($=>{re.push(Dn($,H,oe))});return re.push(k),xe(re)}).then(()=>{re=[];for(const A of De)if(A.beforeEnter)if(Fs(A.beforeEnter))for(const $ of A.beforeEnter)re.push(Dn($,H,oe));else re.push(Dn(A.beforeEnter,H,oe));return re.push(k),xe(re)}).then(()=>(H.matched.forEach(A=>A.enterCallbacks={}),re=eo(De,"beforeRouteEnter",H,oe,R),re.push(k),xe(re))).then(()=>{re=[];for(const A of l.list())re.push(Dn(A,H,oe));return re.push(k),xe(re)}).catch(A=>Qs(A,ht.NAVIGATION_CANCELLED)?A:Promise.reject(A))}function U(H,oe,re){r.list().forEach(ge=>R(()=>ge(H,oe,re)))}function P(H,oe,re,ge,he){const De=v(H,oe);if(De)return De;const k=oe===An,A=wa?history.state:{};re&&(ge||k?a.replace(H.fullPath,et({scroll:k&&A&&A.scroll},he)):a.push(H.fullPath,he)),o.value=H,ve(H,oe,re,k),_e()}let M;function Z(){M||(M=a.listen((H,oe,re)=>{if(!ee.listening)return;const ge=O(H),he=b(ge,ee.currentRoute.value);if(he){T(et(he,{replace:!0,force:!0}),ge).catch(ki);return}c=ge;const De=o.value;wa&&u_(yu(De.fullPath,re.delta),Ir()),E(ge,De).catch(k=>Qs(k,ht.NAVIGATION_ABORTED|ht.NAVIGATION_CANCELLED)?k:Qs(k,ht.NAVIGATION_GUARD_REDIRECT)?(T(et(y(k.to),{force:!0}),ge).then(A=>{Qs(A,ht.NAVIGATION_ABORTED|ht.NAVIGATION_DUPLICATED)&&!re.delta&&re.type===Uo.pop&&a.go(-1,!1)}).catch(ki),Promise.reject()):(re.delta&&a.go(-re.delta,!1),N(k,ge,De))).then(k=>{k=k||P(ge,De,!1),k&&(re.delta&&!Qs(k,ht.NAVIGATION_CANCELLED)?a.go(-re.delta,!1):re.type===Uo.pop&&Qs(k,ht.NAVIGATION_ABORTED|ht.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),U(ge,De,k)}).catch(ki)}))}let te=li(),B=li(),L;function N(H,oe,re){_e(H);const ge=B.list();return ge.length?ge.forEach(he=>he(H,oe,re)):console.error(H),Promise.reject(H)}function q(){return L&&o.value!==An?Promise.resolve():new Promise((H,oe)=>{te.add([H,oe])})}function _e(H){return L||(L=!H,Z(),te.list().forEach(([oe,re])=>H?re(H):oe()),te.reset()),H}function ve(H,oe,re,ge){const{scrollBehavior:he}=e;if(!wa||!he)return Promise.resolve();const De=!re&&f_(yu(H.fullPath,0))||(ge||!re)&&history.state&&history.state.scroll||null;return Ct().then(()=>he(H,oe,De)).then(k=>k&&d_(k)).catch(k=>N(k,H,oe))}const le=H=>a.go(H);let pe;const F=new Set,ee={currentRoute:o,listening:!0,addRoute:h,removeRoute:g,clearRoutes:t.clearRoutes,hasRoute:I,getRoutes:x,resolve:O,options:e,push:_,replace:S,go:le,back:()=>le(-1),forward:()=>le(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:B.add,isReady:q,install(H){H.component("RouterLink",H_),H.component("RouterView",q_),H.config.globalProperties.$router=ee,Object.defineProperty(H.config.globalProperties,"$route",{enumerable:!0,get:()=>Gs(o)}),wa&&!pe&&o.value===An&&(pe=!0,_(a.location).catch(ge=>{}));const oe={};for(const ge in An)Object.defineProperty(oe,ge,{get:()=>o.value[ge],enumerable:!0});H.provide(Or,ee),H.provide(qc,ec(oe)),H.provide(Ho,o);const re=H.unmount;F.add(H),H.unmount=function(){F.delete(H),F.size<1&&(c=An,M&&M(),M=null,o.value=An,pe=!1,L=!1),re()}}};function xe(H){return H.reduce((oe,re)=>oe.then(()=>R(re)),Promise.resolve())}return ee}function dm(){return Ss(Or)}function K_(e){return Ss(qc)}const Lr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=K_(),s=dm(),n=W({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=W(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=W(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});Yt(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},W_={setup(){const e=m([]),t=m([]),s=m({}),n=50;function a(p){var x,I,O,y,v;const h=p.payload||p,g=h.type||p.type;if(g==="tool_start"){const _=((x=h.metadata)==null?void 0:x.call_id)||null,S={callId:_,id:_||`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:((I=h.metadata)==null?void 0:I.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(S);return}if(g==="tool_end"){const _=((O=h.metadata)==null?void 0:O.call_id)||null;let S=-1;if(_&&(S=e.value.findIndex(b=>b.callId===_&&b.status==="running")),S<0&&!_)for(let b=e.value.length-1;b>=0;b--){const T=e.value[b];if(T.tool===h.action&&T.status==="running"){S=b;break}}if(S>=0){const b=e.value[S];b.status=(y=h.metadata)!=null&&y.error?"error":"success",b.elapsed=((v=h.metadata)==null?void 0:v.elapsed_ms)||Date.now()-b.startTime,b.result=h.detail||"",b.fadingOut=!0,setTimeout(()=>{const T=e.value.indexOf(b);T>=0&&e.value.splice(T,1),t.value.unshift(b),t.value.length>n&&t.value.pop()},5e3)}return}if(g==="tool_stream"){const _=h.call_id||h.tool_name||"unknown";if(h.finished){const S={...s.value};delete S[_],s.value=S}else{const b=((s.value[_]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[_]:b.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let r=!1;function o(){r||(r=!0,ze.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,ze.off("events",a),i&&(clearInterval(i),i=null))}qe(o),Es(o),As(c),bt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
  `};function Gc(e){if(e instanceof Date)return e;if(typeof e=="string"){const t=new Date(e);return isNaN(t.getTime())?null:t}return typeof e=="number"&&isFinite(e)?new Date(e<1e12?e*1e3:e):null}function ua(e){const t=Gc(e);return t?t.toLocaleString(void 0,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"}function Kc(e){const t=Gc(e);return t?t.toLocaleTimeString():"—"}function um(e){const t=Gc(e);if(!t)return"—";const s=Math.max(0,Math.floor((Date.now()-t.getTime())/1e3));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`}function Wa(e){if(e==null||!isFinite(e))return"—";const t=Math.max(0,Math.round(e));if(t<60)return`${t}s`;if(t<3600){const a=Math.floor(t/60),i=t%60;return i?`${a}m ${i}s`:`${a}m`}const s=Math.floor(t/3600),n=Math.floor(t%3600/60);return n?`${s}h ${n}m`:`${s}h`}function Wc(e,t=200){const s=String(e??"");return s.length>t?s.slice(0,t)+"…":s}function fm(e,t=5e3){const s=String(e??"");return s.length>t?s.slice(0,t)+`
... (truncated)`:s}function Lu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function pm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function hm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const mm=Symbol("agent-detail-cancelled"),Z_=15e3;function J_(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((h,g)=>{o=h,c=g});function u(h,g){r||(r=!0,l!==null&&a(l),l=null,(h?o:c)(g))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return r||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,mm),i==null||i.abort()}}}function gm({state:e,requestDetail:t,timeoutMs:s=Z_,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:h,coalesce:g}){if(!p)return Promise.resolve();if(g&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const x={agentId:p,cancel:null,promise:null};l=x,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const I=J_(O=>t(p,{signal:O}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return x.cancel=I.cancel,x.promise=(async()=>{let O=null,y=null;try{O=await I.promise}catch(v){y=v}O!==mm&&(l!==x||e.detailId!==p||(l=null,!y&&(O===null||typeof O!="object")&&(y=new Error(`${n} response was empty or invalid`)),y?e.detail===null&&(e.detailError=(y==null?void 0:y.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=O,e.detailError=null),e.detailLoading=!1))})(),x.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Y_({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const Q_={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m(!0),i=m("all");let l=!1;const r=W(()=>e.value.filter(N=>N.status==="running").length),o=W(()=>e.value.filter(N=>N.status==="completed").length),c=W(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=W(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=W(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function p(N){const q=Number(N.max_iterations)||0;return q<=0?0:Math.min(100,Math.round(N.iteration_count/q*100))}function h(N){return(Number(N.max_iterations)||0)>0}function g(N,q){return N?N==="N/A"?"N/A":q==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function x(N){return g(N.display_model,N.display_model_source||N.display_source)}function I(N){return g(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function O(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const y=m(null),v=m(null),_=m(!1),S=m(null),b=m(""),C=gm({state:{get detail(){return y.value},set detail(N){y.value=N},get detailId(){return v.value},set detailId(N){v.value=N},get detailLoading(){return _.value},set detailLoading(N){_.value=N},get detailError(){return S.value},set detailError(N){S.value=N}},requestDetail:(N,{signal:q})=>K.get(`/api/agents/${encodeURIComponent(N)}`,{signal:q})});async function R(N){b.value="",await C.open(N.id)}function E(){C.close(),b.value=""}async function U(){await C.refresh()}async function P(N,q){try{await navigator.clipboard.writeText(q||""),b.value=N,setTimeout(()=>{b.value===N&&(b.value="")},1500)}catch{Se.error("Copy failed")}}async function M(N=!1){N=N===!0,N||(t.value=!0);try{const q=await K.get("/api/agents");e.value=Array.isArray(q)?q:[],s.value=null}catch(q){N||(s.value=q.message)}N||(t.value=!1)}async function Z(N){const q=e.value.find(ve=>ve.id===N);if(await hs({title:"Kill agent",message:`Kill agent "${(q==null?void 0:q.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=N;try{await K.del(`/api/agents/${encodeURIComponent(N)}`),Se.success("Agent killed"),await M()}catch(ve){Se.error(ve.message||"Failed to kill agent")}n.value=null}}const te=Y_({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!v.value,refreshDetail:U});function B(){te.start()}function L(){te.stop()}return Yt(a,()=>te.sync()),qe(()=>{l=!0,M(),B()}),Es(()=>{l=!0,M(!0),B()}),As(()=>{l=!1,L()}),bt(()=>{l=!1,L(),C.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ua,formatDuration:Wa,progressPercent:p,hasProgress:h,displayModelText:x,displayEffortText:I,displaySourceLabel:O,detail:y,detailId:v,detailLoading:_,detailError:S,copied:b,openDetail:R,closeDetail:E,copyText:P,fetchAgents:M,killAgent:Z,startAutoRefresh:B,stopAutoRefresh:L}}},X_={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!1),a=m({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=m(!1),l=m(null),r=m(null),o=m(null),c=m(null),d=m(null),u=m(!1),p=m(null),h=m("");let g=!1;const I=gm({state:{get detail(){return c.value},set detail(L){c.value=L},get detailId(){return d.value},set detailId(L){d.value=L},get detailLoading(){return u.value},set detailLoading(L){u.value=L},get detailError(){return p.value},set detailError(L){p.value=L}},detailLabel:"Loop detail",requestDetail:(L,{signal:N})=>K.get(`/api/loops/${encodeURIComponent(L)}?limit=100`,{signal:N})});async function O(L){h.value="",await I.open(L.id)}function y(){I.close(),h.value=""}async function v(L,N){try{await navigator.clipboard.writeText(N||""),h.value=L,setTimeout(()=>{h.value===L&&(h.value="")},1500)}catch{Se.error("Copy failed")}}const _=W(()=>e.value.reduce((L,N)=>L+(N.iteration_count||0),0)),S=W(()=>e.value.filter(L=>L.status==="running").length);function b(L){return L==="running"?"loop-status-running":L==="error"?"loop-status-error":"loop-status-stopped"}function T(L){return L==="running"?"badge-success":L==="error"?"badge-danger":L==="completed"?"badge-info":"badge-warning"}function C(L){return L==="act"?"badge-warning":L==="silent"?"badge-info":"badge-success"}async function R(L=!1){L=L===!0,L||(t.value=!0);try{const N=await K.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){L||(s.value=N.message)}L||(t.value=!1)}async function E(){l.value=null;const L=a.value;if(!L.goal.trim()){l.value="Goal is required";return}if(!L.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:L.goal.trim(),channel_id:L.channel_id.trim(),interval_seconds:L.interval_seconds||60,mode:L.mode,max_iterations:L.max_iterations||50};L.stop_condition.trim()&&(N.stop_condition=L.stop_condition.trim()),i.value=!0;try{const q=await K.post("/api/loops",N);Se.success(`Loop started: ${q.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await R()}catch(q){l.value=q.message}i.value=!1}async function U(L){if(await hs({title:"Stop loop",message:`Stop loop ${L}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=L;try{await K.del(`/api/loops/${encodeURIComponent(L)}`),Se.success("Loop stopped"),await R()}catch(q){Se.error(q.message||"Failed to stop loop")}r.value=null}}async function P(L){o.value=L;try{await K.post(`/api/loops/${encodeURIComponent(L)}/restart`),Se.success("Loop restarted"),await R()}catch(N){Se.error(N.message||"Failed to restart loop")}o.value=null}function M(L){g&&L.payload&&(L.payload.loop_id||L.payload.type==="loop")&&(R(!0),d.value&&I.refresh())}let Z=null;function te(){Z!==null&&clearInterval(Z),Z=null}function B(){te(),g&&(Z=setInterval(()=>{R(!0),d.value&&I.refresh()},5e3))}return qe(()=>{g=!0,R(),ze.subscribe("events",M),B()}),Es(()=>{g=!0,R(!0),B()}),As(()=>{g=!1,te()}),bt(()=>{g=!1,ze.unsubscribe("events",M),te(),I.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:_,runningCount:S,statusDotClass:b,statusBadge:T,modeBadge:C,formatAge:um,formatDuration:Wa,formatTs:ua,formatTokens:hm,openDetail:O,closeDetail:y,copyText:v,fetchLoops:R,doCreate:E,doStop:U,doRestart:P}}},ek={template:`
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

    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!0);let a=null;const i=m(null),l=W(()=>e.value.filter(y=>y.status==="running").length),r=W(()=>e.value.filter(y=>y.status!=="running").length);function o(y){return y==="running"?"loop-status-running":y==="failed"||y==="error"?"loop-status-error":"loop-status-stopped"}function c(y){return y==="running"?"badge-success":y==="completed"||y==="exited"?"badge-info":y==="killed"||y==="error"||y==="failed"?"badge-danger":"badge-warning"}async function d(y=!1){y=y===!0,y||(t.value=!0);try{e.value=await K.get("/api/processes"),s.value=null}catch(v){y||(s.value=v.message)}y||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Yt(n,y=>{y?u():p()});async function h(y){if(await hs({title:"Kill process",message:`Kill process ${y}?`,confirmLabel:"Kill",danger:!0})){i.value=y;try{await K.del(`/api/processes/${y}`),Se.success(`Process ${y} killed`),await d()}catch(_){Se.error(_.message||"Failed to kill process")}i.value=null}}function g(y){y.payload&&(y.payload.pid||y.payload.type==="process")&&d(!0)}let x=!1;function I(){x||(x=!0,d(),ze.subscribe("events",g),u())}function O(){x&&(x=!1,ze.unsubscribe("events",g),p())}return qe(I),Es(I),As(O),bt(O),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Wa,fetchProcesses:d,doKill:h}}},tk=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Nu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function sk(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function nk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function ak(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=tk.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),g=[];for(const I of new Set([p,h])){const O=new Date(u+I*6e4);sk(O,c)===d&&(g.some(y=>y.getTime()===O.getTime())||g.push(O))}if(g.sort((I,O)=>I.getTime()-O.getTime()),g.length===0)return{state:"nonexistent",typed:t};if(g.length>1)return{state:"ambiguous",typed:t,options:g.map(I=>({instant:I,offset:nk(I),iso:I.toISOString()}))};const x=g[0];return{state:"ok",typed:t,instant:x,iso:x.toISOString()}}const ik={template:`
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

    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!1),a=m({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=m(!1),l=m(null),r=m(null),o=W(()=>ak(a.value.run_at));Yt(()=>a.value.run_at,()=>{r.value=null});const c=W(()=>{var ee;const F=o.value;return F.state==="ok"?F.instant:F.state==="ambiguous"&&r.value!==null&&((ee=F.options[r.value])==null?void 0:ee.instant)||null}),d=W(()=>{const F=c.value;return F?`${F.toLocaleString()} local — ${F.toISOString()} UTC`:""}),u=m(null),p=m(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],g=m(null),x=m(null),I=m(null),O=m(null),y=m(null),v=m([]),_=m(!1),S=m("");let b=0;const T=W(()=>e.value.filter(F=>F.cron&&!F.one_time).length),C=W(()=>e.value.filter(F=>F.one_time).length),R=W(()=>e.value.filter(F=>F.trigger).length),E=W(()=>e.value.filter(F=>F.paused).length),U=W(()=>e.value.filter(F=>F.consecutive_failures>0).length);function P(F){if(!F)return"-";const ee=Date.now(),H=(new Date(F).getTime()-ee)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const re=Math.floor(H/3600),ge=Math.floor(H%3600/60);return ge>0?`in ${re}h ${ge}m`:`in ${re}h`}const oe=Math.floor(H/86400);return`in ${oe} day${oe!==1?"s":""}`}function M(F){return F==null?"-":F<1e3?`${F}ms`:F<6e4?`${(F/1e3).toFixed(1)}s`:Wa(F/1e3)}function Z(F=a.value.cron){a.value.cron=F,Nu(a.value,"cron"),u.value=null}function te(F=a.value.run_at){a.value.run_at=F,Nu(a.value,"run_at"),u.value=null}async function B(){const F=a.value.cron.trim();if(F){p.value=!0;try{u.value=await K.post("/api/schedules/validate-cron",{expression:F})}catch(ee){u.value={valid:!1,error:ee.message}}p.value=!1}}async function L(){t.value=!0,s.value=null;try{e.value=await K.get("/api/schedules")}catch(F){s.value=F.message}t.value=!1}async function N(F){if(y.value===F){y.value=null,v.value=[];return}y.value=F,_.value=!0,v.value=[];const ee=++b;try{const xe=await K.get(`/api/schedules/${encodeURIComponent(F)}/history?limit=10`);if(ee!==b||y.value!==F)return;v.value=xe,S.value=""}catch(xe){if(ee!==b||y.value!==F)return;v.value=[],S.value=xe.message||"Failed to load execution history"}ee===b&&(_.value=!1)}async function q(){l.value=null;const F=a.value;if(!F.description.trim()){l.value="Description is required";return}if(!F.channel_id.trim()){l.value="Channel ID is required";return}if(!F.cron.trim()&&!F.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(F.cron.trim()&&F.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const ee={description:F.description.trim(),action:F.action,channel_id:F.channel_id.trim()};if(F.cron.trim()&&(ee.cron=F.cron.trim()),F.run_at.trim()){const xe=o.value;if(xe.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(xe.state==="invalid"){l.value="One-time run time is not a valid date";return}const H=c.value;if(xe.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!H){l.value="One-time run time could not be resolved";return}ee.run_at=H.toISOString()}if(F.action==="reminder"&&F.message.trim()&&(ee.message=F.message.trim()),F.action==="check"&&(F.tool_name.trim()&&(ee.tool_name=F.tool_name.trim()),F.tool_input_str.trim()))try{ee.tool_input=JSON.parse(F.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await K.post("/api/schedules",ee),Se.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await L()}catch(xe){l.value=xe.message}i.value=!1}async function _e(F){g.value=F;try{const ee=await K.post(`/api/schedules/${encodeURIComponent(F)}/run`);if(ee.status==="failure")Se.error(`Execution failed: ${ee.error||"unknown error"}`);else{const xe=ee.warning?`Executed (${ee.warning})`:"Executed successfully";Se.success(xe)}await L()}catch(ee){Se.error(ee.message||"Failed to trigger")}g.value=null}async function ve(F){I.value=F.id;const ee=!F.paused;try{await K.put(`/api/schedules/${encodeURIComponent(F.id)}`,{paused:ee}),Se.success(ee?"Schedule paused":"Schedule resumed"),await L()}catch(xe){Se.error(xe.message||"Failed to update schedule")}I.value=null}async function le(F){O.value=F;try{await K.post(`/api/schedules/${encodeURIComponent(F)}/reset-failures`),Se.success("Failure counters reset"),await L()}catch(ee){Se.error(ee.message||"Failed to reset")}O.value=null}async function pe(F){const ee=e.value.find(H=>H.id===F);if(await hs({title:"Delete schedule",message:`Delete "${(ee==null?void 0:ee.description)||F}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){x.value=F;try{await K.del(`/api/schedules/${encodeURIComponent(F)}`),Se.success("Schedule deleted"),await L()}catch(H){Se.error(H.message||"Failed to delete schedule")}x.value=null}}return qe(()=>{L()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:h,runningId:g,deletingId:x,togglingId:I,resettingId:O,expandedId:y,history:v,historyLoading:_,historyError:S,cronCount:T,oneTimeCount:C,webhookCount:R,pausedCount:E,failingCount:U,formatTs:ua,formatAge:um,formatFuture:P,formatMs:M,formatDuration:Wa,onCronInput:Z,onRunAtInput:te,validateCron:B,toggleExpand:N,fetchSchedules:L,doCreate:q,doRunNow:_e,doTogglePause:ve,doResetFailures:le,doDelete:pe}}},vm=[{id:"live",label:"Live",component:W_},{id:"agents",label:"Agents",component:Q_},{id:"loops",label:"Loops",component:X_},{id:"processes",label:"Processes",component:ek},{id:"schedules",label:"Schedules",component:ik}],lk={components:{TabbedPage:Lr},setup(){return{tabs:vm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},rk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await K.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return qe(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ua,formatDetail:i,truncateBlock:fm,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Du=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],ok=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],ck={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m(null),i=m(!1);let l=0;const r=m(null),o=m(!1),c=m(new Set),d=m(!1),u=m("all"),p=m(""),h=m("last_active"),g=m(!1),x=Du,I=ok,O=m([]),y=m(!1),v=m(""),_=m("flat"),S=m(new Set),b=m(""),T=m(""),C=m(""),R=m(null),E=m(!1);function U(){try{const j=localStorage.getItem("odin-session-presets");j&&(O.value=JSON.parse(j))}catch{}}function P(){try{localStorage.setItem("odin-session-presets",JSON.stringify(O.value))}catch{}}const M=W(()=>p.value.trim()!==""||u.value!=="all"),Z=W(()=>{let j=[...e.value];const ye=Du.find(Ve=>Ve.id===u.value),Re=ye?ye.filters:{};if(Re.source&&(j=j.filter(Ve=>Ve.source===Re.source)),Re.minMessages&&(j=j.filter(Ve=>Ve.message_count>=Re.minMessages)),Re.hasCompaction&&(j=j.filter(Ve=>Ve.has_summary)),Re.maxAge!=null){const Ve=Date.now()/1e3;j=j.filter(ft=>ft.last_active&&Ve-ft.last_active<=Re.maxAge)}if(p.value.trim()){const Ve=p.value.toLowerCase().trim();j=j.filter(ft=>(ft.channel_id||"").toLowerCase().includes(Ve)||(ft.last_user_id||"").toLowerCase().includes(Ve)||(ft.source||"").toLowerCase().includes(Ve))}const Le=h.value,He=g.value?1:-1;return j.sort((Ve,ft)=>{const es=Ve[Le]||0,vs=ft[Le]||0;return(es-vs)*He}),j}),te=W(()=>{if(!a.value||!a.value.messages)return[];const j=a.value.messages;if(j.length===0)return[];const ye=[];let Re=[];for(const Le of j)Le.role==="user"&&Re.length>0&&(ye.push(Re),Re=[]),Re.push(Le);return Re.length>0&&ye.push(Re),ye}),B=W(()=>Z.value.length>0&&c.value.size===Z.value.length);function L(j){const ye=j.find(Re=>Re.role==="user");if(ye&&ye.content){const Re=ye.content.slice(0,120);return Re.length<ye.content.length?Re+"...":Re}return"(no user message)"}function N(j){const ye=new Set(S.value);ye.has(j)?ye.delete(j):ye.add(j),S.value=ye}function q(j){u.value=j}function _e(j){u.value=j.id,j.filters.searchQuery!=null&&(p.value=j.filters.searchQuery),j.filters.sortBy&&(h.value=j.filters.sortBy)}function ve(){if(!v.value.trim())return;const j={id:"custom-"+Date.now(),name:v.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};O.value=[...O.value,j],P(),y.value=!1,v.value=""}function le(j){O.value=O.value.filter(ye=>ye.id!==j),P(),u.value===j&&(u.value="all")}function pe(){u.value="all",p.value="",h.value="last_active",g.value=!1}function F(j){if(!j)return"—";const ye=Date.now()/1e3-j;if(ye<60)return"just now";if(ye<3600){const Le=Math.floor(ye/60);return`${Le} minute${Le!==1?"s":""} ago`}if(ye<86400){const Le=Math.floor(ye/3600);return`${Le} hour${Le!==1?"s":""} ago`}const Re=Math.floor(ye/86400);return`${Re} day${Re!==1?"s":""} ago`}function ee(j){if(!j)return"";try{return new Date(j*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function xe(j){if(!j)return"";try{return new Date(j*1e3).toLocaleString()}catch{return""}}function H(j){return j==="user"?"bg-gray-900/50 border border-gray-800":j==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function oe(j){return j==="user"?"sess-msg-user":j==="assistant"?"sess-msg-assistant":"sess-msg-system"}function re(j){return j==="user"?"badge-info":j==="assistant"?"badge-success":"badge-warning"}function ge(j){return j==="user"?"sess-dot-user":j==="assistant"?"sess-dot-assistant":"sess-dot-system"}function he(j){return j==="user"?"text-cyan-400":j==="assistant"?"text-indigo-400":"text-gray-500"}function De(j){return j?j.length>2e3?j.slice(0,2e3)+`
... (truncated)`:j:""}async function k(){const j=b.value.trim();if(j){E.value=!0;try{let ye=`/api/sessions/search?q=${encodeURIComponent(j)}&limit=50`;T.value.trim()&&(ye+=`&channel_id=${encodeURIComponent(T.value.trim())}`),C.value.trim()&&(ye+=`&user_id=${encodeURIComponent(C.value.trim())}`);const Re=await K.get(ye);R.value=Re.results||[]}catch{R.value=[]}E.value=!1}}function A(){b.value="",T.value="",C.value="",R.value=null}function $(j){return j?j.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function Y(j){return j==="user"?"fts-result-user":j==="assistant"?"fts-result-assistant":j==="summary"?"fts-result-summary":j==="fts"?"fts-result-fts":j==="channel"?"fts-result-channel":"fts-result-default"}function G(j){return j==="user"?"badge-info":j==="assistant"?"badge-success":j==="summary"?"badge-warning":j==="fts"?"badge-success":"badge-info"}async function J(){t.value=!0,s.value=null;try{e.value=await K.get("/api/sessions")}catch(j){s.value=j.message}t.value=!1}function ie(){s.value=null,J()}async function ne(j){if(n.value===j){n.value=null,a.value=null,S.value=new Set;return}n.value=j,a.value=null,i.value=!0,S.value=new Set;const ye=++l;try{const Re=await K.get(`/api/sessions/${encodeURIComponent(j)}`);ye===l&&n.value===j&&(a.value=Re)}catch(Re){ye===l&&n.value===j&&(a.value={messages:[],summary:"",error:Re.message||"Failed to load session"})}finally{ye===l&&(i.value=!1)}}function se(j){const ye=new Set(c.value);ye.has(j)?ye.delete(j):ye.add(j),c.value=ye}function X(){B.value?c.value=new Set:c.value=new Set(Z.value.map(j=>j.channel_id))}function be(j){r.value=j}async function ce(){if(r.value){o.value=!0;try{await K.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await J()}catch(j){s.value=j.message||"Failed to clear session"}o.value=!1,r.value=null}}function ue(){d.value=!0}async function ke(){if(c.value.size!==0){o.value=!0;try{await K.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await J()}catch(j){s.value=j.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Te(j,ye){const Re=`/api/sessions/${encodeURIComponent(j)}/export?format=${ye}`;try{const Le=await K.getBlob(Re),He=URL.createObjectURL(Le),Ve=document.createElement("a");Ve.href=He,Ve.download=`session-${j}.${ye==="text"?"txt":"json"}`,Ve.click(),URL.revokeObjectURL(He)}catch(Le){s.value=Le.message||"Failed to export session"}}let Ce=null;function Ie(j){j.payload&&j.payload.channel_id&&(clearTimeout(Ce),Ce=setTimeout(()=>{if(J(),n.value&&j.payload.channel_id===n.value){const ye=n.value,Re=l;K.get(`/api/sessions/${encodeURIComponent(ye)}`).then(Le=>{Re!==l||n.value!==ye||(a.value=Le)}).catch(()=>{})}},2e3))}let Pe=!1;function $e(){Pe||(Pe=!0,J(),ze.subscribe("events",Ie))}qe(()=>{U(),$e()}),Es(()=>{$e()});function Xe(){Pe&&(Pe=!1,ze.unsubscribe("events",Ie),clearTimeout(Ce))}return As(Xe),bt(Xe),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:B,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:g,filterPresets:x,sortOptions:I,filteredSessions:Z,hasActiveFilters:M,customPresets:O,showSavePreset:y,newPresetName:v,threadView:_,threads:te,collapsedThreads:S,ftsQuery:b,ftsChannelId:T,ftsUserId:C,ftsResults:R,ftsSearching:E,formatAge:F,formatTimestamp:ee,formatFullTimestamp:xe,messageClass:H,threadMsgClass:oe,roleBadge:re,roleDotClass:ge,roleLabelClass:he,truncateContent:De,threadSummary:L,fetchSessions:J,retry:ie,toggleSession:ne,toggleSelect:se,toggleSelectAll:X,confirmClear:be,clearSession:ce,confirmBulkClear:ue,doBulkClear:ke,exportSession:Te,applyPreset:q,applyCustomPreset:_e,saveCustomPreset:ve,removeCustomPreset:le,resetFilters:pe,toggleThread:N,runFtsSearch:k,clearFtsSearch:A,highlightSnippet:$,ftsResultClass:Y,ftsTypeBadge:G}}},dk={props:["trace"],template:`
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
  `,setup(){return{formatTokens:hm}}},uk={components:{ContextAssemblyPanel:dk},template:`
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
    </div>`,setup(){const e=m([]),t=m([]),s=m(!0),n=m(null),a=m(null),i=m(null),l=m(""),r=m(""),o=m(0),c=m({}),d=m({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(T){if(!T)return"—";try{const C=new Date(T);return isNaN(C.getTime())?T:C.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return T}}function p(T){return!T&&T!==0?"—":T<1e3?T+"ms":(T/1e3).toFixed(1)+"s"}function h(T){return!T&&T!==0?"—":T>=1e3?(T/1e3).toFixed(1)+"k":String(T)}function g(T){if(!T)return"";if(typeof T=="string")return T;try{return JSON.stringify(T,null,2)}catch{return String(T)}}function x(T){a.value===T?a.value=null:(a.value=T,c.value={})}function I(T,C){const R=T+"-"+C;c.value={...c.value,[R]:!c.value[R]}}function O(T,C){return!!c.value[T+"-"+C]}function y(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,S()}async function v(){try{const T=await K.get("/api/trajectories");e.value=T.files||[],o.value=T.count||0}catch{}}let _=0;async function S(){const T=++_;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const C=await K.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(T!==_)return;let R=C.entries||[];d.value.tool_name&&(R=R.filter(E=>(E.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(R=R.filter(E=>E.is_error)),d.value.channel_id&&(R=R.filter(E=>E.channel_id===d.value.channel_id)),d.value.user_id&&(R=R.filter(E=>E.user_id===d.value.user_id)),t.value=R}else{const C=new URLSearchParams;d.value.channel_id&&C.set("channel_id",d.value.channel_id),d.value.user_id&&C.set("user_id",d.value.user_id),d.value.tool_name&&C.set("tool_name",d.value.tool_name),d.value.errors_only&&C.set("errors_only","true"),C.set("limit",String(d.value.limit));const R=C.toString(),E=await K.get(`/api/trajectories/search/query?${R}`);if(T!==_)return;t.value=E.results||[]}}catch(C){if(T!==_)return;n.value=C.message}T===_&&(s.value=!1)}async function b(){if(!l.value.trim())return;const T=++_;s.value=!0,n.value=null,c.value={};try{const C=await K.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(T!==_)return;i.value=C.entry||null,i.value||(n.value="No trace found for this message ID")}catch(C){if(T!==_)return;C.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=C.message}T===_&&(s.value=!1)}return qe(async()=>{await v(),await S()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:g,truncateBlock:fm,toggleExpand:x,toggleIteration:I,isIterationExpanded:O,clearFilters:y,fetchFiles:v,fetchTraces:S,lookupMessage:b}}},fk={template:`
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
  `,setup(){const e=m(!0),t=m(null),s=m(!1),n=m({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=m({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=m("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=W(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const g=await K.get("/api/usage");n.value=g,a.value=g.totals||a.value,t.value=null,s.value=!0}catch(g){t.value=g.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function h(){u&&(u=!1,l&&(clearInterval(l),l=null))}return qe(p),Es(p),As(h),bt(h),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:pm,formatTime:Kc,retry:d}}},bm=[{id:"audit",label:"Audit",component:rk},{id:"sessions",label:"Sessions",component:ck},{id:"traces",label:"Traces",component:uk},{id:"usage",label:"Usage",component:fk}],pk={components:{TabbedPage:Lr},setup(){return{tabs:bm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},to=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],hk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(""),a=m({}),i=m({}),l=m("cards"),r=m(null),o=W(()=>e.value.filter(y=>y.is_core).length),c=W(()=>e.value.filter(y=>!y.is_core).length),d=W(()=>Object.values(a.value).reduce((y,v)=>y+v,0));function u(y){for(const v of to)if(v.id!=="other"&&v.match(y))return v.id;return"other"}const p=W(()=>{let y=e.value;if(n.value){const v=n.value.toLowerCase();y=y.filter(_=>_.name.toLowerCase().includes(v)||(_.description||"").toLowerCase().includes(v))}return r.value&&(y=y.filter(v=>u(v.name)===r.value)),y}),h=W(()=>{const y=new Set;for(const v of e.value)y.add(u(v.name));return to.filter(v=>y.has(v.id))}),g=W(()=>{const y=p.value,v={};for(const S of y){const b=u(S.name);v[b]||(v[b]=[]),v[b].push(S)}const _=[];for(const S of to)v[S.id]&&v[S.id].length>0&&_.push({label:S.label,icon:S.icon,tools:v[S.id].sort((b,T)=>b.name.localeCompare(T.name))});return _});function x(y){i.value={...i.value,[y]:!i.value[y]}}async function I(){t.value=!0,s.value=null;try{const[y,v]=await Promise.all([K.get("/api/tools"),K.get("/api/tools/stats").catch(()=>({}))]);e.value=y,a.value=v||{};const _=Object.values(v||{}).filter(S=>S>0).sort((S,b)=>S-b)}catch(y){s.value=y.message}t.value=!1}function O(){I()}return qe(()=>{I()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:p,groupedTools:g,usedCategories:h,truncate:Wc,toggleExpand:x,refresh:O}}};function mk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function gk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const vk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m({}),a=m({}),i=m(null),l=m(""),r=m(null),o=m(!1),c=m("create"),d=m(""),u=m(""),p=m(null),h=m(null),g=m(!1),x=m(null),I=m(null),O=m(!1),y=W(()=>e.value.length),v=W(()=>e.value.reduce((F,ee)=>F+(ee.execution_count||0),0)),_=W(()=>e.value.reduce((F,ee)=>F+E(ee.code),0)),S=W(()=>{if(!l.value)return e.value;const F=l.value.toLowerCase();return e.value.filter(ee=>ee.name.toLowerCase().includes(F)||(ee.description||"").toLowerCase().includes(F))}),b=W(()=>u.value?u.value.split(`
`).length:0),T=W(()=>{const F=Math.max(b.value,1);return Array.from({length:F},(ee,xe)=>xe+1).join(`
`)}),C=W(()=>{const F=u.value.trim();return F?F.includes("SKILL_DEFINITION")?F.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function R(F){return mk(F)}function E(F){return F?F.split(`
`).length:0}function U(F){return gk(F)}function P(F){n.value={...n.value,[F]:!n.value[F]}}async function M(F){try{await navigator.clipboard.writeText(F);const ee=e.value.find(xe=>xe.code===F);ee&&(r.value=ee.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function Z(F){if(F.key==="Tab"){F.preventDefault();const ee=F.target,xe=ee.selectionStart,H=ee.selectionEnd;u.value=u.value.substring(0,xe)+"    "+u.value.substring(H),Ct(()=>{ee.selectionStart=ee.selectionEnd=xe+4})}}function te(F){const ee=F.target.previousElementSibling;ee&&(ee.scrollTop=F.target.scrollTop)}async function B(){t.value=!0,s.value=null;try{e.value=await K.get("/api/skills")}catch(F){s.value=F.message}t.value=!1}async function L(F){i.value=F,delete a.value[F],a.value={...a.value};try{const ee=await K.post(`/api/skills/${encodeURIComponent(F)}/test`);a.value={...a.value,[F]:ee}}catch(ee){a.value={...a.value,[F]:{result:ee.message,is_error:!0}}}i.value=null}function N(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function q(F){o.value=!0,c.value="edit",d.value=F.name,u.value=F.code||"",p.value=null,h.value=null}function _e(){o.value=!1,p.value=null,h.value=null}async function ve(){p.value=null,h.value=null;const F=d.value.trim(),ee=u.value.trim();if(!F){p.value="Name is required";return}if(!ee){p.value="Code is required";return}g.value=!0;try{c.value==="create"?(await K.post("/api/skills",{name:F,code:ee}),h.value="Skill created successfully"):(await K.put(`/api/skills/${encodeURIComponent(F)}`,{code:ee}),h.value="Skill updated successfully"),await B(),setTimeout(()=>{o.value=!1},800)}catch(xe){p.value=xe.message}g.value=!1}function le(F){I.value=F}async function pe(){if(I.value){O.value=!0;try{await K.del(`/api/skills/${encodeURIComponent(I.value)}`),await B()}catch(F){Se.error(`Failed to delete skill: ${F.message||"unknown error"}`)}O.value=!1,I.value=null}}return qe(()=>{B()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:g,editorRef:x,deleteTarget:I,deleting:O,enabledCount:y,totalExecutions:v,totalLines:_,displayedSkills:S,editLineCount:b,editorLineNums:T,editValidation:C,highlight:R,truncate:Wc,formatTs:ua,countLines:E,getLineNumbers:U,toggleCode:P,copyCode:M,handleEditorKey:Z,syncScroll:te,fetchSkills:B,testSkill:L,showCreate:N,editSkill:q,cancelEdit:_e,saveSkill:ve,confirmDelete:le,doDelete:pe}}};function bk(e,t){if(!e||!t)return Lu(e);const s=Lu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const yk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(""),a=m(null),i=m(!1),l=m(""),r=m(null),o=m(!1),c=m(""),d=m(""),u=m(null),p=m(null),h=m(!1),g=m(null),x=m(null);let I=null;const O=m(null),y=m(!1),v=m({}),_=m({}),S=m(null),b=m(null),T=W(()=>e.value.reduce((N,q)=>N+(q.chunks||0),0)),C=W(()=>new Set(e.value.map(q=>q.uploader).filter(Boolean)).size);function R(N,q){const _e=_.value[q];if(!_e||_e.length===0)return 0;const ve=Math.max(..._e.map(le=>le.char_count||0));return ve===0?0:Math.round(N.char_count/ve*100)}async function E(){t.value=!0,s.value=null;try{const N=await K.get("/api/knowledge");e.value=Array.isArray(N)?N:[]}catch(N){s.value=N.message}t.value=!1}async function U(N){if(v.value[N]){v.value[N]=!1,b.value=null;return}if(v.value[N]=!0,!(_.value[N]||S.value===N)){S.value=N;try{const q=await K.get(`/api/knowledge/${encodeURIComponent(N)}/chunks`);_.value[N]=Array.isArray(q)?q:[]}catch(q){_.value[N]=[],Se.error(`Failed to load chunks: ${q.message}`)}S.value=null}}async function P(){const N=n.value.trim();if(N){i.value=!0,r.value=null,l.value=N;try{const q=await K.get(`/api/knowledge/search?q=${encodeURIComponent(N)}`);a.value=Array.isArray(q)?q:[]}catch(q){a.value=[],r.value=q.message||"Search failed"}i.value=!1}}function M(){a.value=null,n.value="",r.value=null}async function Z(){u.value=null,p.value=null;const N=c.value.trim(),q=d.value.trim();if(!N){u.value="Source name is required";return}if(!q){u.value="Content is required";return}h.value=!0;try{const _e=await K.post("/api/knowledge",{source:N,content:q});p.value=`Ingested ${_e.chunks||0} chunks from "${N}"`,c.value="",d.value="",_.value={},await E(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(_e){u.value=_e.message}h.value=!1}async function te(N){g.value=N,x.value=null,I&&(clearTimeout(I),I=null);try{const q=await K.post(`/api/knowledge/${encodeURIComponent(N)}/reingest`);x.value={source:N,error:!1,message:`Re-ingested ${q.chunks||0} chunks`},delete _.value[N],await E(),I=setTimeout(()=>{x.value=null,I=null},3e3)}catch(q){x.value={source:N,error:!0,message:q.message}}g.value=null}function B(N){O.value=N}async function L(){if(O.value){y.value=!0;try{await K.del(`/api/knowledge/${encodeURIComponent(O.value)}`),delete _.value[O.value],await E()}catch(N){Se.error(`Failed to delete source: ${N.message||"unknown error"}`)}y.value=!1,O.value=null}}return qe(()=>{E()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:g,reingestResult:x,deleteTarget:O,deleting:y,expanded:v,sourceChunks:_,loadingChunks:S,selectedChunk:b,totalChunks:T,uploaderCount:C,truncate:Wc,formatTs:ua,highlightTerms:bk,chunkBarWidth:R,fetchSources:E,toggleSource:U,doSearch:P,clearSearch:M,doIngest:Z,doReingest:te,confirmDelete:B,doDelete:L}}},xk={template:`
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
    </div>`,setup(){const e=m([]),t=m({}),s=m(!0),n=m(null),a=m({}),i=m(null),l=m(""),r=m(!1),o=m({scope:"global",key:"",value:""}),c=m(!1),d=m(null),u=m(null),p=m(null),h=m(""),g=m(!1),x=m(null),I=m(null),O=m(new Set),y=m(null),v=m(!1),_=m(!1),S=W(()=>e.value.reduce((le,pe)=>le+pe.count,0)),b=W(()=>O.value.size);function T(le){const pe=t.value[le];if(!pe)return[];if(!l.value.trim())return pe;const F=l.value.trim().toLowerCase();return pe.filter(ee=>ee.key.toLowerCase().includes(F)||ee.value&&ee.value.toLowerCase().includes(F))}function C(le,pe){return O.value.has(le+"/"+pe)}function R(le,pe){const F=le+"/"+pe,ee=new Set(O.value);ee.has(F)?ee.delete(F):ee.add(F),O.value=ee}function E(le){const pe=t.value[le];return!pe||pe.length===0?!1:pe.every(F=>O.value.has(le+"/"+F.key))}function U(le,pe){const F=t.value[le];if(!F)return;const ee=new Set(O.value);for(const xe of F){const H=le+"/"+xe.key;pe?ee.add(H):ee.delete(H)}O.value=ee}async function P(){s.value=!0,n.value=null;try{const le=await K.get("/api/memory");e.value=Object.entries(le).map(([pe,F])=>({name:pe,keys:F.keys||[],count:F.count||0}))}catch(le){n.value=le.message}s.value=!1}async function M(le){if(a.value[le]){a.value[le]=!1;return}a.value[le]=!0;const pe=e.value.find(ee=>ee.name===le);if(!pe||t.value[le]||i.value===le)return;i.value=le;let F;try{const xe=(await K.get(`/api/memory/${encodeURIComponent(le)}`)).entries||{};F=pe.keys.map(H=>Object.prototype.hasOwnProperty.call(xe,H)?{key:H,value:xe[H]||"",failed:!1}:{key:H,value:"",failed:!0,error:"Not found in scope"})}catch(ee){F=pe.keys.map(xe=>({key:xe,value:"",failed:!0,error:ee.message||"Failed to load"}))}t.value[le]=F,i.value=null}function Z(le,pe,F){p.value=le+"/"+pe,h.value=F}async function te(le,pe){g.value=!0,x.value=null;try{await K.put(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(pe)}`,{value:h.value});const F=t.value[le];if(F){const ee=F.find(xe=>xe.key===pe);ee&&(ee.value=h.value)}p.value=null}catch(F){x.value=`Failed to save: ${F.message||"unknown error"}`}g.value=!1}async function B(le,pe){try{await navigator.clipboard.writeText(pe.value),I.value=le+"/"+pe.key,setTimeout(()=>{I.value=null},1500)}catch{}}async function L(){d.value=null,u.value=null;const le=o.value.scope.trim(),pe=o.value.key.trim(),F=o.value.value.trim();if(!le){d.value="Scope is required";return}if(!pe){d.value="Key is required";return}if(!F){d.value="Value is required";return}c.value=!0;try{await K.put(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(pe)}`,{value:F}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await P(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(ee){d.value=ee.message}c.value=!1}function N(le,pe){y.value={scope:le,key:pe}}async function q(){if(!y.value)return;v.value=!0,x.value=null;const{scope:le,key:pe}=y.value;try{await K.del(`/api/memory/${encodeURIComponent(le)}/${encodeURIComponent(pe)}`);const F=t.value[le];F&&(t.value[le]=F.filter(H=>H.key!==pe));const ee=e.value.find(H=>H.name===le);ee&&(ee.count--,ee.keys=ee.keys.filter(H=>H!==pe));const xe=new Set(O.value);xe.delete(le+"/"+pe),O.value=xe}catch(F){x.value=`Failed to delete: ${F.message||"unknown error"}`}v.value=!1,y.value=null}function _e(){_.value=!0}async function ve(){v.value=!0,x.value=null;const le=[];for(const pe of O.value){const F=pe.indexOf("/");le.push({scope:pe.slice(0,F),key:pe.slice(F+1)})}try{await K.post("/api/memory/bulk-delete",{entries:le}),O.value=new Set,t.value={},await P()}catch(pe){x.value=`Bulk delete failed: ${pe.message||"unknown error"}`}v.value=!1,_.value=!1}return qe(()=>{P()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:g,actionError:x,copied:I,selected:O,selectedCount:b,totalEntries:S,deleteTarget:y,deleting:v,showBulkDelete:_,fetchMemory:P,toggleScope:M,startEdit:Z,doEdit:te,copyValue:B,doAdd:L,confirmDelete:N,doDelete:q,confirmBulkDelete:_e,doBulkDelete:ve,isSelected:C,toggleSelect:R,isScopeAllSelected:E,toggleSelectAll:U,filteredEntries:T}}},_k={template:`
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
  `,setup(){const e=m([]),t=m(null),s=m(!0),n=m(null),a=m(null),i=m(null),l=m(""),r=W(()=>[...new Set(e.value.map(I=>I.category))].sort()),o=W(()=>{const x={};return e.value.forEach(I=>{x[I.category]=(x[I.category]||0)+1}),x}),c=W(()=>a.value?e.value.filter(x=>x.category===a.value):e.value);function d(x){return x==="correction"?"badge-warning":x==="operational"?"badge-info":x==="preference"?"badge-success":"badge-info"}function u(x){i.value=x.key,l.value=x.content}async function p(x){try{await K.put("/api/learned/"+encodeURIComponent(x),{content:l.value}),i.value=null,Se.success("Entry updated"),await g()}catch(I){Se.error(I.message||"Failed to save entry")}}async function h(x){if(await hs({title:"Delete learned entry",message:`Delete "${x}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/learned/"+encodeURIComponent(x)),Se.success("Entry deleted"),await g()}catch(O){Se.error(O.message||"Failed to delete entry")}}async function g(){s.value=!0,n.value=null;try{const x=await K.get("/api/learned");e.value=x.entries||[],t.value={last_reflection:x.last_reflection,count:x.count}}catch(x){n.value=x.message}s.value=!1}return qe(g),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ua,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:g}}},ym=[{id:"tools",label:"Tools",component:hk},{id:"skills",label:"Skills",component:vk},{id:"knowledge",label:"Knowledge",component:yk},{id:"memory",label:"Memory",component:xk},{id:"learned",label:"Learned",component:_k}],kk={components:{TabbedPage:Lr},setup(){return{tabs:ym}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},wk={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},Sk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},Tk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Ck={template:`
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
    </div>`,setup(){const e=m({}),t=m(!0),s=m(null),n=m(!1),a=m(!1),i=W(()=>e.value.components||[]),l=W(()=>Tk[e.value.overall]||"text-gray-400"),r=W(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=W(()=>{const b=e.value.overall;return b==="healthy"?"All Systems Healthy":b==="degraded"?"Some Systems Degraded":b==="unhealthy"?"System Issues Detected":"Unknown"});function c(b){return wk[b]||"text-gray-400"}function d(b){return Sk[b]||"info"}function u(b){return b==="ok"?"badge-success":b==="degraded"?"badge-warning":b==="down"?"badge-danger":"badge-info"}function p(b){return b==="closed"?"text-green-400":b==="half_open"?"text-yellow-400":b==="open"?"text-red-400":"text-gray-400"}function h(b){return b.replace(/_/g," ").replace(/\b\w/g,T=>T.toUpperCase())}function g(b){if(!b)return"—";try{return new Date(b).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return b}}function x(b){return b>=1e6?(b/1e6).toFixed(1)+"M":b>=1e3?(b/1e3).toFixed(1)+"K":String(b)}async function I(){a.value=!0;try{e.value=await K.get("/api/health/components"),s.value=null,n.value=!0}catch(b){s.value=b.message}finally{t.value=!1,a.value=!1}}function O(){t.value=!0,s.value=null,I()}let y=null,v=!1;function _(){v||(v=!0,I(),y||(y=setInterval(I,3e4)))}function S(){v&&(v=!1,y&&(clearInterval(y),y=null))}return qe(_),Es(_),As(S),bt(S),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:g,formatNumber:x,fetchHealth:I,retry:O}}},Ek={template:`
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
  `,setup(){const e=m(!0),t=m(null),s=m(!1),n=m(!1),a=m("sessions"),i=m(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=W(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=W(()=>{if(!i.value)return[];const I=i.value,O=I.storage_total_bytes||1;return[{label:"Session Persistence",mb:I.sessions.persist_dir.total_mb,bytes:I.sessions.persist_dir.total_bytes,files:I.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(I.sessions.persist_dir.total_bytes/O*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:I.knowledge.db_file.total_mb,bytes:I.knowledge.db_file.total_bytes,files:I.knowledge.db_file.file_count,pct:Math.min(100,Math.round(I.knowledge.db_file.total_bytes/O*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:I.trajectories.message_dir.total_mb,bytes:I.trajectories.message_dir.total_bytes,files:I.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(I.trajectories.message_dir.total_bytes/O*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:I.trajectories.agent_dir.total_mb,bytes:I.trajectories.agent_dir.total_bytes,files:I.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(I.trajectories.agent_dir.total_bytes/O*100)),color:"res-bar-amber"}]});async function d(){try{const I=await K.get("/api/resource-usage");i.value=I,t.value=null,s.value=!0}catch(I){t.value=I.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function g(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function x(){h&&(h=!1,l&&(clearInterval(l),l=null))}return qe(g),Es(g),As(x),bt(x),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:pm,refresh:u,retry:p}}},Ak=["INFO","WARNING","ERROR"],Rk=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],so=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Ik=[50,100,200,500],Ok={template:`
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
    </div>`,setup(){const e=m("live"),t=m([]),s=m(!1),n=m(!0),a=m(""),i=m(""),l=m(!1),r=m(!1),o=m(ze.state||"disconnected"),c=W(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=m(null),u=m(!1),p=m(null),h=2e3,g=Ak,x=Rk,I=so,O=m("all"),y=m(""),v=m([]),_=m(!1),S=m(""),b=m([]);function T(){try{const V=localStorage.getItem("odin-log-presets");V&&(v.value=JSON.parse(V))}catch{}}function C(){try{localStorage.setItem("odin-log-presets",JSON.stringify(v.value))}catch{}}const R=W(()=>a.value!==""||i.value.trim()!==""||y.value!==""),E=W(()=>{const V=so.find(ae=>ae.value===y.value);return V?V.label:""}),U=W(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),P=24,M=W(()=>{if(_e.value.length===0)return[];const V=[],ae=new Date,Ee=3600*1e3;for(let We=P-1;We>=0;We--){const rt=new Date(ae.getTime()-(We+1)*Ee),Ft=new Date(ae.getTime()-We*Ee);V.push({start:rt,end:Ft,label:L(rt,Ft),shortLabel:Ft.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const We of _e.value){if(!We._time)continue;const rt=We._time.getTime();for(const Ft of V)if(rt>=Ft.start.getTime()&&rt<Ft.end.getTime()){Ft.total++,We.level==="ERROR"?Ft.errors++:We.level==="WARNING"?Ft.warnings++:Ft.info++;break}}return V}),Z=W(()=>{let V=1;for(const ae of M.value)ae.total>V&&(V=ae.total);return V}),te=W(()=>{if(M.value.length===0)return"";const V=_e.value.map(We=>We._time&&We._time.getTime()).filter(Boolean);if(V.length===0)return"";const ae=new Date(Math.min(...V));return`${_e.value.length} shown, oldest ${ae.toLocaleTimeString()}`}),B=W(()=>Math.ceil(P/8));function L(V,ae){const Ee={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Ee)+" - "+ae.toLocaleTimeString([],Ee)}function N(V,ae){return!ae||!V?"0px":Math.max(2,V/ae*100)+"%"}function q(V){const ae=_e.value.findIndex(Ee=>Ee._time&&Ee._time.getTime()>=V.start.getTime()&&Ee._time.getTime()<V.end.getTime());if(ae>=0&&d.value){const Ee=d.value.querySelectorAll(".log-line");Ee[ae]&&(Ee[ae].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const _e=W(()=>{let V=t.value;if(a.value&&(V=V.filter(ae=>(ae.level||"INFO")===a.value)),y.value){const ae=so.find(Ee=>Ee.value===y.value);if(ae&&ae.seconds){const Ee=new Date(Date.now()-ae.seconds*1e3);V=V.filter(We=>We._time&&We._time>=Ee)}}if(i.value&&!U.value)if(l.value)try{const ae=new RegExp(i.value,"i");V=V.filter(Ee=>{const We=Ee.text||Ee.raw||"",rt=Ee.tool||"";return ae.test(We)||ae.test(rt)})}catch{}else{const ae=i.value.toLowerCase();V=V.filter(Ee=>{const We=(Ee.text||Ee.raw||"").toLowerCase(),rt=(Ee.tool||"").toLowerCase();return We.includes(ae)||rt.includes(ae)})}return V});function ve(V){if(V.type==="log"&&V.line)try{const ae=typeof V.line=="string"?JSON.parse(V.line):V.line,Ee=ae.timestamp?new Date(ae.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:ae.error?"ERROR":"INFO",text:ae.tool_name?`[${ae.tool_name}] ${ae.result_summary||""}`.trim():ae.message||JSON.stringify(ae),tool:ae.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const ae=V.payload,Ee=ae.timestamp?new Date(ae.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:ae.error?"ERROR":"INFO",text:ae.tool_name?`[${ae.tool_name}] ${ae.result_summary||""}`.trim():ae.message||JSON.stringify(ae),tool:ae.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function le(V){const ae=ve(V);if(s.value){b.value.push(ae);return}pe(ae)}function pe(V){t.value.push(V),t.value.length>h&&(t.value=t.value.slice(-h)),n.value&&Ct(()=>F())}function F(V=!1){const ae=d.value;ae&&ae.scrollTo({top:ae.scrollHeight,behavior:V?"smooth":"instant"})}function ee(){n.value=!0,u.value=!1,Ct(()=>F(!0))}const xe=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function H(){const V=d.value;if(!V)return;const ae=V.scrollHeight-V.scrollTop-V.clientHeight<40;u.value=!n.value&&!ae&&t.value.length>0,he.value&&oe()}function oe(){const V=d.value;!V||!n.value||V.scrollHeight-V.scrollTop-V.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function re(){n.value&&requestAnimationFrame(oe)}function ge(V){xe.has(V.key)&&re()}const he=m(!1);function De(){n.value&&(he.value=!0,requestAnimationFrame(oe))}function k(){he.value&&(he.value=!1,oe())}function A(){n.value&&(u.value=!1,Ct(()=>F()))}function $(){if(s.value=!s.value,!s.value&&b.value.length>0){for(const V of b.value)pe(V);b.value=[]}}function Y(){t.value=[],b.value=[],u.value=!1}function G(){let V;e.value==="search"?V=Ve.value.map(rt=>{const Ft=rt.error?"ERROR":"INFO",$t=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Ft} ${$t}${rt.result_summary||rt.message||""}`}).join(`
`):V=_e.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const ae=new Blob([V],{type:"text/plain"}),Ee=URL.createObjectURL(ae),We=document.createElement("a");We.href=Ee,We.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,We.click(),URL.revokeObjectURL(Ee)}function J(V,ae){const Ee=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Ee).then(()=>{p.value=ae,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function ie(V){a.value=a.value===V?"":V,O.value="all"}function ne(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function se(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function X(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function be(V){O.value=V.id;const ae=V.filters;a.value=ae.level||"",y.value=ae.timeRange||"",i.value=ae.text||"",ae.levels&&(a.value=ae.levels[0]||""),ae.hasToolName&&(i.value="")}function ce(V){O.value=V.id,a.value=V.filters.level||"",y.value=V.filters.timeRange||"",i.value=V.filters.text||""}function ue(){if(!S.value.trim())return;const V={id:"custom-"+Date.now(),name:S.value.trim(),filters:{level:a.value,timeRange:y.value,text:i.value}};v.value=[...v.value,V],C(),_.value=!1,S.value=""}function ke(V){v.value=v.value.filter(ae=>ae.id!==V),C(),O.value===V&&(O.value="all")}const Te=m("all"),Ce=m(""),Ie=m(""),Pe=m(""),$e=m(""),Xe=m(""),j=m(100),ye=Ik,Re=m(!1),Le=m(!1),He=m(""),Ve=m([]),ft=m(null),es=m(null);function vs(){e.value="search",ft.value||xn()}async function xn(){try{ft.value=await K.get("/api/logs/stats")}catch{}}function Rs(){const V=Xe.value;if(!V){Pe.value="",$e.value="";return}const Ee={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Ee){const We=new Date(Date.now()-Ee*1e3);Pe.value=$s(We),$e.value=""}}function $s(V){const ae=Ee=>String(Ee).padStart(2,"0");return`${V.getFullYear()}-${ae(V.getMonth()+1)}-${ae(V.getDate())}T${ae(V.getHours())}:${ae(V.getMinutes())}`}function At(V){if(!V)return"";const ae=new Date(V);return isNaN(ae.getTime())?"":ae.toISOString()}async function z(){Re.value=!0,He.value="",Le.value=!0,es.value=null;try{const V=new URLSearchParams;Te.value&&Te.value!=="all"&&V.set("level",Te.value),Ce.value&&V.set("tool",Ce.value),Ie.value&&V.set("q",Ie.value);const ae=At(Pe.value),Ee=At($e.value);ae&&V.set("start",ae),Ee&&V.set("end",Ee),V.set("limit",String(j.value));const We=await K.get(`/api/logs/search?${V.toString()}`);Ve.value=We.entries||[]}catch(V){He.value=V.message||"Search failed",Ve.value=[]}finally{Re.value=!1}}function Oe(){Te.value="all",Ce.value="",Ie.value="",Pe.value="",$e.value="",Xe.value="",j.value=100,Ve.value=[],Le.value=!1,He.value="",es.value=null}function bs(V){es.value=es.value===V?null:V}function Bn(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function os(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Hn(V){return V.error?"log-line-error":"text-gray-300"}function Qa(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let cs=null,_n=null,kn=!1;function it(){kn||(kn=!0,ze.subscribe("logs",le),r.value=ze.connected,o.value=ze.state||"disconnected",cs=ze.onStateChange,_n=(V,ae)=>{o.value=V,r.value=V==="connected",cs&&cs(V,ae)},ze.onStateChange=_n)}function Is(){kn&&(kn=!1,ze.unsubscribe("logs",le),ze.onStateChange===_n&&(ze.onStateChange=cs),_n=null,cs=null)}return qe(()=>{T(),window.addEventListener("pointerup",k),window.addEventListener("pointercancel",k)}),Es(it),As(Is),bt(()=>{Is(),window.removeEventListener("pointerup",k),window.removeEventListener("pointercancel",k)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:_e,pauseBuffer:b,showJumpBottom:u,copiedIndex:p,regexError:U,levels:g,logPresets:x,timeRanges:I,timeRange:y,activeLogPreset:O,customLogPresets:v,showSaveLogPreset:_,newLogPresetName:S,hasActiveLogFilters:R,timeRangeLabel:E,timelineBuckets:M,timelineMax:Z,timelineSpanLabel:te,timelineLabelSkip:B,togglePause:$,clearLogs:Y,exportLogs:G,logLineClass:ne,levelClass:se,levelChipClass:X,toggleLevel:ie,copyLine:J,jumpToBottom:ee,onScroll:H,onUserScrollIntent:re,onUserScrollKey:ge,onAutoScrollToggle:A,onPointerDown:De,applyLogPreset:be,applyCustomLogPreset:ce,saveLogCustomPreset:ue,removeLogCustomPreset:ke,segmentHeight:N,jumpToTimelineBucket:q,searchLevel:Te,searchTool:Ce,searchKeyword:Ie,searchStart:Pe,searchEnd:$e,searchTimePreset:Xe,searchLimit:j,searchLimits:ye,searching:Re,searchRan:Le,searchError:He,searchResults:Ve,searchStats:ft,expandedSearch:es,switchToSearch:vs,runSearch:z,clearSearchFilters:Oe,toggleSearchExpand:bs,formatSearchTs:Bn,searchEntryText:os,searchLogLineClass:Hn,formatJson:Qa,applySearchTimePreset:Rs}}};function bl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Lk=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]),Pa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Nk={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},no=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),Dk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Mu(e){return Dk.some(t=>e===t||e.startsWith(`${t}.`))}const Mk=new Set(["sessions.context_budget_overrides","tools.governor.host_overrides","tools.hosts","tools.tool_timeouts","permissions.tiers","mcp.servers","slack.webhook_urls","grafana_alerts.rules","outbound_webhooks.targets"]),xm="odin_config_center_expanded_v1",_m="odin_config_center_category_v1",Pk=50,Fk=650,ao=()=>K.get("/api/config/meta");function Kn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function wi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function ba(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function $k(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Uk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function km(e,t){if(wi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Kn(t);const n={};for(const[a,i]of Object.entries(t)){const l=km(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function Bk(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=km(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function wm(e,t,s,n){if(wi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)wm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Hk(){try{const e=JSON.parse(localStorage.getItem(xm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Vk(){try{const e=localStorage.getItem(_m);return Pa.some(t=>t.key===e)?e:Pa[0].key}catch{return Pa[0].key}}const jk={template:`
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
                  <div v-if="searchQuery && sectionSearchHits(section).length" class="cfgc-search-hits">
                    <span>Matched</span>
                    <button v-for="hit in sectionSearchHits(section).slice(0, 5)" :key="hit.path" type="button" @click="focusField(hit.path)">
                      {{ hit.label }} <code>{{ hit.path }}</code>
                    </button>
                    <span v-if="sectionSearchHits(section).length > 5">+{{ sectionSearchHits(section).length - 5 }} more</span>
                  </div>




                  <div class="cfgc-field-groups">
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
                            <template v-if="field.sensitivity !== 'public'">
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

                              <div v-else-if="field.type === 'object' || field.type === 'array'" class="cfgc-structured-summary">
                                <span>{{ compactValue(field.value) }}</span>
                                <small>A purpose-built table is required before release.</small>
                              </div>

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
  `,setup(){const e=m(null),t=m(null),s=m(!0),n=m(!1),a=m(null),i=m(null),l=m(null),r=m(!1),o=m(!1),c=m(null),d=m(""),u=m("all"),p=m(Vk()),h=m(Hk()),g=m({}),x=m({}),I=m(""),O=m({}),y=m({}),v=m([]),_=m([]),S=m(!1),b=m(!1),T=m(!1);let C=null,R=null,E={path:null,at:0},U=0;const P=W(()=>{var f;return(((f=t.value)==null?void 0:f.fields)||[]).filter(w=>!no.has(w.path.split(".")[0])&&!Mu(w.path))}),M=W(()=>new Map(P.value.map(f=>[f.path,f]))),Z=W(()=>q.value.reduce((f,w)=>f+w.sections.length,0)),te=W(()=>P.value.length),B=W(()=>Lk),L=W(()=>v.value.length>0),N=W(()=>_.value.length>0),q=W(()=>{if(!e.value)return[];const f=new Set(Pa.flatMap(Q=>Q.sections)),w=Pa.map(Q=>({...Q,sections:Q.sections.filter(de=>Object.hasOwn(e.value,de)&&!no.has(de))})).filter(Q=>Q.sections.length),D=Object.keys(e.value).filter(Q=>!f.has(Q)&&!no.has(Q));return D.length&&w.push({key:"other",label:"Other",icon:"folder",sections:D}),w}),_e=W(()=>e.value?{...e.value,...g.value}:null),ve=W(()=>{if(!e.value)return[];const f=[];for(const[w,D]of Object.entries(g.value))wm(e.value[w],D,w,f);return f.filter(w=>!wi(w.oldVal,w.newVal)).map(w=>{const D=k(w.path);return{...w,label:(D==null?void 0:D.label)||ba(w.path.split(".").at(-1)),apply_mode:(D==null?void 0:D.apply_mode)||J(w.path.split(".")[0])}})}),le=W(()=>ve.value.length>0),pe=W(()=>ve.value.length),F=W(()=>new Set(ve.value.map(f=>f.path.split(".")[0])).size),ee=W(()=>!!d.value||u.value!=="all"),xe=W(()=>{const f={...y.value};for(const w of ve.value){const D=k(w.path),Q=We(D,w.newVal);Q&&(f[w.path]=Q)}return f}),H=W(()=>Object.keys(xe.value).length>0),oe=W(()=>e.value?(ee.value?q.value:q.value.filter(w=>w.key===p.value)).map(w=>({...w,sections:w.sections.filter(D=>Xe(D))})).filter(w=>w.sections.length):[]),re=W(()=>{const f=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],w=new Map(f.map(D=>[D,[]]));for(const D of ve.value){const Q=w.has(D.apply_mode)?D.apply_mode:"restart";w.get(Q).push(D)}return f.filter(D=>w.get(D).length).map(D=>({key:D,label:Vn(D),entries:w.get(D)}))}),ge=W(()=>ve.value.filter(f=>f.apply_mode==="restart").length),he=W(()=>P.value.filter(f=>f.pending_restart)),De=W(()=>he.value.length);function k(f){const w=M.value.get(f);return w?{...w,apply_details:bl([w])}:null}function A(f){const w=`${f}.`;return P.value.filter(D=>D.path===f||D.path.startsWith(w))}function $(f){return A(f).length}function Y(f){return ba(f)}function G(f){const w=A(f);if(!w.length)return`${ba(f)} configuration.`;const D=w.find(we=>we.sensitivity==="public"&&we.description)||w.find(we=>we.description),Q=(D==null?void 0:D.description)||"";return Q.match(/setting for (.+)\.$/i)?`${ba(f)} settings and runtime behaviour.`:Q}function J(f){const w=[...new Set(A(f).map(D=>D.apply_mode))];return w.length===1?w[0]:w.includes("restart")?"restart":w.includes("activation_required")?"activation_required":w[0]||"restart"}function ie(f){const w=[...new Set(A(f).map(D=>Vn(D.apply_mode)))];return w.length?w.length===1?w[0]:`Mixed apply behaviour: ${w.join(" · ")}`:""}function ne(f){return bl(A(f))}function se(f,w){return w.split(".").reduce((D,Q)=>D==null?void 0:D[Q],f)}function X(f){const w=_e.value;return A(f).filter(D=>Mu(D.path)?!1:D.path.split(".").length<=2?!0:!D.path.includes(".*")).map(D=>({...D,key:D.path.split(".").at(-1),value:se(w,D.path),apply_details:bl([D]),editor:D.path==="agents.final_warning_iterations"?"warning-chips":null}))}function be(f){const w=f.path.split(".");return w.length>2?w.slice(0,2).join("."):null}function ce(f){const w=new Map;for(const D of X(f)){const Q=be(D),de=Q||`${f}.__root`;w.has(de)||w.set(de,{key:de,path:Q,entries:[]}),w.get(de).entries.push(D)}return[...w.values()].map(D=>{const Q=D.entries.find(de=>de.group_description);return{...D,label:D.path?ba(D.path.split(".").at(-1)):null,description:(Q==null?void 0:Q.group_description)||null,apply_details:bl(D.entries),runtime_summaries:ke(D.entries)}})}function ue(f){return{save:f.save_effect||(f.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:f.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[f.apply_mode]||"Effective runtime state is not currently observable."}}function ke(f){const w=new Map;for(const D of f){const Q=ue(D),de=`${D.apply_mode}|${Q.save}|${Q.runtime}`;w.has(de)||w.set(de,{key:de,label:Vn(D.apply_mode),save:Q.save,runtime:Q.runtime})}return[...w.values()]}function Te(f){if(Ce(f))return f.runtime_effect||f.activation_policy||"";if(f.apply_mode==="activation_required"){const w=f.activation_policy||f.runtime_effect;return w?`Not active after saving. No activation control exists in this release. ${w}`:"Not active after saving; no activation control exists in this release."}return""}function Ce(f){return f.action_available===!0&&!!(f.action_label&&f.action_endpoint)}async function Ie(f){if(Ce(f))try{if(He(f.path))throw new Error("Save this setting before applying its action.");const w=String(f.action_method||"POST").toLowerCase(),D={post:K.post.bind(K),put:K.put.bind(K),delete:K.del.bind(K)}[w];if(!D)throw new Error("Unsupported configuration action");await D(f.action_endpoint,f.action_body||void 0),await Tn(),ys("success",`${f.action_label} completed.`)}catch(w){ys("error",w.message||`${f.action_label} failed`)}}function Pe(f,w){return[f.label,f.path,f.description,...f.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(w)}function $e(f){const w=d.value.trim().toLowerCase();return w?A(f).filter(D=>Pe(D,w)):[]}function Xe(f){const w=A(f);if(u.value!=="all"&&!w.some(Q=>Q.apply_state===u.value))return!1;const D=d.value.trim().toLowerCase();return!D||`${Y(f)} ${f}`.toLowerCase().includes(D)?!0:w.some(Q=>Pe(Q,D))}function j(f,w){return A(f).filter(D=>D.apply_state===w).length}function ye(f){return f==="all"?te.value:P.value.filter(w=>w.apply_state===f).length}function Re(f){const w=f.sections.flatMap(D=>A(D));return{fields:w.length,modified:ve.value.filter(D=>f.sections.includes(D.path.split(".")[0])).length,pending_restart:w.filter(D=>D.apply_state==="pending_restart").length,invalid:w.filter(D=>D.apply_state==="invalid").length,dormant:w.filter(D=>D.apply_state==="dormant").length}}function Le(f){var w;return Object.hasOwn(g.value,f)&&!wi((w=e.value)==null?void 0:w[f],g.value[f])}function He(f){return ve.value.some(w=>w.path===f||w.path.startsWith(`${f}.`))}function Ve(f){p.value=f,d.value="",u.value="all";try{localStorage.setItem(_m,f)}catch{}}function ft(f){u.value=f}function es(){d.value="",u.value="all"}function vs(f){var w;return((w=q.value.find(D=>D.sections.includes(f)))==null?void 0:w.sections)||[]}function xn(f){const w=vs(f),D=w.find(Q=>h.value[Q]===!0);return D||w.find(Q=>h.value[Q]!==!1)||null}function Rs(f){return d.value&&!T.value&&Xe(f)?!0:T.value?xn(f)===f:Object.hasOwn(h.value,f)?h.value[f]===!0:!0}function $s(f){const w=!Rs(f);if(T.value){const D={...h.value};for(const Q of vs(f))D[Q]===!0&&(D[Q]=!1);D[f]=w,h.value=D;return}h.value={...h.value,[f]:w}}function At(){v.value.push(Kn(g.value)),v.value.length>Pk&&v.value.shift(),_.value=[]}function z(){le.value&&(At(),g.value={},y.value={},S.value=!1)}function Oe(f,w=!1){const D=Date.now();if(w&&E.path===f&&D-E.at<Fk){E.at=D;return}At(),E={path:f,at:D}}function bs(f,w,D){if(!w.length)return D;const Q=Kn(f??{});let de=Q;for(let we=0;we<w.length-1;we+=1){const st=w[we];de[st]=Kn(de[st]??{}),de=de[st]}return de[w.at(-1)]=D,Q}function Bn(f){var w;return Object.hasOwn(g.value,f)?g.value[f]:Kn((w=e.value)==null?void 0:w[f])}function os(f,w,D={}){var dt;const[Q,...de]=f.path.split(".");Oe(f.path,!!D.coalesce);const we=Bn(Q),st=de.length?bs(we,de,w):w,Ge={...g.value};if(wi(st,(dt=e.value)==null?void 0:dt[Q])?delete Ge[Q]:Ge[Q]=st,g.value=Ge,y.value[f.path]){const Ls={...y.value};delete Ls[f.path],y.value=Ls}}function Hn(f){E={path:null,at:0},x.value={...x.value,[f]:String(se(_e.value,f)??"")}}function Qa(f){if(E={path:null,at:0},!Object.hasOwn(x.value,f))return;const w={...x.value};delete w[f],x.value=w}function cs(f){const w=x.value[f.path];if(E={path:null,at:0},w===""){y.value={...y.value,[f.path]:"Enter a number."};return}const D=Number(w);if(Number.isNaN(D)||f.type==="integer"&&!Number.isInteger(D)){y.value={...y.value,[f.path]:f.type==="integer"?"Enter a whole number.":"Enter a number."};return}const Q={...x.value};delete Q[f.path],x.value=Q,os(f,D,{coalesce:!0})}function _n(f){return Object.hasOwn(x.value,f.path)?x.value[f.path]:f.value??""}function kn(f,w){if(x.value={...x.value,[f.path]:w},w===""){y.value={...y.value,[f.path]:"Enter a number."};return}const D=Number(w);if(!Number.isFinite(D)||f.type==="integer"&&!Number.isInteger(D)){y.value={...y.value,[f.path]:f.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(y.value[f.path]){const Q={...y.value};delete Q[f.path],y.value=Q}os(f,D,{coalesce:!0})}function it(f){const w=Number.parseInt(I.value,10);if(!Number.isInteger(w)||w<1){y.value={...y.value,[f.path]:"Warning thresholds must be positive whole numbers."};return}const D=[...new Set([...f.value||[],w])].sort((Q,de)=>de-Q);I.value="",os(f,D)}function Is(f,w){os(f,(f.value||[]).filter(D=>D!==w))}function V(f){return f.type==="array"&&Array.isArray(f.value)&&!Mk.has(f.path)&&f.sensitivity==="public"&&f.value.every(w=>["string","number","boolean"].includes(typeof w))}function ae(f){const w=String(O.value[f.path]??"").trim();if(!w)return;const D=[...new Set([...f.value||[],w])];O.value={...O.value,[f.path]:""},os(f,D)}function Ee(f,w){os(f,(f.value||[]).filter(D=>D!==w))}function We(f,w){var Q;if(!f)return null;if((Q=f.enum)!=null&&Q.length&&!f.enum.includes(w))return`Choose one of: ${f.enum.join(", ")}`;if(f.path==="agents.final_warning_iterations"&&(!Array.isArray(w)||!w.length))return"Add at least one warning threshold.";const D=f.constraints||{};if((f.type==="integer"||f.type==="number")&&typeof w=="number"){if(D.minimum!==void 0&&w<D.minimum)return`Must be at least ${D.minimum}${f.unit?` ${f.unit}`:""}`;if(D.maximum!==void 0&&w>D.maximum)return`Must be at most ${D.maximum}${f.unit?` ${f.unit}`:""}`}return null}function rt(f){return xe.value[f.path]||null}function Ft(f){const w=`${f}.`;return Object.keys(xe.value).some(D=>D===f||D.startsWith(w))}function $t(){v.value.length&&(_.value.push(Kn(g.value)),g.value=v.value.pop(),y.value={},x.value={},E={path:null,at:0})}function Xa(){_.value.length&&(v.value.push(Kn(g.value)),g.value=_.value.pop(),y.value={},x.value={},E={path:null,at:0})}function Zs(){!le.value||H.value||(S.value=!0,b.value=!1)}function Mr(){S.value=!1}function Pr(){z()}function Vn(f){return Nk[f]||ba(f||"unknown")}function tl(f){return`apply-${String(f||"unknown").replaceAll("_","-")}`}function wn(f){return`cfgc-field-${f.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function pa(f){return`${wn(f)}-input`}function Sn(f){const w=document.getElementById(wn(f))||document.getElementById(wn(f.split(".").slice(0,2).join(".")));w==null||w.scrollIntoView({behavior:"smooth",block:"center"})}function ys(f,w){i.value={type:f,message:w},window.setTimeout(()=>{var D;((D=i.value)==null?void 0:D.message)===w&&(i.value=null)},3500)}function Os(){var f;r.value=!1,u.value="pending_restart",d.value="",(f=window.scrollTo)==null||f.call(window,{top:0,behavior:"smooth"})}function sl(){r.value=!1}function ei(f=1800){R&&window.clearTimeout(R),R=window.setTimeout(Fr,f)}async function Fr(){if(o.value){if(U+=1,U>45){o.value=!1,c.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await ao(),De.value===0){o.value=!1,c.value=null,ys("success","Odin restarted and the saved startup settings are active.");return}}catch{}ei(2e3)}}async function nl(){if(!o.value){c.value=null;try{await K.post("/api/restart",{}),o.value=!0,U=0,r.value=!1,ei()}catch(f){c.value=f.message||"Odin could not schedule a restart."}}}async function al(){if(!(!le.value||H.value||n.value)){n.value=!0;try{const f=Bk(e.value,g.value),w=await K.put("/api/config",f);e.value=w,g.value={},v.value=[],_.value=[],y.value={},S.value=!1;try{t.value=await ao(),l.value=null,r.value=De.value>0,ys("success",De.value?`Configuration saved. ${De.value} setting${De.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(D){l.value=D.message||"Unknown metadata error.",ys("error",`Configuration saved, but apply status could not be refreshed: ${l.value}`)}}catch(f){ys("error",f.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Tn(){var f,w;if(!le.value){s.value=!0,a.value=null;try{const D=await K.get("/api/config"),Q=await ao();e.value=D,t.value=Q,l.value=null;const de=q.value;if(de.some(we=>we.key===p.value)||(p.value=((f=de[0])==null?void 0:f.key)||Pa[0].key),T.value){const st=(((w=de.find(Ge=>Ge.key===p.value))==null?void 0:w.sections)||[]).find(Ge=>h.value[Ge]===!0);h.value=st?{...h.value,[st]:!0}:{}}}catch(D){a.value=D.message||"Unknown configuration error"}finally{s.value=!1}}}function ha(f){if(S.value||!(f.ctrlKey||f.metaKey))return;const w=f.target;w instanceof HTMLElement&&(w.matches("input, textarea, select")||w.isContentEditable)||(!f.shiftKey&&f.key.toLowerCase()==="z"?(f.preventDefault(),$t()):(f.key.toLowerCase()==="y"||f.shiftKey&&f.key.toLowerCase()==="z")&&(f.preventDefault(),Xa()))}function fe(f){T.value=f.matches}return Yt(h,f=>{try{localStorage.setItem(xm,JSON.stringify(f))}catch{}},{deep:!0}),qe(()=>{var f;Tn(),document.addEventListener("keydown",ha),C=window.matchMedia("(max-width: 760px)"),fe(C),(f=C.addEventListener)==null||f.call(C,"change",fe)}),bt(()=>{var f;document.removeEventListener("keydown",ha),(f=C==null?void 0:C.removeEventListener)==null||f.call(C,"change",fe),R&&window.clearTimeout(R)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,metaRefreshError:l,restartPromptOpen:r,restartScheduled:o,restartError:c,searchQuery:d,healthFilter:u,activeCategory:p,reviewOpen:S,mobileOverflowOpen:b,warningThresholdInput:I,arrayInputs:O,healthFilters:B,visibleCategories:q,displayGroups:oe,reviewGroups:re,sectionCount:Z,fieldCount:te,hasChanges:le,changeCount:pe,changedSectionCount:F,hasDraftErrors:H,canUndo:L,canRedo:N,globalFilterActive:ee,reviewRestartCount:ge,pendingRestartCount:De,pendingRestartFields:he,healthCount:ye,categoryStats:Re,selectCategory:Ve,selectHealthFilter:ft,clearFilters:es,sectionLabel:Y,sectionDescription:G,sectionFieldCount:$,sectionHealthCount:j,sectionApplySummary:ie,sectionApplyDetails:ne,sectionEntries:X,fieldGroups:ce,sectionSearchHits:$e,fieldRuntimeCopy:ue,fieldSpecificRuntimeNote:Te,hasHonestAction:Ce,runFieldAction:Ie,sectionChanged:Le,fieldChanged:He,isSectionExpanded:Rs,toggleSection:$s,discardAllDrafts:z,setFieldValue:os,setNumberFieldValue:kn,numberInputValue:_n,beginInputEdit:Hn,endTextInputEdit:Qa,endInputEdit:cs,addWarningThreshold:it,removeWarningThreshold:Is,isScalarArray:V,addScalarArrayItem:ae,removeScalarArrayItem:Ee,fieldError:rt,sectionHasErrors:Ft,undo:$t,redo:Xa,openReview:Zs,closeReview:Mr,mobileCancel:Pr,applyModeLabel:Vn,applyClass:tl,compactValue:$k,formatValue:Uk,fieldId:wn,fieldInputId:pa,focusField:Sn,fetchConfig:Tn,saveConfig:al,restartOdin:nl,restartLater:sl,reviewPendingRestart:Os}}},zk=/^\d{15,25}$/;function Sm(e){return String((e==null?void 0:e.display_name)||(e==null?void 0:e.username)||(e==null?void 0:e.id)||"Unknown user")}const Tm={props:{members:{type:Array,default:()=>[]},excludedIds:{type:Array,default:()=>[]},placeholder:{type:String,default:"Search Discord users…"},ariaLabel:{type:String,default:"Search Discord users"},optionsId:{type:String,required:!0},autofocus:{type:Boolean,default:!1}},emits:["select"],template:`
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
  `,setup(e,{emit:t}){const s=m(""),n=m(!1),a=m(0),i=m(null),l=W(()=>new Set((e.excludedIds||[]).map(String))),r=W(()=>{const S=s.value.toLowerCase().trim();return(e.members||[]).filter(b=>l.value.has(String(b.id))?!1:S?u(b).toLowerCase().includes(S)||String(b.username||"").toLowerCase().includes(S)||String(b.id).includes(S):!0)}),o=W(()=>{const S=s.value.trim();return r.value.length===0&&zk.test(S)&&!l.value.has(S)?S:""}),c=W(()=>r.value.length+(o.value?1:0)),d=W(()=>{if(n.value){if(r.value[a.value])return`${e.optionsId}-${a.value}`;if(o.value&&a.value===r.value.length)return`${e.optionsId}-raw`}});function u(S){return Sm(S)}function p(){n.value=!0,a.value=0}function h(){p()}function g(){const S=Math.max(c.value-1,0);a.value=Math.min(a.value+1,S)}function x(){a.value=Math.max(a.value-1,0)}function I(){const S=r.value[a.value];S?O(S):o.value&&a.value===r.value.length&&y(o.value)}function O(S){y(String(S.id))}function y(S){t("select",S),s.value="",n.value=!1,a.value=0}function v(){n.value=!1}function _(){setTimeout(v,150)}return qe(()=>{e.autofocus&&Ct(()=>{var S;return(S=i.value)==null?void 0:S.focus()})}),{query:s,open:n,highlightedIndex:a,input:i,filteredMembers:r,rawId:o,activeOptionId:d,memberName:u,openOptions:p,onInput:h,highlightNext:g,highlightPrevious:x,selectHighlighted:I,selectMember:O,selectId:y,closeOptions:v,onBlur:_}}},qk={components:{DiscordUserCombobox:Tm},template:`
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
        <section v-if="globalDraft" class="hm-card discord-global-card">
          <div class="discord-global-heading">
            <div>
              <h2 class="text-sm font-semibold text-gray-300">Global defaults</h2>
              <p>These settings apply when a guild or channel has no narrower override.</p>
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
            <span>Saving changes only these global defaults. Guild and channel overrides remain untouched.</span>
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
  `,setup(){const e=m([]),t=m(!0),s=m(null),n=m({}),a=m(null),i=m(null),l=m(!1),r=m(null),o=m({}),c=m([]),d=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Discord user IDs allowed by the global bot policy.",placeholder:"Search Discord users…",userAutocomplete:!0,fullWidth:!0},{key:"channels",label:"Allowed channels",description:"Channel IDs included by the global bot policy.",placeholder:"Discord channel ID",fullWidth:!0},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Bot identities Odin never responds to automatically.",placeholder:"Search Discord users or bots…",userAutocomplete:!0,fullWidth:!0}]),u=W(()=>JSON.stringify(a.value)!==JSON.stringify(i.value)),p=W(()=>new Map(c.value.map(E=>[String(E.id),E])));function h(E){return E.config&&E.config.enabled!==void 0?E.config.enabled:!0}function g(E){return E.config&&E.config.require_mention!==void 0?E.config.require_mention:!1}function x(E){return E.config&&E.config.respond_to_bots!==void 0?E.config.respond_to_bots:!1}function I(E){return E.config&&Object.keys(E.config).length>0}function O(E){n.value[E]=!n.value[E]}async function y(){t.value=!0,s.value=null;try{const[E,U]=await Promise.all([K.get("/api/discord/guilds"),K.get("/api/discord/members").catch(()=>[])]);e.value=E,c.value=U;try{const M=(await K.get("/api/config")).discord||{};a.value={allowed_users:[...M.allowed_users||[]],channels:[...M.channels||[]],respond_to_bots:!!M.respond_to_bots,require_mention:!!M.require_mention,ignore_bot_ids:[...M.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value)),r.value=null}catch(P){r.value=P.message||"Global defaults could not be loaded."}}catch(E){s.value=E.message}t.value=!1}async function v(E,U,P){try{await K.put("/api/discord/guild/"+E+"/config",{[U]:P}),await y()}catch(M){s.value=M.message}}async function _(E,U,P,M){try{await K.put("/api/discord/channel/"+E+"/config",{[P]:M}),await y()}catch(Z){s.value=Z.message}}async function S(E,U){try{await K.put("/api/discord/channel/"+E+"/config",{clear:!0}),await y()}catch(P){s.value=P.message}}function b(E,U){const P=String(U);if(!E.userAutocomplete)return P;const M=p.value.get(P);return M?Sm(M):P}function T(E,U=null){const P=String(U??o.value[E]??"").trim();!P||i.value[E].includes(P)||(i.value[E]=[...i.value[E],P],o.value={...o.value,[E]:""})}function C(E,U){i.value[E]=i.value[E].filter(P=>P!==U)}async function R(){if(!(!u.value||l.value)){l.value=!0,r.value=null;try{const U=(await K.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...U.allowed_users||[]],channels:[...U.channels||[]],respond_to_bots:!!U.respond_to_bots,require_mention:!!U.require_mention,ignore_bot_ids:[...U.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(E){r.value=E.message||"Global defaults could not be saved."}finally{l.value=!1}}}return qe(y),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalMembers:c,globalListEditors:d,globalChanged:u,guildEnabled:h,guildMention:g,guildBots:x,hasOverride:I,toggleGuild:O,fetchGuilds:y,setGuildConfig:v,setChannelConfig:_,clearOverride:S,globalItemLabel:b,addGlobalItem:T,removeGlobalItem:C,saveGlobalDefaults:R}}},ds=e=>e==null?e:JSON.parse(JSON.stringify(e));function Gk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const g=new Map;function x(b){d+=1;const T=c.then(b,b);return c=T.catch(()=>{}),T}function I(b,T){h=ds(b),g.clear();for(const[C,R]of Object.entries(T||{}))g.set(C,ds(R))}function O(b){const T=ds(b),C=++u;return x(async()=>{try{await e(ds(T)),h=ds(T),C===u&&n(ds(T))}catch(R){C===u&&(a(ds(h)),o(R,{kind:"default"}))}})}function y(b,T){const C=ds(T),R=(p.get(b)||0)+1;return p.set(b,R),x(async()=>{try{await t(b,ds(C)),g.set(b,ds(C)),R===p.get(b)&&i(b,ds(C))}catch(E){R===p.get(b)&&(l(b,ds(g.get(b)??null)),o(E,{kind:"user",uid:b}))}})}function v(b){const T=(p.get(b)||0)+1;return p.set(b,T),x(async()=>{try{await s(b),g.delete(b),T===p.get(b)&&r(b)}catch(C){T===p.get(b)&&(l(b,ds(g.get(b)??null)),o(C,{kind:"delete",uid:b}))}})}async function _(){for(;;){const b=c;if(await b,b===c)return d}}async function S(b){for(;;){const T=await _(),C=await b();if(T===d)return C}}return{seed:I,saveDefault:O,saveUser:y,deleteUser:v,whenIdle:_,readSnapshot:S,get revision(){return d}}}const Kk={components:{DiscordUserCombobox:Tm},template:`
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
  `,setup(){const e=m(!0),t=m(""),s=m(null),n=m([]),a=m({allowed_hosts:[],default_host:""}),i=m({}),l=m(!1),r=m([]),o=W(()=>{const b={};for(const T of r.value)b[T.id]=T;return b});function c(b){return o.value[b]||null}function d(b,T){return b?b.allowed_hosts===null||b.allowed_hosts===void 0?{allowed_hosts:[...T],default_host:b.default_host||"",allow_all:!0}:{allowed_hosts:b.allowed_hosts,default_host:b.default_host||"",allow_all:!1}:{allowed_hosts:[...T],default_host:T[0]||"",allow_all:!0}}const u=Gk({applyDefault:async b=>{const T=b.allow_all?null:b.allowed_hosts;await K.put("/api/host-access/default-policy",{allowed_hosts:T,default_host:b.default_host})},applyUser:async(b,T)=>{const C=T.allow_all?null:T.allowed_hosts;await K.put(`/api/host-access/user/${b}`,{allowed_hosts:C,default_host:T.default_host})},applyDelete:b=>K.del(`/api/host-access/user/${b}`),onDefaultConfirmed:()=>Se.success("Default policy updated"),onDefaultRollback:b=>{b&&(a.value=b)},onUserConfirmed:b=>{const T=c(b);Se.success(`Updated access for ${T?T.display_name:b}`)},onUserRollback:(b,T)=>{const C={...i.value};T?C[b]=T:delete C[b],i.value=C},onUserDeleted:b=>{const T={...i.value};delete T[b],i.value=T},onError:(b,T)=>{var R;const C=T.uid?` ${((R=c(T.uid))==null?void 0:R.display_name)||T.uid}`:"";Se.error(`${b.message||"Failed to save"} — reverted${C}`)}});let p=0;async function h(){const b=++p;e.value=!0,t.value="";try{const T=await u.readSnapshot(()=>K.get("/api/host-access"));if(b!==p)return;s.value=T,n.value=T.available_hosts||[],a.value=d(T.default_policy,n.value);const C=T.users||{},R={};for(const[E,U]of Object.entries(C))R[E]=d(U,n.value);i.value=R,u.seed(a.value,R)}catch(T){b===p&&(t.value=T.message||"Failed to fetch host access data")}finally{b===p&&(e.value=!1)}try{const T=await K.get("/api/discord/members")||[];b===p&&(r.value=T)}catch{b===p&&(r.value=[])}}function g(){u.saveDefault(a.value)}function x(b,T){a.value.allow_all=!1,T?a.value.allowed_hosts.includes(b)||a.value.allowed_hosts.push(b):(a.value.allowed_hosts=a.value.allowed_hosts.filter(C=>C!==b),a.value.default_host===b&&(a.value.default_host=a.value.allowed_hosts[0]||"")),g()}function I(b){const T=i.value[b];T&&u.saveUser(b,T)}function O(b,T,C){const R=i.value[b];R&&(R.allow_all=!1,C?R.allowed_hosts.includes(T)||R.allowed_hosts.push(T):(R.allowed_hosts=R.allowed_hosts.filter(E=>E!==T),R.default_host===T&&(R.default_host=R.allowed_hosts[0]||"")),I(b))}function y(b,T){const C=i.value[b];C&&(C.default_host=T,I(b))}function v(){l.value=!0}function _(b){!/^\d{15,25}$/.test(b)||i.value[b]||(i.value[b]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},I(b),l.value=!1)}async function S(b){const T=c(b);await hs({title:"Remove user override",message:`Remove the host access override for ${T?T.display_name:b}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await u.deleteUser(b),i.value[b]||Se.success(`Removed override for ${T?T.display_name:b}`))}return qe(h),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,members:r,fetchData:h,saveDefaultPolicy:g,toggleDefaultHost:x,getMember:c,toggleUserHost:O,setUserDefault:y,openAddUser:v,addUserById:_,deleteUser:S}}},Wk={template:`
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
  `,setup(){const e=m(!0),t=m(""),s=m(null),n=m([]),a=m(!1),i=m(!1),l=m(null),r=m(null),o=m(!1),c=m({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=m({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=W(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=W(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(C){return C==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":C==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function g(){e.value=!0,t.value="";try{const C=await K.get("/api/tokens");s.value=C.tokens||[],n.value=C.available_hosts||[]}catch(C){t.value=C.message||"Failed to load tokens"}finally{e.value=!1}}function x(C){return!C||!C.trim()?[]:C.split(",").map(R=>R.trim()).filter(Boolean)}function I(C,R){const E=c.value.allowed_hosts;if(R&&!E.includes(C)&&E.push(C),!R){const U=E.indexOf(C);U>=0&&E.splice(U,1)}}function O(C,R){const E=d.value.allowed_hosts;if(R&&!E.includes(C)&&E.push(C),!R){const U=E.indexOf(C);U>=0&&E.splice(U,1)}}async function y(){var C;i.value=!0;try{const R=x(c.value.allowed_tools_str),E=c.value.host_mode,U=E==="none"?[]:E==="select"?c.value.allowed_hosts:null,P={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:R.length?R:[]};U!==null&&(P.allowed_hosts=U),P.default_host=c.value.default_host||"";const M=await K.post("/api/tokens",P);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Se.success("Token created"),await g()}catch(R){Se.error(((C=R.data)==null?void 0:C.error)||R.message||"Failed to create token")}finally{i.value=!1}}function v(C){r.value=C;const R=C.allowed_hosts;let E="default";R==null?E="default":Array.isArray(R)&&R.length===0?E="none":Array.isArray(R)&&(E="select"),d.value={username:C.username||"",tier:C.tier||"admin",label:C.label||"",host_mode:E,allowed_hosts:Array.isArray(R)?[...R]:[],default_host:C.default_host||"",allowed_tools_str:(C.allowed_tools||[]).join(", ")}}async function _(){var C;if(r.value){o.value=!0;try{const R=x(d.value.allowed_tools_str),E=d.value.host_mode,U={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:R};E==="none"?U.allowed_hosts=[]:E==="select"?U.allowed_hosts=d.value.allowed_hosts:U.allowed_hosts=null,U.default_host=d.value.default_host||"",await K.put("/api/tokens/"+encodeURIComponent(r.value.user_id),U),r.value=null,Se.success("Token updated"),await g()}catch(R){Se.error(((C=R.data)==null?void 0:C.error)||R.message||"Failed to update")}finally{o.value=!1}}}async function S(C){var E;if(await hs({title:"Regenerate token",message:`Regenerate token for ${C.username||C.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const U=await K.post("/api/tokens/"+encodeURIComponent(C.user_id)+"/regenerate");l.value=U.token,Se.success("Token regenerated")}catch(U){Se.error(((E=U.data)==null?void 0:E.error)||U.message||"Failed to regenerate")}}async function b(C){var E;if(await hs({title:"Delete token",message:`Delete token for ${C.username||C.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/tokens/"+encodeURIComponent(C.user_id)),Se.success("Token deleted"),await g()}catch(U){Se.error(((E=U.data)==null?void 0:E.error)||U.message||"Failed to delete")}}async function T(){if(l.value)try{await navigator.clipboard.writeText(l.value),Se.success("Copied to clipboard")}catch{Se.error("Copy failed — select and copy manually")}}return qe(g),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:g,tierBadge:h,toggleCreateHost:I,toggleEditHost:O,createToken:y,startEdit:v,saveEdit:_,confirmRegenerate:S,confirmDelete:b,copyToken:T}}};function yl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Zk={template:`
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
              <input v-model.number="codexForm.max_tokens" type="number" disabled aria-describedby="codex-max-tokens-note"
                     class="hm-input" />
              <small id="codex-max-tokens-note" class="llm-field-note">Unsupported by the current Codex provider. Preserved in config, never sent to Responses requests.</small>
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
          <details class="llm-advanced" :open="advancedOpen.codex" @toggle="advancedOpen.codex = $event.target.open">
            <summary>
              <span>Advanced Settings</span>
              <small>Transport, retries, connection pool, and context compression</small>
            </summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group">
                <header><strong>Transport</strong><span>Request lifecycle limits</span></header>
                <label>Request timeout <small>seconds</small>
                  <input v-model.number="codexForm.request_timeout_seconds" type="number" min="60" max="86400" class="hm-input" />
                </label>
                <label>Stream stall timeout <small>seconds</small>
                  <input v-model.number="codexForm.stream_stall_timeout_seconds" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Retry policy</strong><span>Transient request failures</span></header>
                <label>Maximum retries
                  <input v-model.number="codexForm.retry.max_retries" type="number" min="0" class="hm-input" />
                </label>
                <label>Base delay <small>seconds</small>
                  <input v-model.number="codexForm.retry.base_delay" type="number" min="0" step="any" class="hm-input" />
                </label>
                <label>Maximum delay <small>seconds</small>
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
                <label>Maximum connections
                  <input v-model.number="codexForm.connection_pool.max_connections" type="number" min="1" class="hm-input" />
                </label>
                <label>Keepalive timeout <small>seconds</small>
                  <input v-model.number="codexForm.connection_pool.keepalive_timeout" type="number" min="0" class="hm-input" />
                </label>
              </section>
              <section class="llm-advanced-group">
                <header><strong>Context compression</strong><span>Long-conversation compaction</span></header>
                <p v-if="llmStatus?.codex?.context_compression_pending_restart === true" class="llm-advanced-state pending" role="status">
                  Saved values need a restart. This process still uses compression {{ llmStatus.codex.effective_context_compression?.enabled ? 'on' : 'off' }}, {{ Number(llmStatus.codex.effective_context_compression?.max_context_chars || 0).toLocaleString() }} characters, and {{ llmStatus.codex.effective_context_compression?.keep_recent_iterations }} recent iterations.
                </p>
                <p v-else-if="llmStatus?.codex?.context_compression_pending_restart === false" class="llm-advanced-state">
                  Saved values match this process. Future changes take effect after restart.
                </p>
                <p v-else class="llm-advanced-state">Future changes take effect after restart; current process values are unavailable.</p>
                <label class="llm-advanced-toggle">Enabled
                  <span class="toggle-switch"><input v-model="codexForm.context_compression.enabled" type="checkbox" /><span class="toggle-slider"></span></span>
                </label>
                <label>Maximum context characters
                  <input v-model.number="codexForm.context_compression.max_context_chars" type="number" min="1" class="hm-input" />
                </label>
                <label>Recent iterations to keep
                  <input v-model.number="codexForm.context_compression.keep_recent_iterations" type="number" min="1" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer">
                <p>Transport and retry changes apply now. Connection pool and context compression are saved for the next restart.</p>
                <button type="button" class="btn btn-primary text-xs" @click="saveCodexConfigNow" :disabled="savingCodex">{{ savingCodex ? 'Saving…' : 'Save advanced settings' }}</button>
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
          <details class="llm-advanced compact" :open="advancedOpen.kimi" @toggle="advancedOpen.kimi = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label>Request timeout <small>seconds</small>
                  <input v-model.number="kimiForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveKimiConfigNow" :disabled="savingKimi">Save timeout</button></div>
            </div>
          </details>
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
          <details class="llm-advanced compact" :open="advancedOpen.ollama" @toggle="advancedOpen.ollama = $event.target.open">
            <summary><span>Advanced Settings</span><small>Provider request timeout</small></summary>
            <div class="llm-advanced-body">
              <section class="llm-advanced-group single">
                <label>Request timeout <small>seconds</small>
                  <input v-model.number="ollamaForm.timeout" type="number" min="10" max="3600" class="hm-input" />
                </label>
              </section>
              <div class="llm-advanced-footer"><button type="button" class="btn btn-primary text-xs" @click="saveOllamaConfigNow" :disabled="savingOllama">Save timeout</button></div>
            </div>
          </details>
          <div v-if="ollamaStatus.health && ollamaStatus.health.error"
               class="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800 mt-3">
            {{ ollamaStatus.health.error }}
          </div>
        </div>
      </div>

    </div>
  `,setup(){const e=m(!0),t=m(null),s=m("codex"),n=m({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:"",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:75e4,keep_recent_iterations:30}}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=W(()=>{const z=n.value.model;return z&&!a.includes(z)?[z,...a]:a}),l=W(()=>{const z=n.value.agent_model;return z&&z!=="auto"&&!a.includes(z)?[z,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=W(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=W(()=>{const z=n.value.agent_model;return z==="auto"?!0:!r.includes(z||n.value.model)}),d=W(()=>{const z=n.value.agent_reasoning_effort;return z==="auto"?!1:(z||n.value.reasoning_effort)==="max"}),u=z=>r.includes(z)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=z=>r.includes(z)&&d.value,h=m({enabled:!1,model:"gpt-5.6-luna"}),g=m({unavailable_reason:null}),x=W(()=>{const z=h.value.model;return z&&!a.includes(z)?[z,...a]:a});function I(z){const Oe=z.target.value;h.value.enabled=Oe!=="",Oe!==""&&(h.value.model=Oe),Xe()}const O=m(!1),y=m({codex:!1,ollama:!1,kimi:!1}),v=m({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),_=m({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),S=m(!1),b=m(!1),T=m(!1),C=m(!1),R=m(!1),E=m(!1),U=m(!1),P=m({configured:!1}),M=m([]),Z=m(""),te=m(!1),B=m(!1),L=m({configured:!1}),N=m([]),q=m(""),_e=m(!1),ve=m(!1),le=m(!0),pe=m(""),F=m({configured:!1,accounts:[]}),ee=m(null),xe=m(null),H=m(""),oe=m(null),re=m(!1),ge=m(null),he=m(null),De=m("");let k=null;function A(z,Oe="success"){Se(z,Oe==="error"?"error":"success")}function $(z){if(!z)return"?";const Oe=z/(1024*1024*1024);return Oe>=1?Oe.toFixed(1)+" GB":(z/(1024*1024)).toFixed(0)+" MB"}async function Y(){e.value=!0,await Promise.all([G(),J(),ce(),ie()]),e.value=!1}async function G(){try{const z=await K.get("/api/llm/status");t.value=z,s.value=z.active_provider||"codex",z.codex&&!$e.pending()&&(n.value.enabled=z.codex.enabled,n.value.model=z.codex.model||"gpt-5.5",n.value.reasoning_effort=z.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=z.codex.agent_reasoning_effort||"",n.value.agent_model=z.codex.agent_model||"",n.value.max_tokens=z.codex.max_tokens||4096,n.value.request_timeout_seconds=z.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=z.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...z.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...z.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...z.codex.context_compression||{}}),z.ollama&&!j.pending()&&(v.value.enabled=z.ollama.enabled,v.value.base_url=z.ollama.base_url||"",v.value.model=z.ollama.model||"",v.value.max_tokens=z.ollama.max_tokens||4096,v.value.timeout=z.ollama.timeout??v.value.timeout),z.kimi&&!ye.pending()&&(_.value.enabled=z.kimi.enabled,_.value.model=z.kimi.model||"",_.value.max_tokens=z.kimi.max_tokens||4096,_.value.timeout=z.kimi.timeout??_.value.timeout),z.auxiliary&&(g.value=z.auxiliary,Xe.pending()||(h.value.enabled=z.auxiliary.enabled,h.value.model=z.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function J(){try{if(P.value=await K.get("/api/ollama/status"),P.value.model&&(Z.value=P.value.model),P.value.configured)try{const z=await K.get("/api/ollama/models");M.value=z.models||[]}catch{M.value=[]}else if(v.value.base_url)try{const z=await K.post("/api/ollama/probe-models",{base_url:v.value.base_url});M.value=z.models||[]}catch{M.value=[]}}catch{P.value={configured:!1}}}async function ie(){le.value=!0,pe.value="";try{F.value=await K.get("/api/codex/status")}catch(z){pe.value=z.message||"Failed to fetch Codex status"}finally{le.value=!1}}async function ne(){const z=t.value?t.value.active_provider:"codex";U.value=!0;try{const Oe=await K.post("/api/llm/switch",{provider:s.value});Oe.error?(s.value=z,A(Oe.error,"error")):(A("Switched to "+s.value+" ("+Oe.model+")"),await Y())}catch(Oe){s.value=z,A(Oe.message||"Switch failed","error")}finally{U.value=!1}}async function se(){te.value=!0;try{const z=await K.post("/api/ollama/reload");A(z.configured?"Ollama reloaded":z.reason||"Ollama not configured",z.configured?"success":"error"),await Y()}catch(z){A(z.message||"Reload failed","error")}finally{te.value=!1}}async function X(){B.value=!0;try{await K.post("/api/ollama/model",{model:Z.value}),A("Model set to "+Z.value),await Y()}catch(z){A(z.message||"Failed","error")}finally{B.value=!1}}async function be(){const z=v.value.base_url;if(!z){A("Enter a base URL first","error");return}E.value=!0;try{const Oe=await K.post("/api/ollama/probe-models",{base_url:z});M.value=Oe.models||[],M.value.length?(A(M.value.length+" model(s) found"),!v.value.model&&M.value.length&&(v.value.model=M.value[0].name)):A("No models found at "+z,"error")}catch(Oe){A(Oe.message||"Could not reach Ollama","error")}finally{E.value=!1}}async function ce(){try{if(L.value=await K.get("/api/kimi/status"),L.value.model&&(q.value=L.value.model),L.value.configured)try{const z=await K.get("/api/kimi/models");N.value=z.models||[]}catch{N.value=[]}}catch{L.value={configured:!1}}}async function ue(){_e.value=!0;try{const z=await K.post("/api/kimi/reload");A(z.configured?"Kimi reloaded":z.reason||"Kimi not configured",z.configured?"success":"error"),await Y()}catch(z){A(z.message||"Reload failed","error")}finally{_e.value=!1}}async function ke(){ve.value=!0;try{await K.post("/api/kimi/model",{model:q.value}),A("Model set to "+q.value),await Y()}catch(z){A(z.message||"Failed","error")}finally{ve.value=!1}}async function Te(){if(T.value){$e();return}T.value=!0;try{await K.put("/api/llm/codex/config",n.value),A("Codex config saved"),await Promise.all([G(),ie()])}catch(z){A(z.message||"Failed","error"),await Promise.all([G(),ie()])}finally{T.value=!1}}async function Ce(){if(C.value){j();return}C.value=!0;try{const z={...v.value},Oe=S.value?v.value.api_key:null;Oe===null&&delete z.api_key,await K.put("/api/llm/ollama/config",z),A("Ollama config saved"),Oe!==null&&v.value.api_key===Oe&&(v.value.api_key="",S.value=!1),await Promise.all([G(),J()])}catch(z){A(z.message||"Failed","error")}finally{C.value=!1}}async function Ie(){if(R.value){ye();return}R.value=!0;try{const z={..._.value},Oe=b.value?_.value.api_key:null;Oe===null&&delete z.api_key,await K.put("/api/llm/kimi/config",z),A("Kimi config saved"),Oe!==null&&_.value.api_key===Oe&&(_.value.api_key="",b.value=!1),await Promise.all([G(),ce()])}catch(z){A(z.message||"Failed","error")}finally{R.value=!1}}async function Pe(){if(O.value){Xe();return}O.value=!0;try{await K.put("/api/llm/auxiliary/config",h.value),A("Auxiliary config saved"),await G()}catch(z){A(z.message||"Failed","error"),await G()}finally{O.value=!1}}const $e=yl(Te),Xe=yl(Pe),j=yl(Ce),ye=yl(Ie),Re=()=>($e.cancel(),Te()),Le=()=>(j.cancel(),Ce()),He=()=>(ye.cancel(),Ie());async function Ve(z){try{await K.post("/api/codex/account/"+z+"/activate"),A("Active account switched"),await ie()}catch(Oe){A(Oe.message||"Failed","error")}}async function ft(z){ee.value=z;try{await K.post("/api/codex/account/"+z+"/refresh"),A("Token refreshed"),await ie()}catch(Oe){A(Oe.message||"Refresh failed","error")}finally{ee.value=null}}function es(z,Oe){xe.value=z,H.value=Oe||""}async function vs(z){try{await K.put("/api/codex/account/"+z+"/label",{label:H.value}),A("Label updated"),xe.value=null,await ie()}catch(Oe){A(Oe.message||"Failed","error")}}async function xn(z,Oe){if(await hs({title:"Delete Codex account",message:`Delete ${Oe||"account #"+(z+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await K.del("/api/codex/account/"+z),A("Deleted. Pool reloaded."),await ie()}catch(Bn){A(Bn.message||"Failed","error")}}async function Rs(){re.value=!0;try{const z=await K.post("/api/codex/device-code");ge.value=z,oe.value="pending",$s(z)}catch(z){A(z.message||"Failed","error")}finally{re.value=!1}}async function $s(z){k={cancelled:!1};const Oe=k;try{const bs=await K.post("/api/codex/device-poll",{device_auth_id:z.device_auth_id,user_code:z.user_code,interval:z.interval});if(Oe.cancelled)return;he.value=bs,oe.value="success",await Y()}catch(bs){if(Oe.cancelled)return;De.value=bs.message||"Device login failed",oe.value="error"}}function At(){k&&(k.cancelled=!0),oe.value=null,ge.value=null}return qe(Y),bt(()=>{k&&(k.cancelled=!0),$e.cancel(),Xe.cancel(),j.cancel(),ye.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:U,advancedOpen:y,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:h,auxData:g,auxModelOptions:x,onAuxModelChange:I,savingAux:O,saveAuxConfigDebounced:Xe,ollamaForm:v,kimiForm:_,savingCodex:T,savingOllama:C,savingKimi:R,probingOllama:E,ollamaKeyDirty:S,kimiKeyDirty:b,ollamaStatus:P,ollamaModels:M,ollamaSelectedModel:Z,reloading:te,settingModel:B,kimiStatus:L,kimiModels:N,kimiSelectedModel:q,reloadingKimi:_e,settingKimiModel:ve,codexLoading:le,codexError:pe,codexData:F,refreshing:ee,editingLabel:xe,labelValue:H,deviceState:oe,deviceLoading:re,deviceInfo:ge,deviceResult:he,deviceError:De,fetchAll:Y,switchProvider:ne,reloadOllama:se,setOllamaModel:X,reloadKimi:ue,setKimiModel:ke,probeOllamaModels:be,saveCodexConfig:Te,saveOllamaConfig:Ce,saveKimiConfig:Ie,saveCodexConfigDebounced:$e,saveOllamaConfigDebounced:j,saveKimiConfigDebounced:ye,saveCodexConfigNow:Re,saveOllamaConfigNow:Le,saveKimiConfigNow:He,activateAccount:Ve,refreshAccount:ft,startEditLabel:es,saveLabel:vs,deleteAccount:xn,startDeviceLogin:Rs,cancelDeviceLogin:At,formatSize:$}}},Pu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Jk(e){return Pu[e]||Pu[(e||"").toLowerCase()]||"text-gray-400"}const Yk={template:`
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
            <div>Checks: {{ freshnessStats.total || 0 }}</div>
            <div>Stale detected: <span class="text-yellow-400">{{ freshnessStats.stale || 0 }}</span></div>
            <div>Fetch failures: <span class="text-red-400">{{ freshnessStats.fetch_failures || 0 }}</span></div>
          </div>
          <p v-else class="text-xs text-gray-500">Freshness checking disabled or no data</p>
        </section>

      </div>
    </div>
  `,setup(){const e=m(!0),t=m({}),s=m([]),n=m({}),a=m({}),i=m(null),l=m(null),r=m(null),o=m(null),c=m(null),d=m(""),u=m(0),p=m([]),h=W(()=>p.value.map(S=>`${S.label} (${S.path}${S.reason?`: ${S.reason}`:""})`).join("; ")),g=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let x=null;async function I(){var R;const S=await Promise.allSettled(g.map(E=>K.get(E.path))),b=E=>S[E].status==="fulfilled"?S[E].value:null;t.value=b(0)||{};const T=b(1);s.value=Array.isArray(T)?T:T&&T.subsystems||[],n.value=b(2)||{},a.value=b(3)||{},i.value=b(4),l.value=b(5),r.value=b(6),o.value=b(7),c.value=b(8);const C=S.filter(E=>E.status==="rejected");if(p.value=S.flatMap((E,U)=>{var P;return E.status==="rejected"?[{...g[U],reason:((P=E.reason)==null?void 0:P.message)||"request failed"}]:[]}),u.value=p.value.length,C.length===S.length){const E=(R=C[0])==null?void 0:R.reason;d.value=(E==null?void 0:E.message)||"Failed to load internals"}else d.value="";e.value=!1}function O(){e.value=!0,d.value="",I()}let y=!1;function v(){y||(y=!0,I(),x||(x=setInterval(I,3e4)))}function _(){y&&(y=!1,x&&(clearInterval(x),x=null))}return qe(v),Es(v),As(_),bt(_),{loading:e,error:d,failedCount:u,failedEndpoints:p,failedEndpointSummary:h,endpoints:g,retry:O,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Jk,formatTime:Kc}}},Qk={setup(){const e=m(""),t=m(""),s=m(!1),n=m(""),a=m(!1),i=m(!1),l=m(!1),r=m(null),o=m(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await K.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await hs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await K.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return qe(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Cm=[{id:"health",label:"Health",component:Ck},{id:"resources",label:"Resources",component:Ek},{id:"logs",label:"Logs",component:Ok},{id:"config",label:"Config",component:jk},{id:"discord",label:"Discord",component:qk},{id:"host-access",label:"Host Access",component:Kk},{id:"api-tokens",label:"API Tokens",component:Wk},{id:"llm",label:"LLM Config",component:Zk},{id:"internals",label:"Internals",component:Yk},{id:"update",label:"Update",component:Qk}],Xk={components:{TabbedPage:Lr},setup(){return{tabs:Cm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},xl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),ew=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...xl("Operations","operations","/operations",vm),...xl("History","history","/history",bm),...xl("Capabilities","capabilities","/capabilities",ym),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...xl("System","system","/system",Cm)],ns=$n({open:!1,query:"",selected:0});function Fu(){ns.query="",ns.selected=0,ns.open=!0}function io(){ns.open=!1}function tw(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const sw={setup(){const e=dm(),t=m(null),s=W(()=>{const i=ns.query.trim().toLowerCase();return ew.map(l=>({...l,_score:tw(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});Yt(()=>ns.open,async i=>{var l;i&&(await Ct(),(l=t.value)==null||l.focus())}),Yt(()=>ns.query,()=>{ns.selected=0});function n(i){io(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),io();return}if(i.key==="ArrowDown")i.preventDefault(),ns.selected=Math.min(ns.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ns.selected=Math.max(ns.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ns.selected];l&&n(l)}}return{state:ns,results:s,inputEl:t,go:n,onKeydown:a,closePalette:io}},template:`
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
  `},Vo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Vo));const nw={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ua("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ua("path",{d:Vo[e.name]||Vo.info})])}},aw=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function $u(e){return[...e.querySelectorAll(aw)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const iw={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=$u(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||$u(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},lw={template:`
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
    </div>`,setup(){const e=m({}),t=m(!0),s=m(null),n=m([]),a=m(!1),i=m([]),l=m(!1),r=m([]),o=m(0),c=m(null),d=m({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=W(()=>{const M=e.value.uptime_seconds||0,Z=Math.floor(M/86400),te=Math.floor(M%86400/3600),B=Math.floor(M%3600/60),L=[];return Z>0&&L.push(`${Z}d`),te>0&&L.push(`${te}h`),(L.length===0||Z===0&&te===0)&&L.push(`${B}m`),L.join(" ")}),h=W(()=>{const M=e.value.uptime_seconds||0;return 125.66*(1-Math.min(M/86400,1))}),g=W(()=>{const M=e.value;return[{label:"Guilds",value:M.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:M.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:M.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${M.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:M.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:M.loop_count>0?"text-green-400":"",highlight:M.loop_count>0},{label:"Agents",value:M.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:M.agent_count>0?`${M.agent_count} total`:"",subColor:"text-gray-500",highlight:(M.agent_running??0)>0},{label:"Processes",value:M.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:M.process_count>0?`${M.process_count} total`:"",subColor:"text-gray-500",highlight:(M.process_running??0)>0},{label:"Schedules",value:M.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(M.schedule_failing>0?`${M.schedule_failing} failing`:"")+(M.schedule_failing>0&&M.schedule_paused>0?", ":"")+(M.schedule_paused>0?`${M.schedule_paused} paused`:"")||void 0,subColor:M.schedule_failing>0?"text-red-400":"text-yellow-400",color:M.schedule_failing>0?"text-red-400":"",highlight:M.schedule_failing>0},{label:"Users",value:M.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),x=W(()=>{const M=e.value,Z=[];return Z.push({label:"Bot",status:M.status==="online"?"ok":"warn",detail:M.status==="online"?"Online":"Starting"}),(M.schedule_failing||0)>0?Z.push({label:"Schedules",status:"error",detail:`${M.schedule_failing} failing`}):(M.schedule_count||0)>0&&Z.push({label:"Schedules",status:"ok",detail:`${M.schedule_count} configured`}),(M.loop_count||0)>0&&Z.push({label:"Loops",status:"ok",detail:`${M.loop_count} active`}),(M.agent_running||0)>0&&Z.push({label:"Agents",status:"ok",detail:`${M.agent_running} running`}),(M.process_running||0)>0&&Z.push({label:"Processes",status:"ok",detail:`${M.process_running} running`}),Z});async function I(){try{e.value=await K.get("/api/status"),s.value=null}catch(M){s.value=M.message}finally{t.value=!1}}async function O(){a.value=!0;try{n.value=await K.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function y(){l.value=!0;try{i.value=await K.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function v(){try{const M=await K.get("/api/knowledge");c.value=(Array.isArray(M)?M:[]).reduce((Z,te)=>Z+(te.chunks||0),0)}catch{c.value=null}}async function _(){try{const M=await K.get("/api/agents");r.value=M.filter(Z=>Z.status==="running")}catch{}}async function S(){d.value={...d.value,reload:!0};try{await K.post("/api/reload"),Se.success("Config reloaded")}catch(M){Se.error(M.message)}d.value={...d.value,reload:!1}}async function b(){if(!await hs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const Z=e.value.session_count;e.value={...e.value,session_count:0};try{const te=await K.post("/api/sessions/clear-all");Se.success(`Cleared ${te.count} session${te.count!==1?"s":""}`),await I()}catch(te){e.value={...e.value,session_count:Z},Se.error(te.message)}d.value={...d.value,clearSessions:!1}}async function T(){if(!await hs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const Z=e.value.loop_count;e.value={...e.value,loop_count:0};try{const te=await K.post("/api/loops/stop-all");Se.success(te.result),await I()}catch(te){e.value={...e.value,loop_count:Z},Se.error(te.message)}d.value={...d.value,stopLoops:!1}}function C(){t.value=!0,s.value=null,I(),O(),y(),_()}let R=null,E=null,U=null;function P(M){if(M.payload&&M.payload.tool_name){const Z={...M.payload,_isNew:!0,_key:++u};n.value.unshift(Z),n.value.length>10&&n.value.pop(),o.value++,Z.error&&(i.value.unshift(Z),i.value.length>5&&i.value.pop()),setTimeout(()=>{Z._isNew=!1},1500),clearTimeout(U),U=setTimeout(()=>{o.value=0},1e4)}}return qe(async()=>{await Promise.all([I(),O(),y(),_(),v()]),R=setInterval(I,15e3),E=setInterval(_,1e4),ze.subscribe("events",P)}),bt(()=>{R&&clearInterval(R),E&&clearInterval(E),clearTimeout(U),ze.unsubscribe("events",P)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:h,stats:g,healthIndicators:x,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:O,fetchStatus:I,formatTime:Kc,formatDuration:Wa,retry:C,reloadConfig:S,clearSessions:b,stopAllLoops:T}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Uu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function rw(e){if(Array.isArray(e))return e}function ow(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function cw(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function dw(e,t){return rw(e)||ow(e,t)||uw(e,t)||cw()}function uw(e,t){if(e){if(typeof e=="string")return Uu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Uu(e,t):void 0}}const Em=Object.entries,Bu=Object.setPrototypeOf,fw=Object.isFrozen,pw=Object.getPrototypeOf,hw=Object.getOwnPropertyDescriptor;let Xt=Object.freeze,Cs=Object.seal,Sa=Object.create,Am=typeof Reflect<"u"&&Reflect,jo=Am.apply,zo=Am.construct;Xt||(Xt=function(t){return t});Cs||(Cs=function(t){return t});jo||(jo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});zo||(zo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Xs=wt(Array.prototype.forEach),mw=wt(Array.prototype.lastIndexOf),Hu=wt(Array.prototype.pop),ya=wt(Array.prototype.push),gw=wt(Array.prototype.splice),Kt=Array.isArray,hi=wt(String.prototype.toLowerCase),lo=wt(String.prototype.toString),Vu=wt(String.prototype.match),xa=wt(String.prototype.replace),ju=wt(String.prototype.indexOf),vw=wt(String.prototype.trim),bw=wt(Number.prototype.toString),yw=wt(Boolean.prototype.toString),zu=typeof BigInt>"u"?null:wt(BigInt.prototype.toString),qu=typeof Symbol>"u"?null:wt(Symbol.prototype.toString),pt=wt(Object.prototype.hasOwnProperty),ri=wt(Object.prototype.toString),Lt=wt(RegExp.prototype.test),qn=xw(TypeError);function wt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return jo(e,t,n)}}function xw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return zo(e,s)}}function Fe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:hi;if(Bu&&Bu(e,null),!Kt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(fw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function _w(e){for(let t=0;t<e.length;t++)pt(e,t)||(e[t]=null);return e}function Bt(e){const t=Sa(null);for(const n of Em(e)){var s=dw(n,2);const a=s[0],i=s[1];pt(e,a)&&(Kt(i)?t[a]=_w(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Bt(i):t[a]=i)}return t}function kw(e){switch(typeof e){case"string":return e;case"number":return bw(e);case"boolean":return yw(e);case"bigint":return zu?zu(e):"0";case"symbol":return qu?qu(e):"Symbol()";case"undefined":return ri(e);case"function":case"object":{if(e===null)return ri(e);const t=e,s=Hs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ri(n)}return ri(e)}default:return ri(e)}}function Hs(e,t){for(;e!==null;){const n=hw(e,t);if(n){if(n.get)return wt(n.get);if(typeof n.value=="function")return wt(n.value)}e=pw(e)}function s(){return null}return s}function ww(e){try{return Lt(e,""),!0}catch{return!1}}const Gu=Xt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),ro=Xt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),oo=Xt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),Sw=Xt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),co=Xt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),Tw=Xt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Ku=Xt(["#text"]),Wu=Xt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),uo=Xt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Zu=Xt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),_l=Xt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),Cw=Cs(/{{[\w\W]*|^[\w\W]*}}/g),Ew=Cs(/<%[\w\W]*|^[\w\W]*%>/g),Aw=Cs(/\${[\w\W]*/g),Rw=Cs(/^data-[\-\w.\u00B7-\uFFFF]+$/),Iw=Cs(/^aria-[\-\w]+$/),Ju=Cs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),Ow=Cs(/^(?:\w+script|data):/i),Lw=Cs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Nw=Cs(/^html$/i),Dw=Cs(/^[a-z][.\w]*(-[.\w]+)+$/i),Us={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Mw=function(){return typeof window>"u"?null:window},Pw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Yu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Rm(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Mw();const t=fe=>Rm(fe);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Us.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,h=Hs(p,"cloneNode"),g=Hs(p,"remove"),x=Hs(p,"nextSibling"),I=Hs(p,"childNodes"),O=Hs(p,"parentNode"),y=Hs(p,"shadowRoot"),v=Hs(p,"attributes"),_=l&&l.prototype?Hs(l.prototype,"nodeType"):null,S=l&&l.prototype?Hs(l.prototype,"nodeName"):null;if(typeof i=="function"){const fe=s.createElement("template");fe.content&&fe.content.ownerDocument&&(s=fe.content.ownerDocument)}let b,T="",C,R=!1,E=0;const U=function(){if(E>0)throw qn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},P=function(f){U(),E++;try{return b.createHTML(f)}finally{E--}},M=function(f){U(),E++;try{return b.createScriptURL(f)}finally{E--}},Z=function(){return R||(C=Pw(u,a),R=!0),C},te=s,B=te.implementation,L=te.createNodeIterator,N=te.createDocumentFragment,q=te.getElementsByTagName,_e=n.importNode;let ve=Yu();t.isSupported=typeof Em=="function"&&typeof O=="function"&&B&&B.createHTMLDocument!==void 0;const le=Cw,pe=Ew,F=Aw,ee=Rw,xe=Iw,H=Ow,oe=Lw,re=Dw;let ge=Ju,he=null;const De=Fe({},[...Gu,...ro,...oo,...co,...Ku]);let k=null;const A=Fe({},[...Wu,...uo,...Zu,..._l]);let $=Object.seal(Sa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),Y=null,G=null;const J=Object.seal(Sa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let ie=!0,ne=!0,se=!1,X=!0,be=!1,ce=!0,ue=!1,ke=!1,Te=!1,Ce=!1,Ie=!1,Pe=!1,$e=!0,Xe=!1;const j="user-content-";let ye=!0,Re=!1,Le={},He=null;const Ve=Fe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ft=null;const es=Fe({},["audio","video","img","source","image","track"]);let vs=null;const xn=Fe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Rs="http://www.w3.org/1998/Math/MathML",$s="http://www.w3.org/2000/svg",At="http://www.w3.org/1999/xhtml";let z=At,Oe=!1,bs=null;const Bn=Fe({},[Rs,$s,At],lo);let os=Fe({},["mi","mo","mn","ms","mtext"]),Hn=Fe({},["annotation-xml"]);const Qa=Fe({},["title","style","font","a","script"]);let cs=null;const _n=["application/xhtml+xml","text/html"],kn="text/html";let it=null,Is=null;const V=s.createElement("form"),ae=function(f){return f instanceof RegExp||f instanceof Function},Ee=function(){let f=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Is&&Is===f)return;(!f||typeof f!="object")&&(f={}),f=Bt(f),cs=_n.indexOf(f.PARSER_MEDIA_TYPE)===-1?kn:f.PARSER_MEDIA_TYPE,it=cs==="application/xhtml+xml"?lo:hi,he=pt(f,"ALLOWED_TAGS")&&Kt(f.ALLOWED_TAGS)?Fe({},f.ALLOWED_TAGS,it):De,k=pt(f,"ALLOWED_ATTR")&&Kt(f.ALLOWED_ATTR)?Fe({},f.ALLOWED_ATTR,it):A,bs=pt(f,"ALLOWED_NAMESPACES")&&Kt(f.ALLOWED_NAMESPACES)?Fe({},f.ALLOWED_NAMESPACES,lo):Bn,vs=pt(f,"ADD_URI_SAFE_ATTR")&&Kt(f.ADD_URI_SAFE_ATTR)?Fe(Bt(xn),f.ADD_URI_SAFE_ATTR,it):xn,ft=pt(f,"ADD_DATA_URI_TAGS")&&Kt(f.ADD_DATA_URI_TAGS)?Fe(Bt(es),f.ADD_DATA_URI_TAGS,it):es,He=pt(f,"FORBID_CONTENTS")&&Kt(f.FORBID_CONTENTS)?Fe({},f.FORBID_CONTENTS,it):Ve,Y=pt(f,"FORBID_TAGS")&&Kt(f.FORBID_TAGS)?Fe({},f.FORBID_TAGS,it):Bt({}),G=pt(f,"FORBID_ATTR")&&Kt(f.FORBID_ATTR)?Fe({},f.FORBID_ATTR,it):Bt({}),Le=pt(f,"USE_PROFILES")?f.USE_PROFILES&&typeof f.USE_PROFILES=="object"?Bt(f.USE_PROFILES):f.USE_PROFILES:!1,ie=f.ALLOW_ARIA_ATTR!==!1,ne=f.ALLOW_DATA_ATTR!==!1,se=f.ALLOW_UNKNOWN_PROTOCOLS||!1,X=f.ALLOW_SELF_CLOSE_IN_ATTR!==!1,be=f.SAFE_FOR_TEMPLATES||!1,ce=f.SAFE_FOR_XML!==!1,ue=f.WHOLE_DOCUMENT||!1,Ce=f.RETURN_DOM||!1,Ie=f.RETURN_DOM_FRAGMENT||!1,Pe=f.RETURN_TRUSTED_TYPE||!1,Te=f.FORCE_BODY||!1,$e=f.SANITIZE_DOM!==!1,Xe=f.SANITIZE_NAMED_PROPS||!1,ye=f.KEEP_CONTENT!==!1,Re=f.IN_PLACE||!1,ge=ww(f.ALLOWED_URI_REGEXP)?f.ALLOWED_URI_REGEXP:Ju,z=typeof f.NAMESPACE=="string"?f.NAMESPACE:At,os=pt(f,"MATHML_TEXT_INTEGRATION_POINTS")&&f.MATHML_TEXT_INTEGRATION_POINTS&&typeof f.MATHML_TEXT_INTEGRATION_POINTS=="object"?Bt(f.MATHML_TEXT_INTEGRATION_POINTS):Fe({},["mi","mo","mn","ms","mtext"]),Hn=pt(f,"HTML_INTEGRATION_POINTS")&&f.HTML_INTEGRATION_POINTS&&typeof f.HTML_INTEGRATION_POINTS=="object"?Bt(f.HTML_INTEGRATION_POINTS):Fe({},["annotation-xml"]);const w=pt(f,"CUSTOM_ELEMENT_HANDLING")&&f.CUSTOM_ELEMENT_HANDLING&&typeof f.CUSTOM_ELEMENT_HANDLING=="object"?Bt(f.CUSTOM_ELEMENT_HANDLING):Sa(null);if($=Sa(null),pt(w,"tagNameCheck")&&ae(w.tagNameCheck)&&($.tagNameCheck=w.tagNameCheck),pt(w,"attributeNameCheck")&&ae(w.attributeNameCheck)&&($.attributeNameCheck=w.attributeNameCheck),pt(w,"allowCustomizedBuiltInElements")&&typeof w.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=w.allowCustomizedBuiltInElements),be&&(ne=!1),Ie&&(Ce=!0),Le&&(he=Fe({},Ku),k=Sa(null),Le.html===!0&&(Fe(he,Gu),Fe(k,Wu)),Le.svg===!0&&(Fe(he,ro),Fe(k,uo),Fe(k,_l)),Le.svgFilters===!0&&(Fe(he,oo),Fe(k,uo),Fe(k,_l)),Le.mathMl===!0&&(Fe(he,co),Fe(k,Zu),Fe(k,_l))),J.tagCheck=null,J.attributeCheck=null,pt(f,"ADD_TAGS")&&(typeof f.ADD_TAGS=="function"?J.tagCheck=f.ADD_TAGS:Kt(f.ADD_TAGS)&&(he===De&&(he=Bt(he)),Fe(he,f.ADD_TAGS,it))),pt(f,"ADD_ATTR")&&(typeof f.ADD_ATTR=="function"?J.attributeCheck=f.ADD_ATTR:Kt(f.ADD_ATTR)&&(k===A&&(k=Bt(k)),Fe(k,f.ADD_ATTR,it))),pt(f,"ADD_URI_SAFE_ATTR")&&Kt(f.ADD_URI_SAFE_ATTR)&&Fe(vs,f.ADD_URI_SAFE_ATTR,it),pt(f,"FORBID_CONTENTS")&&Kt(f.FORBID_CONTENTS)&&(He===Ve&&(He=Bt(He)),Fe(He,f.FORBID_CONTENTS,it)),pt(f,"ADD_FORBID_CONTENTS")&&Kt(f.ADD_FORBID_CONTENTS)&&(He===Ve&&(He=Bt(He)),Fe(He,f.ADD_FORBID_CONTENTS,it)),ye&&(he["#text"]=!0),ue&&Fe(he,["html","head","body"]),he.table&&(Fe(he,["tbody"]),delete Y.tbody),f.TRUSTED_TYPES_POLICY){if(typeof f.TRUSTED_TYPES_POLICY.createHTML!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof f.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const D=b;b=f.TRUSTED_TYPES_POLICY;try{T=P("")}catch(Q){throw b=D,Q}}else f.TRUSTED_TYPES_POLICY===null?(b=void 0,T=""):(b===void 0&&(b=Z()),b&&typeof T=="string"&&(T=P("")));(ve.uponSanitizeElement.length>0||ve.uponSanitizeAttribute.length>0)&&he===De&&(he=Bt(he)),ve.uponSanitizeAttribute.length>0&&k===A&&(k=Bt(k)),Xt&&Xt(f),Is=f},We=Fe({},[...ro,...oo,...Sw]),rt=Fe({},[...co,...Tw]),Ft=function(f){let w=O(f);(!w||!w.tagName)&&(w={namespaceURI:z,tagName:"template"});const D=hi(f.tagName),Q=hi(w.tagName);return bs[f.namespaceURI]?f.namespaceURI===$s?w.namespaceURI===At?D==="svg":w.namespaceURI===Rs?D==="svg"&&(Q==="annotation-xml"||os[Q]):!!We[D]:f.namespaceURI===Rs?w.namespaceURI===At?D==="math":w.namespaceURI===$s?D==="math"&&Hn[Q]:!!rt[D]:f.namespaceURI===At?w.namespaceURI===$s&&!Hn[Q]||w.namespaceURI===Rs&&!os[Q]?!1:!rt[D]&&(Qa[D]||!We[D]):!!(cs==="application/xhtml+xml"&&bs[f.namespaceURI]):!1},$t=function(f){ya(t.removed,{element:f});try{O(f).removeChild(f)}catch{if(g(f),!O(f))throw qn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Xa=function(f){const w=I?I(f):f.childNodes;if(w){const Q=[];Xs(w,de=>{ya(Q,de)}),Xs(Q,de=>{try{g(de)}catch{}})}const D=v?v(f):null;if(D)for(let Q=D.length-1;Q>=0;--Q){const de=D[Q],we=de&&de.name;if(typeof we=="string")try{f.removeAttribute(we)}catch{}}},Zs=function(f,w){try{ya(t.removed,{attribute:w.getAttributeNode(f),from:w})}catch{ya(t.removed,{attribute:null,from:w})}if(w.removeAttribute(f),f==="is")if(Ce||Ie)try{$t(w)}catch{}else try{w.setAttribute(f,"")}catch{}},Mr=function(f){const w=v?v(f):f.attributes;if(w)for(let D=w.length-1;D>=0;--D){const Q=w[D],de=Q&&Q.name;if(!(typeof de!="string"||k[it(de)]))try{f.removeAttribute(de)}catch{}}},Pr=function(f){const w=[f];for(;w.length>0;){const D=w.pop();(_?_(D):D.nodeType)===Us.element&&Mr(D);const de=I?I(D):D.childNodes;if(de)for(let we=de.length-1;we>=0;--we)w.push(de[we])}},Vn=function(f){let w=null,D=null;if(Te)f="<remove></remove>"+f;else{const we=Vu(f,/^[\r\n\t ]+/);D=we&&we[0]}cs==="application/xhtml+xml"&&z===At&&(f='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+f+"</body></html>");const Q=b?P(f):f;if(z===At)try{w=new d().parseFromString(Q,cs)}catch{}if(!w||!w.documentElement){w=B.createDocument(z,"template",null);try{w.documentElement.innerHTML=Oe?T:Q}catch{}}const de=w.body||w.documentElement;return f&&D&&de.insertBefore(s.createTextNode(D),de.childNodes[0]||null),z===At?q.call(w,ue?"html":"body")[0]:ue?w.documentElement:de},tl=function(f){return L.call(f.ownerDocument||f,f,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},wn=function(f){var w,D;f.normalize();const Q=L.call(f.ownerDocument||f,f,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let de=Q.nextNode();for(;de;){let st=de.data;Xs([le,pe,F],Ge=>{st=xa(st,Ge," ")}),de.data=st,de=Q.nextNode()}const we=(w=(D=f.querySelectorAll)===null||D===void 0?void 0:D.call(f,"template"))!==null&&w!==void 0?w:[];Xs(Array.from(we),st=>{Sn(st.content)&&wn(st.content)})},pa=function(f){const w=S?S(f):null;return typeof w!="string"||it(w)!=="form"?!1:typeof f.nodeName!="string"||typeof f.textContent!="string"||typeof f.removeChild!="function"||f.attributes!==v(f)||typeof f.removeAttribute!="function"||typeof f.setAttribute!="function"||typeof f.namespaceURI!="string"||typeof f.insertBefore!="function"||typeof f.hasChildNodes!="function"||f.nodeType!==_(f)||f.childNodes!==I(f)},Sn=function(f){if(!_||typeof f!="object"||f===null)return!1;try{return _(f)===Us.documentFragment}catch{return!1}},ys=function(f){if(!_||typeof f!="object"||f===null)return!1;try{return typeof _(f)=="number"}catch{return!1}};function Os(fe,f,w){Xs(fe,D=>{D.call(t,f,w,Is)})}const sl=function(f){let w=null;if(Os(ve.beforeSanitizeElements,f,null),pa(f))return $t(f),!0;const D=it(S?S(f):f.nodeName);if(Os(ve.uponSanitizeElement,f,{tagName:D,allowedTags:he}),ce&&f.hasChildNodes()&&!ys(f.firstElementChild)&&Lt(/<[/\w!]/g,f.innerHTML)&&Lt(/<[/\w!]/g,f.textContent)||ce&&f.namespaceURI===At&&D==="style"&&ys(f.firstElementChild)||f.nodeType===Us.progressingInstruction||ce&&f.nodeType===Us.comment&&Lt(/<[/\w]/g,f.data))return $t(f),!0;if(Y[D]||!(J.tagCheck instanceof Function&&J.tagCheck(D))&&!he[D]){if(!Y[D]&&nl(D)&&($.tagNameCheck instanceof RegExp&&Lt($.tagNameCheck,D)||$.tagNameCheck instanceof Function&&$.tagNameCheck(D)))return!1;if(ye&&!He[D]){const de=O(f),we=I(f);if(we&&de){const st=we.length;for(let Ge=st-1;Ge>=0;--Ge){const dt=Re?we[Ge]:h(we[Ge],!0);de.insertBefore(dt,x(f))}}}return $t(f),!0}return(_?_(f):f.nodeType)===Us.element&&!Ft(f)||(D==="noscript"||D==="noembed"||D==="noframes")&&Lt(/<\/no(script|embed|frames)/i,f.innerHTML)?($t(f),!0):(be&&f.nodeType===Us.text&&(w=f.textContent,Xs([le,pe,F],de=>{w=xa(w,de," ")}),f.textContent!==w&&(ya(t.removed,{element:f.cloneNode()}),f.textContent=w)),Os(ve.afterSanitizeElements,f,null),!1)},ei=function(f,w,D){if(G[w]||$e&&(w==="id"||w==="name")&&(D in s||D in V))return!1;const Q=k[w]||J.attributeCheck instanceof Function&&J.attributeCheck(w,f);if(!(ne&&!G[w]&&Lt(ee,w))){if(!(ie&&Lt(xe,w))){if(!Q||G[w]){if(!(nl(f)&&($.tagNameCheck instanceof RegExp&&Lt($.tagNameCheck,f)||$.tagNameCheck instanceof Function&&$.tagNameCheck(f))&&($.attributeNameCheck instanceof RegExp&&Lt($.attributeNameCheck,w)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(w,f))||w==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&Lt($.tagNameCheck,D)||$.tagNameCheck instanceof Function&&$.tagNameCheck(D))))return!1}else if(!vs[w]){if(!Lt(ge,xa(D,oe,""))){if(!((w==="src"||w==="xlink:href"||w==="href")&&f!=="script"&&ju(D,"data:")===0&&ft[f])){if(!(se&&!Lt(H,xa(D,oe,"")))){if(D)return!1}}}}}}return!0},Fr=Fe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),nl=function(f){return!Fr[hi(f)]&&Lt(re,f)},al=function(f){Os(ve.beforeSanitizeAttributes,f,null);const w=f.attributes;if(!w||pa(f))return;const D={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:k,forceKeepAttr:void 0};let Q=w.length;for(;Q--;){const de=w[Q],we=de.name,st=de.namespaceURI,Ge=de.value,dt=it(we),Ls=Ge;let Rt=we==="value"?Ls:vw(Ls);if(D.attrName=dt,D.attrValue=Rt,D.keepAttr=!0,D.forceKeepAttr=void 0,Os(ve.uponSanitizeAttribute,f,D),Rt=D.attrValue,Xe&&(dt==="id"||dt==="name")&&ju(Rt,j)!==0&&(Zs(we,f),Rt=j+Rt),ce&&Lt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Rt)){Zs(we,f);continue}if(dt==="attributename"&&Vu(Rt,"href")){Zs(we,f);continue}if(D.forceKeepAttr)continue;if(!D.keepAttr){Zs(we,f);continue}if(!X&&Lt(/\/>/i,Rt)){Zs(we,f);continue}be&&Xs([le,pe,F],id=>{Rt=xa(Rt,id," ")});const ad=it(f.nodeName);if(!ei(ad,dt,Rt)){Zs(we,f);continue}if(b&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!st)switch(u.getAttributeType(ad,dt)){case"TrustedHTML":{Rt=P(Rt);break}case"TrustedScriptURL":{Rt=M(Rt);break}}if(Rt!==Ls)try{st?f.setAttributeNS(st,we,Rt):f.setAttribute(we,Rt),pa(f)?$t(f):Hu(t.removed)}catch{Zs(we,f)}}Os(ve.afterSanitizeAttributes,f,null)},Tn=function(f){let w=null;const D=tl(f);for(Os(ve.beforeSanitizeShadowDOM,f,null);w=D.nextNode();)if(Os(ve.uponSanitizeShadowNode,w,null),sl(w),al(w),Sn(w.content)&&Tn(w.content),(_?_(w):w.nodeType)===Us.element){const de=y?y(w):w.shadowRoot;Sn(de)&&(ha(de),Tn(de))}Os(ve.afterSanitizeShadowDOM,f,null)},ha=function(f){const w=[{node:f,shadow:null}];for(;w.length>0;){const D=w.pop();if(D.shadow){Tn(D.shadow);continue}const Q=D.node,we=(_?_(Q):Q.nodeType)===Us.element,st=I?I(Q):Q.childNodes;if(st)for(let Ge=st.length-1;Ge>=0;--Ge)w.push({node:st[Ge],shadow:null});if(we){const Ge=S?S(Q):null;if(typeof Ge=="string"&&it(Ge)==="template"){const dt=Q.content;Sn(dt)&&w.push({node:dt,shadow:null})}}if(we){const Ge=y?y(Q):Q.shadowRoot;Sn(Ge)&&w.push({node:null,shadow:Ge},{node:Ge,shadow:null})}}};return t.sanitize=function(fe){let f=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},w=null,D=null,Q=null,de=null;if(Oe=!fe,Oe&&(fe="<!-->"),typeof fe!="string"&&!ys(fe)&&(fe=kw(fe),typeof fe!="string"))throw qn("dirty is not a string, aborting");if(!t.isSupported)return fe;ke||Ee(f),t.removed=[];const we=Re&&typeof fe!="string"&&ys(fe);if(we){const dt=S?S(fe):fe.nodeName;if(typeof dt=="string"){const Ls=it(dt);if(!he[Ls]||Y[Ls])throw qn("root node is forbidden and cannot be sanitized in-place")}if(pa(fe))throw qn("root node is clobbered and cannot be sanitized in-place");try{ha(fe)}catch(Ls){throw Xa(fe),Ls}}else if(ys(fe))w=Vn("<!---->"),D=w.ownerDocument.importNode(fe,!0),D.nodeType===Us.element&&D.nodeName==="BODY"||D.nodeName==="HTML"?w=D:w.appendChild(D),ha(D);else{if(!Ce&&!be&&!ue&&fe.indexOf("<")===-1)return b&&Pe?P(fe):fe;if(w=Vn(fe),!w)return Ce?null:Pe?T:""}w&&Te&&$t(w.firstChild);const st=tl(we?fe:w);try{for(;Q=st.nextNode();)sl(Q),al(Q),Sn(Q.content)&&Tn(Q.content)}catch(dt){throw we&&Xa(fe),dt}if(we)return Xs(t.removed,dt=>{dt.element&&Pr(dt.element)}),be&&wn(fe),fe;if(Ce){if(be&&wn(w),Ie)for(de=N.call(w.ownerDocument);w.firstChild;)de.appendChild(w.firstChild);else de=w;return(k.shadowroot||k.shadowrootmode)&&(de=_e.call(n,de,!0)),de}let Ge=ue?w.outerHTML:w.innerHTML;return ue&&he["!doctype"]&&w.ownerDocument&&w.ownerDocument.doctype&&w.ownerDocument.doctype.name&&Lt(Nw,w.ownerDocument.doctype.name)&&(Ge="<!DOCTYPE "+w.ownerDocument.doctype.name+`>
`+Ge),be&&Xs([le,pe,F],dt=>{Ge=xa(Ge,dt," ")}),b&&Pe?P(Ge):Ge},t.setConfig=function(){let fe=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ee(fe),ke=!0},t.clearConfig=function(){Is=null,ke=!1,b=C,T=""},t.isValidAttribute=function(fe,f,w){Is||Ee({});const D=it(fe),Q=it(f);return ei(D,Q,w)},t.addHook=function(fe,f){typeof f=="function"&&ya(ve[fe],f)},t.removeHook=function(fe,f){if(f!==void 0){const w=mw(ve[fe],f);return w===-1?void 0:gw(ve[fe],w,1)[0]}return Hu(ve[fe])},t.removeHooks=function(fe){ve[fe]=[]},t.removeAllHooks=function(){ve=Yu()},t}var Qu=Rm();function Zc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var fa=Zc();function Im(e){fa=e}var Si={exec:()=>null};function tt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Jt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Jt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Fw=/^(?:[ \t]*(?:\n|$))+/,$w=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Uw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,el=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Bw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Jc=/(?:[*+-]|\d{1,9}[.)])/,Om=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Lm=tt(Om).replace(/bull/g,Jc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),Hw=tt(Om).replace(/bull/g,Jc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Yc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Vw=/^[^\n]+/,Qc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,jw=tt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Qc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),zw=tt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Jc).getRegex(),Nr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Xc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,qw=tt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Xc).replace("tag",Nr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Nm=tt(Yc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Nr).getRegex(),Gw=tt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Nm).getRegex(),ed={blockquote:Gw,code:$w,def:jw,fences:Uw,heading:Bw,hr:el,html:qw,lheading:Lm,list:zw,newline:Fw,paragraph:Nm,table:Si,text:Vw},Xu=tt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Nr).getRegex(),Kw={...ed,lheading:Hw,table:Xu,paragraph:tt(Yc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Xu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Nr).getRegex()},Ww={...ed,html:tt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Xc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Si,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:tt(Yc).replace("hr",el).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Lm).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Zw=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Jw=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Dm=/^( {2,}|\\)\n(?!\s*$)/,Yw=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Dr=/[\p{P}\p{S}]/u,td=/[\s\p{P}\p{S}]/u,Mm=/[^\s\p{P}\p{S}]/u,Qw=tt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,td).getRegex(),Pm=/(?!~)[\p{P}\p{S}]/u,Xw=/(?!~)[\s\p{P}\p{S}]/u,eS=/(?:[^\s\p{P}\p{S}]|~)/u,tS=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Fm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,sS=tt(Fm,"u").replace(/punct/g,Dr).getRegex(),nS=tt(Fm,"u").replace(/punct/g,Pm).getRegex(),$m="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",aS=tt($m,"gu").replace(/notPunctSpace/g,Mm).replace(/punctSpace/g,td).replace(/punct/g,Dr).getRegex(),iS=tt($m,"gu").replace(/notPunctSpace/g,eS).replace(/punctSpace/g,Xw).replace(/punct/g,Pm).getRegex(),lS=tt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Mm).replace(/punctSpace/g,td).replace(/punct/g,Dr).getRegex(),rS=tt(/\\(punct)/,"gu").replace(/punct/g,Dr).getRegex(),oS=tt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),cS=tt(Xc).replace("(?:-->|$)","-->").getRegex(),dS=tt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",cS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),nr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,uS=tt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",nr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Um=tt(/^!?\[(label)\]\[(ref)\]/).replace("label",nr).replace("ref",Qc).getRegex(),Bm=tt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Qc).getRegex(),fS=tt("reflink|nolink(?!\\()","g").replace("reflink",Um).replace("nolink",Bm).getRegex(),sd={_backpedal:Si,anyPunctuation:rS,autolink:oS,blockSkip:tS,br:Dm,code:Jw,del:Si,emStrongLDelim:sS,emStrongRDelimAst:aS,emStrongRDelimUnd:lS,escape:Zw,link:uS,nolink:Bm,punctuation:Qw,reflink:Um,reflinkSearch:fS,tag:dS,text:Yw,url:Si},pS={...sd,link:tt(/^!?\[(label)\]\((.*?)\)/).replace("label",nr).getRegex(),reflink:tt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",nr).getRegex()},qo={...sd,emStrongRDelimAst:iS,emStrongLDelim:nS,url:tt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},hS={...qo,br:tt(Dm).replace("{2,}","*").getRegex(),text:tt(qo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},kl={normal:ed,gfm:Kw,pedantic:Ww},oi={normal:sd,gfm:qo,breaks:hS,pedantic:pS},mS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},ef=e=>mS[e];function Vs(e,t){if(t){if(Jt.escapeTest.test(e))return e.replace(Jt.escapeReplace,ef)}else if(Jt.escapeTestNoEncode.test(e))return e.replace(Jt.escapeReplaceNoEncode,ef);return e}function tf(e){try{e=encodeURI(e).replace(Jt.percentDecode,"%")}catch{return null}return e}function sf(e,t){var i;const s=e.replace(Jt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Jt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Jt.slashPipe,"|");return n}function ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function gS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function nf(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function vS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var ar=class{constructor(e){at(this,"options");at(this,"rules");at(this,"lexer");this.options=e||fa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=vS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ci(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ci(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,g=h.raw+`
`+s.join(`
`),x=this.blockquote(g);i[i.length-1]=x,n=n.substring(0,n.length-h.raw.length)+x.raw,a=a.substring(0,a.length-h.text.length)+x.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,g=h.raw+`
`+s.join(`
`),x=this.list(g);i[i.length-1]=x,n=n.substring(0,n.length-p.raw.length)+x.raw,a=a.substring(0,a.length-h.raw.length)+x.raw,s=g.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,O=>" ".repeat(3*O.length)),p=e.split(`
`,1)[0],h=!u.trim(),g=0;if(this.options.pedantic?(g=2,d=u.trimStart()):h?g=t[1].length+1:(g=t[2].search(this.rules.other.nonSpaceChar),g=g>4?1:g,d=u.slice(g),g+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const O=this.rules.other.nextBulletRegex(g),y=this.rules.other.hrRegex(g),v=this.rules.other.fencesBeginRegex(g),_=this.rules.other.headingBeginRegex(g),S=this.rules.other.htmlBeginRegex(g);for(;e;){const b=e.split(`
`,1)[0];let T;if(p=b,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),T=p):T=p.replace(this.rules.other.tabCharGlobal,"    "),v.test(p)||_.test(p)||S.test(p)||O.test(p)||y.test(p))break;if(T.search(this.rules.other.nonSpaceChar)>=g||!p.trim())d+=`
`+T.slice(g);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||v.test(u)||_.test(u)||y.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=b+`
`,e=e.substring(b.length+1),u=T.slice(g)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let x=null,I;this.options.gfm&&(x=this.rules.other.listIsTask.exec(d),x&&(I=x[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!x,checked:I,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=sf(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(sf(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=gS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),nf(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return nf(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const g=p.slice(1,-1);return{type:"em",raw:p,text:g,tokens:this.lexer.inlineTokens(g)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},on=class Go{constructor(t){at(this,"tokens");at(this,"options");at(this,"state");at(this,"tokenizer");at(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||fa,this.options.tokenizer=this.options.tokenizer||new ar,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Jt,block:kl.normal,inline:oi.normal};this.options.pedantic?(s.block=kl.pedantic,s.inline=oi.pedantic):this.options.gfm&&(s.block=kl.gfm,this.options.breaks?s.inline=oi.breaks:s.inline=oi.gfm),this.tokenizer.rules=s}static get rules(){return{block:kl,inline:oi}}static lex(t,s){return new Go(s).lex(t)}static lexInline(t,s){return new Go(s).inlineTokens(t)}lex(t){t=t.replace(Jt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Jt.tabCharGlobal,"    ").replace(Jt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let g;this.options.extensions.startInline.forEach(x=>{g=x.call({lexer:this},h),typeof g=="number"&&g>=0&&(p=Math.min(p,g))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},ir=class{constructor(e){at(this,"options");at(this,"parser");this.options=e||fa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Jt.notSpaceStart))==null?void 0:i[0],a=e.replace(Jt.endingNewline,"")+`
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
`}strong({tokens:e}){return`<strong>${this.parser.parseInline(e)}</strong>`}em({tokens:e}){return`<em>${this.parser.parseInline(e)}</em>`}codespan({text:e}){return`<code>${Vs(e,!0)}</code>`}br(e){return"<br>"}del({tokens:e}){return`<del>${this.parser.parseInline(e)}</del>`}link({href:e,title:t,tokens:s}){const n=this.parser.parseInline(s),a=tf(e);if(a===null)return n;e=a;let i='<a href="'+e+'"';return t&&(i+=' title="'+Vs(t)+'"'),i+=">"+n+"</a>",i}image({href:e,title:t,text:s,tokens:n}){n&&(s=this.parser.parseInline(n,this.parser.textRenderer));const a=tf(e);if(a===null)return Vs(s);e=a;let i=`<img src="${e}" alt="${s}"`;return t&&(i+=` title="${Vs(t)}"`),i+=">",i}text(e){return"tokens"in e&&e.tokens?this.parser.parseInline(e.tokens):"escaped"in e&&e.escaped?e.text:Vs(e.text)}},nd=class{strong({text:e}){return e}em({text:e}){return e}codespan({text:e}){return e}del({text:e}){return e}html({text:e}){return e}text({text:e}){return e}link({text:e}){return""+e}image({text:e}){return""+e}br(){return""}},cn=class Ko{constructor(t){at(this,"options");at(this,"renderer");at(this,"textRenderer");this.options=t||fa,this.options.renderer=this.options.renderer||new ir,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new nd}static parse(t,s){return new Ko(s).parse(t)}static parseInline(t,s){return new Ko(s).parseInline(t)}parse(t,s=!0){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=r,d=this.options.extensions.renderers[c.type].call({parser:this},c);if(d!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(c.type)){n+=d||"";continue}}const o=r;switch(o.type){case"space":{n+=this.renderer.space(o);continue}case"hr":{n+=this.renderer.hr(o);continue}case"heading":{n+=this.renderer.heading(o);continue}case"code":{n+=this.renderer.code(o);continue}case"table":{n+=this.renderer.table(o);continue}case"blockquote":{n+=this.renderer.blockquote(o);continue}case"list":{n+=this.renderer.list(o);continue}case"html":{n+=this.renderer.html(o);continue}case"paragraph":{n+=this.renderer.paragraph(o);continue}case"text":{let c=o,d=this.renderer.text(c);for(;l+1<t.length&&t[l+1].type==="text";)c=t[++l],d+=`
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},fo,Rl=(fo=class{constructor(e){at(this,"options");at(this,"block");this.options=e||fa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?on.lex:on.lexInline}provideParser(){return this.block?cn.parse:cn.parseInline}},at(fo,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),fo),bS=class{constructor(...e){at(this,"defaults",Zc());at(this,"options",this.setOptions);at(this,"parse",this.parseMarkdown(!0));at(this,"parseInline",this.parseMarkdown(!1));at(this,"Parser",cn);at(this,"Renderer",ir);at(this,"TextRenderer",nd);at(this,"Lexer",on);at(this,"Tokenizer",ar);at(this,"Hooks",Rl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new ir(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new ar(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Rl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Rl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return on.lex(e,t??this.defaults)}parser(e,t){return cn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?on.lex:on.lexInline,o=i.hooks?i.hooks.provideParser():e?cn.parse:cn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Vs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},la=new bS;function Qe(e,t){return la.parse(e,t)}Qe.options=Qe.setOptions=function(e){return la.setOptions(e),Qe.defaults=la.defaults,Im(Qe.defaults),Qe};Qe.getDefaults=Zc;Qe.defaults=fa;Qe.use=function(...e){return la.use(...e),Qe.defaults=la.defaults,Im(Qe.defaults),Qe};Qe.walkTokens=function(e,t){return la.walkTokens(e,t)};Qe.parseInline=la.parseInline;Qe.Parser=cn;Qe.parser=cn.parse;Qe.Renderer=ir;Qe.TextRenderer=nd;Qe.Lexer=on;Qe.lexer=on.lex;Qe.Tokenizer=ar;Qe.Hooks=Rl;Qe.parse=Qe;Qe.options;Qe.setOptions;Qe.use;Qe.walkTokens;Qe.parseInline;cn.parse;on.lex;const yS={breaks:!0,gfm:!0};function af(e){if(!e)return"";try{if(typeof Qe<"u"&&Qe.parse){const t=Qe.parse(e,yS);return typeof Qu<"u"?Qu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function xS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const _S={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function kS(e){return _S[e]||"wrench"}const wS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function lf(e){if(!e)return[];const t=e.match(wS);return t?[...new Set(t)]:[]}const SS={template:`
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
    </div>`,setup(){const e=m([]),t=m(""),s=m(!1),n=m(null),a=m(null),i=m(0),l=m("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=W(()=>t.value.trim().length>0&&!s.value),u=m(ze.state||"disconnected");let p=null,h=null;const g=W(()=>{const B=u.value;return B==="connected"?"Connected":B==="reconnecting"?"Reconnecting…":B==="connecting"?"Connecting…":"REST fallback"}),x=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],I=W(()=>{const B=Math.floor(i.value/4)%x.length,L=i.value;return L>3?`${x[B]} (${L}s)`:x[0]});function O(){Ct(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function y(){if(!a.value)return;const B=a.value;B.style.height="auto",B.style.height=Math.min(B.scrollHeight,120)+"px"}function v(B,L,N={}){const q={id:++o,role:B,content:L,timestamp:Date.now(),html:B==="bot"?af(L):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:B==="bot"?lf(L):[],files:N.files||[],_showTools:!1};return e.value.push(q),O(),B==="bot"&&Ct(()=>_()),q}function _(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(L=>{L.setAttribute("data-copy","true"),L.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const q=L.querySelector("code"),_e=q?q.textContent:L.textContent;navigator.clipboard.writeText(_e).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),L.appendChild(N)})}function S(B){if(B===0)return!0;const L=e.value[B-1],N=e.value[B],q=new Date(L.timestamp).toDateString(),_e=new Date(N.timestamp).toDateString();return q!==_e}function b(B){const L=new Date(B),N=new Date;if(L.toDateString()===N.toDateString())return"Today";const q=new Date(N);return q.setDate(q.getDate()-1),L.toDateString()===q.toDateString()?"Yesterday":L.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function T(B){t.value=B,Ct(()=>Z())}function C(B){window.open(B,"_blank","noopener")}function R(B){B.target.style.display="none"}function E(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function U(){r&&(clearInterval(r),r=null),i.value=0}function P(B){s.value&&(s.value=!1,U(),B.type==="chat_response"?v("bot",B.content,{tools_used:B.tools_used||[],is_error:B.is_error||!1,files:B.files||[]}):B.type==="chat_error"&&v("bot",B.error||"Unknown error",{is_error:!0}),Ct(()=>{var L;return(L=a.value)==null?void 0:L.focus()}))}async function M(B){try{const L=await K.post("/api/chat",{content:B,channel_id:l.value});v("bot",L.response,{tools_used:L.tools_used||[],is_error:L.is_error||!1,files:L.files||[]})}catch(L){v("bot",L.message||"Failed to send message",{is_error:!0})}}async function Z(){const B=t.value.trim();if(!B||s.value)return;v("user",B),t.value="",s.value=!0,E(),a.value&&(a.value.style.height="auto"),ze.connected&&ze.sendChat(B,{channelId:l.value})||(await M(B),s.value=!1,U()),Ct(()=>{var N;return(N=a.value)==null?void 0:N.focus()})}async function te(){try{if(!l.value){const L=await K.get("/api/auth/session");l.value=L.channel_id||L.user_id||"web-user"}const B=await K.get("/api/sessions/"+encodeURIComponent(l.value));if(B&&B.messages&&B.messages.length>0){for(const L of B.messages){const N=L.role==="user"?"user":"bot";let q=L.content||"";if(N==="user"){const ve=q.match(/^\[.*?\]:\s*/);ve&&(q=q.slice(ve[0].length))}if(!q.trim())continue;const _e={id:++o,role:N,content:q,timestamp:L.timestamp?L.timestamp*1e3:Date.now(),html:N==="bot"?af(q):"",tools_used:[],is_error:!1,images:N==="bot"?lf(q):[],files:[],_showTools:!1};e.value.push(_e)}Ct(()=>{O(),_()})}}catch{}}return qe(()=>{ze.subscribe("chat",P),u.value=ze.state||"disconnected",p=ze.onStateChange,h=(B,L)=>{u.value=B,p&&p(B,L)},ze.onStateChange=h,te(),Ct(()=>{var B;return(B=a.value)==null?void 0:B.focus()})}),bt(()=>{ze.unsubscribe("chat",P),ze.onStateChange===h&&(ze.onStateChange=p),U()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:g,typingText:I,suggestions:c,send:Z,autoResize:y,formatTime:xS,formatDate:b,showDateSeparator:S,useSuggestion:T,openImage:C,onImageError:R,getToolIcon:kS}}},TS={setup(){const e=m("odin"),t=m(""),s=m(""),n=m(""),a=m({}),i=m([]),l=m([]),r=m(!1),o=m(!1),c=m(null),d=m(!0),u=m(""),p=m(!1),h=m(!1),g=W(()=>e.value==="custom"),x=W(()=>[...i.value,...l.value]),I=W(()=>l.value.includes(e.value)),O=W(()=>{var C;return g.value?t.value||"Odin":((C=a.value[e.value])==null?void 0:C.name)||e.value}),y=W(()=>{var C;return g.value?s.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.identity)||""}),v=W(()=>{var C;return g.value?n.value||"(empty — will use Odin default)":((C=a.value[e.value])==null?void 0:C.voice)||""});async function _(){d.value=!0;try{const C=await K.get("/api/personality");e.value=C.preset||"odin",t.value=C.custom_name||"",s.value=C.custom_identity||"",n.value=C.custom_voice||"",a.value=C.presets||{},i.value=C.builtin_presets||[],l.value=C.user_presets||[]}catch(C){c.value=C.message}finally{d.value=!1}}async function S(){r.value=!0,c.value=null,o.value=!1;try{await K.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(C){c.value=C.message}finally{r.value=!1}}async function b(){const C=u.value.trim();if(C){h.value=!0,c.value=null;try{await K.post("/api/personality/presets",{name:C,display_name:O.value,identity:y.value,voice:v.value}),p.value=!1,u.value="",await _(),e.value=C.toLowerCase().replace(/ /g,"_")}catch(R){c.value=R.message}finally{h.value=!1}}}async function T(){if(await hs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await K.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await _(),e.value="odin"}catch(R){c.value=R.message}}}return qe(_),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:x,isCustom:g,isUserPreset:I,previewName:O,previewIdentity:y,previewVoice:v,saving:r,saved:o,error:c,loading:d,save:S,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:b,deletePreset:T,builtinPresets:i,userPresets:l}},template:`
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
  `},yt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Hm=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:lw,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:SS,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:lk,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:pk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:kk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:TS,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Xk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:yt("/operations","live")},{path:"/agents",redirect:yt("/operations","agents")},{path:"/loops",redirect:yt("/operations","loops")},{path:"/processes",redirect:yt("/operations","processes")},{path:"/schedules",redirect:yt("/operations","schedules")},{path:"/audit",redirect:yt("/history","audit")},{path:"/sessions",redirect:yt("/history","sessions")},{path:"/traces",redirect:yt("/history","traces")},{path:"/usage",redirect:yt("/history","usage")},{path:"/tools",redirect:yt("/capabilities","tools")},{path:"/skills",redirect:yt("/capabilities","skills")},{path:"/knowledge",redirect:yt("/capabilities","knowledge")},{path:"/memory",redirect:yt("/capabilities","memory")},{path:"/learned",redirect:yt("/capabilities","learned")},{path:"/health",redirect:yt("/system","health")},{path:"/resources",redirect:yt("/system","resources")},{path:"/logs",redirect:yt("/system","logs")},{path:"/config",redirect:yt("/system","config")},{path:"/host-access",redirect:yt("/system","host-access")},{path:"/internals",redirect:yt("/system","internals")}],Ti=G_({history:S_(),routes:Hm});Ti.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const CS={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=m(""),s=m(null),n=m(!1),a=m(!1);async function i(){n.value=!0,s.value=null;try{K.setPersist(a.value),await K.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},ES={template:`
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
    <command-palette />`,setup(){const e=m("checking"),t=m(!1),s=m(!1),n=m(!1),a=m(null),i=m(null),l=m(!1);let r=null,o=null;const c=m(!1),d=m("disconnected"),u=m(-1),p=m(null);let h=null;const g=m("starting"),x=m(""),I=Hm.filter(L=>L.meta),O=W(()=>["Workspace","Operate","Observe","Manage"].map(L=>({name:L,routes:I.filter(N=>N.meta.section===L)})).filter(L=>L.routes.length)),y=W(()=>{var L;return((L=Ti.currentRoute.value.meta)==null?void 0:L.label)||"Odin"}),v=W(()=>{var L;return((L=Ti.currentRoute.value.meta)==null?void 0:L.section)||"Management"}),_=W(()=>{var L;return((L=Ti.currentRoute.value.meta)==null?void 0:L.description)||"Management console"});K.onSessionExpired=()=>{t.value=!0,ze.disconnect(),K.setToken(""),e.value="login"};function S(L){var N;if((L.ctrlKey||L.metaKey)&&L.key.toLowerCase()==="k"){e.value==="ready"&&(L.preventDefault(),Fu());return}if(n.value&&L.key==="Tab"){const q=[...((N=a.value)==null?void 0:N.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(q.length){const _e=q[0],ve=q[q.length-1];if(L.shiftKey&&(document.activeElement===_e||!a.value.contains(document.activeElement))){L.preventDefault(),ve.focus();return}if(!L.shiftKey&&(document.activeElement===ve||!a.value.contains(document.activeElement))){L.preventDefault(),_e.focus();return}}}if(L.key==="Escape"&&n.value){n.value=!1,L.preventDefault();return}if(L.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(L.target.tagName)){L.preventDefault();const q=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');q&&q.focus()}}function b(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}qe(async()=>{document.addEventListener("keydown",S),r=window.matchMedia("(max-width: 900px)"),b(),r.addEventListener("change",b);const L=await K.check();L.ok?(e.value="ready",te()):L.needsAuth?e.value="login":(e.value="ready",te())});function T(){t.value=!1,e.value="ready",te()}async function C(){await K.logout(),ze.disconnect(),e.value="login"}function R(){s.value=!s.value}function E(){n.value=!n.value}Yt(n,async L=>{var N,q;if(L)o=document.activeElement,await Ct(),(q=(N=a.value)==null?void 0:N.querySelector(".nav-item"))==null||q.focus();else if(o!=null&&o.isConnected){const _e=o;o=null,requestAnimationFrame(()=>_e.focus())}});const U=W(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function P(L,N="info",q=3e3){p.value={text:L,level:N},clearTimeout(h),h=setTimeout(()=>{p.value=null},q)}let M=null,Z=!1;function te(){ze.onStatusChange=L=>{c.value=L},ze.onLatency=L=>{u.value=L},ze.onStateChange=(L,N)=>{d.value=L,L==="connected"?(Z&&P("Connection restored","success"),Z=!0):L==="reconnecting"&&N.attempt===1&&P("Connection lost — reconnecting…","warn")},ze.connect(),B(),M&&clearInterval(M),M=setInterval(B,15e3)}async function B(){try{const L=await K.get("/api/status");g.value=L.status==="online"?"online":"starting";const N=L.uptime_seconds||0,q=Math.floor(N/3600),_e=Math.floor(N%3600/60);x.value=`${q}h ${_e}m uptime`}catch{g.value="offline",x.value=""}}return bt(()=>{M&&clearInterval(M),ze.disconnect(),document.removeEventListener("keydown",S),r==null||r.removeEventListener("change",b)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:U,wsToast:p,botStatus:g,botUptime:x,navRoutes:I,navGroups:O,currentPage:y,currentSection:v,currentDescription:_,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:T,logout:C,toggleSidebar:R,toggleMobileNavigation:E,openPalette:Fu}}},Un=Kl(ES);Un.component("odin-icon",nw);Un.component("login-screen",CS);Un.component("toast-container",$0);Un.component("confirm-host",U0);Un.component("command-palette",sw);Un.directive("modal-focus",iw);Un.use(Ti);Un.mount("#app");
