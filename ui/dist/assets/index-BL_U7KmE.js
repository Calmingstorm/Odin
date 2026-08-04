var Bm=Object.defineProperty;var Hm=(e,t,s)=>t in e?Bm(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s;var at=(e,t,s)=>Hm(e,typeof t!="symbol"?t+"":t,s);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))n(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&n(l)}).observe(document,{childList:!0,subtree:!0});function s(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(a){if(a.ep)return;a.ep=!0;const i=s(a);fetch(a.href,i)}})();class Vm{constructor(){this._persist=localStorage.getItem("odin_persist")==="1",this._token=this._persist?localStorage.getItem("odin_token")||"":sessionStorage.getItem("odin_token")||"";const t=this._persist?localStorage:sessionStorage;this._sessionTimeout=parseInt(t.getItem("odin_session_timeout")||"0",10),this._lastActivity=Date.now(),this._activityTimer=null,this.onSessionExpired=null,this._token&&this._sessionTimeout>0&&this._startActivityMonitor()}get token(){return this._token}get sessionTimeout(){return this._sessionTimeout}setToken(t,s=0){if(this._token=t,this._sessionTimeout=s,this._lastActivity=Date.now(),t){const n=this._persist?localStorage:sessionStorage;n.setItem("odin_token",t),this._persist&&localStorage.setItem("odin_persist","1"),s>0?n.setItem("odin_session_timeout",String(s)):n.removeItem("odin_session_timeout"),this._startActivityMonitor()}else sessionStorage.removeItem("odin_token"),sessionStorage.removeItem("odin_session_timeout"),localStorage.removeItem("odin_token"),localStorage.removeItem("odin_persist"),localStorage.removeItem("odin_session_timeout"),this._stopActivityMonitor()}setPersist(t){this._persist=t}_startActivityMonitor(){this._stopActivityMonitor(),!(this._sessionTimeout<=0)&&(this._activityTimer=setInterval(()=>{(Date.now()-this._lastActivity)/1e3>=this._sessionTimeout&&(this._stopActivityMonitor(),this.onSessionExpired&&this.onSessionExpired())},1e4))}_stopActivityMonitor(){this._activityTimer&&(clearInterval(this._activityTimer),this._activityTimer=null)}_headers(t={}){const s={"Content-Type":"application/json",...t};return this._token&&(s.Authorization=`Bearer ${this._token}`),s}async _request(t,s,n=null,{signal:a}={}){this._lastActivity=Date.now();const i={method:t,headers:this._headers(),signal:a};n!==null&&(i.body=JSON.stringify(n));const l=await fetch(s,i);if(l.status===401)throw new il("Unauthorized");const r=await l.json().catch(()=>null);if(!l.ok){const o=(r==null?void 0:r.error)||`HTTP ${l.status}`;throw new ld(o,l.status,r)}return r}get(t,s={}){return this._request("GET",t,null,s)}async getBlob(t){this._lastActivity=Date.now();const s=await fetch(t,{method:"GET",headers:this._headers()});if(s.status===401)throw new il("Unauthorized");if(!s.ok){const n=await s.json().catch(()=>null);throw new ld((n==null?void 0:n.error)||`HTTP ${s.status}`,s.status,n)}return s.blob()}post(t,s){return this._request("POST",t,s)}put(t,s){return this._request("PUT",t,s)}del(t){return this._request("DELETE",t)}async login(t){const s=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})}),n=await s.json().catch(()=>null);if(!s.ok)throw new il((n==null?void 0:n.error)||"Login failed");return this.setToken(n.session_id,n.timeout_seconds||0),n}async logout(){try{await this.post("/api/auth/logout",{})}catch{}this.setToken("")}async check(){try{return await this.get("/api/status"),{ok:!0,needsAuth:!1}}catch(t){return t instanceof il?{ok:!1,needsAuth:!0}:{ok:!1,needsAuth:!1,error:t.message}}}}class il extends Error{constructor(t){super(t),this.name="AuthError"}}class ld extends Error{constructor(t,s,n){super(t),this.name="ApiError",this.status=s,this.data=n}}class jm{constructor(t){this._api=t,this._ws=null,this._handlers={logs:[],events:[],chat:[]},this._reconnectDelay=1e3,this._maxReconnectDelay=3e4,this._shouldConnect=!1,this._subscriptions=new Set,this._reconnectAttempt=0,this._lastPongTime=0,this._pingInterval=null,this._latency=-1,this._chatPending=!1,this._state="disconnected",this.onStatusChange=null,this.onStateChange=null,this.onLatency=null}get connected(){var t;return((t=this._ws)==null?void 0:t.readyState)===WebSocket.OPEN}get state(){return this._state}get reconnectAttempt(){return this._reconnectAttempt}get latency(){return this._latency}_resetLatency(){if(this._latency=-1,this.onLatency)try{this.onLatency(-1)}catch{}}connect(){this._shouldConnect=!0,this._setState("connecting"),this._open()}disconnect(){this._shouldConnect=!1,this._reconnectAttempt=0,this._resetLatency(),this._stopPing(),this._ws&&(this._ws.close(),this._ws=null),this._setState("disconnected")}_setState(t){this._state!==t&&(this._state=t,this.onStateChange&&this.onStateChange(t,{attempt:this._reconnectAttempt,latency:this._latency}))}_startPing(){this._stopPing(),this._pingInterval=setInterval(()=>{if(this.connected)try{this._ws.send(JSON.stringify({type:"ping",ts:Date.now()}))}catch{}},15e3)}_stopPing(){this._pingInterval&&(clearInterval(this._pingInterval),this._pingInterval=null)}subscribe(t,s){this._handlers[t]||(this._handlers[t]=[]),this._handlers[t].push(s),t!=="chat"&&(this._subscriptions.add(t),this.connected&&this._ws.send(JSON.stringify({subscribe:t})))}unsubscribe(t,s){const n=this._handlers[t];if(n){const a=n.indexOf(s);a>=0&&n.splice(a,1),n.length===0&&t!=="chat"&&(this._subscriptions.delete(t),this.connected&&this._ws.send(JSON.stringify({unsubscribe:t})))}}on(t,s){return this.subscribe(t,s)}off(t,s){return this.unsubscribe(t,s)}sendChat(t,{channelId:s,userId:n,username:a}={}){return this.connected?(this._ws.send(JSON.stringify({type:"chat",content:t,channel_id:s||"web-default",user_id:n||void 0,username:a||void 0})),this._chatPending=!0,!0):!1}_open(){if(this._ws)return;let s=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/api/ws`;this._api.token&&(s+=`?token=${encodeURIComponent(this._api.token)}`);const n=new WebSocket(s);this._ws=n;const a=()=>this._ws===n;n.onopen=()=>{if(a()){this._reconnectDelay=1e3,this._reconnectAttempt=0;for(const i of this._subscriptions)n.send(JSON.stringify({subscribe:i}));this._startPing(),this._setState("connected"),this.onStatusChange&&this.onStatusChange(!0)}},n.onmessage=i=>{if(!a())return;let l;try{l=JSON.parse(i.data)}catch{return}const r=l.type;if(r==="pong"){if(l.ts&&(this._latency=Date.now()-l.ts,this._lastPongTime=Date.now(),this.onLatency))try{this.onLatency(this._latency)}catch{}return}if(r==="log")for(const o of this._handlers.logs||[])o(l);else if(r==="event")for(const o of this._handlers.events||[])o(l);else if(r==="chat_response"||r==="chat_error"){this._chatPending=!1;for(const o of this._handlers.chat||[])o(l)}},n.onclose=()=>{if(a()){if(this._ws=null,this._stopPing(),this._resetLatency(),this._chatPending){this._chatPending=!1;const i={type:"chat_error",error:"Connection lost — the response may still complete; check session history."};for(const l of this._handlers.chat||[])l(i)}this.onStatusChange&&this.onStatusChange(!1),this._shouldConnect?(this._reconnectAttempt++,this._setState("reconnecting"),setTimeout(()=>this._open(),this._reconnectDelay),this._reconnectDelay=Math.min(this._reconnectDelay*2,this._maxReconnectDelay)):this._setState("disconnected")}},n.onerror=()=>{}}}const W=new Vm,ze=new jm(W);/**
* @vue/shared v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/function ms(e){const t=Object.create(null);for(const s of e.split(","))t[s]=1;return s=>s in t}const Be={},Ea=[],Pt=()=>{},Ta=()=>!1,ra=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&(e.charCodeAt(2)>122||e.charCodeAt(2)<97),lr=e=>e.startsWith("onUpdate:"),Ue=Object.assign,Wo=(e,t)=>{const s=e.indexOf(t);s>-1&&e.splice(s,1)},zm=Object.prototype.hasOwnProperty,Ye=(e,t)=>zm.call(e,t),ve=Array.isArray,Aa=e=>Za(e)==="[object Map]",oa=e=>Za(e)==="[object Set]",rd=e=>Za(e)==="[object Date]",qm=e=>Za(e)==="[object RegExp]",Ae=e=>typeof e=="function",Le=e=>typeof e=="string",qt=e=>typeof e=="symbol",Je=e=>e!==null&&typeof e=="object",Zo=e=>(Je(e)||Ae(e))&&Ae(e.then)&&Ae(e.catch),rf=Object.prototype.toString,Za=e=>rf.call(e),Gm=e=>Za(e).slice(8,-1),rr=e=>Za(e)==="[object Object]",or=e=>Le(e)&&e!=="NaN"&&e[0]!=="-"&&""+parseInt(e,10)===e,dn=ms(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"),Km=ms("bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"),cr=e=>{const t=Object.create(null);return(s=>t[s]||(t[s]=e(s)))},Wm=/-\w/g,nt=cr(e=>e.replace(Wm,t=>t.slice(1).toUpperCase())),Zm=/\B([A-Z])/g,is=cr(e=>e.replace(Zm,"-$1").toLowerCase()),ca=cr(e=>e.charAt(0).toUpperCase()+e.slice(1)),Ra=cr(e=>e?`on${ca(e)}`:""),It=(e,t)=>!Object.is(e,t),Ia=(e,...t)=>{for(let s=0;s<e.length;s++)e[s](...t)},of=(e,t,s,n=!1)=>{Object.defineProperty(e,t,{configurable:!0,enumerable:!1,writable:n,value:s})},dr=e=>{const t=parseFloat(e);return isNaN(t)?e:t},Il=e=>{const t=Le(e)?Number(e):NaN;return isNaN(t)?e:t};let od;const ur=()=>od||(od=typeof globalThis<"u"?globalThis:typeof self<"u"?self:typeof window<"u"?window:typeof global<"u"?global:{});function Jm(e,t){return e+JSON.stringify(t,(s,n)=>typeof n=="function"?n.toString():n)}const Ym="Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol",Qm=ms(Ym);function zi(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++){const n=e[s],a=Le(n)?cf(n):zi(n);if(a)for(const i in a)t[i]=a[i]}return t}else if(Le(e)||Je(e))return e}const Xm=/;(?![^(]*\))/g,eg=/:([^]+)/,tg=/\/\*[^]*?\*\//g;function cf(e){const t={};return e.replace(tg,"").split(Xm).forEach(s=>{if(s){const n=s.split(eg);n.length>1&&(t[n[0].trim()]=n[1].trim())}}),t}function qi(e){let t="";if(Le(e))t=e;else if(ve(e))for(let s=0;s<e.length;s++){const n=qi(e[s]);n&&(t+=n+" ")}else if(Je(e))for(const s in e)e[s]&&(t+=s+" ");return t.trim()}function sg(e){if(!e)return null;let{class:t,style:s}=e;return t&&!Le(t)&&(e.class=qi(t)),s&&(e.style=zi(s)),e}const ng="html,body,base,head,link,meta,style,title,address,article,aside,footer,header,hgroup,h1,h2,h3,h4,h5,h6,nav,section,div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,ruby,s,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,output,progress,select,textarea,details,dialog,menu,summary,template,blockquote,iframe,tfoot",ag="svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,feDistantLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,text,textPath,title,tspan,unknown,use,view",ig="annotation,annotation-xml,maction,maligngroup,malignmark,math,menclose,merror,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,mmultiscripts,mn,mo,mover,mpadded,mphantom,mprescripts,mroot,mrow,ms,mscarries,mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,mtext,mtr,munder,munderover,none,semantics",lg="area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr",rg=ms(ng),og=ms(ag),cg=ms(ig),dg=ms(lg),ug="itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly",fg=ms(ug);function df(e){return!!e||e===""}function pg(e,t){if(e.length!==t.length)return!1;let s=!0;for(let n=0;s&&n<e.length;n++)s=hn(e[n],t[n]);return s}function hn(e,t){if(e===t)return!0;let s=rd(e),n=rd(t);if(s||n)return s&&n?e.getTime()===t.getTime():!1;if(s=qt(e),n=qt(t),s||n)return e===t;if(s=ve(e),n=ve(t),s||n)return s&&n?pg(e,t):!1;if(s=Je(e),n=Je(t),s||n){if(!s||!n)return!1;const a=Object.keys(e).length,i=Object.keys(t).length;if(a!==i)return!1;for(const l in e){const r=e.hasOwnProperty(l),o=t.hasOwnProperty(l);if(r&&!o||!r&&o||!hn(e[l],t[l]))return!1}}return String(e)===String(t)}function fr(e,t){return e.findIndex(s=>hn(s,t))}const uf=e=>!!(e&&e.__v_isRef===!0),ff=e=>Le(e)?e:e==null?"":ve(e)||Je(e)&&(e.toString===rf||!Ae(e.toString))?uf(e)?ff(e.value):JSON.stringify(e,pf,2):String(e),pf=(e,t)=>uf(t)?pf(e,t.value):Aa(t)?{[`Map(${t.size})`]:[...t.entries()].reduce((s,[n,a],i)=>(s[$r(n,i)+" =>"]=a,s),{})}:oa(t)?{[`Set(${t.size})`]:[...t.values()].map(s=>$r(s))}:qt(t)?$r(t):Je(t)&&!ve(t)&&!rr(t)?String(t):t,$r=(e,t="")=>{var s;return qt(e)?`Symbol(${(s=e.description)!=null?s:t})`:e};function hg(e){return e==null?"initial":typeof e=="string"?e===""?" ":e:String(e)}/**
* @vue/reactivity v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Tt;class Jo{constructor(t=!1){this.detached=t,this._active=!0,this._on=0,this.effects=[],this.cleanups=[],this._isPaused=!1,this._warnOnRun=!0,this.__v_skip=!0,!t&&Tt&&(Tt.active?(this.parent=Tt,this.index=(Tt.scopes||(Tt.scopes=[])).push(this)-1):(this._active=!1,this._warnOnRun=!1))}get active(){return this._active}pause(){if(this._active){this._isPaused=!0;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].pause();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].pause()}}resume(){if(this._active&&this._isPaused){this._isPaused=!1;let t,s;if(this.scopes)for(t=0,s=this.scopes.length;t<s;t++)this.scopes[t].resume();for(t=0,s=this.effects.length;t<s;t++)this.effects[t].resume()}}run(t){if(this._active){const s=Tt;try{return Tt=this,t()}finally{Tt=s}}}on(){++this._on===1&&(this.prevScope=Tt,Tt=this)}off(){if(this._on>0&&--this._on===0){if(Tt===this)Tt=this.prevScope;else{let t=Tt;for(;t;){if(t.prevScope===this){t.prevScope=this.prevScope;break}t=t.prevScope}}this.prevScope=void 0}}stop(t){if(this._active){this._active=!1;let s,n;for(s=0,n=this.effects.length;s<n;s++)this.effects[s].stop();for(this.effects.length=0,s=0,n=this.cleanups.length;s<n;s++)this.cleanups[s]();if(this.cleanups.length=0,this.scopes){for(s=0,n=this.scopes.length;s<n;s++)this.scopes[s].stop(!0);this.scopes.length=0}if(!this.detached&&this.parent&&!t){const a=this.parent.scopes.pop();a&&a!==this&&(this.parent.scopes[this.index]=a,a.index=this.index)}this.parent=void 0}}}function mg(e){return new Jo(e)}function hf(){return Tt}function gg(e,t=!1){Tt&&Tt.cleanups.push(e)}let lt;const Ur=new WeakSet;class Ci{constructor(t){this.fn=t,this.deps=void 0,this.depsTail=void 0,this.flags=5,this.next=void 0,this.cleanup=void 0,this.scheduler=void 0,Tt&&(Tt.active?Tt.effects.push(this):this.flags&=-2)}pause(){this.flags|=64}resume(){this.flags&64&&(this.flags&=-65,Ur.has(this)&&(Ur.delete(this),this.trigger()))}notify(){this.flags&2&&!(this.flags&32)||this.flags&8||gf(this)}run(){if(!(this.flags&1))return this.fn();this.flags|=2,cd(this),vf(this);const t=lt,s=Ds;lt=this,Ds=!0;try{return this.fn()}finally{bf(this),lt=t,Ds=s,this.flags&=-3}}stop(){if(this.flags&1){for(let t=this.deps;t;t=t.nextDep)Xo(t);this.deps=this.depsTail=void 0,cd(this),this.onStop&&this.onStop(),this.flags&=-2}}trigger(){this.flags&64?Ur.add(this):this.scheduler?this.scheduler():this.runIfDirty()}runIfDirty(){po(this)&&this.run()}get dirty(){return po(this)}}let mf=0,mi,gi;function gf(e,t=!1){if(e.flags|=8,t){e.next=gi,gi=e;return}e.next=mi,mi=e}function Yo(){mf++}function Qo(){if(--mf>0)return;if(gi){let t=gi;for(gi=void 0;t;){const s=t.next;t.next=void 0,t.flags&=-9,t=s}}let e;for(;mi;){let t=mi;for(mi=void 0;t;){const s=t.next;if(t.next=void 0,t.flags&=-9,t.flags&1)try{t.trigger()}catch(n){e||(e=n)}t=s}}if(e)throw e}function vf(e){for(let t=e.deps;t;t=t.nextDep)t.version=-1,t.prevActiveLink=t.dep.activeLink,t.dep.activeLink=t}function bf(e){let t,s=e.depsTail,n=s;for(;n;){const a=n.prevDep;n.version===-1?(n===s&&(s=a),Xo(n),vg(n)):t=n,n.dep.activeLink=n.prevActiveLink,n.prevActiveLink=void 0,n=a}e.deps=t,e.depsTail=s}function po(e){for(let t=e.deps;t;t=t.nextDep)if(t.dep.version!==t.version||t.dep.computed&&(yf(t.dep.computed)||t.dep.version!==t.version))return!0;return!!e._dirty}function yf(e){if(e.flags&4&&!(e.flags&16)||(e.flags&=-17,e.globalVersion===Ei)||(e.globalVersion=Ei,!e.isSSR&&e.flags&128&&(!e.deps&&!e._dirty||!po(e))))return;e.flags|=2;const t=e.dep,s=lt,n=Ds;lt=e,Ds=!0;try{vf(e);const a=e.fn(e._value);(t.version===0||It(a,e._value))&&(e.flags|=128,e._value=a,t.version++)}catch(a){throw t.version++,a}finally{lt=s,Ds=n,bf(e),e.flags&=-3}}function Xo(e,t=!1){const{dep:s,prevSub:n,nextSub:a}=e;if(n&&(n.nextSub=a,e.prevSub=void 0),a&&(a.prevSub=n,e.nextSub=void 0),s.subs===e&&(s.subs=n,!n&&s.computed)){s.computed.flags&=-5;for(let i=s.computed.deps;i;i=i.nextDep)Xo(i,!0)}!t&&!--s.sc&&s.map&&s.map.delete(s.key)}function vg(e){const{prevDep:t,nextDep:s}=e;t&&(t.nextDep=s,e.prevDep=void 0),s&&(s.prevDep=t,e.nextDep=void 0)}function bg(e,t){e.effect instanceof Ci&&(e=e.effect.fn);const s=new Ci(e);t&&Ue(s,t);try{s.run()}catch(a){throw s.stop(),a}const n=s.run.bind(s);return n.effect=s,n}function yg(e){e.effect.stop()}let Ds=!0;const xf=[];function mn(){xf.push(Ds),Ds=!1}function gn(){const e=xf.pop();Ds=e===void 0?!0:e}function cd(e){const{cleanup:t}=e;if(e.cleanup=void 0,t){const s=lt;lt=void 0;try{t()}finally{lt=s}}}let Ei=0;class xg{constructor(t,s){this.sub=t,this.dep=s,this.version=s.version,this.nextDep=this.prevDep=this.nextSub=this.prevSub=this.prevActiveLink=void 0}}class pr{constructor(t){this.computed=t,this.version=0,this.activeLink=void 0,this.subs=void 0,this.map=void 0,this.key=void 0,this.sc=0,this.__v_skip=!0}track(t){if(!lt||!Ds||lt===this.computed)return;let s=this.activeLink;if(s===void 0||s.sub!==lt)s=this.activeLink=new xg(lt,this),lt.deps?(s.prevDep=lt.depsTail,lt.depsTail.nextDep=s,lt.depsTail=s):lt.deps=lt.depsTail=s,_f(s);else if(s.version===-1&&(s.version=this.version,s.nextDep)){const n=s.nextDep;n.prevDep=s.prevDep,s.prevDep&&(s.prevDep.nextDep=n),s.prevDep=lt.depsTail,s.nextDep=void 0,lt.depsTail.nextDep=s,lt.depsTail=s,lt.deps===s&&(lt.deps=n)}return s}trigger(t){this.version++,Ei++,this.notify(t)}notify(t){Yo();try{for(let s=this.subs;s;s=s.prevSub)s.sub.notify()&&s.sub.dep.notify()}finally{Qo()}}}function _f(e){if(e.dep.sc++,e.sub.flags&4){const t=e.dep.computed;if(t&&!e.dep.subs){t.flags|=20;for(let n=t.deps;n;n=n.nextDep)_f(n)}const s=e.dep.subs;s!==e&&(e.prevSub=s,s&&(s.nextSub=e)),e.dep.subs=e}}const Ol=new WeakMap,Qn=Symbol(""),ho=Symbol(""),Ai=Symbol("");function Vt(e,t,s){if(Ds&&lt){let n=Ol.get(e);n||Ol.set(e,n=new Map);let a=n.get(s);a||(n.set(s,a=new pr),a.map=n,a.key=s),a.track()}}function an(e,t,s,n,a,i){const l=Ol.get(e);if(!l){Ei++;return}const r=o=>{o&&o.trigger()};if(Yo(),t==="clear")l.forEach(r);else{const o=ve(e),c=o&&or(s);if(o&&s==="length"){const d=Number(n);l.forEach((u,p)=>{(p==="length"||p===Ai||!qt(p)&&p>=d)&&r(u)})}else switch((s!==void 0||l.has(void 0))&&r(l.get(s)),c&&r(l.get(Ai)),t){case"add":o?c&&r(l.get("length")):(r(l.get(Qn)),Aa(e)&&r(l.get(ho)));break;case"delete":o||(r(l.get(Qn)),Aa(e)&&r(l.get(ho)));break;case"set":Aa(e)&&r(l.get(Qn));break}}Qo()}function _g(e,t){const s=Ol.get(e);return s&&s.get(t)}function ma(e){const t=Ge(e);return t===e?t:(Vt(t,"iterate",Ai),rs(e)?t:t.map(Ps))}function hr(e){return Vt(e=Ge(e),"iterate",Ai),e}function qs(e,t){return Ks(e)?Fa(un(e)?Ps(t):t):Ps(t)}const kg={__proto__:null,[Symbol.iterator](){return Br(this,Symbol.iterator,e=>qs(this,e))},concat(...e){return ma(this).concat(...e.map(t=>ve(t)?ma(t):t))},entries(){return Br(this,"entries",e=>(e[1]=qs(this,e[1]),e))},every(e,t){return Js(this,"every",e,t,void 0,arguments)},filter(e,t){return Js(this,"filter",e,t,s=>s.map(n=>qs(this,n)),arguments)},find(e,t){return Js(this,"find",e,t,s=>qs(this,s),arguments)},findIndex(e,t){return Js(this,"findIndex",e,t,void 0,arguments)},findLast(e,t){return Js(this,"findLast",e,t,s=>qs(this,s),arguments)},findLastIndex(e,t){return Js(this,"findLastIndex",e,t,void 0,arguments)},forEach(e,t){return Js(this,"forEach",e,t,void 0,arguments)},includes(...e){return Hr(this,"includes",e)},indexOf(...e){return Hr(this,"indexOf",e)},join(e){return ma(this).join(e)},lastIndexOf(...e){return Hr(this,"lastIndexOf",e)},map(e,t){return Js(this,"map",e,t,void 0,arguments)},pop(){return ti(this,"pop")},push(...e){return ti(this,"push",e)},reduce(e,...t){return dd(this,"reduce",e,t)},reduceRight(e,...t){return dd(this,"reduceRight",e,t)},shift(){return ti(this,"shift")},some(e,t){return Js(this,"some",e,t,void 0,arguments)},splice(...e){return ti(this,"splice",e)},toReversed(){return ma(this).toReversed()},toSorted(e){return ma(this).toSorted(e)},toSpliced(...e){return ma(this).toSpliced(...e)},unshift(...e){return ti(this,"unshift",e)},values(){return Br(this,"values",e=>qs(this,e))}};function Br(e,t,s){const n=hr(e),a=n[t]();return n!==e&&!rs(e)&&(a._next=a.next,a.next=()=>{const i=a._next();return i.done||(i.value=s(i.value)),i}),a}const wg=Array.prototype;function Js(e,t,s,n,a,i){const l=hr(e),r=l!==e&&!rs(e),o=l[t];if(o!==wg[t]){const u=o.apply(e,i);return r?Ps(u):u}let c=s;l!==e&&(r?c=function(u,p){return s.call(this,qs(e,u),p,e)}:s.length>2&&(c=function(u,p){return s.call(this,u,p,e)}));const d=o.call(l,c,n);return r&&a?a(d):d}function dd(e,t,s,n){const a=hr(e),i=a!==e&&!rs(e);let l=s,r=!1;a!==e&&(i?(r=n.length===0,l=function(c,d,u){return r&&(r=!1,c=qs(e,c)),s.call(this,c,qs(e,d),u,e)}):s.length>3&&(l=function(c,d,u){return s.call(this,c,d,u,e)}));const o=a[t](l,...n);return r?qs(e,o):o}function Hr(e,t,s){const n=Ge(e);Vt(n,"iterate",Ai);const a=n[t](...s);return(a===-1||a===!1)&&Gi(s[0])?(s[0]=Ge(s[0]),n[t](...s)):a}function ti(e,t,s=[]){mn(),Yo();const n=Ge(e)[t].apply(e,s);return Qo(),gn(),n}const Sg=ms("__proto__,__v_isRef,__isVue"),kf=new Set(Object.getOwnPropertyNames(Symbol).filter(e=>e!=="arguments"&&e!=="caller").map(e=>Symbol[e]).filter(qt));function Tg(e){qt(e)||(e=String(e));const t=Ge(this);return Vt(t,"has",e),t.hasOwnProperty(e)}class wf{constructor(t=!1,s=!1){this._isReadonly=t,this._isShallow=s}get(t,s,n){if(s==="__v_skip")return t.__v_skip;const a=this._isReadonly,i=this._isShallow;if(s==="__v_isReactive")return!a;if(s==="__v_isReadonly")return a;if(s==="__v_isShallow")return i;if(s==="__v_raw")return n===(a?i?Rf:Af:i?Ef:Cf).get(t)||Object.getPrototypeOf(t)===Object.getPrototypeOf(n)?t:void 0;const l=ve(t);if(!a){let o;if(l&&(o=kg[s]))return o;if(s==="hasOwnProperty")return Tg}const r=Reflect.get(t,s,kt(t)?t:n);if((qt(s)?kf.has(s):Sg(s))||(a||Vt(t,"get",s),i))return r;if(kt(r)){const o=l&&or(s)?r:r.value;return a&&Je(o)?Nl(o):o}return Je(r)?a?Nl(r):$n(r):r}}class Sf extends wf{constructor(t=!1){super(!1,t)}set(t,s,n,a){let i=t[s];const l=ve(t)&&or(s);if(!this._isShallow){const c=Ks(i);if(!rs(n)&&!Ks(n)&&(i=Ge(i),n=Ge(n)),!l&&kt(i)&&!kt(n))return c||(i.value=n),!0}const r=l?Number(s)<t.length:Ye(t,s),o=Reflect.set(t,s,n,kt(t)?t:a);return t===Ge(a)&&(r?It(n,i)&&an(t,"set",s,n):an(t,"add",s,n)),o}deleteProperty(t,s){const n=Ye(t,s);t[s];const a=Reflect.deleteProperty(t,s);return a&&n&&an(t,"delete",s,void 0),a}has(t,s){const n=Reflect.has(t,s);return(!qt(s)||!kf.has(s))&&Vt(t,"has",s),n}ownKeys(t){return Vt(t,"iterate",ve(t)?"length":Qn),Reflect.ownKeys(t)}}class Tf extends wf{constructor(t=!1){super(!0,t)}set(t,s){return!0}deleteProperty(t,s){return!0}}const Cg=new Sf,Eg=new Tf,Ag=new Sf(!0),Rg=new Tf(!0),mo=e=>e,ll=e=>Reflect.getPrototypeOf(e);function Ig(e,t,s){return function(...n){const a=this.__v_raw,i=Ge(a),l=Aa(i),r=e==="entries"||e===Symbol.iterator&&l,o=e==="keys"&&l,c=a[e](...n),d=s?mo:t?Fa:Ps;return!t&&Vt(i,"iterate",o?ho:Qn),Ue(Object.create(c),{next(){const{value:u,done:p}=c.next();return p?{value:u,done:p}:{value:r?[d(u[0]),d(u[1])]:d(u),done:p}}})}}function rl(e){return function(...t){return e==="delete"?!1:e==="clear"?void 0:this}}function Og(e,t){const s={get(a){const i=this.__v_raw,l=Ge(i),r=Ge(a);e||(It(a,r)&&Vt(l,"get",a),Vt(l,"get",r));const{has:o}=ll(l),c=t?mo:e?Fa:Ps;if(o.call(l,a))return c(i.get(a));if(o.call(l,r))return c(i.get(r));i!==l&&i.get(a)},get size(){const a=this.__v_raw;return!e&&Vt(Ge(a),"iterate",Qn),a.size},has(a){const i=this.__v_raw,l=Ge(i),r=Ge(a);return e||(It(a,r)&&Vt(l,"has",a),Vt(l,"has",r)),a===r?i.has(a):i.has(a)||i.has(r)},forEach(a,i){const l=this,r=l.__v_raw,o=Ge(r),c=t?mo:e?Fa:Ps;return!e&&Vt(o,"iterate",Qn),r.forEach((d,u)=>a.call(i,c(d),c(u),l))}};return Ue(s,e?{add:rl("add"),set:rl("set"),delete:rl("delete"),clear:rl("clear")}:{add(a){const i=Ge(this),l=ll(i),r=Ge(a),o=!t&&!rs(a)&&!Ks(a)?r:a;return l.has.call(i,o)||It(a,o)&&l.has.call(i,a)||It(r,o)&&l.has.call(i,r)||(i.add(o),an(i,"add",o,o)),this},set(a,i){!t&&!rs(i)&&!Ks(i)&&(i=Ge(i));const l=Ge(this),{has:r,get:o}=ll(l);let c=r.call(l,a);c||(a=Ge(a),c=r.call(l,a));const d=o.call(l,a);return l.set(a,i),c?It(i,d)&&an(l,"set",a,i):an(l,"add",a,i),this},delete(a){const i=Ge(this),{has:l,get:r}=ll(i);let o=l.call(i,a);o||(a=Ge(a),o=l.call(i,a)),r&&r.call(i,a);const c=i.delete(a);return o&&an(i,"delete",a,void 0),c},clear(){const a=Ge(this),i=a.size!==0,l=a.clear();return i&&an(a,"clear",void 0,void 0),l}}),["keys","values","entries",Symbol.iterator].forEach(a=>{s[a]=Ig(a,e,t)}),s}function mr(e,t){const s=Og(e,t);return(n,a,i)=>a==="__v_isReactive"?!e:a==="__v_isReadonly"?e:a==="__v_raw"?n:Reflect.get(Ye(s,a)&&a in n?s:n,a,i)}const Ng={get:mr(!1,!1)},Lg={get:mr(!1,!0)},Dg={get:mr(!0,!1)},Mg={get:mr(!0,!0)},Cf=new WeakMap,Ef=new WeakMap,Af=new WeakMap,Rf=new WeakMap;function Pg(e){switch(e){case"Object":case"Array":return 1;case"Map":case"Set":case"WeakMap":case"WeakSet":return 2;default:return 0}}function $n(e){return Ks(e)?e:gr(e,!1,Cg,Ng,Cf)}function ec(e){return gr(e,!1,Ag,Lg,Ef)}function Nl(e){return gr(e,!0,Eg,Dg,Af)}function Fg(e){return gr(e,!0,Rg,Mg,Rf)}function gr(e,t,s,n,a){if(!Je(e)||e.__v_raw&&!(t&&e.__v_isReactive)||e.__v_skip||!Object.isExtensible(e))return e;const i=a.get(e);if(i)return i;const l=Pg(Gm(e));if(l===0)return e;const r=new Proxy(e,l===2?n:s);return a.set(e,r),r}function un(e){return Ks(e)?un(e.__v_raw):!!(e&&e.__v_isReactive)}function Ks(e){return!!(e&&e.__v_isReadonly)}function rs(e){return!!(e&&e.__v_isShallow)}function Gi(e){return e?!!e.__v_raw:!1}function Ge(e){const t=e&&e.__v_raw;return t?Ge(t):e}function If(e){return!Ye(e,"__v_skip")&&Object.isExtensible(e)&&of(e,"__v_skip",!0),e}const Ps=e=>Je(e)?$n(e):e,Fa=e=>Je(e)?Nl(e):e;function kt(e){return e?e.__v_isRef===!0:!1}function m(e){return Of(e,!1)}function tc(e){return Of(e,!0)}function Of(e,t){return kt(e)?e:new $g(e,t)}class $g{constructor(t,s){this.dep=new pr,this.__v_isRef=!0,this.__v_isShallow=!1,this._rawValue=s?t:Ge(t),this._value=s?t:Ps(t),this.__v_isShallow=s}get value(){return this.dep.track(),this._value}set value(t){const s=this._rawValue,n=this.__v_isShallow||rs(t)||Ks(t);t=n?t:Ge(t),It(t,s)&&(this._rawValue=t,this._value=n?t:Ps(t),this.dep.trigger())}}function Ug(e){e.dep&&e.dep.trigger()}function Gs(e){return kt(e)?e.value:e}function Bg(e){return Ae(e)?e():Gs(e)}const Hg={get:(e,t,s)=>t==="__v_raw"?e:Gs(Reflect.get(e,t,s)),set:(e,t,s,n)=>{const a=e[t];return kt(a)&&!kt(s)?(a.value=s,!0):Reflect.set(e,t,s,n)}};function sc(e){return un(e)?e:new Proxy(e,Hg)}class Vg{constructor(t){this.__v_isRef=!0,this._value=void 0;const s=this.dep=new pr,{get:n,set:a}=t(s.track.bind(s),s.trigger.bind(s));this._get=n,this._set=a}get value(){return this._value=this._get()}set value(t){this._set(t)}}function Nf(e){return new Vg(e)}function jg(e){const t=ve(e)?new Array(e.length):{};for(const s in e)t[s]=Lf(e,s);return t}class zg{constructor(t,s,n){this._object=t,this._defaultValue=n,this.__v_isRef=!0,this._value=void 0,this._key=qt(s)?s:String(s),this._raw=Ge(t);let a=!0,i=t;if(!ve(t)||qt(this._key)||!or(this._key))do a=!Gi(i)||rs(i);while(a&&(i=i.__v_raw));this._shallow=a}get value(){let t=this._object[this._key];return this._shallow&&(t=Gs(t)),this._value=t===void 0?this._defaultValue:t}set value(t){if(this._shallow&&kt(this._raw[this._key])){const s=this._object[this._key];if(kt(s)){s.value=t;return}}this._object[this._key]=t}get dep(){return _g(this._raw,this._key)}}class qg{constructor(t){this._getter=t,this.__v_isRef=!0,this.__v_isReadonly=!0,this._value=void 0}get value(){return this._value=this._getter()}}function Gg(e,t,s){return kt(e)?e:Ae(e)?new qg(e):Je(e)&&arguments.length>1?Lf(e,t,s):m(e)}function Lf(e,t,s){return new zg(e,t,s)}class Kg{constructor(t,s,n){this.fn=t,this.setter=s,this._value=void 0,this.dep=new pr(this),this.__v_isRef=!0,this.deps=void 0,this.depsTail=void 0,this.flags=16,this.globalVersion=Ei-1,this.next=void 0,this.effect=this,this.__v_isReadonly=!s,this.isSSR=n}notify(){if(this.flags|=16,!(this.flags&8)&&lt!==this)return gf(this,!0),!0}get value(){const t=this.dep.track();return yf(this),t&&(t.version=this.dep.version),this._value}set value(t){this.setter&&this.setter(t)}}function Wg(e,t,s=!1){let n,a;return Ae(e)?n=e:(n=e.get,a=e.set),new Kg(n,a,s)}const Zg={GET:"get",HAS:"has",ITERATE:"iterate"},Jg={SET:"set",ADD:"add",DELETE:"delete",CLEAR:"clear"},ol={},Ll=new WeakMap;let On;function Yg(){return On}function Df(e,t=!1,s=On){if(s){let n=Ll.get(s);n||Ll.set(s,n=[]),n.push(e)}}function Qg(e,t,s=Be){const{immediate:n,deep:a,once:i,scheduler:l,augmentJob:r,call:o}=s,c=x=>a?x:rs(x)||a===!1||a===0?ln(x,1):ln(x);let d,u,p,h,v=!1,y=!1;if(kt(e)?(u=()=>e.value,v=rs(e)):un(e)?(u=()=>c(e),v=!0):ve(e)?(y=!0,v=e.some(x=>un(x)||rs(x)),u=()=>e.map(x=>{if(kt(x))return x.value;if(un(x))return c(x);if(Ae(x))return o?o(x,2):x()})):Ae(e)?t?u=o?()=>o(e,2):e:u=()=>{if(p){mn();try{p()}finally{gn()}}const x=On;On=d;try{return o?o(e,3,[h]):e(h)}finally{On=x}}:u=Pt,t&&a){const x=u,E=a===!0?1/0:a;u=()=>ln(x(),E)}const R=hf(),I=()=>{d.stop(),R&&R.active&&Wo(R.effects,d)};if(i&&t){const x=t;t=(...E)=>{const T=x(...E);return I(),T}}let b=y?new Array(e.length).fill(ol):ol;const g=x=>{if(!(!(d.flags&1)||!d.dirty&&!x))if(t){const E=d.run();if(x||a||v||(y?E.some((T,S)=>It(T,b[S])):It(E,b))){p&&p();const T=On;On=d;try{const S=[E,b===ol?void 0:y&&b[0]===ol?[]:b,h];b=E,o?o(t,3,S):t(...S)}finally{On=T}}}else d.run()};return r&&r(g),d=new Ci(u),d.scheduler=l?()=>l(g,!1):g,h=x=>Df(x,!1,d),p=d.onStop=()=>{const x=Ll.get(d);if(x){if(o)o(x,4);else for(const E of x)E();Ll.delete(d)}},t?n?g(!0):b=d.run():l?l(g.bind(null,!0),!0):d.run(),I.pause=d.pause.bind(d),I.resume=d.resume.bind(d),I.stop=I,I}function ln(e,t=1/0,s){if(t<=0||!Je(e)||e.__v_skip||(s=s||new Map,(s.get(e)||0)>=t))return e;if(s.set(e,t),t--,kt(e))ln(e.value,t,s);else if(ve(e))for(let n=0;n<e.length;n++)ln(e[n],t,s);else if(oa(e)||Aa(e))e.forEach(n=>{ln(n,t,s)});else if(rr(e)){for(const n in e)ln(e[n],t,s);for(const n of Object.getOwnPropertySymbols(e))Object.prototype.propertyIsEnumerable.call(e,n)&&ln(e[n],t,s)}return e}/**
* @vue/runtime-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Mf=[];function Xg(e){Mf.push(e)}function ev(){Mf.pop()}function tv(e,t){}const sv={SETUP_FUNCTION:0,0:"SETUP_FUNCTION",RENDER_FUNCTION:1,1:"RENDER_FUNCTION",NATIVE_EVENT_HANDLER:5,5:"NATIVE_EVENT_HANDLER",COMPONENT_EVENT_HANDLER:6,6:"COMPONENT_EVENT_HANDLER",VNODE_HOOK:7,7:"VNODE_HOOK",DIRECTIVE_HOOK:8,8:"DIRECTIVE_HOOK",TRANSITION_HOOK:9,9:"TRANSITION_HOOK",APP_ERROR_HANDLER:10,10:"APP_ERROR_HANDLER",APP_WARN_HANDLER:11,11:"APP_WARN_HANDLER",FUNCTION_REF:12,12:"FUNCTION_REF",ASYNC_COMPONENT_LOADER:13,13:"ASYNC_COMPONENT_LOADER",SCHEDULER:14,14:"SCHEDULER",COMPONENT_UPDATE:15,15:"COMPONENT_UPDATE",APP_UNMOUNT_CLEANUP:16,16:"APP_UNMOUNT_CLEANUP"},nv={sp:"serverPrefetch hook",bc:"beforeCreate hook",c:"created hook",bm:"beforeMount hook",m:"mounted hook",bu:"beforeUpdate hook",u:"updated",bum:"beforeUnmount hook",um:"unmounted hook",a:"activated hook",da:"deactivated hook",ec:"errorCaptured hook",rtc:"renderTracked hook",rtg:"renderTriggered hook",0:"setup function",1:"render function",2:"watcher getter",3:"watcher callback",4:"watcher cleanup function",5:"native event handler",6:"component event handler",7:"vnode hook",8:"directive hook",9:"transition hook",10:"app errorHandler",11:"app warnHandler",12:"ref function",13:"async component loader",14:"scheduler flush",15:"component update",16:"app unmount cleanup function"};function Ja(e,t,s,n){try{return n?e(...n):e()}catch(a){da(a,t,s)}}function ps(e,t,s,n){if(Ae(e)){const a=Ja(e,t,s,n);return a&&Zo(a)&&a.catch(i=>{da(i,t,s)}),a}if(ve(e)){const a=[];for(let i=0;i<e.length;i++)a.push(ps(e[i],t,s,n));return a}}function da(e,t,s,n=!0){const a=t?t.vnode:null,{errorHandler:i,throwUnhandledErrorInProduction:l}=t&&t.appContext.config||Be;if(t){let r=t.parent;const o=t.proxy,c=`https://vuejs.org/error-reference/#runtime-${s}`;for(;r;){const d=r.ec;if(d){for(let u=0;u<d.length;u++)if(d[u](e,o,c)===!1)return}r=r.parent}if(i){mn(),Ja(i,null,10,[e,o,c]),gn();return}}av(e,s,a,n,l)}function av(e,t,s,n=!0,a=!1){if(a)throw e;console.error(e)}const Zt=[];let js=-1;const Oa=[];let Nn=null,_a=0;const Pf=Promise.resolve();let Dl=null;function Ct(e){const t=Dl||Pf;return e?t.then(this?e.bind(this):e):t}function iv(e){let t=js+1,s=Zt.length;for(;t<s;){const n=t+s>>>1,a=Zt[n],i=Ii(a);i<e||i===e&&a.flags&2?t=n+1:s=n}return t}function nc(e){if(!(e.flags&1)){const t=Ii(e),s=Zt[Zt.length-1];!s||!(e.flags&2)&&t>=Ii(s)?Zt.push(e):Zt.splice(iv(t),0,e),e.flags|=1,Ff()}}function Ff(){Dl||(Dl=Pf.then($f))}function Ri(e){ve(e)?Oa.push(...e):Nn&&e.id===-1?Nn.splice(_a+1,0,e):e.flags&1||(Oa.push(e),e.flags|=1),Ff()}function ud(e,t,s=js+1){for(;s<Zt.length;s++){const n=Zt[s];if(n&&n.flags&2){if(e&&n.id!==e.uid)continue;Zt.splice(s,1),s--,n.flags&4&&(n.flags&=-2),n(),n.flags&4||(n.flags&=-2)}}}function Ml(e){if(Oa.length){const t=[...new Set(Oa)].sort((s,n)=>Ii(s)-Ii(n));if(Oa.length=0,Nn){Nn.push(...t);return}for(Nn=t,_a=0;_a<Nn.length;_a++){const s=Nn[_a];s.flags&4&&(s.flags&=-2),s.flags&8||s(),s.flags&=-2}Nn=null,_a=0}}const Ii=e=>e.id==null?e.flags&2?-1:1/0:e.id;function $f(e){try{for(js=0;js<Zt.length;js++){const t=Zt[js];t&&!(t.flags&8)&&(t.flags&4&&(t.flags&=-2),Ja(t,t.i,t.i?15:14),t.flags&4||(t.flags&=-2))}}finally{for(;js<Zt.length;js++){const t=Zt[js];t&&(t.flags&=-2)}js=-1,Zt.length=0,Ml(),Dl=null,(Zt.length||Oa.length)&&$f()}}let ka,cl=[];function Uf(e,t){var s,n;ka=e,ka?(ka.enabled=!0,cl.forEach(({event:a,args:i})=>ka.emit(a,...i)),cl=[]):typeof window<"u"&&window.HTMLElement&&!((n=(s=window.navigator)==null?void 0:s.userAgent)!=null&&n.includes("jsdom"))?((t.__VUE_DEVTOOLS_HOOK_REPLAY__=t.__VUE_DEVTOOLS_HOOK_REPLAY__||[]).push(i=>{Uf(i,t)}),setTimeout(()=>{ka||(t.__VUE_DEVTOOLS_HOOK_REPLAY__=null,cl=[])},3e3)):cl=[]}let Mt=null,vr=null;function Oi(e){const t=Mt;return Mt=e,vr=e&&e.type.__scopeId||null,t}function lv(e){vr=e}function rv(){vr=null}const ov=e=>ac;function ac(e,t=Mt,s){if(!t||e._n)return e;const n=(...a)=>{n._d&&Mi(-1);const i=Oi(t);let l;try{l=e(...a)}finally{Oi(i),n._d&&Mi(1)}return l};return n._n=!0,n._c=!0,n._d=!0,n}function cv(e,t){if(Mt===null)return e;const s=Ji(Mt),n=e.dirs||(e.dirs=[]);for(let a=0;a<t.length;a++){let[i,l,r,o=Be]=t[a];i&&(Ae(i)&&(i={mounted:i,updated:i}),i.deep&&ln(l),n.push({dir:i,instance:s,value:l,oldValue:void 0,arg:r,modifiers:o}))}return e}function zs(e,t,s,n){const a=e.dirs,i=t&&t.dirs;for(let l=0;l<a.length;l++){const r=a[l];i&&(r.oldValue=i[l].value);let o=r.dir[n];o&&(mn(),ps(o,s,8,[e.el,r,e,t]),gn())}}function vi(e,t){if(Dt){let s=Dt.provides;const n=Dt.parent&&Dt.parent.provides;n===s&&(s=Dt.provides=Object.create(n)),s[e]=t}}function Ss(e,t,s=!1){const n=Qt();if(n||Xn){let a=Xn?Xn._context.provides:n?n.parent==null||n.ce?n.vnode.appContext&&n.vnode.appContext.provides:n.parent.provides:void 0;if(a&&e in a)return a[e];if(arguments.length>1)return s&&Ae(t)?t.call(n&&n.proxy):t}}function dv(){return!!(Qt()||Xn)}const Bf=Symbol.for("v-scx"),Hf=()=>Ss(Bf);function uv(e,t){return Ki(e,null,t)}function fv(e,t){return Ki(e,null,{flush:"post"})}function Vf(e,t){return Ki(e,null,{flush:"sync"})}function Yt(e,t,s){return Ki(e,t,s)}function Ki(e,t,s=Be){const{immediate:n,deep:a,flush:i,once:l}=s,r=Ue({},s),o=t&&n||!t&&i!=="post";let c;if(aa){if(i==="sync"){const h=Hf();c=h.__watcherHandles||(h.__watcherHandles=[])}else if(!o){const h=()=>{};return h.stop=Pt,h.resume=Pt,h.pause=Pt,h}}const d=Dt;r.call=(h,v,y)=>ps(h,d,v,y);let u=!1;i==="post"?r.scheduler=h=>{xt(h,d&&d.suspense)}:i!=="sync"&&(u=!0,r.scheduler=(h,v)=>{v?h():nc(h)}),r.augmentJob=h=>{t&&(h.flags|=4),u&&(h.flags|=2,d&&(h.id=d.uid,h.i=d))};const p=Qg(e,t,r);return aa&&(c?c.push(p):o&&p()),p}function pv(e,t,s){const n=this.proxy,a=Le(e)?e.includes(".")?jf(n,e):()=>n[e]:e.bind(n,n);let i;Ae(t)?i=t:(i=t.handler,s=t);const l=Ya(this),r=Ki(a,i.bind(n),s);return l(),r}function jf(e,t){const s=t.split(".");return()=>{let n=e;for(let a=0;a<s.length&&n;a++)n=n[s[a]];return n}}const Rn=new WeakMap,zf=Symbol("_vte"),qf=e=>e.__isTeleport,Wn=e=>e&&(e.disabled||e.disabled===""),hv=e=>e&&(e.defer||e.defer===""),fd=e=>typeof SVGElement<"u"&&e instanceof SVGElement,pd=e=>typeof MathMLElement=="function"&&e instanceof MathMLElement,go=(e,t)=>{const s=e&&e.to;return Le(s)?t?t(s):null:s},mv={name:"Teleport",__isTeleport:!0,process(e,t,s,n,a,i,l,r,o,c){const{mc:d,pc:u,pbc:p,o:{insert:h,querySelector:v,createText:y,createComment:R,parentNode:I}}=c,b=Wn(t.props);let{dynamicChildren:g}=t;const x=(S,w,A)=>{S.shapeFlag&16&&d(S.children,w,A,a,i,l,r,o)},E=(S=t)=>{const w=Wn(S.props),A=S.target=go(S.props,v),L=vo(A,S,y,h);A&&(l!=="svg"&&fd(A)?l="svg":l!=="mathml"&&pd(A)&&(l="mathml"),a&&a.isCE&&(a.ce._teleportTargets||(a.ce._teleportTargets=new Set)).add(A),w||(x(S,A,L),di(S,!1)))},T=S=>{const w=()=>{if(Rn.get(S)===w){if(Rn.delete(S),Wn(S.props)){const A=I(S.el)||s;x(S,A,S.anchor),di(S,!0)}E(S)}};Rn.set(S,w),xt(w,i)};if(e==null){const S=t.el=y(""),w=t.anchor=y("");if(h(S,s,n),h(w,s,n),hv(t.props)||i&&i.pendingBranch){T(t);return}b&&(x(t,s,w),di(t,!0)),E()}else{t.el=e.el;const S=t.anchor=e.anchor,w=Rn.get(e);if(w){w.flags|=8,Rn.delete(e),T(t);return}t.targetStart=e.targetStart;const A=t.target=e.target,L=t.targetAnchor=e.targetAnchor,B=Wn(e.props),F=B?s:A,M=B?S:L;if(l==="svg"||fd(A)?l="svg":(l==="mathml"||pd(A))&&(l="mathml"),g?(p(e.dynamicChildren,g,F,a,i,l,r),mc(e,t,!0)):o||u(e,t,F,M,a,i,l,r,!1),b)B?t.props&&e.props&&t.props.to!==e.props.to&&(t.props.to=e.props.to):dl(t,s,S,c,1);else if((t.props&&t.props.to)!==(e.props&&e.props.to)){const Z=t.target=go(t.props,v);Z&&dl(t,Z,null,c,0)}else B&&dl(t,A,L,c,1);di(t,b)}},remove(e,t,s,{um:n,o:{remove:a}},i){const{shapeFlag:l,children:r,anchor:o,targetStart:c,targetAnchor:d,target:u,props:p}=e,h=i||!Wn(p),v=Rn.get(e);if(v&&(v.flags|=8,Rn.delete(e)),u&&(a(c),a(d)),i&&a(o),!v&&l&16)for(let y=0;y<r.length;y++){const R=r[y];n(R,t,s,h,!!R.dynamicChildren)}},move:dl,hydrate:gv};function dl(e,t,s,{o:{insert:n},m:a},i=2){i===0&&n(e.targetAnchor,t,s);const{el:l,anchor:r,shapeFlag:o,children:c,props:d}=e,u=i===2;if(u&&n(l,t,s),!Rn.has(e)&&(!u||Wn(d))&&o&16)for(let p=0;p<c.length;p++)a(c[p],t,s,2);u&&n(r,t,s)}function gv(e,t,s,n,a,i,{o:{nextSibling:l,parentNode:r,querySelector:o,insert:c,createText:d}},u){function p(R,I){let b=I;for(;b;){if(b&&b.nodeType===8){if(b.data==="teleport start anchor")t.targetStart=b;else if(b.data==="teleport anchor"){t.targetAnchor=b,R._lpa=t.targetAnchor&&l(t.targetAnchor);break}}b=l(b)}}function h(R,I){I.anchor=u(l(R),I,r(R),s,n,a,i)}const v=t.target=go(t.props,o),y=Wn(t.props);if(v){const R=v._lpa||v.firstChild;t.shapeFlag&16&&(y?(h(e,t),p(v,R),t.targetAnchor||vo(v,t,d,c,r(e)===v?e:null)):(t.anchor=l(e),p(v,R),t.targetAnchor||vo(v,t,d,c),u(R&&l(R),t,v,s,n,a,i))),di(t,y)}else y&&t.shapeFlag&16&&(h(e,t),t.targetStart=e,t.targetAnchor=l(e));return t.anchor&&l(t.anchor)}const vv=mv;function di(e,t){const s=e.ctx;if(s&&s.ut){let n,a;for(t?(n=e.el,a=e.anchor):(n=e.targetStart,a=e.targetAnchor);n&&n!==a;)n.nodeType===1&&n.setAttribute("data-v-owner",s.uid),n=n.nextSibling;s.ut()}}function vo(e,t,s,n,a=null){const i=t.targetStart=s(""),l=t.targetAnchor=s("");return i[zf]=l,e&&(n(i,e,a),n(l,e,a)),l}const _s=Symbol("_leaveCb"),si=Symbol("_enterCb");function ic(){const e={isMounted:!1,isLeaving:!1,isUnmounting:!1,leavingVNodes:new Map};return Ke(()=>{e.isMounted=!0}),_r(()=>{e.isUnmounting=!0}),e}const xs=[Function,Array],lc={mode:String,appear:Boolean,persisted:Boolean,onBeforeEnter:xs,onEnter:xs,onAfterEnter:xs,onEnterCancelled:xs,onBeforeLeave:xs,onLeave:xs,onAfterLeave:xs,onLeaveCancelled:xs,onBeforeAppear:xs,onAppear:xs,onAfterAppear:xs,onAppearCancelled:xs},Gf=e=>{const t=e.subTree;return t.component?Gf(t.component):t},bv={name:"BaseTransition",props:lc,setup(e,{slots:t}){const s=Qt(),n=ic();return()=>{const a=t.default&&br(t.default(),!0),i=a&&a.length?Kf(a):s.subTree?Rp():void 0;if(!i)return;const l=Ge(e),{mode:r}=l;if(n.isLeaving)return Vr(i);const o=hd(i);if(!o)return Vr(i);let c=$a(o,l,n,s,u=>c=u);o.type!==vt&&vn(o,c);let d=s.subTree&&hd(s.subTree);if(d&&d.type!==vt&&!Ls(d,o)&&Gf(s).type!==vt){let u=$a(d,l,n,s);if(vn(d,u),r==="out-in"&&o.type!==vt)return n.isLeaving=!0,u.afterLeave=()=>{n.isLeaving=!1,s.job.flags&8||s.update(),delete u.afterLeave,d=void 0},Vr(i);r==="in-out"&&o.type!==vt?u.delayLeave=(p,h,v)=>{const y=Zf(n,d);y[String(d.key)]=d,p[_s]=()=>{h(),p[_s]=void 0,delete c.delayedLeave,d=void 0},c.delayedLeave=()=>{v(),delete c.delayedLeave,d=void 0}}:d=void 0}else d&&(d=void 0);return i}}};function Kf(e){let t=e[0];if(e.length>1){for(const s of e)if(s.type!==vt){t=s;break}}return t}const Wf=bv;function Zf(e,t){const{leavingVNodes:s}=e;let n=s.get(t.type);return n||(n=Object.create(null),s.set(t.type,n)),n}function $a(e,t,s,n,a){const{appear:i,mode:l,persisted:r=!1,onBeforeEnter:o,onEnter:c,onAfterEnter:d,onEnterCancelled:u,onBeforeLeave:p,onLeave:h,onAfterLeave:v,onLeaveCancelled:y,onBeforeAppear:R,onAppear:I,onAfterAppear:b,onAppearCancelled:g}=t,x=String(e.key),E=Zf(s,e),T=(A,L)=>{A&&ps(A,n,9,L)},S=(A,L)=>{const B=L[1];T(A,L),ve(A)?A.every(F=>F.length<=1)&&B():A.length<=1&&B()},w={mode:l,persisted:r,beforeEnter(A){let L=o;if(!s.isMounted)if(i)L=R||o;else return;A[_s]&&A[_s](!0);const B=E[x];B&&Ls(e,B)&&B.el[_s]&&B.el[_s](),T(L,[A])},enter(A){if(E[x]===e)return;let L=c,B=d,F=u;if(!s.isMounted)if(i)L=I||c,B=b||d,F=g||u;else return;let M=!1;A[si]=ne=>{M||(M=!0,ne?T(F,[A]):T(B,[A]),w.delayedLeave&&w.delayedLeave(),A[si]=void 0)};const Z=A[si].bind(null,!1);L?S(L,[A,Z]):Z()},leave(A,L){const B=String(e.key);if(A[si]&&A[si](!0),s.isUnmounting)return L();T(p,[A]);let F=!1;A[_s]=Z=>{F||(F=!0,L(),Z?T(y,[A]):T(v,[A]),A[_s]=void 0,E[B]===e&&delete E[B])};const M=A[_s].bind(null,!1);E[B]=e,h?S(h,[A,M]):M()},clone(A){const L=$a(A,t,s,n,a);return a&&a(L),L}};return w}function Vr(e){if(Zi(e))return e=Ws(e),e.children=null,e}function hd(e){if(!Zi(e))return qf(e.type)&&e.children?Kf(e.children):e;if(e.component)return e.component.subTree;const{shapeFlag:t,children:s}=e;if(s){if(t&16)return s[0];if(t&32&&Ae(s.default))return s.default()}}function vn(e,t){e.shapeFlag&6&&e.component?(e.transition=t,vn(e.component.subTree,t)):e.shapeFlag&128?(e.ssContent.transition=t.clone(e.ssContent),e.ssFallback.transition=t.clone(e.ssFallback)):e.transition=t}function br(e,t=!1,s){let n=[],a=0;for(let i=0;i<e.length;i++){let l=e[i];const r=s==null?l.key:String(s)+String(l.key!=null?l.key:i);l.type===Ot?(l.patchFlag&128&&a++,n=n.concat(br(l.children,t,r))):(t||l.type!==vt)&&n.push(r!=null?Ws(l,{key:r}):l)}if(a>1)for(let i=0;i<n.length;i++)n[i].patchFlag=-2;return n}function Wi(e,t){return Ae(e)?Ue({name:e.name},t,{setup:e}):e}function yv(){const e=Qt();return e?(e.appContext.config.idPrefix||"v")+"-"+e.ids[0]+e.ids[1]++:""}function rc(e){e.ids=[e.ids[0]+e.ids[2]+++"-",0,0]}function xv(e){const t=Qt(),s=tc(null);if(t){const a=t.refs===Be?t.refs={}:t.refs;Object.defineProperty(a,e,{enumerable:!0,get:()=>s.value,set:i=>s.value=i})}return s}function md(e,t){let s;return!!((s=Object.getOwnPropertyDescriptor(e,t))&&!s.configurable)}const Pl=new WeakMap;function Na(e,t,s,n,a=!1){if(ve(e)){e.forEach((y,R)=>Na(y,t&&(ve(t)?t[R]:t),s,n,a));return}if(fn(n)&&!a){n.shapeFlag&512&&n.type.__asyncResolved&&n.component.subTree.component&&Na(e,t,s,n.component.subTree);return}const i=n.shapeFlag&4?Ji(n.component):n.el,l=a?null:i,{i:r,r:o}=e,c=t&&t.r,d=r.refs===Be?r.refs={}:r.refs,u=r.setupState,p=Ge(u),h=u===Be?Ta:y=>md(d,y)?!1:Ye(p,y),v=(y,R)=>!(R&&md(d,R));if(c!=null&&c!==o){if(gd(t),Le(c))d[c]=null,h(c)&&(u[c]=null);else if(kt(c)){const y=t;v(c,y.k)&&(c.value=null),y.k&&(d[y.k]=null)}}if(Ae(o))Ja(o,r,12,[l,d]);else{const y=Le(o),R=kt(o);if(y||R){const I=()=>{if(e.f){const b=y?h(o)?u[o]:d[o]:v()||!e.k?o.value:d[e.k];if(a)ve(b)&&Wo(b,i);else if(ve(b))b.includes(i)||b.push(i);else if(y)d[o]=[i],h(o)&&(u[o]=d[o]);else{const g=[i];v(o,e.k)&&(o.value=g),e.k&&(d[e.k]=g)}}else y?(d[o]=l,h(o)&&(u[o]=l)):R&&(v(o,e.k)&&(o.value=l),e.k&&(d[e.k]=l))};if(l){const b=()=>{I(),Pl.delete(e)};b.id=-1,Pl.set(e,b),xt(b,s)}else gd(e),I()}}}function gd(e){const t=Pl.get(e);t&&(t.flags|=8,Pl.delete(e))}let vd=!1;const ga=()=>{vd||(console.error("Hydration completed but contains mismatches."),vd=!0)},_v=e=>e.namespaceURI.includes("svg")&&e.tagName!=="foreignObject",kv=e=>e.namespaceURI.includes("MathML"),ul=e=>{if(e.nodeType===1){if(_v(e))return"svg";if(kv(e))return"mathml"}},Ca=e=>e.nodeType===8;function wv(e){const{mt:t,p:s,o:{patchProp:n,createText:a,nextSibling:i,parentNode:l,remove:r,insert:o,createComment:c}}=e,d=(g,x)=>{if(!x.hasChildNodes()){s(null,g,x),Ml(),x._vnode=g;return}u(x.firstChild,g,null,null,null),Ml(),x._vnode=g},u=(g,x,E,T,S,w=!1)=>{w=w||!!x.dynamicChildren;const A=Ca(g)&&g.data==="[",L=()=>y(g,x,E,T,S,A),{type:B,ref:F,shapeFlag:M,patchFlag:Z}=x;let ne=g.nodeType;x.el=g,Z===-2&&(w=!1,x.dynamicChildren=null);let U=null;switch(B){case Mn:ne!==3?x.children===""?(o(x.el=a(""),l(g),g),U=g):U=L():(g.data!==x.children&&(ga(),g.data=x.children),U=i(g));break;case vt:b(g)?(U=i(g),I(x.el=g.content.firstChild,g,E)):ne!==8||A?U=L():U=i(g);break;case ea:if(A&&(g=i(g),ne=g.nodeType),ne===1||ne===3){U=g;const O=!x.children.length;for(let N=0;N<x.staticCount;N++)O&&(x.children+=U.nodeType===1?U.outerHTML:U.data),N===x.staticCount-1&&(x.anchor=U),U=i(U);return A?i(U):U}else L();break;case Ot:A?U=v(g,x,E,T,S,w):U=L();break;default:if(M&1)(ne!==1||x.type.toLowerCase()!==g.tagName.toLowerCase())&&!b(g)?U=L():U=p(g,x,E,T,S,w);else if(M&6){x.slotScopeIds=S;const O=l(g);if(A?U=R(g):Ca(g)&&g.data==="teleport start"?U=R(g,g.data,"teleport end"):U=i(g),t(x,O,null,E,T,ul(O),w),fn(x)&&!x.type.__asyncResolved){let N;A?(N=ut(Ot),N.anchor=U?U.previousSibling:O.lastChild):N=g.nodeType===3?vc(""):ut("div"),N.el=g,x.component.subTree=N}}else M&64?ne!==8?U=L():U=x.type.hydrate(g,x,E,T,S,w,e,h):M&128&&(U=x.type.hydrate(g,x,E,T,ul(l(g)),S,w,e,u))}return F!=null&&Na(F,null,T,x),U},p=(g,x,E,T,S,w)=>{w=w||!!x.dynamicChildren;const{type:A,props:L,patchFlag:B,shapeFlag:F,dirs:M,transition:Z}=x,ne=A==="input"||A==="option";if(ne||B!==-1){M&&zs(x,null,E,"created");let U=!1;if(b(g)){U=xp(null,Z)&&E&&E.vnode.props&&E.vnode.props.appear;const N=g.content.firstChild;if(U){const j=N.getAttribute("class");j&&(N.$cls=j),Z.beforeEnter(N)}I(N,g,E),x.el=g=N}if(F&16&&!(L&&(L.innerHTML||L.textContent))){let N=h(g.firstChild,x,g,E,T,S,w);for(N&&!fl(g,1)&&ga();N;){const j=N;N=N.nextSibling,r(j)}}else if(F&8){let N=x.children;N[0]===`
`&&(g.tagName==="PRE"||g.tagName==="TEXTAREA")&&(N=N.slice(1));const{textContent:j}=g;j!==N&&j!==N.replace(/\r\n|\r/g,`
`)&&(fl(g,0)||ga(),g.textContent=x.children)}if(L){if(ne||!w||B&48){const N=g.tagName.includes("-");for(const j in L)(ne&&(j.endsWith("value")||j==="indeterminate")||ra(j)&&!dn(j)||j[0]==="."||N&&!dn(j))&&n(g,j,null,L[j],void 0,E)}else if(L.onClick)n(g,"onClick",null,L.onClick,void 0,E);else if(B&4&&un(L.style))for(const N in L.style)L.style[N]}let O;(O=L&&L.onVnodeBeforeMount)&&ss(O,E,x),M&&zs(x,null,E,"beforeMount"),((O=L&&L.onVnodeMounted)||M||U)&&Sp(()=>{O&&ss(O,E,x),U&&Z.enter(g),M&&zs(x,null,E,"mounted")},T)}return g.nextSibling},h=(g,x,E,T,S,w,A)=>{A=A||!!x.dynamicChildren;const L=x.children,B=L.length;let F=!1;for(let M=0;M<B;M++){const Z=A?L[M]:L[M]=as(L[M]),ne=Z.type===Mn;g?(ne&&!A&&M+1<B&&as(L[M+1]).type===Mn&&(o(a(g.data.slice(Z.children.length)),E,i(g)),g.data=Z.children),g=u(g,Z,T,S,w,A)):ne&&!Z.children?o(Z.el=a(""),E):(F||(F=!0,fl(E,1)||ga()),s(null,Z,E,null,T,S,ul(E),w))}return g},v=(g,x,E,T,S,w)=>{const{slotScopeIds:A}=x;A&&(S=S?S.concat(A):A);const L=l(g),B=h(i(g),x,L,E,T,S,w);return B&&Ca(B)&&B.data==="]"?i(x.anchor=B):(ga(),o(x.anchor=c("]"),L,B),B)},y=(g,x,E,T,S,w)=>{if(fl(g.parentElement,1)||ga(),x.el=null,w){const B=R(g);for(;;){const F=i(g);if(F&&F!==B)r(F);else break}}const A=i(g),L=l(g);return r(g),s(null,x,L,A,E,T,ul(L),S),E&&(E.vnode.el=x.el,wr(E,x.el)),A},R=(g,x="[",E="]")=>{let T=0;for(;g;)if(g=i(g),g&&Ca(g)&&(g.data===x&&T++,g.data===E)){if(T===0)return i(g);T--}return g},I=(g,x,E)=>{const T=x.parentNode;T&&T.replaceChild(g,x);let S=E;for(;S;)S.vnode.el===x&&(S.vnode.el=S.subTree.el=g),S=S.parent},b=g=>g.nodeType===1&&g.tagName==="TEMPLATE";return[d,u]}const bd="data-allow-mismatch",Sv={0:"text",1:"children",2:"class",3:"style",4:"attribute"};function fl(e,t){if(t===0||t===1)for(;e&&!e.hasAttribute(bd);)e=e.parentElement;const s=e&&e.getAttribute(bd);if(s==null)return!1;if(s==="")return!0;{const n=s.split(",");return t===0&&n.includes("children")?!0:n.includes(Sv[t])}}const Tv=ur().requestIdleCallback||(e=>setTimeout(e,1)),Cv=ur().cancelIdleCallback||(e=>clearTimeout(e)),Ev=(e=1e4)=>t=>{const s=Tv(t,{timeout:e});return()=>Cv(s)};function Av(e){const{top:t,left:s,bottom:n,right:a}=e.getBoundingClientRect(),{innerHeight:i,innerWidth:l}=window;return(t>0&&t<i||n>0&&n<i)&&(s>0&&s<l||a>0&&a<l)}const Rv=e=>(t,s)=>{const n=new IntersectionObserver(a=>{for(const i of a)if(i.isIntersecting){n.disconnect(),t();break}},e);return s(a=>{if(a instanceof Element){if(Av(a))return t(),n.disconnect(),!1;n.observe(a)}}),()=>n.disconnect()},Iv=e=>t=>{if(e){const s=matchMedia(e);if(s.matches)t();else return s.addEventListener("change",t,{once:!0}),()=>s.removeEventListener("change",t)}},Ov=(e=[])=>(t,s)=>{Le(e)&&(e=[e]);let n=!1;const a=l=>{n||(n=!0,i(),t(),l.target.dispatchEvent(new l.constructor(l.type,l)))},i=()=>{s(l=>{for(const r of e)l.removeEventListener(r,a)})};return s(l=>{for(const r of e)l.addEventListener(r,a,{once:!0})}),i};function Nv(e,t){if(Ca(e)&&e.data==="["){let s=1,n=e.nextSibling;for(;n;){if(n.nodeType===1){if(t(n)===!1)break}else if(Ca(n))if(n.data==="]"){if(--s===0)break}else n.data==="["&&s++;n=n.nextSibling}}else t(e)}const fn=e=>!!e.type.__asyncLoader;function Lv(e){Ae(e)&&(e={loader:e});const{loader:t,loadingComponent:s,errorComponent:n,delay:a=200,hydrate:i,timeout:l,suspensible:r=!0,onError:o}=e;let c=null,d,u=0;const p=()=>(u++,c=null,h()),h=()=>{let v;return c||(v=c=t().catch(y=>{if(y=y instanceof Error?y:new Error(String(y)),o)return new Promise((R,I)=>{o(y,()=>R(p()),()=>I(y),u+1)});throw y}).then(y=>v!==c&&c?c:(y&&(y.__esModule||y[Symbol.toStringTag]==="Module")&&(y=y.default),d=y,y)))};return Wi({name:"AsyncComponentWrapper",__asyncLoader:h,__asyncHydrate(v,y,R){let I=!1;(y.bu||(y.bu=[])).push(()=>I=!0);const b=()=>{I||R()},g=i?()=>{const x=i(b,E=>Nv(v,E));x&&(y.bum||(y.bum=[])).push(x)}:b;d?g():h().then(()=>!y.isUnmounted&&g())},get __asyncResolved(){return d},setup(){const v=Dt;if(rc(v),d)return()=>pl(d,v);const y=E=>{c=null,da(E,v,13,!n)};if(r&&v.suspense||aa)return h().then(E=>()=>pl(E,v)).catch(E=>(y(E),()=>n?ut(n,{error:E}):null));const R=m(!1),I=m(),b=m(!!a);let g,x;return bt(()=>{g!=null&&clearTimeout(g),x!=null&&clearTimeout(x)}),a&&(x=setTimeout(()=>{v.isUnmounted||(b.value=!1)},a)),l!=null&&(g=setTimeout(()=>{if(!v.isUnmounted&&!R.value&&!I.value){const E=new Error(`Async component timed out after ${l}ms.`);y(E),I.value=E}},l)),h().then(()=>{v.isUnmounted||(R.value=!0,v.parent&&Zi(v.parent.vnode)&&v.parent.update())}).catch(E=>{if(v.isUnmounted){c=null;return}y(E),I.value=E}),()=>{if(R.value&&d)return pl(d,v);if(I.value&&n)return ut(n,{error:I.value});if(s&&!b.value)return pl(s,v)}}})}function pl(e,t){const{ref:s,props:n,children:a,ce:i}=t.vnode,l=ut(e,n,a);return l.ref=s,l.ce=i,delete t.vnode.ce,l}const Zi=e=>e.type.__isKeepAlive,Dv={name:"KeepAlive",__isKeepAlive:!0,props:{include:[String,RegExp,Array],exclude:[String,RegExp,Array],max:[String,Number]},setup(e,{slots:t}){const s=Qt(),n=s.ctx;if(!n.renderer)return()=>{const b=t.default&&t.default();return b&&b.length===1?b[0]:b};const a=new Map,i=new Set;let l=null;const r=s.suspense,{renderer:{p:o,m:c,um:d,o:{createElement:u}}}=n,p=u("div");n.activate=(b,g,x,E,T)=>{const S=b.component;c(b,g,x,0,r),o(S.vnode,b,g,x,S,r,E,b.slotScopeIds,T),xt(()=>{S.isDeactivated=!1,S.a&&Ia(S.a);const w=b.props&&b.props.onVnodeMounted;w&&ss(w,S.parent,b)},r)},n.deactivate=b=>{const g=b.component;$l(g.m),$l(g.a),c(b,p,null,1,r),xt(()=>{g.da&&Ia(g.da);const x=b.props&&b.props.onVnodeUnmounted;x&&ss(x,g.parent,b),g.isDeactivated=!0},r)};function h(b){jr(b),d(b,s,r,!0)}function v(b){a.forEach((g,x)=>{const E=Co(fn(g)?g.type.__asyncResolved||{}:g.type);E&&!b(E)&&y(x)})}function y(b){const g=a.get(b);g&&(!l||!Ls(g,l))?h(g):l&&jr(l),a.delete(b),i.delete(b)}Yt(()=>[e.include,e.exclude],([b,g])=>{b&&v(x=>ui(b,x)),g&&v(x=>!ui(g,x))},{flush:"post",deep:!0});let R=null;const I=()=>{R!=null&&(Ul(s.subTree.type)?xt(()=>{a.set(R,hl(s.subTree))},s.subTree.suspense):a.set(R,hl(s.subTree)))};return Ke(I),xr(I),_r(()=>{a.forEach(b=>{const{subTree:g,suspense:x}=s,E=hl(g);if(b.type===E.type&&b.key===E.key){jr(E);const T=E.component.da;T&&xt(T,x);return}h(b)})}),()=>{if(R=null,!t.default)return l=null;const b=t.default(),g=b[0];if(b.length>1)return l=null,b;if(!bn(g)||!(g.shapeFlag&4)&&!(g.shapeFlag&128))return l=null,g;let x=hl(g);if(x.type===vt)return l=null,x;const E=x.type,T=Co(fn(x)?x.type.__asyncResolved||{}:E),{include:S,exclude:w,max:A}=e;if(S&&(!T||!ui(S,T))||w&&T&&ui(w,T))return x.shapeFlag&=-257,l=x,g;const L=x.key==null?E:x.key,B=a.get(L);return x.el&&(x=Ws(x),g.shapeFlag&128&&(g.ssContent=x)),R=L,B?(x.el=B.el,x.component=B.component,x.transition&&vn(x,x.transition),x.shapeFlag|=512,i.delete(L),i.add(L)):(i.add(L),A&&i.size>parseInt(A,10)&&y(i.values().next().value)),x.shapeFlag|=256,l=x,Ul(g.type)?g:x}}},Mv=Dv;function ui(e,t){return ve(e)?e.some(s=>ui(s,t)):Le(e)?e.split(",").includes(t):qm(e)?(e.lastIndex=0,e.test(t)):!1}function Es(e,t){Jf(e,"a",t)}function As(e,t){Jf(e,"da",t)}function Jf(e,t,s=Dt){const n=e.__wdc||(e.__wdc=()=>{let a=s;for(;a;){if(a.isDeactivated)return;a=a.parent}return e()});if(yr(t,n,s),s){let a=s.parent;for(;a&&a.parent;)Zi(a.parent.vnode)&&Pv(n,t,s,a),a=a.parent}}function Pv(e,t,s,n){const a=yr(t,e,n,!0);bt(()=>{Wo(n[t],a)},s)}function jr(e){e.shapeFlag&=-257,e.shapeFlag&=-513}function hl(e){return e.shapeFlag&128?e.ssContent:e}function yr(e,t,s=Dt,n=!1){if(s){const a=s[e]||(s[e]=[]),i=t.__weh||(t.__weh=(...l)=>{mn();const r=Ya(s),o=ps(t,s,e,l);return r(),gn(),o});return n?a.unshift(i):a.push(i),i}}const yn=e=>(t,s=Dt)=>{(!aa||e==="sp")&&yr(e,(...n)=>t(...n),s)},Yf=yn("bm"),Ke=yn("m"),oc=yn("bu"),xr=yn("u"),_r=yn("bum"),bt=yn("um"),Qf=yn("sp"),Xf=yn("rtg"),ep=yn("rtc");function tp(e,t=Dt){yr("ec",e,t)}const cc="components",Fv="directives";function $v(e,t){return dc(cc,e,!0,t)||e}const sp=Symbol.for("v-ndc");function Uv(e){return Le(e)?dc(cc,e,!1)||e:e||sp}function Bv(e){return dc(Fv,e)}function dc(e,t,s=!0,n=!1){const a=Mt||Dt;if(a){const i=a.type;if(e===cc){const r=Co(i,!1);if(r&&(r===t||r===nt(t)||r===ca(nt(t))))return i}const l=yd(a[e]||i[e],t)||yd(a.appContext[e],t);return!l&&n?i:l}}function yd(e,t){return e&&(e[t]||e[nt(t)]||e[ca(nt(t))])}function Hv(e,t,s,n){let a;const i=s&&s[n],l=ve(e);if(l||Le(e)){const r=l&&un(e);let o=!1,c=!1;r&&(o=!rs(e),c=Ks(e),e=hr(e)),a=new Array(e.length);for(let d=0,u=e.length;d<u;d++)a[d]=t(o?c?Fa(Ps(e[d])):Ps(e[d]):e[d],d,void 0,i&&i[d])}else if(typeof e=="number"){a=new Array(e);for(let r=0;r<e;r++)a[r]=t(r+1,r,void 0,i&&i[r])}else if(Je(e))if(e[Symbol.iterator])a=Array.from(e,(r,o)=>t(r,o,void 0,i&&i[o]));else{const r=Object.keys(e);a=new Array(r.length);for(let o=0,c=r.length;o<c;o++){const d=r[o];a[o]=t(e[d],d,o,i&&i[o])}}else a=[];return s&&(s[n]=a),a}function Vv(e,t){for(let s=0;s<t.length;s++){const n=t[s];if(ve(n))for(let a=0;a<n.length;a++)e[n[a].name]=n[a].fn;else n&&(e[n.name]=n.key?(...a)=>{const i=n.fn(...a);return i&&(i.key=n.key),i}:n.fn)}return e}function jv(e,t,s={},n,a){if(Mt.ce||Mt.parent&&fn(Mt.parent)&&Mt.parent.ce){const c=Object.keys(s).length>0;return t!=="default"&&(s.name=t),Di(),Bl(Ot,null,[ut("slot",s,n&&n())],c?-2:64)}let i=e[t];i&&i._c&&(i._d=!1),Di();const l=i&&uc(i(s)),r=s.key||l&&l.key,o=Bl(Ot,{key:(r&&!qt(r)?r:`_${t}`)+(!l&&n?"_fb":"")},l||(n?n():[]),l&&e._===1?64:-2);return!a&&o.scopeId&&(o.slotScopeIds=[o.scopeId+"-s"]),i&&i._c&&(i._d=!0),o}function uc(e){return e.some(t=>bn(t)?!(t.type===vt||t.type===Ot&&!uc(t.children)):!0)?e:null}function zv(e,t){const s={};for(const n in e)s[t&&/[A-Z]/.test(n)?`on:${n}`:Ra(n)]=e[n];return s}const bo=e=>e?Np(e)?Ji(e):bo(e.parent):null,bi=Ue(Object.create(null),{$:e=>e,$el:e=>e.vnode.el,$data:e=>e.data,$props:e=>e.props,$attrs:e=>e.attrs,$slots:e=>e.slots,$refs:e=>e.refs,$parent:e=>bo(e.parent),$root:e=>bo(e.root),$host:e=>e.ce,$emit:e=>e.emit,$options:e=>fc(e),$forceUpdate:e=>e.f||(e.f=()=>{nc(e.update)}),$nextTick:e=>e.n||(e.n=Ct.bind(e.proxy)),$watch:e=>pv.bind(e)}),zr=(e,t)=>e!==Be&&!e.__isScriptSetup&&Ye(e,t),yo={get({_:e},t){if(t==="__v_skip")return!0;const{ctx:s,setupState:n,data:a,props:i,accessCache:l,type:r,appContext:o}=e;if(t[0]!=="$"){const p=l[t];if(p!==void 0)switch(p){case 1:return n[t];case 2:return a[t];case 4:return s[t];case 3:return i[t]}else{if(zr(n,t))return l[t]=1,n[t];if(a!==Be&&Ye(a,t))return l[t]=2,a[t];if(Ye(i,t))return l[t]=3,i[t];if(s!==Be&&Ye(s,t))return l[t]=4,s[t];xo&&(l[t]=0)}}const c=bi[t];let d,u;if(c)return t==="$attrs"&&Vt(e.attrs,"get",""),c(e);if((d=r.__cssModules)&&(d=d[t]))return d;if(s!==Be&&Ye(s,t))return l[t]=4,s[t];if(u=o.config.globalProperties,Ye(u,t))return u[t]},set({_:e},t,s){const{data:n,setupState:a,ctx:i}=e;return zr(a,t)?(a[t]=s,!0):n!==Be&&Ye(n,t)?(n[t]=s,!0):Ye(e.props,t)||t[0]==="$"&&t.slice(1)in e?!1:(i[t]=s,!0)},has({_:{data:e,setupState:t,accessCache:s,ctx:n,appContext:a,props:i,type:l}},r){let o;return!!(s[r]||e!==Be&&r[0]!=="$"&&Ye(e,r)||zr(t,r)||Ye(i,r)||Ye(n,r)||Ye(bi,r)||Ye(a.config.globalProperties,r)||(o=l.__cssModules)&&o[r])},defineProperty(e,t,s){return s.get!=null?e._.accessCache[t]=0:Ye(s,"value")&&this.set(e,t,s.value,null),Reflect.defineProperty(e,t,s)}},qv=Ue({},yo,{get(e,t){if(t!==Symbol.unscopables)return yo.get(e,t,e)},has(e,t){return t[0]!=="_"&&!Qm(t)}});function Gv(){return null}function Kv(){return null}function Wv(e){}function Zv(e){}function Jv(){return null}function Yv(){}function Qv(e,t){return null}function Xv(){return np().slots}function eb(){return np().attrs}function np(e){const t=Qt();return t.setupContext||(t.setupContext=Pp(t))}function Ni(e){return ve(e)?e.reduce((t,s)=>(t[s]=null,t),{}):e}function tb(e,t){const s=Ni(e);for(const n in t){if(n.startsWith("__skip"))continue;let a=s[n];a?ve(a)||Ae(a)?a=s[n]={type:a,default:t[n]}:a.default=t[n]:a===null&&(a=s[n]={default:t[n]}),a&&t[`__skip_${n}`]&&(a.skipFactory=!0)}return s}function sb(e,t){return!e||!t?e||t:ve(e)&&ve(t)?e.concat(t):Ue({},Ni(e),Ni(t))}function nb(e,t){const s={};for(const n in e)t.includes(n)||Object.defineProperty(s,n,{enumerable:!0,get:()=>e[n]});return s}function ab(e){const t=Qt(),s=aa;let n=e();Pi(),s&&Da(!1);const a=()=>{Ya(t),s&&Da(!0)},i=()=>{Qt()!==t&&t.scope.off(),Pi(),s&&Da(!1)};return Zo(n)&&(n=n.catch(l=>{throw a(),Promise.resolve().then(()=>Promise.resolve().then(i)),l})),[n,()=>{a(),Promise.resolve().then(i)}]}let xo=!0;function ib(e){const t=fc(e),s=e.proxy,n=e.ctx;xo=!1,t.beforeCreate&&xd(t.beforeCreate,e,"bc");const{data:a,computed:i,methods:l,watch:r,provide:o,inject:c,created:d,beforeMount:u,mounted:p,beforeUpdate:h,updated:v,activated:y,deactivated:R,beforeDestroy:I,beforeUnmount:b,destroyed:g,unmounted:x,render:E,renderTracked:T,renderTriggered:S,errorCaptured:w,serverPrefetch:A,expose:L,inheritAttrs:B,components:F,directives:M,filters:Z}=t;if(c&&lb(c,n,null),l)for(const O in l){const N=l[O];Ae(N)&&(n[O]=N.bind(s))}if(a){const O=a.call(s,s);Je(O)&&(e.data=$n(O))}if(xo=!0,i)for(const O in i){const N=i[O],j=Ae(N)?N.bind(s,s):Ae(N.get)?N.get.bind(s,s):Pt,G=!Ae(N)&&Ae(N.set)?N.set.bind(s):Pt,J=Y({get:j,set:G});Object.defineProperty(n,O,{enumerable:!0,configurable:!0,get:()=>J.value,set:ae=>J.value=ae})}if(r)for(const O in r)ap(r[O],n,s,O);if(o){const O=Ae(o)?o.call(s):o;Reflect.ownKeys(O).forEach(N=>{vi(N,O[N])})}d&&xd(d,e,"c");function U(O,N){ve(N)?N.forEach(j=>O(j.bind(s))):N&&O(N.bind(s))}if(U(Yf,u),U(Ke,p),U(oc,h),U(xr,v),U(Es,y),U(As,R),U(tp,w),U(ep,T),U(Xf,S),U(_r,b),U(bt,x),U(Qf,A),ve(L))if(L.length){const O=e.exposed||(e.exposed={});L.forEach(N=>{Object.defineProperty(O,N,{get:()=>s[N],set:j=>s[N]=j,enumerable:!0})})}else e.exposed||(e.exposed={});E&&e.render===Pt&&(e.render=E),B!=null&&(e.inheritAttrs=B),F&&(e.components=F),M&&(e.directives=M),A&&rc(e)}function lb(e,t,s=Pt){ve(e)&&(e=_o(e));for(const n in e){const a=e[n];let i;Je(a)?"default"in a?i=Ss(a.from||n,a.default,!0):i=Ss(a.from||n):i=Ss(a),kt(i)?Object.defineProperty(t,n,{enumerable:!0,configurable:!0,get:()=>i.value,set:l=>i.value=l}):t[n]=i}}function xd(e,t,s){ps(ve(e)?e.map(n=>n.bind(t.proxy)):e.bind(t.proxy),t,s)}function ap(e,t,s,n){let a=n.includes(".")?jf(s,n):()=>s[n];if(Le(e)){const i=t[e];Ae(i)&&Yt(a,i)}else if(Ae(e))Yt(a,e.bind(s));else if(Je(e))if(ve(e))e.forEach(i=>ap(i,t,s,n));else{const i=Ae(e.handler)?e.handler.bind(s):t[e.handler];Ae(i)&&Yt(a,i,e)}}function fc(e){const t=e.type,{mixins:s,extends:n}=t,{mixins:a,optionsCache:i,config:{optionMergeStrategies:l}}=e.appContext,r=i.get(t);let o;return r?o=r:!a.length&&!s&&!n?o=t:(o={},a.length&&a.forEach(c=>Fl(o,c,l,!0)),Fl(o,t,l)),Je(t)&&i.set(t,o),o}function Fl(e,t,s,n=!1){const{mixins:a,extends:i}=t;i&&Fl(e,i,s,!0),a&&a.forEach(l=>Fl(e,l,s,!0));for(const l in t)if(!(n&&l==="expose")){const r=rb[l]||s&&s[l];e[l]=r?r(e[l],t[l]):t[l]}return e}const rb={data:_d,props:kd,emits:kd,methods:fi,computed:fi,beforeCreate:Gt,created:Gt,beforeMount:Gt,mounted:Gt,beforeUpdate:Gt,updated:Gt,beforeDestroy:Gt,beforeUnmount:Gt,destroyed:Gt,unmounted:Gt,activated:Gt,deactivated:Gt,errorCaptured:Gt,serverPrefetch:Gt,components:fi,directives:fi,watch:cb,provide:_d,inject:ob};function _d(e,t){return t?e?function(){return Ue(Ae(e)?e.call(this,this):e,Ae(t)?t.call(this,this):t)}:t:e}function ob(e,t){return fi(_o(e),_o(t))}function _o(e){if(ve(e)){const t={};for(let s=0;s<e.length;s++)t[e[s]]=e[s];return t}return e}function Gt(e,t){return e?[...new Set([].concat(e,t))]:t}function fi(e,t){return e?Ue(Object.create(null),e,t):t}function kd(e,t){return e?ve(e)&&ve(t)?[...new Set([...e,...t])]:Ue(Object.create(null),Ni(e),Ni(t??{})):t}function cb(e,t){if(!e)return t;if(!t)return e;const s=Ue(Object.create(null),e);for(const n in t)s[n]=Gt(e[n],t[n]);return s}function ip(){return{app:null,config:{isNativeTag:Ta,performance:!1,globalProperties:{},optionMergeStrategies:{},errorHandler:void 0,warnHandler:void 0,compilerOptions:{}},mixins:[],components:{},directives:{},provides:Object.create(null),optionsCache:new WeakMap,propsCache:new WeakMap,emitsCache:new WeakMap}}let db=0;function ub(e,t){return function(n,a=null){Ae(n)||(n=Ue({},n)),a!=null&&!Je(a)&&(a=null);const i=ip(),l=new WeakSet,r=[];let o=!1;const c=i.app={_uid:db++,_component:n,_props:a,_container:null,_context:i,_instance:null,version:$p,get config(){return i.config},set config(d){},use(d,...u){return l.has(d)||(d&&Ae(d.install)?(l.add(d),d.install(c,...u)):Ae(d)&&(l.add(d),d(c,...u))),c},mixin(d){return i.mixins.includes(d)||i.mixins.push(d),c},component(d,u){return u?(i.components[d]=u,c):i.components[d]},directive(d,u){return u?(i.directives[d]=u,c):i.directives[d]},mount(d,u,p){if(!o){const h=c._ceVNode||ut(n,a);return h.appContext=i,p===!0?p="svg":p===!1&&(p=void 0),u&&t?t(h,d):e(h,d,p),o=!0,c._container=d,d.__vue_app__=c,Ji(h.component)}},onUnmount(d){r.push(d)},unmount(){o&&(ps(r,c._instance,16),e(null,c._container),delete c._container.__vue_app__)},provide(d,u){return i.provides[d]=u,c},runWithContext(d){const u=Xn;Xn=c;try{return d()}finally{Xn=u}}};return c}}let Xn=null;function fb(e,t,s=Be){const n=Qt(),a=nt(t),i=is(t),l=lp(e,a),r=Nf((o,c)=>{let d,u=Be,p;return Vf(()=>{const h=e[a];It(d,h)&&(d=h,c())}),{get(){return o(),s.get?s.get(d):d},set(h){const v=s.set?s.set(h):h;if(!It(v,d)&&!(u!==Be&&It(h,u)))return;const y=n.vnode.props,R=!!(y&&(t in y||a in y||i in y)&&(`onUpdate:${t}`in y||`onUpdate:${a}`in y||`onUpdate:${i}`in y));R||(d=h,c()),n.emit(`update:${t}`,v),It(h,u)&&(It(h,v)&&!It(v,p)||R&&u!==Be&&!It(v,d))&&c(),u=h,p=v}}});return r[Symbol.iterator]=()=>{let o=0;return{next(){return o<2?{value:o++?l||Be:r,done:!1}:{done:!0}}}},r}const lp=(e,t)=>t==="modelValue"||t==="model-value"?e.modelModifiers:e[`${t}Modifiers`]||e[`${nt(t)}Modifiers`]||e[`${is(t)}Modifiers`];function pb(e,t,...s){if(e.isUnmounted)return;const n=e.vnode.props||Be;let a=s;const i=t.startsWith("update:"),l=i&&lp(n,t.slice(7));l&&(l.trim&&(a=s.map(d=>Le(d)?d.trim():d)),l.number&&(a=s.map(dr)));let r,o=n[r=Ra(t)]||n[r=Ra(nt(t))];!o&&i&&(o=n[r=Ra(is(t))]),o&&ps(o,e,6,a);const c=n[r+"Once"];if(c){if(!e.emitted)e.emitted={};else if(e.emitted[r])return;e.emitted[r]=!0,ps(c,e,6,a)}}const hb=new WeakMap;function rp(e,t,s=!1){const n=s?hb:t.emitsCache,a=n.get(e);if(a!==void 0)return a;const i=e.emits;let l={},r=!1;if(!Ae(e)){const o=c=>{const d=rp(c,t,!0);d&&(r=!0,Ue(l,d))};!s&&t.mixins.length&&t.mixins.forEach(o),e.extends&&o(e.extends),e.mixins&&e.mixins.forEach(o)}return!i&&!r?(Je(e)&&n.set(e,null),null):(ve(i)?i.forEach(o=>l[o]=null):Ue(l,i),Je(e)&&n.set(e,l),l)}function kr(e,t){return!e||!ra(t)?!1:(t=t.slice(2).replace(/Once$/,""),Ye(e,t[0].toLowerCase()+t.slice(1))||Ye(e,is(t))||Ye(e,t))}function wl(e){const{type:t,vnode:s,proxy:n,withProxy:a,propsOptions:[i],slots:l,attrs:r,emit:o,render:c,renderCache:d,props:u,data:p,setupState:h,ctx:v,inheritAttrs:y}=e,R=Oi(e);let I,b;try{if(s.shapeFlag&4){const x=a||n,E=x;I=as(c.call(E,x,d,u,h,p,v)),b=r}else{const x=t;I=as(x.length>1?x(u,{attrs:r,slots:l,emit:o}):x(u,null)),b=t.props?r:gb(r)}}catch(x){yi.length=0,da(x,e,1),I=ut(vt)}let g=I;if(b&&y!==!1){const x=Object.keys(b),{shapeFlag:E}=g;x.length&&E&7&&(i&&x.some(lr)&&(b=vb(b,i)),g=Ws(g,b,!1,!0))}return s.dirs&&(g=Ws(g,null,!1,!0),g.dirs=g.dirs?g.dirs.concat(s.dirs):s.dirs),s.transition&&vn(g,s.transition),I=g,Oi(R),I}function mb(e,t=!0){let s;for(let n=0;n<e.length;n++){const a=e[n];if(bn(a)){if(a.type!==vt||a.children==="v-if"){if(s)return;s=a}}else return}return s}const gb=e=>{let t;for(const s in e)(s==="class"||s==="style"||ra(s))&&((t||(t={}))[s]=e[s]);return t},vb=(e,t)=>{const s={};for(const n in e)(!lr(n)||!(n.slice(9)in t))&&(s[n]=e[n]);return s};function bb(e,t,s){const{props:n,children:a,component:i}=e,{props:l,children:r,patchFlag:o}=t,c=i.emitsOptions;if(t.dirs||t.transition)return!0;if(s&&o>=0){if(o&1024)return!0;if(o&16)return n?wd(n,l,c):!!l;if(o&8){const d=t.dynamicProps;for(let u=0;u<d.length;u++){const p=d[u];if(op(l,n,p)&&!kr(c,p))return!0}}}else return(a||r)&&(!r||!r.$stable)?!0:n===l?!1:n?l?wd(n,l,c):!0:!!l;return!1}function wd(e,t,s){const n=Object.keys(t);if(n.length!==Object.keys(e).length)return!0;for(let a=0;a<n.length;a++){const i=n[a];if(op(t,e,i)&&!kr(s,i))return!0}return!1}function op(e,t,s){const n=e[s],a=t[s];return s==="style"&&Je(n)&&Je(a)?!hn(n,a):n!==a}function wr({vnode:e,parent:t,suspense:s},n){for(;t;){const a=t.subTree;if(a.suspense&&a.suspense.activeBranch===e&&(a.suspense.vnode.el=a.el=n,e=a),a===e)(e=t.vnode).el=n,t=t.parent;else break}s&&s.activeBranch===e&&(s.vnode.el=n)}const cp={},dp=()=>Object.create(cp),up=e=>Object.getPrototypeOf(e)===cp;function yb(e,t,s,n=!1){const a={},i=dp();e.propsDefaults=Object.create(null),fp(e,t,a,i);for(const l in e.propsOptions[0])l in a||(a[l]=void 0);s?e.props=n?a:ec(a):e.type.props?e.props=a:e.props=i,e.attrs=i}function xb(e,t,s,n){const{props:a,attrs:i,vnode:{patchFlag:l}}=e,r=Ge(a),[o]=e.propsOptions;let c=!1;if((n||l>0)&&!(l&16)){if(l&8){const d=e.vnode.dynamicProps;for(let u=0;u<d.length;u++){let p=d[u];if(kr(e.emitsOptions,p))continue;const h=t[p];if(o)if(Ye(i,p))h!==i[p]&&(i[p]=h,c=!0);else{const v=nt(p);a[v]=ko(o,r,v,h,e,!1)}else h!==i[p]&&(i[p]=h,c=!0)}}}else{fp(e,t,a,i)&&(c=!0);let d;for(const u in r)(!t||!Ye(t,u)&&((d=is(u))===u||!Ye(t,d)))&&(o?s&&(s[u]!==void 0||s[d]!==void 0)&&(a[u]=ko(o,r,u,void 0,e,!0)):delete a[u]);if(i!==r)for(const u in i)(!t||!Ye(t,u))&&(delete i[u],c=!0)}c&&an(e.attrs,"set","")}function fp(e,t,s,n){const[a,i]=e.propsOptions;let l=!1,r;if(t)for(let o in t){if(dn(o))continue;const c=t[o];let d;a&&Ye(a,d=nt(o))?!i||!i.includes(d)?s[d]=c:(r||(r={}))[d]=c:kr(e.emitsOptions,o)||(!(o in n)||c!==n[o])&&(n[o]=c,l=!0)}if(i){const o=Ge(s),c=r||Be;for(let d=0;d<i.length;d++){const u=i[d];s[u]=ko(a,o,u,c[u],e,!Ye(c,u))}}return l}function ko(e,t,s,n,a,i){const l=e[s];if(l!=null){const r=Ye(l,"default");if(r&&n===void 0){const o=l.default;if(l.type!==Function&&!l.skipFactory&&Ae(o)){const{propsDefaults:c}=a;if(s in c)n=c[s];else{const d=Ya(a);n=c[s]=o.call(null,t),d()}}else n=o;a.ce&&a.ce._setProp(s,n)}l[0]&&(i&&!r?n=!1:l[1]&&(n===""||n===is(s))&&(n=!0))}return n}const _b=new WeakMap;function pp(e,t,s=!1){const n=s?_b:t.propsCache,a=n.get(e);if(a)return a;const i=e.props,l={},r=[];let o=!1;if(!Ae(e)){const d=u=>{o=!0;const[p,h]=pp(u,t,!0);Ue(l,p),h&&r.push(...h)};!s&&t.mixins.length&&t.mixins.forEach(d),e.extends&&d(e.extends),e.mixins&&e.mixins.forEach(d)}if(!i&&!o)return Je(e)&&n.set(e,Ea),Ea;if(ve(i))for(let d=0;d<i.length;d++){const u=nt(i[d]);Sd(u)&&(l[u]=Be)}else if(i)for(const d in i){const u=nt(d);if(Sd(u)){const p=i[d],h=l[u]=ve(p)||Ae(p)?{type:p}:Ue({},p),v=h.type;let y=!1,R=!0;if(ve(v))for(let I=0;I<v.length;++I){const b=v[I],g=Ae(b)&&b.name;if(g==="Boolean"){y=!0;break}else g==="String"&&(R=!1)}else y=Ae(v)&&v.name==="Boolean";h[0]=y,h[1]=R,(y||Ye(h,"default"))&&r.push(u)}}const c=[l,r];return Je(e)&&n.set(e,c),c}function Sd(e){return e[0]!=="$"&&!dn(e)}const pc=e=>e==="_"||e==="_ctx"||e==="$stable",hc=e=>ve(e)?e.map(as):[as(e)],kb=(e,t,s)=>{if(t._n)return t;const n=ac((...a)=>hc(t(...a)),s);return n._c=!1,n},hp=(e,t,s)=>{const n=e._ctx;for(const a in e){if(pc(a))continue;const i=e[a];if(Ae(i))t[a]=kb(a,i,n);else if(i!=null){const l=hc(i);t[a]=()=>l}}},mp=(e,t)=>{const s=hc(t);e.slots.default=()=>s},gp=(e,t,s)=>{for(const n in t)(s||!pc(n))&&(e[n]=t[n])},wb=(e,t,s)=>{const n=e.slots=dp();if(e.vnode.shapeFlag&32){const a=t._;a?(gp(n,t,s),s&&of(n,"_",a,!0)):hp(t,n)}else t&&mp(e,t)},Sb=(e,t,s)=>{const{vnode:n,slots:a}=e;let i=!0,l=Be;if(n.shapeFlag&32){const r=t._;r?s&&r===1?i=!1:gp(a,t,s):(i=!t.$stable,hp(t,a)),l=t}else t&&(mp(e,t),l={default:1});if(i)for(const r in a)!pc(r)&&l[r]==null&&delete a[r]},xt=Sp;function vp(e){return yp(e)}function bp(e){return yp(e,wv)}function yp(e,t){const s=ur();s.__VUE__=!0;const{insert:n,remove:a,patchProp:i,createElement:l,createText:r,createComment:o,setText:c,setElementText:d,parentNode:u,nextSibling:p,setScopeId:h=Pt,insertStaticContent:v}=e,y=(_,C,$,X=null,K=null,Q=null,oe=void 0,le=null,ie=!!C.dynamicChildren)=>{if(_===C)return;_&&!Ls(_,C)&&(X=H(_),ae(_,K,Q,!0),_=null),C.patchFlag===-2&&(ie=!1,C.dynamicChildren=null);const{type:se,ref:ye,shapeFlag:fe}=C;switch(se){case Mn:R(_,C,$,X);break;case vt:I(_,C,$,X);break;case ea:_==null&&b(C,$,X,oe);break;case Ot:F(_,C,$,X,K,Q,oe,le,ie);break;default:fe&1?E(_,C,$,X,K,Q,oe,le,ie):fe&6?M(_,C,$,X,K,Q,oe,le,ie):(fe&64||fe&128)&&se.process(_,C,$,X,K,Q,oe,le,ie,be)}ye!=null&&K?Na(ye,_&&_.ref,Q,C||_,!C):ye==null&&_&&_.ref!=null&&Na(_.ref,null,Q,_,!0)},R=(_,C,$,X)=>{if(_==null)n(C.el=r(C.children),$,X);else{const K=C.el=_.el;C.children!==_.children&&c(K,C.children)}},I=(_,C,$,X)=>{_==null?n(C.el=o(C.children||""),$,X):C.el=_.el},b=(_,C,$,X)=>{[_.el,_.anchor]=v(_.children,C,$,X,_.el,_.anchor)},g=({el:_,anchor:C},$,X)=>{let K;for(;_&&_!==C;)K=p(_),n(_,$,X),_=K;n(C,$,X)},x=({el:_,anchor:C})=>{let $;for(;_&&_!==C;)$=p(_),a(_),_=$;a(C)},E=(_,C,$,X,K,Q,oe,le,ie)=>{if(C.type==="svg"?oe="svg":C.type==="math"&&(oe="mathml"),_==null)T(C,$,X,K,Q,oe,le,ie);else{const se=_.el&&_.el._isVueCE?_.el:null;try{se&&se._beginPatch(),A(_,C,K,Q,oe,le,ie)}finally{se&&se._endPatch()}}},T=(_,C,$,X,K,Q,oe,le)=>{let ie,se;const{props:ye,shapeFlag:fe,transition:he,dirs:ke}=_;if(ie=_.el=l(_.type,Q,ye&&ye.is,ye),fe&8?d(ie,_.children):fe&16&&w(_.children,ie,null,X,K,qr(_,Q),oe,le),ke&&zs(_,null,X,"created"),S(ie,_,_.scopeId,oe,X),ye){for(const Ce in ye)Ce!=="value"&&!dn(Ce)&&i(ie,Ce,null,ye[Ce],Q,X);"value"in ye&&i(ie,"value",null,ye.value,Q),(se=ye.onVnodeBeforeMount)&&ss(se,X,_)}ke&&zs(_,null,X,"beforeMount");const Te=xp(K,he);Te&&he.beforeEnter(ie),n(ie,C,$),((se=ye&&ye.onVnodeMounted)||Te||ke)&&xt(()=>{try{se&&ss(se,X,_),Te&&he.enter(ie),ke&&zs(_,null,X,"mounted")}finally{}},K)},S=(_,C,$,X,K)=>{if($&&h(_,$),X)for(let Q=0;Q<X.length;Q++)h(_,X[Q]);if(K){let Q=K.subTree;if(C===Q||Ul(Q.type)&&(Q.ssContent===C||Q.ssFallback===C)){const oe=K.vnode;S(_,oe,oe.scopeId,oe.slotScopeIds,K.parent)}}},w=(_,C,$,X,K,Q,oe,le,ie=0)=>{for(let se=ie;se<_.length;se++){const ye=_[se]=le?sn(_[se]):as(_[se]);y(null,ye,C,$,X,K,Q,oe,le)}},A=(_,C,$,X,K,Q,oe)=>{const le=C.el=_.el;let{patchFlag:ie,dynamicChildren:se,dirs:ye}=C;ie|=_.patchFlag&16;const fe=_.props||Be,he=C.props||Be;let ke;if($&&jn($,!1),(ke=he.onVnodeBeforeUpdate)&&ss(ke,$,C,_),ye&&zs(C,_,$,"beforeUpdate"),$&&jn($,!0),(fe.innerHTML&&he.innerHTML==null||fe.textContent&&he.textContent==null)&&d(le,""),se?L(_.dynamicChildren,se,le,$,X,qr(C,K),Q):oe||N(_,C,le,null,$,X,qr(C,K),Q,!1),ie>0){if(ie&16)B(le,fe,he,$,K);else if(ie&2&&fe.class!==he.class&&i(le,"class",null,he.class,K),ie&4&&i(le,"style",fe.style,he.style,K),ie&8){const Te=C.dynamicProps;for(let Ce=0;Ce<Te.length;Ce++){const Ie=Te[Ce],Pe=fe[Ie],$e=he[Ie];($e!==Pe||Ie==="value")&&i(le,Ie,Pe,$e,K,$)}}ie&1&&_.children!==C.children&&d(le,C.children)}else!oe&&se==null&&B(le,fe,he,$,K);((ke=he.onVnodeUpdated)||ye)&&xt(()=>{ke&&ss(ke,$,C,_),ye&&zs(C,_,$,"updated")},X)},L=(_,C,$,X,K,Q,oe)=>{for(let le=0;le<C.length;le++){const ie=_[le],se=C[le],ye=ie.el&&(ie.type===Ot||!Ls(ie,se)||ie.shapeFlag&198)?u(ie.el):$;y(ie,se,ye,null,X,K,Q,oe,!0)}},B=(_,C,$,X,K)=>{if(C!==$){if(C!==Be)for(const Q in C)!dn(Q)&&!(Q in $)&&i(_,Q,C[Q],null,K,X);for(const Q in $){if(dn(Q))continue;const oe=$[Q],le=C[Q];oe!==le&&Q!=="value"&&i(_,Q,le,oe,K,X)}"value"in $&&i(_,"value",C.value,$.value,K)}},F=(_,C,$,X,K,Q,oe,le,ie)=>{const se=C.el=_?_.el:r(""),ye=C.anchor=_?_.anchor:r("");let{patchFlag:fe,dynamicChildren:he,slotScopeIds:ke}=C;ke&&(le=le?le.concat(ke):ke),_==null?(n(se,$,X),n(ye,$,X),w(C.children||[],$,ye,K,Q,oe,le,ie)):fe>0&&fe&64&&he&&_.dynamicChildren&&_.dynamicChildren.length===he.length?(L(_.dynamicChildren,he,$,K,Q,oe,le),(C.key!=null||K&&C===K.subTree)&&mc(_,C,!0)):N(_,C,$,ye,K,Q,oe,le,ie)},M=(_,C,$,X,K,Q,oe,le,ie)=>{C.slotScopeIds=le,_==null?C.shapeFlag&512?K.ctx.activate(C,$,X,oe,ie):Z(C,$,X,K,Q,oe,ie):ne(_,C,ie)},Z=(_,C,$,X,K,Q,oe)=>{const le=_.component=Op(_,X,K);if(Zi(_)&&(le.ctx.renderer=be),Lp(le,!1,oe),le.asyncDep){if(K&&K.registerDep(le,U,oe),!_.el){const ie=le.subTree=ut(vt);I(null,ie,C,$),_.placeholder=ie.el}}else U(le,_,C,$,K,Q,oe)},ne=(_,C,$)=>{const X=C.component=_.component;if(bb(_,C,$))if(X.asyncDep&&!X.asyncResolved){O(X,C,$);return}else X.next=C,X.update();else C.el=_.el,X.vnode=C},U=(_,C,$,X,K,Q,oe)=>{const le=()=>{if(_.isMounted){let{next:fe,bu:he,u:ke,parent:Te,vnode:Ce}=_;{const z=_p(_);if(z){fe&&(fe.el=Ce.el,O(_,fe,oe)),z.asyncDep.then(()=>{xt(()=>{_.isUnmounted||se()},K)});return}}let Ie=fe,Pe;jn(_,!1),fe?(fe.el=Ce.el,O(_,fe,oe)):fe=Ce,he&&Ia(he),(Pe=fe.props&&fe.props.onVnodeBeforeUpdate)&&ss(Pe,Te,fe,Ce),jn(_,!0);const $e=wl(_),Xe=_.subTree;_.subTree=$e,y(Xe,$e,u(Xe.el),H(Xe),_,K,Q),fe.el=$e.el,Ie===null&&wr(_,$e.el),ke&&xt(ke,K),(Pe=fe.props&&fe.props.onVnodeUpdated)&&xt(()=>ss(Pe,Te,fe,Ce),K)}else{let fe;const{el:he,props:ke}=C,{bm:Te,m:Ce,parent:Ie,root:Pe,type:$e}=_,Xe=fn(C);if(jn(_,!1),Te&&Ia(Te),!Xe&&(fe=ke&&ke.onVnodeBeforeMount)&&ss(fe,Ie,C),jn(_,!0),he&&De){const z=()=>{_.subTree=wl(_),De(he,_.subTree,_,K,null)};Xe&&$e.__asyncHydrate?$e.__asyncHydrate(he,_,z):z()}else{Pe.ce&&Pe.ce._hasShadowRoot()&&Pe.ce._injectChildStyle($e,_.parent?_.parent.type:void 0);const z=_.subTree=wl(_);y(null,z,$,X,_,K,Q),C.el=z.el}if(Ce&&xt(Ce,K),!Xe&&(fe=ke&&ke.onVnodeMounted)){const z=C;xt(()=>ss(fe,Ie,z),K)}(C.shapeFlag&256||Ie&&fn(Ie.vnode)&&Ie.vnode.shapeFlag&256)&&_.a&&xt(_.a,K),_.isMounted=!0,C=$=X=null}};_.scope.on();const ie=_.effect=new Ci(le);_.scope.off();const se=_.update=ie.run.bind(ie),ye=_.job=ie.runIfDirty.bind(ie);ye.i=_,ye.id=_.uid,ie.scheduler=()=>nc(ye),jn(_,!0),se()},O=(_,C,$)=>{C.component=_;const X=_.vnode.props;_.vnode=C,_.next=null,xb(_,C.props,X,$),Sb(_,C.children,$),mn(),ud(_),gn()},N=(_,C,$,X,K,Q,oe,le,ie=!1)=>{const se=_&&_.children,ye=_?_.shapeFlag:0,fe=C.children,{patchFlag:he,shapeFlag:ke}=C;if(he>0){if(he&128){G(se,fe,$,X,K,Q,oe,le,ie);return}else if(he&256){j(se,fe,$,X,K,Q,oe,le,ie);return}}ke&8?(ye&16&&_e(se,K,Q),fe!==se&&d($,fe)):ye&16?ke&16?G(se,fe,$,X,K,Q,oe,le,ie):_e(se,K,Q,!0):(ye&8&&d($,""),ke&16&&w(fe,$,X,K,Q,oe,le,ie))},j=(_,C,$,X,K,Q,oe,le,ie)=>{_=_||Ea,C=C||Ea;const se=_.length,ye=C.length,fe=Math.min(se,ye);let he;for(he=0;he<fe;he++){const ke=C[he]=ie?sn(C[he]):as(C[he]);y(_[he],ke,$,null,K,Q,oe,le,ie)}se>ye?_e(_,K,Q,!0,!1,fe):w(C,$,X,K,Q,oe,le,ie,fe)},G=(_,C,$,X,K,Q,oe,le,ie)=>{let se=0;const ye=C.length;let fe=_.length-1,he=ye-1;for(;se<=fe&&se<=he;){const ke=_[se],Te=C[se]=ie?sn(C[se]):as(C[se]);if(Ls(ke,Te))y(ke,Te,$,null,K,Q,oe,le,ie);else break;se++}for(;se<=fe&&se<=he;){const ke=_[fe],Te=C[he]=ie?sn(C[he]):as(C[he]);if(Ls(ke,Te))y(ke,Te,$,null,K,Q,oe,le,ie);else break;fe--,he--}if(se>fe){if(se<=he){const ke=he+1,Te=ke<ye?C[ke].el:X;for(;se<=he;)y(null,C[se]=ie?sn(C[se]):as(C[se]),$,Te,K,Q,oe,le,ie),se++}}else if(se>he)for(;se<=fe;)ae(_[se],K,Q,!0),se++;else{const ke=se,Te=se,Ce=new Map;for(se=Te;se<=he;se++){const Ne=C[se]=ie?sn(C[se]):as(C[se]);Ne.key!=null&&Ce.set(Ne.key,se)}let Ie,Pe=0;const $e=he-Te+1;let Xe=!1,z=0;const xe=new Array($e);for(se=0;se<$e;se++)xe[se]=0;for(se=ke;se<=fe;se++){const Ne=_[se];if(Pe>=$e){ae(Ne,K,Q,!0);continue}let He;if(Ne.key!=null)He=Ce.get(Ne.key);else for(Ie=Te;Ie<=he;Ie++)if(xe[Ie-Te]===0&&Ls(Ne,C[Ie])){He=Ie;break}He===void 0?ae(Ne,K,Q,!0):(xe[He-Te]=se+1,He>=z?z=He:Xe=!0,y(Ne,C[He],$,null,K,Q,oe,le,ie),Pe++)}const Re=Xe?Tb(xe):Ea;for(Ie=Re.length-1,se=$e-1;se>=0;se--){const Ne=Te+se,He=C[Ne],Ve=C[Ne+1],ft=Ne+1<ye?Ve.el||kp(Ve):X;xe[se]===0?y(null,He,$,ft,K,Q,oe,le,ie):Xe&&(Ie<0||se!==Re[Ie]?J(He,$,ft,2):Ie--)}}},J=(_,C,$,X,K=null)=>{const{el:Q,type:oe,transition:le,children:ie,shapeFlag:se}=_;if(se&6){J(_.component.subTree,C,$,X);return}if(se&128){_.suspense.move(C,$,X);return}if(se&64){oe.move(_,C,$,be);return}if(oe===Ot){n(Q,C,$);for(let fe=0;fe<ie.length;fe++)J(ie[fe],C,$,X);n(_.anchor,C,$);return}if(oe===ea){g(_,C,$);return}if(X!==2&&se&1&&le)if(X===0)le.persisted&&!Q[_s]?n(Q,C,$):(le.beforeEnter(Q),n(Q,C,$),xt(()=>le.enter(Q),K));else{const{leave:fe,delayLeave:he,afterLeave:ke}=le,Te=()=>{_.ctx.isUnmounted?a(Q):n(Q,C,$)},Ce=()=>{const Ie=Q._isLeaving||!!Q[_s];Q._isLeaving&&Q[_s](!0),le.persisted&&!Ie?Te():fe(Q,()=>{Te(),ke&&ke()})};he?he(Q,Te,Ce):Ce()}else n(Q,C,$)},ae=(_,C,$,X=!1,K=!1)=>{const{type:Q,props:oe,ref:le,children:ie,dynamicChildren:se,shapeFlag:ye,patchFlag:fe,dirs:he,cacheIndex:ke,memo:Te}=_;if(fe===-2&&(K=!1),le!=null&&(mn(),Na(le,null,$,_,!0),gn()),ke!=null&&(C.renderCache[ke]=void 0),ye&256){C.ctx.deactivate(_);return}const Ce=ye&1&&he,Ie=!fn(_);let Pe;if(Ie&&(Pe=oe&&oe.onVnodeBeforeUnmount)&&ss(Pe,C,_),ye&6)te(_.component,$,X);else{if(ye&128){_.suspense.unmount($,X);return}Ce&&zs(_,null,C,"beforeUnmount"),ye&64?_.type.remove(_,C,$,be,X):se&&!se.hasOnce&&(Q!==Ot||fe>0&&fe&64)?_e(se,C,$,!1,!0):(Q===Ot&&fe&384||!K&&ye&16)&&_e(ie,C,$),X&&ce(_)}const $e=Te!=null&&ke==null;(Ie&&(Pe=oe&&oe.onVnodeUnmounted)||Ce||$e)&&xt(()=>{Pe&&ss(Pe,C,_),Ce&&zs(_,null,C,"unmounted"),$e&&(_.el=null)},$)},ce=_=>{const{type:C,el:$,anchor:X,transition:K}=_;if(C===Ot){P($,X);return}if(C===ea){x(_);return}const Q=()=>{a($),K&&!K.persisted&&K.afterLeave&&K.afterLeave()};if(_.shapeFlag&1&&K&&!K.persisted){const{leave:oe,delayLeave:le}=K,ie=()=>oe($,Q);le?le(_.el,Q,ie):ie()}else Q()},P=(_,C)=>{let $;for(;_!==C;)$=p(_),a(_),_=$;a(C)},te=(_,C,$)=>{const{bum:X,scope:K,job:Q,subTree:oe,um:le,m:ie,a:se}=_;$l(ie),$l(se),X&&Ia(X),K.stop(),Q&&(Q.flags|=8,ae(oe,_,C,$)),le&&xt(le,C),xt(()=>{_.isUnmounted=!0},C)},_e=(_,C,$,X=!1,K=!1,Q=0)=>{for(let oe=Q;oe<_.length;oe++)ae(_[oe],C,$,X,K)},H=_=>{if(_.shapeFlag&6)return H(_.component.subTree);if(_.shapeFlag&128)return _.suspense.next();const C=p(_.anchor||_.el),$=C&&C[zf];return $?p($):C};let ue=!1;const de=(_,C,$)=>{let X;_==null?C._vnode&&(ae(C._vnode,null,null,!0),X=C._vnode.component):y(C._vnode||null,_,C,null,null,null,$),C._vnode=_,ue||(ue=!0,ud(X),Ml(),ue=!1)},be={p:y,um:ae,m:J,r:ce,mt:Z,mc:w,pc:N,pbc:L,n:H,o:e};let ge,De;return t&&([ge,De]=t(be)),{render:de,hydrate:ge,createApp:ub(de,ge)}}function qr({type:e,props:t},s){return s==="svg"&&e==="foreignObject"||s==="mathml"&&e==="annotation-xml"&&t&&t.encoding&&t.encoding.includes("html")?void 0:s}function jn({effect:e,job:t},s){s?(e.flags|=32,t.flags|=4):(e.flags&=-33,t.flags&=-5)}function xp(e,t){return(!e||e&&!e.pendingBranch)&&t&&!t.persisted}function mc(e,t,s=!1){const n=e.children,a=t.children;if(ve(n)&&ve(a))for(let i=0;i<n.length;i++){const l=n[i];let r=a[i];r.shapeFlag&1&&!r.dynamicChildren&&((r.patchFlag<=0||r.patchFlag===32)&&(r=a[i]=sn(a[i]),r.el=l.el),!s&&r.patchFlag!==-2&&mc(l,r)),r.type===Mn&&(r.patchFlag===-1&&(r=a[i]=sn(r)),r.el=l.el),r.type===vt&&!r.el&&(r.el=l.el)}}function Tb(e){const t=e.slice(),s=[0];let n,a,i,l,r;const o=e.length;for(n=0;n<o;n++){const c=e[n];if(c!==0){if(a=s[s.length-1],e[a]<c){t[n]=a,s.push(n);continue}for(i=0,l=s.length-1;i<l;)r=i+l>>1,e[s[r]]<c?i=r+1:l=r;c<e[s[i]]&&(i>0&&(t[n]=s[i-1]),s[i]=n)}}for(i=s.length,l=s[i-1];i-- >0;)s[i]=l,l=t[l];return s}function _p(e){const t=e.subTree.component;if(t)return t.asyncDep&&!t.asyncResolved?t:_p(t)}function $l(e){if(e)for(let t=0;t<e.length;t++)e[t].flags|=8}function kp(e){if(e.placeholder)return e.placeholder;const t=e.component;return t?kp(t.subTree):null}const Ul=e=>e.__isSuspense;let wo=0;const Cb={name:"Suspense",__isSuspense:!0,process(e,t,s,n,a,i,l,r,o,c){if(e==null)Ab(t,s,n,a,i,l,r,o,c);else{if(i&&i.deps>0&&!e.suspense.isInFallback){t.suspense=e.suspense,t.suspense.vnode=t,t.el=e.el;return}Rb(e,t,s,n,a,l,r,o,c)}},hydrate:Ib,normalize:Ob},Eb=Cb;function Li(e,t){const s=e.props&&e.props[t];Ae(s)&&s()}function Ab(e,t,s,n,a,i,l,r,o){const{p:c,o:{createElement:d}}=o,u=d("div"),p=e.suspense=wp(e,a,n,t,u,s,i,l,r,o);c(null,p.pendingBranch=e.ssContent,u,null,n,p,i,l),p.deps>0?(Li(e,"onPending"),Li(e,"onFallback"),c(null,e.ssFallback,t,s,n,null,i,l),La(p,e.ssFallback)):p.resolve(!1,!0)}function Rb(e,t,s,n,a,i,l,r,{p:o,um:c,o:{createElement:d}}){const u=t.suspense=e.suspense;u.vnode=t,t.el=e.el;const p=t.ssContent,h=t.ssFallback,{activeBranch:v,pendingBranch:y,isInFallback:R,isHydrating:I}=u;if(y)u.pendingBranch=p,Ls(y,p)?(o(y,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():R&&(I||(o(v,h,s,n,a,null,i,l,r),La(u,h)))):(u.pendingId=wo++,I?(u.isHydrating=!1,u.activeBranch=y):c(y,a,u),u.deps=0,u.effects.length=0,u.hiddenContainer=d("div"),R?(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0?u.resolve():(o(v,h,s,n,a,null,i,l,r),La(u,h))):v&&Ls(v,p)?(o(v,p,s,n,a,u,i,l,r),u.resolve(!0)):(o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0&&u.resolve()));else if(v&&Ls(v,p))o(v,p,s,n,a,u,i,l,r),La(u,p);else if(Li(t,"onPending"),u.pendingBranch=p,p.shapeFlag&512?u.pendingId=p.component.suspenseId:u.pendingId=wo++,o(null,p,u.hiddenContainer,null,a,u,i,l,r),u.deps<=0)u.resolve();else{const{timeout:b,pendingId:g}=u;b>0?setTimeout(()=>{u.pendingId===g&&u.fallback(h)},b):b===0&&u.fallback(h)}}function wp(e,t,s,n,a,i,l,r,o,c,d=!1){const{p:u,m:p,um:h,n:v,o:{parentNode:y,remove:R}}=c;let I;const b=Nb(e);b&&t&&t.pendingBranch&&(I=t.pendingId,t.deps++);const g=e.props?Il(e.props.timeout):void 0,x=i,E={vnode:e,parent:t,parentComponent:s,namespace:l,container:n,hiddenContainer:a,deps:0,pendingId:wo++,timeout:typeof g=="number"?g:-1,activeBranch:null,isFallbackMountPending:!1,pendingBranch:null,isInFallback:!d,isHydrating:d,isUnmounted:!1,effects:[],resolve(T=!1,S=!1){const{vnode:w,activeBranch:A,pendingBranch:L,pendingId:B,effects:F,parentComponent:M,container:Z,isInFallback:ne}=E;let U=!1;if(E.isHydrating)E.isHydrating=!1;else if(!T){U=A&&L.transition&&L.transition.mode==="out-in";let j=!1;U&&(A.transition.afterLeave=()=>{B===E.pendingId&&(p(L,Z,i===x&&!j?v(A):i,0),Ri(F),ne&&w.ssFallback&&(w.ssFallback.el=null))}),A&&!E.isFallbackMountPending&&(y(A.el)===Z&&(i=v(A),j=!0),h(A,M,E,!0),!U&&ne&&w.ssFallback&&xt(()=>w.ssFallback.el=null,E)),U||p(L,Z,i,0)}E.isFallbackMountPending=!1,La(E,L),E.pendingBranch=null,E.isInFallback=!1;let O=E.parent,N=!1;for(;O;){if(O.pendingBranch){O.effects.push(...F),N=!0;break}O=O.parent}!N&&!U&&Ri(F),E.effects=[],b&&t&&t.pendingBranch&&I===t.pendingId&&(t.deps--,t.deps===0&&!S&&t.resolve()),Li(w,"onResolve")},fallback(T){if(!E.pendingBranch)return;const{vnode:S,activeBranch:w,parentComponent:A,container:L,namespace:B}=E;Li(S,"onFallback");const F=v(w),M=()=>{E.isFallbackMountPending=!1,E.isInFallback&&(u(null,T,L,F,A,null,B,r,o),La(E,T))},Z=T.transition&&T.transition.mode==="out-in";Z&&(E.isFallbackMountPending=!0,w.transition.afterLeave=M),E.isInFallback=!0,h(w,A,null,!0),Z||M()},move(T,S,w){E.activeBranch&&p(E.activeBranch,T,S,w),E.container=T},next(){return E.activeBranch&&v(E.activeBranch)},registerDep(T,S,w){const A=!!E.pendingBranch;A&&E.deps++;const L=T.vnode.el;T.asyncDep.catch(B=>{da(B,T,0)}).then(B=>{if(T.isUnmounted||E.isUnmounted||E.pendingId!==T.suspenseId)return;Pi(),T.asyncResolved=!0;const{vnode:F}=T;So(T,B,!1),L&&(F.el=L);const M=!L&&T.subTree.el;S(T,F,y(L||T.subTree.el),L?null:v(T.subTree),E,l,w),M&&(F.placeholder=null,R(M)),wr(T,F.el),A&&--E.deps===0&&E.resolve()})},unmount(T,S){E.isUnmounted=!0,E.activeBranch&&h(E.activeBranch,s,T,S),E.pendingBranch&&h(E.pendingBranch,s,T,S)}};return E}function Ib(e,t,s,n,a,i,l,r,o){const c=t.suspense=wp(t,n,s,e.parentNode,document.createElement("div"),null,a,i,l,r,!0),d=o(e,c.pendingBranch=t.ssContent,s,c,i,l);return c.deps===0&&c.resolve(!1,!0),d}function Ob(e){const{shapeFlag:t,children:s}=e,n=t&32;e.ssContent=Td(n?s.default:s),e.ssFallback=n?Td(s.fallback):ut(vt)}function Td(e){let t;if(Ae(e)){const s=na&&e._c;s&&(e._d=!1,Di()),e=e(),s&&(e._d=!0,t=jt,Tp())}return ve(e)&&(e=mb(e)),e=as(e),t&&!e.dynamicChildren&&(e.dynamicChildren=t.filter(s=>s!==e)),e}function Sp(e,t){t&&t.pendingBranch?ve(e)?t.effects.push(...e):t.effects.push(e):Ri(e)}function La(e,t){e.activeBranch=t;const{vnode:s,parentComponent:n}=e;let a=t.el;for(;!a&&t.component;)t=t.component.subTree,a=t.el;s.el=a,n&&n.subTree===s&&(n.vnode.el=a,wr(n,a))}function Nb(e){const t=e.props&&e.props.suspensible;return t!=null&&t!==!1}const Ot=Symbol.for("v-fgt"),Mn=Symbol.for("v-txt"),vt=Symbol.for("v-cmt"),ea=Symbol.for("v-stc"),yi=[];let jt=null;function Di(e=!1){yi.push(jt=e?null:[])}function Tp(){yi.pop(),jt=yi[yi.length-1]||null}let na=1;function Mi(e,t=!1){na+=e,e<0&&jt&&t&&(jt.hasOnce=!0)}function Cp(e){return e.dynamicChildren=na>0?jt||Ea:null,Tp(),na>0&&jt&&jt.push(e),e}function Lb(e,t,s,n,a,i){return Cp(gc(e,t,s,n,a,i,!0))}function Bl(e,t,s,n,a){return Cp(ut(e,t,s,n,a,!0))}function bn(e){return e?e.__v_isVNode===!0:!1}function Ls(e,t){return e.type===t.type&&e.key===t.key}function Db(e){}const Ep=({key:e})=>e??null,Sl=({ref:e,ref_key:t,ref_for:s})=>(typeof e=="number"&&(e=""+e),e!=null?Le(e)||kt(e)||Ae(e)?{i:Mt,r:e,k:t,f:!!s}:e:null);function gc(e,t=null,s=null,n=0,a=null,i=e===Ot?0:1,l=!1,r=!1){const o={__v_isVNode:!0,__v_skip:!0,type:e,props:t,key:t&&Ep(t),ref:t&&Sl(t),scopeId:vr,slotScopeIds:null,children:s,component:null,suspense:null,ssContent:null,ssFallback:null,dirs:null,transition:null,el:null,anchor:null,target:null,targetStart:null,targetAnchor:null,staticCount:0,shapeFlag:i,patchFlag:n,dynamicProps:a,dynamicChildren:null,appContext:null,ctx:Mt};return r?(bc(o,s),i&128&&e.normalize(o)):s&&(o.shapeFlag|=Le(s)?8:16),na>0&&!l&&jt&&(o.patchFlag>0||i&6)&&o.patchFlag!==32&&jt.push(o),o}const ut=Mb;function Mb(e,t=null,s=null,n=0,a=null,i=!1){if((!e||e===sp)&&(e=vt),bn(e)){const r=Ws(e,t,!0);return s&&bc(r,s),na>0&&!i&&jt&&(r.shapeFlag&6?jt[jt.indexOf(e)]=r:jt.push(r)),r.patchFlag=-2,r}if(Vb(e)&&(e=e.__vccOpts),t){t=Ap(t);let{class:r,style:o}=t;r&&!Le(r)&&(t.class=qi(r)),Je(o)&&(Gi(o)&&!ve(o)&&(o=Ue({},o)),t.style=zi(o))}const l=Le(e)?1:Ul(e)?128:qf(e)?64:Je(e)?4:Ae(e)?2:0;return gc(e,t,s,n,a,l,i,!0)}function Ap(e){return e?Gi(e)||up(e)?Ue({},e):e:null}function Ws(e,t,s=!1,n=!1){const{props:a,ref:i,patchFlag:l,children:r,transition:o}=e,c=t?Ip(a||{},t):a,d={__v_isVNode:!0,__v_skip:!0,type:e.type,props:c,key:c&&Ep(c),ref:t&&t.ref?s&&i?ve(i)?i.concat(Sl(t)):[i,Sl(t)]:Sl(t):i,scopeId:e.scopeId,slotScopeIds:e.slotScopeIds,children:r,target:e.target,targetStart:e.targetStart,targetAnchor:e.targetAnchor,staticCount:e.staticCount,shapeFlag:e.shapeFlag,patchFlag:t&&e.type!==Ot?l===-1?16:l|16:l,dynamicProps:e.dynamicProps,dynamicChildren:e.dynamicChildren,appContext:e.appContext,dirs:e.dirs,transition:o,component:e.component,suspense:e.suspense,ssContent:e.ssContent&&Ws(e.ssContent),ssFallback:e.ssFallback&&Ws(e.ssFallback),placeholder:e.placeholder,el:e.el,anchor:e.anchor,ctx:e.ctx,ce:e.ce};return o&&n&&vn(d,o.clone(d)),d}function vc(e=" ",t=0){return ut(Mn,null,e,t)}function Pb(e,t){const s=ut(ea,null,e);return s.staticCount=t,s}function Rp(e="",t=!1){return t?(Di(),Bl(vt,null,e)):ut(vt,null,e)}function as(e){return e==null||typeof e=="boolean"?ut(vt):ve(e)?ut(Ot,null,e.slice()):bn(e)?sn(e):ut(Mn,null,String(e))}function sn(e){return e.el===null&&e.patchFlag!==-1||e.memo?e:Ws(e)}function bc(e,t){let s=0;const{shapeFlag:n}=e;if(t==null)t=null;else if(ve(t))s=16;else if(typeof t=="object")if(n&65){const a=t.default;a&&(a._c&&(a._d=!1),bc(e,a()),a._c&&(a._d=!0));return}else{s=32;const a=t._;!a&&!up(t)?t._ctx=Mt:a===3&&Mt&&(Mt.slots._===1?t._=1:(t._=2,e.patchFlag|=1024))}else Ae(t)?(t={default:t,_ctx:Mt},s=32):(t=String(t),n&64?(s=16,t=[vc(t)]):s=8);e.children=t,e.shapeFlag|=s}function Ip(...e){const t={};for(let s=0;s<e.length;s++){const n=e[s];for(const a in n)if(a==="class")t.class!==n.class&&(t.class=qi([t.class,n.class]));else if(a==="style")t.style=zi([t.style,n.style]);else if(ra(a)){const i=t[a],l=n[a];l&&i!==l&&!(ve(i)&&i.includes(l))?t[a]=i?[].concat(i,l):l:l==null&&i==null&&!lr(a)&&(t[a]=l)}else a!==""&&(t[a]=n[a])}return t}function ss(e,t,s,n=null){ps(e,t,7,[s,n])}const Fb=ip();let $b=0;function Op(e,t,s){const n=e.type,a=(t?t.appContext:e.appContext)||Fb,i={uid:$b++,vnode:e,type:n,parent:t,appContext:a,root:null,next:null,subTree:null,effect:null,update:null,job:null,scope:new Jo(!0),render:null,proxy:null,exposed:null,exposeProxy:null,withProxy:null,provides:t?t.provides:Object.create(a.provides),ids:t?t.ids:["",0,0],accessCache:null,renderCache:[],components:null,directives:null,propsOptions:pp(n,a),emitsOptions:rp(n,a),emit:null,emitted:null,propsDefaults:Be,inheritAttrs:n.inheritAttrs,ctx:Be,data:Be,props:Be,attrs:Be,slots:Be,refs:Be,setupState:Be,setupContext:null,suspense:s,suspenseId:s?s.pendingId:0,asyncDep:null,asyncResolved:!1,isMounted:!1,isUnmounted:!1,isDeactivated:!1,bc:null,c:null,bm:null,m:null,bu:null,u:null,um:null,bum:null,da:null,a:null,rtg:null,rtc:null,ec:null,sp:null};return i.ctx={_:i},i.root=t?t.root:i,i.emit=pb.bind(null,i),e.ce&&e.ce(i),i}let Dt=null;const Qt=()=>Dt||Mt;let Hl,Da;{const e=ur(),t=(s,n)=>{let a;return(a=e[s])||(a=e[s]=[]),a.push(n),i=>{a.length>1?a.forEach(l=>l(i)):a[0](i)}};Hl=t("__VUE_INSTANCE_SETTERS__",s=>Dt=s),Da=t("__VUE_SSR_SETTERS__",s=>aa=s)}const Ya=e=>{const t=Dt;return Hl(e),e.scope.on(),()=>{e.scope.off(),Hl(t)}},Pi=()=>{Dt&&Dt.scope.off(),Hl(null)};function Np(e){return e.vnode.shapeFlag&4}let aa=!1;function Lp(e,t=!1,s=!1){t&&Da(t);const{props:n,children:a}=e.vnode,i=Np(e);yb(e,n,i,t),wb(e,a,s||t);const l=i?Ub(e,t):void 0;return t&&Da(!1),l}function Ub(e,t){const s=e.type;e.accessCache=Object.create(null),e.proxy=new Proxy(e.ctx,yo);const{setup:n}=s;if(n){mn();const a=e.setupContext=n.length>1?Pp(e):null,i=Ya(e),l=Ja(n,e,0,[e.props,a]),r=Zo(l);if(gn(),i(),(r||e.sp)&&!fn(e)&&rc(e),r){if(l.then(Pi,Pi),t)return l.then(o=>{So(e,o,t)}).catch(o=>{da(o,e,0)});e.asyncDep=l}else So(e,l,t)}else Mp(e,t)}function So(e,t,s){Ae(t)?e.type.__ssrInlineRender?e.ssrRender=t:e.render=t:Je(t)&&(e.setupState=sc(t)),Mp(e,s)}let Vl,To;function Dp(e){Vl=e,To=t=>{t.render._rc&&(t.withProxy=new Proxy(t.ctx,qv))}}const Bb=()=>!Vl;function Mp(e,t,s){const n=e.type;if(!e.render){if(!t&&Vl&&!n.render){const a=n.template||fc(e).template;if(a){const{isCustomElement:i,compilerOptions:l}=e.appContext.config,{delimiters:r,compilerOptions:o}=n,c=Ue(Ue({isCustomElement:i,delimiters:r},l),o);n.render=Vl(a,c)}}e.render=n.render||Pt,To&&To(e)}{const a=Ya(e);mn();try{ib(e)}finally{gn(),a()}}}const Hb={get(e,t){return Vt(e,"get",""),e[t]}};function Pp(e){const t=s=>{e.exposed=s||{}};return{attrs:new Proxy(e.attrs,Hb),slots:e.slots,emit:e.emit,expose:t}}function Ji(e){return e.exposed?e.exposeProxy||(e.exposeProxy=new Proxy(sc(If(e.exposed)),{get(t,s){if(s in t)return t[s];if(s in bi)return bi[s](e)},has(t,s){return s in t||s in bi}})):e.proxy}function Co(e,t=!0){return Ae(e)?e.displayName||e.name:e.name||t&&e.__name}function Vb(e){return Ae(e)&&"__vccOpts"in e}const Y=(e,t)=>Wg(e,t,aa);function Ua(e,t,s){try{Mi(-1);const n=arguments.length;return n===2?Je(t)&&!ve(t)?bn(t)?ut(e,null,[t]):ut(e,t):ut(e,null,t):(n>3?s=Array.prototype.slice.call(arguments,2):n===3&&bn(s)&&(s=[s]),ut(e,t,s))}finally{Mi(1)}}function jb(){}function zb(e,t,s,n){const a=s[n];if(a&&Fp(a,e))return a;const i=t();return i.memo=e.slice(),i.cacheIndex=n,s[n]=i}function Fp(e,t){const s=e.memo;if(s.length!=t.length)return!1;for(let n=0;n<s.length;n++)if(It(s[n],t[n]))return!1;return na>0&&jt&&jt.push(e),!0}const $p="3.5.38",qb=Pt,Gb=nv,Kb=ka,Wb=Uf,Zb={createComponentInstance:Op,setupComponent:Lp,renderComponentRoot:wl,setCurrentRenderingInstance:Oi,isVNode:bn,normalizeVNode:as,getComponentPublicInstance:Ji,ensureValidVNode:uc,pushWarningContext:Xg,popWarningContext:ev},Jb=Zb,Yb=null,Qb=null,Xb=null;/**
* @vue/runtime-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/let Eo;const Cd=typeof window<"u"&&window.trustedTypes;if(Cd)try{Eo=Cd.createPolicy("vue",{createHTML:e=>e})}catch{}const Up=Eo?e=>Eo.createHTML(e):e=>e,ey="http://www.w3.org/2000/svg",ty="http://www.w3.org/1998/Math/MathML",tn=typeof document<"u"?document:null,Ed=tn&&tn.createElement("template"),Bp={insert:(e,t,s)=>{t.insertBefore(e,s||null)},remove:e=>{const t=e.parentNode;t&&t.removeChild(e)},createElement:(e,t,s,n)=>{const a=t==="svg"?tn.createElementNS(ey,e):t==="mathml"?tn.createElementNS(ty,e):s?tn.createElement(e,{is:s}):tn.createElement(e);return e==="select"&&n&&n.multiple!=null&&a.setAttribute("multiple",n.multiple),a},createText:e=>tn.createTextNode(e),createComment:e=>tn.createComment(e),setText:(e,t)=>{e.nodeValue=t},setElementText:(e,t)=>{e.textContent=t},parentNode:e=>e.parentNode,nextSibling:e=>e.nextSibling,querySelector:e=>tn.querySelector(e),setScopeId(e,t){e.setAttribute(t,"")},insertStaticContent(e,t,s,n,a,i){const l=s?s.previousSibling:t.lastChild;if(a&&(a===i||a.nextSibling))for(;t.insertBefore(a.cloneNode(!0),s),!(a===i||!(a=a.nextSibling)););else{Ed.innerHTML=Up(n==="svg"?`<svg>${e}</svg>`:n==="mathml"?`<math>${e}</math>`:e);const r=Ed.content;if(n==="svg"||n==="mathml"){const o=r.firstChild;for(;o.firstChild;)r.appendChild(o.firstChild);r.removeChild(o)}t.insertBefore(r,s)}return[l?l.nextSibling:t.firstChild,s?s.previousSibling:t.lastChild]}},Cn="transition",ni="animation",Ba=Symbol("_vtc"),Hp={name:String,type:String,css:{type:Boolean,default:!0},duration:[String,Number,Object],enterFromClass:String,enterActiveClass:String,enterToClass:String,appearFromClass:String,appearActiveClass:String,appearToClass:String,leaveFromClass:String,leaveActiveClass:String,leaveToClass:String},Vp=Ue({},lc,Hp),sy=e=>(e.displayName="Transition",e.props=Vp,e),ny=sy((e,{slots:t})=>Ua(Wf,jp(e),t)),zn=(e,t=[])=>{ve(e)?e.forEach(s=>s(...t)):e&&e(...t)},Ad=e=>e?ve(e)?e.some(t=>t.length>1):e.length>1:!1;function jp(e){const t={};for(const F in e)F in Hp||(t[F]=e[F]);if(e.css===!1)return t;const{name:s="v",type:n,duration:a,enterFromClass:i=`${s}-enter-from`,enterActiveClass:l=`${s}-enter-active`,enterToClass:r=`${s}-enter-to`,appearFromClass:o=i,appearActiveClass:c=l,appearToClass:d=r,leaveFromClass:u=`${s}-leave-from`,leaveActiveClass:p=`${s}-leave-active`,leaveToClass:h=`${s}-leave-to`}=e,v=ay(a),y=v&&v[0],R=v&&v[1],{onBeforeEnter:I,onEnter:b,onEnterCancelled:g,onLeave:x,onLeaveCancelled:E,onBeforeAppear:T=I,onAppear:S=b,onAppearCancelled:w=g}=t,A=(F,M,Z,ne)=>{F._enterCancelled=ne,In(F,M?d:r),In(F,M?c:l),Z&&Z()},L=(F,M)=>{F._isLeaving=!1,In(F,u),In(F,h),In(F,p),M&&M()},B=F=>(M,Z)=>{const ne=F?S:b,U=()=>A(M,F,Z);zn(ne,[M,U]),Rd(()=>{In(M,F?o:i),Bs(M,F?d:r),Ad(ne)||Id(M,n,y,U)})};return Ue(t,{onBeforeEnter(F){zn(I,[F]),Bs(F,i),Bs(F,l)},onBeforeAppear(F){zn(T,[F]),Bs(F,o),Bs(F,c)},onEnter:B(!1),onAppear:B(!0),onLeave(F,M){F._isLeaving=!0;const Z=()=>L(F,M);Bs(F,u),F._enterCancelled?(Bs(F,p),Ao(F)):(Ao(F),Bs(F,p)),Rd(()=>{F._isLeaving&&(In(F,u),Bs(F,h),Ad(x)||Id(F,n,R,Z))}),zn(x,[F,Z])},onEnterCancelled(F){A(F,!1,void 0,!0),zn(g,[F])},onAppearCancelled(F){A(F,!0,void 0,!0),zn(w,[F])},onLeaveCancelled(F){L(F),zn(E,[F])}})}function ay(e){if(e==null)return null;if(Je(e))return[Gr(e.enter),Gr(e.leave)];{const t=Gr(e);return[t,t]}}function Gr(e){return Il(e)}function Bs(e,t){t.split(/\s+/).forEach(s=>s&&e.classList.add(s)),(e[Ba]||(e[Ba]=new Set)).add(t)}function In(e,t){t.split(/\s+/).forEach(n=>n&&e.classList.remove(n));const s=e[Ba];s&&(s.delete(t),s.size||(e[Ba]=void 0))}function Rd(e){requestAnimationFrame(()=>{requestAnimationFrame(e)})}let iy=0;function Id(e,t,s,n){const a=e._endId=++iy,i=()=>{a===e._endId&&n()};if(s!=null)return setTimeout(i,s);const{type:l,timeout:r,propCount:o}=zp(e,t);if(!l)return n();const c=l+"end";let d=0;const u=()=>{e.removeEventListener(c,p),i()},p=h=>{h.target===e&&++d>=o&&u()};setTimeout(()=>{d<o&&u()},r+1),e.addEventListener(c,p)}function zp(e,t){const s=window.getComputedStyle(e),n=v=>(s[v]||"").split(", "),a=n(`${Cn}Delay`),i=n(`${Cn}Duration`),l=Od(a,i),r=n(`${ni}Delay`),o=n(`${ni}Duration`),c=Od(r,o);let d=null,u=0,p=0;t===Cn?l>0&&(d=Cn,u=l,p=i.length):t===ni?c>0&&(d=ni,u=c,p=o.length):(u=Math.max(l,c),d=u>0?l>c?Cn:ni:null,p=d?d===Cn?i.length:o.length:0);const h=d===Cn&&/\b(?:transform|all)(?:,|$)/.test(n(`${Cn}Property`).toString());return{type:d,timeout:u,propCount:p,hasTransform:h}}function Od(e,t){for(;e.length<t.length;)e=e.concat(e);return Math.max(...t.map((s,n)=>Nd(s)+Nd(e[n])))}function Nd(e){return e==="auto"?0:Number(e.slice(0,-1).replace(",","."))*1e3}function Ao(e){return(e?e.ownerDocument:document).body.offsetHeight}function ly(e,t,s){const n=e[Ba];n&&(t=(t?[t,...n]:[...n]).join(" ")),t==null?e.removeAttribute("class"):s?e.setAttribute("class",t):e.className=t}const jl=Symbol("_vod"),yc=Symbol("_vsh"),qp={name:"show",beforeMount(e,{value:t},{transition:s}){e[jl]=e.style.display==="none"?"":e.style.display,s&&t?s.beforeEnter(e):ai(e,t)},mounted(e,{value:t},{transition:s}){s&&t&&s.enter(e)},updated(e,{value:t,oldValue:s},{transition:n}){!t!=!s&&(n?t?(n.beforeEnter(e),ai(e,!0),n.enter(e)):n.leave(e,()=>{ai(e,!1)}):ai(e,t))},beforeUnmount(e,{value:t}){ai(e,t)}};function ai(e,t){e.style.display=t?e[jl]:"none",e[yc]=!t}function ry(){qp.getSSRProps=({value:e})=>{if(!e)return{style:{display:"none"}}}}const Gp=Symbol("");function oy(e){const t=Qt();if(!t)return;const s=t.ut=(a=e(t.proxy))=>{Array.from(document.querySelectorAll(`[data-v-owner="${t.uid}"]`)).forEach(i=>zl(i,a))},n=()=>{const a=e(t.proxy);t.ce?zl(t.ce,a):Ro(t.subTree,a),s(a)};oc(()=>{Ri(n)}),Ke(()=>{Yt(n,Pt,{flush:"post"});const a=new MutationObserver(n);a.observe(t.subTree.el.parentNode,{childList:!0}),bt(()=>a.disconnect())})}function Ro(e,t){if(e.shapeFlag&128){const s=e.suspense;e=s.activeBranch,s.pendingBranch&&!s.isHydrating&&s.effects.push(()=>{Ro(s.activeBranch,t)})}for(;e.component;)e=e.component.subTree;if(e.shapeFlag&1&&e.el)zl(e.el,t);else if(e.type===Ot)e.children.forEach(s=>Ro(s,t));else if(e.type===ea){let{el:s,anchor:n}=e;for(;s&&(zl(s,t),s!==n);)s=s.nextSibling}}function zl(e,t){if(e.nodeType===1){const s=e.style;let n="";for(const a in t){const i=hg(t[a]);s.setProperty(`--${a}`,i),n+=`--${a}: ${i};`}s[Gp]=n}}const cy=/(?:^|;)\s*display\s*:/;function dy(e,t,s){const n=e.style,a=Le(s);let i=!1;if(s&&!a){if(t)if(Le(t))for(const l of t.split(";")){const r=l.slice(0,l.indexOf(":")).trim();s[r]==null&&pi(n,r,"")}else for(const l in t)s[l]==null&&pi(n,l,"");for(const l in s){l==="display"&&(i=!0);const r=s[l];r!=null?fy(e,l,!Le(t)&&t?t[l]:void 0,r)||pi(n,l,r):pi(n,l,"")}}else if(a){if(t!==s){const l=n[Gp];l&&(s+=";"+l),n.cssText=s,i=cy.test(s)}}else t&&e.removeAttribute("style");jl in e&&(e[jl]=i?n.display:"",e[yc]&&(n.display="none"))}const Ld=/\s*!important$/;function pi(e,t,s){if(ve(s))s.forEach(n=>pi(e,t,n));else if(s==null&&(s=""),t.startsWith("--"))e.setProperty(t,s);else{const n=uy(e,t);Ld.test(s)?e.setProperty(is(n),s.replace(Ld,""),"important"):e[n]=s}}const Dd=["Webkit","Moz","ms"],Kr={};function uy(e,t){const s=Kr[t];if(s)return s;let n=nt(t);if(n!=="filter"&&n in e)return Kr[t]=n;n=ca(n);for(let a=0;a<Dd.length;a++){const i=Dd[a]+n;if(i in e)return Kr[t]=i}return t}function fy(e,t,s,n){return e.tagName==="TEXTAREA"&&(t==="width"||t==="height")&&Le(n)&&s===n}const Md="http://www.w3.org/1999/xlink";function Pd(e,t,s,n,a,i=fg(t)){n&&t.startsWith("xlink:")?s==null?e.removeAttributeNS(Md,t.slice(6,t.length)):e.setAttributeNS(Md,t,s):s==null||i&&!df(s)?e.removeAttribute(t):e.setAttribute(t,i?"":qt(s)?String(s):s)}function Fd(e,t,s,n,a){if(t==="innerHTML"||t==="textContent"){s!=null&&(e[t]=t==="innerHTML"?Up(s):s);return}const i=e.tagName;if(t==="value"&&i!=="PROGRESS"&&!i.includes("-")){const r=i==="OPTION"?e.getAttribute("value")||"":e.value,o=s==null?e.type==="checkbox"?"on":"":String(s);(r!==o||!("_value"in e))&&(e.value=o),s==null&&e.removeAttribute(t),e._value=s;return}let l=!1;if(s===""||s==null){const r=typeof e[t];r==="boolean"?s=df(s):s==null&&r==="string"?(s="",l=!0):r==="number"&&(s=0,l=!0)}try{e[t]=s}catch{}l&&e.removeAttribute(a||t)}function rn(e,t,s,n){e.addEventListener(t,s,n)}function py(e,t,s,n){e.removeEventListener(t,s,n)}const $d=Symbol("_vei");function hy(e,t,s,n,a=null){const i=e[$d]||(e[$d]={}),l=i[t];if(n&&l)l.value=n;else{const[r,o]=my(t);if(n){const c=i[t]=by(n,a);rn(e,r,c,o)}else l&&(py(e,r,l,o),i[t]=void 0)}}const Ud=/(?:Once|Passive|Capture)$/;function my(e){let t;if(Ud.test(e)){t={};let n;for(;n=e.match(Ud);)e=e.slice(0,e.length-n[0].length),t[n[0].toLowerCase()]=!0}return[e[2]===":"?e.slice(3):is(e.slice(2)),t]}let Wr=0;const gy=Promise.resolve(),vy=()=>Wr||(gy.then(()=>Wr=0),Wr=Date.now());function by(e,t){const s=n=>{if(!n._vts)n._vts=Date.now();else if(n._vts<=s.attached)return;const a=s.value;if(ve(a)){const i=n.stopImmediatePropagation;n.stopImmediatePropagation=()=>{i.call(n),n._stopped=!0};const l=a.slice(),r=[n];for(let o=0;o<l.length&&!n._stopped;o++){const c=l[o];c&&ps(c,t,5,r)}}else ps(a,t,5,[n])};return s.value=e,s.attached=vy(),s}const Bd=e=>e.charCodeAt(0)===111&&e.charCodeAt(1)===110&&e.charCodeAt(2)>96&&e.charCodeAt(2)<123,Kp=(e,t,s,n,a,i)=>{const l=a==="svg";t==="class"?ly(e,n,l):t==="style"?dy(e,s,n):ra(t)?lr(t)||hy(e,t,s,n,i):(t[0]==="."?(t=t.slice(1),!0):t[0]==="^"?(t=t.slice(1),!1):yy(e,t,n,l))?(Fd(e,t,n),!e.tagName.includes("-")&&(t==="value"||t==="checked"||t==="selected")&&Pd(e,t,n,l,i,t!=="value")):e._isVueCE&&(xy(e,t)||e._def.__asyncLoader&&(/[A-Z]/.test(t)||!Le(n)))?Fd(e,nt(t),n,i,t):(t==="true-value"?e._trueValue=n:t==="false-value"&&(e._falseValue=n),Pd(e,t,n,l))};function yy(e,t,s,n){if(n)return!!(t==="innerHTML"||t==="textContent"||t in e&&Bd(t)&&Ae(s));if(t==="spellcheck"||t==="draggable"||t==="translate"||t==="autocorrect"||t==="sandbox"&&e.tagName==="IFRAME"||t==="form"||t==="list"&&e.tagName==="INPUT"||t==="type"&&e.tagName==="TEXTAREA")return!1;if(t==="width"||t==="height"){const a=e.tagName;if(a==="IMG"||a==="VIDEO"||a==="CANVAS"||a==="SOURCE")return!1}return Bd(t)&&Le(s)?!1:t in e}function xy(e,t){const s=e._def.props;if(!s)return!1;const n=nt(t);return Array.isArray(s)?s.some(a=>nt(a)===n):Object.keys(s).some(a=>nt(a)===n)}const Hd={};function Wp(e,t,s){let n=Wi(e,t);rr(n)&&(n=Ue({},n,t));class a extends Sr{constructor(l){super(n,l,s)}}return a.def=n,a}const _y=((e,t)=>Wp(e,t,rh)),ky=typeof HTMLElement<"u"?HTMLElement:class{};class Sr extends ky{constructor(t,s={},n=Kl){super(),this._def=t,this._props=s,this._createApp=n,this._isVueCE=!0,this._instance=null,this._app=null,this._nonce=this._def.nonce,this._connected=!1,this._resolved=!1,this._patching=!1,this._dirty=!1,this._numberProps=null,this._styleChildren=new WeakSet,this._styleAnchors=new WeakMap,this._ob=null,this.shadowRoot&&n!==Kl?this._root=this.shadowRoot:t.shadowRoot!==!1?(this.attachShadow(Ue({},t.shadowRootOptions,{mode:"open"})),this._root=this.shadowRoot):this._root=this}connectedCallback(){if(!this.isConnected)return;!this.shadowRoot&&!this._resolved&&this._parseSlots(),this._connected=!0;let t=this;for(;t=t&&(t.assignedSlot||t.parentNode||t.host);)if(t instanceof Sr){this._parent=t;break}this._instance||(this._resolved?this._mount(this._def):t&&t._pendingResolve?this._pendingResolve=t._pendingResolve.then(()=>{this._pendingResolve=void 0,this._resolveDef()}):this._resolveDef())}_setParent(t=this._parent){t&&(this._instance.parent=t._instance,this._inheritParentContext(t))}_inheritParentContext(t=this._parent){t&&this._app&&Object.setPrototypeOf(this._app._context.provides,t._instance.provides)}disconnectedCallback(){this._connected=!1,Ct(()=>{this._connected||(this._ob&&(this._ob.disconnect(),this._ob=null),this._app&&this._app.unmount(),this._instance&&(this._instance.ce=void 0),this._app=this._instance=null,this._teleportTargets&&(this._teleportTargets.clear(),this._teleportTargets=void 0))})}_processMutations(t){for(const s of t)this._setAttr(s.attributeName)}_resolveDef(){if(this._pendingResolve)return;for(let n=0;n<this.attributes.length;n++)this._setAttr(this.attributes[n].name);this._ob=new MutationObserver(this._processMutations.bind(this)),this._ob.observe(this,{attributes:!0});const t=(n,a=!1)=>{this._resolved=!0,this._pendingResolve=void 0;const{props:i,styles:l}=n;let r;if(i&&!ve(i))for(const o in i){const c=i[o];(c===Number||c&&c.type===Number)&&(o in this._props&&(this._props[o]=Il(this._props[o])),(r||(r=Object.create(null)))[nt(o)]=!0)}this._numberProps=r,this._resolveProps(n),this.shadowRoot&&this._applyStyles(l),this._mount(n)},s=this._def.__asyncLoader;s?this._pendingResolve=s().then(n=>{n.configureApp=this._def.configureApp,t(this._def=n,!0)}):t(this._def)}_mount(t){this._app=this._createApp(t),this._inheritParentContext(),t.configureApp&&t.configureApp(this._app),this._app._ceVNode=this._createVNode(),this._app.mount(this._root);const s=this._instance&&this._instance.exposed;if(s)for(const n in s)Ye(this,n)||Object.defineProperty(this,n,{get:()=>Gs(s[n])})}_resolveProps(t){const{props:s}=t,n=ve(s)?s:Object.keys(s||{});for(const a of Object.keys(this))a[0]!=="_"&&n.includes(a)&&this._setProp(a,this[a]);for(const a of n.map(nt))Object.defineProperty(this,a,{get(){return this._getProp(a)},set(i){this._setProp(a,i,!0,!this._patching)}})}_setAttr(t){if(t.startsWith("data-v-"))return;const s=this.hasAttribute(t);let n=s?this.getAttribute(t):Hd;const a=nt(t);s&&this._numberProps&&this._numberProps[a]&&(n=Il(n)),this._setProp(a,n,!1,!0)}_getProp(t){return this._props[t]}_setProp(t,s,n=!0,a=!1){if(s!==this._props[t]&&(this._dirty=!0,s===Hd?delete this._props[t]:(this._props[t]=s,t==="key"&&this._app&&(this._app._ceVNode.key=s)),a&&this._instance&&this._update(),n)){const i=this._ob;i&&(this._processMutations(i.takeRecords()),i.disconnect()),s===!0?this.setAttribute(is(t),""):typeof s=="string"||typeof s=="number"?this.setAttribute(is(t),s+""):s||this.removeAttribute(is(t)),i&&i.observe(this,{attributes:!0})}}_update(){const t=this._createVNode();this._app&&(t.appContext=this._app._context),lh(t,this._root)}_createVNode(){const t={};this.shadowRoot||(t.onVnodeMounted=t.onVnodeUpdated=this._renderSlots.bind(this));const s=ut(this._def,Ue(t,this._props));return this._instance||(s.ce=n=>{this._instance=n,n.ce=this,n.isCE=!0;const a=(i,l)=>{this.dispatchEvent(new CustomEvent(i,rr(l[0])?Ue({detail:l},l[0]):{detail:l}))};n.emit=(i,...l)=>{a(i,l),is(i)!==i&&a(is(i),l)},this._setParent()}),s}_applyStyles(t,s,n){if(!t)return;if(s){if(s===this._def||this._styleChildren.has(s))return;this._styleChildren.add(s)}const a=this._nonce,i=this.shadowRoot,l=n?this._getStyleAnchor(n)||this._getStyleAnchor(this._def):this._getRootStyleInsertionAnchor(i);let r=null;for(let o=t.length-1;o>=0;o--){const c=document.createElement("style");a&&c.setAttribute("nonce",a),c.textContent=t[o],i.insertBefore(c,r||l),r=c,o===0&&(n||this._styleAnchors.set(this._def,c),s&&this._styleAnchors.set(s,c))}}_getStyleAnchor(t){if(!t)return null;const s=this._styleAnchors.get(t);return s&&s.parentNode===this.shadowRoot?s:(s&&this._styleAnchors.delete(t),null)}_getRootStyleInsertionAnchor(t){for(let s=0;s<t.childNodes.length;s++){const n=t.childNodes[s];if(!(n instanceof HTMLStyleElement))return n}return null}_parseSlots(){const t=this._slots={};let s;for(;s=this.firstChild;){const n=s.nodeType===1&&s.getAttribute("slot")||"default";(t[n]||(t[n]=[])).push(s),this.removeChild(s)}}_renderSlots(){const t=this._getSlots(),s=this._instance.type.__scopeId;for(let n=0;n<t.length;n++){const a=t[n],i=a.getAttribute("name")||"default",l=this._slots[i],r=a.parentNode;if(l)for(const o of l){if(s&&o.nodeType===1){const c=s+"-s",d=document.createTreeWalker(o,1);o.setAttribute(c,"");let u;for(;u=d.nextNode();)u.setAttribute(c,"")}r.insertBefore(o,a)}else for(;a.firstChild;)r.insertBefore(a.firstChild,a);r.removeChild(a)}}_getSlots(){const t=[this];this._teleportTargets&&t.push(...this._teleportTargets);const s=new Set;for(const n of t){const a=n.querySelectorAll("slot");for(let i=0;i<a.length;i++)s.add(a[i])}return Array.from(s)}_injectChildStyle(t,s){this._applyStyles(t.styles,t,s)}_beginPatch(){this._patching=!0,this._dirty=!1}_endPatch(){this._patching=!1,this._dirty&&this._instance&&this._update()}_hasShadowRoot(){return this._def.shadowRoot!==!1}_removeChildStyle(t){}}function Zp(e){const t=Qt(),s=t&&t.ce;return s||null}function wy(){const e=Zp();return e&&e.shadowRoot}function Sy(e="$style"){{const t=Qt();if(!t)return Be;const s=t.type.__cssModules;if(!s)return Be;const n=s[e];return n||Be}}const Jp=new WeakMap,Yp=new WeakMap,ql=Symbol("_moveCb"),Vd=Symbol("_enterCb"),Ty=e=>(delete e.props.mode,e),Cy=Ty({name:"TransitionGroup",props:Ue({},Vp,{tag:String,moveClass:String}),setup(e,{slots:t}){const s=Qt(),n=ic();let a,i;return xr(()=>{if(!a.length)return;const l=e.moveClass||`${e.name||"v"}-move`;if(!Oy(a[0].el,s.vnode.el,l)){a=[];return}a.forEach(Ay),a.forEach(Ry);const r=a.filter(Iy);Ao(s.vnode.el),r.forEach(o=>{const c=o.el,d=c.style;Bs(c,l),d.transform=d.webkitTransform=d.transitionDuration="";const u=c[ql]=p=>{p&&p.target!==c||(!p||p.propertyName.endsWith("transform"))&&(c.removeEventListener("transitionend",u),c[ql]=null,In(c,l))};c.addEventListener("transitionend",u)}),a=[]}),()=>{const l=Ge(e),r=jp(l);let o=l.tag||Ot;if(a=[],i)for(let c=0;c<i.length;c++){const d=i[c];d.el&&d.el instanceof Element&&!d.el[yc]&&(a.push(d),vn(d,$a(d,r,n,s)),Jp.set(d,Qp(d.el)))}i=t.default?br(t.default()):[];for(let c=0;c<i.length;c++){const d=i[c];d.key!=null&&vn(d,$a(d,r,n,s))}return ut(o,null,i)}}}),Ey=Cy;function Ay(e){const t=e.el;t[ql]&&t[ql](),t[Vd]&&t[Vd]()}function Ry(e){Yp.set(e,Qp(e.el))}function Iy(e){const t=Jp.get(e),s=Yp.get(e),n=t.left-s.left,a=t.top-s.top;if(n||a){const i=e.el,l=i.style,r=i.getBoundingClientRect();let o=1,c=1;return i.offsetWidth&&(o=r.width/i.offsetWidth),i.offsetHeight&&(c=r.height/i.offsetHeight),(!Number.isFinite(o)||o===0)&&(o=1),(!Number.isFinite(c)||c===0)&&(c=1),Math.abs(o-1)<.01&&(o=1),Math.abs(c-1)<.01&&(c=1),l.transform=l.webkitTransform=`translate(${n/o}px,${a/c}px)`,l.transitionDuration="0s",e}}function Qp(e){const t=e.getBoundingClientRect();return{left:t.left,top:t.top}}function Oy(e,t,s){const n=e.cloneNode(),a=e[Ba];a&&a.forEach(r=>{r.split(/\s+/).forEach(o=>o&&n.classList.remove(o))}),s.split(/\s+/).forEach(r=>r&&n.classList.add(r)),n.style.display="none";const i=t.nodeType===1?t:t.parentNode;i.appendChild(n);const{hasTransform:l}=zp(n);return i.removeChild(n),l}const Fn=e=>{const t=e.props["onUpdate:modelValue"]||!1;return ve(t)?s=>Ia(t,s):t};function Ny(e){e.target.composing=!0}function jd(e){const t=e.target;t.composing&&(t.composing=!1,t.dispatchEvent(new Event("input")))}const Ts=Symbol("_assign");function zd(e,t,s){return t&&(e=e.trim()),s&&(e=dr(e)),e}const Gl={created(e,{modifiers:{lazy:t,trim:s,number:n}},a){e[Ts]=Fn(a);const i=n||a.props&&a.props.type==="number";rn(e,t?"change":"input",l=>{l.target.composing||e[Ts](zd(e.value,s,i))}),(s||i)&&rn(e,"change",()=>{e.value=zd(e.value,s,i)}),t||(rn(e,"compositionstart",Ny),rn(e,"compositionend",jd),rn(e,"change",jd))},mounted(e,{value:t}){e.value=t??""},beforeUpdate(e,{value:t,oldValue:s,modifiers:{lazy:n,trim:a,number:i}},l){if(e[Ts]=Fn(l),e.composing)return;const r=(i||e.type==="number")&&!/^0\d/.test(e.value)?dr(e.value):e.value,o=t??"";if(r===o)return;const c=e.getRootNode();(c instanceof Document||c instanceof ShadowRoot)&&c.activeElement===e&&e.type!=="range"&&(n&&t===s||a&&e.value.trim()===o)||(e.value=o)}},xc={deep:!0,created(e,t,s){e[Ts]=Fn(s),rn(e,"change",()=>{const n=e._modelValue,a=Ha(e),i=e.checked,l=e[Ts];if(ve(n)){const r=fr(n,a),o=r!==-1;if(i&&!o)l(n.concat(a));else if(!i&&o){const c=[...n];c.splice(r,1),l(c)}}else if(oa(n)){const r=new Set(n);i?r.add(a):r.delete(a),l(r)}else l(eh(e,i))})},mounted:qd,beforeUpdate(e,t,s){e[Ts]=Fn(s),qd(e,t,s)}};function qd(e,{value:t,oldValue:s},n){e._modelValue=t;let a;if(ve(t))a=fr(t,n.props.value)>-1;else if(oa(t))a=t.has(n.props.value);else{if(t===s)return;a=hn(t,eh(e,!0))}e.checked!==a&&(e.checked=a)}const _c={created(e,{value:t},s){e.checked=hn(t,s.props.value),e[Ts]=Fn(s),rn(e,"change",()=>{e[Ts](Ha(e))})},beforeUpdate(e,{value:t,oldValue:s},n){e[Ts]=Fn(n),t!==s&&(e.checked=hn(t,n.props.value))}},Xp={deep:!0,created(e,{value:t,modifiers:{number:s}},n){const a=oa(t);rn(e,"change",()=>{const i=Array.prototype.filter.call(e.options,l=>l.selected).map(l=>s?dr(Ha(l)):Ha(l));e[Ts](e.multiple?a?new Set(i):i:i[0]),e._assigning=!0,Ct(()=>{e._assigning=!1})}),e[Ts]=Fn(n)},mounted(e,{value:t}){Gd(e,t)},beforeUpdate(e,t,s){e[Ts]=Fn(s)},updated(e,{value:t}){e._assigning||Gd(e,t)}};function Gd(e,t){const s=e.multiple,n=ve(t);if(!(s&&!n&&!oa(t))){for(let a=0,i=e.options.length;a<i;a++){const l=e.options[a],r=Ha(l);if(s)if(n){const o=typeof r;o==="string"||o==="number"?l.selected=t.some(c=>String(c)===String(r)):l.selected=fr(t,r)>-1}else l.selected=t.has(r);else if(hn(Ha(l),t)){e.selectedIndex!==a&&(e.selectedIndex=a);return}}!s&&e.selectedIndex!==-1&&(e.selectedIndex=-1)}}function Ha(e){return"_value"in e?e._value:e.value}function eh(e,t){const s=t?"_trueValue":"_falseValue";return s in e?e[s]:t}const th={created(e,t,s){ml(e,t,s,null,"created")},mounted(e,t,s){ml(e,t,s,null,"mounted")},beforeUpdate(e,t,s,n){ml(e,t,s,n,"beforeUpdate")},updated(e,t,s,n){ml(e,t,s,n,"updated")}};function sh(e,t){switch(e){case"SELECT":return Xp;case"TEXTAREA":return Gl;default:switch(t){case"checkbox":return xc;case"radio":return _c;default:return Gl}}}function ml(e,t,s,n,a){const l=sh(e.tagName,s.props&&s.props.type)[a];l&&l(e,t,s,n)}function Ly(){Gl.getSSRProps=({value:e})=>({value:e}),_c.getSSRProps=({value:e},t)=>{if(t.props&&hn(t.props.value,e))return{checked:!0}},xc.getSSRProps=({value:e},t)=>{if(ve(e)){if(t.props&&fr(e,t.props.value)>-1)return{checked:!0}}else if(oa(e)){if(t.props&&e.has(t.props.value))return{checked:!0}}else if(e)return{checked:!0}},th.getSSRProps=(e,t)=>{if(typeof t.type!="string")return;const s=sh(t.type.toUpperCase(),t.props&&t.props.type);if(s.getSSRProps)return s.getSSRProps(e,t)}}const Dy=["ctrl","shift","alt","meta"],My={stop:e=>e.stopPropagation(),prevent:e=>e.preventDefault(),self:e=>e.target!==e.currentTarget,ctrl:e=>!e.ctrlKey,shift:e=>!e.shiftKey,alt:e=>!e.altKey,meta:e=>!e.metaKey,left:e=>"button"in e&&e.button!==0,middle:e=>"button"in e&&e.button!==1,right:e=>"button"in e&&e.button!==2,exact:(e,t)=>Dy.some(s=>e[`${s}Key`]&&!t.includes(s))},Py=(e,t)=>{if(!e)return e;const s=e._withMods||(e._withMods={}),n=t.join(".");return s[n]||(s[n]=((a,...i)=>{for(let l=0;l<t.length;l++){const r=My[t[l]];if(r&&r(a,t))return}return e(a,...i)}))},Fy={esc:"escape",space:" ",up:"arrow-up",left:"arrow-left",right:"arrow-right",down:"arrow-down",delete:"backspace"},$y=(e,t)=>{const s=e._withKeys||(e._withKeys={}),n=t.join(".");return s[n]||(s[n]=(a=>{if(!("key"in a))return;const i=is(a.key);if(t.some(l=>l===i||Fy[l]===i))return e(a)}))},nh=Ue({patchProp:Kp},Bp);let xi,Kd=!1;function ah(){return xi||(xi=vp(nh))}function ih(){return xi=Kd?xi:bp(nh),Kd=!0,xi}const lh=((...e)=>{ah().render(...e)}),Uy=((...e)=>{ih().hydrate(...e)}),Kl=((...e)=>{const t=ah().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ch(n);if(!a)return;const i=t._component;!Ae(i)&&!i.render&&!i.template&&(i.template=a.innerHTML),a.nodeType===1&&(a.textContent="");const l=s(a,!1,oh(a));return a instanceof Element&&(a.removeAttribute("v-cloak"),a.setAttribute("data-v-app","")),l},t}),rh=((...e)=>{const t=ih().createApp(...e),{mount:s}=t;return t.mount=n=>{const a=ch(n);if(a)return s(a,!0,oh(a))},t});function oh(e){if(e instanceof SVGElement)return"svg";if(typeof MathMLElement=="function"&&e instanceof MathMLElement)return"mathml"}function ch(e){return Le(e)?document.querySelector(e):e}let Wd=!1;const By=()=>{Wd||(Wd=!0,Ly(),ry())},Hy=Object.freeze(Object.defineProperty({__proto__:null,BaseTransition:Wf,BaseTransitionPropsValidators:lc,Comment:vt,DeprecationTypes:Xb,EffectScope:Jo,ErrorCodes:sv,ErrorTypeStrings:Gb,Fragment:Ot,KeepAlive:Mv,ReactiveEffect:Ci,Static:ea,Suspense:Eb,Teleport:vv,Text:Mn,TrackOpTypes:Zg,Transition:ny,TransitionGroup:Ey,TriggerOpTypes:Jg,VueElement:Sr,assertNumber:tv,callWithAsyncErrorHandling:ps,callWithErrorHandling:Ja,camelize:nt,capitalize:ca,cloneVNode:Ws,compatUtils:Qb,computed:Y,createApp:Kl,createBlock:Bl,createCommentVNode:Rp,createElementBlock:Lb,createElementVNode:gc,createHydrationRenderer:bp,createPropsRestProxy:nb,createRenderer:vp,createSSRApp:rh,createSlots:Vv,createStaticVNode:Pb,createTextVNode:vc,createVNode:ut,customRef:Nf,defineAsyncComponent:Lv,defineComponent:Wi,defineCustomElement:Wp,defineEmits:Kv,defineExpose:Wv,defineModel:Yv,defineOptions:Zv,defineProps:Gv,defineSSRCustomElement:_y,defineSlots:Jv,devtools:Kb,effect:bg,effectScope:mg,getCurrentInstance:Qt,getCurrentScope:hf,getCurrentWatcher:Yg,getTransitionRawChildren:br,guardReactiveProps:Ap,h:Ua,handleError:da,hasInjectionContext:dv,hydrate:Uy,hydrateOnIdle:Ev,hydrateOnInteraction:Ov,hydrateOnMediaQuery:Iv,hydrateOnVisible:Rv,initCustomFormatter:jb,initDirectivesForSSR:By,inject:Ss,isMemoSame:Fp,isProxy:Gi,isReactive:un,isReadonly:Ks,isRef:kt,isRuntimeOnly:Bb,isShallow:rs,isVNode:bn,markRaw:If,mergeDefaults:tb,mergeModels:sb,mergeProps:Ip,nextTick:Ct,nodeOps:Bp,normalizeClass:qi,normalizeProps:sg,normalizeStyle:zi,onActivated:Es,onBeforeMount:Yf,onBeforeUnmount:_r,onBeforeUpdate:oc,onDeactivated:As,onErrorCaptured:tp,onMounted:Ke,onRenderTracked:ep,onRenderTriggered:Xf,onScopeDispose:gg,onServerPrefetch:Qf,onUnmounted:bt,onUpdated:xr,onWatcherCleanup:Df,openBlock:Di,patchProp:Kp,popScopeId:rv,provide:vi,proxyRefs:sc,pushScopeId:lv,queuePostFlushCb:Ri,reactive:$n,readonly:Nl,ref:m,registerRuntimeCompiler:Dp,render:lh,renderList:Hv,renderSlot:jv,resolveComponent:$v,resolveDirective:Bv,resolveDynamicComponent:Uv,resolveFilter:Yb,resolveTransitionHooks:$a,setBlockTracking:Mi,setDevtoolsHook:Wb,setTransitionHooks:vn,shallowReactive:ec,shallowReadonly:Fg,shallowRef:tc,ssrContextKey:Bf,ssrUtils:Jb,stop:yg,toDisplayString:ff,toHandlerKey:Ra,toHandlers:zv,toRaw:Ge,toRef:Gg,toRefs:jg,toValue:Bg,transformVNodeArgs:Db,triggerRef:Ug,unref:Gs,useAttrs:eb,useCssModule:Sy,useCssVars:oy,useHost:Zp,useId:yv,useModel:fb,useSSRContext:Hf,useShadowRoot:wy,useSlots:Xv,useTemplateRef:xv,useTransitionState:ic,vModelCheckbox:xc,vModelDynamic:th,vModelRadio:_c,vModelSelect:Xp,vModelText:Gl,vShow:qp,version:$p,warn:qb,watch:Yt,watchEffect:uv,watchPostEffect:fv,watchSyncEffect:Vf,withAsyncContext:ab,withCtx:ac,withDefaults:Qv,withDirectives:cv,withKeys:$y,withMemo:zb,withModifiers:Py,withScopeId:ov},Symbol.toStringTag,{value:"Module"}));/**
* @vue/compiler-core v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Fi=Symbol(""),_i=Symbol(""),kc=Symbol(""),Wl=Symbol(""),dh=Symbol(""),ia=Symbol(""),uh=Symbol(""),fh=Symbol(""),wc=Symbol(""),Sc=Symbol(""),Yi=Symbol(""),Tc=Symbol(""),ph=Symbol(""),Cc=Symbol(""),Ec=Symbol(""),Ac=Symbol(""),Rc=Symbol(""),Ic=Symbol(""),Oc=Symbol(""),hh=Symbol(""),mh=Symbol(""),Tr=Symbol(""),Zl=Symbol(""),Nc=Symbol(""),Lc=Symbol(""),$i=Symbol(""),Qi=Symbol(""),Dc=Symbol(""),Io=Symbol(""),Vy=Symbol(""),Oo=Symbol(""),Jl=Symbol(""),jy=Symbol(""),zy=Symbol(""),Mc=Symbol(""),qy=Symbol(""),Gy=Symbol(""),Pc=Symbol(""),gh=Symbol(""),Va={[Fi]:"Fragment",[_i]:"Teleport",[kc]:"Suspense",[Wl]:"KeepAlive",[dh]:"BaseTransition",[ia]:"openBlock",[uh]:"createBlock",[fh]:"createElementBlock",[wc]:"createVNode",[Sc]:"createElementVNode",[Yi]:"createCommentVNode",[Tc]:"createTextVNode",[ph]:"createStaticVNode",[Cc]:"resolveComponent",[Ec]:"resolveDynamicComponent",[Ac]:"resolveDirective",[Rc]:"resolveFilter",[Ic]:"withDirectives",[Oc]:"renderList",[hh]:"renderSlot",[mh]:"createSlots",[Tr]:"toDisplayString",[Zl]:"mergeProps",[Nc]:"normalizeClass",[Lc]:"normalizeStyle",[$i]:"normalizeProps",[Qi]:"guardReactiveProps",[Dc]:"toHandlers",[Io]:"camelize",[Vy]:"capitalize",[Oo]:"toHandlerKey",[Jl]:"setBlockTracking",[jy]:"pushScopeId",[zy]:"popScopeId",[Mc]:"withCtx",[qy]:"unref",[Gy]:"isRef",[Pc]:"withMemo",[gh]:"isMemoSame"};function Ky(e){Object.getOwnPropertySymbols(e).forEach(t=>{Va[t]=e[t]})}const gs={start:{line:1,column:1,offset:0},end:{line:1,column:1,offset:0},source:""};function Wy(e,t=""){return{type:0,source:t,children:e,helpers:new Set,components:[],directives:[],hoists:[],imports:[],cached:[],temps:0,codegenNode:void 0,loc:gs}}function Ui(e,t,s,n,a,i,l,r=!1,o=!1,c=!1,d=gs){return e&&(r?(e.helper(ia),e.helper(qa(e.inSSR,c))):e.helper(za(e.inSSR,c)),l&&e.helper(Ic)),{type:13,tag:t,props:s,children:n,patchFlag:a,dynamicProps:i,directives:l,isBlock:r,disableTracking:o,isComponent:c,loc:d}}function ta(e,t=gs){return{type:17,loc:t,elements:e}}function ws(e,t=gs){return{type:15,loc:t,properties:e}}function _t(e,t){return{type:16,loc:gs,key:Le(e)?Me(e,!0):e,value:t}}function Me(e,t=!1,s=gs,n=0){return{type:4,loc:s,content:e,isStatic:t,constType:t?3:n}}function Ms(e,t=gs){return{type:8,loc:t,children:e}}function Et(e,t=[],s=gs){return{type:14,loc:s,callee:e,arguments:t}}function ja(e,t=void 0,s=!1,n=!1,a=gs){return{type:18,params:e,returns:t,newline:s,isSlot:n,loc:a}}function No(e,t,s,n=!0){return{type:19,test:e,consequent:t,alternate:s,newline:n,loc:gs}}function Zy(e,t,s=!1,n=!1){return{type:20,index:e,value:t,needPauseTracking:s,inVOnce:n,needArraySpread:!1,loc:gs}}function Jy(e){return{type:21,body:e,loc:gs}}function za(e,t){return e||t?wc:Sc}function qa(e,t){return e||t?uh:fh}function Fc(e,{helper:t,removeHelper:s,inSSR:n}){e.isBlock||(e.isBlock=!0,s(za(n,e.isComponent)),t(ia),t(qa(n,e.isComponent)))}const Zd=new Uint8Array([123,123]),Jd=new Uint8Array([125,125]);function Yd(e){return e>=97&&e<=122||e>=65&&e<=90}function us(e){return e===32||e===10||e===9||e===12||e===13}function En(e){return e===47||e===62||us(e)}function Yl(e){const t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t}const Ut={Cdata:new Uint8Array([67,68,65,84,65,91]),CdataEnd:new Uint8Array([93,93,62]),CommentEnd:new Uint8Array([45,45,62]),ScriptEnd:new Uint8Array([60,47,115,99,114,105,112,116]),StyleEnd:new Uint8Array([60,47,115,116,121,108,101]),TitleEnd:new Uint8Array([60,47,116,105,116,108,101]),TextareaEnd:new Uint8Array([60,47,116,101,120,116,97,114,101,97])};class Yy{constructor(t,s){this.stack=t,this.cbs=s,this.state=1,this.buffer="",this.sectionStart=0,this.index=0,this.entityStart=0,this.baseState=1,this.inRCDATA=!1,this.inXML=!1,this.inVPre=!1,this.newlines=[],this.mode=0,this.delimiterOpen=Zd,this.delimiterClose=Jd,this.delimiterIndex=-1,this.currentSequence=void 0,this.sequenceIndex=0}get inSFCRoot(){return this.mode===2&&this.stack.length===0}reset(){this.state=1,this.mode=0,this.buffer="",this.sectionStart=0,this.index=0,this.baseState=1,this.inRCDATA=!1,this.currentSequence=void 0,this.newlines.length=0,this.delimiterOpen=Zd,this.delimiterClose=Jd}getPos(t){let s=1,n=t+1;const a=this.newlines.length;let i=-1;if(a>100){let l=-1,r=a;for(;l+1<r;){const o=l+r>>>1;this.newlines[o]<t?l=o:r=o}i=l}else for(let l=a-1;l>=0;l--)if(t>this.newlines[l]){i=l;break}return i>=0&&(s=i+2,n=t-this.newlines[i]),{column:n,line:s,offset:t}}peek(){return this.buffer.charCodeAt(this.index+1)}stateText(t){t===60?(this.index>this.sectionStart&&this.cbs.ontext(this.sectionStart,this.index),this.state=5,this.sectionStart=this.index):!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t))}stateInterpolationOpen(t){if(t===this.delimiterOpen[this.delimiterIndex])if(this.delimiterIndex===this.delimiterOpen.length-1){const s=this.index+1-this.delimiterOpen.length;s>this.sectionStart&&this.cbs.ontext(this.sectionStart,s),this.state=3,this.sectionStart=s}else this.delimiterIndex++;else this.inRCDATA?(this.state=32,this.stateInRCDATA(t)):(this.state=1,this.stateText(t))}stateInterpolation(t){t===this.delimiterClose[0]&&(this.state=4,this.delimiterIndex=0,this.stateInterpolationClose(t))}stateInterpolationClose(t){t===this.delimiterClose[this.delimiterIndex]?this.delimiterIndex===this.delimiterClose.length-1?(this.cbs.oninterpolation(this.sectionStart,this.index+1),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):this.delimiterIndex++:(this.state=3,this.stateInterpolation(t))}stateSpecialStartSequence(t){const s=this.sequenceIndex===this.currentSequence.length;if(!(s?En(t):(t|32)===this.currentSequence[this.sequenceIndex]))this.inRCDATA=!1;else if(!s){this.sequenceIndex++;return}this.sequenceIndex=0,this.state=6,this.stateInTagName(t)}stateInRCDATA(t){if(this.sequenceIndex===this.currentSequence.length){if(t===62||us(t)){const s=this.index-this.currentSequence.length;if(this.sectionStart<s){const n=this.index;this.index=s,this.cbs.ontext(this.sectionStart,s),this.index=n}this.sectionStart=s+2,this.stateInClosingTagName(t),this.inRCDATA=!1;return}this.sequenceIndex=0}(t|32)===this.currentSequence[this.sequenceIndex]?this.sequenceIndex+=1:this.sequenceIndex===0?this.currentSequence===Ut.TitleEnd||this.currentSequence===Ut.TextareaEnd&&!this.inSFCRoot?!this.inVPre&&t===this.delimiterOpen[0]&&(this.state=2,this.delimiterIndex=0,this.stateInterpolationOpen(t)):this.fastForwardTo(60)&&(this.sequenceIndex=1):this.sequenceIndex=+(t===60)}stateCDATASequence(t){t===Ut.Cdata[this.sequenceIndex]?++this.sequenceIndex===Ut.Cdata.length&&(this.state=28,this.currentSequence=Ut.CdataEnd,this.sequenceIndex=0,this.sectionStart=this.index+1):(this.sequenceIndex=0,this.state=23,this.stateInDeclaration(t))}fastForwardTo(t){for(;++this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);if(s===10&&this.newlines.push(this.index),s===t)return!0}return this.index=this.buffer.length-1,!1}stateInCommentLike(t){t===this.currentSequence[this.sequenceIndex]?++this.sequenceIndex===this.currentSequence.length&&(this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,this.index-2):this.cbs.oncomment(this.sectionStart,this.index-2),this.sequenceIndex=0,this.sectionStart=this.index+1,this.state=1):this.sequenceIndex===0?this.fastForwardTo(this.currentSequence[0])&&(this.sequenceIndex=1):t!==this.currentSequence[this.sequenceIndex-1]&&(this.sequenceIndex=0)}startSpecial(t,s){this.enterRCDATA(t,s),this.state=31}enterRCDATA(t,s){this.inRCDATA=!0,this.currentSequence=t,this.sequenceIndex=s}stateBeforeTagName(t){t===33?(this.state=22,this.sectionStart=this.index+1):t===63?(this.state=24,this.sectionStart=this.index+1):Yd(t)?(this.sectionStart=this.index,this.mode===0?this.state=6:this.inSFCRoot?this.state=34:this.inXML?this.state=6:t===116?this.state=30:this.state=t===115?29:6):t===47?this.state=8:(this.state=1,this.stateText(t))}stateInTagName(t){En(t)&&this.handleTagName(t)}stateInSFCRootTagName(t){if(En(t)){const s=this.buffer.slice(this.sectionStart,this.index);s!=="template"&&this.enterRCDATA(Yl("</"+s),0),this.handleTagName(t)}}handleTagName(t){this.cbs.onopentagname(this.sectionStart,this.index),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)}stateBeforeClosingTagName(t){us(t)||(t===62?(this.state=1,this.sectionStart=this.index+1):(this.state=Yd(t)?9:27,this.sectionStart=this.index))}stateInClosingTagName(t){(t===62||us(t))&&(this.cbs.onclosetag(this.sectionStart,this.index),this.sectionStart=-1,this.state=10,this.stateAfterClosingTagName(t))}stateAfterClosingTagName(t){t===62&&(this.state=1,this.sectionStart=this.index+1)}stateBeforeAttrName(t){t===62?(this.cbs.onopentagend(this.index),this.inRCDATA?this.state=32:this.state=1,this.sectionStart=this.index+1):t===47?this.state=7:t===60&&this.peek()===47?(this.cbs.onopentagend(this.index),this.state=5,this.sectionStart=this.index):us(t)||this.handleAttrStart(t)}handleAttrStart(t){t===118&&this.peek()===45?(this.state=13,this.sectionStart=this.index):t===46||t===58||t===64||t===35?(this.cbs.ondirname(this.index,this.index+1),this.state=14,this.sectionStart=this.index+1):(this.state=12,this.sectionStart=this.index)}stateInSelfClosingTag(t){t===62?(this.cbs.onselfclosingtag(this.index),this.state=1,this.sectionStart=this.index+1,this.inRCDATA=!1):us(t)||(this.state=11,this.stateBeforeAttrName(t))}stateInAttrName(t){(t===61||En(t))&&(this.cbs.onattribname(this.sectionStart,this.index),this.handleAttrNameEnd(t))}stateInDirName(t){t===61||En(t)?(this.cbs.ondirname(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===58?(this.cbs.ondirname(this.sectionStart,this.index),this.state=14,this.sectionStart=this.index+1):t===46&&(this.cbs.ondirname(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDirArg(t){t===61||En(t)?(this.cbs.ondirarg(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===91?this.state=15:t===46&&(this.cbs.ondirarg(this.sectionStart,this.index),this.state=16,this.sectionStart=this.index+1)}stateInDynamicDirArg(t){t===93?this.state=14:(t===61||En(t))&&(this.cbs.ondirarg(this.sectionStart,this.index+1),this.handleAttrNameEnd(t))}stateInDirModifier(t){t===61||En(t)?(this.cbs.ondirmodifier(this.sectionStart,this.index),this.handleAttrNameEnd(t)):t===46&&(this.cbs.ondirmodifier(this.sectionStart,this.index),this.sectionStart=this.index+1)}handleAttrNameEnd(t){this.sectionStart=this.index,this.state=17,this.cbs.onattribnameend(this.index),this.stateAfterAttrName(t)}stateAfterAttrName(t){t===61?this.state=18:t===47||t===62?(this.cbs.onattribend(0,this.sectionStart),this.sectionStart=-1,this.state=11,this.stateBeforeAttrName(t)):us(t)||(this.cbs.onattribend(0,this.sectionStart),this.handleAttrStart(t))}stateBeforeAttrValue(t){t===34?(this.state=19,this.sectionStart=this.index+1):t===39?(this.state=20,this.sectionStart=this.index+1):us(t)||(this.sectionStart=this.index,this.state=21,this.stateInAttrValueNoQuotes(t))}handleInAttrValue(t,s){(t===s||this.fastForwardTo(s))&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(s===34?3:2,this.index+1),this.state=11)}stateInAttrValueDoubleQuotes(t){this.handleInAttrValue(t,34)}stateInAttrValueSingleQuotes(t){this.handleInAttrValue(t,39)}stateInAttrValueNoQuotes(t){us(t)||t===62?(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=-1,this.cbs.onattribend(1,this.index),this.state=11,this.stateBeforeAttrName(t)):(t===39||t===60||t===61||t===96)&&this.cbs.onerr(18,this.index)}stateBeforeDeclaration(t){t===91?(this.state=26,this.sequenceIndex=0):this.state=t===45?25:23}stateInDeclaration(t){(t===62||this.fastForwardTo(62))&&(this.state=1,this.sectionStart=this.index+1)}stateInProcessingInstruction(t){(t===62||this.fastForwardTo(62))&&(this.cbs.onprocessinginstruction(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeComment(t){t===45?(this.state=28,this.currentSequence=Ut.CommentEnd,this.sequenceIndex=2,this.sectionStart=this.index+1):this.state=23}stateInSpecialComment(t){(t===62||this.fastForwardTo(62))&&(this.cbs.oncomment(this.sectionStart,this.index),this.state=1,this.sectionStart=this.index+1)}stateBeforeSpecialS(t){t===Ut.ScriptEnd[3]?this.startSpecial(Ut.ScriptEnd,4):t===Ut.StyleEnd[3]?this.startSpecial(Ut.StyleEnd,4):(this.state=6,this.stateInTagName(t))}stateBeforeSpecialT(t){t===Ut.TitleEnd[3]?this.startSpecial(Ut.TitleEnd,4):t===Ut.TextareaEnd[3]?this.startSpecial(Ut.TextareaEnd,4):(this.state=6,this.stateInTagName(t))}startEntity(){}stateInEntity(){}parse(t){for(this.buffer=t;this.index<this.buffer.length;){const s=this.buffer.charCodeAt(this.index);switch(s===10&&this.state!==33&&this.newlines.push(this.index),this.state){case 1:{this.stateText(s);break}case 2:{this.stateInterpolationOpen(s);break}case 3:{this.stateInterpolation(s);break}case 4:{this.stateInterpolationClose(s);break}case 31:{this.stateSpecialStartSequence(s);break}case 32:{this.stateInRCDATA(s);break}case 26:{this.stateCDATASequence(s);break}case 19:{this.stateInAttrValueDoubleQuotes(s);break}case 12:{this.stateInAttrName(s);break}case 13:{this.stateInDirName(s);break}case 14:{this.stateInDirArg(s);break}case 15:{this.stateInDynamicDirArg(s);break}case 16:{this.stateInDirModifier(s);break}case 28:{this.stateInCommentLike(s);break}case 27:{this.stateInSpecialComment(s);break}case 11:{this.stateBeforeAttrName(s);break}case 6:{this.stateInTagName(s);break}case 34:{this.stateInSFCRootTagName(s);break}case 9:{this.stateInClosingTagName(s);break}case 5:{this.stateBeforeTagName(s);break}case 17:{this.stateAfterAttrName(s);break}case 20:{this.stateInAttrValueSingleQuotes(s);break}case 18:{this.stateBeforeAttrValue(s);break}case 8:{this.stateBeforeClosingTagName(s);break}case 10:{this.stateAfterClosingTagName(s);break}case 29:{this.stateBeforeSpecialS(s);break}case 30:{this.stateBeforeSpecialT(s);break}case 21:{this.stateInAttrValueNoQuotes(s);break}case 7:{this.stateInSelfClosingTag(s);break}case 23:{this.stateInDeclaration(s);break}case 22:{this.stateBeforeDeclaration(s);break}case 25:{this.stateBeforeComment(s);break}case 24:{this.stateInProcessingInstruction(s);break}case 33:{this.stateInEntity();break}}this.index++}this.cleanup(),this.finish()}cleanup(){this.sectionStart!==this.index&&(this.state===1||this.state===32&&this.sequenceIndex===0?(this.cbs.ontext(this.sectionStart,this.index),this.sectionStart=this.index):(this.state===19||this.state===20||this.state===21)&&(this.cbs.onattribdata(this.sectionStart,this.index),this.sectionStart=this.index))}finish(){this.handleTrailingData(),this.cbs.onend()}handleTrailingData(){const t=this.buffer.length;this.sectionStart>=t||(this.state===28?this.currentSequence===Ut.CdataEnd?this.cbs.oncdata(this.sectionStart,t):this.cbs.oncomment(this.sectionStart,t):this.state===6||this.state===11||this.state===18||this.state===17||this.state===12||this.state===13||this.state===14||this.state===15||this.state===16||this.state===20||this.state===19||this.state===21||this.state===9||this.cbs.ontext(this.sectionStart,t))}emitCodePoint(t,s){}}function Qd(e,{compatConfig:t}){const s=t&&t[e];return e==="MODE"?s||3:s}function sa(e,t){const s=Qd("MODE",t),n=Qd(e,t);return s===3?n===!0:n!==!1}function Bi(e,t,s,...n){return sa(e,t)}function $c(e){throw e}function vh(e){}function ct(e,t,s,n){const a=`https://vuejs.org/error-reference/#compiler-${e}`,i=new SyntaxError(String(a));return i.code=e,i.loc=t,i}const ls=e=>e.type===4&&e.isStatic;function bh(e){switch(e){case"Teleport":case"teleport":return _i;case"Suspense":case"suspense":return kc;case"KeepAlive":case"keep-alive":return Wl;case"BaseTransition":case"base-transition":return dh}}const Qy=/^$|^\d|[^\$\w\xA0-\uFFFF]/,Uc=e=>!Qy.test(e),yh=/[A-Za-z_$\xA0-\uFFFF]/,Xy=/[\.\?\w$\xA0-\uFFFF]/,ex=/\s+[.[]\s*|\s*[.[]\s+/g,xh=e=>e.type===4?e.content:e.loc.source,tx=e=>{const t=xh(e).trim().replace(ex,r=>r.trim());let s=0,n=[],a=0,i=0,l=null;for(let r=0;r<t.length;r++){const o=t.charAt(r);switch(s){case 0:if(o==="[")n.push(s),s=1,a++;else if(o==="(")n.push(s),s=2,i++;else if(!(r===0?yh:Xy).test(o))return!1;break;case 1:o==="'"||o==='"'||o==="`"?(n.push(s),s=3,l=o):o==="["?a++:o==="]"&&(--a||(s=n.pop()));break;case 2:if(o==="'"||o==='"'||o==="`")n.push(s),s=3,l=o;else if(o==="(")i++;else if(o===")"){if(r===t.length-1)return!1;--i||(s=n.pop())}break;case 3:o===l&&(s=n.pop(),l=null);break}}return!a&&!i},_h=tx,sx=/^\s*(?:async\s*)?(?:\([^)]*?\)|[\w$_]+)\s*(?::[^=]+)?=>|^\s*(?:async\s+)?function(?:\s+[\w$]+)?\s*\(/,nx=e=>sx.test(xh(e)),ax=nx;function ks(e,t,s=!1){for(let n=0;n<e.props.length;n++){const a=e.props[n];if(a.type===7&&(s||a.exp)&&(Le(t)?a.name===t:t.test(a.name)))return a}}function Cr(e,t,s=!1,n=!1){for(let a=0;a<e.props.length;a++){const i=e.props[a];if(i.type===6){if(s)continue;if(i.name===t&&(i.value||n))return i}else if(i.name==="bind"&&(i.exp||n)&&Zn(i.arg,t))return i}}function Zn(e,t){return!!(e&&ls(e)&&e.content===t)}function ix(e){return e.props.some(t=>t.type===7&&t.name==="bind"&&(!t.arg||t.arg.type!==4||!t.arg.isStatic))}function Zr(e){return e.type===5||e.type===2}function Xd(e){return e.type===7&&e.name==="pre"}function lx(e){return e.type===7&&e.name==="slot"}function Ql(e){return e.type===1&&e.tagType===3}function Xl(e){return e.type===1&&e.tagType===2}const rx=new Set([$i,Qi]);function kh(e,t=[]){if(e&&!Le(e)&&e.type===14){const s=e.callee;if(!Le(s)&&rx.has(s))return kh(e.arguments[0],t.concat(e))}return[e,t]}function er(e,t,s){let n,a=e.type===13?e.props:e.arguments[2],i=[],l;if(a&&!Le(a)&&a.type===14){const r=kh(a);a=r[0],i=r[1],l=i[i.length-1]}if(a==null||Le(a))n=ws([t]);else if(a.type===14){const r=a.arguments[0];!Le(r)&&r.type===15?eu(t,r)||r.properties.unshift(t):a.callee===Dc?n=Et(s.helper(Zl),[ws([t]),a]):a.arguments.unshift(ws([t])),!n&&(n=a)}else a.type===15?(eu(t,a)||a.properties.unshift(t),n=a):(n=Et(s.helper(Zl),[ws([t]),a]),l&&l.callee===Qi&&(l=i[i.length-2]));e.type===13?l?l.arguments[0]=n:e.props=n:l?l.arguments[0]=n:e.arguments[2]=n}function eu(e,t){let s=!1;if(e.key.type===4){const n=e.key.content;s=t.properties.some(a=>a.key.type===4&&a.key.content===n)}return s}function Hi(e,t){return`_${t}_${e.replace(/[^\w]/g,(s,n)=>s==="-"?"_":e.charCodeAt(n).toString())}`}function ox(e){return e.type===14&&e.callee===Pc?e.arguments[1].returns:e}const cx=/([\s\S]*?)\s+(?:in|of)\s+(\S[\s\S]*)/;function wh(e){for(let t=0;t<e.length;t++)if(!us(e.charCodeAt(t)))return!1;return!0}function Bc(e){return e.type===2&&wh(e.content)||e.type===12&&Bc(e.content)}function Sh(e){return e.type===3||Bc(e)}const Th={parseMode:"base",ns:0,delimiters:["{{","}}"],getNamespace:()=>0,isVoidTag:Ta,isPreTag:Ta,isIgnoreNewlineTag:Ta,isCustomElement:Ta,onError:$c,onWarn:vh,comments:!1,prefixIdentifiers:!1};let Ze=Th,Vi=null,pn="",Ht=null,je=null,ts="",en=-1,Gn=-1,Hc=0,Ln=!1,Lo=null;const ot=[],mt=new Yy(ot,{onerr:Ys,ontext(e,t){gl(Lt(e,t),e,t)},ontextentity(e,t,s){gl(e,t,s)},oninterpolation(e,t){if(Ln)return gl(Lt(e,t),e,t);let s=e+mt.delimiterOpen.length,n=t-mt.delimiterClose.length;for(;us(pn.charCodeAt(s));)s++;for(;us(pn.charCodeAt(n-1));)n--;let a=Lt(s,n);a.includes("&")&&(a=Ze.decodeEntities(a,!1)),Do({type:5,content:Cl(a,!1,gt(s,n)),loc:gt(e,t)})},onopentagname(e,t){const s=Lt(e,t);Ht={type:1,tag:s,ns:Ze.getNamespace(s,ot[0],Ze.ns),tagType:0,props:[],children:[],loc:gt(e-1,t),codegenNode:void 0}},onopentagend(e){su(e)},onclosetag(e,t){const s=Lt(e,t);if(!Ze.isVoidTag(s)){let n=!1;for(let a=0;a<ot.length;a++)if(ot[a].tag.toLowerCase()===s.toLowerCase()){n=!0,a>0&&Ys(24,ot[0].loc.start.offset);for(let l=0;l<=a;l++){const r=ot.shift();Tl(r,t,l<a)}break}n||Ys(23,Ch(e,60))}},onselfclosingtag(e){const t=Ht.tag;Ht.isSelfClosing=!0,su(e),ot[0]&&ot[0].tag===t&&Tl(ot.shift(),e)},onattribname(e,t){je={type:6,name:Lt(e,t),nameLoc:gt(e,t),value:void 0,loc:gt(e)}},ondirname(e,t){const s=Lt(e,t),n=s==="."||s===":"?"bind":s==="@"?"on":s==="#"?"slot":s.slice(2);if(!Ln&&n===""&&Ys(26,e),Ln||n==="")je={type:6,name:s,nameLoc:gt(e,t),value:void 0,loc:gt(e)};else if(je={type:7,name:n,rawName:s,exp:void 0,arg:void 0,modifiers:s==="."?[Me("prop")]:[],loc:gt(e)},n==="pre"){Ln=mt.inVPre=!0,Lo=Ht;const a=Ht.props;for(let i=0;i<a.length;i++)a[i].type===7&&(a[i]=yx(a[i]))}},ondirarg(e,t){if(e===t)return;const s=Lt(e,t);if(Ln&&!Xd(je))je.name+=s,Jn(je.nameLoc,t);else{const n=s[0]!=="[";je.arg=Cl(n?s:s.slice(1,-1),n,gt(e,t),n?3:0)}},ondirmodifier(e,t){const s=Lt(e,t);if(Ln&&!Xd(je))je.name+="."+s,Jn(je.nameLoc,t);else if(je.name==="slot"){const n=je.arg;n&&(n.content+="."+s,Jn(n.loc,t))}else{const n=Me(s,!0,gt(e,t));je.modifiers.push(n)}},onattribdata(e,t){ts+=Lt(e,t),en<0&&(en=e),Gn=t},onattribentity(e,t,s){ts+=e,en<0&&(en=t),Gn=s},onattribnameend(e){const t=je.loc.start.offset,s=Lt(t,e);je.type===7&&(je.rawName=s),Ht.props.some(n=>(n.type===7?n.rawName:n.name)===s)&&Ys(2,t)},onattribend(e,t){if(Ht&&je){if(Jn(je.loc,t),e!==0)if(ts.includes("&")&&(ts=Ze.decodeEntities(ts,!0)),je.type===6)je.name==="class"&&(ts=Ah(ts).trim()),e===1&&!ts&&Ys(13,t),je.value={type:2,content:ts,loc:e===1?gt(en,Gn):gt(en-1,Gn+1)},mt.inSFCRoot&&Ht.tag==="template"&&je.name==="lang"&&ts&&ts!=="html"&&mt.enterRCDATA(Yl("</template"),0);else{let s=0;je.exp=Cl(ts,!1,gt(en,Gn),0,s),je.name==="for"&&(je.forParseResult=ux(je.exp));let n=-1;je.name==="bind"&&(n=je.modifiers.findIndex(a=>a.content==="sync"))>-1&&Bi("COMPILER_V_BIND_SYNC",Ze,je.loc,je.arg.loc.source)&&(je.name="model",je.modifiers.splice(n,1))}(je.type!==7||je.name!=="pre")&&Ht.props.push(je)}ts="",en=Gn=-1},oncomment(e,t){Ze.comments&&Do({type:3,content:Lt(e,t),loc:gt(e-4,t+3)})},onend(){const e=pn.length;for(let t=0;t<ot.length;t++)Tl(ot[t],e-1),Ys(24,ot[t].loc.start.offset)},oncdata(e,t){(ot[0]?ot[0].ns:Ze.ns)!==0?gl(Lt(e,t),e,t):Ys(1,e-9)},onprocessinginstruction(e){(ot[0]?ot[0].ns:Ze.ns)===0&&Ys(21,e-1)}}),tu=/,([^,\}\]]*)(?:,([^,\}\]]*))?$/,dx=/^\(|\)$/g;function ux(e){const t=e.loc,s=e.content,n=s.match(cx);if(!n)return;const[,a,i]=n,l=(u,p,h=!1)=>{const v=t.start.offset+p,y=v+u.length;return Cl(u,!1,gt(v,y),0,h?1:0)},r={source:l(i.trim(),s.indexOf(i,a.length)),value:void 0,key:void 0,index:void 0,finalized:!1};let o=a.trim().replace(dx,"").trim();const c=a.indexOf(o),d=o.match(tu);if(d){o=o.replace(tu,"").trim();const u=d[1].trim();let p;if(u&&(p=s.indexOf(u,c+o.length),r.key=l(u,p,!0)),d[2]){const h=d[2].trim();h&&(r.index=l(h,s.indexOf(h,r.key?p+u.length:c+o.length),!0))}}return o&&(r.value=l(o,c,!0)),r}function Lt(e,t){return pn.slice(e,t)}function su(e){mt.inSFCRoot&&(Ht.innerLoc=gt(e+1,e+1)),Do(Ht);const{tag:t,ns:s}=Ht;s===0&&Ze.isPreTag(t)&&Hc++,Ze.isVoidTag(t)?Tl(Ht,e):(ot.unshift(Ht),(s===1||s===2)&&(mt.inXML=!0)),Ht=null}function gl(e,t,s){{const i=ot[0]&&ot[0].tag;i!=="script"&&i!=="style"&&e.includes("&")&&(e=Ze.decodeEntities(e,!1))}const n=ot[0]||Vi,a=n.children[n.children.length-1];a&&a.type===2?(a.content+=e,Jn(a.loc,s)):n.children.push({type:2,content:e,loc:gt(t,s)})}function Tl(e,t,s=!1){s?Jn(e.loc,Ch(t,60)):Jn(e.loc,fx(t,62)+1),mt.inSFCRoot&&(e.children.length?e.innerLoc.end=Ue({},e.children[e.children.length-1].loc.end):e.innerLoc.end=Ue({},e.innerLoc.start),e.innerLoc.source=Lt(e.innerLoc.start.offset,e.innerLoc.end.offset));const{tag:n,ns:a,children:i}=e;if(Ln||(n==="slot"?e.tagType=2:nu(e)?e.tagType=3:hx(e)&&(e.tagType=1)),mt.inRCDATA||(e.children=Eh(i)),a===0&&Ze.isIgnoreNewlineTag(n)){const l=i[0];l&&l.type===2&&(l.content=l.content.replace(/^\r?\n/,""))}a===0&&Ze.isPreTag(n)&&Hc--,Lo===e&&(Ln=mt.inVPre=!1,Lo=null),mt.inXML&&(ot[0]?ot[0].ns:Ze.ns)===0&&(mt.inXML=!1);{const l=e.props;if(!mt.inSFCRoot&&sa("COMPILER_NATIVE_TEMPLATE",Ze)&&e.tag==="template"&&!nu(e)){const o=ot[0]||Vi,c=o.children.indexOf(e);o.children.splice(c,1,...e.children)}const r=l.find(o=>o.type===6&&o.name==="inline-template");r&&Bi("COMPILER_INLINE_TEMPLATE",Ze,r.loc)&&e.children.length&&(r.value={type:2,content:Lt(e.children[0].loc.start.offset,e.children[e.children.length-1].loc.end.offset),loc:r.loc})}}function fx(e,t){let s=e;for(;pn.charCodeAt(s)!==t&&s<pn.length-1;)s++;return s}function Ch(e,t){let s=e;for(;pn.charCodeAt(s)!==t&&s>=0;)s--;return s}const px=new Set(["if","else","else-if","for","slot"]);function nu({tag:e,props:t}){if(e==="template"){for(let s=0;s<t.length;s++)if(t[s].type===7&&px.has(t[s].name))return!0}return!1}function hx({tag:e,props:t}){if(Ze.isCustomElement(e))return!1;if(e==="component"||mx(e.charCodeAt(0))||bh(e)||Ze.isBuiltInComponent&&Ze.isBuiltInComponent(e)||Ze.isNativeTag&&!Ze.isNativeTag(e))return!0;for(let s=0;s<t.length;s++){const n=t[s];if(n.type===6){if(n.name==="is"&&n.value){if(n.value.content.startsWith("vue:"))return!0;if(Bi("COMPILER_IS_ON_ELEMENT",Ze,n.loc))return!0}}else if(n.name==="bind"&&Zn(n.arg,"is")&&Bi("COMPILER_IS_ON_ELEMENT",Ze,n.loc))return!0}return!1}function mx(e){return e>64&&e<91}const gx=/\r\n/g;function Eh(e){const t=Ze.whitespace!=="preserve";let s=!1;for(let n=0;n<e.length;n++){const a=e[n];if(a.type===2)if(Hc)a.content=a.content.replace(gx,`
`);else if(wh(a.content)){const i=e[n-1]&&e[n-1].type,l=e[n+1]&&e[n+1].type;!i||!l||t&&(i===3&&(l===3||l===1)||i===1&&(l===3||l===1&&vx(a.content)))?(s=!0,e[n]=null):a.content=" "}else t&&(a.content=Ah(a.content))}return s?e.filter(Boolean):e}function vx(e){for(let t=0;t<e.length;t++){const s=e.charCodeAt(t);if(s===10||s===13)return!0}return!1}function Ah(e){let t="",s=!1;for(let n=0;n<e.length;n++)us(e.charCodeAt(n))?s||(t+=" ",s=!0):(t+=e[n],s=!1);return t}function Do(e){(ot[0]||Vi).children.push(e)}function gt(e,t){return{start:mt.getPos(e),end:t==null?t:mt.getPos(t),source:t==null?t:Lt(e,t)}}function bx(e){return gt(e.start.offset,e.end.offset)}function Jn(e,t){e.end=mt.getPos(t),e.source=Lt(e.start.offset,t)}function yx(e){const t={type:6,name:e.rawName,nameLoc:gt(e.loc.start.offset,e.loc.start.offset+e.rawName.length),value:void 0,loc:e.loc};if(e.exp){const s=e.exp.loc;s.end.offset<e.loc.end.offset&&(s.start.offset--,s.start.column--,s.end.offset++,s.end.column++),t.value={type:2,content:e.exp.content,loc:s}}return t}function Cl(e,t=!1,s,n=0,a=0){return Me(e,t,s,n)}function Ys(e,t,s){Ze.onError(ct(e,gt(t,t)))}function xx(){mt.reset(),Ht=null,je=null,ts="",en=-1,Gn=-1,ot.length=0}function _x(e,t){if(xx(),pn=e,Ze=Ue({},Th),t){let a;for(a in t)t[a]!=null&&(Ze[a]=t[a])}mt.mode=Ze.parseMode==="html"?1:Ze.parseMode==="sfc"?2:0,mt.inXML=Ze.ns===1||Ze.ns===2;const s=t&&t.delimiters;s&&(mt.delimiterOpen=Yl(s[0]),mt.delimiterClose=Yl(s[1]));const n=Vi=Wy([],e);return mt.parse(pn),n.loc=gt(0,e.length),n.children=Eh(n.children),Vi=null,n}function kx(e,t){El(e,void 0,t,!!Rh(e))}function Rh(e){const t=e.children.filter(s=>s.type!==3);return t.length===1&&t[0].type===1&&!Xl(t[0])?t[0]:null}function El(e,t,s,n=!1,a=!1){const{children:i}=e,l=[];for(let d=0;d<i.length;d++){const u=i[d];if(u.type===1&&u.tagType===0){const p=n?0:fs(u,s);if(p>0){if(p>=2){u.codegenNode.patchFlag=-1,l.push(u);continue}}else{const h=u.codegenNode;if(h.type===13){const v=h.patchFlag;if((v===void 0||v===512||v===1)&&Oh(u,s)>=2){const y=Nh(u);y&&(h.props=s.hoist(y))}h.dynamicProps&&(h.dynamicProps=s.hoist(h.dynamicProps))}}}else if(u.type===12&&(n?0:fs(u,s))>=2){u.codegenNode.type===14&&u.codegenNode.arguments.length>0&&u.codegenNode.arguments.push("-1"),l.push(u);continue}if(u.type===1){const p=u.tagType===1;p&&s.scopes.vSlot++,El(u,e,s,!1,a),p&&s.scopes.vSlot--}else if(u.type===11)El(u,e,s,u.children.length===1,!0);else if(u.type===9)for(let p=0;p<u.branches.length;p++)El(u.branches[p],e,s,u.branches[p].children.length===1,a)}let r=!1;if(l.length===i.length&&e.type===1){if(e.tagType===0&&e.codegenNode&&e.codegenNode.type===13&&ve(e.codegenNode.children))e.codegenNode.children=o(ta(e.codegenNode.children)),r=!0;else if(e.tagType===1&&e.codegenNode&&e.codegenNode.type===13&&e.codegenNode.children&&!ve(e.codegenNode.children)&&e.codegenNode.children.type===15){const d=c(e.codegenNode,"default");d&&(d.returns=o(ta(d.returns)),r=!0)}else if(e.tagType===3&&t&&t.type===1&&t.tagType===1&&t.codegenNode&&t.codegenNode.type===13&&t.codegenNode.children&&!ve(t.codegenNode.children)&&t.codegenNode.children.type===15){const d=ks(e,"slot",!0),u=d&&d.arg&&c(t.codegenNode,d.arg);u&&(u.returns=o(ta(u.returns)),r=!0)}}if(!r)for(const d of l)d.codegenNode=s.cache(d.codegenNode);function o(d){const u=s.cache(d);return u.needArraySpread=!0,u}function c(d,u){if(d.children&&!ve(d.children)&&d.children.type===15){const p=d.children.properties.find(h=>h.key===u||h.key.content===u);return p&&p.value}}l.length&&s.transformHoist&&s.transformHoist(i,s,e)}function fs(e,t){const{constantCache:s}=t;switch(e.type){case 1:if(e.tagType!==0)return 0;const n=s.get(e);if(n!==void 0)return n;const a=e.codegenNode;if(a.type!==13||a.isBlock&&e.tag!=="svg"&&e.tag!=="foreignObject"&&e.tag!=="math")return 0;if(a.patchFlag===void 0){let l=3;const r=Oh(e,t);if(r===0)return s.set(e,0),0;r<l&&(l=r);for(let o=0;o<e.children.length;o++){const c=fs(e.children[o],t);if(c===0)return s.set(e,0),0;c<l&&(l=c)}if(l>1)for(let o=0;o<e.props.length;o++){const c=e.props[o];if(c.type===7&&c.name==="bind"&&c.exp){const d=fs(c.exp,t);if(d===0)return s.set(e,0),0;d<l&&(l=d)}}if(a.isBlock){for(let o=0;o<e.props.length;o++)if(e.props[o].type===7)return s.set(e,0),0;t.removeHelper(ia),t.removeHelper(qa(t.inSSR,a.isComponent)),a.isBlock=!1,t.helper(za(t.inSSR,a.isComponent))}return s.set(e,l),l}else return s.set(e,0),0;case 2:case 3:return 3;case 9:case 11:case 10:return 0;case 5:case 12:return fs(e.content,t);case 4:return e.constType;case 8:let i=3;for(let l=0;l<e.children.length;l++){const r=e.children[l];if(Le(r)||qt(r))continue;const o=fs(r,t);if(o===0)return 0;o<i&&(i=o)}return i;case 20:return 2;default:return 0}}const wx=new Set([Nc,Lc,$i,Qi]);function Ih(e,t){if(e.type===14&&!Le(e.callee)&&wx.has(e.callee)){const s=e.arguments[0];if(s.type===4)return fs(s,t);if(s.type===14)return Ih(s,t)}return 0}function Oh(e,t){let s=3;const n=Nh(e);if(n&&n.type===15){const{properties:a}=n;for(let i=0;i<a.length;i++){const{key:l,value:r}=a[i],o=fs(l,t);if(o===0)return o;o<s&&(s=o);let c;if(r.type===4?c=fs(r,t):r.type===14?c=Ih(r,t):c=0,c===0)return c;c<s&&(s=c)}}return s}function Nh(e){const t=e.codegenNode;if(t.type===13)return t.props}function Sx(e,{filename:t="",prefixIdentifiers:s=!1,hoistStatic:n=!1,hmr:a=!1,cacheHandlers:i=!1,nodeTransforms:l=[],directiveTransforms:r={},transformHoist:o=null,isBuiltInComponent:c=Pt,isCustomElement:d=Pt,expressionPlugins:u=[],scopeId:p=null,slotted:h=!0,ssr:v=!1,inSSR:y=!1,ssrCssVars:R="",bindingMetadata:I=Be,inline:b=!1,isTS:g=!1,onError:x=$c,onWarn:E=vh,compatConfig:T}){const S=t.replace(/\?.*$/,"").match(/([^/\\]+)\.\w+$/),w={filename:t,selfName:S&&ca(nt(S[1])),prefixIdentifiers:s,hoistStatic:n,hmr:a,cacheHandlers:i,nodeTransforms:l,directiveTransforms:r,transformHoist:o,isBuiltInComponent:c,isCustomElement:d,expressionPlugins:u,scopeId:p,slotted:h,ssr:v,inSSR:y,ssrCssVars:R,bindingMetadata:I,inline:b,isTS:g,onError:x,onWarn:E,compatConfig:T,root:e,helpers:new Map,components:new Set,directives:new Set,hoists:[],imports:[],cached:[],constantCache:new WeakMap,vForMemoKeyedNodes:new WeakSet,temps:0,identifiers:Object.create(null),scopes:{vFor:0,vSlot:0,vPre:0,vOnce:0},parent:null,grandParent:null,currentNode:e,childIndex:0,inVOnce:!1,helper(A){const L=w.helpers.get(A)||0;return w.helpers.set(A,L+1),A},removeHelper(A){const L=w.helpers.get(A);if(L){const B=L-1;B?w.helpers.set(A,B):w.helpers.delete(A)}},helperString(A){return`_${Va[w.helper(A)]}`},replaceNode(A){w.parent.children[w.childIndex]=w.currentNode=A},removeNode(A){const L=w.parent.children,B=A?L.indexOf(A):w.currentNode?w.childIndex:-1;!A||A===w.currentNode?(w.currentNode=null,w.onNodeRemoved()):w.childIndex>B&&(w.childIndex--,w.onNodeRemoved()),w.parent.children.splice(B,1)},onNodeRemoved:Pt,addIdentifiers(A){},removeIdentifiers(A){},hoist(A){Le(A)&&(A=Me(A)),w.hoists.push(A);const L=Me(`_hoisted_${w.hoists.length}`,!1,A.loc,2);return L.hoisted=A,L},cache(A,L=!1,B=!1){const F=Zy(w.cached.length,A,L,B);return w.cached.push(F),F}};return w.filters=new Set,w}function Tx(e,t){const s=Sx(e,t);Er(e,s),t.hoistStatic&&kx(e,s),t.ssr||Cx(e,s),e.helpers=new Set([...s.helpers.keys()]),e.components=[...s.components],e.directives=[...s.directives],e.imports=s.imports,e.hoists=s.hoists,e.temps=s.temps,e.cached=s.cached,e.transformed=!0,e.filters=[...s.filters]}function Cx(e,t){const{helper:s}=t,{children:n}=e;if(n.length===1){const a=Rh(e);if(a&&a.codegenNode){const i=a.codegenNode;i.type===13&&Fc(i,t),e.codegenNode=i}else e.codegenNode=n[0]}else if(n.length>1){let a=64;e.codegenNode=Ui(t,s(Fi),void 0,e.children,a,void 0,void 0,!0,void 0,!1)}}function Ex(e,t){let s=0;const n=()=>{s--};for(;s<e.children.length;s++){const a=e.children[s];Le(a)||(t.grandParent=t.parent,t.parent=e,t.childIndex=s,t.onNodeRemoved=n,Er(a,t))}}function Er(e,t){t.currentNode=e;const{nodeTransforms:s}=t,n=[];for(let i=0;i<s.length;i++){const l=s[i](e,t);if(l&&(ve(l)?n.push(...l):n.push(l)),t.currentNode)e=t.currentNode;else return}switch(e.type){case 3:t.ssr||t.helper(Yi);break;case 5:t.ssr||t.helper(Tr);break;case 9:for(let i=0;i<e.branches.length;i++)Er(e.branches[i],t);break;case 10:case 11:case 1:case 0:Ex(e,t);break}t.currentNode=e;let a=n.length;for(;a--;)n[a]()}function Lh(e,t){const s=Le(e)?n=>n===e:n=>e.test(n);return(n,a)=>{if(n.type===1){const{props:i}=n;if(n.tagType===3&&i.some(lx))return;const l=[];for(let r=0;r<i.length;r++){const o=i[r];if(o.type===7&&s(o.name)){i.splice(r,1),r--;const c=t(n,o,a);c&&l.push(c)}}return l}}}const Ar="/*@__PURE__*/",Dh=e=>`${Va[e]}: _${Va[e]}`;function Ax(e,{mode:t="function",prefixIdentifiers:s=t==="module",sourceMap:n=!1,filename:a="template.vue.html",scopeId:i=null,optimizeImports:l=!1,runtimeGlobalName:r="Vue",runtimeModuleName:o="vue",ssrRuntimeModuleName:c="vue/server-renderer",ssr:d=!1,isTS:u=!1,inSSR:p=!1}){const h={mode:t,prefixIdentifiers:s,sourceMap:n,filename:a,scopeId:i,optimizeImports:l,runtimeGlobalName:r,runtimeModuleName:o,ssrRuntimeModuleName:c,ssr:d,isTS:u,inSSR:p,source:e.source,code:"",column:1,line:1,offset:0,indentLevel:0,pure:!1,map:void 0,helper(y){return`_${Va[y]}`},push(y,R=-2,I){h.code+=y},indent(){v(++h.indentLevel)},deindent(y=!1){y?--h.indentLevel:v(--h.indentLevel)},newline(){v(h.indentLevel)}};function v(y){h.push(`
`+"  ".repeat(y),0)}return h}function Rx(e,t={}){const s=Ax(e,t);t.onContextCreated&&t.onContextCreated(s);const{mode:n,push:a,prefixIdentifiers:i,indent:l,deindent:r,newline:o,scopeId:c,ssr:d}=s,u=Array.from(e.helpers),p=u.length>0,h=!i&&n!=="module";Ix(e,s);const y=d?"ssrRender":"render",I=(d?["_ctx","_push","_parent","_attrs"]:["_ctx","_cache"]).join(", ");if(a(`function ${y}(${I}) {`),l(),h&&(a("with (_ctx) {"),l(),p&&(a(`const { ${u.map(Dh).join(", ")} } = _Vue
`,-1),o())),e.components.length&&(Jr(e.components,"component",s),(e.directives.length||e.temps>0)&&o()),e.directives.length&&(Jr(e.directives,"directive",s),e.temps>0&&o()),e.filters&&e.filters.length&&(o(),Jr(e.filters,"filter",s),o()),e.temps>0){a("let ");for(let b=0;b<e.temps;b++)a(`${b>0?", ":""}_temp${b}`)}return(e.components.length||e.directives.length||e.temps)&&(a(`
`,0),o()),d||a("return "),e.codegenNode?zt(e.codegenNode,s):a("null"),h&&(r(),a("}")),r(),a("}"),{ast:e,code:s.code,preamble:"",map:s.map?s.map.toJSON():void 0}}function Ix(e,t){const{ssr:s,prefixIdentifiers:n,push:a,newline:i,runtimeModuleName:l,runtimeGlobalName:r,ssrRuntimeModuleName:o}=t,c=r,d=Array.from(e.helpers);if(d.length>0&&(a(`const _Vue = ${c}
`,-1),e.hoists.length)){const u=[wc,Sc,Yi,Tc,ph].filter(p=>d.includes(p)).map(Dh).join(", ");a(`const { ${u} } = _Vue
`,-1)}Ox(e.hoists,t),i(),a("return ")}function Jr(e,t,{helper:s,push:n,newline:a,isTS:i}){const l=s(t==="filter"?Rc:t==="component"?Cc:Ac);for(let r=0;r<e.length;r++){let o=e[r];const c=o.endsWith("__self");c&&(o=o.slice(0,-6)),n(`const ${Hi(o,t)} = ${l}(${JSON.stringify(o)}${c?", true":""})${i?"!":""}`),r<e.length-1&&a()}}function Ox(e,t){if(!e.length)return;t.pure=!0;const{push:s,newline:n}=t;n();for(let a=0;a<e.length;a++){const i=e[a];i&&(s(`const _hoisted_${a+1} = `),zt(i,t),n())}t.pure=!1}function Vc(e,t){const s=e.length>3||!1;t.push("["),s&&t.indent(),Xi(e,t,s),s&&t.deindent(),t.push("]")}function Xi(e,t,s=!1,n=!0){const{push:a,newline:i}=t;for(let l=0;l<e.length;l++){const r=e[l];Le(r)?a(r,-3):ve(r)?Vc(r,t):zt(r,t),l<e.length-1&&(s?(n&&a(","),i()):n&&a(", "))}}function zt(e,t){if(Le(e)){t.push(e,-3);return}if(qt(e)){t.push(t.helper(e));return}switch(e.type){case 1:case 9:case 11:zt(e.codegenNode,t);break;case 2:Nx(e,t);break;case 4:Mh(e,t);break;case 5:Lx(e,t);break;case 12:zt(e.codegenNode,t);break;case 8:Ph(e,t);break;case 3:Mx(e,t);break;case 13:Px(e,t);break;case 14:$x(e,t);break;case 15:Ux(e,t);break;case 17:Bx(e,t);break;case 18:Hx(e,t);break;case 19:Vx(e,t);break;case 20:jx(e,t);break;case 21:Xi(e.body,t,!0,!1);break}}function Nx(e,t){t.push(JSON.stringify(e.content),-3,e)}function Mh(e,t){const{content:s,isStatic:n}=e;t.push(n?JSON.stringify(s):s,-3,e)}function Lx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ar),s(`${n(Tr)}(`),zt(e.content,t),s(")")}function Ph(e,t){for(let s=0;s<e.children.length;s++){const n=e.children[s];Le(n)?t.push(n,-3):zt(n,t)}}function Dx(e,t){const{push:s}=t;if(e.type===8)s("["),Ph(e,t),s("]");else if(e.isStatic){const n=Uc(e.content)?e.content:JSON.stringify(e.content);s(n,-2,e)}else s(`[${e.content}]`,-3,e)}function Mx(e,t){const{push:s,helper:n,pure:a}=t;a&&s(Ar),s(`${n(Yi)}(${JSON.stringify(e.content)})`,-3,e)}function Px(e,t){const{push:s,helper:n,pure:a}=t,{tag:i,props:l,children:r,patchFlag:o,dynamicProps:c,directives:d,isBlock:u,disableTracking:p,isComponent:h}=e;let v;o&&(v=String(o)),d&&s(n(Ic)+"("),u&&s(`(${n(ia)}(${p?"true":""}), `),a&&s(Ar);const y=u?qa(t.inSSR,h):za(t.inSSR,h);s(n(y)+"(",-2,e),Xi(Fx([i,l,r,v,c]),t),s(")"),u&&s(")"),d&&(s(", "),zt(d,t),s(")"))}function Fx(e){let t=e.length;for(;t--&&e[t]==null;);return e.slice(0,t+1).map(s=>s||"null")}function $x(e,t){const{push:s,helper:n,pure:a}=t,i=Le(e.callee)?e.callee:n(e.callee);a&&s(Ar),s(i+"(",-2,e),Xi(e.arguments,t),s(")")}function Ux(e,t){const{push:s,indent:n,deindent:a,newline:i}=t,{properties:l}=e;if(!l.length){s("{}",-2,e);return}const r=l.length>1||!1;s(r?"{":"{ "),r&&n();for(let o=0;o<l.length;o++){const{key:c,value:d}=l[o];Dx(c,t),s(": "),zt(d,t),o<l.length-1&&(s(","),i())}r&&a(),s(r?"}":" }")}function Bx(e,t){Vc(e.elements,t)}function Hx(e,t){const{push:s,indent:n,deindent:a}=t,{params:i,returns:l,body:r,newline:o,isSlot:c}=e;c&&s(`_${Va[Mc]}(`),s("(",-2,e),ve(i)?Xi(i,t):i&&zt(i,t),s(") => "),(o||r)&&(s("{"),n()),l?(o&&s("return "),ve(l)?Vc(l,t):zt(l,t)):r&&zt(r,t),(o||r)&&(a(),s("}")),c&&(e.isNonScopedSlot&&s(", undefined, true"),s(")"))}function Vx(e,t){const{test:s,consequent:n,alternate:a,newline:i}=e,{push:l,indent:r,deindent:o,newline:c}=t;if(s.type===4){const u=!Uc(s.content);u&&l("("),Mh(s,t),u&&l(")")}else l("("),zt(s,t),l(")");i&&r(),t.indentLevel++,i||l(" "),l("? "),zt(n,t),t.indentLevel--,i&&c(),i||l(" "),l(": ");const d=a.type===19;d||t.indentLevel++,zt(a,t),d||t.indentLevel--,i&&o(!0)}function jx(e,t){const{push:s,helper:n,indent:a,deindent:i,newline:l}=t,{needPauseTracking:r,needArraySpread:o}=e;o&&s("[...("),s(`_cache[${e.index}] || (`),r&&(a(),s(`${n(Jl)}(-1`),e.inVOnce&&s(", true"),s("),"),l(),s("(")),s(`_cache[${e.index}] = `),zt(e.value,t),r&&(s(`).cacheIndex = ${e.index},`),l(),s(`${n(Jl)}(1),`),l(),s(`_cache[${e.index}]`),i()),s(")"),o&&s(")]")}new RegExp("\\b"+"arguments,await,break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,let,new,return,super,switch,throw,try,var,void,while,with,yield".split(",").join("\\b|\\b")+"\\b");const zx=Lh(/^(?:if|else|else-if)$/,(e,t,s)=>qx(e,t,s,(n,a,i)=>{const l=s.parent.children;let r=l.indexOf(n),o=0;for(;r-->=0;){const c=l[r];c&&c.type===9&&(o+=c.branches.length)}return()=>{if(i)n.codegenNode=iu(a,o,s);else{const c=Gx(n.codegenNode);c.alternate=iu(a,o+n.branches.length-1,s)}}}));function qx(e,t,s,n){if(t.name!=="else"&&(!t.exp||!t.exp.content.trim())){const a=t.exp?t.exp.loc:e.loc;s.onError(ct(28,t.loc)),t.exp=Me("true",!1,a)}if(t.name==="if"){const a=au(e,t),i={type:9,loc:bx(e.loc),branches:[a]};if(s.replaceNode(i),n)return n(i,a,!0)}else{const a=s.parent.children;let i=a.indexOf(e);for(;i-->=-1;){const l=a[i];if(l&&Sh(l)){s.removeNode(l);continue}if(l&&l.type===9){(t.name==="else-if"||t.name==="else")&&l.branches[l.branches.length-1].condition===void 0&&s.onError(ct(30,e.loc)),s.removeNode();const r=au(e,t);l.branches.push(r);const o=n&&n(l,r,!1);Er(r,s),o&&o(),s.currentNode=null}else s.onError(ct(30,e.loc));break}}}function au(e,t){const s=e.tagType===3;return{type:10,loc:e.loc,condition:t.name==="else"?void 0:t.exp,children:s&&!ks(e,"for")?e.children:[e],userKey:Cr(e,"key"),isTemplateIf:s}}function iu(e,t,s){return e.condition?No(e.condition,lu(e,t,s),Et(s.helper(Yi),['""',"true"])):lu(e,t,s)}function lu(e,t,s){const{helper:n}=s,a=_t("key",Me(`${t}`,!1,gs,2)),{children:i}=e,l=i[0];if(i.length!==1||l.type!==1)if(i.length===1&&l.type===11){const o=l.codegenNode;return er(o,a,s),o}else return Ui(s,n(Fi),ws([a]),i,64,void 0,void 0,!0,!1,!1,e.loc);else{const o=l.codegenNode,c=ox(o);return c.type===13&&Fc(c,s),er(c,a,s),o}}function Gx(e){for(;;)if(e.type===19)if(e.alternate.type===19)e=e.alternate;else return e;else e.type===20&&(e=e.value)}const Kx=Lh("for",(e,t,s)=>{const{helper:n,removeHelper:a}=s;return Wx(e,t,s,i=>{const l=Et(n(Oc),[i.source]),r=Ql(e),o=ks(e,"memo"),c=Cr(e,"key",!1,!0);c&&c.type;let d=c&&(c.type===6?c.value?Me(c.value.content,!0):void 0:c.exp);const u=d?_t("key",d):null,p=i.source.type===4&&i.source.constType>0,h=p?64:c?128:256;return i.codegenNode=Ui(s,n(Fi),void 0,l,h,void 0,void 0,!0,!p,!1,e.loc),()=>{let v;const{children:y}=i,R=y.length!==1||y[0].type!==1,I=Xl(e)?e:r&&e.children.length===1&&Xl(e.children[0])?e.children[0]:null;if(I?(v=I.codegenNode,r&&u&&er(v,u,s)):R?v=Ui(s,n(Fi),u?ws([u]):void 0,e.children,64,void 0,void 0,!0,void 0,!1):(v=y[0].codegenNode,r&&u&&er(v,u,s),v.isBlock!==!p&&(v.isBlock?(a(ia),a(qa(s.inSSR,v.isComponent))):a(za(s.inSSR,v.isComponent))),v.isBlock=!p,v.isBlock?(n(ia),n(qa(s.inSSR,v.isComponent))):n(za(s.inSSR,v.isComponent))),o){const b=ja(Mo(i.parseResult,[Me("_cached")]));b.body=Jy([Ms(["const _memo = (",o.exp,")"]),Ms(["if (_cached && _cached.el",...d?[" && _cached.key === ",d]:[],` && ${s.helperString(gh)}(_cached, _memo)) return _cached`]),Ms(["const _item = ",v]),Me("_item.memo = _memo"),Me("return _item")]),l.arguments.push(b,Me("_cache"),Me(String(s.cached.length))),s.cached.push(null)}else l.arguments.push(ja(Mo(i.parseResult),v,!0))}})});function Wx(e,t,s,n){if(!t.exp){s.onError(ct(31,t.loc));return}const a=t.forParseResult;if(!a){s.onError(ct(32,t.loc));return}Fh(a);const{addIdentifiers:i,removeIdentifiers:l,scopes:r}=s,{source:o,value:c,key:d,index:u}=a,p={type:11,loc:t.loc,source:o,valueAlias:c,keyAlias:d,objectIndexAlias:u,parseResult:a,children:Ql(e)?e.children:[e]};s.replaceNode(p),r.vFor++;const h=n&&n(p);return()=>{r.vFor--,h&&h()}}function Fh(e,t){e.finalized||(e.finalized=!0)}function Mo({value:e,key:t,index:s},n=[]){return Zx([e,t,s,...n])}function Zx(e){let t=e.length;for(;t--&&!e[t];);return e.slice(0,t+1).map((s,n)=>s||Me("_".repeat(n+1),!1))}const ru=Me("undefined",!1),Jx=(e,t)=>{if(e.type===1&&(e.tagType===1||e.tagType===3)){const s=ks(e,"slot");if(s)return s.exp,t.scopes.vSlot++,()=>{t.scopes.vSlot--}}},Yx=(e,t,s,n)=>ja(e,s,!1,!0,s.length?s[0].loc:n);function Qx(e,t,s=Yx){t.helper(Mc);const{children:n,loc:a}=e,i=[],l=[];let r=t.scopes.vSlot>0||t.scopes.vFor>0;const o=ks(e,"slot",!0);if(o){const{arg:R,exp:I}=o;R&&!ls(R)&&(r=!0),i.push(_t(R||Me("default",!0),s(I,void 0,n,a)))}let c=!1,d=!1;const u=[],p=new Set;let h=0;for(let R=0;R<n.length;R++){const I=n[R];let b;if(!Ql(I)||!(b=ks(I,"slot",!0))){I.type!==3&&u.push(I);continue}if(o){t.onError(ct(37,b.loc));break}c=!0;const{children:g,loc:x}=I,{arg:E=Me("default",!0),exp:T,loc:S}=b;let w;ls(E)?w=E?E.content:"default":r=!0;const A=ks(I,"for"),L=s(T,A,g,x);let B,F;if(B=ks(I,"if"))r=!0,l.push(No(B.exp,vl(E,L,h++),ru));else if(F=ks(I,/^else(?:-if)?$/,!0)){let M=R,Z;for(;M--&&(Z=n[M],!!Sh(Z)););if(Z&&Ql(Z)&&ks(Z,/^(?:else-)?if$/)){let ne=l[l.length-1];for(;ne.alternate.type===19;)ne=ne.alternate;ne.alternate=F.exp?No(F.exp,vl(E,L,h++),ru):vl(E,L,h++)}else t.onError(ct(30,F.loc))}else if(A){r=!0;const M=A.forParseResult;M?(Fh(M),l.push(Et(t.helper(Oc),[M.source,ja(Mo(M),vl(E,L),!0)]))):t.onError(ct(32,A.loc))}else{if(w){if(p.has(w)){t.onError(ct(38,S));continue}p.add(w),w==="default"&&(d=!0)}i.push(_t(E,L))}}if(!o){const R=(I,b)=>{const g=s(I,void 0,b,a);return t.compatConfig&&(g.isNonScopedSlot=!0),_t("default",g)};c?u.length&&!u.every(Bc)&&(d?t.onError(ct(39,u[0].loc)):i.push(R(void 0,u))):i.push(R(void 0,n))}const v=r?2:Al(e.children)?3:1;let y=ws(i.concat(_t("_",Me(v+"",!1))),a);return l.length&&(y=Et(t.helper(mh),[y,ta(l)])),{slots:y,hasDynamicSlots:r}}function vl(e,t,s){const n=[_t("name",e),_t("fn",t)];return s!=null&&n.push(_t("key",Me(String(s),!0))),ws(n)}function Al(e){for(let t=0;t<e.length;t++){const s=e[t];switch(s.type){case 1:if(s.tagType===2||Al(s.children))return!0;break;case 9:if(Al(s.branches))return!0;break;case 10:case 11:if(Al(s.children))return!0;break}}return!1}const $h=new WeakMap,Xx=(e,t)=>function(){if(e=t.currentNode,!(e.type===1&&(e.tagType===0||e.tagType===1)))return;const{tag:n,props:a}=e,i=e.tagType===1;let l=i?e0(e,t):`"${n}"`;const r=Je(l)&&l.callee===Ec;let o,c,d=0,u,p,h,v=r||l===_i||l===kc||!i&&(n==="svg"||n==="foreignObject"||n==="math");if(a.length>0){const y=Uh(e,t,void 0,i,r);o=y.props,d=y.patchFlag,p=y.dynamicPropNames;const R=y.directives;h=R&&R.length?ta(R.map(I=>s0(I,t))):void 0,y.shouldUseBlock&&(v=!0)}if(e.children.length>0)if(l===Wl&&(v=!0,d|=1024),i&&l!==_i&&l!==Wl){const{slots:R,hasDynamicSlots:I}=Qx(e,t);c=R,I&&(d|=1024)}else if(e.children.length===1&&l!==_i){const R=e.children[0],I=R.type,b=I===5||I===8;b&&fs(R,t)===0&&(d|=1),b||I===2?c=R:c=e.children}else c=e.children;p&&p.length&&(u=n0(p)),e.codegenNode=Ui(t,l,o,c,d===0?void 0:d,u,h,!!v,!1,i,e.loc)};function e0(e,t,s=!1){let{tag:n}=e;const a=Po(n),i=Cr(e,"is",!1,!0);if(i)if(a||sa("COMPILER_IS_ON_ELEMENT",t)){let r;if(i.type===6?r=i.value&&Me(i.value.content,!0):(r=i.exp,r||(r=Me("is",!1,i.arg.loc))),r)return Et(t.helper(Ec),[r])}else i.type===6&&i.value.content.startsWith("vue:")&&(n=i.value.content.slice(4));const l=bh(n)||t.isBuiltInComponent(n);return l?(s||t.helper(l),l):(t.helper(Cc),t.components.add(n),Hi(n,"component"))}function Uh(e,t,s=e.props,n,a,i=!1){const{tag:l,loc:r,children:o}=e;let c=[];const d=[],u=[],p=o.length>0;let h=!1,v=0,y=!1,R=!1,I=!1,b=!1,g=!1,x=!1;const E=[],T=L=>{c.length&&(d.push(ws(ou(c),r)),c=[]),L&&d.push(L)},S=()=>{t.scopes.vFor>0&&c.push(_t(Me("ref_for",!0),Me("true")))},w=({key:L,value:B})=>{if(ls(L)){const F=L.content,M=ra(F);if(M&&(!n||a)&&F.toLowerCase()!=="onclick"&&F!=="onUpdate:modelValue"&&!dn(F)&&(b=!0),M&&dn(F)&&(x=!0),M&&B.type===14&&(B=B.arguments[0]),B.type===20||(B.type===4||B.type===8)&&fs(B,t)>0)return;F==="ref"?y=!0:F==="class"?R=!0:F==="style"?I=!0:F!=="key"&&!E.includes(F)&&E.push(F),n&&(F==="class"||F==="style")&&!E.includes(F)&&E.push(F)}else g=!0};for(let L=0;L<s.length;L++){const B=s[L];if(B.type===6){const{loc:F,name:M,nameLoc:Z,value:ne}=B;let U=!0;if(M==="ref"&&(y=!0,S()),M==="is"&&(Po(l)||ne&&ne.content.startsWith("vue:")||sa("COMPILER_IS_ON_ELEMENT",t)))continue;c.push(_t(Me(M,!0,Z),Me(ne?ne.content:"",U,ne?ne.loc:F)))}else{const{name:F,arg:M,exp:Z,loc:ne,modifiers:U}=B,O=F==="bind",N=F==="on";if(F==="slot"){n||t.onError(ct(40,ne));continue}if(F==="once"||F==="memo"||F==="is"||O&&Zn(M,"is")&&(Po(l)||sa("COMPILER_IS_ON_ELEMENT",t))||N&&i)continue;if((O&&Zn(M,"key")||N&&p&&Zn(M,"vue:before-update"))&&(h=!0),O&&Zn(M,"ref")&&S(),!M&&(O||N)){if(g=!0,Z)if(O){if(T(),sa("COMPILER_V_BIND_OBJECT_ORDER",t)){d.unshift(Z);continue}S(),T(),d.push(Z)}else T({type:14,loc:ne,callee:t.helper(Dc),arguments:n?[Z]:[Z,"true"]});else t.onError(ct(O?34:35,ne));continue}O&&U.some(G=>G.content==="prop")&&(v|=32);const j=t.directiveTransforms[F];if(j){const{props:G,needRuntime:J}=j(B,e,t);!i&&G.forEach(w),N&&M&&!ls(M)?T(ws(G,r)):c.push(...G),J&&(u.push(B),qt(J)&&$h.set(B,J))}else Km(F)||(u.push(B),p&&(h=!0))}}let A;if(d.length?(T(),d.length>1?A=Et(t.helper(Zl),d,r):A=d[0]):c.length&&(A=ws(ou(c),r)),g?v|=16:(R&&!n&&(v|=2),I&&!n&&(v|=4),E.length&&(v|=8),b&&(v|=32)),!h&&(v===0||v===32)&&(y||x||u.length>0)&&(v|=512),!t.inSSR&&A)switch(A.type){case 15:let L=-1,B=-1,F=!1;for(let ne=0;ne<A.properties.length;ne++){const U=A.properties[ne].key;ls(U)?U.content==="class"?L=ne:U.content==="style"&&(B=ne):U.isHandlerKey||(F=!0)}const M=A.properties[L],Z=A.properties[B];F?A=Et(t.helper($i),[A]):(M&&!ls(M.value)&&(M.value=Et(t.helper(Nc),[M.value])),Z&&(I||Z.value.type===4&&Z.value.content.trim()[0]==="["||Z.value.type===17)&&(Z.value=Et(t.helper(Lc),[Z.value])));break;case 14:break;default:A=Et(t.helper($i),[Et(t.helper(Qi),[A])]);break}return{props:A,directives:u,patchFlag:v,dynamicPropNames:E,shouldUseBlock:h}}function ou(e){const t=new Map,s=[];for(let n=0;n<e.length;n++){const a=e[n];if(a.key.type===8||!a.key.isStatic){s.push(a);continue}const i=a.key.content,l=t.get(i);l?(i==="style"||i==="class"||ra(i))&&t0(l,a):(t.set(i,a),s.push(a))}return s}function t0(e,t){e.value.type===17?e.value.elements.push(t.value):e.value=ta([e.value,t.value],e.loc)}function s0(e,t){const s=[],n=$h.get(e);n?s.push(t.helperString(n)):(t.helper(Ac),t.directives.add(e.name),s.push(Hi(e.name,"directive")));const{loc:a}=e;if(e.exp&&s.push(e.exp),e.arg&&(e.exp||s.push("void 0"),s.push(e.arg)),Object.keys(e.modifiers).length){e.arg||(e.exp||s.push("void 0"),s.push("void 0"));const i=Me("true",!1,a);s.push(ws(e.modifiers.map(l=>_t(l,i)),a))}return ta(s,e.loc)}function n0(e){let t="[";for(let s=0,n=e.length;s<n;s++)t+=JSON.stringify(e[s]),s<n-1&&(t+=", ");return t+"]"}function Po(e){return e==="component"||e==="Component"}const a0=(e,t)=>{if(Xl(e)){const{children:s,loc:n}=e,{slotName:a,slotProps:i}=i0(e,t),l=[t.prefixIdentifiers?"_ctx.$slots":"$slots",a,"{}","undefined","true"];let r=2;i&&(l[2]=i,r=3),s.length&&(l[3]=ja([],s,!1,!1,n),r=4),t.scopeId&&!t.slotted&&(r=5),l.splice(r),e.codegenNode=Et(t.helper(hh),l,n)}};function i0(e,t){let s='"default"',n;const a=[];for(let i=0;i<e.props.length;i++){const l=e.props[i];if(l.type===6)l.value&&(l.name==="name"?s=JSON.stringify(l.value.content):(l.name=nt(l.name),a.push(l)));else if(l.name==="bind"&&Zn(l.arg,"name")){if(l.exp)s=l.exp;else if(l.arg&&l.arg.type===4){const r=nt(l.arg.content);s=l.exp=Me(r,!1,l.arg.loc)}}else l.name==="bind"&&l.arg&&ls(l.arg)&&(l.arg.content=nt(l.arg.content)),a.push(l)}if(a.length>0){const{props:i,directives:l}=Uh(e,t,a,!1,!1);n=i,l.length&&t.onError(ct(36,l[0].loc))}return{slotName:s,slotProps:n}}const Bh=(e,t,s,n)=>{const{loc:a,modifiers:i,arg:l}=e;!e.exp&&!i.length&&s.onError(ct(35,a));let r;if(l.type===4)if(l.isStatic){let u=l.content;u.startsWith("vue:")&&(u=`vnode-${u.slice(4)}`);const p=t.tagType!==0||u.startsWith("vnode")||!/[A-Z]/.test(u)?Ra(nt(u)):`on:${u}`;r=Me(p,!0,l.loc)}else r=Ms([`${s.helperString(Oo)}(`,l,")"]);else r=l,r.children.unshift(`${s.helperString(Oo)}(`),r.children.push(")");let o=e.exp;o&&!o.content.trim()&&(o=void 0);let c=s.cacheHandlers&&!o&&!s.inVOnce;if(o){const u=_h(o),p=!(u||ax(o)),h=o.content.includes(";");(p||c&&u)&&(o=Ms([`${p?"$event":"(...args)"} => ${h?"{":"("}`,o,h?"}":")"]))}let d={props:[_t(r,o||Me("() => {}",!1,a))]};return n&&(d=n(d)),c&&(d.props[0].value=s.cache(d.props[0].value)),d.props.forEach(u=>u.key.isHandlerKey=!0),d},l0=(e,t,s)=>{const{modifiers:n,loc:a}=e,i=e.arg;let{exp:l}=e;return l&&l.type===4&&!l.content.trim()&&(l=void 0),i.type!==4?(i.children.unshift("("),i.children.push(') || ""')):i.isStatic||(i.content=i.content?`${i.content} || ""`:'""'),n.some(r=>r.content==="camel")&&(i.type===4?i.isStatic?i.content=nt(i.content):i.content=`${s.helperString(Io)}(${i.content})`:(i.children.unshift(`${s.helperString(Io)}(`),i.children.push(")"))),s.inSSR||(n.some(r=>r.content==="prop")&&cu(i,"."),n.some(r=>r.content==="attr")&&cu(i,"^")),{props:[_t(i,l)]}},cu=(e,t)=>{e.type===4?e.isStatic?e.content=t+e.content:e.content=`\`${t}\${${e.content}}\``:(e.children.unshift(`'${t}' + (`),e.children.push(")"))},r0=(e,t)=>{if(e.type===0||e.type===1||e.type===11||e.type===10)return()=>{const s=e.children;let n,a=!1;for(let i=0;i<s.length;i++){const l=s[i];if(Zr(l)){a=!0;for(let r=i+1;r<s.length;r++){const o=s[r];if(Zr(o))n||(n=s[i]=Ms([l],l.loc)),n.children.push(" + ",o),s.splice(r,1),r--;else{n=void 0;break}}}}if(!(!a||s.length===1&&(e.type===0||e.type===1&&e.tagType===0&&!e.props.find(i=>i.type===7&&!t.directiveTransforms[i.name])&&e.tag!=="template")))for(let i=0;i<s.length;i++){const l=s[i];if(Zr(l)||l.type===8){const r=[];(l.type!==2||l.content!==" ")&&r.push(l),!t.ssr&&fs(l,t)===0&&r.push("1"),s[i]={type:12,content:l,loc:l.loc,codegenNode:Et(t.helper(Tc),r)}}}}},du=new WeakSet,o0=(e,t)=>{if(e.type===1&&ks(e,"once",!0))return du.has(e)||t.inVOnce||t.inSSR?void 0:(du.add(e),t.inVOnce=!0,t.helper(Jl),()=>{t.inVOnce=!1;const s=t.currentNode;s.codegenNode&&(s.codegenNode=t.cache(s.codegenNode,!0,!0))})},Hh=(e,t,s)=>{const{exp:n,arg:a}=e;if(!n)return s.onError(ct(41,e.loc)),ii();const i=n.loc.source.trim(),l=n.type===4?n.content:i,r=s.bindingMetadata[i];if(r==="props"||r==="props-aliased")return s.onError(ct(44,n.loc)),ii();if(r==="literal-const"||r==="setup-const")return s.onError(ct(45,n.loc)),ii();if(!l.trim()||!_h(n))return s.onError(ct(42,n.loc)),ii();const o=a||Me("modelValue",!0),c=a?ls(a)?`onUpdate:${nt(a.content)}`:Ms(['"onUpdate:" + ',a]):"onUpdate:modelValue";let d;const u=s.isTS?"($event: any)":"$event";d=Ms([`${u} => ((`,n,") = $event)"]);const p=[_t(o,e.exp),_t(c,d)];if(e.modifiers.length&&t.tagType===1){const h=e.modifiers.map(y=>y.content).map(y=>(Uc(y)?y:JSON.stringify(y))+": true").join(", "),v=a?ls(a)?`${a.content}Modifiers`:Ms([a,' + "Modifiers"']):"modelModifiers";p.push(_t(v,Me(`{ ${h} }`,!1,e.loc,2)))}return ii(p)};function ii(e=[]){return{props:e}}const c0=/[\w).+\-_$\]]/,d0=(e,t)=>{sa("COMPILER_FILTERS",t)&&(e.type===5?tr(e.content,t):e.type===1&&e.props.forEach(s=>{s.type===7&&s.name!=="for"&&s.exp&&tr(s.exp,t)}))};function tr(e,t){if(e.type===4)uu(e,t);else for(let s=0;s<e.children.length;s++){const n=e.children[s];typeof n=="object"&&(n.type===4?uu(n,t):n.type===8?tr(e,t):n.type===5&&tr(n.content,t))}}function uu(e,t){const s=e.content;let n=!1,a=!1,i=!1,l=!1,r=0,o=0,c=0,d=0,u,p,h,v,y=[];for(h=0;h<s.length;h++)if(p=u,u=s.charCodeAt(h),n)u===39&&p!==92&&(n=!1);else if(a)u===34&&p!==92&&(a=!1);else if(i)u===96&&p!==92&&(i=!1);else if(l)u===47&&p!==92&&(l=!1);else if(u===124&&s.charCodeAt(h+1)!==124&&s.charCodeAt(h-1)!==124&&!r&&!o&&!c)v===void 0?(d=h+1,v=s.slice(0,h).trim()):R();else{switch(u){case 34:a=!0;break;case 39:n=!0;break;case 96:i=!0;break;case 40:c++;break;case 41:c--;break;case 91:o++;break;case 93:o--;break;case 123:r++;break;case 125:r--;break}if(u===47){let I=h-1,b;for(;I>=0&&(b=s.charAt(I),b===" ");I--);(!b||!c0.test(b))&&(l=!0)}}v===void 0?v=s.slice(0,h).trim():d!==0&&R();function R(){y.push(s.slice(d,h).trim()),d=h+1}if(y.length){for(h=0;h<y.length;h++)v=u0(v,y[h],t);e.content=v,e.ast=void 0}}function u0(e,t,s){s.helper(Rc);const n=t.indexOf("(");if(n<0)return s.filters.add(t),`${Hi(t,"filter")}(${e})`;{const a=t.slice(0,n),i=t.slice(n+1);return s.filters.add(a),`${Hi(a,"filter")}(${e}${i!==")"?","+i:i}`}}const fu=new WeakSet,f0=(e,t)=>{if(e.type===1){const s=ks(e,"memo");return!s||fu.has(e)||t.inSSR?void 0:(fu.add(e),()=>{const n=e.codegenNode||t.currentNode.codegenNode;n&&n.type===13&&(e.tagType!==1&&Fc(n,t),e.codegenNode=Et(t.helper(Pc),[s.exp,ja(void 0,n),"_cache",String(t.cached.length)]),t.cached.push(null))})}},p0=(e,t)=>{if(e.type===1){for(const s of e.props)if(s.type===7&&s.name==="bind"&&(!s.exp||s.exp.type===4&&!s.exp.content.trim())&&s.arg){const n=s.arg;if(n.type!==4||!n.isStatic)t.onError(ct(53,n.loc)),s.exp=Me("",!0,n.loc);else{const a=nt(n.content);(yh.test(a[0])||a[0]==="-")&&(s.exp=Me(a,!1,n.loc))}}}};function h0(e){return[[p0,o0,zx,f0,Kx,d0,a0,Xx,Jx,r0],{on:Bh,bind:l0,model:Hh}]}function m0(e,t={}){const s=t.onError||$c,n=t.mode==="module";t.prefixIdentifiers===!0?s(ct(48)):n&&s(ct(49));const a=!1;t.cacheHandlers&&s(ct(50)),t.scopeId&&!n&&s(ct(51));const i=Ue({},t,{prefixIdentifiers:a}),l=Le(e)?_x(e,i):e,[r,o]=h0();return Tx(l,Ue({},i,{nodeTransforms:[...r,...t.nodeTransforms||[]],directiveTransforms:Ue({},o,t.directiveTransforms||{})})),Rx(l,i)}const g0=()=>({props:[]});/**
* @vue/compiler-dom v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const Vh=Symbol(""),jh=Symbol(""),zh=Symbol(""),qh=Symbol(""),Fo=Symbol(""),Gh=Symbol(""),Kh=Symbol(""),Wh=Symbol(""),Zh=Symbol(""),Jh=Symbol("");Ky({[Vh]:"vModelRadio",[jh]:"vModelCheckbox",[zh]:"vModelText",[qh]:"vModelSelect",[Fo]:"vModelDynamic",[Gh]:"withModifiers",[Kh]:"withKeys",[Wh]:"vShow",[Zh]:"Transition",[Jh]:"TransitionGroup"});let va;function v0(e,t=!1){return va||(va=document.createElement("div")),t?(va.innerHTML=`<div foo="${e.replace(/"/g,"&quot;")}">`,va.children[0].getAttribute("foo")):(va.innerHTML=e,va.textContent)}const b0={parseMode:"html",isVoidTag:dg,isNativeTag:e=>rg(e)||og(e)||cg(e),isPreTag:e=>e==="pre",isIgnoreNewlineTag:e=>e==="pre"||e==="textarea",decodeEntities:v0,isBuiltInComponent:e=>{if(e==="Transition"||e==="transition")return Zh;if(e==="TransitionGroup"||e==="transition-group")return Jh},getNamespace(e,t,s){let n=t?t.ns:s;if(t&&n===2)if(t.tag==="annotation-xml"){if(e==="svg")return 1;t.props.some(a=>a.type===6&&a.name==="encoding"&&a.value!=null&&(a.value.content==="text/html"||a.value.content==="application/xhtml+xml"))&&(n=0)}else/^m(?:[ions]|text)$/.test(t.tag)&&e!=="mglyph"&&e!=="malignmark"&&(n=0);else t&&n===1&&(t.tag==="foreignObject"||t.tag==="desc"||t.tag==="title")&&(n=0);if(n===0){if(e==="svg")return 1;if(e==="math")return 2}return n}},y0=e=>{e.type===1&&e.props.forEach((t,s)=>{t.type===6&&t.name==="style"&&t.value&&(e.props[s]={type:7,name:"bind",arg:Me("style",!0,t.loc),exp:x0(t.value.content,t.loc),modifiers:[],loc:t.loc})})},x0=(e,t)=>{const s=cf(e);return Me(JSON.stringify(s),!1,t,3)};function Pn(e,t){return ct(e,t)}const _0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(54,a)),t.children.length&&(s.onError(Pn(55,a)),t.children.length=0),{props:[_t(Me("innerHTML",!0,a),n||Me("",!0))]}},k0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(56,a)),t.children.length&&(s.onError(Pn(57,a)),t.children.length=0),{props:[_t(Me("textContent",!0),n?fs(n,s)>0?n:Et(s.helperString(Tr),[n],a):Me("",!0))]}},w0=(e,t,s)=>{const n=Hh(e,t,s);if(!n.props.length||t.tagType===1)return n;e.arg&&s.onError(Pn(59,e.arg.loc));const{tag:a}=t,i=s.isCustomElement(a);if(a==="input"||a==="textarea"||a==="select"||i){let l=zh,r=!1;if(a==="input"||i){const o=Cr(t,"type");if(o){if(o.type===7)l=Fo;else if(o.value)switch(o.value.content){case"radio":l=Vh;break;case"checkbox":l=jh;break;case"file":r=!0,s.onError(Pn(60,e.loc));break}}else ix(t)&&(l=Fo)}else a==="select"&&(l=qh);r||(n.needRuntime=s.helper(l))}else s.onError(Pn(58,e.loc));return n.props=n.props.filter(l=>!(l.key.type===4&&l.key.content==="modelValue")),n},S0=ms("passive,once,capture"),T0=ms("stop,prevent,self,ctrl,shift,alt,meta,exact,middle"),C0=ms("left,right"),Yh=ms("onkeyup,onkeydown,onkeypress"),E0=(e,t,s,n)=>{const a=[],i=[],l=[];for(let r=0;r<t.length;r++){const o=t[r].content;o==="native"&&Bi("COMPILER_V_ON_NATIVE",s)||S0(o)?l.push(o):C0(o)?ls(e)?Yh(e.content.toLowerCase())?a.push(o):i.push(o):(a.push(o),i.push(o)):T0(o)?i.push(o):a.push(o)}return{keyModifiers:a,nonKeyModifiers:i,eventOptionModifiers:l}},pu=(e,t)=>ls(e)&&e.content.toLowerCase()==="onclick"?Me(t,!0):e.type!==4?Ms(["(",e,`) === "onClick" ? "${t}" : (`,e,")"]):e,A0=(e,t,s)=>Bh(e,t,s,n=>{const{modifiers:a}=e;if(!a.length)return n;let{key:i,value:l}=n.props[0];const{keyModifiers:r,nonKeyModifiers:o,eventOptionModifiers:c}=E0(i,a,s,e.loc);if(o.includes("right")&&(i=pu(i,"onContextmenu")),o.includes("middle")&&(i=pu(i,"onMouseup")),o.length&&(l=Et(s.helper(Gh),[l,JSON.stringify(o)])),r.length&&(!ls(i)||Yh(i.content.toLowerCase()))&&(l=Et(s.helper(Kh),[l,JSON.stringify(r)])),c.length){const d=c.map(ca).join("");i=ls(i)?Me(`${i.content}${d}`,!0):Ms(["(",i,`) + "${d}"`])}return{props:[_t(i,l)]}}),R0=(e,t,s)=>{const{exp:n,loc:a}=e;return n||s.onError(Pn(62,a)),{props:[],needRuntime:s.helper(Wh)}},I0=(e,t)=>{e.type===1&&e.tagType===0&&(e.tag==="script"||e.tag==="style")&&t.removeNode()},O0=[y0],N0={cloak:g0,html:_0,text:k0,model:w0,on:A0,show:R0};function L0(e,t={}){return m0(e,Ue({},b0,t,{nodeTransforms:[I0,...O0,...t.nodeTransforms||[]],directiveTransforms:Ue({},N0,t.directiveTransforms||{}),transformHoist:null}))}/**
* vue v3.5.38
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/const hu=Object.create(null);function D0(e,t){if(!Le(e))if(e.nodeType)e=e.innerHTML;else return Pt;const s=Jm(e,t),n=hu[s];if(n)return n;if(e[0]==="#"){const r=document.querySelector(e);e=r?r.innerHTML:""}const a=Ue({hoistStatic:!0,onError:void 0,onWarn:Pt},t);!a.isCustomElement&&typeof customElements<"u"&&(a.isCustomElement=r=>!!customElements.get(r));const{code:i}=L0(e,a),l=new Function("Vue",i)(Hy);return l._rc=!0,hu[s]=l}Dp(D0);const sr=$n({items:[]});let M0=1;function Rr(e,t="info",s=3e3){const n=M0++;return sr.items.push({id:n,message:String(e),type:t}),s>0&&setTimeout(()=>jc(n),s),n}function jc(e){const t=sr.items.findIndex(s=>s.id===e);t>=0&&sr.items.splice(t,1)}function Se(e,t="info",s=3e3){return Rr(e,t,s)}Se.success=(e,t=3e3)=>Rr(e,"success",t);Se.error=(e,t=5e3)=>Rr(e,"error",t);Se.info=(e,t=3e3)=>Rr(e,"info",t);Se.dismiss=jc;const P0={setup(){return{state:sr,dismiss:jc}},template:`
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
  `},nn=$n({open:!1,title:"Confirm",message:"",confirmLabel:"Confirm",cancelLabel:"Cancel",danger:!1});let Ma=null;function hs({title:e="Confirm",message:t="",confirmLabel:s="Confirm",cancelLabel:n="Cancel",danger:a=!1}={}){return Ma&&Ma(!1),nn.title=e,nn.message=t,nn.confirmLabel=s,nn.cancelLabel=n,nn.danger=a,nn.open=!0,new Promise(i=>{Ma=i})}function mu(e){nn.open=!1,Ma&&(Ma(e),Ma=null)}const F0={setup(){function e(t){nn.open&&t.key==="Escape"&&(t.stopPropagation(),mu(!1))}return Ke(()=>document.addEventListener("keydown",e,!0)),bt(()=>document.removeEventListener("keydown",e,!0)),{state:nn,settle:mu}},template:`
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
 */const wa=typeof document<"u";function Qh(e){return typeof e=="object"||"displayName"in e||"props"in e||"__vccOpts"in e}function $0(e){return e.__esModule||e[Symbol.toStringTag]==="Module"||e.default&&Qh(e.default)}const et=Object.assign;function Yr(e,t){const s={};for(const n in t){const a=t[n];s[n]=Fs(a)?a.map(e):e(a)}return s}const ki=()=>{},Fs=Array.isArray;function gu(e,t){const s={};for(const n in e)s[n]=n in t?t[n]:e[n];return s}const Xh=/#/g,U0=/&/g,B0=/\//g,H0=/=/g,V0=/\?/g,em=/\+/g,j0=/%5B/g,z0=/%5D/g,tm=/%5E/g,q0=/%60/g,sm=/%7B/g,G0=/%7C/g,nm=/%7D/g,K0=/%20/g;function zc(e){return e==null?"":encodeURI(""+e).replace(G0,"|").replace(j0,"[").replace(z0,"]")}function W0(e){return zc(e).replace(sm,"{").replace(nm,"}").replace(tm,"^")}function $o(e){return zc(e).replace(em,"%2B").replace(K0,"+").replace(Xh,"%23").replace(U0,"%26").replace(q0,"`").replace(sm,"{").replace(nm,"}").replace(tm,"^")}function Z0(e){return $o(e).replace(H0,"%3D")}function J0(e){return zc(e).replace(Xh,"%23").replace(V0,"%3F")}function Y0(e){return J0(e).replace(B0,"%2F")}function ji(e){if(e==null)return null;try{return decodeURIComponent(""+e)}catch{}return""+e}const Q0=/\/$/,X0=e=>e.replace(Q0,"");function Qr(e,t,s="/"){let n,a={},i="",l="";const r=t.indexOf("#");let o=t.indexOf("?");return o=r>=0&&o>r?-1:o,o>=0&&(n=t.slice(0,o),i=t.slice(o,r>0?r:t.length),a=e(i.slice(1))),r>=0&&(n=n||t.slice(0,r),l=t.slice(r,t.length)),n=n_(n??t,s),{fullPath:n+i+l,path:n,query:a,hash:ji(l)}}function e_(e,t){const s=t.query?e(t.query):"";return t.path+(s&&"?")+s+(t.hash||"")}function vu(e,t){return!t||!e.toLowerCase().startsWith(t.toLowerCase())?e:e.slice(t.length)||"/"}function t_(e,t,s){const n=t.matched.length-1,a=s.matched.length-1;return n>-1&&n===a&&Ga(t.matched[n],s.matched[a])&&am(t.params,s.params)&&e(t.query)===e(s.query)&&t.hash===s.hash}function Ga(e,t){return(e.aliasOf||e)===(t.aliasOf||t)}function am(e,t){if(Object.keys(e).length!==Object.keys(t).length)return!1;for(var s in e)if(!s_(e[s],t[s]))return!1;return!0}function s_(e,t){return Fs(e)?bu(e,t):Fs(t)?bu(t,e):(e==null?void 0:e.valueOf())===(t==null?void 0:t.valueOf())}function bu(e,t){return Fs(t)?e.length===t.length&&e.every((s,n)=>s===t[n]):e.length===1&&e[0]===t}function n_(e,t){if(e.startsWith("/"))return e;if(!e)return t;const s=t.split("/"),n=e.split("/"),a=n[n.length-1];(a===".."||a===".")&&n.push("");let i=s.length-1,l,r;for(l=0;l<n.length;l++)if(r=n[l],r!==".")if(r==="..")i>1&&i--;else break;return s.slice(0,i).join("/")+"/"+n.slice(l).join("/")}const An={path:"/",name:void 0,params:{},query:{},hash:"",fullPath:"/",matched:[],meta:{},redirectedFrom:void 0};let Uo=(function(e){return e.pop="pop",e.push="push",e})({}),Xr=(function(e){return e.back="back",e.forward="forward",e.unknown="",e})({});function a_(e){if(!e)if(wa){const t=document.querySelector("base");e=t&&t.getAttribute("href")||"/",e=e.replace(/^\w+:\/\/[^\/]+/,"")}else e="/";return e[0]!=="/"&&e[0]!=="#"&&(e="/"+e),X0(e)}const i_=/^[^#]+#/;function l_(e,t){return e.replace(i_,"#")+t}function r_(e,t){const s=document.documentElement.getBoundingClientRect(),n=e.getBoundingClientRect();return{behavior:t.behavior,left:n.left-s.left-(t.left||0),top:n.top-s.top-(t.top||0)}}const Ir=()=>({left:window.scrollX,top:window.scrollY});function o_(e){let t;if("el"in e){const s=e.el,n=typeof s=="string"&&s.startsWith("#"),a=typeof s=="string"?n?document.getElementById(s.slice(1)):document.querySelector(s):s;if(!a)return;t=r_(a,e)}else t=e;"scrollBehavior"in document.documentElement.style?window.scrollTo(t):window.scrollTo(t.left!=null?t.left:window.scrollX,t.top!=null?t.top:window.scrollY)}function yu(e,t){return(history.state?history.state.position-t:-1)+e}const Bo=new Map;function c_(e,t){Bo.set(e,t)}function d_(e){const t=Bo.get(e);return Bo.delete(e),t}function u_(e){return typeof e=="string"||e&&typeof e=="object"}function im(e){return typeof e=="string"||typeof e=="symbol"}let ht=(function(e){return e[e.MATCHER_NOT_FOUND=1]="MATCHER_NOT_FOUND",e[e.NAVIGATION_GUARD_REDIRECT=2]="NAVIGATION_GUARD_REDIRECT",e[e.NAVIGATION_ABORTED=4]="NAVIGATION_ABORTED",e[e.NAVIGATION_CANCELLED=8]="NAVIGATION_CANCELLED",e[e.NAVIGATION_DUPLICATED=16]="NAVIGATION_DUPLICATED",e})({});const lm=Symbol("");ht.MATCHER_NOT_FOUND+"",ht.NAVIGATION_GUARD_REDIRECT+"",ht.NAVIGATION_ABORTED+"",ht.NAVIGATION_CANCELLED+"",ht.NAVIGATION_DUPLICATED+"";function Ka(e,t){return et(new Error,{type:e,[lm]:!0},t)}function Qs(e,t){return e instanceof Error&&lm in e&&(t==null||!!(e.type&t))}const f_=["params","query","hash"];function p_(e){if(typeof e=="string")return e;if(e.path!=null)return e.path;const t={};for(const s of f_)s in e&&(t[s]=e[s]);return JSON.stringify(t,null,2)}function h_(e){const t={};if(e===""||e==="?")return t;const s=(e[0]==="?"?e.slice(1):e).split("&");for(let n=0;n<s.length;++n){const a=s[n].replace(em," "),i=a.indexOf("="),l=ji(i<0?a:a.slice(0,i)),r=i<0?null:ji(a.slice(i+1));if(l in t){let o=t[l];Fs(o)||(o=t[l]=[o]),o.push(r)}else t[l]=r}return t}function xu(e){let t="";for(let s in e){const n=e[s];if(s=Z0(s),n==null){n!==void 0&&(t+=(t.length?"&":"")+s);continue}(Fs(n)?n.map(a=>a&&$o(a)):[n&&$o(n)]).forEach(a=>{a!==void 0&&(t+=(t.length?"&":"")+s,a!=null&&(t+="="+a))})}return t}function m_(e){const t={};for(const s in e){const n=e[s];n!==void 0&&(t[s]=Fs(n)?n.map(a=>a==null?null:""+a):n==null?n:""+n)}return t}const g_=Symbol(""),_u=Symbol(""),Or=Symbol(""),qc=Symbol(""),Ho=Symbol("");function li(){let e=[];function t(n){return e.push(n),()=>{const a=e.indexOf(n);a>-1&&e.splice(a,1)}}function s(){e=[]}return{add:t,list:()=>e.slice(),reset:s}}function Dn(e,t,s,n,a,i=l=>l()){const l=n&&(n.enterCallbacks[a]=n.enterCallbacks[a]||[]);return()=>new Promise((r,o)=>{const c=p=>{p===!1?o(Ka(ht.NAVIGATION_ABORTED,{from:s,to:t})):p instanceof Error?o(p):u_(p)?o(Ka(ht.NAVIGATION_GUARD_REDIRECT,{from:t,to:p})):(l&&n.enterCallbacks[a]===l&&typeof p=="function"&&l.push(p),r())},d=i(()=>e.call(n&&n.instances[a],t,s,c));let u=Promise.resolve(d);e.length<3&&(u=u.then(c)),u.catch(p=>o(p))})}function eo(e,t,s,n,a=i=>i()){const i=[];for(const l of e)for(const r in l.components){let o=l.components[r];if(!(t!=="beforeRouteEnter"&&!l.instances[r]))if(Qh(o)){const c=(o.__vccOpts||o)[t];c&&i.push(Dn(c,s,n,l,r,a))}else{let c=o();i.push(()=>c.then(d=>{if(!d)throw new Error(`Couldn't resolve component "${r}" at "${l.path}"`);const u=$0(d)?d.default:d;l.mods[r]=d,l.components[r]=u;const p=(u.__vccOpts||u)[t];return p&&Dn(p,s,n,l,r,a)()}))}}return i}function v_(e,t){const s=[],n=[],a=[],i=Math.max(t.matched.length,e.matched.length);for(let l=0;l<i;l++){const r=t.matched[l];r&&(e.matched.find(c=>Ga(c,r))?n.push(r):s.push(r));const o=e.matched[l];o&&(t.matched.find(c=>Ga(c,o))||a.push(o))}return[s,n,a]}/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */let b_=()=>location.protocol+"//"+location.host;function rm(e,t){const{pathname:s,search:n,hash:a}=t,i=e.indexOf("#");if(i>-1){let l=a.includes(e.slice(i))?e.slice(i).length:1,r=a.slice(l);return r[0]!=="/"&&(r="/"+r),vu(r,"")}return vu(s,e)+n+a}function y_(e,t,s,n){let a=[],i=[],l=null;const r=({state:p})=>{const h=rm(e,location),v=s.value,y=t.value;let R=0;if(p){if(s.value=h,t.value=p,l&&l===v){l=null;return}R=y?p.position-y.position:0}else n(h);a.forEach(I=>{I(s.value,v,{delta:R,type:Uo.pop,direction:R?R>0?Xr.forward:Xr.back:Xr.unknown})})};function o(){l=s.value}function c(p){a.push(p);const h=()=>{const v=a.indexOf(p);v>-1&&a.splice(v,1)};return i.push(h),h}function d(){if(document.visibilityState==="hidden"){const{history:p}=window;if(!p.state)return;p.replaceState(et({},p.state,{scroll:Ir()}),"")}}function u(){for(const p of i)p();i=[],window.removeEventListener("popstate",r),window.removeEventListener("pagehide",d),document.removeEventListener("visibilitychange",d)}return window.addEventListener("popstate",r),window.addEventListener("pagehide",d),document.addEventListener("visibilitychange",d),{pauseListeners:o,listen:c,destroy:u}}function ku(e,t,s,n=!1,a=!1){return{back:e,current:t,forward:s,replaced:n,position:window.history.length,scroll:a?Ir():null}}function x_(e){const{history:t,location:s}=window,n={value:rm(e,s)},a={value:t.state};a.value||i(n.value,{back:null,current:n.value,forward:null,position:t.length-1,replaced:!0,scroll:null},!0);function i(o,c,d){const u=e.indexOf("#"),p=u>-1?(s.host&&document.querySelector("base")?e:e.slice(u))+o:b_()+e+o;try{t[d?"replaceState":"pushState"](c,"",p),a.value=c}catch(h){console.error(h),s[d?"replace":"assign"](p)}}function l(o,c){i(o,et({},t.state,ku(a.value.back,o,a.value.forward,!0),c,{position:a.value.position}),!0),n.value=o}function r(o,c){const d=et({},a.value,t.state,{forward:o,scroll:Ir()});i(d.current,d,!0),i(o,et({},ku(n.value,o,null),{position:d.position+1},c),!1),n.value=o}return{location:n,state:a,push:r,replace:l}}function __(e){e=a_(e);const t=x_(e),s=y_(e,t.state,t.location,t.replace);function n(i,l=!0){l||s.pauseListeners(),history.go(i)}const a=et({location:"",base:e,go:n,createHref:l_.bind(null,e)},t,s);return Object.defineProperty(a,"location",{enumerable:!0,get:()=>t.location.value}),Object.defineProperty(a,"state",{enumerable:!0,get:()=>t.state.value}),a}function k_(e){return e=location.host?e||location.pathname+location.search:"",e.includes("#")||(e+="#"),__(e)}let Yn=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.Group=2]="Group",e})({});var St=(function(e){return e[e.Static=0]="Static",e[e.Param=1]="Param",e[e.ParamRegExp=2]="ParamRegExp",e[e.ParamRegExpEnd=3]="ParamRegExpEnd",e[e.EscapeNext=4]="EscapeNext",e})(St||{});const w_={type:Yn.Static,value:""},S_=/[a-zA-Z0-9_]/;function T_(e){if(!e)return[[]];if(e==="/")return[[w_]];if(!e.startsWith("/"))throw new Error(`Invalid path "${e}"`);function t(h){throw new Error(`ERR (${s})/"${c}": ${h}`)}let s=St.Static,n=s;const a=[];let i;function l(){i&&a.push(i),i=[]}let r=0,o,c="",d="";function u(){c&&(s===St.Static?i.push({type:Yn.Static,value:c}):s===St.Param||s===St.ParamRegExp||s===St.ParamRegExpEnd?(i.length>1&&(o==="*"||o==="+")&&t(`A repeatable param (${c}) must be alone in its segment. eg: '/:ids+.`),i.push({type:Yn.Param,value:c,regexp:d,repeatable:o==="*"||o==="+",optional:o==="*"||o==="?"})):t("Invalid state to consume buffer"),c="")}function p(){c+=o}for(;r<e.length;){if(o=e[r++],o==="\\"&&s!==St.ParamRegExp){n=s,s=St.EscapeNext;continue}switch(s){case St.Static:o==="/"?(c&&u(),l()):o===":"?(u(),s=St.Param):p();break;case St.EscapeNext:p(),s=n;break;case St.Param:o==="("?s=St.ParamRegExp:S_.test(o)?p():(u(),s=St.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--);break;case St.ParamRegExp:o===")"?d[d.length-1]=="\\"?d=d.slice(0,-1)+o:s=St.ParamRegExpEnd:d+=o;break;case St.ParamRegExpEnd:u(),s=St.Static,o!=="*"&&o!=="?"&&o!=="+"&&r--,d="";break;default:t("Unknown state");break}}return s===St.ParamRegExp&&t(`Unfinished custom RegExp for param "${c}"`),u(),l(),a}const wu="[^/]+?",C_={sensitive:!1,strict:!1,start:!0,end:!0};var Wt=(function(e){return e[e._multiplier=10]="_multiplier",e[e.Root=90]="Root",e[e.Segment=40]="Segment",e[e.SubSegment=30]="SubSegment",e[e.Static=40]="Static",e[e.Dynamic=20]="Dynamic",e[e.BonusCustomRegExp=10]="BonusCustomRegExp",e[e.BonusWildcard=-50]="BonusWildcard",e[e.BonusRepeatable=-20]="BonusRepeatable",e[e.BonusOptional=-8]="BonusOptional",e[e.BonusStrict=.7000000000000001]="BonusStrict",e[e.BonusCaseSensitive=.25]="BonusCaseSensitive",e})(Wt||{});const E_=/[.+*?^${}()[\]/\\]/g;function A_(e,t){const s=et({},C_,t),n=[];let a=s.start?"^":"";const i=[];for(const c of e){const d=c.length?[]:[Wt.Root];s.strict&&!c.length&&(a+="/");for(let u=0;u<c.length;u++){const p=c[u];let h=Wt.Segment+(s.sensitive?Wt.BonusCaseSensitive:0);if(p.type===Yn.Static)u||(a+="/"),a+=p.value.replace(E_,"\\$&"),h+=Wt.Static;else if(p.type===Yn.Param){const{value:v,repeatable:y,optional:R,regexp:I}=p;i.push({name:v,repeatable:y,optional:R});const b=I||wu;if(b!==wu){h+=Wt.BonusCustomRegExp;try{`${b}`}catch(x){throw new Error(`Invalid custom RegExp for param "${v}" (${b}): `+x.message)}}let g=y?`((?:${b})(?:/(?:${b}))*)`:`(${b})`;u||(g=R&&c.length<2?`(?:/${g})`:"/"+g),R&&(g+="?"),a+=g,h+=Wt.Dynamic,R&&(h+=Wt.BonusOptional),y&&(h+=Wt.BonusRepeatable),b===".*"&&(h+=Wt.BonusWildcard)}d.push(h)}n.push(d)}if(s.strict&&s.end){const c=n.length-1;n[c][n[c].length-1]+=Wt.BonusStrict}s.strict||(a+="/?"),s.end?a+="$":s.strict&&!a.endsWith("/")&&(a+="(?:/|$)");const l=new RegExp(a,s.sensitive?"":"i");function r(c){const d=c.match(l),u={};if(!d)return null;for(let p=1;p<d.length;p++){const h=d[p]||"",v=i[p-1];u[v.name]=h&&v.repeatable?h.split("/"):h}return u}function o(c){let d="",u=!1;for(const p of e){(!u||!d.endsWith("/"))&&(d+="/"),u=!1;for(const h of p)if(h.type===Yn.Static)d+=h.value;else if(h.type===Yn.Param){const{value:v,repeatable:y,optional:R}=h,I=v in c?c[v]:"";if(Fs(I)&&!y)throw new Error(`Provided param "${v}" is an array but it is not repeatable (* or + modifiers)`);const b=Fs(I)?I.join("/"):I;if(!b)if(R)p.length<2&&(d.endsWith("/")?d=d.slice(0,-1):u=!0);else throw new Error(`Missing required param "${v}"`);d+=b}}return d||"/"}return{re:l,score:n,keys:i,parse:r,stringify:o}}function R_(e,t){let s=0;for(;s<e.length&&s<t.length;){const n=t[s]-e[s];if(n)return n;s++}return e.length<t.length?e.length===1&&e[0]===Wt.Static+Wt.Segment?-1:1:e.length>t.length?t.length===1&&t[0]===Wt.Static+Wt.Segment?1:-1:0}function om(e,t){let s=0;const n=e.score,a=t.score;for(;s<n.length&&s<a.length;){const i=R_(n[s],a[s]);if(i)return i;s++}if(Math.abs(a.length-n.length)===1){if(Su(n))return 1;if(Su(a))return-1}return a.length-n.length}function Su(e){const t=e[e.length-1];return e.length>0&&t[t.length-1]<0}const I_={strict:!1,end:!0,sensitive:!1};function O_(e,t,s){const n=A_(T_(e.path),s),a=et(n,{record:e,parent:t,children:[],alias:[]});return t&&!a.record.aliasOf==!t.record.aliasOf&&t.children.push(a),a}function N_(e,t){const s=[],n=new Map;t=gu(I_,t);function a(u){return n.get(u)}function i(u,p,h){const v=!h,y=Cu(u);y.aliasOf=h&&h.record;const R=gu(t,u),I=[y];if("alias"in u){const x=typeof u.alias=="string"?[u.alias]:u.alias;for(const E of x)I.push(Cu(et({},y,{components:h?h.record.components:y.components,path:E,aliasOf:h?h.record:y})))}let b,g;for(const x of I){const{path:E}=x;if(p&&E[0]!=="/"){const T=p.record.path,S=T[T.length-1]==="/"?"":"/";x.path=p.record.path+(E&&S+E)}if(b=O_(x,p,R),h?h.alias.push(b):(g=g||b,g!==b&&g.alias.push(b),v&&u.name&&!Eu(b)&&l(u.name)),cm(b)&&o(b),y.children){const T=y.children;for(let S=0;S<T.length;S++)i(T[S],b,h&&h.children[S])}h=h||b}return g?()=>{l(g)}:ki}function l(u){if(im(u)){const p=n.get(u);p&&(n.delete(u),s.splice(s.indexOf(p),1),p.children.forEach(l),p.alias.forEach(l))}else{const p=s.indexOf(u);p>-1&&(s.splice(p,1),u.record.name&&n.delete(u.record.name),u.children.forEach(l),u.alias.forEach(l))}}function r(){return s}function o(u){const p=M_(u,s);s.splice(p,0,u),u.record.name&&!Eu(u)&&n.set(u.record.name,u)}function c(u,p){let h,v={},y,R;if("name"in u&&u.name){if(h=n.get(u.name),!h)throw Ka(ht.MATCHER_NOT_FOUND,{location:u});R=h.record.name,v=et(Tu(p.params,h.keys.filter(g=>!g.optional).concat(h.parent?h.parent.keys.filter(g=>g.optional):[]).map(g=>g.name)),u.params&&Tu(u.params,h.keys.map(g=>g.name))),y=h.stringify(v)}else if(u.path!=null)y=u.path,h=s.find(g=>g.re.test(y)),h&&(v=h.parse(y),R=h.record.name);else{if(h=p.name?n.get(p.name):s.find(g=>g.re.test(p.path)),!h)throw Ka(ht.MATCHER_NOT_FOUND,{location:u,currentLocation:p});R=h.record.name,v=et({},p.params,u.params),y=h.stringify(v)}const I=[];let b=h;for(;b;)I.unshift(b.record),b=b.parent;return{name:R,path:y,params:v,matched:I,meta:D_(I)}}e.forEach(u=>i(u));function d(){s.length=0,n.clear()}return{addRoute:i,resolve:c,removeRoute:l,clearRoutes:d,getRoutes:r,getRecordMatcher:a}}function Tu(e,t){const s={};for(const n of t)n in e&&(s[n]=e[n]);return s}function Cu(e){const t={path:e.path,redirect:e.redirect,name:e.name,meta:e.meta||{},aliasOf:e.aliasOf,beforeEnter:e.beforeEnter,props:L_(e),children:e.children||[],instances:{},leaveGuards:new Set,updateGuards:new Set,enterCallbacks:{},components:"components"in e?e.components||null:e.component&&{default:e.component}};return Object.defineProperty(t,"mods",{value:{}}),t}function L_(e){const t={},s=e.props||!1;if("component"in e)t.default=s;else for(const n in e.components)t[n]=typeof s=="object"?s[n]:s;return t}function Eu(e){for(;e;){if(e.record.aliasOf)return!0;e=e.parent}return!1}function D_(e){return e.reduce((t,s)=>et(t,s.meta),{})}function M_(e,t){let s=0,n=t.length;for(;s!==n;){const i=s+n>>1;om(e,t[i])<0?n=i:s=i+1}const a=P_(e);return a&&(n=t.lastIndexOf(a,n-1)),n}function P_(e){let t=e;for(;t=t.parent;)if(cm(t)&&om(e,t)===0)return t}function cm({record:e}){return!!(e.name||e.components&&Object.keys(e.components).length||e.redirect)}function Au(e){const t=Ss(Or),s=Ss(qc),n=Y(()=>{const o=Gs(e.to);return t.resolve(o)}),a=Y(()=>{const{matched:o}=n.value,{length:c}=o,d=o[c-1],u=s.matched;if(!d||!u.length)return-1;const p=u.findIndex(Ga.bind(null,d));if(p>-1)return p;const h=Ru(o[c-2]);return c>1&&Ru(d)===h&&u[u.length-1].path!==h?u.findIndex(Ga.bind(null,o[c-2])):p}),i=Y(()=>a.value>-1&&H_(s.params,n.value.params)),l=Y(()=>a.value>-1&&a.value===s.matched.length-1&&am(s.params,n.value.params));function r(o={}){if(B_(o)){const c=t[Gs(e.replace)?"replace":"push"](Gs(e.to)).catch(ki);return e.viewTransition&&typeof document<"u"&&"startViewTransition"in document&&document.startViewTransition(()=>c),c}return Promise.resolve()}return{route:n,href:Y(()=>n.value.href),isActive:i,isExactActive:l,navigate:r}}function F_(e){return e.length===1?e[0]:e}const $_=Wi({name:"RouterLink",compatConfig:{MODE:3},props:{to:{type:[String,Object],required:!0},replace:Boolean,activeClass:String,exactActiveClass:String,custom:Boolean,ariaCurrentValue:{type:String,default:"page"},viewTransition:Boolean},useLink:Au,setup(e,{slots:t}){const s=$n(Au(e)),{options:n}=Ss(Or),a=Y(()=>({[Iu(e.activeClass,n.linkActiveClass,"router-link-active")]:s.isActive,[Iu(e.exactActiveClass,n.linkExactActiveClass,"router-link-exact-active")]:s.isExactActive}));return()=>{const i=t.default&&F_(t.default(s));return e.custom?i:Ua("a",{"aria-current":s.isExactActive?e.ariaCurrentValue:null,href:s.href,onClick:s.navigate,class:a.value},i)}}}),U_=$_;function B_(e){if(!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)&&!e.defaultPrevented&&!(e.button!==void 0&&e.button!==0)){if(e.currentTarget&&e.currentTarget.getAttribute){const t=e.currentTarget.getAttribute("target");if(/\b_blank\b/i.test(t))return}return e.preventDefault&&e.preventDefault(),!0}}function H_(e,t){for(const s in t){const n=t[s],a=e[s];if(typeof n=="string"){if(n!==a)return!1}else if(!Fs(a)||a.length!==n.length||n.some((i,l)=>i.valueOf()!==a[l].valueOf()))return!1}return!0}function Ru(e){return e?e.aliasOf?e.aliasOf.path:e.path:""}const Iu=(e,t,s)=>e??t??s,V_=Wi({name:"RouterView",inheritAttrs:!1,props:{name:{type:String,default:"default"},route:Object},compatConfig:{MODE:3},setup(e,{attrs:t,slots:s}){const n=Ss(Ho),a=Y(()=>e.route||n.value),i=Ss(_u,0),l=Y(()=>{let c=Gs(i);const{matched:d}=a.value;let u;for(;(u=d[c])&&!u.components;)c++;return c}),r=Y(()=>a.value.matched[l.value]);vi(_u,Y(()=>l.value+1)),vi(g_,r),vi(Ho,a);const o=m();return Yt(()=>[o.value,r.value,e.name],([c,d,u],[p,h,v])=>{d&&(d.instances[u]=c,h&&h!==d&&c&&c===p&&(d.leaveGuards.size||(d.leaveGuards=h.leaveGuards),d.updateGuards.size||(d.updateGuards=h.updateGuards))),c&&d&&(!h||!Ga(d,h)||!p)&&(d.enterCallbacks[u]||[]).forEach(y=>y(c))},{flush:"post"}),()=>{const c=a.value,d=e.name,u=r.value,p=u&&u.components[d];if(!p)return Ou(s.default,{Component:p,route:c});const h=u.props[d],v=h?h===!0?c.params:typeof h=="function"?h(c):h:null,R=Ua(p,et({},v,t,{onVnodeUnmounted:I=>{I.component.isUnmounted&&(u.instances[d]=null)},ref:o}));return Ou(s.default,{Component:R,route:c})||R}}});function Ou(e,t){if(!e)return null;const s=e(t);return s.length===1?s[0]:s}const j_=V_;function z_(e){const t=N_(e.routes,e),s=e.parseQuery||h_,n=e.stringifyQuery||xu,a=e.history,i=li(),l=li(),r=li(),o=tc(An);let c=An;wa&&e.scrollBehavior&&"scrollRestoration"in history&&(history.scrollRestoration="manual");const d=Yr.bind(null,H=>""+H),u=Yr.bind(null,Y0),p=Yr.bind(null,ji);function h(H,ue){let de,be;return im(H)?(de=t.getRecordMatcher(H),be=ue):be=H,t.addRoute(be,de)}function v(H){const ue=t.getRecordMatcher(H);ue&&t.removeRoute(ue)}function y(){return t.getRoutes().map(H=>H.record)}function R(H){return!!t.getRecordMatcher(H)}function I(H,ue){if(ue=et({},ue||o.value),typeof H=="string"){const C=Qr(s,H,ue.path),$=t.resolve({path:C.path},ue),X=a.createHref(C.fullPath);return et(C,$,{params:p($.params),hash:ji(C.hash),redirectedFrom:void 0,href:X})}let de;if(H.path!=null)de=et({},H,{path:Qr(s,H.path,ue.path).path});else{const C=et({},H.params);for(const $ in C)C[$]==null&&delete C[$];de=et({},H,{params:u(C)}),ue.params=u(ue.params)}const be=t.resolve(de,ue),ge=H.hash||"";be.params=d(p(be.params));const De=e_(n,et({},H,{hash:W0(ge),path:be.path})),_=a.createHref(De);return et({fullPath:De,hash:ge,query:n===xu?m_(H.query):H.query||{}},be,{redirectedFrom:void 0,href:_})}function b(H){return typeof H=="string"?Qr(s,H,o.value.path):et({},H)}function g(H,ue){if(c!==H)return Ka(ht.NAVIGATION_CANCELLED,{from:ue,to:H})}function x(H){return S(H)}function E(H){return x(et(b(H),{replace:!0}))}function T(H,ue){const de=H.matched[H.matched.length-1];if(de&&de.redirect){const{redirect:be}=de;let ge=typeof be=="function"?be(H,ue):be;return typeof ge=="string"&&(ge=ge.includes("?")||ge.includes("#")?ge=b(ge):{path:ge},ge.params={}),et({query:H.query,hash:H.hash,params:ge.path!=null?{}:H.params},ge)}}function S(H,ue){const de=c=I(H),be=o.value,ge=H.state,De=H.force,_=H.replace===!0,C=T(de,be);if(C)return S(et(b(C),{state:typeof C=="object"?et({},ge,C.state):ge,force:De,replace:_}),ue||de);const $=de;$.redirectedFrom=ue;let X;return!De&&t_(n,be,de)&&(X=Ka(ht.NAVIGATION_DUPLICATED,{to:$,from:be}),J(be,be,!0,!1)),(X?Promise.resolve(X):L($,be)).catch(K=>Qs(K)?Qs(K,ht.NAVIGATION_GUARD_REDIRECT)?K:G(K):N(K,$,be)).then(K=>{if(K){if(Qs(K,ht.NAVIGATION_GUARD_REDIRECT))return S(et({replace:_},b(K.to),{state:typeof K.to=="object"?et({},ge,K.to.state):ge,force:De}),ue||$)}else K=F($,be,!0,_,ge);return B($,be,K),K})}function w(H,ue){const de=g(H,ue);return de?Promise.reject(de):Promise.resolve()}function A(H){const ue=P.values().next().value;return ue&&typeof ue.runWithContext=="function"?ue.runWithContext(H):H()}function L(H,ue){let de;const[be,ge,De]=v_(H,ue);de=eo(be.reverse(),"beforeRouteLeave",H,ue);for(const C of be)C.leaveGuards.forEach($=>{de.push(Dn($,H,ue))});const _=w.bind(null,H,ue);return de.push(_),_e(de).then(()=>{de=[];for(const C of i.list())de.push(Dn(C,H,ue));return de.push(_),_e(de)}).then(()=>{de=eo(ge,"beforeRouteUpdate",H,ue);for(const C of ge)C.updateGuards.forEach($=>{de.push(Dn($,H,ue))});return de.push(_),_e(de)}).then(()=>{de=[];for(const C of De)if(C.beforeEnter)if(Fs(C.beforeEnter))for(const $ of C.beforeEnter)de.push(Dn($,H,ue));else de.push(Dn(C.beforeEnter,H,ue));return de.push(_),_e(de)}).then(()=>(H.matched.forEach(C=>C.enterCallbacks={}),de=eo(De,"beforeRouteEnter",H,ue,A),de.push(_),_e(de))).then(()=>{de=[];for(const C of l.list())de.push(Dn(C,H,ue));return de.push(_),_e(de)}).catch(C=>Qs(C,ht.NAVIGATION_CANCELLED)?C:Promise.reject(C))}function B(H,ue,de){r.list().forEach(be=>A(()=>be(H,ue,de)))}function F(H,ue,de,be,ge){const De=g(H,ue);if(De)return De;const _=ue===An,C=wa?history.state:{};de&&(be||_?a.replace(H.fullPath,et({scroll:_&&C&&C.scroll},ge)):a.push(H.fullPath,ge)),o.value=H,J(H,ue,de,_),G()}let M;function Z(){M||(M=a.listen((H,ue,de)=>{if(!te.listening)return;const be=I(H),ge=T(be,te.currentRoute.value);if(ge){S(et(ge,{replace:!0,force:!0}),be).catch(ki);return}c=be;const De=o.value;wa&&c_(yu(De.fullPath,de.delta),Ir()),L(be,De).catch(_=>Qs(_,ht.NAVIGATION_ABORTED|ht.NAVIGATION_CANCELLED)?_:Qs(_,ht.NAVIGATION_GUARD_REDIRECT)?(S(et(b(_.to),{force:!0}),be).then(C=>{Qs(C,ht.NAVIGATION_ABORTED|ht.NAVIGATION_DUPLICATED)&&!de.delta&&de.type===Uo.pop&&a.go(-1,!1)}).catch(ki),Promise.reject()):(de.delta&&a.go(-de.delta,!1),N(_,be,De))).then(_=>{_=_||F(be,De,!1),_&&(de.delta&&!Qs(_,ht.NAVIGATION_CANCELLED)?a.go(-de.delta,!1):de.type===Uo.pop&&Qs(_,ht.NAVIGATION_ABORTED|ht.NAVIGATION_DUPLICATED)&&a.go(-1,!1)),B(be,De,_)}).catch(ki)}))}let ne=li(),U=li(),O;function N(H,ue,de){G(H);const be=U.list();return be.length?be.forEach(ge=>ge(H,ue,de)):console.error(H),Promise.reject(H)}function j(){return O&&o.value!==An?Promise.resolve():new Promise((H,ue)=>{ne.add([H,ue])})}function G(H){return O||(O=!H,Z(),ne.list().forEach(([ue,de])=>H?de(H):ue()),ne.reset()),H}function J(H,ue,de,be){const{scrollBehavior:ge}=e;if(!wa||!ge)return Promise.resolve();const De=!de&&d_(yu(H.fullPath,0))||(be||!de)&&history.state&&history.state.scroll||null;return Ct().then(()=>ge(H,ue,De)).then(_=>_&&o_(_)).catch(_=>N(_,H,ue))}const ae=H=>a.go(H);let ce;const P=new Set,te={currentRoute:o,listening:!0,addRoute:h,removeRoute:v,clearRoutes:t.clearRoutes,hasRoute:R,getRoutes:y,resolve:I,options:e,push:x,replace:E,go:ae,back:()=>ae(-1),forward:()=>ae(1),beforeEach:i.add,beforeResolve:l.add,afterEach:r.add,onError:U.add,isReady:j,install(H){H.component("RouterLink",U_),H.component("RouterView",j_),H.config.globalProperties.$router=te,Object.defineProperty(H.config.globalProperties,"$route",{enumerable:!0,get:()=>Gs(o)}),wa&&!ce&&o.value===An&&(ce=!0,x(a.location).catch(be=>{}));const ue={};for(const be in An)Object.defineProperty(ue,be,{get:()=>o.value[be],enumerable:!0});H.provide(Or,te),H.provide(qc,ec(ue)),H.provide(Ho,o);const de=H.unmount;P.add(H),H.unmount=function(){P.delete(H),P.size<1&&(c=An,M&&M(),M=null,o.value=An,ce=!1,O=!1),de()}}};function _e(H){return H.reduce((ue,de)=>ue.then(()=>A(de)),Promise.resolve())}return te}function dm(){return Ss(Or)}function q_(e){return Ss(qc)}const Nr={props:{tabs:{type:Array,required:!0},defaultTab:{type:String,default:""},groupLabel:{type:String,default:""}},setup(e){const t=q_(),s=dm(),n=Y({get(){var o;const r=t.query.tab;return r&&e.tabs.some(c=>c.id===r)?r:e.defaultTab||((o=e.tabs[0])==null?void 0:o.id)||""},set(r){s.replace({query:{...t.query,tab:r}})}}),a=Y(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.component)||null}),i=Y(()=>{var r;return((r=e.tabs.find(o=>o.id===n.value))==null?void 0:r.label)||""});Yt(i,r=>{e.groupLabel&&r&&(document.title=`Odin — ${e.groupLabel} › ${r}`)},{immediate:!0});function l(r,o){if(!["ArrowLeft","ArrowRight","Home","End"].includes(r.key))return;r.preventDefault();let c=o;r.key==="ArrowRight"&&(c=(o+1)%e.tabs.length),r.key==="ArrowLeft"&&(c=(o-1+e.tabs.length)%e.tabs.length),r.key==="Home"&&(c=0),r.key==="End"&&(c=e.tabs.length-1),n.value=e.tabs[c].id,requestAnimationFrame(()=>{var d;return(d=document.getElementById("tab-"+e.tabs[c].id))==null?void 0:d.focus()})}return{activeTab:n,activeComponent:a,activeLabel:i,onTabKeydown:l}},template:`
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
  `},G_={setup(){const e=m([]),t=m([]),s=m({}),n=50;function a(p){var y,R,I,b,g;const h=p.payload||p,v=h.type||p.type;if(v==="tool_start"){const x=((y=h.metadata)==null?void 0:y.call_id)||null,E={callId:x,id:x||`${h.action}-${Date.now()}`,tool:h.action,actor:h.actor||"",channel:h.channel_id||"",iteration:((R=h.metadata)==null?void 0:R.iteration)??0,startTime:Date.now(),elapsed:0,status:"running",output:"",result:""};e.value.unshift(E);return}if(v==="tool_end"){const x=((I=h.metadata)==null?void 0:I.call_id)||null;let E=-1;if(x&&(E=e.value.findIndex(T=>T.callId===x&&T.status==="running")),E<0&&!x)for(let T=e.value.length-1;T>=0;T--){const S=e.value[T];if(S.tool===h.action&&S.status==="running"){E=T;break}}if(E>=0){const T=e.value[E];T.status=(b=h.metadata)!=null&&b.error?"error":"success",T.elapsed=((g=h.metadata)==null?void 0:g.elapsed_ms)||Date.now()-T.startTime,T.result=h.detail||"",T.fadingOut=!0,setTimeout(()=>{const S=e.value.indexOf(T);S>=0&&e.value.splice(S,1),t.value.unshift(T),t.value.length>n&&t.value.pop()},5e3)}return}if(v==="tool_stream"){const x=h.call_id||h.tool_name||"unknown";if(h.finished){const E={...s.value};delete E[x],s.value=E}else{const T=((s.value[x]||"")+(h.chunk||"")).split(`
`);s.value={...s.value,[x]:T.slice(-30).join(`
`)}}return}}let i=null;function l(){const p=Date.now();e.value.forEach(h=>{h.status==="running"&&(h.elapsed=p-h.startTime)})}let r=!1;function o(){r||(r=!0,ze.on("events",a),i||(i=setInterval(l,500)))}function c(){r&&(r=!1,ze.off("events",a),i&&(clearInterval(i),i=null))}Ke(o),Es(o),As(c),bt(c);function d(p){return p<1e3?`${p}ms`:`${(p/1e3).toFixed(1)}s`}function u(p){return p==="running"?"clock":p==="success"?"success":p==="error"?"error":"info"}return{activeTasks:e,recentHistory:t,streamOutput:s,formatMs:d,statusIcon:u}},template:`
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
... (truncated)`:s}function Nu(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function pm(e){return e==null||!isFinite(e)?"—":Number(e).toLocaleString()}function hm(e){return e==null||!isFinite(e)?"—":e>=1e3?`${(e/1e3).toFixed(1)}k`:String(e)}const mm=Symbol("agent-detail-cancelled"),K_=15e3;function W_(e,{timeoutMs:t,timeoutLabel:s,scheduleTimeout:n,cancelTimeout:a}){const i=typeof AbortController=="function"?new AbortController:null;let l=null,r=!1,o,c;const d=new Promise((h,v)=>{o=h,c=v});function u(h,v){r||(r=!0,l!==null&&a(l),l=null,(h?o:c)(v))}let p;try{p=e(i==null?void 0:i.signal)}catch(h){u(!1,h)}return r||Promise.resolve(p).then(h=>u(!0,h),h=>u(!1,h)),!r&&Number.isFinite(t)&&t>0&&(l=n(()=>{const h=Math.max(1,Math.round(t/1e3));u(!1,new Error(`${s} request timed out after ${h}s`)),i==null||i.abort()},t)),{promise:d,cancel(){u(!0,mm),i==null||i.abort()}}}function gm({state:e,requestDetail:t,timeoutMs:s=K_,detailLabel:n="Agent detail",scheduleTimeout:a=globalThis.setTimeout.bind(globalThis),cancelTimeout:i=globalThis.clearTimeout.bind(globalThis)}){if(!e||typeof e!="object")throw new TypeError("agent detail state is required");if(typeof t!="function")throw new TypeError("requestDetail must be a function");let l=null;function r(){const p=l;l=null,p==null||p.cancel()}function o(p,{initial:h,coalesce:v}){if(!p)return Promise.resolve();if(v&&l&&l.agentId===p&&e.detailId===p)return l.promise;r();const y={agentId:p,cancel:null,promise:null};l=y,h?(e.detail=null,e.detailError=null,e.detailLoading=!0):e.detail===null&&e.detailError===null&&(e.detailLoading=!0);const R=W_(I=>t(p,{signal:I}),{timeoutMs:s,timeoutLabel:n,scheduleTimeout:a,cancelTimeout:i});return y.cancel=R.cancel,y.promise=(async()=>{let I=null,b=null;try{I=await R.promise}catch(g){b=g}I!==mm&&(l!==y||e.detailId!==p||(l=null,!b&&(I===null||typeof I!="object")&&(b=new Error(`${n} response was empty or invalid`)),b?e.detail===null&&(e.detailError=(b==null?void 0:b.message)||`Failed to load ${n.toLowerCase()}`):(e.detail=I,e.detailError=null),e.detailLoading=!1))})(),y.promise}function c(p){return e.detailId=p,o(p,{initial:!0,coalesce:!1})}function d(){const p=e.detailId;return p?o(p,{initial:!1,coalesce:!0}):Promise.resolve()}function u(){r(),e.detailId=null,e.detail=null,e.detailError=null,e.detailLoading=!1}return{open:c,refresh:d,close:u,hasInFlight:()=>l!==null}}function Z_({isEnabled:e,refreshList:t,hasOpenDetail:s,refreshDetail:n,intervalMs:a=5e3,scheduleInterval:i=globalThis.setInterval.bind(globalThis),cancelInterval:l=globalThis.clearInterval.bind(globalThis)}){let r=null;function o(){e()&&(t(),s()&&n())}function c(){r!==null&&(l(r),r=null)}function d(){c(),e()&&(r=i(o,a))}function u(){e()?d():c()}return{start:d,stop:c,sync:u,isRunning:()=>r!==null}}const J_={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m(!0),i=m("all");let l=!1;const r=Y(()=>e.value.filter(N=>N.status==="running").length),o=Y(()=>e.value.filter(N=>N.status==="completed").length),c=Y(()=>e.value.filter(N=>["failed","timeout","killed"].includes(N.status)).length),d=Y(()=>[{value:"all",label:"All",count:e.value.length},{value:"running",label:"Running",count:r.value},{value:"completed",label:"Completed",count:o.value},{value:"failed",label:"Failed",count:c.value}]),u=Y(()=>i.value==="all"?e.value:i.value==="failed"?e.value.filter(N=>["failed","timeout","killed"].includes(N.status)):e.value.filter(N=>N.status===i.value));function p(N){const j=Number(N.max_iterations)||0;return j<=0?0:Math.min(100,Math.round(N.iteration_count/j*100))}function h(N){return(Number(N.max_iterations)||0)>0}function v(N,j){return N?N==="N/A"?"N/A":j==="current_inheritance"?`inherit (currently ${N})`:N:"unknown"}function y(N){return v(N.display_model,N.display_model_source||N.display_source)}function R(N){return v(N.display_reasoning_effort,N.display_reasoning_effort_source||N.display_source)}function I(N){return{last_execution:"last executed",current_inheritance:"inherited from current config — not yet executed",spawn_override_pending:"requested at spawn — not yet executed",unknown:"no execution data"}[N]||""}const b=m(null),g=m(null),x=m(!1),E=m(null),T=m(""),w=gm({state:{get detail(){return b.value},set detail(N){b.value=N},get detailId(){return g.value},set detailId(N){g.value=N},get detailLoading(){return x.value},set detailLoading(N){x.value=N},get detailError(){return E.value},set detailError(N){E.value=N}},requestDetail:(N,{signal:j})=>W.get(`/api/agents/${encodeURIComponent(N)}`,{signal:j})});async function A(N){T.value="",await w.open(N.id)}function L(){w.close(),T.value=""}async function B(){await w.refresh()}async function F(N,j){try{await navigator.clipboard.writeText(j||""),T.value=N,setTimeout(()=>{T.value===N&&(T.value="")},1500)}catch{Se.error("Copy failed")}}async function M(N=!1){N=N===!0,N||(t.value=!0);try{const j=await W.get("/api/agents");e.value=Array.isArray(j)?j:[],s.value=null}catch(j){N||(s.value=j.message)}N||(t.value=!1)}async function Z(N){const j=e.value.find(J=>J.id===N);if(await hs({title:"Kill agent",message:`Kill agent "${(j==null?void 0:j.label)||N}"? Its current work will be lost.`,confirmLabel:"Kill",danger:!0})){n.value=N;try{await W.del(`/api/agents/${encodeURIComponent(N)}`),Se.success("Agent killed"),await M()}catch(J){Se.error(J.message||"Failed to kill agent")}n.value=null}}const ne=Z_({isEnabled:()=>a.value&&l,refreshList:()=>M(!0),hasOpenDetail:()=>!!g.value,refreshDetail:B});function U(){ne.start()}function O(){ne.stop()}return Yt(a,()=>ne.sync()),Ke(()=>{l=!0,M(),U()}),Es(()=>{l=!0,M(!0),U()}),As(()=>{l=!1,O()}),bt(()=>{l=!1,O(),w.close()}),{agents:e,loading:t,error:s,killing:n,autoRefresh:a,statusFilter:i,runningCount:r,completedCount:o,failedCount:c,statusFilters:d,filteredAgents:u,formatTs:ua,formatDuration:Wa,progressPercent:p,hasProgress:h,displayModelText:y,displayEffortText:R,displaySourceLabel:I,detail:b,detailId:g,detailLoading:x,detailError:E,copied:T,openDetail:A,closeDetail:L,copyText:F,fetchAgents:M,killAgent:Z,startAutoRefresh:U,stopAutoRefresh:O}}},Y_={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!1),a=m({goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""}),i=m(!1),l=m(null),r=m(null),o=m(null),c=m(null),d=m(null),u=m(!1),p=m(null),h=m("");let v=!1;const R=gm({state:{get detail(){return c.value},set detail(O){c.value=O},get detailId(){return d.value},set detailId(O){d.value=O},get detailLoading(){return u.value},set detailLoading(O){u.value=O},get detailError(){return p.value},set detailError(O){p.value=O}},detailLabel:"Loop detail",requestDetail:(O,{signal:N})=>W.get(`/api/loops/${encodeURIComponent(O)}?limit=100`,{signal:N})});async function I(O){h.value="",await R.open(O.id)}function b(){R.close(),h.value=""}async function g(O,N){try{await navigator.clipboard.writeText(N||""),h.value=O,setTimeout(()=>{h.value===O&&(h.value="")},1500)}catch{Se.error("Copy failed")}}const x=Y(()=>e.value.reduce((O,N)=>O+(N.iteration_count||0),0)),E=Y(()=>e.value.filter(O=>O.status==="running").length);function T(O){return O==="running"?"loop-status-running":O==="error"?"loop-status-error":"loop-status-stopped"}function S(O){return O==="running"?"badge-success":O==="error"?"badge-danger":O==="completed"?"badge-info":"badge-warning"}function w(O){return O==="act"?"badge-warning":O==="silent"?"badge-info":"badge-success"}async function A(O=!1){O=O===!0,O||(t.value=!0);try{const N=await W.get("/api/loops");e.value=Array.isArray(N)?N:[],s.value=null}catch(N){O||(s.value=N.message)}O||(t.value=!1)}async function L(){l.value=null;const O=a.value;if(!O.goal.trim()){l.value="Goal is required";return}if(!O.channel_id.trim()){l.value="Channel ID is required";return}const N={goal:O.goal.trim(),channel_id:O.channel_id.trim(),interval_seconds:O.interval_seconds||60,mode:O.mode,max_iterations:O.max_iterations||50};O.stop_condition.trim()&&(N.stop_condition=O.stop_condition.trim()),i.value=!0;try{const j=await W.post("/api/loops",N);Se.success(`Loop started: ${j.loop_id}`),a.value={goal:"",interval_seconds:60,mode:"notify",max_iterations:50,stop_condition:"",channel_id:""},n.value=!1,await A()}catch(j){l.value=j.message}i.value=!1}async function B(O){if(await hs({title:"Stop loop",message:`Stop loop ${O}? The current iteration will finish before stopping.`,confirmLabel:"Stop Loop",danger:!0})){r.value=O;try{await W.del(`/api/loops/${encodeURIComponent(O)}`),Se.success("Loop stopped"),await A()}catch(j){Se.error(j.message||"Failed to stop loop")}r.value=null}}async function F(O){o.value=O;try{await W.post(`/api/loops/${encodeURIComponent(O)}/restart`),Se.success("Loop restarted"),await A()}catch(N){Se.error(N.message||"Failed to restart loop")}o.value=null}function M(O){v&&O.payload&&(O.payload.loop_id||O.payload.type==="loop")&&(A(!0),d.value&&R.refresh())}let Z=null;function ne(){Z!==null&&clearInterval(Z),Z=null}function U(){ne(),v&&(Z=setInterval(()=>{A(!0),d.value&&R.refresh()},5e3))}return Ke(()=>{v=!0,A(),ze.subscribe("events",M),U()}),Es(()=>{v=!0,A(!0),U()}),As(()=>{v=!1,ne()}),bt(()=>{v=!1,ze.unsubscribe("events",M),ne(),R.close()}),{loops:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,stoppingId:r,restartingId:o,detail:c,detailId:d,detailLoading:u,detailError:p,copied:h,totalIterations:x,runningCount:E,statusDotClass:T,statusBadge:S,modeBadge:w,formatAge:um,formatDuration:Wa,formatTs:ua,formatTokens:hm,openDetail:I,closeDetail:b,copyText:g,fetchLoops:A,doCreate:L,doStop:B,doRestart:F}}},Q_={template:`
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

    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!0);let a=null;const i=m(null),l=Y(()=>e.value.filter(b=>b.status==="running").length),r=Y(()=>e.value.filter(b=>b.status!=="running").length);function o(b){return b==="running"?"loop-status-running":b==="failed"||b==="error"?"loop-status-error":"loop-status-stopped"}function c(b){return b==="running"?"badge-success":b==="completed"||b==="exited"?"badge-info":b==="killed"||b==="error"||b==="failed"?"badge-danger":"badge-warning"}async function d(b=!1){b=b===!0,b||(t.value=!0);try{e.value=await W.get("/api/processes"),s.value=null}catch(g){b||(s.value=g.message)}b||(t.value=!1)}function u(){p(),n.value&&(a=setInterval(()=>{t.value||d(!0)},5e3))}function p(){a&&(clearInterval(a),a=null)}Yt(n,b=>{b?u():p()});async function h(b){if(await hs({title:"Kill process",message:`Kill process ${b}?`,confirmLabel:"Kill",danger:!0})){i.value=b;try{await W.del(`/api/processes/${b}`),Se.success(`Process ${b} killed`),await d()}catch(x){Se.error(x.message||"Failed to kill process")}i.value=null}}function v(b){b.payload&&(b.payload.pid||b.payload.type==="process")&&d(!0)}let y=!1;function R(){y||(y=!0,d(),ze.subscribe("events",v),u())}function I(){y&&(y=!1,ze.unsubscribe("events",v),p())}return Ke(R),Es(R),As(I),bt(I),{processes:e,loading:t,error:s,autoRefresh:n,killingPid:i,runningCount:l,completedCount:r,procStatusDot:o,statusBadge:c,formatDuration:Wa,fetchProcesses:d,doKill:h}}},X_=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;function Lu(e,t){return t==="cron"&&String(e.cron||"").trim()?e.run_at="":t==="run_at"&&String(e.run_at||"").trim()&&(e.cron=""),e}function ek(e,t=!1){const s=a=>String(a).padStart(2,"0"),n=`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}`;return t?`${n}:${s(e.getSeconds())}`:n}function tk(e){const t=-e.getTimezoneOffset(),s=t>=0?"+":"-",n=Math.abs(t),a=Math.floor(n/60),i=n%60;return`UTC${s}${a}${i?`:${String(i).padStart(2,"0")}`:""}`}function sk(e){const t=String(e||"").trim();if(!t)return{state:"empty"};const s=X_.exec(t);if(!s)return{state:"invalid",typed:t};const[,n,a,i,l,r]=s.slice(0,6).map(Number),o=s[6]===void 0?0:Number(s[6]);if(o>59)return{state:"invalid",typed:t};const c=s[6]!==void 0,d=c?t.slice(0,19):t.slice(0,16),u=Date.UTC(n,a-1,i,l,r,o),p=new Date(u-864e5).getTimezoneOffset(),h=new Date(u+864e5).getTimezoneOffset(),v=[];for(const R of new Set([p,h])){const I=new Date(u+R*6e4);ek(I,c)===d&&(v.some(b=>b.getTime()===I.getTime())||v.push(I))}if(v.sort((R,I)=>R.getTime()-I.getTime()),v.length===0)return{state:"nonexistent",typed:t};if(v.length>1)return{state:"ambiguous",typed:t,options:v.map(R=>({instant:R,offset:tk(R),iso:R.toISOString()}))};const y=v[0];return{state:"ok",typed:t,instant:y,iso:y.toISOString()}}const nk={template:`
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

    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(!1),a=m({description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""}),i=m(!1),l=m(null),r=m(null),o=Y(()=>sk(a.value.run_at));Yt(()=>a.value.run_at,()=>{r.value=null});const c=Y(()=>{var te;const P=o.value;return P.state==="ok"?P.instant:P.state==="ambiguous"&&r.value!==null&&((te=P.options[r.value])==null?void 0:te.instant)||null}),d=Y(()=>{const P=c.value;return P?`${P.toLocaleString()} local — ${P.toISOString()} UTC`:""}),u=m(null),p=m(!1),h=[{label:"Every hour",expr:"0 * * * *"},{label:"Every 6h",expr:"0 */6 * * *"},{label:"Daily 9am",expr:"0 9 * * *"},{label:"Weekly Mon",expr:"0 9 * * 1"},{label:"Every 30m",expr:"*/30 * * * *"}],v=m(null),y=m(null),R=m(null),I=m(null),b=m(null),g=m([]),x=m(!1),E=m("");let T=0;const S=Y(()=>e.value.filter(P=>P.cron&&!P.one_time).length),w=Y(()=>e.value.filter(P=>P.one_time).length),A=Y(()=>e.value.filter(P=>P.trigger).length),L=Y(()=>e.value.filter(P=>P.paused).length),B=Y(()=>e.value.filter(P=>P.consecutive_failures>0).length);function F(P){if(!P)return"-";const te=Date.now(),H=(new Date(P).getTime()-te)/1e3;if(H<0)return"overdue";if(H<60)return"in < 1 min";if(H<3600)return`in ${Math.floor(H/60)} min`;if(H<86400){const de=Math.floor(H/3600),be=Math.floor(H%3600/60);return be>0?`in ${de}h ${be}m`:`in ${de}h`}const ue=Math.floor(H/86400);return`in ${ue} day${ue!==1?"s":""}`}function M(P){return P==null?"-":P<1e3?`${P}ms`:P<6e4?`${(P/1e3).toFixed(1)}s`:Wa(P/1e3)}function Z(P=a.value.cron){a.value.cron=P,Lu(a.value,"cron"),u.value=null}function ne(P=a.value.run_at){a.value.run_at=P,Lu(a.value,"run_at"),u.value=null}async function U(){const P=a.value.cron.trim();if(P){p.value=!0;try{u.value=await W.post("/api/schedules/validate-cron",{expression:P})}catch(te){u.value={valid:!1,error:te.message}}p.value=!1}}async function O(){t.value=!0,s.value=null;try{e.value=await W.get("/api/schedules")}catch(P){s.value=P.message}t.value=!1}async function N(P){if(b.value===P){b.value=null,g.value=[];return}b.value=P,x.value=!0,g.value=[];const te=++T;try{const _e=await W.get(`/api/schedules/${encodeURIComponent(P)}/history?limit=10`);if(te!==T||b.value!==P)return;g.value=_e,E.value=""}catch(_e){if(te!==T||b.value!==P)return;g.value=[],E.value=_e.message||"Failed to load execution history"}te===T&&(x.value=!1)}async function j(){l.value=null;const P=a.value;if(!P.description.trim()){l.value="Description is required";return}if(!P.channel_id.trim()){l.value="Channel ID is required";return}if(!P.cron.trim()&&!P.run_at.trim()){l.value="Cron expression or run_at time is required";return}if(P.cron.trim()&&P.run_at.trim()){l.value="Choose either Cron or One-Time, not both";return}const te={description:P.description.trim(),action:P.action,channel_id:P.channel_id.trim()};if(P.cron.trim()&&(te.cron=P.cron.trim()),P.run_at.trim()){const _e=o.value;if(_e.state==="nonexistent"){l.value="That local time does not exist (daylight saving gap)";return}if(_e.state==="invalid"){l.value="One-time run time is not a valid date";return}const H=c.value;if(_e.state==="ambiguous"&&r.value===null){l.value="That local time happens twice — choose which occurrence to use";return}if(!H){l.value="One-time run time could not be resolved";return}te.run_at=H.toISOString()}if(P.action==="reminder"&&P.message.trim()&&(te.message=P.message.trim()),P.action==="check"&&(P.tool_name.trim()&&(te.tool_name=P.tool_name.trim()),P.tool_input_str.trim()))try{te.tool_input=JSON.parse(P.tool_input_str.trim())}catch{l.value="Tool input must be valid JSON";return}i.value=!0;try{await W.post("/api/schedules",te),Se.success("Schedule created"),a.value={description:"",action:"reminder",channel_id:"",cron:"",run_at:"",message:"",tool_name:"",tool_input_str:""},u.value=null,n.value=!1,await O()}catch(_e){l.value=_e.message}i.value=!1}async function G(P){v.value=P;try{const te=await W.post(`/api/schedules/${encodeURIComponent(P)}/run`);if(te.status==="failure")Se.error(`Execution failed: ${te.error||"unknown error"}`);else{const _e=te.warning?`Executed (${te.warning})`:"Executed successfully";Se.success(_e)}await O()}catch(te){Se.error(te.message||"Failed to trigger")}v.value=null}async function J(P){R.value=P.id;const te=!P.paused;try{await W.put(`/api/schedules/${encodeURIComponent(P.id)}`,{paused:te}),Se.success(te?"Schedule paused":"Schedule resumed"),await O()}catch(_e){Se.error(_e.message||"Failed to update schedule")}R.value=null}async function ae(P){I.value=P;try{await W.post(`/api/schedules/${encodeURIComponent(P)}/reset-failures`),Se.success("Failure counters reset"),await O()}catch(te){Se.error(te.message||"Failed to reset")}I.value=null}async function ce(P){const te=e.value.find(H=>H.id===P);if(await hs({title:"Delete schedule",message:`Delete "${(te==null?void 0:te.description)||P}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){y.value=P;try{await W.del(`/api/schedules/${encodeURIComponent(P)}`),Se.success("Schedule deleted"),await O()}catch(H){Se.error(H.message||"Failed to delete schedule")}y.value=null}}return Ke(()=>{O()}),{schedules:e,loading:t,error:s,showCreate:n,form:a,creating:i,createError:l,runAtUtcPreview:d,runAtAnalysis:o,runAtOccurrence:r,cronResult:u,validatingCron:p,cronPresets:h,runningId:v,deletingId:y,togglingId:R,resettingId:I,expandedId:b,history:g,historyLoading:x,historyError:E,cronCount:S,oneTimeCount:w,webhookCount:A,pausedCount:L,failingCount:B,formatTs:ua,formatAge:um,formatFuture:F,formatMs:M,formatDuration:Wa,onCronInput:Z,onRunAtInput:ne,validateCron:U,toggleExpand:N,fetchSchedules:O,doCreate:j,doRunNow:G,doTogglePause:J,doResetFailures:ae,doDelete:ce}}},vm=[{id:"live",label:"Live",component:G_},{id:"agents",label:"Agents",component:J_},{id:"loops",label:"Loops",component:Y_},{id:"processes",label:"Processes",component:Q_},{id:"schedules",label:"Schedules",component:nk}],ak={components:{TabbedPage:Nr},setup(){return{tabs:vm}},template:'<tabbed-page :tabs="tabs" default-tab="live" group-label="Operations" />'},ik={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m({tool:"",user:"",keyword:"",date:"",limit:50});function i(c){if(!c)return"";if(typeof c=="string")return c;try{return JSON.stringify(c,null,2)}catch{return String(c)}}function l(c){n.value=n.value===c?null:c}function r(){a.value={tool:"",user:"",keyword:"",date:"",limit:50},o()}async function o(){t.value=!0,s.value=null,n.value=null;try{const c=new URLSearchParams;a.value.tool&&c.set("tool",a.value.tool),a.value.user&&c.set("user",a.value.user),a.value.keyword&&c.set("q",a.value.keyword),a.value.date&&c.set("date",a.value.date),c.set("limit",String(a.value.limit));const d=c.toString(),u=await W.get(`/api/audit${d?"?"+d:""}`);e.value=Array.isArray(u)?u:[]}catch(c){s.value=c.message}t.value=!1}return Ke(()=>{o()}),{entries:e,loading:t,error:s,expandedIdx:n,filters:a,formatTs:ua,formatDetail:i,truncateBlock:fm,toggleExpand:l,clearFilters:r,fetchAudit:o}}},Du=[{id:"all",name:"All Sessions",icon:"list",filters:{}},{id:"active",name:"Recently Active",icon:"activity",filters:{minAge:0,maxAge:3600}},{id:"discord",name:"Discord Only",icon:"message",filters:{source:"discord"}},{id:"web",name:"Web Only",icon:"globe",filters:{source:"web"}},{id:"long",name:"Long Conversations",icon:"book",filters:{minMessages:10}},{id:"compacted",name:"Compacted",icon:"archive",filters:{hasCompaction:!0}}],lk=[{value:"last_active",label:"Last Active"},{value:"created_at",label:"Created"},{value:"message_count",label:"Message Count"}],rk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(null),a=m(null),i=m(!1);let l=0;const r=m(null),o=m(!1),c=m(new Set),d=m(!1),u=m("all"),p=m(""),h=m("last_active"),v=m(!1),y=Du,R=lk,I=m([]),b=m(!1),g=m(""),x=m("flat"),E=m(new Set),T=m(""),S=m(""),w=m(""),A=m(null),L=m(!1);function B(){try{const z=localStorage.getItem("odin-session-presets");z&&(I.value=JSON.parse(z))}catch{}}function F(){try{localStorage.setItem("odin-session-presets",JSON.stringify(I.value))}catch{}}const M=Y(()=>p.value.trim()!==""||u.value!=="all"),Z=Y(()=>{let z=[...e.value];const xe=Du.find(Ve=>Ve.id===u.value),Re=xe?xe.filters:{};if(Re.source&&(z=z.filter(Ve=>Ve.source===Re.source)),Re.minMessages&&(z=z.filter(Ve=>Ve.message_count>=Re.minMessages)),Re.hasCompaction&&(z=z.filter(Ve=>Ve.has_summary)),Re.maxAge!=null){const Ve=Date.now()/1e3;z=z.filter(ft=>ft.last_active&&Ve-ft.last_active<=Re.maxAge)}if(p.value.trim()){const Ve=p.value.toLowerCase().trim();z=z.filter(ft=>(ft.channel_id||"").toLowerCase().includes(Ve)||(ft.last_user_id||"").toLowerCase().includes(Ve)||(ft.source||"").toLowerCase().includes(Ve))}const Ne=h.value,He=v.value?1:-1;return z.sort((Ve,ft)=>{const es=Ve[Ne]||0,vs=ft[Ne]||0;return(es-vs)*He}),z}),ne=Y(()=>{if(!a.value||!a.value.messages)return[];const z=a.value.messages;if(z.length===0)return[];const xe=[];let Re=[];for(const Ne of z)Ne.role==="user"&&Re.length>0&&(xe.push(Re),Re=[]),Re.push(Ne);return Re.length>0&&xe.push(Re),xe}),U=Y(()=>Z.value.length>0&&c.value.size===Z.value.length);function O(z){const xe=z.find(Re=>Re.role==="user");if(xe&&xe.content){const Re=xe.content.slice(0,120);return Re.length<xe.content.length?Re+"...":Re}return"(no user message)"}function N(z){const xe=new Set(E.value);xe.has(z)?xe.delete(z):xe.add(z),E.value=xe}function j(z){u.value=z}function G(z){u.value=z.id,z.filters.searchQuery!=null&&(p.value=z.filters.searchQuery),z.filters.sortBy&&(h.value=z.filters.sortBy)}function J(){if(!g.value.trim())return;const z={id:"custom-"+Date.now(),name:g.value.trim(),filters:{searchQuery:p.value,sortBy:h.value}};I.value=[...I.value,z],F(),b.value=!1,g.value=""}function ae(z){I.value=I.value.filter(xe=>xe.id!==z),F(),u.value===z&&(u.value="all")}function ce(){u.value="all",p.value="",h.value="last_active",v.value=!1}function P(z){if(!z)return"—";const xe=Date.now()/1e3-z;if(xe<60)return"just now";if(xe<3600){const Ne=Math.floor(xe/60);return`${Ne} minute${Ne!==1?"s":""} ago`}if(xe<86400){const Ne=Math.floor(xe/3600);return`${Ne} hour${Ne!==1?"s":""} ago`}const Re=Math.floor(xe/86400);return`${Re} day${Re!==1?"s":""} ago`}function te(z){if(!z)return"";try{return new Date(z*1e3).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return""}}function _e(z){if(!z)return"";try{return new Date(z*1e3).toLocaleString()}catch{return""}}function H(z){return z==="user"?"bg-gray-900/50 border border-gray-800":z==="assistant"?"bg-indigo-950/30 border border-indigo-900/30":"bg-gray-900/30 border border-gray-800/50"}function ue(z){return z==="user"?"sess-msg-user":z==="assistant"?"sess-msg-assistant":"sess-msg-system"}function de(z){return z==="user"?"badge-info":z==="assistant"?"badge-success":"badge-warning"}function be(z){return z==="user"?"sess-dot-user":z==="assistant"?"sess-dot-assistant":"sess-dot-system"}function ge(z){return z==="user"?"text-cyan-400":z==="assistant"?"text-indigo-400":"text-gray-500"}function De(z){return z?z.length>2e3?z.slice(0,2e3)+`
... (truncated)`:z:""}async function _(){const z=T.value.trim();if(z){L.value=!0;try{let xe=`/api/sessions/search?q=${encodeURIComponent(z)}&limit=50`;S.value.trim()&&(xe+=`&channel_id=${encodeURIComponent(S.value.trim())}`),w.value.trim()&&(xe+=`&user_id=${encodeURIComponent(w.value.trim())}`);const Re=await W.get(xe);A.value=Re.results||[]}catch{A.value=[]}L.value=!1}}function C(){T.value="",S.value="",w.value="",A.value=null}function $(z){return z?z.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/&gt;&gt;&gt;/g,'<mark class="fts-highlight">').replace(/&lt;&lt;&lt;/g,"</mark>"):""}function X(z){return z==="user"?"fts-result-user":z==="assistant"?"fts-result-assistant":z==="summary"?"fts-result-summary":z==="fts"?"fts-result-fts":z==="channel"?"fts-result-channel":"fts-result-default"}function K(z){return z==="user"?"badge-info":z==="assistant"?"badge-success":z==="summary"?"badge-warning":z==="fts"?"badge-success":"badge-info"}async function Q(){t.value=!0,s.value=null;try{e.value=await W.get("/api/sessions")}catch(z){s.value=z.message}t.value=!1}function oe(){s.value=null,Q()}async function le(z){if(n.value===z){n.value=null,a.value=null,E.value=new Set;return}n.value=z,a.value=null,i.value=!0,E.value=new Set;const xe=++l;try{const Re=await W.get(`/api/sessions/${encodeURIComponent(z)}`);xe===l&&n.value===z&&(a.value=Re)}catch(Re){xe===l&&n.value===z&&(a.value={messages:[],summary:"",error:Re.message||"Failed to load session"})}finally{xe===l&&(i.value=!1)}}function ie(z){const xe=new Set(c.value);xe.has(z)?xe.delete(z):xe.add(z),c.value=xe}function se(){U.value?c.value=new Set:c.value=new Set(Z.value.map(z=>z.channel_id))}function ye(z){r.value=z}async function fe(){if(r.value){o.value=!0;try{await W.del(`/api/sessions/${encodeURIComponent(r.value)}`),n.value===r.value&&(n.value=null,a.value=null),c.value.delete(r.value),await Q()}catch(z){s.value=z.message||"Failed to clear session"}o.value=!1,r.value=null}}function he(){d.value=!0}async function ke(){if(c.value.size!==0){o.value=!0;try{await W.post("/api/sessions/clear-bulk",{channel_ids:[...c.value]}),c.value.has(n.value)&&(n.value=null,a.value=null),c.value=new Set,await Q()}catch(z){s.value=z.message||"Failed to clear sessions"}o.value=!1,d.value=!1}}async function Te(z,xe){const Re=`/api/sessions/${encodeURIComponent(z)}/export?format=${xe}`;try{const Ne=await W.getBlob(Re),He=URL.createObjectURL(Ne),Ve=document.createElement("a");Ve.href=He,Ve.download=`session-${z}.${xe==="text"?"txt":"json"}`,Ve.click(),URL.revokeObjectURL(He)}catch(Ne){s.value=Ne.message||"Failed to export session"}}let Ce=null;function Ie(z){z.payload&&z.payload.channel_id&&(clearTimeout(Ce),Ce=setTimeout(()=>{if(Q(),n.value&&z.payload.channel_id===n.value){const xe=n.value,Re=l;W.get(`/api/sessions/${encodeURIComponent(xe)}`).then(Ne=>{Re!==l||n.value!==xe||(a.value=Ne)}).catch(()=>{})}},2e3))}let Pe=!1;function $e(){Pe||(Pe=!0,Q(),ze.subscribe("events",Ie))}Ke(()=>{B(),$e()}),Es(()=>{$e()});function Xe(){Pe&&(Pe=!1,ze.unsubscribe("events",Ie),clearTimeout(Ce))}return As(Xe),bt(Xe),{sessions:e,loading:t,error:s,expandedId:n,detail:a,detailLoading:i,clearTarget:r,clearing:o,selected:c,allSelected:U,bulkClearing:d,activePreset:u,searchQuery:p,sortBy:h,sortAsc:v,filterPresets:y,sortOptions:R,filteredSessions:Z,hasActiveFilters:M,customPresets:I,showSavePreset:b,newPresetName:g,threadView:x,threads:ne,collapsedThreads:E,ftsQuery:T,ftsChannelId:S,ftsUserId:w,ftsResults:A,ftsSearching:L,formatAge:P,formatTimestamp:te,formatFullTimestamp:_e,messageClass:H,threadMsgClass:ue,roleBadge:de,roleDotClass:be,roleLabelClass:ge,truncateContent:De,threadSummary:O,fetchSessions:Q,retry:oe,toggleSession:le,toggleSelect:ie,toggleSelectAll:se,confirmClear:ye,clearSession:fe,confirmBulkClear:he,doBulkClear:ke,exportSession:Te,applyPreset:j,applyCustomPreset:G,saveCustomPreset:J,removeCustomPreset:ae,resetFilters:ce,toggleThread:N,runFtsSearch:_,clearFtsSearch:C,highlightSnippet:$,ftsResultClass:X,ftsTypeBadge:K}}},ok={props:["trace"],template:`
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
  `,setup(){return{formatTokens:hm}}},ck={components:{ContextAssemblyPanel:ok},template:`
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
    </div>`,setup(){const e=m([]),t=m([]),s=m(!0),n=m(null),a=m(null),i=m(null),l=m(""),r=m(""),o=m(0),c=m({}),d=m({channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50});function u(S){if(!S)return"—";try{const w=new Date(S);return isNaN(w.getTime())?S:w.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return S}}function p(S){return!S&&S!==0?"—":S<1e3?S+"ms":(S/1e3).toFixed(1)+"s"}function h(S){return!S&&S!==0?"—":S>=1e3?(S/1e3).toFixed(1)+"k":String(S)}function v(S){if(!S)return"";if(typeof S=="string")return S;try{return JSON.stringify(S,null,2)}catch{return String(S)}}function y(S){a.value===S?a.value=null:(a.value=S,c.value={})}function R(S,w){const A=S+"-"+w;c.value={...c.value,[A]:!c.value[A]}}function I(S,w){return!!c.value[S+"-"+w]}function b(){d.value={channel_id:"",user_id:"",tool_name:"",errors_only:!1,limit:50},r.value="",l.value="",i.value=null,E()}async function g(){try{const S=await W.get("/api/trajectories");e.value=S.files||[],o.value=S.count||0}catch{}}let x=0;async function E(){const S=++x;s.value=!0,n.value=null,a.value=null,i.value=null,c.value={};try{if(r.value){const w=await W.get(`/api/trajectories/${encodeURIComponent(r.value)}?limit=${d.value.limit}`);if(S!==x)return;let A=w.entries||[];d.value.tool_name&&(A=A.filter(L=>(L.tools_used||[]).includes(d.value.tool_name))),d.value.errors_only&&(A=A.filter(L=>L.is_error)),d.value.channel_id&&(A=A.filter(L=>L.channel_id===d.value.channel_id)),d.value.user_id&&(A=A.filter(L=>L.user_id===d.value.user_id)),t.value=A}else{const w=new URLSearchParams;d.value.channel_id&&w.set("channel_id",d.value.channel_id),d.value.user_id&&w.set("user_id",d.value.user_id),d.value.tool_name&&w.set("tool_name",d.value.tool_name),d.value.errors_only&&w.set("errors_only","true"),w.set("limit",String(d.value.limit));const A=w.toString(),L=await W.get(`/api/trajectories/search/query?${A}`);if(S!==x)return;t.value=L.results||[]}}catch(w){if(S!==x)return;n.value=w.message}S===x&&(s.value=!1)}async function T(){if(!l.value.trim())return;const S=++x;s.value=!0,n.value=null,c.value={};try{const w=await W.get(`/api/trajectories/message/${encodeURIComponent(l.value.trim())}`);if(S!==x)return;i.value=w.entry||null,i.value||(n.value="No trace found for this message ID")}catch(w){if(S!==x)return;w.status===404?(i.value=null,n.value="No trace found for message ID: "+l.value):n.value=w.message}S===x&&(s.value=!1)}return Ke(async()=>{await g(),await E()}),{files:e,entries:t,loading:s,error:n,expandedIdx:a,singleTrace:i,messageIdQuery:l,selectedFile:r,totalSaved:o,filters:d,expandedIterations:c,formatTs:u,formatDuration:p,formatTokens:h,formatJSON:v,truncateBlock:fm,toggleExpand:y,toggleIteration:R,isIterationExpanded:I,clearFilters:b,fetchFiles:g,fetchTraces:E,lookupMessage:T}}},dk={template:`
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
  `,setup(){const e=m(!0),t=m(null),s=m(!1),n=m({by_user:{},by_channel:{},by_tool:{},recent:[],pricing:{}}),a=m({requests:0,input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:0}),i=m("user");let l=null;const r=[{key:"user",label:"By User"},{key:"channel",label:"By Channel"},{key:"tool",label:"By Tool"},{key:"recent",label:"Recent"}],o=Y(()=>[...n.value.recent||[]].reverse()),c=async()=>{try{const v=await W.get("/api/usage");n.value=v,a.value=v.totals||a.value,t.value=null,s.value=!0}catch(v){t.value=v.message}finally{e.value=!1}},d=()=>{e.value=!0,c()};let u=!1;function p(){u||(u=!0,c(),l||(l=setInterval(c,15e3)))}function h(){u&&(u=!1,l&&(clearInterval(l),l=null))}return Ke(p),Es(p),As(h),bt(h),{hasData:s,loading:e,error:t,data:n,totals:a,activeTab:i,tabs:r,recentReversed:o,fmtNum:pm,formatTime:Kc,retry:d}}},bm=[{id:"audit",label:"Audit",component:ik},{id:"sessions",label:"Sessions",component:rk},{id:"traces",label:"Traces",component:ck},{id:"usage",label:"Usage",component:dk}],uk={components:{TabbedPage:Nr},setup(){return{tabs:bm}},template:'<tabbed-page :tabs="tabs" default-tab="audit" group-label="History" />'},to=[{id:"system",label:"System & Commands",icon:"terminal",match:e=>/^(run_command|run_script|read_file|write_file|list_directory|search_files|manage_process|file_|post_file)/.test(e)},{id:"devops",label:"DevOps & Infrastructure",icon:"server",match:e=>/^(git_ops|docker_ops|kubectl|terraform_ops|http_probe)/.test(e)},{id:"agents",label:"Agents & Orchestration",icon:"bot",match:e=>/^(spawn_agent|send_to_agent|wait_for_agents|get_agent_results|kill_agent|list_agents|spawn_loop_agents|collect_loop_agents)/.test(e)},{id:"workflow",label:"Workflows & Tasks",icon:"workflow",match:e=>/^(delegate_task|cancel_task|list_tasks|schedule_|start_loop|stop_loop|list_loops|delete_schedule|list_schedules|update_schedule|parse_time)/.test(e)},{id:"network",label:"Network & Web",icon:"globe",match:e=>/^(web_|browser_|search_web|fetch_url|http_)/.test(e)},{id:"knowledge",label:"Knowledge & Search",icon:"book",match:e=>/^(search_knowledge|ingest_|knowledge_|search_history|search_audit|bulk_ingest|delete_knowledge|list_knowledge)/.test(e)},{id:"discord",label:"Discord & Admin",icon:"message",match:e=>/^(send_|add_reaction|create_poll|purge_|discord_|embed_|read_channel|set_permission)/.test(e)},{id:"skills",label:"Skills",icon:"puzzle",match:e=>/^(create_skill|edit_skill|delete_skill|enable_skill|disable_skill|install_skill|export_skill|skill_status|invoke_skill|list_skills)/.test(e)},{id:"memory",label:"Memory & State",icon:"brain",match:e=>/^(memory_manage|list_manage)/.test(e)},{id:"ai",label:"AI & Generation",icon:"sparkles",match:e=>/^(generate_|analyze_|claude_|vision_|comfyui_)/.test(e)},{id:"integrations",label:"Integrations",icon:"link",match:e=>/^(issue_tracker|slack_|grafana_|mcp_)/.test(e)},{id:"other",label:"Other Tools",icon:"wrench",match:()=>!0}],fk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(""),a=m({}),i=m({}),l=m("cards"),r=m(null),o=Y(()=>e.value.filter(b=>b.is_core).length),c=Y(()=>e.value.filter(b=>!b.is_core).length),d=Y(()=>Object.values(a.value).reduce((b,g)=>b+g,0));function u(b){for(const g of to)if(g.id!=="other"&&g.match(b))return g.id;return"other"}const p=Y(()=>{let b=e.value;if(n.value){const g=n.value.toLowerCase();b=b.filter(x=>x.name.toLowerCase().includes(g)||(x.description||"").toLowerCase().includes(g))}return r.value&&(b=b.filter(g=>u(g.name)===r.value)),b}),h=Y(()=>{const b=new Set;for(const g of e.value)b.add(u(g.name));return to.filter(g=>b.has(g.id))}),v=Y(()=>{const b=p.value,g={};for(const E of b){const T=u(E.name);g[T]||(g[T]=[]),g[T].push(E)}const x=[];for(const E of to)g[E.id]&&g[E.id].length>0&&x.push({label:E.label,icon:E.icon,tools:g[E.id].sort((T,S)=>T.name.localeCompare(S.name))});return x});function y(b){i.value={...i.value,[b]:!i.value[b]}}async function R(){t.value=!0,s.value=null;try{const[b,g]=await Promise.all([W.get("/api/tools"),W.get("/api/tools/stats").catch(()=>({}))]);e.value=b,a.value=g||{};const x=Object.values(g||{}).filter(E=>E>0).sort((E,T)=>E-T)}catch(b){s.value=b.message}t.value=!1}function I(){R()}return Ke(()=>{R()}),{tools:e,loading:t,error:s,search:n,stats:a,expanded:i,viewMode:l,activeCategory:r,coreCount:o,skillCount:c,totalUsage:d,filteredTools:p,groupedTools:v,usedCategories:h,truncate:Wc,toggleExpand:y,refresh:I}}};function pk(e){if(!e)return"";let t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");t=t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,'<span class="sk-str">$1</span>'),t=t.replace(/(#[^\n]*)/g,'<span class="sk-cmt">$1</span>');const s="\\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|async|await|yield|pass|break|continue|and|or|not|in|is|None|True|False|self|lambda)\\b";t=t.replace(new RegExp(s,"g"),'<span class="sk-kw">$1</span>');const n="\\b(print|len|range|str|int|float|list|dict|set|tuple|type|isinstance|hasattr|getattr|setattr|super|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|format)\\b";return t=t.replace(new RegExp(n,"g"),'<span class="sk-builtin">$1</span>'),t=t.replace(/(@\w+)/g,'<span class="sk-dec">$1</span>'),t=t.replace(/\b(\d+\.?\d*)\b/g,'<span class="sk-num">$1</span>'),t}function hk(e){if(!e)return"1";const t=e.split(`
`).length;return Array.from({length:t},(s,n)=>n+1).join(`
`)}const mk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m({}),a=m({}),i=m(null),l=m(""),r=m(null),o=m(!1),c=m("create"),d=m(""),u=m(""),p=m(null),h=m(null),v=m(!1),y=m(null),R=m(null),I=m(!1),b=Y(()=>e.value.length),g=Y(()=>e.value.reduce((P,te)=>P+(te.execution_count||0),0)),x=Y(()=>e.value.reduce((P,te)=>P+L(te.code),0)),E=Y(()=>{if(!l.value)return e.value;const P=l.value.toLowerCase();return e.value.filter(te=>te.name.toLowerCase().includes(P)||(te.description||"").toLowerCase().includes(P))}),T=Y(()=>u.value?u.value.split(`
`).length:0),S=Y(()=>{const P=Math.max(T.value,1);return Array.from({length:P},(te,_e)=>_e+1).join(`
`)}),w=Y(()=>{const P=u.value.trim();return P?P.includes("SKILL_DEFINITION")?P.includes("async def execute")?{valid:!0,message:""}:{valid:!1,message:"Missing async def execute function"}:{valid:!1,message:"Missing SKILL_DEFINITION dict"}:null});function A(P){return pk(P)}function L(P){return P?P.split(`
`).length:0}function B(P){return hk(P)}function F(P){n.value={...n.value,[P]:!n.value[P]}}async function M(P){try{await navigator.clipboard.writeText(P);const te=e.value.find(_e=>_e.code===P);te&&(r.value=te.name,setTimeout(()=>{r.value=null},2e3))}catch{}}function Z(P){if(P.key==="Tab"){P.preventDefault();const te=P.target,_e=te.selectionStart,H=te.selectionEnd;u.value=u.value.substring(0,_e)+"    "+u.value.substring(H),Ct(()=>{te.selectionStart=te.selectionEnd=_e+4})}}function ne(P){const te=P.target.previousElementSibling;te&&(te.scrollTop=P.target.scrollTop)}async function U(){t.value=!0,s.value=null;try{e.value=await W.get("/api/skills")}catch(P){s.value=P.message}t.value=!1}async function O(P){i.value=P,delete a.value[P],a.value={...a.value};try{const te=await W.post(`/api/skills/${encodeURIComponent(P)}/test`);a.value={...a.value,[P]:te}}catch(te){a.value={...a.value,[P]:{result:te.message,is_error:!0}}}i.value=null}function N(){o.value=!0,c.value="create",d.value="",u.value="",p.value=null,h.value=null}function j(P){o.value=!0,c.value="edit",d.value=P.name,u.value=P.code||"",p.value=null,h.value=null}function G(){o.value=!1,p.value=null,h.value=null}async function J(){p.value=null,h.value=null;const P=d.value.trim(),te=u.value.trim();if(!P){p.value="Name is required";return}if(!te){p.value="Code is required";return}v.value=!0;try{c.value==="create"?(await W.post("/api/skills",{name:P,code:te}),h.value="Skill created successfully"):(await W.put(`/api/skills/${encodeURIComponent(P)}`,{code:te}),h.value="Skill updated successfully"),await U(),setTimeout(()=>{o.value=!1},800)}catch(_e){p.value=_e.message}v.value=!1}function ae(P){R.value=P}async function ce(){if(R.value){I.value=!0;try{await W.del(`/api/skills/${encodeURIComponent(R.value)}`),await U()}catch(P){Se.error(`Failed to delete skill: ${P.message||"unknown error"}`)}I.value=!1,R.value=null}}return Ke(()=>{U()}),{skills:e,loading:t,error:s,showCode:n,testResults:a,testing:i,search:l,copied:r,editing:o,editMode:c,editName:d,editCode:u,editError:p,editSuccess:h,saving:v,editorRef:y,deleteTarget:R,deleting:I,enabledCount:b,totalExecutions:g,totalLines:x,displayedSkills:E,editLineCount:T,editorLineNums:S,editValidation:w,highlight:A,truncate:Wc,formatTs:ua,countLines:L,getLineNumbers:B,toggleCode:F,copyCode:M,handleEditorKey:Z,syncScroll:ne,fetchSkills:U,testSkill:O,showCreate:N,editSkill:j,cancelEdit:G,saveSkill:J,confirmDelete:ae,doDelete:ce}}};function gk(e,t){if(!e||!t)return Nu(e);const s=Nu(e),n=t.trim().split(/\s+/).filter(Boolean);if(!n.length)return s;const a=n.map(i=>i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|");try{return s.replace(new RegExp(`(${a})`,"gi"),'<mark class="knowledge-highlight">$1</mark>')}catch{return s}}const vk={template:`
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
    </div>`,setup(){const e=m([]),t=m(!0),s=m(null),n=m(""),a=m(null),i=m(!1),l=m(""),r=m(null),o=m(!1),c=m(""),d=m(""),u=m(null),p=m(null),h=m(!1),v=m(null),y=m(null);let R=null;const I=m(null),b=m(!1),g=m({}),x=m({}),E=m(null),T=m(null),S=Y(()=>e.value.reduce((N,j)=>N+(j.chunks||0),0)),w=Y(()=>new Set(e.value.map(j=>j.uploader).filter(Boolean)).size);function A(N,j){const G=x.value[j];if(!G||G.length===0)return 0;const J=Math.max(...G.map(ae=>ae.char_count||0));return J===0?0:Math.round(N.char_count/J*100)}async function L(){t.value=!0,s.value=null;try{const N=await W.get("/api/knowledge");e.value=Array.isArray(N)?N:[]}catch(N){s.value=N.message}t.value=!1}async function B(N){if(g.value[N]){g.value[N]=!1,T.value=null;return}if(g.value[N]=!0,!(x.value[N]||E.value===N)){E.value=N;try{const j=await W.get(`/api/knowledge/${encodeURIComponent(N)}/chunks`);x.value[N]=Array.isArray(j)?j:[]}catch(j){x.value[N]=[],Se.error(`Failed to load chunks: ${j.message}`)}E.value=null}}async function F(){const N=n.value.trim();if(N){i.value=!0,r.value=null,l.value=N;try{const j=await W.get(`/api/knowledge/search?q=${encodeURIComponent(N)}`);a.value=Array.isArray(j)?j:[]}catch(j){a.value=[],r.value=j.message||"Search failed"}i.value=!1}}function M(){a.value=null,n.value="",r.value=null}async function Z(){u.value=null,p.value=null;const N=c.value.trim(),j=d.value.trim();if(!N){u.value="Source name is required";return}if(!j){u.value="Content is required";return}h.value=!0;try{const G=await W.post("/api/knowledge",{source:N,content:j});p.value=`Ingested ${G.chunks||0} chunks from "${N}"`,c.value="",d.value="",x.value={},await L(),setTimeout(()=>{o.value=!1,p.value=null},1500)}catch(G){u.value=G.message}h.value=!1}async function ne(N){v.value=N,y.value=null,R&&(clearTimeout(R),R=null);try{const j=await W.post(`/api/knowledge/${encodeURIComponent(N)}/reingest`);y.value={source:N,error:!1,message:`Re-ingested ${j.chunks||0} chunks`},delete x.value[N],await L(),R=setTimeout(()=>{y.value=null,R=null},3e3)}catch(j){y.value={source:N,error:!0,message:j.message}}v.value=null}function U(N){I.value=N}async function O(){if(I.value){b.value=!0;try{await W.del(`/api/knowledge/${encodeURIComponent(I.value)}`),delete x.value[I.value],await L()}catch(N){Se.error(`Failed to delete source: ${N.message||"unknown error"}`)}b.value=!1,I.value=null}}return Ke(()=>{L()}),{sources:e,loading:t,error:s,searchQuery:n,searchResults:a,searching:i,lastQuery:l,searchError:r,showIngest:o,ingestSource:c,ingestContent:d,ingestError:u,ingestSuccess:p,ingesting:h,reingesting:v,reingestResult:y,deleteTarget:I,deleting:b,expanded:g,sourceChunks:x,loadingChunks:E,selectedChunk:T,totalChunks:S,uploaderCount:w,truncate:Wc,formatTs:ua,highlightTerms:gk,chunkBarWidth:A,fetchSources:L,toggleSource:B,doSearch:F,clearSearch:M,doIngest:Z,doReingest:ne,confirmDelete:U,doDelete:O}}},bk={template:`
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
    </div>`,setup(){const e=m([]),t=m({}),s=m(!0),n=m(null),a=m({}),i=m(null),l=m(""),r=m(!1),o=m({scope:"global",key:"",value:""}),c=m(!1),d=m(null),u=m(null),p=m(null),h=m(""),v=m(!1),y=m(null),R=m(null),I=m(new Set),b=m(null),g=m(!1),x=m(!1),E=Y(()=>e.value.reduce((ae,ce)=>ae+ce.count,0)),T=Y(()=>I.value.size);function S(ae){const ce=t.value[ae];if(!ce)return[];if(!l.value.trim())return ce;const P=l.value.trim().toLowerCase();return ce.filter(te=>te.key.toLowerCase().includes(P)||te.value&&te.value.toLowerCase().includes(P))}function w(ae,ce){return I.value.has(ae+"/"+ce)}function A(ae,ce){const P=ae+"/"+ce,te=new Set(I.value);te.has(P)?te.delete(P):te.add(P),I.value=te}function L(ae){const ce=t.value[ae];return!ce||ce.length===0?!1:ce.every(P=>I.value.has(ae+"/"+P.key))}function B(ae,ce){const P=t.value[ae];if(!P)return;const te=new Set(I.value);for(const _e of P){const H=ae+"/"+_e.key;ce?te.add(H):te.delete(H)}I.value=te}async function F(){s.value=!0,n.value=null;try{const ae=await W.get("/api/memory");e.value=Object.entries(ae).map(([ce,P])=>({name:ce,keys:P.keys||[],count:P.count||0}))}catch(ae){n.value=ae.message}s.value=!1}async function M(ae){if(a.value[ae]){a.value[ae]=!1;return}a.value[ae]=!0;const ce=e.value.find(te=>te.name===ae);if(!ce||t.value[ae]||i.value===ae)return;i.value=ae;let P;try{const _e=(await W.get(`/api/memory/${encodeURIComponent(ae)}`)).entries||{};P=ce.keys.map(H=>Object.prototype.hasOwnProperty.call(_e,H)?{key:H,value:_e[H]||"",failed:!1}:{key:H,value:"",failed:!0,error:"Not found in scope"})}catch(te){P=ce.keys.map(_e=>({key:_e,value:"",failed:!0,error:te.message||"Failed to load"}))}t.value[ae]=P,i.value=null}function Z(ae,ce,P){p.value=ae+"/"+ce,h.value=P}async function ne(ae,ce){v.value=!0,y.value=null;try{await W.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(ce)}`,{value:h.value});const P=t.value[ae];if(P){const te=P.find(_e=>_e.key===ce);te&&(te.value=h.value)}p.value=null}catch(P){y.value=`Failed to save: ${P.message||"unknown error"}`}v.value=!1}async function U(ae,ce){try{await navigator.clipboard.writeText(ce.value),R.value=ae+"/"+ce.key,setTimeout(()=>{R.value=null},1500)}catch{}}async function O(){d.value=null,u.value=null;const ae=o.value.scope.trim(),ce=o.value.key.trim(),P=o.value.value.trim();if(!ae){d.value="Scope is required";return}if(!ce){d.value="Key is required";return}if(!P){d.value="Value is required";return}c.value=!0;try{await W.put(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(ce)}`,{value:P}),u.value="Entry saved",o.value={scope:"global",key:"",value:""},t.value={},await F(),setTimeout(()=>{r.value=!1,u.value=null},800)}catch(te){d.value=te.message}c.value=!1}function N(ae,ce){b.value={scope:ae,key:ce}}async function j(){if(!b.value)return;g.value=!0,y.value=null;const{scope:ae,key:ce}=b.value;try{await W.del(`/api/memory/${encodeURIComponent(ae)}/${encodeURIComponent(ce)}`);const P=t.value[ae];P&&(t.value[ae]=P.filter(H=>H.key!==ce));const te=e.value.find(H=>H.name===ae);te&&(te.count--,te.keys=te.keys.filter(H=>H!==ce));const _e=new Set(I.value);_e.delete(ae+"/"+ce),I.value=_e}catch(P){y.value=`Failed to delete: ${P.message||"unknown error"}`}g.value=!1,b.value=null}function G(){x.value=!0}async function J(){g.value=!0,y.value=null;const ae=[];for(const ce of I.value){const P=ce.indexOf("/");ae.push({scope:ce.slice(0,P),key:ce.slice(P+1)})}try{await W.post("/api/memory/bulk-delete",{entries:ae}),I.value=new Set,t.value={},await F()}catch(ce){y.value=`Bulk delete failed: ${ce.message||"unknown error"}`}g.value=!1,x.value=!1}return Ke(()=>{F()}),{scopes:e,scopeEntries:t,loading:s,error:n,expanded:a,loadingScope:i,filterQuery:l,showAdd:r,addForm:o,adding:c,addError:d,addSuccess:u,editingKey:p,editValue:h,saving:v,actionError:y,copied:R,selected:I,selectedCount:T,totalEntries:E,deleteTarget:b,deleting:g,showBulkDelete:x,fetchMemory:F,toggleScope:M,startEdit:Z,doEdit:ne,copyValue:U,doAdd:O,confirmDelete:N,doDelete:j,confirmBulkDelete:G,doBulkDelete:J,isSelected:w,toggleSelect:A,isScopeAllSelected:L,toggleSelectAll:B,filteredEntries:S}}},yk={template:`
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
  `,setup(){const e=m([]),t=m(null),s=m(!0),n=m(null),a=m(null),i=m(null),l=m(""),r=Y(()=>[...new Set(e.value.map(R=>R.category))].sort()),o=Y(()=>{const y={};return e.value.forEach(R=>{y[R.category]=(y[R.category]||0)+1}),y}),c=Y(()=>a.value?e.value.filter(y=>y.category===a.value):e.value);function d(y){return y==="correction"?"badge-warning":y==="operational"?"badge-info":y==="preference"?"badge-success":"badge-info"}function u(y){i.value=y.key,l.value=y.content}async function p(y){try{await W.put("/api/learned/"+encodeURIComponent(y),{content:l.value}),i.value=null,Se.success("Entry updated"),await v()}catch(R){Se.error(R.message||"Failed to save entry")}}async function h(y){if(await hs({title:"Delete learned entry",message:`Delete "${y}"? Odin will no longer apply this learned context.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/learned/"+encodeURIComponent(y)),Se.success("Entry deleted"),await v()}catch(I){Se.error(I.message||"Failed to delete entry")}}async function v(){s.value=!0,n.value=null;try{const y=await W.get("/api/learned");e.value=y.entries||[],t.value={last_reflection:y.last_reflection,count:y.count}}catch(y){n.value=y.message}s.value=!1}return Ke(v),{entries:e,meta:t,loading:s,error:n,filterCat:a,editing:i,editContent:l,categories:r,catCounts:o,filtered:c,catBadge:d,formatTs:ua,startEdit:u,saveEdit:p,deleteEntry:h,fetchEntries:v}}},ym=[{id:"tools",label:"Tools",component:fk},{id:"skills",label:"Skills",component:mk},{id:"knowledge",label:"Knowledge",component:vk},{id:"memory",label:"Memory",component:bk},{id:"learned",label:"Learned",component:yk}],xk={components:{TabbedPage:Nr},setup(){return{tabs:ym}},template:'<tabbed-page :tabs="tabs" default-tab="tools" group-label="Capabilities" />'},_k={ok:"text-green-400",degraded:"text-yellow-400",down:"text-red-400",unconfigured:"text-gray-500"},kk={ok:"success",degraded:"warning",down:"error",unconfigured:"minus"},wk={healthy:"text-green-400",degraded:"text-yellow-400",unhealthy:"text-red-400"},Sk={template:`
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
    </div>`,setup(){const e=m({}),t=m(!0),s=m(null),n=m(!1),a=m(!1),i=Y(()=>e.value.components||[]),l=Y(()=>wk[e.value.overall]||"text-gray-400"),r=Y(()=>e.value.overall==="healthy"?"success":e.value.overall==="degraded"?"warning":e.value.overall==="unhealthy"?"error":"minus"),o=Y(()=>{const T=e.value.overall;return T==="healthy"?"All Systems Healthy":T==="degraded"?"Some Systems Degraded":T==="unhealthy"?"System Issues Detected":"Unknown"});function c(T){return _k[T]||"text-gray-400"}function d(T){return kk[T]||"info"}function u(T){return T==="ok"?"badge-success":T==="degraded"?"badge-warning":T==="down"?"badge-danger":"badge-info"}function p(T){return T==="closed"?"text-green-400":T==="half_open"?"text-yellow-400":T==="open"?"text-red-400":"text-gray-400"}function h(T){return T.replace(/_/g," ").replace(/\b\w/g,S=>S.toUpperCase())}function v(T){if(!T)return"—";try{return new Date(T).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}catch{return T}}function y(T){return T>=1e6?(T/1e6).toFixed(1)+"M":T>=1e3?(T/1e3).toFixed(1)+"K":String(T)}async function R(){a.value=!0;try{e.value=await W.get("/api/health/components"),s.value=null,n.value=!0}catch(T){s.value=T.message}finally{t.value=!1,a.value=!1}}function I(){t.value=!0,s.value=null,R()}let b=null,g=!1;function x(){g||(g=!0,R(),b||(b=setInterval(R,3e4)))}function E(){g&&(g=!1,b&&(clearInterval(b),b=null))}return Ke(x),Es(x),As(E),bt(E),{data:e,hasData:n,loading:t,error:s,refreshing:a,components:i,overallColor:l,overallIcon:r,overallLabel:o,statusColor:c,statusIcon:d,badgeClass:u,circuitColor:p,formatName:h,formatTime:v,formatNumber:y,fetchHealth:R,retry:I}}},Tk={template:`
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
  `,setup(){const e=m(!0),t=m(null),s=m(!1),n=m(!1),a=m("sessions"),i=m(null);let l=null;const r=[{key:"sessions",label:"Sessions"},{key:"knowledge",label:"Knowledge"},{key:"trajectories",label:"Trajectories"},{key:"storage",label:"Storage"}],o=Y(()=>{if(!i.value||!i.value.collected_at)return"";try{return new Date(i.value.collected_at).toLocaleTimeString()}catch{return""}}),c=Y(()=>{if(!i.value)return[];const R=i.value,I=R.storage_total_bytes||1;return[{label:"Session Persistence",mb:R.sessions.persist_dir.total_mb,bytes:R.sessions.persist_dir.total_bytes,files:R.sessions.persist_dir.file_count,pct:Math.min(100,Math.round(R.sessions.persist_dir.total_bytes/I*100)),color:"res-bar-blue"},{label:"Knowledge Database",mb:R.knowledge.db_file.total_mb,bytes:R.knowledge.db_file.total_bytes,files:R.knowledge.db_file.file_count,pct:Math.min(100,Math.round(R.knowledge.db_file.total_bytes/I*100)),color:"res-bar-purple"},{label:"Message Trajectories",mb:R.trajectories.message_dir.total_mb,bytes:R.trajectories.message_dir.total_bytes,files:R.trajectories.message_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.message_dir.total_bytes/I*100)),color:"res-bar-emerald"},{label:"Agent Trajectories",mb:R.trajectories.agent_dir.total_mb,bytes:R.trajectories.agent_dir.total_bytes,files:R.trajectories.agent_dir.file_count,pct:Math.min(100,Math.round(R.trajectories.agent_dir.total_bytes/I*100)),color:"res-bar-amber"}]});async function d(){try{const R=await W.get("/api/resource-usage");i.value=R,t.value=null,s.value=!0}catch(R){t.value=R.message||"Failed to load resource usage"}finally{e.value=!1,n.value=!1}}async function u(){n.value=!0,await d()}function p(){e.value=!0,t.value=null,d()}let h=!1;function v(){h||(h=!0,d(),l||(l=setInterval(d,3e4)))}function y(){h&&(h=!1,l&&(clearInterval(l),l=null))}return Ke(v),Es(v),As(y),bt(y),{hasData:s,loading:e,error:t,refreshing:n,data:i,activeTab:a,tabs:r,collectedAt:o,storageItems:c,fmtNum:pm,refresh:u,retry:p}}},Ck=["INFO","WARNING","ERROR"],Ek=[{id:"all",name:"All Logs",icon:"list",filters:{}},{id:"errors",name:"Errors Only",icon:"error",filters:{level:"ERROR"}},{id:"warnings",name:"Warnings+",icon:"warning",filters:{levels:["WARNING","ERROR"]}},{id:"tools",name:"Tool Activity",icon:"wrench",filters:{hasToolName:!0}},{id:"recent-errors",name:"Recent Errors",icon:"flame",filters:{level:"ERROR",timeRange:"last_1h"}}],so=[{value:"",label:"All Time"},{value:"last_5m",label:"Last 5 min",seconds:300},{value:"last_15m",label:"Last 15 min",seconds:900},{value:"last_1h",label:"Last 1 hour",seconds:3600},{value:"last_4h",label:"Last 4 hours",seconds:14400},{value:"last_24h",label:"Last 24 hours",seconds:86400}],Ak=[50,100,200,500],Rk={template:`
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
    </div>`,setup(){const e=m("live"),t=m([]),s=m(!1),n=m(!0),a=m(""),i=m(""),l=m(!1),r=m(!1),o=m(ze.state||"disconnected"),c=Y(()=>{switch(o.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}}),d=m(null),u=m(!1),p=m(null),h=2e3,v=Ck,y=Ek,R=so,I=m("all"),b=m(""),g=m([]),x=m(!1),E=m(""),T=m([]);function S(){try{const V=localStorage.getItem("odin-log-presets");V&&(g.value=JSON.parse(V))}catch{}}function w(){try{localStorage.setItem("odin-log-presets",JSON.stringify(g.value))}catch{}}const A=Y(()=>a.value!==""||i.value.trim()!==""||b.value!==""),L=Y(()=>{const V=so.find(re=>re.value===b.value);return V?V.label:""}),B=Y(()=>{if(!l.value||!i.value)return null;try{return new RegExp(i.value,"i"),null}catch(V){return V.message}}),F=24,M=Y(()=>{if(G.value.length===0)return[];const V=[],re=new Date,Ee=3600*1e3;for(let We=F-1;We>=0;We--){const rt=new Date(re.getTime()-(We+1)*Ee),Ft=new Date(re.getTime()-We*Ee);V.push({start:rt,end:Ft,label:O(rt,Ft),shortLabel:Ft.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),total:0,info:0,warnings:0,errors:0})}for(const We of G.value){if(!We._time)continue;const rt=We._time.getTime();for(const Ft of V)if(rt>=Ft.start.getTime()&&rt<Ft.end.getTime()){Ft.total++,We.level==="ERROR"?Ft.errors++:We.level==="WARNING"?Ft.warnings++:Ft.info++;break}}return V}),Z=Y(()=>{let V=1;for(const re of M.value)re.total>V&&(V=re.total);return V}),ne=Y(()=>{if(M.value.length===0)return"";const V=G.value.map(We=>We._time&&We._time.getTime()).filter(Boolean);if(V.length===0)return"";const re=new Date(Math.min(...V));return`${G.value.length} shown, oldest ${re.toLocaleTimeString()}`}),U=Y(()=>Math.ceil(F/8));function O(V,re){const Ee={hour:"2-digit",minute:"2-digit"};return V.toLocaleTimeString([],Ee)+" - "+re.toLocaleTimeString([],Ee)}function N(V,re){return!re||!V?"0px":Math.max(2,V/re*100)+"%"}function j(V){const re=G.value.findIndex(Ee=>Ee._time&&Ee._time.getTime()>=V.start.getTime()&&Ee._time.getTime()<V.end.getTime());if(re>=0&&d.value){const Ee=d.value.querySelectorAll(".log-line");Ee[re]&&(Ee[re].scrollIntoView({behavior:"smooth",block:"center"}),n.value=!1)}}const G=Y(()=>{let V=t.value;if(a.value&&(V=V.filter(re=>(re.level||"INFO")===a.value)),b.value){const re=so.find(Ee=>Ee.value===b.value);if(re&&re.seconds){const Ee=new Date(Date.now()-re.seconds*1e3);V=V.filter(We=>We._time&&We._time>=Ee)}}if(i.value&&!B.value)if(l.value)try{const re=new RegExp(i.value,"i");V=V.filter(Ee=>{const We=Ee.text||Ee.raw||"",rt=Ee.tool||"";return re.test(We)||re.test(rt)})}catch{}else{const re=i.value.toLowerCase();V=V.filter(Ee=>{const We=(Ee.text||Ee.raw||"").toLowerCase(),rt=(Ee.tool||"").toLowerCase();return We.includes(re)||rt.includes(re)})}return V});function J(V){if(V.type==="log"&&V.line)try{const re=typeof V.line=="string"?JSON.parse(V.line):V.line,Ee=re.timestamp?new Date(re.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:re.error?"ERROR":"INFO",text:re.tool_name?`[${re.tool_name}] ${re.result_summary||""}`.trim():re.message||JSON.stringify(re),tool:re.tool_name||"",raw:null}}catch{return{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:String(V.line),tool:"",raw:String(V.line)}}if(V.payload){const re=V.payload,Ee=re.timestamp?new Date(re.timestamp):new Date;return{ts:Ee.toLocaleTimeString(),_time:Ee,level:re.error?"ERROR":"INFO",text:re.tool_name?`[${re.tool_name}] ${re.result_summary||""}`.trim():re.message||JSON.stringify(re),tool:re.tool_name||"",raw:null}}return typeof V=="string"?{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:V,tool:"",raw:V}:{ts:new Date().toLocaleTimeString(),_time:new Date,level:"INFO",text:JSON.stringify(V),tool:"",raw:null}}function ae(V){const re=J(V);if(s.value){T.value.push(re);return}ce(re)}function ce(V){t.value.push(V),t.value.length>h&&(t.value=t.value.slice(-h)),n.value&&Ct(()=>P())}function P(V=!1){const re=d.value;re&&re.scrollTo({top:re.scrollHeight,behavior:V?"smooth":"instant"})}function te(){n.value=!0,u.value=!1,Ct(()=>P(!0))}const _e=new Set(["PageUp","PageDown","ArrowUp","ArrowDown","Home","End"," "]);function H(){const V=d.value;if(!V)return;const re=V.scrollHeight-V.scrollTop-V.clientHeight<40;u.value=!n.value&&!re&&t.value.length>0,ge.value&&ue()}function ue(){const V=d.value;!V||!n.value||V.scrollHeight-V.scrollTop-V.clientHeight>=40&&(n.value=!1,u.value=t.value.length>0)}function de(){n.value&&requestAnimationFrame(ue)}function be(V){_e.has(V.key)&&de()}const ge=m(!1);function De(){n.value&&(ge.value=!0,requestAnimationFrame(ue))}function _(){ge.value&&(ge.value=!1,ue())}function C(){n.value&&(u.value=!1,Ct(()=>P()))}function $(){if(s.value=!s.value,!s.value&&T.value.length>0){for(const V of T.value)ce(V);T.value=[]}}function X(){t.value=[],T.value=[],u.value=!1}function K(){let V;e.value==="search"?V=Ve.value.map(rt=>{const Ft=rt.error?"ERROR":"INFO",$t=rt.tool_name?`[${rt.tool_name}] `:"";return`${rt.timestamp||""} ${Ft} ${$t}${rt.result_summary||rt.message||""}`}).join(`
`):V=G.value.map(rt=>`${rt.ts} ${rt.level} ${rt.text}`).join(`
`);const re=new Blob([V],{type:"text/plain"}),Ee=URL.createObjectURL(re),We=document.createElement("a");We.href=Ee,We.download=`odin-logs-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.txt`,We.click(),URL.revokeObjectURL(Ee)}function Q(V,re){const Ee=`${V.ts} ${V.level} ${V.text||V.raw||""}`;navigator.clipboard.writeText(Ee).then(()=>{p.value=re,setTimeout(()=>{p.value=null},1500)}).catch(()=>{})}function oe(V){a.value=a.value===V?"":V,I.value="all"}function le(V){return V.level==="ERROR"?"log-line-error":V.level==="WARNING"?"log-line-warning":"text-gray-300"}function ie(V){return V==="ERROR"?"text-red-500 font-semibold":V==="WARNING"?"text-yellow-500":"text-blue-500"}function se(V){return V==="ERROR"?"log-chip-error":V==="WARNING"?"log-chip-warning":"log-chip-info"}function ye(V){I.value=V.id;const re=V.filters;a.value=re.level||"",b.value=re.timeRange||"",i.value=re.text||"",re.levels&&(a.value=re.levels[0]||""),re.hasToolName&&(i.value="")}function fe(V){I.value=V.id,a.value=V.filters.level||"",b.value=V.filters.timeRange||"",i.value=V.filters.text||""}function he(){if(!E.value.trim())return;const V={id:"custom-"+Date.now(),name:E.value.trim(),filters:{level:a.value,timeRange:b.value,text:i.value}};g.value=[...g.value,V],w(),x.value=!1,E.value=""}function ke(V){g.value=g.value.filter(re=>re.id!==V),w(),I.value===V&&(I.value="all")}const Te=m("all"),Ce=m(""),Ie=m(""),Pe=m(""),$e=m(""),Xe=m(""),z=m(100),xe=Ak,Re=m(!1),Ne=m(!1),He=m(""),Ve=m([]),ft=m(null),es=m(null);function vs(){e.value="search",ft.value||xn()}async function xn(){try{ft.value=await W.get("/api/logs/stats")}catch{}}function Rs(){const V=Xe.value;if(!V){Pe.value="",$e.value="";return}const Ee={last_5m:300,last_15m:900,last_1h:3600,last_4h:14400,last_24h:86400,last_7d:604800}[V];if(Ee){const We=new Date(Date.now()-Ee*1e3);Pe.value=$s(We),$e.value=""}}function $s(V){const re=Ee=>String(Ee).padStart(2,"0");return`${V.getFullYear()}-${re(V.getMonth()+1)}-${re(V.getDate())}T${re(V.getHours())}:${re(V.getMinutes())}`}function At(V){if(!V)return"";const re=new Date(V);return isNaN(re.getTime())?"":re.toISOString()}async function q(){Re.value=!0,He.value="",Ne.value=!0,es.value=null;try{const V=new URLSearchParams;Te.value&&Te.value!=="all"&&V.set("level",Te.value),Ce.value&&V.set("tool",Ce.value),Ie.value&&V.set("q",Ie.value);const re=At(Pe.value),Ee=At($e.value);re&&V.set("start",re),Ee&&V.set("end",Ee),V.set("limit",String(z.value));const We=await W.get(`/api/logs/search?${V.toString()}`);Ve.value=We.entries||[]}catch(V){He.value=V.message||"Search failed",Ve.value=[]}finally{Re.value=!1}}function Oe(){Te.value="all",Ce.value="",Ie.value="",Pe.value="",$e.value="",Xe.value="",z.value=100,Ve.value=[],Ne.value=!1,He.value="",es.value=null}function bs(V){es.value=es.value===V?null:V}function Bn(V){if(!V.timestamp)return"";try{return new Date(V.timestamp).toLocaleString()}catch{return V.timestamp}}function os(V){return V.type==="web_action"?`${V.status||""} (${V.execution_time_ms||0}ms)`:(V.result_summary||"").slice(0,200)}function Hn(V){return V.error?"log-line-error":"text-gray-300"}function Qa(V){try{return JSON.stringify(V,null,2)}catch{return String(V)}}let cs=null,_n=null,kn=!1;function it(){kn||(kn=!0,ze.subscribe("logs",ae),r.value=ze.connected,o.value=ze.state||"disconnected",cs=ze.onStateChange,_n=(V,re)=>{o.value=V,r.value=V==="connected",cs&&cs(V,re)},ze.onStateChange=_n)}function Is(){kn&&(kn=!1,ze.unsubscribe("logs",ae),ze.onStateChange===_n&&(ze.onStateChange=cs),_n=null,cs=null)}return Ke(()=>{S(),window.addEventListener("pointerup",_),window.addEventListener("pointercancel",_)}),Es(it),As(Is),bt(()=>{Is(),window.removeEventListener("pointerup",_),window.removeEventListener("pointercancel",_)}),{mode:e,logs:t,paused:s,autoScroll:n,levelFilter:a,textFilter:i,useRegex:l,subscribed:r,wsState:o,wsStateLabel:c,logContainer:d,filteredLogs:G,pauseBuffer:T,showJumpBottom:u,copiedIndex:p,regexError:B,levels:v,logPresets:y,timeRanges:R,timeRange:b,activeLogPreset:I,customLogPresets:g,showSaveLogPreset:x,newLogPresetName:E,hasActiveLogFilters:A,timeRangeLabel:L,timelineBuckets:M,timelineMax:Z,timelineSpanLabel:ne,timelineLabelSkip:U,togglePause:$,clearLogs:X,exportLogs:K,logLineClass:le,levelClass:ie,levelChipClass:se,toggleLevel:oe,copyLine:Q,jumpToBottom:te,onScroll:H,onUserScrollIntent:de,onUserScrollKey:be,onAutoScrollToggle:C,onPointerDown:De,applyLogPreset:ye,applyCustomLogPreset:fe,saveLogCustomPreset:he,removeLogCustomPreset:ke,segmentHeight:N,jumpToTimelineBucket:j,searchLevel:Te,searchTool:Ce,searchKeyword:Ie,searchStart:Pe,searchEnd:$e,searchTimePreset:Xe,searchLimit:z,searchLimits:xe,searching:Re,searchRan:Ne,searchError:He,searchResults:Ve,searchStats:ft,expandedSearch:es,switchToSearch:vs,runSearch:q,clearSearchFilters:Oe,toggleSearchExpand:bs,formatSearchTs:Bn,searchEntryText:os,searchLogLineClass:Hn,formatJson:Qa,applySearchTimePreset:Rs}}};function bl(e=[]){const t=[],s=new Set;function n(a){const i=[a.kind,a.label,a.apply_mode||"",a.code||"",a.text||""].join("\0");s.has(i)||(s.add(i),t.push({...a,key:i}))}for(const a of e)for(const i of(a==null?void 0:a.consumers)||[])n({kind:"consumer",label:i.name,apply_mode:i.apply_mode,text:i.detail});for(const a of e)a!=null&&a.apply_handler&&n({kind:"handler",label:"Apply handler",code:a.apply_handler});for(const a of e)a!=null&&a.restart_reason&&n({kind:"restart",label:"Why a restart is required",text:a.restart_reason});for(const a of e)a!=null&&a.activation_policy&&n({kind:"activation",label:"Activation policy",text:a.activation_policy});return t}const Ik=Object.freeze([{key:"all",label:"All fields",short:"All",icon:"grid"},{key:"applied",label:"Applied",short:"Applied",icon:"success"},{key:"pending_restart",label:"Pending restart",short:"Restart",icon:"refresh"},{key:"dormant",label:"Saved, not active",short:"Saved only",icon:"pause"},{key:"invalid",label:"Invalid",short:"Invalid",icon:"error"},{key:"drift",label:"Drift",short:"Drift",icon:"warning"},{key:"unknown",label:"Effective state unknown",short:"Unknown",icon:"info"}]),Pa=[{key:"core",label:"Core",icon:"sliders",sections:["timezone","logging","permissions","graceful_degradation"]},{key:"models",label:"Models & AI",icon:"brain",sections:["image","llm_recovery"]},{key:"runtime",label:"Runtime",icon:"activity",sections:["context","sessions","agents","turn_state"]},{key:"data",label:"Data & Storage",icon:"database",sections:["learning","search","usage","audit","attachments"]},{key:"services",label:"Services",icon:"link",sections:["webhook","observability","email","browser","comfyui","slack","mcp"]},{key:"automation",label:"Automation",icon:"workflow",sections:["message_triggers","reaction_triggers","grafana_alerts","outbound_webhooks","issue_tracker"]},{key:"infrastructure",label:"Infrastructure",icon:"server",sections:["tools","web"]}],Ok={live_read:"Applies immediately",live_apply:"Reloads live",live_for_new_work:"Applies to new work",restart:"Restart required",activation_required:"Saved only — see activation note",legacy_control:"Controlled elsewhere",dormant:"Saved for future support"},no=new Set(["llm_provider","openai_codex","ollama","kimi","personality","discord"]),Nk=Object.freeze(["web.api_tokens","outbound_webhooks.targets"]);function Mu(e){return Nk.some(t=>e===t||e.startsWith(`${t}.`))}const Lk=new Set(["sessions.context_budget_overrides","tools.governor.host_overrides","tools.hosts","tools.tool_timeouts","permissions.tiers","mcp.servers","slack.webhook_urls","grafana_alerts.rules","outbound_webhooks.targets"]),xm="odin_config_center_expanded_v1",_m="odin_config_center_category_v1",Dk=50,Mk=650,ao=()=>W.get("/api/config/meta");function Kn(e){return e===void 0?void 0:JSON.parse(JSON.stringify(e))}function wi(e,t){return JSON.stringify(e)===JSON.stringify(t)}function ba(e){return String(e).replace(/[_-]+/g," ").replace(/\b\w/g,t=>t.toUpperCase())}function Pk(e){return e===void 0?"unset":e===null?"null":typeof e=="boolean"?e?"Enabled":"Disabled":Array.isArray(e)?e.length?`${e.length} item${e.length===1?"":"s"}`:"Empty list":typeof e=="object"?Object.keys(e).length?`${Object.keys(e).length} field${Object.keys(e).length===1?"":"s"}`:"Empty object":e===""?"Empty":String(e)}function Fk(e){if(e===void 0)return"unset";if(e===null)return"null";if(typeof e=="object")try{return JSON.stringify(e,null,2)}catch{return String(e)}return String(e)}function km(e,t){if(wi(e,t))return;if(!(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)))return Kn(t);const n={};for(const[a,i]of Object.entries(t)){const l=km(e[a],i);l!==void 0&&(n[a]=l)}return Object.keys(n).length?n:void 0}function $k(e,t){const s={};for(const[n,a]of Object.entries(t||{})){const i=km(e==null?void 0:e[n],a);i!==void 0&&(s[n]=i)}return s}function wm(e,t,s,n){if(wi(e,t))return;if(e&&t&&typeof e=="object"&&typeof t=="object"&&!Array.isArray(e)&&!Array.isArray(t)){const i=new Set([...Object.keys(e),...Object.keys(t)]);for(const l of i)wm(e[l],t[l],s?`${s}.${l}`:l,n);return}n.push({path:s,oldVal:e,newVal:t})}function Uk(){try{const e=JSON.parse(localStorage.getItem(xm)||"{}");return e&&typeof e=="object"&&!Array.isArray(e)?e:{}}catch{return{}}}function Bk(){try{const e=localStorage.getItem(_m);return Pa.some(t=>t.key===e)?e:Pa[0].key}catch{return Pa[0].key}}const Hk={template:`
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
  `,setup(){const e=m(null),t=m(null),s=m(!0),n=m(!1),a=m(null),i=m(null),l=m(null),r=m(!1),o=m(!1),c=m(null),d=m(""),u=m("all"),p=m(Bk()),h=m(Uk()),v=m({}),y=m({}),R=m(""),I=m({}),b=m({}),g=m([]),x=m([]),E=m(!1),T=m(!1),S=m(!1);let w=null,A=null,L={path:null,at:0},B=0;const F=Y(()=>{var f;return(((f=t.value)==null?void 0:f.fields)||[]).filter(k=>!no.has(k.path.split(".")[0])&&!Mu(k.path))}),M=Y(()=>new Map(F.value.map(f=>[f.path,f]))),Z=Y(()=>j.value.reduce((f,k)=>f+k.sections.length,0)),ne=Y(()=>F.value.length),U=Y(()=>Ik),O=Y(()=>g.value.length>0),N=Y(()=>x.value.length>0),j=Y(()=>{if(!e.value)return[];const f=new Set(Pa.flatMap(ee=>ee.sections)),k=Pa.map(ee=>({...ee,sections:ee.sections.filter(pe=>Object.hasOwn(e.value,pe)&&!no.has(pe))})).filter(ee=>ee.sections.length),D=Object.keys(e.value).filter(ee=>!f.has(ee)&&!no.has(ee));return D.length&&k.push({key:"other",label:"Other",icon:"folder",sections:D}),k}),G=Y(()=>e.value?{...e.value,...v.value}:null),J=Y(()=>{if(!e.value)return[];const f=[];for(const[k,D]of Object.entries(v.value))wm(e.value[k],D,k,f);return f.filter(k=>!wi(k.oldVal,k.newVal)).map(k=>{const D=_(k.path);return{...k,label:(D==null?void 0:D.label)||ba(k.path.split(".").at(-1)),apply_mode:(D==null?void 0:D.apply_mode)||Q(k.path.split(".")[0])}})}),ae=Y(()=>J.value.length>0),ce=Y(()=>J.value.length),P=Y(()=>new Set(J.value.map(f=>f.path.split(".")[0])).size),te=Y(()=>!!d.value||u.value!=="all"),_e=Y(()=>{const f={...b.value};for(const k of J.value){const D=_(k.path),ee=We(D,k.newVal);ee&&(f[k.path]=ee)}return f}),H=Y(()=>Object.keys(_e.value).length>0),ue=Y(()=>e.value?(te.value?j.value:j.value.filter(k=>k.key===p.value)).map(k=>({...k,sections:k.sections.filter(D=>Xe(D))})).filter(k=>k.sections.length):[]),de=Y(()=>{const f=["live_read","live_apply","live_for_new_work","restart","activation_required","legacy_control","dormant"],k=new Map(f.map(D=>[D,[]]));for(const D of J.value){const ee=k.has(D.apply_mode)?D.apply_mode:"restart";k.get(ee).push(D)}return f.filter(D=>k.get(D).length).map(D=>({key:D,label:Vn(D),entries:k.get(D)}))}),be=Y(()=>J.value.filter(f=>f.apply_mode==="restart").length),ge=Y(()=>F.value.filter(f=>f.pending_restart)),De=Y(()=>ge.value.length);function _(f){const k=M.value.get(f);return k?{...k,apply_details:bl([k])}:null}function C(f){const k=`${f}.`;return F.value.filter(D=>D.path===f||D.path.startsWith(k))}function $(f){return C(f).length}function X(f){return ba(f)}function K(f){const k=C(f);if(!k.length)return`${ba(f)} configuration.`;const D=k.find(we=>we.sensitivity==="public"&&we.description)||k.find(we=>we.description),ee=(D==null?void 0:D.description)||"";return ee.match(/setting for (.+)\.$/i)?`${ba(f)} settings and runtime behaviour.`:ee}function Q(f){const k=[...new Set(C(f).map(D=>D.apply_mode))];return k.length===1?k[0]:k.includes("restart")?"restart":k.includes("activation_required")?"activation_required":k[0]||"restart"}function oe(f){const k=[...new Set(C(f).map(D=>Vn(D.apply_mode)))];return k.length?k.length===1?k[0]:`Mixed apply behaviour: ${k.join(" · ")}`:""}function le(f){return bl(C(f))}function ie(f,k){return k.split(".").reduce((D,ee)=>D==null?void 0:D[ee],f)}function se(f){const k=G.value;return C(f).filter(D=>Mu(D.path)?!1:D.path.split(".").length<=2?!0:!D.path.includes(".*")).map(D=>({...D,key:D.path.split(".").at(-1),value:ie(k,D.path),apply_details:bl([D]),editor:D.path==="agents.final_warning_iterations"?"warning-chips":null}))}function ye(f){const k=f.path.split(".");return k.length>2?k.slice(0,2).join("."):null}function fe(f){const k=new Map;for(const D of se(f)){const ee=ye(D),pe=ee||`${f}.__root`;k.has(pe)||k.set(pe,{key:pe,path:ee,entries:[]}),k.get(pe).entries.push(D)}return[...k.values()].map(D=>{const ee=D.entries.find(pe=>pe.group_description);return{...D,label:D.path?ba(D.path.split(".").at(-1)):null,description:(ee==null?void 0:ee.group_description)||null,apply_details:bl(D.entries),runtime_summaries:ke(D.entries)}})}function he(f){return{save:f.save_effect||(f.apply_mode==="dormant"?"Saving records this value in config.yml.":"Saving records this value and validates the section."),runtime:f.runtime_effect||{live_read:"Odin reads the saved value during current work.",live_apply:"Odin reloads this setting without a restart.",live_for_new_work:"New work uses the saved value; existing work keeps its snapshot.",restart:"Odin keeps using its startup value until a clean restart.",activation_required:"Odin keeps the current behavior until you enable this feature separately.",legacy_control:"Odin keeps the existing compatibility behavior until you apply this choice.",dormant:"This version of Odin does not use the saved value. Restarting will not activate it."}[f.apply_mode]||"Effective runtime state is not currently observable."}}function ke(f){const k=new Map;for(const D of f){const ee=he(D),pe=`${D.apply_mode}|${ee.save}|${ee.runtime}`;k.has(pe)||k.set(pe,{key:pe,label:Vn(D.apply_mode),save:ee.save,runtime:ee.runtime})}return[...k.values()]}function Te(f){if(Ce(f))return f.runtime_effect||f.activation_policy||"";if(f.apply_mode==="activation_required"){const k=f.activation_policy||f.runtime_effect;return k?`Not active after saving. No activation control exists in this release. ${k}`:"Not active after saving; no activation control exists in this release."}return""}function Ce(f){return f.action_available===!0&&!!(f.action_label&&f.action_endpoint)}async function Ie(f){if(Ce(f))try{if(He(f.path))throw new Error("Save this setting before applying its action.");const k=String(f.action_method||"POST").toLowerCase(),D={post:W.post.bind(W),put:W.put.bind(W),delete:W.del.bind(W)}[k];if(!D)throw new Error("Unsupported configuration action");await D(f.action_endpoint,f.action_body||void 0),await Tn(),ys("success",`${f.action_label} completed.`)}catch(k){ys("error",k.message||`${f.action_label} failed`)}}function Pe(f,k){return[f.label,f.path,f.description,...f.aliases||[]].filter(Boolean).join(" ").toLowerCase().includes(k)}function $e(f){const k=d.value.trim().toLowerCase();return k?C(f).filter(D=>Pe(D,k)):[]}function Xe(f){const k=C(f);if(u.value!=="all"&&!k.some(ee=>ee.apply_state===u.value))return!1;const D=d.value.trim().toLowerCase();return!D||`${X(f)} ${f}`.toLowerCase().includes(D)?!0:k.some(ee=>Pe(ee,D))}function z(f,k){return C(f).filter(D=>D.apply_state===k).length}function xe(f){return f==="all"?ne.value:F.value.filter(k=>k.apply_state===f).length}function Re(f){const k=f.sections.flatMap(D=>C(D));return{fields:k.length,modified:J.value.filter(D=>f.sections.includes(D.path.split(".")[0])).length,pending_restart:k.filter(D=>D.apply_state==="pending_restart").length,invalid:k.filter(D=>D.apply_state==="invalid").length,dormant:k.filter(D=>D.apply_state==="dormant").length}}function Ne(f){var k;return Object.hasOwn(v.value,f)&&!wi((k=e.value)==null?void 0:k[f],v.value[f])}function He(f){return J.value.some(k=>k.path===f||k.path.startsWith(`${f}.`))}function Ve(f){p.value=f,d.value="",u.value="all";try{localStorage.setItem(_m,f)}catch{}}function ft(f){u.value=f}function es(){d.value="",u.value="all"}function vs(f){var k;return((k=j.value.find(D=>D.sections.includes(f)))==null?void 0:k.sections)||[]}function xn(f){const k=vs(f),D=k.find(ee=>h.value[ee]===!0);return D||k.find(ee=>h.value[ee]!==!1)||null}function Rs(f){return d.value&&!S.value&&Xe(f)?!0:S.value?xn(f)===f:Object.hasOwn(h.value,f)?h.value[f]===!0:!0}function $s(f){const k=!Rs(f);if(S.value){const D={...h.value};for(const ee of vs(f))D[ee]===!0&&(D[ee]=!1);D[f]=k,h.value=D;return}h.value={...h.value,[f]:k}}function At(){g.value.push(Kn(v.value)),g.value.length>Dk&&g.value.shift(),x.value=[]}function q(){ae.value&&(At(),v.value={},b.value={},E.value=!1)}function Oe(f,k=!1){const D=Date.now();if(k&&L.path===f&&D-L.at<Mk){L.at=D;return}At(),L={path:f,at:D}}function bs(f,k,D){if(!k.length)return D;const ee=Kn(f??{});let pe=ee;for(let we=0;we<k.length-1;we+=1){const st=k[we];pe[st]=Kn(pe[st]??{}),pe=pe[st]}return pe[k.at(-1)]=D,ee}function Bn(f){var k;return Object.hasOwn(v.value,f)?v.value[f]:Kn((k=e.value)==null?void 0:k[f])}function os(f,k,D={}){var dt;const[ee,...pe]=f.path.split(".");Oe(f.path,!!D.coalesce);const we=Bn(ee),st=pe.length?bs(we,pe,k):k,qe={...v.value};if(wi(st,(dt=e.value)==null?void 0:dt[ee])?delete qe[ee]:qe[ee]=st,v.value=qe,b.value[f.path]){const Ns={...b.value};delete Ns[f.path],b.value=Ns}}function Hn(f){L={path:null,at:0},y.value={...y.value,[f]:String(ie(G.value,f)??"")}}function Qa(f){if(L={path:null,at:0},!Object.hasOwn(y.value,f))return;const k={...y.value};delete k[f],y.value=k}function cs(f){const k=y.value[f.path];if(L={path:null,at:0},k===""){b.value={...b.value,[f.path]:"Enter a number."};return}const D=Number(k);if(Number.isNaN(D)||f.type==="integer"&&!Number.isInteger(D)){b.value={...b.value,[f.path]:f.type==="integer"?"Enter a whole number.":"Enter a number."};return}const ee={...y.value};delete ee[f.path],y.value=ee,os(f,D,{coalesce:!0})}function _n(f){return Object.hasOwn(y.value,f.path)?y.value[f.path]:f.value??""}function kn(f,k){if(y.value={...y.value,[f.path]:k},k===""){b.value={...b.value,[f.path]:"Enter a number."};return}const D=Number(k);if(!Number.isFinite(D)||f.type==="integer"&&!Number.isInteger(D)){b.value={...b.value,[f.path]:f.type==="integer"?"Enter a whole number.":"Enter a valid number."};return}if(b.value[f.path]){const ee={...b.value};delete ee[f.path],b.value=ee}os(f,D,{coalesce:!0})}function it(f){const k=Number.parseInt(R.value,10);if(!Number.isInteger(k)||k<1){b.value={...b.value,[f.path]:"Warning thresholds must be positive whole numbers."};return}const D=[...new Set([...f.value||[],k])].sort((ee,pe)=>pe-ee);R.value="",os(f,D)}function Is(f,k){os(f,(f.value||[]).filter(D=>D!==k))}function V(f){return f.type==="array"&&Array.isArray(f.value)&&!Lk.has(f.path)&&f.sensitivity==="public"&&f.value.every(k=>["string","number","boolean"].includes(typeof k))}function re(f){const k=String(I.value[f.path]??"").trim();if(!k)return;const D=[...new Set([...f.value||[],k])];I.value={...I.value,[f.path]:""},os(f,D)}function Ee(f,k){os(f,(f.value||[]).filter(D=>D!==k))}function We(f,k){var ee;if(!f)return null;if((ee=f.enum)!=null&&ee.length&&!f.enum.includes(k))return`Choose one of: ${f.enum.join(", ")}`;if(f.path==="agents.final_warning_iterations"&&(!Array.isArray(k)||!k.length))return"Add at least one warning threshold.";const D=f.constraints||{};if((f.type==="integer"||f.type==="number")&&typeof k=="number"){if(D.minimum!==void 0&&k<D.minimum)return`Must be at least ${D.minimum}${f.unit?` ${f.unit}`:""}`;if(D.maximum!==void 0&&k>D.maximum)return`Must be at most ${D.maximum}${f.unit?` ${f.unit}`:""}`}return null}function rt(f){return _e.value[f.path]||null}function Ft(f){const k=`${f}.`;return Object.keys(_e.value).some(D=>D===f||D.startsWith(k))}function $t(){g.value.length&&(x.value.push(Kn(v.value)),v.value=g.value.pop(),b.value={},y.value={},L={path:null,at:0})}function Xa(){x.value.length&&(g.value.push(Kn(v.value)),v.value=x.value.pop(),b.value={},y.value={},L={path:null,at:0})}function Zs(){!ae.value||H.value||(E.value=!0,T.value=!1)}function Mr(){E.value=!1}function Pr(){q()}function Vn(f){return Ok[f]||ba(f||"unknown")}function tl(f){return`apply-${String(f||"unknown").replaceAll("_","-")}`}function wn(f){return`cfgc-field-${f.replace(/[^a-zA-Z0-9_-]/g,"-")}`}function pa(f){return`${wn(f)}-input`}function Sn(f){const k=document.getElementById(wn(f))||document.getElementById(wn(f.split(".").slice(0,2).join(".")));k==null||k.scrollIntoView({behavior:"smooth",block:"center"})}function ys(f,k){i.value={type:f,message:k},window.setTimeout(()=>{var D;((D=i.value)==null?void 0:D.message)===k&&(i.value=null)},3500)}function Os(){var f;r.value=!1,u.value="pending_restart",d.value="",(f=window.scrollTo)==null||f.call(window,{top:0,behavior:"smooth"})}function sl(){r.value=!1}function ei(f=1800){A&&window.clearTimeout(A),A=window.setTimeout(Fr,f)}async function Fr(){if(o.value){if(B+=1,B>45){o.value=!1,c.value="Odin did not return with the new startup settings within 90 seconds.";return}try{if(t.value=await ao(),De.value===0){o.value=!1,c.value=null,ys("success","Odin restarted and the saved startup settings are active.");return}}catch{}ei(2e3)}}async function nl(){if(!o.value){c.value=null;try{await W.post("/api/restart",{}),o.value=!0,B=0,r.value=!1,ei()}catch(f){c.value=f.message||"Odin could not schedule a restart."}}}async function al(){if(!(!ae.value||H.value||n.value)){n.value=!0;try{const f=$k(e.value,v.value),k=await W.put("/api/config",f);e.value=k,v.value={},g.value=[],x.value=[],b.value={},E.value=!1;try{t.value=await ao(),l.value=null,r.value=De.value>0,ys("success",De.value?`Configuration saved. ${De.value} setting${De.value===1?"":"s"} still use startup values.`:"Configuration saved. Apply status has been refreshed.")}catch(D){l.value=D.message||"Unknown metadata error.",ys("error",`Configuration saved, but apply status could not be refreshed: ${l.value}`)}}catch(f){ys("error",f.message||"Configuration could not be saved")}finally{n.value=!1}}}async function Tn(){var f,k;if(!ae.value){s.value=!0,a.value=null;try{const D=await W.get("/api/config"),ee=await ao();e.value=D,t.value=ee,l.value=null;const pe=j.value;if(pe.some(we=>we.key===p.value)||(p.value=((f=pe[0])==null?void 0:f.key)||Pa[0].key),S.value){const st=(((k=pe.find(qe=>qe.key===p.value))==null?void 0:k.sections)||[]).find(qe=>h.value[qe]===!0);h.value=st?{...h.value,[st]:!0}:{}}}catch(D){a.value=D.message||"Unknown configuration error"}finally{s.value=!1}}}function ha(f){if(E.value||!(f.ctrlKey||f.metaKey))return;const k=f.target;k instanceof HTMLElement&&(k.matches("input, textarea, select")||k.isContentEditable)||(!f.shiftKey&&f.key.toLowerCase()==="z"?(f.preventDefault(),$t()):(f.key.toLowerCase()==="y"||f.shiftKey&&f.key.toLowerCase()==="z")&&(f.preventDefault(),Xa()))}function me(f){S.value=f.matches}return Yt(h,f=>{try{localStorage.setItem(xm,JSON.stringify(f))}catch{}},{deep:!0}),Ke(()=>{var f;Tn(),document.addEventListener("keydown",ha),w=window.matchMedia("(max-width: 760px)"),me(w),(f=w.addEventListener)==null||f.call(w,"change",me)}),bt(()=>{var f;document.removeEventListener("keydown",ha),(f=w==null?void 0:w.removeEventListener)==null||f.call(w,"change",me),A&&window.clearTimeout(A)}),{config:e,meta:t,loading:s,saving:n,error:a,toast:i,metaRefreshError:l,restartPromptOpen:r,restartScheduled:o,restartError:c,searchQuery:d,healthFilter:u,activeCategory:p,reviewOpen:E,mobileOverflowOpen:T,warningThresholdInput:R,arrayInputs:I,healthFilters:U,visibleCategories:j,displayGroups:ue,reviewGroups:de,sectionCount:Z,fieldCount:ne,hasChanges:ae,changeCount:ce,changedSectionCount:P,hasDraftErrors:H,canUndo:O,canRedo:N,globalFilterActive:te,reviewRestartCount:be,pendingRestartCount:De,pendingRestartFields:ge,healthCount:xe,categoryStats:Re,selectCategory:Ve,selectHealthFilter:ft,clearFilters:es,sectionLabel:X,sectionDescription:K,sectionFieldCount:$,sectionHealthCount:z,sectionApplySummary:oe,sectionApplyDetails:le,sectionEntries:se,fieldGroups:fe,sectionSearchHits:$e,fieldRuntimeCopy:he,fieldSpecificRuntimeNote:Te,hasHonestAction:Ce,runFieldAction:Ie,sectionChanged:Ne,fieldChanged:He,isSectionExpanded:Rs,toggleSection:$s,discardAllDrafts:q,setFieldValue:os,setNumberFieldValue:kn,numberInputValue:_n,beginInputEdit:Hn,endTextInputEdit:Qa,endInputEdit:cs,addWarningThreshold:it,removeWarningThreshold:Is,isScalarArray:V,addScalarArrayItem:re,removeScalarArrayItem:Ee,fieldError:rt,sectionHasErrors:Ft,undo:$t,redo:Xa,openReview:Zs,closeReview:Mr,mobileCancel:Pr,applyModeLabel:Vn,applyClass:tl,compactValue:Pk,formatValue:Fk,fieldId:wn,fieldInputId:pa,focusField:Sn,fetchConfig:Tn,saveConfig:al,restartOdin:nl,restartLater:sl,reviewPendingRestart:Os}}},Vk={template:`
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
            <div v-for="editor in globalListEditors" :key="editor.key" class="discord-global-list">
              <strong>{{ editor.label }}</strong>
              <p>{{ editor.description }}</p>
              <div class="cfgc-chip-list">
                <span v-for="item in globalDraft[editor.key]" :key="item" class="cfgc-chip">{{ item }}
                  <button type="button" @click="removeGlobalItem(editor.key, item)" :aria-label="'Remove ' + item">×</button>
                </span>
                <span v-if="!globalDraft[editor.key].length" class="cfgc-chip-empty">No entries</span>
              </div>
              <div class="cfgc-chip-add">
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
  `,setup(){const e=m([]),t=m(!0),s=m(null),n=m({}),a=m(null),i=m(null),l=m(!1),r=m(null),o=m({}),c=Object.freeze([{key:"allowed_users",label:"Allowed users",description:"Discord user IDs allowed by the global bot policy.",placeholder:"Discord user ID"},{key:"channels",label:"Allowed channels",description:"Channel IDs included by the global bot policy.",placeholder:"Discord channel ID"},{key:"ignore_bot_ids",label:"Ignored bot IDs",description:"Bot identities Odin never responds to automatically.",placeholder:"Discord bot ID"}]),d=Y(()=>JSON.stringify(a.value)!==JSON.stringify(i.value));function u(S){return S.config&&S.config.enabled!==void 0?S.config.enabled:!0}function p(S){return S.config&&S.config.require_mention!==void 0?S.config.require_mention:!1}function h(S){return S.config&&S.config.respond_to_bots!==void 0?S.config.respond_to_bots:!1}function v(S){return S.config&&Object.keys(S.config).length>0}function y(S){n.value[S]=!n.value[S]}async function R(){t.value=!0,s.value=null;try{e.value=await W.get("/api/discord/guilds");try{const w=(await W.get("/api/config")).discord||{};a.value={allowed_users:[...w.allowed_users||[]],channels:[...w.channels||[]],respond_to_bots:!!w.respond_to_bots,require_mention:!!w.require_mention,ignore_bot_ids:[...w.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value)),r.value=null}catch(S){r.value=S.message||"Global defaults could not be loaded."}}catch(S){s.value=S.message}t.value=!1}async function I(S,w,A){try{await W.put("/api/discord/guild/"+S+"/config",{[w]:A}),await R()}catch(L){s.value=L.message}}async function b(S,w,A,L){try{await W.put("/api/discord/channel/"+S+"/config",{[A]:L}),await R()}catch(B){s.value=B.message}}async function g(S,w){try{await W.put("/api/discord/channel/"+S+"/config",{clear:!0}),await R()}catch(A){s.value=A.message}}function x(S){const w=String(o.value[S]||"").trim();!w||i.value[S].includes(w)||(i.value[S]=[...i.value[S],w],o.value={...o.value,[S]:""})}function E(S,w){i.value[S]=i.value[S].filter(A=>A!==w)}async function T(){if(!(!d.value||l.value)){l.value=!0,r.value=null;try{const w=(await W.put("/api/config",{discord:i.value})).discord||i.value;a.value={allowed_users:[...w.allowed_users||[]],channels:[...w.channels||[]],respond_to_bots:!!w.respond_to_bots,require_mention:!!w.require_mention,ignore_bot_ids:[...w.ignore_bot_ids||[]]},i.value=JSON.parse(JSON.stringify(a.value))}catch(S){r.value=S.message||"Global defaults could not be saved."}finally{l.value=!1}}}return Ke(R),{guilds:e,loading:t,error:s,expanded:n,globalDraft:i,globalSaving:l,globalError:r,globalArrayInputs:o,globalListEditors:c,globalChanged:d,guildEnabled:u,guildMention:p,guildBots:h,hasOverride:v,toggleGuild:y,fetchGuilds:R,setGuildConfig:I,setChannelConfig:b,clearOverride:g,addGlobalItem:x,removeGlobalItem:E,saveGlobalDefaults:T}}},ds=e=>e==null?e:JSON.parse(JSON.stringify(e));function jk({applyDefault:e,applyUser:t,applyDelete:s,onDefaultConfirmed:n=()=>{},onDefaultRollback:a=()=>{},onUserConfirmed:i=()=>{},onUserRollback:l=()=>{},onUserDeleted:r=()=>{},onError:o=()=>{}}){let c=Promise.resolve(),d=0,u=0;const p=new Map;let h=null;const v=new Map;function y(T){d+=1;const S=c.then(T,T);return c=S.catch(()=>{}),S}function R(T,S){h=ds(T),v.clear();for(const[w,A]of Object.entries(S||{}))v.set(w,ds(A))}function I(T){const S=ds(T),w=++u;return y(async()=>{try{await e(ds(S)),h=ds(S),w===u&&n(ds(S))}catch(A){w===u&&(a(ds(h)),o(A,{kind:"default"}))}})}function b(T,S){const w=ds(S),A=(p.get(T)||0)+1;return p.set(T,A),y(async()=>{try{await t(T,ds(w)),v.set(T,ds(w)),A===p.get(T)&&i(T,ds(w))}catch(L){A===p.get(T)&&(l(T,ds(v.get(T)??null)),o(L,{kind:"user",uid:T}))}})}function g(T){const S=(p.get(T)||0)+1;return p.set(T,S),y(async()=>{try{await s(T),v.delete(T),S===p.get(T)&&r(T)}catch(w){S===p.get(T)&&(l(T,ds(v.get(T)??null)),o(w,{kind:"delete",uid:T}))}})}async function x(){for(;;){const T=c;if(await T,T===c)return d}}async function E(T){for(;;){const S=await x(),w=await T();if(S===d)return w}}return{seed:R,saveDefault:I,saveUser:b,deleteUser:g,whenIdle:x,readSnapshot:E,get revision(){return d}}}const zk={template:`
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
  `,setup(){const e=m(!0),t=m(""),s=m(null),n=m([]),a=m({allowed_hosts:[],default_host:""}),i=m({}),l=m(!1),r=m(""),o=m(!1),c=m(0),d=m([]),u=m(null),p=Y(()=>{const G={};for(const J of d.value)G[J.id]=J;return G});function h(G){return p.value[G]||null}const v=Y(()=>/^\d{15,25}$/.test(r.value.trim())),y=Y(()=>{if(o.value){if(R.value[c.value])return"host-user-option-"+c.value;if(v.value)return"host-user-option-raw"}}),R=Y(()=>{const G=r.value.toLowerCase().trim();return G?d.value.filter(J=>!i.value[J.id]&&(J.display_name.toLowerCase().includes(G)||J.username.toLowerCase().includes(G)||J.id.includes(G))):d.value.filter(J=>!i.value[J.id])});function I(G,J){return G?G.allowed_hosts===null||G.allowed_hosts===void 0?{allowed_hosts:[...J],default_host:G.default_host||"",allow_all:!0}:{allowed_hosts:G.allowed_hosts,default_host:G.default_host||"",allow_all:!1}:{allowed_hosts:[...J],default_host:J[0]||"",allow_all:!0}}const b=jk({applyDefault:async G=>{const J=G.allow_all?null:G.allowed_hosts;await W.put("/api/host-access/default-policy",{allowed_hosts:J,default_host:G.default_host})},applyUser:async(G,J)=>{const ae=J.allow_all?null:J.allowed_hosts;await W.put(`/api/host-access/user/${G}`,{allowed_hosts:ae,default_host:J.default_host})},applyDelete:G=>W.del(`/api/host-access/user/${G}`),onDefaultConfirmed:()=>Se.success("Default policy updated"),onDefaultRollback:G=>{G&&(a.value=G)},onUserConfirmed:G=>{const J=h(G);Se.success(`Updated access for ${J?J.display_name:G}`)},onUserRollback:(G,J)=>{const ae={...i.value};J?ae[G]=J:delete ae[G],i.value=ae},onUserDeleted:G=>{const J={...i.value};delete J[G],i.value=J},onError:(G,J)=>{var ce;const ae=J.uid?` ${((ce=h(J.uid))==null?void 0:ce.display_name)||J.uid}`:"";Se.error(`${G.message||"Failed to save"} — reverted${ae}`)}});let g=0;async function x(){const G=++g;e.value=!0,t.value="";try{const J=await b.readSnapshot(()=>W.get("/api/host-access"));if(G!==g)return;s.value=J,n.value=J.available_hosts||[],a.value=I(J.default_policy,n.value);const ae=J.users||{},ce={};for(const[P,te]of Object.entries(ae))ce[P]=I(te,n.value);i.value=ce,b.seed(a.value,ce)}catch(J){G===g&&(t.value=J.message||"Failed to fetch host access data")}finally{G===g&&(e.value=!1)}try{const J=await W.get("/api/discord/members")||[];G===g&&(d.value=J)}catch{G===g&&(d.value=[])}}function E(){b.saveDefault(a.value)}function T(G,J){a.value.allow_all=!1,J?a.value.allowed_hosts.includes(G)||a.value.allowed_hosts.push(G):(a.value.allowed_hosts=a.value.allowed_hosts.filter(ae=>ae!==G),a.value.default_host===G&&(a.value.default_host=a.value.allowed_hosts[0]||"")),E()}function S(G){const J=i.value[G];J&&b.saveUser(G,J)}function w(G,J,ae){const ce=i.value[G];ce&&(ce.allow_all=!1,ae?ce.allowed_hosts.includes(J)||ce.allowed_hosts.push(J):(ce.allowed_hosts=ce.allowed_hosts.filter(P=>P!==J),ce.default_host===J&&(ce.default_host=ce.allowed_hosts[0]||"")),S(G))}function A(G,J){const ae=i.value[G];ae&&(ae.default_host=J,S(G))}function L(){l.value=!0,r.value="",c.value=0,Ct(()=>{u.value&&u.value.focus()})}function B(){o.value=!0,c.value=0}function F(){c.value<R.value.length-1&&c.value++}function M(){c.value>0&&c.value--}function Z(){const G=R.value[c.value];if(G){U(G);return}v.value&&ne()}function ne(){const G=r.value.trim();/^\d{15,25}$/.test(G)&&(i.value[G]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},S(G),r.value="",o.value=!1,l.value=!1)}function U(G){i.value[G.id]={allowed_hosts:[...n.value],default_host:n.value[0]||"",allow_all:!1},S(G.id),r.value="",o.value=!1,l.value=!1}function O(){o.value=!1}function N(){setTimeout(()=>{o.value=!1},150)}async function j(G){const J=h(G);await hs({title:"Remove user override",message:`Remove the host access override for ${J?J.display_name:G}? They will fall back to the default policy.`,confirmLabel:"Remove",danger:!0})&&(await b.deleteUser(G),i.value[G]||Se.success(`Removed override for ${J?J.display_name:G}`))}return Ke(x),{loading:e,error:t,data:s,availableHosts:n,defaultPolicy:a,users:i,showAddUser:l,searchQuery:r,showDropdown:o,highlightIdx:c,members:d,filteredMembers:R,isRawId:v,activeOptionId:y,searchInput:u,fetchData:x,saveDefaultPolicy:E,toggleDefaultHost:T,getMember:h,toggleUserHost:w,setUserDefault:A,openAddUser:L,deleteUser:j,onSearchInput:B,highlightNext:F,highlightPrev:M,selectHighlighted:Z,selectMember:U,closeDropdown:O,onBlur:N,addRawId:ne}}},qk={template:`
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
  `,setup(){const e=m(!0),t=m(""),s=m(null),n=m([]),a=m(!1),i=m(!1),l=m(null),r=m(null),o=m(!1),c=m({user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),d=m({username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""}),u=Y(()=>c.value.host_mode==="select"?c.value.allowed_hosts:c.value.host_mode==="none"?[]:n.value),p=Y(()=>d.value.host_mode==="select"?d.value.allowed_hosts:d.value.host_mode==="none"?[]:n.value);function h(w){return w==="admin"?"text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400":w==="user"?"text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400":"text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"}async function v(){e.value=!0,t.value="";try{const w=await W.get("/api/tokens");s.value=w.tokens||[],n.value=w.available_hosts||[]}catch(w){t.value=w.message||"Failed to load tokens"}finally{e.value=!1}}function y(w){return!w||!w.trim()?[]:w.split(",").map(A=>A.trim()).filter(Boolean)}function R(w,A){const L=c.value.allowed_hosts;if(A&&!L.includes(w)&&L.push(w),!A){const B=L.indexOf(w);B>=0&&L.splice(B,1)}}function I(w,A){const L=d.value.allowed_hosts;if(A&&!L.includes(w)&&L.push(w),!A){const B=L.indexOf(w);B>=0&&L.splice(B,1)}}async function b(){var w;i.value=!0;try{const A=y(c.value.allowed_tools_str),L=c.value.host_mode,B=L==="none"?[]:L==="select"?c.value.allowed_hosts:null,F={user_id:c.value.user_id.trim(),username:c.value.username.trim()||"API",tier:c.value.tier,label:c.value.label.trim(),allowed_tools:A.length?A:[]};B!==null&&(F.allowed_hosts=B),F.default_host=c.value.default_host||"";const M=await W.post("/api/tokens",F);l.value=M.token,c.value={user_id:"",username:"",tier:"admin",label:"",host_mode:"default",allowed_hosts:[],default_host:"",allowed_tools_str:""},a.value=!1,Se.success("Token created"),await v()}catch(A){Se.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to create token")}finally{i.value=!1}}function g(w){r.value=w;const A=w.allowed_hosts;let L="default";A==null?L="default":Array.isArray(A)&&A.length===0?L="none":Array.isArray(A)&&(L="select"),d.value={username:w.username||"",tier:w.tier||"admin",label:w.label||"",host_mode:L,allowed_hosts:Array.isArray(A)?[...A]:[],default_host:w.default_host||"",allowed_tools_str:(w.allowed_tools||[]).join(", ")}}async function x(){var w;if(r.value){o.value=!0;try{const A=y(d.value.allowed_tools_str),L=d.value.host_mode,B={username:d.value.username,tier:d.value.tier,label:d.value.label,allowed_tools:A};L==="none"?B.allowed_hosts=[]:L==="select"?B.allowed_hosts=d.value.allowed_hosts:B.allowed_hosts=null,B.default_host=d.value.default_host||"",await W.put("/api/tokens/"+encodeURIComponent(r.value.user_id),B),r.value=null,Se.success("Token updated"),await v()}catch(A){Se.error(((w=A.data)==null?void 0:w.error)||A.message||"Failed to update")}finally{o.value=!1}}}async function E(w){var L;if(await hs({title:"Regenerate token",message:`Regenerate token for ${w.username||w.user_id}? The old token will stop working immediately.`,confirmLabel:"Regenerate",danger:!0}))try{const B=await W.post("/api/tokens/"+encodeURIComponent(w.user_id)+"/regenerate");l.value=B.token,Se.success("Token regenerated")}catch(B){Se.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to regenerate")}}async function T(w){var L;if(await hs({title:"Delete token",message:`Delete token for ${w.username||w.user_id}? This cannot be undone.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/tokens/"+encodeURIComponent(w.user_id)),Se.success("Token deleted"),await v()}catch(B){Se.error(((L=B.data)==null?void 0:L.error)||B.message||"Failed to delete")}}async function S(){if(l.value)try{await navigator.clipboard.writeText(l.value),Se.success("Copied to clipboard")}catch{Se.error("Copy failed — select and copy manually")}}return Ke(v),{loading:e,error:t,tokens:s,availableHosts:n,showCreate:a,creating:i,newToken:l,editing:r,saving:o,createForm:c,editForm:d,createDefaultHostOptions:u,editDefaultHostOptions:p,fetchData:v,tierBadge:h,toggleCreateHost:R,toggleEditHost:I,createToken:b,startEdit:g,saveEdit:x,confirmRegenerate:E,confirmDelete:T,copyToken:S}}};function yl(e,t=500){let s=null;const n=(...a)=>{s&&clearTimeout(s),s=setTimeout(()=>{s=null,e(...a)},t)};return n.pending=()=>s!==null,n.cancel=()=>{s&&(clearTimeout(s),s=null)},n}const Gk={template:`
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
  `,setup(){const e=m(!0),t=m(null),s=m("codex"),n=m({enabled:!1,model:"gpt-5.5",max_tokens:4096,reasoning_effort:"medium",agent_reasoning_effort:"",agent_model:"",request_timeout_seconds:3600,stream_stall_timeout_seconds:180,retry:{max_retries:3,base_delay:1,max_delay:30},connection_pool:{max_connections:10,keepalive_timeout:30},context_compression:{enabled:!0,max_context_chars:75e4,keep_recent_iterations:30}}),a=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.5"],i=Y(()=>{const q=n.value.model;return q&&!a.includes(q)?[q,...a]:a}),l=Y(()=>{const q=n.value.agent_model;return q&&q!=="auto"&&!a.includes(q)?[q,...a]:a}),r=["gpt-5.5","gpt-5.4","gpt-5.4-mini"],o=Y(()=>!r.includes(n.value.model)&&!(r.includes(n.value.agent_model)&&n.value.agent_reasoning_effort==="")),c=Y(()=>{const q=n.value.agent_model;return q==="auto"?!0:!r.includes(q||n.value.model)}),d=Y(()=>{const q=n.value.agent_reasoning_effort;return q==="auto"?!1:(q||n.value.reasoning_effort)==="max"}),u=q=>r.includes(q)&&(n.value.reasoning_effort==="max"||n.value.agent_model===""&&d.value),p=q=>r.includes(q)&&d.value,h=m({enabled:!1,model:"gpt-5.6-luna"}),v=m({unavailable_reason:null}),y=Y(()=>{const q=h.value.model;return q&&!a.includes(q)?[q,...a]:a});function R(q){const Oe=q.target.value;h.value.enabled=Oe!=="",Oe!==""&&(h.value.model=Oe),Xe()}const I=m(!1),b=m({codex:!1,ollama:!1,kimi:!1}),g=m({enabled:!1,base_url:"",model:"",api_key:"",max_tokens:4096,timeout:300}),x=m({enabled:!1,api_key:"",model:"",max_tokens:4096,timeout:300}),E=m(!1),T=m(!1),S=m(!1),w=m(!1),A=m(!1),L=m(!1),B=m(!1),F=m({configured:!1}),M=m([]),Z=m(""),ne=m(!1),U=m(!1),O=m({configured:!1}),N=m([]),j=m(""),G=m(!1),J=m(!1),ae=m(!0),ce=m(""),P=m({configured:!1,accounts:[]}),te=m(null),_e=m(null),H=m(""),ue=m(null),de=m(!1),be=m(null),ge=m(null),De=m("");let _=null;function C(q,Oe="success"){Se(q,Oe==="error"?"error":"success")}function $(q){if(!q)return"?";const Oe=q/(1024*1024*1024);return Oe>=1?Oe.toFixed(1)+" GB":(q/(1024*1024)).toFixed(0)+" MB"}async function X(){e.value=!0,await Promise.all([K(),Q(),fe(),oe()]),e.value=!1}async function K(){try{const q=await W.get("/api/llm/status");t.value=q,s.value=q.active_provider||"codex",q.codex&&!$e.pending()&&(n.value.enabled=q.codex.enabled,n.value.model=q.codex.model||"gpt-5.5",n.value.reasoning_effort=q.codex.reasoning_effort||"medium",n.value.agent_reasoning_effort=q.codex.agent_reasoning_effort||"",n.value.agent_model=q.codex.agent_model||"",n.value.max_tokens=q.codex.max_tokens||4096,n.value.request_timeout_seconds=q.codex.request_timeout_seconds??n.value.request_timeout_seconds,n.value.stream_stall_timeout_seconds=q.codex.stream_stall_timeout_seconds??n.value.stream_stall_timeout_seconds,n.value.retry={...n.value.retry,...q.codex.retry||{}},n.value.connection_pool={...n.value.connection_pool,...q.codex.connection_pool||{}},n.value.context_compression={...n.value.context_compression,...q.codex.context_compression||{}}),q.ollama&&!z.pending()&&(g.value.enabled=q.ollama.enabled,g.value.base_url=q.ollama.base_url||"",g.value.model=q.ollama.model||"",g.value.max_tokens=q.ollama.max_tokens||4096,g.value.timeout=q.ollama.timeout??g.value.timeout),q.kimi&&!xe.pending()&&(x.value.enabled=q.kimi.enabled,x.value.model=q.kimi.model||"",x.value.max_tokens=q.kimi.max_tokens||4096,x.value.timeout=q.kimi.timeout??x.value.timeout),q.auxiliary&&(v.value=q.auxiliary,Xe.pending()||(h.value.enabled=q.auxiliary.enabled,h.value.model=q.auxiliary.model||"gpt-5.6-luna"))}catch{t.value={active_provider:"codex",codex:{configured:!1},ollama:{configured:!1},kimi:{configured:!1}}}}async function Q(){try{if(F.value=await W.get("/api/ollama/status"),F.value.model&&(Z.value=F.value.model),F.value.configured)try{const q=await W.get("/api/ollama/models");M.value=q.models||[]}catch{M.value=[]}else if(g.value.base_url)try{const q=await W.post("/api/ollama/probe-models",{base_url:g.value.base_url});M.value=q.models||[]}catch{M.value=[]}}catch{F.value={configured:!1}}}async function oe(){ae.value=!0,ce.value="";try{P.value=await W.get("/api/codex/status")}catch(q){ce.value=q.message||"Failed to fetch Codex status"}finally{ae.value=!1}}async function le(){const q=t.value?t.value.active_provider:"codex";B.value=!0;try{const Oe=await W.post("/api/llm/switch",{provider:s.value});Oe.error?(s.value=q,C(Oe.error,"error")):(C("Switched to "+s.value+" ("+Oe.model+")"),await X())}catch(Oe){s.value=q,C(Oe.message||"Switch failed","error")}finally{B.value=!1}}async function ie(){ne.value=!0;try{const q=await W.post("/api/ollama/reload");C(q.configured?"Ollama reloaded":q.reason||"Ollama not configured",q.configured?"success":"error"),await X()}catch(q){C(q.message||"Reload failed","error")}finally{ne.value=!1}}async function se(){U.value=!0;try{await W.post("/api/ollama/model",{model:Z.value}),C("Model set to "+Z.value),await X()}catch(q){C(q.message||"Failed","error")}finally{U.value=!1}}async function ye(){const q=g.value.base_url;if(!q){C("Enter a base URL first","error");return}L.value=!0;try{const Oe=await W.post("/api/ollama/probe-models",{base_url:q});M.value=Oe.models||[],M.value.length?(C(M.value.length+" model(s) found"),!g.value.model&&M.value.length&&(g.value.model=M.value[0].name)):C("No models found at "+q,"error")}catch(Oe){C(Oe.message||"Could not reach Ollama","error")}finally{L.value=!1}}async function fe(){try{if(O.value=await W.get("/api/kimi/status"),O.value.model&&(j.value=O.value.model),O.value.configured)try{const q=await W.get("/api/kimi/models");N.value=q.models||[]}catch{N.value=[]}}catch{O.value={configured:!1}}}async function he(){G.value=!0;try{const q=await W.post("/api/kimi/reload");C(q.configured?"Kimi reloaded":q.reason||"Kimi not configured",q.configured?"success":"error"),await X()}catch(q){C(q.message||"Reload failed","error")}finally{G.value=!1}}async function ke(){J.value=!0;try{await W.post("/api/kimi/model",{model:j.value}),C("Model set to "+j.value),await X()}catch(q){C(q.message||"Failed","error")}finally{J.value=!1}}async function Te(){if(S.value){$e();return}S.value=!0;try{await W.put("/api/llm/codex/config",n.value),C("Codex config saved"),await Promise.all([K(),oe()])}catch(q){C(q.message||"Failed","error"),await Promise.all([K(),oe()])}finally{S.value=!1}}async function Ce(){if(w.value){z();return}w.value=!0;try{const q={...g.value},Oe=E.value?g.value.api_key:null;Oe===null&&delete q.api_key,await W.put("/api/llm/ollama/config",q),C("Ollama config saved"),Oe!==null&&g.value.api_key===Oe&&(g.value.api_key="",E.value=!1),await Promise.all([K(),Q()])}catch(q){C(q.message||"Failed","error")}finally{w.value=!1}}async function Ie(){if(A.value){xe();return}A.value=!0;try{const q={...x.value},Oe=T.value?x.value.api_key:null;Oe===null&&delete q.api_key,await W.put("/api/llm/kimi/config",q),C("Kimi config saved"),Oe!==null&&x.value.api_key===Oe&&(x.value.api_key="",T.value=!1),await Promise.all([K(),fe()])}catch(q){C(q.message||"Failed","error")}finally{A.value=!1}}async function Pe(){if(I.value){Xe();return}I.value=!0;try{await W.put("/api/llm/auxiliary/config",h.value),C("Auxiliary config saved"),await K()}catch(q){C(q.message||"Failed","error"),await K()}finally{I.value=!1}}const $e=yl(Te),Xe=yl(Pe),z=yl(Ce),xe=yl(Ie),Re=()=>($e.cancel(),Te()),Ne=()=>(z.cancel(),Ce()),He=()=>(xe.cancel(),Ie());async function Ve(q){try{await W.post("/api/codex/account/"+q+"/activate"),C("Active account switched"),await oe()}catch(Oe){C(Oe.message||"Failed","error")}}async function ft(q){te.value=q;try{await W.post("/api/codex/account/"+q+"/refresh"),C("Token refreshed"),await oe()}catch(Oe){C(Oe.message||"Refresh failed","error")}finally{te.value=null}}function es(q,Oe){_e.value=q,H.value=Oe||""}async function vs(q){try{await W.put("/api/codex/account/"+q+"/label",{label:H.value}),C("Label updated"),_e.value=null,await oe()}catch(Oe){C(Oe.message||"Failed","error")}}async function xn(q,Oe){if(await hs({title:"Delete Codex account",message:`Delete ${Oe||"account #"+(q+1)}? The pool will reload without it.`,confirmLabel:"Delete",danger:!0}))try{await W.del("/api/codex/account/"+q),C("Deleted. Pool reloaded."),await oe()}catch(Bn){C(Bn.message||"Failed","error")}}async function Rs(){de.value=!0;try{const q=await W.post("/api/codex/device-code");be.value=q,ue.value="pending",$s(q)}catch(q){C(q.message||"Failed","error")}finally{de.value=!1}}async function $s(q){_={cancelled:!1};const Oe=_;try{const bs=await W.post("/api/codex/device-poll",{device_auth_id:q.device_auth_id,user_code:q.user_code,interval:q.interval});if(Oe.cancelled)return;ge.value=bs,ue.value="success",await X()}catch(bs){if(Oe.cancelled)return;De.value=bs.message||"Device login failed",ue.value="error"}}function At(){_&&(_.cancelled=!0),ue.value=null,be.value=null}return Ke(X),bt(()=>{_&&(_.cancelled=!0),$e.cancel(),Xe.cancel(),z.cancel(),xe.cancel()}),{loading:e,llmStatus:t,selectedProvider:s,switching:B,advancedOpen:b,codexForm:n,codexModelOptions:i,codexAgentModelOptions:l,mainMaxAllowed:o,agentMaxAllowed:c,mainModelOptionDisabled:u,agentModelOptionDisabled:p,auxForm:h,auxData:v,auxModelOptions:y,onAuxModelChange:R,savingAux:I,saveAuxConfigDebounced:Xe,ollamaForm:g,kimiForm:x,savingCodex:S,savingOllama:w,savingKimi:A,probingOllama:L,ollamaKeyDirty:E,kimiKeyDirty:T,ollamaStatus:F,ollamaModels:M,ollamaSelectedModel:Z,reloading:ne,settingModel:U,kimiStatus:O,kimiModels:N,kimiSelectedModel:j,reloadingKimi:G,settingKimiModel:J,codexLoading:ae,codexError:ce,codexData:P,refreshing:te,editingLabel:_e,labelValue:H,deviceState:ue,deviceLoading:de,deviceInfo:be,deviceResult:ge,deviceError:De,fetchAll:X,switchProvider:le,reloadOllama:ie,setOllamaModel:se,reloadKimi:he,setKimiModel:ke,probeOllamaModels:ye,saveCodexConfig:Te,saveOllamaConfig:Ce,saveKimiConfig:Ie,saveCodexConfigDebounced:$e,saveOllamaConfigDebounced:z,saveKimiConfigDebounced:xe,saveCodexConfigNow:Re,saveOllamaConfigNow:Ne,saveKimiConfigNow:He,activateAccount:Ve,refreshAccount:ft,startEditLabel:es,saveLabel:vs,deleteAccount:xn,startDeviceLogin:Rs,cancelDeviceLogin:At,formatSize:$}}},Pu={ok:"text-green-400",pass:"text-green-400",degraded:"text-yellow-400",warn:"text-yellow-400",down:"text-red-400",fail:"text-red-400",unconfigured:"text-gray-500",skipped:"text-gray-500"};function Kk(e){return Pu[e]||Pu[(e||"").toLowerCase()]||"text-gray-400"}const Wk={template:`
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
  `,setup(){const e=m(!0),t=m({}),s=m([]),n=m({}),a=m({}),i=m(null),l=m(null),r=m(null),o=m(null),c=m(null),d=m(""),u=m(0),p=m([]),h=Y(()=>p.value.map(E=>`${E.label} (${E.path}${E.reason?`: ${E.reason}`:""})`).join("; ")),v=Object.freeze([{key:"startup",label:"Startup diagnostics",path:"/api/startup/diagnostics"},{key:"subsystems",label:"Subsystem status",path:"/api/subsystems/status"},{key:"sshPool",label:"SSH pool",path:"/api/pools/ssh"},{key:"httpPool",label:"HTTP pool",path:"/api/pools/http"},{key:"riskStats",label:"Risk stats",path:"/api/risk/stats"},{key:"recoveryStats",label:"Recovery stats",path:"/api/recovery/stats"},{key:"compressionStats",label:"Compression stats",path:"/api/compression/stats"},{key:"freshnessStats",label:"Freshness stats",path:"/api/freshness/stats"},{key:"governorStats",label:"Governor stats",path:"/api/governor/stats"}]);let y=null;async function R(){var A;const E=await Promise.allSettled(v.map(L=>W.get(L.path))),T=L=>E[L].status==="fulfilled"?E[L].value:null;t.value=T(0)||{};const S=T(1);s.value=Array.isArray(S)?S:S&&S.subsystems||[],n.value=T(2)||{},a.value=T(3)||{},i.value=T(4),l.value=T(5),r.value=T(6),o.value=T(7),c.value=T(8);const w=E.filter(L=>L.status==="rejected");if(p.value=E.flatMap((L,B)=>{var F;return L.status==="rejected"?[{...v[B],reason:((F=L.reason)==null?void 0:F.message)||"request failed"}]:[]}),u.value=p.value.length,w.length===E.length){const L=(A=w[0])==null?void 0:A.reason;d.value=(L==null?void 0:L.message)||"Failed to load internals"}else d.value="";e.value=!1}function I(){e.value=!0,d.value="",R()}let b=!1;function g(){b||(b=!0,R(),y||(y=setInterval(R,3e4)))}function x(){b&&(b=!1,y&&(clearInterval(y),y=null))}return Ke(g),Es(g),As(x),bt(x),{loading:e,error:d,failedCount:u,failedEndpoints:p,failedEndpointSummary:h,endpoints:v,retry:I,startup:t,subsystems:s,sshPool:n,httpPool:a,riskStats:i,recoveryStats:l,compressionStats:r,freshnessStats:o,governorStats:c,statusColor:Kk,formatTime:Kc}}},Zk={setup(){const e=m(""),t=m(""),s=m(!1),n=m(""),a=m(!1),i=m(!1),l=m(!1),r=m(null),o=m(!1);async function c(){a.value=!0,r.value=null,o.value=!1;try{const u=await W.get("/api/update/check");e.value=u.current||"",t.value=u.latest||"",s.value=u.update_available||!1,n.value=u.changelog||"",u.error&&(r.value=u.error),o.value=!0}catch(u){r.value=u.message}finally{a.value=!1}}async function d(){if(await hs({title:"Update & restart",message:"Update Odin and restart? Active tasks will be interrupted.",confirmLabel:"Update & Restart",danger:!0})){i.value=!0,r.value=null;try{await W.post("/api/update/apply",{version:"latest"}),l.value=!0,setTimeout(()=>location.reload(),8e3)}catch(p){r.value=p.message}finally{i.value=!1}}}return Ke(c),{current:e,latest:t,updateAvailable:s,changelog:n,checking:a,applying:i,applied:l,error:r,checkDone:o,checkUpdate:c,applyUpdate:d}},template:`
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
  `},Sm=[{id:"health",label:"Health",component:Sk},{id:"resources",label:"Resources",component:Tk},{id:"logs",label:"Logs",component:Rk},{id:"config",label:"Config",component:Hk},{id:"discord",label:"Discord",component:Vk},{id:"host-access",label:"Host Access",component:zk},{id:"api-tokens",label:"API Tokens",component:qk},{id:"llm",label:"LLM Config",component:Gk},{id:"internals",label:"Internals",component:Wk},{id:"update",label:"Update",component:Zk}],Jk={components:{TabbedPage:Nr},setup(){return{tabs:Sm}},template:'<tabbed-page :tabs="tabs" default-tab="health" group-label="System" />'},xl=(e,t,s,n)=>n.map(({id:a,label:i})=>({group:e,label:i,icon:t,to:{path:s,query:{tab:a}}})),Yk=[{group:"Workspace",label:"Dashboard",icon:"dashboard",to:{path:"/dashboard"}},{group:"Workspace",label:"Chat",icon:"chat",to:{path:"/chat"}},...xl("Operations","operations","/operations",vm),...xl("History","history","/history",bm),...xl("Capabilities","capabilities","/capabilities",ym),{group:"Manage",label:"Personality",icon:"personality",to:{path:"/personality"}},...xl("System","system","/system",Sm)],ns=$n({open:!1,query:"",selected:0});function Fu(){ns.query="",ns.selected=0,ns.open=!0}function io(){ns.open=!1}function Qk(e,t){const s=e.label.toLowerCase(),n=`${e.group} ${e.label}`.toLowerCase();return t?s.startsWith(t)?100:n.startsWith(t)?80:s.includes(t)?60:n.includes(t)?40:0:1}const Xk={setup(){const e=dm(),t=m(null),s=Y(()=>{const i=ns.query.trim().toLowerCase();return Yk.map(l=>({...l,_score:Qk(l,i)})).filter(l=>l._score>0).sort((l,r)=>r._score-l._score)});Yt(()=>ns.open,async i=>{var l;i&&(await Ct(),(l=t.value)==null||l.focus())}),Yt(()=>ns.query,()=>{ns.selected=0});function n(i){io(),e.push(i.to)}function a(i){if(i.key==="Escape"){i.preventDefault(),io();return}if(i.key==="ArrowDown")i.preventDefault(),ns.selected=Math.min(ns.selected+1,s.value.length-1);else if(i.key==="ArrowUp")i.preventDefault(),ns.selected=Math.max(ns.selected-1,0);else if(i.key==="Enter"){i.preventDefault();const l=s.value[ns.selected];l&&n(l)}}return{state:ns,results:s,inputEl:t,go:n,onKeydown:a,closePalette:io}},template:`
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
  `},Vo={brand:"M12 3 4.5 8v8L12 21l7.5-5V8L12 3Zm0 4.2 4.6 3.1L12 16.8l-4.6-6.5L12 7.2Zm0 3.3v3.7",dashboard:"M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",chat:"M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v8Z",operations:"M5 12h3l2-6 4 12 2-6h3M4 4v16h16",history:"M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7v5l3 2",home:"M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6",users:"M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9m-2-11.8a4 4 0 0 1 0 7.7",capabilities:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",personality:"M12 3a8 8 0 0 0-8 8c0 4 3 7 7 7v3h3v-3c3 0 6-3 6-7a8 8 0 0 0-8-8ZM8.5 10h.01M15.5 10h.01M9 14c1.7 1.2 4.3 1.2 6 0",system:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",menu:"M4 7h16M4 12h16M4 17h16",panelLeft:"M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4V4Zm0 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M6 8h.01M6 12h.01",chevronLeft:"m15 18-6-6 6-6",chevronRight:"m9 18 6-6-6-6",chevronDown:"m6 9 6 6 6-6",chevronUp:"m18 15-6-6-6 6",search:"m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",logout:"M10 17l5-5-5-5m5 5H3m10-8h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",success:"m5 12 4 4L19 6",warning:"M12 3 2.8 20h18.4L12 3Zm0 6v4m0 3h.01",info:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-8v4m0-8h.01",error:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3-12 6 6m0-6-6 6",edit:"M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4",trash:"M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3Zm-3 3 1 13h10l1-13",brain:"M9 5a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 4 14a3 3 0 0 0 5 2.2V5Zm6 0a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 0 6.8 3 3 0 0 1-5 2.2V5ZM9 9H7m2 4H6m9-4h2m-2 4h3M12 4v16",refresh:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",close:"M6 6l12 12M18 6 6 18",command:"M7 8a3 3 0 1 1-3-3h3v14a3 3 0 1 1-3-3h13a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H7Z",external:"M14 4h6v6m0-6-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6",activity:"M4 12h4l2-5 4 10 2-5h4",shield:"M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6l-7-3Z",database:"M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Zm0 0v6c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6v6c0 1.7-3.6 3-8 3s-8-1.3-8-3v-6",server:"M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3-7h.01M7 17h.01",terminal:"M5 7l4 4-4 4m6 1h8M3 4h18v16H3V4Z",wrench:"M14.7 6.3a4 4 0 0 0-5.6 5.6L4 17v3h3v-2h2v-2h2l1.1-1.1a4 4 0 0 0 5.6-5.6l-3 3-3-3 3-3Z",bot:"M8 4h8m-4-2v2M5 8h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Zm3 4h.01M16 12h.01M8 16h8M3 13H1m22 0h-2",workflow:"M5 5h5v5H5V5Zm9 9h5v5h-5v-5ZM10 7.5h4a3 3 0 0 1 3 3V14M7.5 10v4a3 3 0 0 0 3 3H14",globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21m0-18C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9M3 12h18",book:"M4 5a3 3 0 0 1 3-2h5v17H7a3 3 0 0 0-3 1V5Zm16 0a3 3 0 0 0-3-2h-5v17h5a3 3 0 0 1 3 1V5Z",message:"M4 4h16v13H8l-4 4V4Zm4 5h8m-8 4h5",puzzle:"M9 4h3a2 2 0 1 1 4 0h4v5a2 2 0 1 0 0 4v7h-7a2 2 0 1 1-4 0H4v-7a2 2 0 1 0 0-4V4h5",sparkles:"m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Zm6 10 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l1 2.8L9 18l-3 1.2L5 22l-1-2.8L1 18l3-1.2L5 14Z",link:"M9.5 14.5 14.5 9m-7 8H6a4 4 0 0 1 0-8h3m6 0h3a4 4 0 0 1 0 8h-3",file:"M6 3h8l4 4v14H6V3Zm8 0v5h5M9 13h6m-6 4h6",folder:"M3 6h7l2 2h9v11H3V6Z",image:"M4 4h16v16H4V4Zm3 12 4-4 3 3 2-2 4 4M9 9h.01",attachment:"m8 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7",clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",calendar:"M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14",chart:"M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20",sliders:"M4 7h10m4 0h2M4 17h2m4 0h10M16 4v6M8 14v6",code:"m9 6-6 6 6 6m6-12 6 6-6 6",copy:"M8 8h11v12H8V8Zm-3 8H4V4h11v1",play:"m8 5 11 7-11 7V5Z",grid:"M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",list:"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",target:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-4h.01",rotate:"M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 14",archive:"M4 8h16v12H4V8Zm-1-4h18v4H3V4Zm6 8h6",flame:"M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-5 5-5 8-1-1-2-3-1-5-3 2-5 5-5 8 0 4 3 7 8 7Z",eye:"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",upload:"M12 16V4m-5 5 5-5 5 5M5 20h14",download:"M12 4v12m-5-5 5 5 5-5M5 20h14",undo:"M9 7 4 12l5 5m-5-5h10a6 6 0 0 1 6 6",redo:"m15 7 5 5-5 5m5-5H10a6 6 0 0 0-6 6",minus:"M5 12h14",more:"M6 12h.01M12 12h.01M18 12h.01",pause:"M9 5v14m6-14v14",sort:"M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"};Object.freeze(Object.keys(Vo));const ew={name:"OdinIcon",props:{name:{type:String,required:!0},size:{type:[Number,String],default:18},strokeWidth:{type:[Number,String],default:1.8}},setup(e,{attrs:t}){return()=>Ua("svg",{...t,class:["odin-icon",t.class],width:e.size,height:e.size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":e.strokeWidth,"stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":t["aria-label"]?void 0:"true",focusable:"false"},[Ua("path",{d:Vo[e.name]||Vo.info})])}},tw=["a[href]","button:not([disabled])",'input:not([disabled]):not([type="hidden"])',"select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(",");function $u(e){return[...e.querySelectorAll(tw)].filter(t=>!t.hasAttribute("hidden")&&t.getAttribute("aria-hidden")!=="true")}const sw={mounted(e){const t=document.activeElement,s=n=>{if(n.key!=="Tab")return;const a=$u(e);if(!a.length){n.preventDefault(),e.focus();return}const i=a[0],l=a[a.length-1];n.shiftKey&&document.activeElement===i?(n.preventDefault(),l.focus()):!n.shiftKey&&document.activeElement===l&&(n.preventDefault(),i.focus())};e.__odinModalFocus={previous:t,onKeydown:s},e.addEventListener("keydown",s),requestAnimationFrame(()=>{(e.querySelector("[autofocus]")||$u(e)[0]||e).focus()})},unmounted(e){var s;const t=e.__odinModalFocus;t&&(e.removeEventListener("keydown",t.onKeydown),(s=t.previous)!=null&&s.isConnected&&typeof t.previous.focus=="function"&&requestAnimationFrame(()=>t.previous.focus()),delete e.__odinModalFocus)}},nw={template:`
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
    </div>`,setup(){const e=m({}),t=m(!0),s=m(null),n=m([]),a=m(!1),i=m([]),l=m(!1),r=m([]),o=m(0),c=m(null),d=m({reload:!1,clearSessions:!1,stopLoops:!1});let u=0;const p=Y(()=>{const M=e.value.uptime_seconds||0,Z=Math.floor(M/86400),ne=Math.floor(M%86400/3600),U=Math.floor(M%3600/60),O=[];return Z>0&&O.push(`${Z}d`),ne>0&&O.push(`${ne}h`),(O.length===0||Z===0&&ne===0)&&O.push(`${U}m`),O.join(" ")}),h=Y(()=>{const M=e.value.uptime_seconds||0;return 125.66*(1-Math.min(M/86400,1))}),v=Y(()=>{const M=e.value;return[{label:"Guilds",value:M.guild_count??0,icon:"home",iconColor:"text-blue-400"},{label:"Sessions",value:M.session_count??0,icon:"message",iconColor:"text-yellow-400"},{label:"Tools",value:M.tool_count??0,icon:"wrench",iconColor:"text-purple-400",sub:`${M.skill_count??0} skills`,subColor:"text-gray-500"},{label:"Loops",value:M.loop_count??0,icon:"rotate",iconColor:"text-green-400",color:M.loop_count>0?"text-green-400":"",highlight:M.loop_count>0},{label:"Agents",value:M.agent_running??0,icon:"bot",iconColor:"text-cyan-400",sub:M.agent_count>0?`${M.agent_count} total`:"",subColor:"text-gray-500",highlight:(M.agent_running??0)>0},{label:"Processes",value:M.process_running??0,icon:"sliders",iconColor:"text-orange-400",sub:M.process_count>0?`${M.process_count} total`:"",subColor:"text-gray-500",highlight:(M.process_running??0)>0},{label:"Schedules",value:M.schedule_count??0,icon:"clock",iconColor:"text-amber-400",sub:(M.schedule_failing>0?`${M.schedule_failing} failing`:"")+(M.schedule_failing>0&&M.schedule_paused>0?", ":"")+(M.schedule_paused>0?`${M.schedule_paused} paused`:"")||void 0,subColor:M.schedule_failing>0?"text-red-400":"text-yellow-400",color:M.schedule_failing>0?"text-red-400":"",highlight:M.schedule_failing>0},{label:"Users",value:M.user_count??0,icon:"users",iconColor:"text-indigo-400"},...c.value!==null?[{label:"Knowledge",value:c.value,icon:"book",iconColor:"text-teal-400",sub:"chunks",subColor:"text-gray-500"}]:[]]}),y=Y(()=>{const M=e.value,Z=[];return Z.push({label:"Bot",status:M.status==="online"?"ok":"warn",detail:M.status==="online"?"Online":"Starting"}),(M.schedule_failing||0)>0?Z.push({label:"Schedules",status:"error",detail:`${M.schedule_failing} failing`}):(M.schedule_count||0)>0&&Z.push({label:"Schedules",status:"ok",detail:`${M.schedule_count} configured`}),(M.loop_count||0)>0&&Z.push({label:"Loops",status:"ok",detail:`${M.loop_count} active`}),(M.agent_running||0)>0&&Z.push({label:"Agents",status:"ok",detail:`${M.agent_running} running`}),(M.process_running||0)>0&&Z.push({label:"Processes",status:"ok",detail:`${M.process_running} running`}),Z});async function R(){try{e.value=await W.get("/api/status"),s.value=null}catch(M){s.value=M.message}finally{t.value=!1}}async function I(){a.value=!0;try{n.value=await W.get("/api/audit?limit=10"),o.value=0}catch{}a.value=!1}async function b(){l.value=!0;try{i.value=await W.get("/api/audit?error_only=1&limit=5")}catch{}l.value=!1}async function g(){try{const M=await W.get("/api/knowledge");c.value=(Array.isArray(M)?M:[]).reduce((Z,ne)=>Z+(ne.chunks||0),0)}catch{c.value=null}}async function x(){try{const M=await W.get("/api/agents");r.value=M.filter(Z=>Z.status==="running")}catch{}}async function E(){d.value={...d.value,reload:!0};try{await W.post("/api/reload"),Se.success("Config reloaded")}catch(M){Se.error(M.message)}d.value={...d.value,reload:!1}}async function T(){if(!await hs({title:"Clear all sessions",message:"Clear all conversation sessions? This cannot be undone.",confirmLabel:"Clear All",danger:!0}))return;d.value={...d.value,clearSessions:!0};const Z=e.value.session_count;e.value={...e.value,session_count:0};try{const ne=await W.post("/api/sessions/clear-all");Se.success(`Cleared ${ne.count} session${ne.count!==1?"s":""}`),await R()}catch(ne){e.value={...e.value,session_count:Z},Se.error(ne.message)}d.value={...d.value,clearSessions:!1}}async function S(){if(!await hs({title:"Stop all loops",message:"Stop all running loops?",confirmLabel:"Stop Loops",danger:!0}))return;d.value={...d.value,stopLoops:!0};const Z=e.value.loop_count;e.value={...e.value,loop_count:0};try{const ne=await W.post("/api/loops/stop-all");Se.success(ne.result),await R()}catch(ne){e.value={...e.value,loop_count:Z},Se.error(ne.message)}d.value={...d.value,stopLoops:!1}}function w(){t.value=!0,s.value=null,R(),I(),b(),x()}let A=null,L=null,B=null;function F(M){if(M.payload&&M.payload.tool_name){const Z={...M.payload,_isNew:!0,_key:++u};n.value.unshift(Z),n.value.length>10&&n.value.pop(),o.value++,Z.error&&(i.value.unshift(Z),i.value.length>5&&i.value.pop()),setTimeout(()=>{Z._isNew=!1},1500),clearTimeout(B),B=setTimeout(()=>{o.value=0},1e4)}}return Ke(async()=>{await Promise.all([R(),I(),b(),x(),g()]),A=setInterval(R,15e3),L=setInterval(x,1e4),ze.subscribe("events",F)}),bt(()=>{A&&clearInterval(A),L&&clearInterval(L),clearTimeout(B),ze.unsubscribe("events",F)}),{status:e,loading:t,error:s,uptime:p,uptimeRingOffset:h,stats:v,healthIndicators:y,activity:n,activityLoading:a,newEventCount:o,errors:i,errorsLoading:l,agents:r,actionLoading:d,fetchActivity:I,fetchStatus:R,formatTime:Kc,formatDuration:Wa,retry:w,reloadConfig:E,clearSessions:T,stopAllLoops:S}}};/*! @license DOMPurify 3.4.9 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.9/LICENSE */function Uu(e,t){(t==null||t>e.length)&&(t=e.length);for(var s=0,n=Array(t);s<t;s++)n[s]=e[s];return n}function aw(e){if(Array.isArray(e))return e}function iw(e,t){var s=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(s!=null){var n,a,i,l,r=[],o=!0,c=!1;try{if(i=(s=s.call(e)).next,t!==0)for(;!(o=(n=i.call(s)).done)&&(r.push(n.value),r.length!==t);o=!0);}catch(d){c=!0,a=d}finally{try{if(!o&&s.return!=null&&(l=s.return(),Object(l)!==l))return}finally{if(c)throw a}}return r}}function lw(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function rw(e,t){return aw(e)||iw(e,t)||ow(e,t)||lw()}function ow(e,t){if(e){if(typeof e=="string")return Uu(e,t);var s={}.toString.call(e).slice(8,-1);return s==="Object"&&e.constructor&&(s=e.constructor.name),s==="Map"||s==="Set"?Array.from(e):s==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(s)?Uu(e,t):void 0}}const Tm=Object.entries,Bu=Object.setPrototypeOf,cw=Object.isFrozen,dw=Object.getPrototypeOf,uw=Object.getOwnPropertyDescriptor;let Xt=Object.freeze,Cs=Object.seal,Sa=Object.create,Cm=typeof Reflect<"u"&&Reflect,jo=Cm.apply,zo=Cm.construct;Xt||(Xt=function(t){return t});Cs||(Cs=function(t){return t});jo||(jo=function(t,s){for(var n=arguments.length,a=new Array(n>2?n-2:0),i=2;i<n;i++)a[i-2]=arguments[i];return t.apply(s,a)});zo||(zo=function(t){for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return new t(...n)});const Xs=wt(Array.prototype.forEach),fw=wt(Array.prototype.lastIndexOf),Hu=wt(Array.prototype.pop),ya=wt(Array.prototype.push),pw=wt(Array.prototype.splice),Kt=Array.isArray,hi=wt(String.prototype.toLowerCase),lo=wt(String.prototype.toString),Vu=wt(String.prototype.match),xa=wt(String.prototype.replace),ju=wt(String.prototype.indexOf),hw=wt(String.prototype.trim),mw=wt(Number.prototype.toString),gw=wt(Boolean.prototype.toString),zu=typeof BigInt>"u"?null:wt(BigInt.prototype.toString),qu=typeof Symbol>"u"?null:wt(Symbol.prototype.toString),pt=wt(Object.prototype.hasOwnProperty),ri=wt(Object.prototype.toString),Nt=wt(RegExp.prototype.test),qn=vw(TypeError);function wt(e){return function(t){t instanceof RegExp&&(t.lastIndex=0);for(var s=arguments.length,n=new Array(s>1?s-1:0),a=1;a<s;a++)n[a-1]=arguments[a];return jo(e,t,n)}}function vw(e){return function(){for(var t=arguments.length,s=new Array(t),n=0;n<t;n++)s[n]=arguments[n];return zo(e,s)}}function Fe(e,t){let s=arguments.length>2&&arguments[2]!==void 0?arguments[2]:hi;if(Bu&&Bu(e,null),!Kt(t))return e;let n=t.length;for(;n--;){let a=t[n];if(typeof a=="string"){const i=s(a);i!==a&&(cw(t)||(t[n]=i),a=i)}e[a]=!0}return e}function bw(e){for(let t=0;t<e.length;t++)pt(e,t)||(e[t]=null);return e}function Bt(e){const t=Sa(null);for(const n of Tm(e)){var s=rw(n,2);const a=s[0],i=s[1];pt(e,a)&&(Kt(i)?t[a]=bw(i):i&&typeof i=="object"&&i.constructor===Object?t[a]=Bt(i):t[a]=i)}return t}function yw(e){switch(typeof e){case"string":return e;case"number":return mw(e);case"boolean":return gw(e);case"bigint":return zu?zu(e):"0";case"symbol":return qu?qu(e):"Symbol()";case"undefined":return ri(e);case"function":case"object":{if(e===null)return ri(e);const t=e,s=Hs(t,"toString");if(typeof s=="function"){const n=s(t);return typeof n=="string"?n:ri(n)}return ri(e)}default:return ri(e)}}function Hs(e,t){for(;e!==null;){const n=uw(e,t);if(n){if(n.get)return wt(n.get);if(typeof n.value=="function")return wt(n.value)}e=dw(e)}function s(){return null}return s}function xw(e){try{return Nt(e,""),!0}catch{return!1}}const Gu=Xt(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","search","section","select","shadow","slot","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),ro=Xt(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","enterkeyhint","exportparts","filter","font","g","glyph","glyphref","hkern","image","inputmode","line","lineargradient","marker","mask","metadata","mpath","part","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),oo=Xt(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feDropShadow","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feImage","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),_w=Xt(["animate","color-profile","cursor","discard","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),co=Xt(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover","mprescripts"]),kw=Xt(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),Ku=Xt(["#text"]),Wu=Xt(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","command","commandfor","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","exportparts","face","for","headers","height","hidden","high","href","hreflang","id","inert","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","nonce","noshade","novalidate","nowrap","open","optimum","part","pattern","placeholder","playsinline","popover","popovertarget","popovertargetaction","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","slot","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","wrap","xmlns"]),uo=Xt(["accent-height","accumulate","additive","alignment-baseline","amplitude","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","exponent","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","intercept","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","mask-type","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","slope","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","tablevalues","targetx","targety","transform","transform-origin","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),Zu=Xt(["accent","accentunder","align","bevelled","close","columnalign","columnlines","columnspacing","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lquote","lspace","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),_l=Xt(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),ww=Cs(/{{[\w\W]*|^[\w\W]*}}/g),Sw=Cs(/<%[\w\W]*|^[\w\W]*%>/g),Tw=Cs(/\${[\w\W]*/g),Cw=Cs(/^data-[\-\w.\u00B7-\uFFFF]+$/),Ew=Cs(/^aria-[\-\w]+$/),Ju=Cs(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),Aw=Cs(/^(?:\w+script|data):/i),Rw=Cs(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),Iw=Cs(/^html$/i),Ow=Cs(/^[a-z][.\w]*(-[.\w]+)+$/i),Us={element:1,attribute:2,text:3,cdataSection:4,entityReference:5,entityNode:6,progressingInstruction:7,comment:8,document:9,documentType:10,documentFragment:11,notation:12},Nw=function(){return typeof window>"u"?null:window},Lw=function(t,s){if(typeof t!="object"||typeof t.createPolicy!="function")return null;let n=null;const a="data-tt-policy-suffix";s&&s.hasAttribute(a)&&(n=s.getAttribute(a));const i="dompurify"+(n?"#"+n:"");try{return t.createPolicy(i,{createHTML(l){return l},createScriptURL(l){return l}})}catch{return console.warn("TrustedTypes policy "+i+" could not be created."),null}},Yu=function(){return{afterSanitizeAttributes:[],afterSanitizeElements:[],afterSanitizeShadowDOM:[],beforeSanitizeAttributes:[],beforeSanitizeElements:[],beforeSanitizeShadowDOM:[],uponSanitizeAttribute:[],uponSanitizeElement:[],uponSanitizeShadowNode:[]}};function Em(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Nw();const t=me=>Em(me);if(t.version="3.4.9",t.removed=[],!e||!e.document||e.document.nodeType!==Us.document||!e.Element)return t.isSupported=!1,t;let s=e.document;const n=s,a=n.currentScript;e.DocumentFragment;const i=e.HTMLTemplateElement,l=e.Node,r=e.Element,o=e.NodeFilter,c=e.NamedNodeMap;c===void 0&&(e.NamedNodeMap||e.MozNamedAttrMap),e.HTMLFormElement;const d=e.DOMParser,u=e.trustedTypes,p=r.prototype,h=Hs(p,"cloneNode"),v=Hs(p,"remove"),y=Hs(p,"nextSibling"),R=Hs(p,"childNodes"),I=Hs(p,"parentNode"),b=Hs(p,"shadowRoot"),g=Hs(p,"attributes"),x=l&&l.prototype?Hs(l.prototype,"nodeType"):null,E=l&&l.prototype?Hs(l.prototype,"nodeName"):null;if(typeof i=="function"){const me=s.createElement("template");me.content&&me.content.ownerDocument&&(s=me.content.ownerDocument)}let T,S="",w,A=!1,L=0;const B=function(){if(L>0)throw qn('A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.')},F=function(f){B(),L++;try{return T.createHTML(f)}finally{L--}},M=function(f){B(),L++;try{return T.createScriptURL(f)}finally{L--}},Z=function(){return A||(w=Lw(u,a),A=!0),w},ne=s,U=ne.implementation,O=ne.createNodeIterator,N=ne.createDocumentFragment,j=ne.getElementsByTagName,G=n.importNode;let J=Yu();t.isSupported=typeof Tm=="function"&&typeof I=="function"&&U&&U.createHTMLDocument!==void 0;const ae=ww,ce=Sw,P=Tw,te=Cw,_e=Ew,H=Aw,ue=Rw,de=Ow;let be=Ju,ge=null;const De=Fe({},[...Gu,...ro,...oo,...co,...Ku]);let _=null;const C=Fe({},[...Wu,...uo,...Zu,..._l]);let $=Object.seal(Sa(null,{tagNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeNameCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},allowCustomizedBuiltInElements:{writable:!0,configurable:!1,enumerable:!0,value:!1}})),X=null,K=null;const Q=Object.seal(Sa(null,{tagCheck:{writable:!0,configurable:!1,enumerable:!0,value:null},attributeCheck:{writable:!0,configurable:!1,enumerable:!0,value:null}}));let oe=!0,le=!0,ie=!1,se=!0,ye=!1,fe=!0,he=!1,ke=!1,Te=!1,Ce=!1,Ie=!1,Pe=!1,$e=!0,Xe=!1;const z="user-content-";let xe=!0,Re=!1,Ne={},He=null;const Ve=Fe({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","selectedcontent","style","svg","template","thead","title","video","xmp"]);let ft=null;const es=Fe({},["audio","video","img","source","image","track"]);let vs=null;const xn=Fe({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Rs="http://www.w3.org/1998/Math/MathML",$s="http://www.w3.org/2000/svg",At="http://www.w3.org/1999/xhtml";let q=At,Oe=!1,bs=null;const Bn=Fe({},[Rs,$s,At],lo);let os=Fe({},["mi","mo","mn","ms","mtext"]),Hn=Fe({},["annotation-xml"]);const Qa=Fe({},["title","style","font","a","script"]);let cs=null;const _n=["application/xhtml+xml","text/html"],kn="text/html";let it=null,Is=null;const V=s.createElement("form"),re=function(f){return f instanceof RegExp||f instanceof Function},Ee=function(){let f=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};if(Is&&Is===f)return;(!f||typeof f!="object")&&(f={}),f=Bt(f),cs=_n.indexOf(f.PARSER_MEDIA_TYPE)===-1?kn:f.PARSER_MEDIA_TYPE,it=cs==="application/xhtml+xml"?lo:hi,ge=pt(f,"ALLOWED_TAGS")&&Kt(f.ALLOWED_TAGS)?Fe({},f.ALLOWED_TAGS,it):De,_=pt(f,"ALLOWED_ATTR")&&Kt(f.ALLOWED_ATTR)?Fe({},f.ALLOWED_ATTR,it):C,bs=pt(f,"ALLOWED_NAMESPACES")&&Kt(f.ALLOWED_NAMESPACES)?Fe({},f.ALLOWED_NAMESPACES,lo):Bn,vs=pt(f,"ADD_URI_SAFE_ATTR")&&Kt(f.ADD_URI_SAFE_ATTR)?Fe(Bt(xn),f.ADD_URI_SAFE_ATTR,it):xn,ft=pt(f,"ADD_DATA_URI_TAGS")&&Kt(f.ADD_DATA_URI_TAGS)?Fe(Bt(es),f.ADD_DATA_URI_TAGS,it):es,He=pt(f,"FORBID_CONTENTS")&&Kt(f.FORBID_CONTENTS)?Fe({},f.FORBID_CONTENTS,it):Ve,X=pt(f,"FORBID_TAGS")&&Kt(f.FORBID_TAGS)?Fe({},f.FORBID_TAGS,it):Bt({}),K=pt(f,"FORBID_ATTR")&&Kt(f.FORBID_ATTR)?Fe({},f.FORBID_ATTR,it):Bt({}),Ne=pt(f,"USE_PROFILES")?f.USE_PROFILES&&typeof f.USE_PROFILES=="object"?Bt(f.USE_PROFILES):f.USE_PROFILES:!1,oe=f.ALLOW_ARIA_ATTR!==!1,le=f.ALLOW_DATA_ATTR!==!1,ie=f.ALLOW_UNKNOWN_PROTOCOLS||!1,se=f.ALLOW_SELF_CLOSE_IN_ATTR!==!1,ye=f.SAFE_FOR_TEMPLATES||!1,fe=f.SAFE_FOR_XML!==!1,he=f.WHOLE_DOCUMENT||!1,Ce=f.RETURN_DOM||!1,Ie=f.RETURN_DOM_FRAGMENT||!1,Pe=f.RETURN_TRUSTED_TYPE||!1,Te=f.FORCE_BODY||!1,$e=f.SANITIZE_DOM!==!1,Xe=f.SANITIZE_NAMED_PROPS||!1,xe=f.KEEP_CONTENT!==!1,Re=f.IN_PLACE||!1,be=xw(f.ALLOWED_URI_REGEXP)?f.ALLOWED_URI_REGEXP:Ju,q=typeof f.NAMESPACE=="string"?f.NAMESPACE:At,os=pt(f,"MATHML_TEXT_INTEGRATION_POINTS")&&f.MATHML_TEXT_INTEGRATION_POINTS&&typeof f.MATHML_TEXT_INTEGRATION_POINTS=="object"?Bt(f.MATHML_TEXT_INTEGRATION_POINTS):Fe({},["mi","mo","mn","ms","mtext"]),Hn=pt(f,"HTML_INTEGRATION_POINTS")&&f.HTML_INTEGRATION_POINTS&&typeof f.HTML_INTEGRATION_POINTS=="object"?Bt(f.HTML_INTEGRATION_POINTS):Fe({},["annotation-xml"]);const k=pt(f,"CUSTOM_ELEMENT_HANDLING")&&f.CUSTOM_ELEMENT_HANDLING&&typeof f.CUSTOM_ELEMENT_HANDLING=="object"?Bt(f.CUSTOM_ELEMENT_HANDLING):Sa(null);if($=Sa(null),pt(k,"tagNameCheck")&&re(k.tagNameCheck)&&($.tagNameCheck=k.tagNameCheck),pt(k,"attributeNameCheck")&&re(k.attributeNameCheck)&&($.attributeNameCheck=k.attributeNameCheck),pt(k,"allowCustomizedBuiltInElements")&&typeof k.allowCustomizedBuiltInElements=="boolean"&&($.allowCustomizedBuiltInElements=k.allowCustomizedBuiltInElements),ye&&(le=!1),Ie&&(Ce=!0),Ne&&(ge=Fe({},Ku),_=Sa(null),Ne.html===!0&&(Fe(ge,Gu),Fe(_,Wu)),Ne.svg===!0&&(Fe(ge,ro),Fe(_,uo),Fe(_,_l)),Ne.svgFilters===!0&&(Fe(ge,oo),Fe(_,uo),Fe(_,_l)),Ne.mathMl===!0&&(Fe(ge,co),Fe(_,Zu),Fe(_,_l))),Q.tagCheck=null,Q.attributeCheck=null,pt(f,"ADD_TAGS")&&(typeof f.ADD_TAGS=="function"?Q.tagCheck=f.ADD_TAGS:Kt(f.ADD_TAGS)&&(ge===De&&(ge=Bt(ge)),Fe(ge,f.ADD_TAGS,it))),pt(f,"ADD_ATTR")&&(typeof f.ADD_ATTR=="function"?Q.attributeCheck=f.ADD_ATTR:Kt(f.ADD_ATTR)&&(_===C&&(_=Bt(_)),Fe(_,f.ADD_ATTR,it))),pt(f,"ADD_URI_SAFE_ATTR")&&Kt(f.ADD_URI_SAFE_ATTR)&&Fe(vs,f.ADD_URI_SAFE_ATTR,it),pt(f,"FORBID_CONTENTS")&&Kt(f.FORBID_CONTENTS)&&(He===Ve&&(He=Bt(He)),Fe(He,f.FORBID_CONTENTS,it)),pt(f,"ADD_FORBID_CONTENTS")&&Kt(f.ADD_FORBID_CONTENTS)&&(He===Ve&&(He=Bt(He)),Fe(He,f.ADD_FORBID_CONTENTS,it)),xe&&(ge["#text"]=!0),he&&Fe(ge,["html","head","body"]),ge.table&&(Fe(ge,["tbody"]),delete X.tbody),f.TRUSTED_TYPES_POLICY){if(typeof f.TRUSTED_TYPES_POLICY.createHTML!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');if(typeof f.TRUSTED_TYPES_POLICY.createScriptURL!="function")throw qn('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');const D=T;T=f.TRUSTED_TYPES_POLICY;try{S=F("")}catch(ee){throw T=D,ee}}else f.TRUSTED_TYPES_POLICY===null?(T=void 0,S=""):(T===void 0&&(T=Z()),T&&typeof S=="string"&&(S=F("")));(J.uponSanitizeElement.length>0||J.uponSanitizeAttribute.length>0)&&ge===De&&(ge=Bt(ge)),J.uponSanitizeAttribute.length>0&&_===C&&(_=Bt(_)),Xt&&Xt(f),Is=f},We=Fe({},[...ro,...oo,..._w]),rt=Fe({},[...co,...kw]),Ft=function(f){let k=I(f);(!k||!k.tagName)&&(k={namespaceURI:q,tagName:"template"});const D=hi(f.tagName),ee=hi(k.tagName);return bs[f.namespaceURI]?f.namespaceURI===$s?k.namespaceURI===At?D==="svg":k.namespaceURI===Rs?D==="svg"&&(ee==="annotation-xml"||os[ee]):!!We[D]:f.namespaceURI===Rs?k.namespaceURI===At?D==="math":k.namespaceURI===$s?D==="math"&&Hn[ee]:!!rt[D]:f.namespaceURI===At?k.namespaceURI===$s&&!Hn[ee]||k.namespaceURI===Rs&&!os[ee]?!1:!rt[D]&&(Qa[D]||!We[D]):!!(cs==="application/xhtml+xml"&&bs[f.namespaceURI]):!1},$t=function(f){ya(t.removed,{element:f});try{I(f).removeChild(f)}catch{if(v(f),!I(f))throw qn("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place")}},Xa=function(f){const k=R?R(f):f.childNodes;if(k){const ee=[];Xs(k,pe=>{ya(ee,pe)}),Xs(ee,pe=>{try{v(pe)}catch{}})}const D=g?g(f):null;if(D)for(let ee=D.length-1;ee>=0;--ee){const pe=D[ee],we=pe&&pe.name;if(typeof we=="string")try{f.removeAttribute(we)}catch{}}},Zs=function(f,k){try{ya(t.removed,{attribute:k.getAttributeNode(f),from:k})}catch{ya(t.removed,{attribute:null,from:k})}if(k.removeAttribute(f),f==="is")if(Ce||Ie)try{$t(k)}catch{}else try{k.setAttribute(f,"")}catch{}},Mr=function(f){const k=g?g(f):f.attributes;if(k)for(let D=k.length-1;D>=0;--D){const ee=k[D],pe=ee&&ee.name;if(!(typeof pe!="string"||_[it(pe)]))try{f.removeAttribute(pe)}catch{}}},Pr=function(f){const k=[f];for(;k.length>0;){const D=k.pop();(x?x(D):D.nodeType)===Us.element&&Mr(D);const pe=R?R(D):D.childNodes;if(pe)for(let we=pe.length-1;we>=0;--we)k.push(pe[we])}},Vn=function(f){let k=null,D=null;if(Te)f="<remove></remove>"+f;else{const we=Vu(f,/^[\r\n\t ]+/);D=we&&we[0]}cs==="application/xhtml+xml"&&q===At&&(f='<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>'+f+"</body></html>");const ee=T?F(f):f;if(q===At)try{k=new d().parseFromString(ee,cs)}catch{}if(!k||!k.documentElement){k=U.createDocument(q,"template",null);try{k.documentElement.innerHTML=Oe?S:ee}catch{}}const pe=k.body||k.documentElement;return f&&D&&pe.insertBefore(s.createTextNode(D),pe.childNodes[0]||null),q===At?j.call(k,he?"html":"body")[0]:he?k.documentElement:pe},tl=function(f){return O.call(f.ownerDocument||f,f,o.SHOW_ELEMENT|o.SHOW_COMMENT|o.SHOW_TEXT|o.SHOW_PROCESSING_INSTRUCTION|o.SHOW_CDATA_SECTION,null)},wn=function(f){var k,D;f.normalize();const ee=O.call(f.ownerDocument||f,f,o.SHOW_TEXT|o.SHOW_COMMENT|o.SHOW_CDATA_SECTION|o.SHOW_PROCESSING_INSTRUCTION,null);let pe=ee.nextNode();for(;pe;){let st=pe.data;Xs([ae,ce,P],qe=>{st=xa(st,qe," ")}),pe.data=st,pe=ee.nextNode()}const we=(k=(D=f.querySelectorAll)===null||D===void 0?void 0:D.call(f,"template"))!==null&&k!==void 0?k:[];Xs(Array.from(we),st=>{Sn(st.content)&&wn(st.content)})},pa=function(f){const k=E?E(f):null;return typeof k!="string"||it(k)!=="form"?!1:typeof f.nodeName!="string"||typeof f.textContent!="string"||typeof f.removeChild!="function"||f.attributes!==g(f)||typeof f.removeAttribute!="function"||typeof f.setAttribute!="function"||typeof f.namespaceURI!="string"||typeof f.insertBefore!="function"||typeof f.hasChildNodes!="function"||f.nodeType!==x(f)||f.childNodes!==R(f)},Sn=function(f){if(!x||typeof f!="object"||f===null)return!1;try{return x(f)===Us.documentFragment}catch{return!1}},ys=function(f){if(!x||typeof f!="object"||f===null)return!1;try{return typeof x(f)=="number"}catch{return!1}};function Os(me,f,k){Xs(me,D=>{D.call(t,f,k,Is)})}const sl=function(f){let k=null;if(Os(J.beforeSanitizeElements,f,null),pa(f))return $t(f),!0;const D=it(E?E(f):f.nodeName);if(Os(J.uponSanitizeElement,f,{tagName:D,allowedTags:ge}),fe&&f.hasChildNodes()&&!ys(f.firstElementChild)&&Nt(/<[/\w!]/g,f.innerHTML)&&Nt(/<[/\w!]/g,f.textContent)||fe&&f.namespaceURI===At&&D==="style"&&ys(f.firstElementChild)||f.nodeType===Us.progressingInstruction||fe&&f.nodeType===Us.comment&&Nt(/<[/\w]/g,f.data))return $t(f),!0;if(X[D]||!(Q.tagCheck instanceof Function&&Q.tagCheck(D))&&!ge[D]){if(!X[D]&&nl(D)&&($.tagNameCheck instanceof RegExp&&Nt($.tagNameCheck,D)||$.tagNameCheck instanceof Function&&$.tagNameCheck(D)))return!1;if(xe&&!He[D]){const pe=I(f),we=R(f);if(we&&pe){const st=we.length;for(let qe=st-1;qe>=0;--qe){const dt=Re?we[qe]:h(we[qe],!0);pe.insertBefore(dt,y(f))}}}return $t(f),!0}return(x?x(f):f.nodeType)===Us.element&&!Ft(f)||(D==="noscript"||D==="noembed"||D==="noframes")&&Nt(/<\/no(script|embed|frames)/i,f.innerHTML)?($t(f),!0):(ye&&f.nodeType===Us.text&&(k=f.textContent,Xs([ae,ce,P],pe=>{k=xa(k,pe," ")}),f.textContent!==k&&(ya(t.removed,{element:f.cloneNode()}),f.textContent=k)),Os(J.afterSanitizeElements,f,null),!1)},ei=function(f,k,D){if(K[k]||$e&&(k==="id"||k==="name")&&(D in s||D in V))return!1;const ee=_[k]||Q.attributeCheck instanceof Function&&Q.attributeCheck(k,f);if(!(le&&!K[k]&&Nt(te,k))){if(!(oe&&Nt(_e,k))){if(!ee||K[k]){if(!(nl(f)&&($.tagNameCheck instanceof RegExp&&Nt($.tagNameCheck,f)||$.tagNameCheck instanceof Function&&$.tagNameCheck(f))&&($.attributeNameCheck instanceof RegExp&&Nt($.attributeNameCheck,k)||$.attributeNameCheck instanceof Function&&$.attributeNameCheck(k,f))||k==="is"&&$.allowCustomizedBuiltInElements&&($.tagNameCheck instanceof RegExp&&Nt($.tagNameCheck,D)||$.tagNameCheck instanceof Function&&$.tagNameCheck(D))))return!1}else if(!vs[k]){if(!Nt(be,xa(D,ue,""))){if(!((k==="src"||k==="xlink:href"||k==="href")&&f!=="script"&&ju(D,"data:")===0&&ft[f])){if(!(ie&&!Nt(H,xa(D,ue,"")))){if(D)return!1}}}}}}return!0},Fr=Fe({},["annotation-xml","color-profile","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","missing-glyph"]),nl=function(f){return!Fr[hi(f)]&&Nt(de,f)},al=function(f){Os(J.beforeSanitizeAttributes,f,null);const k=f.attributes;if(!k||pa(f))return;const D={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:_,forceKeepAttr:void 0};let ee=k.length;for(;ee--;){const pe=k[ee],we=pe.name,st=pe.namespaceURI,qe=pe.value,dt=it(we),Ns=qe;let Rt=we==="value"?Ns:hw(Ns);if(D.attrName=dt,D.attrValue=Rt,D.keepAttr=!0,D.forceKeepAttr=void 0,Os(J.uponSanitizeAttribute,f,D),Rt=D.attrValue,Xe&&(dt==="id"||dt==="name")&&ju(Rt,z)!==0&&(Zs(we,f),Rt=z+Rt),fe&&Nt(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i,Rt)){Zs(we,f);continue}if(dt==="attributename"&&Vu(Rt,"href")){Zs(we,f);continue}if(D.forceKeepAttr)continue;if(!D.keepAttr){Zs(we,f);continue}if(!se&&Nt(/\/>/i,Rt)){Zs(we,f);continue}ye&&Xs([ae,ce,P],id=>{Rt=xa(Rt,id," ")});const ad=it(f.nodeName);if(!ei(ad,dt,Rt)){Zs(we,f);continue}if(T&&typeof u=="object"&&typeof u.getAttributeType=="function"&&!st)switch(u.getAttributeType(ad,dt)){case"TrustedHTML":{Rt=F(Rt);break}case"TrustedScriptURL":{Rt=M(Rt);break}}if(Rt!==Ns)try{st?f.setAttributeNS(st,we,Rt):f.setAttribute(we,Rt),pa(f)?$t(f):Hu(t.removed)}catch{Zs(we,f)}}Os(J.afterSanitizeAttributes,f,null)},Tn=function(f){let k=null;const D=tl(f);for(Os(J.beforeSanitizeShadowDOM,f,null);k=D.nextNode();)if(Os(J.uponSanitizeShadowNode,k,null),sl(k),al(k),Sn(k.content)&&Tn(k.content),(x?x(k):k.nodeType)===Us.element){const pe=b?b(k):k.shadowRoot;Sn(pe)&&(ha(pe),Tn(pe))}Os(J.afterSanitizeShadowDOM,f,null)},ha=function(f){const k=[{node:f,shadow:null}];for(;k.length>0;){const D=k.pop();if(D.shadow){Tn(D.shadow);continue}const ee=D.node,we=(x?x(ee):ee.nodeType)===Us.element,st=R?R(ee):ee.childNodes;if(st)for(let qe=st.length-1;qe>=0;--qe)k.push({node:st[qe],shadow:null});if(we){const qe=E?E(ee):null;if(typeof qe=="string"&&it(qe)==="template"){const dt=ee.content;Sn(dt)&&k.push({node:dt,shadow:null})}}if(we){const qe=b?b(ee):ee.shadowRoot;Sn(qe)&&k.push({node:null,shadow:qe},{node:qe,shadow:null})}}};return t.sanitize=function(me){let f=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},k=null,D=null,ee=null,pe=null;if(Oe=!me,Oe&&(me="<!-->"),typeof me!="string"&&!ys(me)&&(me=yw(me),typeof me!="string"))throw qn("dirty is not a string, aborting");if(!t.isSupported)return me;ke||Ee(f),t.removed=[];const we=Re&&typeof me!="string"&&ys(me);if(we){const dt=E?E(me):me.nodeName;if(typeof dt=="string"){const Ns=it(dt);if(!ge[Ns]||X[Ns])throw qn("root node is forbidden and cannot be sanitized in-place")}if(pa(me))throw qn("root node is clobbered and cannot be sanitized in-place");try{ha(me)}catch(Ns){throw Xa(me),Ns}}else if(ys(me))k=Vn("<!---->"),D=k.ownerDocument.importNode(me,!0),D.nodeType===Us.element&&D.nodeName==="BODY"||D.nodeName==="HTML"?k=D:k.appendChild(D),ha(D);else{if(!Ce&&!ye&&!he&&me.indexOf("<")===-1)return T&&Pe?F(me):me;if(k=Vn(me),!k)return Ce?null:Pe?S:""}k&&Te&&$t(k.firstChild);const st=tl(we?me:k);try{for(;ee=st.nextNode();)sl(ee),al(ee),Sn(ee.content)&&Tn(ee.content)}catch(dt){throw we&&Xa(me),dt}if(we)return Xs(t.removed,dt=>{dt.element&&Pr(dt.element)}),ye&&wn(me),me;if(Ce){if(ye&&wn(k),Ie)for(pe=N.call(k.ownerDocument);k.firstChild;)pe.appendChild(k.firstChild);else pe=k;return(_.shadowroot||_.shadowrootmode)&&(pe=G.call(n,pe,!0)),pe}let qe=he?k.outerHTML:k.innerHTML;return he&&ge["!doctype"]&&k.ownerDocument&&k.ownerDocument.doctype&&k.ownerDocument.doctype.name&&Nt(Iw,k.ownerDocument.doctype.name)&&(qe="<!DOCTYPE "+k.ownerDocument.doctype.name+`>
`+qe),ye&&Xs([ae,ce,P],dt=>{qe=xa(qe,dt," ")}),T&&Pe?F(qe):qe},t.setConfig=function(){let me=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};Ee(me),ke=!0},t.clearConfig=function(){Is=null,ke=!1,T=w,S=""},t.isValidAttribute=function(me,f,k){Is||Ee({});const D=it(me),ee=it(f);return ei(D,ee,k)},t.addHook=function(me,f){typeof f=="function"&&ya(J[me],f)},t.removeHook=function(me,f){if(f!==void 0){const k=fw(J[me],f);return k===-1?void 0:pw(J[me],k,1)[0]}return Hu(J[me])},t.removeHooks=function(me){J[me]=[]},t.removeAllHooks=function(){J=Yu()},t}var Qu=Em();function Zc(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var fa=Zc();function Am(e){fa=e}var Si={exec:()=>null};function tt(e,t=""){let s=typeof e=="string"?e:e.source;const n={replace:(a,i)=>{let l=typeof i=="string"?i:i.source;return l=l.replace(Jt.caret,"$1"),s=s.replace(a,l),n},getRegex:()=>new RegExp(s,t)};return n}var Jt={codeRemoveIndent:/^(?: {1,4}| {0,3}\t)/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceTabs:/^\t+/,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] /,listReplaceTask:/^\[[ xX]\] +/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,unescapeTest:/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:e=>new RegExp(`^( {0,3}${e})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),hrRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),fencesBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}(?:\`\`\`|~~~)`),headingBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}#`),htmlBeginRegex:e=>new RegExp(`^ {0,${Math.min(3,e-1)}}<(?:[a-z].*>|!--)`,"i")},Dw=/^(?:[ \t]*(?:\n|$))+/,Mw=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,Pw=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,el=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,Fw=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Jc=/(?:[*+-]|\d{1,9}[.)])/,Rm=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,Im=tt(Rm).replace(/bull/g,Jc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),$w=tt(Rm).replace(/bull/g,Jc).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Yc=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Uw=/^[^\n]+/,Qc=/(?!\s*\])(?:\\.|[^\[\]\\])+/,Bw=tt(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Qc).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),Hw=tt(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,Jc).getRegex(),Lr="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Xc=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Vw=tt("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Xc).replace("tag",Lr).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Om=tt(Yc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Lr).getRegex(),jw=tt(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Om).getRegex(),ed={blockquote:jw,code:Mw,def:Bw,fences:Pw,heading:Fw,hr:el,html:Vw,lheading:Im,list:Hw,newline:Dw,paragraph:Om,table:Si,text:Uw},Xu=tt("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Lr).getRegex(),zw={...ed,lheading:$w,table:Xu,paragraph:tt(Yc).replace("hr",el).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Xu).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",Lr).getRegex()},qw={...ed,html:tt(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Xc).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:Si,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:tt(Yc).replace("hr",el).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Im).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Gw=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,Kw=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,Nm=/^( {2,}|\\)\n(?!\s*$)/,Ww=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,Dr=/[\p{P}\p{S}]/u,td=/[\s\p{P}\p{S}]/u,Lm=/[^\s\p{P}\p{S}]/u,Zw=tt(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,td).getRegex(),Dm=/(?!~)[\p{P}\p{S}]/u,Jw=/(?!~)[\s\p{P}\p{S}]/u,Yw=/(?:[^\s\p{P}\p{S}]|~)/u,Qw=/\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g,Mm=/^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/,Xw=tt(Mm,"u").replace(/punct/g,Dr).getRegex(),eS=tt(Mm,"u").replace(/punct/g,Dm).getRegex(),Pm="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",tS=tt(Pm,"gu").replace(/notPunctSpace/g,Lm).replace(/punctSpace/g,td).replace(/punct/g,Dr).getRegex(),sS=tt(Pm,"gu").replace(/notPunctSpace/g,Yw).replace(/punctSpace/g,Jw).replace(/punct/g,Dm).getRegex(),nS=tt("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,Lm).replace(/punctSpace/g,td).replace(/punct/g,Dr).getRegex(),aS=tt(/\\(punct)/,"gu").replace(/punct/g,Dr).getRegex(),iS=tt(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),lS=tt(Xc).replace("(?:-->|$)","-->").getRegex(),rS=tt("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",lS).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),nr=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,oS=tt(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label",nr).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Fm=tt(/^!?\[(label)\]\[(ref)\]/).replace("label",nr).replace("ref",Qc).getRegex(),$m=tt(/^!?\[(ref)\](?:\[\])?/).replace("ref",Qc).getRegex(),cS=tt("reflink|nolink(?!\\()","g").replace("reflink",Fm).replace("nolink",$m).getRegex(),sd={_backpedal:Si,anyPunctuation:aS,autolink:iS,blockSkip:Qw,br:Nm,code:Kw,del:Si,emStrongLDelim:Xw,emStrongRDelimAst:tS,emStrongRDelimUnd:nS,escape:Gw,link:oS,nolink:$m,punctuation:Zw,reflink:Fm,reflinkSearch:cS,tag:rS,text:Ww,url:Si},dS={...sd,link:tt(/^!?\[(label)\]\((.*?)\)/).replace("label",nr).getRegex(),reflink:tt(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",nr).getRegex()},qo={...sd,emStrongRDelimAst:sS,emStrongLDelim:eS,url:tt(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},uS={...qo,br:tt(Nm).replace("{2,}","*").getRegex(),text:tt(qo.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},kl={normal:ed,gfm:zw,pedantic:qw},oi={normal:sd,gfm:qo,breaks:uS,pedantic:dS},fS={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},ef=e=>fS[e];function Vs(e,t){if(t){if(Jt.escapeTest.test(e))return e.replace(Jt.escapeReplace,ef)}else if(Jt.escapeTestNoEncode.test(e))return e.replace(Jt.escapeReplaceNoEncode,ef);return e}function tf(e){try{e=encodeURI(e).replace(Jt.percentDecode,"%")}catch{return null}return e}function sf(e,t){var i;const s=e.replace(Jt.findPipe,(l,r,o)=>{let c=!1,d=r;for(;--d>=0&&o[d]==="\\";)c=!c;return c?"|":" |"}),n=s.split(Jt.splitPipe);let a=0;if(n[0].trim()||n.shift(),n.length>0&&!((i=n.at(-1))!=null&&i.trim())&&n.pop(),t)if(n.length>t)n.splice(t);else for(;n.length<t;)n.push("");for(;a<n.length;a++)n[a]=n[a].trim().replace(Jt.slashPipe,"|");return n}function ci(e,t,s){const n=e.length;if(n===0)return"";let a=0;for(;a<n&&e.charAt(n-a-1)===t;)a++;return e.slice(0,n-a)}function pS(e,t){if(e.indexOf(t[1])===-1)return-1;let s=0;for(let n=0;n<e.length;n++)if(e[n]==="\\")n++;else if(e[n]===t[0])s++;else if(e[n]===t[1]&&(s--,s<0))return n;return s>0?-2:-1}function nf(e,t,s,n,a){const i=t.href,l=t.title||null,r=e[1].replace(a.other.outputLinkReplace,"$1");n.state.inLink=!0;const o={type:e[0].charAt(0)==="!"?"image":"link",raw:s,href:i,title:l,text:r,tokens:n.inlineTokens(r)};return n.state.inLink=!1,o}function hS(e,t,s){const n=e.match(s.other.indentCodeCompensation);if(n===null)return t;const a=n[1];return t.split(`
`).map(i=>{const l=i.match(s.other.beginningSpace);if(l===null)return i;const[r]=l;return r.length>=a.length?i.slice(a.length):i}).join(`
`)}var ar=class{constructor(e){at(this,"options");at(this,"rules");at(this,"lexer");this.options=e||fa}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const s=t[0].replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?s:ci(s,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const s=t[0],n=hS(s,t[3]||"",this.rules);return{type:"code",raw:s,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:n}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let s=t[2].trim();if(this.rules.other.endingHash.test(s)){const n=ci(s,"#");(this.options.pedantic||!n||this.rules.other.endingSpaceChar.test(n))&&(s=n.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:s,tokens:this.lexer.inline(s)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:ci(t[0],`
`)}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let s=ci(t[0],`
`).split(`
`),n="",a="";const i=[];for(;s.length>0;){let l=!1;const r=[];let o;for(o=0;o<s.length;o++)if(this.rules.other.blockquoteStart.test(s[o]))r.push(s[o]),l=!0;else if(!l)r.push(s[o]);else break;s=s.slice(o);const c=r.join(`
`),d=c.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");n=n?`${n}
${c}`:c,a=a?`${a}
${d}`:d;const u=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(d,i,!0),this.lexer.state.top=u,s.length===0)break;const p=i.at(-1);if((p==null?void 0:p.type)==="code")break;if((p==null?void 0:p.type)==="blockquote"){const h=p,v=h.raw+`
`+s.join(`
`),y=this.blockquote(v);i[i.length-1]=y,n=n.substring(0,n.length-h.raw.length)+y.raw,a=a.substring(0,a.length-h.text.length)+y.text;break}else if((p==null?void 0:p.type)==="list"){const h=p,v=h.raw+`
`+s.join(`
`),y=this.list(v);i[i.length-1]=y,n=n.substring(0,n.length-p.raw.length)+y.raw,a=a.substring(0,a.length-h.raw.length)+y.raw,s=v.substring(i.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:n,tokens:i,text:a}}}list(e){let t=this.rules.block.list.exec(e);if(t){let s=t[1].trim();const n=s.length>1,a={type:"list",raw:"",ordered:n,start:n?+s.slice(0,-1):"",loose:!1,items:[]};s=n?`\\d{1,9}\\${s.slice(-1)}`:`\\${s}`,this.options.pedantic&&(s=n?s:"[*+-]");const i=this.rules.other.listItemRegex(s);let l=!1;for(;e;){let o=!1,c="",d="";if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;c=t[0],e=e.substring(c.length);let u=t[2].split(`
`,1)[0].replace(this.rules.other.listReplaceTabs,I=>" ".repeat(3*I.length)),p=e.split(`
`,1)[0],h=!u.trim(),v=0;if(this.options.pedantic?(v=2,d=u.trimStart()):h?v=t[1].length+1:(v=t[2].search(this.rules.other.nonSpaceChar),v=v>4?1:v,d=u.slice(v),v+=t[1].length),h&&this.rules.other.blankLine.test(p)&&(c+=p+`
`,e=e.substring(p.length+1),o=!0),!o){const I=this.rules.other.nextBulletRegex(v),b=this.rules.other.hrRegex(v),g=this.rules.other.fencesBeginRegex(v),x=this.rules.other.headingBeginRegex(v),E=this.rules.other.htmlBeginRegex(v);for(;e;){const T=e.split(`
`,1)[0];let S;if(p=T,this.options.pedantic?(p=p.replace(this.rules.other.listReplaceNesting,"  "),S=p):S=p.replace(this.rules.other.tabCharGlobal,"    "),g.test(p)||x.test(p)||E.test(p)||I.test(p)||b.test(p))break;if(S.search(this.rules.other.nonSpaceChar)>=v||!p.trim())d+=`
`+S.slice(v);else{if(h||u.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||g.test(u)||x.test(u)||b.test(u))break;d+=`
`+p}!h&&!p.trim()&&(h=!0),c+=T+`
`,e=e.substring(T.length+1),u=S.slice(v)}}a.loose||(l?a.loose=!0:this.rules.other.doubleBlankLine.test(c)&&(l=!0));let y=null,R;this.options.gfm&&(y=this.rules.other.listIsTask.exec(d),y&&(R=y[0]!=="[ ] ",d=d.replace(this.rules.other.listReplaceTask,""))),a.items.push({type:"list_item",raw:c,task:!!y,checked:R,loose:!1,text:d,tokens:[]}),a.raw+=c}const r=a.items.at(-1);if(r)r.raw=r.raw.trimEnd(),r.text=r.text.trimEnd();else return;a.raw=a.raw.trimEnd();for(let o=0;o<a.items.length;o++)if(this.lexer.state.top=!1,a.items[o].tokens=this.lexer.blockTokens(a.items[o].text,[]),!a.loose){const c=a.items[o].tokens.filter(u=>u.type==="space"),d=c.length>0&&c.some(u=>this.rules.other.anyLine.test(u.raw));a.loose=d}if(a.loose)for(let o=0;o<a.items.length;o++)a.items[o].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const s=t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal," "),n=t[2]?t[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:s,raw:t[0],href:n,title:a}}}table(e){var l;const t=this.rules.block.table.exec(e);if(!t||!this.rules.other.tableDelimiter.test(t[2]))return;const s=sf(t[1]),n=t[2].replace(this.rules.other.tableAlignChars,"").split("|"),a=(l=t[3])!=null&&l.trim()?t[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(s.length===n.length){for(const r of n)this.rules.other.tableAlignRight.test(r)?i.align.push("right"):this.rules.other.tableAlignCenter.test(r)?i.align.push("center"):this.rules.other.tableAlignLeft.test(r)?i.align.push("left"):i.align.push(null);for(let r=0;r<s.length;r++)i.header.push({text:s[r],tokens:this.lexer.inline(s[r]),header:!0,align:i.align[r]});for(const r of a)i.rows.push(sf(r,i.header.length).map((o,c)=>({text:o,tokens:this.lexer.inline(o),header:!1,align:i.align[c]})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const s=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:s,tokens:this.lexer.inline(s)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:t[1]}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&this.rules.other.startATag.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const s=t[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(s)){if(!this.rules.other.endAngleBracket.test(s))return;const i=ci(s.slice(0,-1),"\\");if((s.length-i.length)%2===0)return}else{const i=pS(t[2],"()");if(i===-2)return;if(i>-1){const r=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,r).trim(),t[3]=""}}let n=t[2],a="";if(this.options.pedantic){const i=this.rules.other.pedanticHrefTitle.exec(n);i&&(n=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return n=n.trim(),this.rules.other.startAngleBracket.test(n)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(s)?n=n.slice(1):n=n.slice(1,-1)),nf(t,{href:n&&n.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer,this.rules)}}reflink(e,t){let s;if((s=this.rules.inline.reflink.exec(e))||(s=this.rules.inline.nolink.exec(e))){const n=(s[2]||s[1]).replace(this.rules.other.multipleSpaceGlobal," "),a=t[n.toLowerCase()];if(!a){const i=s[0].charAt(0);return{type:"text",raw:i,text:i}}return nf(s,a,s[0],this.lexer,this.rules)}}emStrong(e,t,s=""){let n=this.rules.inline.emStrongLDelim.exec(e);if(!n||n[3]&&s.match(this.rules.other.unicodeAlphaNumeric))return;if(!(n[1]||n[2]||"")||!s||this.rules.inline.punctuation.exec(s)){const i=[...n[0]].length-1;let l,r,o=i,c=0;const d=n[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,t=t.slice(-1*e.length+i);(n=d.exec(t))!=null;){if(l=n[1]||n[2]||n[3]||n[4]||n[5]||n[6],!l)continue;if(r=[...l].length,n[3]||n[4]){o+=r;continue}else if((n[5]||n[6])&&i%3&&!((i+r)%3)){c+=r;continue}if(o-=r,o>0)continue;r=Math.min(r,r+o+c);const u=[...n[0]][0].length,p=e.slice(0,i+n.index+u+r);if(Math.min(i,r)%2){const v=p.slice(1,-1);return{type:"em",raw:p,text:v,tokens:this.lexer.inlineTokens(v)}}const h=p.slice(2,-2);return{type:"strong",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let s=t[2].replace(this.rules.other.newLineCharGlobal," ");const n=this.rules.other.nonSpaceChar.test(s),a=this.rules.other.startingSpaceChar.test(s)&&this.rules.other.endingSpaceChar.test(s);return n&&a&&(s=s.substring(1,s.length-1)),{type:"codespan",raw:t[0],text:s}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let s,n;return t[2]==="@"?(s=t[1],n="mailto:"+s):(s=t[1],n=s),{type:"link",raw:t[0],text:s,href:n,tokens:[{type:"text",raw:s,text:s}]}}}url(e){var s;let t;if(t=this.rules.inline.url.exec(e)){let n,a;if(t[2]==="@")n=t[0],a="mailto:"+n;else{let i;do i=t[0],t[0]=((s=this.rules.inline._backpedal.exec(t[0]))==null?void 0:s[0])??"";while(i!==t[0]);n=t[0],t[1]==="www."?a="http://"+t[0]:a=t[0]}return{type:"link",raw:t[0],text:n,href:a,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){const s=this.lexer.state.inRawBlock;return{type:"text",raw:t[0],text:t[0],escaped:s}}}},on=class Go{constructor(t){at(this,"tokens");at(this,"options");at(this,"state");at(this,"tokenizer");at(this,"inlineQueue");this.tokens=[],this.tokens.links=Object.create(null),this.options=t||fa,this.options.tokenizer=this.options.tokenizer||new ar,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const s={other:Jt,block:kl.normal,inline:oi.normal};this.options.pedantic?(s.block=kl.pedantic,s.inline=oi.pedantic):this.options.gfm&&(s.block=kl.gfm,this.options.breaks?s.inline=oi.breaks:s.inline=oi.gfm),this.tokenizer.rules=s}static get rules(){return{block:kl,inline:oi}}static lex(t,s){return new Go(s).lex(t)}static lexInline(t,s){return new Go(s).inlineTokens(t)}lex(t){t=t.replace(Jt.carriageReturn,`
`),this.blockTokens(t,this.tokens);for(let s=0;s<this.inlineQueue.length;s++){const n=this.inlineQueue[s];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(t,s=[],n=!1){var a,i,l;for(this.options.pedantic&&(t=t.replace(Jt.tabCharGlobal,"    ").replace(Jt.spaceLine,""));t;){let r;if((i=(a=this.options.extensions)==null?void 0:a.block)!=null&&i.some(c=>(r=c.call({lexer:this},t,s))?(t=t.substring(r.raw.length),s.push(r),!0):!1))continue;if(r=this.tokenizer.space(t)){t=t.substring(r.raw.length);const c=s.at(-1);r.raw.length===1&&c!==void 0?c.raw+=`
`:s.push(r);continue}if(r=this.tokenizer.code(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(r=this.tokenizer.fences(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.heading(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.hr(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.blockquote(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.list(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.html(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.def(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="paragraph"||(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.raw,this.inlineQueue.at(-1).src=c.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title});continue}if(r=this.tokenizer.table(t)){t=t.substring(r.raw.length),s.push(r);continue}if(r=this.tokenizer.lheading(t)){t=t.substring(r.raw.length),s.push(r);continue}let o=t;if((l=this.options.extensions)!=null&&l.startBlock){let c=1/0;const d=t.slice(1);let u;this.options.extensions.startBlock.forEach(p=>{u=p.call({lexer:this},d),typeof u=="number"&&u>=0&&(c=Math.min(c,u))}),c<1/0&&c>=0&&(o=t.substring(0,c+1))}if(this.state.top&&(r=this.tokenizer.paragraph(o))){const c=s.at(-1);n&&(c==null?void 0:c.type)==="paragraph"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r),n=o.length!==t.length,t=t.substring(r.raw.length);continue}if(r=this.tokenizer.text(t)){t=t.substring(r.raw.length);const c=s.at(-1);(c==null?void 0:c.type)==="text"?(c.raw+=`
`+r.raw,c.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=c.text):s.push(r);continue}if(t){const c="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(c);break}else throw new Error(c)}}return this.state.top=!0,s}inline(t,s=[]){return this.inlineQueue.push({src:t,tokens:s}),s}inlineTokens(t,s=[]){var r,o,c;let n=t,a=null;if(this.tokens.links){const d=Object.keys(this.tokens.links);if(d.length>0)for(;(a=this.tokenizer.rules.inline.reflinkSearch.exec(n))!=null;)d.includes(a[0].slice(a[0].lastIndexOf("[")+1,-1))&&(n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(a=this.tokenizer.rules.inline.anyPunctuation.exec(n))!=null;)n=n.slice(0,a.index)+"++"+n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;(a=this.tokenizer.rules.inline.blockSkip.exec(n))!=null;)n=n.slice(0,a.index)+"["+"a".repeat(a[0].length-2)+"]"+n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);let i=!1,l="";for(;t;){i||(l=""),i=!1;let d;if((o=(r=this.options.extensions)==null?void 0:r.inline)!=null&&o.some(p=>(d=p.call({lexer:this},t,s))?(t=t.substring(d.raw.length),s.push(d),!0):!1))continue;if(d=this.tokenizer.escape(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.tag(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.link(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.reflink(t,this.tokens.links)){t=t.substring(d.raw.length);const p=s.at(-1);d.type==="text"&&(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(d=this.tokenizer.emStrong(t,n,l)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.codespan(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.br(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.del(t)){t=t.substring(d.raw.length),s.push(d);continue}if(d=this.tokenizer.autolink(t)){t=t.substring(d.raw.length),s.push(d);continue}if(!this.state.inLink&&(d=this.tokenizer.url(t))){t=t.substring(d.raw.length),s.push(d);continue}let u=t;if((c=this.options.extensions)!=null&&c.startInline){let p=1/0;const h=t.slice(1);let v;this.options.extensions.startInline.forEach(y=>{v=y.call({lexer:this},h),typeof v=="number"&&v>=0&&(p=Math.min(p,v))}),p<1/0&&p>=0&&(u=t.substring(0,p+1))}if(d=this.tokenizer.inlineText(u)){t=t.substring(d.raw.length),d.raw.slice(-1)!=="_"&&(l=d.raw.slice(-1)),i=!0;const p=s.at(-1);(p==null?void 0:p.type)==="text"?(p.raw+=d.raw,p.text+=d.text):s.push(d);continue}if(t){const p="Infinite loop on byte: "+t.charCodeAt(0);if(this.options.silent){console.error(p);break}else throw new Error(p)}}return s}},ir=class{constructor(e){at(this,"options");at(this,"parser");this.options=e||fa}space(e){return""}code({text:e,lang:t,escaped:s}){var i;const n=(i=(t||"").match(Jt.notSpaceStart))==null?void 0:i[0],a=e.replace(Jt.endingNewline,"")+`
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
`+this.renderer.text(c);s?n+=this.renderer.paragraph({type:"paragraph",raw:d,text:d,tokens:[{type:"text",raw:d,text:d,escaped:!0}]}):n+=d;continue}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}parseInline(t,s=this.renderer){var a,i;let n="";for(let l=0;l<t.length;l++){const r=t[l];if((i=(a=this.options.extensions)==null?void 0:a.renderers)!=null&&i[r.type]){const c=this.options.extensions.renderers[r.type].call({parser:this},r);if(c!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(r.type)){n+=c||"";continue}}const o=r;switch(o.type){case"escape":{n+=s.text(o);break}case"html":{n+=s.html(o);break}case"link":{n+=s.link(o);break}case"image":{n+=s.image(o);break}case"strong":{n+=s.strong(o);break}case"em":{n+=s.em(o);break}case"codespan":{n+=s.codespan(o);break}case"br":{n+=s.br(o);break}case"del":{n+=s.del(o);break}case"text":{n+=s.text(o);break}default:{const c='Token with "'+o.type+'" type was not found.';if(this.options.silent)return console.error(c),"";throw new Error(c)}}}return n}},fo,Rl=(fo=class{constructor(e){at(this,"options");at(this,"block");this.options=e||fa}preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}provideLexer(){return this.block?on.lex:on.lexInline}provideParser(){return this.block?cn.parse:cn.parseInline}},at(fo,"passThroughHooks",new Set(["preprocess","postprocess","processAllTokens"])),fo),mS=class{constructor(...e){at(this,"defaults",Zc());at(this,"options",this.setOptions);at(this,"parse",this.parseMarkdown(!0));at(this,"parseInline",this.parseMarkdown(!1));at(this,"Parser",cn);at(this,"Renderer",ir);at(this,"TextRenderer",nd);at(this,"Lexer",on);at(this,"Tokenizer",ar);at(this,"Hooks",Rl);this.use(...e)}walkTokens(e,t){var n,a;let s=[];for(const i of e)switch(s=s.concat(t.call(this,i)),i.type){case"table":{const l=i;for(const r of l.header)s=s.concat(this.walkTokens(r.tokens,t));for(const r of l.rows)for(const o of r)s=s.concat(this.walkTokens(o.tokens,t));break}case"list":{const l=i;s=s.concat(this.walkTokens(l.items,t));break}default:{const l=i;(a=(n=this.defaults.extensions)==null?void 0:n.childTokens)!=null&&a[l.type]?this.defaults.extensions.childTokens[l.type].forEach(r=>{const o=l[r].flat(1/0);s=s.concat(this.walkTokens(o,t))}):l.tokens&&(s=s.concat(this.walkTokens(l.tokens,t)))}}return s}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(s=>{const n={...s};if(n.async=this.defaults.async||n.async||!1,s.extensions&&(s.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...l){let r=a.renderer.apply(this,l);return r===!1&&(r=i.apply(this,l)),r}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),n.extensions=t),s.renderer){const a=this.defaults.renderer||new ir(this.defaults);for(const i in s.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(["options","parser"].includes(i))continue;const l=i,r=s.renderer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d||""}}n.renderer=a}if(s.tokenizer){const a=this.defaults.tokenizer||new ar(this.defaults);for(const i in s.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const l=i,r=s.tokenizer[l],o=a[l];a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.tokenizer=a}if(s.hooks){const a=this.defaults.hooks||new Rl;for(const i in s.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(["options","block"].includes(i))continue;const l=i,r=s.hooks[l],o=a[l];Rl.passThroughHooks.has(i)?a[l]=c=>{if(this.defaults.async)return Promise.resolve(r.call(a,c)).then(u=>o.call(a,u));const d=r.call(a,c);return o.call(a,d)}:a[l]=(...c)=>{let d=r.apply(a,c);return d===!1&&(d=o.apply(a,c)),d}}n.hooks=a}if(s.walkTokens){const a=this.defaults.walkTokens,i=s.walkTokens;n.walkTokens=function(l){let r=[];return r.push(i.call(this,l)),a&&(r=r.concat(a.call(this,l))),r}}this.defaults={...this.defaults,...n}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return on.lex(e,t??this.defaults)}parser(e,t){return cn.parse(e,t??this.defaults)}parseMarkdown(e){return(s,n)=>{const a={...n},i={...this.defaults,...a},l=this.onError(!!i.silent,!!i.async);if(this.defaults.async===!0&&a.async===!1)return l(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof s>"u"||s===null)return l(new Error("marked(): input parameter is undefined or null"));if(typeof s!="string")return l(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(s)+", string expected"));i.hooks&&(i.hooks.options=i,i.hooks.block=e);const r=i.hooks?i.hooks.provideLexer():e?on.lex:on.lexInline,o=i.hooks?i.hooks.provideParser():e?cn.parse:cn.parseInline;if(i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(s):s).then(c=>r(c,i)).then(c=>i.hooks?i.hooks.processAllTokens(c):c).then(c=>i.walkTokens?Promise.all(this.walkTokens(c,i.walkTokens)).then(()=>c):c).then(c=>o(c,i)).then(c=>i.hooks?i.hooks.postprocess(c):c).catch(l);try{i.hooks&&(s=i.hooks.preprocess(s));let c=r(s,i);i.hooks&&(c=i.hooks.processAllTokens(c)),i.walkTokens&&this.walkTokens(c,i.walkTokens);let d=o(c,i);return i.hooks&&(d=i.hooks.postprocess(d)),d}catch(c){return l(c)}}}onError(e,t){return s=>{if(s.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const n="<p>An error occurred:</p><pre>"+Vs(s.message+"",!0)+"</pre>";return t?Promise.resolve(n):n}if(t)return Promise.reject(s);throw s}}},la=new mS;function Qe(e,t){return la.parse(e,t)}Qe.options=Qe.setOptions=function(e){return la.setOptions(e),Qe.defaults=la.defaults,Am(Qe.defaults),Qe};Qe.getDefaults=Zc;Qe.defaults=fa;Qe.use=function(...e){return la.use(...e),Qe.defaults=la.defaults,Am(Qe.defaults),Qe};Qe.walkTokens=function(e,t){return la.walkTokens(e,t)};Qe.parseInline=la.parseInline;Qe.Parser=cn;Qe.parser=cn.parse;Qe.Renderer=ir;Qe.TextRenderer=nd;Qe.Lexer=on;Qe.lexer=on.lex;Qe.Tokenizer=ar;Qe.Hooks=Rl;Qe.parse=Qe;Qe.options;Qe.setOptions;Qe.use;Qe.walkTokens;Qe.parseInline;cn.parse;on.lex;const gS={breaks:!0,gfm:!0};function af(e){if(!e)return"";try{if(typeof Qe<"u"&&Qe.parse){const t=Qe.parse(e,gS);return typeof Qu<"u"?Qu.sanitize(t):t}}catch{}return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}function vS(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}const bS={run_command:"terminal",ssh_command:"terminal",run_script:"terminal",read_file:"file",write_file:"edit",list_directory:"folder",search_knowledge:"search",ingest_document:"book",generate_image:"image",analyze_image:"eye",analyze_pdf:"file",browser_screenshot:"globe",manage_process:"sliders"};function yS(e){return bS[e]||"wrench"}const xS=/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?/gi;function lf(e){if(!e)return[];const t=e.match(xS);return t?[...new Set(t)]:[]}const _S={template:`
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
    </div>`,setup(){const e=m([]),t=m(""),s=m(!1),n=m(null),a=m(null),i=m(0),l=m("");let r=null,o=0;const c=["Check system health","List running services","Show disk usage","What can you do?"],d=Y(()=>t.value.trim().length>0&&!s.value),u=m(ze.state||"disconnected");let p=null,h=null;const v=Y(()=>{const U=u.value;return U==="connected"?"Connected":U==="reconnecting"?"Reconnecting…":U==="connecting"?"Connecting…":"REST fallback"}),y=["Watching across all realms...","Processing...","Consulting the bifrost...","Observing..."],R=Y(()=>{const U=Math.floor(i.value/4)%y.length,O=i.value;return O>3?`${y[U]} (${O}s)`:y[0]});function I(){Ct(()=>{n.value&&(n.value.scrollTop=n.value.scrollHeight)})}function b(){if(!a.value)return;const U=a.value;U.style.height="auto",U.style.height=Math.min(U.scrollHeight,120)+"px"}function g(U,O,N={}){const j={id:++o,role:U,content:O,timestamp:Date.now(),html:U==="bot"?af(O):"",tools_used:N.tools_used||[],is_error:N.is_error||!1,images:U==="bot"?lf(O):[],files:N.files||[],_showTools:!1};return e.value.push(j),I(),U==="bot"&&Ct(()=>x()),j}function x(){if(!n.value)return;n.value.querySelectorAll(".chat-markdown pre:not([data-copy])").forEach(O=>{O.setAttribute("data-copy","true"),O.style.position="relative";const N=document.createElement("button");N.className="chat-code-copy",N.textContent="Copy",N.addEventListener("click",()=>{const j=O.querySelector("code"),G=j?j.textContent:O.textContent;navigator.clipboard.writeText(G).then(()=>{N.textContent="Copied!",setTimeout(()=>{N.textContent="Copy"},1500)}).catch(()=>{})}),O.appendChild(N)})}function E(U){if(U===0)return!0;const O=e.value[U-1],N=e.value[U],j=new Date(O.timestamp).toDateString(),G=new Date(N.timestamp).toDateString();return j!==G}function T(U){const O=new Date(U),N=new Date;if(O.toDateString()===N.toDateString())return"Today";const j=new Date(N);return j.setDate(j.getDate()-1),O.toDateString()===j.toDateString()?"Yesterday":O.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})}function S(U){t.value=U,Ct(()=>Z())}function w(U){window.open(U,"_blank","noopener")}function A(U){U.target.style.display="none"}function L(){i.value=0,r=setInterval(()=>{i.value++},1e3)}function B(){r&&(clearInterval(r),r=null),i.value=0}function F(U){s.value&&(s.value=!1,B(),U.type==="chat_response"?g("bot",U.content,{tools_used:U.tools_used||[],is_error:U.is_error||!1,files:U.files||[]}):U.type==="chat_error"&&g("bot",U.error||"Unknown error",{is_error:!0}),Ct(()=>{var O;return(O=a.value)==null?void 0:O.focus()}))}async function M(U){try{const O=await W.post("/api/chat",{content:U,channel_id:l.value});g("bot",O.response,{tools_used:O.tools_used||[],is_error:O.is_error||!1,files:O.files||[]})}catch(O){g("bot",O.message||"Failed to send message",{is_error:!0})}}async function Z(){const U=t.value.trim();if(!U||s.value)return;g("user",U),t.value="",s.value=!0,L(),a.value&&(a.value.style.height="auto"),ze.connected&&ze.sendChat(U,{channelId:l.value})||(await M(U),s.value=!1,B()),Ct(()=>{var N;return(N=a.value)==null?void 0:N.focus()})}async function ne(){try{if(!l.value){const O=await W.get("/api/auth/session");l.value=O.channel_id||O.user_id||"web-user"}const U=await W.get("/api/sessions/"+encodeURIComponent(l.value));if(U&&U.messages&&U.messages.length>0){for(const O of U.messages){const N=O.role==="user"?"user":"bot";let j=O.content||"";if(N==="user"){const J=j.match(/^\[.*?\]:\s*/);J&&(j=j.slice(J[0].length))}if(!j.trim())continue;const G={id:++o,role:N,content:j,timestamp:O.timestamp?O.timestamp*1e3:Date.now(),html:N==="bot"?af(j):"",tools_used:[],is_error:!1,images:N==="bot"?lf(j):[],files:[],_showTools:!1};e.value.push(G)}Ct(()=>{I(),x()})}}catch{}}return Ke(()=>{ze.subscribe("chat",F),u.value=ze.state||"disconnected",p=ze.onStateChange,h=(U,O)=>{u.value=U,p&&p(U,O)},ze.onStateChange=h,ne(),Ct(()=>{var U;return(U=a.value)==null?void 0:U.focus()})}),bt(()=>{ze.unsubscribe("chat",F),ze.onStateChange===h&&(ze.onStateChange=p),B()}),{messages:e,input:t,sending:s,messagesEl:n,inputEl:a,canSend:d,wsStatus:v,typingText:R,suggestions:c,send:Z,autoResize:b,formatTime:vS,formatDate:T,showDateSeparator:E,useSuggestion:S,openImage:w,onImageError:A,getToolIcon:yS}}},kS={setup(){const e=m("odin"),t=m(""),s=m(""),n=m(""),a=m({}),i=m([]),l=m([]),r=m(!1),o=m(!1),c=m(null),d=m(!0),u=m(""),p=m(!1),h=m(!1),v=Y(()=>e.value==="custom"),y=Y(()=>[...i.value,...l.value]),R=Y(()=>l.value.includes(e.value)),I=Y(()=>{var w;return v.value?t.value||"Odin":((w=a.value[e.value])==null?void 0:w.name)||e.value}),b=Y(()=>{var w;return v.value?s.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.identity)||""}),g=Y(()=>{var w;return v.value?n.value||"(empty — will use Odin default)":((w=a.value[e.value])==null?void 0:w.voice)||""});async function x(){d.value=!0;try{const w=await W.get("/api/personality");e.value=w.preset||"odin",t.value=w.custom_name||"",s.value=w.custom_identity||"",n.value=w.custom_voice||"",a.value=w.presets||{},i.value=w.builtin_presets||[],l.value=w.user_presets||[]}catch(w){c.value=w.message}finally{d.value=!1}}async function E(){r.value=!0,c.value=null,o.value=!1;try{await W.put("/api/personality",{preset:e.value,custom_name:t.value,custom_identity:s.value,custom_voice:n.value}),o.value=!0,setTimeout(()=>o.value=!1,3e3)}catch(w){c.value=w.message}finally{r.value=!1}}async function T(){const w=u.value.trim();if(w){h.value=!0,c.value=null;try{await W.post("/api/personality/presets",{name:w,display_name:I.value,identity:b.value,voice:g.value}),p.value=!1,u.value="",await x(),e.value=w.toLowerCase().replace(/ /g,"_")}catch(A){c.value=A.message}finally{h.value=!1}}}async function S(){if(await hs({title:"Delete preset",message:`Delete preset "${e.value}"? This cannot be undone.`,confirmLabel:"Delete",danger:!0})){c.value=null;try{await W.del(`/api/personality/presets/${encodeURIComponent(e.value)}`),await x(),e.value="odin"}catch(A){c.value=A.message}}}return Ke(x),{preset:e,customName:t,customIdentity:s,customVoice:n,presets:a,presetNames:y,isCustom:v,isUserPreset:R,previewName:I,previewIdentity:b,previewVoice:g,saving:r,saved:o,error:c,loading:d,save:E,showSavePreset:p,newPresetName:u,savingPreset:h,saveAsPreset:T,deletePreset:S,builtinPresets:i,userPresets:l}},template:`
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
  `},yt=(e,t)=>s=>({path:e,query:{...s.query,tab:t}}),Um=[{path:"/",redirect:"/dashboard"},{path:"/dashboard",component:nw,meta:{label:"Dashboard",icon:"dashboard",section:"Workspace",description:"System posture and recent activity"}},{path:"/chat",component:_S,meta:{label:"Chat",icon:"chat",section:"Workspace",description:"Direct operator conversation"}},{path:"/operations",component:ak,meta:{label:"Operations",icon:"operations",section:"Operate",description:"Execution, agents, loops, processes, and schedules"}},{path:"/history",component:uk,meta:{label:"History",icon:"history",section:"Observe",description:"Audit trail, sessions, traces, and usage"}},{path:"/capabilities",component:xk,meta:{label:"Capabilities",icon:"capabilities",section:"Manage",description:"Tools, skills, knowledge, and memory"}},{path:"/personality",component:kS,meta:{label:"Personality",icon:"personality",section:"Manage",description:"Behavior and response profile"}},{path:"/system",component:Jk,meta:{label:"System",icon:"system",section:"Manage",description:"Health, configuration, access, and updates"}},{path:"/execution",redirect:yt("/operations","live")},{path:"/agents",redirect:yt("/operations","agents")},{path:"/loops",redirect:yt("/operations","loops")},{path:"/processes",redirect:yt("/operations","processes")},{path:"/schedules",redirect:yt("/operations","schedules")},{path:"/audit",redirect:yt("/history","audit")},{path:"/sessions",redirect:yt("/history","sessions")},{path:"/traces",redirect:yt("/history","traces")},{path:"/usage",redirect:yt("/history","usage")},{path:"/tools",redirect:yt("/capabilities","tools")},{path:"/skills",redirect:yt("/capabilities","skills")},{path:"/knowledge",redirect:yt("/capabilities","knowledge")},{path:"/memory",redirect:yt("/capabilities","memory")},{path:"/learned",redirect:yt("/capabilities","learned")},{path:"/health",redirect:yt("/system","health")},{path:"/resources",redirect:yt("/system","resources")},{path:"/logs",redirect:yt("/system","logs")},{path:"/config",redirect:yt("/system","config")},{path:"/host-access",redirect:yt("/system","host-access")},{path:"/internals",redirect:yt("/system","internals")}],Ti=z_({history:k_(),routes:Um});Ti.afterEach(e=>{var s;const t=(s=e.meta)==null?void 0:s.label;document.title=t?`Odin — ${t}`:"Odin — Management"});const wS={template:`
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
    </div>`,props:["onLogin","sessionExpired"],setup(e){const t=m(""),s=m(null),n=m(!1),a=m(!1);async function i(){n.value=!0,s.value=null;try{W.setPersist(a.value),await W.login(t.value),e.onLogin()}catch(l){s.value=l.message||"Login failed"}finally{n.value=!1}}return{token:t,error:s,busy:n,persist:a,login:i}}},SS={template:`
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
    <command-palette />`,setup(){const e=m("checking"),t=m(!1),s=m(!1),n=m(!1),a=m(null),i=m(null),l=m(!1);let r=null,o=null;const c=m(!1),d=m("disconnected"),u=m(-1),p=m(null);let h=null;const v=m("starting"),y=m(""),R=Um.filter(O=>O.meta),I=Y(()=>["Workspace","Operate","Observe","Manage"].map(O=>({name:O,routes:R.filter(N=>N.meta.section===O)})).filter(O=>O.routes.length)),b=Y(()=>{var O;return((O=Ti.currentRoute.value.meta)==null?void 0:O.label)||"Odin"}),g=Y(()=>{var O;return((O=Ti.currentRoute.value.meta)==null?void 0:O.section)||"Management"}),x=Y(()=>{var O;return((O=Ti.currentRoute.value.meta)==null?void 0:O.description)||"Management console"});W.onSessionExpired=()=>{t.value=!0,ze.disconnect(),W.setToken(""),e.value="login"};function E(O){var N;if((O.ctrlKey||O.metaKey)&&O.key.toLowerCase()==="k"){e.value==="ready"&&(O.preventDefault(),Fu());return}if(n.value&&O.key==="Tab"){const j=[...((N=a.value)==null?void 0:N.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]];if(j.length){const G=j[0],J=j[j.length-1];if(O.shiftKey&&(document.activeElement===G||!a.value.contains(document.activeElement))){O.preventDefault(),J.focus();return}if(!O.shiftKey&&(document.activeElement===J||!a.value.contains(document.activeElement))){O.preventDefault(),G.focus();return}}}if(O.key==="Escape"&&n.value){n.value=!1,O.preventDefault();return}if(O.key==="/"&&!["INPUT","TEXTAREA","SELECT"].includes(O.target.tagName)){O.preventDefault();const j=document.querySelector('.hm-main input[type="text"], .hm-main .hm-input:not(textarea):not(select)');j&&j.focus()}}function T(){l.value=!!(r!=null&&r.matches),l.value||(n.value=!1)}Ke(async()=>{document.addEventListener("keydown",E),r=window.matchMedia("(max-width: 900px)"),T(),r.addEventListener("change",T);const O=await W.check();O.ok?(e.value="ready",ne()):O.needsAuth?e.value="login":(e.value="ready",ne())});function S(){t.value=!1,e.value="ready",ne()}async function w(){await W.logout(),ze.disconnect(),e.value="login"}function A(){s.value=!s.value}function L(){n.value=!n.value}Yt(n,async O=>{var N,j;if(O)o=document.activeElement,await Ct(),(j=(N=a.value)==null?void 0:N.querySelector(".nav-item"))==null||j.focus();else if(o!=null&&o.isConnected){const G=o;o=null,requestAnimationFrame(()=>G.focus())}});const B=Y(()=>{switch(d.value){case"connected":return"Live";case"connecting":return"Connecting…";case"reconnecting":return"Reconnecting…";default:return"Disconnected"}});function F(O,N="info",j=3e3){p.value={text:O,level:N},clearTimeout(h),h=setTimeout(()=>{p.value=null},j)}let M=null,Z=!1;function ne(){ze.onStatusChange=O=>{c.value=O},ze.onLatency=O=>{u.value=O},ze.onStateChange=(O,N)=>{d.value=O,O==="connected"?(Z&&F("Connection restored","success"),Z=!0):O==="reconnecting"&&N.attempt===1&&F("Connection lost — reconnecting…","warn")},ze.connect(),U(),M&&clearInterval(M),M=setInterval(U,15e3)}async function U(){try{const O=await W.get("/api/status");v.value=O.status==="online"?"online":"starting";const N=O.uptime_seconds||0,j=Math.floor(N/3600),G=Math.floor(N%3600/60);y.value=`${j}h ${G}m uptime`}catch{v.value="offline",y.value=""}}return bt(()=>{M&&clearInterval(M),ze.disconnect(),document.removeEventListener("keydown",E),r==null||r.removeEventListener("change",T)}),{authState:e,sessionExpired:t,sidebarCollapsed:s,mobileOpen:n,wsConnected:c,wsState:d,wsLatency:u,wsLabel:B,wsToast:p,botStatus:v,botUptime:y,navRoutes:R,navGroups:I,currentPage:b,currentSection:g,currentDescription:x,sidebarEl:a,mobileMenuButton:i,isMobileViewport:l,onLogin:S,logout:w,toggleSidebar:A,toggleMobileNavigation:L,openPalette:Fu}}},Un=Kl(SS);Un.component("odin-icon",ew);Un.component("login-screen",wS);Un.component("toast-container",P0);Un.component("confirm-host",F0);Un.component("command-palette",Xk);Un.directive("modal-focus",sw);Un.use(Ti);Un.mount("#app");
